'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react';
import {
  calculerSimilitude, anneauVersLambert, aireM2, verdictCalage, verdictVraisemblance, cadreDeAnneaux,
  inverseDepuisBoite, type Boite, type PaireCalage, type PointPlan, type PointLambert, type VerdictCalage, type VerdictVraisemblance,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments, type BatimentProjection, type VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, motStatutBatiment, affichageTrace, SelecteurPiecePlan, BandePlans, construireBandePlans, bornerIndex, indexSuivant, indexPrecedent, travailEnCours, NavPieceLibre, bornerPage } from './TraceEmpriseRendu';

/**
 * PROJ-2b — BLOC de tracé d'emprise INTÉGRÉ au détail d'un dossier de Rattachement, BÂTIMENT PAR BÂTIMENT. Le dossier vient de la
 * ligne (aucune saisie), les bâtiments viennent du permis (`batiments`). Pour chaque bâtiment : tracer une emprise OU ignorer la
 * projection (motif obligatoire, réversible). Le verdict (peut-on valider ?) remonte au parent via `onVerdict`, qui désactive le
 * bouton Valider. 🔴 Géométrie du module PUR `calageEmprise` (les handlers ne font que POSER l'état) ; enregistrement recalculé serveur.
 */

// PROJ-3d/3f — la pièce porte la PROPOSITION « plan de masse » (score par nom) + ses PLANCHES (pages hors cartouche, confirmées serveur).
interface Piece { id: number; nomFichier: string; typeMime: string | null; propose?: boolean; planches?: { page: number; echelle: string | null }[]; confirme?: boolean }
interface Contexte { empreinteAnneaux: [number, number][][] | PointLambert[][]; surfaceTerrainM2: number | null; surfacePlancherM2: number | null; nbEtages: number | null }
type Mode = 'calage' | 'trace';
type Apercu = { vp: { convertToPdfPoint(x: number, y: number): number[]; convertToViewportPoint(x: number, y: number): number[] }; ratio: number };

const BOITE_L = 300, BOITE_H = 230, BOITE_MARGE = 12;

