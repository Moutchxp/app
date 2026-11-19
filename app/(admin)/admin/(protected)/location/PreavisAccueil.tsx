'use client';

import { useEtatRetour } from '../_composants/NavigationRetour';
import { ListeChoix } from './ListeChoix';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, envoyer, useLecture } from './commun';
import { MESSAGE_SORTIE_GESTION } from './SortieLocataires';
import { FicheInterventionPreavis } from './FicheInterventionPreavis';
import { ficheDepuisEncart } from '../../../../lib/location/ficheIntervention';
import { cartoucheEdls, etapesPreavis, lignesSousTitre } from '../../../../lib/location/frisePreavis';

const aujourdhuiParis = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
import type { FinParcours } from './ParcoursPreavisSortie';
import { ValidationSortieEdls } from './ValidationSortieEdls';
import { BlocageEmailLocataires, useEmailsLocataires } from './EmailLocataireRequis';
import { aujourdhuiParisEcran, CSS_PREAVIS, MentionPreavis } from './Preavis';
import {
  ajouterMois, dateFrPreavis, EDL_MOIS_APRES_FIN, lireTri, trierPreavis, TRI_DEFAUT, verifierEtatDesLieux,
  type LignePreavisAccueil, type TriPreavis,
} from '../../../../lib/location/preavis';
import type { BailLogement, EncartLogement } from '../../../../lib/location/sortieLocataires';
import {
  heureFinProposee, mentionEdls, pastilleEdls, verifierPlanification, type EdlsAffiche,
} from '../../../../lib/location/edls';
import { statutPreavis } from '../../../../lib/location/preavis';
import { compterPreavisEnAlerte } from '../../../../lib/location/previsite';
import { estFiltreLigne, lignePasseFiltre, statutsLigne, type FiltreLigne } from '../../../../lib/location/statutLignePreavis';
import { colonnesRdv, LIBELLE_ETAT_MISSION, missionDeLigne, ecrireModeTriRdv, LIBELLE_TRI_RDV, lireModeTriRdv, maintenantParis, MODE_TRI_RDV_DEFAUT, modeTriRdvSuivant, ordonnerParRdv, type ModeTriRdv } from '../../../../lib/location/triRdvPreavis';
import { Icone } from './IconesCompteRendu';
import { useRecapEnvois } from '../gestion/RecapEnvoisTache';
import type { ApercuEnvois, IssueGeste } from '../gestion/tachesClient';
import { BlocPrevisite, CartoucheStatutLigne, CartouchesPrevisite, CSS_PREVISITE, detailPrevisite, FiltresStatutLigne, MentionReserveLocation } from './PrevisiteAccueil';
import { API_PREAVIS_GESTION, API_PREAVIS_LOCATION, ContextePreavis, MENTION_RESERVE_LOCATION, signalerPreavis, useContextePreavis, useRafraichissementPreavis, useVeilleRdv } from './preavisSynchro';
import { chercherPreavis } from '../../../../lib/location/preavis';
import { ChoixInviterLocataires } from './ChoixInviterLocataires';
import { ChoixHeure } from './ChoixHeure';
import { ModaleConfirmation } from '../gestion/ModaleConfirmation';
import { phraseConfirmationRdv, rdvModifiable } from '../../../../lib/gestion/modificationRdv';
import { lireMinutesRdv, lirePlageRdv, MINUTES_RDV_DEFAUT, PLAGE_RDV_DEFAUT } from '../../../../lib/location/minutesRdv';
import type { MailParti } from '../../../../lib/location/confirmationEnvois';
import { MOTIF_CHOIX_LOCATAIRES, motCartoucheLocataires, motCourtLocataires, reponsesDeLEncart, type ChoixLocataires, type EtatLocataires, type RdvEnCours } from '../../../../lib/location/reponsesRdv';
import { CSS_BLOC_REPLIE } from '../gestion/blocReplie';
import { BandeauPreavisTest, CreerPreavisTest, CSS_PREAVIS_TEST } from './PreavisTest';
import { BADGE_TEST } from '../../../../lib/location/preavisTest';

/**
 * ══ 🔴🔴 ACCUEIL LOCATION — LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 18/10/2026) ═════════════════════════════════════════
 * Sous les trois grosses cases, séparé d'elles par EXACTEMENT le même espace que celui qui sépare la barre de recherche des
 * cases (le même espace réservé `loc-zone-resultats loc-zone-resultats--vide`, posé par l'accueil). Une ligne par préavis,
 * TOUTES DE LA MÊME HAUTEUR (deux lignes de texte) : les locataires ; l'adresse · « Fin de préavis le … » · « État des lieux
 * le … » ; la mention orange (« en préavis » / « Préavis échu — sortie à saisir », avec le mot) ; « Ouvrir » / « Fermer ».
 * Dépliée : la date d'état des lieux prévue (saisie, modifiable, effaçable — journalisé), la SORTIE OFFICIELLE par LA
 * confirmation réduite commune (`ConfirmationSortie` → action `sortie-locataires` → `enregistrerSortie`, droit Gestion vérifié
 * au serveur), les liens vers la fiche et l'écran de sortie. Deux tris segmentés, mémorisés en préférence LOCALE.
 * Les données sont celles du préavis (`preavisEnCours`) : aucune table propre à l'accueil, aucune deuxième implémentation.
 *
 * ══ 🔴🔴 ARNO (19/10/2026) — FICHE DÉPLIÉE COMPLÈTE + « EDLS PLANIFIÉ » ═════════════════════════════════════════════════
 * Dépliée : l'encart « Le logement » de l'écran de sortie (MÊME composant, avec les coordonnées) et les dates du préavis.
 * « Planifier l'état des lieux de sortie » (date, début, fin, « Confier à », commentaire) crée une TÂCHE du module de
 * tâches de la Gestion ; la ligne passe AUSSITÔT à « EDLS planifié » (bleu : le locataire occupe toujours ; l'alerte
 * « Préavis échu » garde la priorité). « Déplacer » et, après un refus, « Confier à quelqu'un d'autre ». La date de l'EDLS
 * EST la date d'état des lieux (une seule donnée) : la planification REMPLACE la saisie à la main de cette date (Arno) —
 * qui reste offerte tant que la migration 385 n'est pas appliquée.
 */

export const CLE_TRI = 'svav.location.preavis.tri';
/** 🔴 Arno (10/11/2026) — le tri de la PLEINE PAGE, conservé à part (préférence locale) : retrouvé quand on revient sur la page. */
export const CLE_TRI_PLEINE_PAGE = 'svav.location.preavis.tri.plein';

function lireTriMemorise(cle: string = CLE_TRI): TriPreavis {
  try { return lireTri(window.localStorage.getItem(cle)); } catch { return TRI_DEFAUT; }
}
function memoriserTri(t: TriPreavis, cle: string = CLE_TRI): void {
  try { window.localStorage.setItem(cle, `${t.cle}:${t.sens}`); } catch { /* préférence d'affichage seulement : l'écran marche sans */ }
}

interface Donnees { disponible: boolean; etatDesLieux: boolean; planification?: boolean; lignes: LignePreavisAccueil[];
  /** 🔴 Arno (18/11/2026) — les minutes autorisées des rendez-vous (réglage 498) ; absent : 00, 15, 30, 45. */
  minutesRdv?: number[];
  /** 🔴 Arno (19/11/2026) — la plage horaire des rendez-vous (réglage 499) ; absente : 8h00 / 20h00 / 21h00. */
  plageRdv?: unknown;
  /** 🔴 Arno (10/11/2026) — la pré-visite est-elle installée (migration 464) ? */
  previsite?: boolean;
  /** 🔴 Arno (14/11/2026, 473) — le bouton « Préavis de test » : compte administrateur, table 473 installée. */
  preavisTest?: { administrateur: boolean; disponible: boolean } }

/**
 * ══ 🔴🔴 Arno (10/11/2026) — LE MÊME BLOC DANS LA GESTION, ET EN PLEINE PAGE ══════════════════════════════════════════════════════════
 * Le bloc est rendu tel quel sous les Tâches de la Gestion, et en pleine page (Location `/admin/location/preavis`, Gestion
 * `?ecran=preavis`) : MÊME composant, MÊME source (`preavisEnCours`). Il se relit toutes les 30 s, au retour sur l'onglet et aussitôt après
 * chaque geste (signalé à toute la page : l'autre bloc, la pastille du menu). `plein` : tous les tris dans les deux sens (réception, fin,
 * pré-visite, état des lieux, statut), la recherche par nom ou adresse ; le tri choisi est conservé. `pleinePage` : le lien « Ouvrir en
 * pleine page » (une adresse, ou un geste de l'écran qui l'accueille).
 */
