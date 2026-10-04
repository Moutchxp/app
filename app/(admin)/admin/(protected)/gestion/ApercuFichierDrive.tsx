'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  messageSansApercu, motCompteur, positionDans, sorteApercu, voisinVers, voisinsVisualisables,
  type VoisinPossible,
} from '../../../../lib/gestion/apercuDrive';
// LOT APERCU-PAGE1 — le PDF se lit chez nous, page par page : le lecteur natif attendait le fichier entier.
import { LecteurPdf, CSS_LECTEUR_PDF } from './LecteurPdf';
/* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — le mot du format illisible, écrit une seule fois (module pur). */
import { MESSAGE_VIDEO_ILLISIBLE } from '../../../../lib/gestion/pieces';
// 🔴 LOT RENOMMER-AVANT-RANGER — toutes les règles du nom vivent dans ce module PUR, jamais ici.
import {
  eclaterNom, estRenommee, INFOBULLE_RENOMMER, mentionNomOrigine, nomDeDepot, verifierNom,
} from '../../../../lib/gestion/renommagePiece';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — « VISUALISER » : VOIR UN FICHIER DU DRIVE SANS LE JOINDRE.
 * LOT APERCU-RAPIDE — et le voir VITE, puis passer au suivant sans quitter l'aperçu.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE ÇA RÉPARE. Avant, pour savoir si « Devis 2.pdf » était le bon devis, il fallait le JOINDRE, envoyer, et
 * voir. Ou ouvrir le Drive dans un autre onglet, retrouver le dossier, revenir. On joignait donc au hasard, et l'on
 * s'en apercevait chez le destinataire.
 *
 * 🔴🔴 L'APERÇU NE FERME PAS LA NAVIGATION, ET C'EST LE POINT LE PLUS IMPORTANT DE CE COMPOSANT. Il est rendu À CÔTÉ
 * du sélecteur (frère, pas enfant), par-dessus lui : le sélecteur n'est pas démonté, donc rien de son état ne bouge —
 * le même dossier, la même recherche, le même compteur, les mêmes « ✓ ajouté ». Fermer l'aperçu ne « revient » pas au
 * dossier : on n'en était jamais parti.
 *
 * ⚠️ FRÈRE ET NON ENFANT, POUR UNE SECONDE RAISON. Le sélecteur ferme sur Échap et sur un clic hors de lui. Placé
 * DANS son voile, l'aperçu aurait fait remonter ses propres Échap et ses propres clics jusqu'à lui : une croix qui
 * ferme deux fenêtres au lieu d'une.
 *
 * ═══ 🔴🔴 LOT APERCU-RAPIDE — POURQUOI L'ATTENTE A DISPARU ═══════════════════════════════════════════════════════
 * Mesuré le 29/09/2026 : l'ouverture coûtait 3 à 11 secondes, dont 2 s de verdict (la chaîne des parents, en série)
 * et jusqu'à 9 s d'attente du fichier ENTIER en mémoire de la page. Deux changements, et aucun ne touche la règle :
 *
 *   ① TROIS TEMPS AU LIEU D'UN. `info` (court) dit le verdict et le nom ; la VIGNETTE de la 1re page s'affiche en
 *      grand ; le document la remplace quand il arrive. On voit quelque chose de juste presque tout de suite.
 *   ② LE CADRE POINTE SUR LA ROUTE, plus sur un `blob:`. Un `blob:` exige le fichier COMPLET avant d'afficher le
 *      premier pixel ; une adresse laisse le lecteur PDF afficher les premières pages pendant que le reste arrive.
 *      C'est le refus qui imposait le `blob:` — il est désormais lu par `info`, en français, avant d'ouvrir le cadre.
 *
 * 🔒 LECTURE SEULE, ET RIEN NE RESTE. Les octets viennent de notre route, jamais de Google directement (le jeton ne
 * quitte pas le serveur, et l'adresse signée de la vignette non plus). Aucune copie dans le Drive, aucun fichier sur
 * le disque. Sous « Documents clients scannés », la route refuse — et l'aperçu affiche son motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface FichierAVoir {
  id: string;
  nom: string;
  typeMime: string;
  lien: string | null;
  /** Le dossier qui le contient. Il BORNE « Précédent / Suivant » — voir `voisinsVisualisables`. */
  parentId?: string | null;
  /**
   * ══ 🔴 LOT DRIVE-RETOUCHES-1 — D'OÙ VIENNENT LES OCTETS ════════════════════════════════════════════════════
   *
   * `drive` (défaut) : un fichier du Drive, servi par la route d'aperçu, avec son verdict d'archive.
   * `piece`          : une PIÈCE REÇUE qu'on est en train de ranger, servie par la route des pièces.
   *
   * 🔴 ET C'EST LA ROUTE DES PIÈCES QUI SAIT DÉJÀ LIRE UNE PIÈCE VIDÉE. Depuis le lot du vidage, elle bascule
   * toute seule sur la copie Drive quand les octets locaux ont été libérés (`stockageVide`), à la même adresse et
   * sous le même nom. L'aperçu d'une pièce vidée marche donc sans qu'une ligne de plus soit écrite ici — et sans
   * qu'une seconde définition de « où sont les octets de cette pièce » vienne contredire la première.
   */
  source?: 'drive' | 'piece';
}

/**
 * L'adresse des réponses de la route. Écrite une fois : des recopies dériveraient. PUR.
 *
 * ⚠️ UNE PIÈCE REÇUE N'A NI `info` NI `vignette` : son type et son nom sont DÉJÀ connus de l'écran qui l'affiche
 * (le panneau « À ranger » les a reçus avec la pièce), et `sorteApercu` est une fonction pure. Un aller-retour
 * pour redemander ce qu'on tient dans la main ne servirait qu'à retarder l'ouverture.
 */
export function adresseApercu(
  id: string, quoi: 'info' | 'vignette' | 'octets', source: 'drive' | 'piece' = 'drive',
): string {
  if (source === 'piece') return `/api/admin/gestion/pieces/${encodeURIComponent(id)}`;
  const base = `/api/admin/gestion/drive/apercu?fichier=${encodeURIComponent(id)}`;
  return quoi === 'octets' ? base : `${base}&${quoi}=1`;
}

/** Ce que `info` répond, réduit à ce que l'écran en fait. */
interface Info {
  etat?: string;
  nom?: string;
  sorte?: 'pdf' | 'image' | 'texte' | 'video' | 'export_pdf' | 'aucun';
  vignette?: boolean;
  message?: string;
}

type Etat =
  | { e: 'charge'; vignette: boolean }
  | { e: 'pret'; sorte: 'pdf' | 'image' | 'texte' | 'video'; vignette: boolean }
  /**
   * `regle` distingue LES DEUX RAISONS de ne rien montrer, et ce n'est pas une nuance d'affichage :
   *   · un format dont on ne sait pas faire d'aperçu — on peut tout de même le JOINDRE ;
   *   · « Documents clients scannés » — on ne peut RIEN en faire, et proposer « Joindre ce fichier » juste sous la
   *     phrase « son contenu n'est jamais lu » serait se contredire d'une ligne à l'autre.
   *
   * ⚠️ LE CAS ARRIVE VRAIMENT : dans des résultats de recherche, l'écran ne connaît pas l'emplacement des fichiers
   * (ils viennent de tout le Drive), donc il propose les trois liens et c'est le SERVEUR qui tranche au clic.
   * Mesuré à l'écran le 28/09/2026 sur « 5_trois dernières quittances de loyer.pdf ».
   */
  | { e: 'sans'; message: string; regle: boolean };

