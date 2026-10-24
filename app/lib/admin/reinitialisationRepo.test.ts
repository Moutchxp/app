import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * 🔴 Arno (24/10/2026, migration 416) — « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION, sur une base SIMULÉE avec état (comptes,
 * liens, demandes) et un transport de mail SIMULÉ (aucun mail réel). Les vraies règles (`reinitialisation.ts`) et le vrai dépôt.
 */
interface Lien { id: number; utilisateur_id: number; jeton_empreinte: string; expire_le: Date; utilise_le: Date | null; remplacee_le: Date | null; mail_etat: string; mail_erreur: string | null }
let comptes: Map<number, { id: number; identifiant: string; prenom: string; actif: boolean; mot_de_passe: string }>;
let liens: Lien[];
let demandes: { cle: string; ts: Date }[];
let revoques: number[];
let horloge: Date;
let tables: boolean;

const query = vi.fn(async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('information_schema.tables')) return { rows: [{ n: tables ? 2 : 0 }] };
  if (s.startsWith('SELECT count(*)::int AS n, max(ts) AS dernier FROM admin_reinitialisation_demande')) {
    const l = demandes.filter((d) => d.cle === p[0] && d.ts.getTime() > Date.now() - Number(p[1]) * 1000);
    return { rows: [{ n: l.length, dernier: l.length ? new Date(Math.max(...l.map((d) => d.ts.getTime()))) : null }] };
  }
  if (s.startsWith('INSERT INTO admin_reinitialisation_demande')) { demandes.push({ cle: String(p[0]), ts: new Date() }); return { rows: [] }; }
  if (s.startsWith('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE')) return { rows: [{ id: p[0] }] };
  if (s.startsWith('UPDATE admin_reinitialisation SET remplacee_le = now()')) {
    for (const l of liens) if (l.utilisateur_id === Number(p[0]) && !l.utilise_le && !l.remplacee_le) l.remplacee_le = horloge;
    return { rows: [] };
  }
  if (s.startsWith('INSERT INTO admin_reinitialisation (')) {
    const l: Lien = { id: liens.length + 1, utilisateur_id: Number(p[0]), jeton_empreinte: String(p[1]),
      expire_le: new Date(new Date(String(p[2])).getTime() + Number(p[3]) * 60_000), utilise_le: null, remplacee_le: null, mail_etat: 'en_cours', mail_erreur: null };
    liens.push(l); return { rows: [{ id: l.id }] };
  }
  if (s.startsWith('UPDATE admin_reinitialisation SET mail_etat')) {
    const l = liens.find((x) => x.id === Number(p[0]))!; l.mail_etat = String(p[1]); l.mail_erreur = p[2] as string | null; return { rows: [] };
  }
  if (s.includes('FROM admin_reinitialisation r JOIN admin_utilisateur u')) {
    const l = liens.find((x) => x.jeton_empreinte === p[0]); if (!l) return { rows: [] };
    const c = comptes.get(l.utilisateur_id)!;
    return { rows: [{ ...l, actif: c.actif, identifiant: c.identifiant }] };
  }
  if (s.startsWith('UPDATE admin_reinitialisation SET utilise_le = now()')) { liens.find((x) => x.id === Number(p[0]))!.utilise_le = horloge; return { rows: [] }; }
  throw new Error('requête non simulée : ' + s.slice(0, 90));
});
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => query(s, p), withTransaction: (f: (q: unknown) => unknown) => f((s: string, p?: unknown[]) => query(s, p)) }));
vi.mock('./motDePasse', () => ({ hacher: async (c: string) => `HASH:${c}` }));
vi.mock('./comptes', () => ({
  trouverCompte: async (identifiant: string) => [...comptes.values()].find((c) => c.identifiant.toLowerCase() === identifiant.toLowerCase()) ?? null,
  changerMotDePasseSelf: async (id: number, h: string) => { comptes.get(id)!.mot_de_passe = h; return { id }; },
}));
vi.mock('./etatSession', () => ({ revoquerSessions: async (id: number) => { revoques.push(id); return true; } }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

const { demanderReinitialisation, lireLienReinitialisation, reinitialiserParLien, cleDemande } = await import('./reinitialisationRepo');
const { MESSAGE_LIEN_INVALIDE } = await import('./reinitialisation');

const envoyes: { de: string; deNom?: string; a: readonly string[]; corps: string; objet: string; messageId?: string }[] = [];
const transport = { envoyer: async (m: (typeof envoyes)[number]) => { envoyes.push(m); return { ok: true as const, id: 'gmail-1', factice: false }; } };
const ENV = { GESTION_URL_APPLICATION: 'https://authentification.sansvisavis.com', NODE_ENV: 'production' };
const jetonDu = (corps: string) => decodeURIComponent(/\?j=([^\s]+)/.exec(corps)![1]);
const sha = (x: string) => createHash('sha256').update(x, 'utf8').digest('hex');
const demander = async (adresse: unknown) => {
  const r = await demanderReinitialisation(adresse, { transport: transport as never, env: ENV, maintenant: horloge });
  if (r.envoi) await r.envoi;
  return r;
};
let journaux: string[];

beforeEach(() => {
  horloge = new Date();
  tables = true;
  comptes = new Map([[9, { id: 9, identifiant: 'lea@criterimmo.fr', prenom: 'Léa', actif: true, mot_de_passe: 'HASH:ancien' }],
    [4, { id: 4, identifiant: 'ancien@criterimmo.fr', prenom: 'Paul', actif: false, mot_de_passe: 'HASH:x' }]]);
  liens = []; demandes = []; revoques = []; envoyes.length = 0; journaux = [];
  for (const m of ['info', 'warn', 'error', 'log'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { journaux.push(a.map(String).join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('🔴 la demande', () => {
  it('compte connu et actif : UN mail, depuis l’expéditeur des invitations, avec un lien d’une heure vers la production', async () => {
    await demander('  Lea@Criterimmo.fr ');
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({ de: 'gestion@criterimmo.fr', deNom: 'Sans Vis-à-Vis — Gestion', a: ['lea@criterimmo.fr'] });
    expect(envoyes[0].corps).toMatch(/https:\/\/authentification\.sansvisavis\.com\/admin\/reinitialiser\?j=/);
    expect(envoyes[0].messageId).toMatch(/^<admin-reinitialisation\./);
    expect(liens).toHaveLength(1);
    expect(liens[0].expire_le.getTime() - horloge.getTime()).toBe(60 * 60_000);       // une heure
    expect(liens[0].mail_etat).toBe('envoye');
  });
  it('le jeton n’est JAMAIS en base en clair : seulement son empreinte SHA-256', async () => {
    await demander('lea@criterimmo.fr');
    const jeton = jetonDu(envoyes[0].corps);
    expect(liens[0].jeton_empreinte).toBe(sha(jeton));
    expect(liens[0].jeton_empreinte).not.toContain(jeton);
    expect(jeton.length).toBeGreaterThanOrEqual(43);                                   // 256 bits en base64url
  });
  it('compte inconnu, compte DÉSACTIVÉ, adresse vide : aucun lien, aucun mail (la route répond pareil)', async () => {
    for (const a of ['personne@criterimmo.fr', 'ancien@criterimmo.fr', '', '   ', null, 42]) {
      expect((await demander(a)).envoi).toBeNull();
    }
    expect(envoyes).toHaveLength(0);
    expect(liens).toHaveLength(0);
  });
  it('une nouvelle demande REMPLACE le lien précédent : l’ancien n’agit plus, le nouveau oui', async () => {
    await demander('lea@criterimmo.fr');
    const ancien = jetonDu(envoyes[0].corps);
    await demander('lea@criterimmo.fr');
    const nouveau = jetonDu(envoyes[1].corps);
    expect(await lireLienReinitialisation(ancien, horloge)).toEqual({ ok: false });
    expect(await lireLienReinitialisation(nouveau, horloge)).toEqual({ ok: true, identifiant: 'lea@criterimmo.fr' });
  });
  it('anti-rafale : comptée AVANT de chercher le compte, par adresse (empreinte, jamais en clair) ; au-delà de 3 dans l’heure, rien ne part', async () => {
    for (let i = 0; i < 6; i += 1) await demander('lea@criterimmo.fr');
    expect(envoyes).toHaveLength(3);
    expect(demandes).toHaveLength(6);
    expect(demandes[0].cle).toBe(cleDemande('lea@criterimmo.fr'));
    expect(demandes[0].cle).not.toContain('lea');
    // une adresse inconnue est comptée aussi (aucun oracle) ; une autre adresse a son propre compteur
    await demander('personne@criterimmo.fr');
    expect(demandes.at(-1)!.cle).toBe(cleDemande('personne@criterimmo.fr'));
  });
  it('sans la migration 416 : rien n’est écrit ni envoyé', async () => {
    tables = false;
    vi.resetModules();
    const { demanderReinitialisation: d } = await import('./reinitialisationRepo');
    expect((await d('lea@criterimmo.fr', { transport: transport as never, env: ENV })).envoi).toBeNull();
    expect(envoyes).toHaveLength(0);
  });
});

describe('🔴 le lien et le nouveau mot de passe', () => {
  const jeton = async () => { await demander('lea@criterimmo.fr'); return jetonDu(envoyes.at(-1)!.corps); };
  it('pose le mot de passe (haché), consomme le lien (USAGE UNIQUE), ferme toutes les autres sessions', async () => {
    const j = await jeton();
    const r = await reinitialiserParLien(j, 'un-nouveau-mot-de-passe', 'un-nouveau-mot-de-passe', horloge);
    expect(r).toEqual({ ok: true, compteId: 9, identifiant: 'lea@criterimmo.fr' });
    expect(comptes.get(9)!.mot_de_passe).toBe('HASH:un-nouveau-mot-de-passe');
    expect(revoques).toEqual([9]);
    // usage unique
    expect(await reinitialiserParLien(j, 'encore-un-autre-mdp', 'encore-un-autre-mdp', horloge)).toEqual({ ok: false, statut: 409, message: MESSAGE_LIEN_INVALIDE });
    expect(comptes.get(9)!.mot_de_passe).toBe('HASH:un-nouveau-mot-de-passe');
  });
  it('EXPIRÉ après une heure ; REMPLACÉ ; inconnu ; compte désactivé entre-temps : « Ce lien n’est plus valide », rien ne change', async () => {
    const j = await jeton();
    const plusTard = new Date(horloge.getTime() + 60 * 60_000 + 1);
    expect(await lireLienReinitialisation(j, plusTard)).toEqual({ ok: false });
    expect(await reinitialiserParLien(j, 'un-nouveau-mot-de-passe', 'un-nouveau-mot-de-passe', plusTard)).toMatchObject({ ok: false, message: 'Ce lien n’est plus valide.' });
    expect(await reinitialiserParLien('pas-un-jeton', 'un-nouveau-mot-de-passe', 'un-nouveau-mot-de-passe', horloge)).toMatchObject({ ok: false, statut: 409 });
    const j2 = await jeton();
    comptes.get(9)!.actif = false;
    expect(await reinitialiserParLien(j2, 'un-nouveau-mot-de-passe', 'un-nouveau-mot-de-passe', horloge)).toMatchObject({ ok: false, statut: 409 });
    expect(comptes.get(9)!.mot_de_passe).toBe('HASH:ancien');
    expect(revoques).toEqual([]);
  });
  it('la politique : 12 caractères au moins (comme « Changer mon mot de passe »), confirmation identique — le lien n’est pas consommé', async () => {
    const j = await jeton();
    expect(await reinitialiserParLien(j, 'court', 'court', horloge)).toEqual({ ok: false, statut: 400, message: 'Le mot de passe doit contenir au moins 12 caractères.' });
    expect(await reinitialiserParLien(j, 'un-nouveau-mot-de-passe', 'un-autre-mot-de-passe', horloge)).toEqual({ ok: false, statut: 400, message: 'La confirmation ne correspond pas.' });
    expect(liens[0].utilise_le).toBeNull();
    expect((await reinitialiserParLien(j, 'douze-caract', 'douze-caract', horloge)).ok).toBe(true);
  });
});

describe('🔴 aucun secret journalisé', () => {
  it('ni jeton, ni empreinte, ni adresse, ni mot de passe dans les journaux', async () => {
    await demander('lea@criterimmo.fr');
    await demander('personne@criterimmo.fr');
    const j = jetonDu(envoyes[0].corps);
    await reinitialiserParLien(j, 'un-nouveau-mot-de-passe', 'un-nouveau-mot-de-passe', horloge);
    const tout = journaux.join('\n');
    expect(journaux.length).toBeGreaterThan(0);
    for (const secret of [j, sha(j), 'lea@criterimmo.fr', 'personne@criterimmo.fr', 'un-nouveau-mot-de-passe', cleDemande('lea@criterimmo.fr')]) {
      expect(tout).not.toContain(secret);
    }
  });
});
