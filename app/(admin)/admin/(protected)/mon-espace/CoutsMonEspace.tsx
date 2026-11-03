'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { classeSens, ecrireAdresse, EnteteAide, ESPACE, eur, MOT_UNITE, parametre, signePct, useAffichage } from '../transaction/commun';
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
/** 🔴 C12 (Arno, 03/11/2026) — quatre onglets ; « Vente » par défaut ; le choix est dans l'adresse (`?couts-tableau=`). */
export type OngletTableau = 'vente' | 'location' | 'gestion' | 'synthese';
const ONGLETS_TABLEAU: readonly (readonly [OngletTableau, string])[] = [['vente', 'Vente'], ['location', 'Location'], ['gestion', 'Gestion'], ['synthese', 'Synthèse location et gestion']];
const ongletDeLAdresse = (x: string | null): OngletTableau => (ONGLETS_TABLEAU.some(([c]) => c === x) ? (x as OngletTableau) : 'vente');
const STRUCTURES: Record<Agence, StructureGraphe[]> = { criterimmo: ['criterimmo'], macj: ['macj'], tous: ['criterimmo', 'macj'] };
/** 🔴 C14 (Arno, 03/11/2026) — la phrase du picto « i » de chaque colonne encore sans saisie. */
export const AIDE_POSTES_FUTURS: Record<string, string> = {
  autres: 'Frais saisis à la main : loyer, logiciels, portails d’annonces, assurances, comptable, banque, publicité, GLI…',
  'part-gestion': 'Ce que l’agence reverse chaque mois aux apporteurs sur les mandats de gestion qu’ils ont amenés.',
  collegues: 'Ce que touchent les collègues qui apportent des affaires.',
  salaires: 'Les salaires chargés des collaborateurs de la vente, saisis par salarié et par mois.',
};

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
  const [tableau, setTableau] = useState<OngletTableau>(() => ongletDeLAdresse(parametre('couts-tableau')));
  useEffect(() => { ecrireAdresse({ 'couts-tableau': tableau === 'vente' ? null : tableau }); }, [tableau]);
  // quitter « Les coûts » : l'adresse n'en garde rien
  useEffect(() => () => { ecrireAdresse({ 'couts-tableau': null }); }, []);
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
  // 🔴 C14 — une colonne encore sans saisie : son titre simple et un picto « i » qui dit ce qu'elle contiendra (le composant du Suivi CA)
  const enteteFutur = (mot: string, cle: string) => <th key={cle} scope="col" data-entete-futur={cle}>
    <EnteteAide libelle={mot} cible={`mes-couts-${cle}`} etiquette={`Ce que contiendra « ${mot} »`} texte={AIDE_POSTES_FUTURS[cle.replace(/^(vente|location|gestion)-/, '')]} /></th>;
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
        {enteteFutur('Salaires chargés', 'vente-salaires')}{enteteFutur('Autres', 'vente-autres')}<th scope="col">Total vente</th></tr></thead>
      <tbody>{lignes.map((l) => ligne(l, <>
        <td data-cout="vente-commissions">{montant(l.p.vente.commissions)}</td><td data-cout="vente-apporteurs">{montant(l.p.vente.apporteurs)}</td>
        <td data-cout="vente-exterieures">{montant(l.p.vente.exterieures)}</td>{futur('Salaires chargés')}{futur('Autres')}{totalCase(l, l.p.vente.total, 'vente-total')}</>))}</tbody>
    </table>
  );
  // 🔴 C7 / C12 — MACJ : les onglets Location, Gestion et Synthèse sont là, chaque case « — », avec la mention (rien n'est masqué)
  const macj = (cle: string, colonnes: readonly ReactNode[]) => <>
    <p className="loc-muet mes-vide" data-couts-macj={cle}>{sansLG} (la location et la gestion sont à CRITERIMMO).</p>
    <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts" data-table-couts-mon-espace={cle}>
      <thead><tr><th scope="col">Mois</th>{colonnes}</tr></thead>
      <tbody>{lignes.map((l) => ligne(l, <>{colonnes.map((_, x) => <td key={x} data-cout-macj>—</td>)}</>))}</tbody>
    </table></>;
  const nonLue = (n: number) => <td colSpan={n} className="loc-muet" data-location-non-lue>La location n’a pas pu être lue.</td>;
  // 🔴 C10 / C11 — Location : Apporteurs, Variable négo (calculé) (information, hors totaux), Primes de gestion, Variable négociateur (primes incluses),
  // puis Salaires chargés, Part de gestion versée aux apporteurs, Rémunération des collègues apporteurs, Autres, Total location
  const entetesLocation = [<th key="a" scope="col">Apporteurs</th>,
    <th key="c" scope="col" data-entete-info>Variable négo (calculé) <small className="loc-muet">(pour information, hors totaux)</small></th>,
    <th key="p" scope="col">Primes de gestion</th>, <th key="v" scope="col">Variable négociateur <small className="loc-muet">(primes incluses)</small></th>,
    <th key="s" scope="col">Salaires chargés</th>, enteteFutur('Part de gestion versée aux apporteurs', 'location-part-gestion'), enteteFutur('Rémunération des collègues apporteurs', 'location-collegues'), enteteFutur('Autres', 'location-autres'),
    <th key="t" scope="col">Total location</th>];
  const tableLocation = !lg ? macj('location', entetesLocation) : (
    <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts" data-table-couts-mon-espace="location">
      <colgroup><col /></colgroup><colgroup span={8} className="trx-g trx-g--fond" data-bloc-colonnes="location" /><colgroup span={1} className="trx-g" data-bloc-colonnes="total" />
      <thead><tr><th scope="col">Mois</th>{entetesLocation}</tr></thead>
      <tbody>{lignes.map((l) => { const L = l.p.location; return ligne(l, L === null ? nonLue(9) : <>
        <td data-cout="location-apporteurs">{montant(L.apporteurs)}</td><td data-cout="location-variable-calcule">{info(L.variableCalcule)}</td>
        <td data-cout="location-primes">{info(L.primes)}</td><td data-cout="location-variable">{montant(L.variable)}</td>
        <td data-cout="location-salaires">{montant(L.salaires)}</td>
        {futur('Part de gestion versée aux apporteurs')}{futur('Rémunération des collègues apporteurs')}{futur('Autres')}{totalCase(l, L.total, 'location-total')}</>); })}</tbody>
    </table>
  );
  const entetesGestion = [<th key="s" scope="col">Salaires chargés</th>, <th key="a" scope="col">ADHOC</th>,
    <th key="m" scope="col">MONGA</th>, enteteFutur('Autres', 'gestion-autres'), <th key="t" scope="col">Total gestion</th>];
  const tableGestion = !lg ? macj('gestion', entetesGestion) : (
    <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts" data-table-couts-mon-espace="gestion">
      <colgroup><col /></colgroup><colgroup span={4} className="trx-g trx-g--fond" data-bloc-colonnes="gestion" /><colgroup span={1} className="trx-g" data-bloc-colonnes="total" />
      <thead><tr><th scope="col">Mois</th>{entetesGestion}</tr></thead>
      <tbody>{lignes.map((l) => { const G = l.p.gestion; return ligne(l, G === null ? <td colSpan={5} /> : <>
        <td data-cout="gestion-salaires">{montant(G.salaires)}</td><td data-cout="gestion-adhoc">{montant(G.adhoc)}</td><td data-cout="gestion-monga">{montant(G.monga)}</td>
        {futur('Autres')}{totalCase(l, G.total, 'gestion-total')}</>); })}</tbody>
    </table>
  );
  // 🔴 C12 — la synthèse : les MÊMES totaux que les onglets Location et Gestion (`total` de chaque famille), et leur somme ; rien d'autre
  const entetesSynthese = [<th key="l" scope="col">Total location</th>, <th key="g" scope="col">Total gestion</th>, <th key="t" scope="col">Total location et gestion</th>];
  const tableSynthese = !lg ? macj('synthese', entetesSynthese) : (
    <table className="tdb-table trx-table-groupes trx-table-couts mes-table-couts mes-table-synthese" data-table-couts-mon-espace="synthese">
      <colgroup><col /></colgroup><colgroup span={2} className="trx-g trx-g--fond" /><colgroup span={1} className="trx-g" data-bloc-colonnes="total" />
      <thead><tr><th scope="col">Mois</th>{entetesSynthese}</tr></thead>
      <tbody>{lignes.map((l) => { const L = l.p.location; const G = l.p.gestion; return ligne(l, <>
        {L === null ? nonLue(1) : totalCase(l, L.total, 'location-total')}{G === null ? <td /> : totalCase(l, G.total, 'gestion-total')}
        {totalCase(l, { htC: (L?.total.htC ?? 0) + (G?.total.htC ?? 0), ttcC: (L?.total.ttcC ?? 0) + (G?.total.ttcC ?? 0) }, 'location-gestion-total')}</>); })}</tbody>
    </table>
  );
  const tables: Record<OngletTableau, ReactNode> = { vente: tableVente, location: tableLocation, gestion: tableGestion, synthese: tableSynthese };
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
          {ONGLETS_TABLEAU.map(([cle, mot]) => (
            <button key={cle} type="button" role="tab" className="tdb-onglet" aria-selected={tableau === cle} onClick={() => setTableau(cle)} data-tableau-couts={cle}>{mot}</button>))}
        </div>
        <div className="trx-couts-defile trx-table-defile" data-defile-couts>{tables[tableau]}</div>
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
.mes-table-couts [data-info-couts]{font-size:inherit}
/* au telephone, la bulle du picto reste dans la zone du tableau qui defile (elle y serait coupee a droite) */
@media (max-width:640px){ .mes-table-couts .svv-pil-ib-bulle{max-width:min(200px,calc(100vw - 150px))} }
.mes-table-couts thead th small{display:block;font-size:.6rem;font-weight:600;text-transform:none;letter-spacing:0}
@media (max-width:1024px){ .tdb-table.mes-table-couts{min-width:640px} .tdb-table.mes-table-synthese{min-width:0} }
`;
