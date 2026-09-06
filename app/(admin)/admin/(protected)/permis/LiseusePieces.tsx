'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist'; // type SEUL (erasé au runtime) : pdf.js reste importé DYNAMIQUEMENT dans afficherPage
import {
  construireBandePlans, bandeAvecOverrides, cibleBestOf, bornerPage,
  ListePiecesAnalyse, BandePlans, NavPieceLibre, ZoomPdf, etatAnalyseIA,
  statutPageAnalyse, resumePagesAnalysees,
  type PiecePlan, type Plan, type EtatAnalyseIA,
} from './TraceEmpriseRendu';
import { BarreVisionneusePieces } from './BarreVisionneusePieces'; // INCRÉMENT-2 — barre de commandes PARTAGÉE (planche + tracé)
import { MAX_DOCS_CACHE, MAX_BITMAPS_RENDU, voisinsAPrecharger, rangerEtEvincer } from './prechargeLiseuse';
import type { RunReperageAffiche } from '../../../../lib/permis/reperePlanchesRepo'; // LOT 62 — audit du repérage par image (type SEUL)
import type { LecturePageAffiche } from '../../../../lib/permis/lectureValeursPageRepo'; // LOT 95 — audit daté « page analysée pour lire des valeurs » (type SEUL)
import { jourParisISO } from '../../../../lib/permis/horodatageParis'; // LOT 64 — date « analysée le … » en Europe/Paris

/** LOT 23 — un document pdf.js en cache + comment il y est entré (`precharge` = chargé en tâche de fond, pas encore affiché) + octets réellement transférés. */
type EntreeCache = { doc: PDFDocumentProxy; precharge: boolean; octets: number };

/** LOT 25 — artefact de RENDU mis en cache : un ImageBitmap (immuable, léger) quand disponible, sinon le canvas hors écran (repli). Les deux sont drawImage-ables. */
type RenduBitmap = (ImageBitmap | HTMLCanvasElement) & { width: number; height: number };

/** LOT 23 — planifie une tâche de fond quand le thread principal est OISIF (`requestIdleCallback`), repli `setTimeout` là où l'API manque (Safari, tests node). */
type IdleHandle = { type: 'idle'; id: number } | { type: 'timeout'; id: ReturnType<typeof setTimeout> };
function planifierIdle(cb: () => void): IdleHandle {
  const w = typeof window !== 'undefined' ? (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }) : undefined;
  if (w?.requestIdleCallback) return { type: 'idle', id: w.requestIdleCallback(cb, { timeout: 2000 }) };
  return { type: 'timeout', id: setTimeout(cb, 200) };
}
function annulerIdle(h: IdleHandle): void {
  const w = typeof window !== 'undefined' ? (window as Window & { cancelIdleCallback?: (id: number) => void }) : undefined;
  if (h.type === 'idle') w?.cancelIdleCallback?.(h.id);
  else clearTimeout(h.id);
}

/** LOT 25 — fige le résultat peint HORS écran en artefact réutilisable : ImageBitmap (immuable, léger) si l'API existe, sinon le canvas lui-même (repli). */
async function creerBitmap(off: HTMLCanvasElement): Promise<RenduBitmap> {
  if (typeof createImageBitmap === 'function') return (await createImageBitmap(off)) as RenduBitmap;
  return off as RenduBitmap; // repli sans createImageBitmap : le canvas hors écran sert d'artefact drawImage-able
}
/** Libère un rendu en cache : `close()` pour un ImageBitmap (le canvas de repli est laissé au GC). */
function fermerBitmap(b: RenduBitmap): void {
  if (typeof ImageBitmap !== 'undefined' && b instanceof ImageBitmap) b.close();
}
/** LOT 25 — peint le rendu déjà figé sur le canvas VISIBLE en un seul drawImage → apparition d'un coup (aucun tracé progressif). */
function peindreBitmap(canvas: HTMLCanvasElement, bmp: RenduBitmap): void {
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.style.width = '100%'; canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.drawImage(bmp, 0, 0);
}

/**
 * LOT 14b — LISEUSE DE PIÈCES (LECTURE SEULE) : sélecteur best-of + aperçu PDF, monté en tête de la famille « Pièces du permis »
 * (encart En cours), pour identifier le projet en quelques clics. AUCUN outil de tracé : ni dessin, ni calage, ni adoption, ni verdict.
 *
 * ⚠️ JUMEAU DE RENDU PDF — DUPLICATION ASSUMÉE (décision Arno du 31/08/2026). Il existe VOLONTAIREMENT DEUX rendus pdf.js distincts
 * dans l'application :
 *   • CELUI-CI — lecture seule, autonome, sans état de tracé.
 *   • `BlocTraceEmprise.tsx` — la colonne gauche y EST la surface de dessin (≈40 variables d'état, aucun filet de test du tracé) : on
 *     n'en extrait donc RIEN (l'extraire déplacerait tout le tracé, cf. arrêt motivé du LOT 14).
 * 👉 RÈGLE : une correction du RENDU PDF (pdf.js, viewport, zoom/pan) doit être envisagée DES DEUX CÔTÉS — les deux rendus sont jumeaux.
 * 👉 En revanche les RÈGLES de best-of (sélection/classement/libellé des plans) sont PARTAGÉES : elles vivent dans `TraceEmpriseRendu.tsx`
 *    (construireBandePlans / cibleBestOf / SelecteurPiecePlan / BandePlans / NavPieceLibre / ZoomPdf) et sont IMPORTÉES ici, JAMAIS recopiées.
 *    Toute évolution des critères se fait UNE fois là-bas et bénéficie aux deux liseuses (même sélection, même ordre, même plan par défaut).
 */
