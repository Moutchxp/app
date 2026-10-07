'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/* 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — « en gestion », écrit une seule fois (module PUR). */
import { bienEnGestion } from '../../../../lib/gestion/bienEnGestion';
import {
  formaterDateIso, periodeOccupation, titreLogement,
} from '../../../../lib/gestion/annuaireRecherche';
import type {
  BienDuProprietaire, ContactAffiche, FicheLocataire, FicheLot, FicheProprietaire,
  LogementDuLocataire, OccupationDuLot,
} from '../../../../lib/gestion/annuaireRepo';
/**
 * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — LA **MÊME** BARRE QUE L'ÉCRAN PARTAGÉ, PAS UNE COPIE.
 *
 * Arno : « LE MÊME composant que l'écran partagé (pas une copie) ». C'est tout l'enjeu du lot : cet écran avait
 * son propre champ, son propre débounce, sa propre liste de résultats — un second annuaire, qui ne trouvait pas
 * tout à fait les mêmes gens que la barre de l'accueil et qui se corrigeait séparément. Il n'y en a plus qu'un.
 */
import { BarreAnnuaire } from './BarreAnnuaire';
/* 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — la moitié « fiche » du calcul des PARTIES, descendue dans un module
   PUR pour que la fenêtre des pièces jointes lise exactement la même, et non une copie. */
import { categoriesDeLaFiche } from '../../../../lib/gestion/familleDestinataire';
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
/* 🔴🔴 LOT MONGA-2, POINT 4 — le bloc « Événements » de la fiche du bien. */
import { EvenementsDuBien } from './EvenementsDuBien';
import { CSS_HISTORIQUE_DU_BIEN, HistoriqueDuBien } from './HistoriqueDuBien';
/* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — L'UNIQUE RÈGLE « ancien locataire ou locataire actuel », et l'ordre des
   anciens. La fiche ne les réécrit pas : elle les appelle, comme le dépôt et comme l'encart Parties. */
import { estAncienLocataire, estLocataireEnPlace, parDepartLePlusRecent,
  type CarteLocataireBien, type CategoriePartie, type ClientDuBien, type OccupationPeriode,
  type PeriodePartie } from '../../../../lib/gestion/historiqueBien';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LA SYNCHRONISATION DU HAUT ET DU BAS.
 *
 * Le signal ne porte aucune carte : il dit « redemande ». Qui AFFICHE des cartes de contact s'y abonne, qui en
 * CHANGE une l'annonce. Voir l'encadré de `signalCartesContact`.
 */
import { annoncerCartesContact, concerneCeBien, ecouterCartesContact, type SignalCartesContact }
  from '../../../../lib/gestion/signalCartesContact';
/* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 1 — le seul juge de « cette carte monte-t-elle dans un carrousel ? ». */
import {
  carteMonteAuCarrousel,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — les mots du choix viennent des BADGES, et non d'une phrase retapée. */
  LIBELLE_CONTACT_LOCATAIRE_COURT, LIBELLE_CONTACT_PROPRIETAIRE_COURT,
} from '../../../../lib/gestion/partieCategorie';
/* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — la fiche d'un contact, telle qu'elle part au serveur (module PUR).
   🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — et son IDENTITÉ quand il naît hors d'une capsule : son premier e-mail. */
