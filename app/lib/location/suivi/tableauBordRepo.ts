import 'server-only';
import { query } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { familleDuLot } from '../bienComplet';
import type { Origine, TypeActivite, CategoriePrime } from './suivi';
import { aUnDuMensuel, champsResultatNet, historiqueAnnees, NATURES_BIEN, suiviDuNegociateur, variablesDuNegociateur, type EcartFichier, type ActiviteCalcul, type ActiviteLue, type Assurance, type DonneesTableau, type LigneGestion, type NatureBien, type Transition, type CascadeNegociateur } from './tableauBord';
import { typeDeBienDesFiches } from './suivi';
import { aujourdhuiParis, type ModeApporteur, type ModePrime, type OrigineContact } from './suivi';
import { enrichirGestionMensuelle } from '../gestionMensuelleRepo';
import { annexesDesLocations, lireLiensAnnexesAffiches, lireRegleAnnexes } from './annexesGestionRepo';
import { lireGli, lireMargesGli } from './margeGliRepo';
import { annuaireDisponible, statutBienManuelDisponible, commissionGestionDisponible, origineDejaClientDisponible, lireApporteurs, lireComptesInterface, lireRegles, lireRetrocessions, suiviDisponible } from './suiviRepo';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : CE QUE LE TABLEAU DE BORD LIT (Arno, 22/10/2026) ════════════════════════════════════════
 * LECTURE SEULE. Les lignes d'activité des années demandées (non annulées), enrichies de ce que la base sait du bail :
 * l'assurance des loyers (conditions d'entrée, migration 391), la vacance avant l'entrée (sortie du bail précédent du même
 * bien), le parking (famille du bien). Et pour la gestion récurrente : les transitions de statut du bien (migration 403), le
 * nombre de biens en gestion aujourd'hui, les préavis reçus par mois. Une table absente (migration non appliquée) : rien.
 */

const n = (v: unknown): number => Number(v);
const nOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

/**
 * Les noms d'une ligne : ceux de l'annuaire quand elle est rattachée à un bail (à jour partout dans le Suivi), sinon son texte.
 * Le texte d'origine (le fichier, pour une ligne reprise) reste lu : le panneau le montre sous « Libellé d'origine » (rien ne
 * disparaît). PUR.
 */
export function libelles(r: Record<string, unknown>): { libelleProprietaire: string; libelleLocataire: string; libelleOrigine?: { proprietaire: string; locataire: string } } {
  const texteP = String(r.libelle_proprietaire ?? '');
  const texteL = String(r.libelle_locataire ?? '');
  const sourceP = typeof r.proprietaire_source === 'string' && r.proprietaire_source.trim() !== '' ? r.proprietaire_source : null;
  const sourceL = typeof r.locataires_source === 'string' && r.locataires_source.trim() !== '' ? r.locataires_source : null;
  const p = r.bail_id === null || r.bail_id === undefined ? texteP : sourceP ?? texteP;
  const l = r.bail_id === null || r.bail_id === undefined ? texteL : sourceL ?? texteL;
  return { libelleProprietaire: p, libelleLocataire: l,
    ...(r.source === 'import' && (p !== texteP || l !== texteL) ? { libelleOrigine: { proprietaire: texteP, locataire: texteL } } : {}) };
}

/**
 * 🔴 Arno (25/10/2026) — UNE SEULE SOURCE PAR INFORMATION : le « Type de bien » d'une ligne RATTACHÉE à un bien est celui des FICHES de
 * ses lots (le lot de la ligne et ceux des occupations du bail), par la règle de « Nouveau locataire » (`typeDeBienDesLots` : la
 * catégorie que montre la fiche, déduite de la nature d'un lot importé). La copie de la ligne (`categorie_prime`, posée à l'import ou à
 * la saisie) ne l'emporte plus jamais ; elle reste la seule valeur d'une ligne historique sans bien. PUR.
 */
export function typeDeBienLu(r: Record<string, unknown>): { categoriePrime: CategoriePrime | null; parking: boolean } {
  const lots = Array.isArray(r.lots_fiche) ? r.lots_fiche as { id: unknown; categorie?: string | null; nature?: string | null; type_bien?: string | null }[] : [];
  const t = typeDeBienDesFiches(r.lot_id === null || r.lot_id === undefined ? null : Number(r.lot_id), lots);
  if (t !== null) return { categoriePrime: t, parking: t === 'parking' };
  const copie = (r.categorie_prime as CategoriePrime | null) ?? null;
  return { categoriePrime: copie,
    parking: copie === 'parking' || familleDuLot({ categorie: r.categorie as string | null, nature: r.nature as string | null, typeBien: r.type_bien as string | null }) === 'parking' };
}

/** 🔴 Arno (25/10/2026) — un compte (négociateur, collègue) : son nom dans l'interface ; la copie de la ligne seulement sans compte. PUR. */
export const nomDuCompte = (compte: unknown, copie: unknown): string =>
  (typeof compte === 'string' && compte.trim() !== '' ? compte : String(copie ?? ''));

