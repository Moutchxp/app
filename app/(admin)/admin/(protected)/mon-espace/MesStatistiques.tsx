'use client';

import { useState, type ReactNode } from 'react';
import { COURT, ecartEur, montantAffiche, MOT_UNITE, signePct, useAffichage, useNommer } from '../transaction/commun';
import { attributMoisRouges, StyleMoisRouges } from '../transaction/EcransTransaction';
import { CourbeCumul, EnteteGraphe, Histogramme, type InfoBarre } from '../location/TableauBordSuivi';
import { cumuler } from '../../../../lib/transaction/cumul';
import { NOMS_MOIS, type Vente } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { MesAffaires } from '../../../../lib/mon-espace/mesAffaires';
import { apporteursAgence, LIBELLE_AGENCE, negociateursAgence } from '../../../../lib/mon-espace/agence';
import { ligneDuSuiviCa, TableauParApporteur } from './ListeAffairesPeriode';
import { mesApporteurs, moisDuChoix, totauxDuChoix, variation, type ChoixStats, type ModeStats, type StatsMonEspace } from '../../../../lib/mon-espace/statistiques';

/**
 * 🔴 Décision 14 (Arno, 02/11/2026) : l'onglet « Mes statistiques » est retiré de la barre ; ce composant n'est plus affiché (ses chiffres sont
 * dans les cartes, le graphique et les tableaux sous le graphique de « Mois » / « Année(s) ») — gardé, éprouvé, pour mémoire.
 * ══ 🔴 MON ESPACE, LOT 8 (Arno, 02/11/2026) — L'ONGLET « MES STATISTIQUES » ════════════════════════════════════════════════════════════════════════
 * Les chiffres du titulaire, lus du serveur (le filtre du lot 3, `statistiques.ts`) — jamais la commission d'un autre collègue :
 *   · le choix : Mois / Période / Année / Tout, l'année ; mon CA (décision 1) et son N−1 sur la MÊME période, en € et en % ; mes ventes actées ;
 *   · le prévisionnel (mon CA sur mes compromis en cours), À PART ; « CA acté + prévisionnel = projection de l'année » ;
 *   · le graphique mois par mois du Suivi CA (les mêmes briques : barres N, N−1 hachurées, Mensuel / Cumul, les mois soulignés en rouge — la
 *     règle `moisSoulignes`) ; le cumul : la fonction partagée (`cumuler`) ;
 *   · par apporteur : `parApporteur` du Suivi CA, sur les rétrocessions de la période liées à mes ventes.
 * La bascule « HT | TTC » est celle de l'espace (même mémoire que le Suivi CA).
 * 🔴 LOT 10 — en MODE AGENCE (`data.agence`), le même écran sur toute la structure : les chiffres du serveur sont ceux du Suivi CA (`agence.ts`),
 * le prévisionnel = les compromis en cours de la structure, et deux blocs suivent le choix : par négociateur (`espaceNegociateurs`) et par
 * apporteur (`parApporteur`, comme « L'année »).
 */
const MODES: readonly { cle: ModeStats; mot: string }[] = [{ cle: 'mois', mot: 'Mois' }, { cle: 'periode', mot: 'Période' }, { cle: 'annee', mot: 'Année' }, { cle: 'tout', mot: 'Tout' }];

