'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { CascadeNegociateur, ResultatNetAgence } from '../../../../lib/location/suivi/tableauBord';
import { NOMS_MOIS } from '../../../../lib/location/suivi/tableauBord';
import { sansTva, ttcCentimes } from '../../../../lib/transaction/locationCa';
import { sansTvaSuivi, useMontantSuivi, type MontantSuivi } from './MontantsSuivi';

/**
 * 🔴 LOT LO2 — LE NET DE TOUTES VARIABLES DANS L'UNITÉ (Suivi annuel « HT | TTC ») : CA = la somme TTC des dossiers ; le net = la différence des
 * montants affichés. Sans unité : le net d'avant (centimes HT). 🔴 LOT LO15 (Arno) — les commissions (apporteurs, collègues) et le variable des
 * négociateurs sont SANS TVA (TTC = HT) : seuls les honoraires de location portent 20 %. PUR.
 */
export function netEnUnite(x: ResultatNetAgence, dossiers: readonly { ca: number }[]): MontantSuivi {
  const caT = dossiers.reduce((t, d) => t + ttcCentimes(d.ca), 0);
  const v = x.ventilation;
  // 🔴 LOT LO8 — une commission ventilée : son TTC de la somme de ses lignes s'il est connu ; 🔴 LOT LO15 — sinon sans TVA (son HT)
  const tv = (b: { centimes: number; ttcC?: number }): number => b.ttcC ?? b.centimes;
  const t = caT - tv(v.externes) - tv(v.internes) - tv(v.collegues)
    - x.variables.reduce((s, y) => s + sansTva(y.variable / 100).ttcC, 0);
  return { ht: (x.net ?? 0) / 100, ttcC: t };
}

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/** 🔴 LOT LO15 — un montant HT écrit tel quel (la base du variable est toujours le HT, même affichée en TTC). */
const euros = eur;
const SANS_TVA = ' (sans TVA)';
const pct = (x: number): string => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
/** Un montant au centime, comme à l'affichage (les opérations des « i » sont faites sur les montants AFFICHÉS). */
const c = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

type Cle = 'ca' | 'commissions' | 'net' | 'resultat' | 'primes' | 'retrocessions' | 'variable';

/** 🔴 Arno (25/10/2026) — les mots de la période des cascades : le mois (Suivi du mois) ou la période « Début / Fin » (Suivi annuel). */
export interface MotsPeriode { du: string; ceMoisCi: string; ceMois: string; dueCeMois: string; libelle?: string }
export const MOTS_MOIS: MotsPeriode = { du: 'du mois', ceMoisCi: 'ce mois-ci', ceMois: 'ce mois', dueCeMois: 'due ce mois' };
export const MOTS_PERIODE: MotsPeriode = { du: 'de la période', ceMoisCi: 'sur la période', ceMois: 'sur la période', dueCeMois: 'due sur la période' };

/**
 * ══ 🔴 Arno (25/10/2026) — LE VARIABLE DU NÉGOCIATEUR, EN CASCADE (une ligne = une opération), TOUT EN HT ═══════════════════════════════════
 * CA HT global − commissions déduites (apporteurs et collègues, hors récurrent de gestion) = CA HT net de commissions ; × taux commercial
 * (à la date de signature de chaque dossier) = résultat commercial ; + primes de gestion ; − rétrocessions (seulement si ≠ 0) = variable
 * HT dû. Un « i » sur chaque ligne de calcul : le détail se déplie DANS l'encadré, sous la ligne (l'opération avec les vrais chiffres et,
 * pour une somme, ses composants dossier par dossier) ; un seul ouvert ; second clic, clic ailleurs ou Échap le referment.
 */
/** Un seul « i » ouvert ; second clic, clic ailleurs ou Échap le referment. */
function useInfoOuvert<K extends string>() {
  const id = useId();
  const [ouvert, setOuvert] = useState<K | null>(null);
  useEffect(() => {
    if (ouvert === null) return;
    const ailleurs = (e: MouseEvent): void => {
      const cible = e.target as Element | null;
      if (cible?.closest?.(`[data-cascade-info="${ouvert}"][data-cascade-de="${id}"], [data-cascade-detail="${ouvert}"][data-cascade-de="${id}"]`) == null) setOuvert(null);
    };
    const echap = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOuvert(null); };
    document.addEventListener('mousedown', ailleurs);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', ailleurs); document.removeEventListener('keydown', echap); };
  }, [ouvert, id]);
  return { id, ouvert, setOuvert };
}

