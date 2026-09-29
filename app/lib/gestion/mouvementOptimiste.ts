import type { EntreeDrive } from './finderDrive';

/**
 * LOT DRIVE-DEPLACER-RAPIDE — L'ÉCRAN QUI N'ATTEND PAS GOOGLE. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE DEMANDE ARNO : « le glisser-déposer est long quand je déplace des fichiers dans notre Drive, améliore
 * la réactivité » — et, en clair : « au lâcher, l'élément quitte la source et apparaît dans la cible IMMÉDIATEMENT
 * (moins de 100 ms), avec un petit indicateur discret “en cours”. Si le serveur refuse ou échoue, l'élément revient
 * à sa place d'origine, avec le motif en clair. »
 *
 * 🔴 MESURÉ AVANT D'ÊTRE RÉPARÉ. Un déplacement d'un fichier coûtait 4,2 s côté serveur (dont 3,3 s de
 * vérifications) ; cinq fichiers, 12,9 s. Le serveur est devenu plus rapide (parallélisme, mémoire courte), mais
 * même à 1 s l'écran doit répondre AU LÂCHER : la main sait ce qu'elle a fait, l'écran doit le savoir aussi.
 *
 * ⚠️ « OPTIMISTE » NE VEUT PAS DIRE « MENTEUR », ET TOUTE LA DIFFICULTÉ EST LÀ. L'écran affiche le résultat
 * PROBABLE, marqué comme en cours, et il le DÉFAIT si le serveur refuse — en disant pourquoi. Ce qu'il ne fait
 * jamais : laisser croire qu'un déplacement refusé a eu lieu. C'est la raison d'être de `annuler` ci-dessous, et
 * la raison pour laquelle ces fonctions vivent dans un module pur, où on peut les rejouer une par une.
 *
 * 🔴 ET CELA NE TOUCHE À AUCUNE RÈGLE. Le verdict est prononcé par le serveur, sur les chaînes de parents réelles,
 * avant le moindre `files.update`. Ici, on ne décide rien : on range des lignes dans des listes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les listes d'un dossier, telles que l'écran les tient : par identifiant de dossier. */
export type Listes = ReadonlyMap<string, readonly EntreeDrive[]>;

/** Ce qu'on vient de faire, et qu'il faudra peut-être défaire. */
export interface MouvementLocal {
  /** Les éléments déplacés, tels qu'ils étaient dans la source. */
  elements: readonly EntreeDrive[];
  /** D'où ils viennent. `null` quand on ne le sait pas (collage depuis un autre dossier). */
  source: string | null;
  cible: string;
}

/** Retire des entrées d'une liste. PUR. */
export function retirerDe(liste: readonly EntreeDrive[], ids: readonly string[]): EntreeDrive[] {
  const aRetirer = new Set(ids);
  return liste.filter((e) => !aRetirer.has(e.id));
}

/**
 * Ajoute des entrées à une liste, SANS DOUBLON. PUR.
 *
 * ⚠️ LE `parentId` EST RECALÉ SUR LA CIBLE. Sans cela, l'aperçu d'un fichier qu'on vient de déplacer irait chercher
 * ses voisins dans son ANCIEN dossier — il proposerait « Suivant » vers des fichiers qui ne sont plus à côté.
 */
export function ajouterA(
  liste: readonly EntreeDrive[], elements: readonly EntreeDrive[], cible: string,
): EntreeDrive[] {
  const deja = new Set(liste.map((e) => e.id));
  return [...liste, ...elements.filter((e) => !deja.has(e.id)).map((e) => ({ ...e, parentId: cible }))];
}

/**
 * ══ 🔴 CE QUI A ÉTÉ RETIRÉ, ET D'OÙ ═════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 C'EST LA PIÈCE QUI REND LE RETOUR EN ARRIÈRE EXACT. Un déplacement retire l'élément de PARTOUT où l'écran le
 * montrait — il le faut, car la même ligne peut être affichée à deux endroits (le dossier courant, et ce même
 * dossier déplié dans l'arbre), et les listes ne sont pas toutes indexées par l'identifiant Drive du parent : la
 * vue courante l'est par l'endroit où l'on est, qui peut être un alias (« root ») ou la racine de la fenêtre.
 *
 * ⚠️ MAIS ALORS, POUR REMETTRE, IL FAUT SAVOIR D'OÙ. Deviner « le parent » remettrait la ligne dans une liste que
 * l'écran n'affiche pas, et la ligne refusée resterait invisible : l'utilisateur verrait un fichier disparu, sans
 * message qui tienne. On note donc ce qu'on retire, et de quelle liste — et c'est exactement ce qu'on rend.
 */
export type Retires = ReadonlyMap<string, readonly string[]>;

export interface Applique {
  listes: Map<string, EntreeDrive[]>;
  retires: Retires;
}

