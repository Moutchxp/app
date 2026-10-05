'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyserTerme, formaterDateIso, messageRechercheVide, periodeOccupation, titreLogement,
} from '../../../../lib/gestion/annuaireRecherche';
import type {
  BienDuProprietaire, ContactAffiche, FicheLocataire, FicheLot, FicheProprietaire,
  LogementDuLocataire, OccupationDuLot, PersonneTrouvee, RolePersonne,
} from '../../../../lib/gestion/annuaireRepo';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-2 — `VieDuBien` N'EST PLUS MONTÉ SUR LA FICHE D'UN **BIEN** (accord d'Arno,
 * 04/10/2026 : « deux listings de mails, c'est un de trop » ; le moteur prend sa place, juste sous « Historique
 * des locataires »). Il reste monté sur la fiche d'un **LOCATAIRE**, où il est le SEUL listing et où aucun
 * doublon ne justifiait de le retirer — voir l'encadré de `VieDuBien.tsx`.
 *
 * ⚠️ `CSS_VIE_DU_BIEN` RESTE MONTÉ ICI, et il le faut davantage qu'avant : le moteur rend `LigneVie` pour chacun
 * de ses mails, donc il lui faut ces règles. `CSS_HISTORIQUE_DU_BIEN` les emporte aussi — un style monté deux
 * fois est inoffensif, un style manquant ferait un listing sans mise en forme.
 */
import { CSS_VIE_DU_BIEN, VieDuBien, type FiltreVie } from './VieDuBien';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-1 — « L'HISTORIQUE DU BIEN », AJOUTÉ **EN DERNIER** DANS LA FICHE D'UN LOGEMENT.
 *
 * ⚠️ RIEN N'EST RETIRÉ, MASQUÉ, DÉPLACÉ NI RESTYLÉ AU-DESSUS : l'en-tête, les cartes PROPRIÉTAIRE / LOCATAIRE EN
 * PLACE / HISTORIQUE DES LOCATAIRES, le bloc « Vie du bien » et le lien « Tout l'historique des échanges → »
 * restent exactement ce qu'ils étaient. Ce bloc s'ajoute APRÈS ce lien, en bas de la fiche.
 */
import { CSS_HISTORIQUE_DU_BIEN, HistoriqueDuBien } from './HistoriqueDuBien';
import { type CategoriePartie, type ClientDuBien, type OccupationPeriode, type PeriodePartie }
  from '../../../../lib/gestion/historiqueBien';
// 🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — le dossier des documents envoyés par le logiciel de gestion.
import { DocumentsAutomatiques } from './DocumentsAutomatiques';
// 🔴🔴 LOT CONTACTS-EXTERNES — les échanges de cette personne passés par un intermédiaire. Liste DISTINCTE.
import { InterventionsDeLaFiche } from './InterventionsDeLaFiche';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 6 — `fiche=bien-478` demande la fiche par la CLÉ WIPPIMMO.
import { ficheParCle } from '../../../../lib/gestion/ecranUrl';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import type { Cible } from '../../../../lib/gestion/rattachement';
// LOT FICHES-ANNUAIRE étape C — les personnes en CARTES côte à côte, modifiables sur place.
import {
  BlocCartes, CSS_CARTES, Ligne as LigneFiche, type ChampsSaisis, type GestesCartes, type Sujet,
} from './CartesPersonnes';
import { MOTIF_SANS_MIGRATION } from '../../../../lib/gestion/annuaireEdition';
// LOT FICHES-RETOUCHES — la nomenclature des coordonnées, partagée par tous les écrans de l'annuaire.
import { lienAppel, lignesParType } from '../../../../lib/gestion/telephoneAffichage';

/**
 * LOT ANNUAIRE-1 — L'ÉCRAN « ANNUAIRE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL CHAMP DE RECHERCHE, et c'est la demande d'Arno mot pour mot : « trouver par nom, adresse, téléphone ou
 * mail qui est qui par rapport à un logement ». Quatre champs obligeraient à décider AVANT de taper dans lequel on
 * est — alors qu'on a sous les yeux un numéro sans savoir s'il est d'un propriétaire ou d'un locataire.
 *
 * 🔴 LES RÉSULTATS SONT GROUPÉS PAR LOGEMENT, parce que c'est l'unité de la question : « 12 rue X, Puteaux —
 * Propriétaire : … — Locataire actuel : … ». Chaque ligne porte le trio, et chaque nom du trio est cliquable.
 *
 * 🔴 LECTURE SEULE DANS CE LOT. Rien ne se saisit ici : WIPPIMMO fait foi, et une correction tapée dans cet écran
 * serait écrasée au prochain import sans prévenir. L'écran DIT de quand datent ses données, pour qu'on sache quoi
 * penser d'un numéro qui ne répond pas.
 *
 * 🔒 LES COORDONNÉES SONT CLIQUABLES, PAS RECOPIABLES AILLEURS : `tel:` compose, `mailto:` ouvre le courrier. Rien
 * n'est envoyé nulle part par cet écran.
 *
 * MOBILE D'ABORD (exigence transverse §15) : tout tient en une colonne à 390 px, aucune table à défilement
 * horizontal, cibles tactiles ≥ 44 px, AUCUNE interaction au seul survol — les fiches s'ouvrent au clic, et l'état
 * « locataire actuel » est dit par un MOT, jamais par une seule couleur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Reponse =
  | { etat: 'repos' }
  | { etat: 'charge' }
  | { etat: 'sans_schema' }
  | { etat: 'erreur'; message: string }
  /** 🔴 LOT ANNUAIRE-PERSONNES — la réponse porte des PERSONNES, plus des lots. */
  | { etat: 'ok'; personnes: PersonneTrouvee[]; tronque: boolean; importe: { le: string } | null };

type Fiche =
  | { etat: 'charge' }
  | { etat: 'erreur'; message: string }
  | { etat: 'proprietaire'; data: FicheProprietaire }
  | { etat: 'lot'; data: FicheLot }
  | { etat: 'locataire'; data: FicheLocataire };

/** Le temps de silence après la dernière frappe avant d'interroger. Assez court pour paraître instantané, assez
 *  long pour ne pas lancer une requête par lettre. */
const ATTENTE_FRAPPE_MS = 250;

/* ══ 🔴🔴 RETIRÉ LE 30/09/2026 — LOT FICHES-RETOUCHES-2 ══════════════════════════════════════════════════════════
   Ici vivaient `DemandeAjout` et son panneau : un clic sur « + Ajouter » ouvrait EN HAUT DE LA FICHE un petit
   formulaire (Civilité / Nom / date / Créer la fiche), loin de la tuile cliquée.

   Arno l'a remplacé : « Un clic sur la tuile “+ Ajouter” ouvre, À SA PLACE DANS LA RANGÉE, une carte identique au
   mode Modifier d'un contact existant, mais vide ». Le geste se passe désormais là où l'on a cliqué, et la fiche
   naît COMPLÈTE — sept champs, un téléphone, un e-mail — au lieu de naître nue et d'attendre qu'on rouvre le
   crayon. Ce que l'ancien panneau garantissait est tenu, et mieux : la personne est rattachée aux biens de la
   fiche, et la phrase de rappel le DIT avant qu'on ne remplisse quoi que ce soit.
   L'état vit maintenant dans `BlocCartes`, au plus près de la rangée qu'il concerne. */


