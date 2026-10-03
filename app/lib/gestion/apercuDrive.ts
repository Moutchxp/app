import { estFichierSystemeMac } from './driveDeplacement';

/**
 * MODULE « GESTION » — LOT DRIVE-VISUALISER-ET-DOSSIERS : DE QUOI PEUT-ON MONTRER UN APERÇU ? Module PUR : aucun
 * import, aucune base, aucun réseau, aucun DOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 UNE LISTE BLANCHE, JAMAIS UNE LISTE NOIRE — et c'est la décision de sécurité de tout ce lot.
 *
 * L'aperçu sert le fichier depuis NOTRE origine, dans un cadre de NOTRE page. Si l'on servait un type quelconque,
 * un fichier `.html` rangé dans le Drive s'exécuterait avec nos droits de session : cookies, appels à nos routes,
 * tout. On n'énumère donc PAS ce qu'on refuse (on en oublierait) : on énumère ce qu'on accepte, et le type servi est
 * celui de la liste — jamais celui que le fichier prétend avoir.
 *
 * 🔴 CE QUI EST DANS LA LISTE, ET RIEN D'AUTRE :
 *   · `application/pdf` — le cadre du navigateur sait le faire défiler et le zoomer tout seul ;
 *   · les IMAGES matricielles (png, jpeg, gif, webp, bmp, tiff, heic) ;
 *   · le TEXTE BRUT (txt, csv) — servi en `text/plain`, jamais interprété.
 *
 * 🔴 CE QUI EST DEHORS, ET POURQUOI :
 *   · SVG. C'est une image pour l'œil, et un document à scripts pour le navigateur : un `<script>` y est légal. Le
 *     seul format « image » capable d'exécuter du code, donc le seul à exclure de la famille image ;
 *   · HTML, XML, tout ce qui s'interprète ;
 *   · les archives, les binaires, les traitements de texte non Google (.docx, .xlsx) : le navigateur n'en fait rien,
 *     et on le DIT plutôt que d'ouvrir un cadre vide qui se lirait comme une panne.
 *
 * 🔴 LES DOCUMENTS GOOGLE (Docs, Sheets, Slides, Drawings) N'ONT PAS D'OCTETS. `alt=media` les refuse. On les
 * EXPORTE en PDF pour l'aperçu — une lecture, comme une autre : rien n'est écrit, rien n'est converti dans le Drive,
 * aucune copie n'y reste.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que l'aperçu sait faire d'un fichier. `aucun` n'est pas une panne : c'est une réponse. */
export type SorteApercu = 'pdf' | 'image' | 'texte' | 'video' | 'export_pdf' | 'aucun';

/** Le préfixe des types Google natifs. Écrit une fois : c'est lui qui distingue « pas d'octets » de « pas d'aperçu ». */
export const PREFIXE_GOOGLE = 'application/vnd.google-apps';

/**
 * Les types Google qui S'EXPORTENT en PDF. Un dossier, un raccourci, un formulaire ou une carte Sites ne s'exportent
 * pas : Google refuse, et l'on ne demande pas ce qu'on sait refusé.
 */
const GOOGLE_EXPORTABLES = new Set([
  `${PREFIXE_GOOGLE}.document`,
  `${PREFIXE_GOOGLE}.spreadsheet`,
  `${PREFIXE_GOOGLE}.presentation`,
  `${PREFIXE_GOOGLE}.drawing`,
  `${PREFIXE_GOOGLE}.script`,
]);

/** Les images matricielles acceptées. SVG en est ABSENT, exprès — voir l'en-tête. */
const IMAGES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif',
]);

/** Les types texte acceptés. Tous SERVIS en `text/plain` : on montre le contenu, on ne l’interprète jamais. */
const TEXTES = new Set(['text/plain', 'text/csv', 'text/tab-separated-values', 'text/markdown']);

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LES VIDÉOS QUE LA VISIONNEUSE OUVRE ══════════════════════════════
 *
 * Arno : « Œil “Visualiser” et visionneuse : lecteur vidéo intégré (lecture, pause, barre de temps, son, plein
 * écran) […]. Formats : mp4, mov, webm, m4v, 3gp. »
 *
 * 🔴 LA LISTE EST LA MÊME QUE CELLE DE `pieces.ts`, et elle le reste : un fichier qu'un écran annonce comme une
 * vidéo et que la visionneuse refuserait d'ouvrir serait un bouton qui ne fait rien. On ne l'importe pas pour
 * autant — ce module doit rester lisible seul, et le test les compare à la source.
 *
 * ⚠️ OUVRIR N'EST PAS DÉCODER : `video/quicktime` est ici parce qu'un `.mov` EST une vidéo. Si le navigateur ne
 * sait pas le lire (le cas du HEVC d'iPhone dans Chrome), c'est le lecteur qui le DIT, avec un bouton pour
 * télécharger. Un format écarté d'ici, lui, n'aurait reçu aucune explication.
 */
const VIDEOS = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2',
]);