/** Les paliers de zoom de l'image. Le PDF, lui, a le zoom du navigateur, qui est meilleur que tout ce qu'on écrirait. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

/**
 * 🔴 LA TAILLE AU-DELÀ DE LAQUELLE ON N'AMORCE PLUS LE VOISIN. Deux voisins de douze mégaoctets chasseraient de la
 * mémoire du serveur le document qu'on est précisément en train de lire — l'amorçage se retournerait contre lui.
 */
const AMORCE_TAILLE_MAX = 8 * 1024 * 1024;

/**
 * ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — « LE DÉBUT DU FICHIER SEULEMENT » (demande d'Arno) ═══════════════════════
 *
 * Ce qu'on demande d'un voisin, côté COURRIER : les 256 premiers kilo-octets, par un en-tête `Range`.
 *
 * 🔴 POURQUOI CE CHIFFRE ET PAS LE FICHIER ENTIER. Un préchargement doit coûter moins que ce qu'il fait gagner :
 * tirer douze mégaoctets pour un document que personne ne regarde encore disputerait la connexion à la page qu'on
 * est en train de lire — exactement ce qu'Arno interdit (« le temps d'ouverture de la page 1 ne doit pas se
 * dégrader »).
 *
 * ⚠️ CE QU'ON RÉCHAUFFE EST LE STOCKAGE, PAS LE NAVIGATEUR. La route lit l'objet ENTIER chez MinIO (ou dans le
 * Drive) avant d'en couper une tranche : une seule requête suffit donc à réchauffer tout le fichier côté serveur,
 * pendant que le réseau de la page ne porte que 256 ko. La réponse est `no-store` : rien n'est gardé ici.
 *
 * ══ 🔴🔴 LE TABLEAU DES TEMPS DE LA PAGE 1. MESURÉ À L'ÉCRAN LE 30/09/2026, PAS SUPPOSÉ ════════════════════════
 *
 * La promesse à tenir est celle d'Arno : « le temps d'ouverture de la page 1 ne doit pas se dégrader ». On ne peut
 * pas la vérifier en lisant le code — l'amorce est déclenchée par un drapeau d'état, et un drapeau levé trop tôt ne
 * se voit pas. On l'a donc mesurée SUR LA VRAIE FENÊTRE, ouverte depuis le récapitulatif des pièces d'une
 * conversation réelle (échange 3494, « Taxes Foncières 2026 », 12 pièces).
 *
 * Le repère de « page 1 peinte » est la toile du lecteur (`.lpd-toile`) une fois DIMENSIONNÉE — jamais son
 * insertion dans la page, qui la précède d'une seconde entière et aurait flatté toutes ces lignes.
 *
 *   | pièce ouverte                  | taille | page 1 peinte | 1re requête | amorce du/des voisin(s) |
 *   |--------------------------------|--------|---------------|-------------|-------------------------|
 *   | RD TF Pré-St Gervais 2026.pdf  |  77 ko |      1 530 ms |     + 35 ms | + 1 532 ms  (1 voisin)  |
 *   | RD TF Pergolèse 2026.pdf       |  76 ko |      1 659 ms |     + 29 ms | + 1 660 ms  (2 voisins) |
 *   | RD TF Pré-St Gervais 2026.pdf  |  77 ko |      2 312 ms |     + 21 ms | + 2 332 ms  (2 voisins) |
 *   | RD TF Pyrénées 2026.pdf        |  76 ko |      1 416 ms |     + 34 ms | + 1 417 ms  (2 voisins) |
 *   | SNC RD TF Issy 2026.pdf        |  77 ko |      1 578 ms |     + 23 ms | + 1 597 ms  (2 voisins) |
 *   | SCI Kleber TF Issy 2026.pdf    |  77 ko |      1 585 ms |     + 28 ms | + 1 608 ms  (2 voisins) |
 *
 * 🔴 CE QUE LE TABLEAU PROUVE, ET C'EST LE SEUL POINT QUI COMPTE : sur les six ouvertures, AUCUNE amorce ne part
 * avant que la page 1 ne soit peinte. L'écart est de 0 à 23 ms APRÈS, jamais avant. Le document qu'on est venu voir
 * ne partage donc sa connexion avec personne, et la promesse est tenue par construction, pas par chance.
 *
 * ⚠️ LA PAGE 1 EST DEMANDÉE DEUX FOIS (mesuré : + 35 ms puis + 77 ms sur la 1re ligne), et ce n'est PAS l'amorce :
 * c'est PDF.js qui redemande le fichier, déjà constaté et écrit dans la route des pièces. Rien n'a été ajouté ici.
 *
 * ⚠️ UNE MESURE DE CE TABLEAU EXIGE UN ONGLET AU PREMIER PLAN. Sur un onglet d'arrière-plan, le rendu PDF ne part
 * pas du tout (toile figée à 300 × 150, plus de 25 s d'attente), le drapeau n'est jamais levé, et AUCUNE amorce ne
 * part — ce qui se lit à tort comme « le préchargement ne marche pas ». Une demi-heure y a été perdue le 30/09/2026 :
 * c'est écrit ici pour que la suivante ne le soit pas.
 *
 * ══ 🔴 ET LA TRANCHE, ELLE, TRONQUE VRAIMENT — MESURÉ SUR 5,98 Mo ══════════════════════════════════════════════
 *
 * Pièce 8508, `RRU425578-…_rapport.pdf`, 5 984 555 octets, JAMAIS lue avant la mesure, la tranche demandée EN
 * PREMIER (l'ordre inverse aurait fait profiter la tranche de la mémoire laissée par la lecture complète) :
 *
 *   | demande                     | réponse | octets reçus | durée     |
 *   |-----------------------------|---------|--------------|-----------|
 *   | `Range: bytes=0-262143`     | **206** |      262 144 | 15 466 ms |
 *   | aucune (fichier entier)     |     200 |    5 984 555 | 10 631 ms |
 *
 * 🔴 LA TRANCHE NE COÛTE PAS MOINS CHER AU SERVEUR, et ces deux lignes le montrent : elle est même la plus LENTE
 * des deux, parce qu'elle est passée la première et a payé la lecture complète chez MinIO à froid. C'est
 * exactement ce que la route annonce, et la raison pour laquelle elle n'émet PAS d'en-tête `Accept-Ranges`
 * (vérifié à la mesure : absent). Ce qu'une tranche épargne est le TRANSPORT — 262 ko au lieu de 5,98 Mo sur la
 * connexion de la page —, jamais la lecture.
 */
const AMORCE_DEBUT_OCTETS = 256 * 1024;

/** Les mots d'avant le lot PIECES-DE-LA-CONVERSATION, conservés à la lettre comme valeur par défaut. */
const MOT_JOINDRE_DEFAUT = { action: 'Joindre ce fichier', deja: '✓ ajouté' } as const;

