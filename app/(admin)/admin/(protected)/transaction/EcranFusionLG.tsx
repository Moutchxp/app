'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import { NOMS_MOIS, variation, type GestionMois } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { borneCumul, ecrireAnnees, moisADate, moisDesAnnees, type DecoupageAnnees } from '../../../../lib/transaction/periodeAnnees';
import { libellePeriode, libellePeriodeComplet, unAnPlusTot, type MoisChoisi } from '../../../../lib/transaction/periodeMois';
import { lignesDesMois, moinsC, type LigneLocationCa, type RetroLocation, type SalairesLocation } from '../../../../lib/transaction/locationCa';
import {
  ACTIVITES_FUSION, anneesFusion, estActiviteFusion, FAMILLES_COUTS, LIBELLE_ACTIVITE_FUSION, moisDeGestion, totauxFusion, type ActiviteFusion, type FamilleCout, type TotauxFusion,
} from '../../../../lib/transaction/fusionLocationGestion';
import { CourbeCumul, EnteteGraphe, Histogramme, PAS_ANNEE_FIXE, type InfoBarre } from '../location/TableauBordSuivi';
import { BlocReplie } from '../location/BlocReplie';
import { ListeChoix } from '../location/ListeChoix';
import { BoutonAffichage, classeSens, COURT, ecrireAdresse, ESPACE, eur, FournisseurAffichage, MOT_UNITE, parametre, signePct, useAffichage, useAffichageRetenu, useTransaction } from './commun';
import { CSS, douzeMois, libelleAnnees, LigneDesAnnees, LigneDesMois, Mt, useLigneDesAnnees, useLigneDesMois, type ChoixAnnees } from './EcransTransaction';
import { CategorieRepliable, CoqueFenetre, Montant } from './FenetreCommissions';
import { horsSelecteur, SelecteurSalaires, useChoixSalaires } from './ChoixSalaires';
import { CSS_FENETRES_LOCATION, Reperes, SectionApporteurs, SectionPrimes, useLienBail } from './FenetresLocation';

/**
 * ══ 🔴 LOT LG1 (Arno, 01/11/2026) — « FUSION LOCATION & GESTION » : LE CUMUL DES DEUX ACTIVITÉS ═════════════════════════════════════════════════════
 * Les mêmes mécaniques et les mêmes composants que les pages Location et Gestion : « Le mois » (Mois | Période | Année, ouvert sur « Année » de
 * l'année en cours) et « L'année » (Année | Période | Tout), les tuiles alignées, le graphique Mensuel / Cumul avec N−1 hachuré (barres empilées :
 * location en bas, gestion au-dessus) et son encadré, « HT | TTC » partagé (chaque activité à ses règles de TVA : salaires chargés sans TVA),
 * les fenêtres de détail, la trame des sommes. LECTURE SEULE : les données des deux pages (leurs routes), les chiffres par leurs fonctions
 * (`fusionLocationGestion` : aucun calcul propre) — chaque part = sa page d'origine, au centime. « Activité » : les deux | location | gestion.
 */
interface DonneesLocation { disponible: boolean; aujourdhui: string; lignes: LigneLocationCa[]; retrocessions?: RetroLocation[]; salaires?: SalairesLocation[] | null }
interface DonneesGestion { disponible: boolean; gestion: GestionMois[] }

const EXPLICATION = { ca: 'honoraires de location + honoraires de gestion', volume: 'baux signés · lots gérés', couts: 'apporteurs, ADHOC, MONGA, salaires chargés ; primes et variable les mois sans salaires',
  net: 'CA brut − coûts', coutsSans: 'primes, apporteurs, variable, ADHOC, MONGA — salaires chargés non comptés', netSans: 'CA brut − coûts hors salaires' } as const;
/** 🔴 LOT LG2 — « hors salaires » après un mot (titres, graphique, fenêtres) en mode « Sans salaires ». */
const hors = (salaires: boolean): string => (salaires ? '' : ' hors salaires');
type Mesure = 'ca' | 'net' | 'couts';
const MESURES: readonly { cle: Mesure; mot: string }[] = [{ cle: 'ca', mot: 'CA' }, { cle: 'net', mot: 'CA net' }, { cle: 'couts', mot: 'Coûts' }];
const ADRESSE_LOCATION = '/admin/transaction/location';
const ADRESSE_GESTION = '/admin/transaction/gestion';
/** 🔴 LOT LG2 — le choix « Avec salaires | Sans salaires », retenu dans le navigateur (🔴 LOT LO12 : partagé avec Location et Gestion). */
export { CLE_SALAIRES } from './ChoixSalaires';

/** Les paramètres de la période (les mêmes noms que les pages Location et Gestion) : l'adresse de la page, et les liens vers les pages d'origine. */
type Parametres = Record<string, string | null>;
const enRecherche = (p: Parametres): string => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== null) q.set(k, v); const s = q.toString(); return s === '' ? '' : `?${s}`; };

/** Un montant (centimes) dans l'unité affichée, et l'autre unité. */
function useEnUnite(): { u: 'ht' | 'ttc'; MOT: string; en: (m: MontantC) => number; autre: (m: MontantC) => string; autreC: (m: MontantC) => number } {
  const u = useAffichage();
  return { u, MOT: MOT_UNITE[u], en: (m) => (u === 'ht' ? m.htC : m.ttcC) / 100, autreC: (m) => (u === 'ht' ? m.ttcC : m.htC) / 100,
    autre: (m) => `${eur((u === 'ht' ? m.ttcC : m.htC) / 100)}${ESPACE}${MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']}` };
}

