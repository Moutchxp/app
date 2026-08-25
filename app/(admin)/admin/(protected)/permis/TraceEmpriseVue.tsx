'use client';

import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, cadreDeAnneaux,
  inverseDepuisBoite, type Boite, type PaireCalage, type PointPlan, type PointLambert, type VerdictCalage, type VerdictVraisemblance,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace } from './TraceEmpriseRendu';

/**
 * PROJ-2 — écran CLIENT du tracé manuel assisté d'une emprise, calé sur la parcelle. La glue impérative (rendu PDF + clics)
 * est MINCE et suit le patron éprouvé de `verifier/PdfViewer` (pdf.js legacy, worker /public). 🔴 TOUTE la géométrie
 * (similitude, aire, résidu, vraisemblance) vient du module PUR `calageEmprise` — les handlers ne font que POSER l'état.
 * Un clic est converti en points PDF user-space (y-HAUT, comme le Lambert) via `convertToPdfPoint` → pas de réflexion.
 */

interface Piece { id: number; nomFichier: string; typeMime: string | null }
interface Contexte { empreinteAnneaux: [number, number][][] | PointLambert[][]; surfaceTerrainM2: number | null; surfacePlancherM2: number | null; nbEtages: number | null }
type Mode = 'calage' | 'trace';

const BOITE_L = 340, BOITE_H = 260, BOITE_MARGE = 14;

