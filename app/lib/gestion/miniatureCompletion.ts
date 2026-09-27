/**
 * MODULE « GESTION » — LOT MINIATURES-COMPLÈTES : LES DÉCISIONS DE LA COMPLÉTION RÉTROACTIVE. Fonctions PURES
 * (aucune I/O, aucune base, aucun réseau), donc jugeables et testables sans MinIO, sans Drive et sans horloge.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE, ET CE QU'IL PROTÈGE.
 *
 * La miniature d'une pièce est fabriquée UNE fois et son échec est MÉMORISÉ (`miniature_etat = 'echec'`), pour qu'un
 * fichier mal formé ne redevienne pas une charge à chaque affichage. Cette mémoire est un piège dès qu'on fabrique EN
 * MASSE et DEPUIS LE RÉSEAU : marquer « échec » parce que Google a répondu 503 pendant trois secondes condamnerait la
 * pièce POUR TOUJOURS — la route ne retente jamais un échec mémorisé, et personne ne saurait qu'il faut le défaire.
 *
 * D'où la seule vraie décision de ce lot : un motif d'échec est-il DÉFINITIF (c'est le fichier qui est en cause :
 * on l'inscrit, la pièce garde son icône, on n'y revient plus) ou TRANSITOIRE (c'est le réseau, le stockage ou un
 * jeton : on n'inscrit RIEN, et la prochaine passe réessaiera) ? En cas de doute, on ne mémorise pas : une pièce
 * retentée demain coûte une lecture ; une pièce condamnée à tort ne se voit jamais.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { sortePiece } from './pieces';

/**
 * D'OÙ PEUT VENIR LE CONTENU D'UNE PIÈCE, quand on veut en fabriquer la miniature après coup.
 *
 * · `minio`  — les octets sont encore sur le stockage objet : c'est le cas ordinaire, et le moins cher ;
 * · `drive`  — la pièce a été VIDÉE de MinIO après vérification de sa copie Drive (lot DRIVE-3). Le contenu n'existe
 *              plus que là, et on va l'y LIRE — jamais l'y réécrire, jamais le recopier dans MinIO ;
 * · `aucune` — la pièce n'a jamais été stockée (type refusé, trop lourde, stockage indisponible à la relève) et n'a
 *              pas de copie Drive vérifiée. Il n'y a aucun octet à lire nulle part : ce n'est pas un échec, c'est une
 *              absence, et elle se dit comme telle.
 */
export type SourceContenu = 'minio' | 'drive' | 'aucune';

/** Ce que la base sait d'une pièce à compléter. Le strict nécessaire pour décider — rien de l'affichage. */
export interface PieceACompleter {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  /** Clé sur le stockage objet. ⚠️ Elle SURVIT au vidage : sa présence ne prouve donc PAS que les octets y sont. */
  cleStockage: string | null;
  /** Renseignés quand la pièce a été vidée vers le Drive (table `gestion_piece_vidage`). */
  videe: boolean;
  driveFileId: string | null;
  /** L'empreinte relevée AU MOMENT du vidage : elle seule dit que le fichier lu est bien celui qu'on avait copié. */
  driveMd5: string | null;
}

/**
 * OÙ ALLER CHERCHER LES OCTETS. PUR.
 *
 * 🔴 LE VIDAGE NE VIDE PAS `cle_stockage`, et c'est le piège central de ce lot : la colonne garde sa valeur pour que
 * la preuve d'effacement reste lisible (`gestion_piece_vidage` la reprend). Lire « clé présente donc contenu présent »
 * est FAUX pour 4 058 pièces au 27/09/2026 — c'est exactement ce que fait la route de vignette, qui appelle MinIO,
 * reçoit « The specified key does not exist », rend un 503 et laisse l'icône. C'est la cause des quatre PDF sans
 * aperçu signalés par Arno (message 668 du fil 354, vidés le 27/09 à 02 h 23).
 *
 * L'ordre des questions est donc : VIDÉE d'abord (le fait le plus récent), stockage ensuite.
 */
export function sourceContenu(p: PieceACompleter): SourceContenu {
  if (p.videe) return p.driveFileId !== null && p.driveFileId !== '' ? 'drive' : 'aucune';
  return p.cleStockage !== null && p.cleStockage !== '' ? 'minio' : 'aucune';
}

/**
 * LA PIÈCE PEUT-ELLE AVOIR UNE MINIATURE, vu son type ? PUR.
 *
 * On pose la question AVANT de lire le moindre octet : télécharger 40 Mo d'archive ZIP depuis le Drive pour
 * découvrir ensuite qu'on n'en fera rien serait une dépense pure. C'est `sortePiece` qui tranche — la même fonction
 * que l'écran et que `genererMiniature`, pour qu'aucun des trois ne puisse dire autre chose que les deux autres.
 */
export function peutAvoirMiniature(typeMime: string | null, nomFichier: string): boolean {
  return sortePiece(typeMime, nomFichier) !== 'autre';
}

