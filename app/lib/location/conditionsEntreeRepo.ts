import { randomBytes } from 'node:crypto';
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { enCentimes, lignesConditions, verifierConditions, type ConditionsEntree, type ConditionsEntreeLues, type JourNumero } from './conditionsEntree';
import { MOTIF_SURFACE_MANQUANTE, type CalculHonoraires, type ZoneHonoraires } from './honorairesProprietaire';
export type { ConditionsEntreeLues } from './conditionsEntree';
import type { Issue } from './locationRepo';
import { ecrireLoyerDans, loyerDeLaSaisie, loyerDesOccupations } from './loyerEntreeRepo';
import { honorairesGestionDisponible } from '../gestion/schema';
import { bailDisponible, garantsDisponibles } from './bailRepo';
import { calculHonorairesDuBien } from './honorairesProprietaireRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES « CONDITIONS D'ENTRÉE » D'UN BAIL (Arno, 20/10/2026). IMPUR (base). ══════════════════════
 *
 * La règle est celle de `conditionsEntree.ts` (la même qu'à l'écran). Ici :
 *   · l'ÉCRITURE à l'entrée, DANS la transaction qui crée les occupations (une entrée = un jeu de conditions), avec la
 *     TRACE des honoraires propriétaire calculés (surface, zone, barème, tarifs, montants exacts — migration 392) ;
 *   · la LECTURE par occupation (la ligne la plus récente du bail qui la contient) ;
 *   · « MODIFIER » : une ligne de plus, même bail, mêmes occupations (table en ajout seul) ; la trace des honoraires calculés
 *     à l'entrée est REPORTÉE telle quelle (on ne recalcule pas un barème après coup).
 * Chaque saisie est écrite au journal, une ligne par locataire du bail (auteur, date).
 * 🔴 AVANT LES MIGRATIONS 391 ET 392 : sondées hors transaction ; l'une manque, l'écran le dit et la création d'un locataire
 *    se fait exactement comme avant (aucune requête ne nomme la table).
 */

/**
 * Arno (21/10/2026, migration 402) — le montant des honoraires propriétaire SAISI À LA MAIN : la marque `hono_saisi_main`. Sans
 * elle, un montant saisi ne s'enregistre pas (refus dit) ; le calcul automatique, lui, s'enregistre comme avant.
 */
export function honorairesSaisisDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_conditions_entree', 'hono_saisi_main');
}

/** Le refus d'un montant saisi à la main sans la migration 402. */
export const MOTIF_SANS_402 = 'Mise à jour de la base à appliquer (migration 402) : un montant d’honoraires propriétaire saisi à la main ne peut pas encore être enregistré.';

/** Les conditions d'entrée s'enregistrent-elles ? Il faut la table (391) ET la trace des honoraires et les jours 1 / 15 (392). */
export function conditionsEntreeDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_conditions_entree', 'hono_total_proprietaire');
}

/**
 * Arno (20/10/2026) — « au lieu de masquer tout le bloc 3, afficher le bloc avec un bandeau “Mise à jour de la base à
 * appliquer (migration NNN)” et désactiver seulement l'enregistrement des parties concernées » : ce qui manque, partie par
 * partie. `conditions` = 391 ET 392 ; `loyer` = 370 (le loyer de départ). L'entretien (379) a sa propre sonde, inchangée.
 */
export async function schemaConditionsEntree(): Promise<{ conditions: boolean; loyer: boolean; rattachements: boolean; manquantes: string[] }> {
  const avec391 = await colonneExisteMemo('gestion_location_conditions_entree', 'bail_cle');
  const avec392 = await conditionsEntreeDisponible();
  const loyer = await honorairesGestionDisponible();
  // Arno (20/10/2026, 393) : le bail, les garants et contacts rattachés aux locataires. Sans elle, la création se fait comme
  // avant ; seuls les rattachements (« Garantit : », « Contact de : ») ne s'enregistrent pas, et le bandeau le dit.
  const rattachements = await garantsDisponibles();
  const manquantes = [...(avec391 ? [] : ['391']), ...(avec392 ? [] : ['392']), ...(loyer ? [] : ['370']), ...(rattachements ? [] : ['393'])];
  return { conditions: avec392, loyer, rattachements, manquantes };
}