export function Annuaire({
  fiche, onFiche, onRetour, onEcrire, onHistorique, maintenant, onOuvrirFil, poserSurVie = false,
  jetonHistorique = null, onPoserJeton,
}: {
  fiche: FicheUrl | null;
  onFiche: (f: FicheUrl | null) => void;
  onRetour: () => void;
  /**
   * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — l'adresse demande de se poser sur « Vie du bien » (`&bloc=vie`).
   * `false` (le défaut) = la fiche s'ouvre par le haut, exactement comme avant ce lot.
   */
  poserSurVie?: boolean;
  /** LOT HISTORIQUE-BIEN-3, POINT 4 — le jeton de retour vers « l'historique du bien », lu dans l'adresse. */
  jetonHistorique?: string | null;
  onPoserJeton?: (jeton: string) => void;
  /**
   * 🔴 LOT FICHES-ANNUAIRE étape B — l'heure de référence de l'écran, pour que « il y a 3 h » soit le même partout.
   * Par défaut, maintenant : une fiche ouverte sans référence n'a pas à afficher des dates fausses.
   */
  maintenant?: Date;
  /** Ouvre l'échange d'un mail de la « vie du bien ». Absent = la ligne reste lisible, sans ce chemin. */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /** Ouvre « Nouveau message » de la tuile avec ce destinataire. Absent = le lien `mailto:` du système. */
  onEcrire?: (email: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique des échanges d'un logement ou d'un propriétaire. Absent = le bouton
   * ne s'affiche pas : la fiche reste exactement celle du lot ANNUAIRE-1.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  const [terme, setTerme] = useState('');
  /**
   * ⚠️ UNE SEULE RÉFÉRENCE DE TEMPS POUR TOUT L'ÉCRAN, figée au montage : recalculer `new Date()` à chaque rendu
   * ferait glisser les « il y a 3 min » d'une ligne à l'autre, et l'on croirait à des mails différents.
   */
  const [refTemps] = useState(() => maintenant ?? new Date());
  const [reponse, setReponse] = useState<Reponse>({ etat: 'repos' });
  /**
   * 🔴 LOT ANNUAIRE-PERSONNES — « Personnes archivées : masquées par défaut ; une case “Afficher les archivées”
   * les montre, avec la mention “archivée” ». L'état vit ici, à côté du terme : les deux font la requête.
   */
  const [archivees, setArchivees] = useState(false);
  const [detail, setDetail] = useState<Fiche | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  /**
   * ══ 🔴 LOT FICHES-ANNUAIRE (étape C) — CE QUI FAIT RELIRE LA FICHE APRÈS UNE MODIFICATION ═══════════════════════
   *
   * Un compteur, et il entre dans les dépendances du chargement. Après un enregistrement, on RELIT tout depuis la
   * base plutôt que de rapiécer l'état local.
   *
   * 🔴 POURQUOI RELIRE ET NON RAPIÉCER. Le serveur ne fait pas que ranger ce qu'on lui envoie : il recompose le nom
   * affiché, réveille une coordonnée archivée qui revient, réordonne les cartes, pose des verrous. Un état local
   * mis à jour à la main finirait par montrer autre chose que la base — et c'est précisément ce genre d'écart qui
   * fait douter de tout l'écran. Une lecture de plus, c'est une requête ; une divergence, c'est un bogue.
   */
  const [rafraichi, setRafraichi] = useState(0);
  const recharger = useCallback(() => setRafraichi((n) => n + 1), []);
  /**
   * ══ 🔴 LOT FICHES-RETOUCHES — « HISTORIQUE » OUVRE LA FICHE DU BIEN, POSÉE SUR SA « VIE DU BIEN » ═══════════════
   *
   * Le bouton d'une carte de bien mène à la fiche de ce bien, et la fait s'ouvrir AU BON ENDROIT — sur la liste de
   * ses échanges, qui est ce qu'on venait voir.
   *
   * 🔴 UN ÉTAT POUR LES CLICS D'ICI. Un cartouche ou un bouton de CETTE fiche sait déjà où l'on est : son
   * intention n'a pas à traverser l'adresse, et elle ne doit pas survivre à un rechargement.
   *
   * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — … MAIS L'ADRESSE QUAND LA DEMANDE VIENT D'AILLEURS ═════════
   *
   * DÉCISION D'ARNO (03/10/2026) : « oui, “Historique du bien” pose la page directement sur le bloc “Vie du
   * bien” de la fiche (paramètre d'adresse + défilement). La flèche retour reste inchangée. »
   *
   * Ce fichier portait l'arbitrage inverse, et il était juste tant que la demande venait d'un clic DANS la fiche.
   * Le bouton « Historique du bien » des cartes de la fenêtre « Bien(s) rattaché(s) à ce mail » est ailleurs : il
   * ARRIVE sur la fiche, et ce qu'il promet doit tenir après un rechargement comme dans un lien envoyé à un
   * collègue. D'où `?bloc=vie`, lu par `ecranUrl` et rendu ici par `poserSurVie`.
   *
   * ⚠️ LES DEUX CHEMINS SE REJOIGNENT ICI, et c'est voulu : `vieDuBienVisee` reste le seul état qui commande le
   * défilement. Un second mécanisme aurait fini par se poser deux fois, ou pas du tout.
   */
  const [vieDuBienVisee, setVieDuBienVisee] = useState<number | null>(null);
  /**
   * 🔴 LE FILTRE DE LA « VIE DU BIEN » VIT ICI, ET SÉPARÉMENT DE LA DEMANDE DE DÉFILEMENT. Deux choses distinctes :
   * « pose la page sur la vie du bien » (une demande, consommée UNE fois, puis effacée) et « montre-la filtrée sur
   * les événements » (un état, qui doit TENIR tant qu'on ne le change pas). Les mêler ferait retomber la liste sur
   * « Tous » aussitôt après le défilement.
   */
  const [filtreVie, setFiltreVie] = useState<FiltreVie>('tous');
  const ouvrirVieDuBien = useCallback((lotId: number, filtre: FiltreVie = 'tous') => {
    setFiltreVie(filtre);
    setVieDuBienVisee(lotId);
    onFiche({ sorte: 'lot', id: lotId });
  }, [onFiche]);
  /**
   * 🔴 LOT FICHES-RETOUCHES-2 — LE CARTOUCHE MÈNE AU MÊME ENDROIT QUE « HISTORIQUE », mais filtré sur les
   * échanges qui portent un événement ouvert. Un seul chemin, deux points d'arrivée : celui qu'on demande.
   */
  const ouvrirEvenements = useCallback((lotId: number) => ouvrirVieDuBien(lotId, 'evenement'), [ouvrirVieDuBien]);

  /**
   * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — ARRIVER SUR « VIE DU BIEN » PAR L'ADRESSE ══════════════════
   *
   * `?ecran=annuaire&fiche=lot-287&bloc=vie` demande exactement ce que demande le cartouche « Historique » de la
   * fiche : on le fait donc passer par le MÊME état, et le défilement reste écrit à un seul endroit.
   *
   * ⚠️ ON NE RÉÉCRIT PAS L'ADRESSE ICI. Elle garde `bloc=vie`, et c'est juste : elle décrit d'où l'on vient et ce
   * qu'on est venu voir. Le défilement, lui, n'a lieu qu'une fois — `onVieDuBienPosee` efface l'état, et cet
   * effet ne repart que si la fiche visée change.
   *
   * ⚠️ `sorte === 'lot'` SEULEMENT : « Vie du bien » n'existe pas sur la fiche d'une personne, et viser un bloc
   * qui n'est pas là ferait un défilement vers nulle part.
   */
  useEffect(() => {
    /* 🔴 POINT 6 — `bien` est une fiche de bien, elle aussi : « Vie du bien » doit s'y poser pareil. */
    if (!poserSurVie || fiche === null || (fiche.sorte !== 'lot' && fiche.sorte !== 'bien')) return;
    setVieDuBienVisee(fiche.id);
  }, [poserSurVie, fiche]);

  // ── LA RECHERCHE ────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = terme.trim();
    if (t === '') { setReponse({ etat: 'repos' }); return; }
    let vivant = true;
    setReponse({ etat: 'charge' });
    const minuterie = setTimeout(() => {
      void (async () => {
        try {
          /* 🔴 LOT ANNUAIRE-PERSONNES — `archivees` part dans l'ADRESSE de la requête, et la case est dans les
             dépendances de l'effet : la cocher relance la recherche, sans qu'on ait à retaper quoi que ce soit. */
          const res = await fetch(
            `/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}${archivees ? '&archivees=1' : ''}`,
            { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; data?: { personnes?: PersonneTrouvee[]; tronque?: boolean };
            importe?: { le: string } | null;
          };
          if (!vivant) return;
          if (d.etat === 'sans_schema') { setReponse({ etat: 'sans_schema' }); return; }
          if (d.etat !== 'ok') { setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti.' }); return; }
          setReponse({
            etat: 'ok', personnes: d.data?.personnes ?? [], tronque: d.data?.tronque === true,
            importe: d.importe ?? null,
          });
        } catch {
          if (vivant) setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti : le serveur n’a pas répondu.' });
        }
      })();
    }, ATTENTE_FRAPPE_MS);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [terme, archivees]);

  // ── LA FICHE OUVERTE, QUI VIT DANS L'ADRESSE ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fiche === null) { setDetail(null); return; }
    let vivant = true;
    setDetail({ etat: 'charge' });
    void (async () => {
      try {
        /**
         * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 6 — `bien-478` DEMANDE LA FICHE PAR LA CLÉ WIPPIMMO.
         *
         * La route sait déjà le faire depuis le lot MODALE-RATTACHER-PROPRE (`?lotCle=`, qui résout la clé puis
         * appelle la MÊME `ficheLot`) : il n'y a donc ni requête de plus, ni seconde lecture de « la fiche d'un
         * bien ». Seule l'ADRESSE gagne une porte.
         *
         * ⚠️ `lot-<id>` CONTINUE DE PASSER PAR `?lot=` : aucun lien déjà posé ne change de sens. Voir l'encadré
         * de `SorteFiche` et les 228 nombres ambigus qu'il mesure.
         */
        const parametre = ficheParCle(fiche.sorte) ? 'lotCle' : fiche.sorte;
        const res = await fetch(`/api/admin/gestion/annuaire?${parametre}=${fiche.id}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: unknown };
        if (!vivant) return;
        if (d.etat === 'inconnu') { setDetail({ etat: 'erreur', message: 'Cette fiche n’existe pas (ou plus) dans l’annuaire.' }); return; }
        if (d.etat !== 'ok') { setDetail({ etat: 'erreur', message: 'Fiche illisible.' }); return; }
        if (fiche.sorte === 'proprietaire') setDetail({ etat: 'proprietaire', data: d.data as FicheProprietaire });
        /* 🔴🔴 POINT 6 — `bien` rend LA MÊME `FicheLot` que `lot` : c'est la même fiche, demandée par l'autre
           numéro. Les rendre différemment aurait créé un second écran de fiche de bien. */
        else if (fiche.sorte === 'lot' || fiche.sorte === 'bien') {
          setDetail({ etat: 'lot', data: d.data as FicheLot });
        }
        else setDetail({ etat: 'locataire', data: d.data as FicheLocataire });
      } catch {
        if (vivant) setDetail({ etat: 'erreur', message: 'Fiche illisible : le serveur n’a pas répondu.' });
      }
    })();
    return () => { vivant = false; };
  }, [fiche, rafraichi]);

  const ouvrir = useCallback((sorte: FicheUrl['sorte'], id: number) => onFiche({ sorte, id }), [onFiche]);

  /**
   * ══ 🔴🔴 LES GESTES D'ÉCRITURE — UNE SEULE PORTE, UN SEUL TRAITEMENT DE REFUS ════════════════════════════════════
   *
   * Chaque geste rend `null` quand tout va bien, ou LE MOTIF DU REFUS, que la carte affiche là où on a cliqué.
   *
   * 🔴 UN REFUS N'EST PAS UNE ERREUR TECHNIQUE, et les deux ne se disent pas de la même façon : « cette adresse est
   * l'une des nôtres » est une phrase à lire et à corriger ; « la base n'a pas répondu » est une panne. Les
   * confondre ferait chercher un bogue là où il n'y a qu'une faute de frappe.
   *
   * ⚠️ `sans_schema` SE DIT AUSSI, avec son motif écrit : la migration 278 n'est pas appliquée. Il ne peut arriver
   * que si la migration disparaît entre le chargement de la fiche et le clic — mais il se dirait alors clairement,
   * plutôt que de laisser le bouton tourner dans le vide.
   */
  const envoyer = useCallback(async (corps: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/gestion/annuaire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { etat?: string; motif?: string; message?: string; data?: unknown };
      if (d.etat === 'ok') { recharger(); return null; }
      if (d.etat === 'sans_schema') return MOTIF_SANS_MIGRATION;
      if (d.etat === 'inconnu') return 'Cette fiche n’existe plus dans l’annuaire.';
      return d.motif ?? d.message ?? 'Enregistrement refusé.';
    } catch {
      return 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.';
    }
  }, [recharger]);

  const modifiable = detail !== null && detail.etat !== 'charge' && detail.etat !== 'erreur'
    && detail.data.modifiable;

  /**
   * 🔴 LOT SUPPRIMER-CARTE — la migration 287 est-elle là ? C'est le SERVEUR qui le dit, jamais l'écran : sans
   * elle, `onSupprimer` reste absent et l'entrée du menu n'existe pas du tout.
   */
  const suppressionDisponible = detail !== null && detail.etat !== 'charge' && detail.etat !== 'erreur'
    && detail.data.suppressionDisponible;

  const gestes: GestesCartes = {
    modifiable,
    onEnregistrer: (sujet, id, champs) => envoyer({ action: 'modifier', sujet, id, champs }),
    onArchiver: (sujet, id, archiver) => envoyer({ action: archiver ? 'archiver' : 'restaurer', sujet, id }),
    onSupprimer: suppressionDisponible
      ? (sujet, id) => envoyer({ action: 'supprimer', sujet, id })
      : undefined,
    onSeparer: (sujet, id, o) => envoyer({ action: 'separer', sujet, id, ...o }),
    onOrdonner: (sujet, ids) => envoyer({ action: 'ordonner', sujet, ids }),
    onAjouter: () => { /* remplacé par fiche : chaque vue sait à quel bien rattacher la personne */ },
    onEcrire,
  };

  /**
   * ══ 🔴🔴 CRÉER UNE PERSONNE, PUIS LA RATTACHER — EN DEUX TEMPS, ET C'EST VOULU ═══════════════════════════════════
   *
   * Arno : « ajouter un co-propriétaire », « ajouter un occupant ». Une personne neuve n'existe nulle part : il faut
   * d'abord la CRÉER (elle reçoit une clé « app-… », puisque WIPPIMMO ne la connaît pas), puis la RATTACHER au ou aux
   * biens concernés.
   *
   * 🔴 SI LE RATTACHEMENT ÉCHOUE, LA PERSONNE RESTE — et on le DIT. La défaire serait une suppression, et il n'y en a
   * pas dans ce module ; la taire laisserait une fiche orpheline que personne ne chercherait. On nomme donc les deux
   * moitiés du geste : « la fiche est créée, mais le rattachement au bien a échoué ».
   */
  const creerEtRattacher = useCallback(async (
    sujet: Sujet, lots: readonly number[], champs: ChampsSaisis,
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/gestion/annuaire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'creer', sujet, nom: champs.nom ?? '', champs }),
      });
      const cree = (await res.json()) as { etat?: string; motif?: string; data?: { id?: number } };
      if (cree.etat === 'sans_schema') return MOTIF_SANS_MIGRATION;
      if (cree.etat !== 'ok' || typeof cree.data?.id !== 'number') {
        return cree.motif ?? 'La fiche n’a pas pu être créée.';
      }
      const id = cree.data.id;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(champs.date ?? '') ? (champs.date as string) : null;
      for (const lotId of lots) {
        const motif = await envoyer(sujet === 'proprietaire'
          ? { action: 'ajouter-proprietaire', lotId, proprietaireId: id, depuis: date }
          : { action: 'ajouter-occupant', lotId, locataireId: id, entree: date });
        if (motif !== null) {
          recharger();
          return `La fiche « ${champs.nom ?? ''} » est créée, mais son rattachement au bien a échoué : ${motif}`;
        }
      }
      recharger();
      return null;
    } catch {
      return 'Création impossible : le serveur n’a pas répondu.';
    }
  }, [envoyer, recharger]);

  return (
    <div className="ann">
      <style>{CSS_ANNUAIRE}</style>
      <style>{CSS_VIE_DU_BIEN}</style>
      <style>{CSS_CARTES}</style>
      {/* 🔴🔴 LOT HISTORIQUE-BIEN-1 — monté comme les autres, à la suite. Il emporte ses dépendances de style
          (miniatures de pièces, picto Drive) : un style qu'un autre bloc monterait « plus haut dans la page »
          serait une dépendance invisible, qui tomberait le jour où ce bloc-là quitte la fiche. */}
      <style>{CSS_HISTORIQUE_DU_BIEN}</style>

      {/* ══ 🔴🔴 LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE : UN RETOUR, ET LA RECHERCHE ════════════════════════
          Arno, sur la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ». La fiche
          commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas — titre du module, sa
          description, le bandeau de relève, « Relève automatique », « Copie des pièces ». Ils sont retirés de CET
          écran (voir `GestionVue`), et restent là où ils servent : la page de la boîte.

          🔴 CE QU'ON GARDE, ET RIEN D'AUTRE : un fil de retour, et le champ de recherche — compact quand une
          fiche est ouverte, parce qu'on y cherche la personne SUIVANTE, pas la page où l'on est. */}
      <div className="ann-entete">
        {/* 🔴🔴 LOT FLECHES-RETOUR — UN SEUL GESTE, CELUI DE TOUT LE MODULE.
            Avant ce lot, ce bouton connaissait deux destinations FIXES : la liste de l'annuaire quand une fiche
            était ouverte, la boîte sinon. Venu d'un mail, il ne rendait donc jamais le mail — constat d'Arno.
            `onRetour` est maintenant le retour commun : il rend la liste quand on y a ouvert la fiche, et le mail
            quand on vient d'un mail. La présentation du bouton, elle, ne change pas d'un pixel. */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-retour-haut"
          onClick={() => onRetour()}>
          ← Retour
        </button>
        {fiche === null && <h2 className="ann-titre">Annuaire</h2>}
        {/* LE CHAMP. `type="search"` pour la croix d'effacement native. Son étiquette reste VISIBLE tant qu'on est
            sur les résultats ; sur une fiche elle devient l'invite du champ, faute de quoi elle ferait une ligne
            de plus au-dessus de ce qu'on est venu lire. */}
        {fiche !== null && (
          <input
            type="search" className="ann-champ ann-champ--compact" value={terme} autoComplete="off"
            aria-label="Chercher un propriétaire, un lot, un locataire"
            onChange={(e) => setTerme(e.target.value)}
            placeholder="Chercher une autre personne, un lot, une adresse…"
          />
        )}
      </div>

      {fiche === null && (
      <div className="ann-chercher">
        <label className="ann-label" htmlFor="ann-q">Chercher un propriétaire, un lot, un locataire</label>
        <input
          id="ann-q" ref={champ} type="search" className="ann-champ" value={terme} autoComplete="off"
          onChange={(e) => setTerme(e.target.value)}
          placeholder="nom, adresse, commune, téléphone, e-mail, n° de lot"
        />
        <p className="ann-aide">
          Tout est accepté&nbsp;: accents ou non, majuscules ou non, téléphone avec espaces, points ou +33.
        </p>
      </div>
      )}

      {/* 🔴 TAPER DANS LE CHAMP D'UNE FICHE RAMÈNE AUX RÉSULTATS. Sans cela, on taperait sans rien voir venir :
          les résultats sont rendus à la place de la fiche, et la fiche est encore ouverte. */}
      {fiche !== null && terme.trim() !== '' && (
        <p className="ann-bascule">
          <button type="button" className="ann-lien ann-lien--fort" onClick={() => onFiche(null)}>
            Voir les résultats pour « {terme.trim()} » →
          </button>
        </p>
      )}

      {/* LA FICHE OUVERTE PREND LA PLACE DE LA LISTE — pas de colonne à côté : à 390 px il n'y en a pas deux. Le
          bouton de retour ramène à la liste, qui n'a pas bougé (le texte tapé est resté). */}
      {fiche !== null ? (
        <section className="ann-fiche" aria-live="polite">
          {/* ⚠️ PLUS DE SECOND BOUTON DE RETOUR ICI : il est en haut de page, au-dessus de tout, et il ramène aux
              résultats comme celui-ci le faisait. En garder deux ferait deux chemins pour un même geste. */}
          {detail === null || detail.etat === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
            : detail.etat === 'erreur' ? <p className="gst-erreur" role="status">{detail.message}</p>
              : detail.etat === 'proprietaire'
                ? <VueProprietaire f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique}
                  gestes={gestes} onCreer={creerEtRattacher} onHistoriqueDuBien={ouvrirVieDuBien}
                  onEvenements={ouvrirEvenements} onOuvrirFil={onOuvrirFil} />
                : detail.etat === 'lot'
                  ? <VueLot f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique} onEcrire={onEcrire}
                    maintenant={refTemps} onOuvrirFil={onOuvrirFil} gestes={gestes} onCreer={creerEtRattacher}
                    poserSurVieDuBien={vieDuBienVisee === detail.data.id}
                    jetonHistorique={jetonHistorique}
                    onPoserJeton={onPoserJeton}
                    onVieDuBienPosee={() => setVieDuBienVisee(null)}
                    filtreVie={filtreVie} onFiltreVie={setFiltreVie}
                    onDepart={(occupationId, sortie) => envoyer({ action: 'depart', occupationId, sortie })} />
                  : <VueLocataire f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique}
                    gestes={gestes} maintenant={refTemps} onOuvrirFil={onOuvrirFil}
                    onHistoriqueDuBien={ouvrirVieDuBien} onCreer={creerEtRattacher} />}
        </section>
      ) : (
        <Resultats reponse={reponse} terme={terme} ouvrir={ouvrir}
          archivees={archivees} onArchivees={setArchivees} />
      )}
    </div>
  );
}

// ══ LA LISTE ════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴🔴 LOT ANNUAIRE-PERSONNES — LES RÉSULTATS SONT DES PERSONNES ════════════════════════════════════════════════
 *
 * Constat d'Arno : « un annuaire sert à chercher une PERSONNE. Aujourd'hui les résultats sont des biens
 * immobiliers. Il faut afficher des noms ; un clic sur un propriétaire mène à sa fiche propriétaire, un clic sur un
 * locataire à sa fiche locataire. »
 *
 * ═══ CE QUI A ÉTÉ REMPLACÉ, ET POURQUOI ═══════════════════════════════════════════════════════════════════════════
 * La liste d'avant rendait un LOGEMENT par ligne : l'adresse en titre, puis « Propriétaire : … » et « Locataire
 * actuel : … » en dessous. Elle répondait à « qui est qui par rapport à un logement » — une vraie question, mais
 * pas celle qu'on pose à un annuaire. Chercher « jullien » rendait cinq lignes (ses cinq biens) là où il fallait
 * UNE personne.
 *
 * 🔴 CE QUE LA RÈGLE D'AVANT PROTÉGEAIT N'EST PAS PERDU : le bien reste écrit sur la ligne de la personne, en
 * texte court, et la raison dit en clair POURQUOI elle répond (« propriétaire du lot 219 »). On n'a pas retiré
 * l'information : on a changé ce qui porte la ligne.
 *
 * ⚠️ LA LIGNE ENTIÈRE EST LE BOUTON, et les deux liens qui en sortent (la seconde fiche, rien d'autre) vivent
 * DANS le pied, à côté — un bouton dans un bouton est du HTML invalide et injouable au clavier.
 */
function Resultats({ reponse, terme, ouvrir, archivees, onArchivees }: {
  reponse: Reponse; terme: string; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  archivees: boolean; onArchivees: (v: boolean) => void;
}) {
  if (reponse.etat === 'repos') {
    return (
      <p className="gst-vide">
        Tapez un nom, une adresse, une commune, un téléphone, un e-mail ou un numéro de lot.
        {' '}L’annuaire répond par PERSONNE&nbsp;: son nom, ses coordonnées, et le ou les biens qui la relient
        {' '}à nous.
      </p>
    );
  }
  if (reponse.etat === 'charge') return <p className="gst-info" role="status">Recherche…</p>;
  if (reponse.etat === 'erreur') return <p className="gst-erreur" role="status">{reponse.message}</p>;
  if (reponse.etat === 'sans_schema') {
    return (
      <p className="gst-vide">
        <strong>L’annuaire n’est pas encore installé.</strong> Une mise à jour de la base est nécessaire
        (migration 253), puis un premier import des exports WIPPIMMO. Rien d’autre n’est affecté&nbsp;: le reste du
        module fonctionne normalement.
      </p>
    );
  }

  /**
   * 🔴 LA CASE « AFFICHER LES ARCHIVÉES » EST TOUJOURS LÀ, même quand la liste est vide : c'est souvent ce qu'on
   * vient cocher quand on ne trouve pas quelqu'un. La cacher sur un résultat vide obligerait à retaper la
   * recherche pour la voir apparaître.
   */
  const caseArchivees = (
    <label className="ann-archivees">
      <input type="checkbox" checked={archivees} onChange={(e) => onArchivees(e.target.checked)} />
      Afficher les archivées
    </label>
  );

  if (reponse.personnes.length === 0) {
    return (
      <>
        <p className="gst-vide" role="status">{messageRechercheVide(analyserTerme(terme))}</p>
        {caseArchivees}
      </>
    );
  }

  return (
    <>
      {/* 🔴 UNE LISTE COUPÉE LE DIT. Mesuré le 26/09/2026 sur la vraie base : « puvis » correspondait à 76
          logements, l'écran en montrait 60 et annonçait « 60 résultats » — 16 disparaissaient sans un mot. La
          règle vaut pour les personnes exactement comme elle valait pour les biens. */}
      <p className="ann-compte" role="status">
        {reponse.tronque
          ? <>
            <strong>{reponse.personnes.length} premières personnes</strong>
            {' — d’autres correspondent. Précisez votre recherche (un nom complet, une adresse plus précise) '}
            {'pour toutes les voir.'}
          </>
          : <>{reponse.personnes.length} personne{reponse.personnes.length > 1 ? 's' : ''}</>}
        {reponse.importe && <> · annuaire importé le {formaterDateIso(reponse.importe.le)}</>}
      </p>
      {caseArchivees}
      <ul className="ann-personnes">
        {reponse.personnes.map((p, i) => (
          <LignePersonne key={`${p.sujet}-${p.id}`} p={p} ouvrir={ouvrir}
            /* 🔴 LE FILET NE SE POSE QU'ENTRE DEUX VOISINES DU MÊME GROUPE : il dit « ces deux-là vont
               ensemble », et poser un trait sous la dernière d'un groupe dirait le contraire. */
            memeGroupe={p.groupe !== null && reponse.personnes[i + 1]?.groupe === p.groupe} />
        ))}
      </ul>
    </>
  );
}

/** Le mot d'un rôle, écrit une seule fois : deux formulations finiraient par se contredire d'un écran à l'autre. */
const MOT_ROLE: Record<RolePersonne, string> = {
  proprietaire: 'Propriétaire',
  locataire: 'Locataire',
  ancien_locataire: 'Ancien locataire',
};

/**
 * ══ 🔴 UNE PERSONNE, EN UNE LIGNE ════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « civilité + nom + prénom en gras, capsule de rôle (Propriétaire / Locataire / Ancien locataire), puis en
 * gris sur une ligne : le premier mobile, le premier e-mail, et le ou les biens liés en texte court
 * (“25 rue Edith Cavell, Courbevoie — lot 219”, “+2 biens” s'il y en a plus). »
 *
 * 🔴 UN CLIC MÈNE À SA FICHE — celle de son rôle principal. Une personne qui est à la fois propriétaire et
 * locataire ouvre sa fiche PROPRIÉTAIRE, et un lien secondaire mène à l'autre : sans lui, une moitié d'elle
 * serait inatteignable depuis l'annuaire.
 */
function LignePersonne({ p, ouvrir, memeGroupe }: {
  p: PersonneTrouvee; ouvrir: (s: FicheUrl['sorte'], id: number) => void; memeGroupe: boolean;
}) {
  const nom = `${p.civilite !== null && p.civilite !== '' ? `${p.civilite} ` : ''}${p.nomAffiche}`;
  const premier = p.biens[0];
  return (
    <li className={`ann-pers${memeGroupe ? ' ann-pers--groupe' : ''}${p.archive ? ' ann-pers--archive' : ''}`}>
      <button type="button" className="ann-pers-corps" onClick={() => ouvrir(p.sujet, p.id)}>
        <span className="ann-pers-tete">
          <span className="ann-pers-nom">{nom}</span>
          {p.roles.map((r) => (
            <span key={r} className={`ann-pers-role ann-pers-role--${r}`}>{MOT_ROLE[r]}</span>
          ))}
          {p.archive && <span className="ann-etiq ann-etiq--absent">archivée</span>}
        </span>
        <span className="ann-pers-gris">
          {/* ⚠️ « — » PLUTÔT QU'UN VIDE : une coordonnée absente est un fait, et un blanc se lirait comme un
              défaut d'affichage. */}
          <span className="ann-pers-coord">{p.mobile ?? '—'}</span>
          <span className="ann-pers-sep" aria-hidden="true">·</span>
          <span className="ann-pers-coord">{p.email ?? '—'}</span>
          {premier !== undefined && (
            <>
              <span className="ann-pers-sep" aria-hidden="true">·</span>
              <span className="ann-pers-bien">
                {titreLogement(premier.adresse, premier.commune)} — lot {premier.numero}
                {p.biens.length > 1 && <span className="ann-pers-plus">+{p.biens.length - 1} bien
                  {p.biens.length > 2 ? 's' : ''}</span>}
              </span>
            </>
          )}
          {/* 🔴 LA RAISON, EN CLAIR : « propriétaire du lot 219 ». Sans elle, chercher une adresse rendrait trois
              noms sans qu'on sache lequel est le propriétaire et lequel est parti. */}
          {p.raison !== null && (
            <>
              <span className="ann-pers-sep" aria-hidden="true">·</span>
              <span className="ann-pers-raison">{p.raison}</span>
            </>
          )}
        </span>
      </button>
      {p.autreFicheId !== null && (
        <span className="ann-pers-pied">
          <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', p.autreFicheId as number)}>
            Voir aussi sa fiche locataire →
          </button>
        </span>
      )}
    </li>
  );
}

/* ══ 🔴 RETIRÉ LE 29/09/2026 — LOT FICHES-ANNUAIRE, ÉTAPE C ════════════════════════════════════════════════════
   Ici vivait `Contacts`, la liste plate des coordonnées d'une personne (« Aucune coordonnée dans WIPPIMMO. »).
   Son seul appelant était l'ancienne fiche locataire ; celle-ci porte désormais des CARTES (`BlocCartes`), où
   chaque coordonnée est une ligne alignée avec son libellé et son bouton Copier.
   Il n'est pas conservé en dormance : un composant que rien n'appelle finit par diverger de celui qui sert, et
   l'on corrige alors le mauvais. La règle qu'il portait, elle, est tenue — et éprouvée — dans `CartesPersonnes` :
   une absence de coordonnée se DIT, jamais un blanc. */

// ══ LES TROIS FICHES ════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 COPIER UNE COORDONNÉE ══════════════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « chaque téléphone et chaque e-mail avec son libellé et un bouton Copier ». Un numéro se
 * recopie dix fois par jour dans un autre outil — le lire à voix haute à soi-même est exactement le moment où
 * l'on inverse deux chiffres.
 *
 * ⚠️ LE PRESSE-PAPIERS PEUT REFUSER (navigateur ancien, page non sécurisée). On le DIT sur le bouton plutôt que
 * de laisser croire que c'est copié — un « ✓ » menteur ferait coller autre chose.
 */
function BoutonCopier({ valeur, quoi }: { valeur: string; quoi: string }) {
  const [etat, setEtat] = useState<'repos' | 'fait' | 'refus'>('repos');
  useEffect(() => {
    if (etat === 'repos') return;
    const t = setTimeout(() => setEtat('repos'), 1800);
    return () => clearTimeout(t);
  }, [etat]);
  return (
    <button type="button" className="ann-copier" title={`Copier ${quoi}`} aria-label={`Copier ${quoi}`}
      onClick={() => {
        void (async () => {
          try { await navigator.clipboard.writeText(valeur); setEtat('fait'); }
          catch { setEtat('refus'); }
        })();
      }}>
      {etat === 'fait' ? '✓ copié' : etat === 'refus' ? 'copie refusée' : 'Copier'}
    </button>
  );
}

/* ══ 🔴🔴 REMPLACÉ LE 29/09/2026 — LOT FICHES-ANNUAIRE, ÉTAPE C ════════════════════════════════════════════════
   Ici vivait `BlocCoordonnees`, le premier bloc de la fiche propriétaire écrit à l'étape A. Il est remplacé par
   `BlocCartes` (fichier `CartesPersonnes`) pour DEUX raisons, toutes deux dites par Arno :

   ① IL N'AFFICHAIT QU'UNE PERSONNE, alors que le bloc doit porter « le ou les propriétaires du même ensemble de
      biens », côte à côte, chacun avec son crayon « Modifier » et son menu « ⋯ ».

   ② SON `<dl>` NE POUVAIT PAS ALIGNER UN LIBELLÉ SUR SA VALEUR — « des écarts de niveaux partout ». Les `<dt>` et
      les `<dd>` vivent dans deux flux séparés : une valeur portant deux capsules et un bouton était plus haute
      que son libellé, qui remontait. Chaque ligne d'une carte est maintenant une grille de deux colonnes centrées
      verticalement, ce qui rend l'alignement mécanique plutôt qu'espéré.

   ⚠️ LA DEMANDE D'ORIGINE N'A PAS CHANGÉ, et les cartes la tiennent entièrement : « civilité, nom, qualité,
   adresse postale, chaque téléphone et chaque e-mail avec son libellé et un bouton Copier, une note libre ».
   Ce qu'on a mesuré alors reste vrai : civilité 302/307, adresse postale 304/307, 354 e-mails et 287 téléphones
   tous porteurs de leur libellé d'origine. « Qualité » et « note » n'existaient dans AUCUNE colonne — c'est la
   migration 278 qui les apporte, et sans elle l'écran écrit encore « non renseignée ».

   Le code n'est pas gardé en dormance : un bloc que rien n'appelle diverge de celui qui sert, et l'on finit par
   corriger le mauvais. Ce qu'il garantissait est éprouvé sur les cartes, dans `annuaireEdition.test.ts`. */

/** Ce qu'une carte de bien affiche d'une date : la date seule, ou le mot qui dit qu'on ne l'a pas. */
function DateOuRien({ iso, sinon }: { iso: string | null; sinon: string }) {
  return iso === null ? <span className="ann-inconnu">{sinon}</span> : <>{formaterDateIso(iso)}</>;
}

const DRIVE_DOSSIER = 'https://drive.google.com/drive/folders/';

/**
 * ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — LE CARTOUCHE « ÉVÉNEMENT EN COURS » ═════════════════════════════════════════
 *
 * Arno : « Sur une carte de bien concerné par au moins un événement ouvert : juste AU-DESSUS de la ligne SURFACE,
 * un cartouche orange (coins arrondis, toute la largeur de la carte) avec le texte “Événement en cours”, plus le
 * nombre s'il y en a plusieurs. Un clic ouvre le ou les événements. Même cartouche en tête de la fiche bien. »
 *
 * 🔴 UN SEUL COMPOSANT POUR LES DEUX ENDROITS. La carte et l'en-tête de la fiche doivent dire la même chose, de
 * la même façon : deux cartouches jumeaux divergeraient au premier ajustement, et l'on croirait à deux états.
 *
 * 🔴 « UN CLIC OUVRE LE OU LES ÉVÉNEMENTS » — et ce sont CEUX DE CE BIEN. Il ouvre donc la fiche du bien posée sur
 * sa « vie du bien », filtrée sur « Avec événement ouvert » : la liste qui en résulte est exactement celle des
 * échanges de ce logement qui portent un événement, chacun avec le sien. Envoyer vers l'écran « Événements », qui
 * les montre TOUS, obligerait à rechercher à la main celui qu'on venait de voir.
 *
 * ⚠️ AUCUNE COULEUR NOUVELLE : `--color-svv-amber-soft` en fond et `--color-svv-amber` en texte, la paire d'alerte
 * déjà employée par les replis du module. Contraste vérifié en Clair et en Sombre.
 *
 * ⚠️ LE NOMBRE N'EST ÉCRIT QU'AU-DELÀ DE UN. « Événement en cours 1 » se lit comme un compteur qu'on devrait
 * surveiller ; « Événement en cours » se lit comme un fait.
 */
function CartoucheEvenement({ nb, onOuvrir }: { nb: number; onOuvrir: () => void }) {
  if (nb <= 0) return null;
  const mot = nb > 1 ? `${nb} événements en cours` : 'Événement en cours';
  return (
    <button type="button" className="ann-cartouche" onClick={onOuvrir}
      title="Voir les échanges de ce bien qui portent un événement ouvert">
      <span aria-hidden="true" className="ann-cartouche-point">●</span>
      {mot}
    </button>
  );
}

/**
 * ══ 🔴🔴 UNE CARTE DE BIEN ════════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « les BIENS en gestion […] sous forme de CARTES cliquables : adresse, lot, type, surface ou “non
 * renseignée”, locataire en place ou “Vacant”, nombre de mails, dernier échange, événements ouverts, lien vers le
 * dossier Drive du lot ».
 *
 * 🔴 LA CARTE ENTIÈRE EST LE BOUTON, et les deux liens qui en sortent (le locataire, le Drive) s'arrêtent au clic
 * (`stopPropagation`). Un bouton dans un bouton serait du HTML invalide : le lien du Drive est donc un vrai
 * `<a>`, posé À CÔTÉ du bouton dans le flux, et la carte est une grille — pas une imbrication.
 *
 * ⚠️ « SURFACE : NON RENSEIGNÉE » EST UN FAIT, PAS UN TROU. Mesuré le 29/09/2026 : aucune colonne de surface
 * n'existe dans le schéma. On ne la déduit pas du type (« Type 2 » ne dit pas des mètres carrés).
 */
function CarteBien({ b, ouvrir, onHistoriqueDuBien, onEvenements }: {
  b: BienDuProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  /** Ouvre la « vie du bien » de ce lot, filtrée sur les échanges qui portent un événement ouvert. */
  onEvenements: (lotId: number) => void;
  /**
   * 🔴 LOT FICHES-RETOUCHES — « Historique » ouvre la fiche DE CE BIEN, posée sur sa « vie du bien ».
   *
   * Pourquoi la fiche du bien, et non un écran de plus : la « vie du bien » existe déjà, avec ses filtres, ses
   * capsules et ses pièces jointes. En écrire une seconde version dans la carte, c'est deux endroits à corriger
   * le jour où l'on change une ligne — et deux réponses possibles à la même question.
   */
  onHistoriqueDuBien: (lotId: number) => void;
}) {
  return (
    <li className={`ann-carte${b.fin !== null ? ' ann-carte--ancien' : ''}`}>
      {/* ══ 🔴🔴 RÉÉCRIT LE 30/09/2026 — LOT FICHES-RETOUCHES-2 ═══════════════════════════════════════════════
          L'INVARIANT D'AVANT DISAIT : « LA CARTE ENTIÈRE EST LE BOUTON » — l'en-tête ET les faits vivaient dans un
          seul `<button>`. Le cartouche « Événement en cours » doit se poser JUSTE AU-DESSUS de la ligne SURFACE,
          et il est CLIQUABLE : un bouton dans un bouton est du HTML invalide et injouable au clavier.

          🔴 CE QUI EST DEVENU LE BOUTON : L'EN-TÊTE TEINTÉ (l'adresse et ses capsules). C'est ce qu'on vise pour
          ouvrir un bien, et cela ne laisse qu'UN arrêt de tabulation pour ce geste au lieu de deux. Les faits, en
          dessous, sont là pour être LUS — et ce qui s'y ouvre a désormais son propre bouton, en pied de carte
          (« Historique », « Fiche du locataire », « Dossier Drive du lot »).

          CE QUE LA RÈGLE PROTÉGEAIT N'A PAS BOUGÉ : rien d'interactif n'est imbriqué dans autre chose
          d'interactif, et un garde le vérifie sur la source. */}
      <button type="button" className="ann-carte-corps" onClick={() => ouvrir('lot', b.id)}>
        <span className="ann-carte-tete">
          <span className="ann-carte-titre">{titreLogement(b.adresse, b.commune)}</span>
          <span className="ann-carte-sous">
            <span className="ann-etiq">lot {b.numero}</span>
            {b.nature && <span className="ann-etiq">{b.nature}</span>}
            {b.typeBien && <span className="ann-etiq">{b.typeBien}</span>}
          </span>
        </span>
      </button>
      {/* 🔴 JUSTE AU-DESSUS DE LA LIGNE SURFACE, sur toute la largeur — la place demandée par Arno. */}
      <CartoucheEvenement nb={b.evenementsOuverts} onOuvrir={() => onEvenements(b.id)} />
      <div className="ann-carte-faits">
          <span className="ann-fait">
            <span className="ann-fait-mot">Surface</span>
            {b.surfaceM2 === null
              ? <span className="ann-inconnu">non renseignée</span>
              : <span>{b.surfaceM2} m²</span>}
          </span>
          {/* 🔴 LE LOCATAIRE EN PLACE EST MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */}
          <span className={`ann-fait${b.locataire !== null ? ' ann-fait--locataire' : ''}`}>
            <span className="ann-fait-mot">Locataire</span>
            {b.locataire === null
              ? <span className="ann-vacant">Vacant</span>
              : <span className="ann-fait-valeur">{b.locataire}</span>}
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Mails</span>
            <span>{b.mails}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Dernier échange</span>
            <DateOuRien iso={b.dernierEchange} sinon="aucun" />
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Événements ouverts</span>
            <span>{b.evenementsOuverts === 0 ? 'aucun' : b.evenementsOuverts}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">{b.fin === null ? 'En gestion depuis' : 'Sorti de gestion le'}</span>
            <DateOuRien iso={b.fin ?? b.debut} sinon="non renseigné" />
          </span>
      </div>
      {/* ══ 🔴🔴 LOT FICHES-RETOUCHES — LE PIED DE CARTE EN BOUTONS ═══════════════════════════════════════════
          Arno : « “Fiche du locataire →” et “Dossier Drive du lot ↗” sont aujourd'hui deux liens soulignés mal
          alignés. Ils deviennent deux BOUTONS côte à côte sur la même ligne, de même hauteur et de même largeur,
          avec la même présentation que le bouton “Dossier Drive ↗” de l'en-tête. […] “Historique” […] DANS chaque
          carte de bien, sur toute la largeur de la carte, AU-DESSUS des deux boutons. »

          🔴 MÊME CLASSE QUE L'EN-TÊTE (`svv-btn svv-btn-outline gst-btn`), et non une imitation : deux boutons
          qui se ressemblent à un pixel près se mettent à diverger au premier ajustement de la charte. Ici, c'est
          littéralement le même bouton.

          🔴 UNE GRILLE À DEUX COLONNES ÉGALES pour la rangée du bas — `1fr 1fr`, et non un `flex` qui donnerait
          à chaque bouton la largeur de son texte. « Même hauteur et même largeur » est la demande, et c'est la
          grille qui la tient, y compris quand un des deux manque.

          ⚠️ LE PIED SORT DU BOUTON DE LA CARTE, et c'est structurel : un bouton dans un bouton est du HTML
          invalide et injouable au clavier. */}
      <span className="ann-carte-pied">
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large"
          onClick={() => onHistoriqueDuBien(b.id)}>
          Historique
        </button>
        <span className="ann-carte-duo">
          {b.locataireId !== null && b.locataire !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              onClick={() => ouvrir('locataire', b.locataireId as number)}>
              Fiche du locataire →
            </button>
          )}
          {b.driveDossierId !== null ? (
            <a className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              href={`${DRIVE_DOSSIER}${b.driveDossierId}`} target="_blank" rel="noreferrer">
              Dossier Drive du lot ↗
            </a>
          ) : (
            /* ⚠️ L'ABSENCE SE DIT, à la place du bouton : un dossier pas encore construit n'est pas une panne,
               et un bouton grisé sans motif enverrait chercher pourquoi il ne marche pas. */
            <span className="ann-inconnu ann-carte-sans">dossier Drive non construit</span>
          )}
        </span>
      </span>
    </li>
  );
}

function VueProprietaire({
  f, ouvrir, onHistorique, gestes, onCreer, onHistoriqueDuBien, onEvenements, onOuvrirFil,
}: {
  f: FicheProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistorique?: (cible: Cible) => void;
  /**
   * 🔴 LOT CONTACTS-EXTERNES — ouvrir l'échange depuis une ligne de « Échanges par un contact extérieur ». La
   * fiche locataire le recevait déjà ; la fiche propriétaire ne l'avait pas, et la ligne y serait restée du texte.
   */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /** Ouvre la fiche d'un bien, posée sur sa « vie du bien ». Voir `CarteBien`. */
  onHistoriqueDuBien: (lotId: number) => void;
  /** Même chemin, filtré sur les échanges qui portent un événement ouvert. */
  onEvenements: (lotId: number) => void;
  gestes: GestesCartes;
  /** Crée une personne et la rattache aux biens donnés. Rend le motif du refus, ou `null`. */
  onCreer: (sujet: Sujet, lots: readonly number[], champs: ChampsSaisis) => Promise<string | null>;
}) {
  const [anciensOuverts, setAnciensOuverts] = useState(false);
  const enGestion = f.biens.filter((b) => b.fin === null);
  const anciens = f.biens.filter((b) => b.fin !== null);
  return (
    <>
      {/* ══ 🔴 L'EN-TÊTE DE FICHE — un bandeau sobre : le nom en grand, le rôle en capsule, les actions à droite.
          Demande d'Arno : « en-tête de fiche distinct ». Il remplace un titre et une ligne grise qui se
          confondaient avec le reste de la page. */}
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.civilite ? `${f.civilite} ` : ''}{f.nom}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Propriétaire</span>
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
            {/* ══ 🔴🔴 LOT FICHES-RETOUCHES — L'HISTORIQUE COMPLET DU PROPRIÉTAIRE, ET QUAND IL SERT ═══════════
                Arno : « l'historique complet du propriétaire reste accessible depuis l'en-tête de la fiche, en
                lien discret, SI CE N'EST PAS REDONDANT ».

                ═══ CE QUI A ÉTÉ MESURÉ, LE 29/09/2026, AVANT DE TRANCHER ═════════════════════════════════════
                Sur 32 938 rattachements confirmés, **tous** visent un LOT : AUCUN ne vise un propriétaire (c'est
                la règle centrale du module, « la cible est toujours un bien »). L'historique d'un propriétaire
                est donc, exactement, l'UNION des historiques de ses biens — pas un mail de plus.

                🔴 D'OÙ LA RÈGLE RETENUE : le lien n'apparaît QUE si le propriétaire a PLUSIEURS biens. À un seul
                bien, il rendrait mot pour mot la même liste que le bouton « Historique » de l'unique carte — deux
                chemins vers la même page, dont on finit par se demander lequel montre autre chose. À plusieurs
                biens, il répond à une question que les cartes ne savent pas poser : « tout ce qui s'est dit avec
                cette personne, tous biens confondus ». */}
            {f.biens.length > 1 && onHistorique !== undefined && (
              <button type="button" className="ann-lien ann-tete-histo"
                onClick={() => onHistorique({ sorte: 'proprietaire', cle: f.cle, id: null })}>
                Historique, tous biens confondus →
              </button>
            )}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      {/* ══ 🔴🔴 LE BLOC « COORDONNÉES » : DES CARTES, CÔTE À CÔTE, MODIFIABLES ════════════════════════════════
          Demande d'Arno (complément à l'étape C) : « chaque propriétaire est une CARTE, et les cartes se suivent de
          gauche à droite […] à la fin de la rangée, une carte “+ Ajouter un propriétaire” ».

          🔴 L'ANCIEN `BlocCoordonnees` RESTE DANS CE FICHIER, mais il n'est plus appelé ici : il servait UN seul
          propriétaire, dans un `<dl>` dont les libellés ne pouvaient pas s'aligner sur leurs valeurs — le défaut
          qu'Arno a signalé (« des écarts de niveaux partout »). La raison de son remplacement est écrite sur lui.

          ⚠️ « + AJOUTER UN PROPRIÉTAIRE » VEUT DIRE CO-PROPRIÉTAIRE DU MÊME ENSEMBLE DE BIENS : la personne créée
          est rattachée à tous les biens EN GESTION de cette fiche, ce qui est exactement ce que le bloc annonce. */}
      <BlocCartes titre="Coordonnées" id="ann-coord" personnes={f.personnes} role="Propriétaire"
        motAjouter="Ajouter un propriétaire" gestes={gestes}
        creation={{
          rappel: enGestion.length === 0
            ? 'Cette fiche n’a aucun bien en gestion : la personne sera créée dans l’annuaire, sans rattachement.'
            : `Sera ajouté comme co-propriétaire sur ${enGestion.length === 1 ? 'le bien'
              : `les ${enGestion.length} biens`} de cette fiche.`,
          onCreer: (champs) => onCreer('proprietaire', enGestion.map((b) => b.id), champs),
        }} />

      <p className="ann-depuis">
        {f.relationDepuis
          ? <>Début de collaboration : <strong>le {formaterDateIso(f.relationDepuis)}</strong>{' '}
            <span className="ann-gris">— début de gestion du plus ancien lot</span></>
          : <>Début de collaboration : <span className="ann-inconnu">non renseigné</span>{' '}
            <span className="ann-gris">— aucun lot en gestion ne porte de date de début</span></>}
      </p>

      <section className="ann-bloc" aria-labelledby="ann-biens">
        <h4 className="ann-bloc-titre" id="ann-biens">
          Biens en gestion <span className="gst-compte">{enGestion.length}</span>
        </h4>
        {enGestion.length === 0 ? <p className="ann-gris">Aucun bien en gestion.</p> : (
          <ul className="ann-cartes">
            {enGestion.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir}
              onHistoriqueDuBien={onHistoriqueDuBien} onEvenements={onEvenements} />)}
          </ul>
        )}
      </section>

      {/* ⚠️ « ANCIENS BIENS » EST REPLIÉ, jamais retiré : un bien sorti de gestion garde ses mails et son
          historique, et c'est souvent pour EUX qu'on ouvre la fiche. Replié, il ne noie pas les biens vivants. */}
      {anciens.length > 0 && (
        <section className="ann-bloc">
          <button type="button" className="ann-repli" aria-expanded={anciensOuverts}
            onClick={() => setAnciensOuverts((v) => !v)}>
            <span aria-hidden="true" className={`ann-repli-triangle${anciensOuverts ? ' ann-repli-triangle--ouvert' : ''}`}>▸</span>
            Anciens biens <span className="gst-compte">{anciens.length}</span>
          </button>
          {anciensOuverts && (
            <ul className="ann-cartes">
              {anciens.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir}
                onHistoriqueDuBien={onHistoriqueDuBien} onEvenements={onEvenements} />)}
            </ul>
          )}
        </section>
      )}

      {/* 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — les documents du logiciel de gestion, rangés chez LA PERSONNE.
          Sans la migration 291, le composant ne rend RIEN : la fiche est exactement celle d'avant. */}
      <DocumentsAutomatiques sorte="proprietaire" id={f.id} />

      {/* ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES ÉCHANGES PASSÉS PAR UN INTERMÉDIAIRE ═══════════════════════════
          Une liste DISTINCTE de celle du dessus, et la section le dit en toutes lettres : les documents
          automatiques partent de chez nous et ne concernent aucun bien ; ces échanges-ci sont reçus, rattachés à
          un bien, et concernent AUSSI cette personne. Sans la migration 293, le composant ne rend RIEN. */}
      <InterventionsDeLaFiche sorte="proprietaire" id={f.id} onOuvrirFil={onOuvrirFil} />
    </>
  );
}

/**
 * ══ 🔴🔴 ENREGISTRER UN DÉPART ════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « enregistrer un départ (date de sortie → historique) ». C'est le geste le plus lourd de conséquences de
 * la fiche d'un bien : il fait passer un locataire EN PLACE dans l'HISTORIQUE, et le logement devient vacant.
 *
 * 🔴 IL DEMANDE UNE DATE, ET CONFIRMATION. Sans date, le serveur prendrait aujourd'hui — ce qui est souvent faux :
 * on enregistre un départ une semaine après. La date est donc posée d'abord, visible, et modifiable.
 *
 * ⚠️ RIEN N'EST SUPPRIMÉ : l'occupation est DATÉE. Le locataire garde sa fiche, ses coordonnées et ses mails, et
 * l'historique du bien le montre avec ses deux dates. C'est ce que dit la phrase du panneau.
 */
function BoutonDepart({ nom, occupationId, modifiable, onDepart }: {
  nom: string; occupationId: number; modifiable: boolean;
  onDepart: (occupationId: number, sortie: string | null) => Promise<string | null>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!ouvert) {
    return (
      <>
        <button type="button" className="cp-copier" disabled={!modifiable}
          title={modifiable ? undefined : MOTIF_SANS_MIGRATION} onClick={() => setOuvert(true)}>
          Enregistrer un départ…
        </button>
        {refus !== null && <span className="cp-rien">{refus}</span>}
      </>
    );
  }
  return (
    <span className="ann-depart">
      <span className="cp-rien">{nom} quitte le logement le :</span>
      <input className="cp-saisie" type="date" value={date} aria-label="Date de sortie"
        onChange={(e) => setDate(e.target.value)} />
      <button type="button" className="cp-copier" onClick={() => { setOuvert(false); setRefus(null); }}>
        Annuler
      </button>
      <button type="button" className="cp-copier" disabled={envoi} onClick={() => {
        setEnvoi(true);
        void (async () => {
          const motif = await onDepart(occupationId, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);
          setEnvoi(false);
          if (motif === null) setOuvert(false); else setRefus(motif);
        })();
      }}>{envoi ? 'Enregistrement…' : 'Enregistrer le départ'}</button>
      {refus !== null && <span className="cp-refus">{refus}</span>}
    </span>
  );
}

/**
 * ══ 🔴 UN OCCUPANT, AVEC SES COORDONNÉES COMPLÈTES ════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : les occupants « avec coordonnées complètes, date d'entrée et liens vers leur fiche » — et,
 * pour l'historique, « les occupants, la date d'entrée, la date de sortie et les coordonnées ». Le même bloc
 * sert aux deux : ce qu'on veut savoir d'un ancien locataire est ce qu'on veut savoir d'un actuel.
 */
function BlocOccupant({ o, ouvrir, onEcrire }: {
  o: OccupationDuLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
}) {
  const adresse = titreLogement(o.adresse, [o.codePostal, o.commune].filter((x) => x).join(' '));
  return (
    <article className={`ann-personne${o.encours ? '' : ' ann-personne--passe'}`}>
      <div className="ann-personne-tete">
        <p className="ann-personne-nom">
          <button type="button" className="ann-lien ann-lien--fort"
            onClick={() => ouvrir('locataire', o.locataireId)}>{o.nom}</button>
        </p>
        <span className="ann-personne-actions">
          <span className="ann-role-capsule">{o.encours ? 'En place' : 'Parti'}</span>
        </span>
      </div>
      {/* ══ 🔴🔴 LOT CONTACT-LIGNES — LA MÊME GRILLE QUE LES CARTES ════════════════════════════════════════════
          Ce bloc rendait ses coordonnées dans un `<dl>`, avec une capsule de type collée à chaque valeur et des
          « Copier » posés là où la ligne les laissait. Deux défauts d'un coup, tous deux signalés par Arno : la
          capsule doublait le titre, et les boutons n'étaient pas alignés.

          🔴 IL RÉUTILISE MAINTENANT LA GRILLE DES CARTES (`cp-lignes`, `Ligne`), au lieu d'en tenir une seconde.
          Ce sont les mêmes coordonnées, dans le même écran : deux mises en page pour un même objet, c'est deux
          endroits à corriger, et une divergence garantie au premier ajustement. */}
      <div className="cp-lignes">
        <LigneFiche libelle={o.encours ? 'Entré le' : 'Occupation'}>
          {o.entree === null && o.sortie === null
            ? <span className="ann-inconnu">dates non renseignées</span>
            : periodeOccupation(o.entree, o.sortie)}
        </LigneFiche>
        <LigneFiche libelle="Adresse">
          {adresse !== '' ? adresse : <span className="ann-inconnu">non renseignée</span>}
        </LigneFiche>
        {o.contacts.length === 0 && (
          <LigneFiche libelle="Coordonnées">
            <span className="ann-inconnu">non renseignées</span>
          </LigneFiche>
        )}
        {lignesParType(o.contacts).map(({ contact: c, titre }) => {
        /* 🔴 LOT ANNOTATIONS-TEL — le lien part de l'AFFICHAGE décortiqué, jamais de `valeur` : 16 lignes sur
           804 y portent un repli de l'import, dont deux numéros collés en un de vingt chiffres. */
        const appeler = c.sorte === 'telephone' ? lienAppel(c.affichage) : null;
        return (
          <LigneFiche key={c.id} libelle={titre} tronque={!c.absent && c.note === null}
            infobulle={c.sorte === 'email' ? c.valeur : c.affichage}
            apres={(
              <BoutonCopier valeur={c.sorte === 'telephone' ? c.affichage : c.valeur}
                quoi={c.sorte === 'telephone' ? 'ce numéro' : 'cette adresse'} />
            )}>
            {c.sorte === 'telephone'
              ? (appeler === null
                ? <span>{c.affichage}</span>
                : <a className="ann-lien" href={appeler}>{c.affichage}</a>)
              : onEcrire
                ? <button type="button" className="ann-lien"
                  onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
                : <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
            {/* 🔴 LOT ANNOTATIONS-TEL — la note grise, sous le numéro, comme sur les cartes. */}
            {c.note !== null && <span className="cp-note-tel">{c.note}</span>}
          </LigneFiche>
        );
        })}
      </div>
    </article>
  );
}

/**
 * ══ 🔴🔴 LA FICHE D'UN BIEN — ÉTAPE B ═════════════════════════════════════════════════════════════════════════
 *
 * Arno : « En-tête : adresse, lot, type, surface, propriétaire(s) (liens vers leur fiche), dossier Drive.
 * LOCATAIRE(S) EN PLACE […] HISTORIQUE DES LOCATAIRES […] VIE DU BIEN ».
 *
 * ═══ « LES OCCUPANTS DU MÊME BAIL », ET CE QUE LA BASE EN SAIT ════════════════════════════════════════════════
 * Un bail n'existe pas comme objet : il n'y a que des OCCUPATIONS (une personne, un lot, deux dates). Deux
 * personnes d'un même foyer feraient donc deux occupations de MÊMES DATES — mesuré le 29/09/2026 : il n'y en a
 * AUCUNE dans la base, et 116 fiches de locataires sur 510 nomment pourtant deux personnes dans leur nom
 * (« ABGRALL CAYREY Chloé et Romain »).
 *
 * 🔴 ON NE DÉCOUPE PAS CES NOMS — rien ne dit quelle coordonnée est à qui. L'écran GROUPE donc par PÉRIODE : le
 * jour où deux personnes partageront une date d'entrée, elles s'afficheront ensemble, sans qu'une ligne change.
 * 🔭 L'étape C ouvre l'ajout d'un occupant : c'est là que le groupe en portera plusieurs, pour de vrai.
 */
function VueLot({
  f, ouvrir, onHistorique, onEcrire, maintenant, onOuvrirFil, gestes, onCreer, onDepart,
  poserSurVieDuBien, onVieDuBienPosee, filtreVie, onFiltreVie, jetonHistorique, onPoserJeton,
}: {
  f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onHistorique?: (cible: Cible) => void;
  onEcrire?: (email: string) => void;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  gestes: GestesCartes;
  /** Crée une personne et la rattache aux biens donnés. Rend le motif du refus, ou `null`. */
  onCreer: (sujet: Sujet, lots: readonly number[], champs: ChampsSaisis) => Promise<string | null>;
  /** Enregistre un départ. Rend le motif du refus, ou `null`. */
  onDepart: (occupationId: number, sortie: string | null) => Promise<string | null>;
  /** Vrai quand on arrive ici par « Historique » ou par un cartouche : la fiche se pose sur la « vie du bien ». */
  poserSurVieDuBien: boolean;
  /** Prévient le parent que c'est fait — sans quoi la fiche redescendrait à chaque rendu. */
  onVieDuBienPosee: () => void;
  /**
   * 🔴 LE FILTRE DE LA « VIE DU BIEN », TENU PAR LE PARENT. Deux chemins le règlent : l'arrivée depuis une carte
   * de bien (le cartouche « Événement en cours »), et le cartouche de CETTE page. Le garder ici plutôt que dans
   * `VieDuBien` permet aux deux de dire la même chose sans se marcher dessus.
   */
  filtreVie: FiltreVie;
  onFiltreVie: (f: FiltreVie) => void;
  /** LOT HISTORIQUE-BIEN-3 — le jeton de retour lu dans l'adresse, et comment l'y écrire. */
  jetonHistorique?: string | null;
  onPoserJeton?: (jeton: string) => void;
}) {
  const actuels = f.occupations.filter((o) => o.encours);
  const passes = f.occupations.filter((o) => !o.encours);
  /** Les occupations passées, groupées par PÉRIODE : un même bail rassemble ses occupants. */
  const baux = grouperParPeriode(passes);

  /**
   * ══ 🔴 SE POSER SUR LA « VIE DU BIEN » QUAND ON ARRIVE PAR « HISTORIQUE » ════════════════════════════════════
   *
   * ⚠️ `scrollIntoView` DANS UN EFFET, ET UNE SEULE FOIS. Le faire au rendu serait un effet de bord pendant le
   * rendu (ce que le compilateur React refuse, à raison) ; le refaire à chaque rendu ramènerait la page vers le
   * bas dès qu'on déplie un message — exactement l'inverse de ce qu'on veut.
   *
   * ⚠️ `behavior: 'smooth'` EST ÉCARTÉ : la liste se remplit encore quand on arrive, et une animation lancée sur
   * une page qui grandit finit ailleurs que là où elle visait. Un saut net atterrit juste.
   */
  const ancreVie = useRef<HTMLDivElement | null>(null);
  /**
   * ⚠️ LA CLÉ DE `VieDuBien` PORTE LE FILTRE : c'est ce qui fait repartir le composant sur le filtre voulu quand
   * on clique un cartouche. Sans elle, l'état interne de `VieDuBien` garderait le filtre d'avant — et le clic
   * n'aurait l'air de rien faire.
   */
  useEffect(() => {
    if (!poserSurVieDuBien) return;
    ancreVie.current?.scrollIntoView({ block: 'start' });
    onVieDuBienPosee();
  }, [poserSurVieDuBien, onVieDuBienPosee]);

  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{titreLogement(f.adresse, f.commune)}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Bien</span>
            <span className="ann-etiq">lot {f.numero}</span>
            {f.nature && <span className="ann-etiq">{f.nature}</span>}
            {f.typeBien && <span className="ann-etiq">{f.typeBien}</span>}
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      {/* 🔴 LOT FICHES-RETOUCHES-2 — LE MÊME CARTOUCHE EN TÊTE DE LA FICHE DU BIEN, comme demandé. Un clic pose
          la page sur la « vie du bien » filtrée sur les échanges qui portent un événement ouvert. */}
      <CartoucheEvenement nb={f.evenementsOuverts}
        onOuvrir={() => { onFiltreVie('evenement'); ancreVie.current?.scrollIntoView({ block: 'start' }); }} />

      <section className="ann-bloc">
        <div className="ann-personne">
          <dl className="ann-champs">
            <dt>Adresse</dt>
            <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
            {f.immeuble && <><dt>Immeuble</dt><dd>{f.immeuble}</dd></>}
            <dt>Type</dt>
            <dd>
              {[f.nature, f.typeBien].filter((x) => x).join(' · ') || <span className="ann-inconnu">non renseigné</span>}
            </dd>
            <dt>Surface</dt>
            {/* 🔴 AUCUNE COLONNE DE SURFACE n'existe dans le schéma : on le DIT, on ne devine pas depuis le type. */}
            <dd>{f.surfaceM2 === null ? <span className="ann-inconnu">non renseignée</span> : `${f.surfaceM2} m²`}</dd>
            {/* 🔴 LE PROPRIÉTAIRE N'EST PLUS DÉTAILLÉ ICI : il a sa CARTE, juste en dessous, avec son crayon et
                toutes ses coordonnées alignées. Répéter ses numéros dans l'en-tête donnerait deux endroits à
                corriger, dont un seul modifiable — la meilleure façon d'en laisser un se périmer. */}
            {f.proprietaireId === null && (
              <>
                <dt>Propriétaire</dt>
                <dd>
                  <span className="ann-inconnu">
                    {f.proprietaireNom || 'non rattaché'} — nom porté par plusieurs fiches WIPPIMMO, non tranché
                  </span>
                </dd>
              </>
            )}
            <dt>En gestion</dt>
            <dd>
              {f.debut ? <>depuis le {formaterDateIso(f.debut)}</> : <span className="ann-inconnu">date non renseignée</span>}
              {f.fin && <> · <strong>fin de gestion le {formaterDateIso(f.fin)}</strong></>}
            </dd>
          </dl>
        </div>
      </section>

      {/* ══ 🔴 LES PROPRIÉTAIRES DU BIEN, EN CARTES — avec « Remplacer » pour une vente ═══════════════════════════ */}
      <BlocCartes titre={`Propriétaire${f.proprietaires.length > 1 ? 's' : ''}`} id="ann-prop"
        personnes={f.proprietaires} role="Propriétaire" motAjouter="Ajouter un propriétaire"
        gestes={{
          ...gestes,
          /* ⚠️ « REMPLACER » MÈNE À LA FICHE DE LA PERSONNE : c'est là que le geste a un sens, puisqu'il faut
             d'abord désigner le NOUVEAU propriétaire. Le proposer ici sans savoir par qui remplacer ouvrirait un
             formulaire qui n'aurait rien à dire. */
          onRemplacer: (sujet, id) => ouvrir(sujet === 'proprietaire' ? 'proprietaire' : 'locataire', id),
        }}
        creation={{
          rappel: `Sera ajouté comme co-propriétaire du lot ${f.numero}.`,
          onCreer: (champs) => onCreer('proprietaire', [f.id], champs),
        }} />

      {/* ══ 🔴 LES OCCUPANTS EN PLACE, EN CARTES — chacun avec ses dates et « Enregistrer un départ » ══════════════
          Arno : « LOCATAIRE(S) EN PLACE : tous les occupants du même bail […] avec coordonnées complètes, date
          d'entrée et liens vers leur fiche » ; et pour l'étape C : « enregistrer un départ (date de sortie →
          historique), enregistrer un nouveau locataire (date d'entrée) ». */}
      <BlocCartes titre={`Locataire${actuels.length > 1 ? 's' : ''} en place`} id="ann-occ"
        personnes={f.occupants} role="En place" motAjouter="Ajouter un occupant" gestes={gestes}
        creation={{
          rappel: `Sera ajouté comme occupant du lot ${f.numero}.`,
          onCreer: (champs) => onCreer('locataire', [f.id], champs),
        }}
        dessous={(p) => {
          const occ = actuels.find((o) => o.locataireId === p.id);
          if (occ === undefined) return null;
          return (
            <>
              <LigneFiche libelle="Entré le">
                {occ.entree === null ? <span className="cp-rien">non renseignée</span> : formaterDateIso(occ.entree)}
              </LigneFiche>
              <LigneFiche libelle="Sa fiche">
                <button type="button" className="cp-lien" onClick={() => ouvrir('locataire', p.id)}>
                  Ouvrir la fiche du locataire →
                </button>
              </LigneFiche>
              <LigneFiche libelle="Départ">
                <BoutonDepart nom={p.nomAffiche} occupationId={occ.occupationId} modifiable={gestes.modifiable}
                  onDepart={onDepart} />
              </LigneFiche>
            </>
          );
        }} />
      {actuels.length === 0 && <p className="ann-gris">Aucun bail en cours — le logement est vacant.</p>}

      {/* ⚠️ L'HISTORIQUE EST TOUJOURS LÀ, jamais derrière un survol : c'est la question qu'on pose juste après
          « qui habite ici ? » — « et avant ? ». Chaque occupation passée porte ses coordonnées, comme demandé. */}
      <section className="ann-bloc" aria-labelledby="ann-histo-loc">
        <h4 className="ann-bloc-titre" id="ann-histo-loc">
          Historique des locataires <span className="gst-compte">{passes.length}</span>
        </h4>
        {baux.length === 0 ? <p className="ann-gris">Aucun locataire passé connu.</p> : baux.map((bail, i) => (
          <div key={`bail-${i}`} className="ann-bail">
            {bail.length > 1 && (
              <p className="ann-bail-mot">{bail.length} occupants du même bail</p>
            )}
            {bail.map((o) => (
              <BlocOccupant key={`p-${o.locataireId}-${o.entree ?? ''}-${o.sortie ?? ''}`}
                o={o} ouvrir={ouvrir} onEcrire={onEcrire} />
            ))}
          </div>
        ))}
      </section>

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — LE MOTEUR PREND LA PLACE DE « VIE DU BIEN » ═══════════════════════════
          ACCORD EXPLICITE D'ARNO (04/10/2026) : « le bloc “Vie du bien” est SUPPRIMÉ (deux listings de mails,
          c'est un de trop). Le moteur de recherche prend SA PLACE (juste sous “Historique des locataires”). »

          🔴 IL EST MONTÉ DANS LA MÊME ENVELOPPE `ancreVie`, ET CE N'EST PAS UN DÉTAIL. C'est elle que
          `?bloc=vie` et le cartouche « Événement en cours » visent pour poser la page : un second ancrage
          aurait fait deux endroits où le défilement se décide, et l'un des deux aurait cessé de viser juste.
          C'est aussi ce qui garde au bloc le MÊME RANG dans la fiche qu'avant ce lot — la preuve d'empreintes
          du haut de fiche compare rang par rang.

          🔴 LES OCCUPATIONS VIENNENT DE LA FICHE, ET IL FALLAIT. La route `/historique` ne renseigne
          `occupations` que pour une cible `locataire-…` (`etendreCible`) ; pour un `lot-…` elle rend un tableau
          VIDE. La fiche les a déjà TOUTES, passées comprises — c'est ce qui rend les anciens locataires
          sélectionnables avec leur période, et ce qui alimente « Depuis l'entrée du dernier locataire ».

          ⚠️ LA CLÉ PORTE LE FILTRE, comme elle le portait pour « Vie du bien » : c'est ce qui fait repartir le
          moteur sur le filtre voulu quand on clique un cartouche après être déjà sur la fiche. Sans elle, son
          état interne garderait les réglages d'avant — et le clic n'aurait l'air de rien faire. */}
      <div ref={ancreVie}>
        <HistoriqueDuBien
          key={filtreVie}
          lotCle={f.numero}
          maintenant={maintenant}
          occupations={occupationsPourHistorique(f)}
          categories={categoriesDesParties(f)}
          periodes={periodesDesParties(f)}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — les CLIENTS du bien, pour que leur capsule existe meme a 0 mail. */
          clients={clientsDesParties(f)}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — la fiche ou l'on corrige une adresse impossible. */
          onFicheClient={(sorte, id) => ouvrir(sorte, id)}
          evenementOuvertInitial={filtreVie === 'evenement'}
          onOuvrirFil={onOuvrirFil}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — le va-et-vient avec la conversation : le bloc pose son jeton
             dans l'adresse AVANT de partir, et le reprend au retour. Voir l'encadré de `hdb` dans `ecranUrl`. */
          jeton={jetonHistorique ?? null}
          onPoserJeton={onPoserJeton}
          onEcranComplet={onHistorique === undefined
            ? undefined
            : () => onHistorique({ sorte: 'lot', cle: f.numero, id: null })} />
      </div>

      {/* ══ 🔴🔴 « TOUT L'HISTORIQUE DES ÉCHANGES → » MÈNE AU NOUVEAU BLOC ═════════════════════════════════════
          DEMANDE D'ARNO (04/10/2026) : « Les liens ?bloc=vie et “Tout l'historique des échanges →” mènent au
          nouveau bloc. » Les deux visent donc la même ancre, et le lien n'ouvre plus l'écran d'historique
          global — c'est ce qu'Arno a tranché, le moteur juste au-dessus répondant à la même question pour un
          bien, et mieux (période, parties, pièces). CONFIRMÉ au lot HISTORIQUE-BIEN-3 : « Le lien “Tout
          l'historique des échanges →” continue de défiler vers le bloc. »

          🔴 ET L'ÉCRAN PLEIN RESTE ATTEIGNABLE, par un lien discret EN BAS du bloc. C'était ma question au lot
          précédent — en retargetant ce bouton-ci, la fiche d'un bien perdait sa dernière porte vers l'écran
          « Historique » complet. Arno a tranché (05/10/2026) : « L'écran plein “Historique” reste accessible :
          petit lien discret “Écran historique complet” en bas du nouveau bloc. » La porte est donc rouverte,
          là où elle ne gêne pas la lecture — voir `onEcranComplet` ci-dessus.

          ⚠️ `BoutonHistorique` N'EST PAS TOUCHÉ : il sert encore la fiche d'un LOCATAIRE, où les deux
          historiques atteignables sont distincts. Le modifier aurait changé un écran qu'Arno n'a pas ouvert. */}
      <p className="ann-discret">
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-histo"
          onClick={() => ancreVie.current?.scrollIntoView({ block: 'start' })}>
          Tout l’historique des échanges →
        </button>
      </p>
    </>
  );
}

/**
 * ══ 🔴 LES OCCUPATIONS DE LA FICHE, DANS LA FORME DU MODULE PUR ═══════════════════════════════════════════════
 *
 * ⚠️ ON LES PREND **TOUTES**, en cours ET passées : c'est ce qui permet au tableau de bord d'offrir la période
 * d'un ancien locataire, et c'est aussi ce qui permet à `motLocataireDeLaPeriode` de dire « logement vacant
 * depuis le … · dernier locataire … » plutôt que d'inventer un occupant.
 *
 * ⚠️ `nom` DEVIENT `libelle`, `entree`/`sortie` DEVIENNENT `depuis`/`jusqua` : le module pur parle de TRANCHES,
 * avec le vocabulaire que la route emploie déjà pour un locataire (`CibleEtendue.occupations`). Une seule forme
 * pour les deux provenances — sans quoi la fonction aurait eu deux lectures à tenir.
 */
function occupationsPourHistorique(f: FicheLot): OccupationPeriode[] {
  return f.occupations.map((o) => ({ libelle: o.nom, depuis: o.entree, jusqua: o.sortie }));
}

/**
 * ══ 🔴🔴 LA PÉRIODE DE BAIL DE CHAQUE ADRESSE DE LOCATAIRE — « chacun avec sa période » ═══════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : le groupe « Locataire » du bloc PARTIES porte « locataire en place et anciens
 * locataires, chacun avec sa période ».
 *
 * 🔴 SEULE LA FICHE PEUT LA DONNER. La route `/historique` rend un tableau d'occupations VIDE pour une cible
 * `lot-…` (un bien n'est pas borné dans le temps) ; la fiche, elle, porte toutes les occupations ET les contacts
 * de chacune. C'est le même constat qui a fait passer `occupations` par ici au lot précédent.
 *
 * ⚠️ UNE ADRESSE ABSENTE N'AFFICHE RIEN, et c'est voulu : l'assureur, le syndic et l'artisan n'ont pas de bail.
 * Leur inventer une période aurait été un mensonge d'écran — et celui-là se recopie dans un courrier.
 *
 * ⚠️ LE MOT EST ÉCRIT PAR `periodeOccupation`, celle que les trois fiches emploient déjà : « du … au … »,
 * « depuis le … » ou « dates inconnues ». Jamais une seconde mise en forme des dates.
 *
 * ⚠️ LA PLUS RÉCENTE GAGNE quand une même adresse a occupé deux fois le logement : c'est la période qu'on a en
 * tête. Les occupations arrivent de la plus récente à la plus ancienne, donc le PREMIER posé est conservé.
 */
function periodesDesParties(f: FicheLot): ReadonlyMap<string, PeriodePartie> {
  const m = new Map<string, PeriodePartie>();
  for (const o of f.occupations) {
    const p: PeriodePartie = { mot: periodeOccupation(o.entree, o.sortie), du: o.entree, au: o.sortie };
    for (const x of o.contacts) {
      if (x.sorte !== 'email') continue;
      const a = x.valeur.trim().toLowerCase();
      if (a !== '' && !m.has(a)) m.set(a, p);
    }
  }
  return m;
}

/**
 * ══ 🔴 À QUELLE CATÉGORIE APPARTIENT CHAQUE ADRESSE DE CETTE FICHE ════════════════════════════════════════════
 *
 * Les propriétaires du bien donnent le groupe « Propriétaire » ; les occupants et les anciens occupants donnent
 * « Locataire ». Tout le reste — assureur, syndic, artisan, voisin — tombe dans « À répartir », ce que l'écran
 * DIT en toutes lettres.
 *
 * 🔴 CE QUE CETTE FONCTION NE REND **PAS**, ET OÙ LE RESTE EST LU. Elle ne connaît que les deux catégories que la
 * fiche PORTE : la table `gestion_message_adresse` a une colonne `partie` limitée à `proprietaire | locataire`.
 * La troisième — « Indépendant » — ne vit que dans `gestion_partie_categorie` (migration 304), et le bloc la lit
 * lui-même par `/api/admin/gestion/historique/parties`, puis FUSIONNE les deux lectures.
 *
 * ⚠️ DANS CETTE FUSION, CE QUE REND CETTE FONCTION L'EMPORTE, et c'est voulu : un propriétaire ou un occupant de
 * CETTE fiche est un CLIENT, et aucun rangement de parties — fût-il « vérifié » — ne doit le faire basculer dans
 * un autre groupe. Un client n'est jamais un contact (règle d'Arno) ; la fiche est l'autorité sur les siens.
 * Deviner « indépendant » depuis un nom de domaine, en revanche, aurait rangé des gens dans une catégorie fausse,
 * ce qui est pire que de les laisser « à répartir » : « à répartir » dit qu'il reste un geste à faire.
 *
 * ⚠️ LES CLÉS SONT EN MINUSCULES : la table des adresses porte la forme canonique, et une comparaison sensible à
 * la casse aurait rangé « Jean.PONS@… » « à répartir » alors que l'annuaire le connaît.
 */
function categoriesDesParties(f: FicheLot): ReadonlyMap<string, CategoriePartie> {
  const m = new Map<string, CategoriePartie>();
  const poser = (contacts: readonly ContactAffiche[], c: CategoriePartie): void => {
    for (const x of contacts) {
      if (x.sorte !== 'email') continue;
      const a = x.valeur.trim().toLowerCase();
      /* ⚠️ LE PREMIER POSÉ GAGNE : une adresse partagée (un couple propriétaire-occupant) ne doit pas changer de
         groupe selon l'ordre de lecture. Les propriétaires sont posés d'abord, exprès. */
      if (a !== '' && !m.has(a)) m.set(a, c);
    }
  };
  for (const p of f.proprietaires) poser(p.contacts, 'proprietaire');
  poser(f.proprietaireContacts, 'proprietaire');
  for (const p of f.occupants) poser(p.contacts, 'locataire');
  for (const o of f.occupations) poser(o.contacts, 'locataire');
  return m;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES CLIENTS DE CETTE FICHE, POUR LES DEUX ENCARTS ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : « Le propriétaire client (carte du haut de fiche) y apparaît en capsule même avec 0 mail, avec
 * ses compteurs à 0. »
 *
 * 🔴 POURQUOI ÇA NE POUVAIT PAS VENIR DE LA ROUTE. `/api/admin/gestion/historique` rend des INTERLOCUTEURS, lus
 * dans `gestion_message_adresse` : des gens qui ont écrit ou reçu quelque chose. Un propriétaire muet n'y figure
 * pas — c'est tout le diagnostic du défaut de lot-299. La fiche, elle, les a déjà : `f.proprietaires`, ses
 * contacts d'en-tête et `f.occupants` sont lus pour l'écran du haut. Les relire ici ne coûte aucune requête.
 *
 * 🔴 ELLE REND AUSSI LES CLIENTS **SANS ADRESSE** (`adresse: null`), et c'est indispensable : ce sont eux qui
 * font la différence entre « Aucun locataire connu » et « Aucun échange avec le locataire sur cette période ».
 * Les filtrer ici aurait rendu l'encart vide muet sur la seule chose qui compte — y a-t-il quelqu'un ?
 *
 * ⚠️ LES OCCUPANTS **EN PLACE** SEULEMENT (`f.occupants`), pas tout l'historique des baux. Un ancien locataire
 * qui a écrit arrive de lui-même par les interlocuteurs, avec ses vrais compteurs et sa période ; lui fabriquer
 * une capsule à zéro aurait rempli l'encart « Locataire » de tous les occupants depuis 2019 sur un bien où il
 * n'y a rien à lire. Le propriétaire, lui, est posé en entier — il est LE client du dossier.
 *
 * ⚠️ UNE ADRESSE N'EST POSÉE QU'UNE FOIS, et le premier posé gagne : même convention que `categoriesDesParties`
 * juste au-dessus, et même raison — une adresse partagée par un couple propriétaire-occupant ne doit pas changer
 * d'encart selon l'ordre de lecture. PUR.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function clientsDesParties(f: FicheLot): ClientDuBien[] {
  const out: ClientDuBien[] = [];
  const vues = new Set<string>();
  const poser = (nom: string | null, contacts: readonly ContactAffiche[],
    categorie: 'proprietaire' | 'locataire',
    /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — sa fiche d'annuaire, pour le lien « adresse à corriger ». */
    fiche: { sorte: 'proprietaire' | 'locataire'; id: number } | null): void => {
    const emails = contacts.filter((c) => c.sorte === 'email' && c.valeur.trim() !== '');
    if (emails.length === 0) {
      /* 🔴 UN CLIENT SANS ADRESSE COMPTE QUAND MÊME : il ne donne pas de capsule, il donne la PHRASE. */
      out.push({ adresse: null, nom, categorie, fiche });
      return;
    }
    for (const c of emails) {
      const a = c.valeur.trim();
      const cle = a.toLowerCase();
      if (vues.has(cle)) continue;
      vues.add(cle);
      out.push({ adresse: a, nom, categorie, fiche });
    }
  };
  for (const p of f.proprietaires) poser(p.nomAffiche, p.contacts, 'proprietaire', { sorte: 'proprietaire', id: p.id });
  /* ⚠️ LES CONTACTS D'EN-TÊTE DU PROPRIÉTAIRE : sur une fiche dont le propriétaire n'a pas de carte (absent de
     l'annuaire des personnes), ce sont les SEULES coordonnées connues. Le nom vient alors du lot, et la fiche
     d'annuaire est celle que le lot désigne — `null` s'il n'en désigne aucune. */
  poser(f.proprietaireNom === '' ? null : f.proprietaireNom, f.proprietaireContacts, 'proprietaire',
    f.proprietaireId === null ? null : { sorte: 'proprietaire', id: f.proprietaireId });
  for (const o of f.occupants) poser(o.nomAffiche, o.contacts, 'locataire', { sorte: 'locataire', id: o.id });
  return out;
}

/**
 * ══ 🔴 GROUPER LES OCCUPATIONS PAR BAIL ═══════════════════════════════════════════════════════════════════════
 *
 * Un « bail » se reconnaît à ses DATES : deux personnes entrées le même jour et sorties le même jour occupaient
 * le même logement ensemble. C'est la seule lecture que la base permette — elle ne porte pas d'objet « bail ».
 *
 * ⚠️ AUCUN GROUPE AUJOURD'HUI, et c'est mesuré : zéro couple (lot, entrée) porté par deux personnes au
 * 29/09/2026. Le groupement est écrit quand même, parce que l'étape C va créer ces cas — et qu'un écran qui
 * n'aurait pas prévu deux occupants les afficherait comme deux baux successifs, ce qui serait faux. PUR.
 */
function grouperParPeriode(occupations: readonly OccupationDuLot[]): OccupationDuLot[][] {
  const groupes: OccupationDuLot[][] = [];
  const index = new Map<string, number>();
  for (const o of occupations) {
    const cle = `${o.entree ?? '?'}|${o.sortie ?? '?'}`;
    const place = index.get(cle);
    if (place === undefined) { index.set(cle, groupes.length); groupes.push([o]); }
    else groupes[place].push(o);
  }
  return groupes;
}

/**
 * ══ 🔴🔴 LA FICHE D'UN LOCATAIRE — ÉTAPE C ═════════════════════════════════════════════════════════════════════
 *
 * Arno : « ÉTAPE C — FICHE LOCATAIRE : plus légère (coordonnées, le logement en carte vers la fiche bien, les
 * dates, le propriétaire, et ses mails) ». Et la RÈGLE qui la gouverne : « chercher un locataire montre TOUS les
 * occupants du même logement ».
 *
 * 🔴 « PLUS LÉGÈRE » NE VEUT PAS DIRE PLUS PAUVRE. On y trouve tout ce qu'on vient y chercher — qui appeler, où il
 * habite, depuis quand, à qui est le logement, ce qui s'est dit — et rien de plus : ni l'historique complet du
 * bien (il est sur la fiche du bien), ni ses anciens co-occupants (ils sont dans son historique).
 *
 * 🔴 LES CARTES PORTENT LE FOYER, PAS LA SEULE PERSONNE DEMANDÉE. C'est la règle d'Arno prise au mot : appeler un
 * logement, c'est pouvoir joindre l'un ou l'autre. Ne montrer qu'un des deux conjoints ferait rater l'autre
 * numéro — le défaut même de l'annuaire d'avant.
 *
 * ⚠️ « SES MAILS » RÉUTILISE `VieDuBien`, avec la clé de son LOGEMENT EN COURS. Un mail n'est jamais rattaché à une
 * personne mais à un BIEN (règle centrale du module : « la cible est toujours un bien ») : les mails d'un
 * locataire sont donc ceux de son logement, et l'écran le DIT plutôt que de laisser croire à un tri par personne.
 */
function VueLocataire({
  f, ouvrir, onHistorique, gestes, maintenant, onOuvrirFil, onHistoriqueDuBien, onCreer,
}: {
  f: FicheLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistorique?: (cible: Cible) => void;
  onHistoriqueDuBien: (lotId: number) => void;
  onCreer: (sujet: Sujet, lots: readonly number[], champs: ChampsSaisis) => Promise<string | null>;
  gestes: GestesCartes;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  const enCours = f.logements.filter((o) => o.encours);
  const passes = f.logements.filter((o) => !o.encours);
  /** Le logement dont on montre les échanges : celui qu'il occupe. Le plus récent s'il en occupe plusieurs. */
  const logementDesMails = enCours[0] ?? null;
  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.nom}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">{enCours.length > 0 ? 'Locataire en place' : 'Ancien locataire'}</span>
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
      </header>

      {/* ══ 🔴 TOUS LES OCCUPANTS DU MÊME LOGEMENT, EN CARTES — la règle d'Arno, à l'écran ═══════════════════════ */}
      <BlocCartes titre="Coordonnées" id="ann-coord-loc" personnes={f.personnes} motAjouter="Ajouter un occupant"
        role={(p) => (p.id === f.id ? 'Locataire' : 'Même logement')} gestes={gestes}
        creation={{
          /* ⚠️ ON RATTACHE AU LOGEMENT EN COURS. Sans logement en cours, la personne est créée sans lien : il n'y
             a rien à quoi la rattacher, et inventer un bail serait écrire un fait faux — la phrase le dit. */
          rappel: enCours.length === 0
            ? 'Cette personne n’occupe aucun logement : le nouvel occupant sera créé sans rattachement.'
            : `Sera ajouté comme occupant du lot ${enCours[0].numero}, avec ${f.nom}.`,
          onCreer: (champs) => onCreer('locataire', enCours.map((o) => o.lotId)
            .filter((x): x is number => x !== null).slice(0, 1), champs),
        }} />
      {f.personnes.length > 1 && (
        <p className="ann-gris">
          Les cartes ci-dessus portent <strong>tous les occupants du même logement</strong>, et pas seulement la
          personne cherchée.
        </p>
      )}

      {/* ══ 🔴 LE LOGEMENT EN CARTE, VERS LA FICHE DU BIEN, avec les dates et le propriétaire ════════════════════ */}
      <section className="ann-bloc" aria-labelledby="ann-log">
        <h4 className="ann-bloc-titre" id="ann-log">
          {enCours.length > 1 ? 'Ses logements' : 'Son logement'} <span className="gst-compte">{enCours.length}</span>
        </h4>
        {enCours.length === 0
          ? <p className="ann-gris">Aucun logement en cours — cette personne a quitté son ou ses logements.</p>
          : <ul className="ann-cartes">{enCours.map((o) => (
            <CarteLogement key={`e-${o.lotId ?? o.numero}-${o.entree ?? ''}`} o={o} ouvrir={ouvrir}
              onHistoriqueDuBien={onHistoriqueDuBien} />
          ))}</ul>}
      </section>

      {passes.length > 0 && (
        <section className="ann-bloc" aria-labelledby="ann-log-p">
          <h4 className="ann-bloc-titre" id="ann-log-p">
            Logements précédents <span className="gst-compte">{passes.length}</span>
          </h4>
          <ul className="ann-cartes">{passes.map((o) => (
            <CarteLogement key={`p-${o.lotId ?? o.numero}-${o.entree ?? ''}-${o.sortie ?? ''}`} o={o}
              ouvrir={ouvrir} onHistoriqueDuBien={onHistoriqueDuBien} />
          ))}</ul>
        </section>
      )}

      {/* ══ 🔴 SES MAILS — CEUX DE SON LOGEMENT, et c'est dit en toutes lettres ══════════════════════════════════ */}
      {logementDesMails !== null && !logementDesMails.horsGestion ? (
        <>
          <p className="ann-gris">
            Les échanges ci-dessous sont ceux <strong>du logement</strong> {titreLogement(logementDesMails.adresse,
              logementDesMails.commune)} : un mail est rattaché à un bien, jamais à une personne.
          </p>
          <VieDuBien lotCle={logementDesMails.numero} maintenant={maintenant} onOuvrirFil={onOuvrirFil} />
        </>
      ) : (
        <p className="ann-gris">
          Aucun logement en gestion pour cette personne : il n’y a donc pas d’échange rattaché à lui montrer.
        </p>
      )}

      {/* LOT RATTACHEMENT-2 — un LOCATAIRE n'est pas une cible de rattachement (il déménage ; le logement, non) :
          l'entrée de l'historique DU BIEN passe donc par son logement, et jamais par lui. */}
      {logementDesMails !== null && !logementDesMails.horsGestion && (
        <p className="ann-discret">
          <BoutonHistorique cible={{ sorte: 'lot', cle: logementDesMails.numero, id: null }}
            onHistorique={onHistorique} />
        </p>
      )}

      {/* ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — ET SON HISTOIRE À LUI ═══════════════════════════════

          DEMANDE D'ARNO (04/10/2026) : « HISTORIQUE PAR LOCATAIRE (nouveau) : sur le modèle de l'historique
          propriétaire, même présentation, accessible depuis la fiche annuaire du locataire. »

          🔴 DEUX BOUTONS QUI NE DISENT PAS LA MÊME CHOSE, ET C'EST POUR CELA QU'ILS COEXISTENT. Celui du dessus
          ouvre TOUT le courrier du logement — prédécesseurs et successeurs compris. Celui-ci n'ouvre que SA
          tranche : les mails de ses biens pendant qu'il les occupait, plus ceux qu'il a écrits ou reçus. Les
          confondre ferait lire le courrier d'un autre locataire comme le sien.

          ⚠️ IL S'AFFICHE MÊME SANS LOGEMENT EN COURS, là où celui du dessus ne peut pas : un ancien locataire
          garde son histoire, et c'est souvent pour elle qu'on ouvre sa fiche. */}
      <p className="ann-discret">
        <BoutonHistorique cible={{ sorte: 'locataire', cle: f.cle, id: null }} onHistorique={onHistorique}
          mot="Son historique à lui, période par période →" />
      </p>

      {/* 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — quittances, avis d'échéance, relances : ils sont adressés à CETTE
          personne, et c'est chez elle qu'ils se rangent. Sans la migration 291, rien ne s'affiche. */}
      <DocumentsAutomatiques sorte="locataire" id={f.id} />

      {/* ══ 🔴🔴 LOT CONTACTS-EXTERNES — et ici, le courrier de son avocat, de son garant ou du syndic, avec son
          rôle AU JOUR DU MAIL. Liste distincte des documents automatiques ; sans la 293, rien ne s'affiche. */}
      <InterventionsDeLaFiche sorte="locataire" id={f.id} onOuvrirFil={onOuvrirFil} />
    </>
  );
}

/**
 * ══ 🔴 LE LOGEMENT D'UN LOCATAIRE, EN CARTE ═══════════════════════════════════════════════════════════════════
 *
 * Même langage visuel que les cartes de biens de la fiche propriétaire (`CarteBien`) : ce sont les mêmes objets,
 * vus d'un autre côté. Deux apparences pour un même bien obligeraient à réapprendre la lecture d'un écran à l'autre.
 *
 * ⚠️ UN LOT « HORS GESTION » N'EST PAS CLIQUABLE, et le DIT : l'occupation le nomme par une clé que l'annuaire des
 * lots ne porte pas. Un lien vers une fiche inexistante est pire qu'une absence de lien.
 */
function CarteLogement({ o, ouvrir, onHistoriqueDuBien }: {
  o: LogementDuLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
  onHistoriqueDuBien: (lotId: number) => void;
}) {
  const corps = (
    <>
      <span className="ann-carte-tete">
        <span className="ann-carte-titre">
          {o.lotId === null ? `Lot n° ${o.numero}` : titreLogement(o.adresse, o.commune)}
        </span>
        <span className="ann-carte-sous">
          <span className="ann-etiq">lot {o.numero}</span>
          {o.nature && <span className="ann-etiq">{o.nature}</span>}
          {o.typeBien && <span className="ann-etiq">{o.typeBien}</span>}
          {o.horsGestion && <span className="ann-etiq ann-etiq--absent">hors gestion</span>}
        </span>
      </span>
      <span className="ann-carte-faits">
        <span className="ann-fait">
          <span className="ann-fait-mot">Occupation</span>
          <span className="ann-fait-valeur">{periodeOccupation(o.entree, o.sortie)}</span>
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Surface</span>
          {o.surfaceM2 === null ? <span className="ann-inconnu">non renseignée</span> : <span>{o.surfaceM2} m²</span>}
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Propriétaire</span>
          {o.proprietaireNom === null || o.proprietaireNom === ''
            ? <span className="ann-inconnu">non renseigné</span>
            : <span className="ann-fait-valeur">{o.proprietaireNom}</span>}
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Mails</span>
          <span>{o.mails}</span>
        </span>
        <span className="ann-fait">
          <span className="ann-fait-mot">Dernier échange</span>
          <DateOuRien iso={o.dernierEchange} sinon="aucun" />
        </span>
      </span>
    </>
  );
  return (
    <li className={`ann-carte${o.encours ? '' : ' ann-carte--ancien'}`}>
      {o.lotId === null
        ? <span className="ann-carte-corps">{corps}</span>
        : <button type="button" className="ann-carte-corps" onClick={() => ouvrir('lot', o.lotId as number)}>
          {corps}
        </button>}
      {/* 🔴 LOT FICHES-RETOUCHES — MÊME PIED QUE LA CARTE DE BIEN : deux boutons de même largeur, et
          « Historique » au-dessus quand le lot est dans l'annuaire. Deux cartes qui montrent le même objet ne
          peuvent pas se présenter de deux façons — on réapprendrait à lire d'un écran à l'autre. */}
      <span className="ann-carte-pied">
        {o.lotId !== null && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large"
            onClick={() => onHistoriqueDuBien(o.lotId as number)}>
            Historique
          </button>
        )}
        <span className="ann-carte-duo">
          {o.proprietaireId !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              onClick={() => ouvrir('proprietaire', o.proprietaireId as number)}>
              Fiche du propriétaire →
            </button>
          )}
          {o.driveDossierId !== null ? (
            <a className="svv-btn svv-btn-outline gst-btn ann-carte-bouton"
              href={`${DRIVE_DOSSIER}${o.driveDossierId}`} target="_blank" rel="noreferrer">
              Dossier Drive du lot ↗
            </a>
          ) : (
            <span className="ann-inconnu ann-carte-sans">dossier Drive non construit</span>
          )}
        </span>
      </span>
    </li>
  );
}

/**
 * LOT RATTACHEMENT-2 — LE POINT D'ENTRÉE DE L'HISTORIQUE, sur une fiche.
 *
 * ⚠️ IL NE S'AFFICHE QUE SI LE PARENT SAIT OÙ ALLER (`onHistorique` fourni) et si la cible a une clé. Un bouton qui
 * n'irait nulle part est pire qu'un bouton absent : on clique, rien ne se passe, et on cherche la panne.
 */
function BoutonHistorique({ cible, onHistorique, mot }: {
  cible: Cible;
  onHistorique?: (c: Cible) => void;
  /**
   * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — LE MOT SE CHOISIT, le bouton ne se recopie pas. Sur une fiche
   * de locataire il y a DEUX historiques atteignables, et deux boutons portant le même libellé seraient un piège :
   * on cliquerait au hasard et on lirait le courrier d'un autre. Sans `mot`, c'est le libellé d'avant, au
   * caractère près — tous les appelants antérieurs restent inchangés.
   */
  mot?: string;
}) {
  if (onHistorique === undefined || cible.cle === null || cible.cle === '') return null;
  return (
    <button type="button" className="svv-btn svv-btn-outline gst-btn ann-histo"
      onClick={() => onHistorique(cible)}>
      {mot ?? 'Tout l’historique des échanges →'}
    </button>
  );
}

export const CSS_ANNUAIRE = `
/* MOBILE D'ABORD : une seule colonne, aucune table, aucun débordement horizontal — tout casse en fin de ligne. */
.ann{display:flex;flex-direction:column;gap:.75rem;min-width:0}
.ann-histo{align-self:flex-start;margin:.2rem 0 .4rem}
.ann-entete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-titre{margin:0;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
.ann-chercher{display:flex;flex-direction:column;gap:.3rem}
/* L'étiquette est VISIBLE : un intitulé qui n'existe que dans le texte d'invite disparaît dès qu'on tape. */
.ann-label{font-size:.78rem;font-weight:600;color:var(--color-svv-ink)}
.ann-champ{min-height:44px;padding:.5rem .7rem;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.95rem;width:100%}
.ann-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-aide{margin:0;font-size:.74rem;color:var(--color-svv-muted);line-height:1.4}
.ann-compte{margin:0;font-size:.78rem;color:var(--color-svv-muted)}
.ann-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ann-item{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:10px 12px;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:3px}
/* Un bail terminé est plus discret, mais reste parfaitement lisible : on ne cache pas l'historique. */
.ann-item--passe{background:var(--color-svv-field)}
.ann-item-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem}
.ann-item-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem}
/* Le RÔLE est écrit en toutes lettres devant chaque valeur : « Propriétaire », « Locataire actuel », « Téléphone ».
   Sans lui, deux noms l'un sous l'autre ne disent pas lequel est lequel. */
.ann-role{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted);
  flex:0 0 auto;min-width:6.5rem}
.ann-gris{font-size:.78rem;color:var(--color-svv-muted)}
/* ══ « NON RENSEIGNE » : UN FAIT, DIT EN ITALIQUE ET PLUS CLAIR QUE LA VALEUR — jamais un vide, qui se lirait
   comme un oubli d'affichage.
   🔴 LE GRIS EST celui de --color-svv-muted (#5c6573), PAS --color-svv-label (#8a929e). Arno demande « gris clair » ET
   « contraste AA verifie » : mesure sur fond blanc, label tombe a 3,0:1 — sous les 4,5:1 exiges pour un texte de
   cette taille. Muted tient 6,4:1, reste nettement plus clair que l'encre des valeurs (#16202c, 15,3:1), et
   l'ITALIQUE fait le reste du travail de distinction. Un contraste qu'on ne peut pas lire n'est pas une nuance. */
.ann-inconnu{font-size:.85rem;color:var(--color-svv-muted);font-style:italic}
.ann-sans-lot{font-weight:700;color:var(--color-svv-ink)}
/* Un lien est un BOUTON souligné : cible tactile pleine hauteur, et jamais une couleur seule pour dire qu'il agit. */
.ann-lien{background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;color:var(--color-svv-ink);
  font:inherit;font-size:.88rem;text-decoration:underline;text-underline-offset:3px;min-height:44px}
.ann-lien--fort{font-weight:700;font-size:.95rem}
.ann-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-etiq{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:1px 8px;white-space:nowrap}
.ann-etiq--passe{opacity:.85}
/* « absent du dernier export » : le MOT porte l'information ; la bordure ne fait que la redire. */
.ann-etiq--absent{border-color:var(--color-svv-red);color:var(--color-svv-ink)}
.ann-fiche{display:flex;flex-direction:column;gap:.5rem;min-width:0}
.ann-retour{align-self:flex-start}
/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FICHES-ANNUAIRE — LE LANGAGE VISUEL DES FICHES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Arno : « beaucoup trop blanc, il faut plus de contraste et de relief, tout en restant dans le style global du
   site, sans etre extravagant ».

   CE QUI CHANGE, ET RIEN D'AUTRE :
     · un FOND DE PAGE legerement teinte (le gris de la charte) sous la fiche, pour que les blocs BLANCS s'en
       detachent — c'est le relief, et il ne coute aucune couleur nouvelle ;
     · chaque bloc et chaque carte : surface blanche, bordure fine, ombre douce ;
     · un EN-TETE de fiche distinct : le nom en grand, le role en capsule, les actions a droite ;
     · des titres de section porteurs d'un FILET a la couleur de la charte ;
     · des libelles en gris moyen, des valeurs en encre appuyee, « non renseigne » en italique clair.

   🔴 AUCUNE COULEUR NOUVELLE. Tout sort des jetons existants (--color-svv-*), y compris en Sombre, ou les
   surfaces sont GRADUEES (bg < field < surface) plutot que posees sur du noir plat.
   🔴 LE ROUGE NE DECORE JAMAIS : il ne sert qu'aux actions, aux filets de titre et a l'anneau de focus.

   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}

/* LE FOND TEINTE de la fiche. En clair, le gris de la charte ; en sombre, le fond de page, plus SOMBRE que la
   surface des blocs — dans les deux cas, les blocs se detachent par la LUMINOSITE, jamais par une teinte. */
.ann-fiche{background:var(--color-svv-field);border-radius:14px;padding:14px;
  display:flex;flex-direction:column;gap:.9rem;min-width:0}
.svv-adm-root[data-theme='dark'] .ann-fiche{background:var(--color-svv-bg)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-fiche{background:var(--color-svv-bg)}
}

/* ── L'EN-TETE DE FICHE ───────────────────────────────────────────────────────────────────────────────────────
   Un bandeau sobre : le nom en grand a gauche, le role en capsule dessous, les actions a droite. */
.ann-tete{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.8rem;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05),0 6px 16px rgba(22,32,44,.05);padding:14px 16px}
.svv-adm-root[data-theme='dark'] .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
}
.ann-tete-mots{flex:1 1 16rem;min-width:0;display:flex;flex-direction:column;gap:.35rem}
.ann-tete-nom{margin:0;font-size:1.35rem;line-height:1.2;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.ann-tete-sous{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0}
/* LE ROLE EN CAPSULE — un MOT dans une pastille, jamais une couleur seule. */
.ann-role-capsule{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:var(--color-svv-muted);background:var(--color-svv-field);border:1px solid var(--color-svv-line);
  border-radius:999px;padding:.12rem .6rem}
.ann-tete-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-left:auto}

/* ── LES BLOCS ────────────────────────────────────────────────────────────────────────────────────────────── */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:0}
/* LE FILET de la charte devant chaque titre de section : deux pixels de rouge, et rien de plus. */
.ann-bloc-titre{margin:0;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);display:flex;align-items:center;gap:.5rem}
.ann-bloc-titre::before{content:"";flex:0 0 auto;width:3px;height:1em;border-radius:2px;
  background:var(--color-svv-red)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);padding:14px 16px;display:flex;flex-direction:column;gap:.6rem}
