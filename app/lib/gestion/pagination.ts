/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — L'ARITHMÉTIQUE DE « 1–25 sur N · ‹ › ». MODULE PUR ══════════════════════════════
 *
 * Aucune base, aucun réseau, aucun DOM, aucun React. Il ne sait pas ce qu'est un échange : on lui donne le rang de
 * la page, ce qu'elle contient, et le total ; il rend ce qui s'écrit et ce qui se clique.
 *
 * ═══ 🔴 CE QUE ÇA REMPLACE, ET POURQUOI ════════════════════════════════════════════════════════════════════════
 *
 * Un bouton « Voir les échanges plus anciens » en bas de liste, qui empilait les pages les unes sous les autres.
 * Demande d'Arno : une pagination façon Gmail, « 1–25 sur N » avec deux chevrons, en haut ET en bas — et le bouton
 * supprimé. Empiler ne dit jamais où l'on en est : après quatre clics on a cent lignes et aucune idée du reste.
 *
 * ═══ 🔴🔴 D'OÙ VIENT N, ET CE QUE CE N'EST PAS ═════════════════════════════════════════════════════════════════
 *
 * N est le nombre d'ÉCHANGES de la liste affichée. Ce n'est ni un nombre de MESSAGES, ni un nombre de lignes lues.
 * Le défaut signalé par Arno — « 1–25 sur 291 354 » — était de cette famille : un ordre de grandeur qui n'est celui
 * d'aucune liste d'échanges (la base en porte 36 580 au 30/09/2026, pour 57 281 messages).
 *
 * C'est pour cela que ce module N'INVENTE PAS N : il le reçoit, et le serveur le calcule avec LE MÊME prédicat que
 * la liste (`sqlCompteBoite` pour les étiquettes, `comptesDeLaRecherche` pour les résultats). Un total calculé
 * « autrement mais équivalent » annonce tôt ou tard un nombre que la liste ne montre pas — et c'est toujours le
 * compteur qu'on croit.
 *
 * ═══ ⚠️ N INCONNU EST UN ÉTAT NORMAL, PAS UN ZÉRO ══════════════════════════════════════════════════════════════
 *
 * `null` se lit « on ne l'a pas compté ». L'étendue s'écrit alors sans le « sur N » — « 26–50 » — au lieu
 * d'annoncer « sur 0 », qui serait faux et alarmant au-dessus de vingt-cinq lignes bien présentes.
 */

/**
 * Combien d'échanges par page. Valeur demandée par Arno.
 *
 * 🔴 ELLE VIT ICI, DANS LE MODULE PUR, et c'est ce qui permet à l'ÉCRAN de la connaître : `PAGE_BOITE`
 * (`boiteRepo`) et `PAGE_RECHERCHE` (`rechercheBoite`) tirent `pg`, et un `'use client'` qui les importerait
 * ferait tomber la construction de toute l'application — précédent du 24/09/2026, consigné dans AGENTS.md. Les
 * deux constantes du serveur valent celle-ci, et une épreuve tient les trois égales.
 */
export const PAR_PAGE = 25;

/** Où en est la pagination : ce qu'on affiche, et ce qu'on peut encore atteindre. */
export interface EtatPagination {
  /** Rang de la page affichée, à partir de 0. */
  page: number;
  /** Combien de lignes la page affiche VRAIMENT (la dernière page en a moins). */
  lignes: number;
  /** Le nombre d'ÉCHANGES de la liste entière, ou `null` : « on ne l'a pas compté ». */
  total: number | null;
  /** Y a-t-il une page après ? Rendu par le serveur (`suivant`), jamais déduit du total. */
  suite: boolean;
}

/** Ce que la barre affiche et ce qu'elle laisse cliquer. */
export interface BarrePagination {
  /** « 1–25 sur 8 546 », « 26–50 », « Aucun échange ». Prêt à afficher. */
  mot: string;
  /** Le chevron « ‹ » est-il cliquable ? Faux sur la première page. */
  reculer: boolean;
  /** Le chevron « › » est-il cliquable ? Faux sur la dernière. */
  avancer: boolean;
  /** Faut-il afficher la barre du tout ? Fausse sur une liste vide d'une seule page. */
  visible: boolean;
}

/**
 * Le séparateur de milliers : une ESPACE FINE INSÉCABLE (U+202F), comme l'écrit Arno (« 8 546 »).
 *
 * ⚠️ INSÉCABLE, ET C'EST LE POINT : avec une espace ordinaire, « 1–25 sur 8 546 » peut se couper entre « 8 » et
 * « 546 » en fin de ligne sur un téléphone, et se lire « 8 ». Un nombre coupé en deux est un nombre faux.
 */
const FINE_INSECABLE = ' ';