export function ApercuFichierDrive({
  fichier, voisinage = [], joindreAutorise, estDeja, onJoindre, onFermer,
  renommage, motJoindre = MOT_JOINDRE_DEFAUT, etiquetteNav = 'Documents du dossier',
}: {
  fichier: FichierAVoir;
  /**
   * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE BANDEAU DE NOM, AU-DESSUS DU VISUEL ═══════════════════════════════
   *
   * Demande d'Arno : « clic sur le stylo : ouvre l'aperçu habituel avec, AU-DESSUS du visuel, un champ
   * pré-rempli […] clic sur l'œil : même fenêtre SANS le champ, à sa place le nom du fichier et un petit stylo ».
   *
   * 🔴 ABSENT ⇒ L'APERÇU D'AVANT CE LOT, MOT POUR MOT. C'est ce qui permet à la fenêtre de rester LA MÊME
   * partout : le Drive de l'éditeur de mail n'a rien à renommer (on y regarde des fichiers qui existent déjà),
   * et il ne passe simplement pas cette prop.
   *
   * ⚠️ L'APERÇU NE DÉCIDE RIEN : il montre un nom et rend celui qu'on lui donne. C'est la fenêtre « Ranger » qui
   * tient les noms choisis, parce que c'est elle qui les fera partir — et qui les garde tant qu'elle est ouverte.
   */
  /**
   * ⚠️ C'EST UNE FONCTION DE L'IDENTIFIANT AFFICHÉ, ET NON UN OBJET FIGÉ — défaut trouvé à l'écran le
   * 30/09/2026. « Précédent / Suivant » change la pièce DANS l'aperçu, sans que le parent en sache rien : un
   * objet calculé sur la pièce CLIQUÉE laissait le bandeau sur la première, puis le faisait disparaître. Arno
   * demandait l'inverse : « le champ suit la pièce affichée ».
   */
  renommage?: (idAffiche: string) => {
    /** Le nom d'ORIGINE de la pièce affichée. C'est le repère : « reçue sous : … ». */
    nomOrigine: string;
    /** Le nom choisi, s'il y en a un. `null` = pas encore renommée. */
    nomChoisi: string | null;
    /** Ouvre-t-on directement sur le champ ? Vrai par le stylo, faux par l'œil (demande d'Arno). */
    editerDabord: boolean;
    /** `null` = renommage possible ; sinon le motif du refus, qui grise le geste et se lit en infobulle. */
    refus: string | null;
    onRenommer: (nom: string) => void;
  } | undefined;
  /**
   * 🔴 LA LISTE AFFICHÉE AU MOMENT DU CLIC. Le périmètre du parcours en est TIRÉ, jamais donné : c'est le module
   * pur `voisinsVisualisables` qui écarte les dossiers, les types sans aperçu, et tout ce qui n'a pas le MÊME
   * dossier parent que le document ouvert. Passer un périmètre déjà filtré aurait mis cette règle dans l'écran.
   */
  voisinage?: readonly VoisinPossible[];
  /** Faux sous « Documents clients scannés » : le bouton « Joindre » de l'aperçu n'y est pas non plus. */
  joindreAutorise: boolean;
  /**
   * ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — LE MOT DU BOUTON PRINCIPAL, SELON LE CONTEXTE ═══════════════════════
   *
   * Arno : « Même composant de visionneuse partout, avec […] le “Joindre / Ranger” selon le contexte. »
   *
   * 🔴 LE GESTE EST LE MÊME (`onJoindre`), SEUL LE MOT CHANGE — et c'est délibéré. Dans l'éditeur de mail, on
   * JOINT un fichier du Drive au message ; dans le récapitulatif des pièces d'une conversation, on RANGE une
   * pièce reçue dans le Drive. Deux visionneuses auraient divergé au premier correctif ; deux libellés dans la
   * même visionneuse ne peuvent pas diverger.
   *
   * ⚠️ ABSENT ⇒ LES MOTS D'AVANT CE LOT, À LA LETTRE : « Joindre ce fichier » et « ✓ ajouté ».
   */
  motJoindre?: { action: string; deja: string };
  /**
   * Ce que « Précédent / Suivant » parcourt, DIT au lecteur d'écran. Côté Drive c'est le dossier ; côté courrier,
   * toute la conversation. Le libellé doit suivre, sinon il annonce un périmètre qui n'est pas celui du tour.
   */
  etiquetteNav?: string;
  /** Ce fichier-ci est-il déjà ajouté au message ? Suit le document AFFICHÉ, pas celui qu'on a ouvert en premier. */
  estDeja: (id: string) => boolean;
  onJoindre: (f: FichierAVoir) => void;
  onFermer: () => void;
}) {
  /** Le document AFFICHÉ. Il change avec « Précédent / Suivant » ; `fichier` est seulement celui d'où l'on part. */
  const [vu, setVu] = useState<FichierAVoir>(fichier);
  /**
   * 🔴 D'OÙ VIENNENT LES OCTETS, pour tout le tour. Elle est prise sur le document D'OUVERTURE et non sur celui
   * qu'on regarde : un tour ne mélange jamais des pièces reçues et des fichiers du Drive — `voisinsVisualisables`
   * ne retient que ce qui a le même parent, et les deux mondes n'en partagent aucun.
   */
  const source = fichier.source ?? 'drive';
  const [etat, setEtat] = useState<Etat>({ e: 'charge', vignette: false });
  const [zoom, setZoom] = useState(1);
  /**
   * 🔴 LOT APERCU-PAGE1 — LA PAGE 1 EST-ELLE PEINTE ?
   *
   * C'est ce drapeau, et LUI SEUL, qui retire la vignette Drive. Le défaut du lot précédent était là : le cadre du
   * PDF recouvrait la vignette dès qu'il était POSÉ, c'est-à-dire alors qu'il était encore vide — on remplaçait
   * une image juste par un rectangle noir, pendant deux à cinq secondes.
   */
  const [page1Peinte, setPage1Peinte] = useState(false);
  /**
   * 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LE NAVIGATEUR A-T-IL REFUSÉ DE LIRE CETTE VIDÉO ?
   *
   * ⚠️ SEUL LE NAVIGATEUR PEUT RÉPONDRE, et seulement après avoir essayé : le type MIME ne dit RIEN du codec.
   * Un `.mov` H.264 se lit partout, le même `.mov` en HEVC (l'enregistrement par défaut d'un iPhone récent) est
   * refusé par Chrome et accepté par Safari. On ne devine donc pas : on tente, et `onError` nous le dit.
   */
  const [illisible, setIllisible] = useState(false);
  /**
   * ⚠️ LE RAPPEL DOIT GARDER LA MÊME IDENTITÉ D'UN RENDU À L'AUTRE. Écrit sur place (`() => setPage1Peinte(true)`),
   * il changeait d'identité à chaque rendu de cet écran, et le lecteur PDF repartait de zéro à chaque fois — la
   * page 1 n'arrivait jamais au bout de son rendu (mesuré le 29/09/2026 : plus de trente secondes, toile blanche).
   * Le lecteur s'en protège aussi de son côté, mais la faute était ICI : on la corrige ici aussi.
   */
  const direPage1Peinte = useCallback(() => setPage1Peinte(true), []);
  const croix = useRef<HTMLButtonElement | null>(null);

  // Rouvrir l'aperçu sur un autre fichier depuis la liste doit repartir de celui-là.
  useEffect(() => { setVu(fichier); }, [fichier]);

  const voisins = useMemo(
    () => voisinsVisualisables(voisinage, { id: vu.id, typeMime: vu.typeMime, parentId: vu.parentId ?? null }),
    [voisinage, vu.id, vu.typeMime, vu.parentId]);
  const position = positionDans(voisins, vu.id);
  const idPrecedent = voisinVers(voisins, vu.id, -1);
  const idSuivant = voisinVers(voisins, vu.id, 1);

  const allerVers = useCallback((id: string | null) => {
    if (id === null) return;
    const v = voisinage.find((x) => x.id === id);
    if (v === undefined) return;
    setZoom(1);
    setPage1Peinte(false);
    setVu({ id: v.id, nom: v.nom, typeMime: v.typeMime, lien: null, parentId: v.parentId });
  }, [voisinage]);

  /**
   * ══ CE QU'ON PEUT MONTRER DE CE DOCUMENT ═════════════════════════════════════════════════════════════════════
   *
   * 🔴 `info` D'ABORD, ET LUI SEUL EST ATTENDU. Il est court (le verdict et les métadonnées, tous deux mémorisés
   * 60 s côté serveur) et il porte le refus EN FRANÇAIS. Une fois qu'il a dit oui, le cadre et la vignette partent
   * en parallèle : plus rien n'est attendu ici.
   *
   * ⚠️ UN FORMAT HORS LISTE BLANCHE EST TRANCHÉ SANS APPELER LE SERVEUR : on connaît déjà la réponse, et demander
   * pour rien ajouterait un aller-retour à un « non » certain.
   */
  useEffect(() => {
    const sorte = sorteApercu(vu.typeMime);
    /* 🔴 LE VERDICT DU NAVIGATEUR REPART À ZÉRO À CHAQUE DOCUMENT : un `.mov` refusé ne doit pas faire croire
       que le `.mp4` suivant l'est aussi. */
    setIllisible(false);
    if (sorte === 'aucun') {
      setEtat({ e: 'sans', message: messageSansApercu(vu.typeMime), regle: false });
      return undefined;
    }
    let annule = false;
    setPage1Peinte(false);
    setEtat({ e: 'charge', vignette: false });

    /* ══ 🔴 UNE PIÈCE REÇUE N'A RIEN À DEMANDER ═════════════════════════════════════════════════════════════
       Son nom et son type sont DÉJÀ connus de l'écran qui l'affiche (le panneau « À ranger » les a reçus avec
       elle), et le format hors liste blanche vient d'être tranché juste au-dessus, par la MÊME fonction pure. Un
       aller-retour pour redemander ce qu'on tient dans la main ne ferait que retarder l'ouverture.
       ⚠️ AUCUNE VIGNETTE : la route des pièces sert les octets, pas une image de première page. Le lecteur PDF
       affiche sa propre page 1, comme pour un fichier du Drive dont Google n'aurait pas de vignette. */
    if (source === 'piece') {
      setEtat({
        e: 'pret',
        sorte: sorte === 'image' ? 'image' : sorte === 'texte' ? 'texte' : sorte === 'video' ? 'video' : 'pdf',
        vignette: false,
      });
      return undefined;
    }

    void (async () => {
      try {
        const res = await fetch(adresseApercu(vu.id, 'info'), { cache: 'no-store' });
        const d = (await res.json().catch(() => ({}))) as Info;
        if (annule) return;
        if (!res.ok || d.etat === 'refus') {
          // 403 = LA RÈGLE (« Documents clients scannés »), et non un format sans aperçu : rien n'est proposé après.
          setEtat({ e: 'sans', message: d.message ?? 'Aperçu impossible pour ce fichier.', regle: res.status === 403 });
          return;
        }
        if (d.etat === 'sans_apercu') {
          setEtat({ e: 'sans', message: d.message ?? messageSansApercu(vu.typeMime), regle: false });
          return;
        }
        if (d.etat !== 'ok') {
          setEtat({ e: 'sans', message: d.message ?? 'Aperçu impossible pour ce fichier.', regle: false });
          return;
        }
        setEtat({
          e: 'pret',
          sorte: d.sorte === 'image' ? 'image' : d.sorte === 'texte' ? 'texte'
            : d.sorte === 'video' ? 'video' : 'pdf',
          vignette: d.vignette === true,
        });
      } catch {
        if (!annule) {
          setEtat({ e: 'sans', message: 'Le Drive n’a pas répondu : aperçu impossible pour le moment.', regle: false });
        }
      }
    })();
    return () => { annule = true; };
  }, [vu.id, vu.typeMime, source]);

  /**
   * ══ 🔴 LE PRÉCHARGEMENT DU VOISIN ════════════════════════════════════════════════════════════════════════════
   *
   * On demande `info` du précédent et du suivant dès que le document courant est prêt. C'est COURT, et ça réchauffe
   * ce qui coûte vraiment : côté serveur, le verdict et les métadonnées sont alors mémorisés, et le pas suivant
   * n'attend plus que les octets.
   *
   * ⚠️ DEUX VOISINS, PAS DAVANTAGE. Précharger tout un dossier ferait quarante appels pour un aperçu qu'on ferme
   * au deuxième — et le lot borne explicitement les préchargements simultanés.
   *
   * 🔒 ET JAMAIS HORS DU PÉRIMÈTRE : les voisins sortent de `voisinsVisualisables`, qui n'en laisse aucun sortir du
   * dossier. Aucun préchargement ne peut donc atteindre « Documents clients scannés » depuis un autre dossier.
   */
  useEffect(() => {
    /**
     * 🔴 ON N'AMORCE QU'APRÈS LA PAGE 1 : le document qu'on est venu voir passe en premier, toujours. Amorcer
     * pendant son chargement lui disputerait la connexion, pour une page que personne ne regarde encore.
     */
    if (etat.e !== 'pret' || !page1Peinte) return undefined;
    let annule = false;
    for (const id of [idSuivant, idPrecedent]) {
      if (id === null) continue;
      void (async () => {
        try {
          /**
           * ══ 🔴 CÔTÉ COURRIER : LE DÉBUT DU FICHIER, ET RIEN D'AUTRE ═══════════════════════════════════════
           *
           * Une pièce reçue n'a pas de route `info` — son nom et son type sont déjà connus de l'écran. Il n'y a
           * donc rien à « réchauffer » d'autre que les octets, et on n'en demande que le début (voir
           * `AMORCE_DEBUT_OCTETS`). C'est ce que le lot PIECES-DE-LA-CONVERSATION a ajouté : avant lui, aucun
           * préchargement n'était possible ici, faute d'en-tête `Range` sur la route des pièces.
           */
          if (source === 'piece') {
            const r = await fetch(adresseApercu(id, 'octets', 'piece'), {
              cache: 'no-store', headers: { Range: `bytes=0-${AMORCE_DEBUT_OCTETS - 1}` },
            });
            await r.arrayBuffer();
            return;
          }
          const res = await fetch(adresseApercu(id, 'info'), { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string; sorte?: string; tailleOctets?: number | null };
          if (annule || d.etat !== 'ok') return;
          /**
           * ══ 🔴🔴 ON TIRE AUSSI LES OCTETS DU VOISIN, ET C'EST CE QUI REND « SUIVANT » INSTANTANÉ ═══════════
           *
           * Mesuré le 29/09/2026 : passer à un document JAMAIS VU coûtait 1,9 à 2,9 s ; revenir sur un document
           * déjà vu, 407 ms. Toute la différence est le trajet des octets depuis Google. On le fait donc AVANT
           * qu'on appuie, pendant qu'on lit la page 1 — le serveur garde le fichier une minute, et le pas suivant
           * ne paie plus que le tramage.
           *
           * ⚠️ ON LES JETTE AUSSITÔT LUS. Ce qu'on réchauffe est la mémoire du SERVEUR, pas celle de la page :
           * la route répond `no-store`, et garder trois documents dans le navigateur ne servirait à rien.
           *
           * ⚠️ PAS POUR UN DOCUMENT GOOGLE EXPORTÉ (`export_pdf`) : son PDF est CALCULÉ à chaque demande, jamais
           * mémorisé — l'amorcer ferait travailler Google pour rien. Ni au-delà de 8 Mo : deux voisins de douze
           * mégaoctets chasseraient de la mémoire le document qu'on est en train de lire.
           */
          if (d.sorte === 'export_pdf') return;
          if ((d.tailleOctets ?? 0) > AMORCE_TAILLE_MAX) return;
          const octets = await fetch(adresseApercu(id, 'octets'), { cache: 'no-store' });
          await octets.arrayBuffer();
        } catch { /* un amorçage raté n'est pas une panne : le pas suivant sera simplement moins rapide */ }
      })();
    }
    /**
     * ⚠️ ON N'INTERROMPT PAS L'AMORÇAGE EN COURS, et c'est voulu : l'interrompre ferait perdre au serveur les
     * octets à moitié lus, donc le bénéfice entier. Il se termine seul, `annule` empêchant seulement d'enchaîner.
     */
    return () => { annule = true; };
  }, [etat.e, page1Peinte, idSuivant, idPrecedent, source]);

  /**
   * ÉCHAP FERME, LES FLÈCHES NAVIGUENT — même quand le focus est DANS le cadre de l'aperçu.
   *
   * ⚠️ UN ÉCOUTEUR SUR LA FENÊTRE, pas seulement sur la boîte : le lecteur PDF du navigateur prend le focus, et un
   * `onKeyDown` de React ne verrait jamais la touche. `capture` pour passer avant tout le reste.
   *
   * ⚠️ LES FLÈCHES SONT IGNORÉES DANS UN CHAMP DE SAISIE — il n'y en a pas dans cet aperçu aujourd'hui, mais le
   * jour où il y en aura un, elles doivent déplacer le curseur et non changer de document.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const saisie = cible !== null
        && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable);
      /**
       * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — ÉCHAP DANS LE CHAMP DE NOM ANNULE LE RENOMMAGE ═════════════════════
       *
       * Arno : « Échap = annuler le renommage, pas fermer l'aperçu ».
       *
       * 🔴 LA DÉCISION SE PREND ICI, ET PAS DANS LE CHAMP. Le champ tente bien un `stopPropagation`, mais cet
       * écouteur-ci vit sur `document` : un gestionnaire React, délégué à la racine de l'application, ne peut
       * pas l'empêcher de s'exécuter. Vu au test, qui fermait la fenêtre au lieu d'annuler la saisie.
       *
       * ⚠️ L'EXCEPTION EST BORNÉE AU CHAMP DE NOM, par sa classe. Tout le reste — y compris un autre champ —
       * garde le comportement d'avant : Échap ferme l'aperçu, et c'est la sortie qu'on cherche d'instinct.
       */
      /* ⚠️ `classList` PEUT MANQUER : la cible d'une touche est parfois `document` lui-même, qui n'en a pas.
         Sans ce second `?.`, la touche Échap jetait — et l'aperçu ne se fermait plus du tout. Vu au test. */
      if (e.key === 'Escape' && cible?.classList?.contains('apd-champ-nom') === true) return;
      if (e.key === 'Escape') { e.stopPropagation(); onFermer(); return; }
      if (saisie) return;
      if (e.key === 'ArrowRight' && idSuivant !== null) { e.preventDefault(); allerVers(idSuivant); }
      if (e.key === 'ArrowLeft' && idPrecedent !== null) { e.preventDefault(); allerVers(idPrecedent); }
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [onFermer, allerVers, idSuivant, idPrecedent]);

  useEffect(() => { croix.current?.focus(); }, []);

  const iZoom = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);
  const deja = estDeja(vu.id);

  return (
    <div className="apd-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_APERCU}</style>
      <style>{CSS_LECTEUR_PDF}</style>
      <div className="apd" role="dialog" aria-modal="true" aria-label={`Aperçu de ${vu.nom}`}>
        <header className="apd-tete">
          <span className="apd-nom" title={vu.nom}>
            <span aria-hidden="true">👁</span> {vu.nom}
          </span>
          {/* Le ZOOM de l'en-tête n'existe que pour l'IMAGE : le PDF a le sien dans SA barre (page, zoom, largeur),
              et du texte se lit à sa taille. */}
          {etat.e === 'pret' && etat.sorte === 'image' && (
            <span className="apd-zoom">
              <button type="button" className="gst-lien-bouton" disabled={iZoom <= 0}
                onClick={() => setZoom(ZOOMS[Math.max(0, iZoom - 1)])} aria-label="Réduire">−</button>
              <span className="apd-zoom-mot">{Math.round(zoom * 100)} %</span>
              <button type="button" className="gst-lien-bouton" disabled={iZoom >= ZOOMS.length - 1}
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, iZoom + 1)])} aria-label="Agrandir">+</button>
            </span>
          )}
          <button ref={croix} type="button" className="apd-croix" onClick={onFermer}
            aria-label="Fermer l’aperçu">×</button>
        </header>

        {/* ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE BANDEAU DE NOM, AU-DESSUS DU VISUEL ═══════════════════════════
            Deux visages pour un seul bandeau : le NOM et un stylo (arrivée par l'œil), ou le CHAMP (arrivée par le
            stylo, ou clic sur le stylo du bandeau). Voir `BandeauNom`. */}
        {(() => {
          // ⚠️ SUR `vu.id`, la pièce AFFICHÉE — jamais celle qu'on a cliquée pour ouvrir la fenêtre.
          const r = renommage?.(vu.id);
          if (r === undefined) return null;
          return (
            /* 🔴 LOT RENOMMAGE-UN-SEUL-NOM — LE TYPE DU DOCUMENT VOYAGE AVEC LE NOM : c'est lui qui redonne
               l'extension quand le nom n'en porte pas à la fin (« … 0836_001.pdf [octets] »). Il vient du
               document AFFICHÉ, comme tout le reste du bandeau. */
            <BandeauNom key={vu.id} nomOrigine={r.nomOrigine} nomChoisi={r.nomChoisi} typeMime={vu.typeMime}
              editerDabord={r.editerDabord} refus={r.refus} onRenommer={r.onRenommer} />
          );
        })()}

        <div className={`apd-scene${etat.e === 'pret' && etat.sorte === 'image' ? ' apd-scene--image' : ''}`}>
          {/* 🔴 LA VIGNETTE DE LA 1re PAGE, EN GRAND, DÈS QU'ON SAIT QU'ELLE EXISTE. Elle est là avant le document,
              et le document la RECOUVRE quand il arrive — sans saut de mise en page, puisque les deux occupent la
              même case de la grille. */}
          {etat.e !== 'sans' && (
            <div className="apd-pile">
              {/* 🔴 LA VIGNETTE RESTE JUSQU'À CE QUE LA PAGE 1 SOIT PEINTE — jamais jusqu'à ce que le lecteur soit
                  POSÉ. C'est tout le défaut du lot précédent, corrigé : `page1Peinte` est levé par le lecteur
                  lui-même, quand il a vraiment quelque chose à montrer. */}
              {(etat.e === 'charge' || (etat.vignette && !page1Peinte)) && (
                <img className="apd-vignette" src={adresseApercu(vu.id, 'vignette', source)} alt=""
                  aria-hidden="true" />
              )}
              {(etat.e === 'charge' || (etat.e === 'pret' && etat.sorte === 'pdf' && !page1Peinte)) && (
                <p className="apd-attente" role="status">Lecture du fichier…</p>
              )}
              {/* ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — UNE IMAGE QUE LE NAVIGATEUR NE
                  SAIT PAS DÉCODER, ET CE N'EST PLUS UN CADRE VIDE ══════════════════════════════════════════════

                  DÉCISION D'ARNO (04/10/2026) : les HEIF/HEIC sont désormais gardés, avec « aperçu converti comme
                  pour les vidéos HEVC si possible, sinon téléchargement ».

                  🔴 « SI POSSIBLE » EST MESURÉ, PAS SUPPOSÉ. La miniature est bien convertie par `sharp` pour la
                  plupart (66 fabriquées au rattrapage du 04/10/2026), MAIS 11 photos iPhone sont refusées par
                  libheif : « Number of references in iref box (45) exceeds the security limits of 16 ». Et dans
                  la visionneuse, Chrome ne décode pas `image/heic` du tout.

                  🔴 LE « SINON » EST DONC INDISPENSABLE, et il est EXACTEMENT celui de la vidéo HEVC, juste en
                  dessous : la même phrase, la même note, le même bouton. Sans lui, l'œil ouvrait une image
                  cassée — un cadre vide se lit comme une panne de l'outil, alors que le fichier est intact. */}
              {etat.e === 'pret' && etat.sorte === 'image' && (
                illisible
                  ? (
                    <div className="apd-video-refus" role="status">
                      <p className="apd-sans">{MESSAGE_VIDEO_ILLISIBLE}</p>
                      <p className="apd-video-note">
                        Le fichier est intact : il s’ouvre sur votre ordinateur, ou dans un autre navigateur.
                      </p>
                      <a className="svv-btn svv-btn-primary gst-btn" download={vu.nom}
                        href={`${adresseApercu(vu.id, 'octets', source)}${source === 'piece' ? '?telecharger=1' : ''}`}>
                        Télécharger l’image
                      </a>
                    </div>
                  )
                  : (
                    <img className="apd-image" src={adresseApercu(vu.id, 'octets', source)} alt={vu.nom}
                      style={{ width: `${zoom * 100}%` }}
                      /* 🔴 LE MÊME MÉCANISME QUE LA VIDÉO : on TENTE, et `onError` nous dit que le navigateur
                         n'a pas su. On ne devine pas d'avance ce que Chrome ou Safari savent décoder. */
                      onError={() => setIllisible(true)} />
                  )
              )}
              {/*
                🔴🔴 LE PDF EST LU CHEZ NOUS, PAGE PAR PAGE. Le lecteur natif de Chrome attendait le fichier entier
                puis décodait toutes les pages avant d'en peindre une (2 à 5 s mesurées sur un acte de 29 pages).
                PDF.js ne demande que les octets de la page 1, par requêtes partielles que notre route sert.
                `key` force un lecteur NEUF à chaque document : sans elle, on garderait le rendu du précédent.
              */}
              {etat.e === 'pret' && etat.sorte === 'pdf' && (
                <LecteurPdf key={vu.id} url={adresseApercu(vu.id, 'octets', source)} nom={vu.nom}
                  onPremierePage={direPage1Peinte} />
              )}
              {/* ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LE LECTEUR VIDÉO ════════════════════════════
                  Arno : « lecteur vidéo intégré (lecture, pause, barre de temps, son, plein écran), avec
                  diffusion par plages (Range / 206) depuis la MÊME SOURCE que le téléchargement ».

                  🔴 LES CINQ COMMANDES VIENNENT DE `controls`, et c'est volontaire : les commandes natives du
                  navigateur savent le plein écran, l'image dans l'image, la vitesse, les sous-titres et le
                  clavier. En réécrire une barre aurait donné moins, en moins accessible.

                  🔴 LA SOURCE EST CELLE DU TÉLÉCHARGEMENT (`adresseApercu(..., 'octets')`), donc la chaîne
                  entière — MinIO, puis notre copie Drive, puis Gmail. Rien de particulier n'a été câblé pour la
                  vidéo : c'est la même route, qui sert désormais `Accept-Ranges: bytes` quand la pièce en est une.

                  ⚠️ `preload="metadata"` : on tire la durée et la première image, pas le film. Une liste de
                  pièces ouverte par mégarde ne doit pas peser 300 Mo.

                  ⚠️ `key` FORCE UN LECTEUR NEUF à chaque document, comme pour le PDF : sans elle, « Suivant »
                  garderait le flux précédent en cours de lecture. */}
              {etat.e === 'pret' && etat.sorte === 'video' && (
                illisible
                  ? (
                    /* 🔴 « Ce format ne se lit pas dans le navigateur » + le bouton qui sauve la situation
                       (demande d'Arno). Un message qui constate sans proposer laisse devant un cul-de-sac. */
                    <div className="apd-video-refus" role="status">
                      <p className="apd-sans">{MESSAGE_VIDEO_ILLISIBLE}</p>
                      <p className="apd-video-note">
                        Le fichier est intact : il se lit sur votre ordinateur, ou dans un autre navigateur.
                      </p>
                      <a className="svv-btn svv-btn-primary gst-btn" download={vu.nom}
                        href={`${adresseApercu(vu.id, 'octets', source)}${source === 'piece' ? '?telecharger=1' : ''}`}>
                        Télécharger la vidéo
                      </a>
                    </div>
                  )
                  : (
                    <video key={vu.id} className="apd-video" controls playsInline preload="metadata"
                      src={adresseApercu(vu.id, 'octets', source)}
                      aria-label={`Vidéo ${vu.nom}`}
                      onError={() => setIllisible(true)}
                      onLoadedData={direPage1Peinte} />
                  )
              )}
              {/* Le TEXTE BRUT garde le cadre : il n'y a rien à décoder, le navigateur l'affiche tel quel. */}
              {etat.e === 'pret' && etat.sorte === 'texte' && (
                <iframe key={vu.id} className="apd-cadre" src={adresseApercu(vu.id, 'octets', source)}
                  title={`Aperçu de ${vu.nom}`} />
              )}
            </div>
          )}
          {/* 🔴 « Aperçu indisponible » EST UNE RÉPONSE, PAS UNE PANNE : le mot le dit, et la sortie est juste à côté. */}
          {etat.e === 'sans' && <p className="apd-sans" role="status">{etat.message}</p>}
        </div>

        {/* ══ 🔴 LA NAVIGATION — BORNÉE AU DOSSIER DU DOCUMENT AFFICHÉ ═══════════════════════════════════════════
            Elle n'apparaît que s'il y a quelque chose à parcourir : un unique document ne mérite pas deux boutons
            éteints et un « 1 / 1 » qui n'apprend rien. */}
        {voisins.length > 1 && (
          <nav className="apd-nav" aria-label={etiquetteNav}>
            <button type="button" className="svv-btn gst-btn" disabled={idPrecedent === null}
              onClick={() => allerVers(idPrecedent)}>◀ Précédent</button>
            <span className="apd-compteur" aria-live="polite">
              <span className="apd-compteur-n">{motCompteur(position, voisins.length)}</span>
              <span className="apd-compteur-nom">{vu.nom}</span>
            </span>
            <button type="button" className="svv-btn gst-btn" disabled={idSuivant === null}
              onClick={() => allerVers(idSuivant)}>Suivant ▶</button>
          </nav>
        )}

        <footer className="apd-pied">
          {/* 🔴 « JOINDRE » EST DANS L'APERÇU (demande d'Arno) : on regarde, on reconnaît, on joint — sans refermer.
              ⚠️ SAUF QUAND C'EST LA RÈGLE QUI A REFUSÉ L'APERÇU : le proposer une ligne sous « son contenu n'est
              jamais lu » se contredirait, et le clic serait refusé par le serveur de toute façon. */}
          {joindreAutorise && !(etat.e === 'sans' && etat.regle) && (
            deja
              /* ⚠️ DEUX CLASSES, ET C'EST NÉCESSAIRE : `sfd-ajoute` vient du style du sélecteur Drive, qui n'est
                 PAS monté quand la visionneuse est ouverte depuis une conversation. `apd-deja`, portée par le
                 style de cette fenêtre-ci, garantit le même rendu dans les deux cas. */
              ? <span className="sfd-ajoute apd-deja">{motJoindre.deja}</span>
              : (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onJoindre(vu)}>
                  {motJoindre.action}
                </button>
              )
          )}
          <button type="button" className="svv-btn gst-btn" onClick={onFermer}>Fermer l’aperçu</button>
        </footer>
      </div>
    </div>
  );
}


