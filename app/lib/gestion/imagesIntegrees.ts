/**
 * ══ 🔴🔴 LOT IMAGES-INTEGREES — UNE IMAGE S'AFFICHE TOUJOURS COMME UNE IMAGE, JAMAIS COMME DU CODE ═════════════
 *
 * CONSTAT D'ARNO (01/10/2026), fil 36640 / message 57381 : le corps affichait le texte brut
 * « <img src="data:image/jpeg;base64,/9j/4AAQ… » sur des centaines de milliers de caractères.
 *
 * ═══ CE QUI SE PASSAIT, MESURÉ AU CARACTÈRE PRÈS ════════════════════════════════════════════════════════════════
 *
 * Ce message A une partie HTML : 2 327 574 caractères, dont une seule balise `<img>` qui commence à l'offset
 * 1 841 et dont la charge `base64` fait à elle seule plus de 2,3 Mo. La lecture coupe à 400 000 (`MAX_HTML`) — la
 * coupe tombe donc DANS la balise. `assainirHtml` cherchait le « > » de fermeture, ne le trouvait pas, et rendait
 * tout le reste en TEXTE échappé : 398 159 caractères de base64 à l'écran.
 *
 * MESURÉ SUR LA BASE : 1 569 messages ont un HTML plus long que la lecture, et 1 531 affichaient ainsi du code.
 *
 * ═══ LES DEUX CORRECTIFS, ET POURQUOI IL EN FAUT DEUX ═══════════════════════════════════════════════════════════
 *
 *   ① UNE BALISE COUPÉE N'EST PAS DU TEXTE (dans `htmlMail`). Quelle que soit la cause de la coupure, ce qui suit
 *      un « < » sans « > » est un fragment de balise : on le JETTE. Sans cela, le défaut reviendrait par une autre
 *      porte dès qu'un mail dépasserait la borne.
 *   ② LA CHARGE NE MANGE PLUS LE BUDGET DE LECTURE (ici). Les octets d'une image intégrée sont retirés du document
 *      AVANT la coupure et remplacés par une MARQUE : le document lu redevient du vrai balisage, la balise `<img>`
 *      reste à sa place et à son rang, et les octets sont servis à la demande par le relais — qui, lui, les relit
 *      dans la colonne entière. Une image de 2 Mo ne traverse plus la page : elle est demandée quand on la regarde.
 *
 * 🔴 CE MODULE EST PUR. Il décide ce qu'est une image intégrée, ce qui est sûr, et ce qu'on écrit quand on ne peut
 * pas l'afficher. Il ne lit aucune base et ne connaît aucune route.
 */

/**
 * ══ 🔴🔴 LES SEULS TYPES ACCEPTÉS, ET POURQUOI SVG N'EN EST PAS ════════════════════════════════════════════════
 *
 * Demande d'Arno : « seuls jpeg, png, gif et webp sont acceptés. PAS de svg en data:, ni de script ou de
 * gestionnaire d'événement. »
 *
 * 🔴 UN SVG N'EST PAS UNE IMAGE, C'EST UN DOCUMENT. Il peut porter `<script>`, `onload`, et un `<foreignObject>`
 * qui contient du HTML entier. Posé en `data:` dans un `<img>`, il est inerte chez la plupart des navigateurs —
 * mais « chez la plupart » n'est pas une règle de sécurité, et le même `data:` ouvert dans un onglet s'exécute.
 * Les quatre formats retenus sont des formats d'IMAGE : ils ne portent aucun code.
 */
export const TYPES_IMAGE_SURS: readonly string[] = ['jpeg', 'jpg', 'png', 'gif', 'webp'];

/**
 * 🔴 LA BORNE D'UNE IMAGE INTÉGRÉE, en octets décodés. Au-delà, on ne refuse pas de la montrer : on la remplace par
 * une vignette qui la NOMME et propose de l'ouvrir. 8 Mo laisse passer une photo de téléphone (celles du message
 * 57381 font 1 à 2 Mo) et arrête un document déguisé.
 */
