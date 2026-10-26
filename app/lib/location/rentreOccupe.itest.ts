import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { gardeBaseJetable } from '../../scripts/baseJetable';

/**
 * ══ 🔴🔴 LOT RENTRÉ-OCCUPÉ (Arno, 26/10/2026, migration 430) — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ════════════════════════════
 * Le VRAI SQL : création d'un bien (Oui / Non / sans réponse), date d'entrée dans le suivi, marque du bail en place, suivi « Mandat de
 * gestion seul » sans honoraire de location, correction d'un bien existant par le script (transition d'origine gardée), candidats, et le
 * dry-run qui n'écrit rien. Deux passes : base AVEC la 430 et base SANS (le code tourne comme avant, le script le dit).
 *
 * 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable` (cluster jetable, schéma copié sans données).
 *   DATABASE_URL=postgresql://postgres@localhost:55432/gestion_jetable npx vitest run --config vitest.integration.config.ts app/lib/location/rentreOccupe.itest.ts
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);
vi.mock('node:fs', async (orig) => ({ ...(await orig<typeof import('node:fs')>()), writeFileSync: vi.fn(), mkdirSync: vi.fn() }));

const { query, pool } = await import('../db/client');
const { creerBienVerifie } = await import('./creationBienRepo');
const { lireLignesGestion } = await import('./suivi/tableauBordRepo');
const { enregistrerActiviteBail } = await import('./suivi/suiviRepo');
const R = await import('./rentreOccupeRepo');
const { main, MOT_SANS_430 } = await import('../../scripts/rentre-occupe');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
const JOUR = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const avec430 = (await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'entre_occupe'`)).rows[0].n > 0;

let proprio = 0;
const parking = (rue: string) => ({ famille: 'parking', parkingType: 'place_simple', adresse: rue, codePostal: '92230', commune: 'GENNEVILLIERS' });
const creer = async (rue: string, o: Record<string, unknown> = {}): Promise<number> => {
  const r = await creerBienVerifie({ proprietaireIds: [proprio], logement: parking(rue), annexes: [], enGestion: true, ...o } as never, AUTEUR);
  if (r.etat !== 'ok') throw new Error(`création refusée : ${JSON.stringify(r)}`);
  return r.data.logementId;
};
const entree = async (lot: number) => (await query<{ effet: string; source: string }>(
  `SELECT effet_le::text AS effet, source FROM gestion_bien_statut_transition WHERE lot_id = $1 AND apres = 'en_gestion' ORDER BY id DESC LIMIT 1`, [lot])).rows[0];
const duMois = async (debut: string, fin: string) => (await lireLignesGestion(debut, fin)).filter((l) => l.apres === 'en_gestion').map((l) => l.lotId);
const total = async (t: string) => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)).rows[0].n);

beforeAll(async () => {
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom) VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL')`);
  proprio = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise)
    VALUES ('ep-chalah', 'CHALAH', 'CHALAH Ramdane', 'chalah ramdane') RETURNING id::text`)).rows[0].id);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(async () => { await pool.end(); });

describe.runIf(avec430)('AVEC la 430', () => {
  let occupe = 0; let vide = 0; let bail = 0;
  it('Oui : la gestion entre dans le suivi à la DATE DU MANDAT ; le mandat des propriétaires reçoit cette date', async () => {
    occupe = await creer('25 Rue Henri Barbusse', { entreOccupe: true, dateMandat: '2026-09-15' });
    expect(await entree(occupe)).toEqual({ effet: '2026-09-15', source: 'creation' });
    expect((await query('SELECT entre_occupe FROM gestion_annuaire_lot WHERE id = $1', [occupe])).rows[0].entre_occupe).toBe(true);
    expect((await query('SELECT mandat_gestion_signe_le::text AS d FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio])).rows[0].d).toBe('2026-09-15');
    expect(await duMois('2026-09-01', '2026-09-30')).toContain(occupe);
  });
  it('Non (et sans réponse) : rien ne change — la date de création de la fiche', async () => {
    vide = await creer('8 Rue Denfert-Rochereau', { entreOccupe: false });
    expect(await entree(vide)).toEqual({ effet: JOUR, source: 'creation' });
    expect((await query('SELECT entre_occupe FROM gestion_annuaire_lot WHERE id = $1', [vide])).rows[0].entre_occupe).toBe(false);
    const sans = await creer('1 Rue Louis Pouey');
    expect(await entree(sans)).toEqual({ effet: JOUR, source: 'creation' });
    expect((await query('SELECT entre_occupe FROM gestion_annuaire_lot WHERE id = $1', [sans])).rows[0].entre_occupe).toBeNull();
    expect(await duMois('2026-09-01', '2026-09-30')).not.toContain(vide);
  });
  it('Oui sans date valide : refusé, rien n’est créé', async () => {
    const avant = await total('gestion_annuaire_lot');
    const r = await creerBienVerifie({ proprietaireIds: [proprio], logement: parking('2 Rue X'), annexes: [], enGestion: true, entreOccupe: true, dateMandat: '' } as never, AUTEUR);
    expect(r.etat).toBe('refus');
    expect(await total('gestion_annuaire_lot')).toBe(avant);
  });
  it('le bail du locataire en place : marqué (journalisé) ; refusé sur un bien rentré vide', async () => {
    bail = Number((await query<{ id: string }>(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2014-03-01') RETURNING id::text`, [occupe])).rows[0].id);
    expect(await R.marquerBailEnPlace(bail, AUTEUR)).toEqual({ etat: 'ok', data: { lotId: occupe, dateMandat: '2026-09-15' } });
    expect(await R.bailEnPlace(bail)).toBe(true);
    expect((await query(`SELECT count(*)::int AS n FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'location_bail_en_place'`, [occupe])).rows[0].n).toBe(1);
    expect((await R.bauxEnPlace({ lotId: occupe })).map((b) => [b.bailId, b.entree, b.dateMandat])).toEqual([[bail, '2014-03-01', '2026-09-15']]);
    const autre = Number((await query<{ id: string }>(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2026-10-01') RETURNING id::text`, [vide])).rows[0].id);
    expect((await R.marquerBailEnPlace(autre, AUTEUR)).etat).toBe('refus');
    expect(await R.bailEnPlace(autre)).toBe(false);
  });
  it('son suivi : « Mandat de gestion seul » sans honoraire de location, même si l’écran envoie un bail avec honoraires', async () => {
    const r = await enregistrerActiviteBail(bail, { type: 'bail', dateSignature: '2026-09-15', honoProprietaireHt: '500', honoLocataireHt: '300',
      negociateurId: null, apporteurId: null, apporteurTaux: '', mandatGestion: true, avecGestion: false, origineProprietaire: null, origineLocataire: null,
      origineContact: 'internet', primeMode: 'aucune' }, AUTEUR);
    expect(r.etat, JSON.stringify(r)).toBe('ok');
    const a = (await query<{ type: string; d: string; p: string; l: string }>(
      `SELECT type, date_signature::text AS d, hono_proprietaire_ht::text AS p, hono_locataire_ht::text AS l FROM gestion_location_activite WHERE bail_id = $1`, [bail])).rows;
    expect(a.map((x) => [x.type, x.d, Number(x.p), Number(x.l)])).toEqual([['gestion_seule', '2026-09-15', 0, 0]]);
    expect((await enregistrerActiviteBail(bail, { type: 'gestion_seule', dateSignature: '2026-09-15', honoProprietaireHt: '0', honoLocataireHt: '0',
      negociateurId: null, apporteurId: null, apporteurTaux: '', mandatGestion: true, avecGestion: false, origineProprietaire: null, origineLocataire: null,
      origineContact: 'internet', primeMode: 'aucune' }, AUTEUR)).etat).toBe('refus');
  });
  it('R4 — un bien existant : candidat listé ; le dry-run n’écrit rien ; --appliquer corrige la date (l’origine gardée), idempotent', async () => {
    const existant = await creer('12 Rue de l’Église');
    const bail2015 = Number((await query<{ id: string }>(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2015-06-01') RETURNING id::text`, [existant])).rows[0].id);
    expect((await R.candidatsRentreOccupe(90)).map((c) => c.lotId)).toContain(existant);
    const tables = ['gestion_annuaire_lot', 'gestion_bail', 'gestion_bien_statut_transition', 'gestion_bien_statut_effet_corrige', 'gestion_journal'];
    const avant = await Promise.all(tables.map(total));
    const essai = await main([`--bien=${existant}`, '--date-mandat=2026-08-01', `--bail=${bail2015}`]);
    expect(essai[0]).toContain('DRY-RUN');
    expect(await Promise.all(tables.map(total))).toEqual(avant);
    expect((await query('SELECT entre_occupe FROM gestion_annuaire_lot WHERE id = $1', [existant])).rows[0].entre_occupe).toBeNull();

    const fait = await main([`--bien=${existant}`, '--date-mandat=2026-08-01', `--bail=${bail2015}`, '--appliquer']);
    expect(fait.join('\n')).toContain('entrée en gestion');
    expect(await entree(existant)).toEqual({ effet: JOUR, source: 'creation' });          // la transition d'origine n'est jamais réécrite
    expect(await duMois('2026-08-01', '2026-08-31')).toContain(existant);                  // le suivi lit la date corrigée
    expect(await duMois(`${JOUR.slice(0, 8)}01`, JOUR)).not.toContain(existant);
    expect(await R.bailEnPlace(bail2015)).toBe(true);
    expect((await R.candidatsRentreOccupe(90)).map((c) => c.lotId)).not.toContain(existant);
    const corrections = await total('gestion_bien_statut_effet_corrige');
    await main([`--bien=${existant}`, '--date-mandat=2026-08-01', `--bail=${bail2015}`, '--appliquer']);
    expect(await total('gestion_bien_statut_effet_corrige')).toBe(corrections);
    // Une correction ne se supprime jamais (verrou de la 430).
    await expect(query('DELETE FROM gestion_bien_statut_effet_corrige')).rejects.toThrow(/interdit/);
  });
});

describe.runIf(!avec430)('SANS la 430 : le code tourne comme aujourd’hui', () => {
  it('un bien se crée comme avant (date de création) ; une réponse envoyée n’est jamais perdue en silence (sans_schema)', async () => {
    const lot = await creer('25 Rue Henri Barbusse');
    expect(await entree(lot)).toEqual({ effet: JOUR, source: 'creation' });
    const avant = await total('gestion_annuaire_lot');
    const r = await creerBienVerifie({ proprietaireIds: [proprio], logement: parking('3 Rue Y'), annexes: [], enGestion: true, entreOccupe: true, dateMandat: '2026-09-15' } as never, AUTEUR);
    expect(r.etat).toBe('sans_schema');
    expect(await total('gestion_annuaire_lot')).toBe(avant);
  });
  it('le suivi lit la date d’origine ; le script dit « disponible après la mise à jour » et n’écrit rien', async () => {
    expect(await duMois(`${JOUR.slice(0, 8)}01`, JOUR)).not.toEqual([]);
    const avant = await total('gestion_journal');
    const l = await main(['--bien=1', '--date-mandat=2026-09-15', '--appliquer']);
    expect(l).toContain(MOT_SANS_430);
    expect(await total('gestion_journal')).toBe(avant);
  });
});
