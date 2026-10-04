/**
 * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — CE QU'ON GARDE, ET CE QU'ON REFUSE ════════════════
 *
 * Module PUR : aucune I/O, aucune base, aucun réseau, aucun DOM. Il est atteint par le NAVIGATEUR (les mentions
 * d'écran viennent d'ici) : il ne doit donc jamais rien importer qui tire `pg`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026), sur les 394 pièces refusées à la relève :
 *
 *   À RÉCUPÉRER : les images HEIF/HEIC · les zip et `application/octet-stream`, « stockés tels quels, proposés en
 *   TÉLÉCHARGEMENT SEULEMENT (jamais ouverts, prévisualisés ni décompressés par l'application), avec la mention
 *   “Fichier à ouvrir avec précaution” » · plafond relevé à 50 Mo.
 *
 *   À NE PAS RÉCUPÉRER : `pkcs7-signature` (« Signature électronique du mail — pas un document ») · « tout
 *   exécutable ou script (.exe, .bat, .cmd, .com, .msi, .app, .dmg, .pkg, .js, .vbs, .scr, .jar, .sh, .ps1), quel
 *   que soit le type annoncé » (« Programme non récupéré par sécurité — voir dans Gmail »). Et : « Décide sur
 *   l'extension ET sur le contenu réel (signature du fichier), pas sur le type annoncé. »
 *
 * ═══ 🔴🔴 DEUX COUCHES, ET IL NE FAUT PAS LES CONFONDRE ══════════════════════════════════════════════════════════
 *
 *   ① LA LISTE BLANCHE DES TYPES — ce qu'on accepte de garder. Elle vit dans `gestion_config.types_pieces_acceptes`
 *      (pilotage sans code), avec un repli identique dans `config.ts`. Elle se RÈGLE.
 *
 *   ② CE REFUS-CI — un programme, un script, une signature électronique. Il **n'est pas configurable**, et c'est
 *      délibéré : une règle de sécurité rangée dans une table se débranche d'un `UPDATE`. Elle est écrite dans ce
 *      fichier, elle y reste, et elle s'applique AVANT la liste blanche.
 *
 * 🔴 ET LES DEUX COUCHES TIENNENT DANS LA MÊME PORTE : `deposerPieceGestion`. La relève future et le rattrapage des
 * 394 pièces passent exactement par là — il n'y a donc pas un chemin « normal » et un chemin « de rattrapage » qui
 * pourraient diverger. C'est la condition d'Arno (« la liste blanche vit à un seul endroit et vaut pour la relève
 * future comme pour ce rattrapage »), appliquée au refus aussi.
 *
 * ═══ 🔴🔴 POURQUOI L'EXTENSION **ET** LE CONTENU, ET CE QUE CHACUN ATTRAPE ════════════════════════════════════════
 *
 * Mesuré sur les 394 pièces le 04/10/2026, le type ANNONCÉ ment couramment :
 *   · 36 fichiers `.heic` — 28 annoncés `image/heif`, **8 annoncés `application/octet-stream`** ;
 *   · 4 fichiers `.pdf` — dont **2 annoncés `text/plain`** ;
 *   · 1 fichier `.docx` annoncé `application/zip` (ce qui est techniquement vrai : un docx EST un zip).
 *
 * 🔴 L'EXTENSION attrape ce que le contenu ne dira pas : un `.msi` et un `.doc` partagent la même signature OLE
 * (`D0CF11E0`), et un `.dmg` ne se reconnaît qu'à sa fin. Refuser `.msi` sur la signature aurait refusé tous les
 * `.doc`.
 *
 * 🔴 LE CONTENU attrape ce que l'extension ne dira pas : un exécutable renommé « facture.pdf ». La signature `MZ`
 * ne se renomme pas.
 *
 * ⚠️ AUCUNE RÈGLE SUR `#!` (shebang). Un fichier texte parfaitement légitime peut commencer par ces deux
 * caractères, et un script n'est dangereux que s'il est NOMMÉ comme tel — ce que la liste d'extensions couvre.
 * Refuser sur le shebang aurait écarté des `.txt` en croyant protéger quelqu'un.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES MOTS — ceux qui s'écrivent en base (motifs) et ceux qui s'affichent (mentions)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LE MOTIF EST CE QUI S'ÉCRIT EN BASE ; LA MENTION EST CE QUI S'AFFICHE. Les deux sont liés par
 * `mentionPieceRefusee`, et c'est ce lien qui permet à l'écran de dire la phrase exacte d'Arno sans que la base
 * porte une phrase d'écran.
 */