export function LiseusePieces({ dossierId, onValeurEcrite }: {
  dossierId: number;
  // LOT — « analyse de la page » écrit une valeur (ou l'annule) au niveau PERMIS/corps : ce signal permet à un frère co-monté
  //   (CaracteristiquesBloc) de RE-FETCHER son journal, pour que la valeur lue apparaisse aussitôt en proposition (sinon, le bloc
  //   restant monté — BlocRepliable ne démonte jamais — garde un journal périmé et n'affiche pas la proposition). N'affecte PAS le lecteur.
  onValeurEcrite?: () => void;
}) {
  const [pieces, setPieces] = useState<PiecePlan[]>([]);
  const [etat, setEtat] = useState<'charge' | 'ok' | 'vide' | 'erreur'>('charge');
  const [bande, setBande] = useState<Plan[]>([]);
  // LOT 61 — pages RETIRÉES du best-of à la main (réversibles), clé stable « pieceId:page ». On persiste les exclusions ; le best-of
  //   reste calculé à la volée, on lui SOUSTRAIT ces pages. Le retrait n'ôte JAMAIS le document ni la page en GED, seulement de la sélection.
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  // LOT 92 — pages AJOUTÉES au best-of à la main (réversibles), miroir de `exclus`. Le geste manuel l'emporte sur le calcul auto.
  const [inclus, setInclus] = useState<Set<string>>(new Set());
  // LOT 62 — audit du repérage par IMAGE, par pièce (planches / incertaines / pages écartées RGPD + motif / coût). `vReper` : après un
  //   repérage, on RECHARGE le best-of (les nouvelles planches image y entrent). `reperEnCours`/`reperMsg` : état du bouton.
  const [runs, setRuns] = useState<Record<number, RunReperageAffiche>>({});
  const [piecesNonSupportees, setPiecesNonSupportees] = useState<{ id: number; nomFichier: string; motif: string }[]>([]); // LOT 64 — pièces non PDF (listées désactivées)
  const [vReper, setVReper] = useState(0);
  const [reperEnCours, setReperEnCours] = useState(false);
  const [reperMsg, setReperMsg] = useState<string | null>(null);
  // LOT 95 — LECTURE DE VALEURS au grain page (bouton « analyse de la page »). `lectures` : audit daté par pièce (état « déjà analysée »).
  //   `lectureEnCours` : état du bouton. `lectureRes` : l'issue de la DERNIÈRE lecture, ANCRÉE à sa page (clé « pieceId:page ») pour ne
  //   l'afficher qu'en face de CETTE page (change de page → l'issue disparaît d'elle-même, sans effet de reset). `ecrit` → propose l'annulation.
  const [lectures, setLectures] = useState<Record<number, LecturePageAffiche[]>>({});
  // LOT 100 — origine (auto/manuelle) de la dernière extraction NON-IA du dossier (null = indéterminée) → statut de page « identifiée sans IA ».
  const [origineSansIa, setOrigineSansIa] = useState<'auto' | 'manuelle' | null>(null);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [lectureRes, setLectureRes] = useState<{ cle: string; texte: string; ecrit: boolean; echec?: boolean } | null>(null);
  const [nav, setNav] = useState<'bestof' | 'piece'>('bestof');
  const [planIndex, setPlanIndex] = useState(0);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [nbPagesPiece, setNbPagesPiece] = useState(1);
  const [pleinListe, setPleinListe] = useState(false);
  // LOT 96 — la liste des pages AJOUTÉES à la main est repliée par défaut (une seule ligne portant le compte) ; on l'ouvre à la demande.
  //   Pas de BlocRepliable imbriqué : la liseuse EST déjà dans le repliable « Pièces du permis » → simple bouton + aria-expanded (comme « voir toutes les pièces »).
  const [pleinAjoutees, setPleinAjoutees] = useState(false);
  // LOT 98 — la vue d'ensemble « pages analysées : … » est repliée par défaut si la liste est LONGUE (esprit LOT 96) ; sinon affichée inline.
  const [pleinPagesAnalysees, setPleinPagesAnalysees] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // PROJ-AGR — agrandissement de l'aperçu (parité avec « Bâtiments et projection »). Côté planche la liseuse est PASSIVE : un clic n'y
  //   pose RIEN (aucune capture de clic, aucune conversion écran→PDF) → l'agrandi reste un simple confort de lecture. Le canvas se re-rend à sa largeur.
  const [imageAgrandie, setImageAgrandie] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // LOT 23 — RETOUR VISUEL d'un téléchargement réseau NON préchargé : « Chargement… N % » (pct null tant qu'on n'a pas de total). null = rien à afficher.
  const [chargeReseau, setChargeReseau] = useState<{ pct: number | null } | null>(null);
  // LOT 25 — RETOUR VISUEL du CALCUL de rendu (pdf.js → canvas), DISTINCT du réseau : « Rendu… ». Couvre le canvas pendant qu'on peint HORS écran → apparition d'un coup.
  const [enRendu, setEnRendu] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; panX: number; panY: number } | null>(null);
  // LOT 22 (C) — le module pdf.js est chargé UNE fois (mémorisé), plus à chaque page.
  const pdfjsRef = useRef<typeof import('pdfjs-dist') | null>(null);
  // LOT 23 — CACHE LRU des documents parsés (≤ MAX_DOCS_CACHE) : le changement de PAGE ne recharge rien, et un aller-retour best-of
  //   A→B→A retrouve A EN CACHE (fini le re-téléchargement du LOT 22 mono-case). `Map` = ordre d'insertion = fraîcheur LRU.
  const cacheRef = useRef<Map<number, EntreeCache>>(new Map());
  // LOT 25 — CACHE LRU des RENDUS peints (≤ MAX_BITMAPS_RENDU), clé « pièce:page:échelle(px) ». Un retour sur une page déjà peinte à la
  //   même échelle est INSTANTANÉ (drawImage du bitmap), sans nouvel appel à render(). Le zoom (CSS) ne change pas la clé.
  const renduCacheRef = useRef<Map<string, RenduBitmap>>(new Map());
  // Chargements EN COURS (par pièce) : dédup affichage ⇄ préchargement — jamais deux `getDocument` pour la même pièce en parallèle.
  const enCoursRef = useRef<Map<number, Promise<PDFDocumentProxy | null>>>(new Map());
  // Génération de cache : incrémentée à la purge (changement de dossier / démontage) → un chargement en vol devenu obsolète est détruit, jamais rangé (aucune fuite).
  const genRef = useRef(0);
  // LOT 24 — pièce courante « live », tenue à jour à CHAQUE montage/changement (ref recréée au remontage) : c'est LE garde de cycle de vie.
  //   Il remplace l'ancien flag `monteRef` du LOT 23 qui, mis false au démontage et jamais remis true au remontage (StrictMode / repli-dépli
  //   de la famille), gelait l'affichage sur un écran « Chargement… » figé. `pieceIdRef` ne peut pas rester « bloqué » : il reflète toujours le pieceId réel.
  const pieceIdRef = useRef<number | null>(pieceId);

  // LOT 61 — BEST-OF VISIBLE = bande complète MOINS les pages retirées (clé stable « pieceId:page »). Défini AVANT le préchargement
  //   et la navigation, qui s'appuient dessus. `retirees` (l'inverse) alimente le compteur + la liste réintégrable.
  const cle = (pl: { pieceId: number; page: number }) => `${pl.pieceId}:${pl.page}`;
  // LOT 61/92 — BEST-OF VISIBLE = bande AUTO moins les pages retirées, PLUS les pages ajoutées à la main (source unique : bandeAvecOverrides).
  const bandeVisible = useMemo(() => bandeAvecOverrides(bande, pieces, exclus, inclus), [bande, pieces, exclus, inclus]);
  const retirees = useMemo(() => bande.filter((pl) => exclus.has(cle(pl))), [bande, exclus]);
  // LOT 92 — pages AJOUTÉES à la main (celles qui ne viennent pas de la bande auto) → liste réversible + compteur, miroir de `retirees`.
  const ajoutees = useMemo(() => bandeVisible.filter((pl) => pl.manuel), [bandeVisible]);

  // CHARGEMENT PARESSEUX : cet effet ne part qu'À LA MONTÉE — or le composant n'est monté qu'à l'OUVERTURE de la famille (le `contenu`
  //   de BlocRepliable est un thunk appelé au dépli). Donc rien tant que la famille est repliée, et jamais au rendu de la liste des demandes.
  //   Même source que BlocTraceEmprise (GET /emprise) → mêmes pièces enrichies (propose/famille/planches) que le best-of ; per-dossier, aucun WHERE sur `dem`.
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/emprise?dossierId=${dossierId}`);
        if (!res.ok) { if (vivant) setEtat('erreur'); return; }
        const j = await res.json() as { pieces?: PiecePlan[]; piecesNonSupportees?: { id: number; nomFichier: string; motif: string }[]; exclusionsBestOf?: { pieceId: number; page: number }[]; inclusionsBestOf?: { pieceId: number; page: number }[]; reperageRuns?: Record<number, RunReperageAffiche>; lecturesPages?: Record<number, LecturePageAffiche[]>; origineExtractionSansIa?: 'auto' | 'manuelle' | null };
        if (!vivant) return;
        const ps = j.pieces ?? [];
        setPieces(ps);
        setRuns(j.reperageRuns ?? {}); // LOT 62 — audit du repérage par image
        setLectures(j.lecturesPages ?? {}); // LOT 95 — audit daté « page analysée pour lire des valeurs »
        setOrigineSansIa(j.origineExtractionSansIa ?? null); // LOT 100 — origine tracée de l'extraction non-IA
        setPiecesNonSupportees(j.piecesNonSupportees ?? []); // LOT 64

        if (ps.length === 0) { setEtat('vide'); return; }
        const b = construireBandePlans(ps); // RÈGLE PARTAGÉE — sélection/ordre du best-of, jamais recodée ici.
        setBande(b);
        // LOT 61/92 — overrides persistés : on OUVRE sur le 1er plan VISIBLE (best-of − retraits + ajouts).
        const ex = new Set((j.exclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`));
        const inc = new Set((j.inclusionsBestOf ?? []).map((e) => `${e.pieceId}:${e.page}`));
        setExclus(ex); setInclus(inc);
        const vis = bandeAvecOverrides(b, ps, ex, inc);
        setNav('bestof'); setPlanIndex(0);
        setPieceId(vis[0]?.pieceId ?? ps[0]?.id ?? null); // ouverture DIRECTE sur le plan visible le mieux classé (ou 1re pièce à défaut).
        setPage(vis[0]?.page ?? 1);
        setPleinListe(vis.length <= 1);
        setEtat('ok');
      } catch { if (vivant) setEtat('erreur'); }
    })();
    return () => { vivant = false; };
  }, [dossierId, vReper]); // LOT 62 — vReper bump après un repérage → recharge le best-of avec les planches image

  useEffect(() => { pieceIdRef.current = pieceId; }, [pieceId]);

  // LOT 23 — CACHE LRU (helpers stables, refs pures). L'éviction délègue sa DÉCISION à `rangerEtEvincer` (module pur testé) : une seule vérité.
  const toucherCache = useCallback((id: number) => {
    const e = cacheRef.current.get(id); // remonte l'entrée en position la plus fraîche (réinsertion = fin d'ordre du Map)
    if (!e) return;
    cacheRef.current.delete(id); cacheRef.current.set(id, e);
  }, []);
  const rangerCache = useCallback((id: number, entree: EntreeCache) => {
    const { evincees } = rangerEtEvincer([...cacheRef.current.keys()], id, MAX_DOCS_CACHE);
    for (const k of evincees) { void cacheRef.current.get(k)?.doc.destroy(); cacheRef.current.delete(k); } // libère le worker pdf.js des évincés
    cacheRef.current.delete(id); cacheRef.current.set(id, entree); // (ré)insère en position la plus fraîche
  }, []);
  const purgerCache = useCallback(() => {
    genRef.current++; // invalide tout chargement en vol : à sa résolution il sera détruit, jamais rangé
    for (const e of cacheRef.current.values()) void e.doc.destroy();
    for (const b of renduCacheRef.current.values()) fermerBitmap(b); // LOT 25 — libère aussi les rendus peints
    cacheRef.current.clear(); enCoursRef.current.clear(); renduCacheRef.current.clear();
  }, []);

  // LOT 25 — CACHE LRU des RENDUS (mêmes helpers que les documents, clés string). Éviction déléguée à `rangerEtEvincer` (règle pure testée).
  const toucherRendu = useCallback((cle: string) => {
    const b = renduCacheRef.current.get(cle);
    if (!b) return;
    renduCacheRef.current.delete(cle); renduCacheRef.current.set(cle, b);
  }, []);
  const rangerRendu = useCallback((cle: string, bmp: RenduBitmap) => {
    const { evincees } = rangerEtEvincer([...renduCacheRef.current.keys()], cle, MAX_BITMAPS_RENDU);
    for (const k of evincees) { const b = renduCacheRef.current.get(k); if (b) fermerBitmap(b); renduCacheRef.current.delete(k); } // libère les bitmaps évincés
    renduCacheRef.current.delete(cle); renduCacheRef.current.set(cle, bmp);
  }, []);

  // LOT 23 — OBTENIR le document d'une pièce : cache → réseau (URL signée + `getDocument`), avec DÉDUP des chargements en cours (affichage ⇄
  //   préchargement). `precharge` marque une entrée chargée en tâche de fond (origine « préchargé » au 1er affichage). pdf.js importé
  //   DYNAMIQUEMENT (paresseux), module mémorisé UNE fois. Un chargement devenu obsolète (dossier changé) est détruit, jamais rangé.
  const obtenirDoc = useCallback(async (idCible: number, opts: { precharge: boolean; onProgress?: (loaded: number, total: number) => void }): Promise<PDFDocumentProxy | null> => {
    const deja = cacheRef.current.get(idCible);
    if (deja) { toucherCache(idCible); return deja.doc; }
    const enCours = enCoursRef.current.get(idCible);
    if (enCours) return enCours; // un chargement (affichage ou préchargement) est déjà en vol pour cette pièce → on l'attend, pas de 2e téléchargement
    const gen = genRef.current;
    const p = (async (): Promise<PDFDocumentProxy | null> => {
      if (!pdfjsRef.current) {
        const m = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
        m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        pdfjsRef.current = m;
      }
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signer_piece', pieceId: idCible }) });
      if (!res.ok) return null;
      const { url } = await res.json() as { url: string };
      const task = pdfjsRef.current.getDocument(url);
      let octets = 0;
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => { octets = loaded; opts.onProgress?.(loaded, total); };
      const doc = await task.promise;
      if (gen !== genRef.current) { void doc.destroy(); return null; } // dossier changé / démonté pendant le chargement → on ne cache pas
      rangerCache(idCible, { doc, precharge: opts.precharge, octets });
      return doc;
    })();
    enCoursRef.current.set(idCible, p);
    try { return await p; } finally { enCoursRef.current.delete(idCible); }
  }, [toucherCache, rangerCache]);

  // RENDU PDF — NEUF (jumeau assumé de BlocTraceEmprise). Pur affichage : AUCUNE conversion écran→PDF, aucun overlay de tracé.
  //   LOT 23 : cache LRU multi-pièces (via obtenirDoc) + retour visuel « Chargement… N % » pendant un téléchargement réseau non préchargé.
  const afficherPage = useCallback(async () => {
    if (pieceId === null) return;
    // LOT 24 — CE rendu est-il toujours d'actualité ? (pièce inchangée depuis le démarrage de l'invocation). Immunisé au nombre de montages
    //   (StrictMode / repli-dépli) : sur le montage réel, pieceIdRef.current === pieceId → le plan COURANT s'affiche TOUJOURS. Un rendu superséedé
    //   (l'utilisateur a changé de plan) laisse le nouveau rendu piloter l'UI — il ne touche plus ni l'overlay ni le message.
    const estCourant = () => pieceIdRef.current === pieceId;
    setMessage(null); setZoom(1); setPan({ x: 0, y: 0 });
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    try {
      // DOCUMENT — cache LRU par pièce. En cache → aucun réseau (origine « cache » ou « préchargé ») ; absent → téléchargement avec « Chargement… N % ».
      const enCache = cacheRef.current.get(pieceId);
      let origine: 'réseau' | 'cache' | 'préchargé';
      let doc: PDFDocumentProxy | null;
      if (enCache) {
        origine = enCache.precharge ? 'préchargé' : 'cache';
        enCache.precharge = false; // consommé : les affichages suivants de cette pièce seront « cache »
        toucherCache(pieceId);
        doc = enCache.doc;
      } else {
        origine = 'réseau';
        setChargeReseau({ pct: null }); // à la place du document, sans faire sauter la mise en page (le conteneur garde sa hauteur)
        doc = await obtenirDoc(pieceId, { precharge: false, onProgress: (loaded, total) => {
          if (estCourant()) setChargeReseau({ pct: total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : null });
        } });
      }
      if (!estCourant()) return;                                  // rendu superséedé → le nouveau rendu (et son overlay) prend le relais
      if (!doc) { setMessage('pièce indisponible'); return; }      // échec du chargement → message lisible (le finally efface l'overlay, jamais de gris à l'infini)
      setChargeReseau(null);                                       // octets reçus → on quitte « Chargement… » (réseau) pour, si besoin, « Rendu… » (calcul)
      const octets = cacheRef.current.get(pieceId)?.octets ?? 0;
      const tDoc = (typeof performance !== 'undefined' ? performance.now() : 0);
      const pdf = doc;
      setNbPagesPiece(pdf.numPages);
      const p = Math.min(Math.max(1, page), pdf.numPages);
      const pageObj = await pdf.getPage(p);
      if (!estCourant()) return;
      const canvas = canvasRef.current; if (!canvas) return;
      const largeurCss = canvas.parentElement?.clientWidth || 480;
      const base = pageObj.getViewport({ scale: 1 });
      // ÉCHELLE ADAPTÉE À L'AFFICHAGE : largeur affichée × densité écran, densité BORNÉE à 2 et largeur du canvas PLAFONNÉE (≤ MAX_PX)
      //   pour ne jamais peindre un canvas démesuré. Rendu de la SEULE page visible (pas de couche texte/annotations : lecture seule).
      const MAX_PX = 2400;
      const dprEff = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      const scale = Math.min((largeurCss / base.width) * dprEff, MAX_PX / base.width);
      const viewport = pageObj.getViewport({ scale });
      const w = Math.floor(viewport.width), hgt = Math.floor(viewport.height);
      // LOT 25 — CLÉ DE RENDU = pièce:page:échelle(px). Le zoom (CSS) NE change PAS la clé ; un resize (nouvelle largeur → nouveau w) crée une NOUVELLE clé et garde l'ancienne.
      const cle = `${pieceId}:${p}:${w}`;
      const tRender0 = (typeof performance !== 'undefined' ? performance.now() : 0);
      let origineRendu: 'peint' | 'cache-rendu';
      const enCacheRendu = renduCacheRef.current.get(cle);
      if (enCacheRendu) {
        // CACHE DE RENDU — retour instantané : on repeint le bitmap déjà figé, AUCUN appel à render().
        toucherRendu(cle);
        peindreBitmap(canvas, enCacheRendu);
        origineRendu = 'cache-rendu';
      } else {
        // MISS — on peint HORS ÉCRAN (overlay « Rendu… » couvre le canvas) puis on ne montre le résultat qu'une fois TERMINÉ : apparition d'un coup.
        setEnRendu(true);
        const off = (typeof document !== 'undefined' ? document.createElement('canvas') : canvas);
        off.width = w; off.height = hgt;
        const octx = off.getContext('2d'); if (!octx) return;
        await pageObj.render({ canvasContext: octx, viewport }).promise;
        const bmp = await creerBitmap(off);
        if (!estCourant()) { fermerBitmap(bmp); return; } // superséedé pendant le calcul → on jette le rendu, on ne peint pas
        rangerRendu(cle, bmp);
        peindreBitmap(canvas, bmp);
        origineRendu = 'peint';
      }
      setPage(p);
      // INSTRUMENTATION — console.INFO [Liseuse] : ORIGINE du document (réseau/cache/préchargé) + octets, ET phase RENDU avec son origine (peint / cache-rendu) et sa durée.
      if (typeof performance !== 'undefined') console.info(`[Liseuse] pièce ${pieceId} p${p} — ${origine} · ${octets} o · document ${Math.round(tDoc - t0)}ms · rendu ${origineRendu} ${Math.round(performance.now() - tRender0)}ms (canvas ${w}×${hgt})`);
    } catch { if (estCourant()) setMessage('impossible d’afficher la page (PDF illisible)'); }
    // LOT 24/25 — SORTIE : dans TOUS les cas (succès, erreur, pièce indisponible), on quitte « Chargement… » ET « Rendu… ». Jamais d'écran figé.
    finally { if (estCourant()) { setChargeReseau(null); setEnRendu(false); } }
  }, [pieceId, page, obtenirDoc, toucherCache, toucherRendu, rangerRendu]);

  // LOT 23 — PRÉCHARGEMENT en tâche de fond des pièces VOISINES du best-of (suivante puis précédente), SÉQUENTIEL, jamais en parallèle
  //   du chargement courant (déclenché en `requestIdleCallback` = quand le thread est oisif). Annulation propre au changement de plan/
  //   dossier et au démontage (ctrl.annule + annulerIdle). Nourrit le CACHE LRU → « suivant › » devient instantané.
  useEffect(() => {
    if (etat !== 'ok' || nav !== 'bestof' || bandeVisible.length === 0) return;
    const voisins = voisinsAPrecharger(bandeVisible.map((pl) => pl.pieceId), planIndex);
    if (voisins.length === 0) return;
    const ctrl = { annule: false };
    const handle = planifierIdle(async () => {
      for (const id of voisins) {
        if (ctrl.annule) return; // annulation propre : changement de plan/dossier ou démontage → le cleanup de l'effet a posé ctrl.annule, on arrête net
        if (cacheRef.current.has(id) || enCoursRef.current.has(id)) continue; // déjà en cache / déjà en vol → rien à faire
        try {
          await obtenirDoc(id, { precharge: true }); // SÉQUENTIEL : le voisin précédent n'est chargé qu'après la suivante
          const o = cacheRef.current.get(id)?.octets ?? 0;
          if (!ctrl.annule) console.info(`[Liseuse] préchargé pièce ${id} — ${o} o (tâche de fond)`);
        } catch { /* préchargement best-effort : jamais bloquant, aucune erreur remontée à l'utilisateur */ }
      }
    });
    return () => { ctrl.annule = true; annulerIdle(handle); };
  }, [etat, nav, planIndex, bandeVisible, obtenirDoc]);

  // LOT 23/24 — cache LRU : PURGE (destroy de tous les documents) au CHANGEMENT DE DOSSIER et au DÉMONTAGE (rien ne fuit ; genRef bumpé
  //   dans purgerCache invalide les chargements encore en vol). Idempotent sous StrictMode : la re-exécution recharge simplement depuis le
  //   réseau (le garde de cycle de vie n'est plus un flag « collant » — cf. pieceIdRef).
  useEffect(() => () => purgerCache(), [dossierId, purgerCache]);

  // Auto-affichage de la page courante au chargement (etat→ok) et à chaque changement de (pièce, page). Ref stable : ne pas se lier à afficherPage.
  const afficherPageRef = useRef(afficherPage);
  useEffect(() => { afficherPageRef.current = afficherPage; }, [afficherPage]);
  // PROJ-AGR — `imageAgrandie` dans les deps : basculer l'agrandi re-rend le canvas à la largeur de la nouvelle vue (le cache LRU des
  //   documents évite tout re-téléchargement ; seul le rendu est refait). Aucune capture de clic : la planche reste passive.
  useEffect(() => { if (etat === 'ok') void afficherPageRef.current(); }, [pieceId, page, etat, imageAgrandie]);
  // PROJ-AGR — Échap réduit l'agrandissement (sortie clavier).
  useEffect(() => {
    if (!imageAgrandie) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImageAgrandie(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageAgrandie]);

  // LOT 92 — la page ACTUELLEMENT affichée (dans les deux navs : best-of ou pièce libre) et son appartenance au best-of visible.
  const planAffiche = pieceId !== null ? (bandeVisible.find((pl) => pl.pieceId === pieceId && pl.page === page) ?? null) : null;
  const pageDansBestOf = planAffiche !== null;
  const runCourant = pieceId !== null ? runs[pieceId] : undefined; // LOT 62 — audit du repérage de la pièce courante
  // LOT 95 — audit daté de LA page affichée (si déjà analysée pour lire des valeurs) → sert l'avertissement « déjà analysée, relancer refera payer ».
  const lectureCourante = pieceId !== null ? (lectures[pieceId] ?? []).find((l) => l.page === page) ?? undefined : undefined;
  // LOT 99 — STATUT (3 axes) de LA page affichée, SOURCE UNIQUE (statutPageAnalyse). Entrées : IA grain PAGE (lectureCourante, mesuré),
  //   page écartée pendant le repérage (runCourant.pagesEcartees), repérage IA du FICHIER (dérivé), et identification SANS IA du fichier
  //   (famille/Cerfa connue → dérivé). L'extraction sans-IA de VALEURS est de fait au grain fichier → volontairement hors statut de page.
  const pieceCourante = pieceId !== null ? pieces.find((p) => p.id === pieceId) : undefined;
  const identifieeSansIa = !!pieceCourante && (pieceCourante.famille != null || pieceCourante.cerfa === true);
  const ecarteeReperage = runCourant?.pagesEcartees.find((e) => e.page === page);
  const statutPage = statutPageAnalyse({
    lecturePage: lectureCourante ? { envoyee: lectureCourante.envoyee, nbValeurs: lectureCourante.nbValeurs, motif: lectureCourante.motif, creeLe: lectureCourante.creeLe } : undefined,
    ecarteeReperage: ecarteeReperage ? { motif: ecarteeReperage.motif } : undefined,
    reperage: runCourant ? { creeLe: runCourant.creeLe } : undefined,
    identifieeSansIa,
    origineSansIa: origineSansIa ?? undefined, // LOT 100 — origine tracée (auto/manuelle) ; null → indéterminée (jamais présumée)
  }, (iso) => jourParisISO(iso));
  const resumePages = resumePagesAnalysees(lectures[pieceId ?? -1] ?? [], runCourant ? { creeLe: runCourant.creeLe } : undefined, (iso) => jourParisISO(iso));
  // LOT 97 — ÉTAT D'ANALYSE IA à DEUX AXES par pièce, pour la liste + sa pastille : COMBINE le repérage LOT 62 (grain PIÈCE = fichier
  //   complet, `runs`) et la lecture de valeurs LOT 95 (grain PAGE = partielle, `lectures`). Règle d'étendue + origine dans la fonction
  //   PURE `etatAnalyseIA` (le fichier complet prime ; origine 'manuelle' = fait sourcé, jamais 'auto' inventé). Date lisible Europe/Paris.
  // DEMANDE 3 — pièces ayant AU MOINS une page/image dans le best-of VISIBLE (bande = auto − retraits + ajouts) → marquées en bleu.
  const piecesBestOf = useMemo(() => new Set(bandeVisible.map((pl) => pl.pieceId)), [bandeVisible]);
  const analyseParPiece = useMemo<Record<number, EtatAnalyseIA>>(() => {
    const out: Record<number, EtatAnalyseIA> = {};
    const ids = new Set<number>([...Object.keys(runs).map(Number), ...Object.keys(lectures).map(Number)]);
    for (const id of ids) {
      const r = runs[id];
      const etat = etatAnalyseIA({
        reperage: r ? { nbPlanches: r.nbPlanches, creeLe: r.creeLe } : undefined,
        lectures: (lectures[id] ?? []).map((l) => ({ envoyee: l.envoyee, creeLe: l.creeLe })),
      }, (iso) => jourParisISO(iso));
      if (etat) out[id] = etat;
    }
    return out;
  }, [runs, lectures]);

  // LOT 62 — REPÉRER les planches de la pièce courante par ANALYSE D'IMAGE (bouton MANUEL). POST sous le verrou du LOT 58 (409 si une
  //   analyse tourne déjà). 401 → « reconnectez-vous ». Succès → on RECHARGE le best-of (vReper) : les planches image y entrent.
  const reperer = useCallback(async () => {
    if (pieceId === null || reperEnCours) return;
    setReperEnCours(true); setReperMsg(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reperer_planches', dossierId, pieceId }) });
      if (res.status === 401) { setReperMsg('Session expirée — reconnectez-vous.'); return; }
      if (res.status === 409) { setReperMsg('Une analyse de ce permis est déjà en cours.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; resume?: { planches: number; incertaines: number; ecartees: number } };
      if (!res.ok || !body.ok) { setReperMsg('Repérage impossible, réessayez.'); return; }
      const r = body.resume;
      setReperMsg(r ? `${r.planches} planche(s) repérée(s)${r.incertaines ? ` · ${r.incertaines} incertaine(s)` : ''}${r.ecartees ? ` · ${r.ecartees} page(s) écartée(s) par précaution` : ''}.` : 'Repérage terminé.');
      setVReper((v) => v + 1);
    } catch { setReperMsg('Repérage impossible, réessayez.'); }
    finally { setReperEnCours(false); }
  }, [pieceId, dossierId, reperEnCours]);

  // LOT 95 (B2) — LIRE DES VALEURS sur LA page affichée (une seule page → un seul appel vision). POST sous le verrou du LOT 58. 401 →
  //   reconnectez-vous ; 409 → analyse déjà en cours. Honnête : le message d'issue vient du serveur (écrit / à vérifier / déjà rempli /
  //   rien de lisible / page non envoyée). `bump vReper` recharge l'audit daté (« déjà analysée »). `ecrit` → propose l'annulation.
  //   L'issue est ANCRÉE à sa page (clé) → change de page = elle disparaît, sans reset dans un effet.
  const analyserPage = useCallback(async () => {
    if (pieceId === null || lectureEnCours || reperEnCours) return;
    const cle = `${pieceId}:${page}`;
    setLectureEnCours(true); setLectureRes(null);
    const poser = (texte: string, ecrit = false) => setLectureRes({ cle, texte, ecrit });
    const echouer = (texte: string) => setLectureRes({ cle, texte, ecrit: false, echec: true }); // capsule « analyse échouée » (jamais silencieux)
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lire_valeurs_page', dossierId, pieceId, page }) });
      if (res.status === 401) { echouer('Session expirée — reconnectez-vous.'); return; }
      if (res.status === 409) { echouer('Une analyse de ce permis est déjà en cours.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; resume?: { texte?: string; ecrit?: boolean; envoyee?: boolean } };
      if (!res.ok || !body.ok) { echouer('Analyse de la page impossible, réessayez.'); return; }
      poser(body.resume?.texte ?? 'Analyse terminée.', body.resume?.ecrit === true);
      // MISE À JOUR OPTIMISTE de l'audit local → capsule immédiate (« analysée, aucune valeur » si envoyee=false / nbValeurs=0), même
      //   avant le refetch. `setVReper` reconcilie ensuite avec la vérité serveur (audit daté « déjà analysée le … »).
      const envoyee = body.resume?.envoyee !== false;
      const nbValeurs = body.resume?.ecrit === true ? 1 : 0;
      setLectures((prev) => ({ ...prev, [pieceId]: [...(prev[pieceId] ?? []).filter((l) => l.page !== page), { page, envoyee, motif: null, nbValeurs, resume: body.resume?.texte ?? null, coutUsd: 0, creeLe: new Date().toISOString() }] }));
      setVReper((v) => v + 1); // recharge l'audit daté par page (état « déjà analysée le … »)
      if (body.resume?.ecrit === true) onValeurEcrite?.(); // une valeur a été écrite → un frère (CaracteristiquesBloc) doit re-fetcher son journal
    } catch { echouer('Analyse de la page impossible, réessayez.'); }
    finally { setLectureEnCours(false); }
  }, [pieceId, dossierId, page, lectureEnCours, reperEnCours, onValeurEcrite]);

  // LOT 95 — RÉVERSIBILITÉ : annuler la valeur écrite par « analyse de la page » (vide le champ + retire la ligne 'ia', jamais une saisie).
  const annulerValeurPage = useCallback(async () => {
    const cle = `${pieceId}:${page}`;
    const poser = (texte: string) => setLectureRes({ cle, texte, ecrit: false });
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annuler_lecture_page', dossierId }) });
      if (res.status === 401) { poser('Session expirée — reconnectez-vous.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; annule?: boolean };
      if (!res.ok || !body.ok) { poser('Annulation impossible, réessayez.'); return; }
      poser(body.annule ? 'Valeur annulée : le champ a été remis à vide.' : 'Rien à annuler (aucune valeur écrite par l’image, ou valeur saisie à la main protégée).');
      setVReper((v) => v + 1);
      if (body.annule === true) onValeurEcrite?.(); // valeur retirée → le frère (CaracteristiquesBloc) doit re-fetcher pour faire disparaître la proposition
    } catch { poser('Annulation impossible, réessayez.'); }
  }, [pieceId, page, dossierId, onValeurEcrite]);

  // LOT 65 — OUVRIR LE DOCUMENT COMPLET dans un nouvel onglet. Le lien SIGNÉ (durée de vie limitée) est fabriqué AU CLIC (jamais
  //   pré-généré au rendu de chaque plan : posé à l'avance, il serait périmé au moment du clic). Signeur UNIQUE `url_piece` (source
  //   'dossier' = GED), variante `inline` → ouverture dans le visionneur PDF ; on y ajoute `#page=N` (fragment JAMAIS signé → clé
  //   jamais exposée) pour cibler la page COURANTE (suit la navigation). 401 → « reconnectez-vous » ; échec → message, l'aperçu reste.
  const ouvrirDocumentComplet = useCallback(async () => {
    if (pieceId === null) return;
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source: 'dossier', inline: true }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !body.url) { setMessage('Ouverture du document impossible, réessayez.'); return; } // jamais un onglet vide sur une erreur brute
      window.open(page > 0 ? `${body.url}#page=${page}` : body.url, '_blank', 'noopener,noreferrer');
    } catch { setMessage('Ouverture du document impossible, réessayez.'); }
  }, [pieceId, page]);

  // LOT 61 — RETIRER la page courante du best-of (réversible). Optimiste-après-confirmation : on n'ôte de la SÉLECTION qu'après un
  //   POST réussi. 401 → « reconnectez-vous » ; échec transport → message honnête ; migration 190 absente (ok:false) → no-op SILENCIEUX
  //   (best-of complet, comportement d'avant). Après retrait, on se replace sur un plan visible (jamais un écran vide muet).
  const retirerDuBestOf = useCallback(async (pl: Plan) => {
    const k = cle(pl);
    setMessage(null);
    // LOT 92 — une page AJOUTÉE à la main se retire par DÉSINCLUSION (retour au calcul auto, pas d'exclusion résiduelle) ; une page AUTO
    //   se retire par EXCLUSION (réintégrable via la liste des retirées, LOT 61).
    const action = pl.manuel ? 'desinclure_page_bestof' : 'exclure_page_bestof';
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, pieceId: pl.pieceId, page: pl.page }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Retrait non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) return; // migration 190/194 absente → no-op silencieux (comportement d'avant, aucune fausse panne)
      const restantes = bandeVisible.filter((p) => cle(p) !== k);
      if (pl.manuel) setInclus((s) => { const n = new Set(s); n.delete(k); return n; });
      else setExclus((s) => { const n = new Set(s); n.add(k); return n; });
      // se replacer sur un plan visible (même position bornée) ; si le best-of est vide, rester en best-of (message dédié à l'écran).
      if (restantes.length > 0 && nav === 'bestof') { const i = Math.min(planIndex, restantes.length - 1); setPlanIndex(i); setPieceId(restantes[i].pieceId); setPage(restantes[i].page); }
    } catch { setMessage('Retrait non enregistré, réessayez.'); }
  }, [dossierId, bandeVisible, planIndex, nav]);

  // LOT 92 — AJOUTER la page courante au best-of (réversible, grain = LA PAGE). Miroir de retirerDuBestOf. Optimiste-après-confirmation :
  //   on n'ajoute à la SÉLECTION qu'après un POST réussi. migration 194 absente (ok:false) → no-op silencieux (comportement d'avant).
  const ajouterAuBestOf = useCallback(async (pieceId2: number, page2: number) => {
    const k = `${pieceId2}:${page2}`;
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inclure_page_bestof', dossierId, pieceId: pieceId2, page: page2 }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Ajout non enregistré, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) { setMessage('Ajout indisponible (mise à jour de la base requise).'); return; } // 194 non appliquée : on le DIT (jamais un bouton muet)
      setInclus((s) => { const n = new Set(s); n.add(k); return n; });
      setExclus((s) => { const n = new Set(s); n.delete(k); return n; }); // mutuellement exclusif : un ajout annule un retrait
    } catch { setMessage('Ajout non enregistré, réessayez.'); }
  }, [dossierId]);

  // LOT 61 — RÉINTÉGRER une page retirée (annule le retrait). Même politique d'erreur.
  const reintegrerDansBestOf = useCallback(async (pl: { pieceId: number; page: number }) => {
    const k = cle(pl);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reintegrer_page_bestof', dossierId, pieceId: pl.pieceId, page: pl.page }) });
      if (res.status === 401) { setMessage('Session expirée — reconnectez-vous.'); return; }
      if (!res.ok) { setMessage('Réintégration non enregistrée, réessayez.'); return; }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (body.ok === false) return;
      setExclus((s) => { const n = new Set(s); n.delete(k); return n; });
    } catch { setMessage('Réintégration non enregistrée, réessayez.'); }
  }, [dossierId]);

  // NAVIGATION — LIBRE : aucun travail de tracé à préserver, donc aucun garde « changement abandonne le travail » (contrairement à BlocTraceEmprise).
  const appliquerPlan = useCallback((cible: number) => {
    const r = cibleBestOf(bandeVisible, cible); // RÈGLE PARTAGÉE (sur la bande VISIBLE — LOT 61).
    setNav(r.nav);
    if (r.plan) { setPlanIndex(r.plan.index); setPieceId(r.plan.pieceId); setPage(r.plan.page); }
  }, [bandeVisible]);
  const ouvrirPieceLibre = useCallback((id: number) => { if (id <= 0) return; setNav('piece'); setPieceId(id); setPage(1); }, []);
  const changerPage = useCallback((delta: number) => setPage((p) => bornerPage(p + delta, nbPagesPiece)), [nbPagesPiece]);
  const retourBestOf = useCallback(() => appliquerPlan(planIndex), [appliquerPlan, planIndex]);

  // ZOOM / PAN — AFFICHAGE seul (CSS transform). Glisser (quand zoomé) déplace ; aucun clic ne « pose » rien : lecture seule.
  const zoomer = useCallback(() => setZoom((z) => Math.min(8, z * 1.25)), []);
  const dezoomer = useCallback(() => setZoom((z) => { const nz = Math.max(1, z / 1.25); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; }), []);
  const ajuster = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    pdfContainerRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { x0: e.clientX, y0: e.clientY, panX: pan.x, panY: pan.y };
  }, [zoom, pan]);
  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.x0), y: d.panY + (e.clientY - d.y0) });
  }, []);
  const onUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    pdfContainerRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  if (etat === 'charge') return <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Chargement de la liseuse…</p>;
  if (etat === 'erreur') return <p style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>Liseuse indisponible pour ce dossier.</p>;
  if (etat === 'vide') return <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Aucune pièce à afficher pour ce dossier.</p>;

  const nomCourant = pieces.find((p) => p.id === pieceId)?.nomFichier ?? 'pièce';

  // LOT « paire unique » — la navigation PRIMAIRE (best-of OU pièce libre) et « voir toutes les pièces » DESCENDENT sous l'image, dans la
  //   barre partagée (mêmes slots que « Bâtiments et projection » → disposition identique). L'UNIQUE paire ‹/› vit dans slotNav.
  const slotNav = nav === 'bestof' ? (
    <BandePlans bande={bandeVisible} index={planIndex} onPrecedent={() => appliquerPlan(planIndex - 1)} onSuivant={() => appliquerPlan(planIndex + 1)} />
  ) : (
    <NavPieceLibre page={page} nbPages={nbPagesPiece} onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} />
  );
  const slotPieces = (
    // Atteindre N'IMPORTE QUELLE pièce (le tri PROPOSE, il n'enferme jamais) ; l'ouvrir passe en nav « pièce libre » (page par page).
    <div>
      <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} aria-expanded={pleinListe} onClick={() => setPleinListe((v) => !v)}>
        {pleinListe ? 'masquer les autres pièces' : 'voir toutes les pièces du dossier'} {pleinListe ? '▲' : '▾'}
      </button>
      {pleinListe && (
        // LOT 91 — liste BORNÉE (défilement interne) : ~70 pièces ne repoussent plus l'aperçu hors du champ. Scroll natif → aucune
        //   animation (prefers-reduced-motion respecté d'office). La ligne cliquée reste marquée (aria-current, LOT 64).
        <div style={{ marginTop: '.3rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* LOT 64 — liste EXPLICITE : toutes les pièces, non analysées par image en tête, état par ligne. */}
          <ListePiecesAnalyse pieces={pieces} analyseParPiece={analyseParPiece} nonSupportees={piecesNonSupportees} pieceId={pieceId} onChoisir={(id) => ouvrirPieceLibre(id)} piecesBestOf={piecesBestOf} />
        </div>
      )}
    </div>
  );
  // DEMANDE 1 — LIGNE D'OUTILS AU-DESSUS DE L'IMAGE (parité avec « Bâtiments et projection », sans schéma côté planche) : zoom + « mode
  //   grandes images » (ex-« Agrandir l'image », RENOMMÉ). PASSIVE : « grandes images » n'ouvre qu'un aperçu plein écran (aucun tracé).
  const ligneOutils = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
      <ZoomPdf zoom={zoom} onDezoom={dezoomer} onZoom={zoomer} onAjuster={ajuster} />
      <button type="button" style={{ cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', padding: '.2rem .6rem', fontSize: 12 }}
        onClick={() => setImageAgrandie((v) => !v)} aria-label={imageAgrandie ? 'Quitter le mode grandes images' : 'Activer le mode grandes images'}>{imageAgrandie ? '✕ quitter les grandes images' : '⤢ mode grandes images'}</button>
    </div>
  );

  return (
    // MOBILE-FIRST : flex-wrap → deux colonnes en large (nav ~1/3, aperçu ~2/3), EMPILÉES en écran étroit (la nav passe AU-DESSUS de l'aperçu).
    //   Chaque colonne a minWidth:0 et le canvas fait width:100% de SA colonne → jamais de débordement horizontal de la page.
    <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Liseuse des pièces</div>
        {/* LOT « paire unique » + demande 2c — navigation, « voir toutes les pièces », zoom et « agrandir » ont TOUS quitté cette colonne :
            ils descendent SOUS l'aperçu, dans la barre partagée (slotNav / slotPieces) ; le zoom + « mode grandes images » sont AU-DESSUS
            de l'image (ligneOutils, demande 1). Cette colonne ne porte que le titre. */}
      </div>
      {/* LOT 91 — APERÇU COLLANT : sur écran LARGE (colonnes côte à côte), le panneau d'aperçu SUIT le défilement (position sticky) →
          un clic sur n'importe quelle ligne, même tout en bas, affiche la page SANS remonter. Sur écran ÉTROIT (colonnes empilées via
          flex-wrap), `top` n'a d'effet qu'une fois l'aperçu atteint : combiné à la liste bornée ci-dessus, l'aperçu reste à portée
          (l'aperçu vient sous la liste bornée). `alignSelf:flex-start` : le sticky s'ancre en haut de la colonne, pas étiré. */}
      {/* PROJ-AGR — colonne d'aperçu ; en agrandi, elle passe en PLEIN ÉCRAN (CSS). PASSIVE : aucun clic n'y pose de point (parité du geste
          « Agrandir l'image » avec « Bâtiments et projection », mais sans tracé côté planche). */}
      <div role={imageAgrandie ? 'dialog' : undefined} aria-modal={imageAgrandie || undefined} aria-label={imageAgrandie ? 'Aperçu agrandi' : undefined}
        style={imageAgrandie
          ? { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--color-svv-surface)', padding: '1rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.4rem' }
          : { flex: '2 1 300px', minWidth: 0, position: 'sticky', top: '.5rem', alignSelf: 'flex-start' }}>
        {/* DEMANDE 1 — LIGNE D'OUTILS au-dessus de l'aperçu : zoom + « mode grandes images » (remontés de la barre). */}
        {ligneOutils}
        {/* LOT 91 — aucune pièce sélectionnée → le dire explicitement (jamais un cadre vide muet, règle LOT 71). */}
        {pieceId === null && <p role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '0 0 .3rem' }}>Aucun aperçu ouvert : choisissez une pièce (best-of ci-contre ou « voir toutes les pièces du dossier »).</p>}
        <div ref={pdfContainerRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          style={{ position: 'relative', minHeight: '8rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', overflow: 'hidden', background: 'var(--color-svv-field)', touchAction: zoom > 1 ? 'none' : 'auto', cursor: zoom > 1 ? 'grab' : 'default' }}>
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </div>
          {/* RETOUR VISUEL : recouvre le document (inset:0) — le conteneur garde sa hauteur → aucun saut de mise en page. Texte seul (mobile-first,
              lisible en portrait) : aucune animation → prefers-reduced-motion respecté d'office. DEUX phases DISTINCTES, jamais confondues :
              « Chargement… » = RÉSEAU (LOT 23) ; « Rendu… » = CALCUL pdf.js hors écran (LOT 25) → l'écran ne ment pas sur ce qui se passe. */}
          {(chargeReseau || enRendu) && (
            <div aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center', background: 'var(--color-svv-field)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-svv-ink)' }}>
                {chargeReseau ? `Chargement…${chargeReseau.pct !== null ? ` ${chargeReseau.pct} %` : ''}` : 'Rendu…'}
              </span>
            </div>
          )}
          {/* LOT 94 — la bascule best-of au grain PAGE n'est PLUS en surimpression sur l'aperçu (elle l'était aux LOTs 61/92) : elle vit
              maintenant dans la BARRE DE COMMANDES sous l'image (② ci-dessous), hors canvas → tokens de thème. Le canvas reste NU. */}
        </div>
        {/* LOT 94 / INCRÉMENT-2 — BARRE DE COMMANDES sous l'aperçu : composant PARTAGÉ (une seule vérité) avec « Bâtiments et projection ».
            Actions serveur inchangées (ouvrirDocumentComplet/changerPage/retirer/ajouterAuBestOf/reperer/analyserPage/annulerValeurPage). */}
        <BarreVisionneusePieces pieceId={pieceId} nomCourant={nomCourant} page={page} nbPagesPiece={nbPagesPiece} echelle={planAffiche?.echelle ?? null}
          nav={nav} slotNav={slotNav} slotPieces={slotPieces}
          onOuvrirDocument={() => void ouvrirDocumentComplet()} onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} onRetourBestOf={retourBestOf}
          pageDansBestOf={pageDansBestOf} onRetirerBestOf={() => { if (planAffiche) void retirerDuBestOf(planAffiche!); }} onAjouterBestOf={() => { if (pieceId !== null) void ajouterAuBestOf(pieceId, page); }}
          statutPage={statutPage} resumePages={resumePages} pleinPagesAnalysees={pleinPagesAnalysees} onTogglePleinPages={() => setPleinPagesAnalysees((v) => !v)}
          runCourant={runCourant} lectureCourante={lectureCourante} reperEnCours={reperEnCours} lectureEnCours={lectureEnCours}
          onAnalyseFichier={() => void reperer()} onAnalysePage={() => void analyserPage()} reperMsg={reperMsg} lectureRes={lectureRes} onAnnulerValeur={() => void annulerValeurPage()} />
        {message && <p role="alert" style={{ fontSize: 11, color: 'var(--color-svv-red)', margin: '.3rem 0 0' }}>{message}</p>}
        {/* LOT 61 — le best-of est vide APRÈS retraits (jamais un écran muet) : on le DIT et on invite à réintégrer via la liste ci-dessous. */}
        {nav === 'bestof' && bandeVisible.length === 0 && retirees.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Toutes les pages du best-of ont été retirées. Réintégrez-en une ci-dessous pour la revoir.</p>
        )}
        {/* LOT 61 — COMPTEUR VISIBLE + RÉVERSIBILITÉ : liste des pages retirées, chacune réintégrable. Un best-of amputé n'est jamais silencieux. */}
        {retirees.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-svv-muted)', margin: '.4rem 0 0', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            <span>{retirees.length} page{retirees.length > 1 ? 's' : ''} retirée{retirees.length > 1 ? 's' : ''} du best-of (le document reste en GED) :</span>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
              {retirees.map((pl) => (
                <li key={`${pl.pieceId}:${pl.page}`} style={{ wordBreak: 'break-word' }}>
                  {pl.nomFichier} — page {pl.page}{' '}
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }} onClick={() => void reintegrerDansBestOf(pl)}>réintégrer</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* LOT 96 — COMPTEUR + RÉVERSIBILITÉ des pages AJOUTÉES à la main (miroir des retirées) : la liste est REPLIÉE PAR DÉFAUT (une seule
            ligne portant le compte, pour ne pas prendre de place) et s'ouvre au clic. 0 ajout → rien du tout (jamais « 0 page ajoutée »). Un
            SEUL clic pour déplier, aucune animation (repliable natif → prefers-reduced-motion respecté d'office). La bascule « retirer » du
            détail reste celle du LOT 92 (retirerDuBestOf), strictement inchangée. Zone hors canvas → tokens de thème (clair ET sombre). */}
        {ajoutees.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-svv-muted)', margin: '.4rem 0 0', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 11, color: 'var(--color-svv-muted)', alignSelf: 'flex-start' }}
              aria-expanded={pleinAjoutees} onClick={() => setPleinAjoutees((v) => !v)}>
              {ajoutees.length} page{ajoutees.length > 1 ? 's' : ''} ajoutée{ajoutees.length > 1 ? 's' : ''} au best-of à la main {pleinAjoutees ? '▲' : '▾'}
            </button>
            {pleinAjoutees && (
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                {ajoutees.map((pl) => (
                  <li key={`${pl.pieceId}:${pl.page}`} style={{ wordBreak: 'break-word' }}>
                    {pl.nomFichier} — page {pl.page}{' '}
                    <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }} onClick={() => void retirerDuBestOf(pl)}>retirer</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