/** 🔴 Arno (25/10/2026, 424) — le « Statut du bien » validé à la main : le statut, qui (le compte, sinon le libellé gardé), quand. PUR. */
export function natureManuelleLue(r: Record<string, unknown>): ActiviteCalcul['natureManuelle'] {
  if (typeof r.statut_bien_manuel !== 'string' || !(NATURES_BIEN as readonly string[]).includes(r.statut_bien_manuel)) return null;
  const le = r.statut_bien_valide_le instanceof Date ? r.statut_bien_valide_le.toISOString() : String(r.statut_bien_valide_le ?? '');
  return { nature: r.statut_bien_manuel as NatureBien, par: nomDuCompte(r.statut_bien_valide_compte, r.statut_bien_valide_par_libelle) || 'compte inconnu', le };
}

/** Une liste `json_agg` de { id, libelle } (absente : vide). */
const fiches = (v: unknown): { id: number; libelle: string }[] => (Array.isArray(v) ? v : [])
  .map((x: { id?: unknown; libelle?: unknown }) => ({ id: Number(x.id), libelle: String(x.libelle ?? '') })).filter((x) => Number.isSafeInteger(x.id) && x.id > 0);

export async function lireActivites(annees: readonly number[]): Promise<ActiviteLue[]> {
  if (!(await suiviDisponible()) || annees.length === 0) return [];
  const avecAssurance = await colonneExisteMemo('gestion_location_conditions_entree', 'bail_id');
  const avec407 = await annuaireDisponible();
  const avec411 = await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
  const avec413 = await commissionGestionDisponible();
  const avecStatut = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const avecBailOcc = await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id');
  const avec424 = await statutBienManuelDisponible();
  const avec431 = await colonneExisteMemo('gestion_location_activite', 'converti_le');
  const compte = (col: string): string => `(SELECT coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) FROM admin_utilisateur u WHERE u.id = a.${col})`;
  // 🔴 Arno (24/10/2026) — les LOCATAIRES et les BIENS de la ligne, lus dans l'annuaire (la source) : les raccourcis « Fiche
  // locataire » / « Fiche du bien » du panneau déplié. Locataires : les occupants du bail, sinon le locataire de la ligne ; biens :
  // le lot de la ligne et ceux des occupations du bail. Une ligne sans bail ni lot rattaché n'en a pas (« non rattaché »).
  const nomLocataire = `coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom)`;
  const libelleLot = `coalesce(nullif(concat_ws(' — ', nullif(btrim(lt.nature), ''), nullif(btrim(concat_ws(' ', lt.adresse, lt.commune)), '')), ''), 'Bien n° ' || lt.id)`;
  const { rows } = await query<Record<string, unknown>>(
    `SELECT a.id, a.type, a.date_signature, a.date_signature_supposee, a.libelle_proprietaire, a.libelle_locataire,
            a.hono_proprietaire_ht, a.hono_locataire_ht, a.prime_gestion_saisie, a.mandat_gestion, a.categorie_prime,
            a.apporteur_id, ap.nom AS apporteur_nom, a.apporteur_taux, a.apporteur_commission_saisie,
            a.negociateur_id, a.negociateur_libelle, a.avec_gestion,
            coalesce(a.origine_proprietaire_saisie, a.origine_proprietaire_deduite) AS origine_proprietaire,
            coalesce(a.origine_locataire_saisie, a.origine_locataire_deduite) AS origine_locataire,
            a.loyer_hc, a.charges, a.rattachement, a.source, a.lot_id, a.bail_id, l.categorie, l.nature, l.type_bien,
            ${avec407 ? 'a.origine_contact, a.collegue_id, a.collegue_libelle, a.prime_mode' : 'NULL::text AS origine_contact, NULL::bigint AS collegue_id, NULL::text AS collegue_libelle, NULL::text AS prime_mode'},
            ${avec411 ? 'a.origine_contact_precision' : 'NULL::text AS origine_contact_precision'},
            ${avec424 ? `a.statut_bien_manuel, a.statut_bien_valide_le, ${compte('statut_bien_valide_par')} AS statut_bien_valide_compte, a.statut_bien_valide_par_libelle`
              : 'NULL::text AS statut_bien_manuel, NULL::timestamptz AS statut_bien_valide_le, NULL::text AS statut_bien_valide_compte, NULL::text AS statut_bien_valide_par_libelle'},
            ${avec431 ? 'a.converti_le, a.converti_par_libelle, a.type_origine, a.date_signature_origine'
              : 'NULL::timestamptz AS converti_le, NULL::text AS converti_par_libelle, NULL::text AS type_origine, NULL::date AS date_signature_origine'},
            ${compte('negociateur_id')} AS negociateur_compte,
            ${avec407 ? compte('collegue_id') : 'NULL::text'} AS collegue_compte,
            -- 🔴 Arno (25/10/2026) — les FICHES des lots de la ligne (le « Type de bien » : une seule source, la fiche du bien).
            (SELECT json_agg(json_build_object('id', lt.id, 'categorie', lt.categorie, 'nature', lt.nature, 'type_bien', lt.type_bien) ORDER BY lt.id) FROM gestion_annuaire_lot lt
              WHERE lt.id = a.lot_id${avecBailOcc ? ' OR lt.id IN (SELECT oc.lot_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = a.bail_id)' : ''}) AS lots_fiche,
            ${avec413 ? 'a.apporteur_mode, a.apporteur_taux_gestion, a.taux_gestion_bien_ht' : 'NULL::text AS apporteur_mode, NULL::numeric AS apporteur_taux_gestion, NULL::numeric AS taux_gestion_bien_ht'},
            ${avecStatut ? `(SELECT min(t.effet_le) FROM gestion_bien_statut_transition t
                              WHERE t.lot_id = a.lot_id AND t.avant = 'en_gestion' AND t.apres <> 'en_gestion' AND t.effet_le >= a.date_signature)` : 'NULL::date'} AS fin_gestion,
            ${avecAssurance ? `(SELECT ce.assurance_loyers FROM gestion_location_conditions_entree ce WHERE ce.bail_id = a.bail_id ORDER BY ce.id DESC LIMIT 1)` : 'NULL::text'} AS assurance,
            coalesce(${avecBailOcc ? `(SELECT json_agg(json_build_object('id', lo.id, 'libelle', ${nomLocataire}) ORDER BY lo.id)
                FROM gestion_annuaire_locataire lo WHERE lo.id IN (SELECT oc.locataire_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = a.bail_id)), ` : ''}
              (SELECT json_agg(json_build_object('id', lo.id, 'libelle', ${nomLocataire})) FROM gestion_annuaire_locataire lo WHERE lo.id = a.locataire_id)) AS locataires,
            -- 🔴 Arno (24/10/2026, Q1) — une ligne rattachée à un BAIL lit ses noms dans l'annuaire (la formule de la saisie : le
            -- propriétaire du bien, les occupants du bail « prénom nom » séparés par « , ») ; sinon (ou rien d'annuaire) : le texte.
            (SELECT p.nom_complet FROM gestion_bail b JOIN gestion_annuaire_lot lb ON lb.id = b.lot_id
               JOIN gestion_annuaire_proprietaire p ON p.id = lb.proprietaire_id WHERE b.id = a.bail_id) AS proprietaire_source,
            ${avecBailOcc ? `(SELECT nullif(string_agg(${nomLocataire}, ', ' ORDER BY lo.id), '')
               FROM gestion_annuaire_locataire lo WHERE lo.id IN (SELECT oc.locataire_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = a.bail_id))` : 'NULL::text'} AS locataires_source,
            (SELECT json_agg(json_build_object('id', lt.id, 'libelle', ${libelleLot}) ORDER BY lt.id) FROM gestion_annuaire_lot lt
              WHERE lt.id = a.lot_id${avecBailOcc ? ' OR lt.id IN (SELECT oc.lot_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = a.bail_id)' : ''}) AS lots,
            (SELECT b.entree - max(p.sortie) FROM gestion_bail b JOIN gestion_bail p ON p.lot_id = b.lot_id AND p.id <> b.id AND p.sortie IS NOT NULL AND p.sortie <= b.entree
              WHERE b.id = a.bail_id GROUP BY b.entree) AS vacance
       FROM gestion_location_activite a
       LEFT JOIN gestion_location_apporteur ap ON ap.id = a.apporteur_id
       LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
      WHERE a.annule_le IS NULL AND extract(year FROM a.date_signature)::int = ANY($1::int[])
      ORDER BY a.date_signature, a.id`, [[...annees]]);
  const lues: ActiviteLue[] = rows.map((r) => ({
    id: n(r.id), type: r.type as TypeActivite, dateSignature: iso(r.date_signature), dateSupposee: r.date_signature_supposee === true,
    ...libelles(r),
    honoProprietaireHt: n(r.hono_proprietaire_ht), honoLocataireHt: n(r.hono_locataire_ht),
    primeSaisie: nOuNull(r.prime_gestion_saisie), mandatGestion: r.mandat_gestion === true, ...typeDeBienLu(r),
    apporteurId: nOuNull(r.apporteur_id), apporteurNom: (r.apporteur_nom as string | null) ?? null, apporteurTaux: nOuNull(r.apporteur_taux),
    commissionSaisie: nOuNull(r.apporteur_commission_saisie),
    negociateurId: nOuNull(r.negociateur_id), negociateurLibelle: nomDuCompte(r.negociateur_compte, r.negociateur_libelle), avecGestion: r.avec_gestion === true,
    origineProprietaire: (r.origine_proprietaire as Origine | null) ?? null, origineLocataire: (r.origine_locataire as Origine | null) ?? null,
    loyerHc: nOuNull(r.loyer_hc), charges: nOuNull(r.charges), assurance: (r.assurance as Assurance | null) ?? null,
    vacanceJours: nOuNull(r.vacance), rattachement: r.rattachement as ActiviteCalcul['rattachement'],
    lotId: nOuNull(r.lot_id), bailId: nOuNull(r.bail_id), source: String(r.source),
    origineContact: (r.origine_contact as OrigineContact | null) ?? null, collegueId: nOuNull(r.collegue_id),
    collegueLibelle: r.collegue_id === null || r.collegue_id === undefined ? (r.collegue_libelle as string | null) ?? null : nomDuCompte(r.collegue_compte, r.collegue_libelle),
    primeMode: (r.prime_mode as ModePrime | null) ?? null,
    natureManuelle: natureManuelleLue(r),
    origineContactPrecision: (r.origine_contact_precision as string | null) ?? null,
    apporteurMode: r.apporteur_mode === 'recurrent' || r.apporteur_mode === 'one_shot' ? r.apporteur_mode as ModeApporteur : null,
    apporteurTauxGestion: nOuNull(r.apporteur_taux_gestion), tauxGestionBien: nOuNull(r.taux_gestion_bien_ht),
    finGestion: r.fin_gestion === null || r.fin_gestion === undefined ? null : iso(r.fin_gestion),
    locataires: fiches(r.locataires), lots: fiches(r.lots),
    conversion: r.converti_le === null || r.converti_le === undefined ? null : {
      le: r.converti_le instanceof Date ? r.converti_le.toISOString() : String(r.converti_le), par: String(r.converti_par_libelle ?? ''),
      typeOrigine: String(r.type_origine ?? 'bail'), dateOrigine: iso(r.date_signature_origine) },
  }));
  // 🔴 Arno (25/10/2026) — la commission RÉCURRENTE sur la gestion, mois par mois (loyer révisé, vacance, sortie de gestion) : calculée à
  // chaque lecture, sur les seuls dossiers saisis dans l'outil (les montants repris du fichier restent tels quels).
  if (lues.some((x) => x.source !== 'import' && x.lotId !== null && x.apporteurId !== null)) {
    await enrichirGestionMensuelle(lues, await lireApporteurs(), aujourdhuiParis());
  }
  return lues;
}

