/**
 * Lot 3 — RÈGLE PURE du cycle de validation d'une carte-rail + APPLICATION de l'exclusivité. Aucune I/O (les écritures passent par des deps
 * INJECTABLES → testable sans réseau). RÉUTILISE le geste d'affectation EXISTANT (aperçu `basculer-rail` + `annuler-lot` + `PATCH /contact`) :
 * on n'ajoute AUCUN chemin d'écriture. Décisions porteur : refus au Valider = PARTIEL (on applique ce qui passe, on liste les refus) ;
 * RETRAIT d'un rail = désaffecter (canal 'inconnu' via le même PATCH /contact).
 */
import { processDeCanal, type Process } from './process';

export interface CommuneCanal { code: string; canal: string | null }
export type Coordonnees = { email: string; urlFormulaire: string; adressePostale: string };

/** Communes ACTUELLEMENT sur ce rail (canal → rail). C'est l'ORIGINE : la sélection en est amorcée, et le cycle du bouton la compare. PUR. */
export function origineRail(communes: readonly CommuneCanal[], rail: Process): Set<string> {
  return new Set(communes.filter((c) => processDeCanal(c.canal) === rail).map((c) => c.code));
}

/** Diff sélection ↔ origine : `adds` = à AFFECTER à ce rail (sélectionnées, pas d'origine) ; `removes` = à RETIRER (d'origine, désélectionnées). PUR. */
export function diffAffectation(selection: ReadonlySet<string>, origine: ReadonlySet<string>): { adds: string[]; removes: string[] } {
  const adds: string[] = []; const removes: string[] = [];
  for (const c of selection) if (!origine.has(c)) adds.push(c);
  for (const c of origine) if (!selection.has(c)) removes.push(c);
  return { adds, removes };
}

/** Au moins une affectation diffère de l'origine ? (COMPARAISON à l'origine, jamais un drapeau « on a cliqué ».) PUR. */
export function aDesChangements(selection: ReadonlySet<string>, origine: ReadonlySet<string>): boolean {
  const d = diffAffectation(selection, origine);
  return d.adds.length > 0 || d.removes.length > 0;
}

/** Libellé du bouton à 3 temps : repos → « Modifier la sélection » ; édition sans changement → « Garder la sélection » ; changement → « Valider ma sélection ». PUR. */
export function libelleBoutonCarte(edition: boolean, changements: boolean): string {
  if (!edition) return 'Modifier la sélection';
  return changements ? 'Valider ma sélection' : 'Garder la sélection';
}

// ── Application (deps injectables : mêmes endpoints que le geste existant, aucun nouveau chemin) ──────────────────────────────────────────
export interface DepsAffectation {
  /** Aperçu `GET /basculer-rail` : raison de refus (coordonnée cible manquante…), ids des demandes NON envoyées (indépendant de la cible), coordonnées à préserver. */
  apercu(code: string, cible: Process): Promise<{ raisonRefus: string | null; ids: number[]; coordonnees: Coordonnees; communeNom: string | null } | null>;
  annulerLot(ids: number[]): Promise<boolean>;                                              // POST /demandes/annuler-lot (chemin D1)
  patchContact(code: string, canal: string, coords: Coordonnees, motif: string): Promise<boolean>; // PATCH /contact (ecrireContact, journalisé)
}
export interface Refus { code: string; nom: string | null; raison: string }
export interface ResultatAffectation { appliquees: string[]; refusees: Refus[] }

/**
 * Applique le diff commune par commune (RÉUTILISE le geste existant). PARTIEL : une commune refusée n'empêche PAS les autres.
 *  · ADD    : aperçu(cible=rail) → si `raisonRefus` (coordonnée manquante) → REFUSÉE (renvoi fiche contact) ; sinon annuler-lot puis PATCH canal=rail.
 *  · REMOVE : aperçu(cible=rail) pour récupérer ids+coords (le refus « déjà sur ce rail » est IGNORÉ pour un retrait) → annuler-lot puis PATCH canal='inconnu' (hors process).
 * L'exclusivité est STRUCTURELLE : `canal` est une seule colonne → affecter à un rail retire de l'autre, sans second écrit.
 */
export async function appliquerAffectations(
  deps: DepsAffectation,
  params: { adds: readonly string[]; removes: readonly string[]; rail: Process; motif: string },
): Promise<ResultatAffectation> {
  const appliquees: string[] = []; const refusees: Refus[] = [];

  for (const code of params.adds) {
    const a = await deps.apercu(code, params.rail);
    if (!a) { refusees.push({ code, nom: null, raison: 'aperçu indisponible' }); continue; }
    if (a.raisonRefus) { refusees.push({ code, nom: a.communeNom, raison: a.raisonRefus }); continue; }
    if (a.ids.length > 0 && !(await deps.annulerLot(a.ids))) { refusees.push({ code, nom: a.communeNom, raison: 'annulation des demandes impossible' }); continue; }
    if (!(await deps.patchContact(code, params.rail, a.coordonnees, params.motif))) { refusees.push({ code, nom: a.communeNom, raison: 'changement de rail impossible' }); continue; }
    appliquees.push(code);
  }

  for (const code of params.removes) {
    const a = await deps.apercu(code, params.rail); // cible=rail : sert à lire ids+coords ; le refus « déjà sur ce rail » n'a pas de sens pour un retrait → ignoré.
    if (!a) { refusees.push({ code, nom: null, raison: 'aperçu indisponible' }); continue; }
    if (a.ids.length > 0 && !(await deps.annulerLot(a.ids))) { refusees.push({ code, nom: a.communeNom, raison: 'annulation des demandes impossible' }); continue; }
    if (!(await deps.patchContact(code, 'inconnu', a.coordonnees, params.motif))) { refusees.push({ code, nom: a.communeNom, raison: 'retrait impossible' }); continue; }
    appliquees.push(code);
  }

  return { appliquees, refusees };
}