.svv-adm-root[data-theme='dark'] .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
}
/* L'EN-TETE D'UN BLOC DE PERSONNE : son nom a gauche, ses actions (Modifier) a droite. */
.ann-personne-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;flex:1 1 auto;min-width:0}
.ann-personne-actions{display:flex;flex-wrap:wrap;gap:.4rem;margin-left:auto}
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .9rem;margin:0}
/* LIBELLE en gris moyen, VALEUR en encre appuyee : c'est ce qui donne le contraste demande. */
.ann-champs dt{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);margin-top:.4rem}
.ann-champs dd{margin:0;font-size:.92rem;font-weight:500;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9.5rem 1fr}
  .ann-champs dt{margin-top:.22rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.ann-libelle{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  padding:.15rem .5rem;font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* LOT FICHES-ANNUAIRE etape C — le petit formulaire « enregistrer un depart », POSE DANS LA LIGNE de la carte :
   il se plie en colonne des que la carte est etroite, pour que la date et ses deux boutons restent atteignables. */
.ann-depart{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0}
.ann-depart .cp-saisie{min-height:2rem;width:auto;flex:0 1 9.5rem}
/* Un occupant PARTI reste parfaitement lisible : il est seulement pose sur le gris de la page, pas efface. */
.ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
.svv-adm-root[data-theme='dark'] .ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
/* UN BAIL = un groupe d'occupants. Quand il en porte plusieurs, un mot le DIT — jamais un simple alignement. */
.ann-bail{display:flex;flex-direction:column;gap:.4rem}
.ann-bail+.ann-bail{margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--color-svv-line)}
.ann-bail-mot{margin:0;font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}

/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────── */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);display:flex;flex-direction:column;overflow:hidden;min-width:0;
  transition:box-shadow .15s ease,transform .15s ease,border-color .15s ease}
