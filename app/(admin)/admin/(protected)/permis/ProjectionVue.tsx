'use client';

import { useCallback, useEffect, useState } from 'react';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { BoutonRelancerAnalyse } from './BoutonRelancerAnalyse';
import { BlocCompletude } from './BlocCompletude';
import { BlocFilEchanges } from './BlocFilEchanges';
import { BlocRepliable } from './BlocRepliable';
import { TableProjection, BoutonValiderProjection, AIDE_PROJECTION, type LigneProjectionAffichee } from './ProjectionRendu';
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { etatValidationProjection } from '../../../../lib/permis/etatValidationProjection';
import { recompterSiSucces } from './comptesActions';

/**
 * PROJ-2c/3b — onglet « Analyse et projection » (entre Réponses et Archives). File de travail qui se vide : à la réception des
 * pièces, on INSTRUIT le permis (caractéristiques + bâtiments déclarés via `CaracteristiquesBloc`, écriture 'saisie') PUIS on
 * reconstitue l'emprise des futurs bâtiments (neuve/extension, `BlocTraceEmprise`). Le geste « + ajouter un bâtiment » fait naître
 * les corps → débloque le tracé et la validation (0 bâtiment ⇒ non validable). Valider FAIT AVANCER (quitte la file + marqué suivi).
 */
export function ProjectionVue({ onRecompter }: { onRecompter?: () => void } = {}) {
  const [file, setFile] = useState<LigneProjectionAffichee[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<VerdictProjection | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vInstruction, setVInstruction] = useState(0); // PROJ-3b — compteur incrémenté à chaque écriture d'instruction → recharge le tracé (bâtiments)
  const [vAnalyse, setVAnalyse] = useState(0); // EXT-1 — bump après « Relancer l'analyse » → remonte CaracteristiquesBloc (refetch des champs extraits)
  const [batimentsOuvert, setBatimentsOuvert] = useState(false); // PERF-1 — le bloc bâtiments (verdict) est déplié à la demande ; jauge le bouton « Valider »

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/projection', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setFile(((await res.json()) as { file: LigneProjectionAffichee[] }).file);
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  const valider = useCallback(async (dossierId: number) => {
    setEnCours(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/projection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'valider', dossierId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; file?: LigneProjectionAffichee[] };
      if (res.ok && d.ok) {
        setFile(d.file ?? []); setOuvert(null); setVerdict(null); setMessage('projection validée : le permis passe en suivi et quitte la file');
        recompterSiSucces(true, onRecompter);
      } else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'validation impossible'));
    } catch { setMessage('validation impossible'); } finally { setEnCours(false); }
  }, [onRecompter]);

  // Ouverture d'une pièce GED à la page (visionneur) — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux */ }
  }, []);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>File de projection indisponible.</div>;
  if (file === null) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>;

  const ouvrir = (dossierId: number) => { setOuvert((v) => (v === dossierId ? null : dossierId)); setVerdict(null); setMessage(null); setBatimentsOuvert(false); }; // PERF-1 : chaque permis s'ouvre tout replié

  // PERF-1 — TOUS les blocs sont REPLIÉS par défaut et ne chargent leurs données QU'AU DÉPLIAGE (BlocRepliable, render-prop). Un bloc
  //   jamais ouvert ne déclenche AUCUNE requête. Seul le bilan de complétude fait UNE lecture légère (mémoire) au rendu, pour la
  //   ligne de titre visible sans déplier. renderDetail n'est rendu que pour une ligne ouverte → `ouvert` est non nul ici.
  const renderDetail = () => {
    if (ouvert === null) return null; // sécurité de type (narrowing) : renderDetail n'est appelé que sur une ligne ouverte
    const ev = etatValidationProjection(batimentsOuvert, verdict); // bouton « Valider » : invite à déplier les bâtiments tant qu'ils n'ont pas été ouverts
    return (
      <div className="flex flex-col gap-2">
        {/* EXT-1 (étape 2) — RELANCER L'ANALYSE : SEUL moyen de forcer un recalcul (inchangé). Toujours visible, en tête du détail. */}
        <BoutonRelancerAnalyse dossierId={ouvert} onFini={() => { setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); }} />
        {/* PART-2 / PERF-1 — COMPLÉTUDE + relances : bilan (lecture mémoire) dans la ligne de titre ; détail au dépliage. Se remonte
            après « Relancer l'analyse » (key liée à vAnalyse) pour relire le diagnostic fraîchement recalculé. */}
        <BlocCompletude key={`completude-${ouvert}-${vAnalyse}`} dossierId={ouvert} />
        {/* FIL — historique des échanges : chargé UNIQUEMENT au dépliage (la requête du fil est complète ; pas d'aperçu léger — cf. rapport). */}
        <BlocRepliable key={`w-fil-${ouvert}`} titre="Historique des échanges">
          {() => <BlocFilEchanges key={`fil-${ouvert}-${vAnalyse}`} dossierId={ouvert} />}
        </BlocRepliable>
        {/* PROJ-3b — INSTRUCTION (caractéristiques + « + ajouter un bâtiment ») puis TRACÉ. Clés PRÉFIXÉES PAR RÔLE (unicité, cf. PART-2b),
            suffixe vAnalyse conservé : chaque enfant monté se remonte après « Relancer l'analyse ». Montés au dépliage (PERF-1). */}
        <BlocRepliable key={`w-carac-${ouvert}`} titre="Caractéristiques du permis (saisie)">
          {() => <CaracteristiquesBloc key={`carac-${ouvert}-${vAnalyse}`} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} onChange={() => setVInstruction((v) => v + 1)} />}
        </BlocRepliable>
        {/* PERF-1 — BÂTIMENTS/PROJECTION (verdict) : la requête la PLUS coûteuse (≈ 9 s sur 7424). Différée au dépliage ; onOuvertChange
            débloque le bouton « Valider ». POLISH-1 — le bouton « Valider la projection » et ses phrases sont ENFERMÉS dans ce bloc :
            ils n'apparaissent qu'une fois DÉPLIÉ (cohérence avec les autres blocs repliés) ; repli → cachés, aucun /emprise relancé. */}
        <BlocRepliable key={`w-bat-${ouvert}`} titre="Bâtiments et projection (emprise)" onOuvertChange={setBatimentsOuvert}>
          {() => (
            <div className="flex flex-col gap-2">
              <BlocTraceEmprise dossierId={ouvert} onVerdict={setVerdict} rafraichir={vInstruction} />
              <BoutonValiderProjection
                peutValider={ev.peutValider}
                aucunBatiment={ev.aucunBatiment}
                libelle={ev.libelle}
                enCours={enCours}
                onValider={() => { void valider(ouvert); }} />
              {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{message}</div>}
            </div>
          )}
        </BlocRepliable>
        {/* EXT-1 (point 5) — PIÈCES DU PERMIS en DERNIÈRE POSITION : référence en regard de la saisie. Chargées au dépliage (PERF-1). */}
        <BlocRepliable key={`w-pieces-${ouvert}`} titre="Pièces du permis">
          {() => <BlocPiecesPermis key={`pieces-${ouvert}`} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />}
        </BlocRepliable>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>{AIDE_PROJECTION}</p>
      <TableProjection file={file} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} />
    </div>
  );
}
