'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import { NOMS_MOIS, variation } from '../../../../lib/transaction/modele';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { borneCumul, ecrireAnnees, moisADate, moisDesAnnees, moisSoulignes, anneesSoulignees, type DecoupageAnnees } from '../../../../lib/transaction/periodeAnnees';
import { libellePeriode, libellePeriodeComplet, MOT_A_SAISIR, motSalairesASaisir, nbMoisSalairesASaisir, unAnPlusTot, type MoisChoisi } from '../../../../lib/transaction/periodeMois';
import { correspond, CLE_TRI_LISTE, estTriListe, LIBELLE_TRI_LISTE, SEUIL_RECHERCHE, TRI_LISTE_DEFAUT, TRIS_LISTE, type TriListe } from '../../../../lib/transaction/listeCartes';
import {
  anneesLocation, apporteursLocation, COMPTER_LOCATION, estCompterLocation, ficheRechercheLocation, filtrerLocation, LIBELLE_COMPTER_LOCATION,
  coutsLocation, espaceLocationRegle, lignesDesAnnees, moinsC as moinsM, lignesDesMois, negociateursLocation, salairesLocationDuMois, titreBail, totauxLocation, trierLocation, variableNegociateur, type CompterLocation, type CoutsLocation,
  type LigneEspaceRegle, type LigneLocationCa, type RetroLocation, type SalairesLocation, type TotauxLocationCa,
} from '../../../../lib/transaction/locationCa';
import { CourbeCumul, EnteteGraphe, Histogramme, PAS_ANNEE_FIXE, type InfoBarre } from '../location/TableauBordSuivi';
import { BlocReplie } from '../location/BlocReplie';
import { ListeRepliable, useListeRepliee } from '../location/ListeRepliable';
import { ListeChoix } from '../location/ListeChoix';
import { AideVariableMobile, BoutonAffichage, ONGLET_ANNEES, ONGLET_MOIS, classeSens, COURT, ecrireAdresse, ecrireAdresseListe, ESPACE, eur, EnteteVariableNegociateur, FournisseurAffichage, Montants, MOT_UNITE, parametre, parametres, posterTransaction, signePct, useAffichage, useAffichageRetenu, useTransaction } from './commun';
import { Journal } from './FormulaireVente';
import { CSS, attributMoisRouges, StyleMoisRouges, anneesRouges, moisRougesDeLAnnee, attributAnneesRouges, StyleAnneesRouges, libelleAnnees, LigneDesAnnees, LigneDesMois, Mt, useLigneDesAnnees, useLigneDesMois, type ChoixAnnees } from './EcransTransaction';
import { FiltreNegociateurs } from './FiltreNegociateurs';
import { GrapheNegociateurs, MAX_NEGOCIATEURS } from './GrapheNegociateurs';
import { FenetreCaLocation, FenetreCoutsLocation, FenetreNetLocation, Reperes } from './FenetresLocation';
import { Montant } from './FenetreCommissions';
import { useColonnesNegociateurs } from './OngletCompromis';
import { ChoixSalairesTuile, CLASSE_TUILES_CHOIX, horsSelecteur, useChoixSalaires } from './ChoixSalaires';

/**
 * ══ 🔴 LOT LO1 (Arno, 01/11/2026) — « SUIVI CHIFFRE D'AFFAIRES › LOCATION » : L'ACTIVITÉ ÉCONOMIQUE DE LA LOCATION ═══════════════════════════════════
 * Les mêmes mécaniques et les mêmes composants que la Transaction vente : « Le mois » (Mois | Période | Année) et « L'année » (Année | Période | Tout),
 * les tuiles alignées, le graphique Mensuel / Cumul avec N−1 hachuré et son encadré, « HT | TTC » partagé, le filtre Négociateur (jusqu'à 5 : une
 * série chacun), le tri et la recherche des cartes, l'Espace par négociateur trié. LECTURE SEULE : les lignes du Suivi du mois de la Location
 * (`locationCa`), aucun geste d'écriture ici — la carte d'un bail ouvre la ligne dans la Location.
 * Quatre tuiles : CA brut (honoraires propriétaire + locataire), Baux signés, Primes et rétrocessions versées (primes de nouvelle gestion + commissions
 * des apporteurs), CA net (CA brut − primes − rétrocessions) — la tuile 4 = la tuile 1 − la tuile 3, au centime, en HT et en TTC.
 */
interface DonneesLocationCa { disponible: boolean; aujourdhui: string; lignes: LigneLocationCa[];
  /** 🔴 LOT LO11 — les rétrocessions des négociateurs (le variable du mois) et les salaires chargés saisis (447 ; null sans elle). */
  retrocessions?: RetroLocation[]; salaires?: SalairesLocation[] | null }

/**
 * ══ 🔴 LOT LO11 (règle d'Arno) — LES COÛTS DE LA LOCATION, MOIS PAR MOIS, PARTOUT SUR LA PAGE ═════════════════════════════════════════════════
 * Le contexte des coûts : les rétrocessions (le variable) et les salaires chargés saisis. Un filtre (« Compter » ≠ Tous, un négociateur choisi) : les
 * salaires, qui ne se rattachent à aucun bail, ne sont pas comptés (règle « sans salaires ») ; les rétrocessions suivent le négociateur.
 */
interface CtxCouts { retros: readonly RetroLocation[]; salaires: readonly SalairesLocation[] | null; filtre: boolean;
  /** La saisie des salaires d'un mois (la 447 appliquée) ; null : non disponible. */
  onSaisir: ((m: MoisChoisi) => void) | null;
  /** 🔴 LOT LO12 — « Avec salaires » (true) | « Sans salaires » (false) : le choix partagé avec la Gestion et la FUSION. */
  avecSalaires: boolean; onSalaires: (avec: boolean) => void }
const ContexteCouts = createContext<CtxCouts>({ retros: [], salaires: null, filtre: false, onSaisir: null, avecSalaires: true, onSalaires: () => undefined });
/** 🔴 LOT LO12 — « hors salaires » après un mot (titres, graphique, fenêtres) en mode « Sans salaires ». */
const hors = (avec: boolean): string => (avec ? '' : ' hors salaires');
/** Les totaux d'un ensemble de mois à la règle : ceux de la page (CA, primes, apporteurs…) et, à la règle, les coûts et le CA net ; `c` : le détail. */
type TotauxRegle = TotauxLocationCa & { c: CoutsLocation };
function useTotaux(): (ls: readonly LigneLocationCa[], ms: readonly MoisChoisi[]) => TotauxRegle {
  const x = useContext(ContexteCouts);
  return (ls, ms) => { const t = totauxLocation(lignesDesMois(ls, ms)); const c = coutsLocation(ls, ms, x.retros, x.salaires, x.avecSalaires); return { ...t, couts: c.couts, net: c.net, c }; };
}

const EXPLICATION = { ca: 'honoraires de location encaissés', couts: 'apporteurs, primes et variable — ou salaires chargés', net: 'CA brut − coûts',
  coutsSans: 'apporteurs, primes et variable — salaires chargés non comptés', netSans: 'CA brut − coûts hors salaires' } as const;
const SANS_SUIVI = 'Le Suivi de la Location n’est pas disponible sur cette base (migration 406) : aucune ligne à lire.';
type Mesure = 'ca' | 'net' | 'nombre';
const MESURES: readonly { cle: Mesure; mot: string }[] = [{ cle: 'ca', mot: 'CA' }, { cle: 'net', mot: 'CA net' }, { cle: 'nombre', mot: 'Nombre de baux' }];
/** Le lien vers le Suivi du mois de la Location (la ligne y est, dans son mois). */
export const lienSuiviDuMois = (l: Pick<LigneLocationCa, 'annee' | 'mois'> & { id?: number }): string =>
  `/admin/location/outils/mois?annee=${l.annee}&mois=${l.mois}${l.id === undefined ? '' : `&ligne=${l.id}`}`; // 🔴 LOT LO10 — &ligne : la liste et le bail dépliés