/**
 * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE BANDEAU DE NOM ═══════════════════════════════════════════════════════════
 *
 * Il a DEUX visages, et c'est la demande d'Arno, mot pour mot :
 *   · arrivée par l'ŒIL → le NOM du fichier et un petit stylo ✎ ; « un clic sur le stylo fait apparaître le champ
 *     SUR PLACE » — la fenêtre ne bouge pas, le visuel ne recharge pas, seule la ligne change ;
 *   · arrivée par le STYLO → le CHAMP, déjà ouvert, « le nom sélectionné SANS l'extension ».
 *
 * 🔴 L'EXTENSION EST À CÔTÉ DU CHAMP, PAS DEDANS, et c'est la garantie centrale : un « .pdf » devenu « .pdff »
 * est un fichier que rien n'ouvre, et la faute ne se découvre qu'au moment où l'on en a besoin. On la retire de
 * ce qui est saisi, on l'affiche, et on la recolle à la validation.
 *
 * 🔴 ÉCHAP ANNULE LE RENOMMAGE, IL NE FERME PAS LA FENÊTRE (demande d'Arno). D'où le `stopPropagation` : sans lui,
 * la touche remonterait à l'aperçu, qui se fermerait — et l'on perdrait le nom en croyant l'abandonner.
 *
 * ⚠️ `key={vu.id}` À L'APPEL : « Précédent / Suivant » change de pièce, et le champ doit suivre. Sans clé neuve,
 * l'état local du bandeau (la saisie en cours) survivrait au changement et proposerait le nom du voisin.
 */