export function MesStatistiques({ data }: { data: MesAffaires }) {
  const u = useAffichage();
  const nommer = useNommer();
  const jour = data.aujourdhui;
  const agence = data.agence ?? null;
  const dAgence = agence === null ? null : { societe: agence.societe, ventes: data.ventes as Vente[], retrocessions: data.retrocessions ?? [], statutsNegociateurs: data.statutsNegociateurs };
  const nomAgence = agence === null ? null : LIBELLE_AGENCE[agence.cle];
  const motCa = nomAgence === null ? 'Mon CA' : `CA ${nomAgence}`;
  const anCourant = Number(jour.slice(0, 4));
  const moisCourant = Number(jour.slice(5, 7));
  const s = data.statistiques ?? { annees: [] };
  const [choix, setChoix] = useState<ChoixStats>({ mode: 'annee', annee: anCourant, mois: moisCourant, periode: [1, moisCourant] });
  const v = (m: MontantC): number => (u === 'ht' ? m.htC : m.ttcC) / 100;
  const txt = (m: MontantC): string => montantAffiche(u, m.htC / 100, m.ttcC / 100);
  const t = totauxDuChoix(s, choix, jour);
  const libelleChoix = choix.mode === 'tout' ? 'toutes années' : choix.mode === 'annee' ? String(choix.annee)
    : choix.mode === 'mois' ? `${NOMS_MOIS[choix.mois - 1].toLowerCase()} ${choix.annee}`
    : `${COURT[choix.periode[0] - 1]} → ${COURT[choix.periode[choix.periode.length - 1] - 1]} ${choix.annee}`;
  const prev = data.compteurs.compromis.ca;
  const acteAnnee = totauxDuChoix(s, { ...choix, mode: 'annee', annee: anCourant }, jour).n.ca;
  const projection = { htC: acteAnnee.htC + prev.htC, ttcC: acteAnnee.ttcC + prev.ttcC };
  const apporteurs = dAgence === null ? mesApporteurs(data.retrocessions ?? [], data.ventes as Vente[], choix, jour) : apporteursAgence(dAgence, choix, jour);
  const negociateurs = dAgence === null ? null : negociateursAgence(dAgence, choix, jour);
  const annees = s.annees.map((x) => x.annee).sort((a, b) => b - a);
  const an = s.annees.find((x) => x.annee === choix.annee);
  const rouges = choix.mode === 'tout' ? null : moisDuChoix(choix, jour);
  const ecart = t.n1 === null ? null : { eur: v(t.n.ca) - v(t.n1.ca), pct: variation(t.n.ca.htC, t.n1.ca.htC) };

  return (
    <div className="mes-stats" data-mes-statistiques>
      <div className="mes-stats-choix" role="group" aria-label="La période">
        <div className="trx-unites" role="group" aria-label="Découpage">
          {MODES.map((m) => <button key={m.cle} type="button" className="trx-unite" aria-pressed={choix.mode === m.cle} onClick={() => setChoix({ ...choix, mode: m.cle })}
            data-mode-stats={m.cle}>{m.mot}</button>)}
        </div>
        {choix.mode !== 'tout' && <label className="mes-annee">Année
          <select value={choix.annee} onChange={(e) => setChoix({ ...choix, annee: Number(e.target.value) })} data-annee-stats>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>}
        {choix.mode === 'mois' && <label className="mes-annee">Mois
          <select value={choix.mois} onChange={(e) => setChoix({ ...choix, mois: Number(e.target.value) })} data-mois-stats>
            {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>}
        {choix.mode === 'periode' && <>
          <label className="mes-annee">De
            <select value={choix.periode[0]} data-periode-de
              onChange={(e) => { const de = Number(e.target.value); const a = Math.max(de, choix.periode[choix.periode.length - 1]); setChoix({ ...choix, periode: Array.from({ length: a - de + 1 }, (_, i) => de + i) }); }}>
              {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label className="mes-annee">À
            <select value={choix.periode[choix.periode.length - 1]} data-periode-a
              onChange={(e) => { const a = Number(e.target.value); const de = Math.min(choix.periode[0], a); setChoix({ ...choix, periode: Array.from({ length: a - de + 1 }, (_, i) => de + i) }); }}>
              {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        </>}
      </div>

      <div className="mes-compteurs mes-stats-cartes">
        <section className="svv-card mes-carte" aria-label={`${motCa}, ${libelleChoix}`} data-carte-stats="ca">
          <h3>{motCa} — {libelleChoix}</h3>
          <p className="mes-carte-valeur" data-valeur-ca>{txt(t.n.ca)}</p>
          {t.n1 === null ? <p className="loc-muet">Sans comparaison sur toutes les années.</p>
            : <p className="loc-muet" data-n1-ca>{choix.annee - 1}, même période : {txt(t.n1.ca)} — <span data-ecart-ca>{ecartEur(ecart!.eur)} ({signePct(ecart!.pct)})</span></p>}
        </section>
        <section className="svv-card mes-carte" aria-label="Mes ventes actées" data-carte-stats="nb">
          <h3>Ventes actées — {libelleChoix}</h3>
          <p className="mes-carte-valeur" data-valeur-nb>{t.n.nb}</p>
          {t.n1 !== null && <p className="loc-muet" data-n1-nb>{choix.annee - 1}, même période : {t.n1.nb}</p>}
        </section>
        <section className="svv-card mes-carte" aria-label={nomAgence === null ? 'Mon prévisionnel' : `Prévisionnel ${nomAgence}`} data-carte-stats="previsionnel">
          <h3>{nomAgence === null ? 'Prévisionnel (mes compromis en cours)' : `Prévisionnel (compromis en cours — ${nomAgence})`}</h3>
          <p className="mes-carte-valeur" data-valeur-previsionnel>{txt(prev)}</p>
          <p className="loc-muet" data-projection>Projection {anCourant} : {txt(acteAnnee)} acté + {txt(prev)} prévisionnel = <strong>{txt(projection)}</strong></p>
        </section>
      </div>

      {choix.mode !== 'tout' && (
        <GrapheMoisStats s={s} annee={choix.annee} jour={jour} id="mes-histo" bloc="mes-stats-mois" rouges={rouges} motCa={motCa} motCaTitre={nomAgence === null ? 'mon CA' : `CA ${nomAgence}`} motNombre="Ventes actées"
          courante={choix.mode === 'mois' ? choix.mois : rouges?.at(-1) ?? 0} selectionCumul={choix.mode === 'mois' ? choix.mois : 0}
          onChoisir={(k) => setChoix({ ...choix, mode: 'mois', mois: k })}>
          {an !== undefined && an.aConfirmerNb > 0 && <p className="loc-muet" data-a-confirmer>Dont {an.aConfirmerNb} vente{an.aConfirmerNb > 1 ? 's' : ''} au mois à confirmer
            ({txt(an.aConfirmer)}) : comptée{an.aConfirmerNb > 1 ? 's' : ''} dans l’année, dans aucun mois.</p>}
        </GrapheMoisStats>
      )}

      {negociateurs !== null && (
        <section className="tdb-section" aria-labelledby="agence-negociateurs" data-bloc="agence-negociateurs">
          <h3 id="agence-negociateurs">Par négociateur — {libelleChoix}</h3>
          {negociateurs.length === 0 ? <p className="loc-muet" data-negociateurs-vide>Aucune vente actée sur la période.</p> : (
            <table className="tdb-table mes-table-apporteurs">
              <thead><tr><th scope="col">Négociateur</th><th scope="col">Ventes</th><th scope="col">CA généré</th><th scope="col">CA net</th></tr></thead>
              <tbody>{negociateurs.map((l) => (
                <tr key={l.negociateur} data-negociateur-agence={l.negociateur}>
                  <th scope="row">{nommer(l.negociateur)}</th><td data-mot="Ventes">{l.ids.length}</td>
                  <td data-mot="CA généré">{txt(l.ca)}</td><td data-mot="CA net">{txt(l.net)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </section>
      )}

      {/* Le tableau « Par apporteur d'affaires » : le composant déplacé sous le graphique (décision 14), le même ici. */}
      <TableauParApporteur lignes={apporteurs.map(ligneDuSuiviCa)} libelle={libelleChoix} agence={nomAgence !== null} />
    </div>
  );
}

/**
 * Le graphique « Mois par mois » des statistiques d'un espace (mes chiffres, ou ceux de la structure en mode agence) : les briques du Suivi CA
 * (`EnteteGraphe`, `Histogramme`, `CourbeCumul`, barres N, N−1 hachurées, Mensuel / Cumul, les mois soulignés en rouge) sur les mois du serveur.
 * Partagé par « Mes statistiques » et l'accueil de « Mon espace » (aucune copie). `selectionCumul` : le point mis en avant du cumul (0 : le dernier).
 */
export function GrapheMoisStats({ s, annee, jour, id, bloc, rouges, motCa, motCaTitre, motNombre, courante, selectionCumul, onChoisir, cumulCliquable = false, entete, children }: {
  s: StatsMonEspace; annee: number; jour: string; id: string; bloc: string; rouges: readonly number[] | null;
  /** L'onglet et la bulle (« Mon CA ») ; le titre (« mon CA »). */
  motCa: string; motCaTitre: string; motNombre: string;
  courante: number; selectionCumul: number; onChoisir: (k: number) => void;
  /** Un point de la courbe cumulée s'ouvre d'un clic (l'accueil, comme le Suivi CA) ; « Mes statistiques » : non, comme avant. */
  cumulCliquable?: boolean;
  /** Ce que l'écran ajoute sous l'en-tête (l'onglet « Année(s) » : le choix de l'échelle), comme `GrapheMois`. */
  entete?: ReactNode; children?: ReactNode }) {
  const u = useAffichage();
  const [cumul, setCumul] = useState(false);
  const [mesure, setMesure] = useState<'ca' | 'nombre'>('ca');
  const anCourant = Number(jour.slice(0, 4));
  const v = (m: MontantC): number => (u === 'ht' ? m.htC : m.ttcC) / 100;
  const autre = (m: MontantC): number => (u === 'ht' ? m.ttcC : m.htC) / 100;
  const an = s.annees.find((x) => x.annee === annee);
  const an1 = s.annees.find((x) => x.annee === annee - 1);
  const nombre = mesure === 'nombre';
  const serie = (x: typeof an): number[] => (x === undefined ? Array(12).fill(0) : nombre ? x.nb : x.ca.map(v));
  const valeurs = serie(an);
  const valeursN1 = an1 === undefined ? null : serie(an1);
  const dernier = annee < anCourant ? 12 : annee > anCourant ? 0 : Number(jour.slice(5, 7));
  const info = (k: number, cumule: boolean): InfoBarre => {
    const c = cumule ? cumuler(valeurs) : valeurs;
    const c1 = valeursN1 === null ? null : cumule ? cumuler(valeursN1) : valeursN1;
    const autreC = an === undefined || nombre ? null : (cumule ? cumuler(an.ca.map(autre)) : an.ca.map(autre))[k - 1];
    const autreC1 = an1 === undefined || nombre ? null : (cumule ? cumuler(an1.ca.map(autre)) : an1.ca.map(autre))[k - 1];
    return { titre: cumule ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`,
      ...(nombre ? { compte: motNombre } : { motCa: `${motCa} ${MOT_UNITE[u]}` }), motNb: 'Ventes', sansN1: `${annee - 1} : aucune vente`,
      courant: { libelle: String(annee), ca: k > dernier ? 0 : c[k - 1], nb: nombre || an === undefined ? null : an.nb[k - 1], ...(autreC === null ? {} : { caAutre: autreC }) },
      precedent: c1 === null ? null : { libelle: String(annee - 1), ca: c1[k - 1], nb: nombre || an1 === undefined ? null : an1.nb[k - 1], ...(autreC1 === null ? {} : { caAutre: autreC1 }) } };
  };
  const mot = nombre ? motNombre.toLowerCase() : `${motCaTitre} ${MOT_UNITE[u]}`;
  return (
    <section className="tdb-section" aria-labelledby={id} data-bloc={bloc} {...attributMoisRouges(rouges)}>
      <StyleMoisRouges mois={rouges} />
      <EnteteGraphe<'ca' | 'nombre'> id={id} mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel"
        mesures={[{ cle: 'ca', mot: motCa }, { cle: 'nombre', mot: motNombre }]}
        titre={<>Mois par mois — {annee} <small className="loc-muet">({mot}{cumul ? ', cumulé depuis janvier' : ''})</small></>} />
      {entete}
      {cumul
        ? <CourbeCumul courant={cumuler(valeurs).slice(0, dernier)} n1={valeursN1 === null ? null : cumuler(valeursN1)} annee={annee} selection={selectionCumul || dernier || 12}
          entier={nombre} aria={`${mot} cumulé ${annee}`} bulle={(k) => info(k, true)} {...(cumulCliquable ? { onChoisir } : {})} />
        : <Histogramme attribut="data-barre-mois" courante={courante} onChoisir={onChoisir}
          entier={nombre} aria={`${mot} par mois, ${annee}`} legende={{ courant: String(annee), n1: valeursN1 === null ? null : String(annee - 1) }}
          barres={valeurs.map((x, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernier ? null : x, n1: valeursN1?.[i] ?? null, info: info(i + 1, false) }))} />}
      {children}
    </section>
  );
}

export const CSS_MES_STATISTIQUES = `
.mes-stats{display:flex;flex-direction:column;gap:1rem}
.mes-stats-choix{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem}
.mes-stats-choix .trx-unite{min-height:44px}
.mes-carte h3{margin:0 0 .4rem;font-size:1rem}
.mes-carte-valeur{margin:0 0 .25rem;font-size:1.35rem;font-weight:700;color:var(--color-svv-green)}
.mes-table-apporteurs td,.mes-table-apporteurs th{text-align:left}
`;
