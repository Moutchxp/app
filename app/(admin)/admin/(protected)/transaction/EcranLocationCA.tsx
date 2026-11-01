'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import { NOMS_MOIS, variation } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { borneCumul, ecrireAnnees, moisADate, moisDesAnnees, type DecoupageAnnees } from '../../../../lib/transaction/periodeAnnees';
import { libellePeriode, unAnPlusTot, type MoisChoisi } from '../../../../lib/transaction/periodeMois';
import { correspond, CLE_TRI_LISTE, estTriListe, LIBELLE_TRI_LISTE, SEUIL_RECHERCHE, TRI_LISTE_DEFAUT, TRIS_LISTE, type TriListe } from '../../../../lib/transaction/listeCartes';
import {
  anneesLocation, apporteursLocation, COMPTER_LOCATION, espaceLocation, estCompterLocation, ficheRechercheLocation, filtrerLocation, historiqueLocation, LIBELLE_COMPTER_LOCATION,
  lignesDesAnnees, lignesDesMois, negociateursLocation, totauxLocation, trierLocation, type CompterLocation, type LigneLocationCa, type TotauxLocationCa,
} from '../../../../lib/transaction/locationCa';
import { CourbeCumul, EnteteGraphe, Histogramme, PAS_ANNEE_FIXE, type InfoBarre } from '../location/TableauBordSuivi';
import { BlocReplie } from '../location/BlocReplie';
import { ListeChoix } from '../location/ListeChoix';
import { BoutonAffichage, classeSens, COURT, ecrireAdresse, ecrireAdresseListe, ESPACE, eur, FournisseurAffichage, Montants, MOT_UNITE, parametre, parametres, signePct, useAffichage, useAffichageRetenu, useTransaction } from './commun';
import { CSS, libelleAnnees, LigneDesAnnees, LigneDesMois, Mt, useLigneDesAnnees, useLigneDesMois, type ChoixAnnees } from './EcransTransaction';
import { FiltreNegociateurs } from './FiltreNegociateurs';
import { GrapheNegociateurs, MAX_NEGOCIATEURS } from './GrapheNegociateurs';
import { useColonnesNegociateurs } from './OngletCompromis';

/**
 * ══ 🔴 LOT LO1 (Arno, 01/11/2026) — « SUIVI CHIFFRE D'AFFAIRES › LOCATION » : L'ACTIVITÉ ÉCONOMIQUE DE LA LOCATION ═══════════════════════════════════
 * Les mêmes mécaniques et les mêmes composants que la Transaction vente : « Le mois » (Mois | Période | Année) et « L'année » (Année | Période | Tout),
 * les tuiles alignées, le graphique Mensuel / Cumul avec N−1 hachuré et son encadré, « HT | TTC » partagé, le filtre Négociateur (jusqu'à 5 : une
 * série chacun), le tri et la recherche des cartes, l'Espace par négociateur trié. LECTURE SEULE : les lignes du Suivi du mois de la Location
 * (`locationCa`), aucun geste d'écriture ici — la carte d'un bail ouvre la ligne dans la Location.
 * Quatre tuiles : CA brut (honoraires propriétaire + locataire), Baux signés, Primes et rétrocessions versées (primes de nouvelle gestion + commissions
 * des apporteurs), CA net (CA brut − primes − rétrocessions) — la tuile 4 = la tuile 1 − la tuile 3, au centime, en HT et en TTC.
 */
interface DonneesLocationCa { disponible: boolean; aujourdhui: string; lignes: LigneLocationCa[] }

const EXPLICATION = { ca: 'honoraires de location encaissés', couts: 'primes de nouvelle gestion et commissions d’apporteurs', net: 'CA − primes et rétrocessions versées' } as const;
const SANS_SUIVI = 'Le Suivi de la Location n’est pas disponible sur cette base (migration 406) : aucune ligne à lire.';
type Mesure = 'ca' | 'net' | 'nombre';
const MESURES: readonly { cle: Mesure; mot: string }[] = [{ cle: 'ca', mot: 'CA' }, { cle: 'net', mot: 'CA net' }, { cle: 'nombre', mot: 'Nombre de baux' }];
/** Le lien vers le Suivi du mois de la Location (la ligne y est, dans son mois). */
export const lienSuiviDuMois = (l: Pick<LigneLocationCa, 'annee' | 'mois'>): string => `/admin/location/outils/mois?annee=${l.annee}&mois=${l.mois}`;

/** Le compte choisi : l'adresse (&compter=…), sinon « Tous ». */
const compterInitial = (): CompterLocation => { const x = parametre('compter'); return estCompterLocation(x) ? x : 'tous'; };