function BandeauNom({ nomOrigine, nomChoisi, typeMime, editerDabord, refus, onRenommer }: {
  nomOrigine: string;
  nomChoisi: string | null;
  /**
   * 🔴 LOT RENOMMAGE-UN-SEUL-NOM — CE QUE LE DOCUMENT EST. Il sert UNIQUEMENT à repêcher l'extension quand le
   * nom n'en porte pas à la fin : « _MESURE … 0836_001.pdf [octets] » finit par « [octets] », et sans le type
   * ce PDF se serait renommé en fichier sans extension. Vide ou inconnu ⇒ on n'invente rien.
   */
  typeMime: string | null | undefined;
  editerDabord: boolean;
  refus: string | null;
  onRenommer: (nom: string) => void;
}) {
  /** Le nom COMPLET affiché aujourd'hui : celui qu'on a donné, ou celui reçu. */
  const nomActuel = nomDeDepot(nomOrigine, nomChoisi);
  const { base, extension } = eclaterNom(nomActuel, typeMime);
  // ⚠️ Une pièce non renommable n'ouvre jamais le champ, même arrivée par le stylo : le stylo y est éteint.
  const [edite, setEdite] = useState(editerDabord && refus === null);
  const [saisie, setSaisie] = useState(base);
  const champ = useRef<HTMLInputElement | null>(null);

  /**
   * 🔴 LA SÉLECTION PORTE SUR LE NOM SEUL (demande d'Arno : « le nom est sélectionné SANS l'extension »).
   * Comme l'extension ne vit pas dans le champ, tout sélectionner suffit — et l'on ne peut PAS l'effacer par
   * mégarde en tapant par-dessus, ce qui est tout l'intérêt de l'avoir sortie.
   */
  useEffect(() => {
    if (!edite) return;
    const el = champ.current;
    if (el === null) return;
    el.focus();
    el.select();
  }, [edite]);

  const verdict = verifierNom(saisie, extension);

  const valider = () => {
    if (verdict.refus !== null) return;
    onRenommer(verdict.nom);
    setEdite(false);
  };
  /** ⚠️ ANNULER REND LE NOM D'AVANT, pas le nom d'origine : on annule une saisie, pas un renommage déjà validé. */
  const annuler = () => { setSaisie(base); setEdite(false); };

  if (!edite) {
    return (
      <div className="apd-nommage">
        <span className="apd-nommage-nom" title={nomActuel}>{nomActuel}</span>
        <button type="button" className="apd-stylo" disabled={refus !== null}
          title={refus ?? INFOBULLE_RENOMMER} aria-label={refus ?? INFOBULLE_RENOMMER}
          onClick={() => setEdite(true)}>
          <span aria-hidden="true">✎</span>
        </button>
        {/* 🔴 LE NOM REÇU RESTE LISIBLE dès qu'il diffère : c'est lui qu'on cherchera dans le mail. */}
        {estRenommee(nomOrigine, nomChoisi) && (
          <span className="apd-nommage-origine">{mentionNomOrigine(nomOrigine)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="apd-nommage apd-nommage--edition">
      <label className="apd-nommage-label" htmlFor="apd-champ-nom">Nom du fichier</label>
      <span className="apd-nommage-saisie">
        <input ref={champ} id="apd-champ-nom" type="text" className="apd-champ-nom" value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            /* 🔴 ÉCHAP ANNULE LE RENOMMAGE, PAS L'APERÇU (demande d'Arno) : on arrête la touche ici. */
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); annuler(); return; }
            if (e.key === 'Enter') { e.preventDefault(); valider(); }
          }} />
        {/* ⚠️ L'EXTENSION EST AFFICHÉE, JAMAIS SAISISSABLE : voir l'encadré ci-dessus. */}
        {extension !== '' && <span className="apd-extension" aria-label={`extension ${extension}`}>{extension}</span>}
      </span>
      <button type="button" className="svv-btn svv-btn-primary gst-btn apd-nommage-btn"
        disabled={verdict.refus !== null} onClick={valider}>Valider</button>
      <button type="button" className="svv-btn svv-btn-outline gst-btn apd-nommage-btn"
        onClick={annuler}>Annuler</button>
      {/* Le refus GRISE « Valider » et se LIT : un bouton éteint sans motif se prend pour une panne. */}
      {verdict.refus !== null && <span className="apd-nommage-refus" role="alert">{verdict.refus}</span>}
      {verdict.refus === null && verdict.remarque !== null && (
        <span className="apd-nommage-remarque" role="status">{verdict.remarque}</span>
      )}
    </div>
  );
}

