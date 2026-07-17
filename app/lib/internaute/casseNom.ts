/**
 * Normalisation de la CASSE d'un NOM ou PRÉNOM — fonction PURE, partagée par les deux parseurs d'écriture
 * (ingestion Écran A + rectification de contact). Ne TRIME pas (l'appelant trime déjà).
 *
 * RÈGLE : majuscule sur la PREMIÈRE LETTRE DE CHAQUE SEGMENT (séparateurs : espace, tiret, apostrophe droite `'`
 * ou courbe `’`), le RESTE du segment LAISSÉ INTACT — SAUF si le segment est ENTIÈREMENT en majuscules, auquel cas
 * le reste est minusculisé. Les séparateurs sont conservés tels quels.
 *
 * arnaud→Arnaud · jean-pierre→Jean-Pierre · JOREL→Jorel · d'artagnan→D'Artagnan ·
 * McDonald→McDonald (intact : pas tout-majuscule) · O'Brien→O'Brien · mcdonald→Mcdonald (limite acceptée).
 */
export function normaliserCasseNom(valeur: string): string {
  return valeur
    .split(/([\s\-'’])/) // capture les séparateurs → indices IMPAIRS = séparateurs (conservés)
    .map((part, i) => {
      if (i % 2 === 1 || part === '') return part; // séparateur, ou segment vide (séparateurs consécutifs)
      const toutMajuscule = part === part.toUpperCase() && part !== part.toLowerCase();
      const reste = toutMajuscule ? part.slice(1).toLowerCase() : part.slice(1);
      return part[0].toUpperCase() + reste;
    })
    .join('');
}
