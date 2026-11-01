'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import {
  anneesDe, APPORTEUR_NON_NOMME, bilanVente, caHt, sommeSocietes, caHtParMois, celluleGlobal, compteDansSociete, groupesDoubles, historique, ht, LIBELLE_SOCIETE, moisAConfirmer, negociateursDe, SOCIETES,
  NOMS_MOIS, parApporteur, parNegociateur, payeParClasseTtc, payeTtcDe, previsionnel, resteGestionPropose, resteTtcDe, retroTtcDe, retrosDuMois,
  variation, ventesDeLAnnee, ventesDuMois, ventesProposees, type CaARattacher, type DonneesSociete, type EntreesGlobal, type GestionMois,
  type Retrocession, type Societe, type Vente, TVA,
  aDesCompromisDates, caHtParMoisMode, compromisDuMode, compromisReportes, mentionReportes, estModeMois, MODES_MOIS, nombreParMoisMode, totauxMoisMode, type ModeMois,
} from '../../../../lib/transaction/modele';
import { CourbeCumul, CSS_TABLEAU_BORD, EnteteGraphe, Histogramme, PAS_ANNEE_FIXE, sensDe, sommeAffichee, type InfoBarre } from '../location/TableauBordSuivi';
import { CSS_FEUILLE_MOIS } from '../location/FeuilleDuMois';
import { BlocReplie, CSS_BLOC_REPLIE } from '../location/BlocReplie';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_LOCATION_ECRANS } from '../location/commun';
import { BoutonAffichage, classeSens, COURT, CSS_TRANSACTION, ecartEur, ecrireAdresse, ecrireAdresseListe, ESPACE, eur, FournisseurAffichage, FournisseurNoms, useNommer, lireAffichage, MOT_UNITE, nombreFr, parametre, parametres, posterTransaction, signePct, useAffichage, useAffichageRetenu, useTransaction, type UniteAffichage , FournisseurConsolide, useConsolide } from './commun';
import { FormulaireVente, Journal } from './FormulaireVente';
import { adresseOrigine, CarteAffaire, CarteMiroir, DetailAffaire, OngletCompromis, useColonnesNegociateurs, useHoteAffaires, type HoteDetail } from './OngletCompromis';
import { resolveurDe, type StatutDuLibelle } from '../../../../lib/transaction/statutLigne';
import { classeCommission, libelleStatut } from '../../../../lib/admin/statut';
import { DessinTriangle } from '../_composants/TriangleDepliage';
import { caNetParMoisMode, caNetVente, espaceNegociateurs, resultatDesCartes, retrosSansVenteAffichee, type LigneEspace, type ResultatCartes } from '../../../../lib/transaction/carteAffaireLignes';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import { libellesDuFiltre, personnesNegociateurs } from '../../../../lib/transaction/nomNegociateur';
import { GrapheNegociateurs, MAX_NEGOCIATEURS } from './GrapheNegociateurs';
import { FiltreNegociateurs } from './FiltreNegociateurs';
import { compromisEnCours, totalCompromisEnCours, type TotalCompromisEnCours } from '../../../../lib/transaction/compromisEnCours';
import { anneesGestion, centimesGestion, estMesureGestion, ligneGestionEnUnite, MESURES_GESTION, totauxGestion, valeurGestion, type MesureGestion, type TotauxGestion, type UniteGestion } from '../../../../lib/transaction/gestionVue';
import { aConfirmerDesAnnees, anneesInitiales, basculerAnnee, compromisDesAnnees, DECOUPAGES_ANNEES, ecrireAnnees, borneCumul, cumulA, listeADate, listeDesAnnees, moisADate, moisDesAnnees, retrosDesAnnees, totauxDesAnnees, ventesDesAnnees, type DecoupageAnnees } from '../../../../lib/transaction/periodeAnnees';
import { CLE_TRI_LISTE, correspond, estTriListe, ficheRecherche, LIBELLE_TRI_LISTE, SEUIL_RECHERCHE, TRI_LISTE_DEFAUT, TRIS_LISTE, trierListe, type TriListe } from '../../../../lib/transaction/listeCartes';
import { carteCompromis } from '../../../../lib/transaction/compromisCarte';
import { basculerMois, ordonner, sommeDesMoisAffiches, compromisPeriode, ecrirePeriode, estChoisi, libellePeriode, lirePeriode, retrosPeriode, totauxPeriode, unAnPlusTot, ventesPeriode, type MoisChoisi } from '../../../../lib/transaction/periodeMois';

/** 🔴 LOT CP — en Période, le TTC de chaque ligne est la somme des TTC affichés mois par mois (absent : HT × 1,2, comme avant). */
type NonDeduitsMontants = { internesHt: number; aRenseignerHt: number; internesTtc?: number; aRenseignerTtc?: number };
/** 🔴 LOT Q — la paye NON déduite du reste à l'agence, à part : internes (associés, salariés), puis statut à renseigner (signalé). */
function NonDeduits({ T }: { T: NonDeduitsMontants }) {
  const MOT = MOT_UNITE[useAffichage()];
  return <>
    <dt className="trx-tuile-detail-a-part">Internes (associés, salariés) — non déduits ({MOT})</dt><dd className="trx-tuile-detail-a-part"><Mt ht={T.internesHt} ttc={T.internesTtc} donnees={{ 'data-internes-non-deduits': '' }} /></dd>
    {T.aRenseignerHt > 0 && <><dt className="trx-alerte">Statut à renseigner — non déduits ({MOT})</dt><dd className="trx-alerte"><Mt ht={T.aRenseignerHt} ttc={T.aRenseignerTtc} donnees={{ 'data-a-renseigner-non-deduits': '' }} /></dd></>}
  </>;
}
import { FormulaireDossier, type References } from './FormulaireDossier';

/**
 * ══ 🔴 TUILE « TRANSACTION » (Arno, 27/10/2026) — LES ÉCRANS ═══════════════════════════════════════════════════════════════════
 * La logique et les COMPOSANTS du Suivi de la Location, réutilisés (pas recopiés) : l'histogramme mois par mois et son encart
 * (`Histogramme`), la courbe du cumul (`CourbeCumul`), « Année par année » (`CourbeAnnees`), les blocs repliés (`BlocReplie`), les
 * listes vertes (`ListeChoix`), les tuiles, tableaux et fenêtres (`tdb-*`), les cases de l'accueil (`loc-*`). Le Suivi de la Location
 * ne change pas. Les calculs sont ceux de `lib/transaction/modele.ts` (HT = TTC ÷ 1,2, sans arrondi ; l'affichage arrondit au centime).
 */

const CSS = CSS_LOCATION_ECRANS + CSS_TABLEAU_BORD + CSS_FEUILLE_MOIS + CSS_BLOC_REPLIE + CSS_TRANSACTION;
const SANS_MIGRATION = 'Disponible après la mise à jour de la base (migration 433) : la tuile se remplira dès qu’elle sera appliquée.';

// ── L'accueil de la tuile ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LOT L (Arno, 28/10/2026) — L'ARBORESCENCE DE LA TUILE. Accueil : « Transaction », « Gestion », « CA global ». « Transaction » ouvre
 * « CRITERIMMO » et « MACJ » (l'écran de chaque société, arrivée sur l'onglet « Compromis »). Les adresses des écrans ne changent pas
 * (/admin/transaction/criterimmo, /macj, /global) : seuls l'écran intermédiaire (/admin/transaction/ventes) et « Gestion »
 * (/admin/transaction/gestion) sont nouveaux.
 */
export const ADRESSES_TRANSACTION = {
  accueil: '/admin/transaction', ventes: '/admin/transaction/ventes', gestion: '/admin/transaction/gestion', global: '/admin/transaction/global',
  criterimmo: '/admin/transaction/criterimmo', macj: '/admin/transaction/macj', fusion: '/admin/transaction/fusion',
} as const;
const CASES = [
  { href: ADRESSES_TRANSACTION.ventes, titre: 'Transaction vente', phrase: 'Les ventes et compromis de CRITERIMMO et de MACJ : les compromis, le mois, l’année, les négociateurs, les apporteurs.', cle: 'ventes' },
  { href: ADRESSES_TRANSACTION.gestion, titre: 'Gestion', phrase: 'Les honoraires du parc envoyés chaque mois par le comptable : lots, honoraires, ADHOC, salarié, reste — par mois et par année.', cle: 'gestion' },
  { href: ADRESSES_TRANSACTION.global, titre: 'CA global', phrase: 'Tous les CA réunis : CRITERIMMO (vente, location, gestion), MACJ (vente), puis les deux — par mois et par année, face à N−1.', cle: 'global' },
];
const CASES_VENTES = [
  { href: ADRESSES_TRANSACTION.criterimmo, titre: 'CRITERIMMO', phrase: 'Les compromis, le mois, l’année, les négociateurs et les apporteurs de CRITERIMMO.', cle: 'criterimmo' },
  { href: ADRESSES_TRANSACTION.macj, titre: 'MACJ', phrase: 'Les compromis, le mois, l’année, les négociateurs et les apporteurs de MACJ.', cle: 'macj' },
  // 🔴 LOT DM — les deux sociétés réunies (le même écran ; chaque vente une fois, l'inter-cabinet entre elles neutralisé)
  { href: ADRESSES_TRANSACTION.fusion, titre: 'FUSION CRITERIMMO & MACJ', phrase: 'Les ventes et compromis des deux sociétés réunis.', cle: 'fusion' },
];

function Cases({ cases, libelle, deux = false }: { cases: readonly { href: string; titre: string; phrase: string; cle: string }[]; libelle: string;
  /** LOT M (Arno) — deux cases : une moitié de la largeur chacune (`loc-cases--deux`, la classe partagée de la Location ; 1 colonne ≤ 760 px). */
  deux?: boolean }) {
  return (
    <div className="loc-page">
      <style>{CSS}</style>
      <ul className={`loc-cases loc-cases--accueil${deux ? ' loc-cases--deux' : ''}`} aria-label={libelle}>
        {cases.map((c) => (
          <li key={c.cle}><a className="loc-case" href={c.href} data-tuile-transaction={c.cle}>
            <span className="loc-case-titre">{c.titre}</span><span className="loc-case-phrase">{c.phrase}</span></a></li>
        ))}
      </ul>
    </div>
  );
}
/** L'accueil de la tuile : « Transaction », « Gestion », « CA global ». */
export const AccueilTransaction = () => <Cases cases={CASES} libelle="Les tuiles de la Transaction" />;
/** LOT L — « Transaction vente » : « CRITERIMMO », « MACJ » et (LOT DM) « FUSION CRITERIMMO & MACJ » — trois cases de même taille. */
export const AccueilVentes = () => <Cases cases={CASES_VENTES} libelle="Les sociétés" />;

// ── Une société ───────────────────────────────────────────────────────────────────────────────────────────────────────────

type Detail = { titre: string; ids: number[] } | null;
const entier = (x: string | null, min: number, max: number): number | null => { const n = Number(x); return x !== null && Number.isInteger(n) && n >= min && n <= max ? n : null; };
const moisCourt = (a: number, m: number): string => `${COURT[m - 1]} ${a}`;

/** LOT L — l'onglet d'arrivée : « vue » dite ; sinon « Le mois » pour une ancienne adresse du mois ; sinon « Compromis ». PUR. */
export function vueInitiale(vue: string | null, avecMois: boolean): 'compromis' | 'mois' | 'annee' {
  if (vue === 'annee' || vue === 'mois' || vue === 'compromis') return vue;
  return avecMois ? 'mois' : 'compromis';
}

/**
 * 🔴 LOT GE1 — LA LIGNE DES MOIS (« Mois | Période | Année ») de « Le mois », en un crochet : Transaction et Gestion la partagent (déplacée
 * d'`EcranSociete`, à l'identique).
 */
function useLigneDesMois(jour: string) {
  // 🔴 LOT CP (Arno) — « Mensuel | Période » : null = Mensuel (l'écran d'avant) ; sinon les mois choisis, repris de l'adresse (&periode=2026-07,2026-09)
  // et retenus pendant la visite (changement d'onglet, de mode, d'unité). Sans « mois » dans l'adresse, le dernier mois de la période est le mois montré.
  // 🔴 LOT CT (Arno) — trois positions « Mois | Période | Année » (&vue-mois=mois|periode|annee ; un ancien lien sans « vue-mois » : « &periode=… »
  // ouvre la Période, sinon le Mois). « Année » = les 12 mois de l'année du filtre, cumulés par les fonctions de la Période.
  const [periode, setPeriode] = useState<MoisChoisi[] | null>(() => (parametre('vue-mois') === 'mois' || parametre('vue-mois') === 'annee' ? null : lirePeriode(parametre('periode'))));
  const [anneeEntiere, setAnneeEntiere] = useState(() => parametre('vue-mois') === 'annee');
  const [refusPeriode, setRefusPeriode] = useState(false);
  const [annee, setAnnee] = useState(() => entier(parametre('annee'), 2000, 2100) ?? lirePeriode(parametre('periode'))?.at(-1)?.annee ?? Number(jour.slice(0, 4)));
  const [mois, setMois] = useState(() => entier(parametre('mois'), 1, 12) ?? lirePeriode(parametre('periode'))?.at(-1)?.mois ?? Number(jour.slice(5, 7)));
  // 🔴 LOT CV (Arno) — les mois choisis appartiennent TOUJOURS à l'année du filtre : une période lue d'un lien, ou gardée d'avant un changement
  // d'année (cause du titre « janvier → décembre 2023 » sous une année 2026), est reportée sur cette année — les mêmes mois.
  const periodeA: MoisChoisi[] | null = periode === null ? null : ordonner(periode.map((x) => ({ annee, mois: x.mois })));
  /** Un clic sur un mois : Mensuel, il devient LE mois ; Période, il est choisi ou retiré (le dernier ne se retire pas), et le mois montré suit. */
  const choisirMois = (m: number): void => {
    // 🔴 LOT CT — depuis « Année » : la Période des 11 autres mois (ce mois retiré).
    if (anneeEntiere) { setAnneeEntiere(false); setRefusPeriode(false); setPeriode(douzeMois(annee).filter((x) => x.mois !== m)); return; }
    if (periodeA === null) { setMois(m); return; }
    const r = basculerMois(periodeA, { annee, mois: m });
    setRefusPeriode(r.refus);
    setPeriode(r.mois);
    if (estChoisi(r.mois, { annee, mois: m })) setMois(m);
    else if (m === mois) { const restants = r.mois.filter((x) => x.annee === annee); if (restants.length > 0) setMois(restants.at(-1)!.mois); }
  };
  const choisirDecoupage = (x: Decoupage): void => {
    setRefusPeriode(false);
    if (x === 'annee') { setAnneeEntiere(true); return; }
    if (x === 'mois') { setAnneeEntiere(false); setPeriode(null); return; }
    // « Période » : depuis « Année », ses 12 mois restent choisis ; depuis « Mois », le mois en cours
    if (anneeEntiere) { setAnneeEntiere(false); setPeriode(douzeMois(annee)); } else if (periode === null) setPeriode([{ annee, mois }]);
  };
  const decoupage: Decoupage = anneeEntiere ? 'annee' : periode !== null ? 'periode' : 'mois';
  const periodeVue: MoisChoisi[] | null = anneeEntiere ? douzeMois(annee) : periodeA;
  const periodeTexte = periodeA === null ? null : ecrirePeriode(periodeA);
  return { periode, setPeriode, setAnneeEntiere, annee, setAnnee, mois, setMois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte };
}

/**
 * 🔴 LOT GE1 — LA LIGNE DES ANNÉES (« Année | Période | Tout ») de « L'année », en un crochet (déplacée d'`EcranSociete`, à l'identique) ;
 * `compte(a)` : l'année a-t-elle une donnée comptée (lot DH) ; `vueAnnee` : l'adresse ouvre « L'année » (son « annee » y est l'année montrée).
 */
function useLigneDesAnnees(jour: string, anneesDispo: readonly number[] | null, vueAnnee: boolean, compte: (a: number) => boolean) {
  const [arrivee] = useState(() => ({ vueAnnee: parametre('vue-annee'), annees: parametre('annees'), annee: vueAnnee ? parametre('annee') : null,
    debut: parametre('debut'), fin: parametre('fin') }));
  const [choixAnnees, setChoixAnnees] = useState<ChoixAnnees | null>(null);
  const [refusAnnees, setRefusAnnees] = useState(false);
  const choixA: ChoixAnnees | null = choixAnnees ?? (anneesDispo === null ? null : anneesInitiales(arrivee, anneesDispo, jour));
  const choisirAnnee = (a: number): void => {
    if (choixA === null || anneesDispo === null) return;
    setRefusAnnees(false);
    if (choixA.decoupage === 'annee') { setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); return; }
    // depuis « Tout » : la Période des autres années (cette année retirée), comme « Le mois » depuis « Année »
    if (choixA.decoupage === 'tout') { const autres = (anneesVisibles ?? anneesDispo).filter((x) => x !== a); setChoixAnnees({ decoupage: 'periode', annees: autres, annee: autres.at(-1) ?? a }); return; }
    const b = basculerAnnee(choixA.annees, a);
    setRefusAnnees(b.refus);
    setChoixAnnees({ decoupage: 'periode', annees: b.annees, annee: b.annees.includes(a) ? a : b.annees.includes(choixA.annee) ? choixA.annee : b.annees.at(-1)! });
  };
  const choisirDecoupageAnnees = (x: DecoupageAnnees): void => {
    if (choixA === null || anneesDispo === null) return;
    setRefusAnnees(false);
    if (x === 'annee') setChoixAnnees({ decoupage: 'annee', annees: [choixA.annee], annee: choixA.annee });
    else if (x === 'tout') setChoixAnnees({ decoupage: 'tout', annees: [...(anneesVisibles ?? anneesDispo)], annee: choixA.annee });
    else setChoixAnnees({ decoupage: 'periode', annees: choixA.decoupage === 'tout' ? [...(anneesVisibles ?? anneesDispo)] : choixA.annees, annee: choixA.annee });
  };
  const cleChoixA = choixA === null ? null : `${choixA.decoupage}|${choixA.annees.join(',')}|${choixA.annee}`;
  const anneesVisibles = anneesDispo === null ? null : anneesDispo.filter((a) => compte(a)
    || (choixA !== null && (a === choixA.annee || (choixA.decoupage === 'periode' && choixA.annees.includes(a)))));
  return { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles };
}

/**
 * 🔴 LOT DM — `societe` « tous » : la page FUSION (les deux sociétés réunies) — le MÊME écran, seul le périmètre change : toutes les ventes, chacune
 * une fois (une vente partagée : ses honoraires totaux, l'inter-cabinet entre nos sociétés neutralisé), chaque carte avec l'étiquette de sa société.
 */
export function EcranSociete({ societe }: { societe: Societe | 'tous' }) {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesSociete>(`vue=societe&societe=${societe}`);
  // LOT D — trois onglets : « Compromis », « Le mois », « L'année ». LOT L (Arno) — à l'ouverture : « Compromis ». Une ANCIENNE adresse
  // du mois (« ?annee=…&mois=… » sans « vue », écrite avant ce lot) rouvre toujours « Le mois » : aucun lien ne se perd.
  const [vue, setVue] = useState<'compromis' | 'mois' | 'annee'>(() => vueInitiale(parametre('vue'), parametre('mois') !== null || parametre('periode') !== null || parametre('vue-mois') !== null));
  const refs = useTransaction<References>('vue=references');
  const { annee, setAnnee, mois, setMois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte, setPeriode, setAnneeEntiere } = useLigneDesMois(jour);
  // 🔴 LOT DG (Arno) — « L'année » : la ligne des années (Année | Période | Tout), lue de l'adresse à l'arrivée (anciens liens « Début / Fin »
  // compris : `anneesInitiales`) dès que les années disponibles sont connues ; null : pas encore touchée (l'état de l'adresse).
  // 🔴 LOT CQ — le filtre « Négociateur » : une PERSONNE (son nom affiché), gardé dans l'adresse (&negociateur=…) ; un ancien lien qui porte un
  // libellé (« ARNAUD ») ouvre la même personne. 🔴 LOT CU — de 0 (« Tous ») à 5 personnes (&negociateur=A&negociateur=B ; un lien à une valeur
  // s'ouvre comme avant).
  const [negociateurs, setNegociateurs] = useState<string[]>(() => parametres('negociateur'));
  // 🔴 LOT BS (Arno) — « Le mois » : Vendu | Compromis | Vendu + compromis. L'adresse (&mode=…) d'abord (un lien partagé), sinon le choix retenu
  // par le navigateur, sinon « Vendu » (l'écran d'avant, à l'identique).
  const [mode, setModeEtat] = useState<ModeMois>(() => modeInitial(parametre('mode')));
  const setMode = (m: ModeMois): void => { setModeEtat(m); try { window.localStorage.setItem(CLE_MODE_MOIS, m); } catch { /* sans stockage */ } };
  const anneesDispo = lu.etat === 'ok' ? anneesDe(lu.data, jour) : null;
  const { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles } = useLigneDesAnnees(jour, anneesDispo,
    vueInitiale(parametre('vue'), false) === 'annee',
    // 🔴 LOT DH (Arno) — la ligne des années et l'axe : seulement les années qui ont une donnée comptée dans le mode affiché (une vente, un compromis
    // à sa date) ou une rétrocession saisie ; l'année montrée et les années cochées restent toujours (ex. 2027, présente par la seule date butoir
    // d'un compromis : absente). « Toute l'histoire » garde toutes les années.
    (a) => lu.etat === 'ok' && (listeDesAnnees(lu.data.ventes, [a], mode, jour).length > 0 || lu.data.retrocessions.some((x) => x.annee === a)));
  const [detail, setDetail] = useState<Detail>(null);
  const [edition, setEdition] = useState<Vente | 'nouvelle' | null>(null);
  // 🔴 LOT BW (Arno) — « HT | TTC » sur « Le mois » et « L'année » : le choix retenu de l'onglet « Compromis » (même composant, même mémoire,
  // les deux sociétés) ; relu à chaque changement d'onglet (le sélecteur de « Compromis » a pu le changer).
  const [unite, setUnite] = useAffichageRetenu();
  useEffect(() => { const x = lireAffichage(); if (x !== unite) setUnite(x); }, [vue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ecrireAdresse(vue === 'mois' ? { vue: 'mois', annee: String(annee), mois: String(mois), debut: null, fin: null, mode, 'vue-mois': decoupage,
      periode: decoupage === 'periode' ? periodeTexte : null }
      : vue === 'compromis' ? { vue: null, annee: null, mois: null, debut: null, fin: null, mode: null, mesure: null, periode: null, 'vue-mois': null }
      : choixA === null ? {} // les années ne sont pas encore lues : l'adresse d'arrivée (un ancien lien) reste telle quelle
      : { vue: 'annee', annee: String(choixA.annee), mois: null, debut: null, fin: null, mode, periode: null, 'vue-mois': null,
        'vue-annee': choixA.decoupage === 'annee' ? null : choixA.decoupage, annees: choixA.decoupage === 'periode' ? ecrireAnnees(choixA.annees) : null });
    if (vue !== 'annee') ecrireAdresse({ 'vue-annee': null, annees: null, graphe: null });
  }, [vue, annee, mois, mode, periodeTexte, decoupage, cleChoixA]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ecrireAdresseListe('negociateur', vue === 'compromis' ? [] : negociateurs); }, [vue, negociateurs]);

  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const annees = anneesDe(d, jour);
  const negos = [...new Set([...d.ventes.flatMap(negociateursDe), ...d.retrocessions.map((r) => r.negociateur)])].sort((a, b) => a.localeCompare(b, 'fr'));
  // 🔴 LOT CQ — une entrée par PERSONNE (lot CG : « ARNAUD » et « Arnaud Jorel » = « Arnaud JOREL ») ; elle choisit toutes ses ventes, tous libellés confondus.
  const personnes = personnesNegociateurs(negos, (x) => d.nomsNegociateurs?.[x] ?? x);
  const choisis = negociateurs.map((x) => libellesDuFiltre(personnes, x)).filter((c, i, t) => t.findIndex((y) => y.nom === c.nom) === i).slice(0, MAX_NEGOCIATEURS);
  /** Les données des ventes, rétrocessions et montants à rattacher de ces libellés (une affaire de plusieurs d'entre eux : une fois). */
  const filtrer = (libelles: readonly string[]): DonneesSociete => ({ ...d, ventes: d.ventes.filter((v) => negociateursDe(v).some((l) => libelles.includes(l))),
    retrocessions: d.retrocessions.filter((r) => libelles.includes(r.negociateur)), aRattacher: d.aRattacher.filter((x) => libelles.includes(x.negociateur)) });
  const filtrees: DonneesSociete = choisis.length === 0 ? d : filtrer(choisis.flatMap((c) => c.libelles));
  // 🔴 LOT CU — de 2 à 5 négociateurs : une série par négociateur (ses ventes seules), dans l'ordre de la sélection (sa couleur).
  const seriesNegos = choisis.length >= 2 ? choisis.map((c, i) => ({ nom: c.nom, couleur: i + 1, d: filtrer(c.libelles) })) : null;
  const fini = (): void => { setEdition(null); relire(); };
  const references = refs.lu.etat === 'ok' ? refs.lu.data : null;
  /** LOT D — une vente répartie (ou avec son dossier) se modifie dans le formulaire du dossier ; les autres, comme avant. */
  // 🔴 LOT DM — sur la FUSION, une vente se modifie dans SA société
  const societeEdition: Societe = societe !== 'tous' ? societe : edition !== null && edition !== 'nouvelle' ? edition.societe : 'criterimmo';
  const avecDossier = (v: Vente | 'nouvelle' | null): v is Vente => v !== null && v !== 'nouvelle' && (v.repartition != null || v.dossier != null);

  return (
    <FournisseurConsolide value={societe === 'tous'}>
    <div className="tdb loc-page" data-transaction={societe}>
      <style>{CSS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-migration>{SANS_MIGRATION}</p>}
      <div className="trx-barre">
        <div className="trx-vues" role="tablist" aria-label="Les compromis, le mois ou l’année">
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'compromis'} onClick={() => setVue('compromis')} data-vue="compromis">Compromis</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'mois'} onClick={() => setVue('mois')} data-vue="mois">Le mois</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'annee'} onClick={() => setVue('annee')} data-vue="annee">L’année</button>
        </div>
      </div>
      {vue === 'compromis' ? <OngletCompromis societe={societe} fusion={societe === 'tous'} /> : <>
      <form className="tdb-filtres" aria-label="Filtres" onSubmit={(e) => e.preventDefault()}>
        {/* 🔴 LOT DG — « L'année » : les filtres Début / Fin sont remplacés par la ligne des années (accord d'Arno). */}
        {vue === 'mois' && (
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
        )}
        {/* 🔴 LOT CU — un bloc (pas un <label>) : un clic dans la liste ne doit pas rouvrir / refermer le champ. */}
        <div className="tdb-champ">Négociateur
          <FiltreNegociateurs personnes={personnes.map((p) => p.nom)} choisis={choisis.map((c) => c.nom)} onChange={setNegociateurs} /></div>
        {/* 🔴 LOT BS — ce que « Le mois » additionne : les ventes signées (date de l'acte), les compromis (date du compromis), ou les deux. */}
        {<div className="tdb-champ trx-champ-mode"><span id="trx-mode-mot">Compter</span>
          <div className="trx-unites trx-modes" role="group" aria-labelledby="trx-mode-mot" data-filtre="mode">
            {MODES_MOIS.map((m) => <button key={m} type="button" className="trx-unite" aria-pressed={mode === m} onClick={() => setMode(m)} data-mode-mois={m}>{LIBELLE_MODE[m]}</button>)}
          </div>
          {/* 🔴 LOT BT — la règle du mode combiné, dite sous le sélecteur. 🔴 LOT CZ (affichage conditionnel autorisé par Arno) — seulement en
              « Vendu + compromis » ; dans les autres modes, rien (ni texte, ni place réservée). */}
          {mode === 'tous' && <small className="loc-muet trx-mode-regle" data-regle-mode>Vendu + compromis : chaque affaire une seule fois — à la date de l’acte si elle est signée ; sinon, compromis en cours comptés dans l’année en cours (au mois du compromis, ou au mois en cours s’il n’est pas daté de l’année).</small>}</div>}
        {/* 🔴 LOT BW — les montants en grand : HT ou TTC (à droite de « Compter » ; sur « L'année », au même endroit de ses filtres). */}
        <div className="tdb-champ trx-champ-unite"><span id="trx-unite-mot">Montants</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
      </form>

      <FournisseurAffichage value={unite}><FournisseurNoms value={d.nomsNegociateurs ?? {}}>
      {vue === 'mois'
        ? <VueMois d={filtrees} tout={d} annee={annee} mois={mois} jour={jour} mode={mode} onMois={choisirMois} onDetail={setDetail} onEdition={setEdition} onRelire={relire} references={references}
            periode={periodeVue} decoupage={decoupage} refusPeriode={refusPeriode} onDecoupage={choisirDecoupage} series={seriesNegos} filtreNegociateurs={choisis.map((c) => c.nom)} />
        : choixA !== null && <VueAnnee d={filtrees} tout={d} annees={anneesVisibles ?? annees} anneesHistoire={annees} choix={choixA} refus={refusAnnees} onAnnee={choisirAnnee}
            onAnneeSeule={(a) => { setRefusAnnees(false); setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); }} onDecoupage={choisirDecoupageAnnees}
            onOuvrirMois={(a, m) => { setAnneeEntiere(false); setPeriode(null); setAnnee(a); setMois(m); setVue('mois'); }}
            jour={jour} mode={mode} onDetail={setDetail} onEdition={setEdition} onRelire={relire} references={references} series={seriesNegos} filtreNegociateurs={choisis.map((c) => c.nom)} />}
      </FournisseurNoms></FournisseurAffichage>
      </>}
      {/* 🔴 LOT CX (Arno) — « Ventes à attribuer » en DERNIER, après tous les blocs (onglet Compromis : après la synthèse et les annulés ;
          Le mois / L'année : après les apporteurs et l'espace par négociateur) ; replié, compteur, contenu et attribution inchangés. */}
      <BlocAAttribuer notes={d.doubles ?? []} disponible={d.disponible} onRelire={relire} />

      {detail !== null && <FournisseurAffichage value={unite}><FournisseurNoms value={d.nomsNegociateurs ?? {}}><ListeVentes titre={detail.titre} ventes={d.ventes.filter((v) => detail.ids.includes(v.id))} retros={d.retrocessions} societe={societe === 'tous' ? null : societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)}
        onFermer={() => setDetail(null)} onModifier={(v) => { setDetail(null); setEdition(v); }} /></FournisseurNoms></FournisseurAffichage>}
      {edition !== null && avecDossier(edition) && references !== null && <FormulaireDossier societe={edition.societe} vente={edition} references={references}
        onFermer={() => setEdition(null)} onFait={fini} />}
      {edition !== null && !avecDossier(edition) && <FormulaireVente societe={societeEdition} vente={edition === 'nouvelle' ? null : edition} annee={vue === 'annee' && choixA !== null ? choixA.annee : annee} mois={vue === 'mois' ? mois : null}
        negociateurs={negos} references={references} onFermer={() => setEdition(null)} onFait={fini} />}
    </div>
    </FournisseurConsolide>
  );
}