/** Les années où il y a de l'activité (pour le filtre « Année »). */
export async function anneesActives(): Promise<number[]> {
  if (!(await suiviDisponible())) return [];
  const { rows } = await query<{ annee: number }>(
    'SELECT DISTINCT extract(year FROM date_signature)::int AS annee FROM gestion_location_activite WHERE annule_le IS NULL ORDER BY 1');
  return rows.map((r) => n(r.annee));
}

/**
 * 🔴 Arno (26/10/2026, 430) — LA DATE D'EFFET D'UNE TRANSITION, CORRECTION COMPRISE : le journal des transitions est en ajout seul ; la date
 * du mandat d'un bien existant reconnu « rentré occupé » est posée à part (`gestion_bien_statut_effet_corrige`) et lue à la place de la
 * date d'origine. Sans la migration 430 : la date d'origine, exactement comme avant.
 */
async function sqlEffetCorrige(alias: string): Promise<string> {
  return (await colonneExisteMemo('gestion_bien_statut_effet_corrige', 'effet_le'))
    ? `coalesce((SELECT c.effet_le FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = ${alias}.id AND c.retire_le IS NULL), ${alias}.effet_le)`
    : `${alias}.effet_le`;
}

/** 🔴 431 — la date à partir de laquelle un bien rentré VIDE entre dans le suivi à l'entrée de son 1er locataire (paramètre ; `null` : jamais). */
export async function lireBasculeEntreeLocataire(): Promise<string | null> {
  if (!(await colonneExisteMemo('gestion_location_parametre_date', 'valeur'))) return null;
  const r = (await query<{ v: string }>(
    `SELECT valeur::text AS v FROM gestion_location_parametre_date WHERE cle = 'bascule_entree_locataire' ORDER BY pose_le DESC, id DESC LIMIT 1`)).rows[0];
  return r !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(r.v) ? r.v : null;
}

