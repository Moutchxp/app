import 'server-only';
import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
// 🔴 Arno (26/10/2026, 430) — le bail d'un locataire en place à la prise en gestion (jamais un bail signé par l'agence).
import { bailEnPlace } from '../rentreOccupeRepo';
import { familleDuLot, sqlLotParking } from '../bienComplet';
import {
  type ActiviteVerifiee, type Apporteur, type BaremeApporteur, type CategoriePrime, type ChampsCommerciaux, type CollegueDate, type Origine,
  type RegleCommission, type TypeApporteur, dateIsoValide, lireMontant, lireTauxPourcent, verifierActivite, verifierApporteur, verifierCommercial,
  verifierCoordonnees, verifierRegle, verifierRetrocession, DEPUIS_TOUJOURS,
  casGestionDuBien, motPrimeDejaVersee, typeDeBienDesFiches, sqlPorteUnePrime, type CasGestion, categoriePrimeDeFamille, type ModeApporteur,
  type RemunerationCollegue, verifierRemuneration, aujourdhuiParis, libelleRegleApporteur, libelleRemuneration, versionsEffectives,
  collegueADate, depuisLibelle, remunerationADate, tauxVide, MOT_TAUX_LOCATION_VIDE, MOT_TAUX_GESTION_VIDE,
} from './suivi';
import { colonnesTrace } from '../../gestion/traceJournal';
import { changementsLigne, ECRAN_SUIVI_MOIS, famillesDesLots, motStatutBien, type EtatCommercialLu } from './ligneSuivi';
import { modifierEncartBien } from '../encartBienRepo';
import { NATURES_BIEN, type NatureBien } from './tableauBord';
import { jourParis } from '../../temps/paris';
import { motifConflitFiche } from '../../gestion/traceFiche';
import { changementsFiche, ficheDe, verifierFiche } from './ficheApporteur';
import { passageInterneDisponible, passerEnInterne, type IssuePassage } from './passageInterne';

/** 422 — « Passer en interne » peut-il s'enregistrer (date du passage, entité de journal) ? */
export const passageDisponible = (): Promise<boolean> => passageInterneDisponible(query);
import { honorairesGestionDisponible } from '../../gestion/schema';
import { lireReglages } from '../../gestion/honorairesGestionRepo';
import { proposerTaux } from '../../gestion/honorairesGestion';
import { bailDisponible } from '../bailRepo';
import { origineDuBien } from '../origineProprietaireRepo';
import { lireRegleAnnexes, principalDeLAnnexe } from './annexesGestionRepo';
import type { AnnexeLouee } from './annexesGestion';
import type { OrigineDuBien } from '../origineProprietaire';
import { unifierNegociateurs } from './negociateurIdentite';
import { lireAliasNegociateurs, lireComptesNegociateurs } from './negociateurIdentiteRepo';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : ACCÈS À LA BASE (Arno, 22/10/2026, migration 406) ════════════════════════════════════
 * Référentiel des apporteurs (taux et coûts fixes datés), règle de commission datée, rétrocessions, et l'ACTIVITÉ : une ligne
 * par bail signé. Tout est en AJOUT : une version de barème ne s'efface ni ne se corrige en arrière ; une rétrocession
 * s'annule (marque), jamais supprimée. Sans la migration 406 : `suiviDisponible()` est faux et rien n'est lu ni écrit.
 */
interface Auteur { id: number | null; libelle: string }
export type Reponse<T = unknown> = { etat: 'ok'; data?: T } | { etat: 'refus'; motif: string } | { etat: 'indisponible'; motif: string };
const INDISPONIBLE: Reponse<never> = { etat: 'indisponible', motif: 'La mise à jour de la base (migration 406) n’est pas encore appliquée.' };
const num = (v: unknown): number => Number(v);
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/**
 * 🔴 Arno (24/10/2026) — une version « depuis toujours » : le JOUR de son enregistrement (à Paris) et son auteur. Ce jour (`toujoursLe`)
 * dit quels dossiers elle couvre ; sa colonne `depuis` n'est qu'une clé technique (voir `SQL_DEPUIS_TOUJOURS`).
 */
const toujoursDe = (r: { saisi_jour?: string | null; saisi_par_libelle?: string | null; depuis: unknown }): { toujoursLe: string; saisiPar?: string } => ({
  toujoursLe: r.saisi_jour ? String(r.saisi_jour).slice(0, 10) : iso(r.depuis), ...(r.saisi_par_libelle ? { saisiPar: r.saisi_par_libelle } : {}) });
/**
 * 🔴 Arno (24/10/2026) — LA CLÉ TECHNIQUE D'UNE VERSION « DEPUIS TOUJOURS ». La table interdit deux versions d'un apporteur à la même date
 * (`UNIQUE (apporteur_id, depuis)`) : datée du jour, une « depuis toujours » était REFUSÉE dès qu'une version existait déjà ce jour-là
 * (COHEN Michel : la version 20 % du 24/10, puis « 0 % depuis toujours » le même jour → refus). Elle prend donc une date hors calendrier
 * utile — le 1er janvier de l'an 1, puis le 2, … (une par version « depuis toujours ») ; son jour d'enregistrement est `saisi_le`. Le calcul
 * ne lit jamais cette date (`versionsEffectives` la date « depuis toujours » et garde `toujoursLe`). `$1` : l'apporteur.
 */
const SQL_DEPUIS_TOUJOURS = (table: 'gestion_location_apporteur_bareme' | 'gestion_location_apporteur_remuneration'): string =>
  `(SELECT DATE '0001-01-01' + count(*)::int FROM ${table} WHERE apporteur_id = $1 AND toujours)`;
/**
 * 🔴 Arno (24/10/2026) — une colonne `date` en « AAAA-MM-JJ ». Les requêtes de ce fichier la lisent en TEXTE (`depuis::text`) ; une `Date`
 * (lue à minuit de PARIS par db/typesDate) donne son jour civil À PARIS. Jamais `toISOString()` : il la reculait d'un jour (la version du
 * 24/10/2026 s'affichait « depuis le 23/10/2026 », une rétrocession d'août comptait en juillet, une règle commençait la veille).
 */
const iso = (v: unknown): string => (v instanceof Date ? jourParis(v) : String(v).slice(0, 10));

/**
 * 🔴 Arno (24/10/2026) — la migration 413 (commission d'apporteur « One shot » / « Récurrent », part location + part gestion) est-elle
 * appliquée ? Sans elle : les règles se lisent « One shot — gestion 0 % », rien de la part gestion n'est enregistré ni compté.
 */
export function commissionGestionDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'taux_gestion_bien_ht');
}

/**
 * 413 — LE TAUX DE GESTION HT DU BIEN (en %, ex. 4,5) : celui des conditions du bail s'il en a (écrites à l'entrée du locataire),
 * sinon ce que la carte « Location » propose — location précédente du lot › taux WIPPIMMO › réglage agence (`proposerTaux`).
 * null : sans la migration 370 (rien n'est inventé).
 */
export async function tauxGestionDuBien(q: typeof query, lotId: number, bailId: number | null): Promise<number | null> {
  if (!(await honorairesGestionDisponible())) return null;
  const avecBail = await bailDisponible();
  if (bailId !== null) {
    const { rows } = await q<{ t: string }>(
      `SELECT x.taux_gestion_ht::text AS t FROM gestion_location_conditions x
        WHERE ${avecBail ? 'x.bail_id = $1 OR ' : ''}x.occupation_id IN (SELECT o.id FROM gestion_annuaire_occupation o WHERE o.bail_id = $1)
        ORDER BY x.id DESC LIMIT 1`, [bailId]);
    if (rows[0] !== undefined) return Number(rows[0].t);
  }
  const { rows } = await q<{ precedent: string | null; wippimmo: string | null }>(
    `SELECT (SELECT x.taux_gestion_ht::text FROM gestion_annuaire_occupation o
               JOIN gestion_location_conditions x ON ${avecBail ? '(x.bail_id = o.bail_id OR (o.bail_id IS NULL AND x.occupation_id = o.id))' : 'x.occupation_id = o.id'}
              WHERE o.lot_id = $1 ORDER BY o.entree DESC NULLS LAST, x.id DESC LIMIT 1) AS precedent,
            (SELECT taux_honos_wippimmo::text FROM gestion_annuaire_lot WHERE id = $1) AS wippimmo`, [lotId]);
  const r = rows[0];
  const reglages = await lireReglages(q);
  return proposerTaux({ precedent: r?.precedent == null ? null : Number(r.precedent), wippimmo: r?.wippimmo == null ? null : Number(r.wippimmo), reglage: reglages.tauxDefautHt }).taux;
}

/**
 * 🔴 Arno (24/10/2026) — la migration 419 (apporteurs INTERNES liés à un compte, durée du récurrent, rémunération du collègue de
 * rattachement) est-elle appliquée ? Sans elle : tout apporteur est externe, le récurrent est à durée indéterminée, aucun collègue
 * n'est rémunéré ; les gestes qui en ont besoin sont refusés avec ce motif.
 */
export function interneDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_apporteur', 'compte_id');
}
/** 420 — une version « depuis toujours » (règle de l'apporteur, rémunération du collègue) peut-elle s'enregistrer ? */
export function toujoursDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_apporteur_bareme', 'toujours');
}
const MOT_SANS_420 = 'Mise à jour de la base à appliquer (migration 420) : « Depuis toujours » ne peut pas encore être enregistré.';

/**
 * 420 — le JOURNAL d'une version « depuis toujours » (compte, session et écran par la trace) : ce qu'elle remplace → ce qu'elle pose.
 * Exige l'entité « location_apporteur » (419) : sans elle, rien n'est écrit (le geste est refusé avant).
 */
async function journaliserToujours(q: typeof query, o: { apporteurId: number; action: string; champ: string; avant: string; apres: string; auteur: Auteur }): Promise<void> {
  const t = await colonnesTrace({ sujet: 'apporteur', champ: o.champ }, 8);
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
     VALUES ('location_apporteur', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
    [o.apporteurId, o.action, o.avant, o.apres, `${o.champ} remplacé(e) depuis toujours : ${o.avant} → ${o.apres} (versions précédentes conservées)`, o.auteur.id, o.auteur.libelle, ...t.valeurs]);
}
async function journalApporteurDisponible(): Promise<boolean> {
  const { rows } = await query<{ def: string | null }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass`);
  return (rows[0]?.def ?? '').includes("'location_apporteur'");
}

const MOT_SANS_419 = 'Mise à jour de la base à appliquer (migration 419) : apporteurs internes, durée du récurrent et rémunération du collègue ne peuvent pas encore être enregistrés.';

/** Arno (24/10/2026) — la migration 414 (nom de famille et prénom des apporteurs, séparés) est-elle appliquée ? */
export function nomPrenomDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_apporteur', 'nom_famille');
}

/** La migration 406 est-elle appliquée ? (sondé hors transaction, mémorisé). */
export function suiviDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'date_signature');
}

/** La migration 407 (origine du contact, annuaire des apporteurs rattachés à un collègue, choix de prime) est-elle appliquée ? */
export function annuaireDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'origine_contact');
}

/** 🔴 Arno (25/10/2026) — la 424 est-elle appliquée (« Statut du bien » validé à la main sur la ligne) ? */
export function statutBienManuelDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'statut_bien_manuel');
}

/**
 * Arno (24/10/2026) — la migration 412 (la prime d'un LOCAL : montant dans la règle, catégorie « local » admise) est-elle appliquée ?
 * Sans elle : le montant local se lit comme celui du logement (vide), et une affaire « Local » s'enregistre en « logement » — le même
 * montant, la base n'admettant pas encore la valeur.
 */
export function primeLocalDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_commission_regle', 'prime_gestion_local');
}
/** La catégorie ENREGISTRABLE : « local » seulement avec la 412. */
async function categorieEnregistrable(c: CategoriePrime): Promise<CategoriePrime> {
  return c === 'local' && !(await primeLocalDisponible()) ? 'logement' : c;
}

/**
 * Arno (24/10/2026) — la migration 415 (origine « Propriétaire déjà client » admise) est-elle appliquée ? Lu sur la contrainte de la
 * liste ; une réponse positive est retenue (une migration ne se défait pas), une négative est relue à chaque appel.
 */
let dejaClientVu = false;
export async function origineDejaClientDisponible(): Promise<boolean> {
  if (dejaClientVu) return true;
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_activite_origine_contact_liste_chk'
                     AND pg_get_constraintdef(oid) LIKE '%proprietaire_deja_client%') AS ok`);
  dejaClientVu = rows[0]?.ok === true;
  return dejaClientVu;
}