interface LigneSql {
  id: string; bail_cle: string; occupation_ids: string[]; lot_id: string;
  depot_garantie: string; prelevement: boolean; prelevement_jour: number | null; garant_physique: boolean;
  assurance_loyers: string; assurance_precision: string | null; honoraires_locataire: string; honoraires_proprietaire: string;
  prorata_loyer_centimes: string | null; prorata_charges_centimes: string | null; depot_garantie_centimes: string | null;
  honoraires_agence_centimes: string | null; mode_reglement: string; mode_reglement_precision: string | null; commentaire: string | null;
  saisi_le: string; saisi_par_libelle: string;
  hono_surface_m2: string | null; hono_zone: string | null; hono_bareme_id: string | null; hono_tarif_zone_m2: string | null;
  hono_tarif_edl_m2: string | null; hono_visite_bail: string | null; hono_etat_des_lieux: string | null; hono_total_proprietaire: string | null;
  hono_motif: string | null; bareme_depuis: string | null; bareme_source: string | null;
  /** Migration 393 : le bail, et la date qui a servi à choisir le barème (et si elle était supposée). */
  bail_id: string | null; hono_date_bareme: string | null; hono_date_supposee: boolean | null;
  bail_occupations: string[] | null; surface_actuelle: string | null; bail_entree: string | null;
  /** Migration 402 : le total a été saisi à la main (aucune version de barème). */
  hono_saisi_main?: boolean | null;
}

const centimes = (x: string | null): number | null => (x === null ? null : Number(x));

function versConditions(r: LigneSql): ConditionsEntree {
  return {
    depot: r.depot_garantie as ConditionsEntree['depot'], prelevement: r.prelevement,
    jour: r.prelevement_jour === null ? null : Number(r.prelevement_jour) as JourNumero, garant: r.garant_physique,
    assurance: r.assurance_loyers as ConditionsEntree['assurance'], assurancePrecision: r.assurance_precision,
    honorairesLocataire: r.honoraires_locataire as ConditionsEntree['honorairesLocataire'],
    honorairesProprietaire: r.honoraires_proprietaire as ConditionsEntree['honorairesProprietaire'],
    sommes: { prorataLoyer: centimes(r.prorata_loyer_centimes), prorataCharges: centimes(r.prorata_charges_centimes),
      depotGarantie: centimes(r.depot_garantie_centimes), honorairesAgence: centimes(r.honoraires_agence_centimes) },
    reglement: r.mode_reglement as ConditionsEntree['reglement'], reglementPrecision: r.mode_reglement_precision, commentaire: r.commentaire,
  };
}

/** La trace enregistrée → le calcul relu (celui de l'entrée, jamais refait). */
function versHonoraires(r: LigneSql): CalculHonoraires | null {
  const zone = (r.hono_zone ?? 'autre') as ZoneHonoraires;
  // La date du barème (393) ; avant elle, le jour de la saisie à défaut de mieux.
  const base = { zone, date: r.hono_date_bareme ?? r.saisi_le.slice(0, 10), dateSupposee: r.hono_date_supposee === true };
  // Arno (21/10/2026, 402) : un montant saisi à la main — relu tel quel, jamais recalculé.
  if (r.hono_saisi_main === true && r.hono_total_proprietaire !== null) return { etat: 'saisi', ...base, total: r.hono_total_proprietaire };
  if (r.hono_total_proprietaire !== null && r.hono_surface_m2 !== null && r.hono_bareme_id !== null) {
    return { etat: 'ok', ...base, surface: r.hono_surface_m2, baremeId: Number(r.hono_bareme_id), baremeDepuis: r.bareme_depuis ?? '',
      source: r.bareme_source ?? '', tarifZone: r.hono_tarif_zone_m2 ?? '0', tarifEdl: r.hono_tarif_edl_m2 ?? '0',
      visiteBail: r.hono_visite_bail ?? '0', etatDesLieux: r.hono_etat_des_lieux ?? '0', total: r.hono_total_proprietaire };
  }
  if (r.hono_motif === null) return null;
  return r.hono_motif === MOTIF_SURFACE_MANQUANTE ? { etat: 'surface_manquante', ...base, motif: r.hono_motif } : { etat: 'sans_bareme', ...base, motif: r.hono_motif };
}

