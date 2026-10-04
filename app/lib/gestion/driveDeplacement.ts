import { DOSSIER_INTERDIT_LECTURE, situer, type Maillon } from './driveLectureFichier';

/**
 * LOT DRIVE-DEPLACER — DÉPLACER ET COPIER DANS LE DRIVE : LA RÈGLE, ET RIEN QUE LA RÈGLE. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE LOT CHANGE LA NATURE DE CE QUE L'APPLICATION S'AUTORISE, ET IL FAUT L'ÉCRIRE EN TÊTE.
 *
 * Jusqu'ici elle CRÉAIT des dossiers, et c'est tout. Décision d'Arno du 29/09/2026 : elle peut désormais DÉPLACER
 * et COPIER. Elle ne supprime, ne renomme, ne met à la corbeille et ne partage TOUJOURS RIEN — aucune fonction de
 * ce genre n'est écrite nulle part, et un test statique cherche leurs verbes HTTP un par un.
 *
 * ═══ 🔴🔴 LES QUATRE INTERDITS, QUI NE SE DISCUTENT PAS ══════════════════════════════════════════════════════════
 *
 *   ① RIEN NE VA VERS « Documents clients scannés », ni vers aucun de ses sous-dossiers, à aucune profondeur ;
 *   ② RIEN N'EN SORT — on ne déplace ni ne copie un élément qui s'y trouve ;
 *   ③ LE DOSSIER LUI-MÊME NE BOUGE PAS ;
 *   ④ AUCUN DE SES ANCÊTRES NE BOUGE. C'est l'interdit qu'on oublie, et c'est le plus dangereux : déplacer
 *      « GESTION LOCATIVE » emporterait l'archive avec lui, sans qu'aucune vérification portant sur l'archive
 *      elle-même ne s'en aperçoive. Le garde regarde donc AUSSI la liste des ancêtres.
 *
 * ⚠️ NE PAS SAVOIR VAUT INTERDIT. Chaîne trouée, cycle, profondeur dépassée : on refuse. C'est la règle de tout le
 * module depuis le premier jour, et une écriture n'est pas l'endroit où l'assouplir.
 *
 * 🔴 CE MODULE EST PUR, ET C'EST VOLONTAIRE : la règle se rejoue sans réseau, exhaustivement, dans son test. La
 * route, elle, ne fait que lui fournir les chaînes réelles — et elle les redemande à Google à chaque appel, jamais
 * à l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type VerdictMouvement = { ok: true } | { ok: false; motif: string };

/** Ce que le garde a besoin de savoir, et qui vient toujours de Google — jamais du navigateur. */
export interface ContexteMouvement {
  /** Les maillons connus : ceux de la SOURCE et ceux de la CIBLE, dans un seul index. */
  index: ReadonlyMap<string, Maillon>;
  /**
   * 🔴🔴 LE DOSSIER PROTÉGÉ ET TOUS SES ANCÊTRES. Déplacer l'un d'eux emporterait l'archive : c'est l'interdit ④.
   * Résolu par la route (recherche du dossier par son nom, puis remontée), jamais deviné ici.
   */
  protegesEtAncetres: ReadonlySet<string>;
  /** Les dossiers protégés EUX-MÊMES (sans leurs ancêtres) : on ne dépose rien dedans. */
  proteges: ReadonlySet<string>;
}

const MOTIF_ARCHIVE_VERS =
  `Refusé : « ${DOSSIER_INTERDIT_LECTURE} » est l’archive du cabinet. Rien n’y est déplacé ni copié.`;
const MOTIF_ARCHIVE_DEPUIS =
  `Refusé : cet élément est dans « ${DOSSIER_INTERDIT_LECTURE} ». Rien n’en sort — ni déplacement, ni copie.`;
const MOTIF_ARCHIVE_ELLE_MEME =
  `Refusé : « ${DOSSIER_INTERDIT_LECTURE} » ne se déplace pas, et aucun dossier qui le contient non plus — `
  + 'le déplacer emporterait l’archive avec lui.';

