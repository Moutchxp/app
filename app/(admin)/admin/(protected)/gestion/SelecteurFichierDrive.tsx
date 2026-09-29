'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  DUREE_ANNULATION_MS, estCoupe, estFichierSystemeMac, infobulleFichierSysteme, motColler, motMouvementFait,
  MOT_FICHIER_SYSTEME, type Presse,
} from '../../../../lib/gestion/driveDeplacement';
// 🔴 LOT DRIVE-DEPLACER-RAPIDE — l'écran qui répond au lâcher, et qui sait se dédire. Module PUR.
import {
  annuler as annulerLocalement, appliquer as appliquerLocalement, MOT_EN_COURS, motMouvementEnCours,
  type MouvementLocal,
} from '../../../../lib/gestion/mouvementOptimiste';
// 🔴 LOT DRIVE-UNIQUE — les règles du mode « ranger », du bandeau des parents et des colonnes. Module PUR.
import {
  bandeauParents, colonnesVisibles, grilleColonnes, MIME_PIECE, motColonnes, motRangee, resumeARanger,
  titreFenetre, type ModeDrive, type PieceARanger, type Rangee,
} from '../../../../lib/gestion/rangementDrive';
import {
  aplatir, avancer, cheminCourant, cliquerLigne, COLONNES, dateFinder,
  dossierDuChemin, fenetreVisible, flecheTri, HAUTEUR_LIGNE, HISTORIQUE_DEPART,
  iconeEntree, menuDossier, menuFichier, menuVide, motType, naviguerVers, peutAvancer, peutReculer, reculer,
  SELECTION_VIDE, selectionSuivante, tailleFinder, titreDuChemin, TRI_DEFAUT,
  type ActionMenu, type Chemin, type Colonne, type DroitsPresse, type EntreeDrive, type EntreeMenu,
  type Historique, type Selection, type Tri,
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
 * ⚠️ LE « RESSORT » DU FINDER : un dossier survolé assez longtemps pendant un glisser s'ouvre tout seul. 700 ms
 * est le compromis d'Apple — assez court pour descendre trois niveaux sans lâcher, assez long pour traverser un
 * dossier sans l'ouvrir par accident.
 */
const RESSORT_MS = 700;

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
  mode = 'joindre', messageId = null, pieces = [], onRangement,
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
  onRangement?: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [histo, setHisto] = useState<Historique>(HISTORIQUE_DEPART);
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
  /** La ligne de dossier en cours de création, s'il y en a une. */
  const [ligneNeuve, setLigneNeuve] = useState<LigneNeuve>(LIGNE_FERMEE);
  const [motDeLaCreation, setMotDeLaCreation] = useState<string | null>(null);
  const [menu, setMenu] = useState<CibleMenu | null>(null);
  const [outils, setOutils] = useState(false);
  /** 🔴 LE DÉPLIAGE SUR PLACE : les dossiers ouverts, et leurs enfants déjà lus. */
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [enfants, setEnfants] = useState<Map<string, Fichier[]>>(new Map());
  /* ══ 🔴🔴 LOT DRIVE-DEPLACER ═══════════════════════════════════════════════════════════════════════════════
     Décision d'Arno : l'application peut désormais DÉPLACER et COPIER dans le Drive. Elle ne supprime, ne renomme,
     ne met à la corbeille et ne partage toujours RIEN. */
  /** La presse-papiers, INTERNE à l'application : elle ne touche jamais au presse-papiers du système. */
  const [presse, setPresse] = useState<Presse | null>(null);
  /** Ce qui est en train d'être glissé. `null` = aucun glisser en cours. */
  const [glisse, setGlisse] = useState<{ ids: string[]; nom: string } | null>(null);
  /** Le dossier survolé pendant un glisser — celui qui s'allume. */
  const [survole, setSurvole] = useState<string | null>(null);
  /** Le bandeau « N élément(s) déplacé(s) vers X — Annuler ». `null` = rien à annoncer. */
  const [bandeau, setBandeau] = useState<{ mot: string; mouvements: number[] } | null>(null);
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
  /** La pièce qu'on est en train de glisser. `null` = aucune. */
  const [pieceGlissee, setPieceGlissee] = useState<PieceARanger | null>(null);
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
    };
    if (d.etat !== 'ok') return { erreur: d.message ?? 'Drive indisponible.' };
    return {
      fichiers: d.fichiers ?? [], dossiers: [],
      joindreAutorise: d.joindreAutorise !== false,
      motifRefus: d.motifRefus ?? null,
      // ⚠️ `=== true` et non `!== false` : un serveur qui ne dirait rien ne doit pas laisser croire qu'on peut
      //   créer. Le défaut, pour une ÉCRITURE, est « non » — l'inverse de ce qu'on fait pour une lecture.
      creerAutorise: d.creerAutorise === true,
      motifCreation: d.motifCreation ?? null,
      recherche: false,
      tronque: d.tronque === true,
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
    queueMicrotask(() => { if (!annule) void charger(''); });
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
    setOuverts(new Set());
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
    setSelection(SELECTION_VIDE); setOuverts(new Set()); setSaisie(''); oublierCreation();
    void charger(dossierDuChemin(cheminCourant(h)));
  };
  const pasAvant = () => {
    if (!peutAvancer(histo)) return;
    const h = avancer(histo);
    setHisto(h);
    setSelection(SELECTION_VIDE); setOuverts(new Set()); setSaisie(''); oublierCreation();
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
  const basculerDepliage = useCallback((f: Fichier) => {
    setOuverts((o) => {
      const n = new Set(o);
      if (n.has(f.id)) { n.delete(f.id); return n; }
      n.add(f.id);
      if (!enfants.has(f.id)) {
        void (async () => {
          try {
            const r = await lireListing(f.id, new AbortController().signal);
            if ('erreur' in r) return;
            cache.current.set(f.id, r);
            setEnfants((m) => new Map(m).set(f.id, r.fichiers));
          } catch { /* un sous-niveau qu'on n'a pas pu lire reste replié : rien ne casse */ }
        })();
      }
      return n;
    });
  }, [enfants, lireListing]);

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
  const lignes = aplatir(racineListe, ouverts, (id) => enfants.get(id), tri);
  const ordre = lignes.map((l) => l.entree.id);
  const fenetre = fenetreVisible(lignes.length, scrollTop, hauteurVue);
  const visibles = lignes.slice(fenetre.debut, fenetre.fin);

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

      setBandeau({
        mot: motMouvementFait(sorte, faits.length, d.nomCible ?? cibleNom),
        // ⚠️ UNE COPIE NE S'ANNULE PAS : annuler voudrait dire SUPPRIMER la copie, et l'app ne supprime rien.
        mouvements: sorte === 'deplacer' ? (d.mouvements ?? []) : [],
      });
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
      revaliderEnSilence(retour === null ? [dossierCourant?.id ?? ''] : [retour.cible, retour.source ?? '']);
    } catch {
      if (retour !== null) marquerEnVol(retour.elements.map((e) => e.id), false);
      setErreur('Le Drive n’a pas répondu.');
    }
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

  const ranger = async (piece: PieceARanger, cibleId: string, cibleNom: string): Promise<void> => {
    if (messageId === null || cibleId === '' || rangementEnCours.has(piece.pieceId)) return;
    setErreur(null);
    setRangementEnCours((v) => new Set(v).add(piece.pieceId));
    try {
      const res = await fetch(`/api/admin/gestion/pieces/${piece.pieceId}/drive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: cibleId }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string;
        resultats?: { pieceId: number; etat: string; lien?: string | null; motif?: string }[];
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'Le rangement n’a pas abouti.'); return; }
      const r = (d.resultats ?? [])[0];
      // 🔴 UN ÉCHEC PIÈCE PAR PIÈCE SE DIT : la route rend un verdict par pièce, jamais un « OK » global.
      if (r === undefined || r.etat === 'echec') {
        setErreur(`« ${piece.nom} » : ${r?.motif ?? 'le rangement n’a pas abouti.'}`);
        return;
      }
      setRangees((v) => {
        const n = new Map(v);
        n.set(piece.pieceId, { dossierId: cibleId, dossierNom: cibleNom, lien: r.lien ?? null });
        return n;
      });
      // Le dossier a un fichier de plus : son listing mémorisé ne vaut plus.
      cache.current.delete(cibleId);
      if (dossierCourant?.id === cibleId) void charger(cibleId);
      // L'écran du message relit ses dépôts : c'est lui qui affiche « Dans le Drive » sur la carte de la pièce.
      onRangement?.();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
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
  const voirPiece = (x: PieceARanger) => {
    setAVoir({
      id: String(x.pieceId), nom: x.nom, typeMime: x.typeMime ?? '', lien: null,
      parentId: PARENT_PIECES, source: 'piece',
    });
  };

  /** Le voisinage du tour : les pièces visualisables du mail, et rien d'autre. */
  const voisinagePieces = pieces.map((x) => ({
    id: String(x.pieceId), nom: x.nom, typeMime: x.typeMime ?? '', dossier: false, parentId: PARENT_PIECES,
  }));

  /** Les pièces qui restent à poser : celles qu'on n'a encore rangées nulle part. */
  const piecesARanger = pieces.filter((x) => !rangees.has(x.pieceId));

  /**
   * « DÉPOSER ICI » — l'autre voie, pour qui ne glisse pas (et pour le clavier, et pour le tactile).
   *
   * ⚠️ IL RANGE CE QUI RESTE À RANGER, pas tout : relancer le bouton après un premier dépôt ne doit pas redéposer
   * une pièce déjà posée ailleurs. Quand tout est rangé, il range de nouveau TOUT — c'est alors un geste explicite,
   * pour mettre le lot entier à un second endroit.
   */
  const deposerToutIci = (cibleId: string, cibleNom: string) => {
    const lot = piecesARanger.length > 0 ? piecesARanger : pieces;
    for (const x of lot) void ranger(x, cibleId, cibleNom);
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
  const finGlisse = () => {
    setGlisse(null);
    setPieceGlissee(null);
    setSurvole(null);
    if (ressort.current !== null) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  const demarrerGlisse = (e: React.DragEvent, f: Fichier) => {
    const elements = visesPar(f);
    if (!selection.ids.includes(f.id)) setSelection({ ids: [f.id], ancre: f.id });
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
   * LE SURVOL D'UNE CIBLE PENDANT LE GLISSER.
   *
   * 🔴 `preventDefault()` EST CE QUI AUTORISE LE DÉPÔT : sans lui, le navigateur affiche le curseur « interdit » et
   * n'émet jamais `drop`. C'est donc ici, et seulement ici, qu'on dit oui — sur un DOSSIER, jamais sur un fichier.
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
    if (pieceGlissee === null) {
      if (glisse === null || glisse.ids.includes(cible.reel ?? cible.id)) return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    if (survole !== cible.id) setSurvole(cible.id);
    // ⚠️ LE RESSORT : on n'en arme qu'UN, et seulement pour un dossier de la liste — pas pour le fil d'Ariane, où
    //   l'on est déjà en train de remonter, ni pour la zone des pièces jointes, qui ne s'ouvre pas.
    if (cible.ouvrable && ressort.current?.id !== cible.id) {
      if (ressort.current !== null) clearTimeout(ressort.current.minuteur);
      ressort.current = {
        id: cible.id,
        minuteur: setTimeout(() => { ressort.current = null; setSurvole(null); entrer(cible); }, RESSORT_MS),
      };
    }
  };

  const quitterCible = (id: string) => {
    setSurvole((v) => (v === id ? null : v));
    if (ressort.current?.id === id) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  /** La pièce reçue portée par ce transfert, ou `null` si c'en est un autre. */
  const pieceDuGlisse = (e: React.DragEvent): PieceARanger | null => {
    let brut = '';
    try { brut = e.dataTransfer.getData(MIME_PIECE); } catch { brut = ''; }
    if (brut !== '') {
      try {
        const lu = JSON.parse(brut) as { pieceId?: number };
        const trouvee = pieces.find((x) => x.pieceId === lu.pieceId);
        if (trouvee !== undefined) return trouvee;
      } catch { /* un transfert illisible se rattrape par l'état ci-dessous */ }
    }
    // ⚠️ REPLI PAR L'ÉTAT : jsdom et quelques navigateurs ne rendent pas les données d'un transfert pendant
    //   `dragover`. Ce qu'on tient est alors ce qu'on a pris au `dragstart`, et l'on n'invente rien.
    return pieceGlissee;
  };

  const demarrerGlisseDePiece = (e: React.DragEvent, piece: PieceARanger) => {
    setPieceGlissee(piece);
    setGlisse(null);
    try {
      e.dataTransfer.setData(MIME_PIECE, JSON.stringify({ pieceId: piece.pieceId, nom: piece.nom }));
      e.dataTransfer.effectAllowed = 'copy';
    } catch { /* un navigateur qui refuse le transfert ne doit pas casser le panneau */ }
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
    const piece = pieceDuGlisse(e);
    if (piece !== null) {
      finGlisse();
      if (cible.id !== '') void ranger(piece, cible.id, cible.nom);
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
      if (aVoir !== null) return;
      if (menu !== null) { e.preventDefault(); setMenu(null); return; }
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
        const cible = dossierCourant?.id ?? '';
        if (cible !== '') coller(cible, dossierCourant?.nom ?? 'ce dossier');
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
    }));

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
      // 🔴 SUR UN DOSSIER, ON COLLE DEDANS ; sur un fichier, dans le dossier AFFICHÉ, celui qui le contient.
      if (f.dossier) { coller(f.id, f.nom); return; }
      const cible = dossierCourant?.id ?? '';
      if (cible !== '') coller(cible, dossierCourant?.nom ?? 'ce dossier');
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
           survivraient au geste, et l'écran resterait « en train de glisser » pour toujours. */
        onDragEnd={finGlisse}
        onDrop={finGlisse}>

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
            ⚠️ « Annuler » N'APPARAÎT QUE POUR UN DÉPLACEMENT. Annuler une copie voudrait dire SUPPRIMER la copie,
            et l'application ne supprime rien : le bandeau d'une copie dit donc ce qui a été fait, sans promettre
            un retour qu'on ne saurait pas tenir. */}
        {bandeau !== null && (
          <p className="sfd-bandeau" role="status">
            <span className="sfd-bandeau-mot">{bandeau.mot}</span>
            {bandeau.mouvements.length > 0 && (
              <button type="button" className="sfd-bandeau-annuler"
                onClick={() => void annulerMouvement(bandeau.mouvements)}>Annuler</button>
            )}
            <button type="button" className="sfd-bandeau-croix" aria-label="Masquer ce message"
              onClick={() => setBandeau(null)}><span aria-hidden="true">✕</span></button>
          </p>
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
        <div className="sfd-corps">
          <aside className="sfd-cote" aria-label="Emplacements">
            {/* ══ 🔴🔴 « À RANGER » — CE QU'ON TIENT DANS LA MAIN GAUCHE ════════════════════════════════════════
                Arno : « un panneau “À ranger” qui liste les pièces jointes du mail avec leur miniature, leur nom
                et leur taille. Chaque pièce est glissable. »
                🔴 IL EST AU-DESSUS DES EMPLACEMENTS, et non en dessous : on regarde ce qu'on tient, puis on
                cherche où le mettre. L'inverse obligerait à défiler pour retrouver sa pièce. */}
            {mode === 'ranger' && pieces.length > 0 && (
              <section className="sfd-ranger" aria-label="Pièces à ranger">
                <p className="sfd-ranger-titre" role="status">{resumeARanger(pieces.length, rangees.size)}</p>
                <ul className="sfd-ranger-liste">
                  {pieces.map((x) => {
                    const ou = rangees.get(x.pieceId) ?? null;
                    const occupee = rangementEnCours.has(x.pieceId);
                    return (
                      <li key={x.pieceId}
                        className={`sfd-piece${ou !== null ? ' sfd-piece--rangee' : ''}`
                          + `${pieceGlissee?.pieceId === x.pieceId ? ' sfd-piece--enVol' : ''}`}
                        /* 🔴 GLISSABLE : c'est le geste principal de ce mode. Le bouton « Déposer ici » du pied
                           est la seconde voie — pour le tactile, et pour qui ne glisse pas. */
                        draggable
                        onDragStart={(e) => demarrerGlisseDePiece(e, x)}
                        onDragEnd={finGlisse}>
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
                          <span className="sfd-piece-nom" title={x.nom}>{x.nom}</span>
                          {/* ══ 🔴 LE POIDS, ET L'ŒIL À SA DROITE (demande d'Arno) ═══════════════════════════
                              🔴 IL MARCHE AUSSI SUR UNE PIÈCE VIDÉE : la route des pièces bascule d'elle-même
                              sur la copie Drive quand les octets locaux ont été libérés. Rien à écrire ici.
                              ⚠️ ÉTEINT, AVEC SON MOTIF, pour un « ._ » de macOS (qui ne contient pas le document)
                              et pour un type sans aperçu — promettre une fenêtre vide serait pire que rien. */}
                          <span className="sfd-piece-ligne">
                            <span className="sfd-piece-taille">{tailleFinder(x.tailleOctets, false)}</span>
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
                          </span>
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

          <main className="sfd-vue" aria-label="Contenu">
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

            <div className="sfd-lignes" ref={scene} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
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
              ) : listing !== null && lignes.length === 0 ? (
                <p className="gst-tronc sfd-vide">
                  {listing.recherche ? `Aucun dossier ni fichier trouvé pour « ${saisie.trim()} ».` : 'Ce dossier est vide.'}
                </p>
              ) : (
                <>
                  {/* La virtualisation : deux cales, et seulement les lignes qu'on voit. */}
                  {fenetre.avant > 0 && <div style={{ height: fenetre.avant }} aria-hidden="true" />}
                  <ul className="sfd-liste" role="listbox" aria-multiselectable="true">
                    {visibles.map(({ entree: f, profondeur }, rang) => {
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
                      return (
                        <li key={f.id} role="option" aria-selected={choisie}
                          className={`sfd-ligne${choisie ? ' sfd-ligne--choisie' : ''}`
                            + `${coupee ? ' sfd-ligne--coupee' : ''}${systeme ? ' sfd-ligne--systeme' : ''}`
                            + `${survole === f.id ? ' sfd-ligne--vise' : ''}${enVol ? ' sfd-ligne--envol' : ''}`}
                          /* 🔴 L'INDENTATION EST UN PADDING, pas une marge : la ligne garde toute sa largeur, donc
                             toute sa surface de dépôt. Un dossier profond ne doit pas être plus dur à viser. */
                          style={{ ...grille, paddingLeft: 6 + profondeur * 16 }}
                          title={systeme ? infobulleFichierSysteme(f.nom) : undefined}
                          /* 🔴 SAISISSABLE — c'est ce qui manquait : « je ne peux pas saisir un fichier ou un
                             document pour le glisser-déposer » (Arno). */
                          draggable
                          onDragStart={(e) => demarrerGlisse(e, f)}
                          onDragEnd={finGlisse}
                          /* ⚠️ SEUL UN DOSSIER ACCEPTE UN DÉPÔT. Sur un fichier, on ne fait pas `preventDefault`,
                             et le navigateur montre de lui-même le curseur « interdit » — c'est le retour visuel
                             demandé, rendu par le système plutôt que dessiné par nous. */
                          onDragOver={f.dossier
                            ? (e) => survolerCible(e, { id: f.id, nom: f.nom, ouvrable: true })
                            : undefined}
                          onDragLeave={f.dossier ? () => quitterCible(f.id) : undefined}
                          onDrop={f.dossier ? (e) => deposerSur(e, { id: f.id, nom: f.nom }) : undefined}
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
              Déposer ici{piecesARanger.length > 1 ? ` (${piecesARanger.length})` : ''}
            </button>
          )}
          {/* 🔴 « JOINDRE LA SÉLECTION » : la suite naturelle du Cmd+clic et du Maj+clic. Absent là où la lecture
              du contenu est refusée, comme les boutons de ligne. */}
          {joindreOk && selectionJoignable.length > 1 && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { for (const f of selectionJoignable) void joindre(f); }}>
              Joindre la sélection ({selectionJoignable.length})
            </button>
          )}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>

    {/* ══ 🔴🔴 LE MENU CONTEXTUEL — UNIQUEMENT LES ACTIONS QUE L'APPLICATION SAIT FAIRE ════════════════════════
        Jamais Renommer, Placer dans la corbeille, Supprimer, Déplacer, Partager ni Dupliquer : l'application ne
        fait rien de tout cela, et le module pur qui construit ce menu ne connaît même pas ces mots. */}
    {menu !== null && (
      <>
        <div className="sfd-menu-voile" role="presentation" onClick={() => setMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
        <ul className="sfd-menu" role="menu" style={{ left: menu.x, top: menu.y }}
          aria-label={menu.entree === null ? 'Actions sur ce dossier' : `Actions sur ${menu.entree.nom}`}>
          {entreesDuMenu(menu.entree).map((e) => (
            <li key={e.action} role="none">
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
           geste utile — déposer dans un dossier — se fait dans le panneau, qui reste visible derrière. */
        joindreAutorise={aVoir.source === 'piece' ? false : listing.joindreAutorise}
        estDeja={(id) => ajoutes.includes(id)}
        onJoindre={(f) => {
          void joindre({
            id: f.id, nom: f.nom, typeMime: f.typeMime, tailleOctets: null,
            modifieLe: null, lien: f.lien, dossier: false,
          });
        }}
        onFermer={() => setAVoir(null)} />
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
.sfd-corps{display:grid;grid-template-columns:210px 1fr;flex:1 1 auto;min-height:0}
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

.sfd-lignes{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 10px 8px}
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
