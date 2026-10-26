import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { gardeBaseJetable } from '../../../../../../scripts/baseJetable';
import type { Categorie, Origine } from '../../../../../../lib/gestion/partieCategorie';

/**
 * ══ 🔴🔴 LOT PARTENAIRE-INTERNE-JAMAIS-UNE-CLE — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ═══════════════════════════
 *
 * R1 (Arno, 26/10/2026) : « Un contact déplacé dans le bloc Parties d'un bien prend le statut de la DERNIÈRE famille où il
 * est posé, et seulement celui-là : aucun reste d'une famille précédente. » R2 : le partenaire interne n'amène jamais de bien.
 *
 * Par la VRAIE route (`POST /api/admin/gestion/historique/parties`) et le VRAI SQL, sur l'état que la reprise automatique
 * du 04/10/2026 a laissé pour gestion.criterimmo@gmail.com sur le lot 281 (une catégorie « locataire » par défaut et une
 * carte automatique côté locataire) : Tiers indépendant → Locataire → Tiers indépendant, puis le cas de l'ancien locataire.
 *
 * 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable` (cluster jetable, schéma copié sans données).
 * Lancement : DATABASE_URL=postgresql://postgres@localhost:55432/gestion_jetable \
 *   npx vitest run --config vitest.integration.config.ts "app/(admin)/api/admin/gestion/historique/parties/deplacementSansReste.itest.ts"
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);

vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'a.jorel@sansvisavis.com' }) }));

const { POST } = await import('./route');
const { query, pool } = await import('../../../../../../lib/db/client');
const { categorieRetenue } = await import('../../../../../../lib/gestion/partieCategorie');
const { biensDesClients } = await import('../../../../../../lib/gestion/biensDesClientsRepo');

const ADHOC = 'gestion.criterimmo@gmail.com';
const LOT = '281';
const poste = async (corps: Record<string, unknown>) => {
  const r = await POST(new Request('http://local/api/admin/gestion/historique/parties', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cible: `lot-${LOT}`, ...corps }),
  }));
  const d = (await r.json()) as { etat: string; motif?: string };
  expect(d.etat, d.motif).toBe('ok');
};
const vivantesSurLeBien = async (adresse: string) => (await query<{ categorie: string; locataire_id: string | null }>(
  `SELECT categorie, locataire_id::text FROM gestion_partie_categorie WHERE retire_le IS NULL AND adresse = $1 AND lot_cle = $2 ORDER BY id`,
  [adresse, LOT])).rows;
const globales = async (adresse: string) => (await query<{ categorie: string; origine: string }>(
  `SELECT categorie, origine FROM gestion_partie_categorie WHERE retire_le IS NULL AND adresse = $1 AND lot_cle IS NULL`, [adresse])).rows;
const cartesVivantes = async (adresse: string) => (await query<{ cote: string; locataire_id: string | null }>(
  `SELECT cote, locataire_id::text FROM gestion_contact_carte WHERE retire_le IS NULL AND adresse = $1 AND lot_cle = $2 ORDER BY id`,
  [adresse, LOT])).rows;
/* La famille AFFICHÉE sur ce bien : la résolution du module pur (`categorieRetenue`) sur les deux lignes vivantes possibles
   — celle du bien et la globale. (La lecture de l'écran ne liste une adresse sans ligne sur le bien que si un mail du bien
   la porte, et la base jetable n'a aucun mail.) */
const affichee = async (adresse: string) => {
  const ligne = async (surLeBien: boolean) => (await query<{ categorie: Categorie; origine: Origine }>(
    `SELECT categorie, origine FROM gestion_partie_categorie
      WHERE retire_le IS NULL AND adresse = $1 AND ${surLeBien ? 'lot_cle = $2' : 'lot_cle IS NULL AND $2::text IS NOT NULL'}`,
    [adresse, LOT])).rows[0] ?? null;
  return categorieRetenue({ parBien: await ligne(true), globale: await ligne(false) })?.categorie ?? null;
};
const total = async () => Number((await query<{ n: string }>(
  `SELECT ((SELECT count(*) FROM gestion_partie_categorie) + (SELECT count(*) FROM gestion_contact_carte))::text AS n`)).rows[0].n);

