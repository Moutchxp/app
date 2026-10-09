import { query } from '../db/client';
import { sqlEvenementOuvertParLaFrise, sqlPeriodesDeLEvenement, CERTITUDE_ECARTEE } from './etatParLaFrise';
import {
  tableauBordEvenements, type FaitsEvenement, type PeriodeEvenement, type TableauBordEvenements,
} from './tableauBordEvenements';

/**
 * ══ 🔴🔴 LOT EVENEMENTS-TABLEAU-DE-BORD — LES FAITS, LUS UNE FOIS. LECTURE SEULE ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'ÉCRIT RIEN, ET NE SAIT PAS ÉCRIRE. Deux `SELECT`, aucune table nouvelle, aucun index ajouté :
 * c'est la contrainte du lot (Arno, point 3), et elle se vérifie à l'œil — il n'y a pas un seul `INSERT`,
 * `UPDATE` ni `DELETE` dans ce fichier.
 *
 * 🔴 IL NE RÉÉCRIT AUCUNE RÈGLE EXISTANTE. « Ouvert ? » et « quelles périodes ? » viennent de `etatParLaFrise`,
 * le même SQL que l'annuaire, la file, la recherche et l'étiquette des mails. Une seconde définition de
 * « ouvert » dans un tableau de bord serait la pire place pour en avoir une : personne ne recompte un chiffre
 * de synthèse, et l'écart ne se verrait jamais.
 *
 * ⚠️ IL NE CALCULE PAS LES INDICATEURS : il rend des FAITS, et `tableauBordEvenements` (PUR) les plie. Voir
 * l'encadré de ce module — une moyenne écrite en SQL ne s'éprouve qu'avec une base.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les cartes qui comptent : vives, et pas écartées. La même porte que partout ailleurs dans le module. */
const CARTE_VIVE = `svv_c.statut = 'vif' AND svv_c.certitude <> '${CERTITUDE_ECARTEE}'`;

/**
 * « Cette carte est sur la frise de cet événement » — les DEUX voies, comme `etatParLaFrise` : le rattachement
 * direct, et le lien de mission Monga. Oublier la seconde ferait disparaître les dates des dossiers Monga.
 */
const CARTE_DE_L_EVENEMENT = `(svv_c.evenement_id = e.id
   OR svv_c.reference IN (SELECT svv_l.reference FROM gestion_monga_lien svv_l
                           WHERE svv_l.evenement_id = e.id AND svv_l.retire_le IS NULL))`;

/** La première date d'une carte d'un des types donnés, sur la frise de l'événement. */
function premiereCarte(types: readonly string[]): string {
  const liste = types.map((t) => `'${t}'`).join(',');
  return `(SELECT min(svv_c.survenu_le) FROM gestion_monga_etape svv_c
            WHERE ${CARTE_VIVE} AND svv_c.type IN (${liste}) AND ${CARTE_DE_L_EVENEMENT})`;
}

/** Combien de cartes d'un des types donnés. */
function compteCartes(types: readonly string[]): string {
  const liste = types.map((t) => `'${t}'`).join(',');
  return `(SELECT count(*) FROM gestion_monga_etape svv_c
            WHERE ${CARTE_VIVE} AND svv_c.type IN (${liste}) AND ${CARTE_DE_L_EVENEMENT})`;
}

/**
 * ══ 🔴🔴 UN DEVIS « EN ATTENTE », ET UN DEVIS « ACCEPTÉ » — LA RÈGLE, EN SQL ════════════════════════════════════
 *
 * Un devis reçu attend tant qu'AUCUNE acceptation ni aucun refus n'est venu APRÈS lui. C'est la lecture
 * littérale d'une frise : les cartes se suivent dans le temps, et la dernière dit où l'on en est.
 *
 * 🔴 « APRÈS LUI » SE COMPARE SUR LA DATE DE LA CARTE (`survenu_le`), jamais sur son horodatage de création —
 * règle d'Arno pour tout ce lot. Une acceptation saisie ce matin pour une décision du 3 septembre doit solder
 * le devis du 1er septembre, et non celui du 15.
 *
 * ⚠️ `>=` ET NON `>` : une acceptation saisie le MÊME JOUR que le devis (le cas courant quand tout est noté
 * d'un coup après coup) doit le solder. Avec `>`, deux cartes à la même seconde laissaient le devis « en
 * attente » pour toujours — et le montant restait dans la colonne des devis à relancer.
 */