// ── Le mois ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 🔴 LOT BS — le choix du mode retenu par le navigateur (et repris de l'adresse). */
export const CLE_MODE_MOIS = 'trx-mois-mode';
/** 🔴 LOT CY — la tuile « Compromis en cours (TTC) » de « Le mois » et « L'année » : le total de la règle unique, l'autre unité dessous, le nombre ;
 *  le filtre « Négociateur » actif, en petit. */
function TuileCompromisEnCours({ cec, filtre }: { cec: TotalCompromisEnCours; filtre: readonly string[] }) {
  const U = useUnite();
  const [grand, petit] = U.u === 'ht' ? [cec.htC, cec.ttcC] : [cec.ttcC, cec.htC];
  return <>
    <span className="tdb-tuile-mot">Compromis en cours ({U.MOT}){filtre.length > 0 && <small className="trx-tuile-filtre" data-tuile-filtre> — {filtre.length === 1 ? 'Négociateur' : 'Négociateurs'} : {filtre.join(', ')}</small>}</span>
    <strong className="tdb-tuile-valeur" data-compromis-en-cours>{eur(grand / 100)}</strong>
    <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(petit / 100)}{ESPACE}{U.autre.mot})</small>
    <span className="tdb-tuile-n1">{cec.nb} compromis — le prévisionnel</span>
  </>;
}
/** 🔴 LOT DQ / DR — sous le titre d'une liste de « Vendu + compromis » ou de « Compromis » : « N compromis non datés ou antérieurs, comptés au mois en cours » ; rien sinon. */
function MentionReportes({ ventes, jour }: { ventes: readonly Vente[]; jour: string }) {
  const m = mentionReportes(compromisReportes(ventes, jour).length);
  return m === null ? null : <small className="loc-muet trx-mention-reportes" data-mention-reportes> — {m}</small>;
}
/** 🔴 LOT CT — la ligne des mois : un mois, une période (des mois choisis) ou l'année (ses 12 mois). */
export type Decoupage = 'mois' | 'periode' | 'annee';
export const DECOUPAGES: readonly Decoupage[] = ['mois', 'periode', 'annee'];
const LIBELLE_DECOUPAGE: Record<Decoupage, string> = { mois: 'Mois', periode: 'Période', annee: 'Année' };
/** Les 12 mois d'une année. PUR. */
const douzeMois = (annee: number): MoisChoisi[] => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 }));
export const LIBELLE_MODE: Record<ModeMois, string> = { vendu: 'Vendu', compromis: 'Compromis', tous: 'Vendu + compromis' };
/** Le mode à l'arrivée : celui de l'adresse, sinon celui retenu par le navigateur, sinon « vendu ». PUR (hors lecture du stockage, protégée). */
export function modeInitial(adresse: string | null): ModeMois {
  if (estModeMois(adresse)) return adresse;
  try { const r = typeof window === 'undefined' ? null : window.localStorage.getItem(CLE_MODE_MOIS); if (estModeMois(r)) return r; } catch { /* sans stockage */ }
  return 'vendu';
}
/** Les mots de l'écran selon le mode (tuiles, graphique, listes). */
const MOTS_MODE: Record<ModeMois, { ca: string; nombre: string; onglet: string; liste: string; graphe: string; compte: string }> = {
  vendu: { ca: 'CA HT', nombre: 'Ventes', onglet: 'Nombre de ventes', liste: 'Ventes', graphe: 'CA HT', compte: 'Ventes' },
  compromis: { ca: 'CA HT des compromis', nombre: 'Compromis', onglet: 'Nombre de compromis', liste: 'Compromis', graphe: 'CA HT des compromis', compte: 'Compromis' },
  tous: { ca: 'CA HT vendu + compromis', nombre: 'Ventes + compromis', onglet: 'Nombre', liste: 'Ventes et compromis', graphe: 'CA HT vendu + compromis', compte: 'Ventes + compromis' },
};
/** 🔴 LOT CW — « CA | CA net | Nombre » (le CA net : `caNetVente`, ce que la vente rapporte réellement à l'agence). */
type MesureTrx = 'ca' | 'net' | 'nombre';
const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);

/**
 * 🔴 LOT DG (Arno) — LE GRAPHIQUE « MOIS PAR MOIS » de « Le mois », en un composant (déplacé de `VueMois`, à l'identique) : « Le mois » le rend
 * pour son mois ou sa période, « L'année » pour l'année montrée (`mois` 0 : aucun mois choisi, l'encadré au repos du lot CV). `entete` : ce que
 * l'écran ajoute dans l'en-tête du graphique (« L'année » : le choix de l'échelle).
 */
