'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { celluleGlobalAnnees, type EntreesGlobalUnite } from '../../../../lib/transaction/globalUnite';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { aSaisirFusion } from '../../../../lib/transaction/fusionLocationGestion';
import { NOMS_MOIS } from '../../../../lib/transaction/modele';
import { moisADate } from '../../../../lib/transaction/periodeAnnees';
import {
  ACTIVITES_GRAPHE, atomesDesMois, atomesDuPoint, avecReunies, COMPARER_GRAPHE, FAMILLES_GRAPHE, FILTRES_GRAPHE_DEFAUT, filtresDepuisAdresse, filtresVersAdresse, MESURES_GRAPHE, nbFiltresActifs,
  raisonGrise, seriesDuPoint, STRUCTURES_GRAPHE, type FiltresGraphe, type SerieValeur,
} from '../../../../lib/transaction/grapheGlobal';
import { attributBarresRouges, COURT, ecrireAdresse, eur, MOT_UNITE, parametre, StyleBarresRouges, useAffichage } from './commun';
import { ordreEncadre } from './GrapheNegociateurs';
import { AucuneDonnee, CourbeCumul, eurAxe, HAUSSE_TRACE, Histogramme, margeAxe, PAS_ANNEE_FIXE, type InfoBarre } from '../location/TableauBordSuivi';
import { cumuler } from '../../../../lib/transaction/cumul'; // 🔴 LOT 8 — le cumul, une seule fois (il était recopié ici)

/**
 * ══ 🔴 LOT CG9 (Arno) — LE GRAPHIQUE DU CA GLOBAL, SOUS LES TUILES ═══════════════════════════════════════════════════════════════════════════════
 * Les filtres par famille (Mesure, Coûts, Structure, Activité, Comparer, Affichage), dans un panneau compact ; repris dans l'adresse et retenus pendant
 * la visite ; « Réinitialiser les filtres ». Les valeurs : les cellules du Bilan (`atomesDuPoint`, aucune copie de calcul), dans l'unité (HT | TTC) et
 * selon « Avec | Sans salaires ». Une seule série (Année précédente, Rien) : les MÊMES composants que les autres pages (`Histogramme`, `CourbeCumul` :
 * N−1 hachuré, point choisi en rouge, encadré à droite) ; plusieurs séries : barres empilées ou côte à côte (Cumul : une courbe par série), couleurs
 * fixes et légende. « Année » : les 12 mois ; « Période » / « Tout » : une barre par année.
 */
