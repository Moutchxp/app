/**
 * ══ 🔴🔴 Arno (15/11/2026, 5e retour du test iPhone) — LE COMPTE RENDU DE PRÉ-VISITE EST UNE PAGE À PART ENTIÈRE ══════════════════════════
 * Règle d'Arno : deux pages ne sont JAMAIS visibles en même temps à l'écran. Le formulaire n'est plus une fenêtre posée sur la page Location
 * (clavier iOS ouvert, la frise « Préavis reçu » réapparaissait entre le formulaire et le clavier) : il a sa propre adresse, et rien n'est
 * monté dessous. L'ancien lien des mails (`/admin/location?previsite=…&geste=compte-rendu`) est redirigé par le serveur vers cette page.
 * ⚠️ MODULE PUR, AUCUN IMPORT (lu par le serveur ET par le navigateur).
 */

/** La page du formulaire : `/admin/location/previsite/<occupation>/compte-rendu`. PUR. */
export function cheminCompteRendu(occupationId: number): string {
  return `/admin/location/previsite/${occupationId}/compte-rendu`;
}

/** La page d'origine quand elle n'est pas connue (lien d'un mail) : la Location, la ligne du préavis dépliée. PUR. */
export function cheminRetourPrevisite(occupationId: number): string {
  return `/admin/location?previsite=${occupationId}`;
}

const valeur = (x: string | string[] | undefined): string | undefined => (Array.isArray(x) ? x[0] : x);

/**
 * L'ANCIEN LIEN (`?previsite=<occupation>&geste=compte-rendu`) → la page du formulaire ; tout autre lien : `null` (la Location s'affiche
 * comme avant). La marque du retour automatique de la connexion (`reprise=1`) est gardée. PUR.
 */
export function redirectionAncienLien(p: Record<string, string | string[] | undefined>): string | null {
  if (valeur(p.geste) !== 'compte-rendu') return null;
  const brut = valeur(p.previsite);
  if (brut === undefined || !/^[1-9]\d{0,15}$/.test(brut) || !Number.isSafeInteger(Number(brut))) return null;
  return `${cheminCompteRendu(Number(brut))}${valeur(p.reprise) === '1' ? '?reprise=1' : ''}`;
}