/* LE SURVOL SOULEVE LA CARTE — l'elevation est un APPUI, jamais l'information : tout reste ecrit. */
.ann-carte:hover{box-shadow:0 2px 4px rgba(22,32,44,.07),0 10px 24px rgba(22,32,44,.09);
  border-color:var(--color-svv-line-strong);transform:translateY(-1px)}
@media (prefers-reduced-motion:reduce){.ann-carte{transition:none}.ann-carte:hover{transform:none}}
.svv-adm-root[data-theme='dark'] .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
.svv-adm-root[data-theme='dark'] .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .svv-adm-root:not([data-theme='light']) .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
}
.ann-carte--ancien{background:var(--color-svv-field)}
.ann-carte-corps{display:flex;flex-direction:column;gap:0;align-items:stretch;text-align:left;
  background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'EN-TETE DE CARTE, TEINTE : il porte l'adresse et les etiquettes, et separe la carte de son contenu. */
.ann-carte-tete{display:flex;flex-direction:column;gap:.35rem;padding:11px 14px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line)}
.ann-carte--ancien .ann-carte-tete{background:var(--color-svv-surface)}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.2rem;padding:11px 14px 8px}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:7.4rem}
/* LE LOCATAIRE EN PLACE est MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */
.ann-fait--locataire{background:var(--color-svv-green-soft);border-radius:.4rem;margin:.1rem -.35rem;
  padding:.2rem .35rem}