export const TAILLE_IMAGE_MAX = 8 * 1024 * 1024;

/**
 * ══ LA MARQUE QUI REMPLACE LA CHARGE À LA LECTURE ═══════════════════════════════════════════════════════════════
 *
 * Elle est posée par une expression SQL (voir `sqlSansChargeImage`) À LA PLACE des octets, et jamais ailleurs. Le
 * rendu la reconnaît et envoie l'image vers le relais ; le relais, lui, relit les vrais octets.
 *
 * ⚠️ ELLE DOIT ÊTRE VALIDE EN BASE64 pour qu'un navigateur qui la verrait par accident n'affiche pas une erreur :
 * des lettres, rien d'autre. Et assez singulière pour qu'aucun mail ne la porte par hasard.
 */
export const MARQUE_CHARGE = 'SVAVimageIntegree';

/**
 * L'EXPRESSION SQL qui retire les octets des images intégrées d'une colonne, en gardant la balise et son type.
 *
 * 🔴 ELLE S'APPLIQUE AVANT TOUTE COUPURE, et c'est tout l'intérêt : sans elle, `left(corps_html, 400000)` tombe au
 * milieu d'une charge et coupe une balise en deux. Avec elle, les 400 000 caractères du budget sont dépensés en
 * balisage réel — le message d'Arno passe de 2 327 574 caractères à quelques milliers.
 *
 * ⚠️ `[A-Za-z0-9+/=\s]+` ET NON `.+` : une charge base64 ne contient que ces caractères. Un `.+` gourmand
 * emporterait le reste du document jusqu'au dernier guillemet.
 */
export function sqlSansChargeImage(colonne: string): string {
  return `regexp_replace(coalesce(${colonne}, ''), `
    + `'(data:image/[a-zA-Z0-9.+-]+;base64,)[A-Za-z0-9+/=[:space:]]+', `
    + `'\\1${MARQUE_CHARGE}', 'gi')`;
}

/**
 * L'EXPRESSION SQL qui rend un corps TEXTE lisible : la charge d'une image intégrée y devient « (image) ».
 *
 * 🔴 ELLE S'APPLIQUE AVANT LA COUPURE DE L'EXTRAIT, et c'est nécessaire : l'extrait de la liste ne fait que 600
 * caractères, et une balise `<img src="data:…` en occupe 30 à elle seule. Sans ce nettoyage, l'aperçu gris d'un
 * mail affichait du base64 — mesuré : 2 messages. Arno : « L'aperçu dans la liste des mails n'affiche jamais de
 * base64 ni de balise. »
 */
export function sqlExtraitLisible(colonne: string): string {
  // ① la charge d'abord — sinon la coupure des balises laisserait le base64 tout seul ;
  const sansCharge = `regexp_replace(coalesce(${colonne}, ''), `
    + `'data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=[:space:]]*', '', 'gi')`;
  // ② l'image devient un mot, pour qu'on sache qu'il y en avait une ;
  const avecMot = `regexp_replace(${sansCharge}, '<img[^>]*>', '(image)', 'gi')`;
  /**
   * ③ et PLUS AUCUNE BALISE. Arno : « L'aperçu […] n'affiche jamais de base64 NI DE BALISE. » Deux des messages
   * concernés portent du HTML entier dans leur `corps_texte` : l'aperçu y montrait « <p> » et « <br> ».
   * ⚠️ C'est un APERÇU, pas le corps : on remplace par une espace, et les espaces en trop sont repliées.
   */
  const sansBalise = `regexp_replace(${avecMot}, '<[^>]*>', ' ', 'g')`;
  return `btrim(regexp_replace(replace(${sansBalise}, '&nbsp;', ' '), '[[:space:]]+', ' ', 'g'))`;
}