/**
 * ══ 🔴🔴 Arno (26/10/2026, décision B, migration 431) — LA DATE D'ENTRÉE D'UNE GESTION DANS LE SUIVI ══════════════════════════════════════
 * Dans cet ordre :
 *   ① une date d'effet CORRIGÉE (430 : bien existant reconnu « rentré occupé ») ;
 *   ② un bien rentré OCCUPÉ (430) : la date d'effet d'origine — la date du mandat, posée à la création ;
 *   ③ une ENTRÉE en gestion datée de la bascule (paramètre `bascule_entree_locataire`) ou après, d'un bien rentré VIDE (ou non renseigné) :
 *      la date d'entrée de son PREMIER LOCATAIRE (occupation du lot encore en cours à l'entrée en gestion), jamais avant la bascule ;
 *      sans locataire : NULL — le bien n'est pas compté, il est « en attente de locataire » (montré à part, jamais effacé) ;
 *   ④ sinon : la date d'origine (tout ce qui précède la bascule, et toutes les sorties), exactement comme avant.
 * Sans la 431 (aucune bascule) : ① ou la date d'origine, comme avant. L'historique (`gestion_bien_statut_transition`) n'est jamais réécrit.
 */
async function sqlEffet(alias: string): Promise<string> {
  const corrige = await sqlEffetCorrige(alias);
  const bascule = await lireBasculeEntreeLocataire();
  if (bascule === null) return corrige;
  const occupe = (await colonneExisteMemo('gestion_annuaire_lot', 'entre_occupe'))
    ? `coalesce((SELECT lo.entre_occupe FROM gestion_annuaire_lot lo WHERE lo.id = ${alias}.lot_id), false)` : 'false';
  const avecCorrection = await colonneExisteMemo('gestion_bien_statut_effet_corrige', 'effet_le');
  const d = `DATE '${bascule}'`;
  return `(CASE
    WHEN ${avecCorrection ? `EXISTS (SELECT 1 FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = ${alias}.id AND c.retire_le IS NULL)` : 'false'} THEN ${corrige}
    WHEN ${alias}.apres = 'en_gestion' AND ${alias}.avant IS DISTINCT FROM 'en_gestion' AND ${alias}.effet_le >= ${d} AND NOT ${occupe}
      THEN (SELECT CASE WHEN z.m IS NULL THEN NULL ELSE greatest(${d}, z.m) END FROM (SELECT min(o.entree) AS m FROM gestion_annuaire_occupation o
             WHERE o.lot_id = ${alias}.lot_id AND o.entree IS NOT NULL AND (o.sortie IS NULL OR o.sortie >= ${alias}.effet_le)) z)
    ELSE ${alias}.effet_le END)`;
}