/** Les colonnes de la trace, depuis un calcul. */
function colonnesHonoraires(h: CalculHonoraires | null): unknown[] {
  if (h === null) return [null, null, null, null, null, null, null, null, null];
  if (h.etat === 'saisi') return [null, h.zone, null, null, null, null, null, h.total, null];
  if (h.etat !== 'ok') return [null, h.zone, null, null, null, null, null, null, h.motif];
  return [h.surface, h.zone, h.baremeId, h.tarifZone, h.tarifEdl, h.visiteBail, h.etatDesLieux, h.total, null];
}

const LIBELLE_JOURNAL = (c: ConditionsEntree, h: CalculHonoraires | null): string =>
  lignesConditions(c, h).map((l) => `${l.mot} : ${l.valeur}${l.detail ? ` (${l.detail})` : ''}`).join(' ; ');

/** Écrit un jeu de conditions, la trace des honoraires et la ligne de journal (une par locataire). Dans la transaction de l'appelant. */
async function ecrire(q: RequeteTx, bailCle: string, occupationIds: number[], lotId: number, c: ConditionsEntree, h: CalculHonoraires | null,
  action: string, auteur: Auteur, bailId: number | null = null): Promise<void> {
  /* Arno (20/10/2026, 393) : les conditions sont portées par le BAIL (bail_id) ; `occupation_ids` (obsolète) n'est plus écrit.
     La date qui a servi à choisir le barème (et si elle était supposée) est gardée avec la trace des honoraires. */
  const avecBail = bailId !== null;
  // Arno (21/10/2026, 402) : la marque « saisi à la main », écrite seulement avec sa colonne ; sans elle, un montant saisi est refusé.
  const avec402 = await honorairesSaisisDisponible();
  if (h !== null && h.etat === 'saisi' && !avec402) throw new Error(MOTIF_SANS_402);
  await q(
    `INSERT INTO gestion_location_conditions_entree (bail_cle, occupation_ids, lot_id, depot_garantie, prelevement, prelevement_jour,
       garant_physique, assurance_loyers, assurance_precision, honoraires_locataire, honoraires_proprietaire,
       prorata_loyer_centimes, prorata_charges_centimes, depot_garantie_centimes, honoraires_agence_centimes,
       mode_reglement, mode_reglement_precision, commentaire, saisi_par, saisi_par_libelle,
       hono_surface_m2, hono_zone, hono_bareme_id, hono_tarif_zone_m2, hono_tarif_edl_m2, hono_visite_bail, hono_etat_des_lieux,
       hono_total_proprietaire, hono_motif${avecBail ? ', bail_id, hono_date_bareme, hono_date_supposee' : ''}${avec402 ? ', hono_saisi_main' : ''})
     VALUES ($1, $2::bigint[], $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21::numeric, $22, $23, $24::numeric, $25::numeric, $26::numeric, $27::numeric, $28::numeric, $29${avecBail ? ', $30, $31::date, $32' : ''}${avec402 ? `, $${avecBail ? 33 : 30}` : ''})`,
    [bailCle, avecBail ? null : occupationIds, lotId, c.depot, c.prelevement, c.jour, c.garant, c.assurance, c.assurancePrecision,
      c.honorairesLocataire, c.honorairesProprietaire, c.sommes.prorataLoyer, c.sommes.prorataCharges, c.sommes.depotGarantie,
      c.sommes.honorairesAgence, c.reglement, c.reglementPrecision, c.commentaire, auteur.id, auteur.libelle, ...colonnesHonoraires(h),
      ...(avecBail ? [bailId, h?.date ?? null, h === null ? null : h.dateSupposee] : []), ...(avec402 ? [h !== null && h.etat === 'saisi'] : [])]);
  const { rows } = await q<{ locataire_id: string }>(
    avecBail ? 'SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY 1'
      : 'SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation WHERE id = ANY($1::bigint[]) ORDER BY 1', [avecBail ? bailId : occupationIds]);
  for (const r of rows) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, $2, NULL, $3, $4, $5, $6)`,
      [Number(r.locataire_id), action, bailCle, `conditions d’entrée du bail (lot ${lotId}) : ${LIBELLE_JOURNAL(c, h)}`, auteur.id, auteur.libelle]);
  }
}

/** À L'ENTRÉE : le jeu de conditions du bail qui vient d'être créé, avec les honoraires calculés. Valeurs déjà vérifiées. */
export async function enregistrerConditionsEntreeDans(q: RequeteTx, occupationIds: number[], lotId: number, c: ConditionsEntree,
  h: CalculHonoraires | null, auteur: Auteur, bailId: number | null = null): Promise<string> {
  const bailCle = `bail-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  await ecrire(q, bailCle, occupationIds, lotId, c, h, 'location_conditions_entree', auteur, bailId);
  return bailCle;
}

