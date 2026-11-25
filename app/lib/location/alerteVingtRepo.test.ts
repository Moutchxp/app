import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (25/11/2026) — la passe de l'alerte « 20 % à restituer en retard » (remplace celle du lundi) : tous les 2 jours dès 8 h (Paris) ; au moins
 * un locataire en retard → 1 mail ; personne → 0 ; deuxième lancement le même jour → 0 ; le lendemain → 0 ; serveur arrêté → le jour suivant ;
 * essai → 0. Journal : la table de la 514, sans nouvelle migration.
 */
const h = vi.hoisted(() => ({ query: vi.fn(), avec514: true, retard: 1, urgence: 0, coloc: false, journal: [] as unknown[][], sql: [] as string[] }));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec514 }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
const ligne = (i: number, limite: string, ago: string) => ({
  sortieId: i + 1, lotId: i + 1, locataires: h.coloc && i === 0 ? ['COLOC Un', 'COLOC Deux'] : [`LOC ${i + 1}`], logement: `${i + 1} rue Test`, dateSortie: '2026-03-01', valideLe: '2026-03-03',
  copropriete: { id: 1, libelle: 'Copro', aRattacher: false }, arrete: { jour: 30, mois: 6 }, cleCopro: 'copro-1',
  suivi: { etat: 'ok', exercice: '2026-06-30', ago: { date: ago, statut: 'officielle' }, incertaine: false, limite, alerte: 'depassee', joursRestants: -46 } });
vi.mock('./vingtPourcentRepo', () => ({
  lireSuiviVingtPourcent: async () => ({ aujourdhui: '2026-11-30', manquantes: [], lignes: [
    // en retard : AGO officielle 15/09, limite 15/10 dépassée
    ...Array.from({ length: h.retard }, (_, i) => ligne(i, '2026-10-15', '2026-09-15')),
    // en urgence (AGO + 21 j, limite pas encore passée) : jamais dans ce mail
    ...Array.from({ length: h.urgence }, (_, i) => ligne(100 + i, '2026-12-05', '2026-11-05')),
  ] }),
}));
import { passeAlerteVingt } from './alerteVingtRepo';

const JOUR = new Date('2026-11-30T08:00:00Z'); // 09:00 Paris
const AVANT_8H = new Date('2026-11-30T06:30:00Z'); // 07:30 Paris
const ENV = { GESTION_URL_APPLICATION: 'https://exemple.test' };
const OBJET1 = '[Alerte] 20 % à restituer en retard — 1 locataire';
const envoyes: unknown[] = [];
const transport = { envoyer: vi.fn(async (m: unknown) => { envoyes.push(m); return { ok: true as const, id: 'x', factice: true }; }) };
beforeEach(() => {
  h.avec514 = true; h.retard = 1; h.urgence = 0; h.coloc = false; h.journal = []; h.sql = []; envoyes.length = 0; transport.envoyer.mockClear();
  h.query.mockReset().mockImplementation(async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' '); h.sql.push(s);
    if (s.startsWith('SELECT count(*)::text AS n FROM gestion_location_alerte_vingt')) return { rows: [{ n: String(h.journal.filter((j) => j[0] === p[0] && j[1] === 'envoye').length) }] };
    if (s.startsWith('SELECT max(lundi)::text AS d FROM gestion_location_alerte_vingt')) {
      const prefixe = String(p[0]).replace(/%$/, '');
      const jours = h.journal.filter((j) => j[1] === 'envoye' && String(j[4]).startsWith(prefixe)).map((j) => String(j[0])).sort();
      return { rows: [{ d: jours.at(-1) ?? null }] };
    }
    if (s.startsWith('INSERT INTO gestion_location_alerte_vingt')) { h.journal.push(p); return { rows: [] }; }
    return { rows: [] };
  });
});
const passe = (maintenant: Date) => passeAlerteVingt({ maintenant, transport, env: ENV });

