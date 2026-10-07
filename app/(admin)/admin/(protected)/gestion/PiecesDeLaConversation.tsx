'use client';

import { useEffect, useRef, useState } from 'react';
import {
  grouperParMessage, INFOBULLE_PIECES_CONVERSATION, libelleOrdrePieces, mentionAutreApparition,
  mentionExpediteurPiece, motPieces, TITRE_PIECES_CONVERSATION,
  type OrdrePieces, type PieceDeConversation, type PieceDedoublonnee,
} from '../../../../lib/gestion/piecesConversation';
import {
  AIDE_DOUBLE_CLIC, etiquetteType, formaterTaille, lienDocumentEntier, sortePiece, tronquerNom,
} from '../../../../lib/gestion/pieces';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { messageSansApercu, sorteApercu } from '../../../../lib/gestion/apercuDrive';
/* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — la vignette d'une vidéo, extraite par le navigateur. */
import { useMiniatureVideo } from './miniatureVideoNavigateur';
import type { DepotAffiche } from './PiecesJointes';
/* 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — « vaut partout ou les miniatures de pieces recues apparaissent »
   (Arno) : le recapitulatif en fait partie, et il recoit le MEME picto, ecrit une seule fois. */
import { CSS_PICTO_DANS_LE_DRIVE, PictoDansLeDrive } from './PictoDansLeDrive';
/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — « → envoyé à la partie … ». Importé, jamais recopié : les mêmes lignes
   paraissent sur les miniatures du mail déplié, et deux rendus auraient divergé au premier correctif. */
import { CSS_DESTINATAIRES_PIECE, DestinatairesDePiece } from './DestinatairesDePiece';
/* 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — les FAMILLES destinataires remplacent les parties : une famille de
   plus (Interne), « non affecté » devenu Extérieur, et le Cci compté quand on le connaît. */
import type { FamilleVue } from '../../../../lib/gestion/familleDestinataire';
import type { EmplacementPiece } from '../../../../lib/gestion/pieceDansLeDrive';
/* 🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — la forme d'une pièce telle que la fenêtre du Drive la reçoit. */
import type { PieceARanger } from '../../../../lib/gestion/rangementDrive';

/**
 * LOT PIECES-DE-LA-CONVERSATION — LE RÉCAPITULATIF DES PIÈCES D'UN ÉCHANGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE ÇA RÉPARE, DANS LES MOTS D'ARNO : « dans toute conversation qui contient au moins une pièce jointe,
 * un petit trombone + le nombre total, en haut et en bas. Un clic ouvre une fenêtre “Pièces jointes de la
 * conversation” : une grille de vignettes, avec sous chacune le nom, la taille, la date, l'expéditeur, et l'état
 * “Dans le Drive” si elle y est déjà. »
 *
 * Avant, pour retrouver « la troisième quittance » d'un échange de douze messages, il fallait déplier les douze et
 * regarder dans chacun. Sur un échange de syndic qui traîne depuis six mois, personne ne le fait : on redemande le
 * document au correspondant.
 *
 * 🔴 AUCUNE RÈGLE N'EST ÉCRITE ICI. Ce qui compte comme pièce, l'ordre, le regroupement, les mots : tout vient du
 * module PUR `piecesConversation.ts`, qui est éprouvé sans écran. Cet écran ne fait que placer et peindre — c'est ce
 * qui garantit que le nombre du trombone et le nombre de cartes sortent du MÊME calcul.
 *
 * 🔒 AUCUNE URL DE STOCKAGE, AUCUNE ÉCRITURE. Les vignettes et les octets sont servis par nos routes, qui relisent
 * le droit à chaque fois ; le dépôt, lui, passe par la fenêtre Drive habituelle — cette fenêtre-ci ne fait que la
 * demander pour une pièce précise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La hauteur RÉSERVÉE d'une vignette. Fixée ici et dans le CSS : sans elle, la grille saute quand les images arrivent. */
const VIGNETTE_H = 132;

/**
 * ══ 🔴 LE TROMBONE, EN HAUT ET EN BAS ════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « une petite icône trombone + le nombre total (“📎 7 pièces”) à DEUX endroits ».
 *
 * 🔴 UN SEUL COMPOSANT POUR LES DEUX PLACES. Deux boutons écrits séparément auraient fini par porter deux libellés,
 * deux infobulles, ou deux comptes — et c'est toujours celui qu'on regarde le moins qui garde le défaut.
 *
 * ⚠️ RIEN DU TOUT QUAND IL N'Y A AUCUNE PIÈCE (demande d'Arno) : un trombone à zéro promettrait une fenêtre vide.
 * C'est l'appelant qui ne le rend pas ; on le redit ici pour que ce soit vrai même s'il l'oublie.
 */
export function BoutonPiecesConversation({ nombre, onOuvrir }: { nombre: number; onOuvrir: () => void }) {
  if (nombre <= 0) return null;
  return (
    <button type="button" className="pdc-trombone" onClick={onOuvrir}
      title={INFOBULLE_PIECES_CONVERSATION} aria-label={`${INFOBULLE_PIECES_CONVERSATION} (${motPieces(nombre)})`}>
      <span aria-hidden="true">📎</span> {motPieces(nombre)}
    </button>
  );
}

