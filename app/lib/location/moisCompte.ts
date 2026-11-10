/**
 * ══ 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, POINT A (Arno, 10/11/2026) — LE MOIS COMPTÉ D'UNE NOUVELLE LOCATION ═══════════════════════════════════
 *
 * Arno : « Le mois compté d'une nouvelle location = le mois de la DATE D'ENTRÉE du locataire (pas la date de saisie). Champ modifiable ;
 * alerte visible si l'entrée tombe dans un autre mois que la saisie. »
 *
 * Le cas qui l'a décidé : PIEULHET, entrée le 10/10/2026, suivi saisi le 06/11/2026 avec la date du jour — la location a été comptée en
 * novembre. À la création d'un locataire, la « Date de signature du bail » du suivi (c'est elle qui fait le mois compté) prend donc la date
 * d'entrée, tant que personne ne l'a changée à la main. MODULE PUR (lu par l'écran client).
 */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** « 2026-10-10 » → « octobre 2026 ». */
export function moisEnLettres(iso: string): string {
  return `${MOIS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)} ${iso.slice(0, 4)}`;
}
const fr = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * La date de signature PROPOSÉE : la date d'entrée (si elle est saisie) tant que le champ n'a pas été changé à la main ; sinon, ce qui est
 * saisi. Le locataire en place (mandat de gestion seul) garde sa propre règle (la date du mandat) : non concerné.
 */
export function dateSignatureProposee(o: { entree: string; saisie: string; changeeALaMain: boolean }): string {
  return !o.changeeALaMain && ISO.test(o.entree) ? o.entree : o.saisie;
}

/**
 * L'ALERTE (ou `null`) :
 *  · la date de signature saisie tombe dans un autre mois que l'entrée → elle le dit (la location sera comptée dans CE mois-là) ;
 *  · sinon, l'entrée tombe dans un autre mois que le jour de la saisie → elle dit que la location sera comptée dans le mois de l'entrée.
 */
export function alerteMoisCompte(o: { entree: string; signature: string; aujourdhui: string }): string | null {
  if (!ISO.test(o.entree) || !ISO.test(o.signature)) return null;
  const mEntree = o.entree.slice(0, 7);
  const mSignature = o.signature.slice(0, 7);
  if (mSignature !== mEntree) {
    return `Attention : la date de signature (${fr(o.signature)}) fera compter cette location en ${moisEnLettres(o.signature)}, `
      + `alors que l’entrée du locataire (${fr(o.entree)}) est en ${moisEnLettres(o.entree)}.`;
  }
  if (ISO.test(o.aujourdhui) && o.aujourdhui.slice(0, 7) !== mEntree) {
    return `L’entrée du locataire (${fr(o.entree)}) est en ${moisEnLettres(o.entree)} : la location sera comptée en ${moisEnLettres(o.entree)}, `
      + `et non dans le mois de la saisie (${moisEnLettres(o.aujourdhui)}).`;
  }
  return null;
}
