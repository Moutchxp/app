/**
 * MODULE « GESTION » — LOT REDACTION-GMAIL : LES FENÊTRES DE RÉDACTION. Module PUR : aucun import, aucune base,
 * aucun React. Ce sont des DÉCISIONS (combien de fenêtres, laquelle où, laquelle refusée), pas de la présentation.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX FENÊTRES AU PLUS, ET C'EST UNE DÉCISION D'ARNO, PAS UNE LIMITE TECHNIQUE. La raison tient en une phrase :
 * une fenêtre de rédaction ouverte est un message NON ENVOYÉ. Trois ou quatre à la fois, et l'on finit par en
 * oublier une derrière une autre — c'est exactement ce que fait Gmail, qui en empile deux puis refuse.
 *
 * 🔴 LA TROISIÈME DEMANDE N'EST PAS IGNORÉE : elle rend un MESSAGE qui dit quoi faire (« fermez-en une »). Un
 * clic sans effet et sans explication se lit comme une panne, et on reclique.
 *
 * ⚠️ UNE FENÊTRE RÉDUITE COMPTE. Elle porte un brouillon en cours tout autant qu'une fenêtre ouverte ; ne pas la
 * compter permettrait d'en réduire deux puis d'en ouvrir deux autres, et de perdre les premières de vue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Combien de fenêtres de rédaction peuvent coexister. Deux — voir l'encadré. */
export const FENETRES_MAX = 2;

/** L'état d'affichage d'UNE fenêtre. */
export type EtatFenetre =
  /** Ouverte, ancrée en bas à droite. */
  | 'ouverte'
  /** Repliée sur sa seule barre de titre : le brouillon vit toujours. */
  | 'reduite'
  /** Centrée sur fond assombri, comme Gmail : pour écrire un long message sans se sentir à l'étroit. */
  | 'plein';

export interface FenetreRedaction {
  /** Identifiant d'écran, stable tant que la fenêtre vit. Ce n'est PAS l'identifiant du brouillon en base. */
  cle: string;
  etat: EtatFenetre;
}

export type IssueOuverture =
  | { ok: true; fenetres: FenetreRedaction[] }
  | { ok: false; motif: string };

/** Le message du refus, écrit UNE fois : deux formulations finiraient par se contredire. */
export const MOTIF_TROP_DE_FENETRES =
  `Deux messages sont déjà en cours d’écriture. Fermez-en un (ou envoyez-le) pour en commencer un troisième — `
  + `votre brouillon sera conservé s’il contient quelque chose.`;

/**
 * OUVRIR UNE FENÊTRE. PUR.
 *
 * ⚠️ ROUVRIR UNE CLÉ DÉJÀ PRÉSENTE NE CRÉE PAS DE DOUBLON : la fenêtre est simplement RÉTABLIE et remise au
 * premier plan. C'est le cas de « Répondre » cliqué deux fois sur le même message — geste courant, qui ne doit ni
 * ouvrir deux éditeurs sur le même brouillon, ni buter sur la limite de deux.
 */
export function ouvrir(fenetres: readonly FenetreRedaction[], cle: string): IssueOuverture {
  const deja = fenetres.find((f) => f.cle === cle);
  if (deja !== undefined) {
    // Rétablie (elle était peut-être réduite) et remise en DERNIER : c'est elle qu'on vient de demander.
    return { ok: true, fenetres: [...fenetres.filter((f) => f.cle !== cle), { ...deja, etat: 'ouverte' }] };
  }
  if (fenetres.length >= FENETRES_MAX) return { ok: false, motif: MOTIF_TROP_DE_FENETRES };
  return { ok: true, fenetres: [...fenetres, { cle, etat: 'ouverte' }] };
}

/** FERMER une fenêtre. Le sort du brouillon (conservé s'il a du contenu) est décidé ailleurs, par l'éditeur. PUR. */
export function fermer(fenetres: readonly FenetreRedaction[], cle: string): FenetreRedaction[] {
  return fenetres.filter((f) => f.cle !== cle);
}

/**
 * CHANGER L'ÉTAT d'une fenêtre. PUR.
 *
 * 🔴 UNE SEULE FENÊTRE EN PLEIN ÉCRAN À LA FOIS. Le plein écran assombrit le fond ; deux d'affilée empileraient
 * deux voiles, et la fenêtre du dessous deviendrait inatteignable au clavier. Passer l'une en plein écran REPLIE
 * donc l'autre à l'état ouvert — elle reste visible derrière, et un clic la ramène.
 */
export function changerEtat(
  fenetres: readonly FenetreRedaction[], cle: string, etat: EtatFenetre,
): FenetreRedaction[] {
  return fenetres.map((f) => {
    if (f.cle === cle) return { ...f, etat };
    if (etat === 'plein' && f.etat === 'plein') return { ...f, etat: 'ouverte' as EtatFenetre };
    return f;
  });
}

/** Y a-t-il une fenêtre en plein écran ? L'écran s'en sert pour poser le voile UNE fois. PUR. */
export function celleEnPlein(fenetres: readonly FenetreRedaction[]): FenetreRedaction | null {
  return fenetres.find((f) => f.etat === 'plein') ?? null;
}

/**
 * LA PLACE D'UNE FENÊTRE, en partant de la droite. PUR.
 *
 * ⚠️ LES FENÊTRES SONT CÔTE À CÔTE, JAMAIS SUPERPOSÉES (demande d'Arno). Superposées, la seconde masquerait la
 * première et l'on croirait n'en avoir qu'une. Le rang sert à calculer le décalage en CSS ; la fenêtre en plein
 * écran, elle, n'a pas de rang — elle est centrée.
 */
export function rangDepuisLaDroite(fenetres: readonly FenetreRedaction[], cle: string): number {
  const ancrees = fenetres.filter((f) => f.etat !== 'plein');
  const i = ancrees.findIndex((f) => f.cle === cle);
  return i < 0 ? 0 : ancrees.length - 1 - i;
}
