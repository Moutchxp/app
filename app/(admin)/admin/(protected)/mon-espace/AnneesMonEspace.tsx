'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ecrireAdresse, ESPACE, MOT_UNITE, parametre, signePct, useAffichage, useConsolide } from '../transaction/commun';
import { anneesRouges, attributAnneesRouges, Explication, GrapheAnnees, GrapheMois, LigneDesAnnees, libelleAnnees, moisRougesDeLAnnee, StyleAnneesRouges,
  type useLigneDesAnnees } from '../transaction/EcransTransaction';
import { CourbeCumul, EnteteGraphe, Histogramme, PAS_ANNEE_FIXE, type InfoBarre } from '../location/TableauBordSuivi';
import { GrapheMoisStats } from './MesStatistiques';
import { cumuler } from '../../../../lib/transaction/cumul';
import { eur } from '../../../../lib/transaction/format';
import { anneesSoulignees } from '../../../../lib/transaction/periodeAnnees';
import { motSansN1Pour, type DonneesSociete } from '../../../../lib/transaction/modele';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';
import { totauxDuChoix, type StatsMonEspace } from '../../../../lib/mon-espace/statistiques';
import { tuilesAnneesAgence, tuilesAnneesPerso, type Montant } from '../../../../lib/mon-espace/accueil';

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — L'ONGLET « ANNÉE(S) » AU FORMAT DU SUIVI CA ═════════════════════════════════════════════════════════════════
 * Les briques de « L'année » des pages Transaction : la rangée des années et « Année | Période | Tout » (`LigneDesAnnees`, `useLigneDesAnnees`, les
 * années soulignées en rouge), les quatre tuiles (mêmes classes), le graphique « Année par année » (une année s'ouvre d'un clic ; Annuel / Cumul) et,
 * au choix de l'échelle, « Mois par mois » de l'année montrée (un mois ouvre l'onglet « Mois »).
 *   · « Mon espace » : mes chiffres (« Mes statistiques », `tuilesAnneesPerso`) ; 4ᵉ tuile : « Mes compromis en cours » (ma part, décision 6) ;
 *   · mode agence : les tuiles de « L'année » (`tuilesAnneesAgence`) et SES graphiques (`GrapheAnnees`, `GrapheMois`) ; 4ᵉ tuile : « CA net ».
 */
type LigneAnnees = ReturnType<typeof useLigneDesAnnees>;
export function AnneesMonEspace({ data, ligne, annees, onOuvrirMois, onOuvrir }: { data: MesAffaires; ligne: LigneAnnees; annees: readonly number[];
  onOuvrirMois: (a: number, m: number) => void; onOuvrir: (o: 'compromis' | 'ventes', annee?: number) => void }) {
  const jour = data.aujourdhui;
  const u = useAffichage();
  const cons = useConsolide();
  const [echelle, setEchelle] = useState<'annees' | 'mois'>(() => (parametre('graphe') === 'mois' ? 'mois' : 'annees'));
  useEffect(() => { ecrireAdresse({ graphe: echelle === 'mois' ? 'mois' : null }); }, [echelle]);
  const { choixA, refusAnnees, choisirAnnee, choisirDecoupageAnnees, anneesVisibles } = ligne;
  if (choixA === null) return null;
  const agence = data.agence ?? null;
  const s = data.statistiques ?? { annees: [] };
  const visibles = anneesVisibles ?? annees;
  const enTout = choixA.decoupage === 'tout';
  const sel = enTout ? [...visibles] : [...choixA.annees].sort((a, b) => a - b);
  const annee = choixA.annee;
  const dSoc: DonneesSociete | null = agence === null ? null : { disponible: data.disponible, societe: agence.societe, aujourdhui: jour, ventes: data.ventes,
    retrocessions: data.retrocessions ?? [], aRattacher: [], statutsNegociateurs: data.statutsNegociateurs, nomsNegociateurs: data.nomsNegociateurs };
  const t = dSoc === null ? tuilesAnneesPerso(s, sel, enTout, jour) : tuilesAnneesAgence(dSoc, sel, enTout, jour);
  const MOT = MOT_UNITE[u];
  const mot = (x: string): string => (agence === null ? x : cons(x));
  const grand = (m: Montant): string => eur(u === 'ht' ? m.ht : m.ttc);
  const petit = (m: Montant): string => `(${eur(u === 'ht' ? m.ttc : m.ht)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})`;
  const lib = enTout ? 'toutes les années' : libelleAnnees(choixA);
  const toutes = `Toutes les années (${visibles[0]} → ${visibles.at(-1)})`;
  const enN1 = sel.length === 1 ? `en ${sel[0] - 1}` : 'un an plus tôt';
  const sansN1 = motSansN1Pour(sel[0] ?? annee, 'vendu');
  const n1 = (x: Montant | null, pct: number | null): string => (enTout ? toutes : x === null ? sansN1 : `${grand(x)} ${enN1} (${signePct(pct)})`);
  // 4ᵉ tuile « Mon espace » : ma part des compromis en cours (décision 6) ; projection = mon CA acté de l'année en cours + ce prévisionnel.
  const anCourant = Number(jour.slice(0, 4));
  const prev = { ht: data.compteurs.compromis.ca.htC / 100, ttc: data.compteurs.compromis.ca.ttcC / 100 };
  const acte = totauxDuChoix(s, { mode: 'annee', annee: anCourant, mois: 1, periode: [1] }, jour).n.ca;
  const choixEchelle = (
    <div className="trx-unites trx-choix-echelle" role="group" aria-label="L’échelle du graphique" data-echelle-choix={echelle}>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'annees'} onClick={() => setEchelle('annees')} data-echelle="annees">Année par année</button>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'mois'} onClick={() => setEchelle('mois')} data-echelle="mois">Mois par mois — {annee}</button>
    </div>
  );
  const rougesMois = moisRougesDeLAnnee(annee, anneesSoulignees(choixA.decoupage, annee, sel, visibles), jour);
  return (
    <div className="mes-annees tdb loc-page" data-annees-mon-espace={agence?.cle ?? 'moi'}>
      <LigneDesAnnees annees={visibles} decoupage={choixA.decoupage} annee={annee} choisies={sel} onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
      {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
      <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${lib}`} data-tuiles-annees>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-annee">
          <span className="tdb-tuile-mot">{mot(`CA ${MOT}`)} — {lib}{agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="ca-annee">{grand(t.ca.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.ca.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca">{n1(t.ca.n1, t.ca.pct)}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ventes-annee">
          <span className="tdb-tuile-mot">Ventes — {lib}</span><strong className="tdb-tuile-valeur" data-valeur-tuile="nombre-annee">{t.nb.valeur}</strong>
          <span className="tdb-tuile-n1" data-tuile-n1="nombre">{enTout ? toutes : t.nb.n1 === null ? sansN1 : `${t.nb.n1} ${enN1}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-a-date">
          <span className="tdb-tuile-mot">{enTout ? <>{mot(`CA ${MOT}`)} — à date (toutes les années)</> : <>{mot(`CA ${MOT}`)} — {lib} à date</>}{agence !== null && <Explication sorte="ca" />}</span>
          <strong className="tdb-tuile-valeur" data-valeur-tuile="a-date">{grand(t.aDate.valeur)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.aDate.valeur)}</small>
          <span className="tdb-tuile-n1" data-tuile-n1="a-date">{n1(t.aDate.n1, t.aDate.pct)}</span></button></li>
        {t.net !== undefined ? (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('ventes', annee)} data-tuile="ca-net-annee">
            <span className="tdb-tuile-mot">{mot(`CA net ${MOT}`)} — {lib}<Explication sorte="net" /></span>
            <strong className="tdb-tuile-valeur" data-ca-net-annee>{grand(t.net.valeur)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(t.net.valeur)}</small>
            <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{n1(t.net.n1, t.net.pct)}</span></button></li>
        ) : (
          <li><button type="button" className="tdb-tuile" onClick={() => onOuvrir('compromis')} data-tuile="mes-compromis">
            <span className="tdb-tuile-mot">Mes compromis en cours ({MOT}) <small className="trx-tuile-explication">ma part, le prévisionnel</small></span>
            <strong className="tdb-tuile-valeur" data-valeur-tuile="previsionnel">{grand(prev)}</strong>
            <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>{petit(prev)}</small>
            <span className="tdb-tuile-n1" data-tuile-nb-compromis>{data.compteurs.compromis.nb} compromis</span>
            <span className="tdb-tuile-n1" data-tuile-projection>Projection {anCourant} : {grand({ ht: acte.htC / 100, ttc: acte.ttcC / 100 })} acté + {grand(prev)} = {grand({ ht: acte.htC / 100 + prev.ht, ttc: acte.ttcC / 100 + prev.ttc })}</span></button></li>
        )}
      </ul>
      {dSoc !== null
        ? (echelle === 'annees'
          ? <GrapheAnnees d={dSoc} tout={dSoc} annees={visibles} selection={sel} comparaison={enTout ? toutes : null} annee={annee} decoupage={choixA.decoupage} jour={jour} mode="vendu" series={null} onAnnee={choisirAnnee} entete={choixEchelle} />
          : <GrapheMois d={dSoc} tout={dSoc} annee={annee} mois={0} jour={jour} mode="vendu" series={null} onMois={(m) => onOuvrirMois(annee, m)} moisSeul={false} periodeAnnee={null}
            rouges={rougesMois} entete={choixEchelle} />)
        : (echelle === 'annees'
          ? <GrapheAnneesStats s={s} annees={visibles} selection={sel} annee={annee} decoupage={choixA.decoupage} jour={jour} comparaison={enTout ? toutes : null} onAnnee={choisirAnnee} entete={choixEchelle} />
          : <GrapheMoisStats s={s} annee={annee} jour={jour} id="annees-mois" bloc="annees-mois" rouges={rougesMois} motCa="CA" motCaTitre="mon CA" motNombre="Nombre de ventes"
            courante={0} selectionCumul={0} onChoisir={(m) => onOuvrirMois(annee, m)} cumulCliquable entete={choixEchelle} />)}
    </div>
  );
}

