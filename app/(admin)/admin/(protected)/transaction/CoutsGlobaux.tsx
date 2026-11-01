'use client';

import type { ReactNode } from 'react';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { coutsGlobaux, type CoutsGlobaux, type EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { NOMS_MOIS, variation } from '../../../../lib/transaction/modele';
import { MOT_A_SAISIR, moisCommence, nbMoisSalairesASaisir } from '../../../../lib/transaction/periodeMois';
import { salairesLocationDuMois } from '../../../../lib/transaction/locationCa';
import { aSaisirGestion } from '../../../../lib/transaction/gestionVue';
import { classeSens, ecartEur, eur, MOT_UNITE, signePct, useAffichage } from './commun';
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
export interface RangeeCouts { cle: string; libelle: string; annee: number; mois: number | null }

export function TableauCoutsGlobaux({ e, rangees, total, titre, jour, salaires, onSalaires, idTitre, donnee }: {
  e: EntreesCoutsGlobaux; rangees: readonly RangeeCouts[];
  /** La ligne de total (l'année : « Année 2025 ») ; null : aucune (année par année). */
  total: RangeeCouts | null;
  titre: ReactNode; jour: string; salaires: boolean; onSalaires: (avec: boolean) => void; idTitre: string; donnee: string;
}) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const enU = (m: MontantC): number => m[k] / 100;
  const avecLoc = e.location !== null;
  const montant = (m: MontantC, donnees: Record<string, string> = {}) => <span className={classeSens('verse', m.htC, m.ttcC)} {...donnees}>{eur(enU(m))}</span>;
  const petit = (t: ReactNode, attr: string) => <small className="loc-muet trx-ligne-bloc" {...{ [attr]: '' }}>{t}</small>;
  const msDe = (r: RangeeCouts) => (r.mois === null ? Array.from({ length: 12 }, (_, i) => ({ annee: r.annee, mois: i + 1 })) : [{ annee: r.annee, mois: r.mois }]);
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
      {L === null ? <><td data-mot="Apporteurs (location)">—</td><td data-mot="Primes de gestion">—</td><td data-mot="Variable négociateur">—</td><td data-mot="Salaires chargés (location)">—</td></> : <>
        <td data-mot="Apporteurs (location)" data-cout="location-apporteurs">{montant(L.apporteurs)}</td>
        <td data-mot="Primes de gestion" data-cout="location-primes">{montant(L.primesDeduites)}{inclus(L.primes, L.primesDeduites)}</td>
        <td data-mot="Variable négociateur" data-cout="location-variable">{montant(L.variableDeduit)}{inclus(L.variable, L.variableDeduit)}</td>
        <td data-mot="Salaires chargés (location)" data-cout="location-salaires">{caseSalaires(L.salaires, L.salairesSaisis, L.moisSaisis, aSaisirL)}</td></>}
      <td data-mot="ADHOC" data-cout="gestion-adhoc">{montant(c.gestion.adhoc)}</td>
      <td data-mot="MONGA" data-cout="gestion-monga">{montant(c.gestion.monga)}</td>
      <td data-mot="Salaires chargés (gestion)" data-cout="gestion-salaires">{caseSalaires(c.gestion.salaires, c.gestion.salairesSaisis, c.gestion.moisSalairesSaisis, aSaisirGestion(e.gestion, ms, jour))}</td>
      <td data-mot="Total coûts" className="trx-total" data-cout="total">{aVenir && c.total.htC === 0 ? '—' : montant(c.total)}</td>
      <td data-mot={r.mois === null ? String(r.annee - 1) : `${NOMS_MOIS[r.mois - 1]} ${r.annee - 1}`} data-cout="n1">{montant(c1.total)}</td>
      {/* l'écart inversé : une hausse des coûts en rouge, une baisse en vert */}
      <td data-mot="Écart" data-cout="ecart" className={aVenir ? undefined : `tdb-signe tdb-signe--${sensDe(t1 - t)}`}>{aVenir ? '—' : <>{ecartEur(t - t1)} <span className="trx-ecart-pct">({signePct(variation(t, t1))})</span></>}</td>
    </>;
  };
  const ligne = (r: RangeeCouts, total = false) => {
    const c = coutsGlobaux(e, r.annee, r.mois, salaires);
    const c1 = coutsGlobaux(e, r.annee - 1, r.mois, salaires);
    return (
      <tr key={r.cle} className={total ? 'tdb-fort trx-ligne-total' : undefined} data-rangee-couts={r.cle} {...(total ? { 'data-total-couts': '' } : {})}>
        <th scope="row">{r.libelle}</th>{cellules(r, c, c1)}
      </tr>
    );
  };
  const n1 = total !== null ? String(total.annee - 1) : 'Un an plus tôt';
  return (
    <section className="tdb-section" aria-labelledby={idTitre} data-bloc={donnee}>
      <style>{CSS_COUTS_GLOBAUX}</style>
      <h3 id={idTitre}>{titre} <small className="loc-muet">({MOT_UNITE[u]}{u === 'ttc' ? ' ; apporteurs et primes de location, variable et salaires sans TVA' : ''}{salaires ? '' : ' ; hors salaires'})</small></h3>
      <div className="trx-couts-choix"><SelecteurSalaires salaires={salaires} onChange={onSalaires} /></div>
      <div className="trx-couts-defile" data-defile-couts>
        <table className="tdb-table trx-table-couts" data-table-couts={donnee}>
          <thead>
            <tr><th scope="col" rowSpan={2}>{rangees[0]?.mois === null ? 'Année' : 'Mois'}</th>
              <th scope="colgroup" colSpan={3} data-groupe-couts="vente">Vente <small className="loc-muet">(CRITERIMMO + MACJ)</small></th>
              <th scope="colgroup" colSpan={4} data-groupe-couts="location">Location</th>
              <th scope="colgroup" colSpan={3} data-groupe-couts="gestion">Gestion</th>
              <th scope="col" rowSpan={2}>Total coûts</th><th scope="col" rowSpan={2}>{n1}</th><th scope="col" rowSpan={2}>Écart</th></tr>
            <tr><th scope="col">Commissions des négociateurs</th><th scope="col">Apporteurs</th><th scope="col">Agences extérieures</th>
              <th scope="col">Apporteurs</th><th scope="col">Primes de gestion</th><th scope="col">Variable négociateur</th><th scope="col">Salaires chargés</th>
              <th scope="col">ADHOC</th><th scope="col">MONGA</th><th scope="col">Salaires chargés</th></tr>
          </thead>
          <tbody>
            {rangees.map((r) => ligne(r))}
            {total !== null && ligne(total, true)}
          </tbody>
        </table>
      </div>
      <p className="loc-muet trx-couts-note" data-couts-note>L’inter-cabinet entre nos sociétés n’est jamais un coût (neutralisé) ; chaque montant est celui de sa page (Transaction vente FUSION, Suivi CA › Location, Gestion).{salaires ? ' Primes et variable : « inclus dans les salaires » les mois où les salaires de la Location sont saisis.' : ' Sans salaires : salaires chargés non comptés ; primes et variable déduits chaque mois.'}</p>
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Le défilement horizontal du tableau ; la première colonne fixe ; les en-têtes de groupe. */
export const CSS_COUTS_GLOBAUX = `
.trx-couts-choix{display:flex;justify-content:flex-end;margin:0 0 8px}
.trx-couts-choix .trx-salaires{margin:0}
.trx-couts-defile{overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.trx-table-couts{width:100%;font-size:.76rem;font-variant-numeric:tabular-nums}
.trx-table-couts th,.trx-table-couts td{white-space:nowrap;padding-left:4px;padding-right:4px}
.trx-table-couts td,.trx-table-couts thead th{text-align:right}
.trx-table-couts thead th{white-space:normal;font-size:.68rem;line-height:1.25;vertical-align:bottom}
.trx-table-couts thead tr:first-child th[data-groupe-couts]{text-align:center;border-bottom:2px solid var(--color-svv-line-strong)}
.trx-table-couts td[data-cout="ecart"]{white-space:normal}
.trx-table-couts td[data-cout="ecart"] .trx-ecart-pct{display:block}
.trx-table-couts thead tr:first-child th:first-child,.trx-table-couts tbody th:first-child{position:sticky;left:0;z-index:1;text-align:left;background:var(--color-svv-surface)}
.trx-table-couts tr.trx-ligne-total th:first-child{background:var(--color-svv-field)}
.trx-table-couts .trx-ligne-bloc{display:block;font-size:.78rem}
.trx-couts-note{margin:8px 0 0;font-size:.85rem}
/* Telephone : PAS de cartes (la regle commune des tableaux) : le vrai tableau, qui defile a l'horizontale, la colonne Mois fixe. */
@media (max-width:1024px){
  .tdb-table.trx-table-couts{display:table;width:auto;min-width:1100px}
  .tdb-table.trx-table-couts thead{display:table-header-group}
  .tdb-table.trx-table-couts tbody{display:table-row-group;width:auto}
  .tdb-table.trx-table-couts tr{display:table-row;width:auto;border:0;border-radius:0;padding:0;margin:0}
  .tdb-table.trx-table-couts th,.tdb-table.trx-table-couts td{display:table-cell;width:auto;padding:6px 4px;border-bottom:1px solid var(--color-svv-line)}
  .tdb-table.trx-table-couts td::before{content:none}
}
`;