export const CSS_APERCU = `
/* Au-dessus du sélecteur (z-index 70), jamais dedans : voir l'en-tête du composant. */
.apd-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px;
  background:color-mix(in srgb, var(--color-svv-ink) 62%, transparent)}
/* 🔴 LOT FIL-APERCU-MINIATURES — LA FENETRE S'ELARGIT (1040 -> 1280 px) pour loger la colonne de miniatures SANS
   retirer de largeur au document : la colonne fait 132 px, la fenetre en gagne 240. Mesure a l'ecran : le
   document garde alors 1 100 px environ, contre 1 016 avant ce lot — il est donc un peu PLUS large qu'avant.
   ⚠️ LE min() GARDE LE PLAFOND A 100 % : sur un ecran etroit, la fenetre ne deborde pas, et la colonne passe
   sous le seuil ou elle disparait (voir le CSS du lecteur). AUCUN ACCENT GRAVE ici : litteral de gabarit. */
.apd{display:flex;flex-direction:column;gap:8px;width:min(1280px,100%);height:min(92vh,100%);padding:12px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 12px 48px color-mix(in srgb, var(--color-svv-ink) 34%, transparent)}
.apd-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.apd-nom{flex:1 1 12rem;min-width:0;font-size:.92rem;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.apd-zoom{display:flex;align-items:center;gap:8px;font-size:.82rem}
.apd-zoom-mot{min-width:3.4rem;text-align:center;color:var(--color-svv-muted)}
.apd-croix{min-width:44px;min-height:44px;padding:0;font:inherit;font-size:1.4rem;line-height:1;
  color:var(--color-svv-ink);background:none;border:0;border-radius:.4rem;cursor:pointer}
.apd-croix:hover{background:var(--color-svv-field)}
.apd-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* La scène prend toute la hauteur restante : un aperçu qui n'occupe pas la place ne sert à rien. */
.apd-scene{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;overflow:auto;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.5rem}
/* Zoomée, l'image déborde : elle s'aligne en haut à gauche pour qu'on puisse la parcourir. */
.apd-scene--image{align-items:flex-start;justify-content:flex-start}
/* 🔴 LA PILE — la vignette et le document occupent la MÊME case : le second recouvre la première SANS saut de
   mise en page. Empiler par la grille, et non par « position:absolute », garde la hauteur juste dans les deux cas. */
.apd-pile{display:grid;width:100%;height:100%;min-height:0}
.apd-pile > *{grid-area:1 / 1}
.apd-vignette{width:100%;height:100%;object-fit:contain;object-position:center top;background:var(--color-svv-field)}
.apd-attente{align-self:end;justify-self:center;margin:0 0 12px;padding:4px 12px;font-size:.82rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border-radius:999px;
  box-shadow:0 2px 10px color-mix(in srgb, var(--color-svv-ink) 16%, transparent)}
.apd-cadre{width:100%;height:100%;border:0;background:var(--color-svv-surface)}

/* ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LE LECTEUR VIDEO ════════════════════════════════════════════
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot).
   La video occupe TOUTE la scene, en gardant ses proportions ("object-fit:contain").

   ⚠️ POURQUOI PAS "width:auto", QUI SERAIT LE REFLEXE : tant que les metadonnees ne sont pas arrivees, le
   navigateur ne connait pas le format de la video et la boite retombe sur sa taille par defaut — 300 x 150 px,
   un timbre-poste noir au coin d'une grande fenetre. Vu a l'ecran le 03/10/2026. Avec une boite qui occupe la
   scene, le cadre est bon des le premier pixel, et "contain" empeche toute deformation.

   ⚠️ AUCUN FOND POSE ICI : les bandes laissent voir la scene, qui suit le theme. Un fond noir ecrit en dur
   aurait en plus viole le garde des jetons (themeDrive.test.ts). */
.apd-video{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;border-radius:.4rem}
.apd-video-refus{display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;text-align:center}
.apd-video-note{margin:0;font-size:.8rem;color:var(--color-svv-muted)}

/* ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE BANDEAU DE NOM, AU-DESSUS DU VISUEL ══════════════════════════════════
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit, qu'un seul refermerait (TS1005).
   ⚠️ flex-wrap:wrap — sur un ecran etroit, les boutons passent sous le champ plutot que de le comprimer a rien. */
.apd-nommage{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:0 0 auto;
  padding:6px 8px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.5rem}
.apd-nommage-nom{font-size:.88rem;font-weight:600;color:var(--color-svv-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
/* Le nom RECU, quand il differe : petit et gris, sous les yeux sans prendre la place du nom qui compte. */
.apd-nommage-origine{flex:0 0 100%;font-size:.74rem;color:var(--color-svv-muted)}
.apd-nommage-label{font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}
/* Le champ et son extension forment UN bloc : l'extension est collee au champ, et se lit comme sa fin. */
.apd-nommage-saisie{display:flex;align-items:stretch;flex:1 1 16rem;min-width:0;
  border:1px solid var(--color-svv-line-strong);border-radius:.4rem;background:var(--color-svv-surface)}
.apd-champ-nom{flex:1 1 auto;min-width:0;padding:6px 8px;font:inherit;font-size:.88rem;
  color:var(--color-svv-ink);background:transparent;border:0;border-radius:.4rem 0 0 .4rem}
.apd-champ-nom:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'EXTENSION N'EST PAS SAISISSABLE, et elle en a l'air : fond mat, curseur normal, pas de bordure propre. */
.apd-extension{display:flex;align-items:center;padding:0 8px;font-size:.88rem;font-weight:600;
  color:var(--color-svv-muted);background:var(--color-svv-field);border-left:1px solid var(--color-svv-line);
  border-radius:0 .4rem .4rem 0;user-select:none}
.apd-nommage-btn{flex:0 0 auto}
.apd-stylo{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 auto;
  font:inherit;color:var(--color-svv-ink);background:transparent;
  border:1px solid var(--color-svv-line);border-radius:.35rem;cursor:pointer}
.apd-stylo:hover:not(:disabled){background:var(--color-svv-surface);border-color:var(--color-svv-line-strong)}
.apd-stylo:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.apd-stylo:disabled{opacity:.45;cursor:not-allowed}
.apd-nommage-refus{flex:0 0 100%;font-size:.78rem;color:var(--color-svv-red)}
.apd-nommage-remarque{flex:0 0 100%;font-size:.78rem;color:var(--color-svv-muted)}
.apd-image{display:block;height:auto;max-width:none;align-self:start;justify-self:start}
.apd-sans{margin:0;padding:14px 16px;max-width:34rem;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
/* ══ LA NAVIGATION ════════════════════════════════════════════════════════════════════════════════════════════ */
.apd-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.apd-compteur{display:flex;flex-direction:column;align-items:center;min-width:0;flex:1 1 8rem}
.apd-compteur-n{font-size:.84rem;font-weight:700;color:var(--color-svv-ink)}
.apd-compteur-nom{max-width:100%;font-size:.74rem;color:var(--color-svv-muted);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.apd-pied{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px}
/* « deja fait » : meme rendu que dans le selecteur Drive, mais porte par CE style — la visionneuse s'ouvre aussi
   depuis une conversation, ou le style du selecteur n'est pas monte. AUCUN ACCENT GRAVE ici : litteral de gabarit. */
.apd-deja{flex:0 0 auto;font-size:.72rem;font-weight:700;color:var(--color-svv-green, var(--color-svv-ink))}
@media (max-width:520px){
  .apd{height:100%;padding:10px}
  .apd-nom{flex-basis:100%}
}
`;