export function BlocPreavisAccueil({ gestion, plein = false, pleinePage, lecture = 'location', ecriture = true, repliable = false }: {
  gestion: boolean; plein?: boolean; pleinePage?: string | (() => void);
  /**
   * 🔴 Arno (10/11/2026, accord explicite pour CE repli : le bloc sous les Tâches de la Gestion seulement) — REPLIÉ à chaque ouverture de la
   * page ; un clic sur la ligne de titre l'ouvre ou le ferme (▸ / ▾). Fermé : « Préavis · N » et le repère rouge des préavis en alerte
   * (`compterPreavisEnAlerte`, LE nombre de la pastille du menu ; absent à zéro). Ouvert : exactement comme avant. Absent : rien ne change
   * (écran Location, pleine page).
   */
  repliable?: boolean;
  /**
   * 🔴 Arno (10/11/2026, option A) — `gestion` : lu par la route de LECTURE de la Gestion (tout compte Gestion) ; `ecriture` : le compte a
   * le droit « Location » — sinon les boutons qui écrivent restent visibles, INACTIFS, avec « Réservé aux comptes Location ».
   */
  lecture?: 'location' | 'gestion'; ecriture?: boolean;
}) {
  const base = lecture === 'gestion' ? API_PREAVIS_GESTION : API_PREAVIS_LOCATION;
  const [version, setVersion] = useState(0);
  const lu = useLecture<Donnees>(`preavisEnCours=1&v=${version}`, base);
  // 🔴 Arno (18/11/2026) — les minutes autorisées des rendez-vous (réglage rendu avec les lignes ; sans lui : 00, 15, 30, 45)
  const minutesLues = lu.etat.etat === 'ok' ? lu.etat.data.minutesRdv : undefined;
  const minutesRdv = useMemo(() => lireMinutesRdv(minutesLues), [JSON.stringify(minutesLues ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const plageLue = lu.etat.etat === 'ok' ? lu.etat.data.plageRdv : undefined;
  const plageRdv = useMemo(() => lirePlageRdv(plageLue), [JSON.stringify(plageLue ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const contexte = useMemo(() => ({ base, ecriture, minutesRdv, plageRdv }), [base, ecriture, minutesRdv, plageRdv]);
  // Relecture DOUCE (mêmes paramètres : l'affichage reste en place, une ligne dépliée et une fenêtre ouverte aussi).
  const relireRef = useRef(lu.rafraichir);
  relireRef.current = lu.rafraichir;
  const relire = useCallback(() => relireRef.current(), []);
  useRafraichissementPreavis(relire);
  // 🔴 Arno (18/11/2026, 2e lot) — une réponse (locataire ou collègue) change les cartouches en quelques secondes, sans recharger la page
  useVeilleRdv(base, relire);
  /** Après un geste : relire ici, et le dire au reste de la page (l'autre bloc, la pastille du menu). */
  const apresGeste = (): void => { setVersion((v) => v + 1); signalerPreavis(); };
  const cleTri = plein ? CLE_TRI_PLEINE_PAGE : CLE_TRI;
  const [tri, setTri] = useState<TriPreavis>(TRI_DEFAUT);
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const deplie = !repliable || ouvert;
  // La préférence locale est lue APRÈS le montage : le rendu serveur et le premier rendu client restent identiques.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTri(lireTriMemorise(cleTri)); }, [cleTri]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  // L'EDLS que l'on vient de planifier, montré AUSSITÔT, en attendant la relecture du serveur (qui le remplace).
  const [locaux, setLocaux] = useState<Record<string, EdlsAffiche>>({});
  /* 🔴🔴 Arno (15/11/2026) — le TRI CHRONOLOGIQUE DES RENDEZ-VOUS (défaut : plus proches d'abord), mémorisé sur l'appareil par écran ; actif, il
     prime sur les tris du panneau ; choisir un tri du panneau le désactive. */
  // 🔴 (15/11/2026) mémoire VERSIONNÉE (clé .v2) : une valeur d'un format ancien ou invalide est ignorée, le défaut « plus proches d'abord » revient
  const cleTriRdv = `svav.preavis.triRdv.v2:${plein ? 'plein' : 'bloc'}:${lecture}`;
  const [triRdv, setTriRdv] = useState<ModeTriRdv>(MODE_TRI_RDV_DEFAUT);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { let v: ModeTriRdv = MODE_TRI_RDV_DEFAUT; try { v = lireModeTriRdv(window.localStorage.getItem(cleTriRdv)); } catch { /* sans stockage */ } setTriRdv(v); }, [cleTriRdv]);
  const choisirTriRdv = (m: ModeTriRdv): void => { setTriRdv(m); try { window.localStorage.setItem(cleTriRdv, ecrireModeTriRdv(m)); } catch { /* sans stockage */ } };
  // 🔴 (15/11/2026) le panneau des tris, replié derrière l'icône « Tris » (accord d'Arno : rien n'est supprimé, tout reste accessible)
  const [trisOuverts, setTrisOuverts] = useState(false);
  const choisirTri = (t: TriPreavis): void => { setTri(t); memoriserTri(t, cleTri); choisirTriRdv('off'); };
  // 🔴 Arno (15/11/2026) — le filtre des STATUTS de ligne (arbre validé par Arno ; vide : tous ; « Alerte préavis » gardé à part).
  const [filtre, setFiltre] = useState<Set<FiltreLigne>>(new Set());
  // 🔴 (15/11/2026) le filtre choisi est MÉMORISÉ sur cet appareil (par écran), comme le tri
  const cleFiltre = `svav.preavis.filtre:${plein ? 'plein' : 'bloc'}:${lecture}`;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const v = JSON.parse(window.localStorage.getItem(cleFiltre) ?? '[]') as unknown; if (Array.isArray(v)) setFiltre(new Set(v.filter(estFiltreLigne))); } catch { /* sans stockage */ } }, [cleFiltre]);
  const choisirFiltre = (f: Set<FiltreLigne>): void => { setFiltre(f); try { window.localStorage.setItem(cleFiltre, JSON.stringify([...f])); } catch { /* sans stockage */ } };
  /* 🔴 Arno (11/11/2026) — le « ← Retour » commun rend ce bloc TEL QU'IL ÉTAIT : ligne dépliée, statut filtré, recherche, bloc ouvert (le tri
     est déjà gardé par le navigateur). Une clé par écran (bloc / pleine page, Location / Gestion). */
  useEtatRetour(`preavis:${plein ? 'plein' : 'bloc'}:${lecture}`, { ouverte, filtre: [...filtre], recherche, ouvert },
    (v: { ouverte?: string | null; filtre?: unknown[]; recherche?: string; ouvert?: boolean }) => {
      if (v.ouverte !== undefined) setOuverte(v.ouverte);
      // un filtre d'avant (« Préavis reçu »…) n'existe plus : il est laissé de côté, aucune ligne n'est perdue
      if (Array.isArray(v.filtre)) setFiltre(new Set(v.filtre.filter(estFiltreLigne)));
      if (typeof v.recherche === 'string') setRecherche(v.recherche);
      if (typeof v.ouvert === 'boolean') setOuvert(v.ouvert);
    });
  const d = lu.etat.etat === 'ok' ? lu.etat.data : null;
  // Une réponse inattendue (serveur plus ancien que l'écran) ne fait jamais tomber l'accueil : on n'affiche que ce qui est lisible.
  const toutes = d === null || !Array.isArray(d.lignes) ? []
    : trierPreavis(d.lignes.map((x) => (locaux[x.cle] ? { ...x, edls: locaux[x.cle], etatDesLieuxLe: locaux[x.cle].jour } : x)), tri);
  /* 🔴🔴 Arno (15/11/2026) — les filtres et leurs compteurs portent EXACTEMENT sur les lignes affichées : la liste (après la recherche) est
     la base ; chaque compteur = ses lignes de ce statut, « Tous » = le total ; les préavis de TEST visibles sont comptés comme les autres. */
  const affichables = plein ? chercherPreavis(toutes, recherche) : toutes;
  const lignes = affichables.filter((x) => lignePasseFiltre(x, filtre));
  // 🔴 Arno (10/11/2026) — le repère rouge du bloc replié : LA fonction de la pastille du menu, sur les mêmes lignes que l'intérieur.
  const alertes = compterPreavisEnAlerte(lignes);
  // 🔴 Arno (14/11/2026, 473) — les préavis de TEST (les vôtres seulement) n'entrent dans aucun compteur ni pastille
  const nombre = lignes.length; // 🔴 (15/11/2026) le nombre des lignes affichées, préavis de test compris (ils sont dans la liste)
  // 🔴 Arno (10/11/2026) — `?previsite=<occupation>` (lien des mails d'alerte et d'invitation au compte rendu) : la ligne s'ouvre, dépliée.
  const [cible, setCible] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const v = Number(new URLSearchParams(window.location.search).get('previsite')); if (Number.isSafeInteger(v) && v > 0) setCible(v); } catch { /* sans adresse lisible : rien */ } }, []);
  useEffect(() => {
    if (cible === null) return;
    const l = toutes.find((x) => x.occupationIds.includes(cible));
    if (l === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOuverte(l.cle); setCible(null);
    setTimeout(() => { try { document.querySelector(`[data-ligne-preavis="${CSS.escape(l.cle)}"]`)?.scrollIntoView({ block: 'start' }); } catch { /* rien */ } }, 0);
  }, [cible, toutes]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocaux({}); }, [d]);
  const jour = aujourdhuiParisEcran();
  const segment = (t: TriPreavis, libelle: string) => (
    <button type="button" className="pva-segment" aria-pressed={triRdv === 'off' && tri.cle === t.cle && tri.sens === t.sens}
      data-tri={`${t.cle}:${t.sens}`} onClick={() => choisirTri(t)}>{libelle}</button>
  );
  /** l'icône « Tris » : au bout de la rangée « Statut » ; une pastille dit qu'un tri non standard est actif */
  const triNonStandard = tri.cle !== TRI_DEFAUT.cle || tri.sens !== TRI_DEFAUT.sens;
  const iconeTris = (
    <button type="button" className="pva-icone-tris" aria-expanded={trisOuverts} aria-label="Trier la liste" title="Trier la liste"
      onClick={() => setTrisOuverts((o) => !o)} data-ouvrir-tris>
      <Icone nom="tris" />{triNonStandard && <span className="pva-tris-pastille" aria-label="Un tri non standard est actif" data-tri-actif />}</button>
  );
  // la liste affichée : chronologique (🔴 16/11/2026 : les lignes « RDV … fixé » seulement, puis « Sans rendez-vous fixé (n) » par fin de
  // préavis), ou l'ordre des tris du panneau
  const ordreRdv = triRdv === 'off' ? null : ordonnerParRdv(lignes, triRdv);
  const affichage: (LignePreavisAccueil | { separateur: number })[] = ordreRdv === null ? lignes
    : [...ordreRdv.avecRdv, ...(ordreRdv.sansRdv.length > 0 ? [{ separateur: ordreRdv.sansRdv.length }] : []), ...ordreRdv.sansRdv];
  return (
    <ContextePreavis.Provider value={contexte}>
    <section className={`pva${deplie ? '' : ' blr-bloc'}`} aria-label="Locataires en préavis" data-bloc-preavis data-ecriture={ecriture ? 'oui' : 'non'}>
      {/* Les styles de la Location viennent AVEC le bloc : il s'affiche à l'identique sous les Tâches de la Gestion et en pleine page. */}
      <style>{CSS_LOCATION_ECRANS + CSS_PREAVIS + CSS_PREAVIS_ACCUEIL + CSS_PREVISITE + CSS_PREAVIS_TEST + (repliable ? CSS_BLOC_REPLIE : '')}</style>
      <div className="pva-entete">
        <h2 className={`pva-titre${deplie ? '' : ' blr-titre'}`}>
          {repliable ? (
            <button type="button" className={`pva-repli${deplie ? '' : ' blr-repli'}`} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)} data-repli-preavis>
              <span aria-hidden="true" className={`pva-fleche${deplie ? '' : ' blr-fleche'}`}>{ouvert ? '▾' : '▸'}</span>
              {ouvert ? <>Locataires en préavis <span className="loc-pastille" data-nombre-preavis>{nombre}</span></>
                : <>Préavis · <span data-total-preavis>{nombre}</span></>}
            </button>
          ) : <>Locataires en préavis <span className="loc-pastille" data-nombre-preavis>{nombre}</span></>}
          {repliable && !ouvert && alertes > 0 && <span className="pva-alertes blr-alerte" data-alertes-preavis>● {alertes} en alerte</span>}
        </h2>
        {/* 🔴 Arno (10/11/2026) — « Ouvrir en pleine page » (bloc de la Location, bloc sous les Tâches de la Gestion). */}
        {!plein && pleinePage !== undefined && (typeof pleinePage === 'string'
          ? <a className="pva-plein" href={pleinePage} data-pleine-page-preavis>Ouvrir en pleine page</a>
          : <button type="button" className="pva-plein" onClick={pleinePage} data-pleine-page-preavis>Ouvrir en pleine page</button>)}
      </div>
      {!deplie ? null : lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : !d!.disponible ? (
        <p className="loc-muet" data-preavis-indisponible>Préavis : la mise à jour de la base (migration 383) reste à appliquer.</p>
      ) : (
        <>
          {plein && (
            <label className="pva-recherche">
              <span className="pva-tri-libelle">Rechercher</span>
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. Dupont, ou 12 rue des Lilas" data-recherche-preavis />
            </label>
          )}
          {d!.previsite !== true && <div className="pva-tri pva-tri--seul">{iconeTris}</div>}
          {d!.previsite === true && <FiltresStatutLigne lignes={affichables} filtre={filtre} onChange={choisirFiltre} fin={iconeTris} />}
          {/* 🔴 (15/11/2026) le panneau des tris s'ouvre SOUS la rangée « Statut » */}
          <div className="pva-panneau-tris" hidden={!trisOuverts} data-panneau-tris={trisOuverts ? 'ouvert' : 'replie'}>
          <div className="pva-tris" role="group" aria-label="Trier les préavis">
            {plein && (
              <div className="pva-tri" role="group" aria-label="Réception du préavis">
                <span className="pva-tri-libelle">Réception du préavis</span>
                {segment({ cle: 'recu', sens: 'asc' }, 'Plus ancienne d’abord')}
                {segment({ cle: 'recu', sens: 'desc' }, 'Plus récente d’abord')}
              </div>
            )}
            <div className="pva-tri" role="group" aria-label="Fin de préavis">
              <span className="pva-tri-libelle">Fin de préavis</span>
              {segment({ cle: 'fin', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'fin', sens: 'desc' }, 'Plus lointaine d’abord')}
            </div>
            <div className="pva-tri" role="group" aria-label="État des lieux">
              <span className="pva-tri-libelle">État des lieux</span>
              {segment({ cle: 'edl', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'edl', sens: 'desc' }, 'Plus lointain d’abord')}
            </div>
            {d!.previsite === true && <>
              <div className="pva-tri" role="group" aria-label="Statut de pré-visite">
                <span className="pva-tri-libelle">Tri par statut</span>
                {segment({ cle: 'statut', sens: 'asc' }, 'En préavis d’abord')}
                {segment({ cle: 'statut', sens: 'desc' }, 'Plus avancés d’abord')}
              </div>
              <div className="pva-tri" role="group" aria-label="Date de pré-visite">
                <span className="pva-tri-libelle">Pré-visite</span>
                {segment({ cle: 'previsite', sens: 'asc' }, 'Plus proche d’abord')}
                {segment({ cle: 'previsite', sens: 'desc' }, 'Plus lointaine d’abord')}
              </div>
            </>}
          </div>
            <button type="button" className="svv-btn svv-btn-outline gst-btn pva-fermer-tris" onClick={() => setTrisOuverts(false)} data-fermer-tris>Fermer</button>
          </div>
          {/* 🔴 Arno (14/11/2026, 473) — « Préavis de test » : discret, réservé aux administrateurs (écran Location seulement). */}
          {/* 🔴 (15/11/2026) la ligne juste au-dessus de la liste : « Préavis de test » à gauche, le tri chronologique des rendez-vous à droite */}
          <div className="pva-avant-liste">
            <div className="pva-avant-liste-gauche">{lecture === 'location' && d!.preavisTest?.administrateur === true && <CreerPreavisTest disponible={d!.preavisTest.disponible} apres={(m) => { setBilan(m); apresGeste(); }} />}</div>
            <button type="button" className="pva-tri-rdv" aria-label={`${LIBELLE_TRI_RDV[triRdv]} — toucher pour changer`} title="Tri chronologique des rendez-vous"
              onClick={() => { const m = modeTriRdvSuivant(triRdv); choisirTriRdv(m); }} data-tri-rdv={triRdv}>
              <Icone nom="horloge" taille={20} /><span>{LIBELLE_TRI_RDV[triRdv]}</span></button>
          </div>
          {bilan !== null && <p className="gst-info" role="status" data-preavis-bilan>{bilan}</p>}
          {lignes.length === 0 ? <p className="loc-muet" data-preavis-vide>{toutes.length > 0 ? 'Aucun préavis avec ce statut' : 'Aucun locataire en préavis'}</p> : (
            <ul className="pva-liste">
              {affichage.map((l) => {
                if ('separateur' in l) return <li key="sans-rdv" className="pva-separateur" data-separateur-sans-rdv>Sans rendez-vous fixé ({l.separateur})</li>;
                const noms = l.locataires.map((x) => x.nom).join(', ');
                /* 🔴🔴 Arno (15/11/2026) — DEUX LIGNES : 1) nom(s) + adresse ; 2) colonnes FIXES communes à tout le listing : A « Fin de préavis »,
                   B le rendez-vous fixé (mis en évidence, couleur de son type), C les détails existants. Aucune information retirée : le texte
                   complet d'avant reste en infobulle de la ligne. */
                const adresse = l.adresse ?? `Bien ${l.lotId}`;
                const fin = `Fin de préavis ${dateFrPreavis(l.dateMax)}`;
                // 🔴 (16/11/2026) un rendez-vous par statut : deux (pré-visite puis état des lieux) quand les deux sont fixés
                const rdvs = colonnesRdv(l, maintenantParis());
                const rdv = rdvs[0];
                // 🔴 (15/11/2026) la mission du rendez-vous affiché : « confié à Prénom NOM » + l'état de la tâche
                const missionDe = (r: typeof rdv) => (r.sorte === 'previsite' || r.sorte === 'edl' ? missionDeLigne(l, r.sorte) : null);
                const mission = missionDe(rdv);
                const missionHtml = (m: ReturnType<typeof missionDe>) => m && <>
                  <span className="pva-confie" title={`confié à ${m.qui}`}>confié à {m.qui}</span>
                  <span className={`pva-etat-mission pva-etat-mission--${m.etat}`} data-etat-mission={m.etat}>{LIBELLE_ETAT_MISSION[m.etat]}</span></>;
                /* 🔴 Arno (18/11/2026) — le statut des LOCATAIRES du rendez-vous, dans SA colonne, à droite de celle du collègue (qui ne change pas) :
                   « Locataires : En attente / Confirmé / Refusé », aucun nom ; rien sans rendez-vous fixé. Même calcul que la frise. */
                const locHtml = (sorte: string) => (sorte === 'previsite' || sorte === 'edl') && <CartoucheLocataires e={l.reponsesRdv?.[sorte]} court />;
                const dateHtml = (r: typeof rdv) => <>
                  <span className="pva-rdv-date">{r.texte}</span>
                  {/* 🔴 (16/11/2026) la date passée sans que l'étape soit faite : petite mention rouge, juste sous la date */}
                  {'depassee' in r && r.depassee !== null && <span className="pva-rdv-depassee" data-rdv-depassee={r.sorte}>{r.depassee}</span>}</>;
                // 🔴 (15/11/2026, accord d'Arno) la colonne C ne répète plus aucune date : seulement ce qui n'est pas déjà affiché
                const details = !l.edls && l.etatDesLieuxLe ? `État des lieux le ${dateFrPreavis(l.etatDesLieuxLe)}` : '';
                // l'infobulle de la ligne garde le texte complet d'avant (rien n'est perdu)
                const detail = [adresse, `Fin de préavis le ${dateFrPreavis(l.dateMax)}`,
                  l.edls ? mentionEdls(l.edls) : l.etatDesLieuxLe ? `État des lieux le ${dateFrPreavis(l.etatDesLieuxLe)}` : null, detailPrevisite(l.previsite)]
                  .filter((x): x is string => x !== null && x !== '').join(' · ');
                const estOuverte = ouverte === l.cle;
                return (
                  <li key={l.cle} className="pva-item" data-ligne-preavis={l.cle}>
                    <div className={`pva-ligne${rdvs.length > 1 ? ' pva-ligne--deux-rdv' : ''}`}>
                      <div className="pva-textes" title={`${noms} — ${detail}`}>
                        <span className="pva-l1">
                          <span className="pva-noms" title={noms}>{l.test && <span className="pvt-badge" data-badge-test>{BADGE_TEST}</span>}{noms}</span>
                          <span className="pva-adresse" title={adresse} data-adresse-ligne>{adresse}</span>
                        </span>
                        <span className="pva-l2">
                          <span className="pva-col-fin" data-col-fin>{fin}</span>
                          {rdvs.length > 1 ? (
                            /* 🔴🔴 Arno (16/11/2026) — DEUX rendez-vous fixés : l'un sous l'autre (pré-visite puis état des lieux), chacun avec sa mission,
                               alignés sur les colonnes « rendez-vous » et « mission » des autres lignes (sous-grille) */
                            <span className="pva-col-rdv pva-col-rdv--deux" data-col-rdv="deux">
                              {rdvs.map((r) => { const m = missionDe(r); return [
                                <span key={`${r.sorte}-d`} className={`pva-rdv-item pva-col-rdv--${r.sorte}`} data-rdv-item={r.sorte}>{dateHtml(r)}</span>,
                                <span key={`${r.sorte}-m`} className="pva-col-mission" data-col-mission={m?.etat ?? 'aucune'} data-mission-de={r.sorte}>{missionHtml(m)}</span>,
                                <span key={`${r.sorte}-l`} className="pva-col-loc" data-col-loc={r.sorte}>{locHtml(r.sorte)}</span>]; })}
                            </span>
                          ) : <>
                          <span className={`pva-col-rdv pva-col-rdv--${rdv.sorte}`} data-col-rdv={rdv.sorte}>{dateHtml(rdv)}</span>
                          <span className="pva-col-mission" data-col-mission={mission?.etat ?? 'aucune'}>{missionHtml(mission)}</span>
                          <span className="pva-col-loc" data-col-loc={rdv.sorte}>{locHtml(rdv.sorte)}</span></>}
                          <span className="pva-col-details pva-detail" title={details} data-col-details>{details}</span>
                        </span>
                      </div>
                      {/* 🔴🔴 Arno (15/11/2026) — LE statut de la ligne (un seul, calculé) à la place de « en préavis » fixe ; l'alerte « Préavis
                          échu » reste affichée à côté ; un état des lieux refusé par le collègue garde son repère « EDLS à réattribuer ». */}
                      <span className="psl-cartouches" data-cartouches-ligne>
                        {/* 🔴 (16/11/2026) deux statuts côte à côte quand la pré-visite et l'état des lieux sont fixés tous les deux */}
                        {statutsLigne(l).map((s) => <CartoucheStatutLigne key={s} statut={s} />)}
                        {statutPreavis(l, jour) === 'echu' && <MentionPreavis p={l} jour={jour} court />}
                        {l.edls?.statut === 'refusee' && <span className="pvs-mention pvs-mention--en_preavis" data-preavis="edls" data-edls-statut="refusee">{pastilleEdls(l.edls)}</span>}
                        {/* 🔴 Arno (10/11/2026) — « Aucune pré-visite fixée » / « Personne n'a accepté la pré-visite ». */}
                        <span className="pvv-cartouches" data-cartouches-previsite><CartouchesPrevisite p={l.previsite} /></span>
                      </span>
                      <button type="button" className="svv-btn svv-btn-outline gst-btn pva-ouvrir" aria-expanded={estOuverte}
                        aria-label={`${estOuverte ? 'Fermer' : 'Ouvrir'} le préavis de ${noms}`} data-ouvrir-preavis={l.cle}
                        onClick={() => setOuverte(estOuverte ? null : l.cle)}>{estOuverte ? 'Fermer' : 'Ouvrir'}</button>
                    </div>
                    {estOuverte && (
                      <LigneDepliee l={l} gestion={gestion} edlDisponible={d!.etatDesLieux} planification={d!.planification === true}
                        apres={apresGeste}
                        edlsPose={(e) => { setLocaux((m) => ({ ...m, [l.cle]: e })); lu.rafraichir(); signalerPreavis(); }}
                        sortieFaite={(f) => {
                          setOuverte(null);
                          setBilan(`${f.geste === 'sortie' ? 'Sortie enregistrée' : 'Préavis enregistré'} — ${f.noms.join(', ')}. ${f.phrase}${f.avecMails ? '' : ' Aucun mail n’a été envoyé.'}`);
                          apresGeste();
                        }} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
    </ContextePreavis.Provider>
  );
}

/** 🔴 Arno (18/11/2026, 495) — le cartouche « Locataires : … » (le mot toujours écrit ; jetons du thème). Rien à montrer : rien. */
function CartoucheLocataires({ e, court }: { e: EtatLocataires | null | undefined;
  /** 🔴 Arno (18/11/2026) — la LIGNE REPLIÉE : « Locataires : En attente / Confirmé / Refusé », sans aucun nom (même calcul, autre mot). */
  court?: boolean }) {
  if (e === null || e === undefined) return null;
  const mot = court === true ? motCourtLocataires(e) : motCartoucheLocataires(e);
  if (mot === null) return null;
  return <span className={`pva-loc pva-loc--${e.etat}${e.main ? ' pva-loc--main' : ''}`} data-cartouche-locataires={e.main ? 'main' : e.etat}
    {...(court === true ? { 'data-cartouche-locataires-court': e.etat } : {})} title={mot}>{mot}</span>;
}

/**
 * 🔴 Arno (18/11/2026, 495) — sous le rendez-vous (pré-visite ou état des lieux) : la réponse de chaque locataire, le cartouche, et « Valider le
 * rendez-vous sans prévenir les locataires » (réversible : « Annuler la validation à la main ») — aucun mail aux locataires, l'auteur au journal.
 */
function ValidationRdvLocataires({ l, sorte, apres }: { l: LignePreavisAccueil; sorte: 'previsite' | 'edl'; apres: () => void }) {
  const { ecriture } = useContextePreavis();
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  // 🔴 Arno (19/11/2026, règle F) — la fenêtre de confirmation après « Valider … » ou « Annuler la validation à la main »
  const [confirme, setConfirme] = useState<string | null>(null);
  const tacheId = sorte === 'previsite' ? (l.previsite?.rdv ? l.previsite.tacheId : null) : l.edls?.tacheId ?? null;
  if (l.reponsesRdv?.disponible !== true || tacheId === null || tacheId === undefined) return null;
  // 🔴 Arno (18/11/2026, accord pour CE bouton, option 1) — « Valider le rendez-vous sans prévenir les locataires » (et son annulation) ne
  //    s'affiche que tant que le rendez-vous est À VENIR et pas encore effectué ; le cartouche et la liste des réponses restent dans tous les cas.
  const aVenir = sorte === 'previsite'
    ? l.previsite?.statut === 'programmee' && l.previsite.rdvPasse !== true
    : l.edls !== null && l.edls !== undefined && `${l.edls.jour} ${(l.edls.heure ?? '00:00').slice(0, 5)}` > maintenantParis();
  const e = l.reponsesRdv[sorte];
  const main = e?.etat === 'confirme' && e.main;
  const agir = async (): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const r = await envoyer({ action: main ? 'annuler-validation-rdv-main' : 'valider-rdv-main', sorte, tacheId, occupationIds: l.occupationIds });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    setConfirme(phraseConfirmationRdv(main ? 'validation_annulee' : 'valide_sans_confirmation', sorte));
  };
  return (
    <div className="pva-rdv-locataires" data-rdv-locataires={sorte}>
      {confirme !== null && <ModaleConfirmation phrase={confirme} onOk={() => { setConfirme(null); apres(); }} />}
      <p className="pva-rdv-loc-tete"><CartoucheLocataires e={e} />{e === null || e === undefined
        ? <span className="loc-muet">Locataires : aucune invitation avec réponse en ligne pour ce rendez-vous.</span> : null}</p>
      {e && e.reponses.length > 0 && (
        <ul className="pva-rdv-loc-liste">{e.reponses.map((x) => (
          <li key={x.occupationId} data-reponse-locataire={x.reponse ?? 'attente'}>{x.nom} : {x.reponse === 'accepte' ? 'accepte' : x.reponse === 'refuse' ? 'refuse' : 'pas encore répondu'}</li>))}</ul>)}
      {aVenir && <div className="pva-rdv-loc-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!ecriture || envoi} onClick={() => { void agir(); }}
          data-valider-rdv-main={main ? 'annuler' : 'valider'}>
          {envoi ? 'Enregistrement…' : main ? 'Annuler la validation à la main' : 'Valider le rendez-vous sans demander de confirmation aux locataires'}</button>
      </div>}
      {aVenir && !ecriture && <MentionReserveLocation />}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </div>
  );
}

function LigneDepliee({ l, gestion, edlDisponible, planification, apres, edlsPose, sortieFaite }: {
  l: LignePreavisAccueil; gestion: boolean; edlDisponible: boolean; planification: boolean; apres: () => void;
  edlsPose: (e: EdlsAffiche) => void; sortieFaite: (f: FinParcours) => void;
}) {
  const [edl, setEdl] = useState(l.etatDesLieuxLe ?? '');
  const [refusEdl, setRefusEdl] = useState<string | null>(null);
  const [envoiEdl, setEnvoiEdl] = useState(false);
  const [sortie, setSortie] = useState(false);
  // 🔴 Arno (10/11/2026, option A) — sans le droit « Location » : visibles, inactifs, « Réservé aux comptes Location ».
  const { ecriture, base } = useContextePreavis();
  const verdict = verifierEtatDesLieux(edl, [{ recuLe: l.recuLe, dateMax: l.dateMax }]);
  const enregistrerEdl = async (date: string): Promise<void> => {
    setEnvoiEdl(true); setRefusEdl(null);
    const r = await envoyer({ action: 'etat-des-lieux', occupationIds: l.occupationIds, date });
    setEnvoiEdl(false);
    if (r.motif !== null) { setRefusEdl(r.motif); return; }
    if (date === '') setEdl('');
    apres();
  };
  const premier = l.locataires[0];
  return (
    <div className="pva-depliee" data-ligne-depliee={l.cle}>
      {l.test && <BandeauPreavisTest l={l} apres={apres} />}
      <InfosDuLogement l={l} />
      {/* 🔴 Arno (11/11/2026, lot 3) — LA FRISE DES ÉTAPES : 1 Préavis reçu → 2 Pré-visite → 3 État des lieux de sortie → 4 Sortie validée ;
          chaque étape porte ses boutons (les blocs d'avant, inchangés, sous leur étape). Rien n'est retiré. */}
      <ol className="frp" data-frise-preavis>
        {etapesPreavis(l, aujourdhuiParis()).map((e) => (
          <li key={e.cle} className={`frp-etape frp-etape--${e.statut}${e.enCours ? ' frp-etape--en-cours' : ''}`} data-etape={e.cle} data-statut-etape={e.statut}
            {...(e.enCours ? { 'aria-current': 'step' as const } : {})}>
            <div className="frp-tete">
              {/* 🔴 Arno (11/11/2026, lot B) — UNE seule numérotation : la pastille ronde (noire ; VERTE avec une coche une fois l'étape faite ;
                  ORANGE pour une pré-visite refusée / absente). Le titre ne répète plus le chiffre (lu tout de même par un lecteur d'écran). */}
              <span className="frp-numero" aria-hidden="true" data-pastille-etape>{e.statut === 'faite' ? '✓' : e.numero}</span>
              <span className="frp-titre"><span className="frp-lu">Étape {e.numero} : </span>{e.titre}</span>
              {/* 🔴 Arno (11/11/2026) — une ligne par information (« Préavis reçu » : la réception, puis la fin du préavis). */}
              {/* 🔴 Arno (13/11/2026) — sans doublon : quand la case montre le cartouche du rendez-vous, la ligne qui le répétait disparaît ; « étape en cours » reste. */}
              <span className="frp-statut" data-libelle-etape>{lignesSousTitre(e, l, { planification }).map((x, i) => (
                <span key={i} className="frp-ligne" data-ligne-etape>{x}</span>))}</span>
            </div>
            {/* 🔴 Arno (18/11/2026) — le bloc des LOCATAIRES DANS la zone des informations du rendez-vous (sous le cartouche du collègue, pleine
                largeur) : enfant direct de la case, il prenait la grille de la case pour lui et finissait dans une colonne étroite, texte superposé */}
            {e.cle === 'previsite' && <BlocPrevisite l={l} apres={apres} sousInfos={<ValidationRdvLocataires l={l} sorte="previsite" apres={apres} />} />}
            {e.cle === 'edls' && (planification ? <BlocEdls l={l} edlsPose={edlsPose} sousInfos={<ValidationRdvLocataires l={l} sorte="edl" apres={apres} />} /> : (
      <div className="pva-bloc" data-bloc-edl>
        <div className="frp-infos">
        <label className="pvs-champ">
          <span className="pvs-libelle">Date d’état des lieux de sortie prévue</span>
          <input type="date" value={edl} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} disabled={!edlDisponible || !ecriture}
            onChange={(e) => { setEdl(e.target.value); setRefusEdl(null); }} data-date-edl />
        </label>
        {!edlDisponible && <p className="loc-muet">La mise à jour de la base (migration 384) reste à appliquer.</p>}
        {edlDisponible && !verdict.ok && <p className="cp-refus" role="status" data-message-edl>{verdict.motif}</p>}
        {refusEdl !== null && <p className="cp-refus" role="alert">{refusEdl}</p>}
        </div>
        <div className="frp-actions">
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!ecriture || !edlDisponible || envoiEdl || !verdict.ok || edl === '' || edl === (l.etatDesLieuxLe ?? '')}
            onClick={() => { void enregistrerEdl(edl); }} data-enregistrer-edl>Enregistrer la date</button>
          {l.etatDesLieuxLe !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoiEdl || !ecriture} onClick={() => { void enregistrerEdl(''); }} data-effacer-edl>Effacer la date</button>
          )}
        </div>
        {!ecriture && <MentionReserveLocation />}
        <p className="loc-muet" data-planification-indisponible>Planifier l’état des lieux (tâche, rendez-vous) : la mise à jour de la base (migration 385) reste à appliquer.</p>
        </div>
      </div>
      ))}
            {e.cle === 'sortie' && (
      <div className="pva-bloc" data-bloc-sortie-officielle>
        {/* 🔴 Arno (11/11/2026, lot 5) — plus de sous-titre « Date officielle de sortie » (la case « 4. Sortie validée » le dit) ; informations, puis boutons. */}
        <div className="frp-infos">{!gestion && <p className="sor-gestion-seule-texte" role="note" data-sortie-gestion-seule>{MESSAGE_SORTIE_GESTION}</p>}</div>
        <div className="frp-actions">
        {!gestion ? null
          : !sortie || !ecriture ? (<>
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setSortie(true)} data-valider-sortie
                {...(ecriture ? {} : { disabled: true, title: MENTION_RESERVE_LOCATION, 'aria-disabled': true })}>Valider la sortie</button>
            </div>
            {!ecriture && <MentionReserveLocation />}
          </>) : (<>
            {/* 🔴 Arno (11/11/2026, lot 4) — « Valider la sortie » ouvre DIRECTEMENT « Valider l'état des lieux de sortie » (le sélecteur
                « Sélectionner / Enregistrer un préavis / Faire sortir » n'est plus ici, sur son accord pour CET endroit ; « Écran de sortie » reste). */}
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled data-valider-sortie>Valider la sortie</button>
            </div>
            <ValidationSortieEdls l={l} onFermer={(f) => { setSortie(false); if (f !== null) sortieFaite(f); }} />
          </>)}
        </div>
      </div>
            )}
          </li>
        ))}
      </ol>
      <p className="pva-liens">
        {/* 🔴 Arno (11/11/2026) — EN PREMIER : la fiche du BIEN de ce préavis (Location : sa fiche ; Gestion : la fiche de l'annuaire), même style. */}
        <a href={base === API_PREAVIS_LOCATION ? `/admin/location/bien/${l.lotId}` : `/admin/gestion?ecran=annuaire&fiche=lot-${l.lotId}`} data-lien-fiche-bien={l.lotId}>Voir la fiche du bien</a>
        {l.locataires.map((x) => (
          <a key={x.occupationId} href={`/admin/location/locataire/${x.locataireId}`} data-lien-fiche={x.locataireId}>
            Voir la fiche du locataire{l.locataires.length > 1 ? ` (${x.nom})` : ''}</a>
        ))}
        {premier !== undefined && <a href={`/admin/location/locataire/${premier.locataireId}?sortie=${l.occupationId}`} data-lien-ecran-sortie>Écran de sortie</a>}
      </p>
    </div>
  );
}

/**
 * 🔴 Arno (11/11/2026, lot 1) — la ligne dépliée commence par la FICHE D'INTERVENTION en trois blocs (locataires, propriétaires, logement et
 * annexes), lue dans l'encart du logement du bail (le même que l'écran de sortie, enrichi), puis les dates du préavis. Tout ce que l'encart
 * montrait reste (dans le bloc ③ et ses « autres informations »). Le lien « compléter » mène à la fiche du bien (Location ou Gestion).
 */
/** 🔴 Arno (18/11/2026) — les rendez-vous EN COURS de la ligne (pré-visite programmée, état des lieux planifié) et l'état de leur créneau. PUR. */
function rdvsEnCours(l: LignePreavisAccueil): RdvEnCours[] {
  const r: RdvEnCours[] = [];
  if (l.previsite?.statut === 'programmee' && l.previsite.rdv) r.push({ sorte: 'previsite', jour: l.previsite.rdv.jour, heure: l.previsite.rdv.heure, etat: l.reponsesRdv?.previsite ?? null });
  if (l.edls) r.push({ sorte: 'edl', jour: l.edls.jour, heure: l.edls.heure, etat: l.reponsesRdv?.edl ?? null });
  return r;
}

function InfosDuLogement({ l }: { l: LignePreavisAccueil }) {
  const { base } = useContextePreavis();
  const lu = useLecture<EncartLogement>(`encartBail=${l.occupationId}`, base);
  const lienBien = base === API_PREAVIS_LOCATION ? `/admin/location/bien/${l.lotId}` : `/admin/gestion?ecran=annuaire&fiche=lot-${l.lotId}`;
  return (
    <div className="pva-logement" data-infos-logement>
      {lu.etat.etat === 'ok' ? <FicheInterventionPreavis f={ficheDepuisEncart(lu.etat.data)} lienBien={lienBien} reponses={reponsesDeLEncart(rdvsEnCours(l), l.occupationIds)} />
        : <EtatLecture etat={lu.etat} />}
      <p className="pva-dates-preavis" data-dates-preavis>Préavis : recommandé reçu le {dateFrPreavis(l.recuLe)} — fin du préavis le {dateFrPreavis(l.dateMax)}</p>
    </div>
  );
}

interface Personne { id: number; libelle: string }

/** L'EDLS de la ligne : « Planifier », ou son état avec « Déplacer » — et, après un refus, « Confier à quelqu'un d'autre ». */
function BlocEdls({ l, edlsPose, sousInfos }: { l: LignePreavisAccueil; edlsPose: (e: EdlsAffiche) => void;
  /** 🔴 Arno (18/11/2026) — sous les informations du rendez-vous (pleine largeur de la carte) : le bloc des LOCATAIRES ; absent : rien. */
  sousInfos?: ReactNode }) {
  const [mode, setMode] = useState<'lecture' | 'planifier' | 'deplacer' | 'reattribuer'>('lecture');
  const [bilan, setBilan] = useState<string | null>(null);
  const e = l.edls ?? null;
  const fait = (x: EdlsAffiche, phrase: string): void => { setMode('lecture'); setBilan(phrase); edlsPose(x); };
  const { ecriture } = useContextePreavis();
  const inactif = ecriture ? {} : { disabled: true, title: MENTION_RESERVE_LOCATION, 'aria-disabled': true } as const;
  return (
    <div className="pva-bloc" data-bloc-edls>
      {/* 🔴 Arno (11/11/2026, lot 5) — plus de sous-titre « État des lieux de sortie » (le titre de la case le dit) ; informations, puis boutons. */}
      <div className="frp-infos">
      {/* 🔴🔴 Arno (16/11/2026) — le rendez-vous fixé : le cartouche VERT de la case 2 (« État des lieux programmé — le … de … à … »), et dessous
          « Prénom NOM : en attente / acceptée / refusée » ; refusé : la mention orange « Refusée par … — à réattribuer » reste en plus */}
      {e !== null && (() => { const c = cartoucheEdls(e); return <>
        <p className="pvv-etat pvv-etat--programmee" role="status" data-edls-cartouche>{c.texte}</p>
        <ul className="pvv-collegues" data-edls-collegue><li data-collegue-statut={c.statut}>{c.qui} : {c.reponse}</li></ul>
        {e.statut === 'refusee' && <p className="pva-edls pva-edls--refus" role="status" data-edls-mention>{mentionEdls(e)}</p>}</>; })()}
      {bilan !== null && <p className="gst-info" role="status" data-edls-bilan>{bilan}</p>}
      {sousInfos}
      </div>
      <div className="frp-actions">
      {mode === 'lecture' && (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          {e === null ? <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} onClick={() => { setBilan(null); setMode('planifier'); }} data-planifier-edls>Planifier l’état des lieux de sortie</button> : (
            <>
              {/* 🔴 Arno (19/11/2026, règle J) — un rendez-vous passé ne se modifie plus (le serveur le refuse aussi) */}
              {rdvModifiable({ jour: e.jour, heure: e.heure }, maintenantParis()) && (
              <button type="button" className="svv-btn svv-btn-outline gst-btn" {...inactif} onClick={() => { setBilan(null); setMode('deplacer'); }} data-deplacer-edls>Modifier / déplacer l’état des lieux</button>)}
              {e.statut === 'refusee' && <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} onClick={() => { setBilan(null); setMode('reattribuer'); }} data-reattribuer-edls>Confier à quelqu’un d’autre</button>}
            </>
          )}
        </div>
      )}
      {!ecriture && <MentionReserveLocation />}
      {ecriture && (mode === 'planifier' || mode === 'deplacer') && (
        <FormulaireEdls l={l} e={mode === 'deplacer' ? e : null} onAnnuler={() => setMode('lecture')} onFait={fait} />
      )}
      {ecriture && mode === 'reattribuer' && e !== null && <FormulaireReattribuer l={l} e={e} onAnnuler={() => setMode('lecture')} onFait={fait} />}
      </div>
    </div>
  );
}

