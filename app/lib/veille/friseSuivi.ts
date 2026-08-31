import type { EnvoiHistorique } from './historiqueEnvois';
import type { EtatPartiel } from '../permis/dossierPartiel';
import type { EtatCascadePartielle } from './cascadePartielleRepo';

/**
 * LOT 15 — FRISE unique « Suivi et actions de la demande ». Cœur PUR : fond en UNE SEULE liste chronologique nos ENVOIS (LOT 13) ET
 * l'état de cascade (CASC-1 arrêt / CASC-2 butoir / CASC-3 prochaine étape), à la même forme.
 *
 * 🔴 FAITS vs ÉCHÉANCES (point 3) — on ne fait JAMAIS passer une échéance pour un fait accompli :
 *   • `quand: 'passe'`  = un FAIT daté et révolu (un envoi parti, l'arrêt de la relance ordinaire) ;
 *   • `quand: 'avenir'` = une ÉCHÉANCE / une action encore à venir (butoir CADA, prochaine étape de cascade).
 * La distinction est portée par le TYPE d'événement (pas par une comparaison de dates : un butoir même dépassé reste une échéance),
 * puis rendue visuellement distincte (grisée, préfixée « À venir »). Une SEULE frise, l'ordre reste chronologique (point 4).
 */
export type QuandFrise = 'passe' | 'avenir';
export interface EvenementFrise {
  le: string;              // ISO — date (± heure) de l'événement ou de l'échéance
  quand: QuandFrise;
  libelle: string;         // nature, en gras à l'affichage
  detail: string | null;   // précision grise sous la ligne (destinataire, motif…) ou null
  bascule?: boolean;       // LOT 16 : marque la BASCULE DE PROCESS (passage au process « document partiel ») → liseré rouge discret à l'affichage
}

/** Entrées de la frise — toutes DÉJÀ chargées ailleurs (LOT 13 pour les envois, richDetail pour la cascade) : aucune lecture ici. */
export interface EntreesFrise {
  envois: readonly EnvoiHistorique[];
  suspension: EtatPartiel | null;
  butoirIso: string | null;              // CASC-2 : butoir CADA prolongé (ISO), calculé par l'appelant (dateButoirPartiel) ; null si non partiel
  cascade: EtatCascadePartielle | null;  // CASC-3 : étape due / prochaine échéance
}

/** CASC-3 → { date, libellé } de la prochaine étape, ou null si rien de daté à annoncer. PUR. */
function etapeCascade(c: EtatCascadePartielle): { le: string; libelle: string } | null {
  // LOT 17 (B, point 6) — « cascade partielle » est un terme INTERNE : on le retire de l'affichage (même esprit que « Relance programmée »).
  if (c.etape === 'relance' && c.dateDue) return { le: c.dateDue, libelle: `Relance ${c.rang} à envoyer` };
  if (c.etape === 'annonce' && c.dateDue) return { le: c.dateDue, libelle: 'Annonce CADA à envoyer' };
  if (c.etape === 'saisine_proposable' && c.dateDue) return { le: c.dateDue, libelle: 'Saisine CADA proposable' };
  if (c.prochaineDate) return { le: c.prochaineDate, libelle: 'Relance programmée' }; // LOT 16 (point 3) — ex « Cascade partielle — prochaine étape »
  return null;
}

/** Construit la frise complète, triée du plus ancien au plus récent (les faits, datés dans le passé, précèdent naturellement les échéances). PUR. */
export function construireFriseSuivi(e: EntreesFrise): EvenementFrise[] {
  const evs: EvenementFrise[] = [];
  // FAITS — nos envois (déjà mis en forme au LOT 13 : « Demande initiale… », « Relance — Rappel », « Relance partielle — 1re relance »).
  for (const env of e.envois) evs.push({ le: env.le, quand: 'passe', libelle: env.libelle, detail: env.destinataire ? `à ${env.destinataire}` : null });
  // CASC-1 — BASCULE DE PROCESS vers « document partiel » : un FAIT daté (à la 1re réclamation/déclaration). LOT 16 (point 1) : le libellé
  //   dit ce qu'on FAIT (« Relance pièces complémentaires »), pas ce qu'on cesse ; il porte le drapeau `bascule` (liseré rouge à l'affichage).
  if (e.suspension) {
    const origine = e.suspension.origine === 'declaree' ? 'relance de complément déclarée hors outil' : 'complément de pièces réclamé par l’outil';
    evs.push({ le: e.suspension.le, quand: 'passe', libelle: 'Relance pièces complémentaires', detail: `${origine} — la réclamation ciblée reste possible`, bascule: true });
    // CASC-2 — butoir CADA prolongé : une ÉCHÉANCE à venir (jamais un fait).
    if (e.butoirIso) evs.push({ le: e.butoirIso, quand: 'avenir', libelle: 'Délai avant saisine CADA prolongé', detail: 'dossier partiel' });
  }
  // CASC-3 — prochaine étape de la cascade partielle : une ÉCHÉANCE / action à venir.
  if (e.cascade) { const t = etapeCascade(e.cascade); if (t) evs.push({ le: t.le, quand: 'avenir', libelle: t.libelle, detail: null }); }
  return evs.sort((a, b) => (a.le < b.le ? -1 : a.le > b.le ? 1 : 0));
}

/**
 * Point 6 — repli des entrées ANCIENNES (repris du LOT 13) : parmi les FAITS (passé), l'ancre (demande initiale) et les 3 plus récents
 * restent visibles, le milieu part derrière un repli ; les ÉCHÉANCES (à venir) restent TOUJOURS visibles (jamais repliées : ce sont les
 * prochaines actions). PUR — l'ordre chronologique est préservé dans chaque groupe.
 */
export function partitionnerFrise(evenements: readonly EvenementFrise[]): { passeVisible: EvenementFrise[]; passeReplie: EvenementFrise[]; avenir: EvenementFrise[] } {
  const passe = evenements.filter((e) => e.quand === 'passe');
  const avenir = evenements.filter((e) => e.quand === 'avenir');
  if (passe.length <= 4) return { passeVisible: passe, passeReplie: [], avenir };
  return { passeVisible: [passe[0], ...passe.slice(-3)], passeReplie: passe.slice(1, passe.length - 3), avenir };
}