export function CascadeNegociateurMois({ x, mois, plusieurs, mots = MOTS_MOIS }: { x: CascadeNegociateur; mois: string; plusieurs: boolean; mots?: MotsPeriode }) {
  const { id, ouvert, setOuvert } = useInfoOuvert<Cle>();
  // 🔴 LOT LO2 — dans l'unité du Suivi annuel ; sans unité (Suivi du mois) : comme avant. Le CA : la somme TTC de chaque dossier (20 %) ;
  // 🔴 LOT LO15 (Arno) — les commissions déduites, les primes, les rétrocessions et le variable : SANS TVA (TTC = HT au
  // centime, le montant HT affiché) ; les « = » : la différence des montants affichés (le résultat commercial = variable − primes + rétrocessions).
  const U = useMontantSuivi();
  const T = (() => {
    const st = (ht: number): number => sansTva(ht).ttcC;
    const ca = x.dossiers.reduce((t, d) => t + ttcCentimes(d.ca), 0); const ded = st(x.deductions); const primes = st(x.primes);
    const retro = st(x.retrocessions); const variable = st(x.variable);
    return { ca: { ht: x.ca, ttcC: ca }, ded: { ht: x.deductions, ttcC: ded }, net: { ht: x.net, ttcC: ca - ded }, primes: { ht: x.primes, ttcC: primes },
      retro: { ht: x.retrocessions, ttcC: retro }, variable: { ht: x.variable, ttcC: variable }, resultat: { ht: x.resultat, ttcC: variable - primes + retro } };
  })();
  const eur = (y: MontantSuivi | number): string => U.g(y);
  // 🔴 LOT LO15 — un montant sans TVA (commission, prime, rétrocession, résultat, variable) : TTC = HT
  const st = (ht: number): string => U.g(sansTvaSuivi(ht));
  // la base du variable (CA − commissions) et le taux s'appliquent au HT : en TTC, la base est écrite en HT
  const base = (ht: number): string => (U.u === 'ttc' ? `${euros(ht)} HT` : eur(ht));
  const [annee, m] = mois.split('-');
  const nomMois = mots.libelle ?? `${NOMS_MOIS[Number(m) - 1]} ${annee}`;
  const ligne = (cle: Cle | null, signe: string, mot: ReactNode, montant: string, detail: ReactNode, o: { fort?: boolean; attrs?: Record<string, string> } = {}) => (
    <div key={mot?.toString()} className={`fnc-ligne${o.fort ? ' fnc-ligne--fort' : ''}`} data-cascade-ligne={cle ?? 'taux'}>
      <div className="fnc-rangee">
        <span className="fnc-signe" aria-hidden="true">{signe}</span>
        <span className="fnc-mot">{mot}</span>
        {cle !== null && (
          <button type="button" className="fnc-i" aria-expanded={ouvert === cle} aria-controls={`${id}-${cle}`} data-cascade-info={cle} data-cascade-de={id}
            aria-label={`Détail du calcul : ${typeof mot === 'string' ? mot : cle}`} onClick={() => setOuvert((v) => (v === cle ? null : cle))}>
            <span className="fnc-i-pastille" aria-hidden="true">i</span></button>
        )}
        <span className="fnc-montant" {...(o.attrs ?? {})}>{montant}</span>
      </div>
      {cle !== null && ouvert === cle && <div id={`${id}-${cle}`} className="fnc-detail" data-cascade-detail={cle} data-cascade-de={id}>{detail}</div>}
    </div>
  );
  const liste = (lignes: ReactNode[]) => <ul className="fnc-liste">{lignes}</ul>;
  const tauxMot = x.taux === null ? 'taux selon date de signature' : pct(x.taux);
  const deduits = x.dossiers.filter((d) => d.deductions !== 0);
  return (
    <div className="fnc" data-cascade-negociateur={x.libelle}>
      {plusieurs && <p className="fdm-nego-nom">{x.libelle}</p>}
      {ligne('ca', '', U.mot('CA HT global'), eur(T.ca), <>
        <p className="fnc-op">Somme des {x.dossiers.length} dossier{x.dossiers.length > 1 ? 's' : ''} {mots.du} = {eur(T.ca)}</p>
        {liste(x.dossiers.map((d) => <li key={String(d.id)}><span>{d.libelle}</span><span>{eur(d.ca)}</span></li>))}</>)}
      {ligne('commissions', '−', `Commissions déduites (apporteurs et collègues, hors récurrent gestion)${SANS_TVA}`, eur(T.ded), <>
        <p className="fnc-op">Part location et part gestion « One shot » de l’apporteur, et ce qui est dû au collègue à la signature = {eur(T.ded)}</p>
        {deduits.length === 0 ? <p className="fnc-op">Aucune commission sur les dossiers {mots.du}.</p> : liste(deduits.map((d) => (
          <li key={String(d.id)}><span>{d.libelle}
            {d.partLocation !== 0 && <small>apporteur {d.apporteur ?? '—'} · part location {st(c(d.partLocation))}</small>}
            {d.gestionOneShot !== 0 && <small>apporteur {d.apporteur ?? '—'} · part gestion « One shot » {st(c(d.gestionOneShot))}</small>}
            {d.collegueSignature !== 0 && <small>collègue {d.collegue ?? '—'} · à la signature {st(c(d.collegueSignature))}</small>}
          </span><span>{st(c(d.deductions))}</span></li>)))}</>)}
      {ligne('net', '=', U.mot('CA HT net de commissions'), eur(T.net),
        <p className="fnc-op">{eur(T.ca)} − {eur(T.ded)} = {eur(T.net)}</p>, { attrs: { 'data-base-negociateur': x.libelle } })}
      {ligne(null, '×', x.taux === null ? `Taux commercial (${tauxMot})` : 'Taux commercial', x.taux === null ? '' : pct(x.taux), null)}
      {ligne('resultat', '=', `Résultat commercial${SANS_TVA}`, eur(T.resultat), <>
        <p className="fnc-op">Dossier par dossier : (CA − commissions déduites) × taux à la date de signature = {st(c(x.resultatCalcule))}</p>
        {x.taux !== null && <p className="fnc-op">{base(x.net)} × {pct(x.taux)} = {st(c(x.net * x.taux))}</p>}
        {liste(x.dossiers.map((d) => <li key={String(d.id)}><span>{d.libelle}<small>{base(c(d.base))} × {pct(d.taux)}</small></span><span>{st(c(d.resultat))}</span></li>))}</>)}
      {ligne('primes', '+', `Primes de gestion${SANS_TVA}`, eur(T.primes), <>
        <p className="fnc-op">Somme des primes des dossiers = {eur(T.primes)}</p>
        {x.dossiers.some((d) => d.prime !== 0) ? liste(x.dossiers.filter((d) => d.prime !== 0).map((d) => <li key={String(d.id)}><span>{d.libelle}</span><span>{st(d.prime)}</span></li>))
          : <p className="fnc-op">Aucune prime {mots.ceMoisCi}.</p>}</>, { attrs: plusieurs ? {} : { 'data-total': 'primes' } })}
      {x.retrocessions !== 0 && ligne('retrocessions', '−', `Rétrocessions${SANS_TVA}`, eur(T.retro), <>
        <p className="fnc-op">Somme des rétrocessions {mots.du} = {eur(T.retro)}</p>
        {liste(x.retroDetail.map((r, i) => <li key={i}><span>{r.libelle || 'Rétrocession'}</span><span>{st(r.montant)}</span></li>))}</>,
        { attrs: plusieurs ? {} : { 'data-total': 'retrocessions' } })}
      {ligne('variable', '=', `${U.mot('Variable HT dû')}${SANS_TVA} — ${nomMois}`, eur(T.variable),
        <p className="fnc-op">{eur(T.resultat)} + {eur(T.primes)}{x.retrocessions !== 0 ? ` − ${eur(T.retro)}` : ''} = {eur(T.variable)}</p>,
        { fort: true, attrs: { 'data-total-commission': x.libelle } })}
      {c(x.recurrents) !== 0 && <p className="fnc-info" data-recurrents-non-deduits>Commissions récurrentes de gestion versées {mots.ceMois} (non déduites) : {st(c(x.recurrents))}</p>}
    </div>
  );
}

