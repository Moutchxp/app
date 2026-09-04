'use client';

import { useState } from 'react';
import type { CompteRenduExtraction } from '../../../../lib/permis/executerExtraction'; // type SEUL (bundle client)

/**
 * EXT-1 (étape 2) / LOT 56-B — bouton « Lancer le diagnostic complet des documents » d'un permis. Point d'entrée UNIQUE de la ré-analyse
 * complète (renommé au LOT 56-B ; ancien libellé « Relancer l'analyse ») : relit la TOTALITÉ des documents et actualise le
 * diagnostic via /api/admin/permis/extraire (appel externe payant — un geste délibéré le paie), puis DIT ce qui s'est passé (champs
 * retenus, pièces sans candidat, analyse approfondie oui/non). Placé EN TÊTE du bloc « Complétude » (BlocCompletude) et, à
 * l'identique, dans « Archives ». Pendant l'exécution : bouton DÉSACTIVÉ + indication, et un second clic ne relance RIEN (garde
 * `enCours`). « Aucun champ rempli » est un RÉSULTAT LÉGITIME, jamais affiché comme une erreur. 401 → « reconnectez-vous » (jamais
 * une fausse panne de données). PUR côté état local ; mobile-first (cible ≥ 36 px, pas de hover-only). `onFini` : rafraîchir le
 * diagnostic / les caractéristiques / le best-of après la passe.
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
      // Dette RÉCURRENTE du projet : une session expirée (401) NE DOIT JAMAIS être présentée comme une panne de données.
      if (res.status === 401) { setErreur('Session expirée — reconnectez-vous.'); return; }
      const body = (await res.json().catch(() => ({}))) as { rapport?: CompteRenduExtraction; erreur?: string };
      if (res.ok && body.rapport) { setRapport(body.rapport); onFini?.(); }
      else setErreur(body.erreur ?? 'Analyse impossible — l’état précédent reste affiché.'); // erreur honnête, le diagnostic déjà affiché n'est pas effacé
    } catch { setErreur('Analyse impossible — l’état précédent reste affiché.'); }
    finally { setEnCours(false); }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 36, padding: '.3rem .7rem', alignSelf: 'flex-start' }}
        disabled={enCours} aria-busy={enCours} onClick={() => void relancer()}>
        {enCours ? 'Analyse en cours…' : 'Lancer le diagnostic complet des documents'}
      </button>
      {/* LOT 56-B (point 3) — DIRE ce que fait le bouton AVANT le clic, en une ligne, sans jargon (ni « vision », ni « OCR »). */}
      <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>
        Relit la totalité des documents du permis et actualise le diagnostic. Fait appel à un service d’analyse payant ; comptez 20 à 30 secondes.
      </span>
      {enCours && <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }} aria-live="polite">Analyse de tous les documents en cours — merci de patienter.</span>}
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>{erreur}</span>}
      {rapport && (
        <span role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>
          {/* PART-3b — LIBELLÉ EXPLICITE de l'AXE : ceci est le rendement de l'EXTRACTION DES CARACTÉRISTIQUES CHIFFRÉES (cotes,
              gabarits, niveaux…), à ne PAS confondre avec la « Complétude des pièces » (typologie : masse/coupe/étages/Cerfa).
              Une pièce « sans donnée chiffrée » peut être un plan parfaitement classé en famille. Libellé seul — aucune valeur changée. */}
          <strong>Extraction des caractéristiques</strong> — {rapport.champsRetenus > 0 ? `${rapport.champsRetenus} champ(s) retenu(s)` : 'aucun champ rempli (résultat légitime)'}
          {' · '}{rapport.piecesSansCandidat}/{rapport.nbPieces} pièce(s) sans donnée chiffrée exploitée (ne présume pas d’une pièce manquante)
          {' · '}analyse approfondie : {rapport.visionTournee
            ? `oui (${rapport.visionPieces} pièce${rapport.visionPieces > 1 ? 's' : ''})`
            : `non${rapport.motifVision ? ` — ${rapport.motifVision}` : ''}`}
        </span>
      )}
    </div>
  );
}
