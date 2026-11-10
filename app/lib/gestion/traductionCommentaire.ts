/**
 * ══ 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — LES COMMENTAIRES MONGA ÉCRITS DANS UNE AUTRE LANGUE, AFFICHÉS EN FRANÇAIS ════════════
 *
 * MODULE PUR (lu par la frise, composant client) : aucune base, aucun réseau. Le dépôt (`traductionCommentaireRepo.ts`) appelle le service.
 *
 * RÈGLES D'ARNO :
 *   1) LE TEXTE D'ORIGINE N'EST JAMAIS MODIFIÉ NI REMPLACÉ. La traduction s'affiche sous « Traduit automatiquement de l’… », avec
 *      « Voir l’original ». Un commentaire déjà en français ne change pas.
 *   2) LA TRADUCTION EST SEULEMENT AFFICHÉE : elle ne crée, ne modifie et ne valide aucune étape. La lecture des étapes
 *      (`etapesDuMailMonga`) reste faite sur le texte d'origine — ce module ne l'importe même pas.
 *   3) Échec du service : l'original s'affiche avec « Traduction indisponible ».
 *
 * 🔴 LA DÉTECTION LOCALE DÉCIDE CE QUI PART AU SERVICE. Un commentaire reconnu français, ou trop court pour qu'on sache sa langue, ne quitte
 * jamais l'application : seul un texte où des mots d'une AUTRE langue dominent est envoyé, et seulement son texte.
 */

