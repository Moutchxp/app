'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS, POINT 2 — LA MINIATURE D'UNE VIDÉO, EXTRAITE PAR LE NAVIGATEUR ═════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Miniature : une image extraite de la vidéo (vers 1 s), mise en cache, servie comme
 * les autres miniatures. Choisis la méthode : ffmpeg côté serveur s'il est déjà installé (vérifie : which ffmpeg),
 * sinon extraction dans le navigateur (<video> + canvas). N'installe RIEN sur le Mac sans demander à Arno. »
 *
 * 🔴 VÉRIFIÉ : `which ffmpeg` → INTROUVABLE sur la machine. C'est donc la seconde voie — et elle a un mérite qu'il
 * faut dire : elle n'exige AUCUN outil système, ni ici ni sur le futur hébergement. C'est la même contrainte qui
 * avait fait choisir PDFium (WebAssembly) plutôt que poppler pour les PDF.
 *
 * ═══ COMMENT ÇA MARCHE, ET POURQUOI CHAQUE DÉTAIL EST LÀ ══════════════════════════════════════════════════════════
 *
 *   ① ON NE TÉLÉCHARGE PAS LA VIDÉO. Un `<video preload="metadata">` tire l'en-tête, puis le navigateur demande
 *      par TRANCHES (`Range`) les octets de l'instant visé — c'est précisément ce que la route sert désormais
 *      pour les vidéos. Une vidéo de 300 Mo coûte donc quelques centaines de kilo-octets.
 *   ② VERS 1 SECONDE (demande d'Arno). La toute première image d'une vidéo de téléphone est souvent noire (le
 *      capteur n'a pas fini de s'ouvrir) ; une seconde plus loin, il y a une scène. Pour une vidéo plus courte
 *      que cela, on prend le MILIEU — c'est l'image la plus représentative qu'on puisse nommer sans la regarder.
 *   ③ LA TOILE N'EST PAS SOUILLÉE : la source est servie par NOTRE route, donc même origine. `toBlob` rend
 *      l'image ; une source d'un autre domaine l'aurait interdit.
 *   ④ UNE SEULE EXTRACTION À LA FOIS, pour tout l'écran. Un mail à six vidéos lancerait six décodeurs en
 *      parallèle et ferait ramer la page entière — on les met donc à la queue leu leu.
 *   ⑤ UNE SEULE TENTATIVE PAR PIÈCE ET PAR SESSION. Un format que ce navigateur ne sait pas décoder (un `.mov`
 *      HEVC dans Chrome) ne le saura pas davantage au rendu suivant : réessayer en boucle ferait tourner un
 *      décodeur pour rien à chaque défilement.
 *
 * ⚠️ ÉCHOUER EST NORMAL ET SANS CONSÉQUENCE : la pièce garde sa tuile de type (« MP4 »), exactement comme avant
 * ce lot. On n'écrit RIEN côté serveur dans ce cas — surtout pas un « échec » qui condamnerait la vignette pour
 * toujours, y compris depuis un autre navigateur qui, lui, saurait la faire.
 *
 * 🔒 CE MODULE NE LIT QUE CE QUE L'ÉCRAN AFFICHE DÉJÀ, et n'écrit qu'à UN endroit : la vignette de CETTE pièce,
 * par une route qui la réencode et vérifie que la pièce est bien une vidéo.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'instant visé, en secondes. Mot d'Arno : « vers 1 s ». */
export const INSTANT_MINIATURE_S = 1;

/** Le côté long de l'image extraite. Le MÊME que les vignettes du serveur (`MINIATURE_COTE`) : une seule taille. */
export const COTE_MINIATURE = 320;

/** Au-delà, on abandonne l'extraction : une vignette n'est jamais assez importante pour faire attendre. */
export const DELAI_EXTRACTION_MS = 20_000;

/** La qualité JPEG. La même que celle du serveur : on ne veut pas deux poids pour deux chemins. */
const QUALITE = 0.72;

/**
 * ⚠️ LA QUEUE EST UN MODULE, PAS UN ÉTAT DE COMPOSANT : elle doit valoir pour TOUS les écrans à la fois (le bloc
 * d'un message, le récapitulatif, l'éditeur peuvent être ouverts ensemble). Une promesse qui se chaîne, et rien
 * de plus — ni minuteur, ni file à gérer.
 */
let queue: Promise<unknown> = Promise.resolve();

/** Les pièces déjà tentées dans cette page. Voir ⑤ : on ne relance pas un décodeur qui a déjà dit non. */
const dejaTentees = new Set<number>();

/** Rend `true` si l'environnement sait faire une extraction. Faux en rendu serveur et dans jsdom. */
export function extractionPossible(): boolean {
  return typeof document !== 'undefined'
    && typeof document.createElement === 'function'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.toBlob === 'function';
}

/**
 * ══ L'EXTRACTION ELLE-MÊME ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Rend le JPEG, ou `null` si le navigateur n'a pas su lire la vidéo (format, codec, fichier tronqué, délai).
 *
 * ⚠️ TOUT EST DÉMONTÉ DANS `finally` : un `<video>` laissé en vie garde un décodeur et un flux réseau ouverts.
 */
export async function extraireImageVideo(url: string): Promise<Blob | null> {
  if (!extractionPossible()) return null;
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  /* ⚠️ `crossOrigin` N'EST PAS POSÉ, ET C'EST VOLONTAIRE : la source est servie par notre propre route, donc de
     même origine. L'ajouter forcerait une requête CORS là où il n'y a pas de domaine à traverser. */
  video.src = url;

  const fini = <T>(p: Promise<T>): Promise<T> => Promise.race([
    p,
    new Promise<never>((_, rejeter) => setTimeout(
      () => rejeter(new Error('extraction : délai dépassé')), DELAI_EXTRACTION_MS)),
  ]);
  const attendre = (evenement: string): Promise<void> => new Promise((resoudre, rejeter) => {
    video.addEventListener(evenement, () => resoudre(), { once: true });
    video.addEventListener('error', () => rejeter(new Error('vidéo illisible')), { once: true });
  });

  try {
    await fini(attendre('loadedmetadata'));
    const duree = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    // ② « vers 1 s », sauf si la vidéo est plus courte : alors son milieu.
    video.currentTime = duree > INSTANT_MINIATURE_S ? INSTANT_MINIATURE_S : duree / 2;
    await fini(attendre('seeked'));

    const l = video.videoWidth;
    const h = video.videoHeight;
    if (l <= 0 || h <= 0) return null;
    const echelle = Math.min(1, COTE_MINIATURE / Math.max(l, h));
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(l * echelle));
    toile.height = Math.max(1, Math.round(h * echelle));
    const pinceau = toile.getContext('2d');
    if (pinceau === null) return null;
    pinceau.drawImage(video, 0, 0, toile.width, toile.height);
    return await new Promise<Blob | null>((resoudre) => toile.toBlob(resoudre, 'image/jpeg', QUALITE));
  } catch {
    return null;
  } finally {
    // ⚠️ ON COUPE LA SOURCE AVANT DE LÂCHER L'ÉLÉMENT : sans cela, Chrome garde le téléchargement en cours.
    try { video.removeAttribute('src'); video.load(); } catch { /* le démontage ne doit rien casser */ }
  }
}

