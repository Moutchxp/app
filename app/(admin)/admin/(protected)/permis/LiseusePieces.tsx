'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist'; // type SEUL (erasé au runtime) : pdf.js reste importé DYNAMIQUEMENT dans afficherPage
import {
  construireBandePlans, cibleBestOf, bornerPage,
  SelecteurPiecePlan, BandePlans, NavPieceLibre, ZoomPdf,
  type PiecePlan, type Plan,
} from './TraceEmpriseRendu';

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
export function LiseusePieces({ dossierId }: { dossierId: number }) {
  const [pieces, setPieces] = useState<PiecePlan[]>([]);
  const [etat, setEtat] = useState<'charge' | 'ok' | 'vide' | 'erreur'>('charge');
  const [bande, setBande] = useState<Plan[]>([]);
  const [nav, setNav] = useState<'bestof' | 'piece'>('bestof');
  const [planIndex, setPlanIndex] = useState(0);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [nbPagesPiece, setNbPagesPiece] = useState(1);
  const [pleinListe, setPleinListe] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; panX: number; panY: number } | null>(null);
  // LOT 22 (C) — CACHES pour ne pas « recomposer » à chaque page : le module pdf.js (chargé UNE fois) et le DOCUMENT parsé (par pièce).
  //   Le changement de PAGE ne re-télécharge/re-parse plus le PDF ; seul un changement de PIÈCE recharge le document.
  const pdfjsRef = useRef<typeof import('pdfjs-dist') | null>(null);
  const docRef = useRef<{ pieceId: number; doc: PDFDocumentProxy } | null>(null);

  // CHARGEMENT PARESSEUX : cet effet ne part qu'À LA MONTÉE — or le composant n'est monté qu'à l'OUVERTURE de la famille (le `contenu`
  //   de BlocRepliable est un thunk appelé au dépli). Donc rien tant que la famille est repliée, et jamais au rendu de la liste des demandes.
  //   Même source que BlocTraceEmprise (GET /emprise) → mêmes pièces enrichies (propose/famille/planches) que le best-of ; per-dossier, aucun WHERE sur `dem`.
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/emprise?dossierId=${dossierId}`);
        if (!res.ok) { if (vivant) setEtat('erreur'); return; }
        const j = await res.json() as { pieces?: PiecePlan[] };
        if (!vivant) return;
        const ps = j.pieces ?? [];
        setPieces(ps);
        if (ps.length === 0) { setEtat('vide'); return; }
        const b = construireBandePlans(ps); // RÈGLE PARTAGÉE — sélection/ordre du best-of, jamais recodée ici.
        setBande(b);
        setNav('bestof'); setPlanIndex(0);
        setPieceId(b[0]?.pieceId ?? ps[0]?.id ?? null); // ouverture DIRECTE sur le plan le mieux classé (ou 1re pièce à défaut).
        setPage(b[0]?.page ?? 1);
        setPleinListe(b.length <= 1);
        setEtat('ok');
      } catch { if (vivant) setEtat('erreur'); }
    })();
    return () => { vivant = false; };
  }, [dossierId]);

  // RENDU PDF — NEUF (jumeau assumé de BlocTraceEmprise). pdf.js est importé DYNAMIQUEMENT (jamais au top du module) → réellement paresseux.
  //   Pur affichage : AUCUNE conversion écran→PDF, aucun overlay de tracé. On lit la pièce (URL signée) et on peint la page dans le canvas.
  const afficherPage = useCallback(async () => {
    if (pieceId === null) return;
    setOccupe(true); setMessage(null); setZoom(1); setPan({ x: 0, y: 0 });
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    try {
      // 1) MODULE pdf.js — importé DYNAMIQUEMENT (paresseux) mais UNE SEULE fois (mémorisé), plus à chaque page.
      if (!pdfjsRef.current) {
        const m = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
        m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        pdfjsRef.current = m;
      }
      const tModule = (typeof performance !== 'undefined' ? performance.now() : 0);
      // 2) DOCUMENT — téléchargé + parsé UNE FOIS PAR PIÈCE. Un changement de PAGE réutilise le document en cache (aucun re-téléchargement).
      if (docRef.current?.pieceId !== pieceId) {
        const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signer_piece', pieceId }) });
        if (!res.ok) { setMessage('pièce indisponible'); return; }
        const { url } = await res.json() as { url: string };
        void docRef.current?.doc.destroy(); // libère le document précédent (worker pdf.js)
        docRef.current = { pieceId, doc: await pdfjsRef.current.getDocument(url).promise };
      }
      const tDoc = (typeof performance !== 'undefined' ? performance.now() : 0);
      const pdf = docRef.current.doc;
      setNbPagesPiece(pdf.numPages);
      const p = Math.min(Math.max(1, page), pdf.numPages);
      const pageObj = await pdf.getPage(p);
      const canvas = canvasRef.current; if (!canvas) return;
      const largeurCss = canvas.parentElement?.clientWidth || 480;
      const base = pageObj.getViewport({ scale: 1 });
      // 3) ÉCHELLE ADAPTÉE À L'AFFICHAGE (point 8) : largeur affichée × densité écran, densité BORNÉE à 2 et largeur du canvas PLAFONNÉE
      //   (≤ MAX_PX) pour ne jamais peindre un canvas démesuré. Rendu de la SEULE page visible (pas de couche texte/annotations : lecture seule).
      const MAX_PX = 2400;
      const dprEff = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      const scale = Math.min((largeurCss / base.width) * dprEff, MAX_PX / base.width);
      const viewport = pageObj.getViewport({ scale });
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      setPage(p);
      // INSTRUMENTATION (point 6) — durées par phase, lisibles dans la console du navigateur (module chargé 1×, doc mis en cache par pièce).
      if (typeof performance !== 'undefined') console.debug(`[Liseuse] pièce ${pieceId} p${p} — module ${Math.round(tModule - t0)}ms · document ${Math.round(tDoc - tModule)}ms · rendu ${Math.round(performance.now() - tDoc)}ms (canvas ${canvas.width}×${canvas.height})`);
    } catch { setMessage('impossible d’afficher la page (PDF illisible)'); } finally { setOccupe(false); }
  }, [pieceId, page]);

  // LOT 22 (C) — au démontage (famille repliée / fiche fermée) : libère le document pdf.js en cache (worker) pour ne rien laisser fuir.
  useEffect(() => () => { void docRef.current?.doc.destroy(); docRef.current = null; }, []);

  // Auto-affichage de la page courante au chargement (etat→ok) et à chaque changement de (pièce, page). Ref stable : ne pas se lier à afficherPage.
  const afficherPageRef = useRef(afficherPage);
  useEffect(() => { afficherPageRef.current = afficherPage; }, [afficherPage]);
  useEffect(() => { if (etat === 'ok') void afficherPageRef.current(); }, [pieceId, page, etat]);

  // NAVIGATION — LIBRE : aucun travail de tracé à préserver, donc aucun garde « changement abandonne le travail » (contrairement à BlocTraceEmprise).
  const appliquerPlan = useCallback((cible: number) => {
    const r = cibleBestOf(bande, cible); // RÈGLE PARTAGÉE.
    setNav(r.nav);
    if (r.plan) { setPlanIndex(r.plan.index); setPieceId(r.plan.pieceId); setPage(r.plan.page); }
  }, [bande]);
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

  return (
    // MOBILE-FIRST : flex-wrap → deux colonnes en large (nav ~1/3, aperçu ~2/3), EMPILÉES en écran étroit (la nav passe AU-DESSUS de l'aperçu).
    //   Chaque colonne a minWidth:0 et le canvas fait width:100% de SA colonne → jamais de débordement horizontal de la page.
    <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Liseuse des pièces</div>
        {nav === 'bestof' ? (
          <BandePlans bande={bande} index={planIndex} onPrecedent={() => appliquerPlan(planIndex - 1)} onSuivant={() => appliquerPlan(planIndex + 1)} />
        ) : (
          <NavPieceLibre nomFichier={nomCourant} page={page} nbPages={nbPagesPiece} onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} onRetourBestOf={retourBestOf} />
        )}
        {/* Atteindre N'IMPORTE QUELLE pièce (le tri PROPOSE, il n'enferme jamais) ; l'ouvrir passe en nav « pièce libre » (page par page). */}
        <div>
          <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} aria-expanded={pleinListe} onClick={() => setPleinListe((v) => !v)}>
            {pleinListe ? 'masquer les autres pièces' : 'voir toutes les pièces du dossier'} {pleinListe ? '▲' : '▾'}
          </button>
          {pleinListe && (
            <div style={{ marginTop: '.3rem' }}>
              <SelecteurPiecePlan pieces={pieces} pieceId={pieceId} onChoisir={(id) => ouvrirPieceLibre(id)} />
            </div>
          )}
        </div>
        <ZoomPdf zoom={zoom} onDezoom={dezoomer} onZoom={zoomer} onAjuster={ajuster} />
      </div>
      <div style={{ flex: '2 1 300px', minWidth: 0 }}>
        <div ref={pdfContainerRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          style={{ position: 'relative', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', overflow: 'hidden', background: 'var(--color-svv-field)', touchAction: zoom > 1 ? 'none' : 'auto', cursor: zoom > 1 ? 'grab' : 'default' }}>
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </div>
        </div>
        {occupe && <p style={{ fontSize: 11, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Rendu de la page…</p>}
        {message && <p style={{ fontSize: 11, color: 'var(--color-svv-red)', margin: '.3rem 0 0' }}>{message}</p>}
      </div>
    </div>
  );
}