export const MOTIF_PROGRAMME = 'programme ou script : non récupéré par sécurité';
export const MOTIF_SIGNATURE = 'signature électronique du mail (pkcs7) : ce n’est pas un document';

/** Les mentions d'écran, mot pour mot celles d'Arno. */
export const MENTION_PROGRAMME = 'Programme non récupéré par sécurité — voir dans Gmail';
export const MENTION_SIGNATURE = 'Signature électronique du mail — pas un document';
export const MENTION_PRECAUTION = 'Fichier à ouvrir avec précaution';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES PROGRAMMES — par le nom, et par les octets
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES EXTENSIONS REFUSÉES, celles d'Arno **au caractère près**, plus les variantes du MÊME format qui seraient
 * absurdes à laisser passer.
 *
 * ⚠️ LES AJOUTS SONT NOMMÉS ET JUSTIFIÉS, jamais glissés : `.command` est le `.sh` de macOS (double-clic =
 * exécution), `.bash`/`.zsh` sont le même script sous un autre nom, `.mjs`/`.cjs` sont le même JavaScript que
 * `.js`, `.msix`/`.appx` sont le `.msi` d'aujourd'hui, `.lnk` est un raccourci Windows qui exécute ce qu'il veut,
 * et `.reg` modifie le registre. En refuser une et pas son synonyme serait une liste pour la forme.
 */
export const EXTENSIONS_PROGRAMME: readonly string[] = [
  // ── la liste d'Arno, telle quelle ──────────────────────────────────────────────────────────────────────────
  'exe', 'bat', 'cmd', 'com', 'msi', 'app', 'dmg', 'pkg', 'js', 'vbs', 'scr', 'jar', 'sh', 'ps1',
  // ── les synonymes du même format, nommés ci-dessus ────────────────────────────────────────────────────────
  'command', 'bash', 'zsh', 'mjs', 'cjs', 'msix', 'appx', 'lnk', 'reg', 'vbe', 'wsf', 'wsh', 'hta', 'psm1',
];

/**
 * LES SIGNATURES BINAIRES D'UN PROGRAMME — lues sur les premiers octets, donc insensibles au nom.
 *
 * 🔴 CHACUNE EST SANS AMBIGUÏTÉ, et c'est le critère d'entrée dans cette liste :
 *   · `MZ`        — en-tête DOS/PE : tout `.exe`, `.dll`, `.scr` Windows ;
 *   · `\x7FELF`   — binaire Linux ;
 *   · `feedface` et ses trois variantes d'ordre d'octets — binaire Mach-O (macOS) ;
 *   · `cafebabe`  — Mach-O universel ET classe Java compilée : les deux sont du code ;
 *   · `xar!`      — archive XAR, le format des `.pkg` d'installation macOS.
 *
 * ⚠️ `D0CF11E0` (OLE) N'Y EST PAS, ET C'EST UN CHOIX RAISONNÉ : c'est la signature d'un `.msi`… et aussi celle de
 * tous les `.doc` et `.xls`. L'y mettre aurait refusé 16 documents Word de cette base pour attraper zéro `.msi`.
 * Le `.msi` est couvert par son extension.
 */
const SIGNATURES_PROGRAMME: readonly (readonly number[])[] = [
  [0x4d, 0x5a],                         // « MZ »
  [0x7f, 0x45, 0x4c, 0x46],             // « \x7FELF »
  [0xfe, 0xed, 0xfa, 0xce],             // Mach-O 32 bits, gros-boutien
  [0xce, 0xfa, 0xed, 0xfe],             // Mach-O 32 bits, petit-boutien
  [0xfe, 0xed, 0xfa, 0xcf],             // Mach-O 64 bits, gros-boutien
  [0xcf, 0xfa, 0xed, 0xfe],             // Mach-O 64 bits, petit-boutien
  [0xca, 0xfe, 0xba, 0xbe],             // Mach-O universel · classe Java
  [0x78, 0x61, 0x72, 0x21],             // « xar! » — .pkg macOS
];