import { ficheAEnvoyer, premierEmail } from '../../../../lib/gestion/ficheContact';
/** La carte telle que le dépôt la rend. Importée en TYPE : rien de `pg` n'entre dans ce paquet. */
import type { LigneCarte as CarteDeContact } from '../../../../lib/gestion/partieCategorieRepo';
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
 * 🔴 UNE SEULE RECHERCHE, et c'est la demande d'Arno mot pour mot : « trouver par nom, adresse, téléphone ou mail qui
 * est qui par rapport à un logement ». Quatre champs obligeraient à décider AVANT de taper dans lequel on est —
 * alors qu'on a sous les yeux un numéro sans savoir s'il est d'un propriétaire ou d'un locataire.
 *
 * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL (07/10/2026) — CET ÉCRAN N'A PLUS DE RECHERCHE À LUI ════════════════════════════
 *
 * ARNO : « l'écran Annuaire est à reconstruire, minimal : un titre “Annuaire”, une phrase d'explication, et LE MÊME
 * composant `BarreAnnuaire` que l'écran partagé — pas une copie. »
 *
 * 🔴 CE QUI A ÉTÉ RETIRÉ, ET CE QUI LE REMPLACE. L'écran portait son propre champ (`ann-q`), son propre délai de
 * frappe, son propre état de réponse et sa propre liste de résultats (`Resultats` / `LignePersonne`) — un SECOND
 * annuaire, avec ses propres défauts à corriger deux fois. Tout cela passe par la barre partagée, qui interroge la
 * MÊME route (`/api/admin/gestion/annuaire?q=…`) et la MÊME fonction (`rechercherPersonnes`).
 *
 * 🔴 CE QUE LA LISTE DÉTAILLÉE PORTAIT, ET OÙ C'EST PASSÉ — vérifié AVANT le retrait, et rendu à Arno :
 *   · le mobile et l'e-mail de chaque résultat → dans la FICHE, qu'un clic ouvre directement ;
 *   · la raison (« propriétaire du lot 219 ») → la suggestion porte l'adresse du bien, et la fiche dit le reste ;
 *   · l'avertissement « d'autres correspondent » → REPORTÉ DANS LA BARRE (décision d'Arno), parce que c'est une
 *     règle qu'il avait posée et qu'aucun écran ne doit perdre : une liste coupée le dit ;
 *   · la case « Afficher les archivées » → RETIRÉE, décision d'Arno. Mesure en base au moment du retrait : six
 *     propriétaires archivés, dont cinq AUSSI supprimés (donc hors de portée des deux chemins) ; la case ne
 *     changeait donc le résultat que pour UNE personne, une fiche d'essai. L'option `?archivees=1` reste
 *     INTACTE côté serveur — rien n'est supprimé du dépôt ni de la route.
 *
 * ⚠️ SEUL L'ÉTAT « AUCUNE FICHE OUVERTE » EST RECONSTRUIT. `?ecran=annuaire&fiche=bien-315&evenement=1` et tous
 * ses voisins passent par la branche `fiche !== null`, qui n'est pas touchée par ce lot.
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

type Fiche =
  | { etat: 'charge' }
  | { etat: 'erreur'; message: string }
  | { etat: 'proprietaire'; data: FicheProprietaire }
  | { etat: 'lot'; data: FicheLot }
  | { etat: 'locataire'; data: FicheLocataire };

/**
 * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — LA PHRASE D'EXPLICATION, AJUSTÉE À CE QUE LA RECHERCHE ACCEPTE VRAIMENT ══════
 *
 * Arno a donné une phrase et une consigne : « ajuste-la à ce que la recherche accepte réellement, sans rien
 * promettre de faux ». Sa version disait « par son nom, son adresse, son téléphone ou son e-mail ».
 *
 * 🔴 CE QUI A ÉTÉ AJOUTÉ, PARCE QUE C'EST VRAI : la COMMUNE et le NUMÉRO DE LOT — `analyserTerme` les lit tous
 * les deux, et `rechercherPersonnes` ramène par eux les propriétaires, les locataires en place ET les anciens
 * locataires du bien désigné. Les taire aurait caché une porte d'entrée qui existe.
 *
 * 🔴 CE QUI A ÉTÉ AJOUTÉ AUSSI : « un ancien locataire ». La recherche les rend, avec leur mot à eux ; promettre
 * seulement « un locataire » aurait laissé croire qu'un parti est introuvable.
 *
 * ⚠️ RIEN SUR LES ACCENTS NI LA CASSE, bien que ce soit vrai : Arno a autorisé le retrait de la ligne d'aide qui
 * le disait, et cette phrase-ci doit rester UNE phrase discrète.
 */
const PHRASE_ANNUAIRE = 'Retrouvez un propriétaire, un locataire ou un ancien locataire par son nom, '
  + 'une adresse, une commune, un téléphone, un e-mail ou un numéro de lot, et ouvrez directement sa fiche.';

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
  jetonHistorique = null, onPoserJeton, evenementVise = null,
}: {
  fiche: FicheUrl | null;
  onFiche: (f: FicheUrl | null) => void;
  onRetour: () => void;
  /**
   * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — l'adresse demande de se poser sur « Vie du bien » (`&bloc=vie`).
   * `false` (le défaut) = la fiche s'ouvre par le haut, exactement comme avant ce lot.
   */
  poserSurVie?: boolean;
  /**
   * 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — l'adresse demande de se poser sur UN ÉVÉNEMENT du bloc « Événements »
   * (`&evenement=<id>`). `null` (le défaut) = la fiche s'ouvre exactement comme avant ce lot.
   *
   * ⚠️ IL L'EMPORTE SUR `poserSurVie` quand les deux sont écrits : il est plus précis — il vise un événement, là
   * où l'autre vise un bloc. C'est la fiche qui tranche, et elle le dit ici plutôt que de laisser deux effets de
   * défilement se disputer la page.
   */
  evenementVise?: number | null;
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
  /**
   * ⚠️ UNE SEULE RÉFÉRENCE DE TEMPS POUR TOUT L'ÉCRAN, figée au montage : recalculer `new Date()` à chaque rendu
   * ferait glisser les « il y a 3 min » d'une ligne à l'autre, et l'on croirait à des mails différents.
   */
  const [refTemps] = useState(() => maintenant ?? new Date());
  /**
   * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — PLUS AUCUN ÉTAT DE RECHERCHE ICI ═══════════════════════════════════════════
   *
   * Vivaient là `terme`, `reponse` et `archivees`, plus la référence du champ : l'état d'une recherche que cet
   * écran menait lui-même. La barre partagée porte désormais le sien, et il n'en reste qu'un seul dans le module.
   *
   * 🔴 CE N'EST PAS UNE SIMPLIFICATION DE CONFORT : deux états de recherche voulaient deux débounces, deux
   * gestions d'annulation et deux classements — et c'est exactement par là que l'accueil et l'annuaire s'étaient
   * mis à ne plus trouver tout à fait les mêmes personnes.
   */
  const [detail, setDetail] = useState<Fiche | null>(null);
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

  /* ══ 🔴🔴 RETIRÉ LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ═══════════════════════════════════════════════════
     Ici vivait « LA RECHERCHE » de cet écran : un délai de frappe de 250 ms, un `fetch` vers
     `/api/admin/gestion/annuaire?q=…&archivees=1`, une annulation par drapeau `vivant`, et quatre états de
     réponse (repos / charge / erreur / sans_schema).

     🔴 CE N'EST PAS UNE FONCTION PERDUE, C'EST UNE SECONDE ÉCRITURE DE LA MÊME. `BarreAnnuaire` fait exactement
     cela — même route, même fonction serveur, même délai — et elle le fait pour les DEUX écrans. Garder celle-ci
     en dormance aurait été pire que la retirer : un chemin que personne n'emprunte finit par diverger de celui
     qui sert, et l'on corrige alors le mauvais.

     ⚠️ L'OPTION `?archivees=1` N'EST PAS SUPPRIMÉE : elle vit dans la route et dans `rechercherPersonnes`, où
     elle était déjà. C'est son seul APPELANT d'écran qui disparaît, sur décision d'Arno. */

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

      {/* ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — L'ÉTAT « AUCUNE FICHE OUVERTE », RECONSTRUIT ══════════════════════
          ARNO (07/10/2026) : « l'écran `?ecran=annuaire` est à reconstruire, minimal : (1) le titre “Annuaire”
          au même niveau et dans le même style que “Gestion” sur l'écran partagé, (2) une seule phrase discrète
          d'explication, (3) LE MÊME composant `BarreAnnuaire` que l'écran partagé — pas une copie —, avec le
          focus sur le champ à l'ouverture de l'écran. »

          🔴 LE TITRE EST CELUI DES PAGES D'ADMINISTRATION, pas un titre maison : `svv-page-head` /
          `svv-page-title` / `svv-page-sub` sont EXACTEMENT les classes de `EnTetePage`, celui qui écrit
          « Gestion » sur l'écran partagé. « Au même niveau et dans le même style » se tient par les MÊMES
          règles, jamais par une taille recopiée à l'œil qui aurait fini par diverger de la charte.

          ⚠️ POURQUOI ON LE RÉÉCRIT ICI AU LIEU DE RÉUTILISER `EnTetePage` : cet écran est un état du CLIENT
          (il change sans recharger la page), et l'en-tête de la page est rendu par un composant SERVEUR qui a
          déjà rendu « Gestion » — c'est pourquoi `GestionVue` le masque sur cet écran. On ne peut donc pas lui
          faire changer de titre ; on en pose un, avec ses classes.

          ⚠️ IL N'EST PAS MASQUÉ PAR LA RÈGLE DE `GestionVue` : celle-ci vise `.gst-page > .svv-page-head`, un
          enfant DIRECT de la page. Celui-ci vit dans `.ann`. */}
      {fiche === null ? (
        <header className="svv-page-head ann-tete-page">
          <div className="svv-page-head-ligne">
            <h1 className="svv-page-title">Annuaire</h1>
          </div>
          <p className="svv-page-sub">{PHRASE_ANNUAIRE}</p>
        </header>
      ) : (
        /* ══ 🔴🔴 LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE : UN RETOUR, ET LA RECHERCHE ════════════════════
            Arno, sur la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ». La
            fiche commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas — titre du module, sa
            description, le bandeau de relève, « Relève automatique », « Copie des pièces ». Ils sont retirés de
            CET écran (voir `GestionVue`), et restent là où ils servent : la page de la boîte.

            🔴 CE QU'ON GARDE, ET RIEN D'AUTRE : un fil de retour, et la recherche — parce qu'on cherche ici la
            personne SUIVANTE, pas la page où l'on est.

            ⚠️ LE « ← Retour » RESTE SUR UNE FICHE, et seulement là : Arno n'autorise son retrait que sur l'état
            « aucune fiche ouverte », où il n'avait plus de liste à rendre. Sur une fiche, il est le chemin de
            retour vers le mail ou la liste d'où l'on vient. */
        <div className="ann-entete">
          {/* 🔴🔴 LOT FLECHES-RETOUR — UN SEUL GESTE, CELUI DE TOUT LE MODULE.
              Avant ce lot, ce bouton connaissait deux destinations FIXES : la liste de l'annuaire quand une
              fiche était ouverte, la boîte sinon. Venu d'un mail, il ne rendait donc jamais le mail — constat
              d'Arno. `onRetour` est maintenant le retour commun : il rend la liste quand on y a ouvert la
              fiche, et le mail quand on vient d'un mail. La présentation du bouton ne change pas d'un pixel. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn ann-retour-haut"
            onClick={() => onRetour()}>
            ← Retour
          </button>
          {/* ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — LA MÊME BARRE, JUSQUE DANS L'EN-TÊTE D'UNE FICHE ═══════════
              Vivait là un `<input>` compact qui écrivait dans `terme`, et un lien « Voir les résultats pour
              “…” → » ramenait à la liste. La liste n'existe plus : ce lien aurait promis une page vide.

              🔴 LA BARRE PARTAGÉE REMPLIT LE MÊME BESOIN, et plus court : un clic sur une suggestion ouvre
              directement la fiche suivante, sans passer par une liste intermédiaire. Rien n'est devenu
              inatteignable — c'est le même chemin, avec une étape de moins.

              ⚠️ PAS DE FOCUS ICI : on arrive sur une fiche pour la LIRE. Prendre le clavier ferait sauter la
              page vers le haut à chaque ouverture. */}
          <div className="ann-barre-fiche">
            <BarreAnnuaire onFiche={onFiche} />
          </div>
        </div>
      )}

      {/* LA FICHE OUVERTE PREND LA PLACE DE LA BARRE — pas de colonne à côté : à 390 px il n'y en a pas deux. */}
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
                    /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — l'événement visé par le gros bouton de l'écran partagé. */
                    evenementVise={evenementVise}
                    filtreVie={filtreVie} onFiltreVie={setFiltreVie}
                    onDepart={(occupationId, sortie) => envoyer({ action: 'depart', occupationId, sortie })} />
                  : <VueLocataire f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique}
                    gestes={gestes} maintenant={refTemps} onOuvrirFil={onOuvrirFil}
                    onHistoriqueDuBien={ouvrirVieDuBien} onCreer={creerEtRattacher} />}
        </section>
      ) : (
        /**
         * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL, POINT 3 — LA MÊME BARRE QUE L'ÉCRAN PARTAGÉ ═══════════════════════
         *
         * 🔴 `focusAuMontage` : « le focus est sur le champ à l'ouverture de l'écran » (Arno). Cet écran n'a plus
         * que cette barre — y arriver sans pouvoir taper coûterait un clic pour rien. Sur l'écran partagé, où la
         * boîte mail prend le clavier, la même barre ne le demande pas : c'est l'écran qui décide, pas la barre.
         *
         * 🔴 ET AUCUN CADRE AUTOUR, contrairement à l'écran partagé : là-bas le cadre SÉPARE l'annuaire des deux
         * colonnes (lot ANNUAIRE-BLOC-DEDIE) ; ici il n'y a rien d'autre sur l'écran, et un cadre ne séparerait
         * la barre de rien.
         */
        <BarreAnnuaire onFiche={onFiche} focusAuMontage />
      )}
    </div>
  );
}