/** Ce qu'une carte peut demander. Chaque geste est rendu par l'écran PARENT : la fenêtre ne décide de rien. */
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les lignes « → envoyé à la partie … », rendues par LEUR composant et non
 * recopiées ici : elles paraissent aussi sur les miniatures du mail déplié, et deux rendus auraient divergé.
 */
export interface GestesPiece {
  /** Ouvre la visionneuse sur cette pièce, avec le tour de TOUTE la conversation. */
  onVoir: (pieceId: number) => void;
  /** Ouvre la fenêtre Drive en mode « ranger » sur cette seule pièce. */
  onRanger: (piece: PieceDeConversation) => void;
  /** Ferme la fenêtre et déplie le message dans le fil (demande d'Arno). */
  onAllerAuMessage: (messageId: number) => void;
  /**
   * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — voir où ce CONTENU se trouve déjà, dans notre fenêtre Drive.
   *
   * ⚠️ RENDU PAR L'ÉCRAN PARENT, comme tous les autres gestes de cette fenêtre : la fenêtre Drive s'empile
   * au-dessus de celle-ci, et c'est la conversation qui tient cet empilement (et l'écoute d'Échap qui va avec).
   */
  /**
   * 🔴🔴 LOT DRIVE-VIGNETTES-PIECES-SOURCE — LA PIÈCE VOYAGE AVEC L'EMPLACEMENT. `EmplacementPiece` ne dit que
   * le FICHIER là-bas (son identifiant Drive, son dossier) : il ne porte ni le `pieceId`, ni la taille, ni le
   * type. Or c'est la PIÈCE qu'Arno veut voir en vignette dans la colonne de gauche. L'appelant la tient sous la
   * main ; la redemander au serveur aurait fait une lecture de plus pour une donnée déjà affichée à l'écran.
   */
  onVoirDansLeDrive: (e: EmplacementPiece, source: PieceARanger) => void;
}

