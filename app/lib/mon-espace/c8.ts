import type { SalaireMensuel } from '../transaction/repo';

/**
 * 🔴 « Les coûts », décision C8 — relire un fichier de sauvegarde des salaires mensuels : sa forme, et la BASE d'où il vient (une sauvegarde d'une
 * autre base ne s'applique jamais ici). PUR (lève avec le motif).
 */
export function lireSauvegardeC8(texte: string, base: string): SalaireMensuel[] {
  const j = JSON.parse(texte) as { base?: unknown; salaires?: unknown };
  if (j.base !== base) throw new Error(`Cette sauvegarde vient de la base « ${String(j.base)} », pas de « ${base} » : rien n'a été fait.`);
  if (!Array.isArray(j.salaires)) throw new Error('Sauvegarde illisible : rien n’a été fait.');
  return j.salaires.map((x: Record<string, unknown>) => {
    if ((x.table !== 'gestion_mois' && x.table !== 'location_salaires_mois') || !Number.isInteger(x.id) || !Number.isInteger(x.annee) || !Number.isInteger(x.mois) || typeof x.montantHt !== 'number') {
      throw new Error('Sauvegarde illisible : rien n’a été fait.');
    }
    return { table: x.table, id: x.id as number, annee: x.annee as number, mois: x.mois as number, montantHt: x.montantHt };
  });
}