export const sansN1Pour = (ventes: readonly Vente[], a: number, mode: ModeMois): boolean => {
  const sansVenduN1 = !ventes.some((v) => v.annee === a - 1);
  return mode === 'vendu' ? sansVenduN1 : mode === 'compromis' ? !aDesCompromisDates(ventes, a - 1) : sansVenduN1 && !aDesCompromisDates(ventes, a - 1);
};
/** Ce que dit une tuile ou l'encadré sans année précédente. */
export const motSansN1Pour = (a: number, mode: ModeMois): string => (mode === 'compromis' ? `${a - 1} : aucun compromis daté` : `${a - 1} : non importé`);
function GrapheMois({ d, tout, annee, mois, jour, mode, series, onMois, moisSeul, periodeAnnee, finPeriode = null, entete }: {
  d: DonneesSociete; tout: DonneesSociete; annee: number; mois: number; jour: string; mode: ModeMois;
  series: readonly { nom: string; couleur: number; d: DonneesSociete }[] | null; onMois: (m: number) => void;
  /** 🔴 LOT DE — le mode « Mois » (l'encadré au repos = le mois choisi). */
  moisSeul: boolean;
  /** 🔴 LOT CP — en Période : les mois choisis de l'année (surlignés) ; null : pas de période. */
  periodeAnnee: readonly number[] | null;
  /** 🔴 LOT DN — « Période » : la borne du cumul (`borneCumul` : le dernier mois choisi) — l'encadré du Cumul au repos s'y arrête ; null : la règle CV. */
  finPeriode?: number | null;
  entete?: ReactNode;
}) {
  const U = useUnite();
  const cons = useConsolide(); // 🔴 LOT DO — FUSION : les intitulés consolidés
  const M = consoliderMots(cons, motsEnUnite(MOTS_MODE[mode], U.MOT));
  const enPeriode = periodeAnnee !== null;
  const moisPeriodeAnnee = periodeAnnee ?? [];
  const [cumul, setCumul] = useState(false);
  // 🔴 LOT BS — « CA | Nombre » (l'organisation du graphique de la Location) ; gardé dans l'adresse (&mesure=nombre).
  const [mesure, setMesure] = useState<MesureTrx>(() => (parametre('mesure') === 'nombre' ? 'nombre' : parametre('mesure') === 'net' ? 'net' : 'ca'));
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'ca' ? null : mesure }); }, [mesure]);
  const parMois = caHtParMoisMode(d.ventes, annee, d.societe, mode, jour);
  const parMoisN1 = caHtParMoisMode(d.ventes, annee - 1, d.societe, mode, jour);
  const vendusN = caHtParMois(d.ventes, annee, d.societe);
  const vendusN1 = caHtParMois(d.ventes, annee - 1, d.societe);
  const nbParMois = nombreParMoisMode(d.ventes, annee, mode, jour);
  const nbParMoisN1 = nombreParMoisMode(d.ventes, annee - 1, mode, jour);
  const nbVendusN = nombreParMoisMode(d.ventes, annee, 'vendu', jour);
  const nbVendusN1 = nombreParMoisMode(d.ventes, annee - 1, 'vendu', jour);
  const sansN1 = sansN1Pour(series !== null ? tout.ventes : d.ventes, annee, mode);
  const motSansN1 = motSansN1Pour(annee, mode);
  const cumulN = cumuler(parMois);
  const cumulN1 = cumuler(parMoisN1);
  const anneeEnCours = Number(jour.slice(0, 4));
  const dernierMois = annee < anneeEnCours ? 12 : annee > anneeEnCours ? 0 : Number(jour.slice(5, 7));
  /** L'encart d'un mois (ou de son cumul) : l'année et N−1 ; « Vendu + compromis » : le vendu, les compromis, puis le total. */
  const parts = (vendu: number, total: number) => (mode === 'tous' ? { parts: [{ mot: 'Vendu', ca: vendu }, { mot: 'Compromis', ca: total - vendu }] } : {});
  // 🔴 LOT BW — le graphique dans l'unité choisie (le nombre ne change pas) ; l'encart dit « CA TTC » et l'autre unité entre parenthèses.
  const sc = (xs: readonly number[]): number[] => xs.map(U.en);
  const enUnite = (m: MontantC): number => (U.u === 'ht' ? m.htC : m.ttcC) / 100;
  const optsNet = { retros: tout.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
  const netDe = (ventesX: readonly Vente[], a: number, m: ModeMois): number[] => (mesure === 'net' ? caNetParMoisMode(ventesX, a, d.societe, m, jour, optsNet).map(enUnite) : Array(12).fill(0));
  const netN = netDe(d.ventes, annee, mode);
  const netN1 = netDe(d.ventes, annee - 1, mode);
  const netVenduN = mode === 'tous' ? netDe(d.ventes, annee, 'vendu') : netN;
  const netVenduN1 = mode === 'tous' ? netDe(d.ventes, annee - 1, 'vendu') : netN1;
  // 🔴 LOT CV (Arno) — le titre cite TOUJOURS l'année du graphique (« Cumul 2026 à fin mai », « Mai 2026 ») ; un mois à venir : « — à venir », à 0
  // (plus de case vide). `nbCumule` : le nombre cumulé (l'encadré « au repos » : le cumul de l'année) ; sinon le nombre du mois, comme avant.
  // 🔴 LOT DQ / DR — « Vendu + compromis » et « Compromis », année en cours : les compromis en cours non datés de l'année, comptés au mois en cours (la mention).
  const nbReportes = mode !== 'vendu' && annee === anneeEnCours ? compromisReportes(compromisDuMode(d.ventes, annee, null, mode, jour), jour).length : 0;
  const moisDuJour = Number(jour.slice(5, 7));
  const info = (k: number, cumule: boolean, nbCumule = false): InfoBarre => {
    const note = nbReportes > 0 && (cumule ? k >= moisDuJour : k === moisDuJour) ? mentionReportes(nbReportes) : null;
    const i = infoSansNote(k, cumule, nbCumule);
    return note === null ? i : { ...i, note };
  };
  const infoSansNote = (k: number, cumule: boolean, nbCumule = false): InfoBarre => {
    const aVenir = k > dernierMois;
    const titre = `${cumule ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`}${aVenir ? ' — à venir' : ''}`;
    if (mesure === 'nombre') {
      const [n, n1, v, v1] = cumule ? [cumuler(nbParMois), cumuler(nbParMoisN1), cumuler(nbVendusN), cumuler(nbVendusN1)] : [nbParMois, nbParMoisN1, nbVendusN, nbVendusN1];
      return { titre, compte: cumule ? `${M.compte} (cumul)` : M.compte, ...(mode === 'compromis' ? { sansN1: motSansN1 } : {}),
        courant: { libelle: String(annee), ca: aVenir ? 0 : n[k - 1], nb: null, ...(aVenir ? parts(0, 0) : parts(v[k - 1], n[k - 1])) },
        precedent: sansN1 ? null : { libelle: String(annee - 1), ca: n1[k - 1], nb: null, ...parts(v1[k - 1], n1[k - 1]) } };
    }
    const net = mesure === 'net';
    const [c, c1, v, v1] = net ? (cumule ? [netN, netN1, netVenduN, netVenduN1].map(cumuler) : [netN, netN1, netVenduN, netVenduN1])
      : (cumule ? [cumulN, cumulN1, cumuler(vendusN), cumuler(vendusN1)] : [parMois, parMoisN1, vendusN, vendusN1]).map(sc);
    // Le nombre de l'encart reste celui du MOIS, même en cumul (l'encart d'avant ce lot, à l'identique).
    const nb = nbCumule ? cumuler(nbParMois) : nbParMois;
    const nb1 = nbCumule ? cumuler(nbParMoisN1) : nbParMoisN1;
    return { titre, motNb: M.compte, motCa: cons(net ? `CA net ${U.MOT}` : `CA ${U.MOT}`), autre: U.autre, ...(mode === 'compromis' ? { sansN1: motSansN1 } : {}),
      courant: { libelle: String(annee), ca: aVenir ? 0 : c[k - 1], nb: aVenir ? 0 : nb[k - 1], ...(aVenir ? parts(0, 0) : parts(v[k - 1], c[k - 1])) },
      precedent: sansN1 ? null : { libelle: String(annee - 1), ca: c1[k - 1], nb: nb1[k - 1], ...parts(v1[k - 1], c1[k - 1]) } };
  };
  /**
   * 🔴 LOT CV (Arno) — l'encadré « au repos » (rien de survolé ni de cliqué) : Cumul — l'année en cours jusqu'à aujourd'hui (le mois en cours
   * inclus), une année passée complète, une année future à 0 ; Mensuel — le mois en cours « — en cours », décembre d'une année passée. Les
   * mêmes lignes (CA, nombre, N−1 sur la même période de l'année précédente).
   */
  const repos = (cumule: boolean): InfoBarre => {
    const moisEnCours = Number(jour.slice(5, 7));
    if (cumule && finPeriode !== null && finPeriode > 0) return info(finPeriode, true, true); // 🔴 LOT DN — « Cumul [année] à fin [dernier mois choisi] »
    if (annee > anneeEnCours) return { ...info(12, cumule, cumule), titre: cumule ? `Cumul ${annee} — aucune vente` : `Janvier ${annee} — aucune vente` };
    if (annee < anneeEnCours) return { ...info(12, cumule, cumule), titre: cumule ? `Cumul ${annee} — année complète` : `Décembre ${annee}` };
    return { ...info(moisEnCours, cumule, cumule), titre: cumule ? `Cumul ${annee} jusqu’à aujourd’hui` : `${NOMS_MOIS[moisEnCours - 1]} ${annee} — en cours` };
  };
  const nombre = mesure === 'nombre';
  const net = mesure === 'net';
  const valeurs = nombre ? nbParMois : net ? netN : sc(parMois);
  const valeursN1 = nombre ? nbParMoisN1 : net ? netN1 : sc(parMoisN1);
  const basN = nombre ? nbVendusN : net ? netVenduN : sc(vendusN);
  const basN1 = nombre ? nbVendusN1 : net ? netVenduN1 : sc(vendusN1);
  const motGraphe = nombre ? M.onglet.toLowerCase() : net ? cons(`CA net ${U.MOT}`) : M.graphe;
  return <>
    {/* 🔴 LOT BS (Arno) — l'organisation du graphique « Mois par mois » de la Location : son en-tête (la bascule « ⇄ Mensuel » / « Cumul », les
        onglets de mesure à droite), ses barres (N pleines, N−1 hachurées), sa légende, son encart à droite ; un mois s'ouvre d'un clic. « Vendu +
        compromis » : la barre EMPILÉE (vendu en bas, compromis au-dessus, plus clair ; N−1 hachurée, même empilement). */}
    <section className="tdb-section" aria-labelledby="trx-histo" data-bloc="histogramme-mois" data-mesure={mesure}
      {...(enPeriode ? { 'data-periode-graphe': moisPeriodeAnnee.join(',') } : {})}>
      {/* 🔴 LOT CP — en Période : les mois choisis de l'année surlignés (rouge), les autres atténués ; une règle de la Transaction, le graphique
          partagé de la Location n'est pas touché. */}
      {enPeriode && <style>{`[data-periode-graphe] g[data-barre-mois]{opacity:.35}${moisPeriodeAnnee.map((k) => `[data-periode-graphe] g[data-barre-mois="${k}"]{opacity:1}[data-periode-graphe] g[data-barre-mois="${k}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<MesureTrx> id="trx-histo" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel"
        mesures={[{ cle: 'ca', mot: cons('CA') }, { cle: 'net', mot: cons('CA net') }, { cle: 'nombre', mot: M.onglet }]}
        titre={<>Mois par mois — {annee} <small className="loc-muet">({motGraphe}{cumul ? ', cumulé depuis janvier' : ''} ; un mois s’ouvre d’un clic)</small></>} />
      {entete}
      {/* 🔴 LOT DE (Arno) — en mode « Mois », l'encadré au repos montre le mois choisi (au survol, le mois survolé ; en quittant le graphique, le mois
          choisi) ; Période / Année : le lot CV, inchangé. Les autres mois pâles : SEULEMENT de 2 à 5 négociateurs (lot DF : le graphique de base,
          « Tous » ou un négociateur, n'est jamais pâli ; « Période » garde son atténuation). */}
      {/* 🔴 LOT CU — de 2 à 5 négociateurs : une série par négociateur (sa couleur), sans N−1 ; Mensuel en barres groupées, Cumul en courbes. */}
      {series !== null ? (
        <GrapheNegociateurs series={series.map((x) => ({ nom: x.nom, couleur: x.couleur, nb: nombreParMoisMode(x.d.ventes, annee, mode, jour),
          // 🔴 LOT CW — « CA net » : le CA net des ventes de CE négociateur
          ca: net ? netDe(x.d.ventes, annee, mode) : caHtParMoisMode(x.d.ventes, annee, d.societe, mode, jour).map(U.en) }))}
          total={{ ca: net ? netN : sc(parMois), nb: nbParMois }}
          totalN1={sansN1 ? null : { ca: net ? netN1 : sc(parMoisN1), nb: nbParMoisN1, annee: annee - 1 }} cumul={cumul} nombre={nombre} dernierMois={dernierMois} annee={annee}
          choisi={enPeriode ? (moisPeriodeAnnee.includes(mois) ? mois : moisPeriodeAnnee.at(-1) ?? mois) : mois} onChoisir={onMois}
          motCa={cons(net ? `CA net ${U.MOT}` : `CA ${U.MOT}`)} motNb={M.compte} aria={`${motGraphe}${cumul ? ' cumulé' : ''} par mois, ${annee}, un négociateur par série`} moisSeul={moisSeul} finPeriode={finPeriode} />
      ) : cumul ? (
        <CourbeCumul courant={cumuler(valeurs).slice(0, dernierMois)} n1={sansN1 ? null : cumuler(valeursN1)} annee={annee} selection={mois} entier={nombre}
          aria={`${motGraphe} cumulé ${annee}`} bulle={(k) => info(k, true)} onChoisir={onMois} repos={moisSeul ? undefined : repos(true)} />
      ) : (
        <Histogramme attribut="data-barre-mois" courante={enPeriode ? (moisPeriodeAnnee.includes(mois) ? mois : moisPeriodeAnnee.at(-1) ?? 0) : mois} onChoisir={onMois} entier={nombre} aria={`${motGraphe} par mois, ${annee}`}
          legende={{ courant: String(annee), n1: sansN1 ? null : String(annee - 1) }}
          repos={moisSeul ? undefined : repos(false)}
          barres={valeurs.map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernierMois ? null : v, n1: sansN1 ? null : valeursN1[i], info: info(i + 1, false),
            ...(mode === 'tous' ? { empile: { bas: basN[i], basN1: sansN1 ? null : basN1[i] } } : {}) }))} />
      )}
      {/* 🔴 LOT CW — la définition, en petit, dans l'onglet « CA net ». */}
      {net && <p className="loc-muet trx-note-ca-net" data-note-ca-net>CA net : honoraires moins commissions des négociateurs (salariés compris), rétrocessions d’apporteurs et reversé inter-cabinet.</p>}
      {mode === 'tous' && !cumul && series === null && <p className="loc-muet trx-legende-empile" data-legende-empile>
        <span className="trx-pastille-empile trx-pastille-empile--bas" aria-hidden="true" /> vendu · <span className="trx-pastille-empile trx-pastille-empile--haut" aria-hidden="true" /> compromis (au-dessus)</p>}
    </section>

  </>;
}

/** 🔴 LOT GE1 — LA LIGNE DES MOIS et « Mois | Période | Année » (déplacée de `VueMois`, à l'identique) : Transaction et Gestion. */
function LigneDesMois({ annee, mois, decoupage, moisChoisis, onMois, onDecoupage }: { annee: number; mois: number; decoupage: Decoupage;
  /** En Période / Année : les mois choisis de l'année (boutons à bascule) ; null : un mois. */
  moisChoisis: readonly number[] | null; onMois: (m: number) => void; onDecoupage?: (x: Decoupage) => void }) {
  return (
  <div className="trx-rangee-mois" data-decoupage={decoupage}>
    {moisChoisis !== null ? (
      <div className="tdb-onglets trx-onglets-periode" role="group" aria-label={`Mois de ${annee} choisis pour la période`}>
        {NOMS_MOIS.map((m, i) => (
          <button key={m} type="button" aria-pressed={moisChoisis.includes(i + 1)} className="tdb-onglet" onClick={() => onMois(i + 1)} data-onglet-mois={i + 1}>{m}</button>
        ))}
      </div>
    ) : (
      <div className="tdb-onglets" role="tablist" aria-label={`Mois de ${annee}`}>
        {NOMS_MOIS.map((m, i) => (
          <button key={m} type="button" role="tab" aria-selected={mois === i + 1} className="tdb-onglet" onClick={() => onMois(i + 1)} data-onglet-mois={i + 1}>{m}</button>
        ))}
      </div>
    )}
    {/* 🔴 LOT CT — trois positions : « Mois » (l'ancien « Mensuel ») | « Période » | « Année ». */}
    {onDecoupage && <div className="trx-unites trx-choix-periode" role="group" aria-label="Un mois, une période ou l’année" data-choix-periode={decoupage}>
      {DECOUPAGES.map((x) => <button key={x} type="button" className="trx-unite" aria-pressed={decoupage === x} onClick={() => onDecoupage(x)} data-decouper={x}>{LIBELLE_DECOUPAGE[x]}</button>)}
    </div>}
  </div>
  );
}

/** 🔴 LOT GE1 — LA LIGNE DES ANNÉES et « Année | Période | Tout » (déplacée de `VueAnnee`, à l'identique) : Transaction et Gestion. */
function LigneDesAnnees({ annees, decoupage, annee, choisies, onAnnee, onDecoupage }: { annees: readonly number[]; decoupage: DecoupageAnnees; annee: number;
  choisies: readonly number[]; onAnnee: (a: number) => void; onDecoupage: (x: DecoupageAnnees) => void }) {
  return (
  <div className="trx-rangee-mois trx-rangee-annees" data-decoupage-annees={decoupage}>
    {decoupage === 'annee' ? (
      <div className="tdb-onglets" role="tablist" aria-label="Les années">
        {annees.map((a) => <button key={a} type="button" role="tab" aria-selected={a === annee} className="tdb-onglet" onClick={() => onAnnee(a)} data-onglet-annee={a}>{a}</button>)}
      </div>
    ) : (
      <div className="tdb-onglets trx-onglets-periode" role="group" aria-label="Les années choisies">
        {annees.map((a) => <button key={a} type="button" aria-pressed={choisies.includes(a)} className="tdb-onglet" onClick={() => onAnnee(a)} data-onglet-annee={a}>{a}</button>)}
      </div>
    )}
    <div className="trx-unites trx-choix-periode" role="group" aria-label="Une année, plusieurs années ou toutes" data-choix-annees={decoupage}>
      {DECOUPAGES_ANNEES.map((x) => <button key={x} type="button" className="trx-unite" aria-pressed={decoupage === x} onClick={() => onDecoupage(x)} data-decouper-annees={x}>{LIBELLE_DECOUPAGE_ANNEES[x]}</button>)}
    </div>
  </div>
  );
}

function VueMois({ d, tout, annee, mois, jour, mode, onMois, onDetail, onEdition, onRelire, references, periode = null, decoupage = periode === null ? 'mois' : 'periode', refusPeriode = false, onDecoupage, series = null, filtreNegociateurs = [] }: {
  d: DonneesSociete; tout: DonneesSociete; annee: number; mois: number; jour: string; mode: ModeMois; onMois: (m: number) => void;
  onDetail: (x: Detail) => void; onEdition: (v: Vente) => void; onRelire: () => void;
  /** 🔴 LOT BU — les références (négociateurs, apporteurs, personnes…) de la fiche dépliée d'une vente ; null : pas encore lues (lecture seule). */
  references: References | null;
  /** 🔴 LOT CP — null : Mensuel (l'écran d'avant, à l'identique) ; sinon les mois choisis, cumulés. */
  periode?: readonly MoisChoisi[] | null; refusPeriode?: boolean; onDecoupage?: (x: Decoupage) => void;
  /** 🔴 LOT CT — « Mois | Période | Année » ; « Année » : `periode` = les 12 mois de l'année. */
  decoupage?: Decoupage;
  /** 🔴 LOT CU — de 2 à 5 négociateurs : leurs données une à une (le graphique, une série chacun) ; null : un seul ou « Tous » (l'écran d'avant). */
  series?: readonly { nom: string; couleur: number; d: DonneesSociete }[] | null;
  /** 🔴 LOT CY — les négociateurs du filtre (dits en petit sur la tuile « Compromis en cours ») ; [] : « Tous ». */
  filtreNegociateurs?: readonly string[];
}) {
  // 🔴 LOT CP — en Période, chaque grandeur du mois devient la somme de ses mois (`periodeMois` : les fonctions du mois, mois après mois).
  const nommer = useNommer(); // 🔴 LOT CQ — le compteur de l'Espace compte des PERSONNES
  const enPeriode = periode !== null;
  const enAnnee = decoupage === 'annee';
  const moisSeul = !enPeriode && !enAnnee; // 🔴 LOT DE — le mode « Mois »
  // 🔴 LOT DC (Arno) — de 2 à 5 négociateurs : les tuiles comparent la SÉLECTION (`d` filtrées : chaque affaire une fois) à la même sélection
  // l'année précédente — la mention « comparaison N−1 : choisir un seul négociateur » (lot CU) est retirée (accord d'Arno).
  const ms: readonly MoisChoisi[] = periode ?? [{ annee, mois }];
  const anneesP = [...new Set(ms.map((m) => m.annee))];
  const moisPeriodeAnnee = ms.filter((m) => m.annee === annee).map((m) => m.mois);
  // 🔴 LOT BU — la fiche d'une vente dépliée dans les listes du mois : LA fiche de l'onglet « Compromis » (`DetailAffaire`, `DetailMiroir`), son
  // hôte (les mêmes fenêtres), et l'unité « HT | TTC » retenue par le navigateur (celle du sélecteur de l'onglet « Compromis »).
  const U = useUnite();
  // 🔴 LOT CE — les colonnes des lignes de négociateur, communes aux deux listes (ventes et compromis du mois).
  const listes = useRef<HTMLDivElement | null>(null);
  useColonnesNegociateurs(listes);
  const refs: References = references ?? { lotD: false, negociateurs: [], apporteurs: [], personnes: [] };
  const { hote, fenetres } = useHoteAffaires({ d: { ...refs, disponible: tout.disponible && references !== null, aujourdhui: tout.aujourdhui }, vue: d.societe, societe: d.societe ?? 'tous',
    statutDuLibelle: resolveurDe(d.statutsNegociateurs), relire: onRelire, ventes: tout.ventes });
  const fiches = { hote, references: refs };
  const cons = useConsolide(); // 🔴 LOT DO — FUSION : les intitulés consolidés
  const M = consoliderMots(cons, motsEnUnite(MOTS_MODE[mode], U.MOT));
  // Le mode change ce qu'on additionne (vendu, compromis à leur date, ou les deux), jamais comment (`caHt`, `totaux`).
  const T = enPeriode ? totauxPeriode(d, ms, mode, jour) : totauxMoisMode(d, annee, mois, mode, jour);
  const T1 = enPeriode ? totauxPeriode(d, unAnPlusTot(ms), mode, jour) : totauxMoisMode(d, annee - 1, mois, mode, jour);
  // 🔴 LOT CP — les montants décimaux (HT sans arrondi) que l'écran montre : en Période, la somme de ce que chaque mois affiche, au centime.
  const T1parMois = enPeriode ? unAnPlusTot(ms).map((m) => totauxMoisMode(d, m.annee, m.mois, mode, jour)) : [];
  const TparMois = enPeriode ? ms.map((m) => totauxMoisMode(d, m.annee, m.mois, mode, jour)) : [];
  const n1CaAffiche = enPeriode ? sommeDesMoisAffiches(T1parMois.map((t) => t.caHt)) : null;
  const n1Ca = n1CaAffiche === null ? U.e(T1.caHt) : eur(U.u === 'ht' ? n1CaAffiche.ht : n1CaAffiche.ttc);
  const nonDeduits: NonDeduitsMontants = !enPeriode ? T : (() => {
    const i = sommeDesMoisAffiches(TparMois.map((t) => t.internesHt)); const r = sommeDesMoisAffiches(TparMois.map((t) => t.aRenseignerHt));
    return { internesHt: i.ht, internesTtc: i.ttc, aRenseignerHt: r.ht, aRenseignerTtc: r.ttc };
  })();
  const parMois = caHtParMoisMode(d.ventes, annee, d.societe, mode, jour);
  const parMoisN1 = caHtParMoisMode(d.ventes, annee - 1, d.societe, mode, jour);
  // 🔴 LOT DC — plusieurs négociateurs : « N−1 non importé » se juge sur TOUTES les données (une personne sans activité l'année précédente compte
  // pour 0 dans la sélection) ; un seul négociateur ou « Tous » : comme avant, à l'identique.
  const baseN1 = series !== null ? tout.ventes : d.ventes;
  const sansN1De = (a: number): boolean => sansN1Pour(baseN1, a, mode);
  const sansN1 = sansN1De(annee);
  const motSansN1De = (a: number): string => motSansN1Pour(a, mode);
  const motSansN1 = motSansN1De(annee);
  // 🔴 LOT CP — la comparaison N−1 de la période : les MÊMES mois, un an plus tôt (une année sans données N−1 : dite comme en Mensuel).
  const anneeSansN1P = anneesP.find(sansN1De) ?? null;
  const sansN1P = enPeriode ? anneeSansN1P !== null : sansN1;
  const motSansN1P = enPeriode ? (anneeSansN1P === null ? '' : motSansN1De(anneeSansN1P)) : motSansN1;
  const enN1 = enPeriode && anneesP.length > 1 ? 'sur les mêmes mois, un an plus tôt' : `en ${(enPeriode ? anneesP[0] : annee) - 1}`;
  const cumulN = cumuler(parMois);
  const cumulN1 = cumuler(parMoisN1);
  const ventes = enPeriode ? ventesPeriode(d.ventes, ms) : ventesDuMois(d.ventes, annee, mois);
  // 🔴 LOT BT — « vendu + compromis » : seulement les compromis pas encore passés en acte (une affaire signée est déjà dans les ventes).
  const compDuMois = enPeriode ? compromisPeriode(d.ventes, ms, mode, jour) : compromisDuMode(d.ventes, annee, mois, mode, jour);
  const listeMode = mode === 'vendu' ? ventes : mode === 'compromis' ? compDuMois : [...ventes, ...compDuMois];
  const retros = enPeriode ? retrosPeriode(d.retrocessions, ms) : retrosDuMois(d.retrocessions, annee, mois);
  // 🔴 LOT CH (Arno) — le Résultat de l'agence = la SOMME DES CARTES affichées (`resultatDesCartes`, la fonction des cartes) ; les rétrocessions
  // rattachées à ces ventes (quel que soit leur mois de saisie) y sont ; celles saisies ce mois sans vente affichée sont dites à part (orange).
  const Rc = resultatDesCartes(listeMode, d.societe, { retros: tout.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) });
  const retrosLiees = d.retrocessions.filter((r) => r.venteId !== null && Rc.ids.includes(r.venteId));
  const horsResultat = retrosSansVenteAffichee(retros, Rc.ids);
  const retrosMode = retrosLiees;
  // 🔴 LOT CY (Arno) — « Compromis en cours » : la règle unique (`compromisEnCours`, `totalCompromisEnCours`) — tous les compromis non actés de la
  // société, quels que soient leur mois ou leur année, dates absentes comprises ; le même chiffre que l'onglet « Compromis » (« En cours »).
  // Ne dépend ni du mois, ni de l'année, ni de la période : seulement du filtre « Négociateur » (`d` filtrées) et de « HT | TTC ».
  const comp = compromisEnCours(d.ventes, d.societe);
  const cec = totalCompromisEnCours(d.ventes, d.societe, resolveurDe(d.statutsNegociateurs));
  // 🔴 LOT DA — la 4ᵉ tuile. « Vendu » : le CA net (`caNetParMoisMode`, lot CW) des ventes signées de janvier au mois de la 3ᵉ tuile, et N−1 sur
  // les mêmes mois ; « Vendu + compromis » : le prévisionnel du CA net (lot DR, ci-dessous) — une affaire en compromis n'est pas actée : jamais
  // comptée deux fois.
  const sommeC = (xs: readonly MontantC[]): MontantC => xs.reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });
  const optsTuile = { retros: tout.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
  // 🔴 LOT DN (Arno) — la borne de fin du cumul (`borneCumul`, la fonction unique) : « Mois » → le mois choisi ; « Période » → le dernier mois
  // choisi ; « Année » → l'année complète (année terminée) ou le mois en cours — jamais le mois de l'adresse. N−1 : la même borne.
  const borne = borneCumul(decoupage, annee, mois, moisPeriodeAnnee, jour);
  const fin = borne.fin;
  const netCumul = mode !== 'compromis' ? sommeC(caNetParMoisMode(d.ventes, annee, d.societe, 'vendu', jour, optsTuile).slice(0, fin)) : { htC: 0, ttcC: 0 };
  const netCumulN1 = mode !== 'compromis' ? sommeC(caNetParMoisMode(d.ventes, annee - 1, d.societe, 'vendu', jour, optsTuile).slice(0, fin)) : { htC: 0, ttcC: 0 };
  // 🔴 LOT DR (changement autorisé par Arno) — « Vendu + compromis », 4ᵉ tuile : le prévisionnel du CA NET = le CA net de la tuile du mode Vendu
  // (`netCumul`) + le CA net (`caNetVente`, même définition, lot CW) des compromis en cours comptés dans l'année (règle du lot DQ). N−1 : idem.
  const compPrev = mode === 'tous' ? compromisDuMode(d.ventes, annee, null, 'tous', jour) : [];
  const netComp = sommeMontants(compPrev.map((v) => caNetVente(v, d.societe, optsTuile)));
  const netCompN1 = mode === 'tous' ? sommeMontants(compromisDuMode(d.ventes, annee - 1, null, 'tous', jour).map((v) => caNetVente(v, d.societe, optsTuile))) : { htC: 0, ttcC: 0 };
  const netPrev = sommeC([netCumul, netComp]);
  const netPrevN1 = sommeC([netCumulN1, netCompN1]);
  const idsVendusCumul = Array.from({ length: fin }, (_, i) => ventesDuMois(d.ventes, annee, i + 1)).flat().map((v) => v.id);
  const aConfirmer = ventesDeLAnnee(d.ventes, annee).filter(moisAConfirmer);
  const aRattacher = d.aRattacher.filter((x) => estChoisi(ms, { annee: x.annee, mois: x.mois }));
  const idsDuMois = (k: number): number[] => [...(mode === 'compromis' ? [] : ventesDuMois(d.ventes, annee, k)), ...compromisDuMode(d.ventes, annee, k, mode, jour)].map((v) => v.id);
  /** 🔴 LOT DA — un montant en centimes dans l'autre unité. */
  const enAutre = (m: MontantC): number => (U.u === 'ht' ? m.ttcC : m.htC) / 100;
  // 🔴 LOT CW — le CA NET de chaque mois, dans l'unité affichée (au centime, HT ou TTC, sans passer par HT × 1,2) ; « vendu » : la part du bas
  // de la barre empilée (Vendu + compromis). Calculé seulement dans l'onglet « CA net ».
  const enUnite = (m: MontantC): number => (U.u === 'ht' ? m.htC : m.ttcC) / 100;
  // 🔴 LOT CP — en Période : « Période : juillet, septembre 2026 (2 mois) » (ou « juillet → septembre 2026 » si les mois se suivent).
  // 🔴 LOT CT — en Année : « Année 2026 ».
  const nomPeriode = enAnnee ? String(annee) : libellePeriode(ms);
  const libMois = enAnnee ? `Année ${annee}` : enPeriode ? `Période : ${nomPeriode}` : `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`;
  const moisMot = enAnnee ? 'année' : enPeriode ? 'période' : NOMS_MOIS[mois - 1].toLowerCase();
  const duMois = enAnnee ? 'de l’année' : enPeriode ? 'de la période' : 'du mois';
  const surLaPeriode = enAnnee ? 'sur l’année' : 'sur la période';
  const ouvrir = (titre: string, ids: number[]) => () => onDetail({ titre, ids });
  return <>
    {/* 🔴 LOT CP — la ligne des mois et, à droite, « Mensuel | Période » (au téléphone : au-dessus, à droite). En Période, chaque mois est un
        bouton à bascule : plusieurs mois soulignés, le dernier ne se retire pas. */}
    <LigneDesMois annee={annee} mois={mois} decoupage={decoupage} moisChoisis={enPeriode ? moisPeriodeAnnee : null} onMois={onMois} onDecoupage={onDecoupage} />
    {/* 🔴 LOT CQ — la ligne « Période : … » sous les mois est RETIRÉE (accord d'Arno) : les titres des blocs disent la période. Reste le petit
        message du dernier mois, qui ne se retire pas. */}
    {enPeriode && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
    <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel ${duMois}`} data-mode-ecran={mode}>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${libMois}`, T.ids)} data-tuile="ca-mois">
        <span className="tdb-tuile-mot">{M.ca} — {moisMot}</span><strong className="tdb-tuile-valeur">{eur((U.u === 'ht' ? Rc.ca.htC : Rc.ca.ttcC) / 100)}</strong>
        {/* 🔴 LOT CH — le CA de la tuile = celui du Résultat (la somme des cartes, au centime). */}
        <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur((U.u === 'ht' ? Rc.ca.ttcC : Rc.ca.htC) / 100)}{ESPACE}{U.autre.mot})</small>
        <span className="tdb-tuile-n1" data-tuile-n1="ca">{sansN1P ? motSansN1P : `${n1Ca} ${enN1} (${signePct(variation(T.caHt, T1.caHt))})`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${libMois}`, T.ids)} data-tuile="ventes-mois">
        <span className="tdb-tuile-mot">{M.nombre} — {moisMot}</span><strong className="tdb-tuile-valeur">{T.nbVentes}</strong>
        <span className="tdb-tuile-n1" data-tuile-n1="nombre">{sansN1P ? motSansN1P : `${T1.nbVentes} ${enN1}`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${mode === 'vendu' ? 'CA' : M.ca.replace(` ${U.MOT}`, '')} cumulé ${annee} (${borne.mot})`, Array.from({ length: fin }, (_, i) => idsDuMois(i + 1)).flat())} data-tuile="cumul" data-borne-cumul={fin}>
        {/* 🔴 LOT DR (changement autorisé par Arno) — « Vendu + compromis » : « Prévisionnel CA 2026 (vendu + compromis) » ; montant et ligne du bas inchangés. */}
        <span className="tdb-tuile-mot">{mode === 'tous' ? <>Prévisionnel {cons('CA')} {annee} (vendu + compromis)<small> ({borne.mot})</small></> : <>{mode === 'vendu' ? cons(`CA ${U.MOT}`) : M.ca.replace(` ${U.MOT}`, '')} cumulé {annee} ({borne.mot})</>}</span><strong className="tdb-tuile-valeur">{U.e(cumulA(cumulN, fin))}</strong><Autre ht={cumulA(cumulN, fin)} />
        <span className="tdb-tuile-n1" data-tuile-n1="cumul">{sansN1 ? motSansN1 : `${U.e(cumulA(cumulN1, fin))} en ${annee - 1} (${signePct(variation(cumulA(cumulN, fin), cumulA(cumulN1, fin)))})`}</span></button></li>
      {/* 🔴 LOT DA (changement autorisé par Arno) — la 4ᵉ tuile suit « Compter » : Vendu → le CA net cumulé (même période que la 3ᵉ tuile) ;
          Compromis → les compromis en cours (inchangée) ; Vendu + compromis → le prévisionnel du CA net (lot DR). */}
      {mode === 'vendu' ? (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA net cumulé ${annee} (${borne.mot})`, idsVendusCumul)} data-tuile="ca-net-cumul">
          <span className="tdb-tuile-mot">{cons(`CA net ${U.MOT}`)} cumulé {annee} ({borne.mot})<small className="trx-tuile-filtre"> — après commissions, rétrocessions et reversé</small></span>
          <strong className="tdb-tuile-valeur" data-ca-net-cumul>{eur(enUnite(netCumul))}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(netCumul))}{ESPACE}{U.autre.mot})</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{sansN1 ? motSansN1 : `${eur(enUnite(netCumulN1))} en ${annee - 1} (${signePct(variation(netCumul.htC, netCumulN1.htC))})`}</span></button></li>
      ) : mode === 'compromis' ? (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir('Compromis en cours', cec.ids)} data-tuile="compromis">
          <TuileCompromisEnCours cec={cec} filtre={filtreNegociateurs} /></button></li>
      ) : (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(cons(`Prévisionnel du CA net ${annee}`), [...idsVendusCumul, ...compPrev.map((v) => v.id)])} data-tuile="previsionnel-net-mois">
          <span className="tdb-tuile-mot">{cons(`Prévisionnel du CA net ${annee}`)} <small>((vendu + compromis) − commissions versées ; vendu {borne.fin === 12 ? 'sur l’année complète' : borne.fin === 0 ? 'rien encore' : borne.mot}, {U.MOT})</small></span>
          <strong className="tdb-tuile-valeur" data-previsionnel-net>{eur(enUnite(netPrev))}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(netPrev))}{ESPACE}{U.autre.mot})</small>
          <span className="tdb-tuile-n1" data-previsionnel-detail>dont {eur(enUnite(netCumul))} vendus · {eur(enUnite(netComp))} en compromis ({compPrev.length})</span>
          <span className="tdb-tuile-n1" data-tuile-n1="previsionnel-net">{sansN1 ? motSansN1 : `${eur(enUnite(netPrevN1))} en ${annee - 1} (${signePct(variation(netPrev.htC, netPrevN1.htC))})`}</span></button></li>
      )}
    </ul>
    {/* 🔴 LOT CR (Arno) — la mention « N compromis sans date — non placés dans un mois » est RETIRÉE (accord d'Arno) : un compromis sans
        date n'a toujours pas de mois (jamais compté dans un mois) ; il reste visible dans l'onglet « Compromis », vue « En cours ». */}

    <GrapheMois d={d} tout={tout} annee={annee} mois={mois} jour={jour} mode={mode} series={series} onMois={onMois} moisSeul={moisSeul}
      periodeAnnee={enPeriode ? moisPeriodeAnnee : null} finPeriode={decoupage === 'periode' ? fin : null} />

    <div ref={listes} className="trx-listes-mois">
    {/* 🔴 LOT CA — l'en-tête : le titre puis le nombre « (3) » ; les ventes en CARTES (celles de l'onglet « Compromis »). */}
    {mode !== 'compromis' && <ListeCartesAffaires id="trx-ventes" bloc="ventes-mois" titre={`Les ventes ${duMois} — ${enPeriode ? nomPeriode : libMois}`} ventes={ventes}
      retros={tout.retrocessions} vide={enPeriode ? `Aucune vente ${surLaPeriode}.` : 'Aucune vente ce mois.'} motAucun="Aucune vente ne correspond." societe={d.societe}
      statutDuLibelle={resolveurDe(d.statutsNegociateurs)} fiches={fiches} />}
    {mode !== 'vendu' && <ListeCartesAffaires id="trx-compromis-mois" bloc="compromis-du-mois" titre={`${mode === 'tous' ? `Les compromis en cours ${duMois}` : `Les compromis ${duMois}`} — ${enPeriode ? nomPeriode : libMois}`}
      apres={<><small className="loc-muet">(date du compromis{mode === 'tous' ? ' ; pas encore signés' : ''})</small><MentionReportes ventes={compDuMois} jour={jour} /></>} ventes={compDuMois} retros={tout.retrocessions}
      vide={enPeriode ? `Aucun compromis signé ${surLaPeriode}.` : 'Aucun compromis signé ce mois.'} motAucun="Aucun compromis ne correspond." societe={d.societe}
      statutDuLibelle={resolveurDe(d.statutsNegociateurs)} fiches={fiches} />}
    </div>
    {fenetres}

    <section className="tdb-section" aria-labelledby="trx-resultat" data-bloc="resultat-mois">
      <h3 id="trx-resultat">Résultat de l’agence — {libMois}{mode === 'vendu' ? '' : <small className="loc-muet"> ({LIBELLE_MODE[mode].toLowerCase()})</small>}</h3>
      <dl className="trx-resultat">
        <LignesResultat R={Rc} T={nonDeduits} suffixe="mois" />
      </dl>
      {/* 🔴 LOT CH — la phrase « Les rétrocessions comptent sur le mois où elles sont saisies… » est retirée (accord d'Arno : plus vraie). */}
      <RetrosHorsResultat retros={horsResultat} ventes={tout.ventes} quand={enPeriode ? surLaPeriode : 'ce mois'} />
    </section>

    <BlocReplie id="trx-negos" section="negociateurs" titre={<>Espace par négociateur — {libMois}</>}
      resume={`${personnesNegociateurs(parNegociateur(listeMode, retrosMode, d.societe).map((l) => l.negociateur), nommer).length} négociateur(s)`} donnees={{ 'data-bloc': 'negociateurs-mois' }}>
      <TableNegociateurs lignes={parNegociateur(listeMode, retrosMode, d.societe, resolveurDe(d.statutsNegociateurs))}
        espace={espaceNegociateurs(listeMode, d.societe, { retros: tout.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) })} onDetail={onDetail} periode={libMois} />
    </BlocReplie>

    <section className="tdb-section" aria-labelledby="trx-apporteurs" data-bloc="apporteurs-mois">
      <h3 id="trx-apporteurs">{enAnnee ? `Apporteurs de l’année — ${annee}` : enPeriode ? `Apporteurs de la période — ${nomPeriode}` : `Apporteurs du mois — ${libMois}`} <span className="loc-pastille">{retros.length}</span></h3>
      <OutilRetrocessions retros={[...retros, ...retrosLiees.filter((r) => !retros.some((x) => x.id === r.id))]} ventes={tout.ventes} societe={d.societe} annee={annee} mois={mois} disponible={d.disponible} onRelire={onRelire} />
    </section>

    {aRattacher.length > 0 && (
      <section className="tdb-section" data-bloc="a-rattacher">
        <h3>Montants saisis sans vente — à rattacher <span className="loc-pastille">{aRattacher.length}</span></h3>
        <p className="loc-muet">Saisis en dur dans le fichier, sans vente derrière : montrés ici, jamais ajoutés au CA.</p>
        <TableARattacher lignes={aRattacher} />
      </section>
    )}

    <BlocReplie id="trx-compromis" section="compromis" titre={<>Compromis en cours</>} resume={`${cec.nb} · ${eur((U.u === 'ht' ? cec.htC : cec.ttcC) / 100)} ${U.MOT}`}
      donnees={{ 'data-bloc': 'compromis' }}>
      <TableVentes ventes={comp} retros={tout.retrocessions} onModifier={onEdition} vide="Aucun compromis en cours." societe={d.societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)} />
    </BlocReplie>
    <BlocReplie id="trx-confirmer" section="a-confirmer" titre={<>Ventes « mois à confirmer » — {annee}</>}
      resume={`${aConfirmer.length} · ${eur(sommeAffichee(aConfirmer.map((v) => U.en(caHt(v, d.societe)))))} ${U.MOT}`} donnees={{ 'data-bloc': 'mois-a-confirmer' }}>
      <p className="loc-muet">Aucune formule du fichier ne les place dans un mois : elles comptent dans l’année, dans aucun mois. « Modifier » leur donne leur mois.</p>
      <TableVentes ventes={aConfirmer} retros={tout.retrocessions} onModifier={onEdition} vide="Aucune." societe={d.societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)} />
    </BlocReplie>
  </>;
}

