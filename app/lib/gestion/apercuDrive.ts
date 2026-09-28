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
export type SorteApercu = 'pdf' | 'image' | 'texte' | 'export_pdf' | 'aucun';

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
