'use client';

import { useEffect, useMemo, useState } from 'react';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import {
  anneesDe, APPORTEUR_NON_NOMME, bilanVente, caHt, sommeSocietes, caHtParMois, celluleGlobal, compromisDeLAnnee, compteDansSociete, groupesDoubles, historique, ht, LIBELLE_SOCIETE, moisAConfirmer, negociateursDe, SOCIETES,
  NOMS_MOIS, parApporteur, parNegociateur, payeParClasseTtc, payeTtcDe, previsionnel, resteGestionPropose, resteTtcDe, retroTtcDe, retrosDuMois, totaux,
  variation, ventesDeLAnnee, ventesDuMois, ventesProposees, type CaARattacher, type DonneesSociete, type EntreesGlobal, type GestionMois,
  type Retrocession, type Societe, type Vente, TVA,
  aDesCompromisDates, caHtParMoisMode, compromisDuMode, compromisSansDate, estModeMois, MODES_MOIS, nombreParMoisMode, totauxMoisMode, type ModeMois,
} from '../../../../lib/transaction/modele';
import { CourbeAnnees, CourbeCumul, CSS_TABLEAU_BORD, EnteteGraphe, Histogramme, sensDe, sommeAffichee, type InfoBarre } from '../location/TableauBordSuivi';
import { CSS_FEUILLE_MOIS } from '../location/FeuilleDuMois';
import { BlocReplie, CSS_BLOC_REPLIE } from '../location/BlocReplie';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_LOCATION_ECRANS } from '../location/commun';
import { BoutonAffichage, COURT, CSS_TRANSACTION, ecartEur, ecrireAdresse, ESPACE, eur, FournisseurAffichage, lireAffichage, MOT_UNITE, nombreFr, parametre, posterTransaction, signePct, useAffichage, useAffichageRetenu, useTransaction, type UniteAffichage } from './commun';
import { FormulaireVente, Journal } from './FormulaireVente';
import { adresseOrigine, CarteAffaire, CarteMiroir, DetailAffaire, OngletCompromis, useHoteAffaires, type HoteDetail } from './OngletCompromis';
import { resolveurDe, type StatutDuLibelle } from '../../../../lib/transaction/statutLigne';
import { partAgenceRattacheeHt } from '../../../../lib/transaction/partAgence';
import { classeCommission, libelleStatut } from '../../../../lib/admin/statut';

/** 🔴 LOT Q — la paye NON déduite du reste à l'agence, à part : internes (associés, salariés), puis statut à renseigner (signalé). */
function NonDeduits({ T }: { T: { internesHt: number; aRenseignerHt: number } }) {
  const MOT = MOT_UNITE[useAffichage()];
  return <>
    <dt className="trx-tuile-detail-a-part">Internes (associés, salariés) — non déduits ({MOT})</dt><dd className="trx-tuile-detail-a-part"><Mt ht={T.internesHt} donnees={{ 'data-internes-non-deduits': '' }} /></dd>
    {T.aRenseignerHt > 0 && <><dt className="trx-alerte">Statut à renseigner — non déduits ({MOT})</dt><dd className="trx-alerte"><Mt ht={T.aRenseignerHt} donnees={{ 'data-a-renseigner-non-deduits': '' }} /></dd></>}
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
  criterimmo: '/admin/transaction/criterimmo', macj: '/admin/transaction/macj',
} as const;
const CASES = [
  { href: ADRESSES_TRANSACTION.ventes, titre: 'Transaction', phrase: 'Les ventes et compromis de CRITERIMMO et de MACJ : les compromis, le mois, l’année, les négociateurs, les apporteurs.', cle: 'ventes' },
  { href: ADRESSES_TRANSACTION.gestion, titre: 'Gestion', phrase: 'Les honoraires du parc envoyés chaque mois par le comptable : lots, honoraires, ADHOC, salarié, reste — par mois et par année.', cle: 'gestion' },
  { href: ADRESSES_TRANSACTION.global, titre: 'CA global', phrase: 'Tous les CA réunis : CRITERIMMO (vente, location, gestion), MACJ (vente), puis les deux — par mois et par année, face à N−1.', cle: 'global' },
];
const CASES_VENTES = [
  { href: ADRESSES_TRANSACTION.criterimmo, titre: 'CRITERIMMO', phrase: 'Les compromis, le mois, l’année, les négociateurs et les apporteurs de CRITERIMMO.', cle: 'criterimmo' },
  { href: ADRESSES_TRANSACTION.macj, titre: 'MACJ', phrase: 'Les compromis, le mois, l’année, les négociateurs et les apporteurs de MACJ.', cle: 'macj' },
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
/** LOT L — « Transaction » : « CRITERIMMO » et « MACJ ». */
export const AccueilVentes = () => <Cases cases={CASES_VENTES} libelle="Les sociétés" deux />;

// ── Une société ───────────────────────────────────────────────────────────────────────────────────────────────────────────

type Detail = { titre: string; ids: number[] } | null;
const entier = (x: string | null, min: number, max: number): number | null => { const n = Number(x); return x !== null && Number.isInteger(n) && n >= min && n <= max ? n : null; };
const moisCourt = (a: number, m: number): string => `${COURT[m - 1]} ${a}`;

/** LOT L — l'onglet d'arrivée : « vue » dite ; sinon « Le mois » pour une ancienne adresse du mois ; sinon « Compromis ». PUR. */
export function vueInitiale(vue: string | null, avecMois: boolean): 'compromis' | 'mois' | 'annee' {
  if (vue === 'annee' || vue === 'mois' || vue === 'compromis') return vue;
  return avecMois ? 'mois' : 'compromis';
}

export function EcranSociete({ societe }: { societe: Societe }) {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesSociete>(`vue=societe&societe=${societe}`);
  // LOT D — trois onglets : « Compromis », « Le mois », « L'année ». LOT L (Arno) — à l'ouverture : « Compromis ». Une ANCIENNE adresse
  // du mois (« ?annee=…&mois=… » sans « vue », écrite avant ce lot) rouvre toujours « Le mois » : aucun lien ne se perd.
  const [vue, setVue] = useState<'compromis' | 'mois' | 'annee'>(() => vueInitiale(parametre('vue'), parametre('mois') !== null));
  const refs = useTransaction<References>('vue=references');
  const [annee, setAnnee] = useState(() => entier(parametre('annee'), 2000, 2100) ?? Number(jour.slice(0, 4)));
  const [mois, setMois] = useState(() => entier(parametre('mois'), 1, 12) ?? Number(jour.slice(5, 7)));
  const [debut, setDebut] = useState<number | null>(() => entier(parametre('debut'), 2000, 2100));
  const [fin, setFin] = useState<number | null>(() => entier(parametre('fin'), 2000, 2100));
  const [negociateur, setNegociateur] = useState('');
  // 🔴 LOT BS (Arno) — « Le mois » : Vendu | Compromis | Vendu + compromis. L'adresse (&mode=…) d'abord (un lien partagé), sinon le choix retenu
  // par le navigateur, sinon « Vendu » (l'écran d'avant, à l'identique).
  const [mode, setModeEtat] = useState<ModeMois>(() => modeInitial(parametre('mode')));
  const setMode = (m: ModeMois): void => { setModeEtat(m); try { window.localStorage.setItem(CLE_MODE_MOIS, m); } catch { /* sans stockage */ } };
  const [detail, setDetail] = useState<Detail>(null);
  const [edition, setEdition] = useState<Vente | 'nouvelle' | null>(null);
  // 🔴 LOT BW (Arno) — « HT | TTC » sur « Le mois » et « L'année » : le choix retenu de l'onglet « Compromis » (même composant, même mémoire,
  // les deux sociétés) ; relu à chaque changement d'onglet (le sélecteur de « Compromis » a pu le changer).
  const [unite, setUnite] = useAffichageRetenu();
  useEffect(() => { const x = lireAffichage(); if (x !== unite) setUnite(x); }, [vue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ecrireAdresse(vue === 'mois' ? { vue: 'mois', annee: String(annee), mois: String(mois), debut: null, fin: null, mode }
      : vue === 'compromis' ? { vue: null, annee: null, mois: null, debut: null, fin: null, mode: null, mesure: null }
      : { vue: 'annee', annee: null, mois: null, debut: debut === null ? null : String(debut), fin: fin === null ? null : String(fin), mode: null, mesure: null });
  }, [vue, annee, mois, debut, fin, mode]);

  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const annees = anneesDe(d, jour);
  const negos = [...new Set([...d.ventes.flatMap(negociateursDe), ...d.retrocessions.map((r) => r.negociateur)])].sort((a, b) => a.localeCompare(b, 'fr'));
  const filtrees: DonneesSociete = negociateur === '' ? d : { ...d, ventes: d.ventes.filter((v) => negociateursDe(v).includes(negociateur)),
    retrocessions: d.retrocessions.filter((r) => r.negociateur === negociateur), aRattacher: d.aRattacher.filter((x) => x.negociateur === negociateur) };
  const fini = (): void => { setEdition(null); relire(); };
  const references = refs.lu.etat === 'ok' ? refs.lu.data : null;
  /** LOT D — une vente répartie (ou avec son dossier) se modifie dans le formulaire du dossier ; les autres, comme avant. */
  const avecDossier = (v: Vente | 'nouvelle' | null): v is Vente => v !== null && v !== 'nouvelle' && (v.repartition != null || v.dossier != null);

  return (
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
      <BlocAAttribuer notes={d.doubles ?? []} disponible={d.disponible} onRelire={relire} />
      {vue === 'compromis' ? <OngletCompromis societe={societe} /> : <>
      <form className="tdb-filtres" aria-label="Filtres" onSubmit={(e) => e.preventDefault()}>
        {vue === 'mois' ? (
          <label className="tdb-champ">Année
            <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
        ) : <>
          <label className="tdb-champ">Début
            <ListeChoix options={annees.filter((a) => a <= (fin ?? annees.at(-1)!)).map((a) => ({ id: a, libelle: String(a) }))} valeur={String(debut ?? annees[0])} vide={null}
              libelle="Début" onChange={(v) => setDebut(Number(v))} donnees={{ 'data-filtre': 'debut' }} /></label>
          <label className="tdb-champ">Fin
            <ListeChoix options={annees.filter((a) => a >= (debut ?? annees[0])).map((a) => ({ id: a, libelle: String(a) }))} valeur={String(fin ?? annees.at(-1))} vide={null}
              libelle="Fin" onChange={(v) => setFin(Number(v))} donnees={{ 'data-filtre': 'fin' }} /></label>
        </>}
        <label className="tdb-champ">Négociateur
          <ListeChoix options={negos.map((x) => ({ id: x, libelle: x }))} valeur={negociateur} vide="Tous" libelle="Négociateur" onChange={setNegociateur} donnees={{ 'data-filtre': 'negociateur' }} /></label>
        {/* 🔴 LOT BS — ce que « Le mois » additionne : les ventes signées (date de l'acte), les compromis (date du compromis), ou les deux. */}
        {vue === 'mois' && <div className="tdb-champ trx-champ-mode"><span id="trx-mode-mot">Compter</span>
          <div className="trx-unites trx-modes" role="group" aria-labelledby="trx-mode-mot" data-filtre="mode">
            {MODES_MOIS.map((m) => <button key={m} type="button" className="trx-unite" aria-pressed={mode === m} onClick={() => setMode(m)} data-mode-mois={m}>{LIBELLE_MODE[m]}</button>)}
          </div>
          {/* 🔴 LOT BT — la règle du mode combiné, dite sous le sélecteur. */}
          <small className="loc-muet trx-mode-regle" data-regle-mode>Vendu + compromis : chaque affaire n’est comptée qu’une fois — à la date de l’acte si elle est signée, sinon à la date du compromis.</small></div>}
        {/* 🔴 LOT BW — les montants en grand : HT ou TTC (à droite de « Compter » ; sur « L'année », au même endroit de ses filtres). */}
        <div className="tdb-champ trx-champ-unite"><span id="trx-unite-mot">Montants</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
      </form>

      <FournisseurAffichage value={unite}>
      {vue === 'mois'
        ? <VueMois d={filtrees} tout={d} annee={annee} mois={mois} jour={jour} mode={mode} onMois={setMois} onDetail={setDetail} onEdition={setEdition} onRelire={relire} references={references} />
        : <VueAnnee d={filtrees} annees={annees} debut={debut ?? annees[0]} fin={fin ?? annees.at(-1)!} jour={jour} onDetail={setDetail}
            onAnnee={(a) => { setDebut(a); setFin(a); }} />}
      </FournisseurAffichage>
      </>}

      {detail !== null && <FournisseurAffichage value={unite}><ListeVentes titre={detail.titre} ventes={d.ventes.filter((v) => detail.ids.includes(v.id))} retros={d.retrocessions} societe={societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)}
        onFermer={() => setDetail(null)} onModifier={(v) => { setDetail(null); setEdition(v); }} /></FournisseurAffichage>}
      {edition !== null && avecDossier(edition) && references !== null && <FormulaireDossier societe={edition.societe} vente={edition} references={references}
        onFermer={() => setEdition(null)} onFait={fini} />}
      {edition !== null && !avecDossier(edition) && <FormulaireVente societe={societe} vente={edition === 'nouvelle' ? null : edition} annee={annee} mois={vue === 'mois' ? mois : null}
        negociateurs={negos} references={references} onFermer={() => setEdition(null)} onFait={fini} />}
    </div>
  );
}

