import type { DossierSaisie } from '../transaction/saisie';
import type { MontantSaisi, Vente } from '../transaction/modele';
import { normaliserMandat } from '../transaction/mandat';
import { estSurUnCote } from './creation';

/**
 * ══ 🔴 MON ESPACE, LOT 6 (Arno, 02/11/2026) — MODIFIER UNE AFFAIRE ET LA REJOINDRE DEPUIS « MON ESPACE » : CE QUE LE SERVEUR EXIGE EN PLUS (PUR) ════
 *
 * L'écriture est `enregistrerDossier` de la tuile Suivi CA (même validation, même répartition, mêmes commissions, même inter-cabinet), avec la
 * garde de version. « Mon espace » ajoute :
 *   · MODIFIER : un collaborateur présent sur au moins un côté (ou un administrateur) ; après l'enregistrement, il y reste (on ne s'efface pas
 *     d'une affaire depuis son espace) ; décision 2 : il remplit les DEUX côtés (parties, honoraires, négociateurs) ;
 *   · REJOINDRE : un collaborateur absent de l'affaire, qui connaît son n° de mandat, se place sur un côté LIBRE ; les négociateurs déjà
 *     présents restent. La répartition existante tient UN négociateur par côté : un côté déjà tenu ne se rejoint pas (question à Arno) ;
 *   · LES COMMISSIONS : la vue personnelle ne les reçoit pas et ne les envoie pas ; le serveur reprend celles qui sont enregistrées, côté par côté
 *     (montant, unité, taux, mode) — jamais écrasées par une valeur absente. Une commission « calculée » suit la répartition (règle du lot V) ;
 *     « saisie à la main », elle reste telle quelle. Un côté dont le négociateur change repart « calculé » (comme dans la tuile). Un administrateur
 *     envoie le formulaire complet : rien n'est repris.
 */
export const MOTIF_MODIFIER_PAS_SUR_UN_COTE = 'Vous n’êtes sur aucun côté de cette affaire : seuls ses négociateurs (et les administrateurs) la modifient. Rien n’a été enregistré.';
export const MOTIF_RESTER_SUR_UN_COTE = 'Vous ne pouvez pas vous retirer vous-même de l’affaire depuis votre espace : restez sur au moins un côté. Rien n’a été enregistré.';
export const MOTIF_REJOINDRE_MANDAT = 'Le n° de mandat ne correspond pas à cette affaire. Rien n’a été enregistré.';
export const MOTIF_REJOINDRE_COTE_TENU = 'Ce côté est déjà tenu par un négociateur : rejoignez le côté libre (un co-négociateur sur un même côté n’existe pas encore). Rien n’a été enregistré.';
export const MOTIF_REJOINDRE_DEJA = 'Vous êtes déjà sur cette affaire : ouvrez-la dans « Mes compromis en cours » pour la modifier. Rien n’a été enregistré.';
export const MOTIF_REJOINDRE_GARDER = 'Rejoindre une affaire ne retire ni ne remplace le négociateur déjà présent. Rien n’a été enregistré.';

type Cote = 'entree' | 'sortie';
const idDuCote = (v: Pick<Vente, 'dossier'>, c: Cote): number | null => (c === 'entree' ? v.dossier?.entree?.id : v.dossier?.sortie?.id) ?? null;
const idSaisi = (s: Pick<DossierSaisie, 'entreeId' | 'sortieId'>, c: Cote): number | null => (c === 'entree' ? s.entreeId : s.sortieId);

/** La commission enregistrée d'un côté (sa ligne « paye du négociateur »), telle que le dossier la renvoie : montant dans SON unité, taux, mode. PUR. */
function commissionEnregistree(v: Vente, c: Cote): { m: MontantSaisi | null; taux: number | null; mode: 'calculee' | 'manuelle' | null } {
  const l = v.lignes.find((x) => x.role === 'negociateur' && (x.cote ?? 'entree') === c);
  if (l === undefined) return { m: null, taux: null, mode: null };
  const m: MontantSaisi | null = l.montantHt != null ? { montant: l.montantHt, unite: 'ht' } : l.montantTtc != null ? { montant: l.montantTtc, unite: 'ttc' } : null;
  return { m, taux: l.taux ?? null, mode: l.mode ?? null };
}

