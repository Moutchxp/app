/**
 * PART-D — PÉREMPTION des liens de téléchargement (PUR, aucune I/O). Un lien de mairie expire ; passé le terme, il faut TOUT
 * redemander. Mais la durée réelle N'EST PAS connue de façon fiable (le lien ne la porte pas toujours ; les mairies varient).
 *
 * 🔴 HONNÊTETÉ D'AFFICHAGE : on n'annonce JAMAIS « expire dans N jours » comme un FAIT à partir de l'hypothèse de validité. On
 * affiche le fait MESURÉ « reçu il y a N jours ». Le seuil (validité présumée) ne sert QU'À décider quand alerter — c'est une
 * hypothèse de travail, pas une donnée. `libelleLienRecu` porte cette distinction en français simple.
 */
const MS_JOUR = 86_400_000;

/** Âge d'un lien en jours ENTIERS (plancher), à partir de sa date de réception (date d'envoi du mail). Négatif impossible → borné à 0. */
export function ageLienJours(recuLe: Date, maintenant: Date): number {
  return Math.max(0, Math.floor((maintenant.getTime() - recuLe.getTime()) / MS_JOUR));
}

/**
 * Le lien a-t-il atteint le SEUIL D'ALERTE ? Seuil = (validité présumée − délai d'alerte) jours d'âge. Avec les défauts (7 ; 3)
 * → alerte dès « reçu il y a 4 jours ». Le seuil est plancherné à 0 (réglages incohérents : alerte ≥ validité → alerte dès J0).
 */
export function seuilAlerteAtteint(recuLe: Date, maintenant: Date, validitePresumeeJours: number, alerteAvantJours: number): boolean {
  const seuilJours = Math.max(0, validitePresumeeJours - alerteAvantJours);
  return ageLienJours(recuLe, maintenant) >= seuilJours;
}

/** « aujourd'hui » | « il y a 1 jour » | « il y a N jours ». PUR. */
export function ilYaEnJours(recuLe: Date, maintenant: Date): string {
  const n = ageLienJours(recuLe, maintenant);
  return n <= 0 ? 'aujourd’hui' : n === 1 ? 'il y a 1 jour' : `il y a ${n} jours`;
}

/**
 * Libellé HONNÊTE pour un lien en attente : le FAIT mesuré (« reçu il y a N jours ») d'abord ; l'échéance présumée n'est mentionnée
 * que comme HYPOTHÈSE explicite, jamais comme une certitude. Ne remplace pas une expiration EXPLICITE écrite par la mairie (celle-ci
 * est un fait et se dit ailleurs). PUR. Ex. : « reçu il y a 4 jours — à télécharger vite (validité présumée : 7 jours, hypothèse) ».
 */
export function libelleLienRecu(recuLe: Date, maintenant: Date, validitePresumeeJours: number): string {
  return `reçu ${ilYaEnJours(recuLe, maintenant)} — à télécharger sans tarder (validité présumée : ${validitePresumeeJours} jours, hypothèse)`;
}