export function BlocTraceEmprise({ dossierId, onVerdict, rafraichir = 0 }: {
  dossierId: number;
  onVerdict?: (v: VerdictProjection) => void;
  rafraichir?: number; // PROJ-3b — signal du parent : incrémenté quand l'instruction change (ajout de bâtiment) → recharge la liste
                       //   DÉFAUT 0 (jamais undefined) : le tableau de dépendances de l'effet garde une TAILLE CONSTANTE (PROJ-3b-fix ③).
}) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [batiments, setBatiments] = useState<BatimentProjection[]>([]);
  const [emprises, setEmprises] = useState<EmpriseReconstruite[]>([]);
  const [ignores, setIgnores] = useState<ProjectionIgnoree[]>([]);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [corpsSel, setCorpsSel] = useState<number | null>(null);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [ratioDeclareSaisi, setRatioDeclareSaisi] = useState('');
  const [mode, setMode] = useState<Mode>('calage');
  const [paires, setPaires] = useState<PaireCalage[]>([]);
  const [planEnAttente, setPlanEnAttente] = useState<PointPlan | null>(null);
  const [sommets, setSommets] = useState<PointPlan[]>([]);
  const [motifIgnore, setMotifIgnore] = useState('');
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  // PROJ-3b-fix ② — TROIS états de chargement distincts : une panne ne doit JAMAIS s'afficher comme « 0 bâtiment ».
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [rechargeLocal, setRechargeLocal] = useState(0); // bouton « Recharger » de la carte d'échec (taille de deps constante)
  // PROJ-3e — l'unité manipulée est LE PLAN : on feuillette une bande ordonnée (ordre de pertinence PROJ-3d), sans changer de fichier ni de page.
  const [planIndex, setPlanIndex] = useState(0);
  const [avertissement, setAvertissement] = useState<{ faire: () => void } | null>(null); // action différée quand un tracé/calage est en cours
  const [pleinListe, setPleinListe] = useState(false); // repli « voir toutes les pièces du dossier » (escape hatch, jamais un cul-de-sac)
  // PROJ-3f ① — DEUX navigations DISTINCTES : 'bestof' (bande des plans proposés) et 'piece' (feuilleter les pages d'une pièce ouverte au repli).
  const [nav, setNav] = useState<'bestof' | 'piece'>('bestof');
  const [nbPagesPiece, setNbPagesPiece] = useState(1); // nb de pages de la pièce courante (borne la nav pièce) — connu au rendu pdfjs, à la demande
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bande = useMemo(() => construireBandePlans(pieces), [pieces]);

  // Chargement (pièces PDF + emprises + ignorées + contexte) au changement de dossier.
  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement'); setMessage(null);
      try {
        const res = await fetch(`/api/admin/permis/emprise?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); setMessage('Bâtiments indisponibles (le serveur n’a pas répondu).'); return; }
        const j = await res.json() as { pieces: Piece[]; emprises: EmpriseReconstruite[]; ignores: ProjectionIgnoree[]; batiments: BatimentProjection[]; contexte: Contexte; indisponibles?: string[] };
        // Résilience serveur : « indisponible » ≠ « vide ». Si la lecture des BÂTIMENTS a échoué, on n'affiche JAMAIS « 0 bâtiment »
        //   (panne déguisée en donnée) → état d'échec explicite invitant à recharger.
        if (j.indisponibles?.includes('batiments')) { setEtat('erreur'); setMessage('Bâtiments indisponibles : rechargez.'); return; }
        setPieces(j.pieces); setEmprises(j.emprises); setIgnores(j.ignores); setBatiments(j.batiments ?? []); setContexte(j.contexte);
        // PROJ-3e — on ouvre DIRECTEMENT sur le 1er plan de la bande (le mieux classé) ; à défaut de plan proposé, la 1re pièce.
        const b = construireBandePlans(j.pieces);
        setNav('bestof'); setPlanIndex(0);
        setPieceId(b[0]?.pieceId ?? j.pieces[0]?.id ?? null);
        setPage(b[0]?.page ?? 1);
        // PROJ-3f (correction D) — bande PAUVRE (0 ou 1 planche) → on pré-déplie le repli pour offrir tout de suite l'accès à toute pièce/page.
        setPleinListe(b.length <= 1);
        setEtat('ok');
      } catch { if (!annule) { setEtat('erreur'); setMessage('Bâtiments indisponibles (erreur de chargement).'); } }
    })();
    return () => { annule = true; };
  }, [dossierId, rafraichir, rechargeLocal]);

  // Bâtiment EFFECTIF (dérivé, PAS un effet) : la sélection d'Arno si elle vise un bâtiment réel, sinon le PREMIER en attente,
  // sinon le premier. Évite un setState-dans-effet (cascade de rendus) : la valeur se recalcule quand les entrées changent.
  const corpsEffectif = useMemo(() => {
    if (corpsSel !== null && batiments.some((b) => b.corpsId === corpsSel)) return corpsSel;
    const attente = batiments.find((b) => statutBatiment(b.corpsId, emprises, ignores) === 'attente');
    return (attente ?? batiments[0])?.corpsId ?? null;
  }, [corpsSel, batiments, emprises, ignores]);

  // Verdict de projection → remonte au parent (bouton Valider). Mémoïsé : ne rejoue l'effet que si les entrées changent.
  const verdict = useMemo(() => verdictProjectionBatiments(batiments, emprises.map((e) => e.corpsId).filter((c): c is number => c !== null), ignores.map((i) => i.corpsId)), [batiments, emprises, ignores]);
  // PROJ-3b-fix ② — on ne remonte le verdict (donc le compteur « 0 bâtiment · 0 emprise ») QU'au succès du chargement :
  //   sur un échec, le parent ne doit pas afficher un « 0 » calculé sur une liste jamais chargée.
  useEffect(() => { if (etat === 'ok') onVerdict?.(verdict); }, [verdict, onVerdict, etat]);

  const parcelle: PointLambert[][] = useMemo(() => (contexte?.empreinteAnneaux ?? []).map((a) =>
    (a as unknown[]).map((p) => Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as PointLambert))), [contexte]);
  const boite: Boite | null = useMemo(() => { const c = cadreDeAnneaux(parcelle); return c ? { largeur: BOITE_L, hauteur: BOITE_H, marge: BOITE_MARGE, cadre: c } : null; }, [parcelle]);

  const ratioDeclare = (() => { const n = Number(ratioDeclareSaisi.replace(',', '.')); return ratioDeclareSaisi.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; })();
  const sim = calculerSimilitude(paires);
  const anneauLambert = sim && sommets.length >= 3 ? anneauVersLambert(sim, sommets) : null;
  const aire = anneauLambert ? aireM2(anneauLambert) : null;
  const vc: VerdictCalage | null = sim ? verdictCalage(sim, paires, ratioDeclare) : null;
  const vv: VerdictVraisemblance | null = aire !== null ? verdictVraisemblance({ aireM2: aire, surfacePlancherM2: contexte?.surfacePlancherM2 ?? null, nbEtages: contexte?.nbEtages ?? null, surfaceTerrainM2: contexte?.surfaceTerrainM2 ?? null }) : null;

  const batSel = batiments.find((b) => b.corpsId === corpsEffectif) ?? null;
  const empriseDuBat = emprises.filter((e) => e.corpsId === corpsEffectif);
  const ignoreDuBat = ignores.find((i) => i.corpsId === corpsEffectif) ?? null;

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
      setNbPagesPiece(pdf.numPages); // PROJ-3f ① — borne la nav pièce (connu à la demande, jamais un chargement en masse)
      const p = Math.min(Math.max(1, page), pdf.numPages);
      const pageObj = await pdf.getPage(p);
      const canvas = canvasRef.current; if (!canvas) return;
      const largeurCss = canvas.parentElement?.clientWidth || 560;
      const base = pageObj.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = pageObj.getViewport({ scale: (largeurCss / base.width) * dpr });
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      await pageObj.render({ canvasContext: ctx, viewport }).promise;
      setApercu({ vp: viewport as unknown as Apercu['vp'], ratio: canvas.width / (canvas.getBoundingClientRect().width || largeurCss) });
      setPage(p);
    } catch { setMessage('impossible d’afficher la page (PDF illisible)'); } finally { setOccupe(false); }
  }, [pieceId, page]);

  // PROJ-3e/3f — AUTO-AFFICHAGE de la page courante : au chargement (etat→ok) et à chaque changement de (pièce, page). Toute navigation
  //   (bande best-of OU pièce libre) ne fait que poser pieceId/page → cet effet rend. Ref stable pour ne pas se lier à afficherPage.
  const afficherPageRef = useRef(afficherPage);
  useEffect(() => { afficherPageRef.current = afficherPage; }, [afficherPage]);
  useEffect(() => { if (etat === 'ok') void afficherPageRef.current(); }, [pieceId, page, etat]);

  // PROJ-3e — CHANGER DE PAGE/PLAN sans perdre le travail en silence : un calage/tracé en cours → on diffère (confirmation inline) ;
  //   sinon on exécute. Le travail n'a de sens que sur SA page (points en espace-page) → on l'abandonne à l'échange (même règle qu'avant).
  const demanderChangement = useCallback((faire: () => void) => {
    if (travailEnCours(paires.length, sommets.length)) setAvertissement({ faire });
    else faire();
  }, [paires.length, sommets.length]);

  // Nav BEST-OF : va au plan `cible` de la bande (et repasse en mode best-of).
  const appliquerPlan = useCallback((cible: number) => {
    if (bande.length === 0) return;
    const i = bornerIndex(cible, bande.length);
    setNav('bestof'); setPlanIndex(i); setPieceId(bande[i].pieceId); setPage(bande[i].page);
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage'); // le travail était attaché au plan quitté
  }, [bande]);

  // PROJ-3f ① — Nav PIÈCE LIBRE : ouvrir une pièce quelconque (depuis le repli) en mode 'piece', à la page 1.
  const ouvrirPieceLibre = useCallback((id: number) => demanderChangement(() => {
    if (id <= 0) return;
    setNav('piece'); setPieceId(id); setPage(1);
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage');
  }), [demanderChangement]);

  // PROJ-3f ① — feuilleter les pages de la pièce courante, borné [1 ; nbPagesPiece].
  const changerPage = useCallback((delta: number) => demanderChangement(() => {
    setPage((p) => bornerPage(p + delta, nbPagesPiece));
    setPaires([]); setSommets([]); setPlanEnAttente(null); setMode('calage');
  }), [demanderChangement, nbPagesPiece]);

  // PROJ-3f ① — revenir au best-of : restaure le plan courant de la bande (repasse en mode best-of).
  const retourBestOf = useCallback(() => demanderChangement(() => appliquerPlan(planIndex)), [demanderChangement, appliquerPlan, planIndex]);

  const cliquerPdf = useCallback((ev: ReactMouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current; if (!canvas || !apercu) return;
    const r = canvas.getBoundingClientRect();
    const [px, py] = apercu.vp.convertToPdfPoint((ev.clientX - r.left) * apercu.ratio, (ev.clientY - r.top) * apercu.ratio);
    if (mode === 'trace') setSommets((s) => [...s, { x: px, y: py }]);
    else setPlanEnAttente({ x: px, y: py });
  }, [mode, apercu]);

  const cliquerSchema = useCallback((pxBoite: { x: number; y: number }) => {
    if (mode !== 'calage' || !boite || !planEnAttente) return;
    setPaires((ps) => [...ps, { plan: planEnAttente, lambert: inverseDepuisBoite(boite, pxBoite) }]);
    setPlanEnAttente(null);
  }, [mode, boite, planEnAttente]);

  const enregistrer = useCallback(async () => {
    if (!sim || sommets.length < 3 || corpsEffectif === null || !batSel) { setMessage('sélectionnez un bâtiment, calez (2 points) et tracez un contour ≥ 3 sommets'); return; }
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enregistrer', dossierId, corpsId: corpsEffectif, libelle: batSel.repere ?? `bâtiment ${corpsEffectif}`, pieceId, page, anneauPlan: sommets, paires, ratioDeclare }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'enregistrement refusé'); return; }
      setEmprises(j.emprises ?? []); if (j.ignores) setIgnores(j.ignores);
      setSommets([]); setMessage('emprise reconstituée enregistrée');
    } catch { setMessage('erreur d’enregistrement'); } finally { setOccupe(false); }
  }, [sim, sommets, corpsEffectif, batSel, dossierId, pieceId, page, paires, ratioDeclare]);

  const posterProjection = useCallback(async (action: 'ignorer' | 'retablir' | 'supprimer', corps: number, extra: Record<string, unknown> = {}) => {
    setOccupe(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, corpsId: corps, ...extra }) });
      const j = await res.json() as { ok?: boolean; erreur?: string; emprises?: EmpriseReconstruite[]; ignores?: ProjectionIgnoree[] };
      if (!res.ok || !j.ok) { setMessage(j.erreur ?? 'action refusée'); return; }
      if (j.emprises) setEmprises(j.emprises); if (j.ignores) setIgnores(j.ignores);
      if (action === 'ignorer') setMotifIgnore('');
    } catch { setMessage('action impossible'); } finally { setOccupe(false); }
  }, [dossierId]);

  // Overlay : positions CSS des points plan / sommets (lit `apercu` en state).
  const versCss = (p: PointPlan): { x: number; y: number } | null => {
    if (!apercu) return null;
    const [vx, vy] = apercu.vp.convertToViewportPoint(p.x, p.y);
    return { x: vx / apercu.ratio, y: vy / apercu.ratio };
  };
  const cssSommets = sommets.map(versCss).filter((q): q is { x: number; y: number } => q !== null);
  const cssPaires = paires.map((pr) => versCss(pr.plan)).filter((q): q is { x: number; y: number } => q !== null);
  const cssAttente = planEnAttente ? versCss(planEnAttente) : null;

  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };

  // PROJ-3b-fix ② — décision PURE (testée) : chargement · échec · succès-vide · prêt. « Aucun bâtiment » n'apparaît QU'au succès réel.
  const vue = affichageTrace(etat, batiments.length);
  if (vue === 'chargement') {
    return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des bâtiments…</div>;
  }
  if (vue === 'indisponible') {
    return (
      <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        <span>{message ?? 'Bâtiments indisponibles.'}</span>
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setRechargeLocal((n) => n + 1)}>Recharger</button>
      </div>
    );
  }
  if (vue === 'aucun-batiment') {
    return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Aucun bâtiment déclaré au permis : rien à tracer pour l’instant. Déclarez au moins un bâtiment ci-dessus (« + ajouter un bâtiment ») pour pouvoir tracer une emprise et valider la projection.</div>;
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises — reconstitution par bâtiment <span style={styleAide}>(jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span></div>
      <BandeauProjection verdict={verdict} />

      {/* Sélecteur de bâtiment : statut par bâtiment (mot + couleur d'appui). */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {batiments.map((b) => {
          const st = statutBatiment(b.corpsId, emprises, ignores);
          const actif = b.corpsId === corpsEffectif;
          return (
            <button key={b.corpsId} type="button" onClick={() => setCorpsSel(b.corpsId)}
              style={{ ...btn, fontWeight: actif ? 700 : 400, borderColor: actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }}>
              {b.repere ?? `bâtiment ${b.corpsId}`} — {motStatutBatiment(st)}
            </button>
          );
        })}
      </div>

      {batSel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '.8rem' }}>
          {/* Colonne PDF */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', minWidth: 0 }}>
            {/* PROJ-3f ① — DEUX navigations DISTINCTES, une seule visible à la fois, identifiée par son EN-TÊTE (les MOTS, pas la couleur). */}
            {nav === 'bestof' ? (
              <BandePlans bande={bande} index={planIndex}
                onPrecedent={() => demanderChangement(() => appliquerPlan(indexPrecedent(planIndex, bande.length)))}
                onSuivant={() => demanderChangement(() => appliquerPlan(indexSuivant(planIndex, bande.length)))} />
            ) : (
              <NavPieceLibre nomFichier={pieces.find((p) => p.id === pieceId)?.nomFichier ?? 'pièce'} page={page} nbPages={nbPagesPiece}
                onPagePrecedente={() => changerPage(-1)} onPageSuivante={() => changerPage(1)} onRetourBestOf={retourBestOf} />
            )}
            {avertissement && (
              <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Un calage ou un tracé est en cours — changer de page l’abandonnera.</span>
                <button type="button" style={btn} onClick={() => { avertissement.faire(); setAvertissement(null); }}>Changer quand même</button>
                <button type="button" style={btn} onClick={() => setAvertissement(null)}>Rester</button>
              </div>
            )}
            {/* Repli : atteindre N'IMPORTE QUELLE pièce (le tri PROPOSE, il n'enferme jamais) ; l'ouvrir passe en nav « pièce libre » (page par page). */}
            <div>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', fontSize: 12 }} aria-expanded={pleinListe} onClick={() => setPleinListe((v) => !v)}>
                {pleinListe ? 'masquer les autres pièces' : 'voir toutes les pièces du dossier'} {pleinListe ? '▲' : '▾'}
              </button>
              {pleinListe && (
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.3rem' }}>
                  <SelecteurPiecePlan pieces={pieces} pieceId={pieceId} onChoisir={(id) => ouvrirPieceLibre(id)} />
                  <span style={styleAide}>Ouvre la pièce et la feuillette page par page (‹ / › ci-dessus).</span>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', overflow: 'hidden' }} onClick={cliquerPdf}>
              <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {cssSommets.length >= 2 && <polyline points={cssSommets.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(163,4,2,.12)" stroke="var(--color-svv-red)" strokeWidth={2} />}
                {cssSommets.map((q, i) => <circle key={`s${i}`} cx={q.x} cy={q.y} r={3.5} fill="var(--color-svv-red)" />)}
                {cssPaires.map((q, i) => <g key={`c${i}`}><rect x={q.x - 5} y={q.y - 5} width={10} height={10} fill="none" stroke="#1f77b4" strokeWidth={2} /><text x={q.x + 7} y={q.y - 7} fontSize={12} fill="#1f77b4">{i + 1}</text></g>)}
                {cssAttente && <circle cx={cssAttente.x} cy={cssAttente.y} r={5} fill="none" stroke="#1f77b4" strokeWidth={2} strokeDasharray="3 2" />}
              </svg>
            </div>
            <p style={{ ...styleAide, margin: 0 }}>
              {mode === 'calage'
                ? (planEnAttente ? 'Point plan posé : cliquez son correspondant sur le schéma de la parcelle →' : 'Calage : cliquez un point connu sur le plan (angle de parcelle…), puis son correspondant sur le schéma.')
                : 'Tracé : cliquez les sommets de l’emprise, puis « Enregistrer ».'}
            </p>
          </div>

          {/* Colonne contrôles + mesures + schéma */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              <button type="button" style={{ ...btn, fontWeight: mode === 'calage' ? 700 : 400 }} onClick={() => setMode('calage')}>Calage ({paires.length}/2)</button>
              <button type="button" style={{ ...btn, fontWeight: mode === 'trace' ? 700 : 400 }} onClick={() => setMode('trace')}>Tracé ({sommets.length})</button>
              <button type="button" style={btn} onClick={() => mode === 'trace' ? setSommets((s) => s.slice(0, -1)) : (planEnAttente ? setPlanEnAttente(null) : setPaires((p) => p.slice(0, -1)))}>Annuler dernier</button>
              <button type="button" style={btn} onClick={() => { setSommets([]); setPaires([]); setPlanEnAttente(null); }}>Reprendre</button>
              <label style={styleAide}>échelle 1: <input inputMode="numeric" value={ratioDeclareSaisi} onChange={(e) => setRatioDeclareSaisi(e.target.value)} placeholder="200" style={{ width: 60 }} /></label>
            </div>
            <BandeauCalage calage={vc} nbPaires={paires.length} />
            <BandeauVraisemblance aireM2={aire} v={vv} />
            <button type="button" className="svv-btn" style={{ width: 'auto' }} disabled={occupe || !sim || sommets.length < 3} onClick={() => void enregistrer()}>
              Enregistrer l’emprise de {batSel.repere ?? `bâtiment ${batSel.corpsId}`}
            </button>

            {/* Emprises déjà tracées pour CE bâtiment (effaçables). */}
            <ListeEmprises emprises={empriseDuBat} onSupprimer={(id) => void posterProjection('supprimer', corpsEffectif!, { id })} />

            {/* Ignorer / rétablir la projection de CE bâtiment (motif obligatoire ; réversible). */}
            {ignoreDuBat ? (
              <div className="svv-card" style={{ fontSize: 12, borderColor: 'var(--color-svv-line)' }}>
                <div>Projection <strong>ignorée</strong> — motif : {ignoreDuBat.motif}</div>
                <button type="button" style={{ ...btn, marginTop: '.3rem' }} disabled={occupe} onClick={() => void posterProjection('retablir', corpsEffectif!)}>Rétablir (tracer finalement)</button>
              </div>
            ) : empriseDuBat.length === 0 && (
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={motifIgnore} onChange={(e) => setMotifIgnore(e.target.value)} placeholder="motif court (obligatoire)…" style={{ flex: '1 1 140px', minWidth: 0, padding: '.2rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12 }} />
                <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} disabled={occupe || motifIgnore.trim() === ''} onClick={() => void posterProjection('ignorer', corpsEffectif!, { motif: motifIgnore })}>Ignorer la projection</button>
              </div>
            )}

            <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} calageLambert={paires.map((p) => p.lambert)} onCliquer={mode === 'calage' && planEnAttente ? cliquerSchema : undefined} />
          </div>
        </div>
      )}
      {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{message}</div>}
    </div>
  );
}