/** 🔴 Arno (10/11/2026) — l'aperçu de l'état des lieux de sortie (route de la Location, lecture seule). */
async function lireApercuEdls(corps: Record<string, unknown>): Promise<ApercuEnvois | { erreur: string }> {
  const r = await envoyer({ ...corps, action: 'apercu-edls' }, { propre: true });
  if (r.motif !== null) return { erreur: r.motif };
  const d = (r.data ?? {}) as Partial<ApercuEnvois>;
  return { collaborateurs: d.collaborateurs ?? [], exterieurs: d.exterieurs ?? [], total: Number(d.total ?? 0), texteCollaborateur: d.texteCollaborateur ?? null, texteExterieur: d.texteExterieur ?? null,
    ...(d.locataires ? { locataires: d.locataires } : {}) };
}
/** La réponse d'un geste de l'état des lieux, en issue de la fenêtre de résultat (les mails tels que le serveur les rend). */
function issueEdls(r: Awaited<ReturnType<typeof envoyer>>, mot: string): IssueGeste {
  if (r.motif !== null) return { ok: false, message: r.motif };
  const d = (r.data ?? {}) as { mails?: { destinataire: string; etat: string; objet?: string }[]; locataires?: MailParti[] };
  // 🔴 Arno (18/11/2026, 2e lot) — + les mails des LOCATAIRES (choix « Oui »), tels que le serveur les rend
  return { ok: true, message: phraseGeste(mot, r.data), collaborateurs: d.mails ?? [], exterieurs: [], locataires: d.locataires ?? [] };
}

