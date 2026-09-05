/**
 * LOT 95 (B2) — LECTURE DE VALEURS AU GRAIN PAGE par analyse d'image (bouton « analyse de la page »). SŒUR du repérage LOT 62 (même
 * rasterisation, même client Mistral, même pré-filtre RGPD par page), mais FINALITÉ INVERSE : le LOT 62 ne dit QUE la PRÉSENCE d'une
 * planche ; ICI on LIT UNE VALEUR sur la page affichée et on remplit un champ VIDE du permis.
 *
 * 🔒 PÉRIMÈTRE RESTREINT ET SÛR (décision de cadrage) : UN SEUL champ pour ce lot — l'ALTITUDE DE SOMMET NGF (acrotère, « +61,09 m NGF »),
 * la grandeur la plus directement cotée sur une COUPE ou une FAÇADE et la plus utile au verdict. On NE lit PAS encore nb d'étages /
 * niveaux de sous-sol : ces champs sont PAR BÂTIMENT (A/B/C) et une page seule ne s'attribue pas honnêtement à un bâtiment (piège du
 * LOT 85). L'altitude lue se range donc au NIVEAU DOSSIER (`permis_caracteristique.altitude_sommet_ngf`, « acrotère max, non rattaché à
 * un bâtiment ») — JAMAIS sur un polygone BD TOPO (préséance LiDAR), JAMAIS sur un bâtiment deviné.
 *
 * 🔒 HONNÊTETÉ (non négociable, cf. échec LOT 85) : le modèle rend une VALEUR + une CONFIANCE + l'EXTRAIT lu. Rien de lisible → on le
 * DIT (aucune valeur, aucune écriture, jamais un motif « canned »). Douteux → proposé « à vérifier », jamais écrit comme acquis. Sûr →
 * écrit SEULEMENT dans un champ vide, avec provenance (pièce+page), méthode 'ia' (rang faible, cf. precedenceMethodes). Le `LecteurPlanches`
 * est INJECTABLE : les tests bouchonnent rasterisation + vision (aucun appel réseau ni binaire).
 */
import { pageExclueRgpd, type LecteurPlanches } from './reperePlanches';

/** Le seul champ lu par ce lot (niveau DOSSIER). Bornes = CHECK de `permis_caracteristique` (source unique en base). */
export const CHAMP_LECTURE = 'altitudeSommetNgf' as const;
export const ALT_MIN_NGF = -50;
export const ALT_MAX_NGF = 500;

/** Question OUVERTE mais CADRÉE : une seule grandeur, une réponse JSON stricte, un aveu d'ignorance EXPLICITE (valeur null). */
export const PROMPT_LECTURE_VALEURS = `Cette image est UNE page d'un document d'urbanisme (permis de construire), typiquement une COUPE ou une FAÇADE cotée. Question UNIQUE : peux-tu lire l'ALTITUDE DU SOMMET du bâtiment en NGF (le point le PLUS HAUT coté en mètres NGF : acrotère, faîtage ou arase supérieure — ex. « +61.09 m NGF », « ARASE 61,09 NGF ») ? Prends la valeur COTÉE LA PLUS HAUTE en NGF réellement écrite sur le dessin. N'INVENTE RIEN : si aucune altitude NGF n'est lisible sans ambiguïté, réponds valeur null. Si tu lis une valeur mais sans certitude (cote peu nette, unité douteuse, plusieurs candidats), réponds confiance "douteuse". Réponds STRICTEMENT en JSON, rien d'autre : {"altitude_sommet_ngf": <nombre en mètres ou null>, "confiance": "sure|douteuse", "extrait": "<le texte exact lu sur le plan, ou vide>"}.`;

export type ConfianceLue = 'sure' | 'douteuse';
/** Une valeur LUE et validée (bornée), avec sa confiance et l'extrait brut (jamais une valeur hors bornes ni non numérique). */
export interface ValeurLue { valeur: number; confiance: ConfianceLue; extrait: string }

/** Normalise la réponse du modèle en une valeur SÛRE ou `null` (jamais une valeur inventée / hors bornes). PUR. */
export function parseValeurLue(r: Record<string, unknown>): ValeurLue | null {
  const brut = r?.altitude_sommet_ngf;
  const n = typeof brut === 'number' ? brut : (typeof brut === 'string' && brut.trim() !== '' ? Number(brut.replace(',', '.')) : NaN);
  if (!Number.isFinite(n) || n < ALT_MIN_NGF || n > ALT_MAX_NGF) return null; // hors bornes / illisible → rien (jamais une erreur base)
  const c = String(r?.confiance ?? '').toLowerCase().trim();
  const confiance: ConfianceLue = c === 'sure' ? 'sure' : 'douteuse'; // au moindre doute → 'douteuse' (jamais acquis par défaut)
  const extrait = typeof r?.extrait === 'string' ? r.extrait.slice(0, 300) : '';
  return { valeur: n, confiance, extrait };
}

/** Décision d'écriture PURE (testable sans base). Ordre : rien lu → 'rien' ; champ déjà rempli → 'deja_rempli' (jamais écrasé) ;
 *  douteux → 'a_verifier' (proposé, non écrit) ; sûr + champ vide → 'ecrire'. */
export type ActionLecture = 'ecrire' | 'a_verifier' | 'deja_rempli' | 'rien';
export function deciderEcritureValeurLue(lue: ValeurLue | null, dejaRempli: boolean): ActionLecture {
  if (lue === null) return 'rien';
  if (dejaRempli) return 'deja_rempli';       // invariant 103 + « champ VIDE seulement » : une valeur déjà présente n'est jamais écrasée
  return lue.confiance === 'sure' ? 'ecrire' : 'a_verifier';
}

// ── ORCHESTRATEUR d'UNE page (injectable : aucune I/O ici) ────────────────────────────────────────────────────────────────────────
export interface DepsLecturePage {
  texte(): Promise<string>;   // texte de LA page (index déjà résolu) — '' si page sans texte
  pdf(): Promise<Buffer>;     // le PDF de la pièce (pour rasteriser la page)
  page: number;               // n° de page 1-based
  lecteur: LecteurPlanches;
}
export type ResultatLecturePage =
  | { envoyee: false; motif: string }                          // écartée par le pré-filtre RGPD (jamais envoyée)
  | { envoyee: true; valeur: ValeurLue | null };               // envoyée : une valeur lue (ou null = rien d'exploitable)

/**
 * Pré-filtre RGPD sur LA page (même régime d'ABSTENTION que le LOT 62 : signal de personne ou page sans texte → non envoyée), sinon
 * rasterise et pose la question CADRÉE. Aucune écriture ici (persistance/journal vivent dans la route + le repo). Une seule page = un
 * seul appel vision.
 */
export async function executerLectureValeurPage(deps: DepsLecturePage): Promise<ResultatLecturePage> {
  const g = pageExclueRgpd(await deps.texte());
  if (g.exclue) return { envoyee: false, motif: g.motif! };
  const pdf = await deps.pdf();
  const img = deps.lecteur.rasteriser(pdf, deps.page);
  const r = await deps.lecteur.vision(img, PROMPT_LECTURE_VALEURS);
  return { envoyee: true, valeur: parseValeurLue(r) };
}