/* ══ 🔴🔴 RETIRÉ LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ═══════════════════════════════════════════════════
   Ici vivaient `Resultats`, `MOT_ROLE` et `LignePersonne` : la LISTE DE RÉSULTATS DÉTAILLÉE de cet écran — une
   ligne par personne, avec son nom, sa capsule de rôle, son premier mobile, son premier e-mail, ses biens en
   texte court (« +2 biens »), la raison de sa présence (« propriétaire du lot 219 »), le filet qui reliait deux
   voisines d'un même bien, le compteur « N personnes », la date du dernier import, l'avertissement de troncature
   et la case « Afficher les archivées ».

   🔴 LE RETRAIT A ÉTÉ VÉRIFIÉ AVANT D'ÊTRE FAIT, et rendu à Arno point par point, parce qu'il l'avait exigé :
     · LE MOTEUR EST LE MÊME. Cette liste et la barre partagée tapent la même route et la même fonction
       (`rechercherPersonnes(analyserTerme(q))`) : nom, prénom, adresse, commune, téléphone (espaces, points,
       +33), e-mail, numéro de lot, sans accent ni casse. Aucune personne trouvable ici ne devient introuvable.
     · LE MOBILE ET L'E-MAIL sont dans la FICHE, qu'un clic sur une suggestion ouvre directement.
     · LA RAISON : la suggestion porte l'adresse du bien ; la fiche dit le rôle et la période.
     · L'AVERTISSEMENT DE TRONCATURE EST REPORTÉ DANS LA BARRE (décision d'Arno du 07/10/2026). C'était le seul
       point qui contredisait une règle déjà posée — « une liste coupée le dit », mesurée le 26/09/2026 sur
       « puvis » (76 logements, 60 montrés, 16 disparus sans un mot). Voir `gst-annuaire-tronque`.
     · LA CASE « AFFICHER LES ARCHIVÉES » est retirée, décision d'Arno, mesure en main : six propriétaires
       archivés en base, dont cinq AUSSI supprimés — la case ne changeait le résultat que pour UNE fiche
       d'essai. ⚠️ L'OPTION SERVEUR `?archivees=1` ET `rechercherPersonnes(t, { avecArchivees })` SONT
       INTACTES : c'est l'appelant d'écran qui disparaît, pas la capacité.

   ⚠️ RIEN N'EST GARDÉ EN DORMANCE. Un composant que plus personne ne rend finit par diverger de celui qui sert,
   et l'on corrige alors le mauvais — c'est la règle déjà appliquée à `Contacts`, juste en dessous. */

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
  /* 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — LA RÈGLE N'EST PLUS ÉCRITE ICI : elle vit dans le module PUR
     `bienEnGestion`, que la barre Annuaire lit aussi pour compter les biens d'un propriétaire. Deux écritures de
     « en gestion » auraient fini par diverger — c'est la raison d'être du module, pas un rangement. */
  const enGestion = f.biens.filter(bienEnGestion);
  const anciens = f.biens.filter((b) => !bienEnGestion(b));
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

