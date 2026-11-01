// TUILE « TRANSACTION » — le CA HT de la LOCATION, mois par mois, LU dans le Suivi de la Location (aucune copie, aucune écriture) :
// les lignes du suivi (`lireActivites`, celles de « Suivi du mois ») et leur CA (`caLigne`, la ligne « TOTAL CA HT »). Le Suivi de
// la Location ne change pas ; sans sa migration (406), la location est « non lue » (null) et le CA global le dit.
import { anneesActives, lireActivites } from '../location/suivi/tableauBordRepo';
import { lireApporteurs, lireRegles, suiviDisponible } from '../location/suivi/suiviRepo';
import { ligneLocationCa, type LigneLocationCa } from './locationCa';
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

/**
 * 🔴 LOT LO1 — « Suivi Chiffre d'affaires › Location » : toutes les lignes du Suivi (non annulées), chacune avec ses montants au centime (CA,
 * propriétaire, locataire, prime, apporteur, net), calculés ici par les fonctions de la Location ; seules ces lignes partent (ni règles ni
 * barèmes). LECTURE SEULE. Sans la migration 406 : `disponible` faux, aucune ligne.
 */
export async function lireLocationCa(): Promise<{ disponible: boolean; lignes: LigneLocationCa[] }> {
  if (!(await suiviDisponible())) return { disponible: false, lignes: [] };
  const [activites, regles, apporteurs] = await Promise.all([lireActivites(await anneesActives()), lireRegles(), lireApporteurs()]);
  return { disponible: true, lignes: activites.map((a) => ligneLocationCa(a, { regles, apporteurs })) };
}