const SELECT_LIGNE = `c.id::text, c.bail_cle, c.occupation_ids::text[] AS occupation_ids, c.lot_id::text,
  c.depot_garantie, c.prelevement, c.prelevement_jour, c.garant_physique, c.assurance_loyers, c.assurance_precision,
  c.honoraires_locataire, c.honoraires_proprietaire, c.prorata_loyer_centimes::text, c.prorata_charges_centimes::text,
  c.depot_garantie_centimes::text, c.honoraires_agence_centimes::text, c.mode_reglement, c.mode_reglement_precision,
  c.commentaire, c.saisi_le::text, c.saisi_par_libelle,
  c.hono_surface_m2::text, c.hono_zone, c.hono_bareme_id::text, c.hono_tarif_zone_m2::text, c.hono_tarif_edl_m2::text,
  c.hono_visite_bail::text, c.hono_etat_des_lieux::text, c.hono_total_proprietaire::text, c.hono_motif,
  b.depuis::text AS bareme_depuis, b.source AS bareme_source`;

/** Les colonnes de la 393 (bail, date du barème, occupations du bail, surface actuelle du bien), nommées seulement avec elle. */
const SELECT_393 = (avec: boolean): string => (avec
  ? `, c.bail_id::text, c.hono_date_bareme::text, c.hono_date_supposee,
     (SELECT array_agg(o.id::text ORDER BY o.id) FROM gestion_annuaire_occupation o WHERE o.bail_id = c.bail_id) AS bail_occupations,
     (SELECT lo.surface_carrez_m2::text FROM gestion_annuaire_lot lo WHERE lo.id = c.lot_id) AS surface_actuelle,
     (SELECT bl.entree::text FROM gestion_bail bl WHERE bl.id = c.bail_id) AS bail_entree`
  : `, NULL::text AS bail_id, NULL::text AS hono_date_bareme, NULL::boolean AS hono_date_supposee, NULL::text[] AS bail_occupations,
     NULL::text AS surface_actuelle, NULL::text AS bail_entree`);

/** La marque « saisi à la main » (402), nommée seulement avec elle. */
const SELECT_402 = (avec: boolean): string => (avec ? ', c.hono_saisi_main' : ', NULL::boolean AS hono_saisi_main');