/**
 * ══ 🔴 CE MOTIF D'ÉCHEC EST-IL DÉFINITIF ? ═══════════════════════════════════════════════════════════════════════
 *
 * `true`  → on inscrit `miniature_etat = 'echec'` : le FICHIER est en cause, rien ne changera en réessayant, et la
 *           mémoire de l'échec évite de redécoder le même fichier illisible à chaque affichage.
 * `false` → on n'inscrit RIEN : le réseau, le stockage ou un jeton sont en cause. La pièce reste « jamais tentée »
 *           et la passe suivante la reprendra. C'est ce qui rend la commande REPRENABLE sans rattrapage manuel.
 *
 * ⚠️ LA LISTE EST CELLE DES CAS DÉFINITIFS, ET LE DÉFAUT EST « TRANSITOIRE ». L'inverse — une liste de cas
 * transitoires, tout le reste étant définitif — condamnerait toute panne qu'on n'a pas su nommer d'avance. Se
 * tromper dans un sens coûte une lecture de plus demain ; se tromper dans l'autre efface un aperçu pour toujours.
 */
const MOTIFS_DEFINITIFS: readonly RegExp[] = [
  /pièce vide/i,
  /trop volumineuse/i,
  /type sans miniature/i,
  /PDF sans page/i,
  /dimension nulle/i,
  /trop grande à rasteriser/i,
  /image illisible/i,
  // Le rasteriseur et `sharp` nomment ainsi un fichier qui n'est pas ce qu'il prétend être.
  /format .*(inconnu|non pris en charge|unsupported)/i,
  /unsupported image format/i,
  /Failed to load document/i,
  /Invalid PDF/i,
  /mot de passe|password/i,
  /**
   * ⚠️ APPRIS DE LA PREMIÈRE PASSE RÉELLE (27/09/2026, Réception 90 jours) : une seule pièce sur 1 560 est restée
   * « à reprendre », un HEIC de 1,6 Mo pour lequel `sharp` rend « Input buffer has corrupt header: heif: Memory
   * allocation error: Security limit exceeded ». C'est la garde de libheif contre une image démesurée : le verdict
   * porte sur LE FICHIER et il est le même à chaque essai. Le laisser « transitoire » aurait fait relire cette pièce
   * depuis le Drive à chaque passe, pour toujours, sans jamais aboutir.
   *
   * ⚠️ ON N'INSCRIT QUE `corrupt header`, PAS « Security limit exceeded » SEUL : ce second membre parle d'une limite
   * de la bibliothèque, qu'un réglage pourrait relever un jour. L'en-tête abîmé, lui, ne se répare pas.
   */
  /corrupt header/i,
];

export function echecDefinitif(motif: string): boolean {
  return MOTIFS_DEFINITIFS.some((r) => r.test(motif));
}

/**
 * CE QUE LA COMMANDE FAIT D'UNE PIÈCE, décidé AVANT toute lecture. PUR.
 *
 * `ignorer` n'est pas un échec : une pièce dont le type n'a pas d'aperçu (un .xml, un .zip) ou dont les octets
 * n'existent nulle part est un CONSTAT, pas une panne. On l'inscrit tout de même comme échec définitif quand le TYPE
 * est en cause — sans quoi la route redemanderait le fichier à chaque affichage pour reconclure la même chose — mais
 * jamais quand c'est le CONTENU qui manque : les octets peuvent revenir (une copie Drive restaurée, un stockage
 * remonté), et condamner la pièce interdirait de la reprendre.
 */
export type Plan =
  | { faire: 'fabriquer'; source: 'minio' | 'drive' }
  | { faire: 'inscrire_echec'; motif: string }
  | { faire: 'ignorer'; motif: string };

export function planifier(p: PieceACompleter): Plan {
  if (!peutAvoirMiniature(p.typeMime, p.nomFichier)) {
    return { faire: 'inscrire_echec', motif: 'type sans miniature' };
  }
  const source = sourceContenu(p);
  if (source === 'aucune') {
    return {
      faire: 'ignorer',
      motif: p.videe ? 'vidée sans copie Drive utilisable' : 'aucun contenu stocké',
    };
  }
  return { faire: 'fabriquer', source };
}

/**
 * LE COMPTE RENDU D'UNE PASSE. Les mêmes mots en simulation et en application : ce qu'annonce la simulation est
 * exactement ce que fera `--appliquer`, sinon la simulation ne servirait à rien.
 */
export interface Bilan {
  vues: number;
  faites: number;
  depuisMinio: number;
  depuisDrive: number;
  echecsDefinitifs: number;
  echecsTransitoires: number;
  ignorees: number;
}

export function bilanVide(): Bilan {
  return {
    vues: 0, faites: 0, depuisMinio: 0, depuisDrive: 0,
    echecsDefinitifs: 0, echecsTransitoires: 0, ignorees: 0,
  };
}