/* ══ 🔴🔴 RETIRÉ LE 07/10/2026 — `BlocOccupant`, LOT ANCIENS-LOCATAIRES-VIOLET ════════════════════════════════
   Il rendait un ancien locataire en FICHE DE LECTURE : nom, période, adresse, coordonnées avec « Copier ». Il
   était le seul endroit de l'écran où une personne de l'annuaire s'affichait sans crayon, sans menu « … », sans
   contacts et sans carte « + Ajouter ».

   ARNO (07/10/2026) : « Chaque ancien locataire est affiché avec EXACTEMENT le même composant de carte que
   “LOCATAIRE EN PLACE”. » C'est donc `BlocCartes` / `CartePersonne` qui le remplace, dans la rangée de chaque
   ancien locataire.

   🔴 RIEN DE CE QU'IL MONTRAIT N'EST PERDU, et c'est vérifiable ligne à ligne : le nom (titre de la rangée), la
   période (`motRangeeAncien`, sous le titre, et la ligne « Occupation » de la carte), l'adresse, les
   coordonnées groupées par type avec leurs boutons « Copier » (`lignesParType` + `BoutonCopier`, dans
   `CartePersonne`), et le lien « Sa fiche ». S'y ajoutent la qualité, la note, la mention « Importée le… », le
   crayon, le menu, les contacts et l'ajout — tout ce que la fiche de lecture ne savait pas faire.

   ⚠️ IL N'A AUCUN AUTRE APPELANT : vérifié dans tout le dépôt avant le retrait. */

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
  evenementVise,
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
  /** 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — l'événement du bloc « Événements » sur lequel se poser. */
  evenementVise?: number | null;
}) {
  /**
   * 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LA RÈGLE UNIQUE, ET NON `o.encours` LU À LA MAIN. Le verdict est le même
   * (le dépôt remplit déjà `encours` avec elle), mais il n'y a plus qu'un endroit où il est ÉCRIT.
   */
  const actuels = f.occupations.filter(estLocataireEnPlace);
  const passes = f.occupations.filter(estAncienLocataire);
  /**
   * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — « UNE RANGÉE PAR ANCIEN LOCATAIRE […] DU PLUS RÉCENT AU PLUS ANCIEN »
   * (Arno). L'ordre vient du MÊME comparateur que l'onglet « Anciens locataires (N) » de l'encart Parties
   * (`parDepartLePlusRecent`) : les deux listes nomment les mêmes personnes, elles ne peuvent pas les ranger
   * autrement l'une que l'autre.
   *
   * ⚠️ UNE RANGÉE PAR **OCCUPATION**, et non par personne : une même personne qui a occupé deux fois le logement
   * a deux séjours, et c'est le séjour qu'on vient lire. Sa CARTE, elle, est unique (le dépôt dédoublonne) — elle
   * paraît donc identique dans les deux rangées, avec ses contacts, ce qui est exact.
   */
  const anciens = [...passes].sort((a, b) => parDepartLePlusRecent(
    { sortie: a.sortie, entree: a.entree, nom: a.nom },
    { sortie: b.sortie, entree: b.entree, nom: b.nom }));
  /**
   * ══ 🔴🔴 « N OCCUPANTS DU MÊME BAIL » N'EST PAS PERDU — IL A CHANGÉ DE FORME ═══════════════════════════════════
   *
   * Avant ce lot, les occupations passées étaient GROUPÉES par période, et le groupe portait la mention
   * « 2 occupants du même bail ». Arno demande maintenant « une rangée par ancien locataire » : le groupe n'a
   * plus d'enveloppe où écrire sa mention.
   *
   * 🔴 ALORS LA MENTION DESCEND DANS LA RANGÉE, et dit la même chose en nommant les gens : « même bail que
   * MARTIN Léa ». Elle en dit même un peu plus — l'ancienne forme donnait un NOMBRE, celle-ci donne les NOMS.
   * Rien n'est retiré, et c'est `grouperParPeriode`, la fonction d'avant, qui la calcule : la clé du groupe est
   * toujours la PAIRE de dates, et rien d'autre.
   *
   * ⚠️ MESURÉ LE 29/09/2026 ET REVÉRIFIÉ : aucun couple (lot, date d'entrée) n'est porté par deux personnes dans
   * la base. Cette mention ne s'affiche donc nulle part aujourd'hui — elle existe pour le jour où l'étape C crée
   * un bail à deux, exactement comme le groupement qu'elle remplace.
   */
  const coOccupants = new Map<number, string[]>();
  for (const groupe of grouperParPeriode(anciens)) {
    for (const o of groupe) {
      coOccupants.set(o.occupationId, groupe.filter((x) => x.occupationId !== o.occupationId).map((x) => x.nom));
    }
  }

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DES DEUX CARROUSELS ════════════════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DÉCISION D'ARNO (05/10/2026) : « le “+” sert à enrichir le carrousel de la partie concernée. Les cartes de
   * contact s'affichent donc dans les carrousels du haut de fiche. »
   *
   * 🔴 ELLES VIENNENT DE LA MÊME ROUTE QUE LE BLOC DU BAS, et c'est tout l'intérêt : une seule lecture, une seule
   * vérité. Le bloc « Historique du bien » lit déjà `/api/admin/gestion/historique/parties` pour ses capsules et
   * ses pastilles ; le haut de la fiche y lit maintenant les mêmes cartes. Deux lectures différentes auraient fini
   * par montrer deux listes — et c'est celle qu'on regarde le moins qui aurait gardé le faux.
   *
   * 🔴 ET LA SYNCHRONISATION PASSE PAR LE SIGNAL, pas par un rappel de plus. Arno demande une « SYNCHRONISATION
   * TOTALE […] que ce soit depuis le haut ou depuis le bas ». Un rappel devrait traverser six composants dans un
   * sens et six dans l'autre ; le signal n'a qu'une règle — qui AFFICHE s'abonne, qui CHANGE annonce.
   *
   * ⚠️ EN ÉCHEC, LES DEUX CARROUSELS SONT CEUX D'AVANT CE LOT : liste vide, aucune carte de contact, et les
   * cartes CLIENTS intactes. Un carrousel qui refuserait de s'afficher parce qu'une lecture d'appoint a échoué
   * serait pire que deux cartes manquantes.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [cartesContact, setCartesContact] = useState<readonly CarteDeContact[]>([]);
  const relireCartes = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/admin/gestion/historique/parties?cible=lot-${encodeURIComponent(f.numero)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as { data?: { cartes?: CarteDeContact[] } };
      setCartesContact(d.data?.cartes ?? []);
    } catch {
      setCartesContact([]);
    }
  }, [f.numero]);
  useEffect(() => { void relireCartes(); }, [relireCartes]);
  /**
   * 🔴 L'ABONNEMENT : un geste fait DANS LE BLOC DU BAS met le haut à jour, sans que l'un connaisse l'autre.
   *
   * ⚠️ LE HAUT EST AUSSI ÉMETTEUR, et il s'épargne donc lui-même (`sauf`) : sans cela, vérifier une carte
   * depuis un carrousel relirait DEUX FOIS — une fois parce qu'on vient d'écrire, une fois parce qu'on
   * s'entend. Le marqueur est l'auditeur lui-même, et non un numéro de tour : les auditeurs sont prévenus
   * PENDANT l'annonce, et un numéro rangé après arriverait toujours trop tard.
   */
  const monEcoute = useRef<((s: SignalCartesContact) => void) | null>(null);
  useEffect(() => {
    const g = (sig: SignalCartesContact): void => {
      if (concerneCeBien(sig, f.numero)) void relireCartes();
    };
    monEcoute.current = g;
    return ecouterCartesContact(g);
  }, [f.numero, relireCartes]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 1 — SEULES LES CARTES **CRÉÉES** MONTENT ════════════════════════════════
   *
   * RÈGLE D'ARNO : « Les cartes pré-remplies automatiquement (lots 1 et 2, environ 485) ne sont PLUS affichées
   * dans les carrousels du haut. Elles deviennent de simples PRÉ-REMPLISSAGES du formulaire du “+”. »
   *
   * 🔴 MESURÉ AVANT D'ÊTRE ÉCRIT : 481 cartes `auto` sur 162 biens quittent les carrousels ; 4 cartes `manuel`
   * sur 3 biens y restent. Le bien le plus touché est le 155 (−55 cartes), puis le 234 (−20) et le 54 (−17).
   * Aucune des 481 n'avait été vérifiée par un humain : la règle n'a donc aucune exception à traiter.
   *
   * ⚠️ `carteMonteAuCarrousel` EST LE SEUL JUGE, et il vit dans le module pur : le compteur « + N contacts » et
   * la pastille de la capsule l'appellent aussi. Un filtre écrit ici et un autre là-bas auraient fini par
   * diverger — et c'est le carrousel qui aurait gardé une carte que la capsule croyait absente.
   */
  const cartesCreees = cartesContact.filter(carteMonteAuCarrousel);
  const contactsProprietaire = cartesCreees.filter((c) => c.cote === 'proprietaire');
  const contactsLocataire = cartesCreees.filter((c) => c.cote === 'locataire');
  /**
   * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LES CONTACTS D'UN ANCIEN LOCATAIRE PRÉCIS.
   *
   * Arno : « Le contact ajouté est rattaché à l'ancien locataire, pas au locataire actuel ni au bien en
   * général. » Les deux conditions disent exactement cela : le CÔTÉ (ce n'est pas un contact du locataire en
   * place) et la PERSONNE (ce n'est pas celui d'un autre ancien). La base tient la même équivalence.
   */
  const contactsDeLAncien = (locataireId: number): CarteDeContact[] =>
    cartesCreees.filter((c) => c.cote === 'ancien_locataire' && c.locataireId === locataireId);

  /**
   * 🔴🔴 LES TROIS GESTES, PAR LA MÊME PORTE QUE LE « + » DU BLOC DU BAS — et le signal après chacun.
   *
   * ⚠️ ON RELIT APRÈS, PLUTÔT QUE DE DEVINER LE NOUVEL ÉTAT. Poser le changement dans l'état local aurait
   * affiché un geste que le serveur a peut-être refusé en partie — et c'est la convention de ce module depuis le
   * lot 3 (« on relit, on ne devine pas »).
   */
  const gesteDeCarte = useCallback(async (corps: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') return d.motif ?? 'Le geste n’a pas pu être enregistré.';
      await relireCartes();
      /* 🔴 ET ON PRÉVIENT L'AUTRE ENDROIT : c'est ce qui rend la synchronisation « totale » qu'Arno demande. */
      annoncerCartesContact(f.numero, { sauf: monEcoute.current ?? undefined });
      return null;
    } catch {
      return 'Le geste n’a pas pu être enregistré : le réseau n’a pas répondu.';
    }
  }, [f.numero, relireCartes]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — CRÉER UN CONTACT DEPUIS LE CARROUSEL ════════════════════════════════
   *
   * DEMANDE D'ARNO : « Le choix contact ouvre le formulaire de contact du lot 8. »
   *
   * 🔴 L'IDENTITÉ VIENT DU PREMIER E-MAIL DE LA LISTE, et il n'y a pas d'autre source possible : créée depuis le
   * BLOC, une carte prend l'adresse de la capsule d'où l'on clique ; créée depuis le CARROUSEL, il n'y a pas de
   * capsule. Le module pur tranche (`premierEmail`), et le formulaire garantit qu'il y en a un —
   * `manquesDuContact` exige au moins une adresse e-mail.
   *
   * 🔴 LA MÊME PORTE D'ÉCRITURE QUE LE « + » DU BLOC, à la lettre : un POST « ranger » qui pose la catégorie ET
   * la carte. Un second chemin aurait fini par écrire deux règles — et c'est exactement ce que le lot 7 avait
   * fermé.
   *
   * ⚠️ LA CATÉGORIE EST LE CÔTÉ DU CARROUSEL, et elle n'est pas demandée : on vient de cliquer « Contact du
   * propriétaire » sous le carrousel du propriétaire. Reposer la question aurait été une question dont l'écran
   * connaît la réponse — le reproche qu'Arno nous a déjà fait au lot 6.
   */
  const creerContact = useCallback(async (
    cote: 'proprietaire' | 'locataire', champs: ChampsSaisis,
  ): Promise<string | null> => {
    const fiche = ficheAEnvoyer(champs);
    const adresse = premierEmail(fiche.coordonnees);
    if (adresse === null) return 'Il faut au moins une adresse e-mail : c’est elle qui identifie le contact.';
    return gesteDeCarte({ cible: `lot-${f.numero}`, adresse, categorie: cote, ...fiche });
  }, [f.numero, gesteDeCarte]);

  /**
   * ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — CRÉER UN CONTACT **D'UN ANCIEN LOCATAIRE** ════════════════════════════
   *
   * Arno : « par le même formulaire et la même logique d'enregistrement que pour le locataire en place ».
   *
   * 🔴 C'EST LITTÉRALEMENT LA MÊME PORTE : `gesteDeCarte`, le POST « ranger » qui pose la catégorie ET la carte.
   * Un second chemin d'écriture aurait fini par écrire deux règles — c'est ce que le lot HISTORIQUE-BIEN-7 avait
   * fermé, et il n'y a aucune raison de le rouvrir pour un côté de plus.
   *
   * 🔴 LA SEULE DIFFÉRENCE EST `locataireId`, et c'est tout l'objet du lot : il dit DE QUI ce contact est le
   * contact. Le serveur refuse la catégorie sans la personne, et la personne sans la catégorie.
   */
  const creerContactAncien = useCallback(async (
    locataireId: number, champs: ChampsSaisis,
  ): Promise<string | null> => {
    const fiche = ficheAEnvoyer(champs);
    const adresse = premierEmail(fiche.coordonnees);
    if (adresse === null) return 'Il faut au moins une adresse e-mail : c’est elle qui identifie le contact.';
    return gesteDeCarte({
      cible: `lot-${f.numero}`, adresse, categorie: 'ancien_locataire', locataireId, ...fiche,
    });
  }, [f.numero, gesteDeCarte]);

  const gestesContact = {
    modifiable: gestes.modifiable,
    onVerifier: (id: number) => gesteDeCarte({ action: 'verifier', id }),
    onRetirer: (id: number) => gesteDeCarte({ action: 'retirer', id }),
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE CRAYON ENVOIE LA FICHE COMPLÈTE, par la MÊME porte qu'avant.
     *
     * ⚠️ `ficheAEnvoyer` (module PUR) est la SEULE traduction, et c'est la même que celle du « + » du bloc du
     * bas : elle vide-à-`null` les champs blancs et garde l'ORDRE AFFICHÉ des coordonnées. Écrire ici une
     * seconde version aurait divergé au premier champ ajouté — l'un l'enverrait, l'autre l'oublierait.
     */
    onModifier: (id: number, champs: ChampsSaisis) =>
      gesteDeCarte({ action: 'modifier', id, ...ficheAEnvoyer(champs) }),
    /* « Changer de côté » et « Passer en tiers indépendant » : un RANGEMENT, par la porte du rangement. */
    onRanger: (adresse: string, categorie: 'proprietaire' | 'locataire' | 'independant') =>
      gesteDeCarte({ cible: `lot-${f.numero}`, adresse, categorie }),
    onEcrire,
  };

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
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 2 — « Historique des locataires » est REPLIÉ au départ. Arno : la fiche
   * s'ouvre sur ce qui sert aujourd'hui — le propriétaire, l'occupant en place, puis le moteur de recherche. Un
   * historique de baux déplié repoussait tout cela d'un écran, et on le lit une fois par trimestre.
   */
  const [histoLocOuvert, setHistoLocOuvert] = useState(false);
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
        /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — les cartes « CONTACT DU PROPRIÉTAIRE », après les clients. */
        contacts={contactsProprietaire} gestesContact={gestesContact}
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
        }}
        /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — le choix « client ou contact », côté propriétaire. */
        creationContact={{
          motClient: 'Propriétaire (client)',
          motContact: LIBELLE_CONTACT_PROPRIETAIRE_COURT,
          rappel: `Rangé comme contact du propriétaire du lot ${f.numero}.`,
          onCreer: (champs) => creerContact('proprietaire', champs),
        }} />

      {/* ══ 🔴 LES OCCUPANTS EN PLACE, EN CARTES — chacun avec ses dates et « Enregistrer un départ » ══════════════
          Arno : « LOCATAIRE(S) EN PLACE : tous les occupants du même bail […] avec coordonnées complètes, date
          d'entrée et liens vers leur fiche » ; et pour l'étape C : « enregistrer un départ (date de sortie →
          historique), enregistrer un nouveau locataire (date d'entrée) ». */}
      <BlocCartes titre={`Locataire${actuels.length > 1 ? 's' : ''} en place`} id="ann-occ"
        personnes={f.occupants} role="En place" motAjouter="Ajouter un occupant" gestes={gestes}
        /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — les cartes « CONTACT DU LOCATAIRE », après les clients. */
        contacts={contactsLocataire} gestesContact={gestesContact}
        creation={{
          rappel: `Sera ajouté comme occupant du lot ${f.numero}.`,
          onCreer: (champs) => onCreer('locataire', [f.id], champs),
        }}
        /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — le choix « client ou contact », côté locataire. */
        creationContact={{
          motClient: 'Occupant (client)',
          motContact: LIBELLE_CONTACT_LOCATAIRE_COURT,
          rappel: `Rangé comme contact du locataire du lot ${f.numero}.`,
          onCreer: (champs) => creerContact('locataire', champs),
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
      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 2 — REPLIÉ PAR DÉFAUT, SUR UNE SEULE LIGNE ═══════════════════════
          DEMANDE D'ARNO (05/10/2026) : « REPLIÉ PAR DÉFAUT sur une seule ligne (“Historique des locataires · 2
          ▸”), qui se déplie au clic. Contenu inchangé une fois ouvert. »

          🔴 LA MÊME GRAMMAIRE DE REPLI QUE « ANCIENS BIENS », À QUELQUES LIGNES D'ICI : bouton `type="button"`
          portant `aria-expanded`, triangle « ▸ » en `aria-hidden` tourné de 90° quand c'est ouvert, titre et
          pastille `gst-compte` DANS le bouton, contenu monté conditionnellement. Inventer un second mécanisme
          de repli dans le même écran aurait donné deux triangles qui ne se ressemblent pas.

          🔴 L'IDENTIFIANT `ann-histo-loc` RESTE, ET IL PASSE SUR LE BOUTON. C'est lui que la section désigne
          par `aria-labelledby` — le bouton est désormais l'étiquette du bloc —, et c'est lui que le garde
          d'ordre des blocs de la fiche cherche (`HistoriqueDuBien.test.ts`). Le perdre aurait cassé les deux.

          ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET, POINT 1 — LE CONTENU DEVIENT DE VRAIES CARTES ═══════════════
          DEMANDE D'ARNO (07/10/2026) : « Chaque ancien locataire est affiché avec EXACTEMENT le même composant
          de carte que “LOCATAIRE EN PLACE” […] Chaque ancien locataire a sa propre carte “+ Ajouter un
          contact” […] une rangée par ancien locataire, du plus récent au plus ancien. »

          🔴 CE QUE CELA REMPLACE, ET POURQUOI CE N'EST PAS UN RETRAIT. Le bloc rendait un `BlocOccupant` : une
          fiche de LECTURE, sans crayon, sans menu, sans contacts, sans ajout. Tout ce qu'il montrait est
          toujours montré — nom, période, adresse, coordonnées avec « Copier » — mais par le composant des
          cartes, qui en montre davantage et laisse MODIFIER. `BlocOccupant` n'est donc plus monté ici ; son
          encadré de retrait est resté à sa définition, avec la date et la raison.

          🔴 LE TITRE, LE REPLI ET LE COMPTEUR NE BOUGENT PAS D'UN CARACTÈRE (Arno : « Le titre “HISTORIQUE DES
          LOCATAIRES N” reste, repliable comme aujourd'hui »). Son liseré passe au violet — c'est la seule
          retouche de l'en-tête. */}
      <section className="ann-bloc ann-bloc--ancien" aria-labelledby="ann-histo-loc">
        <button type="button" className="ann-repli ann-repli--ancien" id="ann-histo-loc"
          aria-expanded={histoLocOuvert} onClick={() => setHistoLocOuvert((v) => !v)}>
          <span aria-hidden="true"
            className={`ann-repli-triangle${histoLocOuvert ? ' ann-repli-triangle--ouvert' : ''}`}>▸</span>
          Historique des locataires <span className="gst-compte">{passes.length}</span>
        </button>
        {histoLocOuvert && (anciens.length === 0
          ? <p className="ann-gris">Aucun locataire passé connu.</p>
          : anciens.map((o) => {
            /**
             * 🔴 LA CARTE DE CETTE PERSONNE, prise dans la MÊME liste que les occupants en place
             * (`personnesDe('locataire', …)`, dépôt). Absente ⇒ la personne a été archivée ou supprimée de
             * l'annuaire : on rend la rangée SANS carte client plutôt que de taire le séjour, et ses contacts
             * restent atteignables. Un séjour qui disparaîtrait parce qu'une fiche manque serait un trou dans
             * l'historique du bien.
             */
            const carte = f.anciensOccupants.filter((p) => p.id === o.locataireId);
            return (
              <BlocCartes key={`anc-${o.occupationId}`} titre={o.nom}
                id={`ann-ancien-${o.occupationId}`}
                /* 🔴 LA PÉRIODE SOUS LE NOM, écrite par `periodeOccupation` — la MÊME fonction que la ligne de
                   l'encart Parties et que l'ancienne fiche de lecture. Une seconde mise en forme des dates
                   aurait fini par dire autrement la même période, et cet écart-là se recopie dans un courrier. */
                sousTitre={motRangeeAncien(o, coOccupants.get(o.occupationId) ?? [])}
                personnes={carte} role="Parti" motAjouter="Ajouter un contact" gestes={gestes}
                /* 🔴🔴 SES CONTACTS À LUI, et à personne d'autre : la carte porte `locataireId`, et c'est la
                   base qui garantit qu'une carte d'ancien locataire en porte un (migration 318). */
                contacts={contactsDeLAncien(o.locataireId)} gestesContact={gestesContact}
                /* 🔴 AUCUNE `creation` : on n'ajoute pas un OCCUPANT à un bail terminé. La tuile ouvre donc
                   directement le formulaire de contact — voir `auClic` dans `BlocCartes`. */
                creationContact={{
                  motClient: 'Occupant (client)',
                  motContact: LIBELLE_CONTACT_LOCATAIRE_COURT,
                  rappel: `Rangé comme contact de ${o.nom}, ancien locataire du lot ${f.numero}.`,
                  onCreer: (champs) => creerContactAncien(o.locataireId, champs),
                }}
                teinte="violet"
                dessous={(p) => (
                  <>
                    <LigneFiche libelle="Entré le">
                      {o.entree === null
                        ? <span className="cp-rien">non renseignée</span> : formaterDateIso(o.entree)}
                    </LigneFiche>
                    <LigneFiche libelle="Sa fiche">
                      <button type="button" className="cp-lien" onClick={() => ouvrir('locataire', p.id)}>
                        Ouvrir la fiche du locataire →
                      </button>
                    </LigneFiche>
                    {/* 🔴 À LA PLACE DE « Départ : Enregistrer un départ… » (Arno) : la période, déjà connue.
                        Rien n'est recalculé — `o.entree` et `o.sortie` viennent de la même occupation. */}
                    <LigneFiche libelle="Occupation">{periodeOccupation(o.entree, o.sortie)}</LigneFiche>
                  </>
                )} />
            );
          }))}
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
      {/**
        * ══ 🔴🔴 LOT MONGA-2, POINT 4 — LE BLOC « ÉVÉNEMENTS », JUSTE AU-DESSUS DU MOTEUR HISTORIQUE ═══════════
        *
        * Arno : « un bloc “Événements” placé juste au-dessus du moteur Historique. Les événements en cours sont
        * dépliés avec leur frise, les clos sont repliés. Rien d'autre ne bouge dans la fiche. »
        *
        * 🔴 IL EST POSÉ **HORS** DE `ancreVie`, ET C'EST VOULU. Cette enveloppe est la cible de `?bloc=vie` et
        * du cartouche « Événement en cours » : y glisser un second bloc ferait viser le défilement au-dessus du
        * moteur, et la promesse « on arrive sur l'historique » cesserait de tenir.
        *
        * ⚠️ IL NE REND RIEN SUR UN BIEN SANS ÉVÉNEMENT — pas même un conteneur vide. C'est ce qui garde à la
        * fiche son empreinte exacte d'avant ce lot, et c'est éprouvé (`EvenementsDuBien` rend `null`).
        */}
      <EvenementsDuBien lotCle={f.numero} onOuvrirFil={onOuvrirFil} evenementVise={evenementVise} />

      <div ref={ancreVie}>
        <HistoriqueDuBien
          key={filtreVie}
          lotCle={f.numero}
          maintenant={maintenant}
          occupations={occupationsPourHistorique(f)}
          categories={categoriesDeLaFiche(f)}
          periodes={periodesDesParties(f)}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — les CLIENTS du bien, pour que leur capsule existe meme a 0 mail. */
          clients={clientsDesParties(f)}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — les cartes de locataire, pour qu'un seul locataire a la fois
             peuple l'encart. Sans elles le bloc rend exactement ce qu'il rendait avant ce lot. */
          cartesLocataires={cartesLocatairesDuBien(f)}
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
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — LES CARTES DE LOCATAIRE, UNE PAR OCCUPATION ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, lot-146) : « L'encart affiche “Locataire 6” : il mêle le locataire en place et les
 * adresses des anciens. » Vérifié en base, il a raison à l'unité — le bien 104 porte TROIS occupations de deux
 * adresses chacune, et `clientsDesParties` + les interlocuteurs les versaient toutes dans le même encart.
 *
 * 🔴 CE QUE CETTE FONCTION APPORTE, ET QUE RIEN D'AUTRE NE PORTAIT : le lien ADRESSE → OCCUPATION. `periodesDesParties`
 * juste au-dessus donne déjà la période d'une adresse, mais pas l'identité de la tranche qui la porte : deux
 * occupants d'un même bail y sont indistinguables de deux baux de mêmes dates, et surtout rien ne dit QUELLE
 * carte choisir. Le bloc a besoin de la carte entière — son nom, ses bornes, et la liste de SES adresses.
 *
 * ⚠️ UNE CARTE PAR OCCUPATION, PAS PAR BAIL. `grouperParPeriode` plus bas regroupe par dates pour l'affichage du
 * haut de fiche ; ici on garde le grain de la base, parce que c'est lui qui porte `occupationId` — la clé qui
 * survit à un ré-import. Deux occupants d'un même bail donnent donc deux lignes « Anciens locataires », ce qui
 * est exact et lisible (« du 06/02/2025 au 22/10/2025 » deux fois, un nom chacun) ; les fondre aurait demandé
 * d'inventer un libellé de foyer que la base ne porte pas. En revanche les occupants EN PLACE sont pris
 * ENSEMBLE par le moteur (`locatairesEnPlace`), donc un couple en place garde bien ses deux séries d'adresses.
 *
 * ⚠️ SEULES LES ADRESSES E-MAIL : l'encart ne range que des adresses. Un téléphone n'y a pas de capsule, et le
 * compter dans « N adresses » aurait annoncé un nombre que l'écran ne montre pas.
 *
 * ⚠️ EN MINUSCULES, comme `periodesDesParties` et `categoriesDesParties` : le moteur compare des clés canoniques.
 * Une comparaison sensible à la casse aurait caché la capsule de « Jean.PONS@… » dès qu'un ancien est choisi.
 * PUR.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function cartesLocatairesDuBien(f: FicheLot): CarteLocataireBien[] {
  return f.occupations.map((o) => ({
    cle: `occ-${o.occupationId}`,
    libelle: o.nom,
    depuis: o.entree,
    jusqua: o.sortie,
    enPlace: o.encours,
    adresses: o.contacts
      .filter((c) => c.sorte === 'email')
      .map((c) => c.valeur.trim().toLowerCase())
      .filter((a) => a !== ''),
  }));
}

