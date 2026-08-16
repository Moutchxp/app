'use client';

import { useCallback, useEffect, useState } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import { TableSuivi, DetailSuiviRendu } from './SuiviRattachementRendu';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { CellulePieces } from './ArchivesRendu';

/**
 * FUS-3c — onglet SUIVI DU RATTACHEMENT : au clic sur un permis, TOUT le contenu de décision est sur la même page — détail
 * comparatif « trois sources », Street View, ET le détail complet du permis rapatrié d'Archives (caractéristiques, bâtiments,
 * altitudes, parcelles, pièces jointes CONSULTABLES). Réutilise `CaracteristiquesBloc` et `CellulePieces` (déplacement de rendu,
 * pas de réécriture). LECTURE SEULE : aucun bouton valider/refuser/injecter (FUS-3d) ; les pièces sont téléchargeables mais ni
 * supprimables ni ajoutables ici (ça reste dans Archives). Le détail complet est REPLIÉ par défaut (lisible à 20 dossiers).
 */
export function SuiviRattachementVue() {
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSuivi | null>(null);
  const [detailErreur, setDetailErreur] = useState(false);
  const [permisOuvert, setPermisOuvert] = useState(false); // détail complet du permis (caractéristiques + pièces), replié par défaut

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/rattachement', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setListe((await res.json()) as { lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> });
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    if (ouvert === null) return; // détail masqué au rendu quand ouvert === null (pas de setState synchrone ici)
    let annule = false;
    void (async () => {
      setDetail(null); setDetailErreur(false); setPermisOuvert(false); // reset DANS l'async (déféré)
      try {
        const res = await fetch(`/api/admin/permis/rattachement?dossierId=${ouvert}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setDetail(((await res.json()) as { detail: DetailSuivi }).detail);
        else setDetailErreur(true);
      } catch { if (!annule) setDetailErreur(true); }
    })();
    return () => { annule = true; };
  }, [ouvert]);

  // Téléchargement d'une pièce — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  const telecharger = useCallback(async (pieceId: number, source: 'reponse' | 'dossier'): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux (lecture seule) */ }
  }, []);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</div>;
  if (!liste) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>;

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        Suivi du rattachement des permis à leur parcelle et à leurs bâtiments futurs. Univers = permis dont les parcelles ont été
        analysées (une empreinte existe). Lecture seule.
      </p>
      <TableSuivi lignes={liste.lignes} compteurs={liste.compteurs} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} />
      {ouvert !== null && (
        detailErreur
          ? <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Détail indisponible.</div>
          : detail
            ? <div className="flex flex-col gap-2">
                <DetailSuiviRendu detail={detail} />
                {/* Détail complet du permis rapatrié d'Archives — replié par défaut. */}
                <div>
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .4rem' }}
                    aria-expanded={permisOuvert} onClick={() => setPermisOuvert((v) => !v)}>
                    {permisOuvert ? 'masquer' : 'afficher'} le détail complet du permis et ses pièces jointes {permisOuvert ? '▲' : '▼'}
                  </button>
                </div>
                {permisOuvert && (
                  <div className="flex flex-col gap-2">
                    <CaracteristiquesBloc dossierId={detail.dossierId} onTelecharger={(id, source) => void telecharger(id, source)} />
                    <div className="svv-card" style={{ fontSize: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: '.3rem' }}>Pièces jointes</div>
                      <CellulePieces pieces={detail.pieces} onTelecharger={(id, source) => void telecharger(id, source)} />
                    </div>
                  </div>
                )}
              </div>
            : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement du détail…</div>
      )}
    </div>
  );
}