/** Les conditions d'entrée des occupations demandées (la plus récente ligne du bail qui contient chacune). */
export async function conditionsParOccupation(occupationIds: readonly number[]): Promise<Map<number, ConditionsEntreeLues>> {
  const sortie = new Map<number, ConditionsEntreeLues>();
  if (occupationIds.length === 0 || !(await conditionsEntreeDisponible())) return sortie;
  // Arno (20/10/2026, 393) : les conditions du BAIL de chaque occupation ; ses occupations sont celles du bail AUJOURD'HUI
  // (un occupant ajouté plus tard au bail les voit aussi). Sans la 393 : la liste d'occupations écrite à l'entrée.
  const avecBail = await bailDisponible();
  const avec402 = await honorairesSaisisDisponible();
  const { rows } = await query<LigneSql & { n: number }>(
    `SELECT DISTINCT ON (c.bail_cle) ${SELECT_LIGNE}${SELECT_393(avecBail)}${SELECT_402(avec402)},
            (SELECT count(*)::int FROM gestion_location_conditions_entree x WHERE x.bail_cle = c.bail_cle) AS n
       FROM gestion_location_conditions_entree c
       LEFT JOIN gestion_bareme_honoraires_location b ON b.id = c.hono_bareme_id
      WHERE c.occupation_ids && $1::bigint[]${avecBail
        ? ' OR c.bail_id IN (SELECT o.bail_id FROM gestion_annuaire_occupation o WHERE o.id = ANY($1::bigint[]))' : ''}
      ORDER BY c.bail_cle, c.id DESC`, [[...occupationIds]]);
  for (const r of rows) {
    const conditions = versConditions(r);
    const honoraires = versHonoraires(r);
    const ids = (r.bail_occupations ?? r.occupation_ids ?? []).map(Number);
    // Le loyer mensuel : le loyer de départ (migration 370) du bail — la donnée de la carte « Location ».
    const loyer = await loyerDesOccupations(ids);
    const lues: ConditionsEntreeLues = {
      bailCle: r.bail_cle, occupationIds: ids, conditions, saisiLe: r.saisi_le, saisiPar: r.saisi_par_libelle,
      modifiees: r.n > 1, lignes: lignesConditions(conditions, honoraires, loyer), honoraires, loyer,
      bailId: r.bail_id === null ? null : Number(r.bail_id),
      // Arno (20/10/2026, faille 8) : la surface Carrez/Boutin du bien AUJOURD'HUI — pour proposer « Calculer les honoraires ».
      surfaceActuelle: r.surface_actuelle,
    };
    for (const id of lues.occupationIds) if (occupationIds.includes(id)) sortie.set(id, lues);
  }
  return sortie;
}

/**
 * « MODIFIER » dans la fiche : une NOUVELLE ligne pour le bail qui contient cette occupation (même clé, mêmes occupations,
 * honoraires calculés à l'entrée reportés). Refusé si l'occupation n'a pas de conditions d'entrée (rien n'est inventé).
 */
