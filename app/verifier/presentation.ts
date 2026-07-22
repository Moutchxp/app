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

/** Message du statut `sans_compte` : certificat one-shot, non authentifiable en ligne. AUCUN champ n'est affiché avec. */
export const MESSAGE_SANS_COMPTE =
  'Ce certificat n’est pas authentifiable en ligne : il n’est pas rattaché à un compte Sans Vis-à-Vis®.';

/** Verdict brut → libellé humain (seul SANS_VIS_A_VIS est émis ; VIS_A_VIS géré par prudence). */
export function libelleVerdict(verdict: string): string {
  if (verdict === 'SANS_VIS_A_VIS') return 'Sans vis-à-vis';
  if (verdict === 'VIS_A_VIS') return 'Vis-à-vis';
  return verdict;
}