/** Les transitions de statut du bien depuis `depuis` (AAAA-MM-JJ), et le nombre de biens en gestion aujourd'hui. */
export async function lireGestion(depuis: string): Promise<{ transitions: Transition[]; stock: number; disponible: boolean }> {
  const avecStatut = await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien');
  if (!avecStatut) return { transitions: [], stock: 0, disponible: false };
  const effet = await sqlEffet('t');
  // 🔴 431 — un bien « en attente de locataire » n'est pas compté : ni entrée, ni stock (sinon les mois passés grossiraient de lui).
  const [t, s] = await Promise.all([
    query<{ lot_id: string; avant: string | null; apres: string; effet_le: Date }>(
      `SELECT x.lot_id, x.avant, x.apres, x.effet_le FROM (SELECT t.id, t.lot_id, t.avant, t.apres, ${effet} AS effet_le FROM gestion_bien_statut_transition t) x
        WHERE x.effet_le >= $1 ORDER BY x.effet_le, x.id`, [depuis]),
    query<{ nb: string }>(
      `SELECT count(*) AS nb FROM gestion_annuaire_lot l WHERE l.statut_bien = 'en_gestion'
          AND NOT EXISTS (SELECT 1 FROM (SELECT t.id, t.lot_id, t.avant, t.apres, t.effet_le, ${effet} AS effet FROM gestion_bien_statut_transition t
                                           WHERE t.lot_id = l.id AND t.apres = 'en_gestion' AND t.avant IS DISTINCT FROM 'en_gestion'
                                           ORDER BY t.survenu_le DESC, t.id DESC LIMIT 1) d WHERE d.effet IS NULL)`),
  ]);
  return {
    transitions: t.rows.map((r) => ({ lotId: n(r.lot_id), avant: r.avant, apres: r.apres, effetLe: iso(r.effet_le) })),
    stock: n(s.rows[0]?.nb ?? 0), disponible: true,
  };
}

/**
 * 407 — les ENTRÉES en gestion et les SORTIES (mandats perdus) d'une période, avec le bien, son propriétaire, et le loyer et le
 * taux de gestion du bail en cours à la date (le dernier bail entré au plus tard deux mois après) : de quoi chiffrer les
 * honoraires de gestion gagnés et perdus. Sans loyer saisi : la ligne est là, sans montant (rien n'est inventé).
 */