/** La phrase après un geste : la tâche, ses mails (canal du module de tâches) et l'agenda. */
function phraseGeste(debut: string, data: unknown): string {
  const r = (data ?? {}) as { mails?: { destinataire: string; etat: string }[]; agenda?: string };
  const mails = (r.mails ?? []).map((m) => `mail à ${m.destinataire} : ${m.etat === 'envoye' ? 'envoyé' : m.etat === 'factice' ? 'préparé (essai)' : m.etat === 'desactive' ? 'envoi désactivé' : m.etat === 'sans_droit' ? 'pas de droit d’envoi au nom de gestion@' : m.etat}`);
  return [debut, ...mails, r.agenda ?? ''].filter((x) => x.trim() !== '').join(' — ');
}

function ChoixPersonne({ valeur, onChange, exclure }: { valeur: number | null; onChange: (id: number | null) => void; exclure?: number | null }) {
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  const personnes = useMemo(() => (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data) ? lu.etat.data.filter((p) => p.id !== exclure) : []), [lu.etat, exclure]);
  // La première personne (soi-même en tête de liste) est proposée d'office.
  useEffect(() => { if (valeur === null && personnes.length > 0) onChange(personnes[0].id); }, [valeur, personnes, onChange]);
  return (
    <label className="pvs-champ">
      <span className="pvs-libelle">Confier à *</span>
      {lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : personnes.length === 0
        ? <p className="loc-muet" data-aucune-personne>Personne n’a les tuiles Location et Gestion avec une adresse de notre Workspace.</p>
        : (
          <ListeChoix options={personnes.map((p) => ({ id: p.id, libelle: p.libelle }))} valeur={valeur === null || valeur === undefined ? '' : String(valeur)} vide={null} libelle="Confier à"
            onChange={(v) => onChange(v === '' ? null : Number(v))} donnees={{ 'data-confier-a': '' }} />
        )}
    </label>
  );
}