let ancien = 0;
beforeAll(async () => {
  /* L'auteur des gestes (la base exige un compte existant derrière chaque geste signé). */
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom)
               VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL')`);
  /* Un ancien locataire d'épreuve (la catégorie et la carte d'ancien locataire le désignent par clé étrangère). */
  ancien = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise)
    VALUES ('epreuve-5', 'epreuve-5', 'ÉPREUVE Ancien', 'epreuve ancien') RETURNING id::text`)).rows[0].id);
  /* L'état laissé par la reprise automatique du 04/10/2026 (recette : catégorie n° 285, carte n° 433). */
  await query(`INSERT INTO gestion_partenaire_interne (adresse, libelle, actif) VALUES ($1, 'Comptabilité (ADHOC Gestion)', true)`, [ADHOC]);
  await query(`INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle)
               VALUES ($1, $2, 'locataire', 'defaut', 'automatique')`, [ADHOC, LOT]);
  await query(`INSERT INTO gestion_contact_carte (lot_cle, cote, adresse, origine, cree_par_libelle)
               VALUES ($1, 'locataire', $2, 'auto', 'automatique')`, [LOT, ADHOC]);
});
afterAll(async () => { await pool.end(); });

describe('R2 — le partenaire interne n’amène aucun bien, même avec la carte de la reprise encore vivante', () => {
  it('biensDesClients rend [] pour lui', async () => {
    expect(await cartesVivantes(ADHOC)).toEqual([{ cote: 'locataire', locataire_id: null }]);
    expect((await biensDesClients([ADHOC]))[ADHOC]).toEqual([]);
  });
});

describe('R1 — Tiers indépendant → Locataire → Tiers indépendant : la dernière famille, et rien d’autre', () => {
  it('→ Tiers indépendant : plus aucune ligne ni carte sur ce bien ; « indépendant » affiché', async () => {
    const avant = await total();
    await poste({ adresse: ADHOC, categorie: 'independant' });
    expect(await vivantesSurLeBien(ADHOC)).toEqual([]);
    expect(await cartesVivantes(ADHOC)).toEqual([]);
    expect(await globales(ADHOC)).toEqual([{ categorie: 'independant', origine: 'manuel' }]);
    expect(await affichee(ADHOC)).toBe('independant');
    expect(await total()).toBe(avant + 1);                      // rien n'est supprimé : une ligne de plus, les autres retirées
  });
  it('→ Locataire : la ligne du bien seule ; aucune carte créée par un glisser ; « locataire » affiché', async () => {
    await poste({ adresse: ADHOC, categorie: 'locataire' });
    expect(await vivantesSurLeBien(ADHOC)).toEqual([{ categorie: 'locataire', locataire_id: null }]);
    expect(await cartesVivantes(ADHOC)).toEqual([]);
    expect(await affichee(ADHOC)).toBe('locataire');
  });
  it('→ Tiers indépendant à nouveau : aucun reste de « locataire » sur ce bien', async () => {
    await poste({ adresse: ADHOC, categorie: 'independant' });
    expect(await vivantesSurLeBien(ADHOC)).toEqual([]);
    expect(await cartesVivantes(ADHOC)).toEqual([]);
    expect(await affichee(ADHOC)).toBe('independant');
    expect((await biensDesClients([ADHOC]))[ADHOC]).toEqual([]);
  });
});

describe('R1 — un contact d’ancien locataire déplacé ne laisse ni ligne ni carte de cet ancien locataire', () => {
  const AVOCAT = 'avocat@epreuve.test';
  it('Ancien locataire (une personne nommée) → Locataire → Tiers indépendant', async () => {
    await query(`INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle, locataire_id)
                 VALUES ($1, $2, 'ancien_locataire', 'manuel', 'a.jorel@sansvisavis.com', $3)`, [AVOCAT, LOT, ancien]);
    await query(`INSERT INTO gestion_contact_carte (lot_cle, cote, adresse, origine, cree_par_libelle, locataire_id)
                 VALUES ($1, 'ancien_locataire', $2, 'manuel', 'a.jorel@sansvisavis.com', $3)`, [LOT, AVOCAT, ancien]);
    await poste({ adresse: AVOCAT, categorie: 'locataire' });
    expect(await vivantesSurLeBien(AVOCAT)).toEqual([{ categorie: 'locataire', locataire_id: null }]);
    /* La carte SUIT le contact : celle de l'ancien locataire est retirée, une carte côté locataire la remplace. */
    expect(await cartesVivantes(AVOCAT)).toEqual([{ cote: 'locataire', locataire_id: null }]);
    await poste({ adresse: AVOCAT, categorie: 'independant' });
    expect(await vivantesSurLeBien(AVOCAT)).toEqual([]);
    expect(await cartesVivantes(AVOCAT)).toEqual([]);
  });
  it('vers « Tiers indépendant » directement depuis l’ancien locataire : sa carte ne survit plus', async () => {
    const JURISTE = 'juriste@epreuve.test';
    await query(`INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle, locataire_id)
                 VALUES ($1, $2, 'ancien_locataire', 'manuel', 'a.jorel@sansvisavis.com', $3)`, [JURISTE, LOT, ancien]);
    await query(`INSERT INTO gestion_contact_carte (lot_cle, cote, adresse, origine, cree_par_libelle, locataire_id)
                 VALUES ($1, 'ancien_locataire', $2, 'manuel', 'a.jorel@sansvisavis.com', $3)`, [LOT, JURISTE, ancien]);
    await poste({ adresse: JURISTE, categorie: 'independant' });
    expect(await vivantesSurLeBien(JURISTE)).toEqual([]);
    expect(await cartesVivantes(JURISTE)).toEqual([]);
    /* Rien n'est supprimé : les lignes retirées sont là, datées et motivées. */
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM gestion_contact_carte WHERE adresse = $1 AND retire_le IS NOT NULL AND retire_motif IS NOT NULL`, [JURISTE]);
    expect(rows[0].n).toBe('1');
  });
});