export async function lireLignesGestion(debut: string, fin: string): Promise<LigneGestion[]> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien'))) return [];
  const effet = await sqlEffet('t');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT t.lot_id, t.avant, t.apres, ${effet} AS effet_le, concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS libelle,
            coalesce(p.nom_complet, '') AS proprietaire, c.loyer_hc, c.provisions, c.base, c.taux_gestion_ht
       FROM gestion_bien_statut_transition t
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id
       LEFT JOIN LATERAL (
         SELECT x.loyer_hc, x.provisions, x.base, x.taux_gestion_ht FROM gestion_bail b JOIN gestion_location_conditions x ON x.bail_id = b.id
          WHERE b.lot_id = t.lot_id AND (b.entree IS NULL OR b.entree <= ${effet} + 62)
          ORDER BY b.entree DESC NULLS LAST, x.id DESC LIMIT 1) c ON true
      WHERE ${effet} BETWEEN $1 AND $2 AND (t.apres = 'en_gestion' OR t.avant = 'en_gestion')
      ORDER BY 4, t.id`, [debut, fin]);
  return rows.map(ligneGestionLue);
}

/**
 * 🔴 Arno (26/10/2026, décision B, 431) — LES BIENS « EN ATTENTE DE LOCATAIRE » : entrés en gestion (date d'origine dans la période) depuis
 * la bascule, rentrés vides, sans locataire encore — ni comptés, ni effacés : montrés dans le bloc replié de la page du mois. Sans la 431 :
 * aucun. LECTURE SEULE.
 */
export async function lireGestionsEnAttente(debut: string, fin: string): Promise<LigneGestion[]> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')) || (await lireBasculeEntreeLocataire()) === null) return [];
  const effet = await sqlEffet('t');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT t.lot_id, t.avant, t.apres, t.effet_le, concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS libelle,
            coalesce(p.nom_complet, '') AS proprietaire, NULL::numeric AS loyer_hc, NULL::numeric AS provisions, NULL::text AS base, NULL::numeric AS taux_gestion_ht
       FROM gestion_bien_statut_transition t
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id
      WHERE t.effet_le BETWEEN $1 AND $2 AND t.apres = 'en_gestion' AND t.avant IS DISTINCT FROM 'en_gestion' AND ${effet} IS NULL
      ORDER BY t.effet_le, t.id`, [debut, fin]);
  return rows.map(ligneGestionLue);
}

/** Une ligne de gestion lue (entrée, sortie, ou en attente). */
function ligneGestionLue(r: Record<string, unknown>): LigneGestion {
  return {
    lotId: n(r.lot_id), libelle: String(r.libelle || `Bien n° ${r.lot_id}`), proprietaire: String(r.proprietaire), effetLe: iso(r.effet_le),
    avant: (r.avant as string | null) ?? null, apres: String(r.apres), loyerHc: nOuNull(r.loyer_hc), provisions: nOuNull(r.provisions),
    base: (r.base as 'cc' | 'hc' | null) ?? null, tauxHt: nOuNull(r.taux_gestion_ht),
  };
}

/**
 * 408 — les gestions perdues notées dans le suivi mensuel (décision d'Arno, 23/10/2026), en lignes du bloc « Mandats de gestion
 * perdus » : le bien rapproché (ou aucun), les loyers cc du fichier comme assiette (base cc), le taux retenu et sa source.
 */
export async function lireGestionsPerduesFichier(debut: string, fin: string): Promise<LigneGestion[]> {
  if (!(await colonneExisteMemo('gestion_location_gestion_perdue', 'import_cle'))) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT g.mois, g.lot_id, g.libelle_fichier, g.proprietaire, g.loyers_cc, g.taux_ht, g.taux_source, g.commentaire,
            concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS adresse
       FROM gestion_location_gestion_perdue g LEFT JOIN gestion_annuaire_lot l ON l.id = g.lot_id
      WHERE g.annule_le IS NULL AND g.mois BETWEEN $1 AND $2 ORDER BY g.mois, g.id`, [debut, fin]);
  return rows.map((r) => ({
    lotId: nOuNull(r.lot_id), libelle: String(r.adresse || r.libelle_fichier), proprietaire: String(r.proprietaire ?? r.libelle_fichier), effetLe: iso(r.mois),
    avant: 'en_gestion', apres: 'perdue_fichier', loyerHc: nOuNull(r.loyers_cc), provisions: 0, base: 'cc', tauxHt: nOuNull(r.taux_ht),
    origine: 'fichier', tauxSource: (r.taux_source as LigneGestion['tauxSource']) ?? null, commentaire: (r.commentaire as string | null) ?? null,
  }));
}

/** 408 — les écarts expliqués avec le fichier, sur la période. */
export async function lireEcartsFichier(debut: string, fin: string): Promise<EcartFichier[]> {
  if (!(await colonneExisteMemo('gestion_location_ecart_fichier', 'import_cle'))) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT mois, champ, montant_fichier, montant_outil, libelle FROM gestion_location_ecart_fichier
      WHERE annule_le IS NULL AND mois BETWEEN $1 AND $2 ORDER BY mois, id`, [debut, fin]);
  return rows.map((r) => ({ mois: iso(r.mois).slice(0, 7), champ: r.champ as EcartFichier['champ'], fichier: n(r.montant_fichier), outil: n(r.montant_outil), libelle: String(r.libelle) }));
}

