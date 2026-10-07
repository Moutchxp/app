'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AIDE_DOUBLE_CLIC, AIDE_OEIL_PIECE, etatArchive, etiquetteType, formaterTaille, lienDocumentEntier,
  sortePiece, tronquerNom,
  type PieceAffichee,
} from '../../../../lib/gestion/pieces';
/**
 * 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — les deux décisions d'Arno sur les pièces, prises dans
 * un module PUR : quelles pièces ne se téléchargent QUE (zip, octet-stream), et quelle phrase porte une pièce qu'on
 * n'a pas gardée (programme, signature électronique, ou le reste).
 */
import {
  mentionPieceRefusee, telechargementSeulement, MENTION_DEFAUT, MENTION_PRECAUTION,
} from '../../../../lib/gestion/pieceSecurite';
// 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — la hauteur de vignette est PARTAGÉE avec la grille de
//    l'éditeur : Arno veut « mêmes dimensions et même style ». Une seule constante, donc.
import { HAUTEUR_VIGNETTE } from '../../../../lib/gestion/piecesEnvoi';
/* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — la vignette d'une vidéo est extraite par le navigateur, une seule
   implémentation pour les trois écrans qui montrent des miniatures. */
import { useMiniatureVideo } from './miniatureVideoNavigateur';
// 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — l'œil est un TRACÉ, jamais un emoji : « 👁 » est rendu par une police EN
//    COULEUR qui ignore `color`, et resterait de la même teinte en Clair et en Sombre (leçon du trombone).
import { Oeil } from './Oeil';
/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — « → envoyé à la partie … ». Importé, jamais recopié. */
import { DestinatairesDePiece } from './DestinatairesDePiece';
/* 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — les FAMILLES destinataires remplacent les parties : une famille de
   plus (Interne), « non affecté » devenu Extérieur, et le Cci compté quand on le connaît. */
import type { FamilleVue } from '../../../../lib/gestion/familleDestinataire';
// 🔴 LOT DRIVE-UNIQUE — UNE SEULE FENÊTRE DRIVE, PARTOUT. Le panneau en ligne qui vivait ici est remplacé par la
//    fenêtre façon Finder, ouverte en mode « ranger ». Aucune de ses fonctions n'est perdue : le dernier dossier de
//    l'échange, les dossiers récents datés et « Déposer ici » y sont, dans la barre latérale et dans le pied.
// 🔴 LOT PIECES-DE-LA-CONVERSATION — la MÊME fonction pure que la visionneuse : elle décide qui entre dans le tour.
import { sorteApercu } from '../../../../lib/gestion/apercuDrive';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import type { PieceARanger } from '../../../../lib/gestion/rangementDrive';
/* 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — le picto « base de donnees » et son petit menu, ecrits UNE fois
   pour les deux ecrans qui montrent des miniatures de pieces recues. */
import { CSS_PICTO_DANS_LE_DRIVE, PictoDansLeDrive } from './PictoDansLeDrive';
import {
  dossierDeLEmplacement, emplacementsDe, type EmplacementPiece, type StatutPieceDrive,
} from '../../../../lib/gestion/pieceDansLeDrive';
/**
 * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — « au retour dans le mail […] le picto cylindre et son menu d'emplacements
 * apparaissent sans rechargement » (Arno). Voir l'encadré de `signalPieceDrive` : ce composant est monté AUTANT DE
 * FOIS qu'il y a de messages dépliés, et dans trois écrans (la conversation, l'historique d'une cible, la vie d'un
 * bien). Chacun tient son propre `statuts`, et aucun ne pouvait savoir qu'une autre fenêtre venait de ranger.
 */
import { concernePieces, ecouterPiecesDrive } from '../../../../lib/gestion/signalPieceDrive';

/**
 * LOT 5-PJ-A — LES PIÈCES JOINTES, COMME DANS GMAIL. Composant PARTAGÉ : un seul endroit rend les pièces, partout où
 * un message s'affiche (boîte plein écran, écran partagé, carte d'événement). Deux rendus divergents finiraient par
 * se contredire, et l'un des deux serait oublié à la première correction.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET POURQUOI :
 *   · AUCUNE ACTION AU SEUL SURVOL. Le bouton « Télécharger » est TOUJOURS visible, et sa cible fait 44 px : sur un
 *     iPhone, il n'y a pas de survol, et une action qui n'apparaît qu'au passage de la souris n'existe pas ;
 *   · AUCUNE URL DE STOCKAGE. Miniatures et fichiers sont servis par l'application, qui relit le droit à chaque fois ;
 *   · LA PLACE DU BOUTON « DRIVE » (lot 5-PJ-B) EST DÉJÀ PRÉVUE dans la barre d'actions de chaque carte et dans la
 *     barre du haut. Aucun bouton Drive n'est affiché par ce lot, pas même désactivé : promettre un geste qui n'existe
 *     pas est pire que de ne rien montrer ;
 *   · UNE INFORMATION N'EST JAMAIS PORTÉE PAR LA SEULE COULEUR : une pièce non conservée le dit EN MOTS, avec son motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 CE FICHIER EST CHARGÉ PAR LE NAVIGATEUR : il n'importe que `lib/gestion/pieces` (module PUR). Rien qui touche la
 * base, sous peine de faire tomber toute l'application (incident du 24/09/2026).
 */

/**
 * Les dimensions réservées à la vignette. Fixées ICI et dans le CSS : sans elles, la page saute quand les images
 * arrivent.
 *
 * 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — ELLE VIENT DÉSORMAIS DU MODULE PARTAGÉ, et c'est la demande
 * d'Arno : « mêmes dimensions et même style que les miniatures de lecture » pour les pièces de l'éditeur. Deux
 * constantes de 108 auraient divergé au premier réglage ; celle-ci est la seule.
 */
const VIGNETTE_H = HAUTEUR_VIGNETTE;

/** Un dépôt déjà fait, tel que la route le rend. */
export interface DepotAffiche {
  pieceId: number;
  dossierNom: string | null;
  webViewLink: string | null;
}

/** Ce que le clic sur un bouton Drive demande : une pièce, ou tout le message. */
export type Demande = { quoi: 'piece'; pieceId: number; nom: string } | { quoi: 'message' };