export function TraceEmpriseVue() {
  const [dossierIdSaisi, setDossierIdSaisi] = useState('');
  const [dossierId, setDossierId] = useState<number | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [emprises, setEmprises] = useState<EmpriseReconstruite[]>([]);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [libelle, setLibelle] = useState('');
  const [ratioDeclareSaisi, setRatioDeclareSaisi] = useState('');
  const [mode, setMode] = useState<Mode>('calage');
  const [paires, setPaires] = useState<PaireCalage[]>([]);
  const [planEnAttente, setPlanEnAttente] = useState<PointPlan | null>(null); // point plan cliqué, en attente de son Lambert (clic schéma)
  const [sommets, setSommets] = useState<PointPlan[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // viewport pdf.js de la page rendue (EN STATE, pas en ref : le sur-couche le lit AU RENDU) : porte convertToPdfPoint /
  // convertToViewportPoint (device px) ; `ratio` = device/CSS.
  type Apercu = { vp: { convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] }; ratio: number };
  const [apercu, setApercu] = useState<Apercu | null>(null);

  // Parcelle + cadre + boîte de projection MÉMOÏSÉS sur le contexte (stables entre rendus → deps de handlers stables).
  const { parcelle, boite } = useMemo(() => {
    const par: PointLambert[][] = (contexte?.empreinteAnneaux ?? []).map((a) =>
      (a as unknown[]).map((p) => Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as PointLambert)));
    const cadre = cadreDeAnneaux(par);
    const b: Boite | null = cadre ? { largeur: BOITE_L, hauteur: BOITE_H, marge: BOITE_MARGE, cadre } : null;
    return { parcelle: par, boite: b };
  }, [contexte]);

  const ratioDeclare = (() => { const n = Number(ratioDeclareSaisi.replace(',', '.')); return ratioDeclareSaisi.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; })();
  const sim = calculerSimilitude(paires);
  const anneauLambert = sim && sommets.length >= 3 ? anneauVersLambert(sim, sommets) : null;
  const aire = anneauLambert ? aireM2(anneauLambert) : null;
  const vc: VerdictCalage | null = sim ? verdictCalage(sim, paires, ratioDeclare) : null;
  const vv: VerdictVraisemblance | null = aire !== null ? verdictVraisemblance({ aireM2: aire, surfacePlancherM2: contexte?.surfacePlancherM2 ?? null, nbEtages: contexte?.nbEtages ?? null, surfaceTerrainM2: contexte?.surfaceTerrainM2 ?? null }) : null;

  const charger = useCallback(async (id: number) => {
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch(`/api/admin/permis/emprise?dossierId=${id}`);
      if (!res.ok) { setMessage('dossier introuvable ou indisponible'); return; }
      const j = await res.json() as { pieces: Piece[]; emprises: EmpriseReconstruite[]; contexte: Contexte };
      setDossierId(id); setPieces(j.pieces); setEmprises(j.emprises); setContexte(j.contexte);
      setPieceId(j.pieces[0]?.id ?? null);
    } catch { setMessage('erreur de chargement'); } finally { setOccupe(false); }
  }, []);

  const afficherPage = useCallback(async () => {
    if (pieceId === null) return;
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signer_piece', pieceId }) });
      if (!res.ok) { setMessage('pièce indisponible'); return; }
      const { url } = await res.json() as { url: string };
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument(url).promise;
      const p = Math.min(Math.max(1, page), pdf.numPages);
      const pageObj = await pdf.getPage(p);
      const canvas = canvasRef.current; if (!canvas) return;
      const largeurCss = canvas.parentElement?.clientWidth || 640;
      const base = pageObj.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const scale = (largeurCss / base.width) * dpr;
      const viewport = pageObj.getViewport({ scale });
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      setApercu({ vp: viewport as unknown as Apercu['vp'], ratio: canvas.width / (canvas.getBoundingClientRect().width || largeurCss) });
      setPage(p);
    } catch { setMessage('impossible d’afficher la page (PDF illisible)'); } finally { setOccupe(false); }
  }, [pieceId, page]);

  // Clic sur le PDF → point PDF user-space (y-haut). En mode calage : point plan en attente de son Lambert. En trace : sommet.
  const cliquerPdf = useCallback((ev: ReactMouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current; if (!canvas || !apercu) return;
    const r = canvas.getBoundingClientRect();
    const devX = (ev.clientX - r.left) * apercu.ratio, devY = (ev.clientY - r.top) * apercu.ratio;
    const [px, py] = apercu.vp.convertToPdfPoint(devX, devY);
    if (mode === 'trace') setSommets((s) => [...s, { x: px, y: py }]);
    else setPlanEnAttente({ x: px, y: py });
  }, [mode, apercu]);

  // Clic sur le schéma parcelle → Lambert (inverse de la projection). Complète la paire de calage si un point plan attend.
  const cliquerSchema = useCallback((pxBoite: { x: number; y: number }) => {
    if (mode !== 'calage' || !boite || !planEnAttente) return;
    const lambert = inverseDepuisBoite(boite, pxBoite);
    setPaires((ps) => [...ps, { plan: planEnAttente, lambert }]);
    setPlanEnAttente(null);
  }, [mode, boite, planEnAttente]);

  const enregistrer = useCallback(async () => {
    if (dossierId === null || !sim || sommets.length < 3 || libelle.trim() === '') { setMessage('libellé, 2 points de calage et un contour ≥ 3 sommets requis'); return; }
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enregistrer', dossierId, libelle: libelle.trim(), pieceId, page, anneauPlan: sommets, paires, ratioDeclare }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'enregistrement refusé'); return; }
      setEmprises(j.emprises ?? []); setSommets([]); setLibelle(''); setMessage('emprise reconstituée enregistrée');
    } catch { setMessage('erreur d’enregistrement'); } finally { setOccupe(false); }
  }, [dossierId, sim, sommets, libelle, pieceId, page, paires, ratioDeclare]);

  const supprimer = useCallback(async (id: number) => {
    if (dossierId === null) return;
    const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'supprimer', dossierId, id }) });
    const j = await res.json() as { emprises?: EmpriseReconstruite[] };
    if (res.ok) setEmprises(j.emprises ?? []);
  }, [dossierId]);

  // Overlay : positions CSS des points plan / sommets (plan y-haut → viewport device px → CSS px). Lit `apercu` (state).
  const versCss = (p: PointPlan): { x: number; y: number } | null => {
    if (!apercu) return null;
    const [vx, vy] = apercu.vp.convertToViewportPoint(p.x, p.y);
    return { x: vx / apercu.ratio, y: vy / apercu.ratio };
  };
  const cssSommets = sommets.map(versCss).filter((q): q is { x: number; y: number } => q !== null);
  const cssPaires = paires.map((pr) => versCss(pr.plan)).filter((q): q is { x: number; y: number } => q !== null);
  const cssAttente = planEnAttente ? versCss(planEnAttente) : null;

  const styleCarte = { border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.6rem .8rem' };
  const btn = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.3rem .7rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...styleCarte }}>
        <p style={{ margin: '0 0 .4rem', fontWeight: 600 }}>Tracé manuel assisté d’une emprise <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}>— reconstitution calée sur la parcelle (jamais une mesure)</span></p>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>Dossier (id) : <input inputMode="numeric" value={dossierIdSaisi} onChange={(e) => setDossierIdSaisi(e.target.value)} style={{ width: 120 }} /></label>
          <button type="button" style={btn} disabled={occupe} onClick={() => { const n = Number(dossierIdSaisi); if (Number.isInteger(n) && n > 0) void charger(n); }}>Charger</button>
          {message && <span style={{ color: 'var(--color-svv-red)', fontSize: 13 }}>{message}</span>}
        </div>
      </div>

      {dossierId !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '1rem' }}>
          {/* Colonne PDF */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={pieceId ?? ''} onChange={(e) => setPieceId(Number(e.target.value) || null)} style={{ maxWidth: 260 }}>
                {pieces.length === 0 && <option value="">aucune pièce PDF</option>}
                {pieces.map((p) => <option key={p.id} value={p.id}>{p.nomFichier}</option>)}
              </select>
              <label>page <input type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} style={{ width: 60 }} /></label>
              <button type="button" style={btn} disabled={occupe || pieceId === null} onClick={() => void afficherPage()}>Afficher la page</button>
            </div>
            <div style={{ position: 'relative', ...styleCarte, padding: 0, overflow: 'hidden' }} onClick={cliquerPdf}>
              <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {cssSommets.length >= 2 && <polyline points={cssSommets.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(163,4,2,.12)" stroke="var(--color-svv-red)" strokeWidth={2} />}
                {cssSommets.map((q, i) => <circle key={`s${i}`} cx={q.x} cy={q.y} r={3.5} fill="var(--color-svv-red)" />)}
                {cssPaires.map((q, i) => <g key={`c${i}`}><rect x={q.x - 5} y={q.y - 5} width={10} height={10} fill="none" stroke="#1f77b4" strokeWidth={2} /><text x={q.x + 7} y={q.y - 7} fontSize={12} fill="#1f77b4">{i + 1}</text></g>)}
                {cssAttente && <circle cx={cssAttente.x} cy={cssAttente.y} r={5} fill="none" stroke="#1f77b4" strokeWidth={2} strokeDasharray="3 2" />}
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-muted)' }}>
              {mode === 'calage'
                ? (planEnAttente ? 'Point plan posé : cliquez maintenant le point correspondant sur le schéma de la parcelle →' : 'Mode calage : cliquez un point connu sur le plan (angle de parcelle…), puis son correspondant sur le schéma.')
                : 'Mode tracé : cliquez les sommets de l’emprise ; fermez avec « Enregistrer ».'}
            </p>
          </div>

          {/* Colonne contrôles + schéma + mesures */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button type="button" style={{ ...btn, fontWeight: mode === 'calage' ? 700 : 400 }} onClick={() => setMode('calage')}>Calage ({paires.length}/2)</button>
              <button type="button" style={{ ...btn, fontWeight: mode === 'trace' ? 700 : 400 }} onClick={() => setMode('trace')}>Tracé ({sommets.length})</button>
              <button type="button" style={btn} onClick={() => mode === 'trace' ? setSommets((s) => s.slice(0, -1)) : (planEnAttente ? setPlanEnAttente(null) : setPaires((p) => p.slice(0, -1)))}>Annuler dernier</button>
              <button type="button" style={btn} onClick={() => { setSommets([]); setPaires([]); setPlanEnAttente(null); }}>Reprendre à zéro</button>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label>Bâtiment : <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="2D1" style={{ width: 90 }} /></label>
              <label>Échelle déclarée 1: <input inputMode="numeric" value={ratioDeclareSaisi} onChange={(e) => setRatioDeclareSaisi(e.target.value)} placeholder="200" style={{ width: 70 }} /></label>
            </div>
            <BandeauCalage calage={vc} nbPaires={paires.length} />
            <BandeauVraisemblance aireM2={aire} v={vv} />
            <button type="button" style={{ ...btn, background: 'var(--color-svv-red)', color: '#fff', borderColor: 'var(--color-svv-red)' }} disabled={occupe || !sim || sommets.length < 3 || libelle.trim() === ''} onClick={() => void enregistrer()}>Enregistrer l’emprise (reconstitution)</button>
            <div style={styleCarte}>
              <p style={{ margin: '0 0 .4rem', fontWeight: 600 }}>Parcelle & emprises</p>
              <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} calageLambert={paires.map((p) => p.lambert)} onCliquer={mode === 'calage' && planEnAttente ? cliquerSchema : undefined} />
            </div>
            <ListeEmprises emprises={emprises} onSupprimer={supprimer} />
          </div>
        </div>
      )}
    </div>
  );
}