/** Le compte choisi : l'adresse (&compter=…), sinon « Tous ». */
const compterInitial = (): CompterLocation => { const x = parametre('compter'); return estCompterLocation(x) ? x : 'tous'; };

export function EcranLocationCA() {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesLocationCa>('vue=location');
  const [saisie, setSaisie] = useState<MoisChoisi | null>(null);
  const [vue, setVue] = useState<'mois' | 'annee'>(() => (parametre('vue') === 'annee' ? 'annee' : 'mois'));
  const { annee, setAnnee, mois, setMois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte, setPeriode, setAnneeEntiere } = useLigneDesMois(jour); // 🔴 LOT LO7 — sans vue du mois dans l'adresse : « Année »
  const [compter, setCompter] = useState<CompterLocation>(compterInitial);
  const [negociateurs, setNegociateurs] = useState<string[]>(() => parametres('negociateur'));
  const toutes = lu.etat === 'ok' ? lu.data.lignes : [];
  const comptees = filtrerLocation(toutes, compter, null);
  const anneesDispo = lu.etat === 'ok' ? anneesLocation(lu.data.lignes, jour) : null;
  const { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles } = useLigneDesAnnees(jour, anneesDispo,
    vue === 'annee', (a) => comptees.some((l) => l.annee === a));
  const [unite, setUnite] = useAffichageRetenu();
  const [avecSalaires, setAvecSalaires] = useChoixSalaires(); // 🔴 LOT LO12 — le choix partagé (Location, Gestion, FUSION)
  useEffect(() => { ecrireAdresse({ salaires: avecSalaires ? 'avec' : 'sans' }); }, [avecSalaires]);
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
  // 🔴 LOT LO11 — le contexte des coûts (voir `CtxCouts`)
  const filtre = compter !== 'tous' || choisis.length > 0;
  const ctxCouts: CtxCouts = { filtre, salaires: filtre ? null : d.salaires ?? null,
    retros: compter !== 'tous' ? [] : (d.retrocessions ?? []).filter((r) => choisis.length === 0 || choisis.some((c) => c.cle === r.negociateurCle)),
    onSaisir: d.salaires === undefined || d.salaires === null ? null : setSaisie, avecSalaires, onSalaires: setAvecSalaires };
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
        <div className="trx-vues" role="tablist" aria-label={`${ONGLET_MOIS} ou ${ONGLET_ANNEES}`}>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'mois'} onClick={() => setVue('mois')} data-vue="mois">{ONGLET_MOIS}</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'annee'} onClick={() => setVue('annee')} data-vue="annee">{ONGLET_ANNEES}</button>
        </div>
      </div>
      <FournisseurAffichage value={unite}><ContexteCouts.Provider value={ctxCouts}>
      {filtre && <p className="loc-muet" role="note" data-filtre-salaires>Filtre actif : les salaires chargés (qui ne se rattachent à aucun bail) ne sont pas comptés ; primes et variable sont déduits.</p>}
      {vue === 'mois' ? <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
          {champsCommuns}
        </form>
        <LigneDesMois annee={annee} mois={mois} jour={jour} decoupage={decoupage} moisChoisis={decoupage === 'mois' ? null : (periodeVue ?? []).filter((m) => m.annee === annee).map((m) => m.mois)}
          onMois={choisirMois} onDecoupage={choisirDecoupage} />
        {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
        <VueLocation lignes={filtrees} toutes={d.lignes} jour={jour} ms={periodeVue ?? [{ annee, mois }]} annee={annee}
          lib={decoupage === 'mois' ? NOMS_MOIS[mois - 1].toLowerCase() : decoupage === 'annee' ? String(annee) : libellePeriode(periodeVue ?? [])}
          libComplet={decoupage === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : decoupage === 'annee' ? `l’année ${annee}` : libellePeriode(periodeVue ?? [])}
          infobulle={decoupage === 'periode' ? libellePeriodeComplet(periodeVue ?? []) : undefined}
          borne={borneCumul(decoupage, annee, mois, decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null, jour)} toutesAnnees={null} historique={null} series={series}
          graphe={{ sorte: 'mois', mois: decoupage === 'mois' ? mois : 0, moisChoisis: decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null,
            rouges: decoupage === 'mois' ? null : moisSoulignes(decoupage, annee, mois, (periodeVue ?? []).filter((m) => m.annee === annee).map((m) => m.mois), jour), moisSeul: decoupage === 'mois', onMois: choisirMois }} />
      </> : choixA !== null && anneesVisibles !== null && <>
        <form className="tdb-filtres" aria-label="Filtres" onSubmit={(x) => x.preventDefault()}>{champsCommuns}</form>
        <LigneDesAnnees annees={anneesVisibles} decoupage={choixA.decoupage} annee={choixA.annee} choisies={choixA.decoupage === 'tout' ? anneesVisibles : choixA.annees}
          onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
        {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
        <VueAnneeLocation lignes={filtrees} toutes={d.lignes} jour={jour} choix={choixA} anneesVisibles={anneesVisibles} series={series} onAnnee={choisirAnnee}
          onAnneeSeule={(a) => { setRefusAnnees(false); setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); }}
          onOuvrirMois={(a, m) => { setAnneeEntiere(false); setPeriode(null); setAnnee(a); setMois(m); setVue('mois'); }} />
      </>}
      </ContexteCouts.Provider></FournisseurAffichage>
      {saisie !== null && <SaisieSalairesLocation annee={saisie.annee} mois={saisie.mois} actuelle={(d.salaires ?? []).find((x) => x.annee === saisie.annee && x.mois === saisie.mois) ?? null}
        onFermer={() => setSaisie(null)} onFait={() => { setSaisie(null); relire(); }} onRelire={relire} />}
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
      : { sorte: 'mois', mois: 0, moisChoisis: null,
        // Arno (01/11/2026) — « Mois par mois — AAAA » : AAAA soulignée → ses mois écoulés en rouge ; sinon, aucun
        rouges: moisRougesDeLAnnee(choix.annee, anneesSoulignees(choix.decoupage, choix.annee, sel, anneesVisibles), jour), moisSeul: false, onMois: (m) => onOuvrirMois(choix.annee, m), entete: choixEchelle }} />;
}

