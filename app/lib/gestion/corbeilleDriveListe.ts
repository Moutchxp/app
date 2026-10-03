/**
 * ══ 🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL, POINT 2 — LA CORBEILLE DU DRIVE, LISIBLE. Module PUR ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « une catégorie “Corbeille” en bas de la colonne de gauche de la fenêtre Drive.
 * Un clic affiche les fichiers à la corbeille (Mon Drive et chaque Drive partagé accessible), les plus récents
 * d'abord, avec : nom, emplacement d'origine, date de mise à la corbeille, jours restants avant suppression
 * définitive (30 jours). Chaque ligne propose : 👁 aperçu, et « Réintégrer », qui remet le fichier à son
 * emplacement d'origine (même mot que pour les mails). Pas de suppression définitive, pas de “vider la
 * corbeille”. »
 *
 * ═══ CE QUI A ÉTÉ MESURÉ SUR LE VRAI DRIVE AVANT D'ÉCRIRE QUOI QUE CE SOIT ═══════════════════════════════════════
 *
 *   ① `corpora=allDrives` + `q=trashed = true` rend bien les deux à la fois — « Mon Drive » et chaque Drive
 *      partagé accessible. Mesuré : 100 entrées (la page est pleine), dont 0 pour « Mon Drive », qui est vide.
 *   ② `trashedTime` est renseigné sur les 100 entrées. C'est la date qu'Arno demande, et elle existe.
 *   ③ 🔴 `orderBy=trashedTime` est REFUSÉ par l'API — HTTP 400, « Invalid Value ». Le tri « les plus récents
 *      d'abord » ne peut donc PAS être demandé à Google : il se fait chez nous, sur la page reçue. C'est une
 *      limite réelle, et elle a une conséquence qu'il faut dire : le tri porte sur la PAGE, pas sur la corbeille
 *      entière (voir `JOURS_CONSERVATION` et l'encadré du tri).
 *   ④ 🔴🔴 `explicitlyTrashed` distingue DEUX situations que Google montre pareil : un fichier qu'on a jeté
 *      lui-même (`true`), et un fichier qui est à la corbeille PARCE QUE SON DOSSIER y est (`false`). Mesuré :
 *      sur 12 entrées lues, 5 étaient dans le second cas. La différence est décisive pour « Réintégrer » — voir
 *      `peutReintegrer`.
 *
 * 🔒 CE MODULE NE SAIT NI LIRE NI ÉCRIRE : pas un `fetch`, pas une ligne de SQL, pas de React. Il NOMME, il TRIE
 * et il COMPTE. Il est donc importable depuis un composant `'use client'` sans rien tirer derrière lui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le mot de la catégorie, et son emoji — les mêmes que les trois du haut (demande d'Arno : même présentation). */
export const MOT_CORBEILLE_DRIVE = 'Corbeille';
export const EMOJI_CORBEILLE_DRIVE = '🗑';

/**
 * ⚠️ TRENTE JOURS, ET C'EST GOOGLE QUI LE DIT, pas nous. La corbeille du Drive conserve trente jours, puis
 * supprime définitivement. Le nombre est écrit ICI parce que deux endroits l'affichent — la confirmation avant de
 * jeter (`MENTION_RECUPERABLE`) et cette liste — et que deux copies auraient divergé.
 */
export const JOURS_CONSERVATION = 30;