.ann-fait--locataire .ann-fait-valeur{font-weight:700;color:var(--color-svv-green-ink)}
/* « Vacant » est un MOT, jamais une couleur seule : il se lit en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.2rem 0 0}
/* ══ LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE, ET LES CARTES DE BIENS ════════════════════════════════════════
   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
/* Le champ compact d'une fiche : il prend la place qui reste, sans pousser la fiche vers le bas. */
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}
/* Un BLOC de fiche : un titre, un cadre discret, et de l'air. C'est l'unite de lecture de la fiche. */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:.2rem}
.ann-bloc-titre{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:12px 14px;display:flex;flex-direction:column;gap:.5rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
/* Deux colonnes des 520 px, une seule en dessous : un intitule au-dessus de sa valeur reste lisible au telephone. */
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .8rem;margin:0}
.ann-champs dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);margin-top:.35rem}
.ann-champs dd{margin:0;font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9rem 1fr}
  .ann-champs dt{margin-top:.2rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.2rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
/* Le LIBELLE d'origine (« Mobile », « Email »). Il dit LEQUEL des trois numeros on regarde. */
.ann-libelle{font-size:.72rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:none;border:1px solid var(--color-svv-line);border-radius:.4rem;padding:.15rem .5rem;
  font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────────
   Une grille qui se remplit toute seule : une colonne au telephone, deux ou trois sur un grand ecran. */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:10px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  display:flex;flex-direction:column;overflow:hidden;min-width:0}
.ann-carte--ancien{background:var(--color-svv-field)}
/* LA CARTE ENTIERE EST LE BOUTON. Les deux liens qui en sortent sont DANS LE PIED, a cote — jamais dedans :
   un bouton dans un bouton est du HTML invalide et injouable au clavier. */
.ann-carte-corps{display:flex;flex-direction:column;gap:.45rem;align-items:stretch;text-align:left;
  background:none;border:0;padding:12px 14px 8px;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:hover{background:var(--color-svv-field)}
.ann-carte--ancien .ann-carte-corps:hover{background:var(--color-svv-surface)}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.15rem}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:8.5rem}
/* « Vacant » est un MOT, jamais une couleur seule : c'est un fait, et il doit se lire en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.4rem 0 0}
.ann-fiche-titre{margin:.2rem 0 0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-fiche-sous{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.ann-sstitre{margin:.6rem 0 .2rem;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
/* La liste de définitions se replie en une colonne sous 520 px : deux colonnes serrées rendent l'adresse illisible. */
.ann-dl{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.25rem .7rem;margin:0;font-size:.85rem}
.ann-dl dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ann-dl dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.ann-dl{grid-template-columns:1fr;gap:.1rem}.ann-dl dd{margin-bottom:.35rem}}
.ann-contacts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.ann-contact{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-height:44px}

