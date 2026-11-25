import { montantFr } from './vingtPourcent';
import { nomCollaborateur } from './texteCompteRendu';

/**
 * ══ 🔴🔴 LES RESTITUTIONS DES 20 % DANS L'HISTORIQUE DE LA FICHE DU LOCATAIRE (décision d'Arno du 26/11/2026). MODULE PUR. ══════════════════════════
 * « Les restitutions doivent apparaître dans l'historique de la fiche du locataire, puisque la fenêtre « Faire restitution » annonce qu'elles sont
 * « journalisées dans le dossier du locataire » » :
 *   « Restitution des 20 % validée le JJ/MM/AAAA — X,XX € restitués sur Y,YY € retenus (différence Z,ZZ € : motif) », puis
 *   « par Prénom NOM, le JJ/MM/AAAA à HHhMM » ; une restitution annulée porte son annulation dessous.
 * Source : les lignes du journal du dossier du locataire, écrites par le geste (les mêmes que celles du bien) ; les montants sont lus sur la restitution
 * qu'elles nomment. Rien n'est copié. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export const ACTIONS_RESTITUTION_HISTORIQUE = ['location_restitution_20_faite', 'location_restitution_20_annulee'] as const;

/** La restitution nommée par le commentaire d'une ligne de journal : « … restitution 6 » (faite) / « Restitution 4 annulée … » (annulation). PUR. */
export function restitutionDeLaLigne(action: string, commentaire: string | null): number | null {
  const c = commentaire ?? '';
  const m = action === 'location_restitution_20_faite' ? /restitution (\d{1,15})$/.exec(c.trim())
    : action === 'location_restitution_20_annulee' ? /^Restitution (\d{1,15}) annulée/.exec(c.trim()) : null;
  const n = m === null ? NaN : Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** « le 26/11/2026 à 00h02 » d'un horodatage déjà à l'heure de Paris (« AAAA-MM-JJ HH:MM… »). PUR. */
export const leAHeure = (paris: string): string => `le ${dateFr(paris.slice(0, 10))} à ${paris.slice(11, 13)}h${paris.slice(14, 16)}`;
/** « Arnaud JOREL » ; compte introuvable : le libellé écrit au journal (adresse mail en dernier recours). PUR. */
export const parQui = (p: { prenom: string | null; nom: string | null; libelle: string | null }): string => nomCollaborateur(p) || (p.libelle ?? '—');

export interface RestitutionLue {
  id: number; date: string; restitue: number; vingt: number | null; retenu: number | null; motif: string | null;
  /** l'annulation de cette restitution (s'il y en a une) : quand (Paris) et par qui */
  annulation: { le: string; par: string } | null;
}

/** « Restitution des 20 % validée le 21/11/2026 — 243,60 € restitués sur 280,00 € retenus (différence 36,40 € : motif) ». PUR. */
export function texteRestitutionHistorique(r: RestitutionLue): string {
  const diff = r.retenu ?? (r.vingt !== null ? Math.round((r.vingt - r.restitue) * 100) / 100 : null);
  const difference = diff !== null && diff > 0 ? ` (différence ${montantFr(diff)}${r.motif ? ` : ${r.motif}` : ''})` : '';
  return `Restitution des 20 % validée le ${dateFr(r.date)} — ${montantFr(r.restitue)} restitués${r.vingt !== null ? ` sur ${montantFr(r.vingt)} retenus` : ''}${difference}`;
}

/** Ce que l'historique dit d'une ligne de restitution (faite ou annulée). `null` : pas une ligne de restitution reconnue (elle garde son format). PUR. */
export interface LigneRestitutionHistorique { texte: string; par: string; annulee: string | null }
export function ligneRestitutionHistorique(l: { action: string; commentaire: string | null; quand: string; par: string }, restitutions: ReadonlyMap<number, RestitutionLue>):
  LigneRestitutionHistorique | null {
  const id = restitutionDeLaLigne(l.action, l.commentaire);
  const r = id === null ? undefined : restitutions.get(id);
  const par = `par ${l.par}, ${leAHeure(l.quand)}`;
  if (l.action === 'location_restitution_20_faite') {
    if (r === undefined) return null;
    return { texte: texteRestitutionHistorique(r), par, annulee: r.annulation === null ? null : `Annulée ${leAHeure(r.annulation.le)} par ${r.annulation.par}` };
  }
  if (l.action === 'location_restitution_20_annulee') {
    // 🔴 comme dans l'historique du bien : le texte du journal de l'annulation, avec qui et quand
    return { texte: (l.commentaire ?? '').trim() || 'Restitution des 20 % annulée', par, annulee: null };
  }
  return null;
}
