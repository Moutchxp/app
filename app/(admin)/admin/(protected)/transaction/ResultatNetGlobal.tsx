'use client';

import { useState, type ReactNode } from 'react';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { celluleGlobalAnnees, celluleGlobalEn, type EntreesGlobalUnite } from '../../../../lib/transaction/globalUnite';
import { coutsGlobaux, coutsGlobauxAnnees, type EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { aSaisirFusion } from '../../../../lib/transaction/fusionLocationGestion';
import { NOMS_MOIS, variation } from '../../../../lib/transaction/modele';
import { classeSens, ecartEur, eur, Montants, MOT_UNITE, signePct, useAffichage } from './commun';
import { ListeRepliable } from '../location/ListeRepliable';
import { sensDe } from '../location/TableauBordSuivi';
import { CSS_TABLES_GROUPES, type RangeeCouts } from './CoutsGlobaux';

/**
 * ══ 🔴 LOT CG7 (Arno) — « RÉSULTAT NET » DU CA GLOBAL : LE CHIFFRE D'AFFAIRES − LES COÛTS, SUR LA MÊME PÉRIODE ═══════════════════════════════════════
 * Aucun calcul propre : le CA de chaque ligne est celui du tableau « Chiffre d'affaires global » (`celluleGlobalEn` / `celluleGlobalAnnees`), les coûts
 * ceux du tableau « Coûts globaux » (`coutsGlobaux` / `coutsGlobauxAnnees`, « Avec | Sans salaires » des lignes de coûts) ; le résultat = leur
 * différence, au centime, en HT et en TTC. Une ligne de résultat (pas un tableau) : cadre plus épais, fond plus soutenu ; le calcul en petit ; le
 * résultat dans la colonne des totaux (lot CG6). Repliée à l'arrivée : un clic ouvre le détail (une ligne par mois, ou par année), son total en trame
 * grise ; « Hors mois » : ce que l'année compte sans mois (ventes à attribuer, mois à confirmer), pour que la somme des lignes = le total.
 */
export function LigneResultatNet({ e, eCouts, rangees, total, titre, jour, salaires, idTitre, donnee, motN1 }: {
  e: EntreesGlobalUnite; eCouts: EntreesCoutsGlobaux; rangees: readonly RangeeCouts[]; total: RangeeCouts; titre: ReactNode; jour: string; salaires: boolean;
  idTitre: string; donnee: string; motN1?: string;
}) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const [ouvert, setOuvert] = useState(false);
  const cent = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0;
  const caDe = (r: Pick<RangeeCouts, 'annee' | 'mois' | 'annees'>): MontantC => {
    const v = (x: 'ht' | 'ttc'): number => cent((r.annees !== undefined ? celluleGlobalAnnees(e, r.annees, x) : celluleGlobalEn(e, r.annee, r.mois, x)).totalHt);
    return { htC: v('ht'), ttcC: v('ttc') };
  };
  const coutsDe = (r: Pick<RangeeCouts, 'annee' | 'mois' | 'annees'>): MontantC =>
    (r.annees !== undefined ? coutsGlobauxAnnees(eCouts, r.annees, salaires) : coutsGlobaux(eCouts, r.annee, r.mois, salaires)).total;
  const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
  const avant = (r: RangeeCouts): Pick<RangeeCouts, 'annee' | 'mois' | 'annees'> => ({ annee: r.annee - 1, mois: r.mois, annees: r.annees?.map((a) => a - 1) });
  const ligneDe = (r: RangeeCouts) => { const ca = caDe(r); const couts = coutsDe(r); const r1 = avant(r); return { ca, couts, net: moins(ca, couts), net1: moins(caDe(r1), coutsDe(r1)) }; };
  const T = ligneDe(total);
  const lignes = rangees.map((r) => ({ r, ...ligneDe(r) }));
  // « Hors mois » (mois par mois seulement) : le total de l'année moins la somme de ses mois — les ventes à attribuer et les mois à confirmer
  const somme = (f: (x: (typeof lignes)[number]) => MontantC): MontantC => lignes.reduce((t, x) => ({ htC: t.htC + f(x).htC, ttcC: t.ttcC + f(x).ttcC }), { htC: 0, ttcC: 0 });
  const horsMois = rangees.some((r) => r.mois !== null) ? { ca: moins(T.ca, somme((x) => x.ca)), couts: moins(T.couts, somme((x) => x.couts)) } : null;
  const avecHorsMois = horsMois !== null && (horsMois.ca.htC !== 0 || horsMois.couts.htC !== 0 || horsMois.ca.ttcC !== 0 || horsMois.couts.ttcC !== 0);
  // les mentions : les ventes à attribuer (dans le CA, sans coût) ; les mois de salaires à saisir (la règle des pages Location et Gestion)
  const anneesT = total.annees ?? [total.annee];
  const aAttribuer = cent(celluleGlobalAnnees(e, anneesT, 'ht').aAttribuerHt) !== 0;
  const ms = anneesT.flatMap((annee) => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 })));
  const aSaisir = salaires ? aSaisirFusion(eCouts.gestion, eCouts.location?.salaires ?? null, ms, 'deux', jour).mot : '';
  const en = (m: MontantC): number => m[k] / 100;
  const motU = MOT_UNITE[u];
  const resultat = (m: MontantC, attr: Record<string, string> = {}) => <span className={`tdb-signe tdb-signe--${sensDe(m[k])}`} {...attr}>{eur(en(m))}</span>;
  const ecart = (m: MontantC, m1: MontantC, comparer: boolean) => (comparer
    ? <td data-mot="Écart" data-resultat-net="ecart" className={`tdb-signe tdb-signe--${sensDe(m[k] - m1[k])}`}>{ecartEur(en(m) - en(m1))} <span className="trx-ecart-pct">({signePct(variation(m[k], m1[k]))})</span></td>
    : <td data-mot="Écart" data-resultat-net="ecart">—</td>);
  const n1 = motN1 ?? (total.annees === undefined ? String(total.annee - 1) : 'Un an plus tôt');
  return <>
    <style>{CSS_TABLES_GROUPES + CSS_RESULTAT_NET}</style>
    <ListeRepliable colonneTotal id={idTitre} section={donnee} ouvert={ouvert} onOuvert={setOuvert} classe="tdb-section trx-resultat-net" donnees={{ 'data-bloc': donnee }} compteur={null}
      titre={<>{titre} <small className="loc-muet">({motU} ; {salaires ? 'avec salaires' : 'hors salaires'})</small></>}
      aDroite={<span className="trx-rn-calcul" data-resultat-net-calcul>CA {eur(en(T.ca))} − coûts {eur(en(T.couts))}</span>}
      total={<><span className="trx-rn-egal" aria-hidden="true">=</span><Montants ht={T.net.htC / 100} ttc={T.net.ttcC / 100} sens={T.net[k] >= 0 ? 'recu' : 'verse'} classe="lr-montants" donnees={{ 'data-total-resultat-net': '' }} /></>}
      avant={(aAttribuer || aSaisir !== '') && <p className="loc-muet trx-rn-mentions" data-resultat-net-mentions>
        {aAttribuer && <span data-mention-a-attribuer>inclut les ventes à attribuer (comptées dans le CA, aucun coût associé)</span>}
        {aAttribuer && aSaisir !== '' && ' · '}
        {aSaisir !== '' && <span data-mention-a-saisir>{aSaisir}</span>}</p>}>
      <div className="trx-table-defile">
        <table className="tdb-table trx-table-groupes trx-table-resultat-net" data-table-resultat-net={donnee}>
          <colgroup><col /></colgroup><colgroup span={3} className="trx-g trx-g--fond" data-bloc-colonnes="resultat" /><colgroup span={2} className="trx-g" data-bloc-colonnes="comparaison" />
          <thead>
            <tr><th scope="col" rowSpan={2}>{rangees[0]?.mois === null ? 'Année' : 'Mois'}</th>
              <th scope="colgroup" colSpan={3} data-groupe-resultat="resultat">Résultat</th><th scope="colgroup" colSpan={2} data-groupe-resultat="comparaison">Comparaison</th></tr>
            <tr><th scope="col">CA</th><th scope="col">Coûts</th><th scope="col">Résultat</th><th scope="col">{n1}</th><th scope="col">Écart</th></tr>
          </thead>
          <tbody>
            {lignes.map((x) => (
              <tr key={x.r.cle} data-rangee-resultat-net={x.r.cle}>
                <th scope="row">{x.r.libelle}</th>
                <td data-mot="CA" data-resultat-net="ca">{eur(en(x.ca))}</td>
                <td data-mot="Coûts" data-resultat-net="couts"><span className={classeSens('verse', x.couts.htC, x.couts.ttcC)}>{eur(en(x.couts))}</span></td>
                <td data-mot="Résultat" data-resultat-net="net">{resultat(x.net)}</td>
                <td data-mot={x.r.mois === null ? String(x.r.annee - 1) : `${NOMS_MOIS[x.r.mois - 1]} ${x.r.annee - 1}`} data-resultat-net="n1">{x.r.sansComparaison ? '—' : resultat(x.net1)}</td>
                {ecart(x.net, x.net1, x.r.sansComparaison !== true)}
              </tr>
            ))}
            {avecHorsMois && horsMois !== null && (
              <tr data-rangee-resultat-net="hors-mois">
                <th scope="row">Hors mois <small className="loc-muet">(ventes à attribuer, mois à confirmer)</small></th>
                <td data-mot="CA" data-resultat-net="ca">{eur(en(horsMois.ca))}</td>
                <td data-mot="Coûts" data-resultat-net="couts"><span className={classeSens('verse', horsMois.couts.htC, horsMois.couts.ttcC)}>{eur(en(horsMois.couts))}</span></td>
                <td data-mot="Résultat" data-resultat-net="net">{resultat(moins(horsMois.ca, horsMois.couts))}</td>
                <td data-mot={n1} data-resultat-net="n1">—</td><td data-mot="Écart" data-resultat-net="ecart">—</td>
              </tr>
            )}
            <tr className="tdb-fort trx-ligne-total" data-total-resultat-net-ligne>
              <th scope="row">{total.libelle}</th>
              <td data-mot="CA" data-resultat-net="ca">{eur(en(T.ca))}</td>
              <td data-mot="Coûts" data-resultat-net="couts"><span className={classeSens('verse', T.couts.htC, T.couts.ttcC)}>{eur(en(T.couts))}</span></td>
              <td data-mot="Résultat" data-resultat-net="net">{resultat(T.net)}</td>
              <td data-mot={n1} data-resultat-net="n1">{total.sansComparaison ? '—' : resultat(T.net1)}</td>
              {ecart(T.net, T.net1, total.sansComparaison !== true)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="loc-muet trx-couts-note" data-resultat-net-note>Résultat net = le chiffre d’affaires global − les coûts globaux de la même période ({salaires ? 'avec salaires' : 'hors salaires'}, le choix des lignes de coûts).</p>
    </ListeRepliable>
  </>;
}

