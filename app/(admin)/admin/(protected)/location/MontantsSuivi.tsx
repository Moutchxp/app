'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ActiviteCalcul } from '../../../../lib/location/suivi/tableauBord';
import { ttcCentimes } from '../../../../lib/transaction/locationCa';

/**
 * ══ 🔴 LOT LO2 (Arno, 01/11/2026) — LES MONTANTS DU SUIVI ANNUEL DANS L'UNITÉ CHOISIE (« Montants HT | TTC », le choix du Suivi Chiffre d'affaires) ══
 * Un fournisseur que pose le Suivi annuel ; ailleurs (le Suivi du mois, les autres outils), aucun : les montants s'écrivent EXACTEMENT comme avant
 * (« 1 234,56 € », HT). Avec l'unité : le montant dans l'unité en grand, l'autre en petit entre parenthèses (« 1 481,47 € TTC (1 234,56 € HT) »).
 * Le TTC suit la règle de la page Location du Suivi Chiffre d'affaires (`locationCa`) : un montant d'une somme de lignes → la somme du TTC de chaque
 * ligne (`ttc` fourni par l'appelant) ; un autre montant → ce montant × 1,20 au centime (`ttcCentimes`). Les saisies restent en HT.
 */
export interface UniteSuivi { u: 'ht' | 'ttc' | null; parId: ReadonlyMap<string, ActiviteCalcul> }
const Contexte = createContext<UniteSuivi>({ u: null, parId: new Map() });
export const FournisseurUniteSuivi = Contexte.Provider;

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const CSS_MONTANTS_SUIVI = `
.sv-mt{white-space:normal}
.sv-mt-grand{white-space:nowrap}
.sv-mt-autre{font-size:.78em;font-weight:600;color:var(--color-svv-muted);white-space:nowrap}
/* « Montants HT | TTC » en haut à droite de la barre de filtres (lot DI) ; au téléphone, à la ligne, à droite */
.tdb-filtres.sv-filtres-unite{grid-template-columns:repeat(6,minmax(0,1fr)) auto}
.sv-champ-unite{display:flex;flex-direction:column;align-items:flex-end;text-align:right;gap:4px;min-width:max-content;justify-self:end}
@media (max-width:1100px){ .tdb-filtres.sv-filtres-unite{grid-template-columns:repeat(3,minmax(0,1fr))} .sv-champ-unite{grid-column:1/-1;grid-row:1} }
@media (max-width:760px){ .tdb-filtres.sv-filtres-unite{grid-template-columns:repeat(2,minmax(0,1fr))} }
/* au téléphone, le petit montant passe sous le grand (les tableaux tiennent dans la largeur) */
@media (max-width:640px){ .sv-mt{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.2}
  /* les petits tableaux du Résumé (montant + son autre unité) : en cartes, chaque valeur précédée de son intitulé (le patron des tableaux de la Location) */
  [data-unite-montants] .fdm-mini thead,[data-unite-montants] .fdm-mini .fdm-pf-entetes{display:none}
  [data-unite-montants] .fdm-mini,[data-unite-montants] .fdm-mini tbody,[data-unite-montants] .fdm-mini tfoot,[data-unite-montants] .fdm-mini tr,
  [data-unite-montants] .fdm-mini th,[data-unite-montants] .fdm-mini td{display:block;width:100%;box-sizing:border-box}
  [data-unite-montants] .fdm-mini tr{border-bottom:1px solid var(--color-svv-line);padding:6px 0}
  [data-unite-montants] .fdm-mini th,[data-unite-montants] .fdm-mini td{border-bottom:0;text-align:left;padding:2px 0;white-space:normal}
  [data-unite-montants] .fdm-mini td{display:flex;justify-content:space-between;align-items:center;gap:10px}
  [data-unite-montants] .fdm-mini td::before{content:attr(data-mot);color:var(--color-svv-muted);font-size:.78rem;font-weight:700} }
`;

/** Un montant : son HT, et — quand il est la somme de lignes — son TTC exact (centimes). */
export interface MontantSuivi { ht: number; ttcC?: number }
/** 🔴 LOT LO14 — un coût sans TVA (commissions d'apporteurs, primes de nouvelle gestion) : son TTC = son HT, au centime. */
export const sansTvaSuivi = (ht: number): MontantSuivi => ({ ht, ttcC: Math.round((ht + Number.EPSILON) * 100) });

export function useMontantSuivi() { return formateurSuivi(useContext(Contexte)); }
/** Le formateur d'une unité (le Suivi annuel s'en sert pour lui-même, avant de poser le fournisseur pour ses blocs). */
export function formateurSuivi(c: UniteSuivi) {
  /** Le TTC d'un montant, en centimes : celui fourni (une somme de lignes), sinon HT × 1,20 au centime. */
  const ttcC = (x: MontantSuivi | number): number => (typeof x === 'number' ? ttcCentimes(x) : x.ttcC ?? ttcCentimes(x.ht));
  const ttcDe = (x: MontantSuivi): number => ttcC(x) / 100;
  /** La valeur dans l'unité affichée (graphiques, écarts) ; sans unité : le HT. */
  const v = (x: MontantSuivi): number => (c.u === 'ttc' ? ttcDe(x) : x.ht);
  /** Le mot de l'unité (« HT » → « TTC ») dans un titre. */
  const mot = (t: string): string => (c.u === 'ttc' ? t.replace(/\bHT\b/g, 'TTC') : t);
  /** Le montant écrit : sans unité, comme avant (« 1 234,56 € ») ; avec : grand (unité) + petit (l'autre) ; `prefixe` : « − », « + ». */
  const m = (x: MontantSuivi | number, o: { prefixe?: string } = {}): ReactNode => {
    const y: MontantSuivi = typeof x === 'number' ? { ht: x } : x;
    const p = o.prefixe ?? '';
    if (c.u === null) return `${p}${eur(y.ht)}`;
    const [grand, petit] = c.u === 'ttc' ? [ttcDe(y), y.ht] : [y.ht, ttcDe(y)];
    return <span className="sv-mt" data-montant-unite={c.u}><span className="sv-mt-grand">{p}{eur(grand)} {c.u === 'ttc' ? 'TTC' : 'HT'}</span>{' '}
      <small className="sv-mt-autre" data-montant-autre>({p}{eur(petit)} {c.u === 'ttc' ? 'HT' : 'TTC'})</small></span>;
  };
  /** Le seul montant dans l'unité (une opération « a − b = c » des cascades) : sans unité, comme avant. */
  const g = (x: MontantSuivi | number): string => { const y: MontantSuivi = typeof x === 'number' ? { ht: x } : x; return eur(c.u === 'ttc' ? ttcDe(y) : y.ht); };
  /** La somme TTC (centimes) des lignes désignées par leurs id, montant par montant ; null sans unité. */
  const lignes = (ids: readonly (number | string)[]): ActiviteCalcul[] => ids.map((i) => c.parId.get(String(i))).filter((a): a is ActiviteCalcul => a !== undefined);
  return { u: c.u, v, m, g, mot, lignes, ttcDe, ttcC };
}