/** Les ventes, en tableau (en cartes au téléphone) : chaque ligne s'ouvre en modification. */
/** 🔴 LOT BU — le négociateur d'ENTRÉE (porteur du mandat, côté vendeurs) ; une vente importée sans entrée identifiée : le nom tel qu'importé. PUR. */
export function negociateurEntree(v: Vente): string {
  const e = v.dossier?.entree?.nom ?? v.repartition?.parties.find((p) => p.sorte === 'entree' || p.sorte === 'entree_sortie')?.negociateur ?? null;
  return e !== null && e.trim() !== '' ? e : negociateursDe(v).join(', ');
}

/**
 * 🔴 LOT BW (Arno) — UN MONTANT dans l'unité choisie (« HT | TTC », retenue, partagée avec l'onglet Compromis) — en grand, la marque `donnees`
 * dessus —, puis l'autre unité en petit entre parenthèses. `ht` : le montant de référence ; `ttc` : le TTC exact s'il est connu (sinon HT × 1,2).
 */
export function Mt({ ht: montantHt, ttc, donnees, classe, cout = false }: { ht: number; ttc?: number; donnees?: Record<string, string>; classe?: string;
  /** 🔴 LOT CG — un COÛT (rétrocessions, commissions) : les chiffres en rouge, le grand et le petit. */
  cout?: boolean }) {
  const u = useAffichage();
  const t = ttc ?? montantHt * TVA;
  const [grand, petit, motPetit] = u === 'ht' ? [montantHt, t, MOT_UNITE.ttc] : [t, montantHt, MOT_UNITE.ht];
  // 🔴 LOT CM — un coût nul en gris (la règle partagée `classeSens`).
  const couleur = cout ? classeSens('verse', montantHt, t) : '';
  return <span className={couleur ? `trx-mt-liste ${couleur}` : 'trx-mt-liste'} data-cout={cout ? '' : undefined}><span className="trx-mt-liste-grand"><span className={classe} {...donnees}>{eur(grand)}</span>{ESPACE}{MOT_UNITE[u]}</span> <small className="trx-montant-autre" data-montant-autre>({eur(petit)}{ESPACE}{motPetit})</small></span>;
}
/** 🔴 LOT BW — l'unité choisie pour « Le mois » / « L'année » : `en` passe un montant HT dans cette unité (× 1,2 en TTC, sans arrondi), `e` l'écrit. */
function useUnite() {
  const u = useAffichage();
  const f = u === 'ht' ? 1 : TVA;
  const autre: UniteAffichage = u === 'ht' ? 'ttc' : 'ht';
  return { u, f, MOT: MOT_UNITE[u], en: (x: number): number => x * f, e: (x: number): string => eur(x * f), autre: { mot: MOT_UNITE[autre], facteur: u === 'ht' ? TVA : 1 / TVA } };
}
/** 🔴 LOT BW — sous le montant d'une tuile : l'autre unité, en petit entre parenthèses. */
function Autre({ ht: montantHt }: { ht: number }) {
  const u = useAffichage();
  return <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(u === 'ht' ? montantHt * TVA : montantHt)}{ESPACE}{MOT_UNITE[u === 'ht' ? 'ttc' : 'ht']})</small>;
}
/** 🔴 LOT BW — les mots du mode dans l'unité choisie (« CA TTC des compromis »). PUR. */
/** 🔴 LOT DO — chaque mot passé par l'intitulé consolidé (page FUSION). */
const consoliderMots = <T extends Record<string, string>>(c: (t: string) => string, m: T): T => Object.fromEntries(Object.entries(m).map(([k, x]) => [k, c(x)])) as T;
const motsEnUnite = <T extends Record<string, string>>(m: T, mot: string): T => Object.fromEntries(Object.entries(m).map(([k, x]) => [k, x.replace('CA HT', `CA ${mot}`)])) as T;

/**
 * 🔴 LOT CH (Arno) — les lignes du « Résultat de l'agence » (Le mois) et du « Résumé » (L'année) : la SOMME DES CARTES (`resultatDesCartes`), en
 * HT et en TTC au centime ; les commissions non déduites (internes, à renseigner) à part, comme avant.
 */
function LignesResultat({ R: r, T, suffixe, apresCa }: { R: ResultatCartes; T: NonDeduitsMontants; suffixe: 'mois' | 'periode'; apresCa?: ReactNode }) {
  const MOT = MOT_UNITE[useAffichage()];
  const cons = useConsolide(); // 🔴 LOT DO — FUSION : « = Reste consolidé du groupe »
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  const non = (x: MontantC): boolean => x.htC !== 0 || x.ttcC !== 0;
  return <>
    <dt>{cons(`CA ${MOT}`)}</dt><dd><Mt {...m(r.ca)} donnees={{ [`data-ca-${suffixe}`]: '' }} /></dd>
    {apresCa}
    <dt>− Rétrocessions d’apporteurs ({MOT})</dt><dd><Mt {...m(r.retro)} cout donnees={{ [suffixe === 'mois' ? 'data-retro-resultat' : 'data-retro-periode']: '' }} /></dd>
    {non(r.interCabinet) && <><dt>− Inter-cabinet vers nos autres sociétés ({MOT})</dt><dd><Mt {...m(r.interCabinet)} donnees={{ [`data-inter-cabinet-${suffixe}`]: '' }} /></dd></>}
    {non(r.exterieur) && <><dt>− Inter-cabinet extérieur ({MOT})</dt><dd><Mt {...m(r.exterieur)} donnees={{ [`data-exterieur-${suffixe}`]: '' }} /></dd></>}
    <dt>− Commissions des négociateurs indépendants ({MOT})</dt><dd><Mt {...m(r.com)} cout donnees={{ [suffixe === 'mois' ? 'data-paye-deduite' : 'data-paye-deduite-periode']: '' }} /></dd>
    <dt className="trx-total">= {cons('Reste à l’agence')} ({MOT})</dt><dd className={`trx-total tdb-signe tdb-signe--${sensDe(r.reste.htC)}`}><Mt {...m(r.reste)} donnees={{ [suffixe === 'mois' ? 'data-reste-agence' : 'data-reste-agence-periode']: '' }} /></dd>
    <NonDeduits T={T} />
  </>;
}

/**
 * 🔴 LOT CH (Arno) — SOUS LE RÉSULTAT, EN ORANGE : les rétrocessions saisies sur la période mais rattachées à aucune vente affichée (« à répartir »,
 * ou une vente d'un autre mois) — non déduites du Résultat ; dépliable : apporteur, montant, vente rattachée (nom + mois) ou « à répartir », source.
 * Absente quand il n'y en a pas.
 */
function RetrosHorsResultat({ retros, ventes, quand }: { retros: readonly Retrocession[]; ventes: readonly Vente[]; quand: string }) {
  const [ouvert, setOuvert] = useState(false);
  const u = useAffichage();
  const nommer = useNommer();
  if (retros.length === 0) return null;
  const ttc = retros.reduce((t, r) => t + r.montantTtc, 0);
  const mt = (x: number): string => (u === 'ttc' ? `${eur(x)} TTC (${eur(x / TVA)} HT)` : `${eur(x / TVA)} HT (${eur(x)} TTC)`);
  return (
    <div className="trx-hors-resultat" data-retros-hors-resultat>
      <button type="button" className="trx-hors-tete" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)} data-ouvrir-hors-resultat>
        <span className="svv-triangle-boite" aria-hidden="true"><DessinTriangle ouvert={ouvert} /></span>
        <span>Rétrocessions saisies {quand}, sans vente affichée : <strong data-total-hors-resultat>{mt(ttc)}</strong></span>
      </button>
      <p className="trx-hors-mention">Non déduites ci-dessus — à rattacher à leur vente.</p>
      {ouvert && <ul className="trx-hors-liste">{retros.map((r) => {
        const v = r.venteId === null ? undefined : ventes.find((x) => x.id === r.venteId);
        return (
          <li key={r.id} data-retro-hors={r.id}>
            <span><strong>{r.apporteur ?? APPORTEUR_NON_NOMME}</strong> · {mt(r.montantTtc)} · {r.venteId === null ? 'à répartir'
              : `vente ${v === undefined ? `n° ${r.venteId}` : `${v.libelle}${v.mois === null ? ` (${v.annee})` : ` (${moisCourt(v.annee, v.mois)})`}`}`}</span>
            <span className="trx-source">{nommer(r.negociateur)} · saisie {moisCourt(r.annee, r.mois)}{r.sourceOnglet !== null ? ` · ${r.sourceOnglet} › ${r.sourceCellule ?? ''}` : ''}</span>
          </li>
        );
      })}</ul>}
    </div>
  );
}

