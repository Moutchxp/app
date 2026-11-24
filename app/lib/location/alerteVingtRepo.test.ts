import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (24/11/2026) — la passe de l'alerte du lundi : urgence → 1 mail ; aucune → 0 ; deuxième lancement le même lundi → 0 ; essai → 0. */
const h = vi.hoisted(() => ({ query: vi.fn(), avec514: true, urgence: 1, journal: [] as unknown[][], sql: [] as string[] }));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec514 }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('./vingtPourcentRepo', () => ({
  lireSuiviVingtPourcent: async () => ({ aujourdhui: '2026-11-30', manquantes: [], lignes: Array.from({ length: h.urgence }, (_, i) => ({
    sortieId: i + 1, lotId: i + 1, locataires: [`LOC ${i + 1}`], logement: `${i + 1} rue Test`, dateSortie: '2026-03-01', valideLe: '2026-03-03',
    copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 30, mois: 6 }, cleCopro: 'copro-1',
    suivi: { etat: 'ok', exercice: '2026-06-30', ago: { date: '2026-09-15', statut: 'officielle' }, incertaine: false, limite: '2026-10-15', alerte: 'depassee', joursRestants: -46 } })) }),
}));
import { passeAlerteVingt } from './alerteVingtRepo';

const LUNDI = new Date('2026-11-30T08:00:00Z'); // 09:00 Paris
const MARDI = new Date('2026-12-01T08:00:00Z');
const ENV = { GESTION_URL_APPLICATION: 'https://exemple.test' };
const envoyes: unknown[] = [];
const transport = { envoyer: vi.fn(async (m: unknown) => { envoyes.push(m); return { ok: true as const, id: 'x', factice: true }; }) };
beforeEach(() => {
  h.avec514 = true; h.urgence = 1; h.journal = []; h.sql = []; envoyes.length = 0; transport.envoyer.mockClear();
  h.query.mockReset().mockImplementation(async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' '); h.sql.push(s);
    if (s.startsWith('SELECT count(*)::text AS n FROM gestion_location_alerte_vingt')) return { rows: [{ n: String(h.journal.filter((j) => j[0] === p[0] && j[1] === 'envoye').length) }] };
    if (s.startsWith('INSERT INTO gestion_location_alerte_vingt')) { h.journal.push(p); return { rows: [] }; }
    return { rows: [] };
  });
});

describe('la passe du lundi', () => {
  it('🔴 lundi matin, un locataire en urgence : UN mail à la Gestion, journalisé « envoye »', async () => {
    const r = await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV });
    expect(r).toMatchObject({ etat: 'envoye', mail: { a: ['gestion@exemple.test'], objet: '[Urgent] 20 % à restituer — 1 locataire', nombre: 1 } });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({ de: 'gestion@exemple.test', a: ['gestion@exemple.test'], cc: [], cci: [], objet: '[Urgent] 20 % à restituer — 1 locataire' });
    expect(String((envoyes[0] as { corps: string }).corps)).toContain('Ouvrir l’écran : https://exemple.test/admin/location/vingt-pourcent');
    expect(String((envoyes[0] as { messageId: string }).messageId)).toMatch(/^<tache-acceptation\./);
    expect(h.journal).toEqual([['2026-11-30', 'envoye', 1, ['gestion@exemple.test'], '[Urgent] 20 % à restituer — 1 locataire', null]]);
  });
  it('🔴 deuxième lancement le même lundi : 0 mail', async () => {
    await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV });
    expect(await passeAlerteVingt({ maintenant: new Date('2026-11-30T15:00:00Z'), transport, env: ENV })).toEqual({ etat: 'deja_envoye', jour: '2026-11-30' });
    expect(envoyes).toHaveLength(1);
    expect(h.journal).toHaveLength(1);
  });
  it('🔴 personne en urgence : 0 mail, rien n’est journalisé', async () => {
    h.urgence = 0;
    expect(await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV })).toEqual({ etat: 'aucune_urgence', jour: '2026-11-30' });
    expect(envoyes).toHaveLength(0);
    expect(h.journal).toEqual([]);
  });
  it('un autre jour : rien n’est lu ni envoyé', async () => {
    expect(await passeAlerteVingt({ maintenant: MARDI, transport, env: ENV })).toEqual({ etat: 'pas_le_moment', jour: '2026-12-01' });
    expect(h.sql).toEqual([]);
    expect(envoyes).toHaveLength(0);
  });
  it('un échec d’envoi : journalisé « echec », réessayé à la passe suivante (le même lundi)', async () => {
    transport.envoyer.mockImplementationOnce(async () => ({ ok: false as const, motif: 'jeton expiré' }) as never);
    expect(await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV })).toMatchObject({ etat: 'echec', motif: 'jeton expiré' });
    expect((await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV })).etat).toBe('envoye');
    expect(h.journal.map((j) => j[1])).toEqual(['echec', 'envoye']);
  });
  it('🔴 MODE ESSAI : le mail tel qu’il partirait, n’importe quel jour — rien n’est envoyé ni écrit', async () => {
    const r = await passeAlerteVingt({ maintenant: MARDI, essai: true, transport, env: ENV });
    expect(r).toMatchObject({ etat: 'essai', mail: { objet: '[Urgent] 20 % à restituer — 1 locataire', a: ['gestion@exemple.test'] } });
    expect(envoyes).toHaveLength(0);
    expect(h.journal).toEqual([]);
    h.urgence = 0;
    expect(await passeAlerteVingt({ maintenant: MARDI, essai: true, transport, env: ENV })).toEqual({ etat: 'essai', mail: null });
  });
  it('sans la 514 : jamais d’envoi (pas de garde contre le double envoi)', async () => {
    h.avec514 = false;
    expect(await passeAlerteVingt({ maintenant: LUNDI, transport, env: ENV })).toEqual({ etat: 'sans_schema', jour: '2026-11-30' });
    expect(envoyes).toHaveLength(0);
  });
});