/* ══ 🔴🔴 DESCENDU LE 07/10/2026 DANS LE MODULE PUR — LOT PJ-STATUT-ENVOI-FAMILLES ═══════════════════════════════
   Vivait ici `categoriesDesParties(f)` : la moitié « fiche » du calcul qui remplit le bloc PARTIES — les
   propriétaires donnent « Propriétaire », les occupants et les anciens donnent « Locataire ».

   🔴 ELLE ÉTAIT DANS UN COMPOSANT DE NAVIGATEUR, donc inaccessible à tout autre écran sans la recopier. Arno
   demande que les capsules des miniatures de pièces lisent « EXACTEMENT le même calcul que celui qui remplit ce
   bloc » : elle est donc devenue `categoriesDeLaFiche`, dans `app/lib/gestion/familleDestinataire.ts`, et c'est
   la MÊME fonction que la fiche et la fenêtre des pièces appellent. Son commentaire l'a suivie, mot pour mot. */


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
/**
 * ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LA LIGNE SOUS LE NOM D'UN ANCIEN LOCATAIRE. PURE. ═══════════════════════
 *
 * La PÉRIODE, écrite par `periodeOccupation` — la MÊME fonction que l'encart Parties et que la fiche de lecture
 * d'avant ce lot. Une seconde mise en forme des dates aurait fini par dire autrement la même période, et cet
 * écart-là se recopie dans un courrier.
 *
 * Puis, s'il y en a, les CO-OCCUPANTS du même bail : c'est ce que disait « 2 occupants du même bail » avant que
 * chaque ancien locataire ait sa propre rangée. Voir l'encadré de `coOccupants`.
 */
