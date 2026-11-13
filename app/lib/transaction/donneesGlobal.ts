// 🔴 MON ESPACE « LES COÛTS » (Arno, 03/11/2026) — LES DONNÉES DU CA GLOBAL, UNE SEULE LECTURE. C'est le corps de
// `GET /api/admin/transaction?vue=global` (le Suivi CA › CA global), déplacé ici TEL QUEL pour que l'onglet « Les coûts » de « Mon espace » lise
// exactement les mêmes ventes, rétrocessions, statuts, gestion et location que « Coûts globaux » (même patron que `donneesSociete.ts`).
// LECTURE SEULE. Pas de `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves).
import type { Vente } from './modele';
import { compromisEnCours, totalCompromisEnCours } from './compromisEnCours';
import { resolveurDe } from './statutLigne';
import { libellesDePaye, lireCoutsLignes, lireGestion, lireNotesDoubles, lireRetrocessions, lireStatutsNegociateurs, lireVentes, transactionDisponible } from './repo';
import { lireCaLocationHtTtc, lireLocationCa } from './locationLue';
import { mongaDisponible } from '../admin/schemaDroits';
import { lignesPourCoutsGlobaux } from './coutsSaisis';
import { lireCollaborateursGraphe } from './collaborateursGrapheRepo';

/**
 * Le CA global : ventes COMPLÈTES des deux sociétés, gestion, location (CA HT et TTC), rétrocessions, statut des négociateurs payés, données de
 * « Suivi CA › Location » ; `compromis` (défaut : oui) : les compromis en cours de nos deux sociétés et de chacune (le prévisionnel du CA global ;
 * « Les coûts » n'en a pas besoin).
 */
/**
 * 🔴🔴 472 — CONFIDENTIALITÉ DES « RÉMUNÉRATIONS ASSOCIÉS » : elles ne sortent d'ici QUE sur demande expresse (`remunerations: true`), que seules font
 * les routes réservées aux comptes qui ont « Les coûts » (« Coûts et CA », et le Suivi CA pour ces comptes-là). Par défaut — tout autre lecteur —
 * leurs lignes ET leurs montants sont retirés AVANT tout calcul : aucun total envoyé ne les contient (rien à retrouver par soustraction).
 */
export const sansRemunerations = <T extends { poste: string }>(xs: readonly T[]): T[] => xs.filter((l) => l.poste !== 'remunerations');
export async function lireDonneesGlobal(aujourdhui: string, o: { compromis?: boolean; remunerations?: boolean } = {}): Promise<Record<string, unknown>> {
  const disponible = await transactionDisponible();
  // 🔴 LOT CG1 — la location en HT et en TTC (centimes, la règle de la page « Suivi CA › Location »)
  const loc = await lireCaLocationHtTtc().catch(() => null);
  const location = loc?.ht ?? null; const locationTtcC = loc?.ttcC ?? null;
  if (!disponible) return { disponible, aujourdhui, ventes: [], gestion: [], location, locationTtcC };
  const [ventes, gestion, retrocessions, doubles] = await Promise.all([lireVentes(null), lireGestion(), lireRetrocessions(null), lireNotesDoubles(null)]);
  // 🔴 LOT CG2 — les coûts globaux : les données de la page FUSION (ventes complètes, rétrocessions, statut des négociateurs payés) et de la page
  // « Suivi CA › Location » (lignes, rétrocessions, salaires chargés), en lecture seule
  const statutsNegociateurs = await lireStatutsNegociateurs(libellesDePaye([...ventes, ...doubles])).catch(() => ({}));
  const locationCa = await lireLocationCa().catch(() => null);
  // 🔴 « Les coûts », lot 2 (451) — les coûts saisis : salaires de la vente et « Autres » vont dans `coutsGlobaux` (`coutsSaisis`) ; les salaires
  // de la Location et de la Gestion sont déjà dans leurs lectures (`lireSalairesLocation`, `lireGestion`). `coutsLignes` : toutes, pour la saisie.
  const lues = await lireCoutsLignes().catch(() => null);
  const coutsLignes = lues === null ? null : o.remunerations === true ? lues : sansRemunerations(lues);
  let compromis: Record<string, unknown> = {};
  if (o.compromis !== false) {
    const [ventesC, ventesM] = await Promise.all([lireVentes('criterimmo'), lireVentes('macj')]);
    // 🔴 LOT CY — les compromis en cours (la règle unique, `totalCompromisEnCours`) : nos deux sociétés, et chacune (ses lignes miroir comprises).
    const total = async (vs: readonly Vente[], vueC: 'criterimmo' | 'macj' | null) => {
      const statuts = await lireStatutsNegociateurs(libellesDePaye(compromisEnCours(vs, vueC))).catch(() => ({}));
      return totalCompromisEnCours(vs, vueC, resolveurDe(statuts));
    };
    compromis = { compromisEnCours: { tous: await total(ventes, null), criterimmo: await total(ventesC, 'criterimmo'), macj: await total(ventesM, 'macj') } };
  }
  // 🔴 LOT GE3 — `monga` : la migration 446 est-elle appliquée (la saisie du coût MONGA) ?
  // 🔴 D33 — les collaborateurs du graphique (comptes, fonctions, structures, libellés rapprochés) ; une panne : aucune liste (le graphique d'avant)
  const collaborateursGraphe = await lireCollaborateursGraphe(ventes).catch(() => null);
  return { disponible, aujourdhui, gestion, location, locationTtcC, ...compromis, monga: await mongaDisponible().catch(() => false), collaborateursGraphe,
    retrocessions, statutsNegociateurs, locationCa: locationCa?.disponible === true ? { lignes: locationCa.lignes, retrocessions: locationCa.retrocessions, salaires: locationCa.salaires,
      dus: locationCa.dus ?? [] } : null,
    coutsSaisis: lignesPourCoutsGlobaux(coutsLignes ?? []), coutsLignes,
    // 🔴 LOT CG2 — les ventes COMPLÈTES (les cartes de la page FUSION : répartition, lignes, dossier), plus seulement leurs champs du CA
    ventes };
}
