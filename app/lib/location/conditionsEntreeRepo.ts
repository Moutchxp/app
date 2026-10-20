import { randomBytes } from 'node:crypto';
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { lignesConditions, verifierConditions, type ConditionsEntree, type ConditionsEntreeLues } from './conditionsEntree';
export type { ConditionsEntreeLues } from './conditionsEntree';
import type { Issue } from './locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES « CONDITIONS D'ENTRÉE » D'UN BAIL (Arno, 20/10/2026). IMPUR (base). ══════════════════════
 *
 * La règle est celle de `conditionsEntree.ts` (la même qu'à l'écran). Ici :
 *   · l'ÉCRITURE à l'entrée, DANS la transaction qui crée les occupations (une entrée = un jeu de conditions) ;
 *   · la LECTURE par occupation (la ligne la plus récente du bail qui la contient) ;
 *   · « MODIFIER » : une ligne de plus, même bail, mêmes occupations (table en ajout seul, migration 391).
 * Chaque saisie est écrite au journal, une ligne par locataire du bail (auteur, date).
 * 🔴 AVANT LA MIGRATION 391 : la table est SONDÉE hors transaction ; absente, l'écran le dit et la création d'un locataire
 *    se fait exactement comme avant (aucune requête ne la nomme).
 */

export function conditionsEntreeDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_conditions_entree', 'bail_cle');
}

interface LigneSql {
  id: string; bail_cle: string; occupation_ids: string[]; lot_id: string;
  depot_garantie: string; prelevement: boolean; prelevement_jour: number | null; garant_physique: boolean;
  assurance_loyers: string; assurance_precision: string | null; honoraires_locataire: string; honoraires_proprietaire: string;
  prorata_loyer_centimes: string | null; prorata_charges_centimes: string | null; depot_garantie_centimes: string | null;
  honoraires_agence_centimes: string | null; mode_reglement: string; mode_reglement_precision: string | null; commentaire: string | null;
  saisi_le: string; saisi_par_libelle: string;
}


const centimes = (x: string | null): number | null => (x === null ? null : Number(x));

function versConditions(r: LigneSql): ConditionsEntree {
  return {
    depot: r.depot_garantie as ConditionsEntree['depot'], prelevement: r.prelevement,
    jour: r.prelevement_jour === null ? null : Number(r.prelevement_jour) as 5 | 10, garant: r.garant_physique,
    assurance: r.assurance_loyers as ConditionsEntree['assurance'], assurancePrecision: r.assurance_precision,
    honorairesLocataire: r.honoraires_locataire as ConditionsEntree['honorairesLocataire'],
    honorairesProprietaire: r.honoraires_proprietaire as ConditionsEntree['honorairesProprietaire'],
    sommes: { prorataLoyer: centimes(r.prorata_loyer_centimes), prorataCharges: centimes(r.prorata_charges_centimes),
      depotGarantie: centimes(r.depot_garantie_centimes), honorairesAgence: centimes(r.honoraires_agence_centimes) },
    reglement: r.mode_reglement as ConditionsEntree['reglement'], reglementPrecision: r.mode_reglement_precision, commentaire: r.commentaire,
  };
}

const LIBELLE_JOURNAL = (c: ConditionsEntree): string => lignesConditions(c).map((l) => `${l.mot} : ${l.valeur}`).join(' ; ');