/** La normalisation d'un type MIME : sans paramètre (`; charset=…`), sans casse, sans espace. PUR. */
export function typeNu(brut: string): string {
  return (brut ?? '').split(';')[0].trim().toLowerCase();
}

/** ══ 🔴 CE QU'ON PEUT MONTRER DE CE FICHIER. PUR. ════════════════════════════════════════════════════════════════ */
export function sorteApercu(typeMime: string): SorteApercu {
  const t = typeNu(typeMime);
  if (t === 'application/pdf') return 'pdf';
  if (IMAGES.has(t)) return 'image';
  if (TEXTES.has(t)) return 'texte';
  if (VIDEOS.has(t)) return 'video';
  if (GOOGLE_EXPORTABLES.has(t)) return 'export_pdf';
  return 'aucun';
}

/**
 * LE TYPE RÉELLEMENT SERVI — jamais celui du fichier. PUR.
 *
 * 🔴 C'EST LA LIGNE QUI PORTE LA SÉCURITÉ. Un fichier peut se déclarer `text/html` dans le Drive ; il sera servi
 * `text/plain` ou pas du tout. Le navigateur n'obéit qu'à l'en-tête que NOUS écrivons.
 */
export function typeServi(typeMime: string): string | null {
  switch (sorteApercu(typeMime)) {
    case 'pdf': case 'export_pdf': return 'application/pdf';
    case 'image': return typeNu(typeMime) === 'image/jpg' ? 'image/jpeg' : typeNu(typeMime);
    case 'texte': return 'text/plain; charset=utf-8';
    /* 🔴 LA VIDÉO EST SERVIE SOUS SON PROPRE TYPE : c'est lui qui dit au navigateur quel décodeur ouvrir, et un
       type faussé ferait échouer la lecture d'un fichier parfaitement lisible. */
    case 'video': return typeNu(typeMime);
    case 'aucun': return null;
  }
}

/** Vrai quand il faut passer par l'EXPORT Google plutôt que par `alt=media`. PUR. */
export function passeParExport(typeMime: string): boolean {
  return sorteApercu(typeMime) === 'export_pdf';
}

/**
 * LE MESSAGE quand il n'y a pas d'aperçu. PUR.
 *
 * 🔴 IL DIT LA PHRASE EXACTE DEMANDÉE PAR ARNO — « Aperçu indisponible pour ce type de fichier » — et il ajoute la
 * SORTIE : on peut tout de même joindre le fichier, ou en insérer le lien. Un message qui constate sans proposer
 * laisse devant un cul-de-sac.
 */
export function messageSansApercu(typeMime: string): string {
  const t = typeNu(typeMime);
  if (t.startsWith(PREFIXE_GOOGLE)) {
    return 'Aperçu indisponible pour ce type de fichier : ce document Google ne s’exporte pas en PDF. '
      + 'Vous pouvez en insérer le lien — il s’ouvrira dans Google Drive.';
  }
  if (t === 'image/svg+xml') {
    return 'Aperçu indisponible pour ce type de fichier : une image SVG peut contenir du code, elle n’est donc '
      + 'jamais affichée ici. Vous pouvez la joindre, ou en insérer le lien.';
  }
  return 'Aperçu indisponible pour ce type de fichier. Vous pouvez tout de même le joindre au message, '
    + 'ou en insérer le lien.';
}

/**
 * La taille au-delà de laquelle on n'ouvre pas d'aperçu.
 *
 * ⚠️ PLUS BASSE QUE LA LIMITE DE PIÈCE JOINTE (20 Mo), et exprès : un aperçu se regarde, il ne se garde pas. Tirer
 * 20 Mo pour jeter un œil ferait attendre l'écran sans rien apporter — et l'on peut toujours joindre le fichier,
 * qui est le geste utile.
 */
