'use client';

import { useLecture } from './commun';
import { dateFr, MENTION_EN_PLACE } from '../../../../lib/location/rentreOccupe';

interface BailEnPlace { bailId: number; lotId: number; titre: string; entree: string | null; dateMandat: string | null }

/**
 * ══ 🔴 Arno (26/10/2026, 430) — « LOCATAIRE EN PLACE À LA PRISE EN GESTION », SUR LA FICHE ═════════════════════════════════════════════
 * Au-dessus de la fiche commune (qui ne change pas), pour un locataire ou un bien : chaque bail du locataire en place reste visible, avec
 * la mention et la date du mandat de gestion. Aucun bail en place (ou base sans la migration 430) : rien n'est rendu. Ajout seul.
 */
export function BauxEnPlace({ locataireId, lotId }: { locataireId?: number; lotId?: number }) {
  const lu = useLecture<BailEnPlace[]>(locataireId !== undefined ? `bauxEnPlaceLocataire=${locataireId}` : lotId !== undefined ? `bauxEnPlaceBien=${lotId}` : null);
  const baux = lu.etat.etat === 'ok' && Array.isArray(lu.etat.data) ? lu.etat.data : [];
  if (baux.length === 0) return null;
  return (
    <section className="svv-card" aria-label="Locataire en place à la prise en gestion" data-baux-en-place>
      {baux.map((b) => (
        <p key={b.bailId} style={{ margin: '4px 0' }} data-bail-en-place={b.bailId}>
          <strong>Bail{b.entree ? ` du ${dateFr(b.entree)}` : ''}</strong> · {b.titre} — <em>{MENTION_EN_PLACE}</em>
          {b.dateMandat ? ` (mandat de gestion du ${dateFr(b.dateMandat)})` : ''}. Ce bail n’est pas un bail signé par l’agence.
        </p>
      ))}
    </section>
  );
}
