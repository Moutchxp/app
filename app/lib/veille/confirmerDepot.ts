/**
 * LOT 35 — CONFIRMATION d'un dépôt téléservice (proposition « cette demande a-t-elle été déposée ? »). Orchestrateur PUR par
 * injection (aucune I/O directe) → testable sans base.
 *
 * 🔴 LE GESTE QUI MANQUAIT : la confirmation SAIT quel message (l'accusé) l'a déclenchée → elle extrait SA référence mairie (SLC…)
 * et l'ATTRIBUE à la demande, en plus de la marquer déposée + rattacher le message. Indépendant de l'ordre des clics : la référence
 * vient du MESSAGE, jamais du statut de la demande au moment de la relève (c'était le trou : `attribuerReferenceAccuse` exige
 * statut='envoyee', ce qui n'était pas le cas quand l'accusé est arrivé AVANT le dépôt).
 *
 * `marquerDeposee` écrit `demande_reference_externe` (source 'accuse_reception') QUAND la référence est non vide, en ON CONFLICT
 * DO NOTHING → jamais d'écrasement d'une référence déjà présente. Une référence absente (accusé sans SLC exploitable) → `null`
 * remonté à l'appelant pour le dire à l'écran (jamais un champ vide silencieux).
 */
export interface DepsConfirmerDepot {
  lireReference(reponseId: number): Promise<string | null>;                                  // référence portée par l'accusé (objet + corps)
  marquerDeposee(demandeId: number, reference: string | null, envoyeLe: string): Promise<void>; // statut 'envoyee' + acheminement + réf. mairie (si non vide)
  rattacher(reponseId: number, demandeId: number): Promise<void>;                             // rattache l'accusé à la demande (désormais envoyée)
}

export async function confirmerDepot(deps: DepsConfirmerDepot, arg: { reponseId: number; demandeId: number; envoyeLe: string }): Promise<{ referenceCaptee: string | null }> {
  const reference = await deps.lireReference(arg.reponseId); // extrait du MESSAGE déclencheur → ordre des clics indifférent
  await deps.marquerDeposee(arg.demandeId, reference, arg.envoyeLe); // écrit la réf. mairie si non vide (ON CONFLICT → pas d'écrasement)
  await deps.rattacher(arg.reponseId, arg.demandeId);
  return { referenceCaptee: reference };
}
