/**
 * Helpers de PRÉSENTATION (purs) de la page de vérification publique. Aucune logique métier, aucun accès base : le
 * cœur est dans `app/lib/db/certificatVerification.ts`. Extraits ici pour être testables sans rendu de composant.
 */
import type { DescriptifVisuel } from '../lib/db/certificatVerification'; // TYPE only (effacé à la compilation) — aucune dép runtime

/** Première valeur d'un query param Next (string | string[] | undefined) → string, sinon undefined. */
export function premierParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/** Date ISO (`emis_le`) → date lisible en français, ANCRÉE Europe/Paris. Entrée illisible → renvoyée telle quelle. */
export function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(d);
}

/** Étage (peut être null, ou 0 = rez-de-chaussée) → libellé français. */
export function formatEtage(etage: number | null): string {
  if (etage === null) return 'Non renseigné';
  if (etage === 0) return 'Rez-de-chaussée';
  return `${etage}ᵉ étage`;
}

/**
 * Intitulé du TYPE de document scanné (param `doc` de l'URL du QR). Paramètre de PRÉSENTATION PUR et NON FIABLE (il vient
 * de l'URL, modifiable) : il n'influence QUE ce libellé, JAMAIS les champs attestés ni le gating. Liste FERMÉE ; toute
 * valeur absente ou inconnue retombe sur un intitulé générique — un `doc` trafiqué ne change donc rien à l'attestation.
 */
export function libelleTypeDocument(doc?: string): string {
  switch (doc) {
    case 'nominatif':
      return 'le certificat nominatif';
    case 'anonyme':
      return 'la version anonymisée';
    case 'visuel':
      return 'le visuel';
    default:
      return 'ce certificat'; // absent ou valeur inconnue → générique
  }
}

/** Message du statut `sans_compte` : certificat one-shot, non authentifiable en ligne. AUCUN champ n'est affiché avec. */
export const MESSAGE_SANS_COMPTE =
  'Ce certificat n’est pas authentifiable en ligne : il n’est pas rattaché à un compte Sans Vis-à-Vis®.';

// ── Textes de l'aperçu du document (bouton + surcouche). Toutes les chaînes user-facing sont ICI (aucune en dur dans le JSX). ──
/** Libellé du bouton d'ouverture de l'aperçu (statuts verifie / visuel_verifie uniquement). */
export const LIB_VOIR_DOCUMENT = 'Voir le document certifié authentique';
/** Légende sous l'aperçu du certificat (rendu ANONYMISÉ). */
export const LEGENDE_ANONYMISE = 'Identité du demandeur masquée pour la consultation en ligne.';
/** Message d'échec sobre (404/503/exception) — jamais de détail technique. */
export const MSG_DOC_INDISPONIBLE = 'Document momentanément indisponible.';
/** Indicateur de chargement de l'aperçu. */
export const MSG_CHARGEMENT_APERCU = 'Chargement du document…';
/** aria-label de la surcouche (role=dialog). */
export const ARIA_APERCU = 'Aperçu du document certifié';
/** aria-label de la croix de fermeture. */
export const ARIA_FERMER_APERCU = 'Fermer l’aperçu';

/** Texte alternatif du sceau de marque du bandeau. */
export const ALT_LOGO_SCEAU = 'Sceau L’immobilier Sans Vis-à-Vis®';

/** Définition officielle du label, affichée sur la page de vérification (texte figé, validé). */
export const DEFINITION_SVV =
  'Certifié Sans Vis-à-Vis : aucun obstacle sur au moins 40 mètres face au séjour, mesuré géométriquement au LiDAR. ' +
  'La végétation n’est jamais comptée comme un obstacle.';

/** Sous-ligne du bandeau selon le TYPE de document scanné (param `doc`, présentation seule). Liste fermée, défaut nominatif. */
export function libelleSousLigne(doc?: string): string {
  if (doc === 'anonyme') return 'Certificat anonymisé';
  if (doc === 'visuel') return 'Analyse de vue certifiée';
  return 'Certificat nominatif'; // 'nominatif', absent ou valeur inconnue
}

/** Score de vue /100 → libellé d'affichage (arrondi d'AFFICHAGE seulement). `null` → « — ». */
export function formatScoreVisuel(score: number | null): string {
  return score === null ? '—' : `${Math.round(score)} / 100`;
}

/** Descriptif visuel → lignes « label / valeur » prêtes à afficher. Ordre : ville · type · surface · pièces · étage ·
 *  (dernier étage) · année · extérieur. Champs `null` OMIS proprement (ville absente → pas de ligne). JAMAIS d'adresse,
 *  jamais de « chambres » (aucune source). */
export function formatDescriptifVisuel(d: DescriptifVisuel): Array<{ label: string; valeur: string }> {
  const rows: Array<{ label: string; valeur: string }> = [];
  if (d.ville) rows.push({ label: 'Ville', valeur: d.ville });
  if (d.typeBien) rows.push({ label: 'Type', valeur: d.typeBien });
  if (d.surfaceM2 !== null) rows.push({ label: 'Surface', valeur: `${String(d.surfaceM2).replace('.', ',')} m²` });
  if (d.pieces !== null) rows.push({ label: 'Pièces', valeur: String(d.pieces) });
  if (d.etage !== null) rows.push({ label: 'Étage', valeur: formatEtage(d.etage) });
  if (d.dernierEtage !== null) rows.push({ label: 'Dernier étage', valeur: d.dernierEtage ? 'Oui' : 'Non' });
  if (d.anneeOuEpoque) rows.push({ label: 'Année', valeur: d.anneeOuEpoque });
  if (d.exterieur) rows.push({ label: 'Extérieur', valeur: d.exterieur });
  return rows;
}

/** Tuiles du bien pour la page (voie jeton ET voie référence) — descriptif SANS la ville (affichée à part comme adresse/ville).
 *  Règles MARKETING : on n'affiche QUE ce qui valorise → « dernier étage » fusionné à l'étage seulement si vrai, extérieur
 *  « Aucun » omis, champs `null` omis (jamais de « — »). Ordre : type · surface · pièces · étage(+dernier) · année · extérieur. */
export function tuilesBien(d: DescriptifVisuel): Array<{ label: string; valeur: string }> {
  const t: Array<{ label: string; valeur: string }> = [];
  if (d.typeBien) t.push({ label: 'Type', valeur: d.typeBien });
  if (d.surfaceM2 !== null) t.push({ label: 'Surface', valeur: `${String(d.surfaceM2).replace('.', ',')} m²` });
  if (d.pieces !== null) t.push({ label: 'Pièces', valeur: String(d.pieces) });
  if (d.etage !== null) t.push({ label: 'Étage', valeur: d.dernierEtage === true ? `${formatEtage(d.etage)} · dernier` : formatEtage(d.etage) });
  if (d.anneeOuEpoque) t.push({ label: 'Année', valeur: d.anneeOuEpoque });
  if (d.exterieur && d.exterieur !== 'Aucun') t.push({ label: 'Extérieur', valeur: d.exterieur });
  return t;
}

/** Verdict brut → libellé humain (seul SANS_VIS_A_VIS est émis ; VIS_A_VIS géré par prudence). */
export function libelleVerdict(verdict: string): string {
  if (verdict === 'SANS_VIS_A_VIS') return 'Sans vis-à-vis';
  if (verdict === 'VIS_A_VIS') return 'Vis-à-vis';
  return verdict;
}
