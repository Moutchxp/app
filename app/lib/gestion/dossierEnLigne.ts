/**
 * LOT DRIVE-RETOUCHES-1 — CRÉER UN DOSSIER DANS LA LIGNE, COMME DANS LE FINDER. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE DEMANDE ARNO : « supprime le formulaire actuel “Nom du nouveau dossier / Continuer / Annuler”. À la
 * place : “Nouveau dossier” insère immédiatement une ligne de dossier en DERNIÈRE position du dossier affiché,
 * surlignée, avec une courte animation d'apparition. Le nom est directement éditable dans la ligne, déjà
 * sélectionné. Entrée ou clic ailleurs = création. Échap ou nom vide = la ligne disparaît, rien n'est créé. »
 *
 * ═══ 🔴 CE QUE CE CHANGEMENT COÛTE, ET POURQUOI IL EST QUAND MÊME JUSTE ═════════════════════════════════════════
 *
 * Le formulaire qu'on remplace avait une vertu : il faisait CONFIRMER le chemin complet rendu par le serveur, ce
 * qui protégeait de la faute la plus probable — le bon nom, au mauvais endroit. Deux dossiers « Documents » à deux
 * endroits sont la règle, pas l'exception, dans un Drive construit à la main pendant des années.
 *
 * Cette protection n'est pas abandonnée, elle CHANGE DE FORME : la ligne naît À SA PLACE, dans la liste du dossier
 * où elle sera créée, sous les yeux. On ne lit plus un chemin, on le VOIT. Et le chemin complet reste affiché en
 * infobulle pendant la saisie, pour le cas où la liste ne suffirait pas à situer l'endroit.
 *
 * 🔴 CE QUI NE CHANGE PAS D'UN MOT : la création passe par la MÊME route, avec le MÊME verdict — rien ne se crée
 * sous « Documents clients scannés » ni dans son sous-arbre, à aucune profondeur, et le journal reste obligatoire.
 * Ce module ne décide rien de tout cela ; il tient l'état d'une ligne en cours d'édition.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le nom proposé, déjà sélectionné : on tape par-dessus, ou l'on garde celui-là. */
export const NOM_PAR_DEFAUT = 'Nouveau dossier';

/**
 * L'état de la ligne neuve.
 *
 * ⚠️ `parent` VOYAGE AVEC L'ÉTAT, et ce n'est pas une commodité : entre le moment où l'on ouvre la ligne et celui
 * où l'on valide, on peut avoir changé de dossier (un clic droit sur un dossier voisin, par exemple). Créer dans
 * « le dossier courant » relu au moment du POST créerait au mauvais endroit, silencieusement.
 */
export type LigneNeuve =
  | { c: 'ferme' }
  | { c: 'edition'; parent: string; parentNom: string; chemin: string | null; nom: string; erreur: string | null }
  | { c: 'creation'; parent: string; parentNom: string; chemin: string | null; nom: string }
  | { c: 'echec'; parent: string; nom: string; motif: string };

export const LIGNE_FERMEE: LigneNeuve = { c: 'ferme' };

/** Ouvre une ligne neuve dans ce dossier-là. PUR. */
export function ouvrirLigne(parent: string, parentNom: string, chemin: string | null = null): LigneNeuve {
  return { c: 'edition', parent, parentNom, chemin, nom: NOM_PAR_DEFAUT, erreur: null };
}

export type VerdictNom =
  | { quoi: 'creer'; nom: string }
  /** Nom vide : on RENONCE, sans rien dire. Un champ qu'on vide et qu'on valide est un abandon, pas une erreur. */
  | { quoi: 'renoncer' }
  | { quoi: 'corriger'; motif: string };

/**
 * ══ 🔴 CE QUE VAUT LE NOM SAISI, AU MOMENT DE VALIDER. PUR. ═════════════════════════════════════════════════════
 *
 * ⚠️ LE DOUBLON N'EST PAS UNE ERREUR DE GOOGLE : Drive accepte parfaitement deux dossiers du même nom au même
 * endroit — il en fait deux. C'est NOUS qui refusons, parce qu'un Drive où « Travaux » existe deux fois côte à
 * côte est un Drive où l'on range au hasard. La ligne reste donc en édition, avec le message sous le champ.
 *
 * ⚠️ LA COMPARAISON IGNORE LA CASSE, LES ACCENTS ET LES ESPACES EN TROP. « travaux » et « Travaux » sont le même
 * dossier pour l'œil, et c'est l'œil qui cherchera.
 */
export function verdictNom(saisi: string, existants: readonly string[]): VerdictNom {
  const nom = saisi.trim();
  if (nom === '') return { quoi: 'renoncer' };
  const clef = normaliser(nom);
  if (existants.some((e) => normaliser(e) === clef)) {
    return { quoi: 'corriger', motif: `« ${nom} » existe déjà ici. Choisissez un autre nom.` };
  }
  return { quoi: 'creer', nom };
}

function normaliser(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * L'infobulle du champ : le chemin complet, tant qu'on le connaît.
 *
 * 🔴 C'EST LA TRACE DE LA CONFIRMATION D'AVANT. Elle ne barre plus la route, mais elle reste disponible pour qui
 * veut vérifier où il est en train de créer — et elle dit le chemin RENDU PAR LE SERVEUR, jamais recomposé ici.
 */
export function infobulleChemin(chemin: string | null, parentNom: string): string {
  return chemin !== null && chemin !== ''
    ? `Le dossier sera créé ici : ${chemin}`
    : `Le dossier sera créé dans « ${parentNom} ».`;
}

/** Le mot de l'échec, affiché dans la ligne avant qu'elle disparaisse. PUR. */
export const DUREE_ECHEC_MS = 6_000;