function TableVentes({ ventes, retros, onModifier, vide, societe = null, statutDuLibelle }: { ventes: readonly Vente[]; retros: readonly Retrocession[]; onModifier: (v: Vente) => void; vide: string;
  /** LOT Q — le statut des négociateurs importés : le reste à l'agence ne déduit que la paye des indépendants. */
  statutDuLibelle?: StatutDuLibelle;
  /** LOT D — la société vue : la part d'une vente répartie s'affiche sous ses honoraires. */
  societe?: Societe | null }) {
  const u = useAffichage();
  const nommer = useNommer(); // 🔴 LOT CG — « Prénom NOM »
  const MOT = MOT_UNITE[u];
  if (ventes.length === 0) return <p className="loc-muet">{vide}</p>;
  /** Un montant HT de référence dans l'unité choisie (les phrases d'information). */
  const enU = (montantHt: number): string => eur(u === 'ht' ? montantHt : montantHt * TVA);
  return (
    <table className="tdb-table tdb-table--large" data-table-ventes>
      <thead><tr><th scope="col">Vendeur / acquéreur</th><th scope="col">Négociateur(s)</th><th scope="col">Honoraires</th>
        <th scope="col">Rétrocessions</th><th scope="col">Com négo</th><th scope="col">Reste agence {MOT}</th><th scope="col">Action</th></tr></thead>
      <tbody>
        {ventes.map((v) => {
          const reste = resteTtcDe(v, retros, statutDuLibelle, societe);
          const retro = retroTtcDe(v, retros);
          const paye = payeTtcDe(v, societe);
          const classes = payeParClasseTtc(v, statutDuLibelle, societe);
          const nd = classes.interne + classes.a_renseigner;
          return (
            <tr key={v.id} data-vente={v.id}>
              <th scope="row">{v.libelle}
                <span className="trx-pastilles">
                  {v.statut === 'compromis' && <span className="loc-pastille trx-pastille--orange">compromis</span>}
                  {moisAConfirmer(v) && <span className="loc-pastille trx-pastille--orange">mois à confirmer</span>}
                  {v.repartition != null && <span className="loc-pastille trx-pastille--verte" data-pastille-repartie>répartie</span>}
                  {v.miroir != null && <span className="loc-pastille trx-pastille--verte" data-pastille-miroir>inter-cabinet reçu</span>}
                  {v.origine === 'import' && <span className="loc-pastille" title={`${v.sourceFichier ?? ''} › ${v.sourceOnglet ?? ''} › ligne ${v.sourceLigne ?? ''}`}>import</span>}
                </span>
                {v.sourceOnglet !== null && <><br /><span className="trx-source">{v.sourceFichier} › {v.sourceOnglet} › ligne {v.sourceLigne}</span></>}
              </th>
              <td data-mot="Négociateur(s)">{negociateursDe(v).map(nommer).join(', ')}</td>
              <td data-mot="Honoraires"><Mt ht={ht(v.honorairesTtc)} ttc={v.honorairesTtc} donnees={{ 'data-honoraires-vente': '' }} />
                {/* 🔴 LOT R — la société porteuse encaisse le CA de la vente ; dont reversé en inter-cabinet (autre société, extérieur). */}
                {v.repartition != null && (() => { const b = bilanVente(v, societe); const verse = sommeSocietes(b.verseHt) + b.exterieurHt;
                  return <><br /><span className="trx-source" data-part-vente>CA de la vente{societe === null ? '' : ` (${LIBELLE_SOCIETE[societe]})`} : {enU(b.caHt)}{verse > 0 ? ` · dont reversé en inter-cabinet : ${enU(verse)}` : ''}{b.neutraliseHt > 0 ? ` · inter-cabinet entre nos sociétés : ${enU(b.neutraliseHt)} (neutralisé)` : ''}</span></>; })()}</td>
              <td data-mot="Rétrocessions"><Mt ht={retro / TVA} ttc={retro} /></td>
              <td data-mot="Com négo"><Mt ht={paye / TVA} ttc={paye} />
                {nd > 0 && <><br /><span className={classes.a_renseigner > 0 ? 'trx-source trx-alerte' : 'trx-source'} data-paye-non-deduite={v.id}>dont {eur(u === 'ttc' ? nd : nd / TVA)} non déduite{classes.a_renseigner > 0 ? ' (statut à renseigner)' : ' (interne)'}</span></>}</td>
              <td data-mot={`Reste agence ${MOT}`}><Mt ht={reste / TVA} ttc={reste} donnees={{ 'data-reste-vente': '' }} /></td>
              <td data-mot="Action">{v.miroir != null
                ? <a className="trx-lien" href={adresseOrigine(v.miroir.porteuse, v.miroir.origineId)} data-voir-origine={v.miroir.origineId}>Voir la vente d’origine</a>
                : <button type="button" className="trx-bouton-lien" onClick={() => onModifier(v)} data-modifier-vente={v.id}>Modifier</button>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * ══ 🔴 LOT CA / CC (Arno) — « LES VENTES DU MOIS » / « LES COMPROMIS DU MOIS » : LES CARTES DE L'ONGLET « COMPROMIS » ═══════════════════════════════
 * Une seule esthétique : chaque vente est LA carte d'affaire repliée de l'onglet « Compromis » (`CarteAffaire` ; `CarteMiroir` pour une ligne
 * miroir) — le nom, adresse · date, puis une ligne par négociateur (lot CC : les montants des cadres de la fiche ; ici, en plus, les rétrocessions
 * saisies au mois et le statut des négociateurs importés). Un clic : la fiche (lot BU), inchangée.
 */
function CartesVentes({ ventes, retros, vide, societe, statutDuLibelle, fiches }: { ventes: readonly Vente[]; retros: readonly Retrocession[]; vide: string;
  /** null : la FUSION (les deux sociétés) — chaque carte porte l'étiquette de sa société. */
  societe: Societe | null; statutDuLibelle?: StatutDuLibelle; fiches: { hote: HoteDetail; references: References } }) {
  if (ventes.length === 0) return <p className="loc-muet">{vide}</p>;
  return (
    <ul className="trx-cartes" data-cartes-ventes>
      {ventes.map((v) => (v.miroir != null
        ? <CarteMiroir key={v.id} v={v} references={fiches.references} aujourdhui={fiches.hote.d.aujourdhui} disponible={fiches.hote.d.disponible && fiches.hote.d.lotD} onFait={fiches.hote.relire}
          statutDuLibelle={fiches.hote.statutDuLibelle} attributs={{ 'data-vente': String(v.id) }} />
        : <li key={v.id} data-vente={v.id}>
          <CarteAffaire v={v} aujourdhui={fiches.hote.d.aujourdhui} section="vente" donnees={{ 'data-carte-vente': String(v.id) }} vue={societe} retros={retros} statutDuLibelle={statutDuLibelle}>
            <DetailAffaire v={v} hote={fiches.hote} etiquettes retros={retros} />
          </CarteAffaire>
        </li>))}
    </ul>
  );
}

/**
 * 🔴 LOT DJ (Arno) — UNE LISTE DE CARTES de « Le mois » et « L'année » (ventes, compromis) : le titre, le compteur, le TRI discret (« Trier : … »,
 * le gabarit du lot CS ; retenu par le navigateur, partagé par les deux écrans et les deux sociétés), puis, à partir de 10 cartes, « Rechercher… »
 * (pendant la frappe ; « (3 sur 17) » ; la croix efface). Le tri et la recherche ne changent que les cartes montrées (`listeCartes`).
 */
function ListeCartesAffaires({ id, bloc, titre, apres, ventes, retros, vide, motAucun, societe, statutDuLibelle, fiches }: { id: string; bloc: string; titre: string;
  apres?: ReactNode; ventes: readonly Vente[]; retros: readonly Retrocession[]; vide: string; motAucun: string; societe: Societe | null; statutDuLibelle?: StatutDuLibelle;
  fiches: { hote: HoteDetail; references: References } }) {
  const u = useAffichage();
  const nommer = useNommer();
  const [tri, setTriEtat] = useState<TriListe>(() => { try { const x = window.localStorage.getItem(CLE_TRI_LISTE); return estTriListe(x) ? x : TRI_LISTE_DEFAUT; } catch { return TRI_LISTE_DEFAUT; } });
  const setTri = (x: string): void => { if (!estTriListe(x)) return; setTriEtat(x); try { window.localStorage.setItem(CLE_TRI_LISTE, x); } catch { /* préférence seulement */ } };
  const [recherche, setRecherche] = useState('');
  const titreDe = (v: Vente): string => (v.miroir != null ? v.libelle : carteCompromis(v, fiches.hote.d.aujourdhui).titre);
  const opts = { retros, statutDuLibelle };
  const avecRecherche = ventes.length >= SEUIL_RECHERCHE;
  const q = avecRecherche ? recherche.trim() : '';
  const montrees = q === '' ? ventes : ventes.filter((v) => correspond(ficheRecherche(v, { titre: titreDe(v), vue: societe, ...opts, nommer, apporteurs: fiches.references.apporteurs }), q));
  const triees = trierListe(montrees, tri, (v) => { const c = resultatDesCartes([v], societe, opts).ca; return u === 'ht' ? c.htC : c.ttcC; }, titreDe);
  return (
    <section className="tdb-section trx-liste-affaires" aria-labelledby={id} data-bloc={bloc}>
      <div className="trx-entete-gauche trx-entete-liste">
        <h3 id={id}>{titre}</h3>
        <span className="trx-compteur" data-compteur-liste>({q === '' ? ventes.length : `${triees.length} sur ${ventes.length}`})</span>
        {ventes.length > 0 && <div className="trx-tri-compromis trx-tri-liste" data-tri-liste={tri}><span className="trx-tri-mot" aria-hidden="true">Trier :</span>
          <ListeChoix options={TRIS_LISTE.map((x) => ({ id: x, libelle: LIBELLE_TRI_LISTE[x] }))} valeur={tri} vide={null} libelle={`Trier — ${titre}`}
            onChange={setTri} classe="trx-tri-champ" donnees={{ 'data-choix-tri-liste': '' }} /></div>}
        {apres}
        {avecRecherche && <div className="trx-recherche-liste">
          <input type="search" className="trx-recherche-champ" placeholder="Rechercher…" aria-label={`Rechercher — ${titre}`} value={recherche}
            onChange={(e) => setRecherche(e.target.value)} data-recherche-liste />
          {recherche !== '' && <button type="button" className="trx-recherche-effacer" aria-label="Effacer la recherche" onClick={() => setRecherche('')} data-effacer-recherche>×</button>}
        </div>}
      </div>
      {q !== '' && triees.length === 0 ? <p className="loc-muet" data-aucun-resultat>{motAucun}</p>
        : <CartesVentes ventes={triees} retros={retros} vide={vide} societe={societe} statutDuLibelle={statutDuLibelle} fiches={fiches} />}
    </section>
  );
}

/**
 * 🔴 LOT CL (Arno) — « ESPACE PAR NÉGOCIATEUR » : Négociateur · Statut · Ventes · CA généré · Com · Rétrocessions · CA net, dans l'unité choisie.
 * Les montants sont ceux de ses cartes (`espaceNegociateurs`) : CA généré (ses honoraires, sa part en entrée / sortie), Com (en rouge si
 * comptabilisée), Rétrocessions (en rouge), CA net = CA généré − Com comptabilisée − Rétrocessions = la somme des « reste » de ses cartes (en vert).
 * Une ligne de total ; son CA net = le Reste à l'agence du Résultat, au centime. (L'ancienne colonne « CA généré » — paye + part rattachée, lots
 * AY / BI — est remplacée, accord d'Arno.) Les libellés d'une même personne (« CEDRIC », « Cédric JULLIEN ») se regroupent sous son nom affiché.
 */
/**
 * 🔴 LOT CO (Arno) — TRI de l'Espace par négociateur sur « CA généré » ou « CA net » : 1er clic décroissant, puis croissant, et ainsi de suite ;
 * l'autre colonne repart en décroissant ; le dernier clic décide. Retenu pendant la visite (changement de mois, de mode, Le mois ↔ L'année),
 * perdu au rechargement : une variable du module, sans stockage. Rien cliqué : l'ordre par défaut.
 */
type ColonneTriEspace = 'ca' | 'net';
type TriEspace = { col: ColonneTriEspace; sens: 'desc' | 'asc' } | null;
let triEspaceRetenu: TriEspace = null;
/** Pour les tests : l'ordre par défaut (comme au rechargement). */
export function oublierTriEspace(): void { triEspaceRetenu = null; }
function useTriEspace(): [TriEspace, (col: ColonneTriEspace) => void] {
  const [tri, poser] = useState<TriEspace>(triEspaceRetenu);
  const trier = (col: ColonneTriEspace) => {
    const suivant: TriEspace = tri?.col === col ? { col, sens: tri.sens === 'desc' ? 'asc' : 'desc' } : { col, sens: 'desc' };
    triEspaceRetenu = suivant;
    poser(suivant);
  };
  return [tri, trier];
}

function TableNegociateurs({ lignes, espace, onDetail, periode }: { lignes: ReturnType<typeof parNegociateur>; espace: readonly LigneEspace[]; onDetail: (x: Detail) => void; periode: string }) {
  const unite = useAffichage();
  const MOT = MOT_UNITE[unite];
  const nommer = useNommer(); // 🔴 LOT CG — « Prénom NOM »
  const [tri, trier] = useTriEspace(); // 🔴 LOT CO
  if (espace.length === 0) return <p className="loc-muet">Aucune vente sur la période.</p>;
  const somme = (xs: readonly MontantC[]): MontantC => xs.reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });
  const nul = (x: MontantC): boolean => x.htC === 0 && x.ttcC === 0;
  const m = (x: MontantC) => ({ ht: x.htC / 100, ttc: x.ttcC / 100 });
  // regroupées par nom affiché (une personne, une ligne), dans l'ordre du CA généré
  const groupes = [...espace.reduce((acc, e) => {
    const cle = nommer(e.negociateur);
    const a = acc.get(cle);
    acc.set(cle, a === undefined ? { cle, libelles: [e.negociateur], ids: e.ids, ca: e.ca, com: e.com, comDeduite: e.comDeduite, retro: e.retro, net: e.net }
      : { cle, libelles: [...a.libelles, e.negociateur], ids: [...new Set([...a.ids, ...e.ids])], ca: somme([a.ca, e.ca]), com: somme([a.com, e.com]), comDeduite: somme([a.comDeduite, e.comDeduite]),
        retro: somme([a.retro, e.retro]), net: somme([a.net, e.net]) });
    return acc;
  }, new Map<string, { cle: string; libelles: string[]; ids: number[]; ca: MontantC; com: MontantC; comDeduite: MontantC; retro: MontantC; net: MontantC }>()).values()]
    .sort((a, b) => b.ca.htC - a.ca.htC || a.cle.localeCompare(b.cle, 'fr'));
  // 🔴 LOT CO (Arno) — le tri choisi (sinon l'ordre par défaut ci-dessus), sur les montants de l'unité affichée ; égalité → nom.
  const enCentimes = (x: MontantC): number => (unite === 'ht' ? x.htC : x.ttcC);
  const lignesTriees = tri === null ? groupes : [...groupes].sort((a, b) =>
    (tri.sens === 'desc' ? enCentimes(b[tri.col]) - enCentimes(a[tri.col]) : enCentimes(a[tri.col]) - enCentimes(b[tri.col])) || a.cle.localeCompare(b.cle, 'fr'));
  const total = { ca: somme(groupes.map((g) => g.ca)), com: somme(groupes.map((g) => g.com)), retro: somme(groupes.map((g) => g.retro)), net: somme(groupes.map((g) => g.net)) };
  const ariaSort = (col: ColonneTriEspace): 'ascending' | 'descending' | 'none' => (tri?.col !== col ? 'none' : tri.sens === 'desc' ? 'descending' : 'ascending');
  const bouton = (col: ColonneTriEspace, libelle: ReactNode, mobile = false) => (
    <button type="button" className="trx-tri" onClick={() => trier(col)} data-tri={col} {...(mobile ? { 'data-tri-mobile': col, 'aria-pressed': tri?.col === col } : {})}
      aria-label={`Trier par ${col === 'ca' ? `CA ${MOT} généré` : `CA net ${MOT}`}${tri?.col === col ? (tri.sens === 'desc' ? ' (décroissant)' : ' (croissant)') : ''}`}>
      <span>{libelle}</span>
      <span className="trx-tri-fleches" aria-hidden="true">
        <span className={tri?.col === col && tri.sens === 'asc' ? 'trx-tri-on' : undefined} data-fleche="asc">▲</span>
        <span className={tri?.col === col && tri.sens === 'desc' ? 'trx-tri-on' : undefined} data-fleche="desc">▼</span>
      </span>
    </button>
  );
  return (
    <>
    {/* 🔴 LOT CO — sur téléphone l'en-tête du tableau est replié en cartes : les deux tris restent visibles et touchables ici. */}
    <div className="trx-tri-mobile" role="group" aria-label="Trier l'espace par négociateur">{bouton('ca', <>CA {MOT} généré</>, true)}{bouton('net', <>CA net {MOT}</>, true)}</div>
    <table className="tdb-table tdb-table--large" data-table-negociateurs>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Statut</th><th scope="col">Ventes</th><th scope="col" aria-sort={ariaSort('ca')} data-entete-tri="ca">{bouton('ca', <>CA {MOT} généré</>)}</th><th scope="col">Com {MOT}</th>
        <th scope="col">Rétrocessions {MOT}</th><th scope="col" aria-sort={ariaSort('net')} data-entete-tri="net">{bouton('net', <>CA net {MOT}</>)}</th></tr></thead>
      <tbody>{lignesTriees.map((g) => {
        // LOT Q — son statut et ce que devient sa commission dans le reste à l'agence (le premier libellé qui en a un).
        const ls = lignes.filter((l) => g.libelles.includes(l.negociateur));
        const statut = ls.map((l) => l.statut).find((x) => x !== null) ?? null;
        const payeHt = ls.reduce((t, l) => t + l.payeHt, 0);
        return (
          <tr key={g.cle} data-negociateur={g.libelles[0]}>
            <th scope="row">{g.cle}</th>
            <td data-mot="Statut" data-statut-negociateur={g.libelles[0]} className={payeHt > 0 && classeCommission(statut) === 'a_renseigner' ? 'trx-alerte' : undefined}>{libelleStatut(statut)}
              {payeHt > 0 && <>{' — '}{classeCommission(statut) === 'independant' ? 'paye déduite' : classeCommission(statut) === 'interne' ? 'paye interne, non déduite' : 'paye non déduite'}</>}</td>
            <td data-mot="Ventes"><button type="button" className="tdb-chiffre" onClick={() => onDetail({ titre: `${g.cle} — ${periode}`, ids: g.ids })} disabled={g.ids.length === 0}>{g.ids.length}</button></td>
            <td data-mot={`CA ${MOT} généré`}><Mt {...m(g.ca)} donnees={{ 'data-ca-genere': g.libelles[0] }} /></td>
            <td data-mot={`Com ${MOT}`} className={nul(g.comDeduite) ? 'trx-espace-gris' : undefined}><Mt {...m(g.com)} cout={!nul(g.comDeduite)} donnees={{ 'data-com-espace': g.libelles[0] }} /></td>
            <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(g.retro)} cout donnees={{ 'data-retro-espace': g.libelles[0] }} /></td>
            <td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(g.net)} donnees={{ 'data-ca-net': g.libelles[0] }} /></td>
          </tr>
        );
      })}</tbody>
      <tfoot><tr className="trx-somme-ligne trx-espace-total" data-total-espace>
        <th scope="row">Total</th><td data-mot="Statut" /><td data-mot="Ventes">{new Set(groupes.flatMap((g) => g.ids)).size}</td>
        <td data-mot={`CA ${MOT} généré`}><Mt {...m(total.ca)} donnees={{ 'data-total-ca-genere': '' }} /></td>
        <td data-mot={`Com ${MOT}`}><Mt {...m(total.com)} cout donnees={{ 'data-total-com': '' }} /></td>
        <td data-mot={`Rétrocessions ${MOT}`}><Mt {...m(total.retro)} cout donnees={{ 'data-total-retro': '' }} /></td>
        <td data-mot={`CA net ${MOT}`} className="trx-vert"><Mt {...m(total.net)} donnees={{ 'data-total-ca-net': '' }} /></td>
      </tr></tfoot>
    </table>
    </>
  );
}

function TableARattacher({ lignes }: { lignes: readonly CaARattacher[] }) {
  const nommer = useNommer(); // 🔴 LOT CG
  return (
    <table className="tdb-table tdb-table--large" data-table-a-rattacher>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Montant TTC</th><th scope="col">Origine</th></tr></thead>
      <tbody>{lignes.map((x) => (
        <tr key={x.id}><th scope="row">{nommer(x.negociateur)}</th><td data-mot="Montant TTC">{eur(x.montantTtc)}</td>
          <td data-mot="Origine">{x.libelle ?? ''} <span className="trx-source">{x.sourceOnglet} › {x.sourceCellule}</span></td></tr>
      ))}</tbody>
    </table>
  );
}

/**
 * 🔴 D5 — LE PETIT OUTIL DE RATTACHEMENT : chaque rétrocession du mois se rattache à la main à la bonne vente (celles du négociateur
 * et du mois d'abord), ou redevient « à répartir » ; réversible et journalisé (son historique, avec « Annuler »).
 */
function OutilRetrocessions({ retros, ventes, societe, annee, mois, disponible, onRelire, vide = 'Aucune rétrocession ce mois.' }: {
  /** null : la FUSION — la saisie d'une rétrocession demande d'abord sa société. */
  retros: readonly Retrocession[]; ventes: readonly Vente[]; societe: Societe | null; annee: number; mois: number; disponible: boolean; onRelire: () => void;
  /** 🔴 LOT DG — ce que dit la liste vide (« L'année » : « sur l'année »). */
  vide?: string;
}) {
  const [motif, setMotif] = useState<string | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  const [saisie, setSaisie] = useState(false);
  const nommer = useNommer(); // 🔴 LOT CG
  const parId = useMemo(() => new Map(ventes.map((v) => [v.id, v])), [ventes]);
  const rattacher = async (id: number, venteId: number | null): Promise<void> => {
    const r = await posterTransaction({ action: 'retro-rattacher', id, venteId });
    setMotif(r);
    if (r === null) onRelire();
  };
  const aRepartir = retros.filter((r) => r.venteId === null).length;
  return <>
    {aRepartir > 0 && <p className="loc-alerte loc-alerte--orange" role="status" data-a-repartir>{aRepartir} rétrocession(s) « à répartir » : rattachez-les à la vente qu’elles paient.</p>}
    {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
    {retros.length === 0 ? <p className="loc-muet">{vide}</p> : (
      <table className="tdb-table tdb-table--large" data-table-retrocessions>
        {/* 🔴 LOT CN (Arno) — le tableau parle des apporteurs : Apporteur · Négociateur · Montant TTC · Vente · Historique. */}
        <thead><tr><th scope="col">Apporteur</th><th scope="col">Négociateur</th><th scope="col">Montant TTC</th><th scope="col">Vente</th><th scope="col">Historique</th></tr></thead>
        <tbody>{retros.map((r) => {
          const p = ventesProposees(r, ventes);
          const options = [...p.duMois, ...p.autres].map((v) => ({ id: v.id, libelle: `${v.libelle} — ${eur(v.honorairesTtc)} TTC${v.mois === null ? ` (${v.annee})` : ` (${moisCourt(v.annee, v.mois)})`}` }));
          return (
            <tr key={r.id} data-retrocession={r.id}>
              <th scope="row" data-apporteur-retro={r.id}>{(() => { const a = r.apporteur ?? (r.venteId !== null ? parId.get(r.venteId)?.apporteur : null);
                return a ? a : <span className="loc-muet trx-apporteur-non-nomme">{APPORTEUR_NON_NOMME}</span>; })()}</th>
              <td data-mot="Négociateur" className="trx-retro-negociateur" data-negociateur-retro={r.id}><span className="trx-retro-nego-pile"><span>{nommer(r.negociateur)}</span>
                {r.sourceCellule !== null && <span className="trx-source">{r.sourceOnglet} › {r.sourceCellule}{r.libelle ? ` · ${r.libelle}` : ''}</span>}</span></td>
              <td data-mot="Montant TTC">{eur(r.montantTtc)}</td>
              <td data-mot="Vente">
                <ListeChoix options={options} valeur={r.venteId === null ? '' : String(r.venteId)} vide="À répartir" libelle={`Vente de la rétrocession de ${eur(r.montantTtc)}`}
                  desactive={!disponible} onChange={(v) => void rattacher(r.id, v === '' ? null : Number(v))} donnees={{ 'data-rattacher': String(r.id) }} />
              </td>
              <td data-mot="Historique"><button type="button" className="trx-bouton-lien" onClick={() => setHistorique(historique === r.id ? null : r.id)}>{historique === r.id ? 'Masquer' : 'Voir'}</button></td>
            </tr>
          );
        })}</tbody>
      </table>
    )}
    {historique !== null && <Journal entite="retrocession" id={historique} onFait={onRelire} />}
    <p><button type="button" className="trx-bouton-lien" onClick={() => setSaisie((s) => !s)} disabled={!disponible} data-saisir-retro>+ Rétrocession</button></p>
    {saisie && <SaisieRetro societe={societe} annee={annee} mois={mois} onFait={() => { setSaisie(false); onRelire(); }} />}
  </>;
}

function SaisieRetro({ societe: societeVue, annee, mois, onFait }: { societe: Societe | null; annee: number; mois: number; onFait: () => void }) {
  // 🔴 LOT DM — sur la FUSION, la société de la rétrocession se choisit (CRITERIMMO par défaut)
  const [societe, setSociete] = useState<Societe>(societeVue ?? 'criterimmo');
  const [negociateur, setNegociateur] = useState('');
  const [montantTtc, setMontant] = useState('');
  const [apporteur, setApporteur] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const envoyer = async (): Promise<void> => {
    const r = await posterTransaction({ action: 'retro-saisir', retro: { societe, annee, mois, negociateur, montantTtc, apporteur, venteId: null } });
    if (r === null) onFait(); else setMotif(r);
  };
  return (
    <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void envoyer(); }} data-form-retro>
      {societeVue === null && <label>Société<select value={societe} onChange={(e) => setSociete(e.target.value as Societe)} data-societe-retro>
        {SOCIETES.map((x) => <option key={x} value={x}>{LIBELLE_SOCIETE[x]}</option>)}</select></label>}
      <label>Négociateur<input value={negociateur} onChange={(e) => setNegociateur(e.target.value)} required /></label>
      <label>Montant TTC<input value={montantTtc} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" required /></label>
      <label>Apporteur<input value={apporteur} onChange={(e) => setApporteur(e.target.value)} /></label>
      {motif !== null && <p className="trx-erreur trx-plein" role="alert">{motif}</p>}
      <div className="trx-actions trx-plein"><button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer (à répartir)</button></div>
    </form>
  );
}

// ── L'année ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ══ 🔴 LOT DG (Arno, 31/10/2026) — « L'ANNÉE » : LES MÉCANIQUES DE « LE MOIS », À L'ÉCHELLE DE L'ANNÉE ══════════════════════════════════════════
 * La ligne des années (une année, plusieurs cochées, ou toutes), les quatre tuiles (N−1, « à date », la 4ᵉ selon « Compter »), le graphique à deux
 * échelles (« Année par année » ; « Mois par mois » = le graphique de « Le mois », `GrapheMois`), puis les blocs de « Le mois » sur les années
 * choisies (cartes des ventes et des compromis, Résultat de l'agence, Espace par négociateur), « Toute l'histoire » (gardée, accord d'Arno), les
 * apporteurs (le tableau par apporteur puis la liste de « Le mois »). Une année = ses 12 mois + ses « mois à confirmer » (`periodeAnnees`).
 * Mêmes composants, mêmes fonctions : aucune règle de calcul ne change.
 */
export interface ChoixAnnees { decoupage: DecoupageAnnees; annees: number[]; annee: number }
const LIBELLE_DECOUPAGE_ANNEES: Record<DecoupageAnnees, string> = { annee: 'Année', periode: 'Période', tout: 'Tout' };
/** Le nom des années choisies : « 2026 », « 2024 → 2026 » (qui se suivent), « 2022, 2024, 2026 », « Tout (2019 → 2026) ». PUR. */
export function libelleAnnees(c: Pick<ChoixAnnees, 'decoupage' | 'annees'>): string {
  const a = [...c.annees].sort((x, y) => x - y);
  if (a.length === 0) return '';
  const plage = a.length > 1 && a.every((x, k) => k === 0 || x === a[k - 1] + 1) ? `${a[0]} → ${a.at(-1)}` : a.join(', ');
  return c.decoupage === 'tout' ? `Tout (${plage})` : a.length === 1 ? String(a[0]) : plage;
}
const sommeMontants = (xs: readonly MontantC[]): MontantC => xs.reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });

/** 🔴 LOT DG — « Année par année » : un point par année ; Annuel (barres) / Cumul (courbe) ; CA | CA net | Nombre ; 2 à 5 négociateurs : une série chacun. */
function GrapheAnnees({ d, tout, annees, selection, annee, decoupage, jour, mode, series, onAnnee, entete, comparaison = null }: {
  d: DonneesSociete; tout: DonneesSociete; annees: readonly number[]; selection: readonly number[]; annee: number; decoupage: DecoupageAnnees; jour: string;
  mode: ModeMois; series: readonly { nom: string; couleur: number; d: DonneesSociete }[] | null; onAnnee: (a: number) => void; entete: ReactNode;
  /** 🔴 LOT DH — « Tout » : ce que dit l'encadré à la place de l'année précédente (« Toutes les années (2019 → 2026) ») ; null : la comparaison N−1. */
  comparaison?: string | null;
}) {
  const U = useUnite();
  const cons = useConsolide(); // 🔴 LOT DO — FUSION : les intitulés consolidés
  const M = consoliderMots(cons, motsEnUnite(MOTS_MODE[mode], U.MOT));
  const [cumul, setCumul] = useState(false);
  const [mesure, setMesure] = useState<MesureTrx>(() => (parametre('mesure') === 'nombre' ? 'nombre' : parametre('mesure') === 'net' ? 'net' : 'ca'));
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'ca' ? null : mesure }); }, [mesure]);
  const nombre = mesure === 'nombre';
  const net = mesure === 'net';
  const anneeEnCours = Number(jour.slice(0, 4));
  const opts = { retros: tout.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
  const enUnite = (m: MontantC): number => (U.u === 'ht' ? m.htC : m.ttcC) / 100;
  /** La valeur d'une année (la mesure affichée) : le CA des cartes, le CA net, ou le nombre ; `m` : le mode (« vendu » : la part du bas). */
  const valeur = (dx: DonneesSociete, a: number, m: ModeMois = mode): number => {
    const l = listeDesAnnees(dx.ventes, [a], m, jour);
    return nombre ? l.length : net ? enUnite(sommeMontants(l.map((v) => caNetVente(v, d.societe, opts)))) : enUnite(resultatDesCartes(l, d.societe, opts).ca);
  };
  const vals = annees.map((a) => valeur(d, a));
  const valsN1 = annees.map((a) => valeur(d, a - 1));
  const nbs = annees.map((a) => listeDesAnnees(d.ventes, [a], mode, jour).length);
  const bas = mode === 'tous' ? annees.map((a) => valeur(d, a, 'vendu')) : vals;
  const dernier = annees.filter((a) => a <= anneeEnCours).length;
  const motGraphe = nombre ? M.onglet.toLowerCase() : net ? cons(`CA net ${U.MOT}`) : M.graphe;
  const presente = (a: number): boolean => annees.includes(a);
  const rang = (a: number): number => annees.indexOf(a);
  const parts = (vendu: number, total: number) => (mode === 'tous' ? { parts: [{ mot: 'Vendu', ca: vendu }, { mot: 'Compromis', ca: total - vendu }] } : {});
  const cumule = (xs: readonly number[], k: number): number => xs.slice(0, k + 1).reduce((t, x) => t + x, 0);
  /** L'encadré d'une année (ou du cumul jusqu'à elle) : l'année, puis l'année d'avant. */
  // 🔴 LOT DQ / DR — la mention de l'année en cours (« Vendu + compromis » et « Compromis »)
  const nbReportesAn = mode !== 'vendu' ? compromisReportes(compromisDuMode(d.ventes, anneeEnCours, null, mode, jour), jour).length : 0;
  const info = (a: number, enCumul: boolean): InfoBarre => {
    const note = nbReportesAn > 0 && (enCumul ? a >= anneeEnCours : a === anneeEnCours) ? mentionReportes(nbReportesAn) : null;
    const i = infoSansNote(a, enCumul);
    return note === null ? i : { ...i, note };
  };
  const infoSansNote = (a: number, enCumul: boolean): InfoBarre => {
    const k = rang(a);
    const titre = enCumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === anneeEnCours ? ' — en cours' : ''}`;
    const v = enCumul ? cumule(vals, k) : vals[k]; const vb = enCumul ? cumule(bas, k) : bas[k];
    const avant = comparaison === null && presente(a - 1);
    const v1 = avant ? (enCumul ? cumule(vals, k - 1) : vals[k - 1]) : 0; const vb1 = avant ? (enCumul ? cumule(bas, k - 1) : bas[k - 1]) : 0;
    const nb = enCumul ? cumule(nbs, k) : nbs[k]; const nb1 = avant ? (enCumul ? cumule(nbs, k - 1) : nbs[k - 1]) : 0;
    const sansN1 = comparaison ?? `${a - 1} : non importé`;
    if (nombre) return { titre, compte: enCumul ? `${M.compte} (cumul)` : M.compte, sansN1, courant: { libelle: String(a), ca: v, nb: null, ...parts(vb, v) },
      precedent: avant ? { libelle: String(a - 1), ca: v1, nb: null, ...parts(vb1, v1) } : null };
    return { titre, motNb: M.compte, motCa: cons(net ? `CA net ${U.MOT}` : `CA ${U.MOT}`), autre: U.autre, sansN1, courant: { libelle: String(a), ca: v, nb, ...parts(vb, v) },
      precedent: avant ? { libelle: String(a - 1), ca: v1, nb: nb1, ...parts(vb1, v1) } : null };
  };
  const enPeriode = decoupage === 'periode';
  return (
    <section className="tdb-section" aria-labelledby="trx-annees" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees"
      {...(enPeriode ? { 'data-periode-annees': selection.join(',') } : {})}>
      {/* En Période : les années choisies surlignées (rouge), les autres atténuées — la règle de « Le mois » en Période. */}
      {enPeriode && <style>{`[data-periode-annees] g[data-barre-annee]{opacity:.35}${selection.map((a) => `[data-periode-annees] g[data-barre-annee="${a}"]{opacity:1}[data-periode-annees] g[data-barre-annee="${a}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<MesureTrx> id="trx-annees" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Annuel"
        mesures={[{ cle: 'ca', mot: cons('CA') }, { cle: 'net', mot: cons('CA net') }, { cle: 'nombre', mot: M.onglet }]}
        titre={<>Année par année <small className="loc-muet">({motGraphe}{cumul ? `, cumulé depuis ${annees[0]}` : ''} ; une année s’ouvre d’un clic)</small></>} />
      {entete}
      {series !== null ? (
        <GrapheNegociateurs series={series.map((x) => ({ nom: x.nom, couleur: x.couleur, nb: annees.map((a) => listeDesAnnees(x.d.ventes, [a], mode, jour).length), ca: annees.map((a) => valeur(x.d, a)) }))}
          total={{ ca: vals, nb: nbs }} totalN1={comparaison !== null ? null : { ca: valsN1, nb: annees.map((a) => listeDesAnnees(d.ventes, [a - 1], mode, jour).length), annee: annee - 1 }}
          cumul={cumul} nombre={nombre} dernierMois={dernier} annee={annee} choisi={rang(annee) + 1} onChoisir={(r) => onAnnee(annees[r - 1])}
          motCa={cons(net ? `CA net ${U.MOT}` : `CA ${U.MOT}`)} motNb={M.compte} aria={`${motGraphe}${cumul ? ' cumulé' : ''} par année, un négociateur par série`}
          axe={{ etiquettes: annees.map(String), cles: annees, attribut: 'data-barre-annee', libelleN1: (r) => String(annees[r - 1] - 1), attenuer: !enPeriode,
            titre: (r, c) => (c ? `Cumul ${annees[0]} → ${annees[r - 1]}` : String(annees[r - 1])) }} />
      ) : cumul ? (
        <CourbeCumul courant={cumuler(vals).slice(0, dernier)} n1={null} annee={annee} selection={annee} entier={nombre} aria={`${motGraphe} cumulé par année`}
          etiquettes={annees.map(String)} cles={annees} nom="annees-cumul" attributZone="data-annee-cumul" bulle={(a) => info(a, true)} onChoisir={onAnnee}
          legende={<><span className="tdb-legende tdb-legende--courant" /> cumul depuis {annees[0]}</>} />
      ) : (
        <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={onAnnee} entier={nombre} pasFixe={PAS_ANNEE_FIXE} aria={`${motGraphe} par année`}
          barres={annees.map((a, k) => ({ cle: a, libelle: String(a), valeur: a > anneeEnCours ? null : vals[k], info: info(a, false),
            ...(mode === 'tous' ? { empile: { bas: bas[k] } } : {}) }))} />
      )}
      {net && <p className="loc-muet trx-note-ca-net" data-note-ca-net>CA net : honoraires moins commissions des négociateurs (salariés compris), rétrocessions d’apporteurs et reversé inter-cabinet.</p>}
      {mode === 'tous' && !cumul && series === null && <p className="loc-muet trx-legende-empile" data-legende-empile>
        <span className="trx-pastille-empile trx-pastille-empile--bas" aria-hidden="true" /> vendu · <span className="trx-pastille-empile trx-pastille-empile--haut" aria-hidden="true" /> compromis (au-dessus)</p>}
    </section>
  );
}

function VueAnnee({ d, tout, annees, anneesHistoire, choix, refus, onAnnee, onAnneeSeule, onDecoupage, onOuvrirMois, jour, mode, onDetail, onEdition, onRelire, references, series = null, filtreNegociateurs = [] }: {
  d: DonneesSociete; tout: DonneesSociete; annees: readonly number[]; choix: ChoixAnnees; refus: boolean;
  /** 🔴 LOT DH — « Toute l'histoire » : toutes les années (la ligne et l'axe : celles qui ont une donnée comptée, `annees`). */
  anneesHistoire: readonly number[];
  /** Un clic sur une année (ligne des années, graphique) : Année → cette année ; Période → cochée / décochée ; Tout → la Période des autres. */
  onAnnee: (a: number) => void; onAnneeSeule: (a: number) => void; onDecoupage: (x: DecoupageAnnees) => void; onOuvrirMois: (a: number, m: number) => void;
  jour: string; mode: ModeMois; onDetail: (x: Detail) => void; onEdition: (v: Vente) => void; onRelire: () => void; references: References | null;
  series?: readonly { nom: string; couleur: number; d: DonneesSociete }[] | null; filtreNegociateurs?: readonly string[];
}) {
  const U = useUnite();
  const cons = useConsolide(); // 🔴 LOT DO — FUSION : les intitulés consolidés
  const M = consoliderMots(cons, motsEnUnite(MOTS_MODE[mode], U.MOT));
  const nommer = useNommer();
  const listes = useRef<HTMLDivElement | null>(null);
  useColonnesNegociateurs(listes);
  const refs: References = references ?? { lotD: false, negociateurs: [], apporteurs: [], personnes: [] };
  const { hote, fenetres } = useHoteAffaires({ d: { ...refs, disponible: tout.disponible && references !== null, aujourdhui: tout.aujourdhui }, vue: d.societe, societe: d.societe ?? 'tous',
    statutDuLibelle: resolveurDe(d.statutsNegociateurs), relire: onRelire, ventes: tout.ventes });
  const fiches = { hote, references: refs };
  const [echelle, setEchelle] = useState<'annees' | 'mois'>(() => (parametre('graphe') === 'mois' ? 'mois' : 'annees'));
  useEffect(() => { ecrireAdresse({ graphe: echelle === 'mois' ? 'mois' : null }); }, [echelle]);
  const { annee } = choix;
  // 🔴 LOT DH (Arno) — « Tout » : toutes les années montrées, sans année précédente (ni N−1, ni écart) ; les titres disent « toutes les années ».
  const enTout = choix.decoupage === 'tout';
  const sel = enTout ? [...annees] : [...choix.annees].sort((a, b) => a - b);
  const plage = `${annees[0]} → ${annees.at(-1)}`;
  const toutes = `Toutes les années (${plage})`;
  const sel1 = sel.map((a) => a - 1);
  const lib = enTout ? 'toutes les années' : libelleAnnees(choix);
  const statutDuLibelle = resolveurDe(d.statutsNegociateurs);
  const opts = { retros: tout.retrocessions, statutDuLibelle };
  const cartes = (vs: readonly Vente[]): ResultatCartes => resultatDesCartes(vs, d.societe, opts);
  const enUnite = (m: MontantC): number => (U.u === 'ht' ? m.htC : m.ttcC) / 100;
  const enAutre = (m: MontantC): number => (U.u === 'ht' ? m.ttcC : m.htC) / 100;
  // Ce que les années additionnent (les fonctions de « Le mois », mois après mois, + les « mois à confirmer »)
  const ventesSel = mode === 'compromis' ? [] : ventesDesAnnees(d.ventes, sel);
  const compSel = mode === 'vendu' ? [] : compromisDesAnnees(d.ventes, sel, mode, jour);
  const liste = [...ventesSel, ...compSel];
  const Rc = cartes(liste);
  const R1 = cartes(listeDesAnnees(d.ventes, sel1, mode, jour));
  const T = totauxDesAnnees(d, sel, mode, jour);
  const aConfirmer = aConfirmerDesAnnees(d.ventes, sel, mode);
  // N−1 : les mêmes années, un an plus tôt (plusieurs négociateurs : jugé sur toutes les données, lot DC)
  const baseN1 = series !== null ? tout.ventes : d.ventes;
  const anneeSansN1 = sel.find((a) => sansN1Pour(baseN1, a, mode));
  const sansN1 = anneeSansN1 !== undefined;
  const motSansN1 = anneeSansN1 === undefined ? '' : motSansN1Pour(anneeSansN1, mode);
  const enN1 = sel.length === 1 ? `en ${sel[0] - 1}` : 'un an plus tôt';
  // « À date » : l'année en cours jusqu'au mois d'aujourd'hui, une année passée complète ; N−1 sur les mêmes mois.
  const aDate = sel.flatMap((a) => listeADate(d.ventes, a, moisADate(a, jour), mode, jour));
  const aDateN1 = sel.flatMap((a) => listeADate(d.ventes, a - 1, moisADate(a, jour), mode, jour));
  const [Rd, Rd1] = [cartes(aDate), cartes(aDateN1)];
  // 🔴 LOT DN — la borne unique (`borneCumul`, « Année ») : année terminée = complète, année en cours = jusqu'au mois en cours.
  const motADate = sel.length > 1 ? '' : ` (${borneCumul('annee', annee, 0, null, jour).mot})`;
  // La 4ᵉ tuile (lot DA) : Vendu → le CA net des années ; Compromis → les compromis en cours ; Vendu + compromis → le prévisionnel du CA net (lot DR).
  const cec = totalCompromisEnCours(d.ventes, d.societe, statutDuLibelle);
  const netA = sommeMontants(ventesDesAnnees(d.ventes, sel).map((v) => caNetVente(v, d.societe, opts)));
  const netA1 = sommeMontants(ventesDesAnnees(d.ventes, sel1).map((v) => caNetVente(v, d.societe, opts)));
  // 🔴 LOT DR (changement autorisé par Arno) — « Vendu + compromis », 4ᵉ tuile : le CA net de la tuile du mode Vendu (`netA`) + le CA net des
  // compromis en cours comptés dans les années (`compSel`, règle du lot DQ), même définition (`caNetVente`, lot CW). N−1 : les mêmes années, un an plus tôt.
  const netComp = sommeMontants(compSel.map((v) => caNetVente(v, d.societe, opts)));
  const netComp1 = mode !== 'vendu' ? sommeMontants(compromisDesAnnees(d.ventes, sel1, mode, jour).map((v) => caNetVente(v, d.societe, opts))) : { htC: 0, ttcC: 0 };
  const netPrev = { htC: netA.htC + netComp.htC, ttcC: netA.ttcC + netComp.ttcC };
  const netPrev1 = { htC: netA1.htC + netComp1.htC, ttcC: netA1.ttcC + netComp1.ttcC };
  const ca = (m: MontantC): string => eur(enUnite(m));
  const pct = (a: MontantC, b: MontantC): string => signePct(variation(a.htC, b.htC));
  const ouvrir = (titre: string, ids: number[]) => () => onDetail({ titre, ids });
  // Les blocs : les rétrocessions saisies sur les années, celles liées aux ventes affichées
  const retrosSaisies = retrosDesAnnees(d.retrocessions, sel);
  const retrosLiees = d.retrocessions.filter((r) => r.venteId !== null && Rc.ids.includes(r.venteId));
  const horsResultat = retrosSansVenteAffichee(retrosSaisies, Rc.ids);
  const apporteurs = parApporteur([...retrosSaisies, ...retrosLiees.filter((r) => !retrosSaisies.some((x) => x.id === r.id))], d.ventes);
  const comp = compromisEnCours(d.ventes, d.societe);
  const aRattacher = d.aRattacher.filter((x) => sel.includes(x.annee));
  const surLaPeriode = sel.length === 1 ? 'sur l’année' : 'sur la période';
  // Toute l'histoire (gardée telle quelle, accord d'Arno) : chaque année, la règle du Résultat (rétrocessions et reste)
  const H = historique(d, anneesHistoire).map((h) => {
    const r = cartes(d.ventes.filter((v) => v.statut === 'vendue' && v.annee === h.annee && compteDansSociete(v)));
    return { ...h, retroHt: r.retro.htC / 100, resteHt: r.reste.htC / 100 };
  });
  const enPeriode = choix.decoupage === 'periode';
  const choixEchelle = (
    <div className="trx-unites trx-choix-echelle" role="group" aria-label="L’échelle du graphique" data-echelle-choix={echelle}>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'annees'} onClick={() => setEchelle('annees')} data-echelle="annees">Année par année</button>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'mois'} onClick={() => setEchelle('mois')} data-echelle="mois">Mois par mois — {annee}</button>
    </div>
  );
  return <>
    {/* La ligne des années (comme la ligne des mois) et, à droite, « Année | Période | Tout ». */}
    <LigneDesAnnees annees={annees} decoupage={choix.decoupage} annee={annee} choisies={sel} onAnnee={onAnnee} onDecoupage={onDecoupage} />
    {enPeriode && refus && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}

    <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${lib}`} data-mode-ecran={mode}>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${lib}`, Rc.ids)} data-tuile="ca-annee">
        {/* 🔴 LOT DS (changement autorisé par Arno) — « Compromis » : « CA brut des compromis — 2026 » ; montant et ligne du bas inchangés. */}
        <span className="tdb-tuile-mot">{mode === 'compromis' ? `CA brut des compromis — ${lib}` : `${M.ca} — ${lib}`}</span><strong className="tdb-tuile-valeur">{ca(Rc.ca)}</strong>
        <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(Rc.ca))}{ESPACE}{U.autre.mot})</small>
        <span className="tdb-tuile-n1" data-tuile-n1="ca">{enTout ? toutes : sansN1 ? motSansN1 : `${ca(R1.ca)} ${enN1} (${pct(Rc.ca, R1.ca)})`}</span></button></li>
      {/* 🔴 LOT DS (Arno) — « Compromis » : la 2ᵉ tuile = le CA des mêmes compromis − les commissions versées (`caNetVente`, la définition du « CA net
          des compromis » du lot DR = le « Solde net » de l'onglet Compromis), en vert ; N−1 sur la même définition. La tuile « … à date » est retirée
          de ce mode (accord d'Arno : elle répétait la 1ʳᵉ). */}
      {mode === 'compromis' && (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${cons('CA') === 'CA' ? 'CA net' : 'CA consolidé'} des compromis — ${lib}`, compSel.map((v) => v.id))} data-tuile="ca-net-compromis-annee">
          <span className="tdb-tuile-mot">{cons('CA') === 'CA' ? 'CA net' : 'CA consolidé'} des compromis — {lib}<small> (CA − commissions versées)</small></span>
          <strong className="tdb-tuile-valeur trx-vert" data-ca-net-compromis>{ca(netComp)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(netComp))}{ESPACE}{U.autre.mot})</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca-net-compromis">{enTout ? toutes : sansN1 ? motSansN1 : `${ca(netComp1)} ${enN1} (${pct(netComp, netComp1)})`}</span></button></li>
      )}
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${lib}`, Rc.ids)} data-tuile="ventes-annee">
        <span className="tdb-tuile-mot">{M.nombre} — {lib}</span><strong className="tdb-tuile-valeur">{liste.length}</strong>
        <span className="tdb-tuile-n1" data-tuile-n1="nombre">{enTout ? toutes : sansN1 ? motSansN1 : `${listeDesAnnees(d.ventes, sel1, mode, jour).length} ${enN1}`}</span></button></li>
      {mode !== 'compromis' && <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} à date — ${lib}`, aDate.map((v) => v.id))} data-tuile="ca-a-date">
        {/* 🔴 LOT DR (changement autorisé par Arno) — « Vendu + compromis » : « Prévisionnel CA 2026 (vendu + compromis) » ; montant et ligne du bas inchangés. */}
        <span className="tdb-tuile-mot">{mode === 'tous' ? <>Prévisionnel {cons('CA')} {lib} (vendu + compromis)<small>{enTout ? ' (à date)' : motADate}</small></> : enTout ? <>{M.ca} — à date (toutes les années)</> : <>{M.ca} — {lib} à date<small>{motADate}</small></>}</span><strong className="tdb-tuile-valeur">{ca(Rd.ca)}</strong>
        <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(Rd.ca))}{ESPACE}{U.autre.mot})</small>
        <span className="tdb-tuile-n1" data-tuile-n1="a-date">{enTout ? toutes : sansN1 ? motSansN1 : `${ca(Rd1.ca)} ${sel.length === 1 ? `en ${sel[0] - 1} à la même date` : 'un an plus tôt, à la même date'} (${pct(Rd.ca, Rd1.ca)})`}</span></button></li>}
      {mode === 'vendu' ? (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA net — ${lib}`, ventesSel.map((v) => v.id))} data-tuile="ca-net-annee">
          <span className="tdb-tuile-mot">{cons(`CA net ${U.MOT}`)} — {lib}<small className="trx-tuile-filtre"> — après commissions, rétrocessions et reversé</small></span>
          <strong className="tdb-tuile-valeur" data-ca-net-annee>{ca(netA)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(netA))}{ESPACE}{U.autre.mot})</small>
          <span className="tdb-tuile-n1" data-tuile-n1="ca-net">{enTout ? toutes : sansN1 ? motSansN1 : `${ca(netA1)} ${enN1} (${pct(netA, netA1)})`}</span></button></li>
      ) : mode === 'compromis' ? (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir('Compromis en cours', cec.ids)} data-tuile="compromis">
          <TuileCompromisEnCours cec={cec} filtre={filtreNegociateurs} /></button></li>
      ) : (
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(cons(`Prévisionnel du CA net ${lib}`), [...ventesSel.map((v) => v.id), ...compSel.map((v) => v.id)])} data-tuile="previsionnel-net-annee">
          <span className="tdb-tuile-mot">{cons(`Prévisionnel du CA net ${lib}`)} <small>((vendu + compromis) − commissions versées, {U.MOT})</small></span>
          <strong className="tdb-tuile-valeur" data-previsionnel-net>{ca(netPrev)}</strong>
          <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({eur(enAutre(netPrev))}{ESPACE}{U.autre.mot})</small>
          <span className="tdb-tuile-n1" data-previsionnel-detail>dont {ca(netA)} vendus · {ca(netComp)} en compromis ({compSel.length})</span>
          <span className="tdb-tuile-n1" data-tuile-n1="previsionnel-net">{enTout ? toutes : sansN1 ? motSansN1 : `${ca(netPrev1)} ${enN1} (${pct(netPrev, netPrev1)})`}</span></button></li>
      )}
    </ul>

    {echelle === 'annees'
      ? <GrapheAnnees d={d} tout={tout} annees={annees} selection={sel} comparaison={enTout ? toutes : null} annee={annee} decoupage={choix.decoupage} jour={jour} mode={mode} series={series} onAnnee={onAnnee} entete={choixEchelle} />
      : <GrapheMois d={d} tout={tout} annee={annee} mois={0} jour={jour} mode={mode} series={series} onMois={(m) => onOuvrirMois(annee, m)} moisSeul={false} periodeAnnee={null} entete={choixEchelle} />}

    <div ref={listes} className="trx-listes-mois">
      {mode !== 'compromis' && <ListeCartesAffaires id="trx-ventes-annee" bloc="ventes-annee" titre={enTout ? `Les ventes — toutes les années (${plage})` : `Les ventes de ${lib}`}
        ventes={ventesSel} retros={tout.retrocessions} vide={`Aucune vente ${surLaPeriode}.`} motAucun="Aucune vente ne correspond." societe={d.societe} statutDuLibelle={statutDuLibelle} fiches={fiches} />}
      {mode !== 'vendu' && <ListeCartesAffaires id="trx-compromis-annee" bloc="compromis-annee"
        titre={enTout ? (mode === 'tous' ? 'Les compromis en cours — toutes les années' : 'Les compromis — toutes les années') : mode === 'tous' ? `Les compromis en cours de ${lib}` : `Les compromis de ${lib}`}
        apres={<><small className="loc-muet">(date du compromis{mode === 'tous' ? ' ; pas encore signés' : ''})</small><MentionReportes ventes={compSel} jour={jour} /></>} ventes={compSel} retros={tout.retrocessions}
        vide={`Aucun compromis signé ${surLaPeriode}.`} motAucun="Aucun compromis ne correspond." societe={d.societe} statutDuLibelle={statutDuLibelle} fiches={fiches} />}
    </div>
    {fenetres}

    {/* L'ancien « Résumé » : le Résultat de l'agence (même composant que « Le mois ») ; ses lignes « Ventes », « dont mois à confirmer » et
        « Compromis en cours » sont gardées ; l'ancienne tuile « Reste à l'agence » y est (même chiffre). */}
    <section className="tdb-section" aria-labelledby="trx-resultat-annee" data-bloc="resume-periode">
      <h3 id="trx-resultat-annee">Résultat de l’agence — {lib}{mode === 'vendu' ? '' : <small className="loc-muet"> ({LIBELLE_MODE[mode].toLowerCase()})</small>}</h3>
      <dl className="trx-resultat">
        <dt>{M.nombre}</dt><dd>{liste.length}</dd>
        <LignesResultat R={Rc} T={T} suffixe="periode"
          apresCa={mode === 'compromis' ? undefined : <><dt>dont ventes « mois à confirmer »</dt><dd data-mois-a-confirmer-resultat>{ca(cartes(aConfirmer).ca)} ({aConfirmer.length})</dd></>} />
        <dt>Compromis en cours ({U.MOT})</dt><dd><Mt ht={cec.htC / 100} ttc={cec.ttcC / 100} donnees={{ 'data-compromis-en-cours-resume': '' }} /></dd>
      </dl>
      <RetrosHorsResultat retros={horsResultat} ventes={tout.ventes} quand={surLaPeriode} />
    </section>

    <BlocReplie id="trx-negos-annee" section="negociateurs" titre={<>Espace par négociateur — {lib}</>}
      resume={`${personnesNegociateurs(parNegociateur(liste, retrosLiees, d.societe).map((l) => l.negociateur), nommer).length} négociateur(s) · CA ${U.MOT} ${eur(enUnite(Rc.ca))}`} donnees={{ 'data-bloc': 'negociateurs-periode' }}>
      <TableNegociateurs lignes={parNegociateur(liste, retrosLiees, d.societe, statutDuLibelle)} espace={espaceNegociateurs(liste, d.societe, opts)} onDetail={onDetail} periode={lib} />
    </BlocReplie>

    <section className="tdb-section" aria-labelledby="trx-histoire" data-bloc="toute-histoire">
      <h3 id="trx-histoire">Toute l’histoire — {annees[0]} → {annees.at(-1)}</h3>
      <table className="tdb-table tdb-table--large" data-table-histoire>
        <thead><tr><th scope="col">Année</th><th scope="col">Ventes</th><th scope="col">CA {U.MOT}</th><th scope="col">dont mois à confirmer</th><th scope="col">Compromis {U.MOT}</th>
          <th scope="col">Rétrocessions {U.MOT}</th><th scope="col">Reste agence {U.MOT}</th><th scope="col">Paye non déduite {U.MOT}</th><th scope="col">Évolution du CA</th></tr></thead>
        <tbody>{H.map((h, i) => (
          <tr key={h.annee} className={sel.includes(h.annee) ? 'tdb-fort' : undefined} data-annee-histoire={h.annee}>
            <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => onAnneeSeule(h.annee)}>{h.annee}</button></th>
            <td data-mot="Ventes">{h.nbVentes}</td><td data-mot={`CA ${U.MOT}`}><Mt ht={h.caHt} /></td><td data-mot="dont mois à confirmer"><Mt ht={h.moisAConfirmerHt} /></td>
            <td data-mot={`Compromis ${U.MOT}`}><Mt ht={h.compromisHt} /></td><td data-mot={`Rétrocessions ${U.MOT}`}><Mt ht={h.retroHt} /></td><td data-mot={`Reste agence ${U.MOT}`}><Mt ht={h.resteHt} /></td>
            <td data-mot={`Paye non déduite ${U.MOT}`}><Mt ht={h.internesHt + h.aRenseignerHt} donnees={{ 'data-non-deduits-annee': String(h.annee) }} />{h.aRenseignerHt > 0 && <><br /><span className="trx-alerte">dont {U.e(h.aRenseignerHt)} à renseigner</span></>}</td>
            <td data-mot="Évolution du CA">{i === 0 ? '—' : signePct(variation(h.caHt, H[i - 1].caHt))}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>

    <section className="tdb-section" aria-labelledby="trx-apporteurs-annee" data-bloc="apporteurs-periode">
      <h3 id="trx-apporteurs-annee">{enTout ? 'Apporteurs' : sel.length > 1 ? 'Apporteurs des années' : 'Apporteurs de l’année'} — {lib} <span className="loc-pastille">{apporteurs.length}</span></h3>
      {apporteurs.length === 0 ? <p className="loc-muet">Aucune rétrocession sur la période.</p> : (
        <table className="tdb-table tdb-table--large" data-table-apporteurs>
          <thead><tr><th scope="col">Apporteur</th><th scope="col">Rétrocessions</th><th scope="col">Montant {U.MOT}</th><th scope="col">Ventes rattachées</th><th scope="col">CA apporté {U.MOT}</th><th scope="col">À répartir</th></tr></thead>
          <tbody>{apporteurs.map((a) => (
            <tr key={a.apporteur} data-apporteur={a.apporteur}>
              <th scope="row">{a.apporteur}</th><td data-mot="Rétrocessions">{a.nbRetrocessions}</td><td data-mot={`Montant ${U.MOT}`}><Mt ht={a.retroHt} /></td>
              <td data-mot="Ventes rattachées"><button type="button" className="tdb-chiffre" disabled={a.ventesIds.length === 0}
                onClick={() => onDetail({ titre: `Ventes apportées — ${a.apporteur}`, ids: a.ventesIds })}>{a.ventesIds.length}</button></td>
              <td data-mot={`CA apporté ${U.MOT}`}><Mt ht={a.caApporteHt} /></td><td data-mot="À répartir">{a.aRepartir}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="loc-muet">Les fichiers saisissent les rétrocessions par mois, sans nom d’apporteur : elles sont « {APPORTEUR_NON_NOMME} » tant que la vente rattachée ne nomme pas son apporteur.</p>
      <OutilRetrocessions retros={[...retrosSaisies, ...retrosLiees.filter((r) => !retrosSaisies.some((x) => x.id === r.id))]} ventes={tout.ventes} societe={d.societe}
        annee={annee} mois={Math.max(1, moisADate(annee, jour))} disponible={d.disponible} onRelire={onRelire} vide={`Aucune rétrocession ${surLaPeriode}.`} />
    </section>

    {aRattacher.length > 0 && (
      <section className="tdb-section" data-bloc="a-rattacher">
        <h3>Montants saisis sans vente — à rattacher <span className="loc-pastille">{aRattacher.length}</span></h3>
        <p className="loc-muet">Saisis en dur dans le fichier, sans vente derrière : montrés ici, jamais ajoutés au CA.</p>
        <TableARattacher lignes={aRattacher} />
      </section>
    )}

    <BlocReplie id="trx-compromis-annee-encours" section="compromis" titre={<>Compromis en cours</>} resume={`${cec.nb} · ${eur((U.u === 'ht' ? cec.htC : cec.ttcC) / 100)} ${U.MOT}`}
      donnees={{ 'data-bloc': 'compromis' }}>
      <TableVentes ventes={comp} retros={tout.retrocessions} onModifier={onEdition} vide="Aucun compromis en cours." societe={d.societe} statutDuLibelle={statutDuLibelle} />
    </BlocReplie>
    <BlocReplie id="trx-confirmer-annee" section="a-confirmer" titre={<>Ventes « mois à confirmer » — {lib}</>}
      resume={`${aConfirmerDesAnnees(d.ventes, sel).length} · ${ca(cartes(aConfirmerDesAnnees(d.ventes, sel)).ca)} ${U.MOT}`} donnees={{ 'data-bloc': 'mois-a-confirmer' }}>
      <p className="loc-muet">Aucune formule du fichier ne les place dans un mois : elles comptent dans l’année, dans aucun mois. « Modifier » leur donne leur mois.</p>
      <TableVentes ventes={aConfirmerDesAnnees(d.ventes, sel)} retros={tout.retrocessions} onModifier={onEdition} vide="Aucune." societe={d.societe} statutDuLibelle={statutDuLibelle} />
    </BlocReplie>
  </>;
}

/** La liste des ventes derrière un chiffre. */
function ListeVentes({ titre, ventes, retros, onFermer, onModifier, societe = null, statutDuLibelle }: { titre: string; ventes: readonly Vente[]; retros: readonly Retrocession[]; onFermer: () => void; onModifier: (v: Vente) => void;
  statutDuLibelle?: StatutDuLibelle;
  societe?: Societe | null }) {
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={titre} data-detail>
        <header className="tdb-fenetre-tete"><h3>{titre}</h3><button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer} autoFocus>×</button></header>
        <div className="tdb-fenetre-corps">
          <p className="loc-muet">{ventes.length} vente(s) · CA HT {eur(sommeAffichee(ventes.map((v) => caHt(v, societe))))}</p>
          <TableVentes ventes={ventes} retros={retros} onModifier={onModifier} vide="Aucune vente." societe={societe} statutDuLibelle={statutDuLibelle} />
        </div>
      </div>
    </div>
  );
}

// ── LOT C : les ventes notées chez les deux sociétés ─────────────────────────────────────────────────────────────────────

type NoteAffichee = { sourceFichier?: string | null; sourceOnglet?: string | null; sourceLigne?: number | null };
type NoteBloc = Pick<Vente, 'id' | 'societe' | 'statut' | 'annee' | 'mois' | 'honorairesTtc' | 'libelle' | 'double'> & NoteAffichee;

/**
 * 🔴 LOT C (Arno, 27/10/2026) — « VENTES À ATTRIBUER (N) » : la même vente notée chez CRITERIMMO ET chez MACJ. Tant qu'Arno n'a pas
 * choisi la société qui l'a facturée, elle n'entre dans le total d'AUCUNE des deux (le CA global la compte une fois, au plus bas des deux
 * montants) ; « Attribuer à … » la fait compter dans cette société seulement ; « Remettre à attribuer » défait (journalisé).
 */
export function BlocAAttribuer({ notes, disponible, onRelire }: { notes: readonly NoteBloc[]; disponible: boolean; onRelire: () => void }) {
  const [motif, setMotif] = useState<string | null>(null);
  const groupes = groupesDoubles(notes);
  if (groupes.length === 0) return null;
  const enAttente = groupes.filter((g) => g.attribuee === null);
  const faites = groupes.filter((g) => g.attribuee !== null);
  const attribuer = async (cle: string, societe: Societe | null): Promise<void> => {
    const r = await posterTransaction({ action: 'attribuer', cle, societe });
    setMotif(r);
    if (r === null) onRelire();
  };
  const ligne = (g: (typeof groupes)[number]) => (
    <li key={g.cle} className="tdb-section" data-groupe-double={g.cle} data-attribuee={g.attribuee ?? ''}>
      <p><strong>{g.annee}</strong> — {g.notes.map((n) => n.libelle).filter((x, i, t) => t.indexOf(x) === i).join(' / ')}
        {g.attribuee !== null && <span className="loc-pastille trx-pastille--verte trx-pastilles">attribuée à {LIBELLE_SOCIETE[g.attribuee]}</span>}</p>
      <ul className="trx-journal">
        {g.notes.map((n) => (
          <li key={n.id} data-note={n.id}>{LIBELLE_SOCIETE[n.societe]} : « {n.libelle} » {eur(n.honorairesTtc)} TTC
            {n.double?.attribution === 'ecartee' && <span className="loc-pastille trx-pastilles">écartée</span>}
            {n.sourceOnglet != null && <span className="trx-source"> · {n.sourceFichier} › {n.sourceOnglet} › ligne {n.sourceLigne}</span>}</li>
        ))}
      </ul>
      <p className="loc-muet">Compté au CA global : {eur(ht(g.retenuTtc))} HT {g.attribuee === null ? '(une fois, le plus bas des deux montants ; dans aucune société)' : `(${LIBELLE_SOCIETE[g.attribuee]} seulement)`}</p>
      <div className="trx-actions">
        {SOCIETES.filter((s) => g.notes.some((n) => n.societe === s) && g.attribuee !== s).map((s) => (
          <button key={s} type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible} onClick={() => void attribuer(g.cle, s)}
            data-attribuer={s}>Attribuer à {LIBELLE_SOCIETE[s]}</button>
        ))}
        {g.attribuee !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible} onClick={() => void attribuer(g.cle, null)}
          data-remettre-a-attribuer>Remettre à attribuer</button>}
      </div>
    </li>
  );
  // 🔴 LOT D (Arno, 27/10/2026) — UN SEUL BLOC REPLIÉ SUR UNE LIGNE, triangle à gauche (comme les autres blocs repliables du Suivi) ;
  // déplié : le contenu d'avant, inchangé.
  return (
    <BlocReplie id="trx-a-attribuer" section="a-attribuer" titre={<>Ventes à attribuer ({enAttente.length})</>} resume="" chevronAGauche triangle defilement={false}
      donnees={{ 'data-bloc': 'a-attribuer' }}>
      <p className="loc-muet">La même vente notée chez CRITERIMMO et chez MACJ : elle ne compte qu’une fois. Tant qu’elle n’est pas attribuée, elle n’entre dans le total d’aucune des deux sociétés.</p>
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      {enAttente.length === 0 ? <p className="loc-muet">Aucune vente en attente.</p> : <ul className="trx-journal">{enAttente.map(ligne)}</ul>}
      {faites.length > 0 && (
        <BlocReplie id="trx-attribuees" section="attribuees" titre={<>Déjà attribuées</>} resume={`${faites.length}`} chevronAGauche triangle donnees={{ 'data-bloc': 'attribuees' }}>
          <ul className="trx-journal">{faites.map(ligne)}</ul>
        </BlocReplie>
      )}
    </BlocReplie>
  );
}

// ── Le CA global ──────────────────────────────────────────────────────────────────────────────────────────────────────────

interface DonneesGlobal { disponible: boolean; aujourdhui: string; ventes: (EntreesGlobal['ventes'][number] & NoteAffichee)[]; gestion: GestionMois[]; location: Record<string, number> | null;
  /** 🔴 LOT CY — les compromis en cours (la règle unique, calculée par la route avec `totalCompromisEnCours`) : nos deux sociétés et chacune. */
  compromisEnCours?: CompromisEnCoursGlobal;
  /** 🔴 LOT GE3 — la migration 446 (coût MONGA) est appliquée ; absent ou faux : MONGA vaut 0 et ne se saisit pas. */
  monga?: boolean }
type CompromisEnCoursGlobal = Record<'tous' | Societe, TotalCompromisEnCours>;
/**
 * 🔴 LOT CY — le prévisionnel du CA global = les compromis EN COURS (la règle unique : tous, quel que soit leur mois ou leur année), en HT : chaque
 * société, et nos deux sociétés (chaque affaire une fois) ; l'inter-cabinet entre elles = ce qui est compté deux fois. Sans ces totaux (une base
 * d'avant) : le prévisionnel de l'année, comme avant. PUR.
 */
export function previsionnelEnCours(e: Pick<EntreesGlobal, 'ventes'>, annee: number, cec?: CompromisEnCoursGlobal): ReturnType<typeof previsionnel> {
  if (cec === undefined) return previsionnel(e, annee);
  const criterimmoHt = cec.criterimmo.htC / 100; const macjHt = cec.macj.htC / 100; const totalHt = cec.tous.htC / 100;
  return { criterimmoHt, macjHt, interCabinetHt: Math.round((criterimmoHt + macjHt - totalHt) * 100) / 100, totalHt };
}

export function EcranGlobal() {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesGlobal>('vue=global');
  const [annee, setAnnee] = useState(() => entier(parametre('annee'), 2000, 2100) ?? Number(jour.slice(0, 4)));
  // LOT D — « Compromis » (les deux sociétés réunies) avant le CA ; à l'ouverture, le CA comme avant.
  const [onglet, setOnglet] = useState<'compromis' | 'ca'>(() => (parametre('vue') === 'compromis' ? 'compromis' : 'ca'));
  useEffect(() => { ecrireAdresse({ annee: onglet === 'ca' ? String(annee) : null, vue: onglet === 'compromis' ? 'compromis' : null }); }, [annee, onglet]);
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const e: EntreesGlobal = { ventes: d.ventes, location: d.location, gestion: d.gestion };
  const annees = [...new Set([Number(jour.slice(0, 4)), ...d.ventes.map((v) => v.annee), ...d.gestion.map((g) => g.annee),
    ...Object.keys(d.location ?? {}).map((k) => Number(k.slice(0, 4)))])].sort((a, b) => a - b);
  const anneeEnCours = Number(jour.slice(0, 4));
  const dernierMois = annee < anneeEnCours ? 12 : annee > anneeEnCours ? 0 : Number(jour.slice(5, 7));
  const A = celluleGlobal(e, annee, null);
  const A1 = celluleGlobal(e, annee - 1, null);
  const P = previsionnelEnCours(e, annee, d.compromisEnCours); // 🔴 LOT CY — la règle unique
  const manque = (x: number | null): string => (x === null ? '—' : eur(x));
  const ventesSansMois = (s: Societe): number => d.ventes.filter((v) => v.statut === 'vendue' && v.annee === annee && v.mois === null && compteDansSociete({ double: v.double ?? null }))
    .reduce((t, v) => t + caHt(v, s), 0);
  // 🔴 LOT L — LA SYNTHÈSE PAR SOCIÉTÉ, puis le global : CRITERIMMO = vente + location + gestion ; MACJ = vente ; global = les deux
  // (+ les ventes à attribuer, comptées une fois dans aucune société). Face à N−1, prévisionnel des compromis compris.
  const synthese = syntheseGlobal(e, annee, d.compromisEnCours);
  return (
    <div className="tdb loc-page" data-ca-global>
      <style>{CSS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-migration>{SANS_MIGRATION}</p>}
      <div className="trx-vues" role="tablist" aria-label="Les compromis ou le CA">
        <button type="button" role="tab" className="tdb-onglet" aria-selected={onglet === 'compromis'} onClick={() => setOnglet('compromis')} data-vue="compromis">Compromis</button>
        <button type="button" role="tab" className="tdb-onglet" aria-selected={onglet === 'ca'} onClick={() => setOnglet('ca')} data-vue="ca">Le mois et l’année</button>
      </div>
      {onglet === 'compromis' ? <OngletCompromis societe="tous" /> : <>
      {d.location === null && <p className="loc-alerte" role="status" data-location-non-lue>La location n’a pas pu être lue dans le Suivi de la Location (migration 406 non appliquée) : elle est comptée « — ».</p>}
      <form className="tdb-filtres" aria-label="Année" onSubmit={(x) => x.preventDefault()}>
        <label className="tdb-champ">Année
          <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
            onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
      </form>
      <ul className="tdb-tuiles trx-tuiles-alignees" aria-label={`L’essentiel — ${annee}`}>
        <li><div className="tdb-tuile" data-tuile="global"><span className="tdb-tuile-mot">CA global HT ({annee})</span><strong className="tdb-tuile-valeur">{eur(A.totalHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.totalHt)} en {annee - 1} ({signePct(variation(A.totalHt, A1.totalHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="criterimmo"><span className="tdb-tuile-mot">CRITERIMMO HT <small>(vente + location + gestion)</small></span><strong className="tdb-tuile-valeur">{eur(A.criterimmoHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.criterimmoHt)} en {annee - 1} ({signePct(variation(A.criterimmoHt, A1.criterimmoHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="macj"><span className="tdb-tuile-mot">MACJ HT <small>(vente)</small></span><strong className="tdb-tuile-valeur">{eur(A.macjHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.macjHt)} en {annee - 1} ({signePct(variation(A.macjHt, A1.macjHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="previsionnel"><span className="tdb-tuile-mot">Prévisionnel HT <small>(compromis en cours{d.compromisEnCours === undefined ? ` ${annee}` : ''})</small></span><strong className="tdb-tuile-valeur">{eur(P.totalHt)}</strong>
          <span className="tdb-tuile-n1">CRITERIMMO {eur(P.criterimmoHt)} · MACJ {eur(P.macjHt)}{P.interCabinetHt > 0 ? ` · inter-cabinet entre nos sociétés : −${eur(P.interCabinetHt)} (neutralisé)` : ''}</span></div></li>
      </ul>

      <section className="tdb-section" aria-labelledby="trx-g-synthese" data-bloc="global-synthese">
        <h3 id="trx-g-synthese">Synthèse {annee} par société, puis le global <small className="loc-muet">(HT)</small></h3>
        <table className="tdb-table tdb-table--large" data-table-synthese>
          <thead><tr><th scope="col">Société</th><th scope="col">Vente</th><th scope="col">Location</th><th scope="col">Gestion</th><th scope="col">Total {annee}</th>
            <th scope="col">{annee - 1}</th><th scope="col">Écart</th><th scope="col">Prévisionnel</th></tr></thead>
          <tbody>
            {synthese.map((l) => (
              <tr key={l.cle} className={l.cle === 'global' ? 'tdb-fort' : undefined} data-synthese={l.cle}>
                <th scope="row">{l.libelle}</th>
                <td data-mot="Vente">{l.venteHt === null ? '—' : eur(l.venteHt)}</td><td data-mot="Location">{manque(l.locationHt)}</td><td data-mot="Gestion">{manque(l.gestionHt)}</td>
                <td data-mot={`Total ${annee}`} className="trx-total" data-synthese-total>{eur(l.totalHt)}</td><td data-mot={String(annee - 1)}>{eur(l.totalN1Ht)}</td>
                <td data-mot="Écart" className={`tdb-signe tdb-signe--${sensDe(l.totalHt - l.totalN1Ht)}`}>{`${ecartEur(l.totalHt - l.totalN1Ht)} (${signePct(variation(l.totalHt, l.totalN1Ht))})`}</td>
                <td data-mot="Prévisionnel">{l.previsionnelHt === null ? '—' : eur(l.previsionnelHt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tdb-section" aria-labelledby="trx-g-mois" data-bloc="global-mois">
        <h3 id="trx-g-mois">{annee} mois par mois <small className="loc-muet">(HT)</small></h3>
        {/* LOT L (Arno) — la saisie de la gestion du mois est DÉPLACÉE dans l'écran « Gestion » (même formulaire, mêmes données). */}
        <p className="loc-muet" data-lien-gestion>La gestion se saisit mois par mois dans l’écran <a className="trx-lien" href={`${ADRESSES_TRANSACTION.gestion}?annee=${annee}`}>Gestion</a>.</p>
        <table className="tdb-table tdb-table--large" data-table-global>
          <thead><tr><th scope="col">Mois</th><th scope="col">Vente CRITERIMMO</th><th scope="col">Vente MACJ</th><th scope="col">Location</th><th scope="col">Gestion</th>
            <th scope="col">Total</th><th scope="col">{annee - 1}</th><th scope="col">Écart</th></tr></thead>
          <tbody>
            {NOMS_MOIS.map((nom, i) => {
              const c = celluleGlobal(e, annee, i + 1);
              const c1 = celluleGlobal(e, annee - 1, i + 1);
              const aVenir = i + 1 > dernierMois;
              return (
                <tr key={nom} data-mois-global={i + 1}>
                  <th scope="row">{nom}</th>
                  <td data-mot="Vente CRITERIMMO">{eur(c.venteCriterimmoHt)}</td><td data-mot="Vente MACJ">{eur(c.venteMacjHt)}</td>
                  <td data-mot="Location">{manque(c.locationHt)}</td><td data-mot="Gestion">{manque(c.gestionHt)}</td>
                  <td data-mot="Total" className="trx-total">{aVenir && c.totalHt === 0 ? '—' : eur(c.totalHt)}</td>
                  <td data-mot={String(annee - 1)}>{eur(c1.totalHt)}</td>
                  <td data-mot="Écart" className={`tdb-signe tdb-signe--${sensDe(c.totalHt - c1.totalHt)}`}>{aVenir ? '—' : `${ecartEur(c.totalHt - c1.totalHt)} (${signePct(variation(c.totalHt, c1.totalHt))})`}</td>
                </tr>
              );
            })}
            {A.aAttribuerHt > 0 && (
              <tr data-a-attribuer-global><th scope="row">Ventes à attribuer <small className="loc-muet">(comptées une fois, dans aucune société)</small></th>
                <td data-mot="Vente CRITERIMMO">—</td><td data-mot="Vente MACJ">—</td><td data-mot="Location">—</td><td data-mot="Gestion">—</td>
                <td data-mot="Total">{eur(A.aAttribuerHt)}</td><td data-mot={String(annee - 1)}>—</td><td data-mot="Écart">—</td></tr>
            )}
            {A.interCabinetHt > 0 && (
              <tr data-inter-cabinet-global><th scope="row">Inter-cabinet entre nos sociétés <small className="loc-muet">(dans les deux ventes : retiré une fois, neutralisé)</small></th>
                <td data-mot="Vente CRITERIMMO">—</td><td data-mot="Vente MACJ">—</td><td data-mot="Location">—</td><td data-mot="Gestion">—</td>
                <td data-mot="Total">−{eur(A.interCabinetHt)}</td><td data-mot={String(annee - 1)}>—</td><td data-mot="Écart">—</td></tr>
            )}
            {A.exterieurHt > 0 && (
              <tr data-exterieur-global><th scope="row">Parts extérieures <small className="loc-muet">(inter-cabinet extérieur : dans le CA de la société porteuse du mandat, versé par elle)</small></th>
                <td data-mot="Vente CRITERIMMO">—</td><td data-mot="Vente MACJ">—</td><td data-mot="Location">—</td><td data-mot="Gestion">—</td>
                <td data-mot="Total">{eur(A.exterieurHt)} <small className="loc-muet">pour information</small></td><td data-mot={String(annee - 1)}>—</td><td data-mot="Écart">—</td></tr>
            )}
            {(ventesSansMois('criterimmo') > 0 || ventesSansMois('macj') > 0) && (
              <tr data-mois-a-confirmer><th scope="row">Mois à confirmer</th><td data-mot="Vente CRITERIMMO">{eur(ventesSansMois('criterimmo'))}</td>
                <td data-mot="Vente MACJ">{eur(ventesSansMois('macj'))}</td><td data-mot="Location">—</td><td data-mot="Gestion">—</td>
                <td data-mot="Total">{eur(ventesSansMois('criterimmo') + ventesSansMois('macj'))}</td><td data-mot={String(annee - 1)}>—</td><td data-mot="Écart">—</td></tr>
            )}
            <tr className="tdb-fort" data-total-annee><th scope="row">Année {annee}</th><td data-mot="Vente CRITERIMMO">{eur(A.venteCriterimmoHt)}</td><td data-mot="Vente MACJ">{eur(A.venteMacjHt)}</td>
              <td data-mot="Location">{manque(A.locationHt)}</td><td data-mot="Gestion">{manque(A.gestionHt)}</td><td data-mot="Total">{eur(A.totalHt)}</td>
              <td data-mot={String(annee - 1)}>{eur(A1.totalHt)}</td><td data-mot="Écart">{`${ecartEur(A.totalHt - A1.totalHt)} (${signePct(variation(A.totalHt, A1.totalHt))})`}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="tdb-section" aria-labelledby="trx-g-annees" data-bloc="global-annees">
        <h3 id="trx-g-annees">Année par année <small className="loc-muet">(HT ; réalisé et prévisionnel)</small></h3>
        <table className="tdb-table tdb-table--large" data-table-global-annees>
          <thead><tr><th scope="col">Année</th><th scope="col">Vente CRITERIMMO</th><th scope="col">Location</th><th scope="col">Gestion</th><th scope="col">Total CRITERIMMO</th>
            <th scope="col">Vente MACJ</th><th scope="col">À attribuer</th><th scope="col">Réalisé</th><th scope="col">Prévisionnel</th><th scope="col">Évolution</th></tr></thead>
          <tbody>{annees.map((a, i) => {
            const c = celluleGlobal(e, a, null);
            const prec = i === 0 ? null : celluleGlobal(e, annees[i - 1], null);
            return (
              <tr key={a} className={a === annee ? 'tdb-fort' : undefined} data-annee-global={a}>
                <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => setAnnee(a)}>{a}</button></th>
                <td data-mot="Vente CRITERIMMO">{eur(c.venteCriterimmoHt)}</td><td data-mot="Location">{manque(c.locationHt)}</td><td data-mot="Gestion">{manque(c.gestionHt)}</td>
                <td data-mot="Total CRITERIMMO">{eur(c.criterimmoHt)}</td><td data-mot="Vente MACJ">{eur(c.venteMacjHt)}</td><td data-mot="À attribuer">{eur(c.aAttribuerHt)}</td>
                <td data-mot="Réalisé" className="trx-total">{eur(c.totalHt)}</td><td data-mot="Prévisionnel">{eur(previsionnel(e, a).totalHt)}</td>
                <td data-mot="Évolution">{prec === null ? '—' : signePct(variation(c.totalHt, prec.totalHt))}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>

      {/* 🔴 LOT CX (Arno) — « Ventes à attribuer » en DERNIER, après tous les blocs ; replié, compteur, contenu et attribution inchangés. */}
      <BlocAAttribuer notes={d.ventes.filter((v) => v.double != null).map((v) => ({ ...v, id: v.id ?? 0, libelle: v.libelle ?? '', double: v.double ?? null }))}
        disponible={d.disponible} onRelire={relire} />
      </>}
    </div>
  );
}

/** Une ligne de la synthèse du CA global (HT) ; null : sans objet pour cette ligne (« — »). */
export interface LigneSynthese { cle: 'criterimmo' | 'macj' | 'a_attribuer' | 'inter_cabinet' | 'global'; libelle: string; venteHt: number | null; locationHt: number | null; gestionHt: number | null;
  totalHt: number; totalN1Ht: number; previsionnelHt: number | null }

/**
 * 🔴 LOT L — LA SYNTHÈSE DU CA GLOBAL : CRITERIMMO (vente + location + gestion), MACJ (vente), les ventes à attribuer (s'il y en a : une
 * fois, dans aucune société), puis le GLOBAL = la somme des lignes au-dessus. Les cellules de `celluleGlobal`, telles quelles. PUR.
 */
export function syntheseGlobal(e: EntreesGlobal, annee: number, cec?: CompromisEnCoursGlobal): LigneSynthese[] {
  const A = celluleGlobal(e, annee, null);
  const A1 = celluleGlobal(e, annee - 1, null);
  const P = previsionnelEnCours(e, annee, cec); // 🔴 LOT CY — les compromis en cours (la règle unique)
  const lignes: LigneSynthese[] = [
    { cle: 'criterimmo', libelle: 'CRITERIMMO', venteHt: A.venteCriterimmoHt, locationHt: A.locationHt, gestionHt: A.gestionHt, totalHt: A.criterimmoHt, totalN1Ht: A1.criterimmoHt, previsionnelHt: P.criterimmoHt },
    { cle: 'macj', libelle: 'MACJ', venteHt: A.venteMacjHt, locationHt: null, gestionHt: null, totalHt: A.macjHt, totalN1Ht: A1.macjHt, previsionnelHt: P.macjHt },
  ];
  if (A.aAttribuerHt > 0 || A1.aAttribuerHt > 0) lignes.push({ cle: 'a_attribuer', libelle: 'Ventes à attribuer', venteHt: A.aAttribuerHt, locationHt: null, gestionHt: null,
    totalHt: A.aAttribuerHt, totalN1Ht: A1.aAttribuerHt, previsionnelHt: null });
  // 🔴 LOT R — « Inter-cabinet entre nos sociétés : X € (neutralisé) » : compté dans CRITERIMMO ET dans MACJ, retiré une fois.
  if (A.interCabinetHt > 0 || A1.interCabinetHt > 0 || P.interCabinetHt > 0) lignes.push({ cle: 'inter_cabinet', libelle: `Inter-cabinet entre nos sociétés : ${eur(A.interCabinetHt)} (neutralisé)`,
    venteHt: -A.interCabinetHt, locationHt: null, gestionHt: null, totalHt: -A.interCabinetHt, totalN1Ht: -A1.interCabinetHt, previsionnelHt: -P.interCabinetHt });
  lignes.push({ cle: 'global', libelle: 'Global (les deux sociétés)', venteHt: A.venteCriterimmoHt + A.venteMacjHt + A.aAttribuerHt - A.interCabinetHt, locationHt: A.locationHt, gestionHt: A.gestionHt,
    totalHt: A.totalHt, totalN1Ht: A1.totalHt, previsionnelHt: P.totalHt });
  return lignes;
}

// ── LOT L : la gestion (déplacée du CA global) ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LOT L (Arno) — « GESTION » : la saisie mensuelle des honoraires du parc envoyés par le comptable (nombre de lots, honoraires HT,
 * ADHOC, salarié, reste), DÉPLACÉE du CA global : le même formulaire (`SaisieGestion`), les mêmes données (`vue=global`, table
 * `transaction_gestion_mois`), l'historique importé tel quel. Le mois par mois d'une année, puis l'année par année.
 */
/**
 * ══ 🔴 LOT GE1 (Arno, 31/10/2026) — L'ÉCRAN « GESTION » : « LE MOIS » | « L'ANNÉE », LES MÉCANIQUES DE LA TRANSACTION ═════════════════════════════
 * Les honoraires de gestion envoyés chaque mois par le comptable (lots, honoraires HT, ADHOC, salarié, reste). Les mêmes composants que la Transaction :
 * la ligne des mois (« Mois | Période | Année ») et la ligne des années (« Année | Période | Tout »), les tuiles alignées, l'en-tête du graphique,
 * l'histogramme et la courbe du cumul avec leur encadré. Quatre tuiles (honoraires, ADHOC, salariés, CA net = honoraires − ADHOC − salariés, au
 * centime ; `gestionVue`) avec N−1 ; le tableau mois par mois et ses « Saisir / Modifier » (la saisie du comptable) gardés ; « Année par année »
 * dans « L'année » › « Tout ». HT seulement ; un mois sans saisie : « — », compté 0, « mois non saisi » dans l'encadré.
 */
export function EcranGestion() {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesGlobal>('vue=global');
  // « Le mois » | « L'année » ; un ANCIEN lien « ?annee=2026 » (sans vue ni mois) ouvre « L'année » de cette année, comme avant.
  const [vue, setVue] = useState<'mois' | 'annee'>(() => (parametre('vue') === 'annee' || (parametre('vue') === null && parametre('annee') !== null && parametre('mois') === null
    && parametre('vue-mois') === null && parametre('periode') === null) ? 'annee' : 'mois'));
  const { annee, setAnnee, mois, refusPeriode, choisirMois, choisirDecoupage, decoupage, periodeVue, periodeTexte } = useLigneDesMois(jour);
  const anneesDispo = lu.etat === 'ok' ? anneesGestion(lu.data.gestion, jour) : null;
  const { choixA, setChoixAnnees, refusAnnees, setRefusAnnees, choisirAnnee, choisirDecoupageAnnees, cleChoixA, anneesVisibles } = useLigneDesAnnees(jour, anneesDispo,
    vue === 'annee', (a) => lu.etat === 'ok' && lu.data.gestion.some((g) => g.annee === a));
  const [ouvert, setOuvert] = useState<MoisChoisi | null>(null);
  // 🔴 LOT GE2 (Arno) — « Montants HT | TTC » : le MÊME sélecteur que la Transaction (même composant, même mémoire partagée) ; les saisies restent en HT.
  const [unite, setUnite] = useAffichageRetenu();
  useEffect(() => {
    ecrireAdresse(vue === 'mois' ? { vue: 'mois', annee: String(annee), mois: String(mois), 'vue-mois': decoupage, periode: decoupage === 'periode' ? periodeTexte : null,
      'vue-annee': null, annees: null, graphe: null }
      : choixA === null ? {}
      : { vue: 'annee', annee: String(choixA.annee), mois: null, periode: null, 'vue-mois': null,
        'vue-annee': choixA.decoupage === 'annee' ? null : choixA.decoupage, annees: choixA.decoupage === 'periode' ? ecrireAnnees(choixA.annees) : null });
  }, [vue, annee, mois, periodeTexte, decoupage, cleChoixA]); // eslint-disable-line react-hooks/exhaustive-deps
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const annees = anneesGestion(d.gestion, jour);
  // « L'année » › « Tout » : le tableau « Année par année » d'avant, tel quel
  const deLAnnee = (a: number): GestionMois[] => d.gestion.filter((g) => g.annee === a);
  // 🔴 LOT GE2 — dans l'unité choisie (les montants de chaque mois, convertis au centime, puis additionnés)
  const somme = (gs: readonly GestionMois[], k: 'honorairesHt' | 'adhocHt' | 'mongaHt' | 'salarieHt' | 'resteHt'): number | null => {
    const cle = ({ honorairesHt: 'honoraires', adhocHt: 'adhoc', mongaHt: 'monga', salarieHt: 'salarie', resteHt: 'reste' } as const)[k];
    const xs = gs.map((g) => ligneGestionEnUnite(g, unite)[cle]);
    return xs.every((x) => x === null) ? null : xs.reduce<number>((t, x) => t + Math.round((x ?? 0) * 100), 0) / 100;
  };
  const manque = (x: number | null): string => (x === null ? '—' : eur(x));
  const commun = { gestion: d.gestion, jour, disponible: d.disponible, onSaisir: setOuvert, u: unite };
  const champUnite = <div className="tdb-champ trx-champ-unite"><span id="trx-unite-mot">Montants</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>;
  return (
    <div className="tdb loc-page" data-ecran-gestion>
      <style>{CSS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-migration>{SANS_MIGRATION}</p>}
      <div className="trx-barre">
        <div className="trx-vues" role="tablist" aria-label="Le mois ou l’année">
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'mois'} onClick={() => setVue('mois')} data-vue="mois">Le mois</button>
          <button type="button" role="tab" className="tdb-onglet" aria-selected={vue === 'annee'} onClick={() => setVue('annee')} data-vue="annee">L’année</button>
        </div>
      </div>
      {vue === 'mois' ? <>
        <form className="tdb-filtres" aria-label="Année" onSubmit={(x) => x.preventDefault()}>
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
          {champUnite}
        </form>
        <LigneDesMois annee={annee} mois={mois} decoupage={decoupage} moisChoisis={periodeVue === null ? null : periodeVue.filter((m) => m.annee === annee).map((m) => m.mois)}
          onMois={choisirMois} onDecoupage={choisirDecoupage} />
        {decoupage === 'periode' && refusPeriode && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins un mois reste choisi.</p>}
        <VueGestion {...commun} ms={periodeVue ?? [{ annee, mois }]} lib={decoupage === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : decoupage === 'annee' ? String(annee)
          : libellePeriode(periodeVue ?? [])} annee={annee} mois={decoupage === 'mois' ? mois : 0} moisChoisis={decoupage === 'periode' ? (periodeVue ?? []).map((m) => m.mois) : null}
          lignesTableau={decoupage === 'periode' ? periodeVue ?? [] : douzeMois(annee)} titreTableau={decoupage === 'periode' ? undefined : String(annee)} onMois={choisirMois} />
      </> : choixA !== null && anneesVisibles !== null && <>
        <form className="tdb-filtres" aria-label="Montants" onSubmit={(x) => x.preventDefault()}>{champUnite}</form>
        <LigneDesAnnees annees={anneesVisibles} decoupage={choixA.decoupage} annee={choixA.annee} choisies={choixA.decoupage === 'tout' ? anneesVisibles : choixA.annees}
          onAnnee={choisirAnnee} onDecoupage={choisirDecoupageAnnees} />
        {choixA.decoupage === 'periode' && refusAnnees && <p className="loc-muet trx-periode-refus" role="status" data-periode-refus>Au moins une année reste choisie.</p>}
        {(() => {
          const enTout = choixA.decoupage === 'tout';
          const sel = enTout ? [...anneesVisibles] : [...choixA.annees].sort((x, y) => x - y);
          const lib = enTout ? 'toutes les années' : libelleAnnees(choixA);
          const onAnneeSeule = (a: number): void => { setRefusAnnees(false); setChoixAnnees({ decoupage: 'annee', annees: [a], annee: a }); };
          return <VueGestion {...commun} ms={moisDesAnnees(sel)} lib={lib} annee={choixA.annee} mois={0} moisChoisis={null}
            lignesTableau={moisDesAnnees(sel)} onMois={() => undefined} toutes={enTout ? `Toutes les années (${anneesVisibles[0]} → ${anneesVisibles.at(-1)})` : null}
            echelleAnnees={{ annees: anneesVisibles, selection: sel, decoupage: choixA.decoupage, onAnnee: choisirAnnee }}
            tableAnnees={enTout ? <section className="tdb-section" aria-labelledby="trx-gestion-annees" data-bloc="gestion-annees">
              <h3 id="trx-gestion-annees">Année par année <small className="loc-muet">({MOT_UNITE[unite]})</small></h3>
        <table className="tdb-table tdb-table--large" data-table-gestion-annees>
          <thead><tr><th scope="col">Année</th><th scope="col">Mois saisis</th><th scope="col">Honoraires</th><th scope="col">ADHOC</th><th scope="col">MONGA</th><th scope="col">{LIBELLE_SALAIRES}</th><th scope="col">Reste</th><th scope="col">Évolution</th></tr></thead>
          <tbody>{annees.map((a, i) => {
            const h = somme(deLAnnee(a), 'honorairesHt');
            const p = i === 0 ? null : somme(deLAnnee(annees[i - 1]), 'honorairesHt');
            return (
              <tr key={a} className={a === choixA.annee ? 'tdb-fort' : undefined} data-annee-gestion={a}>
                <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => onAnneeSeule(a)}>{a}</button></th>
                <td data-mot="Mois saisis">{deLAnnee(a).length}</td><td data-mot="Honoraires">{manque(h)}</td><td data-mot="ADHOC">{manque(somme(deLAnnee(a), 'adhocHt'))}</td>
                <td data-mot="MONGA">{manque(somme(deLAnnee(a), 'mongaHt'))}</td><td data-mot={LIBELLE_SALAIRES}>{manque(somme(deLAnnee(a), 'salarieHt'))}</td><td data-mot="Reste">{manque(somme(deLAnnee(a), 'resteHt'))}</td>
                <td data-mot="Évolution">{h === null || p === null ? '—' : signePct(variation(h, p))}</td>
              </tr>
            );
          })}</tbody>
        </table>
            </section> : null}
          />;
        })()}
      </>}
      {ouvert !== null && <SaisieGestion monga={d.monga === true} annee={ouvert.annee} mois={ouvert.mois} actuelle={d.gestion.find((g) => g.annee === ouvert.annee && g.mois === ouvert.mois) ?? null}
        onFermer={() => setOuvert(null)} onFait={() => { setOuvert(null); relire(); }} onRelire={relire} />}
    </div>
  );
}

/** 🔴 LOT GE5 (Arno) — le libellé des salaires (sans TVA) : tuile, colonnes des tableaux, encadré et titre du graphique, fenêtre « Modifier » ; l'onglet garde « Salaires ». */
const LIBELLE_SALAIRES = 'Coûts salariaux chargés';
/** 🔴 LOT GE1 — « Gestion » : les tuiles, le graphique (deux échelles sur « L'année ») et le tableau des mois choisis. */
function VueGestion({ gestion, jour, disponible, onSaisir, u, ms, lib, annee, mois, moisChoisis, lignesTableau, titreTableau, onMois, toutes = null, echelleAnnees = null, tableAnnees = null }: {
  gestion: readonly GestionMois[]; jour: string; disponible: boolean; onSaisir: (m: MoisChoisi) => void;
  /** 🔴 LOT GE2 — l'unité affichée (HT | TTC). */
  u: UniteGestion;
  /** Les mois comptés (tuiles) ; `lib` : leur nom ; `annee` / `mois` : l'année et le mois montrés (0 : aucun mois choisi). */
  ms: readonly MoisChoisi[]; lib: string; annee: number; mois: number; moisChoisis: readonly number[] | null;
  lignesTableau: readonly MoisChoisi[]; onMois: (m: number) => void;
  /** Le nom des lignes du tableau (« 2026 » : ses 12 mois, en « Mois ») ; absent : `lib`. */
  titreTableau?: string;
  /** « Tout » : ce que disent les tuiles et l'encadré à la place de N−1 (lot DH). */
  toutes?: string | null;
  echelleAnnees?: { annees: readonly number[]; selection: readonly number[]; decoupage: DecoupageAnnees; onAnnee: (a: number) => void } | null;
  /** « L'année » › « Tout » : le tableau « Année par année » à la place du tableau des mois. */
  tableAnnees?: ReactNode;
}) {
  const [echelle, setEchelle] = useState<'annees' | 'mois'>(() => (parametre('graphe') === 'mois' ? 'mois' : 'annees'));
  useEffect(() => { if (echelleAnnees !== null) ecrireAdresse({ graphe: echelle === 'mois' ? 'mois' : null }); }, [echelle, echelleAnnees === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = totauxGestion(gestion, ms);
  const ms1 = unAnPlusTot(ms);
  const T1 = totauxGestion(gestion, ms1);
  const anneesN1 = [...new Set(ms1.map((m) => m.annee))];
  const sansN1 = T1.nbSaisis === 0;
  const enN1 = anneesN1.length === 1 ? `en ${anneesN1[0]}` : 'un an plus tôt';
  const n1 = (c: number, c1: number): string => (toutes !== null ? toutes : sansN1 ? `${anneesN1.join(', ')} : non saisi` : `${eur(c1 / 100)} ${enN1} (${signePct(variation(c, c1))})`);
  const lots = T.lots === null ? 'lots : —' : ms.length === 1 ? `${nombreFr(T.lots)} lots` : `${nombreFr(Math.round(T.lots))} lots en moyenne`;
  const MOT = MOT_UNITE[u]; const AUTRE: UniteGestion = u === 'ht' ? 'ttc' : 'ht';
  /** Une tuile : le grand montant dans l'unité, l'autre unité en petit entre parenthèses (les salariés : « sans TVA »), N−1 dans l'unité. */
  const tuile = (cle: string, mot: string, m: Exclude<MesureGestion, 'lots'>, couleur: string, lotsEnPlus = false) => {
    const c = centimesGestion(T, m, u); const c1 = centimesGestion(T1, m, u);
    return (
      <li><div className="tdb-tuile" data-tuile={cle}><span className="tdb-tuile-mot">{m === 'salaries' ? mot : `${mot} ${MOT}`} — {lib}</span>
        <strong className={`tdb-tuile-valeur ${couleur}`} data-tuile-valeur={cle}>{eur(c / 100)}</strong>
        {/* une seule ligne entre parenthèses (la rangée commune des tuiles alignées) : l'autre unité, et les lots pour le CA net */}
        <small className="trx-montant-autre trx-tuile-autre" data-montant-autre>({m === 'salaries' ? 'sans TVA' : `${eur(centimesGestion(T, m, AUTRE) / 100)}${ESPACE}${MOT_UNITE[AUTRE]}`}{lotsEnPlus && <> · <span data-gestion-lots>{lots}</span></>})</small>
        <span className="tdb-tuile-n1" data-tuile-n1={cle}>{n1(c, c1)}</span></div></li>
    );
  };
  const choixEchelle = echelleAnnees === null ? null : (
    <div className="trx-unites trx-choix-echelle" role="group" aria-label="L’échelle du graphique" data-echelle-choix={echelle}>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'annees'} onClick={() => setEchelle('annees')} data-echelle="annees">Année par année</button>
      <button type="button" className="trx-unite" aria-pressed={echelle === 'mois'} onClick={() => setEchelle('mois')} data-echelle="mois">Mois par mois — {annee}</button>
    </div>
  );
  const plusieursAnnees = new Set(lignesTableau.map((m) => m.annee)).size > 1;
  const total = totauxGestion(gestion, lignesTableau);
  // 🔴 LOT GE2 — le tableau dans l'unité choisie (`ligneGestionEnUnite`) ; ses totaux : la somme de ses lignes, au centime
  const ligneDe = (a: number, k: number) => ligneGestionEnUnite(gestion.find((g) => g.annee === a && g.mois === k) ?? null, u);
  const somme = (k: 'honoraires' | 'adhoc' | 'monga' | 'salarie' | 'reste', ls: readonly MoisChoisi[] = lignesTableau): number | null => {
    const xs = ls.map((m) => ligneDe(m.annee, m.mois)[k]);
    return xs.every((x) => x === null) ? null : xs.reduce<number>((t, x) => t + Math.round((x ?? 0) * 100), 0) / 100;
  };
  const manque = (x: number | null): string => (x === null ? '—' : eur(x));
  return <>
    <ul className="tdb-tuiles trx-tuiles-alignees trx-tuiles-gestion" aria-label={`La gestion — ${lib}`}>
      {tuile('gestion-honoraires', 'Honoraires de gestion', 'honoraires', 'tdb-signe tdb-signe--positif')}
      {tuile('gestion-adhoc', 'Coût ADHOC', 'adhoc', classeSens('verse', T.adhocC, T.adhocC))}
      {tuile('gestion-monga', 'Coût MONGA', 'monga', classeSens('verse', T.mongaC, T.mongaC))}
      {tuile('gestion-salaries', LIBELLE_SALAIRES, 'salaries', classeSens('verse', T.salariesC, T.salariesC))}
      {tuile('gestion-net', 'CA net', 'net', `tdb-signe tdb-signe--${sensDe(centimesGestion(T, 'net', u))}`, true)}
    </ul>
    {echelleAnnees !== null && echelle === 'annees'
      ? <GrapheGestionAnnees gestion={gestion} jour={jour} u={u} annee={annee} {...echelleAnnees} toutes={toutes} entete={choixEchelle} />
      : <GrapheGestionMois gestion={gestion} jour={jour} u={u} annee={annee} mois={mois} moisChoisis={moisChoisis} onMois={onMois} entete={choixEchelle} />}
    {tableAnnees ?? (
      <section className="tdb-section" aria-labelledby="trx-gestion-mois" data-bloc="gestion-mois">
        <h3 id="trx-gestion-mois">{titreTableau ?? lib} mois par mois <small className="loc-muet">{u === 'ttc' ? '(TTC, coûts salariaux chargés sans TVA ; envoyé en HT chaque mois par le comptable)' : '(HT ; envoyé chaque mois par le comptable)'}</small></h3>
        <table className="tdb-table tdb-table--large" data-table-gestion>
          <thead><tr><th scope="col">Mois</th><th scope="col">Lots</th><th scope="col">Honoraires</th><th scope="col">ADHOC</th><th scope="col">MONGA</th><th scope="col">{LIBELLE_SALAIRES}</th><th scope="col">Reste</th>
            <th scope="col">Honoraires {plusieursAnnees ? 'un an plus tôt' : annee - 1}</th><th scope="col">Saisie</th></tr></thead>
          <tbody>
            {lignesTableau.map((m) => {
              const g = gestion.find((x) => x.annee === m.annee && x.mois === m.mois) ?? null;
              const l = ligneDe(m.annee, m.mois); const l1 = ligneDe(m.annee - 1, m.mois);
              return (
                <tr key={`${m.annee}-${m.mois}`} data-mois-gestion={m.mois} data-annee-mois-gestion={`${m.annee}-${m.mois}`} className={mois !== 0 && m.mois === mois && m.annee === annee ? 'trx-ligne-choisie' : undefined}>
                  <th scope="row">{NOMS_MOIS[m.mois - 1]}{plusieursAnnees ? ` ${m.annee}` : ''}{g?.origine === 'import' && <span className="loc-pastille" title="Repris du fichier importé"> import</span>}</th>
                  <td data-mot="Lots">{g?.nbLots == null ? '—' : nombreFr(g.nbLots)}</td><td data-mot="Honoraires" data-gestion-honoraires={m.mois}>{manque(l.honoraires)}</td>
                  <td data-mot="ADHOC">{manque(l.adhoc)}</td><td data-mot="MONGA">{manque(l.monga)}</td><td data-mot={LIBELLE_SALAIRES}>{manque(l.salarie)}</td><td data-mot="Reste">{manque(l.reste)}</td>
                  <td data-mot={`Honoraires ${m.annee - 1}`}>{manque(l1.honoraires)}</td>
                  <td data-mot="Saisie"><button type="button" className="trx-bouton-lien" onClick={() => onSaisir(m)} disabled={!disponible} data-saisir-gestion={m.mois}
                    data-saisir-gestion-mois={`${m.annee}-${m.mois}`}>{g === null ? 'Saisir' : 'Modifier'}</button></td>
                </tr>
              );
            })}
            <tr className="tdb-fort trx-ligne-total" data-total-gestion><th scope="row">Total — {titreTableau ?? lib}</th><td data-mot="Lots">—</td>
              <td data-mot="Honoraires">{manque(somme('honoraires'))}</td><td data-mot="ADHOC">{manque(somme('adhoc'))}</td><td data-mot="MONGA">{manque(somme('monga'))}</td><td data-mot={LIBELLE_SALAIRES}>{manque(somme('salarie'))}</td>
              <td data-mot="Reste">{manque(somme('reste'))}</td><td data-mot="Honoraires N−1">{total.nbMois === 0 ? '—' : manque(somme('honoraires', unAnPlusTot(lignesTableau)))}</td><td data-mot="Saisie" /></tr>
          </tbody>
        </table>
      </section>
    )}
  </>;
}

/** Les mots d'une mesure de la gestion (l'onglet du graphique, l'encadré). */
// 🔴 LOT GE4 — dans le graphique et son encadré : « CA » (les honoraires) et « Salaires » (les tuiles et le tableau gardent leurs libellés)
const motMesureGestion = (m: MesureGestion, u: UniteGestion): string => (m === 'lots' ? 'Lots' : m === 'salaries' ? LIBELLE_SALAIRES
  : `${({ honoraires: 'CA', adhoc: 'ADHOC', monga: 'MONGA', net: 'CA net' } as const)[m]} ${MOT_UNITE[u]}`);
function useMesureGestion(): [MesureGestion, (m: MesureGestion) => void] {
  const [mesure, setMesure] = useState<MesureGestion>(() => { const x = parametre('mesure'); return estMesureGestion(x) ? x : 'honoraires'; });
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'honoraires' ? null : mesure }); }, [mesure]);
  return [mesure, setMesure];
}
/** L'encadré d'un point : la valeur et le nombre de mois saisis, N−1 (sauf « Tout ») ; « mois non saisi » dans le titre d'un mois vide. */
function infoGestion(titre: string, mesure: MesureGestion, u: UniteGestion, libelle: string, t: TotauxGestion, libelleN1: string | null, t1: TotauxGestion | null, sansN1: string): InfoBarre {
  const v = valeurGestion(t, mesure, u); const v1 = t1 === null ? 0 : valeurGestion(t1, mesure, u);
  if (mesure === 'lots') return { titre, compte: 'Lots', sansN1, courant: { libelle, ca: v, nb: null }, precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: v1, nb: null } };
  return { titre, motCa: motMesureGestion(mesure, u), motNb: 'Mois saisis', sansN1, courant: { libelle, ca: v, nb: t.nbSaisis },
    precedent: libelleN1 === null || t1 === null ? null : { libelle: libelleN1, ca: v1, nb: t1.nbSaisis } };
}
/** Le cumul d'une mesure de janvier au mois `k` (les lots : leur moyenne). */
const cumulGestion = (gestion: readonly GestionMois[], annee: number, k: number): TotauxGestion => totauxGestion(gestion, Array.from({ length: k }, (_, i) => ({ annee, mois: i + 1 })));

/** 🔴 LOT GE1 — « Mois par mois » de la gestion : Mensuel (barres, N−1 hachurée) / Cumul ; le mois choisi en rouge ; Période atténuée. */
function GrapheGestionMois({ gestion, jour, u, annee, mois, moisChoisis, onMois, entete }: { gestion: readonly GestionMois[]; jour: string; u: UniteGestion; annee: number; mois: number;
  moisChoisis: readonly number[] | null; onMois: (m: number) => void; entete: ReactNode }) {
  const [mesure, setMesure] = useMesureGestion();
  const [cumul, setCumul] = useState(false);
  const dernier = moisADate(annee, jour);
  const sansN1 = !gestion.some((g) => g.annee === annee - 1);
  const pt = (a: number, k: number): TotauxGestion => (cumul ? cumulGestion(gestion, a, k) : totauxGestion(gestion, [{ annee: a, mois: k }]));
  const info = (k: number): InfoBarre => {
    const t = pt(annee, k);
    const nonSaisi = !cumul && t.nbSaisis === 0 && k <= dernier;
    const titre = `${cumul ? `Cumul ${annee} à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : `${NOMS_MOIS[k - 1]} ${annee}`}${k > dernier ? ' — à venir' : nonSaisi ? ' — mois non saisi' : ''}`;
    return infoGestion(titre, mesure, u, String(annee), t, sansN1 ? null : String(annee - 1), sansN1 ? null : pt(annee - 1, k), `${annee - 1} : non saisi`);
  };
  const vals = Array.from({ length: 12 }, (_, i) => valeurGestion(pt(annee, i + 1), mesure, u));
  const vals1 = Array.from({ length: 12 }, (_, i) => valeurGestion(pt(annee - 1, i + 1), mesure, u));
  // 🔴 LOT DN — « Période » : le dernier mois choisi (`borneCumul`, la borne unique) ; « Année » (aucun mois choisi) : le repos ci-dessous.
  const choisi = moisChoisis !== null ? (moisChoisis.length === 0 ? 0 : borneCumul('periode', annee, mois, moisChoisis, jour).fin) : mois;
  // aucun mois choisi (« L'année ») : au repos, le dernier mois à date (ou décembre)
  const finAnnee = borneCumul('annee', annee, 0, null, jour).fin; // 🔴 LOT DN — la borne unique
  const repos = choisi === 0 ? info(finAnnee === 0 ? 1 : finAnnee) : undefined;
  const entier = mesure === 'lots';
  const motGraphe = motMesureGestion(mesure, u);
  return (
    <section className="tdb-section" aria-labelledby="trx-gestion-histo" data-bloc="histogramme-mois" data-mesure={mesure}
      {...(moisChoisis !== null ? { 'data-periode-graphe': moisChoisis.join(',') } : {})}>
      {moisChoisis !== null && <style>{`[data-periode-graphe] g[data-barre-mois]{opacity:.35}${moisChoisis.map((k) => `[data-periode-graphe] g[data-barre-mois="${k}"]{opacity:1}[data-periode-graphe] g[data-barre-mois="${k}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<MesureGestion> id="trx-gestion-histo" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel"
        mesures={MESURES_GESTION} titre={<>Mois par mois — {annee} <small className="loc-muet">({motGraphe}{cumul ? (mesure === 'lots' ? ', moyenne depuis janvier' : ', cumulé depuis janvier') : ''})</small></>} />
      {entete}
      {cumul ? (
        <CourbeCumul courant={vals.slice(0, dernier)} n1={sansN1 ? null : vals1} annee={annee} selection={choisi} entier={entier} aria={`${motGraphe} cumulé ${annee}`}
          bulle={info} onChoisir={onMois} repos={repos} />
      ) : (
        <Histogramme attribut="data-barre-mois" courante={choisi} onChoisir={onMois} entier={entier} aria={`${motGraphe} par mois, ${annee}`} repos={repos}
          legende={{ courant: String(annee), n1: sansN1 ? null : String(annee - 1) }}
          barres={vals.map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernier ? null : v, n1: sansN1 ? null : vals1[i], info: info(i + 1) }))} />
      )}
    </section>
  );
}

/** 🔴 LOT GE1 — « Année par année » de la gestion : Annuel / Cumul ; l'année choisie en rouge ; Période atténuée ; « Tout » sans N−1. */
function GrapheGestionAnnees({ gestion, jour, u, annee, annees, selection, decoupage, onAnnee, toutes, entete }: { gestion: readonly GestionMois[]; jour: string; u: UniteGestion; annee: number;
  annees: readonly number[]; selection: readonly number[]; decoupage: DecoupageAnnees; onAnnee: (a: number) => void; toutes: string | null; entete: ReactNode }) {
  const [mesure, setMesure] = useMesureGestion();
  const [cumul, setCumul] = useState(false);
  const enCours = Number(jour.slice(0, 4));
  const de = (as: readonly number[]): TotauxGestion => totauxGestion(gestion, moisDesAnnees(as));
  const pt = (a: number): TotauxGestion => (cumul ? de(annees.filter((x) => x <= a)) : de([a]));
  const info = (a: number): InfoBarre => {
    const avant = toutes === null && annees.includes(a - 1);
    const titre = cumul ? `Cumul ${annees[0]} → ${a}` : `${a}${a === enCours ? ' — en cours' : ''}`;
    return infoGestion(titre, mesure, u, String(a), pt(a), avant ? String(a - 1) : null, avant ? pt(a - 1) : null, toutes ?? `${a - 1} : non saisi`);
  };
  const vals = annees.map((a) => valeurGestion(pt(a), mesure, u));
  const entier = mesure === 'lots';
  const motGraphe = motMesureGestion(mesure, u);
  const enPeriode = decoupage === 'periode';
  return (
    <section className="tdb-section" aria-labelledby="trx-gestion-annees-graphe" data-bloc="graphe-annees" data-mesure={mesure} data-echelle="annees"
      {...(enPeriode ? { 'data-periode-annees': selection.join(',') } : {})}>
      {enPeriode && <style>{`[data-periode-annees] g[data-barre-annee]{opacity:.35}${selection.map((a) => `[data-periode-annees] g[data-barre-annee="${a}"]{opacity:1}[data-periode-annees] g[data-barre-annee="${a}"] .tdb-barre{fill:var(--color-svv-red)}`).join('')}`}</style>}
      <EnteteGraphe<MesureGestion> id="trx-gestion-annees-graphe" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Annuel"
        mesures={MESURES_GESTION} titre={<>Année par année <small className="loc-muet">({motGraphe}{cumul ? `, cumulé depuis ${annees[0]}` : ''} ; une année s’ouvre d’un clic)</small></>} />
      {entete}
      {cumul ? (
        <CourbeCumul courant={vals.slice(0, annees.filter((a) => a <= enCours).length)} n1={null} annee={annee} selection={annee} entier={entier} aria={`${motGraphe} cumulé par année`}
          etiquettes={annees.map(String)} cles={annees} nom="annees-cumul" attributZone="data-annee-cumul" bulle={info} onChoisir={onAnnee}
          legende={<><span className="tdb-legende tdb-legende--courant" /> cumul depuis {annees[0]}</>} />
      ) : (
        <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={onAnnee} entier={entier} pasFixe={PAS_ANNEE_FIXE} aria={`${motGraphe} par année`}
          barres={annees.map((a, k) => ({ cle: a, libelle: String(a), valeur: a > enCours ? null : vals[k], info: info(a) }))} />
      )}
    </section>
  );
}

/** La gestion d'un mois (CRITERIMMO) : nombre de lots, honoraires HT, ADHOC, salarié, reste — saisie, modifiée, journalisée. */
function SaisieGestion({ annee, mois, actuelle, onFermer, onFait, onRelire, monga = false }: {
  annee: number; mois: number; actuelle: GestionMois | null; onFermer: () => void; onFait: () => void; onRelire: () => void;
  /** 🔴 LOT GE3 — la migration 446 est appliquée : le coût MONGA se saisit ; sinon, le champ est grisé (motif dit). */
  monga?: boolean;
}) {
  const txt = (x: number | null | undefined): string => (x === null || x === undefined ? '' : String(x).replace('.', ','));
  const [v, setV] = useState({ nbLots: txt(actuelle?.nbLots), honorairesHt: txt(actuelle?.honorairesHt), adhocHt: txt(actuelle?.adhocHt),
    mongaHt: txt(actuelle?.mongaHt), salarieHt: txt(actuelle?.salarieHt), resteHt: txt(actuelle?.resteHt), note: actuelle?.note ?? '' });
  const [motif, setMotif] = useState<string | null>(null);
  const nombre = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')));
  const propose = resteGestionPropose({ honorairesHt: nombre(v.honorairesHt), adhocHt: nombre(v.adhocHt), mongaHt: nombre(v.mongaHt), salarieHt: nombre(v.salarieHt) });
  /**
   * 🔴 LOT GE3 — le RESTE est saisi (ou importé), pas calculé : un MONGA saisi le diminue d'autant (un MONGA changé : de la différence), s'il est
   * rempli et lisible ; un mois sans MONGA ne change pas d'un centime.
   */
  const changerMonga = (texte: string): void => setV((y) => {
    const [avant, apres, reste] = [nombre(y.mongaHt) ?? 0, nombre(texte) ?? 0, nombre(y.resteHt)];
    if (reste === null || !Number.isFinite(reste) || !Number.isFinite(avant) || !Number.isFinite(apres)) return { ...y, mongaHt: texte };
    const c = Math.round(reste * 100) - (Math.round(apres * 100) - Math.round(avant * 100));
    return { ...y, mongaHt: texte, resteHt: String(c / 100).replace('.', ',') };
  });
  const envoyer = async (): Promise<void> => {
    const r = await posterTransaction({ action: 'gestion-enregistrer', annee, mois, gestion: v });
    if (r === null) onFait(); else setMotif(r);
  };
  const titre = `Gestion — ${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`;
  const champ = (k: keyof typeof v, mot: string) => (
    <label>{mot}<input value={v[k]} inputMode={k === 'note' ? undefined : 'decimal'} onChange={(x) => setV((y) => ({ ...y, [k]: x.target.value }))} data-champ-gestion={k} /></label>
  );
  return (
    <div className="tdb-voile" onMouseDown={(x) => { if (x.target === x.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={titre} data-saisie-gestion>
        <header className="tdb-fenetre-tete"><h3>{titre}</h3><button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer}>×</button></header>
        <div className="tdb-fenetre-corps">
          {/* 🔴 LOT GE2 — la saisie du comptable reste en HT, quel que soit l'affichage choisi. */}
          <p className="loc-muet" data-montants-ht>Montants HT (la saisie du comptable).</p>
          <form className="trx-form" onSubmit={(x) => { x.preventDefault(); void envoyer(); }}>
            {champ('nbLots', 'Nombre de lots')}{champ('honorairesHt', 'Honoraires HT')}{champ('adhocHt', 'ADHOC HT')}
            {/* 🔴 LOT GE3 — MONGA, entre ADHOC et Salarié : même format et mêmes contrôles qu'ADHOC ; il diminue le reste d'autant */}
            <label>MONGA HT<input value={v.mongaHt} inputMode="decimal" onChange={(x) => changerMonga(x.target.value)} disabled={!monga} data-champ-gestion="mongaHt" />
              <span className="loc-muet">{monga ? 'retranché du reste' : 'après la mise à jour de la base (migration 446)'}</span></label>
            {champ('salarieHt', `${LIBELLE_SALAIRES} (HT)`)}
            <label>Reste HT<input value={v.resteHt} inputMode="decimal" onChange={(x) => setV((y) => ({ ...y, resteHt: x.target.value }))} data-champ-gestion="resteHt" />
              <span className="loc-muet">{propose === null ? '' : <>Proposé : {eur(propose)} <button type="button" className="trx-bouton-lien" onClick={() => setV((y) => ({ ...y, resteHt: String(propose).replace('.', ',') }))}>Reprendre</button></>}</span></label>
            <label className="trx-plein">Note<textarea value={v.note} onChange={(x) => setV((y) => ({ ...y, note: x.target.value }))} /></label>
            {motif !== null && <p className="trx-erreur trx-plein" role="alert">{motif}</p>}
            <div className="trx-actions trx-plein">
              <button type="submit" className="svv-btn svv-btn-primary gst-btn" data-enregistrer-gestion>Enregistrer</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
            </div>
          </form>
          {actuelle !== null && <Journal entite="gestion_mois" id={actuelle.id} onFait={onRelire} />}
        </div>
      </div>
    </div>
  );
}
