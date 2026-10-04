'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
/* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — la corbeille d'UN message : même route, même journal, même
   synchronisation Gmail que celle d'un échange. Seule la désignation change. */
import { gesteCorbeilleMessage } from './gestesLigne';
import { DELTA_FIL_CORBEILLE, DELTA_FIL_RESTAURE } from '../../../../lib/gestion/compteursColonne';
import type { EnTeteFil, MailParti, MessageDeFil, PieceDeMessage } from '../../../../lib/gestion/carteRepo';
import {
  etatCorps, lignesDestinataires, mentionHorsFile, mentionNonRemise, messagesDeplies, MENTION_HTML_SEUL,
  libelleOrdre, lireOrdreMemorise, memoriserOrdre, ordonnerMessages, ordreSuivant, ORDRE_FIL_DEFAUT,
  type OrdreFil,
  piedUtile,
} from '../../../../lib/gestion/conversation';
import { dateHeureComplete, dateHeureCourte, formaterTaille, libelleSens, LIBELLE_CLASSER } from '../../../../lib/gestion/ecran';
// 🔴 LOT SOMBRE-ET-RECHERCHE — le texte noir d'un mail se relève À L'ÉCRAN, jamais dans le HTML stocké.
import { CSS_LISIBILITE_SOMBRE, useLisibiliteSombre } from './lisibiliteSombre';
// 🔴🔴 LOT CADRE-ISOLE-MAILS — le cadre isolé d'un corps de mail reçu, et sa feuille.
import { CadreMail, CSS_CADRE_MAIL } from './CadreMail';
import {
  actionsDuStatut, bulleCapsuleMessage, capsuleDuMessage, libelleCartouche, lienVersCarte, motCapsule,
  precisionCartouche, SORTES_BIEN, statutDuMessage, tonCartouche,
  type ActionStatut, type StatutClassement,
} from '../../../../lib/gestion/statutClassement';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';
// LOT AVIS-LISIBLE — module PUR (aucune base) : lire un avis de non-remise et en isoler le passage humain.
import { estAvisNonRemise, lireAvis, motifNonRemise, texteHumainAvis } from '../../../../lib/gestion/nonRemise';
import { CSS_PIECES, PiecesJointes, type DepotAffiche } from './PiecesJointes';
/**
 * 🔴 LOT PIECES-DE-LA-CONVERSATION — TOUTES LES PIÈCES DE L'ÉCHANGE, EN UN CLIC. Les règles (ce qui compte, dans
 * quel ordre, les mots) vivent dans le module PUR ; l'écran ne fait que placer et peindre.
 */
import {
  dedoublonnerPieces, ORDRE_PIECES_DEFAUT, ordrePiecesSuivant, PARENT_PIECES_CONVERSATION,
  piecesDeLaConversation, voisinagePiecesConversation, type OrdrePieces, type PieceDeConversation,
} from '../../../../lib/gestion/piecesConversation';
import {
  BoutonPiecesConversation, CSS_PIECES_CONVERSATION, ModalePiecesConversation,
} from './PiecesDeLaConversation';
// 🔴 LA MÊME visionneuse que le Drive, et la MÊME fenêtre « Ranger » : aucune copie divergente (demande d'Arno).
import { ApercuFichierDrive } from './ApercuFichierDrive';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import type { PieceARanger } from '../../../../lib/gestion/rangementDrive';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { MenuDiscret } from './MenuDiscret';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
// LOT BROUILLONS-GMAIL — la traduction « brouillon en base → brouillon d'éditeur », PURE.
import { reprendreBrouillon, type BrouillonEnregistre } from '../../../../lib/gestion/brouillonReprise';
import { heureGmail } from '../../../../lib/gestion/ecran';
import { lienGmail, libelleEtoile, menuMessage, type ActionMessage } from '../../../../lib/gestion/gmailMenu';
import { PanneauAffecter } from './PanneauAffecter';
import { EncartAnnuaire } from './EncartAnnuaire';
// Le bandeau porte son propre CSS en ligne, comme `EncartAnnuaire` : rien à ajouter à `CSS_CONVERSATION`.
import { EncartRattachement } from './EncartRattachement';
// LOT LIGNE-NON-ENVOYE — la capsule « Non envoyé » de cet échange, avec sa cause et le retour au brouillon.
import { BandeauEnvois } from './BandeauEnvois';
// LOT BARRE-STATUT — la fenêtre « Visualiser / Modifier », partagée avec la liste.
import { RattachementsDuFil } from './RattachementsDuFil';
// LOT STATUT-PAR-MAIL — la fenêtre « Classer ce mail » : portée, biens, parties à la date du mail.
import { ClasserMail } from './ClasserMail';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
import type { Cible } from '../../../../lib/gestion/rattachement';
// 🔴🔴 LOT CLASSER-AVANT-ENVOI — ce dont une réponse hérite : décidé dans un module PUR, éprouvé à part.
import { classementHerite, type ClassementHerite } from '../../../../lib/gestion/classementAvantEnvoi';
// 🔴🔴 LOT SUIVI-CONVERSATION — les repères de période dans le fil. Décidés dans un module PUR.
import {
  motClassement, reperesDuFil, type ExceptionMail, type Periode, type RepereFil,
} from '../../../../lib/gestion/periodesConversation';
/* 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — les mots du picto « brouillon en attente », écrits une seule fois. */
import {
  AIDE_BROUILLON_EN_ATTENTE, AIDE_CORBEILLE_MESSAGE, BANDEAU_MESSAGE_CORBEILLE,
  DELAI_BANDEAU_CORBEILLE_MS, MENTION_BROUILLON_VOIR_EN_BAS, PICTO_BROUILLON,
} from '../../../../lib/gestion/brouillonEnAttente';
/**
 * 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — les mots et le glyphe de « Réintégrer », et la boîte d'origine
 * d'un MESSAGE. Module PUR : il est lu par cette fenêtre comme par la barre d'une ligne de liste, et c'est ce qui
 * garantit que les deux disent la même chose.
 */
import {
  aideIconeReintegrer, boiteDuMessage, PICTO_REINTEGRER,
} from '../../../../lib/gestion/boiteOrigine';
/* 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — de quel CÔTÉ le repère se pose, et ce que sa pastille explique. */
/**
 * 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — la règle du repli « interne », écrite UNE fois. Module PUR :
 * ni réseau, ni base, ni React — importable d'ici sans rien tirer derrière lui.
 */
import { interneDuMail } from '../../../../lib/gestion/interneDuMail';
import {
  AIDE_PASTILLE_REPERE, comparatifRepere, coteDuRepere, nbMailsCouverts,
} from '../../../../lib/gestion/repereFenetre';
/* 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — la pastille « i » du repère ouvre cette fenêtre, au clic. */
import { ModaleChangementSuivi, type MailDuRepere } from './ModaleChangementSuivi';
/* 🔴 LA PASTILLE « i » DES BIENS, employée telle quelle avec un autre contenu : voir son encadré `lignes`. */
import { InfoBien, CSS_INFO_BIEN } from './InfoBien';
/* 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — le statut « deja dans le Drive » des pieces de l'echange, et ou
   la fenetre Drive doit s'ouvrir pour un emplacement donne. Module PUR. */
import {
  dossierDeLEmplacement, type EmplacementPiece, type StatutPieceDrive,
} from '../../../../lib/gestion/pieceDansLeDrive';
/* 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « le picto cylindre et son menu d'emplacements apparaissent sans
   rechargement » (Arno). Le récapitulatif des pièces s'abonne au même signal que les cartes du mail. */
import { ecouterPiecesDrive } from '../../../../lib/gestion/signalPieceDrive';
import { agirSurLeMail, DeplacerVers, type Rapport } from './gestesMail';

/**
 * LOT 5b — LA VUE CONVERSATION. UNE SEULE, utilisée partout où l'on ouvre un échange : depuis la boîte mail, depuis le
 * poste de tri, depuis une carte. Deux vues du même échange finiraient par diverger — et c'est toujours celle qu'on
 * regarde le moins qui garde le défaut.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LA FORME VOULUE PAR ARNO : en HAUT nos fonctions maison (affecter, classer sans suite, rouvrir, détacher, déplacer,
 * référence GES-…), en DESSOUS un environnement de messagerie ordinaire. Les fonctions maison ne sont pas réécrites :
 * elles appellent les MÊMES routes qu'avant, donc le même journal et le même comportement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * CE QUE CE LOT N'A PAS : répondre / transférer / nouveau message (5e), la recherche (5c), l'affichage de la mise en
 * forme HTML (5d), l'état « à traiter / traité par X » par échange. Le texte est rendu TEL QUEL, jamais interprété.
 *
 * MOBILE D'ABORD : chaque ligne repliée est un bouton pleine largeur d'au moins 44 px, les adresses passent à la ligne
 * plutôt que de déborder, aucune interaction au survol seul. Couleurs : jetons `--color-svv-*` uniquement, et chaque
 * information portée par un MOT — « Hors file de tri », « destinataires non détaillés » — jamais par la couleur seule.
 */

type Vue =
  | { v: 'charge' }
  | { v: 'ok'; fil: EnTeteFil; messages: MessageDeFil[]; partis: MailParti[] }
  | { v: 'erreur'; m: string };

