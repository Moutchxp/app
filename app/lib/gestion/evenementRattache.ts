import { sqlDansUnePeriodeOuverte, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';
import { motCategorie, motUrgence, NIVEAUX_URGENCE, tonUrgence } from './evenementQualite';
import type { DerniereEtapeVignette } from './fileRepo';
import { jourParisIso } from './etapeVignette';

/**
 * ══ 🔴🔴 LOT EVENEMENT-RATTACHE-COHERENT-ET-BLOC-DEPLIABLE — UNE SEULE VÉRITÉ : « CE MAIL EST-IL RATTACHÉ À UN
 *    ÉVÉNEMENT ? » ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO (12/10/2026), fiche bien-315 : plusieurs mails portaient la pastille « Événement en cours », mais
 * « Modifier le rattachement » disait « Événement rattaché : aucun » pour certains (ex. Nevine Abdellatif,
 * 24/09/2026 09:40, « Re: Facture diagnostic »).
 *
 * ═══ 🔴 LA CAUSE, MESURÉE EN LECTURE SEULE AVANT D'ÉCRIRE UNE LIGNE ════════════════════════════════════════════════
 *
 * La pastille et la fenêtre posaient DEUX questions différentes :
 *   · la PASTILLE unissait deux voies (`historiqueRepo`) : ① le FIL du mail porte une affectation active, quelle
 *     qu'en soit la portée — une affectation « ce message seul » d'un AUTRE mail du fil comptait ; ② la voie du
 *     BIEN : le mail est rattaché à un bien de l'événement et tombe dans sa période, sans être affecté du tout ;
 *   · la FENÊTRE (`evenementDuMail`, route `/messages/<id>/affectation`) lisait le rattachement DIRECT : une
 *     affectation de CE message, sinon une affectation du fil ENTIER (`message_id IS NULL`).
 * Toute la base : 12 mails portaient la pastille, 7 avec une fenêtre à « aucun » — 4 par la voie du bien seule
 * (55969, 57258, 57276, 57597), 3 par une affectation « un message » d'un autre mail de leur fil (57068, 57119,
 * 57144, fil 36475).
 *
 * ═══ 🔴 LA RÈGLE D'ARNO ════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   a) le MAIL est rattaché à l'événement → pastille « Événement en cours », et la fenêtre affiche l'événement ;
 *   b) le mail n'est pas rattaché, mais un événement est ouvert sur son bien → pas de pastille pleine : une mention
 *      discrète, et dans la fenêtre la PROPOSITION de le rattacher — jamais un rattachement automatique.
 *
 * « Rattaché » a désormais UNE définition, celle que la fenêtre lisait déjà : cette requête. La pastille, la
 * fenêtre, le filtre « Événement ouvert » et les listes de la boîte la lisent toutes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES ÉVÉNEMENTS RATTACHÉS À CHAQUE MAIL de l'ensemble `messages` (une expression SQL : `$1::bigint[]`,
 * `ARRAY[m.id]`…).
 *
 * 🔴 LA PORTÉE DE L'AFFECTATION EST RESPECTÉE (migration 234) : une affectation de CE message, sinon une affectation
 * du fil ENTIER — et une affectation « ce message seul » d'un autre mail du fil ne déborde plus sur celui-ci.
 * Sans la 234, la colonne n'existe pas : toute affectation couvre le fil, comme avant elle.
 *
 * Elle rend aussi, pour chaque couple, `ouvert` (la frise : il reste une période sans borne haute) et
 * `dans_periode` (le mail est daté dans une période ouverte, règle d'Arno du 08/10/2026). La pastille est
 * `ouvert AND dans_periode` : c'est le « en cours POUR CE MAIL ».
 *
 * ⚠️ L'ALIAS DES MESSAGES EST `msg`, JAMAIS `m` : glissée dans un `EXISTS` corrélé sur `m`, une seconde
 * déclaration de `m` masquerait la première — piège du lot FILTRE-COMME-ETIQUETTE.
 * ⚠️ PAS D'ACCENT dans les commentaires SQL de ce module (piège du lot 19d3c67d).
 */
export function sqlEvenementsRattaches(avecMessageId: boolean, messages: string): string {
  const portee = avecMessageId
    ? `(af.message_id = msg.id
          OR (af.message_id IS NULL AND af.fil_id = msg.fil_id
              AND NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.actif AND am.message_id = msg.id)))`
    : 'af.fil_id = msg.fil_id';
  const mot = avecMessageId ? "CASE WHEN af.message_id IS NULL THEN 'conversation' ELSE 'mail' END" : "'conversation'";
  return `SELECT DISTINCT msg.id AS message_id, ev.id, ev.reference, ev.objet, ${mot} AS portee,
                 ${sqlEvenementOuvertParLaFrise('ev')} AS ouvert,
                 ${sqlDansUnePeriodeOuverte('ev', 'msg.recu_le')} AS dans_periode, ev.ouvert_le
            FROM gestion_message msg
            JOIN gestion_affectation af ON af.actif AND ${portee}
            JOIN gestion_evenement ev ON ev.id = af.evenement_id
           WHERE msg.id = ANY(${messages})`;
}

/** L'ordre de lecture des rattachés d'un mail : l'événement EN COURS d'abord, puis le plus récemment ouvert. */
export const ORDRE_RATTACHES = '(r.ouvert AND r.dans_periode) DESC, r.ouvert_le DESC, r.id DESC';

/** Un événement tel que la ligne et la fenêtre le lisent. `ouvert` = EN COURS pour ce mail. */
export interface EvenementLu {
  id: number;
  reference: string;
  objet: string;
  ouvert: boolean;
  /* 🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET — ce que la capsule et la liste affichent. FACULTATIFS : une réponse plus
     ancienne ne les porte pas ; la capsule dit alors « non précisée » et la liste « Étape : ouverture ». */
  categorie?: string | null;
  urgence?: string | null;
  ouvertLe?: string | null;
  etape?: DerniereEtapeVignette | null;
}

/** Ce que la ligne ET la fenêtre affichent d'un mail : le même calcul, sur les mêmes données. */
export interface LectureEvenement {
  /** a) — le mail est rattaché à un événement en cours : pastille pleine « Événement en cours ». */
  cas: 'rattache' | 'ouvert_sur_le_bien' | 'aucun';
  /** Les événements EN COURS rattachés au mail : c'est ce que compte la pastille. */
  enCours: EvenementLu[];
  /** L'événement que la fenêtre affiche dans « Événement rattaché » (`null` = « aucun »). */
  evenement: EvenementLu | null;
  /** b) — les événements ouverts sur le bien du mail, que le mail ne porte pas : la proposition de rattacher. */
  surLeBien: EvenementLu[];
}

/**
 * 🔴 LE CALCUL UNIQUE, PUR. `rattaches` = les rattachés du mail datés dans une période (déjà ordonnés : en cours
 * d'abord) ; `duBien` = les événements de son bien dont la période contient le mail (voie du bien).
 *
 * ⚠️ RIEN N'EST JAMAIS RATTACHÉ ICI : `surLeBien` n'est qu'une proposition, que seul un clic d'Arno écrit.
 */
export function lectureEvenement(
  rattaches: readonly EvenementLu[], duBien: readonly EvenementLu[] = [],
): LectureEvenement {
  const enCours = trierParUrgence(rattaches.filter((e) => e.ouvert));
  const ids = new Set(rattaches.map((e) => e.id));
  const vus = new Set<number>();
  const surLeBien = trierParUrgence(duBien.filter((e) => {
    if (!e.ouvert || ids.has(e.id) || vus.has(e.id)) return false;
    vus.add(e.id);
    return true;
  }));
  const evenement = enCours[0] ?? rattaches[0] ?? null;
  return {
    cas: enCours.length > 0 ? 'rattache' : surLeBien.length > 0 ? 'ouvert_sur_le_bien' : 'aucun',
    enCours, evenement, surLeBien,
  };
}

/** La mention discrète du cas b), sur la ligne. */
export const MOT_OUVERT_SUR_LE_BIEN = 'événement ouvert sur ce bien';

/** Le mot de la capsule d'un événement : « GES-2026-000001 — Re: NOTE INFORMATION… ». */
export function motCapsuleEvenement(e: { reference: string; objet: string }): string {
  return `${e.reference} — ${e.objet}`;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET — LA CAPSULE D'ÉVÉNEMENT, SES MOTS ET SA TRAME
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ARNO (12/10/2026) : « Contenu : TYPE de l'événement (sa catégorie ; “non précisée” si vide) · numéro — titre. TRAME
   = couleur de l'URGENCE : reprends l'échelle et les couleurs d'urgence déjà définies dans l'application si elles
   existent […] ; non précisée = le jaune / orange actuel ; événement clos = gris. »

   🔴 L'ÉCHELLE EXISTE (lot URGENCE-EVENEMENT, `NIVEAUX_URGENCE`) : trois niveaux — Normal (vert), Intermédiaire
   (orange), Urgent (rouge) —, les tons de la capsule de type de la carte. Elle est REPRISE telle quelle : la même
   urgence a la même couleur sur la carte et dans la fenêtre du mail. */

/** La trame d'une capsule : un ton d'urgence, « non précisée » (ambre), ou « clos » (gris). */
export type TrameEvenement = 'vert' | 'orange' | 'rouge' | 'non-precisee' | 'clos';

/** La trame : clos d'abord (gris, quelle que soit l'urgence), puis le ton de l'urgence, sinon l'ambre. PUR. */
export function trameEvenement(e: { ouvert: boolean; urgence?: string | null }): TrameEvenement {
  if (!e.ouvert) return 'clos';
  return tonUrgence(e.urgence ?? null) ?? 'non-precisee';
}

/** Le TYPE affiché : la catégorie, ou « non précisée ». PUR. */
export function motTypeEvenement(categorie: string | null | undefined): string {
  return categorie === null || categorie === undefined || categorie.trim() === '' ? 'non précisée' : motCategorie(categorie);
}

/** « Urgence : <niveau> », et « (événement clos) » pour un clos. PUR. */
export function motSurvolUrgence(e: { ouvert: boolean; urgence?: string | null }): string {
  return `Urgence : ${motUrgence(e.urgence ?? null).toLowerCase()}${e.ouvert ? '' : ' (événement clos)'}`;
}

/** Le rang d'une urgence, pour le tri : la plus haute d'abord ; « non précisée » en dernier. PUR. */
export function rangUrgence(u: string | null | undefined): number {
  const i = NIVEAUX_URGENCE.findIndex((n) => n.cle === u);
  return i < 0 ? -1 : i;
}

/** Tri d'Arno : urgence décroissante, puis l'ouverture la plus récente, puis l'identifiant. PUR, non destructif. */
export function trierParUrgence<T extends { id: number; urgence?: string | null; ouvertLe?: string | null }>(
  liste: readonly T[],
): T[] {
  return [...liste].sort((a, b) => (rangUrgence(b.urgence) - rangUrgence(a.urgence))
    || (b.ouvertLe ?? '').localeCompare(a.ouvertLe ?? '')
    || (b.id - a.id));
}

/** Accord : « 1 événement », « 2 événements ». PUR. */
export function nEvenements(n: number): string {
  return `${n} événement${n > 1 ? 's' : ''}`;
}

/** La ligne repliée du bloc, en mots — les trois cas d'Arno (Partie 1). PUR. */
export function resumeBlocEvenement(l: LectureEvenement, rattaches: readonly EvenementLu[]): {
  cas: 'rattache' | 'en_cours_sur_le_bien' | 'aucun';
  capsules: EvenementLu[];
  /** « + N autre(s) en cours » (cas 1), ou « aucun — N événement(s) en cours sur ce bien : » (cas 2). */
  mot: string | null;
} {
  if (rattaches.length > 0) {
    const n = l.surLeBien.length;
    return {
      cas: 'rattache', capsules: trierParUrgence(rattaches),
      mot: n === 0 ? null : `+ ${n} autre${n > 1 ? 's' : ''} en cours`,
    };
  }
  if (l.surLeBien.length > 0) {
    const n = l.surLeBien.length;
    return { cas: 'en_cours_sur_le_bien', capsules: l.surLeBien, mot: `aucun — ${nEvenements(n)} en cours sur ce bien :` };
  }
  return { cas: 'aucun', capsules: [], mot: 'aucun' };
}

/** La liste dépliée : les événements EN COURS, rattachés ou non, triés par urgence puis ouverture. PUR. */
export function listeEnCours(l: LectureEvenement): Array<EvenementLu & { rattache: boolean }> {
  return trierParUrgence([
    ...l.enCours.map((e) => ({ ...e, rattache: true })),
    ...l.surLeBien.map((e) => ({ ...e, rattache: false })),
  ]);
}

/** « 26/09/2026 » depuis une date ISO, ou `null`. PUR. */
export function dateCourteIso(iso: string | null | undefined): string | null {
  /* Le jour à PARIS (lot LISTE-MAILS-RETOUR-PASTILLE-SOBRE-ET-DATE-ETAPE), comme la frise. */
  const j = jourParisIso(iso);
  return j.length === 10 ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : null;
}