/** Un mot pour dire qu'on n'a pas su lire la chaîne. Ne pas savoir vaut interdit. */
function motifIncertain(cause: 'depart' | 'trou' | 'cycle' | 'profondeur'): string {
  const mot = cause === 'depart' ? 'Emplacement inconnu'
    : cause === 'trou' ? 'Emplacement incomplet'
      : cause === 'cycle' ? 'Arborescence incohérente'
        : 'Arborescence trop profonde';
  return `${mot} : par précaution, ce déplacement est refusé.`;
}

/**
 * ══ 🔴🔴 LE VERDICT SUR UN DÉPLACEMENT OU UNE COPIE. PUR. ═══════════════════════════════════════════════════════
 *
 * `sorte` ne change RIEN aux interdits : déplacer et copier lisent et écrivent au même endroit, et une copie tirée
 * de l'archive serait exactement la fuite que l'archive interdit. Elle ne sert qu'au mot du refus.
 */
export function peutMouvoir(
  o: {
    sourceId: string;
    /** Le dossier de destination. */
    cibleId: string;
    /** La source est-elle un dossier ? Un dossier ne peut pas entrer dans lui-même ni dans sa descendance. */
    sourceEstDossier: boolean;
    /** Le parent actuel de la source, quand on le connaît : déposer là où l'on est déjà ne fait rien. */
    parentActuel?: string | null;
    sorte: 'deplacer' | 'copier';
  },
  ctx: ContexteMouvement,
): VerdictMouvement {
  const source = o.sourceId.trim();
  const cible = o.cibleId.trim();
  if (source === '' || cible === '') {
    return { ok: false, motif: 'Refusé : la source ou la destination n’est pas identifiée.' };
  }

  // ── ③ ET ④ : L'ARCHIVE ET SES ANCÊTRES NE BOUGENT PAS ────────────────────────────────────────────────────────
  if (ctx.protegesEtAncetres.has(source)) return { ok: false, motif: MOTIF_ARCHIVE_ELLE_MEME };

  // ── ① ON NE DÉPOSE RIEN DANS L'ARCHIVE ───────────────────────────────────────────────────────────────────────
  if (ctx.proteges.has(cible)) return { ok: false, motif: MOTIF_ARCHIVE_VERS };

  // ── UN DOSSIER N'ENTRE NI DANS LUI-MÊME, NI DANS SA PROPRE DESCENDANCE ───────────────────────────────────────
  if (source === cible) {
    return { ok: false, motif: 'Refusé : un dossier ne peut pas être déplacé dans lui-même.' };
  }
  if (o.sourceEstDossier && descendDe(cible, source, ctx.index)) {
    return {
      ok: false,
      motif: 'Refusé : on ne déplace pas un dossier dans l’un de ses propres sous-dossiers — il se perdrait '
        + 'lui-même.',
    };
  }

  // ── DÉPOSER LÀ OÙ L'ON EST DÉJÀ NE FAIT RIEN, et le dire vaut mieux que de ne rien faire en silence ──────────
  if (o.sorte === 'deplacer' && (o.parentActuel ?? null) === cible) {
    return { ok: false, motif: 'Cet élément est déjà dans ce dossier.' };
  }

  // ── ② RIEN NE SORT DE L'ARCHIVE ──────────────────────────────────────────────────────────────────────────────
  const ouEstLaSource = situer(source, ctx.index);
  if (ouEstLaSource.ou === 'dedans') return { ok: false, motif: MOTIF_ARCHIVE_DEPUIS };
  if (ouEstLaSource.ou === 'inconnu') return { ok: false, motif: motifIncertain(ouEstLaSource.cause) };

  // ── ① (suite) LA CIBLE N'EST PAS SOUS L'ARCHIVE, À AUCUNE PROFONDEUR ─────────────────────────────────────────
  const ouEstLaCible = situer(cible, ctx.index);
  if (ouEstLaCible.ou === 'dedans') return { ok: false, motif: MOTIF_ARCHIVE_VERS };
  if (ouEstLaCible.ou === 'inconnu') return { ok: false, motif: motifIncertain(ouEstLaCible.cause) };

  return { ok: true };
}