/** Les mots-outils propres à chaque langue (les mots communs à deux langues, « de », « la », « que », « en », « un », sont exclus). */
const MOTS: Readonly<Record<string, readonly string[]>> = {
  fr: ['le', 'les', 'des', 'du', 'et', 'est', 'une', 'pour', 'avec', 'nous', 'vous', 'pas', 'sur', 'dans', 'qui', 'au', 'aux', 'ce', 'cette',
    'sont', 'été', 'votre', 'notre', 'nos', 'vos', 'bonjour', 'merci', 'avons', 'avez', 'ont', 'à', 'où', 'mais', 'lors', 'très', 'leur'],
  es: ['el', 'los', 'las', 'del', 'y', 'es', 'para', 'con', 'nosotros', 'usted', 'hemos', 'su', 'sus', 'está', 'hola', 'gracias', 'nuestro',
    'nuestra', 'nuestros', 'al', 'por', 'muy', 'cita', 'también', 'pero', 'ha', 'fue', 'sido', 'tu', 'le', 'lo', 'durante', 'según'],
  en: ['the', 'and', 'is', 'are', 'to', 'of', 'for', 'with', 'we', 'you', 'your', 'our', 'has', 'have', 'been', 'not', 'this', 'that',
    'hello', 'thanks', 'thank', 'please', 'will', 'on', 'at', 'it', 'be', 'was', 'were', 'appointment'],
  it: ['gli', 'della', 'di', 'è', 'per', 'siamo', 'abbiamo', 'non', 'che', 'buongiorno', 'grazie', 'nostro', 'nostra', 'sono', 'stato', 'ciao'],
  de: ['der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'wir', 'sie', 'nicht', 'ein', 'eine', 'haben', 'wurde', 'hallo', 'danke', 'auf', 'zu'],
  pt: ['os', 'do', 'da', 'não', 'nós', 'temos', 'obrigado', 'olá', 'nosso', 'nossa', 'foi', 'uma', 'com', 'em', 'são', 'você'],
};
/* ⚠️ « le » est AUSSI espagnol (« le hemos dejado ») : il compte pour les deux, ce qui ne départage rien et ne fausse rien. */

/** Il faut au moins ce nombre de mots-outils d'une langue pour la reconnaître : en deçà, on ne sait pas, et on n'envoie rien. */
export const MOTS_MINIMUM = 2;

/**
 * La langue PROBABLE d'un texte (code ISO 639-1), ou `null` si on ne sait pas (trop court, aucun mot-outil, égalité). Locale, sans
 * réseau : c'est elle qui décide si un commentaire part au service.
 */
export function detecterLangue(texte: string | null): string | null {
  if (texte === null) return null;
  const mots = texte.toLowerCase().normalize('NFC').split(/[^\p{L}]+/u).filter((m) => m !== '');
  const scores = Object.entries(MOTS).map(([langue, liste]) => {
    const ens = new Set(liste);
    return { langue, n: mots.filter((m) => ens.has(m)).length };
  }).sort((a, b) => b.n - a.n);
  const [premier, second] = scores;
  if (premier.n < MOTS_MINIMUM || premier.n === second.n) return null;
  return premier.langue;
}

/** Un commentaire à traduire : une langue reconnue, et ce n'est pas le français. */
export function estATraduire(texte: string | null): boolean {
  const l = detecterLangue(texte);
  return l !== null && l !== 'fr';
}

/** Le nom français des langues, avec son article élidé ou non (« de l’espagnol », « du portugais »). */
const LANGUES: Readonly<Record<string, { nom: string; elide: boolean }>> = {
  es: { nom: 'espagnol', elide: true }, en: { nom: 'anglais', elide: true }, it: { nom: 'italien', elide: true },
  de: { nom: 'allemand', elide: true }, pt: { nom: 'portugais', elide: false }, nl: { nom: 'néerlandais', elide: false },
  ca: { nom: 'catalan', elide: false }, ar: { nom: 'arabe', elide: true }, ro: { nom: 'roumain', elide: false },
  pl: { nom: 'polonais', elide: false }, ru: { nom: 'russe', elide: false }, uk: { nom: 'ukrainien', elide: true },
  tr: { nom: 'turc', elide: false }, zh: { nom: 'chinois', elide: false },
};

export const MOT_VOIR_ORIGINAL = 'Voir l’original';
export const MOT_MASQUER_ORIGINAL = 'Masquer l’original';
export const MOT_TRADUCTION_INDISPONIBLE = 'Traduction indisponible';

/** « Traduit automatiquement de l’espagnol » — et, pour une langue que l'on ne sait pas nommer, « d’une autre langue ». */
export function titreTraduction(langue: string | null): string {
  const l = langue === null ? undefined : LANGUES[langue.toLowerCase()];
  if (l === undefined) return 'Traduit automatiquement d’une autre langue';
  return `Traduit automatiquement ${l.elide ? 'de l’' : 'du '}${l.nom}`;
}

/** Ce que la frise sait de la traduction d'une étape (`null` : aucune — commentaire français, ancien, ou base sans la 463). */
export interface TraductionEtape {
  statut: 'traduite' | 'francais' | 'echec';
  langue: string | null;
  texte: string | null;
}

/** Ce que l'écran affiche : l'original seul, la traduction (l'original à déplier), ou l'original avec « Traduction indisponible ». */
export type AffichageTexte =
  | { mode: 'original'; original: string }
  | { mode: 'traduit'; titre: string; traduit: string; original: string }
  | { mode: 'indisponible'; original: string };

export function affichageTexte(texte: string, traduction: TraductionEtape | null | undefined): AffichageTexte {
  if (traduction?.statut === 'traduite' && (traduction.texte ?? '').trim() !== '') {
    return { mode: 'traduit', titre: titreTraduction(traduction.langue), traduit: traduction.texte as string, original: texte };
  }
  if (traduction?.statut === 'echec') return { mode: 'indisponible', original: texte };
  return { mode: 'original', original: texte };
}

/** La consigne donnée au service. Seul le texte du commentaire l'accompagne : ni nom, ni adresse, ni référence. */
export const CONSIGNE_TRADUCTION = 'Tu traduis en français un court message professionnel (suivi d’une intervention de dépannage). '
  + 'Réponds UNIQUEMENT par un objet JSON : {"langue": "<code ISO 639-1 de la langue du message>", "traduction": "<le message en français>"}. '
  + 'Traduis fidèlement, sans rien ajouter, sans rien résumer ; garde les dates, heures, montants et numéros tels quels. '
  + 'Si le message est déjà en français, rends {"langue": "fr", "traduction": null}.';

/** La réponse du service, validée : une langue à deux lettres, et une traduction non vide (sauf « déjà en français »). Sinon `null`. */
export function validerReponseTraduction(json: unknown): { langue: string; traduction: string | null } | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const langue = typeof o.langue === 'string' ? o.langue.trim().toLowerCase() : '';
  if (!/^[a-z]{2}$/.test(langue)) return null;
  if (langue === 'fr') return { langue, traduction: null };
  const traduction = typeof o.traduction === 'string' ? o.traduction.trim() : '';
  return traduction === '' ? null : { langue, traduction };
}
