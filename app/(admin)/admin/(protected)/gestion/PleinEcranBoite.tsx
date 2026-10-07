'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
/* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — ce qu'un geste de ligne déplace dans la colonne. Module PUR. */
import {
  DELTA_BROUILLON_JETE, DELTA_ENVOI, DELTA_FIL_CORBEILLE, DELTA_FIL_RESTAURE,
} from '../../../../lib/gestion/compteursColonne';
import { BoiteMail } from './BoiteMail';
import { PanneauAffecter } from './PanneauAffecter';
import { ColonneMode, type PanneauMobile } from './ColonneMode';
import { Brouillons } from './Brouillons';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
// LOT REDACTION-GMAIL — les fenêtres flottantes qui encadrent CE MÊME éditeur (jamais un second).
import { FenetresRedaction, useFenetresRedaction } from './FenetresRedaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
// La traduction « brouillon en base → brouillon d'éditeur », PURE et éprouvée sans écran.
import { cleFenetreBrouillon, reprendreBrouillon, type BrouillonEnregistre as BrouillonLu }
  from '../../../../lib/gestion/brouillonReprise';
// 🔴🔴 LOT BROUILLONS-APERCU — la fenêtre qui MONTRE un brouillon trouvé, sans l'ouvrir dans l'éditeur.
import { ApercuBrouillon } from './ApercuBrouillon';
// `ecran` est un module PUR (aucun import) : le faire venir dans un composant client ne tire pas `pg`.
import { titreARattacher } from '../../../../lib/gestion/ecran';
import type { ActionLigne } from '../../../../lib/gestion/menuLigne';
/* 🔴🔴 LOT REINTEGRER — la boîte d'origine d'un mail de la corbeille, et la phrase du bandeau (module PUR). */
import { bandeauReintegre, boiteOrigine, type BoiteOrigine } from '../../../../lib/gestion/boiteOrigine';
import {
  gesteCorbeille, gesteCorbeilleLot, idsDeToutLaCorbeille, lireEtatCorbeille, marquerLectureLigne,
  DUREE_ANNULATION_MS, MENTION_DROIT_ATTENTE,
} from './gestesLigne';
import { EnteteCorbeille } from './EnteteCorbeille';
// LOT LECTURE-HTML-FIL-TROMBONE — les brouillons jetés, dans la même liste que les mails (bloc à part : voir le fichier).
import { BrouillonsJetes } from './BrouillonsJetes';
import { Conversation } from './Conversation';
import type { Rapport } from './gestesMail';
import type { Cible } from '../../../../lib/gestion/rattachement';
import { memeEtiquette, type Etiquette } from '../../../../lib/gestion/ecranUrl';

/**
 * LOT 5-FUSION / 5-FUSION-B — LA BOÎTE EN PLEIN ÉCRAN, façon messagerie.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS UNE SECONDE BOÎTE MAIL. La liste EST `BoiteMail` (lot 5a), avec sa recherche, ses filtres, son
 * interrupteur de courrier automatique et sa pagination par curseur ; la lecture EST `Conversation` (lot 5b), la vue
 * unique du module. Ce fichier ne fait que les DISPOSER et leur dire quelle étiquette regarder. Deux vues du même
 * courrier finiraient par diverger — et c'est toujours celle qu'on regarde le moins qui garde le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * LOT 5-FUSION-B — LES ÉTIQUETTES ONT DÉMÉNAGÉ DANS LA BARRE DE L'ADMINISTRATION (`ColonneMode`), à la place des liens
 * de modules. La liste et la conversation récupèrent toute la largeur ainsi libérée : deux panneaux côte à côte dès
 * 1000 px, là où il en fallait 1200 quand les étiquettes mangeaient 230 px du contenu.
 *
 * 🔴 UNE ÉTIQUETTE N'EST QU'UN FILTRE. Rien n'est écrit en base, aucune colonne : « Envoyés », « Sans suite » ou une
 * carte se DÉRIVENT à la lecture (voir `boiteRepo`). Changer l'état d'un échange change son étiquette sans qu'aucun
 * code ne s'en occupe.
 *
 * ⚠️ « À CLASSER » N'EST PAS UNE LISTE DE PLUS : c'est le poste de tri LUI-MÊME, passé en `enfantAClasser` par l'écran
 * qui le possède déjà — avec ses gestes, son panneau et son compteur. Le recoder ici aurait donné deux files qui se
 * contredisent au premier changement de règle.
 *
 * MOBILE D'ABORD : sous 768 px il n'y a pas trois colonnes mais TROIS ÉCRANS — les étiquettes, la liste, la
 * conversation — avec un retour explicite à chaque niveau. Cibles ≥ 44 px, aucune interaction au survol seul, jetons
 * `--color-svv-*` uniquement, et l'étiquette ouverte dite par un MOT (`aria-current`) autant que par la forme.
 */

/** Une entrée de la colonne de gauche. `reference` n'est renseignée que pour les cartes (GES-…). */
export interface EtiquetteAffichee {
  etiquette: Etiquette;
  libelle: string;
  /** `null` = on ne sait pas encore (le compte n'est pas revenu). Une étiquette sans nombre vaut mieux qu'un faux. */
  compte: number | null;
  /**
   * LOT 5-BOITE — combien de ces échanges me restent NON LUS. Affiché EN PLUS du total, jamais à sa place : « 3 non
   * lus » sans le total ne dit pas la taille de la boîte, et le total sans les non-lus ne dit pas ce qui m'attend.
   * `null` ou absent = on ne sait pas (migration 250 absente, ou accès sans compte personnel) : on n'affiche rien.
   */
  nonLus?: number | null;
  /** LOT 5-BOITE-2 — le compte est un MINIMUM (Gmail en avait plus que le plafond) : le libellé le dit. */
  nonLusPartiel?: boolean;
  reference?: string;
}

/**
 * Les étiquettes à AFFICHER. 🔴 Pas d'étiquette vide — une colonne remplie de zéros ne renseigne sur rien et fait
 * défiler pour rien. Seule exception, et elle est nécessaire : celle qu'on REGARDE reste listée même à zéro, sinon
 * elle disparaîtrait sous les pieds de celui qui vient de la choisir. PUR.
 */
export function etiquettesVisibles(
  toutes: readonly EtiquetteAffichee[], ouverte: Etiquette,
): EtiquetteAffichee[] {
  return toutes.filter((e) => e.compte === null || e.compte > 0 || memeEtiquette(e.etiquette, ouverte));
}

/** L'ensemble vide, PARTAGÉ : recréé à chaque rendu, il ferait repartir tout ce qui en dépend. */
const VIDE: ReadonlySet<number> = new Set();