/* ══ 🔴🔴 LOT FICHES-RETOUCHES — LE PIED DE LA CARTE DE BIEN, EN BOUTONS ═══════════════════════════════════════
   Arno : « deux BOUTONS cote a cote sur la meme ligne, de meme hauteur et de meme largeur, avec la meme
   presentation que le bouton “Dossier Drive ↗” de l'en-tete » ; et « Historique » AU-DESSUS, sur toute la largeur.

   🔴 UNE GRILLE DE DEUX COLONNES EGALES (1fr 1fr), ET NON UN FLEX. En flex, chaque bouton prendrait la largeur de
   son texte : « Fiche du locataire → » serait deux fois plus large que « Dossier Drive du lot ↗ », et la promesse
   « meme largeur » serait fausse a l'oeil des la premiere carte. La grille la tient par construction.

   ⚠️ CES REGLES SONT EN FIN DE FEUILLE, EXPRES : ce fichier porte deux definitions successives de .ann-carte-pied
   (une premiere version, puis celle du lot esthetique). En cascade, c'est la DERNIERE qui gagne — s'inserer plus
   haut serait etre ecrase sans un mot.

   AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave terminerait —
   piege consigne TREIZE fois dans ce depot, et treize fois dans un commentaire. */
.ann-carte-pied{display:flex;flex-direction:column;gap:.4rem;padding:0 14px 12px;align-items:stretch}
.ann-carte-duo{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;align-items:stretch}
/* Un seul des deux ? Il prend toute la ligne — une demi-ligne vide se lirait comme un bouton manquant. */
.ann-carte-duo:has(> :only-child){grid-template-columns:1fr}
/* Le bouton de carte : c'est .svv-btn-outline de la charte, centre et calibre pour une grille. */
.ann-carte-bouton{display:inline-flex;align-items:center;justify-content:center;text-align:center;
  width:100%;min-height:36px;padding:.35rem .5rem;font-size:.78rem;line-height:1.15;
  text-decoration:none;overflow-wrap:anywhere}
