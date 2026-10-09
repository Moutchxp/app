'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
/**
 * ══ 🔴🔴 LES DEUX COMPOSANTS SONT **IMPORTÉS**, JAMAIS RECOPIÉS ═══════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026), mot pour mot : « LE FIL : même présentation que les mails de “Vie du bien”.
 * **RÉUTILISE ce composant, ne le recopie pas.** » Et pour les pièces : « en MINIATURES (**réutilise le composant
 * de miniature des mails** : œil, téléchargement, picto Drive vert). »
 *
 * 🔴 LA RECOPIE ÉTAIT LE PIÈGE, ET CE DÉPÔT L'A DÉJÀ PAYÉ PLUSIEURS FOIS (deux listes de domaines, deux règles de
 * repli, trois listes de types d'images). Deux rendus d'une même ligne de courrier divergent au premier
 * ajustement — et c'est celui qu'on regarde le moins qui garde l'erreur. `LigneVie` et `CartePieceConversation`
 * ont donc reçu un `export` (et RIEN d'autre : ni une classe, ni une prop, ni une virgule du corps), et ce bloc
 * les appelle tels quels. Le garde `HistoriqueDuBien.test.ts` vérifie que l'import existe et qu'aucune de leurs
 * balises n'a été redessinée ici.
 */
import { CSS_VIE_DU_BIEN, LigneVie } from './VieDuBien';
/* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — quelles adresses expliquent la correspondance, et sous quel rôle.
   Module PUR : l'écran ne décide ni du rôle, ni de son mot, ni de l'ordre d'affichage. */
import { adressesTrouvees } from '../../../../lib/gestion/rechercheAdresses';
import { CartePieceConversation, CSS_PIECES_CONVERSATION, type GestesPiece } from './PiecesDeLaConversation';
import { CSS_PIECES, type DepotAffiche } from './PiecesJointes';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
/* 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — la frise chronologique de la vie du bien. */
import { CSS_FRISE_DU_BIEN, FriseDuBien } from './FriseDuBien';
/* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — LA fenêtre des biens d'un mail, montée en mode PONCTUEL. Le même
   composant que « Visualiser / Modifier » et « Classer » : aucune copie, aucune seconde fenêtre à corriger. */
import { RattachementsDuFil } from './RattachementsDuFil';
import type { MailDeLaFrise } from '../../../../lib/gestion/friseBien';
import type { PieceCitable } from '../../../../lib/gestion/piecesCitees';
/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — LA VISIONNEUSE MAISON, IMPORTÉE ET NON RECOPIÉE. C'est le composant que
   la conversation, l'éditeur de mail et la fenêtre Drive montent déjà. */
import { ApercuFichierDrive } from './ApercuFichierDrive';
import {
  dossierDeLEmplacement, PIECES_DRIVE_MAX, type EmplacementPiece, type StatutPieceDrive,
} from '../../../../lib/gestion/pieceDansLeDrive';
import type { PieceARanger } from '../../../../lib/gestion/rangementDrive';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { formaterDateIso } from '../../../../lib/gestion/annuaireRecherche';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « Sortir du suivi » : les mots et la liste des biens qui restent. */
import {
  adresseDuBien, aideSortirDuSuivi, classementSansLeBien, motConfirmationSortie, motMailSorti,
  MOT_SORTIR_DU_SUIVI, SECONDES_ANNULER_SORTIE,
  /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — l'info-bulle du second bouton, écrite dans le module PUR. */
  aideModifierLeRattachement,
} from '../../../../lib/gestion/sortirDuSuivi';
/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — `projeter` dit ce que le suivi décide POUR CE MAIL. Module pur. */
import { projeter, type ExceptionMail, type Periode } from '../../../../lib/gestion/periodesConversation';
import { annoncerClassement } from '../../../../lib/gestion/signalClassement';
/* ⚠️ LE MÊME COMPTE QUE LE TROMBONE DE LA LIGNE : les « ._ » et les images de signature ne sont pas des pièces. */
import { trierPieces } from '../../../../lib/gestion/lisibilite';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
import type { PersonneDuMail } from '../../../../lib/gestion/adressesMessage';
import {
  libelleInterlocuteur, PAGE_HISTORIQUE_MAX, type Interlocuteur, type LigneHistorique,
  type MessagePorteurDePieces,
} from '../../../../lib/gestion/historique';
import {
  dedoublonnerPieces, grouperParMessage, idsDesPiecesEtDeLeursJumelles, mentionExpediteurPiece, motPieces,
  piecesDeLaConversation, PARENT_PIECES_CONVERSATION, voisinagePiecesConversation,
  type GroupeDePieces, type MessagePorteur, type PieceDedoublonnee,
} from '../../../../lib/gestion/piecesConversation';
/**
 * 🔴 TOUTES LES DÉCISIONS VIENNENT DU MODULE PUR, ET ELLES N'Y SONT ÉCRITES QU'UNE FOIS. Ce fichier place et
 * peint : il ne décide ni d'une période, ni d'un groupe, ni d'un mot — et surtout pas de la phrase « locataire en
 * place », qui est précisément celle qu'une maquette a fait mentir (voir `motLocataireDeLaPeriode`).
 */
import {
  bornesDuChoix, grouperParCategorie, grouperParConversation, libelleOrdreFil, messagesDuFil,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — la ligne d'état et le groupe de l'agence remplacent l'interrupteur
     « Tous les mails du bien » et la phrase « N adresses de notre agence ne sont pas listées ». */
  MOT_TOUT_DECOCHER, motGroupeAgence, motSelectionDesParties, TITRE_GROUPE_AGENCE,
  motAucunResultat, motDeuxCompteurs, motLocataireDeLaPeriode, motPeriodeEffective, ordreFilSuivant,
  periodeDeLEvenement, periodeDuDernierLocataire, reglagesActifs, REGLAGES_DEFAUT, reglagesEnParametres,
  adresseACorriger, BUT_DU_PLUS, CAPSULES_VISIBLES, ciblesDeplacement, clientConnuPour, compteCacheesEnBas,
  compteCacheesEnHaut,
  MOT_ADRESSE_A_CORRIGER, motifNonSelectionnable, motPorteeDuResume,
  completerAvecLesClients, motPastille, ordonnerLesCapsules, pastilleDeCapsule, sorteDeCapsule,
  /* ⚠️ `filtrerParMots` N'EST PLUS IMPORTÉ ICI : le serveur filtre (point 3), et l'écran ne refiltre plus. La
     fonction reste exportée et éprouvée — elle est la définition de la règle, que la condition SQL reproduit. */
  BANDES_SOUS_LES_ENCARTS, messagesDesPorteurs,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — une pièce envoyée par une partie non cochée n'entre pas au résumé. */
  motPiecesEcartees, partagerPourLeResume, partiesCochees,
  GROUPES_EN_ENCART, motBasculeResume, motCompteurRecherche, motEncartVide, motPiecesSelection, motsRecherches,
  /* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — la MÊME normalisation que la recherche (sans accent, sans casse) sert
     à reconnaître l'adresse trouvée. Deux normalisations auraient fini par ne pas répondre pareil. */
  normaliserRecherche,
  motCacheesEnBas, motCacheesEnHaut, motDeplacement, MOTIF_NON_DEPLACABLE, partieDeplacable,
  CLE_RETOUR_BIEN, etatRetourDepuisBrut, MS_SURLIGNE_RETOUR, SECONDES_ANNULER_DEPLACEMENT,
  SANS_EVENEMENT, SANS_LOCATAIRE_CONNU, tonDeLExpediteur, tonDuGroupe, trierFil, LEGENDE_BARRES,
  type TonGroupe,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — un seul locataire à la fois dans l'encart. */
  adresseGardeeDansLencart, anciensLocataires, choixLocataireParDefaut, ilYAUnLocataireEnPlace,
  /* 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — actuels et anciens ne se cochent jamais ensemble. */
  exclusiviteLocataires, motBasculeLocataires, MS_MENTION_BASCULE, type FamilleDecochee,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-15 — les deux boutons de l'en-tête de l'encart Locataire. */
  /* 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — un événement prolonge la période d'un locataire. */
  motProlongationDeLaPeriode, type EvenementDuLocataire,
  AIDE_SANS_ANCIEN_LOCATAIRE, AIDE_SANS_LOCATAIRE_ACTUEL, CHOIX_LOCATAIRE_DEFAUT,
  aideBoutonAnciensLocataires, motBoutonAnciensLocataires, MOT_LOCATAIRES_ACTUELS,
  motAncienLocataire, periodeDuChoixLocataire,
  type CarteLocataireBien, type ChoixLocataire,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — les contacts annexes suivent leur location. */
  completerAvecLesContactsDuLocataire, type ContactDeLocataire,
  type CategoriePartie, type CleGroupeParties, type ClientDuBien, type EtatRetourBien, type GroupeParties,
  type ChoixPeriode, type OccupationPeriode,
  type PeriodePartie, type Reglages,
} from '../../../../lib/gestion/historiqueBien';
/* 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 1 — la hauteur qui contient N lignes ENTIÈRES (module PUR). */
import { hauteurDesPremiers } from '../../../../lib/gestion/listeDefilante';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LA SYNCHRONISATION AVEC LES CARROUSELS DU HAUT, DANS LES DEUX SENS.
 *
 * Ce bloc ANNONCE après chacune de ses écritures (le « + », un glisser, une annulation) pour réveiller le haut,
 * et il ÉCOUTE, pour que vérifier, modifier ou retirer une carte depuis le haut change ses capsules et ses
 * pastilles sans rechargement. Le signal ne porte aucune carte : il dit « redemande ».
 */
import { annoncerCartesContact, concerneCeBien, ecouterCartesContact, type SignalCartesContact }
  from '../../../../lib/gestion/signalCartesContact';
/**
 * 🔴 LE VOCABULAIRE DES CATÉGORIES ET LE CÔTÉ D'UNE CARTE VIENNENT DU MODULE QUI EN EST LE JUGE
 * (`partieCategorie.ts`), jamais d'une liste recopiée ici : `coteDeLaCategorie` décide si une carte de contact
 * se range côté propriétaire ou côté locataire, et c'est la même fonction que la reprise a employée.
 */
import { carteMonteAuCarrousel, coteDeLaCategorie, type Categorie } from '../../../../lib/gestion/partieCategorie';
/* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 0 — « est-ce la même adresse ? », écrit une fois pour tout le module. */
import { cleAdresse } from '../../../../lib/gestion/annuaire';
/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — « une des nôtres ? », la seule définition du module. */
import { estAdresseInterne } from '../../../../lib/gestion/adresseInterne';
import type { EvenementDuBien } from '../../../../lib/gestion/historiqueBienRepo';
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE FORMULAIRE DU « + » EST CELUI DES CLIENTS, IMPORTÉ ═══════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Réutilise le formulaire “Nouvelle fiche” / “Modifier la fiche” des clients —
 * LE MÊME COMPOSANT, PAS UNE COPIE. »
 *
 * 🔴 ET C'EST LA MÊME LEÇON QUE POUR `LigneVie` ET `CartePieceConversation` CI-DESSUS, payée plusieurs fois par
 * ce dépôt : deux formulaires jumeaux divergent au premier champ ajouté. `FormulaireCarte` a donc reçu un
 * `export` (et le TYPE de ce qu'il lit), et ce bloc l'appelle tel quel. Le garde de `HistoriqueDuBien.test.ts`
 * vérifie que l'import existe et qu'aucun champ n'a été redessiné ici.
 */
import { FormulaireCarte, ficheDeContact, type ChampsSaisis } from './CartesPersonnes';
/* 🔴 LES RÈGLES ET LES MOTS D'UN CONTACT VIENNENT DU MODULE PUR — jamais d'une phrase recopiée ici. */
import {
  TITRE_CONTACT_NOUVEAU, couperNomEtPrenom, ficheAEnvoyer,
} from '../../../../lib/gestion/ficheContact';
/** Ce que le dépôt sait d'une adresse avant toute saisie. Importé en TYPE : rien de `pg` n'entre ici. */
import type { CoordonneesTrouvees } from '../../../../lib/gestion/partieCategorieRepo';
/* 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — les familles destinataires d'une pièce, et la carte des catégories du
   bloc PARTIES : les deux viennent du MÊME module pur que les capsules des miniatures (point 3b d'Arno). */
import {
  famillesDestinataires, fusionnerCategories, type FamilleVue,
} from '../../../../lib/gestion/familleDestinataire';
import { COMPTE_GESTION_DEFAUT } from '../../../../lib/gestion/gmailMenu';
/* ══ 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN (09/10/2026) ══════════════════════════════════════════════════
   ARNO : « un clic ouvre, DANS la fiche du bien, juste sous ce mail, le MÊME module de rédaction que la boîte
   mail (copie 4) avec TOUTES ses fonctions […] Réutilise le composant existant, ne le recopie pas. »
   🔴 C'EST DONC `Redaction`, MONTÉ TEL QUEL — le même que la conversation et que les fenêtres flottantes. Il
   porte à lui seul le De, le À/Cc/Cci, l'objet, l'éditeur riche, la signature, les pièces (fichier, Drive, lien,
   Récents), le brouillon automatique, le plein écran, la fermeture et l'envoi. Rien n'en est réécrit ici, et
   c'est tout l'intérêt : le jour où la boîte gagne une fonction, ce bloc l'a le même jour. */
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
import { classementHerite } from '../../../../lib/gestion/classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8 — UNE CARTE TELLE QUE LA ROUTE LA REND À CE BLOC ══════════════════════════════════
 *
 * 🔴 CE N'EST PAS `LigneCarte` : la route ne rend ni `lotCle` (l'appelant l'a demandé), ni `creeLe`, ni
 * `creePar` — aucun écran ne les affiche —, et elle AJOUTE `verifie`, que ce bloc lit pour sa trame orange. Le
 * type décrit donc ce qui arrive VRAIMENT, et non ce que la base contient : c'est ce qui fait échouer la
 * compilation le jour où la projection maigrit.
 */
interface CarteProposee {
  cote: string;
  adresse: string;
  verifie: boolean;
  origine: 'auto' | 'manuel';
  nom?: string | null;
  telephone?: string | null;
  civilite?: string | null;
  prenom?: string | null;
  qualite?: string | null;
  adressePostale?: string | null;
  codePostal?: string | null;
  commune?: string | null;
  note?: string | null;
  coordonnees?: readonly { sorte: 'telephone' | 'email'; libelle: string | null; valeur: string }[];
}

/**
 * LOT HISTORIQUE-BIEN-1 — « L'HISTORIQUE DU BIEN », EN BAS DE LA FICHE D'UN LOGEMENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL AJOUTE À « VIE DU BIEN », QUI EST JUSTE AU-DESSUS ET QUI NE BOUGE PAS D'UN PIXEL. « Vie du bien »
 * répond à « tous les mails de ce logement ». Ce bloc-ci répond à la question d'APRÈS, celle qu'on se pose un
 * dossier en main : *pendant le sinistre de février*, *entre le propriétaire et l'assureur*, qu'est-ce qui s'est
 * dit — et quelles pièces ont circulé ?
 *
 * 🔴 PAS DE BANDEAU DE NAVIGATION. Arno n'en veut pas : le bloc est en bas de la fiche, il se trouve en défilant.
 *
 * 🔴 TOUT EST DÉCIDÉ DANS `historiqueBien.ts`. Ce fichier ne porte aucune règle : il monte le tableau de bord,
 * appelle la route existante avec les paramètres que le module pur écrit, et rend le fil et les pièces avec les
 * composants EXISTANTS.
 *
 * ⚠️ CLAIR ET SOMBRE : aucune couleur n'est inventée ici. Les jetons `--color-svv-*` vivent dans `globals.css`,
 * portés par `.svv-adm-root[data-theme=…]`, et rien n'est posé sur `:root`.
 *
 * ⚠️ 44 PX DE CIBLE, AUCUNE INFORMATION PORTÉE PAR UNE SEULE INFOBULLE, ET LE FOCUS SE GARDE : le tableau de bord
 * est rendu HORS du commutateur d'état (« chargement / erreur / liste »), ce qui fait que cocher une case ne
 * démonte jamais la case. C'est le défaut classique de ces panneaux — on coche, le panneau se reconstruit, et la
 * tabulation repart du début.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Etat =
  | { v: 'charge' }
  | { v: 'erreur'; message: string }
  | {
    v: 'ok'; lignes: LigneHistorique[]; suite: boolean; total: number;
    /**
     * 🔴 LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER — COMBIEN DE MAILS DANS LA SÉLECTION, SANS LA
     * RECHERCHE. `total` compte désormais les mails TROUVÉS (le serveur filtre) ; sans ce second nombre, le
     * « N mails sur M » dirait « 82 sur 82 ».
     */
    selection: number;
    interlocuteurs: Interlocuteur[]; tronques: boolean;
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LE TITRE DU BIEN, tel que `nomBien` l'écrit. La question posée avant
     * de sortir un mail le NOMME (« Sortir ce mail du suivi de 28 Avenue Marceau ? ») : une confirmation qui ne
     * dit pas de quel dossier elle parle n'est pas une confirmation.
     *
     * ⚠️ IL VIENT DE LA ROUTE, QUI LE REND DEPUIS TOUJOURS (`etendue.data.titre`) : rien de neuf à demander.
     */
    titre: string;
  };

/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — L'ÉTAT DE LA LECTURE DES PIÈCES DE TOUTE LA SÉLECTION.
 *
 * ⚠️ `{ v: 'ok', messages: [] }` ET `{ v: 'charge' }` NE SE CONFONDENT PAS : le premier est un résumé vide
 * EXACT (cette sélection ne porte aucune pièce), le second ne sait pas encore. C'est la distinction qui permet
 * au bouton de ne pas annoncer « 0 pièce dans cette sélection » avant d'avoir lu.
 */
type EtatPieces =
  | { v: 'charge' }
  | { v: 'erreur' }
  | { v: 'ok'; messages: readonly MessagePorteurDePieces[]; tronque: boolean };

/** Ce que l'écran demande à ranger : la pièce, et le courrier d'où elle vient (la fenêtre Drive veut les deux). */
interface DemandeRangement {
  messageId: number;
  filId: number | null;
  pieces: PieceARanger[];
}

/**
 * ══ 🔴🔴 LE TEMPS DE SILENCE APRÈS LA DERNIÈRE FRAPPE ═════════════════════════════════════════════════════════════
 *
 * Repris de « Vie du bien » au caractère près (lot HISTORIQUE-BIEN-2) : 250 ms, assez court pour paraître
 * instantané, assez long pour ne pas lancer une requête par lettre. Sans lui, « chaudière » aurait produit neuf
 * requêtes dont huit jetées — et sur le bien le plus fourni (325 mails), les réponses seraient revenues dans le
 * désordre.
 */
const ATTENTE_FRAPPE_MS = 250;

/**
 * 🔴 LE MOT DE LA CATÉGORIE MANQUANTE, ÉCRIT UNE FOIS. Il s'affiche SOUS le champ (convention du formulaire) ET
 * dans l'infobulle du bouton grisé : deux endroits, un seul texte. Deux phrases jumelles auraient fini par ne
 * plus se ressembler, et le lecteur aurait cru à deux règles.
 */

const MANQUE_CATEGORIE = 'Choisissez une catégorie : elle n’a pas été déduite pour cette adresse.';

export function HistoriqueDuBien({
  lotCle, maintenant, occupations, categories, periodes = new Map(), clients = [], onFicheClient,
  cartesLocataires = [],
  evenementOuvertInitial = false, onOuvrirFil, onEcranComplet, jeton = null, onPoserJeton,
  signalRelire = 0, redaction = null, onGesteMail,
}: {
  /** La clé WIPPIMMO du lot — la cible de l'historique, et la seule identité qui survive à un ré-import. */
  lotCle: string;
  maintenant: Date;
  /**
   * ══ 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — « UN ÉVÉNEMENT DE CE BIEN A CHANGÉ D'ÉTAT, REDEMANDE » ═════════════
   *
   * Un compteur que le parent fait avancer. Il ne porte aucune donnée : ce bloc ne saurait pas quoi en faire,
   * parce que l'état d'un événement se lit à DEUX endroits ici — la liste `evenements` (la ligne orange du
   * moteur) et le champ `evenements` de CHAQUE ligne de mail (les capsules), que seul le serveur sait remplir.
   *
   * ⚠️ IL FAUT LES DEUX. Ne redemander que la liste laisserait les capsules des mails sur l'état d'avant ; ne
   * redemander que les lignes laisserait la ligne orange du moteur. C'est exactement la panne qu'Arno a vue, en
   * plus petit.
   */
  signalRelire?: number;
  /**
   * ══ 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — DE QUOI ÉCRIRE, OU RIEN DU TOUT ═══════════════════════════
   *
   * CONSTAT D'ARNO (09/10/2026) : « dans l'historique d'un bien, un mail ouvert n'offre aucun moyen de répondre.
   * Il faut pouvoir répondre à CHAQUE mail de l'historique sans quitter la page. »
   *
   * Le contexte (droit d'envoi, signature, adresse de gestion, sondes de schéma) est lu UNE FOIS par l'écran
   * parent, au montage : c'est la MÊME valeur que reçoit la conversation, et il n'y a donc qu'une lecture pour
   * tout le module.
   *
   * ⚠️ `null` (le défaut) ⇒ AUCUN BOUTON DE RÉPONSE, et ce bloc est EXACTEMENT celui d'avant ce lot. Se taire
   * vaut mieux que proposer un geste dont on ne sait pas s'il aboutira — règle du module.
   */
  redaction?: ContexteRedactionEcran | null;
  /** Le compte rendu d'un geste d'écriture (brouillon enregistré, jeté, envoyé). Absent ⇒ rien n'est annoncé. */
  onGesteMail?: (message: string, options?: { rechargerTout?: boolean }) => void;
  /**
   * 🔴 TOUTES LES OCCUPATIONS DU LOGEMENT, PASSÉES COMPRISES — c'est la demande d'Arno : « les anciens locataires
   * sont visibles et sélectionnables, chacun avec sa période ».
   *
   * ⚠️ ELLES VIENNENT DE LA FICHE, PAS DE LA ROUTE, ET C'EST UN FAIT MESURÉ, non un choix de confort :
   * `/api/admin/gestion/historique` ne renseigne `occupations` que pour une cible `locataire-…`
   * (`etendreCible`, branche `locataire`). Pour une cible `lot-…` elle rend un tableau VIDE — un bien n'est pas
   * borné dans le temps. La fiche, elle, les a déjà toutes (`FicheLot.occupations`) : les lire là évite une
   * requête et surtout évite d'élargir une réponse que quatre écrans lisent.
   */
  occupations: readonly OccupationPeriode[];
  /**
   * À QUELLE CATÉGORIE APPARTIENT CHAQUE ADRESSE. Clé en minuscules. Une adresse absente tombe dans
   * « À répartir », ce qui est un fait affiché, jamais un silence.
   */
  categories: ReadonlyMap<string, CategoriePartie>;
  /**
   * 🔴 LOT HISTORIQUE-BIEN-2 — LE CARTOUCHE « ÉVÉNEMENT EN COURS » ARRIVE ICI FILTRÉ. Il menait à « Vie du bien »
   * avec son filtre `'evenement'` ; « Vie du bien » n'existe plus, et la promesse du cartouche doit tenir : on
   * arrive sur les échanges qui portent un événement ouvert, pas sur la liste entière à filtrer soi-même.
   *
   * ⚠️ C'EST UN DÉPART, PAS UNE CONTRAINTE — exactement la convention de `filtreInitial` à qui il succède : le
   * bouton reste cliquable, et le premier clic reprend la main. Un filtre imposé ferait croire que le bien n'a
   * que ces échanges-là.
   */
  evenementOuvertInitial?: boolean;
  /**
   * ══ 🔴🔴 LA PÉRIODE DE CHAQUE PARTIE QUI EN A UNE — « chacun avec sa période » ═══════════════════════════════
   *
   * Clé en minuscules, comme `categories`. Elle vient de la FICHE, qui seule connaît les baux : la route rend un
   * tableau d'occupations VIDE pour une cible `lot-…`. Une adresse absente n'affiche rien — la plupart des
   * parties (assureur, syndic, artisan) n'ont pas de bail, et leur inventer une période serait un mensonge.
   */
  periodes?: ReadonlyMap<string, PeriodePartie>;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES CLIENTS DU BIEN, TELS QUE LA FICHE LES PORTE ═══════════════════
   *
   * DEMANDE D'ARNO : « Le propriétaire client (carte du haut de fiche) y apparaît en capsule même avec 0 mail,
   * avec ses compteurs à 0. »
   *
   * 🔴 ILS VIENNENT DE LA FICHE, COMME `occupations` ET `categories`, ET POUR LA MÊME RAISON : la route de
   * l'historique ne connaît que les gens qui ont ÉCRIT ou REÇU quelque chose. Un propriétaire muet n'y est pas,
   * et c'est bien pour cela que son encart était vide. Élargir la réponse de la route aurait touché quatre
   * écrans pour un besoin qui n'existe que sur la fiche d'un bien.
   *
   * ⚠️ VIDE PAR DÉFAUT, DONC AUCUN CHANGEMENT LÀ OÙ PERSONNE NE LES PASSE : le bloc rend alors exactement ce
   * qu'il rendait avant ce lot, aux deux encarts toujours présents près.
   *
   * ⚠️ UN CLIENT SANS ADRESSE EN FAIT PARTIE (`adresse: null`) : il ne donne pas de capsule, mais il change la
   * phrase de l'encart vide — « aucun échange avec le locataire » plutôt que « aucun locataire connu ».
   */
  clients?: readonly ClientDuBien[];
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — OUVRIR LA FICHE D'ANNUAIRE D'UN CLIENT dont l'adresse est à corriger.
   *
   * Demande d'Arno : « la mention discrète “adresse à corriger dans l'annuaire” (lien vers sa fiche) ». C'est là
   * qu'on corrige l'adresse — pas sur la fiche du bien.
   *
   * ⚠️ FACULTATIVE : sans elle, la mention s'affiche sans lien. Dire le problème vaut mieux que se taire parce
   * qu'on n'a pas de porte à offrir.
   */
  onFicheClient?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — LES CARTES DE LOCATAIRE DU LOGEMENT ═══════════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026, lot-146) : « L'encart affiche “Locataire 6” : il mêle le locataire en place et les
   * adresses des anciens locataires. » Et sa règle : « Jamais deux périodes de locataires dans la même recherche. »
   *
   * 🔴 POURQUOI UNE PROP DE PLUS, ALORS QUE `periodes` EXISTE DÉJÀ. `periodes` donne la période d'une ADRESSE ;
   * elle ne dit pas À QUELLE OCCUPATION elle appartient, ni quelles autres adresses celle-ci porte — c'est-à-dire
   * précisément ce qu'il faut pour n'en afficher qu'une à la fois et pour écrire la ligne « nom · du … au … ·
   * N adresses ». Deux occupants d'un même bail y sont d'ailleurs indistinguables de deux baux de mêmes dates.
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ RIEN NE CHANGE LÀ OÙ PERSONNE NE LES PASSE : `adresseGardeeDansLencart` garde TOUT quand
   * aucune carte n'est connue, et la ligne « Anciens locataires » n'est pas rendue. C'est ce qui rend ce lot
   * gratuit pour un bien dont la fiche ne porte aucune occupation — et pour les tests qui montent ce bloc nu.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  cartesLocataires?: readonly CarteLocataireBien[];
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3 — L'ÉCRAN « HISTORIQUE » COMPLET RESTE ATTEIGNABLE ════════════════════════════
   *
   * DÉCISION D'ARNO (05/10/2026), en réponse à ma question du lot précédent : « L'écran plein “Historique” reste
   * accessible : petit lien discret “Écran historique complet” en bas du nouveau bloc. »
   *
   * 🔴 POURQUOI LA QUESTION SE POSAIT. Au lot 2, « Tout l'historique des échanges → » a cessé d'ouvrir cet écran
   * pour défiler vers ce bloc — demande d'Arno. La fiche d'un bien perdait alors sa dernière porte vers l'écran
   * plein, qui existe toujours et que ce bloc ne remplace pas en tout point (il est borné à un bien).
   *
   * ⚠️ FACULTATIVE : sans elle, le lien n'est pas rendu. La fiche ne la passe que si elle sait où mener.
   */
  onEcranComplet?: () => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE VA-ET-VIENT AVEC LA CONVERSATION ════════════════════════════════
   *
   * `jeton` : la clé lue dans l'adresse. Non nulle ⇒ on REVIENT d'une conversation, et l'état complet est à
   * reprendre dans le `sessionStorage` de l'onglet.
   *
   * `onPoserJeton` : demande à l'écran parent d'écrire cette clé dans l'adresse, SANS empiler d'entrée
   * d'historique. C'est l'entrée qu'on quitte qui doit la porter — sinon « Précédent » ramènerait à la fiche
   * SANS son état, c'est-à-dire exactement le défaut qu'Arno a signalé.
   */
  jeton?: string | null;
  onPoserJeton?: (jeton: string) => void;
}) {
  /**
   * ══ 🔴🔴 L'ÉTAT REPRIS AU RETOUR, LU UNE FOIS, AVANT TOUT (lot HISTORIQUE-BIEN-3, point 4) ═══════════════════
   *
   * 🔴 LU DANS L'INITIALISEUR DE `useState`, ET NON DANS UN EFFET. Dans un effet, le bloc se serait affiché une
   * fraction de seconde avec les réglages PAR DÉFAUT, aurait lancé la requête correspondante, puis se serait
   * corrigé : deux requêtes, un clignotement, et un fil qui saute sous les yeux. Ici, le premier rendu est déjà
   * le bon.
   *
   * ⚠️ LA FICHE EST VÉRIFIÉE : un jeton qui désignerait l'état d'un AUTRE bien est écarté, pas appliqué — c'est
   * le genre de confusion qu'un copier-coller d'adresse produit tout seul.
   */
  const repris = useMemo((): EtatRetourBien | null => {
    if (jeton === null || typeof window === 'undefined') return null;
    try {
      const brut = window.sessionStorage.getItem(`${CLE_RETOUR_BIEN}${jeton}`);
      if (brut === null) return null;
      const e = etatRetourDepuisBrut(JSON.parse(brut));
      return e !== null && e.fiche === lotCle ? e : null;
    } catch { return null; }
  }, [jeton, lotCle]);

  const [reglages, setReglages] = useState<Reglages>(
    repris?.reglages
    ?? (evenementOuvertInitial ? { ...REGLAGES_DEFAUT, evenementOuvert: true } : REGLAGES_DEFAUT));
  /**
   * ⚠️ LA SAISIE ET LE RÉGLAGE SONT DEUX ÉTATS, ET IL LE FAUT. Le champ doit répondre à chaque lettre (sinon il
   * paraît cassé) ; la REQUÊTE, elle, n'part qu'après le silence. Les confondre aurait donné l'un ou l'autre
   * défaut : un champ qui saute, ou une requête par caractère.
   */
  const [saisie, setSaisie] = useState(repris?.reglages.texte ?? '');
  useEffect(() => {
    const t = setTimeout(
      () => setReglages((r) => (r.texte === saisie ? r : { ...r, texte: saisie })),
      saisie.trim() === '' ? 0 : ATTENTE_FRAPPE_MS);
    return () => clearTimeout(t);
  }, [saisie]);
  const [page, setPage] = useState(repris?.page ?? 0);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LE COMPTEUR DE RECHARGEMENT. « Annuler » doit rétablir EXACTEMENT
   * l'état d'avant : le faire avancer redemande la page au serveur, plutôt que de reconstruire de mémoire une
   * ligne plausible — avec son statut, ses événements et sa capsule — qu'on n'aurait aucun moyen de vérifier.
   */
  const [rechargement, setRechargement] = useState(0);
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [deplie, setDeplie] = useState<Set<number>>(new Set());
  const [evenements, setEvenements] = useState<EvenementDuBien[]>([]);
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — QUELS ÉVÉNEMENTS CONCERNENT QUEL LOCATAIRE ═══════════════════════
   *
   * Règle d'Arno : la période d'un locataire se prolonge jusqu'à la clôture d'un événement qui le concerne, ou
   * jusqu'à aujourd'hui s'il n'est pas clos. La définition retenue est dans `evenementsParLocataire`.
   *
   * ⚠️ VIDE ⇒ LA PÉRIODE EST CELLE DU BAIL, exactement comme avant ce lot.
   */
  const [evtsParLocataire, setEvtsParLocataire] = useState<EvenementDuLocataire[]>([]);
  /** Les événements n'ont pas pu être lus. On le DIT : une liste vide se lirait « ce bien n'en a jamais eu ». */
  const [evenementsIllisibles, setEvenementsIllisibles] = useState(false);

  /**
   * ⚠️ LE RÉSUMÉ DU HAUT EST **REPLIÉ**, CELUI DU BAS EST **OUVERT** (demande d'Arno). Celui du haut porte son
   * compte en toutes lettres SUR le bouton : « 📎 7 pièces » se lit sans un clic, et c'est tout l'intérêt du
   * repli — on sait s'il y a quelque chose à ouvrir avant de l'ouvrir.
   */
  /**
   * ══ 🔴🔴 UN SEUL ÉTAT POUR LES DEUX RÉSUMÉS (lot HISTORIQUE-BIEN-4, point 4) ═════════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Le MÊME bouton est ajouté EN BAS du listing des mails : il ouvre et ferme le
   * même résumé (un seul état partagé). »
   *
   * 🔴 CE QUI CHANGE PAR RAPPORT AU LOT 1, et il faut le dire : le résumé du bas était ALORS toujours ouvert, et
   * celui du haut replié — c'était la demande d'Arno à l'époque. Un seul état les lie désormais : le bouton du
   * haut et celui du bas montrent et masquent la même chose. Deux états auraient fait deux vérités pour un même
   * contenu, et c'est le genre d'écran où l'on finit par ne plus savoir si l'on a déjà regardé.
   */
  const [resumeOuvert, setResumeOuvert] = useState(false);
  /**
   * 🔴🔴 LOT RESUME-PIECES-BOUTON-BAS — LE HAUT DE CHAQUE RÉSUMÉ, pour y ramener la page quand on le referme
   * depuis son bouton de fin. Deux ancres parce qu'il y a DEUX montages (au-dessus du fil, et en bas du
   * listing) : chacun ramène à SON propre bouton du haut, jamais à celui de l'autre.
   */
  const ancreResumeHaut = useRef<HTMLDivElement | null>(null);
  const ancreResumeBas = useRef<HTMLDivElement | null>(null);
  /**
   * ══ 🔴🔴 LE RECADRAGE APRÈS FERMETURE — ET POURQUOI IL EST DIFFÉRÉ ═══════════════════════════════════════════
   *
   * DEMANDE D'ARNO : « En le refermant depuis le bas, la page se repositionne sur le haut du résumé refermé. »
   *
   * 🔴 LE DÉFILEMENT NE PEUT PAS SE FAIRE AU CLIC, ET C'EST MESURÉ : à cet instant le résumé est encore DÉPLIÉ —
   * 10 906 px de haut sur lot-290 — et `scrollIntoView` calcule sur cette page-là. Essayé à l'écran : on
   * atterrissait 8 453 px en dessous du bloc visé. On note donc QUI recadrer, et on le fait une fois le repli
   * écrit dans le document.
   *
   * ⚠️ `useLayoutEffect` ET NON `useEffect` : il court après la mutation du DOM mais AVANT que l'écran soit
   * peint. Avec `useEffect`, on verrait d'abord la page sauter à sa position d'avant, puis se recadrer.
   */
  const [recadrer, setRecadrer] = useState<'haut' | 'bas' | null>(null);
  useLayoutEffect(() => {
    if (recadrer === null) return;
    /* ⚠️ `scrollIntoView?.()` : tous les environnements ne le fournissent pas (jsdom, impressions, lecteurs). Un
       défilement de confort ne doit jamais faire tomber le rendu du bloc — c'est déjà la forme retenue ailleurs
       dans ce module (`pied.current?.scrollIntoView?.(…)`, lot BROUILLON-EN-ATTENTE). */
    (recadrer === 'haut' ? ancreResumeHaut : ancreResumeBas).current?.scrollIntoView?.({ block: 'start' });
    setRecadrer(null);
  }, [recadrer]);
  /** Fermer DEPUIS LA FIN d'un résumé : on replie, et on ramène la page sur le haut de CE bloc-là. */
  const fermerResumeDepuisLaFin = (ou: 'haut' | 'bas') => { setResumeOuvert(false); setRecadrer(ou); };
  /** Le mail d'où l'on est parti, surligné BRIÈVEMENT au retour (demande d'Arno). */
  const [mailSurligne, setMailSurligne] = useState<number | null>(repris?.mail ?? null);

  /**
   * ══ 🔴 LE REPLI DES GROUPES : UN ENSEMBLE DE **BASCULES**, PAS D'ÉTATS ═══════════════════════════════════════
   *
   * Un groupe au-delà du seuil de `partieCategorie.ts` (6) s'ouvre REPLIÉ ; en dessous, il s'ouvre DÉPLIÉ. La
   * décision passe par `replierLesCartes`, jamais par une comparaison écrite ici.
   * Mémoriser « ouvert » aurait rendu impossible de REFERMER un petit groupe (il était ouvert par défaut, donc
   * déjà « dans l'ensemble » ou pas selon le défaut). On mémorise donc ce que la personne a BASCULÉ, et l'état
   * affiché est le défaut inversé — une seule règle, qui marche dans les deux sens.
   */
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — `'agence'` S'AJOUTE AUX QUATRE CLÉS DE GROUPE, ET SEULEMENT ICI. Son
   * repli se garde comme celui des autres bandes ; mais elle n'est PAS un `CleGroupeParties` (elle n'est pas une
   * partie : ni « + », ni glisser, ni catégorie). L'élargir dans le module pur aurait obligé `coteDeLaCategorie`,
   * `ciblesDeplacement` et `sorteDeCapsule` à répondre d'un groupe qui n'est pas une partie du bien.
   */
  const [bascules, setBascules] = useState<Set<CleGroupeParties | 'agence'>>(new Set());

  const [depots, setDepots] = useState<ReadonlyMap<number, DepotAffiche>>(new Map());
  const [emplacements, setEmplacements] =
    useState<ReadonlyMap<number, readonly EmplacementPiece[]>>(new Map());
  const [aRanger, setARanger] = useState<DemandeRangement | null>(null);
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — LA VISIONNEUSE EST DE RETOUR ═════════════════════════════════════
   *
   * La pièce ouverte dans la visionneuse maison, ou `null`. Voir l'encadré des gestes : l'œil ouvrait un onglet.
   */
  const [pieceVue, setPieceVue] = useState<number | null>(null);
  /** Ce que le renommage a répondu, dit sous la ligne d'état. `null` = rien à dire. */
  const [motRenommage, setMotRenommage] = useState<string | null>(null);
  /* 🔴🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — l'emplacement ET la pièce d'où l'on vient : l'un dit OÙ aller,
     l'autre ce qu'on met en vignette tout en haut de la colonne. Voir `PiecesDeLaConversation`. */
  const [aVoirDansLeDrive, setAVoirDansLeDrive] =
    useState<{ ou: EmplacementPiece; source: PieceARanger } | null>(null);

  /**
   * ⚠️ TOUT CHANGEMENT DE RÉGLAGE REMET À LA PREMIÈRE PAGE. Sans cela, filtrer depuis la page 3 afficherait
   * « aucun résultat » sur un fil qui en a douze — et l'on croirait les réglages vides.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 1 — LE LISTING CHARGE LA **SÉLECTION**, ET NON 25 MAILS ═════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026), sur lot-47 : « propriétaire ET locataire cochés → le résumé ne montre que les
   * pièces du propriétaire ».
   *
   * ═══ 🔴 CE QUE J'AI MESURÉ, ET CE QUI N'ÉTAIT PAS LA CAUSE ════════════════════════════════════════════════════
   * Le résumé ne se trompait PAS. Mesuré à l'écran, dans les trois combinaisons, il valait exactement la somme
   * des trombones des mails affichés : propriétaire seul 15 = 15, locataire seul 10 = 10, les deux 13 = 13. Et il
   * lisait déjà la même liste que le listing — il n'y a jamais eu de second calcul.
   *
   * ═══ 🔴🔴 LA CAUSE : LA PAGE DE 25 ════════════════════════════════════════════════════════════════════════════
   * La sélection « propriétaire + locataire » compte **49 mails** ; le listing n'en chargeait que **25** — la
   * première page, du plus récent au plus ancien. Dans cette page il n'y avait que deux mails de la locataire, et
   * aucun des deux ne portait de pièce jointe : ses 10 pièces vivaient sur les pages suivantes. Le résumé disait
   * donc la vérité de la PAGE, pas celle de la SÉLECTION — et le même défaut frappait « Tous les mails du bien ».
   *
   * ═══ 🔴 LA CORRECTION, ET POURQUOI C'EST CELLE-LÀ ═════════════════════════════════════════════════════════════
   * Le listing demande désormais la SÉLECTION ENTIÈRE, jusqu'au plafond que la route s'est fixé
   * (`PAGE_HISTORIQUE_MAX`, 100). Trois choses tombent juste du même coup :
   *   · « les deux → les deux familles » (demande d'Arno) : les deux sont à l'écran, donc dans le résumé ;
   *   · « le résumé = la somme des trombones des mails affichés » (sa vérification) reste vrai AU CARACTÈRE ;
   *   · « le résumé et le listing calculés à partir de la MÊME sélection, pas de second calcul » : inchangé —
   *     le résumé lit `lignes`, comme avant. La correction ne touche QUE la taille demandée.
   * La pagination n'est pas retirée : elle reprend au-delà de 100 mails, et son libellé est le même.
   *
   * ⚠️ LE COÛT A ÉTÉ MESURÉ AVANT, et non supposé : sur le bien le plus fourni (cible 421, 325 mails), la route
   * rend 100 lignes en **27 à 34 ms** — contre 144 ms pour la première demande de 25. Charger la sélection ne
   * coûte donc rien de perceptible ; c'est la requête elle-même qui coûte, pas les lignes.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const parametres = reglagesEnParametres(reglages, page, PAGE_HISTORIQUE_MAX);
  const parametresSansPage = reglagesEnParametres({ ...reglages }, 0, PAGE_HISTORIQUE_MAX);
  useEffect(() => { setPage(0); }, [parametresSansPage]);

  // ── ① LES ÉVÉNEMENTS DU BIEN, UNE FOIS ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/gestion/historique/evenements?cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; evenements?: EvenementDuBien[]; parLocataire?: EvenementDuLocataire[];
        };
        if (!vivant) return;
        setEvenements(d.evenements ?? []);
        setEvtsParLocataire(d.parLocataire ?? []);
        setEvenementsIllisibles(d.etat !== 'ok');
      } catch {
        if (!vivant) return;
        setEvenements([]);
        setEvtsParLocataire([]);
        setEvenementsIllisibles(true);
      }
    })();
    return () => { vivant = false; };
    /* 🔴 LOT MARQUES-EVENEMENT-EN-COURS — `signalRelire` EST UNE DÉPENDANCE : clore ou rouvrir depuis la frise,
       plus haut sur la même page, change `ouvert` et donc la ligne orange du moteur. Sans cela elle restait
       telle qu'au chargement de la fiche. */
  }, [lotCle, signalRelire]);

  /**
   * ══ 🔴🔴 ①-ter LE MÊME SIGNAL REDEMANDE AUSSI LES LIGNES DE MAIL ═════════════════════════════════════════════
   *
   * Les capsules « Événement en cours » sont portées par CHAQUE ligne (`LigneVie` lit `l.evenements`), remplies
   * par la route de l'historique. Faire avancer `rechargement` les redemande telles que le serveur les voit —
   * la même mécanique que « Annuler », et pour la même raison : on ne reconstruit pas de mémoire un état qu'on
   * n'a aucun moyen de vérifier.
   *
   * ⚠️ LE PREMIER PASSAGE NE COMPTE PAS : au montage, les trois effets de page partent déjà. Avancer le
   * compteur ici ferait une seconde volée de requêtes pour rien, à chaque ouverture de fiche.
   */
  const signalVu = useRef(signalRelire);
  useEffect(() => {
    if (signalVu.current === signalRelire) return;
    signalVu.current = signalRelire;
    setRechargement((n) => n + 1);
  }, [signalRelire]);

  /**
   * ══ 🔴🔴 ①-bis LES CATÉGORIES RANGÉES EN BASE — C'EST ELLES QUI REMPLISSENT « INDÉPENDANT » ═══════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « INDÉPENDANT : diagnostiqueurs, artisans, prestataires qui travaillent pour
   * nous sur de nombreux biens. Catégorie GLOBALE : un contact indépendant est rangé une fois pour tous les
   * biens, jamais rattaché à un bien en tant que tel. »
   *
   * 🔴 LA FICHE NE PEUT PAS LE SAVOIR, et c'est pour cela que cette lecture existe. Les propriétaires et les
   * occupants d'un bien se lisent sur la fiche ; « cette adresse travaille pour nous sur quarante biens » ne se
   * lit que dans `gestion_partie_categorie` (migration 304). Sans cette lecture, le groupe « Indépendant »
   * restait vide et les **65 indépendants proposés** par la reprise retombaient tous dans « À répartir » —
   * autrement dit le travail de la reprise ne se voyait nulle part.
   *
   * ⚠️ DEMANDÉE UNE FOIS PAR BIEN, jamais à chaque case cochée : une catégorie ne change pas quand on filtre.
   *
   * ⚠️ EN ÉCHEC, ON NE CASSE RIEN : la carte reste vide, et les groupes retombent sur ce que la fiche sait —
   * c'est-à-dire exactement le comportement d'avant cette lecture. Un bloc qui refuserait de s'afficher parce
   * qu'une lecture d'appoint a échoué serait pire que trois groupes sur quatre.
   */
  const [categoriesRangees, setCategoriesRangees] =
    useState<ReadonlyMap<string, CategoriePartie>>(new Map());
  /**
   * 🔴 LES CARTES PORTENT LEUR ADRESSE depuis le lot HISTORIQUE-BIEN-3, et il la fallait : le « + » cerclé ne
   * s'affiche que sur une partie qui N'A PAS encore de carte, ce qui demande de savoir lesquelles en ont une.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LA CARTE PORTE DÉSORMAIS SA FICHE, ET C'EST LE POINT 1 QUI L'EXIGE ══
   *
   * Arno, point 1 : les cartes automatiques « ne sont plus affichées dans les carrousels du haut ; elles
   * deviennent de simples PRÉ-REMPLISSAGES du formulaire du “+” ». Une PROPOSITION n'a donc plus qu'un seul
   * usage : remplir le formulaire. Il faut pour cela qu'elle arrive avec ce qu'elle sait — et pas seulement avec
   * son côté et son état de vérification.
   */
  const [cartesContact, setCartesContact] = useState<CarteProposee[]>([]);
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — QUELLE LOCATION RÉCLAME QUEL CONTACT ANNEXE ══════════════════════
   *
   * Constat d'Arno (lot-146) : `louisvaglio@live.fr` paraissait avec le locataire ACTUEL et disparaissait avec
   * VAGLIO ARNAUD, à qui il appartient. La cause, et pourquoi la période ne peut pas la corriger, sont dans
   * l'encadré de `contactsParLocataire`.
   *
   * ⚠️ IL VIENT DE `/historique/parties`, LA ROUTE DEMANDÉE UNE FOIS PAR FICHE : ce rattachement ne dépend ni de
   * la période, ni des cases cochées, ni de la page. Vide ⇒ comportement d'avant ce lot.
   */
  const [contactsLocataires, setContactsLocataires] = useState<ContactDeLocataire[]>([]);
  /**
   * ══ 🔴🔴 CE QUE LA RÈGLE À TROIS ÉTAGES A **PROPOSÉ**, Y COMPRIS « non affectée » ══════════════════════════════
   *
   * DEMANDE D'ARNO (04/10/2026) : « La catégorie est PRÉ-REMPLIE quand elle a été déduite (règle à trois étages),
   * et reste modifiable. »
   *
   * 🔴 POURQUOI UNE SECONDE CARTE, ET NON `categoriesRangees`. Celle-là ne garde que les trois catégories
   * RETENUES, parce que c'est tout ce dont les groupes ont besoin. La carte de création, elle, a besoin de la
   * PROPOSITION même quand elle vaut « non affectée » — et surtout de savoir qu'il n'y en a aucune, pour laisser
   * le choix vide plutôt que de pré-cocher « Propriétaire » par défaut. Pré-remplir au hasard est pire que ne
   * rien pré-remplir : on valide sans lire.
   */
  const [proposees, setProposees] = useState<ReadonlyMap<string, Categorie>>(new Map());
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE NOM ET LE TÉLÉPHONE À PRÉ-REMPLIR ═══════════════════════════════
   *
   * DEMANDE D'ARNO : la carte du « + » « est pré-remplie : nom, adresse, téléphone trouvé en signature ».
   *
   * 🔴 ILS ARRIVENT AVEC LA LISTE DES PARTIES, EN UN SEUL APPEL, et c'est volontaire deux fois : le « + » n'a
   * rien à demander au moment du clic (il ouvre la carte instantanément), et aucune adresse personnelle ne
   * voyage dans une chaîne de requête — ce que ce dépôt refuse partout.
   *
   * ⚠️ VIDE EN CAS D'ÉCHEC : la carte s'ouvre alors avec la seule adresse, comme avant ce lot. Un
   * pré-remplissage manquant n'empêche personne de saisir.
   */
  const [coordonnees, setCoordonnees] = useState<ReadonlyMap<string, CoordonneesTrouvees>>(new Map());

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LE BLOC DU BAS S'ABONNE AU SIGNAL, LUI AUSSI ═════════════════════════════════
   *
   * DEMANDE D'ARNO : « SYNCHRONISATION TOTALE […] que ce soit depuis le haut ou depuis le bas, met à jour l'autre
   * endroit en direct. »
   *
   * 🔴 LES DEUX SENS, ET C'EST LE MOT « TOTALE » QUI L'EXIGE. Ce bloc ANNONCE après chacune de ses écritures (le
   * « + », un glisser, une annulation) pour réveiller les carrousels du haut ; et il ÉCOUTE, pour que vérifier,
   * modifier ou retirer une carte DEPUIS LE HAUT change ses capsules et ses pastilles sans rechargement.
   */
  /** Relire les rangements. Appelée au montage ET après une création : la partie doit changer de groupe en direct. */
  const relireParties = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/admin/gestion/historique/parties?cible=lot-${encodeURIComponent(lotCle)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string;
        data?: {
          parties?: { adresse: string; categorie: string | null }[];
          cartes?: CarteProposee[];
          /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — ce que la carte du « + » pré-remplit.
             🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — et l'ADRESSE POSTALE trouvée dans la même signature. */
          coordonnees?: CoordonneesTrouvees[];
          /* 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — quelle location réclame quel contact annexe. */
          contactsLocataires?: ContactDeLocataire[];
        };
      };
      const m = new Map<string, CategoriePartie>();
      const prop = new Map<string, Categorie>();
      for (const x of d.data?.parties ?? []) {
        const cle = x.adresse.trim().toLowerCase();
        if (x.categorie === 'proprietaire' || x.categorie === 'locataire' || x.categorie === 'independant') {
          /* ⚠️ « non affectée » N'EST PAS UN GROUPE DE PARTIE : c'est l'absence de rangement, et le module pur
             l'exprime en ne connaissant pas l'adresse. On ne la pose donc pas dans la carte des groupes. */
          m.set(cle, x.categorie);
          prop.set(cle, x.categorie);
        } else if (x.categorie === 'a_repartir') {
          prop.set(cle, 'a_repartir');
        }
      }
      setCategoriesRangees(m);
      setProposees(prop);
      setCartesContact(d.data?.cartes ?? []);
      setContactsLocataires(d.data?.contactsLocataires ?? []);
      const co = new Map<string, CoordonneesTrouvees>();
      for (const c of d.data?.coordonnees ?? []) co.set(c.adresse.trim().toLowerCase(), c);
      setCoordonnees(co);
    } catch {
      setCategoriesRangees(new Map());
      setProposees(new Map());
      setCartesContact([]);
      setCoordonnees(new Map());
    }
  }, [lotCle]);
  useEffect(() => { void relireParties(); }, [relireParties]);
  /**
   * 🔴 L'ÉCOUTE : un geste fait DANS UN CARROUSEL DU HAUT met ce bloc à jour, sans que l'un connaisse l'autre.
   *
   * ⚠️ ON N'ÉCOUTE PAS SES PROPRES ANNONCES. Ce bloc est à la fois émetteur et auditeur : sans ce garde, il
   * relirait DEUX FOIS après chacune de ses écritures — une fois parce qu'il vient d'écrire, une fois parce
   * qu'il s'entend. Mesuré par deux épreuves qui comptent les lectures : elles en attendaient deux, elles en
   * voyaient trois.
   */
  const monEcoute = useRef<((s: SignalCartesContact) => void) | null>(null);
  useEffect(() => {
    const f = (sig: SignalCartesContact): void => {
      if (concerneCeBien(sig, lotCle)) void relireParties();
    };
    monEcoute.current = f;
    return ecouterCartesContact(f);
  }, [lotCle, relireParties]);

  // ── ② LE FIL ──────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true;
    /* ⚠️ ON NE RETOMBE PAS SUR « chargement » QUAND ON A DÉJÀ UNE LISTE : le fil clignoterait à chaque case
       cochée, et la page sauterait sous le curseur. Même règle que « Vie du bien ». */
    setEtat((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    void (async () => {
      try {
        const sep = parametres === '' ? '?' : '&';
        const res = await fetch(
          `/api/admin/gestion/historique${parametres}${sep}cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string;
          data?: {
            lignes?: LigneHistorique[]; suite?: boolean; entete?: { nbMails?: number };
            /* 🔴 LOT FRISE-PICTOS-PLUS-GRANDS… — la sélection SANS la recherche, dénominateur du « N sur M ». */
            selection?: { nbMails?: number };
            interlocuteurs?: Interlocuteur[]; interlocuteursTronques?: boolean; titre?: string;
          };
        };
        if (!vivant) return;
        if (d.etat !== 'ok') {
          setEtat({ v: 'erreur', message: 'L’historique de ce bien n’a pas pu être lu.' });
          return;
        }
        setEtat({
          v: 'ok',
          lignes: d.data?.lignes ?? [],
          suite: d.data?.suite === true,
          total: d.data?.entete?.nbMails ?? 0,
          selection: d.data?.selection?.nbMails ?? d.data?.entete?.nbMails ?? 0,
          interlocuteurs: d.data?.interlocuteurs ?? [],
          tronques: d.data?.interlocuteursTronques === true,
          titre: d.data?.titre ?? '',
        });
      } catch {
        if (vivant) {
          setEtat({
            v: 'erreur', message: 'L’historique de ce bien n’a pas pu être lu : le serveur n’a pas répondu.',
          });
        }
      }
    })();
    return () => { vivant = false; };
    /* ⚠️ `rechargement` EST UNE DÉPENDANCE : « Annuler » le fait avancer, et la page est redemandée telle que le
       serveur la connaît (lot HISTORIQUE-BIEN-12, point 1). */
  }, [lotCle, parametres, rechargement]);

  // ── ③ LE FIL, LES PIÈCES, LE RÉSUMÉ ───────────────────────────────────────────────────────────────────────────
  /** La page REÇUE, triée. C'est le dénominateur du « N mails sur M » : la sélection déjà affichée. */
  const lignesPage = useMemo(
    () => (etat.v === 'ok' ? trierFil(etat.lignes, reglages.ordre) : []),
    [etat, reglages.ordre]);

  /**
   * ══ 🔴🔴 LA RECHERCHE EST UN FILTRE DE L'ÉCRAN (lot HISTORIQUE-BIEN-3, point 5) ══════════════════════════════
   *
   * DEMANDE D'ARNO : « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà affichée (période +
   * parties + options) : objet, texte, nom de l'expéditeur, nom des pièces. »
   *
   * 🔴 ELLE S'APPLIQUE APRÈS LE TRI ET AVANT TOUT LE RESTE — le résumé des pièces, le regroupement par
   * conversation et le compteur lisent donc tous `lignes`, c'est-à-dire ce qui est RÉELLEMENT à l'écran. Si le
   * résumé avait lu la page entière, il aurait annoncé des pièces qu'aucun mail visible ne porte.
   */
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LES MAILS DE LA SÉLECTION QUI PORTENT UNE PIÈCE, TOUS.
   *
   * ⚠️ TROIS ÉTATS, ET NON UNE LISTE QUI PEUT ÊTRE VIDE. « Pas encore lu », « lu, rien trouvé » et « illisible »
   * doivent se distinguer : le premier ne dit rien, le deuxième est un résumé vide EXACT, le troisième retombe
   * sur la page EN LE DISANT. Un tableau vide pour les trois aurait écrit « aucune pièce » sur une panne.
   */
  const [etatPieces, setEtatPieces] = useState<EtatPieces>({ v: 'charge' });

  /**
   * ⚠️ `parametresSansPage` ET NON `parametres` : cette lecture ignore la page, et c'est tout son objet. La
   * prendre en dépendance aurait redemandé les 344 pièces du bien à chaque « Voir la suite → », pour le même
   * résultat — les pièces de la sélection ne changent pas quand on tourne une page.
   */
  useEffect(() => {
    let vivant = true;
    /* ⚠️ ON NE RETOMBE PAS SUR « charge » QUAND ON A DÉJÀ UNE LISTE : le bouton « N pièces » clignoterait à
       chaque case cochée. Même règle que le fil, et pour la même raison. */
    setEtatPieces((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    void (async () => {
      try {
        const sep = parametresSansPage === '' ? '?' : '&';
        const res = await fetch(
          `/api/admin/gestion/historique/pieces${parametresSansPage}${sep}cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string;
          data?: { messages?: MessagePorteurDePieces[]; tronque?: boolean };
        };
        if (!vivant) return;
        /* ⚠️ `sans_schema` ET `inconnue` NE SONT PAS DES PANNES mais ne portent pas de messages : le résumé
           retombe sur la page, et le fil affiche déjà sa propre explication pour ces deux états. */
        setEtatPieces(d.etat === 'ok'
          ? { v: 'ok', messages: d.data?.messages ?? [], tronque: d.data?.tronque === true }
          : { v: 'erreur' });
      } catch {
        if (!vivant) return;
        setEtatPieces({ v: 'erreur' });
      }
    })();
    return () => { vivant = false; };
  }, [lotCle, parametresSansPage, rechargement]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LES MAILS DE LA FRISE ═══════════════════════════════════════════
   *
   * La MÊME lecture que les pièces, pour la MÊME raison : le listing s'arrête à 100 mails, et le bien 421 en
   * porte 326. Une frise bâtie sur la page n'aurait montré ni les traits ni les totaux des deux tiers du
   * courrier — et « jusqu'au premier mail du bien » aurait été faux de trois ans.
   *
   * ⚠️ `parametresSansPage` : la frise ne change pas quand on tourne une page du fil. La redemander à chaque
   * « Voir la suite → » aurait coûté une lecture complète pour un dessin identique.
   *
   * ⚠️ UNE PANNE LAISSE LA FRISE VIDE, ET ELLE NE S'AFFICHE PAS : dessiner une frise plate se lirait « ce bien
   * n'a aucun courrier », exactement le contraire de ce qui s'est passé. Le fil, lui, dit déjà la panne.
   */
  const [friseMails, setFriseMails] = useState<MailDeLaFrise[]>([]);
  const [friseTronquee, setFriseTronquee] = useState(false);
  /** 🔴 LOT HISTORIQUE-BIEN-17 — un trait cliqué dont le mail n'est pas dans la page affichée. Voir `onMail`. */
  const [friseHorsPage, setFriseHorsPage] = useState(false);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const sep = parametresSansPage === '' ? '?' : '&';
        const res = await fetch(
          `/api/admin/gestion/historique/frise${parametresSansPage}${sep}cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; data?: { mails?: MailDeLaFrise[]; tronque?: boolean };
        };
        if (!vivant) return;
        setFriseMails(d.etat === 'ok' ? d.data?.mails ?? [] : []);
        setFriseTronquee(d.etat === 'ok' && d.data?.tronque === true);
      } catch {
        if (!vivant) return;
        setFriseMails([]);
        setFriseTronquee(false);
      }
    })();
    return () => { vivant = false; };
  }, [lotCle, parametresSansPage, rechargement]);

  const motsCherches = useMemo(() => motsRecherches(reglages.texte), [reglages.texte]);
  /**
   * 🔴 LES DEUX NOMBRES DES COMPTEURS, LUS AU SERVEUR (point 3) : ce qu'on a TROUVÉ dans tout le bien, et ce
   * que la sélection contient SANS la recherche. L'écran ne les recompte pas — il n'a qu'une page sous la main.
   */
  const totalTrouve = etat.v === 'ok' ? etat.total : 0;
  const totalSelection = etat.v === 'ok' ? etat.selection : 0;
  /**
   * ══ 🔴🔴 LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER, POINT 3 — UN SEUL TAMIS ════════════════════
   *
   * ARNO : « Quand une recherche est active, elle doit porter sur TOUS les mails du bien qui correspondent aux
   * autres filtres en cours […] via le serveur. »
   *
   * 🔴🔴 L'ÉCRAN NE REFILTRE DONC PLUS, ET C'EST UNE NÉCESSITÉ, PAS UNE ÉCONOMIE. Il n'a du corps qu'un
   * EXTRAIT de 240 caractères : refiltrer ici ce que le serveur vient de trouver dans le corps entier, dans
   * une adresse en copie ou dans le nom d'une pièce AURAIT RETIRÉ ces mails-là, un par un, sans un mot. Le
   * tamis large aurait été annulé par le tamis étroit posé derrière lui.
   *
   * ⚠️ `filtrerParMots` RESTE, ET IL SERT ENCORE : la page de la frise des mails l'emploie, et il reste la
   * définition ÉPROUVÉE de la règle « tous les mots présents, n'importe où » — celle que la condition SQL
   * reproduit mot pour mot. On ne l'appelle simplement plus ici.
   *
   * ⚠️ LES MOTS CHERCHÉS, EUX, RESTENT INDISPENSABLES À L'ÉCRAN : ce sont eux qui surlignent, qui expliquent
   * (`adressesTrouvees`) et qui disent au compteur qu'une recherche est en cours.
   */
  const lignes = lignesPage;

  /**
   * 🔴 LE TRI DES PIÈCES « PAR DATE ET PAR EXPÉDITEUR » N'EST PAS RÉÉCRIT ICI : il vit dans
   * `piecesConversation.ts`, qui alimente déjà le récapitulatif d'une conversation. On lui donne les mails de la
   * page sous la forme qu'il attend (`messagesDuFil`), et il rend la liste classée, dédoublonnée et groupée.
   *
   * ⚠️ LES DEUX RÉSUMÉS (HAUT ET BAS) LISENT **LE MÊME** CALCUL. Deux appels auraient pu diverger d'un ordre, et
   * l'on aurait lu « 7 pièces » en haut et compté neuf cartes en bas — le défaut exact que ce module pur avait été
   * écrit pour fermer.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LE RÉSUMÉ PORTE SUR **TOUTE** LA SÉLECTION ═════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026) : « propriétaire ET locataire cochés → les mails des deux familles s'affichent,
   * mais le résumé ne montre pas les pièces des deux. Suspect : “le résumé porte sur les 100 mails affichés”. »
   *
   * 🔴 SON SOUPÇON ÉTAIT EXACT, ET LA MESURE LE CHIFFRE : sur lot-290, **344 pièces** sur les 326 mails du bien,
   * dont **106 seulement** dans les 100 chargés. Le résumé en montrait moins d'un tiers — et d'autant moins que
   * la sélection était large, ce qui est l'inverse de ce qu'on attend d'un récapitulatif.
   *
   * 🔴 LES PORTEURS VIENNENT DONC D'UNE LECTURE À PART (`/historique/pieces`), qui applique les MÊMES filtres et
   * ne rend QUE ce que le résumé affiche. Voir l'encadré de la route : lever le plafond du listing aurait fait
   * voyager 326 mails entiers pour n'en garder que les pièces.
   *
   * ⚠️ PENDANT UNE RECHERCHE, LE RÉSUMÉ RESTE CELUI DE LA PAGE CHERCHÉE, et c'est voulu : la recherche ne filtre
   * que les mails CHARGÉS (règle d'Arno au lot 3, point 5, parce qu'elle lit le corps et le nom des pièces). Un
   * résumé qui couvrirait toute la sélection pendant qu'on cherche afficherait des pièces de mails que le fil
   * n'affiche plus — exactement le défaut qu'on répare, retourné.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — UNE PIÈCE ENVOYÉE PAR UNE PARTIE NON COCHÉE N'Y FIGURE PAS ════════
   *
   * Constat d'Arno sur lot-146, propriétaire seul coché : le RIB d'un ancien locataire au milieu des pièces de
   * la propriétaire. Mesuré (message 52187) : il la lui avait adressé EN DIRECT — le mail entre donc dans la
   * sélection par elle, et c'est juste pour le LISTING. La règle, et la raison, vivent dans le module pur.
   *
   * 🔴 LE PARTAGE EST FAIT **AVANT** LA CONVERSION, sur la source — c'est le seul endroit où les destinataires
   * existent encore. `MessagePorteur` (le module des pièces d'une conversation) ne les porte pas, et le lui
   * ajouter aurait mis une règle de BIEN dans un module qui sert la fenêtre d'une conversation, laquelle n'a
   * aucune catégorie de partie à consulter.
   *
   * 🔴 LES ÉCARTÉES PASSENT PAR LE MÊME CALCUL QUE LES GARDÉES (`piecesDeLaConversation` + `dedoublonnerPieces`)
   * et c'est ce qui rend le nombre affiché vrai : les pièces techniques et les doublons sont retirés des deux
   * côtés. Compter les pièces brutes des mails écartés aurait annoncé un nombre que le résumé n'aurait jamais
   * pu montrer, même en cochant tout.
   */
  const recap = useMemo(() => {
    /**
     * ══ 🔴🔴 LA RECHERCHE N'EST PLUS UNE EXCEPTION (lot FRISE-PICTOS-PLUS-GRANDS…, point 3) ════════════════
     *
     * Cette ligne valait `etatPieces.v === 'ok' && motsCherches.length === 0` : pendant une recherche, le
     * résumé retombait sur la PAGE. La raison était bonne — la recherche ne filtrait que les mails chargés,
     * et un résumé couvrant toute la sélection aurait montré les pièces de mails que le fil n'affichait plus.
     *
     * 🔴 LA PRÉMISSE EST TOMBÉE : `/historique/pieces` reçoit les MÊMES filtres que le fil, `q=` compris. Sa
     * réponse porte donc exactement les mails trouvés, sur toute la sélection — le résumé et le fil parlent
     * du même ensemble, ce qui est précisément ce que l'ancienne exception cherchait à garantir.
     */
    const surToutLaSelection = etatPieces.v === 'ok';
    const cochees = partiesCochees(reglages.parties);
    let gardes: MessagePorteur[];
    let ecartes: MessagePorteur[];
    if (surToutLaSelection) {
      const t = partagerPourLeResume(etatPieces.messages, cochees);
      gardes = messagesDesPorteurs(t.gardes);
      ecartes = messagesDesPorteurs(t.ecartes);
    } else {
      const t = partagerPourLeResume(lignes, cochees);
      gardes = messagesDuFil(t.gardes);
      ecartes = messagesDuFil(t.ecartes);
    }
    const classees = piecesDeLaConversation(gardes, reglages.ordre);
    const nbEcartees = dedoublonnerPieces(
      piecesDeLaConversation(ecartes, reglages.ordre)).pieces.length;
    return { ...dedoublonnerPieces(classees), surToutLaSelection, nbEcartees };
  /* ⚠️ `motsCherches.length` N'EST PLUS UNE DÉPENDANCE : le résumé ne dépend plus de la présence d'une
     recherche depuis que `/historique/pieces` la reçoit lui aussi (point 3). La garder aurait laissé une
     dépendance que rien ne lit — et le compilateur React le dit. */
  }, [lignes, etatPieces, reglages.ordre, reglages.parties]);
  const groupesPieces = useMemo(() => grouperParMessage(recap.pieces), [recap.pieces]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — LE TOUR DE LA VISIONNEUSE : CE QUI EST À L'ÉCRAN ══════════════════
   *
   * 🔴 DÉFAUT TROUVÉ EN L'ÉCRIVANT, ET IL AURAIT ÉTÉ VISIBLE. Mon premier jet donnait pour tour les seules pièces
   * du RÉSUMÉ. Or deux portes ouvrent cette visionneuse, et la seconde est l'œil d'une miniature du MAIL DÉPLIÉ :
   * une pièce que le point 1 vient d'écarter du résumé (celle d'une partie non cochée) s'ouvre encore là, et le
   * tour ne l'aurait pas contenue. La visionneuse se serait affichée sur un document absent de son propre
   * parcours — un compteur « 0 / 7 », et « Suivant » qui saute ailleurs.
   *
   * 🔴 LE TOUR EST DONC « LES PIÈCES AFFICHÉES DANS CE BLOC » : celles du résumé, puis celles des mails chargés
   * qui n'y sont pas. Rien n'y entre qui ne soit visible à l'écran, et le résumé garde son propre compte — ce
   * sont deux questions différentes, et c'est la seconde qui doit gouverner un parcours.
   *
   * ⚠️ LE PARENT INVENTÉ RESTE CELUI DES PIÈCES DE COURRIER : la frontière qu'il tient est courrier / Drive, et
   * elle est tenue — aucun fichier du Drive ne peut entrer dans ce tour, aucune pièce n'en sort.
   */
  const piecesVisionnables = useMemo(() => {
    const vues = new Set(recap.pieces.map((p) => p.pieceId));
    const duFil = piecesDeLaConversation(messagesDuFil(lignes), reglages.ordre);
    return [...recap.pieces, ...duFil.filter((p) => !vues.has(p.pieceId))];
  }, [recap.pieces, lignes, reglages.ordre]);
  const conversations = useMemo(() => grouperParConversation(lignes), [lignes]);

  /**
   * ⚠️ « TOUT REMETTRE À PLAT » EFFACE AUSSI LA SAISIE, et c'est précisément ce qu'un oubli aurait laissé derrière
   * (lot HISTORIQUE-BIEN-2). `reglages.texte` revient à vide par `REGLAGES_DEFAUT` ; sans la ligne ci-dessous, le
   * CHAMP garderait les lettres tapées — puis l'effet de silence les repousserait aussitôt dans les réglages, et
   * le bouton n'aurait eu l'air de rien faire. Écrit une fois, appelé aux deux endroits qui l'offrent.
   */
  const remettreAPlat = useCallback((): void => {
    setReglages(REGLAGES_DEFAUT);
    setBascules(new Set());
    setSaisie('');
  }, []);

  /** Déplier ou replier un mail. Écrit une fois : les deux montages du fil (groupé ou non) s'en servent. */
  const basculerMail = useCallback((messageId: number): void => setDeplie((s) => {
    const n = new Set(s);
    if (n.has(messageId)) n.delete(messageId); else n.add(messageId);
    return n;
  }), []);

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — RÉPONDRE SANS QUITTER LA FICHE
     ════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * UN SEUL BROUILLON À LA FOIS, ET SOUS QUEL MAIL IL S'OUVRE — la règle de la conversation (`brouillon` +
   * `brouillonSous`), reprise telle quelle : deux éditeurs ouverts sur une même page sont deux messages non
   * envoyés dont on oublie le premier.
   *
   * ⚠️ LA CLÉ EST LE `messageId`, JAMAIS L'INDEX DE LA LIGNE : la liste se recharge (filtre, page, envoi), et un
   * index aurait rouvert l'éditeur sous le mail du voisin.
   */
  const [reponse, setReponse] = useState<{ messageId: number; brouillon: BrouillonEcran } | null>(null);

  /**
   * ══ 🔴🔴 OUVRIR LA RÉPONSE SOUS **CE** MAIL — PAR LA MÊME PORTE QUE LA BOÎTE ═══════════════════════════════
   *
   * 🔴 TOUTE LA DÉCISION VIT DANS `preparerBrouillon`, LE MODULE PUR, et pas une ligne n'en est réécrite ici :
   * qui reçoit quoi (Répondre = l'expéditeur, ou son Reply-To s'il en a demandé un ; Répondre à tous =
   * l'expéditeur + À + Cc, nos adresses retirées ; Transférer = personne, à nous de dire à qui), l'objet
   * « Re: » / « Tr: », la citation en texte ET en HTML. Une seconde écriture de ces règles ici aurait divergé de
   * la boîte au premier ajustement — et c'est la réponse d'un client qui serait partie à la mauvaise personne.
   *
   * 🔴 LES PIÈCES D'UN TRANSFERT SUIVENT, ET CÔTÉ SERVEUR : c'est le premier enregistrement du brouillon qui les
   * reprend (`reprendrePiecesDuMessage`, route des brouillons), parce qu'il est le seul moment où l'on sait de
   * quel message on transfère. Rien à faire ici — et surtout rien à refaire.
   *
   * ══ 🔴🔴 CE DONT LA RÉPONSE HÉRITE : LE BIEN, EN VERT ══════════════════════════════════════════════════════
   *
   * ARNO : « Le message part déjà rattaché exactement comme le mail auquel il répond […] Le bloc “CLASSER CE
   * MAIL” affiche cet état en VERT “Rattaché à <lot · adresse>” — pas le choix rouge “Rattacher / Interne”. »
   *
   * 🔴 C'EST `classementHerite`, LA MÊME FONCTION QUE LA CONVERSATION. La case verte, le lien « Modifier le
   * rattachement » et le report du rattachement sur le message envoyé en découlent sans une ligne de plus : le
   * champ est déjà écrit, et il lit `brouillon.cibles`. Le bien est CELUI DE CETTE FICHE — pas un bien deviné
   * des destinataires — avec le libellé que la ligne porte déjà.
   *
   * ⚠️ L'ÉVÉNEMENT N'EST PAS UNE CIBLE DE CE BROUILLON, ET IL N'A PAS À L'ÊTRE. L'appartenance d'un mail à un
   * événement est DÉRIVÉE, jamais posée : son fil est affecté à l'événement et sa date tombe dans une période
   * ouverte (`sqlEvenementsDesFils`). Une réponse part dans le MÊME fil, à l'instant présent : elle entre donc
   * dans l'événement par la porte de tous les autres mails. Lui poser en plus une cible `evenement` aurait
   * ajouté un second chemin pour un fait déjà vrai — et deux vérités à tenir d'accord.
   */
  const repondreAuMail = useCallback((
    l: LigneHistorique, voie: VoieRedaction, corps: string | null, html: string | null,
  ): void => {
    if (redaction === null) return;
    const b = preparerBrouillon(voie, {
      messageId: l.messageId, de: l.de, deNom: l.deNom, objet: l.objet, recuLe: l.recuLe,
      corps: corps ?? l.extrait,
      /* ⚠️ `null` ET `[]` NE SE CONFONDENT PAS (migration 235) : « personne en copie » n'est pas « on ne sait
         pas qui était en copie ». La ligne porte des tableaux VIDES quand elle sait : on les passe tels quels,
         sinon « Répondre à tous » retomberait sur la liste fondue, qu'il faut relire avant d'envoyer. */
      destA: l.a, destCc: l.cc, destReplyTo: l.repondreA,
      destinatairesFondus: l.destinataires.join(', '),
    }, { adresseGestion: redaction.adresseGestion, signature: redaction.signature },
    { filId: l.filId, dateLisible: dateHeureComplete(l.recuLe), origineHtml: html });
    const herite = classementHerite({
      biens: [{ sorte: 'lot', cle: lotCle, id: null, libelle: l.cibleLibelle }],
    });
    setReponse({
      messageId: l.messageId,
      brouillon: {
        ...b, id: null, cibles: herite.cibles, interne: herite.interne, horsGestion: herite.horsGestion,
      },
    });
    /* 🔴 ON DÉPLIE LE MAIL VISÉ : l'éditeur est caché quand son mail est replié, et un bouton dont l'effet est
       invisible est un bouton cassé (lot REPONSE-VISIBLE). Le geste vient d'un mail DÉJÀ déplié — c'est une
       ceinture, pas une bretelle. */
    setDeplie((d) => (d.has(l.messageId) ? d : new Set(d).add(l.messageId)));
  }, [redaction, lotCle]);

  /** 🔴 L'ÉDITEUR PEUT-IL SEULEMENT S'OUVRIR ? Les deux mêmes conditions que la conversation, pas une de plus. */
  const peutRepondre = redaction !== null && redaction.schemaPret && redaction.peutEnvoyer;

  /**
   * 🔴 L'ÉDITEUR SOUS UN MAIL, ÉCRIT UNE SEULE FOIS. Le fil se monte de DEUX façons (groupé par conversation ou
   * à plat) : deux rendus de l'éditeur auraient fini par diverger d'une propriété, et c'est le montage qu'on
   * regarde le moins qui aurait gardé l'erreur.
   */
  const composeurDuMail = useCallback((l: LigneHistorique): ReactNode => {
    if (reponse === null || reponse.messageId !== l.messageId || redaction === null) return null;
    return (
      <Redaction brouillon={reponse.brouillon} contexte={redaction}
        onChange={(b) => setReponse((r) => (r === null ? null : { ...r, brouillon: b }))}
        onFerme={() => setReponse(null)}
        /* 🔴 ENVOYÉ : on referme, et on RELIT. Le mail parti doit apparaître dans l'historique tout de suite,
           dans la même conversation et avec sa capsule — « sans rechargement de page » (Arno). `rechargement`
           est le compteur que ce bloc emploie déjà pour toutes ses relectures : il n'y en a pas un second. */
        onEnvoye={() => { setReponse(null); setRechargement((n) => n + 1); }}
        onGeste={(m, o) => onGesteMail?.(m, o)} />
    );
  }, [reponse, redaction, onGesteMail]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « SORTIR DU SUIVI » ═══════════════════════════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DEMANDE D'ARNO (05/10/2026) : « Effet : le mail est détaché de CE bien uniquement, avec ses pièces (elles
   * quittent le résumé de ce bien). On passe par la porte existante des fenêtres de suivi, fenêtre “Ce mail
   * uniquement” (exception). Aucun second chemin. Les autres biens éventuels du mail ne bougent pas. »
   *
   * 🔴 LE GESTE EST DONC EXACTEMENT CELUI DE LA FENÊTRE « Modifier les biens rattachés à ce mail » : le même
   * `POST /api/admin/gestion/suivi`, le même `choix: 'mail'`, le même dépôt (`poserClassement`), le même journal,
   * la même projection et la même annulation. Ce qui change tient en une ligne — la liste des biens reposée est
   * celle du mail MOINS celui qu'on regarde, et c'est le module pur `sortirDuSuivi` qui la calcule.
   *
   * 🔴 LES BIENS ACTUELS SONT DEMANDÉS AU MOMENT DU CLIC, et non chargés avec la page. Le bouton est rare ; les
   * demander pour les cent mails affichés aurait coûté une requête à chaque ouverture de l'historique, pour une
   * information dont on ne se sert presque jamais.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [aSortir, setASortir] = useState<LigneHistorique | null>(null);
  const [sortieEnCours, setSortieEnCours] = useState(false);
  const [sortieRefus, setSortieRefus] = useState<string | null>(null);
  /** Le geste fait, et sa TRACE — c'est elle, et elle seule, que `annulerClassement` sait défaire. */
  const [sortieFaite, setSortieFaite] = useState<{ mot: string; trace: unknown } | null>(null);
  const [annulationSortie, setAnnulationSortie] = useState(false);
  /**
   * 🔴 LE COMPTEUR DE RECHARGEMENT : « Annuler » doit rétablir EXACTEMENT l'état d'avant, et la seule façon
   * honnête est de redemander la page au serveur. Reconstruire la ligne de mémoire aurait rendu une ligne
   * plausible — avec son statut d'avant le geste, ses événements, sa capsule — sans garantie qu'elle soit juste.
   */

  useEffect(() => {
    if (sortieFaite === null) return undefined;
    const t = setTimeout(() => setSortieFaite(null), SECONDES_ANNULER_SORTIE * 1000);
    return () => { clearTimeout(t); };
  }, [sortieFaite]);

  /** L'adresse du bien, telle que la question d'Arno la nomme. Voir `adresseDuBien`. */
  const adresseBien = etat.v === 'ok' ? adresseDuBien(etat.titre) : 'ce bien';

  /**
   * 🔴 LE BOUTON N'EST OFFERT QUE SUR UN MAIL QUI ENTRE ICI PAR UN **RATTACHEMENT**. Un mail amené par la carte
   * d'un événement (`source: 'carte'`) n'a aucun lien de bien à retirer : le bouton aurait posé une question, puis
   * n'aurait rien fait — et l'on aurait cherché pourquoi le mail est toujours là.
   */
  const sortieOfferte = useCallback(
    (l: LigneHistorique) => (l.source !== 'rattachement' ? undefined : {
      aide: aideSortirDuSuivi(adresseBien),
      onSortir: () => { setSortieRefus(null); setASortir(l); },
    }),
    [adresseBien]);

  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — « MODIFIER LE RATTACHEMENT », VOISIN DE « SORTIR DU SUIVI » ════
   *
   * DEMANDE D'ARNO (06/10/2026) : « À côté de “Sortir du suivi”, même style, un second bouton “Modifier le
   * rattachement”. Il ouvre la fenêtre “Bien(s) rattaché(s) à ce mail” […] MAIS en mode PONCTUEL. »
   *
   * 🔴 IL EST OFFERT SUR TOUS LES MAILS, et non seulement sur ceux qui entrent par un rattachement — contrairement
   * à son voisin. La raison est dans le geste : « Sortir du suivi » RETIRE un lien, et n'a donc rien à faire sur
   * un mail qui n'en a pas ; « Modifier le rattachement » peut au contraire en AJOUTER un, et c'est exactement ce
   * qu'on veut sur un mail amené ici par la carte d'un événement.
   *
   * ⚠️ IL LUI FAUT UN ÉCHANGE : la fenêtre porte sur un mail DANS sa conversation. Sans `filId`, elle ne saurait
   * ni lire ni écrire — le bouton n'est alors pas rendu, plutôt qu'offert et inerte.
   */
  const [aModifier, setAModifier] = useState<LigneHistorique | null>(null);
  const modificationOfferte = useCallback(
    (l: LigneHistorique) => (l.filId === null || l.filId === undefined ? undefined : {
      aide: aideModifierLeRattachement(adresseBien),
      onModifier: () => setAModifier(l),
    }),
    [adresseBien]);

  /**
   * 🔴🔴 LE GESTE, EN TROIS TEMPS : on lit les biens actuels du mail, on repose l'exception sans celui-ci, et on
   * retire la ligne de l'écran — compteur et résumé compris.
   *
   * ⚠️ LES PIÈCES SONT RETIRÉES DU RÉSUMÉ PAR LA MÊME OCCASION (`etatPieces`), et c'est la demande d'Arno mot pour
   * mot : « avec ses pièces (elles quittent le résumé de ce bien) ». Sans cette ligne, le mail aurait disparu du
   * fil et ses pièces seraient restées dans le compte — le genre d'écart qui fait douter du compte entier.
   */
  const confirmerSortie = async (): Promise<void> => {
    const l = aSortir;
    if (l === null || sortieEnCours) return;
    setSortieEnCours(true);
    setSortieRefus(null);
    try {
      /**
       * ══ 🔴🔴 ON PART DE CE QUE LE SUIVI DIT DE CE MAIL, PAS DE SES LIENS ══════════════════════════════════════
       *
       * `GET /suivi?fil=N` rend les PÉRIODES et les EXCEPTIONS de la conversation ; `projeter` — le module pur du
       * suivi — en tire la configuration EN VIGUEUR sur ce mail, personnes et contacts extérieurs compris. C'est
       * elle qu'on repose moins ce bien.
       *
       * 🔴 LES LIENS NE SONT QU'UN REPLI, pour un mail qu'aucune fenêtre ne couvre (voir `classementSansLeBien`).
       * Les lire comme source principale a produit deux dégâts lors de l'essai réel du 05/10 — un propriétaire
       * reposé en lot, puis son intervention perdue. L'encadré du module pur les raconte.
       */
      const [rSuivi, res] = await Promise.all([
        fetch(`/api/admin/gestion/suivi?fil=${l.filId}`, { cache: 'no-store' }),
        fetch(`/api/admin/gestion/rattachements?messages=${l.messageId}`, { cache: 'no-store' }),
      ]);
      const dSuivi = (await rSuivi.json().catch(() => ({}))) as {
        etat?: string; periodes?: Periode[]; exceptions?: ExceptionMail[]; mails?: number[];
      };
      /**
       * ══ 🔴🔴 LA FORME DE CETTE RÉPONSE EST `{ data: { "<messageId>": liens[] } }` ════════════════════════════
       *
       * 🔴 ET LA LIRE DE TRAVERS N'EST PAS SANS CONSÉQUENCE — c'est le défaut que l'essai réel du 05/10/2026 a
       * trouvé, sur le mail 57471 de lot-27. En lisant un `liens` qui n'existe pas, on obtenait un tableau VIDE :
       * l'exception était alors posée SANS AUCUN BIEN, et le mail perdait aussi son PROPRIÉTAIRE — exactement ce
       * qu'Arno interdit (« les autres biens éventuels du mail ne bougent pas »). Rétabli par l'annulation.
       *
       * ⚠️ UNE LECTURE QUI ÉCHOUE NE DOIT DONC JAMAIS SE LIRE « ce mail n'a aucun bien » : sans liens reçus, on
       * refuse le geste plutôt que de tout retirer. Un tableau vide est une réponse VALIDE de ce dépôt (un mail
       * sans aucun lien), mais nous n'y arrivons que si le mail est listé ici — donc rattaché.
       */
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; data?: Record<string, LienAffiche[]>;
      };
      const liens = d.etat === 'ok' ? (d.data?.[String(l.messageId)] ?? []) : null;
      if (liens === null) {
        setSortieRefus('Les biens de ce mail n’ont pas pu être lus : rien n’a été changé.');
        return;
      }
      const enVigueur = dSuivi.etat !== 'ok' ? undefined : projeter(
        dSuivi.mails ?? [], dSuivi.periodes ?? [], dSuivi.exceptions ?? [],
      ).get(l.messageId);
      const envoi = await fetch('/api/admin/gestion/suivi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filId: l.filId, messageId: l.messageId, choix: 'mail',
          classement: classementSansLeBien({ enVigueur, liens, cleDuBien: lotCle }),
        }),
      });
      const r = (await envoi.json().catch(() => ({}))) as { ok?: boolean; trace?: unknown; erreur?: string };
      if (!envoi.ok || r.ok !== true) {
        setSortieRefus(r.erreur ?? 'Ce mail n’a pas pu être sorti du suivi.');
        return;
      }
      /* ① LE FIL ET SON COMPTEUR, en direct. */
      setEtat((e) => (e.v !== 'ok' ? e : {
        ...e,
        lignes: e.lignes.filter((x) => x.messageId !== l.messageId),
        total: Math.max(0, e.total - 1),
      }));
      /* ② LE RÉSUMÉ DES PIÈCES : le mail sorti emporte les siennes. */
      setEtatPieces((e) => (e.v !== 'ok' ? e : {
        ...e, messages: e.messages.filter((m) => m.messageId !== l.messageId),
      }));
      /* ③ LES COMPTEURS DE LA BOÎTE, et la fenêtre « Visualiser / Modifier » si elle est ouverte sur ce mail. */
      annoncerClassement({ messageId: l.messageId, filId: l.filId });
      setASortir(null);
      setSortieFaite({ mot: motMailSorti(adresseBien), trace: r.trace });
    } catch {
      setSortieRefus('Ce mail n’a pas pu être sorti du suivi : le serveur n’a pas répondu.');
    } finally {
      setSortieEnCours(false);
    }
  };

  /**
   * 🔴 « ANNULER » EST LA PORTE D'ANNULATION DU SUIVI, pas une seconde écriture : `POST { annuler: trace }`, celle
   * que la fenêtre de suivi emprunte déjà. Elle rouvre les exceptions retirées et reprojette — c'est la seule
   * chose qui rétablisse EXACTEMENT l'état d'avant.
   *
   * ⚠️ ET LA PAGE EST REDEMANDÉE ENSUITE : la ligne revient avec son statut, ses événements et sa capsule tels que
   * le serveur les connaît, jamais tels qu'on les aurait reconstruits de mémoire.
   */
  const annulerSortie = async (): Promise<void> => {
    if (sortieFaite === null || annulationSortie) return;
    setAnnulationSortie(true);
    try {
      const res = await fetch('/api/admin/gestion/suivi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annuler: sortieFaite.trace }),
      });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || r.ok !== true) {
        setSortieRefus(r.erreur ?? 'L’annulation n’a pas pu être faite.');
        return;
      }
      setSortieFaite(null);
      setRechargement((n) => n + 1);
      annoncerClassement({ messageId: 0, filId: null });
    } catch {
      setSortieRefus('L’annulation n’a pas pu être faite : le serveur n’a pas répondu.');
    } finally {
      setAnnulationSortie(false);
    }
  };

  /** Par mail, le fil d'où il vient — la fenêtre « Ranger » en a besoin, et le fil change d'un mail à l'autre. */
  const filDuMessage = useMemo(
    () => new Map(lignes.map((l) => [l.messageId, l.filId])), [lignes]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LES PIÈCES DE CHAQUE CONVERSATION, POUR LES NOMS CITÉS ═══════════
   *
   * CONSTAT D'ARNO : le mail de Louis Vaglio du 30/06/2026 affiche trois noms de fichiers et aucune pièce.
   * Vérifié dans Gmail : ce mail n'en porte AUCUNE — les noms sont ceux du mail CITÉ du 11/11/2025, dont les
   * fichiers existent chez nous, sur quatre mails du MÊME fil.
   *
   * 🔴 LA SOURCE EST `recap.pieces`, DÉJÀ CALCULÉE : le résumé des pièces couvre toute la sélection et porte,
   * pour chaque pièce, le mail qui l'a apportée, sa date et son expéditeur. Tout ce qu'il manquait était le FIL
   * de ce mail, et `filDuMessage` le donne. Aucune lecture de plus.
   *
   * ⚠️ `piecesAvantDedoublonnage` ET NON `recap.pieces` : le dédoublonnage ne garde qu'UNE copie par contenu, et
   * c'est exactement ce qu'il ne faut pas ici — les quatre copies du RIB sont sur quatre mails, et c'est celle
   * du mail CITÉ qu'il faut pouvoir désigner. Les apparitions écartées sont donc reprises.
   */
  const piecesParFil = useMemo(() => {
    const m = new Map<number, PieceCitable[]>();
    const poser = (p: {
      pieceId: number; nomFichier: string; messageId: number; recuLe: string; de: string;
    }): void => {
      const fil = filDuMessage.get(p.messageId);
      if (fil === undefined) return;
      m.set(fil, [...(m.get(fil) ?? []), {
        pieceId: p.pieceId, nomFichier: p.nomFichier, messageId: p.messageId, recuLe: p.recuLe, de: p.de,
      }]);
    };
    for (const p of recap.pieces) {
      poser(p);
      /**
       * 🔴 LES AUTRES APPARITIONS DU MÊME CONTENU : ce sont elles qui portent les copies des autres mails.
       *
       * ⚠️ ELLES REPRENNENT LE NOM DE LA PREMIÈRE, et c'est exact : une « autre apparition » est le MÊME
       * contenu (rapproché par empreinte), donc le même fichier. Le nom cité dans un corps désigne ce
       * fichier-là, quel que soit le mail qui le portait.
       */
      for (const a of p.autresApparitions) poser({ ...a, nomFichier: p.nomFichier });
    }
    return m as ReadonlyMap<number, PieceCitable[]>;
  }, [recap.pieces, filDuMessage]);

  // ── ④ CE QUI EST DÉJÀ DANS LE DRIVE, EN UNE SEULE REQUÊTE POUR TOUTE LA PAGE ───────────────────────────────────
  /**
   * ⚠️ LES IDENTIFIANTS SONT TRIÉS, ET CE N'EST PAS DE LA COQUETTERIE : sans tri, ils suivent l'ordre
   * D'AFFICHAGE, donc inverser le fil changerait l'adresse demandée — et relancerait une requête pour obtenir
   * exactement la même réponse. L'adresse ne doit dépendre que de l'ENSEMBLE des pièces, pas de leur ordre.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LES PIÈCES DU RÉSUMÉ EN FONT PARTIE, MAIS SEULEMENT S'IL EST OUVERT
   *
   * Depuis ce lot, le résumé montre les pièces de TOUTE la sélection : beaucoup ne viennent d'aucun mail de la
   * page, et leur demander leur état dans le Drive est la seule façon de ne pas perdre le picto sur elles.
   *
   * ⚠️ SEULEMENT QUAND IL EST OUVERT, et ce n'est pas une optimisation de confort : le résumé est REPLIÉ par
   * défaut, et sur le bien le plus fourni il porte 782 pièces (bien 282, mesuré le 05/10/2026). Les demander à
   * l'arrivée, pour un bloc que personne n'a encore déplié, aurait fait payer trois requêtes de plus à chaque
   * ouverture de l'historique — pour un affichage que personne ne regarde.
   *
   * ⚠️ LES PIÈCES DE LA PAGE RESTENT DEMANDÉES EN TOUT TEMPS : ce sont elles qui portent le picto sur les
   * lignes du fil, résumé ouvert ou fermé.
   */
  /**
   * ⚠️ UNE CHAÎNE, ET NON UN TABLEAU, ET CE N'EST PAS UN DÉTAIL DE STYLE : `relireDrive` en dépend, et un
   * tableau est une valeur NEUVE à chaque calcul. Inverser l'ordre du fil recalcule le résumé, donc ce mémo —
   * avec un tableau, le crochet se serait rearmé et la requête serait repartie pour obtenir la même réponse.
   * C'est exactement ce que l'épreuve « inverser l'ordre ne relance pas la requête de statut Drive » tient.
   */
  const idsPieces = useMemo(
    () => {
      const duFil = lignes.flatMap((l) => l.pieces.map((p) => p.pieceId));
      const duResume = resumeOuvert ? idsDesPiecesEtDeLeursJumelles(recap.pieces) : [];
      return [...new Set([...duFil, ...duResume])].sort((a, b) => a - b).join(',');
    },
    [lignes, resumeOuvert, recap.pieces]);
  /**
   * ⚠️ DÉCOUPÉ EN TRANCHES DE `PIECES_DRIVE_MAX`, PARCE QUE LA ROUTE BORNE — et qu'au-delà elle tronque sans le
   * dire. Une seule demande de 782 identifiants aurait rendu l'état des 300 premières et rien pour les autres :
   * le picto aurait manqué, sans message, exactement là où il est le plus utile.
   *
   * ⚠️ LES TRANCHES SONT DEMANDÉES ENSEMBLE (`Promise.all`) puis fondues en une seule fois : deux `setDepots`
   * successifs auraient fait clignoter les pictos, et un rendu intermédiaire aurait affiché un état partiel.
   */
  const relireDrive = useCallback(async (): Promise<void> => {
    if (idsPieces === '') { setDepots(new Map()); setEmplacements(new Map()); return; }
    const tous = idsPieces.split(',');
    const tranches: string[][] = [];
    for (let i = 0; i < tous.length; i += PIECES_DRIVE_MAX) tranches.push(tous.slice(i, i + PIECES_DRIVE_MAX));
    try {
      const reponses = await Promise.all(tranches.map(async (t) => {
        const res = await fetch(`/api/admin/gestion/pieces-drive?pieces=${t.join(',')}`, { cache: 'no-store' });
        return (await res.json()) as { depots?: DepotAffiche[]; emplacements?: StatutPieceDrive[] };
      }));
      setDepots(new Map(reponses.flatMap((d) => (d.depots ?? []).map((x) => [x.pieceId, x] as const))));
      setEmplacements(new Map(
        reponses.flatMap((d) => (d.emplacements ?? []).map((x) => [x.pieceId, x.emplacements] as const))));
    } catch {
      // Silence volontaire : on perd la mention « Dans le Drive » et le picto, jamais la liste des pièces.
      setDepots(new Map());
      setEmplacements(new Map());
    }
  }, [idsPieces]);
  useEffect(() => { void relireDrive(); }, [relireDrive]);

  // ── ⑤ LES PARTIES, EN QUATRE GROUPES ──────────────────────────────────────────────────────────────────────────
  const interlocuteurs = etat.v === 'ok' ? etat.interlocuteurs : [];
  /**
   * 🔴🔴 LA FUSION DES DEUX PROVENANCES, ET SON ORDRE EST LA RÈGLE.
   *
   * La fiche dit qui sont les **clients** (ses propriétaires, ses occupants d'hier et d'aujourd'hui) : ça, elle
   * seule le sait, et ça ne se discute pas. La base dit où ont été rangés les **tiers** — syndic, artisan,
   * assureur, et les indépendants.
   *
   * ⚠️ LA FICHE PASSE EN PREMIER ET N'EST JAMAIS RECOUVERTE : un contact n'est pas un client (décision d'Arno), et
   * la réciproque compte autant — **un client ne doit jamais pouvoir être rangé ailleurs par une ligne de
   * catégorie**. Si l'adresse d'un propriétaire se retrouvait un jour dans la table, elle resterait propriétaire
   * ici. La reprise ne pose d'ailleurs aucune ligne sur une adresse que l'annuaire reconnaît : ce garde protège
   * donc d'un futur, pas d'un présent.
   */
  /**
   * ⚠️ LA FUSION EST DESCENDUE DANS LE MODULE PUR (lot PJ-STATUT-ENVOI-FAMILLES) : les capsules des miniatures
   * doivent lire EXACTEMENT la même carte que ce bloc, et elle vivait ici, dans un composant de navigateur.
   * `categoriesDuBien` porte la règle — la fiche l'emporte sur les rangements — et les deux écrans l'appellent.
   */
  const categoriesFusionnees = useMemo(
    () => fusionnerCategories(categories, categoriesRangees),
    [categories, categoriesRangees]);

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES CLIENTS DE LA FICHE COMPLÈTENT LA LISTE AVANT LE RANGEMENT.
   *
   * ⚠️ AVANT `grouperParCategorie`, ET NON APRÈS : ainsi un client ajouté passe par la MÊME règle de rangement
   * que tout le monde (la fusion des catégories, où la fiche l'emporte), et atterrit dans son encart sans qu'on
   * ait à le poser à la main. Le poser après aurait fait un second juge du groupe d'une personne.
   */
  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — QUEL LOCATAIRE PEUPLE L'ENCART
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * LE LOCATAIRE EN PLACE À L'ARRIVÉE, et c'est la demande d'Arno mot pour mot : « PAR DÉFAUT : seulement le
   * locataire EN PLACE ». Un seul objet d'état ⇒ **il ne PEUT pas en désigner deux** : l'exclusivité n'est pas
   * vérifiée, elle est impossible à enfreindre. C'est la forme qui tient la règle.
   */
  const [choixLocataire, setChoixLocataire] = useState<ChoixLocataire>(
    () => choixLocataireParDefaut(cartesLocataires));
  /* ⚠️ `CHOIX_LOCATAIRE_DEFAUT` est le choix « locataire en place » : c'est lui que le bouton de gauche repose. */
  /**
   * 🔴 LA PÉRIODE MISE DE CÔTÉ, pour « revenir au locataire en place remet la période précédente » (Arno). Elle
   * est gardée AU PREMIER départ seulement : passer d'un ancien à un autre ne doit pas oublier celle d'origine,
   * sinon le retour rendrait les dates du locataire qu'on vient de quitter — pas celles d'avant le détour.
   */
  const [periodeAvant, setPeriodeAvant] = useState<ChoixPeriode | null>(null);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-15 — LA LISTE DES CARTES EST-ELLE AFFICHÉE À LA PLACE DES CAPSULES ?
   *
   * ⚠️ C'EST UN PASSAGE, PAS UN ÉTAT DE LECTURE : elle s'ouvre au clic sur « Anciens locataires » et se referme
   * dès qu'on a choisi (« le choix la valide », Arno) ou qu'on revient aux locataires actuels. L'état qui compte,
   * lui, est `choixLocataire` — c'est lui que l'en-tête affiche en noir, et lui que la recherche suit.
   */
  const [listeAnciensOuverte, setListeAnciensOuverte] = useState(false);

  const anciens = useMemo(() => anciensLocataires(cartesLocataires), [cartesLocataires]);
  /**
   * 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — L'ONGLET « ANCIENS » EST-IL AFFICHÉ ? Écrit ICI, et nulle part
   * ailleurs : l'en-tête le reçoit, et l'encart s'en sert pour son liseré. Arno : « Onglet “Anciens locataires”
   * affiché → liseré VIOLET. »
   */
  const surAnciens = choixLocataire.sorte === 'ancien' || listeAnciensOuverte;

  /**
   * ══ 🔴🔴 CHANGER DE LOCATAIRE — UN SEUL CALCUL, COMME ARNO LE DEMANDE ═══════════════════════════════════════
   *
   * « Le listing, le compteur en direct et le résumé des pièces suivent (un seul calcul). »
   *
   * 🔴 ET VOICI CE QUI LE REND VRAI : les trois lisent `reglages.parties`, PAS les capsules affichées.
   *
   * ══ 🔴🔴 REQUALIFIÉ LE 07/10/2026 — LOT PARTIES-LOCATAIRES-EXCLUSIF : CHANGER D'ONGLET NE DÉCOCHE PLUS ══════
   *
   * CE GESTE ÉLAGUAIT LA SÉLECTION : `parties.filter(adresseGardeeDansLencart(…, choix))`. Il protégeait d'une
   * adresse « cochée puis cachée », restée dans la recherche alors que sa capsule avait disparu.
   *
   * 🔴 ARNO TRANCHE AUTREMENT, ET SES DEUX PHRASES SE TIENNENT : « Changer d'onglet ne modifie pas la sélection à
   * lui seul. C'est cocher dans l'autre groupe qui bascule » — et « plusieurs anciens locataires peuvent être
   * cochés ensemble ». Or la liste des anciens est un bouton RADIO : on n'en voit qu'un à la fois. Cocher deux
   * anciens EXIGE donc que passer de l'un à l'autre garde le premier coché. L'élagage le rendait impossible.
   *
   * 🔴 ET CE QU'IL PROTÉGEAIT EST REPRIS, MIEUX : l'incohérence qu'il visait — voir les mails d'un ancien pendant
   * qu'on affiche l'actuel — est désormais fermée par `exclusiviteLocataires`, qui agit AU MOMENT DU COCHAGE
   * plutôt qu'au changement d'onglet. La protection a changé de déclencheur, pas d'objet.
   *
   * ⚠️ `periodeDuChoixLocataire` REND `null` POUR LE LOCATAIRE EN PLACE, et c'est lui qui distingue les deux
   * sens : on met de côté en partant, on remet en revenant. Le module pur ne connaît pas la période d'avant —
   * c'est l'écran qui s'en souvient, et lui seul. CE PAN-LÀ NE BOUGE PAS.
   */
  const choisirLocataire = (choix: ChoixLocataire): void => {
    const imposee = periodeDuChoixLocataire(cartesLocataires, choix, evtsParLocataire, maintenant);
    if (imposee !== null && periodeAvant === null) setPeriodeAvant(reglages.periode);
    if (imposee === null) setPeriodeAvant(null);
    setChoixLocataire(choix);
    setReglages((r) => ({ ...r, periode: imposee ?? periodeAvant ?? r.periode }));
  };

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — LES CONTACTS DE LA LOCATION REGARDÉE ENTRENT ICI ═════════════════
   *
   * 🔴 **AVANT** `grouperParCategorie`, comme les clients juste au-dessus, et pour la même raison : un contact
   * ajouté passe par la MÊME règle de rangement que tout le monde (il ira dans « Locataire » s'il y est rangé,
   * dans « Non affectés » sinon). Le poser après aurait fait un second juge du groupe d'une personne.
   *
   * 🔴 ET IL FAUT LES AJOUTER, PAS SEULEMENT FILTRER : choisir un ancien locataire règle la période sur son
   * occupation, et ses contacts annexes écrivent souvent APRÈS son départ — c'est tout le cas d'Arno. Ils sont
   * donc absents de la liste que la route rend sur cette période.
   */
  const interlocuteursEtClients = useMemo(
    () => completerAvecLesContactsDuLocataire(
      completerAvecLesClients(interlocuteurs, clients),
      contactsLocataires, cartesLocataires, choixLocataire),
    [interlocuteurs, clients, contactsLocataires, cartesLocataires, choixLocataire]);

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — LES ADRESSES CLIENTES, POUR QU'UNE DES NÔTRES NE SOIT PAS ÉCARTÉE.
   * Décision d'Arno : le propriétaire client de lot-299 garde sa capsule même en `@sansvisavis.com`.
   */
  const adressesClientes = useMemo(() => {
    const e = new Set<string>();
    for (const c of clients) {
      const a = (c.adresse ?? '').trim().toLowerCase();
      if (a !== '') e.add(a);
    }
    return e as ReadonlySet<string>;
  }, [clients]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 4 — L'ORDRE DES CAPSULES, GROUPE PAR GROUPE ═════════════════════════════
   *
   * RÈGLE D'ARNO : « D'abord les CLIENTS, triés par “a écrit” décroissant ; puis les CONTACTS, triés par “a
   * écrit” décroissant ; à égalité, par “en copie” décroissant, puis par nom. L'ordre se recalcule quand la
   * période change. »
   *
   * 🔴 IL SE RECALCULE AVEC LA PÉRIODE SANS RIEN DE PLUS : ce `useMemo` dépend de `interlocuteursEtClients`, qui
   * vient de la route — et la route calcule `aEcrit` et `enCopie` SUR LA PÉRIODE DEMANDÉE. Changer les bornes
   * change les compteurs, donc l'ordre. Trier en SQL aurait exigé de le refaire à chaque borne, avec le risque
   * d'afficher un ordre calculé sur une autre période que celle qu'on montre.
   *
   * ⚠️ `categories` ET NON `categoriesFusionnees` : la sorte d'une capsule se lit sur la carte de la FICHE,
   * exactement comme le font `sorteDeCapsule` pour la pastille et `partieDeplacable` pour le glisser. Lire la
   * carte fusionnée ici aurait fait passer pour client un contact rangé en base, et il serait remonté en tête.
   */
  const parties = useMemo(() => {
    const r = grouperParCategorie(interlocuteursEtClients, categoriesFusionnees, adressesClientes);
    return {
      ...r,
      groupes: r.groupes.map((g) => {
        /**
         * ══ 🔴🔴 LOT HISTORIQUE-BIEN-13, POINT 1 — UN SEUL LOCATAIRE À LA FOIS, ET LE COMPTEUR SUIT ═══════════
         *
         * CONSTAT D'ARNO (lot-146) : « Locataire 6 » mêlait le locataire en place et deux anciens.
         *
         * 🔴 LE FILTRE EST POSÉ **APRÈS** LE RANGEMENT, ET C'EST UNE CORRECTION DE MON PREMIER JET. Le poser
         * avant (sur `interlocuteursEtClients`) aurait écarté l'adresse d'une personne qui est À LA FOIS
         * propriétaire et ancien locataire du logement — cas réel dans un dossier de famille — et sa capsule
         * aurait disparu de l'encart PROPRIÉTAIRE, où la fusion des catégories la range pourtant. On ne filtre
         * donc que l'encart qui porte le mélange, et on le dit par `g.cle === 'locataire'`.
         *
         * 🔴 `nb` EST RECALCULÉ SUR LA LISTE GARDÉE : « Le compteur ne compte que ceux-là » (Arno). Garder le
         * `nb` du module aurait affiché « Locataire 6 » au-dessus de deux capsules — le défaut d'origine, en
         * pire, puisqu'il aurait été invisible à la lecture du code.
         */
        /**
         * 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — LE FILTRE S'ÉTEND À « NON AFFECTÉS ».
         *
         * Arno : « les contacts annexes affichés côté Locataire ET dans "Non affectés" ». Et c'est bien là qu'il
         * a vu le défaut : `louisvaglio@live.fr` était dans « Non affectés », pas dans l'encart Locataire.
         *
         * ⚠️ LES TROIS AUTRES GROUPES NE BOUGENT PAS, et c'est écrit noir sur blanc dans sa demande : « Le côté
         * Propriétaire, Tiers indépendant et Notre agence ne changent pas. » Un propriétaire paraît dans les
         * mails de TOUTES les locations — l'y soumettre l'aurait fait disparaître de son propre encart.
         */
        const gardes = g.cle === 'locataire' || g.cle === 'a_repartir'
          ? g.interlocuteurs.filter(
            (i) => adresseGardeeDansLencart(i.adresse, cartesLocataires, choixLocataire, contactsLocataires))
          : g.interlocuteurs;
        return { ...g, nb: gardes.length, interlocuteurs: ordonnerLesCapsules(gardes, g.cle, categories) };
      }),
      /**
       * ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — COMBIEN DE CAPSULES AURAIT LE LOCATAIRE EN PLACE ═════════════════════
       *
       * Le bouton « Locataire(s) actuel(s) 2 » porte ce compte EN PERMANENCE, y compris pendant qu'on regarde un
       * ancien locataire. Il ne peut donc pas être lu sur `g.nb`, qui est le compte de ce qui est AFFICHÉ.
       *
       * 🔴 IL SE CALCULE SUR LA LISTE NON FILTRÉE, dans le même parcours : le recalculer ailleurs aurait fait un
       * second juge de la règle « quelles adresses l'encart garde », et les deux auraient fini par annoncer des
       * nombres différents de part et d'autre du même en-tête.
       */
      /**
       * 🔴🔴 ZÉRO SUR UN LOGEMENT VACANT, ET C'EST UNE CORRECTION VUE À L'ÉCRAN (bien 315). Le filtre garde aussi
       * les adresses qu'AUCUNE carte ne porte — un contact rangé « locataire » à la main, la sœur du locataire,
       * un voisin. Sur un logement sans occupant, le bouton annonçait donc « Locataire(s) actuel(s) 1 » à côté
       * d'une info-bulle disant qu'il n'y en a aucun : deux affirmations contraires sur la même ligne.
       *
       * Ce bouton compte des LOCATAIRES ACTUELS. Sans carte en place, il n'y en a aucun, et il le dit.
       */
      nbLocatairesActuels: !ilYAUnLocataireEnPlace(cartesLocataires) ? 0
        : (r.groupes.find((g) => g.cle === 'locataire')?.interlocuteurs ?? [])
          .filter((i) => adresseGardeeDansLencart(
            i.adresse, cartesLocataires, CHOIX_LOCATAIRE_DEFAUT, contactsLocataires)).length,
    };
  }, [interlocuteursEtClients, categoriesFusionnees, adressesClientes, categories,
    cartesLocataires, choixLocataire, contactsLocataires]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — À QUELLE PARTIE AVONS-NOUS ENVOYÉ CE MAIL ? ══════════════════════
   *
   * DEMANDE D'ARNO : « pour toute pièce ENVOYÉE PAR NOUS, une ligne par partie destinataire ».
   *
   * 🔴 LES DEUX SOURCES SONT LUES, et il le faut : une pièce du RÉSUMÉ peut venir d'un mail que la page courante
   * n'a pas chargé (le résumé couvre toute la sélection depuis le lot 11), et une pièce du MAIL DÉPLIÉ vient de
   * la page. N'en lire qu'une aurait laissé la moitié des pièces sortantes sans leurs lignes, sans rien dire.
   *
   * ⚠️ LA CATÉGORIE VIENT DE `categoriesFusionnees` — LA MÊME CARTE QUE LES PASTILLES De / À / Cc du mail déplié
   * (« même source », Arno). Une seconde lecture aurait fini par peindre la flèche d'une couleur et la pastille
   * d'une autre, sur la même ligne et pour la même personne.
   *
   * ══ ⚠️ RÉÉCRIT LE 07/10/2026 — LOT PJ-STATUT-ENVOI-FAMILLES ═══════════════════════════════════════════════
   *
   * IL ÉCARTAIT TOUTES NOS ADRESSES (`estAdresseInterne`), au motif que « nous mettre en copie de notre propre
   * envoi n'est pas envoyer à une partie ». Arno tranche autrement : un collègue destinataire EST une
   * information, et il a sa capsule « Envoyé en interne ». Seule la BOÎTE elle-même reste écartée.
   *
   * ⚠️ LE CCI ENTRE DANS LE CALCUL : `LigneHistorique` le porte déjà, et le module pur le lit quand il est là.
   */
  const destinatairesDuMessage = useMemo(() => {
    const m = new Map<number, FamilleVue[]>();
    const regles = {
      estInterne: (a: string) => estAdresseInterne(a),
      /* ⚠️ LA BOÎTE VIENT DE LA CONSTANTE PARTAGÉE, pas d'une chaîne recopiée : c'est le même repli que les deux
         autres écrans qui en ont besoin sans recevoir la configuration (`VieDuBien`, `HistoriqueCible`). */
      adresseBoite: COMPTE_GESTION_DEFAUT,
    };
    const poser = (
      id: number,
      x: { sens: 'recu' | 'envoye'; a: PersonneDuMail[]; cc: PersonneDuMail[]; cci?: PersonneDuMail[] },
    ): void => {
      if (m.has(id)) return;
      m.set(id, famillesDestinataires(x, categoriesFusionnees, regles));
    };
    for (const l of lignes) poser(l.messageId, l);
    if (etatPieces.v === 'ok') for (const x of etatPieces.messages) poser(x.messageId, x);
    return m as ReadonlyMap<number, FamilleVue[]>;
  }, [lignes, etatPieces, categoriesFusionnees]);

  /** La fiche d'annuaire de chaque client, pour le lien « adresse à corriger ». */
  const fichesClientes = useMemo(() => {
    const m = new Map<string, { sorte: 'proprietaire' | 'locataire'; id: number }>();
    for (const c of clients) {
      const a = (c.adresse ?? '').trim().toLowerCase();
      if (a !== '' && c.fiche != null && !m.has(a)) m.set(a, c.fiche);
    }
    return m as ReadonlyMap<string, { sorte: 'proprietaire' | 'locataire'; id: number }>;
  }, [clients]);

  /**
   * ══ 🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » — CALCULÉE UNE FOIS ═══════════════════════════════════════════
   *
   * `null` quand le logement n'a aucun locataire connu : c'est CE `null` qui grise le bouton et qui écrit son
   * motif. La règle — qui est « le dernier », et quelles bornes son bail donne — vit dans le module pur, parce
   * que c'est exactement le verdict qui a déjà été fait mentir une fois par une maquette.
   */
  const periodeLocataire = useMemo(
    () => periodeDuDernierLocataire(occupations, maintenant), [occupations, maintenant]);

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — l'explication de la prolongation, ou `null`. Le module pur décide ;
   * l'écran ne fait que la poser à côté des dates.
   */
  const motProlongation = useMemo(() => motProlongationDeLaPeriode(
    cartesLocataires, choixLocataire, evtsParLocataire, reglages.periode, maintenant,
  ), [cartesLocataires, choixLocataire, evtsParLocataire, reglages.periode, maintenant]);

  const evenementOuvert = evenements.find((e) => e.ouvert) ?? null;

  /** Cocher ou décocher une personne. Les cases restent montées : le focus ne quitte pas celle qu'on vient de cliquer. */
  /**
   * ══ 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — LA MENTION DISCRÈTE, ET POURQUOI ELLE PASSE PAR UNE RÉFÉRENCE ═══════
   *
   * Arno : « Petite mention discrète sous l'encart quand la bascule a lieu […]. Elle disparaît d'elle-même. »
   *
   * ⚠️ LE VERDICT EST RANGÉ DANS UNE RÉFÉRENCE, PAS DANS L'ÉTAT : il est produit DANS le calcul que `setReglages`
   * reçoit, et React peut rejouer ce calcul (mode strict, rendu concurrent). Un `setState` posé là-dedans
   * partirait deux fois. Un effet relève la référence après le rendu, et c'est lui qui fait paraître le message.
   */
  const basculeAVenir = useRef<FamilleDecochee | null>(null);
  const [bascule, setBascule] = useState<{ quoi: FamilleDecochee; cle: number } | null>(null);
  useEffect(() => {
    const quoi = basculeAVenir.current;
    if (quoi === null) return;
    basculeAVenir.current = null;
    setBascule({ quoi, cle: Date.now() });
  });
  /* ⚠️ ELLE S'EFFACE TOUTE SEULE, et la minuterie repart à chaque bascule : deux bascules rapprochées ne doivent
     pas faire disparaître la seconde phrase à l'heure de la première. */
  useEffect(() => {
    if (bascule === null) return undefined;
    const t = setTimeout(() => setBascule(null), MS_MENTION_BASCULE);
    return () => clearTimeout(t);
  }, [bascule]);

  /**
   * ══ 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — LES DEUX GESTES DE SÉLECTION PASSENT PAR LA MÊME RÈGLE ══════════════
   *
   * RÈGLE D'ARNO (07/10/2026) : « les locataires actuels et les anciens locataires ne peuvent JAMAIS être cochés
   * en même temps. Cocher un ancien (ou “tout le groupe” de l'onglet Anciens) décoche automatiquement tous les
   * locataires actuels, et inversement. »
   *
   * 🔴 DEUX GESTES, UNE SEULE ÉCRITURE DE LA RÈGLE : `exclusiviteLocataires`, module PUR. La poser dans chacun
   * aurait donné deux arbitrages à tenir d'accord — et c'est précisément « une seule source » qu'Arno demande,
   * puisque la frise, la liste, les pièces et les compteurs lisent tous `reglages.parties`.
   *
   * ⚠️ ELLE NE S'APPLIQUE QU'À CE QUE LE GESTE **AJOUTE** : décocher ne bascule rien, et les autres groupes
   * (Propriétaire, Tiers indépendant, Notre agence, Non affectés) traversent intacts.
   */
  const appliquerExclusivite = (avant: readonly string[], apres: readonly string[]): string[] => {
    const r = exclusiviteLocataires(avant, apres, cartesLocataires);
    /* ⚠️ LA MENTION EST POSÉE DANS UN EFFET, jamais pendant le calcul d'état : `setReglages` reçoit une fonction
       que React peut rejouer, et un `setState` posé là-dedans partirait deux fois. On range donc le verdict, et
       un effet le transforme en message. */
    if (r.decoche !== null) basculeAVenir.current = r.decoche;
    return r.parties;
  };

  const basculerPartie = (adresse: string): void => setReglages((r) => {
    const a = adresse.trim().toLowerCase();
    const dedans = r.parties.includes(a);
    const apres = dedans ? r.parties.filter((x) => x !== a) : [...r.parties, a];
    return { ...r, parties: appliquerExclusivite(r.parties, apres) };
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — LE GLISSER-DÉPOSER, ET SA SYNCHRONISATION STRICTE
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Quelle adresse est en train d'être glissée, et d'où elle part. `null` = aucun glisser en cours. */
  const [glisse, setGlisse] = useState<{ adresse: string; depuis: CleGroupeParties } | null>(null);
  /** Quelle zone de dépôt est survolée : c'est elle qui se surligne, et c'est elle qui s'ouvre si elle est repliée. */
  const [survol, setSurvol] = useState<CleGroupeParties | null>(null);
  /** Quelle capsule a son menu « Déplacer vers… » ouvert (le chemin clavier). */
  const [menu, setMenu] = useState<string | null>(null);
  /** Le dernier déplacement, derrière lequel « Annuler » reste offert quelques secondes. */
  const [dernierGeste, setDernierGeste] = useState<{ mot: string; geste: unknown } | null>(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [refusDeplacement, setRefusDeplacement] = useState<string | null>(null);

  /**
   * ⚠️ LE MESSAGE S'EFFACE TOUT SEUL, et la minuterie est remise à zéro à chaque nouveau déplacement. Sans
   * remise à zéro, deux déplacements rapprochés auraient fait disparaître le second message à l'heure du
   * premier — donc retiré « Annuler » avant qu'on ait pu le lire.
   */
  useEffect(() => {
    if (dernierGeste === null) return undefined;
    const t = setTimeout(() => setDernierGeste(null), SECONDES_ANNULER_DEPLACEMENT * 1000);
    return () => clearTimeout(t);
  }, [dernierGeste]);

  /**
   * ══ 🔴🔴 QUITTER VERS LA CONVERSATION — EN POSANT DE QUOI REVENIR (lot HISTORIQUE-BIEN-3, point 4) ═══════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DEMANDE D'ARNO : « Le bouton RETOUR du navigateur, et un bouton “← Retour à l'historique du bien” dans la
   * conversation, ramènent EXACTEMENT au même état : même fiche, même période, mêmes parties cochées, mêmes
   * options, même texte de recherche, même position de défilement, et le mail d'où l'on est parti surligné
   * brièvement. »
   *
   * 🔴 L'ORDRE DES DEUX GESTES EST TOUT LE MÉCANISME. On RANGE l'état et on POSE le jeton dans l'adresse
   * COURANTE — celle de la fiche — AVANT de naviguer. L'entrée d'historique qu'on quitte porte alors le jeton, et
   * « Précédent » y revient avec de quoi tout retrouver. Poser le jeton après aurait écrit sur l'adresse de la
   * CONVERSATION : le retour serait revenu à une fiche nue, c'est-à-dire au défaut qu'Arno signale.
   *
   * 🔴 LE DÉFILEMENT EST LU AU DERNIER MOMENT, et celui de la PAGE, pas du bloc : c'est la page qui défile quand
   * on lit un fil. Le lire plus tôt (à chaque rendu, par exemple) aurait rangé une position périmée.
   *
   * ⚠️ UNE CLÉ ALÉATOIRE PAR DÉPART. Réutiliser une clé fixe aurait fait qu'un second aller-retour écrase l'état
   * du premier — et le « Précédent » profond serait revenu sur un écran qui n'était pas le sien.
   *
   * ⚠️ `sessionStorage` PEUT REFUSER (navigation privée, quota, données de site bloquées) : on NE casse rien. Le
   * mail s'ouvre quand même, et le retour retombe sur le comportement d'avant ce lot.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const ouvrirLaConversation = useCallback((filId: number, messageId?: number | null): void => {
    if (typeof window !== 'undefined' && onPoserJeton !== undefined) {
      try {
        const cle = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
          .replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
        const etatRetour: EtatRetourBien = {
          fiche: lotCle,
          reglages,
          defile: Math.round(window.scrollY),
          mail: messageId ?? null,
          page,
        };
        window.sessionStorage.setItem(`${CLE_RETOUR_BIEN}${cle}`, JSON.stringify(etatRetour));
        onPoserJeton(cle);
      } catch {
        /* Silence volontaire : on perd le retour exact, jamais l'ouverture du mail. */
      }
    }
    onOuvrirFil?.(filId, messageId);
  }, [lotCle, onOuvrirFil, onPoserJeton, page, reglages]);

  /**
   * ══ 🔴 AU RETOUR : LE DÉFILEMENT, PUIS LE SURLIGNAGE QUI S'EFFACE ════════════════════════════════════════════
   *
   * ⚠️ LE DÉFILEMENT ATTEND QUE LE FIL SOIT LÀ. Restaurer la position avant que les mails soient rendus aurait
   * fait défiler une page encore courte — on serait retombé en bas, ou nulle part. On attend donc le premier
   * rendu `ok` du fil.
   */
  const defileRepris = useRef(false);
  useEffect(() => {
    if (repris === null || defileRepris.current || etat.v !== 'ok' || typeof window === 'undefined') return;
    defileRepris.current = true;
    window.scrollTo({ top: repris.defile });
  }, [repris, etat.v]);

  useEffect(() => {
    if (mailSurligne === null) return undefined;
    const t = setTimeout(() => setMailSurligne(null), MS_SURLIGNE_RETOUR);
    return () => clearTimeout(t);
  }, [mailSurligne]);

  /**
   * Régler la période sur le bail d'un locataire, depuis sa capsule. 🔴 C'est le geste du lot 1 — choisir la
   * période d'un ancien locataire — à l'endroit où Arno place désormais cette date : dans la capsule.
   */
  const reglerPeriodeSurLeBail = useCallback((b: PeriodePartie): void => {
    setReglages((r) => ({ ...r, periode: { sorte: 'dates', du: b.du, au: b.au } }));
  }, []);

  /**
   * ══ 🔴🔴 QUELLES ADRESSES ONT DÉJÀ UNE CARTE, ET DE QUEL CÔTÉ (lot HISTORIQUE-BIEN-3, point 3) ═══════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « En face de chaque capsule de contact Propriétaire ou Locataire qui N'A PAS
   * encore de carte de contact : un “+” rouge dans un cercle rouge. […] Le “+” disparaît dès que la carte
   * existe. »
   *
   * 🔴 LE CÔTÉ COMPTE, PAS SEULEMENT L'ADRESSE. Une même personne peut être contact du propriétaire sur un bien
   * et du locataire sur un autre ; et sur CE bien, avoir une carte côté propriétaire ne dispense pas d'en avoir
   * une côté locataire si elle y est rangée. La clé de la table est (bien, côté, adresse) : la carte des cartes
   * doit l'être aussi, sinon le « + » disparaîtrait à tort.
   */
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA CARTE PORTE DÉSORMAIS SON ÉTAT DE VÉRIFICATION, et non plus seulement
   * sa présence. Demande d'Arno : « Si la carte est encore “à vérifier” (trame orange), l'icône est orange. » La
   * donnée était déjà là (`cartesContact[].verifie`) ; c'est l'index qui la jetait.
   *
   * ⚠️ `false` L'EMPORTE SUR `true` POUR UN MÊME CÔTÉ — cas théorique (la table a une clé unique par bien, côté et
   * adresse), écrit par prudence : c'est le geste qui RESTE à faire qui doit se voir.
   */
  const cartesParAdresse = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of cartesContact) {
      /**
       * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINTS 1 ET 2 — UNE CARTE SEULEMENT PRÉ-REMPLIE NE COMPTE PAS.
       *
       * RÈGLE D'ARNO : « Toute capsule CONTACT sans carte créée (Y COMPRIS AVEC UN PRÉ-REMPLISSAGE) porte le
       * “+” rouge dans un cercle rouge. […] L'icône “fiche” orange disparaît. »
       *
       * 🔴 C'EST LE MÊME JUGE QUE LE CARROUSEL (`carteMonteAuCarrousel`), et c'est tout l'intérêt : la capsule
       * et le carrousel ne peuvent pas dire deux choses différentes de la même carte. Avant ce point, une carte
       * `auto` donnait une pastille orange « à vérifier » ; elle redonne maintenant le « + », parce qu'il n'y a
       * rien à ouvrir — il reste tout à créer.
       */
      if (!carteMonteAuCarrousel(c)) continue;
      /**
       * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 0 — LA CLÉ DE RAPPROCHEMENT, ET NON L'ADRESSE BRUTE ════════════════
       *
       * `cleAdresse` retire le schéma `mailto:` des DEUX côtés — la carte et la capsule. C'est ce qui fait tenir
       * le lien quand l'une des deux porte encore ce préfixe : mesuré en base, **37 cartes** et **53 catégories**
       * en portent un, et leurs capsules existent sous les deux écritures (les 98 adresses `mailto:` de la base
       * existent TOUTES aussi en clair).
       *
       * 🔴 SANS CELA, CORRIGER UNE ADRESSE DÉTACHERAIT SA CARTE : la carte 1465, passée de
       * `mailto:a.bruneel@…` à `a.bruneel@…`, aurait perdu sa capsule, le « + » serait réapparu en face d'un
       * contact qui a déjà sa fiche — et un second clic aurait créé une carte en double.
       *
       * ⚠️ SEUL CE RAPPROCHEMENT-LÀ CHANGE DE CLÉ. Les catégories, les périodes et le filtre continuent de lire
       * l'adresse TELLE QU'ELLE EST DANS LE COURRIER : c'est elle que le serveur compare à l'archive, et la
       * normaliser avant de l'envoyer ne retrouverait plus les mails rangés sous l'ancienne écriture.
       */
      const cle = cleAdresse(c.adresse);
      const s0 = m.get(cle) ?? new Set<string>();
      s0.add(c.cote);
      m.set(cle, s0);
    }
    return m as ReadonlyMap<string, ReadonlySet<string>>;
  }, [cartesContact]);

  /** Déplier ou replier un groupe. Écrit une fois : les encarts et les bandes s'en servent. */
  const basculerRepli = useCallback((cle: CleGroupeParties | 'agence'): void => setBascules((s0) => {
    const n = new Set(s0);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  }), []);

  /**
   * ══ 🔴🔴 DÉPLACER UNE PARTIE — PAR LA MÊME PORTE QUE LE « + », ET PAR AUCUNE AUTRE ════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « SYNCHRONISATION STRICTE : un déplacement passe par la MÊME porte d'écriture
   * que le choix de catégorie du “+” (aucun second chemin). La carte de contact suit la catégorie : créée,
   * déplacée ou retirée (statut 'retire', jamais supprimée) côté propriétaire / locataire. Toutes les vues
   * ouvertes se mettent à jour en direct. Un contact déplacé à la main n'est plus jamais reclassé par
   * l'automatisation (le choix manuel prime). »
   *
   * 🔴 UNE SEULE REQUÊTE, LA MÊME QUE « VALIDER ». Le déplacement n'envoie ni nom ni téléphone : la carte, si
   * elle existe, emporte les siens (c'est le serveur qui les reporte). Écrire ici un second appel — « pose la
   * catégorie » puis « déplace la carte » — aurait fait deux chemins, et le jour où l'un change, l'autre mentirait.
   *
   * 🔴 ON RELIT APRÈS, PLUTÔT QUE DE DEVINER. C'est la relecture qui fait changer la capsule de groupe, et c'est
   * elle qui garantit que l'écran montre l'état RÉEL — y compris quand le serveur n'a fait qu'une partie du geste
   * (la catégorie sans la carte, par exemple).
   *
   * ⚠️ « LE CHOIX MANUEL PRIME » N'EST PAS TENU ICI : il est tenu par `poserCategorieAlaMain`, qui écrit
   * `origine = 'manuel'`, et par `categorieRetenue`, qui fait passer le manuel devant la proposition. L'écran
   * n'a rien à ajouter — et c'est pour cela qu'il ne peut pas l'oublier.
   */
  const deplacer = useCallback(async (
    adresse: string, vers: CleGroupeParties, nomLisible: string, titreCible: string,
  ): Promise<void> => {
    setGlisse(null);
    setSurvol(null);
    setMenu(null);
    setRefusDeplacement(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cible: `lot-${lotCle}`, adresse, categorie: vers }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string; geste?: unknown };
      if (d.etat !== 'ok') {
        setRefusDeplacement(d.motif ?? 'Le déplacement n’a pas pu être enregistré.');
        return;
      }
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
      setDernierGeste({ mot: motDeplacement(nomLisible, titreCible), geste: d.geste ?? null });
    } catch {
      setRefusDeplacement('Le déplacement n’a pas pu être enregistré : le serveur n’a pas répondu.');
    }
  }, [lotCle, relireParties]);

  /**
   * ══ 🔴🔴 « ANNULER » DÉFAIT LE GESTE PAR SES IDENTIFIANTS ════════════════════════════════════════════════════
   *
   * 🔴 ET NON EN REPOSANT LA CATÉGORIE D'AVANT. Reposer aurait écrit une ligne `manuel` là où il n'y avait qu'une
   * PROPOSITION — donc gelé cette proposition en décision humaine, que l'automatisation ne reprendrait plus
   * jamais. C'est l'inverse de ce qu'« Annuler » promet. Le serveur retire ce qu'il a posé et ROUVRE ce qu'il
   * avait retiré : voir l'encadré d'`annulerGesteDeRangement`.
   */
  const annulerDeplacement = useCallback(async (): Promise<void> => {
    if (dernierGeste === null) return;
    setAnnulationEnCours(true);
    setRefusDeplacement(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler', geste: dernierGeste.geste }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') {
        setRefusDeplacement(d.motif ?? 'L’annulation n’a pas pu être enregistrée.');
        return;
      }
      setDernierGeste(null);
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
    } catch {
      setRefusDeplacement('L’annulation n’a pas pu être enregistrée : le serveur n’a pas répondu.');
    } finally {
      setAnnulationEnCours(false);
    }
  }, [dernierGeste, relireParties]);

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LE « + » — RANGER UNE PARTIE NON AFFECTÉE, ET LUI FAIRE UNE CARTE DE CONTACT
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * DEMANDE D'ARNO (04/10/2026) : « Pour chaque partie NON encore affectée à une catégorie : un bouton “+” qui
   * ouvre une petite carte de création de contact (nom, adresse mail pré-remplie, téléphone, et un choix de
   * catégorie Propriétaire / Locataire / Tiers indépendant). La catégorie est PRÉ-REMPLIE quand elle a été
   * déduite (règle à trois étages), et reste modifiable. Valider range la partie dans le bon groupe en direct. »
   *
   * ⚠️ `categorie` PEUT ÊTRE VIDE, et le formulaire refuse alors d'être validé. Pré-cocher « Propriétaire » par
   * défaut aurait fait ranger des gens dans une catégorie fausse d'un clic distrait — et un rangement manuel
   * PRIME sur tout le reste, donc il ne se corrige pas tout seul à la passe suivante.
   */
  const [aCreer, setACreer] = useState<{
    adresse: string; categorie: Categorie | ''; fiche: ReturnType<typeof ficheDeContact>;
  } | null>(null);
  const [refusCreation, setRefusCreation] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);

  const ouvrirCreation = useCallback((adresse: string, imposee?: CleGroupeParties): void => {
    const cle = adresse.trim().toLowerCase();
    const deduite = proposees.get(cle);
    /**
     * 🔴🔴 LA CATÉGORIE DU GROUPE D'OÙ L'ON CLIQUE L'EMPORTE (lot HISTORIQUE-BIEN-3, point 3). Arno : « Il ouvre
     * la carte de création avec la catégorie pré-remplie. » Le « + » cerclé vit en face d'une capsule DÉJÀ
     * rangée : on sait où elle est, et la redemander serait une question dont l'écran connaît la réponse.
     *
     * ⚠️ `a_repartir` N'EST PAS UNE DÉDUCTION, ni imposée ni proposée : c'est le constat qu'on n'a pas su
     * trancher. Le choix reste alors VIDE — pré-cocher « Propriétaire » au hasard se valide sans être lu.
     */
    const choisie = imposee ?? deduite;
    setRefusCreation(null);
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE NOM ET LE TÉLÉPHONE SONT PRÉ-REMPLIS (demande d'Arno). Le nom
     * vient du « Nom <adresse> » le plus fréquent de ses mails ; le téléphone, de la signature du plus récent
     * qui en porte un. MESURÉ : 83 % des contacts qui ont écrit ont un numéro trouvable ainsi.
     *
     * ⚠️ UNE PROPOSITION, PAS UNE VÉRITÉ : les deux champs restent modifiables, et c'est l'humain qui valide.
     * La carte créée est d'ailleurs marquée « à vérifier » tant que personne ne l'a regardée.
     */
    const trouve = coordonnees.get(cle);
    /**
     * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINTS 1 ET 3 — DEUX SOURCES DE PRÉ-REMPLISSAGE, DANS CET ORDRE ════════════
     *
     * Arno (point 1) : les ~485 cartes automatiques « deviennent de simples PRÉ-REMPLISSAGES du formulaire du
     * “+” ». Arno (point 3) : le formulaire est « pré-rempli depuis le pré-remplissage : nom et prénom séparés si
     * possible, e-mail, téléphone et adresse trouvés dans la signature ».
     *
     * 🔴 LA PROPOSITION D'ABORD, LA SIGNATURE ENSUITE, CHAMP PAR CHAMP. La proposition est le travail déjà fait
     * (la reprise l'a écrite, et quelqu'un a pu la compléter avant ce lot) ; la signature est ce qu'on sait lire
     * à l'instant. Prendre la signature en premier aurait écrasé un nom corrigé à la main par le nom d'en-tête
     * d'un vieux courrier.
     *
     * 🔴 LE NOM SE COUPE EN PRÉNOM + NOM « SI POSSIBLE » — et « si possible » est la moitié de la demande : voir
     * `couperNomEtPrenom`, qui refuse de couper « Puro Flow Paris » et coupe « Jessica TADEU ». La carte, elle,
     * peut déjà porter les deux séparés (elle a été saisie dans ce formulaire) : on ne recoupe alors rien.
     */
    const propose = cartesContact.find((c) => c.adresse.trim().toLowerCase() === cle);
    const nomBrut = propose?.nom ?? trouve?.nom ?? '';
    const coupe = couperNomEtPrenom(nomBrut);
    const dejaSeparee = (propose?.prenom ?? '').trim() !== '';

    setACreer({
      adresse,
      categorie: choisie === undefined || choisie === 'a_repartir' ? '' : choisie,
      fiche: ficheDeContact({
        adresse,
        nom: dejaSeparee ? (propose?.nom ?? '') : coupe.nom,
        prenom: dejaSeparee ? propose?.prenom : coupe.prenom,
        /* 🔴 UNE CIVILITÉ LUE EN TÊTE DU NOM (« MADAME ROUDAUT ») VA DANS SON CHAMP, et non dans le prénom. */
        civilite: propose?.civilite ?? (dejaSeparee ? null : coupe.civilite),
        qualite: propose?.qualite,
        note: propose?.note,
        adressePostale: propose?.adressePostale ?? trouve?.adressePostale,
        codePostal: propose?.codePostal ?? trouve?.codePostal,
        commune: propose?.commune ?? trouve?.commune,
        telephone: propose?.telephone ?? trouve?.telephone,
        coordonnees: propose?.coordonnees,
      }),
    });
  }, [proposees, coordonnees, cartesContact]);

  /**
   * ══ 🔴 VALIDER : LE RANGEMENT, PUIS LA CARTE — ET LA RELECTURE QUI FAIT CHANGER DE GROUPE ═══════════════════
   *
   * ⚠️ UNE SEULE PORTE D'ÉCRITURE, ET C'EST LE SERVEUR QUI DÉCIDE. L'écran n'écrit pas en base : il POSTE, et il
   * affiche le refus tel quel. Les règles (un contact du propriétaire se range toujours sur un bien, un
   * indépendant est global, l'auteur doit être identifié) vivent dans `partieCategorieRepo`, qui les tenait déjà
   * pour la reprise — en réécrire une ici aurait fait deux juges pour un même rangement.
   *
   * ⚠️ ON RELIT APRÈS, PLUTÔT QUE DE DEVINER LE NOUVEL ÉTAT. Poser la catégorie « à la main » dans l'état local
   * aurait affiché un rangement que le serveur a peut-être refusé en partie (la carte sans la catégorie, par
   * exemple) — et l'écran aurait menti jusqu'au rechargement.
   */
  const enregistrerCreation = useCallback(async (champs: ChampsSaisis): Promise<void> => {
    if (aCreer === null || aCreer.categorie === '') return;
    setCreationEnCours(true);
    setRefusCreation(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cible: `lot-${lotCle}`,
          /* ⚠️ L'ADRESSE DU POST EST CELLE DE LA CAPSULE, ET NON UNE LIGNE DU FORMULAIRE : elle est l'IDENTITÉ de
             la carte, et c'est par elle que la capsule retrouve la sienne. Les e-mails saisis sont, eux, des
             COORDONNÉES — voir l'encadré du mode « modifier » dans `CartesPersonnes`. */
          adresse: aCreer.adresse,
          categorie: aCreer.categorie,
          /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — la fiche complète, par la MÊME porte d'écriture qu'avant, et
             par la MÊME traduction que le crayon d'une carte du haut (module pur `ficheAEnvoyer`). */
          ...ficheAEnvoyer(champs),
        }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') {
        setRefusCreation(d.motif ?? 'Le rangement n’a pas pu être enregistré.');
        return;
      }
      setACreer(null);
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
    } catch {
      setRefusCreation('Le rangement n’a pas pu être enregistré : le serveur n’a pas répondu.');
    } finally {
      setCreationEnCours(false);
    }
  }, [aCreer, lotCle, relireParties]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — COCHER ET DÉCOCHER « NOTRE AGENCE » ═════════════════════════════════
   *
   * 🔴 ON ÉCRIT L'ENVERS DE CE QU'ON VOIT : la case est COCHÉE quand l'adresse n'est PAS dans `agenceEcartee`.
   * C'est ce qui rend le défaut d'Arno (« cochées par défaut ») gratuit — la liste est vide au départ — et ce qui
   * fait qu'une adresse de l'agence apparue depuis naît COCHÉE, et non l'inverse.
   */
  const basculerAgence = useCallback((adresse: string): void => setReglages((r) => {
    const a = cleAdresse(adresse);
    return {
      ...r,
      agenceEcartee: r.agenceEcartee.includes(a)
        ? r.agenceEcartee.filter((x) => x !== a)
        : [...r.agenceEcartee, a],
    };
  }), []);

  /** « tout le groupe » pour l'agence : tout décoché ⇒ on recoche tout. Même geste que pour les parties. */
  const basculerToutLagence = useCallback((adresses: readonly string[]): void => setReglages((r) => {
    const toutes = adresses.map(cleAdresse);
    const toutEcarte = toutes.length > 0 && toutes.every((a) => r.agenceEcartee.includes(a));
    return {
      ...r,
      agenceEcartee: toutEcarte
        ? r.agenceEcartee.filter((a) => !toutes.includes(a))
        : [...new Set([...r.agenceEcartee, ...toutes])],
    };
  }), []);

  /** Tout un groupe d'un geste. Déjà tout coché ⇒ on décoche : un bouton qui ne fait qu'ajouter se bloque vite. */
  const basculerGroupe = (adresses: readonly string[]): void => setReglages((r) => {
    const toutes = adresses.map((a) => a.trim().toLowerCase());
    const tout = toutes.length > 0 && toutes.every((a) => r.parties.includes(a));
    const apres = tout
      ? r.parties.filter((a) => !toutes.includes(a))
      : [...new Set([...r.parties, ...toutes])];
    /* 🔴 LA MÊME RÈGLE QUE LA CASE À L'UNITÉ : « tout le groupe » de l'onglet Anciens décoche les actuels. */
    return { ...r, parties: appliquerExclusivite(r.parties, apres) };
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — RENOMMER DEPUIS LA VISIONNEUSE ═══════════════════════════════════
   *
   * Arno décrit la visionneuse habituelle comme « la fenêtre avec le document, LE RENOMMAGE au-dessus, la
   * navigation et la fermeture ». Le renommage en fait donc partie, et il passe par la MÊME route que la
   * conversation (`PATCH /pieces/:id/nom`) — celle qui fait suivre les copies du Drive.
   *
   * ⚠️ LA PAGE EST REDEMANDÉE ENSUITE, et non corrigée de mémoire : `rechargement` est une dépendance des DEUX
   * lectures (le fil et les pièces), donc le nouveau nom arrive partout — miniatures du mail déplié comprises —
   * tel que le serveur le connaît.
   */
  const renommerLaPiece = async (pieceId: number, nom: string): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/gestion/pieces/${pieceId}/nom`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; message?: string; refus?: { motif: string }[];
      };
      if (d.etat !== 'ok') { setMotRenommage(d.message ?? 'Le renommage n’a pas abouti.'); return; }
      const refus = d.refus ?? [];
      setMotRenommage(refus.length === 0
        ? 'Pièce renommée — les copies du Drive portent le même nom.'
        : `Pièce renommée. ${refus.length} copie(s) du Drive n’ont pas suivi : ${refus[0].motif}`);
      setRechargement((n) => n + 1);
    } catch {
      setMotRenommage('Le renommage n’a pas abouti : le réseau n’a pas répondu.');
    }
  };

  /**
   * ══ 🔴 LES GESTES D'UNE MINIATURE, DANS LA FICHE ═══════════════════════════════════════════════════════════════
   *
   * 🔴 « RANGER » ET LE PICTO DRIVE OUVRENT **LA** FENÊTRE DRIVE, celle de l'application, dans ses deux modes
   * déjà éprouvés (`ranger` et `consulter`) — exactement ce que fait le bloc des pièces d'un message. Aucun droit
   * n'est accordé ici : c'est le serveur qui autorise ou refuse, dossier par dossier.
   *
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — `onVoir` OUVRE LA VISIONNEUSE, ET VOICI CE QUI ÉTAIT ÉCRIT ICI ══
   *
   * CONSTAT D'ARNO (05/10/2026) : « dans le résumé des pièces, l'œil ouvre le document directement en plein
   * écran au lieu de la visionneuse habituelle. »
   *
   * 🔴 LA CAUSE, TROUVÉE DANS `git log` : commit `801e9133` (lot HISTORIQUE-BIEN-1, point 2), celui qui a créé
   * ce bloc. Ce n'est pas un accident de code — c'était un ARBITRAGE ÉCRIT, et il tenait en ceci : « la
   * visionneuse a besoin du TOUR des pièces de l'ÉCHANGE (`voisinagePiecesConversation`, parent inventé) ; ici
   * le résumé rassemble les pièces de jusqu'à 25 échanges DIFFÉRENTS, et un tour qui les mélangerait
   * franchirait la frontière que ce parent existe pour tenir. »
   *
   * 🔴 CET ARBITRAGE ÉTAIT FAUX, ET VOICI POURQUOI. Le parent inventé existe pour tenir UNE frontière : qu'aucun
   * fichier du DRIVE n'entre dans le tour d'une pièce de courrier, et réciproquement. Il n'a jamais eu pour rôle
   * de borner le tour à un échange — c'est la LISTE passée en voisinage qui le borne, et elle vaut ce qu'on lui
   * donne. Ici, la bonne liste est le résumé lui-même : « les pièces de cette sélection ». J'avais confondu la
   * frontière à tenir (courrier / Drive) avec un périmètre qui n'en est pas une.
   *
   * Et le prix de l'erreur était celui qu'Arno a payé : le MÊME œil, dans le MÊME composant, faisait deux choses
   * différentes selon l'écran qui le monte — sans le dire. C'est exactement le défaut que le lot
   * PIECES-OEIL-DOUBLE-CLIC avait fermé trois jours plus tôt, rouvert ailleurs.
   *
   * ⚠️ AUCUNE COPIE : c'est `ApercuFichierDrive`, le composant que la conversation, l'éditeur de mail et la
   * fenêtre Drive montent déjà. Le renommage, les miniatures de pages, « Précédent / Suivant », Échap et le clic
   * sur le voile viennent avec, sans une ligne de plus.
   *
   * ⚠️ `onAllerAuMessage` DÉPLIE LE MAIL DANS LE FIL CI-DESSOUS, sur place : c'est le geste qu'Arno a demandé
   * dans la fenêtre de conversation, et il a le même sens ici.
   */
  const gestes: GestesPiece = {
    onVoir: (pieceId) => setPieceVue(pieceId),
    onRanger: (p) => setARanger({
      messageId: p.messageId,
      filId: filDuMessage.get(p.messageId) ?? null,
      pieces: [{ pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime }],
    }),
    onVoirDansLeDrive: (ou, source) => setAVoirDansLeDrive({ ou, source }),
    onAllerAuMessage: (messageId) => {
      setDeplie((s) => new Set(s).add(messageId));
      /* ⚠️ `block: 'center'` ET AUCUNE ANIMATION : le mail vient de se déplier, donc la page grandit — une
         animation lancée sur une page qui grandit finit ailleurs que là où elle visait. */
      document.getElementById(`hdb-mail-${messageId}`)?.scrollIntoView({ block: 'center' });
    },
  };

  const totalPieces = recap.pieces.length;
  /** Ce que le résumé couvre, dit sous le bouton — et `null` dans le cas ordinaire, qui est devenu la règle. */
  const porteeDuResume = motPorteeDuResume({
    surToutLaSelection: recap.surToutLaSelection,
    tronquee: etatPieces.v === 'ok' && etatPieces.tronque,
    enEchec: etatPieces.v === 'erreur',
    rechercheActive: motsCherches.length > 0,
    filIncomplet: etat.v === 'ok' && (etat.suite || page > 0),
    nbAffiches: lignes.length,
  });

  return (
    <section className="ann-bloc hdb" aria-labelledby="hdb-titre">
      <h4 className="ann-bloc-titre" id="hdb-titre">
        Historique du bien
        {etat.v === 'ok' && <span className="gst-compte">{etat.total}</span>}
      </h4>

      {/* ══ 🔴 L'ÉVÉNEMENT EN COURS, EN TÊTE ════════════════════════════════════════════════════════════════════
          Demande d'Arno : « si un événement est EN COURS, son titre ». C'est le contexte dans lequel on ouvre
          cet historique neuf fois sur dix — l'écrire évite de le chercher dans la liste des périodes. */}
      {evenementOuvert !== null && (
        <p className="hdb-evt" role="status">
          <span className="hdb-evt-capsule">Événement en cours</span>
          <strong className="hdb-evt-nom">{evenementOuvert.reference} — {nettoyerObjet(evenementOuvert.objet)}</strong>
          <span className="hdb-evt-date">
            ouvert le {formaterDateIso((evenementOuvert.ouvertLe ?? '').slice(0, 10)) || 'date inconnue'}
          </span>
        </p>
      )}

      {/* ══ 🔴🔴 QUI OCCUPE — ET « EN PLACE » NE S'ÉCRIT JAMAIS SUR UN LOGEMENT VACANT ══════════════════════════
          La phrase vient ENTIÈREMENT du module pur (`motLocataireDeLaPeriode`), et c'est là qu'elle est éprouvée :
          une maquette de l'étude annonçait « locataire en place depuis le 08/06/2025 » sur un logement vacant
          depuis le 28/09/2026, avec une date d'entrée devinée. Aucun morceau de cette phrase ne se compose ici. */}
      <p className="hdb-occupant">{motLocataireDeLaPeriode(occupations, maintenant)}</p>

      {/* ══ LE TABLEAU DE BORD ══ Rendu HORS du commutateur d'état : cocher une case ne démonte jamais la case,
          donc le focus et la position de défilement ne bougent pas. */}
      <div className="hdb-bord">
        {/* ══ 🔴🔴 BLOC 1 — « PÉRIODE », HORIZONTAL ET PLEINE LARGEUR (lot HISTORIQUE-BIEN-2) ═══════════════════
            DEMANDE D'ARNO (04/10/2026) : « Arno n'aime pas la mise en page actuelle en colonne : refonte
            complète en blocs horizontaux empilés. » Le pavé occupe donc toute la largeur, et son contenu
            s'étale : les quatre choix à gauche, la période effective à droite.

            🔴 QUATRE CHOIX EXCLUSIFS EN BOUTONS SEGMENTÉS, et l'exclusivité est tenue par le TYPE
            (`ChoixPeriode`, une union discriminée), pas par la discipline de l'écran. */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Période</legend>

          <div className="hdb-bande">
            <div className="hdb-segments" role="group" aria-label="Choisir la période">
              <button type="button" aria-pressed={reglages.periode.sorte === 'tous'}
                className={`hdb-seg${reglages.periode.sorte === 'tous' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => ({ ...r, periode: { sorte: 'tous' } }))}>
                Tous les échanges
              </button>

              {/* ══ 🔴🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » ═══════════════════════════════════════════
                  Arno : « début = sa date d'entrée, fin = sa sortie ou aujourd'hui ; si le bien n'a jamais eu
                  de locataire, bouton grisé avec une info-bulle explicative ».

                  🔴 `disabled` ET `title`, PAS UNE COULEUR : un bouton pâle ne dit pas POURQUOI il est pâle.
                  Le motif vient du module pur (`SANS_LOCATAIRE_CONNU`) et il est aussi écrit SOUS la bande,
                  parce qu'une infobulle n'existe pas sur un téléphone — règle tenue partout dans ce bloc. */}
              <button type="button" aria-pressed={reglages.periode.sorte === 'occupation'}
                disabled={periodeLocataire === null}
                title={periodeLocataire === null ? SANS_LOCATAIRE_CONNU : undefined}
                className={`hdb-seg${reglages.periode.sorte === 'occupation' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => (periodeLocataire === null ? r : {
                  ...r, periode: { sorte: 'occupation', du: periodeLocataire.du, au: periodeLocataire.au },
                }))}>
                Depuis l’entrée du dernier locataire
              </button>

              {/* ⚠️ « UN ÉVÉNEMENT » EST UN BOUTON **ET** UNE LISTE : le bouton dit le choix, la liste dit
                  lequel. Il est grisé quand le bien n'a aucun événement — même règle que ci-dessus. */}
              <button type="button" aria-pressed={reglages.periode.sorte === 'evenement'}
                disabled={evenements.length === 0}
                title={evenements.length === 0 ? SANS_EVENEMENT : undefined}
                className={`hdb-seg${reglages.periode.sorte === 'evenement' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => {
                  const e = evenements[0];
                  if (e === undefined) return r;
                  const b = periodeDeLEvenement(e, maintenant);
                  return { ...r, periode: { sorte: 'evenement', evenementId: e.id, du: b.du, au: b.au } };
                })}>
                Un événement
              </button>

              <button type="button" aria-pressed={reglages.periode.sorte === 'dates'}
                className={`hdb-seg${reglages.periode.sorte === 'dates' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => ({
                  ...r, periode: { sorte: 'dates', ...bornesDuChoix(r.periode) },
                }))}>
                Dates personnalisées
              </button>
            </div>

            {/* ══ 🔴🔴 LA PÉRIODE EFFECTIVE, TOUJOURS ÉCRITE, À DROITE ═══════════════════════════════════════
                Arno : « La période effective est toujours affichée en clair à droite (“du 01/05/2025 au
                04/10/2026”). » C'est la seule chose qui rende visible qu'un événement a réglé deux dates — et
                la seule qui montre qu'on a ensuite modifié une borne à la main. La phrase vient du module pur,
                et elle lit les MÊMES bornes que celles envoyées au serveur (`bornesDuChoix`). */}
            <p className="hdb-effective" role="status">
              <span className="hdb-effective-mot">Période retenue</span>
              {/* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 4 — `maintenant` entre ici pour que « la date du jour » s'écrive
                  « aujourd'hui ». Le module pur ne lit jamais l'horloge lui-même : il la reçoit. */}
              <strong className="hdb-effective-valeur">{motPeriodeEffective(reglages.periode, maintenant)}</strong>
              {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — « — prolongée par l'événement « … » » ═══════════════
                  Demande d'Arno, mot pour mot : « du 06/02/2025 au 15/03/2026 — prolongée par l'événement
                  « Litige dépôt de garantie » ». Elle ne paraît que si les dates affichées sont bien celles que
                  la prolongation a posées (le garde-fou est dans `motProlongationDeLaPeriode`). */}
              {motProlongation !== null && motProlongation !== '' && (
                <span className="hdb-effective-prolonge">— {motProlongation}</span>
              )}
            </p>
          </div>

          {/* ── LA LISTE DÉROULANTE DES ÉVÉNEMENTS — EN COURS ET CLOS ────────────────────────────────────── */}
          {reglages.periode.sorte === 'evenement' && evenements.length > 0 && (
            <label className="hdb-select-ligne">
              <span className="svv-label">L’événement</span>
              {/* ⚠️ UN VRAI `select` : sur un bien chargé, la liste des événements est longue, et une rangée de
                  boutons poussait le fil hors de l'écran — c'est ce qu'Arno a demandé de changer. Le natif
                  apporte en outre la recherche au clavier et le bon comportement sur téléphone. */}
              <select className="ann-champ hdb-select"
                value={reglages.periode.sorte === 'evenement' ? String(reglages.periode.evenementId) : ''}
                onChange={(ev) => setReglages((r) => {
                  const e = evenements.find((x) => String(x.id) === ev.target.value);
                  if (e === undefined) return r;
                  const b = periodeDeLEvenement(e, maintenant);
                  return { ...r, periode: { sorte: 'evenement', evenementId: e.id, du: b.du, au: b.au } };
                })}>
                {evenements.map((e) => (
                  /* LE MOT DIT L'ÉTAT, pas seulement la place dans la liste : « en cours » / « clos ». */
                  <option key={e.id} value={String(e.id)}>
                    {e.reference} — {nettoyerObjet(e.objet) || '(sans objet)'}
                    {' · '}{e.ouvert ? 'en cours' : 'clos'} · {e.nbMails} mail{e.nbMails > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* ── LES DEUX DATES ───────────────────────────────────────────────────────────────────────────────
              ⚠️ ELLES APPARAISSENT DÈS QU'UNE PÉRIODE EST CHOISIE, et pas seulement sur « Dates
              personnalisées » : c'est la règle posée au lot précédent et qu'Arno n'a pas défaite —
              « l'événement PROPOSE une période, il ne l'impose pas ». Toucher une borne bascule sur
              « Dates personnalisées », ce qui est la vérité : ce n'est plus la période de l'événement. */}
          {reglages.periode.sorte !== 'tous' && (
            <div className="hdb-dates">
              <label className="hdb-date">
                <span className="svv-label">Du</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={bornesDuChoix(reglages.periode).du ?? ''}
                  onChange={(e) => setReglages((r) => ({
                    ...r,
                    periode: {
                      sorte: 'dates',
                      du: e.target.value === '' ? null : e.target.value,
                      au: bornesDuChoix(r.periode).au,
                    },
                  }))} />
              </label>
              <label className="hdb-date">
                <span className="svv-label">Au</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={bornesDuChoix(reglages.periode).au ?? ''}
                  onChange={(e) => setReglages((r) => ({
                    ...r,
                    periode: {
                      sorte: 'dates',
                      du: bornesDuChoix(r.periode).du,
                      au: e.target.value === '' ? null : e.target.value,
                    },
                  }))} />
              </label>
            </div>
          )}

          {/* LES DEUX MOTIFS DE GRISAGE, ÉCRITS — une information portée par une seule infobulle n'existe pas. */}
          {periodeLocataire === null && <p className="gst-note hdb-note">{SANS_LOCATAIRE_CONNU}</p>}
          {evenementsIllisibles && (
            <p className="gst-note hdb-note" role="status">
              Les événements de ce bien n’ont pas pu être lus — les deux dates restent utilisables.
            </p>
          )}
          {!evenementsIllisibles && evenements.length === 0 && (
            <p className="gst-note hdb-note">{SANS_EVENEMENT}</p>
          )}
        </fieldset>

        {/* ══ 🔴🔴 BLOC 2 — « PARTIES » : CAPSULES, DEUX ENCARTS, DEUX BANDES (lot HISTORIQUE-BIEN-3) ══════════
            DEMANDE D'ARNO (05/10/2026) : « Chaque partie devient une CAPSULE (pastille arrondie : case à cocher,
            nom ou adresse, compteurs a écrit / en copie, et la date pour les locataires). » Et : « “Tiers
            indépendant” : une ligne déployable SOUS les deux encarts, pleine largeur, bleue, repliée par défaut,
            qui reste une zone de dépôt même repliée (elle s'ouvre au survol pendant un glisser). Même chose pour
            “Non affectés” (grise). » */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Parties</legend>

          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LA LIGNE D'ÉTAT REMPLACE L'INTERRUPTEUR ══════════════════
              DEMANDE D'ARNO (05/10/2026) : « La case “Tous les mails du bien sur la période” est remplacée par
              cette règle automatique : à sa place, une ligne d'état claire […] avec un bouton “Tout décocher”. »

              🔴 CE QUE L'INTERRUPTEUR FAISAIT, ET QUI ÉTAIT LE DÉFAUT : allumé par défaut, il IGNORAIT les cases
              cochées (règle du lot 2). Cocher « Propriétaire » ne changeait donc rien, et rien ne le disait. Sur
              lot-290, mesuré : le groupe Propriétaire est dans 198 mails sur 326 — Arno en voyait 326.

              ⚠️ LA PHRASE EST UN `role="status"` : elle change sans que le focus bouge, et un lecteur d'écran
              l'annonce. Une règle automatique qu'on ne voit pas serait le défaut inverse de celui qu'on répare. */}
          <div className="hdb-selection" role="status">
            {/* 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 4 — LE COMPTE EST CELUI DU LISTING, ET C'EST LE MÊME ÉTAT QUI
                LE PORTE (`etat.total` = `entete.nbMails` de la route). Il suit donc les cases, la période et les
                options sans rien de plus : il vient de la même réponse que le fil.

                🔴 AU-DELÀ DES 100 CHARGÉS, C'EST BIEN LA SÉLECTION ENTIÈRE : la route compte sur toute la
                sélection, pas sur la page. Écrire `lignes.length` ici aurait affiché « 100 mails » sur un bien
                qui en a 326 — exactement le genre de nombre qu'on croit.

                ⚠️ PENDANT UNE RECHERCHE, C'EST LE NOMBRE TROUVÉ : le listing affiche alors « N mails sur M », et
                la ligne d'état doit dire la même chose que lui.

                🔴 ET CE NOMBRE VIENT MAINTENANT DU SERVEUR (lot FRISE-PICTOS-PLUS-GRANDS…, point 3). Il valait
                `lignes.length`, la page filtrée à l'écran — ce qui était juste quand la recherche ne portait
                que sur les mails chargés. Depuis qu'elle porte sur TOUT le bien, écrire `lignes.length` aurait
                annoncé « 82 mails » quand la page en montre 82 sur 82 trouvés… mais « 100 mails » le jour où
                la recherche en trouve 140. C'est le même piège que la ligne du dessus, à une page près.

                ⚠️ `undefined` TANT QUE LA PREMIÈRE RÉPONSE N'EST PAS LÀ : « — 0 mail » pendant le chargement
                aurait annoncé un bien vide à chaque ouverture de fiche. */}
            <span className="hdb-selection-mot">
              {motSelectionDesParties(
                reglages.parties.length,
                etat.v !== 'ok' ? undefined : etat.total,
              )}
            </span>
            {/* 🔴 LE BOUTON N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À DÉCOCHER : un bouton qui ne fait rien
                apprend à ne plus lire la ligne qui le porte. Il remet AUSSI l'agence (tout recoché). */}
            {(reglages.parties.length > 0 || reglages.agenceEcartee.length > 0) && (
              <button type="button" className="svv-btn svv-btn-outline gst-btn hdb-btn-decocher"
                onClick={() => setReglages((r) => ({ ...r, parties: [], agenceEcartee: [] }))}>
                {MOT_TOUT_DECOCHER}
              </button>
            )}
          </div>
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — CE QUE LE RÉSUMÉ N'A PAS REPRIS, DIT EN TOUTES LETTRES ══
              DEMANDE D'ARNO : « Sous la ligne d'état, une phrase discrète apparaît SEULEMENT si c'est le cas. »

              🔴 PARCE QU'UN FILTRE SILENCIEUX EST PIRE QUE LE DÉFAUT QU'IL CORRIGE. En écartant le RIB de
              DERRIEN, on retire du résumé un document qui EXISTE et que le listing montre toujours. Sans cette
              phrase, on chercherait une pièce qu'on a vue la veille sans jamais comprendre pourquoi elle n'est
              plus là — et l'on finirait par douter du résumé entier.

              ⚠️ ELLE NE S'AFFICHE QUE QUAND IL Y A QUELQUE CHOSE À DIRE (`motPiecesEcartees` rend `null` à
              zéro) : une phrase permanente « 0 pièce écartée » apprend à l'œil à ne plus la lire. */}
          {motPiecesEcartees(recap.nbEcartees) !== null && (
            <p className="gst-note hdb-note hdb-ecartees" role="status">
              {motPiecesEcartees(recap.nbEcartees)}
            </p>
          )}
          {cartesContact.length > 0 && (
            <p className="gst-note hdb-note">
              {(() => {
                const aVerifier = cartesContact.filter((c) => !c.verifie).length;
                const n = cartesContact.length;
                const total = `${n} contact${n > 1 ? 's' : ''} pré-rempli${n > 1 ? 's' : ''} pour ce bien`;
                return aVerifier === 0
                  ? `${total} — tous vérifiés.`
                  : `${total}, dont ${aVerifier} à vérifier et compléter.`;
              })()}
            </p>
          )}

          {/* ── LES DEUX ENCARTS, CÔTE À CÔTE ───────────────────────────────────────────────────────────────── */}
          <div className="hdb-encarts">
            {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES DEUX ENCARTS SONT **TOUJOURS** LÀ ═══════════════════
                RÈGLE D'ARNO : « sur TOUTE fiche bien, les deux encarts sont TOUJOURS affichés côte à côte, même
                largeur : Propriétaire à GAUCHE, Locataire à DROITE. »

                🔴 CE QUI ÉTAIT ÉCRIT ICI, ET QUI A PRODUIT LE DÉFAUT : `if (g.nb === 0) return null`. Un encart
                vide disparaissait, et la grille `auto-fit` laissait le survivant occuper toute la ligne — d'où
                « l'encart Locataire prend toute la largeur ». Les deux moitiés de la cause sont corrigées
                ensemble : ici le rendu, et dans la feuille les DEUX colonnes fixes.

                ⚠️ L'ORDRE VIENT DE `GROUPES_EN_ENCART`, qui dit déjà `['proprietaire', 'locataire']` : gauche
                et droite ne sont donc pas décidés ici, et ne peuvent pas diverger de la liste des groupes. */}
            {GROUPES_EN_ENCART.map((cle) => {
              const g = parties.groupes.find((x) => x.cle === cle);
              if (g === undefined) return null;
              return (
                <GroupeDeParties key={cle} g={g} forme="encart" reglages={reglages} bascules={bascules}
                  motSiVide={motEncartVide(cle, clientConnuPour(cle, clients))}
                  periodes={periodes} categoriesFiche={categories} cartesParAdresse={cartesParAdresse}
                  fichesClientes={fichesClientes} onFicheClient={onFicheClient}
                  survol={survol} glisse={glisse} menu={menu}
                  onBasculerRepli={basculerRepli} onBasculerPartie={basculerPartie} onBasculerGroupe={basculerGroupe}
                  onCreer={ouvrirCreation} onMenu={setMenu} onGlisse={setGlisse} onSurvol={setSurvol}
                  onDeplacer={deplacer} onPeriode={reglerPeriodeSurLeBail}
                  /* ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — SEUL L'ENCART LOCATAIRE A UN EN-TÊTE À DEUX BOUTONS ═══
                     C'est là que la règle vit : le gabarit commun, lui, ne connaît que « un titre de rechange »
                     et « une zone qui remplace les capsules ». Lui faire connaître les cartes de locataire
                     aurait mis une règle de locataire dans le composant qui rend les quatre groupes. */
                  /* 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — LE LISERÉ SUIT L'ONGLET AFFICHÉ (Arno). Le ton est
                     celui du vocabulaire, lu par la MÊME fonction que la couleur d'un mail d'ancien locataire :
                     `tonDuGroupe('ancien_locataire')`. Aucune couleur n'est décidée ici. */
                  ton={cle === 'locataire' && surAnciens ? tonDuGroupe('ancien_locataire') : undefined}
                  titre={cle !== 'locataire' ? undefined : (
                    <EnTeteLocataire
                      nbActuels={parties.nbLocatairesActuels} anciens={anciens} choix={choixLocataire}
                      enPlaceOffert={ilYAUnLocataireEnPlace(cartesLocataires)}
                      listeOuverte={listeAnciensOuverte} surAnciens={surAnciens}
                      onActuels={() => { setListeAnciensOuverte(false); choisirLocataire(CHOIX_LOCATAIRE_DEFAUT); }}
                      onAnciens={() => setListeAnciensOuverte((v) => !v)} />
                  )}
                  /* 🔴 LA LISTE PREND LA PLACE DES CAPSULES — demande d'Arno : « dans la ZONE D'AFFICHAGE DES
                     CAPSULES (à leur place) ». Choisir une carte la referme : « le choix la valide ». */
                  zone={cle !== 'locataire' || !listeAnciensOuverte ? undefined : (
                    <ListeDesAnciens nom={`hdb-loc-${lotCle}`} anciens={anciens} choix={choixLocataire}
                      onChoisir={(c) => { setListeAnciensOuverte(false); choisirLocataire(c); }} />
                  )} />
              );
            })}
          </div>

          {/* ══ 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — LA MENTION DE LA BASCULE, SOUS LES ENCARTS ═══════════════
              Arno : « Petite mention discrète sous l'encart quand la bascule a lieu […]. Elle disparaît d'elle-
              même. » Elle dit ce qui vient d'être fait ET pourquoi : un décochage silencieux se lit comme une
              case qui n'a pas pris, on recoche, l'autre se décoche à son tour, et l'on croit l'écran cassé.

              🔴 `role="status"` : rien n'est cassé, et l'on vient d'agir — interrompre une lecture d'écran pour
              un décochage attendu serait disproportionné. Le MOT vient du module pur, comme tous les autres. */}
          {bascule !== null && (
            <p className="gst-note hdb-exclusif" role="status">{motBasculeLocataires(bascule.quoi)}</p>
          )}

          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LES DEUX BANDES SONT **TOUJOURS** LÀ, MÊME À ZÉRO ════════
              RÈGLE D'ARNO : « Sous les deux encarts, sur toute la largeur, deux lignes dépliables, repliées par
              défaut, chacune avec son compteur et sa case “tout le groupe” : “Tiers indépendant” (bleu) puis
              “Non affectés” (gris). Elles sont TOUJOURS présentes, même à 0, et restent des zones de dépôt
              quand elles sont repliées (elles s'ouvrent au survol pendant un glisser). »

              🔴 CE QUI ÉTAIT ÉCRIT ICI : un groupe vide rendait `null` TANT QU'AUCUN GLISSER N'ÉTAIT EN COURS.
              Une bande vide n'existait donc QUE pendant un glisser. Deux conséquences, et la seconde est la
              pire :
                · on ne pouvait pas LIRE qu'un bien n'a aucun tiers indépendant — l'absence de ligne ne dit
                  rien, ni « zéro » ni « pas encore chargé » ;
                · et la bande APPARAISSAIT SOUS LE CURSEUR au premier mouvement du glisser, poussant les deux
                  encarts vers le haut au moment précis où l'on vise. On visait alors une cible qui venait de
                  bouger — le genre de défaut qu'on met sur le compte de sa propre maladresse.

              ⚠️ UNE BANDE REPLIÉE EST DÉJÀ UNE ZONE DE DÉPÔT, et elle l'était avant ce lot : les trois gestes
              (`onDragOver`, `onDragLeave`, `onDrop`) sont posés sur la `section` entière, pas sur la liste. Le
              repli ne cache que les capsules. Et le survol pendant un glisser l'ouvre sans le mémoriser. */}
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 2 — L'ORDRE DES TROIS LIGNES ════════════════════════════════
              DEMANDE D'ARNO (05/10/2026) : « Tiers indépendant, puis Notre agence, puis Non affectés en
              DERNIER. »

              🔴 L'ORDRE VIENT DU MODULE PUR (`BANDES_SOUS_LES_ENCARTS`), agence comprise. L'intercaler ici à la
              main aurait fait décider à l'écran d'un ordre que ce module existe pour tenir — et il aurait fallu
              le retrouver le jour d'un quatrième groupe.

              ⚠️ « NOTRE AGENCE » N'EST PAS UNE CATÉGORIE : pas de « + », pas de glisser, pas de rangement
              (lot 9). Elle a donc son propre composant, et c'est la seule raison de ce `if` dans la boucle. */}
          {BANDES_SOUS_LES_ENCARTS.map((cle) => {
            if (cle === 'agence') {
              return (
                <BandeAgence key="agence" adresses={parties.agence} ecartees={reglages.agenceEcartee}
                  ouvert={bascules.has('agence')} onBasculerRepli={() => basculerRepli('agence')}
                  onBasculer={basculerAgence} onToutLeGroupe={basculerToutLagence} />
              );
            }
            const g = parties.groupes.find((x) => x.cle === cle);
            if (g === undefined) return null;
            return (
              <GroupeDeParties key={cle} g={g} forme="bande" reglages={reglages} bascules={bascules}
                periodes={periodes} categoriesFiche={categories} cartesParAdresse={cartesParAdresse}
                fichesClientes={fichesClientes} onFicheClient={onFicheClient}
                survol={survol} glisse={glisse} menu={menu}
                onBasculerRepli={basculerRepli} onBasculerPartie={basculerPartie} onBasculerGroupe={basculerGroupe}
                onCreer={ouvrirCreation} onMenu={setMenu} onGlisse={setGlisse} onSurvol={setSurvol}
                onDeplacer={deplacer} onPeriode={reglerPeriodeSurLeBail} />
            );
          })}

          {/* ══ 🔴🔴 LE MESSAGE D'APRÈS-DÉPÔT, ET SON « ANNULER » ═══════════════════════════════════════════════
              Arno : « après le dépôt, petit message “Fanny Rosky → Locataire” avec “Annuler” quelques secondes. »

              🔴 LE NOM **ET** LA DESTINATION : c'est la seule phrase qui permette de vérifier qu'on n'a pas
              lâché la capsule une rangée trop bas. « Déplacé » tout court aurait obligé à retrouver la capsule
              pour le savoir — ce qu'on vient justement de faire disparaître de l'écran. */}
          {dernierGeste !== null && (
            <p className="hdb-fait" role="status">
              <span className="hdb-fait-mot">{dernierGeste.mot}</span>
              <button type="button" className="hdb-fait-annuler" disabled={annulationEnCours}
                onClick={() => { void annulerDeplacement(); }}>
                {annulationEnCours ? 'Annulation…' : 'Annuler'}
              </button>
            </p>
          )}
          {refusDeplacement !== null && <p className="gst-erreur" role="status">{refusDeplacement}</p>}
          {/* 🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — ce que le renommage a répondu. Il DIT si les copies du Drive
              ont suivi : un renommage à moitié fait, muet, laisse croire que tout porte le même nom. */}
          {motRenommage !== null && (
            <p className="gst-note hdb-note" role="status">{motRenommage}</p>
          )}

          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE « + » OUVRE LE FORMULAIRE DES CLIENTS, LE MÊME ═════════
              DEMANDE D'ARNO : « Le formulaire du “+” doit être le MÊME que celui des clients (“Nouvelle fiche” /
              “Modifier la fiche”), le MÊME composant, pas une copie. »

              🔴 CE QUI DISPARAÎT ICI EST LA PETITE CARTE DE QUATRE CHAMPS du lot 6 (adresse en lecture seule,
              nom, téléphone, catégorie). Elle n'était pas fausse, elle était PAUVRE : on y saisissait un
              contact, et la fiche d'un client en demandait huit de plus. Et surtout elle AURAIT DIVERGÉ — c'est
              la leçon que ce dépôt a déjà payée avec deux listes de domaines et trois listes de types d'images.

              🔴 CE QUI RESTE À CE BLOC EST CE QUE LUI SEUL SAIT : la CATÉGORIE. Elle lui appartient parce que
              lui seul connaît le groupe d'où l'on a cliqué, la déduction de la règle à trois étages, et ce qu'un
              « Tiers indépendant » implique (aucune carte, un rangement global). Le formulaire la rend telle
              qu'on la lui donne, en tête — avant les huit champs, parce qu'elle décide de tout le reste. */}
          {aCreer !== null && (
            <div className="hdb-creation" role="group" aria-label="Ranger cette partie et créer son contact">
              <FormulaireCarte
                p={aCreer.fiche}
                refus={refusCreation}
                onAnnuler={() => { setACreer(null); setRefusCreation(null); }}
                onEnregistrer={async (champs) => { await enregistrerCreation(champs); }}
                contact={{
                  titre: TITRE_CONTACT_NOUVEAU,
                  rappel: <>Rangé pour ce bien, sous l’adresse <strong>{aCreer.adresse}</strong>.</>,
                  /**
                   * 🔴🔴 LA CATÉGORIE MANQUANTE BLOQUE « ENREGISTRER », ET C'EST LE FORMULAIRE QUI LE TIENT.
                   *
                   * Il sait déjà griser son bouton et afficher le motif dans son infobulle : lui passer cette
                   * exigence-ci est donc une LIGNE, là où désactiver le bouton de l'extérieur aurait demandé un
                   * bricolage de style — qui n'aurait rien dit à un lecteur d'écran, et qu'un clavier aurait
                   * contourné. Sans ce blocage, « Enregistrer » posterait un rangement sans catégorie, que le
                   * serveur refuse : un aller-retour pour rien, et un refus rouge pour un champ qu'on voit.
                   */
                  empeche: aCreer.categorie === '' ? MANQUE_CATEGORIE : null,
                  categorie: (
                    <>
                      <label className="cp-champ">
                        <span className="cp-champ-mot">Catégorie</span>
                        <select className="cp-saisie" value={aCreer.categorie}
                          onChange={(e) => setACreer((c) => (c === null ? c
                            : { ...c, categorie: e.target.value as Categorie | '' }))}>
                          {/* ⚠️ L'OPTION VIDE EXISTE, et elle est le défaut quand rien n'a été déduit : un choix
                              pré-coché au hasard se valide sans être lu. */}
                          <option value="">— à choisir —</option>
                          <option value="proprietaire">Propriétaire</option>
                          <option value="locataire">Locataire</option>
                          <option value="independant">Tiers indépendant</option>
                        </select>
                        {/* 🔴 LE MANQUE EST DIT SOUS SON CHAMP, comme les autres : c'est la convention du
                            formulaire, et un bouton grisé sans motif est une énigme. C'est le MÊME texte que
                            `empeche` ci-dessous — écrit une fois, lu deux fois (voir `MANQUE_CATEGORIE`). */}
                        {aCreer.categorie === '' && <span className="cp-manque">{MANQUE_CATEGORIE}</span>}
                      </label>
                      <p className="gst-note hdb-note">
                        {aCreer.categorie === 'independant'
                          ? 'Un tiers indépendant est rangé une fois pour TOUS les biens, ne reçoit pas de carte '
                            + 'de contact, et ne sert jamais à l’automatisation.'
                          : aCreer.categorie === ''
                            ? 'La catégorie décide du reste : un tiers indépendant ne reçoit aucune carte.'
                            : `Rangée côté ${coteDeLaCategorie(aCreer.categorie) === 'proprietaire' ? 'propriétaire' : 'locataire'} `
                              + 'de ce bien, avec sa carte dans le carrousel du haut.'}
                      </p>
                    </>
                  ),
                }} />
              {creationEnCours && <p className="gst-note hdb-note" role="status">Enregistrement…</p>}
            </div>
          )}

          {etat.v === 'ok' && etat.tronques && (
            <p className="gst-note hdb-note" role="status">
              Ce bien compte plus de personnes que la liste n’en montre : les moins présentes ne sont pas listées.
            </p>
          )}
          {etat.v === 'ok' && interlocuteurs.length === 0 && (
            <p className="ann-gris">Aucune personne à lister pour ces réglages.</p>
          )}
        </fieldset>

        {/* ══ 🔴🔴 BLOC 3 — « OPTIONS » : UNE SEULE RANGÉE, PROPRE ET ALIGNÉE (lot HISTORIQUE-BIEN-3, point 5)
            DEMANDE D'ARNO (05/10/2026), qui juge l'actuel « immonde » : « Une seule rangée horizontale, propre,
            alignée : à gauche, le champ de recherche (icône loupe, texte “Rechercher dans les mails affichés…”,
            bouton ✕ pour effacer) ; puis un contrôle segmenté “Pièces jointes : Toutes · Avec · Sans” ; une
            puce bascule “Événement ouvert” ; un bouton d'ordre “↓ Plus récent en haut” ; une bascule “Regrouper
            par conversation”. Hauteurs identiques, espacements réguliers, aucun bouton qui passe seul à la
            ligne ; sur écran étroit, retour à la ligne propre par groupes. »

            🔴 « AUCUN BOUTON QUI PASSE SEUL À LA LIGNE » EST TENU PAR LA STRUCTURE, pas par des réglages de
            largeur : chaque contrôle est un GROUPE indivisible (`hdb-opt`), et c'est entre les groupes que la
            rangée se casse. Un `flex-wrap` sur des boutons nus aurait laissé « Sans » tomber seul sous ses deux
            voisins — le défaut exact qu'Arno a sous les yeux. */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Options</legend>
          <div className="hdb-rangee">

            {/* ── LA RECHERCHE, À GAUCHE ───────────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt hdb-opt--recherche">
              <span className="hdb-loupe" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9.2 9.2 L12.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <input type="search" className="hdb-champ-recherche" value={saisie} autoComplete="off"
                aria-label="Rechercher dans les mails affichés"
                placeholder="Rechercher dans les mails affichés…"
                onChange={(e) => setSaisie(e.target.value)} />
              {/* ⚠️ LE ✕ N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À EFFACER : un bouton éteint occupe la place et
                  fait croire à une panne. Il est dans le même cadre que le champ, comme une messagerie. */}
              {/**
                * ══ 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE, POINT 4 — « N MAILS », CONTRE LE CHAMP ════════════
                *
                * ARNO : « Ajoute un compteur “N mails” à côté du champ quand une recherche est active. »
                *
                * ⚠️ IL Y EN A DÉJÀ UN, ET IL RESTE : « N mails sur M », à l'autre bout de la rangée
                * d'options (`hdb-compte-recherche`, lot HISTORIQUE-BIEN-3). Arno en demande un CONTRE LE
                * CHAMP, là où le regard est quand on tape — et il a raison, l'autre est à 900 px de là sur
                * un grand écran. Retirer le premier demanderait son accord pour CET élément ; je ne l'ai
                * pas, donc les deux coexistent et je le lui signale.
                */}
              {motsCherches.length > 0 && (
                <span className="hdb-compte-champ" role="status">
                  {/* 🔴 LE NOMBRE TROUVÉ SUR TOUT LE BIEN (point 3), et non sur la page : c'est la question
                      qu'on se pose en tapant. `etat.total` est le compte que le serveur rend pour la
                      sélection filtrée — 82 pour « gohudif » sur le bien 315, là où la page en montre 82
                      aussi, mais où elle n'en montrait que 59 avant ce lot. */}
                  {totalTrouve} mail{totalTrouve > 1 ? 's' : ''}
                </span>
              )}
              {saisie !== '' && (
                <button type="button" className="hdb-effacer" aria-label="Effacer la recherche"
                  title="Effacer la recherche" onClick={() => setSaisie('')}>✕</button>
              )}
            </div>

            {/* ── LES PIÈCES JOINTES, EN CONTRÔLE SEGMENTÉ ─────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <span className="hdb-opt-mot">Pièces jointes</span>
              <div className="hdb-segs" role="group" aria-label="Pièces jointes">
                {([['toutes', 'Toutes'], ['avec', 'Avec'], ['sans', 'Sans']] as const).map(([cle, mot]) => (
                  <button key={cle} type="button" aria-pressed={reglages.pieces === cle}
                    className={`hdb-petit${reglages.pieces === cle ? ' hdb-petit--actif' : ''}`}
                    onClick={() => setReglages((r) => ({ ...r, pieces: cle }))}>{mot}</button>
                ))}
              </div>
            </div>

            {/* ── LA PUCE « ÉVÉNEMENT OUVERT » ─────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <button type="button" aria-pressed={reglages.evenementOuvert}
                className={`hdb-puce-bascule${reglages.evenementOuvert ? ' hdb-puce-bascule--actif' : ''}`}
                onClick={() => setReglages((r) => ({ ...r, evenementOuvert: !r.evenementOuvert }))}>
                Événement ouvert
              </button>
            </div>

            {/* ── L'ORDRE ──────────────────────────────────────────────────────────────────────────────────────
                🔴 LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait — convention de tout le module. La
                flèche d'Arno (« ↓ Plus récent en haut ») le dit deux fois, et c'est bien : la flèche se voit du
                coin de l'œil, le mot se lit. */}
            <div className="hdb-opt">
              <button type="button" className="hdb-petit hdb-petit--large"
                onClick={() => setReglages((r) => ({ ...r, ordre: ordreFilSuivant(r.ordre) }))}
                title="Inverser l’ordre du fil">
                <span aria-hidden="true">{reglages.ordre === 'recent' ? '↓' : '↑'}</span>{' '}
                {libelleOrdreFil(reglages.ordre)}
              </button>
            </div>

            {/* ── REGROUPER PAR CONVERSATION ───────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <label className="hdb-bascule">
                <input type="checkbox" checked={reglages.grouper}
                  onChange={(e) => setReglages((r) => ({ ...r, grouper: e.target.checked }))} />
                <span>Regrouper par conversation</span>
              </label>
            </div>

            {/* ══ 🔴 « N MAILS SUR M », EN DIRECT ═══════════════════════════════════════════════════════════
                Arno : « le compteur “N mails sur M” se met à jour en direct ». Il n'apparaît que pendant une
                recherche : un « 25 sur 25 » permanent serait du bruit qu'on apprend à ne plus lire. */}
            {/**
              * ⚠️ LE DÉNOMINATEUR A CHANGÉ DE SOURCE, PAS DE SENS (point 3). Il valait `lignesPage.length` —
              * la page — et c'était juste tant que l'écran filtrait lui-même : la page portait la sélection
              * entière. Le serveur filtrant désormais, la page EST le résultat, et « 82 mails sur 82 » aurait
              * été vrai et vide. On compare donc aux mails de la SÉLECTION, que la route compte à part.
              *
              * 🔴 ARNO DEMANDE EXPRESSÉMENT DE LE GARDER (« NE retire PAS l'ancien compteur ») : il est donc
              * réparé, pas retiré.
              */}
            {motCompteurRecherche(totalTrouve, totalSelection, motsCherches.length > 0) !== null && (
              <p className="hdb-compte-recherche" role="status">
                {motCompteurRecherche(totalTrouve, totalSelection, true)}
              </p>
            )}
          </div>
        </fieldset>
      </div>

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LA FRISE, À LA PLACE DE L'ANCIENNE LÉGENDE ═══════════════════
          DEMANDE D'ARNO : « À LA PLACE DE L'ANCIENNE LÉGENDE : UNE FRISE CHRONOLOGIQUE (pleine largeur). »

          🔴 ELLE SUIT LES PARTIES COCHÉES, et c'est la MÊME lecture que le listing qui le lui donne : sa route
          applique `conditions(f)`, la fonction des trois autres questions de l'écran. « Un seul code » (Arno).

          🔴 LE TON D'UN TRAIT VIENT DE `categoriesFusionnees`, LA MÊME CARTE QUE LES LISERÉS du fil : un mail ne
          peut pas être rouge sur la frise et vert trois lignes plus bas.

          ⚠️ RIEN TANT QU'IL N'Y A PAS DE MAIL : une frise de douze mois vides au-dessus d'un bien neuf n'apprend
          rien, et prendrait la place du message qui, lui, dit ce qu'il en est. */}
      {friseMails.length > 0 && (
        <FriseDuBien
          mails={friseMails}
          occupations={occupations}
          evenements={evenements}
          maintenant={maintenant}
          categories={categoriesFusionnees}
          bornes={bornesDuChoix(reglages.periode)}
          tronqueeParLaLecture={friseTronquee}
          /* 🔴 CLIC SUR UN TRAIT : « le listing défile jusqu'à ce mail et le surligne brièvement » (Arno). Le
             geste existait déjà pour le retour d'une conversation — on le réemprunte, au lieu d'en écrire un
             second qui aurait fini par surligner autrement. */
          onMail={(messageId) => {
            /**
             * ══ 🔴🔴 UN TRAIT PEUT DÉSIGNER UN MAIL QUI N'EST PAS DANS LA PAGE — ET IL FAUT LE DIRE ═══════
             *
             * 🔴 DÉFAUT TROUVÉ À L'ÉCRAN, en cliquant un trait de 2025 sur lot-146. La frise couvre TOUTE la
             * sélection (c'est tout son intérêt) ; le listing, lui, s'arrête à 100 mails par page. Un trait
             * plus ancien que la page ne mène donc à rien : le clic ne faisait RIEN, en silence, et l'on
             * croyait la frise cassée.
             *
             * ⚠️ ON NE CHANGE NI LA PAGE NI LA PÉRIODE À SA PLACE : les deux modifieraient la sélection sous
             * ses yeux, alors qu'il voulait seulement voir un mail. On dit où il est, et il décide.
             */
            const cible = document.getElementById(`hdb-mail-${messageId}`);
            if (cible === null) {
              setFriseHorsPage(true);
              return;
            }
            setFriseHorsPage(false);
            setMailSurligne(messageId);
            cible.scrollIntoView?.({ block: 'center' });
          }} />
      )}
      {friseHorsPage && (
        <p className="gst-note hdb-note" role="status">
          Ce mail n’est pas dans la page affichée du fil — « Voir la suite → » pour l’atteindre.
        </p>
      )}

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « Mail sorti du suivi de … — Annuler », quelques secondes ════
          Arno : « Après : le mail disparaît en direct du listing, le compteur et le résumé se mettent à jour, et
          un message propose “Annuler” quelques secondes (rétablit exactement l'état d'avant). »

          🔴 LE BANDEAU DIT LE BIEN, pas seulement « c'est fait » : on peut avoir deux historiques ouverts, et
          c'est la seule phrase qui permette de vérifier qu'on a sorti le mail du bon dossier. */}
      {sortieFaite !== null && (
        <p className="hdb-fait" role="status">
          <span className="hdb-fait-mot">{sortieFaite.mot}</span>
          <button type="button" className="hdb-fait-annuler" disabled={annulationSortie}
            onClick={() => { void annulerSortie(); }}>
            {annulationSortie ? 'Annulation…' : 'Annuler'}
          </button>
        </p>
      )}
      {sortieFaite === null && sortieRefus !== null && aSortir === null && (
        <p className="gst-erreur" role="status">{sortieRefus}</p>
      )}

      {/* ══ LE RÉSUMÉ DES PIÈCES, EN HAUT — REPLIÉ, AVEC SON COMPTE LISIBLE SANS CLIC ══════════════════════════
          ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 1 — ET LA LÉGENDE DES BARRES, SUR LA MÊME LIGNE, À DROITE ════════
          DEMANDE D'ARNO : « La ligne de légende descend sur la même ligne que le bouton "N pièces dans cette
          sélection — les voir", ALIGNÉE À DROITE. Rien d'autre ne change. »

          🔴 LA CONDITION D'AFFICHAGE S'ÉLARGIT, ET IL LE FALLAIT. Ce bloc n'existait que `totalPieces > 0` : y
          glisser la légende telle quelle l'aurait fait DISPARAÎTRE sur un bien dont les mails ne portent aucune
          pièce — une légende perdue pour faire de la place, c'est-à-dire une fonctionnalité retirée. Chacune
          garde donc sa propre condition, et elles partagent une ligne quand elles sont là toutes les deux. */}
      {(totalPieces > 0 || lignes.length > 0) && (
        <div className="hdb-resume hdb-resume--haut" ref={ancreResumeHaut}>
          <div className="hdb-resume-ligne">
            {totalPieces > 0 && (
              <BasculeResume n={totalPieces} ouvert={resumeOuvert} onBasculer={() => setResumeOuvert((v) => !v)} />
            )}
            {/* ⚠️ CHAQUE ENTRÉE PORTE SON MOT, pas seulement sa pastille : c'est le mot qui informe, la couleur
                ne fait que l'appuyer — même règle que les capsules de statut dans tout ce module. */}
            {lignes.length > 0 && (
              <p className="hdb-legende-barres">
                {LEGENDE_BARRES.map((x) => (
                  <span key={x.ton} className="hdb-legende-item">
                    <span aria-hidden="true" className={`hdb-legende-pastille hdb-legende-pastille--${x.ton}`} />
                    {x.mot}
                  </span>
                ))}
              </p>
            )}
          </div>
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LA NOTE A DISPARU DU CAS ORDINAIRE ══════════════════════
              « Cette sélection compte plus de 100 mails : le résumé porte sur les N mails affichés » était la
              phrase qu'Arno demande de retirer, et elle l'est : le résumé couvre désormais la sélection entière.
              `motPorteeDuResume` ne parle plus que des trois cas où ce n'est PAS vrai — borne atteinte,
              recherche en cours, lecture en échec — et rend `null` partout ailleurs. */}
          {porteeDuResume !== null && <p className="gst-note hdb-note">{porteeDuResume}</p>}
          {resumeOuvert && (
            <ResumeDeplie n={totalPieces} onFermer={() => fermerResumeDepuisLaFin('haut')}
              groupes={groupesPieces} depots={depots} emplacements={emplacements}
              maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte}
              categories={categoriesFusionnees} destinataires={destinatairesDuMessage} />
          )}
        </div>
      )}

      {/* ══ LE FIL ══ `LigneVie`, une par mail — LE composant de « Vie du bien », importé et non recopié. */}
      {etat.v === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
        : etat.v === 'erreur' ? <p className="gst-erreur" role="status">{etat.message}</p>
          : lignes.length === 0 ? (
            <div className="hdb-vide" role="status">
              <p className="ann-gris">{motAucunResultat(reglages)}</p>
              {reglagesActifs(reglages) && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={remettreAPlat}>
                  Tout remettre à plat
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 🔴 « REGROUPER PAR CONVERSATION » DÉCOUPE LE FIL REÇU, il ne le retrie pas : l'ordre reste
                  décidé à un seul endroit (`trierFil`), et le découpage par `grouperParConversation`. */}
              {reglages.grouper
                ? conversations.map((c) => (
                  <section key={c.filId} className="hdb-conv" aria-label={`Échange : ${nettoyerObjet(c.objet ?? '') || '(sans objet)'}`}>
                    <h5 className="hdb-conv-titre">
                      {nettoyerObjet(c.objet ?? '') || '(sans objet)'}
                      <span className="gst-compte">{c.lignes.length}</span>
                    </h5>
                    <FilDeMails lignes={c.lignes} maintenant={maintenant} deplie={deplie}
                      categories={categoriesFusionnees} surligne={mailSurligne} mots={motsCherches}
                      onBasculer={basculerMail} onOuvrirFil={ouvrirLaConversation}
                      onVisualiser={setPieceVue} destinataires={destinatairesDuMessage}
                      piecesCitables={piecesParFil}
                      sortieDuSuivi={sortieOfferte}
                      modifierRattachement={modificationOfferte}
                      /* 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — les mêmes deux propriétés que le montage
                         à plat, juste en dessous : un seul comportement pour les deux façons de voir le fil. */
                      repondre={peutRepondre ? repondreAuMail : undefined}
                      composeurDe={composeurDuMail} />
                  </section>
                ))
                : (
                  <FilDeMails lignes={lignes} maintenant={maintenant} deplie={deplie}
                    categories={categoriesFusionnees} surligne={mailSurligne} mots={motsCherches}
                    onBasculer={basculerMail} onOuvrirFil={ouvrirLaConversation}
                    onVisualiser={setPieceVue} destinataires={destinatairesDuMessage}
                    piecesCitables={piecesParFil}
                    sortieDuSuivi={sortieOfferte}
                    modifierRattachement={modificationOfferte}
                    repondre={peutRepondre ? repondreAuMail : undefined}
                    composeurDe={composeurDuMail} />
                )}

              <div className="vdb-pages">
                {page > 0 && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n - 1)}>← Page précédente</button>
                )}
                {etat.suite && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n + 1)}>Voir la suite →</button>
                )}
                {reglagesActifs(reglages) && (
                  <button type="button" className="gst-lien-bouton"
                    onClick={remettreAPlat}>
                    Tout remettre à plat
                  </button>
                )}
              </div>

              {/* ══ 🔴🔴 LE MÊME BOUTON, EN BAS DU LISTING (lot HISTORIQUE-BIEN-4, point 4) ═══════════════════
                  Arno : « Le MÊME bouton est ajouté EN BAS du listing des mails : il ouvre et ferme le même
                  résumé (un seul état partagé). » Après avoir lu quarante mails, on est en bas : remonter
                  chercher le bouton du haut était un aller-retour pour rien. */}
              {totalPieces > 0 && (
                <div className="hdb-resume hdb-resume--bas" ref={ancreResumeBas}>
                  <BasculeResume n={totalPieces} ouvert={resumeOuvert}
                    onBasculer={() => setResumeOuvert((v) => !v)} />
                  {resumeOuvert && (
                    <ResumeDeplie n={totalPieces} onFermer={() => fermerResumeDepuisLaFin('bas')}
                      groupes={groupesPieces} depots={depots} emplacements={emplacements}
                      maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte}
                      categories={categoriesFusionnees} destinataires={destinatairesDuMessage} />
                  )}
                </div>
              )}
            </>
          )}

      {/* ══ 🔴 LE LIEN DISCRET VERS L'ÉCRAN PLEIN, TOUT EN BAS (lot HISTORIQUE-BIEN-3) ═════════════════════════
          Arno : « petit lien discret “Écran historique complet” en bas du nouveau bloc ».

          ⚠️ EN BAS, ET DISCRET, PARCE QUE C'EST UNE SORTIE, PAS UNE ACTION. Le mettre en tête aurait proposé de
          quitter le bloc avant de l'avoir lu ; le mettre en gros aurait suggéré qu'il y a mieux ailleurs. */}
      {onEcranComplet !== undefined && (
        <p className="hdb-sortie">
          <button type="button" className="gst-lien-bouton" onClick={onEcranComplet}>
            Écran historique complet →
          </button>
        </p>
      )}

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LA QUESTION POSÉE AVANT ════════════════════════════════════
          Arno : « Avant : confirmation “Sortir ce mail du suivi de <adresse du bien> ? Ses N pièces jointes
          quitteront aussi cet historique.” avec Confirmer / Annuler. »

          🔴 UNE CONFIRMATION ICI, ET PAS AILLEURS : le geste retire un mail d'un dossier, et le bouton vit au
          milieu d'une liste qu'on parcourt. Le « Annuler » d'après ne suffit pas seul — il dure huit secondes,
          et c'est huit secondes après qu'on comprend souvent ce qu'on vient de faire. Les deux ensemble.

          ⚠️ LE NOMBRE DE PIÈCES EST CELUI DU MAIL, tel que la ligne le porte : c'est le même que son trombone. */}
      {aSortir !== null && (
        <div className="hdb-voile" role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget && !sortieEnCours) setASortir(null); }}>
          <div className="hdb-confirme" role="dialog" aria-modal="true" aria-labelledby="hdb-sortir-titre">
            <p className="hdb-confirme-mot" id="hdb-sortir-titre">
              {motConfirmationSortie({
                adresseDuBien: adresseBien,
                nbPieces: trierPieces(aSortir.pieces).vraies.length,
              })}
            </p>
            {/* ⚠️ CE QUI NE BOUGE PAS EST DIT AUSSI : c'est la moitié de la question qu'on se pose avant de
                cliquer, et la taire obligerait à aller le vérifier ailleurs. */}
            <p className="hdb-confirme-note">
              Ses autres biens éventuels ne bougent pas, et les fichiers déjà rangés dans le Drive non plus.
            </p>
            {sortieRefus !== null && <p className="gst-erreur" role="status">{sortieRefus}</p>}
            <p className="hdb-confirme-boutons">
              <button type="button" className="svv-btn gst-btn" disabled={sortieEnCours}
                onClick={() => setASortir(null)}>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={sortieEnCours}
                onClick={() => { void confirmerSortie(); }}>
                {sortieEnCours ? 'Sortie…' : 'Confirmer'}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — LA VISIONNEUSE, RÉTABLIE ═══════════════════════════════════
          CONSTAT D'ARNO : « l'œil ouvre le document directement en plein écran au lieu de la visionneuse
          habituelle (fenêtre avec le document, le renommage au-dessus, la navigation et la fermeture) ».

          🔴 C'EST LE MÊME COMPOSANT QUE PARTOUT AILLEURS — la conversation, l'éditeur de mail, la fenêtre
          Drive. Aucune copie, aucune variante : seuls le TOUR et l'étiquette de navigation changent.

          🔴 LE TOUR EST CELUI DU RÉSUMÉ, ET C'EST LA CORRECTION DE MON ARBITRAGE DE DÉPART. Il porte les pièces
          de toute la sélection — donc de plusieurs échanges — et c'est exactement ce qu'on vient y chercher :
          feuilleter les documents du bien. Le parent inventé reste celui des pièces de courrier, parce que la
          frontière qu'il tient est courrier / Drive, et elle est tenue : aucun fichier du Drive n'entre ici.

          ⚠️ LE TOUR EST `piecesVisionnables` — voir son encadré : les pièces du résumé ET celles des mails
          chargés, parce que l'œil du mail déplié ouvre la MÊME fenêtre. Un tour borné au seul résumé aurait
          affiché un document absent de son propre parcours. */}
      {/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — LA FENÊTRE, EN MODE PONCTUEL ═══════════════════════════
          Arno : « Il ouvre la fenêtre “Bien(s) rattaché(s) à ce mail” (même composant que “Visualiser /
          Modifier”, toutes ses fonctions actuelles […]), MAIS en mode PONCTUEL. »

          🔴 MÊME COMPOSANT, AUCUNE COPIE : c'est `RattachementsDuFil`, celui des trois autres portes. Seule la
          propriété `ponctuel` change ce qu'il MONTRE — pas ce qu'il écrit, ni par où.

          ⚠️ ELLE NE SE REFERME PAS AU GESTE, et c'est délibéré : l'« Annuler » de quelques secondes vit DEDANS,
          et une fenêtre qui se referme emporterait la sortie avec elle (défaut mesuré au lot
          PHOTOS-ET-INTERNE-INVERSE). On recharge l'historique à chaque geste, et elle reste ouverte. */}
      {aModifier !== null && aModifier.filId != null && (
        <RattachementsDuFil filId={aModifier.filId} messageId={aModifier.messageId}
          titre={nettoyerObjet(aModifier.objet ?? '') || null}
          ponctuel
          onFerme={() => setAModifier(null)}
          /* 🔴 LE MÊME RECHARGEMENT QUE L'ANNULATION DE « Sortir du suivi » : la page est REDEMANDÉE, et la
             ligne revient avec son statut, ses événements et sa capsule tels que le serveur les connaît —
             jamais tels qu'on les aurait reconstruits de mémoire. Et la boîte est prévenue, comme toujours. */
          onGeste={(message) => {
            setSortieRefus(message);
            setRechargement((n) => n + 1);
            annoncerClassement({ messageId: aModifier.messageId, filId: aModifier.filId });
          }} />
      )}

      {pieceVue !== null && (
        <ApercuFichierDrive
          fichier={(() => {
            const p = piecesVisionnables.find((x) => x.pieceId === pieceVue);
            return {
              id: String(pieceVue), nom: p?.nomFichier ?? '', typeMime: p?.typeMime ?? '', lien: null,
              parentId: PARENT_PIECES_CONVERSATION, source: 'piece' as const,
            };
          })()}
          voisinage={voisinagePiecesConversation(piecesVisionnables)}
          /* ⚠️ UNE FONCTION DE L'IDENTIFIANT AFFICHÉ, et non un objet figé : « Précédent / Suivant » change la
             pièce DANS la visionneuse sans que ce parent en sache rien (défaut vu à l'écran le 30/09/2026). */
          renommage={(idAffiche) => {
            const p = piecesVisionnables.find((x) => String(x.pieceId) === idAffiche);
            if (p === undefined) return undefined;
            const origine = p.nomOrigine ?? p.nomFichier;
            return {
              nomOrigine: origine,
              nomChoisi: p.nomFichier === origine ? null : p.nomFichier,
              /* L'ŒIL N'OUVRE PAS SUR LE CHAMP (demande d'Arno) : c'est le stylo qui le fait. */
              editerDabord: false,
              refus: null,
              onRenommer: (nom: string) => void renommerLaPiece(p.pieceId, nom),
            };
          }}
          etiquetteNav="Pièces de la sélection"
          joindreAutorise
          motJoindre={{ action: 'Ranger dans le Drive', deja: '✓ dans le Drive' }}
          estDeja={(id) => depots.has(Number(id))}
          onJoindre={(f) => {
            const p = piecesVisionnables.find((x) => String(x.pieceId) === f.id);
            if (p === undefined) return;
            setARanger({
              messageId: p.messageId,
              filId: filDuMessage.get(p.messageId) ?? null,
              pieces: [{
                pieceId: p.pieceId, nom: p.nomFichier,
                tailleOctets: p.tailleOctets, typeMime: p.typeMime,
              }],
            });
          }}
          onFermer={() => setPieceVue(null)} />
      )}

      {/* ══ LA FENÊTRE DRIVE, EN MODE « RANGER » ══ La MÊME que partout : mêmes refus, même arborescence. */}
      {aRanger !== null && (
        <SelecteurFichierDrive
          mode="ranger"
          messageId={aRanger.messageId}
          filId={aRanger.filId}
          pieces={aRanger.pieces}
          onRangement={() => { void relireDrive(); }}
          onFermer={() => setARanger(null)} />
      )}

      {/* ══ LA FENÊTRE DRIVE, EN MODE « CONSULTER » ══ Le picto vert mène ici : arbre déplié jusqu'au document.
          ⚠️ `dossierDepart` PEUT ÊTRE `null` : sans dossier connu, on s'ouvre à la racine plutôt que d'inventer
          un identifiant qui mènerait à une erreur Google. Le repère, lui, reste posé. */}
      {aVoirDansLeDrive !== null && (
        <SelecteurFichierDrive
          mode="consulter"
          dossierDepart={dossierDeLEmplacement(aVoirDansLeDrive.ou)}
          documentEnEvidence={{ driveFileId: aVoirDansLeDrive.ou.driveFileId }}
          /* 🔴🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — la pièce cliquée, en vignette tout en haut de la colonne. */
          piecesSources={[aVoirDansLeDrive.source]}
          arrivee="arborescence"
          onFermer={() => setAVoirDansLeDrive(null)} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — UN GROUPE DE PARTIES : ENCART OU BANDE, ET ZONE DE DÉPÔT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'un groupe reçoit. Beaucoup de props, mais toutes nommées : un objet fourre-tout cacherait les oublis. */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — LE CHOIX DU LOCATAIRE PASSE DANS L'EN-TÊTE DE L'ENCART ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « L'en-tête de l'encart porte DEUX boutons côte à côte, sur la même
 * ligne, à la place du titre actuel "▼ Locataire 2" : "Locataire(s) actuel(s) 2" puis "Anciens locataires (2)".
 * La case "tout le groupe" reste à droite. […] CLIC SUR "Anciens locataires" : il passe en noir et
 * "Locataire(s) actuel(s)" passe en gris clair. Dans la ZONE D'AFFICHAGE DES CAPSULES (à leur place), la liste
 * des cartes d'anciens locataires apparaît […] Une fois une carte choisie (le choix la valide), la liste
 * disparaît et les capsules de cet ancien locataire s'affichent NORMALEMENT dans l'encart. »
 *
 * ═══ 🔴 CE QUI REMPLACE QUOI, ET CE QUI N'EST PAS PERDU ══════════════════════════════════════════════════════════
 *
 * La ligne « Anciens locataires (N) » du BAS de l'encart (lot 13, point 1) disparaît : sa fonction entière est
 * reprise par le bouton de l'en-tête — déplier la liste, choisir une carte, revenir au locataire en place. Rien
 * n'est retiré, tout est déplacé, et Arno l'écrit lui-même (« aucune fonctionnalité perdue »).
 *
 * ═══ 🔴🔴 LE TRIANGLE DE REPLI RESTE, ET IL FALLAIT LE DIRE ══════════════════════════════════════════════════════
 *
 * Le titre remplacé portait AUSSI le repli de l'encart (lot 11, point 3 : « les deux dépliés à l'arrivée »).
 * Le faire disparaître avec lui aurait retiré une fonctionnalité qu'Arno n'a pas demandé de retirer — ce que le
 * dépôt interdit sans son accord. Il garde donc sa place, en tête de ligne, réduit à son seul picto : trois
 * commandes sur la ligne, et chacune ne fait qu'une chose. L'alternative — faire replier l'encart par un second
 * clic sur « Locataire(s) actuel(s) » — aurait donné deux sens au même bouton selon son état, c'est-à-dire le
 * genre de geste qu'on déclenche sans le vouloir.
 *
 * ═══ 🔴 LES DEUX BOUTONS NE SONT PAS DES ONGLETS DE PAGE, ET LE BALISAGE LE DIT ══════════════════════════════════
 *
 * `aria-pressed` plutôt qu'un `role="tab"` : ce sont deux boutons à état, dont l'un est enfoncé. Un vrai jeu
 * d'onglets aurait exigé des panneaux `tabpanel`, la navigation aux flèches et un ordre de tabulation à part —
 * pour une zone qui, la plupart du temps, n'est pas un panneau mais la liste de capsules d'avant ce lot.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function EnTeteLocataire({
  nbActuels, anciens, choix, enPlaceOffert, listeOuverte, surAnciens, onActuels, onAnciens,
}: {
  /** Combien de capsules le choix « locataire en place » afficherait. Lisible même quand on regarde un ancien. */
  nbActuels: number;
  anciens: readonly CarteLocataireBien[];
  choix: ChoixLocataire;
  enPlaceOffert: boolean;
  /** La liste des cartes est-elle affichée À LA PLACE des capsules ? */
  listeOuverte: boolean;
  /**
   * 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — EST-ON SUR L'ONGLET « ANCIENS » ? Calculé PAR LE PARENT, et reçu ici.
   *
   * Il était écrit dans ce composant (`choix.sorte === 'ancien' || listeOuverte`). Le parent en a maintenant
   * besoin lui aussi, pour peindre le liseré de l'encart en violet : deux écritures de la même phrase auraient
   * fini par donner un onglet noir au-dessus d'un liseré vert, ou l'inverse. Elle n'est plus écrite qu'une fois.
   *
   * ⚠️ « SÉLECTIONNÉ » SE LIT SUR LE CHOIX, PAS SEULEMENT SUR LA LISTE : la liste ouverte est un passage, le
   * choix est l'état. Sans quoi, ouvrir la liste puis la refermer sans rien choisir laisserait l'en-tête mentir.
   */
  surAnciens: boolean;
  onActuels: () => void;
  onAnciens: () => void;
}) {
  const choisie = anciens.find((c) => choix.sorte === 'ancien' && c.cle === choix.cle);
  return (
    <>
      <button
        type="button"
        className={`hdb-onglet${surAnciens ? '' : ' hdb-onglet--actif'}`}
        aria-pressed={!surAnciens}
        disabled={!enPlaceOffert}
        /* ⚠️ LE LIBELLÉ ENTIER EN INFO-BULLE : sur un écran étroit il se rogne (voir la feuille), et « Locat… »
           ne dit plus ce qu'on va afficher. Le texte est le même dans les trois états — rien ne clignote. */
        title={enPlaceOffert ? MOT_LOCATAIRES_ACTUELS : AIDE_SANS_LOCATAIRE_ACTUEL}
        onClick={onActuels}>
        {/* 🔴 LE LIBELLÉ EST DANS SON PROPRE ÉLÉMENT, et c'est ce qui sauve le CHIFFRE : l'ellipse s'applique
            au mot, pas au bouton. Rognée sur le bouton, elle emportait d'abord le compte — qui est à la fin. */}
        <span className="hdb-onglet-mot">{MOT_LOCATAIRES_ACTUELS}</span>
        <span className="gst-compte">{nbActuels}</span>
      </button>
      <button
        type="button"
        /* 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — « l'onglet “Anciens locataires (N)” et ses capsules » (Arno).
           L'onglet porte le violet EN PERMANENCE, pas seulement quand il est actif : c'est lui qui annonce la
           couleur des capsules qu'il va montrer, et il doit le dire AVANT qu'on clique. */
        className={`hdb-onglet hdb-onglet--ancien${surAnciens ? ' hdb-onglet--actif' : ''}`}
        aria-pressed={surAnciens}
        aria-expanded={listeOuverte}
        disabled={anciens.length === 0}
        /**
         * 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 2 — LE NOM DE LA CARTE EST ICI, ET PLUS DANS LE LIBELLÉ.
         *
         * Arno : « Pour savoir quelle carte est choisie, une info-bulle sur le bouton suffit. » Le libellé, lui,
         * ne bouge plus : c'est ce qui garde l'en-tête à hauteur constante avant et après le choix.
         */
        title={anciens.length === 0
          ? AIDE_SANS_ANCIEN_LOCATAIRE
          : aideBoutonAnciensLocataires(choisie) ?? motBoutonAnciensLocataires(anciens.length)}
        onClick={onAnciens}>
        <span className="hdb-onglet-mot">{motBoutonAnciensLocataires(anciens.length)}</span>
      </button>
    </>
  );
}

/**
 * ══ 🔴🔴 LA LISTE DES CARTES, À LA PLACE DES CAPSULES ════════════════════════════════════════════════════════════
 *
 * Arno : « la liste des cartes d'anciens locataires apparaît : nom de la carte, période "du … au …", nombre
 * d'adresses, avec un bouton radio. Il n'y en a qu'une à la fois. »
 *
 * 🔴 DE VRAIS BOUTONS RADIO D'UN MÊME `name` : le navigateur tient l'exclusivité lui-même, les flèches du clavier
 * parcourent le groupe, et un lecteur d'écran annonce « 2 sur 3 ». Recoder cela à la main, c'est se donner la
 * possibilité d'en cocher deux — ce qu'Arno interdit depuis le lot 13.
 *
 * ⚠️ ELLE DÉFILE AU MÊME PLAFOND QUE LES CAPSULES (`.hdb-defile`) : elle prend LEUR place, donc elle doit prendre
 * leur place exactement — un logement à huit anciens locataires ne doit pas faire grandir l'encart et désaligner
 * sa jumelle de gauche.
 */
function ListeDesAnciens({ nom, anciens, choix, onChoisir }: {
  nom: string;
  anciens: readonly CarteLocataireBien[];
  choix: ChoixLocataire;
  onChoisir: (c: ChoixLocataire) => void;
}) {
  return (
    <ul className="hdb-anciens-liste hdb-defile">
      {anciens.map((c) => (
        <li key={c.cle}>
          <label className="hdb-anciens-choix">
            <input type="radio" name={nom} checked={choix.sorte === 'ancien' && choix.cle === c.cle}
              onChange={() => onChoisir({ sorte: 'ancien', cle: c.cle })} />
            <span>{motAncienLocataire(c)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

interface PropsGroupe {
  g: GroupeParties;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — CE QUE DIT CE GROUPE QUAND IL N'A AUCUNE CAPSULE.
   *
   * Passé par les ENCARTS, qui sont désormais toujours affichés : « un encart sans capsule reste affiché, avec
   * un texte discret » (Arno). Les BANDES n'en passent pas — leur phrase est celle du dépôt, et une bande sans
   * contact n'a rien d'anormal à expliquer.
   */
  motSiVide?: string;
  /** `encart` = colonne à hauteur fixe (Propriétaire, Locataire) ; `bande` = pleine largeur sous les encarts. */
  forme: 'encart' | 'bande';
  reglages: Reglages;
  /* ⚠️ `| 'agence'` PARCE QUE LE MÊME ÉTAT DE REPLI SERT À LA BANDE DE L'AGENCE (lot 9, point 1). Le groupe,
     lui, reste un `CleGroupeParties` : l'agence n'est pas une partie, et ce composant ne la rend pas. */
  bascules: ReadonlySet<CleGroupeParties | 'agence'>;
  periodes: ReadonlyMap<string, PeriodePartie>;
  /** Les CLIENTS de la fiche : eux seuls ne se déplacent pas. */
  categoriesFiche: ReadonlyMap<string, CategoriePartie>;
  /** Par adresse, les côtés où une carte de contact existe déjà. Décide de la présence du « + » cerclé. */
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 2 — les côtés où une carte **CRÉÉE** existe pour cette adresse.
   *
   * ⚠️ UN ENSEMBLE, ET NON PLUS UNE CARTE côté → vérifiée : depuis le point 1, une carte seulement pré-remplie
   * n'entre pas ici, et le drapeau de vérification n'a donc plus personne à renseigner.
   */
  cartesParAdresse: ReadonlyMap<string, ReadonlySet<string>>;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — la fiche d'annuaire d'un client, pour « adresse à corriger ». */
  fichesClientes: ReadonlyMap<string, { sorte: 'proprietaire' | 'locataire'; id: number }>;
  onFicheClient?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  survol: CleGroupeParties | null;
  glisse: { adresse: string; depuis: CleGroupeParties } | null;
  menu: string | null;
  onBasculerRepli: (cle: CleGroupeParties) => void;
  onBasculerPartie: (adresse: string) => void;
  onBasculerGroupe: (adresses: readonly string[]) => void;
  onCreer: (adresse: string, categorie?: CleGroupeParties) => void;
  onMenu: (adresse: string | null) => void;
  onGlisse: (g: { adresse: string; depuis: CleGroupeParties } | null) => void;
  onSurvol: (cle: CleGroupeParties | null) => void;
  onDeplacer: (adresse: string, vers: CleGroupeParties, nom: string, titre: string) => Promise<void>;
  /** Régler la période du tableau de bord sur le bail d'un locataire (la date, dans sa capsule). */
  onPeriode: (p: PeriodePartie) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — UN TITRE DE RECHANGE POUR L'EN-TÊTE ═══════════════════════════════════════
   *
   * Arno : « L'en-tête de l'encart porte DEUX boutons côte à côte, sur la même ligne, à la place du titre
   * actuel "▼ Locataire 2". »
   *
   * 🔴 UN EMPLACEMENT, ET NON LE CONTENU : ce composant rend quatre groupes aux gestes identiques, et seul
   * l'encart Locataire a deux boutons. Lui faire connaître les cartes de locataire aurait mis une règle de
   * locataire dans le gabarit commun — et les trois autres groupes auraient porté un code qui ne les regarde pas.
   *
   * ⚠️ ABSENT ⇒ LE TITRE D'AVANT CE LOT, AU PIXEL PRÈS : « ▶ Propriétaire 4 », « ▶ Tiers indépendant 0 ». Les
   * trois autres groupes et les deux bandes ne bougent donc pas.
   *
   * ⚠️ LE TRIANGLE DE REPLI N'EN FAIT PAS PARTIE : il reste rendu par ce composant, avant le titre de rechange.
   * Le déléguer à l'appelant aurait demandé à chaque titre de rechange de savoir replier son propre encart.
   */
  titre?: ReactNode;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — CE QUI S'AFFICHE **À LA PLACE** DES CAPSULES ══════════════════════════════
   *
   * Arno : « Dans la ZONE D'AFFICHAGE DES CAPSULES (à leur place), la liste des cartes d'anciens locataires
   * apparaît. »
   *
   * 🔴 « À LEUR PLACE », ET NON EN PLUS : c'est le mot d'Arno, et c'est ce qui garde l'encart à sa taille. Posée
   * EN DESSOUS, la liste aurait allongé l'encart Locataire et désaligné sa jumelle de gauche — exactement le
   * « bloc de guingois » que la grille des deux encarts existe pour éviter.
   *
   * ⚠️ ELLE REMPLACE AUSSI LA PHRASE DE L'ENCART VIDE : sur un logement vacant, « Aucun locataire connu » n'a
   * rien à faire au-dessus de la liste des anciens — c'est précisément là qu'on vient en choisir un.
   *
   * ⚠️ MAIS PAS LA ZONE DE DÉPÔT : les quatre gestes du glisser sont posés sur la `section` entière, pas sur la
   * liste. On peut donc encore déposer une capsule sur un encart dont la liste des anciens est ouverte.
   */
  zone?: ReactNode;
  /**
   * ══ 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — UN TON DE RECHANGE, QUAND L'ENCART CHANGE DE SUJET ════════════════
   *
   * Arno : « Onglet “Anciens locataires” affiché → liseré VIOLET […], ainsi que la case “tout le groupe” et les
   * cases cochées de cet onglet dans la teinte violette. »
   *
   * 🔴 LE GROUPE NE CHANGE PAS, SON SUJET CHANGE. L'encart reste le groupe « Locataire » — l'ancien locataire y
   * vit depuis le lot ANCIENS-LOCATAIRES-VIOLET, et Arno n'a pas demandé un cinquième groupe. Mais ce qu'il
   * MONTRE n'est plus le même, et la couleur doit le dire. Le ton ne se décide donc pas ici : il est passé par
   * l'appelant, qui est le seul à savoir quel onglet est affiché.
   *
   * ⚠️ ABSENT ⇒ `g.ton`, le ton du groupe, au caractère près : les trois autres encarts et les deux bandes ne
   * changent pas d'une ligne.
   */
  ton?: TonGroupe;
}

/**
 * ══ 🔴🔴 UN GROUPE, ET C'EST UNE ZONE DE DÉPÔT ══════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Retour visuel : la zone de dépôt survolée se surligne dans sa couleur. » Et
 * pour les bandes : « qui reste une zone de dépôt même repliée (elle s'ouvre au survol pendant un glisser) ».
 *
 * 🔴 `onDragOver` APPELLE `preventDefault()`, ET SANS CELA RIEN NE FONCTIONNE. C'est la règle du navigateur :
 * une zone qui ne « prévient pas le défaut » pendant le survol REFUSE le dépôt, silencieusement — le curseur
 * affiche l'interdit et `onDrop` ne part jamais. C'est le premier piège du glisser-déposer HTML, et il ne
 * produit aucune erreur : juste un geste qui n'aboutit pas.
 *
 * 🔴 UNE BANDE REPLIÉE S'OUVRE AU SURVOL, et c'est la demande d'Arno : sans cela, déposer dans « Tiers
 * indépendant » aurait demandé de la déplier AVANT de commencer le glisser — c'est-à-dire de savoir où l'on va
 * avant de partir. L'ouverture est COMMANDÉE PAR LE SURVOL, pas mémorisée : la bande se referme quand on sort.
 *
 * ⚠️ ON NE SE DÉPOSE PAS SUR SON PROPRE GROUPE : `survolable` l'écarte. Autoriser le dépôt sur place aurait
 * écrit un rangement manuel identique à celui qui existait, donc gelé une proposition sans que personne ne
 * l'ait voulu.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LA BANDE « NOTRE AGENCE » ══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Nouveau groupe “Notre agence” (gris neutre, ligne dépliable sous
 * “Non affectés”) : nos adresses, avec compteurs, COCHÉES PAR DÉFAUT, décochables (“tout le groupe” compris).
 * Agence décochée → les mails écrits par nous sont retirés du listing. Le cochage par défaut de l'agence ne
 * compte PAS comme “une partie cochée” pour la règle ci-dessus. **Pas de “+”, pas de glisser-déposer pour
 * l'agence.** »
 *
 * ═══ 🔴 POURQUOI UN COMPOSANT À PART, ET NON UN `GroupeDeParties` DE PLUS ════════════════════════════════════════
 *
 * C'est la question qui compte, et la réponse est dans la dernière phrase d'Arno. `GroupeDeParties` porte le
 * glisser-déposer (quatre gestes, un surlignage de cible, une zone de dépôt même repliée), le « + » de création de
 * carte, le menu « déplacer vers… », les catégories, les périodes de bail et les fiches clientes. L'agence n'a
 * AUCUN de ces gestes : on ne la range pas, on ne lui fait pas de carte de contact, on ne la déplace pas — elle
 * n'est pas une partie du bien, elle est celle qui tient le dossier.
 *
 * Lui faire traverser `GroupeDeParties` aurait demandé une dizaine de `si c'est l'agence alors…`, c'est-à-dire
 * exactement par où les quatre vrais groupes auraient fini par changer de comportement. Ce qui est PARTAGÉ est le
 * gabarit : les mêmes classes (`hdb-groupe`, `hdb-groupe-tete`, `hdb-replier`, `hdb-capsule`, `hdb-case`), la même
 * géométrie, le même triangle, le même compteur. Ce qui se voit est identique ; ce qui se manipule ne l'est pas.
 *
 * ⚠️ LE TON EST `nous`, celui que le listing emploie DÉJÀ pour la barre verticale de nos propres mails
 * (`tonDeLExpediteur` rend `'nous'`). C'est le « gris neutre » d'Arno, et il est ainsi le même gris des deux
 * côtés : la case qu'on décoche et la barre des mails qui disparaissent portent la même couleur, sans qu'on ait à
 * l'apprendre.
 *
 * ⚠️ UNE CASE COCHÉE EST UNE ADRESSE **ABSENTE** DE `agenceEcartee` : on écrit l'envers de ce qu'on voit, et c'est
 * ce qui fait qu'une adresse de l'agence apparue depuis naît cochée (voir `basculerAgence`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function BandeAgence({ adresses, ecartees, ouvert, onBasculerRepli, onBasculer, onToutLeGroupe }: {
  adresses: readonly Interlocuteur[];
  /** Les adresses DÉCOCHÉES, en forme canonique. */
  ecartees: readonly string[];
  ouvert: boolean;
  onBasculerRepli: () => void;
  onBasculer: (adresse: string) => void;
  onToutLeGroupe: (adresses: readonly string[]) => void;
}) {
  /* 🔴 PAS DE LIGNE « Notre agence · 0 » : comme les quatre groupes, elle n'apparaît que si elle a de quoi dire.
     Contrairement aux deux ENCARTS, qui sont toujours là parce que leur absence est une information. */
  if (adresses.length === 0) return null;

  const toutes = adresses.map((i) => cleAdresse(i.adresse));
  const decochees = toutes.filter((a) => ecartees.includes(a)).length;
  /* ⚠️ `length > 0` AVANT la comparaison : le piège du lot 71 (un ensemble vide n'est jamais « tout coché »). */
  const toutCoche = toutes.length > 0 && decochees === 0;
  const partiel = decochees > 0 && decochees < toutes.length;

  return (
    <section className="hdb-groupe hdb-groupe--nous hdb-groupe--bande">
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={onBasculerRepli}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          {TITRE_GROUPE_AGENCE}
          <span className="gst-compte">{adresses.length}</span>
        </button>
        <label className="hdb-case hdb-case--groupe">
          <input type="checkbox" checked={toutCoche}
            ref={(el) => { if (el !== null) el.indeterminate = partiel; }}
            aria-label={`Tout le groupe ${TITRE_GROUPE_AGENCE}`}
            onChange={() => onToutLeGroupe(toutes)} />
          <span>tout le groupe</span>
        </label>
      </div>

      {/* 🔴 LA PHRASE DIT CE QUE LA CASE FAIT, et elle le dit AVANT qu'on la décoche : « décochez-les pour
          retirer du listing les mails que nous avons écrits ». Sans elle, décocher « Notre agence » se lirait
          « retirer les mails où nous sommes » — c'est-à-dire presque tous, et le listing se viderait sans
          qu'on comprenne. Le mot vient du module pur. */}
      {ouvert && <p className="gst-note hdb-note">{motGroupeAgence(adresses.length)}</p>}

      {ouvert && (
        <ul className="hdb-capsules">
          {adresses.map((i) => {
            const cle = cleAdresse(i.adresse);
            return (
              <li key={cle} className="hdb-capsule">
                <label className="hdb-case hdb-case--capsule">
                  <input type="checkbox" checked={!ecartees.includes(cle)}
                    onChange={() => onBasculer(i.adresse)} />
                  {/* ⚠️ LES MÊMES CLASSES QUE LA CAPSULE D'UNE PARTIE (`hdb-personne`, `hdb-personne-nom`,
                      `hdb-compteurs`) — et c'est une CORRECTION trouvée à l'écran : ma première version en
                      inventait trois (`hdb-capsule-mots`…) qui n'existent dans aucune feuille, et le nom se
                      collait à ses compteurs (« Service Gestiona écrit : 135 »). Le gabarit est partagé ; en
                      inventer un second, c'était n'en avoir aucun. */}
                  <span className="hdb-personne">
                    <span className="hdb-personne-nom">{libelleInterlocuteur(i)}</span>
                    <span className="hdb-compteurs">{motDeuxCompteurs(i)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GroupeDeParties(p: PropsGroupe) {
  const { g, forme, reglages, glisse, survol, motSiVide } = p;
  const adresses = g.interlocuteurs.map((i) => i.adresse);
  const cochees = adresses.filter((a) => reglages.parties.includes(a.trim().toLowerCase())).length;
  /* ⚠️ `length > 0` AVANT la comparaison : un groupe vide aurait été « tout coché » (piège du lot 71). */
  const toutCoche = adresses.length > 0 && cochees === adresses.length;
  const partiel = cochees > 0 && !toutCoche;

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 3 — LES DEUX ENCARTS SONT OUVERTS À L'ARRIVÉE ════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « ENCART LOCATAIRE OUVERT PAR DÉFAUT, comme l'encart Propriétaire (les deux
   * dépliés à l'arrivée sur la fiche). »
   *
   * 🔴 CE QUI LE REFERMAIT : `!replierLesCartes(g.nb)`, c'est-à-dire « replié au-delà de six ». Sur lot-290, le
   * groupe Locataire en compte SEPT — il arrivait donc fermé pendant que Propriétaire, à trois, était ouvert.
   * Deux encarts côte à côte, de même largeur, dont un seul montre son contenu : on croit que le bien n'a pas de
   * locataire.
   *
   * ⚠️ UN ENCART LONG NE DÉBORDE PAS POUR AUTANT : il a sa propre hauteur fixe et son défilement interne
   * (`.hdb-defile`, lot 3 point 1 — « il ne grandit jamais »). Le repli n'était donc pas ce qui protégeait la
   * page, et l'ouvrir ne lui fait rien risquer.
   *
   * ⚠️ UNE BANDE RESTE REPLIÉE PAR DÉFAUT (demande d'Arno au lot 5), et `replierLesCartes` garde son emploi
   * ailleurs — le repli des cartes de contact d'un carrousel, pour lequel il a été écrit.
   */
  const ouvertParDefaut = forme !== 'bande';
  const basculee = p.bascules.has(g.cle);
  const ouvertParChoix = basculee ? !ouvertParDefaut : ouvertParDefaut;
  /* 🔴 LE SURVOL PENDANT UN GLISSER OUVRE, SANS MÉMORISER : la bande se referme dès qu'on en sort. */
  const ouvert = ouvertParChoix || (glisse !== null && survol === g.cle);

  const survolable = glisse !== null && glisse.depuis !== g.cle;
  const surligne = survolable && survol === g.cle;

  return (
    <section
      className={`hdb-groupe hdb-groupe--${p.ton ?? g.ton} hdb-groupe--${forme}`
        + `${surligne ? ' hdb-groupe--cible' : ''}`}
      onDragOver={(e) => {
        if (!survolable) return;
        /* 🔴 SANS `preventDefault`, LE NAVIGATEUR REFUSE LE DÉPÔT — silencieusement. Voir l'encadré. */
        e.preventDefault();
        if (survol !== g.cle) p.onSurvol(g.cle);
      }}
      onDragLeave={(e) => {
        /* ⚠️ ON NE QUITTE QUE SI L'ON SORT VRAIMENT DU GROUPE : `dragleave` part aussi en passant d'un enfant à
           l'autre, et sans ce contrôle la bande clignotait à chaque capsule traversée. */
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (survol === g.cle) p.onSurvol(null);
      }}
      onDrop={(e) => {
        if (!survolable || glisse === null) return;
        e.preventDefault();
        const nom = e.dataTransfer.getData('text/plain') || glisse.adresse;
        void p.onDeplacer(glisse.adresse, g.cle, nom, g.titre);
      }}>
      <div className="hdb-groupe-tete">
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — LE TRIANGLE DE REPLI SURVIT AU TITRE QU'IL PORTAIT ═══════════════
            Quand l'appelant fournit son propre titre (l'encart Locataire et ses deux boutons), ce bouton-ci se
            réduit à son picto. Le faire disparaître avec le titre aurait RETIRÉ le repli de l'encart — une
            fonctionnalité qu'Arno n'a pas demandé de retirer, et que le dépôt interdit de retirer sans son
            accord. Il garde donc un libellé accessible, puisqu'il n'a plus de texte à lire. */}
        <div className="hdb-tete-titres">
        <button type="button"
          className={`hdb-replier${p.titre === undefined ? '' : ' hdb-replier--picto'}`}
          aria-expanded={ouvert}
          aria-label={p.titre === undefined ? undefined : `Replier ou déplier ${g.titre}`}
          onClick={() => p.onBasculerRepli(g.cle)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          {p.titre === undefined && (
            <>
              {g.titre}
              {/* LE COMPTE EST LISIBLE SANS DÉPLIER — c'est tout l'intérêt du repli, et le titre de bande d'Arno
                  (« Tiers indépendant · 4 ▸ ») le dit justement comme cela. */}
              <span className="gst-compte">{g.nb}</span>
            </>
          )}
        </button>
        {p.titre}
        </div>
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LA CASE EST LÀ MÊME À ZÉRO, MAIS ELLE NE MENT PAS ═══════
            Arno décrit l'anatomie d'une ligne : « chacune avec son compteur et sa case “tout le groupe” ». Une
            ligne qui perdrait sa case à zéro changerait de forme selon le bien, et la case se déplacerait d'un
            groupe à l'autre sous le curseur.

            🔴 DÉSACTIVÉE, ET NON MASQUÉE, QUAND LE GROUPE EST VIDE. Une case cochable qui ne coche rien est un
            mensonge ; une case grisée dit « il n'y a personne à cocher », ce qui est le fait. Et elle ne peut
            pas afficher « tout coché » sur un ensemble vide — le piège du lot 71, qu'une case active aurait
            rouvert ici (`adresses.length > 0` le ferme déjà côté calcul, la désactivation le ferme à l'écran). */}
        <label className={`hdb-case hdb-case--groupe${g.nb === 0 ? ' hdb-case--muette' : ''}`}>
          <input type="checkbox" checked={toutCoche} disabled={g.nb === 0}
            ref={(el) => { if (el !== null) el.indeterminate = partiel; }}
            aria-label={`Tout le groupe ${g.titre}`}
            onChange={() => p.onBasculerGroupe(adresses)} />
          <span>tout le groupe</span>
        </label>
      </div>

      {/* ══ 🔴🔴 UN GROUPE VIDE PARLE, ET IL DIT DEUX CHOSES DIFFÉRENTES ════════════════════════════════════
          ① CE QU'IL EN EST (lot 5, point 1) : « Aucun locataire connu », « Aucun échange avec le propriétaire
             sur cette période ». C'est l'état du dossier, et il se lit en permanence sur un encart vide — c'est
             le « texte discret » qu'Arno demande à la place d'un encart disparu.
          ② CE QU'ON PEUT Y FAIRE, et seulement PENDANT un glisser : « Déposez ici pour ranger dans X ». Hors
             glisser, cette phrase serait une consigne pour un geste que personne n'a commencé ; pendant le
             glisser, elle est indispensable — sans elle on lâche la capsule sur un rectangle muet. */}
      {/* 🔴🔴 LOT HISTORIQUE-BIEN-15 — LA ZONE DE RECHANGE PREND TOUTE LA PLACE, phrase du vide comprise. */}
      {ouvert && p.zone !== undefined ? p.zone : (
        <>
          {g.nb === 0 && motSiVide !== undefined && (
            <p className="hdb-vide-mot">{motSiVide}</p>
          )}
          {ouvert && g.nb === 0 && (glisse !== null || motSiVide === undefined) && (
            <p className="hdb-vide-depot">Déposez ici pour ranger dans « {g.titre} ».</p>
          )}

          {ouvert && g.nb > 0 && (
            <ListeDefilante etiquette={g.titre}>
              {g.interlocuteurs.map((i) => (
                <CapsulePartie key={i.adresse} i={i} {...p} />
              ))}
            </ListeDefilante>
          )}
        </>
      )}
    </section>
  );
}

/**
 * ══ 🔴🔴 UNE CAPSULE DE PARTIE ══════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Chaque partie devient une CAPSULE (pastille arrondie : case à cocher, nom ou
 * adresse, compteurs a écrit / en copie, et la date pour les locataires). »
 *
 * 🔴 LA CASE À COCHER RESTE UNE VRAIE CASE, dans un vrai `label`. La capsule est une pastille, pas un bouton :
 * en faire un bouton aurait obligé à recoder la sélection au clavier, et aurait cassé le geste le plus fréquent
 * du bloc — cocher quelqu'un.
 *
 * 🔴 LE GLISSER EST POSÉ SUR LE `li`, PAS SUR LE `label`. Un `draggable` sur le label capture le clic qui coche
 * la case dans certains navigateurs ; sur l'enveloppe, le clic reste au label et le glisser part de la pastille.
 *
 * 🔴 UN CLIENT N'EST PAS DÉPLAÇABLE, ET L'ÉCRAN DIT POURQUOI : curseur « interdit » et info-bulle « Client du
 * bien — non déplaçable » (mot d'Arno). Ce n'est pas une précaution d'ergonomie : la fusion remettrait le client
 * dans son groupe au rendu suivant, puisque la fiche l'emporte sur tout rangement. L'interdiction est la vérité
 * de l'arbitrage, et le dire évite de croire à une panne.
 *
 * ⚠️ LE MENU « DÉPLACER VERS… » EST LE SECOND CHEMIN, et il est indispensable : le glisser-déposer n'existe ni
 * au clavier ni sous un doigt. Il passe par la MÊME porte d'écriture.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function CapsulePartie({ i, g, ...p }: PropsGroupe & { i: Interlocuteur }) {
  const cle = i.adresse.trim().toLowerCase();
  const periode = p.periodes.get(cle) ?? null;
  const nomLisible = libelleInterlocuteur(i);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA SORTE DE LA CAPSULE DÉCIDE DE TOUT CE QUI SUIT.
   *
   * Client, agence, tiers indépendant ou contact : une seule question, posée une fois, au module pur. Le glisser,
   * l'info-bulle et la pastille de droite en découlent — trois conditions dispersées dans ce rendu faisaient le
   * travail avant, et c'est ainsi que le « + » a pu manquer à sa troisième demande.
   */
  const sorte = sorteDeCapsule(i.adresse, g.cle, p.categoriesFiche, i.interne);
  const deplacable = partieDeplacable(i.adresse, p.categoriesFiche, i.interne);
  const menuOuvert = p.menu === cle;
  /**
   * ══ 🔴🔴 LE « + » CERCLÉ : UN CONTACT, D'UN CÔTÉ CLIENT, QUI N'A PAS ENCORE SA CARTE ═════════════════════════
   *
   * Arno : « En face de chaque capsule de contact Propriétaire ou Locataire qui N'A PAS encore de carte de
   * contact […] Pas de “+” pour les Tiers indépendants, l'agence ni les clients. Le “+” disparaît dès que la
   * carte existe. »
   *
   * 🔴 LES TROIS CONDITIONS SONT LES TROIS PHRASES D'ARNO, dans l'ordre :
   *   · `coteDuGroupe !== null` → ni Tiers indépendant, ni Non affectés (c'est `coteDeLaCategorie` qui le dit) ;
   *   · `deplacable` → ni un client, ni l'agence — exactement la même règle que le glisser, et c'est voulu :
   *     deux définitions de « client » auraient fini par diverger, et le « + » serait apparu sur un propriétaire ;
   *   · pas de carte de ce côté → il disparaît dès qu'elle existe.
   */
  /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 0 — LA MÊME CLÉ DE RAPPROCHEMENT QUE LA CARTE DES CARTES (voir son
     encadré) : `mailto:a@b` et `a@b` sont la même personne, et la pastille doit le savoir. */
  const pastille = pastilleDeCapsule(sorte, g.cle, p.cartesParAdresse.get(cleAdresse(i.adresse)) ?? new Set());
  const motsPastille = motPastille(pastille, nomLisible);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UN CLIENT DONT L'ADRESSE NE PEUT RIEN FILTRER.
   *
   * ⚠️ SEULEMENT POUR UN CLIENT OU L'AGENCE, et non pour un contact : un contact en `.invalid` n'arrive pas dans
   * ces listes (il n'écrit pas), et une de nos adresses n'y est de toute façon listée que si la fiche la porte
   * comme cliente — c'est tout l'objet de la décision d'Arno.
   */
  const aCorriger = (sorte === 'client' || sorte === 'agence') && adresseACorriger(i.adresse, i.interne);
  const motifCorriger = aCorriger ? motifNonSelectionnable(i.adresse, i.interne) : null;
  const fiche = p.fichesClientes.get(cle);

  return (
    <li className={`hdb-capsule hdb-capsule--${g.ton}${deplacable ? '' : ' hdb-capsule--fixe'}`}
      data-capsule=""
      draggable={deplacable}
      title={deplacable ? undefined : MOTIF_NON_DEPLACABLE}
      onDragStart={(e) => {
        if (!deplacable) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', nomLisible);
        e.dataTransfer.effectAllowed = 'move';
        p.onGlisse({ adresse: i.adresse, depuis: g.cle });
      }}
      onDragEnd={() => { p.onGlisse(null); p.onSurvol(null); }}>
      <label className={`hdb-case hdb-case--capsule${aCorriger ? ' hdb-case--muette' : ''}`}
        title={motifCorriger ?? undefined}>
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UNE ADRESSE IMPOSSIBLE NE COCHE RIEN ═══════════════════════
            DÉCISION D'ARNO : « Capsule non sélectionnable pour les mails, avec la mention discrète “adresse à
            corriger dans l'annuaire” (lien vers sa fiche). »

            🔴 DÉSACTIVÉE, ET LE MOTIF EST DIT EN TOUTES LETTRES dans l'info-bulle : une case grise sans
            explication se lit comme une panne. Une adresse interne cocherait « nous », c'est-à-dire presque tous
            les mails du bien ; une adresse en `.invalid` ne désigne personne, par construction (RFC 2606). */}
        <input type="checkbox" checked={!aCorriger && p.reglages.parties.includes(cle)}
          disabled={aCorriger}
          onChange={() => p.onBasculerPartie(i.adresse)} />
        <span className="hdb-personne">
          <span className="hdb-personne-nom">{nomLisible}</span>
          <span className="hdb-compteurs">
            {motDeuxCompteurs(i)}
            {/* ══ 🔴🔴 LA DATE D'UN LOCATAIRE, EN PETIT TEXTE SUR LA LIGNE DES COMPTEURS ════════════════════
                DEMANDE D'ARNO (05/10/2026) : « La date “depuis le 02/09/2022” des locataires passe en petit
                texte sur la ligne des compteurs, pas en encadré. »

                🔴 ELLE RESTE CLIQUABLE — elle règle la période sur ce bail, geste acquis au lot 2 — mais elle
                n'a plus de cadre : un encadré dans une capsule faisait deux objets là où il n'y a qu'une
                information, et c'est ce qui donnait aux capsules de locataires une hauteur à part. */}
            {periode !== null && (
              <>
                {' · '}
                <button type="button" className="hdb-periode-mot"
                  title="Régler la période sur ce bail"
                  onClick={(e) => { e.preventDefault(); p.onPeriode(periode); }}>{periode.mot}</button>
              </>
            )}
            {/* ══ 🔴🔴 LA MENTION D'ARNO, SUR LA LIGNE DES COMPTEURS ET EN PETIT ═════════════════════════════
                « la mention discrète “adresse à corriger dans l'annuaire” (lien vers sa fiche) ». Elle est un
                LIEN quand on sait où mener, et un simple mot sinon : dire le problème vaut mieux que se taire
                parce qu'on n'a pas de porte à offrir. */}
            {aCorriger && (
              <>
                {' · '}
                {fiche !== undefined && p.onFicheClient !== undefined ? (
                  <button type="button" className="hdb-a-corriger"
                    title={`${motifCorriger ?? ''} Ouvrir sa fiche d’annuaire.`}
                    onClick={(e) => { e.preventDefault(); p.onFicheClient?.(fiche.sorte, fiche.id); }}>
                    {MOT_ADRESSE_A_CORRIGER}
                  </button>
                ) : (
                  <span className="hdb-a-corriger hdb-a-corriger--muet">{MOT_ADRESSE_A_CORRIGER}</span>
                )}
              </>
            )}
          </span>
        </span>
      </label>

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA PASTILLE DE DROITE, À TROIS ÉTATS ═════════════════════════
          RÈGLE D'ARNO : « Chaque capsule CONTACT, qu'elle soit côté Propriétaire, côté Locataire ou dans Non
          affectés, porte À DROITE, à côté du “…”, un “+” rouge dans un cercle rouge, toujours visible (pas
          seulement au survol). […] Quand une carte existe déjà pour ce contact : le “+” est remplacé par une
          petite icône “fiche” (même cercle, gris) qui ouvre la carte. Si la carte est encore “à vérifier” (trame
          orange), l'icône est orange. »

          🔴 LE BUT, QU'ARNO DEMANDE DE RAPPELER ICI : ce contact, rattaché à une partie du bien, fait que ses
          PROCHAINS mails rejoignent ce bien tout seuls (cas (f) de `proposerBiens`, branché au point 1 de ce
          lot). Le « + » n'est pas une commodité d'annuaire : c'est la porte de l'automatisation.

          ⚠️ LA CATÉGORIE EST PRÉ-REMPLIE PAR L'ENCART D'OÙ L'ON CLIQUE, et laissée VIDE depuis « Non affectés » —
          où le choix devient donc obligatoire, ce qui est la demande d'Arno à la lettre. `ouvrirCreation` tient
          déjà cette nuance : `a_repartir` n'est pas une déduction, c'est le constat qu'on n'a pas tranché. */}
      {motsPastille !== null && (
        <button type="button"
          className={`hdb-plus hdb-plus--cercle hdb-plus--${pastille}`}
          aria-label={motsPastille.aria}
          title={`${motsPastille.titre} — ${BUT_DU_PLUS}`}
          onClick={() => p.onCreer(i.adresse, g.cle)}>
          {pastille === 'plus' ? '+' : '▤'}
        </button>
      )}

      {/* ══ LE MENU « DÉPLACER VERS… » — LE CHEMIN CLAVIER ══════════════════════════════════════════════════ */}
      {deplacable && (
        <MenuDeplacer cle={cle} nom={nomLisible} depuis={g.cle} ouvert={menuOuvert}
          onOuvrir={() => p.onMenu(menuOuvert ? null : cle)} onFermer={() => p.onMenu(null)}
          onChoisir={(vers, titre) => { void p.onDeplacer(i.adresse, vers, nomLisible, titre); }} />
      )}
    </li>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 2 — LE MENU « DÉPLACER VERS… », ENTIÈREMENT VISIBLE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Le menu ouvert par “…” est entièrement visible : il s'ouvre vers le haut ou
 * vers la gauche s'il manque de place, ne déborde jamais de l'encart, passe au-dessus du défilement de l'encart,
 * et se ferme par Échap ou par un clic à côté. »
 *
 * 🔴🔴 IL EST EN POSITION **FIXE**, ET C'EST LA SEULE FAÇON DE TENIR LA PROMESSE. L'encart a `overflow-y: auto`
 * (hauteur fixe, lot 3) : tout élément positionné À L'INTÉRIEUR y est ROGNÉ, et aucun `z-index` n'y change
 * quoi que ce soit — un conteneur qui défile découpe ses enfants, c'est sa définition. Le menu sort donc du flux
 * et se place par rapport à la FENÊTRE, aux coordonnées du bouton. C'est aussi ce qui le fait « passer au-dessus
 * du défilement de l'encart », littéralement.
 *
 * 🔴 IL SE REPLIE VERS LE HAUT OU VERS LA GAUCHE, et le calcul est fait à l'OUVERTURE, sur des mesures réelles
 * (`getBoundingClientRect`) — jamais sur une supposition de place. Un menu qui déborde en bas de l'écran est
 * inatteignable au doigt ; un menu qui déborde à droite coupe les libellés.
 *
 * ⚠️ ÉCHAP ET LE CLIC À CÔTÉ SONT DEUX SORTIES, et il faut les deux : Échap pour le clavier, le clic pour la
 * souris. Sans la seconde, un menu ouvert par erreur se referme en choisissant quelque chose — c'est-à-dire en
 * faisant un geste qu'on ne voulait pas.
 *
 * ⚠️ ON ÉCOUTE `mousedown` ET NON `click` POUR LE CLIC À CÔTÉ : avec `click`, le relâchement d'un clic commencé
 * AILLEURS ferme le menu avant que le bouton d'un item ne reçoive le sien — et le choix se perd.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function MenuDeplacer({ cle, nom, depuis, ouvert, onOuvrir, onFermer, onChoisir }: {
  cle: string;
  nom: string;
  depuis: CleGroupeParties;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
  onChoisir: (vers: CleGroupeParties, titre: string) => void;
}) {
  const bouton = useRef<HTMLButtonElement | null>(null);
  const panneau = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ haut: number; gauche: number } | null>(null);

  /**
   * ⚠️ LA MESURE SE FAIT APRÈS LE PREMIER RENDU DU PANNEAU, parce qu'il faut sa taille RÉELLE pour savoir s'il
   * déborde. Il est donc rendu une fois hors de l'écran (`place === null` ⇒ `visibility: hidden`), mesuré, puis
   * posé. Sans cela on le verrait sauter de sa position naïve à la bonne.
   */
  useEffect(() => {
    if (!ouvert) { setPlace(null); return; }
    const b = bouton.current;
    const pan = panneau.current;
    if (b === null || pan === null) return;
    const rb = b.getBoundingClientRect();
    const rp = pan.getBoundingClientRect();
    const marge = 8;
    const placeEnBas = window.innerHeight - rb.bottom;
    /* VERS LE HAUT s'il manque de place en bas ET qu'il y en a davantage au-dessus. */
    const haut = placeEnBas < rp.height + marge && rb.top > placeEnBas
      ? Math.max(marge, rb.top - rp.height - 2)
      : rb.bottom + 2;
    /* VERS LA GAUCHE s'il déborderait à droite. On l'aligne alors sur le bord droit du bouton. */
    const gaucheNaive = rb.left;
    const gauche = gaucheNaive + rp.width + marge > window.innerWidth
      ? Math.max(marge, rb.right - rp.width)
      : gaucheNaive;
    setPlace({ haut, gauche });
  }, [ouvert]);

  /** Échap et le clic à côté : les deux sorties. */
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    const surClic = (e: MouseEvent): void => {
      const c = e.target as Node | null;
      if (bouton.current?.contains(c) === true || panneau.current?.contains(c) === true) return;
      onFermer();
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('mousedown', surClic);
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('mousedown', surClic);
    };
  }, [ouvert, onFermer]);

  return (
    <>
      <button ref={bouton} type="button" className="hdb-menu-bouton" aria-expanded={ouvert}
        aria-label={`Déplacer ${nom} vers une autre catégorie`} title="Déplacer vers…"
        onClick={onOuvrir}>⋯</button>
      {ouvert && (
        <div ref={panneau} className="hdb-menu" role="group" aria-label={`Déplacer ${nom} vers…`}
          data-pour={cle}
          style={place === null
            ? { visibility: 'hidden', top: 0, left: 0 }
            : { top: `${place.haut}px`, left: `${place.gauche}px` }}>
          {ciblesDeplacement(depuis).map((c) => (
            <button key={c.cle} type="button" className="hdb-menu-item"
              onClick={() => onChoisir(c.cle, c.titre)}>{c.titre}</button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 1 — L'ENCART NE GRANDIT JAMAIS : IL DÉFILE ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Chaque encart garde la hauteur actuelle (celle de la capture
 * d'Arno, 3 lignes visibles). Il ne grandit jamais. S'il y a plus de contacts, son listing DÉFILE à l'intérieur de
 * l'encart. Quand des contacts sont cachés sous le bas de l'encart, une petite puce flottante en bas, centrée,
 * “↓ 3 autres”, invite à défiler (un clic fait défiler) ; elle disparaît quand on est en bas. Même chose vers le
 * haut (“↑”) si on a défilé. »
 *
 * 🔴 POURQUOI LA HAUTEUR FIXE CHANGE TOUT. Le bien 155 porte 56 adresses côté propriétaire. Déplié, l'encart
 * poussait le fil — ce qu'on vient lire — à plus de deux écrans du tableau de bord. Le repli derrière un compteur
 * (lot 1) répondait au cas extrême ; la hauteur fixe répond au cas ORDINAIRE, celui des huit ou dix contacts.
 *
 * 🔴 LES DEUX PUCES SONT DES BOUTONS, PAS DES DÉCORS. « un clic fait défiler » : chacune avance d'un plein
 * encart. Une flèche purement indicative aurait obligé à viser une barre de défilement de quelques pixels — et
 * il n'y en a aucune sur un téléphone.
 *
 * ⚠️ LE COMPTE EST CALCULÉ PAR LE MODULE PUR (`compteCacheesEnBas`), et il ne compte QUE les capsules
 * ENTIÈREMENT cachées. Une capsule dont on voit trois pixels n'est pas lisible : l'annoncer visible aurait fait
 * dire « ↓ 2 autres » là où il en reste trois, et une puce dont le compte est faux cesse d'être crue.
 *
 * ⚠️ ON MESURE À TROIS MOMENTS, ET IL FAUT LES TROIS : au montage, à chaque défilement, et à chaque changement
 * de contenu (cocher une case réécrit les lignes). Mesurer au seul montage aurait figé « ↓ 3 autres » sur un
 * encart devenu court — le défaut classique de ce genre de puce.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function ListeDefilante({ children, etiquette }: { children: ReactNode; etiquette: string }) {
  const boite = useRef<HTMLDivElement | null>(null);
  const [enBas, setEnBas] = useState(0);
  const [enHaut, setEnHaut] = useState(0);
  /**
   * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 1 — LA HAUTEUR EST MESURÉE, PLUS DEVINÉE ═══════════════════
   *
   * CONSTAT D'ARNO (bien 315) : l'encart montre ses trois contacts, et affiche pourtant « ↓ 1 autre ».
   *
   * 🔴 LA CAUSE : le plafond était ÉCRIT (`--hdb-liste-h`), calculé pour « trois capsules de 44 px ». Une capsule
   * dont le nom passe à la ligne dépasse ces 44 px : la troisième était rognée de quelques pixels, le compteur la
   * voyait « pas entièrement visible » — ce qui était EXACT — et annonçait un contact de plus.
   *
   * 🔴 ON NE RELÂCHE DONC PAS LE COMPTEUR, ce qui l'aurait rendu faux pour de bon : on mesure la hauteur qu'il
   * faut pour que les `CAPSULES_VISIBLES` premières tiennent ENTIÈREMENT, et la boîte s'arrête là. Au-delà, le
   * défilement et la puce fonctionnent comme avant, avec le bon nombre — il n'y a plus rien qui dépasse quand
   * tout tient.
   *
   * ⚠️ `null` TANT QU'ON N'A PAS MESURÉ : la feuille garde la main (`--hdb-liste-h`), et l'encart ne saute pas
   * d'une hauteur à l'autre au premier rendu.
   */
  const [hauteur, setHauteur] = useState<number | null>(null);

  const mesurer = useCallback((): void => {
    const el = boite.current;
    if (el === null) return;
    const positions = [...el.querySelectorAll('[data-capsule]')].map((x) => ({
      haut: (x as HTMLElement).offsetTop, hauteur: (x as HTMLElement).offsetHeight,
    }));
    setHauteur(hauteurDesPremiers(positions, CAPSULES_VISIBLES));
    setEnBas(compteCacheesEnBas(positions, el.scrollTop, el.clientHeight));
    setEnHaut(compteCacheesEnHaut(positions, el.scrollTop));
  }, []);

  /* ⚠️ `children` EST DANS LES DÉPENDANCES EXPRÈS : cocher une case recrée les lignes, et le compte doit suivre. */
  useEffect(() => { mesurer(); }, [mesurer, children]);

  /**
   * ══ 🔴 LE CLIC DÉFILE D'UN PLEIN ENCART, ET IL RÈGLE `scrollTop` DIRECTEMENT ═════════════════════════════════
   *
   * ⚠️ PAS `scrollBy`, ET C'EST UNE CORRECTION MESURÉE DANS CHROME. Avec `scrollBy({ top })`, la position était
   * bien atteinte mais la puce gardait son ancien nombre : l'événement `scroll` du navigateur arrive APRÈS les
   * étapes de rendu, et une mesure programmée en `requestAnimationFrame` le précédait — elle lisait la position
   * d'avant. L'affectation de `scrollTop` est, elle, prise en compte immédiatement pour la mise en page : on peut
   * donc mesurer dans le même souffle, et la puce dit juste dès le premier clic. (Le défilement à la molette
   * passe, lui, par `onScroll` — vérifié dans Chrome : « ↓ 43 autres · ↑ remonter ».)
   */
  const pousser = (sens: 1 | -1): void => {
    const el = boite.current;
    if (el === null) return;
    el.scrollTop += sens * el.clientHeight;
    mesurer();
  };

  const motBas = motCacheesEnBas(enBas);
  const motHaut = motCacheesEnHaut(enHaut);

  return (
    <div className="hdb-boite">
      <div className="hdb-defile" ref={boite} onScroll={mesurer}
        style={hauteur === null ? undefined : { maxHeight: `${hauteur}px` }}>
        <ul className="hdb-personnes">{children}</ul>
      </div>
      {motHaut !== null && (
        <button type="button" className="hdb-puce hdb-puce--haut"
          aria-label={`Remonter dans le groupe ${etiquette}`} onClick={() => pousser(-1)}>{motHaut}</button>
      )}
      {motBas !== null && (
        <button type="button" className="hdb-puce hdb-puce--bas"
          aria-label={`${enBas} autre${enBas > 1 ? 's' : ''} dans le groupe ${etiquette} — défiler`}
          onClick={() => pousser(1)}>{motBas}</button>
      )}
    </div>
  );
}

/**
 * ══ LE FIL DE MAILS — `LigneVie`, UNE PAR MAIL ════════════════════════════════════════════════════════════════════
 *
 * 🔴 ÉCRIT UNE FOIS, APPELÉ DEUX FOIS (fil plat, et fil regroupé par conversation). Deux montages recopiés
 * auraient divergé à la première retouche, et c'est celui qu'on regarde le moins qui aurait gardé l'écart.
 *
 * ⚠️ L'ANCRE DE « ALLER AU MESSAGE » EST UN `li` PARENT, pas un attribut posé sur `LigneVie` — ce composant est
 * importé tel quel et n'a pas de prop `id` (et lui en ajouter une aurait touché « Vie du bien », ce qui est
 * interdit). Un `ol > li > ol > li` est du HTML valide ; l'enveloppe ne porte aucun style propre.
 */
function FilDeMails({
  lignes, maintenant, deplie, categories, surligne, mots, onBasculer, onOuvrirFil, sortieDuSuivi,
  modifierRattachement,
  onVisualiser, destinataires, piecesCitables, repondre, composeurDe,
}: {
  lignes: readonly LigneHistorique[];
  maintenant: Date;
  deplie: ReadonlySet<number>;
  /** Pour la BARRE DE COULEUR : la catégorie retenue de chaque adresse, clé en minuscules. */
  categories: ReadonlyMap<string, CategoriePartie>;
  /** Le mail d'où l'on est parti, surligné brièvement au retour d'une conversation. */
  surligne: number | null;
  /** Les mots cherchés, surlignés dans l'aperçu de chaque ligne (point 5). */
  mots: readonly string[];
  onBasculer: (messageId: number) => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « Sortir du suivi », pour un mail DÉPLIÉ et SEULEMENT s'il entre ici
   * par un rattachement. Rend `undefined` pour les autres : voir `sortieOfferte` dans le bloc principal.
   */
  sortieDuSuivi: (l: LigneHistorique) => { aide: string; onSortir: () => void } | undefined;
  /** 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — le second bouton de l'en-tête, par ligne. */
  modifierRattachement: (l: LigneHistorique) => { aide: string; onModifier: () => void } | undefined;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — l'œil d'une miniature du mail déplié ouvre la visionneuse. */
  onVisualiser: (pieceId: number) => void;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties destinataires, par message. */
  destinataires: ReadonlyMap<number, FamilleVue[]>;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — les pièces de chaque conversation, par fil. */
  piecesCitables: ReadonlyMap<number, PieceCitable[]>;
  /**
   * 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — répondre à CE mail. Le corps entier et son HTML viennent de la
   * LIGNE (elle seule les charge, au dépliage) ; le bloc, lui, sait à quel bien il appartient.
   *
   * ⚠️ ABSENTE ⇒ AUCUN BOUTON. L'écran qui ne sait pas écrire (droit manquant, schéma incomplet, lecture du
   * contexte en échec) rend exactement la liste d'avant ce lot.
   */
  repondre?: (l: LigneHistorique, voie: VoieRedaction, corps: string | null, html: string | null) => void;
  /** L'éditeur à poser sous CE mail, ou `null`. Rendu par le bloc, qui porte le brouillon. */
  composeurDe?: (l: LigneHistorique) => ReactNode;
}) {
  return (
    <ol className="vdb-liste hdb-liste">
      {lignes.map((l) => (
        /**
         * ══ 🔴🔴 LA BARRE DE COULEUR EST PORTÉE PAR L'ENVELOPPE, PAS PAR `LigneVie` (lot HISTORIQUE-BIEN-2) ═══
         *
         * Arno : « Une petite BARRE VERTICALE de couleur, à DROITE de chaque mail, selon la catégorie de
         * l'expéditeur ».
         *
         * 🔴 AUCUNE PROP N'EST AJOUTÉE À `LigneVie`, ET C'EST VOULU. Ce composant est importé TEL QUEL et sert
         * aussi la fiche d'un locataire ; lui ajouter une couleur l'aurait modifié pour les deux écrans, et la
         * consigne est de le réutiliser, pas de le retoucher. Le `li` qui portait déjà l'ancre de « Aller au
         * message » porte donc la barre, en `border-right` — zéro élément de plus dans le document.
         */
        <li key={l.messageId} id={`hdb-mail-${l.messageId}`}
          className={`hdb-ancre hdb-barre hdb-barre--${tonDeLExpediteur(l, categories)}`
            + `${surligne === l.messageId ? ' hdb-ancre--surlignee' : ''}`}>
          <ol className="vdb-liste">
            {/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — LA CATÉGORIE D'UNE ADRESSE, RENDUE PAR CE BLOC.
                Lui seul connaît les catégories de CE bien : la même adresse est « locataire » sur un logement et
                « tiers » sur un autre. La ligne, elle, est montée par quatre écrans — dont la fiche d'un
                locataire, qui n'a aucun bien en tête et n'en passe donc aucune.

                ⚠️ LA MÊME FONCTION QUE LA BARRE VERTICALE DU MAIL (`tonDeLExpediteur`), appelée avec le même
                jeu de catégories : la barre du mail et la pastille de son expéditeur portent ainsi forcément la
                même couleur. Deux lectures séparées auraient fini par se contredire sur la même ligne.

                🔴 NOS ADRESSES RENDENT `'nous'`, ET N'AURONT DONC AUCUNE PASTILLE — « rien pour l'agence »
                (Arno). `tonDeLExpediteur` ne le dit que d'un mail ENVOYÉ : ici la question porte sur une adresse
                quelconque de l'en-tête, et c'est `estAdresseInterne` — la seule définition de « une des nôtres »
                de ce module — qui répond. Sans elle, notre propre adresse en « À : » aurait reçu la pastille
                grise des non-affectés, c'est-à-dire une affirmation fausse. */}
            <LigneVie l={l} maintenant={maintenant} ouvert={deplie.has(l.messageId)}
              surligner={mots}
              /* 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE, POINT 4 — POURQUOI CE MAIL EST DANS LA LISTE. Le calcul
                 est dans le module PUR : l'écran ne décide ni du rôle, ni de son mot, ni de l'ordre. */
              adressesTrouvees={adressesTrouvees(l, mots, normaliserRecherche)}
              tonDe={(adresse) => (estAdresseInterne(adresse)
                ? 'nous'
                : tonDeLExpediteur({ sens: 'recu', de: adresse }, categories))}
              onBasculer={() => onBasculer(l.messageId)} onOuvrirFil={onOuvrirFil}
              /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — l'œil du mail déplié ouvre LA MÊME visionneuse que le
                 résumé, avec LE MÊME tour. Deux portes, une seule fenêtre. */
              onVisualiser={onVisualiser}
              /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — « → envoyé à la partie … » sous les miniatures du mail. */
              destinataires={destinataires.get(l.messageId) ?? []}
              /* 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — les pièces de SA conversation, pour les noms cités. */
              piecesCitables={piecesCitables.get(l.filId) ?? []}
              sortieDuSuivi={sortieDuSuivi(l)}
              modifierRattachement={modifierRattachement(l)}
              /* 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — les trois boutons de la boîte mail sous ce mail
                 déplié, et l'éditeur juste en dessous. La ligne ne décide de rien : elle rend ce qu'on lui
                 donne, et ne rend rien quand on ne lui donne rien. */
              repondre={repondre === undefined ? undefined
                : (voie, corps, html) => repondre(l, voie, corps, html)}
              composeur={composeurDe?.(l) ?? null} />
          </ol>
        </li>
      ))}
    </ol>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — LA BASCULE DU RÉSUMÉ, ÉCRITE UNE FOIS ══════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Le bouton “13 pièces — voir les pièces” devient “13 pièces dans cette
 * sélection — les voir” (et “— les masquer” quand elles sont ouvertes). Il ouvre et ferme le résumé. Le MÊME
 * bouton est ajouté EN BAS du listing des mails. »
 *
 * 🔴 « LE MÊME BOUTON » EST PRIS AU MOT : un seul composant, monté deux fois, lié au même état. Deux boutons
 * recopiés auraient divergé au premier ajustement de libellé — et c'est celui du bas, qu'on voit moins souvent,
 * qui aurait gardé l'ancien mot.
 *
 * ⚠️ LES TROIS MOTS AJOUTÉS (« dans cette sélection ») SONT LA CORRECTION DU POINT 1, DITE À L'ÉCRAN : le résumé
 * couvre la sélection, pas la page — et c'est l'ancien libellé qui avait fait croire le contraire.
 */
function BasculeResume({ n, ouvert, onBasculer, place = 'tete' }: {
  n: number; ouvert: boolean; onBasculer: () => void;
  /**
   * ══ 🔴🔴 LOT RESUME-PIECES-BOUTON-BAS — OÙ CE BOUTON-CI SE TIENT ═══════════════════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Ajoute le MÊME bouton À LA FIN du résumé ouvert, CENTRÉ au milieu de la
   * ligne. Même composant, même état partagé que le bouton du haut. »
   *
   * 🔴 `place` NE CHANGE QUE L'ALIGNEMENT, et c'est tout l'intérêt : le mot, l'état, le compte et le geste
   * viennent des mêmes endroits qu'en tête. Un second composant « bouton du bas » aurait fini par porter un
   * autre libellé — et c'est celui qu'on voit le moins qui aurait gardé l'ancien.
   */
  place?: 'tete' | 'pied';
}) {
  return (
    <button type="button" className={`pdc-trombone${place === 'pied' ? ' hdb-bascule-pied' : ''}`}
      aria-expanded={ouvert} onClick={onBasculer}>
      <span aria-hidden="true">📎</span> {motPiecesSelection(n)}
      <span className="hdb-resume-mot"> {motBasculeResume(ouvert)}</span>
    </button>
  );
}

/**
 * ══ 🔴🔴 LOT RESUME-PIECES-BOUTON-BAS — LE RÉSUMÉ OUVERT, AVEC SON BOUTON DE FIN ════════════════════════════════
 *
 * CONSTAT D'ARNO (05/10/2026) : « une fois le résumé des pièces ouvert, il est long, et pour le refermer il faut
 * remonter tout en haut. »
 *
 * 🔴 UN SEUL ENDROIT POUR LES DEUX MONTAGES. Ce bloc est rendu DEUX fois (au-dessus du fil et en bas du listing,
 * lot HISTORIQUE-BIEN-4) : écrire le bouton de fin aux deux endroits l'aurait fait diverger au premier
 * ajustement. Il vit ici, une fois, et les deux montages l'obtiennent du même coup.
 *
 * 🔴 LA FERMETURE DEPUIS LE BAS REMET LA PAGE SUR LE HAUT DU RÉSUMÉ, c'est la seconde moitié de la demande : « ne
 * pas laisser l'utilisateur perdu plus bas dans la page ». Sans cela, replier des centaines de miniatures fait
 * remonter le contenu sous le curseur, et l'on se retrouve au milieu du fil sans savoir où.
 *
 * ⚠️ CHAQUE MONTAGE VISE SON PROPRE HAUT, et non celui de l'autre : fermer depuis le bas du listing doit ramener
 * au bouton qu'on vient de quitter, pas en tête de page — on n'a pas demandé à remonter tout l'écran.
 */
function ResumeDeplie({ n, onFermer, ...props }: {
  n: number;
  /** Referme le résumé ET demande que la page revienne sur le haut de CE bloc. Voir `recadrer` dans le bloc. */
  onFermer: () => void;
  groupes: readonly GroupeDePieces<PieceDedoublonnee>[];
  depots: ReadonlyMap<number, DepotAffiche>;
  emplacements: ReadonlyMap<number, readonly EmplacementPiece[]>;
  maintenant: Date;
  gestes: GestesPiece;
  sansEmpreinte: number;
  categories: ReadonlyMap<string, CategoriePartie>;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties destinataires, par message. */
  destinataires: ReadonlyMap<number, FamilleVue[]>;
}) {
  return (
    <>
      <ResumePieces {...props} />
      {/* 🔴 CENTRÉ (demande d'Arno) : à la fin d'une liste, un bouton collé à gauche se cherche. */}
      <BasculeResume n={n} ouvert place="pied" onBasculer={onFermer} />
    </>
  );
}

/**
 * ══ 🔴🔴 LE RÉSUMÉ, EN LIGNE ET SANS FENÊTRE ══════════════════════════════════════════════════════════════════════
 *
 * Le MÊME montage que `ModalePiecesConversation` — groupes par message sous la date, `CartePieceConversation`
 * pour chaque pièce, le repli des dépôts et des emplacements sur les autres apparitions du même contenu — mais
 * posé DANS la page. Arno : « un résumé en HAUT et en BAS du fil », pas une fenêtre de plus à fermer.
 *
 * ⚠️ LE REPLI SUR `autresApparitions` EST REPRIS MOT POUR MOT de la fenêtre, et ce n'est pas une recopie de
 * confort : le dépôt est enregistré contre LA pièce rangée. Si l'on a rangé la copie du 30/09 et que la carte
 * montre celle du 23/09, chercher le dépôt sur le seul identifiant affiché ferait disparaître la mention — et
 * l'on rangerait une seconde fois un fichier déjà rangé.
 */
function ResumePieces({
  groupes, depots, emplacements, maintenant, gestes, sansEmpreinte, categories, destinataires,
}: {
  groupes: readonly GroupeDePieces<PieceDedoublonnee>[];
  depots: ReadonlyMap<number, DepotAffiche>;
  emplacements: ReadonlyMap<number, readonly EmplacementPiece[]>;
  maintenant: Date;
  gestes: GestesPiece;
  sansEmpreinte: number;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — LE LISERÉ DE CATÉGORIE JUSQUE DANS LE RÉSUMÉ ══════════════════════
   *
   * DEMANDE D'ARNO : « Dans le résumé, chaque groupe de pièces (par mail) et chaque miniature porte le même
   * liseré de couleur que les mails, des deux côtés, selon la catégorie de l'expéditeur : rouge propriétaire,
   * vert locataire, bleu tiers, sans couleur pour nous. »
   *
   * 🔴 C'EST LA MÊME RÈGLE, PAR LA MÊME FONCTION (`tonDeLExpediteur`), et le groupe porte déjà ce qu'elle
   * demande : `sens` et `de`. Recalculer la catégorie ici aurait fait un second juge — et un document aurait pu
   * être rouge dans le listing et bleu dans le résumé, pour le même mail.
   */
  categories: ReadonlyMap<string, CategoriePartie>;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties destinataires, par message. */
  destinataires: ReadonlyMap<number, FamilleVue[]>;
}) {
  return (
    <div className="hdb-pieces">
      {groupes.map((g) => (
        <section key={g.messageId}
          className={`pdc-groupe hdb-barre hdb-barre--${tonDeLExpediteur(g, categories)}`}>
          <h6 className="pdc-groupe-titre">
            <span className="pdc-groupe-date">{dateHeureCourte(g.recuLe, maintenant)}</span>
            <span className="pdc-groupe-qui" title={dateHeureComplete(g.recuLe)}> · {mentionExpediteurPiece(g)}</span>
            {(g.objet ?? '').trim() !== '' && (
              <span className="pdc-groupe-objet"> · {nettoyerObjet(g.objet ?? '')}</span>
            )}
          </h6>
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 5 — LE LISERÉ RESTE SUR LE BLOC, PAS SUR LES MINIATURES ═════
              RÈGLE D'ARNO : « le liseré de couleur reste UNIQUEMENT sur le bloc qui regroupe les pièces d'un
              mail. Retire-le des miniatures elles-mêmes. »

              🔴 C'EST L'INVERSE DU LOT 4, OÙ IL EN DEMANDAIT LES DEUX (« chaque groupe de pièces et chaque
              miniature porte le même liseré »). Sa nouvelle règle est meilleure, et pour une raison qui se
              voit : un bloc de six pièces portait SEPT liserés de la même couleur — un par carte, plus celui
              du bloc —, et la couleur ne désignait donc plus rien. Posée une fois sur le bloc, elle dit ce
              qu'elle a toujours voulu dire : « ces pièces viennent d'un mail de cette catégorie ».

              ⚠️ LA TEINTE ÉTAIT TRANSMISE PAR UNE VARIABLE CSS, et c'est elle qui disparaît avec la règle : la
              carte `CartePieceConversation` n'a jamais été modifiée (elle sert aussi la fenêtre d'une
              conversation), et elle ne l'est pas davantage ici. La grille redevient une grille. */}
          <ul className="pdc-grille">
            {g.pieces.map((p) => (
              <CartePieceConversation key={p.pieceId} piece={p} maintenant={maintenant} gestes={gestes}
                /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties à qui NOUS avons envoyé cette pièce. */
                destinataires={destinataires.get(p.messageId) ?? []}
                emplacements={emplacements.get(p.pieceId)
                  ?? p.autresApparitions.map((a) => emplacements.get(a.pieceId)).find((e) => e !== undefined)
                  ?? []}
                depot={depots.get(p.pieceId)
                  ?? p.autresApparitions.map((a) => depots.get(a.pieceId)).find((d) => d !== undefined)} />
            ))}
          </ul>
        </section>
      ))}
      {/* 🔴 LE REPLI SE DIT. Sans empreinte, le rapprochement n'est qu'une présomption : qui lit la liste doit
          savoir laquelle des deux il regarde. Rien ne s'affiche dans le cas ordinaire. */}
      {sansEmpreinte > 0 && (
        <p className="gst-note pdc-note pdc-presomption">
          {sansEmpreinte === 1 ? 'Une pièce a été rapprochée' : `${sansEmpreinte} pièces ont été rapprochées`}
          {' '}sur son nom et sa taille, faute d’empreinte : nous n’en avons pas gardé le contenu.
        </p>
      )}
    </div>
  );
}

/**
 * Le style du bloc. UNIQUEMENT des jetons `--color-svv-*` : aucune couleur en dur, rien sur `:root`, et tout se
 * replie en une colonne sur un iPhone en portrait (390 px).
 *
 * ⚠️ IL EMPORTE `CSS_PIECES_CONVERSATION` (donc le picto Drive), `CSS_VIE_DU_BIEN` et `CSS_PIECES` : le bloc rend
 * les composants de ces trois familles, et un style monté « quelque part plus haut dans la page » est une
 * dépendance invisible — le jour où « Vie du bien » quitte la fiche, ce bloc perdrait ses lignes sans un mot.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS LES COMMENTAIRES CI-DESSOUS : ils vivent dans un litteral gabarit, qu'un seul accent
 * grave terminerait au milieu du CSS (piege deja paye une vingtaine de fois dans ce module).
 */
export const CSS_HISTORIQUE_DU_BIEN = `
${CSS_PIECES_CONVERSATION}
${CSS_FRISE_DU_BIEN}
${CSS_VIE_DU_BIEN}
${CSS_PIECES}
.hdb{min-width:0}
/* ── L'EVENEMENT EN COURS ── Le mot porte l'information, la capsule l'appuie. */
.hdb-evt{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .5rem;min-width:0}
.hdb-evt-capsule{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;flex:0 0 auto;
  background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber-soft)}
.hdb-evt-nom{font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
.hdb-evt-date{font-size:.76rem;color:var(--color-svv-muted)}
.hdb-occupant{margin:0 0 .6rem;font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere}

/* ══ LE TABLEAU DE BORD — DES BANDES HORIZONTALES EMPILEES (lot HISTORIQUE-BIEN-2) ═══════════════════════════
   DEMANDE D'ARNO : « Arno n'aime pas la mise en page actuelle en colonne : refonte complete en blocs
   horizontaux empiles. » Les trois paves ne se partagent donc plus la largeur en colonnes etroites : chacun la
   prend toute, et c'est SON CONTENU qui s'etale. Sur un telephone, chaque bande se replie d'elle-meme. */
.hdb-bord{display:flex;flex-direction:column;gap:8px;margin-bottom:.7rem;min-width:0}
.hdb-pave--bande{width:100%}
/* La bande : les choix a gauche, la periode retenue a droite ; elle passe dessous quand la largeur manque. */
.hdb-bande{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;min-width:0}
.hdb-segments{display:flex;flex-wrap:wrap;gap:.35rem;min-width:0;flex:1 1 20rem}
/* LES BOUTONS SEGMENTES — 44 px de cible, l'etat dit par l'aspect ET par aria-pressed. */
.hdb-seg{min-height:44px;padding:.35rem .8rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  font:inherit;font-size:.8rem;text-align:left;color:var(--color-svv-muted);background:var(--color-svv-surface);
  cursor:pointer;min-width:0;max-width:100%}
.hdb-seg:hover:not(:disabled){color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-seg:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ L'ETAT SELECTIONNE EST ROUGE (lot HISTORIQUE-BIEN-4, point 3) ════════════════════════════════════════════
   DEMANDE D'ARNO : « Dans tout le bloc (Periode, Options, Pieces jointes Toutes/Avec/Sans…), l'etat selectionne
   est ROUGE (la couleur d'accent de l'application), pas noir. Contraste lisible en Clair et en Sombre. »

   🔴 LE TEXTE EST --color-svv-surface, ET NON UN BLANC EN DUR. Le garde de ce fichier interdit toute couleur
   ecrite a la main dans ses propres regles — et il m'a arrete ici, jusque dans ce commentaire, ce qui est juste :
   il ne distingue pas un commentaire d'une regle, et une couleur citee finit par etre recopiee.

   Le raisonnement, en mots : le rouge du depot est FONCE en Clair et CLAIR en Sombre ; la surface fait l'inverse.
   Les deux jetons varient donc en sens contraire, et le contraste tient des deux cotes — texte clair sur rouge
   fonce en Clair, texte fonce sur rouge clair en Sombre. Un blanc fixe n'aurait tenu que d'un cote. */
.hdb-seg--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);
  font-weight:700}
/* GRISE : l'oeil le voit, et le MOTIF est ecrit sous la bande — une infobulle n'existe pas sur un telephone. */
.hdb-seg:disabled{opacity:.5;cursor:not-allowed}
/* LA PERIODE RETENUE — toujours ecrite, jamais devinee d'apres les champs de date. */
.hdb-effective{display:flex;flex-direction:column;gap:0;margin:0;flex:0 1 auto;min-width:0;text-align:right}
.hdb-effective-mot{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.hdb-effective-valeur{font-size:.86rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* LOT HISTORIQUE-BIEN-18, POINT 1 — l'explication de la prolongation, sous les dates qu'elle explique.
   AMBRE, le ton des evenements sur toute cette page (capsule « Evenement en cours », fond des bandeaux de la
   frise) : la meme cause doit avoir la meme couleur d'un bout a l'autre de l'ecran. */
.hdb-effective-prolonge{font-size:.76rem;color:var(--color-svv-amber);overflow-wrap:anywhere}
/* LA LISTE DEROULANTE DES EVENEMENTS — pleine largeur : les references et les objets sont longs. */
.hdb-select-ligne{display:flex;flex-direction:column;gap:.15rem;margin-top:.45rem;min-width:0}
.hdb-select{min-height:44px;font-size:.82rem;width:100%;min-width:0}
.hdb-pave{min-width:0;margin:0;padding:.5rem .6rem .6rem;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface)}
.hdb-legende{padding:0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.hdb-boutons{display:flex;flex-wrap:wrap;gap:.35rem;min-width:0}
/* ══ BLOC OPTIONS ── UNE SEULE RANGEE, PROPRE ET ALIGNEE (lot HISTORIQUE-BIEN-3, point 5) ═════════════════════
   DEMANDE D'ARNO, qui juge l'actuel « immonde » : « Hauteurs identiques, espacements reguliers, aucun bouton qui
   passe seul a la ligne ; sur ecran etroit, retour a la ligne propre par groupes. »

   🔴 « AUCUN BOUTON SEUL A LA LIGNE » EST TENU PAR LA STRUCTURE : chaque controle est un GROUPE indivisible
   (.hdb-opt), et c'est ENTRE les groupes que la rangee se casse. Un flex-wrap sur des boutons nus aurait laisse
   « Sans » tomber seul sous ses deux voisins — le defaut exact qu'Arno a sous les yeux.

   🔴 UNE SEULE HAUTEUR, NOMMEE UNE FOIS : --hdb-h. Trois valeurs recopiees auraient suffi a desaligner la
   rangee d'un pixel, et c'est tout ce qu'il faut pour qu'elle paraisse bricolee. */
.hdb-rangee{--hdb-h:38px;display:flex;flex-wrap:wrap;align-items:center;gap:.45rem .6rem;min-width:0}
.hdb-opt{display:flex;align-items:center;gap:.35rem;min-width:0;flex:0 0 auto}
.hdb-opt-mot{font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted);white-space:nowrap}
/* LA RECHERCHE prend la place qui reste, et jamais moins de 14 rem : en dessous, le texte d'invite se coupe. */
.hdb-opt--recherche{flex:1 1 14rem;min-width:0;position:relative}
.hdb-opt--recherche{height:var(--hdb-h);border-radius:999px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);padding:0 .3rem 0 .6rem}
.hdb-opt--recherche:focus-within{border-color:var(--color-svv-red)}
.hdb-loupe{display:inline-flex;flex:0 0 auto;color:var(--color-svv-muted)}
/* LE CHAMP est NU dans son cadre : un second bord a l'interieur du premier se voit, et se voit mal. */
.hdb-champ-recherche{flex:1 1 auto;min-width:0;height:100%;border:0;background:none;font:inherit;
  font-size:.82rem;color:var(--color-svv-ink);outline:none}
.hdb-champ-recherche::-webkit-search-cancel-button{display:none}
.hdb-effacer{flex:0 0 auto;width:26px;height:26px;border-radius:999px;border:0;background:none;font:inherit;
  font-size:.75rem;color:var(--color-svv-muted);cursor:pointer}
.hdb-effacer:hover{background:var(--color-svv-surface);color:var(--color-svv-ink)}
.hdb-effacer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* LE CONTROLE SEGMENTE : des boutons colles dans un seul cadre, comme une bascule de messagerie. */
.hdb-segs{display:inline-flex;flex:0 0 auto;border-radius:999px;border:1px solid var(--color-svv-line-strong);
  overflow:hidden;height:var(--hdb-h)}
.hdb-petit{height:var(--hdb-h);padding:0 .7rem;border:0;background:var(--color-svv-surface);font:inherit;
  font-size:.78rem;color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
.hdb-segs .hdb-petit+.hdb-petit{border-left:1px solid var(--color-svv-line)}
/* ⚠️ :not(.hdb-petit--actif) — LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES, POINT 2. Ce survol posait
   color:ink SUR TOUS les segments, l'actif compris : le texte du bouton rouge virait au bleu-nuit sur son
   fond rouge, soit un contraste de 1,9:1 — illisible, et c'est le meme defaut qu'Arno a constate sur les
   pilules. L'actif a desormais son propre survol, juste en dessous, qui ne fait que FONCER son fond.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.hdb-petit:hover:not(.hdb-petit--actif){color:var(--color-svv-ink)}
.hdb-petit:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.hdb-petit--actif{background:var(--color-svv-red);color:var(--color-svv-surface);font-weight:700}
.hdb-petit--actif:hover,
.hdb-petit--actif:focus-visible{background:var(--color-svv-red-dark);color:var(--color-svv-surface)}
/* L'ORDRE est un bouton seul : il porte donc son propre cadre arrondi, a la MEME hauteur. */
.hdb-petit--large{border-radius:999px;border:1px solid var(--color-svv-line-strong)}
.hdb-petit--large:hover{border-color:var(--color-svv-line-strong-hover)}
/* LA PUCE BASCULE : un seul etat a dire, donc un seul bouton — et l'etat se lit par l'aspect ET par
   aria-pressed, parce qu'une couleur seule ne dit rien a qui ne la voit pas. */
.hdb-puce-bascule{height:var(--hdb-h);padding:0 .8rem;border-radius:999px;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);font:inherit;
  font-size:.78rem;color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
/* ⚠️ MEME CORRECTION QUE CI-DESSUS (point 2) : sans :not(), la puce ALLUMEE prenait color:ink sur son fond
   rouge au survol. */
.hdb-puce-bascule:hover:not(.hdb-puce-bascule--actif){color:var(--color-svv-ink);
  border-color:var(--color-svv-line-strong-hover)}
.hdb-puce-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LA PUCE BASCULE ALLUMEE EST UNE SELECTION COMME LES AUTRES : elle passe donc au rouge, et non a l'ambre.
   Un second ton pour un meme etat aurait oblige a apprendre deux codes pour une seule idee. */
.hdb-puce-bascule--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);
  color:var(--color-svv-surface);font-weight:700}
.hdb-puce-bascule--actif:hover,
.hdb-puce-bascule--actif:focus-visible{background:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-dark);color:var(--color-svv-surface)}
/* LA BASCULE A CASE garde la MEME hauteur que ses voisins : sans cela, la rangee se decale d'un pixel. */
.hdb-bascule{display:inline-flex;align-items:center;gap:.4rem;height:var(--hdb-h);padding:0 .2rem;
  font-size:.78rem;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-bascule input{width:18px;height:18px;flex:0 0 auto;accent-color:var(--color-svv-red)}
/* « N MAILS SUR M », en direct. Pousse a droite de la rangee : c'est un resultat, pas un reglage. */
/* ⚠️ LE COMPTEUR CONTRE LE CHAMP (point 4) : il vit DANS le cadre arrondi de la recherche, entre le texte et
   la croix, pour etre la ou le regard est quand on tape. Il ne pousse pas le champ (flex:0 0 auto). */
.hdb-compte-champ{flex:0 0 auto;padding:0 6px;font-size:.72rem;font-weight:700;white-space:nowrap;
  color:var(--color-svv-red)}
.hdb-compte-recherche{margin:0 0 0 auto;font-size:.74rem;font-weight:700;color:var(--color-svv-red);
  white-space:nowrap}
/* 44 px de cible sur TOUT ce qui se clique : sur un telephone, 36 px se rate une fois sur trois. */
.hdb-choix{display:inline-flex;flex-direction:column;align-items:flex-start;gap:.1rem;min-height:44px;
  padding:.35rem .7rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);font:inherit;
  font-size:.8rem;text-align:left;color:var(--color-svv-muted);background:var(--color-svv-surface);cursor:pointer;
  min-width:0;max-width:100%}
.hdb-choix:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-choix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'ETAT ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.hdb-choix--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);
  font-weight:700}
/* 🔴 LOT HISTORIQUE-BIEN-2 — LES REGLES DES ANCIENNES RANGEES DE BOUTONS (un bouton par evenement, un par
   locataire) ONT ETE RETIREES AVEC ELLES : la periode se choisit maintenant par quatre boutons segmentes et une
   liste deroulante. Plus aucun element ne rendait .hdb-choix--evt, --occ, .hdb-evts, .hdb-occs ni leurs mots. */
.hdb-dates{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.4rem}
.hdb-date{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1 1 9rem}
.hdb-champ-date{min-height:44px;font-size:.82rem;min-width:0;width:100%}
.hdb-note{margin:.3rem 0 0}
/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — LA PHRASE DE CE QUE LE RÉSUMÉ N'A PAS REPRIS.
   Discrete, mais PAS invisible : un trombone barre la ligne a gauche pour qu'elle se distingue de la note des
   contacts pre-remplis juste en dessous — les deux sont grises, et deux notes grises collees se lisent comme une
   seule. Aucune couleur en dur : le bord emprunte le jeton de ligne du depot, lisible dans les deux themes. */
.hdb-ecartees{padding-left:.5rem;border-left:3px solid var(--color-svv-line-strong)}

/* ══ LES PARTIES — QUATRE GROUPES COTE A COTE, EMPILES QUAND LA LARGEUR MANQUE ════════════════════════════════
   DEMANDE D'ARNO : « Quatre rangees ou groupes, cote a cote si la largeur le permet, sinon empiles. »
   auto-fit fait exactement cela, sans point de rupture ecrit a la main : quatre colonnes sur un grand ecran,
   deux sur une tablette, UNE a 390 px. Un minmax plus etroit aurait coupe les adresses en deux. */
/* ══ LOT HISTORIQUE-BIEN-3 — DEUX ENCARTS COTE A COTE, PUIS DEUX BANDES PLEINE LARGEUR ════════════════════════
   DEMANDE D'ARNO : « “Tiers independant” : une ligne deployable SOUS les deux encarts, pleine largeur, bleue,
   repliee par defaut. Meme chose pour “Non affectes” (grise). » Les deux encarts se partagent donc la largeur,
   et les bandes la prennent toute — ce qui leur donne, repliees, la hauteur d'une seule ligne. */
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — DEUX COLONNES, PAS « AUTANT QU'IL EN RESTE » ═══════════════════════
   REGLE D'ARNO : « les deux encarts sont TOUJOURS affiches cote a cote, meme largeur : Proprietaire a GAUCHE,
   Locataire a DROITE (comme avant le lot 4). Sur ecran etroit seulement, les encarts passent l'un sous
   l'autre, Proprietaire en premier. »

   🔴 L'ANCIENNE GRILLE ETAIT LA MOITIE DU DEFAUT : repeat(auto-fit, minmax(240px, 1fr)). auto-fit **replie les pistes vides** :
   avec un seul enfant, il ne reste qu'une colonne et elle prend la ligne entiere. C'est ce qu'Arno a vu —
   l'encart Locataire etendu sur toute la largeur. Deux pistes ecrites 1fr 1fr ne se replient pas : deux colonnes egales, toujours,
   et l'encart vide garde sa moitie.

   🔴 L'EMPILEMENT RESTE, MAIS IL EST DIT : une seule colonne sous 34rem. C'est une requete de media et non plus
   un effet de bord d'auto-fit — on sait donc OU la bascule se produit, et l'ordre du DOM (Proprietaire d'abord)
   donne gratuitement « Proprietaire en premier ».

   ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 3 — LES DEUX ENCARTS ONT TOUJOURS LA MEME HAUTEUR ══════════════════════
   REGLE D'ARNO : « les encarts Proprietaire et Locataire ont TOUJOURS la meme hauteur (celle du plus grand,
   plafonnee a la hauteur maximale d'avant defilement), meme si l'un est vide. Le texte d'encart vide est centre
   verticalement. »

   🔴 CE QUE J'AVAIS ECRIT AU LOT 5, ET QU'ARNO TRANCHE AUTREMENT : align-items:start. Mon motif etait qu'un
   encart vide ne s'etire pas a la hauteur de son voisin ; Arno veut justement qu'il s'etire, parce que deux
   encarts de hauteurs differentes font un bloc de guingois. Sa regle gagne, et elle est plus simple : la
   VALEUR PAR DEFAUT d'une grille — stretch — donne exactement « la hauteur du plus grand », sans une ligne.

   🔴 ET LE PLAFOND EST DEJA TENU, SANS RIEN AJOUTER : la liste de chaque encart est bornee par
   la variable --hdb-liste-h (8,75 rem) et defile au-dela. Le plus grand des deux ne peut donc pas la depasser,
   et « la hauteur du plus grand » est donc « plafonnee a la hauteur maximale d'avant defilement » par
   construction. Un max-height de plus sur l'encart aurait fait un second plafond a tenir. */
.hdb-encarts{display:grid;gap:8px;grid-template-columns:1fr 1fr;align-items:stretch;margin-top:.5rem;
  min-width:0}
@media (max-width:34rem){.hdb-encarts{grid-template-columns:1fr}}
/* 🔴 UN ENCART EST UNE COLONNE : sa tete en haut, et ce qui suit prend la place restante. C'est ce qui permet au
   texte d'un encart vide de se centrer VERTICALEMENT, comme Arno le demande.
   ⚠️ LES BANDES NE SONT PAS CONCERNEES : elles sont pleine largeur et leur hauteur n'a pas de jumelle. */
.hdb-groupe--encart{display:flex;flex-direction:column}
.hdb-groupe--encart .hdb-vide-mot{flex:1 1 auto;display:flex;align-items:center;justify-content:center;
  text-align:center;margin:.35rem 0}
.hdb-groupe--bande{margin-top:8px}
/* ⚠️ LA ZONE SURVOLEE SE SURLIGNE DANS SA COULEUR (demande d'Arno), et le bord s'epaissit : la couleur seule ne
   dit rien a qui ne la voit pas, l'epaisseur se voit toujours. */
.hdb-groupe--cible{border-style:dashed;border-width:2px;border-left-width:4px}
.hdb-groupe--rouge.hdb-groupe--cible{border-color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.hdb-groupe--vert.hdb-groupe--cible{border-color:var(--color-svv-green);background:var(--color-svv-green-soft)}
.hdb-groupe--bleu.hdb-groupe--cible{border-color:var(--color-svv-blue);background:var(--color-svv-blue-soft)}
.hdb-groupe--gris.hdb-groupe--cible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
/* Une bande vide survolee le DIT : sans ce mot, on lacherait la capsule sur un rectangle muet. */
.hdb-vide-depot{margin:.3rem 0 .1rem;font-size:.74rem;color:var(--color-svv-muted);text-align:center}
/* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LE « TEXTE DISCRET » D'UN ENCART VIDE. Discret veut dire petit et gris,
   pas illisible : c'est le ton des notes du bloc (--color-svv-muted), et il tient sur deux lignes a 390 px. */
.hdb-vide-mot{margin:.35rem 0 .2rem;font-size:.76rem;color:var(--color-svv-muted);line-height:1.35}
/* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LA CASE « tout le groupe » D'UN GROUPE VIDE. Elle garde sa place (la
   ligne ne change pas de forme selon le bien) et dit qu'elle n'a rien a cocher : estompee, curseur par defaut.
   ⚠️ L'ESTOMPE N'EST PAS LA SEULE INDICATION : l'attribut disabled la porte aussi pour qui ne voit pas la
   couleur, et c'est lui qui empeche reellement le clic. */
.hdb-case--muette{opacity:.5;cursor:default}
.hdb-case--muette input{cursor:default}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — LES DEUX BOUTONS DE L'EN-TETE DE L'ENCART LOCATAIRE ════════════════════════
   DEMANDE D'ARNO : « "Locataire(s) actuel(s)" est écrit en noir (sélectionné) ; "Anciens locataires" est en GRIS
   CLAIR (non sélectionné). »

   🔴 LA SELECTION SE LIT A LA COULEUR **ET** AU POIDS, et c'est volontaire : la couleur seule ne dit rien a qui
   ne la distingue pas, et la difference gris clair / noir est justement celle qui se perd le plus vite sur un
   ecran mal regle. Le bouton actif est aussi en gras. Et l'attribut aria-pressed le dit au lecteur d'ecran,
   qui ne voit ni l'un ni l'autre.

   🔴 ILS SE REPLIENT L'UN SOUS L'AUTRE SUR ECRAN ETROIT : la ligne d'en-tete autorise deja le retour a la ligne
   (flex-wrap sur .hdb-groupe-tete), et le nom d'un ancien locataire est long. Sans cela, « Anciens locataires ·
   ACKET GOEMAERE - DERRIEN Alizée et Thomas » poussait la case « tout le groupe » hors de l'encart.

   ⚠️ CIBLE DE 44 px, comme tout ce qui se clique dans ce bloc : c'est l'exigence transverse du depot, et ces
   deux boutons sont desormais le geste le plus frequent de l'encart.

   ⚠️ UN BOUTON INACTIF GARDE SA PLACE ET SON CURSEUR PAR DEFAUT (lot 5, point 2) : il DIT qu'il n'y a rien
   là-dessous, ce qui est une information. Son motif est dans l'info-bulle. */
.hdb-onglet{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .4rem;
  flex:0 1 auto;min-width:0;overflow:hidden;
  border:0;background:none;font:inherit;font-size:.82rem;font-weight:600;color:var(--color-svv-muted);
  cursor:pointer;text-align:left;border-radius:.35rem}
/* 🔴 L'ELLIPSE PORTE SUR LE MOT, PAS SUR LE BOUTON : posee sur le bouton, elle rognait d'abord le COMPTE, qui
   est a la fin — « Locataire(s) actu… » sans son « 2 ». C'est le libelle qui cede, jamais le chiffre, et le
   texte entier reste en info-bulle. */
.hdb-onglet-mot{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdb-onglet .gst-compte{flex:0 0 auto}
.hdb-onglet--actif{color:var(--color-svv-ink);font-weight:700}
/* ══ 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — L'ONGLET « ANCIENS LOCATAIRES (N) » ET SA LISTE ════════════════════════
   Le violet du theme (jeton --color-svv-violet, defini dans les DEUX modes). La regle de l'onglet ACTIF est
   ecrite APRES, donc elle l'emporte : actif, il reste en couleur d'encre et en gras, comme son jumeau. */
.hdb-onglet--ancien{color:var(--color-svv-violet)}
.hdb-onglet--ancien.hdb-onglet--actif{color:var(--color-svv-violet);font-weight:700}
.hdb-onglet--ancien:hover:not(:disabled){background:var(--color-svv-violet-soft)}
/* La liste des cartes d'anciens : le bouton radio et le survol prennent le meme violet que l'onglet qui l'ouvre. */
.hdb-anciens-liste .hdb-anciens-choix:hover{background:var(--color-svv-violet-soft)}
.hdb-anciens-liste .hdb-anciens-choix input{accent-color:var(--color-svv-violet)}
.hdb-onglet:hover:not(:disabled){background:var(--color-svv-field)}
.hdb-onglet:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-onglet:disabled{opacity:.5;cursor:default}
/* ══ 🔴 LA LISTE DES CARTES, A LA PLACE DES CAPSULES ═════════════════════════════════════════════════════════
   Elle porte AUSSI la classe .hdb-defile : elle prend la place des capsules, donc elle en prend le plafond et
   le defilement interne. Un logement a huit anciens locataires ne fait pas grandir l'encart, et sa jumelle de
   gauche reste alignee — c'est la regle « il ne grandit jamais » du lot 3. */
.hdb-anciens-liste{list-style:none;margin:.2rem 0 0;padding:0;display:flex;flex-direction:column;gap:1px;
  min-width:0}
.hdb-anciens-choix{display:flex;align-items:center;gap:.4rem;min-height:44px;padding:0 .3rem;
  border-radius:.35rem;font-size:.74rem;color:var(--color-svv-ink);cursor:pointer;min-width:0}
.hdb-anciens-choix:hover{background:var(--color-svv-field)}
.hdb-anciens-choix input{flex:0 0 auto;accent-color:var(--color-svv-red)}
.hdb-anciens-choix span{min-width:0;overflow-wrap:anywhere}
/* ── LES QUATRE TONS ── Le bord gauche porte la couleur du groupe : la MEME que la barre des mails qui en
   viennent. Les jetons vivent dans globals.css ; aucune couleur en dur ici, donc rien d'illisible en sombre. */
.hdb-groupe{margin:0;min-width:0;padding:.3rem .4rem .4rem .55rem;border-radius:.5rem;
  border:1px solid var(--color-svv-line);border-left-width:4px;background:var(--color-svv-surface)}
.hdb-groupe--rouge{border-left-color:var(--color-svv-red)}
.hdb-groupe--vert{border-left-color:var(--color-svv-green)}
/* LE BLEU EST UN JETON DU DEPOT (--color-svv-blue, defini dans les DEUX modes) : rien n'est invente ici.
   Un #rrggbb ecrit a la main aurait produit un bleu illisible en sombre — ce que le depot interdit et verifie. */
.hdb-groupe--violet{border-left-color:var(--color-svv-violet)}
/* ══ 🔴🔴 LOT PARTIES-LOCATAIRES-EXCLUSIF — L'ENCART QUI MONTRE LES ANCIENS EST VIOLET D'UN BOUT A L'AUTRE ═════
   ARNO : « Onglet "Anciens locataires" affiche → lisere VIOLET, ainsi que la case "tout le groupe" et les cases
   cochees de cet onglet dans la teinte violette. »
   🔴 LES CASES SUIVENT LE LISERE PAR UN SEUL SELECTEUR DE PARENT : la case ne sait pas quel onglet est affiche,
   et il n'y avait aucune raison de le lui apprendre. accent-color peint la coche elle-meme, dans les deux
   themes, avec le jeton du depot. */
.hdb-groupe--violet .hdb-case input{accent-color:var(--color-svv-violet)}
.hdb-groupe--violet.hdb-groupe--cible{border-color:var(--color-svv-violet);
  background:var(--color-svv-violet-soft)}
/* La mention discrete de la bascule actuels/anciens, sous les deux encarts. */
.hdb-exclusif{margin:.35rem 0 0;font-size:.76rem;color:var(--color-svv-violet)}
.hdb-groupe--bleu{border-left-color:var(--color-svv-blue)}
.hdb-groupe--gris{border-left-color:var(--color-svv-line-strong)}
/* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — « NOTRE AGENCE » : LE GRIS NEUTRE D'ARNO.
   C'est le MEME ton que la barre verticale de nos propres mails dans le listing (tonDeLExpediteur rend 'nous') :
   la case qu'on decoche et les mails qui disparaissent portent ainsi la meme couleur, sans qu'on l'apprenne.
   ⚠️ --color-svv-line (et non -line-strong) : plus EFFACE que « Non affectes », parce que l'agence n'est pas une
   partie du bien — elle est celle qui tient le dossier. Les deux jetons existent dans les DEUX themes. */
.hdb-groupe--nous{border-left-color:var(--color-svv-line)}

/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LA LIGNE D'ETAT DU FILTRE, A LA PLACE DE L'INTERRUPTEUR ════════════
   DEMANDE D'ARNO : « a sa place, une ligne d'etat claire […] avec un bouton “Tout decocher” ».
   🔴 ELLE EST EN GRAS ET SUR SA PROPRE LIGNE : c'est desormais la seule chose qui dise laquelle des deux
   lectures on regarde. L'ancien interrupteur, lui, se lisait comme une option parmi d'autres — et c'est
   precisement pour cela qu'on ne voyait pas qu'il desarmait les cases d'a cote.
   ⚠️ LE RETOUR A LA LIGNE EST AUTORISE ET LE BOUTON NE S'ETIRE PAS : sur un telephone, la phrase passe au-dessus du bouton au
   lieu de le pousser hors de l'ecran. */
.hdb-selection{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;min-height:44px;padding:.1rem .3rem}
.hdb-selection-mot{font-size:.8rem;font-weight:700;color:var(--color-svv-ink);min-width:0}
.hdb-btn-decocher{flex:0 0 auto}
.hdb-groupe-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;min-width:0}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 2 — UNE SEULE LIGNE, ET LA MEME HAUTEUR DANS LES TROIS ETATS ════════
   DEMANDE D'ARNO : « Comme l'encart Propriétaire : ▼, "Locataire(s) actuel(s) N", "Anciens locataires (N)", et
   "tout le groupe" à DROITE, SUR LA MÊME LIGNE (aujourd'hui "tout le groupe" passe dessous, même par défaut).
   […] L'en-tête garde EXACTEMENT la même hauteur et la même disposition avant et après le choix : aucun
   décalage, aucun retour à la ligne. »

   🔴 CE QUI REND CELA POSSIBLE AUJOURD'HUI, ET NE L'ETAIT PAS AU LOT 15 : le libellé du second bouton NE BOUGE
   PLUS (« Anciens locataires (2) », le nom de la carte étant passé en info-bulle). Les deux libellés sont donc
   COURTS ET CONSTANTS — environ 108 px et 150 px — et l'en-tête tient sur une ligne. Au lot 15, le nom choisi
   pouvait faire 440 px : aucune mise en page ne tenait, et j'avais laissé le repli plutot que de rogner les mots.

   🔴 LE REPLI EST DONC COUPE : trois etats, une seule ligne, et la case « tout le groupe » qui ne descend
   jamais. Au besoin (ecran tres etroit), ce sont les LIBELLES qui se retrecissent — leur texte entier reste en
   info-bulle, et il est de toute facon le meme dans les trois etats.

   ⚠️ LA CASE EST HORS DE CETTE ENVELOPPE, et c'est ce qui la tient a droite : l'enveloppe prend la place
   restante (flex:1 1 0) et se retrecit jusqu'a zero avant que la case ne bouge. */
.hdb-tete-titres{display:flex;flex-wrap:nowrap;align-items:center;gap:.35rem;flex:1 1 0;min-width:0}
.hdb-replier{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .4rem;flex:1 1 8rem;
  border:0;background:none;font:inherit;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  cursor:pointer;text-align:left;min-width:0}
.hdb-replier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-15 — LE TRIANGLE SEUL NE S'ETIRE PAS ═══════════════════════════════════════════
   🔴 DEFAUT VU A L'ECRAN sur lot-146, et il venait de l'ORDRE des regles : .hdb-replier porte flex:1 1 8rem
   (il prenait toute la ligne quand il portait le titre), et ma premiere version posait le correctif AVANT lui —
   meme specificite, donc c'est la derniere ecrite qui gagnait. Resultat : le triangle poussait les deux boutons
   vers la droite, et la case « tout le groupe » passait a la ligne suivante, a gauche. Arno la veut A DROITE.
   La regle est donc ici, APRES celle qu'elle corrige.
   ⚠️ LA CASE EST COLLEE A DROITE PAR margin-left:auto plutot que par un justify-content sur la ligne : la
   ligne sert aussi les trois autres groupes, ou le titre s'etire encore. */
.hdb-replier--picto{flex:0 0 auto;min-width:0;padding:0 .2rem}
.hdb-groupe-tete .hdb-case--groupe{margin-left:auto}
.hdb-triangle{display:inline-block;font-size:.7rem;color:var(--color-svv-red);transition:transform .15s ease}
.hdb-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.hdb-triangle{transition:none}}
/* 🔴 LOT HISTORIQUE-BIEN-2 — .hdb-tout est RETIREE AVEC SON BOUTON : « tout le groupe » est devenu une CASE
   a trois etats (demande d'Arno), et plus aucun element ne rendait ce bouton. */
.hdb-personnes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
/* ══ L'ENCART NE GRANDIT JAMAIS : IL DEFILE (lot HISTORIQUE-BIEN-3, point 1) ══════════════════════════════════
   DEMANDE D'ARNO : « Chaque encart garde la hauteur actuelle (3 lignes visibles). Il ne grandit jamais. »

   🔴 LA HAUTEUR EST UN JETON NOMME, et non un nombre glisse dans une regle : trois capsules de 44 px plus leurs
   deux interlignes de 2 px. L'ecrire ainsi dit POURQUOI c'est cette valeur, et un jour ou la capsule changera de
   hauteur, il n'y aura qu'un endroit a corriger.

   ⚠️ L'overscroll-behavior: contain EMPECHE LE DEFILEMENT DE FUIR VERS LA PAGE : sans lui, arriver en bas de
   l'encart emporte la page entiere, et l'on perd le tableau de bord qu'on etait en train de regler. */
.hdb-boite{position:relative;min-width:0;margin-top:.2rem}
.hdb-defile{max-height:var(--hdb-liste-h);overflow-y:auto;overscroll-behavior:contain;min-width:0;
  scrollbar-width:thin}
.hdb-groupe{--hdb-liste-h:8.75rem}
/* ══ LA PUCE FLOTTANTE ── centree, petite, et c'est un BOUTON : un clic fait defiler d'un plein encart.
   Une fleche purement indicative aurait oblige a viser une barre de defilement de quelques pixels — et il n'y en
   a aucune sur un telephone. */
/* 🔴 AUCUNE OMBRE, ET C'EST UN CHOIX CONTRAINT : ce depot n'a pas de jeton d'ombre, et le garde de ce fichier
   interdit toute couleur en dur dans ses propres regles (il a raison : un rgba ecrit ici serait la meme teinte
   dans les deux themes). La puce se detache donc par un bord EPAIS et un fond de surface surelevee — deux
   jetons, lisibles en Clair comme en Sombre. */
.hdb-puce{position:absolute;left:50%;transform:translateX(-50%);z-index:1;min-height:22px;padding:0 .55rem;
  border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);
  font:inherit;font-size:.66rem;font-weight:700;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-puce:hover{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.hdb-puce:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-puce--bas{bottom:-3px}
.hdb-puce--haut{top:-3px}
.hdb-case{display:flex;align-items:center;gap:.45rem;min-height:44px;padding:.1rem .3rem;font-size:.8rem;
  color:var(--color-svv-ink);cursor:pointer;min-width:0;border-radius:.4rem}
.hdb-case:hover{background:var(--color-svv-field)}
.hdb-case input{width:18px;height:18px;flex:0 0 auto;accent-color:var(--color-svv-red)}
.hdb-case--large{font-weight:700}
/* LA CASE « tout le groupe » — trois etats, dont indeterminate quand une partie seulement est cochee. */
.hdb-case--groupe{font-size:.72rem;color:var(--color-svv-muted);min-height:36px;flex:0 0 auto}
/* ══ LA CAPSULE ── une pastille arrondie : case a cocher, nom, compteurs, et la date pour les locataires.
   🔴 ELLE EST DEPLACABLE A LA SOURIS. Le draggable vit sur l'enveloppe et non sur le label : pose sur le
   label, il capture dans certains navigateurs le clic qui coche la case — c'est-a-dire le geste le plus frequent
   du bloc. */
/* ══ LOT HISTORIQUE-BIEN-4, POINT 2 — UN SEUL FORMAT POUR TOUTES LES CAPSULES ═════════════════════════════════
   DEMANDE D'ARNO : « Retire le lisere de couleur en arc de cercle a gauche des capsules. TOUTES les capsules
   prennent le format des capsules cote proprietaire : nom sur une ligne, compteurs en dessous, “…” a droite.
   Meme hauteur pour toutes. »

   🔴 LE LISERE PARTAIT EN ARC parce qu'un bord gauche de 3 px sur un rayon de 999 px suit la courbe : il se
   lisait comme une rognure, pas comme une couleur. La categorie est deja dite par l'encart qui porte la
   capsule — la repeter sur chaque pastille etait du bruit.

   🔴 UNE SEULE HAUTEUR, NOMMEE : --hdb-caps. C'est ce qui aligne les quatre groupes cote a cote ; trois valeurs
   recopiees auraient suffi a donner aux locataires une hauteur a part, ce qui etait justement le defaut. */
.hdb-capsule{--hdb-caps:46px;display:flex;flex-wrap:nowrap;align-items:center;gap:.3rem;min-width:0;
  min-height:var(--hdb-caps);border-radius:999px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-surface);padding:.1rem .35rem .1rem .1rem;cursor:grab}
.hdb-capsule:active{cursor:grabbing}
.hdb-capsule:hover{border-color:var(--color-svv-line-strong)}
/* LES CLIENTS NE SE DEPLACENT PAS : curseur « interdit », et l'infobulle dit POURQUOI (mot d'Arno). */
.hdb-capsule--fixe{cursor:not-allowed;background:var(--color-svv-field)}
.hdb-case--capsule{flex:1 1 auto;min-width:0;min-height:calc(var(--hdb-caps) - 4px)}
/* LE NOM SUR UNE LIGNE, LES COMPTEURS EN DESSOUS (format de la capture d'Arno). */
.hdb-personne-nom{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* LA DATE D'UN LOCATAIRE : petit texte sur la ligne des compteurs, SANS cadre (demande d'Arno). */
.hdb-periode-mot{border:0;background:none;padding:0;margin:0;font:inherit;font-size:inherit;
  color:var(--color-svv-muted);text-decoration:underline;text-decoration-style:dotted;cursor:pointer}
.hdb-periode-mot:hover{color:var(--color-svv-ink)}
.hdb-periode-mot:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* ══ LE MENU « DEPLACER VERS… » ── le chemin clavier, indispensable : le glisser n'existe ni au clavier ni sous
   un doigt. Il passe par la MEME porte d'ecriture. */
.hdb-menu-bouton{width:28px;min-height:28px;border-radius:999px;border:1px solid var(--color-svv-line);
  background:transparent;font:inherit;font-size:.9rem;line-height:1;color:var(--color-svv-muted);cursor:pointer}
.hdb-menu-bouton:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.hdb-menu-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ LE MENU EST EN POSITION **FIXE** (lot HISTORIQUE-BIEN-4, point 2) ════════════════════════════════════════
   L'encart a overflow-y: auto : tout element positionne A L'INTERIEUR y est ROGNE, et aucun z-index n'y change
   quoi que ce soit — un conteneur qui defile decoupe ses enfants, c'est sa definition. Le menu sort donc du flux
   et se place par rapport a la FENETRE, aux coordonnees mesurees du bouton. C'est aussi ce qui le fait « passer
   au-dessus du defilement de l'encart », litteralement. */
.hdb-menu{position:fixed;z-index:60;display:flex;flex-direction:column;
  min-width:11rem;max-width:min(18rem,calc(100vw - 16px));border-radius:.5rem;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);overflow:hidden}
.hdb-menu-item{min-height:40px;padding:0 .7rem;border:0;background:none;font:inherit;font-size:.78rem;
  text-align:left;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-menu-item:hover{background:var(--color-svv-field)}
.hdb-menu-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* ══ LE MESSAGE D'APRES-DEPOT ── « Fanny Rosky → Locataire », avec « Annuler » quelques secondes. */
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LA FENETRE DE CONFIRMATION DE « SORTIR DU SUIVI » ═══════════════════
   LE MEME HABILLAGE QUE LES AUTRES FENETRES DU MODULE (voile sombre, carte arrondie, ombre portee) : une boite
   de dialogue qui ne ressemble a aucune autre se lit comme un incident plutot que comme une question.

   ⚠️ z-index 72, celui des fenetres de ce module : au-dessus du fil et de ses barres, en dessous de rien.

   🔴 LE VOILE ET L'OMBRE SONT EN color-mix SUR UN JETON, JAMAIS EN COULEUR LITTERALE. Ce fichier porte un garde qui
   interdit toute couleur litterale dans sa feuille (hdb.test), et il a raison : une ombre ecrite en dur reste
   noire en theme Sombre, ou le fond est deja sombre. C'est le parti de .fre-voile, repris ici.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le litteral de gabarit (piege vu plus de dix fois). */
.hdb-voile{position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;padding:16px;
  background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);text-align:left}
.hdb-confirme{width:min(32rem,100%);display:flex;flex-direction:column;gap:.6rem;padding:16px;border-radius:12px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 12px 40px color-mix(in srgb, var(--color-svv-ink) 25%, transparent)}
.hdb-confirme-mot{margin:0;font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hdb-confirme-note{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.hdb-confirme-boutons{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end;margin:0}
.hdb-fait{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.5rem 0 0;padding:.35rem .6rem;
  border-radius:.5rem;border:1px solid var(--color-svv-green);background:var(--color-svv-green-soft);
  font-size:.8rem;color:var(--color-svv-green-ink);min-width:0}
.hdb-fait-mot{font-weight:700;overflow-wrap:anywhere;min-width:0}
.hdb-fait-annuler{min-height:32px;padding:0 .6rem;border-radius:.4rem;border:1px solid var(--color-svv-green);
  background:transparent;font:inherit;font-size:.76rem;font-weight:700;color:var(--color-svv-green-ink);
  cursor:pointer}
.hdb-fait-annuler:hover{background:var(--color-svv-surface)}
.hdb-fait-annuler:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* Une ligne de personne : la case a gauche, la periode et le « + » a droite.
   ⚠️ ELLE S'ENROULE. Les quatre groupes sont des colonnes etroites, et un nom reel y tient rarement sur une
   ligne (« NADKARNI BHARGAVA Esha Rajan et Sanjana »). Sans enroulement, la periode ecrasait le nom sur trois
   lignes de deux mots — mesure faite a l'ecran sur le bien 155. La periode passe donc dessous quand il faut. */
.hdb-personne-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .3rem;min-width:0}
.hdb-personne-ligne>.hdb-case{flex:1 1 9rem;min-width:0}
/* LA PERIODE D'UN LOCATAIRE, cliquable : elle regle le tableau de bord sur SON bail.
   Le margin-left l'aligne sous le NOM et non sous la case : elle parle de la personne, pas de la coche. */
.hdb-periode-partie{flex:0 0 auto;margin-left:1.65rem;min-height:36px;padding:0 .4rem;border-radius:.4rem;
  border:1px solid var(--color-svv-line);background:transparent;font:inherit;font-size:.68rem;
  color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
.hdb-periode-partie:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.hdb-periode-partie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LE « + » — 36 px au moins, et un aria-label complet : un « + » seul ne dit rien a un lecteur d'ecran. */
.hdb-plus{flex:0 0 auto;width:36px;min-height:36px;border-radius:.4rem;border:1px solid var(--color-svv-line);
  background:transparent;font:inherit;font-size:1rem;font-weight:700;color:var(--color-svv-red);cursor:pointer}
.hdb-plus:hover{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.hdb-plus:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ LE « + » ROUGE DANS UN CERCLE ROUGE (lot HISTORIQUE-BIEN-3, point 3) ═════════════════════════════════════
   DEMANDE D'ARNO : « un “+” rouge dans un cercle rouge (reprends le + de la capture et ajoute le cercle) ».
   Le signe et le trait sont donc la MEME couleur, et le cercle est un vrai rond : 28 px, bord de 2 px.
   ⚠️ LA CIBLE TACTILE RESTE DE 36 px grace au padding de la capsule : un rond de 28 px se rate, mais la zone
   cliquable, elle, garde sa taille. */
.hdb-plus--cercle{width:28px;height:28px;min-height:28px;border-radius:999px;border:2px solid var(--color-svv-red);
  display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0}
.hdb-plus--cercle:hover{background:var(--color-svv-red-soft);border-color:var(--color-svv-red)}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LES TROIS ETATS DE LA PASTILLE, MEME CERCLE ════════════════════════
   REGLE D'ARNO : « un “+” rouge dans un cercle rouge, TOUJOURS VISIBLE (pas seulement au survol) […] Quand une
   carte existe deja : le “+” est remplace par une petite icone “fiche” (meme cercle, gris) qui ouvre la carte.
   Si la carte est encore “a verifier” (trame orange), l'icone est orange. »

   🔴 « TOUJOURS VISIBLE » N'A RIEN A CORRIGER ICI, ET C'EST VERIFIE : aucune regle de ce bloc n'a jamais lie la
   pastille au survol ni a une opacite. Ce qui la faisait manquer etait une CONDITION DE RENDU, pas un style — le
   garde du fichier d'epreuves interdit desormais les deux.

   ⚠️ LE MEME CERCLE, LA MEME TAILLE, LA MEME PLACE : seule la couleur change. Trois pastilles de geometries
   differentes auraient fait sauter la droite des capsules d'une ligne a l'autre.
   ⚠️ LE TON NE DIT JAMAIS SEUL : l'info-bulle et l'intitule du lecteur d'ecran portent l'etat en toutes lettres
   (motPastille), parce qu'une couleur ne dit rien a qui ne la voit pas. */
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 2 — DEUX ETATS, ET L'ORANGE A DISPARU ═══════════════════════════════════
   REGLE D'ARNO : « Toute capsule CONTACT sans carte creee (y compris avec un pre-remplissage) porte le “+” rouge
   dans un cercle rouge : le meme “+” que l'icone de la capture d'Arno, entoure d'un cercle rouge FIN, fond BLANC,
   centre. L'icone “fiche” orange disparait. Quand la carte est creee : petite icone “fiche” grise cerclee. »

   🔴 LE CERCLE EST FIN ET LE FOND EST CELUI DE LA SURFACE, et non une pastille pleine : c'est ce que la capture
   d'Arno montre. Un bord de 2 px faisait une cible lourde a cote d'un « … » discret ; 1,5 px tient le cercle
   sans l'imposer.

   ⚠️ LES DEUX REGLES DE L'ORANGE SONT RETIREES AVEC SON ETAT : plus aucune pastille ne le porte depuis que les
   481 pre-remplissages ne montent plus dans un carrousel. Une regle morte aurait fait croire a un 3e etat. */
.hdb-plus--plus{border-width:1.5px;border-color:var(--color-svv-red);color:var(--color-svv-red);
  background:var(--color-svv-surface)}
.hdb-plus--plus:hover{background:var(--color-svv-red-soft)}
.hdb-plus--fiche{border-width:1.5px;border-color:var(--color-svv-line-strong);color:var(--color-svv-muted);
  font-size:.86rem;background:var(--color-svv-surface)}
.hdb-plus--fiche:hover{background:var(--color-svv-field);border-color:var(--color-svv-line-strong-hover)}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — « adresse a corriger dans l'annuaire » ══════════════════════════════
   DISCRETE veut dire petite et ambre, pas invisible : c'est le ton de ce qui attend un geste dans tout le module
   (la trame des cartes a verifier), et il se lit dans les deux themes.
   ⚠️ CE N'EST PAS UNE ERREUR, C'EST UNE CHOSE A FAIRE : donc l'ambre, et non le rouge, qui dit « refuse ». */
.hdb-a-corriger{border:0;background:transparent;font:inherit;font-size:.7rem;color:var(--color-svv-amber);
  padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.hdb-a-corriger:hover{color:var(--color-svv-ink)}
.hdb-a-corriger:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Sans fiche a ouvrir, le meme mot sans le lien : on dit le probleme meme sans porte a offrir. */
.hdb-a-corriger--muet{cursor:default;text-decoration:none}

/* ══ LA CARTE DE CREATION D'UN CONTACT ── MEME TRAME ORANGE que les cartes creees automatiquement : ce qui est
   en attente de verification se voit, et se voit pareil partout. */
.hdb-creation{margin-top:.6rem;padding:.5rem .6rem .6rem;border-radius:.5rem;min-width:0;
  border:1px solid var(--color-svv-amber);border-left-width:4px;background:var(--color-svv-amber-soft)}
.hdb-creation-titre{margin:0 0 .4rem;font-size:.82rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hdb-creation-champs{display:grid;gap:.45rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  min-width:0}
.hdb-creation-champ{display:flex;flex-direction:column;gap:.15rem;min-width:0}
.hdb-creation-champ input,.hdb-creation-champ select{min-height:44px;font-size:.82rem;width:100%;min-width:0}
.hdb-personne{display:flex;flex-direction:column;gap:0;min-width:0}
.hdb-personne-nom{display:flex;align-items:center;gap:.3rem;font-size:.8rem;overflow-wrap:anywhere;min-width:0}
/* 🔴 LOT HISTORIQUE-BIEN-2 — .hdb-interne EST RETIREE AVEC LA PASTILLE « nous » : notre agence n'est plus un
   groupe selectionnable (demande d'Arno), ses adresses ne figurent donc plus dans les listes de parties. Le
   nombre d'adresses ecartees est DIT sous l'interrupteur, par motAgenceEcartee. */
/* LES DEUX COMPTEURS SONT ECRITS, jamais dans une infobulle : un survol n'existe pas sur un telephone. */
.hdb-compteurs{font-size:.7rem;color:var(--color-svv-muted)}

/* ── LE RESUME DES PIECES ── */
.hdb-resume{margin:.5rem 0;min-width:0}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 5 — LE LISERE EST SUR LE BLOC, ET SUR LUI SEUL ═════════════════════════
   REGLE D'ARNO : « le lisere de couleur reste UNIQUEMENT sur le bloc qui regroupe les pieces d'un mail. Retire-le
   des miniatures elles-memes. »

   🔴 C'EST L'INVERSE DU LOT 4, et sa nouvelle regle est meilleure : un bloc de six pieces portait SEPT liseres
   de la meme couleur (un par carte, plus celui du bloc), et la couleur ne designait plus rien. Le bloc garde le
   sien — il reutilise .hdb-barre, exactement comme un mail : meme epaisseur, meme arrondi, meme jeton.

   ⚠️ LES REGLES DE TEINTE PAR VARIABLE SONT RETIREES AVEC ELLE (.hdb-grille-ton et ses six tons) : plus aucun
   element ne portait ces classes. La carte CartePieceConversation, elle, n'a jamais ete modifiee et ne l'est pas
   davantage ici — c'est tout l'interet d'avoir passe la teinte par une variable plutot que par une prop. */
.hdb-pieces .pdc-groupe{padding:.2rem .3rem}
.hdb-resume-mot{font-size:.76rem;color:var(--color-svv-muted)}
/* ══ 🔴🔴 LOT RESUME-PIECES-BOUTON-BAS — LE MEME BOUTON, A LA FIN DU RESUME, CENTRE ═════════════════════════════
   Arno : « Ajoute le MEME bouton a LA FIN du resume ouvert, CENTRE au milieu de la ligne. »

   🔴 CENTRE PAR UNE MARGE AUTOMATIQUE, et non par un conteneur de plus : le bouton est un inline-flex (il vient
   de .pdc-trombone, partage avec la fenetre d'une conversation), et lui poser une marge automatique en display
   flex le centre sans rien ajouter au document. Un div centreur aurait change la grammaire du bloc pour rien.

   ⚠️ IL GARDE EXACTEMENT L'HABILLAGE DU BOUTON DU HAUT — meme classe .pdc-trombone, donc meme fond, meme hauteur
   de cible tactile, meme survol. Seul l'alignement change, et c'est ce qu'Arno demande.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le litteral de gabarit (piege vu plus de dix fois). */
.hdb-bascule-pied{display:flex;margin:.6rem auto 0}
.hdb-resume-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.2rem 0 .4rem;
  font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.hdb-pieces{display:flex;flex-direction:column;gap:12px;min-width:0}

/* ══ LA LEGENDE DES BARRES ── discrete : un mot et une pastille, en petit, au-dessus du listing. */
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 1 — LA LIGNE QUI PORTE LE BOUTON DES PIECES ET LA LEGENDE ═══════════
   DEMANDE D'ARNO : la legende « sur la meme ligne que le bouton, ALIGNEE A DROITE ».
   ⚠️ UNE MARGE AUTOMATIQUE A GAUCHE DE LA LEGENDE, ET NON UN justify-content:space-between : sans bouton
   (un bien dont aucun mail ne porte de piece), space-between aurait colle la legende a GAUCHE. Avec la marge
   automatique, elle est a droite dans les deux cas.
   ⚠️ LE REPLI RESTE AUTORISE : sur un ecran etroit, la legende passe sous le bouton plutot que de le rogner. */
.hdb-resume-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .8rem;min-width:0}
.hdb-legende-barres{display:flex;flex-wrap:wrap;gap:.2rem .8rem;margin:.4rem 0 .3rem;font-size:.7rem;
  color:var(--color-svv-muted);min-width:0;margin-left:auto}
.hdb-legende-item{display:inline-flex;align-items:center;gap:.3rem}
/* LA PASTILLE DE LEGENDE montre les DEUX liseres, comme le mail : un seul trait aurait decrit autre chose que
   ce qu'on voit. 9 px de large pour deux traits de 3 px et leur intervalle. */
.hdb-legende-pastille{display:inline-block;width:9px;height:12px;border-radius:2px;flex:0 0 auto;
  border-left:3px solid transparent;border-right:3px solid transparent}
.hdb-legende-pastille--rouge{border-left-color:var(--color-svv-red);border-right-color:var(--color-svv-red)}
.hdb-legende-pastille--vert{border-left-color:var(--color-svv-green);border-right-color:var(--color-svv-green)}
.hdb-legende-pastille--violet{border-left-color:var(--color-svv-violet);border-right-color:var(--color-svv-violet)}
.hdb-legende-pastille--bleu{border-left-color:var(--color-svv-blue);border-right-color:var(--color-svv-blue)}
/* GRIS POINTILLE : un trait discontinu, et non un gris plein — il dit qu'il reste un geste a faire. */
.hdb-legende-pastille--gris{border-left:3px dashed var(--color-svv-line-strong);
  border-right:3px dashed var(--color-svv-line-strong)}
/* « NOUS » N'A AUCUNE COULEUR (demande d'Arno) : la pastille est donc VIDE, et le mot porte tout. */
.hdb-legende-pastille--nous{border-left-color:transparent;border-right-color:transparent}

/* ── LE FIL ── La liste exterieure porte l'ancre de « Aller au message » ET la barre de couleur. */
.hdb-liste{list-style:none;margin:0;padding:0}
.hdb-ancre{min-width:0;scroll-margin-top:12px}
/* ══ LE MAIL D'OU L'ON EST PARTI, SURLIGNE BRIEVEMENT AU RETOUR (lot HISTORIQUE-BIEN-3, point 4) ══════════════
   ⚠️ UN FOND, ET NON UNE BORDURE : les deux bords portent deja le lisere de categorie, et une troisieme couleur
   de bord se serait lue comme une categorie de plus. Le fond, lui, ne se confond avec rien. */
.hdb-ancre--surlignee{background:var(--color-svv-amber-soft);border-radius:10px}
/* ══ LES DEUX LISERES, A GAUCHE **ET** A DROITE DE CHAQUE MAIL (lot HISTORIQUE-BIEN-3, point 4) ════════════════
   DEMANDE D'ARNO : « Lisere de couleur des DEUX cotes de la capsule du mail (gauche ET droite), meme epaisseur,
   meme couleur, meme arrondi que celui d'aujourd'hui. » L'arrondi est donc symetrique, et les deux bords
   partagent la meme declaration : une seule regle, impossible de les faire diverger d'un pixel.
   ⚠️ 3 px DE CHAQUE COTE : assez pour se voir du coin de l'oeil, assez peu pour ne pas peser.
   Portes par l'enveloppe du mail : zero element de plus dans le document, et LigneVie n'est pas touchee
   (elle sert aussi la fiche d'un locataire). */
.hdb-barre{border-left:3px solid transparent;border-right:3px solid transparent;border-radius:10px}
.hdb-barre--rouge{border-left-color:var(--color-svv-red);border-right-color:var(--color-svv-red)}
.hdb-barre--vert{border-left-color:var(--color-svv-green);border-right-color:var(--color-svv-green)}
/* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LE CINQUIEME TON. Le jeton --color-svv-violet existe dans les DEUX modes
   (lot 84), avec ses contrastes mesures : rien n'est invente ici, et aucun #rrggbb n'est ecrit a la main. */
.hdb-barre--violet{border-left-color:var(--color-svv-violet);border-right-color:var(--color-svv-violet)}
.hdb-barre--bleu{border-left-color:var(--color-svv-blue);border-right-color:var(--color-svv-blue)}
.hdb-barre--gris{border-left-style:dashed;border-right-style:dashed;
  border-left-color:var(--color-svv-line-strong);border-right-color:var(--color-svv-line-strong)}
/* « nous » : AUCUNE couleur, des deux cotes. Les bords restent transparents, donc la largeur du listing ne
   saute pas d'un mail a l'autre — ce qui serait pire qu'une couleur de trop. */
.hdb-barre--nous{border-left-color:transparent;border-right-color:transparent}
/* ── REGROUPER PAR CONVERSATION ── L'objet de l'echange au-dessus de ses mails, comme un intertitre. */
.hdb-conv{margin:0 0 10px;min-width:0}
.hdb-conv-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .3rem;font-size:.8rem;
  font-weight:700;color:var(--color-svv-ink);padding-bottom:.2rem;
  border-bottom:1px solid var(--color-svv-line);overflow-wrap:anywhere}
.hdb-vide{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;min-width:0}
/* ── LA SORTIE VERS L'ECRAN PLEIN ── discrete : en bas, en petit, alignee a droite. C'est une sortie, pas une
   action : la mettre en tete aurait propose de quitter le bloc avant de l'avoir lu. */
.hdb-sortie{margin:.7rem 0 0;text-align:right;font-size:.74rem}
`;
