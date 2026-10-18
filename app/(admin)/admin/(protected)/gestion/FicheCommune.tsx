'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Annuaire } from './Annuaire';
import { CSS_GESTION } from './GestionVue';
import { CSS_BARRE_PAGES } from './BarrePages';
import { CONTEXTE_LOCATION, ENTETE_CONTEXTE } from '../../../../lib/gestion/contexteLocation';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LA FICHE COMMUNE, OUVERTE DEPUIS LA TUILE LOCATION (règle d'Arno du 17/10/2026) ═══════════════════════════════
 *
 * « Il ne doit exister QU'UN SEUL type de fiche propriétaire, de fiche locataire et de fiche bien (avec son historique)
 * dans toute l'application : celles du module Gestion. Depuis la Location, un clic ouvre la FICHE DE LA GESTION, le même
 * composant et le même contenu, historique compris. Elle peut s'afficher sous une adresse /admin/location/... pour garder
 * le menu “Location” actif et un bouton “← Location”, mais c'est strictement le même composant. » (Arno)
 *
 * 🔴 CE COMPOSANT N'EST PAS UNE FICHE : il monte `Annuaire` (la fiche de la Gestion, telle quelle) avec ce qui change
 * QUAND ON VIENT DE LA LOCATION, et rien d'autre :
 *   · AUCUN MAIL NE S'ÉCRIT : `redaction` absent (ni Répondre, ni Répondre à tous, ni Transférer, ni « Nouveau
 *     message », composeur jamais monté), `onEcrire` absent (une adresse reste un simple lien `mailto:`). Les mails et
 *     l'historique restent lisibles ;
 *   · LE SERVEUR LE SAIT AUSSI : chaque appel de la page porte l'en-tête `x-svav-contexte: location` (et le navigateur
 *     envoie l'adresse de la page en `Referer`) — la garde d'envoi refuse alors tout envoi et tout brouillon ;
 *   · LES LIENS RESTENT DANS LA LOCATION : ouvrir une autre fiche mène à `/admin/location/<sorte>/<id>`.
 * Dans la Gestion, ce composant n'est pas utilisé : rien n'y change.
 */
export function lienFicheLocation(f: FicheUrl): string {
  if (f.sorte === 'proprietaire') return `/admin/location/proprietaire/${f.id}`;
  if (f.sorte === 'locataire') return `/admin/location/locataire/${f.id}`;
  // `bien-<n>` vise le NUMÉRO WIPPIMMO, `lot-<id>` l'identifiant interne : la même fiche de bien, par l'autre numéro.
  return f.sorte === 'bien' ? `/admin/location/bien/${f.id}?parCle=1` : `/admin/location/bien/${f.id}`;
}

/**
 * Pose l'en-tête « contexte Location » sur les appels `/api/…` de la page, tant que la fiche est montée. Posé DÈS LE
 * PREMIER RENDU (les effets des enfants partent avant ceux du parent : un `useEffect` arriverait trop tard pour le
 * chargement de la fiche), retiré au démontage.
 */
function useContexteLocation(): void {
  useState(() => {
    if (typeof window === 'undefined') return null;
    const w = window as Window & { __svavFetchOrigine?: typeof fetch };
    if (w.__svavFetchOrigine !== undefined) return null;
    const origine = window.fetch;
    w.__svavFetchOrigine = origine;
    window.fetch = (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      const vise = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
      if (!vise) return origine.call(window, entree, init);
      const entetes = new Headers(init?.headers ?? (entree instanceof Request ? entree.headers : undefined));
      entetes.set(ENTETE_CONTEXTE, CONTEXTE_LOCATION);
      return origine.call(window, entree, { ...init, headers: entetes });
    };
    return null;
  });
  useEffect(() => () => {
    const w = window as Window & { __svavFetchOrigine?: typeof fetch };
    if (w.__svavFetchOrigine !== undefined) { window.fetch = w.__svavFetchOrigine; delete w.__svavFetchOrigine; }
  }, []);
}

/**
 * `ouvrir` (facultatif, écran « Archiver un propriétaire », Arno 18/10/2026) : ouvrir une autre fiche DANS LA PAGE au lieu
 * de naviguer (`null` = revenir) ; `sansRetour` : sans le lien « ← Location », l'écran qui l'accueille a le sien.
 * Sans ces deux props, rien ne change.
 */
export function FicheCommuneLocation({ fiche, ouvrir, sansRetour = false, sansBarreAnnuaire = false }: {
  fiche: FicheUrl; ouvrir?: (f: FicheUrl | null) => void; sansRetour?: boolean;
  /** Écrans d'archivage de la Location seulement (Arno, 18/10/2026) : sans la barre « ← Retour | Annuaire | Chercher… ». */
  sansBarreAnnuaire?: boolean;
}) {
  useContexteLocation();
  const router = useRouter();
  const onFiche = useCallback((f: FicheUrl | null) => {
    if (ouvrir !== undefined) { ouvrir(f); return; }
    router.push(f === null ? '/admin/location' : lienFicheLocation(f));
  }, [router, ouvrir]);
  const onRetour = useCallback(() => {
    if (ouvrir !== undefined) { ouvrir(null); return; }
    if (window.history.length > 1) window.history.back();
    else router.push('/admin/location');
  }, [router, ouvrir]);
  return (
    <div className="gst-vue fco" data-fiche-commune data-contexte="location">
      <style>{CSS_GESTION}</style><style>{CSS_BARRE_PAGES}</style>
      <style>{`.fco-retour{margin:0 0 10px}.fco-note{margin:0 0 12px;font-size:.85rem;color:var(--color-svv-muted)}`}</style>
      {!sansRetour && <p className="fco-retour"><a href="/admin/location">← Location</a></p>}
      <p className="fco-note" role="note">Fiche commune avec la Gestion. Depuis la Location, les mails sont en lecture : écrire, répondre ou transférer se fait depuis la Gestion.</p>
      <Annuaire fiche={fiche} onFiche={onFiche} onRetour={onRetour} redaction={null} sansEntete={sansBarreAnnuaire} />
    </div>
  );
}