export async function modifierConditionsEntree(occupationId: number, brut: unknown, auteur: Auteur,
  /** Arno (20/10/2026, faille 8) : refaire le calcul des honoraires avec la surface ACTUELLE, au barème de la date d'entrée. */
  recalculerHonoraires = false,
  /** Arno (21/10/2026, 402) : un montant SAISI À LA MAIN n'est remplacé par le calcul qu'avec cette confirmation explicite. */
  remplacerSaisie = false): Promise<Issue> {
  if (!(await conditionsEntreeDisponible())) return { etat: 'sans_schema' };
  const avecBail = await bailDisponible();
  const v = verifierConditions(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  // Le loyer mensuel (facultatif) : réécrit sur la location seulement s'il a CHANGÉ (même fonction que la carte « Location »).
  const loyerBrut = brut !== null && typeof brut === 'object' ? (brut as Record<string, unknown>).loyer : undefined;
  const loyer = loyerBrut === undefined ? undefined : loyerDeLaSaisie(loyerBrut);
  if (loyer === null) return { etat: 'refus', motif: 'Loyer mensuel : un montant en euros, au centime (ex. 1 180,50).' };
  const avecLoyer = loyer !== undefined && (await honorairesGestionDisponible());
  const avec402 = await honorairesSaisisDisponible();
  return withTransaction(async (q): Promise<Issue> => {
    const { rows } = await q<LigneSql>(
      `SELECT ${SELECT_LIGNE}${SELECT_393(avecBail)}${SELECT_402(avec402)} FROM gestion_location_conditions_entree c
         LEFT JOIN gestion_bareme_honoraires_location b ON b.id = c.hono_bareme_id
        WHERE $1 = ANY(c.occupation_ids)${avecBail ? ' OR c.bail_id = (SELECT o.bail_id FROM gestion_annuaire_occupation o WHERE o.id = $1)' : ''}
        ORDER BY c.id DESC LIMIT 1 FOR UPDATE OF c`, [occupationId]);
    const r = rows[0];
    if (r === undefined) return { etat: 'refus', motif: 'Ce bail n’a pas de conditions d’entrée enregistrées.' };
    // Le bail de la ligne ; une ligne d'avant la 393 sans bail prend celui de l'occupation.
    let bailId: number | null = r.bail_id === null ? null : Number(r.bail_id);
    if (bailId === null && avecBail) {
      const { rows: bo } = await q<{ b: string | null }>('SELECT bail_id::text AS b FROM gestion_annuaire_occupation WHERE id = $1', [occupationId]);
      bailId = bo[0]?.b == null ? null : Number(bo[0].b);
    }
    const ids = (r.bail_occupations ?? r.occupation_ids ?? []).map(Number);
    // Les honoraires : ceux de l'entrée, REPORTÉS ; refaits seulement sur demande (surface connue depuis), au barème de la
    // date d'entrée — jamais automatiquement.
    let h = versHonoraires(r);
    if (recalculerHonoraires) {
      // 🔴 Un montant saisi à la main n'est JAMAIS remplacé sans confirmation explicite (Arno, 21/10/2026). Refusé AVANT toute écriture.
      if (h !== null && h.etat === 'saisi' && !remplacerSaisie) {
        return { etat: 'refus', motif: 'Ce montant d’honoraires propriétaire a été saisi à la main : confirmez son remplacement par le calcul.' };
      }
      // La date d'entrée du bail ; à défaut, celle qui avait servi au barème ; à défaut, le jour (dit « supposée »).
      const date = r.bail_entree ?? r.hono_date_bareme ?? null;
      h = await calculHonorairesDuBien(Number(r.lot_id), date);
      if (h === null || h.etat !== 'ok') return { etat: 'refus', motif: h === null || h.etat === 'saisi' ? 'Ce bien n’existe plus.' : `${h.motif} : rien n’est recalculé.` };
    }
    await ecrire(q, r.bail_cle, ids, Number(r.lot_id), v.valeurs, h, recalculerHonoraires ? 'location_honoraires_recalcules' : 'location_conditions_entree_modifiees', auteur, bailId);
    if (avecLoyer && loyer !== undefined) {
      // L'occupation qui porte déjà le loyer (avant la 393) ; avec la 393, n'importe quelle occupation du bail (le loyer est au bail).
      const { rows: porteuse } = await q<{ id: string; lot_id: string; loyer: string | null; provisions: string | null }>(
        `SELECT o.id::text, o.lot_id::text, c.loyer_hc::text AS loyer, c.provisions::text AS provisions
           FROM gestion_annuaire_occupation o
           LEFT JOIN LATERAL (SELECT x.id, x.loyer_hc, x.provisions FROM gestion_location_conditions x
                               WHERE ${avecBail ? '(x.bail_id = o.bail_id OR (o.bail_id IS NULL AND x.occupation_id = o.id))' : 'x.occupation_id = o.id'}
                               ORDER BY x.id DESC LIMIT 1) c ON true
          WHERE o.id = ANY($1::bigint[])
          ORDER BY (c.loyer_hc IS NOT NULL OR c.provisions IS NOT NULL) DESC, (o.lot_id = $2) DESC, array_position($1::bigint[], o.id) LIMIT 1`,
        [ids, Number(r.lot_id)]);
      const p = porteuse[0];
      const avant = p === undefined ? null : { principal: enCentimes(p.loyer) ?? null, provisions: enCentimes(p.provisions) ?? null };
      const change = avant === null ? (loyer.principal !== null || loyer.provisions !== null)
        : avant.principal !== loyer.principal || avant.provisions !== loyer.provisions;
      if (p !== undefined && change) await ecrireLoyerDans(q, Number(p.id), Number(p.lot_id), loyer, auteur, true);
    }
    return { etat: 'ok', data: undefined };
  });
}