/** Ce qu'une adresse `data:image/…` contient. `null` quand ce n'en est pas une. */
export interface DataImage {
  /** Le type déclaré, en minuscules et sans le préfixe : « jpeg », « png », « svg+xml »… */
  type: string;
  /** La charge base64, telle quelle. Vide quand la marque a pris sa place. */
  charge: string;
  /** La charge a-t-elle été retirée à la lecture (voir `MARQUE_CHARGE`) ? */
  allegee: boolean;
}

/** LIT une adresse `data:` d'image. PUR. Tolérante : une adresse abîmée rend `null`, jamais une exception. */
export function lireDataImage(src: string | null | undefined): DataImage | null {
  const s = (src ?? '').trim();
  const m = /^data:image\/([a-zA-Z0-9.+-]+)\s*;\s*base64\s*,\s*([\s\S]*)$/i.exec(s);
  if (m === null) return null;
  const charge = m[2].replace(/\s+/g, '');
  return { type: m[1].toLowerCase(), charge, allegee: charge === MARQUE_CHARGE };
}

/** Le type est-il l'un des quatre formats d'image acceptés ? PUR. */
export function typeImageSur(type: string): boolean {
  return TYPES_IMAGE_SURS.includes(type.toLowerCase());
}

/** La taille, en octets, d'une charge base64 — sans la décoder. PUR. */
export function octetsDeLaCharge(charge: string): number {
  const n = charge.length;
  if (n === 0) return 0;
  const bourrage = charge.endsWith('==') ? 2 : charge.endsWith('=') ? 1 : 0;
  return Math.max(Math.floor((n * 3) / 4) - bourrage, 0);
}

/** Le type MIME à servir pour un type déclaré. PUR. `jpg` n'est pas un type MIME : c'est `image/jpeg`. */
export function mimeDuType(type: string): string {
  return `image/${type.toLowerCase() === 'jpg' ? 'jpeg' : type.toLowerCase()}`;
}

/** Pourquoi une image intégrée ne peut pas s'afficher — ou `null` quand elle le peut. PUR. */
export type RefusImage = 'format' | 'taille' | 'illisible';

export function refusDeLImage(d: DataImage): RefusImage | null {
  if (!typeImageSur(d.type)) return 'format';
  // Une image allégée a laissé ses octets en base : sa taille se vérifie au relais, pas ici.
  if (d.allegee) return null;
  if (d.charge === '') return 'illisible';
  if (octetsDeLaCharge(d.charge) > TAILLE_IMAGE_MAX) return 'taille';
  return null;
}

/** Les mots d'un refus, tels qu'ils s'écrivent dans la vignette. PUR. */
export function motDuRefus(r: RefusImage): string {
  if (r === 'format') return 'format non accepté';
  if (r === 'taille') return 'trop lourde';
  return 'illisible';
}