/**
 * ══ 🔴🔴 LE CROCHET DES ÉCRANS — UNE SEULE IMPLÉMENTATION POUR LES TROIS ═════════════════════════════════════════
 *
 * Arno : « Vaut PARTOUT où il y a des miniatures (lecture du mail, récapitulatif des pièces, éditeur). »
 *
 * Il ne part QUE lorsque les trois conditions sont réunies : la pièce est une vidéo, le serveur n'a pas de
 * vignette (l'image a échoué), et l'on n'a pas déjà essayé. Il rend alors `pret`, qui fait redemander l'image.
 *
 * ⚠️ IL NE DEVINE RIEN DU SERVEUR : c'est l'ÉCHEC de la balise `<img>` qui déclenche, c'est-à-dire le fait que la
 * route a répondu 404. Interroger d'abord pour savoir s'il y a une vignette ajouterait une requête par tuile.
 */
export function useMiniatureVideo(o: {
  pieceId: number;
  /** L'adresse des octets de la pièce — la même que le téléchargement. */
  urlOctets: string;
  /** L'adresse de la vignette, pour la redemander une fois déposée. */
  urlMiniature: string;
  /** La pièce est-elle une vidéo ? */
  estVideo: boolean;
  /** La vignette du serveur a-t-elle échoué ? C'est le signal de départ. */
  sansVignette: boolean;
}): { pret: boolean } {
  const [pret, setPret] = useState(false);

  useEffect(() => {
    if (!o.estVideo || !o.sansVignette || pret) return undefined;
    if (dejaTentees.has(o.pieceId) || !extractionPossible()) return undefined;
    dejaTentees.add(o.pieceId);
    let annule = false;

    // ④ À LA QUEUE LEU LEU : un seul décodeur vidéo à la fois pour toute la page.
    queue = queue.then(async () => {
      if (annule) return;
      const image = await extraireImageVideo(o.urlOctets);
      if (annule || image === null) return;
      try {
        const res = await fetch(o.urlMiniature, {
          method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image,
        });
        if (!annule && res.ok) setPret(true);
      } catch { /* la pièce garde sa tuile de type : voir l'encadré */ }
    });

    return () => { annule = true; };
  }, [o.pieceId, o.urlOctets, o.urlMiniature, o.estVideo, o.sansVignette, pret]);

  return { pret };
}