function motRangeeAncien(o: OccupationDuLot, coOccupants: readonly string[]): string {
  const periode = periodeOccupation(o.entree, o.sortie);
  return coOccupants.length === 0 ? periode : `${periode} · même bail que ${coOccupants.join(', ')}`;
}

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
  /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LA RÈGLE UNIQUE, ici aussi : « ancien » se décide au MÊME endroit que
     la couleur d'un mail, la capsule d'une pièce jointe et le bloc de la fiche du bien. */
  const enCours = f.logements.filter(estLocataireEnPlace);
  const passes = f.logements.filter(estAncienLocataire);
  /** Le logement dont on montre les échanges : celui qu'il occupe. Le plus récent s'il en occupe plusieurs. */
  const logementDesMails = enCours[0] ?? null;
  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.nom}</h3>
          <p className="ann-tete-sous">
            {/* ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — « L'Annuaire : la capsule “Ancien locataire” (aujourd'hui
                verte) passe en violet » (Arno). Le MOT ne change pas d'un caractère ; seul le ton suit la même
                règle que partout ailleurs. Et le mot reste : une couleur seule ne se lit ni en niveaux de gris,
                ni au lecteur d'écran — règle transverse du module. */}
            <span className={`ann-role-capsule${enCours.length > 0 ? '' : ' ann-role-capsule--ancien'}`}>
              {enCours.length > 0 ? 'Locataire en place' : 'Ancien locataire'}
            </span>
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
/* ══ LOT ECRAN-ANNUAIRE-MINIMAL — L'EN-TETE DE L'ECRAN, AU NIVEAU DE CELUI DE « Gestion » ══
   Les classes svv-page-* font tout le travail : ce sont celles de EnTetePage, l'en-tete standard des pages
   d'administration. On ne regle ici que la marge basse, parce que cet en-tete-la est suivi d'une barre de
   recherche et non du corps d'une page.
   RETIRE AVEC LA RECHERCHE DE CET ECRAN : .ann-titre, .ann-chercher, .ann-label, .ann-aide, .ann-compte,
   .ann-champ--compact, .ann-bascule, .ann-personnes et toute la famille .ann-pers-* — plus rien ne les rend.
   .ann-champ RESTE : VieDuBien et HistoriqueDuBien s'en servent pour leurs propres champs.
   AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.ann-tete-page{margin:0 0 .25rem}
/* La barre partagee dans l'en-tete d'une fiche : elle prend la place qui reste, sans pousser la fiche vers le
   bas. C'est l'ancien reglage du champ compact, applique a l'enveloppe de la barre. */
