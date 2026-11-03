'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { classeSens, ESPACE, eur, MOT_UNITE, signePct, useAffichage } from '../transaction/commun';
import { anneeAvecDonnees, anneesDuGlobal, LigneDesAnnees, moisRougesDeLAnnee, type DonneesGlobal } from '../transaction/EcransTransaction';
import { GrapheGlobal } from '../transaction/GrapheGlobal';
import { CSS_COUTS_GLOBAUX, CSS_TABLES_GROUPES } from '../transaction/CoutsGlobaux';
import { NOMS_MOIS, variation, type Vente } from '../../../../lib/transaction/modele';
import { moisCommence } from '../../../../lib/transaction/periodeMois';
import { resolveurDe } from '../../../../lib/transaction/statutLigne';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import type { EntreesGlobalUnite } from '../../../../lib/transaction/globalUnite';
import type { StructureGraphe } from '../../../../lib/transaction/grapheGlobal';
import { LIBELLE_AGENCE, type Agence } from '../../../../lib/mon-espace/agence';
import { avecLocationGestion, coutsDeLAnnee, URL_COUTS, type CoutsDuPoint } from '../../../../lib/mon-espace/couts';

/**
 * ══ 🔴 MON ESPACE — L'ONGLET « LES COÛTS » (Arno, 03/11/2026, lot C1 : LECTURE SEULE) ═════════════════════════════════════════════════════════════
 * Associés seulement (décision C1), en mode agence (« Voir » : CRITERIMMO, MACJ, FUSION ; décision C2). L'année choisie pilote TOUTE la page (une
 * seule année, jamais un mélange) : la rangée des années (`LigneDesAnnees`, sans « Période | Tout »), les tuiles (total et chaque famille, N−1), le
 * graphique du CA global du Suivi CA (`GrapheGlobal`, mesure « Coûts », les familles Vente / Location / Gestion, N−1, Mensuel / Cumul) et le tableau
 * « Vente » | « Location et gestion » (12 mois, les postes, les totaux). Tous les montants : `coutsDeLAnnee` (les fonctions de « Coûts globaux » et
 * du graphique du CA global, rangées — aucun calcul propre). Les postes des lots suivants : colonne présente, cases vides.
 */
type Lu = { etat: 'chargement' } | { etat: 'ok'; data: DonneesGlobal } | { etat: 'erreur' };
type OngletTableau = 'vente' | 'location-gestion';
const STRUCTURES: Record<Agence, StructureGraphe[]> = { criterimmo: ['criterimmo'], macj: ['macj'], tous: ['criterimmo', 'macj'] };
const MOT_LOT_SUIVANT = 'saisie au lot suivant';

