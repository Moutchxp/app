'use client';

import { useEffect, useState } from 'react';
import type { ImmeubleConnu } from '../../../../lib/gestion/syndics';

/**
 * ══ LOT ANNUAIRE-SYNDICS — LES IMMEUBLES CONNUS ET LEUR SYNDIC, LUS UNE FOIS POUR TOUT L'ÉCRAN ══════════════════
 *
 * Une fiche propriétaire montre jusqu'à une vingtaine de cartes de bien, et chacune a son bouton syndic : une
 * requête par carte serait vingt allers-retours pour la même réponse. On lit donc UNE fois
 * `/api/admin/gestion/syndics/immeubles` (≈ 230 immeubles), on garde la réponse au niveau du module, et chaque
 * carte s'y abonne. Après un enregistrement, `rafraichirImmeubles()` relit et prévient tous les abonnés : le
 * bouton passe de « Créer le syndic » à « Coordonnées syndic » sans recharger la page.
 */
export interface EtatImmeubles { disponible: boolean; immeubles: ImmeubleConnu[] }

let cache: EtatImmeubles | null = null;
let enVol: Promise<void> | null = null;
const abonnes = new Set<(e: EtatImmeubles) => void>();

async function lire(): Promise<void> {
  try {
    const r = await fetch('/api/admin/gestion/syndics/immeubles', { cache: 'no-store' });
    const j = (await r.json()) as { etat?: string; disponible?: boolean; immeubles?: ImmeubleConnu[] };
    if (!r.ok || j.etat !== 'ok') return; // ⚠️ une lecture en échec ne remplace pas une réponse valide
    cache = { disponible: j.disponible === true, immeubles: j.immeubles ?? [] };
    for (const a of abonnes) a(cache);
  } catch {
    /* réseau coupé : l'écran garde ce qu'il avait, et les boutons restent absents tant qu'il n'avait rien */
  }
}

/** Relit les immeubles (après un enregistrement) et prévient tous les écrans abonnés. */
export function rafraichirImmeubles(): Promise<void> {
  enVol = lire().finally(() => { enVol = null; });
  return enVol;
}

/** Les immeubles connus, ou `null` tant que la première lecture n'est pas revenue. */
export function useImmeublesSyndics(): EtatImmeubles | null {
  const [etat, setEtat] = useState<EtatImmeubles | null>(cache);
  useEffect(() => {
    abonnes.add(setEtat);
    if (cache !== null) setEtat(cache);
    else if (enVol === null) void rafraichirImmeubles();
    return () => { abonnes.delete(setEtat); };
  }, []);
  return etat;
}