export function EcranLocationCA() {
  const jour = aujourdhuiParis();
  const { lu } = useTransaction<DonneesLocationCa>('vue=location');
  const [vue, setVue] = useState<'mois' | 'annee'>(() => (parametre('vue') === 'annee' ? 'annee' : 'mois'));
  const { annee, setAnnee, mois, setMois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte, setPeriode, setAnneeEntiere } = useLigneDesMois(jour);
  const [compter, setCompter] = useState<CompterLocation>(compterInitial);
  const [negociateurs, setNegociateurs] = useState<string[]>(() => parametres('negociateur'));
  const toutes = lu.etat === 'ok' ? lu.data.lignes : [];
  const comptees = filtrerLocation(toutes, compter, null);
  const anneesDispo = lu.etat === 'ok' ? anneesLocation(lu.data.lignes, jour) : null;
  const { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles } = useLigneDesAnnees(jour, anneesDispo,
    vue === 'annee', (a) => comptees.some((l) => l.annee === a));
  const [unite, setUnite] = useAffichageRetenu();
  useEffect(() => {
    ecrireAdresse(vue === 'mois' ? { vue: 'mois', annee: String(annee), mois: String(mois), 'vue-mois': decoupage, periode: decoupage === 'periode' ? periodeTexte : null,
      'vue-annee': null, annees: null, graphe: null, compter: compter === 'tous' ? null : compter }
      : choixA === null ? {}
      : { vue: 'annee', annee: String(choixA.annee), mois: null, periode: null, 'vue-mois': null, compter: compter === 'tous' ? null : compter,
        'vue-annee': choixA.decoupage === 'annee' ? null : choixA.decoupage, annees: choixA.decoupage === 'periode' ? ecrireAnnees(choixA.annees) : null });
  }, [vue, annee, mois, periodeTexte, decoupage, cleChoixA, compter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ecrireAdresseListe('negociateur', negociateurs); }, [negociateurs]);

  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const annees = anneesLocation(d.lignes, jour);
  const personnes = negociateursLocation(d.lignes);
  const choisis = negociateurs.map((n) => personnes.find((p) => p.nom === n)).filter((p): p is { cle: string; nom: string } => p !== undefined).slice(0, MAX_NEGOCIATEURS);
  const filtrees = filtrerLocation(d.lignes, compter, choisis.length === 0 ? null : choisis.map((c) => c.cle));
  const series = choisis.length >= 2 ? choisis.map((c, i) => ({ nom: c.nom, couleur: i + 1, lignes: filtrerLocation(d.lignes, compter, [c.cle]) })) : null;
  const champsCommuns = <>
    <div className="tdb-champ">Négociateur
      <FiltreNegociateurs personnes={personnes.map((p) => p.nom)} choisis={choisis.map((c) => c.nom)} onChange={setNegociateurs} /></div>
    <div className="tdb-champ trx-champ-mode"><span id="trx-compter-mot">Compter</span>
      <div className="trx-unites trx-modes" role="group" aria-labelledby="trx-compter-mot" data-filtre="compter">
        {COMPTER_LOCATION.map((c) => <button key={c} type="button" className="trx-unite" aria-pressed={compter === c} onClick={() => setCompter(c)} data-compter={c}>{LIBELLE_COMPTER_LOCATION[c]}</button>)}
      </div></div>
    <div className="tdb-champ trx-champ-unite"><span id="trx-unite-mot">Montants</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
  </>;
  return (
    <div className="tdb loc-page" data-ecran-location-ca>
      <style>{CSS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-suivi>{SANS_SUIVI}</p>}
      <div className="trx-barre">
        <div className="trx-vues" role="tablist" aria-label="Le mois ou l’année">
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'mois'} onClick={() => setVue('mois')} data-vue="mois">Le mois</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'annee'} onClick={() => setVue('annee')} data-vue="annee">L’année</button>
        </div>
      </div>
      <FournisseurAffichage value={unite}>
      {vue === 'mois' ? <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
          {champsCommuns}
        </form>
        <LigneDesMois annee={annee} mois={mois} decoupage={decoupage} moisChoisis={decoupage === 'mois' ? null : (periodeVue ?? []).filter((m) => m.annee === annee).map((m) => m.mois)}
          onMois={choisirMois} onDecoupage={choisirDecoupage} />
        {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
        <VueLocation lignes={filtrees} toutes={d.lignes} jour={jour} ms={periodeVue ?? [{ annee, mois }]} annee={annee}
          lib={decoupage === 'mois' ? NOMS_MOIS[mois - 1].toLowerCase() : decoupage === 'annee' ? String(annee) : libellePeriode(periodeVue ?? [])}
          libComplet={decoupage === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : decoupage === 'annee' ? `l’année ${annee}` : libellePeriode(periodeVue ?? [])}
          borne={borneCumul(decoupage, annee, mois, decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null, jour)} toutesAnnees={null} historique={null} series={series}
          graphe={{ sorte: 'mois', mois: decoupage === 'mois' ? mois : 0, moisChoisis: decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null, moisSeul: decoupage === 'mois', onMois: choisirMois }} />
      </> : choixA !== null && anneesVisibles !== null && <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>{champsCommuns}</form>
        <LigneDesAnnees annees={anneesVisibles} decoupage={choixA.decoupage} annee={choixA.annee} choisies={choixA.decoupage === 'tout' ? anneesVisibles : choixA.annees}
          onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
        {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
        <VueAnneeLocation lignes={filtrees} toutes={d.lignes} jour={jour} choix={choixA} anneesVisibles={anneesVisibles} series={series} onAnnee={choisirAnnee}
          onAnneeSeule={(a) => { setRefusAnnees(false); setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); }}
          onOuvrirMois={(a, m) => { setAnneeEntiere(false); setPeriode(null); setAnnee(a); setMois(m); setVue('mois'); }} />
      </>}
      </FournisseurAffichage>
    </div>
  );
}

/** « L'année » : les années choisies (une, plusieurs, ou toutes), les mêmes blocs que « Le mois », « Toute l'histoire ». */
function VueAnneeLocation({ lignes, toutes, jour, choix, anneesVisibles, series, onAnnee, onAnneeSeule, onOuvrirMois }: {
  lignes: readonly LigneLocationCa[]; toutes: readonly LigneLocationCa[]; jour: string; choix: ChoixAnnees; anneesVisibles: readonly number[];
  series: readonly { nom: string; couleur: number; lignes: LigneLocationCa[] }[] | null; onAnnee: (a: number) => void; onAnneeSeule: (a: number) => void; onOuvrirMois: (a: number, m: number) => void;
}) {
  const [echelle, setEchelle] = useState<'annees' | 'mois'>(() => (parametre('graphe') === 'mois' ? 'mois' : 'annees'));
  useEffect(() => { ecrireAdresse({ graphe: echelle === 'mois' ? 'mois' : null }); }, [echelle]);
  const enTout = choix.decoupage === 'tout';
  const sel = enTout ? [...anneesVisibles] : [...choix.annees].sort((x, y) => x - y);
  const lib = enTout ? 'toutes les années' : libelleAnnees(choix);
  const choixEchelle = (
    <div className="trx-unites trx-choix-echelle" role="group" aria-label="L’échelle du graphique" data-echelle-choix={echelle}>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'annees'} onClick={() => setEchelle('annees')} data-echelle="annees">Année par année</button>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'mois'} onClick={() => setEchelle('mois')} data-echelle="mois">Mois par mois — {choix.annee}</button>
    </div>
  );
  return <VueLocation lignes={lignes} toutes={toutes} jour={jour} ms={moisDesAnnees(sel)} annee={choix.annee} lib={lib} libComplet={lib} borne={null}
    toutesAnnees={enTout ? `Toutes les années (${anneesVisibles[0]} → ${anneesVisibles.at(-1)})` : null} series={series}
    historique={{ annees: anneesVisibles, choisie: choix.annee, onAnnee: onAnneeSeule }}
    graphe={echelle === 'annees' ? { sorte: 'annees', annees: anneesVisibles, selection: sel, decoupage: choix.decoupage, onAnnee, entete: choixEchelle }
      : { sorte: 'mois', mois: 0, moisChoisis: null, moisSeul: false, onMois: (m) => onOuvrirMois(choix.annee, m), entete: choixEchelle }} />;
}