/** Arno (24/10/2026) — la migration 411 (origine « Personnalisé » et son texte) est-elle appliquée ? */
export function personnalisableDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
}

/**
 * ══ 🔴🔴 Arno (24/10/2026) — UNE SEULE PRIME DE NOUVELLE GESTION PAR BIEN, DANS TOUTE SA VIE DE GESTION ═══════════════════════
 * « Un bien ne peut générer qu'UNE SEULE prime de nouvelle gestion dans toute sa vie de gestion, y compris s'il sort puis revient en
 * gestion. » La première affaire (non annulée) du bien qui porte une prime — même règle que `primeDe` (`sqlPorteUnePrime`), qu'elle
 * soit saisie ou reprise du fichier — en dehors du bail ou de la ligne qu'on écrit. `null` : aucune.
 * ⚠️ UNE LIGNE REPRISE DU FICHIER SANS BIEN RAPPROCHÉ (`lot_id` vide) n'est rattachée à aucun bien : elle ne peut pas être reconnue.
 */
export async function primeDejaVersee(q: typeof query, lotId: number, exclure: { bailId?: number | null; activiteId?: number | null } = {}): Promise<{ date: string; bail: string } | null> {
  const modes = await annuaireDisponible();
  const { rows } = await q<{ date_signature: string; bail: string }>(
    `SELECT a.date_signature::text AS date_signature,
            coalesce(nullif(btrim(a.libelle_locataire), ''), CASE WHEN a.bail_id IS NULL THEN 'repris du fichier' ELSE 'n° ' || a.bail_id END) AS bail
       FROM gestion_location_activite a
      WHERE a.lot_id = $1 AND a.annule_le IS NULL AND ${sqlPorteUnePrime('a', modes)}
        AND ($2::bigint IS NULL OR a.bail_id IS DISTINCT FROM $2::bigint) AND ($3::bigint IS NULL OR a.id <> $3::bigint)
      ORDER BY a.date_signature, a.id LIMIT 1`, [lotId, exclure.bailId ?? null, exclure.activiteId ?? null]);
  return rows[0] ? { date: rows[0].date_signature.slice(0, 10), bail: rows[0].bail } : null;
}
export const MOT_PARKING_SEUL = 'Type de bien « Parking » : seulement quand le seul lot loué est un parking (pas de logement ni de local).';
const MOT_UNE_SEULE_PRIME = 'un bien ne génère qu’une seule prime de nouvelle gestion dans toute sa vie de gestion.';

// ── Apporteurs ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function lireApporteurs(): Promise<Apporteur[]> {
  if (!(await suiviDisponible())) return [];
  const avecAnnuaire = await annuaireDisponible();
  const avecGestion = await commissionGestionDisponible();
  const avecNomPrenom = await nomPrenomDisponible();
  const avec419 = await interneDisponible();
  const avec420 = await toujoursDisponible();
  const avec421 = await ficheIdentiteDisponible();
  const avec422 = await colonneExisteMemo('gestion_location_apporteur', 'interne_depuis');
  const [a, b, c, rem] = await Promise.all([
    query<{ id: string; nom: string; type: TypeApporteur; archive_le: Date | null; societe: string | null; telephone: string | null; email: string | null;
      nom_famille: string | null; prenom: string | null; compte_id: string | null; civilite: string | null; adresse: string | null; notes: string | null;
      telephones_autres: string[] | null; emails_autres: string[] | null; version: string | null; compte_libelle: string | null; compte_identifiant: string | null; interne_depuis: string | null }>(
      `SELECT id, nom, type, archive_le, ${avecAnnuaire ? 'societe, telephone, email' : 'NULL::text AS societe, NULL::text AS telephone, NULL::text AS email'},
              ${avecNomPrenom ? 'nom_famille, prenom' : 'NULL::text AS nom_famille, NULL::text AS prenom'},
              ${avec419 ? 'compte_id' : 'NULL::bigint AS compte_id'},
              ${avec421 ? 'civilite, adresse, notes, telephones_autres, emails_autres' : 'NULL::text AS civilite, NULL::text AS adresse, NULL::text AS notes, NULL::text[] AS telephones_autres, NULL::text[] AS emails_autres'},
              ${avecAnnuaire ? 'modifie_le::text' : 'NULL::text'} AS version,
              ${avec422 ? 'interne_depuis::text' : 'NULL::text'} AS interne_depuis,
              ${avec419 ? `(SELECT coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) FROM admin_utilisateur u WHERE u.id = gestion_location_apporteur.compte_id) AS compte_libelle,
              (SELECT u.identifiant FROM admin_utilisateur u WHERE u.id = gestion_location_apporteur.compte_id) AS compte_identifiant`
    : 'NULL::text AS compte_libelle, NULL::text AS compte_identifiant'}
         FROM gestion_location_apporteur ORDER BY lower(nom), id`),
    // 🔴 Arno (24/10/2026) — le coût fixe mensuel n'existe pas dans l'organisation : ni lu, ni calculé (la colonne reste, inutilisée).
    query<{ id: string; apporteur_id: string; depuis: string; taux: string; mode: string | null; taux_gestion: string | null; duree_annees: number | null; toujours: boolean | null;
      saisi_jour?: string | null; saisi_par_libelle?: string | null }>(
      `SELECT id, apporteur_id, depuis::text AS depuis, taux, ${avecGestion ? 'mode, taux_gestion' : 'NULL::text AS mode, NULL::numeric AS taux_gestion'},
              ${avec419 ? 'duree_annees' : 'NULL::int AS duree_annees'}, ${avec420 ? 'toujours' : 'false AS toujours'},
              to_char(saisi_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS saisi_jour, saisi_par_libelle
         FROM gestion_location_apporteur_bareme ORDER BY depuis, id`),
    avecAnnuaire
      ? query<{ apporteur_id: string; depuis: string | null; collegue_id: string | null; collegue_libelle: string }>(
        'SELECT apporteur_id, depuis::text AS depuis, collegue_id, collegue_libelle FROM gestion_location_apporteur_collegue ORDER BY depuis NULLS FIRST, id')
      : Promise.resolve({ rows: [] as { apporteur_id: string; depuis: string | null; collegue_id: string | null; collegue_libelle: string }[] }),
    avec419
      ? query<{ id: string; apporteur_id: string; depuis: string; remunere: boolean; mode: string; taux: string; taux_gestion: string; duree_annees: number | null; toujours: boolean | null;
        saisi_jour?: string | null; saisi_par_libelle?: string | null }>(
        `SELECT id, apporteur_id, depuis::text AS depuis, remunere, mode, taux, taux_gestion, duree_annees, ${avec420 ? 'toujours' : 'false AS toujours'},
                to_char(saisi_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS saisi_jour, saisi_par_libelle
           FROM gestion_location_apporteur_remuneration ORDER BY depuis, id`)
      : Promise.resolve({ rows: [] as { id: string; apporteur_id: string; depuis: string; remunere: boolean; mode: string; taux: string; taux_gestion: string; duree_annees: number | null; toujours: boolean | null }[] }),
  ]);
  const baremes = new Map<number, BaremeApporteur[]>();
  for (const r of b.rows) {
    const id = num(r.apporteur_id);
    // 413 — une règle d'avant (ou sans la 413) se lit « One shot — gestion 0 % ».
    baremes.set(id, [...(baremes.get(id) ?? []), { depuis: iso(r.depuis), taux: num(r.taux),
      mode: (r.mode === 'recurrent' ? 'recurrent' : 'one_shot') as ModeApporteur, tauxGestion: r.taux_gestion === null ? 0 : num(r.taux_gestion),
      // 419 — la durée du récurrent ; null : « Indéterminée » (toutes les règles d'avant).
      dureeAnnees: r.duree_annees === null || r.duree_annees === undefined ? null : num(r.duree_annees),
      // 420 — l'ordre d'enregistrement et « depuis toujours » (une version qui remplace celles d'avant dans le calcul).
      ordre: r.id === undefined ? undefined : num(r.id), ...(r.toujours === true ? { toujours: true, ...toujoursDe(r) } : {}) }]);
  }
  const remunerations = new Map<number, RemunerationCollegue[]>();
  for (const r of rem.rows) {
    const id = num(r.apporteur_id);
    remunerations.set(id, [...(remunerations.get(id) ?? []), { depuis: iso(r.depuis), remunere: r.remunere === true, mode: (r.mode === 'recurrent' ? 'recurrent' : 'one_shot') as ModeApporteur,
      taux: num(r.taux), tauxGestion: num(r.taux_gestion), dureeAnnees: r.duree_annees === null ? null : num(r.duree_annees),
      ordre: r.id === undefined ? undefined : num(r.id), ...(r.toujours === true ? { toujours: true, ...toujoursDe(r) } : {}) }]);
  }
  const collegues = new Map<number, CollegueDate[]>();
  for (const r of c.rows) {
    const id = num(r.apporteur_id);
    collegues.set(id, [...(collegues.get(id) ?? []), { depuis: r.depuis === null ? DEPUIS_TOUJOURS : iso(r.depuis), collegueId: numOuNull(r.collegue_id), collegueLibelle: r.collegue_libelle }]);
  }
  return a.rows.map((r) => ({
    id: num(r.id), nom: r.nom, type: r.type, archive: r.archive_le !== null, baremes: baremes.get(num(r.id)) ?? [],
    // 414 — null : pas encore séparés (la séparation est proposée à l'affichage) ; '' : « pas une personne ».
    nomFamille: r.nom_famille, prenom: r.prenom,
    ...(avecAnnuaire ? { societe: r.societe, telephone: r.telephone, email: r.email, collegues: collegues.get(num(r.id)) ?? [] } : {}),
    // 419 — interne (son compte) ; la rémunération du collègue (versions datées, vide : aucune).
    compteId: numOuNull(r.compte_id), remunerations: remunerations.get(num(r.id)) ?? [],
    // 421 — la fiche d'identité ; la version (dernière modification) ; le compte d'un interne.
    civilite: r.civilite ?? null, adresse: r.adresse ?? null, notes: r.notes ?? null, telephonesAutres: r.telephones_autres ?? [], emailsAutres: r.emails_autres ?? [],
    version: r.version ?? null, compteLibelle: r.compte_libelle ?? null, compteIdentifiant: r.compte_identifiant ?? null,
    // 422 — le jour du passage en interne (les dossiers d'avant gardent collègue et rémunération du collègue).
    interneDepuis: r.interne_depuis ? r.interne_depuis.slice(0, 10) : null,
  }));
}

/** Le libellé d'un compte (« Prénom Nom »), ou null s'il n'existe pas. */
async function libelleCompte(q: typeof query, id: number): Promise<string | null> {
  const { rows } = await q<{ libelle: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant, '') AS libelle FROM admin_utilisateur WHERE id = $1`, [id]);
  return rows[0]?.libelle ?? null;
}

/** La 409 est-elle appliquée (date d'effet d'un rattachement facultative : « depuis toujours ») ? */
export async function depuisToujoursDisponible(): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'gestion_location_apporteur_collegue' AND column_name = 'depuis' AND is_nullable = 'YES'`);
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * 🔴 LES LISTES DE COLLÈGUES — DEUX RÈGLES (Arno, 24/10/2026, après 56700ffb) :
 *   · `lireComptesInterface` — « Collègue » (origine « Collègue directement »), collègue de rattachement d'un apporteur, feuille du mois :
 *     TOUS les comptes de l'interface d'administration, quels que soient leur profil et leurs droits ;
 *   · `lireNegociateurs` — « Négociateur » (et les rétrocessions, qui sont les siennes) : les comptes qui ont ACCÈS À LA TUILE
 *     LOCATION (droit `perm_location`) OU un profil ADMINISTRATEUR. Sans la colonne du droit Location, la tuile est réservée aux
 *     administrateurs (`exigerLocation`) : la liste aussi.
 * Triés par NOM. Les comptes désactivés sont rendus marqués `actif: false` : la liste (`ListeChoix`) ne les propose jamais, et ne
 * montre l'un d'eux, « désactivé », que s'il est déjà le choix en cours.
 */
