// TUILE « TRANSACTION » — le CA HT de la LOCATION, mois par mois, LU dans le Suivi de la Location (aucune copie, aucune écriture) :
// les lignes du suivi (`lireActivites`, celles de « Suivi du mois ») et leur CA (`caLigne`, la ligne « TOTAL CA HT »). Le Suivi de
// la Location ne change pas ; sans sa migration (406), la location est « non lue » (null) et le CA global le dit.
import { anneesActives, lireActivites } from '../location/suivi/tableauBordRepo';
import { suiviDisponible } from '../location/suivi/suiviRepo';
import { caLigne, moisDeLigne, type ActiviteCalcul } from '../location/suivi/tableauBord';

/** Le CA HT par mois (« AAAA-MM » → somme), comme la ligne « TOTAL CA HT » du Suivi du mois. PUR. */
export function caLocationParMois(lignes: readonly ActiviteCalcul[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const a of lignes) r[moisDeLigne(a)] = (r[moisDeLigne(a)] ?? 0) + caLigne(a);
  return r;
}

export async function lireCaLocation(): Promise<Record<string, number> | null> {
  if (!(await suiviDisponible())) return null;
  return caLocationParMois(await lireActivites(await anneesActives()));
}