/** L'extension d'un nom de fichier, en minuscules, sans le point. Vide s'il n'y en a pas. PUR. */
export function extensionDe(nomFichier: string | null | undefined): string {
  const nom = (nomFichier ?? '').trim();
  const point = nom.lastIndexOf('.');
  if (point <= 0 || point === nom.length - 1) return '';
  const ext = nom.slice(point + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/** Ce nom désigne-t-il un programme ou un script ? PUR. */
export function estProgrammeParLeNom(nomFichier: string | null | undefined): boolean {
  return EXTENSIONS_PROGRAMME.includes(extensionDe(nomFichier));
}

/**
 * Ces octets SONT-ILS un programme ? PUR.
 *
 * ⚠️ ON NE LIT QUE LE DÉBUT. Quatre octets suffisent à toutes les signatures retenues, et ouvrir davantage ne
 * servirait qu'à donner l'illusion d'une analyse. Un fichier plus court que la signature n'est pas un programme.
 */
export function estProgrammeParLeContenu(octets: Uint8Array | null | undefined): boolean {
  if (octets === null || octets === undefined || octets.byteLength < 2) return false;
  return SIGNATURES_PROGRAMME.some((sig) => sig.every((o, i) => octets[i] === o));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA SIGNATURE ÉLECTRONIQUE — un `smime.p7s` n'est pas une pièce jointe
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const TYPES_SIGNATURE: readonly string[] = [
  'application/pkcs7-signature', 'application/x-pkcs7-signature',
  'application/pkcs7-mime', 'application/x-pkcs7-mime',
];

/** Type MIME normalisé : minuscules, sans le `; charset=…`. Même règle que `stockage/index.ts`. PUR. */
export function typeNu(typeMime: string | null | undefined): string {
  return (typeMime ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Cette pièce est-elle la signature électronique du mail ? PUR.
 *
 * 🔴 LE TYPE **OU** LE NOM. Les six pièces de cette base sont annoncées `application/pkcs7-signature` et nommées
 * `smime.p7s` — mais un client de messagerie qui n'annoncerait rien laisserait passer le nom seul, et l'inverse
 * est vrai aussi. On ne garde pas une signature parce qu'un expéditeur a mal rempli un en-tête.
 */
export function estSignatureElectronique(o: { nom?: string | null; typeMime?: string | null }): boolean {
  if (TYPES_SIGNATURE.includes(typeNu(o.typeMime))) return true;
  return ['p7s', 'p7m'].includes(extensionDe(o.nom));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ TÉLÉCHARGEMENT SEULEMENT — « jamais ouverts, prévisualisés ni décompressés par l'application »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES TYPES QU'ON GARDE MAIS QU'ON N'OUVRE PAS. Décision d'Arno, mot pour mot : « zip et
 * `application/octet-stream` : stockés tels quels, proposés en TÉLÉCHARGEMENT SEULEMENT ».
 *
 * 🔴 CE N'EST PAS UNE QUESTION DE CONFORT, C'EST LA CONTREPARTIE DE LEUR ENTRÉE DANS LA LISTE BLANCHE. Un
 * `application/octet-stream` est, par définition, « je ne sais pas ce que c'est » : le servir `inline` laisserait
 * le navigateur deviner, et un navigateur qui devine finit par exécuter. Un zip, lui, n'est pas dangereux tant
 * qu'on ne l'ouvre pas — et nous ne l'ouvrons jamais.
 */
const TYPES_TELECHARGEMENT_SEUL: readonly string[] = [
  'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
  'application/x-rar-compressed', 'application/vnd.rar', 'application/x-7z-compressed',
  'application/gzip', 'application/x-tar',
];

/** Les extensions d'archive, pour les mails qui annoncent un type vague sur un fichier clairement compressé. */
const EXTENSIONS_ARCHIVE: readonly string[] = ['zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz'];

/**
 * Cette pièce se télécharge-t-elle SEULEMENT ? PUR.
 *
 * ⚠️ LE TYPE RÉEL PREND LE PAS SUR LE VAGUE. Un `.heic` annoncé `application/octet-stream` est une photo : elle
 * n'a pas à être rangée parmi les fichiers à ouvrir avec précaution. C'est pourquoi le rattrapage corrige le type
 * (voir `typeReelSiVague`) AVANT de stocker, et pourquoi cette fonction juge sur le type retenu.
 */
export function telechargementSeulement(o: { nom?: string | null; typeMime?: string | null }): boolean {
  if (TYPES_TELECHARGEMENT_SEUL.includes(typeNu(o.typeMime))) return true;
  return EXTENSIONS_ARCHIVE.includes(extensionDe(o.nom));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LE TYPE RÉEL, QUAND LE TYPE ANNONCÉ NE DIT RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les signatures qui identifient un format SANS ambiguïté, pour redresser un type annoncé vague. */
const SIGNATURES_FORMAT: readonly { octets: readonly number[]; decalage?: number; type: string }[] = [
  { octets: [0x25, 0x50, 0x44, 0x46], type: 'application/pdf' },                      // « %PDF »
  { octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type: 'image/png' },
  { octets: [0xff, 0xd8, 0xff], type: 'image/jpeg' },
  { octets: [0x47, 0x49, 0x46, 0x38], type: 'image/gif' },                            // « GIF8 »
  { octets: [0x50, 0x4b, 0x03, 0x04], type: 'application/zip' },                      // « PK\x03\x04 »
];

/** Les marques `ftyp` d'un conteneur ISO-BMFF, et ce qu'elles désignent vraiment. */
const MARQUES_FTYP: readonly { marques: readonly string[]; type: string }[] = [
  { marques: ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1'], type: 'image/heic' },
  { marques: ['qt  '], type: 'video/quicktime' },
  { marques: ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'm4v ', 'mmp4'], type: 'video/mp4' },
];

const texte = (octets: Uint8Array, de: number, a: number): string =>
  Array.from(octets.slice(de, a)).map((o) => String.fromCharCode(o)).join('').toLowerCase();

/**
 * LE TYPE QUE LES OCTETS RÉVÈLENT, quand le type annoncé ne dit rien. `null` = on ne sait pas, et on garde donc
 * ce qui était annoncé. PUR.
 *
 * ═══ 🔴🔴 QUAND CETTE FONCTION A LE DROIT DE PARLER, ET QUAND ELLE SE TAIT ═══════════════════════════════════
 *
 * 🔴 ELLE NE REDRESSE QUE LE **VAGUE** : type absent, ou `application/octet-stream`, qui veut littéralement dire
 * « je ne sais pas ». Elle ne contredit JAMAIS un type précis, même faux. Les 2 fichiers `.pdf` annoncés
 * `text/plain` de cette base restent donc annoncés `text/plain` : corriger un type précis, c'est décider qu'on
 * sait mieux que l'expéditeur, et ce n'est pas la même décision — elle n'a pas été demandée.
 *
 * ⚠️ `D0CF11E0` (OLE) EST ABSENT D'ICI AUSSI : il ne distingue pas un `.doc` d'un `.xls` ni d'un `.msi`. Un
 * redressement qui se tromperait de format serait pire que pas de redressement.
 *
 * ⚠️ ET `PK\x03\x04` REND `application/zip`, PAS `docx` : un zip EST ce qu'on voit ; deviner que c'est un
 * document Office demanderait d'ouvrir l'archive, ce que l'application s'interdit.
 */
export function typeReelSiVague(o: { typeMime?: string | null; octets: Uint8Array }): string | null {
  const annonce = typeNu(o.typeMime);
  if (annonce !== '' && annonce !== 'application/octet-stream') return null;
  const b = o.octets;
  if (b.byteLength < 12) return null;

  for (const s of SIGNATURES_FORMAT) {
    const d = s.decalage ?? 0;
    if (s.octets.every((oc, i) => b[d + i] === oc)) return s.type;
  }
  // RIFF….WEBP : la marque est à l'octet 8, pas au début.
  if (texte(b, 0, 4) === 'riff' && texte(b, 8, 12) === 'webp') return 'image/webp';
  // ISO-BMFF : « ftyp » à l'octet 4, la marque de format juste après.
  if (texte(b, 4, 8) === 'ftyp') {
    const marque = texte(b, 8, 12);
    for (const m of MARQUES_FTYP) if (m.marques.includes(marque)) return m.type;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ bis — LES SYNONYMES D'UN MÊME FORMAT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (04/10/2026) : « autorise image/jpg, image/x-png et image/webp (synonymes de jpeg/png, à ajouter
   dans la liste blanche unique), puis rattrape les 11 photos. »

   🔴 DEUX DES TROIS SONT DES SYNONYMES EXACTS, ET LES TRAITER COMME TELS ÉVITE TROIS AUTRES LISTES. `image/jpg` et
   `image/x-png` désignent le MÊME format que `image/jpeg` et `image/png` — ce sont des orthographes anciennes,
   encore écrites par certains clients de messagerie. Mesuré sur cette base : 5 pièces `image/jpg`, 4 `image/x-png`,
   2 `image/webp`, toutes des photos ordinaires, perdues pour une orthographe.

   ⚠️ CE QUE LA NORMALISATION ÉVITE, ET CE N'EST PAS UNE COMMODITÉ. Sans elle, il aurait fallu inscrire
   `image/x-png` dans TROIS listes de plus pour qu'une photo se comporte comme une photo :
     · `pieces.IMAGES_MINIATURABLES` (sinon : une icône au lieu d'une miniature) ;
     · `apercuDrive.IMAGES` (sinon : pas d'œil, pas de visionneuse) ;
     · `stockage.EXTENSIONS_GESTION` (sinon : le fichier stocké s'appelle `.bin`).
   Trois listes à tenir d'accord pour une orthographe : c'est exactement la duplication que ce dépôt passe son
   temps à défaire.

   🔴 ET LA LISTE BLANCHE PORTE QUAND MÊME LES TROIS, comme Arno l'a demandé : elle est le REGISTRE DE LA DÉCISION,
   et elle autoriserait ces types même si cette normalisation disparaissait un jour. Elle n'est donc pas du poids
   mort — c'est une ceinture en plus de la bretelle.

   ⚠️ `image/webp` N'EST PAS UN SYNONYME : c'est un format à lui. Il n'est pas normalisé, il est simplement
   autorisé — et il était déjà connu des deux listes d'affichage, il ne manquait qu'à la liste blanche. */

/** Les orthographes anciennes d'un format, et sa forme canonique. PUR. */
const SYNONYMES_TYPE: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-citrix-jpeg': 'image/jpeg',
  'image/x-citrix-png': 'image/png',
};

/**
 * LA FORME CANONIQUE D'UN TYPE MIME. PUR.
 *
 * ⚠️ ELLE NE DEVINE RIEN : c'est une table d'orthographes, pas une heuristique. Un type absent de la table est
 * rendu tel quel. Deviner reviendrait à contredire l'expéditeur, ce que `typeReelSiVague` s'interdit déjà pour un
 * type précis.
 */
export function typeCanonique(typeMime: string | null | undefined): string {
  const t = typeNu(typeMime);
  return SYNONYMES_TYPE[t] ?? t;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LE VERDICT — l'unique point d'entrée de la porte de dépôt
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type VerdictPiece =
  | { garder: true; typeRetenu: string; redresse: boolean }
  | { garder: false; motif: string };

/**
 * ══ 🔴🔴 GARDE-T-ON CETTE PIÈCE, ET SOUS QUEL TYPE ? PUR. ═══════════════════════════════════════════════════════
 *
 * 🔴 L'ORDRE DES TROIS QUESTIONS EST LA RÈGLE, pas une commodité :
 *   ① EST-CE UN PROGRAMME ? — par le nom OU par les octets. Posée en PREMIER : un exécutable renommé
 *      « photo.jpg » ne doit pas être sauvé par le fait que « jpg » soit dans la liste blanche.
 *   ② EST-CE LA SIGNATURE DU MAIL ? — ce n'est pas un document, et le dire vaut mieux que le garder.
 *   ③ SINON, SOUS QUEL TYPE ? — le type annoncé, ou celui que les octets révèlent s'il était vague.
 *
 * ⚠️ LA LISTE BLANCHE N'EST PAS CONSULTÉE ICI, ET C'EST VOLONTAIRE : elle est configurable, ce verdict non. Elle
 * s'applique ENSUITE, dans `deposerPieceGestion`, sur le type que ce verdict retient. Les mélanger aurait permis
 * de débrancher une règle de sécurité par un `UPDATE` sur `gestion_config`.
 */
export function verdictPiece(o: {
  nom?: string | null; typeMime?: string | null; octets: Uint8Array;
}): VerdictPiece {
  if (estProgrammeParLeNom(o.nom) || estProgrammeParLeContenu(o.octets)) {
    return { garder: false, motif: MOTIF_PROGRAMME };
  }
  if (estSignatureElectronique({ nom: o.nom, typeMime: o.typeMime })) {
    return { garder: false, motif: MOTIF_SIGNATURE };
  }
  const reel = typeReelSiVague({ typeMime: o.typeMime, octets: o.octets });
  if (reel !== null) return { garder: true, typeRetenu: reel, redresse: true };
  /**
   * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — L'ORTHOGRAPHE ANCIENNE EST RAMENÉE À LA CANONIQUE.
   *
   * `image/jpg` → `image/jpeg`, `image/x-png` → `image/png`. C'est un REDRESSEMENT, et il est annoncé comme tel
   * (`redresse: true`) : le type stocké n'est pas celui que le mail annonçait, et le rattrapage l'inscrit en base
   * pour que les écrans traitent la pièce comme la photo qu'elle est.
   *
   * ⚠️ RIEN N'EST DEVINÉ : voir la table `SYNONYMES_TYPE`. Un type inconnu de la table ressort tel quel.
   */
  const canonique = typeCanonique(o.typeMime);
  return canonique === typeNu(o.typeMime)
    ? { garder: true, typeRetenu: canonique, redresse: false }
    : { garder: true, typeRetenu: canonique, redresse: true };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ CE QUE L'ÉCRAN ÉCRIT SUR UNE PIÈCE QU'ON N'A PAS GARDÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA MENTION D'UNE PIÈCE REFUSÉE, d'après son motif en base. PUR.
 *
 * 🔴 TROIS PHRASES, ET CHACUNE DIT AUTRE CHOSE :
 *   · un programme → « Programme non récupéré par sécurité — voir dans Gmail » : c'est NOUS qui refusons, et la
 *     phrase d'Arno invite explicitement à aller le chercher — le lien est donc proposé ;
 *   · une signature → « Signature électronique du mail — pas un document » : il n'y a RIEN à aller chercher, et
 *     proposer Gmail ferait croire qu'on a perdu quelque chose. Sa phrase ne mentionne pas Gmail, et c'est
 *     exactement pour cela ;
 *   · tout le reste → la phrase du lot précédent, « Pièce non récupérée — voir dans Gmail » (type hors liste
 *     blanche, pièce trop volumineuse).
 *
 * 🔴 LE LIEN SUIT LA PHRASE, il ne la contredit pas : `avecLienGmail` est vrai exactement quand la mention dit
 * « voir dans Gmail ». Un lien sous une phrase qui n'en parle pas, ou une phrase qui renvoie à Gmail sans lien,
 * sont les deux formes du même défaut.
 */
export interface MentionRefus { mention: string; avecLienGmail: boolean }

export const MENTION_DEFAUT: MentionRefus = {
  mention: 'Pièce non récupérée — voir dans Gmail', avecLienGmail: true,
};

export function mentionPieceRefusee(motifNonStocke: string | null | undefined): MentionRefus {
  /* ⚠️ COMPARAISON SUR LE MOTIF ENTIER, pas sur un préfixe deviné : c'est la porte de dépôt qui l'écrit, mot pour
     mot, depuis les constantes de ce fichier. Un préfixe aurait fini par attraper un motif voisin. */
  const m = (motifNonStocke ?? '').trim();
  if (m === MOTIF_PROGRAMME) return { mention: MENTION_PROGRAMME, avecLienGmail: true };
  if (m === MOTIF_SIGNATURE) return { mention: MENTION_SIGNATURE, avecLienGmail: false };
  return MENTION_DEFAUT;
}