.ann-carte-bouton--large{width:100%}
/* L'absence de dossier Drive se DIT, a la place du bouton, et reste centree sur la meme ligne de base. */
.ann-carte-sans{display:inline-flex;align-items:center;justify-content:center;text-align:center;
  min-height:36px;font-size:.76rem}
/* Le lien discret de l'en-tete : l'historique tous biens confondus, quand il n'est pas redondant. */
.ann-tete-histo{font-size:.78rem}

/* ══ 🔴🔴 LOT ANNUAIRE-PERSONNES — UNE LIGNE PAR PERSONNE ═════════════════════════════════════════════════════
   Arno : « une ligne ou carte compacte par personne, cliquable sur toute sa surface ». COMPACTE est le mot :
   l'annuaire se parcourt des yeux, et une ligne qui respire trop en fait tenir quatre a l'ecran au lieu de dix.

   ⚠️ LA LIGNE ENTIERE EST LE BOUTON, et le lien vers la seconde fiche vit dans un PIED, a cote — jamais dedans :
   un bouton dans un bouton est du HTML invalide et injouable au clavier. */
.ann-personnes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ann-pers{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:10px;
  background:var(--color-svv-surface);overflow:hidden;min-width:0;
  transition:border-color .15s ease,box-shadow .15s ease}