async function chargerConversation(filId: number): Promise<Vue> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/messages`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    const d = (await res.json()) as { fil?: EnTeteFil; messages: MessageDeFil[]; partis?: MailParti[] };
    // Repli SÛR : sans en-tête (réponse d'une version antérieure), on rend quand même la conversation — les fonctions
    //   maison se calment plutôt que de faire écran blanc. Lire le courrier doit toujours rester possible.
    const fil: EnTeteFil = d.fil ?? { filId, objet: null, etat: 'a_classer', reference: null, evenementId: null, evenementObjet: null };
    return { v: 'ok', fil, messages: d.messages ?? [], partis: d.partis ?? [] };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * Le corps d'UN message, au dépliage. `null` = rien à afficher ; `undefined` = la lecture a échoué.
 *
 * 🔴 LOT BIEN-RATTACHE — ELLE RAMÈNE AUSSI LE HTML, DÉJÀ ASSAINI PAR LE SERVEUR. 1 180 mails en base n'ont QUE de
 * la mise en forme ; ils affichaient « affichage à venir » au lieu de leur contenu.
 */
async function chargerCorps(
  messageId: number,
): Promise<{ texte: string | null; html: string | null; cssMail?: string } | undefined> {
  try {
    const res = await fetch(`/api/admin/gestion/messages/${messageId}/corps`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    /**
     * 🔴🔴 LOT CADRE-ISOLE-MAILS — `cssMail` EST LA FEUILLE D'EN-TÊTE DU MAIL, déjà filtrée par le serveur
     * (`@import`, `url(` externe, `expression(` et toute sortie de balise refusés). Elle n'est posée QUE dans le
     * cadre isolé, jamais dans la page.
     *
     * ⚠️ ABSENTE D'UNE RÉPONSE PLUS ANCIENNE QUE CE LOT ⇒ chaîne vide : le cadre s'affiche alors sans la feuille
     * du mail, c'est-à-dire exactement comme avant ce lot.
     */
    const d = (await res.json()) as { corps?: string | null; html?: string | null; cssMail?: string | null };
    return { texte: d.corps ?? null, html: d.html ?? null, cssMail: d.cssMail ?? '' };
  } catch {
    return undefined;
  }
}

/**
 * Un geste sur l'échange. Les routes sont CELLES QUI EXISTENT : ce lot ne réécrit aucune logique métier.
 *
 * LOT 5-GMAIL — il RELIT ensuite la conversation (`apres`). En plein écran on RESTE sur l'échange après un geste :
 * la barre d'actions doit donc dire la vérité tout de suite (la référence GES-… qui apparaît, « Rouvrir » qui
 * remplace « Classer sans suite »). Sans cette relecture, la barre continuerait d'annoncer l'état d'avant.
 */
async function geste(url: string, methode: 'POST' | 'DELETE', succes: string, onGeste: Rapport, apres?: () => void): Promise<void> {
  try {
    const res = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
    if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Geste impossible.'); return; }
    onGeste(succes, { rechargerTout: true });
    apres?.();
  } catch {
    onGeste('Geste impossible : le serveur n’a pas répondu.');
  }
}

/**
 * LOT 5-BOITE — MARQUER L'ÉCHANGE LU, OU NON LU, POUR MOI.
 *
 * ⚠️ Fonction À PART, et non `geste()` : celui-ci envoie un corps vide et attend un `{ ok: true }`, alors que la
 * route de lecture exige que `lu` soit dit EXPLICITEMENT (deviner « lu » ferait d'un appel malformé un geste
 * silencieux) et rend un `{ etat: 'ok' }`. Faire entrer l'un dans l'autre aurait demandé d'assouplir les deux.
 *
 * Les deux refus possibles sont DITS, parce qu'ils ne se réparent pas pareil : « mise à jour de la base » est
 * l'affaire d'Arno, « accès sans compte personnel » est la conséquence normale de la voie de secours.
 */
async function marquerLecture(
  filId: number, lu: boolean, onGeste: Rapport, onLecture?: (filId: number, lu: boolean) => void,
): Promise<void> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/lecture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lu }),
    });
    const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string; erreur?: string };
    if (d.etat !== 'ok') { onGeste(d.message ?? d.erreur ?? 'Marquage impossible.'); return; }
    onGeste(lu
      ? 'Échange marqué comme lu.'
      : 'Échange marqué comme non lu. Il reste en gras dans la liste jusqu’à ce que vous le rouvriez.');
    onLecture?.(filId, lu);
  } catch {
    onGeste('Marquage impossible : le serveur n’a pas répondu.');
  }
}

export function Conversation({ filId, maintenant, onGeste, onFerme, avecBandeau = true, barreActions = false, onClassement, redaction = null, onLecture, voieInitiale = null, messageVise = null, brouillonRepris = null, onFicheAnnuaire, onHistorique, onRouvrirBrouillon, onClassementChange }: {
  filId: number;
  /**
   * 🔴 LOT LIGNE-NON-ENVOYE — rouvre le brouillon d'un mail de cet échange qui n'est pas parti. Absent ⇒ la
   * capsule s'affiche quand même, avec sa cause : savoir qu'un mail manque vaut mieux que ne rien savoir, même
   * sans le geste pour le reprendre.
   */
  onRouvrirBrouillon?: (brouillonId: number) => void;
  /**
   * ══ 🔴 LOT MESSAGE-CLIQUÉ — LE MESSAGE QU'ON VENAIT LIRE ═══════════════════════════════════════════════════════
   * Celui que la ligne cliquée représentait : le dernier reçu sous « Réception », le dernier envoyé sous
   * « Envoyés », le message trouvé dans une recherche, celui de la frise dans l'historique. Il est DÉPLIÉ, son corps
   * est chargé s'il ne l'est pas déjà, et il est AMENÉ À L'ÉCRAN. Les autres messages du fil restent au-dessus et en
   * dessous, repliés et cliquables, dans l'ordre de lecture choisi.
   *
   * ⚠️ `null` (le défaut) = le dernier message lisible, mot pour mot le comportement d'avant ce lot. C'est le cas de
   * tous les écrans qui ouvrent une conversation sans savoir quel message montrer (une carte, un brouillon).
   */
  messageVise?: number | null;
  /**
   * 🔴🔴 LOT BROUILLONS-GMAIL — LE BROUILLON À ROUVRIR DANS CETTE CONVERSATION.
   *
   * Constat d'Arno : cliquer un brouillon de réponse ouvrait la conversation SANS l'éditeur. Il arrive désormais
   * par l'adresse (`?fil=…&message=…&brouillon=…`), et l'éditeur se rouvre sous le message auquel il répond,
   * pré-rempli de tout ce qui avait été enregistré. `null` = on n'en rouvre aucun.
   */
  brouillonRepris?: number | null;
  maintenant: Date;
  onGeste: Rapport;
  /** Optionnel : la boîte mail affiche un retour, une carte n'en a pas besoin. */
  onFerme?: () => void;
  /**
   * Le bandeau des fonctions maison. Éteint DANS UNE CARTE — et uniquement là : l'échange y porte déjà son propre menu,
   * visible même replié, et le dupliquer donnerait deux commandes identiques à dix pixels l'une de l'autre. Aucune
   * fonction n'est retirée : elles restent toutes à leur place d'avant, au même endroit et au même clic.
   */
  avecBandeau?: boolean;
  /**
   * LOT 5-GMAIL — LA BARRE D'ACTIONS, en plein écran. Les gestes qui vivaient dans le menu « ⋯ » deviennent des
   * BOUTONS visibles, façon messagerie : flèche de retour tout à gauche, puis les actions maison. Le menu « ⋯ »
   * reste, avec exactement les mêmes entrées — rien n'a été déplacé hors de portée.
   *
   * ⚠️ AUCUN bouton d'envoi (« Répondre », « Transférer ») : ils viendront avec le lot d'envoi. Un bouton grisé
   * qui promet une fonction inexistante fait perdre plus de temps qu'une absence.
   */
  barreActions?: boolean;
  /**
   * Classer / créer / déplacer : l'écran PARENT ouvre son propre partage (conversation à gauche, événements à
   * droite). Sans ce rappel, la barre retombe sur le panneau d'affectation en place — le comportement d'avant.
   */
  onClassement?: (voie: 'nouveau' | 'existant') => void;
  /**
   * LOT 5e — ce que l'écran sait de la rédaction : droit, schéma, connexion Google, signature, délai d'annulation.
   * ABSENT = aucun bouton d'écriture, et la conversation est exactement celle d'avant ce lot.
   */
  redaction?: ContexteRedactionEcran | null;
  /**
   * LOT 5-BOITE — prévient le parent qu'un marquage de lecture a eu lieu, POUR QUEL ÉCHANGE et dans quel sens. Le
   * parent met alors la liste à jour sur place : il n'a rien à redemander au serveur, qui vient déjà d'écrire.
   */
  onLecture?: (filId: number, lu: boolean) => void;
  /**
   * LOT 5-BOITE-3 — la voie demandée AVANT d'ouvrir la conversation : « Répondre » depuis le menu d'une LIGNE ouvre
   * l'échange ET son éditeur, sur le dernier message. Sans cela, le menu ne ferait qu'ouvrir l'échange et laisserait
   * la personne cliquer une seconde fois — ce qui n'est pas ce qu'on lui a promis.
   */
  voieInitiale?: VoieRedaction | null;
  /**
   * LOT ANNUAIRE-1 — ouvre la fiche d'annuaire d'un expéditeur reconnu. Absent = l'encart s'affiche mais ne mène
   * nulle part (cas d'une conversation rendue DANS une carte, où l'on ne veut pas quitter la carte d'un clic).
   */
  onFicheAnnuaire?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique d'une cible, depuis une étiquette du bandeau « Rattaché à ». Absent =
   * les étiquettes restent du texte (cas d'une conversation rendue DANS une carte, d'où l'on ne veut pas partir).
   */
  onHistorique?: (cible: Cible) => void;
  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — « LE CLASSEMENT DE CET ÉCHANGE VIENT DE CHANGER » ═══════════════
   *
   * LE DÉFAUT QU'IL CORRIGE, constaté par Arno le 03/10/2026 sur le fil 36691 (« augustin », Mira Bercier).
   * Marquer l'échange « Interne » depuis le mail écrivait bien en base — vérifié, `gestion_fil_interne` id 49,
   * vivante — et la lecture de la liste rendait bien `interne: true`. Mais la LISTE, derrière la conversation,
   * n'est pas démontée au retour : elle est seulement MASQUÉE (`hidden` dans `PleinEcranBoite`, règle du lot
   * LISTE-PAGINATION qui préserve la page et la recherche). Elle affichait donc l'état d'AVANT le geste, et
   * « À classer » survivait à la décision qu'on venait de prendre.
   *
   * 🔴 CE RAPPEL N'EST PAS UN COMPTE RENDU. `onGeste` dit CE QU'ON A FAIT (une phrase, un bandeau) ; celui-ci dit
   * QUE LE STATUT A BOUGÉ, et il part aussi quand aucune phrase n'est affichée — par exemple quand
   * `EncartRattachement` a déjà écrit la sienne. Les mêler aurait fait deux bandeaux pour un seul geste.
   *
   * ⚠️ IL NE PORTE AUCUNE VALEUR, ET C'EST VOULU : le statut se RECALCULE côté serveur, par la même requête que la
   * liste. Faire voyager « le nouveau statut est Interne » serait une seconde écriture de la règle de priorité —
   * celle que `capsuleStatut` tient seule.
   *
   * ABSENT (le défaut : une conversation rendue dans une carte, dans l'écran partagé) ⇒ rien n'est signalé, et la
   * conversation est exactement celle d'avant ce lot. Ces écrans remontent leur liste au retour, qui se relit.
   */
  onClassementChange?: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [deplies, setDeplies] = useState<Set<number>>(new Set());
  /**
   * ══ 🔴 LOT FIL-LECTURE — DANS QUEL ORDRE ON LIT ═══════════════════════════════════════════════════════════════
   * Le plus récent en haut par défaut : c'est la dernière nouvelle qu'on vient lire, et elle était au BAS d'un
   * échange de douze messages. Le choix est mémorisé dans le navigateur (voir `lireOrdreMemorise`).
   *
   * ⚠️ LU APRÈS LE MONTAGE, PAS PENDANT. `localStorage` n'existe pas au rendu serveur : le lire à l'initialisation
   * ferait diverger l'hydratation (le serveur rendrait un ordre, le navigateur l'autre) et React s'en plaindrait.
   * On part donc du défaut, et on applique la mémoire dès qu'on est côté navigateur.
   */
  const [ordre, setOrdre] = useState<OrdreFil>(ORDRE_FIL_DEFAUT);
  useEffect(() => { setOrdre(lireOrdreMemorise()); }, []);
  const changerOrdre = () => {
    const suivant = ordreSuivant(ordre);
    setOrdre(suivant);
    memoriserOrdre(suivant);
  };
  /**
   * 🔴 LOT BIEN-RATTACHE — LA CARTE PORTE LE TEXTE **ET** LE HTML ASSAINI. Un mail sans texte n'est pas un mail
   * vide : 1 180 en base n'ont que de la mise en forme, et c'est elle qu'il faut montrer.
   */
  // 🔴🔴 LOT CADRE-ISOLE-MAILS — `cssMail` voyage avec le corps : c'est la feuille d'en-tête du mail, filtrée
  //   par le serveur, et elle n'est posée QUE dans le cadre isolé.
  const [corps, setCorps] = useState<Map<number,
    { texte: string | null; html: string | null; cssMail?: string }>>(new Map());
  const [affecter, setAffecter] = useState(false);
  const [deplacer, setDeplacer] = useState<number | null>(null);
  /** LOT 5e — le brouillon en cours d'écriture sous la conversation. `null` = on ne rédige pas. */
  const [brouillon, setBrouillon] = useState<BrouillonEcran | null>(null);
  /**
   * ══ 🔴 LOT REPONSE-VISIBLE — SOUS QUEL MESSAGE L'ÉDITEUR S'OUVRE ══════════════════════════════════════════════
   * `null` = sous la conversation entière, à la fin — c'est la place du pied de page, qui répond au message le plus
   * récent et le dit. Un identifiant = l'éditeur se rend DANS ce message, juste après son contenu : on répond à ce
   * qu'on est en train de lire, et on le voit sans avoir à chercher.
   *
   * 🔴 IL NE SE PERD RIEN. C'est le MÊME état `brouillon` qui voyage : changer de place ne crée pas un second
   * éditeur et n'efface pas ce qui est saisi. L'enregistrement automatique des brouillons, lui, n'a jamais dépendu
   * de l'endroit où l'éditeur est rendu.
   */
  const [brouillonSous, setBrouillonSous] = useState<number | null>(null);
  /**
   * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — CE DONT LA RÉPONSE À **CE** MESSAGE HÉRITE ═══════════════════════════════
   *
   * 🔴 ON HÉRITE DU MESSAGE AUQUEL ON RÉPOND, pas « de la conversation en général ». Un fil peut porter des
   * rattachements différents d'un mail à l'autre ; prendre leur union donnerait à la réponse des biens dont le
   * message qu'on a sous les yeux ne parle pas. « Interne », lui, porte sur l'ÉCHANGE (migration 281) : c'est
   * le seul des trois qui se lise au niveau du fil, et c'est voulu.
   *
   * ⚠️ MÊME RÈGLE QUE LA CAPSULE : un lien ne compte que s'il est CONFIRMÉ. Une proposition du moteur n'est pas
   * un classement — la reprendre en case verte ferait valider en silence ce que personne n'a tranché.
   *
   * ⚠️ SEULS LES LOTS SONT REPRIS. Les liens « propriétaire » et « locataire » comptent encore pour la capsule
   * d'un vieux mail, mais cette voie de création a été fermée (lot FICHE-RATTACHEMENT, migration 273) : on ne
   * va pas la rouvrir par la porte de l'héritage. La décision est dans le module pur.
   *
   * ⚠️ `null` NE VAUT PAS `false` : quand on ne sait rien (migration absente, lecture en échec), on n'hérite de
   * rien et l'obligation de classer s'applique — plutôt qu'un classement inventé.
   */
  const heritageDe = (messageId: number | null): ClassementHerite => classementHerite({
    biens: messageId === null ? [] : (rattachements?.get(messageId) ?? [])
      .filter((l) => l.statut === 'confirme')
      .map((l) => ({ sorte: l.cible.sorte, cle: l.cible.cle, id: l.cible.id, libelle: l.libelle })),
    filInterne: interne,
    messageHorsGestion: messageId === null ? null : horsGestion?.has(messageId) ?? null,
  });
  /** L'héritage pour une réponse au message le PLUS RÉCENT — c'est celui auquel répond le pied de la page. */
  const heritageDuDernier = (liste: readonly MessageDeFil[]): ClassementHerite =>
    heritageDe(liste.length > 0 ? liste[liste.length - 1].messageId : null);

  /** Ouvre la rédaction pour UN message précis, et la place sous lui. Un seul endroit pour les deux décisions. */
  const repondreA = (voie: VoieRedaction, m: MessageDeFil) => {
    if (redaction === null) return;
    setBrouillon(ouvrirRedaction(voie, [m], filId, redaction, maintenant, heritageDe(m.messageId)));
    setBrouillonSous(m.messageId);
    /* 🔴 ICI ON A DEMANDÉ L'ÉDITEUR : il s'amène sous les yeux, comme avant ce lot (lot REPONSE-VISIBLE). */
    setCalerLaReponse(true);
  };
  /**
   * LOT 5-FIDÈLE — l'état de chaque message DANS GMAIL (étoile, non lu). Relu à l'ouverture, jamais mémorisé en base :
   * quelqu'un de l'équipe peut étoiler depuis son téléphone pendant qu'on regarde l'écran.
   */
  const [gmail, setGmail] = useState<Map<number, { etoile: boolean; nonLu: boolean } | null>>(new Map());
  /**
   * LOT RATTACHEMENT-1 — les liens de CHAQUE mail de l'échange, demandés en UNE requête pour tout le monde.
   * `null` = migration 257 absente, ou lecture en échec : le bandeau ne s'affiche alors pas du tout, et le reste de
   * la conversation est exactement celui d'avant ce lot.
   */
  const [rattachements, setRattachements] = useState<Map<number, LienAffiche[]> | null>(null);
  /**
   * 🔴 LOT STATUT-HORS-GESTION — les mails de l'échange marqués « ne concerne aucun bien ».
   * `null` = on ne sait rien (migration 266 absente, ou lecture en échec) : aucune capsule grise n'est alors
   * rendue, plutôt qu'une capsule inventée.
   */
  const [horsGestion, setHorsGestion] = useState<Map<number, { motif: string | null }> | null>(null);
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — CET ÉCHANGE EST-IL MARQUÉ « INTERNE » ?
   *
   * ⚠️ UN BOOLÉEN POUR TOUT L'ÉCHANGE, et non une carte par message : la marque porte sur la CONVERSATION. C'est
   * exactement ce qui fait que la réponse d'un collègue hérite du statut sans aucun geste de plus — le défaut
   * qu'Arno a constaté (sa réponse s'affichait « À classer »).
   *
   * `null` = on ne sait rien (migration 281 absente, ou lecture en échec) : aucune capsule verte n'est alors
   * rendue, plutôt qu'une capsule inventée.
   */
  const [interne, setInterne] = useState<boolean | null>(null);
  /**
   * 🔴 POINT 7 — CE QUE LA BASE SAIT DE CHAQUE MAIL. Une entrée ABSENTE veut dire « personne ne s'est prononcé »,
   * et c'est alors la marque d'échange qui répond ; une entrée présente avec `vivante: false` veut dire « non »,
   * et le repli ne la contredit pas. Les deux ne se confondent jamais.
   */
  const [interneParMail, setInterneParMail] = useState<ReadonlyMap<number, { vivante: boolean }>>(new Map());
  /**
   * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LES PÉRIODES DE CETTE CONVERSATION ═══════════════════════════════════════
   *
   * Demande d'Arno (point 4) : « Entre deux mails, quand la période change, une fine ligne de séparation : “À
   * partir d'ici : 10 rue Chateaubriand — Parking”, avec la date et qui l'a décidé. Un mail en exception porte
   * une petite mention “exception : <biens>” dans son en-tête. »
   *
   * `null` = migration 290 absente, ou lecture en échec : aucun repère n'est rendu, et le fil est exactement
   * celui d'avant ce lot. Lecture SILENCIEUSE, comme les rattachements : une erreur rouge au-dessus d'un mail
   * ferait croire que le mail lui-même a un problème.
   */
  const [suivi, setSuivi] = useState<{
    periodes: Periode[]; exceptions: ExceptionMail[]; mails: number[];
  } | null>(null);
  /* ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — LE RÉCAPITULATIF, LA VISIONNEUSE, LE RANGEMENT ═══════════════════════
     Les trois vivent ICI, au niveau de la conversation, et pas dans le bloc de pièces d'un message : le tour de
     « Précédent / Suivant » couvre TOUTES les pièces de l'échange, et un bloc de message n'en connaît qu'un. */
  /** La fenêtre « Pièces jointes de la conversation » est-elle ouverte ? */
  const [recapPieces, setRecapPieces] = useState(false);
  /** L'ordre du récapitulatif. Local à l'écran : rien à mémoriser, la fenêtre s'ouvre et se ferme. */
  const [ordrePieces, setOrdrePieces] = useState<OrdrePieces>(ORDRE_PIECES_DEFAUT);
  /** La pièce affichée dans la visionneuse. `null` = elle est fermée. */
  const [pieceVue, setPieceVue] = useState<number | null>(null);
  /** La pièce qu'on est en train de ranger. `null` = la fenêtre Drive n'est pas ouverte. */
  const [rangerPiece, setRangerPiece] = useState<PieceARanger | null>(null);
  /**
   * 🔴 CE QUI EST DÉJÀ DANS LE DRIVE, POUR TOUT L'ÉCHANGE, en UNE requête. Une par message aurait fait douze
   * allers-retours à l'ouverture d'une fenêtre qui s'ouvre d'un clic.
   *
   * ⚠️ VIDE TANT QU'ON N'EN A PAS BESOIN : la requête ne part qu'à l'ouverture du récapitulatif ou de la
   * visionneuse. Lire une conversation ne doit rien coûter de plus qu'avant ce lot.
   */
  const [depotsFil, setDepotsFil] = useState<ReadonlyMap<number, DepotAffiche>>(new Map());
  /**
   * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — OÙ CHAQUE CONTENU SE TROUVE DÉJÀ, pour tout l'échange.
   *
   * ⚠️ IL ARRIVE PAR LA MÊME REQUÊTE QUE `depotsFil`, et c'est la contrainte d'Arno : « une seule requête, sans
   * appel Google ». Deux `fetch` auraient aussi pu se répondre dans le désordre, et la fenêtre aurait affiché un
   * picto pour une liste de pièces qui n'était plus celle-là.
   */
  const [emplacementsFil, setEmplacementsFil] =
    useState<ReadonlyMap<number, readonly EmplacementPiece[]>>(new Map());
  /** L'emplacement qu'on vient de demander à voir dans notre fenêtre Drive. `null` = aucune fenêtre ouverte. */
  const [emplacementAVoir, setEmplacementAVoir] = useState<EmplacementPiece | null>(null);
  const relireDepotsFil = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/gestion/fils/${filId}/pieces-drive`, { cache: 'no-store' });
      const d = (await res.json()) as { depots?: DepotAffiche[]; emplacements?: StatutPieceDrive[] };
      setDepotsFil(new Map((d.depots ?? []).map((x) => [x.pieceId, x])));
      setEmplacementsFil(new Map((d.emplacements ?? []).map((x) => [x.pieceId, x.emplacements])));
    } catch {
      // Silence volontaire : on perd la mention « Dans le Drive », jamais la liste des pièces.
      setDepotsFil(new Map());
      setEmplacementsFil(new Map());
    }
  }, [filId]);
  /**
   * ⚠️ LA DÉPENDANCE EST UN BOOLÉEN, ET C'EST NÉCESSAIRE : avec `pieceVue` lui-même, chaque « Suivant » aurait
   * relancé la requête. Ce qu'on veut, c'est une lecture au moment où l'une des deux fenêtres s'ouvre.
   */
  const piecesRegardees = recapPieces || pieceVue !== null;
  useEffect(() => { if (piecesRegardees) void relireDepotsFil(); }, [piecesRegardees, relireDepotsFil]);

  /**
   * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LE RÉCAPITULATIF RELIT, LUI AUSSI, QUAND UNE AUTRE FENÊTRE A RANGÉ ═════
   *
   * L'autre moitié du constat d'Arno : ranger depuis la carte d'une pièce DANS le mail laissait le récapitulatif
   * « Pièces jointes de la conversation » sur son image d'avant, exactement comme l'inverse laissait la carte du
   * mail sur la sienne. Deux caches indépendants, chacun rafraîchi par sa seule fenêtre.
   *
   * ⚠️ ON NE RELIT QUE SI L'UNE DES DEUX FENÊTRES DE PIÈCES EST OUVERTE : le reste du temps, cette lecture ne sert
   * à rien — c'est déjà la règle de l'effet juste au-dessus, et elle ne change pas.
   *
   * ⚠️ SANS FILTRE SUR LES PIÈCES, et c'est voulu : la lecture porte sur TOUT l'échange (`/fils/[id]/pieces-drive`),
   * donc n'importe quelle pièce de n'importe lequel de ses messages la concerne.
   */
  useEffect(() => {
    if (!piecesRegardees) return undefined;
    return ecouterPiecesDrive(() => { void relireDepotsFil(); });
  }, [piecesRegardees, relireDepotsFil]);

  /**
   * @param o.silencieux LOT RANGER-INSTANTANE-ET-NOM — relire SANS vider l'écran.
   *
   * 🔴 POURQUOI IL A FALLU L'AJOUTER. Une pièce renommée puis rangée change de nom PARTOUT : la base fait foi, et
   * l'écran doit la relire. Mais passer par « chargement » pour un simple changement de nom ferait clignoter la
   * conversation entière derrière la fenêtre de rangement, pendant qu'on est encore en train de ranger.
   *
   * ⚠️ ON REMPLACE SEULEMENT SI LA LECTURE ABOUTIT : un réseau muet doit laisser l'écran tel qu'il est, pas le
   * remplacer par une erreur alors que ce qu'on affichait était juste.
   */
  const recharger = useCallback(async (o: { silencieux?: boolean } = {}) => {
    if (o.silencieux !== true) setVue({ v: 'charge' });
    const r = await chargerConversation(filId);
    if (o.silencieux === true && r.v !== 'ok') return;
    setVue(r);
    if (r.v !== 'ok') return;
    /**
     * 🔴 LOT MESSAGE-CLIQUÉ — ON DÉPLIE LE MESSAGE VISÉ, et à défaut le dernier (voir `messagesDeplies`).
     *
     * ⚠️ ET ON VA CHERCHER SON CORPS. Le serveur n'envoie le texte complet QUE du dernier message : pour tous les
     * autres, `corps` est `null`, ce qui ne veut pas dire « vide » mais « pas encore demandé ». Sans cette lecture,
     * viser un message qui n'est pas le dernier l'ouvrirait sur un corps vide — l'écran donnerait donc une réponse
     * FAUSSE (« ce message n'a pas de texte ») là où il suffisait d'aller le chercher. `basculer` fait déjà
     * exactement cela quand on déplie à la main ; on ne fait ici que l'appliquer à l'ouverture.
     */
    const deplie = messagesDeplies(r.messages, messageVise);
    setDeplies(deplie);
    /**
     * 🔴 LOT BIEN-RATTACHE — ET LA MISE EN FORME AUSSI. Un mail dont le corps n'existe qu'en HTML tombait ici dans
     * `html_a_charger` et n'était JAMAIS demandé : l'écran restait sur sa mention d'attente. C'est exactement ce
     * qu'Arno a vu sur le fil 36494 — 1 487 caractères de HTML en base, et rien à l'écran.
     */
    const aCharger = r.messages.filter((m) => {
      if (!deplie.has(m.messageId)) return false;
      const e = etatCorps(m);
      return e.v === 'a_charger' || e.v === 'html_a_charger';
    });
    for (const m of aCharger) {
      const c = await chargerCorps(m.messageId);
      setCorps((s) => new Map(s).set(m.messageId, c ?? { texte: null, html: null }));
    }
  }, [filId, messageVise]);

  useEffect(() => { void recharger(); }, [recharger]);

  /**
   * ══ 🔴 LOT MESSAGE-CLIQUÉ — AMENER LE MESSAGE VISÉ À L'ÉCRAN ════════════════════════════════════════════════════
   * Le déplier ne suffit pas : dans un fil de douze messages, celui qu'on vient de cliquer peut être à mi-hauteur —
   * et il l'est d'autant plus que l'ordre de lecture est réglable (plus récent ou plus ancien d'abord), donc que sa
   * position n'est jamais celle qu'on croit. On le fait donc défiler jusqu'à lui.
   *
   * ⚠️ `block: 'nearest'` : la page ne bouge PAS si le message est déjà visible. Un défilement systématique
   * secouerait l'écran à chaque ouverture, y compris quand il n'y avait rien à faire.
   * ⚠️ APRÈS LA PEINTURE (`requestAnimationFrame`) : au moment de l'effet, le message vient d'être déplié et sa
   * hauteur définitive n'existe pas encore — on défilerait vers une position périmée.
   * ⚠️ TOUT EST FACULTATIF (`?.`) : `scrollIntoView` et `requestAnimationFrame` n'existent pas dans tous les
   * environnements de rendu (jsdom des tests, rendu serveur). Une conversation ne doit jamais refuser de s'afficher
   * parce qu'elle n'a pas pu défiler.
   */
  const filRef = useRef<HTMLOListElement | null>(null);
  const viseAmene = useRef<string | null>(null);
  useEffect(() => {
    if (messageVise === null || vue.v !== 'ok') return;
    const cle = `${filId}:${messageVise}`;
    if (viseAmene.current === cle) return;
    viseAmene.current = cle;
    const t = globalThis.requestAnimationFrame?.(() => {
      filRef.current?.querySelector(`[data-message="${messageVise}"]`)?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => { if (t !== undefined) globalThis.cancelAnimationFrame?.(t); };
  }, [messageVise, vue, filId]);

  /**
   * LES RATTACHEMENTS DE L'ÉCHANGE, en une requête.
   *
   * ⚠️ SILENCE VOLONTAIRE EN CAS D'ÉCHEC. Le rattachement est un renseignement ici : une erreur rouge au-dessus d'un
   * mail ferait croire que le mail lui-même a un problème. Le bandeau disparaît, et rien d'autre ne change.
   */
  const chargerRattachements = useCallback(async (ids: readonly number[]) => {
    if (ids.length === 0) { setRattachements(new Map()); setHorsGestion(new Map()); return; }
    try {
      const res = await fetch(`/api/admin/gestion/rattachements?messages=${ids.join(',')}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: Record<string, LienAffiche[]> };
      if (d.etat !== 'ok') { setRattachements(null); return; }
      setRattachements(new Map(Object.entries(d.data ?? {}).map(([k, v]) => [Number(k), v])));
    } catch {
      setRattachements(null);
    }
    /**
     * 🔴 LES MARQUES « HORS GESTION », DANS UNE LECTURE À PART ET SILENCIEUSE. À part, parce qu'elles vivent dans
     * une table dont la migration peut manquer ; silencieuse, parce qu'un échec ne doit retirer QUE la capsule
     * grise — le reste de la conversation n'a aucune raison d'en souffrir.
     */
    try {
      const res = await fetch(`/api/admin/gestion/hors-gestion?messages=${ids.join(',')}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: Record<string, { motif: string | null }> };
      setHorsGestion(d.etat !== 'ok' ? null
        : new Map(Object.entries(d.data ?? {}).map(([k, v]) => [Number(k), { motif: v.motif ?? null }])));
    } catch {
      setHorsGestion(null);
    }
  }, []);

  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — LA MARQUE « INTERNE » DE L'ÉCHANGE, dans une lecture à part et silencieuse.
   * À part, parce qu'elle vit dans une table dont la migration peut manquer ; silencieuse, parce qu'un échec ne
   * doit retirer QUE la capsule verte — le reste de la conversation n'a aucune raison d'en souffrir.
   */
  const chargerInterne = useCallback(async (fil: number | null) => {
    if (fil === null) { setInterne(false); return; }
    try {
      const res = await fetch(`/api/admin/gestion/interne?fils=${fil}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: Record<string, unknown> };
      setInterne(d.etat !== 'ok' ? null : Object.keys(d.data ?? {}).length > 0);
    } catch {
      setInterne(null);
    }
  }, []);

  /**
   * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » PAR MAIL ══════════════════════════════════
   *
   * La marque d'échange ci-dessus reste lue : elle est le REPLI. Ce qui s'ajoute est ce que la base sait de CHAQUE
   * mail — vivante, retirée, ou rien du tout — parce que ces trois états ne se lisent pas pareil (voir
   * `interneDuMail`). C'est la même forme que `chargerRattachements` : une requête pour toute la conversation.
   *
   * ⚠️ `sans_schema_message` (migration 297 non appliquée) LAISSE LA CARTE VIDE : la règle retombe alors sur le
   * repli, c'est-à-dire sur le comportement d'avant ce lot, sans qu'une ligne de rendu ait à le savoir.
   */
  const chargerInterneDesMails = useCallback(async (ids: readonly number[]) => {
    if (ids.length === 0) { setInterneParMail(new Map()); return; }
    try {
      const res = await fetch(`/api/admin/gestion/interne?messages=${ids.join(',')}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: Record<string, { vivante?: boolean }> };
      if (d.etat !== 'ok') { setInterneParMail(new Map()); return; }
      setInterneParMail(new Map(Object.entries(d.data ?? {})
        .map(([k, v]) => [Number(k), { vivante: v?.vivante === true }])));
    } catch { setInterneParMail(new Map()); }
  }, []);

  const idsMessages = vue.v === 'ok' ? vue.messages.map((m) => m.messageId) : [];
  // Une clé STABLE : sans elle, un tableau recréé à chaque rendu relancerait la requête en boucle.
  const cleMessages = idsMessages.join(',');
  useEffect(() => {
    void chargerRattachements(cleMessages === '' ? [] : cleMessages.split(',').map(Number));
    /* 🔴 POINT 7 — la marque « interne » de chaque mail, lue avec les rattachements : même clé stable, même rythme. */
    void chargerInterneDesMails(cleMessages === '' ? [] : cleMessages.split(',').map(Number));
  }, [cleMessages, chargerRattachements]);
  /**
   * ⚠️ UN EFFET À PART, ET SUR `filId` SEUL. La marque « Interne » porte sur l'ÉCHANGE : la relire à chaque
   * changement de la liste des messages la redemanderait pour rien, et la lier à `cleMessages` ferait repartir la
   * requête au moindre dépliage.
   */
  useEffect(() => { void chargerInterne(filId); }, [filId, chargerInterne]);

  /**
   * 🔴 LOT SUIVI-CONVERSATION — LE SUIVI, LU UNE FOIS PAR CONVERSATION. Comme « Interne », il porte sur
   * l'ÉCHANGE : le relire à chaque dépliage de message le redemanderait pour rien.
   */
  const chargerSuivi = useCallback(async (fil: number | null) => {
    if (fil === null) { setSuivi(null); return; }
    try {
      const res = await fetch(`/api/admin/gestion/suivi?fil=${fil}`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; periodes?: Periode[]; exceptions?: ExceptionMail[]; mails?: number[];
      };
      setSuivi(d.etat !== 'ok' ? null
        : { periodes: d.periodes ?? [], exceptions: d.exceptions ?? [], mails: d.mails ?? [] });
    } catch {
      setSuivi(null);
    }
  }, []);
  useEffect(() => { void chargerSuivi(filId); }, [filId, chargerSuivi]);

  /**
   * LOT 5-BOITE-3 — la voie demandée depuis la liste, appliquée UNE FOIS la conversation chargée : le brouillon se
   * prépare à partir du DERNIER message, qu'il faut donc avoir lu. `deja` empêche de rouvrir l'éditeur à chaque
   * rendu — et donc d'écraser ce que la personne est en train d'écrire.
   */
  const voieFaite = useRef<string | null>(null);
  useEffect(() => {
    if (voieInitiale === null || vue.v !== 'ok' || redaction === null) return;
    const cle = `${filId}:${voieInitiale}`;
    if (voieFaite.current === cle) return;
    voieFaite.current = cle;
    setBrouillon(ouvrirRedaction(voieInitiale, vue.messages, filId, redaction, maintenant,
      heritageDuDernier(vue.messages)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 🔴 `heritageDuDernier` lit les rattachements, qui
    //   arrivent par une autre requête : l'ajouter ferait rejouer cet effet dès leur arrivée, c'est-à-dire
    //   ÉCRASER ce que la personne est en train d'écrire (le défaut que `voieFaite` existe pour empêcher).
  }, [voieInitiale, vue, redaction, filId, maintenant]);

  /**
   * ══ 🔴🔴 LOT BROUILLONS-GMAIL — LES BROUILLONS VIVANTS DE CET ÉCHANGE ══════════════════════════════════════════
   *
   * Deux usages, une seule lecture :
   *   ① la MENTION ROUGE « Brouillon » sur le message concerné, comme dans Gmail — et elle s'affiche même quand on
   *      arrive par la Réception, sans être passé par la liste des brouillons ;
   *   ② le brouillon qu'on vient de cliquer (`brouillonRepris`), rouvert dans l'éditeur sous SON message.
   *
   * ⚠️ SILENCE EN CAS D'ÉCHEC : une conversation doit s'afficher même si la lecture des brouillons échoue. On perd
   * une mention, jamais le courrier.
   */
  const [brouillonsDuFil, setBrouillonsDuFil] = useState<BrouillonEnregistre[]>([]);
  const relireBrouillons = useCallback(async () => {
    if (redaction === null || !redaction.schemaPret) return;
    try {
      const res = await fetch(`/api/admin/gestion/brouillons?fil=${filId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as { brouillons?: BrouillonEnregistre[] };
      setBrouillonsDuFil(Array.isArray(d.brouillons) ? d.brouillons : []);
    } catch { /* on perd une mention, jamais le courrier */ }
  }, [filId, redaction]);
  useEffect(() => { void relireBrouillons(); }, [relireBrouillons]);

  /**
   * 🔴 LE BROUILLON CLIQUÉ, ROUVERT SOUS SON MESSAGE. C'est le défaut qu'Arno a nommé : la conversation s'ouvrait,
   * et l'éditeur n'y était pas — le brouillon devenait introuvable.
   *
   * ⚠️ UN SEUL ÉDITEUR PAR BROUILLON : `repriseFaite` retient ce qui a déjà été rouvert. Sans lui, chaque rendu
   * rouvrirait l'éditeur et écraserait ce qu'on est en train d'y écrire — et recliquer le même brouillon ramène
   * simplement sur l'éditeur existant au lieu d'en poser un second.
   */
  const repriseFaite = useRef<number | null>(null);
  useEffect(() => {
    if (brouillonRepris === null || vue.v !== 'ok' || redaction === null) return;
    if (repriseFaite.current === brouillonRepris) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/brouillons?id=${brouillonRepris}`, { cache: 'no-store' });
        if (!res.ok) return;
        const d = (await res.json()) as { brouillon?: BrouillonEnregistre | null };
        if (annule || !d.brouillon) return;
        repriseFaite.current = brouillonRepris;
        setBrouillon(reprendreBrouillon(d.brouillon));
        // Sous le message auquel il répond ; à défaut, au pied de la conversation, comme un message neuf.
        setBrouillonSous(d.brouillon.repondAMessageId);
        /* 🔴 UN BROUILLON CLIQUÉ DANS LA LISTE DES BROUILLONS EST UNE DEMANDE : c'est le défaut qu'Arno avait
           nommé (« la conversation s'ouvrait, et l'éditeur n'y était pas »). On l'amène donc sous les yeux. */
        setCalerLaReponse(true);
      } catch { /* un brouillon qu'on n'a pas pu relire ne doit pas casser la conversation */ }
    })();
    return () => { annule = true; };
  }, [brouillonRepris, vue, redaction]);

  /**
   * LOT 5-BOITE — OUVRIR UN ÉCHANGE LE MARQUE LU, POUR MOI. Comme dans une messagerie : c'est l'ouverture qui vaut
   * lecture, pas un bouton de plus à penser à cliquer.
   *
   * 🔴 IDEMPOTENT, ET C'EST INDISPENSABLE : cet effet part à CHAQUE affichage de la conversation. La route rejoue un
   * `ON CONFLICT … DO UPDATE` en base — ni doublon, ni erreur, ni ligne de journal.
   *
   * ⚠️ AUCUNE CONSÉQUENCE SI ÇA ÉCHOUE, et c'est voulu : la migration 250 peut ne pas être appliquée, l'accès peut
   * être celui de secours (sans compte personnel). Dans les deux cas la route répond « non disponible » et on se
   * tait — lire un mail ne doit jamais afficher une erreur pour une fonction d'agrément.
   */
  /**
   * ⚠️ LE RAPPEL PASSE PAR UNE RÉFÉRENCE, ET CE N'EST PAS UN DÉTAIL. `onLecture` est une fonction recréée à chaque
   * rendu du parent : la mettre dans les dépendances relancerait le marquage à chaque rendu, donc une requête par
   * rendu. L'effet ne dépend QUE de l'échange ouvert — c'est lui, et lui seul, qui définit « j'ai ouvert un mail ».
   */
  const rappelLecture = useRef(onLecture);
  rappelLecture.current = onLecture;

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        await fetch(`/api/admin/gestion/fils/${filId}/lecture`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lu: true }),
        });
        if (!annule) rappelLecture.current?.(filId, true);
      } catch { /* silence volontaire : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * LOT 5-FIDÈLE — L'ÉTAT GMAIL DE CHAQUE MESSAGE (étoile, non lu), relu À L'OUVERTURE et jamais mémorisé en base :
   * quelqu'un de l'équipe peut étoiler depuis son téléphone pendant qu'on regarde l'écran.
   *
   * ⚠️ EN SÉRIE, ET SEULEMENT DANS LA VUE EN PLEINE PAGE. Chaque message demande une recherche `rfc822msgid:` à
   * Gmail : cent requêtes en parallèle sur un fil de cent messages feraient étrangler la connexion par Google. Un
   * échec ne casse rien — l'étoile n'est simplement pas affichée, plutôt que montrée éteinte, ce qui mentirait.
   */
  useEffect(() => {
    if (!barreActions || vue.v !== 'ok') return;
    let annule = false;
    const aDemander = vue.messages.slice(0, 25).map((m) => m.messageId);
    void (async () => {
      for (const id of aDemander) {
        if (annule) return;
        try {
          const res = await fetch(`/api/admin/gestion/messages/${id}/gmail`, { cache: 'no-store' });
          if (!res.ok || annule) continue;
          const d = (await res.json()) as { etat?: { etoile: boolean; nonLu: boolean } | null };
          if (!annule && d.etat) setGmail((g) => new Map(g).set(id, d.etat ?? null));
        } catch { /* pas d'étoile affichée : voir l'encadré */ }
      }
    })();
    return () => { annule = true; };
  }, [barreActions, vue]);

  /**
   * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LA ZONE DE RÉPONSE SUIT LE MAIL, ET NE TRAÎNE JAMAIS DANS UNE LISTE ══
   *
   * CONSTAT D'ARNO (03/10/2026) : « j'ouvre un mail reçu, je clique Répondre, la zone s'ouvre sous le mail (OK) ;
   * je ferme le MAIL sans fermer la zone de réponse : la zone reste affichée dans la LISTE, intercalée entre les
   * lignes, sous la ligne du mail. C'est faux. »
   *
   * 🔴 LA CAUSE, LUE DANS LE CODE : `piedMessage` était rendu HORS du bloc `{ouvert && …}` de `MessageConversation`.
   * Replier le mail laissait donc l'éditeur accroché sous une LIGNE repliée, au milieu des autres lignes.
   *
   * 🔴 ON NE DÉMONTE PAS L'ÉDITEUR, ON DEMANDE SA FERMETURE — et la nuance est tout. Un démontage sec sauterait
   * `fermer()`, c'est-à-dire la règle qui ① enregistre ce qui a été saisi et ② abandonne un brouillon resté vide.
   * On passe donc par `fermetureDemandee`, la MÊME porte que la croix d'une fenêtre flottante : l'éditeur
   * enregistre, puis rend la main par `onFerme`. En attendant, il est CACHÉ, jamais retiré — exactement ce que
   * fait déjà `reduite` dans `Redaction`, et pour la même raison.
   */
  const [fermetureReponse, setFermetureReponse] = useState(0);

  /**
   * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 1 — QUI A DEMANDÉ L'ÉDITEUR ? ════════════════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « ouvrir un mail qui a un brouillon de réponse en attente l'affiche comme un mail
   * normal, positionné au DÉBUT du mail, sans défilement automatique vers la zone de réponse. La zone de réponse
   * reste rouverte en bas avec le brouillon. »
   *
   * 🔴 L'ÉDITEUR S'AMÈNE SOUS LES YEUX QUAND ON L'A DEMANDÉ, et pas autrement. « Répondre », « Transférer », un
   * brouillon cliqué dans la liste des brouillons : ce sont des demandes, et le lot REPONSE-VISIBLE a mesuré
   * pourquoi il faut alors défiler (« un bouton dont l'effet est invisible est un bouton cassé »). OUVRIR UN MAIL
   * POUR LE LIRE n'en est pas une : la zone se rouvre en bas, et la page reste au début du mail.
   *
   * ⚠️ `false` NE VAUT QUE POUR CETTE OUVERTURE-LÀ : le drapeau redevient `true` à la demande suivante, sans quoi
   * un « Répondre » cliqué juste après n'amènerait plus nulle part.
   */
  const [calerLaReponse, setCalerLaReponse] = useState(true);
  /**
   * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LE MESSAGE QUI VIENT DE PARTIR À LA CORBEILLE ════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « Un bandeau “Message mis à la corbeille — Annuler” reste quelques secondes. Le
   * message disparaît de la conversation affichée. […] Jamais de suppression définitive. »
   *
   * 🔴 ON LE RETIRE DE L'AFFICHAGE SANS ATTENDRE LA RELECTURE, et c'est ce qui rend le geste franc : le mail
   * s'en va sous le doigt. La relecture du fil, elle, part en même temps et confirme — c'est la même règle de
   * deux temps que les compteurs de ce lot.
   *
   * ⚠️ `null` = aucun geste en cours. Le bandeau s'efface de lui-même après `DELAI_BANDEAU_CORBEILLE_MS`, ou
   * aussitôt qu'on annule.
   */
  const [messageJete, setMessageJete] = useState<{ messageId: number; de: string } | null>(null);
  /**
   * Les messages que CE geste vient de jeter, et qu'on retire donc de l'affichage.
   *
   * ⚠️ UN ENSEMBLE, PAS UN SEUL : on peut en jeter trois de suite avant que le bandeau du premier s'efface, et
   * ils doivent tous disparaître. Le bandeau, lui, ne parle que du dernier — c'est lui qu'on vient de faire.
   */
  const [jetes, setJetes] = useState<ReadonlySet<number>>(new Set());
  /**
   * « quelques secondes » (Arno). Dix : le temps de lire la phrase et d'atteindre « Annuler » sans se presser,
   * et c'est déjà le délai du bandeau de l'éditeur — un seul rythme dans tout le module.
   */
  useEffect(() => {
    if (messageJete === null) return undefined;
    const t = setTimeout(() => setMessageJete(null), DELAI_BANDEAU_CORBEILLE_MS);
    return () => clearTimeout(t);
  }, [messageJete]);

  async function basculer(m: MessageDeFil) {
    const ouvert = deplies.has(m.messageId);
    /* 🔴 ON REPLIE LE MAIL QUI PORTE L'ÉDITEUR : on demande sa fermeture, il enregistre, et il s'en va. */
    if (ouvert && brouillonSous === m.messageId) setFermetureReponse((n) => n + 1);
    /**
     * 🔴🔴 ON DÉPLIE UN MAIL QUI A UN BROUILLON EN ATTENTE : sa zone de réponse se rouvre AVEC CE BROUILLON.
     *
     * RÈGLE D'ARNO : « quand on rouvre ce mail, la zone de réponse est rouverte sous le mail, avec le brouillon
     * prêt à compléter (MÊME brouillon, pas un doublon). »
     *
     * ⚠️ ON REPREND LE BROUILLON EXISTANT (`reprendreBrouillon`), on n'en ouvre pas un neuf : son identifiant
     * voyage avec lui, donc l'enregistrement suivant écrit la MÊME ligne. C'est ce qui empêche un doublon à
     * chaque réouverture.
     *
     * ⚠️ ET SEULEMENT SI AUCUN ÉDITEUR N'EST DÉJÀ OUVERT : on ne remplace jamais ce qu'on est en train d'écrire.
     */
    if (!ouvert && brouillon === null && redaction !== null) {
      const sien = brouillonsDuFil.find((b) => b.repondAMessageId === m.messageId);
      if (sien !== undefined) {
        setBrouillon(reprendreBrouillon(sien));
        setBrouillonSous(m.messageId);
        /* 🔴🔴 CETTE OUVERTURE-CI NE DEMANDAIT PAS L'ÉDITEUR : on le rouvre parce que le brouillon est vivant,
           pas pour y emmener. Voir `calerAVue` dans `Redaction`. */
        setCalerLaReponse(false);
      }
    }
    setDeplies((s) => { const n = new Set(s); if (ouvert) n.delete(m.messageId); else n.add(m.messageId); return n; });
    // On ne va chercher un corps qu'UNE fois, et seulement s'il en manque un : replier puis redéplier ne recharge rien.
    const chargeDe = (id: number) => corps.get(id);
    const e = etatCorps(m, chargeDe(m.messageId)?.texte, chargeDe(m.messageId)?.html);
    // 🔴 DEUX ÉTATS DEMANDENT UNE LECTURE : le texte pas encore arrivé, et la mise en forme pas encore demandée.
    if (!ouvert && (e.v === 'a_charger' || e.v === 'html_a_charger')) {
      const c = await chargerCorps(m.messageId);
      setCorps((s) => new Map(s).set(m.messageId, c ?? { texte: null, html: null }));
    }
    /**
     * 🔴🔴 « POSITIONNÉ AU DÉBUT DU MAIL » (Arno). On amène l'EN-TÊTE du mail qu'on vient d'ouvrir en haut de la
     * zone visible : c'est là que commence ce qu'on est venu lire.
     *
     * ⚠️ APRÈS LA MISE EN PAGE, et après le corps : un mail déplié fait dix fois la hauteur d'une ligne repliée,
     * et défiler avant qu'il ait sa taille viserait l'ancienne position.
     *
     * ⚠️ FACULTATIF PARTOUT (`?.`) : `requestAnimationFrame` et `scrollIntoView` n'existent pas dans tous les
     * environnements de rendu, et lire un mail ne doit jamais échouer faute d'avoir pu défiler.
     */
    if (!ouvert) {
      globalThis.requestAnimationFrame?.(() => {
        filRef.current?.querySelector(`[data-message="${m.messageId}"]`)?.scrollIntoView?.({ block: 'start' });
      });
    }
  }

  /**
   * ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — « ALLER AU MESSAGE » ══════════════════════════════════════════════════
   *
   * Arno : « Aller au message (ferme la modale et déplie le message dans le fil) ». Une pièce ne se comprend
   * souvent qu'avec le courrier qui l'accompagne — « de quoi parlait ce devis, déjà ? ».
   *
   * 🔴 ON DÉPLIE, ON NE BASCULE PAS. `basculer` refermerait le message s'il était DÉJÀ ouvert — et c'est
   * exactement le cas quand on vient d'ouvrir le récapitulatif depuis un message déplié. On aurait donc fermé
   * le message qu'on demandait à voir.
   *
   * ⚠️ ET ON VA CHERCHER SON CORPS : le serveur n'envoie le texte complet que du dernier message. Sans cette
   * lecture, le message s'ouvrirait sur un corps vide — donc sur une réponse FAUSSE (« ce message n'a pas de
   * texte ») là où il suffisait de le demander. Même règle que `basculer`, même fonction de lecture.
   *
   * ⚠️ LE DÉFILEMENT EST FACULTATIF PARTOUT (`?.`) : `requestAnimationFrame` et `scrollIntoView` n'existent pas
   * dans tous les environnements de rendu. Une conversation ne doit jamais refuser d'agir parce qu'elle n'a pas
   * pu défiler.
   */
  async function allerAuMessage(messageId: number) {
    setRecapPieces(false);
    setPieceVue(null);
    const m = (vue.v === 'ok' ? vue.messages : []).find((x) => x.messageId === messageId);
    if (m === undefined) return;
    setDeplies((s) => new Set(s).add(messageId));
    const c = corps.get(messageId);
    const e = etatCorps(m, c?.texte, c?.html);
    if (e.v === 'a_charger' || e.v === 'html_a_charger') {
      const lu = await chargerCorps(messageId);
      setCorps((s) => new Map(s).set(messageId, lu ?? { texte: null, html: null }));
    }
    globalThis.requestAnimationFrame?.(() => {
      filRef.current?.querySelector(`[data-message="${messageId}"]`)?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /**
   * ══ 🔴🔴 METTRE CE MESSAGE À LA CORBEILLE — ET POUVOIR LE DÉFAIRE ═════════════════════════════════════════════
   *
   * 🔴 LE MÊME MÉCANISME QUE LA CORBEILLE D'UN ÉCHANGE, synchronisé avec Gmail : une seule route, un seul
   * journal, une seule corbeille. Seule la DÉSIGNATION change — ce message, et non tout le fil.
   *
   * ⚠️ ON NE RETIRE RIEN TANT QUE LE SERVEUR N'A PAS DIT OUI. Retirer d'abord et remettre en cas d'échec ferait
   * clignoter un mail qui n'a jamais bougé, et laisserait croire une seconde qu'il est parti.
   *
   * 🔴 LES COMPTEURS SUIVENT (point 1 de ce lot) : `rechargerTout` relit la liste — la ligne quitte Réception,
   * « À classer » ou tout autre dossier si plus aucun message de l'échange n'y figure — et le delta fait monter
   * « Corbeille » tout de suite.
   */
  async function corbeilleDuMessage(m: MessageDeFil): Promise<void> {
    const r = await gesteCorbeilleMessage(m.messageId, true);
    if (!r.ok) { onGeste(r.message); return; }
    /**
     * 🔴 LE MAIL DISPARAÎT DE LA CONVERSATION AFFICHÉE (Arno), et c'est l'écran qui le retire : la lecture du fil
     * rend TOUS les messages de l'échange, et c'est ce qu'il faut — ouverte depuis la Corbeille, la conversation
     * doit justement montrer ce qui y est. Ce qu'on cache, c'est ce que CE geste vient de jeter.
     */
    setJetes((s) => new Set(s).add(m.messageId));
    setMessageJete({ messageId: m.messageId, de: m.deNom?.trim() || m.de });
    /**
     * ⚠️ PAS DE `rechargerTout` ICI, ET C'EST DÉLIBÉRÉ : il FERME l'échange (`filOuvert: null`), donc il
     * emporterait le bandeau « Annuler » avec lui — le geste ne serait plus défaisable. Les compteurs, eux,
     * suivent tout de suite (point 1), et la LIGNE quitte ses dossiers au battement suivant de l'écran vivant,
     * sans que rien ne saute sous les yeux.
     */
    onGeste('', { compteurs: DELTA_FIL_CORBEILLE });
  }

  /** LE GESTE INVERSE, par la même porte. « Annuler » n'est pas une seconde implémentation : c'est le retour. */
  async function annulerCorbeilleDuMessage(messageId: number): Promise<void> {
    const r = await gesteCorbeilleMessage(messageId, false);
    setMessageJete(null);
    if (!r.ok) { onGeste(r.message); return; }
    setJetes((s) => { const n = new Set(s); n.delete(messageId); return n; });
    onGeste('Message rétabli.', { compteurs: DELTA_FIL_RESTAURE });
  }

  async function toutDeplier(messages: readonly MessageDeFil[]) {
    setDeplies(new Set(messages.map((m) => m.messageId)));
    const manquants = messages.filter((m) => {
      const c = corps.get(m.messageId);
      const e = etatCorps(m, c?.texte, c?.html);
      return e.v === 'a_charger' || e.v === 'html_a_charger';
    });
    // En série, pas en parallèle : 102 requêtes d'un coup mettraient le serveur à genoux pour un geste de confort.
    for (const m of manquants) {
      const c = await chargerCorps(m.messageId);
      setCorps((s) => new Map(s).set(m.messageId, c ?? { texte: null, html: null }));
    }
  }

  if (vue.v === 'charge') return <p className="gst-info" role="status">Chargement de la conversation…</p>;
  if (vue.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{vue.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void recharger()}>Réessayer</button>
      </div>
    );
  }

  const { fil, messages, partis } = vue;
  /** La carte posée sur CE MAIL SEUL, quand il y en a une. `null` = il suit son échange, le cas ordinaire. */
  const carteDe = (messageId: number): { reference: string; libelle: string | null; evenementId: number | null } | null => {
    const p = partis.find((x) => x.messageId === messageId);
    return p === undefined ? null : { reference: p.reference, libelle: p.objetEvenement, evenementId: p.evenementId };
  };
  const rattache = fil.reference !== null;

  /* ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — CE QUE LA CONVERSATION PORTE COMME PIÈCES ═════════════════════════════
     Tout sort du module PUR : le compte du trombone et la liste de la fenêtre viennent du MÊME calcul, si bien
     qu'on ne peut pas lire « 7 pièces » en haut et en compter neuf en bas. */
  /**
   * 🔴🔴 LOT RECAP-SANS-DOUBLON — UN SEUL CALCUL POUR LE COMPTE ET POUR LA LISTE.
   *
   * Le fil 3494 annonçait « 30 pièces » pour 8 fichiers différents : les avis d'imposition reçus le 23/09 y
   * figuraient encore quatre fois, parce qu'ils ont été transférés, puis re-transférés. On garde la PREMIÈRE
   * apparition, et les autres deviennent des renvois sous sa vignette.
   *
   * ⚠️ LE COMPTE EST LA LONGUEUR DE LA LISTE, littéralement : c'est ce qui rend impossible de lire un nombre en
   * haut et d'en compter un autre en bas. `compterPiecesConversation` rend exactement la même chose pour qui n'a
   * pas la liste sous la main, et une épreuve tient les deux ensemble.
   */
  const recap = dedoublonnerPieces(piecesDeLaConversation(messages, ordrePieces));
  const piecesFil = recap.pieces;
  const nbPieces = piecesFil.length;
  /** La pièce affichée dans la visionneuse, retrouvée dans la liste classée. */
  const pieceAffichee = pieceVue === null ? undefined : piecesFil.find((p) => p.pieceId === pieceVue);
  /**
   * ══ 🔴 OUVRIR LA FENÊTRE « RANGER » SUR UNE PIÈCE ═══════════════════════════════════════════════════════════
   *
   * ⚠️ LA VISIONNEUSE SE FERME, ET C'EST NÉCESSAIRE — vu à l'écran le 30/09/2026. Elle vit au-dessus de la
   * fenêtre Drive (80 contre 70) : la laisser ouverte cachait entièrement l'arborescence qu'on venait justement
   * choisir, et le clic sur « Ranger dans le Drive » ne semblait rien faire.
   *
   * ⚠️ LE RÉCAPITULATIF, LUI, RESTE OUVERT dessous : une fois la pièce rangée, on revient à la liste sans avoir
   * à la rouvrir, au même endroit et dans le même ordre.
   */
  const ouvrirRangement = (p: PieceDeConversation) => {
    setPieceVue(null);
    setRangerPiece({
      pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime,
    });
  };
  /**
   * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — RENOMMER UNE PIÈCE DEPUIS LA VISIONNEUSE ════════════════════════════
   *
   * ⚠️ ON RELIT LE FIL APRÈS COUP, on ne bricole pas l'état local : le nom d'usage est écrit en base, et c'est
   * la base qui fait foi. Le corriger à la main ici donnerait un écran juste et une base qui ne l'est pas — et
   * la différence ne se verrait qu'au rechargement suivant.
   *
   * ⚠️ LES REFUS SE DISENT. Une copie qu'on n'a pas pu renommer (hors registre, dossier protégé, Drive muet)
   * n'est pas une panne du geste : la pièce EST renommée chez nous. On le dit, plutôt que de laisser croire que
   * tout a suivi.
   */
  const renommerLaPiece = async (pieceId: number, nom: string): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/gestion/pieces/${pieceId}/nom`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; message?: string; refus?: { motif: string }[];
      };
      if (d.etat !== 'ok') { onGeste?.(d.message ?? 'Le renommage n’a pas abouti.'); return; }
      const refus = d.refus ?? [];
      onGeste?.(refus.length === 0
        ? 'Pièce renommée — les copies du Drive portent le même nom.'
        : `Pièce renommée. ${refus.length} copie(s) du Drive n’ont pas suivi : ${refus[0].motif}`);
      await recharger();
    } catch {
      onGeste?.('Le renommage n’a pas abouti : le réseau n’a pas répondu.');
    }
  };

  /** Le trombone, écrit UNE fois et posé à deux endroits (en haut du fil, et au-dessus du pied de réponse). */
  const trombonePieces = <BoutonPiecesConversation nombre={nbPieces} onOuvrir={() => setRecapPieces(true)} />;

  /**
   * CE QUE LE CARTOUCHE DÉCLENCHE. Chaque geste passe par la route qui EXISTE — rien n'est réécrit, rien n'est
   * dupliqué : « classer », « changer l'affectation » et « créer » ouvrent le même panneau d'affectation que le
   * lot 4b (en place, ou dans le partage du plein écran quand l'écran parent en propose un), « classer sans suite »
   * et « rouvrir » appellent les deux verbes symétriques de `/fils/[id]/sans-suite`.
   */
  /**
   * LOT 5-FIDÈLE — CE QUE FAIT CHAQUE ENTRÉE DU MENU « ⋮ ». Trois natures, et aucune ne fait semblant :
   *   · `gmail`  — on demande à la vraie boîte (droit d'écriture relu en base côté serveur, et journal) ;
   *   · `lien`   — l'API de Gmail ne sait pas le faire : on ouvre le message DANS Gmail, et l'entrée le DIT ;
   *   · `maison` — c'est notre outil qui répond, sans rien demander à Google.
   */
  const agirSurLeMessage = async (a: ActionMessage, m: MessageDeFil) => {
    const ouvrirDansGmail = () => {
      const lien = lienGmail(redaction?.adresseGestion ?? 'gestion@criterimmo.fr', { messageIdRfc: m.messageIdRfc });
      if (lien === null) { onGeste('Impossible d’ouvrir ce message dans Gmail : son identifiant est inconnu.'); return; }
      window.open(lien, '_blank', 'noopener');
    };
    switch (a) {
      case 'repondre': case 'repondre_tous': case 'transferer':
        repondreA(a, m);
        return;
      // Ces quatre-là, Gmail ne les expose pas : on y emmène, et l'entrée l'annonce déjà en toutes lettres.
      case 'partager_chat': case 'hameconnage': case 'illegal': case 'traduire':
        ouvrirDansGmail(); return;
      case 'filtrer_similaires':
        onGeste(`Recherche des messages de ${m.de} — ouvrez la boîte et collez « ${m.de} » dans le champ de recherche.`);
        return;
      case 'imprimer':
        window.print(); return;
      case 'telecharger':
        window.open(`/api/admin/gestion/messages/${m.messageId}/original?telecharger=1`, '_blank', 'noopener'); return;
      case 'afficher_original':
        window.open(`/api/admin/gestion/messages/${m.messageId}/original`, '_blank', 'noopener'); return;
      default: break;
    }
    // Les trois actions qui MODIFIENT Gmail. Une confirmation d'abord quand l'entrée en demande une.
    const entree = menuMessage({ nomExpediteur: m.deNom?.trim() || m.de }).find((e) => e.cle === a);
    if (entree?.confirmation && !window.confirm(entree.confirmation)) return;
    try {
      const res = await fetch(`/api/admin/gestion/messages/${m.messageId}/gmail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: a }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string; etat?: { etoile: boolean; nonLu: boolean } | null };
      if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Action impossible.'); return; }
      if (d.etat) setGmail((g) => new Map(g).set(m.messageId, d.etat ?? null));
      onGeste(d.message ?? 'C’est fait.');
    } catch {
      onGeste('Action impossible : le serveur n’a pas répondu.');
    }
  };

  /** L'ÉTOILE : elle bascule, exactement comme le clic de Gmail — on ne décide pas à sa place ce qu'elle doit devenir. */
  const basculerEtoile = async (m: MessageDeFil) => {
    try {
      const res = await fetch(`/api/admin/gestion/messages/${m.messageId}/gmail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'etoile' }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string; etat?: { etoile: boolean; nonLu: boolean } | null };
      if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Action impossible.'); return; }
      if (d.etat) setGmail((g) => new Map(g).set(m.messageId, d.etat ?? null));
    } catch {
      onGeste('Action impossible : le serveur n’a pas répondu.');
    }
  };

  const agirSurLeStatut = (a: ActionStatut) => {
    if (a === 'classer' || a === 'changer') { if (onClassement) onClassement('existant'); else setAffecter(true); return; }
    if (a === 'creer') { if (onClassement) onClassement('nouveau'); else setAffecter(true); return; }
    if (a === 'sans_suite') {
      void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'POST',
        'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', onGeste, () => void recharger());
      return;
    }
    void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'DELETE',
      'Échange rouvert : il est revenu dans la file.', onGeste, () => void recharger());
  };
  const tousDeplies = messages.length > 0 && messages.every((m) => deplies.has(m.messageId));

  /**
   * 🔴 LOT SUIVI-CONVERSATION — LES REPÈRES, décidés par le module PUR. `suivi === null` (migration 290 absente
   * ou lecture en échec) ⇒ aucune ligne, et le fil est exactement celui d'avant ce lot.
   */
  const reperes = suivi === null ? [] : reperesDuFil(suivi.mails, suivi.periodes);
  /** Le mot d'une exception, pour l'en-tête du mail qui la porte. `null` = ce mail n'en porte pas. */
  const exceptionDe = (messageId: number): string | null => {
    const e = suivi?.exceptions.find((x) => x.messageId === messageId);
    return e === undefined ? null : motClassement(e.classement);
  };

  return (
    <section className="cnv" aria-labelledby={`cnv-titre-${fil.filId}`}>
      {/* 🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — la feuille de la pastille « i » : le repère emploie LA pastille
          des biens, et elle a besoin de son style. Montée ici, jamais dans la pastille (voir son encadré). */}
      <style>{CSS_CONVERSATION}{CSS_PIECES}{CSS_PIECES_CONVERSATION}{CSS_INFO_BIEN}</style>

      {/* ══ LE BANDEAU DU HAUT : NOS FONCTIONS MAISON ══════════════════════════════════════════════════════════════
          Elles appellent les routes EXISTANTES, sans réécrire une ligne de leur logique — donc même journal, même
          réversibilité, mêmes garanties qu'avant ce lot. */}
      {avecBandeau && (
      <div className={`cnv-bandeau${barreActions ? ' cnv-bandeau--barre' : ''}`}>
        <div className="cnv-bandeau-haut">
          {/* LA SORTIE, TOUJOURS EN PREMIER. En plein écran c'est une FLÈCHE, comme dans une messagerie — mais une
              flèche muette n'est pas un bouton : le libellé accessible est écrit, et la cible fait 44 px. C'est le
              MÊME geste que le « ← Retour » d'avant, au même endroit. */}
          {onFerme && (barreActions
            ? (
              <button type="button" className="cnv-retour" aria-label="Retour à la liste" title="Retour à la liste"
                onClick={onFerme}>
                <span aria-hidden="true">←</span>
              </button>
            )
            : <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>← Retour</button>)}
          {fil.reference && <span className="cnv-ref">{fil.reference}</span>}
          {fil.etat === 'sans_suite' && <span className="cnv-etiquette">classé sans suite</span>}

          {/* ══ LOT 5-STATUT — LA BARRE NE PORTE PLUS LES TROIS BOUTONS DE CLASSEMENT ═══════════════════════════════
              « Classer dans une carte », « Créer un événement » et « Classer sans suite » ont quitté cette barre
              (décision d'Arno du 24/09/2026 — le seul retrait de ce lot). Ils vivent désormais DANS LE CARTOUCHE DE
              STATUT, à gauche de la date de chaque message : là où l'on voit d'abord où en est l'échange, et donc là
              où l'on décide de le changer. La flèche de retour et le menu « ⋯ » restent ici, et le menu conserve
              TOUTES ses entrées — « Détacher » comprise. Rien n'est devenu inatteignable. */}

          <span className="cnv-menu">
            <MenuDiscret titre="Actions sur cet échange" entrees={[
              // LOT 5-FUSION-B — « Classer dans une carte » remplace « Affecter » ici aussi : un seul mot pour un
              //   seul geste, dans tout le module. La route et le journal sont inchangés.
              ...(rattache ? [] : [{ libelle: `${LIBELLE_CLASSER}…`, onChoisir: () => (onClassement ? onClassement('existant') : setAffecter(true)) }]),
              ...(rattache ? [{
                libelle: 'Détacher l’échange',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/affectation`, 'DELETE',
                  'Échange détaché : il est revenu dans la file, avec tous ses messages.', onGeste, () => void recharger()),
              }] : []),
              // LOT 5-BOITE — LU / NON LU, réversible dans les deux sens. « Marquer comme non lu » est le geste qui
              //   compte : c'est ainsi qu'on se garde un mail sous le coude après l'avoir ouvert par erreur. Il vit
              //   dans le menu « ⋯ » de l'échange, à côté des autres gestes réversibles, et n'en déplace aucun.
              {
                libelle: 'Marquer comme non lu',
                onChoisir: () => void marquerLecture(fil.filId, false, onGeste, onLecture),
              },
              {
                libelle: 'Marquer comme lu',
                discrete: true,
                onChoisir: () => void marquerLecture(fil.filId, true, onGeste, onLecture),
              },
              ...(fil.etat === 'a_classer' ? [{
                libelle: 'Classer sans suite',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'POST',
                  'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', onGeste, () => void recharger()),
              }] : [{
                libelle: 'Rouvrir l’échange',
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'DELETE',
                  'Échange rouvert : il est revenu dans la file.', onGeste, () => void recharger()),
              }]),
            ]} />
          </span>
        </div>
        <h2 className="cnv-titre" id={`cnv-titre-${fil.filId}`}>{nettoyerObjet(fil.objet) || '(sans objet)'}</h2>
        <p className="cnv-compte">
          {messages.length} message{messages.length > 1 ? 's' : ''}
          {messages.length > 1 && (
            <>
              {' · '}
              <button type="button" className="gst-lien-bouton"
                onClick={() => (tousDeplies ? setDeplies(new Set()) : void toutDeplier(messages))}>
                {tousDeplies ? 'Tout replier' : 'Tout déplier'}
              </button>
              {/* ══ LOT FIL-LECTURE — LE SÉLECTEUR D'ORDRE, discret, à côté de « Tout déplier » ════════════════
                  Il DIT l'ordre en cours plutôt que l'ordre qu'il donnerait : un bouton qui annonce ce qu'il va
                  faire oblige à réfléchir à chaque lecture. `aria-pressed` porte la même information au clavier. */}
              {' · '}
              <button type="button" className="gst-lien-bouton cnv-ordre"
                aria-pressed={ordre === 'recent'}
                title="Changer l’ordre de lecture des messages"
                onClick={changerOrdre}>
                {libelleOrdre(ordre)}
              </button>
            </>
          )}
          {/* ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — LE TROMBONE DU HAUT ════════════════════════════════════════
              Arno : « à côté de “N messages · Tout déplier · Plus récent d'abord” ». Il s'affiche même sur un
              échange d'UN SEUL message (donc sans « Tout déplier ») : une pièce à retrouver ne dépend pas du
              nombre de messages. Rien du tout quand il n'y a aucune pièce. */}
          {nbPieces > 0 && <>{' · '}{trombonePieces}</>}
        </p>
      </div>
      )}
      {/* Le compte et « tout déplier » restent accessibles même sans bandeau (dans une carte).
          ⚠️ LA LIGNE APPARAÎT AUSSI POUR UN SEUL MESSAGE QUI PORTE DES PIÈCES (lot PIECES-DE-LA-CONVERSATION) :
          sans cela, le trombone n'existait pas dans une carte sur un échange d'un seul message — c'est-à-dire
          précisément le cas le plus fréquent d'un mail avec une pièce jointe. */}
      {!avecBandeau && (messages.length > 1 || nbPieces > 0) && (
        <p className="cnv-compte">
          {messages.length} message{messages.length > 1 ? 's' : ''}
          {messages.length > 1 && (
            <>
              {' · '}
              <button type="button" className="gst-lien-bouton"
                onClick={() => (tousDeplies ? setDeplies(new Set()) : void toutDeplier(messages))}>
                {tousDeplies ? 'Tout replier' : 'Tout déplier'}
              </button>
              {' · '}
              <button type="button" className="gst-lien-bouton cnv-ordre" aria-pressed={ordre === 'recent'}
                title="Changer l’ordre de lecture des messages" onClick={changerOrdre}>
                {libelleOrdre(ordre)}
              </button>
            </>
          )}
          {nbPieces > 0 && <>{' · '}{trombonePieces}</>}
        </p>
      )}

      {/* LOT ANNUAIRE-1 — QUI NOUS ÉCRIT ? Rapproché par l'ADRESSE des expéditeurs REÇUS (jamais par le nom, jamais
          sur nos propres envois : se dire « propriétaire de… » à soi-même n'a pas de sens). N'affiche rien quand il
          n'a rien à dire — annuaire non installé, ou expéditeur inconnu. Aucun effet sur le classement. */}
      <EncartAnnuaire
        adresses={messages.filter((m) => m.sens === 'recu').map((m) => m.de)}
        onFiche={onFicheAnnuaire} />

      {affecter && (
        <PanneauAffecter filId={fil.filId} objet={fil.objet ?? undefined}
          onFait={(m) => { setAffecter(false); onGeste(m, { rechargerTout: true }); void recharger(); }}
          onAnnuler={() => setAffecter(false)} />
      )}

      {/* ══ LA CONVERSATION ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {/* 🔴 L'ORDRE EST UNE AFFAIRE D'AFFICHAGE, ET RIEN D'AUTRE. Le serveur rend toujours du plus ancien au plus
          récent ; `ordonnerMessages` ne fait que retourner la liste pour l'œil. Aucune requête ne change, et le
          message déplié à l'ouverture reste EXACTEMENT le même (le dernier lisible) — il est simplement en haut. */}
      {/* ══ 🔴 LOT LIGNE-NON-ENVOYE — UN MAIL DE CET ÉCHANGE N'EST PAS PARTI ═══════════════════════════════════
          Demande d'Arno : la même capsule que dans « Envoyés », mais ICI posée sur le message, avec la CAUSE et
          le lien « Rouvrir le brouillon ».

          🔴 EN TÊTE DU FIL, et non à la place où le message aurait dû être : il n'existe pas. Un message qui n'est
          jamais parti n'a ni date de remise, ni identifiant, ni place dans la conversation — lui en inventer une
          reviendrait à faire croire qu'il a existé. On DIT qu'il manque, là où on le cherche.

          ⚠️ ELLE DISPARAÎT D'ELLE-MÊME au renvoi réussi : la règle est dans la requête, pas ici. */}
      <BandeauEnvois filId={filId} onRouvrir={onRouvrirBrouillon} />

      <ol className="cnv-fil" ref={filRef}>
        {/**
          * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — « Message mis à la corbeille — Annuler » ══════════
          *
          * Mot pour mot la demande d'Arno. Il reste quelques secondes, puis s'efface de lui-même : un bandeau qui
          * resterait finirait par parler d'un geste qu'on ne se rappelle plus avoir fait.
          *
          * 🔴 « ANNULER » EST UN VRAI RETOUR, pas un simple masquage : il rappelle la même route dans l'autre
          * sens, et le mail revient dans Gmail comme chez nous.
          */}
        {messageJete !== null && (
          <p className="cnv-jete" role="status">
            <span className="cnv-jete-mot">{BANDEAU_MESSAGE_CORBEILLE}</span>
            <span className="cnv-jete-qui">{messageJete.de}</span>
            <button type="button" className="gst-lien-bouton"
              onClick={() => void annulerCorbeilleDuMessage(messageJete.messageId)}>Annuler</button>
          </p>
        )}
        {ordonnerMessages(messages.filter((m) => !jetes.has(m.messageId)), ordre).map((m) => (
          <Fragment key={m.messageId}>
          {/* ══ 🔴🔴 LOT SUIVI-CONVERSATION — « À PARTIR D'ICI : … » ════════════════════════════════════════
              Demande d'Arno : « Entre deux mails, quand la période change, une fine ligne de séparation […]
              avec la date et qui l'a décidé. »

              ⚠️ ELLE SE POSE AVANT LE MAIL QUI OUVRE LA PÉRIODE, et seulement là : c'est la définition d'une
              période (« à partir de ce mail, inclus »). La décision — quelles lignes, et laquelle sauter —
              vient du module PUR (`reperesDuFil`), qui écarte celle du premier mail : « À partir d'ici » en
              tête de conversation ne sépare rien.

              ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — ET LE CÔTÉ SUIT LE TRI ═══════════════════════
              Jusqu'ici la ligne était rendue AVANT son mail quel que soit l'ordre. En « Plus récent d'abord »,
              « avant » veut dire PLUS TARD : relevé à l'écran sur le fil 3490, le repère de la fenêtre du mail
              57368 (01/10 12:46) paraissait entre le 03/10 14:31 et lui, donc rattaché au mauvais mail.
              Il se pose désormais du côté qui PRÉCÈDE CHRONOLOGIQUEMENT (`coteDuRepere`). */}
          {coteDuRepere(ordre) === 'dessus' && reperes
            .filter((r) => r.avantMessageId === m.messageId)
            .map((r) => <LigneRepere key={`rep-${r.id}`} repere={r} suivi={suivi} cote="dessus"
              interneDeLEchange={interne === true}
              /* 🔴 LE MAIL QUI OUVRE LA FENÊTRE, pour le pied de la modale : c'est CE mail-ci, celui
                 que le repère annonce. Aucune recherche, aucune requête — il est déjà là. */
              mail={m} />)}
          <MessageConversation message={m} maintenant={maintenant} filId={filId}
            /* 🔴 LOT SUIVI-CONVERSATION — « Un mail en exception porte une petite mention “exception : <biens>”
               dans son en-tête. » Le mot vient du module pur : trois sortes, une seule façon de les écrire. */
            exception={exceptionDe(m.messageId)}
            ouvert={deplies.has(m.messageId)}
            corpsCharge={corps.get(m.messageId)?.texte}
            htmlCharge={corps.get(m.messageId)?.html}
            /* 🔴🔴 LOT CADRE-ISOLE-MAILS — la feuille d'en-tête du mail, pour son cadre isolé. */
            cssMailCharge={corps.get(m.messageId)?.cssMail}
            onBasculer={() => void basculer(m)}
            /* 🔴 LOT CONTACTS-ET-EVENEMENT — LE CARTOUCHE REFLÈTE LE BLOC « Événement rattaché », y compris quand
               la carte est posée SUR CE MAIL SEUL. `partis` porte déjà ces mails (le serveur les rend depuis
               toujours) ; sans cette ligne, on liait un mail à une carte et son cartouche continuait d'afficher
               celle de l'échange — ou « aucun ». `statutDuMessage` sait déjà trancher : le mail prime sur son fil. */
            statut={statutDuMessage(fil, { ...m, carteDuMail: carteDe(m.messageId) })}
            onActionStatut={agirSurLeStatut}
            gmail={{ etat: gmail.get(m.messageId) ?? null }}
            onEtoile={barreActions && redaction ? () => void basculerEtoile(m) : undefined}
            onRepondre={barreActions && redaction ? (voie) => repondreA(voie, m) : undefined}
            onActionMessage={barreActions ? (a) => void agirSurLeMessage(a, m) : undefined}
            /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — la grande corbeille du bloc d'en-tête. Elle ne
               s'affiche que là où les gestes sont permis, comme l'étoile et « Répondre » juste au-dessus. */
            onCorbeilleMessage={barreActions ? () => void corbeilleDuMessage(m) : undefined}
            /* 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — LE GESTE INVERSE, PAR LA MÊME PORTE.
               `annulerCorbeilleDuMessage` EST `gesteCorbeilleMessage(id, false)` : c'est déjà ce qu'« Annuler »
               appelle. Le bouton de l'en-tête ne fait donc rien de neuf — il offre ce geste là où il manquait. */
            onReintegrerMessage={barreActions ? () => void annulerCorbeilleDuMessage(m.messageId) : undefined}
            onDeplacer={() => setDeplacer(m.messageId)}
            onRemettre={() => void agirSurLeMail(m.messageId, null, onGeste)}
            /* LOT RATTACHEMENT-1 — « Rattaché à … », dans le mail OUVERT. `null` = 257 absente : aucun bandeau. */
            rattachements={rattachements === null ? null : (rattachements.get(m.messageId) ?? [])}
            horsGestion={horsGestion === null ? null : (horsGestion.get(m.messageId) ?? false)}
            /**
             * ══ 🔴🔴 POINT 7 — LE STATUT DE **CE** MAIL, AVEC L'ÉCHANGE EN REPLI ═══════════════════════════════
             *
             * Avant ce lot, la marque d'ÉCHANGE était la même pour tous les messages — et c'est précisément ce
             * qui rendait impossible « Interne du mail 1 au mail 4, puis plus » (constat du commit 559d394a).
             * Depuis le câblage de la migration 297, chaque mail porte son statut, et la marque d'échange ne
             * répond que si personne ne s'est prononcé sur ce mail-là.
             *
             * ⚠️ `null` RESTE `null` : « on ne sait rien » (migration 281 absente, ou lecture en échec) n'est pas
             * « ce mail n'est pas interne ». La capsule ne s'affiche alors pas, au lieu d'affirmer un état.
             */
            interne={interne === null ? null : interneDuMail({
              marqueDuMailVivante: interneParMail.get(m.messageId)?.vivante === true,
              marqueDuMailConnue: interneParMail.has(m.messageId),
              marqueDeLEchange: interne === true,
            })}
            onInterne={async (actif) => {
              if (filId === null) return;
              await fetch('/api/admin/gestion/interne', {
                method: actif ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                /**
                 * 🔴🔴 POINT 7 — LE GESTE EMPORTE SA PORTÉE. La case du bandeau a toujours porté sur l'ÉCHANGE :
                 * son choix reste donc « toute la conversation », et les mails de l'échange partent avec, dans
                 * l'ORDRE CHRONOLOGIQUE, pour que la route sache lesquels couvrir. Les trois fenêtres plus fines
                 * passent, elles, par le bloc « Suivi dans la conversation » — que la projection applique
                 * désormais mail par mail.
                 */
                body: JSON.stringify({
                  filIds: [filId], messageId: m.messageId, mails: idsMessages, choix: 'conversation',
                }),
              });
              await chargerInterne(filId);
              await chargerInterneDesMails(idsMessages);
              onGeste(actif
                ? 'Échange marqué « interne » : il n’y a pas de bien à y rattacher.'
                : 'Marque « interne » retirée.');
              // 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LA LIGNE DE LISTE DOIT SUIVRE. C'est le geste même du
              //   constat d'Arno sur le fil 36691 : voir l'encadré de `onClassementChange`.
              onClassementChange?.();
            }}
            /**
             * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — RETIRER « HORS GESTION » DEPUIS LE BLOC DU MAIL.
             *
             * Demande d'Arno : « Clic sur la case verte “Interne” (ou “Hors gestion”) → retour immédiat aux deux
             * boutons rouge et blanc. Pour un mail reçu, le statut repasse à “À classer”. »
             *
             * ⚠️ `DELETE` N'EFFACE RIEN : la route écrit `retire_le` sur la ligne, qui reste datée et signée.
             * C'est la règle de `horsGestionRepo` depuis la migration 266, et elle vaut ici comme ailleurs.
             */
            onHorsGestion={async (actif) => {
              await fetch('/api/admin/gestion/hors-gestion', {
                method: actif ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageIds: [m.messageId] }),
              });
              await chargerRattachements(idsMessages);
              onGeste(actif ? 'Mail marqué « hors gestion ».' : 'Marque « hors gestion » retirée.');
              // 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — même raison qu'« Interne » juste au-dessus.
              onClassementChange?.();
            }}
            onRattachement={() => {
              void chargerRattachements(idsMessages);
              void chargerInterne(filId);
              // 🔴 LOT SUIVI-CONVERSATION — les périodes aussi : un classement vient peut-être d'en ouvrir une.
              void chargerSuivi(filId);
              /**
               * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — ET C'EST ICI QUE « RATTACHER » PASSE.
               *
               * Ce rappel est celui qu'`EncartRattachement` déclenche après CHACUN de ses gestes : rattacher,
               * détacher, la fenêtre « Modifier », la fenêtre complète « Classer » et l'étape 2 « classer ce
               * nouveau contact » — tous appellent son `onChange`, qui aboutit ici. Les quatre gestes qu'Arno
               * nomme sont donc couverts par deux points d'appel, et non par cinq.
               */
              onClassementChange?.();
            }}
            onGesteRattachement={(t) => onGeste(t)}
            onHistorique={onHistorique}
            /* 🔴 LOT PIECES-DE-LA-CONVERSATION — la vignette d'une pièce ouvre la visionneuse maison, avec le tour
               de toute la conversation. */
            onVisualiser={(id) => setPieceVue(id)}
            /* 🔴 LOT RANGER-INSTANTANE-ET-NOM — « le nouveau nom s'affiche immédiatement partout à l'écran, sans
               recharger la page » (Arno). `silencieux` : on relit le fil SANS le faire clignoter, pendant qu'on
               est encore en train de ranger. */
            onNomChange={() => { void recharger({ silencieux: true }); }}
            panneau={deplacer === m.messageId ? (
              <DeplacerVers titre="Déplacer ce mail vers" exclure={null}
                onAnnuler={() => setDeplacer(null)}
                onValider={async (cible) => { await agirSurLeMail(m.messageId, cible, onGeste); setDeplacer(null); }} />
            ) : null}
            /* 🔴 L'ÉDITEUR, JUSTE SOUS CE MESSAGE — lot REPONSE-VISIBLE. Il ne s'ouvre ici que s'il a été demandé
               DEPUIS ce message ; sinon il reste à sa place historique, en pied de conversation. */
            /* 🔴 LOT BROUILLONS-GMAIL — la mention rouge « Brouillon ». Elle vient de la BASE (les brouillons
               vivants de l'échange), pas de l'état d'écran : elle s'affiche donc même en arrivant par la
               Réception. Et elle disparaît dès que l'éditeur est ouvert sur ce message — le brouillon est alors
               sous les yeux, l'annoncer une seconde fois serait du bruit. */
            avecBrouillon={brouillonSous !== m.messageId
              && brouillonsDuFil.some((x) => x.repondAMessageId === m.messageId)}
            /* 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — la mention du HAUT, elle, reste même quand l'éditeur est
               ouvert : c'est elle qui permet de le retrouver quand il est plus bas que l'écran. */
            brouillonEnAttente={brouillonsDuFil.some((x) => x.repondAMessageId === m.messageId)}
            /**
             * 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — L'ÉDITEUR EST CACHÉ QUAND LE MAIL EST REPLIÉ, jamais rendu
             * au milieu des lignes. `hidden` et non un démontage : voir l'encadré de `basculer`.
             */
            piedMessage={brouillon !== null && brouillonSous === m.messageId && redaction ? (
              <div hidden={!deplies.has(m.messageId)}>
                <Redaction brouillon={brouillon} contexte={redaction}
                  fermetureDemandee={fermetureReponse}
                  /* 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — l'éditeur rouvert par l'OUVERTURE du mail
                     ne tire pas la page a lui : on voulait lire le mail. Voir `calerLaReponse`. */
                  calerAVue={calerLaReponse}
                  onChange={setBrouillon}
                  onFerme={() => {
                    setBrouillon(null); setBrouillonSous(null); setCalerLaReponse(true);
                    void relireBrouillons();
                  }}
                  onEnvoye={() => {
                    setBrouillon(null); setBrouillonSous(null); void recharger(); void relireBrouillons();
                  }}
                  /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — LES OPTIONS TRAVERSENT. Un relais qui ne passe que
                     le message perdrait le delta des compteurs, et le chiffre n'aurait bougé nulle part. */
                  onGeste={(t, o) => onGeste(t, o)} />
              </div>
            ) : null} />
          {/* 🔴🔴 EN ORDRE « PLUS RÉCENT D'ABORD », CE QUI PRÉCÈDE CHRONOLOGIQUEMENT EST EN DESSOUS. Voir
              l'encadré du côté opposé, et `coteDuRepere`. */}
          {coteDuRepere(ordre) === 'dessous' && reperes
            .filter((r) => r.avantMessageId === m.messageId)
            .map((r) => <LigneRepere key={`rep-${r.id}`} repere={r} suivi={suivi} cote="dessous"
              interneDeLEchange={interne === true}
              /* 🔴 LE MAIL QUI OUVRE LA FENÊTRE, pour le pied de la modale : c'est CE mail-ci, celui
                 que le repère annonce. Aucune recherche, aucune requête — il est déjà là. */
              mail={m} />)}
          </Fragment>
        ))}
      </ol>

      {/* ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — LE TROMBONE DU BAS ════════════════════════════════════════════════
          Arno : « en BAS, à côté de la rangée Répondre / Répondre à tous / Transférer ». Il est posé JUSTE
          AU-DESSUS de cette rangée, et non dedans — et c'est ce qui le rend fiable : la rangée n'existe pas
          toujours (une conversation rendue dans une carte n'a aucun bouton d'envoi, un échange d'un seul message
          non plus, et l'éditeur ouvert la remplace). Dans la rangée, le trombone aurait disparu avec elle, alors
          que les pièces, elles, sont toujours là.

          🔴 C'EST LE MÊME COMPOSANT QU'EN HAUT (`trombonePieces`, écrit une seule fois) : même libellé, même
          infobulle, même compte. Deux boutons écrits séparément auraient fini par se contredire. */}
      {nbPieces > 0 && <div className="cnv-pieces-bas">{trombonePieces}</div>}

      {/* ══ LOT 5e — ÉCRIRE, SOUS LA CONVERSATION (façon messagerie) ══════════════════════════════════════════════
          Les trois boutons ne s'affichent QUE si tout est réuni : base à jour, droit d'envoi, et écran de lecture en
          pleine page. Chaque manque est DIT, jamais tu — un bouton absent sans explication envoie chercher un bug. */}
      {/* ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LE PIED NE DOUBLE PLUS LA RANGÉE DU MESSAGE ══════════════════════
          Défaut vu par Arno sur le fil 36526 : deux rangées « Répondre / Répondre à tous / Transférer » l'une sous
          l'autre. Ce ne sont pas des doublons de code — l'une répond AU MESSAGE, l'autre au plus RÉCENT — mais sur
          un fil d'un seul message (ou lu du plus ancien au plus récent) elles répondent au même et se touchent.
          `piedUtile` est PUR et éprouvé sans écran : voir son encadré. L'éditeur ouvert, lui, s'affiche toujours. */}
      {barreActions && redaction && (
        brouillon !== null && brouillonSous === null ? (
          <Redaction brouillon={brouillon} contexte={redaction}
            onChange={setBrouillon}
            onFerme={() => setBrouillon(null)}
            onEnvoye={() => { setBrouillon(null); void recharger(); }}
            /* 🔴 LES OPTIONS TRAVERSENT ICI AUSSI : voir le relais de l'éditeur, plus haut. */
            onGeste={(m, o) => onGeste(m, o)} />
        ) : brouillon !== null || !piedUtile(messages, ordre, deplies) ? null : (
          <div className="cnv-ecrire">
            {!redaction.schemaPret && (
              <p className="gst-tronc">Mise à jour de la base à appliquer avant de pouvoir écrire (migrations 239 à 241).</p>
            )}
            {redaction.schemaPret && !redaction.peutEnvoyer && (
              <p className="gst-tronc">Vous n’avez pas le droit d’envoyer au nom de gestion@.</p>
            )}
            {redaction.schemaPret && redaction.peutEnvoyer && (
              /* LOT 5-FIDÈLE — LE PIED DE GMAIL : trois boutons ARRONDIS, avec leur icône, dans l'ordre de Gmail.
                 Même fonction qu'avant, même route, même rédaction : seule la forme reprend celle que l'équipe
                 connaît. L'icône ne porte jamais l'information seule — le mot est écrit à côté. */
              <>
                {/* ══ 🔴 LOT FIL-LECTURE — CE PIED RÉPOND AU MESSAGE LE PLUS RÉCENT, ET IL LE DIT ════════════════
                    Il l'a toujours fait, et ce n'était pas ambigu tant que le plus récent était juste au-dessus.
                    Depuis que l'ordre est un réglage, ce pied peut se trouver sous le message le plus ANCIEN : sans
                    cette mention, on croirait répondre à celui qu'on vient de lire. Les boutons de CHAQUE message,
                    eux, portent sur leur message — c'est là qu'il faut cliquer pour répondre à un ancien.
                    ⚠️ La mention n'apparaît que s'il y a plus d'un message : sur un échange d'un seul message, il n'y
                    a aucune confusion possible et la phrase serait du bruit. */}
                {messages.length > 1 && (
                  <p className="gst-note cnv-pied-note">
                    Ces trois boutons répondent au message le plus récent. Pour répondre à un autre, servez-vous des
                    boutons situés sous ce message.
                  </p>
                )}
                <div className="cnv-pied">
                  {(['repondre', 'repondre_tous', 'transferer'] as const).map((voie) => (
                    <button key={voie} type="button" className="cnv-pied-bouton"
                      onClick={() => {
                        setBrouillon(ouvrirRedaction(voie, messages, fil.filId, redaction, maintenant,
                          heritageDuDernier(messages)));
                        setBrouillonSous(null); // le pied répond au plus récent : il s'ouvre à SA place, en bas
                        setCalerLaReponse(true); // 🔴 un bouton du pied est une demande : on amène l'éditeur
                      }}>
                      <IconeVoie voie={voie} />
                      <span>{voie === 'repondre' ? 'Répondre' : voie === 'repondre_tous' ? 'Répondre à tous' : 'Transférer'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* La note de réversibilité, CONSERVÉE : ce qui se fait d'un clic doit se défaire d'un clic, et se lire. */}
      <p className="gst-note">Détacher ou déplacer ne supprime rien : par le menu « ⋯ » de l’échange, il retourne dans la file ou rejoint une autre carte, avec tous ses messages et ses pièces.</p>

      {/* LES MAILS SORTIS DE CET ÉCHANGE — annoncés, jamais effacés en silence (comportement du lot 4d-B2, conservé). */}
      {partis.length > 0 && (
        <ul className="gst-partis">
          {partis.map((p) => (
            <li key={p.messageId} className="gst-parti">
              <span>
                1 mail déplacé vers <span className="gst-ref">{p.reference}</span>
                {p.objet?.trim() ? ` — « ${p.objet.trim()} »` : ''}
              </span>
              {/* Le geste de retour, CONSERVÉ tel quel : ce qui se fait d'un clic doit se défaire d'un clic. */}
              <button type="button" className="gst-lien-bouton"
                onClick={() => void agirSurLeMail(p.messageId, null, onGeste)}>
                Remettre dans son échange
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — LES TROIS FENÊTRES, EMPILÉES DANS CET ORDRE ═══════════════════════
          Le récapitulatif (z-index 68), puis la fenêtre Drive (70), puis la visionneuse (80). Chacune reste MONTÉE
          sous celle qui s'ouvre par-dessus : fermer l'aperçu ne « revient » donc pas à la liste — on n'en était
          jamais parti, et l'ordre, le défilement et la position n'ont pas bougé. */}
      {recapPieces && (
        <ModalePiecesConversation
          pieces={piecesFil}
          ordre={ordrePieces}
          onOrdre={() => setOrdrePieces(ordrePiecesSuivant(ordrePieces))}
          sansEmpreinte={recap.sansEmpreinte}
          depots={depotsFil}
          emplacements={emplacementsFil}
          maintenant={maintenant}
          /* 🔴 ÉCHAP NE FERME QUE LA FENÊTRE DU DESSUS : voir l'encadré de la prop dans le composant. */
          /* 🔴 ÉCHAP NE FERME QUE LA FENÊTRE DU DESSUS : la fenêtre Drive de consultation s'y ajoute, au même
             titre que la visionneuse et que « Ranger ». */
          ecouterEchap={pieceVue === null && rangerPiece === null && emplacementAVoir === null}
          gestes={{
            onVoir: (id) => setPieceVue(id),
            onRanger: ouvrirRangement,
            onVoirDansLeDrive: setEmplacementAVoir,
            onAllerAuMessage: (id) => void allerAuMessage(id),
          }}
          onFermer={() => setRecapPieces(false)} />
      )}

      {/* ══ 🔴🔴 LA VISIONNEUSE, AVEC LE TOUR DE TOUTE LA CONVERSATION ════════════════════════════════════════════
          Arno : « côté MAIL, ◀ Précédent / Suivant ▶ et les flèches ← → parcourent TOUTES les pièces de la
          conversation, dans l'ordre de la modale ; pas de bouclage à la fin. Côté DRIVE : inchangé. »

          🔴 C'EST LE MÊME COMPOSANT QUE CÔTÉ DRIVE, sans exception écrite : le périmètre du tour est tiré du
          voisinage par `voisinsVisualisables`, et le parent inventé des pièces de la conversation empêche tout
          fichier du Drive d'y entrer (et toute pièce d'en sortir). Miniatures de pages et priorité à la page 1
          viennent donc avec, sans une ligne de plus.

          ⚠️ LE MOT DU BOUTON PRINCIPAL CHANGE, PAS LE GESTE : ici on RANGE une pièce reçue, on ne JOINT pas un
          fichier du Drive à un message. Le renommage, lui, vit dans la fenêtre « Ranger » qui s'ouvre ensuite —
          c'est là que le nom part vraiment (lot RENOMMER-AVANT-RANGER). */}
      {pieceAffichee !== undefined && (
        <ApercuFichierDrive
          fichier={{
            id: String(pieceAffichee.pieceId), nom: pieceAffichee.nomFichier,
            typeMime: pieceAffichee.typeMime ?? '', lien: null,
            parentId: PARENT_PIECES_CONVERSATION, source: 'piece',
          }}
          voisinage={voisinagePiecesConversation(piecesFil)}
          /**
           * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE STYLO RENOMME LA PIÈCE, PLUS SEULEMENT LA COPIE ═══════════
           *
           * Arno : « une pièce jointe ne doit avoir qu'un seul nom, qu'elle soit dans un mail ou dans le
           * Drive ». Le stylo existait déjà dans cette visionneuse, mais SEULEMENT en mode « ranger » : il
           * nommait la copie qu'on s'apprêtait à déposer. Ici, il change le nom de la PIÈCE — et les copies
           * Drive que le programme a créées suivent.
           *
           * ⚠️ SANS LA MIGRATION 286, LA ROUTE REFUSE AVEC SON MOTIF, et l'écran l'affiche tel quel : on ne
           * fait pas semblant d'avoir renommé.
           */
          renommage={(idAffiche) => {
            const p = piecesFil.find((x) => String(x.pieceId) === idAffiche);
            if (p === undefined) return undefined;
            const origine = p.nomOrigine ?? p.nomFichier;
            return {
              nomOrigine: origine,
              // Le nom d'usage est DÉJÀ dans `nomFichier` : le repli se fait en SQL, une seule fois.
              nomChoisi: p.nomFichier === origine ? null : p.nomFichier,
              editerDabord: false,
              refus: null,
              onRenommer: (nom: string) => void renommerLaPiece(p.pieceId, nom),
            };
          }}
          etiquetteNav="Pièces de la conversation"
          joindreAutorise
          motJoindre={{ action: 'Ranger dans le Drive', deja: '✓ dans le Drive' }}
          estDeja={(id) => depotsFil.has(Number(id))}
          onJoindre={(f) => {
            const p = piecesFil.find((x) => String(x.pieceId) === f.id);
            if (p !== undefined) ouvrirRangement(p);
          }}
          onFermer={() => setPieceVue(null)} />
      )}

      {/* La fenêtre Drive habituelle, en mode « ranger », sur CETTE pièce : même arborescence, mêmes refus, même
          stylo de renommage. Rien n'est réécrit ici. */}
      {rangerPiece !== null && (
        <SelecteurFichierDrive
          mode="ranger"
          messageId={piecesFil.find((p) => p.pieceId === rangerPiece.pieceId)?.messageId ?? null}
          filId={filId}
          pieces={[rangerPiece]}
          /**
           * 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — « le nouveau nom s'affiche immédiatement partout à l'écran, sans
           * recharger la page » (Arno).
           *
           * DÉFAUT VU À L'ÉCRAN le 30/09/2026 : après avoir renommé au stylo puis rangé, la carte de la pièce
           * affichait sa nouvelle MENTION « Dans le Drive · Test creation… » et gardait son ANCIEN NOM. La
           * relecture ne portait que sur les dépôts — c'est-à-dire sur la moitié de ce qui venait de changer.
           *
           * ⚠️ LE FIL N'EST RELU QUE SI UN NOM A VRAIMENT CHANGÉ. Le relire à chaque rangement ferait une requête
           * de plus sur le geste le plus courant, pour un cas qui n'arrive que quand on a touché au stylo.
           */
          /**
           * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA RELECTURE DU STATUT PASSE PAR LE SIGNAL, ET PAR LUI SEUL (voir
           * l'effet d'abonnement plus haut). Elle était ici, et nulle part ailleurs : c'est pour cela que les
           * cartes du mail et ce récapitulatif ne se rafraîchissaient pas l'un l'autre.
           *
           * ⚠️ `nomChange` RESTE ICI : c'est une AUTRE information, et elle demande de relire le FIL, pas le
           * statut Drive. Le fil n'est relu que si un nom a VRAIMENT changé — le relire à chaque rangement ferait
           * une requête de plus sur le geste le plus courant.
           */
          onRangement={(o) => { if (o?.nomChange === true) void recharger({ silencieux: true }); }}
          onFermer={() => setRangerPiece(null)} />
      )}

      {/* ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LA FENÊTRE DRIVE, EN CONSULTATION ═══════════════════
          Arno : « ouvre NOTRE fenêtre Drive (mode consulter), positionnée dans le dossier qui contient le
          document, arbre déplié jusqu'à lui, le fichier mis en évidence (même repère que la loupe) ».

          🔴 C'EST LA MÊME FENÊTRE QUE CELLE DU RANGEMENT, dans un autre mode : les gardes de « Documents clients
          scannés » sont celles du SERVEUR, et elles ne sont ni contournées ni redites ici.

          ⚠️ ELLE S'EMPILE AU-DESSUS DU RÉCAPITULATIF, qui reste monté derrière : fermer ne « revient » donc pas à
          la liste — on n'en était jamais parti, et l'ordre et le défilement n'ont pas bougé. */}
      {emplacementAVoir !== null && (
        <SelecteurFichierDrive
          mode="consulter"
          filId={filId}
          dossierDepart={dossierDeLEmplacement(emplacementAVoir)}
          documentEnEvidence={{ driveFileId: emplacementAVoir.driveFileId }}
          /* ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE ══════════════════════════════════════════════
              Arno : « on ne voit pas où l'on se trouve dans l'arborescence ». On arrive donc à la RACINE,
              branche dépliée jusqu'au document, les autres dossiers repliés à côté.
              🔴 LA MÊME ARRIVÉE POUR LE MENU « N EMPLACEMENTS CONNUS », et c'est une règle d'Arno : « même
              comportement pour chaque entrée du menu ». Ce composant sert les deux (un emplacement unique
              ouvre directement, plusieurs passent par le menu) — le mode est donc posé au seul endroit où
              la fenêtre est montée, et aucune des deux voies ne peut l'oublier. */
          arrivee="arborescence"
          onFermer={() => setEmplacementAVoir(null)} />
      )}
    </section>
  );
}

/**
 * LOT 5-FIDÈLE — LES TROIS ICÔNES DU PIED, en SVG EN LIGNE : c'est la convention du dépôt (aucune bibliothèque
 * d'icônes n'y est installée, et en ajouter une pour trois flèches serait une dépendance de plus à suivre).
 *
 * ⚠️ `aria-hidden` : l'icône ne dit rien de plus que le mot écrit à côté. La laisser lisible aux lecteurs d'écran
 * ferait entendre deux fois la même chose.
 */
function IconeVoie({ voie }: { voie: VoieRedaction }) {
  const commun = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true as const,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (voie === 'transferer') {
    return (
      <svg {...commun}><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a6 6 0 00-6 6v1" /></svg>
    );
  }
  if (voie === 'repondre_tous') {
    return (
      <svg {...commun}><path d="M8 7l-5 5 5 5" /><path d="M13 7l-5 5 5 5" /><path d="M8 12h7a5 5 0 015 5v1" /></svg>
    );
  }
  return (
    <svg {...commun}><path d="M9 7l-5 5 5 5" /><path d="M4 12h9a6 6 0 016 6v1" /></svg>
  );
}

/**
 * LOT 5e — OUVRE UN BROUILLON à partir du DERNIER message de la conversation. C'est celui auquel on répond quand on
 * clique « Répondre » sans avoir rien désigné d'autre — le comportement de toute messagerie.
 *
 * 🔴 Toute la décision (qui reçoit quoi, quel objet, quelle citation) vit dans `redaction.ts`, module PUR et
 * entièrement éprouvé. Ici on ne fait que lui passer le message et récupérer le résultat.
 */
function ouvrirRedaction(
  voie: VoieRedaction, messages: readonly MessageDeFil[], filId: number,
  ctx: ContexteRedactionEcran, maintenant: Date,
  /**
   * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — CE DONT LA RÉPONSE HÉRITE ═══════════════════════════════════════════════
   *
   * Demande d'Arno : « Réponse / Répondre à tous / Transférer : si la conversation est déjà rattachée, interne
   * ou hors gestion, la case est pré-remplie en vert dans le même état (avec Réinitialiser). Sinon, même
   * obligation que pour un nouveau message. »
   *
   * 🔴 SANS CELA, LE BLOCAGE RETOMBERAIT SUR LE CAS LE PLUS FRÉQUENT DU MODULE. L'essentiel du courrier écrit
   * est une réponse ; obliger à reclasser à la main un échange déjà classé aurait remplacé une file de mails à
   * classer par une file de gestes à refaire.
   *
   * ⚠️ VIDE PAR DÉFAUT : les appelants qui ne savent rien de la conversation (un brouillon rouvert depuis la
   * liste, un écran qui ne lit pas les rattachements) n'héritent de rien, et l'obligation s'applique. On
   * n'invente jamais un classement.
   */
  herite: ClassementHerite = { cibles: [], interne: false, horsGestion: false },
): BrouillonEcran {
  const dernier = messages.length > 0 ? messages[messages.length - 1] : null;
  const b = preparerBrouillon(voie, dernier === null ? null : {
    messageId: dernier.messageId, de: dernier.de, deNom: dernier.deNom, objet: dernier.objet,
    recuLe: dernier.recuLe, corps: dernier.corps ?? dernier.extrait,
    destA: dernier.destA, destCc: dernier.destCc, destinatairesFondus: dernier.destinatairesFondus,
  }, { adresseGestion: ctx.adresseGestion, signature: ctx.signature },
  {
    filId,
    dateLisible: dernier ? dateHeureComplete(dernier.recuLe) : undefined,
    /**
     * 🔴🔴 LOT IMAGES-INTEGREES — « Quand on répond ou transfère depuis l'appli, l'image citée part comme une
     * image et non comme du texte » (Arno).
     *
     * Sans cette ligne, la citation HTML retombait sur la version TEXTE du message : pour les 20 mails dont le
     * corps texte porte lui-même une balise `<img src="data:…">`, la citation emportait donc la balise ÉCHAPPÉE —
     * du code, exactement ce qu'Arno a vu à l'écran. Le HTML passé ici est celui du serveur, DÉJÀ ASSAINI
     * (`lireCorpsDuMessage` → `assainirHtml`), et il porte de vraies balises d'image.
     */
    origineHtml: dernier?.html ?? null,
  });
  void maintenant;
  return {
    ...b, id: null,
    cibles: herite.cibles, interne: herite.interne, horsGestion: herite.horsGestion,
  };
}

/**
 * UN message de la conversation. Replié, il tient sur une ligne (expéditeur, extrait, date) ; déplié, il montre son
 * en-tête complet, son texte et ses pièces. Le texte est rendu TEL QUEL — jamais interprété comme du HTML.
 */
/**
 * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — LE CORPS HTML D'UN MAIL, LISIBLE EN THÈME SOMBRE ═══════════════════════════
 *
 * Arno : « Même règle pour les corps HTML des mails reçus et envoyés dans les fils, et pour la visionneuse de
 * mail. Les couleurs vives (rouge, liens, etc.) et les images ne sont jamais modifiées. »
 *
 * 🔴 UN COMPOSANT, ET NON UNE LIGNE RECOPIÉE. Le HTML d'un mail s'affiche à plusieurs endroits ; la règle doit
 * être la même partout, et le seul moyen d'en être sûr est qu'il n'y ait qu'un endroit où elle est écrite.
 *
 * ⚠️ RIEN N'EST RÉÉCRIT. La passe pose un attribut de données sur ce qu'elle juge illisible, et une règle CSS
 * s'en sert. Le HTML reçu — celui qui repart en transfert ou en réponse — n'est pas touché.
 */
/**
 * 🔴🔴 EXPORTÉ DEPUIS LE LOT BROUILLONS-APERCU — l'aperçu d'un brouillon affiche son corps DANS LA MÊME
 * VISIONNEUSE QUE LES MAILS (demande d'Arno). C'est le seul endroit où la règle de lisibilité en thème sombre et
 * le clic d'agrandissement des images sont écrits : la recopier ailleurs les ferait diverger au premier correctif.
 */
/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 2 — LE REPÈRE « À PARTIR D'ICI », REDESSINÉ ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « phrase en ROUGE, CENTRÉE horizontalement dans la zone des mails (texte, date,
 * auteur conservés) ; de chaque côté de la phrase part un liseré rouge fin, qui longe le mail concerné de chaque
 * côté et s'arrête à mi-hauteur de la ligne de ce mail (le mail est “encadré” par le repère) ; au bout de la
 * phrase, avant le liseré de droite, une pastille “i”. »
 *
 * 🔴 COMMENT LE « CADRE » EST FAIT, ET POURQUOI AINSI. La ligne porte deux traits HORIZONTAUX (ses deux
 * `::before`/`::after`), et deux traits VERTICAUX qui descendent — ou montent — le long du mail voisin. Ces
 * derniers sont posés par la ligne elle-même, en `position:absolute`, et leur hauteur est la MOITIÉ de celle du
 * mail : c'est exactement « s'arrête à mi-hauteur de la ligne de ce mail ».
 *
 * ⚠️ LE SENS DÉPEND DU CÔTÉ, et c'est la même règle que le placement : au-dessus du mail, les traits DESCENDENT ;
 * en dessous, ils MONTENT. Un seul dessin pour les deux tris aurait encadré le mail voisin, pas le bon.
 *
 * ⚠️ `--cnv-repere-h` PORTE LA HAUTEUR DU MAIL, mesurée à l'écran : un mail déplié fait dix fois la hauteur d'un
 * mail replié, et une valeur figée aurait tracé un trait trop court ou débordant. On la relit à chaque
 * changement de taille, par un `ResizeObserver`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function LigneRepere({ repere: r, suivi, cote, mail, interneDeLEchange }: {
  repere: RepereFil;
  suivi: { mails: number[]; periodes: Periode[]; exceptions: ExceptionMail[] } | null;
  cote: 'dessus' | 'dessous';
  /**
   * ══ 🔴🔴 LA MARQUE « INTERNE » DE L'ÉCHANGE — CORRECTION DU 04/10/2026 ════════════════════════════════════════
   *
   * CONSTAT D'ARNO : la modale du ⓘ annonçait « À classer » là où la liste affichait « Interne ». La base a
   * tranché (fil 3490) : la marque d'échange `gestion_fil_interne` est ACTIVE, aucune des cinq fenêtres n'est de
   * sorte « interne », et la table par mail de la migration 297 est vide ET nommée nulle part. La liste avait donc
   * raison, et la modale omettait une source.
   *
   * 🔴 ELLE EST PASSÉE DEPUIS L'ÉCRAN, QUI LA TIENT DÉJÀ (l'état `interne`, lu par `/api/admin/gestion/interne`) :
   * aucune requête de plus, et une seule source pour la case du bandeau, la capsule et cette modale.
   */
  interneDeLEchange: boolean;
  /**
   * 🔴 LE MAIL QUI OUVRE LA FENÊTRE — pour le pied de la modale (« sur quel mail : expéditeur, date, objet »).
   * C'est le mail voisin de la ligne, celui que l'écran tient déjà en main : rien n'est rechargé pour l'afficher.
   */
  mail: MailDuRepere | null;
}) {
  const li = useRef<HTMLLIElement | null>(null);
  const [hauteur, setHauteur] = useState(0);
  const [ouverte, setOuverte] = useState(false);

  /**
   * 🔴 LA HAUTEUR DU MAIL VOISIN, MESURÉE. Au-dessus du mail, le voisin est le SUIVANT ; en dessous, le
   * PRÉCÉDENT. On ne devine pas : on lit ce que le navigateur a disposé.
   */
  useEffect(() => {
    const noeud = li.current;
    if (noeud === null || typeof ResizeObserver !== 'function') return undefined;
    const voisin = (cote === 'dessus' ? noeud.nextElementSibling : noeud.previousElementSibling) as HTMLElement | null;
    if (voisin === null) return undefined;
    const mesurer = (): void => setHauteur(voisin.getBoundingClientRect().height);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(voisin);
    return () => obs.disconnect();
  }, [cote]);

  /**
   * 🔴🔴 CE QUE LA PASTILLE EXPLIQUE : un AVANT / APRÈS, composé par le module PUR. `null` = on ne sait pas
   * (migration 290 absente, ou fenêtre introuvable) : la pastille ne s'affiche alors pas du tout, plutôt que
   * d'ouvrir une fenêtre vide.
   *
   * 🔴 MÊME SOURCE QU'AVANT, mot pour mot la demande d'Arno (« données identiques à celles de la bulle actuelle »).
   * Seule la MISE EN FORME a changé de maison : la bulle composait ses lignes ici, la modale les demande à
   * `lignesComparatif` — qui lit le MÊME comparatif.
   */
  const c = suivi === null ? null
    : comparatifRepere({
      mails: suivi.mails, periodes: suivi.periodes, periodeId: r.id, interneDeLEchange,
    });

  /** 🔴 LA PORTÉE DE LA FENÊTRE, comptée sur les mails de l'échange. Module pur, aucune requête. */
  const nbMails = suivi === null ? 0
    : nbMailsCouverts({ mails: suivi.mails, periodes: suivi.periodes, periodeId: r.id });

  return (
    <li className={`cnv-repere cnv-repere--${cote}${hauteur > 0 ? ' cnv-repere--mesure' : ''}`} ref={li}
      style={{ ['--cnv-repere-h' as string]: `${Math.round(hauteur)}px` }}>
      {/* 🔴🔴 LES DEUX BRAS DU CADRE — UN SEUL TRAIT CHACUN, SANS COUPURE À L'ANGLE.
          Chaque bras est UNE boîte qui porte deux bordures (l'horizontale et la verticale) et un rayon sur
          l'angle qui les joint : le trait est donc continu par construction, et arrondi. Deux traits séparés
          laissaient un décroché d'un pixel au coin — c'est le défaut qu'Arno a vu.

          🔴 ET CHACUN PORTE, AU BOUT, UNE PETITE FLÈCHE ROUGE (lot RENOMMER-PARTOUT-ET-FINITIONS, point 3). Elle
          est dessinée par le `::after` du bras, et pointe dans le sens où la branche va — donc toujours vers le
          mail concerné. Elle s'inverse avec le tri sans rien savoir du tri : voir la feuille.

          ⚠️ `cnv-repere--mesure` N'EST PAS DÉCORATIF : tant que le `ResizeObserver` n'a pas mesuré le mail voisin
          — et pour toujours s'il n'y a pas de voisin — la hauteur vaut 0, la branche ne se voit pas, et une flèche
          posée là flotterait seule à côté de la phrase. Elle n'apparaît donc qu'avec sa branche. */}
      <span className="cnv-repere-bras cnv-repere-bras--gauche" aria-hidden="true" />
      <span className="cnv-repere-phrase">
        <span className="cnv-repere-mot">À partir d’ici : {r.versQuoi}</span>
        {(r.parLibelle !== null || r.le !== null) && (
          <span className="cnv-repere-qui">
            {r.le !== null && dateHeureComplete(r.le)}
            {r.le !== null && r.parLibelle !== null ? ' · ' : ''}
            {r.parLibelle}
          </span>
        )}
        {/* ══ 🔴🔴 LA PASTILLE, AU BOUT DE LA PHRASE — ELLE OUVRE AU CLIC, PLUS AU SURVOL ═══════════════════════
            Arno : « la pastille s'ouvre au CLIC (et à Entrée ou Espace au clavier), plus au survol. Bulle “Voir le
            détail du changement” au survol seulement. »

            🔴 UN VRAI `<button>`, ET C'EST TOUT CE QU'IL FAUT POUR LE CLAVIER : Entrée et Espace déclenchent
            nativement son `onClick`. Un `onKeyDown` de plus l'aurait ouvert DEUX fois sur Entrée — le navigateur
            émet le clic, et le gestionnaire aurait tiré en même temps.

            🔴 LE SURVOL NE FAIT PLUS QU'UNE CHOSE : dire ce que le clic va ouvrir (`title`). Le même mot sert de
            nom au bouton (`aria-label`), pour qui ne voit pas la bulle. */}
        {c !== null && (
          <button type="button" className="cnv-repere-i" aria-haspopup="dialog" aria-expanded={ouverte}
            title={AIDE_PASTILLE_REPERE} aria-label={AIDE_PASTILLE_REPERE}
            onClick={() => setOuverte(true)}>
            <span aria-hidden="true">i</span>
          </button>
        )}
        {/* ⚠️ LA MODALE EST RENDUE DANS LA LIGNE, mais son voile est `position:fixed` : elle est donc centrée sur
            l'ÉCRAN, et aucun conteneur de la conversation ne peut la rogner. */}
        {c !== null && ouverte && (
          <ModaleChangementSuivi comparatif={c} mail={mail} nbMails={nbMails}
            onFermer={() => setOuverte(false)} />
        )}
      </span>
      <span className="cnv-repere-bras cnv-repere-bras--droite" aria-hidden="true" />
    </li>
  );
}

export function CorpsHtmlMail({ html, onVisualiser }: {
  html: string;
  /**
   * 🔴🔴 LOT IMAGES-INTEGREES — « clic pour l'agrandir (même visionneuse que les pièces) » (Arno).
   *
   * ⚠️ ET IL FAUT DIRE JUSQU'OÙ ÇA VA. La visionneuse maison montre une PIÈCE de la conversation : elle est
   * pilotée par un identifiant de pièce, et fait le tour des pièces du fil. Une image du corps n'en est une que
   * lorsqu'elle est venue par `cid:` — dans ce cas, et c'est le cas qui compte, le clic l'ouvre dans la
   * visionneuse, exactement comme sa vignette. Une image intégrée (`data:`) ou distante n'a pas de pièce à
   * désigner : elle s'ouvre alors en pleine taille dans un onglet. Dans les deux cas on voit l'IMAGE, jamais du code.
   */
  onVisualiser?: (pieceId: number) => void;
}) {
  const zone = useRef<HTMLDivElement | null>(null);
  useLisibiliteSombre(zone, [html]);
  const agrandir = (e: React.MouseEvent<HTMLDivElement>): void => {
    const cible = e.target as HTMLElement;
    if (cible.tagName !== 'IMG') return;
    // Une image qu'on n'a pas pu afficher n'a rien à agrandir : sa vignette porte déjà son propre lien.
    if (cible.hasAttribute('data-absente')) return;
    const src = cible.getAttribute('src') ?? '';
    if (src === '') return;
    e.preventDefault();
    const piece = /\/api\/admin\/gestion\/pieces\/(\d+)/.exec(src);
    if (piece !== null && onVisualiser !== undefined) { onVisualiser(Number(piece[1])); return; }
    window.open(src, '_blank', 'noopener,noreferrer');
  };
  return (
    <div ref={zone} className="cnv-html" onClick={agrandir}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function MessageConversation({
  message, maintenant, ouvert, corpsCharge, htmlCharge, cssMailCharge, onBasculer, onDeplacer, onRemettre, panneau, statut, onActionStatut,
  gmail, onEtoile, onRepondre, onActionMessage, filId = null, piedMessage = null, avecBrouillon = false,
  brouillonEnAttente = false,
  rattachements = null, horsGestion = null, interne = null, onInterne, onHorsGestion, exception = null,
  onRattachement, onGesteRattachement, onHistorique, onVisualiser, onNomChange, onCorbeilleMessage,
  onReintegrerMessage,
}: {
  message: MessageDeFil; maintenant: Date; ouvert: boolean;
  /**
   * 🔴 LOT RANGER-INSTANTANE-ET-NOM — une pièce vient d'être renommée EN BASE (stylo, puis rangement). Le nom
   * affiché vient du FIL : seule la conversation sait le relire, et c'est elle qui rend ce geste.
   */
  onNomChange?: () => void;
  /**
   * 🔴 LOT PIECES-DE-LA-CONVERSATION — ouvre la visionneuse maison sur une pièce, avec le tour de TOUTE la
   * conversation. Rendu par l'écran qui tient la conversation, parce que lui seul connaît toutes les pièces.
   * Absent = la vignette reste le lien d'avant (nouvel onglet).
   */
  onVisualiser?: (pieceId: number) => void;
  /**
   * LOT 5-PJ-B — l'échange auquel ce message appartient. Sert UNIQUEMENT à rouvrir le sélecteur de dossier Drive sur
   * le dernier dossier utilisé pour cet échange. Absent = le sélecteur s'ouvre à la racine, et rien d'autre ne change.
   */
  filId?: number | null;
  corpsCharge?: string | null;
  /** LOT BIEN-RATTACHE — le HTML du message, DÉJÀ ASSAINI par le serveur. `undefined` = pas encore demandé. */
  htmlCharge?: string | null;
  /** 🔴🔴 LOT CADRE-ISOLE-MAILS — le CSS d'en-tête du mail, déjà filtré par le serveur. */
  cssMailCharge?: string | null;
  onBasculer: () => void;
  /** Gestes par mail, CONSERVÉS du lot 4d : déplacer ce mail vers une autre carte, ou l'en détacher. */
  onDeplacer?: () => void; onRemettre?: () => void; panneau?: React.ReactNode;
  /**
   * LOT REPONSE-VISIBLE — ce qui se rend À LA FIN de ce message, après son contenu et ses pièces : l'éditeur de
   * réponse, quand il a été ouvert depuis CE message. Absent (le défaut) ⇒ rien, et le message est exactement celui
   * d'avant ce lot. Distinct de `panneau`, qui se rend AU-DESSUS du détail et sert au déplacement d'un mail.
   */
  piedMessage?: React.ReactNode;
  /**
   * 🔴 LOT BROUILLONS-GMAIL — UNE RÉPONSE EST COMMENCÉE SUR CE MESSAGE. Affiche la mention rouge « Brouillon »,
   * comme Gmail le fait. `false` (le défaut) ⇒ rien, et le message est exactement celui d'avant ce lot.
   */
  avecBrouillon?: boolean;
  /**
   * 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — CE MAIL A UNE RÉPONSE COMMENCÉE, éditeur ouvert ou non.
   *
   * ⚠️ DISTINCT DE `avecBrouillon`, qui se tait dès que l'éditeur est sous les yeux : la mention du HAUT, elle,
   * sert précisément à retrouver une zone de réponse qu'on ne voit pas — qu'elle soit fermée ou simplement plus
   * bas que l'écran. Les deux viennent de la même source (les brouillons vivants de l'échange).
   */
  brouillonEnAttente?: boolean;
  /**
   * LOT 5-STATUT — OÙ EN EST CE MESSAGE, juste à gauche de sa date. Absent = aucun cartouche, et le message est
   * exactement celui d'avant ce lot (c'est le cas des écrans qui n'en ont pas besoin).
   */
  statut?: StatutClassement;
  /** Ce que le cartouche déclenche. Absent = le cartouche n'est qu'un CONSTAT, sans bouton. */
  onActionStatut?: (a: ActionStatut) => void;
  /**
   * LOT 5-FIDÈLE — l'état du message DANS GMAIL (étoile, non lu), relu à l'ouverture. `null`/absent = pas de
   * connexion Google : l'étoile n'est pas affichée plutôt que montrée éteinte, ce qui ne voudrait rien dire.
   */
  gmail?: { etat: { etoile: boolean; nonLu: boolean } | null } | null;
  onEtoile?: () => void;
  onRepondre?: (voie: VoieRedaction) => void;
  /** Une entrée du menu « ⋮ » qui n'est ni « déplacer » ni « détacher » — celles-là gardent leurs rappels d'origine. */
  onActionMessage?: (a: ActionMessage) => void;
  /**
   * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LA GRANDE CORBEILLE DU BLOC D'EN-TÊTE ═══════════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « dans le bloc d'en-tête d'un message ouvert (De, À, Cc, Date), à DROITE, une
   * grande icône corbeille qui occupe toute la hauteur du bloc. […] Clic : ce MESSAGE va à la corbeille. »
   *
   * ⚠️ ABSENTE ⇒ AUCUNE ICÔNE, et le bloc est exactement celui d'avant ce lot. C'est le cas des écrans qui
   * affichent un message sans pouvoir agir dessus (une carte, un aperçu).
   */
  onCorbeilleMessage?: () => void;
  /**
   * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — LE GESTE INVERSE, SUR UN MAIL DÉJÀ À LA CORBEILLE ════
   *
   * CONSTAT D'ARNO (04/10/2026, fil 36698 / message 57477, « _TEST corbeille », ouvert depuis la Corbeille) :
   * « la grande icône corbeille du bloc gris De/À/Date est toujours là. C'est illogique pour un mail déjà à la
   * corbeille. »
   *
   * 🔴 C'EST LE MESSAGE QUI DÉCIDE, PAS L'ÉCRAN D'OÙ L'ON VIENT : `message.aLaCorbeille`, rendu par la base.
   * Un échange peut mêler un mail jeté et un mail vivant — « _TEST corbeille » en est un —, et déduire l'état de
   * « la conversation a été ouverte depuis la Corbeille » l'aurait donc dit faux une ligne sur deux.
   *
   * ⚠️ ABSENTE ⇒ LA CORBEILLE RESTE, même sur un mail jeté : on ne montre pas un bouton qui n'irait nulle part.
   */
  onReintegrerMessage?: () => void;
  /**
   * LOT RATTACHEMENT-1 — les liens de CE mail, déjà chargés par la conversation. `null` (le défaut) = aucun bandeau :
   * c'est le cas des écrans qui n'ont pas besoin des rattachements, et celui d'une migration 257 non appliquée.
   */
  rattachements?: readonly LienAffiche[] | null;
  /**
   * 🔴 LOT STATUT-HORS-GESTION — la marque de CE mail : `{motif}` s'il en porte une, `false` s'il n'en porte pas,
   * `null` si on ne sait pas (migration 266 absente, ou lecture en échec). `null` ⇒ aucune capsule grise possible.
   */
  horsGestion?: { motif: string | null } | false | null;
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — l'ÉCHANGE de ce message est-il marqué « interne » ? `null` = on ne sait rien
   * (migration 281 absente) : aucune capsule verte inventée.
   */
  interne?: boolean | null;
  /** Poser ou retirer la marque. Absent ⇒ aucun bouton : l'écran est alors celui d'avant ce lot. */
  onInterne?: (actif: boolean) => void | Promise<void>;
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — pose (`true`) ou retire (`false`) la marque « hors gestion » de CE mail.
   * Absent ⇒ la case verte « Hors gestion » s'affiche mais ne se défait pas d'ici.
   */
  onHorsGestion?: (actif: boolean) => void | Promise<void>;
  /**
   * 🔴 LOT SUIVI-CONVERSATION — « Un mail en exception porte une petite mention “exception : <biens>” dans son
   * en-tête » (Arno). Déjà composé par la conversation, qui seule connaît les périodes. `null` = ce mail suit
   * la règle de sa période, et il n'y a rien à signaler.
   */
  exception?: string | null;
  /** Recharge les liens de l'échange après un geste. Absent = le bandeau reste en lecture. */
  onRattachement?: () => void | Promise<void>;
  onGesteRattachement?: (message: string) => void;
  /** LOT RATTACHEMENT-2 — ouvre l'historique d'une cible depuis son étiquette. Absent = étiquette non cliquable. */
  onHistorique?: (cible: Cible) => void;
}) {
  const [actions, setActions] = useState(false);
  /** LOT BARRE-STATUT — la fenêtre « Visualiser / Modifier », ouverte depuis l'en-tête de CE message. */
  const [voirRattachements, setVoirRattachements] = useState(false);
  /** 🔴 LOT BROUILLON-REPONSE-ET-REPERE — le pied du message, cible du défilement de la mention du haut. */
  const pied = useRef<HTMLDivElement | null>(null);
  /**
   * 🔴 LOT STATUT-PAR-MAIL — la fenêtre « Classer ce mail », ouverte depuis la capsule ROUGE de CE message.
   * Deux fenêtres, deux questions : on CLASSE ce qui ne l'est pas, on VISUALISE ce qui l'est. La seconde mène à la
   * première par son bouton « Modifier », comme avant : rien n'est retiré, on ajoute la porte qui manquait.
   */
  const [classerCeMail, setClasserCeMail] = useState(false);
  const propositions = statut ? actionsDuStatut(statut) : { declencheur: null, actions: [] };
  /**
   * ══ 🔴 LOT BARRE-STATUT — LE LIEN DE L'EN-TÊTE SUIT LA MÊME RÈGLE QUE LA BARRE D'UNE LIGNE ════════════════════
   * Demande d'Arno. Rattachement CONFIRMÉ vers un logement ou un propriétaire ⇒ « Visualiser / Modifier », en vert,
   * qui ouvre la fenêtre des rattachements. Sinon, le lien d'avant, inchangé.
   *
   * ⚠️ C'EST LA QUESTION DE LA CAPSULE, PAS CELLE DU CARTOUCHE, et il ne faut surtout pas les confondre : le
   * CARTOUCHE dit si l'échange est posé sur une CARTE (un événement) ; la capsule dit s'il est rattaché à un
   * LOGEMENT ou à un PROPRIÉTAIRE. Deux questions, deux nombres — mesurés le 27/09 : 474 contre 9 631. On ne
   * touche donc PAS au mot du cartouche ; on ne remplace que son bouton, et seulement sur la seconde question.
   *
   * ⚠️ `rattachements === null` (migration 257 absente, ou écran qui ne les charge pas) ⇒ on ne sait rien, et on
   * garde le lien d'avant. On ne devine pas un état qu'on n'a pas lu.
   */
  /**
   * ══ 🔴 LOT STATUT-PAR-MAIL — LE STATUT DE CE MAIL, C'EST SON RATTACHEMENT À UN BIEN ═══════════════════════════
   * Une seule capsule, calculée sur les rattachements de CE message à un logement, un propriétaire ou un
   * locataire. L'événement ne compte pas : c'est l'autre question, et les mêler est précisément le défaut qu'Arno
   * a vu sur le fil 803 — trois mails rattachés au lot 445 qui affichaient tous « À classer ».
   *
   * ⚠️ `rattachements === null` = on ne sait rien (migration 257 absente, ou écran qui ne les charge pas) : on
   * n'affiche AUCUNE capsule plutôt qu'une rouge qui accuserait à tort.
   */
  /**
   * 🔴 LOT STATUT-HORS-GESTION — LA MARQUE ENTRE DANS LE CALCUL, AVEC SA PRIORITÉ. Classé > Auto > Hors gestion >
   * À classer, tenue par `capsuleDuMessage` (module PUR) : un mail marqué hors gestion PUIS rattaché à un bien
   * redevient vert tout seul, ce qui est exactement la réversibilité demandée.
   */
  const marque = horsGestion === null || horsGestion === false ? null : horsGestion;
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — LA MARQUE « INTERNE » DE L'ÉCHANGE ENTRE DANS LE CALCUL, avec son rang :
   * Classé > Auto > Interne > Hors gestion > À classer (`capsuleDuMessage`, module PUR). Un échange marqué
   * interne PUIS rattaché à un bien redevient « Classé » tout seul — la réversibilité par le geste naturel.
   */
  const capsule = rattachements === null
    ? null : capsuleDuMessage(rattachements, marque !== null, interne === true);
  const biensDuMail = (rattachements ?? [])
    .filter((l) => SORTES_BIEN.includes(l.cible.sorte) && l.statut === 'confirme')
    .map((l) => l.libelle);
  const visualisable = capsule !== null && capsule !== 'a_classer' && filId !== null;
  const hors = mentionHorsFile(message);
  // LOT ENVOI-DIAG — ce message n'est pas arrivé. Rien de plus important à dire sur un message, donc rien au-dessus.
  const echec = mentionNonRemise(message);
  const qui = message.deNom?.trim() || message.de;
  const etat = etatCorps(message, corpsCharge, htmlCharge);
  const lisible = etat.v === 'texte' ? corpsLisible(etat.texte) : null;
  const { vraies, signatures } = trierPieces(message.pieces);

  /**
   * ══ 🔴 LOT AVIS-LISIBLE — CE MESSAGE EST LUI-MÊME UN AVIS DE NON-REMISE ══════════════════════════════════════
   * Celui qui produit la ligne rouge dans la liste. En l'ouvrant, on veut LA PHRASE, tout de suite et en entier :
   * « Sa boîte de réception est pleine ». Elle était noyée entre un code SMTP, un `Reporting-MTA` et un
   * `Diagnostic-Code` replié sur trois lignes — et la ligne de liste, elle, n'en donnait qu'une version tronquée.
   *
   * ⚠️ C'EST L'AVIS LUI-MÊME, PAS LE MESSAGE QUI A ÉCHOUÉ. Les deux portent du rouge et il ne faut pas les
   * confondre : `echec` (juste au-dessus) marque le mail QUE NOUS AVONS ENVOYÉ et qui n'est pas arrivé ; ceci
   * marque le mail DU SERVEUR qui nous l'annonce.
   *
   * ⚠️ RIEN N'EST CACHÉ : la partie technique reste affichée dessous, en couleur normale, mot pour mot.
   */
  const avis = etat.v === 'texte'
    && estAvisNonRemise({ deAdresse: message.de, objet: message.objet, corps: etat.texte })
    ? texteHumainAvis(etat.texte) : null;
  /**
   * 🔴 LE REPLI DEMANDÉ PAR ARNO : quand le texte humain ne peut pas être isolé (un avis qui commence directement
   * par son rapport machine), on met en rouge LE MOTIF DÉJÀ EXTRAIT pour la ligne de liste. Un bandeau vide serait
   * pire que pas de bandeau : on croirait que l'avis ne dit rien.
   */
  const avisRouge = avis === null ? null
    : avis.humain ?? motifNonRemise(lireAvis(etat.v === 'texte' ? etat.texte : null));

  return (
    /**
     * LOT FIL-LECTURE — `data-message` : QUEL message est cette ligne.
     *
     * 🔴 POURQUOI IL EXISTE. L'ordre d'affichage est devenu un RÉGLAGE (plus récent d'abord, ou l'inverse) : plus
     * rien ne garantit qu'un message occupe la même position d'un écran à l'autre. Tout ce qui désignait un message
     * « par sa place dans la liste » — au premier chef les tests — désignait donc un message différent selon le
     * réglage, sans rien dire. Deux tests s'y sont pris les pieds le jour même. L'attribut rend l'identité lisible
     * dans le DOM, pour les tests comme pour qui inspecte l'écran.
     */
    <li data-message={message.messageId}
      className={`cnv-msg${message.horsFile ? ' cnv-msg--hors' : ''}${echec?.definitif ? ' cnv-msg--echoue' : ''}`}>
      {/* LOT BARRE-STATUT — la fenêtre des rattachements, ouverte depuis « Visualiser / Modifier » de l'en-tête.
          Elle se rend AU NIVEAU DU MESSAGE, jamais dans son en-tête : celui-ci est une rangée serrée de boutons. */}
      {voirRattachements && filId !== null && (
        <RattachementsDuFil filId={filId} titre={nettoyerObjet(message.objet ?? '') || null}
          /* 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE — ouverte depuis CE mail, elle ne montre que SES biens.
             Voir l'encadré de `messageId` dans `RattachementsDuFil`. */
          messageId={message.messageId}
          onFerme={() => setVoirRattachements(false)}
          onGeste={() => { setVoirRattachements(false); void onRattachement?.(); }} />
      )}

      {/* 🔴 LOT STATUT-PAR-MAIL — « Classer ce mail » : portée, biens, parties à la date du mail. Rien n'est écrit
          avant sa validation, et elle passe par la porte existante des rattachements. */}
      {classerCeMail && (
        <ClasserMail messageId={message.messageId} filId={filId}
          objet={nettoyerObjet(message.objet ?? '') || null}
          onFerme={() => setClasserCeMail(false)}
          onGeste={onGesteRattachement}
          onFait={async () => { await onRattachement?.(); }} />
      )}

      {/* ══ LOT ENVOI-DIAG — CE MESSAGE N'EST PAS ARRIVÉ ══════════════════════════════════════════════════════════
          🔴 AU-DESSUS DE TOUT LE RESTE, EN MOTS, ET HORS DU BOUTON. Au-dessus parce que c'est l'information qui
          change la suite (il faut réécrire, ou appeler) ; en mots parce qu'une couleur seule ne se lit ni en niveaux
          de gris ni pour un daltonien ; hors du bouton parce que la ligne repliée EST un bouton, et qu'un bouton
          dans un bouton est invalide et injouable au clavier — la même raison que pour le cartouche de statut.
          `role="status"` : un lecteur d'écran l'annonce sans qu'on lui vole le focus. */}
      {echec && (
        <p className={`cnv-nonremise${echec.definitif ? ' cnv-nonremise--definitif' : ''}`} role="status">
          {echec.definitif ? '⚠ ' : ''}{echec.texte}
        </p>
      )}
      {/* LE MENU DU MAIL — effacé au repos (décision d'Arno : pas de boutons partout), mais toujours atteignable, y
          compris message REPLIÉ. Il est le VOISIN de la ligne, pas son enfant : la ligne EST un bouton, et un bouton
          dans un bouton est invalide et injouable au clavier. C'est la même solution que pour `BlocRepliable`. */}
      {/* ══ 🔴 LOT FIL-LECTURE-2 — UNE LIGNE, UN SEUL FOND ═══════════════════════════════════════════════════
          Le survol était posé sur le seul bouton de gauche : la moitié gauche de la ligne devenait grise, la
          moitié droite (statut, heure, étoile, ⋮) restait blanche. Deux fonds sur une même ligne donnent à voir
          deux objets là où il n'y en a qu'un.

          🔴 L'ENVELOPPE N'EST PAS UN BOUTON — elle en contient (le cartouche, l'étoile, le menu), et un bouton dans
          un bouton est invalide et injouable au clavier. Elle porte le FOND, rien d'autre : `:hover` et
          `:focus-within` la colorent d'un bloc, et le bouton de gauche n'a plus de fond propre.

          ⚠️ ELLE N'ENVELOPPE QUE L'EN-TÊTE, pas le message déplié : survoler le corps d'un mail ne doit pas
          allumer sa ligne de titre. */}
      <div className="cnv-rangee">
      {/* ══ 🔴🔴 LOT LECTURE-HTML-FIL-TROMBONE — LE TRIANGLE, À GAUCHE DE CHAQUE MESSAGE ═══════════════════════════
          ▶ replié, ▼ déplié, avec une rotation animée. Demande d'Arno : « assez grand pour occuper la hauteur des
          DEUX premières lignes » — celle de l'expéditeur et celle de l'objet.

          🔴 IL EST LE VOISIN DE LA LIGNE, PAS SON ENFANT, et ce n'est pas un choix de mise en page : la ligne EST
          un bouton, et un bouton dans un bouton est du HTML invalide et injouable au clavier. C'est la même
          contrainte qui gouverne déjà le cartouche de statut, l'étoile et le menu « ⋮ » de cette rangée.

          🔴 ET IL EST INVISIBLE AU CLAVIER (`aria-hidden`, `tabIndex -1`). L'action existe DÉJÀ sur la ligne, qui
          porte `aria-expanded` : en faire un second arrêt de tabulation obligerait à passer deux fois au même
          endroit pour la même chose, et un lecteur d'écran annoncerait deux boutons pour un seul geste. À la
          souris, en revanche, il se clique — c'est là qu'on va spontanément.

          ⚠️ IL N'A AUCUN ÉTAT PROPRE : il lit `ouvert`. « Tout déplier », « Tout replier » et le changement
          d'ordre le mettent donc à jour d'eux-mêmes, sans une ligne de plus. */}
      <button type="button" className={`cnv-triangle${ouvert ? ' cnv-triangle--ouvert' : ''}`}
        aria-hidden="true" tabIndex={-1} onClick={onBasculer}>
        {/* ⚠️ 18 px, et non 15 : à 15, le triangle se perdait dans la hauteur des deux lignes qu'il commande —
            vu à l'écran sur le fil 36505. Arno demandait « assez grand pour occuper leur hauteur ».
            🔴 LOT FIL-APERCU-MINIATURES — 36 px : LE DOUBLE, demandé par Arno. Son comportement ne change pas, et
            il reste CENTRÉ sur les deux premières lignes — c'est la hauteur fixe de `.cnv-triangle` qui le tient
            là, jamais la taille du dessin. */}
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false">
          <path d="M9 5l8 7-8 7z" fill="currentColor" />
        </svg>
      </button>
      {/* La LIGNE REPLIÉE est le bouton : toute la largeur, au moins 44 px, et l'état annoncé par `aria-expanded`. */}
      <button type="button" className="cnv-ligne" aria-expanded={ouvert} onClick={onBasculer}>
        {/* Le SENS est dit par un MOT (« reçu de » / « envoyé à ») : il reste lisible en niveaux de gris. */}
        <span className="cnv-qui">{libelleSens(message.sens)} {qui}</span>
        {/* LOT FIL-LECTURE — L'OBJET DE CE MESSAGE, à côté de l'expéditeur. Dans un échange où l'objet a changé en
            route (« Re: … » devenu autre chose), la ligne repliée ne disait plus de quoi elle parlait. */}
        <span className="cnv-objet">
          <span className="cnv-objet-mot">Objet :</span> {nettoyerObjet(message.objet) || '(sans objet)'}
        </span>
        {/* Une mention EN MOTS : elle reste lisible en niveaux de gris et pour un daltonien. */}
        {hors && <span className="cnv-hors">{hors}</span>}
        {/* ══ 🔴🔴 LOT BROUILLONS-GMAIL — « Brouillon », EN ROUGE, COMME DANS GMAIL ═══════════════════════════════
            Elle se voit sur le message auquel une réponse est commencée, MÊME quand on arrive par la Réception
            sans être passé par la liste des brouillons : sans elle, un travail en cours restait invisible tant
            qu'on ne pensait pas à aller le chercher sous son étiquette.
            ⚠️ UN MOT, pas seulement une couleur : « Brouillon » se lit en niveaux de gris et au lecteur d'écran. */}
        {/* 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LE PICTO « BROUILLON EN ATTENTE », sur la ligne du mail
            concerné. Arno : « on voit quel mail a un brouillon ». Le crayon porte son nom (`aria-label`) et sa
            bulle (`title`) ; le MOT reste à côté, parce qu'un picto seul ne se lit pas en niveaux de gris. */}
        {avecBrouillon && (
          <span className="cnv-brouillon" title={AIDE_BROUILLON_EN_ATTENTE}>
            <span className="cnv-brouillon-picto" role="img" aria-label={AIDE_BROUILLON_EN_ATTENTE}>{PICTO_BROUILLON}</span>
            Brouillon
          </span>
        )}
        {!ouvert && message.extrait && <span className="cnv-extrait">{corpsLisible(message.extrait).visible}</span>}
      </button>

      {/* ══ LE COIN DE L'EN-TÊTE : statut · date · menu ═══════════════════════════════════════════════════════════
          🔴 VOISIN de la ligne, jamais son enfant. La ligne EST un bouton, et le cartouche en contient (« Modifier »,
          un lien vers la carte) : un bouton dans un bouton est invalide et injouable au clavier. C'est la solution
          déjà retenue pour le menu « ⋯ » et pour `BlocRepliable`.
          L'ORDRE DU DOM est aussi l'ordre mobile : sous la ligne, le cartouche passe donc sous le nom de
          l'expéditeur quand la place manque — exactement ce qu'Arno a demandé. */}
      {/* ══ LOT 5-FIDÈLE — L'EN-TÊTE DE GMAIL, DANS SON ORDRE ═════════════════════════════════════════════════════
          [statut] · heure · étoile · flèche Répondre · ⋮ — les mêmes places que dans Gmail, parce que l'équipe y
          travaille toute la journée et ne doit pas réapprendre où viser. */}
      <div className="cnv-coin">
        {/* ══ 🔴🔴 LOT FIL-APERCU-MINIATURES — LE TROMBONE DE CE MESSAGE, À GAUCHE DE LA CAPSULE ═══════════════
            Demande d'Arno : « chaque ligne de message qui contient au moins une pièce jointe affiche le trombone
            et le nombre de pièces DE CE MESSAGE, en NOIR, placé à gauche de la capsule de statut, comme dans la
            liste ».

            🔴 LE NOMBRE EST CELUI DE CE MESSAGE, ET DE LUI SEUL. Dans la LISTE, le trombone compte aussi les
            pièces du reste de la conversation (en gris) parce qu'une ligne y représente un ÉCHANGE ; ici une
            ligne EST un message, et la question « combien de pièces dans CELUI-CI » a une réponse exacte. D'où
            le noir, toujours : il n'y a rien d'« ailleurs » à signaler.

            🔴 LES « ._ » ET LES IMAGES DE SIGNATURE NE COMPTENT PAS, et la règle n'est pas réécrite ici : c'est
            `trierPieces` — la même fonction que le bloc des pièces jointes affiché sous le message, et que la
            liste. Une seconde définition de « vraie pièce » aurait fini par compter autrement, et le trombone
            aurait annoncé 3 là où le message en montre 1.

            ⚠️ AUCUN TROMBONE SANS PIÈCE : pas de zéro, pas de trombone éteint. Une marque qui ne dit rien est du
            bruit sur toutes les lignes qui n'ont rien. */}
        {vraies.length > 0 && (
          <span className="cnv-pieces"
            title={vraies.length > 1
              ? `${vraies.length} pièces jointes dans ce message`
              : '1 pièce jointe dans ce message'}>
            <span aria-hidden="true">📎</span> {vraies.length}
          </span>
        )}
        {/* ══ 🔴 LOT STATUT-PAR-MAIL — LA CAPSULE DU MAIL, EN PREMIER ═══════════════════════════════════════════
            C'est LE statut du message : rattaché à un bien, ou non. Le MOT est toujours écrit ; la couleur ne fait
            que l'appuyer.

            🔴 LE CLIC SUIT LE STATUT, comme la barre d'une ligne de liste. « À classer » ⇒ la fenêtre de CLASSEMENT,
            celle qui propose les biens et leurs parties. « Classé » / « Auto » ⇒ la fenêtre de CONSULTATION, qui
            montre où c'est rangé et mène à la modification. On ne fait pas ouvrir la même fenêtre aux deux : depuis
            un mail à classer, la liste des rattachements existants est vide — elle n'aidait à rien. */}
        {capsule !== null && (
          <button type="button"
            className={`cnv-capsule cnv-capsule--${capsule}`}
            title={bulleCapsuleMessage(capsule, biensDuMail, marque?.motif ?? null)}
            /* 🔴 LE CLIC SUIT LE STATUT — et « Hors gestion » mène À LA FENÊTRE DE CLASSEMENT, parce que c'est là
               qu'on annule la marque ou qu'on rattache un bien. La fenêtre de CONSULTATION des rattachements, elle,
               n'aurait rien à montrer : un mail hors gestion n'en a aucun. */
            onClick={() => (capsule === 'a_classer' || capsule === 'hors_gestion'
              ? setClasserCeMail(true)
              : filId !== null ? setVoirRattachements(true) : undefined)}>
            {motCapsule(capsule)}
          </button>
        )}
        {/* ══ 🔴🔴 LOT SUIVI-CONVERSATION — « exception : <biens> » ════════════════════════════════════════════
            Demande d'Arno, mot pour mot. Elle se lit À CÔTÉ de la capsule, et non à sa place : la capsule dit
            le STATUT (classé, à classer…), la mention dit SOUS QUELLE RÈGLE — « ce mail-ci, et pas les
            autres ». Deux informations différentes, et celle-ci n'existe que sur quelques mails. */}
        {exception !== null && (
          <span className="cnv-exception" title="Ce mail est classé à part : la période de la conversation ne
 s’applique pas à lui.">
            exception : {exception}
          </span>
        )}
        {/* LA MENTION D'ÉVÉNEMENT, DISCRÈTE ET DISTINCTE. Elle ne dit plus jamais « À classer » : son libellé est
            préfixé « Événement : », pour qu'on ne puisse plus la lire comme un verdict de classement. Rien du
            système d'événements n'est retiré — ses gestes restent derrière le même bouton qu'avant. */}
        {statut && (
          <CartoucheStatut statut={statut} ouvert={actions}
            declencheur={visualisable ? 'Visualiser / Modifier' : propositions.declencheur}
            vert={visualisable}
            onBasculer={visualisable
              ? () => setVoirRattachements(true)
              : (onActionStatut ? () => setActions((v) => !v) : undefined)} />
        )}
        {/* L'heure façon Gmail : « 19:07 (il y a 3 heures) », « hier 17:24 », « 22 sept. 18:44 ». */}
        <span className="cnv-quand" title={dateHeureComplete(message.recuLe)}>{heureGmail(message.recuLe, maintenant)}</span>

        {/* L'ÉTOILE — elle bascule le libellé STARRED dans la VRAIE boîte, et son état est relu DANS GMAIL.
            Sans connexion Google, elle n'est pas affichée : on ne montre pas une étoile éteinte qui ne dirait rien. */}
        {gmail?.etat && onEtoile && (
          <button type="button" className={`cnv-etoile${gmail.etat.etoile ? ' cnv-etoile--posee' : ''}`}
            aria-pressed={gmail.etat.etoile} aria-label={libelleEtoile(gmail.etat.etoile)} title={libelleEtoile(gmail.etat.etoile)}
            onClick={onEtoile}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
              fill={gmail.etat.etoile ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* LA FLÈCHE RÉPONDRE — le geste le plus fréquent, atteignable sans ouvrir le menu, comme dans Gmail. */}
        {onRepondre && (
          <button type="button" className="cnv-icone" aria-label="Répondre" title="Répondre"
            onClick={() => onRepondre('repondre')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 7L4 12l5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 12h9a6 6 0 016 6v1" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* LE MENU « ⋮ » — mêmes mots, même ordre, mêmes séparateurs que Gmail. Il garde AUSSI nos entrées maison,
            rangées sous « Gestion » : « Déplacer ce mail », « Détacher ce mail ». */}
        <MenuDiscret titre="Actions sur ce message" glyphe="⋮" entrees={
          menuMessage({ nomExpediteur: qui, avecGestes: Boolean(onDeplacer || onRemettre) })
            .filter((e) => (e.cle === 'deplacer_mail' ? Boolean(onDeplacer) : e.cle === 'detacher_mail' ? Boolean(onRemettre) : true))
            .map((e) => ({
              libelle: e.libelle,
              aide: e.aide,
              separateurAvant: e.separateurAvant,
              section: e.section,
              discrete: e.cle === 'detacher_mail',
              onChoisir: () => {
                if (e.cle === 'deplacer_mail') { onDeplacer?.(); return; }
                if (e.cle === 'detacher_mail') { onRemettre?.(); return; }
                onActionMessage?.(e.cle);
              },
            }))
        } />
      </div>
      </div>

      {/* LES GESTES RÉVÉLÉS — pleine largeur, donc empilés d'eux-mêmes sur téléphone. Ils appellent les routes qui
          existaient avant ce lot : aucune logique nouvelle, même journal, même réversibilité. */}
      {statut && onActionStatut && actions && propositions.actions.length > 0 && (
        <div className="cnv-statut-actions" role="group" aria-label={`Classement — ${libelleCartouche(statut)}`}>
          {propositions.actions.map((a) => (
            <button key={a.cle} type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { setActions(false); onActionStatut(a.cle); }}>
              {a.libelle}
            </button>
          ))}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setActions(false)}>
            Annuler
          </button>
        </div>
      )}

      {panneau}

      {ouvert && (
        <div className="cnv-detail">
          {/* ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — « BROUILLON DE RÉPONSE EN ATTENTE — VOIR EN BAS » ═══════
              Arno : « en haut du mail ouvert, une mention qui fait défiler jusqu'à la zone de réponse. »

              🔴 ELLE TIENT SA PROMESSE : le clic emmène au pied du message, là où l'éditeur est rendu. Une
              mention qui dirait où regarder sans y conduire ferait chercher.

              ⚠️ ELLE N'APPARAÎT QUE SI LE MAIL A VRAIMENT UN BROUILLON : c'est la même source que le picto de
              la ligne — les brouillons VIVANTS de l'échange, lus en base, jamais un état d'écran. */}
          {brouillonEnAttente && (
            <button type="button" className="cnv-brouillon-haut"
              onClick={() => pied.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })}>
              <span className="cnv-brouillon-picto" aria-hidden="true">{PICTO_BROUILLON}</span>
              {MENTION_BROUILLON_VOIR_EN_BAS}
            </button>
          )}
          {/* ══ 🔴 LOT FIL-LECTURE — L'EN-TÊTE COMPACT : UN INTITULÉ, UNE LIGNE ═══════════════════════════════
              Avant ce lot, l'intitulé était au-dessus de sa valeur : quatre intitulés faisaient huit lignes, pour
              cinq mots d'information. Chaque ligne porte désormais son intitulé à gauche et sa valeur à droite,
              et les destinataires multiples restent sur la MÊME ligne, séparés par des virgules — ils ne passent
              à la ligne que si la largeur ne suffit pas (c'est la feuille de style qui le décide, pas nous).

              ⚠️ TOUTES LES LIGNES PASSENT PAR LE MÊME ENVELOPPE `div` — y compris « De » et « Date », qui ne
              l'avaient pas. Sans cela, une ligne sur deux aurait une grammaire différente et la mise en colonnes
              ne tiendrait que pour la moitié d'entre elles. (Un `div` groupant `dt`/`dd` dans un `dl` est du HTML
              parfaitement valide.)

              🔴 L'OBJET EN PREMIÈRE LIGNE — demande d'Arno. Un message repris six mois plus tard n'a pas forcément
              l'objet du fil : c'est le sien qu'il faut lire, et il n'était affiché nulle part. */}
          {/**
            * ══ 🔴🔴 LOT DRIVE-HABILLAGE, POINT 4 — LA CORBEILLE **DANS** LE BLOC GRIS ════════════════════════════
            *
            * DEMANDE D'ARNO (03/10/2026) : « le bloc gris De / À / Date reprend toute la largeur comme avant. La
            * corbeille est intégrée DANS ce bloc, à l'extrême DROITE, dans une case blanche (fond de carte du
            * thème) à coins arrondis, bien intégrée à la trame grise, avec la même icône et le même comportement
            * (Annuler compris). »
            *
            * 🔴 CE QUI ÉTAIT ÉCRIT, ET CE QUE CELA COÛTAIT. Le lot COMPTEURS avait posé une RANGÉE
            * (`cnv-entete-rangee`) : le `<dl>` gris et le bouton côte à côte, en frères. Le bloc gris perdait donc
            * 52 px de largeur sur toute sa hauteur, et l'icône flottait à sa droite, sur le fond de la page — deux
            * surfaces au lieu d'une. Le bloc reprend toute la largeur, et la corbeille est DEDANS.
            *
            * 🔴 ELLE EST POSITIONNÉE, PAS INSÉRÉE DANS LE FLUX, et c'est la condition pour que « le bloc ne bouge
            * pas » : une ligne de plus dans le `<dl>` aurait décalé « De », « À » et « Date » vers le bas. Le
            * `<dl>` garde exactement sa grammaire et sa mise en colonnes ; il réserve seulement, à droite, la
            * place de la case (`padding-right`).
            *
            * ⚠️ UN `<button>` NE PEUT PAS ÊTRE ENFANT DIRECT D'UN `<dl>` (le modèle de contenu n'accepte que
            * `dt`/`dd`/`div`). Il vit donc dans un `div`, comme chacune des lignes au-dessus — c'est du HTML
            * parfaitement valide, et c'est déjà la grammaire de ce bloc depuis le lot FIL-LECTURE.
            */}
          {/* ⚠️ LA PLACE N'EST RÉSERVÉE QUE S'IL Y A UNE CORBEILLE (`--avec-corbeille`) : là où les gestes ne sont
              pas permis — l'historique d'une cible, la vie d'un bien — le bloc n'aurait eu qu'une gouttière vide
              à droite. Une classe plutôt qu'un `:has()` : elle dit l'intention, et elle ne dépend d'aucun
              navigateur. */}
          <dl className={`cnv-entete${onCorbeilleMessage !== undefined ? ' cnv-entete--avec-corbeille' : ''}`}>
            {/* ⚠️ PAS DE LIGNE « OBJET » ICI — LOT FIL-LECTURE-2. Elle y a vécu une journée : l'objet apparaissait
                alors DEUX fois, sous « reçu de … » et dans cet en-tête, à trois centimètres d'écart. Celui du haut
                a gagné : il est visible message replié comme déplié, alors que celui-ci ne l'était que déplié.
                Une information affichée deux fois n'est pas deux fois plus lue — elle fait douter qu'il s'agisse
                de la même. */}
            <div className="cnv-entete-ligne">
              <dt>De</dt>
              <dd>{message.deNom?.trim() ? `${message.deNom.trim()} <${message.de}>` : message.de}</dd>
            </div>
            {lignesDestinataires(message).map((l, i) => (
              <div key={`${l.champ ?? 'fondu'}-${i}`} className="cnv-entete-ligne">
                <dt>{l.champ ?? 'À'}</dt>
                <dd>
                  {l.valeur}
                  {/* Dire qu'on ne sait pas est une information ; laisser croire qu'on sait n'en est pas une. */}
                  {l.approximatif && <span className="cnv-note"> — destinataires non détaillés</span>}
                </dd>
              </div>
            ))}
            <div className="cnv-entete-ligne">
              <dt>Date</dt>
              <dd>{dateHeureComplete(message.recuLe)}</dd>
            </div>
            {/* 🔴 LE MOT EST LE MÊME POUR LA BULLE ET POUR LE LECTEUR D'ÉCRAN : une corbeille dessinée ne dit pas
                CE QU'ELLE JETTE — « ce message », et non l'échange, est toute la différence.
                🔴🔴 LOT DRIVE-HABILLAGE, POINT 4 — ELLE EST MAINTENANT DANS LE BLOC, à l'extrême droite, dans sa
                case au fond de carte. Le geste et son « Annuler » sont EXACTEMENT ceux d'avant : seul le
                `className` du conteneur change, l'appel ne bouge pas. */}
            {/* ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — LA CORBEILLE, OU « RÉINTÉGRER » ═══════════
                Sur un mail DÉJÀ à la corbeille, la grande icône change de sens : même case blanche, même taille,
                même place (demande d'Arno), et une info-bulle qui NOMME la boîte d'origine.

                🔴 LE GESTE EST CELUI DU MENU « … », par la même porte : `gesteCorbeilleMessage(id, false)`, celle
                qu'« Annuler » emprunte déjà. Aucun second appel n'est écrit pour ce bouton.

                ⚠️ LA BOÎTE D'ORIGINE SE DÉDUIT DU MESSAGE LUI-MÊME : son sens, et le fait qu'une règle le tienne
                hors de la file. `spam: false` est la seule chose que ce fil ne sait pas — il ne porte aucune
                marque spam par message — et c'est pourquoi l'encadré d'`aideIconeReintegrer` prévoit ce cas :
                mieux vaut nommer la boîte que le sens désigne que taire l'information. */}
            {message.aLaCorbeille && onReintegrerMessage !== undefined ? (
              <div className="cnv-entete-corbeille">
                <button type="button" className="cnv-corbeille cnv-corbeille--retour"
                  title={aideIconeReintegrer(boiteDuMessage(message))}
                  aria-label={aideIconeReintegrer(boiteDuMessage(message))}
                  onClick={onReintegrerMessage}>
                  <span aria-hidden="true">{PICTO_REINTEGRER}</span>
                </button>
              </div>
            ) : onCorbeilleMessage !== undefined && (
              <div className="cnv-entete-corbeille">
                <button type="button" className="cnv-corbeille"
                  title={AIDE_CORBEILLE_MESSAGE} aria-label={AIDE_CORBEILLE_MESSAGE}
                  onClick={onCorbeilleMessage}>
                  <span aria-hidden="true">🗑</span>
                </button>
              </div>
            )}
          </dl>

          {/* LOT RATTACHEMENT-1 — DE QUOI CE MAIL PARLE-T-IL ? Juste sous l'en-tête, avant le texte : c'est une
              donnée du mail, pas un commentaire sur son contenu. Il ne s'affiche que si la conversation a pu lire les
              rattachements (migration 257 appliquée) — sinon rien, et le message est exactement celui d'avant. */}
          {onRattachement && (
            <EncartRattachement messageId={message.messageId} filId={filId} liens={rattachements}
              /* 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — les deux autres réponses vertes : « Interne » porte sur
                 l'ÉCHANGE (migration 281), « Hors gestion » sur CE mail (migration 266). Sans elles, le bloc
                 aurait proposé deux boutons au-dessus d'un mail déjà classé. */
              interne={interne}
              horsGestion={marque !== null}
              onInterne={onInterne}
              onHorsGestion={onHorsGestion}
              onChange={onRattachement} onGeste={onGesteRattachement} onHistorique={onHistorique} />
          )}

          {/* ══ 🔴 LOT AVIS-LISIBLE — LE PASSAGE LISIBLE DE L'AVIS, EN ROUGE, EN HAUT DU CORPS ════════════════════
              `role="status"` et non `alert` : un lecteur d'écran l'annonce sans interrompre la lecture en cours.
              La COULEUR N'EST QU'UN RENFORT — le texte dit tout, et reste lisible en niveaux de gris. */}
          {avisRouge !== null && avisRouge.trim() !== '' && (
            <p className="gst-msg-corps cnv-avis" role="status">{avisRouge}</p>
          )}
          {etat.v === 'texte' && lisible !== null && (
            <>
              {/* Quand l'avis a été isolé, le corps reprend À LA PARTIE TECHNIQUE : la répéter au-dessus en rouge
                  PUIS en noir afficherait deux fois la même phrase. Sinon, le corps entier, comme avant ce lot. */}
              <p className="gst-msg-corps">{(avis !== null ? avis.technique : lisible.visible) || '(message sans texte)'}</p>
              {/* ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LA CITATION EST VISIBLE, EN RETRAIT ═══════════════════════
                  Elle vivait dans un `<details>` : « Afficher le message cité », replié par défaut. Arno l'a fait
                  retirer, et il a raison — une conversation se lit d'un bout à l'autre, et ce repli obligeait à
                  cliquer pour savoir à quoi on répondait. On la garde donc VISIBLE, simplement mise à distance
                  par un retrait et un filet gris : l'œil sait ce qui est nouveau sans avoir à cliquer.

                  ⚠️ LE STYLE PORTE TOUT, ET IL N'Y A PLUS AUCUN ÉTAT. Plus de repli, donc plus rien à ouvrir, à
                  fermer, à retenir entre deux rendus. C'est un retrait de code autant qu'un changement d'écran. */}
              {lisible.cite && (
                <blockquote className="gst-cite-bloc">
                  <p className="gst-msg-corps gst-cite-corps">{lisible.cite}</p>
                </blockquote>
              )}
            </>
          )}
          {etat.v === 'a_charger' && <p className="gst-info" role="status">Chargement du message…</p>}

          {/* ══ 🔴 LOT BIEN-RATTACHE — LE CORPS EN MISE EN FORME, AFFICHÉ ═══════════════════════════════════════
              1 180 mails en base n'ont QUE du HTML (les avis d'appel de provisions d'un syndic, par exemple) :
              l'écran leur opposait « affichage à venir ». Ils s'affichent désormais.

              🔴 LE HTML POSÉ ICI EST DÉJÀ ASSAINI PAR LE SERVEUR (`lireCorpsDuMessage` → `assainirHtml`) : ni
              script, ni attribut d'événement, ni `<style>`, et les images selon la règle déjà en place. Le
              navigateur ne voit jamais le HTML brut — c'est ce qui rend ce `dangerouslySetInnerHTML` acceptable,
              et rien d'autre. Assainir côté client aurait suffi à une réponse forgée pour poser ce qu'elle veut.

              ⚠️ `cnv-html` BORNE CE QU'IL REÇOIT : largeur maximale, images contenues, tableaux qui défilent dans
              leur propre cadre. Sans cela, un mail de syndic large de 900 px pousse toute la conversation. */}
          {/* 🔴 LOT SOMBRE-ET-RECHERCHE — le texte noir d'un mail se relève À L'ÉCRAN en thème Sombre. Rien n'est
              réécrit : ni le HTML stocké, ni ce qui repart en transfert ou en réponse. */}
          {/* ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE CORPS D'UN MAIL REÇU VIT DANS SON PROPRE CADRE ════════════
              Décision d'Arno (03/10/2026) : un cadre isolé, bac à sable SANS `allow-scripts`, CSP
              `script-src 'none'`. Il garde les `<style>` d'en-tête du mail — 34 366 mails en portent qui
              changent le rendu — et ils ne peuvent peindre QUE le mail.
              🔴 TOUT CE QUI EXISTAIT EST GARDÉ : hauteur automatique (aucune barre interne), clic pour agrandir
              une image dans la visionneuse, liens en nouvel onglet, fond blanc en thème Sombre.
              ⚠️ DEUX SOURCES POUR LA FEUILLE, ET C'EST VOULU : le message déplié d'emblée la reçoit AVEC le fil
              (`message.cssMail`) ; ceux qu'on ouvre ensuite la reçoivent avec leur corps (`cssMailCharge`).
              C'est le même chemin que le HTML lui-même, à la ligne près. */}
          {etat.v === 'html' && (
            <CadreMail html={etat.html} cssMail={cssMailCharge ?? message.cssMail ?? null} onVisualiser={onVisualiser}
              titre={`Corps du message — ${message.objet ?? 'sans objet'}`} />
          )}
          {etat.v === 'html_a_charger' && <p className="gst-info" role="status">{MENTION_HTML_SEUL}</p>}
          {etat.v === 'vide' && <p className="gst-msg-corps gst-absent">(message sans texte)</p>}

          {/* LOT 5-PJ-A — un SEUL composant rend les pièces, partout où un message s'affiche.
              🔴 LOT PIECES-DE-LA-CONVERSATION — `onVisualiser` fait ouvrir la visionneuse MAISON au lieu d'un
              nouvel onglet, avec le tour de TOUTE la conversation. Absent (historique d'une cible, vie d'un bien),
              la vignette garde le lien d'avant : il n'y a pas là de conversation dont on pourrait faire le tour. */}
          {/* 🔴 LOT RANGER-INSTANTANE-ET-NOM — une pièce renommée au stylo puis rangée change de nom dans la base :
              seule la conversation sait relire le fil, et c'est de là que vient le nom affiché sur la carte. */}
          <PiecesJointes messageId={message.messageId} filId={filId} vraies={vraies} signatures={signatures}
            onVisualiser={onVisualiser} onNomChange={onNomChange} />

          {/* ══ 🔴 LOT FIL-LECTURE — RÉPONDRE À **CE** MESSAGE, PAS AU DERNIER DU FIL ═══════════════════════════
              Les trois gestes sous CHAQUE message déplié, et non plus seulement la flèche du coin. Chacun porte sur
              le message sous lequel il se trouve : `onRepondre` est déjà appelé par la conversation avec CE
              message-là (`ouvrirRedaction(voie, [m], …)`), donc destinataires, citation, objet « Re:/Fwd: » et
              en-têtes In-Reply-To / References se calculent à partir de lui.

              🔴 CE QUE ÇA RÉPARE. Répondre à un message d'il y a trois semaines rédigeait jusqu'ici une réponse au
              DERNIER message de l'échange : mauvais destinataires, mauvaise citation, et une réponse qui se
              raccrochait au mauvais endroit du fil chez le correspondant. Personne ne l'aurait vu avant l'envoi.

              ⚠️ Ils n'apparaissent QUE si la conversation sait rédiger (`onRepondre` fourni) : sans droit d'écriture
              ou sans contexte de rédaction, l'écran est exactement celui d'avant ce lot. */}
          {onRepondre && (
            <div className="cnv-repondre" role="group" aria-label="Répondre à ce message">
              {([['repondre', 'Répondre'], ['repondre_tous', 'Répondre à tous'], ['transferer', 'Transférer']] as const)
                .map(([voie, mot]) => (
                  <button key={voie} type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => onRepondre(voie)}>
                    <IconeVoie voie={voie} />
                    <span>{mot}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {/* L'ÉDITEUR, S'IL APPARTIENT À CE MESSAGE. En dernier, après les pièces jointes : on répond sous ce qu'on
          vient de lire, pas au milieu.
          🔴 L'ANCRE DU DÉFILEMENT : c'est ici que la mention du haut emmène (voir `cnv-brouillon-haut`). */}
      <div ref={pied}>{piedMessage}</div>
    </li>
  );
}

/**
 * LOT 5-STATUT — LE CARTOUCHE : où en est ce message, en UN COUP D'ŒIL et EN TOUTES LETTRES.
 *
 * 🔴 LE MOT EST TOUJOURS ÉCRIT — « À classer », « Sans suite », « Courrier automatique », ou la référence GES-… avec
 * le titre de la carte. Le ton (vert pour une carte) ne fait que l'appuyer : seul, il serait muet en niveaux de gris,
 * pour un daltonien, et pour un lecteur d'écran.
 *
 * CLIQUABLE VERS LA CARTE quand il y en a une : le lien mène à la boîte en plein écran, sous l'étiquette de cette
 * carte — un écran qui existe déjà. Sans identifiant, pas de lien : un lien mort use la confiance plus qu'il ne sert.
 */
export function CartoucheStatut({ statut, ouvert, declencheur, onBasculer, vert = false }: {
  statut: StatutClassement;
  ouvert: boolean;
  /** Le mot du bouton qui révèle les gestes (« Classer », « Modifier »). `null` = ce statut n'en propose aucun. */
  declencheur: string | null;
  /** Absent = cartouche de CONSTAT, sans bouton (mail déplacé seul, courrier automatique). */
  onBasculer?: () => void;
  /**
   * LOT BARRE-STATUT — le déclencheur passe au VERT quand l'échange porte un rattachement confirmé, exactement
   * comme le bouton de la barre d'une ligne. Le MOT change avec lui : la couleur ne porte jamais l'information.
   */
  vert?: boolean;
}) {
  const mot = libelleCartouche(statut);
  const precision = precisionCartouche(statut);
  const lien = lienVersCarte(statut);
  return (
    <span className="cnv-statut">
      {lien
        ? <a className={`cnv-cartouche cnv-cartouche--${tonCartouche(statut)}`} href={lien} title={precision ?? undefined}>{mot}</a>
        : <span className={`cnv-cartouche cnv-cartouche--${tonCartouche(statut)}`} title={precision ?? undefined}>{mot}</span>}
      {declencheur && onBasculer && (
        <button type="button" className={`cnv-statut-bouton${vert ? ' cnv-statut-bouton--vert' : ''}`}
          aria-expanded={ouvert} onClick={onBasculer}>
          {declencheur}
        </button>
      )}
    </span>
  );
}

/**
 * ⚠️ EXPORTÉE POUR ÊTRE ÉPROUVÉE (lot LECTURE-HTML-FIL-TROMBONE). Le triangle ▶ / ▼ ne tient qu'à cette feuille —
 * rotation, couleur de charte, respect de « moins d'animation » — et rien de tout cela ne se voit dans le DOM
 * d'un test : jsdom n'applique aucune feuille. On éprouve donc la RÈGLE à la source, plutôt que de vérifier où
 * quelqu'un a branché la feuille.
 */
export const CSS_CONVERSATION = `
.cnv{display:flex;flex-direction:column;gap:12px;min-width:0}
.cnv-bandeau{display:flex;flex-direction:column;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--color-svv-line)}
.cnv-bandeau-haut{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cnv-menu{margin-left:auto}
/* ── LOT 5-GMAIL : LA BARRE D'ACTIONS ───────────────────────────────────────────────────────────────────────────── */
/* Elle COLLE en haut : sur une conversation de cent messages, les actions doivent rester sous la main sans remonter. */
.cnv-bandeau--barre{position:sticky;top:0;z-index:3;background:var(--color-svv-surface);padding-top:6px}
/* La flèche de retour : une CIBLE de 44 px, un libellé accessible, et un contour au focus bien visible. Un glyphe
   seul n'est pas un bouton : c'est son libellé accessible qui le rend utilisable au lecteur d'écran. */
.cnv-retour{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;
  font-size:20px;line-height:1;color:var(--color-svv-ink);background:transparent;border:1px solid transparent;
  border-radius:.5rem;cursor:pointer}
.cnv-retour:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.cnv-retour:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cnv-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
/* Les trois boutons d'écriture, sous la conversation — là où Gmail les met, et là où l'on regarde après avoir lu. */
.cnv-ecrire{padding-top:10px;border-top:1px solid var(--color-svv-line)}
.cnv-ref{font-weight:700;font-size:.85rem;color:var(--color-svv-green-ink)}
.cnv-etiquette{font-size:.75rem;font-weight:700;padding:.15rem .5rem;border:1px solid var(--color-svv-line-strong);border-radius:.5rem;color:var(--color-svv-muted)}
.cnv-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.cnv-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
/* L'EN-TÊTE D'UN MESSAGE : la ligne cliquable, puis son COIN (statut · date · menu) — deux frères, jamais imbriqués.
   Ils s'assoient côte à côte quand il y a la place, et le coin passe SOUS le nom de l'expéditeur quand elle manque. */
.cnv-msg{display:flex;flex-wrap:wrap;align-items:flex-start;border-bottom:1px solid var(--color-svv-line);min-width:0}
/* ══ 🔴🔴 LOT REPERE-INTEGRE — LE REPERE PREND LA PLACE DU SEPARATEUR, IL NE S'Y AJOUTE PAS ═══════════════════════
   Demande d'Arno : « sur le mail qui porte un repere, la ligne de separation grise du cote du repere (en bas en
   "Plus recent d'abord", en haut en "Plus ancien d'abord") est SUPPRIMEE. La phrase et le lisere rouge prennent
   exactement sa place. »

   🔴 UNE SEULE REGLE COUVRE LES DEUX TRIS, et c'est ce qui la rend juste. Le repere est TOUJOURS rendu juste
   apres le mail dont il depend en « plus recent d'abord », et juste avant lui en « plus ancien d'abord » — or
   dans ce second cas, le trait gris qui le precede appartient au mail PRECEDENT. Dans les deux cas, le trait a
   effacer est donc celui du mail qui est JUSTE AVANT le repere. Une regle par tri aurait fini par diverger.

   ⚠️ AUCUN ACCENT GRAVE ICI : il fermerait le litteral de gabarit (piege vu 11 fois dans ce depot).
   ⚠️ LE SELECTEUR :has() PLUTOT QU'UNE CLASSE POSEE PAR REACT : le voisinage se lit dans le document, et c'est exactement ce
   dont il s'agit. Une classe calculee aurait demande de connaitre, pour chaque mail, l'element qui le suit APRES
   le tri — une seconde verite a tenir a jour a chaque changement d'ordre.

   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-msg:has(+ .cnv-repere){border-bottom-color:transparent}
.cnv-msg--hors{background:var(--color-svv-field)}
.cnv-ligne{display:flex;flex-direction:column;gap:3px;flex:1 1 16rem;min-width:0;min-height:44px;padding:10px 4px;
  text-align:left;background:none;border:0;color:inherit;font:inherit;cursor:pointer}
/* 🔴 LE FOND EST SUR LA RANGÉE, PLUS SUR LE BOUTON. focus-within couvre le clavier : tabuler jusqu'à l'étoile ou
   au menu allume la même rangée qu'un survol de la souris.
   ⚠️ AUCUN ACCENT GRAVE ICI : littéral gabarit. */
.cnv-rangee{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0;flex:1 1 100%;min-width:0;border-radius:6px}
.cnv-rangee:hover,.cnv-rangee:focus-within{background:var(--color-svv-field)}
.cnv-rangee>.cnv-ligne{flex:1 1 16rem}
/* ══ 🔴 LE TRIANGLE ▶ / ▼ ════════════════════════════════════════════════════════════════════════════════════════
   HAUTEUR : celle des DEUX premieres lignes (expediteur + objet), pas celle de toute la ligne — sinon il
   descendrait au milieu de l'extrait des que le message est replie et en porte un. On la fixe donc, et l'on
   aligne le haut du triangle sur le haut du texte (meme padding vertical que .cnv-ligne).
   COULEUR : celle de la charte (le rouge SVAV), visible en Clair comme en Sombre puisqu'elle est un jeton.
   ROTATION : 90 degres, animee — et coupee net pour qui a demande moins d'animation. */
/* 🔴 LOT FIL-APERCU-MINIATURES — LE DESSIN A DOUBLE (18 -> 36 px), LA BOITE SUIT (26 -> 44 px de large).
   ⚠️ LA HAUTEUR NE BOUGE PAS : elle vaut toujours celle des DEUX premieres lignes, et c'est elle qui garde le
   triangle centre sur elles. L'elargir le ferait descendre dans l'extrait des qu'un message replie en porte un. */
.cnv-triangle{flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  width:44px;height:2.9rem;margin-top:10px;padding:0;border:0;background:none;cursor:pointer;
  color:var(--color-svv-red);border-radius:6px}
.cnv-triangle svg{transition:transform .18s ease}
.cnv-triangle--ouvert svg{transform:rotate(90deg)}
.cnv-triangle:hover{background:var(--color-svv-line)}
@media (prefers-reduced-motion:reduce){.cnv-triangle svg{transition:none}}
.cnv-rangee>.cnv-coin{flex:0 1 auto}
.cnv-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.cnv-coin{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;flex:0 1 auto;
  min-width:0;padding:6px 0}
/* 🔴 LOT FIL-APERCU-MINIATURES — LE TROMBONE DU MESSAGE. NOIR, c'est-a-dire la couleur du texte principal : elle
   suit le theme (noir en Clair, blanc en Sombre) parce que c'est un JETON, et jamais une couleur ecrite en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit, et un seul le refermerait (TS1005).
   ⚠️ white-space:nowrap — « 📎 2 » ne se coupe pas entre le trombone et son nombre, meme sur un telephone. */
.cnv-pieces{flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;
  font-size:.76rem;font-weight:600;color:var(--color-svv-ink)}
/* Les gestes révélés prennent la LARGEUR ENTIÈRE : ils s'empilent donc d'eux-mêmes sur un téléphone. */
.cnv-statut-actions{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 10px}
.cnv-statut{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}
/* ══ 🔴 LOT STATUT-PAR-MAIL — LA CAPSULE DU MAIL ═════════════════════════════════════════════════════════════════
   MEME GABARIT QUE CELLE DE LA LISTE (.bte-capsule) : c'est le MEME statut, il doit se reconnaitre au premier coup
   d'oeil d'un ecran a l'autre. Le MOT est toujours ecrit — la capsule reste lisible en niveaux de gris et pour un
   daltonien. C'est un BOUTON : il mene a la fenetre qui sert a changer ce statut. */
/* ══ 🔴🔴 LOT SUIVI-CONVERSATION — LE REPERE DE PERIODE, ET LA MENTION D'EXCEPTION ═════════════════════════════
   « une fine ligne de separation » (Arno) : fine, donc, et grise — elle separe, elle n'alerte pas. Le MOT porte
   l'information ; le trait n'est qu'un renfort, regle du module depuis la premiere capsule. */
/* ══ 🔴🔴 LE REPERE ENCADRE SON MAIL — UN SEUL TRAIT PAR COTE, ANGLES ARRONDIS ═══════════════════════════════════
   Demande d'Arno (lot VISUALISER-MAIL-ET-REPERE-FENETRE, puis BROUILLON-REPONSE-ET-REPERE) : « phrase en ROUGE,
   CENTREE ; de chaque cote part un lisere rouge fin, qui longe le mail concerne et s'arrete a MI-HAUTEUR de la
   ligne de ce mail », et « lisere CONTINU, sans coupure aux angles, avec des angles ARRONDIS ».

   🔴 CHAQUE BRAS EST UNE SEULE BOITE, et c'est ce qui supprime la coupure. Elle porte DEUX bordures — celle du
   haut (ou du bas) et celle du cote — plus un rayon sur l'angle qui les joint : le trait est continu PAR
   CONSTRUCTION, et arrondi. La version d'avant dessinait quatre traits independants, et il restait un decroche
   d'un pixel au coin, visible a l'oeil.

   🔴 LES BRAS NE PESENT RIEN DANS LA MISE EN PAGE : hauteur zero, et c'est leur ::before qui deborde. Sans cela,
   une boite de la moitie de la hauteur d'un mail deplie ferait une ligne de repere haute de plusieurs centimetres.

   ⚠️ LE SENS SUIT LE COTE : au-dessus du mail le trait DESCEND (bordure du haut, boite vers le bas), en dessous
   il MONTE. Un seul dessin aurait encadre le mauvais mail dans l'un des deux tris.

   ⚠️ --cnv-repere-h PORTE LA HAUTEUR MESUREE DU MAIL (voir le ResizeObserver de LigneRepere) : un mail deplie
   fait dix fois la hauteur d'un mail replie, et une valeur figee aurait trace un trait trop court ou debordant.

   ⚠️ COULEUR : var(--color-svv-red), un JETON — lisible en Clair comme en Sombre, jamais une couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
/* 🔴 LE REPERE SE SERRE : il remplace un trait de 1 px, il ne vient pas s'ajouter a lui. Les marges d'avant
   (.6rem / .4rem) creusaient un trou la ou il n'y avait qu'une ligne. */
.cnv-repere{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  margin:.1rem 0;padding:0;list-style:none;--cnv-repere-h:0px}
.cnv-repere-phrase{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:.2rem .5rem;
  padding:0 .6rem;text-align:center;min-width:0}
/* 🔴 LA PHRASE EST ROUGE, et le reste de la mention la suit en plus discret : c'est une seule information. */
.cnv-repere-mot{font-size:.76rem;font-weight:700;letter-spacing:.01em;color:var(--color-svv-red);
  overflow-wrap:anywhere}
.cnv-repere-qui{font-size:.72rem;color:var(--color-svv-red);opacity:.75}
/* ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LA GRANDE CORBEILLE DU BLOC D'EN-TETE ═══════════════════
   Demande d'Arno : « a DROITE, une grande icone corbeille qui occupe toute la hauteur du bloc » et « ne deplace
   pas les autres elements du bloc ».

   🔴 LA RANGEE EST EN "stretch" : c'est elle qui donne au bouton toute la hauteur du bloc, sans qu'aucune ligne
   du <dl> ne se decale. Le <dl> garde "flex:1", donc exactement la largeur qui restait.

   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot).
   🔴 AUCUNE COULEUR EN DUR : les jetons basculent seuls en Clair et en Sombre. */
/* ══ LOT DRIVE-HABILLAGE, POINT 4 — LA CORBEILLE DANS LE BLOC GRIS, A L'EXTREME DROITE ═════════════════════════
   Arno : « le bloc gris De / A / Date reprend toute la largeur comme avant. La corbeille est integree DANS ce
   bloc, a l'extreme DROITE, dans une case blanche (fond de carte du theme) a coins arrondis, bien integree a la
   trame grise ».

   CE QUI A ETE RETIRE : la rangee cnv-entete-rangee, qui posait le bloc gris et le bouton EN FRERES. Le bloc
   perdait 52 px de largeur sur toute sa hauteur, et l'icone flottait a sa droite sur le fond de la page — deux
   surfaces la ou il n'en faut qu'une.

   LA CASE EST POSITIONNEE, PAS INSEREE DANS LE FLUX : c'est la condition pour que le bloc ne bouge pas. Une ligne
   de plus dans le dl aurait decale De, A et Date vers le bas. Le dl reserve seulement la place a droite, par son
   padding — et les valeurs s'y arretent au lieu de passer dessous.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le litteral de gabarit (piege vu plus de dix fois).

   BIEN INTEGREE A LA TRAME GRISE : fond de CARTE (--color-svv-surface, blanc en Clair, carte sombre en Sombre)
   sur le gris du bloc (--color-svv-field), un liseré de charte, des coins arrondis, et 6 px de retrait en haut,
   en bas et a droite pour que le gris l'entoure de tous les cotes. Aucune couleur en dur : elle bascule seule.

   LE COMPORTEMENT NE CHANGE PAS — meme icone, meme bulle, meme clic, meme bandeau « Annuler ». */
.cnv-entete-corbeille{position:absolute;top:6px;right:6px;bottom:6px;display:flex}
.cnv-corbeille{flex:1 1 auto;display:flex;align-items:center;justify-content:center;width:44px;padding:0;
  font:inherit;font-size:1.25rem;line-height:1;color:var(--color-svv-muted);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.5rem;cursor:pointer}
.cnv-corbeille:hover{color:var(--color-svv-red);border-color:var(--color-svv-red);
  background:var(--color-svv-field)}
/* ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 1 — LA MEME CASE, UN SURVOL QUI N'ALERTE PAS ════════════════
   Arno : « meme case blanche, meme taille ». Elle ne bouge donc pas d'un pixel — seule la couleur du SURVOL
   change.

   🔴 ET C'EST UNE INFORMATION, PAS UNE coquetterie : le rouge du survol de la corbeille dit « ce geste retire ».
   Reintegrer REMET. Garder le rouge aurait fait hesiter sur un geste sans danger, et aurait menti sur son sens.
   Le vert est celui des jetons de l'application, pas une couleur en dur.

   ⚠️ LE GLYPHE EST UN PEU PLUS GRAND : « ↩ » est dessine plus petit que « 🗑 » dans la plupart des polices, et a
   taille egale la case paraissait vide. Mesure a l'oeil, assumee.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-corbeille--retour{font-size:1.35rem}
.cnv-corbeille--retour:hover{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink);
  background:var(--color-svv-field)}
.cnv-corbeille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Le bandeau « Message mis a la corbeille — Annuler ». Un lisere rouge, et le MOT : jamais la couleur seule. */
.cnv-jete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;margin:0 0 .4rem;padding:8px 10px;
  border-radius:0 .5rem .5rem 0;border-left:3px solid var(--color-svv-red);background:var(--color-svv-field)}
.cnv-jete-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
.cnv-jete-qui{font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — LA PASTILLE "i" EST UN BOUTON, et elle OUVRE une fenetre.
   Meme dessin que la pastille des biens (.ifb-pastille), au rouge du repere pres : c'est la meme promesse ("il y a
   plus a lire ici"), donc le meme objet a l'oeil. Elle n'est plus une bulle au survol : voir ModaleChangementSuivi. */
.cnv-repere-i{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;
  margin:0 0 0 .1rem;font:inherit;font-size:.68rem;font-weight:700;font-style:italic;line-height:1;
  color:var(--color-svv-red);background:transparent;border:1px solid var(--color-svv-red);border-radius:50%;
  cursor:pointer;flex:0 0 auto;opacity:.8}
.cnv-repere-i:hover{opacity:1}
.cnv-repere-i:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;opacity:1}
/* ⚠️ CIBLE TACTILE : 24 px au doigt, comme partout dans le module. */
@media (pointer:coarse){.cnv-repere-i{width:24px;height:24px;font-size:.78rem}}
/* Les bras : hauteur zero dans la grille, le trace vit dans leur ::before. */
.cnv-repere-bras{position:relative;height:0;min-width:0}
.cnv-repere-bras::before{content:"";position:absolute;left:0;right:0;
  height:calc(var(--cnv-repere-h) / 2);border:0 solid var(--color-svv-red)}
/* AU-DESSUS DU MAIL : le trait part de la phrase et DESCEND le long du mail. */
.cnv-repere--dessus .cnv-repere-bras::before{top:0;border-top-width:1px}
.cnv-repere--dessus .cnv-repere-bras--gauche::before{border-left-width:1px;border-top-left-radius:10px}
.cnv-repere--dessus .cnv-repere-bras--droite::before{border-right-width:1px;border-top-right-radius:10px}
/* EN DESSOUS DU MAIL : le trait part de la phrase et MONTE le long du mail. */
.cnv-repere--dessous .cnv-repere-bras::before{bottom:0;border-bottom-width:1px}
.cnv-repere--dessous .cnv-repere-bras--gauche::before{border-left-width:1px;border-bottom-left-radius:10px}
.cnv-repere--dessous .cnv-repere-bras--droite::before{border-right-width:1px;border-bottom-right-radius:10px}
/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 3 — UNE PETITE FLECHE AU BOUT DE CHAQUE BRANCHE ═════════════
   Demande d'Arno (04/10/2026) : « tout reste identique. Ajoute seulement une petite fleche rouge a l'extremite de
   chaque branche (gauche et droite), qui pointe vers le cote de la conversation concerne par le changement. Les
   fleches suivent l'ordre d'affichage : elles s'inversent avec Plus recent d'abord / Plus ancien d'abord. »

   🔴 LES FLECHES NE CONNAISSENT PAS LE TRI, ET C'EST TOUT L'INTERET. Elles pendent des memes variantes --dessus /
   --dessous que le trace, et c'est deja coteDuRepere(ordre) qui decide de ce cote : l'inversion est donc acquise
   PAR CONSTRUCTION. Une seconde regle qui aurait relu l'ordre d'affichage aurait fait une deuxieme verite a tenir,
   et le point 4 de ce meme lot dit assez ce que deux verites coutent (la modale disait le contraire de la liste).

   🔴 LA FLECHE POINTE DANS LE SENS OU LA BRANCHE VA : vers le BAS quand le repere est au-dessus du mail (sa
   branche descend le long de ce mail), vers le HAUT quand il est en dessous. C'est donc toujours le mail concerne
   par le changement qu'elle designe, dans les deux tris, sans cas particulier.

   LE DESSIN : le triangle CSS — une boite de taille nulle, quatre bordures transparentes, une seule coloree. Le
   ::before du bras portant deja le trace de la branche, c'est son ::after qui porte la pointe.

   ⚠️ LA POINTE TOMBE EXACTEMENT AU BOUT DU TRAIT. Un triangle de bordure a son sommet au CENTRE de la boite, pas
   sur son bord : la boite commence donc 5 px (sa demi-taille) avant la mi-hauteur du mail. Sans ce retrait, la
   fleche depassait la branche de 5 px.
   ⚠️ ELLE EST CENTREE SUR LE TRAIT D'1 PX : -4,5 px, soit la demi-largeur du triangle moins la demi-bordure. A
   gauche on compte depuis le bord gauche du bras, a droite depuis son bord droit — d'ou les deux regles.

   ⚠️ ET CE CENTRAGE DEBORDE DE 4,5 PX DE CHAQUE COTE DE LA COLONNE, c'est assume et c'est mesure. Un trait pose
   sur le bord d'une boite ne peut pas porter une pointe SYMETRIQUE sans la depasser d'une demi-largeur : la seule
   autre facon etait de rentrer la fleche de 5 px, et a l'ecran elle se lit alors comme un fanion accroche a cote
   du trait, plus comme une pointe. Mesure sur le fil 3490 (fleche seule, retiree puis remise) : la colonne passe
   de 1232 a 1237 px de contenu, et la PAGE ne defile pas pour autant (scrollWidth = clientWidth = 1512). En
   largeur telephone, le debordement mesure est le MEME avec et sans la fleche : elle n'en ajoute aucun.
   ⚠️ ELLE N'APPARAIT QU'AVEC SA BRANCHE (.cnv-repere--mesure) : voir le commentaire du JSX.
   ⚠️ COULEUR : var(--color-svv-red), le MEME jeton que le trace — lisible en Clair comme en Sombre, jamais une
   couleur en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-repere-bras::after{content:"";position:absolute;width:0;height:0;border:5px solid transparent}
.cnv-repere--mesure.cnv-repere--dessus .cnv-repere-bras::after{top:calc(var(--cnv-repere-h) / 2 - 5px);
  border-top-color:var(--color-svv-red)}
.cnv-repere--mesure.cnv-repere--dessous .cnv-repere-bras::after{bottom:calc(var(--cnv-repere-h) / 2 - 5px);
  border-bottom-color:var(--color-svv-red)}
.cnv-repere-bras--gauche::after{left:-4.5px}
.cnv-repere-bras--droite::after{right:-4.5px}
/* La mention d'exception : discrete, a cote de la capsule, et jamais a sa place — ce sont deux informations. */
.cnv-exception{display:inline-flex;align-items:center;min-height:22px;padding:.05rem .4rem;border-radius:999px;
  font-size:.7rem;font-weight:700;color:var(--color-svv-muted);border:1px dashed var(--color-svv-line-strong);
  overflow-wrap:anywhere}

.cnv-capsule{display:inline-flex;align-items:center;min-height:24px;padding:.05rem .45rem;border-radius:999px;
  font:inherit;font-size:.7rem;font-weight:700;line-height:1.5;white-space:nowrap;cursor:pointer;
  border:1px solid transparent;background:transparent}
.cnv-capsule--a_classer{color:var(--color-svv-red);border-color:var(--color-svv-red)}
.cnv-capsule--classe{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
/* « Auto » est vert lui aussi — c'est range — mais en aplat plus discret : le geste humain reste le plus visible
   des deux, sans pour autant faire passer l'automatique pour un probleme. */
.cnv-capsule--auto{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
/* LOT STATUT-HORS-GESTION — le GRIS : une decision prise, pas un travail en attente. Le MOT est ecrit. */
/* LOT RATTACHER-EN-ECRIVANT — « Interne » : VERT, un etat d'ARRIVEE. Le MOT est toujours ecrit. */
.cnv-capsule--interne{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.cnv-capsule--hors_gestion{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
/* ══ 🔴 LOT BIEN-RATTACHE — LE CORPS EN MISE EN FORME ══════════════════════════════════════════════════════════
   Le HTML vient d'un TIERS : il faut le BORNER, sinon un mail de syndic large de 900 px pousse toute la
   conversation, et une image de 2 000 px la déborde. On ne le reformate pas — on l'empêche seulement de sortir
   de son cadre. Les tableaux, eux, defilent DANS leur propre boite : les couper perdrait des colonnes. */
/* ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LE MAIL EST POSÉ SUR SA PROPRE FEUILLE, BLANCHE, MÊME EN SOMBRE ════════
   Demande d'Arno : « lisible en Sombre SANS INVERSER LES IMAGES ».

   Un mail en HTML apporte ses propres couleurs — du texte noir, des tableaux à fond clair, un logo dessiné pour
   un fond blanc. En thème Sombre, deux voies s'offraient, et une seule tient :
     · inverser (filtre sur le bloc) : le texte redevient lisible, mais le logo de la signature, les photos et les
       captures d'écran sortent en négatif. C'est exactement ce qu'Arno a exclu.
     · poser le mail sur une FEUILLE BLANCHE, comme une page qu'on aurait imprimée : aucune couleur n'est touchée,
       ni celles du texte, ni celles des images. Le contraste avec l'écran sombre encadre le mail au lieu de le
       déformer — et c'est ce que font les messageries qui affichent « l'original ».

   ⚠️ LES COULEURS SONT ÉCRITES EN DUR, ET C'EST VOULU : ce bloc ne suit PAS le thème, c'est tout son objet. Les
   jetons de la charte y seraient un contresens — ils changeraient avec le thème, donc reviendraient à inverser.
   C'est la seule exception de tout le module, et elle est ici, sous les yeux.

   AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un littéral gabarit, qu'un seul accent grave terminerait.
   Le piege s'est referme une HUITIEME fois en ecrivant ce bloc — et, comme les precedentes, sur un commentaire. */
${CSS_LISIBILITE_SOMBRE}
${CSS_CADRE_MAIL}
.cnv-html{max-width:100%;overflow-x:auto;font-size:.9rem;line-height:1.5;
  color:#1a1a1a;background:#fff;border:1px solid var(--color-svv-line);border-radius:10px;padding:12px 14px;
  overflow-wrap:anywhere;color-scheme:light}
/* 🔴 L'IMAGE REDEVIENT EN LIGNE, et il faut dire pourquoi c'est une CORRECTION et non une preference.
   La remise a zero de Tailwind pose "img{display:block}" sur toute l'application. C'est ce qu'on veut dans NOS
   ecrans ; dans un mail, c'est faux : en HTML, une image est en ligne, et les signatures s'en servent partout.
   Vu sur le mail 57185, cote a cote avec Gmail : les deux numeros de telephone, une seule ligne dans Gmail
   (icone, numero, icone, numero), devenaient QUATRE lignes chez nous. Le mail n'etait pas casse, mais il ne
   ressemblait plus a ce qu'on voit dans Gmail — la promesse de ce lot.
   AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un litteral gabarit. */
/* 🔴 LOT IMAGES-INTEGREES — « Image affichee a largeur maximale du mail, proportions gardees, clic pour
   l'agrandir » (Arno). height:auto EST la garantie des proportions ; le curseur annonce le clic.
   AUCUN ACCENT GRAVE ICI : ce commentaire vit dans un litteral gabarit (piege TS1005 du depot). */
.cnv-html img{max-width:100%;height:auto;display:inline-block;vertical-align:middle;cursor:zoom-in}
.cnv-html img[data-absente]{cursor:default}
/* La vignette d'une image qu'on ne peut pas afficher : un mot, un detail, un lien — jamais du code. */
.iim-vignette{display:inline-flex;align-items:baseline;gap:.35rem;flex-wrap:wrap;margin:.2rem 0;padding:.25rem .5rem;
  font-size:.8rem;background:var(--color-svv-field);border:1px dashed var(--color-svv-line-strong);border-radius:.4rem}
.iim-mot{font-weight:600}
.iim-detail{color:var(--color-svv-muted)}
.iim-lien{color:var(--color-svv-red);text-decoration:underline;text-underline-offset:2px}
/* Une image intégrée qu'on n'a pas su retrouver : son MOT, dans un cadre discret — jamais une image cassée. */
/* 🔴🔴 LOT TRANSFERT-AVEC-PIECES — CE GRIS RESTE ECRIT EN DUR, ET C'EST LA BONNE REPONSE. Je l'avais passe aux
   jetons en croyant corriger un oubli de theme ; c'etait une erreur, et l'encadre de cnv-html ci-dessus dit
   pourquoi : ce cadre vit SUR LA FEUILLE BLANCHE du mail, qui ne suit JAMAIS le theme (decision d'Arno,
   « lisible en Sombre sans inverser les images »). Un jeton y mettrait du gris clair sur du blanc en theme
   Sombre — donc un cadre invisible, a l'endroit meme qui doit se lire puisqu'il remplace une image absente.
   AUCUN ACCENT GRAVE ICI : ce commentaire vit dans un litteral de gabarit (piege TS1005 du depot, 9e fois). */
.cnv-html img[data-absente]{display:inline-block;min-width:1.2rem;min-height:1.2rem;padding:1px 6px;
  border:1px dashed #bbb;border-radius:4px;font-size:.72rem;color:#666;font-style:italic}
.cnv-html table{max-width:100%;border-collapse:collapse}
.cnv-html td,.cnv-html th{padding:.15rem .3rem;vertical-align:top}
/* Le mail apporte ses propres couleurs de contenu (legitimes) ; on ne force que ce qui casserait la page. */
.cnv-html a{text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.cnv-html blockquote{margin:.4rem 0;padding-left:.6rem;border-left:2px solid var(--color-svv-line)}
.cnv-capsule:hover{filter:brightness(.94)}
.cnv-capsule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ 🔴 LOT AVIS-LISIBLE — LE PASSAGE LISIBLE D'UN AVIS DE NON-REMISE ════════════════════════════════════════════
   La COULEUR N'EST QU'UN RENFORT : le texte dit tout, et il reste lisible en niveaux de gris comme pour un
   daltonien. Le gras appuie la premiere ligne, qui porte le titre de l'avis.
   white-space:pre-line : les retours a la ligne du serveur sont CONSERVES (titre, puis phrase) ; les espaces
   multiples, eux, sont replies — un avis recopie d'un rapport machine en contient beaucoup. */
.cnv-avis{color:var(--color-svv-red);font-weight:600;white-space:pre-line;margin:0 0 10px;
  padding:8px 10px;border-left:3px solid var(--color-svv-red);
  background:color-mix(in srgb, var(--color-svv-red) 4%, transparent);border-radius:0 .4rem .4rem 0}
/* ── LOT 5-FIDÈLE : l'étoile et les icônes de l'en-tête, aux places de Gmail ──────────────────────────────────── */
.cnv-etoile,.cnv-icone{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  padding:0;color:var(--color-svv-muted);background:transparent;border:1px solid transparent;border-radius:.5rem;cursor:pointer}
.cnv-etoile:hover,.cnv-icone:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line)}
.cnv-etoile:focus-visible,.cnv-icone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'étoile POSÉE : remplie ET colorée. Son libellé accessible change aussi — jamais la couleur seule. */
.cnv-etoile--posee{color:var(--color-svv-red)}
/* ── LOT 5-FIDÈLE : le pied de Gmail — trois boutons arrondis, icône puis mot ─────────────────────────────────── */
/* LOT PIECES-DE-LA-CONVERSATION — la rangee du trombone du bas, juste au-dessus du pied de reponse. Elle existe
   meme quand le pied n'existe pas (dans une carte, sur un echange d'un seul message, ou l'editeur ouvert) : les
   pieces, elles, sont toujours la. AUCUN ACCENT GRAVE ici : litteral de gabarit. */
.cnv-pieces-bas{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:.5rem}
.cnv-pied{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}
.cnv-pied-bouton{display:inline-flex;align-items:center;gap:.45rem;min-height:44px;padding:.45rem 1.1rem;
  font:inherit;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:999px;cursor:pointer}
.cnv-pied-bouton:hover{background:var(--color-svv-field)}
.cnv-pied-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LE CARTOUCHE — le MOT d'abord, la couleur ensuite : lisible en niveaux de gris et pour un daltonien. */
.cnv-cartouche{display:inline-block;max-width:22rem;padding:2px 8px;border-radius:999px;font-size:.72rem;
  font-weight:700;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  border:1px solid var(--color-svv-line-strong);color:var(--color-svv-muted);background:var(--color-svv-surface)}
a.cnv-cartouche{text-decoration:underline;text-underline-offset:2px}
a.cnv-cartouche:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cnv-cartouche--succes{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);border-color:var(--color-svv-green)}
.cnv-cartouche--attente{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.cnv-cartouche--neutre{color:var(--color-svv-muted)}
/* Le déclencheur (« Classer », « Modifier ») : discret, mais une cible de 44 px et un focus très visible. */
.cnv-statut-bouton{min-height:44px;padding:0 .4rem;font-size:.75rem;font-weight:700;color:var(--color-svv-red);
  background:transparent;border:0;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.cnv-statut-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LOT BARRE-STATUT — le MEME vert que la capsule d'une ligne : le lien parle de la meme question qu'elle. */
.cnv-statut-bouton--vert{color:var(--color-svv-green-ink)}
.cnv-qui{font-weight:700;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.cnv-hors{font-size:.75rem;font-weight:700;color:var(--color-svv-muted)}
/* ══ 🔴 LOT BROUILLONS-GMAIL — « Brouillon », EN ROUGE, comme dans Gmail ════════════════════════════════════════
   Un MOT et une couleur, jamais la couleur seule : la mention doit se lire en niveaux de gris, pour un daltonien
   et au lecteur d'ecran. Le rouge est celui du module (--color-svv-red), pas une teinte de plus. */
/* ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LE PICTO « BROUILLON EN ATTENTE » ══════════════════════════════════
   Le crayon et le mot vont ensemble : le picto se repere d'un coup d'oeil, le mot reste lisible en niveaux de
   gris et au lecteur d'ecran. Couleur : le jeton rouge, comme la mention qu'il accompagne.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.cnv-brouillon{display:inline-flex;align-items:center;gap:3px;font-size:.75rem;font-weight:700;
  color:var(--color-svv-red)}
.cnv-brouillon-picto{font-style:normal;line-height:1}
/* La mention du HAUT du mail ouvert : un BOUTON, parce qu'elle emmene (elle fait defiler jusqu'a la reponse). */
.cnv-brouillon-haut{display:inline-flex;align-items:center;gap:6px;min-height:32px;margin:0 0 .4rem;
  padding:.15rem .55rem;font:inherit;font-size:.78rem;font-weight:700;color:var(--color-svv-red);
  background:transparent;border:1px dashed var(--color-svv-red);border-radius:999px;cursor:pointer}
.cnv-brouillon-haut:hover{background:var(--color-svv-field)}
.cnv-brouillon-haut:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ LOT ENVOI-DIAG — « CE MESSAGE N'EST PAS ARRIVÉ » ════════════════════════════════════════════════════════════
   Un bandeau, au-dessus du message, avec un filet à gauche : la même grammaire visuelle que les alertes du module.
   🔴 LA COULEUR N'EST QU'UN RENFORT — la phrase dit tout, et reste lisible en niveaux de gris comme pour un
   daltonien. Un échec DÉFINITIF est en gras et sur fond teinté ; un RETARD reste discret, parce que le message peut
   encore arriver et qu'affoler pour rien pousse à réécrire deux fois au même locataire. */
.cnv-nonremise{margin:0 0 .4rem;padding:.35rem .5rem;font-size:.8rem;line-height:1.35;
  border-left:3px solid var(--color-svv-muted);color:var(--color-svv-muted);background:transparent}
.cnv-nonremise--definitif{font-weight:700;color:var(--color-svv-red);border-left-color:var(--color-svv-red);
  background:color-mix(in srgb, var(--color-svv-red) 7%, transparent)}
.cnv-msg--echoue{background:color-mix(in srgb, var(--color-svv-red) 3%, transparent)}
.cnv-extrait{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.cnv-detail{flex-basis:100%;padding:0 4px 12px;min-width:0}
/* ══ LOT FIL-LECTURE — L'EN-TÊTE COMPACT : UN INTITULÉ, UNE LIGNE ════════════════════════════════════════════════
   Chaque ligne est une rangée : l'intitulé à gauche (largeur fixe, il ne se coupe jamais), la valeur à droite. Les
   destinataires multiples tiennent sur la MÊME ligne et ne passent à la ligne que si la largeur ne suffit pas —
   c'est overflow-wrap qui en décide, jamais un retour écrit en dur.
   ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit. */
/* ⚠️ LOT DRIVE-HABILLAGE, POINT 4 — position:relative : le bloc reprend TOUTE la largeur (plus de rangee qui lui
   en prenait 52 px) et il porte lui-meme la case de la corbeille, posee a son extreme droite. */
.cnv-entete{position:relative;margin:0 0 10px;padding:8px 10px;background:var(--color-svv-field);
  border-radius:.5rem;font-size:.8rem;min-width:0}
/* LA PLACE N'EST RESERVEE QUE LA OU LA CORBEILLE EXISTE : ailleurs (historique d'une cible, vie d'un bien), le
   bloc n'aurait eu qu'une gouttiere vide. Et sans ce padding, une adresse longue passerait SOUS la case. */
.cnv-entete--avec-corbeille{padding-right:62px}
.cnv-entete-ligne{display:flex;align-items:baseline;gap:.5rem;margin:0 0 .2rem}
.cnv-entete-ligne:last-child{margin-bottom:0}
.cnv-entete dt{flex:0 0 auto;min-width:2.6rem;font-weight:700;color:var(--color-svv-muted)}
.cnv-entete dt::after{content:' :'}
.cnv-entete dd{flex:1 1 auto;margin:0;min-width:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* L'objet du message, sur la ligne repliée, à côté de l'expéditeur. Il se coupe au besoin plutôt que de pousser la
   date hors de la ligne : c'est l'expéditeur et la date qu'on lit d'abord dans une liste. */
.cnv-objet{font-size:.85rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* Les trois gestes sous un message déplié. Pleine largeur sur téléphone, en ligne dès qu'il y a la place. */
.cnv-repondre{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.cnv-repondre .gst-btn{display:inline-flex;align-items:center;gap:.4rem}
.cnv-pied-note{margin:0 0 .4rem}
.cnv-note{color:var(--color-svv-muted);font-style:italic}
/* Le menu vit désormais DANS le coin, à côté de la date et du cartouche : plus de positionnement absolu, donc plus
   de largeur réservée en dur sur la ligne — et rien ne peut se recouvrir quand le cartouche est long. */
`;
