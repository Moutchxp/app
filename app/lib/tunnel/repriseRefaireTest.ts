/**
 * Reprise de « Refaire le test » (page de résultat du tunnel) — décision d'Arno du 15/10/2026, choix A.
 *
 * La mécanique du bouton est INCHANGÉE (capteurs, photo, point remis à « non confirmé », retour à la photo). On y AJOUTE :
 *  1. le nouveau test repart de la MÊME ADRESSE ;
 *  2. le POINT reste le même et est considéré comme DÉJÀ VALIDÉ (l'internaute l'a placé et validé juste avant) : l'écran de
 *     localisation l'affiche avec « ✓ Point validé lors du test précédent » et « Continuer avec ce point » (un appui).
 * Reprise ≠ verrouillage : dès que l'internaute touche la carte, la reprise tombe et le parcours normal reprend (contrôle du
 * point, puis « Valider votre point de vue »). Ne vaut QUE pour ce bouton : « Refaire la photo » et un nouveau test lancé
 * depuis l'accueil ne reprennent rien. Aucune donnée nouvelle : ce que la page connaissait déjà, en mémoire du navigateur.
 *
 * Logique PURE (aucun React, aucun réseau) ; le câblage est dans app/page.tsx.
 */
import type { OrigineValidee } from '../useOrigineValidation';

export interface RepriseTest {
  adresse: string;
  valide: OrigineValidee; // point validé du test précédent (lat/lon + bâtiment + altitude terrain), tel quel
}

/** Instantané pris au clic sur « Refaire le test ». `null` si aucun point validé (rien à reprendre → mécanique d'avant). */
export function prendreReprise(adresse: string, valide: OrigineValidee | null): RepriseTest | null {
  return valide === null ? null : { adresse, valide };
}

/**
 * À l'ouverture de la caméra, faut-il redemander la position GPS ? Oui, sauf pendant une reprise : la demande GPS vide
 * l'adresse et replace le point sur la position du téléphone (défaut constaté le 15/10/2026), ce qui défaisait la reprise.
 */
export function demanderGpsALOuverture(reprise: RepriseTest | null): boolean {
  return reprise === null;
}

/** L'écran de localisation affiche-t-il le point repris (cartouche vert + « Continuer avec ce point ») ? */
export function afficherPointRepris(pointRepris: boolean, valide: OrigineValidee | null): boolean {
  return pointRepris && valide !== null;
}
