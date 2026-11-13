'use client';

import { useState, type ReactNode } from 'react';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { coutsGlobaux, coutsGlobauxAnnees, type CoutsGlobaux, type EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { NOMS_MOIS, variation } from '../../../../lib/transaction/modele';
import { MOT_A_SAISIR, moisCommence, nbMoisSalairesASaisir } from '../../../../lib/transaction/periodeMois';
import { salairesLocationDuMois, variableNegociateur } from '../../../../lib/transaction/locationCa';
import { aSaisirGestion } from '../../../../lib/transaction/gestionVue';
import { classeSens, ecartEur, EnteteVariableNegociateur, eur, Montants, MOT_UNITE, signePct, useAffichage } from './commun';
import { ListeRepliable } from '../location/ListeRepliable';
import { SelecteurSalaires } from './ChoixSalaires';
import { sensDe } from '../location/TableauBordSuivi';

/**
 * ══ 🔴 LOT CG2 (Arno) — « COÛTS GLOBAUX [année] MOIS PAR MOIS » (et « année par année ») : LE TABLEAU DES COÛTS DU CA GLOBAL ═══════════════════════
 * Juste sous le tableau du CA, la même esthétique (ligne d'année en trame grise, « HT | TTC » partagé). Colonnes regroupées par activité : Vente
 * (commissions des négociateurs, apporteurs, agences extérieures — l'inter-cabinet entre nos sociétés n'est jamais un coût), Location (apporteurs,
 * primes de gestion, variable négociateur, salaires chargés), Gestion (ADHOC, MONGA, salaires chargés), puis Total coûts, N−1 et l'écart. Chaque
 * montant est celui de sa page d'origine (`coutsGlobaux`). « Avec | Sans salaires » : le même sélecteur et la même mémoire que Location / Gestion /
 * FUSION. Couleurs : un coût en rouge, gris à 0 ; l'écart inversé (une hausse des coûts en rouge, une baisse en vert). Téléphone : défilement
 * horizontal dans le tableau, la première colonne fixe.
 */
export interface RangeeCouts { cle: string; libelle: string; annee: number; mois: number | null;
  /** 🔴 LOT CG3 — plusieurs années (« Période », « Tout ») : la somme exacte de ces années ; N−1 : les mêmes années, un an plus tôt. */
  annees?: readonly number[];
  /** 🔴 LOT CG3 — « Tout » : aucune comparaison (« — »), comme l'onglet « L'année » de la vente. */
  sansComparaison?: boolean }

export function TableauCoutsGlobaux({ e, rangees, total, titre, jour, salaires, onSalaires, idTitre, donnee, motN1 }: {
  e: EntreesCoutsGlobaux; rangees: readonly RangeeCouts[];
  /** L'en-tête de la colonne N−1 ; absent : l'année avant celle du total (« 2024 »), sinon « Un an plus tôt ». */
  motN1?: string;
  /** La ligne de total (l'année : « Année 2025 ») ; null : aucune (année par année). */
  total: RangeeCouts | null;
  titre: ReactNode; jour: string; salaires: boolean; onSalaires: (avec: boolean) => void; idTitre: string; donnee: string;
}) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const enU = (m: MontantC): number => m[k] / 100;
  const avecLoc = e.location !== null;
  // 🔴 472 — « Rémunérations associés » : une colonne de la vente, juste avant les salaires, SEULEMENT si la donnée en porte (la route ne l'envoie
  // qu'aux comptes qui ont « Les coûts » : pour les autres, ni colonne, ni montant, ni total qui la contiendrait)
  const avecRemun = (e.saisis ?? []).some((l) => l.poste === 'remunerations');
  const nbVente = avecRemun ? 6 : 5;
  const montant = (m: MontantC, donnees: Record<string, string> = {}) => <span className={classeSens('verse', m.htC, m.ttcC)} {...donnees}>{eur(enU(m))}</span>;
  const petit = (t: ReactNode, attr: string) => <small className="loc-muet trx-ligne-bloc" {...{ [attr]: '' }}>{t}</small>;
  const msDe = (r: RangeeCouts) => (r.mois !== null ? [{ annee: r.annee, mois: r.mois }]
    : (r.annees ?? [r.annee]).flatMap((annee) => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 }))));
  /** Les salaires d'une case : « à saisir » (mois commencés sans saisie), ou le montant (gris, « non comptés », en « Sans salaires »). */
  const caseSalaires = (compte: MontantC, saisi: MontantC, nbSaisis: number, aSaisir: number) => {
    const reste = aSaisir > 0 ? petit(`${aSaisir} mois ${MOT_A_SAISIR}`, 'data-salaires-a-saisir-nb') : null;
    if (nbSaisis === 0) return aSaisir > 0 ? <em className="loc-muet trx-a-saisir" data-salaires-a-saisir>{MOT_A_SAISIR}</em> : <span className="loc-muet">—</span>;
    return salaires ? <>{montant(compte)}{reste}</> : <><span className="loc-muet">{eur(enU(saisi))}</span>{petit('non comptés', 'data-salaires-non-comptes')}{reste}</>;
  };
  const cellules = (r: RangeeCouts, c: CoutsGlobaux, c1: CoutsGlobaux) => {
    const ms = msDe(r);
    const L = c.location;
    const aSaisirL = !avecLoc ? 0 : nbMoisSalairesASaisir(ms, (m) => salairesLocationDuMois(e.location?.salaires ?? null, m.annee, m.mois) !== null, jour);
    const inclus = (tout: MontantC, deduit: MontantC) => (tout.htC === deduit.htC ? null : petit(`${eur(enU({ htC: tout.htC - deduit.htC, ttcC: tout.ttcC - deduit.ttcC }))} inclus dans les salaires`, 'data-inclus-salaires'));
    const aVenir = r.mois !== null && !moisCommence({ annee: r.annee, mois: r.mois }, jour);
    const t = enU(c.total); const t1 = enU(c1.total);
    return <>
      <td data-mot="Commissions des négociateurs" data-cout="vente-commissions">{montant(c.vente.commissions)}</td>
      <td data-mot="Apporteurs (vente)" data-cout="vente-apporteurs">{montant(c.vente.apporteurs)}</td>
      <td data-mot="Agences extérieures" data-cout="vente-exterieures">{montant(c.vente.exterieures)}</td>
      {/* 🔴 « Les coûts », lot 2 (03/11/2026) — les coûts saisis dans « Mon espace › Les coûts » (salaires de la vente, « Autres ») */}
      {avecRemun && <td data-mot="Rémunérations associés (vente)" data-cout="vente-remunerations">{montant(c.saisis.venteRemunerations ?? { htC: 0, ttcC: 0 })}</td>}
      <td data-mot="Salaires chargés (vente)" data-cout="vente-salaires">{montant(c.saisis.venteSalaires)}</td>
      <td data-mot="Autres (vente)" data-cout="vente-autres">{montant(c.saisis.venteAutres)}</td>
      {L === null ? <><td data-mot="Apporteurs (location)">—</td><td data-mot="dont primes de gestion (dans le variable)">—</td><td data-mot="Variable négociateur (primes incluses)">—</td><td data-mot="Salaires chargés (location)">—</td>
        <td data-mot="Part de gestion versée aux apporteurs">—</td><td data-mot="Rémunération des collègues apporteurs">—</td><td data-mot="Autres (location)">—</td></> : <>
        <td data-mot="Apporteurs (location)" data-cout="location-apporteurs">{montant(L.apporteurs)}</td>
        {/* 🔴 Arno (02/11/2026) — les primes : « dont », comprises dans le variable, en gris et NON comptées ; le variable (primes incluses) est la
            seule colonne qui les compte — le Total coûts reste la somme des colonnes comptées */}
        <td data-mot="dont primes de gestion (dans le variable)" data-cout="location-primes"><span className="loc-muet" data-dont-primes>{eur(enU(L.primesDeduites))}</span>{inclus(L.primes, L.primesDeduites)}</td>
        <td data-mot="Variable négociateur (primes incluses)" data-cout="location-variable">{montant(variableNegociateur(L.variableDeduit, L.primesDeduites))}
          {inclus(variableNegociateur(L.variable, L.primes), variableNegociateur(L.variableDeduit, L.primesDeduites))}</td>
        <td data-mot="Salaires chargés (location)" data-cout="location-salaires">{caseSalaires(L.salaires, L.salairesSaisis, L.moisSaisis, aSaisirL)}</td>
        {/* 🔴 « Les coûts », C19 option A — les dus du module Location (part de gestion récurrente, collègues) ; lot 2 : « Autres » saisis */}
        <td data-mot="Part de gestion versée aux apporteurs" data-cout="location-part-gestion">{montant(L.partGestion)}</td>
        <td data-mot="Rémunération des collègues apporteurs" data-cout="location-collegues">{montant(L.collegues)}</td>
        <td data-mot="Autres (location)" data-cout="location-autres">{montant(c.saisis.locationAutres)}</td></>}
      <td data-mot="ADHOC" data-cout="gestion-adhoc">{montant(c.gestion.adhoc)}</td>
      <td data-mot="MONGA" data-cout="gestion-monga">{montant(c.gestion.monga)}</td>
      <td data-mot="Salaires chargés (gestion)" data-cout="gestion-salaires">{caseSalaires(c.gestion.salaires, c.gestion.salairesSaisis, c.gestion.moisSalairesSaisis, aSaisirGestion(e.gestion, ms, jour))}</td>
      <td data-mot="Autres (gestion)" data-cout="gestion-autres">{montant(c.saisis.gestionAutres)}</td>
      <td data-mot="Total coûts" className="trx-total" data-cout="total">{aVenir && c.total.htC === 0 ? '—' : montant(c.total)}</td>
      <td data-mot={r.mois === null ? String(r.annee - 1) : `${NOMS_MOIS[r.mois - 1]} ${r.annee - 1}`} data-cout="n1">{r.sansComparaison ? '—' : montant(c1.total)}</td>
      {/* l'écart inversé : une hausse des coûts en rouge, une baisse en vert */}
      <td data-mot="Écart" data-cout="ecart" className={aVenir || r.sansComparaison ? undefined : `tdb-signe tdb-signe--${sensDe(t1 - t)}`}>{aVenir || r.sansComparaison ? '—' : <>{ecartEur(t - t1)} <span className="trx-ecart-pct">({signePct(variation(t, t1))})</span></>}</td>
    </>;
  };
  const ligne = (r: RangeeCouts, total = false) => {
    const c = r.annees !== undefined ? coutsGlobauxAnnees(e, r.annees, salaires) : coutsGlobaux(e, r.annee, r.mois, salaires);
    const c1 = r.annees !== undefined ? coutsGlobauxAnnees(e, r.annees.map((a) => a - 1), salaires) : coutsGlobaux(e, r.annee - 1, r.mois, salaires);
    return (
      <tr key={r.cle} className={total ? 'tdb-fort trx-ligne-total' : undefined} data-rangee-couts={r.cle} {...(total ? { 'data-total-couts': '' } : {})}>
        <th scope="row">{r.libelle}</th>{cellules(r, c, c1)}
      </tr>
    );
  };
  const n1 = motN1 ?? (total !== null && total.annees === undefined ? String(total.annee - 1) : 'Un an plus tôt');
  // 🔴 LOT CG5 (accord d'Arno) — REPLIÉ à l'arrivée, sur une ligne : le triangle rouge partagé, le titre, le total des coûts à droite ; « Avec | Sans
  // salaires » reste sur la ligne, utilisable replié. L'état n'est pas retenu d'une visite à l'autre.
  const [ouvert, setOuvert] = useState(false);
  const annees = total !== null ? (total.annees ?? [total.annee]) : rangees.map((r) => r.annee);
  const totalCouts = (total !== null && total.mois === null) || total === null ? coutsGlobauxAnnees(e, annees, salaires).total : coutsGlobaux(e, total.annee, total.mois, salaires).total;
  return <>
    <style>{CSS_TABLES_GROUPES + CSS_COUTS_GLOBAUX}</style>
    <ListeRepliable colonneTotal id={idTitre} section={donnee} ouvert={ouvert} onOuvert={setOuvert} donnees={{ 'data-bloc': donnee }} compteur={null}
      titre={<>{titre} <small className="loc-muet">({MOT_UNITE[u]}{u === 'ttc' ? ' ; apporteurs particuliers et primes de location, variable et salaires sans TVA' : ''}{salaires ? '' : ' ; hors salaires'})</small></>}
      total={<Montants ht={totalCouts.htC / 100} ttc={totalCouts.ttcC / 100} sens="verse" classe="lr-montants" donnees={{ 'data-total-couts-replie': '' }} />}
      // 🔴 LOT CG3 — « Avec | Sans salaires » à droite du titre, sur la même ligne (téléphone : dessous)
      aDroite={<div className="trx-couts-choix" data-couts-tete><SelecteurSalaires salaires={salaires} onChange={onSalaires} /></div>}>
      <div className="trx-couts-defile trx-table-defile" data-defile-couts>
        <table className="tdb-table trx-table-groupes trx-table-couts" data-table-couts={donnee}>
          {/* 🔴 LOT CG3 — les blocs : Vente · Location · Gestion · Total et comparaison (un trait vertical au début de chacun, un fond un bloc sur deux) */}
          <colgroup><col /></colgroup><colgroup span={nbVente} className="trx-g trx-g--fond" data-bloc-colonnes="vente" /><colgroup span={7} className="trx-g" data-bloc-colonnes="location" />
          <colgroup span={4} className="trx-g trx-g--fond" data-bloc-colonnes="gestion" /><colgroup span={3} className="trx-g" data-bloc-colonnes="total" />
          <thead>
            <tr><th scope="col" rowSpan={2}>{rangees[0]?.mois === null ? 'Année' : 'Mois'}</th>
              <th scope="colgroup" colSpan={nbVente} data-groupe-couts="vente">Vente <small className="loc-muet">(CRITERIMMO + MACJ)</small></th>
              <th scope="colgroup" colSpan={7} data-groupe-couts="location">Location</th>
              <th scope="colgroup" colSpan={4} data-groupe-couts="gestion">Gestion</th>
              <th scope="colgroup" colSpan={3} data-groupe-couts="total">Total et comparaison</th></tr>
            <tr><th scope="col">Commissions des négociateurs</th><th scope="col">Apporteurs</th><th scope="col">Agences extérieures</th>{avecRemun && <th scope="col" data-entete-remunerations>Rémunérations associés</th>}<th scope="col">Salaires chargés</th><th scope="col">Autres</th>
              <th scope="col">Apporteurs</th><th scope="col">dont primes de gestion <small className="loc-muet">(dans le variable)</small></th><th scope="col"><EnteteVariableNegociateur libelle="Variable négociateur (primes incluses)" cible={`couts-${donnee}`} /></th><th scope="col">Salaires chargés</th>
              <th scope="col">Part de gestion versée aux apporteurs</th><th scope="col">Rémunération des collègues apporteurs</th><th scope="col">Autres</th>
              <th scope="col">ADHOC</th><th scope="col">MONGA</th><th scope="col">Salaires chargés</th><th scope="col">Autres</th>
              <th scope="col">Total coûts</th><th scope="col">{n1}</th><th scope="col">Écart</th></tr>
          </thead>
          <tbody>
            {rangees.map((r) => ligne(r))}
            {total !== null && ligne(total, true)}
          </tbody>
        </table>
      </div>
      <p className="loc-muet trx-couts-note" data-couts-note>L’inter-cabinet entre nos sociétés n’est jamais un coût (neutralisé) ; chaque montant est celui de sa page (Transaction vente FUSION, Suivi CA › Location, Gestion).{salaires ? ' Primes et variable : « inclus dans les salaires » les mois où les salaires de la Location sont saisis.' : ' Sans salaires : salaires chargés non comptés ; primes et variable déduits chaque mois.'}</p>
    </ListeRepliable>
  </>;
}