function montantDevis(solde: boolean): string {
  const condition = solde ? 'EXISTS' : 'NOT EXISTS';
  return `(SELECT coalesce(sum(svv_c.montant_cents), 0) FROM gestion_monga_etape svv_c
            WHERE ${CARTE_VIVE} AND svv_c.type = 'devis_recu' AND svv_c.montant_cents IS NOT NULL
              AND ${CARTE_DE_L_EVENEMENT}
              AND ${condition} (SELECT 1 FROM gestion_monga_etape svv_s
                                 WHERE svv_s.statut = 'vif' AND svv_s.certitude <> '${CERTITUDE_ECARTEE}'
                                   AND svv_s.type = ${solde ? `'devis_accepte'` : `ANY (ARRAY['devis_accepte','devis_refuse'])`}
                                   AND svv_s.survenu_le >= svv_c.survenu_le
                                   AND (svv_s.evenement_id = e.id
                                        OR svv_s.reference IN (SELECT svv_l2.reference FROM gestion_monga_lien svv_l2
                                                                WHERE svv_l2.evenement_id = e.id
                                                                  AND svv_l2.retire_le IS NULL))))`;
}

/** Le nombre de devis reçus encore en attente (cartes), même règle que le montant ci-dessus. */
const NB_DEVIS_EN_ATTENTE = `(SELECT count(*) FROM gestion_monga_etape svv_c
   WHERE ${CARTE_VIVE} AND svv_c.type = 'devis_recu' AND ${CARTE_DE_L_EVENEMENT}
     AND NOT EXISTS (SELECT 1 FROM gestion_monga_etape svv_s
                      WHERE svv_s.statut = 'vif' AND svv_s.certitude <> '${CERTITUDE_ECARTEE}'
                        AND svv_s.type = ANY (ARRAY['devis_accepte','devis_refuse'])
                        AND svv_s.survenu_le >= svv_c.survenu_le
                        AND (svv_s.evenement_id = e.id
                             OR svv_s.reference IN (SELECT svv_l2.reference FROM gestion_monga_lien svv_l2
                                                     WHERE svv_l2.evenement_id = e.id
                                                       AND svv_l2.retire_le IS NULL))))`;

interface LigneFaits {
  id: string;
  type: string | null;
  urgence: string | null;
  ouvert: boolean;
  ouverture_le: string | null;
  cloture_le: string | null;
  premier_devis_le: string | null;
  acceptation_le: string | null;
  intervention_le: string | null;
  montant_attente: string;
  montant_accepte: string;
  nb_devis_attente: string;
  nb_devis_acceptes: string;
  nb_devis_refuses: string;
  nb_reouvertures: string;
  derniere_activite_le: string | null;
  avec_monga: boolean;
  avec_bien: boolean;
}

/**
 * Les faits de TOUS les événements. Une requête, une ligne par événement.
 *
 * ⚠️ `ouverture_le` ET `cloture_le` VIENNENT DES PÉRIODES, pas de la colonne `ouvert_le` : un événement rouvert
 * a plusieurs périodes, et c'est la PREMIÈRE ouverture et la DERNIÈRE clôture qui bornent son histoire. La
 * colonne, elle, ne connaît que la première — et `etat`, depuis le lot ETAT-PAR-LA-FRISE, ne fait plus foi.
 */
