// TUILE « TRANSACTION » — le CA HT de la LOCATION, mois par mois, LU dans le Suivi de la Location (aucune copie, aucune écriture) :
// les lignes du suivi (`lireActivites`, celles de « Suivi du mois ») et leur CA (`caLigne`, la ligne « TOTAL CA HT »). Le Suivi de
// la Location ne change pas ; sans sa migration (406), la location est « non lue » (null) et le CA global le dit.
import { anneesActives, lireActivites } from '../location/suivi/tableauBordRepo';
import { lireApporteurs, lireRegles, lireRetrocessions, suiviDisponible } from '../location/suivi/suiviRepo';
import { caTtcC, depuisHt, ligneLocationCa, type LigneLocationCa, type RetroLocation, type SalairesLocation } from './locationCa';
import { caLigne, cleNegociateur, moisDeLigne, type ActiviteCalcul } from '../location/suivi/tableauBord';
import { lireSalairesLocation } from './repo';

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
 * 🔴 LOT CG1 — le CA TTC de la location par mois, en CENTIMES : la règle de la page « Suivi CA › Location » (`caTtcC` : chaque ligne au centime,
 * puis la somme), aucune copie. PUR.
 */
export function caLocationTtcCParMois(lignes: readonly ActiviteCalcul[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const a of lignes) r[moisDeLigne(a)] = (r[moisDeLigne(a)] ?? 0) + caTtcC(a);
  return r;
}
/** 🔴 LOT CG1 — le CA de la location par mois, HT (euros) et TTC (centimes), lus une fois. LECTURE SEULE. Sans la migration 406 : null. */
export async function lireCaLocationHtTtc(): Promise<{ ht: Record<string, number>; ttcC: Record<string, number> } | null> {
  if (!(await suiviDisponible())) return null;
  const lignes = await lireActivites(await anneesActives());
  return { ht: caLocationParMois(lignes), ttcC: caLocationTtcCParMois(lignes) };
}

/**
 * 🔴 LOT LO1 — « Suivi Chiffre d'affaires › Location » : toutes les lignes du Suivi (non annulées), chacune avec ses montants au centime (CA,
 * propriétaire, locataire, prime, apporteur, net), calculés ici par les fonctions de la Location ; seules ces lignes partent (ni règles ni
 * barèmes). LECTURE SEULE. Sans la migration 406 : `disponible` faux, aucune ligne.
 */
export async function lireLocationCa(): Promise<{ disponible: boolean; lignes: LigneLocationCa[]; retrocessions: RetroLocation[]; salaires: SalairesLocation[] | null }> {
  // 🔴 LOT LO11 — les salaires chargés de la Location (447 ; null sans elle) et les rétrocessions des négociateurs (le variable du mois)
  const salaires = await lireSalairesLocation().catch(() => null);
  if (!(await suiviDisponible())) return { disponible: false, lignes: [], retrocessions: [], salaires };
  const [activites, regles, apporteurs, retros] = await Promise.all([lireActivites(await anneesActives()), lireRegles(), lireApporteurs(), lireRetrocessions()]);
  return { disponible: true, lignes: activites.map((a) => ligneLocationCa(a, { regles, apporteurs })), salaires,
    retrocessions: retros.map((r) => ({ annee: Number(r.mois.slice(0, 4)), mois: Number(r.mois.slice(5, 7)), negociateurCle: cleNegociateur(r), montantC: depuisHt(r.montant) })) };
}