.ann-barre-fiche{flex:1 1 16rem;min-width:0}
.ann-champ{min-height:44px;padding:.5rem .7rem;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.95rem;width:100%}
.ann-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
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
/* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LA CAPSULE « ANCIEN LOCATAIRE ». Fond pale, texte violet fonce : la paire
   tamisee du theme (lot 84), mesuree 5,48:1 en Clair et 7,74:1 en Sombre. */
.ann-role-capsule--ancien{color:var(--color-svv-violet);background:var(--color-svv-violet-soft);
  border-color:var(--color-svv-violet)}
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
/* ══ 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LE LISERE DU TITRE « HISTORIQUE DES LOCATAIRES » ══════════════════════
   ARNO : « Le lisere du titre HISTORIQUE DES LOCATAIRES passe en violet. »
   Le titre est un BOUTON de repli (il n'a donc pas le ::before des titres de bloc) : on le lui pose ici, de la
   meme largeur et du meme arrondi que celui des autres titres de la fiche. Son triangle suit la meme couleur :
   deux rouges et un violet dans la meme ligne se liraient comme une erreur. */
.ann-repli--ancien::before{content:"";flex:0 0 auto;width:3px;height:1em;border-radius:2px;
  background:var(--color-svv-violet)}
.ann-repli--ancien{color:var(--color-svv-violet)}
.ann-repli--ancien:hover{color:var(--color-svv-violet)}
.ann-repli--ancien .ann-repli-triangle{color:var(--color-svv-violet)}
.ann-discret{margin:.2rem 0 0}
/* ══ LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE, ET LES CARTES DE BIENS ════════════════════════════════════════
   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
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
/* ══ 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LE LISERE DU TITRE « HISTORIQUE DES LOCATAIRES » ══════════════════════
   ARNO : « Le lisere du titre HISTORIQUE DES LOCATAIRES passe en violet. »
   Le titre est un BOUTON de repli (il n'a donc pas le ::before des titres de bloc) : on le lui pose ici, de la
   meme largeur et du meme arrondi que celui des autres titres de la fiche. Son triangle suit la meme couleur :
   deux rouges et un violet dans la meme ligne se liraient comme une erreur. */
.ann-repli--ancien::before{content:"";flex:0 0 auto;width:3px;height:1em;border-radius:2px;
  background:var(--color-svv-violet)}
.ann-repli--ancien{color:var(--color-svv-violet)}
.ann-repli--ancien:hover{color:var(--color-svv-violet)}
.ann-repli--ancien .ann-repli-triangle{color:var(--color-svv-violet)}
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

/* ══ RETIRE LE 07/10/2026 — LOT ECRAN-ANNUAIRE-MINIMAL ══
   Vivait ici toute la famille .ann-personnes / .ann-pers-* : la ligne de resultat, sa capsule de role, sa ligne
   grise de coordonnees, son filet de groupe, son pied, et la case des archivees. Plus rien ne les rend — la
   liste de resultats de cet ecran a laisse la place a la barre partagee, qui a sa propre feuille.
   AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */

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