export async function faitsDesEvenements(): Promise<FaitsEvenement[]> {
  const { rows } = await query<LigneFaits>(
    `SELECT e.id,
            e.categorie AS type,
            e.urgence,
            ${sqlEvenementOuvertParLaFrise('e')} AS ouvert,
            (SELECT min(svv_p.du) FROM (${sqlPeriodesDeLEvenement('e')}) svv_p) AS ouverture_le,
            (SELECT CASE WHEN bool_and(svv_p.au IS NOT NULL) THEN max(svv_p.au) END
               FROM (${sqlPeriodesDeLEvenement('e')}) svv_p) AS cloture_le,
            ${premiereCarte(['devis_recu'])} AS premier_devis_le,
            ${premiereCarte(['devis_accepte'])} AS acceptation_le,
            ${premiereCarte(['intervention', 'rdv_eu_lieu'])} AS intervention_le,
            ${montantDevis(false)} AS montant_attente,
            ${montantDevis(true)} AS montant_accepte,
            ${NB_DEVIS_EN_ATTENTE} AS nb_devis_attente,
            ${compteCartes(['devis_accepte'])} AS nb_devis_acceptes,
            ${compteCartes(['devis_refuse'])} AS nb_devis_refuses,
            ${compteCartes(['reouverture'])} AS nb_reouvertures,
            (SELECT max(svv_c.survenu_le) FROM gestion_monga_etape svv_c
              WHERE ${CARTE_VIVE} AND ${CARTE_DE_L_EVENEMENT}) AS derniere_activite_le,
            EXISTS (SELECT 1 FROM gestion_monga_lien svv_l
                     WHERE svv_l.evenement_id = e.id AND svv_l.retire_le IS NULL) AS avec_monga,
            EXISTS (SELECT 1 FROM gestion_evenement_partie svv_pt
                     WHERE svv_pt.evenement_id = e.id AND svv_pt.sorte = 'lot'
                       AND svv_pt.retire_le IS NULL) AS avec_bien
       FROM gestion_evenement e
      ORDER BY e.id`);
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    urgence: r.urgence,
    ouvert: r.ouvert === true,
    ouvertureLe: r.ouverture_le,
    clotureLe: r.cloture_le,
    premierDevisLe: r.premier_devis_le,
    acceptationLe: r.acceptation_le,
    interventionLe: r.intervention_le,
    montantAttenteCents: Number(r.montant_attente),
    montantAccepteCents: Number(r.montant_accepte),
    nbDevisEnAttente: Number(r.nb_devis_attente),
    nbDevisAcceptes: Number(r.nb_devis_acceptes),
    nbDevisRefuses: Number(r.nb_devis_refuses),
    nbReouvertures: Number(r.nb_reouvertures),
    derniereActiviteLe: r.derniere_activite_le,
    avecMonga: r.avec_monga === true,
    avecBien: r.avec_bien === true,
  }));
}

/**
 * Toutes les périodes de tous les événements — la matière du flux mensuel.
 *
 * ⚠️ UNE LIGNE PAR PÉRIODE, ET NON PAR ÉVÉNEMENT : un dossier ouvert en mars, clos en avril, rouvert en juin
 * et reclos en juillet compte DEUX ouvertures et DEUX clôtures sur l'année. C'est ce que le flux doit montrer.
 */
export async function periodesDesEvenements(): Promise<PeriodeEvenement[]> {
  const { rows } = await query<{ evenement_id: string; du: string; au: string | null }>(
    `SELECT e.id AS evenement_id, svv_p.du, svv_p.au
       FROM gestion_evenement e
       CROSS JOIN LATERAL (${sqlPeriodesDeLEvenement('e')}) svv_p
      WHERE svv_p.du IS NOT NULL
      ORDER BY e.id, svv_p.du`);
  return rows.map((r) => ({ evenementId: Number(r.evenement_id), du: r.du, au: r.au }));
}

/** Le tableau de bord complet : deux lectures, puis le pli PUR. */
export async function tableauBord(maintenant: Date = new Date()): Promise<TableauBordEvenements> {
  const [faits, periodes] = await Promise.all([faitsDesEvenements(), periodesDesEvenements()]);
  return tableauBordEvenements(faits, periodes, maintenant);
}