/**
 * 🔴 LOT CG3 — LES TABLEAUX EN BLOCS (le CA global et ses coûts) : un trait vertical marqué au début de chaque bloc, sur toute la hauteur (les bords des
 * `colgroup`, tableau à bords fusionnés) ; l'en-tête de bloc souligné sur toute sa largeur, un petit espace entre deux blocs ; un fond très léger un
 * bloc sur deux (l'encre à 4 %, lisible en clair comme en sombre). Téléphone : le vrai tableau, qui défile à l'horizontale, la première colonne fixe.
 * AUCUN ACCENT GRAVE DANS CE LITTERAL.
 */
export const CSS_TABLES_GROUPES = `
.trx-table-defile{overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.trx-table-groupes{font-variant-numeric:tabular-nums}
.trx-table-groupes colgroup.trx-g{border-left:2px solid var(--color-svv-line-strong)}
.trx-table-groupes colgroup.trx-g--fond{background:color-mix(in srgb, var(--color-svv-ink) 4%, transparent)}
.trx-table-groupes thead tr:first-child th[scope=colgroup]{text-align:center;border-bottom:0;padding-bottom:6px;background-image:linear-gradient(var(--color-svv-line-strong),var(--color-svv-line-strong));background-size:calc(100% - 12px) 2px;background-position:center bottom;background-repeat:no-repeat}
.trx-table-groupes thead tr:first-child th:first-child,.trx-table-groupes tbody th:first-child{position:sticky;left:0;z-index:1;text-align:left;background:var(--color-svv-surface)}
.trx-table-groupes tr.trx-ligne-total th:first-child,.trx-table-groupes tr.tdb-fort th:first-child{background:var(--color-svv-field)}
@media (max-width:1024px){
  .tdb-table.trx-table-groupes{display:table;width:auto}
  .tdb-table.trx-table-groupes thead{display:table-header-group}
  .tdb-table.trx-table-groupes tbody{display:table-row-group;width:auto}
  .tdb-table.trx-table-groupes tr{display:table-row;width:auto;border:0;border-radius:0;padding:0;margin:0}
  .tdb-table.trx-table-groupes th,.tdb-table.trx-table-groupes td{display:table-cell;width:auto;padding:6px 6px;border-bottom:1px solid var(--color-svv-line)}
  .tdb-table.trx-table-groupes td::before{content:none}
  .tdb-table.trx-table-ca-global{min-width:760px}
}
`;

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Le défilement horizontal du tableau ; la première colonne fixe ; les en-têtes de groupe. */
export const CSS_COUTS_GLOBAUX = `
.trx-couts-tete{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;margin:0 0 8px}
.trx-couts-tete h3{margin:0}
.trx-couts-choix{display:flex;justify-content:flex-end;margin-left:auto}
.trx-couts-choix .trx-salaires{margin:0}
@media (max-width:640px){ .trx-couts-tete{flex-direction:column;align-items:flex-start} .trx-couts-choix{margin-left:0} }
.trx-couts-defile{overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.trx-table-couts{width:100%;font-size:.76rem;font-variant-numeric:tabular-nums}
.trx-table-couts th,.trx-table-couts td{white-space:nowrap;padding-left:4px;padding-right:4px}
.trx-table-couts td,.trx-table-couts thead th{text-align:right}
.trx-table-couts thead th{white-space:normal;font-size:.68rem;line-height:1.25;vertical-align:bottom}
.trx-table-couts td[data-cout="ecart"]{white-space:normal}
.trx-table-couts tbody th{white-space:normal;min-width:4.5rem;max-width:7rem}
.trx-table-couts td[data-cout="ecart"] .trx-ecart-pct{display:block}
.trx-table-couts .trx-ligne-bloc{display:block;font-size:.78rem}
.trx-couts-note{margin:8px 0 0;font-size:.85rem}
@media (max-width:1024px){ .tdb-table.trx-table-couts{min-width:1500px} }
`;