/**
 * Les commissions à enregistrer pour une saisie de la vue personnelle : celles de la vente ENREGISTRÉE (non réduite), côté par côté ; un côté dont
 * le négociateur change (ou qui en reçoit un) repart « calculé » au taux par défaut ; un côté sans négociateur, aucune. PUR.
 */
export function commissionsConservees(enregistree: Vente, s: Pick<DossierSaisie, 'entreeId' | 'sortieId'>): NonNullable<DossierSaisie['commissions']> {
  const out: NonNullable<DossierSaisie['commissions']> = { entree: null, sortie: null, taux: { entree: null, sortie: null }, mode: { entree: null, sortie: null } };
  for (const c of ['entree', 'sortie'] as const) {
    const nouveau = idSaisi(s, c);
    if (nouveau === null) continue;
    if (nouveau !== idDuCote(enregistree, c)) { out.mode![c] = 'calculee'; continue; }
    const e = commissionEnregistree(enregistree, c);
    out[c] = e.m; out.taux![c] = e.taux; out.mode![c] = e.mode;
  }
  return out;
}

/** Le titulaire est-il sur un côté de la vente ENREGISTRÉE (dossier ou parties) ? PUR. */
export const estSurLaVente = (v: Pick<Vente, 'dossier' | 'repartition'>, compteId: number): boolean =>
  v.dossier?.entree?.id === compteId || v.dossier?.sortie?.id === compteId || (v.repartition?.parties ?? []).some((p) => p.compteId === compteId);

/**
 * Le refus d'une modification (ou d'un « Rejoindre ») depuis « Mon espace » ; null : la saisie peut partir vers `enregistrerDossier`.
 * `surLaVente` : le titulaire y figure déjà (son compte, ou un libellé des fichiers qui lui est rattaché). PUR.
 */
export function refusModification(enregistree: Vente, s: DossierSaisie, o: { compteId: number; administrateur: boolean; surLaVente: boolean;
  rejoindre: { numero: string } | null }): { statut: 403 | 422; motif: string } | null {
  if (o.rejoindre === null) {
    if (o.administrateur) return null;
    if (!o.surLaVente) return { statut: 403, motif: MOTIF_MODIFIER_PAS_SUR_UN_COTE };
    return estSurUnCote(s, o.compteId) ? null : { statut: 422, motif: MOTIF_RESTER_SUR_UN_COTE };
  }
  // Rejoindre : la preuve (le n° de mandat de CETTE affaire), un côté libre, personne n'est retiré.
  const n = normaliserMandat(o.rejoindre.numero);
  if (n === null || n !== normaliserMandat(enregistree.numeroMandat ?? null)) return { statut: 403, motif: MOTIF_REJOINDRE_MANDAT };
  if (o.surLaVente) return { statut: 422, motif: MOTIF_REJOINDRE_DEJA };
  for (const c of ['entree', 'sortie'] as const) {
    const avant = idDuCote(enregistree, c);
    const apres = idSaisi(s, c);
    if (avant !== null && apres !== avant) return { statut: 422, motif: apres === o.compteId ? MOTIF_REJOINDRE_COTE_TENU : MOTIF_REJOINDRE_GARDER };
  }
  return estSurUnCote(s, o.compteId) ? null : { statut: 422, motif: 'Choisissez votre côté (entrée ou sortie) pour rejoindre l’affaire. Rien n’a été enregistré.' };
}

/** Les entrées du journal qu'un collaborateur lit : toutes, SAUF les commissions (montants et taux des deux côtés). Un administrateur : toutes. PUR. */
export const ACTIONS_JOURNAL_RESERVEES = ['commissions'];
export const journalPourLeTitulaire = <J extends { action: string }>(js: readonly J[], administrateur: boolean): J[] =>
  (administrateur ? [...js] : js.filter((j) => !ACTIONS_JOURNAL_RESERVEES.includes(j.action)));