/**
 * Un nombre tel qu'on l'écrit en français : « 8 546 ».
 *
 * ⚠️ ÉCRIT À LA MAIN, ET JAMAIS PAR LE FORMATEUR DE NOMBRES DU NAVIGATEUR. Celui-ci suit la locale du poste : une
 * machine réglée en anglais rendrait « 8,546 », qui se lit « huit virgule cinq » pour un lecteur francophone.
 * L'écran est en français, le groupement aussi, et il ne dépend d'aucun réglage. (Une épreuve vérifie sur le texte
 * de ce fichier qu'aucun de ces deux formateurs n'y est appelé — d'où l'absence de leurs noms jusque dans ce
 * commentaire.)
 */
export function nombreEcrit(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += FINE_INSECABLE;
    out += s[i];
  }
  return (n < 0 ? '-' : '') + out;
}

/**
 * Les rangs de la première et de la dernière ligne de la page, à partir de 1 — ce que lit un humain.
 *
 * ⚠️ UNE PAGE VIDE REND `{ debut: 0, fin: 0 }`, et surtout PAS `{ debut: 1, fin: 0 }`. « 1–0 » est illisible, et
 * l'écran a de toute façon autre chose à dire quand il n'y a rien (voir `barrePagination`).
 */
export function etenduePage(page: number, lignes: number): { debut: number; fin: number } {
  if (lignes <= 0) return { debut: 0, fin: 0 };
  const debut = page * PAR_PAGE + 1;
  return { debut, fin: debut + lignes - 1 };
}

/**
 * ══ 🔴 LA PAGE N D'UNE LISTE DÉJÀ ENTIÈREMENT EN MÉMOIRE ═════════════════════════════════════════════════════
 *
 * Toutes les listes du module ne se paginent pas côté serveur, et il n'y a aucune raison de les y forcer : les
 * brouillons se comptent en dizaines (10 au 30/09/2026), les échanges sans événement en centaines (523), et les
 * deux écrans chargent déjà leur liste entière en une requête. Les découper ICI est exact — le total est la
 * longueur de la liste, il ne peut pas se tromper — et ne coûte rien.
 *
 * 🔴 CE QU'IL NE FAUT PAS EN CONCLURE : ce n'est PAS la bonne façon de paginer la boîte. Ramener 8 546 échanges
 * pour en montrer 25 mettrait l'écran à genoux, et c'est précisément ce que la pagination par curseur évite.
 * Le critère est « la liste tient-elle déjà entièrement en mémoire, pour une autre raison que la pagination ? ».
 *
 * ⚠️ UNE PAGE AU-DELÀ DE LA FIN REND UN TABLEAU VIDE, jamais une erreur : la liste peut avoir raccourci sous nos
 * pieds (un brouillon envoyé, un échange classé) pendant qu'on regardait la page 3.
 */
export function trancheDePage<T>(liste: readonly T[], page: number): T[] {
  const debut = Math.max(0, page) * PAR_PAGE;
  return liste.slice(debut, debut + PAR_PAGE);
}

/**
 * ══ 🔴 CE QUE LA BARRE DIT ET LAISSE FAIRE ═══════════════════════════════════════════════════════════════════
 *
 * 🔴 « AVANCER » SUIT LE SERVEUR, JAMAIS LE TOTAL. C'est `suite` — la présence d'un curseur suivant — qui décide,
 * parce que c'est la seule information qui ne puisse pas se tromper : le serveur lit une ligne de plus que la page
 * et sait donc s'il y en a. Déduire « il reste des pages » de `fin < total` ferait cliquer sur un chevron qui
 * ramène une page vide le jour où le total et la liste s'écartent d'une unité — un mail relevé entre les deux
 * lectures suffit.
 *
 * ⚠️ ET « RECULER » NE REGARDE QUE LE RANG. On revient en arrière en reprenant un curseur DÉJÀ VU, jamais en
 * recalculant : c'est l'écran qui garde la pile, et il ne peut pas manquer un cran qu'il a lui-même posé.
 */
export function barrePagination(e: EtatPagination): BarrePagination {
  const { debut, fin } = etenduePage(e.page, e.lignes);
  const reculer = e.page > 0;
  const avancer = e.suite;
  if (e.lignes === 0) {
    return {
      // Une liste vide le DIT, au lieu d'afficher « 0–0 sur 0 » — trois zéros pour une seule information.
      mot: e.page > 0 ? 'Plus aucun échange après celui-ci' : 'Aucun échange',
      reculer, avancer, visible: e.page > 0,
    };
  }
  const etendue = debut === fin ? nombreEcrit(debut) : `${nombreEcrit(debut)}–${nombreEcrit(fin)}`;
  return {
    mot: e.total === null ? etendue : `${etendue} sur ${nombreEcrit(e.total)}`,
    reculer,
    avancer,
    /**
     * ⚠️ UNE SEULE PAGE QUI TIENT ENTIÈREMENT ⇒ PAS DE BARRE. « 1–7 sur 7 » avec deux chevrons éteints n'apprend
     * rien et occupe deux lignes, en haut et en bas. Dès qu'il y a une suite, ou qu'on n'est plus au début, la
     * barre est utile et elle s'affiche.
     */
    visible: reculer || avancer,
  };
}
