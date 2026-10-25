'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { CascadeNegociateur } from '../../../../lib/location/suivi/tableauBord';
import { NOMS_MOIS } from '../../../../lib/location/suivi/tableauBord';

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (x: number): string => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
/** Un montant au centime, comme à l'affichage (les opérations des « i » sont faites sur les montants AFFICHÉS). */
const c = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

type Cle = 'ca' | 'commissions' | 'net' | 'resultat' | 'primes' | 'retrocessions' | 'variable';

/**
 * ══ 🔴 Arno (25/10/2026) — LE VARIABLE DU NÉGOCIATEUR, EN CASCADE (une ligne = une opération), TOUT EN HT ═══════════════════════════════════
 * CA HT global − commissions déduites (apporteurs et collègues, hors récurrent de gestion) = CA HT net de commissions ; × taux commercial
 * (à la date de signature de chaque dossier) = résultat commercial ; + primes de gestion ; − rétrocessions (seulement si ≠ 0) = variable
 * HT dû. Un « i » sur chaque ligne de calcul : le détail se déplie DANS l'encadré, sous la ligne (l'opération avec les vrais chiffres et,
 * pour une somme, ses composants dossier par dossier) ; un seul ouvert ; second clic, clic ailleurs ou Échap le referment.
 */
export function CascadeNegociateurMois({ x, mois, plusieurs }: { x: CascadeNegociateur; mois: string; plusieurs: boolean }) {
  const id = useId();
  const [ouvert, setOuvert] = useState<Cle | null>(null);
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
  const [annee, m] = mois.split('-');
  const nomMois = `${NOMS_MOIS[Number(m) - 1]} ${annee}`;
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
      {ligne('ca', '', 'CA HT global', eur(x.ca), <>
        <p className="fnc-op">Somme des {x.dossiers.length} dossier{x.dossiers.length > 1 ? 's' : ''} du mois = {eur(x.ca)}</p>
        {liste(x.dossiers.map((d) => <li key={String(d.id)}><span>{d.libelle}</span><span>{eur(d.ca)}</span></li>))}</>)}
      {ligne('commissions', '−', 'Commissions déduites (apporteurs et collègues, hors récurrent gestion)', eur(x.deductions), <>
        <p className="fnc-op">Part location et part gestion « One shot » de l’apporteur, et ce qui est dû au collègue à la signature = {eur(x.deductions)}</p>
        {deduits.length === 0 ? <p className="fnc-op">Aucune commission sur les dossiers du mois.</p> : liste(deduits.map((d) => (
          <li key={String(d.id)}><span>{d.libelle}
            {d.partLocation !== 0 && <small>apporteur {d.apporteur ?? '—'} · part location {eur(c(d.partLocation))}</small>}
            {d.gestionOneShot !== 0 && <small>apporteur {d.apporteur ?? '—'} · part gestion « One shot » {eur(c(d.gestionOneShot))}</small>}
            {d.collegueSignature !== 0 && <small>collègue {d.collegue ?? '—'} · à la signature {eur(c(d.collegueSignature))}</small>}
          </span><span>{eur(c(d.deductions))}</span></li>)))}</>)}
      {ligne('net', '=', 'CA HT net de commissions', eur(x.net),
        <p className="fnc-op">{eur(x.ca)} − {eur(x.deductions)} = {eur(x.net)}</p>, { attrs: { 'data-base-negociateur': x.libelle } })}
      {ligne(null, '×', x.taux === null ? `Taux commercial (${tauxMot})` : 'Taux commercial', x.taux === null ? '' : pct(x.taux), null)}
      {ligne('resultat', '=', 'Résultat commercial', eur(x.resultat), <>
        <p className="fnc-op">Dossier par dossier : (CA − commissions déduites) × taux à la date de signature = {eur(c(x.resultatCalcule))}</p>
        {x.taux !== null && <p className="fnc-op">{eur(x.net)} × {pct(x.taux)} = {eur(c(x.net * x.taux))}</p>}
        {liste(x.dossiers.map((d) => <li key={String(d.id)}><span>{d.libelle}<small>{eur(c(d.base))} × {pct(d.taux)}</small></span><span>{eur(c(d.resultat))}</span></li>))}</>)}
      {ligne('primes', '+', 'Primes de gestion', eur(x.primes), <>
        <p className="fnc-op">Somme des primes des dossiers = {eur(x.primes)}</p>
        {x.dossiers.some((d) => d.prime !== 0) ? liste(x.dossiers.filter((d) => d.prime !== 0).map((d) => <li key={String(d.id)}><span>{d.libelle}</span><span>{eur(d.prime)}</span></li>))
          : <p className="fnc-op">Aucune prime ce mois-ci.</p>}</>, { attrs: plusieurs ? {} : { 'data-total': 'primes' } })}
      {x.retrocessions !== 0 && ligne('retrocessions', '−', 'Rétrocessions', eur(x.retrocessions), <>
        <p className="fnc-op">Somme des rétrocessions du mois = {eur(x.retrocessions)}</p>
        {liste(x.retroDetail.map((r, i) => <li key={i}><span>{r.libelle || 'Rétrocession'}</span><span>{eur(r.montant)}</span></li>))}</>,
        { attrs: plusieurs ? {} : { 'data-total': 'retrocessions' } })}
      {ligne('variable', '=', `Variable HT dû — ${nomMois}`, eur(x.variable),
        <p className="fnc-op">{eur(x.resultat)} + {eur(x.primes)}{x.retrocessions !== 0 ? ` − ${eur(x.retrocessions)}` : ''} = {eur(x.variable)}</p>,
        { fort: true, attrs: { 'data-total-commission': x.libelle } })}
      {c(x.recurrents) !== 0 && <p className="fnc-info" data-recurrents-non-deduits>Commissions récurrentes de gestion versées ce mois (non déduites) : {eur(c(x.recurrents))}</p>}
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
`;