/**
 * Une ligne de RÉSULTAT, pas un tableau : un cadre plus épais (bord + ombre intérieure), un fond plus soutenu (l'encre à 7 %, lisible en clair comme en sombre), le libellé en gras ;
 * le calcul en petit, gris, au centre ; « = » devant le résultat. AUCUN ACCENT GRAVE DANS CE LITTERAL.
 */
export const CSS_RESULTAT_NET = `
/* le cadre plus epais : 1 px de bord + 1 px d'ombre interieure (le contenu ne bouge pas : les totaux restent alignes au pixel, lot CG6) */
.trx-resultat-net{border-color:var(--color-svv-line-strong);box-shadow:inset 0 0 0 1px var(--color-svv-line-strong);background:color-mix(in srgb, var(--color-svv-ink) 7%, var(--color-svv-surface))}
.trx-table-resultat-net tbody th:first-child,.trx-table-resultat-net thead tr:first-child th:first-child{width:16rem}
.trx-resultat-net .lr-titre{font-weight:800}
.trx-rn-calcul{display:block;font-size:.82rem;color:var(--color-svv-muted);font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap}
.trx-rn-egal{font-weight:800;font-size:1.1rem;margin-right:6px;align-self:flex-start;color:var(--color-svv-ink)}
.trx-rn-mentions{margin:2px 0 0 38px;font-size:.82rem}
.trx-table-resultat-net{font-size:.86rem}
.trx-table-resultat-net td[data-resultat-net="ecart"]{white-space:normal}
.trx-table-resultat-net td[data-resultat-net="ecart"] .trx-ecart-pct{display:block}
@media (max-width:1024px){ .tdb-table.trx-table-resultat-net{min-width:640px} }
@media (max-width:640px){ .trx-rn-calcul{white-space:normal;text-align:right} .trx-rn-mentions{margin-left:0} .trx-table-resultat-net tbody th:first-child,.trx-table-resultat-net thead tr:first-child th:first-child{width:7rem} }
`;
