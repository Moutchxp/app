/**
 * Helpers de PRÉSENTATION (purs) de la page de vérification publique. Aucune logique métier, aucun accès base : le
 * cœur est dans `app/lib/db/certificatVerification.ts`. Extraits ici pour être testables sans rendu de composant.
 */

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

/** Verdict brut → libellé humain (seul SANS_VIS_A_VIS est émis ; VIS_A_VIS géré par prudence). */
export function libelleVerdict(verdict: string): string {
  if (verdict === 'SANS_VIS_A_VIS') return 'Sans vis-à-vis';
  if (verdict === 'VIS_A_VIS') return 'Vis-à-vis';
  return verdict;
}
