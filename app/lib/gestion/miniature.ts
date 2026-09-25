/**
 * MODULE « GESTION » — LOT 5-PJ-A : FABRIQUER LA MINIATURE D'UNE PIÈCE JOINTE. Module SERVEUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CES OCTETS VIENNENT DE L'EXTÉRIEUR. Une pièce jointe est un fichier écrit par un inconnu et reçu par mail :
 * c'est, avec le formulaire public, la surface d'attaque la plus exposée de toute l'application. Tout ce qui suit
 * part de là.
 *
 *   ① ON NE REND JAMAIS DU HTML NI DU SVG. Un SVG est un document qui peut porter du script et aller chercher des
 *      ressources distantes ; un HTML l'est encore plus. Ils ne reçoivent pas de miniature — une icône suffit. C'est
 *      `sortePiece` (pieces.ts) qui les écarte, et le test le tient explicitement.
 *   ② LE PDF EST RENDU SANS SCRIPT ET SANS RESSOURCE EXTERNE. `pdfjs-dist` est lancé avec l'exécution JavaScript
 *      COUPÉE, sans police distante, sans XFA : on veut une image de la première page, pas un interpréteur.
 *   ③ TOUT EST BORNÉ : taille du fichier en entrée, nombre de pixels décodés, et DÉLAI. Une « bombe de
 *      décompression » (une image de 60 000 × 60 000 pixels qui pèse 4 Ko) est précisément faite pour épuiser la
 *      mémoire d'un serveur qui décode sans regarder.
 *   ④ UN ÉCHEC N'EST PAS UNE PANNE. Il rend un motif, l'appelant l'enregistre UNE fois, et la pièce garde son icône.
 *      Réessayer à chaque affichage transformerait un fichier mal formé en charge permanente.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `sharp` et `pdfjs-dist` sont DÉJÀ des dépendances du dépôt (certificats, liseuse de permis) : ce lot n'en ajoute
 * aucune, et n'exige AUCUN outil système (ni poppler, ni ImageMagick) — le futur hébergement n'est pas contraint.
 * Les deux sont importés DYNAMIQUEMENT : ce module reste chargeable sans eux.
 */
import { sortePiece } from './pieces';

/** Le côté long de la miniature, en pixels. Assez pour reconnaître une facture, assez peu pour rester légère. */
export const MINIATURE_COTE = 320;

/** Au-delà, on ne tente même pas d'ouvrir le fichier : on rend l'icône. */
export const ENTREE_MAX_OCTETS = 40 * 1024 * 1024;

/** Nombre maximum de pixels décodés. Une image plus grande est une bombe de décompression, pas une photo. */
export const PIXELS_MAX = 80_000_000;

/** Délai maximal de fabrication. Au-delà, on abandonne : une miniature n'est jamais assez importante pour bloquer. */
export const DELAI_MAX_MS = 15_000;

/** Le type de la miniature produite. JPEG : une vignette n'a pas besoin de transparence, et pèse trois fois moins. */
export const TYPE_MINIATURE = 'image/jpeg';

export type IssueMiniature =
  | { ok: true; octets: Buffer; largeur: number; hauteur: number }
  | { ok: false; motif: string };

/** Coupe une promesse au bout de `ms`. Le travail abandonné continue peut-être, mais la requête, elle, est rendue. */
async function borner<T>(travail: Promise<T>, ms: number, quoi: string): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      travail,
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error(`${quoi} : délai de ${ms} ms dépassé`)), ms);
      }),
    ]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/**
 * LA MINIATURE D'UNE IMAGE. `sharp` décode en dehors de la boucle d'événements, et `limitInputPixels` est la garde
 * qui compte : sans elle, un PNG de quatre kilo-octets peut demander douze gigaoctets de mémoire.
 *
 * `failOn: 'none'` — une image légèrement mal formée (il y en a beaucoup dans du vrai courrier) est rendue au mieux
 * plutôt que rejetée. Ce n'est pas un relâchement de sécurité : la garde de sécurité, c'est la borne de pixels.
 */
