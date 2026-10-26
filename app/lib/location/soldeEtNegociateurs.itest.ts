import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gardeBaseJetable } from '../../scripts/baseJetable';

/**
 * ══ 🔴🔴 LOT SUIVI DU MOIS (Arno, 26/10/2026, migration 432) — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ════════════════════════════
 *   · un bien rentré vide, en attente de locataire, puis SORTI : ni entrée, ni sortie (pas de « −1 », pas de mandat perdu), il quitte la liste
 *     d'attente et figure dans « Sortis sans avoir été comptés » ; octobre = +N, −0 ; les mois AVANT octobre identiques aux anciennes règles ;
 *   · une personne = un espace négociateur : libellé sûr rattaché d'office, libellé inconnu « à rapprocher », rattacher / détacher (432).
 * La base doit avoir la 430 et PAS ENCORE les 431 et 432 : l'épreuve les applique au milieu (les fichiers tels qu'ils sont livrés).
 * 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable`.
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);
vi.mock('./sondeLocation', async () => {
  const { query } = await import('../db/client');
  return {
    colonneExisteMemo: async (t: string, c: string) => ((await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).rows[0]?.n ?? 0) > 0,
    oublierSchemaLocation: () => {},
  };
});

const { query, pool, withTransaction } = await import('../db/client');
const { lireLignesGestion, lireGestion, lireGestionsEnAttente, lireSortiesNonComptees, lireActivites, lireNegociateursARapprocher } = await import('./suivi/tableauBordRepo');
const { lireRegleAnnexes } = await import('./suivi/annexesGestionRepo');
const { gestionDuMois, sectionGestion } = await import('./suivi/tableauBord');
const { stockGestion } = await import('./suivi/annexesGestion');
const { rattacherNegociateur, detacherNegociateur } = await import('./suivi/negociateurIdentiteRepo');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
let proprio = 0; let locataire = 0; let rang = 0;
const L: Record<string, number> = {};
const lot = async (adresse: string, depuis: string): Promise<number> => Number((await query<{ id: string }>(
  `INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, commune, categorie, en_gestion, statut_bien_depuis, entre_occupe)
   VALUES ($1, $2, 'TEST Test', $3, 'PARIS', 'logement', true, $4::date, false) RETURNING id::text`, [`ep-${(rang += 1)}`, proprio, adresse, depuis])).rows[0].id);
const bail = async (l: number, entree: string): Promise<void> => {
  const b = Number((await query<{ id: string }>('INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, $2::date) RETURNING id::text', [l, entree])).rows[0].id);
  await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, bail_id) VALUES ($1, $2, $3, $4, $5::date, $6)`,
    [`o-${b}`, locataire, l, `w-${l}`, entree, b]);
};
/** La sortie de gestion, par le chemin de la base : la transition journalisée et le statut, dans la même transaction (la garde de la 403). */
const sortir = async (l: number, jour: string): Promise<void> => {
  await withTransaction(async (q) => {
    await q(`INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, motif, auteur_libelle) VALUES ($1, 'en_gestion', 'ancienne_gestion', $2::date, 'geste', 'épreuve', 'épreuve')`, [l, jour]);
    await q(`UPDATE gestion_annuaire_lot SET statut_bien = 'ancienne_gestion', statut_bien_depuis = $2::date WHERE id = $1`, [l, jour]);
  });
};
const etat = async () => {
  const regle = await lireRegleAnnexes();
  const r = { bascule: regle.basculeAnnexes, annexes: new Set(regle.annexes) };
  const g = await lireGestion('2025-01-01');
  const lignes = await lireLignesGestion('2025-01-01', '2026-12-31');
  return { oct: gestionDuMois(lignes, '2026-10', r), lignes, stock: sectionGestion(g.transitions, stockGestion(g.stock, g.transitions, r), '2026-12', r), brut: g.stock };
};

