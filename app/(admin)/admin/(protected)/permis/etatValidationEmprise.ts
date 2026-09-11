// POINT 1 — SOURCE UNIQUE de l'état de validation affiché (bandeau, en-tête « Bâtiments et projection », onglet cartouche par bâtiment,
//   rangée d'actions). Toutes doivent dériver du MÊME fait : la validation PAR EMPRISE (`e.validee` = validee_le renseigné, migration 213),
//   celle que porte déjà le bouton « valider » de chaque ligne. On NE lit PLUS le signal serveur `validationParCorps`, qui mélangeait deux
//   notions distinctes sous le même mot « validée » :
//     · legacy — validation au niveau PERMIS (`permis_projection`) OU pointeur unique par corps (`emprise_validee_id`, migration 206) ;
//     · courante — validation PAR EMPRISE (`validee_le`, migration 213), la vérité.
//   Un dossier validé sous l'ancien régime mais jamais repris par emprise (ex. réel 11434 : pointeur 206 posé, `validee_le` NULL) apparaissait
//   « validé » dans le bandeau/onglet et « à valider » dans la rangée d'actions. En recomposant l'état PAR CORPS à partir de `e.validee`,
//   les quatre affichages ne peuvent plus se contredire.
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';

/**
 * Validation PAR CORPS dérivée de la SEULE vérité par emprise. Un corps (bâtiment) est « validé » ⟺ il porte AU MOINS UNE emprise ET
 * TOUTES ses emprises sont validées (`e.validee`) — même règle que l'agrégat serveur 213, mais SANS le OR legacy. Les emprises sans corps
 * (`corpsId` null, orphelines) sont ignorées : elles n'appartiennent à aucun bâtiment. PUR, sans effet de bord.
 */
export function validationParCorpsDepuisEmprises(emprises: Pick<EmpriseReconstruite, 'corpsId' | 'validee'>[]): Record<number, boolean> {
  const total = new Map<number, number>();
  const validees = new Map<number, number>();
  for (const e of emprises) {
    if (e.corpsId == null) continue; // orpheline → aucun bâtiment
    total.set(e.corpsId, (total.get(e.corpsId) ?? 0) + 1);
    if (e.validee) validees.set(e.corpsId, (validees.get(e.corpsId) ?? 0) + 1);
  }
  const out: Record<number, boolean> = {};
  for (const [corpsId, n] of total) out[corpsId] = n > 0 && (validees.get(corpsId) ?? 0) === n;
  return out;
}