type Graphe = { sorte: 'mois'; mois: number; moisChoisis: readonly number[] | null; rouges: readonly number[] | null; moisSeul: boolean; onMois: (m: number) => void; entete?: ReactNode }
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
function VueLocation({ lignes, toutes, jour, ms, annee, lib, libComplet, infobulle, borne, toutesAnnees, series, historique, graphe }: {
  lignes: readonly LigneLocationCa[]; toutes: readonly LigneLocationCa[]; jour: string; ms: readonly MoisChoisi[]; annee: number;
  /** Le nom de la période dans les titres (« octobre », « 2026 », « juil. → sept. 2026 », « 2 mois de 2026 ») ; `libComplet` : celui des blocs. */
  lib: string; libComplet: string;
  /** 🔴 LOT LO12 — la liste complète des mois d'une période (title / aria-label des titres qui l'abrègent). */
  infobulle?: string;
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
  const tot = useTotaux();
  const T = tot(lignes, ms);
  const ctxC = useContext(ContexteCouts);
  // 🔴 LOT LO11 — les coûts des fenêtres : la tuile et chaque mois de la période (sa règle)
  const coutsF = { total: T.c, mois: ms.map((m) => ({ m, c: coutsLocation(lignes, [m], ctxC.retros, ctxC.salaires, ctxC.avecSalaires) })), sans: !ctxC.avecSalaires };
  const avec = ctxC.avecSalaires;
  const espace = espaceLocationRegle(lignes, ms, ctxC.retros, ctxC.salaires, avec);
  // 🔴 LOT LO15 — les mois commencés de la période sans salaires chargés saisis : « N mois de salaires à saisir » (fenêtres, Résultat, encadré)
  const aSaisir = useASaisir(jour)(ms);
  const repereASaisir = aSaisir === 0 ? [] : [{ cle: 'a-saisir', mot: 'Salaires chargés', valeur: <span className="trx-fl-texte loc-muet trx-a-saisir" data-salaires-a-saisir-nb>{motSalairesASaisir(aSaisir)}</span> }];
  const ms1 = unAnPlusTot(ms);
  const T1 = tot(lignes, ms1);
  const anneesN1 = [...new Set(ms1.map((m) => m.annee))];
  // sans année précédente : aucune ligne du Suivi (tous filtres confondus) sur ces années
  const sansN1 = !toutes.some((l) => anneesN1.includes(l.annee));
  const enN1 = anneesN1.length === 1 ? `en ${anneesN1[0]}` : 'un an plus tôt';
  const motSansN1 = `${anneesN1.join(', ')} : aucune location au Suivi`;
  const n1 = (c: MontantC, c1: MontantC): string => (toutesAnnees !== null ? toutesAnnees : sansN1 ? motSansN1 : `${eur(U.en(c1))} ${enN1} (${signePct(variation(c.htC, c1.htC))})`);
  const cumul = borne === null ? null : tot(lignes, Array.from({ length: borne.fin }, (_, i) => ({ annee, mois: i + 1 })));
  const motCumul = borne === null ? '' : `cumul ${annee} ${borne.mot.startsWith('à fin') ? borne.mot : `(${borne.mot})`}`;
  const explication = (t: string) => <small className="trx-tuile-explication" data-tuile-explication-location>{t}</small>;
  const autre = (m: MontantC) => <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({U.autre(m)})</small>;
  // 🔴 LOT LO6 — les tuiles 3 et 4 ouvrent leur fenêtre (les lignes de la période, filtres de la page compris) ; le nom d'un bail y ferme la
  // fenêtre et déplie sa carte dans « Les baux ».
  const [fenetre, setFenetre] = useState<'ca' | 'couts' | 'net' | null>(null);
  const tuileCa = useRef<HTMLButtonElement | null>(null);
  // 🔴 LOT LO13 — ce qui a quitté les tuiles 1 et 2 (montré dans la fenêtre « CA brut »)
  const mandats = T.nbGestionSeule > 0 || T.nbAvenants > 0
    ? [T.nbGestionSeule > 0 ? `${T.nbGestionSeule} mandat${T.nbGestionSeule > 1 ? 's' : ''} de gestion seul${T.nbGestionSeule > 1 ? 's' : ''}` : '', T.nbAvenants > 0 ? `${T.nbAvenants} avenant${T.nbAvenants > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : '';
  const nbN1 = toutesAnnees !== null ? toutesAnnees : sansN1 ? motSansN1 : `${T1.nb} ${enN1}`;
  const parAnnee = new Set(ms.map((m) => m.annee)).size > 1;
  const detailCa = parAnnee ? [...new Set(ms.map((m) => m.annee))].map((a) => ({ cle: String(a), mot: String(a), ca: totauxLocation(lignesDesMois(lignes, ms.filter((m) => m.annee === a))).ca }))
    : ms.map((m) => ({ cle: `${m.annee}-${m.mois}`, mot: `${NOMS_MOIS[m.mois - 1]} ${m.annee}`, ca: totauxLocation(lignesDesMois(lignes, [m])).ca }));
  const tuileCouts = useRef<HTMLDivElement | null>(null);
  // 🔴 LOT LO12 — la tuile « Coûts » s'ouvre au clic, à Entrée ou Espace ; son sélecteur « Avec | Sans salaires » n'ouvre rien
  const ouvrirCouts = (e: { target: EventTarget }): void => { if (horsSelecteur(e)) setFenetre('couts'); };
  const tuileNet = useRef<HTMLButtonElement | null>(null);
  const titreFenetre = libComplet.replace(/^l’année /, '');
  const allerA = (id: number): void => {
    setFenetre(null);
    setTimeout(() => {
      // 🔴 LOT LO10 — la liste repliée se déplie d'abord, puis la carte du bail
      const liste = document.querySelector<HTMLButtonElement>('[data-deplier-liste="baux-location"]');
      if (liste !== null && liste.getAttribute('aria-expanded') !== 'true') liste.click();
      // la carte apparaît au rendu de la liste dépliée : on l'attend (au plus 20 × 25 ms)
      const deplierCarte = (essai: number): void => {
        const b = document.querySelector<HTMLButtonElement>(`[data-deplier="bail-${id}"]`);
        if (b === null) { if (essai < 20) setTimeout(() => deplierCarte(essai + 1), 25); return; }
        if (b.getAttribute('aria-expanded') !== 'true') b.click();
        document.querySelector(`[data-carte-bail="${id}"]`)?.scrollIntoView?.({ block: 'start' });
      };
      setTimeout(() => deplierCarte(0), 0);
    }, 0);
  };
  return <>
    <ul className={`tdb-tuiles trx-tuiles-alignees ${CLASSE_TUILES_CHOIX}`} aria-label={`L’essentiel — ${infobulle ?? libComplet}`} title={infobulle} data-ecran-location-tuiles>
      {/* 🔴 LOT LO13 (Arno) — tuiles épurées : titre, explication, montant, montant entre parenthèses ; le reste passe dans la fenêtre de la tuile */}
      <li><button type="button" className="tdb-tuile" data-tuile="location-ca" aria-haspopup="dialog" aria-expanded={fenetre === 'ca'} ref={tuileCa} onClick={() => setFenetre('ca')}>
        <span className="tdb-tuile-mot">CA brut — {lib}{explication(EXPLICATION.ca)}</span>
        <strong className="tdb-tuile-valeur" data-location-ca>{eur(U.en(T.ca))}</strong>{autre(T.ca)}
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-location="ca">Voir le détail</span></button></li>
      <li><div className="tdb-tuile" data-tuile="location-baux">
        <span className="tdb-tuile-mot">Baux signés — {lib}</span>
        <strong className="tdb-tuile-valeur" data-location-nb>{T.nb}</strong>
        <small className="trx-montant-autre trx-tuile-autre" aria-hidden="true">{' '}</small>
        <span className="tdb-tuile-n1" data-tuile-n1="location-baux">{nbN1}</span></div></li>
      <li><div role="button" tabIndex={0} className="tdb-tuile" data-tuile="location-couts" aria-haspopup="dialog" aria-expanded={fenetre === 'couts'} ref={tuileCouts}
        onClick={ouvrirCouts} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirCouts(e); } }}>
        <span className="tdb-tuile-mot">Coûts{hors(avec)} — {lib}{explication(avec ? EXPLICATION.couts : EXPLICATION.coutsSans)}</span>
        <strong className={`tdb-tuile-valeur ${classeSens('verse', T.couts.htC, T.couts.ttcC)}`} data-location-couts>{eur(U.en(T.couts))}</strong>{autre(T.couts)}
        {/* 🔴 LOT LG6 — le sélecteur sous le montant converti, dans sa rangée propre (les montants restent alignés) */}
        <ChoixSalairesTuile salaires={avec} onChange={ctxC.onSalaires} />
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-location="couts">Voir le détail</span></div></li>
      <li><button type="button" className="tdb-tuile" data-tuile="location-net" aria-haspopup="dialog" aria-expanded={fenetre === 'net'} ref={tuileNet} onClick={() => setFenetre('net')}>
        <span className="tdb-tuile-mot">CA net{hors(avec)} — {lib}{explication(avec ? EXPLICATION.net : EXPLICATION.netSans)}</span>
        <strong className="tdb-tuile-valeur trx-vert" data-location-net>{eur(U.en(T.net))}</strong>{autre(T.net)}
        <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-location="net">Voir le détail</span></button></li>
    </ul>
    {fenetre === 'ca' && <FenetreCaLocation lignes={periode} lib={titreFenetre} onAller={allerA} onFermer={() => { setFenetre(null); tuileCa.current?.focus(); }} reperes={<>
      {/* 🔴 LOT LO13 — ce qui a quitté les tuiles 1 et 2 : les baux (dont mandats seuls, avenants ; N−1), le cumul, la même période un an plus tôt */}
      <Reperes titre="Baux" donnee="baux" lignes={[
        { cle: 'nb', mot: 'Baux signés', valeur: <strong className="trx-fl-texte" data-repere-nb>{T.nb}</strong> },
        ...(mandats === '' ? [] : [{ cle: 'mandats', mot: 'Dont', valeur: <span className="trx-fl-texte" data-location-mandats>{mandats}</span> }]),
        { cle: 'nb-n1', mot: 'Un an plus tôt', valeur: <span className="trx-fl-texte" data-repere-nb-n1>{nbN1}</span> },
      ]} />
      <Reperes donnee="ca" lignes={[
        { cle: 'parts', mot: 'Propriétaire · locataire', valeur: <span className="trx-fl-texte" data-location-parts>dont propriétaire {eur(U.en(T.proprietaire))} · locataire {eur(U.en(T.locataire))}</span> },
        ...(cumul === null ? [] : [{ cle: 'cumul', mot: <span data-location-cumul-mot>{motCumul.charAt(0).toUpperCase() + motCumul.slice(1)}</span>,
          valeur: <Montant htC={cumul.ca.htC} ttcC={cumul.ca.ttcC} versee={false} recu donnees={{ 'data-location-cumul': '' }} /> }]),
        { cle: 'n1', mot: toutesAnnees !== null || sansN1 ? 'Un an plus tôt' : `Même période ${enN1}`, valeur: toutesAnnees !== null || sansN1
          ? <span className="trx-fl-texte" data-repere-n1="ca">{n1(T.ca, T1.ca)}</span>
          : <Montant htC={T1.ca.htC} ttcC={T1.ca.ttcC} versee={false} recu donnees={{ 'data-repere-n1': 'ca' }} apres={<small data-repere-ecart="ca"> {signePct(variation(T.ca.htC, T1.ca.htC))}</small>} /> },
      ]} />
      {detailCa.length > 1 && <Reperes titre={parAnnee ? 'CA brut année par année' : 'CA brut mois par mois'} donnee="ca-mois" lignes={detailCa.map((x) => ({ cle: x.cle, mot: x.mot,
        valeur: <Montant htC={x.ca.htC} ttcC={x.ca.ttcC} versee={false} recu donnees={{ 'data-repere-ca-mois': x.cle }} /> }))} />}
    </>} />}
    {fenetre === 'couts' && <FenetreCoutsLocation lignes={periode} couts={coutsF} lib={titreFenetre} onAller={allerA} onFermer={() => { setFenetre(null); tuileCouts.current?.focus(); }}
      reperes={<Reperes donnee="couts" lignes={[
        // 🔴 LOT LO13 — ce qui a quitté la tuile « Coûts » : les familles (ce qui est déduit ; « inclus » ; salaires non comptés) et N−1
        { cle: 'familles', mot: 'Familles', valeur: <span className="trx-fl-texte" data-location-couts-detail>apporteurs {eur(U.en(T.apporteurs))} · variable, primes incluses {eur(U.en(variableNegociateur(T.c.variableDeduit, T.c.primesDeduites)))}{T.c.primesDeduites.htC !== 0 && <span data-variable-dont-primes> (dont primes {eur(U.en(T.c.primesDeduites))})</span>} · {avec ? <>salaires {eur(U.en(T.c.salaires))}</> : <span className="loc-muet" data-location-salaires-non-comptes>salaires (non comptés) {eur(U.en(T.c.salairesSaisis))}</span>}
          {T.c.moisAvecSalaires > 0 && <span className="trx-ligne-bloc loc-muet" data-location-inclus>primes {eur(U.en(moinsM(T.c.primes, T.c.primesDeduites)))} et variable {eur(U.en(moinsM(variableNegociateur(T.c.variable, T.c.primes), variableNegociateur(T.c.variableDeduit, T.c.primesDeduites))))} inclus dans les salaires</span>}</span> },
        ...repereASaisir,
        { cle: 'n1', mot: 'Un an plus tôt', valeur: <span className="trx-fl-texte" data-tuile-n1="location-couts">{n1(T.couts, T1.couts)}</span> },
      ]} />} />}
    {fenetre === 'net' && <FenetreNetLocation lignes={periode} couts={coutsF} lib={titreFenetre} onAller={allerA} onFermer={() => { setFenetre(null); tuileNet.current?.focus(); }}
      reperes={<Reperes donnee="net" lignes={[
        // 🔴 LOT LO13 — ce qui a quitté la tuile « CA net » : le CA net d'apporteurs (lot LO5, `sommesLocation`) et N−1
        { cle: 'apporteurs', mot: 'CA net d’apporteurs', valeur: <Montant htC={T.netApporteurs.htC} ttcC={T.netApporteurs.ttcC} versee={false} recu donnees={{ 'data-location-net-apporteurs': '' }} /> },
        ...repereASaisir,
        { cle: 'n1', mot: 'Un an plus tôt', valeur: <span className="trx-fl-texte" data-tuile-n1="location-net">{n1(T.net, T1.net)}</span> },
      ]} />} />}

    {graphe.sorte === 'mois'
      ? <GrapheLocationMois lignes={lignes} toutes={toutes} jour={jour} annee={annee} g={graphe} series={series} />
      : <GrapheLocationAnnees lignes={lignes} jour={jour} annee={annee} g={graphe} series={series} toutesAnnees={toutesAnnees} />}

    {/* 🔴 LOT LO11 — le tableau mois par mois (L'année : année par année), juste sous le graphique, comme la Gestion */}
    <section className="tdb-section" aria-labelledby="trx-tableau-location" data-bloc="tableau-location">
      <TableauLocation lignes={lignes} rangees={historique !== null && toutesAnnees !== null ? historique.annees.map((a) => ({ cle: String(a), libelle: String(a), ms: douzeMoisDe(a), mois: null }))
        : historique !== null ? [...new Set(ms.map((m) => m.annee))].map((a) => ({ cle: String(a), libelle: String(a), ms: douzeMoisDe(a), mois: null }))
        : douzeMoisDe(annee).map((m) => ({ cle: `${m.annee}-${m.mois}`, libelle: NOMS_MOIS[m.mois - 1], ms: [m], mois: m }))}
        titre={historique !== null ? 'Année par année' : `${annee} mois par mois`} annee={annee} jour={jour} />
    </section>

    <div ref={listes} className="trx-listes-mois">
      <ListeBaux lignes={periode} titre={`Les baux de ${libComplet}`} infobulle={infobulle} />
    </div>

    <section className="tdb-section" aria-labelledby="trx-resultat-location" data-bloc="resultat-location">
      <h3 id="trx-resultat-location" title={infobulle} {...(infobulle !== undefined ? { 'aria-label': `Résultat de la location — ${infobulle}` } : {})}>Résultat de la location — {libComplet}</h3>
      <ResultatLocation T={T} aSaisir={aSaisir} />
    </section>

    <BlocReplie id="trx-negos-location" section="negociateurs-location" titre={<>Espace par négociateur — {libComplet}</>} resume={`${espace.length} négociateur(s)`}
      donnees={{ 'data-bloc': 'negociateurs-location' }}>
      {/* 🔴 LOT LO12 — l'Espace par négociateur retire aussi le variable, à la règle des mois (avec / sans salaires) ; les salaires ne s'y répartissent pas */}
      <EspaceLocation espace={espace} T={T} />
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
  // 🔴 LOT LO5 — l'autre unité de l'encart, exacte (ses centimes), plus le montant × 1,2 ou ÷ 1,2
  const autreDe = (x: TotauxLocationCa): number => { const m = mesure === 'net' ? x.net : x.ca; return (U.u === 'ht' ? m.ttcC : m.htC) / 100; };
  const parts = (x: TotauxLocationCa) => (mesure === 'ca' ? { parts: [{ mot: 'Propriétaire', ca: U.en(x.proprietaire) }, { mot: 'Locataire', ca: U.en(x.locataire) }] } : {});
  if (mesure === 'nombre') return { titre, compte: 'Baux signés', sansN1, courant: { libelle, ca: t.nb, nb: null }, precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: t1.nb, nb: null } };
  return { titre, motCa, motNb: 'Baux', sansN1, autre: { mot: MOT_UNITE[U.u === 'ht' ? 'ttc' : 'ht'], facteur: U.u === 'ht' ? 1.2 : 1 / 1.2 },
    courant: { libelle, ca: valeurDe(t, mesure, U.en), nb: t.nb, caAutre: autreDe(t), ...parts(t) },
    precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: valeurDe(t1, mesure, U.en), nb: t1.nb, caAutre: autreDe(t1), ...parts(t1) } };
}
/**
 * 🔴 LOT LO15 — le nombre de mois « à saisir » d'un ensemble de mois (les mois commencés sans salaires chargés saisis) ; un filtre actif (salaires
 * non comptés) : aucun. L'encadré du CA net le dit, en note. PUR (hors contexte).
 */
function useASaisir(jour: string): (ms: readonly MoisChoisi[]) => number {
  const x = useContext(ContexteCouts);
  return (ms) => (x.filtre ? 0 : nbMoisSalairesASaisir(ms, (m) => salairesLocationDuMois(x.salaires, m.annee, m.mois) !== null, jour));
}
const avecASaisir = (info: InfoBarre, mesure: Mesure, n: number): InfoBarre => (mesure === 'net' && n > 0 ? { ...info, note: motSalairesASaisir(n) } : info);
function useMesure(): [Mesure, (m: Mesure) => void] {
  const [mesure, setMesure] = useState<Mesure>(() => { const x = parametre('mesure'); return x === 'net' || x === 'nombre' ? x : 'ca'; });
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'ca' ? null : mesure }); }, [mesure]);
  return [mesure, setMesure];
}
const motMesure = (m: Mesure, MOT: string, avec = true): string => (m === 'nombre' ? 'nombre de baux' : m === 'net' ? `CA net${hors(avec)} ${MOT}` : `CA brut ${MOT}`);

/** « Mois par mois » : Mensuel (barres, N−1 hachurée) / Cumul ; le mois choisi en rouge ; Période atténuée ; 2 à 5 négociateurs : une série chacun. */
function GrapheLocationMois({ lignes, toutes, jour, annee, g, series }: { lignes: readonly LigneLocationCa[]; toutes: readonly LigneLocationCa[]; jour: string; annee: number;
  g: Extract<Graphe, { sorte: 'mois' }>; series: readonly { nom: string; couleur: number; lignes: LigneLocationCa[] }[] | null }) {
  const U = useEnUnite();
  const tot = useTotaux(); // 🔴 LOT LO11 — le CA net à la règle (mois par mois)
  const aSaisir = useASaisir(jour); // 🔴 LOT LO15
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const dernier = moisADate(annee, jour);
  const sansN1 = !toutes.some((l) => l.annee === annee - 1);
  const pt = (ls: readonly LigneLocationCa[], a: number, k: number): TotauxLocationCa =>
    tot(ls, cumul ? Array.from({ length: k }, (_, i) => ({ annee: a, mois: i + 1 })) : [{ annee: a, mois: k }]);
  const info = (k: number): InfoBarre => {
    const titre = `${cumul ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`}${k > dernier ? ' — à venir' : ''}`;
    return avecASaisir(infoLocation(titre, mesure, U, String(annee), pt(lignes, annee, k), sansN1 ? null : String(annee - 1), sansN1 ? null : pt(lignes, annee - 1, k), `${annee - 1} : aucune location au Suivi`),
      mesure, aSaisir(cumul ? Array.from({ length: k }, (_, i) => ({ annee, mois: i + 1 })) : [{ annee, mois: k }]));
  };
  const parMois = (ls: readonly LigneLocationCa[], a: number): number[] => Array.from({ length: 12 }, (_, i) => valeurDe(tot(ls, [{ annee: a, mois: i + 1 }]), mesure, U.en));
  const vals = parMois(lignes, annee); const vals1 = parMois(lignes, annee - 1);
  const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);
  const choisi = g.moisChoisis !== null ? (g.moisChoisis.length === 0 ? 0 : borneCumul('periode', annee, g.mois, g.moisChoisis, jour).fin) : g.mois;
  const finAnnee = borneCumul('annee', annee, 0, null, jour).fin;
  const repos = choisi === 0 ? info(finAnnee === 0 ? 1 : finAnnee) : undefined;
  const entier = mesure === 'nombre';
  const motGraphe = motMesure(mesure, U.MOT, useContext(ContexteCouts).avecSalaires);
  return (
    <section className="tdb-section" aria-labelledby="trx-location-histo" data-bloc="histogramme-mois" data-mesure={mesure}
      {...attributMoisRouges(g.rouges)}>
      {/* Arno (01/11/2026) — Période / Année : les mois en rouge (`moisSoulignes`), la règle partagée des graphiques « mois par mois » */}
      <StyleMoisRouges mois={g.rouges} />
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
  const tot = useTotaux(); // 🔴 LOT LO11 — le CA net à la règle (mois par mois)
  const aSaisir = useASaisir(jour); // 🔴 LOT LO15
  const [mesure, setMesure] = useMesure();
  const [cumul, setCumul] = useState(false);
  const enCours = Number(jour.slice(0, 4));
  const { annees } = g;
  const de = (ls: readonly LigneLocationCa[], as: readonly number[]): TotauxLocationCa => tot(ls, moisDesAnnees(as));
  const pt = (ls: readonly LigneLocationCa[], a: number): TotauxLocationCa => (cumul ? de(ls, annees.filter((x) => x <= a)) : de(ls, [a]));
  const info = (a: number): InfoBarre => {
    const avant = toutesAnnees === null && annees.includes(a - 1);
    const titre = cumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === enCours ? ' — en cours' : ''}`;
    return avecASaisir(infoLocation(titre, mesure, U, String(a), pt(lignes, a), avant ? String(a - 1) : null, avant ? pt(lignes, a - 1) : null, toutesAnnees ?? `${a - 1} : aucune location au Suivi`),
      mesure, aSaisir(moisDesAnnees(cumul ? annees.filter((x) => x <= a) : [a])));
  };
  const vals = annees.map((a) => valeurDe(pt(lignes, a), mesure, U.en));
  const entier = mesure === 'nombre';
  const motGraphe = motMesure(mesure, U.MOT, useContext(ContexteCouts).avecSalaires);
  const enPeriode = g.decoupage === 'periode';
  const rouges = anneesRouges(g.decoupage, annee, g.selection, g.annees);
  const rang = (a: number): number => annees.indexOf(a);
  return (
    <section className="tdb-section" aria-labelledby="trx-location-annees" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees"
      {...attributAnneesRouges(rouges)}>
      {/* Arno (01/11/2026) — Période / Tout : les années soulignées en rouge (`anneesSoulignees`), les autres estompées ; la règle partagée */}
      <StyleAnneesRouges annees={rouges} />
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
function ListeBaux({ lignes, titre, infobulle }: { lignes: readonly LigneLocationCa[]; titre: string; infobulle?: string }) {
  const u = useAffichage();
  const [tri, setTriEtat] = useState<TriListe>(() => { try { const x = window.localStorage.getItem(CLE_TRI_LISTE); return estTriListe(x) ? x : TRI_LISTE_DEFAUT; } catch { return TRI_LISTE_DEFAUT; } });
  const setTri = (x: string): void => { if (!estTriListe(x)) return; setTriEtat(x); try { window.localStorage.setItem(CLE_TRI_LISTE, x); } catch { /* préférence seulement */ } };
  const [recherche, setRecherche] = useState('');
  const avecRecherche = lignes.length >= SEUIL_RECHERCHE;
  const q = avecRecherche ? recherche.trim() : '';
  const montrees = q === '' ? lignes : lignes.filter((l) => correspond(ficheRechercheLocation(l), q));
  const triees = trierLocation(montrees, tri, u);
  // 🔴 LOT LO10 — plus de 25 baux : repliée à l'arrivée (et à chaque autre période) ; l'en-tête garde le total des cartes, le tri et la recherche
  const [ouvert, setOuvert] = useListeRepliee(lignes.length, titre);
  const total = triees.reduce((t, l) => ({ ht: t.ht + l.caC.htC, ttc: t.ttc + l.caC.ttcC }), { ht: 0, ttc: 0 });
  return (
    <ListeRepliable id="trx-baux-location" section="baux-location" classe="tdb-section trx-liste-affaires" titre={titre} infobulle={infobulle} ouvert={ouvert} onOuvert={setOuvert}
      donnees={{ 'data-bloc': 'baux-location' }}
      compteur={<>({q === '' ? lignes.length : `${triees.length} sur ${lignes.length}`})</>}
      total={<Montants ht={total.ht / 100} ttc={total.ttc / 100} sens="recu" disposition="pile" classe="lr-montants" donneesHt={{ 'data-total-liste-ht': '' }} donneesTtc={{ 'data-total-liste-ttc': '' }} />}
      outils={<>
        {lignes.length > 0 && <div className="trx-tri-compromis trx-tri-liste" data-tri-liste={tri}><span className="trx-tri-mot" aria-hidden="true">Trier :</span>
          <ListeChoix options={TRIS_LISTE.map((x) => ({ id: x, libelle: LIBELLE_TRI_LISTE[x] }))} valeur={tri} vide={null} libelle={`Trier — ${titre}`}
            onChange={setTri} classe="trx-tri-champ" donnees={{ 'data-choix-tri-liste': '' }} /></div>}
        {avecRecherche && <div className="trx-recherche-liste">
          <input type="search" className="trx-recherche-champ" placeholder="Rechercher…" aria-label={`Rechercher — ${titre}`} value={recherche}
            onChange={(e) => { setRecherche(e.target.value); if (e.target.value.trim() !== '') setOuvert(true); }} data-recherche-liste />
          {recherche !== '' && <button type="button" className="trx-recherche-effacer" aria-label="Effacer la recherche" onClick={() => setRecherche('')} data-effacer-recherche>×</button>}
        </div>}
      </>}>
      {lignes.length === 0 ? <p className="loc-muet" data-aucun-bail>Aucun bail sur la période.</p>
        : q !== '' && triees.length === 0 ? <p className="loc-muet" data-aucun-resultat>Aucun bail ne correspond.</p>
        : <ul className="trx-cartes" data-cartes-baux>{triees.map((l) => <li key={l.id}><CarteBail l={l} /></li>)}</ul>}
    </ListeRepliable>
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
        <span className="trx-carte-titre" data-carte="titre">{titreBail(l)}{' '}
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
        <dt>− Prime de nouvelle gestion (sans TVA)</dt><dd><Mt ht={l.primeC.htC / 100} ttc={l.primeC.ttcC / 100} cout /></dd>
        <dt>− Commission d’apporteur (sans TVA)</dt><dd><Mt ht={l.apporteurC.htC / 100} ttc={l.apporteurC.ttcC / 100} cout /></dd>
        <dt className="trx-total">= Reste</dt><dd className="trx-total trx-vert"><Mt ht={l.netC.htC / 100} ttc={l.netC.ttcC / 100} /></dd>
      </dl>
      <p><a className="trx-bouton-lien" href={lienSuiviDuMois(l)} data-ouvrir-location={l.id}>Ouvrir dans Location</a>
        <small className="loc-muet"> — le Suivi du mois de {NOMS_MOIS[l.mois - 1].toLowerCase()} {l.annee} (lecture seule ici)</small></p>
    </BlocReplie>
  );
}

/** « Résultat de la location » : CA brut − primes − rétrocessions = CA net (la trame des sommes). */
function ResultatLocation({ T, aSaisir }: { T: TotauxRegle; aSaisir: number }) {
  const MOT = MOT_UNITE[useAffichage()];
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  const c = T.c;
  const avec = useContext(ContexteCouts).avecSalaires;
  // 🔴 LOT LO11 — les primes et le variable des mois avec salaires : montrés, « inclus dans les salaires », non déduits
  const inclus = (tout: MontantC, deduit: MontantC): ReactNode => (tout.htC === deduit.htC ? null
    : <small className="loc-muet" data-inclus-salaires> (dont {eur((MOT === 'TTC' ? tout.ttcC - deduit.ttcC : tout.htC - deduit.htC) / 100)} inclus dans les salaires)</small>);
  return (
    <dl className="trx-resultat" data-resultat-location>
      <dt>CA brut ({MOT})</dt><dd><Mt {...m(T.ca)} donnees={{ 'data-resultat-ca': '' }} /></dd>
      <dt>− Rétrocessions d’apporteurs (sans TVA)</dt><dd><Mt {...m(T.apporteurs)} cout donnees={{ 'data-resultat-apporteurs': '' }} /></dd>
      {/* 🔴 Arno (02/11/2026) — chaque ligne « − » se soustrait vraiment : le variable, primes de gestion incluses (`variableNegociateur`) ; les primes
          suivent en sous-ligne « dont », sans signe, non soustraites */}
      <dt>− Variable du négociateur (sans TVA, primes incluses){inclus(variableNegociateur(c.variable, c.primes), variableNegociateur(c.variableDeduit, c.primesDeduites))}</dt>
      <dd><Mt {...m(variableNegociateur(c.variableDeduit, c.primesDeduites))} cout donnees={{ 'data-resultat-variable': '' }} /></dd>
      <dt className="trx-resultat-dont" data-resultat-dont-primes>dont primes de nouvelle gestion (sans TVA){inclus(c.primes, c.primesDeduites)}</dt>
      <dd className="trx-resultat-dont"><Mt {...m(c.primesDeduites)} donnees={{ 'data-resultat-primes': '' }} /></dd>
      {/* 🔴 LOT LO12 — « Sans salaires » : le montant saisi, en gris, « non comptés » (non déduit) */}
      {avec ? <><dt>− Salaires chargés (sans TVA){aSaisir > 0 && <small className="loc-muet trx-a-saisir" data-resultat-a-saisir> — {motSalairesASaisir(aSaisir)}</small>}</dt><dd><Mt {...m(c.salaires)} cout donnees={{ 'data-resultat-salaires': '' }} /></dd></>
        : <><dt className="loc-muet">Salaires chargés (sans TVA) — non comptés{aSaisir > 0 && <small className="trx-a-saisir" data-resultat-a-saisir> — {motSalairesASaisir(aSaisir)}</small>}</dt><dd className="loc-muet" data-resultat-salaires-non-comptes>{eur((MOT === 'TTC' ? c.salairesSaisis.ttcC : c.salairesSaisis.htC) / 100)}</dd></>}
      <dt className="trx-total">= CA net{hors(avec)} ({MOT})</dt><dd className="trx-total trx-vert"><Mt {...m(T.net)} donnees={{ 'data-resultat-net': '' }} /></dd>
    </dl>
  );
}

const douzeMoisDe = (annee: number): MoisChoisi[] => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 }));
const LIBELLE_SALAIRES_LOCATION = 'Salaires chargés';

/**
 * ══ 🔴 LOT LO11 — « [année] mois par mois » (L'année : année par année) : le tableau de la Gestion, pour la Location. Baux, honoraires (CA brut),
 * primes, commissions d'apporteurs, variable du négociateur, salaires chargés (saisis), CA net, honoraires un an plus tôt, « Saisir / Modifier ».
 * Les primes et le variable d'un mois avec salaires : montrés, « inclus dans les salaires » (non déduits). La ligne de total = la somme des lignes.
 */
function TableauLocation({ lignes, rangees, titre, annee, jour }: { lignes: readonly LigneLocationCa[];
  rangees: readonly { cle: string; libelle: string; ms: readonly MoisChoisi[]; mois: MoisChoisi | null }[]; titre: string; annee: number; jour: string }) {
  const U = useEnUnite();
  const tot = useTotaux();
  const x = useContext(ContexteCouts);
  const nbASaisir = useASaisir(jour);
  const montant = (m: MontantC, o: { cout?: boolean; gris?: boolean } = {}) => <span className={o.gris ? 'loc-muet' : o.cout ? classeSens('verse', m.htC, m.ttcC) : undefined}>{eur(U.en(m))}</span>;
  const cellules = (t: TotauxRegle, ms: readonly MoisChoisi[]) => {
    const t1 = tot(lignes, ms.map((m) => ({ annee: m.annee - 1, mois: m.mois })));
    const inclus = t.c.moisAvecSalaires > 0 && t.c.moisAvecSalaires === t.c.nbMois;
    // 🔴 LOT LO15 — une case vide = « pas encore saisi » : « à saisir » (gris, italique) ; une année en partie saisie : « N mois à saisir » sous le montant
    const aSaisir = nbASaisir(ms);
    const motASaisir = aSaisir > 0 ? <small className="loc-muet trx-ligne-bloc trx-a-saisir" data-salaires-a-saisir-nb>{aSaisir} mois {MOT_A_SAISIR}</small> : null;
    return <>
      <td data-mot="Baux">{t.nb}</td>
      <td data-mot="Honoraires" data-location-honoraires>{montant(t.ca)}</td>
      <td data-mot="Primes de gestion" data-location-primes>{montant(t.c.primes, { gris: inclus })}{inclus && <small className="loc-muet trx-ligne-bloc">inclus dans les salaires</small>}</td>
      <td data-mot="Commissions d’apporteurs">{montant(t.apporteurs, { cout: true })}</td>
      <td data-mot="Variable négociateur" data-location-variable>{montant(variableNegociateur(t.c.variable, t.c.primes), { gris: inclus })}{inclus && <small className="loc-muet trx-ligne-bloc">inclus dans les salaires</small>}</td>
      {/* 🔴 LOT LO12 — « Sans salaires » : le montant saisi en gris, « non comptés » */}
      <td data-mot={LIBELLE_SALAIRES_LOCATION} data-location-salaires>{t.c.moisSaisis === 0 ? (aSaisir > 0 ? <em className="loc-muet trx-a-saisir" data-salaires-a-saisir>{MOT_A_SAISIR}</em> : '—')
        : x.avecSalaires ? <>{montant(t.c.salaires, { cout: true })}{motASaisir}</>
        : <>{montant(t.c.salairesSaisis, { gris: true })}<small className="loc-muet trx-ligne-bloc" data-salaires-non-comptes>non comptés</small>{motASaisir}</>}</td>
      <td data-mot={`CA net${hors(x.avecSalaires)}`} data-location-net-mois className={t.net.htC < 0 ? 'trx-rouge' : 'trx-vert'}>{eur(U.en(t.net))}</td>
      <td data-mot="Honoraires un an plus tôt">{montant(t1.ca)}</td>
    </>;
  };
  const tous = rangees.flatMap((r) => r.ms);
  const total = tot(lignes, tous);
  return (
    <>
      <style>{'[data-table-location] .trx-ligne-bloc{display:block;font-size:.78rem}'}</style>
      <h3 id="trx-tableau-location">{titre} <small className="loc-muet">({U.MOT}{U.u === 'ttc' ? ' ; primes, commissions d’apporteurs, variable et salaires chargés sans TVA' : ''})</small></h3>
      <AideVariableMobile cible="tableau-location" />
      <div className="trx-fusion-defile">
        <table className="tdb-table tdb-table--large" data-table-location>
          <thead><tr><th scope="col">{rangees[0]?.mois === null ? 'Année' : 'Mois'}</th><th scope="col">Baux</th><th scope="col">Honoraires</th><th scope="col">Primes de gestion<small className="loc-muet"> (sans TVA)</small></th>
            <th scope="col">Commissions d’apporteurs<small className="loc-muet"> (sans TVA)</small></th><th scope="col"><EnteteVariableNegociateur libelle="Variable négociateur (primes incluses)" cible="tableau-location" /></th><th scope="col">{LIBELLE_SALAIRES_LOCATION}</th><th scope="col">CA net{hors(x.avecSalaires)}</th>
            <th scope="col">Honoraires {rangees[0]?.mois === null ? 'un an plus tôt' : annee - 1}</th>{rangees[0]?.mois !== null && <th scope="col">Saisie</th>}</tr></thead>
          <tbody>
            {rangees.map((r) => {
              const saisi = r.mois === null ? null : salairesLocationDuMois(x.salaires, r.mois.annee, r.mois.mois);
              return (
                <tr key={r.cle} data-rangee-location={r.cle}>
                  <th scope="row">{r.libelle}</th>
                  {cellules(tot(lignes, r.ms), r.ms)}
                  {r.mois !== null && <td data-mot="Saisie"><button type="button" className="trx-bouton-lien" disabled={x.onSaisir === null}
                    onClick={() => { if (r.mois !== null) x.onSaisir?.(r.mois); }} data-saisir-salaires={`${r.mois.annee}-${r.mois.mois}`}>{saisi === null ? 'Saisir' : 'Modifier'}</button></td>}
                </tr>
              );
            })}
            <tr className="tdb-fort trx-ligne-total" data-total-location><th scope="row">Total</th>{cellules(total, tous)}{rangees[0]?.mois !== null && <td data-mot="Saisie" />}</tr>
          </tbody>
        </table>
      </div>
      {x.onSaisir === null && <p className="loc-muet" data-sans-447>Les salaires chargés de la Location se saisiront après la mise à jour de la base (migration 447).</p>}
      {x.filtre ? <p className="loc-muet">Filtre actif : salaires chargés non comptés.</p> : !x.avecSalaires && <p className="loc-muet" data-sans-salaires-note>Sans salaires : salaires chargés non comptés ; primes et variable déduits chaque mois.</p>}
    </>
  );
}

/** 🔴 LOT LO11 — « Saisir / Modifier » les salaires chargés de la Location d'un mois (HT, sans TVA), comme la saisie de la Gestion ; journalisé. */
function SaisieSalairesLocation({ annee, mois, actuelle, onFermer, onFait, onRelire }: {
  annee: number; mois: number; actuelle: SalairesLocation | null; onFermer: () => void; onFait: () => void; onRelire: () => void;
}) {
  const txt = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const [v, setV] = useState({ salairesHt: txt(actuelle?.salairesHt), note: actuelle?.note ?? '' });
  const [motif, setMotif] = useState<string | null>(null);
  const envoyer = async (): Promise<void> => {
    const r = await posterTransaction({ action: 'location-salaires-enregistrer', annee, mois, salaires: v });
    if (r === null) onFait(); else setMotif(r);
  };
  const titre = `${LIBELLE_SALAIRES_LOCATION} de la Location — ${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`;
  return (
    <div className="tdb-voile" onMouseDown={(x) => { if (x.target === x.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={titre} data-saisie-salaires-location>
        <header className="tdb-fenetre-tete"><h3>{titre}</h3><button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer}>×</button></header>
        <div className="tdb-fenetre-corps">
          <p className="loc-muet">Montant HT, sans TVA. Vide : non saisi (les primes et le variable du mois sont alors déduits).</p>
          <form className="trx-form" onSubmit={(x) => { x.preventDefault(); void envoyer(); }}>
            <label>{LIBELLE_SALAIRES_LOCATION} (HT)<input value={v.salairesHt} inputMode="decimal" onChange={(x) => setV((y) => ({ ...y, salairesHt: x.target.value }))} data-champ-salaires-location /></label>
            <label className="trx-plein">Note<textarea value={v.note} onChange={(x) => setV((y) => ({ ...y, note: x.target.value }))} /></label>
            {motif !== null && <p className="trx-erreur trx-plein" role="alert">{motif}</p>}
            <div className="trx-actions trx-plein">
              <button type="submit" className="svv-btn svv-btn-primary gst-btn" data-enregistrer-salaires-location>Enregistrer</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
            </div>
          </form>
          {actuelle?.id !== undefined && <Journal entite="location_salaires_mois" id={actuelle.id} onFait={onRelire} />}
        </div>
      </div>
    </div>
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

/**
 * « Espace par négociateur » : Négociateur · Baux · CA généré · Primes · Rétrocessions · Variable · CA net. 🔴 LOT LO12 — le variable s'y retire
 * aussi, à la règle des mois (`espaceLocationRegle`) ; les salaires chargés ne se répartissent pas : la ligne « Salaires chargés » les retire du total,
 * qui retombe sur le CA net du Résultat.
 */
function EspaceLocation({ espace, T }: { espace: readonly LigneEspaceRegle[]; T: TotauxRegle }) {
  const u = useAffichage();
  const MOT = MOT_UNITE[u];
  const avec = useContext(ContexteCouts).avecSalaires;
  const [tri, trier] = useTriEspaceLocation();
  if (espace.length === 0) return <p className="loc-muet">Aucun bail sur la période.</p>;
  const c = (x: MontantC): number => (u === 'ht' ? x.htC : x.ttcC);
  const triees = tri === null ? espace : [...espace].sort((a, b) => (tri.sens === 'desc' ? c(b[tri.col]) - c(a[tri.col]) : c(a[tri.col]) - c(b[tri.col])) || a.nom.localeCompare(b.nom, 'fr'));
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  const somme = (f: (g: LigneEspaceRegle) => MontantC): MontantC => espace.reduce((t, g) => ({ htC: t.htC + f(g).htC, ttcC: t.ttcC + f(g).ttcC }), { htC: 0, ttcC: 0 });
  const netNegos = somme((g) => g.net);
  const motNet = `CA net${hors(avec)} ${MOT}`;
  // les primes et le variable d'un mois avec salaires : montrés, « inclus dans les salaires », non déduits
  const inclus = (tout: MontantC, deduit: MontantC, attr: string): ReactNode => (tout.htC === deduit.htC ? null
    : <small className="loc-muet trx-ligne-bloc" data-espace-inclus={attr}>dont {eur(c(moinsM(tout, deduit)) / 100)} inclus dans les salaires</small>);
  const bouton = (col: 'ca' | 'net', libelle: ReactNode, mobile = false) => (
    <button type="button" className="trx-tri" onClick={() => trier(col)} data-tri={col} {...(mobile ? { 'data-tri-mobile': col, 'aria-pressed': tri?.col === col } : {})}
      aria-label={`Trier par ${col === 'ca' ? `CA ${MOT} généré` : motNet}${tri?.col === col ? (tri.sens === 'desc' ? ' (décroissant)' : ' (croissant)') : ''}`}>
      <span>{libelle}</span>
      <span className="trx-tri-fleches" aria-hidden="true">
        <span className={tri?.col === col && tri.sens === 'asc' ? 'trx-tri-on' : undefined} data-fleche="asc">▲</span>
        <span className={tri?.col === col && tri.sens === 'desc' ? 'trx-tri-on' : undefined} data-fleche="desc">▼</span>
      </span>
    </button>
  );
  const ariaSort = (col: 'ca' | 'net'): 'ascending' | 'descending' | 'none' => (tri?.col !== col ? 'none' : tri.sens === 'desc' ? 'descending' : 'ascending');
  const salairesComptes = T.c.salaires.htC !== 0;
  return <>
    <style>{'[data-table-negociateurs-location] .trx-ligne-bloc{display:block;font-size:.78rem}'}</style>
    <div className="trx-tri-mobile" role="group" aria-label="Trier l'espace par négociateur">{bouton('ca', <>CA {MOT} généré</>, true)}{bouton('net', <>{motNet}</>, true)}</div>
    <AideVariableMobile cible="espace-location" />
    <table className="tdb-table tdb-table--large" data-table-negociateurs-location>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Baux</th><th scope="col" aria-sort={ariaSort('ca')} data-entete-tri="ca">{bouton('ca', <>CA {MOT} généré</>)}</th>
        <th scope="col">Primes (sans TVA)</th><th scope="col">Rétrocessions (sans TVA)</th><th scope="col"><EnteteVariableNegociateur libelle="Variable" cible="espace-location" apres=" (sans TVA, primes incluses)" /></th>
        <th scope="col" aria-sort={ariaSort('net')} data-entete-tri="net">{bouton('net', <>{motNet}</>)}</th></tr></thead>
      <tbody>{triees.map((g) => (
        <tr key={g.cle} data-negociateur-location={g.nom}>
          <th scope="row">{g.nom}</th><td data-mot="Baux">{g.nb}</td>
          <td data-mot={`CA ${MOT} généré`}><Mt {...m(g.ca)} donnees={{ 'data-espace-ca': g.nom }} /></td>
          <td data-mot={`Primes ${MOT}`}><Mt {...m(g.primesDeduites)} cout donnees={{ 'data-espace-primes': g.nom }} />{inclus(g.primes, g.primesDeduites, `primes-${g.nom}`)}</td>
          <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(g.apporteurs)} cout donnees={{ 'data-espace-apporteurs': g.nom }} /></td>
          <td data-mot="Variable (sans TVA)"><Mt {...m(variableNegociateur(g.variableDeduit, g.primesDeduites))} cout donnees={{ 'data-espace-variable': g.nom }} />{inclus(variableNegociateur(g.variable, g.primes), variableNegociateur(g.variableDeduit, g.primesDeduites), `variable-${g.nom}`)}</td>
          <td data-mot={motNet} className="trx-vert"><Mt {...m(g.net)} donnees={{ 'data-espace-net': g.nom }} /></td>
        </tr>
      ))}
        {salairesComptes && <tr data-espace-salaires><th scope="row">Salaires chargés <small className="loc-muet">(non répartis)</small></th><td data-mot="Baux" /><td data-mot={`CA ${MOT} généré`} />
          <td data-mot={`Primes ${MOT}`} /><td data-mot={`Rétrocessions ${MOT}`} /><td data-mot="Variable (sans TVA)" />
          <td data-mot="Salaires chargés"><Mt {...m(T.c.salaires)} cout donnees={{ 'data-espace-salaires-montant': '' }} /></td></tr>}
        <tr className="tdb-fort trx-ligne-total" data-total-espace-location><th scope="row">Total</th><td data-mot="Baux">{T.nb}</td>
          <td data-mot={`CA ${MOT} généré`}><Mt {...m(somme((g) => g.ca))} /></td><td data-mot={`Primes ${MOT}`}><Mt {...m(somme((g) => g.primesDeduites))} cout /></td>
          <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(somme((g) => g.apporteurs))} cout /></td><td data-mot="Variable (sans TVA)"><Mt {...m(somme((g) => variableNegociateur(g.variableDeduit, g.primesDeduites)))} cout donnees={{ 'data-total-espace-variable': '' }} /></td>
          <td data-mot={motNet} className="trx-vert"><Mt {...m(moinsM(netNegos, T.c.salaires))} donnees={{ 'data-total-espace-net': '' }} /></td></tr>
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
  const tot = useTotaux(); // 🔴 LOT LO11 — coûts et CA net à la règle
  const h = annees.map((annee) => ({ annee, t: tot(lignes, douzeMoisDe(annee)) }));
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  return (
    <table className="tdb-table tdb-table--large" data-table-histoire-location>
      <thead><tr><th scope="col">Année</th><th scope="col">Baux</th><th scope="col">CA brut {MOT}</th><th scope="col">Coûts {MOT}</th><th scope="col">CA net {MOT}</th><th scope="col">Évolution</th></tr></thead>
      <tbody>{h.map(({ annee, t }, i) => (
        <tr key={annee} className={annee === choisie ? 'tdb-fort' : undefined} data-annee-location={annee}>
          <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => onAnnee(annee)}>{annee}</button></th>
          <td data-mot="Baux">{t.nb}</td><td data-mot={`CA brut ${MOT}`}><Mt {...m(t.ca)} donnees={{ 'data-histoire-ca': String(annee) }} /></td>
          <td data-mot={`Coûts ${MOT}`}><Mt {...m(t.couts)} cout /></td><td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(t.net)} /></td>
          <td data-mot="Évolution">{i === 0 ? '—' : signePct(variation(t.ca.htC, h[i - 1].t.ca.htC))}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