.ann-pers:hover{border-color:var(--color-svv-line-strong-hover);box-shadow:0 2px 6px rgba(22,32,44,.1)}
@media (prefers-reduced-motion:reduce){.ann-pers{transition:none}}
/* ══ 🔴 LE FILET DISCRET : « quand ils partagent le meme bien, on voit qu'ils vont ensemble » ═══════════════
   Deux voisines d'un meme groupe sont collees, et un trait FIN les relie. Ni cadre, ni fond, ni titre : un
   groupe de coloc n'est pas une section — c'est juste deux lignes qui se suivent. */
.ann-pers--groupe{border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-style:dashed;
  margin-bottom:-6px;padding-bottom:2px}
.ann-pers--groupe + .ann-pers{border-top-left-radius:0;border-top-right-radius:0;border-top:0}
.ann-pers--archive{background:var(--color-svv-field);border-style:dashed}
.ann-pers-corps{display:flex;flex-direction:column;gap:.15rem;align-items:stretch;text-align:left;width:100%;
  background:none;border:0;padding:8px 12px;font:inherit;color:inherit;cursor:pointer}
.ann-pers-corps:hover{background:var(--color-svv-field)}
.ann-pers--archive .ann-pers-corps:hover{background:var(--color-svv-surface)}
.ann-pers-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.ann-pers-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;min-width:0}
.ann-pers-nom{font-size:.92rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* LA CAPSULE DE ROLE. Le MOT porte l'information — jamais la seule couleur, qui ne se lit ni en niveaux de gris
   ni pour un oeil daltonien. Le ton, lui, ne fait que confirmer ce que le mot dit deja. */
.ann-pers-role{display:inline-flex;align-items:center;min-height:1.15rem;padding:.05rem .45rem;border-radius:.6rem;
  font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;
  background:var(--color-svv-field);color:var(--color-svv-muted)}
.ann-pers-role--proprietaire{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.ann-pers-role--locataire{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
/* LA LIGNE GRISE : le premier mobile, le premier e-mail, le bien, la raison. Elle ne revient jamais a la ligne
   au milieu d'une valeur — elle se replie entre ses morceaux, qui sont autant de blocs insecables. */
.ann-pers-gris{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0;
  font-size:.78rem;color:var(--color-svv-muted)}
.ann-pers-coord{white-space:nowrap}
.ann-pers-sep{color:var(--color-svv-line-strong)}
.ann-pers-bien{min-width:0;overflow-wrap:anywhere}
.ann-pers-plus{margin-left:.3rem;padding:.02rem .35rem;border-radius:.5rem;font-size:.7rem;font-weight:700;
  background:var(--color-svv-field);color:var(--color-svv-muted);white-space:nowrap}
.ann-pers-raison{font-style:italic}
.ann-pers-pied{display:flex;padding:0 12px 8px}
.ann-pers-pied .ann-lien{font-size:.78rem}
/* La case des archivees : discrete, mais TOUJOURS visible — c'est souvent elle qu'on vient cocher. */
.ann-archivees{display:inline-flex;align-items:center;gap:.4rem;min-height:38px;font-size:.8rem;
  color:var(--color-svv-muted);cursor:pointer}
.svv-adm-root[data-theme='dark'] .ann-pers:hover{box-shadow:0 2px 8px rgba(0,0,0,.5)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-pers:hover{box-shadow:0 2px 8px rgba(0,0,0,.5)}
}

/* ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — DES CARTES DE MEME HAUTEUR, BOUTONS COLLES EN BAS ══════════════════════════
   Arno : « toutes les cartes ont la meme hauteur : la plus haute impose sa taille aux autres. Pas de hauteur fixe
   arbitraire. Les boutons du bas sont TOUJOURS colles en bas de la carte, alignes au meme niveau sur toutes les
   cartes de la ligne, meme quand une carte n'a que 2 boutons (bien vacant). »

   🔴 TROIS REGLES, ET IL FAUT LES TROIS :
     ① la grille etire ses cases (align-items:stretch, deja le defaut) — chaque carte remplit la hauteur de SA
       RANGEE, qui est celle de la plus haute ;
     ② la carte est une colonne flex, et le bloc des FAITS prend l'espace restant (flex:1 1 auto) — c'est lui qui
       absorbe la difference, pas le pied ;
     ③ le pied est pousse en bas (margin-top:auto). Sans le ③, une carte courte laisserait ses boutons flotter au
       milieu, et la ligne des « Dossier Drive » serait en escalier d'une carte a l'autre.
   Une hauteur FIXE, elle, couperait la plus haute des qu'un bien porte un cartouche d'evenement. */
.ann-cartes{align-items:stretch}
.ann-carte-faits{flex:1 1 auto}
.ann-carte-pied{margin-top:auto}

/* ══ 🔴 LE CARTOUCHE « EVENEMENT EN COURS » ═══════════════════════════════════════════════════════════════════
   Toute la largeur, coins arrondis, orange SOBRE de la palette d'alerte existante — aucune couleur nouvelle :
   --color-svv-amber-soft en fond, --color-svv-amber en texte, la paire deja employee par les replis du module.
   Contraste AA verifie en Clair comme en Sombre. */
.ann-cartouche{display:flex;align-items:center;justify-content:center;gap:.4rem;width:100%;
  margin:0 0 .35rem;padding:.4rem .6rem;border-radius:.5rem;cursor:pointer;
  border:1px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);color:var(--color-svv-amber);
  font:inherit;font-size:.8rem;font-weight:700;text-align:center;
  transition:background .15s ease,box-shadow .15s ease,transform .15s ease}
.ann-cartouche:hover{box-shadow:0 2px 6px rgba(22,32,44,.14);transform:translateY(-1px)}
.ann-cartouche:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-cartouche-point{font-size:.6rem;line-height:1}
/* En tete de la fiche du bien, il respire un peu plus : il n'est plus serre entre deux lignes de faits. */
.ann-tete + .ann-cartouche{margin:.1rem 0 .2rem;padding:.55rem .7rem;font-size:.85rem}
@media (prefers-reduced-motion:reduce){.ann-cartouche{transition:none}.ann-cartouche:hover{transform:none}}

/* ══ 🔴 LES BOUTONS REAGISSENT AU SURVOL ══════════════════════════════════════════════════════════════════════
   Arno : « fond legerement teinte, bordure plus marquee, legere elevation, curseur main, transition courte.
   Focus clavier visible. Meme comportement en Sombre. »

   ⚠️ LE MOUVEMENT EST DE 1 PIXEL, et il se coupe sous prefers-reduced-motion : une carte qui saute a chaque
   passage de souris fatigue plus qu'elle n'informe. */
.ann-carte-bouton,.ann-tete-actions .svv-btn{cursor:pointer;
  transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.ann-carte-bouton:hover,.ann-tete-actions .svv-btn:hover{background:var(--color-svv-field);
  border-color:var(--color-svv-line-strong-hover);box-shadow:0 2px 6px rgba(22,32,44,.12);
  transform:translateY(-1px)}
.ann-carte-bouton:focus-visible,.ann-tete-actions .svv-btn:focus-visible{outline:2px solid var(--color-svv-red);
  outline-offset:2px}
@media (prefers-reduced-motion:reduce){
  .ann-carte-bouton,.ann-tete-actions .svv-btn{transition:none}
  .ann-carte-bouton:hover,.ann-tete-actions .svv-btn:hover{transform:none}
}
/* En SOMBRE, une ombre noire sur fond sombre ne se voit pas : c'est le contour clair qui fait le relief. */
.svv-adm-root[data-theme='dark'] .ann-carte-bouton:hover,
.svv-adm-root[data-theme='dark'] .ann-tete-actions .svv-btn:hover,
.svv-adm-root[data-theme='dark'] .ann-cartouche:hover{box-shadow:0 2px 8px rgba(0,0,0,.5)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-carte-bouton:hover,
  .svv-adm-root:not([data-theme='light']) .ann-tete-actions .svv-btn:hover,
  .svv-adm-root:not([data-theme='light']) .ann-cartouche:hover{box-shadow:0 2px 8px rgba(0,0,0,.5)}
}
`;