/** Une entrée de la corbeille, telle que la route la rend. */
export interface LigneCorbeille {
  id: string;
  nom: string;
  /** L'emplacement d'origine, en toutes lettres. Chaîne vide = on n'a pas su le reconstituer. */
  origine: string;
  /** L'identifiant du dossier d'origine. Chaîne vide = inconnu : on ne propose alors pas de réintégration. */
  origineId: string;
  /** La date de mise à la corbeille, en ISO. `null` = absente (jamais vu en pratique, mais l'API ne la garantit pas). */
  jeteLe: string | null;
  tailleOctets: number | null;
  dossier: boolean;
  /**
   * 🔴 VRAI quand le fichier a été jeté LUI-MÊME ; faux quand il est à la corbeille parce qu'un de ses dossiers
   * y est. Voir `peutReintegrer` : dans le second cas, le remettre le replacerait dans un dossier lui aussi à la
   * corbeille — c'est-à-dire nulle part de visible.
   */
  jeteDirectement: boolean;
  /** 🔴🔴 L'origine est sous « Documents clients scannés » : lecture seule, AUCUNE écriture. */
  protege: boolean;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE TRI — « les plus récents d'abord »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * TRIE PAR DATE DE MISE À LA CORBEILLE, LA PLUS RÉCENTE EN TÊTE. PUR.
 *
 * 🔴 IL SE FAIT CHEZ NOUS PARCE QUE GOOGLE LE REFUSE : `orderBy=trashedTime` rend HTTP 400 (mesuré). Ce n'est
 * donc pas un choix d'architecture, c'est la seule façon d'obtenir l'ordre qu'Arno demande.
 *
 * ⚠️ UNE DATE ABSENTE PASSE EN QUEUE, et ne prétend pas être ancienne : la ranger au hasard dans la liste ferait
 * croire à une date qu'on n'a pas.
 */
export function parJetLePlusRecent(lignes: readonly LigneCorbeille[]): LigneCorbeille[] {
  return [...lignes].sort((a, b) => {
    const ta = a.jeteLe === null ? -1 : Date.parse(a.jeteLe);
    const tb = b.jeteLe === null ? -1 : Date.parse(b.jeteLe);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES JOURS QUI RESTENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * COMBIEN DE JOURS AVANT LA SUPPRESSION DÉFINITIVE. PUR. `null` quand la date de mise à la corbeille manque.
 *
 * 🔴 ON ARRONDIT VERS LE BAS, ET C'EST DÉLIBÉRÉ : annoncer « 1 jour » quand il reste quatre heures est un
 * mensonge utile dans un seul sens — celui qui fait agir tout de suite. L'inverse (« 2 jours » pour 28 heures)
 * ferait remettre au lendemain un fichier qui serait parti.
 *
 * ⚠️ JAMAIS NÉGATIF : passé trente jours, Google a pu ne pas encore avoir fait le ménage. « 0 » dit la vérité
 * utile (« c'est maintenant »), là où « -3 » ferait douter du calcul.
 */
export function joursRestants(jeteLe: string | null, maintenant: number): number | null {
  if (jeteLe === null) return null;
  const t = Date.parse(jeteLe);
  if (Number.isNaN(t)) return null;
  const jours = Math.floor((maintenant - t) / 86_400_000);
  return Math.max(0, JOURS_CONSERVATION - jours);
}

/** La phrase des jours restants. PUR. */
export function phraseJoursRestants(jours: number | null): string {
  if (jours === null) return 'date de mise à la corbeille inconnue';
  if (jours === 0) return 'supprimé définitivement d’un instant à l’autre';
  return jours === 1 ? 'plus qu’1 jour' : `encore ${jours} jours`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 RÉINTÉGRER — ET CE QUI L'INTERDIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le mot, le MÊME que pour les mails (demande d'Arno) — il vit dans `boiteOrigine`, et il est repris ici tel quel. */
export const LIBELLE_REINTEGRER_DRIVE = 'Réintégrer';

/** La mention des lignes qu'on ne peut que regarder. */
export const MENTION_DOSSIER_PROTEGE = 'Dossier protégé';

export type VerdictReintegrer = { ok: true } | { ok: false; motif: string };

/**
 * ══ 🔴🔴 PEUT-ON RÉINTÉGRER CETTE LIGNE ? PUR ════════════════════════════════════════════════════════════════════
 *
 * Trois refus, et chacun répare une situation différente :
 *
 *   ① 🔴🔴 L'ORIGINE EST SOUS « DOCUMENTS CLIENTS SCANNÉS ». Règle absolue d'Arno : ce dossier est intouchable en
 *      écriture — « ni corbeille, ni réintégration, ni déplacement, ni copie vers lui ; lecture de métadonnées
 *      seulement ». Réintégrer y écrirait. La ligne est donc affichée, et elle ne propose RIEN.
 *
 *   ② 🔴 LE FICHIER N'A PAS ÉTÉ JETÉ LUI-MÊME (`jeteDirectement` faux, mesuré sur le vrai Drive). Il est à la
 *      corbeille parce qu'un de ses DOSSIERS y est. Le sortir le remettrait dans un dossier lui aussi à la
 *      corbeille : il disparaîtrait de la corbeille sans reparaître nulle part de visible. C'est le dossier qu'il
 *      faut réintégrer, et la phrase le dit.
 *
 *   ③ ⚠️ ON NE SAIT PAS D'OÙ IL VIENT. Sans emplacement d'origine, « remettre à sa place » n'a pas de sens — et
 *      Google refuserait après coup, ce qui est la pire façon de l'apprendre.
 *
 * ⚠️ CE VERDICT EST PRONONCÉ DEUX FOIS, ET IL LE FAUT : ici, pour que l'écran n'affiche pas un bouton qui sera
 * refusé ; et dans la ROUTE, sur la chaîne RÉELLE remontée chez Google, parce qu'un écran se modifie et qu'une
 * requête se forge. C'est la règle du module depuis le lot 5-PJ-D.
 */
export function peutReintegrer(l: {
  protege: boolean; jeteDirectement: boolean; origineId: string; origine: string;
}): VerdictReintegrer {
  if (l.protege) {
    return {
      ok: false,
      motif: 'Ce fichier vient de « Documents clients scannés », qui n’est jamais modifié par l’application. '
        + 'Réintégrez-le depuis Google Drive si c’est voulu.',
    };
  }
  if (!l.jeteDirectement) {
    const ou = l.origine.trim() === '' ? 'son dossier' : `« ${l.origine.trim()} »`;
    return {
      ok: false,
      motif: `Ce fichier est à la corbeille parce que ${ou} y est aussi. Réintégrez le dossier : son contenu `
        + 'reviendra avec lui.',
    };
  }
  if (l.origineId.trim() === '') {
    return { ok: false, motif: 'L’emplacement d’origine de ce fichier n’a pas pu être retrouvé.' };
  }
  return { ok: true };
}

/** L'aide du bouton, qui DIT où le fichier va revenir. PUR. */
export function aideReintegrerDrive(origine: string): string {
  const ou = (origine ?? '').trim();
  return ou === ''
    ? 'Le fichier revient à sa place d’origine.'
    : `Le fichier revient à sa place d’origine : ${ou}.`;
}

/** Le mot du bandeau après une réintégration réussie. PUR. */
export function motReintegreDrive(nom: string, origine: string): string {
  const n = (nom ?? '').trim() === '' ? 'Le fichier' : `« ${nom.trim()} »`;
  const ou = (origine ?? '').trim();
  return ou === '' ? `${n} est revenu à sa place.` : `${n} est revenu dans ${ou}.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LA LISTE DIT D'ELLE-MÊME
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE TITRE DE LA LISTE, avec son compte. PUR.
 *
 * ⚠️ « AU MOINS », ET PAS UN COMPTE EXACT, QUAND LA PAGE EST PLEINE. La corbeille du cabinet dépasse la page que
 * l'API rend (mesuré : 100 entrées et un `nextPageToken`). Annoncer « 100 fichiers » ferait conclure qu'il n'y en
 * a pas plus — exactement la faute que la loupe évite en disant « emplacements CONNUS ».
 */
export function titreCorbeilleDrive(nombre: number, tronque: boolean): string {
  if (nombre === 0) return 'La corbeille du Drive est vide.';
  const n = nombre === 1 ? '1 fichier' : `${nombre} fichiers`;
  return tronque
    ? `Au moins ${n} à la corbeille du Drive — les plus récemment jetés d’abord.`
    : `${n} à la corbeille du Drive — les plus récemment jetés d’abord.`;
}

/**
 * ⚠️ CE QUE CETTE LISTE NE FAIT PAS, ÉCRIT À L'ÉCRAN. Arno : « pas de suppression définitive, pas de “vider la
 * corbeille” ». Le dire est plus utile que de le taire : quelqu'un qui cherche le bouton doit comprendre qu'il
 * n'existe pas ici, et non croire qu'il ne l'a pas trouvé.
 */
export const MENTION_SANS_SUPPRESSION =
  'Cette liste ne supprime rien définitivement et ne vide pas la corbeille : ces gestes se font dans Google Drive.';