export function PiecesJointes({
  messageId, filId, vraies, signatures, onVisualiser, onNomChange, gmailDuMail = null,
  destinataires = [],
}: {
  messageId: number;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — À QUELLE PARTIE CE MAIL A-T-IL ÉTÉ ENVOYÉ ════════════════════════
   *
   * Demande d'Arno : les lignes « → envoyé à la partie … » paraissent « dans le résumé des pièces ET sur les
   * miniatures du mail déplié ».
   *
   * 🔴 UNE SEULE LISTE POUR TOUTES LES PIÈCES, et c'est exact ici : ce bloc rend les pièces d'UN message, qui a
   * un seul jeu de destinataires. (La fenêtre du résumé, elle, mêle des messages : elle reçoit une fonction.)
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ LES TROIS AUTRES ÉCRANS QUI MONTENT CE BLOC NE BOUGENT PAS D'UN PIXEL. Seul
   * « Historique du bien » connaît les catégories d'un bien ; les lire ailleurs aurait demandé un bien à un
   * écran qui n'en a pas.
   */
  destinataires?: readonly FamilleVue[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — OÙ RETROUVER UNE PIÈCE QU'ON N'A PAS GARDÉE ═════════════
   *
   * DEMANDE D'ARNO (04/10/2026) : « Sinon, affiche sur ces seules pièces “Pièce non récupérée — voir dans Gmail”
   * avec un lien. »
   *
   * L'adresse du mail dans Gmail, construite par `lienGmail` (module pur, déjà employé par le menu de la
   * conversation). Elle ne sert QU'aux pièces non conservées, et nulle part ailleurs sur la carte.
   *
   * ⚠️ `null` ⇒ LA MENTION SANS LIEN. Mieux vaut un constat nu qu'un lien qui ouvrirait la mauvaise boîte : sans
   * `Message-ID`, on ne sait pas où pointer, et `lienGmail` rend `null` plutôt que d'improviser.
   */
  gmailDuMail?: string | null;
  /** Sert à rouvrir le sélecteur sur le dernier dossier utilisé pour CET échange. */
  filId?: number | null;
  /**
   * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — « le nouveau nom s'affiche immédiatement PARTOUT » (Arno) ══════════
   *
   * DÉFAUT VU À L'ÉCRAN le 30/09/2026 : après un renommage au stylo suivi d'un rangement, cette carte affichait
   * sa nouvelle mention « Dans le Drive · … » et GARDAIT son ancien nom. Elle relisait ses DÉPÔTS, ce qui est la
   * moitié de ce qui venait de changer — et elle ne pouvait pas faire mieux : le nom vient du FIL, que seule la
   * conversation sait relire.
   *
   * ⚠️ APPELÉ SEULEMENT QUAND LA BASE A VRAIMENT CHANGÉ DE NOM. Le fil est la lecture la plus coûteuse de
   * l'écran : la redemander à chaque rangement, pour un cas qui n'arrive qu'après un coup de stylo, serait payer
   * cher un geste rare.
   */
  onNomChange?: () => void;
  vraies: PieceAffichee[];
  signatures: PieceAffichee[];
  /**
   * ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — QUI OUVRE LA VISIONNEUSE MAISON ═══════════════════════════════════
   *
   * Arno : « côté MAIL (pièces d'un message, modale de récapitulatif, carte “N pièces jointes”), les boutons
   * ◀ Précédent / Suivant ▶ et les flèches ← → parcourent TOUTES les pièces de la conversation. »
   *
   * 🔴 C'EST LA CONVERSATION QUI TIENT LA VISIONNEUSE, et c'est la seule façon d'y parvenir : le tour couvre les
   * pièces de TOUS les messages, et ce bloc-ci n'en connaît qu'un. Il se contente donc de DEMANDER l'ouverture.
   *
   * 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — C'EST L'ŒIL QUI L'OUVRE, PLUS LA MINIATURE. La miniature, elle, ouvre le
   * document entier dans un onglet au DOUBLE-CLIC (voir l'encadré de `CartePiece`).
   *
   * ⚠️ ABSENT ⇒ AUCUN ŒIL, et la miniature garde son double-clic. C'est le cas des écrans qui affichent des
   * messages venus de PLUSIEURS échanges (l'historique d'une cible, la vie d'un bien) : il n'y a pas là de
   * « conversation » dont on pourrait faire le tour, et inventer un tour qui sauterait d'un échange à un autre
   * ferait passer, sans prévenir, du bail d'un logement à la pièce d'identité d'un autre client.
   */
  onVisualiser?: (pieceId: number) => void;
}) {
  const [depots, setDepots] = useState<DepotAffiche[]>([]);
  /**
   * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — OÙ CHAQUE PIÈCE SE TROUVE DÉJÀ DANS LE DRIVE.
   *
   * ⚠️ CE N'EST PAS `depots`, ET LES DEUX SONT NÉCESSAIRES : `depots` dit ce que NOUS avons rangé pour CETTE
   * pièce (la mention « Dans le Drive · dossier ») ; ceci dit partout où ce CONTENU se trouve, sous quelque nom
   * que ce soit (le picto). Un document revenu renommé n'a aucun dépôt et plusieurs emplacements.
   */
  const [statuts, setStatuts] = useState<StatutPieceDrive[]>([]);
  const [demande, setDemande] = useState<Demande | null>(null);
  /** L'emplacement qu'on vient de demander à voir. `null` = aucune fenêtre de consultation ouverte. */
  const [aVoirDansLeDrive, setAVoirDansLeDrive] = useState<EmplacementPiece | null>(null);
  const [indisponible, setIndisponible] = useState<string | null>(null);
  /**
   * LOT 5-PJ-C2 — l'état de l'accès Drive. `ok` = les boutons agissent, au nom de l'adresse de session ; tout le
   * reste = un CONSTAT, jamais un geste à faire. Il n'y a plus rien à connecter : on agit avec l'adresse avec
   * laquelle la personne s'est déjà identifiée.
   */
  const [google, setGoogle] = useState<{ etat: string; message: string; adresse: string | null } | null>(null);

  /** Ce qui est DÉJÀ dans le Drive : une requête par message déplié, jamais une par carte. */
  const relireDepots = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/gestion/messages/${messageId}/drive`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; depots?: DepotAffiche[]; emplacements?: StatutPieceDrive[]; message?: string;
      };
      setDepots(d.depots ?? []);
      /* 🔴 LA MÊME RÉPONSE, PAS UN SECOND APPEL : contrainte d'Arno (« une seule requête, sans appel Google »). */
      setStatuts(d.emplacements ?? []);
      // « sans_schema » n'est pas une panne : la migration n'est simplement pas encore appliquée. On le DIT sur le
      //   bouton plutôt que de le laisser échouer au clic.
      setIndisponible(d.etat === 'sans_schema' ? 'Bientôt disponible — une mise à jour de la base est nécessaire' : null);
    } catch {
      setDepots([]);
      setStatuts([]);
    }
  }, [messageId]);

  /** Où en est MON accès Drive ? Aucune écriture, aucun appel à Google : une lecture de la session et de la config. */
  const relireGoogle = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/gestion/google', { cache: 'no-store' });
      setGoogle((await res.json()) as { etat: string; message: string; adresse: string | null });
    } catch {
      setGoogle(null);
    }
  }, []);

  useEffect(() => { void relireDepots(); void relireGoogle(); }, [relireDepots, relireGoogle]);

  /**
   * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — ON RELIT QUAND UNE AUTRE FENÊTRE A RANGÉ ═══════════════════════════════
   *
   * CONSTAT D'ARNO (03/10/2026) : « de retour dans le mail, la miniature n'a pas le picto cylindre ».
   *
   * 🔴 LA CAUSE, LUE DANS LE CODE : `onRangement` ne prévenait QUE le composant qui avait ouvert la fenêtre. Ranger
   * depuis le récapitulatif « Pièces jointes de la conversation » laissait donc les cartes du mail sur leur image
   * d'avant — et inversement. MESURÉ EN BASE : la ligne du registre existait bien
   * (`gestion_piece_drive` id 26554, pièce 27085, déposée à 21:37:35). Le serveur savait ; l'écran ne lui avait
   * rien redemandé.
   *
   * ⚠️ ON NE RELIT QUE SI LE SIGNAL NOUS CONCERNE. Une conversation peut avoir douze messages dépliés, donc douze
   * instances de ce composant : les faire toutes relire pour une pièce qui n'appartient qu'à l'une d'elles ferait
   * douze requêtes au lieu d'une. Le signal nomme les pièces touchées quand il les connaît ; quand il ne les
   * connaît pas (un geste sur un FICHIER du Drive), tout le monde relit — c'est la bonne réponse, et c'est rare.
   *
   * ⚠️ LA CLÉ DES DÉPENDANCES EST UNE CHAÎNE, pas le tableau : `vraies` et `signatures` sont recréés à chaque
   * rendu du parent, et un tableau en dépendance réabonnerait l'auditeur à chaque fois.
   */
  const clePieces = [...vraies, ...signatures].map((p) => p.pieceId).join(',');
  useEffect(() => {
    const miennes = clePieces === '' ? [] : clePieces.split(',').map(Number);
    return ecouterPiecesDrive((s) => { if (concernePieces(s, miennes)) void relireDepots(); });
  }, [clePieces, relireDepots]);

  if (vraies.length === 0 && signatures.length === 0) return null;
  const depotDe = (pieceId: number): DepotAffiche | undefined => depots.find((d) => d.pieceId === pieceId);
  // LOT 5-PJ-C2 — il n'y a PLUS AUCUN GESTE à proposer : soit l'accès fonctionne au nom de l'adresse de session,
  //   soit on DIT pourquoi il ne fonctionne pas. « Pas encore configuré par l'administrateur » et « votre adresse
  //   n'a pas d'accès » sont des constats, pas des boutons — et le téléchargement, lui, reste toujours disponible.
  const empeche = indisponible ?? (google !== null && google.etat !== 'ok' ? google.message : null);

  return (
    <div className="pj">
      {vraies.length > 0 && (
        <BlocPieces
          messageId={messageId} pieces={vraies} depotDe={depotDe} indisponible={empeche}
          gmailDuMail={gmailDuMail} destinataires={destinataires}
          emplacementsDePiece={(id) => emplacementsDe(statuts, id)}
          onVoirDansLeDrive={setAVoirDansLeDrive}
          onDrive={(d) => setDemande(d)} onVisualiser={onVisualiser}
        />
      )}
      {/* Les images de signature restent À PART et repliées : elles ne doivent pas noyer les vraies pièces (lot 4d-C). */}
      {signatures.length > 0 && (
        <details className="pj-signatures">
          <summary className="pj-signatures-titre">
            {signatures.length} image{signatures.length > 1 ? 's' : ''} de signature
          </summary>
          {/* ⚠️ LES SIGNATURES N'ENTRENT PAS DANS LE TOUR DE LA CONVERSATION (elles n'y sont pas comptées) : elles
              n'ont donc PAS d'œil, et leur vignette ouvre l'image dans un onglet au double-clic, comme partout
              ailleurs depuis le lot PIECES-OEIL-DOUBLE-CLIC. Leur donner la visionneuse l'aurait posée sur une
              pièce absente du tour — compteur « 0 / 7 » sur une image bien affichée. */}
          /* ⚠️ LOT HISTORIQUE-BIEN-14, POINT 2 — LES IMAGES DE SIGNATURE N'ONT PAS DE LIGNE « → envoyé à … »,
             et c'est délibéré : ce ne sont pas des documents qu'on adresse à quelqu'un, mais le logo au bas du
             message. Trois lignes de couleur sous chacune auraient noyé les quelques pièces qui comptent. */
          <BlocPieces
            messageId={messageId} pieces={signatures} archive={false} depotDe={depotDe} indisponible={empeche}
            gmailDuMail={gmailDuMail}
            emplacementsDePiece={(id) => emplacementsDe(statuts, id)}
            onVoirDansLeDrive={setAVoirDansLeDrive}
            onDrive={(d) => setDemande(d)}
          />
        </details>
      )}

      {/* ══ 🔴🔴 LA FENÊTRE DRIVE, EN MODE « RANGER » ═════════════════════════════════════════════════════════
          Arno : « je veux le même système que la fenêtre Drive façon Finder, partout où on y fait appel, avec
          l'ouverture d'une modale ». C'est la MÊME fenêtre que celle de l'éditeur de mail : même arborescence
          dépliable, même glisser-déposer, même barre latérale, mêmes refus. Seul le sens change — ici on POSE.

          ⚠️ LE COMPTE RENDU N'EST PLUS ICI, ET CE N'EST PAS UNE PERTE : chaque pièce porte son propre état dans
          le panneau « À ranger » de la fenêtre (« ✓ Rangée dans X · ouvrir »), pendant qu'on range les suivantes.
          Un rapport en bas de la page, derrière la modale, n'aurait été lu par personne. */}
      {demande !== null && (
        <SelecteurFichierDrive
          mode="ranger"
          messageId={messageId}
          filId={filId ?? null}
          pieces={aRanger(demande, vraies, signatures)}
          /**
           * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA RELECTURE DU STATUT PASSE DÉSORMAIS PAR LE SIGNAL, ET PAR LUI
           * SEUL. Elle était ici (`void relireDepots()`) ET nulle part ailleurs : c'est exactement pour cela que
           * le récapitulatif et les cartes du mail ne se rafraîchissaient pas l'un l'autre. Deux chemins pour la
           * même relecture auraient fait deux requêtes sur le geste le plus courant — et le jour où l'un des deux
           * serait oublié, on chercherait longtemps lequel.
           *
           * ⚠️ `nomChange` RESTE ICI, et c'est une AUTRE information : le nom d'usage de la pièce vient de
           * changer, donc le FIL doit être relu. Le signal, lui, ne parle que du statut Drive.
           */
          onRangement={(o) => { if (o?.nomChange === true) onNomChange?.(); }}
          onFermer={() => setDemande(null)}
        />
      )}

      {/* ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LA FENÊTRE DRIVE, EN CONSULTATION ═══════════════════
          Arno : « ouvre NOTRE fenêtre Drive (mode consulter), positionnée dans le dossier qui contient le
          document, arbre déplié jusqu'à lui, le fichier mis en évidence (même repère que la loupe) ».

          🔴 C'EST LA MÊME FENÊTRE QU'AU-DESSUS, dans un autre mode : les refus du serveur, l'aperçu, le menu et
          les gardes de « Documents clients scannés » sont ceux qui sont déjà éprouvés. Rien n'est réécrit, et
          aucun droit n'est accordé ici — c'est le serveur qui autorise ou refuse, dossier par dossier.

          ⚠️ `dossierDepart` PEUT ÊTRE `null` : quand on ne connaît pas le dossier, on s'ouvre à la racine plutôt
          que d'inventer un identifiant qui mènerait à une erreur Google. Le repère, lui, reste posé. */}
      {aVoirDansLeDrive !== null && (
        <SelecteurFichierDrive
          mode="consulter"
          filId={filId ?? null}
          dossierDepart={dossierDeLEmplacement(aVoirDansLeDrive)}
          documentEnEvidence={{ driveFileId: aVoirDansLeDrive.driveFileId }}
          /* ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE ══════════════════════════════════════════════
              Arno : « on ne voit pas où l'on se trouve dans l'arborescence ». On arrive donc à la RACINE,
              avec la branche dépliée jusqu'au document et les autres dossiers repliés à côté. Le mode est
              passé explicitement : seules les arrivées par le picto changent, les autres points d'entrée de
              la fenêtre gardent `'dossier'`. */
          arrivee="arborescence"
          onFermer={() => setAVoirDansLeDrive(null)}
        />
      )}
    </div>
  );
}

/**
 * 🔴 CE QU'ON EMPORTE DANS LA FENÊTRE : une seule pièce, ou toutes celles qu'on a vraiment.
 *
 * ⚠️ LES PIÈCES NON CONSERVÉES SONT ÉCARTÉES (`disponible`) : elles n'existent pas dans le stockage, et les
 * proposer au rangement promettrait un geste qui échouerait après coup. Elles restent listées à part, avec leur
 * motif, comme avant.
 */
export function aRanger(d: Demande, vraies: PieceAffichee[], signatures: PieceAffichee[]): PieceARanger[] {
  /**
   * ══ 🔴🔴 LOT RANGER-PJ-FIABLE — « TOUT AJOUTER » NE RANGE PAS LES LOGOS DE SIGNATURE ═══════════════════════
   *
   * Arno : « fichiers “._” et images de signature (cid:) : ils ne doivent PAS apparaître comme pièces à ranger ».
   *
   * LE DÉFAUT, VU SUR UN VRAI MAIL (message 56770, fil 354) : deux vraies pièces, une image de signature — et la
   * fenêtre annonçait « 3 pièces à ranger », `image001.jpg` comprise. L'écran SAVAIT pourtant que c'en était une :
   * il l'avait rangée sous « 1 image de signature », dans son propre bloc replié.
   *
   * 🔴 CE QUE ÇA COÛTE : le logo du correspondant part dans le dossier du client, à côté du bail. Personne ne le
   * voit passer — on coche « tout », c'est bien le geste « tout ».
   *
   * ⚠️ UNE SIGNATURE RESTE RANGEABLE À LA DEMANDE : le ▲ de sa propre ligne, dans le bloc des signatures, ouvre
   * la fenêtre sur ELLE (`quoi === 'piece'`). C'est un geste explicite, sur une pièce nommée — l'inverse d'un
   * « tout » qui emporte ce qu'on n'a pas regardé.
   *
   * ⚠️ LES « ._ » DE macOS N'ARRIVENT PAS JUSQU'ICI : ils sont écartés en amont, par `trierPieces`, qui remplit
   * `vraies` et `signatures` (lot LECTURE-HTML-FIL-TROMBONE). Une seule règle, un seul endroit.
   */
  if (d.quoi === 'piece') {
    return [...vraies, ...signatures]
      .filter((p) => p.disponible && p.pieceId === d.pieceId)
      .map((p) => ({ pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime }));
  }
  return vraies.filter((p) => p.disponible).map((p) => ({
    pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime,
  }));
}

function BlocPieces({
  messageId, pieces, archive = true, depotDe, indisponible, onDrive, onVisualiser,
  emplacementsDePiece, onVoirDansLeDrive, gmailDuMail, destinataires = [],
}: {
  messageId: number; pieces: PieceAffichee[]; archive?: boolean;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties à qui nous avons envoyé ce mail. Vide ⇒ rien n'est rendu. */
  destinataires?: readonly FamilleVue[];
  /** 🔴🔴 POINT 5 — l'adresse du mail dans Gmail, pour les pièces non conservées. Voir `PiecesJointes`. */
  gmailDuMail: string | null;
  depotDe: (pieceId: number) => DepotAffiche | undefined;
  /** `null` = les boutons Drive agissent. Sinon, le MOTIF, affiché tel quel : c'est un constat, pas un geste. */
  indisponible: string | null;
  onDrive: (d: Demande) => void;
  onVisualiser?: (pieceId: number) => void;
  /** 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — où ce CONTENU se trouve déjà. Liste vide ⇒ aucun picto sur la carte. */
  emplacementsDePiece: (pieceId: number) => readonly EmplacementPiece[];
  /** 🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — la PIÈCE voyage avec l'emplacement : voir `PiecesDeLaConversation`. */
  onVoirDansLeDrive: (e: EmplacementPiece, source: PieceARanger) => void;
}) {
  const dispo = pieces.filter((p) => p.disponible);
  const refusees = pieces.filter((p) => !p.disponible);
  const etat = etatArchive(pieces);

  return (
    <>
      {/* ══ LA BARRE ══ Conçue pour accueillir « Tout ajouter au Drive » (lot B) à côté de « Tout télécharger », sans
          rien déplacer : c'est une rangée d'actions, pas un bouton posé là. */}
      <div className="pj-barre">
        <span className="pj-compte">
          {pieces.length} pièce{pieces.length > 1 ? 's' : ''} jointe{pieces.length > 1 ? 's' : ''}
        </span>
        {archive && dispo.length > 1 && (
          <span className="pj-actions-barre">
            {etat.possible ? (
              <a className="pj-bouton" href={`/api/admin/gestion/messages/${messageId}/archive`}>
                <span aria-hidden="true">⤓</span> Tout télécharger
                <span className="pj-poids"> ({formaterTaille(etat.octets)})</span>
              </a>
            ) : (
              // Le bouton DIT pourquoi il ne peut pas, au lieu d'échouer après une minute d'attente.
              <span className="pj-bouton pj-bouton--muet" role="note">Archive impossible : {etat.motif}</span>
            )}
            {/* LOT 5-PJ-B — la place prévue par le lot A, occupée sans rien déplacer. */}
            {indisponible === null ? (
              <button type="button" className="pj-bouton" onClick={() => onDrive({ quoi: 'message' })}>
                <span aria-hidden="true">▲</span> Tout ajouter au Drive
              </button>
            ) : (
              <span className="pj-bouton pj-bouton--muet" role="note">{indisponible}</span>
            )}
          </span>
        )}
      </div>

      <ul className="pj-grille">
        {dispo.map((p) => (
          <CartePiece
            key={p.pieceId} piece={p} depot={depotDe(p.pieceId)} indisponible={indisponible}
            emplacements={emplacementsDePiece(p.pieceId)}
            /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — toutes les pièces de ce mail partagent ses destinataires. */
            destinataires={destinataires}
            onVoirDansLeDrive={onVoirDansLeDrive}
            onDrive={() => onDrive({ quoi: 'piece', pieceId: p.pieceId, nom: p.nomFichier })}
            onVisualiser={onVisualiser}
          />
        ))}
      </ul>

      {/* ══ LES PIÈCES REFUSÉES À LA CAPTURE ══ Listées À PART, avec leur motif. Elles ne sont jamais silencieusement
          absentes : une pièce qu'on n'a pas doit se voir, sinon on la croit reçue. */}
      {refusees.length > 0 && (
        <ul className="pj-refusees">
          {refusees.map((p) => (
            <li key={p.pieceId} className="pj-refusee">
              <span className="pj-refusee-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier, 40)}</span>
              {/* ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — « voir dans Gmail », ET SEULEMENT ICI ══════

                  DEMANDE D'ARNO : « affiche sur ces seules pièces “Pièce non récupérée — voir dans Gmail” avec un
                  lien. » Le lien mène au MAIL, pas à la pièce : Gmail n'adresse pas une pièce jointe isolément,
                  et prétendre le contraire donnerait un lien mort.

                  🔴 LE MOTIF RESTE ÉCRIT À CÔTÉ, et ce n'est pas du bavardage : il dit POURQUOI nous ne l'avons
                  pas gardée (« type non autorisé pour la gestion », « pièce trop volumineuse »). Sans lui, on
                  croirait à une panne de la relève et on la relancerait en vain.

                  ⚠️ SANS LIEN, LA MENTION RESTE : un constat nu vaut mieux qu'un lien qui ouvrirait la mauvaise
                  boîte. `lienGmail` rend `null` quand il ne sait pas où pointer. */}
              {/* ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — TROIS PHRASES, PAS UNE ══════════

                  DÉCISIONS D'ARNO (04/10/2026) : une signature électronique affiche « Signature électronique du
                  mail — pas un document » ; un programme ou un script, « Programme non récupéré par sécurité —
                  voir dans Gmail ». Le reste garde la phrase du lot précédent.

                  🔴 LE LIEN SUIT LA PHRASE. Une signature n'est pas un document perdu : il n'y a RIEN à aller
                  chercher, et sa phrase ne mentionne pas Gmail — le lien ne s'affiche donc pas. Un lien sous une
                  phrase qui n'en parle pas est aussi faux qu'une phrase qui renvoie à Gmail sans lien.

                  🔴 ET C'EST UN MODULE PUR QUI DÉCIDE (`mentionPieceRefusee`), à partir du MOTIF écrit en base par
                  la porte de dépôt. L'écran n'interprète pas un motif à sa façon : il lit un verdict. */}
              {(() => {
                const r = mentionPieceRefusee(p.motifNonStocke);
                const lien = r.avecLienGmail && gmailDuMail !== null;
                return (
                  <>
                    {` — ${r.mention.replace(/ — voir dans Gmail$/, '')}`}
                    {r.avecLienGmail && ' — '}
                    {r.avecLienGmail && (lien ? (
                      <a className="pj-refusee-gmail" href={gmailDuMail} target="_blank" rel="noreferrer"
                        title="Ouvrir ce mail dans Gmail — la pièce y est encore">
                        voir dans Gmail ↗
                      </a>
                    ) : (
                      <span className="pj-refusee-gmail">voir dans Gmail</span>
                    ))}
                    {/* 🔴 LE MOTIF N'EST ÉCRIT QUE S'IL APPREND QUELQUE CHOSE. Sous la phrase par défaut, il dit
                        POURQUOI (« type non autorisé », « trop volumineuse ») et il est indispensable. Sous les
                        deux phrases de sécurité, il ne fait que les répéter — vu à l'écran : « Signature
                        électronique du mail — pas un document (signature électronique du mail (pkcs7) : ce n'est
                        pas un document) ». Une phrase dite deux fois se lit moins bien qu'une fois. */}
                    {r.mention === MENTION_DEFAUT.mention && p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * UNE CARTE. La vignette n'est demandée que pour ce qui peut en avoir une ; pour le reste, une étiquette de TYPE en
 * toutes lettres (« XML », « DOCX »), qui dit bien plus qu'une icône générique.
 *
 * `loading="lazy"` + dimensions réservées : vingt pièces ne déclenchent pas vingt requêtes au chargement, et la page
 * ne saute pas quand les images arrivent.
 */
function CartePiece({
  piece: p, depot, indisponible, onDrive, onVisualiser, emplacements, onVoirDansLeDrive,
  destinataires = [],
}: {
  piece: PieceAffichee; depot: DepotAffiche | undefined; indisponible: string | null; onDrive: () => void;
  onVisualiser?: (pieceId: number) => void;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties à qui nous avons envoyé ce mail. Vide ⇒ rien n'est rendu. */
  destinataires?: readonly FamilleVue[];
  /** 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — vide ⇒ la carte est EXACTEMENT celle d'avant ce lot. */
  emplacements: readonly EmplacementPiece[];
  /** 🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — la PIÈCE voyage avec l'emplacement : voir `PiecesDeLaConversation`. */
  onVoirDansLeDrive: (e: EmplacementPiece, source: PieceARanger) => void;
}) {
  const sorte = sortePiece(p.typeMime, p.nomFichier);
  const [vignetteMorte, setVignetteMorte] = useState(false);
  const etiquette = etiquetteType(p.nomFichier, p.typeMime);
  const lien = `/api/admin/gestion/pieces/${p.pieceId}`;
  /**
   * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — « TÉLÉCHARGEMENT SEULEMENT » ════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « zip et application/octet-stream : stockés tels quels, proposés en
   * TÉLÉCHARGEMENT SEULEMENT (jamais ouverts, prévisualisés ni décompressés par l'application), avec la mention
   * “Fichier à ouvrir avec précaution” ».
   *
   * 🔴 TROIS CONSÉQUENCES SUR CETTE CARTE, ET ELLES VONT ENSEMBLE : pas d'œil (rien à visualiser), le
   * double-clic TÉLÉCHARGE au lieu d'ouvrir un onglet, et la mention est écrite sous le nom. En retirer une
   * laisserait une porte ouverte : un double-clic qui ouvre un onglet, c'est le navigateur qui décide du sort du
   * fichier — exactement ce que cette décision évite.
   *
   * ⚠️ LA ROUTE LE TIENT AUSSI, DE SON CÔTÉ (`Content-Disposition: attachment` forcé). Deux gardes pour la même
   * règle : un écran se contourne par une adresse tapée à la main, une route non.
   */
  const precaution = telechargementSeulement({ nom: p.nomFichier, typeMime: p.typeMime });
  /**
   * 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LA VIGNETTE D'UNE VIDÉO SE FABRIQUE DANS LE NAVIGATEUR.
   *
   * Le serveur n'a pas de décodeur vidéo (pas de `ffmpeg`, et rien ne s'installe sans l'accord d'Arno) : il
   * répond donc 404, l'image échoue, et c'est CET échec qui lance l'extraction. Une fois déposée, la vignette
   * est servie comme toutes les autres — par la même route, avec le même cache.
   */
  const { pret: vignetteVideoPrete } = useMiniatureVideo({
    pieceId: p.pieceId, urlOctets: lien, urlMiniature: `${lien}/miniature`,
    estVideo: sorte === 'video', sansVignette: vignetteMorte,
  });
  const avecVignette = sorte !== 'autre' && (!vignetteMorte || vignetteVideoPrete);
  /**
   * ══ 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — DEUX GESTES, DEUX DESTINATIONS, PLUS AUCUNE AMBIGUÏTÉ ═══════════════
   *
   * DÉCISION D'ARNO (03/10/2026). Jusqu'ici, la miniature OUVRAIT la visionneuse d'un simple clic sur les écrans
   * qui en ont une, et un nouvel onglet sur les autres : le même geste faisait deux choses différentes selon
   * l'écran, et aucune des deux n'était annoncée.
   *
   *   · l'ŒIL (rangée d'actions, à côté de ⤓ et ▲) → la VISIONNEUSE MAISON ;
   *   · le DOUBLE-CLIC sur la miniature → le DOCUMENT ENTIER dans un nouvel onglet (`lienDocumentEntier`) ;
   *   · le CLIC SIMPLE ne fait plus rien. Il ne servait à rien d'autre ICI — pas de sélection, pas de
   *     glisser-déposer (ceux-là vivent dans la fenêtre Drive, où ils ne sont pas touchés).
   *
   * 🔴 LA MINIATURE RESTE UN `<button>`, ET CE N'EST PAS UN DÉTAIL. Un `<div onDoubleClick>` n'est atteignable ni
   * au clavier ni au lecteur d'écran : les écrans sans œil (l'historique d'une cible, la vie d'un bien) auraient
   * PERDU leur seul accès au document au clavier, alors que ce lot ne retire rien. Le bouton garde donc le focus,
   * et « Entrée » y ouvre l'onglet — exactement ce que le lien d'avant faisait.
   *
   * ⚠️ `onClick` NE FAIT RIEN, ET IL EST ÉCRIT QUAND MÊME : un double-clic émet D'ABORD deux `click`. Les laisser
   * tomber dans le vide est le comportement voulu ; ne pas écrire le gestionnaire aurait laissé croire à un oubli.
   */
  const ouvrirOnglet = () => {
    /* 🔴🔴 POINT 1 — UN FICHIER « À OUVRIR AVEC PRÉCAUTION » NE S'OUVRE PAS DANS UN ONGLET : il se télécharge.
       `?telecharger=1` est exactement ce que fait le picto ⤓ juste en dessous. */
    const vers = precaution ? `${lien}?telecharger=1` : lienDocumentEntier(p.pieceId);
    window.open(vers, '_blank', 'noopener,noreferrer');
  };
  /**
   * ⚠️ LA CONDITION DE L'ŒIL EST `sorteApercu`, ET NON `sortePiece` : c'est elle qui décide de l'entrée dans le
   * TOUR de la visionneuse (`voisinsVisualisables`). Les deux listes diffèrent — un .txt a un aperçu et pas de
   * miniature — et se fier à la mauvaise poserait la visionneuse sur une pièce absente du tour, donc un compteur
   * « 0 / 7 ».
   *
   * ⚠️ SANS RAPPEL, PAS D'ŒIL : c'est le cas des écrans qui montrent des messages venus de PLUSIEURS échanges
   * (l'historique d'une cible, la vie d'un bien). Il n'y a pas là de « conversation » dont on puisse faire le
   * tour, et promettre un bouton qui n'ouvrirait rien est pire que de ne rien montrer.
   */
  const voirIci = onVisualiser !== undefined && sorteApercu(p.typeMime ?? '') !== 'aucun' && !precaution;

  return (
    <li className="pj-carte">
      <button
        type="button"
        className="pj-apercu pj-apercu--bouton"
        onClick={() => { /* 🔴 LE CLIC SIMPLE NE FAIT PLUS RIEN (décision d'Arno) — voir l'encadré ci-dessus. */ }}
        onDoubleClick={ouvrirOnglet}
        /* « Entrée » et « Espace » ouvrent l'onglet : le clavier garde l'accès que le lien d'avant lui donnait. */
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          ouvrirOnglet();
        }}
        title={precaution ? `Double-cliquez pour télécharger — ${MENTION_PRECAUTION}` : AIDE_DOUBLE_CLIC}
        aria-label={precaution
          ? `Télécharger ${p.nomFichier} (${etiquette}, ${formaterTaille(p.tailleOctets)}) — ${MENTION_PRECAUTION}`
          : `Ouvrir ${p.nomFichier} dans un nouvel onglet (${etiquette}, ${formaterTaille(p.tailleOctets)})`}
      >
        {avecVignette ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route, jamais optimisable par Next
          <img
            className="pj-vignette"
            /* ⚠️ `?v=1` APRÈS LE DÉPÔT, ET C'EST INDISPENSABLE : le navigateur a mis en cache le 404 de tout à
               l'heure (la route le sert `no-store`, mais l'image, elle, reste dans la mémoire de la page). Une
               adresse neuve force la relecture, et c'est la seule qui marche. */
            src={vignetteVideoPrete ? `${lien}/miniature?v=1` : `${lien}/miniature`}
            alt=""
            height={VIGNETTE_H}
            loading="lazy"
            decoding="async"
            /* 🔴 UNE IMAGE EST SAISISSABLE NATIVEMENT : sans cela, un double-clic un peu traînant démarre le
               glisser de l'IMAGE au lieu d'ouvrir le document. Même précaution que la fenêtre Drive. */
            draggable={false}
            // Pas de vignette (migration 244 non appliquée, type sans image, fichier illisible) : on retombe sur
            //   l'étiquette de type, sans jamais laisser une image cassée à l'écran.
            onError={() => setVignetteMorte(true)}
            /* 🔴 LA VIGNETTE VIDÉO VIENT D'ARRIVER : on oublie l'échec d'avant, sinon la tuile grise reviendrait
               au prochain rendu. */
            onLoad={() => { if (vignetteVideoPrete) setVignetteMorte(false); }}
          />
        ) : (
          <span className="pj-type" aria-hidden="true">{etiquette}</span>
        )}
      </button>

      <div className="pj-pied">
        <span className="pj-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier)}</span>
        <span className="pj-taille">{formaterTaille(p.tailleOctets)}</span>
        {/* 🔴🔴 POINT 1 — la mention d'Arno, mot pour mot, et SEULEMENT sur ces fichiers-là. Elle n'alarme pas :
            elle dit ce que l'application ne fera pas à notre place. */}
        {precaution && <span className="pj-precaution">{MENTION_PRECAUTION}</span>}
        {/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — « → envoyé à la partie … », sous la ligne de la pièce. Le même
            composant que les cartes du résumé : une seule écriture, donc un seul comportement. */}
        <DestinatairesDePiece familles={destinataires} />
        {/* DÉJÀ DANS LE DRIVE : dit en MOTS, avec le nom du dossier, et un lien pour y aller. */}
        {depot && (
          <span className="pj-drive-mention">
            Dans le Drive{depot.dossierNom ? ` · ${tronquerNom(depot.dossierNom, 22)}` : ''}
            {depot.webViewLink ? <> · <a className="pj-lien" href={depot.webViewLink} target="_blank" rel="noreferrer">ouvrir</a></> : null}
          </span>
        )}
      </div>

      {/* ══ LA RANGÉE D'ACTIONS ══ Toujours visible, jamais au survol. Le bouton « Drive » du lot B viendra ICI, à
          côté de celui-ci, sans rien réorganiser. */}
      <div className="pj-actions">
        {/* ══ 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — L'ŒIL, À CÔTÉ DE ⤓ ET ▲ ═══════════════════════════════════════
            Arno : « un picto “œil” à côté des deux pictos existants, même taille et même style, aria-label
            “Visualiser”. Il ouvre la visionneuse existante. »

            🔴 IL EST EN PREMIER, et c'est le geste le plus courant des trois : on regarde une pièce bien plus
            souvent qu'on ne la télécharge ou qu'on ne la range. L'ordre de la rangée suit l'usage.

            ⚠️ ABSENT QUAND IL N'Y A RIEN À OUVRIR (pas de rappel, ou type sans aperçu) : la rangée est alors
            EXACTEMENT celle d'avant ce lot. Un bouton qui n'ouvrirait rien est pire que pas de bouton — c'est la
            règle de ce fichier depuis le lot 5-PJ-A, et elle vaut ici comme pour le bouton Drive. */}
        {voirIci && (
          <button
            type="button" className="pj-action" onClick={() => onVisualiser?.(p.pieceId)}
            aria-label={`${AIDE_OEIL_PIECE} ${p.nomFichier}`} title={AIDE_OEIL_PIECE}
          >
            <Oeil taille={17} />
          </button>
        )}
        <a className="pj-action" href={`${lien}?telecharger=1`} aria-label={`Télécharger ${p.nomFichier}`} title="Télécharger">
          <span aria-hidden="true">⤓</span>
        </a>
        {/* LOT 5-PJ-B — l'icône Drive, TOUJOURS visible (jamais au survol), cible de 44 px, à côté du téléchargement. */}
        {indisponible === null ? (
          <button
            type="button" className="pj-action" onClick={onDrive}
            aria-label={`Ajouter ${p.nomFichier} au Drive`} title="Ajouter au Drive"
          >
            <span aria-hidden="true">▲</span>
          </button>
        ) : (
          <span className="pj-action pj-action--muette" role="note" title={indisponible} aria-label={indisponible}>
            <span aria-hidden="true">▲</span>
          </span>
        )}
        {/* ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — « À DROITE DES PICTOS EXISTANTS » (Arno) ═══════════
            Il est le DERNIER de la rangée, et il n'y paraît QUE si cette pièce est déjà dans le Drive : c'est un
            CONSTAT, pas une action à proposer. Les trois autres, eux, sont toujours là — l'ordre ne bouge pas. */}
        <PictoDansLeDrive
          emplacements={emplacements} nomPiece={p.nomFichier} classe="pj-action"
          onOuvrir={(e) => onVoirDansLeDrive(e, {
            pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime,
          })} />
      </div>
    </li>
  );
}

/**
 * Le style des pièces jointes. Uniquement des jetons `--color-svv-*` : aucune couleur en dur, et la grille se replie
 * en colonne étroite sur un iPhone en portrait (390 px).
 */
export const CSS_PIECES = `
${CSS_PICTO_DANS_LE_DRIVE}
.pj{margin-top:.6rem;min-width:0}
/* ── LA BARRE ── prête à recevoir un second bouton (Drive, lot B) sans rien déplacer. */
.pj-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:.45rem}
.pj-compte{font-size:.82rem;color:var(--color-svv-ink-soft)}
.pj-actions-barre{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto}
.pj-bouton{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .7rem;border-radius:.5rem;
  font-size:.82rem;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);text-decoration:none;cursor:pointer}