/**
 * `cible` descend-elle de `source` ? PUR.
 *
 * ⚠️ BORNÉE comme toutes les remontées de ce module : une arborescence abîmée par un cycle ne doit pas figer le
 * programme. Sur un CYCLE, elle répond VRAI — refuser à tort vaut mieux que déplacer un dossier dans sa propre
 * descendance, qui le détacherait de tout.
 *
 * ⚠️ SUR UNE CHAÎNE INCONNUE, elle répond FAUX, et ce n'est pas un relâchement : `peutMouvoir` appelle ensuite
 * `situer(cible)`, qui refuse tout ce qu'elle n'a pas su remonter. Répondre VRAI ici donnerait le bon refus pour
 * la mauvaise raison — « ce dossier est dans sa propre descendance » au lieu de « je n'ai pas su lire son
 * emplacement » — et un motif faux est ce qui fait chercher au mauvais endroit.
 */
export function descendDe(cible: string, source: string, index: ReadonlyMap<string, Maillon>): boolean {
  const vus = new Set<string>();
  let courant: string | null = cible;
  for (let i = 0; i < 32 && courant !== null; i += 1) {
    if (courant === source) return true;
    if (vus.has(courant)) return true;      // cycle : on ne sait pas, donc on refuse
    vus.add(courant);
    const m: Maillon | undefined = index.get(courant);
    if (m === undefined) return false;      // chaîne inconnue : `peutMouvoir` la refusera par ailleurs
    courant = m.parentId;
  }
  return false;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA MÉMOIRE TAMPON — couper / copier / coller, interne à l'application
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface Presse {
  mode: 'couper' | 'copier';
  /** Les éléments pris, dans l'ordre où ils étaient sélectionnés. */
  ids: string[];
  /**
   * 🔴 CEUX DES `ids` QUI SONT DES DOSSIERS. On les retient au moment de la PRISE, et non au collage : entre les
   * deux, on a pu changer de dossier, et la ligne n'est plus à l'écran pour qu'on lui demande ce qu'elle est.
   * Sans cette liste, coller un dossier copié sauterait la confirmation qui annonce le nombre d'éléments.
   */
  dossiers: string[];
  /** D'où ils viennent — utile au message, et à rien d'autre : la route revérifie tout. */
  parentSource: string | null;
  /**
   * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 5 — LE NOM DE CHACUN, RETENU À LA PRISE ══════════════════
   *
   * MÊME RAISON QUE `dossiers`, ET MÊME DÉFAUT CORRIGÉ DEUX FOIS : entre la prise et le collage, on a pu changer
   * de dossier, et la ligne n'est plus à l'écran pour qu'on lui demande son nom.
   *
   * 🔴 CE QUE SON ABSENCE COÛTAIT, MESURÉ À L'ÉCRAN LE 04/10/2026 (dossier « Test ») : après « Couper » puis
   * navigation dans le sous-dossier puis « Coller ici », le bouton annonçait « Remettre «  » dans “Test creation
   * dossier drive” » — un nom VIDE, et le dossier d'ARRIVÉE présenté comme l'origine. Le déplacement, lui, était
   * juste : seul le mot mentait, c'est-à-dire la seule chose qu'on lit avant de cliquer.
   *
   * ⚠️ FACULTATIF, pour que les appelants plus anciens restent valides : à défaut, le mot dira « son dossier
   * d'origine », ce qui est vague mais vrai — jamais le mauvais dossier.
   */
  noms?: Record<string, string>;
}

export const PRESSE_VIDE: Presse | null = null;

/** Un élément est-il « coupé » (donc estompé jusqu'au collage) ? PUR. */
export function estCoupe(presse: Presse | null, id: string): boolean {
  return presse !== null && presse.mode === 'couper' && presse.ids.includes(id);
}

/** Le mot du menu « Coller ici », qui dit ce qui va se passer. PUR. */
export function motColler(presse: Presse | null): string {
  if (presse === null) return 'Coller ici';
  const n = presse.ids.length;
  const quoi = n > 1 ? `${n} éléments` : '1 élément';
  return presse.mode === 'couper' ? `Coller ici (déplacer ${quoi})` : `Coller ici (copier ${quoi})`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA COPIE RÉCURSIVE D'UN DOSSIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LA BORNE. Une copie récursive fait UN appel Google par élément : copier un dossier de dix mille pièces
 * bloquerait la fenêtre plusieurs minutes et pourrait épuiser le quota du cabinet. Deux cents est large pour ce
 * qu'on copie réellement (un dossier de bien, une rubrique) et reste sous la minute.
 *
 * ⚠️ AU-DELÀ, ON REFUSE ET ON LE DIT — on ne copie pas « les deux cents premiers », ce qui donnerait un dossier
 * incomplet dont personne ne saurait qu'il l'est.
 */
export const COPIE_RECURSIVE_MAX = 200;

export type VerdictCopieRecursive =
  | { ok: true; elements: number; phrase: string }
  | { ok: false; motif: string };

/** Ce qu'on annonce avant de copier un dossier — et ce qu'on refuse. PUR. */
export function verdictCopieRecursive(elements: number, nom: string): VerdictCopieRecursive {
  if (elements > COPIE_RECURSIVE_MAX) {
    return {
      ok: false,
      motif: `« ${nom} » contient ${elements} éléments : c’est au-delà de ce que cette copie sait faire d’un seul `
        + `geste (${COPIE_RECURSIVE_MAX}). Copiez ses sous-dossiers un par un, ou faites-le depuis Google Drive.`,
    };
  }
  return {
    ok: true,
    elements,
    phrase: elements <= 1
      ? `Copier « ${nom} » et son contenu ?`
      : `Copier « ${nom} » et son contenu, soit ${elements} éléments ?`,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE BANDEAU « ANNULER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Dix secondes : le temps de s'apercevoir qu'on s'est trompé de dossier, pas assez pour l'oublier. */
export const DUREE_ANNULATION_MS = 10_000;

/**
 * LE MOT DU BANDEAU. PUR.
 *
 * ⚠️ UNE COPIE NE S'ANNULE PAS. Annuler une copie voudrait dire SUPPRIMER la copie — et l'application ne supprime
 * rien. Le bandeau dit donc seulement ce qui a été fait, sans proposer un retour qu'on ne saurait pas tenir.
 */
export function motMouvementFait(sorte: 'deplacer' | 'copier', n: number, cible: string): string {
  const quoi = n > 1 ? `${n} éléments` : '1 élément';
  return sorte === 'deplacer'
    ? `${quoi} déplacé${n > 1 ? 's' : ''} vers « ${cible} ».`
    : `${quoi} copié${n > 1 ? 's' : ''} vers « ${cible} ».`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT DRIVE-RETOUCHES-2 — LA PILE DES DÉPLACEMENTS DE LA SESSION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un pas défaisable : un LOT de déplacements, fait d'un seul geste. */
export interface PasAnnulable {
  /** Les lignes de journal, celles que la route relira pour retrouver le parent d'origine. */
  mouvements: number[];
  /** Ce qu'on a déplacé, pour le dire dans l'infobulle. */
  nom: string;
  nombre: number;
  /** Où c'était avant, tel que l'écran le savait. Sert au MOT, jamais à la décision. */
  origineNom: string;
  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — DE QUEL GESTE CE PAS EST-IL LE RETOUR ? ═════════════════
   *
   * Arno : « “Annuler le dernier déplacement” sait aussi annuler une mise à la corbeille (restauration). » Les
   * deux pas vivent donc dans la MÊME pile — c'est ce qui fait qu'un clic défait « le plus récent », quel qu'il
   * soit, sans que la personne ait à se demander lequel des deux boutons chercher.
   *
   * ⚠️ ABSENT ⇒ `'deplacer'`, et tout ce qui existait avant ce lot se comporte à l'identique.
   *
   * 🔴 IL NE DÉCIDE RIEN : il dit seulement QUELLE ROUTE appeler et QUEL MOT écrire. Le droit, lui, se prononce
   * côté serveur, en remontant les chaînes de parents chez Google — pour l'un comme pour l'autre.
   */
  sorte?: 'deplacer' | 'corbeille';
}

/**
 * ══ 🔴 CE QUE LE BOUTON « ANNULER LE DERNIER DÉPLACEMENT » VA DÉFAIRE. PUR. ═════════════════════════════════════
 *
 * Arno : « chaque clic défait le déplacement le plus récent (un lot = un pas) […] on peut cliquer plusieurs fois
 * pour remonter l'historique de la session ».
 *
 * ⚠️ UNE COPIE N'EST PAS UN PAS. L'annuler voudrait dire SUPPRIMER la copie, et l'application ne supprime rien :
 * elle n'entre donc jamais dans cette pile — c'est pour cela que `mouvements` y est vide pour une copie, et que
 * `empiler` l'écarte. Le bouton « saute » les copies parce qu'elles n'y sont jamais entrées.
 */
export function empiler(pile: readonly PasAnnulable[], pas: PasAnnulable): PasAnnulable[] {
  if (pas.mouvements.length === 0) return [...pile];
  return [...pile, pas];
}

/** Le mot de l'infobulle : ce que le prochain clic va défaire. PUR. */
export function motProchaineAnnulation(pile: readonly PasAnnulable[]): string {
  const dernier = pile[pile.length - 1];
  if (dernier === undefined) {
    return 'Aucun geste à annuler dans cette fenêtre. (Une copie ne s’annule pas : l’annuler voudrait dire la '
      + 'supprimer définitivement, et l’application ne le fait nulle part.)';
  }
  /**
   * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LE MOT DIT CE QUE LE CLIC VA FAIRE, pas ce qu'on a fait.
   * « Remettre dans X » pour un déplacement, « Sortir de la corbeille » pour une corbeille : annoncer un
   * déplacement puis restaurer un fichier serait le genre d'écart qui fait hésiter au moment de cliquer.
   */
  if (dernier.sorte === 'corbeille') {
    const quoi = dernier.nombre > 1
      ? `les ${dernier.nombre} fichiers mis à la corbeille`
      : `« ${dernier.nom} »`;
    return `Sortir ${quoi} de la corbeille du Drive`;
  }
  const quoi = dernier.nombre > 1
    ? `les ${dernier.nombre} éléments déplacés`
    : `« ${dernier.nom} »`;
  return `Remettre ${quoi} dans « ${dernier.origineNom} »`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES FICHIERS « ._ » — les AppleDouble de macOS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 CE QUE SONT CES FICHIERS, ET POURQUOI ILS NE SE LISENT PAS ═══════════════════════════════════════════════
 *
 * Quand un Mac écrit sur un disque qui ne connaît pas ses métadonnées (une clé USB, un partage réseau, un dossier
 * synchronisé), il dépose À CÔTÉ de chaque fichier un jumeau nommé « ._nom.pdf », de quelques kilooctets. Il ne
 * contient PAS le document : seulement des attributs étendus et une miniature. L'ouvrir ne montre rien, le joindre
 * enverrait un fichier illisible portant le nom d'un vrai document — c'est-à-dire une pièce jointe qui ment.
 *
 * ⚠️ ILS RESTENT AFFICHÉS (demande d'Arno) : les masquer ferait croire que le Drive a moins de fichiers qu'il n'en
 * a, et l'on chercherait où ils sont passés. Ils sont GRISÉS, nommés pour ce qu'ils sont, et leur infobulle renvoie
 * au vrai fichier.
 */
export const MOT_FICHIER_SYSTEME = 'Fichier système Mac';

export function estFichierSystemeMac(nom: string): boolean {
  return /^\._/.test(nom.trim());
}

/** Le nom du VRAI fichier, celui que ce jumeau accompagne. PUR. */
export function nomReelDe(nom: string): string {
  return nom.trim().replace(/^\._/, '');
}

/** L'infobulle qui renvoie au vrai fichier. PUR. */
export function infobulleFichierSysteme(nom: string): string {
  const reel = nomReelDe(nom);
  return `Fichier technique créé par macOS à côté de « ${reel} ». Il ne contient pas le document : `
    + `ouvrez ou joignez « ${reel} ».`;
}
