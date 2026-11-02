// 🔴 MON ESPACE, LOT 10 (Arno, 02/11/2026) — LES DONNÉES D'UNE STRUCTURE (CRITERIMMO, MACJ, ou FUSION : null), UNE SEULE LECTURE. C'est le corps
// de `GET /api/admin/transaction?vue=societe` (le Suivi CA), déplacé ici TEL QUEL pour que le mode agence de « Mon espace » lise exactement les
// mêmes ventes (lignes miroir de l'inter-cabinet comprises), rétrocessions, montants à rattacher, notes doubles, statuts et noms. LECTURE SEULE.
// Pas de `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves).
import { libellesNegociateurs } from './nomNegociateur';
import { libellesDePaye, lireARattacher, lireNotesDoubles, lireRetrocessions, lireStatutsNegociateurs, lireVentes, nomsAffichesNegociateurs, transactionDisponible } from './repo';
import type { DonneesSociete, Societe } from './modele';

export async function lireDonneesSociete(societe: Societe | null, aujourdhui: string): Promise<DonneesSociete> {
  const disponible = await transactionDisponible();
  if (!disponible) return { disponible, societe, aujourdhui, ventes: [], retrocessions: [], aRattacher: [], doubles: [] };
  const [ventes, retrocessions, aRattacher, doubles] = await Promise.all([lireVentes(societe), lireRetrocessions(societe), lireARattacher(societe), lireNotesDoubles(societe)]);
  // LOT Q — le statut du compte rapproché de chaque négociateur payé (paye importée) : le « Reste à l'agence » ne déduit que les indépendants.
  const statutsNegociateurs = await lireStatutsNegociateurs(libellesDePaye([...ventes, ...doubles])).catch(() => ({}));
  // 🔴 LOT CG — le nom affiché (« Prénom NOM ») de chaque libellé de négociateur.
  const nomsNegociateurs = await nomsAffichesNegociateurs(libellesNegociateurs([...ventes, ...doubles], retrocessions)).catch(() => ({}));
  return { disponible, societe, aujourdhui, ventes, retrocessions, aRattacher, doubles, statutsNegociateurs, nomsNegociateurs };
}