/** Les préavis reçus, par mois (« AAAA-MM » → nombre), pour les années demandées ; ni annulés ni remplacés. */
export async function preavisParMois(annees: readonly number[]): Promise<Record<string, number>> {
  if (!(await colonneExisteMemo('gestion_location_preavis', 'recu_le'))) return {};
  const { rows } = await query<{ mois: string; nb: string }>(
    `SELECT to_char(recu_le, 'YYYY-MM') AS mois, count(*) AS nb FROM gestion_location_preavis
      WHERE annule_le IS NULL AND remplace_le IS NULL AND extract(year FROM recu_le)::int = ANY($1::int[]) GROUP BY 1`, [[...annees]]);
  return Object.fromEntries(rows.map((r) => [r.mois, n(r.nb)]));
}


/**
 * Tout ce que l'écran calcule, pour `annee` et l'année précédente. 🔒 `voirCommissions` = ADMINISTRATEUR (Arno, 25/10/2026) : sinon ni
 * taux du négociateur, ni rétrocession, ni commission d'historique ne partent — le variable n'est pas calculable. `negociateurPropre` :
 * le compte non administrateur, qui reçoit SA seule cascade de négociateur, mois par mois, calculée ici (`variablesPropres`).
 */
/**
 * `toutes` (🔴 Arno, 25/10/2026 — Suivi annuel « Début / Fin ») : les affaires, préavis, écarts expliqués et, pour un négociateur non
 * administrateur, SES cascades et SES lignes de TOUTES les années d'activité ; la page choisit sa période. Sans : l'année et N−1, comme avant.
 */