export function PleinEcranBoite({
  etiquette, etiquettes, onEtiquette, filOuvert, messageOuvert = null, brouillonOuvert = null,
  onOuvrir, onFermerFil, maintenant, onGeste, onRetour,
  enfantAClasser, auto, onAuto, redaction = null, onNonLus, onTotalEtiquette, corbeilleDisponible = false, peutEcrire = false,
  piecesDisponibles = false, ecrireA = null, onEcrireAConsomme, onFicheAnnuaire, onHistorique,
  versionDonnees = 0, onListeRelue,
  onRattacher, aRattacher = null, aRattacherSansCandidat = null, onAnnuaire, etatDiscret = null,
  onRelever, releveEnCours = false, filtre = null, onFiltre, etoile = false, onEtoileFiltre,
  onClassementChange, onBrouillonsChange, onRetourHistoriqueBien,
}: {
  etiquette: Etiquette;
  etiquettes: readonly EtiquetteAffichee[];
  onEtiquette: (e: Etiquette) => void;
  filOuvert: number | null;
  /**
   * LOT MESSAGE-CLIQUÉ — QUEL MESSAGE de l'échange ouvert on venait lire. Vient de l'adresse (`?fil=…&message=…`) et
   * repart tel quel à la conversation, qui le déplie et l'amène à l'écran. `null` (le défaut) = le dernier message
   * lisible, comportement d'avant ce lot.
   */
  messageOuvert?: number | null;
  onOuvrir: (filId: number, messageId?: number | null, brouillonId?: number | null) => void;
  /** LOT BROUILLONS-GMAIL — le brouillon de réponse à rouvrir DANS la conversation. `null` = aucun. */
  brouillonOuvert?: number | null;
  onFermerFil: () => void;
  maintenant: Date;
  onGeste: Rapport;
  onRetour: () => void;
  /** Le poste de tri, rendu par l'écran qui le possède. Affiché sous l'étiquette « À classer », et seulement là. */
  enfantAClasser: ReactNode;
  auto: boolean;
  onAuto: (v: boolean) => void;
  /** LOT 5e — droit, schéma, connexion Google, signature, délai. `null` = aucun écran d'écriture. */
  redaction?: ContexteRedactionEcran | null;
  /** LOT 5-BOITE — remonte le nombre d'échanges non lus par la personne connectée, pour l'étiquette « Réception ». */
  onNonLus?: (n: number | null, partiel?: boolean) => void;
  /** 🔴🔴 LOT DOSSIER-A-CLASSER — le total de l'étiquette ouverte, pour le compteur de la colonne. */
  onTotalEtiquette?: (sorte: string, total: number | null) => void;
  /** LOT 5-BOITE-3 — la migration 251 est-elle là, et peut-on écrire au nom de gestion@ ? Pilote le menu des lignes. */
  corbeilleDisponible?: boolean;
  peutEcrire?: boolean;
  /** LOT 5-PJ-ENVOI — la migration 252 est-elle là ? Pilote la seule entrée « Transférer en tant que pièce jointe ». */
  piecesDisponibles?: boolean;
  /**
   * LOT ANNUAIRE-1 — une adresse à qui écrire, venue de l'annuaire. Ouvre « Nouveau message » déjà adressé.
   *
   * ⚠️ C'EST EXACTEMENT LE MÊME BOUTON « Nouveau message », avec son destinataire pré-rempli — pas un second chemin
   * d'envoi. Un écran d'écriture qui existerait en deux exemplaires divergerait au premier réglage (signature,
   * délai d'annulation, pièces jointes).
   */
  ecrireA?: string | null;
  /** Prévient l'écran parent que l'adresse a été consommée : sans quoi revenir ici rouvrirait le même brouillon. */
  onEcrireAConsomme?: () => void;
  /**
   * ══ LOT ERGO-BOITE — CE QUI REJOINT LA COLONNE ════════════════════════════════════════════════════════════════
   * Quatre choses, toutes déplacées depuis le haut de la page — aucune n'est nouvelle, aucune n'est retirée :
   *   · « À rattacher » : l'ancien bouton « À trier », avec son compteur (nombre de mails à rattacher) ;
   *   · « Annuaire » : le même bouton, à un endroit cohérent avec la nouvelle disposition ;
   *   · l'état discret : heure de la dernière relève, dernier mail, cadence, copie des pièces. Ces lignes étaient
   *     en haut de page, en grand ; elles n'ont pas à l'être. Le BANDEAU D'ALERTE, lui, reste en haut (voir
   *     `GestionVue`) : c'est justement parce que l'ordinaire descend ici que l'exceptionnel se voit ;
   *   · l'icône « Relever et actualiser », rendue à côté du titre de la liste.
   */
  /** Ouvre la file de rattachement. Absent ⇒ l'entrée n'est pas rendue. */
  onRattacher?: () => void;
  /**
   * Combien de mails ATTENDENT UNE DÉCISION — ils ont au moins une proposition à confirmer ou à rejeter. `null` =
   * pas encore connu : on n'affiche alors aucun nombre. 🔴 Ce n'est PAS le nombre de mails non rattachés (voir
   * `aRattacherSansCandidat`) : cf. le commentaire de `GestionVue`.
   */
  aRattacher?: number | null;
  /**
   * Combien de mails n'ont AUCUN candidat à proposer. Ils ne sont pas dans le compteur — rien ne s'y confirme d'un
   * clic — mais ils existent, l'info-bulle les nomme, et l'écran de la file les liste. `null`/`0` = on n'en parle pas.
   */
  aRattacherSansCandidat?: number | null;
  onAnnuaire?: () => void;
  /** Les lignes d'état ORDINAIRE, en petit. Une alerte ne passe jamais par ici. */
  etatDiscret?: readonly string[] | null;
  /**
   * LOT ERGO-BOITE-3 — le sélecteur de « Réception » : `null` = tous les échanges reçus, `'non-lus'` = seulement
   * ceux qui portent un message reçu non lu. Il vit dans l'ADRESSE (cf. `ecranUrl`), pour qu'un rechargement et le
   * rafraîchissement automatique de 30 s le conservent.
   */
  filtre?: 'non-lus' | null;
  /** Change le sélecteur. ABSENT ⇒ aucun sélecteur n'est rendu : la colonne est alors celle d'avant ce lot. */
  onFiltre?: (f: 'non-lus' | null) => void;
  /** LOT FILTRE-ETOILE — ne montrer que les échanges étoilés, et la bascule qui l'allume. */
  etoile?: boolean;
  onEtoileFiltre?: (actif: boolean) => void;
  /** Relève immédiate PUIS rafraîchissement — un seul geste, une seule icône. */
  onRelever?: () => void;
  releveEnCours?: boolean;
  /** LOT ANNUAIRE-1 — ouvre la fiche d'annuaire d'un expéditeur reconnu, depuis l'encart de la conversation. */
  onFicheAnnuaire?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  /** LOT RATTACHEMENT-2 — ouvre l'historique complet d'une cible, depuis le bandeau « Rattaché à » d'un mail. */
  onHistorique?: (cible: Cible) => void;
  /** LOT ÉCRAN-VIVANT — incrémenté par l'écran quand du courrier est arrivé. La liste se relit si elle le peut. */
  versionDonnees?: number;
  onListeRelue?: () => void;
  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — « LE CLASSEMENT D'UN ÉCHANGE A CHANGÉ » ══════════════════════════
   *
   * Cet écran s'occupe seul de SA liste (voir `versionStatuts`). Ce rappel sert à l'autre moitié de la demande
   * d'Arno : « le compteur “À classer” baisse ». Ce nombre-là n'appartient pas à la liste — il vient de
   * `/api/admin/gestion/boite/comptes`, lu par l'écran parent, et il reste donc à lui de le redemander.
   *
   * ABSENT ⇒ seule la liste se met à jour. C'est déjà le défaut réparé ; le compteur, lui, se corrigera au
   * prochain chargement de l'écran.
   */
  onClassementChange?: () => void;
  /** 🔴 LOT BROUILLON-ACCES-SUPPRESSION — les brouillons vivants ont changé : le compteur de la colonne le suit. */
  onBrouillonsChange?: () => void;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — le retour vers « l'historique du bien », passé tel quel à la
   * conversation. `undefined` quand on ne vient pas de là : le bouton n'est alors pas rendu.
   */
  onRetourHistoriqueBien?: () => void;
}) {
  // Sur téléphone, on arrive sur les ÉTIQUETTES : c'est le sommaire, et on ne tombe pas au milieu d'une liste sans
  //   savoir laquelle. Au montage, donc à chaque entrée en plein écran. Sur grand écran, l'attribut ne change rien.
  /**
   * LOT ERGO-BOITE-4 — le bloc « Détails relève » est-il déplié ? REPLIÉ par défaut, et l'état n'est PAS mis dans
   * l'adresse : c'est un pli de lecture, pas un endroit où l'on est. Le mettre dans l'URL polluerait l'historique
   * du navigateur d'un « Précédent » qui ne ferait que replier un texte.
   */
  /**
   * 🔴🔴 LOT BROUILLONS-APERCU — LE BROUILLON QU'ON REGARDE, ou `null`. C'est un ÉTAT DE PLUS, posé PAR-DESSUS :
   * la liste des résultats n'est ni démontée ni rechargée, donc la refermer rend exactement les mêmes résultats,
   * au défilement près (règle des flèches de retour).
   */
  const [apercuBrouillon, setApercuBrouillon] = useState<number | null>(null);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [panneauMobile, setPanneauMobile] = useState<PanneauMobile>('colonne');
  /**
   * LOT 5-GMAIL — LE PARTAGE « CLASSER ». `null` = fermé. Sinon, la voie par laquelle on y entre : « Classer dans
   * une carte » ouvre sur la recherche d'événements, « Créer un événement » sur le formulaire. Les deux voies
   * restent offertes une fois ouvert — c'est le point de départ qui change, pas ce qui est possible.
   */
  const [classement, setClassement] = useState<'nouveau' | 'existant' | null>(null);
  /** Change après un classement réussi → la conversation est remontée et relue, donc sa barre montre la GES-…. */
  const [versionFil, setVersionFil] = useState(0);
  /**
   * LOT 5-BOITE — le DERNIER marquage de lecture, transmis tel quel à la liste.
   *
   * 🔴 IL NE TOUCHE SURTOUT PAS À `versionFil`, qui est la CLÉ de la conversation : s'en servir la remonterait, son
   * effet d'ouverture repartirait, re-marquerait, re-changerait la clé — une boucle sans fin, dont le seul symptôme
   * visible serait un écran qui rame (mesuré en test avant correction).
   *
   * 🔴 ET IL NE FAIT PAS RELIRE LA LISTE : le lot 5-GMAIL garantit qu'ouvrir un échange ne perd ni les pages déjà
   * chargées, ni la recherche en cours. La liste met son gras à jour SUR PLACE, à partir de ce seul objet.
   */
  const [marquage, setMarquage] = useState<{ filId: number; nonLu: boolean; cle: number }>({ filId: 0, nonLu: false, cle: 0 });
  /** LOT 5-BOITE-3 — la voie demandée depuis le menu d'une ligne (Répondre / Répondre à tous / Transférer). */
  const [voieDemandee, setVoieDemandee] = useState<VoieRedaction | null>(null);
  /**
   * LOT 5-BOITE-3 — LE BANDEAU « ANNULER ». Un geste réversible doit se défaire LÀ OÙ IL A ÉTÉ FAIT : renvoyer
   * chercher l'échange dans la corbeille pour le restaurer serait lui faire payer une erreur de clic.
   */
  const [corbeilleFaite, setCorbeilleFaite] = useState<{ filId: number } | null>(null);
  /**
   * ══ 🔴🔴 LOT REINTEGRER — « ANNULER » EXISTE DANS LES DEUX SENS ══════════════════════════════════════════════
   *
   * Arno : « Après “Réintégrer” : le mail quitte la corbeille, réapparaît dans sa boîte d'origine, et les
   * compteurs du menu de gauche se mettent à jour en direct. “Annuler” est possible quelques secondes, comme pour
   * la mise à la corbeille. »
   *
   * 🔴 CE QUI MANQUAIT, ET C'ÉTAIT LA SEULE CHOSE : `setCorbeilleFaite(versLaCorbeille ? { filId } : null)` —
   * le bandeau n'existait QUE dans le sens de la corbeille. Une réintégration se disait par un compte rendu
   * ordinaire, sans retour possible. Or c'est le sens où l'on se trompe le plus : on réintègre en parcourant une
   * liste, et la ligne disparaît sous les yeux.
   *
   * ⚠️ DEUX ÉTATS ET NON UN SEUL, avec un sens : un même état porteur d'un drapeau aurait laissé les deux
   * bandeaux se confondre, et « Annuler » appeler la mauvaise direction. Ils ne peuvent pas être ouverts
   * ensemble — le second geste efface le premier, comme aujourd'hui.
   *
   * ⚠️ LA BOÎTE EST GARDÉE AVEC LE FIL : la ligne a quitté la liste, on ne peut plus la relire pour savoir où le
   * mail est parti. Sans elle, le bandeau dirait « réintégré » sans dire OÙ — et il faudrait le chercher.
   */
  const [reintegreFait, setReintegreFait] =
    useState<{ filId: number; boite: BoiteOrigine | null } | null>(null);
  /** Incrémenté après un geste de corbeille : la liste doit être relue, l'échange n'y est plus (ou y revient). */
  const [versionListe, setVersionListe] = useState(0);
  /**
   * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 3 — « MONTRE-MOI CE DOSSIER » ═════════════════════════════════
   *
   * Chaque clic sur une entrée de la colonne l'incrémente, et la liste y lit « on me demande le DOSSIER, pas la
   * recherche en cours ». Voir `retourAuDossier` dans `BoiteMail` — c'est là qu'est écrit le défaut qu'il répare.
   *
   * 🔴 UN NOMBRE PLUTÔT QUE L'ÉTIQUETTE : depuis une recherche faite DANS « Réception », cliquer « Réception »
   * ne change pas l'étiquette. C'est précisément ce cas-là qui ne marchait pas.
   */
  const [retourAuDossier, setRetourAuDossier] = useState(0);
  /** Le geste complet d'une entrée de colonne : on va au dossier, et l'on quitte la recherche. */
  const allerAuDossier = (e: Etiquette): void => {
    onEtiquette(e);
    setRetourAuDossier((n) => n + 1);
    setPanneauMobile('contenu');
  };
  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LE BATTEMENT DU STATUT ═══════════════════════════════════════════
   *
   * Incrémenté quand un classement est validé DANS la conversation (Rattacher, Interne, Hors gestion, étape 2
   * « nouveau contact »). La liste, masquée derrière, relit sa page COURANTE sur ce signal.
   *
   * 🔴 POURQUOI PAS `versionListe`, QUI EXISTE DÉJÀ. `versionListe` est la CLÉ de `<BoiteMail>` : la toucher
   * DÉMONTE la liste. On perdrait alors la page où l'on était, la recherche tapée et la position de défilement —
   * c'est-à-dire exactement ce que le lot LISTE-PAGINATION garantit au retour depuis un fil. Le battement, lui,
   * ne fait relire qu'une page, à sa place.
   *
   * ⚠️ `0` = rien ne s'est passé : la liste se comporte exactement comme avant ce lot.
   */
  const [versionStatuts, setVersionStatuts] = useState(0);
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — LA SÉLECTION DE LA CORBEILLE ═════════════════════════════════════════════
   * Elle vit ICI, au-dessus de la liste, et pas dans la liste : le bandeau, les deux boutons et la confirmation en
   * ont besoin, et la liste se relit sans les perdre. `selCorbeille` porte des ÉCHANGES (ce que les lignes
   * représentent) ; `lignesCorbeille` porte ce que la liste montre EN CE MOMENT, avec le nombre de mails de
   * chacune — c'est lui qui permet d'annoncer un nombre de MAILS exact avant une suppression définitive.
   */
  /**
   * ⚠️ LA SÉLECTION PORTE SON ÉTIQUETTE AVEC ELLE, et ce n'est pas une coquetterie : quitter la Corbeille doit la
   * vider. La remettre à zéro dans un effet serait un `setState` synchrone dans un effet — que le compilateur
   * React refuse, à raison (rendus en cascade). En la DÉRIVANT, il n'y a plus rien à remettre à zéro : une
   * sélection prise sous une autre étiquette ne se lit tout simplement pas.
   */
  const [selBrute, setSelBrute] = useState<{ sorte: string; ids: ReadonlySet<number> }>(
    { sorte: '', ids: new Set() });
  /* 🔴 LOT REINTEGRER — chaque ligne porte aussi sa BOÎTE D'ORIGINE : le bandeau doit la nommer après que la ligne
     a quitté la liste, moment où il est trop tard pour la relire. */
  const [lignesCorbeille, setLignesCorbeille] =
    useState<{ filId: number; nbCorbeille: number; boite?: BoiteOrigine }[]>([]);
  const [toutCorbeille, setToutCorbeille] = useState<{
    total: number; mails: number; suppressionPossible: boolean; motImpossible: string;
  } | null>(null);
  const [occupeCorbeille, setOccupeCorbeille] = useState(false);
  /**
   * LE BANDEAU « ANNULER » DE LA RÉINTÉGRATION, et son échéance. 10 s : demande d'Arno, et c'est aussi le délai
   * que le Drive emploie déjà pour la même promesse — un seul rythme dans toute l'application.
   */
  const [reintegres, setReintegres] = useState<{ filIds: number[]; cle: number } | null>(null);
  /**
   * ══ 🔴 LOT REDACTION-GMAIL — « NOUVEAU MESSAGE » OUVRE UNE FENÊTRE FLOTTANTE ═══════════════════════════════════
   * Il prenait la place de la LISTE : on écrivait, et l'on ne voyait plus ce à quoi on répondait. Désormais la
   * fenêtre s'ancre en bas à droite, la liste reste vivante derrière, et deux messages peuvent s'écrire côte à
   * côte. La règle (deux au plus, réduite, plein écran) vit dans un module PUR, éprouvé sans écran.
   *
   * ⚠️ `nouveau` N'EXISTE PLUS comme état à part : c'est une fenêtre parmi les autres. Rien n'est retiré — la
   * rédaction, ses pièces jointes, son compte à rebours d'annulation et son enregistrement automatique sont
   * exactement ceux d'avant ce lot ; seul leur cadre a changé.
   */
  const fen = useFenetresRedaction();
  /** Le refus d'une troisième fenêtre, dit en toutes lettres. `null` = rien à signaler. */
  const [refusFenetre, setRefusFenetre] = useState<string | null>(null);
  /** Ouvre (ou rétablit) une fenêtre de rédaction, et DIT pourquoi quand elle est refusée. */
  /**
   * ══ 🔴🔴 ROUVRIR UN BROUILLON DANS L'ÉDITEUR ORDINAIRE — UN SEUL ENDROIT POUR DEUX APPELANTS ════════════════
   *
   * Le dossier « Brouillons » l'appelle depuis sa liste ; l'aperçu d'un brouillon TROUVÉ l'appelle depuis son
   * bouton « Modifier ». Arno demande « le même éditeur que depuis le dossier Brouillons » : le seul moyen d'en
   * être sûr est qu'il n'y ait qu'un endroit où le geste est écrit.
   *
   * ⚠️ DEUX CHEMINS, ET C'EST VOULU : un brouillon RATTACHÉ À UN ÉCHANGE va dans sa conversation, sous le message
   * auquel il répond ; un message NEUF (sans échange) garde sa fenêtre flottante, qui est sa place naturelle.
   */
  const reprendreCeBrouillon = (b: BrouillonLu): void => {
    if (b.filId !== null) { onOuvrir(b.filId, b.repondAMessageId, b.id); return; }
    ouvrirRedaction(cleFenetreBrouillon(b.id), reprendreBrouillon(b));
  };

  const ouvrirRedaction = (cle: string, b: BrouillonEcran): void => {
    const motif = fen.ouvrirFenetre(cle, b);
    setRefusFenetre(motif);
  };

  /**
   * LOT ANNUAIRE-1 — ÉCRIRE À QUELQU'UN TROUVÉ DANS L'ANNUAIRE.
   *
   * 🔴 C'EST LE MÊME « Nouveau message », pré-adressé : mêmes conditions (base à jour, droit d'envoi), même
   * signature, même délai d'annulation, mêmes pièces jointes. Un second écran d'écriture aurait divergé du premier
   * dès le réglage suivant.
   *
   * ⚠️ L'ADRESSE EST CONSOMMÉE AUSSITÔT (`onEcrireAConsomme`) : sans cela, revenir dans la boîte par « Précédent »
   * rouvrirait un brouillon vide adressé à la même personne, sans qu'on comprenne pourquoi.
   */
  useEffect(() => {
    if (ecrireA === null || ecrireA === '') return;
    if (!(redaction?.schemaPret && redaction.peutEnvoyer)) { onEcrireAConsomme?.(); return; }
    ouvrirRedaction(`nouveau:${ecrireA}`, {
      ...preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature }),
      a: [ecrireA],
      id: null,
    });
    onEcrireAConsomme?.();
  }, [ecrireA, redaction, onFermerFil, onEcrireAConsomme]);

  /**
   * LA POSITION DE DÉFILEMENT DE LA LISTE, retenue à l'ouverture d'un échange et rendue au retour.
   *
   * 🔴 ET LA LISTE RESTE MONTÉE pendant qu'on lit (elle est seulement masquée) : la démonter lui ferait perdre ses
   * pages chargées par « Voir les échanges plus anciens » et sa recherche en cours, et le retour repartirait de la
   * première page. C'est le défaut classique d'une ouverture « en pleine page », et il ne se voit qu'après avoir
   * fait défiler trois pages.
   */
  const defilement = useRef(0);

  /**
   * LOT 5-BOITE-3 — CE QUE FAIT UNE ENTRÉE DU MENU D'UNE LIGNE.
   *
   * 🔴 LES TROIS VOIES DE RÉDACTION OUVRENT L'ÉCHANGE ET SON ÉDITEUR, sur le dernier message. Ouvrir seulement
   * l'échange obligerait à cliquer une seconde fois — ce n'est pas ce que le menu promet.
   *
   * 🔴 LA CORBEILLE NE DEMANDE AUCUNE CONFIRMATION, et c'est délibéré : le geste est réversible d'un clic, le
   * bandeau « Annuler » reste affiché, et rien n'est supprimé nulle part. Une question posée avant un geste qu'on
   * défait en une seconde apprend surtout à cliquer « oui » sans lire.
   *
   * 🔴 LE LU/NON LU PASSE PAR LA ROUTE EXISTANTE (lot 5-BOITE-2) : c'est celui de Gmail, commun à l'équipe. On ne
   * crée pas un second chemin pour le même geste.
   */
  const agirSurLigne = async (filId: number, action: ActionLigne): Promise<void> => {
    if (action === 'repondre' || action === 'repondre_tous' || action === 'transferer' || action === 'transferer_piece') {
      setVoieDemandee(action);
      onOuvrir(filId);
      return;
    }
    /**
     * LOT LISTE-GMAIL — « CLASSER » depuis la barre d'une ligne. Il ouvre le MÊME panneau d'affectation que le mail
     * ouvert : on ne réécrit pas le geste, on ouvre l'échange et on demande l'affectation. C'est aussi ce qui fait
     * qu'on voit ce qu'on classe — classer un échange sans l'avoir sous les yeux serait une erreur en attente.
     */
    if (action === 'classer') {
      onOuvrir(filId);
      // `existant` = le panneau s'ouvre sur la recherche d'une carte, exactement comme le lien « Classer » du mail
      //   ouvert. C'est la même voie, le même panneau, la même route.
      setClassement('existant');
      return;
    }
    if (action === 'lu' || action === 'non_lu') {
      const r = await marquerLectureLigne(filId, action === 'lu');
      /**
       * 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — AUCUN DELTA ICI, ET C'EST UN CHOIX. « N non lus » est un nombre
       * d'ÉCHANGES, pas de messages : marquer un mail lu ne fait baisser le compteur que si c'était le dernier
       * non lu de son échange, ce que l'écran ne sait pas. La relecture, elle, le sait — et elle part de toute
       * façon, parce que `onGeste` la déclenche à chaque geste.
       */
      onGeste(r.message);
      if (r.ok) setMarquage((m) => ({ filId, nonLu: action === 'non_lu', cle: m.cle + 1 }));
      return;
    }
    // ── LA CORBEILLE ──
    const versLaCorbeille = action === 'corbeille';
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LA BOÎTE D'ORIGINE SE LIT AVANT LE GESTE ═════════════
     *
     * Elle se lisait APRÈS la réponse, et le commentaire d'alors disait pourquoi c'était déjà juste de peu :
     * « la boîte est lue AVANT la relecture de la liste ; à l'instant d'après, la ligne n'y est plus ». Cet
     * instant-là s'est raccourci : la ligne quitte désormais `lignesCorbeille` DANS L'IMAGE DU CLIC, puisque
     * cette liste dérive de ce que la colonne AFFICHE (`lignesVues`, cf. `BoiteMail`). Lue après l'`await`, elle
     * aurait donc rendu `null`, et le bandeau aurait dit « Mail réintégré » sans nommer la boîte.
     *
     * 🔴 C'EST LE GENRE DE DÉFAUT QUE RENDRE UN ÉCRAN INSTANTANÉ FABRIQUE : tout code qui lisait l'affichage
     * APRÈS son geste lisait en réalité l'état d'AVANT, par la seule grâce de la lenteur du réseau.
     */
    const boiteDuFil = lignesCorbeille.find((l) => l.filId === filId)?.boite ?? null;
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LES COMPTEURS PARTENT AVANT L'ÉCRITURE, EUX AUSSI ═══════
     *
     * 🔴 MESURÉ À L'ÉCRAN (06/10/2026, mail « _TEST CORBEILLE a ignorer (2) ») : la LIGNE quittait la liste en
     * **5,9 ms**, et le compteur « Corbeille » ne montait qu'à **843 ms** — c'est-à-dire après la réponse du
     * serveur (832 ms), parce que ce delta-ci était envoyé en FIN de fonction. Pendant huit dixièmes de seconde,
     * le mail n'était donc nulle part : parti de sa boîte, pas encore compté dans la Corbeille.
     *
     * 🔴 LA RÈGLE D'ARNO LES MET DANS LA MÊME PHRASE, et donc dans la même image : « le mail QUITTE la liste de sa
     * boîte, ENTRE dans la Corbeille (si elle est affichée), ET les compteurs se mettent à jour ». Un compteur en
     * retard sur sa liste raconte exactement le défaut qu'on répare, à un autre endroit de l'écran.
     *
     * ⚠️ ET IL SE DÉFAIT AU REFUS, comme tout ce qui est anticipé dans ce lot : le delta inverse part avec le
     * message d'erreur. Sans lui, un refus laisserait « Corbeille » compter un mail qui n'y est jamais allé —
     * jusqu'à la relecture suivante, qui peut ne jamais venir sur cet écran.
     */
    onGeste('', {
      compteurs: versLaCorbeille ? DELTA_FIL_CORBEILLE : DELTA_FIL_RESTAURE, avantEcriture: true,
    });
    const r = await gesteCorbeille(filId, versLaCorbeille);
    if (!r.ok) {
      /* ⚠️ PAS D'`avantEcriture` ICI : rien n'a été écrit, le serveur est donc déjà la vérité — on lui redemande. */
      onGeste(r.message, { compteurs: versLaCorbeille ? DELTA_FIL_RESTAURE : DELTA_FIL_CORBEILLE });
      return;
    }
    /* 🔴 LA CONFIRMATION, MAINTENANT QUE C'EST ÉCRIT : sans delta, donc une simple relecture des trois sources. */
    onGeste('');
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — ON RELIT SUR PLACE, ON NE DÉMONTE PLUS ═══════════════════
     *
     * CE QUI ÉTAIT ÉCRIT ICI : `setVersionListe((v) => v + 1)`, avec ce commentaire — « l'échange quitte (ou
     * rejoint) la liste affichée : elle est relue. C'est le SEUL cas où on la relit ». Or `versionListe` est la
     * CLÉ de `<BoiteMail>` : la toucher DÉMONTE la liste et la remonte neuve.
     *
     * 🔴 MESURÉ À L'ÉCRAN (06/10/2026, étiquette Spam) : la ligne quittait bien la liste en **26 ms** grâce à
     * l'annonce — puis REVENAIT, parce que le démontage emportait avec lui le masque qui la retirait. L'instantané
     * était donc annulé par le geste suivant du même code. C'est le défaut que seule une mesure pouvait montrer :
     * les épreuves de texte, elles, voyaient bien les deux moitiés, chacune juste de son côté.
     *
     * 🔴 ET LE DÉPÔT AVAIT DÉJÀ TRANCHÉ CETTE QUESTION, pour une autre raison, trois lots plus tôt : l'encadré de
     * `versionStatuts` dit mot pour mot pourquoi on ne touche pas à la clé — « on perdrait la page où l'on était,
     * la recherche tapée et la position de défilement ». Mettre un mail à la corbeille depuis la page 12 d'une
     * recherche renvoyait donc à la page 1 de la liste nue. `relireSurPlace` relit la page COURANTE, à sa place.
     *
     * ⚠️ CETTE RELECTURE N'EST PLUS CE QUI FAIT PARTIR LA LIGNE — la porte d'écriture l'a annoncée avant d'écrire
     * (`signalCorbeille`), et la colonne l'a retirée dans l'image du clic. Elle reste pour ce qu'elle seule
     * apporte : les totaux exacts, et la ligne SUIVANTE qui vient compléter la page.
     */
    setVersionStatuts((v) => v + 1);
    if (filOuvert === filId) onFermerFil();
    // Le bandeau porte l'annulation ; une restauration, elle, se dit dans le compte rendu ordinaire.
    /**
     * ══ 🔴🔴 LOT REINTEGRER — LE BANDEAU « ANNULER » DANS LES DEUX SENS ═════════════════════════════════════════
     *
     * ⚠️ UN SEUL DES DEUX À LA FOIS, et c'est ce que l'autre `null` garantit : deux bandeaux côte à côte
     * laisseraient cliquer « Annuler » sur la mauvaise direction.
     *
     * ⚠️ ET IL ARRIVE APRÈS LA CONFIRMATION, LUI, alors que la ligne part avant : « Annuler » promet de défaire
     * un enregistrement, et l'offrir avant qu'il existe laisserait cliquer dans le vide. Ce qui doit être
     * instantané, c'est que le mail ne soit plus à deux endroits ; le bandeau, lui, n'est à aucun endroit faux.
     */
    setCorbeilleFaite(versLaCorbeille ? { filId } : null);
    setReintegreFait(versLaCorbeille ? null : { filId, boite: boiteDuFil });
    /**
     * 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — LES COMPTEURS SUIVENT DANS LES DEUX SENS.
     *
     * ⚠️ LE COMPTE RENDU, LUI, NE S'AFFICHE QUE DANS UN SENS (une mise à la corbeille a son bandeau « Annuler »,
     * et un second message par-dessus serait du bruit) — mais le GESTE doit rafraîchir les deux fois. C'est
     * précisément le genre d'oubli qui a produit le constat d'Arno : on branche sur le geste, jamais sur
     * l'affichage du message.
     *
     * 🔴🔴 ET LE DELTA EST PARTI PLUS HAUT, AVANT L'ÉCRITURE (lot INSTANTANE-ETOILE-CORBEILLE, point 2) : il
     * s'envoyait ICI, donc 843 ms après le clic. Voir l'encadré au-dessus de `gesteCorbeille`.
     */
    /* ⚠️ PLUS DE COMPTE RENDU DANS LE SENS « RÉINTÉGRER » : il est devenu le BANDEAU, qui dit la même chose ET
       porte « Annuler ». Deux messages pour un geste seraient du bruit — c'est déjà la règle du sens inverse. */
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LOT BOITE-INTERNE-CORBEILLE — LES GESTES DE LA CORBEILLE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const estCorbeille = etiquette.sorte === 'corbeille';
  /** La sélection EFFECTIVE : celle de l'étiquette ouverte, et rien d'autre. Voir `selBrute`. */
  const selCorbeille = selBrute.sorte === etiquette.sorte ? selBrute.ids : VIDE;
  const setSelCorbeille = (ids: ReadonlySet<number>): void => setSelBrute({ sorte: etiquette.sorte, ids });
  /**
   * 🔴 LE TOTAL ET LE DROIT SONT RELUS À CHAQUE OUVERTURE DE LA CORBEILLE, ET APRÈS CHAQUE GESTE.
   *
   * ⚠️ IL SUIT `versionStatuts` DEPUIS LE LOT INSTANTANE-ETOILE-CORBEILLE, et plus `versionListe` : les gestes
   * de la Corbeille relisent désormais la liste SUR PLACE au lieu de la démonter, donc c'est ce battement-là
   * qu'ils incrémentent. Laissé sur l'ancien, le total serait resté figé après chaque réintégration.
   *
   * Le total, parce qu'il change dès qu'on réintègre. Le droit, parce qu'il est le seul moyen de griser
   * « Supprimer définitivement » AVANT le clic — et parce qu'il changera tout seul le jour où Arno accorde la
   * portée et refait l'autorisation : la page s'en aperçoit à la relecture suivante, sans redémarrage.
   *
   * ⚠️ On QUITTE la corbeille ⇒ la sélection ne se lit plus (elle est dérivée de l'étiquette, cf. `selBrute`) :
   * revenir dessus plus tard avec des cases cochées sur des échanges qu'on ne voit plus serait un piège, et cette
   * sélection-là porte un geste irréversible.
   */
  useEffect(() => {
    if (!estCorbeille) return; // rien à lire, et RIEN À REMETTRE À ZÉRO : la sélection est dérivée (cf. `selBrute`)
    let vivant = true;
    void (async () => {
      const d = await lireEtatCorbeille();
      if (vivant && d !== null) setToutCorbeille(d);
    })();
    return () => { vivant = false; };
  }, [estCorbeille, versionStatuts]);

  /**
   * LE BANDEAU « ANNULER » S'EFFACE AU BOUT DE 10 s. Passé ce délai, la promesse ne tient plus : la liste a été
   * relue, l'écran a bougé, et un bouton qui traîne ferait remettre à la corbeille des mails qu'on croyait rangés.
   */
  useEffect(() => {
    if (reintegres === null) return;
    const t = setTimeout(() => setReintegres(null), DUREE_ANNULATION_MS);
    return () => clearTimeout(t);
  }, [reintegres]);
  /**
   * 🔴🔴 LOT REINTEGRER — LE MÊME DÉLAI POUR LA RÉINTÉGRATION D'UN SEUL MAIL. Arno : « “Annuler” est possible
   * quelques secondes, comme pour la mise à la corbeille. » `DUREE_ANNULATION_MS` est la seule durée d'annulation
   * du module : deux valeurs voisines auraient fait disparaître un bandeau avant l'autre, sans raison lisible.
   */
  useEffect(() => {
    if (reintegreFait === null) return;
    const t = setTimeout(() => setReintegreFait(null), DUREE_ANNULATION_MS);
    return () => clearTimeout(t);
  }, [reintegreFait]);
  const nbMailsSelection = lignesCorbeille
    .filter((l) => selCorbeille.has(l.filId))
    .reduce((n, l) => n + Math.max(1, l.nbCorbeille), 0);
  const toutePageCochee = lignesCorbeille.length > 0
    && lignesCorbeille.every((l) => selCorbeille.has(l.filId));

  /**
   * 🔴 LA SÉLECTION EST ÉLAGUÉE À CHAQUE RELECTURE DE LA LISTE. Un échange réintégré quitte la corbeille ; sa case
   * resterait cochée dans un coin invisible, et le geste suivant agirait sur un mail qu'on ne voit plus. On ne
   * garde donc que ce que la liste montre — sauf quand « tout sélectionner la Corbeille » vient d'aller chercher
   * au-delà de la page, ce que `surLesLignes` dit explicitement.
   */
  const surLesLignes = (lignes: { filId: number; nbCorbeille: number; boite: BoiteOrigine }[]): void => {
    setLignesCorbeille(lignes);
  };

  const basculerCorbeille = (filId: number, coche: boolean): void => {
    const n = new Set(selCorbeille);
    if (coche) n.add(filId); else n.delete(filId);
    setSelCorbeille(n);
  };

  const cocherLaPage = (coche: boolean): void => {
    setSelCorbeille(coche ? new Set(lignesCorbeille.map((l) => l.filId)) : new Set());
  };

  /** « Sélectionner les N échanges de la Corbeille » : on va chercher AU-DELÀ de ce que la page montre. */
  const cocherToutLaCorbeille = async (): Promise<void> => {
    const tout = await idsDeToutLaCorbeille();
    if (tout === null) { onGeste('La liste de la corbeille n’a pas pu être lue.'); return; }
    setSelCorbeille(new Set(tout.ids));
    // ⚠️ Le compte de MAILS vient d'ici quand la sélection dépasse la page : les lignes non affichées n'ont pas
    //    de `nbCorbeille` sous la main, et la confirmation doit dire un nombre exact.
    setLignesCorbeille(tout.ids.map((filId) => ({
      filId, nbCorbeille: Math.max(1, Math.round(tout.mails / Math.max(1, tout.total))),
    })));
  };

  /**
   * RÉINTÉGRER. Aucune confirmation (le geste se défait), un bandeau « Annuler » de 10 s, et la liste relue :
   * les échanges réintégrés ne sont plus à la corbeille, ils n'ont donc plus rien à y faire.
   */
  const reintegrer = async (): Promise<void> => {
    const fils = [...selCorbeille];
    if (fils.length === 0 || occupeCorbeille) return;
    setOccupeCorbeille(true);
    const r = await gesteCorbeilleLot(fils, 'reintegrer');
    setOccupeCorbeille(false);
    onGeste(r.message);
    if (!r.ok) return;
    setSelCorbeille(new Set());
    /* 🔴 RELECTURE SUR PLACE, PAS DE DÉMONTAGE : voir l'encadré de `agirSurLigne`. Démonter la liste emporterait
       le masque qui vient d'en retirer les lignes — mesuré, la ligne revenait 26 ms après être partie. */
    setVersionStatuts((v) => v + 1);
    setReintegres({ filIds: fils, cle: Date.now() });
  };

  /**
   * Le bandeau « Annuler » : on les REMET à la corbeille, d'où ils viennent. C'est le même verbe pris par l'autre
   * bout — pas un geste inverse écrit à part, qui aurait divergé au premier changement.
   *
   * ⚠️ LE GESTE PORTE SUR TOUS LES MAILS DE CES ÉCHANGES, et non sur les seuls mails réintégrés : on vient de les
   * sortir de la corbeille, il n'y a donc plus rien « à la corbeille » à y remettre, et borner la sélection ne
   * rendrait rien. C'est exactement ce que fait `action: 'corbeille'` côté serveur.
   */
  const annulerReintegration = async (): Promise<void> => {
    const fait = reintegres;
    if (fait === null) return;
    setReintegres(null);
    const r = await gesteCorbeilleLot(fait.filIds, 'corbeille');
    onGeste(r.ok ? 'Réintégration annulée : les mails sont retournés à la corbeille.' : r.message);
    if (r.ok) setVersionStatuts((v) => v + 1);
  };

  /**
   * 🔴 SUPPRIMER DÉFINITIVEMENT. La confirmation a DÉJÀ eu lieu (`EnteteCorbeille`) : ici on agit. Aucun bandeau
   * « Annuler » ne suit — il n'y a rien à annuler, et en proposer un serait mentir sur ce qui vient de se passer.
   */
  const supprimerDefinitivement = async (): Promise<void> => {
    const fils = [...selCorbeille];
    if (fils.length === 0 || occupeCorbeille) return;
    setOccupeCorbeille(true);
    const r = await gesteCorbeilleLot(fils, 'supprimer');
    setOccupeCorbeille(false);
    onGeste(r.message);
    if (!r.ok) return;
    setSelCorbeille(new Set());
    setVersionStatuts((v) => v + 1);
  };

  /**
   * ══ 🔴🔴 LOT REINTEGRER — DÉFAIRE LA RÉINTÉGRATION D'UN SEUL MAIL, depuis son bandeau ═══════════════════════════
   *
   * ⚠️ DISTINCTE DE `annulerReintegration` JUSTE AU-DESSUS, et les deux sont nécessaires : celle-là défait un LOT
   * (la sélection multiple de l'en-tête de la Corbeille, qui avait déjà son bandeau et son « Annuler ») ; celle-ci
   * défait LE geste du menu « … » d'UNE ligne, qui n'en avait pas. Les fondre aurait voulu dire porter un tableau
   * d'un seul élément et un état partagé entre deux chemins qui ne se déclenchent jamais ensemble.
   *
   * 🔴 LE MÊME CHEMIN QUE SON CONTRAIRE, pris par l'autre bout : la route `corbeille`, action `corbeille`. On ne
   * crée pas un second geste pour défaire le premier — ce serait deux endroits à tenir d'accord, et le journal de
   * la corbeille cesserait de raconter une histoire lisible.
   *
   * ⚠️ LES COMPTEURS SUIVENT, comme à l'aller : le même delta, dans l'autre sens.
   */
  const annulerReintegrationDuMail = async (): Promise<void> => {
    const fait = reintegreFait;
    if (fait === null) return;
    setReintegreFait(null);
    const r = await gesteCorbeille(fait.filId, true);
    onGeste(r.ok ? 'Réintégration annulée : le mail est reparti à la corbeille.' : r.message,
      r.ok ? { compteurs: DELTA_FIL_CORBEILLE } : undefined);
    if (r.ok) setVersionStatuts((v) => v + 1);
  };

  /** Défaire le dernier « Supprimer », depuis le bandeau. Le même verbe que « Réintégrer », pris par l'autre bout. */
  const annulerCorbeille = async (): Promise<void> => {
    const fait = corbeilleFaite;
    if (fait === null) return;
    setCorbeilleFaite(null);
    const r = await gesteCorbeille(fait.filId, false);
    onGeste(r.ok ? 'Échange restauré : il est revenu dans sa boîte.' : r.message);
    if (r.ok) setVersionStatuts((v) => v + 1);
  };
  useEffect(() => {
    if (filOuvert !== null) return;
    const y = defilement.current;
    if (y <= 0) return;
    // Après la peinture : la liste vient de réapparaître, sa hauteur n'existe pas encore au moment du rendu.
    const t = requestAnimationFrame(() => window.scrollTo(0, y));
    return () => cancelAnimationFrame(t);
  }, [filOuvert]);

  /**
   * CHANGER D'ÉCHANGE REFERME LE PARTAGE : il porte sur CET échange, et le traîner sur le suivant ferait classer le
   * mauvais — le piège exact du panneau d'affectation, corrigé au lot 4c après qu'Arno l'a vu à l'écran.
   *
   * Ajusté PENDANT le rendu, et non dans un effet : c'est le patron que React prescrit pour remettre un état à zéro
   * quand une propriété change. Dans un effet, l'écran afficherait d'abord une image fausse — le partage de l'échange
   * précédent au-dessus du nouveau — avant de se corriger au tour suivant.
   */
  const [filPrecedent, setFilPrecedent] = useState(filOuvert);
  if (filOuvert !== filPrecedent) { setFilPrecedent(filOuvert); setClassement(null); }

  const visibles = etiquettesVisibles(etiquettes, etiquette);
  const ouverte = visibles.find((e) => memeEtiquette(e.etiquette, etiquette));
  const titre = ouverte?.libelle ?? 'Boîte mail';
  const aClasser = etiquette.sorte === 'a_classer';
  // Le nombre d'échanges tenus hors de la file par une règle : il vient de l'étiquette qui les rassemble, pas d'un
  //   second calcul. `null` = pas encore connu — on se tait alors, plutôt que d'annoncer un zéro qu'on n'a pas mesuré.
  const comptesAutomatiques = etiquettes.find((e) => e.etiquette.sorte === 'automatique')?.compte ?? null;

  return (
    <div className="pe">
      {/* ══ 🔴 LOT REDACTION-GMAIL — LES FENÊTRES DE RÉDACTION ════════════════════════════════════════════════
          Ancrées en bas à droite, au-dessus de tout le reste. Deux au plus, côte à côte ; la troisième demande
          rend un message qui dit quoi faire. Elles vivent ICI, au niveau de l'écran, et non dans la liste : une
          fenêtre ne doit pas disparaître parce qu'on a changé d'étiquette ou ouvert un échange. */}
      {refusFenetre !== null && (
        <p className="pe-refus" role="alert">
          {refusFenetre}{' '}
          <button type="button" className="gst-lien-bouton" onClick={() => setRefusFenetre(null)}>J’ai compris</button>
        </p>
      )}
      {redaction !== null && fen.fenetres.length > 0 && (
        <FenetresRedaction
          fenetres={fen.fenetres}
          brouillons={fen.brouillons}
          contexte={redaction}
          fermetures={fen.fermetures}
          onChange={fen.majBrouillon}
          onEtat={fen.changerLEtat}
          /**
           * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — FERMER UNE FENÊTRE EST AUSSI UN GESTE ════════════════════
           *
           * MESURÉ À L'ÉCRAN LE 03/10/2026 : on écrit un message, on clique « Garder en brouillon », la fenêtre
           * se ferme — et « Brouillons » restait à 12. Le brouillon était pourtant bien en base (ligne 109). La
           * cause : la fermeture passe par `onFermer`, pas par `onGeste`, et seul `onGeste` rafraîchissait.
           *
           * 🔴 C'EST EXACTEMENT LA MOITIÉ OUBLIÉE DU CONSTAT D'ARNO (« création ou suppression de brouillon ») :
           * un brouillon NAÎT en se fermant, et le compteur doit le dire tout de suite.
           *
           * ⚠️ SANS MESSAGE : la fermeture n'a rien à annoncer, elle n'a qu'à faire compter. `surGeste` sait
           * traiter le message vide — voir son encadré.
           */
          onFermer={(cle) => { fen.fermerLa(cle); onGeste('', { compteurs: undefined }); }}
          onDemanderFermeture={fen.demanderFermeture}
          onEnvoye={(cle) => { fen.fermerLa(cle); onGeste('', { compteurs: DELTA_ENVOI }); }}
          onGeste={onGeste} />
      )}

      <style>{CSS_PLEIN_ECRAN}</style>

      {/* ══ LA COLONNE, POSÉE DANS LA BARRE DE L'ADMINISTRATION ═══════════════════════════════════════════════════ */}
      <ColonneMode actif panneauMobile={panneauMobile} titre="Étiquettes de la boîte">
        {/* LA SORTIE, EN PREMIER ET EN TOUTES LETTRES. Un plein écran sans retour évident est un piège ; celui-ci est
            le premier élément de la colonne, donc la première chose qu'atteignent le clavier et un lecteur d'écran. */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        {/* LOT 5e — « NOUVEAU MESSAGE », en haut de la colonne. Il n'apparaît que si tout est réuni (base à jour,
            droit d'envoi) : un bouton qui échouerait au clic est pire qu'un bouton absent. */}
        {redaction?.schemaPret && redaction.peutEnvoyer && (
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            onClick={() => {
              // ⚠️ ON NE FERME PLUS L'ÉCHANGE OUVERT : écrire ne doit plus faire perdre ce qu'on lisait.
              ouvrirRedaction(`nouveau:${Date.now()}`, {
                ...preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature }),
                id: null,
              });
            }}>
            Nouveau message
          </button>
        )}
        {/* ══ LOT ERGO-BOITE-3 — LE TITRE DIT DE QUELLE BOÎTE IL S'AGIT ══════════════════════════════════════
            « Boîte mail » ne disait pas laquelle : plusieurs collaborateurs partagent ce poste, et l'adresse est
            précisément ce qu'on veut lire avant d'écrire.

            🔴 LA FORME COURTE, ET C'EST MESURÉ. Arno demandait « Boîte mail <adresse> », et « Mail <adresse> » s'il
            n'y a pas la place. Mesuré dans le navigateur sur la vraie colonne : la forme longue fait 210 px pour
            une colonne de 215 — elle « tient » à cinq pixels près, c'est-à-dire qu'elle ne tient pas. Une police
            légèrement différente, un zoom, une adresse d'un caractère de plus, et elle déborde. On prend donc la
            forme courte, celle qu'Arno autorise exactement pour ce cas.

            ⚠️ L'ADRESSE VIENT DE LA CONFIGURATION (`adresseGestion`), jamais d'une constante recopiée : le jour où
            elle change, ce titre change avec elle. Sans contexte de rédaction (compte sans droit d'écriture), on
            retombe sur « Boîte mail » — un titre sans adresse vaut mieux qu'un titre à trou. */}
        <h2 className="cm-titre">
          {redaction?.adresseGestion ? `Mail ${redaction.adresseGestion}` : 'Boîte mail'}
        </h2>
        <ul className="cm-liste">
          {visibles.map((e) => {
            const active = memeEtiquette(e.etiquette, etiquette);
            /**
             * ══ 🔴 LOT ERGO-BOITE-3 — « RÉCEPTION » PORTE DEUX SÉLECTEURS ═══════════════════════════════════════
             * « N non lus » et le total deviennent CLIQUABLES : l'un restreint la liste aux échanges portant un
             * message reçu non lu, l'autre la rend entière. L'actif est en gras et souligné, l'autre en gris clair
             * et souligné — deux états lisibles en niveaux de gris, jamais une couleur seule.
             *
             * 🔴 POURQUOI DES BOUTONS FRÈRES ET NON IMBRIQUÉS. Un `<button>` dans un `<button>` est du HTML
             * invalide : le navigateur défait l'imbrication, et le clic devient imprévisible. L'entrée garde donc
             * son bouton (le NOM, qui ouvre la liste) et les deux sélecteurs vivent à côté, dans la même ligne.
             *
             * ⚠️ SEULE « RÉCEPTION » EST CONCERNÉE : ailleurs, le balisage est EXACTEMENT celui d'avant ce lot.
             * Un sélecteur de non-lus sous « Envoyés » ne voudrait rien dire (on a écrit ces messages).
             */
            const avecSelecteurs = onFiltre !== undefined && e.etiquette.sorte === 'reception'
              && typeof e.nonLus === 'number' && e.nonLus > 0;
            if (avecSelecteurs) {
              const nonLus = e.nonLus as number;
              return (
                <li key="reception">
                  {/**
                   * ══ 🔴 LOT ERGO-BOITE-4 — LES DEUX SÉLECTEURS SONT DANS L'ENTRÉE, PAS À CÔTÉ ═════════════════
                   * Arno les voulait DEDANS, à droite, comme les compteurs des autres entrées. Au lot précédent ils
                   * vivaient à l'extérieur, et la ligne se lisait comme deux objets distincts au lieu d'une entrée.
                   *
                   * 🔴 POURQUOI UN `div` ET NON UN `button`. Un `<button>` dans un `<button>` est du HTML invalide :
                   * le navigateur défait l'imbrication et le clic devient imprévisible. L'ENVELOPPE porte donc
                   * l'apparence de l'entrée (fond, bordure, coins, survol) et ne fait rien ; les TROIS gestes —
                   * ouvrir la liste, choisir « non lus », choisir le total — sont trois vrais boutons côte à côte.
                   * Pour l'œil c'est une seule entrée ; pour le clavier et les lecteurs d'écran, trois commandes
                   * nommées, ce qui est exactement la vérité.
                   */}
                  <div className={`cm-entree cm-entree--recep${active ? ' cm-entree--active' : ''}`}>
                    <button type="button" className="cm-nom-bouton"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => allerAuDossier(e.etiquette)}>
                      <span className="cm-nom"><span className="cm-texte">{e.libelle}</span></span>
                    </button>
                    <span className="cm-sels">
                      <button type="button"
                        className={`cm-sel${filtre === 'non-lus' ? ' cm-sel--actif' : ''}`}
                        aria-pressed={filtre === 'non-lus'}
                        onClick={() => { allerAuDossier(e.etiquette); onFiltre('non-lus'); }}>
                        {e.nonLusPartiel ? 'au moins ' : ''}{nonLus} non lu{nonLus > 1 ? 's' : ''}
                      </button>
                      {e.compte !== null && (
                        <button type="button"
                          className={`cm-sel cm-sel--total${filtre === null ? ' cm-sel--actif' : ''}`}
                          aria-pressed={filtre === null}
                          onClick={() => { allerAuDossier(e.etiquette); onFiltre(null); }}>
                          {e.compte}
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              );
            }
            return (
              <li key={`${e.etiquette.sorte}-${e.etiquette.evenementId ?? 0}`}>
                <button type="button" className={`cm-entree${active ? ' cm-entree--active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => allerAuDossier(e.etiquette)}>
                  <span className="cm-nom">
                    {/* La référence d'une carte passe DEVANT son titre : c'est elle qu'on cherche des yeux, et c'est
                        elle qu'on retrouve dans un mail ou dans un échange déjà classé. */}
                    {e.reference && <span className="gst-ref">{e.reference}</span>}
                    <span className="cm-texte">{e.libelle}</span>
                  </span>
                  {/* « 3 non lus · 10 103 » : le mot est écrit, jamais une pastille de couleur seule. */}
                  {typeof e.nonLus === 'number' && e.nonLus > 0 && (
                    <span className="cm-non-lus">
                      {e.nonLusPartiel ? 'au moins ' : ''}{e.nonLus} non lu{e.nonLus > 1 ? 's' : ''}
                    </span>
                  )}
                  {e.compte !== null && <span className="gst-compte">{e.compte}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {/* ══ LOT ERGO-BOITE — « À RATTACHER », juste sous les entrées de la boîte ═══════════════════════════════
            C'est l'ancien bouton « À trier », déplacé et renommé : même écran, même fonction. Il est SOUS la boîte
            et non dedans, parce qu'il ne désigne pas un dossier de courrier mais un travail à faire.

            🔴 LOT ERGO-BOITE-2 — LE COMPTEUR DIT LES MAILS À TRANCHER, et eux seuls. Il affichait la somme
            « à trancher + sans candidat » : 19 108 pour 3 261 mails réellement décidables. Les mails sans candidat
            restent atteignables (l'écran de la file les liste et les compte en clair) et l'info-bulle les nomme
            ici — mais ils ne gonflent plus un nombre qui annonce du travail au clic. */}
        {onRattacher && (
          <ul className="cm-liste cm-liste--apres">
            <li>
              <button type="button" className="cm-entree" onClick={() => { onRattacher(); setPanneauMobile('contenu'); }}
                title={titreARattacher(aRattacher, aRattacherSansCandidat)}>
                <span className="cm-nom"><span className="cm-texte">À rattacher</span></span>
                {aRattacher !== null && <span className="gst-compte">{aRattacher}</span>}
              </button>
            </li>
            {onAnnuaire && (
              <li>
                <button type="button" className="cm-entree" onClick={() => { onAnnuaire(); setPanneauMobile('contenu'); }}>
                  <span className="cm-nom"><span className="cm-texte">Annuaire</span></span>
                </button>
              </li>
            )}
          </ul>
        )}

        {/* ══ L'ÉTAT ORDINAIRE, EN PETIT ET EN BAS ══════════════════════════════════════════════════════════════
            Heure de la dernière relève, dernier mail reçu, cadence, copie des pièces. C'était un pavé en haut de
            page ; ce sont des informations qu'on consulte, pas qu'on lit. Les descendre ici est ce qui redonne au
            BANDEAU D'ALERTE, resté en haut, le pouvoir de se faire remarquer.
            `role="status"` : annoncé sans voler le focus. */}
        {/**
          * ══ 🔴 LOT ERGO-BOITE-4 — REPLIÉ DERRIÈRE « DÉTAILS RELÈVE » ═══════════════════════════════════════════
          * Trois paragraphes gris occupaient le bas de la colonne en permanence. Ce sont des informations qu'on
          * CONSULTE — l'heure de la dernière passe, la cadence, l'état de la copie des pièces — pas des
          * informations qu'on lit à chaque ouverture. Repliées, elles ne coûtent plus qu'une ligne ; dépliées, elles
          * sont exactement les mêmes, mot pour mot.
          *
          * 🔴 RIEN N'EST RETIRÉ, ET SURTOUT PAS L'ALERTE. Le bandeau « relève arrêtée » / « copie arrêtée » vit en
          * HAUT DE PAGE, dans `GestionVue`, et n'a jamais transité par ici : c'est même tout l'intérêt de la
          * séparation — l'ordinaire se replie, l'exceptionnel se voit. Replier ceci ne peut donc pas cacher une
          * alerte.
          *
          * ⚠️ `hidden` PLUTÔT QU'UN DÉMONTAGE : le texte reste dans le document, donc trouvable par la recherche du
          * navigateur, et `aria-expanded` dit l'état au lecteur d'écran.
          */}
        {etatDiscret !== null && etatDiscret.length > 0 && (
          <div className="cm-etat">
            <button type="button" className="cm-details" aria-expanded={detailsOuverts}
              aria-controls="cm-details-relevé" onClick={() => setDetailsOuverts((v) => !v)}>
              <span className="cm-details-fleche" aria-hidden="true">{detailsOuverts ? '▾' : '▸'}</span>
              Détails relève
            </button>
            <div id="cm-details-relevé" role="status" hidden={!detailsOuverts}>
              {etatDiscret.map((l) => <p key={l} className="cm-etat-ligne">{l}</p>)}
            </div>
          </div>
        )}
      </ColonneMode>

      {/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */}
      <button type="button" className="svv-btn svv-btn-outline gst-btn pe-retour-colonne"
        onClick={() => setPanneauMobile('colonne')}>
        ← Étiquettes
      </button>

      <div className={`pe-grille${classement !== null ? ' pe-grille--classer' : ''}`}>
        {/* LA LISTE — pleine largeur par défaut, et MASQUÉE (jamais démontée) pendant qu'on lit un échange. */}
        <section className="pe-liste" aria-label={`Échanges — ${titre}`} hidden={filOuvert !== null}>
          {/* SOUS « À CLASSER », C'EST LE POSTE DE TRI QUI S'AFFICHE, tel qu'il est : mêmes gestes, même panneau,
              même compteur. Sous toutes les autres étiquettes, c'est la boîte du lot 5a, filtrée. */}
          {/* 🔴 LOT REDACTION-GMAIL — UN NOUVEAU MESSAGE NE PREND PLUS LA PLACE DE LA LISTE. Il s'ouvre dans une
              FENÊTRE flottante, en bas à droite (voir `FenetresRedaction`) : on écrit EN VOYANT ce à quoi on
              répond, et deux messages peuvent s'écrire côte à côte. La liste reste donc à sa place, vivante. */}
          {etiquette.sorte === 'brouillons' ? (
            <Brouillons maintenant={maintenant}
              /* 🔴 LE MÊME MOT QUE DANS L'ÉDITEUR, conditionné par la même sonde (migration 276). */
              corbeille={redaction?.corbeilleBrouillon === true}
              /* 🔴 LOT BANDEAU-ET-BROUILLONS — la signature de gestion@, pour la RETIRER de l'extrait. C'est la
                 même que celle dont l'éditeur pré-remplit le corps : une seconde source divergerait. */
              signature={redaction?.signature ?? null}
              /* 🔴 « Voir la conversation » emmène AUSSI le brouillon : Arno l'a demandé explicitement, et un
                 bouton qui ouvre le fil sans l'éditeur fait chercher le brouillon qu'on venait justement reprendre. */
              onOuvrir={(f, b) => onOuvrir(f, b?.repondAMessageId ?? null, b?.id ?? null)}
              /**
               * 🔴🔴 UN CLIC SUR UN BROUILLON L'OUVRE DANS L'ÉDITEUR — il ne s'ouvrait pas du tout (constat d'Arno).
               * On réutilise la fenêtre de rédaction ORDINAIRE : mêmes destinataires, même objet, même corps mis en
               * forme, mêmes pièces jointes (la zone des pièces les relit à partir de l'identifiant du brouillon).
               * La clé tient à cet identifiant : recliquer RÉTABLIT la fenêtre au lieu d'en ouvrir une seconde sur
               * le même travail — deux fenêtres sur une seule ligne, et le dernier enregistrement mangerait l'autre.
               */
              /**
               * 🔴🔴 LOT BROUILLONS-GMAIL — UN BROUILLON DE RÉPONSE S'OUVRE DANS SA CONVERSATION.
               *
               * CONSTAT D'ARNO : cliquer « Re: État des lieux de sortie » ouvrait la conversation SANS l'éditeur —
               * le brouillon était introuvable. Il s'ouvrait en réalité dans une fenêtre flottante, détachée du fil
               * auquel il répond : on ne voyait plus à quoi on répondait, et la fenêtre se confondait avec un
               * message neuf.
               *
               * ⚠️ DEUX CHEMINS, ET C'EST VOULU : un brouillon RATTACHÉ À UN ÉCHANGE va dans sa conversation, sous
               * le message auquel il répond ; un message NEUF (sans échange) garde sa fenêtre flottante, qui est sa
               * place naturelle — il n'y a pas de conversation où le poser.
               */
              onReprendre={reprendreCeBrouillon}
              /**
               * 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — METTRE UN BROUILLON À LA CORBEILLE DEPUIS SA LISTE.
               *
               * C'est LE geste du constat d'Arno, et il passait par `onChange` — une relecture de la liste, et
               * rien d'autre. Les compteurs ne bougeaient donc pas, et il fallait recharger la page. Il passe
               * désormais aussi par la porte des gestes, avec son delta.
               *
               * ⚠️ SANS MESSAGE : la ligne disparaît sous les yeux, c'est assez clair ; un bandeau de plus
               * serait du bruit. `surGeste` sait traiter le message vide.
               */
              onChange={() => { onEtiquette(etiquette); onGeste('', { compteurs: DELTA_BROUILLON_JETE }); }} />
          ) : aClasser ? (
            <>
              <h3 className="gst-titre">
                {titre} {ouverte?.compte !== null && ouverte !== undefined && <span className="gst-compte">{ouverte.compte}</span>}
                {/* LA MÊME ICÔNE que sur la boîte : le poste de tri a autant besoin d'être rafraîchi. */}
                {onRelever && (
                  <button type="button" className={`bte-relever${releveEnCours ? ' bte-relever--tourne' : ''}`}
                    onClick={onRelever} disabled={releveEnCours}
                    aria-label="Relever et actualiser" title="Relever et actualiser">
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
                      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                      <path d="M20 4v4h-4" />
                    </svg>
                  </button>
                )}
              </h3>
              {/* CE QUE CETTE LISTE NE MONTRE PAS, dit en toutes lettres, avec la sortie — comme partout dans le
                  module depuis le lot 4b. Elle n'a jamais montré le courrier automatique ; maintenant elle DIT où
                  le trouver, au lieu de le taire.
                  🔴 LOT STATUT-HORS-GESTION — la phrase ne dit plus « le poste de tri » : cette liste répond à la
                  question de l'ÉVÉNEMENT, qui est FACULTATIF, et « poste de tri » la faisait lire comme un arriéré
                  de travail. Le tri des MAILS, lui, se fait dans la boîte de réception, mail par mail. */}
              {comptesAutomatiques !== null && comptesAutomatiques > 0 && (
                <p className="gst-tronc">
                  Cette liste n’a jamais montré le courrier automatique : {comptesAutomatiques} échange
                  {comptesAutomatiques > 1 ? 's' : ''} rest{comptesAutomatiques > 1 ? 'ent' : 'e'} hors de cette liste.
                  Rien n’est supprimé.{' '}
                  <button type="button" className="gst-lien-bouton"
                    onClick={() => onEtiquette({ sorte: 'automatique', evenementId: null })}>
                    Voir l’étiquette « Courrier automatique »
                  </button>
                </p>
              )}
              {enfantAClasser}
            </>
          ) : (
            <>
            {/* ══ LOT 5-BOITE-3 — LE BANDEAU « ANNULER » ══ Il reste tant qu'on ne fait pas autre chose : un geste
                réversible doit se défaire LÀ OÙ IL A ÉTÉ FAIT. `role="status"` et non `alert` — c'est une
                confirmation, pas un problème, et on n'interrompt pas une lecture d'écran pour ça. */}
            {corbeilleFaite !== null && (
              <p className="pe-corbeille" role="status">
                {/* 🔴 LOT BOITE-INTERNE-CORBEILLE — CETTE PHRASE DISAIT LE CONTRAIRE DE CE QUI SE PASSE.
                    Elle affirmait « Rien n'est supprimé : il reste intact dans Gmail », ce qui était vrai de la
                    corbeille INTERNE. Le geste part maintenant pour de vrai : vérifié sur la vraie boîte le
                    29/09/2026, le mail de test porte le libellé TRASH après le clic. Un bandeau qui rassure à
                    tort sur un geste qui agit est pire qu'un bandeau absent. */}
                <span>
                  Échange mis à la corbeille de Gmail. Il se réintègre d’un clic ; passé 30 jours, Gmail l’efface
                  lui-même.
                </span>
                <button type="button" className="pe-corbeille-annuler" onClick={() => void annulerCorbeille()}>
                  Annuler
                </button>
              </p>
            )}
            {/* ══ 🔴🔴 LOT REINTEGRER — LE BANDEAU SYMÉTRIQUE ═══════════════════════════════════════════════════
                Arno : « Après “Réintégrer” […] “Annuler” est possible quelques secondes, comme pour la mise à la
                corbeille. » C'est donc EXACTEMENT le même bandeau, à la même place, avec le même bouton : il reste
                tant qu'on ne fait pas autre chose, comme celui du dessus. Un geste réversible doit se défaire LÀ
                OÙ IL A ÉTÉ FAIT.

                🔴 ET IL DIT OÙ LE MAIL EST PARTI. La liste qu'on regarde est la Corbeille : le mail vient d'en
                disparaître sous les yeux. Sans le nom de la boîte, il faudrait le chercher. La phrase vient du
                module PUR (`bandeauReintegre`), qui dit aussi que le statut et l'étoile sont conservés — ce que
                la mécanique garantit par construction, et qu'on a donc le droit d'affirmer. */}
            {reintegreFait !== null && (
              <p className="pe-corbeille" role="status">
                <span>{bandeauReintegre(reintegreFait.boite ?? null)}</span>
                {/**
                 * 🔴🔴 `annulerReintegrationDuMail`, ET SURTOUT PAS `annulerReintegration` — DÉFAUT QUE J'AI
                 * INTRODUIT ET QUE L'ÉCRAN A ATTRAPÉ.
                 *
                 * Les deux noms se ressemblent et ne défont pas la même chose : `annulerReintegration` lit
                 * `reintegres` (le LOT de la sélection multiple), `annulerReintegrationDuMail` lit
                 * `reintegreFait` (LE mail du menu « … »). Branché sur la première, ce bouton lisait un état
                 * `null`, sortait à la première ligne, et NE FAISAIT RIEN — sans erreur, sans message, le bandeau
                 * restant même affiché. MESURÉ à l'écran le 03/10/2026 en instrumentant `fetch` : zéro appel
                 * après le clic, bandeau inchangé, mail resté dans « Envoyés ».
                 *
                 * ⚠️ LA LEÇON : deux gestes voisins qui lisent deux états différents doivent être éprouvés SUR
                 * L'ÉCRAN, pas seulement par la lecture du code — un `?? null` et un retour anticipé suffisent à
                 * rendre un bouton muet.
                 */}
                <button type="button" className="pe-corbeille-annuler"
                  onClick={() => void annulerReintegrationDuMail()}>
                  Annuler
                </button>
              </p>
            )}
            {/* ══ 🔴 L'EN-TÊTE DE LA CORBEILLE — la mention des 30 jours, la sélection, les deux gestes ══════ */}
            {estCorbeille && (
              <EnteteCorbeille
                nbPage={lignesCorbeille.length}
                nbSelection={selCorbeille.size}
                nbMailsSelection={nbMailsSelection}
                totalCorbeille={toutCorbeille?.total ?? null}
                toutePageCochee={toutePageCochee}
                occupe={occupeCorbeille}
                suppressionPossible={toutCorbeille?.suppressionPossible ?? false}
                motSuppressionImpossible={toutCorbeille?.motImpossible ?? MENTION_DROIT_ATTENTE}
                onToutePage={cocherLaPage}
                onToutLaCorbeille={() => void cocherToutLaCorbeille()}
                onReintegrer={() => void reintegrer()}
                onSupprimer={() => void supprimerDefinitivement()} />
            )}
            {/* 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LES BROUILLONS JETÉS, au-dessus des mails. Bloc à part parce
                qu'un brouillon n'a ni date de réception ni identifiant Gmail : l'insérer dans une liste paginée
                par curseur sur la date ferait sauter des échanges d'une page à l'autre (même raison que le
                bandeau des envois en échec). */}
            {estCorbeille && (
              <BrouillonsJetes version={versionListe} onGeste={onGeste}
                onChange={() => setVersionListe((v) => v + 1)} />
            )}
            {/* ⚠️ LE BANDEAU DE LA RÉINTÉGRATION EST DISTINCT de celui de la mise à la corbeille juste au-dessus :
                deux gestes opposés, deux promesses différentes, et l'un ne doit jamais défaire l'autre. */}
            {reintegres !== null && (
              <p className="pe-corbeille" role="status">
                <span>
                  {reintegres.filIds.length} échange{reintegres.filIds.length > 1 ? 's' : ''} réintégré
                  {reintegres.filIds.length > 1 ? 's' : ''} — {'ils ont'} retrouvé leur place.
                </span>
                <button type="button" className="pe-corbeille-annuler"
                  onClick={() => void annulerReintegration()}>
                  Annuler
                </button>
              </p>
            )}
            <BoiteMail key={versionListe} etiquette={etiquette} titre={titre} total={ouverte?.compte ?? null} dense
              /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 3 — cliquer un dossier sort de la recherche. */
              retourAuDossier={retourAuDossier}
              onRelever={onRelever} releveEnCours={releveEnCours} filtre={filtre}
              etoile={etoile} onEtoileFiltre={onEtoileFiltre}
              auto={auto} onAuto={onAuto} filSelectionne={filOuvert} onNonLus={onNonLus}
              onTotalEtiquette={onTotalEtiquette} marquage={marquage}
              corbeille={corbeilleDisponible} peutEcrire={peutEcrire} piecesDisponibles={piecesDisponibles}
              onActionLigne={agirSurLigne}
              /* 🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 1 — l'échec d'un geste de ligne (l'étoile de la barre
                 de survol) se DIT, au lieu de se deviner en voyant l'étoile revenir toute seule. */
              onGeste={(m) => onGeste(m)}
              /**
               * 🔴 LOT LIGNE-NON-ENVOYE — une ligne FABRIQUÉE (message neuf qui n'est pas parti) ne désigne aucun
               * échange : son clic conduit là où le travail est retourné, les Brouillons. Ouvrir une conversation
               * inexistante donnerait un écran vide, et l'on chercherait le mail perdu.
               */
              onRouvrirBrouillon={() => onEtiquette({ sorte: 'brouillons', evenementId: null })}
              /* 🔴🔴 LOT BROUILLONS-APERCU — l'œil des lignes de brouillon trouvées par une recherche. */
              onApercuBrouillon={(id) => setApercuBrouillon(id)}
              versionDonnees={versionDonnees} onListeRelue={onListeRelue}
              /* 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — le battement du statut : voir son encadré ci-dessus. */
              versionStatuts={versionStatuts}
              /* LOT MESSAGE-CLIQUÉ — le message de la ligne voyage avec l'échange, sans quoi la conversation
                 ouvrirait son dernier message et non celui qu'on vient de cliquer. */
              onOuvrir={(id, messageId) => { defilement.current = window.scrollY; onOuvrir(id, messageId); }}
              /* LOT BOITE-INTERNE-CORBEILLE — les cases N'EXISTENT QUE SOUS LA CORBEILLE : ailleurs, `undefined`
                 rend la liste exactement telle qu'elle était avant ce lot. */
              selection={estCorbeille
                ? { actives: selCorbeille, onBasculer: basculerCorbeille, onPage: surLesLignes }
                : undefined} />
            </>
          )}
        </section>

        {/* LA CONVERSATION — EN PLEINE PAGE. Elle ne s'ouvre plus « à côté » : elle prend la place de la liste, comme
            dans une messagerie. Le retour se fait par la flèche de sa barre d'actions, ou par « Précédent ». */}
        {filOuvert !== null && (
          <section className="pe-lecture" aria-label="Conversation">
            <Conversation key={`${filOuvert}-${versionFil}`} filId={filOuvert} maintenant={maintenant}
              /**
               * 🔴 LOT LIGNE-NON-ENVOYE — le brouillon d'un mail de cet échange qui n'est pas parti. On va là où
               * le travail est RETOURNÉ : les Brouillons. C'est le même geste que depuis la liste, et le même que
               * le lien de l'alerte — un seul endroit où reprendre un envoi manqué.
               */
              onRouvrirBrouillon={() => onEtiquette({ sorte: 'brouillons', evenementId: null })}
              /* LOT MESSAGE-CLIQUÉ — le message de la ligne cliquée : déplié et amené à l'écran. */
              messageVise={messageOuvert}
              /* 🔴 LOT BROUILLONS-GMAIL — le brouillon cliqué se rouvre sous SON message, dans la conversation. */
              brouillonRepris={brouillonOuvert}
              voieInitiale={voieDemandee}
              onFerme={onFermerFil} barreActions onClassement={(voie) => setClassement(voie)}
              /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — « ← Retour à l'historique du bien », offert SEULEMENT
                 quand on vient de là. C'est CE montage-ci que l'écran « boîte » emploie — celui où l'on arrive
                 en cliquant « Voir la conversation d'origine → » dans le bloc d'une fiche de bien. */
              onRetourHistoriqueBien={onRetourHistoriqueBien}
              redaction={redaction} onGeste={onGeste}
              // LOT ANNUAIRE-1 — l'encart « Propriétaire de … » mène à la fiche, dans l'écran Annuaire.
              onFicheAnnuaire={onFicheAnnuaire}
              // LOT RATTACHEMENT-2 — une étiquette du bandeau « Rattaché à » ouvre TOUT l'historique de la cible.
              onHistorique={onHistorique}
              // LOT 5-BOITE — ouvrir (ou marquer non lu) change le gras de la liste, qui l'applique sur place.
              onLecture={(id, lu) => setMarquage((m) => ({ filId: id, nonLu: !lu, cle: m.cle + 1 }))}
              /**
               * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — UN CLASSEMENT VALIDÉ ICI DOIT SE VOIR LÀ-BAS.
               *
               * La liste n'est pas démontée pendant qu'on lit un mail : elle est MASQUÉE (`hidden` sur
               * `.pe-liste`). Sans ce rappel, elle affichait au retour l'état d'avant le geste — « À classer »
               * sur un échange qu'on venait de marquer « Interne » (constat d'Arno, fil 36691).
               *
               * ⚠️ DEUX DESTINATAIRES, ET CHACUN A SON TRAVAIL : la LISTE relit sa page (`versionStatuts`), et
               * l'ÉCRAN PARENT redemande les compteurs de la colonne — le nombre d'« À classer » ne lui vient
               * pas de la liste quand ce n'est pas cette liste qui est ouverte.
               */
              onClassementChange={() => { setVersionStatuts((v) => v + 1); onClassementChange?.(); }}
              /* 🔴🔴 LOT BROUILLON-ACCES-SUPPRESSION, POINT 2 — « sans rechargement manuel » (Arno). Un brouillon
                 supprimé doit faire disparaître le picto ✎ de SA LIGNE, qui est ici et non dans la conversation.
                 La liste n'est pas démontée pendant qu'on lit un mail, elle est MASQUÉE : elle relit donc sa page
                 SUR PLACE (`versionStatuts`), exactement comme après un classement. */
              onBrouillonsChange={() => { setVersionStatuts((v) => v + 1); onBrouillonsChange?.(); }} />
          </section>
        )}

        {/* LE PARTAGE « CLASSER » — à DROITE de la conversation sur grand écran, À SA PLACE sur téléphone (un écran
            après l'autre, jamais deux colonnes de 180 px). Le panneau est celui du lot 4b, inchangé : mêmes deux
            voies, même pré-remplissage lu dans le mail, même route, même compteur GES-AAAA-NNNNNN atomique. */}
        {filOuvert !== null && classement !== null && (
          <aside className="pe-classer" aria-label="Classer cet échange">
            <div className="pe-classer-haut">
              <h3 className="gst-titre">Classer cet échange</h3>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setClassement(null)}>
                Fermer
              </button>
            </div>
            <PanneauAffecter filId={filOuvert} voieInitiale={classement}
              onFait={(m) => { setClassement(null); setVersionFil((v) => v + 1); onGeste(m, { rechargerTout: true }); }}
              onAnnuler={() => setClassement(null)} />
          </aside>
        )}
      </div>

      {/* ══ 🔴🔴 LOT BROUILLONS-APERCU — LA FENÊTRE, POSÉE PAR-DESSUS TOUT LE RESTE ═══════════════════════════
          Elle ne remplace aucun écran : la liste, les résultats de recherche et la conversation restent montés
          derrière. La refermer ne recharge donc rien, et l'on retrouve ses résultats tels qu'on les a laissés. */}
      {apercuBrouillon !== null && (
        <ApercuBrouillon brouillonId={apercuBrouillon}
          onFermer={() => setApercuBrouillon(null)}
          onModifier={reprendreCeBrouillon} />
      )}
    </div>
  );
}

const CSS_PLEIN_ECRAN = `
/* LOT 5-BOITE-3 — le bandeau « Annuler » d'un geste de corbeille. Une CONFIRMATION, pas une alarme : ton neutre,
   aucune couleur d'avertissement, et le geste inverse à portée de doigt (cible de 44 px). */
.pe-corbeille{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 .6rem;padding:10px 12px;
  border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-field);
  font-size:.85rem;line-height:1.45;color:var(--color-svv-ink)}
.pe-corbeille-annuler{min-height:44px;padding:0 .9rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.85rem;font-weight:600;
  cursor:pointer;margin-left:auto}
.pe-corbeille-annuler:hover{border-color:var(--color-svv-ink)}
.pe-corbeille-annuler:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* LOT REDACTION-GMAIL — le refus d'une troisieme fenetre. En MOTS, avec la sortie ; jamais un clic sans effet. */
.pe-refus{position:fixed;left:16px;bottom:16px;z-index:61;max-width:min(420px, calc(100vw - 32px));margin:0;
  padding:10px 12px;font-size:.85rem;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-left:3px solid var(--color-svv-red);border-radius:.5rem}
.pe{display:flex;flex-direction:column;gap:12px;min-width:0}
/* UNE SEULE COLONNE par défaut : la liste occupe toute la largeur, et l'échange ouvert prend sa place — comme dans
   une messagerie. Plus de volet de lecture ouvert en permanence, qui coupait la liste en deux pour ne rien montrer. */
.pe-grille{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.pe-liste{min-width:0}
.pe-lecture{min-width:0}
.pe-classer{min-width:0}
/* SUR TÉLÉPHONE, « classer » est un ÉCRAN DE PLUS, pas une seconde colonne : la conversation s'efface le temps de
   choisir l'événement, et le bouton « Fermer » la ramène. Deux colonnes de 180 px ne sont pas deux colonnes. */
.pe-grille--classer .pe-lecture{display:none}
/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */
.pe-retour-colonne{align-self:flex-start}
@media (min-width:768px){.pe-retour-colonne{display:none}}
.pe-classer-haut{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.5rem}
.pe-classer-haut .gst-titre{margin:0}
/* Dès 1000 px, « classer » se met À CÔTÉ de la conversation : on voit le mail pendant qu'on choisit sa carte, ce qui
   est exactement ce qu'on a besoin de relire à ce moment-là. */
@media (min-width:1000px){
  .pe-grille--classer{grid-template-columns:minmax(0,1fr) minmax(0,22rem)}
  .pe-grille--classer .pe-lecture{display:block}
}
`;