/**
 * ══ 🔴 APPLIQUE UN DÉPLACEMENT AUX LISTES DE L'ÉCRAN. PUR. ══════════════════════════════════════════════════════
 *
 * ⚠️ UNE COPIE NE RETIRE RIEN : l'original reste où il est, et `source: null` est ce qui le dit.
 *
 * ⚠️ ON N'INVENTE AUCUN DOSSIER. Ajouter les éléments à une cible qu'on n'a jamais ouverte fabriquerait une liste
 * partielle — et l'écran croirait ensuite connaître ce dossier alors qu'il n'aurait vu que ce qu'on vient d'y
 * poser. Un dossier inconnu reste inconnu ; il se chargera quand on l'ouvrira.
 */
export function appliquer(listes: Listes, m: MouvementLocal): Applique {
  const sortie = new Map<string, EntreeDrive[]>();
  const retires = new Map<string, string[]>();
  const ids = new Set(m.elements.map((e) => e.id));
  const deplacement = m.source !== null;

  for (const [id, liste] of listes) {
    if (!deplacement || id === m.cible) { sortie.set(id, [...liste]); continue; }
    const partis = liste.filter((e) => ids.has(e.id)).map((e) => e.id);
    if (partis.length > 0) retires.set(id, partis);
    sortie.set(id, partis.length === 0 ? [...liste] : retirerDe(liste, partis));
  }
  if (sortie.has(m.cible)) {
    sortie.set(m.cible, ajouterA(sortie.get(m.cible) as EntreeDrive[], m.elements, m.cible));
  }
  return { listes: sortie, retires };
}

/**
 * ══ 🔴 DÉFAIT UN DÉPLACEMENT — le chemin qui compte vraiment. PUR. ══════════════════════════════════════════════
 *
 * 🔴 C'EST LUI QUI FAIT QUE L'OPTIMISME N'EST PAS UN MENSONGE. Quand le serveur refuse (l'archive, un dossier dans
 * lui-même, Google indisponible), les lignes reviennent EXACTEMENT d'où elles venaient — dans les listes d'où elles
 * avaient été retirées, pas dans celle qu'on croit être leur parent. Sans ce retour, un refus laisserait à l'écran
 * un déplacement qui n'a pas eu lieu : la pire des deux erreurs, parce qu'on ne la découvre qu'en cherchant le
 * fichier là où il n'est pas.
 *
 * ⚠️ ON NE REMET QUE CE QU'ON NOMME. Un lot dont trois éléments passent et deux sont refusés ne défait que les
 * deux : `refuses` porte les identifiants, et eux seuls reviennent.
 */
export function annuler(
  listes: Listes, m: MouvementLocal, refuses: readonly string[], retires: Retires,
): Map<string, EntreeDrive[]> {
  const aRendre = new Set(refuses);
  const revenants = m.elements.filter((e) => aRendre.has(e.id));
  const sortie = new Map<string, EntreeDrive[]>();
  for (const [id, liste] of listes) sortie.set(id, [...liste]);
  if (revenants.length === 0) return sortie;

  // ① La cible les perd — ils n'y sont jamais arrivés.
  if (sortie.has(m.cible)) {
    sortie.set(m.cible, retirerDe(sortie.get(m.cible) as EntreeDrive[], revenants.map((e) => e.id)));
  }
  // ② Et chaque liste retrouve EXACTEMENT ce qu'on lui avait pris.
  for (const [cle, ids] of retires) {
    const rendus = revenants.filter((e) => ids.includes(e.id));
    if (rendus.length === 0 || !sortie.has(cle)) continue;
    sortie.set(cle, ajouterA(sortie.get(cle) as EntreeDrive[], rendus, cle));
  }
  return sortie;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS DE L'ATTENTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ « EN COURS » SE DIT EN MOTS, jamais par la seule couleur ni par la seule opacité : une ligne pâle peut se lire
 * comme « désactivée », « sélectionnée » ou « coupée » selon l'écran et selon l'œil. L'infobulle tranche.
 */
export const MOT_EN_COURS = 'Déplacement en cours…';

/** Le mot du retour en arrière, quand le serveur a refusé. PUR. */
export function motRetourEnArriere(nom: string, motif: string): string {
  return `« ${nom} » est revenu à sa place : ${motif}`;
}

/**
 * Le mot du bandeau AVANT la réponse du serveur. PUR.
 *
 * 🔴 LE BANDEAU PARAÎT AU LÂCHER (demande d'Arno), donc avant qu'on sache si cela a marché. Il dit ce qu'on est en
 * train de faire, au présent, et « Annuler » n'apparaît qu'ensuite — proposer d'annuler un déplacement qui n'a pas
 * encore eu lieu promettrait un geste qu'on ne saurait pas tenir.
 */
export function motMouvementEnCours(sorte: 'deplacer' | 'copier', n: number, cible: string): string {
  const quoi = n > 1 ? `${n} éléments` : '1 élément';
  return sorte === 'deplacer'
    ? `${quoi} en cours de déplacement vers « ${cible} »…`
    : `${quoi} en cours de copie vers « ${cible} »…`;
}