export function EcranFusionLocationGestion() {
  const jour = aujourdhuiParis();
  const { lu: luL } = useTransaction<DonneesLocation>('vue=location');
  const { lu: luG } = useTransaction<DonneesGestion>('vue=global');
  const [vue, setVue] = useState<'mois' | 'annee'>(() => (parametre('vue') === 'annee' ? 'annee' : 'mois'));
  // 🔴 comme le lot LO7 : sans vue du mois dans l'adresse, « Année » de l'année en cours
  const { annee, setAnnee, mois, setMois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte, setPeriode, setAnneeEntiere } = useLigneDesMois(jour, { anneeParDefaut: true });
  const [activite, setActivite] = useState<ActiviteFusion>(() => { const x = parametre('activite'); return estActiviteFusion(x) ? x : 'deux'; });
  // 🔴 LOT LG2 — « Avec salaires | Sans salaires » : l'adresse (&salaires=avec|sans), sinon le choix retenu dans le navigateur, sinon « Avec »
  const [salaires, setSalaires] = useChoixSalaires(); // 🔴 LOT LO12 — le choix partagé (Location, Gestion, FUSION)
  const pret = luL.etat === 'ok' && luG.etat === 'ok';
  const lignes = luL.etat === 'ok' ? luL.data.lignes : [];
  const gestion = luG.etat === 'ok' ? luG.data.gestion : [];
  const anneesDispo = pret ? anneesFusion(lignes, gestion, jour) : null;
  const { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles } = useLigneDesAnnees(jour, anneesDispo,
    vue === 'annee', (a) => lignes.some((l) => l.annee === a) || gestion.some((g) => g.annee === a));
  const [unite, setUnite] = useAffichageRetenu();
  const periodeMois: Parametres = { vue: 'mois', annee: String(annee), mois: String(mois), 'vue-mois': decoupage, periode: decoupage === 'periode' ? periodeTexte : null,
    'vue-annee': null, annees: null, graphe: null };
  const periodeAnnee: Parametres = choixA === null ? {} : { vue: 'annee', annee: String(choixA.annee), mois: null, periode: null, 'vue-mois': null,
    'vue-annee': choixA.decoupage === 'annee' ? null : choixA.decoupage, annees: choixA.decoupage === 'periode' ? ecrireAnnees(choixA.annees) : null };
  const periode = vue === 'mois' ? periodeMois : periodeAnnee;
  useEffect(() => {
    ecrireAdresse({ ...periode, activite: activite === 'deux' ? null : activite, salaires: salaires ? 'avec' : 'sans' });
  }, [vue, annee, mois, periodeTexte, decoupage, cleChoixA, activite, salaires]); // eslint-disable-line react-hooks/exhaustive-deps

  if (luL.etat === 'charge' || luG.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (luL.etat === 'erreur') return <p className="gst-erreur" role="alert">{luL.message}</p>;
  if (luG.etat === 'erreur') return <p className="gst-erreur" role="alert">{luG.message}</p>;
  const annees = anneesFusion(lignes, gestion, jour);
  const liens = { location: `${ADRESSE_LOCATION}${enRecherche(periode)}`, gestion: `${ADRESSE_GESTION}${enRecherche(periode)}` };
  const champsCommuns = <>
    <div className="tdb-champ trx-champ-mode"><span id="trx-activite-mot">Activité</span>
      <div className="trx-unites trx-modes" role="group" aria-labelledby="trx-activite-mot" data-filtre="activite">
        {ACTIVITES_FUSION.map((x) => <button key={x} type="button" className="trx-unite" aria-pressed={activite === x} onClick={() => setActivite(x)} data-activite={x}>{LIBELLE_ACTIVITE_FUSION[x]}</button>)}
      </div></div>
    <div className="tdb-champ trx-champ-unite"><span id="trx-unite-mot">Montants</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
  </>;
  const note = <p className="loc-muet trx-note-fusion" data-note-negociateur>Le détail par négociateur est sur la page <a className="trx-lien" href={liens.location}>Location</a>.</p>;
  const commun = { lignes, gestion, jour, activite, liens, salaires, onSalaires: setSalaires };
  return (
    <div className="tdb loc-page" data-ecran-fusion-lg>
      <style>{CSS}{CSS_FUSION}</style>
      {(luL.etat === 'ok' && !luL.data.disponible) && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-location>Le Suivi de la Location n’est pas disponible sur cette base : la part location compte 0.</p>}
      <div className="trx-barre">
        <div className="trx-vues" role="tablist" aria-label="Le mois ou l’année">
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'mois'} onClick={() => setVue('mois')} data-vue="mois">Le mois</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'annee'} onClick={() => setVue('annee')} data-vue="annee">L’année</button>
        </div>
      </div>
      <FournisseurAffichage value={unite}><ContexteLoc.Provider value={{ retros: luL.etat === 'ok' ? luL.data.retrocessions ?? [] : [], salaires: luL.etat === 'ok' ? luL.data.salaires ?? null : null }}>
      {vue === 'mois' ? <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
          {champsCommuns}
        </form>
        {note}
        <LigneDesMois annee={annee} mois={mois} decoupage={decoupage} moisChoisis={decoupage === 'mois' ? null : (periodeVue ?? []).filter((m) => m.annee === annee).map((m) => m.mois)}
          onMois={choisirMois} onDecoupage={choisirDecoupage} />
        {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
        <VueFusion {...commun} ms={periodeVue ?? [{ annee, mois }]} annee={annee} infobulle={decoupage === 'periode' ? libellePeriodeComplet(periodeVue ?? []) : undefined}
          lib={decoupage === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : decoupage === 'annee' ? String(annee) : libellePeriode(periodeVue ?? [])}
          borne={borneCumul(decoupage, annee, mois, decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null, jour)} toutes={null} historique={null}
          tableau={{ titre: decoupage === 'periode' ? libellePeriode(periodeVue ?? []) : String(annee), lignes: (decoupage === 'periode' ? periodeVue ?? [] : douzeMois(annee)).map(ligneMois) }}
          graphe={{ sorte: 'mois', mois: decoupage === 'mois' ? mois : 0, moisChoisis: decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null, onMois: choisirMois }} />
      </> : choixA !== null && anneesVisibles !== null && <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>{champsCommuns}</form>
        {note}
        <LigneDesAnnees annees={anneesVisibles} decoupage={choixA.decoupage} annee={choixA.annee} choisies={choixA.decoupage === 'tout' ? anneesVisibles : choixA.annees}
          onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
        {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
        <VueAnneeFusion {...commun} choix={choixA} anneesVisibles={anneesVisibles} onAnnee={choisirAnnee}
          onAnneeSeule={(a) => { setRefusAnnees(false); setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); }}
          onOuvrirMois={(a, m) => { setAnneeEntiere(false); setPeriode(null); setAnnee(a); setMois(m); setVue('mois'); }} />
      </>}
      </ContexteLoc.Provider></FournisseurAffichage>
    </div>
  );
}

/** 🔴 LOT LO11 — les données de la Location pour la règle des coûts (rétrocessions, salaires chargés saisis), et le calcul qui les prend. */
const ContexteLoc = createContext<{ retros: readonly RetroLocation[]; salaires: readonly SalairesLocation[] | null }>({ retros: [], salaires: null });
function useTF(): (l: readonly LigneLocationCa[], g: readonly GestionMois[], ms: readonly MoisChoisi[], a: ActiviteFusion, s: boolean) => TotauxFusion {
  const loc = useContext(ContexteLoc);
  return (l, g, ms, a, s) => totauxFusion(l, g, ms, a, s, loc);
}

/** Une ligne du tableau : un mois (ou une année : ses 12 mois). */
interface LigneTableau { cle: string; libelle: string; ms: readonly MoisChoisi[]; unMois: boolean }
const ligneMois = (m: MoisChoisi): LigneTableau => ({ cle: `${m.annee}-${m.mois}`, libelle: NOMS_MOIS[m.mois - 1], ms: [m], unMois: true });
const ligneAnnee = (a: number): LigneTableau => ({ cle: String(a), libelle: String(a), ms: douzeMois(a), unMois: false });

