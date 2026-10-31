'use client';

import { useState } from 'react';
import { eurAxe, margeAxe } from '../location/TableauBordSuivi';
import { COURT } from './commun';
import { NOMS_MOIS } from '../../../../lib/transaction/modele';

/**
 * ══ 🔴 LOT CU (Arno, 31/10/2026) — « MOIS PAR MOIS » DE 2 À 5 NÉGOCIATEURS : UNE SÉRIE PAR NÉGOCIATEUR ══════════════════════════════════════
 * Pas de série « année précédente » : une série par négociateur, chacune avec SA couleur (palette fixe de 5, variables `--trx-serie-1…5`, claire et
 * sombre ; la couleur suit l'ordre de sélection, la même en Mensuel et en Cumul). Mensuel : barres groupées, une par négociateur, dans chaque mois ;
 * Cumul : une courbe par négociateur. Légende sous le graphique (pastille + « Prénom NOM ») ; l'encart d'un mois survolé ou choisi : une ligne par
 * négociateur (couleur, nom, CA, nombre), puis l'ensemble de la sélection (chaque affaire une fois : les totaux de la page). Les valeurs viennent
 * des fonctions du mois (`caHtParMoisMode`, `nombreParMoisMode`) appliquées aux ventes de chaque négociateur : aucun calcul nouveau.
 */
export interface SerieGraphe { nom: string; couleur: number; ca: readonly number[]; nb: readonly number[] }
export const MAX_NEGOCIATEURS = 5;

