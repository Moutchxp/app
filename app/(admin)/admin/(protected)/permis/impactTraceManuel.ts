// GARDE-FOU — un tracé manuel enregistré sur un bâtiment EFFACE ses emprises ADOPTÉES de l'IGN (règle d'exclusivité serveur :
//   « adoption et tracé manuel ne coexistent jamais », supprimerEmprisesAdoptees, empriseReconstruiteRepo.ts). C'est DÉFINITIF (DELETE, ni
//   corbeille ni annulation) et ça emporte leurs VALIDATIONS. Ce module PUR décide, AVANT l'enregistrement, ce que le geste va détruire :
//   combien d'emprises, lesquelles, et combien étaient VALIDÉES (du travail humain). L'écran s'en sert pour afficher une confirmation quand
//   c'est destructif — et RIEN quand ça ne l'est pas (aucune adoptée → enregistrement direct, on n'alourdit pas le geste courant).
//   ⚠️ Ne DÉCRIT que ce que fait déjà le serveur : mêmes provenances que supprimerEmprisesAdoptees ('ign_adopte' | 'ign_retouche'). Aucun
//   changement de comportement — un avertissement, pas une nouvelle règle.
import type { EmpriseReconstruite, ProvenanceEmprise } from '../../../../lib/permis/empriseReconstruiteRepo';

/** Une emprise qui SERA effacée par le tracé manuel (avec de quoi la nommer et dire si elle était validée, par qui, quand). */
export interface EmpriseEffacee {
  id: number;
  provenance: ProvenanceEmprise;
  surfaceM2: number | null;
  validee: boolean;
  valideeLe: string | null;
  valideeParNom: string | null;
}

/** Ce qu'un tracé manuel va détruire sur le bâtiment. `destructif` = il y a au moins une emprise adoptée à effacer (⇒ confirmation requise). */
export interface ImpactTraceManuel {
  aEffacer: EmpriseEffacee[];
  nbEffacees: number;
  nbValidees: number;
  destructif: boolean;
}

// MÊMES provenances que supprimerEmprisesAdoptees (empriseReconstruiteRepo.ts) : le tracé manuel remplace les emprises ISSUES DE L'IGN
//   (adoptées, ou adoptées puis retouchées à la main), jamais un autre tracé manuel (INSERT pur, pas de suppression).
const PROVENANCES_ADOPTEES: ReadonlySet<ProvenanceEmprise> = new Set<ProvenanceEmprise>(['ign_adopte', 'ign_retouche']);

/**
 * Impact d'un tracé manuel sur les emprises d'UN bâtiment. PUR, sans effet de bord.
 * @param emprisesDuBatiment les emprises rattachées au bâtiment ciblé par le tracé.
 */
export function impactTraceManuel(
  emprisesDuBatiment: readonly Pick<EmpriseReconstruite, 'id' | 'provenance' | 'surfaceM2' | 'validee' | 'valideeLe' | 'valideeParNom'>[],
): ImpactTraceManuel {
  const aEffacer: EmpriseEffacee[] = emprisesDuBatiment
    .filter((e) => PROVENANCES_ADOPTEES.has(e.provenance))
    .map((e) => ({ id: e.id, provenance: e.provenance, surfaceM2: e.surfaceM2, validee: e.validee, valideeLe: e.valideeLe, valideeParNom: e.valideeParNom }));
  const nbValidees = aEffacer.filter((e) => e.validee).length;
  return { aEffacer, nbEffacees: aEffacer.length, nbValidees, destructif: aEffacer.length > 0 };
}