// ── Le mois ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 🔴 LOT BS — le choix du mode retenu par le navigateur (et repris de l'adresse). */
export const CLE_MODE_MOIS = 'trx-mois-mode';
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
type MesureTrx = 'ca' | 'nombre';
const cumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);

function VueMois({ d, tout, annee, mois, jour, mode, onMois, onDetail, onEdition, onRelire, references }: {
  d: DonneesSociete; tout: DonneesSociete; annee: number; mois: number; jour: string; mode: ModeMois; onMois: (m: number) => void;
  onDetail: (x: Detail) => void; onEdition: (v: Vente) => void; onRelire: () => void;
  /** 🔴 LOT BU — les références (négociateurs, apporteurs, personnes…) de la fiche dépliée d'une vente ; null : pas encore lues (lecture seule). */
  references: References | null;
}) {
  // 🔴 LOT BU — la fiche d'une vente dépliée dans les listes du mois : LA fiche de l'onglet « Compromis » (`DetailAffaire`, `DetailMiroir`), son
  // hôte (les mêmes fenêtres), et l'unité « HT | TTC » retenue par le navigateur (celle du sélecteur de l'onglet « Compromis »).
  const U = useUnite();
  const refs: References = references ?? { lotD: false, negociateurs: [], apporteurs: [], personnes: [] };
  const { hote, fenetres } = useHoteAffaires({ d: { ...refs, disponible: tout.disponible && references !== null, aujourdhui: tout.aujourdhui }, vue: d.societe, societe: d.societe,
    statutDuLibelle: resolveurDe(d.statutsNegociateurs), relire: onRelire, ventes: tout.ventes });
  const fiches = { hote, references: refs };
  const [cumul, setCumul] = useState(false);
  // 🔴 LOT BS — « CA | Nombre » (l'organisation du graphique de la Location) ; gardé dans l'adresse (&mesure=nombre).
  const [mesure, setMesure] = useState<MesureTrx>(() => (parametre('mesure') === 'nombre' ? 'nombre' : 'ca'));
  useEffect(() => { ecrireAdresse({ mesure: mesure === 'nombre' ? 'nombre' : null }); }, [mesure]);
  const M = motsEnUnite(MOTS_MODE[mode], U.MOT);
  // Le mode change ce qu'on additionne (vendu, compromis à leur date, ou les deux), jamais comment (`caHt`, `totaux`).
  const T = totauxMoisMode(d, annee, mois, mode);
  const T1 = totauxMoisMode(d, annee - 1, mois, mode);
  const parMois = caHtParMoisMode(d.ventes, annee, d.societe, mode);
  const parMoisN1 = caHtParMoisMode(d.ventes, annee - 1, d.societe, mode);
  const vendusN = caHtParMois(d.ventes, annee, d.societe);
  const vendusN1 = caHtParMois(d.ventes, annee - 1, d.societe);
  const nbParMois = nombreParMoisMode(d.ventes, annee, mode);
  const nbParMoisN1 = nombreParMoisMode(d.ventes, annee - 1, mode);
  const nbVendusN = nombreParMoisMode(d.ventes, annee, 'vendu');
  const nbVendusN1 = nombreParMoisMode(d.ventes, annee - 1, 'vendu');
  const sansVenduN1 = !d.ventes.some((v) => v.annee === annee - 1);
  const sansN1 = mode === 'vendu' ? sansVenduN1 : mode === 'compromis' ? !aDesCompromisDates(d.ventes, annee - 1) : sansVenduN1 && !aDesCompromisDates(d.ventes, annee - 1);
  const motSansN1 = mode === 'compromis' ? `${annee - 1} : aucun compromis daté` : `${annee - 1} : non importé`;
  const cumulN = cumuler(parMois);
  const cumulN1 = cumuler(parMoisN1);
  const anneeEnCours = Number(jour.slice(0, 4));
  const dernierMois = annee < anneeEnCours ? 12 : annee > anneeEnCours ? 0 : Number(jour.slice(5, 7));
  const ventes = ventesDuMois(d.ventes, annee, mois);
  // 🔴 LOT BT — « vendu + compromis » : seulement les compromis pas encore passés en acte (une affaire signée est déjà dans les ventes).
  const compDuMois = compromisDuMode(d.ventes, annee, mois, mode);
  const listeMode = mode === 'vendu' ? ventes : mode === 'compromis' ? compDuMois : [...ventes, ...compDuMois];
  const retros = retrosDuMois(d.retrocessions, annee, mois);
  const retrosMode = mode === 'compromis' ? [] : retros;
  const comp = compromisDeLAnnee(d.ventes, annee);
  const sansDate = mode === 'vendu' ? [] : compromisSansDate(d.ventes, annee);
  const aConfirmer = ventesDeLAnnee(d.ventes, annee).filter(moisAConfirmer);
  const aRattacher = d.aRattacher.filter((x) => x.annee === annee && x.mois === mois);
  const idsDuMois = (k: number): number[] => [...(mode === 'compromis' ? [] : ventesDuMois(d.ventes, annee, k)), ...compromisDuMode(d.ventes, annee, k, mode)].map((v) => v.id);
  /** L'encart d'un mois (ou de son cumul) : l'année et N−1 ; « Vendu + compromis » : le vendu, les compromis, puis le total. */
  const parts = (vendu: number, total: number) => (mode === 'tous' ? { parts: [{ mot: 'Vendu', ca: vendu }, { mot: 'Compromis', ca: total - vendu }] } : {});
  // 🔴 LOT BW — le graphique dans l'unité choisie (le nombre ne change pas) ; l'encart dit « CA TTC » et l'autre unité entre parenthèses.
  const sc = (xs: readonly number[]): number[] => xs.map(U.en);
  const info = (k: number, cumule: boolean): InfoBarre => {
    const aVenir = k > dernierMois;
    const titre = cumule ? `Cumul à fin ${NOMS_MOIS[k - 1].toLowerCase()}` : NOMS_MOIS[k - 1];
    if (mesure === 'nombre') {
      const [n, n1, v, v1] = cumule ? [cumuler(nbParMois), cumuler(nbParMoisN1), cumuler(nbVendusN), cumuler(nbVendusN1)] : [nbParMois, nbParMoisN1, nbVendusN, nbVendusN1];
      return { titre, compte: cumule ? `${M.compte} (cumul)` : M.compte, ...(mode === 'compromis' ? { sansN1: motSansN1 } : {}),
        courant: { libelle: String(annee), ca: aVenir ? null : n[k - 1], nb: null, ...(aVenir ? {} : parts(v[k - 1], n[k - 1])) },
        precedent: sansN1 ? null : { libelle: String(annee - 1), ca: n1[k - 1], nb: null, ...parts(v1[k - 1], n1[k - 1]) } };
    }
    const [c, c1, v, v1] = (cumule ? [cumulN, cumulN1, cumuler(vendusN), cumuler(vendusN1)] : [parMois, parMoisN1, vendusN, vendusN1]).map(sc);
    // Le nombre de l'encart reste celui du MOIS, même en cumul (l'encart d'avant ce lot, à l'identique).
    const nb = nbParMois;
    const nb1 = nbParMoisN1;
    return { titre, motNb: M.compte, motCa: `CA ${U.MOT}`, autre: U.autre, ...(mode === 'compromis' ? { sansN1: motSansN1 } : {}),
      courant: { libelle: String(annee), ca: aVenir ? null : c[k - 1], nb: aVenir ? null : nb[k - 1], ...(aVenir ? {} : parts(v[k - 1], c[k - 1])) },
      precedent: sansN1 ? null : { libelle: String(annee - 1), ca: c1[k - 1], nb: nb1[k - 1], ...parts(v1[k - 1], c1[k - 1]) } };
  };
  const libMois = `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`;
  const moisMot = NOMS_MOIS[mois - 1].toLowerCase();
  const ouvrir = (titre: string, ids: number[]) => () => onDetail({ titre, ids });
  const nombre = mesure === 'nombre';
  const valeurs = nombre ? nbParMois : sc(parMois);
  const valeursN1 = nombre ? nbParMoisN1 : sc(parMoisN1);
  const basN = nombre ? nbVendusN : sc(vendusN);
  const basN1 = nombre ? nbVendusN1 : sc(vendusN1);
  const motGraphe = nombre ? M.onglet.toLowerCase() : M.graphe;
  return <>
    <div className="tdb-onglets" role="tablist" aria-label={`Mois de ${annee}`}>
      {NOMS_MOIS.map((m, i) => (
        <button key={m} type="button" role="tab" aria-selected={mois === i + 1} className="tdb-onglet" onClick={() => onMois(i + 1)} data-onglet-mois={i + 1}>{m}</button>
      ))}
    </div>
    <ul className="tdb-tuiles" aria-label="L’essentiel du mois" data-mode-ecran={mode}>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${libMois}`, T.ids)} data-tuile="ca-mois">
        <span className="tdb-tuile-mot">{M.ca} — {moisMot}</span><strong className="tdb-tuile-valeur">{U.e(T.caHt)}</strong><Autre ht={T.caHt} />
        <span className="tdb-tuile-n1">{sansN1 ? motSansN1 : `${U.e(T1.caHt)} en ${annee - 1} (${signePct(variation(T.caHt, T1.caHt))})`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${M.liste} — ${libMois}`, T.ids)} data-tuile="ventes-mois">
        <span className="tdb-tuile-mot">{M.nombre} — {moisMot}</span><strong className="tdb-tuile-valeur">{T.nbVentes}</strong>
        <span className="tdb-tuile-n1">{sansN1 ? motSansN1 : `${T1.nbVentes} en ${annee - 1}`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`${mode === 'vendu' ? 'CA' : M.ca.replace(` ${U.MOT}`, '')} cumulé ${annee}`, Array.from({ length: mois }, (_, i) => idsDuMois(i + 1)).flat())} data-tuile="cumul">
        <span className="tdb-tuile-mot">{mode === 'vendu' ? `CA ${U.MOT}` : M.ca.replace(` ${U.MOT}`, '')} cumulé {annee} (à fin {moisMot})</span><strong className="tdb-tuile-valeur">{U.e(cumulN[mois - 1])}</strong><Autre ht={cumulN[mois - 1]} />
        <span className="tdb-tuile-n1">{sansN1 ? motSansN1 : `${U.e(cumulN1[mois - 1])} en ${annee - 1} (${signePct(variation(cumulN[mois - 1], cumulN1[mois - 1]))})`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={ouvrir(`Compromis en cours — ${annee}`, comp.map((v) => v.id))} data-tuile="compromis">
        <span className="tdb-tuile-mot">Compromis en cours ({annee}, {U.MOT})</span><strong className="tdb-tuile-valeur">{U.e(comp.reduce((s, v) => s + caHt(v, d.societe), 0))}</strong><Autre ht={comp.reduce((s, v) => s + caHt(v, d.societe), 0)} />
        <span className="tdb-tuile-n1">{comp.length} compromis — le prévisionnel</span></button></li>
    </ul>
    {/* 🔴 LOT BS — un compromis sans date de compromis n'a pas de mois : compté à part, jamais placé dans un mois. */}
    {sansDate.length > 0 && <p className="loc-muet trx-sans-date" data-compromis-sans-date>
      <button type="button" className="tdb-chiffre" onClick={ouvrir(`Compromis sans date — ${annee}`, sansDate.map((v) => v.id))}>{sansDate.length} compromis sans date</button>
      {' '}— non placés dans un mois ({U.e(sansDate.reduce((t, v) => t + caHt(v, d.societe), 0))} {U.MOT})</p>}

    {/* 🔴 LOT BS (Arno) — l'organisation du graphique « Mois par mois » de la Location : son en-tête (la bascule « ⇄ Mensuel » / « Cumul », les
        onglets de mesure à droite), ses barres (N pleines, N−1 hachurées), sa légende, son encart à droite ; un mois s'ouvre d'un clic. « Vendu +
        compromis » : la barre EMPILÉE (vendu en bas, compromis au-dessus, plus clair ; N−1 hachurée, même empilement). */}
    <section className="tdb-section" aria-labelledby="trx-histo" data-bloc="histogramme-mois" data-mesure={mesure}>
      <EnteteGraphe<MesureTrx> id="trx-histo" mesure={mesure} onMesure={setMesure} cumul={cumul} onBasculer={() => setCumul((c) => !c)} motPeriode="Mensuel"
        mesures={[{ cle: 'ca', mot: 'CA' }, { cle: 'nombre', mot: M.onglet }]}
        titre={<>Mois par mois — {annee} <small className="loc-muet">({motGraphe}{cumul ? ', cumulé depuis janvier' : ''} ; un mois s’ouvre d’un clic)</small></>} />
      {cumul ? (
        <CourbeCumul courant={cumuler(valeurs).slice(0, dernierMois)} n1={sansN1 ? null : cumuler(valeursN1)} annee={annee} selection={mois} entier={nombre}
          aria={`${motGraphe} cumulé ${annee}`} bulle={(k) => info(k, true)} onChoisir={onMois} />
      ) : (
        <Histogramme attribut="data-barre-mois" courante={mois} onChoisir={onMois} entier={nombre} aria={`${motGraphe} par mois, ${annee}`}
          legende={{ courant: String(annee), n1: sansN1 ? null : String(annee - 1) }}
          barres={valeurs.map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernierMois ? null : v, n1: sansN1 ? null : valeursN1[i], info: info(i + 1, false),
            ...(mode === 'tous' ? { empile: { bas: basN[i], basN1: sansN1 ? null : basN1[i] } } : {}) }))} />
      )}
      {mode === 'tous' && !cumul && <p className="loc-muet trx-legende-empile" data-legende-empile>
        <span className="trx-pastille-empile trx-pastille-empile--bas" aria-hidden="true" /> vendu · <span className="trx-pastille-empile trx-pastille-empile--haut" aria-hidden="true" /> compromis (au-dessus)</p>}
    </section>

    {/* 🔴 LOT CA — l'en-tête : le titre puis le nombre « (3) » ; les ventes en CARTES (celles de l'onglet « Compromis »). */}
    {mode !== 'compromis' && <section className="tdb-section trx-liste-affaires" aria-labelledby="trx-ventes" data-bloc="ventes-mois">
      <div className="trx-entete-gauche"><h3 id="trx-ventes">Les ventes du mois — {libMois}</h3><span className="trx-compteur" data-compteur-liste>({ventes.length})</span></div>
      <CartesVentes ventes={ventes} retros={tout.retrocessions} vide="Aucune vente ce mois." societe={d.societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)} fiches={fiches} />
    </section>}
    {mode !== 'vendu' && <section className="tdb-section trx-liste-affaires" aria-labelledby="trx-compromis-mois" data-bloc="compromis-du-mois">
      <div className="trx-entete-gauche"><h3 id="trx-compromis-mois">{mode === 'tous' ? 'Les compromis en cours du mois' : 'Les compromis du mois'} — {libMois}</h3>
        <span className="trx-compteur" data-compteur-liste>({compDuMois.length})</span>
        <small className="loc-muet">(date du compromis{mode === 'tous' ? ' ; pas encore signés' : ''})</small></div>
      <CartesVentes ventes={compDuMois} retros={tout.retrocessions} vide="Aucun compromis signé ce mois." societe={d.societe} statutDuLibelle={resolveurDe(d.statutsNegociateurs)} fiches={fiches} />
    </section>}
    {fenetres}

    <section className="tdb-section" aria-labelledby="trx-resultat" data-bloc="resultat-mois">
      <h3 id="trx-resultat">Résultat de l’agence — {libMois}{mode === 'vendu' ? '' : <small className="loc-muet"> ({LIBELLE_MODE[mode].toLowerCase()})</small>}</h3>
      <dl className="trx-resultat">
        <dt>CA {U.MOT}</dt><dd><Mt ht={T.caHt} donnees={{ 'data-ca-mois': '' }} /></dd>
        <dt>− Rétrocessions d’apporteurs ({U.MOT})</dt><dd><Mt ht={T.retroHt} /></dd>
        {T.interCabinetHt > 0 && <><dt>− Inter-cabinet vers nos autres sociétés ({U.MOT})</dt><dd><Mt ht={T.interCabinetHt} donnees={{ 'data-inter-cabinet-mois': '' }} /></dd></>}
        {T.exterieurHt > 0 && <><dt>− Inter-cabinet extérieur ({U.MOT})</dt><dd><Mt ht={T.exterieurHt} donnees={{ 'data-exterieur-mois': '' }} /></dd></>}
        <dt>− Commissions des négociateurs indépendants ({U.MOT})</dt><dd><Mt ht={T.payeHt} donnees={{ 'data-paye-deduite': '' }} /></dd>
        <dt className="trx-total">= Reste à l’agence ({U.MOT})</dt><dd className={`trx-total tdb-signe tdb-signe--${sensDe(T.resteHt)}`}><Mt ht={T.resteHt} donnees={{ 'data-reste-agence': '' }} /></dd>
        <NonDeduits T={T} />
      </dl>
      <p className="loc-muet">Les rétrocessions comptent sur le mois où elles sont saisies (comme dans les fichiers), rattachées ou « à répartir »{mode === 'vendu' ? '' : ' : avec les ventes signées ; un compromis ne compte que l’apporteur de sa répartition'}.</p>
    </section>

    <BlocReplie id="trx-negos" section="negociateurs" titre={<>Espace par négociateur — {libMois}</>}
      resume={`${parNegociateur(listeMode, retrosMode, d.societe).length} négociateur(s)`} donnees={{ 'data-bloc': 'negociateurs-mois' }}>
      <TableNegociateurs lignes={parNegociateur(listeMode, retrosMode, d.societe, resolveurDe(d.statutsNegociateurs))} rattache={partAgenceRattacheeHt(listeMode, d.societe)} onDetail={onDetail} periode={libMois} />
    </BlocReplie>

    <section className="tdb-section" aria-labelledby="trx-apporteurs" data-bloc="apporteurs-mois">
      <h3 id="trx-apporteurs">Apporteurs du mois — {libMois} <span className="loc-pastille">{retros.length}</span></h3>
      <OutilRetrocessions retros={retros} ventes={tout.ventes} societe={d.societe} annee={annee} mois={mois} disponible={d.disponible} onRelire={onRelire} />
    </section>

    {aRattacher.length > 0 && (
      <section className="tdb-section" data-bloc="a-rattacher">
        <h3>Montants saisis sans vente — à rattacher <span className="loc-pastille">{aRattacher.length}</span></h3>
        <p className="loc-muet">Saisis en dur dans le fichier, sans vente derrière : montrés ici, jamais ajoutés au CA.</p>
        <TableARattacher lignes={aRattacher} />
      </section>
    )}

    <BlocReplie id="trx-compromis" section="compromis" titre={<>Compromis en cours — {annee}</>} resume={`${comp.length} · ${eur(sommeAffichee(comp.map((v) => U.en(caHt(v, d.societe)))))} ${U.MOT}`}
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
export function Mt({ ht: montantHt, ttc, donnees, classe }: { ht: number; ttc?: number; donnees?: Record<string, string>; classe?: string }) {
  const u = useAffichage();
  const t = ttc ?? montantHt * TVA;
  const [grand, petit, motPetit] = u === 'ht' ? [montantHt, t, MOT_UNITE.ttc] : [t, montantHt, MOT_UNITE.ht];
  return <span className="trx-mt-liste"><span className="trx-mt-liste-grand"><span className={classe} {...donnees}>{eur(grand)}</span>{ESPACE}{MOT_UNITE[u]}</span> <small className="trx-montant-autre" data-montant-autre>({eur(petit)}{ESPACE}{motPetit})</small></span>;
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
const motsEnUnite = <T extends Record<string, string>>(m: T, mot: string): T => Object.fromEntries(Object.entries(m).map(([k, x]) => [k, x.replace('CA HT', `CA ${mot}`)])) as T;

function TableVentes({ ventes, retros, onModifier, vide, societe = null, statutDuLibelle }: { ventes: readonly Vente[]; retros: readonly Retrocession[]; onModifier: (v: Vente) => void; vide: string;
  /** LOT Q — le statut des négociateurs importés : le reste à l'agence ne déduit que la paye des indépendants. */
  statutDuLibelle?: StatutDuLibelle;
  /** LOT D — la société vue : la part d'une vente répartie s'affiche sous ses honoraires. */
  societe?: Societe | null }) {
  const u = useAffichage();
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
              <td data-mot="Négociateur(s)">{negociateursDe(v).join(', ')}</td>
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
  societe: Societe; statutDuLibelle?: StatutDuLibelle; fiches: { hote: HoteDetail; references: References } }) {
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
 * 🔴 LOT AY (Arno) — « CA généré HT » : ses commissions (la paye) + ce qui est rattaché à son CA. 🔴 LOT BI — côté par côté : un associé compte
 * 100 % des honoraires nets des côtés qu'il tient (sa paye d'un tel côté n'est pas ajoutée deux fois). Une mesure : ni le CA de la société, ni le
 * reste à l'agence n'en changent.
 */
function TableNegociateurs({ lignes, rattache, onDetail, periode }: { lignes: ReturnType<typeof parNegociateur>; rattache: ReadonlyMap<string, number>; onDetail: (x: Detail) => void; periode: string }) {
  const MOT = MOT_UNITE[useAffichage()];
  if (lignes.length === 0) return <p className="loc-muet">Aucune vente sur la période.</p>;
  return (
    <table className="tdb-table tdb-table--large" data-table-negociateurs>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Statut</th><th scope="col">Ventes</th><th scope="col">CA {MOT} porté</th><th scope="col">Paye {MOT}</th><th scope="col">CA généré {MOT}</th><th scope="col">Rétrocessions {MOT}</th></tr></thead>
      <tbody>{lignes.map((l) => (
        <tr key={l.negociateur} data-negociateur={l.negociateur}>
          <th scope="row">{l.negociateur}</th>
          {/* LOT Q — son statut et ce que devient sa paye dans le reste à l'agence. */}
          <td data-mot="Statut" data-statut-negociateur={l.negociateur} className={l.payeHt > 0 && classeCommission(l.statut) === 'a_renseigner' ? 'trx-alerte' : undefined}>{libelleStatut(l.statut)}
            {l.payeHt > 0 && <>{' — '}{classeCommission(l.statut) === 'independant' ? 'paye déduite' : classeCommission(l.statut) === 'interne' ? 'paye interne, non déduite' : 'paye non déduite'}</>}</td>
          <td data-mot="Ventes"><button type="button" className="tdb-chiffre" onClick={() => onDetail({ titre: `${l.negociateur} — ${periode}`, ids: l.ids })} disabled={l.ids.length === 0}>{l.nbVentes}</button></td>
          <td data-mot={`CA ${MOT} porté`}><Mt ht={l.caHt} /></td><td data-mot={`Paye ${MOT}`}><Mt ht={l.payeHt} /></td>
          <td data-mot={`CA généré ${MOT}`}><Mt ht={l.payeHt + (rattache.get(l.negociateur) ?? 0)} donnees={{ 'data-ca-genere': l.negociateur }} /></td><td data-mot={`Rétrocessions ${MOT}`}><Mt ht={l.retroHt} /></td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function TableARattacher({ lignes }: { lignes: readonly CaARattacher[] }) {
  return (
    <table className="tdb-table tdb-table--large" data-table-a-rattacher>
      <thead><tr><th scope="col">Négociateur</th><th scope="col">Montant TTC</th><th scope="col">Origine</th></tr></thead>
      <tbody>{lignes.map((x) => (
        <tr key={x.id}><th scope="row">{x.negociateur}</th><td data-mot="Montant TTC">{eur(x.montantTtc)}</td>
          <td data-mot="Origine">{x.libelle ?? ''} <span className="trx-source">{x.sourceOnglet} › {x.sourceCellule}</span></td></tr>
      ))}</tbody>
    </table>
  );
}

/**
 * 🔴 D5 — LE PETIT OUTIL DE RATTACHEMENT : chaque rétrocession du mois se rattache à la main à la bonne vente (celles du négociateur
 * et du mois d'abord), ou redevient « à répartir » ; réversible et journalisé (son historique, avec « Annuler »).
 */
function OutilRetrocessions({ retros, ventes, societe, annee, mois, disponible, onRelire }: {
  retros: readonly Retrocession[]; ventes: readonly Vente[]; societe: Societe; annee: number; mois: number; disponible: boolean; onRelire: () => void;
}) {
  const [motif, setMotif] = useState<string | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  const [saisie, setSaisie] = useState(false);
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
    {retros.length === 0 ? <p className="loc-muet">Aucune rétrocession ce mois.</p> : (
      <table className="tdb-table tdb-table--large" data-table-retrocessions>
        <thead><tr><th scope="col">Négociateur</th><th scope="col">Montant TTC</th><th scope="col">Apporteur</th><th scope="col">Vente</th><th scope="col">Historique</th></tr></thead>
        <tbody>{retros.map((r) => {
          const p = ventesProposees(r, ventes);
          const options = [...p.duMois, ...p.autres].map((v) => ({ id: v.id, libelle: `${v.libelle} — ${eur(v.honorairesTtc)} TTC${v.mois === null ? ` (${v.annee})` : ` (${moisCourt(v.annee, v.mois)})`}` }));
          return (
            <tr key={r.id} data-retrocession={r.id}>
              <th scope="row">{r.negociateur}{r.sourceCellule !== null && <><br /><span className="trx-source">{r.sourceOnglet} › {r.sourceCellule}{r.libelle ? ` · ${r.libelle}` : ''}</span></>}</th>
              <td data-mot="Montant TTC">{eur(r.montantTtc)}</td>
              <td data-mot="Apporteur">{r.apporteur ?? (r.venteId !== null ? parId.get(r.venteId)?.apporteur : null) ?? <span className="loc-muet">{APPORTEUR_NON_NOMME}</span>}</td>
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

function SaisieRetro({ societe, annee, mois, onFait }: { societe: Societe; annee: number; mois: number; onFait: () => void }) {
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
      <label>Négociateur<input value={negociateur} onChange={(e) => setNegociateur(e.target.value)} required /></label>
      <label>Montant TTC<input value={montantTtc} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" required /></label>
      <label>Apporteur<input value={apporteur} onChange={(e) => setApporteur(e.target.value)} /></label>
      {motif !== null && <p className="trx-erreur trx-plein" role="alert">{motif}</p>}
      <div className="trx-actions trx-plein"><button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer (à répartir)</button></div>
    </form>
  );
}

// ── L'année ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

function VueAnnee({ d, annees, debut, fin, jour, onDetail, onAnnee }: {
  d: DonneesSociete; annees: readonly number[]; debut: number; fin: number; jour: string; onDetail: (x: Detail) => void; onAnnee: (a: number) => void;
}) {
  const [cumul, setCumul] = useState(false);
  const U = useUnite();
  const periode = annees.filter((a) => a >= debut && a <= fin);
  const libelle = debut === fin ? String(debut) : `${debut} → ${fin}`;
  const H = historique(d, annees);
  const HP = H.filter((h) => periode.includes(h.annee));
  const ventesP = d.ventes.filter((v) => v.statut === 'vendue' && periode.includes(v.annee) && compteDansSociete(v));
  const retrosP = d.retrocessions.filter((r) => periode.includes(r.annee));
  const T = totaux(ventesP, retrosP, d.societe, resolveurDe(d.statutsNegociateurs));
  const duree = fin - debut + 1;
  const precedente = annees.filter((a) => a >= debut - duree && a <= debut - 1);
  const TP = precedente.length === 0 ? null : totaux(d.ventes.filter((v) => v.statut === 'vendue' && precedente.includes(v.annee) && compteDansSociete(v)), d.retrocessions.filter((r) => precedente.includes(r.annee)), d.societe, resolveurDe(d.statutsNegociateurs));
  const libPrec = precedente.length === 0 ? '' : duree === 1 ? String(debut - 1) : `${debut - duree} → ${debut - 1}`;
  const compFin = compromisDeLAnnee(d.ventes, fin);
  const parMois = caHtParMois(d.ventes, fin, d.societe);
  const parMoisN1 = caHtParMois(d.ventes, fin - 1, d.societe);
  const sansN1 = !d.ventes.some((v) => v.annee === fin - 1);
  const anneeEnCours = Number(jour.slice(0, 4));
  const dernierMois = fin < anneeEnCours ? 12 : fin > anneeEnCours ? 0 : Number(jour.slice(5, 7));
  const nb = (a: number, k: number): number => ventesDuMois(d.ventes, a, k).length;
  const negos = parNegociateur(ventesP, retrosP, d.societe, resolveurDe(d.statutsNegociateurs));
  const apporteurs = parApporteur(retrosP, d.ventes);
  return <>
    <p className="tdb-periode">Période : <strong>{libelle}</strong></p>
    <ul className="tdb-tuiles" aria-label={`L’essentiel — ${libelle}`}>
      <li><button type="button" className="tdb-tuile" onClick={() => onDetail({ titre: `Ventes — ${libelle}`, ids: T.ids })} data-tuile="ca-periode">
        <span className="tdb-tuile-mot">CA {U.MOT} <small>({libelle})</small></span><strong className="tdb-tuile-valeur">{U.e(T.caHt)}</strong><Autre ht={T.caHt} />
        <span className="tdb-tuile-n1">{TP === null ? 'Période précédente : —' : `${libPrec} : ${U.e(TP.caHt)} · ${ecartEur(U.en(T.caHt - TP.caHt))} (${signePct(variation(T.caHt, TP.caHt))})`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={() => onDetail({ titre: `Ventes — ${libelle}`, ids: T.ids })} data-tuile="ventes-periode">
        <span className="tdb-tuile-mot">Ventes <small>({libelle})</small></span><strong className="tdb-tuile-valeur">{T.nbVentes}</strong>
        <span className="tdb-tuile-n1">{TP === null ? 'Période précédente : —' : `${libPrec} : ${TP.nbVentes}`}</span></button></li>
      <li><button type="button" className="tdb-tuile" onClick={() => onDetail({ titre: `Compromis en cours — ${fin}`, ids: compFin.map((v) => v.id) })} data-tuile="compromis-periode">
        <span className="tdb-tuile-mot">Compromis en cours <small>({fin}, {U.MOT})</small></span><strong className="tdb-tuile-valeur">{U.e(compFin.reduce((s, v) => s + caHt(v, d.societe), 0))}</strong><Autre ht={compFin.reduce((s, v) => s + caHt(v, d.societe), 0)} />
        <span className="tdb-tuile-n1">{compFin.length} compromis — le prévisionnel</span></button></li>
      <li><div className="tdb-tuile" data-tuile="reste-periode">
        <span className="tdb-tuile-mot">Reste à l’agence {U.MOT} <small>({libelle})</small></span><strong className="tdb-tuile-valeur">{U.e(T.resteHt)}</strong><Autre ht={T.resteHt} />
        <span className="tdb-tuile-n1">après {U.e(T.retroHt)} de rétrocessions{T.interCabinetHt + T.exterieurHt > 0 ? `, ${U.e(T.interCabinetHt + T.exterieurHt)} d’inter-cabinet` : ''} et {U.e(T.payeHt)} de paye (indépendants)</span>
        {T.internesHt + T.aRenseignerHt > 0 && <span className="tdb-tuile-n1" data-non-deduits-tuile>{U.e(T.internesHt + T.aRenseignerHt)} de paye non déduite (internes, statut à renseigner)</span>}</div></li>
    </ul>

    {HP.length > 0 && (
      <section className="tdb-section" aria-labelledby="trx-h" data-bloc="annee-par-annee">
        <div className="trx-barre">
          <h3 id="trx-h">Année par année <small className="loc-muet">(CA {U.MOT}{cumul ? `, cumulé depuis ${debut}` : ''} ; une année s’ouvre d’un clic)</small></h3>
          <button type="button" className="tdb-bascule-cumul" onClick={() => setCumul((c) => !c)} data-cumul-etat={cumul ? 'cumul' : 'annuel'}>
            <span className="tdb-bascule-cumul-icone" aria-hidden="true">⇄</span><span>{cumul ? 'Cumul' : 'Annuel'}</span></button>
        </div>
        <CourbeAnnees lignes={HP.map((h) => ({ annee: h.annee, nbBaux: h.nbVentes, nb: h.nbVentes, ca: U.en(h.caHt), caNet: U.en(h.resteHt), apporteurs: U.en(h.retroHt), commission: null }))}
          annee={fin} onAnnee={onAnnee} cumul={cumul} motNb="Ventes" unite={{ motCa: `CA ${U.MOT}`, autre: U.autre }} />
      </section>
    )}

    <section className="tdb-section" aria-labelledby="trx-m" data-bloc="mois-annee">
      <h3 id="trx-m">{fin} mois par mois, face à {fin - 1} <small className="loc-muet">(CA {U.MOT})</small></h3>
      <Histogramme attribut="data-barre-mois-annee" courante={dernierMois === 0 ? 1 : dernierMois} onChoisir={() => undefined} aria={`CA ${U.MOT} par mois, ${fin}`}
        legende={{ courant: String(fin), n1: sansN1 ? null : String(fin - 1) }}
        barres={parMois.map(U.en).map((v, i) => ({ cle: i + 1, libelle: COURT[i], valeur: i + 1 > dernierMois ? null : v, n1: sansN1 ? null : U.en(parMoisN1[i]),
          info: { titre: NOMS_MOIS[i], motNb: 'Ventes', motCa: `CA ${U.MOT}`, autre: U.autre, courant: { libelle: String(fin), ca: i + 1 > dernierMois ? null : v, nb: i + 1 > dernierMois ? null : nb(fin, i + 1) },
            precedent: sansN1 ? null : { libelle: String(fin - 1), ca: U.en(parMoisN1[i]), nb: nb(fin - 1, i + 1) } } }))} />
    </section>

    <section className="tdb-section" aria-labelledby="trx-resume" data-bloc="resume-periode">
      <h3 id="trx-resume">Résumé — {libelle}</h3>
      <dl className="trx-resultat">
        <dt>Ventes</dt><dd>{T.nbVentes}</dd>
        <dt>CA {U.MOT}</dt><dd><Mt ht={T.caHt} donnees={{ 'data-ca-periode': '' }} /></dd>
        <dt>dont ventes « mois à confirmer »</dt><dd>{eur(sommeAffichee(HP.map((h) => U.en(h.moisAConfirmerHt))))} ({HP.reduce((s, h) => s + h.nbMoisAConfirmer, 0)})</dd>
        <dt>− Rétrocessions d’apporteurs ({U.MOT})</dt><dd><Mt ht={T.retroHt} /></dd>
        {T.interCabinetHt > 0 && <><dt>− Inter-cabinet vers nos autres sociétés ({U.MOT})</dt><dd><Mt ht={T.interCabinetHt} donnees={{ 'data-inter-cabinet-periode': '' }} /></dd></>}
        {T.exterieurHt > 0 && <><dt>− Inter-cabinet extérieur ({U.MOT})</dt><dd><Mt ht={T.exterieurHt} donnees={{ 'data-exterieur-periode': '' }} /></dd></>}
        <dt>− Commissions des négociateurs indépendants ({U.MOT})</dt><dd><Mt ht={T.payeHt} /></dd>
        <dt className="trx-total">= Reste à l’agence ({U.MOT})</dt><dd className="trx-total"><Mt ht={T.resteHt} donnees={{ 'data-reste-agence-periode': '' }} /></dd>
        <NonDeduits T={T} />
        <dt>Compromis en cours ({fin}, {U.MOT})</dt><dd><Mt ht={compFin.reduce((s, v) => s + caHt(v, d.societe), 0)} /></dd>
      </dl>
    </section>

    <BlocReplie id="trx-negos-annee" section="negociateurs" titre={<>Les négociateurs — {libelle}</>} resume={`${negos.length} négociateur(s) · CA ${U.MOT} ${eur(sommeAffichee(negos.map((l) => U.en(l.caHt))))}`}
      donnees={{ 'data-bloc': 'negociateurs-periode' }}>
      <TableNegociateurs lignes={negos} rattache={partAgenceRattacheeHt(ventesP, d.societe)} onDetail={onDetail} periode={libelle} />
    </BlocReplie>

    <BlocReplie id="trx-apporteurs-annee" section="apporteurs" titre={<>{periode.length > 1 ? 'Apporteur des années' : 'Apporteur de l’année'} — {libelle}</>}
      resume={`${apporteurs.length} apporteur(s) · rétrocessions ${eur(sommeAffichee(apporteurs.map((a) => U.en(a.retroHt))))} ${U.MOT}`} donnees={{ 'data-bloc': 'apporteurs-periode' }}>
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
    </BlocReplie>

    <section className="tdb-section" aria-labelledby="trx-histoire" data-bloc="toute-histoire">
      <h3 id="trx-histoire">Toute l’histoire — {annees[0]} → {annees.at(-1)}</h3>
      <table className="tdb-table tdb-table--large" data-table-histoire>
        <thead><tr><th scope="col">Année</th><th scope="col">Ventes</th><th scope="col">CA {U.MOT}</th><th scope="col">dont mois à confirmer</th><th scope="col">Compromis {U.MOT}</th>
          <th scope="col">Rétrocessions {U.MOT}</th><th scope="col">Reste agence {U.MOT}</th><th scope="col">Paye non déduite {U.MOT}</th><th scope="col">Évolution du CA</th></tr></thead>
        <tbody>{H.map((h, i) => (
          <tr key={h.annee} className={periode.includes(h.annee) ? 'tdb-fort' : undefined} data-annee-histoire={h.annee}>
            <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => onAnnee(h.annee)}>{h.annee}</button></th>
            <td data-mot="Ventes">{h.nbVentes}</td><td data-mot={`CA ${U.MOT}`}><Mt ht={h.caHt} /></td><td data-mot="dont mois à confirmer"><Mt ht={h.moisAConfirmerHt} /></td>
            <td data-mot={`Compromis ${U.MOT}`}><Mt ht={h.compromisHt} /></td><td data-mot={`Rétrocessions ${U.MOT}`}><Mt ht={h.retroHt} /></td><td data-mot={`Reste agence ${U.MOT}`}><Mt ht={h.resteHt} /></td>
            <td data-mot={`Paye non déduite ${U.MOT}`}><Mt ht={h.internesHt + h.aRenseignerHt} donnees={{ 'data-non-deduits-annee': String(h.annee) }} />{h.aRenseignerHt > 0 && <><br /><span className="trx-alerte">dont {U.e(h.aRenseignerHt)} à renseigner</span></>}</td>
            <td data-mot="Évolution du CA">{i === 0 ? '—' : signePct(variation(h.caHt, H[i - 1].caHt))}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
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

interface DonneesGlobal { disponible: boolean; aujourdhui: string; ventes: (EntreesGlobal['ventes'][number] & NoteAffichee)[]; gestion: GestionMois[]; location: Record<string, number> | null }

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
  const P = previsionnel(e, annee);
  const manque = (x: number | null): string => (x === null ? '—' : eur(x));
  const ventesSansMois = (s: Societe): number => d.ventes.filter((v) => v.statut === 'vendue' && v.annee === annee && v.mois === null && compteDansSociete({ double: v.double ?? null }))
    .reduce((t, v) => t + caHt(v, s), 0);
  // 🔴 LOT L — LA SYNTHÈSE PAR SOCIÉTÉ, puis le global : CRITERIMMO = vente + location + gestion ; MACJ = vente ; global = les deux
  // (+ les ventes à attribuer, comptées une fois dans aucune société). Face à N−1, prévisionnel des compromis compris.
  const synthese = syntheseGlobal(e, annee);
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
      <BlocAAttribuer notes={d.ventes.filter((v) => v.double != null).map((v) => ({ ...v, id: v.id ?? 0, libelle: v.libelle ?? '', double: v.double ?? null }))}
        disponible={d.disponible} onRelire={relire} />
      <form className="tdb-filtres" aria-label="Année" onSubmit={(x) => x.preventDefault()}>
        <label className="tdb-champ">Année
          <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
            onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
      </form>
      <ul className="tdb-tuiles" aria-label={`L’essentiel — ${annee}`}>
        <li><div className="tdb-tuile" data-tuile="global"><span className="tdb-tuile-mot">CA global HT ({annee})</span><strong className="tdb-tuile-valeur">{eur(A.totalHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.totalHt)} en {annee - 1} ({signePct(variation(A.totalHt, A1.totalHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="criterimmo"><span className="tdb-tuile-mot">CRITERIMMO HT <small>(vente + location + gestion)</small></span><strong className="tdb-tuile-valeur">{eur(A.criterimmoHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.criterimmoHt)} en {annee - 1} ({signePct(variation(A.criterimmoHt, A1.criterimmoHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="macj"><span className="tdb-tuile-mot">MACJ HT <small>(vente)</small></span><strong className="tdb-tuile-valeur">{eur(A.macjHt)}</strong>
          <span className="tdb-tuile-n1">{eur(A1.macjHt)} en {annee - 1} ({signePct(variation(A.macjHt, A1.macjHt))})</span></div></li>
        <li><div className="tdb-tuile" data-tuile="previsionnel"><span className="tdb-tuile-mot">Prévisionnel HT <small>(compromis en cours {annee})</small></span><strong className="tdb-tuile-valeur">{eur(P.totalHt)}</strong>
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
              <tr data-exterieur-global><th scope="row">Parts extérieures <small className="loc-muet">(inter-cabinet extérieur : dans le CA de la société porteuse, versé par elle)</small></th>
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
export function syntheseGlobal(e: EntreesGlobal, annee: number): LigneSynthese[] {
  const A = celluleGlobal(e, annee, null);
  const A1 = celluleGlobal(e, annee - 1, null);
  const P = previsionnel(e, annee);
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
export function EcranGestion() {
  const jour = aujourdhuiParis();
  const { lu, relire } = useTransaction<DonneesGlobal>('vue=global');
  const [annee, setAnnee] = useState(() => entier(parametre('annee'), 2000, 2100) ?? Number(jour.slice(0, 4)));
  const [ouvert, setOuvert] = useState<number | null>(null);
  useEffect(() => { ecrireAdresse({ annee: String(annee) }); }, [annee]);
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const annees = [...new Set([Number(jour.slice(0, 4)), ...d.gestion.map((g) => g.annee)])].sort((a, b) => a - b);
  const deLAnnee = (a: number): GestionMois[] => d.gestion.filter((g) => g.annee === a);
  const gestionDe = (m: number): GestionMois | null => d.gestion.find((g) => g.annee === annee && g.mois === m) ?? null;
  const somme = (gs: readonly GestionMois[], k: 'honorairesHt' | 'adhocHt' | 'salarieHt' | 'resteHt'): number | null =>
    (gs.every((g) => g[k] === null) ? null : gs.reduce((t, g) => t + (g[k] ?? 0), 0));
  const manque = (x: number | null): string => (x === null ? '—' : eur(x));
  const lots = (x: number | null): string => (x === null ? '—' : nombreFr(x));
  const N1 = somme(deLAnnee(annee - 1), 'honorairesHt');
  const H = somme(deLAnnee(annee), 'honorairesHt');
  return (
    <div className="tdb loc-page" data-ecran-gestion>
      <style>{CSS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-migration>{SANS_MIGRATION}</p>}
      <form className="tdb-filtres" aria-label="Année" onSubmit={(x) => x.preventDefault()}>
        <label className="tdb-champ">Année
          <ListeChoix options={[...annees].reverse().map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
            onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
      </form>
      <ul className="tdb-tuiles" aria-label={`La gestion — ${annee}`}>
        <li><div className="tdb-tuile" data-tuile="gestion-honoraires"><span className="tdb-tuile-mot">Honoraires de gestion HT ({annee})</span><strong className="tdb-tuile-valeur">{manque(H)}</strong>
          <span className="tdb-tuile-n1">{manque(N1)} en {annee - 1}{H !== null && N1 !== null ? ` (${signePct(variation(H, N1))})` : ''}</span></div></li>
        <li><div className="tdb-tuile" data-tuile="gestion-reste"><span className="tdb-tuile-mot">Reste HT ({annee})</span><strong className="tdb-tuile-valeur">{manque(somme(deLAnnee(annee), 'resteHt'))}</strong>
          <span className="tdb-tuile-n1">honoraires − ADHOC − salarié</span></div></li>
      </ul>
      <section className="tdb-section" aria-labelledby="trx-gestion-mois" data-bloc="gestion-mois">
        <h3 id="trx-gestion-mois">{annee} mois par mois <small className="loc-muet">(HT ; envoyé chaque mois par le comptable)</small></h3>
        <table className="tdb-table tdb-table--large" data-table-gestion>
          <thead><tr><th scope="col">Mois</th><th scope="col">Lots</th><th scope="col">Honoraires</th><th scope="col">ADHOC</th><th scope="col">Salarié</th><th scope="col">Reste</th>
            <th scope="col">Honoraires {annee - 1}</th><th scope="col">Saisie</th></tr></thead>
          <tbody>
            {NOMS_MOIS.map((nom, i) => {
              const g = gestionDe(i + 1);
              const g1 = d.gestion.find((x) => x.annee === annee - 1 && x.mois === i + 1) ?? null;
              return (
                <tr key={nom} data-mois-gestion={i + 1}>
                  <th scope="row">{nom}{g?.origine === 'import' && <span className="loc-pastille" title="Repris du fichier importé"> import</span>}</th>
                  <td data-mot="Lots">{lots(g?.nbLots ?? null)}</td><td data-mot="Honoraires" data-gestion-honoraires={i + 1}>{manque(g?.honorairesHt ?? null)}</td>
                  <td data-mot="ADHOC">{manque(g?.adhocHt ?? null)}</td><td data-mot="Salarié">{manque(g?.salarieHt ?? null)}</td><td data-mot="Reste">{manque(g?.resteHt ?? null)}</td>
                  <td data-mot={`Honoraires ${annee - 1}`}>{manque(g1?.honorairesHt ?? null)}</td>
                  <td data-mot="Saisie"><button type="button" className="trx-bouton-lien" onClick={() => setOuvert(i + 1)} disabled={!d.disponible} data-saisir-gestion={i + 1}>
                    {g === null ? 'Saisir' : 'Modifier'}</button></td>
                </tr>
              );
            })}
            <tr className="tdb-fort" data-total-gestion><th scope="row">Année {annee}</th><td data-mot="Lots">—</td>
              <td data-mot="Honoraires">{manque(H)}</td><td data-mot="ADHOC">{manque(somme(deLAnnee(annee), 'adhocHt'))}</td><td data-mot="Salarié">{manque(somme(deLAnnee(annee), 'salarieHt'))}</td>
              <td data-mot="Reste">{manque(somme(deLAnnee(annee), 'resteHt'))}</td><td data-mot={`Honoraires ${annee - 1}`}>{manque(N1)}</td><td data-mot="Saisie" /></tr>
          </tbody>
        </table>
      </section>
      <section className="tdb-section" aria-labelledby="trx-gestion-annees" data-bloc="gestion-annees">
        <h3 id="trx-gestion-annees">Année par année <small className="loc-muet">(HT)</small></h3>
        <table className="tdb-table tdb-table--large" data-table-gestion-annees>
          <thead><tr><th scope="col">Année</th><th scope="col">Mois saisis</th><th scope="col">Honoraires</th><th scope="col">ADHOC</th><th scope="col">Salarié</th><th scope="col">Reste</th><th scope="col">Évolution</th></tr></thead>
          <tbody>{annees.map((a, i) => {
            const h = somme(deLAnnee(a), 'honorairesHt');
            const p = i === 0 ? null : somme(deLAnnee(annees[i - 1]), 'honorairesHt');
            return (
              <tr key={a} className={a === annee ? 'tdb-fort' : undefined} data-annee-gestion={a}>
                <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => setAnnee(a)}>{a}</button></th>
                <td data-mot="Mois saisis">{deLAnnee(a).length}</td><td data-mot="Honoraires">{manque(h)}</td><td data-mot="ADHOC">{manque(somme(deLAnnee(a), 'adhocHt'))}</td>
                <td data-mot="Salarié">{manque(somme(deLAnnee(a), 'salarieHt'))}</td><td data-mot="Reste">{manque(somme(deLAnnee(a), 'resteHt'))}</td>
                <td data-mot="Évolution">{h === null || p === null ? '—' : signePct(variation(h, p))}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>
      {ouvert !== null && <SaisieGestion annee={annee} mois={ouvert} actuelle={gestionDe(ouvert)}
        onFermer={() => setOuvert(null)} onFait={() => { setOuvert(null); relire(); }} onRelire={relire} />}
    </div>
  );
}

/** La gestion d'un mois (CRITERIMMO) : nombre de lots, honoraires HT, ADHOC, salarié, reste — saisie, modifiée, journalisée. */
function SaisieGestion({ annee, mois, actuelle, onFermer, onFait, onRelire }: {
  annee: number; mois: number; actuelle: GestionMois | null; onFermer: () => void; onFait: () => void; onRelire: () => void;
}) {
  const txt = (x: number | null | undefined): string => (x === null || x === undefined ? '' : String(x).replace('.', ','));
  const [v, setV] = useState({ nbLots: txt(actuelle?.nbLots), honorairesHt: txt(actuelle?.honorairesHt), adhocHt: txt(actuelle?.adhocHt),
    salarieHt: txt(actuelle?.salarieHt), resteHt: txt(actuelle?.resteHt), note: actuelle?.note ?? '' });
  const [motif, setMotif] = useState<string | null>(null);
  const nombre = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')));
  const propose = resteGestionPropose({ honorairesHt: nombre(v.honorairesHt), adhocHt: nombre(v.adhocHt), salarieHt: nombre(v.salarieHt) });
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
          <form className="trx-form" onSubmit={(x) => { x.preventDefault(); void envoyer(); }}>
            {champ('nbLots', 'Nombre de lots')}{champ('honorairesHt', 'Honoraires HT')}{champ('adhocHt', 'ADHOC HT')}{champ('salarieHt', 'Salarié HT')}
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