/** Une taille en octets, écrite pour un humain. PUR. */
export function tailleLisible(octets: number): string {
  if (octets <= 0) return 'taille inconnue';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * ══ 🔴 LA VIGNETTE D'UNE IMAGE QU'ON NE PEUT PAS AFFICHER ══════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Une image non affichable (format refusé, trop lourde, illisible) → une vignette “Image non
 * affichable (nom, taille)” avec un lien pour l'ouvrir ou la télécharger, jamais le code. »
 *
 * 🔴 JAMAIS LE CODE, ET JAMAIS RIEN NON PLUS. Un trou muet ferait croire que le mail ne contenait rien ; le code
 * est ce qu'Arno a vu. La vignette dit ce qu'il y avait, ce qui la rend inaffichable, et laisse la main.
 *
 * ⚠️ LE TEXTE EST DÉJÀ ÉCHAPPÉ PAR L'APPELANT (`echapperTexte` de `htmlMail`) : ce module ne fabrique pas de
 * HTML sans le savoir. Le nom vient d'un mail, donc de l'extérieur.
 */
export function vignetteImage(o: {
  /** Ce qu'on sait nommer : le nom du fichier s'il existe, sinon le type. Déjà échappé. */
  nom: string;
  /** La taille lisible, déjà calculée. */
  taille: string;
  /** Pourquoi elle ne s'affiche pas. */
  refus: RefusImage;
  /** L'adresse pour l'ouvrir ou la télécharger. `null` = il n'y en a pas (charge illisible) : pas de lien. */
  href: string | null;
}): string {
  const mot = motDuRefus(o.refus);
  const lien = o.href === null
    ? ''
    : ` <a class="iim-lien" href="${o.href}" target="_blank" rel="noreferrer">Ouvrir l’image</a>`;
  return `<span class="iim-vignette" data-refus="${o.refus}">`
    + `<span class="iim-mot">Image non affichable</span> `
    + `<span class="iim-detail">(${o.nom}, ${o.taille} — ${mot})</span>${lien}`
    + '</span>';
}

/**
 * ══ 🔴🔴 UNE BALISE D'IMAGE ÉCRITE DANS DU TEXTE BRUT ══════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Texte seul contenant une balise <img src="data:image/…"> → l'image est dessinée à sa place. »
 *
 * MESURÉ SUR LA BASE : 20 messages portent « <img » dans leur `corps_texte`, dont 2 une image `data:`. Ce sont des
 * mails dont l'expéditeur a collé du HTML dans un corps déclaré « texte » — personne ne les affichait autrement
 * qu'en code.
 *
 * 🔴 ON NE DEVIENT PAS UN LECTEUR DE HTML POUR AUTANT. On ne reconnaît QUE la balise `<img …>`, et tout le reste
 * du texte est échappé par l'appelant, caractère par caractère. Un texte qui contient `<b>` reste un texte qui
 * contient `<b>` — affiché, pas interprété.
 */
export interface MorceauTexte {
  sorte: 'texte' | 'image';
  /** Pour `texte` : le texte brut. Pour `image` : la balise `<img …>` entière, telle qu'écrite. */
  valeur: string;
}

export function decouperTexteAImages(texte: string | null | undefined): MorceauTexte[] {
  const t = texte ?? '';
  if (t === '') return [];
  const out: MorceauTexte[] = [];
  const re = /<img\b[^>]*>/gi;
  let i = 0;
  for (const m of t.matchAll(re)) {
    const debut = m.index;
    if (debut > i) out.push({ sorte: 'texte', valeur: t.slice(i, debut) });
    out.push({ sorte: 'image', valeur: m[0] });
    i = debut + m[0].length;
  }
  if (i < t.length) out.push({ sorte: 'texte', valeur: t.slice(i) });
  return out;
}

/** Ce texte brut porte-t-il une image qu'il faudrait dessiner ? PUR. */
export function texteAUneImage(texte: string | null | undefined): boolean {
  return decouperTexteAImages(texte).some((m) => m.sorte === 'image');
}

/**
 * ══ 🔴 CE QUE LA RECHERCHE ET LE MOTEUR DOIVENT LIRE : DU TEXTE, JAMAIS DES OCTETS ═════════════════════════════
 *
 * Demande d'Arno : « La recherche, le moteur de propositions (règles d et e) et le texte nettoyé ignorent les
 * blocs base64 : pas de fausse correspondance, pas de lenteur. »
 *
 * 🔴 CE N'EST PAS QU'UNE QUESTION DE VITESSE. Une charge base64 est une suite de lettres et de chiffres : elle
 * contient, par construction, à peu près toutes les suites de caractères possibles. Cherchez « MARTY » dans
 * 400 000 caractères de base64, vous le trouverez — et le mail d'un locataire se retrouverait rattaché au bien
 * d'un autre pour une coïncidence d'octets.
 */
export function sansChargeBase64(texte: string | null | undefined): string {
  // ⚠️ PAS DE BLANC DANS LA CLASSE : on travaille sur du TEXTE, et une charge s'y arrête au premier espace. L'y
  //   inclure mangeait le mot suivant — mesuré à l'essai (« voir data:image/… fin » perdait « fin »).
  return (texte ?? '').replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]*/gi, 'data:image');
}