/** « L'année » : les années choisies (une, plusieurs, toutes) ; « Toute l'histoire ». */
function VueAnneeFusion({ choix, anneesVisibles, onAnnee, onAnneeSeule, onOuvrirMois, ...commun }: Commun & {
  choix: ChoixAnnees; anneesVisibles: readonly number[]; onAnnee: (a: number) => void; onAnneeSeule: (a: number) => void; onOuvrirMois: (a: number, m: number) => void;
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
  return <VueFusion {...commun} ms={moisDesAnnees(sel)} annee={choix.annee} lib={lib} borne={null}
    toutes={enTout ? `Toutes les années (${anneesVisibles[0]} → ${anneesVisibles.at(-1)})` : null}
    historique={{ annees: anneesVisibles, choisie: choix.annee, onAnnee: onAnneeSeule }}
    tableau={enTout ? { titre: 'Année par année', lignes: sel.map(ligneAnnee) } : { titre: lib, lignes: moisDesAnnees(sel).map((m) => ({ ...ligneMois(m), libelle: sel.length > 1 ? `${NOMS_MOIS[m.mois - 1]} ${m.annee}` : NOMS_MOIS[m.mois - 1] })) }}
    graphe={echelle === 'annees' ? { sorte: 'annees', annees: anneesVisibles, selection: sel, decoupage: choix.decoupage, onAnnee, entete: choixEchelle }
      : { sorte: 'mois', mois: 0, moisChoisis: null, onMois: (m) => onOuvrirMois(choix.annee, m), entete: choixEchelle }} />;
}

interface Commun { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; jour: string; activite: ActiviteFusion; liens: { location: string; gestion: string };
  /** 🔴 LOT LG2 — « Avec salaires » (true) | « Sans salaires » (false). */
  salaires: boolean; onSalaires: (avec: boolean) => void }
type Graphe = { sorte: 'mois'; mois: number; moisChoisis: readonly number[] | null; onMois: (m: number) => void; entete?: ReactNode }
  | { sorte: 'annees'; annees: readonly number[]; selection: readonly number[]; decoupage: DecoupageAnnees; onAnnee: (a: number) => void; entete: ReactNode };

/** Les tuiles, le graphique, le Résultat, le tableau et « Toute l'histoire » d'un ensemble de mois. */
function VueFusion({ lignes, gestion, jour, activite, liens, salaires, onSalaires, ms, annee, lib, infobulle, borne, toutes, historique, tableau, graphe }: Commun & {
  ms: readonly MoisChoisi[]; annee: number; lib: string;
  /** 🔴 LOT LO12 — la liste complète des mois d'une période non contiguë (title / aria-label des titres). */
  infobulle?: string;
  /** « Le mois » : la borne du cumul ; null : « L'année ». */
  borne: { fin: number; mot: string } | null;
  toutes: string | null;
  historique: { annees: readonly number[]; choisie: number; onAnnee: (a: number) => void } | null;
  tableau: { titre: string; lignes: readonly LigneTableau[] };
  graphe: Graphe;
}) {
  const U = useEnUnite();
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const T = tf(lignes, gestion, ms, activite, salaires);
  const ms1 = unAnPlusTot(ms);
  const T1 = tf(lignes, gestion, ms1, activite, salaires);
  const anneesN1 = [...new Set(ms1.map((m) => m.annee))];
  const sansN1 = !lignes.some((l) => anneesN1.includes(l.annee)) && !gestion.some((g) => anneesN1.includes(g.annee));
  const enN1 = anneesN1.length === 1 ? `en ${anneesN1[0]}` : 'un an plus tôt';
  const n1 = (c: MontantC, c1: MontantC): string => (toutes !== null ? toutes : sansN1 ? `${anneesN1.join(', ')} : aucune activité` : `${eur(U.en(c1))} ${enN1} (${signePct(variation(U.en(c), U.en(c1)))})`);
  const cumul = borne === null ? null : tf(lignes, gestion, Array.from({ length: borne.fin }, (_, i) => ({ annee, mois: i + 1 })), activite, salaires);
  const motCumul = borne === null ? '' : `cumul ${annee} ${borne.mot.startsWith('à fin') ? borne.mot : `(${borne.mot})`}`;
  const [fenetre, setFenetre] = useState<'ca' | 'couts' | 'net' | null>(null);
  const tuileCa = useRef<HTMLButtonElement | null>(null);
  const tuileCouts = useRef<HTMLDivElement | null>(null);
  const tuileNet = useRef<HTMLButtonElement | null>(null);
  const deux = activite === 'deux';
  const avecL = activite !== 'gestion'; const avecG = activite !== 'location';
  const explication = (t: string) => <small className="trx-tuile-explication" data-tuile-explication-fusion>{t}</small>;
  const autre = (m: MontantC) => <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({U.autre(m)})</small>;
  const lotsTexte = (x: TotauxFusion): string => (x.lots === null ? '' : `${ms.length === 1 ? x.lots.toLocaleString('fr-FR') : Math.round(x.lots).toLocaleString('fr-FR')} lots${ms.length === 1 ? '' : ' en moyenne'}`);
  const volume = (x: TotauxFusion): string => [x.baux === null ? '' : `${x.baux} ${x.baux > 1 ? 'baux' : 'bail'}`, x.lots === null ? (avecG ? 'lots : —' : '') : lotsTexte(x)].filter(Boolean).join(' · ');
  const familles = FAMILLES_COUTS.filter((f) => (f.activite === 'location' ? avecL : avecG));
  // 🔴 LOT LG2 — la tuile « Coûts » s'ouvre au clic, à Entrée ou Espace ; son sélecteur « Avec | Sans salaires » n'ouvre rien
  const ouvrirCouts = (e: { target: EventTarget }): void => { if (horsSelecteur(e)) setFenetre('couts'); };
  const choixSalaires = <SelecteurSalaires salaires={salaires} onChange={onSalaires} />;
  // 🔴 LOT LG5 — ce qui a quitté la tuile « CA brut » (montré dans sa fenêtre) : la part de chaque activité ; le CA brut mois par mois (ou année par année)
  const partsCa = deux ? <>dont location {eur(U.en(T.location.ca))} · gestion {eur(U.en(T.gestion.ca))}</> : `${LIBELLE_ACTIVITE_FUSION[activite]} seule`;
  const parAnnee = new Set(ms.map((m) => m.annee)).size > 1;
  const detailCa = parAnnee ? [...new Set(ms.map((m) => m.annee))].map((a) => ({ cle: String(a), mot: String(a), ca: tf(lignes, gestion, ms.filter((m) => m.annee === a), activite, salaires).ca }))
    : ms.map((m) => ({ cle: `${m.annee}-${m.mois}`, mot: moisLib(m), ca: tf(lignes, gestion, [m], activite, salaires).ca }));
  return <>
    <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${infobulle ?? lib}`} title={infobulle} data-ecran-fusion-tuiles>
      {/* 🔴 LOT LG5 (Arno) — tuiles épurées : titre, explication, montant, montant entre parenthèses ; le reste passe dans la fenêtre de la tuile */}
      <li><button type="button" className="tdb-tuile" data-tuile="fusion-ca" aria-haspopup="dialog" aria-expanded={fenetre === 'ca'} ref={tuileCa} onClick={() => setFenetre('ca')}>
        <span className="tdb-tuile-mot">CA brut — {lib}{explication(EXPLICATION.ca)}</span>
        <strong className="tdb-tuile-valeur" data-fusion-ca>{eur(U.en(T.ca))}</strong>{autre(T.ca)}
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-fusion="ca">Voir le détail</span></button></li>
      <li><div className="tdb-tuile" data-tuile="fusion-volume">
        <span className="tdb-tuile-mot">Volume — {lib}{explication(EXPLICATION.volume)}</span>
        <strong className="tdb-tuile-valeur" data-fusion-volume>{volume(T) || '—'}</strong>
        <small className="trx-montant-autre trx-tuile-autre" aria-hidden="true">{' '}</small>
        <span className="tdb-tuile-n1" data-tuile-n1="fusion-volume">{toutes !== null ? toutes : sansN1 ? `${anneesN1.join(', ')} : aucune activité` : `${volume(T1) || '—'} ${enN1}`}</span></div></li>
      <li><div role="button" tabIndex={0} className="tdb-tuile" data-tuile="fusion-couts" aria-haspopup="dialog" aria-expanded={fenetre === 'couts'} ref={tuileCouts}
        onClick={ouvrirCouts} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirCouts(e); } }}>
        <span className="tdb-tuile-mot">Coûts{hors(salaires)} — {lib}{explication(!salaires ? EXPLICATION.coutsSans : EXPLICATION.couts)}{choixSalaires}</span>
        <strong className={`tdb-tuile-valeur ${classeSens('verse', T.coutsTotal.htC, T.coutsTotal.ttcC)}`} data-fusion-couts>{eur(U.en(T.coutsTotal))}</strong>{autre(T.coutsTotal)}
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-fusion="couts">Voir le détail</span></div></li>
      <li><button type="button" className="tdb-tuile" data-tuile="fusion-net" aria-haspopup="dialog" aria-expanded={fenetre === 'net'} ref={tuileNet} onClick={() => setFenetre('net')}>
        <span className="tdb-tuile-mot">CA net{hors(salaires)} — {lib}{explication(salaires ? EXPLICATION.net : EXPLICATION.netSans)}</span>
        <strong className={`tdb-tuile-valeur ${T.net.htC < 0 ? 'trx-rouge' : 'trx-vert'}`} data-fusion-net>{eur(U.en(T.net))}</strong>{autre(T.net)}
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-fusion="net">Voir le détail</span></button></li>
    </ul>
    {fenetre === 'ca' && <FenetreCaFusion lignes={lignes} gestion={gestion} ms={ms} activite={activite} salaires={salaires} lib={lib} onFermer={() => { setFenetre(null); tuileCa.current?.focus(); }}
      reperes={<>
        {/* 🔴 LOT LG5 — ce qui a quitté la tuile « CA brut » : dont location · gestion, le cumul, la même période un an plus tôt et l'écart */}
        <Reperes donnee="ca" lignes={[
          { cle: 'parts', mot: 'Location · gestion', valeur: <span className="trx-fl-texte" data-fusion-ca-parts>{partsCa}</span> },
          ...(cumul === null ? [] : [{ cle: 'cumul', mot: <span data-fusion-cumul-mot>{motCumul.charAt(0).toUpperCase() + motCumul.slice(1)}</span>,
            valeur: <Montant htC={cumul.ca.htC} ttcC={cumul.ca.ttcC} versee={false} recu donnees={{ 'data-fusion-cumul': '' }} /> }]),
          { cle: 'n1', mot: toutes !== null || sansN1 ? 'Un an plus tôt' : `Même période ${enN1}`, valeur: toutes !== null || sansN1
            ? <span className="trx-fl-texte" data-repere-n1="ca">{n1(T.ca, T1.ca)}</span>
            : <Montant htC={T1.ca.htC} ttcC={T1.ca.ttcC} versee={false} recu donnees={{ 'data-repere-n1': 'ca' }} apres={<small data-repere-ecart="ca"> {signePct(variation(U.en(T.ca), U.en(T1.ca)))}</small>} /> },
        ]} />
        {detailCa.length > 1 && <Reperes titre={parAnnee ? 'CA brut année par année' : 'CA brut mois par mois'} donnee="ca-mois" lignes={detailCa.map((x) => ({ cle: x.cle, mot: x.mot,
          valeur: <Montant htC={x.ca.htC} ttcC={x.ca.ttcC} versee={false} recu donnees={{ 'data-repere-ca-mois': x.cle }} /> }))} />}
      </>} />}
    {fenetre === 'couts' && <FenetreCoutsFusion lignes={lignes} gestion={gestion} ms={ms} activite={activite} salaires={salaires} lib={lib} liens={liens} onFermer={() => { setFenetre(null); tuileCouts.current?.focus(); }}
      reperes={<Reperes donnee="couts" lignes={[
        // 🔴 LOT LG5 — ce qui a quitté la tuile « Coûts » : les familles (ce qui est déduit ; salaires non comptés ; « inclus dans les salaires ») et N−1
        { cle: 'familles', mot: 'Familles', valeur: <span className="trx-fl-texte" data-fusion-couts-familles>{familles.map((f, i) => {
          const salaire = f.cle === 'salaries' || f.cle === 'salairesLocation';
          const gris = salaire && !salaires;
          return <span key={f.cle} className={gris ? 'loc-muet' : undefined} data-famille-tuile={f.cle}>{i > 0 ? ' · ' : ''}{gris ? `${motFamille(f.cle)} (non comptés)` : motFamille(f.cle)} {eur(U.en(gris ? T.couts[f.cle] : T.deduits[f.cle]))}</span>;
        })}
          {T.inclus.mois > 0 && <span className="trx-ligne-bloc loc-muet" data-fusion-inclus>primes {eur(U.en(T.inclus.primes))} et variable {eur(U.en(T.inclus.variable))} inclus dans les salaires</span>}</span> },
        { cle: 'n1', mot: 'Un an plus tôt', valeur: <span className="trx-fl-texte" data-tuile-n1="fusion-couts">{n1(T.coutsTotal, T1.coutsTotal)}</span> },
      ]} />} />}
    {fenetre === 'net' && <FenetreNetFusion lignes={lignes} gestion={gestion} ms={ms} activite={activite} salaires={salaires} lib={lib} onFermer={() => { setFenetre(null); tuileNet.current?.focus(); }}
      reperes={<Reperes donnee="net" lignes={[
        // 🔴 LOT LG5 — ce qui a quitté la tuile « CA net » : dont location · gestion, et N−1
        { cle: 'parts', mot: 'Location · gestion', valeur: <span className="trx-fl-texte" data-fusion-net-parts>{deux ? <>dont location {eur(U.en(T.location.net))} · gestion {eur(U.en(T.gestion.net))}</> : `${LIBELLE_ACTIVITE_FUSION[activite]} seule`}</span> },
        { cle: 'n1', mot: 'Un an plus tôt', valeur: <span className="trx-fl-texte" data-tuile-n1="fusion-net">{n1(T.net, T1.net)}</span> },
      ]} />} />}

    {graphe.sorte === 'mois'
      ? <GrapheFusionMois lignes={lignes} gestion={gestion} jour={jour} activite={activite} salaires={salaires} annee={annee} g={graphe} />
      : <GrapheFusionAnnees lignes={lignes} gestion={gestion} jour={jour} activite={activite} salaires={salaires} annee={annee} g={graphe} toutes={toutes} />}

    <section className="tdb-section" aria-labelledby="trx-resultat-fusion" data-bloc="resultat-fusion">
      <h3 id="trx-resultat-fusion" title={infobulle}>Résultat de l’activité — {lib}</h3>
      <ResultatFusion T={T} />
    </section>

    <TableauFusion lignes={lignes} gestion={gestion} jour={jour} activite={activite} liens={liens} salaires={salaires} onSalaires={onSalaires} titre={tableau.titre} rangees={tableau.lignes} />

    {historique !== null && (
      <BlocReplie id="trx-histoire-fusion" section="histoire-fusion" titre={<>Toute l’histoire</>} resume={`${historique.annees[0]} → ${historique.annees.at(-1)}`}
        donnees={{ 'data-bloc': 'histoire-fusion' }}>
        <TableauFusion lignes={lignes} gestion={gestion} jour={jour} activite={activite} liens={liens} salaires={salaires} onSalaires={onSalaires} titre="Toute l’histoire" rangees={historique.annees.map(ligneAnnee)}
          choisie={String(historique.choisie)} onRangee={(r) => historique.onAnnee(Number(r.cle))} sansTitre />
      </BlocReplie>
    )}
  </>;
}

const motFamille = (f: FamilleCout): string => ({ primes: 'primes', apporteurs: 'apporteurs', variable: 'variable', salairesLocation: 'salaires location', adhoc: 'ADHOC', monga: 'MONGA', salaries: 'salaires gestion' } as const)[f];

/**
 * « Résultat de l'activité » : Location (CA brut − apporteurs − primes − variable − salaires chargés = CA net), Gestion (honoraires − ADHOC − MONGA −
 * salaires chargés = reste), le total. 🔴 LOT LO11 — les primes et le variable des mois avec salaires : montrés, « inclus dans les salaires », non
 * déduits ; « Sans salaires » : les salaires en gris, non déduits.
 */
function ResultatFusion({ T }: { T: TotauxFusion }) {
  const MOT = MOT_UNITE[useAffichage()];
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  const avecL = T.activite !== 'gestion'; const avecG = T.activite !== 'location';
  const en = (x: MontantC): string => eur((MOT === 'TTC' ? x.ttcC : x.htC) / 100);
  const inclus = (tout: MontantC, deduit: MontantC): ReactNode => (tout.htC === deduit.htC ? null
    : <small className="loc-muet" data-inclus-salaires> (dont {en(moinsC(tout, deduit))} inclus dans les salaires)</small>);
  const salaire = (cle: 'salaries' | 'salairesLocation', mot: string, p: typeof T.location) => (T.salaires
    ? <><dt>− {mot} (sans TVA)</dt><dd><Mt {...m(p.deduits[cle])} cout donnees={{ 'data-resultat-fusion': cle }} /></dd></>
    : <><dt className="loc-muet">{mot} (sans TVA) — non déduits</dt><dd className="loc-muet"><Mt {...m(p.couts[cle])} classe="loc-muet" donnees={{ 'data-resultat-fusion': cle }} /></dd></>);
  return (
    <dl className="trx-resultat" data-resultat-fusion>
      {avecL && <>
        <dt className="trx-fusion-groupe">Location</dt><dd className="trx-fusion-groupe" />
        <dt>CA brut location ({MOT})</dt><dd><Mt {...m(T.location.ca)} donnees={{ 'data-resultat-fusion': 'location-ca' }} /></dd>
        <dt>− Commissions d’apporteurs</dt><dd><Mt {...m(T.location.deduits.apporteurs)} cout donnees={{ 'data-resultat-fusion': 'apporteurs' }} /></dd>
        <dt>− Primes de nouvelle gestion{inclus(T.location.couts.primes, T.location.deduits.primes)}</dt><dd><Mt {...m(T.location.deduits.primes)} cout donnees={{ 'data-resultat-fusion': 'primes' }} /></dd>
        <dt>− Variable du négociateur (sans TVA){inclus(T.location.couts.variable, T.location.deduits.variable)}</dt><dd><Mt {...m(T.location.deduits.variable)} cout donnees={{ 'data-resultat-fusion': 'variable' }} /></dd>
        {salaire('salairesLocation', 'Salaires chargés — location', T.location)}
        <dt className="trx-total">= CA net location</dt><dd className="trx-total trx-vert"><Mt {...m(T.location.net)} donnees={{ 'data-resultat-fusion': 'location-net' }} /></dd>
      </>}
      {avecG && <>
        <dt className="trx-fusion-groupe">Gestion</dt><dd className="trx-fusion-groupe" />
        <dt>Honoraires de gestion ({MOT})</dt><dd><Mt {...m(T.gestion.ca)} donnees={{ 'data-resultat-fusion': 'gestion-ca' }} /></dd>
        <dt>− Coût ADHOC</dt><dd><Mt {...m(T.gestion.deduits.adhoc)} cout donnees={{ 'data-resultat-fusion': 'adhoc' }} /></dd>
        <dt>− Coût MONGA</dt><dd><Mt {...m(T.gestion.deduits.monga)} cout donnees={{ 'data-resultat-fusion': 'monga' }} /></dd>
        {salaire('salaries', 'Salaires chargés — gestion', T.gestion)}
        <dt className="trx-total">= Reste gestion{hors(T.salaires)} (CA net)</dt><dd className="trx-total trx-vert"><Mt {...m(T.gestion.net)} donnees={{ 'data-resultat-fusion': 'gestion-net' }} /></dd>
      </>}
      <dt className="trx-total trx-fusion-final">= CA net{hors(T.salaires)} {T.activite === 'deux' ? 'Location & Gestion' : LIBELLE_ACTIVITE_FUSION[T.activite]}</dt>
      <dd className="trx-total trx-fusion-final trx-vert"><Mt {...m(T.net)} donnees={{ 'data-resultat-fusion': 'net' }} /></dd>
    </dl>
  );
}

/**
 * Le tableau mois par mois (ou année par année) : Location CA · net, Gestion CA · net, Total CA · net, et la ligne de total (la somme des lignes).
 * Un mois de gestion non saisi : « — », compté 0 (mention dessous). Les noms d'activité mènent à leur page, sur la même période.
 */
function TableauFusion({ lignes, gestion, jour, activite, liens, salaires, titre, rangees, choisie, onRangee, sansTitre = false }: Commun & {
  titre: string; rangees: readonly LigneTableau[]; choisie?: string; onRangee?: (r: LigneTableau) => void; sansTitre?: boolean;
}) {
  const U = useEnUnite();
  const avecL = activite !== 'gestion'; const avecG = activite !== 'location';
  const dernier = jour.slice(0, 7);
  const saisis = (r: LigneTableau): number => r.ms.filter((m) => moisDeGestion(gestion, m).saisi).length;
  const passes = (r: LigneTableau): MoisChoisi[] => r.ms.filter((m) => `${m.annee}-${String(m.mois).padStart(2, '0')}` <= dernier);
  const nonSaisis = rangees.flatMap((r) => passes(r).filter((m) => !moisDeGestion(gestion, m).saisi));
  const cell = (x: MontantC | null, cle: string, cout = false) => <td data-mot={cle} className={cout ? classeSens('verse', x?.htC ?? 0, x?.ttcC ?? 0) : undefined}>{x === null ? '—' : eur(U.en(x))}</td>;
  const tous = rangees.flatMap((r) => r.ms);
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const total = tf(lignes, gestion, tous, activite, salaires);
  const ligne = (r: LigneTableau) => {
    const t = tf(lignes, gestion, r.ms, activite, salaires);
    const gVide = avecG && saisis(r) === 0;
    return (
      <tr key={r.cle} data-rangee-fusion={r.cle} className={choisie === r.cle ? 'tdb-fort' : undefined}>
        <th scope="row">{onRangee === undefined ? r.libelle : <button type="button" className="tdb-chiffre" onClick={() => onRangee(r)}>{r.libelle}</button>}</th>
        {avecL && <>{cell(t.location.ca, 'Location CA')}{cell(t.location.net, 'Location net')}</>}
        {avecG && <>{cell(gVide ? null : t.gestion.ca, 'Gestion CA')}{cell(gVide ? null : t.gestion.net, 'Gestion net')}</>}
        {cell(t.ca, 'Total CA')}{cell(t.net, 'Total net')}
      </tr>
    );
  };
  const corps = (
    <>
      <div className="trx-fusion-defile">
        <table className="tdb-table tdb-table--large" data-table-fusion>
          <thead>
            <tr><th scope="col" rowSpan={2}>{rangees[0]?.unMois === false ? 'Année' : 'Mois'}</th>
              {avecL && <th scope="colgroup" colSpan={2}><a className="trx-lien" href={liens.location} data-lien-origine="location">Location</a></th>}
              {avecG && <th scope="colgroup" colSpan={2}><a className="trx-lien" href={liens.gestion} data-lien-origine="gestion">Gestion</a></th>}
              <th scope="colgroup" colSpan={2}>Total</th></tr>
            <tr>{avecL && <><th scope="col">CA</th><th scope="col">Net</th></>}{avecG && <><th scope="col">CA</th><th scope="col">Net</th></>}<th scope="col">CA</th><th scope="col">Net</th></tr>
          </thead>
          <tbody>
            {rangees.map(ligne)}
            <tr className="tdb-fort trx-ligne-total" data-total-fusion><th scope="row">Total</th>
              {avecL && <>{cell(total.location.ca, 'Location CA')}{cell(total.location.net, 'Location net')}</>}
              {avecG && <>{cell(total.gestion.ca, 'Gestion CA')}{cell(total.gestion.net, 'Gestion net')}</>}
              {cell(total.ca, 'Total CA')}{cell(total.net, 'Total net')}</tr>
          </tbody>
        </table>
      </div>
      {avecG && nonSaisis.length > 0 && <p className="loc-muet" data-gestion-non-saisie>{nonSaisis.length} mois de gestion non saisi{nonSaisis.length > 1 ? 's' : ''} (« — », compté{nonSaisis.length > 1 ? 's' : ''} 0) : {nonSaisis.map((m) => `${NOMS_MOIS[m.mois - 1].toLowerCase()} ${m.annee}`).join(', ')}.</p>}
    </>
  );
  if (sansTitre) return corps;
  return (
    <section className="tdb-section" aria-labelledby="trx-tableau-fusion" data-bloc="tableau-fusion">
      <h3 id="trx-tableau-fusion">{titre} {rangees[0]?.unMois === false ? '' : 'mois par mois '}<small className="loc-muet">({U.MOT}{U.u === 'ttc' ? ' ; salaires chargés sans TVA' : ''}{salaires ? '' : ' ; net hors salaires'})</small></h3>
      {corps}
    </section>
  );
}

/** La valeur d'une mesure, dans l'unité affichée ; la part location (le bas de la barre empilée). */
const valeurDe = (t: TotauxFusion, mesure: Mesure, en: (m: MontantC) => number): number => en(mesure === 'net' ? t.net : mesure === 'couts' ? t.coutsTotal : t.ca);
const basDe = (t: TotauxFusion, mesure: Mesure, en: (m: MontantC) => number): number => en(mesure === 'net' ? t.location.net : mesure === 'couts' ? t.location.coutsTotal : t.location.ca);
const motMesure = (m: Mesure, MOT: string, salaires = true): string => (m === 'net' ? `CA net${hors(salaires)} ${MOT}` : m === 'couts' ? `Coûts${hors(salaires)} ${MOT}` : `CA ${MOT}`);
/** L'encadré d'un point : la location, la gestion, le total ; N−1 (sauf « Tout ») ; « mois de gestion non saisi » dans le titre. */
function infoFusion(titre: string, mesure: Mesure, U: ReturnType<typeof useEnUnite>, libelle: string, t: TotauxFusion, libelleN1: string | null, t1: TotauxFusion | null, sansN1: string): InfoBarre {
  const part = (x: TotauxFusion) => {
    const c = (p: 'location' | 'gestion') => U.en(mesure === 'net' ? x[p].net : mesure === 'couts' ? x[p].coutsTotal : x[p].ca);
    return x.activite === 'deux' ? { parts: [{ mot: 'Location', ca: c('location') }, { mot: 'Gestion', ca: c('gestion') }] } : {};
  };
  const autreDe = (x: TotauxFusion): number => U.autreC(mesure === 'net' ? x.net : mesure === 'couts' ? x.coutsTotal : x.ca);
  return { titre, motCa: motMesure(mesure, U.MOT, t.salaires), motNb: 'Baux', sansN1, autre: { mot: MOT_UNITE[U.u === 'ht' ? 'ttc' : 'ht'], facteur: U.u === 'ht' ? 1.2 : 1 / 1.2 },
    courant: { libelle, ca: valeurDe(t, mesure, U.en), nb: t.baux, caAutre: autreDe(t), ...part(t) },
    precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: valeurDe(t1, mesure, U.en), nb: t1.baux, caAutre: autreDe(t1), ...part(t1) } };
}
function useMesure(): [Mesure, (m: Mesure) => void] {
  const [mesure, setMesure] = useState<Mesure>(() => { const x = parametre('mesure'); return x === 'net' || x === 'couts' ? x : 'ca'; });
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'ca' ? null : mesure }); }, [mesure]);
  return [mesure, setMesure];
}
/** La légende des barres empilées : le dessin même des barres (le bas : location ; le haut, plus clair : gestion). */
const Pastille = ({ haut }: { haut: boolean }) => <svg width="12" height="12" aria-hidden="true" className="trx-fusion-pastille"><rect width="12" height="12" rx="2" className={haut ? 'tdb-barre tdb-barre--haut' : 'tdb-barre'} /></svg>;
const Legende = ({ activite }: { activite: ActiviteFusion }) => (activite !== 'deux' ? null : (
  <p className="loc-muet trx-legende-empile" data-legende-empile><Pastille haut={false} /> location · <Pastille haut /> gestion</p>
));

/** « Mois par mois » : Mensuel (barres empilées location / gestion, N−1 hachurée de même) / Cumul ; encadré à droite. */
function GrapheFusionMois({ lignes, gestion, jour, activite, salaires, annee, g }: { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; jour: string; activite: ActiviteFusion; salaires: boolean; annee: number;
  g: Extract<Graphe, { sorte: 'mois' }> }) {
  const U = useEnUnite();
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const dernier = moisADate(annee, jour);
  const sansN1 = !lignes.some((l) => l.annee === annee - 1) && !gestion.some((x) => x.annee === annee - 1);
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const pt = (a: number, k: number): TotauxFusion => tf(lignes, gestion, cumul ? Array.from({ length: k }, (_, i) => ({ annee: a, mois: i + 1 })) : [{ annee: a, mois: k }], activite, salaires);
  const info = (k: number): InfoBarre => {
    const t = pt(annee, k);
    const nonSaisi = !cumul && activite !== 'location' && k <= dernier && !moisDeGestion(gestion, { annee, mois: k }).saisi;
    const titre = `${cumul ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`}${k > dernier ? ' — à venir' : nonSaisi ? ' — mois de gestion non saisi' : ''}`;
    return infoFusion(titre, mesure, U, String(annee), t, sansN1 ? null : String(annee - 1), sansN1 ? null : pt(annee - 1, k), `${annee - 1} : aucune activité`);
  };
  const tous = (a: number) => Array.from({ length: 12 }, (_, i) => tf(lignes, gestion, [{ annee: a, mois: i + 1 }], activite, salaires));
  const ts = tous(annee); const ts1 = tous(annee - 1);
  const vals = ts.map((t) => valeurDe(t, mesure, U.en)); const vals1 = ts1.map((t) => valeurDe(t, mesure, U.en));
  const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);
  const choisi = g.moisChoisis !== null ? (g.moisChoisis.length === 0 ? 0 : borneCumul('periode', annee, g.mois, g.moisChoisis, jour).fin) : g.mois;
  const finAnnee = borneCumul('annee', annee, 0, null, jour).fin;
  const repos = choisi === 0 ? info(finAnnee === 0 ? 1 : finAnnee) : undefined;
  const motGraphe = motMesure(mesure, U.MOT, salaires);
  return (
    <section className="tdb-section" aria-labelledby="trx-fusion-histo" data-bloc="histogramme-mois" data-mesure={mesure}
      {...(g.moisChoisis !== null ? { 'data-periode-graphe': g.moisChoisis.join(',') } : {})}>
      {g.moisChoisis !== null && <style>{`[data-periode-graphe] g[data-barre-mois]{opacity:.35}${g.moisChoisis.map((k) => `[data-periode-graphe] g[data-barre-mois="${k}"]{opacity:1}[data-periode-graphe] g[data-barre-mois="${k}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<Mesure> id="trx-fusion-histo" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel" mesures={MESURES}
        titre={<>Mois par mois — {annee} <small className="loc-muet">({motGraphe}{cumul ? ', cumulé depuis janvier' : ''})</small></>} />
      {g.entete}
      {cumul ? (
        <CourbeCumul courant={cumuler(vals).slice(0, dernier)} n1={sansN1 ? null : cumuler(vals1)} annee={annee} selection={choisi} aria={`${motGraphe} cumulé ${annee}`}
          bulle={info} onChoisir={g.onMois} repos={repos} />
      ) : (
        <Histogramme attribut="data-barre-mois" courante={choisi} onChoisir={g.onMois} aria={`${motGraphe} par mois, ${annee}`} repos={repos}
          legende={{ courant: String(annee), n1: sansN1 ? null : String(annee - 1) }}
          barres={vals.map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernier ? null : v, n1: sansN1 ? null : vals1[i], info: info(i + 1),
            ...(activite === 'deux' ? { empile: { bas: basDe(ts[i], mesure, U.en), basN1: sansN1 ? null : basDe(ts1[i], mesure, U.en) } } : {}) }))} />
      )}
      {!cumul && <Legende activite={activite} />}
    </section>
  );
}