export async function lireNegociateurs(): Promise<Negociateur[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? ' OR u.perm_location IS TRUE' : '';
  const { rows } = await query<{ id: string; libelle: string; actif: boolean }>(
    `SELECT u.id, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant, 'compte ' || u.id) AS libelle, u.actif
       FROM admin_utilisateur u
      WHERE u.role = 'administrateur'${location}
      ORDER BY lower(coalesce(nullif(btrim(u.nom), ''), u.prenom, u.identifiant, '')), lower(coalesce(u.prenom, '')), u.id`);
  return rows.map((r) => ({ id: num(r.id), libelle: r.libelle, actif: r.actif === true }));
}

/**
 * 🔴 Arno (24/10/2026) — LES COMPTES DE L'INTERFACE : la SEULE source de toutes les listes de collègues (panneau Rattachement, « Passer
 * en interne », collègue de rattachement de Nouveau locataire / Dossier de location, feuille du mois, annuaire). Un collègue = toute
 * personne qui a un compte d'accès, QUELS QUE SOIENT son profil, ses droits et ses tuiles (Location, Gestion, administrateur, ou
 * aucune) : AUCUN filtre ici. Le seul retrait est fait par la liste : un compte désactivé (`actif: false`) n'est proposé que s'il est
 * déjà la valeur enregistrée, avec la mention « compte désactivé ».
 */
export async function lireComptesInterface(): Promise<Negociateur[]> {
  const { rows } = await query<{ id: string; libelle: string; actif: boolean }>(
    `SELECT u.id, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant, 'compte ' || u.id) AS libelle, u.actif
       FROM admin_utilisateur u
      ORDER BY lower(coalesce(nullif(btrim(u.nom), ''), u.prenom, u.identifiant, '')), lower(coalesce(u.prenom, '')), u.id`);
  return rows.map((r) => ({ id: num(r.id), libelle: r.libelle, actif: r.actif === true }));
}