export function CoutsMonEspace({ agence, jour, lecture }: { agence: Agence; jour: string;
  /** Le compteur de relecture de « Mon espace » (rafraîchissement, gestes) : « Les coûts » se relit avec lui. */
  lecture: number }) {
  const [lu, setLu] = useState<Lu>({ etat: 'chargement' });
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_COUTS, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: DonneesGlobal };
        if (!vivant) return;
        setLu(r.ok && j.etat === 'ok' && j.data !== undefined ? { etat: 'ok', data: j.data } : (x) => (x.etat === 'ok' ? x : { etat: 'erreur' }));
      } catch { if (vivant) setLu((x) => (x.etat === 'ok' ? x : { etat: 'erreur' })); }
    })();
    return () => { vivant = false; };
  }, [lecture]);
  const anCourant = Number(jour.slice(0, 4));
  const [annee, setAnnee] = useState(anCourant);
  const [tableau, setTableau] = useState<OngletTableau>('vente');
  const d = lu.etat === 'ok' ? lu.data : null;
  const eC = useMemo((): EntreesCoutsGlobaux | null => (d === null ? null : { ventes: d.ventes as Vente[], retrocessions: d.retrocessions ?? [],
    statutDuLibelle: resolveurDe(d.statutsNegociateurs), location: d.locationCa ?? null, gestion: d.gestion }), [d]);
  const c = useMemo(() => (eC === null ? null : { n: coutsDeLAnnee(eC, agence, annee), n1: coutsDeLAnnee(eC, agence, annee - 1) }), [eC, agence, annee]);
  const u = useAffichage();
  if (lu.etat === 'chargement') return <p className="loc-muet" role="status" data-couts-chargement>Chargement des coûts…</p>;
  if (lu.etat === 'erreur' || d === null || eC === null || c === null) return <p className="loc-alerte loc-alerte--orange" role="alert" data-couts-erreur>Les coûts n’ont pas pu être lus. Rechargez la page.</p>;
  const eG: EntreesGlobalUnite = { ventes: d.ventes, location: d.location, gestion: d.gestion, locationTtcC: d.locationTtcC };
  // les années : celles du CA global qui ont une donnée comptée (la règle de sa rangée), l'année en cours et l'année montrée toujours
  const annees = anneesDuGlobal(d, jour).filter((a) => a === anCourant || a === annee || anneeAvecDonnees(d, a, jour));
  const k = u === 'ht' ? 'htC' : 'ttcC'; const ka = u === 'ht' ? 'ttcC' : 'htC';
  const MOT = MOT_UNITE[u];
  const lg = avecLocationGestion(agence);
  const nom = LIBELLE_AGENCE[agence];
  // ── les tuiles : l'année et chaque famille, la même année un an plus tôt ──
  const tuile = (cle: string, mot: ReactNode, m: MontantC | null, m1: MontantC | null, sans?: string) => (
    <li><div className="tdb-tuile" data-tuile-couts={cle}>
      <span className="tdb-tuile-mot">{mot}</span>
      {m === null ? <><strong className="tdb-tuile-valeur" data-valeur-couts={cle}>—</strong><span className="tdb-tuile-n1">{sans}</span></> : <>
        <strong className="tdb-tuile-valeur" data-valeur-couts={cle}>{eur(m[k] / 100)}</strong>
        <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(m[ka] / 100)}{ESPACE}{MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})</small>
        <span className="tdb-tuile-n1" data-tuile-n1-couts={cle}>{m1 === null ? '—' : `${eur(m1[k] / 100)} en ${annee - 1} (${signePct(variation(m[k], m1[k]))})`}</span></>}
    </div></li>
  );
  const A = c.n.annee; const A1 = c.n1.annee;
  const sansLG = 'MACJ : vente seulement';
  // ── le tableau ──
  const montant = (m: MontantC, attr: Record<string, string> = {}) => <span className={classeSens('verse', m.htC, m.ttcC)} {...attr}>{eur(m[k] / 100)}</span>;
  const info = (m: MontantC) => <span className="loc-muet" data-info-couts>{eur(m[k] / 100)}</span>;
  const futur = (mot: string) => <td data-mot={mot} data-poste-futur className="mes-couts-futur" />;
  const enteteFutur = (mot: string) => <th scope="col" data-entete-futur>{mot} <small className="loc-muet">({MOT_LOT_SUIVANT})</small></th>;
  const lignes: { cle: string; libelle: string; p: CoutsDuPoint; total: boolean; aVenir: boolean }[] = [
    ...c.n.mois.map((p, i) => ({ cle: String(i + 1), libelle: NOMS_MOIS[i], p, total: false, aVenir: !moisCommence({ annee, mois: i + 1 }, jour) })),
    ...(c.n.aConfirmer === null ? [] : [{ cle: 'a-confirmer', libelle: 'Mois à confirmer', p: c.n.aConfirmer, total: false, aVenir: false }]),
    { cle: 'annee', libelle: `Année ${annee}`, p: A, total: true, aVenir: false },
  ];
  const ligne = (l: (typeof lignes)[number], cellules: ReactNode) => (
    <tr key={l.cle} className={l.total ? 'tdb-fort trx-ligne-total' : undefined} data-ligne-couts={l.cle}><th scope="row">{l.libelle}</th>{cellules}</tr>
  );
  const totalCase = (l: (typeof lignes)[number], m: MontantC, attr: string) => <td className="trx-total" data-cout={attr}>{l.aVenir && m.htC === 0 ? '—' : montant(m)}</td>;
  const tableVente = (
    <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts" data-table-couts-mon-espace="vente">
      <colgroup><col /></colgroup><colgroup span={5} className="trx-g trx-g--fond" data-bloc-colonnes="vente" /><colgroup span={1} className="trx-g" data-bloc-colonnes="total" />
      <thead><tr><th scope="col">Mois</th><th scope="col">Commissions des négociateurs</th><th scope="col">Apporteurs</th><th scope="col">Agences extérieures</th>
        {enteteFutur('Salaires chargés')}{enteteFutur('Autres')}<th scope="col">Total vente</th></tr></thead>
      <tbody>{lignes.map((l) => ligne(l, <>
        <td data-cout="vente-commissions">{montant(l.p.vente.commissions)}</td><td data-cout="vente-apporteurs">{montant(l.p.vente.apporteurs)}</td>
        <td data-cout="vente-exterieures">{montant(l.p.vente.exterieures)}</td>{futur('Salaires chargés')}{futur('Autres')}{totalCase(l, l.p.vente.total, 'vente-total')}</>))}</tbody>
    </table>
  );
  const tableLG = !lg ? <p className="loc-muet mes-vide" data-couts-macj>{sansLG} : la location et la gestion sont à CRITERIMMO.</p>
    : A.location === null && A.gestion === null ? null : (
      <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts" data-table-couts-mon-espace="location-gestion">
        <colgroup><col /></colgroup><colgroup span={9} className="trx-g trx-g--fond" data-bloc-colonnes="location" /><colgroup span={5} className="trx-g" data-bloc-colonnes="gestion" />
        <colgroup span={1} className="trx-g trx-g--fond" data-bloc-colonnes="total" />
        <thead>
          <tr><th scope="col" rowSpan={2}>Mois</th><th scope="colgroup" colSpan={9} data-groupe-couts="location">Location</th><th scope="colgroup" colSpan={5} data-groupe-couts="gestion">Gestion</th>
            <th scope="col" rowSpan={2}>Total location et gestion</th></tr>
          <tr><th scope="col">Apporteurs</th><th scope="col">dont primes de gestion <small className="loc-muet">(dans le variable)</small></th>
            <th scope="col">Variable négociateur <small className="loc-muet">(primes incluses)</small></th><th scope="col">Salaires chargés</th>
            <th scope="col" data-entete-info>Variable négo (calculé) <small className="loc-muet">(pour information, hors totaux)</small></th>
            {enteteFutur('Part de gestion versée aux apporteurs')}{enteteFutur('Rémunération des collègues apporteurs')}{enteteFutur('Autres')}<th scope="col">Total location</th>
            <th scope="col">Salaires chargés</th><th scope="col">ADHOC</th><th scope="col">MONGA <small className="loc-muet">(facture mensuelle)</small></th>{enteteFutur('Autres')}<th scope="col">Total gestion</th></tr>
        </thead>
        <tbody>{lignes.map((l) => { const L = l.p.location; const G = l.p.gestion; return ligne(l, <>
          {L === null ? <><td colSpan={9} className="loc-muet" data-location-non-lue>La location n’a pas pu être lue.</td></> : <>
            <td data-cout="location-apporteurs">{montant(L.apporteurs)}</td><td data-cout="location-primes">{info(L.primes)}</td>
            <td data-cout="location-variable">{montant(L.variable)}</td><td data-cout="location-salaires">{montant(L.salaires)}</td>
            <td data-cout="location-variable-calcule">{info(L.variableCalcule)}</td>
            {futur('Part de gestion versée aux apporteurs')}{futur('Rémunération des collègues apporteurs')}{futur('Autres')}{totalCase(l, L.total, 'location-total')}</>}
          {G === null ? <td colSpan={5} /> : <>
            <td data-cout="gestion-salaires">{montant(G.salaires)}</td><td data-cout="gestion-adhoc">{montant(G.adhoc)}</td><td data-cout="gestion-monga">{montant(G.monga)}</td>
            {futur('Autres')}{totalCase(l, G.total, 'gestion-total')}</>}
          {totalCase(l, { htC: (L?.total.htC ?? 0) + (G?.total.htC ?? 0), ttcC: (L?.total.ttcC ?? 0) + (G?.total.ttcC ?? 0) }, 'location-gestion-total')}</>); })}</tbody>
      </table>
    );
  return (
    <div className="mes-couts tdb loc-page" data-transaction={agence} data-couts-mon-espace={agence}>
      <style>{CSS_TABLES_GROUPES + CSS_COUTS_GLOBAUX + CSS_COUTS_MON_ESPACE}</style>
      <LigneDesAnnees annees={annees} decoupage="annee" annee={annee} choisies={[annee]} onAnnee={setAnnee} onDecoupage={() => {}} uneSeule />
      <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`Les coûts ${annee} — ${nom}`} data-tuiles-couts>
        {tuile('total', <>Coûts {MOT} — {annee}</>, A.total, A1.total)}
        {tuile('vente', <>Vente {MOT}</>, A.vente.total, A1.vente.total)}
        {tuile('location', <>Location {MOT}</>, A.location?.total ?? null, A1.location?.total ?? null, lg ? 'La location n’a pas pu être lue.' : sansLG)}
        {tuile('gestion', <>Gestion {MOT}</>, A.gestion?.total ?? null, A1.gestion?.total ?? null, sansLG)}
      </ul>
      {/* le graphique du CA global du Suivi CA, sur les coûts : les familles entre elles (par défaut), ou l'année précédente (Comparer), Mensuel / Cumul */}
      <GrapheGlobal key={agence} eG={eG} eC={eC} jour={jour} annee={annee} annees={null} salaires rouges={moisRougesDeLAnnee(annee, [annee], jour)}
        initiaux={{ mesure: 'couts', comparer: 'activites', empile: false }} verrous={{ structures: STRUCTURES[agence] }} />
      <section className="tdb-section" aria-labelledby="mes-couts-tableau" data-bloc="couts-mon-espace">
        <h3 id="mes-couts-tableau">Les coûts {annee} mois par mois — {nom} <small className="loc-muet">({MOT}{u === 'ttc' ? ' ; apporteurs et primes de location, variable et salaires sans TVA' : ''})</small></h3>
        <div className="trx-vues mes-couts-onglets" role="tablist" aria-label="Le tableau des coûts">
          {([['vente', 'Vente'], ['location-gestion', 'Location et gestion']] as const).map(([cle, mot]) => (
            <button key={cle} type="button" role="tab" className="tdb-onglet" aria-selected={tableau === cle} onClick={() => setTableau(cle)} data-tableau-couts={cle}>{mot}</button>))}
        </div>
        <div className="trx-couts-defile trx-table-defile" data-defile-couts>{tableau === 'vente' ? tableVente : tableLG}</div>
        <p className="loc-muet trx-couts-note" data-couts-note>Chaque montant est celui du Suivi CA (« Coûts globaux » ; en CRITERIMMO ou MACJ, les lignes de carte de la structure) ;
          l’inter-cabinet entre nos sociétés n’est jamais un coût. Salaires chargés comptés ; primes et variable : « inclus dans les salaires » les mois où les
          salaires de la Location sont saisis (le « Variable négo (calculé) » le montre, hors totaux).</p>
      </section>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Les jetons de la charte (Clair et Sombre) ; les tuiles en colonnes egales dans la largeur du conteneur. */
const CSS_COUTS_MON_ESPACE = `
.mes-couts{container-type:inline-size;container-name:mes-couts}
.mes-couts .tdb-tuiles{grid-template-columns:repeat(4,minmax(0,1fr))}
@container mes-couts (max-width:620px){ .mes-couts .tdb-tuiles{grid-template-columns:repeat(2,minmax(0,1fr))} }
@container mes-couts (max-width:300px){ .mes-couts .tdb-tuiles{grid-template-columns:minmax(0,1fr)} }
.mes-couts .tdb-tuile>*{overflow-wrap:anywhere;white-space:normal}
.mes-couts-onglets{margin:0 0 10px;border-bottom:1px solid var(--color-svv-line)}
.mes-table-couts td.mes-couts-futur{background:color-mix(in srgb, var(--color-svv-ink) 3%, transparent)}
.mes-table-couts th[data-entete-futur],.mes-table-couts th[data-entete-info]{color:var(--color-svv-muted)}
.mes-table-couts thead th small{display:block;font-size:.6rem;font-weight:600;text-transform:none;letter-spacing:0}
@media (max-width:1024px){ .tdb-table.mes-table-couts{min-width:900px} }
`;