.pj-bouton:hover{border-color:var(--color-svv-ink-soft)}
.pj-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Un refus n'est pas un bouton : il ne se clique pas, et il DIT pourquoi. */
.pj-bouton--muet{background:transparent;border-style:dashed;color:var(--color-svv-ink-soft);cursor:default}
.pj-poids{color:var(--color-svv-ink-soft)}

/* ── LA GRILLE ── auto-fill + minmax : trois cartes sur un écran large, UNE seule à 390 px, sans media query.
   (Pas d'accent grave dans ce commentaire : il est DANS un littéral gabarit, qu'il terminerait — piège déjà payé.) */
.pj-grille{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.pj-carte{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);overflow:hidden;min-width:0}

/* L'aperçu : hauteur RÉSERVÉE, pour que la page ne saute pas quand les vignettes arrivent. */
.pj-apercu{display:flex;align-items:center;justify-content:center;height:${VIGNETTE_H}px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line);text-decoration:none;overflow:hidden}
.pj-apercu:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* LOT PIECES-DE-LA-CONVERSATION — la MEME case, en bouton : elle ouvre la visionneuse maison au lieu d'un onglet.
   Aucun style propre, seulement ce qu'un <button> apporte de son cru et qu'il faut neutraliser. */
.pj-apercu--bouton{width:100%;padding:0;font:inherit;cursor:pointer;
  border:0;border-bottom:1px solid var(--color-svv-line)}