/** Nouvel apporteur + son premier taux daté. Un nom déjà pris (hors archivés) est refusé : jamais de doublon. */
export async function creerApporteur(brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const avecAnnuaire = await annuaireDisponible();
  // 407 : un nouvel apporteur EXTERNE a TOUJOURS son collègue de rattachement (la reprise du fichier seule les crée « à rattacher »).
  // 🔴 419 : un INTERNE est lié à son compte, rattaché à personne.
  const v = verifierApporteur(brut, { collegueObligatoire: avecAnnuaire });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const avec419 = await interneDisponible();
  if (!avec419 && (v.compteId !== null || v.dureeAnnees !== null)) return { etat: 'refus', motif: MOT_SANS_419 };
  const b = (brut ?? {}) as Record<string, unknown>;
  // Arno (23/10/2026, 409) — « Depuis toujours » proposé aussi à la création (le rattachement couvre alors tout l'historique).
  const toujours = v.compteId === null && b.depuisToujours === true;
  if (toujours && !(await depuisToujoursDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 409) n’est pas encore appliquée : « Depuis toujours » n’est pas encore possible.' };
  return withTransaction(async (q) => {
    // 419 — le nom d'un interne est celui de son COMPTE (jamais saisi) ; un compte n'est l'apporteur qu'une fois.
    const compte = v.compteId === null ? null : await libelleCompte(q as typeof query, v.compteId);
    if (v.compteId !== null && compte === null) return { etat: 'refus', motif: 'Le compte de l’apporteur interne est inconnu.' } as const;
    if (v.compteId !== null) {
      const lie = await q<{ nom: string }>('SELECT nom FROM gestion_location_apporteur WHERE compte_id = $1 AND archive_le IS NULL', [v.compteId]);
      if (lie.rows.length > 0) return { etat: 'refus', motif: `Ce compte est déjà l’apporteur interne « ${lie.rows[0].nom} ».` } as const;
    }
    const nom = compte ?? v.nom;
    const collegue = v.collegueId === null ? null : await libelleCompte(q as typeof query, v.collegueId);
    if (avecAnnuaire && v.compteId === null && collegue === null) return { etat: 'refus', motif: 'Le collègue de rattachement est inconnu.' } as const;
    const deja = await q<{ id: string }>(
      'SELECT id FROM gestion_location_apporteur WHERE lower(btrim(nom)) = lower(btrim($1)) AND archive_le IS NULL', [nom]);
    if (deja.rows.length > 0) return { etat: 'refus', motif: `L’apporteur « ${nom} » existe déjà.` } as const;
    const { rows } = avecAnnuaire
      ? await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle, societe, telephone, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [nom, v.type, auteur.libelle, v.societe, v.telephone, v.email])
      : await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle) VALUES ($1, $2, $3) RETURNING id', [nom, v.type, auteur.libelle]);
    const id = num(rows[0].id);
    if (v.compteId !== null) await q('UPDATE gestion_location_apporteur SET compte_id = $2 WHERE id = $1', [id, v.compteId]);
    if (avecAnnuaire && collegue !== null) {
      await q('INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5)',
        [id, toujours ? null : v.depuis, v.collegueId, collegue, auteur.libelle]);
    }
    // 🔴 Arno (29/10/2026, lot AC Transaction) — la création est JOURNALISÉE (le journal des apporteurs, s'il existe), d'où qu'elle vienne.
    if (await journalApporteurDisponible()) {
      const tr = await colonnesTrace({ sujet: 'apporteur', champ: 'Création' }, 7);
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${tr.colonnes})
         VALUES ('location_apporteur', $1, 'location_apporteur_cree', $2, $3, $4, $5, $6${tr.marques})`,
        [id, null, nom, `Apporteur « ${nom} » créé${b.origine === 'transaction' ? ' depuis la Transaction (choix de l’apporteur d’un compromis)' : ''}`, auteur.id, auteur.libelle, ...tr.valeurs]);
    }
    await ((await commissionGestionDisponible())
      ? q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle, mode, taux_gestion${avec419 ? ', duree_annees' : ''})
           VALUES ($1, $2, $3, $4, $5, $6, $7${avec419 ? ', $8' : ''})`, [id, v.depuis, v.taux, 0, auteur.libelle, v.mode, v.tauxGestion, ...(avec419 ? [v.dureeAnnees] : [])])
      : q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle)
           VALUES ($1, $2, $3, $4, $5)`, [id, v.depuis, v.taux, 0, auteur.libelle]));
    return { etat: 'ok', data: { id } } as const;
  });
}

/**
 * 🔴 Arno (24/10/2026, 419) — « création ou modification d'un externe refusée sans collègue » : le motif si l'apporteur est un EXTERNE
 * sans aucun collègue de rattachement (null : interne, ou rattaché). Rattacher d'abord (« Rattacher » dans la fiche).
 */
async function refusExterneSansCollegue(q: typeof query, id: number): Promise<string | null> {
  if (!(await annuaireDisponible())) return null;
  const avec419 = await interneDisponible();
  const { rows } = await q<{ externe: boolean; rattache: boolean }>(
    `SELECT ${avec419 ? 'a.compte_id IS NULL' : 'true'} AS externe,
            EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue c WHERE c.apporteur_id = a.id) AS rattache
       FROM gestion_location_apporteur a WHERE a.id = $1`, [id]);
  const r = rows[0];
  if (r === undefined) return 'Apporteur inconnu.';
  return r.externe && !r.rattache ? 'Partenaire externe « à rattacher » : rattachez-le d’abord à un collègue (bloc « Collègue de rattachement » de la fiche), puis enregistrez.' : null;
}

/** 419 — la rémunération du collègue de rattachement d'un EXTERNE : une nouvelle VERSION datée (jamais réécrite). */
export async function ajouterRemunerationCollegue(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await interneDisponible())) return { etat: 'indisponible', motif: MOT_SANS_419 };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const v = verifierRemuneration(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const { rows } = await query<{ interne: boolean }>('SELECT compte_id IS NOT NULL AS interne FROM gestion_location_apporteur WHERE id = $1 AND archive_le IS NULL', [id]);
  if (rows[0] === undefined) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (rows[0].interne) return { etat: 'refus', motif: 'Un apporteur interne n’est rattaché à personne : aucun collègue à rémunérer.' };
  const sans = await refusExterneSansCollegue(query, id);
  if (sans !== null) return { etat: 'refus', motif: sans };
  // 🔴 420 — « Depuis toujours » : datée du jour, elle remplace les versions d'avant dans le calcul (conservées), journalisée.
  if (v.r.toujours === true) {
    if (!(await toujoursDisponible()) || !(await journalApporteurDisponible())) return { etat: 'indisponible', motif: MOT_SANS_420 };
    const versions = (await lireApporteurs()).find((x) => x.id === id)?.remunerations ?? [];
    const avant = versionsEffectives(versions).map((x) => libelleRemuneration(x)).join(' ; ') || 'Aucune rémunération';
    return withTransaction(async (q) => {
      const r = await q(
        `INSERT INTO gestion_location_apporteur_remuneration (apporteur_id, depuis, remunere, mode, taux, taux_gestion, duree_annees, saisi_par_libelle, toujours)
         SELECT $1, ${SQL_DEPUIS_TOUJOURS('gestion_location_apporteur_remuneration')}, $2, $3, $4, $5, $6, $7, true ON CONFLICT (apporteur_id, depuis) DO NOTHING`,
        [id, v.r.remunere, v.r.mode, v.r.taux, v.r.tauxGestion, v.r.dureeAnnees, auteur.libelle]);
      if (r.rowCount !== 1) return { etat: 'refus', motif: 'La rémunération « depuis toujours » n’a pas pu s’enregistrer (une autre vient d’être enregistrée en même temps) : réessayez.' } as const;
      await journaliserToujours(q as typeof query, { apporteurId: id, action: 'location_remuneration_collegue_depuis_toujours', champ: 'Rémunération du collègue', avant,
        apres: libelleRemuneration(v.r), auteur });
      return { etat: 'ok' } as const;
    });
  }
  const r = await query(
    `INSERT INTO gestion_location_apporteur_remuneration (apporteur_id, depuis, remunere, mode, taux, taux_gestion, duree_annees, saisi_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (apporteur_id, depuis) DO NOTHING`,
    [id, v.r.depuis, v.r.remunere, v.r.mode, v.r.taux, v.r.tauxGestion, v.r.dureeAnnees, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une version de la rémunération existe déjà à cette date : choisissez une autre date d’effet.' };
}

/** Nouvelle version datée du taux d'un apporteur (coût fixe : 0, retiré de l'outil) (vaut pour les baux signés à partir de `depuis`). */
export async function ajouterBaremeApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  // 🔴 Arno (24/10/2026) — « Nouveau taux » : 0 % accepté, un champ vide refusé (jamais lu comme 0 en silence).
  const saisie = (brut ?? {}) as Record<string, unknown>;
  if (tauxVide(saisie.taux)) return { etat: 'refus', motif: MOT_TAUX_LOCATION_VIDE };
  if (tauxVide(saisie.tauxGestion)) return { etat: 'refus', motif: MOT_TAUX_GESTION_VIDE };
  const v = verifierApporteur({ ...(brut as Record<string, unknown>), nom: 'x', type: 'partenaire', interne: false });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  // 413 — le mode et le taux sur la gestion ; sans la 413, une règle autre que « One shot — gestion 0 % » est refusée (elle serait perdue).
  const avecGestion = await commissionGestionDisponible();
  if (!avecGestion && (v.mode !== 'one_shot' || v.tauxGestion !== 0)) {
    return { etat: 'refus', motif: 'Mise à jour de la base à appliquer (migration 413) : le mode « Récurrent » et le taux sur la gestion ne peuvent pas encore être enregistrés.' };
  }
  // 419 — la durée du récurrent ; sans la 419, seule « Indéterminée » (le comportement d'avant) s'enregistre.
  const avec419 = await interneDisponible();
  if (!avec419 && v.dureeAnnees !== null) return { etat: 'refus', motif: MOT_SANS_419 };
  const sans = await refusExterneSansCollegue(query, id);
  if (sans !== null) return { etat: 'refus', motif: sans };
  // 🔴 420 — « Depuis toujours » : datée du jour, elle remplace dans le calcul les versions d'avant (conservées), journalisée.
  if ((brut as Record<string, unknown> | null)?.toujours === true) {
    if (!(await toujoursDisponible()) || !avec419 || !avecGestion || !(await journalApporteurDisponible())) return { etat: 'indisponible', motif: MOT_SANS_420 };
    const versions = (await lireApporteurs()).find((x) => x.id === id)?.baremes ?? [];
    const avant = versionsEffectives(versions).map((x) => libelleRegleApporteur(x)).join(' ; ') || 'aucune règle';
    return withTransaction(async (q) => {
      const r = await q(
        `INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle, mode, taux_gestion, duree_annees, toujours)
         SELECT $1, ${SQL_DEPUIS_TOUJOURS('gestion_location_apporteur_bareme')}, $2, $3, $4, $5, $6, $7, true WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
         ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, v.taux, 0, auteur.libelle, v.mode, v.tauxGestion, v.dureeAnnees]);
      if (r.rowCount !== 1) return { etat: 'refus', motif: 'La version « depuis toujours » n’a pas pu s’enregistrer (apporteur inconnu, ou une autre vient d’être enregistrée en même temps) : réessayez.' } as const;
      await journaliserToujours(q as typeof query, { apporteurId: id, action: 'location_apporteur_regle_depuis_toujours', champ: 'Règle de l’apporteur', avant,
        apres: libelleRegleApporteur(v), auteur });
      return { etat: 'ok' } as const;
    });
  }
  const r = await query(
    `INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle${avecGestion ? ', mode, taux_gestion' : ''}${avec419 ? ', duree_annees' : ''})
     SELECT $1, $2, $3, $4, $5${avecGestion ? ', $6, $7' : ''}${avec419 ? (avecGestion ? ', $8' : ', $6') : ''} WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
     ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, v.depuis, v.taux, 0, auteur.libelle, ...(avecGestion ? [v.mode, v.tauxGestion] : []), ...(avec419 ? [v.dureeAnnees] : [])]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une version existe déjà à cette date (ou l’apporteur est inconnu) : choisissez une autre date d’effet.' };
}

/** La fiche de l'apporteur : société, téléphone, e-mail, type (le nom ne change pas : il identifie l'apporteur). */
export async function modifierApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const c = verifierCoordonnees(b);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  // 🔴 419 — un EXTERNE sans collègue ne se modifie pas : rattacher d'abord (règle d'Arno, côté navigateur ET serveur).
  const sans = await refusExterneSansCollegue(query, id);
  if (sans !== null) return { etat: 'refus', motif: sans };
  const type = ['partenaire', 'agence', 'internet', 'collaborateur'].includes(String(b.type)) ? String(b.type) : null;
  // 414 — le nom de famille et le prénom, corrigés dans la fiche (absents de la requête : inchangés ; vides : « pas une personne »).
  const avecNomPrenom = await nomPrenomDisponible();
  const texte = (v: unknown): string | null => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : null);
  const nomFamille = texte(b.nomFamille);
  const prenom = texte(b.prenom);
  if (nomFamille === '' && prenom !== null && prenom !== '') return { etat: 'refus', motif: 'Un prénom sans nom de famille : saisissez le nom de famille (ou videz les deux pour une structure).' };
  const r = await query(
    `UPDATE gestion_location_apporteur SET societe = $2, telephone = $3, email = $4, type = coalesce($5, type), modifie_le = now(), modifie_par_libelle = $6
       ${avecNomPrenom && nomFamille !== null ? ', nom_famille = $7, prenom = $8' : ''}
      WHERE id = $1 AND archive_le IS NULL`,
    [id, c.valeurs.societe, c.valeurs.telephone, c.valeurs.email, type, auteur.libelle, ...(avecNomPrenom && nomFamille !== null ? [nomFamille, prenom === '' ? null : prenom] : [])]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Apporteur inconnu.' };
}

/** 421 — la fiche d'identité d'un externe (civilité, adresse, notes, autres téléphones et e-mails) est-elle en base ? */
export function ficheIdentiteDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_apporteur', 'telephones_autres');
}

export type ReponseFiche = { etat: 'ok'; data: { changements: { champ: string; avant: string; apres: string }[] } } | { etat: 'refus'; motif: string }
  | { etat: 'conflit'; motif: string } | { etat: 'indisponible'; motif: string };

/**
 * 🔴 Arno (24/10/2026) — LE PANNEAU « FICHE » d'un apporteur EXTERNE : tous les champs d'identité, avec le CONTRÔLE DE CONFLIT (la
 * version lue à l'ouverture — dernière modification — doit être celle en base, sinon refus : qui et quand) et une ligne de JOURNAL par
 * champ modifié (compte, session et écran par la trace ; entité « location_apporteur », 419). Un interne : refus (son identité est
 * celle de son compte). Un externe « à rattacher » : refus (rattacher d'abord). Rien n'est écrit si rien n'a changé.
 */
export async function enregistrerFicheApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<ReponseFiche> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const v = verifierFiche(b.fiche);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const [avecNomPrenom, avec419, avec421, journal] = await Promise.all([nomPrenomDisponible(), interneDisponible(), ficheIdentiteDisponible(), journalApporteurDisponible()]);
  const sans = await refusExterneSansCollegue(query, id);
  if (sans !== null) return { etat: 'refus', motif: sans };
  const actuel = (await lireApporteurs()).find((x) => x.id === id && !x.archive);
  if (actuel === undefined) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (avec419 && actuel.compteId !== null && actuel.compteId !== undefined) return { etat: 'refus', motif: 'Un apporteur interne : son identité est celle de son compte, modifiable dans la gestion des comptes.' };
  const version = typeof b.version === 'string' ? b.version : null;
  if ((actuel.version ?? null) !== version) {
    const { rows } = await query<{ par: string | null; quand: string | null }>('SELECT modifie_par_libelle AS par, modifie_le::text AS quand FROM gestion_location_apporteur WHERE id = $1', [id]);
    return { etat: 'conflit', motif: motifConflitFiche(rows[0]?.quand ? { par: rows[0].par ?? '—', quand: rows[0].quand } : null) };
  }
  // Sans la 421, les champs nouveaux ne s'enregistrent pas : ils gardent la valeur lue (vide) — aucun changement n'est inventé.
  const f = avec421 ? v.fiche : { ...v.fiche, civilite: '', adresse: '', notes: '', telephonesAutres: [], emailsAutres: [] };
  const changements = changementsFiche(ficheDe(actuel), f);
  if (changements.length === 0) return { etat: 'ok', data: { changements: [] } };
  return withTransaction(async (q) => {
    const nul = (x: string): string | null => (x === '' ? null : x);
    const r = await q(
      `UPDATE gestion_location_apporteur SET societe = $2, telephone = $3, email = $4, type = $5, modifie_le = now(), modifie_par_libelle = $6
         ${avecNomPrenom ? ', nom_famille = $7, prenom = $8' : ''}
         ${avec421 ? `, civilite = $${avecNomPrenom ? 9 : 7}, adresse = $${avecNomPrenom ? 10 : 8}, notes = $${avecNomPrenom ? 11 : 9},
                      telephones_autres = $${avecNomPrenom ? 12 : 10}, emails_autres = $${avecNomPrenom ? 13 : 11}` : ''}
        WHERE id = $1 AND archive_le IS NULL AND modifie_le::text IS NOT DISTINCT FROM $${avecNomPrenom ? (avec421 ? 14 : 9) : (avec421 ? 12 : 7)}`,
      [id, nul(f.societe), nul(f.telephone), nul(f.email), f.type, auteur.libelle,
        ...(avecNomPrenom ? [f.nomFamille, nul(f.prenom)] : []),
        ...(avec421 ? [nul(f.civilite), nul(f.adresse), nul(f.notes), f.telephonesAutres, f.emailsAutres] : []), version]);
    // Relu sous verrou : une modification arrivée entre la lecture et l'écriture est un conflit, rien n'est écrit.
    if ((r.rowCount ?? 0) !== 1) return { etat: 'conflit', motif: motifConflitFiche(null) } as const;
    if (journal) {
      for (const c of changements) {
        const tr = await colonnesTrace({ sujet: 'apporteur', champ: c.champ }, 7);
        await q(
          `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${tr.colonnes})
           VALUES ('location_apporteur', $1, 'location_apporteur_fiche_modifiee', $2, $3, $4, $5, $6${tr.marques})`,
          [id, c.avant, c.apres, `Fiche de l’apporteur — ${c.champ} : ${c.avant} → ${c.apres}`, auteur.id, auteur.libelle, ...tr.valeurs]);
      }
    }
    return { etat: 'ok', data: { changements: changements.map(({ champ, avant, apres }) => ({ champ, avant, apres })) } } as const;
  });
}

/**
 * 🔴 Arno (24/10/2026, 422) — « PASSER EN INTERNE » (panneau « Fiche ») : la règle du script `location:apporteurs-internes`
 * (`passerEnInterne`), dans une transaction ; à compter d'aujourd'hui (Paris).
 */
export async function passerApporteurEnInterne(apporteurId: unknown, compteId: unknown, auteur: Auteur): Promise<IssuePassage> {
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  const compte = typeof compteId === 'number' && Number.isInteger(compteId) && compteId > 0 ? compteId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (compte === null) return { etat: 'refus', motif: 'Choisissez le compte de l’interface.' };
  if (!(await interneDisponible())) return { etat: 'indisponible', motif: MOT_SANS_419 };
  return withTransaction((q) => passerEnInterne(q as typeof query, { apporteurId: id, compteId: compte, jour: aujourdhuiParis(), raison: 'bouton « Passer en interne » de la fiche', auteur }));
}

/** Le collègue de rattachement, DATÉ : une nouvelle version à partir de `depuis` ; les affaires d'avant restent au collègue d'alors. */
export async function rattacherApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  const b = (brut ?? {}) as Record<string, unknown>;
  const collegueId = typeof b.collegueId === 'number' && Number.isInteger(b.collegueId) && b.collegueId > 0 ? b.collegueId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (collegueId === null) return { etat: 'refus', motif: 'Choisissez le collègue de rattachement.' };
  // Arno (23/10/2026, 409) — « depuis toujours » : la date d'effet est vide ; tout l'historique et ce qui suit, jusqu'à un rattachement daté.
  const toujours = b.depuisToujours === true;
  if (!toujours && !dateIsoValide(b.depuis)) return { etat: 'refus', motif: 'La date d’effet du rattachement est obligatoire (ou « Depuis toujours »).' };
  const libelle = await libelleCompte(query, collegueId);
  if (libelle === null) return { etat: 'refus', motif: 'Le collègue de rattachement est inconnu.' };
  // 🔴 419 — un apporteur INTERNE n'est rattaché à personne.
  if (await interneDisponible()) {
    const i = await query<{ interne: boolean }>('SELECT compte_id IS NOT NULL AS interne FROM gestion_location_apporteur WHERE id = $1', [id]);
    if (i.rows[0]?.interne === true) return { etat: 'refus', motif: 'Un apporteur interne n’est rattaché à personne.' };
  }
  if (toujours) {
    if (!(await depuisToujoursDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 409) n’est pas encore appliquée : « Depuis toujours » n’est pas encore possible.' };
    const r = await query(
      `INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
       SELECT $1, NULL, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
         AND NOT EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = $1 AND depuis IS NULL)`, [id, collegueId, libelle, auteur.libelle]);
    return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Cet apporteur est déjà rattaché « depuis toujours » : pour changer de collègue, choisissez une date d’effet.' };
  }
  const r = await query(
    `INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
     SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
     ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, b.depuis, collegueId, libelle, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Un rattachement existe déjà à cette date (ou l’apporteur est inconnu) : choisissez une autre date d’effet.' };
}