/**
 * ══ 🔴 Arno (25/10/2026) — LE RÉSULTAT NET DE L'AGENCE DU MOIS, EN CASCADE, TOUT EN HT ═══════════════════════════════════════════════════
 * CA HT global − honoraires d'apporteurs − commissions collègues − variable des négociateurs (une ligne par négociateur s'il y en a plusieurs)
 * = CA net de toutes variables, et sa part du CA global. Les montants sont ceux DÉJÀ affichés (Résultat du mois, cascade du Négociateur) ;
 * le même style et les mêmes « i » que la cascade du Négociateur. Sans le droit « Voir les commissions » : ni variable, ni net.
 */
/**
 * 🔴 Arno (26/10/2026) — LA LIGNE REPLIÉE du « Résultat net de l'agence » : « CA net de toutes variables » + le montant (vert, gras) +
 * « (69,8 %) » — EXACTEMENT les chiffres de la ligne « = CA net de toutes variables » et de « soit … % du CA HT global » de la cascade.
 */
export function pctResultatNet(part: number): string {
  return `${(part * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
export function ResumeResultatNet({ x, dossiers }: { x: ResultatNetAgence;
  /** 🔴 LOT LO2 — les dossiers (leur CA) : le net dans l'unité du Suivi annuel ; absents : le net d'avant. */
  dossiers?: readonly { ca: number }[] }) {
  const U = useMontantSuivi();
  if (x.net === null) return null;
  return (
    <span className="fnc-replie" data-net-replie>
      <span className="fnc-replie-mot">CA net de toutes variables</span>{' '}
      <strong className="fnc-replie-montant" data-net-replie-montant>{dossiers === undefined ? eur(x.net / 100) : U.m(netEnUnite(x, dossiers))}</strong>
      {x.part !== null && <>{' '}<span className="fnc-replie-part" data-net-replie-part>({pctResultatNet(x.part)})</span></>}
    </span>
  );
}

export function CascadeResultatNet({ x, dossiers, mots = MOTS_MOIS }: { x: ResultatNetAgence; dossiers: { id: number | string; libelle: string; ca: number }[]; mots?: MotsPeriode }) {
  const { id, ouvert, setOuvert } = useInfoOuvert<string>();
  // 🔴 LOT LO2 — dans l'unité du Suivi annuel (sans unité : comme avant) : chaque montant affiché × 1,20 au centime ; le CA = la somme TTC des
  // dossiers ; le net = la différence des montants affichés (`netEnUnite`).
  const U = useMontantSuivi();
  // 🔴 LOT LO15 — le variable des négociateurs (et le récurrent des collègues) : sans TVA (TTC = HT)
  const e = (centimes: number): string => U.g(sansTvaSuivi(centimes / 100));
  // 🔴 LOT LO8 — une commission ventilée (ou un bénéficiaire) : HT et TTC de ses lignes
  const ev = (b: { centimes: number; ttcC?: number }): string => U.g({ ht: b.centimes / 100, ttcC: b.ttcC });
  const caT: MontantSuivi = { ht: x.ca / 100, ttcC: dossiers.reduce((t, d) => t + ttcCentimes(d.ca), 0) };
  const ligne = (cle: string | null, signe: string, mot: string, montant: string, detail: ReactNode, o: { fort?: boolean; attrs?: Record<string, string> } = {}) => (
    <div key={cle ?? mot} className={`fnc-ligne${o.fort ? ' fnc-ligne--fort' : ''}`} data-net-ligne={cle ?? 'part'}>
      <div className="fnc-rangee">
        <span className="fnc-signe" aria-hidden="true">{signe}</span>
        <span className="fnc-mot">{mot}</span>
        {cle !== null && (
          <button type="button" className="fnc-i" aria-expanded={ouvert === cle} aria-controls={`${id}-${cle}`} data-cascade-info={cle} data-cascade-de={id}
            aria-label={`Détail du calcul : ${mot}`} onClick={() => setOuvert((v) => (v === cle ? null : cle))}>
            <span className="fnc-i-pastille" aria-hidden="true">i</span></button>
        )}
        <span className="fnc-montant" {...(o.attrs ?? {})}>{montant}</span>
      </div>
      {cle !== null && ouvert === cle && <div id={`${id}-${cle}`} className="fnc-detail" data-cascade-detail={cle} data-cascade-de={id}>{detail}</div>}
    </div>
  );
  const liste = (lignes: ReactNode[]) => <ul className="fnc-liste">{lignes}</ul>;
  const sommeVariables = x.variables.reduce((s, y) => s + y.variable, 0);
  const plusieurs = x.variables.length > 1;
  const v = x.ventilation;
  /** Les bénéficiaires d'une ligne, chacun au centime comme ailleurs ; l'écart d'arrondi éventuel est écrit, jamais caché. */
  const beneficiaires = (b: { centimes: number; ttcC?: number; detail: { cle: string; nom: string; centimes: number; ttcC?: number }[] }, vide: string): ReactNode => {
    if (b.detail.length === 0) return <p className="fnc-op">{vide}</p>;
    // l'écart d'arrondi, dans l'unité : le total affiché − la somme des montants affichés
    const enU = (y: { centimes: number; ttcC?: number }): number => (U.u === 'ttc' ? y.ttcC ?? y.centimes : y.centimes);
    const ecart = enU(b) - b.detail.reduce((s, y) => s + enU(y), 0);
    return liste([...b.detail.map((y) => <li key={y.cle} data-beneficiaire={y.nom}><span>{y.nom}</span><span>{ev(y)}</span></li>),
      ...(ecart !== 0 ? [<li key="arrondi" data-arrondi><span>Arrondi au centime (somme des montants bruts)</span><span>{ecart > 0 ? '+' : '−'}{eur(Math.abs(ecart) / 100)}</span></li>] : [])]);
  };
  return (
    <div className="fnc" data-resultat-net>
      {ligne('ca', '', U.mot('CA HT global'), U.g(caT), <>
        <p className="fnc-op">Somme des {dossiers.length} dossier{dossiers.length > 1 ? 's' : ''} {mots.du} = {U.g(caT)}</p>
        {liste(dossiers.map((d) => <li key={String(d.id)}><span>{d.libelle}</span><span>{U.g(d.ca)}</span></li>))}</>, { attrs: { 'data-net': 'ca' } })}
      {/* 🔴 Arno (25/10/2026, suite) — les commissions VENTILÉES (externes, internes, collègues) ; chaque « i » liste ses bénéficiaires. */}
      {ligne('externes', '−', `Commissions apporteurs externes (sans accès à l’interface)${SANS_TVA}`, ev(v.externes), <>
        <p className="fnc-op">Parts location et gestion « One shot » à la signature, et part gestion « Récurrent » {mots.dueCeMois}, des apporteurs
          sans accès à l’interface = {ev(v.externes)}</p>
        {beneficiaires(v.externes, `Aucune commission d’apporteur externe ${mots.ceMoisCi}.`)}</>, { attrs: { 'data-net': 'externes' } })}
      {ligne('internes', '−', `Commissions apporteurs internes (collègues qui apportent en direct)${SANS_TVA}`, ev(v.internes), <>
        <p className="fnc-op">Les apporteurs liés à un compte et les collègues qui apportent en direct = {ev(v.internes)}</p>
        {beneficiaires(v.internes, `Aucune commission d’apporteur interne ${mots.ceMoisCi}.`)}</>, { attrs: { 'data-net': 'internes' } })}
      {ligne('collegues', '−', `Rémunération des collègues sur leurs apporteurs (rattachement rémunéré)${SANS_TVA}`, ev(v.collegues), <>
        <p className="fnc-op">Ce qui est dû aux collègues à la signature
          {x.colleguesRecurrents !== 0 ? `, et leur récurrent de gestion dû ${mots.ceMois} (${e(x.colleguesRecurrents)})` : ''} = {ev(v.collegues)}</p>
        {beneficiaires(v.collegues, `Aucune rémunération de collègue ${mots.ceMoisCi}.`)}</>, { attrs: { 'data-net': 'collegues' } })}
      {x.net !== null && (plusieurs
        ? x.variables.map((y) => ligne(`variable-${y.cle}`, '−', `Variable — ${y.libelle}${SANS_TVA}`, e(y.variable),
          <p className="fnc-op">Le « Variable HT dû » de la cascade de {y.libelle}, ci-dessous = {e(y.variable)}</p>, { attrs: { 'data-net-variable': y.libelle } }))
        : ligne('variables', '−', `Variable des négociateurs${SANS_TVA}`, e(sommeVariables), x.variables.length === 0
          ? <p className="fnc-op">Aucun négociateur {mots.ceMoisCi}.</p>
          : <p className="fnc-op">Le « {U.mot('Variable HT dû')} » de la cascade de {x.variables[0].libelle}, ci-dessous = {e(sommeVariables)}</p>,
        { attrs: x.variables.length === 1 ? { 'data-net-variable': x.variables[0].libelle } : {} }))}
      {x.net !== null && ligne('net', '=', 'CA net de toutes variables', U.g(netEnUnite(x, dossiers)),
        <p className="fnc-op">{U.g(caT)} − {ev(v.externes)} − {ev(v.internes)} − {ev(v.collegues)} − {plusieurs ? x.variables.map((y) => e(y.variable)).join(' − ') : U.g({ ht: sommeVariables / 100, ttcC: x.variables.reduce((s2, y) => s2 + sansTva(y.variable / 100).ttcC, 0) })} = {U.g(netEnUnite(x, dossiers))}</p>,
        { fort: true, attrs: { 'data-net': 'net' } })}
      {x.net !== null && x.part !== null && (
        <p className="fnc-info fnc-part" data-net-part>soit {pctResultatNet(x.part)} du {U.mot('CA HT global')}</p>)}
      {x.net === null && <p className="fnc-info" data-net-sans-droit>Variable et net réservés aux administrateurs</p>}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; chiffres tabulaires ; cibles de 44 px. */
export const CSS_CASCADE_NEGOCIATEUR = `
.fnc{display:flex;flex-direction:column}
.fnc-ligne{border-bottom:1px solid var(--color-svv-line)}
.fnc-rangee{display:flex;align-items:center;gap:8px;min-height:44px}
.fnc-signe{flex:0 0 1.2em;text-align:center;font-weight:800;color:var(--color-svv-muted)}
.fnc-mot{flex:1 1 auto;min-width:0;color:var(--color-svv-muted)}
.fnc-montant{flex:0 0 auto;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums;text-align:right;color:var(--color-svv-ink)}
.fnc-ligne--fort{border-top:2px solid var(--color-svv-ink);border-bottom:0}
.fnc-ligne--fort .fnc-mot,.fnc-ligne--fort .fnc-montant,.fnc-ligne--fort .fnc-signe{font-weight:800;color:var(--color-svv-ink);font-size:1.05rem}
.fnc-i{appearance:none;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;background:none;border:0;border-radius:999px;cursor:pointer;color:var(--color-svv-muted)}
.fnc-i-pastille{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;border:1px solid currentColor;font-size:.7rem;font-weight:800;font-style:italic;line-height:1;font-family:Georgia,serif}
.fnc-i:hover,.fnc-i[aria-expanded="true"]{color:var(--color-svv-red)}
.fnc-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.fnc-detail{margin:0 0 10px;padding:10px 12px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.86rem;line-height:1.45;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
.fnc-op{margin:0;font-variant-numeric:tabular-nums}
.fnc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.fnc-liste li{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px dashed var(--color-svv-line);padding-top:4px}
.fnc-liste li > span:first-child{display:flex;flex-direction:column;min-width:0}
.fnc-liste li > span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.fnc-liste small{color:var(--color-svv-muted);font-size:.78rem}
.fnc-info{margin:8px 0 0;font-size:.86rem;color:var(--color-svv-muted)}
.fnc-part{text-align:right;font-variant-numeric:tabular-nums}
/* 26/10/2026 — la ligne repliee : le CA net en vert, gras ; le pourcentage entre parentheses. */
.fnc-replie{display:inline-flex;flex-wrap:wrap;align-items:baseline;justify-content:flex-end;gap:2px 6px;font-variant-numeric:tabular-nums}
.fnc-replie-mot{color:var(--color-svv-muted);font-weight:600}
.fnc-replie-montant{color:var(--color-svv-green-ink);font-weight:800;white-space:nowrap}
.fnc-replie-part{color:var(--color-svv-muted);white-space:nowrap}
[data-famille="resultat-net"] .tdb-replie-mot{font-size:inherit}
[data-famille="resultat-net"] .fnc-ligne--fort{background:var(--color-svv-green-soft);border-radius:0 0 10px 10px;padding:0 8px;margin:0 -8px}
[data-famille="resultat-net"] .fnc-ligne--fort .fnc-mot,[data-famille="resultat-net"] .fnc-ligne--fort .fnc-montant{color:var(--color-svv-green-ink)}
`;
