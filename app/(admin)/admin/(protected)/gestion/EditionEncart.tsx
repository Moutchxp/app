'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ══ 🔴🔴 L'ENCART DU BIEN : RELECTURE, MISE À JOUR AUTOMATIQUE, SORTIE DE PAGE (Arno, 21/10/2026 ; 23/10/2026) ══════════════════════════
 *
 * Arno (23/10/2026) : les cinq « Modifier » par groupe sont REMPLACÉS par UN seul « Modifier » qui ouvre le formulaire « Nouveau bien »
 * entier, pré-rempli (`ModifierFicheBien.tsx`, `CreationBien` en modification) — l'ancien formulaire par groupe n'est plus rendu
 * nulle part et a été retiré. Restent ici les pièces communes :
 *   · `annoncerBienModifie` / `useRelectureBien` : une modification enregistrée prévient toute la page (`svav:bien-modifie`) ; chaque
 *     affichage relit la source, et la relit aussi au retour sur l'onglet ;
 *   · `useVersionBien` : l'empreinte du bien relue toutes les quelques secondes (la fiche se met à jour toute seule) ;
 *   · `useAvertissementSortie` : « Modifications non enregistrées » en quittant la page ;
 *   · l'Historique « Modifications de la fiche du bien ».
 */
const API = '/api/admin/gestion/annuaire/location';
export const EVENEMENT_BIEN_MODIFIE = 'svav:bien-modifie';
export const AVERTISSEMENT_SORTIE = 'Modifications non enregistrées : quitter la page les perdra.';

/** Prévenir la page qu'un bien a changé en base (l'encart et la section Location se relisent). */
export function annoncerBienModifie(lotId: number): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENEMENT_BIEN_MODIFIE, { detail: { lotId } }));
}

/** Relire quand ce bien change ailleurs dans la page, ou au retour sur l'onglet. */
export function useRelectureBien(lotId: number, relire: () => void, actif = true): void {
  const r = useRef(relire);
  r.current = relire;
  useEffect(() => {
    if (!actif) return;
    const surModif = (e: Event): void => { if ((e as CustomEvent<{ lotId: number }>).detail?.lotId === lotId) r.current(); };
    const surVisible = (): void => { if (document.visibilityState === 'visible') r.current(); };
    window.addEventListener(EVENEMENT_BIEN_MODIFIE, surModif);
    document.addEventListener('visibilitychange', surVisible);
    return () => { window.removeEventListener(EVENEMENT_BIEN_MODIFIE, surModif); document.removeEventListener('visibilitychange', surVisible); };
  }, [lotId, actif]);
}

/**
 * « Modifications non enregistrées » en quittant la page (fermer l'onglet, recharger, ou suivre un lien de l'application) tant que
 * `sale` : la saisie a des changements non validés.
 */
export function useAvertissementSortie(sale: boolean): void {
  useEffect(() => {
    if (!sale) return;
    const avertir = (e: BeforeUnloadEvent): string => { e.preventDefault(); e.returnValue = AVERTISSEMENT_SORTIE; return AVERTISSEMENT_SORTIE; };
    // Les liens de l'application changent de page SANS décharger la page (navigation côté client) : même avertissement.
    const surLien = (e: MouseEvent): void => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a === null || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.origin !== window.location.origin) return;
      // Même adresse : on ne quitte rien… sauf une entrée du menu de gauche, qui remet la page à zéro (Arno, 22/10/2026).
      if (a.pathname === window.location.pathname && a.search === window.location.search && !a.hasAttribute('data-accueil-tuile')) return;
      if (!window.confirm(`${AVERTISSEMENT_SORTIE} Quitter quand même ?`)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', avertir);
    document.addEventListener('click', surLien, true);
    return () => { window.removeEventListener('beforeunload', avertir); document.removeEventListener('click', surLien, true); };
  }, [sale]);
}

/** Toutes les quelques secondes (fiche ouverte, onglet visible), l'empreinte du bien est relue. */
export const INTERVALLE_VERSION_MS = 5000;

/**
 * Arno (23/10/2026) — LA MISE À JOUR AUTOMATIQUE DE LA FICHE OUVERTE : son empreinte (`?versionBien=`) est relue toutes les
 * `INTERVALLE_VERSION_MS` tant que l'onglet est visible ; quand elle change (un collègue, une autre fenêtre), toute la page est
 * prévenue (`annoncerBienModifie`) et se relit. Rend la dernière empreinte lue (le formulaire « Modifier » la compare à la sienne).
 */
export function useVersionBien(lotId: number, actif = true): string | null {
  const [version, setVersion] = useState<string | null>(null);
  const derniere = useRef<string | null>(null);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    derniere.current = null;
    const lire = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const r = await fetch(`${API}?versionBien=${lotId}`, { cache: 'no-store' });
        const d = await r.json() as { etat?: string; data?: { version?: unknown } };
        if (!vivant || d.etat !== 'ok' || typeof d.data?.version !== 'string') return;
        const v = d.data.version;
        if (derniere.current !== null && derniere.current !== v) annoncerBienModifie(lotId);
        derniere.current = v;
        setVersion(v);
      } catch { /* une lecture manquée : la suivante rattrape */ }
    };
    void lire();
    const t = setInterval(() => { void lire(); }, INTERVALLE_VERSION_MS);
    return () => { vivant = false; clearInterval(t); };
  }, [lotId, actif]);
  return version;
}

/**
 * Les valeurs de l'IMPORT WIPPIMMO que l'encart affiche quand la Location est vide (règle d'Arno du 20/10/2026, `lignesResume`).
 * La saisie, elle, ne porte que les champs de Location (une seule source) : ces valeurs sont DITES au-dessus des champs vides,
 * jamais recopiées en silence dans la saisie ni enregistrées.
 */
export interface ImportBien { type: string | null; meuble?: boolean | null; pieces?: number | null; surface: number | null }

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; rien ne deborde. */
export const CSS_EDITION_ENCART = `
.eden-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;min-width:0}
.eden-tete .rb-titre{margin:0}
.eden-boutons{display:inline-flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.eden-bouton{appearance:none;font:inherit;font-weight:700;font-size:.9rem;min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.eden-bouton--valider{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-blanc)}
.eden-bouton:disabled{opacity:.6;cursor:progress}
.eden-form{cursor:auto;gap:12px;padding-top:6px;min-width:0}
.eden-liste{margin:0;padding-left:1.1em;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
`;

/** L'Historique du bien : les modifications de son encart (qui, quand, « Champ : avant → après »), du plus récent. */
export function HistoriqueEncart({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<{ id: number; quand: string; texte: string; par: string }[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [n, setN] = useState(0);
  useRelectureBien(lotId, () => setN((x) => x + 1));
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?modifsEncart=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => { if (vivant) setLignes(d.etat === 'ok' && Array.isArray(d.data) ? d.data as never : []); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [lotId, n]);
  if (lignes === null || lignes.length === 0) return null;
  const quand = (q: string): string => {
    const d = new Date(q);
    if (Number.isNaN(d.getTime())) return q;
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
    return `${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} à ${f({ hour: '2-digit', minute: '2-digit' })}`;
  };
  return (
    <section className="hdb-groupe hdb-groupe--bande" data-historique-encart>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Modifications de la fiche du bien
          <span className="gst-compte">{lignes.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="eden-histo">
          <style>{`.eden-histo{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}.eden-histo li{display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}.eden-histo small{color:var(--color-svv-muted)}`}</style>
          {lignes.map((l) => (
            <li key={l.id} data-modification-encart={l.id}>
              <span>{l.texte}</span>
              <small>{quand(l.quand)} · par {l.par}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
