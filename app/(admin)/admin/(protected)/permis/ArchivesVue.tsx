'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LigneArchive } from '../../../../lib/sitadel/demandeRepo';
import { TableArchives } from './ArchivesRendu';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';

/**
 * A1a/A1b — onglet ARCHIVES : les permis renseignés par les mairies + leurs pièces (reçues par e-mail OU ajoutées à la main).
 * La Vue charge, pagine, téléverse un document, supprime un document manuel, déclenche un téléchargement — tout le rendu est
 * PUR (`ArchivesRendu`).
 *
 * ⚠️ TÉLÉCHARGEMENT — signeur UNIQUE : action `url_piece` de /reponses (lit la clé côté serveur, renvoie une URL signée ;
 * `@aws-sdk` en import dynamique). Aucune 2e implémentation de signature ; on n'envoie qu'un `pieceId` + une `source`
 * ('reponse'|'dossier') — la clé de stockage ne transite jamais.
 */
const PAGE_SIZE = 20;

// FUS-3b — `initialDossierOuvert` : permis pré-déplié à l'arrivée (lien « détail complet » depuis le suivi de rattachement).
export function ArchivesVue({ initialDossierOuvert }: { initialDossierOuvert?: number | null } = {}) {
  const [archives, setArchives] = useState<LigneArchive[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [uploadEnCours, setUploadEnCours] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  // N1-C — accordéon à UN volet : dossierId de l'unique permis déplié (null = tout replié). Les pièces sont masquées par défaut.
  const [dossierOuvert, setDossierOuvert] = useState<number | null>(initialDossierOuvert ?? null);

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

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
  }, [version]);

  // Téléchargement (les deux origines) via l'action url_piece de /reponses — SEUL signeur. On ne transmet qu'un id + la source.
  const telecharger = useCallback(async (pieceId: number, source: 'reponse' | 'dossier'): Promise<void> => {
    setMessage('');
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
      else setMessage('Lien de téléchargement indisponible.');
    } catch { setMessage('Lien de téléchargement indisponible.'); }
  }, []);

  // Téléversement d'un document à la main sur un permis (multipart). Un refus (type/taille/non archivé) affiche son motif.
  const televerser = useCallback(async (dossierId: number, fichier: File): Promise<void> => {
    setUploadEnCours(dossierId); setMessage('');
    try {
      const fd = new FormData();
      fd.append('dossierId', String(dossierId));
      fd.append('fichier', fichier);
      const res = await fetch('/api/admin/permis/archives', { method: 'POST', body: fd });
      if (res.ok) rafraichir();
      else { const d = (await res.json().catch(() => ({}))) as { erreur?: string }; setMessage(d.erreur ?? 'Téléversement impossible.'); }
    } catch { setMessage('Téléversement impossible.'); }
    finally { setUploadEnCours(null); }
  }, [rafraichir]);

  // Suppression d'un document AJOUTÉ À LA MAIN. `source:'dossier'` explicite — le serveur refuse toute autre source (e-mail).
  const supprimer = useCallback(async (documentId: number): Promise<void> => {
    setMessage('');
    try {
      const res = await fetch('/api/admin/permis/archives', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, source: 'dossier' }) });
      if (res.ok) rafraichir();
      else { const d = (await res.json().catch(() => ({}))) as { erreur?: string }; setMessage(d.erreur ?? 'Suppression impossible.'); }
    } catch { setMessage('Suppression impossible.'); }
  }, [rafraichir]);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Archives indisponibles.</p>;
  if (archives === null) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des archives…</p>;

  const nbPages = Math.max(1, Math.ceil(archives.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = archives.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      {archives.length > 0 && (
        <div className="svv-card" style={{ fontSize: 13, color: 'var(--color-svv-muted)' }}>
          <strong style={{ color: 'var(--color-svv-ink)' }}>{archives.length} permis renseigné{archives.length > 1 ? 's' : ''}</strong> par les mairies, du plus récemment satisfait au plus ancien. Vous pouvez ajouter vos propres documents à un permis (les pièces reçues par e-mail, elles, ne sont pas supprimables).
        </div>
      )}
      {message && <p role="alert" style={{ fontSize: 13, color: 'var(--color-svv-red)', fontWeight: 600, margin: 0 }}>{message}</p>}

      <TableArchives lignes={visibles} maintenant={new Date()} uploadEnCours={uploadEnCours}
        dossierOuvert={dossierOuvert}
        onDeplier={(id) => setDossierOuvert((cur) => (cur === id ? null : id))}
        onTelecharger={(id, source) => void telecharger(id, source)}
        onSupprimer={(id) => void supprimer(id)}
        onFichier={(dossierId, fichier) => void televerser(dossierId, fichier)}
        slotCaracteristiques={(dossierId) => <CaracteristiquesBloc dossierId={dossierId} onTelecharger={(id, source) => void telecharger(id, source)} />} />

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
