'use client';

import { useCallback, useEffect, useState } from 'react';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { BoutonRelancerAnalyse } from './BoutonRelancerAnalyse';
import { BlocCompletude } from './BlocCompletude';
import { TableProjection, BoutonValiderProjection, AIDE_PROJECTION, type LigneProjectionAffichee } from './ProjectionRendu';
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
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

  const ouvrir = (dossierId: number) => { setOuvert((v) => (v === dossierId ? null : dossierId)); setVerdict(null); setMessage(null); };

  const renderDetail = () => (
    <div className="flex flex-col gap-2">
      {/* EXT-1 (étape 2) — RELANCER L'ANALYSE (vision incluse) : relit les pièces et remplit les champs VIDES (jamais une saisie). En
          tête du détail, mais ce n'est PAS le point d'entrée nominal (l'extraction part seule au versement) — un rattrapage manuel. */}
      {ouvert !== null && <BoutonRelancerAnalyse dossierId={ouvert} onFini={() => { setVAnalyse((v) => v + 1); setVInstruction((v) => v + 1); }} />}
      {/* PART-2 — DIAGNOSTIC DE COMPLÉTUDE (présent/manquant par famille, par contenu). Lit la mémoire (aucune relecture PDF au rendu) ;
          se remonte après « Relancer l'analyse » (key liée à vAnalyse) pour relire le diagnostic fraîchement recalculé. */}
      {ouvert !== null && <BlocCompletude key={`${ouvert}-${vAnalyse}`} dossierId={ouvert} />}
      {/* PROJ-3b — INSTRUCTION d'abord (caractéristiques + « + ajouter un bâtiment » = ce qui fait naître les corps), TRACÉ ensuite. */}
      {ouvert !== null && <CaracteristiquesBloc key={`${ouvert}-${vAnalyse}`} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} onChange={() => setVInstruction((v) => v + 1)} />}
      {ouvert !== null && <BlocTraceEmprise dossierId={ouvert} onVerdict={setVerdict} rafraichir={vInstruction} />}
      <BoutonValiderProjection
        peutValider={verdict?.peutValider ?? false}
        aucunBatiment={verdict?.aucunBatiment ?? false}
        libelle={verdict?.libelle ?? 'chargement des bâtiments…'}
        enCours={enCours}
        onValider={() => { if (ouvert !== null) void valider(ouvert); }} />
      {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{message}</div>}
      {/* EXT-1 (point 5) — PIÈCES DU PERMIS en DERNIÈRE POSITION (après caractéristiques, bâtiments, projection) : référence en regard
          de la saisie, jamais un point d'entrée. Ouverture par le signeur serveur déjà branché (ouvrirPiece → url_piece). */}
      {ouvert !== null && <BlocPiecesPermis key={ouvert} dossierId={ouvert} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>{AIDE_PROJECTION}</p>
      <TableProjection file={file} ouvert={ouvert} onOuvrir={ouvrir} renderDetail={renderDetail} />
    </div>
  );
}