type Graphe = { sorte: 'mois'; mois: number; moisChoisis: readonly number[] | null; moisSeul: boolean; onMois: (m: number) => void; entete?: ReactNode }
  | { sorte: 'annees'; annees: readonly number[]; selection: readonly number[]; decoupage: DecoupageAnnees; onAnnee: (a: number) => void; entete: ReactNode };

/** Un montant (centimes) dans l'unité affichée, en euros. */
function useEnUnite(): { u: 'ht' | 'ttc'; MOT: string; en: (m: MontantC) => number; autre: (m: MontantC) => string } {
  const u = useAffichage();
  return { u, MOT: MOT_UNITE[u], en: (m) => (u === 'ht' ? m.htC : m.ttcC) / 100, autre: (m) => `${eur((u === 'ht' ? m.ttcC : m.htC) / 100)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']}` };
}

/**
 * Les tuiles, le graphique et les blocs d'un ensemble de mois (`ms`) : « Le mois » (un mois, une période, l'année) ou « L'année » (des années).
 * N−1 : les mêmes mois, un an plus tôt ; « Tout » (`toutesAnnees`) : ni N−1, ni écart.
 */
function VueLocation({ lignes, toutes, jour, ms, annee, lib, libComplet, borne, toutesAnnees, series, historique, graphe }: {
  lignes: readonly LigneLocationCa[]; toutes: readonly LigneLocationCa[]; jour: string; ms: readonly MoisChoisi[]; annee: number;
  /** Le nom de la période dans les titres (« octobre », « 2026 », « juillet → septembre 2026 ») ; `libComplet` : celui des blocs. */
  lib: string; libComplet: string;
  /** « Le mois » : la borne du cumul (« cumul 2026 à fin octobre ») ; null : « L'année ». */
  borne: { fin: number; mot: string } | null;
  toutesAnnees: string | null;
  series: readonly { nom: string; couleur: number; lignes: LigneLocationCa[] }[] | null;
  historique: { annees: readonly number[]; choisie: number; onAnnee: (a: number) => void } | null;
  graphe: Graphe;
}) {
  const U = useEnUnite();
  const listes = useRef<HTMLDivElement | null>(null);
  useColonnesNegociateurs(listes);
  const periode = lignesDesMois(lignes, ms);
  const T = totauxLocation(periode);
  const ms1 = unAnPlusTot(ms);
  const T1 = totauxLocation(lignesDesMois(lignes, ms1));
  const anneesN1 = [...new Set(ms1.map((m) => m.annee))];
  // sans année précédente : aucune ligne du Suivi (tous filtres confondus) sur ces années
  const sansN1 = !toutes.some((l) => anneesN1.includes(l.annee));
  const enN1 = anneesN1.length === 1 ? `en ${anneesN1[0]}` : 'un an plus tôt';
  const motSansN1 = `${anneesN1.join(', ')} : aucune location au Suivi`;
  const n1 = (c: MontantC, c1: MontantC): string => (toutesAnnees !== null ? toutesAnnees : sansN1 ? motSansN1 : `${eur(U.en(c1))} ${enN1} (${signePct(variation(c.htC, c1.htC))})`);
  const cumul = borne === null ? null : totauxLocation(lignesDesMois(lignes, Array.from({ length: borne.fin }, (_, i) => ({ annee, mois: i + 1 }))));
  const motCumul = borne === null ? '' : `cumul ${annee} ${borne.mot.startsWith('à fin') ? borne.mot : `(${borne.mot})`}`;
  const explication = (t: string) => <small className="trx-tuile-explication" data-tuile-explication-location>{t}</small>;
  const autre = (m: MontantC) => <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({U.autre(m)})</small>;
  return <>
    <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${libComplet}`} data-ecran-location-tuiles>
      <li><div className="tdb-tuile" data-tuile="location-ca">
        <span className="tdb-tuile-mot">CA brut — {lib}{explication(EXPLICATION.ca)}</span>
        <strong className="tdb-tuile-valeur" data-location-ca>{eur(U.en(T.ca))}</strong>{autre(T.ca)}
        <span className="tdb-tuile-n1" data-location-parts>dont propriétaire {eur(U.en(T.proprietaire))} · locataire {eur(U.en(T.locataire))}</span>
        <span className="tdb-tuile-n1" data-tuile-n1="location-ca">{cumul !== null && <span className="trx-ligne-bloc" data-location-cumul>{motCumul} : {eur(U.en(cumul.ca))}</span>}
          <span className="trx-ligne-bloc">{n1(T.ca, T1.ca)}</span></span></div></li>
      <li><div className="tdb-tuile" data-tuile="location-baux">
        <span className="tdb-tuile-mot">Baux signés — {lib}</span>
        <strong className="tdb-tuile-valeur" data-location-nb>{T.nb}</strong>
        <small className="trx-montant-autre trx-tuile-autre" data-location-mandats>{T.nbGestionSeule > 0 || T.nbAvenants > 0
          ? `dont ${[T.nbGestionSeule > 0 ? `${T.nbGestionSeule} mandat${T.nbGestionSeule > 1 ? 's' : ''} de gestion seul${T.nbGestionSeule > 1 ? 's' : ''}` : '', T.nbAvenants > 0 ? `${T.nbAvenants} avenant${T.nbAvenants > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}` : ' '}</small>
        <span className="tdb-tuile-n1" data-tuile-n1="location-baux">{toutesAnnees !== null ? toutesAnnees : sansN1 ? motSansN1 : `${T1.nb} ${enN1}`}</span></div></li>
      <li><div className="tdb-tuile" data-tuile="location-couts">
        <span className="tdb-tuile-mot">Primes et rétrocessions versées — {lib}{explication(EXPLICATION.couts)}</span>
        <strong className={`tdb-tuile-valeur ${classeSens('verse', T.couts.htC, T.couts.ttcC)}`} data-location-couts>{eur(U.en(T.couts))}</strong>{autre(T.couts)}
        <span className="tdb-tuile-n1" data-location-couts-detail>primes {eur(U.en(T.primes))} · apporteurs {eur(U.en(T.apporteurs))}</span>
        <span className="tdb-tuile-n1" data-tuile-n1="location-couts">{n1(T.couts, T1.couts)}</span></div></li>
      <li><div className="tdb-tuile" data-tuile="location-net">
        <span className="tdb-tuile-mot">CA net — {lib}{explication(EXPLICATION.net)}</span>
        <strong className="tdb-tuile-valeur trx-vert" data-location-net>{eur(U.en(T.net))}</strong>{autre(T.net)}
        <span className="tdb-tuile-n1" data-tuile-n1="location-net">{n1(T.net, T1.net)}</span></div></li>
    </ul>

    {graphe.sorte === 'mois'
      ? <GrapheLocationMois lignes={lignes} toutes={toutes} jour={jour} annee={annee} g={graphe} series={series} />
      : <GrapheLocationAnnees lignes={lignes} jour={jour} annee={annee} g={graphe} series={series} toutesAnnees={toutesAnnees} />}

    <div ref={listes} className="trx-listes-mois">
      <ListeBaux lignes={periode} titre={`Les baux de ${libComplet}`} />
    </div>

    <section className="tdb-section" aria-labelledby="trx-resultat-location" data-bloc="resultat-location">
      <h3 id="trx-resultat-location">Résultat de la location — {libComplet}</h3>
      <ResultatLocation T={T} />
    </section>

    <BlocReplie id="trx-negos-location" section="negociateurs-location" titre={<>Espace par négociateur — {libComplet}</>} resume={`${espaceLocation(periode).length} négociateur(s)`}
      donnees={{ 'data-bloc': 'negociateurs-location' }}>
      <EspaceLocation lignes={periode} T={T} />
    </BlocReplie>

    <section className="tdb-section" aria-labelledby="trx-apporteurs-location" data-bloc="apporteurs-location">
      <h3 id="trx-apporteurs-location">Apporteurs de {libComplet} <span className="loc-pastille">{apporteursLocation(periode).filter((a) => a.nom !== 'Sans apporteur').length}</span></h3>
      <ApporteursLocation lignes={periode} />
    </section>

    {historique !== null && (
      <BlocReplie id="trx-histoire-location" section="histoire-location" titre={<>Toute l’histoire</>} resume={`${historique.annees[0]} → ${historique.annees.at(-1)}`}
        donnees={{ 'data-bloc': 'histoire-location' }}>
        <HistoireLocation lignes={lignes} annees={historique.annees} choisie={historique.choisie} onAnnee={historique.onAnnee} />
      </BlocReplie>
    )}
  </>;
}

/** La valeur d'une mesure pour des lignes, dans l'unité affichée (le nombre : les lignes). */
const valeurDe = (t: TotauxLocationCa, mesure: Mesure, en: (m: MontantC) => number): number => (mesure === 'nombre' ? t.nb : en(mesure === 'net' ? t.net : t.ca));
/** L'encadré d'un point : la mesure, le nombre de baux, et (CA) la part propriétaire / locataire ; N−1 sauf « Tout ». */
function infoLocation(titre: string, mesure: Mesure, U: ReturnType<typeof useEnUnite>, libelle: string, t: TotauxLocationCa, libelleN1: string | null, t1: TotauxLocationCa | null, sansN1: string): InfoBarre {
  const motCa = mesure === 'net' ? `CA net ${U.MOT}` : `CA ${U.MOT}`;
  const parts = (x: TotauxLocationCa) => (mesure === 'ca' ? { parts: [{ mot: 'Propriétaire', ca: U.en(x.proprietaire) }, { mot: 'Locataire', ca: U.en(x.locataire) }] } : {});
  if (mesure === 'nombre') return { titre, compte: 'Baux signés', sansN1, courant: { libelle, ca: t.nb, nb: null }, precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: t1.nb, nb: null } };
  return { titre, motCa, motNb: 'Baux', sansN1, autre: { mot: MOT_UNITE[U.u === 'ht' ? 'ttc' : 'ht'], facteur: U.u === 'ht' ? 1.2 : 1 / 1.2 },
    courant: { libelle, ca: valeurDe(t, mesure, U.en), nb: t.nb, ...parts(t) },
    precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: valeurDe(t1, mesure, U.en), nb: t1.nb, ...parts(t1) } };
}
function useMesure(): [Mesure, (m: Mesure) => void] {
  const [mesure, setMesure] = useState<Mesure>(() => { const x = parametre('mesure'); return x === 'net' || x === 'nombre' ? x : 'ca'; });
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'ca' ? null : mesure }); }, [mesure]);
  return [mesure, setMesure];
}
const motMesure = (m: Mesure, MOT: string): string => (m === 'nombre' ? 'nombre de baux' : m === 'net' ? `CA net ${MOT}` : `CA brut ${MOT}`);