async function miniatureImage(octets: Buffer): Promise<IssueMiniature> {
  const { default: sharp } = await import('sharp');
  const image = sharp(octets, { limitInputPixels: PIXELS_MAX, failOn: 'none' });
  const meta = await image.metadata();
  if ((meta.width ?? 0) <= 0 || (meta.height ?? 0) <= 0) return { ok: false, motif: 'image illisible (dimensions inconnues)' };
  const rendu = await image
    .rotate() // respecte l'orientation EXIF : une photo de téléphone arrive presque toujours couchée
    .resize({ width: MINIATURE_COTE, height: MINIATURE_COTE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, octets: rendu.data, largeur: rendu.info.width, hauteur: rendu.info.height };
}

/**
 * LA MINIATURE D'UN PDF : sa PREMIÈRE PAGE, rasterisée puis réduite.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI PDFIUM (WASM) ET NON `pdfjs-dist`, QUI EST DÉJÀ LÀ. Mesuré le 25/09/2026 : `pdfjs-dist` 4.10.38 ne sait
 * pas rasteriser côté serveur sans toile DOM, et le seul chemin npm sans binaire système (`@napi-rs/canvas`) fait
 * SEGFAULTER le processus — `page.render(...)` rend un code de sortie 139, sans exception à intercepter, y compris en
 * fournissant `DOMMatrix`, `Path2D` et `ImageData` comme le préconise le contournement usuel. Un plantage dur n'est
 * pas rattrapable : dans une route Next, il n'aurait pas noirci une vignette, il aurait tué le serveur.
 * `pdfjs-dist` reste utilisé partout ailleurs dans le dépôt pour ce qu'il fait très bien : extraire du TEXTE.
 *
 * `@hyzyla/pdfium` est du WebAssembly : pas de binaire natif, pas de Cairo, pas de poppler, pas d'ImageMagick — donc
 * AUCUNE contrainte nouvelle sur le futur hébergement, ce qui était la condition posée par Arno.
 *
 * 🔴 PDFIUM NE FAIT QU'UNE CHOSE : dessiner des pixels. Il n'exécute pas le JavaScript d'un document, ne charge
 * aucune police distante et n'interprète aucun formulaire XFA — parce qu'on ne lui demande rien de tout cela. Un PDF
 * est ici une IMAGE À PRENDRE, jamais un programme à exécuter.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
async function miniaturePdf(octets: Buffer): Promise<IssueMiniature> {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium');
  const lib = await PDFiumLibrary.init();
  let doc: Awaited<ReturnType<typeof lib.loadDocument>> | null = null;
  try {
    doc = await lib.loadDocument(octets);
    if (doc.getPageCount() < 1) return { ok: false, motif: 'PDF sans page' };
    const page = doc.getPage(0);

    // L'échelle est calculée pour que le CÔTÉ LONG tombe sur la taille voulue. Rasteriser une A4 en pleine
    //   résolution pour la réduire ensuite coûterait dix fois plus de mémoire pour exactement le même résultat — et
    //   une affiche A0 en ferait trente fois plus. La taille se lit AVANT de dessiner : c'est aussi ce qui permet de
    //   refuser une page démesurée sans avoir déjà alloué ses pixels.
    const taille = page.getOriginalSize();
    const cote = Math.max(taille.originalWidth, taille.originalHeight);
    const echelle = cote > 0 ? Math.min(MINIATURE_COTE / cote, 4) : 1;
    const rendu = await page.render({ scale: echelle > 0 ? echelle : 1, render: 'bitmap' });
    if (rendu.width <= 0 || rendu.height <= 0) return { ok: false, motif: 'page PDF de dimension nulle' };
    if (rendu.width * rendu.height > PIXELS_MAX) return { ok: false, motif: 'page PDF trop grande à rasteriser' };

    const { default: sharp } = await import('sharp');
    const image = await sharp(Buffer.from(rendu.data), { raw: { width: rendu.width, height: rendu.height, channels: 4 } })
      .resize({ width: MINIATURE_COTE, height: MINIATURE_COTE, fit: 'inside', withoutEnlargement: true })
      // Une page PDF a un fond transparent : à plat sur blanc, sinon la vignette ressort noire en JPEG.
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, octets: image.data, largeur: image.info.width, hauteur: image.info.height };
  } finally {
    // Le WASM tient de la mémoire hors du ramasse-miettes de Node : ne pas la rendre serait une fuite à chaque vignette.
    try { doc?.destroy(); } catch { /* la libération ne doit jamais masquer le vrai résultat */ }
    try { lib.destroy(); } catch { /* idem */ }
  }
}

/**
 * LA MINIATURE D'UNE PIÈCE, ou le motif pour lequel il n'y en aura pas.
 *
 * L'appelant enregistre le motif UNE fois (cf. `miniatureRepo`) : une pièce qui a échoué ne sera pas retentée à
 * chaque affichage. C'est la différence entre un défaut connu et une charge permanente.
 */
export async function genererMiniature(
  octets: Buffer, typeMime: string | null, nomFichier: string,
): Promise<IssueMiniature> {
  if (octets.byteLength === 0) return { ok: false, motif: 'pièce vide' };
  if (octets.byteLength > ENTREE_MAX_OCTETS) {
    return { ok: false, motif: `pièce trop volumineuse pour une miniature (${Math.round(octets.byteLength / (1024 * 1024))} Mo)` };
  }
  const sorte = sortePiece(typeMime, nomFichier);
  // 🔴 C'est ICI que HTML et SVG sont écartés : `sortePiece` ne les classe ni en image ni en PDF, donc on n'ouvre
  //   jamais leurs octets. Un fichier qu'on n'interprète pas ne peut rien exécuter.
  if (sorte === 'autre') return { ok: false, motif: 'type sans miniature' };
  try {
    return await borner(sorte === 'pdf' ? miniaturePdf(octets) : miniatureImage(octets), DELAI_MAX_MS, 'fabrication de la miniature');
  } catch (e) {
    return { ok: false, motif: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