/** Planifier (ou déplacer) : date*, début*, fin* (proposée = début + 1 h, modifiable, après le début), « Confier à »*, commentaire. */
function FormulaireEdls({ l, e, onAnnuler, onFait }: {
  l: LignePreavisAccueil; e: EdlsAffiche | null; onAnnuler: () => void; onFait: (x: EdlsAffiche, phrase: string) => void;
}) {
  const minutesRdv = useContextePreavis().minutesRdv ?? MINUTES_RDV_DEFAUT;
  const plageRdv = useContextePreavis().plageRdv ?? PLAGE_RDV_DEFAUT;
  const debutInitial = e?.heure ?? '';
  const [jour, setJour] = useState(e?.jour ?? '');
  const [debut, setDebut] = useState(debutInitial);
  const [fin, setFin] = useState(e?.heure ? heureFinProposee(e.heure) : '');
  const [finTouchee, setFinTouchee] = useState(e !== null);
  const [confieA, setConfieA] = useState<number | null>(e?.confieAId ?? null);
  const [libelles, setLibelles] = useState<Record<number, string>>({});
  const [commentaire, setCommentaire] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // 🔴 Arno (18/11/2026, 2e lot) — « Envoyer l'invitation aux locataires : Oui / Non » : obligatoire, rien de pré-coché
  const [choixLoc, setChoixLoc] = useState<ChoixLocataires | null>(null);
  const [manqueChoix, setManqueChoix] = useState(false);
  // Pour un déplacement, la fin d'origine (durée de la tâche) est reprise.
  useEffect(() => {
    if (e?.heure && e.dureeMinutes !== null) {
      const [h, m] = e.heure.split(':').map(Number);
      const t = Math.min(h * 60 + m + e.dureeMinutes, 23 * 60 + 59);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFin(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
  }, [e]);
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data)) setLibelles(Object.fromEntries(lu.etat.data.map((p) => [p.id, p.libelle]))); }, [lu.etat]);
  const verdict = verifierPlanification({ jour, debut, fin, confieA, commentaire }, [{ recuLe: l.recuLe, dateMax: l.dateMax }]);
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : planifier / déplacer impossible (le serveur refuse aussi).
  const emails = useEmailsLocataires(l);
  /* 🔴 Arno (10/11/2026) — AVANT tout envoi : le récapitulatif (qui recevra l'invitation, et son texte) ; « Revenir » garde la saisie. */
  const recap = useRecapEnvois();
  const valider = async (): Promise<void> => {
    if (!verdict.ok) { setRefus(verdict.motif); return; }
    if (choixLoc === null) { setManqueChoix(true); setRefus(MOTIF_CHOIX_LOCATAIRES); return; }
    setEnvoi(true); setRefus(null);
    const corps = e === null
      ? { action: 'planifier-edls', occupationIds: l.occupationIds, jour, debut, fin, confieA, commentaire, locataires: choixLoc }
      : { action: 'deplacer-edls', occupationIds: l.occupationIds, jour, debut, fin, confieA, locataires: choixLoc };
    const tenu: { r: Awaited<ReturnType<typeof envoyer>> | null } = { r: null };
    const issue = await recap.demander({
      titre: e === null ? 'État des lieux de sortie planifié' : 'Rendez-vous déplacé', apercu: {},
      lireApercu: () => lireApercuEdls({ ...corps, geste: e === null ? 'planifier' : 'deplacer' }),
      confirmer: true,
      action: async () => { tenu.r = await envoyer(corps, { propre: true }); return issueEdls(tenu.r, e === null ? 'État des lieux planifié' : 'Rendez-vous déplacé'); },
    });
    setEnvoi(false);
    if (issue === null) return; // « Revenir » : rien n'est fait, la saisie reste
    const r = tenu.r;
    if (r === null || r.motif !== null) { setRefus(issue.ok ? null : issue.message); return; }
    const data = (r.data ?? {}) as { statut?: EdlsAffiche['statut'] };
    onFait({
      edlsId: e?.edlsId ?? 0, tacheId: e?.tacheId ?? 0, jour: verdict.jour, heure: verdict.heure, dureeMinutes: verdict.dureeMinutes,
      confieA: (confieA !== null ? libelles[confieA] : null) ?? e?.confieA ?? '', confieAId: confieA,
      statut: data.statut ?? 'en_attente', reponduPar: null, motifRefus: null,
    }, phraseGeste(e === null ? 'État des lieux planifié' : 'Rendez-vous déplacé', r.data));
  };
  return (
    <div className="pvs-form pva-form-edls" data-formulaire-edls={e === null ? 'planifier' : 'deplacer'}>
      {recap.fenetre}
      <div className="pva-grille-edls">
        <label className="pvs-champ"><span className="pvs-libelle">Date de l’EDLS *</span>
          <input type="date" value={jour} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} onChange={(ev) => { setJour(ev.target.value); setRefus(null); }} data-edls-jour /></label>
        {/* 🔴 Arno (18/11/2026) — l'heure en deux listes : 00 à 23 h, et les minutes du réglage (00, 15, 30, 45 par défaut) */}
        <ChoixHeure libelle="Heure de début *" valeur={debut} minutes={minutesRdv} plage={plageRdv} role="debut" donnees="data-edls-debut"
          onChange={(v) => { setDebut(v); if (!finTouchee) setFin(heureFinProposee(v)); setRefus(null); }} />
        <ChoixHeure libelle="Heure de fin *" valeur={fin} minutes={minutesRdv} plage={plageRdv} role="fin" donnees="data-edls-fin" onChange={(v) => { setFin(v); setFinTouchee(true); setRefus(null); }} />
      </div>
      <ChoixPersonne valeur={confieA} onChange={setConfieA} />
      {e === null && (
        <label className="pvs-champ"><span className="pvs-libelle">Commentaire (facultatif)</span>
          <textarea value={commentaire} onChange={(ev) => setCommentaire(ev.target.value)} rows={2} placeholder="ex. clés chez le gardien" data-edls-commentaire /></label>
      )}
      <ChoixInviterLocataires valeur={choixLoc} onChange={(c) => { setChoixLoc(c); setManqueChoix(false); setRefus(null); }} desactive={envoi} manque={manqueChoix} />
      <BlocageEmailLocataires e={emails} />
      {!verdict.ok && (jour !== '' || debut !== '') && <p className="cp-refus" role="status" data-edls-message>{verdict.motif}</p>}
      {refus !== null && <p className="cp-refus" role="alert" data-edls-refus>{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || !verdict.ok || emails.bloque} onClick={() => { void valider(); }} data-valider-edls>
          {envoi ? 'Enregistrement…' : e === null ? 'Planifier' : 'Déplacer le rendez-vous'}</button>
      </div>
    </div>
  );
}