/**
 * « Année par année » sur MES chiffres : les briques de `GrapheAnnees` du Suivi CA (Histogramme à pas fixe, Annuel / Cumul, CA | Nombre de ventes,
 * l'encadré à droite avec l'année précédente, une année s'ouvre d'un clic, les années soulignées en rouge) ; une année = ses 12 mois + ses ventes
 * « mois à confirmer » (« Mes statistiques »).
 */
function GrapheAnneesStats({ s, annees, selection, annee, decoupage, jour, comparaison, onAnnee, entete }: { s: StatsMonEspace; annees: readonly number[];
  selection: readonly number[]; annee: number; decoupage: 'annee' | 'periode' | 'tout'; jour: string; comparaison: string | null; onAnnee: (a: number) => void; entete: ReactNode }) {
  const u = useAffichage();
  const [cumul, setCumul] = useState(false);
  const [mesure, setMesure] = useState<'ca' | 'nombre'>('ca');
  const nombre = mesure === 'nombre';
  const anneeEnCours = Number(jour.slice(0, 4));
  const totaux = (a: number) => totauxDuChoix(s, { mode: 'annee', annee: a, mois: 1, periode: [1] }, jour).n;
  const val = (a: number): number => { const x = totaux(a); return nombre ? x.nb : (u === 'ht' ? x.ca.htC : x.ca.ttcC) / 100; };
  const autre = (a: number): number => { const x = totaux(a).ca; return (u === 'ht' ? x.ttcC : x.htC) / 100; };
  const vals = annees.map(val);
  const nbs = annees.map((a) => totaux(a).nb);
  const dernier = annees.filter((a) => a <= anneeEnCours).length;
  const cumule = (xs: readonly number[], k: number): number => xs.slice(0, k + 1).reduce((t, x) => t + x, 0);
  const motGraphe = nombre ? 'nombre de ventes' : `mon CA ${MOT_UNITE[u]}`;
  const info = (a: number, enCumul: boolean): InfoBarre => {
    const k = annees.indexOf(a);
    const avant = comparaison === null && annees.includes(a - 1);
    const titre = enCumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === anneeEnCours ? ' — en cours' : ''}`;
    const v = enCumul ? cumule(vals, k) : vals[k]; const v1 = avant ? (enCumul ? cumule(vals, k - 1) : vals[k - 1]) : 0;
    const nb = enCumul ? cumule(nbs, k) : nbs[k]; const nb1 = avant ? (enCumul ? cumule(nbs, k - 1) : nbs[k - 1]) : 0;
    const sansN1 = comparaison ?? `${a - 1} : aucune vente`;
    if (nombre) return { titre, compte: enCumul ? 'Ventes (cumul)' : 'Ventes', sansN1, courant: { libelle: String(a), ca: v, nb: null }, precedent: avant ? { libelle: String(a - 1), ca: v1, nb: null } : null };
    return { titre, motNb: 'Ventes', motCa: `Mon CA ${MOT_UNITE[u]}`, sansN1, courant: { libelle: String(a), ca: v, nb, ...(enCumul ? {} : { caAutre: autre(a) }) },
      precedent: avant ? { libelle: String(a - 1), ca: v1, nb: nb1, ...(enCumul ? {} : { caAutre: autre(a - 1) }) } : null };
  };
  const rouges = anneesRouges(decoupage, annee, selection, annees);
  return (
    <section className="tdb-section" aria-labelledby="mes-annees" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees" {...attributAnneesRouges(rouges)}>
      <StyleAnneesRouges annees={rouges} />
      <EnteteGraphe<'ca' | 'nombre'> id="mes-annees" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Annuel"
        mesures={[{ cle: 'ca', mot: 'CA' }, { cle: 'nombre', mot: 'Nombre de ventes' }]}
        titre={<>Année par année <small className="loc-muet">({motGraphe}{cumul ? `, cumulé depuis ${annees[0]}` : ''} ; une année s’ouvre d’un clic)</small></>} />
      {entete}
      {cumul ? (
        <CourbeCumul courant={cumuler(vals).slice(0, dernier)} n1={null} annee={annee} selection={annee} entier={nombre} aria={`${motGraphe} cumulé par année`}
          etiquettes={annees.map(String)} cles={annees} nom="annees-cumul" attributZone="data-annee-cumul" bulle={(a) => info(a, true)} onChoisir={onAnnee}
          legende={<><span className="tdb-legende tdb-legende--courant" /> cumul depuis {annees[0]}</>} />
      ) : (
        <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={onAnnee} entier={nombre} pasFixe={PAS_ANNEE_FIXE} aria={`${motGraphe} par année`}
          barres={annees.map((a, k) => ({ cle: a, libelle: String(a), valeur: a > anneeEnCours ? null : vals[k], info: info(a, false) }))} />
      )}
    </section>
  );
}
