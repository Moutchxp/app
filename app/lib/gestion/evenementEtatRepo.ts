/**
 * ⚠️ PAS DE `server-only` ICI, ET C'EST DÉLIBÉRÉ : le relevé des contradictions (point D) se lit depuis une
 * COMMANDE, hors du serveur Next — `server-only` la ferait échouer au chargement. C'est le même choix que
 * `mongaEtapeRepo`, pour la même raison. La frontière client, elle, reste tenue par le garde de graphe
 * (`clientBoundary.guard.test.ts`) : ce module tire `pg`, donc `dns`, et aucun composant client ne peut
 * l'atteindre sans faire rougir l'épreuve.
 */
import { query } from '../db/client';
import { sqlClosLeParLaFrise, sqlEvenementOuvertParLaFrise, sqlPeriodesDeLEvenement } from './etatParLaFrise';

/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — POSER LA QUESTION « OUVERT ? » À LA BASE. LECTURE SEULE. ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'ÉCRIT RIEN, ET NE SAIT PAS ÉCRIRE. C'est la conséquence directe du choix du lot : l'état d'un
 * événement n'est plus une valeur qu'on range, c'est une question qu'on pose à ses cartes de borne. Il n'y a
 * donc rien à mettre à jour — et par construction, aucun chemin ne peut mettre l'état en contradiction avec la
 * frise (règle d'Arno du 08/10/2026, point B).
 *
 * 🔴 IL NE RÉÉCRIT PAS LA RÈGLE : il appelle le SQL émis par `etatParLaFrise`, le même que celui qui s'inscrit
 * dans les requêtes de l'annuaire, de la file, de la recherche et de l'étiquette des mails. Une seconde
 * formulation ici aurait été la deuxième vérité que ce lot vient justement supprimer.
 *
 * ⚠️ CES FONCTIONS SERVENT AUX APPELS **PONCTUELS** — une route qui vient de poser ou de retirer une carte et
 * qui doit dire à l'écran si l'état a bougé. Les écrans qui listent, eux, intègrent le fragment SQL dans LEUR
 * requête : poser une question par ligne serait une requête par ligne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** « Cet événement est-il ouvert ? », d'après ses cartes de borne. `false` pour un événement inconnu. */
export async function evenementOuvertParLaFrise(evenementId: number): Promise<boolean> {
  const { rows } = await query<{ ouvert: boolean }>(
    `SELECT ${sqlEvenementOuvertParLaFrise('e')} AS ouvert FROM gestion_evenement e WHERE e.id = $1`,
    [evenementId]);
  return rows[0]?.ouvert === true;
}

/** Une période ouverte de l'événement. `au === null` ⇒ elle court encore (Arno : « jusqu'à aujourd'hui »). */
export interface PeriodeOuverte {
  du: string;
  au: string | null;
}

/**
 * LES PÉRIODES D'UN ÉVÉNEMENT, dans l'ordre (Arno, point 5). LECTURE SEULE.
 *
 * ⚠️ POUR MONTRER ET POUR AUDITER, pas pour filtrer : les écrans qui filtrent emploient
 * `sqlDansUnePeriodeOuverte`, qui pose la question DANS leur requête. Rapatrier les périodes puis filtrer en
 * TypeScript aurait ramené toute la table avant de la réduire.
 */
export async function periodesDeLEvenement(evenementId: number): Promise<PeriodeOuverte[]> {
  const { rows } = await query<{ du: string; au: string | null }>(
    `SELECT p.du::text, p.au::text
       FROM gestion_evenement e,
            LATERAL (${sqlPeriodesDeLEvenement('e')}) p
      WHERE e.id = $1
      ORDER BY p.du`, [evenementId]);
  return rows.map((r) => ({ du: r.du, au: r.au }));
}

/**
 * ══ 🔴🔴 POINT D DU LOT — LES ÉVÉNEMENTS DONT L'ÉTAT ENREGISTRÉ CONTREDIT LEUR FRISE. LECTURE SEULE. ═════════════
 *
 * ARNO : « liste en LECTURE SEULE les événements dont l'état enregistré contredit leur frise. Ne corrige RIEN en
 * base sans l'accord d'Arno : rends-moi la liste et ce que la règle donnerait pour chacun. »
 *
 * 🔴 ELLE N'EST PAS UN OUTIL DE RÉPARATION, ET N'EN DEVIENDRA PAS UN PAR INADVERTANCE : ce module n'écrit pas.
 * Depuis ce lot, la divergence n'a d'ailleurs plus aucune conséquence visible — tous les écrans lisent la frise.
 * La liste sert à décider si l'on veut, en plus, remettre la colonne d'accord. C'est la décision d'Arno.
 *
 * ⚠️ LA COLONNE RESTE LUE POUR « à traiter / en cours » (voir `etatAffiche`) : ce n'est donc pas une colonne
 * morte, et la divergence qu'on liste ici ne porte que sur le troisième état, « traité ».
 */
export interface DivergenceEtat {
  id: number;
  reference: string;
  etatEnregistre: string;
  traiteLe: string | null;
  ouvertParLaFrise: boolean;
  closLeParLaFrise: string | null;
  /** La suite des bornes, telle que la frise les montre — de quoi juger sans rouvrir l'écran. */
  bornes: string | null;
}

export async function evenementsEnContradiction(): Promise<DivergenceEtat[]> {
  const { rows } = await query<{
    id: string; reference: string; etat: string; traite_le: string | null;
    ouvert: boolean; clos_le: string | null; bornes: string | null;
  }>(
    `SELECT e.id::text, e.reference, e.etat, e.traite_le::text,
            ${sqlEvenementOuvertParLaFrise('e')} AS ouvert,
            ${sqlClosLeParLaFrise('e')}::text AS clos_le,
            (SELECT string_agg(
                      CASE WHEN p.au IS NULL THEN p.du::date || ' → ouverte'
                           ELSE p.du::date || ' → ' || p.au::date END, ' | ' ORDER BY p.du)
               FROM (${sqlPeriodesDeLEvenement('e')}) p) AS bornes
       FROM gestion_evenement e
      /* 🔴 LA CONTRADICTION, EN UNE LIGNE : la colonne dit « traité » et la frise dit ouvert, ou l'inverse. */
      WHERE (e.etat = 'traite') = ${sqlEvenementOuvertParLaFrise('e')}
      ORDER BY e.id`);
  return rows.map((r) => ({
    id: Number(r.id), reference: r.reference, etatEnregistre: r.etat, traiteLe: r.traite_le,
    ouvertParLaFrise: r.ouvert, closLeParLaFrise: r.clos_le, bornes: r.bornes,
  }));
}
