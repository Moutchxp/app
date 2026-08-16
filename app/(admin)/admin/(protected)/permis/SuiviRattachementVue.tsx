'use client';

import { useEffect, useState } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import { TableSuivi, DetailSuiviRendu } from './SuiviRattachementRendu';

/**
 * FUS-3b — onglet SUIVI DU RATTACHEMENT : le tableau des permis suivis (groupé par état, compteurs, ancienneté) et, au clic,
 * le détail comparatif « trois sources » d'un dossier. LECTURE SEULE (aucun bouton valider/refuser/injecter — FUS-3c). La Vue
 * ne fait que charger ; tout le rendu est PUR (`SuiviRattachementRendu`). `onOuvrirArchives` renvoie vers le détail complet du
 * permis (onglet Archives, avec ses pièces) — réutilise l'existant.
 */
export function SuiviRattachementVue({ onOuvrirArchives }: { onOuvrirArchives?: (dossierId: number) => void }) {
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSuivi | null>(null);
  const [detailErreur, setDetailErreur] = useState(false);

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
      setDetail(null); setDetailErreur(false); // reset DANS l'async (déféré) → pas de cascade de rendus
      try {
        const res = await fetch(`/api/admin/permis/rattachement?dossierId=${ouvert}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setDetail(((await res.json()) as { detail: DetailSuivi }).detail);
        else setDetailErreur(true);
      } catch { if (!annule) setDetailErreur(true); }
    })();
    return () => { annule = true; };
  }, [ouvert]);

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
            ? <DetailSuiviRendu detail={detail} onOuvrirArchives={onOuvrirArchives} />
            : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement du détail…</div>
      )}
    </div>
  );
}
