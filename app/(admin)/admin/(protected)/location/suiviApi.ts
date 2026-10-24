'use client';

import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';

/**
 * Le point d'appel du « suivi commercial » (`/api/admin/location/suivi`), sorti de `SuiviCommercial.tsx` (Arno, 24/10/2026) pour que
 * l'annuaire des apporteurs (`OngletsSuivi`) et le bloc du bail se servent l'un de l'autre sans boucle d'import. `SuiviCommercial`
 * le réexporte : ses appelants n'ont rien à changer.
 */
export const API_SUIVI = '/api/admin/location/suivi';
export { aujourdhuiParis };

/** `propre` : l'écran a déjà sa modale (Nouveau locataire) — la confirmation de la tuile ne s'y ajoute pas. */
export async function posterSuivi(corps: Record<string, unknown>, o: { propre?: boolean } = {}): Promise<{ motif: string | null; data?: unknown; etat?: string }> {
  try {
    const r = await fetch(API_SUIVI, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(o.propre ? { [ENTETE_CONFIRMATION]: 'propre' } : {}) }, body: JSON.stringify(corps) });
    const d = await r.json() as { etat?: string; motif?: string; message?: string; data?: unknown };
    if (d.etat === 'ok') return { motif: null, data: d.data };
    if (r.status === 401 || r.status === 403) return { motif: 'Accès refusé : droit « Location » requis (ou session expirée).' };
    return { motif: d.motif ?? d.message ?? 'Enregistrement refusé.', etat: d.etat };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.' };
  }
}