/* ══ 🔴 LOT LISTE-GMAIL — LA VIGNETTE REMPLIT SON CADRE, RECADRÉE PAR LE HAUT ════════════════════════════════════
   object-fit:contain laissait des bandes vides à gauche et à droite d'une page A4 : la carte annonçait une image, on
   voyait surtout du fond. cover remplit les deux dimensions, et object-position:top choisit CE QU'ON GARDE — le HAUT
   du document, c'est-à-dire l'en-tête, l'expéditeur, l'objet : ce qui permet de reconnaître une pièce sans l'ouvrir.
   Le bas est coupé, et c'est voulu.
   ⚠️ width:100% est indispensable avec cover : sans largeur imposée, l'image garde sa largeur naturelle et cover
   n'a rien à remplir.
   ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit. */
.pj-vignette{width:100%;height:${VIGNETTE_H}px;object-fit:cover;object-position:top;display:block}
/* L'étiquette de TYPE en toutes lettres : elle reste lisible en niveaux de gris, là où une icône seule ne dirait rien. */
.pj-type{font-size:.95rem;font-weight:600;letter-spacing:.06em;color:var(--color-svv-ink-soft)}

.pj-pied{display:flex;flex-direction:column;gap:2px;padding:.4rem .5rem 0;min-width:0}
.pj-nom{font-size:.8rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pj-taille{font-size:.74rem;color:var(--color-svv-ink-soft)}
/* ══ 🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — « Fichier a ouvrir avec precaution » ══════════════
   AMBRE, PAS ROUGE : ce n'est pas une alerte, c'est un RENSEIGNEMENT. Le rouge du module dit « quelque chose ne va
   pas » ; ici tout va bien, on previent simplement que l'application n'ouvrira pas ce fichier a notre place. Jeton
   du theme, donc lisible en Clair comme en Sombre, et le MOT porte l'information — jamais la seule couleur. */
.pj-precaution{font-size:.72rem;font-weight:600;color:var(--color-svv-amber);overflow-wrap:anywhere}

/* Les actions : TOUJOURS visibles (jamais au survol seul), cible de 44 px. */
.pj-actions{display:flex;align-items:center;gap:2px;padding:.2rem .35rem .35rem;margin-top:auto}
.pj-action{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  color:var(--color-svv-ink);background:transparent;border:1px solid transparent;border-radius:.45rem;
  text-decoration:none;font-size:1.05rem;line-height:1}
.pj-action:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pj-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pj-refusees{list-style:none;margin:.45rem 0 0;padding:0;display:flex;flex-direction:column;gap:.2rem}
.pj-refusee{font-size:.78rem;color:var(--color-svv-ink-soft)}
/* 🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — « voir dans Gmail » : un LIEN, qui se voit comme un lien (souligne
   et teinte), et un simple mot quand il n'y a nulle part a pointer. Meme jeton que les autres liens du module,
   donc lisible en Clair comme en Sombre. */
.pj-refusee-gmail{font-weight:600;color:var(--color-svv-red);text-decoration:underline}
a.pj-refusee-gmail:hover{text-decoration:none}
span.pj-refusee-gmail{color:var(--color-svv-muted);text-decoration:none;font-style:italic}
.pj-refusee-nom{color:var(--color-svv-ink)}

.pj-signatures{margin-top:.5rem}
.pj-signatures-titre{cursor:pointer;font-size:.78rem;color:var(--color-svv-ink-soft);min-height:44px;
  display:flex;align-items:center}
.pj-signatures-titre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ── LOT 5-PJ-B ── */
.pj-drive-mention{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pj-lien{color:var(--color-svv-ink);text-decoration:underline}
.pj-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Une action indisponible n'est PAS un bouton : elle ne se clique pas, et son titre dit pourquoi. */
.pj-action--muette{opacity:.55;cursor:default}
.pj-info{font-size:.8rem;color:var(--color-svv-ink-soft);margin:.4rem 0 0}
.pj-rapport{margin-top:.5rem;padding:.5rem;border:1px solid var(--color-svv-line);border-radius:.5rem;
  background:var(--color-svv-field)}
.pj-rapport-titre{margin:0 0 .3rem;font-size:.82rem;color:var(--color-svv-ink);font-weight:600}
.pj-rapport-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.2rem;
  font-size:.78rem;color:var(--color-svv-ink-soft)}
.pj-rapport-nom{color:var(--color-svv-ink)}

@media (prefers-reduced-motion:reduce){
  .pj-bouton,.pj-action,.pj-apercu{transition:none}
}
/* ⚠️ LE STYLE DE LA FENÊTRE DRIVE N'EST PLUS AJOUTÉ ICI : la fenêtre porte le sien, dans son propre <style>. Le
   panneau en ligne, lui, n'existe plus — ses règles partaient avec lui. */
`;
