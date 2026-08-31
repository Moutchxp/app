/**
 * LOT 29 — TYPES CLIENT-SAFE du sélecteur de destinataire (aucun import serveur : utilisable dans le bundle client ET côté serveur,
 * comme `rangDernieres.ts`). La COMPOSITION de la liste (avec exclusions/dédoublonnage) vit dans `destinatairesCommune.ts` (serveur,
 * où `estAdresseServable` réside) ; ici, seulement le TYPE d'une option et son libellé d'affichage — pour que l'écran indique d'où
 * vient chaque adresse sans laisser croire qu'elles ont toutes répondu.
 */

/** D'où provient une adresse connue de la commune (pour l'indice affiché à côté de l'option). Priorité décroissante d'attribution. */
export type ProvenanceAdresse = 'repondant' | 'ecrit' | 'ajout' | 'confirme' | 'prada';

/** Une option du sélecteur : l'adresse + sa provenance (pour l'indice « a répondu » / « ajoutée à la main » / …). */
export interface OptionDestinataire { adresse: string; provenance: ProvenanceAdresse }

/** Libellé court affiché à côté d'une adresse — l'écran ne doit pas laisser croire que toutes ont répondu. */
export const LABEL_PROVENANCE: Record<ProvenanceAdresse, string> = {
  repondant: 'a répondu',
  ecrit: 'adresse de la demande',
  ajout: 'ajoutée à la main',
  confirme: 'contact mairie',
  prada: 'PRADA',
};

/**
 * FUSION des options serveur (jeu règle B) avec les adresses AJOUTÉES À LA MAIN pendant la session (avant le prochain rechargement).
 * Dédoublonnage INSENSIBLE À LA CASSE, ordre préservé (serveur d'abord, la 1re occurrence gagne) → une adresse déjà connue du serveur
 * n'est jamais dupliquée par une saisie manuelle. PUR (aucun rendu) : testé séparément.
 */
export function fusionnerOptions(serveur: readonly OptionDestinataire[], session: readonly OptionDestinataire[]): OptionDestinataire[] {
  const vu = new Set<string>();
  const out: OptionDestinataire[] = [];
  for (const o of [...serveur, ...session]) {
    const k = o.adresse.trim().toLowerCase();
    if (k === '' || vu.has(k)) continue;
    vu.add(k); out.push(o);
  }
  return out;
}
