'use client';

import { useCallback, useState } from 'react';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';

/**
 * LOT 101 → PL-C5 — l'ancien geste MUTANT « rattacher à la main » (qui réécrivait la ligne en origine='saisie' et la GELAIT pour
 * toujours) est RETIRÉ : on compose désormais les parcelles dans la PLANCHE cadastrale (sélection SUPERPOSÉE, provenance vraie, sans
 * jamais muter permis_parcelle). Ne subsiste ici que l'AFFICHAGE d'une correction HÉRITÉE + son ANNULATION — indispensable pour
 * DÉGELER une ligne figée par l'ancien chemin (ex. verif-lot101 sur le 468). Provenance HONNÊTE (acteur résolu, jamais « à la main »
 * par défaut). Zone hors canvas → tokens `--color-svv-*`.
 */
export function CorrectionParcelle({ dossierId, parcelleId, refRemplacee, origine, majPar, majLe, acteurNom, onFait }: {
  dossierId: number; parcelleId: number; refRemplacee: string | null;
  origine?: 'saisie' | 'extraite' | null; majPar?: string | null; majLe?: string | null; acteurNom?: string | null; onFait: () => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const annuler = useCallback(async () => {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annuler_correction_parcelle', dossierId, parcelleId }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !b.ok) { setMsg('Annulation impossible, réessayez.'); return; }
      onFait();
    } catch { setMsg('Annulation impossible, réessayez.'); } finally { setEnCours(false); }
  }, [dossierId, parcelleId, onFait]);

  const lien: React.CSSProperties = { width: 'auto', padding: '.05rem .35rem', fontSize: 11 };

  // Une correction HÉRITÉE (ligne gelée par l'ancien chemin) → NOMMER l'acteur honnêtement + permettre l'annulation (dégel).
  if (refRemplacee || origine === 'saisie') {
    const d = descriptionActeurParcelle({ majPar: majPar ?? null, majLe: majLe ?? null, acteurNom: acteurNom ?? null });
    return (
      <span style={{ fontSize: 11 }}>
        {' '}
        {d.aLaMain
          ? <><span style={{ color: 'var(--color-svv-blue)', fontWeight: 600 }}>rattachée à la main</span> par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong></>
          : <span style={{ color: 'var(--color-svv-muted)' }}>référence corrigée par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong> <span style={{ fontStyle: 'italic' }}>(pas un geste manuel identifié)</span></span>}
        {d.quand ? <span style={{ color: 'var(--color-svv-muted)' }}> le {d.quand}</span> : null}
        {refRemplacee ? <span style={{ color: 'var(--color-svv-muted)' }}> en remplacement de {refRemplacee}</span> : null}
        {refRemplacee ? <>{' '}<button type="button" className="svv-link" style={lien} disabled={enCours} onClick={() => void annuler()}>annuler la correction</button></> : null}
        {msg && <span role="alert" style={{ color: 'var(--color-svv-red)' }}> {msg}</span>}
      </span>
    );
  }
  // Toute autre parcelle (rattachée automatiquement, ou non rattachée) → aucun geste ici : la composition se fait dans la planche cadastrale.
  return null;
}
