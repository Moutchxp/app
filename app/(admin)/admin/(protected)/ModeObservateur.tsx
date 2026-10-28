'use client';

import { useEffect } from 'react';
import { ecritureRefuseeObservateur } from '../../../lib/admin/observateur';
import { MENTION_LECTURE_SEULE, MOTIF_LECTURE_SEULE } from '../../../lib/admin/statut';

/**
 * ══ 🔴 LOT P (Arno, 28/10/2026) — OBSERVATEUR : LA LECTURE SEULE À L'ÉCRAN, POSÉE UNE FOIS POUR TOUT L'ADMIN ═══════════════════════
 * La SÉCURITÉ est au proxy (403 `LECTURE_SEULE` sur toute écriture, `proxyObservateur.test.ts`). Ici, le confort, pour tous les modules
 * sans toucher à leurs écrans :
 *   · un bandeau permanent « Lecture seule (observateur) » ;
 *   · les boutons d'ACTION (envoi d'un formulaire, et tout bouton dont le libellé commence par un verbe d'écriture : Enregistrer, Valider,
 *     Ajouter, « + … », Modifier, Saisir, Supprimer…) restent VISIBLES mais deviennent inactifs, avec la mention « lecture seule
 *     (observateur) », lisibles (texte gris, bordure en tirets : jamais effacés par le style « désactivé » d'un bouton) — les boutons de
 *     lecture (onglets, déplier, filtres, fermer) restent utilisables ;
 *   · toute écriture vers l'API admin partie d'un bouton oublié est arrêtée dans le navigateur avec le même motif (et le serveur la
 *     refuserait de toute façon).
 */
const VERBES = /^\s*(\+|enregistrer|valider|confirmer|saisir|modifier|ajouter|cr[ée]er|supprimer|retirer|annulation|r[ée]tablir|acte sign[ée]|envoyer|attribuer|remettre|rattacher|d[ée]tacher|importer|d[ée]placer|renommer|mettre|sortir du suivi|restaurer|revenir|reprendre|archiver|d[ée]sactiver|r[ée]activer|promouvoir|g[ée]n[ée]rer|joindre|d[ée]poser|marquer|accepter|refuser|corbeille|renvoyer|r[ée]initialiser|copier|classer|lier|d[ée]lier|cl[ôo]turer|ouvrir l[’']événement|basculer|convertir|demander|relancer|appliquer)/i;

/** Ce bouton est-il une ACTION d'écriture (à rendre inactive pour un observateur) ? PUR. */
export function estBoutonAction(type: string | null, texte: string): boolean {
  return type === 'submit' || VERBES.test(texte.replace(/\s+/g, ' '));
}

const CSS = `
.svv-lecture-seule-bandeau{margin:0 0 12px;padding:10px 14px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700}
[data-lecture-seule]{cursor:not-allowed !important;opacity:1 !important;color:var(--color-svv-muted) !important;background:var(--color-svv-field) !important;
  border:1px dashed var(--color-svv-line-strong) !important;box-shadow:none !important;transform:none !important}
[data-lecture-seule]::after{content:' · ${MENTION_LECTURE_SEULE}';font-weight:600;font-size:.78em;opacity:.85}
`;

export function ModeObservateur({ actif }: { actif: boolean }) {
  useEffect(() => {
    if (!actif) return undefined;
    const fetchOrigine = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const methode = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
      const chemin = new URL(url, window.location.href).pathname;
      if (chemin.startsWith('/api/admin/') && chemin !== '/api/admin/session' && ecritureRefuseeObservateur('observateur', methode, chemin)) {
        return new Response(JSON.stringify({ etat: 'refus', erreur: 'LECTURE_SEULE', motif: MOTIF_LECTURE_SEULE }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return fetchOrigine(input, init);
    }) as typeof fetch;
    const marquer = (): void => {
      document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.svv-adm-content button, .svv-adm-content input[type="submit"]').forEach((el) => {
        if (el.hasAttribute('data-lecture-seule') && el.disabled) return;
        if (!estBoutonAction(el.getAttribute('type'), el instanceof HTMLInputElement ? el.value : el.textContent ?? '')) return;
        el.disabled = true;
        el.title = MENTION_LECTURE_SEULE;
        el.setAttribute('data-lecture-seule', '');
      });
    };
    marquer();
    const obs = new MutationObserver(marquer);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    return () => { window.fetch = fetchOrigine; obs.disconnect(); };
  }, [actif]);
  if (!actif) return null;
  return (
    <>
      <style>{CSS}</style>
      <p className="svv-lecture-seule-bandeau" role="status" data-mode-observateur>
        Lecture seule (observateur) : vous consultez. Les boutons d’action restent visibles mais sont inactifs, et aucune modification n’est possible.
      </p>
    </>
  );
}
