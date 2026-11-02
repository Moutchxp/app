// 🔴 MON ESPACE, LOT 7 (Arno, 02/11/2026) — LES GESTES D'UNE AFFAIRE DEPUIS « MON ESPACE » (décision 5) : « Acte signé », « Annuler le compromis »,
// « Revenir en compromis ». Les fonctions de la tuile Suivi CA, telles quelles (`acteSigne`, `annulerCompromis`, `retourCompromis` : journal, inter-
// cabinet, garde de version du lot 6) ; « Mon espace » vérifie seulement QUI agit : un négociateur présent sur un côté, ou un administrateur.
// Pas de `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves).
import { acteSigne, annulerCompromis, lireVentes, retourCompromis, type AuteurTx, type Issue } from '../transaction/repo';
import type { AnnulationSaisie } from '../transaction/saisie';
import { estAdministrateur } from './creationRepo';
import { estAMoi } from './mesAffaires';
import { moiDansLesVentes } from './mesAffairesRepo';
import { estSurLaVente } from './modification';

export const MOTIF_GESTE_PAS_SUR_UN_COTE = 'Seuls les négociateurs de cette affaire (et les administrateurs) peuvent faire ce geste. Rien n’a été enregistré.';

export type GesteMonEspace = { geste: 'acte-signe'; dateActe: string } | { geste: 'compromis-annuler'; annulation: AnnulationSaisie } | { geste: 'retour-compromis' };

/** Le geste, si le titulaire en a le droit ; le statut HTTP d'un refus (403 : pas sur l'affaire ; 409 : un collègue a enregistré entre-temps). */
export async function gesteDepuisMonEspace(compteId: number, id: number, g: GesteMonEspace, version: number | null, auteur: AuteurTx):
  Promise<{ ok: true } | { ok: false; statut: 403 | 404 | 409 | 422; motif: string }> {
  const v = (await lireVentes(null)).find((x) => x.id === id);
  if (v === undefined) return { ok: false, statut: 404, motif: 'Affaire introuvable (ou retirée).' };
  const autorise = (await estAdministrateur(compteId)) || estSurLaVente(v, compteId) || estAMoi(v, await moiDansLesVentes(compteId, [v]));
  if (!autorise) return { ok: false, statut: 403, motif: MOTIF_GESTE_PAS_SUR_UN_COTE };
  const r: Issue = g.geste === 'acte-signe' ? await acteSigne(id, g.dateActe, auteur, version)
    : g.geste === 'compromis-annuler' ? await annulerCompromis(id, g.annulation, auteur, version)
    : await retourCompromis(id, auteur, version);
  return r.ok ? { ok: true } : { ok: false, statut: r.conflit ? 409 : 422, motif: r.motif };
}
