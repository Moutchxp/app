import type { NomVuDansDrive } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM — LA MÉMOIRE DES NOMS LUS DANS DRIVE, ET SON OUBLI ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT QUI A FAIT NAÎTRE CE MODULE, TROUVÉ À L'ÉPREUVE RÉELLE LE 03/10/2026 — ET IL EST GRAVE.
 *
 * Renommage de la pièce 27087 depuis la visionneuse du mail, à 11:36:40.334 :
 *   · journal ligne 81 — « test renomage.pdf » → « epreuve lot extension.pdf », source `app`, aucun refus ;
 *   · journal ligne 82 — 63 MILLISECONDES PLUS TARD, « epreuve lot extension.pdf » → « test renomage.pdf »,
 *     source `drive`, « Google Drive ».
 *
 * Le renommage S'ÉTAIT ANNULÉ TOUT SEUL. Le nom final était celui d'avant, dans la base comme dans le Drive, et
 * rien à l'écran ne le disait. C'est exactement l'inverse de la règle d'Arno « un document = un seul nom ».
 *
 * ═══ 🔴 LA CAUSE, ET ELLE TIENT EN TROIS LIGNES ════════════════════════════════════════════════════════════════
 *
 * La reprise « a-t-on renommé ce fichier DANS Google Drive ? » compare le nom que Google rend au nom que NOUS y
 * avons écrit (`nom_drive`). Les noms lus chez Google sont mémorisés 30 secondes, pour ne pas repayer une série
 * de `files.get` à chaque écran. Or :
 *
 *   ① l'ouverture de la visionneuse remplit la mémoire avec l'ANCIEN nom ;
 *   ② le renommage écrit le NOUVEAU nom dans Drive, et le note dans `nom_drive` ;
 *   ③ le rechargement du fil relance la reprise — qui relit la MÉMOIRE, donc l'ancien nom, le trouve différent
 *      de `nom_drive`, en conclut « quelqu'un l'a renommé dans Drive » et REVIENT en arrière.
 *
 * 🔴 LA MÉMOIRE DISAIT VRAI À LA SECONDE OÙ ELLE A ÉTÉ REMPLIE, ET FAUX UNE SECONDE PLUS TARD — parce que c'est
 * NOUS qui l'avons rendue fausse. Un cache n'a pas à deviner cela : c'est à l'écrivain de le lui dire.
 *
 * ═══ 🔴 POURQUOI UN MODULE À PART, ET NON LA MÊME `Map` LÀ OÙ ELLE VIVAIT ════════════════════════════════════════
 *
 * Elle vivait dans `relectureNomsDrive.ts`, qui importe `renommagePieceReel` (la reprise aligne les copies). Or
 * c'est le CHEMIN D'ÉCRITURE qui doit oublier — donc `nomUsageRepo`, que `relectureNomsDrive` importe déjà. Le
 * cycle était inévitable tant que la mémoire restait là-bas. Ici, ce module n'importe RIEN (qu'un type), et les
 * deux côtés peuvent s'en servir sans se tenir l'un l'autre.
 *
 * 🔒 ELLE NE PORTE QUE DES NOMS DE FICHIERS, en mémoire du processus, et meurt avec lui. Aucun octet de document,
 * rien sur le disque, rien dans le Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ 30 s, ET PAS DAVANTAGE : au-delà, un nom changé dans Drive pendant qu'on regarde l'écran ne remonterait pas
 * au geste suivant. C'est le délai au bout duquel on accepte de se tromper — pas un réglage de confort.
 *
 * 🔴 ET CE DÉLAI NE COUVRE PLUS NOS PROPRES ÉCRITURES, depuis ce lot : celles-là s'oublient à l'instant où on les
 * fait. La mémoire ne sert qu'à ne pas redemander à Google ce que PERSONNE n'a changé.
 */
export const MEMOIRE_NOMS_MS = 30_000;

interface Vu { valeur: NomVuDansDrive | null; expireA: number }

/**
 * 🔴 LA CLÉ PORTE LE SUJET (l'adresse au nom de laquelle on interroge Google) — même règle que `driveMemoire`.
 * Google applique les droits de CETTE personne : une mémoire partagée entre deux collaborateurs ferait voir à
 * l'un ce que l'autre seul peut lire. C'est le genre de fuite qu'un cache introduit sans bruit.
 */
export const memoireNoms = new Map<string, Vu>();

/** La clé d'une entrée. Une seule écriture de la règle, pour qui lit comme pour qui oublie. PUR. */
export function cleNomDrive(sujet: string, id: string): string {
  return `${sujet}|${id}`;
}

/**
 * ══ 🔴🔴 OUBLIER CE QU'ON VIENT DE RENDRE FAUX ══════════════════════════════════════════════════════════════════
 *
 * Appelé par le chemin d'ÉCRITURE, à l'instant où l'application écrit un nom dans Google Drive.
 *
 * 🔴 TOUS SUJETS CONFONDUS, et c'est nécessaire : le fichier a changé de nom pour TOUT LE MONDE. Ne vider que
 * l'entrée de la personne qui renomme laisserait la prochaine lecture d'un collègue reprendre l'ancien nom — le
 * même défaut, simplement déplacé d'un siège à l'autre.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS ET NE REND RIEN D'UTILE AU GESTE : oublier un cache ne peut pas faire échouer un
 * renommage. Le nombre rendu sert aux épreuves, pas à une décision.
 */
export function oublierCesNoms(driveFileIds: readonly string[]): number {
  let oubliees = 0;
  for (const brut of driveFileIds) {
    const id = brut.trim();
    if (id === '') continue;
    const suffixe = `|${id}`;
    for (const cle of [...memoireNoms.keys()]) {
      if (cle.endsWith(suffixe)) { memoireNoms.delete(cle); oubliees += 1; }
    }
  }
  return oubliees;
}

/** Tout oublier. Pour les tests, et pour une passe qui voudrait repartir à neuf. Sans effet sur le Drive. */
export function oublierLesNomsDrive(): void {
  memoireNoms.clear();
}

/** Combien de noms sont retenus. Sert aux mesures et aux tests — jamais à l'écran. */
export function tailleMemoireNoms(): number {
  return memoireNoms.size;
}