/** Après un refus : confier l'EDLS à quelqu'un d'autre (nouvelle demande, nouveau mail). */
function FormulaireReattribuer({ l, e, onAnnuler, onFait }: { l: LignePreavisAccueil; e: EdlsAffiche; onAnnuler: () => void; onFait: (x: EdlsAffiche, phrase: string) => void }) {
  const [confieA, setConfieA] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  const libelle = (id: number | null): string => (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data) ? lu.etat.data.find((p) => p.id === id)?.libelle ?? '' : '');
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : réaffectation impossible (le serveur refuse aussi).
  const emails = useEmailsLocataires(l);
  const recap = useRecapEnvois();
  const valider = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const corps = { action: 'reattribuer-edls', occupationIds: l.occupationIds, confieA };
    const tenu: { r: Awaited<ReturnType<typeof envoyer>> | null } = { r: null };
    const issue = await recap.demander({
      titre: 'État des lieux confié à quelqu’un d’autre', apercu: {},
      lireApercu: () => lireApercuEdls({ ...corps, geste: 'reattribuer', jour: e.jour, debut: e.heure ?? '', fin: '' }),
      confirmer: true,
      action: async () => { tenu.r = await envoyer(corps, { propre: true }); return issueEdls(tenu.r, 'État des lieux confié'); },
    });
    setEnvoi(false);
    if (issue === null) return;
    const r = tenu.r;
    if (r === null || r.motif !== null) { setRefus(issue.ok ? null : issue.message); return; }
    const data = (r.data ?? {}) as { statut?: EdlsAffiche['statut'] };
    onFait({ ...e, confieA: libelle(confieA), confieAId: confieA, statut: data.statut ?? 'en_attente', reponduPar: null, motifRefus: null },
      phraseGeste(`État des lieux confié à ${libelle(confieA)}`, r.data));
  };
  return (
    <div className="pvs-form" data-formulaire-reattribuer>
      {recap.fenetre}
      <ChoixPersonne valeur={confieA} onChange={setConfieA} exclure={e.confieAId} />
      <BlocageEmailLocataires e={emails} />
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || confieA === null || emails.bloque} onClick={() => { void valider(); }} data-valider-reattribution>
          {envoi ? 'Enregistrement…' : 'Confier'}</button>
      </div>
    </div>
  );
}