export const APERCU_TAILLE_MAX = 12 * 1024 * 1024;

/** Le motif du refus pour cause de taille, avec le chiffre. PUR. */
export function motifTropGros(tailleOctets: number): string {
  const mo = Math.round((tailleOctets / (1024 * 1024)) * 10) / 10;
  return `Ce fichier fait ${String(mo).replace('.', ',')} Mo : au-delà de `
    + `${APERCU_TAILLE_MAX / (1024 * 1024)} Mo, l’aperçu n’est pas ouvert. Vous pouvez le joindre au message.`;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT APERCU-RAPIDE — « PRÉCÉDENT / SUIVANT » : LE PÉRIMÈTRE, ET RIEN QUE LE PÉRIMÈTRE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA RÈGLE D'ARNO : on parcourt LE DOSSIER DU DOCUMENT AFFICHÉ, jamais d'un dossier à un autre.
     · ouvert depuis un dossier → les fichiers visualisables de CE dossier, dans l'ordre de la liste, sans ses
       sous-dossiers ;
     · ouvert depuis des résultats de recherche → seulement ceux de la liste qui ont LE MÊME dossier parent.

   🔴 POURQUOI CETTE SECONDE CLAUSE EST INDISPENSABLE. Une recherche rend quarante fichiers venus de quarante
   endroits. « Suivant » y ferait passer, sans prévenir, du bail d'un logement à la pièce d'identité d'un autre
   client — et la seconde peut être sous « Documents clients scannés ». Borner au dossier n'est pas un confort de
   navigation : c'est ce qui empêche l'aperçu de sortir de l'endroit où l'on avait le droit de regarder.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un voisin possible, réduit à ce qui permet de décider s'il fait partie du parcours. */
export interface VoisinPossible {
  id: string;
  nom: string;
  typeMime: string;
  dossier: boolean;
  /** Le dossier qui le contient. `null` = inconnu (une liste qui ne le porte pas) : il ne fera pas partie du tour. */
  parentId: string | null;
}

/**
 * ══ 🔴 LES VOISINS QU'ON PEUT PARCOURIR, DANS L'ORDRE DE LA LISTE AFFICHÉE. PUR. ═════════════════════════════════
 *
 * 🔴 TROIS FILTRES, ET CHACUN A SA RAISON :
 *   ① les DOSSIERS sont écartés — on parcourt des documents, pas l'arborescence ;
 *   ② les types SANS APERÇU sont SAUTÉS (demande d'Arno), SVG compris : « Suivant » doit montrer quelque chose,
 *      sinon on cliquerait trois fois pour traverser trois archives zip ;
 *   ③ le PARENT doit être celui du document ouvert. Quand la liste vient d'un dossier, tous le partagent et le
 *      filtre ne retire rien ; quand elle vient d'une recherche, il est la barrière.
 *
 * ⚠️ LE DOCUMENT OUVERT EST TOUJOURS DANS LE TOUR, même si la liste ne le porte pas (on l'a ouvert depuis
 * « Récents », d'où l'on ne connaît aucun parent) : sans lui, le compteur dirait « 0 / 0 » en le montrant à
 * l'écran. Il est alors seul, et les deux boutons sont éteints — ce qui est la vérité.
 *
 * ⚠️ L'ORDRE EST CELUI DE LA LISTE, jamais un tri : c'est l'ordre qu'on a sous les yeux, et le seul auquel on
 * s'attende en cliquant « Suivant ».
 */
/**
 * ⚠️ IMPORT LOCAL ET MINUSCULE : `estFichierSystemeMac` est une pure question de NOM (« commence-t-il par ._ ? »).
 * La dupliquer ici aurait donné deux définitions de ce qu'est un fichier système — et le jour où l'une gagne un cas
 * que l'autre n'a pas, l'aperçu saute un fichier que la liste montre encore.
 */
export function voisinsVisualisables(
  liste: readonly VoisinPossible[], ouvert: { id: string; typeMime: string; parentId: string | null },
): VoisinPossible[] {
  const retenus = liste.filter((f) => !f.dossier
    && sorteApercu(f.typeMime) !== 'aucun'
    /**
     * 🔴 LOT DRIVE-DEPLACER — LES FICHIERS « ._ » SONT SAUTÉS (demande d'Arno). Ce sont les jumeaux techniques
     * que macOS dépose à côté de chaque fichier : quelques kilooctets d'attributs, aucun document. Les traverser
     * ferait afficher un cadre vide entre deux vrais documents, et compter « 4 / 9 » pour un tour où cinq entrées
     * ne montrent rien.
     */
    && !estFichierSystemeMac(f.nom)
    && f.parentId !== null && f.parentId === ouvert.parentId);
  if (retenus.some((f) => f.id === ouvert.id)) return retenus;
  /**
   * Le document ouvert n'est pas dans la liste retenue : soit la liste ne le porte pas, soit son parent est
   * inconnu. On rend un tour qui ne contient que lui — jamais une liste où il n'apparaîtrait pas, qui ferait
   * afficher « 3 / 7 » pour un document absent des sept.
   */
  return [{ id: ouvert.id, nom: '', typeMime: ouvert.typeMime, dossier: false, parentId: ouvert.parentId }];
}

/** La position du document ouvert dans le tour, à partir de 1. `0` s'il n'y est pas — ce qui ne devrait pas arriver. PUR. */
export function positionDans(voisins: readonly { id: string }[], id: string): number {
  return voisins.findIndex((v) => v.id === id) + 1;
}

/**
 * LE COMPTEUR, ÉCRIT. PUR.
 *
 * ⚠️ IL NE COMPTE QUE LES FICHIERS VISUALISABLES (demande d'Arno) : afficher « 3 / 12 » alors que neuf des douze
 * sont des archives que « Suivant » saute ferait croire à des documents perdus en route.
 */
export function motCompteur(position: number, total: number): string {
  return total <= 0 ? '—' : `${Math.max(position, 1)} / ${total}`;
}

/**
 * OÙ MÈNE UN PAS ? Rend l'identifiant du voisin, ou `null` quand il n'y en a pas. PUR.
 *
 * 🔴 ON NE BOUCLE PAS (demande d'Arno) : au premier, « Précédent » est éteint ; au dernier, « Suivant » l'est.
 * Une liste qui reboucle fait perdre le compte de ce qu'on a déjà vu, et l'on retraverse le même dossier sans s'en
 * apercevoir.
 */
export function voisinVers(
  voisins: readonly { id: string }[], id: string, pas: -1 | 1,
): string | null {
  const i = voisins.findIndex((v) => v.id === id);
  if (i === -1) return null;
  const j = i + pas;
  return j >= 0 && j < voisins.length ? voisins[j].id : null;
}

/**
 * ══ 🔴 LOT APERCU-PAGE1 — LIRE UN EN-TÊTE `Range`, POUR SERVIR UNE TRANCHE DEPUIS LA MÉMOIRE. PUR. ═════════════
 *
 * ⚠️ ON NE TRAITE QU'UNE SEULE PLAGE, et c'est délibéré : c'est la seule forme qu'un navigateur ou PDF.js émettent
 * pour un document, et répondre à des plages multiples imposerait un corps `multipart/byteranges` que personne ne
 * demande ici. Toute autre forme rend `null`, et l'appelant sert alors le fichier entier — jamais une erreur.
 *
 * Les trois formes reconnues, telles que la RFC les définit :
 *   · `bytes=0-65535`  un début et une fin (la fin est INCLUSE) ;
 *   · `bytes=65536-`   depuis un point, jusqu'au bout ;
 *   · `bytes=-2048`    les N DERNIERS octets — c'est ainsi que PDF.js va chercher la table d'index, qui est à la
 *     fin d'un PDF. L'oublier ferait retomber sur le fichier entier à chaque ouverture.
 */
export function lireIntervalle(
  entete: string | null, taille: number,
): { debut: number; fin: number } | null {
  if (entete === null || taille <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (m === null) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  // `bytes=-N` : les N derniers octets. N plus grand que le fichier vaut le fichier entier, comme le veut la RFC.
  if (a === '') {
    const n = Number(b);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { debut: Math.max(0, taille - n), fin: taille - 1 };
  }
  const debut = Number(a);
  if (!Number.isFinite(debut) || debut >= taille) return null;
  const fin = b === '' ? taille - 1 : Math.min(Number(b), taille - 1);
  if (!Number.isFinite(fin) || fin < debut) return null;
  return { debut, fin };
}
