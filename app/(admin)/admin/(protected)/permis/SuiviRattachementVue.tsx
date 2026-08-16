'use client';

import { useCallback, useEffect, useState } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo';
import { TableSuivi, DetailSuiviRendu, AffectationBloc, ActionsRattachement } from './SuiviRattachementRendu';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { CellulePieces } from './ArchivesRendu';

/**
 * FUS-3c — onglet SUIVI DU RATTACHEMENT : au clic sur un permis, TOUT le contenu de décision est sur la même page — détail
 * comparatif « trois sources », Street View, ET le détail complet du permis rapatrié d'Archives (caractéristiques, bâtiments,
 * altitudes, parcelles, pièces jointes CONSULTABLES). Réutilise `CaracteristiquesBloc` et `CellulePieces` (déplacement de rendu,
 * pas de réécriture). FUS-3d ajoute l'AFFECTATION des polygones BD TOPO aux corps (schéma + sélecteurs) — SEULE écriture ici ;
 * toujours AUCUN bouton valider/refuser, AUCUNE injection d'altitude (FUS-3e). Les pièces sont téléchargeables mais ni supprimables
 * ni ajoutables ici (ça reste dans Archives). Le détail complet est REPLIÉ par défaut (lisible à 20 dossiers).
 */
export function SuiviRattachementVue() {
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSuivi | null>(null);
  const [affectation, setAffectation] = useState<AffectationEtat | null>(null); // FUS-3d
  const [detailErreur, setDetailErreur] = useState(false);
  const [affErreur, setAffErreur] = useState('');
  const [permisOuvert, setPermisOuvert] = useState(false); // détail complet du permis (caractéristiques + pièces), replié par défaut
  // FUS-3e — décisions
  const [motifRefus, setMotifRefus] = useState('');
  const [motifConfirmation, setMotifConfirmation] = useState('');
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [actionErreur, setActionErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

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
      setDetail(null); setAffectation(null); setDetailErreur(false); setAffErreur(''); setPermisOuvert(false);
      setMotifRefus(''); setMotifConfirmation(''); setAvertissement(null); setActionErreur(''); // reset décisions (DANS l'async)
      try {
        const res = await fetch(`/api/admin/permis/rattachement?dossierId=${ouvert}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { const d = (await res.json()) as { detail: DetailSuivi; affectation: AffectationEtat | null }; setDetail(d.detail); setAffectation(d.affectation); }
        else setDetailErreur(true);
      } catch { if (!annule) setDetailErreur(true); }
    })();
    return () => { annule = true; };
  }, [ouvert]);

  // FUS-3d — affecter/désaffecter un polygone à un corps. L'exclusivité est garantie CÔTÉ BASE (index) ; un refus affiche son motif.
  const affecter = useCallback(async (corpsId: number, cleabs: string | null): Promise<void> => {
    if (ouvert === null) return;
    setAffErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'affecter', dossierId: ouvert, corpsId, cleabs }) });
      const d = (await res.json().catch(() => ({}))) as { affectation?: AffectationEtat; erreur?: string };
      if (res.ok && d.affectation) setAffectation(d.affectation);
      else setAffErreur(d.erreur ?? 'Affectation impossible.');
    } catch { setAffErreur('Affectation impossible.'); }
  }, [ouvert]);

  // FUS-3e — décisions (valider / refuser / retour_lidar). La validation d'une cardinalité incohérente exige un motif (besoinConfirmation).
  const agir = useCallback(async (action: 'valider' | 'refuser' | 'retour_lidar', extra: { motif?: string; motifConfirmation?: string } = {}): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId: ouvert, ...extra }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; besoinConfirmation?: boolean; avertissement?: string; erreur?: string; detail?: DetailSuivi; affectation?: AffectationEtat | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.affectation !== undefined) setAffectation(d.affectation ?? null);
        setAvertissement(null); setMotifRefus(''); setMotifConfirmation('');
      } else if (d.besoinConfirmation) {
        setAvertissement(d.avertissement ?? 'Cardinalité incohérente : confirmez avec un motif.');
      } else {
        setActionErreur(d.erreur ?? 'Action impossible.');
      }
    } catch { setActionErreur('Action impossible.'); }
    finally { setEnCours(false); }
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
      <TableSuivi lignes={liste.lignes} compteurs={liste.compteurs} ouvert={ouvert} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} />
      {ouvert !== null && (
        detailErreur
          ? <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Détail indisponible.</div>
          : detail
            ? <div className="flex flex-col gap-2">
                <DetailSuiviRendu detail={detail} />
                {/* FUS-3d — affectation des polygones BD TOPO aux corps (schéma + sélecteurs). */}
                {affectation && <AffectationBloc affectation={affectation} onAffecter={(corpsId, cleabs) => void affecter(corpsId, cleabs)} />}
                {affErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{affErreur}</div>}
                {/* FUS-3e — décisions : uniquement pour un dossier RÉEL (persisté). « aucun signal » (dérivé) n'a rien à décider. */}
                {detail.persiste && (
                  <>
                    <ActionsRattachement avertissement={avertissement} motifRefus={motifRefus} motifConfirmation={motifConfirmation}
                      onMotifRefus={setMotifRefus} onMotifConfirmation={setMotifConfirmation} enCours={enCours}
                      onValider={() => void agir('valider', { motifConfirmation: motifConfirmation || undefined })}
                      onRefuser={() => void agir('refuser', { motif: motifRefus })}
                      onRetour={() => void agir('retour_lidar')} />
                    {actionErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{actionErreur}</div>}
                  </>
                )}
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
