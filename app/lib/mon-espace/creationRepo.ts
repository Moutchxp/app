// 🔴 MON ESPACE, LOT 5 (Arno, 02/11/2026) — CRÉER UN COMPROMIS DEPUIS « MON ESPACE » : les lectures du parcours et l'écriture. L'écriture est
// `enregistrerDossier` de la tuile Suivi CA, telle quelle (aucune copie de logique) ; la recherche du n° est `venteDuMandat` (lot 2). Pas de
// `import 'server-only'` (même convention que les dépôts de la Transaction, lus par les épreuves).
import { mandatDisponible, personneTypeDisponible, prixVenteDisponible, repartitionDisponible, uniteCommissionDisponible } from '../admin/schemaDroits';
import { enregistrerDossier, lireNegociateurs, lirePeriodesSociete, lireVentes, type AuteurTx, type Issue } from '../transaction/repo';
import { societeALaDate, societeDOffice } from '../transaction/societeNegociateur';
import { venteDuMandat } from '../transaction/mandatRepo';
import { LIBELLE_SOCIETE, libellePersonne, type Societe } from '../transaction/modele';
import type { DossierSaisie } from '../transaction/saisie';
import { motifStructureImposee, refusCreation, type TransactionDuMandat } from './creation';

import { estAdministrateur } from './compteRepo';
import { lireMesApporteurs } from './apporteursRepo';
export { estAdministrateur };

/**
 * 🔴 Décision 12 (Arno, 02/11/2026) — LA STRUCTURE DE MON PROFIL, aujourd'hui : le rattachement enregistré sur le compte (`transaction_societe_compte`,
 * daté ; `societeALaDate`) — CRITERIMMO ou MACJ : imposée (la question « Pour quelle structure ? » n'est pas posée) ; les deux, ou aucun rattachement
 * enregistré : null (la question reste). LECTURE SEULE.
 */
export async function structureImposee(compteId: number, aujourdhui: string): Promise<Societe | null> {
  return societeDOffice(societeALaDate((await lirePeriodesSociete([compteId])).get(compteId) ?? [], aujourdhui));
}
/** Côté serveur : un COLLABORATEUR rattaché à une seule structure ne travaille que dans la sienne (un administrateur : le mode agence, inchangé). */
export async function refusStructure(compteId: number, societe: Societe, aujourdhui: string): Promise<string | null> {
  if (await estAdministrateur(compteId)) return null;
  const imposee = await structureImposee(compteId, aujourdhui);
  return imposee === null || imposee === societe ? null : motifStructureImposee(LIBELLE_SOCIETE[imposee]);
}

/**
 * Ce que le formulaire de compromis propose depuis « Mon espace » : les négociateurs actifs (pour l'autre côté, décision 2), MES apporteurs (🔴 lot 9 :
 * ceux de l'onglet « Mes apporteurs », la même règle — rattachés à moi, sur mes ventes, que j'utilise ; un administrateur : tous) et les collègues
 * (« + Nouvel apporteur » : rattachement d'un externe), les migrations appliquées. Aucune fiche de vendeur / acquéreur de l'agence n'est proposée
 * (pas d'annuaire des clients hors de la Transaction). LECTURE SEULE.
 */
export async function referencesMonEspace(compteId: number, _administrateur: boolean, aujourdhui: string): Promise<Record<string, unknown>> {
  const [negociateurs, mes] = await Promise.all([lireNegociateurs(aujourdhui), lireMesApporteurs(compteId)]);
  return { lotD: await repartitionDisponible(), personneType: await personneTypeDisponible(), prixVente: await prixVenteDisponible(), mandat: await mandatDisponible(),
    uniteCommission: await uniteCommissionDisponible(), negociateurs: negociateurs.filter((x) => x.actif),
    // 🔴 D29 / D38 : `interne` = avec TVA (collaborateur ou Professionnel).
    apporteurs: mes.apporteurs.map((a) => ({ id: a.id, nom: a.fiche.nom, recherche: a.recherche, libelle: a.libelle, ...(a.interne || a.fiche.statutTva === 'professionnel' ? { interne: true } : {}) })),
    // 🔴 Arno (05/11/2026, production) — `collegues` et `personnes` avaient glissé DANS le commentaire ci-dessus (lots D29 puis D38) : la réponse
    //    ne les portait plus et le formulaire tombait au choix du côté (« Cannot read properties of undefined (reading 'map') »).
    collegues: mes.collegues, personnes: [],
    // 🔴 Décision 12 — la structure de mon profil (null : les deux, ou aucun rattachement enregistré : la question reste)
    structureImposee: await structureImposee(compteId, aujourdhui) };
}

/** La transaction qui porte déjà ce n° dans cette structure (sans montant), ou null : le n° est libre. LECTURE SEULE. */
export async function transactionDuMandat(societe: Societe, numero: string): Promise<TransactionDuMandat | null> {
  const prise = await venteDuMandat(societe, numero);
  if (prise === null) return null;
  const v = (await lireVentes(null)).find((x) => x.id === prise.id);
  const personnes = (role: 'vendeur' | 'acquereur'): string[] => (v?.dossier?.personnes ?? []).filter((p) => p.role === role)
    .map(libellePersonne);
  return { id: prise.id, societe: prise.societe, numero: prise.numero, libelle: prise.libelle, statut: prise.statut, dateCompromis: prise.dateCompromis,
    dateActe: prise.dateActe, adresseBien: prise.adresseBien, vendeurs: personnes('vendeur'), acquereurs: personnes('acquereur'),
    entree: v?.dossier?.entree?.nom ?? null, sortie: v?.dossier?.sortie?.nom ?? null };
}

/**
 * Crée le compromis : les conditions de « Mon espace » (`refusCreation`), puis `enregistrerDossier` de la tuile Suivi CA (qui refuse aussi un n°
 * déjà pris). Rend le statut HTTP d'un refus.
 */
export async function creerCompromisMonEspace(compteId: number, s: DossierSaisie, aujourdhui: string, auteur: AuteurTx):
  Promise<{ ok: true; id: number } | { ok: false; statut: 403 | 422; motif: string }> {
  const refus = refusCreation(s, { compteId, administrateur: await estAdministrateur(compteId), mandatDisponible: await mandatDisponible() });
  if (refus !== null) return { ok: false, ...refus };
  const autre = await refusStructure(compteId, s.societe, aujourdhui);
  if (autre !== null) return { ok: false, statut: 403, motif: autre };
  const r: Issue<number> = await enregistrerDossier(null, s, aujourdhui, auteur);
  return r.ok ? { ok: true, id: r.valeur as number } : { ok: false, statut: 422, motif: r.motif };
}