/**
 * ══ 🔴 Arno (24/10/2026) — LE RATTACHEMENT ET LA RÉMUNÉRATION DU COLLÈGUE, UN SEUL GESTE ═══════════════════════════════════════════
 * « Au moment de rattacher un collègue, on lui demande dans le même formulaire s'il touche des honoraires sur l'activité de cet
 * apporteur. » `sorte` :
 *   · « rattacher » (premier rattachement, ou changement de collègue) : le collègue, la date (ou « depuis toujours »), et la réponse
 *     OBLIGATOIRE — Non (une version « Aucune rémunération » à la même date : la rémunération d'un collègue précédent ne passe jamais
 *     au nouveau) ou Oui (sa version : one shot / récurrent, taux, durée) ;
 *   · « remuneration » : le collègue actuel garde son rattachement ; seule une nouvelle version de sa rémunération (date ou « depuis
 *     toujours »).
 * Tout s'écrit dans UNE transaction — un refus n'importe où annule tout — et se journalise (compte, session, écran) : une ligne pour
 * le rattachement, une pour la rémunération.
 */
class RefusRattachement extends Error {}
export async function enregistrerRattachement(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const sorte = b.sorte === 'remuneration' ? 'remuneration' : 'rattacher';
  const r = (b.remuneration ?? {}) as Record<string, unknown>;
  if (r.remunere !== true && r.remunere !== false) return { etat: 'refus', motif: 'Répondez à la question : le collègue touche-t-il des honoraires sur l’activité de cet apporteur (Oui / Non) ?' };
  const avec419 = await interneDisponible();
  const avec420 = await toujoursDisponible();
  const apporteur = (await lireApporteurs()).find((x) => x.id === id && !x.archive);
  if (apporteur === undefined) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (apporteur.compteId !== null && apporteur.compteId !== undefined) return { etat: 'refus', motif: 'Un apporteur interne n’est rattaché à personne.' };
  const jour = aujourdhuiParis();
  // Le rattachement (sorte « rattacher ») : collègue et date, vérifiés comme `rattacherApporteur`.
  let rattachement: { collegueId: number; libelle: string; depuis: string | null } | null = null;
  if (sorte === 'rattacher') {
    const collegueId = typeof b.collegueId === 'number' && Number.isInteger(b.collegueId) && b.collegueId > 0 ? b.collegueId : null;
    if (collegueId === null) return { etat: 'refus', motif: 'Choisissez le collègue de rattachement.' };
    const toujours = b.depuisToujours === true;
    if (!toujours && !dateIsoValide(b.depuis)) return { etat: 'refus', motif: 'La date d’effet du rattachement est obligatoire (ou « Depuis toujours »).' };
    if (toujours && !(await depuisToujoursDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 409) n’est pas encore appliquée : « Depuis toujours » n’est pas encore possible.' };
    const libelle = await libelleCompte(query, collegueId);
    if (libelle === null) return { etat: 'refus', motif: 'Le collègue de rattachement est inconnu.' };
    rattachement = { collegueId, libelle, depuis: toujours ? null : b.depuis as string };
  } else if ((apporteur.collegues ?? []).length === 0) {
    return { etat: 'refus', motif: 'Rattachez d’abord cet apporteur à un collègue.' };
  }
  // La rémunération : à la date du rattachement (sorte « rattacher »), ou à la sienne (sorte « remuneration »).
  const toujoursRemu = rattachement !== null ? rattachement.depuis === null : r.toujours === true;
  const depuisRemu = toujoursRemu ? jour : rattachement !== null ? rattachement.depuis as string : r.depuis;
  const v = verifierRemuneration({ ...r, depuis: depuisRemu, ...(toujoursRemu ? { toujours: true } : {}) });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const ecrireRemu = avec419;
  if (!avec419 && (v.r.remunere || sorte === 'remuneration')) return { etat: 'indisponible', motif: MOT_SANS_419 };
  if (ecrireRemu && toujoursRemu && !avec420) return { etat: 'indisponible', motif: MOT_SANS_420 };
  const journal = await journalApporteurDisponible();
  const collegueAvant = collegueADate(apporteur, rattachement?.depuis ?? jour);
  const remuAvant = libelleRemuneration(remunerationADate(apporteur, depuisRemu as string));
  try {
    await withTransaction(async (q) => {
      if (rattachement !== null) {
        const w = rattachement.depuis === null
          ? await q(`INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
                     SELECT $1, NULL, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = $1 AND depuis IS NULL)`,
            [id, rattachement.collegueId, rattachement.libelle, auteur.libelle])
          : await q(`INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
                     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, rattachement.depuis, rattachement.collegueId, rattachement.libelle, auteur.libelle]);
        if ((w.rowCount ?? 0) !== 1) {
          throw new RefusRattachement(rattachement.depuis === null ? 'Cet apporteur est déjà rattaché « depuis toujours » : pour changer de collègue, choisissez une date d’effet.'
            : 'Un rattachement existe déjà à cette date : choisissez une autre date d’effet.');
        }
      }
      if (ecrireRemu) {
        const w = await q(
          `INSERT INTO gestion_location_apporteur_remuneration (apporteur_id, depuis, remunere, mode, taux, taux_gestion, duree_annees, saisi_par_libelle${toujoursRemu ? ', toujours' : ''})
           SELECT $1, COALESCE($2::date, ${SQL_DEPUIS_TOUJOURS('gestion_location_apporteur_remuneration')}), $3, $4, $5, $6, $7, $8${toujoursRemu ? ', true' : ''}
           ON CONFLICT (apporteur_id, depuis) DO NOTHING`,
          [id, toujoursRemu ? null : v.r.depuis, v.r.remunere, v.r.mode, v.r.taux, v.r.tauxGestion, v.r.dureeAnnees, auteur.libelle]);
        if ((w.rowCount ?? 0) !== 1) throw new RefusRattachement('Une version de la rémunération du collègue existe déjà à cette date : choisissez une autre date d’effet.');
      }
      if (journal) {
        const ligne = async (action: string, champ: string, avant: string, apres: string): Promise<void> => {
          const t = await colonnesTrace({ sujet: 'apporteur', champ }, 8);
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
                   VALUES ('location_apporteur', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
            [id, action, avant, apres, `${champ} : ${avant} → ${apres}`, auteur.id, auteur.libelle, ...t.valeurs]);
        };
        if (rattachement !== null) {
          await ligne('location_apporteur_rattache', 'Collègue de rattachement', collegueAvant === null ? 'à rattacher' : `${collegueAvant.collegueLibelle} ${depuisLibelle(collegueAvant)}`,
            `${rattachement.libelle} ${rattachement.depuis === null ? 'depuis toujours' : `depuis le ${rattachement.depuis.split('-').reverse().join('/')}`}`);
        }
        if (ecrireRemu) {
          await ligne('location_remuneration_collegue', 'Rémunération du collègue', remuAvant,
            `${libelleRemuneration(v.r)} (${toujoursRemu ? 'depuis toujours' : `à partir du ${v.r.depuis.split('-').reverse().join('/')}`})`);
        }
      }
    });
  } catch (e) {
    if (e instanceof RefusRattachement) return { etat: 'refus', motif: e.message };
    throw e;
  }
  return { etat: 'ok' };
}

// ── Règle de commission et rétrocessions ──────────────────────────────────────────────────────────────────────────

export async function lireRegles(): Promise<RegleCommission[]> {
  if (!(await suiviDisponible())) return [];
  const local = await primeLocalDisponible();
  const { rows } = await query<{ depuis: string; taux_negociateur: string; prime_gestion_logement: string; prime_gestion_parking: string; prime_gestion_local: string | null }>(
    `SELECT depuis::text AS depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, ${local ? 'prime_gestion_local' : 'NULL::numeric AS prime_gestion_local'}
       FROM gestion_location_commission_regle ORDER BY depuis`);
  return rows.map((r) => ({ depuis: iso(r.depuis), tauxNegociateur: num(r.taux_negociateur), primeLogement: num(r.prime_gestion_logement), primeParking: num(r.prime_gestion_parking),
    primeLocal: numOuNull(r.prime_gestion_local) }));
}

export async function ajouterRegle(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierRegle(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const local = await primeLocalDisponible();
  const r = await query(
    `INSERT INTO gestion_location_commission_regle (depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, saisi_par_libelle${local ? ', prime_gestion_local' : ''})
     VALUES ($1, $2, $3, $4, $5${local ? ', $6' : ''}) ON CONFLICT (depuis) DO NOTHING`,
    [v.regle.depuis, v.regle.tauxNegociateur, v.regle.primeLogement, v.regle.primeParking, auteur.libelle, ...(local ? [v.regle.primeLocal ?? null] : [])]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une règle existe déjà à cette date : choisissez une autre date d’effet.' };
}

export interface Retrocession { id: number; negociateurId: number | null; negociateurLibelle: string; mois: string; montant: number; libelle: string }

export async function lireRetrocessions(): Promise<Retrocession[]> {
  if (!(await suiviDisponible())) return [];
  const { rows } = await query<{ id: string; negociateur_id: string | null; negociateur_libelle: string; mois: string; montant: string; libelle: string }>(
    'SELECT id, negociateur_id, negociateur_libelle, mois::text AS mois, montant, libelle FROM gestion_location_retrocession WHERE annule_le IS NULL ORDER BY mois, id');
  const lues = rows.map((r) => ({ id: num(r.id), negociateurId: numOuNull(r.negociateur_id), negociateurLibelle: r.negociateur_libelle, mois: iso(r.mois), montant: num(r.montant), libelle: r.libelle }));
  // 🔴 Arno (26/10/2026) — une rétrocession saisie au libellé rejoint l'espace du compte, comme les lignes de suivi (une personne = un espace).
  return unifierNegociateurs(lues, await lireComptesNegociateurs(), await lireAliasNegociateurs()).lignes;
}

export async function ajouterRetrocession(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierRetrocession(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  await query(
    `INSERT INTO gestion_location_retrocession (negociateur_id, negociateur_libelle, mois, montant, libelle, saisi_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6)`, [v.negociateurId, v.negociateurLibelle, v.mois, v.montant, v.libelle, auteur.libelle]);
  return { etat: 'ok' };
}

/** Une rétrocession s'ANNULE (marque datée) : jamais supprimée. */
export async function annulerRetrocession(id: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return { etat: 'refus', motif: 'Rétrocession inconnue.' };
  const r = await query('UPDATE gestion_location_retrocession SET annule_le = now(), annule_par_libelle = $2 WHERE id = $1 AND annule_le IS NULL', [id, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Rétrocession inconnue ou déjà annulée.' };
}

// ── Négociateurs ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Un compte de l'administration (négociateur, collègue) — `lireComptesInterface`, la seule liste. */
export interface Negociateur { id: number; libelle: string; actif: boolean }


// ── L'activité : une ligne par bail signé ─────────────────────────────────────────────────────────────────────────

/**
 * L'origine client DÉDUITE à la date de signature :
 *  · propriétaire « déjà client » s'il avait, AVANT cette date, un autre bail sur l'un de ses biens, un bien en gestion
 *    (début de gestion antérieur) ou une relation datée antérieure ; sinon « nouveau client » ;
 *  · locataire « déjà client » s'il avait, avant cette date, une autre occupation ; sinon « nouveau client ».
 */
async function deduireOrigines(
  q: typeof query, o: { bailId: number; lotId: number; proprietaireId: number | null; locataireIds: number[]; date: string },
): Promise<{ proprietaire: Origine | null; locataire: Origine | null }> {
  let proprietaire: Origine | null = null;
  if (o.proprietaireId !== null) {
    const { rows } = await q<{ deja: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_annuaire_lot l JOIN gestion_bail b ON b.lot_id = l.id
         WHERE l.proprietaire_id = $1 AND b.id <> $2 AND b.entree < $3
       ) OR EXISTS (
         SELECT 1 FROM gestion_annuaire_lot l WHERE l.proprietaire_id = $1 AND l.gestion_debut < $3
       ) OR EXISTS (
         SELECT 1 FROM gestion_annuaire_proprietaire p WHERE p.id = $1 AND p.relation_depuis < $3
       ) AS deja`, [o.proprietaireId, o.bailId, o.date]);
    proprietaire = rows[0]?.deja ? 'deja' : 'nouveau';
  }
  let locataire: Origine | null = null;
  if (o.locataireIds.length > 0) {
    const { rows } = await q<{ deja: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_annuaire_occupation oc
         WHERE oc.locataire_id = ANY($1::bigint[]) AND oc.entree < $2 AND oc.bail_id IS DISTINCT FROM $3
       ) AS deja`, [o.locataireIds, o.date, o.bailId]);
    locataire = rows[0]?.deja ? 'deja' : 'nouveau';
  }
  return { proprietaire, locataire };
}

/**
 * 407 — écrit les CHAMPS COMMERCIAUX d'une ligne d'activité : origine du contact, collègue (« collègue directement »),
 * apporteur et commission saisie, choix de prime. Un apporteur « à rattacher » (sans collègue) ne peut pas être CHOISI ; il
 * reste sur une ligne qui l'avait déjà (reprise du fichier). Rend le motif d'un refus, ou null.
 */
async function ecrireCommercial(q: typeof query, activiteId: number, c: ChampsCommerciaux, tauxApporteur: number | null, auteur: Auteur,
  conserverMontants = false): Promise<string | null> {
  const avant = (await q<{ apporteur_id: string | null; lot_id: string | null }>('SELECT apporteur_id, lot_id FROM gestion_location_activite WHERE id = $1 FOR UPDATE', [activiteId])).rows[0];
  if (avant === undefined) return 'Ligne inconnue.';
  // Arno (24/10/2026, 411) — « Personnalisé » n'existe en base qu'avec la 411 ; et UNE prime par bien.
  const avecPrecision = await personnalisableDisponible();
  if (c.origineContact === 'personnalise' && !avecPrecision) return 'L’origine « Personnalisé » demande la mise à jour de la base (migration 411).';
  if (c.origineContact === 'proprietaire_deja_client' && !(await origineDejaClientDisponible())) return 'L’origine « Propriétaire déjà client » demande la mise à jour de la base (migration 415).';
  const porteUnePrime = c.primeMode === 'regle' || (c.primeMode === 'personnalise' && (c.primeMontant ?? 0) > 0);
  const lot = numOuNull(avant.lot_id);
  if (porteUnePrime && lot !== null) {
    const deja = await primeDejaVersee(q, lot, { activiteId });
    if (deja !== null) return `${motPrimeDejaVersee(deja)} : ${MOT_UNE_SEULE_PRIME}`;
  }
  if (c.apporteurId !== null) {
    // 419 — un INTERNE (lié à son compte) n'est jamais « à rattacher ».
    const interne = (await interneDisponible()) ? 'a.compte_id IS NOT NULL OR ' : '';
    const ap = (await q<{ archive: boolean; rattache: boolean }>(
      `SELECT archive_le IS NOT NULL AS archive, (${interne}EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = a.id)) AS rattache
         FROM gestion_location_apporteur a WHERE id = $1`, [c.apporteurId])).rows[0];
    if (ap === undefined) return 'Apporteur inconnu.';
    const nouveauChoix = numOuNull(avant.apporteur_id) !== c.apporteurId;
    if (nouveauChoix && (ap.archive || !ap.rattache)) return 'Cet apporteur est « à rattacher » : rattachez-le d’abord à un collègue (roue Paramètres → Apporteurs).';
  }
  const collegue = c.collegueId === null ? null : await libelleCompte(q, c.collegueId);
  if (c.collegueId !== null && collegue === null) return 'Le collègue est inconnu.';
  // Arno (23/10/2026) : taux et montant d'apporteur NON TOUCHÉS dans la feuille → la valeur exacte en base reste (jamais
  // arrondie par une autre correction : le contrôle au centime du fichier en dépend). Seulement si l'apporteur ne change pas.
  const garder = conserverMontants && c.apporteurId !== null && numOuNull(avant.apporteur_id) === c.apporteurId;
  await q(
    `UPDATE gestion_location_activite SET origine_contact = $2, collegue_id = $3, collegue_libelle = $4, apporteur_id = $5,
            apporteur_taux = CASE WHEN $5::bigint IS NULL THEN NULL WHEN $11::boolean THEN apporteur_taux ELSE $6::numeric END,
            apporteur_commission_saisie = CASE WHEN $11::boolean THEN apporteur_commission_saisie ELSE $7 END,
            prime_mode = $8, prime_gestion_saisie = CASE $8::text WHEN 'personnalise' THEN $9::numeric WHEN 'aucune' THEN 0 ELSE CASE WHEN $8::text IS NULL THEN prime_gestion_saisie END END,
            mandat_gestion = CASE WHEN $8::text IS NULL THEN mandat_gestion ELSE $8::text <> 'aucune' END,
            modifie_le = now(), modifie_par_libelle = $10
      WHERE id = $1`,
    [activiteId, c.origineContact, c.collegueId, collegue, c.apporteurId, tauxApporteur, c.commissionApporteur, c.primeMode, c.primeMontant, auteur.libelle, garder]);
  if (avecPrecision) {
    await q('UPDATE gestion_location_activite SET origine_contact_precision = $2 WHERE id = $1', [activiteId, c.origineContactPrecision ?? null]);
  }
  return null;
}

/**
 * 407 — la feuille du mois : corrige les champs commerciaux d'UNE ligne (origine, collègue, apporteur, commission, prime),
 * quelle que soit sa provenance (saisie, reprise du fichier). Rien d'autre n'est touché.
 */
export async function modifierActivite(activiteId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof activiteId === 'number' && Number.isInteger(activiteId) && activiteId > 0 ? activiteId : null;
  if (id === null) return { etat: 'refus', motif: 'Ligne inconnue.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const c = verifierCommercial(b, true);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  const taux = lireTauxPourcent(b.apporteurTaux);
  if (taux === undefined) return { etat: 'refus', motif: 'Taux de l’apporteur : un pourcentage entre 0 et 100.' };
  return withTransaction(async (q) => {
    // 🔴 Arno (25/10/2026) — la ligne lue AVANT et APRÈS : chaque champ changé entre au journal (compte, session, écran « Suivi du mois »).
    const avant = await lireEtatCommercial(q as typeof query, id);
    const motif = await ecrireCommercial(q as typeof query, id, c.valeurs, taux, auteur, b.conserverMontants === true);
    if (motif !== null) return { etat: 'refus', motif } as const;
    const apres = await lireEtatCommercial(q as typeof query, id);
    if (avant !== null && apres !== null) {
      for (const ch of changementsLigne(avant, apres)) await journaliserLigne(q as typeof query, id, 'location_suivi_ligne_modifiee', ch, auteur);
    }
    return { etat: 'ok' } as const;
  });
}

/** Les champs commerciaux d'une ligne, noms résolus (le collègue par son compte, l'apporteur par l'annuaire). */
async function lireEtatCommercial(q: typeof query, id: number): Promise<EtatCommercialLu | null> {
  const precision = (await personnalisableDisponible()) ? 'a.origine_contact_precision' : 'NULL::text AS origine_contact_precision';
  const { rows } = await q<EtatCommercialLu>(
    `SELECT a.origine_contact, ${precision},
            CASE WHEN a.collegue_id IS NULL THEN a.collegue_libelle
                 ELSE (SELECT coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) FROM admin_utilisateur u WHERE u.id = a.collegue_id) END AS collegue,
            ap.nom AS apporteur, a.apporteur_taux, a.apporteur_commission_saisie, a.prime_mode, a.prime_gestion_saisie
       FROM gestion_location_activite a LEFT JOIN gestion_location_apporteur ap ON ap.id = a.apporteur_id WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Une ligne du journal de la ligne de suivi : « Champ : ancienne → nouvelle », avec compte, session et écran (`avecTrace`). */
async function journaliserLigne(q: typeof query, id: number, action: string, ch: { champ: string; avant: string; apres: string }, auteur: Auteur): Promise<void> {
  const t = await colonnesTrace({ sujet: 'activite', champ: ch.champ }, 8);
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
     VALUES ('location_activite', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
    [id, action, `${ch.champ} : ${ch.avant}`, `${ch.champ} : ${ch.apres}`, `${ECRAN_SUIVI_MOIS} — ${ch.champ} : ${ch.avant} → ${ch.apres}`, auteur.id, auteur.libelle, ...t.valeurs]);
}

/**
 * 🔴 Arno (25/10/2026, réponse (a)) — « TYPE DE BIEN » CHOISI DANS NOUVEAU LOCATAIRE OU LE DOSSIER DE LOCATION (bloc 4) → LA FICHE DU BIEN :
 * la famille du LOT PRINCIPAL de la ligne est mise à jour par le geste de la fiche (`modifierEncartBien`, groupe « bien » : catégorie,
 * Historique du bien, compte, session et écran) — la dernière validation se voit partout (fiche, résumé, Dossier). Rien n'est écrit si la
 * fiche dit déjà la même chose. Des lots de FAMILLES DIFFÉRENTES : la fiche n'est PAS écrasée, le message le dit. Rend la phrase à
 * montrer (`null` : rien à dire). Appelée APRÈS l'écriture de la ligne (sa transaction close).
 */
export const MOT_FAMILLES_DIFFERENTES = 'Type de bien : familles différentes selon les lots — modifier dans « Caractéristiques du bien loué ».';
export async function typeDeBienVersFiche(activiteId: number, choisi: CategoriePrime | null, auteur: Auteur): Promise<string | null> {
  if (choisi === null) return null;
  const ligne = (await query<{ lot_id: string | null; bail_id: string | null }>('SELECT lot_id, bail_id FROM gestion_location_activite WHERE id = $1', [activiteId])).rows[0];
  if (ligne === undefined || ligne.lot_id === null) return null;
  const lotId = num(ligne.lot_id);
  const avecBailOcc = await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id');
  const lots = (await query<{ id: string; categorie: string | null; nature: string | null; type_bien: string | null }>(
    `SELECT id::text, categorie, nature, type_bien FROM gestion_annuaire_lot
      WHERE id = $1${avecBailOcc ? ' OR id IN (SELECT oc.lot_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = $2)' : ''}`,
    avecBailOcc ? [lotId, numOuNull(ligne.bail_id)] : [lotId])).rows;
  if (typeDeBienDesFiches(lotId, lots) === choisi) return null;
  if (famillesDesLots(lots).length > 1) return MOT_FAMILLES_DIFFERENTES;
  const r = await modifierEncartBien(lotId, 'bien', { categorie: choisi }, auteur);
  return r.etat === 'ok' ? null : `Type de bien non reporté sur la fiche du bien : ${'motif' in r && typeof r.motif === 'string' ? r.motif : 'la fiche n’a pas pu être modifiée'}.`;
}

/**
 * 🔴 Arno (25/10/2026, migration 424) — « STATUT DU BIEN » validé à la main sur la ligne (`statut` : l'un des 5), ou `null` : « Revenir au
 * statut calculé ». Il l'emporte sur le calcul partout ; il ne touche NI l'origine du contact NI la gestion (aucun effet de bord). Journalisé.
 */
export async function validerStatutBien(activiteId: unknown, statut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await statutBienManuelDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 424) n’est pas encore appliquée.' };
  const id = typeof activiteId === 'number' && Number.isInteger(activiteId) && activiteId > 0 ? activiteId : null;
  if (id === null) return { etat: 'refus', motif: 'Ligne inconnue.' };
  if (statut !== null && !(NATURES_BIEN as readonly unknown[]).includes(statut)) return { etat: 'refus', motif: 'Statut du bien inconnu.' };
  const nouveau = statut as NatureBien | null;
  return withTransaction(async (q) => {
    const ligne = (await q<{ s: string | null }>('SELECT statut_bien_manuel AS s FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE', [id])).rows[0];
    if (ligne === undefined) return { etat: 'refus', motif: 'Cette ligne du suivi n’existe plus.' } as const;
    if (ligne.s === nouveau) return { etat: 'ok' } as const;
    await q(`UPDATE gestion_location_activite SET statut_bien_manuel = $2::text,
                    statut_bien_valide_le = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
                    statut_bien_valide_par = CASE WHEN $2::text IS NULL THEN NULL ELSE $3::bigint END,
                    statut_bien_valide_par_libelle = CASE WHEN $2::text IS NULL THEN NULL ELSE $4::text END
              WHERE id = $1`, [id, nouveau, auteur.id, auteur.libelle]);
    await journaliserLigne(q as typeof query, id, nouveau === null ? 'location_statut_bien_calcule' : 'location_statut_bien_valide',
      { champ: 'Statut du bien', avant: motStatutBien(ligne.s), apres: motStatutBien(nouveau) }, auteur);
    return { etat: 'ok' } as const;
  });
}

/**
 * Enregistre (ou met à jour) le « suivi commercial » d'un bail : UNE ligne d'activité par bail (index unique partiel).
 * Les libellés, le bien, le propriétaire, les locataires et l'origine client sont lus en base ; la saisie porte la date de
 * signature, les honoraires HT, le négociateur, l'apporteur et son taux, la gestion. Rien d'autre n'est modifié.
 */
class RefusSuivi extends Error {}

export async function enregistrerActiviteBail(bailId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number; note?: string }>> {
  try {
    const r = await enregistrerActiviteBailTx(bailId, brut, auteur);
    if (r.etat !== 'ok' || r.data === undefined) return r;
    // 🔴 Arno (25/10/2026) — le « Type de bien » choisi : sur la fiche du bien (la source unique).
    const note = await typeDeBienVersFiche(r.data.id, categorieChoisie(brut), auteur);
    return note === null ? r : { etat: 'ok', data: { ...r.data, note } };
  } catch (e) {
    if (e instanceof RefusSuivi) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

async function enregistrerActiviteBailTx(bailId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const id = typeof bailId === 'number' && Number.isInteger(bailId) && bailId > 0 ? bailId : null;
  if (id === null) return { etat: 'refus', motif: 'Bail inconnu.' };
  const avecAnnuaire = await annuaireDisponible();
  // 407 : l'origine du contact est obligatoire — seulement quand la base sait l'enregistrer.
  const v = verifierActivite(brut, { origineObligatoire: avecAnnuaire });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const br = (brut ?? {}) as Record<string, unknown>;
  const categoriePrime: CategoriePrime | null = br.categoriePrime === 'parking' || br.categoriePrime === 'logement' || br.categoriePrime === 'local' ? br.categoriePrime : null;
  // Les loyers viennent des champs « Loyer mensuel » de l'écran (déjà saisis) : repris tels quels, illisibles → non renseignés.
  const loyerHc = lireMontant(br.loyerHc) ?? null;
  const charges = lireMontant(br.charges) ?? null;
  return withTransaction(async (q) => {
    const bail = await q<{ lot_id: string; proprietaire_id: string | null; proprio: string | null; categorie: string | null; nature: string | null; type_bien: string | null }>(
      `SELECT b.lot_id, l.proprietaire_id, p.nom_complet AS proprio, l.categorie, l.nature, l.type_bien
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id WHERE b.id = $1`, [id]);
    if (bail.rows.length === 0) return { etat: 'refus', motif: 'Bail inconnu.' } as const;
    const b = bail.rows[0];
    const locs = await q<{ id: string; libelle: string }>(
      `SELECT lo.id, coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom, '') AS libelle
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire lo ON lo.id = o.locataire_id
       WHERE o.bail_id = $1 ORDER BY lo.id`, [id]);
    const lotId = num(b.lot_id);
    const proprietaireId = numOuNull(b.proprietaire_id);
    const origines = await deduireOrigines(q as typeof query, { bailId: id, lotId, proprietaireId, locataireIds: locs.rows.map((r) => num(r.id)), date: v.valeurs.dateSignature });
    const negociateur = v.valeurs.negociateurId === null ? null
      : (await q<{ libelle: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant, '') AS libelle FROM admin_utilisateur WHERE id = $1`,
        [v.valeurs.negociateurId])).rows[0]?.libelle ?? null;
    // 🔴 Arno (24/10/2026) — « Parking » seulement si TOUS les lots loués par ce bail sont des parkings (place ou box) : lu avant d'écrire.
    if (categoriePrime === 'parking' && await colonneExisteMemo('gestion_annuaire_lot', 'categorie')) {
      const lots = await q<{ tous: boolean | null }>(
        `SELECT bool_and(${sqlLotParking('l')}) AS tous FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot l ON l.id = o.lot_id
          WHERE o.bail_id = $1`, [id]);
      if (lots.rows[0]?.tous === false) return { etat: 'refus', motif: MOT_PARKING_SEUL } as const;
    }
    const prime: CategoriePrime = await categorieEnregistrable(categoriePrime ?? categoriePrimeDeFamille(familleDuLot({ categorie: b.categorie, nature: b.nature, typeBien: b.type_bien })));
    /* 🔴 Arno (26/10/2026, 430) — LE BAIL D'UN LOCATAIRE EN PLACE À LA PRISE EN GESTION n'est jamais un bail signé par l'agence : son suivi
       est un « Mandat de gestion seul » (hors « Baux signés »), sans honoraire de location (hors CA, aucune commission d'apporteur sur la
       location). Imposé ICI, d'après la marque du bail — l'écran ne peut pas le contourner ; un « Mandat de gestion seul » envoyé tel
       quel suit la même règle. Une seule ligne de ce type par bail (lu avant d'écrire). */
    const enPlace = await bailEnPlace(id);
    const brute: ActiviteVerifiee = v.valeurs;
    const seule = enPlace || brute.type === 'gestion_seule';
    const a: ActiviteVerifiee = seule ? { ...brute, type: 'gestion_seule', honoProprietaireHt: 0, honoLocataireHt: 0 } : brute;
    if (seule) {
      const deja = await q('SELECT 1 FROM gestion_location_activite WHERE bail_id = $1 AND type = $2 AND annule_le IS NULL', [id, 'gestion_seule']);
      if (deja.rows.length > 0) return { etat: 'refus', motif: 'Le suivi de ce mandat de gestion est déjà enregistré : modifiez-le depuis « Suivi du mois ».' } as const;
    }
    // 🔴 Arno (24/10/2026) — UNE seule prime de nouvelle gestion par bien : le serveur refuse la seconde (lu AVANT d'écrire).
    const veutUnePrime = a.primeMode === 'aucune' ? false : a.primeMode === 'personnalise' ? (a.primeMontant ?? 0) > 0
      : a.primeMode === 'regle' ? true : a.mandatGestion;
    if (veutUnePrime) {
      const deja = await primeDejaVersee(q as typeof query, lotId, { bailId: id });
      if (deja !== null) return { etat: 'refus', motif: `${motPrimeDejaVersee(deja)} : ${MOT_UNE_SEULE_PRIME}` } as const;
    }
    const { rows } = await q<{ id: string }>(
      `INSERT INTO gestion_location_activite
         (type, date_signature, bail_id, lot_id, proprietaire_id, locataire_id, libelle_proprietaire, libelle_locataire,
          hono_proprietaire_ht, hono_locataire_ht, negociateur_id, negociateur_libelle, apporteur_id, apporteur_taux,
          mandat_gestion, categorie_prime, avec_gestion, origine_proprietaire_deduite, origine_proprietaire_saisie,
          origine_locataire_deduite, origine_locataire_saisie, source, cree_par_libelle, loyer_hc, charges)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'saisie', $22, $23, $24)
       ON CONFLICT (bail_id) WHERE bail_id IS NOT NULL AND type = 'bail' AND annule_le IS NULL DO UPDATE SET
         date_signature = EXCLUDED.date_signature, date_signature_supposee = false,
         hono_proprietaire_ht = EXCLUDED.hono_proprietaire_ht, hono_locataire_ht = EXCLUDED.hono_locataire_ht,
         negociateur_id = EXCLUDED.negociateur_id, negociateur_libelle = EXCLUDED.negociateur_libelle,
         apporteur_id = EXCLUDED.apporteur_id, apporteur_taux = EXCLUDED.apporteur_taux, mandat_gestion = EXCLUDED.mandat_gestion,
         categorie_prime = EXCLUDED.categorie_prime, avec_gestion = EXCLUDED.avec_gestion,
         origine_proprietaire_deduite = EXCLUDED.origine_proprietaire_deduite, origine_proprietaire_saisie = EXCLUDED.origine_proprietaire_saisie,
         origine_locataire_deduite = EXCLUDED.origine_locataire_deduite, origine_locataire_saisie = EXCLUDED.origine_locataire_saisie,
         loyer_hc = EXCLUDED.loyer_hc, charges = EXCLUDED.charges,
         modifie_le = now(), modifie_par_libelle = $22
       RETURNING id`,
      [a.type === 'avenant' ? 'avenant' : a.type === 'gestion_seule' ? 'gestion_seule' : 'bail', a.dateSignature, id, lotId, proprietaireId, locs.rows[0] ? num(locs.rows[0].id) : null,
        b.proprio ?? '', locs.rows.map((r) => r.libelle).join(', '), a.honoProprietaireHt, a.honoLocataireHt,
        a.negociateurId, negociateur ?? '', a.apporteurId, a.apporteurTaux, a.mandatGestion, prime, a.avecGestion,
        origines.proprietaire, a.origineProprietaire, origines.locataire, a.origineLocataire, auteur.libelle,
        loyerHc, charges]);
    const activiteId = num(rows[0].id);
    // 413 — la part gestion : le mode et le taux de l'apporteur pour CE bail (vides : la règle à la signature), et le taux de gestion
    // du bien RELEVÉ à la signature (ce qui fait les honoraires de gestion du bail, lu à l'écriture, jamais recalculé ensuite).
    if (await commissionGestionDisponible()) {
      await q('UPDATE gestion_location_activite SET apporteur_mode = $2, apporteur_taux_gestion = $3, taux_gestion_bien_ht = $4 WHERE id = $1',
        [activiteId, a.apporteurMode, a.apporteurTauxGestion, await tauxGestionDuBien(q as typeof query, lotId, id)]);
    }
    if (avecAnnuaire) {
      const motif = await ecrireCommercial(q as typeof query, activiteId, {
        origineContact: a.origineContact, collegueId: a.collegueId, apporteurId: a.apporteurId, commissionApporteur: a.commissionApporteur,
        primeMode: a.primeMode, primeMontant: a.primeMontant,
        origineContactPrecision: a.origineContactPrecision,
      }, a.apporteurTaux, auteur);
      // Un refus (apporteur à rattacher) annule TOUTE l'écriture : rien de la ligne ne reste (lu avant d'écrire : piège withTransaction).
      if (motif !== null) throw new RefusSuivi(motif);
    }
    return { etat: 'ok', data: { id: activiteId } } as const;
  });
}

/**
 * 🔴 Arno (24/10/2026) — « DOSSIER DE LOCATION » : met à jour LA ligne de suivi existante (par son identifiant, jamais une seconde
 * ligne — une ligne « avenant » du même bail n'est pas confondue avec le bail), avec la saisie du bloc 4 de « Nouveau locataire ».
 * Les mêmes vérifications que la saisie (`verifierActivite`, `ecrireCommercial` : apporteur à rattacher, une seule prime par bien,
 * origine) ; un refus annule TOUTE l'écriture. `conserverMontants` : taux et honoraires d'apporteur non touchés → la valeur exacte
 * en base reste. Les libellés, le bien et les personnes de la ligne ne sont pas touchés (lus dans l'annuaire).
 */
export async function mettreAJourActivite(activiteId: number, brut: unknown, auteur: Auteur, o: { conserverMontants?: boolean } = {}): Promise<Reponse> {
  try {
    if (!(await suiviDisponible())) return INDISPONIBLE;
    const avecAnnuaire = await annuaireDisponible();
    const v = verifierActivite(brut, { origineObligatoire: avecAnnuaire });
    if (!v.ok) return { etat: 'refus', motif: v.motif };
    const br = (brut ?? {}) as Record<string, unknown>;
    const categorie: CategoriePrime | null = br.categoriePrime === 'parking' || br.categoriePrime === 'logement' || br.categoriePrime === 'local' ? br.categoriePrime : null;
    const prime = categorie === null ? null : await categorieEnregistrable(categorie);
    const a = v.valeurs;
    return await withTransaction(async (q) => {
      const ligne = (await q<{ id: string }>('SELECT id FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE', [activiteId])).rows[0];
      if (ligne === undefined) return { etat: 'refus', motif: 'Cette ligne du suivi n’existe plus.' } as const;
      const negociateur = a.negociateurId === null ? null
        : (await q<{ libelle: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant, '') AS libelle FROM admin_utilisateur WHERE id = $1`,
          [a.negociateurId])).rows[0]?.libelle ?? null;
      await q(
        `UPDATE gestion_location_activite SET type = $2,
                date_signature_supposee = CASE WHEN date_signature = $3::date THEN date_signature_supposee ELSE false END, date_signature = $3,
                hono_proprietaire_ht = $4, hono_locataire_ht = $5, negociateur_id = $6, negociateur_libelle = coalesce($7, ''),
                avec_gestion = $8, mandat_gestion = $9, categorie_prime = coalesce($10, categorie_prime),
                origine_proprietaire_saisie = $11, origine_locataire_saisie = $12, modifie_le = now(), modifie_par_libelle = $13
          WHERE id = $1`,
        [activiteId, a.type, a.dateSignature, a.honoProprietaireHt, a.honoLocataireHt, a.negociateurId, negociateur, a.avecGestion, a.mandatGestion, prime,
          a.origineProprietaire, a.origineLocataire, auteur.libelle]);
      if (await commissionGestionDisponible()) {
        await q('UPDATE gestion_location_activite SET apporteur_mode = $2, apporteur_taux_gestion = $3 WHERE id = $1', [activiteId, a.apporteurMode, a.apporteurTauxGestion]);
      }
      if (avecAnnuaire) {
        const motif = await ecrireCommercial(q as typeof query, activiteId, {
          origineContact: a.origineContact, collegueId: a.collegueId, apporteurId: a.apporteurId, commissionApporteur: a.commissionApporteur,
          primeMode: a.primeMode, primeMontant: a.primeMontant, origineContactPrecision: a.origineContactPrecision,
        }, a.apporteurTaux, auteur, o.conserverMontants === true);
        if (motif !== null) throw new RefusSuivi(motif);
      }
      return { etat: 'ok' } as const;
    }).then(async (r) => {
      // 🔴 Arno (25/10/2026) — le « Type de bien » du bloc 4 : sur la fiche du bien (la source unique).
      if (r.etat !== 'ok') return r;
      const note = await typeDeBienVersFiche(activiteId, categorie, auteur);
      return note === null ? r : { etat: 'ok' as const, data: { note } };
    });
  } catch (e) {
    if (e instanceof RefusSuivi) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

/** Le « Type de bien » de la saisie (Logement, Local, Parking), ou `null`. PUR. */
const categorieChoisie = (brut: unknown): CategoriePrime | null => {
  const v = ((brut ?? {}) as Record<string, unknown>).categoriePrime;
  return v === 'parking' || v === 'logement' || v === 'local' ? v : null;
};

/** Ce que l'écran « Nouveau locataire » propose avant la saisie : le statut de gestion du bien et l'origine déduite. */
export async function proposerActivite(lotId: unknown, locataireIds: unknown, dateSignature: unknown): Promise<Reponse<{
  avecGestion: boolean; categoriePrime: CategoriePrime; origineProprietaire: Origine | null; origineLocataire: Origine | null;
  /** 407 — le bien était-il déjà en gestion AVANT la date (dernier statut daté avant elle) ? */
  enGestionAvant: boolean;
  /** 413 — le taux de gestion HT du bien (en %), pour la part gestion de l'apporteur ; null : inconnu. */
  tauxGestionBien: number | null;
  /** 🔴 Arno (24/10/2026) — la situation du bien et ce qui en découle (voir `casGestionDuBien`). */
  cas: CasGestion;
  entreeGestion: string | null;
  dejaLoueEnGestion: boolean;
  primeDejaVersee: { date: string; bail: string } | null;
  /** 🔴 Arno (25/10/2026, 425) — l'origine du contact du titulaire du bien, héritée par la nouvelle location (null : sans la 425). */
  origineBien: OrigineDuBien | null;
  /** 🔴 Arno (25/10/2026, 426) — le bien loué est une ANNEXE (date de la bascule ou après) : son lot principal ; comptée en relocation. */
  annexe: AnnexeLouee | null;
}>> {
  const lot = typeof lotId === 'number' && Number.isInteger(lotId) && lotId > 0 ? lotId : null;
  const date = typeof dateSignature === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSignature) ? dateSignature : null;
  if (lot === null || date === null) return { etat: 'refus', motif: 'Bien ou date inconnus.' };
  const ids = Array.isArray(locataireIds) ? locataireIds.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0) : [];
  const { rows } = await query<{ statut_bien: string | null; categorie: string | null; proprietaire_id: string | null; nature: string | null; type_bien: string | null }>(
    `SELECT ${(await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')) ? 'statut_bien' : "CASE WHEN en_gestion THEN 'en_gestion' END AS statut_bien"},
            categorie, proprietaire_id, nature, type_bien FROM gestion_annuaire_lot WHERE id = $1`, [lot]);
  if (rows.length === 0) return { etat: 'refus', motif: 'Bien inconnu.' };
  const origines = await deduireOrigines(query, { bailId: 0, lotId: lot, proprietaireId: numOuNull(rows[0].proprietaire_id), locataireIds: ids, date });
  const avecTransitions = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const enGestionAvant = avecTransitions && (await query<{ apres: string }>(
    'SELECT apres FROM gestion_bien_statut_transition WHERE lot_id = $1 AND effet_le < $2 ORDER BY effet_le DESC, id DESC LIMIT 1', [lot, date])).rows[0]?.apres === 'en_gestion';
  /**
   * 🔴 Arno (24/10/2026) — « DÉJÀ LOUÉ PAR NOUS DEPUIS L'ENTRÉE EN GESTION ». L'entrée en gestion : la DERNIÈRE transition vers « en
   * gestion » à la date de signature ou avant (historique du statut, 403). Déjà loué : un bail du bien (fiche, import WIPPIMMO) ENTRÉ
   * depuis cette entrée et au plus tard à la signature, OU une affaire du suivi (saisie ou reprise du fichier) signée dans le même
   * intervalle. Un locataire DÉJÀ EN PLACE quand le mandat a été pris (bail entré avant) ne compte pas : notre première location sera
   * celle du nouveau mandat. Sans historique de statut : toute location antérieure du bien compte (prudence : pas de prime d'office).
   */
  const enGestion = rows[0].statut_bien === 'en_gestion';
  const entreeGestion = !enGestion || !avecTransitions ? null : (await query<{ effet_le: string }>(
    `SELECT effet_le::text FROM gestion_bien_statut_transition WHERE lot_id = $1 AND apres = 'en_gestion' AND effet_le <= $2
      ORDER BY effet_le DESC, id DESC LIMIT 1`, [lot, date])).rows[0]?.effet_le ?? null;
  const dejaLoueEnGestion = enGestion && (await query<{ deja: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM gestion_bail b WHERE b.lot_id = $1 AND b.entree IS NOT NULL AND b.entree <= $2::date
                      AND ($3::date IS NULL OR b.entree >= $3::date))
         OR EXISTS (SELECT 1 FROM gestion_location_activite a WHERE a.lot_id = $1 AND a.annule_le IS NULL AND a.type = 'bail'
                      AND a.date_signature <= $2::date AND ($3::date IS NULL OR a.date_signature >= $3::date)) AS deja`,
    [lot, date, entreeGestion])).rows[0]?.deja === true;
  const deja = await primeDejaVersee(query, lot);
  // 🔴 Arno (25/10/2026, 426) — une ANNEXE louée (après la bascule) : « Relocation » selon la gestion de son lot principal à la signature,
  // jamais « Nouvelle gestion » ; la prime reste possible (sa propre première entrée en gestion, une seule pour toute sa vie).
  const regleAnnexes = await lireRegleAnnexes();
  const annexe = regleAnnexes.basculeAnnexes !== null && date >= regleAnnexes.basculeAnnexes && regleAnnexes.annexes.includes(lot)
    ? await principalDeLAnnexe(lot, date) : null;
  const casCalcule = casGestionDuBien({ enGestion, dejaLoueEnGestion, primeDejaVersee: deja !== null });
  return {
    etat: 'ok',
    data: {
      avecGestion: enGestion,
      categoriePrime: categoriePrimeDeFamille(familleDuLot({ categorie: rows[0].categorie, nature: rows[0].nature, typeBien: rows[0].type_bien })),
      origineProprietaire: origines.proprietaire, origineLocataire: origines.locataire, enGestionAvant,
      tauxGestionBien: await tauxGestionDuBien(query, lot, null),
      cas: annexe === null ? casCalcule : annexe.principalEnGestion ? 'relocation' : 'hors_gestion', entreeGestion, dejaLoueEnGestion, primeDejaVersee: deja,
      origineBien: await origineDuBien(lot), annexe,
    },
  };
}

// ── Le droit « Voir les commissions » ─────────────────────────────────────────────────────────────────────────────

/**
 * Peut voir les commissions des négociateurs (section « Négociateurs », primes, rétrocessions) : administrateur (implicite), OU droit
 * `perm_commissions` (migration 406). RELU EN BASE à chaque appel (un droit retiré l'est aussitôt). Voie de secours (compte
 * sans identifiant, garde administrateur déjà passée) : oui.
 */
/**
 * 🔴 Arno (25/10/2026) — LE VARIABLE DES NÉGOCIATEURS (cascade, variable, taux, rétrocessions, commission brute, net de toutes variables) :
 * un ADMINISTRATEUR voit tout ; tout autre compte ne reçoit que SA propre cascade (calculée ici, côté serveur), jamais celle d'un autre.
 * Cette règle remplace, pour le variable, le droit « Voir les commissions ». `null` (voie de secours administrateur) : administrateur.
 */
export async function estAdministrateurActif(auteurId: number | null): Promise<boolean> {
  if (auteurId === null) return true;
  const { rows } = await query<{ ok: boolean }>(`SELECT (role = 'administrateur') AS ok FROM admin_utilisateur WHERE id = $1 AND actif`, [auteurId]);
  return rows[0]?.ok === true;
}

export async function peutVoirCommissions(auteurId: number | null): Promise<boolean> {
  if (auteurId === null) return true;
  const avecDroit = await colonneExisteMemo('admin_utilisateur', 'perm_commissions');
  const { rows } = await query<{ ok: boolean }>(
    `SELECT (role = 'administrateur' ${avecDroit ? 'OR perm_commissions IS TRUE' : ''}) AS ok FROM admin_utilisateur WHERE id = $1 AND actif`, [auteurId]);
  return rows[0]?.ok === true;
}
