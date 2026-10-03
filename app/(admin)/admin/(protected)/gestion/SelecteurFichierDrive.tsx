'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// LOT DRIVE-DOSSIER-DU-BIEN — le dossier du propriétaire du bien rattaché, proposé en première position.
import {
  dossiersPrioritaires, mentionNbBiens, titreDossierPrioritaire, type BienDuMail, type DossierPrioritaire,
} from '../../../../lib/gestion/dossierDuBien';
// LOT DRIVE-VISUALISER-ET-DOSSIERS — voir un fichier sans le joindre, et créer un dossier là où l'on est.
import { ApercuFichierDrive, adresseApercu, type FichierAVoir } from './ApercuFichierDrive';
import { messageSansApercu, sorteApercu } from '../../../../lib/gestion/apercuDrive';
import { NOM_DOSSIER_MAX } from '../../../../lib/gestion/dossierNouveau';
// 🔴 LOT DRIVE-RETOUCHES-1 — la ligne de dossier qui naît dans la liste, façon Finder. Module PUR.
import {
  DUREE_ECHEC_MS, infobulleChemin, LIGNE_FERMEE, NOM_PAR_DEFAUT, ouvrirLigne, verdictNom, type LigneNeuve,
} from '../../../../lib/gestion/dossierEnLigne';
// 🔴 « Drives partagés » et « Partagés avec moi » ne sont pas des dossiers : on n'y dépose pas, et on le DIT.
import { estRegroupement } from '../../../../lib/gestion/cibleDepot';
// 🔴 LOT DRIVE-FACON-FINDER — toutes les RÈGLES du navigateur (tri, icônes, historique, sélection, menu) : module PUR.
// 🔴 LOT DRIVE-DEPLACER — la règle du déplacement, la presse-papiers et les fichiers « ._ ». Module PUR.
import {
  DUREE_ANNULATION_MS, empiler, estCoupe, estFichierSystemeMac, infobulleFichierSysteme, motColler,
  motMouvementFait, motProchaineAnnulation, MOT_FICHIER_SYSTEME, type PasAnnulable, type Presse,
} from '../../../../lib/gestion/driveDeplacement';
/**
 * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « le statut Drive des pièces vient de changer », annoncé aux AUTRES écrans.
 * Module sans I/O (aucun `pg`, aucun React) : importable d'ici sans risque pour le bundle du navigateur.
 */
import { annoncerPiecesDrive } from '../../../../lib/gestion/signalPieceDrive';
// 🔴 LOT DRIVE-DEPLACER-RAPIDE — l'écran qui répond au lâcher, et qui sait se dédire. Module PUR.
import {
  annuler as annulerLocalement, appliquer as appliquerLocalement, MOT_EN_COURS, motMouvementEnCours,
  type MouvementLocal,
} from '../../../../lib/gestion/mouvementOptimiste';
// 🔴 LOT RANGER-INSTANTANE-ET-NOM — la ligne qui paraît AU LÂCHER, et qui sait se retirer. Module PUR.
import {
  depotsVivants, FENETRE_REINJECTION_MS, fusionnerDepots, ligneProvisoire, ligneReelle, poser as poserLigne,
  remplacer as remplacerLigne, retirer as retirerLigne, type DepotConfirme,
} from '../../../../lib/gestion/depotInstantane';
// 🔴 LOT DRIVE-UNIQUE — les règles du mode « ranger », du bandeau des parents et des colonnes. Module PUR.
import {
  bandeauParents, basculerTout, colonnesVisibles, compteRenduDepot, COTE_MAX, COTE_MIN, grilleColonnes,
  largeurCote, MIME_PIECE, motColonnes, motDeposerIci, motFantome, motRangee, motToutSelectionner,
  arbreARestaurer, piecesEmportees, resumeARanger, signatureSession, titreFenetre,
  type ModeDrive, type PieceARanger, type Rangee,
} from '../../../../lib/gestion/rangementDrive';
// 🔴 LOT RENOMMER-AVANT-RANGER — le nom sous lequel une pièce partira. Module PUR, partagé avec la route.
import {
  estRenommee, INFOBULLE_RENOMMER, mentionNomOrigine, nomDeDepot,
} from '../../../../lib/gestion/renommagePiece';
/**
 * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « Supprimer » = METTRE À LA CORBEILLE DU DRIVE. Module PUR : la
 * phrase de la confirmation et les mots du compte rendu y vivent, pour que l'écran ne puisse pas en écrire une
 * plus légère que ce que le geste fait réellement.
 */
import {
  BOUTON_ANNULER_CORBEILLE, BOUTON_CONFIRMER_CORBEILLE, motCorbeilleFaite, phraseCorbeille,
} from '../../../../lib/gestion/driveCorbeille';
/**
 * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « DUPLIQUER EN VIGNETTE ». Module PUR : il tient l'identité
 * d'une vignette et ses mots. Il ne sait RIEN écrire — la copie, elle, passe par la route de déplacement, celle
 * qui porte déjà le verdict de l'archive.
 */
import {
  aideVignette, ajouterVignette, cleVignette, dejaDupliquee, motCopieRangee, resumeVignettes,
  type VignetteDupliquee,
} from '../../../../lib/gestion/vignetteDrive';
/**
 * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « OÙ EST CE DOCUMENT ? ». Module PUR : il dit ce qu'il faut
 * surligner, à chaque niveau de l'arbre, et il DIT LES LIMITES de la méthode — qui doivent se lire à l'écran, à
 * côté du compteur, et non dans une aide qu'il faudrait aller chercher.
 */
import {
  AIDE_LOUPE, bulleCompteurRange, motCompteur, phraseMethode, surlignageDe, SURLIGNAGE_VIDE,
  type Occurrence, type Surlignage,
} from '../../../../lib/gestion/localisationDrive';
import {
  aplatir, avancer, cheminCourant, cibleDeDepot, cliquerLigne, COLONNES, dateFinder, recadrerMenu,
  dossierDuChemin, fenetreVisible, flecheTri, HAUTEUR_LIGNE, HISTORIQUE_DEPART,
  iconeEntree, menuDossier, menuFichier, menuVide, motType, naviguerVers, peutAvancer, peutReculer, reculer,
  remplacerCheminCourant, SELECTION_VIDE, selectionSuivante, tailleFinder, titreDuChemin, TRI_DEFAUT,
  type ActionMenu, type Chemin, type Colonne, type DroitsPresse, type EntreeDrive, type EntreeMenu,
  type Historique, type LigneAplatie, type Selection, type Tri,
} from '../../../../lib/gestion/finderDrive';

/**
 * LOT DRIVE-FACON-FINDER — LE NAVIGATEUR DRIVE, EN PRÉSENTATION LISTE, COMME DANS LE FINDER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA DEMANDE D'ARNO, DANS SES MOTS : « la fenêtre n'a pas de croix pour la fermer, il faut l'ajouter. La
 * navigation dans notre Drive custom est beaucoup trop différente, en esthétique et en fonctionnalités, de celle du
 * Drive Google. Il faut dupliquer son esthétique et ses fonctions principales pour que l'internaute ne soit pas
 * déstabilisé en passant d'un environnement à l'autre, et privilégier la réactivité maximale au clic. »
 *
 * CE QUI A CHANGÉ : une barre de titre avec sa croix, une barre d'outils (flèches ‹ ›, titre, fil d'Ariane, loupe,
 * « ⋯ »), une barre latérale, et une LISTE à quatre colonnes triables, avec icônes par type, triangle de dépliage,
 * double-clic, barre d'espace, flèches, sélection multiple et menu contextuel.
 *
 * ⚠️ RIEN N'A ÉTÉ RETIRÉ. Recherche (dossiers puis fichiers), Récents, dossier du bien, multi-ajout sans fermeture,
 * compteur, « ✓ ajouté », Visualiser avec ses Précédent/Suivant, « Nouveau dossier » avec sa confirmation et ses
 * interdits, envoi en arrière-plan : tout est là, aux mêmes routes, avec les mêmes refus.
 *
 * ═══ 🔴🔴 DEUX GESTES, DEUX RÉGIMES, ET LA DIFFÉRENCE N'EST PAS UNE NUANCE ═══════════════════════════════════════
 *   · « Insérer un lien » ne lit RIEN : il pose l'adresse Drive et le nom dans le message. Le destinataire devra
 *     s'authentifier chez Google, qui appliquera SES droits. → proposé PARTOUT ;
 *   · « Joindre » et « Visualiser » lisent le CONTENU. → JAMAIS sous « Documents clients scannés », par aucune
 *     voie : ni la ligne, ni le double-clic, ni la barre d'espace, ni le menu contextuel, ni la sélection multiple.
 *
 * ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. C'est la route qui refuse, en remontant la chaîne des parents — un écran se
 * modifie, une route non. Ici, on explique ; là-bas, on protège.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE : il demande à l'application, qui relit le droit et interroge le Drive
 * avec un jeton qui ne quitte pas le serveur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que ce navigateur manipule est exactement ce que le module pur sait trier et décrire. */
type Fichier = EntreeDrive;

/* ══ 🔴 LOT DRIVE-DEPLACER — LES TROIS CONSTANTES DU GLISSER ═══════════════════════════════════════════════════ */

/**
 * 🔴 UN TYPE MIME À NOUS, ET RIEN D'AUTRE. Le glisser ne dépose JAMAIS `text/plain` ni `text/uri-list` : un nom de
 * fichier du cabinet lâché dans n'importe quel champ de n'importe quelle page serait une fuite silencieuse. Un
 * type inconnu du reste du monde ne se lit que chez nous.
 */
const MIME_INTERNE = 'application/x-svv-drive';

/**
 * ══ 🔴 LE « RESSORT » : UN DOSSIER SURVOLÉ LONGTEMPS SE DÉPLIE — SUR PLACE, ET JAMAIS EN Y ENTRANT ══════════════
 *
 * 🔴 CE QU'IL FAISAIT, ET POURQUOI C'ÉTAIT UN DÉFAUT (lot DRIVE-RETOUCHES-2). Il appelait `entrer()` : la vue
 * changeait de racine EN PLEIN GLISSER. Le fil d'Ariane bougeait, la liste était remplacée — donc la ligne qu'on
 * visait DISPARAISSAIT sous le curseur, et le lâcher ne tombait plus sur rien. Arno : « on n'entre jamais dans un
 * dossier pendant un glisser : ni changement de racine, ni fil d'Ariane qui bouge ».
 *
 * ⚠️ 1 200 ms, ET NON PLUS 700. Le ressort ne sert plus à NAVIGUER mais à MONTRER : on l'attend moins souvent, et
 * un déclenchement accidentel en traversant un dossier coûte un dépliage qu'on n'a pas demandé. Plus long vaut
 * mieux quand le geste est gratuit.
 */
const RESSORT_MS = 1_200;

/**
 * 🔴 LE PARENT INVENTÉ DES PIÈCES DU MAIL. `voisinsVisualisables` borne le tour « Précédent / Suivant » au MÊME
 * dossier parent : en donnant ce parent-là aux pièces reçues, elles forment un tour à elles seules, et aucun
 * fichier du Drive ne peut s'y glisser. Il ne ressemble à aucun identifiant Drive, exprès.
 */
const PARENT_PIECES = 'svv:pieces-du-mail';

/** La taille de la fenêtre, retenue d'une ouverture à l'autre. PRÉFÉRENCE LOCALE : elle ne quitte pas ce navigateur. */
const CLE_TAILLE_FENETRE = 'svv.gestion.selecteurDrive.taille';
/** La section « Récents » de la barre latérale est-elle dépliée ? Préférence LOCALE au navigateur. */
const CLE_RECENTS_OUVERTS = 'svv.gestion.selecteurDrive.recents';
/**
 * 🔴 LOT RANGER-ARBRE-2 — LA LARGEUR DE LA COLONNE DE GAUCHE. Préférence LOCALE au navigateur.
 *
 * ⚠️ UNE SEULE CLÉ POUR LES DEUX FENÊTRES (ranger et joindre), parce qu'Arno l'a demandé ainsi — « elle vaut pour
 * les deux fenêtres Drive » — et parce que c'est la même colonne : la régler d'un côté et la retrouver étroite de
 * l'autre se lirait comme un réglage qui n'a pas pris.
 */
const CLE_LARGEUR_COTE = 'svv.gestion.selecteurDrive.largeurCote';
/**
 * ══ 🔴 LES DOSSIERS DÉPLIÉS, D'UNE OUVERTURE DE LA FENÊTRE À L'AUTRE ════════════════════════════════════════════
 *
 * Arno : « garde-le aussi d'une ouverture de la fenêtre à l'autre, dans la même session du navigateur ».
 *
 * ⚠️ `sessionStorage` ET NON `localStorage`, ET C'EST LE MOT « SESSION » QUI TRANCHE : un arbre déplié est le
 * contexte d'un travail en cours, pas une préférence. Le retrouver le lendemain, sur un Drive réorganisé entre
 * temps, ne rendrait service à personne — et laisserait quinze dossiers ouverts qu'on n'a pas demandés.
 *
 * ⚠️ BORNÉ À 200 IDENTIFIANTS : sans borne, une longue session d'exploration écrirait des milliers d'entrées dans
 * un stockage qui n'en veut pas.
 */
const CLE_DEPLIES = 'svv.gestion.selecteurDrive.deplies';
const DEPLIES_MAX = 200;
/**
 * ══ 🔴🔴 LOT DRIVE-FERME — POUR QUELLES PIÈCES L'ARBRE A-T-IL ÉTÉ RETENU ? ═════════════════════════════════════
 *
 * DÉCISION D'ARNO (02/10/2026, option « b »), après qu'il a constaté l'arbre à moitié déplié à l'ouverture :
 * « La mémorisation est gardée, mais restaurée uniquement si l'on rouvre la fenêtre pour les MÊMES pièces. Dès
 * que les pièces changent (nouvelle session de classement), l'arbre repart entièrement fermé. »
 *
 * 🔴 CETTE CLÉ EST CE QUI REND LES DEUX RÈGLES COMPATIBLES. Celle du 29/09 (« garde-le d'une ouverture à
 * l'autre ») n'est pas retirée : elle est BORNÉE au travail en cours. Sans cette seconde clé, le stockage savait
 * QUELS dossiers étaient ouverts, mais pas POUR QUOI — et ne pouvait donc pas répondre à la question d'Arno.
 *
 * ⚠️ `sessionStorage` COMME SA JUMELLE, et pour la même raison : c'est un contexte de travail, pas une préférence.
 */
const CLE_SESSION = 'svv.gestion.selecteurDrive.session';

/**
 * ══ 🔴 POURQUOI UN CLIC SUR UN DOSSIER ATTEND 220 ms AVANT DE LE DÉPLIER ════════════════════════════════════════
 *
 * Arno veut les deux gestes : « un clic sur le triangle, ou sur le nom, le déplie sous lui » ET « double-clic sur
 * un dossier : il devient la racine de la vue ». Ils se marchent dessus — un double-clic COMMENCE par un clic.
 *
 * 🔴 CE QUI SE PASSAIT SANS CE DÉLAI, ET QUI A ÉTÉ VU À L'ÉCRAN : le premier clic dépliait (ou repliait), la liste
 * changeait SOUS LE CURSEUR entre les deux temps du double-clic, et celui-ci se perdait — le dossier ne s'ouvrait
 * pas, sans que rien ne l'explique. Le geste marchait une fois sur deux, selon l'état du dossier visé.
 *
 * ⚠️ LE TRIANGLE, LUI, RESTE INSTANTANÉ. C'est le geste explicite « déplie-moi ça » : rien ne le dispute, donc
 * rien ne doit le retarder. Le délai ne coûte que là où l'ambiguïté existe, et 220 ms est sous le seuil où l'œil
 * lit une attente.
 */
const DELAI_DEPLIAGE_MS = 220;

/** Le minimum dont la route a besoin : elle relit tout chez Google de toute façon. */
function fichierMinimal(o: { id: string; nom?: string; dossier?: boolean }): Fichier {
  return {
    id: o.id, nom: o.nom ?? '', typeMime: '', tailleOctets: null, modifieLe: null, lien: null,
    dossier: o.dossier === true,
  };
}

/** Une liste chargée, avec ce que la route dit des droits à cet endroit. */
interface Listing {
  fichiers: Fichier[];
  dossiers: Fichier[];
  joindreAutorise: boolean;
  motifRefus: string | null;
  creerAutorise: boolean;
  motifCreation: string | null;
  recherche: boolean;
  /**
   * 🔴 LA LISTE EST-ELLE INCOMPLÈTE ? Un dossier de plus de mille entrées atteint la borne de lecture. On le DIT :
   * jusqu'à ce lot, un dossier de plus de 200 entrées était tronqué en SILENCE, et l'on croyait avoir tout vu.
   */
  tronque: boolean;
  /**
   * 🔴 LOT RANGER-ARBRE-2 — LE VRAI CHEMIN DU DOSSIER, du haut jusqu'à lui, tel que le serveur l'a remonté.
   * Vide quand il n'y en a pas (la racine, un regroupement, une recherche) : l'écran garde alors ce qu'il a.
   */
  chaine: { id: string; nom: string }[];
}

type Vue =
  | { v: 'charge' }
  | ({ v: 'ok' } & Listing)
  | { v: 'indisponible'; message: string };

/**
 * ══ 🔴 LOT DRIVE-RETOUCHES-1 — LE FORMULAIRE A LAISSÉ LA PLACE À UNE LIGNE ══════════════════════════════════
 * L'état de la création vit désormais dans `dossierEnLigne.ts` (module PUR) : une ligne qui naît dans la liste,
 * s'édite sur place, et disparaît si l'on renonce. L'encadré de ce module dit ce que ce changement coûte — la
 * confirmation du chemin complet — et par quoi il est remplacé : on ne lit plus le chemin, on le VOIT.
 */

/** Une entrée de l'historique « Récents », telle que la route la rend. */
interface Recent {
  sorte: 'drive_fichier' | 'drive_dossier' | 'locale';
  cle: string;
  libelle: string;
  detail: string | null;
  tailleOctets: number | null;
}

export interface ChoixFichierDrive {
  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — ON NE TRANSPORTE PLUS LES OCTETS ═══════════════════════════════════════════
   * On ne passe que l'IDENTIFIANT. Le serveur lit les métadonnées (un appel court), inscrit la pièce, et tire les
   * octets en tâche de fond. Le « Joindre » suivant est cliquable immédiatement.
   */
  drive?: { fichierId: string; nom: string; dossierId: string | null; dossierNom: string | null };
  /** Le lien inséré : rien n'a été lu du contenu. */
  lien?: { nom: string; url: string };
}

/**
 * Ce que le menu contextuel vise : une ligne, ou LE VIDE.
 *
 * 🔴 LE VIDE EST UNE CIBLE À PART ENTIÈRE (lot DRIVE-RETOUCHES-1). Sans lui, un clic droit entre deux lignes
 * ouvrait le menu de CHROME — qui propose « Recharger », c'est-à-dire recharger toute l'application : fenêtre
 * fermée, sélection perdue, mémoire tampon vidée, brouillon en cours emporté. Ce n'était pas une lacune de
 * confort, c'était un piège.
 */
type CibleMenu = { x: number; y: number; entree: Fichier | null };

/**
 * 🔴 LOT DRIVE-UNIQUE — UN DOSSIER OÙ L'ON A DÉJÀ DÉPOSÉ, tel que la route `drive/dossiers` le rend depuis le lot
 * 5-PJ-D. Il porte son CHEMIN (deux « Documents » ne se distinguent que par là) et la date du dernier dépôt.
 *
 * ⚠️ C'EST LA MÊME ROUTE QU'AVANT, ET LE MÊME CALCUL : le panneau en ligne disparaît, sa meilleure idée reste.
 */
interface DossierRecent {
  id: string;
  nom: string;
  chemin: string;
  dernierDepot: string;
}

export function SelecteurFichierDrive({
  onChoisir, onFermer, filId = null, lots = [],
  mode = 'joindre', messageId = null, pieces = [], onRangement, dossierDepart = null,
  documentEnEvidence = null,
}: {
  /**
   * Ajoute la pièce au brouillon. ⚠️ NE FERME PAS la fenêtre : c'est « Terminé » ou la croix qui ferme.
   * ⚠️ INUTILISÉ EN MODE « ranger » — on n'y prend rien, on y pose.
   */
  onChoisir?: (c: ChoixFichierDrive) => void | Promise<void>;
  onFermer: () => void;
  /**
   * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — de quoi savoir à quel(s) bien(s) ce mail est relié.
   * Les deux absents ⇒ aucune entrée « Dossier du bien », et le navigateur est le même pour tout le reste.
   * 🔴 LOT DRIVE-UNIQUE — `filId` sert AUSSI, dans les deux modes, à mettre en tête « le dernier dossier utilisé
   *    pour cet échange » : c'est presque toujours la bonne réponse, et c'était déjà la promesse du panneau qu'on
   *    remplace.
   */
  filId?: number | null;
  lots?: readonly string[];
  /* ══ 🔴🔴 LOT DRIVE-UNIQUE — LE SECOND USAGE ════════════════════════════════════════════════════════════════
     Arno : « je veux le même système que la fenêtre Drive façon Finder, partout où on y fait appel ». Ranger une
     pièce reçue ouvre donc CETTE fenêtre, et non plus un panneau en ligne qui réinventait la moitié du Drive. */
  mode?: ModeDrive;
  /** Le message dont on range les pièces. Requis en mode « ranger », ignoré en mode « joindre ». */
  messageId?: number | null;
  /** Les pièces à ranger, telles que l'écran du message les connaît déjà. */
  pieces?: readonly PieceARanger[];
  /** Appelé après chaque rangement réussi : l'écran du message relit ses dépôts et affiche « Dans le Drive ». */
  /**
   * 🔴 LOT RANGER-INSTANTANE-ET-NOM — `nomChange` DIT QUE LA BASE VIENT DE CHANGER DE NOM. L'écran appelant s'en
   * sert pour relire le fil : une pièce renommée au stylo puis rangée doit porter son nouveau nom PARTOUT tout de
   * suite, et pas seulement dans cette fenêtre-ci.
   */
  onRangement?: (o?: { nomChange?: boolean }) => void;
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — OÙ LA FENÊTRE S'OUVRE ══════════════════════════════
   *
   * Arno : « ouvre NOTRE outil Drive, positionné DIRECTEMENT dans le dossier Drive du bien (arbre déplié jusqu'à
   * lui) ». `null` (le défaut) ⇒ la racine, c'est-à-dire exactement le comportement d'avant ce lot pour les trois
   * appelants existants.
   *
   * 🔴 LE NOM SERT D'ATTENTE, PAS DE VÉRITÉ. On part sur un chemin d'UN SEUL cran — `[{ id, nom }]` —, et le
   * serveur rend la CHAÎNE complète des parents avec son listing : `remplacerCheminCourant` réécrit alors
   * l'endroit sans empiler un pas de plus, et le fil d'Ariane se déplie jusqu'au dossier. C'est le mécanisme du
   * lot RANGER-ARBRE-2, celui des raccourcis « Récents » et « Dossier du bien » — on n'en ajoute pas un second.
   */
  dossierDepart?: { id: string; nom: string } | null;
  /**
   * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LE DOCUMENT À METTRE EN ÉVIDENCE À L'OUVERTURE ══════════════
   *
   * Arno : « ouvre notre fenêtre Drive, positionnée dans le dossier qui contient le document, arbre déplié
   * jusqu'à lui, LE FICHIER MIS EN ÉVIDENCE (même repère que la loupe) ».
   *
   * 🔴 « MÊME REPÈRE QUE LA LOUPE » EST PRIS AU PIED DE LA LETTRE : on allume l'état de la loupe, avec la même
   * route et le même surlignage. Un second mécanisme de mise en évidence aurait donné deux dessins pour la même
   * idée — et il aurait fallu les faire vivre ensemble, dans le même arbre.
   *
   * ⚠️ C'EST LE DOCUMENT, PAS LE DOSSIER : `dossierDepart` dit OÙ l'on se pose, celui-ci dit QUOI chercher. Les
   * deux vont ensemble ici, mais ils répondent à deux questions, et une pièce dont on ignore le dossier peut
   * encore être mise en évidence là où on la croise.
   */
  documentEnEvidence?: { driveFileId: string } | null;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  /**
   * 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — ON PART LÀ OÙ L'ON NOUS ENVOIE. L'endroit de départ
   * est posé dès l'INITIALISATION, et non par un effet : un effet aurait montré la racine le temps d'un rendu,
   * c'est-à-dire un clignotement au moment précis où l'on veut voir le dossier du bien.
   *
   * ⚠️ LE PREMIER CRAN RESTE LA RACINE dans la pile : « ‹ » remonte donc au Drive entier, comme partout ailleurs.
   */
  const [histo, setHisto] = useState<Historique>(() => (dossierDepart === null
    ? HISTORIQUE_DEPART
    : naviguerVers(HISTORIQUE_DEPART, [{ id: dossierDepart.id, nom: dossierDepart.nom }])));
  /** Le dossier à charger au montage, figé une fois : la fenêtre ne doit pas repartir ailleurs à un rendu de plus. */
  const departInitial = useRef<string>(dossierDepart?.id ?? '');
  const [tri, setTri] = useState<Tri>(TRI_DEFAUT);
  const [selection, setSelection] = useState<Selection>(SELECTION_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  /** 🔴 LES FICHIERS DÉJÀ AJOUTÉS pendant cette ouverture : par identifiant Drive, donc sans doublon possible. */
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  const [loupeOuverte, setLoupeOuverte] = useState(false);
  const [recents, setRecents] = useState<{ lignes: Recent[]; disponible: boolean } | null>(null);
  const [montrerRecents, setMontrerRecents] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState<string | null>(null);
  const [prioritaires, setPrioritaires] = useState<DossierPrioritaire[]>([]);
  const [aVoir, setAVoir] = useState<FichierAVoir | null>(null);
  /**
   * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LES NOMS CHOISIS, PAR PIÈCE ═══════════════════════════════════════════
   *
   * Demande d'Arno : « le nom choisi est conservé tant que la fenêtre “Ranger” reste ouverte ».
   *
   * 🔴 ILS VIVENT ICI, ET NULLE PART AILLEURS. Pas en base : rien n'est décidé tant qu'on n'a pas déposé, et un
   * nom écrit en base avant le dépôt serait une promesse qu'on ne tient peut-être jamais. Pas dans l'aperçu non
   * plus : il s'ouvre et se ferme, alors que le nom doit survivre à dix allers-retours. La fenêtre « Ranger »
   * est le seul endroit dont la durée de vie correspond exactement à celle du choix.
   *
   * ⚠️ LA CLÉ EST L'IDENTIFIANT DE PIÈCE, jamais son nom : deux pièces d'un même mail peuvent porter le même
   * nom, et les confondre renommerait la mauvaise.
   */
  const [nomsChoisis, setNomsChoisis] = useState<ReadonlyMap<number, string>>(new Map());
  /** La pièce dont l'aperçu doit s'ouvrir DIRECTEMENT sur le champ (arrivée par le stylo). */
  const [renommerDabord, setRenommerDabord] = useState<number | null>(null);
  /** La ligne de dossier en cours de création, s'il y en a une. */
  const [ligneNeuve, setLigneNeuve] = useState<LigneNeuve>(LIGNE_FERMEE);
  const [motDeLaCreation, setMotDeLaCreation] = useState<string | null>(null);
  const [menu, setMenu] = useState<CibleMenu | null>(null);
  /**
   * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LA POSE RECADRÉE DU MENU, une fois sa taille MESURÉE. `null` = pas encore
   * mesuré : le menu est alors rendu invisible, le temps d'un rendu, pour qu'on ne le voie pas sauter.
   */
  const cadreMenu = useRef<HTMLUListElement | null>(null);
  const [poseMenu, setPoseMenu] = useState<{ x: number; y: number } | null>(null);
  const [outils, setOutils] = useState(false);
  /**
   * 🔴 LE DÉPLIAGE SUR PLACE : les dossiers ouverts, et leurs enfants déjà lus.
   *
   * ⚠️ RELU À L'INITIALISATION, sous try/catch : la fenêtre se rouvre sur l'arbre qu'on avait laissé. C'est un
   * état, pas une préférence — d'où `sessionStorage`, qui meurt avec l'onglet.
   */
  /**
   * 🔴🔴 LOT DRIVE-FERME — LA SIGNATURE DE CETTE SESSION DE CLASSEMENT, calculée une fois pour toutes.
   *
   * ⚠️ `useMemo` SUR LES PIÈCES, et non à chaque rendu : la signature sert de clé d'écriture dans le stockage, et
   * la recalculer à l'identique à chaque frappe ferait réécrire le stockage pour rien.
   */
  const signature = useMemo(
    () => signatureSession({ mode, messageId, pieces }), [mode, messageId, pieces]);
  const [ouverts, setOuverts] = useState<Set<string>>(() => {
    try {
      /**
       * 🔴🔴 ON NE RESTAURE QUE POUR LES MÊMES PIÈCES (décision d'Arno du 02/10/2026). Des pièces NEUVES ouvrent
       * une nouvelle session de classement : l'arbre repart entièrement fermé, « rien n'est déplié d'avance ».
       *
       * ⚠️ UNE SIGNATURE ABSENTE VAUT « NON » : c'est ce qu'a écrit une version d'avant ce lot, qui ne savait pas
       * pour quelles pièces elle retenait l'arbre. Dans le doute, fermé.
       */
      const retenue = globalThis.sessionStorage?.getItem(CLE_SESSION) ?? null;
      if (!arbreARestaurer(retenue, signatureSession({ mode, messageId, pieces }))) return new Set();
      const brut = globalThis.sessionStorage?.getItem(CLE_DEPLIES) ?? null;
      const lus = brut === null ? [] : (JSON.parse(brut) as unknown);
      return new Set(Array.isArray(lus) ? lus.filter((x): x is string => typeof x === 'string') : []);
    } catch { return new Set(); }
  });
  const [enfants, setEnfants] = useState<Map<string, Fichier[]>>(new Map());
  /* ══ 🔴🔴 LOT DRIVE-DEPLACER ═══════════════════════════════════════════════════════════════════════════════
     Décision d'Arno : l'application peut désormais DÉPLACER et COPIER dans le Drive. Elle ne supprime, ne renomme,
     ne met à la corbeille et ne partage toujours RIEN. */
  /** La presse-papiers, INTERNE à l'application : elle ne touche jamais au presse-papiers du système. */
  const [presse, setPresse] = useState<Presse | null>(null);
  /** Ce qui est en train d'être glissé. `null` = aucun glisser en cours. */
  const [glisse, setGlisse] = useState<{ ids: string[]; nom: string } | null>(null);
  /** La cible sous le curseur, et où l'afficher : « → Déposer dans « X » », là où l'œil est déjà. */
  const [cibleNommee, setCibleNommee] = useState<{ nom: string; x: number; y: number } | null>(null);
  /**
   * 🔴 LA PILE DES DÉPLACEMENTS DE CETTE FENÊTRE. Un lot = un pas ; chaque clic sur « ↶ Annuler le dernier
   * déplacement » en défait un, et l'on peut remonter. Les COPIES n'y entrent jamais : les annuler voudrait dire
   * les supprimer, et l'application ne supprime rien.
   */
  const [pileAnnulation, setPileAnnulation] = useState<PasAnnulable[]>([]);
  /** Le dossier survolé pendant un glisser — celui qui s'allume. */
  const [survole, setSurvole] = useState<string | null>(null);
  /** Le bandeau « N élément(s) déplacé(s) vers X — Annuler ». `null` = rien à annoncer. */
  /**
   * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — `sorte` DIT QUELLE ROUTE L'« Annuler » DU BANDEAU DOIT
   * APPELER. Sans elle, le bouton aurait demandé un DÉPLACEMENT pour défaire une mise à la corbeille : la route
   * de déplacement aurait cherché un parent d'origine dans des lignes qu'elle ne retient pas, et l'annulation
   * aurait échoué en silence juste au moment où l'on en a le plus besoin.
   *
   * ⚠️ ABSENT ⇒ `'deplacer'` : tout ce qui existait avant ce lot se comporte à l'identique.
   */
  const [bandeau, setBandeau] = useState<
    { mot: string; mouvements: number[]; sorte?: 'deplacer' | 'corbeille' } | null
  >(null);
  /** La confirmation d'une copie de dossier, et ce qu'elle annonce. */
  const [confirmation, setConfirmation] = useState<{ phrase: string; agir: () => void } | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
  /** La fenêtre elle-même : on lui rend la taille qu'elle avait la dernière fois. */
  const cadre = useRef<HTMLDivElement | null>(null);
  /** Le minuteur qui ouvre un dossier après un survol prolongé pendant le glisser (le « spring-loading » du Finder). */
  const ressort = useRef<{ id: string; minuteur: ReturnType<typeof setTimeout> } | null>(null);
  /** Le dépliage en attente : un double-clic l'annule avant qu'il ne change la liste sous le curseur. */
  const depliageEnAttente = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 🔴🔴 CE QU'ON TIENT, EN RÉFÉRENCE — parce que l'ÉTAT arrive trop tard. Voir l'encadré de `survolerCible` :
   * `setGlisse` n'est pas appliqué avant la fin du gestionnaire de `dragstart`, si bien que le premier `dragover`
   * refusait la cible et que Chrome n'émettait jamais le `drop`.
   */
  /**
   * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — UNE TROISIÈME SORTE : LA VIGNETTE DUPLIQUÉE. Elle ne peut pas
   * voyager comme une pièce (elle n'a pas de `pieceId`) ni comme un élément du Drive (son lâcher doit COPIER, pas
   * déplacer). Un type à part, donc, et un `MIME` à part : confondre les deux aurait fait DÉPLACER un fichier du
   * cabinet là où l'on croyait en poser une copie.
   */
  const enMainRef = useRef<
    { sorte: 'drive'; ids: string[] } | { sorte: 'piece'; pieceIds: number[] }
    | { sorte: 'vignette'; cles: string[] } | null
  >(null);
  /** Le type de transfert des vignettes. À NOUS, comme `MIME_PIECE` : rien ne sort de l'application. */
  const MIME_VIGNETTE = 'application/x-svav-vignette-drive';
  /** Les dossiers dépliés PAR LE RESSORT pendant ce glisser : on les referme si le geste est abandonné. */
  const depliagesDuGlisser = useRef<Set<string>>(new Set());
  /**
   * 🔴 LE DERNIER MOUVEMENT, pour que « Annuler » sache quoi remettre où SANS attendre la route. La route reste
   * la seule à décider (elle relit le parent d'origine dans le journal) ; ceci ne sert qu'à l'affichage.
   */
  const dernierMouvement = useRef<MouvementLocal | null>(null);
  /** Le nom proposé de la ligne neuve a-t-il DÉJÀ été sélectionné ? Voir l'encadré du champ : le piège est réel. */
  const nomDejaChoisi = useRef(false);
  /** De quelles listes chaque élément a été retiré : c'est là, et nulle part ailleurs, qu'un refus le remet. */
  const retiresDe = useRef<Map<string, string[]>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [hauteurVue, setHauteurVue] = useState(600);
  /* ══ 🔴🔴 LOT DRIVE-UNIQUE ═════════════════════════════════════════════════════════════════════════════════ */
  /** Où chaque pièce a été rangée, par identifiant de pièce. Une pièce peut être rangée PLUSIEURS fois, ailleurs. */
  const [rangees, setRangees] = useState<Map<number, Rangee>>(new Map());
  /** Les pièces dont le dépôt est en cours : leur ligne le dit, et on ne le relance pas deux fois. */
  const [rangementEnCours, setRangementEnCours] = useState<Set<number>>(new Set());
  /** Les pièces qu'on est en train de glisser. Vide = aucune. */
  const [piecesGlissees, setPiecesGlissees] = useState<readonly PieceARanger[]>([]);
  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — LES PIÈCES COCHÉES ═══════════════════════════════════════════════════════════
   * Arno : « Case à cocher par pièce, plus Cmd+clic et Maj+clic, plus “Tout sélectionner”. »
   *
   * ⚠️ C'EST LA MÊME `Selection` QUE LA LISTE DU DRIVE, et le même `cliquerLigne` : ⌘ ajoute, ⇧ étend depuis
   * l'ancre, un clic nu remplace. Écrire une seconde fois ces trois règles aurait produit deux comportements
   * voisins mais différents dans une même fenêtre — exactement ce qui rend une interface impossible à apprendre.
   */
  /**
   * ══ 🔴🔴 LOT FIL-APERCU-MINIATURES — TOUTES LES PIÈCES SONT COCHÉES À L'OUVERTURE ═══════════════════════════
   *
   * Demande d'Arno : « à l'ouverture de “Ranger N pièces dans le Drive”, toutes les pièces du mail sont cochées ».
   *
   * 🔴 C'EST LE GESTE LE PLUS FRÉQUENT QUI DEVIENT LE DÉFAUT. On ouvre cette fenêtre en tenant les pièces d'un
   * mail, et neuf fois sur dix on les range TOUTES au même endroit : partir de rien obligeait à cocher trois
   * cases avant de pouvoir faire le geste qu'on était venu faire.
   *
   * ⚠️ LUE À L'INITIALISATION, PAS DANS UN EFFET : cocher après coup ferait un rendu à vide, donc un clignotement
   * des cases à chaque ouverture — et le compilateur React refuse le `setState` synchrone dans un effet.
   * ⚠️ ET LA SUITE EST INCHANGÉE : une pièce rangée se décoche (voir `rangerLot`), « Tout sélectionner » devient
   * « Tout désélectionner » tant que tout est coché (`motToutSelectionner`), et saisir une pièce hors sélection
   * n'emporte qu'elle. Rien de ce que le lot précédent a posé n'est défait.
   */
  const [choixPieces, setChoixPieces] = useState<Selection>(
    () => (pieces.length === 0 ? SELECTION_VIDE : { ids: pieces.map((x) => String(x.pieceId)), ancre: null }),
  );
  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — LA LARGEUR DE LA COLONNE DE GAUCHE ═══════════════════════════════════════════
   * Arno : « Une poignée verticale […] permet de glisser pour élargir ou réduire la colonne, avec un minimum et
   * un maximum raisonnables. Double-clic sur la poignée = largeur par défaut. La largeur est mémorisée. »
   *
   * ⚠️ LUE À L'INITIALISATION, PAS DANS UN EFFET : la poser après coup ferait un rendu à la largeur d'avant, donc
   * un saut visible à chaque ouverture — et le compilateur React refuse le `setState` synchrone dans un effet.
   * ⚠️ TOUT EST SOUS `try/catch` : un navigateur qui refuse le stockage local doit ouvrir la fenêtre quand même.
   */
  const [largeurCoteVue, setLargeurCoteVue] = useState<number>(() => {
    try {
      /* ⚠️ `Number(null)` VAUT ZÉRO, PAS `NaN`, et c'est exactement le piège : lire une préférence ABSENTE
         donnait 0, que les bornes ramenaient au MINIMUM — la colonne s'ouvrait donc étroite chez quelqu'un
         qui n'avait jamais touché la poignée, au lieu de garder la largeur d'avant. Attrapé par l'épreuve. */
      const brut = globalThis.localStorage?.getItem(CLE_LARGEUR_COTE) ?? '';
      return largeurCote(brut === '' ? null : Number(brut));
    } catch { return largeurCote(null); }
  });
  /** La poignée est-elle en train d'être tirée ? Sert à figer le curseur et à empêcher la sélection de texte. */
  const [tireLaPoignee, setTireLaPoignee] = useState(false);
  /** 🔴 « Par défaut, Nom + Taille seulement » (Arno) : la place gagnée sert à voir trois dossiers ouverts. */
  const [compact, setCompact] = useState(true);
  /** Le « … » du bandeau est-il déplié ? Ce qui est caché est COMPTÉ, jamais perdu. */
  const [cheminEntier, setCheminEntier] = useState(false);
  /**
   * La section « Récents » est-elle dépliée ? Ouverte par défaut, et la préférence est retenue.
   *
   * ⚠️ LUE À L'INITIALISATION, PAS DANS UN EFFET. La replier après coup ferait un rendu pour rien — et le
   * compilateur React le refuse (« setState synchrone dans un effet »). Ici l'état NAÎT juste.
   */
  const [recentsOuverts, setRecentsOuverts] = useState<boolean>(() => {
    try { return globalThis.localStorage?.getItem(CLE_RECENTS_OUVERTS) !== '0'; }
    catch { return true; }
  });
  /** Les lignes dont le déplacement est en vol : elles portent l'indicateur discret « en cours ». */
  const [enMouvement, setEnMouvement] = useState<Set<string>>(new Set());
  /** Le dernier dossier utilisé pour cet échange, et les dossiers récents de dépôt — datés. */
  const [depots, setDepots] = useState<{ dernier: DossierRecent | null; recents: DossierRecent[] }>(
    { dernier: null, recents: [] },
  );

  /**
   * 🔴 LE SEUL POINT QUI PARLE AU BROUILLON, et il n'a de sens qu'en mode JOINDRE. En mode RANGER il n'y a pas de
   * message à remplir : l'appeler serait une faute de programmation, et le silence ici la rend inoffensive plutôt
   * que fatale. Les gestes qui y mènent (Joindre, Insérer un lien) sont de toute façon absents de ce mode-là.
   */
  const choisir = async (c: ChoixFichierDrive): Promise<void> => {
    if (onChoisir === undefined) return;
    await onChoisir(c);
  };

  /** ⚠️ `lots` est un tableau LITTÉRAL côté appelant : le suivre relancerait la lecture à chaque rendu.
   *  Sa clé, elle, ne change qu'avec son contenu — et elle se vérifie statiquement. */
  const clesLots = lots.join(',');
  const chemin = cheminCourant(histo);
  const dossierCourant = chemin.at(-1) ?? null;
  /** 🔴 Les deux parents et le dossier courant. Déplié, le bandeau rend le chemin entier — d'où le 99. */
  const parents = bandeauParents(chemin, cheminEntier ? 99 : undefined);
  /**
   * 🔴 LOT RANGER-ARBRE-2 — CE QU'IL Y A D'UN CRAN AU-DESSUS. À la profondeur 1, c'est la racine du sélecteur
   * (« Google Drive », ses trois regroupements) : on peut y REMONTER, mais on n'y DÉPOSE pas — ce n'est pas un
   * dossier, et Google refuserait après coup. D'où deux valeurs et non une : le nom, et la cible s'il y en a une.
   */
  const parentDuChemin = chemin.length >= 2 ? chemin[chemin.length - 2] : null;
  const nomDuParent = parentDuChemin?.nom ?? 'Google Drive';
  const cibleDuParent = parentDuChemin !== null && !estRegroupement(parentDuChemin.id)
    ? { id: parentDuChemin.id, nom: parentDuChemin.nom }
    : null;
  /** Les colonnes montrées, et la grille qu'en-tête et lignes doivent partager EXACTEMENT. */
  const colonnes = colonnesVisibles(compact, COLONNES.map((c) => c.cle));
  const grille = { gridTemplateColumns: grilleColonnes(colonnes) };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 RÉACTIVITÉ — LE CACHE DES LISTINGS, ET L'ANNULATION
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     Demande d'Arno : « retour visuel immédiat (moins de 100 ms) à chaque clic », « cache des listings déjà vus
     (retour arrière instantané) », « requêtes annulées quand on change de dossier ».

     🔴 UN DOSSIER DÉJÀ VU S'AFFICHE SANS ATTENDRE, puis se rafraîchit en silence. Montrer d'abord ce qu'on sait
     est ce qui distingue « instantané » de « rapide » : le Drive du cabinet met 300 ms à 1,5 s à répondre, et ces
     300 ms suffisent à donner l'impression d'un écran qui rame.

     ⚠️ LE RAFRAÎCHISSEMENT SILENCIEUX N'EFFACE JAMAIS L'ÉCRAN : il remplace la liste quand la réponse arrive, et
     seulement si l'on est toujours au même endroit. Sinon, changer vite de dossier ferait revenir le contenu du
     précédent par-dessus le nouveau.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  /**
   * ══ 🔴🔴 LOT RANGER-ET-NOM-FIABLES — LES DÉPÔTS CONFIRMÉS, QU'AUCUNE LISTE PÉRIMÉE N'EFFACE ═══════════════
   *
   * Voir l'encadré de `fusionnerDepots` : Google met environ 3,8 s à faire paraître un fichier neuf dans
   * `files.list`, et la revalidation silencieuse partait dans la seconde. Elle rendait donc une liste SANS le
   * fichier, et effaçait la ligne qu'on venait de poser — d'où « il faut fermer puis rouvrir la fenêtre », et
   * d'où l'intermittence (au second essai, Google avait rattrapé).
   *
   * ⚠️ UNE `ref`, ET NON UN ÉTAT : cette trace ne doit JAMAIS provoquer de rendu par elle-même. Elle est lue au
   * moment où une liste arrive, et c'est cette liste-là qui déclenche le rendu.
   */
  const depotsConfirmes = useRef<DepotConfirme[]>([]);
  const cache = useRef<Map<string, Listing>>(new Map());
  const enVol = useRef<AbortController | null>(null);
  /** L'endroit qu'on est en train de charger : une réponse qui n'est plus la sienne est jetée. */
  const attendu = useRef<string>('');

  const lireListing = useCallback(async (
    dossierId: string, signal: AbortSignal,
  ): Promise<Listing | { erreur: string }> => {
    const res = await fetch(`/api/admin/gestion/drive/fichiers?dossier=${encodeURIComponent(dossierId)}`,
      { cache: 'no-store', signal });
    const d = (await res.json()) as {
      etat?: string; message?: string; fichiers?: Fichier[]; joindreAutorise?: boolean; motifRefus?: string | null;
      creerAutorise?: boolean; motifCreation?: string | null; tronque?: boolean;
      chaine?: { id: string; nom: string }[];
    };
    if (d.etat !== 'ok') return { erreur: d.message ?? 'Drive indisponible.' };
    /**
     * 🔴🔴 LE POINT DE PASSAGE UNIQUE. Toute liste reçue — premier affichage, préchargement au survol, dépliage
     * d'un sous-niveau, revalidation silencieuse — passe par ici. Y réinjecter les dépôts confirmés couvre donc
     * TOUS les chemins d'un coup, y compris le dossier qu'on n'avait pas encore ouvert au moment du lâcher.
     *
     * ⚠️ LE FAIRE DANS CHAQUE APPELANT AURAIT LAISSÉ UN TROU : il y en a quatre, et il suffit d'en oublier un
     * pour que le défaut revienne, intermittent, sur ce chemin-là seulement.
     */
    const maintenant = Date.now();
    depotsConfirmes.current = depotsVivants(depotsConfirmes.current, maintenant);
    const fichiers = fusionnerDepots(d.fichiers ?? [], dossierId, depotsConfirmes.current, maintenant);
    return {
      fichiers, dossiers: [],
      joindreAutorise: d.joindreAutorise !== false,
      motifRefus: d.motifRefus ?? null,
      // ⚠️ `=== true` et non `!== false` : un serveur qui ne dirait rien ne doit pas laisser croire qu'on peut
      //   créer. Le défaut, pour une ÉCRITURE, est « non » — l'inverse de ce qu'on fait pour une lecture.
      creerAutorise: d.creerAutorise === true,
      motifCreation: d.motifCreation ?? null,
      recherche: false,
      tronque: d.tronque === true,
      chaine: (d.chaine ?? []).filter((e) => typeof e?.id === 'string' && typeof e?.nom === 'string'),
    };
  }, []);

  const charger = useCallback(async (dossierId: string) => {
    attendu.current = dossierId;
    enVol.current?.abort();
    const ctrl = new AbortController();
    enVol.current = ctrl;
    setErreur(null);
    setScrollTop(0);
    const connu = cache.current.get(dossierId);
    // ① CE QU'ON SAIT DÉJÀ, TOUT DE SUITE. ② Puis la vérité, en silence.
    if (connu !== undefined) setVue({ v: 'ok', ...connu });
    else setVue({ v: 'charge' });
    try {
      const r = await lireListing(dossierId, ctrl.signal);
      if (attendu.current !== dossierId) return;
      if ('erreur' in r) { if (connu === undefined) setVue({ v: 'indisponible', message: r.erreur }); return; }
      cache.current.set(dossierId, r);
      setVue({ v: 'ok', ...r });
      /**
       * ══ 🔴🔴 LOT RANGER-ARBRE-2 — ON APPREND OÙ L'ON EST, ET L'ON RÉÉCRIT LE CHEMIN ════════════════════════
       *
       * CONSTAT D'ARNO : un dossier ouvert depuis « Récents » affichait « Google Drive › Drive », sans ses
       * parents — donc sans aucun moyen de remonter. Un raccourci ne connaît qu'un identifiant : le chemin
       * d'entrée fait UN seul cran, et le fil d'Ariane ne peut pas inventer ce qu'on ne lui a pas dit.
       *
       * 🔴 LE SERVEUR, LUI, LE SAIT — il vient de remonter toute la chaîne pour rendre son verdict. On remplace
       * donc l'endroit courant par le chemin COMPLET, sans empiler un pas de plus : on n'a pas navigué, on a
       * appris. Le geste vaut pour TOUS les points d'entrée — Récents, Dossier du bien, recherche.
       *
       * ⚠️ `remplacerCheminCourant` refuse si l'endroit a changé entre-temps : une réponse en retard ne doit
       * jamais réécrire le chemin d'un autre dossier.
       */
      if (r.chaine.length > 0) setHisto((h) => remplacerCheminCourant(h, r.chaine));
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      if (attendu.current === dossierId && connu === undefined) {
        setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
      }
    }
  }, [lireListing]);

  /**
   * 🔴 LE PRÉCHARGEMENT AU SURVOL D'UN DOSSIER. Approcher la souris paie la requête ; le clic ne trouve plus rien
   * à attendre. Borné par le cache lui-même : un dossier déjà connu n'est pas redemandé.
   */
  const precharger = useCallback((dossierId: string) => {
    if (dossierId === '' || cache.current.has(dossierId)) return;
    void (async () => {
      try {
        const r = await lireListing(dossierId, new AbortController().signal);
        if (!('erreur' in r)) cache.current.set(dossierId, r);
      } catch { /* un préchargement raté n'est pas une panne : le clic paiera, comme avant */ }
    })();
  }, [lireListing]);

  /**
   * ⚠️ LE PREMIER CHARGEMENT EST DIFFÉRÉ D'UN TOUR DE BOUCLE, et ce n'est pas une coquetterie : appeler `charger`
   * dans le corps de l'effet poserait un `setState` SYNCHRONE au montage, ce qui enchaîne deux rendus pour rien.
   * L'écran ne perd rien : son état de départ est déjà « en chargement », donc le squelette est peint tout de suite.
   */
  useEffect(() => {
    let annule = false;
    // ⚠️ UNE MICRO-TÂCHE, PAS UN MINUTEUR : elle part au tout prochain tour de boucle, donc sans aucun délai
    //   perceptible, là où un `setTimeout` aurait fait attendre un tour d'horloge complet.
    // 🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — le dossier de départ s'il y en a un, la racine sinon.
    //   La chaîne des parents arrive avec le listing et déplie le fil d'Ariane : voir `dossierDepart`.
    queueMicrotask(() => { if (!annule) void charger(departInitial.current); });
    return () => { annule = true; };
  }, [charger]);

  /**
   * ══ 🔴 « RÉCENTS » ═══════════════════════════════════════════════════════════════════════════════════════════
   * Joindre une pièce, c'est presque toujours rejoindre la même, ou retourner dans le même dossier. La liste vit
   * dans NOTRE base (migration 269) : rien n'est écrit dans le Drive pour la tenir.
   * ⚠️ SANS LA MIGRATION, L'ENTRÉE N'EXISTE PAS — pas une liste vide, qui se lirait comme une panne.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/pieces-recentes?sorte=drive_fichier,drive_dossier',
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; lignes?: Recent[]; disponible?: boolean };
        if (annule) return;
        setRecents(d.etat === 'ok'
          ? { lignes: d.lignes ?? [], disponible: d.disponible !== false }
          : { lignes: [], disponible: false });
      } catch { if (!annule) setRecents({ lignes: [], disponible: false }); }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * ══ 🔴 LE DOSSIER DU BIEN ════════════════════════════════════════════════════════════════════════════════════
   * 🔴 AUCUN APPEL AU DRIVE POUR CELA : la correspondance est déjà en base (le dossier du propriétaire, par clé
   * WIPPIMMO). Ouvrir le navigateur ne coûte donc pas une requête Google de plus.
   */
  useEffect(() => {
    if (filId === null && clesLots === '') return undefined;
    let annule = false;
    void (async () => {
      try {
        const p = new URLSearchParams();
        if (filId !== null) p.set('fil', String(filId));
        if (clesLots !== '') p.set('lots', clesLots);
        const res = await fetch(`/api/admin/gestion/drive/dossier-du-bien?${p}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; biens?: BienDuMail[]; dossiers?: DossierPrioritaire[] };
        if (annule || d.etat !== 'ok') return;
        const liste = d.dossiers ?? dossiersPrioritaires(d.biens ?? []);
        setPrioritaires(liste);
        // 🔴 PRÉCHARGÉ D'EMBLÉE (demande d'Arno) : c'est l'endroit où l'on va neuf fois sur dix.
        for (const x of liste) precharger(x.dossierId);
      } catch { /* un raccourci absent n'est pas une panne : le navigateur reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId, clesLots, precharger]);

  /**
   * LA RECHERCHE, TEMPORISÉE (250 ms). ⚠️ `annule` couvre les DEUX cas : fenêtre refermée, et réponse PÉRIMÉE —
   * une réponse lente à « ba » ne doit pas écraser les résultats de « bail 2024 ».
   */
  useEffect(() => {
    const terme = saisie.trim();
    if (terme.length < 2) return undefined;
    let annule = false;
    const minuteur = setTimeout(() => {
      void (async () => {
        setMontrerRecents(false);
        setVue({ v: 'charge' });
        try {
          const res = await fetch(`/api/admin/gestion/drive/fichiers?recherche=${encodeURIComponent(terme)}`,
            { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; message?: string; fichiers?: Fichier[]; dossiers?: Fichier[]; joindreAutorise?: boolean;
          };
          if (annule) return;
          if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
          setVue({
            v: 'ok', fichiers: d.fichiers ?? [], dossiers: d.dossiers ?? [],
            joindreAutorise: d.joindreAutorise !== false,
            motifRefus: null, recherche: true,
            // 🔴 PAS DE CRÉATION DANS DES RÉSULTATS : quarante lignes venues de quarante dossiers ne sont pas un
            //   endroit. On entre dans un dossier trouvé, PUIS on y crée.
            creerAutorise: false, motifCreation: null,
            // La recherche a sa propre borne, annoncée par la route depuis le lot EDITEUR-PJ.
            tronque: false,
            // Des résultats venus de quarante dossiers n'ont pas de chemin commun : il n'y a rien à reconstruire.
            chaine: [],
          });
        } catch { if (!annule) setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' }); }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LA NAVIGATION
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const oublierCreation = () => { setLigneNeuve(LIGNE_FERMEE); setMotDeLaCreation(null); };

  const allerA = useCallback((c: Chemin) => {
    setSaisie('');
    setMontrerRecents(false);
    setSelection(SELECTION_VIDE);
    /* 🔴🔴 ON NE REFERME PLUS LES DOSSIERS DÉPLIÉS (lot DRIVE-RETOUCHES-2, demande d'Arno).
       Constat : « je déplie plusieurs dossiers, j'entre dans l'un d'eux, je ressors, et tous les dossiers
       dépliés sont refermés ». C'était cette ligne — `setOuverts(new Set())` — et ses deux jumelles dans les
       flèches ‹ ›. Le dépliage est un TRAVAIL de la personne : entrer quelque part ne doit pas le défaire.
       ⚠️ L'état est gardé PAR IDENTIFIANT de dossier, donc il reste juste où qu'on aille : un dossier déplié
       qu'on ne voit pas ne gêne personne, et il est encore déplié quand on revient. */
    oublierCreation();
    setHisto((h) => naviguerVers(h, c));
    void charger(dossierDuChemin(c));
  }, [charger]);

  const entrer = (f: { id: string; nom: string }) => {
    allerA([...chemin, { id: f.id, nom: f.nom }]);
  };
  /** Ouvrir un dossier : depuis une recherche on repart de lui, sinon on descend d'un cran. */
  const ouvrirDossier = (f: Fichier) => {
    if (listing?.recherche === true) entrerDepuisRecherche(f); else entrer(f);
  };

  const remonter = (index: number) => { allerA(chemin.slice(0, index)); };

  /** Les flèches ‹ › : on rejoue l'endroit de l'historique, sans l'empiler à nouveau. */
  const pasArriere = () => {
    if (!peutReculer(histo)) return;
    const h = reculer(histo);
    setHisto(h);
    // ⚠️ Les dossiers dépliés RESTENT dépliés : voir l'encadré d'`allerA`.
    setSelection(SELECTION_VIDE); setSaisie(''); oublierCreation();
    void charger(dossierDuChemin(cheminCourant(h)));
  };
  const pasAvant = () => {
    if (!peutAvancer(histo)) return;
    const h = avancer(histo);
    setHisto(h);
    // ⚠️ Les dossiers dépliés RESTENT dépliés : voir l'encadré d'`allerA`.
    setSelection(SELECTION_VIDE); setSaisie(''); oublierCreation();
    void charger(dossierDuChemin(cheminCourant(h)));
  };

  /**
   * ══ 🔴 ENTRER DANS UN DOSSIER TROUVÉ, SANS PERDRE LA RECHERCHE ═══════════════════════════════════════════════
   * On garde le terme : c'est ce qui rend le retour naturel. `ajoutes` et le compteur ne sont pas touchés — ils
   * vivent au-dessus de la navigation, donc les « ✓ ajouté » restent justes au retour.
   */
  const entrerDepuisRecherche = (f: Fichier) => {
    setRechercheOuverte(saisie.trim());
    setSaisie('');
    setSelection(SELECTION_VIDE);
    setHisto((h) => naviguerVers(h, [{ id: f.id, nom: f.nom }]));
    void charger(f.id);
  };

  const revenirAuxResultats = () => {
    const terme = rechercheOuverte;
    setRechercheOuverte(null);
    oublierCreation();
    setHisto(HISTORIQUE_DEPART);
    setSaisie('');
    setLoupeOuverte(true);
    setTimeout(() => setSaisie(terme ?? ''), 0);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LES GESTES SUR UN FICHIER
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const amorces = useRef<Set<string>>(new Set());
  const AMORCES_MAX = 12;
  /**
   * 🔴 LE SURVOL AMORCE L'APERÇU. Ce qui coûte cher n'est pas le document : c'est le VERDICT (remonter la chaîne
   * des parents) et les métadonnées, mémorisés 60 s côté serveur. Un survol suffit à les payer d'avance.
   * 🔒 AUCUN PRÉCHARGEMENT DE CONTENU LÀ OÙ LA LECTURE EST REFUSÉE : l'appel n'est posé que si `joindreAutorise`.
   */
  const amorcer = useCallback((f: Fichier, autorise: boolean) => {
    if (!autorise || f.dossier || sorteApercu(f.typeMime) === 'aucun') return;
    if (amorces.current.has(f.id) || amorces.current.size >= AMORCES_MAX) return;
    amorces.current.add(f.id);
    void fetch(adresseApercu(f.id, 'info'), { cache: 'no-store' }).catch(() => {});
  }, []);

  /**
   * ══ 🔴🔴 « JOINDRE » N'ATTEND RIEN ═══════════════════════════════════════════════════════════════════════════
   * La pièce est marquée ajoutée TOUT DE SUITE, avant la réponse du serveur : c'est ce qui rend le clic suivant
   * immédiat. Et si le serveur refuse (« Documents clients scannés », document Google natif, 25 Mo dépassés), LA
   * MARQUE EST RETIRÉE et le motif s'affiche — une marque optimiste qui resterait après un refus ferait croire
   * qu'une pièce est jointe alors qu'elle ne l'est pas.
   */
  const joindre = async (f: Fichier) => {
    if (ajoutes.includes(f.id)) return;
    /* 🔴 UN « ._ » NE SE JOINT PAS. Il porte presque le nom d'un vrai document et ne pèse que quelques kilooctets :
       l'envoyer, c'est envoyer une pièce jointe qui ment. */
    if (estFichierSystemeMac(f.nom)) { setErreur(infobulleFichierSysteme(f.nom)); return; }
    setErreur(null);
    setAjoutes((a) => (a.includes(f.id) ? a : [...a, f.id]));
    try {
      await choisir({
        drive: {
          fichierId: f.id, nom: f.nom,
          dossierId: dossierCourant?.id ?? null,
          dossierNom: dossierCourant?.nom ?? null,
        },
      });
    } catch (e) {
      setAjoutes((a) => a.filter((x) => x !== f.id));
      setErreur(e instanceof Error ? e.message : 'Ce fichier n’a pas pu être joint.');
    }
  };

  /** INSÉRER UN LIEN : aucun contenu n'est lu. C'est pour cela qu'il reste permis partout. */
  const lier = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive partageable.'); return; }
    void choisir({ lien: { nom: f.nom, url: f.lien } });
  };

  /** OUVRIR DANS GOOGLE DRIVE : un nouvel onglet, en LECTURE. Rien n'est lu ni écrit par l'application. */
  const ouvrirChezGoogle = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive.'); return; }
    globalThis.open?.(f.lien, '_blank', 'noopener,noreferrer');
  };

  const visualiser = (f: Fichier, autorise: boolean) => {
    if (f.dossier) return;
    /* 🔴 UN « ._ » NE S'OUVRE PAS : il ne contient pas le document. Et ce refus-là se DIT AVANT celui de la
       lecture, parce qu'il est le seul des deux qui apprenne quelque chose : le vrai fichier est juste à côté.
       Il ne lit rien pour autant — il lit un NOM, que la liste affichait déjà. */
    if (estFichierSystemeMac(f.nom)) { setErreur(infobulleFichierSysteme(f.nom)); return; }
    if (!autorise) return;
    setAVoir({
      id: f.id, nom: f.nom, typeMime: f.typeMime, lien: f.lien,
      parentId: f.parentId ?? (vue.v === 'ok' && vue.recherche ? null : dossierCourant?.id ?? null),
    });
  };

  /** Un « récent » du Drive : un fichier se joint, un dossier s'ouvre. */
  const ouvrirRecent = (r: Recent) => {
    if (r.sorte === 'drive_dossier') { setMontrerRecents(false); entrer({ id: r.cle, nom: r.libelle }); return; }
    void joindre({
      id: r.cle, nom: r.libelle, typeMime: r.detail ?? '', tailleOctets: r.tailleOctets,
      modifieLe: null, lien: null, dossier: false,
    });
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     « NOUVEAU DOSSIER » — inchangé, avec sa confirmation venue du serveur et ses interdits
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * ══ 🔴 OUVRIR LA LIGNE NEUVE ═══════════════════════════════════════════════════════════════════════════════
   *
   * Elle naît DANS le dossier visé, à sa place, sous les yeux. Le chemin complet est demandé au serveur en
   * arrière-plan pour l'infobulle : c'est la trace de la confirmation d'avant — elle ne barre plus la route, elle
   * reste disponible pour qui veut vérifier où il crée.
   *
   * ⚠️ `parent` VOYAGE AVEC L'ÉTAT : entre l'ouverture de la ligne et sa validation, on peut avoir changé de
   * dossier. Relire « le dossier courant » au moment du POST créerait ailleurs, silencieusement.
   */
  const ouvrirLigneNeuve = (parent: string, parentNom: string) => {
    if (parent === '') return;
    // Une nouvelle ligne : son nom proposé doit être sélectionné une fois, et une seule.
    nomDejaChoisi.current = false;
    setLigneNeuve(ouvrirLigne(parent, parentNom));
    void (async () => {
      try {
        const p = new URLSearchParams({ parent, nom: NOM_PAR_DEFAUT });
        const res = await fetch(`/api/admin/gestion/drive/dossier?${p}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; chemin?: string };
        if (d.etat !== 'ok' || typeof d.chemin !== 'string') return;
        setLigneNeuve((l) => (l.c === 'edition' && l.parent === parent ? { ...l, chemin: d.chemin as string } : l));
      } catch { /* pas de chemin en infobulle : la ligne reste à sa place, qui dit déjà où l'on est */ }
    })();
  };

  /**
   * ══ 🔴 VALIDER LA LIGNE ════════════════════════════════════════════════════════════════════════════════════
   *
   * Entrée, ou clic ailleurs. Nom vide → on renonce, sans rien dire : un champ qu'on vide et qu'on valide est un
   * abandon, pas une erreur. Doublon → la ligne RESTE en édition, avec le message sous le champ.
   */
  const validerLigneNeuve = async () => {
    if (ligneNeuve.c !== 'edition') return;
    const { parent, parentNom, chemin, nom } = ligneNeuve;
    const voisins = (parent === (dossierCourant?.id ?? '') ? (listing?.fichiers ?? []) : (enfants.get(parent) ?? []))
      .filter((f) => f.dossier).map((f) => f.nom);
    const v = verdictNom(nom, voisins);
    if (v.quoi === 'renoncer') { setLigneNeuve(LIGNE_FERMEE); return; }
    if (v.quoi === 'corriger') { setLigneNeuve({ ...ligneNeuve, erreur: v.motif }); return; }

    setLigneNeuve({ c: 'creation', parent, parentNom, chemin, nom: v.nom });
    try {
      const res = await fetch('/api/admin/gestion/drive/dossier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent, nom: v.nom }),
      });
      const d = (await res.json()) as { etat?: string; message?: string; dossier?: { id: string; nom: string } };
      if (d.etat !== 'ok' || !d.dossier) {
        /* ⚠️ L'ÉCHEC SE DIT DANS LA LIGNE, puis la ligne s'efface. Un dossier qui n'existe pas ne doit pas rester
           affiché : on le croirait créé, et on irait le chercher. */
        setLigneNeuve({ c: 'echec', parent, nom: v.nom, motif: d.message ?? 'Le dossier n’a pas pu être créé.' });
        setTimeout(() => setLigneNeuve((l) => (l.c === 'echec' ? LIGNE_FERMEE : l)), DUREE_ECHEC_MS);
        return;
      }
      setLigneNeuve(LIGNE_FERMEE);
      // Le dossier parent a changé de contenu : son listing mémorisé ne vaut plus.
      cache.current.delete(parent);
      setMotDeLaCreation(d.message ?? `Dossier « ${d.dossier.nom} » créé.`);
      setTimeout(() => setMotDeLaCreation(null), DUREE_ECHEC_MS);
      revaliderEnSilence([parent]);
    } catch {
      setLigneNeuve({ c: 'echec', parent, nom: v.nom, motif: 'Le Drive n’a pas répondu.' });
      setTimeout(() => setLigneNeuve((l) => (l.c === 'echec' ? LIGNE_FERMEE : l)), DUREE_ECHEC_MS);
    }
  };

  /**
   * 🔴 LE TRIANGLE ▸ OUVRE LE SOUS-NIVEAU SUR PLACE, sans quitter la vue. Le contenu est lu à la demande, PUIS
   * mémorisé : replier puis redéplier ne redemande rien.
   */
  /**
   * LE CONTENU D'UN SOUS-NIVEAU, s'il n'est pas déjà connu.
   *
   * ⚠️ EXTRAIT DE `basculerDepliage` (lot DRIVE-RETOUCHES-2) : le ressort du glisser DÉPLIE sans basculer — il ne
   * doit jamais refermer un dossier déjà ouvert sous le curseur. Les deux gestes partagent donc la lecture, et
   * elle n'existe qu'une fois.
   */
  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — OUVRIR UN DOSSIER DÉJÀ LU NE DOIT RIEN COÛTER ════════════════════════
   *
   * CONSTAT D'ARNO : « au moins 1 s par dossier ». MESURÉ sur le vrai Drive le 03/10/2026, aller-retour serveur
   * vu du navigateur, sur dix dossiers : **685 ms de médiane à froid, 360 ms à chaud**.
   *
   * 🔴 LA CAUSE PREMIÈRE ÉTAIT ICI, ET ELLE EST COURTE À DIRE : ce dépliage ne regardait QUE `enfants`, jamais
   * `cache.current`. Or le survol d'un dossier remplit DÉJÀ le cache (`precharger`, depuis le lot DRIVE-RETOUCHES)
   * — et ce travail était intégralement jeté : on approchait la souris, la requête partait, puis le clic en
   * relançait une seconde pour la même liste. Le préchargement ne servait à rien pour le geste qu'on fait le plus.
   *
   * 🔴 DÉSORMAIS : si le cache connaît ce dossier, on le pose IMMÉDIATEMENT (aucun appel), puis on revalide EN
   * SILENCE. C'est le patron de `charger` juste au-dessus — « ce qu'on sait déjà, tout de suite ; puis la vérité,
   * sans que l'écran bouge » — appliqué au dépliage, qui en avait été oublié.
   *
   * ⚠️ LA REVALIDATION RESTE : une liste de 60 s peut avoir vieilli, et on ne veut pas afficher un dossier dont
   * le contenu a changé. Elle ne fait que ne plus FAIRE ATTENDRE.
   */
  const chargerEnfantsSiBesoin = useCallback((id: string) => {
    if (enfants.has(id)) return;
    const connu = cache.current.get(id);
    if (connu !== undefined) setEnfants((m) => (m.has(id) ? m : new Map(m).set(id, connu.fichiers)));
    void (async () => {
      try {
        const r = await lireListing(id, new AbortController().signal);
        if ('erreur' in r) return;
        cache.current.set(id, r);
        setEnfants((m) => new Map(m).set(id, r.fichiers));
      } catch { /* un sous-niveau qu'on n'a pas pu lire reste replié : rien ne casse */ }
    })();
  }, [enfants, lireListing]);

  /**
   * ══ 🔴🔴 CE QU'ON AVAIT LAISSÉ OUVERT DOIT ÊTRE OUVERT — ÉTAT *ET* CONTENU ═════════════════════════════════
   *
   * LE DÉFAUT, TROUVÉ LE 29/09/2026 EN CHERCHANT L'AUTRE. Les dossiers dépliés sont retenus d'une ouverture de la
   * fenêtre à l'autre (`sessionStorage`) — mais SEUL L'ÉTAT l'était. Le CONTENU, lui, n'était relu par personne :
   * `enfants` repart vide à chaque montage.
   *
   * CE QUE ÇA DONNAIT À L'ÉCRAN : des dossiers marqués ouverts (triangle ▾, `aria-expanded="true"`) et RIEN
   * dessous. Le premier clic sur le triangle les REFERMAIT — ils se croyaient ouverts, et ils l'étaient — et il
   * en fallait un second pour que le contenu arrive enfin. Vu en vrai en essayant d'atteindre un dossier de
   * test : trois tentatives, aucun message, aucune erreur.
   *
   * 🔴 ET DANS CETTE FENÊTRE C'EST PLUS GRAVE QU'AILLEURS : un dossier qu'on ne peut pas VOIR est un dossier sur
   * lequel on ne peut pas DÉPOSER. Le rangement d'une pièce s'arrêtait là, sans rien dire.
   *
   * ⚠️ `demandes` EST UNE RÉFÉRENCE, et elle retient ce qu'on a DÉJÀ TENTÉ — pas ce qu'on a obtenu. Un dossier
   * disparu du Drive entre deux ouvertures ne rend aucun enfant : sans cette mémoire, on le redemanderait à
   * chaque rendu, pour toujours.
   */
  const enfantsDemandes = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (vue.v !== 'ok') return;
    for (const id of ouverts) {
      if (enfants.has(id) || enfantsDemandes.current.has(id)) continue;
      enfantsDemandes.current.add(id);
      chargerEnfantsSiBesoin(id);
    }
  }, [ouverts, enfants, vue, chargerEnfantsSiBesoin]);

  const basculerDepliage = useCallback((f: Fichier) => {
    setOuverts((o) => {
      const n = new Set(o);
      if (n.has(f.id)) { n.delete(f.id); return n; }
      n.add(f.id);
      return n;
    });
    chargerEnfantsSiBesoin(f.id);
  }, [chargerEnfantsSiBesoin]);

  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — ON PRÉPARE LE CRAN SUIVANT PENDANT QU'ON LIT CELUI-CI ════════════════
   *
   * Arno : « préchargement des sous-dossiers visibles au survol ou à l'ouverture du parent ». Le survol existait
   * déjà (`precharger`) ; l'ouverture du parent, non. Dès qu'un dossier s'ouvre, ses SOUS-DOSSIERS sont demandés
   * en arrière-plan : le clic suivant trouve alors sa liste dans le cache, et ne coûte rien.
   *
   * ⚠️ BORNÉ, ET IL FAUT L'ÊTRE. Un dossier de cent sous-dossiers lancerait cent requêtes pour une liste qu'on ne
   * regardera pas : Google les compterait comme un abus, et il répondrait 403 sur celles qui comptent vraiment.
   * Huit, c'est ce qu'on voit à l'écran sans défiler.
   *
   * ⚠️ ET SEULEMENT CE QUI N'EST PAS DÉJÀ CONNU : `precharger` écarte de lui-même ce que le cache porte.
   */
  const PRECHARGE_ENFANTS_MAX = 8;
  const prechargerLesSousDossiers = useCallback((enfantsDu: readonly Fichier[]) => {
    let n = 0;
    for (const f of enfantsDu) {
      if (!f.dossier) continue;
      if (n >= PRECHARGE_ENFANTS_MAX) break;
      n += 1;
      precharger(f.id);
    }
  }, [precharger]);

  /**
   * 🔴 IL PART QUAND LA LISTE D'UN SOUS-NIVEAU ARRIVE, et jamais avant : précharger les petits-enfants d'un
   * dossier qu'on n'a pas encore ouvert serait du travail pour rien.
   */
  useEffect(() => {
    for (const [, liste] of enfants) prechargerLesSousDossiers(liste);
  }, [enfants, prechargerLesSousDossiers]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LA LISTE : aplatie, triée, virtualisée
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const listing = vue.v === 'ok' ? vue : null;
  /**
   * ⚠️ PAS DE `useMemo` ICI, ET C'EST DÉLIBÉRÉ : le compilateur React refuse d'optimiser un composant dont il ne
   * peut pas préserver la mémorisation manuelle (il juge la carte des enfants modifiable), et il abandonne alors
   * TOUT le fichier. Le laisser faire lui-même vaut mieux qu'un `useMemo` qui lui coûte le reste.
   */
  const racineListe = listing === null ? []
    : listing.recherche ? [...listing.dossiers, ...listing.fichiers] : listing.fichiers;
  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE DÉPLIAGE EST IMMÉDIAT, AVEC SON SQUELETTE ════════════════════════
   *
   * Arno : « dépliage immédiat avec squelette ». Avant ce lot, ouvrir un dossier jamais lu ne montrait RIEN
   * pendant la demi-seconde de Google : le triangle tournait vers le bas, et la liste restait identique. On ne
   * savait pas si le clic avait porté, alors on recliquait — ce qui refermait le dossier.
   *
   * 🔴 LA LIGNE D'ATTENTE EST POSÉE ICI, APRÈS L'APLATISSEMENT, et non dans `aplatir` : cette fonction PURE
   * répond à « quelles entrées sont visibles ? », et une ligne qui n'est pas une entrée du Drive n'a rien à y
   * faire. Elle est marquée `attente`, et le rendu la dessine en grisé, sans geste ni cible de dépôt.
   *
   * ⚠️ ELLE NE PARAÎT QUE POUR UN DOSSIER DONT ON N'A VRAIMENT RIEN : dès que le cache a servi (le cas le plus
   * courant depuis ce lot), les enfants sont là au même rendu et le squelette ne s'affiche jamais.
   */
  const lignesBrutes = aplatir(racineListe, ouverts, (id) => enfants.get(id), tri);
  const lignes = (() => {
    const out: LigneAplatie[] = [];
    for (const l of lignesBrutes) {
      out.push(l);
      if (!l.entree.dossier || !ouverts.has(l.entree.id) || enfants.has(l.entree.id)) continue;
      out.push({
        entree: {
          id: `attente:${l.entree.id}`, nom: 'Chargement…', typeMime: '', tailleOctets: null,
          modifieLe: null, lien: null, dossier: false, parentId: l.entree.id,
        },
        profondeur: l.profondeur + 1,
        parent: { id: l.entree.id, nom: l.entree.nom },
      });
    }
    return out;
  })();
  const ordre = lignes.map((l) => l.entree.id);
  const fenetre = fenetreVisible(lignes.length, scrollTop, hauteurVue);
  const visibles = lignes.slice(fenetre.debut, fenetre.fin);
  /**
   * 🔴 LOT RANGER-ARBRE-2 — CE QUE VISE UN LÂCHER DANS LE VIDE, sous la dernière ligne : le dossier AFFICHÉ.
   * `null` là où il n'y a pas d'endroit — la racine, un regroupement (« Drives partagés » n'est pas un dossier :
   * Google refuserait le dépôt APRÈS le téléversement), une liste de résultats de recherche.
   */
  const depotDansLeVide = dossierCourant !== null && !estRegroupement(dossierCourant.id)
    && listing?.recherche !== true
    ? { id: dossierCourant.id, nom: dossierCourant.nom }
    : null;

  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — LA MÊME RÈGLE POUR LE COLLAGE ════════════════════════════════════════════════
   *
   * Arno : « Même règle pour les déplacements de fichiers du Drive (Cmd+X/V et glisser) : un fichier n'est jamais
   * une cible. »
   *
   * 🔴 CE QUE CELA CORRIGE. Le commentaire d'avant disait : « sur un fichier, [on colle] dans le dossier AFFICHÉ,
   * celui qui le contient ». Les deux ne sont PAS la même chose depuis que l'arbre se déplie sur place : un
   * fichier montré sous un dossier déplié est contenu par CE dossier, pas par celui qu'on affiche. Coller y
   * déposait donc un cran trop haut — silencieusement, et à un endroit qui n'était même pas sous les yeux.
   *
   * ⚠️ UNE SEULE FONCTION POUR LE CLAVIER ET POUR LE MENU : deux réponses différentes à « où va ce collage ? »
   * seraient un piège tendu à qui apprend le geste par l'un des deux.
   */
  const ligneDe = (id: string): LigneAplatie | null => lignes.find((l) => l.entree.id === id) ?? null;
  const cibleDeLaLigne = (f: Fichier): { id: string; nom: string } | null => {
    const l = ligneDe(f.id);
    return l === null ? cibleDeDepot({ entree: f, parent: null }, dossierCourant) : cibleDeDepot(l, dossierCourant);
  };
  /** Où le clavier colle : dans la ligne visée quand il n'y en a qu'une, sinon dans le dossier affiché. */
  const cibleDuCollage = (): { id: string; nom: string } | null => {
    if (selection.ids.length === 1) {
      const l = ligneDe(selection.ids[0]);
      if (l !== null) return cibleDeDepot(l, dossierCourant);
    }
    return dossierCourant;
  };

  useEffect(() => {
    const el = scene.current;
    if (el === null) return undefined;
    const mesurer = () => setHauteurVue(el.clientHeight);
    mesurer();
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null;
    obs?.observe(el);
    return () => obs?.disconnect();
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 DÉPLACER ET COPIER — LE GESTE, ET SON GARDE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. Il explique et il empêche de viser ce qui sera refusé ; c'est la ROUTE qui
     protège, en remontant la chaîne des parents de la source ET de la cible chez Google, à chaque appel. Un écran
     se modifie, une route non.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Le déplacement est-il disponible ? Sans la migration 274, non — et le motif est dit. */
  const [journalPret, setJournalPret] = useState<boolean | null>(null);
  const MOTIF_SANS_JOURNAL =
    'Déplacement indisponible : la mise à jour de la base qui consigne les déplacements n’est pas appliquée. '
    + 'On ne déplace pas dans le Drive ce qu’on ne saurait pas expliquer ensuite.';

  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « SUPPRIMER » EST-IL POSSIBLE ICI ? ═══════════════════════
   *
   * `null` = on ne sait pas encore (la sonde est en vol) : l'entrée n'apparaît PAS. On ne montre pas un geste
   * irréversible à trente jours tant qu'on n'a pas la réponse du serveur.
   *
   * 🔴 ON DEMANDE À LA ROUTE, pas à une copie de la règle côté navigateur : elle seule sait si les migrations 274
   * et 295 sont là, et c'est elle qui refusera de toute façon.
   */
  const [corbeillePrete, setCorbeillePrete] = useState<boolean | null>(null);
  /**
   * 🔴🔴 LA CONFIRMATION — obligatoire, et jamais contournable. `null` = aucune en cours.
   *
   * Elle garde LE FICHIER et SON CHEMIN : deux fichiers du même nom vivent dans deux dossiers différents, et c'est
   * précisément quand on en a deux sous les yeux qu'on se trompe de ligne.
   */
  const [aJeter, setAJeter] = useState<{ id: string; nom: string; chemin: string; parentNom: string } | null>(null);
  const [jetEnCours, setJetEnCours] = useState(false);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LES VIGNETTES DUPLIQUÉES
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     🔴 ELLES VIVENT DANS LEUR PROPRE ÉTAT, ET C'EST UNE GARANTIE, PAS UN RANGEMENT. Arno : « la vignette
     dupliquée reste dans la session en cours. Elle ne change pas la signature de session (l'arbre ne se referme
     pas). » `signatureSession` est calculée sur les `pieces` du MESSAGE — tant que les vignettes n'y entrent pas,
     elle ne PEUT pas bouger. C'est vrai par construction, pas par précaution d'écriture.

     ⚠️ ET ELLES NE SONT PAS COMPTÉES AVEC LES PIÈCES À RANGER : ce ne sont pas des pièces du poste de tri, elles
     ne quittent aucune file et ne manqueront à personne si l'on ferme la fenêtre. */
  const [vignettes, setVignettes] = useState<readonly VignetteDupliquee[]>([]);
  /** Le nom choisi au crayon ✎ pour une vignette, par clé. Vide ⇒ la copie part sous le nom de l'original. */
  const [nomsVignettes, setNomsVignettes] = useState<Map<string, string>>(new Map());
  /** Les clés dont une copie est en vol : la ligne le dit, et un second clic ne repart pas. */
  const [vignettesEnCours, setVignettesEnCours] = useState<Set<string>>(new Set());
  /**
   * Où chaque vignette a été copiée, et COMBIEN DE FOIS. Arno : « autant de fois que voulu » — la vignette reste
   * donc après un rangement, et la ligne annonce le dernier dossier plus le compte.
   */
  const [vignettesRangees, setVignettesRangees] = useState<Map<string, { dossierNom: string; lien: string | null; nb: number }>>(new Map());
  /** Les vignettes en cours de glisser : même rôle que `piecesGlissees`, pour l'autre sorte d'objet. */
  const [vignettesGlissees, setVignettesGlissees] = useState<readonly VignetteDupliquee[]>([]);
  /** La vignette dont le crayon ✎ vient d'être cliqué : l'aperçu s'ouvre alors DIRECTEMENT sur le champ. */
  const [renommerVignette, setRenommerVignette] = useState<string | null>(null);

  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE COMPTEUR VERT DE CHAQUE VIGNETTE ═══════════════════════════════════
   *
   * Arno : « nombre d'emplacements où ce document est déjà rangé dans le Drive (même source que la loupe) ».
   *
   * 🔴 IL PASSE PAR `?compte=1`, QUI NE FAIT AUCUN APPEL GOOGLE : il lit le registre en base. Demander à chaque
   * vignette ce que demande la loupe — un `files.get` et une remontée de parents par emplacement — aurait fait
   * partir des dizaines d'appels pour afficher un chiffre.
   *
   * ⚠️ CLÉ = celle de la vignette, ou `piece:<id>` pour une pièce du message : les deux sortes cohabitent dans la
   * même colonne, et un identifiant Drive ne peut pas se confondre avec un numéro de pièce.
   */
  const [comptesRanges, setComptesRanges] = useState<Map<string, number>>(new Map());
  const comptesDemandes = useRef<Set<string>>(new Set());
  /**
   * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LE TOUR DE RELECTURE DES COMPTEURS VERTS ═══════════════════════════════
   *
   * CONSTAT D'ARNO (03/10/2026, « test gigout.pdf ») : « après un glisser-déposer dans Test / Test creation
   * dossier drive (✓ Rangée dans…), la vignette n'affiche pas la pastille verte ».
   *
   * 🔴 LA CAUSE, LUE DANS LE CODE : `comptesDemandes` (juste au-dessus) retient ce qui est DÉJÀ parti, pour qu'un
   * rendu de la colonne ne relance pas une requête par vignette. Excellent — et définitif : une fois la clé
   * dedans, le compteur n'était PLUS JAMAIS redemandé. La pastille restait donc à la valeur qu'elle avait à
   * l'ouverture de la fenêtre, c'est-à-dire absente (0) pour une pièce qu'on n'avait pas encore rangée.
   *
   * 🔴 CE NUMÉRO EST LA SORTIE. Un geste retire sa clé du `Set` et incrémente ce numéro : l'effet repart, pour
   * cette clé seulement. Rien n'est demandé deux fois sans raison, et plus rien n'est figé pour de bon.
   */
  const [versionComptes, setVersionComptes] = useState(0);

  /**
   * ══ 🔴🔴 « MISE À JOUR OPTIMISTE, PUIS RELECTURE SERVEUR » (ARNO, 03/10/2026) ═══════════════════════════════
   *
   * `bougerCompte` applique tout de suite ce qu'on SAIT du geste ; `relireComptes` redemande au serveur, qui
   * tranche. Les deux temps, et pour la raison déjà mesurée au lot COMPTEURS : un quart de seconde d'immobilité
   * se lit « il ne s'est rien passé », et c'est exactement la plainte à laquelle ce lot répond.
   *
   * ⚠️ JAMAIS SOUS ZÉRO : mieux vaut montrer 0 une demi-seconde — et laisser la relecture corriger — qu'un
   * « −1 emplacement », qui ferait douter de tout l'écran.
   */
  const bougerCompte = (cle: string, delta: number): void => {
    setComptesRanges((m) => new Map(m).set(cle, Math.max(0, (m.get(cle) ?? 0) + delta)));
  };

  /**
   * REDEMANDE AU SERVEUR les compteurs désignés — ou TOUS quand on ne sait pas lesquels ont bougé.
   *
   * ⚠️ « TOUS » EST LE CAS D'UN GESTE SUR UN FICHIER DU DRIVE (corbeille, restauration, annulation) : l'écran ne
   * sait pas de quelle pièce ce fichier est la copie — le registre le sait, lui. On redemande donc la colonne
   * entière, ce qui coûte une lecture EN BASE par vignette, sur un geste rare et délibéré. Deviner le SENS aurait
   * affiché un nombre faux, et un nombre faux est pire qu'un nombre qui attend 100 ms.
   */
  const relireComptes = (cles?: readonly string[]): void => {
    if (cles === undefined) comptesDemandes.current.clear();
    else for (const c of cles) comptesDemandes.current.delete(c);
    setVersionComptes((v) => v + 1);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA LOUPE « OÙ EST CE DOCUMENT ? »
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     🔴 UNE SEULE ACTIVE À LA FOIS (demande d'Arno). Deux localisations simultanées surligneraient deux jeux de
     chemins dans le même arbre, sans qu'on puisse dire lequel appartient à quoi — c'est-à-dire un arbre tout
     surligné, qui n'apprend plus rien. La clé de la vignette active, donc, et rien de plus. */
  const [loupeSur, setLoupeSur] = useState<string | null>(null);
  /** Ce que la route a trouvé pour la vignette active. Vide tant qu'elle n'a pas répondu. */
  const [localisation, setLocalisation] = useState<{
    md5: string | null; occurrences: Occurrence[]; parRegistre: number;
    /**
     * 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — combien d'empreintes du Drive sont indexées.
     * `undefined` ou 0 ⇒ aucun index : la phrase de la fenêtre reste CELLE D'AVANT, « le Drive n'est pas
     * balayé », parce que c'est alors la vérité.
     */
    indexes?: number;
  } | null>(null);

  /**
   * ⚠️ PAS DE `useCallback` ICI, ET C'EST DÉLIBÉRÉ (même raison qu'à la liste, plus haut) : le compilateur React
   * refuse d'optimiser un composant dont il ne peut pas préserver la mémorisation manuelle — il juge `chemin`
   * modifiable — et il abandonne alors TOUT le fichier. Le laisser faire lui-même vaut mieux qu'un `useCallback`
   * qui lui coûte le reste de l'écran.
   */
  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT DRIVE-DEPLACER-RAPIDE — L'ÉCRAN RÉPOND AU LÂCHER, PAS À GOOGLE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     Arno : « le glisser-déposer est long quand je déplace des fichiers dans notre Drive ». Mesuré avant de
     toucher à quoi que ce soit : 4,2 s pour UN fichier, 12,9 s pour cinq, plus le rechargement complet de la
     liste. Le serveur a été rendu plus rapide — mais même à une seconde, l'écran ne doit pas attendre : la main
     sait ce qu'elle vient de faire.

     🔴 CE QUI SE PASSE MAINTENANT, DANS CET ORDRE :
       ① la ligne quitte la source et paraît dans la cible, marquée « en cours », et le bandeau s'affiche —
          le tout sans un seul aller-retour ;
       ② la demande part ;
       ③ à la réponse : les refusés REVIENNENT à leur place avec leur motif, le bandeau devient définitif et
          reçoit son « Annuler », et les deux dossiers sont revalidés en silence.

     ⚠️ L'OPTIMISME S'ARRÊTE AUX LIGNES. Aucune règle n'est devinée ici : le verdict reste prononcé par le
     serveur, sur les chaînes réelles, avant le moindre `files.update`. L'écran ne fait qu'afficher d'avance ce
     qui va probablement arriver, et il le défait quand il s'est trompé.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * Applique un mouvement aux listes que l'écran tient : le cache des dossiers, les sous-niveaux dépliés, et la
   * vue courante. UNE fonction, pour que les trois ne puissent pas diverger.
   */
  const rangerLesListes = (m: MouvementLocal, refuses: readonly string[] | null) => {
    /* 🔴 CE QU'ON RETIRE EST NOTÉ, ET C'EST CE QU'ON REMETTRA. Un déplacement retire la ligne de PARTOUT où
       l'écran la montrait — il le faut, car la même ligne peut être affichée à deux endroits et les listes ne
       sont pas toutes indexées par l'identifiant du parent. Pour la rendre, il faut donc savoir d'où on l'a
       prise : la deviner la remettrait dans une liste que l'écran n'affiche pas, et le refus resterait muet. */
    const muter = (avant: ReadonlyMap<string, Fichier[]>): Map<string, Fichier[]> => {
      if (refuses !== null) return annulerLocalement(avant, m, refuses, retiresDe.current);
      const r = appliquerLocalement(avant, m);
      for (const [cle, ids] of r.retires) {
        const deja = retiresDe.current.get(cle) ?? [];
        retiresDe.current.set(cle, [...new Set([...deja, ...ids])]);
      }
      return r.listes;
    };
    if (refuses === null) retiresDe.current = new Map();

    // ① LE CACHE DES DOSSIERS (il porte des listings complets : on n'en change que les fichiers).
    const listesCache = new Map<string, Fichier[]>();
    for (const [id, l] of cache.current) listesCache.set(id, l.fichiers);
    const apresCache = muter(listesCache);
    for (const [id, fichiers] of apresCache) {
      const ancien = cache.current.get(id);
      if (ancien !== undefined) cache.current.set(id, { ...ancien, fichiers });
    }

    // ② LES SOUS-NIVEAUX DÉPLIÉS.
    setEnfants((avant) => muter(avant));

    // ③ LA VUE COURANTE — celle qu'on regarde, et la seule qui doit bouger sous l'œil.
    const ici = dossierCourant?.id ?? '';
    setVue((v) => {
      if (v.v !== 'ok') return v;
      const une = new Map<string, Fichier[]>([[ici, v.fichiers]]);
      const apres = muter(une).get(ici);
      return apres === undefined ? v : { ...v, fichiers: apres };
    });
  };

  /** Marque (ou démarque) des lignes « en cours » : c'est l'indicateur discret demandé. */
  const marquerEnVol = (ids: readonly string[], enVol: boolean) => {
    setEnMouvement((avant) => {
      const n = new Set(avant);
      for (const id of ids) { if (enVol) n.add(id); else n.delete(id); }
      return n;
    });
  };

  /**
   * REVALIDATION SILENCIEUSE des deux dossiers touchés.
   *
   * ⚠️ PAS DE `charger()`, ET C'EST TOUT L'INTÉRÊT : `charger` vide l'écran, remet le défilement en haut et
   * repasse par l'état « chargement ». Ici on relit en arrière-plan et on ne remplace que si l'on est TOUJOURS au
   * même endroit — l'écran ne bouge pas, il se met d'accord avec le Drive.
   */
  const revaliderEnSilence = (dossiers: readonly string[]) => {
    for (const id of dossiers.filter((x) => x !== '')) {
      void (async () => {
        try {
          const r = await lireListing(id, new AbortController().signal);
          if ('erreur' in r) return;
          cache.current.set(id, r);
          if ((dossierCourant?.id ?? '') === id) setVue((v) => (v.v === 'ok' ? { v: 'ok', ...r } : v));
          setEnfants((avant) => (avant.has(id) ? new Map(avant).set(id, r.fichiers) : avant));
        } catch { /* une revalidation ratée laisse l'écran tel quel : il est déjà juste, ou il le sera au retour */ }
      })();
    }
  };

  /**
   * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — APPLIQUER UNE RETOUCHE À TOUTES LES LISTES D'UN DOSSIER ═════════════
   *
   * Les mêmes TROIS endroits que `rangerLesListes` — le cache des listings, les sous-niveaux dépliés, la vue
   * courante —, mais pour un dossier UNIQUE et une transformation quelconque. Le dépôt n'a pas de source à vider :
   * il n'ajoute (ou retire) qu'une ligne, dans un seul dossier.
   *
   * ⚠️ TOUJOURS LES TROIS, JAMAIS DEUX. N'en toucher que deux donne un écran qui se contredit dès qu'on remonte
   * d'un dossier et qu'on redescend : c'est exactement le genre d'incohérence qu'on attribue au Drive.
   */
  const majListesDu = (dossierId: string, transformer: (liste: readonly Fichier[]) => Fichier[]) => {
    if (dossierId === '') return;
    const connu = cache.current.get(dossierId);
    if (connu !== undefined) cache.current.set(dossierId, { ...connu, fichiers: transformer(connu.fichiers) });
    setEnfants((avant) => (avant.has(dossierId)
      ? new Map(avant).set(dossierId, transformer(avant.get(dossierId) ?? []))
      : avant));
    if ((dossierCourant?.id ?? '') === dossierId) {
      setVue((v) => (v.v === 'ok' ? { ...v, fichiers: transformer(v.fichiers) } : v));
    }
  };

  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — TOUT CE QUE LA FENÊTRE A DÉJÀ LU ════════════════════════
   *
   * La liste affichée, plus chaque sous-dossier déplié. C'est l'étendue EXACTE de la comparaison par empreinte :
   * l'API Drive ne sait pas chercher par `md5Checksum`, donc la seule comparaison possible sans balayer le Drive
   * porte sur ce qu'on a déjà sous la main — et qu'on a lu dans le MÊME appel que la liste, donc gratuitement.
   *
   * ⚠️ C'EST AUSSI LA LIMITE QU'ON ANNONCE À L'ÉCRAN : « la comparaison n'a porté que sur les N dossiers déjà
   * ouverts ». Le nombre vient d'ici, et il est donc toujours vrai.
   */
  const listesParDossier = (): [string, readonly Fichier[]][] => {
    const out: [string, readonly Fichier[]][] = [];
    const ici = dossierCourant?.id ?? '';
    /**
     * ⚠️ LA LISTE AFFICHÉE ENTRE MÊME À LA RACINE DU SÉLECTEUR, où il n'y a pas de « dossier courant ». Ses
     * fichiers sont bel et bien lus et sous les yeux : les écarter aurait fait passer à côté du document qu'on a
     * justement devant soi. Leur chemin est alors vide — ils sont comptés et surlignés, sans surligner de
     * dossier, ce qui est exact : il n'y en a aucun au-dessus d'eux à montrer.
     */
    if (vue.v === 'ok') out.push([ici, vue.fichiers]);
    for (const [id, liste] of enfants) if (id !== ici) out.push([id, liste]);
    return out;
  };

  /**
   * LA CHAÎNE D'UN DOSSIER QU'ON A SOUS LES YEUX, du plus proche à la racine.
   *
   * ⚠️ ELLE NE DEMANDE RIEN À GOOGLE : on la reconstitue avec ce que l'écran affiche déjà — le fil d'Ariane pour
   * le dossier courant, et les lignes dépliées pour les sous-dossiers. Un `files.get` par fichier comparé aurait
   * été exactement le balayage qu'Arno exclut.
   */
  const cheminDuDossier = (dossierId: string): { id: string; nom: string }[] => {
    const ici = dossierCourant?.id ?? '';
    const base = [...chemin].reverse().map((e) => ({ id: e.id, nom: e.nom }));
    if (dossierId === ici) return base;
    const ligne = lignes.find((l) => l.entree.id === dossierId);
    return ligne === undefined ? base : [{ id: dossierId, nom: ligne.entree.nom }, ...base];
  };

  /** Le nom d'un dossier qu'on a sous la main : le courant, un parent du bandeau, ou une ligne de la liste. */
  const nomDuDossier = (id: string | null): string | null => {
    if (id === null || id === '') return null;
    if (dossierCourant?.id === id) return dossierCourant.nom;
    return chemin.find((e) => e.id === id)?.nom
      ?? lignes.find((l) => l.entree.id === id)?.entree.nom
      ?? null;
  };

  const mouvoir = async (
    sorte: 'deplacer' | 'copier', elements: Fichier[], cibleId: string, cibleNom: string,
  ): Promise<void> => {
    if (elements.length === 0 || cibleId === '') return;
    setErreur(null);

    /* ══ ① L'ÉCRAN, TOUT DE SUITE ════════════════════════════════════════════════════════════════════════════
       ⚠️ UNE COPIE NE RETIRE RIEN DE LA SOURCE : l'original reste où il est. `source: null` le dit, et c'est la
       seule différence entre les deux gestes de ce côté-ci. */
    const source = sorte === 'deplacer' ? (elements[0]?.parentId ?? dossierCourant?.id ?? null) : null;
    const local: MouvementLocal = { elements, source, cible: cibleId };
    dernierMouvement.current = sorte === 'deplacer' ? local : null;
    rangerLesListes(local, null);
    marquerEnVol(elements.map((e) => e.id), true);
    setPresse(null);
    setSelection(SELECTION_VIDE);
    // 🔴 LE BANDEAU PARAÎT AU LÂCHER (demande d'Arno) — sans « Annuler » tant que rien n'est fait.
    setBandeau({ mot: motMouvementEnCours(sorte, elements.length, cibleNom), mouvements: [] });

    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: sorte, cible: cibleId,
          elements: elements.map((f) => ({ id: f.id, nom: f.nom, dossier: f.dossier, parentId: f.parentId ?? null })),
        }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string; nomCible?: string;
        faits?: { id: string }[]; refuses?: { id?: string; nom: string; motif: string }[]; mouvements?: number[];
        temps?: Record<string, number>;
      };
      marquerEnVol(elements.map((e) => e.id), false);

      // ② LE SERVEUR A REFUSÉ EN BLOC : tout revient, et l'on dit pourquoi.
      if (d.etat !== 'ok') {
        rangerLesListes(local, elements.map((e) => e.id));
        setBandeau(null);
        setErreur(d.message ?? 'Ce déplacement n’a pas pu être fait.');
        return;
      }

      const faits = d.faits ?? [];
      const refuses = d.refuses ?? [];
      /* 🔴 LES REFUSÉS REVIENNENT À LEUR PLACE, AVEC LEUR MOTIF. C'est ce qui sépare un écran optimiste d'un
         écran menteur : sans ce retour, un refus laisserait à l'affichage un déplacement qui n'a pas eu lieu. */
      if (refuses.length > 0) {
        rangerLesListes(local, refuses.map((r) => r.id ?? '').filter((x) => x !== ''));
        setErreur(refuses.map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      if (faits.length === 0) { setBandeau(null); return; }

      const mouvements = sorte === 'deplacer' ? (d.mouvements ?? []) : [];
      setBandeau({
        mot: motMouvementFait(sorte, faits.length, d.nomCible ?? cibleNom),
        // ⚠️ UNE COPIE NE S'ANNULE PAS : annuler voudrait dire SUPPRIMER la copie, et l'app ne supprime rien.
        mouvements,
      });
      /* 🔴 ET LE PAS ENTRE DANS LA PILE. `empiler` écarte de lui-même ce qui n'a pas de ligne de journal — donc
         les copies : elles n'y entrent jamais, et le bouton les « saute » sans avoir à le savoir. */
      setPileAnnulation((pile) => empiler(pile, {
        mouvements,
        nom: elements[0]?.nom ?? '',
        nombre: faits.length,
        origineNom: nomDuDossier(source) ?? 'son dossier d’origine',
      }));
      /**
       * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — UN DÉPLACEMENT NE CHANGE PAS LE NOMBRE, IL CHANGE LE CHEMIN ═════
       *
       * Un fichier déplacé reste UN emplacement : la pastille ne doit pas bouger, et c'est bien pour cela qu'on
       * n'applique AUCUN delta ici. Mais le picto du mail, lui, annonce « Drive › … › dossier » : le chemin
       * vient de changer, et un chemin faux envoie chercher un document là où il n'est plus.
       *
       * ⚠️ UNE COPIE, EN REVANCHE, CRÉE UN EMPLACEMENT. On ne devine pas lequel des deux gestes a touché quelle
       * pièce (l'écran ne le sait pas) : on redemande, et le registre tranche.
       */
      relireComptes();
      annoncerPiecesDrive();
      // ③ ET L'ON SE MET D'ACCORD AVEC LE DRIVE, SANS QUE L'ÉCRAN BOUGE.
      revaliderEnSilence([cibleId, source ?? '', dossierCourant?.id ?? '']);
    } catch {
      marquerEnVol(elements.map((e) => e.id), false);
      rangerLesListes(local, elements.map((e) => e.id));
      setBandeau(null);
      setErreur('Le Drive n’a pas répondu.');
    }
  };

  /**
   * ANNULER : la route relit le parent d'origine DANS LE JOURNAL, pas dans ce que cet écran se rappelle.
   *
   * 🔴 OPTIMISTE LUI AUSSI, ET PAR LE MÊME CHEMIN. Le bandeau disparaît au clic, les lignes repartent d'où elles
   * viennent, et si la route refuse (elle repasse par le MÊME verdict) elles reviennent, avec le motif.
   */
  const annulerMouvement = async (mouvements: number[]) => {
    setBandeau(null);
    const retour = dernierMouvement.current;
    if (retour !== null && retour.source !== null) {
      rangerLesListes({ elements: retour.elements, source: retour.cible, cible: retour.source }, null);
      marquerEnVol(retour.elements.map((e) => e.id), true);
    }
    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler', mouvements }),
      });
      const d = (await res.json()) as { etat?: string; message?: string; refuses?: { nom: string; motif: string }[] };
      if (retour !== null) marquerEnVol(retour.elements.map((e) => e.id), false);
      if (d.etat !== 'ok') {
        if (retour !== null && retour.source !== null) {
          rangerLesListes({ elements: retour.elements, source: retour.cible, cible: retour.source },
            retour.elements.map((e) => e.id));
        }
        setErreur(d.message ?? 'L’annulation n’a pas pu être faite.');
        return;
      }
      if ((d.refuses ?? []).length > 0) {
        setErreur((d.refuses ?? []).map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      /* 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « “Annuler le dernier déplacement” […] fait redescendre le compteur »
         (Arno). Le chemin du picto repart à sa place, et si le pas annulé avait fait naître ou disparaître un
         emplacement, le registre le dit. On redemande ; on ne devine pas le sens. */
      relireComptes();
      annoncerPiecesDrive();
      revaliderEnSilence(retour === null ? [dossierCourant?.id ?? ''] : [retour.cible, retour.source ?? '']);
    } catch {
      if (retour !== null) marquerEnVol(retour.elements.map((e) => e.id), false);
      setErreur('Le Drive n’a pas répondu.');
    }
  };

  /**
   * ══ 🔴 « ↶ ANNULER LE DERNIER DÉPLACEMENT » ════════════════════════════════════════════════════════════════
   *
   * 🔴 IL PASSE PAR LA MÊME ROUTE ET LE MÊME VERDICT que le bandeau de dix secondes : remettre un élément à sa
   * place est un déplacement comme un autre, et il n'a droit à aucun régime de faveur — l'archive le refuse, ses
   * ancêtres aussi, et un élément déplacé ailleurs entre-temps est refusé avec son motif.
   *
   * ⚠️ LE PAS QUITTE LA PILE MÊME SI LA ROUTE REFUSE. Le laisser ferait re-cliquer sur le même refus indéfiniment,
   * sans jamais atteindre le pas d'avant. Le motif, lui, s'affiche.
   */
  const annulerDernierPas = async () => {
    const pas = pileAnnulation[pileAnnulation.length - 1];
    if (pas === undefined) return;
    setPileAnnulation((pile) => pile.slice(0, -1));
    /**
     * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — UN SEUL BOUTON, DEUX GESTES À DÉFAIRE.
     *
     * Arno : « “Annuler le dernier déplacement” sait aussi annuler une mise à la corbeille (restauration). » Les
     * deux pas vivent dans la même pile, dans l'ordre où ils ont été faits : un clic défait le plus récent, quel
     * qu'il soit, sans que personne ait à chercher lequel des deux boutons appuyer.
     *
     * ⚠️ `sorte` ABSENT ⇒ DÉPLACEMENT : tous les pas empilés avant ce lot se comportent à l'identique.
     */
    if (pas.sorte === 'corbeille') { await sortirDeLaCorbeille(pas.mouvements); return; }
    await annulerMouvement(pas.mouvements);
  };

  /** Le bandeau s'efface tout seul au bout de dix secondes : le temps de s'apercevoir qu'on s'est trompé. */
  useEffect(() => {
    if (bandeau === null) return undefined;
    const t = setTimeout(() => setBandeau(null), DUREE_ANNULATION_MS);
    return () => clearTimeout(t);
  }, [bandeau]);

  /**
   * 🔴 ON DEMANDE À LA ROUTE, pas à une copie de la règle. Elle seule sait si le journal existe — et c'est elle
   * qui refusera de toute façon. `null` = on ne sait pas encore : le geste est alors simplement inactif.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/drive/deplacer', { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; disponible?: boolean };
        if (!annule) setJournalPret(d.etat === 'ok' && d.disponible === true);
      } catch { if (!annule) setJournalPret(false); }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA MÊME DISCIPLINE POUR « SUPPRIMER ». Une sonde, une fois, à
   * la route. Sans les migrations 274 et 295, elle répond « non » et l'entrée du menu n'existe pas — plutôt que de
   * laisser cliquer sur un geste qui sera refusé après coup.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/drive/corbeille', { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; disponible?: boolean };
        if (!annule) setCorbeillePrete(d.etat === 'ok' && d.disponible === true);
      } catch { if (!annule) setCorbeillePrete(false); }
    })();
    return () => { annule = true; };
  }, []);

  /** Les éléments visés par un geste : la sélection si la ligne en fait partie, sinon cette ligne seule. */
  const visesPar = (f: Fichier): Fichier[] => {
    if (!selection.ids.includes(f.id)) return [f];
    return selection.ids.map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
  };


  /**
   * ══ 🔴 COPIER UN DOSSIER : ON ANNONCE LE NOMBRE AVANT, ET C'EST LE SERVEUR QUI LE COMPTE ════════════════════
   *
   * Arno : « copie récursive, précédée d'une confirmation qui annonce le nombre d'éléments, avec une limite
   * raisonnable ». Ce nombre ne peut pas venir d'ici : l'écran ne connaît que le premier niveau, et encore, que
   * s'il l'a déplié. On le demande donc, et l'on n'agit qu'après un « Copier » explicite.
   *
   * ⚠️ UN FICHIER SEUL NE DEMANDE RIEN : copier trois pièces jointes est un geste ordinaire. C'est la RÉCURSION
   * qui se confirme, parce qu'elle seule peut emporter deux cents éléments sans qu'on l'ait vu venir.
   */
  const lancerCopie = async (elements: Fichier[], cibleId: string, cibleNom: string): Promise<void> => {
    const dossiers = elements.filter((f) => f.dossier);
    if (dossiers.length === 0) { void mouvoir('copier', elements, cibleId, cibleNom); return; }
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compter', elements: dossiers.map((f) => ({ id: f.id, nom: f.nom, dossier: true })),
        }),
      });
      const d = (await res.json()) as { etat?: string; possible?: boolean; phrase?: string; motif?: string; message?: string };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'Ce dossier n’a pas pu être compté.'); return; }
      if (d.possible !== true) { setErreur(d.motif ?? 'Cette copie est au-delà de ce que ce geste sait faire.'); return; }
      setConfirmation({
        phrase: d.phrase ?? `Copier vers « ${cibleNom} » ?`,
        agir: () => { setConfirmation(null); void mouvoir('copier', elements, cibleId, cibleNom); },
      });
    } catch { setErreur('Le Drive n’a pas répondu.'); }
  };

  /**
   * COLLER : déplacer ce qui a été coupé, copier ce qui a été copié.
   *
   * 🔴 UNE COPIE PASSE PAR LA MÊME PORTE QUE LE GLISSER AVEC ⌥ : `lancerCopie`, donc la confirmation dès qu'il y a
   * un dossier. Deux chemins qui feraient deux choses différentes — l'un annonçant le nombre, l'autre non —
   * seraient un piège tendu à celui qui apprend le geste par l'un des deux.
   */
  const coller = (cibleId: string, cibleNom: string) => {
    if (presse === null || journalPret !== true) return;
    /* ⚠️ LES ÉLÉMENTS PEUVENT NE PLUS ÊTRE À L'ÉCRAN (on a changé de dossier depuis la prise) : on reconstruit
       alors le minimum dont la route a besoin — elle relit tout chez Google de toute façon. Ce qu'on ne peut PAS
       reconstruire, c'est « est-ce un dossier » : c'est pour cela que la prise l'a retenu. */
    const liste = presse.ids.map((id) => entreeParId(id)
      ?? fichierMinimal({ id, dossier: presse.dossiers.includes(id) }));
    if (presse.mode === 'couper') { void mouvoir('deplacer', liste, cibleId, cibleNom); return; }
    void lancerCopie(liste, cibleId, cibleNom);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT DRIVE-UNIQUE — LE MODE « RANGER » : POSER UNE PIÈCE REÇUE DANS UN DOSSIER
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴 ON NE RÉÉCRIT PAS LE DÉPÔT. Il passe par la route qui existe depuis le lot 5-PJ-B, avec ses vérifications
     (la cible est bien un dossier, elle n'est pas à la corbeille, et — depuis ce lot — elle n'est pas dans
     l'archive), son doublon impossible et son journal. Ce qui change est la FAÇON DE LA VISER, pas ce qu'elle fait.

     ⚠️ UNE PIÈCE PEUT ÊTRE RANGÉE PLUSIEURS FOIS, à des endroits différents, et c'est voulu : un devis va dans le
     dossier du bien ET dans celui de l'artisan. La marque « ✓ Rangée dans X » dit le DERNIER endroit, elle ne
     ferme pas le geste.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 LOT RANGER-ARBRE-2 — ELLE REND SON VERDICT au lieu de le garder pour elle : `rangerLot` en a besoin pour
   * dire, à la fin, ce qui est passé et ce qui a été refusé. `silencieux` laisse le compte rendu d'ensemble
   * parler à sa place — sinon le dernier refus écraserait le message du lot, et l'on ne verrait qu'un seul
   * motif là où il y en a peut-être trois.
   */
  const ranger = async (
    piece: PieceARanger, cibleId: string, cibleNom: string, o: { silencieux?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; motif: string }> => {
    const echec = (motif: string) => {
      if (o.silencieux !== true) setErreur(`« ${piece.nom} » : ${motif}`);
      return { ok: false as const, motif };
    };
    if (messageId === null || cibleId === '') return { ok: false, motif: 'aucun dossier visé.' };
    if (rangementEnCours.has(piece.pieceId)) return { ok: false, motif: 'rangement déjà en cours.' };
    if (o.silencieux !== true) setErreur(null);
    setRangementEnCours((v) => new Set(v).add(piece.pieceId));

    /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
       🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA LIGNE PARAÎT AU LÂCHER
       ══════════════════════════════════════════════════════════════════════════════════════════════════════════
       CONSTAT D'ARNO (30/09/2026) : « la fenêtre affiche “✓ Rangée dans Test · ouvrir”, mais le dossier Test
       ouvert dans l'arbre ne montre PAS le fichier. Il n'apparaît qu'environ 1 minute plus tard. »

       🔴 C'EST LE MÊME PRINCIPE QUE POUR LES DÉPLACEMENTS, et c'est exprès : deux gestes qui se ressemblent
       doivent répondre pareil. Une ligne provisoire, marquée « en cours », portant LE NOM D'USAGE — pas le nom
       d'origine, sinon le renommage aurait l'air d'avoir échoué puis d'être rattrapé.

       ⚠️ ELLE NE DIT PAS « RANGÉE ». La marque « ✓ Rangée dans X » n'est posée qu'à la réception de
       l'identifiant Drive, plus bas : la ligne montre ce qui est EN TRAIN d'arriver, la marque affirme que c'est
       arrivé. Les confondre, c'était annoncer un rangement dont on n'avait encore aucune preuve. */
    const nomPourLeDrive = nomDeDepot(piece.nom, nomsChoisis.get(piece.pieceId));
    const provisoire = ligneProvisoire({ ...piece, nom: nomPourLeDrive }, cibleId);
    majListesDu(cibleId, (l) => poserLigne(l, provisoire));
    marquerEnVol([provisoire.id], true);
    const oublierLaProvisoire = () => {
      marquerEnVol([provisoire.id], false);
      majListesDu(cibleId, (l) => retirerLigne(l, piece.pieceId));
    };
    try {
      const res = await fetch(`/api/admin/gestion/pieces/${piece.pieceId}/drive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        /* 🔴 LOT RENOMMER-AVANT-RANGER — LE NOM CHOISI PART AVEC LA DEMANDE, ET C'EST LE SEUL ENDROIT QUI
           ENVOIE UN DÉPÔT : glisser, « Déposer ici », un raccourci de la barre latérale, un parent du bandeau,
           la sélection multiple — tous passent par `ranger`, donc tous emportent le nom. C'est ce qui rend la
           promesse d'Arno vraie « par tous les chemins » sans avoir à le répéter six fois.
           ⚠️ ON N'ENVOIE RIEN QUAND LE NOM N'A PAS CHANGÉ : la route retombe alors sur le nom d'origine, et la
           requête est mot pour mot celle d'avant ce lot. */
        body: JSON.stringify({
          dossierId: cibleId,
          ...(estRenommee(piece.nom, nomsChoisis.get(piece.pieceId))
            ? { nom: nomDeDepot(piece.nom, nomsChoisis.get(piece.pieceId)) }
            : {}),
        }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string; nomUsageEcrit?: boolean;
        resultats?: {
          pieceId: number; etat: string; lien?: string | null; motif?: string; driveFileId?: string | null;
        }[];
      };
      if (d.etat !== 'ok') { oublierLaProvisoire(); return echec(d.message ?? 'le rangement n’a pas abouti.'); }
      const r = (d.resultats ?? [])[0];
      // 🔴 UN ÉCHEC PIÈCE PAR PIÈCE SE DIT : la route rend un verdict par pièce, jamais un « OK » global.
      if (r === undefined || r.etat === 'echec') {
        /* 🔴 LA LIGNE PROVISOIRE DISPARAÎT, ET LE MOTIF S'AFFICHE. Une ligne optimiste qui resterait après un
           refus ferait croire à un fichier qui n'est pas là — le mensonge que l'optimisme ne doit jamais dire. */
        oublierLaProvisoire();
        return echec(r?.motif ?? 'le rangement n’a pas abouti.');
      }

      /* 🔴 GOOGLE A CONFIRMÉ : la ligne provisoire devient la VRAIE, avec l'identifiant reçu — et c'est seulement
         ICI que « ✓ Rangée » est dit. Sans cet identifiant, l'écran ne pouvait que tout redemander au Drive,
         c'est-à-dire attendre : c'est la moitié de ce lot. */
      marquerEnVol([provisoire.id], false);
      const idReel = (r.driveFileId ?? '').trim();
      if (idReel === '') {
        // Une route plus ancienne (ou un déploiement en cours) ne rend pas l'identifiant : on retombe sur la
        //   revalidation, qui est ce qui se faisait avant ce lot. Mieux vaut une seconde d'attente qu'une ligne fausse.
        oublierLaProvisoire();
      } else {
        const reelle = ligneReelle(
          { ...piece, nom: nomPourLeDrive }, { driveFileId: idReel, lien: r.lien ?? null }, cibleId);
        /**
         * 🔴🔴 ON RETIENT LE DÉPÔT AVANT DE TOUCHER AUX LISTES. Google met environ 3,8 s à faire paraître un
         * fichier neuf dans `files.list` : toute liste qui arrive d'ici là se verra réinjecter cette ligne —
         * y compris celle de la revalidation qu'on lance juste après, et qui, sans cela, l'effaçait.
         *
         * ⚠️ ET LA TRACE VAUT MÊME SI LE DOSSIER N'EST AFFICHÉ NULLE PART : la ligne paraîtra au premier
         * affichage de ce dossier, sans qu'il faille rouvrir la fenêtre.
         */
        depotsConfirmes.current = [
          ...depotsVivants(depotsConfirmes.current, Date.now()).filter((d) => d.ligne.id !== idReel),
          { dossierId: cibleId, ligne: reelle, jusqua: Date.now() + FENETRE_REINJECTION_MS },
        ];
        majListesDu(cibleId, (l) => remplacerLigne(l, piece.pieceId, reelle));
      }
      setRangees((v) => {
        const n = new Map(v);
        n.set(piece.pieceId, { dossierId: cibleId, dossierNom: cibleNom, lien: r.lien ?? null });
        return n;
      });
      /**
       * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA PASTILLE VERTE BOUGE ICI, DANS LA SECONDE ════════════════════
       *
       * CONSTAT D'ARNO : « ✓ Rangée dans… s'affiche, mais la vignette n'affiche pas la pastille verte. »
       *
       * 🔴 `+1` SEULEMENT SUR UN VRAI DÉPÔT (`depose`). Un `deja` veut dire que cette pièce était DÉJÀ dans ce
       * dossier : l'emplacement existait, il ne s'en crée pas un second (index unique `(piece_id,
       * drive_dossier_id)`). Compter quand même aurait fait monter la pastille puis la faire redescendre à la
       * relecture — un clignotement que personne ne saurait interpréter.
       *
       * 🔴 PUIS LA RELECTURE SERVEUR, qui tranche : elle lit le registre et l'index, et c'est elle la vérité.
       */
      if (r.etat === 'depose') bougerCompte(`piece:${piece.pieceId}`, 1);
      relireComptes([`piece:${piece.pieceId}`]);
      /**
       * 🔴🔴 ET LES ÉCRANS QUI MONTRENT CETTE PIÈCE AILLEURS SONT PRÉVENUS — c'est la seconde moitié du constat
       * d'Arno : « de retour dans le mail, la miniature n'a pas le picto cylindre ». Voir l'encadré de
       * `signalPieceDrive` : le statut Drive des pièces est tenu à DEUX endroits indépendants (les cartes du mail
       * et le récapitulatif de la conversation), et chacun n'était rafraîchi que par SA PROPRE fenêtre.
       */
      annoncerPiecesDrive([piece.pieceId]);
      /* 🔴 ON REVALIDE EN SILENCE, ON NE RECHARGE PLUS. `charger` vidait l'écran, remettait le défilement en haut
         et repassait par « chargement » — pour un dossier qu'on vient de mettre à jour ligne par ligne. La
         revalidation, elle, relit en arrière-plan et ne remplace que si l'on est toujours au même endroit. */
      /**
       * 🔴 « DÈS QUE ✓ RANGÉE EST CONFIRMÉ, UNE REVALIDATION SILENCIEUSE DU DOSSIER CIBLE » (Arno). Elle part
       * tout de suite, et elle ne peut plus rien effacer : le dépôt confirmé est réinjecté dans la liste
       * qu'elle rapporte (voir `lireListing`). La ligne est donc là en moins de 100 ms, et elle y reste.
       */
      revaliderEnSilence([cibleId]);
      /* L'écran du message relit ses dépôts : c'est lui qui affiche « Dans le Drive » sur la carte de la pièce.
         ⚠️ ET LE NOM D'USAGE VIENT PEUT-ÊTRE DE CHANGER (pièce renommée au stylo avant d'être rangée). On le DIT,
         plutôt que de laisser l'appelant relire le fil à chaque rangement : la carte affichait sa nouvelle
         mention « Dans le Drive » et gardait son ancien nom — la moitié de ce qui venait de changer. */
      onRangement?.({ nomChange: d.nomUsageEcrit === true });
      return { ok: true };
    } catch {
      oublierLaProvisoire();
      return echec('le serveur n’a pas répondu.');
    } finally {
      setRangementEnCours((v) => { const n = new Set(v); n.delete(piece.pieceId); return n; });
    }
  };

  /**
   * ══ 🔴 POURQUOI L'ŒIL EST PARFOIS ÉTEINT, ET CE QU'IL DIT ALORS ═════════════════════════════════════════
   *
   * Deux refus, et deux motifs distincts : un « ._ » de macOS ne CONTIENT pas le document (l'ouvrir montrerait
   * quelques kilooctets d'attributs), et un type hors liste blanche n'a pas d'aperçu du tout. Un bouton éteint
   * sans motif se lit comme une panne ; avec son motif, il se lit comme une règle.
   */
  const motifSansApercuPiece = (x: PieceARanger): string | null => {
    if (estFichierSystemeMac(x.nom)) return infobulleFichierSysteme(x.nom);
    if (sorteApercu(x.typeMime ?? '') === 'aucun') return messageSansApercu(x.typeMime ?? '');
    return null;
  };

  /**
   * OUVRE L'APERÇU D'UNE PIÈCE REÇUE.
   *
   * 🔴 LE TOUR « Précédent / Suivant » EST CELUI DES PIÈCES DU MAIL, et il est borné par un parent inventé
   * (`PARENT_PIECES`) : `voisinsVisualisables` ne retient que ce qui partage le MÊME parent, donc les pièces
   * restent entre elles et aucun fichier du Drive ne peut s'y glisser. Les deux mondes ne se mélangent jamais.
   */
  const voirPiece = (x: PieceARanger, pourRenommer = false) => {
    setRenommerDabord(pourRenommer ? x.pieceId : null);
    setAVoir({
      // ⚠️ LE NOM PASSÉ À L'APERÇU EST CELUI QU'ON A CHOISI : c'est ce qu'annonce sa barre de titre, et c'est
      //   sous ce nom-là que la pièce partira. Le nom reçu, lui, reste dit par le bandeau.
      id: String(x.pieceId), nom: nomDeDepot(x.nom, nomsChoisis.get(x.pieceId)), typeMime: x.typeMime ?? '',
      lien: null, parentId: PARENT_PIECES, source: 'piece',
    });
  };

  /**
   * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 0 — LE CRAYON NE S'ÉTEINT PLUS SUR UNE PIÈCE RANGÉE ══════════
   *
   * ANCIENNE RÈGLE (lot RENOMMER-AVANT-RANGER) : « pièce déjà rangée : le stylo est grisé, avec l'infobulle
   * “Déjà rangée — renommez-la dans le Drive”. On ne renomme jamais un fichier existant du Drive. »
   *
   * 🔴 CETTE RÈGLE EST LEVÉE PAR ARNO LE 03/10/2026 : « UN DOCUMENT = UN SEUL NOM gagne. Le crayon est ALLUMÉ
   * sur une pièce déjà rangée : il renomme toutes ses copies. » L'application SAIT renommer dans le Drive depuis
   * le lot NOM-UNIQUE-DES-PIECES — `files.update(name)` sur les seuls fichiers de notre registre, chaîne de
   * parents remontée avant chaque écriture. Le motif d'extinction était devenu faux.
   *
   * ⚠️ IL N'Y A DONC PLUS AUCUN REFUS À OPPOSER ICI, et la fonction disparaît. Les refus RÉELS (hors registre,
   * dossier protégé, Drive muet) sont prononcés par le SERVEUR, qui seul peut les connaître — et ils se disent
   * après coup, en clair, plutôt que d'éteindre un bouton par précaution.
   */

  /**
   * ══ 🔴🔴 LE CRAYON D'UNE PIÈCE : DEUX GESTES, SELON QU'ELLE EST DÉJÀ DANS LE DRIVE OU NON ═══════════════════
   *
   *   · PAS ENCORE RANGÉE — on retient le nom pour le DÉPÔT à venir, en mémoire d'écran. Rien n'existe là-bas
   *     qu'on puisse renommer, et c'est le comportement d'avant ce lot, mot pour mot.
   *   · DÉJÀ RANGÉE — le fichier existe : on renomme POUR DE VRAI, la pièce et toutes ses copies connues. C'est
   *     la décision d'Arno, et c'est le même appel que la visionneuse du mail.
   *
   * ⚠️ L'ÉCRAN SUIT DANS LES DEUX CAS, tout de suite : le nom choisi est affiché sans attendre la réponse du
   * réseau. Si le serveur refuse, il le DIT (`setErreur`) et le nom d'écran reste celui qu'on a voulu — on ne
   * remet pas l'ancien en silence, ce qui ferait croire à un clic manqué.
   */
  const renommerPiece = (pieceId: number, nomOrigine: string, nom: string) => {
    setNomsChoisis((m) => {
      const n = new Map(m);
      if (nom.trim() === '' || nom === nomOrigine) n.delete(pieceId); else n.set(pieceId, nom);
      return n;
    });
    // La barre de titre de l'aperçu porte le nom : elle doit suivre, sans quoi on lirait l'ancien juste au-dessus.
    setAVoir((v) => (v !== null && v.source === 'piece' && v.id === String(pieceId) ? { ...v, nom } : v));
    if (rangees.has(pieceId) && nom.trim() !== '') void renommerPourDeVrai({ pieceId }, nom);
  };

  /**
   * ══ 🔴🔴 LE RENOMMAGE RÉEL — LE MÊME MÉCANISME POUR UNE PIÈCE ET POUR UNE VIGNETTE ══════════════════════════
   *
   * `files.update(name)` sur des fichiers EXISTANTS, jamais une copie ni un envoi neuf. Les deux chemins ne
   * diffèrent que par la porte d'entrée : une pièce se désigne par son identifiant chez nous, une vignette par
   * son identifiant Drive — et c'est le SERVEUR qui fait le pont, par le registre.
   *
   * 🔒 UN FICHIER HORS REGISTRE EST REFUSÉ, et le refus se LIT : « ce fichier n'a pas été créé par l'application ».
   * C'est le cas des fichiers posés dans le Drive par autre chose que nous.
   */
  const renommerPourDeVrai = async (
    quoi: { pieceId: number } | { driveFileId: string }, nom: string,
  ): Promise<void> => {
    try {
      const res = 'pieceId' in quoi
        ? await fetch(`/api/admin/gestion/pieces/${quoi.pieceId}/nom?origine=visionneuse_drive`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }),
        })
        : await fetch('/api/admin/gestion/drive/renommer', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId: quoi.driveFileId, nom }),
        });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; message?: string; refus?: { motif: string }[];
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'Le renommage n’a pas abouti.'); return; }
      const refus = d.refus ?? [];
      /* ⚠️ UN REFUS PARTIEL SE DIT. La pièce EST renommée chez nous ; une copie qu'on n'a pas pu toucher n'est
         pas une panne du geste, mais le taire laisserait croire que tout a suivi. */
      setErreur(refus.length === 0 ? null : `${refus.length} copie(s) du Drive n’ont pas suivi : ${refus[0].motif}`);
      /**
       * ══ 🔴🔴 LA VIGNETTE APPREND SON NOUVEAU NOM, ET C'EST INDISPENSABLE ════════════════════════════════════
       *
       * DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, le 03/10/2026 : après avoir renommé la source en « epreuve vignette
       * source.pdf », REMETTRE « test renomage.pdf » ne partait plus. La garde « ne rien envoyer si le nom n'a
       * pas changé » comparait au nom que la vignette portait À SA CRÉATION — resté « test renomage.pdf ». Le
       * second geste paraissait donc être un non-geste, et il se perdait en silence.
       *
       * 🔴 LE NOM DE LA VIGNETTE EST DÉSORMAIS CELUI DU FICHIER, pas celui d'un instant passé. La garde compare
       * alors ce qu'il faut, et l'aller-retour fonctionne dans les deux sens.
       */
      if ('driveFileId' in quoi) {
        setVignettes((liste) => liste.map((x) => (x.driveFileId === quoi.driveFileId ? { ...x, nom } : x)));
        setNomsVignettes((m) => { const n = new Map(m); n.delete(cleVignette(quoi.driveFileId)); return n; });
      }
      /* ⚠️ LE DOSSIER AFFICHÉ PORTE PEUT-ÊTRE LE FICHIER RENOMMÉ : on OUBLIE sa page en mémoire et on la relit,
         sans quoi la ligne garderait l'ancien nom jusqu'à ce qu'on change de dossier. */
      const id = dossierCourant?.id ?? '';
      cache.current.delete(id);
      void charger(id);
    } catch {
      setErreur('Le renommage n’a pas abouti : le réseau n’a pas répondu.');
    }
  };

  /** Le voisinage du tour : les pièces visualisables du mail, et rien d'autre. */
  const voisinagePieces = pieces.map((x) => ({
    /* 🔴 LOT RENOMMER-AVANT-RANGER — LE VOISINAGE PORTE LE NOM CHOISI. C'est lui que la barre de titre affiche
       quand « Précédent / Suivant » amène cette pièce : y laisser le nom reçu ferait lire l'ancien nom juste
       au-dessus du bandeau qui annonce le nouveau. Vu à l'écran. */
    id: String(x.pieceId), nom: nomDeDepot(x.nom, nomsChoisis.get(x.pieceId)),
    typeMime: x.typeMime ?? '', dossier: false, parentId: PARENT_PIECES,
  }));

  /** Les pièces qui restent à poser : celles qu'on n'a encore rangées nulle part. */
  const piecesARanger = pieces.filter((x) => !rangees.has(x.pieceId));

  /** L'ordre du panneau, pour que ⇧-clic sache ce qu'il y a entre deux pièces. */
  const ordrePieces = pieces.map((x) => String(x.pieceId));
  /** Les identifiants cochés, en nombres — `Selection` parle en chaînes, le rangement en identifiants de pièce. */
  const idsChoisis = choixPieces.ids.map((x) => Number(x)).filter((n) => Number.isInteger(n));

  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — RANGER UN LOT, ET DIRE CE QUI N'EST PAS PASSÉ ═══════════════════════════════
   *
   * Arno : « Chaque pièce déposée passe à “✓ Rangée dans X”. En cas d'échec partiel, les pièces refusées restent
   * à ranger, avec leur motif. »
   *
   * 🔴 UNE PIÈCE APRÈS L'AUTRE, ET CHACUNE S'AFFICHE DÈS QU'ELLE EST POSÉE. Tout envoyer d'un coup aurait donné
   * un panneau figé puis quatre coches d'un seul coup ; ici la première coche arrive pendant que la deuxième
   * part. ⚠️ ET SURTOUT : chaque pièce a son propre verdict serveur, donc son propre refus et son propre motif.
   * Un « OK » global aurait caché la seule qui a été refusée.
   *
   * ⚠️ UNE PIÈCE REFUSÉE N'EST PAS MARQUÉE RANGÉE : elle reste dans le panneau, cochée, prête pour un autre
   * endroit — c'est `ranger` qui ne pose la marque que sur un succès.
   */
  const rangerLot = async (lot: readonly PieceARanger[], cibleId: string, cibleNom: string): Promise<void> => {
    if (lot.length === 0 || cibleId === '') return;
    setErreur(null);
    const poses: string[] = [];
    const refuses: { nom: string; motif: string }[] = [];
    for (const x of lot) {
      const r = await ranger(x, cibleId, cibleNom, { silencieux: lot.length > 1 });
      if (r.ok) poses.push(x.nom); else refuses.push({ nom: x.nom, motif: r.motif });
    }
    // Ce qui est posé se voit sur chaque ligne ; ce qui ne l'est pas doit se LIRE, avec son motif.
    if (lot.length > 1) setErreur(compteRenduDepot(poses, refuses));
    // Les pièces posées sortent de la sélection : ce qui reste coché est ce qui reste à faire.
    if (poses.length > 0) {
      setChoixPieces((c) => ({
        ids: c.ids.filter((id) => !lot.some((x) => String(x.pieceId) === id && poses.includes(x.nom))),
        ancre: null,
      }));
    }
  };

  /**
   * « DÉPOSER ICI » — l'autre voie, pour qui ne glisse pas (et pour le clavier, et pour le tactile).
   *
   * ⚠️ IL RANGE CE QUI RESTE À RANGER, pas tout : relancer le bouton après un premier dépôt ne doit pas redéposer
   * une pièce déjà posée ailleurs. Quand tout est rangé, il range de nouveau TOUT — c'est alors un geste explicite,
   * pour mettre le lot entier à un second endroit.
   *
   * 🔴 LOT RANGER-ARBRE-2 — ET IL SUIT LA SÉLECTION. Arno : « “Déposer ici (N)” suit la sélection, et quand rien
   * n'est sélectionné il porte sur toutes les pièces. » C'est `piecesEmportees` qui tranche, une fois pour le
   * bouton et pour le nombre qu'il affiche : un bouton qui annoncerait N et en rangerait M serait pire qu'inutile.
   */
  const lotDuBouton = piecesEmportees(null, idsChoisis, pieces,
    piecesARanger.length > 0 ? piecesARanger : pieces);
  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — « DÉPOSER ICI » RANGE AUSSI LES VIGNETTES DUPLIQUÉES ═════════════════
   *
   * Demande d'Arno. Jusqu'ici, seule le glisser-déposer savait ranger une vignette : « Déposer ici » — la seconde
   * voie, celle du tactile et de qui ne glisse pas — les ignorait en silence. Deux chemins qui ne font pas la
   * même chose sont un piège tendu à qui apprend le geste par l'un des deux.
   *
   * ⚠️ LES PIÈCES D'ABORD, LES COPIES ENSUITE, et chacune par SA route : une pièce se dépose
   * (`/pieces/{id}/drive`), une vignette se COPIE (`files.copy`). Le bouton fait les deux d'un geste ; ce sont les
   * mêmes appels que ceux du glisser, pas une troisième écriture.
   */
  const deposerToutIci = (cibleId: string, cibleNom: string) => {
    void rangerLot(lotDuBouton, cibleId, cibleNom);
    for (const v of vignettes) void rangerVignette(v, cibleId, cibleNom);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴 LE GLISSER-DÉPOSER
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     Arno : « sur un dossier → DÉPLACEMENT ; Option (⌥) → COPIE ; sur la zone Pièces jointes du mail → JOINDRE.
     Retour visuel : fantôme, dossier cible en surbrillance, curseur interdit, ouverture automatique d'un dossier
     après un survol prolongé. »

     ⚠️ CE QUI VOYAGE DANS LE GLISSER TIENT EN UN TYPE MIME À NOUS (`MIME_INTERNE`). Pas de `text/plain`, pas de
     `text/uri-list` : un nom de document du cabinet lâché dans le champ de recherche d'un autre onglet serait une
     fuite que personne ne verrait passer.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Le glisser s'arrête : plus de fantôme, plus de surbrillance, plus de ressort en attente. */
  /**
   * LE GLISSER S'ARRÊTE. `abandonne` = personne n'a rien déposé (Échap, ou lâcher dans le vide).
   *
   * 🔴 LES DÉPLIAGES AUTOMATIQUES D'UN GESTE ABANDONNÉ SE REFERMENT (demande d'Arno : « seul Arno ouvre ou ferme
   * un dossier »). Ceux d'un geste RÉUSSI restent ouverts : on vient d'y poser quelque chose, on veut le voir.
   */
  const finGlisse = (abandonne = false) => {
    // 🔴 LES VIGNETTES EN VOL S'ÉTEIGNENT COMME LES PIÈCES : sans cela, la ligne resterait estompée pour toujours.
    setVignettesGlissees([]);
    if (abandonne && depliagesDuGlisser.current.size > 0) {
      const aRefermer = depliagesDuGlisser.current;
      setOuverts((o) => {
        const n = new Set(o);
        for (const id of aRefermer) n.delete(id);
        return n;
      });
    }
    depliagesDuGlisser.current = new Set();
    enMainRef.current = null;
    setGlisse(null);
    setPiecesGlissees([]);
    setSurvole(null);
    setCibleNommee(null);
    if (ressort.current !== null) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  const demarrerGlisse = (e: React.DragEvent, f: Fichier) => {
    const elements = visesPar(f);
    if (!selection.ids.includes(f.id)) setSelection({ ids: [f.id], ancre: f.id });
    // 🔴 LA RÉFÉRENCE D'ABORD : c'est elle que le PREMIER survol lira, et l'état n'arrivera qu'au rendu suivant.
    enMainRef.current = { sorte: 'drive', ids: elements.map((x) => x.id) };
    depliagesDuGlisser.current = new Set();
    setGlisse({
      ids: elements.map((x) => x.id),
      nom: elements.length > 1 ? `${elements.length} éléments` : f.nom,
    });
    try {
      e.dataTransfer.setData(MIME_INTERNE, JSON.stringify(
        elements.map((x) => ({ id: x.id, nom: x.nom, dossier: x.dossier })),
      ));
      e.dataTransfer.effectAllowed = 'copyMove';
      /* 🔴 LE FANTÔME D'UNE SÉLECTION MULTIPLE DIT COMBIEN. Sans lui, on traîne l'image d'UNE ligne en croyant
         n'en déplacer qu'une — et l'on en déplace cinq. */
      if (elements.length > 1 && typeof document !== 'undefined') {
        const fantome = document.createElement('div');
        fantome.className = 'sfd-fantome';
        fantome.textContent = `${elements.length} éléments`;
        document.body.appendChild(fantome);
        e.dataTransfer.setDragImage(fantome, 14, 14);
        setTimeout(() => fantome.remove(), 0);
      }
    } catch { /* un navigateur qui refuse le transfert ne doit pas casser la sélection */ }
  };

  /**
   * LE SURVOL D'UNE CIBLE PENDANT LE GLISSER. Branchée sur `dragenter` ET sur `dragover`.
   *
   * 🔴 `preventDefault()` EST CE QUI AUTORISE LE DÉPÔT : sans lui, le navigateur affiche le curseur « interdit » et
   * n'émet jamais `drop`. C'est donc ici, et seulement ici, qu'on dit oui — sur un DOSSIER, jamais sur un fichier.
   *
   * ══ 🔴🔴 POURQUOI `dragenter` AUSSI, ET NON `dragover` SEUL — DÉFAUT DU 29/09/2026 ═══════════════════════════
   *
   * Elle n'était branchée que sur `dragover`, et c'est la seconde moitié du défaut d'Arno (« glisser une pièce ne
   * fait rien »). Relevé dans Chrome, sur le vrai Drive, APRÈS avoir corrigé le `dropEffect` :
   *
   *     dragenter  effect=copy  prevented=false   ← sur la cible
   *     dragover   effect=copy  prevented=true    ← acceptée
   *     dragenter  effect=copy  prevented=false   ← l'élément suivant… et plus AUCUN dragover ensuite
   *     (aucun drop)
   *
   * 🔴 LA RÈGLE DU NAVIGATEUR : une fois qu'une cible de dépôt a été établie, passer sur un élément dont le
   * `dragenter` n'est PAS annulé fait PERDRE la cible — et Chrome cesse d'émettre `dragover`. Le tout premier
   * `dragover` passe (il n'y a encore aucune cible à perdre) : c'est ce qui rendait le défaut si trompeur, et
   * c'est pourquoi lâcher aussitôt sur la première ligne survolée semblait parfois marcher.
   *
   * Éprouvé en direct : un écouteur qui annule `dragenter` sur la cible, et le dépôt part.
   *
   * ⚠️ LES DEUX APPELS SONT IDENTIQUES, et c'est voulu : il n'y a qu'une règle d'acceptation, et elle est ici.
   * En écrire deux ferait un jour deux réponses différentes à la même question.
   */
  const survolerCible = (
    e: React.DragEvent,
    cible: { id: string; nom: string; ouvrable: boolean; reel?: string },
  ) => {
    /* ⚠️ `id` sert à ALLUMER la bonne zone (le bandeau des parents et la barre latérale ont leurs propres clés) ;
       `reel` est l'identifiant Drive, le seul qui permette de reconnaître qu'on survole ce qu'on est en train de
       tenir.
       🔴 DEUX CHOSES PEUVENT ÊTRE EN VOL, et une seule à la fois : un ou plusieurs fichiers DU DRIVE (qu'on
       déplace), ou une PIÈCE REÇUE (qu'on range). Les deux visent les mêmes dossiers, par les mêmes zones. */
    /* ══ 🔴🔴 ON LIT CE QU'ON TIENT DANS UNE RÉFÉRENCE, PAS DANS L'ÉTAT ════════════════════════════════════
       🔴 LE DÉFAUT QUE CELA RÉPARE, VU SUR LE VRAI DRIVE : `setGlisse` n'est pas appliqué avant la fin du
       gestionnaire de `dragstart`. Le PREMIER `dragover` lisait donc `glisse === null` et refusait la cible — or
       Chrome n'émet `drop` QUE si le DERNIER `dragover` a été annulé. Un lâcher rapide (prendre un dossier, le
       poser aussitôt sur un autre) ne déplaçait donc RIEN, en silence. Reproduit : « LÂCHER IGNORÉ : le dernier
       survol n'a pas été accepté », l'élément toujours en place, aucun message.
       Une référence, elle, est écrite et lue dans le même tour : le premier survol est accepté. */
    const enMain = enMainRef.current;
    if (enMain === null) return;
    if (enMain.sorte === 'drive' && enMain.ids.includes(cible.reel ?? cible.id)) return;
    e.preventDefault();
    e.stopPropagation();
    /**
     * ══ 🔴🔴 L'EFFET DEMANDÉ DOIT ÊTRE PERMIS — LE DÉFAUT DU 29/09/2026 ═══════════════════════════════════════
     *
     * CONSTAT D'ARNO : « glisser une pièce du panneau “N pièce(s) à ranger” vers un dossier ne fait rien ». Ni
     * message, ni trace, ni erreur — et tous les tests de la fenêtre étaient au vert.
     *
     * REPRODUIT DANS CHROME, sur le vrai Drive, en instrumentant les événements :
     *
     *     dragstart  allowed=copy  effect=none
     *     dragover   allowed=copy  effect=move  prevented=true   ← puis plus AUCUN dragover, et aucun drop
     *
     * 🔴 LA RÈGLE DU NAVIGATEUR : si le `dropEffect` choisi n'est pas permis par l'`effectAllowed` posé au
     * `dragstart`, l'opération vaut « none ». Chrome montre le curseur « interdit », CESSE d'émettre `dragover`,
     * et n'émet JAMAIS `drop`. Annuler l'événement ne suffit donc pas : les deux conditions sont exigées.
     *
     * Cette ligne posait `move` pour tout le monde — la règle du DÉPLACEMENT d'un fichier du Drive, dont le
     * glisser est déclaré `copyMove`. Une PIÈCE REÇUE, elle, se RANGE : on la COPIE dans le Drive, le mail garde
     * la sienne, et son glisser est déclaré `copy` (voir `demarrerGlisseDePiece`). Demander `move` était une
     * contradiction que seul le navigateur voyait.
     *
     * ⚠️ ET ⌥ NE CHANGE RIEN POUR UNE PIÈCE : il n'y a pas de « ranger sans copier ». Le proposer afficherait un
     * curseur de copie sur un geste qui en est déjà une.
     */
    e.dataTransfer.dropEffect = enMain.sorte === 'piece' ? 'copy' : (e.altKey ? 'copy' : 'move');
    // On arrive quelque part : le sursis d'extinction posé par la ligne qu'on vient de quitter n'a plus lieu d'être.
    if (sursisSurvol.current !== null) { clearTimeout(sursisSurvol.current); sursisSurvol.current = null; }
    if (survole !== cible.id) setSurvole(cible.id);
    /* 🔴 L'INDICATEUR PRÈS DU CURSEUR (demande d'Arno) : « → Déposer dans “X” ». Pendant un glisser, la
       surbrillance seule ne suffit pas — la ligne visée peut être à l'autre bout de l'écran, et l'œil est sur le
       curseur. Le nom, là où l'on regarde. */
    setCibleNommee({ nom: cible.nom, x: e.clientX, y: e.clientY });
    // ⚠️ LE RESSORT : on n'en arme qu'UN, et seulement pour un dossier de la liste — pas pour le fil d'Ariane, où
    //   l'on est déjà en train de remonter, ni pour la zone des pièces jointes, qui ne s'ouvre pas.
    if (cible.ouvrable && ressort.current?.id !== cible.id) {
      if (ressort.current !== null) clearTimeout(ressort.current.minuteur);
      const idReel = cible.reel ?? cible.id;
      ressort.current = {
        id: cible.id,
        minuteur: setTimeout(() => {
          ressort.current = null;
          /* 🔴 ON DÉPLIE, ON N'ENTRE PAS. La cible reste EXACTEMENT où elle est, sous le curseur : son contenu
             s'ajoute DESSOUS. C'est ce qui permet de lâcher dessus avant, pendant ou après le dépliage.
             ⚠️ ET L'ON NOTE QUE CE DÉPLIAGE EST AUTOMATIQUE : si le glisser est abandonné (Échap, ou lâcher dans
             le vide), on le défait — « seul Arno ouvre ou ferme un dossier » (demande d'Arno). */
          setOuverts((o) => {
            if (o.has(idReel)) return o;
            depliagesDuGlisser.current.add(idReel);
            return new Set(o).add(idReel);
          });
          chargerEnfantsSiBesoin(idReel);
        }, RESSORT_MS),
      };
    }
  };

  /**
   * ══ 🔴 LOT RANGER-ARBRE-2 — ON N'ÉTEINT PAS TOUT DE SUITE, ET C'EST NÉCESSAIRE ════════════════════════════════
   *
   * Depuis que DEUX lignes voisines peuvent désigner LA MÊME cible (deux fichiers du même dossier), passer de
   * l'une à l'autre produit `dragenter` sur la nouvelle PUIS `dragleave` sur l'ancienne — c'est-à-dire, pour une
   * cible unique, « j'arrive » suivi de « je pars ». Éteindre sur-le-champ faisait clignoter la surbrillance du
   * dossier parent à chaque ligne traversée.
   *
   * ⚠️ LE DÉLAI EST UN SURSIS, PAS UNE ANIMATION : 60 ms, imperceptibles, et tout nouveau survol l'annule. Sortir
   * pour de bon éteint donc toujours — simplement un souffle plus tard.
   */
  const sursisSurvol = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quitterCible = (id: string) => {
    if (sursisSurvol.current !== null) clearTimeout(sursisSurvol.current);
    sursisSurvol.current = setTimeout(() => {
      sursisSurvol.current = null;
      setSurvole((v) => (v === id ? null : v));
    }, 60);
    if (ressort.current?.id === id) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  /** Les pièces reçues portées par ce transfert. Vide si c'en est un autre. */
  const piecesDuGlisse = (e: React.DragEvent): PieceARanger[] => {
    let brut = '';
    try { brut = e.dataTransfer.getData(MIME_PIECE); } catch { brut = ''; }
    if (brut !== '') {
      try {
        const lu = JSON.parse(brut) as { pieceIds?: number[] };
        const trouvees = pieces.filter((x) => (lu.pieceIds ?? []).includes(x.pieceId));
        if (trouvees.length > 0) return trouvees;
      } catch { /* un transfert illisible se rattrape par l'état ci-dessous */ }
    }
    // ⚠️ REPLI PAR L'ÉTAT : jsdom et quelques navigateurs ne rendent pas les données d'un transfert pendant
    //   `dragover`. Ce qu'on tient est alors ce qu'on a pris au `dragstart`, et l'on n'invente rien.
    return [...piecesGlissees];
  };

  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — SAISIR UNE PIÈCE COCHÉE LES EMPORTE TOUTES ═══════════════════════════════════
   *
   * Arno : « Glisser l'une des pièces sélectionnées emporte toute la sélection : le fantôme affiche “N pièces”. »
   *
   * ⚠️ SAISIR UNE PIÈCE **HORS** SÉLECTION N'EMPORTE QU'ELLE, et ne défait pas la sélection : c'est la règle du
   * Finder, et elle évite d'emmener par surprise trois pièces cochées cinq minutes plus tôt. Tout cela est
   * tranché par `piecesEmportees`, dans le module pur, pour que le bouton « Déposer ici » dise exactement la
   * même chose.
   */
  const demarrerGlisseDePiece = (e: React.DragEvent, piece: PieceARanger) => {
    const lot = piecesEmportees(piece, idsChoisis, pieces);
    // 🔴 LA RÉFÉRENCE D'ABORD : c'est elle que le PREMIER survol lira — l'état n'arrive qu'au rendu suivant.
    enMainRef.current = { sorte: 'piece', pieceIds: lot.map((x) => x.pieceId) };
    depliagesDuGlisser.current = new Set();
    setPiecesGlissees(lot);
    setGlisse(null);
    try {
      e.dataTransfer.setData(MIME_PIECE, JSON.stringify({ pieceIds: lot.map((x) => x.pieceId) }));
      e.dataTransfer.effectAllowed = 'copy';
      /* 🔴 LE FANTÔME DIT COMBIEN. Sans lui, on traîne la vignette d'UNE pièce en croyant n'en ranger qu'une —
         et l'on en range quatre. Même geste, même fantôme que la sélection multiple du Drive. */
      if (lot.length > 1 && typeof document !== 'undefined') {
        const fantome = document.createElement('div');
        fantome.className = 'sfd-fantome';
        fantome.textContent = motFantome(lot);
        document.body.appendChild(fantome);
        e.dataTransfer.setDragImage(fantome, 14, 14);
        setTimeout(() => fantome.remove(), 0);
      }
    } catch { /* un navigateur qui refuse le transfert ne doit pas casser le panneau */ }
  };

  /**
   * 🔴🔴 LE GLISSER D'UNE VIGNETTE DUPLIQUÉE. Même geste que celui d'une pièce, autre transfert et autre effet :
   * le lâcher COPIERA le fichier source dans le dossier visé.
   *
   * ⚠️ UNE SEULE À LA FOIS, et c'est voulu : une vignette se range « autant de fois que voulu », donc il n'y a
   * pas de sélection multiple à emporter — et un fantôme « 3 copies » promettrait trois copies d'un coup, ce que
   * personne n'a demandé.
   */
  const demarrerGlisseDeVignette = (e: React.DragEvent, v: VignetteDupliquee) => {
    enMainRef.current = { sorte: 'vignette', cles: [v.cle] };
    depliagesDuGlisser.current = new Set();
    setVignettesGlissees([v]);
    setGlisse(null);
    try {
      e.dataTransfer.setData(MIME_VIGNETTE, JSON.stringify({ cles: [v.cle] }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch { /* un navigateur qui refuse le transfert ne doit pas casser le panneau */ }
  };

  /** Les vignettes portées par ce transfert. Vide si c'en est un autre. */
  const vignettesDuGlisse = (e: React.DragEvent): VignetteDupliquee[] => {
    let brut = '';
    try { brut = e.dataTransfer.getData(MIME_VIGNETTE); } catch { brut = ''; }
    if (brut !== '') {
      try {
        const lu = JSON.parse(brut) as { cles?: string[] };
        const trouvees = vignettes.filter((x) => (lu.cles ?? []).includes(x.cle));
        if (trouvees.length > 0) return trouvees;
      } catch { /* un transfert illisible se rattrape par l'état ci-dessous */ }
    }
    // ⚠️ MÊME REPLI QUE POUR LES PIÈCES : jsdom et quelques navigateurs ne rendent pas les données en `dragover`.
    return [...vignettesGlissees];
  };

  /** Ce qui a été saisi, relu du transfert — et à défaut, de ce que l'écran se rappelle. */
  const elementsDuGlisse = (e: React.DragEvent): Fichier[] => {
    let brut = '';
    try { brut = e.dataTransfer.getData(MIME_INTERNE); } catch { brut = ''; }
    if (brut !== '') {
      try {
        const liste = JSON.parse(brut) as { id?: string; nom?: string; dossier?: boolean }[];
        const lus = liste.filter((x) => typeof x?.id === 'string' && x.id !== '')
          .map((x) => entreeParId(x.id as string) ?? fichierMinimal({ id: x.id as string, nom: x.nom, dossier: x.dossier }));
        if (lus.length > 0) return lus;
      } catch { /* un transfert illisible se rattrape ci-dessous */ }
    }
    return (glisse?.ids ?? []).map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
  };

  /**
   * LE DÉPÔT SUR UN DOSSIER : déplacement, copie si Option (⌥) est tenue — ou RANGEMENT d'une pièce reçue.
   *
   * 🔴 LE TYPE MIME TRANCHE, ET LUI SEUL. Deux types distincts (`MIME_INTERNE` pour un fichier du Drive,
   * `MIME_PIECE` pour une pièce reçue) rendent la confusion impossible : ce ne sont pas deux variantes d'un même
   * geste, ce sont deux opérations, par deux routes, avec deux journaux.
   */
  const deposerSur = (e: React.DragEvent, cible: { id: string; nom: string }) => {
    e.preventDefault();
    e.stopPropagation();
    /* 🔴🔴 LES VIGNETTES D'ABORD, ET L'ORDRE COMPTE : une vignette se COPIE, un élément du Drive se DÉPLACE.
       Les examiner après aurait laissé le cas « vignette » tomber dans la branche du déplacement le jour où un
       transfert porterait les deux types — et l'on aurait déplacé un fichier du cabinet en croyant le copier. */
    const lotVignettes = vignettesDuGlisse(e);
    if (lotVignettes.length > 0) {
      finGlisse();
      if (cible.id !== '') void rangerVignette(lotVignettes[0], cible.id, cible.nom);
      return;
    }
    const lotPieces = piecesDuGlisse(e);
    if (lotPieces.length > 0) {
      finGlisse();
      if (cible.id !== '') void rangerLot(lotPieces, cible.id, cible.nom);
      return;
    }
    const copie = e.altKey;
    const elements = elementsDuGlisse(e);
    finGlisse();
    if (elements.length === 0 || cible.id === '') return;
    if (journalPret !== true) { setErreur(MOTIF_SANS_JOURNAL); return; }
    if (copie) { void lancerCopie(elements, cible.id, cible.nom); return; }
    void mouvoir('deplacer', elements, cible.id, cible.nom);
  };

  /**
   * ══ 🔴 LE DÉPÔT SUR « PIÈCES JOINTES » ══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ LA ZONE EST DANS LE PIED DE CETTE FENÊTRE, et non sur le brouillon lui-même : ce navigateur est une fenêtre
   * MODALE qui recouvre le message — pendant un glisser, la zone du mail est littéralement derrière. La déposer
   * ici est la seule façon de la rendre atteignable sans démonter la modale.
   *
   * 🔴 ELLE N'ÉCRIT RIEN DANS LE DRIVE : elle joint, exactement comme le bouton 📎. Elle reste donc disponible
   * même sans la migration 274 (demande d'Arno : « sans elle, glisser vers le mail seulement »).
   */
  const deposerSurPiecesJointes = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const elements = elementsDuGlisse(e);
    finGlisse();
    const joignables = elements.filter((f) => !f.dossier && !estFichierSystemeMac(f.nom) && !ajoutes.includes(f.id));
    const ecartes = elements.length - joignables.length;
    if (joignables.length === 0) {
      setErreur(elements.some((f) => f.dossier)
        ? 'Un dossier ne se joint pas à un message. Déposez les fichiers qu’il contient.'
        : 'Rien de joignable dans ce qui a été déposé.');
      return;
    }
    if (ecartes > 0) {
      setErreur(`${ecartes} élément${ecartes > 1 ? 's' : ''} écarté${ecartes > 1 ? 's' : ''} : `
        + 'dossier, fichier système « ._ » ou pièce déjà jointe.');
    }
    for (const f of joignables) void joindre(f);
  };

  /**
   * ══ 🔴 LA TAILLE DE LA FENÊTRE, D'UNE OUVERTURE À L'AUTRE ═══════════════════════════════════════════════════
   *
   * Préférence LOCALE au navigateur (demande d'Arno), donc `localStorage` — et tout est sous `try/catch` : en
   * navigation privée, avec les données de site bloquées, l'accès JETTE. Une fenêtre qui ne se rappelle pas sa
   * taille est un désagrément ; une fenêtre qui ne s'ouvre pas est une panne.
   */
  useEffect(() => {
    const el = cadre.current;
    if (el === null) return undefined;
    try {
      const brut = globalThis.localStorage?.getItem(CLE_TAILLE_FENETRE) ?? null;
      if (brut !== null) {
        const t = JSON.parse(brut) as { l?: number; h?: number };
        // ⚠️ BORNÉ PAR L'ÉCRAN D'AUJOURD'HUI : une taille retenue sur un 27 pouces rendrait la fenêtre inutilisable
        //   sur un portable, avec sa croix hors de l'écran.
        if (typeof t.l === 'number' && t.l >= 520) el.style.width = `${Math.min(t.l, globalThis.innerWidth - 24)}px`;
        if (typeof t.h === 'number' && t.h >= 360) el.style.height = `${Math.min(t.h, globalThis.innerHeight - 24)}px`;
      }
    } catch { /* une préférence illisible n'est pas une panne : la fenêtre garde sa taille par défaut */ }
    if (typeof ResizeObserver !== 'function') return undefined;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver(() => {
      if (minuteur !== null) clearTimeout(minuteur);
      // On n'écrit pas à chaque pixel : on écrit quand la main s'arrête.
      minuteur = setTimeout(() => {
        try {
          const r = el.getBoundingClientRect();
          globalThis.localStorage?.setItem(CLE_TAILLE_FENETRE,
            JSON.stringify({ l: Math.round(r.width), h: Math.round(r.height) }));
        } catch { /* idem : on renonce à se rappeler, pas à fonctionner */ }
      }, 400);
    });
    obs.observe(el);
    return () => { obs.disconnect(); if (minuteur !== null) clearTimeout(minuteur); };
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE CLAVIER — flèches, Entrée, barre d'espace, Échap, et Cmd+X / Cmd+C / Cmd+V
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** ⚠️ Fonction simple, sans `useCallback` : voir plus haut — le compilateur React fait mieux tout seul. */
  const entreeParId = (id: string): Fichier | null =>
    lignes.find((l) => l.entree.id === id)?.entree ?? null;

  const ouvrirSelection = () => {
    const id = selection.ids.at(-1);
    if (id === undefined) return;
    const f = entreeParId(id);
    if (f === null) return;
    if (f.dossier) { ouvrirDossier(f); return; }
    visualiser(f, listing?.joindreAutorise === true);
  };

  const surTouche = (e: React.KeyboardEvent) => {
    /**
     * 🔴 ÉCHAP FERME LA FENÊTRE — SAUF SI L'APERÇU EST OUVERT : il ferme alors l'aperçu d'abord (demande d'Arno).
     * L'aperçu étant rendu HORS de cette fenêtre, il écoute Échap lui-même ; on se contente de ne pas doubler.
     */
    if (e.key === 'Escape') {
      /* 🔴 ÉCHAP PENDANT UN GLISSER = ABANDON PROPRE (demande d'Arno) : rien ne bouge, et les dossiers que le
         ressort avait dépliés se referment.
         ⚠️ EN PRATIQUE, CHROME NOUS DEVANCE : il annule le glisser lui-même et émet `dragend`, que nous traitons
         déjà comme un abandon. Ce cas-ci couvre les navigateurs qui laissent passer la touche — et il ne coûte
         qu'une ligne pour ne pas dépendre d'un détail d'implémentation. */
      if (enMainRef.current !== null) { e.preventDefault(); e.stopPropagation(); finGlisse(true); return; }
      if (aVoir !== null) return;
      if (menu !== null) { e.preventDefault(); setMenu(null); return; }
      /**
       * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — « Échap = Annuler » (Arno, mot pour mot), ET AVANT TOUT
       * LE RESTE. Posée ici, la touche renonce à la mise à la corbeille sans fermer la fenêtre ni toucher au
       * reste : c'est la sortie qu'on cherche quand on vient de lire la phrase et qu'on a changé d'avis.
       *
       * ⚠️ PLACÉE AVANT `confirmation` : les deux ne peuvent pas être ouvertes ensemble, mais l'ordre fixe la
       * réponse si cela arrivait un jour — et c'est celle qui ne détruit rien qui doit gagner.
       */
      if (aJeter !== null) { e.preventDefault(); setAJeter(null); return; }
      if (confirmation !== null) { e.preventDefault(); setConfirmation(null); return; }
      // 🔴 ÉCHAP ANNULE LA COUPE (demande d'Arno) avant de fermer : on renonce au geste, pas à la fenêtre.
      if (presse !== null) { e.preventDefault(); setPresse(null); return; }
      // 🔴 ÉCHAP FERME LA LIGNE NEUVE, et rien n'est créé (demande d'Arno).
      if (ligneNeuve.c !== 'ferme') { e.preventDefault(); oublierCreation(); return; }
      e.stopPropagation();
      onFermer();
      return;
    }

    /* ══ 🔴 COUPER / COPIER / COLLER — la presse-papiers INTERNE à l'application ═══════════════════════════════
       ⚠️ ELLE NE TOUCHE JAMAIS AU PRESSE-PAPIERS DU SYSTÈME : ce qu'on « coupe » ici est une intention, pas une
       donnée. Rien ne quitte l'application, et rien n'est retiré du Drive tant qu'on n'a pas collé. */
    if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'c' || e.key === 'v')) {
      e.preventDefault();
      if (e.key === 'v') {
        // 🔴 LOT RANGER-ARBRE-2 — voir `cibleDuCollage` : un fichier n'est jamais une cible, il en désigne une.
        const ou = cibleDuCollage();
        if (ou !== null && ou.id !== '') coller(ou.id, ou.nom);
        return;
      }
      if (selection.ids.length === 0) return;
      const pris = selection.ids.map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
      setPresse({
        mode: e.key === 'x' ? 'couper' : 'copier',
        ids: [...selection.ids],
        dossiers: pris.filter((x) => x.dossier).map((x) => x.id),
        parentSource: dossierCourant?.id ?? null,
      });
      return;
    }
    if (menu !== null) setMenu(null);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSelection((s) => selectionSuivante(s, ordre, e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); ouvrirSelection(); return; }
    /** 🔴 LA BARRE D'ESPACE : le « Coup d'œil » du Finder. Sur un dossier, elle ne fait rien — il n'y a rien à voir. */
    if (e.key === ' ' && selection.ids.length === 1) {
      const f = entreeParId(selection.ids[0]);
      if (f !== null && !f.dossier) {
        e.preventDefault();
        visualiser(f, listing?.joindreAutorise === true);
      }
    }
  };

  /**
   * 🔴 CE QUI EST DÉPLIÉ SURVIT À LA FERMETURE DE LA FENÊTRE, le temps de la session.
   *
   * 🔴🔴 LOT DRIVE-FERME — ET LA SIGNATURE PART AVEC, DANS LA MÊME ÉCRITURE. Les deux doivent rester d'accord :
   * un arbre retenu sans sa signature serait restauré pour n'importe quelles pièces (le défaut qu'Arno a vu), et
   * une signature sans arbre ne restaurerait rien. Les écrire ensemble est ce qui l'assure.
   */
  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(CLE_DEPLIES, JSON.stringify([...ouverts].slice(-DEPLIES_MAX)));
      globalThis.sessionStorage?.setItem(CLE_SESSION, signature);
    } catch { /* pas de stockage : l'arbre vit seulement tant que la fenêtre est ouverte, et c'est déjà l'essentiel */ }
  }, [ouverts, signature]);

  /** Le défilement suit la sélection au clavier : une ligne choisie hors de l'écran ne sert à rien. */
  useEffect(() => {
    const id = selection.ids.at(-1);
    if (id === undefined || scene.current === null) return;
    const i = ordre.indexOf(id);
    if (i < 0) return;
    const haut = i * HAUTEUR_LIGNE;
    const el = scene.current;
    if (haut < el.scrollTop) el.scrollTop = haut;
    else if (haut + HAUTEUR_LIGNE > el.scrollTop + el.clientHeight) {
      el.scrollTop = haut + HAUTEUR_LIGNE - el.clientHeight;
    }
  }, [selection, ordre]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE MENU CONTEXTUEL
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (menu === null) return undefined;
    const fermer = () => setMenu(null);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    return () => { window.removeEventListener('scroll', fermer, true); window.removeEventListener('resize', fermer); };
  }, [menu]);

  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — ON MESURE, PUIS ON RECADRE ═══════════════════════════════════════════
   *
   * `useLayoutEffect` et non `useEffect` : la mesure et le recadrage doivent avoir lieu AVANT que le navigateur
   * peigne, sans quoi on verrait le menu apparaître au mauvais endroit puis sauter. Le menu est rendu invisible
   * tant que `poseMenu` est `null`, ce qui couvre le cas où la mesure n'aboutirait pas.
   *
   * ⚠️ `getBoundingClientRect` SUR LE MENU LUI-MÊME : c'est la seule taille vraie. L'estimer à partir du nombre
   * d'entrées se tromperait justement quand un motif de refus tient sur trois lignes — c'est-à-dire dans le cas
   * qui déborde.
   */
  useLayoutEffect(() => {
    if (menu === null) { setPoseMenu(null); return; }
    const el = cadreMenu.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    setPoseMenu(recadrerMenu(
      { x: menu.x, y: menu.y },
      { largeur: r.width, hauteur: r.height },
      { largeur: window.innerWidth, hauteur: window.innerHeight },
    ));
  }, [menu]);

  /**
   * 🔴 CE QUE LE MENU A LE DROIT DE PROPOSER POUR LA MÉMOIRE TAMPON. Sans la migration 274, les trois entrées sont
   * ÉTEINTES avec leur motif — et non absentes : la fonction existe et attend quelque chose, ce n'est pas la même
   * information qu'un geste qui n'existe pas.
   */
  const droitsPresse = (): DroitsPresse => ({
    autorise: journalPret === true,
    motif: journalPret === true ? null
      : journalPret === null ? 'Vérification en cours…' : MOTIF_SANS_JOURNAL,
    motColler: motColler(presse),
    presseVide: presse === null,
  });

  const entreesDuMenu = (f: Fichier | null): EntreeMenu[] => (f === null
    ? menuVide({
      creerAutorise: listing?.creerAutorise === true,
      motifCreation: listing?.motifCreation ?? null,
      presse: droitsPresse(),
    })
    : f.dossier
    ? menuDossier({
      creerAutorise: listing?.creerAutorise === true,
      motifCreation: listing?.motifCreation ?? null,
      avecLien: (f.lien ?? '') !== '',
      presse: droitsPresse(),
    })
    /* 🔴🔴 UN FICHIER « ._ » EST TRAITÉ COMME UN ENDROIT OÙ LA LECTURE EST REFUSÉE : « Visualiser » et « Joindre »
       éteints, avec pour motif l'infobulle qui renvoie au VRAI fichier. Le reste — lien, Drive, couper, copier,
       coller — n'est pas touché : ces gestes-là ne lisent rien. */
    : menuFichier({
      joindreAutorise: listing?.joindreAutorise === true && !estFichierSystemeMac(f.nom),
      motifRefus: estFichierSystemeMac(f.nom) ? infobulleFichierSysteme(f.nom) : (listing?.motifRefus ?? null),
      dejaAjoute: ajoutes.includes(f.id),
      avecLien: (f.lien ?? '') !== '',
      presse: droitsPresse(),
      corbeille: droitsCorbeille(),
      dupliquer: droitsDupliquer(f),
      /**
       * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — « EN COURS D'ÉCRITURE » SE LIT DANS LE MODE, ET NULLE PART AILLEURS.
       *
       * `mode === 'joindre'` est exactement « la fenêtre a été ouverte depuis un message qu'on rédige » : c'est
       * l'éditeur (`Redaction.tsx`) et lui seul qui ouvre la fenêtre ainsi — nouveau message, réponse, transfert,
       * brouillon repris. Les deux autres appelants (`PiecesJointes`, `Conversation`) rangent des pièces d'un
       * mail REÇU et passent `mode="ranger"`.
       */
      ecriture: mode === 'joindre',
    }));

  /**
   * ══ 🔴🔴 QUAND « Dupliquer en vignette » EXISTE-T-IL ? ═══════════════════════════════════════════════════════
   *
   * `null` ⇒ ABSENT. Trois cas, et chacun a sa raison :
   *   ① HORS DU MODE « ranger » : il n'y a pas de colonne de gauche où poser la vignette ;
   *   ② SOUS « Documents clients scannés » (`joindreAutorise` faux) : la vignette n'existe que pour être copiée,
   *      et rien ne sort de l'archive. On ne montre pas la porte d'un endroit où l'on ne doit jamais entrer ;
   *   ③ SUR UN « ._ » de macOS : il ne contient pas le document, sa copie ne vaudrait rien.
   *
   * ⚠️ ÉTEINT AVEC SON MOTIF quand la vignette est DÉJÀ posée : une seule se range autant de fois qu'on veut.
   */
  const droitsDupliquer = (f: Fichier): { deja: boolean; motifInactif?: string | null } | null => {
    if (mode !== 'ranger') return null;
    if (listing !== null && listing.joindreAutorise !== true) return null;
    if (estFichierSystemeMac(f.nom)) return null;
    /**
     * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — ABSENTE SI CE DOCUMENT EST DÉJÀ EN VIGNETTE ════════════════════════
     *
     * DEMANDE D'ARNO : « “Dupliquer en vignette” n'apparaît PAS si ce document (même source OU même empreinte)
     * est déjà en vignette dans la colonne de gauche. »
     *
     * 🔴 LES DEUX CRITÈRES, ET LE SECOND COMPTE AUTANT QUE LE PREMIER. « Même source » attrape le fichier qu'on
     * vient de dupliquer ; « même empreinte » attrape SA COPIE, rangée ailleurs sous un autre identifiant et
     * parfois sous un autre nom. Sans lui, on poserait deux vignettes du MÊME document sans s'en apercevoir, et
     * on le copierait deux fois.
     *
     * ⚠️ ABSENTE, ET NON ÉTEINTE (c'est le masquage qu'Arno demande) : il n'y a rien à expliquer, la vignette est
     * sous les yeux, à gauche. Une entrée grisée de plus allongerait le menu sans rien apprendre.
     */
    const memeEmpreinte = (f.md5 ?? '') !== ''
      && vignettes.some((v) => (v.md5 ?? '') !== '' && v.md5 === f.md5);
    if (dejaDupliquee(vignettes, f.id) || memeEmpreinte) return null;
    return { deja: false };
  };

  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — QUAND L'ENTRÉE « Supprimer » EXISTE-T-ELLE ? ═════════════
   *
   * `null` ⇒ ELLE N'EXISTE PAS DU TOUT, et c'est le cas le plus important :
   *
   *   🔴🔴 ① SOUS « Documents clients scannés », `listing.joindreAutorise` est FAUX — c'est le verdict que le
   *      serveur a déjà prononcé pour ce dossier, en remontant ses parents. On s'y accroche plutôt que d'inventer
   *      un second test : deux règles qui répondent à « suis-je dans l'archive ? » finiraient par diverger, et le
   *      jour où elles divergent, c'est un document d'archive qui part à la corbeille. Arno demande que l'entrée
   *      N'APPARAISSE PAS là-bas, et non qu'elle y soit éteinte : on ne montre pas la porte d'un endroit où l'on
   *      ne doit jamais entrer.
   *
   *   ② TANT QUE LA SONDE N'A PAS RÉPONDU (`null`) : on n'annonce pas un geste irréversible à trente jours avant
   *      de savoir s'il est possible.
   *
   * ⚠️ ÉTEINTE AVEC SON MOTIF quand les migrations manquent : là, un refus expliqué vaut mieux qu'une absence —
   * la fonction existe et attend quelque chose, ce n'est pas la même information qu'un geste qui n'existe pas.
   *
   * 🔴 ET CE N'EST PAS LA PROTECTION. C'est la route qui refuse, par ascendance de dossiers relue chez Google à
   * chaque appel. Ceci n'est que ce que l'écran propose.
   */
  const droitsCorbeille = (): { autorise: boolean; motifInactif: string | null } | null => {
    if (corbeillePrete === null) return null;
    if (listing !== null && listing.joindreAutorise !== true) return null;
    return corbeillePrete
      ? { autorise: true, motifInactif: null }
      : {
        autorise: false,
        motifInactif: 'Indisponible : la mise à jour de la base qui consigne ce geste (295) n’est pas appliquée.',
      };
  };

  const agirMenu = (a: ActionMenu, f: Fichier | null) => {
    setMenu(null);
    /* ══ 🔴 LE MENU DU VIDE : trois gestes, et ils portent sur le DOSSIER AFFICHÉ ═══════════════════════════ */
    if (f === null) {
      if (a === 'nouveau_dossier') {
        ouvrirLigneNeuve(dossierCourant?.id ?? '', dossierCourant?.nom ?? 'ce dossier');
        return;
      }
      if (a === 'coller') {
        const cible = dossierCourant?.id ?? '';
        if (cible !== '') coller(cible, dossierCourant?.nom ?? 'ce dossier');
        return;
      }
      if (a === 'actualiser') revaliderEnSilence([dossierCourant?.id ?? '']);
      return;
    }
    if (a === 'ouvrir') { ouvrirDossier(f); return; }
    if (a === 'visualiser') { visualiser(f, listing?.joindreAutorise === true); return; }
    if (a === 'joindre') { void joindre(f); return; }
    if (a === 'lien') { lier(f); return; }
    if (a === 'ouvrir_google') { ouvrirChezGoogle(f); return; }
    if (a === 'nouveau_dossier') {
      /* 🔴 LA LIGNE NAÎT DANS CE DOSSIER-LÀ, QUI SE DÉPLIE (demande d'Arno). On n'y ENTRE plus : entrer faisait
         perdre la vue d'ensemble pour créer un sous-dossier, alors que tout l'intérêt de l'arbre est de voir
         l'endroit et ses voisins pendant qu'on crée. */
      if (!ouverts.has(f.id)) basculerDepliage(f);
      ouvrirLigneNeuve(f.id, f.nom);
      return;
    }
    if (a === 'actualiser') { revaliderEnSilence([dossierCourant?.id ?? '']); return; }
    /* 🔴 LES MÊMES GESTES QUE ⌘X / ⌘C / ⌘V, par la même porte : `visesPar` étend à la sélection si la ligne en
       fait partie, exactement comme le clavier. Deux chemins qui feraient deux choses différentes seraient un
       piège. */
    if (a === 'couper' || a === 'copier') {
      const pris = visesPar(f);
      setPresse({
        mode: a === 'couper' ? 'couper' : 'copier',
        ids: pris.map((x) => x.id),
        dossiers: pris.filter((x) => x.dossier).map((x) => x.id),
        parentSource: dossierCourant?.id ?? null,
      });
      return;
    }
    if (a === 'coller') {
      /* 🔴 SUR UN DOSSIER, ON COLLE DEDANS ; sur un fichier, dans LE DOSSIER QUI LE CONTIENT — son parent réel
         s'il est affiché sous un dossier déplié, et non « le dossier affiché » comme l'écrivait ce commentaire
         avant le lot RANGER-ARBRE-2. Voir `cibleDeLaLigne`. */
      const ou = cibleDeLaLigne(f);
      if (ou !== null && ou.id !== '') coller(ou.id, ou.nom);
      return;
    }
    /**
     * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LE CLIC N'AGIT PAS : IL DEMANDE.
     *
     * Aucun appel ne part d'ici. On ouvre la confirmation, et c'est elle — et elle seule — qui déclenche. Un geste
     * qui retire un document d'un dossier où quelqu'un ira le chercher ne se prend pas sur un clic de menu, fût-il
     * en dernière position.
     *
     * ⚠️ `visesPar` N'EST PAS EMPLOYÉ ICI, à la différence de « Couper » et « Copier » : la confirmation nomme UN
     * fichier et UN chemin. Étendre le geste à une sélection qu'on ne nommerait pas ferait partir à la corbeille
     * des fichiers que la phrase n'a pas annoncés.
     */
    /**
     * ══ 🔴🔴 « DUPLIQUER EN VIGNETTE » — AUCUNE ÉCRITURE N'A LIEU ICI ════════════════════════════════════════
     *
     * Le clic pose une vignette dans la colonne de gauche, et rien d'autre. Le fichier d'origine ne bouge pas,
     * ses rangements existants non plus : rien n'est envoyé à Google. L'écriture n'arrivera qu'au RANGEMENT de
     * cette vignette, et ce sera une COPIE vers un dossier qu'on aura désigné.
     */
    if (a === 'dupliquer_vignette') {
      setVignettes((v) => ajouterVignette(v, {
        cle: cleVignette(f.id), driveFileId: f.id, nom: f.nom,
        tailleOctets: f.tailleOctets, typeMime: f.typeMime, lien: f.lien ?? null,
        /* 🔴 L'EMPREINTE VOYAGE AVEC LA VIGNETTE : c'est elle qui permet de reconnaître une COPIE du même
           document ailleurs dans l'arbre, et donc de ne pas en poser une seconde vignette. */
        md5: f.md5 ?? null,
      }));
      return;
    }
    if (a === 'mettre_corbeille') {
      const ou = cibleDeLaLigne(f);
      setAJeter({
        id: f.id,
        nom: f.nom,
        /* Le chemin COMPLET, tel qu'on le lit dans le bandeau : c'est lui qui distingue deux homonymes. */
        chemin: [...chemin.map((e) => e.nom), ...(ou !== null && ou.id !== (dossierCourant?.id ?? '') ? [ou.nom] : [])]
          .join(' / '),
        parentNom: ou?.nom ?? dossierCourant?.nom ?? '',
      });
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 METTRE À LA CORBEILLE — APRÈS LA CONFIRMATION, ET JAMAIS AVANT
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 LE GESTE PART AVEC LE COMPTE DE L'UTILISATEUR (le jeton lui appartient, comme pour le renommage) : c'est
   * SA corbeille qui reçoit le fichier, et ce sont SES droits qui décident. Un refus 403 est donc une information
   * exacte — on l'affiche en toutes lettres plutôt que de le faire passer pour une panne.
   *
   * ⚠️ AUCUN AFFICHAGE OPTIMISTE ICI, à la différence du déplacement. Un déplacement raté se corrige en remettant
   * la ligne ; une ligne qu'on aurait fait disparaître à tort ferait croire le document perdu. On attend donc la
   * réponse de Google, puis on relit le dossier.
   */
  const jeterALaCorbeille = async (cible: { id: string; nom: string; parentNom: string }): Promise<void> => {
    setErreur(null);
    setJetEnCours(true);
    try {
      const res = await fetch('/api/admin/gestion/drive/corbeille', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'corbeille', elements: [{ id: cible.id, nom: cible.nom }] }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string;
        faits?: { id: string; nom: string }[]; refuses?: { nom: string; motif: string }[];
        mouvements?: number[];
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'La mise à la corbeille n’a pas pu être faite.'); return; }
      if ((d.refuses ?? []).length > 0) {
        setErreur((d.refuses ?? []).map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      const faits = d.faits ?? [];
      if (faits.length === 0) return;
      setBandeau({ mot: motCorbeilleFaite(faits.length), mouvements: d.mouvements ?? [], sorte: 'corbeille' });
      /* 🔴 LE PAS ENTRE DANS LA MÊME PILE QUE LES DÉPLACEMENTS : un clic sur « Annuler » défait le plus récent,
         quel qu'il soit. C'est `sorte` qui dira ensuite quelle route appeler et quel mot écrire. */
      setPileAnnulation((pile) => empiler(pile, {
        mouvements: d.mouvements ?? [],
        nom: cible.nom,
        nombre: faits.length,
        origineNom: cible.parentNom,
        sorte: 'corbeille',
      }));
      /**
       * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « LA CORBEILLE FAIT REDESCENDRE LE COMPTEUR » (ARNO) ════════════
       *
       * 🔴 AUCUN DELTA DEVINÉ ICI, ET C'EST DÉLIBÉRÉ : l'écran ne sait pas de quelle(s) pièce(s) ce fichier est
       * la copie — donc pas quelle pastille baisse. Le registre le sait, lui : la route vient de marquer la copie
       * « disparue » et de retirer la ligne de l'index, et la relecture lit exactement cela. On redemande donc,
       * sans rien inventer. Même raison que `DELTA` absent pour « un MAIL à la corbeille » au lot COMPTEURS :
       * « un delta faux afficherait un chiffre qui saute, et c'est pire qu'un chiffre qui attend 150 ms ».
       */
      relireComptes();
      annoncerPiecesDrive();
      revaliderEnSilence([dossierCourant?.id ?? '']);
    } catch {
      setErreur('Le Drive n’a pas répondu.');
    } finally {
      setJetEnCours(false);
      setAJeter(null);
    }
  };

  /**
   * 🔴🔴 SORTIR DE LA CORBEILLE — c'est « Annuler », appliqué à un pas de corbeille.
   *
   * ⚠️ IL PASSE PAR LA MÊME ROUTE ET LE MÊME VERDICT que la mise à la corbeille : remettre un fichier en place
   * est un geste sur ce fichier, et il n'a droit à aucun régime de faveur — sans quoi « je l'y mets, je l'en
   * sors » deviendrait une porte de sortie de l'archive.
   */
  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 RANGER UNE VIGNETTE DUPLIQUÉE = COPIER LE FICHIER SOURCE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     🔴 PAR LA ROUTE DE DÉPLACEMENT, EN MODE « copier », ET C'EST DÉLIBÉRÉ. C'est « le même mécanisme de copie que
     l'existant » (Arno) : le même `files.copy`, le même verdict d'archive remonté chez Google à chaque appel, et
     le même journal. Écrire une seconde voie de copie aurait voulu dire une seconde écriture du garde-fou.

     🔴 ET C'EST CE JOURNAL QUI EST « LE REGISTRE DE L'APPLI ». Chaque copie y laisse une ligne `copier` portant
     `drive_id` = LA SOURCE et `copie_drive_id` = la copie : toutes les copies d'un même document partagent donc
     la même source, « rattachées au même document source » comme Arno le demande. C'est aussi ce qui permettra à
     la loupe de les retrouver.

     ⚠️ LA VIGNETTE RESTE APRÈS LE RANGEMENT : « autant de fois que voulu ». On ne la retire pas, on compte.
     ⚠️ L'ORIGINAL NE BOUGE JAMAIS : `files.copy` ne touche pas la source, et la route n'émet rien d'autre. */
  const rangerVignette = async (
    v: VignetteDupliquee, cibleId: string, cibleNom: string,
  ): Promise<void> => {
    if (cibleId === '' || vignettesEnCours.has(v.cle)) return;
    setErreur(null);
    setVignettesEnCours((s) => new Set(s).add(v.cle));
    try {
      const choisi = (nomsVignettes.get(v.cle) ?? '').trim();
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'copier',
          cible: cibleId,
          /* ⚠️ `nomCible` N'EST ENVOYÉ QUE S'IL Y EN A UN : absent, Google nomme la copie comme l'original —
             mot pour mot le comportement du « Copier / Coller » du navigateur de fichiers. */
          elements: [{
            id: v.driveFileId, nom: v.nom, dossier: false,
            ...(choisi === '' || choisi === v.nom ? {} : { nomCible: choisi }),
          }],
        }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string; nomCible?: string;
        faits?: { id: string; nom: string; copieId?: string | null }[];
        refuses?: { nom: string; motif: string }[];
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'La copie n’a pas abouti.'); return; }
      if ((d.refuses ?? []).length > 0) {
        setErreur((d.refuses ?? []).map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      if ((d.faits ?? []).length === 0) return;
      setVignettesRangees((m) => {
        const n = new Map(m);
        const avant = n.get(v.cle);
        n.set(v.cle, { dossierNom: cibleNom, lien: null, nb: (avant?.nb ?? 0) + 1 });
        return n;
      });
      /**
       * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA PASTILLE DE LA VIGNETTE DUPLIQUÉE SUIT LE MÊME GESTE. Arno l'a
       * nommée dans la liste des chemins : « glisser, “Déposer ici”, copie d'une vignette dupliquée ».
       *
       * ⚠️ `+1` SANS CONDITION ICI, et c'est exact : `files.copy` CRÉE un fichier à chaque appel — il n'existe
       * pas de « déjà là » pour une copie, et c'est pourquoi la vignette se range « autant de fois que voulu ».
       *
       * ⚠️ LE SIGNAL PART SANS LISTE DE PIÈCES : ce fichier du Drive peut être la copie d'une pièce que nous
       * connaissons, et l'écran ne sait pas laquelle. « On ne sait pas lesquelles » fait relire tout le monde —
       * voir l'encadré de `concernePieces`.
       */
      bougerCompte(v.cle, 1);
      relireComptes([v.cle]);
      annoncerPiecesDrive();
      setBandeau({ mot: motCopieRangee(choisi === '' ? v.nom : choisi, cibleNom), mouvements: [] });
      // ⚠️ ON SE MET D'ACCORD AVEC LE DRIVE : la copie vient de naître dans la cible.
      revaliderEnSilence([cibleId, dossierCourant?.id ?? '']);
    } catch {
      setErreur('Le Drive n’a pas répondu.');
    } finally {
      setVignettesEnCours((s) => { const n = new Set(s); n.delete(v.cle); return n; });
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LA LOUPE — ACTIVER, DÉSACTIVER, ET CE QU'ELLE SURLIGNE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 UN INTERRUPTEUR, PAS UN BOUTON D'ACTION (Arno : « clic = active ou désactive »). Recliquer sur la même
   * loupe éteint le surlignage ; cliquer sur une autre déplace la localisation, sans jamais en laisser deux.
   *
   * 🔒 LECTURE SEULE : la route ne fait que des `files.get` et une lecture du journal. Rien n'est écrit, nulle
   * part — y compris quand une occurrence se trouve dans « Documents clients scannés », dont les ANCÊTRES
   * peuvent être lus (un nom, un parent) mais jamais modifiés.
   */
  const basculerLoupe = async (
    cle: string, driveFileId: string, pieceId: number | null = null,
  ): Promise<void> => {
    if (loupeSur === cle) { setLoupeSur(null); setLocalisation(null); return; }
    setLoupeSur(cle);
    setLocalisation(null);
    try {
      /* 🔴 DEUX PORTES, UNE SEULE ROUTE : une vignette dupliquée EST un fichier du Drive ; une pièce du message
         n'en est pas un tant qu'elle n'a pas été rangée, et c'est le registre des dépôts qui la situe. */
      const adresse = driveFileId !== ''
        ? `source=${encodeURIComponent(driveFileId)}`
        : `piece=${encodeURIComponent(String(pieceId ?? 0))}`;
      const res = await fetch(`/api/admin/gestion/drive/localiser?${adresse}`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; message?: string; md5?: string | null;
        occurrences?: Occurrence[]; parRegistre?: number; indexes?: number;
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'La localisation n’a pas abouti.'); setLoupeSur(null); return; }
      setLocalisation({
        md5: d.md5 ?? null, occurrences: d.occurrences ?? [], parRegistre: d.parRegistre ?? 0,
        indexes: d.indexes ?? 0,
      });
    } catch {
      setErreur('Le Drive n’a pas répondu.');
      setLoupeSur(null);
    }
  };

  /**
   * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LE REPÈRE, DÈS L'OUVERTURE ═══════════════════════════════
   *
   * On allume la MÊME loupe, par le MÊME chemin : il n'y a donc qu'un dessin de mise en évidence dans tout
   * l'écran, et il est déjà éprouvé.
   *
   * ⚠️ UNE SEULE FOIS, GARDÉE PAR UNE RÉFÉRENCE. `basculerLoupe` est un interrupteur : rappelé, il ÉTEINDRAIT
   * ce qu'on vient d'allumer. Et comme la fonction se recrée à chaque rendu, la mettre en dépendance aurait
   * rallumé puis éteint le repère en boucle.
   */
  const evidencePosee = useRef(false);
  useEffect(() => {
    const id = documentEnEvidence?.driveFileId ?? '';
    if (id === '' || evidencePosee.current) return;
    evidencePosee.current = true;
    void basculerLoupe(`evidence:${id}`, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interrupteur : voir l'encadré ci-dessus.
  }, [documentEnEvidence]);

  /**
   * ══ 🔴🔴 CE QUE L'ARBRE DOIT SURLIGNER, À CHAQUE NIVEAU ════════════════════════════════════════════════════
   *
   * Deux apports, et ils se complètent :
   *   ① LES OCCURRENCES DU REGISTRE, avec leur chaîne complète de dossiers — rendues par la route ;
   *   ② 🔴 LES FICHIERS DÉJÀ LISTÉS QUI PORTENT LA MÊME EMPREINTE. L'API Drive ne sait pas chercher par
   *      empreinte : la seule comparaison possible sans balayer le Drive porte sur ce que la fenêtre a DÉJÀ lu —
   *      et elle l'a lu dans le même appel que la liste, donc sans un octet de plus.
   *
   * ⚠️ LEUR CHEMIN EST CELUI DU DOSSIER OÙ ON LES A VUS : on connaît leur parent (chaque ligne le porte), et la
   * chaîne de ce parent est celle qu'on est en train d'afficher. On ne redemande donc rien à Google.
   */
  const surlignage: Surlignage = (() => {
    if (loupeSur === null || localisation === null) return SURLIGNAGE_VIDE;
    const occurrences: Occurrence[] = [...localisation.occurrences];
    const md5 = (localisation.md5 ?? '').trim();
    if (md5 !== '') {
      const deja = new Set(occurrences.map((o) => o.id));
      for (const [parentId, liste] of listesParDossier()) {
        for (const f of liste) {
          if (f.dossier || deja.has(f.id) || (f.md5 ?? '') === '' || f.md5 !== md5) continue;
          deja.add(f.id);
          occurrences.push({
            id: f.id, nom: f.nom, voie: 'empreinte',
            chemin: cheminDuDossier(parentId),
          });
        }
      }
    }
    /**
     * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LES LIGNES RÉELLEMENT AFFICHÉES DÉCIDENT DU REPÈRE.
     *
     * C'est ce qui fait descendre le repère tout seul quand on déplie : la ligne de l'enfant apparaît dans
     * `lignes`, elle devient le nœud visible le plus profond, et le repère quitte le parent sans qu'on ait rien à
     * calculer. On n'y ajoute QUE le dossier courant — il n'est pas une ligne de la liste, mais il est bien à
     * l'écran (c'est le dossier qu'on regarde), et un emplacement qui s'y trouve doit pouvoir s'y marquer.
     */
    const affichees = new Set<string>(lignes.map((l) => l.entree.id));
    const ici = dossierCourant?.id ?? '';
    if (ici !== '') affichees.add(ici);
    return surlignageDe(occurrences, affichees);
  })();

  /** Combien de dossiers la fenêtre a déjà lus : c'est l'étendue de la comparaison par empreinte, et on le DIT. */
  const dossiersLus = listesParDossier().length;

  /**
   * 🔴 LE COMPTEUR VERT SE DEMANDE UNE FOIS PAR VIGNETTE, et jamais deux. `comptesDemandes` retient ce qui est
   * parti : sans lui, chaque rendu de la colonne relancerait autant de requêtes qu'elle porte de vignettes.
   *
   * ⚠️ IL NE BLOQUE RIEN : tant que la réponse n'est pas là, la vignette s'affiche sans compteur — ce qui est
   * aussi ce qu'elle affichera si le document n'est rangé nulle part.
   */
  useEffect(() => {
    if (mode !== 'ranger') return;
    const aDemander: { cle: string; adresse: string }[] = [
      ...pieces.map((x) => ({ cle: `piece:${x.pieceId}`, adresse: `piece=${x.pieceId}` })),
      ...vignettes.map((v) => ({ cle: v.cle, adresse: `source=${encodeURIComponent(v.driveFileId)}` })),
    ].filter((x) => !comptesDemandes.current.has(x.cle));
    if (aDemander.length === 0) return;
    for (const d of aDemander) comptesDemandes.current.add(d.cle);
    void (async () => {
      for (const d of aDemander) {
        try {
          const res = await fetch(`/api/admin/gestion/drive/localiser?${d.adresse}&compte=1`, { cache: 'no-store' });
          const r = (await res.json()) as { etat?: string; nombre?: number };
          if (r.etat !== 'ok') continue;
          /**
           * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA RELECTURE SERVEUR GAGNE, TOUJOURS. C'est elle la vérité (le
           * registre et l'index), et la mise à jour optimiste n'a servi qu'à combler le temps de l'aller-retour.
           * Même règle que les compteurs de la colonne (lot COMPTEURS) : « si les deux divergent, c'est la
           * relecture qui gagne — elle vient de la même source que les listes ».
           */
          setComptesRanges((m) => new Map(m).set(d.cle, r.nombre ?? 0));
        } catch { /* un compteur absent n'est pas une panne : la vignette s'affiche sans lui */ }
      }
    })();
    /* ⚠️ `comptesDemandes` EST UNE RÉFÉRENCE, PAS UN ÉTAT : seules la liste des pièces, celle des vignettes et le
       TOUR DE RELECTURE (`versionComptes`, lot PASTILLE-DRIVE-EN-DIRECT) doivent déclencher une demande.
       ⚠️ LA DIRECTIVE `eslint-disable` QUI VIVAIT ICI A ÉTÉ RETIRÉE PAR CE LOT, et pas par distraction : la règle
       `exhaustive-deps` ne demandait plus rien (ESLint la signalait comme « directive inutilisée »). Garder une
       dérogation qui ne déroge à rien fait croire qu'une règle est tenue en échec alors qu'elle est satisfaite. */
  }, [mode, pieces, vignettes, versionComptes]);

  /**
   * 🔴🔴 LA PHRASE QUI DIT CE QU'ON A CHERCHÉ, ET CE QU'ON N'A PAS CHERCHÉ. Elle vit dans le module PUR, et elle
   * s'affiche en infobulle du compteur — à côté du nombre, jamais dans une aide qu'il faudrait aller chercher :
   * une limite qu'on lit après avoir conclu ne sert à rien.
   */
  const phraseMethodeCourante = (): string => phraseMethode({
    nombre: surlignage.nombre,
    parRegistre: localisation?.parRegistre ?? 0,
    parEmpreinte: Math.max(0, surlignage.nombre - (localisation?.parRegistre ?? 0)),
    empreinteConnue: (localisation?.md5 ?? '') !== '',
    dossiersLus,
    fichiersIndexes: localisation?.indexes ?? null,
  });

  const sortirDeLaCorbeille = async (mouvements: number[]): Promise<void> => {
    setBandeau(null);
    try {
      const res = await fetch('/api/admin/gestion/drive/corbeille', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restaurer', mouvements }),
      });
      const d = (await res.json()) as { etat?: string; message?: string; refuses?: { nom: string; motif: string }[] };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'La restauration n’a pas pu être faite.'); return; }
      if ((d.refuses ?? []).length > 0) {
        setErreur((d.refuses ?? []).map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      /* 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LE RETOUR FAIT REMONTER LE COMPTEUR. La route vient de lever la marque
         « disparue » au registre et dans l'index ; sans cette relecture, la pastille resterait éteinte sur un
         document parfaitement revenu — un compteur qui ne sait que baisser finit à zéro et ne dit plus rien. */
      relireComptes();
      annoncerPiecesDrive();
      revaliderEnSilence([dossierCourant?.id ?? '']);
    } catch {
      setErreur('Le Drive n’a pas répondu.');
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE RENDU
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * ══ 🔴 OÙ LA LIGNE NEUVE S'INSÈRE ═══════════════════════════════════════════════════════════════════════
   *
   * En dernière position du dossier où elle naîtra : à la fin de la liste quand c'est le dossier affiché, et à
   * la fin des enfants du dossier déplié dans le cas contraire. `null` = aucune ligne en cours.
   *
   * ⚠️ ON NE LA MONTRE PAS SI SON DOSSIER N'EST PAS VISIBLE : une ligne en édition flottant dans une liste qui
   * n'est pas la sienne créerait au mauvais endroit sans que rien ne le laisse voir.
   */
  const parentLigneNeuve = ligneNeuve.c === 'ferme' ? null : ligneNeuve.parent;
  const ici = dossierCourant?.id ?? '';
  const rangLigneNeuve = parentLigneNeuve === null ? null
    : parentLigneNeuve === ici ? lignes.length
      : (lignes.some((l) => l.entree.id === parentLigneNeuve) ? lignes.length : null);
  const indentLigneNeuve = parentLigneNeuve === null || parentLigneNeuve === ici ? 0
    : (lignes.find((l) => l.entree.id === parentLigneNeuve)?.profondeur ?? 0) + 1;

  /**
   * LA LIGNE EN ÉDITION. Elle ressemble à une ligne ordinaire — même hauteur, même grille, même indentation —
   * parce qu'elle EST la ligne qui existera dans une seconde.
   *
   * 🔴 LE CHEMIN COMPLET RESTE EN INFOBULLE. C'est ce qui subsiste de la confirmation d'avant : elle ne barre
   * plus la route, mais qui veut vérifier où il crée peut encore le lire, rendu par le SERVEUR.
   *
   * 🔴🔴 ET C'EST UNE FONCTION, PAS UN COMPOSANT — même raison qu'à la barre latérale, en pire : un composant
   * défini dans le rendu est un type neuf à chaque rendu, donc son `<input>` serait DÉMONTÉ ET REMONTÉ à chaque
   * frappe. Le curseur sauterait, le focus se perdrait, et la ligne deviendrait intapable.
   */
  const ligneEnEdition = (indentation: number) => {
    if (ligneNeuve.c === 'ferme') return null;
    if (ligneNeuve.c === 'echec') {
      return (
        <li className="sfd-ligne sfd-ligne--neuve" style={{ ...grille, paddingLeft: 6 + indentation * 16 }}>
          <span className="sfd-col-nom">
            <span className="sfd-triangle sfd-triangle--vide" aria-hidden="true" />
            <span className="sfd-icone" aria-hidden="true">📁</span>
            <span className="sfd-neuve-echec" role="alert">{ligneNeuve.motif}</span>
          </span>
        </li>
      );
    }
    const enCreation = ligneNeuve.c === 'creation';
    return (
      <li className="sfd-ligne sfd-ligne--neuve" style={{ ...grille, paddingLeft: 6 + indentation * 16 }}>
        <span className="sfd-col-nom">
          <span className="sfd-triangle sfd-triangle--vide" aria-hidden="true" />
          <span className="sfd-icone" aria-hidden="true">📁</span>
          <input
            className="sfd-neuve-champ" type="text" autoFocus disabled={enCreation}
            maxLength={NOM_DOSSIER_MAX}
            value={ligneNeuve.nom}
            aria-label="Nom du nouveau dossier"
            title={infobulleChemin(ligneNeuve.chemin, ligneNeuve.parentNom)}
            onChange={(e) => setLigneNeuve((l) => (l.c === 'edition' ? { ...l, nom: e.target.value, erreur: null } : l))}
            /* 🔴 ENTRÉE OU CLIC AILLEURS = CRÉATION ; ÉCHAP = ABANDON (demande d'Arno). Échap est traité ICI et
               non par la fenêtre : il ne doit pas remonter jusqu'à la croix et tout fermer. */
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void validerLigneNeuve(); return; }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLigneNeuve(LIGNE_FERMEE); }
            }}
            onBlur={() => { if (ligneNeuve.c === 'edition') void validerLigneNeuve(); }}
            /* ══ 🔴 LE NOM PROPOSÉ EST SÉLECTIONNÉ — UNE SEULE FOIS, À L'OUVERTURE ═══════════════════════════
               ⚠️ ET C'EST TOUT LE PIÈGE. Ce champ est CONTRÔLÉ : chaque frappe provoque un rendu, donc rappelle
               cette référence. Sélectionner à chaque passage resélectionnait tout le texte après chaque lettre,
               et la lettre suivante l'écrasait : on tapait quarante caractères, il en restait UN. Vu à l'écran,
               sur le vrai Drive. Le drapeau fait que le geste n'a lieu qu'au premier montage de la ligne. */
            ref={(el) => {
              if (el === null || nomDejaChoisi.current) return;
              nomDejaChoisi.current = true;
              el.select();
            }} />
          {enCreation && <span className="sfd-envol" aria-label="Création en cours…"><span aria-hidden="true">•</span></span>}
        </span>
        {ligneNeuve.c === 'edition' && ligneNeuve.erreur !== null && (
          <span className="sfd-neuve-erreur" role="alert">{ligneNeuve.erreur}</span>
        )}
      </li>
    );
  };

  const recentsDrive = (recents?.lignes ?? []).filter((r) => r.sorte !== 'locale');
  const joindreOk = listing?.joindreAutorise === true;
  const selectionJoignable = selection.ids
    .map((id) => entreeParId(id))
    .filter((f): f is Fichier => f !== null && !f.dossier && !ajoutes.includes(f.id));

  /**
   * 🔴 LA BARRE LATÉRALE EST AUSSI UNE CIBLE DE DÉPÔT, comme dans le Finder — mais seulement là où l'entrée
   * désigne un VRAI dossier. « Récents » est une liste, « Drives partagés » un écran de choix : rien ne s'y
   * dépose, et `depot: null` le dit une fois pour toutes plutôt que par un test au moment du glisser.
   */
  /**
   * ══ 🔴 CE QUE LA BARRE LATÉRALE PROPOSE, ET DANS QUEL ORDRE ═══════════════════════════════════════════════
   *
   * Arno : « En tête de la barre latérale : “Dernier dossier utilisé pour cet échange”, puis “Dossier du bien”,
   * puis Récents (dossiers récents de dépôt, datés). » C'est l'ordre de la probabilité : neuf fois sur dix, le bon
   * dossier est celui où l'on vient de déposer pour ce même échange.
   *
   * 🔴 RIEN N'EST PERDU DU PANNEAU QU'ON REMPLACE : « Dernier dossier utilisé pour cet échange » et « Dossiers
   * récents » avec leur date de dernier dépôt viennent de la MÊME route (`drive/dossiers`, lot 5-PJ-D) et du même
   * calcul. Seule leur place change.
   *
   * ⚠️ CETTE LISTE NE PORTE QUE DES DONNÉES, JAMAIS DE FERMETURES. Chaque entrée dit OÙ elle mène (`aller`), et
   * c'est le JSX qui agit. Ce n'est pas une préférence de style : une liste construite au rendu et portant des
   * fermetures qui remontent jusqu'aux mémoires internes (le cache des listings) devient, pour le compilateur
   * React, une valeur « contaminée par une référence » — et il renonce alors à optimiser TOUT le fichier.
   * Des données d'un côté, des gestes de l'autre : c'est plus juste, et c'est ce qu'il sait lire.
   *
   * ⚠️ CHACUNE DE CES ENTRÉES EST UNE CIBLE DE DÉPÔT quand elle désigne un vrai dossier. « Pièces récentes » et
   * « Drives partagés » n'en sont pas : `depot: null` le dit une fois pour toutes, plutôt que par un test au
   * moment du glisser.
   */
  type EntreeLaterale = {
    cle: string; icone: string; libelle: string; detail: string | null;
    depot: { id: string; nom: string } | null;
    /** Où mène cette entrée : un dossier du Drive, ou la liste des pièces déjà jointes. */
    aller: { sorte: 'dossier'; id: string; nom: string } | { sorte: 'pieces' };
  };

  /**
   * ══ 🔴 LOT DRIVE-RETOUCHES-1 — TROIS EMPLACEMENTS, PUIS UNE SECTION « RÉCENTS » REPLIABLE ═════════════════
   *
   * Arno : « dans la barre latérale : “Mon Drive”, “Drives partagés”, puis un 3e bouton “Récents”, au même style
   * que les deux premiers, avec un chevron. Déplié par défaut : sous lui, les raccourcis des derniers dossiers
   * utilisés, indentés et compacts. Le “Dernier dossier utilisé pour cet échange” reste en tête de cette liste,
   * avec son icône propre. »
   *
   * 🔴 CE QUE CE RANGEMENT RÉPARE. La liste plate mélangeait des EMPLACEMENTS (Mon Drive, Drives partagés : des
   * endroits d'où l'on part) et des RACCOURCIS (des dossiers où l'on est allé). Avec huit dépôts récents, les
   * deux premiers disparaissaient sous les seconds — et l'on ne trouvait plus la racine du Drive.
   *
   * ⚠️ LES RACCOURCIS RESTENT DES CIBLES DE DÉPÔT, repliés ou dépliés — enfin, quand ils sont visibles : on ne
   * dépose pas sur ce qu'on ne voit pas, et c'est précisément pour cela que la section est dépliée par défaut.
   */
  const emplacements: EntreeLaterale[] = [
    ...prioritaires.map((d) => ({
      cle: `bien:${d.dossierId}`, icone: '🏠', libelle: titreDossierPrioritaire(d),
      depot: { id: d.dossierId, nom: d.dossierNom || d.libelle },
      // ⚠️ LE NOMBRE N'EST DIT QUE S'IL Y EN A PLUSIEURS : « 1 bien » est du bruit. Il l'était déjà avant ce lot,
      //   et le taire ici ferait croire qu'un dossier ne porte qu'un seul logement.
      detail: mentionNbBiens(d) === null ? d.libelle : `${d.libelle} · ${mentionNbBiens(d)}`,
      aller: { sorte: 'dossier' as const, id: d.dossierId, nom: d.dossierNom || d.libelle },
    })),
    { cle: 'mon_drive', icone: '💾', libelle: 'Mon Drive', detail: null,
      depot: { id: 'root', nom: 'Mon Drive' },
      aller: { sorte: 'dossier' as const, id: 'root', nom: 'Mon Drive' } },
    { cle: 'drives', icone: '👥', libelle: 'Drives partagés', detail: null,
      depot: null,
      aller: { sorte: 'dossier' as const, id: 'svav:drives', nom: 'Drives partagés' } },
    // ⚠️ « Pièces récentes » (celles déjà jointes) n'a de sens qu'en mode JOINDRE : on n'y range rien.
    ...(mode === 'joindre' && recents?.disponible === true && recentsDrive.length > 0
      ? [{ cle: 'recents', icone: '📎', libelle: 'Pièces récentes', detail: null,
        depot: null, aller: { sorte: 'pieces' as const } }]
      : []),
  ];

  /** Les raccourcis de la section « Récents » : le dernier dossier de l'échange d'abord, puis les dépôts datés. */
  const raccourcis: EntreeLaterale[] = [
    ...(depots.dernier === null ? [] : [{
      cle: `dernier:${depots.dernier.id}`, icone: '📥', libelle: depots.dernier.nom,
      detail: 'Dernier dossier utilisé pour cet échange',
      depot: { id: depots.dernier.id, nom: depots.dernier.nom },
      aller: { sorte: 'dossier' as const, id: depots.dernier.id, nom: depots.dernier.nom },
    }]),
    ...depots.recents.map((r) => ({
      cle: `depot:${r.id}`, icone: '🕘', libelle: r.nom,
      detail: r.chemin !== '' ? r.chemin : `dernier dépôt : ${dateFinder(r.dernierDepot)}`,
      depot: { id: r.id, nom: r.nom },
      aller: { sorte: 'dossier' as const, id: r.id, nom: r.nom },
    })),
  ];

  /**
   * 🔴 LA MÊME ROUTE QU'AVANT, LE MÊME CALCUL. `drive/dossiers` sans autre paramètre rend la vue d'ouverture du
   * lot 5-PJ-D : le dernier dossier de l'échange, puis les derniers dossiers où un dépôt a réussi, tous
   * collaborateurs confondus, chacun avec son chemin et sa date — et déjà filtrés à ce que CE compte Google voit.
   *
   * ⚠️ UNE ABSENCE N'EST PAS UNE PANNE : au premier dépôt, il n'y a rien à proposer. La barre latérale garde alors
   * ses autres entrées, sans rien dire — il n'y a rien à expliquer.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const p = new URLSearchParams();
        if (filId !== null) p.set('fil', String(filId));
        const res = await fetch(`/api/admin/gestion/drive/dossiers?${p}`, { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; mode?: string; dernier?: DossierRecent | null; recents?: DossierRecent[];
        };
        if (annule || d.etat !== 'ok' || d.mode !== 'accueil') return;
        setDepots({ dernier: d.dernier ?? null, recents: d.recents ?? [] });
      } catch { /* pas de raccourci : le navigateur reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * UNE LIGNE DE LA BARRE LATÉRALE. Extraite pour que les emplacements et les raccourcis ne divergent pas : deux
   * rendus jumeaux finiraient par se contredire, et l'un des deux serait oublié à la première correction.
   *
   * 🔴🔴 C'EST UNE FONCTION QUI REND DU JSX, PAS UN COMPOSANT, ET LA DIFFÉRENCE EST TOUT SAUF THÉORIQUE. Un
   * composant DÉFINI DANS LE RENDU est un type NEUF à chaque rendu : React démonte et remonte son sous-arbre,
   * donc il RECRÉE les nœuds du DOM. Une cible de dépôt recréée entre le `dragstart` et le `drop` n'est plus
   * celle qu'on survolait — le dépôt n'arrive jamais, en silence. Vu au test, sur les raccourcis de la barre
   * latérale, et c'est exactement le genre de panne qu'on met une journée à comprendre.
   */
  const ligneLaterale = (l: EntreeLaterale, compact = false) => {
    return (
      <li key={l.cle}>
        <button type="button"
          className={`sfd-cote-item${compact ? ' sfd-cote-item--compact' : ''}`
            + `${survole === `cote:${l.cle}` ? ' sfd-cote-item--vise' : ''}`}
          onClick={() => {
            if (l.aller.sorte === 'pieces') { setMontrerRecents(true); setSelection(SELECTION_VIDE); return; }
            entrerDepuisRacine({ id: l.aller.id, nom: l.aller.nom });
          }}
          /* 🔴 `dragenter` ET `dragover`, LES DEUX — voir l'encadré de `survolerCible`. */
          onDragEnter={l.depot === null ? undefined
            : (e) => survolerCible(e, { id: `cote:${l.cle}`, nom: l.libelle, ouvrable: false, reel: l.depot?.id })}
          onDragOver={l.depot === null ? undefined
            : (e) => survolerCible(e, { id: `cote:${l.cle}`, nom: l.libelle, ouvrable: false, reel: l.depot?.id })}
          onDragLeave={l.depot === null ? undefined : () => quitterCible(`cote:${l.cle}`)}
          onDrop={l.depot === null ? undefined : (e) => deposerSur(e, l.depot as { id: string; nom: string })}>
          <span className="sfd-cote-icone" aria-hidden="true">{l.icone}</span>
          <span className="sfd-cote-mots">
            <span className="sfd-cote-libelle">{l.libelle}</span>
            {l.detail !== null && <span className="sfd-cote-detail">{l.detail}</span>}
          </span>
        </button>
      </li>
    );
  };

  /**
   * ══ 🔴🔴 LOT RANGER-ARBRE-2 — TIRER LA POIGNÉE ════════════════════════════════════════════════════════════
   *
   * 🔴 DES ÉVÉNEMENTS DE POINTEUR, ET LA CAPTURE. `setPointerCapture` fait suivre le pointeur à la poignée même
   * quand le curseur sort d'elle — sans quoi un geste un peu vif « lâcherait » la poignée au premier pixel
   * dépassé, et la colonne resterait à une largeur qu'on n'a pas voulue. C'est aussi ce qui rend le geste
   * identique à la souris, au trackpad et au doigt.
   *
   * ⚠️ LA LARGEUR EST BORNÉE PAR LE MODULE PUR (`largeurCote`), jamais ici : une borne écrite à deux endroits
   * finirait par valoir deux choses différentes.
   * ⚠️ ON N'ÉCRIT LA PRÉFÉRENCE QU'À LA FIN DU GESTE, pas à chaque pixel : trois cents écritures pour un glisser
   * de trois cents pixels feraient ramer le stockage local pour un réglage qu'on ne lit qu'à l'ouverture.
   */
  const retenirLargeur = (v: number) => {
    try { globalThis.localStorage?.setItem(CLE_LARGEUR_COTE, String(v)); }
    catch { /* une préférence qu'on ne peut pas écrire n'empêche pas de régler la colonne */ }
  };
  const saisirPoignee = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const poignee = e.currentTarget;
    const depart = e.clientX;
    const largeurDepart = largeurCoteVue;
    let derniere = largeurDepart;
    setTireLaPoignee(true);
    try { poignee.setPointerCapture(e.pointerId); } catch { /* un navigateur sans capture suit quand même */ }
    const bouger = (ev: PointerEvent) => {
      derniere = largeurCote(largeurDepart + (ev.clientX - depart));
      setLargeurCoteVue(derniere);
    };
    const finir = () => {
      poignee.removeEventListener('pointermove', bouger);
      poignee.removeEventListener('pointerup', finir);
      poignee.removeEventListener('pointercancel', finir);
      setTireLaPoignee(false);
      retenirLargeur(derniere);
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', finir);
    poignee.addEventListener('pointercancel', finir);
  };

  /** Une entrée latérale part TOUJOURS de la racine : c'est un raccourci, pas une descente de plus. */
  function entrerDepuisRacine(f: { id: string; nom: string }) {
    setMontrerRecents(false);
    allerA([{ id: f.id, nom: f.nom }]);
  }

  return (
    <>
    <div className="sfd-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_FICHIER}</style>
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre" ref={cadre}
        onKeyDown={surTouche} tabIndex={-1}
        /* ⚠️ UN GLISSER QUI SE TERMINE DANS LE VIDE DOIT S'ÉTEINDRE : sans cela, la surbrillance et le fantôme
           survivraient au geste, et l'écran resterait « en train de glisser » pour toujours.
           🔴 ET C'EST UN ABANDON : les dossiers que le ressort avait dépliés se referment. */
        onDragEnd={() => finGlisse(true)}
        onDrop={() => finGlisse(true)}>

        {/* ══ 🔴 LA BARRE DE TITRE, AVEC SA CROIX ═══════════════════════════════════════════════════════════════
            Elle manquait : « la fenêtre n'a pas de croix pour la fermer, il faut l'ajouter » (Arno). Le titre est
            le nom du DOSSIER COURANT, comme dans une fenêtre du Finder — et non un libellé fixe qui ne dirait pas
            où l'on est. */}
        <header className="sfd-barre-titre">
          {/* 🔴 EN MODE RANGER, LE TITRE DIT CE QU'ON TIENT, pas où l'on est : on ouvre cette fenêtre les mains
              pleines, et l'endroit change dix fois avant qu'on pose. En mode JOINDRE, savoir où l'on est EST la
              question — c'est le nom du dossier courant, comme dans une fenêtre du Finder. */}
          <h2 className="sfd-titre" id="sfd-titre">
            {titreFenetre(mode, titreDuChemin(chemin), pieces.length)}
          </h2>
          <button type="button" className="sfd-croix" aria-label="Fermer la fenêtre" title="Fermer"
            onClick={onFermer}>
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        {/* ══ 🔴 LA BARRE D'OUTILS, FAÇON FINDER ════════════════════════════════════════════════════════════════
            Flèches ‹ › avec l'historique, fil d'Ariane cliquable, loupe, et « ⋯ » pour « Nouveau dossier ». */}
        <div className="sfd-outils">
          <span className="sfd-fleches" role="group" aria-label="Historique de navigation">
            <button type="button" className="sfd-outil" aria-label="Précédent" title="Précédent"
              disabled={!peutReculer(histo)} onClick={pasArriere}><span aria-hidden="true">‹</span></button>
            <button type="button" className="sfd-outil" aria-label="Suivant" title="Suivant"
              disabled={!peutAvancer(histo)} onClick={pasAvant}><span aria-hidden="true">›</span></button>
          </span>

          {/* ══ 🔴 LE BANDEAU DES PARENTS — deux crans en amont, et pas plus ═══════════════════════════════════
              Arno : « un BANDEAU DES PARENTS montre les 2 dossiers parents ». Le Drive du cabinet fait treize
              niveaux : un fil d'Ariane entier passe à la ligne et cesse d'être lisible là où il servirait. Ce qui
              est au-dessus est COMPTÉ, et le « … » le déplie — masquer sans compter ferait croire à une racine.
              🔴 CHAQUE PAS EST UNE CIBLE DE DÉPÔT : c'est le geste « remonter d'un cran » du Finder, et sans lui
              il faudrait sortir du dossier, lâcher, resélectionner, recommencer. ⚠️ PAS DE RESSORT ici : on ne
              veut pas qu'un survol du chemin nous fasse changer d'endroit en plein glisser. */}
          <nav className="sfd-ariane" aria-label="Dossiers parents">
            <button type="button"
              className={`sfd-ariane-bouton sfd-ariane-bouton--racine${survole === 'pas:' ? ' sfd-ariane-bouton--vise' : ''}`}
              onClick={() => remonter(0)}>Google Drive</button>
            {parents.caches > 0 && (
              <>
                <span className="sfd-chevron" aria-hidden="true">›</span>
                <button type="button" className="sfd-ariane-bouton sfd-ariane-caches"
                  title={`${parents.caches} dossier${parents.caches > 1 ? 's' : ''} au-dessus — afficher le chemin entier`}
                  aria-label={`Afficher les ${parents.caches} dossiers parents masqués`}
                  onClick={() => setCheminEntier((v) => !v)}>…</button>
              </>
            )}
            {parents.pas.map((e) => (
              <span key={`${e.id}:${e.index}`} className="sfd-ariane-pas">
                <span className="sfd-chevron" aria-hidden="true">›</span>
                <button type="button"
                  className={`sfd-ariane-bouton${survole === `pas:${e.id}` ? ' sfd-ariane-bouton--vise' : ''}`}
                  onClick={() => remonter(e.index)}
                  onDragEnter={(ev) => survolerCible(ev, {
                    id: `pas:${e.id}`, nom: e.nom, ouvrable: false, reel: e.id,
                  })}
                  onDragOver={(ev) => survolerCible(ev, {
                    id: `pas:${e.id}`, nom: e.nom, ouvrable: false, reel: e.id,
                  })}
                  onDragLeave={() => quitterCible(`pas:${e.id}`)}
                  onDrop={(ev) => deposerSur(ev, { id: e.id, nom: e.nom })}>{e.nom}</button>
              </span>
            ))}
          </nav>

          <span className="sfd-outils-droite">
            {/* 🔴 « Par défaut, Nom + Taille seulement, avec un bouton pour afficher les autres colonnes » (Arno).
                ⚠️ LE TRI SUR UNE COLONNE CACHÉE RESTE VALIDE : on peut trier par date, puis replier pour gagner la
                place, sans perdre l'ordre qu'on venait d'obtenir. */}
            <button type="button" className="sfd-outil" aria-pressed={!compact}
              aria-label={motColonnes(compact)} title={motColonnes(compact)}
              onClick={() => setCompact((v) => !v)}>
              <span aria-hidden="true">⋮⋮</span>
            </button>
            <button type="button" className="sfd-outil" aria-label="Rechercher" title="Rechercher"
              aria-expanded={loupeOuverte}
              onClick={() => { setLoupeOuverte((v) => !v); setTimeout(() => champ.current?.focus(), 0); }}>
              <span aria-hidden="true">🔍</span>
            </button>
            <span className="sfd-plus">
              <button type="button" className="sfd-outil" aria-label="Autres actions" title="Autres actions"
                aria-expanded={outils} onClick={() => setOutils((v) => !v)}>
                <span aria-hidden="true">⋯</span>
              </button>
              {outils && (
                <ul className="sfd-menu sfd-menu--outils" role="menu">
                  {/* 🔴🔴 « Nouveau dossier » PORTE SES INTERDITS : éteint avec son motif sous « Documents clients
                      scannés », dans les résultats de recherche, à la racine, et sans la migration 272. */}
                  {/* 🔴🔴 ABSENT là où la RÈGLE interdit (sous « Documents clients scannés », dans des résultats
                      de recherche, à la racine) : le motif est déjà écrit en tête de liste, et aligner en plus une
                      entrée morte n'ajouterait rien. DÉSACTIVÉ, avec son motif, quand c'est la MIGRATION qui
                      manque : la fonction existe et attend quelque chose — ce n'est pas la même information. */}
                  {listing !== null && (listing.creerAutorise || listing.motifCreation !== null) && (
                    <li role="none">
                      <button type="button" role="menuitem" className="sfd-menu-item"
                        disabled={!listing.creerAutorise}
                        title={listing.creerAutorise ? undefined : (listing.motifCreation ?? undefined)}
                        onClick={() => {
                          setOutils(false);
                          ouvrirLigneNeuve(dossierCourant?.id ?? '', dossierCourant?.nom ?? 'ce dossier');
                        }}>
                        Nouveau dossier
                      </button>
                      {!listing.creerAutorise && listing.motifCreation !== null && (
                        <p className="sfd-menu-motif">{listing.motifCreation}</p>
                      )}
                    </li>
                  )}
                  {listing !== null && !listing.creerAutorise && listing.motifCreation === null && (
                    <li role="none"><p className="sfd-menu-motif">Aucune autre action ici.</p></li>
                  )}
                </ul>
              )}
            </span>
          </span>
        </div>

        {loupeOuverte && (
          <label className="sfd-champ">
            <span className="svv-label">Chercher un fichier ou un dossier, dans tout le Drive</span>
            <input ref={champ} className="sfd-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
              placeholder="ex. « bail 2024 », « devis plomberie »"
              onChange={(e) => {
                const v = e.target.value;
                setSaisie(v);
                // Effacer la recherche ramène au dossier où l'on était : on ne perd pas sa place.
                if (v.trim().length < 2) void charger(dossierCourant?.id ?? '');
              }} />
          </label>
        )}

        {rechercheOuverte !== null && (
          <button type="button" className="gst-lien-bouton sfd-retour" onClick={revenirAuxResultats}>
            ← Résultats de la recherche « {rechercheOuverte} »
          </button>
        )}

        {motDeLaCreation !== null && <p className="sfd-creer-fait" role="status">{motDeLaCreation}</p>}

        {/* 🔴🔴 LE DOSSIER INTERDIT SE DIT EN TOUTES LETTRES, AVANT la liste — pour qu'on le lise avant de chercher
            un bouton qui n'y est pas. */}
        {listing !== null && !listing.joindreAutorise && listing.motifRefus !== null && (
          <p className="sfd-interdit" role="status">🔒 {listing.motifRefus}</p>
        )}
        {listing !== null && listing.recherche && (
          <p className="sfd-interdit" role="status">
            🔒 Résultats de tout le Drive : le droit de joindre est vérifié au moment de joindre. Un fichier de
            « Documents clients scannés » sera refusé, avec son motif.
          </p>
        )}
        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}
        {vue.v === 'indisponible' && <p className="gst-tronc" role="alert">{vue.message}</p>}

        {/* ══ 🔴 LE BANDEAU « N ÉLÉMENT(S) DÉPLACÉ(S) VERS X — ANNULER », DIX SECONDES ═══════════════════════
            ⚠️ « Annuler » N'APPARAÎT PAS POUR UNE COPIE. L'annuler voudrait dire SUPPRIMER DÉFINITIVEMENT la
            copie, et cela n'existe nulle part ici : le bandeau d'une copie dit donc ce qui a été fait, sans
            promettre un retour qu'on ne saurait pas tenir.

            🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — IL APPARAÎT POUR UNE CORBEILLE, et il appelle alors
            l'AUTRE route : `sorte` est ce qui l'en informe. */}
        {bandeau !== null && (
          <p className="sfd-bandeau" role="status">
            <span className="sfd-bandeau-mot">{bandeau.mot}</span>
            {bandeau.mouvements.length > 0 && (
              <button type="button" className="sfd-bandeau-annuler"
                onClick={() => void (bandeau.sorte === 'corbeille'
                  ? sortirDeLaCorbeille(bandeau.mouvements)
                  : annulerMouvement(bandeau.mouvements))}>Annuler</button>
            )}
            <button type="button" className="sfd-bandeau-croix" aria-label="Masquer ce message"
              onClick={() => setBandeau(null)}><span aria-hidden="true">✕</span></button>
          </p>
        )}

        {/* ══ 🔴🔴 LA CONFIRMATION D'UNE MISE À LA CORBEILLE — OBLIGATOIRE, ET JAMAIS CONTOURNABLE ═══════════
            Arno dicte la phrase au mot près ; elle vient du module PUR (`phraseCorbeille`), pour que l'écran ne
            puisse pas en écrire une plus légère que ce que le geste fait. Elle NOMME le fichier ET son chemin :
            deux fichiers du même nom vivent dans deux dossiers différents, et c'est quand on en a deux sous les
            yeux qu'on se trompe de ligne.

            🔴 `role="alertdialog"` : un lecteur d'écran l'annonce au lieu de la laisser passer, comme la
            confirmation de copie juste en dessous. Échap = Annuler (voir le gestionnaire de touches). */}
        {aJeter !== null && (
          <div className="sfd-creer-corps" role="alertdialog" aria-label="Confirmer la mise à la corbeille">
            <p className="sfd-creer-chemin">
              <span className="sfd-creer-nom">🗑 {phraseCorbeille(aJeter.nom, aJeter.chemin)}</span>
              <span className="sfd-mention sfd-mention--bloc">
                Le fichier n’est pas supprimé définitivement : il part dans la corbeille de votre Drive, d’où il
                se restaure. « Annuler le dernier déplacement », en bas de cette fenêtre, l’en sort tout de suite.
              </span>
            </p>
            <div className="sfd-creer-boutons">
              {/* ⚠️ « Annuler » EN PREMIER, et c'est voulu : le bouton qui ne détruit rien est celui qu'on doit
                  pouvoir attraper sans réfléchir. */}
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={jetEnCours}
                onClick={() => setAJeter(null)}>{BOUTON_ANNULER_CORBEILLE}</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={jetEnCours}
                onClick={() => void jeterALaCorbeille(aJeter)}>
                {jetEnCours ? 'Envoi à la corbeille…' : BOUTON_CONFIRMER_CORBEILLE}
              </button>
            </div>
          </div>
        )}

        {/* ══ 🔴 LA CONFIRMATION D'UNE COPIE DE DOSSIER, avec le nombre RÉEL compté par le serveur ═══════════ */}
        {confirmation !== null && (
          <div className="sfd-creer-corps" role="alertdialog" aria-label="Confirmer la copie">
            <p className="sfd-creer-chemin">
              <span className="sfd-creer-nom">📋 {confirmation.phrase}</span>
              <span className="sfd-mention sfd-mention--bloc">
                Les doublons de nom sont conservés tous les deux, comme dans Google Drive : rien n’est écrasé.
              </span>
            </p>
            <div className="sfd-creer-boutons">
              <button type="button" className="svv-btn svv-btn-primary gst-btn"
                onClick={confirmation.agir}>Copier</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => setConfirmation(null)}>Annuler</button>
            </div>
          </div>
        )}

        {/* ══ LE CORPS : barre latérale + liste ═════════════════════════════════════════════════════════════════ */}
        <div className={`sfd-corps${tireLaPoignee ? ' sfd-corps--tire' : ''}`}
          /* 🔴 LA LARGEUR PASSE PAR UNE VARIABLE CSS : la grille du corps la lit, et rien d'autre n'a besoin de
             la connaître. C'est aussi ce qui permet au CSS de garder ses bornes en une seule ligne. */
          style={{ ['--sfd-cote' as string]: `${largeurCoteVue}px` }}>
          <aside className="sfd-cote" aria-label="Emplacements">
            {/* ══ 🔴🔴 « À RANGER » — CE QU'ON TIENT DANS LA MAIN GAUCHE ════════════════════════════════════════
                Arno : « un panneau “À ranger” qui liste les pièces jointes du mail avec leur miniature, leur nom
                et leur taille. Chaque pièce est glissable. »
                🔴 IL EST AU-DESSUS DES EMPLACEMENTS, et non en dessous : on regarde ce qu'on tient, puis on
                cherche où le mettre. L'inverse obligerait à défiler pour retrouver sa pièce. */}
            {mode === 'ranger' && pieces.length > 0 && (
              <section className="sfd-ranger" aria-label="Pièces à ranger">
                <p className="sfd-ranger-titre" role="status">{resumeARanger(pieces.length, rangees.size)}</p>
                {/* ══ 🔴 LOT RANGER-ARBRE-2 — « TOUT SÉLECTIONNER », un interrupteur ══════════════════════════
                    ⚠️ ABSENT S'IL N'Y A QU'UNE PIÈCE : « tout sélectionner » une pièce unique est une case à
                    cocher déguisée, et elle est déjà sur la ligne. */}
                {pieces.length > 1 && (
                  <button type="button" className="sfd-ranger-tout"
                    aria-pressed={idsChoisis.length >= pieces.length}
                    onClick={() => setChoixPieces({ ids: basculerTout(idsChoisis, pieces).map(String), ancre: null })}>
                    {motToutSelectionner(idsChoisis.length, pieces.length)}
                  </button>
                )}
                <ul className="sfd-ranger-liste">
                  {pieces.map((x) => {
                    const ou = rangees.get(x.pieceId) ?? null;
                    const occupee = rangementEnCours.has(x.pieceId);
                    const cochee = idsChoisis.includes(x.pieceId);
                    /** ⌘ et ⇧ passent par la MÊME règle que la liste du Drive : voir `choixPieces`. */
                    const cliquer = (cmd: boolean, maj: boolean) => setChoixPieces(
                      (c) => cliquerLigne(c, String(x.pieceId), ordrePieces, { cmd, maj }));
                    return (
                      <li key={x.pieceId}
                        className={`sfd-piece${ou !== null ? ' sfd-piece--rangee' : ''}`
                          + `${cochee ? ' sfd-piece--cochee' : ''}`
                          + `${piecesGlissees.some((g) => g.pieceId === x.pieceId) ? ' sfd-piece--enVol' : ''}`}
                        /* 🔴 GLISSABLE : c'est le geste principal de ce mode. Le bouton « Déposer ici » du pied
                           est la seconde voie — pour le tactile, et pour qui ne glisse pas. */
                        draggable
                        onDragStart={(e) => demarrerGlisseDePiece(e, x)}
                        onDragEnd={() => finGlisse(true)}
                        /* ⚠️ LE CLIC SUR LA LIGNE COCHE AUSSI, ⌘ et ⇧ compris : viser une case de 14 px pour
                           choisir quatre pièces serait un geste de précision là où l'on veut un geste rapide. */
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button, input, a') !== null) return;
                          cliquer(e.metaKey || e.ctrlKey, e.shiftKey);
                        }}>
                        {/* 🔴 LA CASE À COCHER (demande d'Arno). Elle porte le nom de la pièce : sans lui, un
                            lecteur d'écran n'annoncerait que « case à cocher », quatre fois de suite. */}
                        <input type="checkbox" className="sfd-piece-case" checked={cochee}
                          aria-label={`Sélectionner ${x.nom}`}
                          onChange={() => cliquer(true, false)} />
        {/* La miniature est servie par l'application, jamais par une URL de stockage.
                            🔴 `draggable={false}` SUR LA VIGNETTE, ET C'EST INDISPENSABLE : une image est
                            saisissable NATIVEMENT par le navigateur. Sans cela, saisir la pièce par sa miniature
                            démarrait le glisser de l'IMAGE et non celui de la ligne — le dépôt n'arrivait jamais,
                            en silence. Vu à l'écran, sur la vraie pièce. */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route */}
                        <img className="sfd-piece-vignette" alt="" draggable={false}
                          src={`/api/admin/gestion/pieces/${x.pieceId}/miniature`}
                          loading="lazy" decoding="async"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                        <span className="sfd-piece-mots">
                          {/* 🔴 LOT RENOMMER-AVANT-RANGER — LA CARTE MONTRE LE NOM SOUS LEQUEL LA PIÈCE PARTIRA.
                              C'est le seul qui compte pour qui s'apprête à ranger ; le nom reçu, lui, se lit
                              juste en dessous dès qu'il diffère — c'est celui qu'on cherchera dans le mail. */}
                          <span className="sfd-piece-nom" title={nomDeDepot(x.nom, nomsChoisis.get(x.pieceId))}>
                            {nomDeDepot(x.nom, nomsChoisis.get(x.pieceId))}
                          </span>
                          {estRenommee(x.nom, nomsChoisis.get(x.pieceId)) && (
                            <span className="sfd-piece-origine" title={x.nom}>{mentionNomOrigine(x.nom)}</span>
                          )}
                          {/* ══ 🔴 LE POIDS, ET L'ŒIL À SA DROITE (demande d'Arno) ═══════════════════════════
                              🔴 IL MARCHE AUSSI SUR UNE PIÈCE VIDÉE : la route des pièces bascule d'elle-même
                              sur la copie Drive quand les octets locaux ont été libérés. Rien à écrire ici.
                              ⚠️ ÉTEINT, AVEC SON MOTIF, pour un « ._ » de macOS (qui ne contient pas le document)
                              et pour un type sans aperçu — promettre une fenêtre vide serait pire que rien. */}
                          <span className="sfd-piece-ligne">
                            <span className="sfd-piece-taille">{tailleFinder(x.tailleOctets, false)}</span>
                            {/* ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE COMPTEUR VERT ════════════════════════
                                « Rangé N fois dans le Drive » (Arno). VERT parce que c'est un état d'ARRIVÉE —
                                il ne dit pas « à faire », il dit « c'est déjà quelque part ».
                                ⚠️ MASQUÉ À ZÉRO : un « 0 » vert se lirait comme une bonne nouvelle alors qu'il
                                dit le contraire (ce document n'est rangé nulle part). */}
                            {(comptesRanges.get(`piece:${x.pieceId}`) ?? 0) > 0 && (
                              <span className="sfd-piece-range"
                                title={bulleCompteurRange(comptesRanges.get(`piece:${x.pieceId}`) ?? 0)}
                                aria-label={bulleCompteurRange(comptesRanges.get(`piece:${x.pieceId}`) ?? 0)}>
                                {comptesRanges.get(`piece:${x.pieceId}`)}
                              </span>
                            )}
                            {/* 🔴 LES TROIS PICTOS SUR UNE SEULE LIGNE, COLLÉS À DROITE (demande d'Arno) : c'est
                                `sfd-piece-gestes`, poussé par `margin-left:auto`. Avant ce lot ils flottaient
                                dans le texte, et le crayon passait à la ligne dès que le nom était long. */}
                            <span className="sfd-piece-gestes">
                            {(() => {
                              const refus = motifSansApercuPiece(x);
                              return (
                                <button type="button" className="sfd-piece-oeil"
                                  disabled={refus !== null}
                                  title={refus ?? 'Visualiser'}
                                  aria-label={refus ?? `Visualiser ${x.nom}`}
                                  onClick={(e) => { e.stopPropagation(); if (refus === null) voirPiece(x); }}>
                                  <span aria-hidden="true">👁</span>
                                </button>
                              );
                            })()}
                            {/* ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE STYLO, À CÔTÉ DE L'ŒIL ═══════════════════
                                Arno : « à côté de l'œil, une petite icône stylo ✎ (infobulle “Renommer avant de
                                ranger”), de même taille et même alignement que l'œil ».

                                🔴 IL OUVRE LA MÊME FENÊTRE QUE L'ŒIL, directement sur le champ. Une boîte de
                                dialogue à part aurait obligé à renommer SANS voir la pièce — or c'est en la
                                regardant qu'on sait comment l'appeler, et c'est tout l'intérêt du geste.

                                ⚠️ IL RESTE ACTIF MÊME SANS APERÇU POSSIBLE (un type sans visuel) : on renomme
                                aussi bien un fichier qu'on ne peut pas afficher, et la fenêtre dira simplement
                                « aperçu indisponible » à la place du visuel.
                                🔴🔴 LOT ETOILE-SIGNATURES-PIECES — IL EST ALLUMÉ MÊME SUR UNE PIÈCE DÉJÀ RANGÉE
                                (décision d'Arno du 03/10/2026 : « un document = un seul nom » gagne). Le
                                renommage part alors pour de vrai, sur la pièce ET sur toutes ses copies. */}
                            <button type="button" className="sfd-piece-stylo"
                              title={INFOBULLE_RENOMMER}
                              aria-label={`${INFOBULLE_RENOMMER} — ${x.nom}`}
                              onClick={(e) => { e.stopPropagation(); voirPiece(x, true); }}>
                              <span aria-hidden="true">✎</span>
                            </button>
                            {/* ══ 🔴🔴 LA LOUPE « OÙ EST CE DOCUMENT ? » ═══════════════════════════════════════
                                Arno : « sur chaque vignette de la colonne de gauche (pièce jointe ou vignette
                                dupliquée), ajoute un picto loupe (aria-label “Localiser dans le Drive”). Clic =
                                active ou désactive la localisation pour cette vignette (une seule active à la
                                fois). »
                                🔒 LECTURE SEULE : elle ne fait que demander où se trouve ce document. */}
                            <button type="button"
                              className={`sfd-piece-oeil${loupeSur === `piece:${x.pieceId}` ? ' sfd-piece-oeil--actif' : ''}`}
                              aria-pressed={loupeSur === `piece:${x.pieceId}`}
                              title={AIDE_LOUPE} aria-label={`${AIDE_LOUPE} — ${x.nom}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void basculerLoupe(`piece:${x.pieceId}`, '', x.pieceId);
                              }}>
                              <span aria-hidden="true">🔎</span>
                            </button>
                            </span>
                          </span>
                          {/* 🔴 LE COMPTEUR ET LA MÉTHODE, à côté de la loupe et jamais ailleurs : la limite doit
                              se lire AU MOMENT où l'on regarde le nombre. */}
                          {loupeSur === `piece:${x.pieceId}` && (
                            <span className="sfd-piece-etat sfd-loupe-compte"
                              role="status" title={phraseMethodeCourante()}>
                              🔎 {motCompteur(surlignage.nombre)}
                            </span>
                          )}
                          {occupee && <span className="sfd-piece-etat">Rangement…</span>}
                          {ou !== null && !occupee && (
                            <span className="sfd-piece-etat sfd-piece-etat--ok">
                              {motRangee(ou.dossierNom)}
                              {ou.lien !== null && (
                                <> · <a className="sfd-piece-lien" href={ou.lien} target="_blank" rel="noreferrer">ouvrir</a></>
                              )}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {/* ══ 🔴🔴 LES VIGNETTES DUPLIQUÉES — « À COPIER », SOUS LES PIÈCES DU MESSAGE ══════════════════════
                Arno : « crée dans la colonne de gauche une vignette “pièce à ranger”, identique à celle d'une
                pièce jointe qui vient d'arriver (miniature, nom, taille, œil, crayon ✎, case). »

                🔴 UNE SECTION À PART, ET SON PROPRE RÉSUMÉ. Ce ne sont pas des pièces du message : elles ne
                quittent aucune file, et les additionner au compteur « N pièces à ranger » aurait annoncé un
                travail à faire qui n'existe pas. Même ligne, même style, même geste — autre nature, dit en mots.

                ⚠️ CETTE SECTION NE CHANGE PAS LA SIGNATURE DE SESSION : elle lit `vignettes`, qui n'entre pas
                dans `signatureSession` (calculée sur les pièces du message). L'arbre ne se referme donc pas. */}
            {mode === 'ranger' && vignettes.length > 0 && (
              <section className="sfd-ranger" aria-label="Copies à ranger">
                <p className="sfd-ranger-titre" role="status">{resumeVignettes(vignettes.length)}</p>
                <ul className="sfd-ranger-liste">
                  {vignettes.map((v) => {
                    const ou = vignettesRangees.get(v.cle) ?? null;
                    const occupee = vignettesEnCours.has(v.cle);
                    const nomAffiche = (nomsVignettes.get(v.cle) ?? '').trim() === ''
                      ? v.nom : (nomsVignettes.get(v.cle) ?? v.nom);
                    return (
                      <li key={v.cle}
                        className={`sfd-piece sfd-piece--copie${ou !== null ? ' sfd-piece--rangee' : ''}`
                          + `${vignettesGlissees.some((g) => g.cle === v.cle) ? ' sfd-piece--enVol' : ''}`}
                        title={aideVignette(v.nom)}
                        draggable
                        onDragStart={(e) => demarrerGlisseDeVignette(e, v)}
                        onDragEnd={() => finGlisse(true)}>
                        {/* 🔴 LA MINIATURE VIENT DU DRIVE, par la route d'aperçu qui sert déjà la liste — jamais
                            par l'adresse signée de Google, qui sortirait de l'application.
                            🔴 `draggable={false}` : une image est saisissable nativement, et le glisser de
                            l'IMAGE aurait remplacé celui de la ligne (défaut déjà payé sur les pièces). */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route */}
                        <img className="sfd-piece-vignette" alt="" draggable={false}
                          src={`/api/admin/gestion/drive/apercu?fichier=${encodeURIComponent(v.driveFileId)}&vignette=1`}
                          loading="lazy" decoding="async"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                        <span className="sfd-piece-mots">
                          <span className="sfd-piece-nom" title={nomAffiche}>{nomAffiche}</span>
                          {nomAffiche !== v.nom && (
                            <span className="sfd-piece-origine" title={v.nom}>{mentionNomOrigine(v.nom)}</span>
                          )}
                          <span className="sfd-piece-ligne">
                            <span className="sfd-piece-taille">{tailleFinder(v.tailleOctets, false)}</span>
                            {/* 🔴🔴 LE MÊME COMPTEUR VERT que sur une pièce du message : même source, même mot. */}
                            {(comptesRanges.get(v.cle) ?? 0) > 0 && (
                              <span className="sfd-piece-range"
                                title={bulleCompteurRange(comptesRanges.get(v.cle) ?? 0)}
                                aria-label={bulleCompteurRange(comptesRanges.get(v.cle) ?? 0)}>
                                {comptesRanges.get(v.cle)}
                              </span>
                            )}
                            <span className="sfd-piece-gestes">
                            {/* L'ŒIL — il ouvre le fichier SOURCE dans l'aperçu du Drive, en lecture seule. */}
                            <button type="button" className="sfd-piece-oeil"
                              title="Visualiser" aria-label={`Visualiser ${v.nom}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAVoir({
                                  id: v.driveFileId, nom: nomAffiche, typeMime: v.typeMime ?? '',
                                  lien: v.lien ?? null, parentId: null,
                                });
                              }}>
                              <span aria-hidden="true">👁</span>
                            </button>
                            {/* ══ 🔴 LE CRAYON ✎ — LE NOM SOUS LEQUEL **LA COPIE** NAÎTRA ═════════════════════
                                🔒 CE N'EST PAS UN RENOMMAGE : le fichier d'origine garde son nom, et la copie
                                n'existe pas encore. On ne renomme jamais un fichier existant du Drive — c'est la
                                règle du module, et elle n'est pas touchée. */}
                            <button type="button" className="sfd-piece-stylo"
                              title={INFOBULLE_RENOMMER}
                              aria-label={`${INFOBULLE_RENOMMER} — ${v.nom}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenommerVignette(v.cle);
                                setAVoir({
                                  id: v.driveFileId, nom: nomAffiche, typeMime: v.typeMime ?? '',
                                  lien: v.lien ?? null, parentId: null,
                                });
                              }}>
                              <span aria-hidden="true">✎</span>
                            </button>
                            {/* 🔴 ET LE RETRAIT : la vignette est un objet d'écran, elle se retire d'un clic.
                                ⚠️ IL NE SUPPRIME RIEN : ni le fichier source, ni les copies déjà rangées. */}
                            <button type="button" className="sfd-piece-oeil"
                              title="Retirer cette vignette (le fichier et ses copies ne sont pas touchés)"
                              aria-label={`Retirer la vignette ${v.nom}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setVignettes((liste) => liste.filter((x) => x.cle !== v.cle));
                              }}>
                              <span aria-hidden="true">✕</span>
                            </button>
                            {/* 🔴🔴 LA MÊME LOUPE QUE SUR UNE PIÈCE DU MESSAGE : même picto, même libellé, même
                                interrupteur — une seule active à la fois, toutes vignettes confondues. */}
                            <button type="button"
                              className={`sfd-piece-oeil${loupeSur === v.cle ? ' sfd-piece-oeil--actif' : ''}`}
                              aria-pressed={loupeSur === v.cle}
                              title={AIDE_LOUPE} aria-label={`${AIDE_LOUPE} — ${v.nom}`}
                              onClick={(e) => { e.stopPropagation(); void basculerLoupe(v.cle, v.driveFileId, null); }}>
                              <span aria-hidden="true">🔎</span>
                            </button>
                            </span>
                          </span>
                          {loupeSur === v.cle && (
                            <span className="sfd-piece-etat sfd-loupe-compte"
                              role="status" title={phraseMethodeCourante()}>
                              🔎 {motCompteur(surlignage.nombre)}
                            </span>
                          )}
                          {occupee && <span className="sfd-piece-etat">Copie…</span>}
                          {ou !== null && !occupee && (
                            <span className="sfd-piece-etat sfd-piece-etat--ok">
                              {`✓ Copiée dans « ${ou.dossierNom} »${ou.nb > 1 ? ` (${ou.nb} copies)` : ''}`}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ══ LES EMPLACEMENTS : d'où l'on part. Ils restent en tête, toujours visibles. ═════════════════ */}
            <ul className="sfd-cote-liste">
              {emplacements.map((l) => ligneLaterale(l))}
            </ul>

            {/* ══ 🔴 « RÉCENTS » — une SECTION, repliable, au même style que les emplacements ════════════════
                ⚠️ L'ÉTAT EST MÉMORISÉ (préférence locale, try/catch) : qui replie cette section ne veut pas la
                voir se rouvrir à chaque message. */}
            {raccourcis.length > 0 && (
              <>
                <button type="button" className="sfd-cote-item sfd-cote-section"
                  aria-expanded={recentsOuverts}
                  onClick={() => {
                    const n = !recentsOuverts;
                    setRecentsOuverts(n);
                    try { globalThis.localStorage?.setItem(CLE_RECENTS_OUVERTS, n ? '1' : '0'); }
                    catch { /* une préférence qu'on ne peut pas écrire n'empêche pas de replier */ }
                  }}>
                  <span className="sfd-cote-icone" aria-hidden="true">🕘</span>
                  <span className="sfd-cote-mots"><span className="sfd-cote-libelle">Récents</span></span>
                  <span className="sfd-cote-chevron" aria-hidden="true">{recentsOuverts ? '▾' : '▸'}</span>
                </button>
                {recentsOuverts && (
                  <ul className="sfd-cote-liste sfd-cote-liste--indentee">
                    {raccourcis.map((l) => ligneLaterale(l, true))}
                  </ul>
                )}
              </>
            )}
          </aside>

          {/* ══ 🔴 LA POIGNÉE (demande d'Arno) ═══════════════════════════════════════════════════════════════
              ⚠️ `role="separator"` AVEC SES BORNES : c'est ce qui la rend annonçable et manœuvrable autrement
              qu'à la souris. Les flèches ← → la déplacent de 16 px, et ⇧ de 64 — un réglage qui n'existerait
              qu'à la souris serait inutilisable à qui n'en a pas. */}
          <div className="sfd-poignee" role="separator" aria-orientation="vertical" tabIndex={0}
            aria-label="Largeur de la colonne de gauche"
            aria-valuenow={largeurCoteVue} aria-valuemin={COTE_MIN} aria-valuemax={COTE_MAX}
            title="Glissez pour régler la largeur — double-clic pour la largeur par défaut"
            onPointerDown={saisirPoignee}
            onDoubleClick={() => { const v = largeurCote(null); setLargeurCoteVue(v); retenirLargeur(v); }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const pas = (e.shiftKey ? 64 : 16) * (e.key === 'ArrowLeft' ? -1 : 1);
              const v = largeurCote(largeurCoteVue + pas);
              setLargeurCoteVue(v);
              retenirLargeur(v);
            }} />

          <main className="sfd-vue" aria-label="Contenu">
            {/* ══ 🔴🔴 LOT RANGER-ARBRE-2 — « ↑ REMONTER À “X” », AU-DESSUS DE L'EN-TÊTE ════════════════════════
                Arno : « Une ligne “↑ Remonter à “<dossier parent>”” au-dessus de l'en-tête “Nom”, toujours
                visible dès qu'on n'est pas à la racine. Un clic remonte d'un niveau. Elle sert aussi de cible
                de dépôt. »
                🔴 POURQUOI ELLE VAUT MIEUX QUE LE SEUL FIL D'ARIANE : le bandeau des parents ne montre que deux
                crans et se replie ; cette ligne-là est TOUJOURS au même endroit, juste au-dessus de la liste, et
                elle NOMME l'endroit où l'on va. C'est le « .. » du Finder, en toutes lettres.
                ⚠️ PAS DE RESSORT : on ne veut pas qu'un survol pendant un glisser nous fasse changer d'étage. */}
            {chemin.length > 0 && (
              <button type="button"
                className={`sfd-remonter${survole === 'remonter' ? ' sfd-remonter--vise' : ''}`}
                title={`Remonter à « ${nomDuParent} »`}
                onClick={() => remonter(chemin.length - 1)}
                onDragEnter={cibleDuParent === null ? undefined
                  : (e) => survolerCible(e, { id: 'remonter', nom: cibleDuParent.nom, ouvrable: false, reel: cibleDuParent.id })}
                onDragOver={cibleDuParent === null ? undefined
                  : (e) => survolerCible(e, { id: 'remonter', nom: cibleDuParent.nom, ouvrable: false, reel: cibleDuParent.id })}
                onDragLeave={cibleDuParent === null ? undefined : () => quitterCible('remonter')}
                onDrop={cibleDuParent === null ? undefined : (e) => deposerSur(e, cibleDuParent)}>
                <span aria-hidden="true">↑</span> Remonter à «&nbsp;{nomDuParent}&nbsp;»
              </button>
            )}

            {/* ══ LES EN-TÊTES DE COLONNES : un clic trie, une flèche dit dans quel sens ═══════════════════════ */}
            {/* ══ 🔴 LES EN-TÊTES — seulement les colonnes MONTRÉES, sur la grille calculée une seule fois ═════
                ⚠️ LA GRILLE VIENT DU MODULE PUR, et elle est posée à la fois ici et sur chaque ligne : deux
                grilles écrites séparément se désalignent au premier changement de largeur. */}
            <div className="sfd-entetes" role="row" style={grille}>
              {COLONNES.filter((c) => colonnes.includes(c.cle)).map((c) => (
                <button key={c.cle} type="button" role="columnheader"
                  className={`sfd-entete sfd-col-${c.cle}${tri.colonne === c.cle ? ' sfd-entete--actif' : ''}`}
                  aria-sort={tri.colonne === c.cle ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => setTri((t) => (t.colonne === c.cle
                    ? { colonne: c.cle as Colonne, sens: t.sens === 'asc' ? 'desc' : 'asc' }
                    : { colonne: c.cle as Colonne, sens: 'asc' }))}>
                  {c.libelle}<span className="sfd-fleche-tri" aria-hidden="true">{flecheTri(c.cle, tri)}</span>
                </button>
              ))}
            </div>

            {/* ══ 🔴🔴 LOT RANGER-ARBRE-2 — LA ZONE VIDE SOUS LA LISTE EST LE DOSSIER AFFICHÉ ═════════════════
                Arno : « lâcher dans la zone vide sous la liste = déposer dans le dossier affiché ».
                🔴 C'EST LA MÊME IDÉE QUE LE LÂCHER SUR UN FICHIER : on vise un ENDROIT, et l'endroit qu'on a
                sous les yeux est celui dont on lit le contenu. Sans cela, le blanc sous la dernière ligne était
                un trou — le lâcher y valait abandon, et la pièce revenait sans explication.
                ⚠️ LES LIGNES ARRÊTENT LEUR ÉVÉNEMENT (`stopPropagation` dans `survolerCible` et `deposerSur`) :
                ce gestionnaire ne voit donc QUE le vide, jamais un lâcher déjà traité au-dessus d'une ligne. */}
            <div className={`sfd-lignes${survole === dossierCourant?.id ? ' sfd-lignes--vise' : ''}`}
              ref={scene} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              onDragEnter={depotDansLeVide === null ? undefined
                : (e) => survolerCible(e, { ...depotDansLeVide, ouvrable: false })}
              onDragOver={depotDansLeVide === null ? undefined
                : (e) => survolerCible(e, { ...depotDansLeVide, ouvrable: false })}
              onDragLeave={depotDansLeVide === null ? undefined : () => quitterCible(depotDansLeVide.id)}
              onDrop={depotDansLeVide === null ? undefined : (e) => deposerSur(e, depotDansLeVide)}
              /* 🔴 NOTRE MENU, PAS CELUI DE CHROME. ⚠️ On ne le pose QUE si le clic n'a pas déjà été traité par
                 une ligne : `defaultPrevented` le dit, et c'est ce qui évite deux menus pour un seul clic. */
              onContextMenu={(e) => {
                if (e.defaultPrevented) return;
                e.preventDefault();
                setSelection(SELECTION_VIDE);
                setMenu({ x: e.clientX, y: e.clientY, entree: null });
              }}>
              {/* ══ 🔴 « RÉCENTS », quand on le demande dans la barre latérale ═════════════════════════════════ */}
              {montrerRecents ? (
                <ul className="sfd-recents">
                  {recentsDrive.map((r) => (
                    <li key={`${r.sorte}|${r.cle}`}>
                      <button type="button" className="sfd-ligne sfd-ligne--recent"
                        disabled={ajoutes.includes(r.cle)} onClick={() => ouvrirRecent(r)}>
                        <span className="sfd-col-nom">
                          <span className="sfd-icone" aria-hidden="true">{r.sorte === 'drive_dossier' ? '📁' : '📄'}</span>
                          {r.libelle}
                        </span>
                        <span className="sfd-col-type">
                          {ajoutes.includes(r.cle) ? '✓ déjà ajouté'
                            : r.sorte === 'drive_dossier' ? 'dossier — ouvrir' : 'fichier — joindre'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : vue.v === 'charge' ? (
                /* 🔴 LE SQUELETTE : des lignes grises tout de suite, jamais un écran figé ni un vide. C'est ce qui
                   fait la différence entre « ça répond » et « ça rame » quand le Drive met une seconde. */
                <ul className="sfd-squelette" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, i) => <li key={i} className="sfd-ligne sfd-ligne--squelette" />)}
                </ul>
              ) : listing !== null && lignes.length === 0 && ligneNeuve.c === 'ferme' ? (
                /* ══ 🔴 DÉFAUT TROUVÉ EN FAISANT L'ESSAI RÉEL DU LOT RANGER-ARBRE-2 (30/09/2026) ═══════════════
                   Dans un dossier VIDE, « Nouveau dossier » ne faisait RIEN : la ligne en édition n'est rendue que
                   dans la branche ci-dessous, et un dossier vide prenait celle-ci. On ne pouvait donc jamais créer
                   un premier sous-dossier — il fallait sortir, créer ailleurs, déplacer. Le message « Ce dossier
                   est vide » s'efface maintenant dès qu'une ligne s'ouvre : c'est elle qu'on vient écrire. */
                <p className="gst-tronc sfd-vide">
                  {listing.recherche ? `Aucun dossier ni fichier trouvé pour « ${saisie.trim()} ».` : 'Ce dossier est vide.'}
                </p>
              ) : (
                <>
                  {/* La virtualisation : deux cales, et seulement les lignes qu'on voit. */}
                  {fenetre.avant > 0 && <div style={{ height: fenetre.avant }} aria-hidden="true" />}
                  <ul className="sfd-liste" role="listbox" aria-multiselectable="true">
                    {visibles.map((ligne) => {
                      const { entree: f, profondeur } = ligne;
                      /**
                       * ══ 🔴🔴 LOT RANGER-ARBRE-2 — CE QUE CETTE LIGNE DÉSIGNE COMME CIBLE ═══════════════════
                       * Un DOSSIER se désigne lui-même ; un FICHIER désigne le dossier qui le CONTIENT — son
                       * parent réel s'il est affiché sous un dossier déplié, le dossier affiché sinon. Voir
                       * l'encadré de `cibleDeDepot` : c'est le défaut qu'Arno a constaté, et sa règle.
                       */
                      const cible = cibleDeDepot(ligne, dossierCourant);
                      const recevable = cible !== null && !estRegroupement(cible.id) && !listing?.recherche;
                      const choisie = selection.ids.includes(f.id);
                      const deja = ajoutes.includes(f.id);
                      /* 🔴 LES DEUX ÉTATS NOUVEAUX D'UNE LIGNE :
                         · COUPÉE — estompée jusqu'au collage (demande d'Arno). Elle n'a PAS bougé : rien n'est
                           retiré du Drive tant qu'on n'a pas collé, et Échap rend la coupe.
                         · « ._ » — le jumeau technique de macOS : grisé, nommé pour ce qu'il est, et ni
                           visualisable ni joignable. */
                      const coupee = estCoupe(presse, f.id);
                      const systeme = estFichierSystemeMac(f.nom);
                      /* 🔴 « EN COURS » : la ligne est DÉJÀ à sa nouvelle place, mais le Drive ne l'a pas encore
                         confirmé. Un point discret et une infobulle en mots — jamais la seule opacité, qui se
                         lirait comme « désactivée », « sélectionnée » ou « coupée » selon l'écran et selon l'œil. */
                      const enVol = enMouvement.has(f.id);
                      const lisible = joindreOk && !systeme;
                      /**
                       * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LA LIGNE D'ATTENTE N'EST PAS UNE ENTRÉE DU DRIVE.
                       * Elle ne se sélectionne pas, ne se glisse pas, ne reçoit aucun dépôt et n'ouvre aucun
                       * menu : elle dit seulement « ça arrive ». La traiter comme une ligne ordinaire aurait
                       * permis de déposer une pièce sur un fichier qui n'existe pas.
                       */
                      if (f.id.startsWith('attente:')) {
                        return (
                          <li key={f.id} className="sfd-ligne sfd-ligne--attente" aria-hidden="true"
                            style={{ ...grille, paddingLeft: 6 + profondeur * 16 }}>
                            <span className="sfd-col-nom">
                              <span className="sfd-triangle sfd-triangle--vide" aria-hidden="true" />
                              <span className="sfd-nom">Chargement…</span>
                            </span>
                          </li>
                        );
                      }
                      return (
                        <li key={f.id} role="option" aria-selected={choisie}
                          /**
                           * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LE SURLIGNAGE DE LA LOUPE.
                           *
                           * Deux marques, et elles ne disent pas la même chose :
                           *   · `--trouve` : CETTE LIGNE EST le document (ou l'une de ses copies) ;
                           *   · `--chemin` : ce DOSSIER contient une occurrence, directement ou plus bas. On
                           *     l'ouvre, et le sous-dossier concerné porte à son tour la marque — jusqu'au
                           *     fichier. C'est ce qu'Arno demande « à chaque niveau de l'arbre ».
                           *
                           * ⚠️ DISTINCTES DE LA SÉLECTION (`--choisie`), et c'est une exigence : deux teintes
                           * différentes, sans quoi on ne saurait plus ce qu'on a coché et ce qu'on a trouvé.
                           */
                          className={`sfd-ligne${choisie ? ' sfd-ligne--choisie' : ''}`
                            + `${coupee ? ' sfd-ligne--coupee' : ''}${systeme ? ' sfd-ligne--systeme' : ''}`
                            + `${survole === f.id ? ' sfd-ligne--vise' : ''}${enVol ? ' sfd-ligne--envol' : ''}`
                            + `${surlignage.fichiers.has(f.id) ? ' sfd-ligne--trouve' : ''}`
                            + `${surlignage.reperes.has(f.id) && !surlignage.fichiers.has(f.id) ? ' sfd-ligne--chemin' : ''}`}
                          /* 🔴 L'INDENTATION EST UN PADDING, pas une marge : la ligne garde toute sa largeur, donc
                             toute sa surface de dépôt. Un dossier profond ne doit pas être plus dur à viser. */
                          style={{ ...grille, paddingLeft: 6 + profondeur * 16 }}
                          title={systeme ? infobulleFichierSysteme(f.nom) : undefined}
                          /* 🔴 SAISISSABLE — c'est ce qui manquait : « je ne peux pas saisir un fichier ou un
                             document pour le glisser-déposer » (Arno). */
                          draggable
                          onDragStart={(e) => demarrerGlisse(e, f)}
                          onDragEnd={() => finGlisse(true)}
                          /* ══ 🔴🔴 RÉÉCRIT (lot RANGER-ARBRE-2) — TOUTE LIGNE ACCEPTE UN LÂCHER ═════════════
                             CE QUI ÉTAIT ÉCRIT ICI : « seul un dossier accepte un dépôt. Sur un fichier, on ne
                             fait pas `preventDefault`, et le navigateur montre de lui-même le curseur
                             “interdit” — c'est le retour visuel demandé ». L'intention était juste, l'effet
                             non : sur les fichiers d'un dossier DÉPLIÉ, ce refus faisait remonter le lâcher
                             jusqu'à la fenêtre, dont le `drop` vaut ABANDON — la pièce revenait « à ranger »,
                             sans un mot. Reproduit au vrai glisser souris le 30/09/2026 (voir `cibleDeDepot`).
                             🔴 DÉSORMAIS : un fichier n'est pas une cible, il en DÉSIGNE une — son dossier. Le
                             curseur « interdit » ne reste que là où il n'y a vraiment rien à viser : la racine,
                             un regroupement, une liste de résultats venus de quarante dossiers.
                             ⚠️ `ouvrable` SUIT LA LIGNE, PAS LA CIBLE : le ressort déplie ce qu'on survole, et
                             l'on ne déplie pas un fichier. */
                          onDragEnter={!recevable ? undefined
                            : (e) => survolerCible(e, { ...(cible as { id: string; nom: string }), ouvrable: f.dossier })}
                          onDragOver={!recevable ? undefined
                            : (e) => survolerCible(e, { ...(cible as { id: string; nom: string }), ouvrable: f.dossier })}
                          onDragLeave={!recevable ? undefined : () => quitterCible((cible as { id: string }).id)}
                          onDrop={!recevable ? undefined
                            : (e) => deposerSur(e, cible as { id: string; nom: string })}
                          onMouseEnter={() => {
                            if (f.dossier) precharger(f.id);
                            else amorcer(f, lisible);
                          }}
                          onClick={(e) => {
                            const etendue = e.metaKey || e.ctrlKey || e.shiftKey;
                            setSelection((s) => cliquerLigne(s, f.id, ordre,
                              { cmd: e.metaKey || e.ctrlKey, maj: e.shiftKey }));
                            /* 🔴 UN CLIC SUR UN DOSSIER LE DÉPLIE SOUS LUI (demande d'Arno) : « quand on ouvre un
                               dossier, il se déploie sous lui […] le déploiement décale mécaniquement les dossiers
                               autour, mais ces derniers restent toujours visibles ». C'est ce qui permet de tenir
                               deux dossiers ouverts côte à côte et de glisser de l'un à l'autre.
                               ⚠️ SAUF QUAND ON ÉTEND LA SÉLECTION : ⌘-clic et ⇧-clic servent à CHOISIR plusieurs
                               lignes, et déplier sous eux ferait sauter la liste sous le doigt. */
                            /* 🔴 UN CLIC SUR UN DOSSIER LE DÉPLIE SOUS LUI, MAIS PAS TOUT DE SUITE : un
                               double-clic commence par un clic, et déplier entre les deux temps ferait changer la
                               liste sous le curseur — le double-clic se perdrait. Voir DELAI_DEPLIAGE_MS.
                               ⚠️ SAUF QUAND ON ÉTEND LA SÉLECTION : ⌘-clic et ⇧-clic servent à CHOISIR plusieurs
                               lignes, et déplier sous eux ferait sauter la liste sous le doigt. */
                            if (!f.dossier || etendue) return;
                            if (depliageEnAttente.current !== null) clearTimeout(depliageEnAttente.current);
                            depliageEnAttente.current = setTimeout(() => {
                              depliageEnAttente.current = null;
                              basculerDepliage(f);
                            }, DELAI_DEPLIAGE_MS);
                          }}
                          /* 🔴 DOUBLE-CLIC : un dossier s'ouvre, un fichier se visualise — comme dans le Finder. */
                          onDoubleClick={() => {
                            // 🔴 ON ANNULE LE DÉPLIAGE QUE LE PREMIER CLIC AVAIT ARMÉ : c'était le même geste.
                            if (depliageEnAttente.current !== null) {
                              clearTimeout(depliageEnAttente.current);
                              depliageEnAttente.current = null;
                            }
                            if (f.dossier) { ouvrirDossier(f); return; }
                            // ⚠️ `joindreOk`, et non `lisible` : c'est `visualiser` qui dit le refus d'un « ._ ».
                            visualiser(f, joindreOk);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelection((s) => (s.ids.includes(f.id) ? s : { ids: [f.id], ancre: f.id }));
                            setMenu({ x: e.clientX, y: e.clientY, entree: f });
                          }}>
                          <span className="sfd-col-nom">
                            {/* 🔴 LE TRIANGLE ▸ : il déplie SUR PLACE, sans quitter la vue. Absent sur un fichier. */}
                            {f.dossier ? (
                              <button type="button" className="sfd-triangle"
                                aria-label={ouverts.has(f.id) ? `Replier ${f.nom}` : `Déplier ${f.nom}`}
                                aria-expanded={ouverts.has(f.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // ⚠️ Le clic sur la LIGNE a pu armer le même dépliage : deux bascules pour un
                                  //   seul geste se seraient annulées l'une l'autre.
                                  if (depliageEnAttente.current !== null) {
                                    clearTimeout(depliageEnAttente.current);
                                    depliageEnAttente.current = null;
                                  }
                                  basculerDepliage(f);
                                }}>
                                <span aria-hidden="true">{ouverts.has(f.id) ? '▾' : '▸'}</span>
                              </button>
                            ) : <span className="sfd-triangle sfd-triangle--vide" aria-hidden="true" />}
                            <span className="sfd-icone" aria-hidden="true">{iconeEntree(f)}</span>
                            <span className="sfd-nom" title={f.nom}>{f.nom}</span>
                            {/* ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE REPÈRE DE LA LOUPE, ET SON NOMBRE ═══════
                                UN SEUL repère par chemin, posé sur le nœud VISIBLE le plus profond. Le nombre ne
                                s'affiche qu'au-delà de un : « 2 » dit que deux emplacements passent par ce dossier
                                fermé, et il disparaît dès qu'on l'ouvre et qu'ils se séparent.

                                🔴 LE MOT EST ÉCRIT, JAMAIS PORTÉ PAR LA SEULE COULEUR : l'infobulle dit ce que le
                                repère signifie, et le lecteur d'écran l'annonce. C'est la règle du module. */}
                            {surlignage.reperes.has(f.id) && (() => {
                              const n = surlignage.reperes.get(f.id) ?? 1;
                              const ici = surlignage.fichiers.has(f.id);
                              const mot = ici
                                ? 'Ce document est ici'
                                : n > 1
                                  ? `${n} emplacements de ce document passent par ce dossier — ouvrez-le pour les séparer`
                                  : 'Ce document est quelque part dans ce dossier — ouvrez-le pour descendre';
                              return (
                                <span className="sfd-repere" role="img" title={mot} aria-label={mot}>
                                  <span aria-hidden="true">🔎</span>
                                  {n > 1 && <span className="sfd-repere-nb" aria-hidden="true">{n}</span>}
                                </span>
                              );
                            })()}
                            {enVol && (
                              <span className="sfd-envol" title={MOT_EN_COURS} aria-label={MOT_EN_COURS}>
                                <span aria-hidden="true">•</span>
                              </span>
                            )}
                            {deja && <span className="sfd-ajoute">✓ ajouté</span>}
                          </span>
                          {colonnes.includes('modifie') && (
                            <span className="sfd-col-modifie">{dateFinder(f.modifieLe)}</span>
                          )}
                          {colonnes.includes('taille') && (
                            <span className="sfd-col-taille">{tailleFinder(f.tailleOctets, f.dossier)}</span>
                          )}
                          {/* 🔴 LE TYPE DIT LA VÉRITÉ : « Fichier système Mac », et non « PDF » — car c'en est un
                              qui n'en est pas un. C'est le mot qui évite de le joindre en croyant bien faire. */}
                          {colonnes.includes('type') && (
                            <span className="sfd-col-type">{systeme ? MOT_FICHIER_SYSTEME : motType(f)}</span>
                          )}

                          {/* ══ 🔴 LES ACTIONS DE LIGNE, EN ICÔNES DISCRÈTES AU SURVOL ═══════════════════════════
                              Elles étaient trois liens ROUGES permanents sur chaque ligne : la liste en était
                              illisible, et rien ne ressemblait moins au Finder. Elles restent TOUTES disponibles,
                              mais elles n'apparaissent qu'au survol (et au focus clavier), avec une infobulle.
                              🔴🔴 « Visualiser » et « Joindre » N'EXISTENT PAS là où la lecture est refusée — le
                              motif est affiché une fois, en tête de liste. « Insérer un lien » reste : il ne lit rien. */}
                          {!f.dossier && (
                            <span className="sfd-gestes" onClick={(e) => e.stopPropagation()}>
                              {lisible && (
                                <button type="button" className="sfd-geste" title="Visualiser"
                                  aria-label={`Visualiser ${f.nom}`}
                                  onFocus={() => amorcer(f, lisible)}
                                  onClick={() => visualiser(f, lisible)}>
                                  <span aria-hidden="true">👁</span>
                                </button>
                              )}
                              {lisible && !deja && (
                                <button type="button" className="sfd-geste" title="Joindre au message"
                                  aria-label={`Joindre ${f.nom}`} onClick={() => void joindre(f)}>
                                  <span aria-hidden="true">📎</span>
                                </button>
                              )}
                              <button type="button" className="sfd-geste" title="Insérer un lien"
                                aria-label={`Insérer un lien vers ${f.nom}`} onClick={() => lier(f)}>
                                <span aria-hidden="true">🔗</span>
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {/* ══ 🔴 LA LIGNE NEUVE, À SA PLACE ════════════════════════════════════════════════════
                        Arno : « insère immédiatement une ligne de dossier en DERNIÈRE position du dossier
                        affiché, surlignée, avec une courte animation d'apparition ». Quand on crée dans un
                        sous-dossier déplié, elle naît à la fin de SES enfants, indentée d'un cran — à l'endroit
                        exact où le dossier apparaîtra. On ne lit plus un chemin : on le voit. */}
                    {rangLigneNeuve !== null && ligneEnEdition(indentLigneNeuve)}
                  </ul>
                  {fenetre.apres > 0 && <div style={{ height: fenetre.apres }} aria-hidden="true" />}
                  {/* 🔴 UNE LISTE INCOMPLÈTE LE DIT. Taire la troncature ferait conclure qu'un dossier n'existe
                      pas alors qu'il est simplement au-delà de la borne — la faute d'avant ce lot. */}
                  {listing !== null && listing.tronque && (
                    <p className="gst-tronc sfd-vide" role="status">
                      Ce dossier contient plus d’entrées que cette liste n’en affiche. Utilisez la recherche (🔍)
                      pour atteindre celles qui manquent.
                    </p>
                  )}
                </>
              )}
            </div>
          </main>
        </div>

        {/* ══ LE PIED : la zone de dépôt, le compteur, la sélection multiple, et « Terminé » ═══════════════════ */}
        <div className="sfd-pied">
          {/* ══ 🔴 « PIÈCES JOINTES » — LA ZONE DE DÉPÔT DU MESSAGE, RAMENÉE ICI ══════════════════════════════
              ⚠️ ELLE EST DANS CETTE FENÊTRE, et non sur le brouillon : ce navigateur est une modale qui RECOUVRE
              le message — pendant un glisser, la zone du mail est littéralement derrière. La ramener ici est la
              seule façon de la rendre atteignable. Elle n'écrit rien dans le Drive : elle joint, comme le 📎. */}
          {mode === 'joindre' && joindreOk && (
            <div className={`sfd-depot${survole === 'pj' ? ' sfd-depot--vise' : ''}`}
              onDragEnter={(e) => {
                if (glisse === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (survole !== 'pj') setSurvole('pj');
              }}
              onDragOver={(e) => {
                if (glisse === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (survole !== 'pj') setSurvole('pj');
              }}
              onDragLeave={() => quitterCible('pj')}
              onDrop={deposerSurPiecesJointes}>
              <span aria-hidden="true">📎</span> Pièces jointes — déposez ici pour joindre au message
            </div>
          )}
          {mode === 'joindre' ? (
            <p className={`sfd-compteur${ajoutes.length === 0 ? ' sfd-compteur--vide' : ''}`} role="status">
              {ajoutes.length === 0
                ? 'Aucune pièce ajoutée — la fenêtre reste ouverte, prenez-en autant que nécessaire.'
                : `${ajoutes.length} pièce${ajoutes.length > 1 ? 's' : ''} ajoutée${ajoutes.length > 1 ? 's' : ''} au message.`}
            </p>
          ) : (
            <p className="sfd-compteur" role="status">
              {/* 🔴 ON DIT OÙ L'ON EST, parce que c'est là que « Déposer ici » va poser. Un bouton qui nomme sa
                  cible est la seule protection contre la faute la plus probable : le bon geste, au mauvais endroit. */}
              {dossierCourant === null
                ? 'Choisissez un dossier, ou glissez une pièce sur celui de votre choix.'
                : `Dossier affiché : « ${dossierCourant.nom} ».`}
            </p>
          )}
          {/* ══ 🔴 « DÉPOSER ICI » — la seconde voie, pour le tactile et pour qui ne glisse pas ══════════════
              ⚠️ ÉTEINT À LA RACINE : « Google Drive », « Drives partagés » et « Partagés avec moi » ne sont pas
              des dossiers — Google refuserait le dépôt APRÈS le téléversement. Un bouton qui promet cela ment. */}
          {mode === 'ranger' && pieces.length > 0 && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              disabled={dossierCourant === null || estRegroupement(dossierCourant.id)}
              title={dossierCourant === null ? 'Entrez dans un dossier du Drive.'
                : estRegroupement(dossierCourant.id)
                  ? 'Ce n’est pas un dossier, c’est un regroupement : ouvrez-le et choisissez un dossier dedans.'
                  : undefined}
              onClick={() => {
                if (dossierCourant === null) return;
                deposerToutIci(dossierCourant.id, dossierCourant.nom);
              }}>
              {/* 🔴 LOT RANGER-ARBRE-2 — LE NOMBRE EST CELUI DU LOT QUI PARTIRA, sélection comprise : c'est
                  `piecesEmportees` qui le dit, et le clic range EXACTEMENT ces pièces-là. */}
              {/* ⚠️ LE COMPTE DIT CE QUI PARTIRA : les pièces du message ET les copies à ranger. Annoncer le seul
                     nombre de pièces ferait croire qu'on en oublie. */}
              {motDeposerIci(lotDuBouton.length + vignettes.length)}
            </button>
          )}
          {/* 🔴 « JOINDRE LA SÉLECTION » : la suite naturelle du Cmd+clic et du Maj+clic. Absent là où la lecture
              du contenu est refusée, comme les boutons de ligne. */}
          {/* ⚠️ LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — SEUL LE MODE « consulter » EST ÉCARTÉ ICI : on y
                 vient regarder le dossier d'un bien, il n'y a aucun message à remplir. Les modes « joindre » et
                 « ranger » gardent EXACTEMENT ce qu'ils affichaient — ce lot ne retire rien à personne. */}
          {mode !== 'consulter' && joindreOk && selectionJoignable.length > 1 && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { for (const f of selectionJoignable) void joindre(f); }}>
              Joindre la sélection ({selectionJoignable.length})
            </button>
          )}
          {/* ══ 🔴 « ↶ ANNULER LE DERNIER DÉPLACEMENT », à gauche de « Terminé » ═══════════════════════════
              ⚠️ GRISÉ TANT QUE RIEN N'A ÉTÉ DÉPLACÉ, et son infobulle dit alors POURQUOI — y compris le cas
              qui surprend : une copie ne s'annule pas, puisque l'annuler voudrait dire la supprimer. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn"
            disabled={pileAnnulation.length === 0}
            title={motProchaineAnnulation(pileAnnulation)}
            aria-label={motProchaineAnnulation(pileAnnulation)}
            onClick={() => void annulerDernierPas()}>
            <span aria-hidden="true">↶</span> Annuler le dernier déplacement
          </button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>

    {/* ══ 🔴 L'INDICATEUR DE CIBLE, PRÈS DU CURSEUR ════════════════════════════════════════════════════════
        Arno : « pendant tout le glisser, un indicateur discret près du curseur affiche le nom de la cible ».
        ⚠️ `pointer-events:none` dans le CSS : il suit le curseur, il ne doit JAMAIS l'intercepter — sans quoi il
        deviendrait lui-même la cible du lâcher, et le dépôt tomberait à côté. */}
    {cibleNommee !== null && (glisse !== null || piecesGlissees.length > 0) && (
      <div className="sfd-cible-nommee" role="status" style={{ left: cibleNommee.x + 14, top: cibleNommee.y + 18 }}>
        → Déposer dans «&nbsp;{cibleNommee.nom}&nbsp;»
      </div>
    )}

    {/* ══ 🔴🔴 LE MENU CONTEXTUEL — UNIQUEMENT LES ACTIONS QUE L'APPLICATION SAIT FAIRE ════════════════════════
        Jamais Renommer, Placer dans la corbeille, Supprimer, Déplacer, Partager ni Dupliquer : l'application ne
        fait rien de tout cela, et le module pur qui construit ce menu ne connaît même pas ces mots. */}
    {menu !== null && (
      <>
        <div className="sfd-menu-voile" role="presentation" onClick={() => setMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
        {/* ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — IL RESTE ENTIÈREMENT VISIBLE ═══════════════════════════════
            Constat d'Arno : sur une ligne en BAS de la liste, le menu sortait de l'écran et ses dernières entrées
            étaient coupées — « Supprimer » compris. On le MESURE après le premier rendu, puis on le recadre :
            retourné vers le haut (ou la gauche) s'il déborde, collé au bord si la fenêtre est plus courte que lui.

            🔴 MESURÉ, ET NON ESTIMÉ À PARTIR DU NOMBRE D'ENTRÉES : un motif de refus tient parfois sur trois
            lignes, et l'estimation se tromperait précisément dans le cas qui déborde. */}
        <ul className="sfd-menu" role="menu" ref={cadreMenu}
          style={{ left: poseMenu?.x ?? menu.x, top: poseMenu?.y ?? menu.y,
            /* ⚠️ INVISIBLE LE TEMPS DE LA MESURE : sans cela on verrait le menu sauter de sa position brute à sa
               position recadrée. Un seul rendu d'écart, mais il se voit. */
            visibility: poseMenu === null ? 'hidden' : undefined }}
          aria-label={menu.entree === null ? 'Actions sur ce dossier' : `Actions sur ${menu.entree.nom}`}>
          {entreesDuMenu(menu.entree).map((e) => (
            <li key={e.action} role="none"
              className={e.separateurAvant === true ? 'sfd-menu-li--separe' : undefined}>
              <button type="button" role="menuitem" className="sfd-menu-item"
                disabled={e.motifInactif !== null} title={e.motifInactif ?? undefined}
                onClick={() => agirMenu(e.action, menu.entree)}>
                {e.libelle}
              </button>
              {e.motifInactif !== null && <p className="sfd-menu-motif">{e.motifInactif}</p>}
            </li>
          ))}
        </ul>
      </>
    )}

    {/* ══ 🔴🔴 L'APERÇU — FRÈRE DU NAVIGATEUR, PAS SON ENFANT ═══════════════════════════════════════════════════
        On revient exactement au même dossier, avec la même recherche, le même compteur et les mêmes « ✓ ajouté » :
        le navigateur n'est pas démonté, donc son état ne bouge pas — fermer l'aperçu ne « revient » nulle part, on
        n'était jamais parti. Et dedans, ses Échap et ses clics seraient remontés jusqu'à lui : une croix qui ferme
        deux fenêtres au lieu d'une. */}
    {aVoir !== null && listing !== null && (
      <ApercuFichierDrive
        fichier={aVoir}
        /* 🔴 DEUX TOURS POSSIBLES, ET JAMAIS MÉLANGÉS : les pièces du mail, ou les fichiers du dossier affiché.
           C'est la SOURCE du document ouvert qui tranche, pas l'endroit d'où l'on a cliqué. */
        voisinage={aVoir.source === 'piece' ? voisinagePieces
          : [...listing.dossiers, ...listing.fichiers].map((f) => ({
            id: f.id, nom: f.nom, typeMime: f.typeMime, dossier: f.dossier,
            parentId: f.parentId ?? (listing.recherche ? null : dossierCourant?.id ?? null),
          }))}
        /* ⚠️ AUCUN « Joindre » SUR UNE PIÈCE REÇUE : en mode « ranger » il n'y a pas de message à remplir, et le
           geste utile — déposer dans un dossier — se fait dans le panneau, qui reste visible derrière.
           ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM, POINT 4 — « JOINDRE CE FICHIER » EST UN GESTE D'ÉCRITURE ═════════
           CONSTAT D'ARNO (03/10/2026) : « le bouton apparaît dans la visionneuse pendant la LECTURE d'un mail
           reçu ». Il y était, et il ne faisait RIEN : `onChoisir` n'existe qu'en mode « joindre », donc le clic
           partait dans le vide — exactement le défaut des entrées « Joindre au message » et « Insérer un lien »
           du menu clic droit, corrigé au lot précédent. Même règle, même mot : `mode === 'joindre'` EST « la
           fenêtre a été ouverte depuis un message en cours d'écriture » (nouveau, réponse, transfert,
           brouillon) — c'est le seul composant qui le passe, et il ne le passe que de là.
           ⚠️ CE N'EST PAS UN MASQUAGE DE PLUS : le bouton reste exactement là où il servait, et nulle part
           ailleurs. Rien n'est retiré à l'éditeur de mail. */
        joindreAutorise={aVoir.source === 'piece' || mode !== 'joindre' ? false : listing.joindreAutorise}
        estDeja={(id) => ajoutes.includes(id)}
        onJoindre={(f) => {
          void joindre({
            id: f.id, nom: f.nom, typeMime: f.typeMime, tailleOctets: null,
            modifieLe: null, lien: f.lien, dossier: false,
          });
        }}
        /* ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE BANDEAU DE NOM, SEULEMENT SUR UNE PIÈCE REÇUE ═══════════════
            Un fichier du DRIVE ne se renomme pas ici : il existe déjà là-bas, et l'application n'y renomme rien.
            La prop est donc absente dans ce cas, et l'aperçu est celui d'avant ce lot, mot pour mot.
            ⚠️ `pieces.find` ET NON LA PIÈCE CLIQUÉE : « Précédent / Suivant » change de pièce dans la même
            fenêtre, et le bandeau doit suivre celle qui est AFFICHÉE (demande d'Arno). */
        renommage={(idAffiche) => {
          /**
           * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LE BANDEAU SERT AUSSI LES VIGNETTES ═══════════
           *
           * Une vignette dupliquée porte le crayon ✎ comme une pièce jointe : son nom choisi est celui sous
           * lequel LA COPIE naîtra. Le fichier source, lui, garde le sien — on ne renomme jamais un fichier
           * existant du Drive, et c'est pourquoi il n'y a ici aucun refus à opposer : il n'existe pas encore
           * de fichier à renommer.
           *
           * ⚠️ LES PIÈCES D'ABORD : l'identifiant d'une pièce est un nombre, celui d'une vignette une chaîne
           * Drive — ils ne peuvent pas se confondre, mais l'ordre fixe la réponse si cela arrivait un jour.
           */
          if (aVoir.source === 'piece') {
            const x = pieces.find((p) => String(p.pieceId) === idAffiche);
            if (x === undefined) return undefined;
            return {
              nomOrigine: x.nom,
              nomChoisi: nomsChoisis.get(x.pieceId) ?? null,
              editerDabord: renommerDabord === x.pieceId,
              refus: null,
              onRenommer: (nom: string) => renommerPiece(x.pieceId, x.nom, nom),
            };
          }
          const v = vignettes.find((x) => x.driveFileId === idAffiche);
          if (v === undefined) return undefined;
          return {
            nomOrigine: v.nom,
            nomChoisi: nomsVignettes.get(v.cle) ?? null,
            editerDabord: renommerVignette === v.cle,
            refus: null,
            onRenommer: (nom: string) => {
              setNomsVignettes((m) => {
                const n = new Map(m);
                if (nom.trim() === '' || nom === v.nom) n.delete(v.cle); else n.set(v.cle, nom);
                return n;
              });
              // La barre de titre porte le nom : elle doit suivre, sans quoi on lirait l'ancien juste au-dessus.
              setAVoir((a) => (a !== null && a.id === v.driveFileId ? { ...a, nom } : a));
              /**
               * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 0 — LE CRAYON RENOMME AUSSI LA SOURCE ═══════════
               *
               * DÉCISION D'ARNO (03/10/2026) : « le crayon ✎ d'une vignette dupliquée renomme AUSSI le fichier
               * source et toutes les copies connues (même mécanisme files.update, jamais de copie) ».
               *
               * 🔴 CE QUI CHANGE DU CONTRAT DE LA VIGNETTE. « L'original ne bouge pas » valait pour ses
               * EMPLACEMENTS — dupliquer puis ranger ne déplace toujours rien, et crée bien une copie de plus.
               * Ce qui bouge désormais, c'est son NOM, et c'est précisément ce qu'Arno a tranché : un document
               * ne peut pas s'appeler autrement selon l'endroit d'où on le regarde.
               *
               * ⚠️ LE NOM RESTE AUSSI RETENU POUR LA COPIE (`nomsVignettes`). Ce n'est pas un doublon : si le
               * serveur refuse le renommage de la source (fichier hors registre, dossier protégé), la copie
               * part quand même sous le nom voulu — exactement comme avant ce lot.
               */
              if (nom.trim() !== '' && nom !== v.nom) void renommerPourDeVrai({ driveFileId: v.driveFileId }, nom);
            },
          };
        }}
        onFermer={() => { setAVoir(null); setRenommerDabord(null); setRenommerVignette(null); }} />
    )}
    </>
  );
}

export const CSS_SELECTEUR_FICHIER = `
/* ══ 🔴 LOT DRIVE-FACON-FINDER — LA FENETRE, PRESQUE PLEIN ECRAN ET REDIMENSIONNABLE ═══════════════════════════
   Le modele est une fenetre du Finder en presentation LISTE : large, dense, avec sa barre de titre, sa barre
   d'outils, sa barre laterale et ses colonnes. La generosite de la taille n'est pas un confort : dans un Drive de
   quinze mille dossiers, une fenetre de 640 px obligeait a defiler pour lire dix lignes. */
.sfd-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:2vh 2vw;
  background:color-mix(in srgb, var(--color-svv-ink) 38%, transparent)}
.sfd{display:flex;flex-direction:column;width:min(1400px,96vw);height:min(920px,94vh);min-width:520px;min-height:360px;
  overflow:hidden;resize:both;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.7rem;
  box-shadow:0 10px 40px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.sfd:focus{outline:none}

/* ── LA BARRE DE TITRE, avec sa croix (elle manquait) ─────────────────────────────────────────────────────── */
.sfd-barre-titre{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;min-height:44px;flex:0 0 auto;
  background:var(--color-svv-ink);color:var(--color-svv-surface)}
.sfd-titre{flex:1 1 auto;min-width:0;margin:0;font-size:.9rem;font-weight:700;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-croix{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;
  padding:0;font:inherit;font-size:.95rem;color:inherit;background:transparent;border:0;border-radius:.3rem;cursor:pointer}
.sfd-croix:hover{background:color-mix(in srgb, var(--color-svv-surface) 18%, transparent)}
.sfd-croix:focus-visible{outline:2px solid var(--color-svv-surface);outline-offset:-2px}

/* ── LA BARRE D'OUTILS ────────────────────────────────────────────────────────────────────────────────────── */
.sfd-outils{display:flex;align-items:center;gap:8px;padding:6px 10px;flex:0 0 auto;flex-wrap:wrap;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line)}
.sfd-fleches{display:flex;gap:2px;flex:0 0 auto}
.sfd-outil{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;
  font:inherit;font-size:1rem;line-height:1;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.35rem;cursor:pointer}
.sfd-outil:hover:not(:disabled){background:var(--color-svv-field)}
.sfd-outil:disabled{opacity:.4;cursor:default}
.sfd-outil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-ariane{display:flex;align-items:center;flex-wrap:wrap;gap:2px;flex:1 1 12rem;min-width:0;font-size:.82rem}
.sfd-ariane-pas{display:inline-flex;align-items:center;gap:2px;min-width:0}
.sfd-chevron{color:var(--color-svv-muted)}
.sfd-ariane-bouton{max-width:16rem;padding:2px 6px;font:inherit;font-size:.82rem;color:var(--color-svv-ink);
  background:transparent;border:0;border-radius:.3rem;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-ariane-bouton:hover{background:var(--color-svv-surface)}
.sfd-ariane-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-outils-droite{display:flex;align-items:center;gap:4px;margin-left:auto;flex:0 0 auto}
.sfd-plus{position:relative}
.sfd-menu--outils{position:absolute;right:0;top:34px;left:auto}

/* ── LE CORPS : barre laterale + liste ────────────────────────────────────────────────────────────────────── */
/* 🔴 LOT RANGER-ARBRE-2 — LA COLONNE DE GAUCHE EST REGLABLE : sa largeur vient d'une variable posee en ligne
   par le composant, bornee par largeurCote (module pur). Le 210px de repli EST la largeur d'avant ce lot, ecrite
   ici pour qu'un rendu sans la variable (une epreuve, un rendu serveur) garde exactement la fenetre d'avant.
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit. */
.sfd-corps{display:grid;grid-template-columns:var(--sfd-cote,210px) 6px 1fr;flex:1 1 auto;min-height:0}
/* Pendant le tirage : plus aucune selection de texte, et le curseur reste celui du geste partout dans la fenetre. */
.sfd-corps--tire{cursor:col-resize;user-select:none}
.sfd-corps--tire *{cursor:col-resize !important}

/* ── LA POIGNEE DE LARGEUR ────────────────────────────────────────────────────────────────────────────────
   ⚠️ ELLE EST LARGE DE 6 px MAIS SE SAISIT SUR 11 : le trait visible reste fin, et la zone sensible deborde de
   part et d'autre. Une poignee de 6 px se rate une fois sur trois a la souris, et toujours au trackpad. */
.sfd-poignee{position:relative;background:var(--color-svv-line);cursor:col-resize;touch-action:none}
.sfd-poignee::after{content:"";position:absolute;top:0;bottom:0;left:-3px;right:-3px}
.sfd-poignee:hover,.sfd-poignee:focus-visible{background:var(--color-svv-red)}
.sfd-poignee:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-1px}
.sfd-cote{overflow-y:auto;padding:8px 6px;background:var(--color-svv-field);border-right:1px solid var(--color-svv-line)}
.sfd-cote-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.sfd-cote-item{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 8px;
  font:inherit;font-size:.82rem;text-align:left;color:var(--color-svv-ink);background:transparent;border:0;
  border-radius:.35rem;cursor:pointer}
.sfd-cote-item:hover{background:var(--color-svv-surface)}
.sfd-cote-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.sfd-cote-icone{flex:0 0 auto}
.sfd-cote-mots{display:flex;flex-direction:column;min-width:0}
.sfd-cote-libelle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-cote-detail{font-size:.72rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.sfd-vue{display:flex;flex-direction:column;min-width:0;min-height:0}

/* ── LES COLONNES : memes largeurs pour l'en-tete et les lignes ───────────────────────────────────────────── */
/* ⚠️ LA GRILLE EST POSEE EN LIGNE, par grilleColonnes (module rangementDrive) : l'en-tete et les lignes doivent
   porter EXACTEMENT la meme, et elle depend des colonnes montrees. Ce qui reste ici est ce qui ne change pas.
   ⚠️ ET AUCUN BACKTICK POUR CITER CE NOM : ce commentaire vit dans un litteral de gabarit. Cinquieme fois. */
.sfd-entetes,.sfd-ligne{display:grid;align-items:center;gap:8px}
.sfd-entetes{flex:0 0 auto;padding:0 10px;background:var(--color-svv-field);
  border-bottom:1px solid var(--color-svv-line-strong)}
.sfd-entete{display:flex;align-items:center;gap:4px;min-height:26px;padding:0 4px;
  font:inherit;font-size:.74rem;font-weight:700;text-align:left;color:var(--color-svv-muted);
  background:transparent;border:0;border-right:1px solid var(--color-svv-line);cursor:pointer}
.sfd-entete:last-child{border-right:0}
.sfd-entete:hover{color:var(--color-svv-ink)}
.sfd-entete--actif{color:var(--color-svv-ink)}
.sfd-fleche-tri{font-size:.62rem}

/* ── 🔴 LOT RANGER-ARBRE-2 — « ↑ Remonter a X », au-dessus de l'en-tete, toujours au meme endroit ───────── */
.sfd-remonter{display:flex;align-items:center;gap:6px;width:100%;min-height:26px;padding:0 10px;
  font:inherit;font-size:.76rem;text-align:left;color:var(--color-svv-muted);background:transparent;border:0;
  border-bottom:1px solid var(--color-svv-line);cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-remonter:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.sfd-remonter:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* Visee pendant un glisser : le meme vocabulaire que les autres cibles, pour que l'oeil n'ait rien a reapprendre. */
.sfd-remonter--vise{color:var(--color-svv-ink);
  background:color-mix(in srgb, var(--color-svv-red) 16%, transparent);
  box-shadow:inset 0 0 0 2px var(--color-svv-red)}

.sfd-lignes{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 10px 8px}
/* 🔴 LE VIDE SOUS LA LISTE EST UNE CIBLE : quand il est vise, c'est le DOSSIER AFFICHE qui s'allume, en creux —
   un cadre interieur, pour dire « ici, dans ce que vous regardez », sans peindre toute la liste. */
.sfd-lignes--vise{box-shadow:inset 0 0 0 2px var(--color-svv-red);border-radius:.3rem}
.sfd-liste,.sfd-recents,.sfd-squelette{list-style:none;margin:0;padding:0}

/* ── UNE LIGNE : fine, alternee, surlignee au survol et a la selection ────────────────────────────────────── */
.sfd-ligne{min-height:28px;padding:0 6px;font-size:.82rem;color:var(--color-svv-ink);
  border-bottom:1px solid color-mix(in srgb, var(--color-svv-line) 55%, transparent);cursor:default;
  user-select:none;position:relative}
.sfd-liste>.sfd-ligne:nth-child(even){background:color-mix(in srgb, var(--color-svv-field) 55%, transparent)}
.sfd-ligne:hover{background:var(--color-svv-field)}
/* La SELECTION est aux couleurs de la charte, et elle porte un MOT pour le lecteur d'ecran (aria-selected). */
.sfd-ligne--choisie,.sfd-liste>.sfd-ligne--choisie:nth-child(even){
  background:color-mix(in srgb, var(--color-svv-red) 16%, transparent);
  box-shadow:inset 2px 0 0 var(--color-svv-red)}
.sfd-ligne--recent{display:grid;width:100%;text-align:left;font:inherit;font-size:.82rem;border:0;
  background:transparent;cursor:pointer}
.sfd-ligne--recent:disabled{cursor:default;color:var(--color-svv-muted)}
.sfd-ligne--squelette{background:linear-gradient(90deg,
  color-mix(in srgb, var(--color-svv-line) 40%, transparent) 25%,
  color-mix(in srgb, var(--color-svv-line) 18%, transparent) 50%,
  color-mix(in srgb, var(--color-svv-line) 40%, transparent) 75%);
  border-radius:.25rem;margin:3px 0;height:22px}
@media (prefers-reduced-motion: no-preference){
  .sfd-ligne--squelette{background-size:200% 100%;animation:sfd-respire 1.1s linear infinite}
  @keyframes sfd-respire{from{background-position:200% 0}to{background-position:-200% 0}}
}

.sfd-col-nom{display:flex;align-items:center;gap:4px;min-width:0}
.sfd-triangle{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;min-width:18px;
  padding:0;font:inherit;font-size:.7rem;color:var(--color-svv-muted);background:transparent;border:0;cursor:pointer}
.sfd-triangle:hover{color:var(--color-svv-ink)}
.sfd-triangle--vide{cursor:default}
.sfd-icone{flex:0 0 auto}
.sfd-nom{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-col-modifie,.sfd-col-taille,.sfd-col-type{font-size:.76rem;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-col-taille{text-align:right}
.sfd-ajoute{flex:0 0 auto;font-size:.72rem;font-weight:700;color:var(--color-svv-green, var(--color-svv-ink))}

/* ── LES ACTIONS DE LIGNE : discretes, au survol, avec infobulle ──────────────────────────────────────────── */
.sfd-gestes{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px;
  opacity:0;pointer-events:none;background:var(--color-svv-surface);border-radius:.3rem;padding:1px}
.sfd-ligne:hover .sfd-gestes,.sfd-ligne:focus-within .sfd-gestes,.sfd-ligne--choisie .sfd-gestes{
  opacity:1;pointer-events:auto}
.sfd-geste{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  font:inherit;font-size:.8rem;line-height:1;background:transparent;border:0;border-radius:.25rem;cursor:pointer}
.sfd-geste:hover{background:var(--color-svv-field)}
.sfd-geste:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

/* ── LE MENU CONTEXTUEL ───────────────────────────────────────────────────────────────────────────────────── */
.sfd-menu-voile{position:fixed;inset:0;z-index:80}
.sfd-menu{position:fixed;z-index:81;list-style:none;margin:0;padding:4px;min-width:200px;max-width:280px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.5rem;
  box-shadow:0 6px 24px color-mix(in srgb, var(--color-svv-ink) 28%, transparent)}
.sfd-menu-item{display:block;width:100%;min-height:30px;padding:5px 10px;font:inherit;font-size:.82rem;
  text-align:left;color:var(--color-svv-ink);background:transparent;border:0;border-radius:.3rem;cursor:pointer}
.sfd-menu-item:hover:not(:disabled){background:var(--color-svv-field)}
.sfd-menu-item:disabled{color:var(--color-svv-muted);cursor:default}
.sfd-menu-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* Un refus se DIT : l'entree eteinte porte son motif, en petit, sous elle. */
.sfd-menu-motif{margin:0 0 4px;padding:0 10px;font-size:.7rem;color:var(--color-svv-muted)}
/* 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE FILET AU-DESSUS DE « Supprimer ». C'est le seul geste du menu qui retire
   un document d'un dossier ou quelqu'un ira le chercher : il ne doit pas se trouver au ras du doigt qui visait
   « Coller ici ». Une separation VISUELLE, pas une categorie. */
.sfd-menu-li--separe{margin-top:4px;padding-top:4px;border-top:1px solid var(--color-svv-line)}
/* 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LA LIGNE D'ATTENTE D'UN DOSSIER QUI S'OUVRE. Grisee et en italique : on
   voit tout de suite que ce n'est pas un fichier, et que quelque chose arrive. Aucune animation : le
   clignotement d'un squelette anime se remarque plus que l'attente qu'il masque. */
.sfd-ligne--attente{opacity:.55;font-style:italic;cursor:default;pointer-events:none}

/* ── LE PIED ──────────────────────────────────────────────────────────────────────────────────────────────── */
.sfd-pied{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;flex:0 0 auto;
  background:var(--color-svv-field);border-top:1px solid var(--color-svv-line)}
.sfd-compteur{flex:1 1 14rem;margin:0;font-size:.78rem;color:var(--color-svv-ink)}
.sfd-compteur--vide{color:var(--color-svv-muted)}

/* ── CE QUI RESTE DES LOTS PRECEDENTS ─────────────────────────────────────────────────────────────────────── */
/* ══ 🔴 LOT DRIVE-RETOUCHES-1 — LE BLOC DE RECHERCHE N'EST PLUS MANGE PAR CELUI DU DESSOUS ═════════════════
   Arno : « le champ est recouvert par le bloc du dessous : sa bordure basse est coupee, et l'en-tete Nom /
   Taille ainsi que la colonne de gauche le chevauchent ».
   ⚠️ CE N'ETAIT PAS UN CHEVAUCHEMENT AU SENS STRICT — les boites se touchaient au pixel pres (mesure : le champ
   finit a 178, le corps commence a 178). Mais le bloc n'avait AUCUN padding bas : la bordure arrondie du champ
   se retrouvait collee contre l'en-tete, qui a son propre fond et sa propre bordure, et la mangeait. A l'oeil,
   c'est un chevauchement — et l'oeil a raison, c'est lui qu'on sert.
   Le bloc prend donc sa hauteur complete, et une bordure le separe franchement de la liste. */
.sfd-champ{display:flex;flex-direction:column;gap:3px;padding:8px 12px 10px;flex:0 0 auto;
  background:var(--color-svv-surface);border-bottom:1px solid var(--color-svv-line)}
.sfd-saisie{width:100%;min-height:38px;padding:.4rem .6rem;font-size:16px;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem}
.sfd-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-retour{align-self:flex-start;margin:6px 12px 0;flex:0 0 auto}
.sfd-interdit{margin:6px 12px 0;padding:6px 10px;flex:0 0 auto;font-size:.78rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .35rem .35rem 0}
.sfd-creer-corps{display:flex;flex-direction:column;gap:6px;padding:8px 12px;flex:0 0 auto}
.sfd-creer-chemin{display:flex;flex-direction:column;gap:2px;margin:0;min-width:0}
.sfd-creer-nom{font-size:.86rem;font-weight:700;color:var(--color-svv-ink)}
.sfd-mention{font-size:.74rem;color:var(--color-svv-muted)}
.sfd-mention--bloc{display:block}
.sfd-creer-boutons{display:flex;gap:8px;flex-wrap:wrap}
.sfd-creer-fait{margin:6px 12px 0;font-size:.8rem;color:var(--color-svv-ink);flex:0 0 auto}
.sfd-vide{margin:14px 6px}

/* ══ 🔴 LOT DRIVE-DEPLACER — GLISSER, COUPER/COLLER, BANDEAU, FICHIERS SYSTEME ══════════════════════════════
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit, et un seul backtick couperait le fichier
   en deux au milieu d'une regle CSS. Le piege s'est deja referme trois fois sur ce module.
   ⚠️ AUCUNE COULEUR EN DUR : uniquement les jetons --color-svv-*, pour que le sombre suive tout seul. */

/* ── LE FANTOME d'une selection multiple : il dit COMBIEN on tient ──────────────────────────────────────── */
.sfd-fantome{position:fixed;top:-1000px;left:-1000px;z-index:-1;padding:4px 10px;border-radius:.4rem;
  font:600 .8rem/1.2 system-ui,sans-serif;color:var(--color-svv-surface);background:var(--color-svv-red)}

/* ── LA CIBLE ALLUMEE : dossier de la liste, entree laterale, pas du fil d'Ariane ───────────────────────── */
.sfd-ligne--vise{outline:2px solid var(--color-svv-red);outline-offset:-2px;
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}
.sfd-cote-item--vise,.sfd-ariane-bouton--vise{outline:2px solid var(--color-svv-red);outline-offset:-2px;
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}

/* ── UNE LIGNE COUPEE : estompee JUSQU'AU COLLAGE. Elle n'a pas bouge, et Echap rend la coupe. ──────────── */
.sfd-ligne--coupee{opacity:.45}

/* ── 🔴 LOT DRIVE-DEPLACER-RAPIDE — UNE LIGNE « EN COURS » ────────────────────────────────────────────────
   Elle est deja a sa nouvelle place ; le Drive ne l'a pas encore confirme. DISCRET, comme demande : un point
   qui respire, et rien d'autre. L'etat est dit par l'infobulle, jamais par la seule couleur.
   ⚠️ LA LIGNE RESTE PLEINEMENT LISIBLE : la palir la ferait passer pour desactivee alors qu'elle est bien la. */
.sfd-ligne--envol .sfd-nom{opacity:.8}
.sfd-envol{flex:0 0 auto;font-size:1.1rem;line-height:1;color:var(--color-svv-red);
  animation:sfd-respire 1s ease-in-out infinite}
@keyframes sfd-respire{0%,100%{opacity:.25}50%{opacity:1}}
/* ⚠️ Une animation n'est jamais la SEULE information, et elle se coupe quand le systeme le demande. */
@media (prefers-reduced-motion:reduce){
  .sfd-envol{animation:none;opacity:.8}
}

/* ── UN FICHIER SYSTEME MAC (« ._ ») : grise, et son type le dit. Il reste affiche, exprès. ─────────────── */
.sfd-ligne--systeme{color:var(--color-svv-muted)}
.sfd-ligne--systeme .sfd-nom{font-style:italic}

/* ── LE BANDEAU « N element(s) deplace(s) vers X — Annuler », dix secondes ──────────────────────────────── */
.sfd-bandeau{display:flex;align-items:center;gap:10px;margin:6px 12px 0;padding:7px 10px;flex:0 0 auto;
  font-size:.8rem;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line-strong);border-left:3px solid var(--color-svv-red);
  border-radius:0 .35rem .35rem 0}
.sfd-bandeau-mot{flex:1 1 auto;min-width:0}
.sfd-bandeau-annuler{flex:0 0 auto;padding:3px 10px;font:600 .78rem/1.2 inherit;cursor:pointer;
  color:var(--color-svv-surface);background:var(--color-svv-red);border:0;border-radius:.3rem}
.sfd-bandeau-annuler:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:1px}
.sfd-bandeau-croix{flex:0 0 auto;padding:0 4px;font-size:.9rem;line-height:1;cursor:pointer;
  color:var(--color-svv-muted);background:none;border:0}

/* ── LA ZONE « PIECES JOINTES » DU PIED : la cible du mail, ramenee dans la fenetre modale ──────────────── */
.sfd-depot{flex:1 1 16rem;padding:7px 10px;font-size:.78rem;color:var(--color-svv-muted);
  background:var(--color-svv-surface);border:1px dashed var(--color-svv-line-strong);border-radius:.4rem}
.sfd-depot--vise{color:var(--color-svv-ink);border-style:solid;border-color:var(--color-svv-red);
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}

/* ⚠️ UN GLISSER NE SE FAIT PAS AU DOIGT sur un telephone : la zone de depot y devient un simple rappel, et
   tous les gestes restent accessibles par le menu contextuel (appui long) et par « Joindre la selection ». */
@media (max-width: 760px){
  .sfd-depot{flex:1 1 100%}
}

/* ══ 🔴 LOT DRIVE-UNIQUE — L'ARBORESCENCE COMPACTE ET LE PANNEAU « A RANGER » ═══════════════════════════════
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit, et un seul couperait le fichier en deux
   au milieu d'une regle CSS. Le piege s'est deja referme quatre fois sur ce module.
   ⚠️ AUCUNE COULEUR EN DUR : uniquement les jetons --color-svv-*, pour que le sombre suive tout seul. */

/* ── LES GUIDES VERTICAUX ── Arno : « guides verticaux discrets, aucune carte ni aucun encadre ».
   Un degrade repete de 16 px : un filet par niveau d'indentation, exactement au pas de l'arborescence. Il ne
   coute aucun element de plus, et il suit l'indentation sans qu'on ait a la recopier. */
.sfd-liste{background-image:repeating-linear-gradient(to right,
  color-mix(in srgb, var(--color-svv-line) 60%, transparent) 0 1px, transparent 1px 16px);
  background-position:13px 0;background-repeat:repeat-y;background-size:calc(16px * 6) 100%}

/* ── LE BANDEAU DES PARENTS ── deux crans, et un « … » qui compte ce qui est au-dessus. */
.sfd-ariane-bouton--racine{font-weight:600}
.sfd-ariane-caches{letter-spacing:.1em;color:var(--color-svv-muted)}

/* ── LE PANNEAU « A RANGER » ── ce qu'on tient dans la main gauche, au-dessus des emplacements. */
.sfd-ranger{display:flex;flex-direction:column;gap:4px;padding:8px 8px 10px;flex:0 0 auto;
  border-bottom:1px solid var(--color-svv-line)}
.sfd-ranger-titre{margin:0;font-size:.74rem;font-weight:600;letter-spacing:.02em;color:var(--color-svv-muted)}
.sfd-ranger-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;
  max-height:40vh;overflow-y:auto}

/* Une piece : sa miniature, son nom, sa taille, et ou elle est rangee. Saisissable a la souris comme au doigt. */
.sfd-piece{display:flex;align-items:center;gap:6px;padding:4px;border-radius:.4rem;cursor:grab;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line)}
.sfd-piece:hover{border-color:var(--color-svv-line-strong)}
.sfd-piece--enVol{opacity:.5}
/* 🔴 LOT RANGER-ARBRE-2 — une piece COCHEE part avec les autres : elle le dit par la couleur ET par sa case. */
/* 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — UNE VIGNETTE DUPLIQUEE SE DISTINGUE D'UNE PIECE DU MESSAGE.
   Un LISERE a gauche, pas une couleur de fond : le fond est deja pris par la selection et par l'etat « rangee »,
   et superposer trois teintes rendrait la colonne illisible. Le mot, lui, est ecrit dans le resume de la section
   (« N copies a ranger ») — jamais porte par la seule couleur.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.sfd-piece--copie{border-left:3px solid var(--color-svv-line-strong)}
/* ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA LOUPE ACTIVE, ET CE QU'ELLE SURLIGNE ═══════════════════
   🔴 UNE COULEUR DISTINCTE DE LA SELECTION (demande d'Arno). La selection est ROUGE (la couleur de la maison) ;
   la localisation est AMBREE. Deux teintes franchement differentes : sans cela, on ne saurait plus ce qu'on a
   coche et ce qu'on a trouve.
   🔴 ET ELLE TIENT EN CLAIR COMME EN SOMBRE. On ne pose pas une teinte opaque : color-mix melange l'ambre au
   FOND courant, donc le resultat suit le theme — pale sur blanc, profond sur noir — et le texte garde son
   contraste dans les deux cas. Le lisere gauche, lui, est le MEME dans les deux themes : c'est une forme, et une
   forme ne depend pas de la luminosite.
   (Aucun accent GRAVE dans ce bloc : il vit DANS un litteral gabarit, qu'un seul terminerait — piege consigne
   plusieurs fois dans ce depot, dont deja dans ce fichier.)
   ⚠️ LE MOT EST TOUJOURS ECRIT A COTE DE LA LOUPE (« N emplacement(s) connu(s) ») : l'information n'est jamais
   portee par la seule couleur — regle du module, et seule facon de rester lisible en niveaux de gris.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.sfd-loupe-ambre{--sfd-loupe:#b45309}
.sfd-piece-oeil--actif{background:color-mix(in srgb, #b45309 22%, transparent);border-radius:.3rem}
.sfd-loupe-compte{color:var(--color-svv-ink);font-weight:600}
/* ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — UN AMBRE FRANC, PLUS DU TOUT SAUMON ══════════════════════════════════
   Constat d'Arno : la premiere teinte (#b45309 a 9 %) tirait vers le saumon sur fond clair, trop proche du rouge
   de la selection. On passe a un JAUNE AMBRE franc (#f0a202), a une opacite plus forte, et le lisere gauche monte
   a 4 px : deux couleurs qu'on ne confond plus, meme du coin de l'oeil.
   🔴 ET IL TIENT DANS LES DEUX THEMES : color-mix melange l'ambre au FOND courant, donc le resultat suit le theme
   — jaune pale sur blanc, ocre profond sur noir — et le texte garde son contraste.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
/* LE DOSSIER QUI MENE AU DOCUMENT : un lisere, et un fond leger. Il reste lisible sous la selection. */
.sfd-ligne--chemin{box-shadow:inset 4px 0 0 #f0a202;
  background:color-mix(in srgb, #f0a202 14%, transparent)}
/* LE DOCUMENT LUI-MEME : la meme teinte, plus franche — c'est le bout du chemin. */
.sfd-ligne--trouve{box-shadow:inset 4px 0 0 #f0a202;
  background:color-mix(in srgb, #f0a202 26%, transparent);font-weight:600}
/* ⚠️ LA SELECTION GARDE LE DESSUS quand les deux se superposent : c'est elle qui commande les gestes. */
.sfd-ligne--choisie.sfd-ligne--trouve,.sfd-ligne--choisie.sfd-ligne--chemin{
  background:color-mix(in srgb, var(--color-svv-red) 16%, transparent)}
/* LE REPERE LUI-MEME : une pastille ambre a cote du nom, avec son nombre quand il y en a plusieurs. */
.sfd-repere{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;margin-left:4px;padding:0 5px;
  border-radius:999px;font-size:.7rem;line-height:1.5;
  color:var(--color-svv-ink);background:color-mix(in srgb, #f0a202 55%, transparent)}
.sfd-repere-nb{font-weight:700}
/* ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LES TROIS PICTOS SUR UNE LIGNE, COLLES A DROITE ═══════════════════════
   Demande d'Arno. Avant ce lot ils flottaient dans le texte de la ligne : le crayon passait a la ligne des que le
   nom etait long, et la vignette changeait de hauteur d'un fichier a l'autre. margin-left:auto les pousse a
   droite, flex-wrap:nowrap les garde ensemble, et flex:0 0 auto les empeche de se comprimer.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.sfd-piece-gestes{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;margin-left:auto;flex-wrap:nowrap}
/* LE COMPTEUR VERT : « range N fois dans le Drive ». Un etat d'ARRIVEE, donc la couleur des capsules vertes du
   module. Masque a zero — un 0 vert se lirait comme une bonne nouvelle alors qu'il dit le contraire. */
.sfd-piece-range{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
  min-width:16px;height:16px;padding:0 4px;border-radius:999px;font-size:.68rem;font-weight:700;
  color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.sfd-piece--cochee{border-color:var(--color-svv-red);
  background:color-mix(in srgb, var(--color-svv-red) 10%, var(--color-svv-surface))}
.sfd-piece-case{flex:0 0 auto;width:14px;height:14px;accent-color:var(--color-svv-red);cursor:pointer}
/* « Tout selectionner » : un bouton de texte, discret, au-dessus de la liste des pieces. */
.sfd-ranger-tout{align-self:flex-start;padding:1px 4px;font:inherit;font-size:.72rem;
  color:var(--color-svv-muted);background:transparent;border:0;border-radius:.3rem;
  text-decoration:underline;cursor:pointer}
.sfd-ranger-tout:hover{color:var(--color-svv-ink);background:var(--color-svv-surface)}
.sfd-ranger-tout:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-piece--rangee{border-style:dashed}
.sfd-piece-vignette{width:34px;height:34px;object-fit:cover;object-position:top;border-radius:.25rem;
  background:var(--color-svv-field);flex:0 0 auto}
.sfd-piece-mots{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
.sfd-piece-nom{font-size:.76rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-piece-taille{font-size:.7rem;color:var(--color-svv-muted)}
/* L'etat est dit en MOTS, jamais par la seule couleur ni par le seul trait du cadre. */
.sfd-piece-etat{font-size:.7rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-piece-etat--ok{color:var(--color-svv-ink)}
.sfd-piece-lien{color:var(--color-svv-ink);text-decoration:underline}
.sfd-piece-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ⚠️ SUR TELEPHONE, le panneau « A ranger » passe en rangee defilante au-dessus de la liste : une colonne
   laterale de 210 px n'a pas sa place a 390 px, et les pieces doivent rester visibles pendant qu'on cherche. */
@media (max-width: 760px){
  /* 🔴 SOUS 760 px, LA POIGNEE DISPARAIT — une poignee de 6 px au milieu d'un ecran de telephone n'est qu'un
     piege tactile. ⚠️ LA DISPOSITION, ELLE, NE BOUGE PAS : deux colonnes, comme avant ce lot ; seule la colonne
     de la poignee est retiree de la grille. */
  .sfd-corps{grid-template-columns:var(--sfd-cote,210px) 1fr}
  .sfd-poignee{display:none}
  .sfd-ranger{border-bottom:0;border-right:1px solid var(--color-svv-line)}
  .sfd-ranger-liste{flex-direction:row;max-height:none;overflow-x:auto}
  .sfd-piece{flex:0 0 12rem}
}

/* ══ 🔴 LOT DRIVE-RETOUCHES-1 ══════════════════════════════════════════════════════════════════════════════
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit. Cinquieme piege deja paye. */

/* ── L'OEIL SUR UNE PIECE A RANGER ── a droite du poids, comme demande. ─────────────────────────────────── */
.sfd-piece-ligne{display:flex;align-items:center;gap:6px}
.sfd-piece-oeil{margin-left:auto;padding:0 2px;font-size:.9rem;line-height:1;cursor:pointer;
  color:var(--color-svv-ink);background:none;border:0}
.sfd-piece-oeil:hover:not(:disabled){color:var(--color-svv-red)}
.sfd-piece-oeil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* 🔴 LOT RENOMMER-AVANT-RANGER — LE STYLO : meme taille, meme alignement et meme comportement que l'oeil
   (demande d'Arno). Il n'a PAS de margin-left:auto — c'est l'oeil qui pousse le couple a droite, et les deux
   restent colles l'un a l'autre.
   ⚠️ ETEINT, IL GARDE SA PLACE : une icone qui disparait ferait sauter la ligne d'une carte a l'autre. */
.sfd-piece-stylo{padding:0 2px;font-size:.9rem;line-height:1;cursor:pointer;
  color:var(--color-svv-ink);background:none;border:0}
.sfd-piece-stylo:hover:not(:disabled){color:var(--color-svv-red)}
.sfd-piece-stylo:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.sfd-piece-stylo:disabled,.sfd-piece-oeil:disabled{opacity:.4;cursor:not-allowed}
/* Le nom RECU, sous le nouveau : petit, gris, et tronque comme le nom lui-meme. */
.sfd-piece-origine{font-size:.68rem;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Un oeil eteint n'est pas un bouton : il ne se clique pas, et son infobulle dit pourquoi. */
.sfd-piece-oeil:disabled{opacity:.35;cursor:default}

/* ── LA SECTION « RECENTS » DE LA BARRE LATERALE ────────────────────────────────────────────────────────── */
.sfd-cote-section{width:100%}
.sfd-cote-chevron{margin-left:auto;font-size:.7rem;color:var(--color-svv-muted)}
/* Les raccourcis sont INDENTES et compacts : ils depemdent du bouton au-dessus, et ils sont nombreux. */
.sfd-cote-liste--indentee{padding-left:14px;
  border-left:1px solid color-mix(in srgb, var(--color-svv-line) 70%, transparent);margin-left:12px}
.sfd-cote-item--compact{min-height:0;padding-top:3px;padding-bottom:3px}
.sfd-cote-item--compact .sfd-cote-libelle{font-size:.78rem}
.sfd-cote-item--compact .sfd-cote-detail{font-size:.68rem}

/* ── LA LIGNE DE DOSSIER EN CREATION ────────────────────────────────────────────────────────────────────── */
.sfd-ligne--neuve{background:color-mix(in srgb, var(--color-svv-red) 10%, transparent);
  animation:sfd-apparait .18s ease-out}
@keyframes sfd-apparait{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.sfd-neuve-champ{flex:1 1 auto;min-width:0;height:22px;padding:0 4px;font:inherit;font-size:.82rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:.25rem}
.sfd-neuve-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-neuve-champ:disabled{opacity:.7}
/* Le refus s'affiche SOUS le champ, dans la ligne : on corrige sans quitter des yeux l'endroit ou l'on cree. */
.sfd-neuve-erreur,.sfd-neuve-echec{font-size:.72rem;color:var(--color-svv-red);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-neuve-echec{font-style:italic}
@media (prefers-reduced-motion:reduce){
  .sfd-ligne--neuve{animation:none}
}

/* ══ 🔴 LOT DRIVE-RETOUCHES-2 — L'INDICATEUR DE CIBLE, PRES DU CURSEUR ═════════════════════════════════════
   ⚠️ pointer-events:none EST INDISPENSABLE : il suit le curseur, donc il serait SOUS lui a chaque instant.
   S'il interceptait les evenements, il deviendrait la cible du lacher et le depot tomberait a cote.
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit. */
.sfd-cible-nommee{position:fixed;z-index:90;pointer-events:none;padding:3px 8px;border-radius:.35rem;
  font-size:.76rem;white-space:nowrap;max-width:22rem;overflow:hidden;text-overflow:ellipsis;
  color:var(--color-svv-surface);background:var(--color-svv-ink);
  box-shadow:0 2px 8px color-mix(in srgb, var(--color-svv-ink) 35%, transparent)}

/* ⚠️ SUR TELEPHONE, la barre laterale passe en rangee au-dessus de la liste, et les colonnes de droite
   disparaissent : quatre colonnes sur 380 px ne se lisent pas. Le NOM et les gestes restent. */
@media (max-width: 760px){
  .sfd{width:100%;height:100%;border-radius:0;resize:none}
  .sfd-corps{grid-template-columns:1fr;grid-template-rows:auto 1fr}
  .sfd-cote{border-right:0;border-bottom:1px solid var(--color-svv-line)}
  .sfd-cote-liste{flex-direction:row;flex-wrap:wrap}
  .sfd-col-modifie,.sfd-col-type,.sfd-entete.sfd-col-modifie,.sfd-entete.sfd-col-type{display:none}
}
`;
