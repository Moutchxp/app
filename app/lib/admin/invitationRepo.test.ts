import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT GESTION-INVITATION-ADMIN — le dépôt des invitations sur une base SIMULÉE avec état (comptes, invitations, journal),
 * transport de mail SIMULÉ (aucun mail réel). Les vraies règles (`invitation.ts`) et le vrai dépôt sont exercés.
 */
interface Inv { id: number; utilisateur_id: number; jeton_empreinte: string; cree_le: Date; expire_le: Date; utilise_le: Date | null;
  remplacee_le: Date | null; mail_etat: string; mail_erreur: string | null }
let comptes: Map<number, { identifiant: string; prenom: string; nom: string; actif: boolean; derniere_connexion_a: Date | null; mot_de_passe: string; doit_changer: boolean }>;
let invitations: Inv[];
let journal: { action: string; cible: number }[];
let horloge: Date;

const query = vi.fn(async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.includes('information_schema.tables')) return { rows: [{ n: 1 }] };
  if (s.startsWith('SELECT identifiant, prenom, actif, derniere_connexion_a FROM admin_utilisateur')) {
    const c = comptes.get(Number(p[0])); return { rows: c ? [c] : [] };
  }
  if (s.startsWith('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE')) return { rows: [{ id: p[0] }] };
  if (s.startsWith('SELECT max(cree_le) AS cree_le, bool_or')) {
    const l = invitations.filter((i) => i.utilisateur_id === Number(p[0]));
    return { rows: [{ cree_le: l.length ? new Date(Math.max(...l.map((i) => i.cree_le.getTime()))) : null, utilisee: l.some((i) => i.utilise_le !== null) }] };
  }
  if (s.startsWith('UPDATE admin_invitation SET remplacee_le = now()')) {
    for (const i of invitations) if (i.utilisateur_id === Number(p[0]) && !i.utilise_le && !i.remplacee_le) i.remplacee_le = horloge;
    return { rows: [] };
  }
  if (s.startsWith('INSERT INTO admin_invitation')) {
    const i: Inv = { id: invitations.length + 1, utilisateur_id: Number(p[0]), jeton_empreinte: String(p[1]), cree_le: new Date(String(p[2])),
      expire_le: new Date(new Date(String(p[2])).getTime() + Number(p[3]) * 86_400_000), utilise_le: null, remplacee_le: null, mail_etat: 'en_cours', mail_erreur: null };
    invitations.push(i); return { rows: [{ id: i.id, expire_le: i.expire_le }] };
  }
  if (s.startsWith('UPDATE admin_invitation SET mail_etat')) {
    const i = invitations.find((x) => x.id === Number(p[0]))!; i.mail_etat = String(p[1]); i.mail_erreur = (p[2] as string | null); return { rows: [] };
  }
  if (s.startsWith("SELECT btrim(prenom || ' ' || nom) AS n")) return { rows: [{ n: 'Arnaud Jorel' }] };
  if (s.includes('FROM admin_invitation i JOIN admin_utilisateur u')) {
    const i = invitations.find((x) => x.jeton_empreinte === p[0]); if (!i) return { rows: [] };
    const c = comptes.get(i.utilisateur_id)!;
    return { rows: [{ ...i, actif: c.actif, prenom: c.prenom, identifiant: c.identifiant }] };
  }
  if (s.startsWith('UPDATE admin_invitation SET utilise_le = now()')) { invitations.find((x) => x.id === Number(p[0]))!.utilise_le = horloge; return { rows: [] }; }
  if (s.startsWith('WITH maj AS ( UPDATE admin_utilisateur SET mot_de_passe = $2, doit_changer_mot_de_passe = false')) {
    const c = comptes.get(Number(p[0]))!; c.mot_de_passe = String(p[1]); c.doit_changer = false; journal.push({ action: 'changement_mot_de_passe', cible: Number(p[0]) });
    return { rows: [{ id: p[0], identifiant: c.identifiant, role: 'administrateur', actif: true }] };
  }
  throw new Error('requête non simulée : ' + s.slice(0, 90));
});
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => query(s, p), withTransaction: (f: (q: unknown) => unknown) => f((s: string, p?: unknown[]) => query(s, p)) }));
vi.mock('./motDePasse', () => ({ hacher: async (c: string) => `HASH:${c}` }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

const { envoyerInvitation, activerParLien, lireLien, etatsInvitations } = await import('./invitationRepo');

const envoyes: { a: readonly string[]; corps: string; messageId?: string }[] = [];
const transportOk = { envoyer: async (m: { a: readonly string[]; corps: string; messageId?: string }) => { envoyes.push(m); return { ok: true as const, id: 'gmail-1', factice: false }; } };
const transportKo = { envoyer: async () => ({ ok: false as const, motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' }) };
const ENV = { GESTION_URL_APPLICATION: 'https://authentification.sansvisavis.com', NODE_ENV: 'production' };
const jetonDu = (corps: string) => decodeURIComponent(/\?j=([^\s]+)/.exec(corps)![1]);

beforeEach(() => {
  horloge = new Date('2026-10-16T10:00:00Z');
  comptes = new Map([[9, { identifiant: 'lea@criterimmo.fr', prenom: 'Léa', nom: 'Essai', actif: true, derniere_connexion_a: null, mot_de_passe: 'HASH:temp', doit_changer: true }]]);
  invitations = []; journal = []; envoyes.length = 0;
});
const envoyer = (o: { transport?: unknown; env?: Record<string, string> } = {}) =>
  envoyerInvitation(9, 1, { transport: (o.transport ?? transportOk) as never, maintenant: horloge, env: o.env ?? ENV });

describe('création → envoi', () => {
  it('le mail part au compte, avec un lien vers l’adresse de PRODUCTION, et l’état « envoyé » est enregistré', async () => {
    const r = await envoyer();
    expect(r).toEqual({ ok: true, etat: 'envoye', destinataire: 'lea@criterimmo.fr' });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].a).toEqual(['lea@criterimmo.fr']);
    expect(envoyes[0].corps).toMatch(/https:\/\/authentification\.sansvisavis\.com\/admin\/activation\?j=/);
    expect(envoyes[0].messageId).toMatch(/^<admin-invitation\./);
    expect(invitations[0]).toMatchObject({ mail_etat: 'envoye', mail_erreur: null });
    // le jeton n'est JAMAIS en clair en base
    expect(invitations[0].jeton_empreinte).not.toBe(jetonDu(envoyes[0].corps));
  });

  it('échec d’envoi → dit tel quel (motif réel), état « échec » enregistré', async () => {
    const r = await envoyer({ transport: transportKo });
    expect(r).toEqual({ ok: false, etat: 'echec', destinataire: 'lea@criterimmo.fr', motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' });
    expect(invitations[0]).toMatchObject({ mail_etat: 'echec', mail_erreur: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' });
  });

  it('en production, une adresse retombée sur localhost → rien ne part, et on le dit', async () => {
    const r = await envoyer({ env: { NODE_ENV: 'production' } });
    expect(r).toMatchObject({ ok: false, etat: 'echec' });
    expect(r.ok ? '' : r.motif).toMatch(/localhost/);
    expect(envoyes).toHaveLength(0);
    expect(invitations).toHaveLength(0);
  });
});

describe('renvoi', () => {
  it('nouveau lien, l’ancien est refusé ; le nouveau active le compte', async () => {
    await envoyer();
    const ancien = jetonDu(envoyes[0].corps);
    horloge = new Date(horloge.getTime() + 3 * 60_000);
    expect(await envoyer()).toMatchObject({ ok: true });
    const nouveau = jetonDu(envoyes[1].corps);
    expect(nouveau).not.toBe(ancien);
    const a = await activerParLien(ancien, 'mot-de-passe-solide', 'mot-de-passe-solide', horloge);
    expect(a).toMatchObject({ ok: false, statut: 409 });
    expect(a.ok ? '' : a.message).toMatch(/remplacé/);
    expect(await activerParLien(nouveau, 'mot-de-passe-solide', 'mot-de-passe-solide', horloge)).toEqual({ ok: true, identifiant: 'lea@criterimmo.fr' });
  });

  it('trop rapproché (moins de 2 minutes) → refusé, aucun mail, aucun nouveau lien', async () => {
    await envoyer();
    horloge = new Date(horloge.getTime() + 30_000);
    const r = await envoyer();
    expect(r).toMatchObject({ ok: false, etat: 'refuse' });
    expect(r.ok ? '' : r.motif).toMatch(/attendez/);
    expect(envoyes).toHaveLength(1);
    expect(invitations).toHaveLength(1);
  });

  it('compte déjà activé → refusé ; la liste ne le marque plus « à inviter »', async () => {
    comptes.get(9)!.derniere_connexion_a = new Date('2026-10-15T08:00:00Z');
    const r = await envoyer();
    expect(r).toMatchObject({ ok: false, etat: 'refuse' });
    expect(r.ok ? '' : r.motif).toMatch(/déjà activé/);
    expect(envoyes).toHaveLength(0);
  });
});

describe('lien d’activation', () => {
  it('valide → lecture sans écriture, puis activation : mot de passe choisi posé par le chemin existant (journal), lien consommé', async () => {
    await envoyer();
    const j = jetonDu(envoyes[0].corps);
    expect(await lireLien(j, horloge)).toEqual({ verdict: { ok: true }, prenom: 'Léa', identifiant: 'lea@criterimmo.fr' });
    expect(invitations[0].utilise_le).toBeNull();
    expect(await activerParLien(j, 'mot-de-passe-solide', 'mot-de-passe-solide', horloge)).toEqual({ ok: true, identifiant: 'lea@criterimmo.fr' });
    expect(comptes.get(9)).toMatchObject({ mot_de_passe: 'HASH:mot-de-passe-solide', doit_changer: false });
    expect(journal).toEqual([{ action: 'changement_mot_de_passe', cible: 9 }]);
    expect(invitations[0].utilise_le).not.toBeNull();
  });

  it('expiré → refusé, rien n’est modifié', async () => {
    await envoyer();
    const j = jetonDu(envoyes[0].corps);
    const r = await activerParLien(j, 'mot-de-passe-solide', 'mot-de-passe-solide', new Date(horloge.getTime() + 8 * 86_400_000));
    expect(r.ok ? '' : r.message).toMatch(/expiré/);
    expect(comptes.get(9)!.mot_de_passe).toBe('HASH:temp');
  });

  it('déjà utilisé → refusé, rien n’est modifié', async () => {
    await envoyer();
    const j = jetonDu(envoyes[0].corps);
    await activerParLien(j, 'mot-de-passe-solide', 'mot-de-passe-solide', horloge);
    const r = await activerParLien(j, 'autre-mot-de-passe', 'autre-mot-de-passe', horloge);
    expect(r.ok ? '' : r.message).toMatch(/déjà servi/);
    expect(comptes.get(9)!.mot_de_passe).toBe('HASH:mot-de-passe-solide');
  });

  it('faux → refusé ; mot de passe trop court ou confirmation fausse → refusé sans consommer le lien', async () => {
    expect((await activerParLien('faux', 'mot-de-passe-solide', 'mot-de-passe-solide', horloge)).ok).toBe(false);
    await envoyer();
    const j = jetonDu(envoyes[0].corps);
    expect(await activerParLien(j, 'court', 'court', horloge)).toMatchObject({ ok: false, statut: 400 });
    expect(await activerParLien(j, 'mot-de-passe-solide', 'mot-de-passe-autre', horloge)).toMatchObject({ ok: false, statut: 400 });
    expect(invitations[0].utilise_le).toBeNull();
  });
});

describe('liste', () => {
  it('l’état d’invitation est lu en une requête (état simulé : non activé, dernier envoi)', async () => {
    const avant = query.getMockImplementation()!;
    query.mockImplementation((async (sql: string, p: unknown[] = []) => sql.includes('LEFT JOIN LATERAL')
      ? { rows: [{ uid: 9, connexion: null, der: horloge, utilisee: false, mail_etat: 'echec', mail_erreur: 'x', expire_le: horloge }] }
      : avant(sql, p)) as never);
    const m = await etatsInvitations([9]);
    expect(m.get(9)).toMatchObject({ active: false, mailEtat: 'echec', mailErreur: 'x' });
    query.mockImplementation(avant);
  });
});
