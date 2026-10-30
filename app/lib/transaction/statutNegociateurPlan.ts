import { normaliserLibelle } from '../location/suivi/negociateurIdentite';
import { libelleStatut, type Statut } from '../admin/statut';
import { LIBELLE_SOCIETE, totaux, type Retrocession, type Societe, type Vente } from './modele';
import { resolveurDe } from './statutLigne';

/**
 * ══ 🔴 LOT BX (Arno, 30/10/2026) — LE PLAN DE `transaction:statut-negociateur` (PUR) ═══════════════════════════════════════════════════════
 * Pour chaque libellé demandé : le compte qui le rapproche (le compte fait foi : la fiche « sans compte » est alors REFUSÉE), le statut lu
 * aujourd'hui, le statut demandé ; et l'EFFET sur la société : les commissions de négociateur (lignes « paye ») de ce libellé, et le « Reste à
 * l'agence HT » de TOUTES les ventes avant / après, au centime — un changement de statut ne déplace que la paye de ces lignes-là.
 */
export interface LigneStatut {
  libelle: string; compte: string | null; avant: Statut | null; demande: Statut;
  /** Refusé : rapproché d'un compte (son statut se change dans « Comptes »). */
  refus: string | null;
}
export interface EffetSociete { societe: Societe; lignesPaye: number; resteAvantC: number; resteApresC: number }

const C = (x: number): number => Math.round(x * 100);
const eurC = (cts: number): string => `${(cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Les lignes du plan. PUR. */
export function planStatuts(libelles: readonly string[], demande: Statut, statuts: Readonly<Record<string, Statut | null>>,
  comptes: Readonly<Record<string, { nom: string } | null>>): LigneStatut[] {
  return libelles.map((libelle) => {
    const compte = comptes[libelle]?.nom ?? null;
    return { libelle, compte, avant: statuts[libelle] ?? null, demande,
      refus: compte === null ? null : `rapproché du compte ${compte} : son statut se change dans « Comptes » (la fiche sans compte ne servirait pas)` };
  });
}

/** L'effet du changement sur une société : le reste à l'agence HT de toutes ses ventes signées, avant / après. PUR. */
export function effetStatuts(ventes: readonly Vente[], retros: readonly Retrocession[], societe: Societe, statuts: Readonly<Record<string, Statut | null>>,
  plan: readonly LigneStatut[]): EffetSociete {
  const ok = plan.filter((p) => p.refus === null);
  const cles = new Set(ok.map((p) => normaliserLibelle(p.libelle)));
  const apres: Record<string, Statut | null> = { ...statuts };
  for (const k of Object.keys(apres)) { const p = ok.find((x) => normaliserLibelle(x.libelle) === normaliserLibelle(k)); if (p !== undefined) apres[k] = p.demande; }
  const vendues = ventes.filter((v) => v.statut === 'vendue');
  const lignesPaye = ventes.reduce((t, v) => t + v.lignes.filter((l) => l.role === 'negociateur' && cles.has(normaliserLibelle(l.negociateur))).length, 0);
  return { societe, lignesPaye,
    resteAvantC: C(totaux(vendues, retros, societe, resolveurDe(statuts)).resteHt), resteApresC: C(totaux(vendues, retros, societe, resolveurDe(apres)).resteHt) };
}

/** Le texte du rapport. PUR. */
export function texteStatuts(plan: readonly LigneStatut[], effets: readonly EffetSociete[]): string {
  return [
    ...plan.map((p) => `${p.libelle} | ${p.compte === null ? 'aucun compte' : `compte ${p.compte}`} | aujourd’hui : ${libelleStatut(p.avant)} → ${libelleStatut(p.demande)} | ${p.refus === null ? (p.avant === p.demande ? 'DÉJÀ POSÉ' : 'À POSER') : `REFUSÉ : ${p.refus}`}`),
    '',
    ...effets.map((e) => `${LIBELLE_SOCIETE[e.societe]} : ${e.lignesPaye} commission(s) de négociateur de ces libellés · reste à l’agence HT (toutes les ventes signées) ${eurC(e.resteAvantC)} → ${eurC(e.resteApresC)} (écart ${eurC(e.resteApresC - e.resteAvantC)})`),
  ].join('\n');
}
