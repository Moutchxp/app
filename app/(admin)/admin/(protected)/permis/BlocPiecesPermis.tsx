'use client';

import { useEffect, useState } from 'react';
import { CellulePieces } from './ArchivesRendu'; // EXT-1 (point 5) : MÊME composant de pièces qu'Archives, réutilisé tel quel
import type { PieceArchive } from '../../../../lib/sitadel/demandeRepo'; // type SEUL (bundle client)

/**
 * EXT-1 (point 5) — PIÈCES DU PERMIS, en DERNIÈRE POSITION de la ligne dépliée d'« Analyse et projection » : référence en regard de
 * la saisie (après caractéristiques, bâtiments et projection), jamais un point d'entrée. Réutilise `CellulePieces` d'Archives tel
 * quel ; l'ouverture passe par le signeur SERVEUR déjà branché dans Projection (`onOuvrir` → url_piece) : la clé ne transite JAMAIS.
 * LECTURE SEULE. Un échec de chargement dégrade en silence (l'écran reste utilisable).
 */
export function BlocPiecesPermis({ dossierId, onOuvrir }: {
  dossierId: number;
  onOuvrir?: (id: number, source: 'reponse' | 'dossier', page?: number) => void;
}) {
  const [pieces, setPieces] = useState<PieceArchive[] | null>(null);
  const [erreur, setErreur] = useState(false);

  // Le parent remonte ce composant (key=dossierId) à chaque changement de permis → l'état repart frais (pieces=null) sans setState
  //   synchrone dans l'effet. L'effet ne fait donc QUE charger puis poser le résultat.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/pieces?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setPieces((((await res.json()) as { pieces?: PieceArchive[] }).pieces) ?? []);
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [dossierId]);

  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      {/* PERF-1 : le titre « Pièces du permis » est porté par l'en-tête dépliable (BlocRepliable) — pas de doublon ici. */}
      {erreur
        ? <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Pièces indisponibles.</span>
        : pieces === null
          ? <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des pièces…</span>
          : <CellulePieces pieces={pieces} onTelecharger={onOuvrir ? (id, source) => onOuvrir(id, source) : undefined} />}
    </div>
  );
}
