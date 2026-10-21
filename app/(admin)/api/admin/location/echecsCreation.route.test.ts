import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026) — « ENREGISTRER LE BIEN » NE FAISAIT RIEN (compte collaborateur, production). La ROUTE, avec la VRAIE
 * garde « Location » (`exigerLocation` → `exigerModule`, droit relu EN BASE — base et jeton simulés) :
 *   · collaborateur AVEC le droit : le bien est créé (« ok »), rien n'est journalisé comme échec ;
 *   · collaborateur SANS le droit : 403 `{ erreur: 'ACCES_REVOQUE' }`, RIEN n'est créé, et l'échec est JOURNALISÉ (compte,
 *     écran, cause « droit ») ;
 *   · refus métier ou base incomplète : la réponse inchangée, et une ligne au journal ; erreur technique : 503 + journal ;
 *   · un contrôle de la page qui a bloqué l'envoi (`journal-echec`) : une ligne au journal, rien d'écrit.
 */
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
let permLocation = true;
const query = vi.fn(async (sql: string, _params?: unknown[]) => (/FROM admin_utilisateur WHERE id/.test(sql)
  ? { rows: [{ actif: true, role: 'collaborateur', perm: permLocation }], rowCount: 1 } : { rows: [], rowCount: 0 }));
vi.mock('../../../../lib/db/client', () => ({ query: (s: string, p?: unknown[]) => query(s, p), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/admin/session', async (orig) => ({
  ...(await orig<typeof import('../../../../lib/admin/session')>()),
  verifierJeton: async () => ({ sub: '5', role: 'collaborateur', identifiant: 'collaborateur@exemple.test' }),
}));
vi.mock('../../../../lib/admin/schemaDroits', async (orig) => ({ ...(await orig<object>()), droitLocationDisponible: async () => true }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'collaborateur@exemple.test' }) }));
const creerBienComplet = vi.fn();
vi.mock('../../../../lib/location/creationBienRepo', async (orig) => ({
  ...(await orig<object>()), creerBienComplet: (...a: unknown[]) => creerBienComplet(...a),
}));

// Le mail « nouveau mandat » (après une création réussie) : hors sujet ici — rendu tel quel, rien ne part.
vi.mock('../../../../lib/location/mailPortefeuilleRepo', async (orig) => ({ ...(await orig<object>()), avecMail: async (r: unknown) => r }));
const { POST } = await import('./route');
const { NOM_COOKIE } = await import('../../../../lib/admin/session');

const demande = (corps: unknown): Request => new Request('http://localhost/api/admin/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `${NOM_COOKIE}=jeton` }, body: JSON.stringify(corps),
});
const BIEN = { action: 'creer-bien', proprietaireIds: [49], enGestion: true, logement: { adresse: '1 rue Fictive', famille: 'parking', parkingType: 'box' }, annexes: [] };
let journal: string[];
beforeEach(() => {
  permLocation = true; creerBienComplet.mockReset(); journal = [];
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { journal.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('🔴 « Nouveau bien » — collaborateur avec / sans le droit Location', () => {
  it('AVEC le droit : créé, aucune ligne d’échec', async () => {
    creerBienComplet.mockResolvedValue({ etat: 'ok', data: { logementId: 900, annexes: [] } });
    const r = await POST(demande(BIEN));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ etat: 'ok', data: { logementId: 900, annexes: [] } });
    expect(creerBienComplet).toHaveBeenCalledTimes(1);
    expect(journal.filter((l) => l.startsWith('[location:echec]'))).toEqual([]);
  });

  it('SANS le droit : 403 ACCES_REVOQUE, RIEN n’est créé, l’échec est journalisé (compte, écran, cause « droit »)', async () => {
    permLocation = false;
    const r = await POST(demande(BIEN));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ erreur: 'ACCES_REVOQUE' });
    expect(creerBienComplet).not.toHaveBeenCalled();
    expect(journal).toEqual(['[location:echec] compte=collaborateur@exemple.test ecran=nouveau-bien action=creer-bien cause=droit raison=refus de la garde (HTTP 403)']);
  });

  it('refus métier : la réponse inchangée, une ligne au journal avec le motif', async () => {
    creerBienComplet.mockResolvedValue({ etat: 'refus', motif: 'Un propriétaire choisi n’existe plus, est archivé ou est sorti du portefeuille : retirez-le ou réactivez-le.' });
    const r = await POST(demande(BIEN));
    expect(await r.json()).toMatchObject({ etat: 'refus' });
    expect(journal).toEqual([expect.stringMatching(/^\[location:echec\] compte=collaborateur@exemple\.test ecran=nouveau-bien action=creer-bien cause=saisie raison=Un propriétaire choisi n’existe plus/)]);
  });

  it('base incomplète (sans_schema) : cause « base » ; erreur technique : 503 et cause « technique »', async () => {
    creerBienComplet.mockResolvedValue({ etat: 'sans_schema' });
    await POST(demande(BIEN));
    expect(journal.at(-1)).toMatch(/cause=base raison=sans_schema$/);
    creerBienComplet.mockRejectedValue(new Error('connexion perdue'));
    const r = await POST(demande(BIEN));
    expect(r.status).toBe(503);
    expect(journal.at(-1)).toMatch(/action=creer-bien cause=technique raison=connexion perdue$/);
  });

  it('« journal-echec » : le contrôle de la page qui a bloqué l’envoi est journalisé ; rien n’est créé', async () => {
    const r = await POST(demande({ action: 'journal-echec', ecran: 'nouveau-bien', pour: 'creer-bien', cause: 'champs', raison: 'Il manque : L’adresse du bien est obligatoire.' }));
    expect(await r.json()).toEqual({ etat: 'ok', data: null });
    expect(creerBienComplet).not.toHaveBeenCalled();
    expect(journal).toEqual(['[location:echec] compte=collaborateur@exemple.test ecran=nouveau-bien action=creer-bien cause=champs raison=Il manque : L’adresse du bien est obligatoire.']);
  });

  it('une action qui n’est pas une création (ex. modifier une fiche) n’est pas journalisée comme échec de création', async () => {
    permLocation = false;
    await POST(demande({ action: 'modifier', sujet: 'proprietaire', id: 1, champs: {} }));
    expect(journal).toEqual([]);
  });
});