export function ModalePiecesConversation({
  pieces, ordre, onOrdre, sansEmpreinte, depots, emplacements, maintenant, gestes, destinataires,
  ecouterEchap, onFermer,
}: {
  /**
   * DÉJÀ CLASSÉES **ET DÉJÀ DÉDOUBLONNÉES** par le module pur : cette fenêtre ne trie rien et ne rapproche rien.
   * Chaque pièce porte ses autres apparitions ; il ne reste qu'à les écrire.
   */
  pieces: readonly PieceDedoublonnee[];
  ordre: OrdrePieces;
  onOrdre: () => void;
  /**
   * 🔴 COMBIEN DE RAPPROCHEMENTS ONT ÉTÉ FAITS SANS EMPREINTE, sur le seul nom et la seule taille. `0` dans le cas
   * ordinaire, et le pied de la fenêtre ne dit alors rien. Non nul, il le DIT : une présomption qu'on présente
   * comme une preuve est pire qu'un doublon affiché.
   */
  sansEmpreinte: number;
  /** Les dépôts connus, par pièce. Vide = migration 245 absente, ou aucune pièce rangée : aucune mention. */
  depots: ReadonlyMap<number, DepotAffiche>;
  /**
   * 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — où chaque CONTENU se trouve déjà. Absent pour une pièce ⇒ aucun picto.
   *
   * ⚠️ DISTINCT DE `depots`, et il faut les deux : l'un dit ce que NOUS avons rangé pour cette pièce, l'autre
   * partout où ce contenu est, sous quelque nom que ce soit.
   */
  emplacements: ReadonlyMap<number, readonly EmplacementPiece[]>;
  maintenant: Date;
  gestes: GestesPiece;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — À QUELLE PARTIE CETTE PIÈCE A-T-ELLE ÉTÉ ENVOYÉE ═══════════════════
   *
   * Demande d'Arno : sous la date d'une pièce que NOUS avons envoyée, une ligne par partie destinataire.
   *
   * 🔴 UNE FONCTION DU MESSAGE, ET NON UNE LISTE : les cartes d'une même fenêtre viennent de messages différents,
   * et chacun a ses propres destinataires. L'appelant répond, parce que lui seul connaît les catégories — et
   * elles sont celles d'UN BIEN (la même adresse est « locataire » ici et « tiers » ailleurs).
   *
   * ⚠️ ABSENTE ⇒ AUCUNE LIGNE, et la fenêtre d'une conversation ne bouge pas d'un pixel : elle n'a pas de bien en
   * tête, donc aucune catégorie à lire. C'est la même règle que `tonDe` sur la ligne d'un mail.
   */
  destinataires?: (messageId: number) => readonly FamilleVue[];
  /**
   * 🔴 ÉCHAP NE FERME QUE LA FENÊTRE DU DESSUS. La visionneuse et la fenêtre Drive vivent AU-DESSUS de celle-ci et
   * posent leurs propres écouteurs sur `window` ; le premier inscrit répond le premier, et ce serait celui-ci.
   * L'appelant éteint donc cet écouteur tant qu'une fenêtre est ouverte par-dessus — sans quoi une seule touche
   * refermait les deux, et l'on perdait la liste en croyant fermer l'aperçu.
   */
  ecouterEchap: boolean;
  onFermer: () => void;
}) {
  const croix = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { croix.current?.focus(); }, []);

  useEffect(() => {
    if (!ecouterEchap) return undefined;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [ecouterEchap, onFermer]);

  const groupes = grouperParMessage(pieces);

  return (
    <div className="pdc-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_PIECES_CONVERSATION}</style>
      <div className="pdc" role="dialog" aria-modal="true" aria-label={TITRE_PIECES_CONVERSATION}>
        <header className="pdc-tete">
          <h2 className="pdc-titre">
            <span aria-hidden="true">📎</span> {TITRE_PIECES_CONVERSATION}
            <span className="pdc-compte"> · {motPieces(pieces.length)}</span>
          </h2>
          {/* 🔴 LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait — même convention que l'ordre de lecture
              des messages. `aria-pressed` porte la même information au clavier. */}
          <button type="button" className="gst-lien-bouton pdc-ordre" aria-pressed={ordre === 'recent'}
            title="Inverser l’ordre des pièces" onClick={onOrdre}>
            {libelleOrdrePieces(ordre)}
          </button>
          <button ref={croix} type="button" className="pdc-croix" onClick={onFermer}
            aria-label="Fermer la liste des pièces">×</button>
        </header>

        <div className="pdc-corps">
          {groupes.map((g) => (
            <section key={g.messageId} className="pdc-groupe">
              {/* ══ 🔴 LA DATE DU MESSAGE, AU-DESSUS DE SES PIÈCES (demande d'Arno) ═══════════════════════════
                  C'est le repère qu'on cherche vraiment : on se souvient de « le devis reçu fin août », jamais du
                  nom du fichier. L'objet du mail est donné à sa suite, en gris — il aide à reconnaître le moment. */}
              <h3 className="pdc-groupe-titre">
                <span className="pdc-groupe-date">{dateHeureComplete(g.recuLe)}</span>
                <span className="pdc-groupe-qui"> · {mentionExpediteurPiece(g)}</span>
                {(g.objet ?? '').trim() !== '' && (
                  <span className="pdc-groupe-objet"> · {tronquerNom(g.objet!.trim(), 60)}</span>
                )}
              </h3>
              <ul className="pdc-grille">
                {g.pieces.map((p) => (
                  /**
                   * 🔴 LOT RECAP-SANS-DOUBLON — « DANS LE DRIVE » SE CHERCHE SUR TOUTES LES APPARITIONS.
                   *
                   * Le dépôt est enregistré contre LA pièce rangée. Si l'on a rangé la copie reçue le 30/09 et
                   * que la carte montre celle du 23/09, chercher le dépôt sur le seul identifiant affiché ferait
                   * disparaître la mention — et l'on rangerait une seconde fois un fichier déjà rangé.
                   *
                   * ⚠️ LE PREMIER DÉPÔT TROUVÉ GAGNE : c'est le même fichier, donc le même document dans le
                   * Drive. Les montrer tous n'apprendrait rien et allongerait la carte.
                   */
                  <CartePieceConversation key={p.pieceId} piece={p} maintenant={maintenant} gestes={gestes}
                    /* 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — MÊME REPLI QUE LE DÉPÔT, et pour la même raison : les
                       autres apparitions sont le MÊME fichier, donc le même contenu, donc les mêmes
                       emplacements. Ne lire que la pièce affichée priverait de picto la copie d'un message
                       plus ancien, alors que le document est bien dans le Drive. */
                    emplacements={emplacements.get(p.pieceId)
                      ?? p.autresApparitions.map((a) => emplacements.get(a.pieceId)).find((e) => e !== undefined)
                      ?? []}
                    /* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties destinataires de CE message : chaque
                       carte de la fenêtre vient d'un message différent, et chacun a les siens. */
                    destinataires={destinataires?.(p.messageId) ?? []}
                    depot={depots.get(p.pieceId)
                      ?? p.autresApparitions.map((a) => depots.get(a.pieceId)).find((d) => d !== undefined)} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="pdc-pied">
          {/* ⚠️ LA NOTE DIT CE QUE LA FENÊTRE NE FAIT PAS : elle ne renomme rien et ne dépose rien elle-même. Le
              renommage vit dans la fenêtre « Ranger », où le nom part vraiment — cf. lot RENOMMER-AVANT-RANGER. */}
          <p className="gst-note pdc-note">
            « Ranger dans le Drive » ouvre la fenêtre habituelle : c’est là qu’on choisit le dossier, et qu’on peut
            renommer la pièce avant de la déposer. Rien n’est déposé depuis cette liste.
          </p>
          {/* 🔴 LE REPLI SE DIT. Sans empreinte, le rapprochement n'est qu'une présomption : qui lit la liste doit
              savoir laquelle des deux il regarde. Rien ne s'affiche dans le cas ordinaire. */}
          {sansEmpreinte > 0 && (
            <p className="gst-note pdc-note pdc-presomption">
              {sansEmpreinte === 1 ? 'Une pièce a été rapprochée' : `${sansEmpreinte} pièces ont été rapprochées`}
              {' '}sur son nom et sa taille, faute d’empreinte : nous n’en avons pas gardé le contenu.
            </p>
          )}
          <button type="button" className="svv-btn gst-btn" onClick={onFermer}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}

/**
 * UNE CARTE. La vignette n'est demandée que pour ce qui peut en avoir une ; pour le reste, l'étiquette de TYPE en
 * toutes lettres (« XML », « DOCX »), qui dit bien plus qu'une icône générique — même règle que les cartes d'un
 * message, et la même route de miniature.
 *
 * ⚠️ `loading="lazy"` + hauteur réservée : une conversation de quarante pièces ne déclenche pas quarante requêtes à
 * l'ouverture, et la grille ne saute pas quand les images arrivent.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — EXPORTÉE, ET POUR UNE SEULE RAISON ═══════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « LES PIÈCES JOINTES : un résumé en HAUT et en BAS du fil, de toutes les pièces
 * des mails affichés, en MINIATURES (**réutilise le composant de miniature des mails** : œil, téléchargement,
 * picto Drive vert), triées par date et par expéditeur comme dans les conversations. »
 *
 * 🔴 C'EST CETTE CARTE-CI, ET PAS UNE AUTRE. Elle porte déjà les trois gestes qu'Arno nomme — l'œil, le
 * téléchargement, le picto vert quand le contenu est déjà dans le Drive — et la mention des autres apparitions
 * d'un même contenu. En redessiner une seconde aurait fait deux miniatures qui vieillissent séparément.
 *
 * ⚠️ AUCUN CONTENU N'A CHANGÉ ICI : seul le mot-clé `export` a été ajouté. La fenêtre
 * `ModalePiecesConversation` continue de l'appeler exactement comme avant, sans savoir que le bloc
 * « Historique » de la fiche l'appelle aussi, en ligne et sans fenêtre.
 */
export function CartePieceConversation({
  piece: p, depot, emplacements, maintenant, gestes, destinataires = [],
}: {
  piece: PieceDedoublonnee;
  depot: DepotAffiche | undefined;
  /** 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — vide ⇒ la carte est EXACTEMENT celle d'avant ce lot. */
  emplacements: readonly EmplacementPiece[];
  maintenant: Date;
  gestes: GestesPiece;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties à qui NOUS avons envoyé cette pièce.
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ LA CARTE EST CELLE D'AVANT CE LOT. C'est ce qui laisse intacts la fenêtre d'une
   * conversation et tout écran qui n'a pas de bien en tête — et le module pur rend déjà vide pour un mail REÇU,
   * donc aucune carte entrante n'a de ligne, où qu'elle soit montée.
   */
  destinataires?: readonly FamilleVue[];
}) {
  const sorte = sortePiece(p.typeMime, p.nomFichier);
  const [vignetteMorte, setVignetteMorte] = useState(false);
  const etiquette = etiquetteType(p.nomFichier, p.typeMime);
  const lien = `/api/admin/gestion/pieces/${p.pieceId}`;
  /* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — « vaut PARTOUT où il y a des miniatures » (Arno). Le même crochet
     que le bloc d'un message et que l'éditeur : une seule implémentation, donc un seul comportement. */
  const { pret: vignetteVideoPrete } = useMiniatureVideo({
    pieceId: p.pieceId, urlOctets: lien, urlMiniature: `${lien}/miniature`,
    estVideo: sorte === 'video', sansVignette: vignetteMorte && p.disponible,
  });
  const avecVignette = p.disponible && sorte !== 'autre' && (!vignetteMorte || vignetteVideoPrete);
  /**
   * 🔴 POURQUOI « VISUALISER » EST PARFOIS ÉTEINT, ET CE QU'IL DIT ALORS. Un type hors liste blanche n'a pas
   * d'aperçu du tout (`sorteApercu`), et une pièce non conservée n'a pas d'octets. Un bouton éteint sans motif se
   * lit comme une panne ; avec son motif, il se lit comme une règle. C'est la MÊME fonction pure que la visionneuse
   * emploie pour décider ce qu'elle sait montrer — aucune seconde liste à tenir.
   */
  const refusApercu = !p.disponible
    ? (p.motifNonStocke ?? 'Pièce non conservée : il n’y a rien à afficher.')
    : (sorteApercu(p.typeMime ?? '') === 'aucun' ? messageSansApercu(p.typeMime ?? '') : null);

  /**
   * ══ 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — LA MÊME RÈGLE QUE DANS LE MAIL ══════════════════════════════════════
   *
   * DÉCISION D'ARNO : le clic simple sur une miniature n'ouvre plus la visionneuse. Ici, l'œil existe DÉJÀ dans la
   * rangée d'actions juste en dessous (lot PIECES-DE-LA-CONVERSATION) : il n'y a rien à ajouter, seulement le
   * geste de la miniature à aligner sur celui du bloc d'un message.
   *
   * ⚠️ UNE PIÈCE NON CONSERVÉE N'OUVRE RIEN DU TOUT : il n'y a pas d'octets à servir, et un onglet vide se lirait
   * comme une panne. Le double-clic n'est donc posé que sur ce qui est `disponible` — c'est une condition plus
   * large que `refusApercu`, qui refuse AUSSI les types sans aperçu (un .docx n'a pas de visionneuse, mais il a
   * bien un document à ouvrir dans un onglet).
   */
  const ouvrirOnglet = !p.disponible
    ? undefined
    : () => { window.open(lienDocumentEntier(p.pieceId), '_blank', 'noopener,noreferrer'); };

  return (
    <li className="pdc-carte">
      {ouvrirOnglet !== undefined ? (
        <button type="button" className="pdc-apercu"
          /* 🔴 LE CLIC SIMPLE NE FAIT PLUS RIEN : l'œil de la rangée d'actions ouvre la visionneuse. */
          onClick={() => { /* volontairement vide — voir l'encadré ci-dessus */ }}
          onDoubleClick={ouvrirOnglet}
          /* « Entrée » et « Espace » gardent au clavier l'accès que le clic simple avait avant ce lot. */
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            ouvrirOnglet();
          }}
          title={AIDE_DOUBLE_CLIC}
          aria-label={`Ouvrir ${p.nomFichier} dans un nouvel onglet (${etiquette}, ${formaterTaille(p.tailleOctets)})`}>
          {avecVignette ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route, jamais optimisable par Next
            /* ⚠️ `?v=1` UNE FOIS LA VIGNETTE VIDÉO DÉPOSÉE : le 404 d'il y a un instant est encore dans la
               mémoire de la page, et seule une adresse neuve force la relecture. */
            <img className="pdc-vignette" src={vignetteVideoPrete ? `${lien}/miniature?v=1` : `${lien}/miniature`}
              alt="" height={VIGNETTE_H}
              loading="lazy" decoding="async"
              /* Une image est saisissable nativement : sans cela, un double-clic traînant démarre son glisser. */
              draggable={false}
              // Pas de vignette (migration 244 non appliquée, type sans image, fichier illisible) : on retombe sur
              //   l'étiquette de type, sans jamais laisser une image cassée à l'écran.
              onError={() => setVignetteMorte(true)}
              onLoad={() => { if (vignetteVideoPrete) setVignetteMorte(false); }} />
          ) : (
            <span className="pdc-type" aria-hidden="true">{etiquette}</span>
          )}
        </button>
      ) : (
        <span className="pdc-apercu pdc-apercu--muet" role="note"
          title={p.motifNonStocke ?? 'Pièce non conservée : il n’y a rien à afficher.'}>
          <span className="pdc-type" aria-hidden="true">{etiquette}</span>
        </span>
      )}

      <div className="pdc-pied-carte">
        <span className="pdc-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier, 30)}</span>
        <span className="pdc-meta">{formaterTaille(p.tailleOctets)}</span>
        {/* ⚠️ LA DATE ET L'EXPÉDITEUR SONT REDITS SUR LA CARTE (demande d'Arno), en court : la fenêtre se parcourt
            des yeux, et l'en-tête du groupe peut être remonté hors de vue sur un échange de quarante pièces. */}
        <span className="pdc-meta" title={dateHeureComplete(p.recuLe)}>
          {dateHeureCourte(p.recuLe, maintenant)} · {mentionExpediteurPiece(p)}
        </span>
        {/* 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — SOUS LA DATE, comme Arno le demande : une ligne par partie
            destinataire. Rien n'est rendu pour un mail reçu (le module pur rend vide), ni là où l'appelant ne
            connaît aucune catégorie. */}
        <DestinatairesDePiece familles={destinataires} />
        {/* DÉJÀ DANS LE DRIVE : dit en MOTS, avec le nom du dossier, et un lien pour y aller — même mention que la
            carte d'un message, puisque c'est la même information. */}
        {depot && (
          <span className="pdc-drive">
            Dans le Drive{depot.dossierNom ? ` · ${tronquerNom(depot.dossierNom, 20)}` : ''}
            {depot.webViewLink ? <> · <a className="pdc-lien" href={depot.webViewLink} target="_blank" rel="noreferrer">ouvrir</a></> : null}
          </span>
        )}
        {/* Une pièce qu'on n'a pas doit se voir, avec son motif : sinon on la croit reçue. */}
        {!p.disponible && (
          <span className="pdc-meta">non conservée{p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}</span>
        )}
        {/* ══ 🔴🔴 LES AUTRES APPARITIONS DU MÊME FICHIER ═══════════════════════════════════════════════════════
            Arno : « une mention discrète “aussi envoyée le 30/09 à 17:49”, une ligne par autre apparition,
            cliquable vers le message ».

            🔴 ON LES DIT, ON NE LES CACHE PAS. Retirer les répétitions sans rien laisser ferait douter : « je suis
            sûr de l'avoir renvoyée, pourquoi ne la vois-je pas ? ». La ligne répond à la question avant qu'elle
            ne se pose, et le clic mène au courrier concerné.

            ⚠️ UN BOUTON, PAS UN LIEN : le geste reste DANS l'application (fermer la fenêtre, déplier le message),
            il n'y a aucune adresse à ouvrir — et un lien qui ne navigue pas se copie, se partage, et ne marche
            nulle part. */}
        {p.autresApparitions.map((a) => (
          <button key={a.pieceId} type="button" className="pdc-aussi"
            onClick={() => gestes.onAllerAuMessage(a.messageId)}
            title={`Aller au message du ${dateHeureComplete(a.recuLe)}`}>
            {mentionAutreApparition(a, p.messageId)}
          </button>
        ))}
      </div>

      {/* ══ LES ACTIONS ══ Toujours visibles, jamais au survol : sur un iPhone, une action qui n'apparaît qu'au
          passage de la souris n'existe pas. Cible de 44 px, et le mot en infobulle ET en libellé accessible.

          ══ 🔴🔴 LOT PJ-MINIATURE-ICONES — DEUX RANGÉES, ET NON UNE QUI SE REPLIE ═══════════════════════════════
          CONSTAT D'ARNO (07/10/2026), sur « RIB GESTION CRED… AGRIC… » : la 4e icône (verte, « déjà dans le
          Drive ») passait SOUS la ligne des icônes et se retrouvait à gauche de « Aller au message ».

          🔴 LA CAUSE ÉTAIT UNE SEULE RANGÉE EN `flex-wrap`. Les cinq éléments — quatre pictos de 44 px et un MOT —
          vivaient dans la même rangée repliable. Mesuré : une carte fait au minimum 190 px, moins ses marges
          internes il reste ~179 px, et quatre cibles de 44 px plus leurs gouttières en demandent 182. Il
          manquait trois pixels, et c'est la quatrième icône qui tombait — avec le mot.

          🔴 ON SÉPARE DONC CE QUI N'EST PAS DE MÊME NATURE : les PICTOS d'un côté, répartis sur la largeur et
          jamais repliés ; le MOT en dessous, seul et centré. C'est la demande d'Arno, et c'est aussi ce qui
          rend les cartes d'une même grille identiques — une rangée qui se replie dépend de son contenu, deux
          rangées non. */}
      <div className="pdc-icones">
        {refusApercu === null ? (
          <button type="button" className="pdc-action" onClick={() => gestes.onVoir(p.pieceId)}
            title="Visualiser" aria-label={`Visualiser ${p.nomFichier}`}>
            <span aria-hidden="true">👁</span>
          </button>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note" title={refusApercu}
            aria-label={refusApercu}><span aria-hidden="true">👁</span></span>
        )}
        {p.disponible ? (
          <a className="pdc-action" href={`${lien}?telecharger=1`} title="Télécharger"
            aria-label={`Télécharger ${p.nomFichier}`}><span aria-hidden="true">⤓</span></a>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note"
            title="Pièce non conservée : rien à télécharger."><span aria-hidden="true">⤓</span></span>
        )}
        {p.disponible ? (
          <button type="button" className="pdc-action" onClick={() => gestes.onRanger(p)}
            title="Ranger dans le Drive" aria-label={`Ranger ${p.nomFichier} dans le Drive`}>
            <span aria-hidden="true">▲</span>
          </button>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note"
            title="Pièce non conservée : rien à ranger."><span aria-hidden="true">▲</span></span>
        )}
        {/* ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — « À DROITE DES PICTOS EXISTANTS » (Arno) ═══════════
            Il vient après ▲ et avant « Aller au message », qui n'est pas un picto mais un mot : la rangée garde
            donc ses trois pictos dans le même ordre, et le quatrième s'ajoute à leur droite. Il n'y paraît QUE
            si cette pièce est déjà dans le Drive. */}
        <PictoDansLeDrive
          emplacements={emplacements} nomPiece={p.nomFichier} classe="pdc-action"
          onOuvrir={(e) => gestes.onVoirDansLeDrive(e, {
            pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime,
          })} />
      </div>
      {/* 🔴 « ALLER AU MESSAGE » : la fenêtre se ferme et le message se déplie dans le fil (demande d'Arno). Une
          pièce ne se comprend souvent qu'avec le courrier qui l'accompagne.

          🔴🔴 LOT PJ-MINIATURE-ICONES — SEUL SUR SA LIGNE, ET CENTRÉ (Arno). Il n'est pas un picto mais un MOT :
          le laisser dans la rangée des icônes, c'était lui faire disputer sa place à la quatrième. Rien n'est
          retiré ni déplacé ailleurs — il descend d'une ligne, dans la même carte. */}
      <div className="pdc-aller">
        <button type="button" className="pdc-action pdc-action--mot"
          onClick={() => gestes.onAllerAuMessage(p.messageId)}
          title="Aller au message" aria-label={`Aller au message du ${dateHeureComplete(p.recuLe)}`}>
          Aller au message
        </button>
      </div>
    </li>
  );
}

/**
 * Le style du récapitulatif. Uniquement des jetons `--color-svv-*` : aucune couleur en dur, et la grille se replie en
 * colonne étroite sur un iPhone en portrait (390 px).
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS LES COMMENTAIRES CI-DESSOUS : ils vivent dans un littéral gabarit, qu'un accent grave
 * terminerait au milieu du CSS (piège déjà payé une vingtaine de fois dans ce module).
 */
export const CSS_PIECES_CONVERSATION = `
${CSS_DESTINATAIRES_PIECE}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LE PETIT LIEN D'UN NOM DE PIECE CITE ════════════════════════════════
   DEMANDE D'ARNO : « un petit lien DISCRET (trombone + nom) ».

   🔴 DISCRET VEUT DIRE « DANS LE FIL DU TEXTE », pas invisible : meme taille, meme ligne, souligne en pointille
   pour qu'on devine qu'il se clique. Un bouton colore aurait fait trois taches dans un corps de mail.

   ⚠️ CIBLE TACTILE : le trace reste dans le texte, mais un ::after deborde la cible — viser un nom de fichier
   au doigt sur une ligne de corps est impossible sans cela.

   ⚠️ DESACTIVE QUAND AUCUNE VISIONNEUSE N'EST OFFERTE (les trois autres ecrans qui montent cette ligne) : il
   garde son habillage de texte et perd son soulignement, plutot que de promettre une porte qui n'ouvre rien. */
.vdb-piece-citee{display:inline;padding:0;margin:0;border:0;background:none;font:inherit;
  color:var(--color-svv-lien-source);cursor:pointer;position:relative;
  text-decoration:underline dotted;text-underline-offset:2px}
.vdb-piece-citee > span{margin-right:.2rem;font-size:.8em}
.vdb-piece-citee::after{content:"";position:absolute;inset:-8px -2px}
.vdb-piece-citee:hover{text-decoration:underline solid}
.vdb-piece-citee:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.vdb-piece-citee:disabled{color:inherit;cursor:default;text-decoration:none}
/* ⚠️ CETTE REGLE VIT ICI, ET NON DANS LA FEUILLE DE « Historique du bien » : les noms cites paraissent dans DEUX
   fenetres — le corps d'un message de la CONVERSATION (ou vit la partie citee) et le mail deplie de l'historique.
   Les deux embarquent cette feuille ; l'ecrire deux fois aurait donne deux liens qui divergent au premier
   correctif. */
${CSS_PICTO_DANS_LE_DRIVE}
/* ── LE TROMBONE ── Discret, mais c'est un BOUTON : il en a la cible (44 px de haut) et le focus visible. */
.pdc-trombone{display:inline-flex;align-items:center;gap:.3rem;min-height:44px;padding:0 .5rem;border-radius:.5rem;
  font:inherit;font-size:.82rem;color:var(--color-svv-ink);background:transparent;
  border:1px solid var(--color-svv-line);cursor:pointer}
.pdc-trombone:hover{background:var(--color-svv-field)}
.pdc-trombone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ── LA FENETRE ── z-index 68 : SOUS le selecteur Drive (70) et SOUS la visionneuse (80), qui s'ouvrent par-dessus. */
.pdc-voile{position:fixed;inset:0;z-index:68;display:flex;align-items:center;justify-content:center;padding:2vh 2vw;
  background:color-mix(in srgb, var(--color-svv-ink) 62%, transparent)}
.pdc{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;width:min(1100px,100%);height:min(90vh,100%);
  padding:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 12px 48px color-mix(in srgb, var(--color-svv-ink) 34%, transparent)}
/* ⚠️ minmax(0,1fr) ET NON 1fr : une rangee 1fr a min-height:auto et ne borne RIEN — le corps depasserait la
   fenetre, qui deviendrait defilable par programme et emporterait la barre de titre hors de vue (defaut du
   30/09/2026 sur les fenetres de redaction, meme cause). */
.pdc-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.pdc-titre{flex:1 1 14rem;min-width:0;margin:0;font-size:.95rem;font-weight:700;color:var(--color-svv-ink)}
.pdc-compte{font-weight:400;color:var(--color-svv-ink-soft)}
.pdc-ordre{font-size:.8rem}
.pdc-croix{min-width:44px;min-height:44px;font-size:1.3rem;line-height:1;color:var(--color-svv-ink);
  background:transparent;border:1px solid transparent;border-radius:.45rem;cursor:pointer}
.pdc-croix:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pdc-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pdc-corps{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:14px}
.pdc-groupe{min-width:0}
.pdc-groupe-titre{margin:0 0 .4rem;font-size:.8rem;font-weight:600;color:var(--color-svv-ink);
  padding-bottom:.25rem;border-bottom:1px solid var(--color-svv-line)}
.pdc-groupe-qui{font-weight:400;color:var(--color-svv-ink-soft)}
.pdc-groupe-objet{font-weight:400;color:var(--color-svv-ink-soft)}

/* auto-fill + minmax : quatre cartes sur un ecran large, UNE seule a 390 px, sans media query. */
.pdc-grille{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.pdc-carte{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);overflow:hidden;min-width:0}

/* La vignette : hauteur RESERVEE et fond gris — c'est le cadre gris qu'Arno demande en attendant l'image. */
.pdc-apercu{display:flex;align-items:center;justify-content:center;width:100%;height:${VIGNETTE_H}px;padding:0;
  background:var(--color-svv-field);border:0;border-bottom:1px solid var(--color-svv-line);cursor:pointer;
  overflow:hidden}
.pdc-apercu:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.pdc-apercu--muet{cursor:default;opacity:.7}
/* cover + object-position:top garde le HAUT du document (en-tete, objet) : ce qui permet de le reconnaitre. */
.pdc-vignette{width:100%;height:${VIGNETTE_H}px;object-fit:cover;object-position:top;display:block}
.pdc-type{font-size:.95rem;font-weight:600;letter-spacing:.06em;color:var(--color-svv-ink-soft)}

.pdc-pied-carte{display:flex;flex-direction:column;gap:2px;padding:.4rem .5rem 0;min-width:0}
.pdc-nom{font-size:.8rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-meta{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-drive{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-aussi{display:block;text-align:left;padding:0;border:0;background:none;font:inherit;font-size:.72rem;
  color:var(--color-svv-muted);text-decoration:underline;text-underline-offset:2px;cursor:pointer;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.pdc-aussi:hover,.pdc-aussi:focus-visible{color:var(--color-svv-ink)}
.pdc-presomption{font-style:italic}
.pdc-lien{color:var(--color-svv-ink);text-decoration:underline}
.pdc-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ══ 🔴🔴 LOT PJ-MINIATURE-ICONES — LES PICTOS SUR UNE LIGNE, LE MOT SOUS EUX ═════════════════════════════════
   ARNO (07/10/2026) : « Les 4 icones restent TOUJOURS sur une seule ligne, quelle que soit la largeur de la
   miniature : reparties sur la largeur, sans retour a la ligne. Si la place manque, reduis l'espacement (et la
   taille des icones en dernier recours, sans descendre sous une zone cliquable confortable), mais jamais de
   passage a la ligne. […] "Aller au message" est seul sur la ligne du dessous, centre horizontalement. »

   🔴 MESURE QUI A DICTE CES VALEURS. Une carte fait au minimum 190 px (la grille est en minmax(190px,1fr)) ;
   moins les marges internes de la rangee il reste environ 179 px. Quatre cibles de 44 px et leurs trois
   gouttieres en demandaient 182 : il manquait TROIS pixels, et la quatrieme icone tombait a la ligne.

   🔴 LA REPARTITION SE FAIT PAR flex:1 1 0 ET MIN-WIDTH NUL, et c'est ce qui tient la promesse « jamais de
   passage a la ligne » : chaque picto prend le quart de la place, quelle qu'elle soit. A 190 px cela fait 43 px
   de large — l'espacement a ete reduit a 2 px AVANT d'en arriver la, comme Arno le demande — et la HAUTEUR reste
   44 px : la zone cliquable mesure donc 43 x 44 px, et aucune taille de dessin n'a eu a diminuer.

   ⚠️ nowrap EST EXPLICITE, et ce n'est pas une precaution inutile : c'est la seule declaration qui rende le
   defaut impossible a reproduire. Les largeurs peuvent changer ; le repli, lui, est interdit.
   ⚠️ TROIS ICONES AU LIEU DE QUATRE (piece absente du Drive) SE REPARTISSENT PAREIL : chacune prend le tiers.
   La mise en page d'une carte ne depend donc pas de son contenu, ce qu'Arno demande au point 3.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.pdc-icones{display:flex;flex-wrap:nowrap;align-items:center;gap:2px;padding:.2rem .35rem 0;margin-top:auto}
/* ⚠️ TOUS LES ENFANTS DIRECTS, ET NON LES SEULS .pdc-action : le picto « deja dans le Drive » arrive ENVELOPPE
   (PictoDansLeDrive rend un .pdd autour de son bouton, pour y ancrer son menu). Vise sur la seule classe du
   bouton, la regle sautait la quatrieme case — mesure a l'ecran : 48/48/48/44 au lieu de quatre parts egales. */
/* ⚠️ L'ENVELOPPE DU PICTO DRIVE RESTE ENVIRON DEUX PIXELS EN DECA DES TROIS AUTRES (mesure a 190 px :
   43/43/43/41), et c'est dit plutot que tu : elle porte un menu ancre, et sa boite se calcule autrement. Deux
   pixels sur quarante-trois ne se voient pas, et aucune des quatre promesses d'Arno n'en depend — une seule
   ligne, aucun repli, reparties sur la largeur, cible confortable. Passer display:flex sur les enfants a ete
   essaye : cela n'y change rien, et la regle a donc ete retiree plutot que gardee « au cas ou ». */
.pdc-icones > *{flex:1 1 0;min-width:0}
/* 🔴 LE PLANCHER DE 44 px EST LEVE **DANS CETTE RANGEE**, et la specificite est le point : « .pdc-action » et
   « .pdc-icones > * » pesent pareil, et c'est donc l'ORDRE de declaration qui tranchait — le plancher gagnait,
   les trois premiers pictos restaient a 44 px et le quatrieme absorbait tout le reste. Mesure a la largeur
   MINIMALE d'une carte (190 px) : 44/44/44/39 avant, quatre parts egales apres.
   ⚠️ LA HAUTEUR, ELLE, NE BOUGE PAS : min-height:44px tient toujours, et la zone cliquable reste confortable. */
.pdc-icones .pdc-action{width:100%;min-width:0}
/* 🔴 LE MOT, SEUL SUR SA LIGNE ET CENTRE (Arno). Il ne s'etire pas : c'est un mot, et un bouton large comme la
   carte se lirait comme l'action principale de la carte, ce qu'il n'est pas. */
.pdc-aller{display:flex;justify-content:center;padding:0 .35rem .35rem}
.pdc-action{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  font:inherit;font-size:1.05rem;line-height:1;color:var(--color-svv-ink);background:transparent;
  border:1px solid transparent;border-radius:.45rem;text-decoration:none;cursor:pointer}
.pdc-action:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pdc-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Une action indisponible n'est PAS un bouton : elle ne se clique pas, et son titre dit pourquoi. */
.pdc-action--muette{opacity:.55;cursor:default}
/* « Aller au message » est un MOT, pas une icone : aucun pictogramme ne dit cela sans ambiguite. */
.pdc-action--mot{font-size:.74rem;padding:0 .5rem;min-width:0}

.pdc-pied{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.pdc-note{flex:1 1 16rem;min-width:0;margin:0}

@media (prefers-reduced-motion:reduce){
  .pdc-trombone,.pdc-action,.pdc-apercu{transition:none}
}
`;