export async function donneesTableau(annee: number, voirCommissions: boolean, aujourdhui: string, negociateurPropre: number | null = null,
  o: { toutes?: boolean; resultatNet?: boolean } = {}): Promise<DonneesTableau> {
  const disponible = await suiviDisponible();
  const moisFin = annee === Number(aujourdhui.slice(0, 4)) ? aujourdhui.slice(0, 7) : `${annee}-12`;
  const [a, m] = moisFin.split('-').map(Number);
  const douzeMois = new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10);
  // 🔴 Arno (25/10/2026) — les transitions de statut depuis le 1er janvier de N−1 au plus tard : « Mois par mois » (barres « Gestion » et
  // cumul) compare l'année ENTIÈRE à l'année précédente ENTIÈRE ; lues sur 12 mois seulement, janvier → (mois − 12) de N−1 valaient 0 à tort.
  // Les 12 mois de la section D et le stock n'en dépendent pas (une transition plus ancienne que leur fenêtre n'y entre pas).
  // 🔴 Arno (25/10/2026, suite) — et depuis le 1er janvier de la PREMIÈRE année d'activité : « Année par année » (Suivi annuel) compte le
  // solde de gestions de chaque année de l'historique.
  const anneesHisto = await anneesActives();
  const premiere = anneesHisto.length > 0 ? `${Math.min(...anneesHisto)}-01-01` : `${annee - 1}-01-01`;
  const depuis = [douzeMois, `${annee - 1}-01-01`, premiere].sort()[0];
  const debutHisto = premiere < `${annee}-01-01` ? premiere : `${annee}-01-01`;
  const toutesAnnees = [...new Set([...anneesHisto, annee - 1, annee])].sort((x, y) => x - y);
  const anneesLues = o.toutes === true ? toutesAnnees : [annee - 1, annee];
  const [activites, annees, reglesLues, apporteurs, retrocessions, gestion, preavis, gestionTransitions, collegues, annuaire, pertesFichier, ecartsFichier] = await Promise.all([
    lireActivites(anneesLues), anneesActives(), lireRegles(), lireApporteurs(),
    voirCommissions || negociateurPropre !== null || o.resultatNet === true ? lireRetrocessions() : Promise.resolve([]), lireGestion(depuis), preavisParMois(anneesLues),
    // 🔴 Arno (25/10/2026) — les gestions gagnées / perdues depuis la PREMIÈRE année d'activité (« Depuis le début » du Résumé de l'année) ;
    // chaque calcul les filtre par mois ou par année : la feuille du mois et les tuiles ne changent pas.
    lireLignesGestion(debutHisto, `${annee}-12-31`), lireComptesInterface(), annuaireDisponible(),
    lireGestionsPerduesFichier(debutHisto, `${annee}-12-31`), lireEcartsFichier(o.toutes === true ? debutHisto : `${annee}-01-01`, `${annee}-12-31`),
  ]);
  const gestionLignes = [...gestionTransitions, ...pertesFichier];
  // 🔴 Arno (26/10/2026, décision B, 431) — les biens rentrés vides sans locataire encore : montrés, jamais comptés.
  const gestionEnAttente = await lireGestionsEnAttente(debutHisto, `${annee}-12-31`);
  // 🔴 Arno (25/10/2026, 427) — les nouvelles GLI de l'année (baux avec gestion) et la marge versionnée : visibles de tous ceux qui voient le Portefeuille.
  const [gli, margesGli] = await Promise.all([lireGli(debutHisto, `${annee}-12-31`), lireMargesGli()]);
  /* 🔒 Arno (23/10/2026) — les PRIMES de gestion se voient dans la feuille du mois (colonne « Gestion ») ; le TAUX du négociateur
     (et donc sa commission) et les rétrocessions restent réservés au droit « Voir les commissions ». */
  const regles = voirCommissions ? reglesLues : reglesLues.map((r) => ({ ...r, tauxNegociateur: 0 }));
  // 🔴 Arno (25/10/2026, 426) — la règle des annexes : les locations d'annexes datées de la bascule ou après portent leur lot principal.
  const regleAnnexes = await lireRegleAnnexes();
  const annexesLouees = await annexesDesLocations(activites, regleAnnexes);
  const visibles = annexesLouees.size === 0 ? activites : activites.map((a) => (annexesLouees.has(String(a.id)) ? { ...a, annexe: annexesLouees.get(String(a.id)) } : a));
  // L'historique de toutes les années (Suivi annuel, « année par année ») : calculé ici, seules les sommes partent.
  const toutes = annees.length > 0 ? await lireActivites(annees) : [];
  // 413 — les affaires « Récurrent » de toutes les années : leur part gestion est due chaque mois tant que le bien est en gestion
  // (419 : celle de l'apporteur ET celle du collègue rémunéré, chacune pendant sa durée).
  const recurrents = toutes.filter((x) => aUnDuMensuel(x, apporteurs));
  const retroVisibles = voirCommissions ? retrocessions : [];
  const historique = historiqueAnnees(toutes, { regles, apporteurs, retrocessions: retroVisibles, recurrents, aujourdhui }, voirCommissions);
  // 🔴 Arno (25/10/2026) — la cascade du SEUL négociateur connecté (non administrateur), calculée avec le vrai taux et SES rétrocessions.
  const ctxPropre = { regles: reglesLues, apporteurs, retrocessions, recurrents, aujourdhui };
  const anneesPropres = o.toutes === true ? toutesAnnees : [annee];
  const variablesPropres = !voirCommissions && negociateurPropre !== null
    ? Object.assign({}, ...anneesPropres.map((y) => variablesDuNegociateur(activites, ctxPropre, y, negociateurPropre))) as Record<string, CascadeNegociateur> : {};
  // 🔴 Arno (25/10/2026, suite) — SA commission dans le Suivi annuel, l'historique et l'export (rien d'un autre) ; `toutes` : ses lignes de chaque année.
  const suiviPropre = (() => {
    if (voirCommissions || negociateurPropre === null) return null;
    const parAn = anneesPropres.map((y) => suiviDuNegociateur(activites.filter((x) => x.dateSignature.startsWith(`${y}-`)), toutes, ctxPropre, y, negociateurPropre));
    const un = parAn.find((x) => x !== null) ?? null;
    return un === null ? null : { ...un, lignes: parAn.flatMap((x) => x?.lignes ?? []) };
  })();
  const negociateurs = new Map<string, string>();
  for (const x of activites) negociateurs.set(x.negociateurId !== null ? `id:${x.negociateurId}` : `nom:${x.negociateurLibelle.trim().toLowerCase()}`, x.negociateurLibelle || '—');
  return {
    disponible, annee, annees: [...new Set([...annees, annee, Number(aujourdhui.slice(0, 4))])].sort(), aujourdhui, activites: visibles,
    regles, apporteurs, retrocessions: retroVisibles, negociateurs: [...negociateurs.entries()].map(([cle, libelle]) => ({ cle, libelle })).sort((x, y) => x.libelle.localeCompare(y.libelle)),
    gestion, preavis, voirCommissions, gestionLignes, gestionEnAttente, collegues, annuaire, historique, recurrents,
    personnalisable: await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision'),
    dejaClient: await origineDejaClientDisponible(),
    statutBienManuel: await statutBienManuelDisponible(),
    // La commission d'un écart n'est montrée qu'à qui peut « Voir les commissions ».
    ecartsFichier: ecartsFichier.map((e) => (e.champ === 'commission' && !voirCommissions ? { ...e, fichier: 0, outil: 0 } : e)),
    ...(voirCommissions ? {} : { variablesPropres }),
    // 🔴 Arno (26/10/2026, 428) — le « Résultat net de l'agence » : administrateur (implicite) ou collaborateur autorisé ; pour ce dernier,
    // le taux réel et les rétrocessions, à part, pour ce seul bloc. Tout autre compte : rien.
    ...champsResultatNet(voirCommissions, o.resultatNet === true, reglesLues, retrocessions),
    ...(suiviPropre === null ? {} : { negociateurPropre: suiviPropre }),
    basculeAnnexes: regleAnnexes.basculeAnnexes, annexes: regleAnnexes.annexes,
    // 🔴 Arno (26/10/2026) — une ligne par bien dans les Outils de suivi : le lien de chaque annexe rattachée (affichage seul).
    liensAnnexes: await lireLiensAnnexesAffiches(),
    gli, margesGli,
  };
}
