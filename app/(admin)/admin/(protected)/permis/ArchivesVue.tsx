'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LigneArchive } from '../../../../lib/sitadel/demandeRepo';
import { TableArchives } from './ArchivesRendu';

/**
 * A1a — onglet ARCHIVES : les permis renseignés par les mairies (dossiers satisfaits) + leurs pièces. LECTURE SEULE. La Vue
 * ne fait que charger, paginer, et déclencher un téléchargement — tout le rendu est PUR (`ArchivesRendu`).
 *
 * ⚠️ TÉLÉCHARGEMENT — signeur UNIQUE : on réutilise l'action `url_piece` de la route Réponses (elle lit la clé côté serveur
 * et renvoie une URL signée ; `@aws-sdk` y reste en import dynamique). Aucune 2e implémentation de signature, la clé de
 * stockage ne transite jamais : on n'envoie qu'un `pieceId`.
 */
const PAGE_SIZE = 20;

export function ArchivesVue() {
  const [archives, setArchives] = useState<LigneArchive[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [page, setPage] = useState(1);
  const [messagePiece, setMessagePiece] = useState('');

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/archives', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setArchives(((await res.json()) as { archives: LigneArchive[] }).archives);
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // Réutilise l'action `url_piece` de /reponses (SEUL endroit qui signe). On ne transmet qu'un id ; la clé reste serveur.
  const telecharger = useCallback(async (pieceId: number): Promise<void> => {
    setMessagePiece('');
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
      else setMessagePiece('Lien de téléchargement indisponible.');
    } catch { setMessagePiece('Lien de téléchargement indisponible.'); }
  }, []);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Archives indisponibles.</p>;
  if (archives === null) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des archives…</p>;

  const nbPages = Math.max(1, Math.ceil(archives.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = archives.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      {archives.length > 0 && (
        <div className="svv-card" style={{ fontSize: 13, color: 'var(--color-svv-muted)' }}>
          <strong style={{ color: 'var(--color-svv-ink)' }}>{archives.length} permis renseigné{archives.length > 1 ? 's' : ''}</strong> par les mairies (pièces obtenues), du plus récemment satisfait au plus ancien.
        </div>
      )}
      {messagePiece && <p role="alert" style={{ fontSize: 13, color: 'var(--color-svv-red)', fontWeight: 600, margin: 0 }}>{messagePiece}</p>}

      <TableArchives lignes={visibles} onTelecharger={(id) => void telecharger(id)} />

      {nbPages > 1 && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {pageCourante} / {nbPages} ({archives.length} permis)</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