describe('la passe de l’alerte de retard', () => {
  it('🔴 dès 8 h, un locataire en retard : UN mail à la Gestion, journalisé « envoye » (objet « [Alerte] … »)', async () => {
    const r = await passe(JOUR);
    expect(r).toMatchObject({ etat: 'envoye', mail: { a: ['gestion@exemple.test'], objet: OBJET1, nombre: 1 } });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({ de: 'gestion@exemple.test', a: ['gestion@exemple.test'], cc: [], cci: [], objet: OBJET1 });
    expect(String((envoyes[0] as { corps: string }).corps)).toContain('Ouvrir l’écran : https://exemple.test/admin/location/vingt-pourcent');
    expect(String((envoyes[0] as { corps: string }).corps)).toContain('AGO officielle du 15/09/2026 — date limite 15/10/2026 — 46 jours de retard');
    expect(String((envoyes[0] as { messageId: string }).messageId)).toMatch(/^<tache-acceptation\./);
    expect(h.journal).toEqual([['2026-11-30', 'envoye', 1, ['gestion@exemple.test'], OBJET1, null]]);
  });
  it('🔴 avant 8 h : rien n’est lu ni envoyé', async () => {
    expect(await passe(AVANT_8H)).toEqual({ etat: 'pas_le_moment', jour: '2026-11-30' });
    expect(h.sql).toEqual([]);
  });
  it('🔴 deuxième lancement le même jour : 0 mail ; le lendemain : 0 ; le surlendemain : un nouveau mail', async () => {
    await passe(JOUR);
    expect(await passe(new Date('2026-11-30T15:00:00Z'))).toEqual({ etat: 'deja_envoye', jour: '2026-11-30' });
    expect(await passe(new Date('2026-12-01T08:00:00Z'))).toEqual({ etat: 'pas_le_moment', jour: '2026-12-01' });
    expect(envoyes).toHaveLength(1);
    expect((await passe(new Date('2026-12-02T08:00:00Z'))).etat).toBe('envoye');
    expect(h.journal.map((j) => [j[0], j[1]])).toEqual([['2026-11-30', 'envoye'], ['2026-12-02', 'envoye']]);
  });
  it('🔴 serveur arrêté le jour prévu : le mail part le jour suivant, dès 8 h', async () => {
    h.journal.push(['2026-11-26', 'envoye', 1, ['gestion@exemple.test'], OBJET1, null]); // prévu le 28 ; serveur arrêté le 28 et le 29
    expect((await passe(JOUR)).etat).toBe('envoye');
  });
  it('🔴 personne en retard (même avec des locataires en « Urgence ») : 0 mail, rien n’est journalisé', async () => {
    h.retard = 0; h.urgence = 2;
    expect(await passe(JOUR)).toEqual({ etat: 'aucun_retard', jour: '2026-11-30' });
    expect(envoyes).toHaveLength(0);
    expect(h.journal).toEqual([]);
  });
  it('🔴 les locataires en « Urgence » ne sont jamais dans le mail', async () => {
    h.urgence = 3;
    const r = await passe(JOUR);
    expect(r).toMatchObject({ etat: 'envoye', mail: { objet: OBJET1, nombre: 1 } });
    expect(String((envoyes[0] as { corps: string }).corps)).not.toContain('LOC 101');
  });
  it('🔴 l’ancien mail du lundi ne compte pas dans le rythme (son historique reste au journal) ; un envoi le même jour bloque quand même', async () => {
    h.journal.push(['2026-11-23', 'envoye', 2, ['gestion@exemple.test'], '[Urgent] 20 % à restituer — 2 locataires', null]);
    h.journal.push(['2026-11-29', 'envoye', 2, ['gestion@exemple.test'], '[Urgent] 20 % à restituer — 2 locataires', null]);
    expect((await passe(JOUR)).etat).toBe('envoye'); // le 29 était un mail du lundi : il ne repousse pas l'alerte de retard
    h.journal.length = 0;
    h.journal.push(['2026-11-30', 'envoye', 2, ['gestion@exemple.test'], '[Urgent] 20 % à restituer — 2 locataires', null]);
    expect(await passe(JOUR)).toEqual({ etat: 'deja_envoye', jour: '2026-11-30' }); // l'index unique de la 514 : un envoi par jour
  });
  it('un échec d’envoi : journalisé « echec », réessayé à la passe suivante (le même jour)', async () => {
    transport.envoyer.mockImplementationOnce(async () => ({ ok: false as const, motif: 'jeton expiré' }) as never);
    expect(await passe(JOUR)).toMatchObject({ etat: 'echec', motif: 'jeton expiré' });
    expect((await passe(JOUR)).etat).toBe('envoye');
    expect(h.journal.map((j) => j[1])).toEqual(['echec', 'envoye']);
  });
  it('🔴 MODE ESSAI : le mail tel qu’il partirait, n’importe quel jour ou heure — rien n’est envoyé ni écrit', async () => {
    const r = await passeAlerteVingt({ maintenant: AVANT_8H, essai: true, transport, env: ENV });
    expect(r).toMatchObject({ etat: 'essai', mail: { objet: OBJET1, a: ['gestion@exemple.test'] } });
    expect(envoyes).toHaveLength(0);
    expect(h.journal).toEqual([]);
    h.retard = 0;
    expect(await passeAlerteVingt({ maintenant: AVANT_8H, essai: true, transport, env: ENV })).toEqual({ etat: 'essai', mail: null });
  });
  it('sans la 514 : jamais d’envoi (pas de garde contre le double envoi)', async () => {
    h.avec514 = false;
    expect(await passe(JOUR)).toEqual({ etat: 'sans_schema', jour: '2026-11-30' });
    expect(envoyes).toHaveLength(0);
  });
});

/** 🔴 Arno (25/11/2026) — « compter en locataires partout » : objet et journal (514, colonne `nombre`) comptent des LOCATAIRES. */
describe('🔴 Arno (25/11/2026) — l’alerte compte des locataires', () => {
  it('une colocation en retard (une ligne, deux locataires) : « 2 locataires », journalisé nombre = 2', async () => {
    h.coloc = true;
    const r = await passe(JOUR);
    expect(r).toMatchObject({ etat: 'envoye', mail: { objet: '[Alerte] 20 % à restituer en retard — 2 locataires', nombre: 2 } });
    expect(h.journal).toEqual([['2026-11-30', 'envoye', 2, ['gestion@exemple.test'], '[Alerte] 20 % à restituer en retard — 2 locataires', null]]);
  });
});