export function GrapheGlobal({ eG, eC, jour, annee, annees, salaires, rouges = null }: {
  eG: EntreesGlobalUnite; eC: EntreesCoutsGlobaux; jour: string;
  /** L'année montrée (« Année ») ; `annees` : null en « Année », sinon les années choisies (« Période », « Tout ») — l'axe année par année. */
  annee: number; annees: readonly number[] | null; salaires: boolean;
  /** Arno (01/11/2026) — les barres en rouge : les années soulignées (« Période », « Tout ») ou les mois écoulés de l'année montrée (« Année ») ;
   *  null : la barre courante seule. Une seule série seulement (plusieurs séries : leurs couleurs fixes). */
  rouges?: readonly number[] | null;
}) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC'; const ka = u === 'ht' ? 'ttcC' : 'htC';
  const [f, setF] = useState<FiltresGraphe>(() => filtresDepuisAdresse(parametre));
  useEffect(() => { ecrireAdresse(filtresVersAdresse(f)); }, [f]);
  const [ouvert, setOuvert] = useState(false);
  const changer = (x: Partial<FiltresGraphe>): void => setF((v) => ({ ...v, ...x }));
  const basculer = <T extends string>(liste: readonly T[], c: T): T[] => (liste.includes(c) ? liste.filter((x) => x !== c) : [...liste, c]);
  // les points : les 12 mois de l'année, ou une année par point ; N−1 : les mêmes, un an plus tôt
  const parAnnees = annees !== null;
  const base = parAnnees ? annees.map((a) => ({ cle: a, libelle: String(a), annee: a, mois: null as number | null, horsMois: false }))
    : Array.from({ length: 12 }, (_, i) => ({ cle: i + 1, libelle: COURT[i], annee, mois: i + 1 as number | null, horsMois: false }));
  const clePoints = parAnnees ? annees.join(',') : String(annee);
  const atomes = useMemo(() => {
    if (parAnnees) return { xs: base.map((p) => ({ courant: atomesDuPoint(eG, eC, p.annee, p.mois, salaires), n1: atomesDuPoint(eG, eC, p.annee - 1, p.mois, salaires) })), hors: null };
    // 🔴 LOT CG11 / CG12 — mois par mois : les 12 mois, puis « Mois à confirmer » (les ventes signées sans mois) ; l'écart d'arrondi au centime,
    // reporté sur le dernier mois affiché (plus de point « arrondi ») : la fin d'année = le total de l'année
    const c = atomesDesMois(eG, eC, annee, salaires, moisADate(annee, jour)); const p = atomesDesMois(eG, eC, annee - 1, salaires, 12);
    return { xs: c.mois.map((x, i) => ({ courant: x, n1: p.mois[i] })), hors: { courant: c.aConfirmer, n1: p.aConfirmer } };
  },
    // les données de la page (stables d'un rendu à l'autre), pas les objets d'entrée recréés à chaque rendu
    [eG.ventes, eG.gestion, eG.location, eC.retrocessions, eC.location, salaires, clePoints, jour]); // eslint-disable-line react-hooks/exhaustive-deps
  const valsBase = atomes.xs.map((x) => ({ c: seriesDuPoint(x.courant, f), n1: seriesDuPoint(x.n1, f) }));
  const valHors = atomes.hors === null ? null : { c: seriesDuPoint(atomes.hors.courant, f), n1: seriesDuPoint(atomes.hors.n1, f) };
  const nonNul = (s: { total: MontantC; series: readonly SerieValeur[] }): boolean => s.total[k] !== 0 || s.series.some((x) => x.m[k] !== 0);
  // présent seulement quand il est non nul (l'année montrée ; ou N−1 quand on la compare)
  const avecHors = valHors !== null && (nonNul(valHors.c) || (f.comparer === 'n1' && nonNul(valHors.n1)));
  const points = avecHors ? [...base, { cle: 13, libelle: 'à conf.', annee, mois: null as number | null, horsMois: true }] : base;
  const vals = avecHors && valHors !== null ? [...valsBase, valHors] : valsBase;
  const dernier = parAnnees ? points.length : moisADate(annee, jour);
  const anneeEnCours = Number(jour.slice(0, 4));
  const aVenir = (i: number): boolean => (parAnnees ? points[i].annee > anneeEnCours : !points[i].horsMois && i + 1 > dernier);
  const [choisi, setChoisi] = useState<number | null>(null);
  // au repos en Cumul, la fin d'année (mois à confirmer compris) quand le point existe : elle égale la tuile de l'année
  const repos = parAnnees ? annee : avecHors && f.cumul ? 13 : Math.max(1, dernier === 0 ? 1 : dernier);
  const courante = choisi !== null && points.some((p) => p.cle === choisi) ? choisi : repos;
  const motMesure = `${MESURES_GRAPHE.find((m) => m.cle === f.mesure)!.mot.replace(' (CA − coûts)', '')} ${MOT_UNITE[u]}`;
  const seule = f.comparer === 'n1' || f.comparer === 'rien';
  const en = (m: MontantC): number => m[k] / 100;
  /** Les mentions d'un point : les mois de salaires à saisir (la règle des pages Location et Gestion). 🔴 LOT CG10 — les ventes à attribuer ne sont
   *  plus comptées : la mention sous le graphique dit leur montant. */
  const mentions = (i: number, jusqua: boolean): string | undefined => {
    const idx = (jusqua && !parAnnees ? Array.from({ length: i + 1 }, (_, j) => j) : [i]).filter((j) => !points[j].horsMois);
    const ms = idx.flatMap((j) => (points[j].mois === null ? Array.from({ length: 12 }, (_, m) => ({ annee: points[j].annee, mois: m + 1 })) : [{ annee: points[j].annee, mois: points[j].mois as number }]));
    const loc = f.activites.includes('location'); const ges = f.activites.includes('gestion');
    const saisir = salaires && f.mesure !== 'ca' && (loc || ges) && ms.length > 0 ? aSaisirFusion(eC.gestion, eC.location?.salaires ?? null, ms, loc && ges ? 'deux' : loc ? 'location' : 'gestion', jour).mot : '';
    const hors = points[i].horsMois ? 'Ventes signées sans mois (« mois à confirmer ») : comptées dans l’année, dans aucun mois.' : '';
    const mots = [hors, saisir].filter((x) => x !== '');
    return mots.length === 0 ? undefined : mots.join(' ');
  };
  const titreDe = (i: number, c: boolean): string => {
    const p = points[i];
    if (parAnnees) return c ? `Cumul ${points[0].annee} → ${p.annee}` : `${p.annee}${p.annee === anneeEnCours ? ' — en cours' : ''}`;
    if (p.horsMois) return c ? `Cumul ${annee} — fin d’année (mois à confirmer compris)` : `Mois à confirmer ${annee}`;
    return `${c ? `Cumul ${annee} à fin ${NOMS_MOIS[i].toLowerCase()}` : `${NOMS_MOIS[i]} ${annee}`}${aVenir(i) ? ' — à venir' : ''}`;
  };
  const libN1 = parAnnees ? 'Un an plus tôt' : String(annee - 1);
  const [survol, setSurvol] = useState<number | null>(null);
  const horsAttribuer = celluleGlobalAnnees(eG, parAnnees ? annees : [annee], u).aAttribuerHt;
  const graphe = seule ? grapheUneSerie() : grapheSeries();
  // Arno (01/11/2026) — les barres en rouge (la règle partagée) ; mois par mois, « Mois à confirmer » appartient à l'année : en rouge avec ses mois
  const rougesVus = !seule || rouges === null ? null : !parAnnees && avecHors && rouges.length > 0 ? [...rouges, 13] : rouges;
  const attributBarre = parAnnees ? 'data-barre-annee-global' : 'data-barre-mois-global';

  /** Une seule série : `Histogramme` (Mensuel) et `CourbeCumul` (Cumul), les composants des autres pages. */
  function grapheUneSerie(): ReactNode {
    const v = vals.map((x) => en(x.c.total)); const v1 = vals.map((x) => en(x.n1.total));
    const autre = vals.map((x) => x.c.total[ka] / 100); const autre1 = vals.map((x) => x.n1.total[ka] / 100);
    const avecN1 = f.comparer === 'n1';
    const info = (i: number, c: boolean): InfoBarre => {
      const s = (xs: readonly number[]): number => (c ? cumuler(xs)[i] : xs[i]);
      return { titre: titreDe(i, c), motCa: motMesure, sansNombre: true, sansN1: avecN1 ? `${libN1} : —` : 'Comparaison : aucune', note: mentions(i, c),
        autre: { mot: MOT_UNITE[u === 'ht' ? 'ttc' : 'ht'], facteur: 1 },
        courant: { libelle: parAnnees ? points[i].libelle : String(annee), ca: aVenir(i) ? null : s(v), nb: null, caAutre: s(autre) },
        precedent: avecN1 ? { libelle: parAnnees ? String(points[i].annee - 1) : libN1, ca: s(v1), nb: null, caAutre: s(autre1) } : null };
    };
    const attribut = parAnnees ? 'data-barre-annee-global' : 'data-barre-mois-global';
    if (f.cumul) {
      return <CourbeCumul courant={cumuler(v).map((x, j) => (aVenir(j) ? null : x)).slice(0, avecHors ? 13 : dernier)} n1={avecN1 ? cumuler(v1) : null} annee={annee} selection={courante} aria={`${motMesure} cumulé`}
        bulle={(cle) => info(points.findIndex((p) => p.cle === cle), true)} onChoisir={setChoisi} repos={info(points.findIndex((p) => p.cle === courante), true)}
        {...(parAnnees ? { etiquettes: points.map((p) => p.libelle), cles: points.map((p) => p.cle), nom: 'global-annees-cumul', attributZone: 'data-annee-cumul-global' }
          : { nom: 'global-mois-cumul', attributZone: 'data-mois-cumul-global', ...(avecHors ? { etiquettes: points.map((p) => p.libelle), cles: points.map((p) => p.cle) } : {}) })} />;
    }
    return <Histogramme attribut={attribut} courante={courante} onChoisir={setChoisi} aria={`${motMesure} par ${parAnnees ? 'année' : 'mois'}`}
      repos={info(points.findIndex((p) => p.cle === courante), false)} {...(parAnnees ? { pasFixe: PAS_ANNEE_FIXE } : {})}
      legende={{ courant: parAnnees ? 'les années choisies' : String(annee), n1: avecN1 ? (parAnnees ? 'un an plus tôt' : String(annee - 1)) : null }}
      barres={points.map((p, i) => ({ cle: p.cle, libelle: p.libelle, valeur: aVenir(i) ? null : v[i], ...(avecN1 ? { n1: v1[i] } : {}), info: info(i, false) }))} />;
  }

  /** Plusieurs séries : barres empilées ou côte à côte (Cumul : une courbe par série) ; couleurs fixes, légende, encadré à droite. */
  function grapheSeries(): ReactNode {
    const series0 = vals[0]?.c.series ?? [];
    const valeursTout = series0.map((s0, j) => { const xs = vals.map((x) => en(x.c.series[j]?.m ?? { htC: 0, ttcC: 0 })); return f.cumul ? cumuler(xs) : xs; });
    const totaux = f.cumul ? cumuler(vals.map((x) => en(x.c.total))) : vals.map((x) => en(x.c.total));
    const totauxAutre = f.cumul ? cumuler(vals.map((x) => x.c.total[ka] / 100)) : vals.map((x) => x.c.total[ka] / 100);
    const n = points.length; const trace = (x: number): boolean => !aVenir(x);
    // 🔴 LOT CG12 (Arno) — une série dont toutes les valeurs de la période valent 0 : ni tracée ni dans la légende ; aucune : le message
    const garde = valeursTout.map((xs) => xs.some((v, x) => trace(x) && v !== 0));
    const lignes: SerieValeur[] = series0.filter((_, j) => garde[j]);
    const valeurs = valeursTout.filter((_, j) => garde[j]);
    if (lignes.length === 0) return <AucuneDonnee courbe="global-series" />;
    // 🔴 LOT CG12 — la zone de tracé : +15 % de hauteur (186 → 213,9 unités)
    const L = 640; const m = { g: 56, d: 12, h: 16, b: 28 }; const H = m.h + m.b + 186 * HAUSSE_TRACE;
    const hauts: number[] = []; const bas: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!trace(i)) continue;
      const xs = valeurs.map((s) => s[i]);
      if (f.empile && !f.cumul) { hauts.push(xs.filter((x) => x > 0).reduce((t, x) => t + x, 0)); bas.push(xs.filter((x) => x < 0).reduce((t, x) => t + x, 0)); }
      else { hauts.push(Math.max(0, ...xs)); bas.push(Math.min(0, ...xs)); }
    }
    const max0 = Math.max(0, ...hauts); const min = Math.min(0, ...bas); const max = max0 === 0 && min === 0 ? 1000 : max0;
    const graduations = [0, 0.25, 0.5, 0.75, 1].map((q) => min + q * (max - min));
    m.g = margeAxe(graduations.map(eurAxe));
    const pas = (L - m.g - m.d) / n;
    const y = (v: number): number => H - m.b - ((v - min) * (H - m.h - m.b)) / (max - min || 1);
    const iC = points.findIndex((p) => p.cle === courante);
    const i = survol ?? iC;
    const largeurCote = (pas * 0.8) / Math.max(1, valeurs.length);
    return (
      <figure className="tdb-courbe tdb-histo trx-graphe-global-series" data-graphe-global-series={f.empile && !f.cumul ? 'empile' : f.cumul ? 'cumul' : 'cote'} data-series={lignes.length}>
        <div className="tdb-histo-rangee" data-histo-rangee>
          <div className="tdb-histo-graphe">
            <div className="tdb-histo-zone" onMouseLeave={() => setSurvol(null)}>
              <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`${motMesure} — ${COMPARER_GRAPHE.find((c) => c.cle === f.comparer)!.mot}`}>
                {graduations.map((g) => <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
                  <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{eurAxe(g)}</text></g>)}
                {f.cumul && lignes.map((s, j) => <path key={s.cle} className={`trx-serie-trait trx-serie--${s.couleur}`} data-trait-serie={s.cle}
                  d={valeurs[j].flatMap((w, x) => (trace(x) ? [{ w, x }] : [])).map(({ w, x }, q) => `${q === 0 ? 'M' : 'L'}${(m.g + x * pas + pas / 2).toFixed(1)},${y(w).toFixed(1)}`).join(' ')} />)}
                {points.map((p, x) => {
                  let haut = 0; let creux = 0;
                  return (
                    <g key={p.cle} data-point-global={p.cle} onClick={() => setChoisi(p.cle)} onMouseEnter={() => setSurvol(x)}>
                      <rect x={m.g + x * pas} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-barre-zone" />
                      {trace(x) && lignes.map((s, j) => {
                        const v = valeurs[j][x];
                        if (f.cumul) return <circle key={s.cle} cx={m.g + x * pas + pas / 2} cy={y(v)} r={p.cle === courante ? 4.5 : 3} className={`trx-serie-point trx-serie--${s.couleur}`} data-point-serie={s.cle} data-valeur={v} />;
                        if (f.empile) {
                          const de = v >= 0 ? haut : creux; const a = de + v; if (v >= 0) haut = a; else creux = a;
                          return <rect key={s.cle} x={m.g + x * pas + pas * 0.18} y={y(Math.max(de, a))} width={pas * 0.64} height={Math.abs(y(de) - y(a))}
                            className={`trx-serie-barre trx-serie--${s.couleur}`} data-barre-serie={s.cle} data-valeur={v} />;
                        }
                        return <rect key={s.cle} x={m.g + x * pas + pas * 0.1 + j * largeurCote} y={y(Math.max(v, 0))} width={largeurCote} height={Math.abs(y(0) - y(v))}
                          className={`trx-serie-barre trx-serie--${s.couleur}`} data-barre-serie={s.cle} data-valeur={v} />;
                      })}
                      <text x={m.g + x * pas + pas / 2} y={H - 8} textAnchor="middle" className={`${p.cle === courante ? 'tdb-axe tdb-axe--fort trx-axe-choisi' : 'tdb-axe'}${p.horsMois ? ' trx-axe-hors-mois' : ''}`}>{p.libelle}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="tdb-histo-detail" data-histo-detail aria-live="polite">
            <div className="tdb-bulle tdb-bulle--sous" data-bulle="sous">
              <p className="tdb-bulle-titre" data-titre-detail>{i >= 0 ? `${titreDe(i, f.cumul)} (${MOT_UNITE[u]})` : ''}</p>
              {i >= 0 && mentions(i, f.cumul) !== undefined && <p className="tdb-bulle-note" data-bulle-note>{mentions(i, f.cumul)}</p>}
              {/* 🔴 LOT CG11 — les lignes par valeur DÉCROISSANTE au point montré (repos, survol, clic), égalité : alphabétique ; Total en bas */}
              {/* 🔴 LOT CG12 — seulement les lignes non nulles au point montré (les négatives restent) */}
              {ordreEncadre(lignes.map((s, j) => ({ ...s, ca: i >= 0 && !aVenir(i) ? valeurs[j][i] : 0, nb: 0 })), false).filter((s) => s.ca !== 0).map((s) => <p key={s.cle} className="tdb-bulle-ligne trx-serie-ligne" data-detail-serie={s.cle}>
                <span><span className={`trx-pastille-serie trx-serie--${s.couleur}`} aria-hidden="true" />{s.nom}</span>
                <span className="tdb-bulle-montant">{i >= 0 && !aVenir(i) ? eur(s.ca) : '—'}</span></p>)}
              <p className="tdb-bulle-pied" data-detail-total-global><span>Total</span>
                <span className="tdb-bulle-montant">{i >= 0 && !aVenir(i) ? <>{eur(totaux[i])} <small className="tdb-bulle-autre">({eur(totauxAutre[i])} {MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})</small></> : '—'}</span></p>
            </div>
          </div>
          <figcaption className="tdb-histo-legende trx-legende-series" data-legende-series>
            {lignes.map((s) => <span key={s.cle} className="trx-legende-serie" data-legende-serie={s.cle}>
              <span className={`trx-pastille-serie trx-serie--${s.couleur}`} aria-hidden="true" />{s.nom}</span>)}
          </figcaption>
        </div>
      </figure>
    );
  }

  // ── le panneau des filtres ──
  const choix = <T extends string>(famille: string, options: readonly { cle: T; mot: string }[], valeur: T, onChange: (c: T) => void, grise: (c: T) => string | null = () => null) => (
    <div className="trx-unites trx-gf-choix" role="group" aria-label={famille} data-filtre-graphe={famille}>
      {options.map((o) => { const r = grise(o.cle); return (
        <button key={o.cle} type="button" className="trx-unite" aria-pressed={valeur === o.cle} disabled={r !== null} title={r ?? undefined}
          onClick={() => onChange(o.cle)} data-choix-graphe={o.cle}>{o.mot}</button>); })}
    </div>
  );
  const cases = <T extends string>(famille: string, options: readonly { cle: T; mot: string }[], valeurs: readonly T[], onChange: (xs: T[]) => void, grise: (c: T) => string | null) => (
    <div className="trx-gf-cases" role="group" aria-label={famille} data-filtre-graphe={famille}>
      {options.map((o) => { const r = grise(o.cle); return (
        <label key={o.cle} className={`trx-gf-case${r !== null ? ' trx-gf-case--grise' : ''}`} title={r ?? undefined}>
          <input type="checkbox" checked={valeurs.includes(o.cle)} disabled={r !== null} onChange={() => onChange(basculer(valeurs, o.cle))} data-case-graphe={o.cle} />{o.mot}</label>); })}
    </div>
  );
  const famille = (titre: string, contenu: ReactNode, cle: string) => <div className="trx-gf-famille" data-famille-filtre={cle}><span className="trx-gf-titre">{titre}</span>{contenu}</div>;
  const nb = nbFiltresActifs(f);
  return (
    <section className="tdb-section trx-graphe-global" aria-labelledby="trx-g-graphe" data-bloc="global-graphe" {...(avecHors ? { 'data-mois-hors': 'a-confirmer' } : {})}
      {...attributBarresRouges('data-rouges-global', rougesVus)}>
      <StyleBarresRouges marque="data-rouges-global" attribut={attributBarre} cles={rougesVus} />
      <style>{CSS_GRAPHE_GLOBAL}</style>
      <div className="trx-gf-tete">
        <h3 id="trx-g-graphe">{parAnnees ? 'Année par année' : `Mois par mois — ${annee}`} <small className="loc-muet">({motMesure}{f.cumul ? ', cumulé' : ''}{f.mesure !== 'ca' ? ` ; ${salaires ? 'avec salaires' : 'hors salaires'}` : ''})</small></h3>
        <button type="button" className="trx-gf-bascule" aria-expanded={ouvert} aria-controls="trx-gf-panneau" onClick={() => setOuvert((o) => !o)} data-filtres-graphe-bouton>
          Filtres ({nb} actif{nb > 1 ? 's' : ''})</button>
      </div>
      <div id="trx-gf-panneau" className={`trx-gf-panneau${ouvert ? ' trx-gf-panneau--ouvert' : ''}`} data-filtres-graphe>
        {famille('Mesure', choix('Mesure', MESURES_GRAPHE, f.mesure, (c) => changer({ mesure: c, comparer: c !== 'couts' && f.comparer === 'familles' ? 'n1' : f.comparer })), 'mesure')}
        {f.mesure === 'couts' && famille('Coûts', <>{cases('Coûts', FAMILLES_GRAPHE, f.familles, (xs) => changer({ familles: xs }), (c) => raisonGrise(f, { sorte: 'famille', cle: c }))}
          <span className="trx-gf-tout"><button type="button" className="trx-bouton-lien" onClick={() => changer({ familles: FAMILLES_GRAPHE.map((x) => x.cle) })} data-familles-tout>Tout</button>
            {' / '}<button type="button" className="trx-bouton-lien" onClick={() => changer({ familles: [] })} data-familles-aucun>Aucun</button></span></>, 'couts')}
        {famille('Structure', cases('Structure', STRUCTURES_GRAPHE, f.structures, (xs) => changer({ structures: xs }), (c) => raisonGrise(f, { sorte: 'structure', cle: c })), 'structure')}
        {famille('Activité', <>
          {/* 🔴 LOT CG10 — « Réunies » : une seule case « Location & Gestion » (cochée : les deux), une seule série en « Activités entre elles » */}
          {f.reunies
            ? cases('Activité', [{ cle: 'vente' as const, mot: 'Vente' }, { cle: 'location_gestion' as const, mot: 'Location & Gestion' }],
              [...(f.activites.includes('vente') ? ['vente' as const] : []), ...(f.activites.includes('location') && f.activites.includes('gestion') ? ['location_gestion' as const] : [])],
              (xs) => changer({ activites: [...(xs.includes('vente') ? ['vente' as const] : []), ...(xs.includes('location_gestion') ? ['location' as const, 'gestion' as const] : [])] }),
              (c) => (c === 'vente' ? null : raisonGrise(f, { sorte: 'activite', cle: 'location' })))
            : cases('Activité', ACTIVITES_GRAPHE, f.activites, (xs) => changer({ activites: xs }), (c) => raisonGrise(f, { sorte: 'activite', cle: c }))}
          {choix('Location et Gestion', [{ cle: 'separees', mot: 'Séparées' }, { cle: 'reunies', mot: 'Réunies' }] as const, f.reunies ? 'reunies' : 'separees',
            (c) => setF((v) => avecReunies(v, c === 'reunies')))}</>, 'activite')}
        {famille('Comparer', choix('Comparer', COMPARER_GRAPHE, f.comparer, (c) => changer({ comparer: c }), (c) => raisonGrise(f, { sorte: 'comparer', cle: c })), 'comparer')}
        {famille('Affichage', <>{choix('Période', [{ cle: 'mensuel', mot: parAnnees ? 'Annuel' : 'Mensuel' }, { cle: 'cumul', mot: 'Cumul' }] as const, f.cumul ? 'cumul' : 'mensuel', (c) => changer({ cumul: c === 'cumul' }))}
          {choix('Barres', [{ cle: 'empile', mot: 'Barres empilées' }, { cle: 'cote', mot: 'Côte à côte' }] as const, f.empile ? 'empile' : 'cote', (c) => changer({ empile: c === 'empile' }), () => raisonGrise(f, { sorte: 'affichage' }))}
          {/* 🔴 LOT CG12 (Arno) — « Réinitialiser les filtres » sur la ligne « Affichage », à droite (une ligne de moins dans le panneau) */}
          <button type="button" className="trx-bouton-lien trx-gf-reinit" onClick={() => setF(FILTRES_GRAPHE_DEFAUT)} disabled={nb === 0} data-reinitialiser-filtres>Réinitialiser les filtres</button></>, 'affichage')}
      </div>
      {graphe}
      {/* 🔴 LOT CG10 — les ventes à attribuer ne sont plus dans le graphique : leur montant sur la période, discrètement (le Bilan les compte) */}
      {horsAttribuer !== 0 && <p className="loc-muet trx-gf-note" data-hors-ventes-a-attribuer>Hors ventes à attribuer : {eur(horsAttribuer)} {MOT_UNITE[u]} (comptées dans le Bilan)</p>}
      {!seule && <p className="loc-muet trx-gf-note" data-note-graphe>{f.comparer === 'structures' && (vals[0]?.c.series ?? []).some((x) => x.cle === 'inter') ? 'L’inter-cabinet entre nos sociétés, compté dans les deux ventes, est retiré une fois (série « Inter-cabinet ») : le total = le Bilan. ' : ''}Valeurs : les tableaux du Bilan ci-dessous.</p>}
      {seule && f.comparer === 'n1' && <p className="loc-muet trx-gf-note" data-note-graphe>Comparaison : les mêmes filtres, {parAnnees ? 'un an plus tôt' : `en ${annee - 1}`} ({f.cumul ? 'pointillé' : 'hachuré'}).</p>}
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Le panneau des filtres : compact, une famille par ligne (petit titre gris + choix) ; au telephone, repliable. */
export const CSS_GRAPHE_GLOBAL = `
.trx-gf-tete{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;margin-bottom:8px}
.trx-gf-tete h3{margin:0}
.trx-gf-bascule{display:none;appearance:none;border:1px solid var(--color-svv-line-strong);border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-weight:700;font-size:.85rem;min-height:36px;padding:4px 12px;cursor:pointer}
.trx-gf-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-gf-panneau{display:flex;flex-direction:column;gap:6px;padding:8px 12px;margin-bottom:10px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field)}
.trx-gf-famille{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 12px;min-width:0}
.trx-gf-titre{flex:0 0 6.5rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.trx-gf-choix{flex-wrap:nowrap;width:max-content;max-width:100%}
.trx-gf-choix .trx-unite{min-height:32px;padding:2px 10px;font-size:.8rem;white-space:normal}
.trx-gf-choix .trx-unite:disabled{opacity:.45;cursor:not-allowed}
.trx-gf-cases{display:flex;flex-wrap:wrap;gap:4px 14px}
.trx-gf-case{display:inline-flex;align-items:center;gap:6px;min-height:32px;font-size:.85rem;cursor:pointer}
.trx-gf-case input{width:18px;height:18px;accent-color:var(--color-svv-red)}
.trx-gf-case--grise{opacity:.45;cursor:not-allowed}
.trx-gf-tout{font-size:.8rem}
.trx-gf-reinit{margin-left:auto;font-size:.8rem}
.trx-gf-note{margin:6px 0 0;font-size:.82rem}
.trx-axe-choisi{fill:var(--color-svv-red)}
.trx-axe-hors-mois,.trx-graphe-global [data-barre-mois-global="13"] .tdb-axe,.trx-graphe-global[data-mois-hors] [data-courbe="global-mois-cumul"] svg>text.tdb-axe:last-of-type{font-style:italic;fill:var(--color-svv-muted)}
.trx-axe-hors-mois.trx-axe-choisi{fill:var(--color-svv-red)}
.trx-graphe-global-series .trx-legende-series{font-size:.85rem;font-weight:600;gap:4px 14px}
@media (max-width:640px){
  .trx-gf-bascule{display:inline-flex;align-items:center}
  .trx-gf-panneau{display:none}
  .trx-gf-panneau--ouvert{display:flex}
  .trx-gf-famille{flex-direction:column;align-items:flex-start}
  .trx-gf-titre{flex:none}
  .trx-gf-choix{flex-wrap:wrap}
  .trx-gf-reinit{margin-left:0;align-self:flex-end}
}
`;