/** « Mois par mois » : Mensuel (barres, N−1 hachurée) / Cumul ; le mois choisi en rouge ; Période atténuée ; 2 à 5 négociateurs : une série chacun. */
function GrapheLocationMois({ lignes, toutes, jour, annee, g, series }: { lignes: readonly LigneLocationCa[]; toutes: readonly LigneLocationCa[]; jour: string; annee: number;
  g: Extract<Graphe, { sorte: 'mois' }>; series: readonly { nom: string; couleur: number; lignes: LigneLocationCa[] }[] | null }) {
  const U = useEnUnite();
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const dernier = moisADate(annee, jour);
  const sansN1 = !toutes.some((l) => l.annee === annee - 1);
  const pt = (ls: readonly LigneLocationCa[], a: number, k: number): TotauxLocationCa =>
    totauxLocation(lignesDesMois(ls, cumul ? Array.from({ length: k }, (_, i) => ({ annee: a, mois: i + 1 })) : [{ annee: a, mois: k }]));
  const info = (k: number): InfoBarre => {
    const titre = `${cumul ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`}${k > dernier ? ' — à venir' : ''}`;
    return infoLocation(titre, mesure, U, String(annee), pt(lignes, annee, k), sansN1 ? null : String(annee - 1), sansN1 ? null : pt(lignes, annee - 1, k), `${annee - 1} : aucune location au Suivi`);
  };
  const parMois = (ls: readonly LigneLocationCa[], a: number): number[] => Array.from({ length: 12 }, (_, i) => valeurDe(totauxLocation(lignesDesMois(ls, [{ annee: a, mois: i + 1 }])), mesure, U.en));
  const vals = parMois(lignes, annee); const vals1 = parMois(lignes, annee - 1);
  const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);
  const choisi = g.moisChoisis !== null ? (g.moisChoisis.length === 0 ? 0 : borneCumul('periode', annee, g.mois, g.moisChoisis, jour).fin) : g.mois;
  const finAnnee = borneCumul('annee', annee, 0, null, jour).fin;
  const repos = choisi === 0 ? info(finAnnee === 0 ? 1 : finAnnee) : undefined;
  const entier = mesure === 'nombre';
  const motGraphe = motMesure(mesure, U.MOT);
  return (
    <section className="tdb-section" aria-labelledby="trx-location-histo" data-bloc="histogramme-mois" data-mesure={mesure}
      {...(g.moisChoisis !== null ? { 'data-periode-graphe': g.moisChoisis.join(',') } : {})}>
      {g.moisChoisis !== null && <style>{`[data-periode-graphe] g[data-barre-mois]{opacity:.35}${g.moisChoisis.map((k) => `[data-periode-graphe] g[data-barre-mois="${k}"]{opacity:1}[data-periode-graphe] g[data-barre-mois="${k}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<Mesure> id="trx-location-histo" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel" mesures={MESURES}
        titre={<>Mois par mois — {annee} <small className="loc-muet">({motGraphe}{cumul ? ', cumulé depuis janvier' : ''})</small></>} />
      {g.entete}
      {series !== null ? (
        <GrapheNegociateurs series={series.map((x) => ({ nom: x.nom, couleur: x.couleur, ca: parMois(x.lignes, annee).map((v) => (mesure === 'nombre' ? 0 : v)),
          nb: Array.from({ length: 12 }, (_, i) => lignesDesMois(x.lignes, [{ annee, mois: i + 1 }]).length) }))}
          total={{ ca: mesure === 'nombre' ? Array(12).fill(0) : vals, nb: Array.from({ length: 12 }, (_, i) => lignesDesMois(lignes, [{ annee, mois: i + 1 }]).length) }}
          totalN1={sansN1 ? null : { ca: mesure === 'nombre' ? Array(12).fill(0) : vals1, nb: Array.from({ length: 12 }, (_, i) => lignesDesMois(lignes, [{ annee: annee - 1, mois: i + 1 }]).length), annee: annee - 1 }}
          cumul={cumul} nombre={mesure === 'nombre'} dernierMois={dernier} annee={annee} choisi={g.mois === 0 ? (choisi || finAnnee || 1) : g.mois} onChoisir={g.onMois}
          motCa={mesure === 'net' ? `CA net ${U.MOT}` : `CA ${U.MOT}`} motNb="Baux" aria={`${motGraphe}${cumul ? ' cumulé' : ''} par mois, ${annee}, un négociateur par série`} moisSeul={g.moisSeul} />
      ) : cumul ? (
        <CourbeCumul courant={cumuler(vals).slice(0, dernier)} n1={sansN1 ? null : cumuler(vals1)} annee={annee} selection={choisi} entier={entier} aria={`${motGraphe} cumulé ${annee}`}
          bulle={info} onChoisir={g.onMois} repos={repos} />
      ) : (
        <Histogramme attribut="data-barre-mois" courante={choisi} onChoisir={g.onMois} entier={entier} aria={`${motGraphe} par mois, ${annee}`} repos={repos}
          legende={{ courant: String(annee), n1: sansN1 ? null : String(annee - 1) }}
          barres={vals.map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernier ? null : v, n1: sansN1 ? null : vals1[i], info: info(i + 1) }))} />
      )}
    </section>
  );
}

/** « Année par année » : Annuel / Cumul ; l'année choisie en rouge ; Période atténuée ; « Tout » sans N−1 ; 2 à 5 négociateurs : une série chacun. */
function GrapheLocationAnnees({ lignes, jour, annee, g, series, toutesAnnees }: { lignes: readonly LigneLocationCa[]; jour: string; annee: number;
  g: Extract<Graphe, { sorte: 'annees' }>; series: readonly { nom: string; couleur: number; lignes: LigneLocationCa[] }[] | null; toutesAnnees: string | null }) {
  const U = useEnUnite();
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const enCours = Number(jour.slice(0, 4));
  const { annees } = g;
  const de = (ls: readonly LigneLocationCa[], as: readonly number[]): TotauxLocationCa => totauxLocation(lignesDesAnnees(ls, as));
  const pt = (ls: readonly LigneLocationCa[], a: number): TotauxLocationCa => (cumul ? de(ls, annees.filter((x) => x <= a)) : de(ls, [a]));
  const info = (a: number): InfoBarre => {
    const avant = toutesAnnees === null && annees.includes(a - 1);
    const titre = cumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === enCours ? ' — en cours' : ''}`;
    return infoLocation(titre, mesure, U, String(a), pt(lignes, a), avant ? String(a - 1) : null, avant ? pt(lignes, a - 1) : null, toutesAnnees ?? `${a - 1} : aucune location au Suivi`);
  };
  const vals = annees.map((a) => valeurDe(pt(lignes, a), mesure, U.en));
  const entier = mesure === 'nombre';
  const motGraphe = motMesure(mesure, U.MOT);
  const enPeriode = g.decoupage === 'periode';
  const rang = (a: number): number => annees.indexOf(a);
  return (
    <section className="tdb-section" aria-labelledby="trx-location-annees" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees"
      {...(enPeriode ? { 'data-periode-annees': g.selection.join(',') } : {})}>
      {enPeriode && <style>{`[data-periode-annees] g[data-barre-annee]{opacity:.35}${g.selection.map((a) => `[data-periode-annees] g[data-barre-annee="${a}"]{opacity:1}[data-periode-annees] g[data-barre-annee="${a}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<Mesure> id="trx-location-annees" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Annuel" mesures={MESURES}
        titre={<>Année par année <small className="loc-muet">({motGraphe}{cumul ? `, cumulé depuis ${annees[0]}` : ''} ; une année s’ouvre d’un clic)</small></>} />
      {g.entete}
      {series !== null ? (
        <GrapheNegociateurs series={series.map((x) => ({ nom: x.nom, couleur: x.couleur, ca: annees.map((a) => (mesure === 'nombre' ? 0 : valeurDe(de(x.lignes, [a]), mesure, U.en))), nb: annees.map((a) => lignesDesAnnees(x.lignes, [a]).length) }))}
          total={{ ca: annees.map((a) => (mesure === 'nombre' ? 0 : valeurDe(de(lignes, [a]), mesure, U.en))), nb: annees.map((a) => lignesDesAnnees(lignes, [a]).length) }}
          totalN1={toutesAnnees !== null ? null : { ca: annees.map((a) => (mesure === 'nombre' ? 0 : valeurDe(de(lignes, [a - 1]), mesure, U.en))), nb: annees.map((a) => lignesDesAnnees(lignes, [a - 1]).length), annee: annee - 1 }}
          cumul={cumul} nombre={mesure === 'nombre'} dernierMois={annees.filter((a) => a <= enCours).length} annee={annee} choisi={rang(annee) + 1} onChoisir={(r) => g.onAnnee(annees[r - 1])}
          motCa={mesure === 'net' ? `CA net ${U.MOT}` : `CA ${U.MOT}`} motNb="Baux" aria={`${motGraphe}${cumul ? ' cumulé' : ''} par année, un négociateur par série`}
          axe={{ etiquettes: annees.map(String), cles: annees, attribut: 'data-barre-annee', libelleN1: (r) => String(annees[r - 1] - 1), attenuer: !enPeriode,
            titre: (r, c) => (c ? `Cumul ${annees[0]} → ${annees[r - 1]}` : String(annees[r - 1])) }} />
      ) : cumul ? (
        <CourbeCumul courant={vals.slice(0, annees.filter((a) => a <= enCours).length)} n1={null} annee={annee} selection={annee} entier={entier} aria={`${motGraphe} cumulé par année`}
          etiquettes={annees.map(String)} cles={annees} nom="annees-cumul" attributZone="data-annee-cumul" bulle={info} onChoisir={g.onAnnee}
          legende={<><span className="tdb-legende tdb-legende--courant" /> cumul depuis {annees[0]}</>} />
      ) : (
        <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={g.onAnnee} entier={entier} pasFixe={PAS_ANNEE_FIXE} aria={`${motGraphe} par année`}
          barres={annees.map((a, k) => ({ cle: a, libelle: String(a), valeur: a > enCours ? null : vals[k], info: info(a) }))} />
      )}
    </section>
  );
}

const ETIQUETTE: Record<LigneLocationCa['categorie'], string> = { avec: 'avec gestion', sans: 'sans gestion', gestion_seule: 'gestion seule' };
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');

/** « Les baux de [période] » : une carte par ligne du Suivi ; tri (CA, date) et recherche dès 10 cartes (les règles partagées des listes de la vente). */
function ListeBaux({ lignes, titre }: { lignes: readonly LigneLocationCa[]; titre: string }) {
  const u = useAffichage();
  const [tri, setTriEtat] = useState<TriListe>(() => { try { const x = window.localStorage.getItem(CLE_TRI_LISTE); return estTriListe(x) ? x : TRI_LISTE_DEFAUT; } catch { return TRI_LISTE_DEFAUT; } });
  const setTri = (x: string): void => { if (!estTriListe(x)) return; setTriEtat(x); try { window.localStorage.setItem(CLE_TRI_LISTE, x); } catch { /* préférence seulement */ } };
  const [recherche, setRecherche] = useState('');
  const avecRecherche = lignes.length >= SEUIL_RECHERCHE;
  const q = avecRecherche ? recherche.trim() : '';
  const montrees = q === '' ? lignes : lignes.filter((l) => correspond(ficheRechercheLocation(l), q));
  const triees = trierLocation(montrees, tri, u);
  return (
    <section className="tdb-section trx-liste-affaires" aria-labelledby="trx-baux-location" data-bloc="baux-location">
      <div className="trx-entete-gauche trx-entete-liste">
        <h3 id="trx-baux-location">{titre}</h3>
        <span className="trx-compteur" data-compteur-liste>({q === '' ? lignes.length : `${triees.length} sur ${lignes.length}`})</span>
        {lignes.length > 0 && <div className="trx-tri-compromis trx-tri-liste" data-tri-liste={tri}><span className="trx-tri-mot" aria-hidden="true">Trier :</span>
          <ListeChoix options={TRIS_LISTE.map((x) => ({ id: x, libelle: LIBELLE_TRI_LISTE[x] }))} valeur={tri} vide={null} libelle={`Trier — ${titre}`}
            onChange={setTri} classe="trx-tri-champ" donnees={{ 'data-choix-tri-liste': '' }} /></div>}
        {avecRecherche && <div className="trx-recherche-liste">
          <input type="search" className="trx-recherche-champ" placeholder="Rechercher…" aria-label={`Rechercher — ${titre}`} value={recherche}
            onChange={(e) => setRecherche(e.target.value)} data-recherche-liste />
          {recherche !== '' && <button type="button" className="trx-recherche-effacer" aria-label="Effacer la recherche" onClick={() => setRecherche('')} data-effacer-recherche>×</button>}
        </div>}
      </div>
      {lignes.length === 0 ? <p className="loc-muet" data-aucun-bail>Aucun bail sur la période.</p>
        : q !== '' && triees.length === 0 ? <p className="loc-muet" data-aucun-resultat>Aucun bail ne correspond.</p>
        : <ul className="trx-cartes" data-cartes-baux>{triees.map((l) => <li key={l.id}><CarteBail l={l} /></li>)}</ul>}
    </section>
  );
}

/**
 * La carte d'un bail — la carte d'affaire de la vente (mêmes classes, même repli) : le bien, la date, l'étiquette avec / sans gestion ; dessous, la
 * ligne du négociateur en colonnes communes (honoraires propriétaire · locataire · prime · apporteur · reste) ; à droite le CA du bail. Dépliée :
 * le détail en lecture seule et « Ouvrir dans Location ».
 */
export function CarteBail({ l, ouvertInitial = false }: { l: LigneLocationCa; ouvertInitial?: boolean }) {
  const u = useAffichage();
  const m = (x: MontantC): string => eur((u === 'ht' ? x.htC : x.ttcC) / 100);
  const titre = (
    <span className="trx-carte-gauche">
      <span className="trx-carte-ligne1">
        <span className="trx-carte-titre" data-carte="titre">{l.bien ?? `${l.proprietaire} / ${l.locataire}`}{' '}
          <span className={`loc-pastille${l.categorie === 'sans' ? '' : ' trx-pastille--verte'}`} data-etiquette-gestion={l.categorie}>{ETIQUETTE[l.categorie]}</span>
          {l.type === 'avenant' && <> <span className="loc-pastille" data-etiquette-avenant>avenant</span></>}</span>
        <span className="trx-carte-lieu" data-carte-ligne="infos">
          {l.bien !== null && <><span data-carte="personnes">{l.proprietaire} · {l.locataire || 'locataire à renseigner'}</span>
          <span className="trx-sep" aria-hidden="true">{'\u00a0·\u00a0'}</span></>}
          <span data-carte="signature">signé {l.dateSupposee ? `en ${NOMS_MOIS[l.mois - 1].toLowerCase()} ${l.annee}` : `le ${dateFr(l.date)}`}</span>
        </span>
      </span>
      <span className="trx-carte-negos trx-carte-negos--societes" data-carte-negos>
        <span className="trx-carte-nego" data-nego-ligne="unique">
          <span className="trx-nego-nom" data-nego-nom data-col="1">{l.negociateur.nom}</span>{' '}
          <span className="trx-nego-col" data-col="6"><span className="trx-nego-lib"><span className="trx-nego-sep">— </span>propriétaire</span> <span className="trx-nego-montant" data-nego-proprietaire>{m(l.proprietaireC)}</span></span>{' '}
          <span className="trx-nego-col" data-col="2"><span className="trx-nego-lib"><span className="trx-nego-sep">· </span>locataire</span> <span className="trx-nego-montant" data-nego-locataire>{m(l.locataireC)}</span></span>{' '}
          <span className={`trx-nego-col ${classeSens('verse', l.primeC.htC, l.primeC.ttcC)}`} data-col="3"><span className="trx-nego-lib"><span className="trx-nego-sep">· </span>prime</span> <span className="trx-nego-val" data-nego-prime>{m(l.primeC)}</span></span>{' '}
          <span className={`trx-nego-col ${classeSens('verse', l.apporteurC.htC, l.apporteurC.ttcC)}`} data-col="4"><span className="trx-nego-lib"><span className="trx-nego-sep">· </span>apporteur</span> <span className="trx-nego-val" data-nego-apporteur>{m(l.apporteurC)}</span></span>{' '}
          <span className={`trx-nego-col ${l.netC.htC < 0 ? 'trx-rouge' : 'trx-vert'}`} data-col="5"><span className="trx-nego-lib"><span className="trx-nego-sep">· </span>reste</span> <span className="trx-nego-val" data-nego-reste>{m(l.netC)}</span></span>
          <span className="trx-nego-extra" />
        </span>
      </span>
    </span>
  );
  const droite = (
    <span className="trx-carte-droite" data-carte="montants">
      <Montants ht={l.caC.htC / 100} ttc={l.caC.ttcC / 100} sens="recu" classe="trx-carte-montants" donneesHt={{ 'data-carte': 'ca-ht' }} donneesTtc={{ 'data-carte': 'ca-ttc' }} />
    </span>
  );
  return (
    <BlocReplie id={`trx-bail-${l.id}`} section={`bail-${l.id}`} titre={titre} resume={droite} chevronAGauche triangle defilement={false} classe="trx-carte trx-carte-affaire"
      donnees={{ 'data-carte-bail': String(l.id) }} ouvertInitial={ouvertInitial}>
      <dl className="trx-resultat" data-detail-bail={l.id}>
        <dt>Bien</dt><dd>{l.bien ?? <span className="loc-muet">non rattaché</span>}</dd>
        <dt>Propriétaire</dt><dd>{l.proprietaire || '—'}</dd>
        <dt>Locataire(s)</dt><dd>{l.locataire || '—'}</dd>
        <dt>Signature</dt><dd data-detail-signature>{dateFr(l.date)}{l.dateSupposee && <small className="loc-muet" data-jour-non-connu> — jour non connu</small>}</dd>
        <dt>Nature</dt><dd>{l.type === 'gestion_seule' ? 'Mandat de gestion seul' : l.type === 'avenant' ? 'Avenant' : 'Bail'} · {ETIQUETTE[l.categorie]}</dd>
        <dt>Négociateur</dt><dd>{l.negociateur.nom}</dd>
        <dt>Apporteur</dt><dd>{l.apporteur ?? '—'}</dd>
        <dt>Honoraires propriétaire</dt><dd><Mt ht={l.proprietaireC.htC / 100} ttc={l.proprietaireC.ttcC / 100} /></dd>
        <dt>Honoraires locataire</dt><dd><Mt ht={l.locataireC.htC / 100} ttc={l.locataireC.ttcC / 100} /></dd>
        <dt>− Prime de nouvelle gestion</dt><dd><Mt ht={l.primeC.htC / 100} ttc={l.primeC.ttcC / 100} cout /></dd>
        <dt>− Commission d’apporteur</dt><dd><Mt ht={l.apporteurC.htC / 100} ttc={l.apporteurC.ttcC / 100} cout /></dd>
        <dt className="trx-total">= Reste</dt><dd className="trx-total trx-vert"><Mt ht={l.netC.htC / 100} ttc={l.netC.ttcC / 100} /></dd>
      </dl>
      <p><a className="trx-bouton-lien" href={lienSuiviDuMois(l)} data-ouvrir-location={l.id}>Ouvrir dans Location</a>
        <small className="loc-muet"> — le Suivi du mois de {NOMS_MOIS[l.mois - 1].toLowerCase()} {l.annee} (lecture seule ici)</small></p>
    </BlocReplie>
  );
}

/** « Résultat de la location » : CA brut − primes − rétrocessions = CA net (la trame des sommes). */
function ResultatLocation({ T }: { T: TotauxLocationCa }) {
  const MOT = MOT_UNITE[useAffichage()];
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  return (
    <dl className="trx-resultat" data-resultat-location>
      <dt>CA brut ({MOT})</dt><dd><Mt {...m(T.ca)} donnees={{ 'data-resultat-ca': '' }} /></dd>
      <dt>− Primes de nouvelle gestion ({MOT})</dt><dd><Mt {...m(T.primes)} cout donnees={{ 'data-resultat-primes': '' }} /></dd>
      <dt>− Rétrocessions d’apporteurs ({MOT})</dt><dd><Mt {...m(T.apporteurs)} cout donnees={{ 'data-resultat-apporteurs': '' }} /></dd>
      <dt className="trx-total">= CA net ({MOT})</dt><dd className="trx-total trx-vert"><Mt {...m(T.net)} donnees={{ 'data-resultat-net': '' }} /></dd>
    </dl>
  );
}

/** Tri de l'Espace par négociateur (lot CO) : CA généré ou CA net ; 1er clic décroissant, puis croissant ; retenu pendant la visite. */
type TriEspace = { col: 'ca' | 'net'; sens: 'desc' | 'asc' } | null;
let triRetenu: TriEspace = null;
/** Pour les tests : l'ordre par défaut. */
export function oublierTriEspaceLocation(): void { triRetenu = null; }
function useTriEspaceLocation(): [TriEspace, (col: 'ca' | 'net') => void] {
  const [tri, poser] = useState<TriEspace>(triRetenu);
  const trier = (col: 'ca' | 'net') => {
    const suivant: TriEspace = tri?.col === col ? { col, sens: tri.sens === 'desc' ? 'asc' : 'desc' } : { col, sens: 'desc' };
    triRetenu = suivant;
    poser(suivant);
  };
  return [tri, trier];
}

/** « Espace par négociateur » : Négociateur · Baux · CA généré · Primes · Rétrocessions · CA net ; une ligne de total = le Résultat. */
function EspaceLocation({ lignes, T }: { lignes: readonly LigneLocationCa[]; T: TotauxLocationCa }) {
  const u = useAffichage();
  const MOT = MOT_UNITE[u];
  const [tri, trier] = useTriEspaceLocation();
  const espace = espaceLocation(lignes);
  if (espace.length === 0) return <p className="loc-muet">Aucun bail sur la période.</p>;
  const c = (x: MontantC): number => (u === 'ht' ? x.htC : x.ttcC);
  const triees = tri === null ? espace : [...espace].sort((a, b) => (tri.sens === 'desc' ? c(b[tri.col]) - c(a[tri.col]) : c(a[tri.col]) - c(b[tri.col])) || a.nom.localeCompare(b.nom, 'fr'));
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  const bouton = (col: 'ca' | 'net', libelle: ReactNode, mobile = false) => (
    <button type="button" className="trx-tri" onClick={() => trier(col)} data-tri={col} {...(mobile ? { 'data-tri-mobile': col, 'aria-pressed': tri?.col === col } : {})}
      aria-label={`Trier par ${col === 'ca' ? `CA ${MOT} généré` : `CA net ${MOT}`}${tri?.col === col ? (tri.sens === 'desc' ? ' (décroissant)' : ' (croissant)') : ''}`}>
      <span>{libelle}</span>
      <span className="trx-tri-fleches" aria-hidden="true">
        <span className={tri?.col === col && tri.sens === 'asc' ? 'trx-tri-on' : undefined} data-fleche="asc">▲</span>
        <span className={tri?.col === col && tri.sens === 'desc' ? 'trx-tri-on' : undefined} data-fleche="desc">▼</span>
      </span>
    </button>
  );
  const ariaSort = (col: 'ca' | 'net'): 'ascending' | 'descending' | 'none' => (tri?.col !== col ? 'none' : tri.sens === 'desc' ? 'descending' : 'ascending');
  return <>
    <div className="trx-tri-mobile" role="group" aria-label="Trier l'espace par négociateur">{bouton('ca', <>CA {MOT} généré</>, true)}{bouton('net', <>CA net {MOT}</>, true)}</div>
    <table className="tdb-table tdb-table--large" data-table-negociateurs-location>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Baux</th><th scope="col" aria-sort={ariaSort('ca')} data-entete-tri="ca">{bouton('ca', <>CA {MOT} généré</>)}</th>
        <th scope="col">Primes {MOT}</th><th scope="col">Rétrocessions {MOT}</th><th scope="col" aria-sort={ariaSort('net')} data-entete-tri="net">{bouton('net', <>CA net {MOT}</>)}</th></tr></thead>
      <tbody>{triees.map((g) => (
        <tr key={g.cle} data-negociateur-location={g.nom}>
          <th scope="row">{g.nom}</th><td data-mot="Baux">{g.nb}</td>
          <td data-mot={`CA ${MOT} généré`}><Mt {...m(g.ca)} donnees={{ 'data-espace-ca': g.nom }} /></td>
          <td data-mot={`Primes ${MOT}`}><Mt {...m(g.primes)} cout donnees={{ 'data-espace-primes': g.nom }} /></td>
          <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(g.apporteurs)} cout donnees={{ 'data-espace-apporteurs': g.nom }} /></td>
          <td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(g.net)} donnees={{ 'data-espace-net': g.nom }} /></td>
        </tr>
      ))}
        <tr className="tdb-fort trx-ligne-total" data-total-espace-location><th scope="row">Total</th><td data-mot="Baux">{T.nb}</td>
          <td data-mot={`CA ${MOT} généré`}><Mt {...m(T.ca)} /></td><td data-mot={`Primes ${MOT}`}><Mt {...m(T.primes)} cout /></td>
          <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(T.apporteurs)} cout /></td><td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(T.net)} donnees={{ 'data-total-espace-net': '' }} /></td></tr>
      </tbody>
    </table>
  </>;
}

