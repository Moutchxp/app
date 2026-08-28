'use client';

import { useState } from 'react';
import type { CompteRenduExtraction } from '../../../../lib/permis/executerExtraction'; // type SEUL (bundle client)

/**
 * EXT-1 (étape 2) — bouton « Relancer l'analyse » d'un permis, présent dans « Analyse et projection » ET « Archives ». Lance
 * l'extraction (vision incluse : un geste délibéré paie l'appel externe) via /api/admin/permis/extraire, puis DIT ce qui s'est
 * passé (champs retenus, pièces sans candidat, vision oui/non). Pendant l'exécution : bouton DÉSACTIVÉ + indication, et un second
 * clic ne relance RIEN (garde `enCours`). « Aucun champ rempli » est un RÉSULTAT LÉGITIME, jamais affiché comme une erreur. PUR côté
 * état local ; mobile-first (cible ≥ 36 px, pas de hover-only). `onFini` : rafraîchir les caractéristiques/pièces après la passe.
 */
export function BoutonRelancerAnalyse({ dossierId, onFini }: { dossierId: number; onFini?: () => void }) {
  const [enCours, setEnCours] = useState(false);
  const [rapport, setRapport] = useState<CompteRenduExtraction | null>(null);
  const [erreur, setErreur] = useState('');

  async function relancer(): Promise<void> {
    if (enCours) return; // anti double-clic : jamais deux extractions en parallèle
    setEnCours(true); setErreur(''); setRapport(null);
    try {
      const res = await fetch('/api/admin/permis/extraire', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dossierId }),
      });
      const body = (await res.json().catch(() => ({}))) as { rapport?: CompteRenduExtraction; erreur?: string };
      if (res.ok && body.rapport) { setRapport(body.rapport); onFini?.(); }
      else setErreur(body.erreur ?? 'Analyse impossible.');
    } catch { setErreur('Analyse impossible.'); }
    finally { setEnCours(false); }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 36, padding: '.3rem .7rem', alignSelf: 'flex-start' }}
        disabled={enCours} aria-busy={enCours} onClick={() => void relancer()}>
        {enCours ? 'Analyse en cours…' : 'Relancer l’analyse'}
      </button>
      {enCours && <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }} aria-live="polite">Lecture des pièces (vision incluse) — cela peut prendre un moment.</span>}
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{erreur}</span>}
      {rapport && (
        <span role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>
          {rapport.champsRetenus > 0 ? `${rapport.champsRetenus} champ(s) retenu(s)` : 'aucun champ rempli (résultat légitime)'}
          {' · '}{rapport.piecesSansCandidat}/{rapport.nbPieces} pièce(s) sans candidat
          {' · '}vision : {rapport.visionTournee
            ? `oui (${rapport.visionPieces} pièce${rapport.visionPieces > 1 ? 's' : ''})`
            : `non${rapport.motifVision ? ` — ${rapport.motifVision}` : ''}`}
        </span>
      )}
    </div>
  );
}