/** « Année par année » : Annuel (barres empilées) / Cumul ; « Tout » sans N−1. */
function GrapheFusionAnnees({ lignes, gestion, jour, activite, salaires, annee, g, toutes }: { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; jour: string; activite: ActiviteFusion; salaires: boolean;
  annee: number; g: Extract<Graphe, { sorte: 'annees' }>; toutes: string | null }) {
  const U = useEnUnite();
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const enCours = Number(jour.slice(0, 4));
  const { annees } = g;
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const de = (as: readonly number[]): TotauxFusion => tf(lignes, gestion, moisDesAnnees(as), activite, salaires);
  const pt = (a: number): TotauxFusion => (cumul ? de(annees.filter((x) => x <= a)) : de([a]));
  const info = (a: number): InfoBarre => {
    const avant = toutes === null && annees.includes(a - 1);
    const titre = cumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === enCours ? ' — en cours' : ''}`;
    return infoFusion(titre, mesure, U, String(a), pt(a), avant ? String(a - 1) : null, avant ? pt(a - 1) : null, toutes ?? `${a - 1} : aucune activité`);
  };
  const ts = annees.map((a) => pt(a));
  const vals = ts.map((t) => valeurDe(t, mesure, U.en));
  const motGraphe = motMesure(mesure, U.MOT, salaires);
  const enPeriode = g.decoupage === 'periode';
  return (
    <section className="tdb-section" aria-labelledby="trx-fusion-annees" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees"
      {...(enPeriode ? { 'data-periode-annees': g.selection.join(',') } : {})}>
      {enPeriode && <style>{`[data-periode-annees] g[data-barre-annee]{opacity:.35}${g.selection.map((a) => `[data-periode-annees] g[data-barre-annee="${a}"]{opacity:1}[data-periode-annees] g[data-barre-annee="${a}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<Mesure> id="trx-fusion-annees" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Annuel" mesures={MESURES}
        titre={<>Année par année <small className="loc-muet">({motGraphe}{cumul ? `, cumulé depuis ${annees[0]}` : ''} ; une année s’ouvre d’un clic)</small></>} />
      {g.entete}
      {cumul ? (
        <CourbeCumul courant={vals.slice(0, annees.filter((a) => a <= enCours).length)} n1={null} annee={annee} selection={annee} aria={`${motGraphe} cumulé par année`}
          etiquettes={annees.map(String)} cles={annees} nom="annees-cumul" attributZone="data-annee-cumul" bulle={info} onChoisir={g.onAnnee}
          legende={<><span className="tdb-legende tdb-legende--courant" /> cumul depuis {annees[0]}</>} />
      ) : (
        <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={g.onAnnee} pasFixe={PAS_ANNEE_FIXE} aria={`${motGraphe} par année`}
          barres={annees.map((a, k) => ({ cle: a, libelle: String(a), valeur: a > enCours ? null : vals[k], info: info(a),
            ...(activite === 'deux' ? { empile: { bas: basDe(ts[k], mesure, U.en) } } : {}) }))} />
      )}
      {!cumul && <Legende activite={activite} />}
    </section>
  );
}

/** Les mois de la période, un par bloc dans les fenêtres (ceux qui portent quelque chose). */
const moisLib = (m: MoisChoisi): string => `${NOMS_MOIS[m.mois - 1]} ${m.annee}`;

/**
 * La fenêtre « Coûts par famille » (tuile 3) : Par catégorie — les primes et les commissions d'apporteurs (les sections de la fenêtre de la page
 * Location), le variable du négociateur et les salaires chargés de la location, ADHOC, MONGA, les salaires chargés de la gestion (un mois par ligne) ;
 * Par mois — un bloc par mois. 🔴 LOT LO11 — chaque sous-total : ce qui est déduit ; une prime ou un variable d'un mois avec salaires : montré, « inclus
 * dans les salaires » ; « Sans salaires » : les salaires en gris, « non comptés ».
 */
function FenetreCoutsFusion({ lignes, gestion, ms, activite, salaires, lib, liens, onFermer, reperes }: { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; ms: readonly MoisChoisi[];
  activite: ActiviteFusion; salaires: boolean; lib: string; liens: { location: string }; onFermer: () => void;
  /** 🔴 LOT LG5 — ce qui a quitté la tuile (familles, N−1), montré dans les deux modes. */
  reperes?: ReactNode }) {
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const T = tf(lignes, gestion, ms, activite, salaires);
  const U = useEnUnite();
  const avecL = activite !== 'gestion'; const avecG = activite !== 'location';
  const lignesP = avecL ? lignesDesMois(lignes, ms) : [];
  const lien = useLienBail(() => { window.location.href = liens.location; });
  const parMois = ms.map((m) => ({ m, t: tf(lignes, gestion, [m], activite, salaires) }));
  const inclusMois = (a: number, k: number): boolean => parMois.some((x) => x.m.annee === a && x.m.mois === k && x.t.inclus.mois > 0);
  const nonCompte = (k: FamilleCout): boolean => (k === 'salaries' || k === 'salairesLocation') && !salaires;
  const mention = (k: FamilleCout, t: TotauxFusion): ReactNode => (nonCompte(k) ? <small className="trx-fc-sous"> — non comptés</small>
    : (k === 'primes' || k === 'variable') && t.couts[k].htC !== t.deduits[k].htC
      ? <small className="trx-fc-sous" data-inclus-salaires> — {t.deduits[k].htC === 0 ? 'inclus dans les salaires' : `dont ${eur(U.en(moinsC(t.couts[k], t.deduits[k])))} inclus dans les salaires`}</small> : null);
  /** Une famille, un mois par ligne (variable, salaires, ADHOC, MONGA). */
  const sectionMois = (k: FamilleCout, libelle: string) => {
    const mois = parMois.filter((x) => x.t.couts[k].htC !== 0);
    const total = nonCompte(k) ? T.couts[k] : T.deduits[k];
    return (
      // 🔴 LOT LG3 — fermée à l'ouverture : le nom et le sous-total ; un clic montre les mois
      <CategorieRepliable key={k} cle={k} donnees={{ 'data-categorie-fusion': k, 'aria-label': libelle }} classeTitre={nonCompte(k) ? 'loc-muet' : undefined}
        titre={<>{libelle}{mention(k, T)}</>}
        montant={<Montant htC={total.htC} ttcC={total.ttcC} versee={!nonCompte(k)} donnees={{ 'data-sous-total-fusion': k }} />}>
        {mois.length === 0 ? <p className="trx-fc-aucune" data-aucune={k}>Aucune</p> : <ul className="trx-fc-lignes">{mois.map(({ m, t }) => {
          const compte = !nonCompte(k) && t.deduits[k].htC === t.couts[k].htC;
          return <li key={`${m.annee}-${m.mois}`} className={compte ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-ligne-fusion={`${k}-${m.annee}-${m.mois}`}>
            <span className="trx-fc-quoi">{moisLib(m)}{mention(k, t)}</span><Montant htC={t.couts[k].htC} ttcC={t.couts[k].ttcC} versee={compte} /></li>;
        })}</ul>}
      </CategorieRepliable>
    );
  };
  const blocs = parMois.filter((x) => FAMILLES_COUTS.some((f) => x.t.couts[f.cle].htC !== 0)).reverse();
  const nbMois = blocs.length;
  return (
    <CoqueFenetre titre={`Coûts${hors(salaires)} par famille — ${lib}`} donnee="fenetre-couts-fusion" totalHtC={T.coutsTotal.htC} totalTtcC={T.coutsTotal.ttcC} sens="verse" motTotal="de coûts"
      dossiers={`${nbMois} mois concerné${nbMois > 1 ? 's' : ''}`} cleMode="trx-fusion-couts-mode" motTransaction="Par mois" onFermer={onFermer}
      pied={<><span>Total des coûts{hors(salaires)}</span><Montant htC={T.coutsTotal.htC} ttcC={T.coutsTotal.ttcC} versee donnees={{ 'data-fenetre-total': '' }} /></>}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          {avecL && <SectionPrimes lignes={lignesP.filter((l) => l.primeC.htC !== 0 || l.primeC.ttcC !== 0).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)} total={T.deduits.primes}
            lien={lien} moins={false} inclus={(l) => inclusMois(l.annee, l.mois)} />}
          {avecL && <SectionApporteurs lignes={lignesP} total={T.deduits.apporteurs} lien={lien} moins={false} />}
          {avecL && sectionMois('variable', 'Variable du négociateur (sans TVA)')}
          {avecL && sectionMois('salairesLocation', 'Salaires chargés — location (sans TVA)')}
          {avecG && sectionMois('adhoc', 'Coût ADHOC')}
          {avecG && sectionMois('monga', 'Coût MONGA')}
          {avecG && sectionMois('salaries', 'Salaires chargés — gestion (sans TVA)')}
        </> : nbMois === 0 ? <p className="trx-fc-aucune" data-aucun-mois>Aucun coût sur la période.</p> : blocs.map(({ m, t }) => (
          <section key={`${m.annee}-${m.mois}`} className="trx-fc-section" data-mois-fusion={`${m.annee}-${m.mois}`} aria-label={moisLib(m)}>
            <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>{moisLib(m)}</h3></span></div>
            <ul className="trx-fc-lignes">{FAMILLES_COUTS.filter((f) => (f.activite === 'location' ? avecL : avecG) && (t.couts[f.cle].htC !== 0 || t.couts[f.cle].ttcC !== 0)).map((f) => {
              const compte = !nonCompte(f.cle) && t.deduits[f.cle].htC === t.couts[f.cle].htC;
              return <li key={f.cle} className={compte ? 'trx-fc-ligne' : 'trx-fc-ligne trx-fc-info'} data-cout-mois={f.cle}>
                <span className="trx-fc-quoi"><span className={compte ? 'trx-fc-etiquette trx-rouge' : 'trx-fc-etiquette'} data-etiquette>{f.activite === 'location' ? 'Location' : 'Gestion'}</span>{f.libelle}{mention(f.cle, t)}</span>
                <Montant htC={t.couts[f.cle].htC} ttcC={t.couts[f.cle].ttcC} versee={compte} /></li>;
            })}</ul>
            <div className="trx-fc-sous-total trx-somme"><span>Coûts du mois</span><Montant htC={t.coutsTotal.htC} ttcC={t.coutsTotal.ttcC} versee donnees={{ 'data-couts-mois': `${m.annee}-${m.mois}` }} /></div>
          </section>
        ))}
        {reperes}
      </>} />
  );
}

/** La fenêtre « CA net » (tuile 4), dans l'ordre comptable : CA brut (location, gestion), − chaque famille de coûts, = CA net (dont location, dont gestion). */
function FenetreNetFusion({ lignes, gestion, ms, activite, salaires, lib, onFermer, reperes }: { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; ms: readonly MoisChoisi[];
  activite: ActiviteFusion; salaires: boolean; lib: string; onFermer: () => void;
  /** 🔴 LOT LG5 — ce qui a quitté la tuile (dont location · gestion, N−1), montré dans les deux modes. */
  reperes?: ReactNode }) {
  const tf = useTF(); // 🔴 LOT LO11 — les totaux avec les données de la Location (rétrocessions, salaires saisis)
  const T = tf(lignes, gestion, ms, activite, salaires);
  const U = useEnUnite();
  const avecL = activite !== 'gestion'; const avecG = activite !== 'location';
  const familles = FAMILLES_COUTS.filter((f) => (f.activite === 'location' ? avecL : avecG));
  const ligneM = (cle: string, mot: ReactNode, m: MontantC, sens: 'recu' | 'verse' | 'info', donnees?: Record<string, string>) => (
    <li key={cle} className={sens === 'info' ? 'trx-fc-ligne trx-fc-info' : 'trx-fc-ligne'} data-ligne-net-fusion={cle}><span className="trx-fc-quoi">{mot}</span>
      <Montant htC={m.htC} ttcC={m.ttcC} versee={sens === 'verse'} recu={sens === 'recu'} donnees={donnees} /></li>
  );
  const ligneFamille = (f: (typeof FAMILLES_COUTS)[number]) => {
    const salaire = f.cle === 'salaries' || f.cle === 'salairesLocation';
    const sansTva = salaire || f.cle === 'variable' ? ' (sans TVA)' : '';
    const ou = <small className="trx-fc-sous">{f.activite === 'location' ? 'location' : 'gestion'}</small>;
    if (salaire && !salaires) return ligneM(f.cle, <span className="loc-muet">{f.libelle}{sansTva} — non déduite {ou}</span>, T.couts[f.cle], 'info', { 'data-net-fusion-famille': f.cle });
    // 🔴 LOT LO11 — primes et variable des mois avec salaires : « inclus dans les salaires », non déduits
    if (T.deduits[f.cle].htC === 0 && T.couts[f.cle].htC !== 0) return ligneM(f.cle, <span className="loc-muet">{f.libelle}{sansTva} — inclus dans les salaires, non déduit {ou}</span>, T.couts[f.cle], 'info', { 'data-net-fusion-famille': f.cle });
    const partiel = T.deduits[f.cle].htC !== T.couts[f.cle].htC
      ? <small className="trx-fc-sous" data-inclus-salaires> (dont {eur(U.en(moinsC(T.couts[f.cle], T.deduits[f.cle])))} inclus dans les salaires, non déduit)</small> : null;
    return ligneM(f.cle, <>− {f.libelle}{sansTva}{partiel} {ou}</>, T.deduits[f.cle], 'verse', { 'data-net-fusion-famille': f.cle });
  };
  const total = <><span>= CA net{hors(salaires)}</span><Montant htC={T.net.htC} ttcC={T.net.ttcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const blocs = ms.map((m) => ({ m, t: tf(lignes, gestion, [m], activite, salaires) })).filter((x) => x.t.ca.htC !== 0 || x.t.coutsTotal.htC !== 0).reverse();
  return (
    <CoqueFenetre titre={`CA net${hors(salaires)} — ${lib}`} donnee="fenetre-net-fusion" totalHtC={T.net.htC} totalTtcC={T.net.ttcC} sens="recu"
      dossiers={`${blocs.length} mois`} cleMode="trx-fusion-net-mode" motTransaction="Par mois" onFermer={onFermer} pied={total}
      corps={(mode) => <>{mode === 'categorie' ? <>
        <CategorieRepliable cle="ca" donnees={{ 'data-net-fusion': 'ca', 'aria-label': 'CA brut' }} titre="CA brut"
          montant={<Montant htC={T.ca.htC} ttcC={T.ca.ttcC} versee={false} recu donnees={{ 'data-net-fusion-ca': '' }} />}>
          <ul className="trx-fc-lignes">
            {avecL && ligneM('location-ca', <>Location <small className="trx-fc-sous">dont propriétaire {eur(U.en(T.tLocation.proprietaire))} · locataire {eur(U.en(T.tLocation.locataire))}</small></>, T.location.ca, 'recu', { 'data-net-fusion-location-ca': '' })}
            {avecG && ligneM('gestion-ca', 'Gestion (honoraires)', T.gestion.ca, 'recu', { 'data-net-fusion-gestion-ca': '' })}
          </ul>
        </CategorieRepliable>
        <CategorieRepliable cle="couts" donnees={{ 'data-net-fusion': 'couts', 'aria-label': 'Coûts' }} titre={<>− Coûts{hors(salaires)}</>}
          montant={<Montant htC={T.coutsTotal.htC} ttcC={T.coutsTotal.ttcC} versee donnees={{ 'data-net-fusion-couts': '' }} />}>
          <ul className="trx-fc-lignes">{familles.map(ligneFamille)}</ul>
        </CategorieRepliable>
        <div className="trx-fc-total-ca trx-somme--finale" data-total-net-fusion>{total}</div>
        {activite === 'deux' && <ul className="trx-fc-lignes trx-fusion-dont">
          {ligneM('location-net', '= dont CA net location', T.location.net, 'recu', { 'data-net-fusion-location-net': '' })}
          {ligneM('gestion-net', `= dont CA net gestion (reste${hors(salaires)})`, T.gestion.net, 'recu', { 'data-net-fusion-gestion-net': '' })}
        </ul>}
      </> : blocs.length === 0 ? <p className="trx-fc-aucune">Aucune activité sur la période.</p> : blocs.map(({ m, t }) => (
        <section key={`${m.annee}-${m.mois}`} className="trx-fc-section" data-mois-net-fusion={`${m.annee}-${m.mois}`} aria-label={moisLib(m)}>
          <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>{moisLib(m)}</h3></span></div>
          <ul className="trx-fc-lignes">
            {avecL && ligneM('l', 'CA brut location', t.location.ca, 'recu')}
            {avecG && ligneM('g', 'CA brut gestion', t.gestion.ca, 'recu')}
            {avecL && ligneM('lc', <>− Coûts location{t.inclus.mois > 0 && <small className="trx-fc-sous" data-inclus-salaires> (primes et variable inclus dans les salaires)</small>}</>, t.location.coutsTotal, 'verse')}
            {avecG && ligneM('gc', '− Coûts gestion', t.gestion.coutsTotal, 'verse')}
          </ul>
          <div className="trx-fc-sous-total trx-somme"><span>= CA net du mois</span><Montant htC={t.net.htC} ttcC={t.net.ttcC} versee={false} recu donnees={{ 'data-net-mois': `${m.annee}-${m.mois}` }} /></div>
        </section>
      ))}{reperes}</>} />
  );
}

/**
 * ══ 🔴 LOT LG5 (Arno) — la fenêtre « CA brut » (tuile 1), la même que celle de la page Location (lot LO13 : la coque, les catégories, les repères) :
 * Par catégorie — CA brut location (propriétaire, locataire), CA brut gestion (un mois par ligne), = CA brut ; Par mois — un bloc par mois. Dessous,
 * dans les deux modes, `reperes` : ce qui a quitté la tuile. Aucun calcul : les totaux de la fusion (`totauxFusion`).
 */
function FenetreCaFusion({ lignes, gestion, ms, activite, salaires, lib, onFermer, reperes }: { lignes: readonly LigneLocationCa[]; gestion: readonly GestionMois[]; ms: readonly MoisChoisi[];
  activite: ActiviteFusion; salaires: boolean; lib: string; onFermer: () => void; reperes?: ReactNode }) {
  const tf = useTF();
  const T = tf(lignes, gestion, ms, activite, salaires);
  const avecL = activite !== 'gestion'; const avecG = activite !== 'location';
  const parMois = ms.map((m) => ({ m, t: tf(lignes, gestion, [m], activite, salaires) }));
  const ligneM = (cle: string, mot: ReactNode, m: MontantC, donnees?: Record<string, string>) => (
    <li key={cle} className="trx-fc-ligne" data-ligne-ca-fusion={cle}><span className="trx-fc-quoi">{mot}</span><Montant htC={m.htC} ttcC={m.ttcC} versee={false} recu donnees={donnees} /></li>
  );
  const total = <><span>= CA brut</span><Montant htC={T.ca.htC} ttcC={T.ca.ttcC} versee={false} recu donnees={{ 'data-fenetre-total': '' }} /></>;
  const blocs = parMois.filter((x) => x.t.ca.htC !== 0 || x.t.ca.ttcC !== 0).reverse();
  const moisG = parMois.filter((x) => x.t.gestion.ca.htC !== 0 || x.t.gestion.ca.ttcC !== 0);
  return (
    <CoqueFenetre titre={`CA brut — ${lib}`} donnee="fenetre-ca-fusion" totalHtC={T.ca.htC} totalTtcC={T.ca.ttcC} sens="recu"
      dossiers={`${blocs.length} mois`} cleMode="trx-fusion-ca-mode" motTransaction="Par mois" onFermer={onFermer} pied={total}
      corps={(mode) => <>
        <style>{CSS_FENETRES_LOCATION}</style>
        {mode === 'categorie' ? <>
          {avecL && <CategorieRepliable cle="location" donnees={{ 'data-categorie-ca-fusion': 'location', 'aria-label': 'CA brut location' }} titre="CA brut location"
            montant={<Montant htC={T.location.ca.htC} ttcC={T.location.ca.ttcC} versee={false} recu donnees={{ 'data-sous-total-ca-fusion': 'location' }} />}>
            <ul className="trx-fc-lignes">
              {ligneM('proprietaire', 'Honoraires propriétaire', T.tLocation.proprietaire)}
              {ligneM('locataire', 'Honoraires locataire', T.tLocation.locataire)}
            </ul>
          </CategorieRepliable>}
          {avecG && <CategorieRepliable cle="gestion" donnees={{ 'data-categorie-ca-fusion': 'gestion', 'aria-label': 'CA brut gestion' }} titre="CA brut gestion"
            montant={<Montant htC={T.gestion.ca.htC} ttcC={T.gestion.ca.ttcC} versee={false} recu donnees={{ 'data-sous-total-ca-fusion': 'gestion' }} />}>
            {moisG.length === 0 ? <p className="trx-fc-aucune" data-aucune="gestion">Aucun mois saisi</p>
              : <ul className="trx-fc-lignes">{moisG.map(({ m, t }) => ligneM(`gestion-${m.annee}-${m.mois}`, moisLib(m), t.gestion.ca))}</ul>}
          </CategorieRepliable>}
          <div className="trx-fc-total-ca trx-somme--finale" data-total-ca-fusion>{total}</div>
        </> : blocs.length === 0 ? <p className="trx-fc-aucune">Aucune activité sur la période.</p> : blocs.map(({ m, t }) => (
          <section key={`${m.annee}-${m.mois}`} className="trx-fc-section" data-mois-ca-fusion={`${m.annee}-${m.mois}`} aria-label={moisLib(m)}>
            <div className="trx-fc-tete trx-fc-tete--affaire"><span className="trx-fc-titre-affaire"><h3>{moisLib(m)}</h3></span></div>
            <ul className="trx-fc-lignes">
              {avecL && ligneM('l', 'CA brut location', t.location.ca)}
              {avecG && ligneM('g', 'CA brut gestion', t.gestion.ca)}
            </ul>
            <div className="trx-fc-sous-total trx-somme"><span>= CA brut du mois</span><Montant htC={t.ca.htC} ttcC={t.ca.ttcC} versee={false} recu donnees={{ 'data-ca-mois': `${m.annee}-${m.mois}` }} /></div>
          </section>
        ))}
        {reperes}
      </>} />
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_FUSION = `
.trx-note-fusion{margin:-4px 0 4px;font-size:.88rem}
.trx-fusion-defile{overflow-x:auto;overscroll-behavior-x:contain}
.trx-resultat .trx-fusion-groupe{font-weight:800;color:var(--color-svv-ink);padding-top:8px;border-bottom:0}
.trx-resultat .trx-fusion-final{border-top:2px solid var(--color-svv-line-strong);padding-top:8px}
.trx-fusion-dont{margin-top:4px}
[data-table-fusion] thead th{text-align:right}
[data-table-fusion] thead tr:first-child th:first-child{text-align:left}
.trx-fusion-pastille{vertical-align:-1px}
/* 🔴 LOT LG2 — « Avec salaires | Sans salaires » dans la tuile Coûts : le style de HT | TTC, en plus petit */
[data-tuile="fusion-couts"]{cursor:pointer}
[data-tuile="fusion-couts"]:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
`;