beforeAll(async () => {
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom) VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL'),
               (5, 'jb.pons@sansvisavis.com', 'x', 'collaborateur', 'Jean-Baptiste', 'PONS')`);
  proprio = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ('ep-p', 'TEST', 'TEST Test', 'test test') RETURNING id::text`)).rows[0].id);
  locataire = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise) VALUES ('ep-l', 'ep-l', 'LOC Un', 'loc un') RETURNING id::text`)).rows[0].id);
  L.sept = await lot('1 Rue Septembre', '2026-09-10'); await bail(L.sept, '2026-09-01');
  L.loueOct = await lot('2 Rue Octobre', '2026-10-05'); await bail(L.loueOct, '2026-10-12');
  L.eglise = await lot('12 Rue de l’Église', '2026-10-26');          // rentré vide, sans locataire…
  L.denfert = await lot('8 Rue Denfert-Rochereau', '2026-10-26');
  await sortir(L.eglise, '2026-10-26'); await sortir(L.denfert, '2026-10-26');   // …puis sorti le même jour
  L.attente = await lot('3 Rue Attente', '2026-10-20');              // rentré vide, toujours sans locataire
  // Les lignes de suivi du négociateur : avec le compte, au libellé sûr, au libellé inconnu.
  for (const [id, lib, hp] of [[5, 'jb.pons@sansvisavis.com', 230.48], [null, 'Jean-Baptiste PONS', 1198.05], [null, 'JB', 50]] as const) {
    await query(`INSERT INTO gestion_location_activite (type, date_signature, libelle_proprietaire, libelle_locataire, hono_proprietaire_ht, hono_locataire_ht,
      negociateur_id, negociateur_libelle, source, cree_par_libelle) VALUES ('bail', '2026-10-05', 'P', 'L', $1, 0, $2, $3, 'saisie', 'épreuve')`, [hp, id, lib]);
  }
});
afterAll(async () => { await pool.end(); });

describe('le solde des biens en gestion', () => {
  let avant: Awaited<ReturnType<typeof etat>>;
  it('avant (430 seule, anciennes règles) : les deux biens sortis comptent +1 puis −1', async () => {
    avant = await etat();
    expect(avant.oct.nouvelles.length).toBe(4);
    expect(avant.oct.perdues.length).toBe(2);
  });
  it('la 431 appliquée : sans le correctif, ce serait « +1 −2 » ; avec : octobre +1, −0 ; les sortis à part, plus en attente', async () => {
    await pool.query(readFileSync('db/migrations/431_location_bascules_octobre_conversion.sql', 'utf8'));
    const apres = await etat();
    expect(apres.oct.nouvelles.map((l) => l.lotId)).toEqual([L.loueOct]);
    expect(apres.oct.perdues).toEqual([]);
    expect((await lireSortiesNonComptees('2026-10-01', '2026-10-31')).map((l) => l.lotId).sort()).toEqual([L.eglise, L.denfert].sort());
    expect((await lireGestionsEnAttente('2026-10-01', '2026-10-31')).map((l) => l.lotId)).toEqual([L.attente]);
    const pointOct = apres.stock.find((p) => p.mois === '2026-10');
    expect([pointOct?.entrees, pointOct?.sorties, pointOct?.solde]).toEqual([1, 0, 1]);
    // Le total « Biens en gestion » d'aujourd'hui : les lots en gestion, sans celui en attente (les deux sortis n'y étaient déjà plus).
    expect(apres.brut).toBe(avant.brut - 1);
  });
  it('les mois AVANT octobre 2026 : mêmes lignes, même stock en fin de mois qu’avec les anciennes règles', async () => {
    const apres = await etat();
    const jusquA = (x: typeof avant) => x.lignes.filter((l) => l.effetLe < '2026-10-01').map((l) => `${l.lotId}@${l.effetLe}@${l.apres}`).sort();
    expect(jusquA(apres)).toEqual(jusquA(avant));
    const stocks = (x: typeof avant) => x.stock.filter((p) => p.mois < '2026-10').map((p) => [p.mois, p.stock, p.entrees, p.sorties]);
    expect(stocks(apres)).toEqual(stocks(avant));
  });
});

describe('une personne = un espace négociateur', () => {
  it('le libellé sûr prend le compte ; « JB » reste à rapprocher', async () => {
    const lues = await lireActivites([2026]);
    expect(lues.map((a) => [a.negociateurId, a.negociateurLibelle])).toEqual([[5, 'Jean-Baptiste PONS'], [5, 'Jean-Baptiste PONS'], [null, 'JB']]);
    const n = await lireNegociateursARapprocher();
    expect(n.aRapprocher).toEqual([{ libelle: 'JB', nb: 1, candidats: [] }]);
    expect(n.disponible).toBe(false);
    expect((await rattacherNegociateur('JB', 5, AUTEUR)).etat).toBe('sans_schema');
  });
  it('la 432 appliquée : « Rattacher » réunit « JB » à son compte (journalisé) ; « Détacher » le rend à rapprocher (rien n’est effacé)', async () => {
    await pool.query(readFileSync('db/migrations/432_location_negociateur_alias.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/432_location_negociateur_alias.sql', 'utf8'));
    expect((await rattacherNegociateur('JB', 5, AUTEUR)).etat).toBe('ok');
    expect((await lireActivites([2026])).map((a) => a.negociateurId)).toEqual([5, 5, 5]);
    expect((await lireNegociateursARapprocher()).aRapprocher).toEqual([]);
    expect((await query(`SELECT count(*)::int AS n FROM gestion_journal WHERE action = 'location_negociateur_rattachement'`)).rows[0].n).toBe(1);
    expect((await detacherNegociateur('JB', AUTEUR)).etat).toBe('ok');
    expect((await lireActivites([2026])).map((a) => a.negociateurId)).toEqual([5, 5, null]);
    expect((await query('SELECT count(*)::int AS n, count(retire_le)::int AS r FROM gestion_location_negociateur_alias')).rows[0]).toEqual({ n: 1, r: 1 });
    await expect(query('DELETE FROM gestion_location_negociateur_alias')).rejects.toThrow(/interdit/);
  });
});