/** « Apporteurs de [période] » : l'apporteur en premier, ses baux, le CA qu'il a apporté, sa commission ; « Sans apporteur » à la fin. */
function ApporteursLocation({ lignes }: { lignes: readonly LigneLocationCa[] }) {
  const MOT = MOT_UNITE[useAffichage()];
  const liste = apporteursLocation(lignes);
  if (liste.length === 0) return <p className="loc-muet">Aucun bail sur la période.</p>;
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  return (
    <table className="tdb-table tdb-table--large" data-table-apporteurs-location>
      <thead><tr><th scope="col">Apporteur</th><th scope="col">Baux</th><th scope="col">CA apporté {MOT}</th><th scope="col">Rétrocession {MOT}</th></tr></thead>
      <tbody>{liste.map((a) => (
        <tr key={a.nom} data-apporteur-location={a.nom}><th scope="row">{a.nom}</th><td data-mot="Baux">{a.nb}</td>
          <td data-mot={`CA apporté ${MOT}`}><Mt {...m(a.ca)} /></td><td data-mot={`Rétrocession ${MOT}`}><Mt {...m(a.commission)} cout /></td></tr>
      ))}</tbody>
    </table>
  );
}

/** « Toute l'histoire » (L'année) : année par année — baux, CA brut, primes et rétrocessions, CA net, évolution du CA. */
function HistoireLocation({ lignes, annees, choisie, onAnnee }: { lignes: readonly LigneLocationCa[]; annees: readonly number[]; choisie: number; onAnnee: (a: number) => void }) {
  const MOT = MOT_UNITE[useAffichage()];
  const h = historiqueLocation(lignes, annees);
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  return (
    <table className="tdb-table tdb-table--large" data-table-histoire-location>
      <thead><tr><th scope="col">Année</th><th scope="col">Baux</th><th scope="col">CA brut {MOT}</th><th scope="col">Primes et rétrocessions {MOT}</th><th scope="col">CA net {MOT}</th><th scope="col">Évolution</th></tr></thead>
      <tbody>{h.map(({ annee, t }, i) => (
        <tr key={annee} className={annee === choisie ? 'tdb-fort' : undefined} data-annee-location={annee}>
          <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => onAnnee(annee)}>{annee}</button></th>
          <td data-mot="Baux">{t.nb}</td><td data-mot={`CA brut ${MOT}`}><Mt {...m(t.ca)} donnees={{ 'data-histoire-ca': String(annee) }} /></td>
          <td data-mot={`Primes et rétrocessions ${MOT}`}><Mt {...m(t.couts)} cout /></td><td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(t.net)} /></td>
          <td data-mot="Évolution">{i === 0 ? '—' : signePct(variation(t.ca.htC, h[i - 1].t.ca.htC))}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