/** Écrit un jeu de conditions et sa trace au journal (une ligne par locataire). Dans la transaction de l'appelant. */
async function ecrire(q: RequeteTx, bailCle: string, occupationIds: number[], lotId: number, c: ConditionsEntree, action: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_location_conditions_entree (bail_cle, occupation_ids, lot_id, depot_garantie, prelevement, prelevement_jour,
       garant_physique, assurance_loyers, assurance_precision, honoraires_locataire, honoraires_proprietaire,
       prorata_loyer_centimes, prorata_charges_centimes, depot_garantie_centimes, honoraires_agence_centimes,
       mode_reglement, mode_reglement_precision, commentaire, saisi_par, saisi_par_libelle)
     VALUES ($1, $2::bigint[], $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [bailCle, occupationIds, lotId, c.depot, c.prelevement, c.jour, c.garant, c.assurance, c.assurancePrecision,
      c.honorairesLocataire, c.honorairesProprietaire, c.sommes.prorataLoyer, c.sommes.prorataCharges, c.sommes.depotGarantie,
      c.sommes.honorairesAgence, c.reglement, c.reglementPrecision, c.commentaire, auteur.id, auteur.libelle]);
  const { rows } = await q<{ locataire_id: string }>(
    'SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation WHERE id = ANY($1::bigint[]) ORDER BY 1', [occupationIds]);
  for (const r of rows) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, $2, NULL, $3, $4, $5, $6)`,
      [Number(r.locataire_id), action, bailCle, `conditions d’entrée du bail (lot ${lotId}) : ${LIBELLE_JOURNAL(c)}`, auteur.id, auteur.libelle]);
  }
}

/** À L'ENTRÉE : le jeu de conditions du bail qui vient d'être créé (occupations de cette entrée). Valeurs déjà vérifiées. */
export async function enregistrerConditionsEntreeDans(q: RequeteTx, occupationIds: number[], lotId: number, c: ConditionsEntree, auteur: Auteur): Promise<string> {
  const bailCle = `bail-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  await ecrire(q, bailCle, occupationIds, lotId, c, 'location_conditions_entree', auteur);
  return bailCle;
}

/** Les conditions d'entrée des occupations demandées (la plus récente ligne du bail qui contient chacune). */
export async function conditionsParOccupation(occupationIds: readonly number[]): Promise<Map<number, ConditionsEntreeLues>> {
  const sortie = new Map<number, ConditionsEntreeLues>();
  if (occupationIds.length === 0 || !(await conditionsEntreeDisponible())) return sortie;
  const { rows } = await query<LigneSql & { n: number }>(
    `SELECT DISTINCT ON (c.bail_cle) c.id::text, c.bail_cle, c.occupation_ids::text[] AS occupation_ids, c.lot_id::text,
            c.depot_garantie, c.prelevement, c.prelevement_jour, c.garant_physique, c.assurance_loyers, c.assurance_precision,
            c.honoraires_locataire, c.honoraires_proprietaire, c.prorata_loyer_centimes::text, c.prorata_charges_centimes::text,
            c.depot_garantie_centimes::text, c.honoraires_agence_centimes::text, c.mode_reglement, c.mode_reglement_precision,
            c.commentaire, c.saisi_le::text, c.saisi_par_libelle,
            (SELECT count(*)::int FROM gestion_location_conditions_entree x WHERE x.bail_cle = c.bail_cle) AS n
       FROM gestion_location_conditions_entree c
      WHERE c.occupation_ids && $1::bigint[]
      ORDER BY c.bail_cle, c.id DESC`, [[...occupationIds]]);
  for (const r of rows) {
    const conditions = versConditions(r);
    const lues: ConditionsEntreeLues = {
      bailCle: r.bail_cle, occupationIds: r.occupation_ids.map(Number), conditions, saisiLe: r.saisi_le, saisiPar: r.saisi_par_libelle,
      modifiees: r.n > 1, lignes: lignesConditions(conditions),
    };
    for (const id of lues.occupationIds) if (occupationIds.includes(id)) sortie.set(id, lues);
  }
  return sortie;
}

/**
 * « MODIFIER » dans la fiche : une NOUVELLE ligne pour le bail qui contient cette occupation (même clé, mêmes occupations).
 * Refusé si l'occupation n'a pas de conditions d'entrée (un bail antérieur à la saisie n'en a pas : rien n'est inventé).
 */
export async function modifierConditionsEntree(occupationId: number, brut: unknown, auteur: Auteur): Promise<Issue> {
  if (!(await conditionsEntreeDisponible())) return { etat: 'sans_schema' };
  const v = verifierConditions(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  return withTransaction(async (q): Promise<Issue> => {
    const { rows } = await q<{ bail_cle: string; occupation_ids: string[]; lot_id: string }>(
      `SELECT bail_cle, occupation_ids::text[] AS occupation_ids, lot_id::text FROM gestion_location_conditions_entree
        WHERE $1 = ANY(occupation_ids) ORDER BY id DESC LIMIT 1 FOR UPDATE`, [occupationId]);
    if (rows[0] === undefined) return { etat: 'refus', motif: 'Ce bail n’a pas de conditions d’entrée enregistrées.' };
    await ecrire(q, rows[0].bail_cle, rows[0].occupation_ids.map(Number), Number(rows[0].lot_id), v.valeurs, 'location_conditions_entree_modifiees', auteur);
    return { etat: 'ok', data: undefined };
  });
}