const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);
const montant = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function GrapheNegociateurs({ series, total, totalN1 = null, cumul, nombre, dernierMois, choisi, onChoisir, motCa, motNb, aria, annee }: {
  series: readonly SerieGraphe[];
  /** L'ensemble de la sélection, mois par mois (chaque affaire une fois) : ce que comptent les tuiles et les listes de la page. */
  total: { ca: readonly number[]; nb: readonly number[] };
  /** 🔴 LOT DC — la même sélection l'année précédente (chaque affaire une fois), mois par mois ; null : année précédente non importée. */
  totalN1?: { ca: readonly number[]; nb: readonly number[]; annee: number } | null;
  cumul: boolean; nombre: boolean; dernierMois: number; choisi: number; onChoisir: (mois: number) => void;
  motCa: string; motNb: string; aria: string; annee: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [clic, setClic] = useState<number | null>(null);
  const L = 640; const H = 220; const m = { g: 56, d: 12, h: 18, b: 28 };
  const prepare = (xs: readonly number[]): number[] => (cumul ? cumuler(xs) : [...xs]);
  const s = series.map((x) => ({ ...x, caV: prepare(x.ca), nbV: prepare(x.nb) }));
  const t = { ca: prepare(total.ca), nb: prepare(total.nb) };
  const t1 = totalN1 === null ? null : { ca: prepare(totalN1.ca), nb: prepare(totalN1.nb) };
  const dessine = (x: { caV: number[]; nbV: number[] }): number[] => (nombre ? x.nbV : x.caV);
  const visibles = s.flatMap((x) => dessine(x).slice(0, dernierMois));
  const plusHaut = Math.max(0, ...visibles);
  // L'axe vide (toutes les valeurs à 0) : des graduations distinctes — 0 → 1 k€, ou 0 → 4 en nombre.
  const pasEntier = Math.max(1, Math.ceil(plusHaut / 4));
  const max = nombre ? pasEntier * 4 : plusHaut > 0 ? plusHaut : 1000;
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const etiquette = (v: number): string => (nombre ? Math.round(v).toLocaleString('fr-FR') : eurAxe(v));
  m.g = margeAxe(graduations.map(etiquette));
  const pas = (L - m.g - m.d) / 12;
  const y = (v: number): number => H - m.b - (v * (H - m.h - m.b)) / max;
  const largeur = (pas * 0.8) / Math.max(1, s.length);
  const x = (i: number): number => m.g + i * pas + pas / 2;
  // 🔴 LOT CV — le mois survolé, sinon le mois cliqué, sinon le repos : l'année en cours jusqu'au mois en cours, une année passée complète
  // (décembre), une année future (rien encore, à 0). Le titre cite toujours l'année du graphique ; un mois à venir : « — à venir », à 0.
  const repos = clic === null && survol === null;
  const mois = survol ?? clic ?? (dernierMois === 0 ? 12 : dernierMois);
  const aVenir = mois > dernierMois;
  const nomMois = NOMS_MOIS[mois - 1];
  const titre = repos
    ? (dernierMois === 0 ? (cumul ? `Cumul ${annee} — aucune vente` : `Janvier ${annee} — aucune vente`)
      : dernierMois === 12 ? (cumul ? `Cumul ${annee} — année complète` : `Décembre ${annee}`)
        : (cumul ? `Cumul ${annee} jusqu’à aujourd’hui` : `${nomMois} ${annee} — en cours`))
    : `${cumul ? `Cumul ${annee} à fin ${nomMois.toLowerCase()}` : `${nomMois} ${annee}`}${aVenir ? ' — à venir' : ''}`;
  const val = (xs: readonly number[]): number => (aVenir ? 0 : xs[mois - 1]);
  const ligne = (nom: string, couleur: number | null, ca: number, nb: number, cle: string) => (
    <p className="tdb-bulle-ligne trx-serie-ligne" key={cle} data-detail-serie={cle}>
      <span>{couleur !== null && <span className={`trx-pastille-serie trx-serie--${couleur}`} aria-hidden="true" />}{nom}</span>
      <span className="tdb-bulle-montant">{montant(ca)} · {nb}</span></p>
  );
  return (
    <figure className="tdb-courbe tdb-histo trx-graphe-negos" data-courbe={cumul ? 'negociateurs-cumul' : 'negociateurs'} data-series={s.length}>
      <div className="tdb-histo-rangee" data-histo-rangee>
        <div className="tdb-histo-graphe">
          <div className="tdb-histo-zone" onMouseLeave={() => setSurvol(null)}>
            <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={aria}>
              {graduations.map((g) => (
                <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
                  <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{etiquette(g)}</text></g>
              ))}
              {cumul && s.map((x0) => {
                const v = dessine(x0).slice(0, dernierMois);
                return v.length === 0 ? null : <path key={`trait-${x0.couleur}`} className={`trx-serie-trait trx-serie--${x0.couleur}`} data-trait-serie={x0.couleur}
                  d={v.map((w, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(' ')} />;
              })}
              {COURT.map((c, i) => (
                <g key={c} className="tdb-barre-annee" data-barre-mois={i + 1} onClick={() => { setClic(i + 1); onChoisir(i + 1); }} onMouseEnter={() => setSurvol(i + 1)}>
                  <rect x={m.g + i * pas} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-barre-zone" />
                  {i < dernierMois && s.map((x0, j) => {
                    const v = dessine(x0)[i];
                    return cumul
                      ? <circle key={x0.couleur} cx={x(i)} cy={y(v)} r={i + 1 === choisi ? 4.5 : 3} className={`trx-serie-point trx-serie--${x0.couleur}`} data-point-serie={x0.couleur} data-valeur={v} />
                      : <rect key={x0.couleur} x={m.g + i * pas + pas * 0.1 + j * largeur} y={y(Math.max(v, 0))} width={largeur} height={Math.abs(y(0) - y(v))}
                        className={`trx-serie-barre trx-serie--${x0.couleur}`} data-barre-serie={x0.couleur} data-valeur={v} />;
                  })}
                  <text x={x(i)} y={H - 8} textAnchor="middle" className={i + 1 === choisi ? 'tdb-axe tdb-axe--fort' : 'tdb-axe'}>{c}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
        <div className="tdb-histo-detail" data-histo-detail aria-live="polite">
          <div className="tdb-bulle tdb-bulle--sous" data-bulle="sous">
            <p className="tdb-bulle-titre" data-titre-detail>{titre}</p>
            <p className="tdb-bulle-ligne trx-serie-entete"><span /><span className="tdb-bulle-montant">{motCa} · {motNb}</span></p>
            {s.map((x0) => ligne(x0.nom, x0.couleur, val(x0.caV), val(x0.nbV), String(x0.couleur)))}
            <p className="tdb-bulle-pied" data-detail-ensemble><span>Ensemble de la sélection</span>
              <span className="tdb-bulle-montant">{montant(val(t.ca))} · {val(t.nb)}</span></p>
            {/* 🔴 LOT DC — sous l'ensemble : la même sélection l'année précédente (même mois, ou même cumul) et l'écart. */}
            {t1 !== null && totalN1 !== null && (() => {
              const n1 = t1.ca[mois - 1]; const ecart = val(t.ca) - n1;
              return <>
                <p className="tdb-bulle-ligne trx-serie-n1" data-detail-ensemble-n1><span>{totalN1.annee}</span><span className="tdb-bulle-montant">{montant(n1)} · {t1.nb[mois - 1]}</span></p>
                <p className="tdb-bulle-ligne" data-detail-ensemble-ecart><span>Écart</span>
                  <span className={`tdb-bulle-montant tdb-signe tdb-signe--${ecart > 0 ? 'positif' : ecart < 0 ? 'negatif' : 'nul'}`}>{ecart > 0 ? '+' : ecart < 0 ? '−' : ''}{montant(Math.abs(ecart))}{n1 === 0 ? '' : ` (${ecart >= 0 ? '+' : '−'}${Math.abs((ecart / n1) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`}</span></p>
              </>;
            })()}
            <p className="loc-muet trx-serie-note">Une affaire de deux négociateurs choisis compte dans leurs deux lignes, une fois dans l’ensemble.</p>
          </div>
        </div>
        <figcaption className="tdb-histo-legende trx-legende-series" data-legende-series>
          {s.map((x0) => <span key={x0.couleur} className="trx-legende-serie" data-legende-serie={x0.couleur}>
            <span className={`trx-pastille-serie trx-serie--${x0.couleur}`} aria-hidden="true" />{x0.nom}</span>)}
        </figcaption>
      </div>
    </figure>
  );
}
