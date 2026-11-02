// 🔴 MON ESPACE, LOT 6 (Arno, 02/11/2026) — MODIFIER / REJOINDRE UNE AFFAIRE DEPUIS « MON ESPACE », et lire son historique. L'écriture est
// `enregistrerDossier` de la tuile Suivi CA, avec la garde de version ; les règles propres à « Mon espace » sont dans modification.ts. Pas de
// `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves).
import { uniteCommissionDisponible } from '../admin/schemaDroits';
import { enregistrerDossier, lireJournal, lireVentes, type AuteurTx, type EntreeJournal } from '../transaction/repo';
import { normaliserMandat } from '../transaction/mandat';
import type { Vente } from '../transaction/modele';
import type { DossierSaisie } from '../transaction/saisie';
import { estAdministrateur } from './creationRepo';
import { estAMoi, mesCotes, sansCommissionsDesAutres, type VenteMonEspace } from './mesAffaires';
import { moiDansLesVentes } from './mesAffairesRepo';
import { commissionsConservees, estSurLaVente, journalPourLeTitulaire, refusModification } from './modification';

/** La vente enregistrée (vue FUSION : chaque vente une fois, telle quelle) ; null : inconnue ou retirée. LECTURE SEULE. */
async function venteEnregistree(id: number): Promise<Vente | null> {
  return (await lireVentes(null)).find((v) => v.id === id) ?? null;
}

/** Le titulaire figure-t-il déjà sur la vente (son compte, ou un libellé des fichiers rattaché à lui) ? LECTURE SEULE. */
async function titulaireSurLaVente(compteId: number, v: Vente): Promise<boolean> {
  return estSurLaVente(v, compteId) || estAMoi(v, await moiDansLesVentes(compteId, [v]));
}

/**
 * Pour « Rejoindre » : la vente qui porte ce n° de mandat, telle que le titulaire la recevrait (sans la commission des autres), avec sa version.
 * null : le n° ne correspond pas à cette affaire. LECTURE SEULE.
 */
export async function venteARejoindre(compteId: number, id: number, numero: string): Promise<VenteMonEspace | null> {
  const v = await venteEnregistree(id);
  const n = normaliserMandat(numero);
  if (v === null || n === null || n !== normaliserMandat(v.numeroMandat ?? null)) return null;
  const moi = await moiDansLesVentes(compteId, [v]);
  const administrateur = await estAdministrateur(compteId);
  const reduite = administrateur ? v : sansCommissionsDesAutres(v, moi);
  return { ...reduite, mesCotes: mesCotes(v, moi), commissionsRetirees: reduite.lignes.length !== v.lignes.length };
}

/**
 * Modifier (ou rejoindre) une affaire depuis « Mon espace » : les règles de « Mon espace » (`refusModification`), les commissions reprises de la
 * vente enregistrée pour un collaborateur (`commissionsConservees`), puis `enregistrerDossier` de la tuile avec la garde de version. Rend le
 * statut HTTP d'un refus (409 : un collègue a enregistré entre-temps).
 */
export async function modifierDepuisMonEspace(compteId: number, id: number, s: DossierSaisie, o: { version: number | null; rejoindre: { numero: string } | null },
  aujourdhui: string, auteur: AuteurTx): Promise<{ ok: true; id: number } | { ok: false; statut: 403 | 404 | 409 | 422; motif: string }> {
  const enregistree = await venteEnregistree(id);
  if (enregistree === null) return { ok: false, statut: 404, motif: 'Affaire introuvable (ou retirée).' };
  const administrateur = await estAdministrateur(compteId);
  const refus = refusModification(enregistree, s, { compteId, administrateur, surLaVente: await titulaireSurLaVente(compteId, enregistree), rejoindre: o.rejoindre });
  if (refus !== null) return { ok: false, ...refus };
  // La vue personnelle n'envoie aucune commission : celles qui sont enregistrées sont reprises (jamais écrasées par une valeur absente).
  const saisie: DossierSaisie = !administrateur && (await uniteCommissionDisponible()) ? { ...s, commissions: commissionsConservees(enregistree, s) } : s;
  const r = await enregistrerDossier(id, saisie, aujourdhui, auteur, o.version);
  if (r.ok) return { ok: true, id };
  return { ok: false, statut: r.conflit ? 409 : 422, motif: r.motif };
}

/**
 * L'historique d'une affaire pour « Mon espace » : ses gestes (qui, quand, quoi, avant → après), en lecture seule ; un collaborateur ne lit ni les
 * commissions ni les taux (`journalPourLeTitulaire`). null : il n'a pas accès à cette affaire. LECTURE SEULE.
 */
export async function journalMonEspace(compteId: number, id: number): Promise<EntreeJournal[] | null> {
  const v = await venteEnregistree(id);
  if (v === null) return null;
  const administrateur = await estAdministrateur(compteId);
  if (!administrateur && !(await titulaireSurLaVente(compteId, v))) return null;
  return journalPourLeTitulaire(await lireJournal('vente', id), administrateur);
}