/**
 * Jetons du thème uniquement. 🔴 HAUTEUR CONSTANTE des lignes : deux lignes de texte (une chacune, tronquée proprement,
 * texte complet en infobulle et dans l'intitulé du bouton), une hauteur FIXE — au bureau comme au téléphone.
 */
export const CSS_PREAVIS_ACCUEIL = `
.pva{display:flex;flex-direction:column;gap:12px;min-width:0}
.pva-titre{margin:0;font-size:1.15rem;font-weight:800;display:flex;align-items:center;gap:8px}
.pva-repli{appearance:none;border:0;background:none;padding:0;margin:0;min-height:44px;font:inherit;color:inherit;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
.pva-fleche{display:inline-block;width:1em}
.pva-alertes{margin-left:.6rem;font-size:.9rem;font-weight:800;color:var(--color-svv-red)}
.pva-entete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px}
.pva-plein{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;border:0;background:none;font:inherit;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.pva-recherche{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.pva-recherche input{min-height:44px;box-sizing:border-box;flex:1 1 260px;max-width:480px;padding:0 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;font:inherit}
.pva-tris{display:flex;flex-wrap:wrap;gap:10px 18px}
/* Arno (15/11/2026) : le panneau des tris (replie derriere l'icone « Tris ») ; l'icone au bout de la rangee « Statut » ; le tri des rendez-vous */
.pva-icone-tris{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 10px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.pva-icone-tris[aria-expanded="true"]{border-color:var(--color-svv-ink);box-shadow:0 0 0 1px var(--color-svv-ink)}
.pva-tris-pastille{position:absolute;top:6px;right:6px;width:10px;height:10px;border-radius:999px;background:var(--color-svv-red);border:2px solid var(--color-svv-surface)}
.pva-panneau-tris[hidden]{display:none}
.pva-panneau-tris{display:flex;flex-direction:column;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-field)}
.pva-fermer-tris{min-height:44px;width:auto}
.pva-avant-liste{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pva-tri-rdv{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.88rem;font-weight:700;cursor:pointer}
.pva-tri-rdv[data-tri-rdv="off"]{color:var(--color-svv-muted);font-weight:600}
.pva-separateur{padding:8px 12px;font-size:.82rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted);background:var(--color-svv-field);border-top:1px solid var(--color-svv-line)}
.pva-tri{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pva-tri-libelle{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.pva-segment{min-height:44px;padding:8px 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;cursor:pointer}
/* Arno (19/10/2026) — le tri ACTIF en ROUGE (le rouge des gros boutons actifs, texte blanc) ; les autres restent blancs. */
.pva-segment[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface);border-color:var(--color-svv-red);font-weight:700}
.pva-liste{list-style:none;margin:0;padding:0;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.pva-item + .pva-item{border-top:1px solid var(--color-svv-line)}
.pva-ligne{box-sizing:border-box;height:4.75rem;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 12px}
/* Arno (15/11/2026) : le statut de la ligne et ses reperes (echu, EDLS a reattribuer, alerte) dans UN conteneur qui passe a la ligne,
   jamais sous le bouton « Ouvrir » */
.psl-cartouches{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px 6px;min-width:0}
.pvv-cartouches{display:flex;flex-direction:column;gap:2px;align-items:flex-end}
.pva-textes{display:flex;flex-direction:column;gap:2px;min-width:0}
.pva-noms,.pva-detail{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pva-noms{font-weight:800;color:var(--color-svv-ink)}
.pva-detail{font-size:.88rem;color:var(--color-svv-muted)}
/* Arno (15/11/2026) : ligne 1 = nom(s) + adresse ; ligne 2 = colonnes FIXES communes a tout le listing (les dates de rendez-vous sont toutes
   dans la meme colonne verticale) : A fin de preavis, B rendez-vous fixe (couleur de son type), C details */
.pva-l1{display:flex;align-items:baseline;gap:10px;min-width:0;white-space:nowrap}
.pva-l1 .pva-noms{flex:0 1 auto}
.pva-adresse{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-svv-ink)}
.pva-l2{display:grid;grid-template-columns:11.75rem 16rem minmax(0,21rem) max-content minmax(0,1fr);align-items:center;column-gap:12px;min-width:0;font-size:.88rem}
/* 🔴 Arno (18/11/2026) — la colonne des LOCATAIRES, a droite de la mission : jamais tronquee (le mot toujours entier), jamais un nom */
.pva-col-loc{display:flex;align-items:center;min-width:0}
.pva-col-loc .pva-loc{margin-left:0;flex:0 0 auto;overflow:visible}
/* la mission du rendez-vous : « confie a Prenom NOM » puis l'etat (orange doux : en attente ; vert doux : confirme ; rouge doux : refuse) */
.pva-col-mission{display:flex;align-items:center;gap:6px;min-width:0}
.pva-confie{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-svv-ink)}
.pva-etat-mission{flex:0 0 auto;display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:.76rem;font-weight:800;white-space:nowrap;border:1px solid currentColor}
.pva-etat-mission--attente{background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}
.pva-etat-mission--confirme{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.pva-etat-mission--refuse{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
/* 🔴 Arno (18/11/2026, 495) — le cartouche des LOCATAIRES, à côté de celui du collègue : même forme, le mot toujours écrit, jetons du thème */
.pva-loc{flex:0 1 auto;min-width:0;display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:.76rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px dashed currentColor;margin-left:6px}
.pva-loc--attente{background:var(--color-svv-field);color:var(--color-svv-muted)}
.pva-loc--confirme{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.pva-loc--refuse{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.pva-loc--non_invites{background:var(--color-svv-surface);color:var(--color-svv-muted)}
.pva-rdv-locataires{display:flex;flex-direction:column;gap:8px;min-width:0;width:100%;padding-top:8px;border-top:1px solid var(--color-svv-line)}
.pva-rdv-loc-tete{margin:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;font-size:.88rem;overflow-wrap:anywhere}
.pva-rdv-loc-tete .pva-loc{margin-left:0;white-space:normal;overflow:visible;max-width:100%}
.pva-rdv-loc-liste{margin:0;padding-left:18px;color:var(--color-svv-ink);font-size:.88rem;overflow-wrap:anywhere}
.pva-rdv-loc-boutons{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:0}
.pva-rdv-loc-boutons .svv-btn{width:100%;min-height:44px;margin:0;display:inline-flex;align-items:center;justify-content:center;text-align:center;white-space:normal;height:auto;padding-top:8px;padding-bottom:8px}
.pva-rdv-locataires .cp-refus{margin:0;overflow-wrap:anywhere}
.pva-col-fin,.pva-col-rdv,.pva-col-details{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pva-col-fin{color:var(--color-svv-muted)}
.pva-col-rdv{font-weight:800;display:flex;flex-direction:column;justify-content:center}
.pva-rdv-date,.pva-rdv-depassee{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pva-rdv-depassee{font-size:.72rem;line-height:1.1;font-weight:700;color:var(--color-svv-red)}
.pva-col-rdv--previsite{color:var(--color-svv-sarcelle)}
.pva-col-rdv--edl{color:var(--color-svv-violet)}
.pva-col-rdv--effectuee,.pva-col-rdv--aucun{color:var(--color-svv-muted);font-weight:600}
.pva-col-details{color:var(--color-svv-muted)}
/* 🔴 Arno (16/11/2026) : DEUX rendez-vous fixes (pre-visite puis etat des lieux), l'un sous l'autre : une sous-grille sur les colonnes B
   (rendez-vous) et C (mission), alignee sur celles des autres lignes ; la ligne est un peu plus haute */
.pva-col-rdv--deux{grid-column:span 3;display:grid;grid-template-columns:subgrid;row-gap:3px;align-items:center}
.pva-rdv-item{min-width:0;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
.pva-col-rdv--deux .pva-col-mission{font-weight:400}
.pva-ligne--deux-rdv{height:6.25rem;grid-template-columns:minmax(min(52rem,calc(100% - 16rem)),1fr) auto auto}
/* les deux statuts : cote a cote quand l'ecran le permet, l'un sous l'autre sinon (jamais au prix de « confie a … » tronque) */
.pva-ligne--deux-rdv .psl-cartouches{flex-direction:column;align-items:flex-end}
.pva-ouvrir{min-height:44px}
.pva-depliee{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;padding:4px 12px 14px}
.pva-bloc{display:flex;flex-direction:column;gap:8px;min-width:0}
.pva-logement{grid-column:1 / -1}
.pva-dates-preavis{margin:0;font-weight:600;color:var(--color-svv-ink)}
/* 🔴 Arno (13/11/2026) — un rendez-vous FIXE : vert (le vert de la pre-visite effectuee), texte vert fonce ; le refus reste orange */
.pva-edls{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);font-weight:700;overflow-wrap:anywhere}
.pva-edls--refus{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
/* 🔴 Arno (19/11/2026) — une heure ne passe jamais sur deux lignes : chaque champ (Date, Debut, Fin) a la place de l'heure ET des minutes ; la ligne
   passe a la ligne quand la place manque */
.pva-grille-edls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10.75rem),1fr));gap:10px}
.pva-form-edls input,.pva-form-edls select,.pva-form-edls textarea,[data-formulaire-reattribuer] select{min-height:44px;box-sizing:border-box;width:100%;max-width:100%}
.pva-liens{grid-column:1 / -1;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px}
.pva-liens a{display:inline-flex;align-items:center;min-height:44px;color:var(--color-svv-ink);font-weight:600;text-decoration:underline}
.sor-gestion-seule-texte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink)}
@media (max-width:760px){
  /* 🔴 (16/11/2026) 10,5 rem : la place de la mention « date dépassée — … » sous la date, sur toutes les lignes (hauteur constante) */
  .pva-ligne{height:10.5rem;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto}
  /* telephone : ligne 1 nom + adresse ; puis la date du rendez-vous en premier (toujours a gauche, meme style), la fin de preavis dessous ;
     les details restent dans l'infobulle de la ligne ; aucun debordement horizontal */
  .pva-l2{grid-template-columns:minmax(0,1fr);row-gap:2px}
  .pva-col-rdv{order:-2}
  .pva-col-mission{order:-1;min-height:1.2rem}
  .pva-col-loc{order:-1}
  .pva-col-loc:empty{display:none}
  /* deux rendez-vous : pre-visite et sa mission, puis etat des lieux et sa mission, en tete ; la ligne s'allonge d'autant */
  .pva-col-rdv--deux{grid-column:auto;row-gap:2px}
  .pva-col-rdv--deux > *{order:0}
  .pva-ligne--deux-rdv{height:14rem;grid-template-columns:minmax(0,1fr) auto}
  .pva-ligne--deux-rdv .psl-cartouches{flex-direction:row;align-items:center}
  .pva-col-details{display:none}
  /* hauteur CONSTANTE (Arno) : les reperes, plus compacts, tiennent au plus sur deux rangees, jamais sous « Ouvrir » */
  .psl-cartouches{justify-content:flex-start;gap:3px 4px;max-height:2.9rem;overflow:hidden}
  .psl-cartouches .psl-statut,.psl-cartouches .pvs-mention,.psl-cartouches .pvv-cartouche{font-size:.72rem;line-height:1.2;padding:1px 6px;letter-spacing:-.01em}
  .pva-ligne{gap:6px}
  .pva-textes{grid-column:1 / -1}
  .pva-ligne .pvs-mention{justify-self:start}
  .pva-ligne{grid-template-columns:minmax(0,1fr) auto}
  .pvv-cartouches{align-items:flex-start}
  .pva-depliee{grid-template-columns:1fr}
}
/* 🔴 (16/11/2026) ecran large : les deux statuts cote a cote */
@media (min-width:1700px){.pva-ligne--deux-rdv .psl-cartouches{flex-direction:row}}
.frp{grid-column:1 / -1;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;counter-reset:none;min-width:0}
@media (max-width:1100px){.frp{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:600px){.frp{grid-template-columns:1fr}}
.frp{grid-auto-rows:auto}
/* 🔴 Arno (19/11/2026) — les cases gardent la MEME hauteur (celle de la plus haute) et leur contenu entier (en-tete compris) est CENTRE
   VERTICALEMENT : un ensemble plus uniforme (Arno revient sur l'option A du 18/11, contenu en haut). Telephone : cases empilees, chacune
   sa hauteur (rien a centrer). */
.frp-etape{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;padding:10px 12px;border-radius:12px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.frp-etape--faite{border-color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.frp-etape--refusee{border-color:var(--color-svv-urgence-orange);background:color-mix(in srgb, var(--color-svv-urgence-orange) 14%, var(--color-svv-surface))}
/* La mise en évidence ne change pas l'épaisseur du bord (2 px partout) : les pastilles restent à la même hauteur dans les 4 cases. */
.frp-etape--en-cours{border-color:var(--color-svv-ink);box-shadow:inset 0 0 0 1px var(--color-svv-ink), 0 0 0 3px color-mix(in srgb, var(--color-svv-ink) 18%, transparent)}
.frp-tete{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:start}
/* 🔴 Arno (11/11/2026) — la pastille sur la LIGNE DU TITRE, à la même hauteur dans les 4 cases. */
.frp-numero{grid-row:1;align-self:start;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;font-weight:900;
  background:var(--color-svv-ink);color:var(--color-svv-surface)}
.frp-etape--faite .frp-numero{background:var(--color-svv-green-ink)}
.frp-etape--refusee .frp-numero{background:var(--color-svv-urgence-orange)}
.frp-titre{font-weight:900;color:var(--color-svv-ink);line-height:22px;padding-top:3px}
.frp-lu{position:absolute;top:0;left:0;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.frp-statut{grid-column:2;font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere;display:flex;flex-direction:column}
.frp-etape .pva-bloc{border:0;padding:0;background:transparent}
.frp-etape > .pva-bloc{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0}
.frp-infos,.frp-actions{display:flex;flex-direction:column;gap:8px;min-width:0}
.frp-actions .loc-boutons{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:0}
.frp-actions .loc-boutons .svv-btn{width:100%;min-height:48px;margin:0;display:inline-flex;align-items:center;justify-content:center;text-align:center;white-space:normal}
`;
