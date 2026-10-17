'use client';

import { useCallback, useEffect, useState } from 'react';
import { MOTIF_SANS_MIGRATION } from '../../../../lib/gestion/annuaireEdition';
import type { GestesCartes } from '../gestion/CartesPersonnes';

/**
 * ══ TUILE LOCATION — CE QUE TOUS SES ÉCRANS PARTAGENT ═══════════════════════════════════════════════════════════════
 * Les appels à `/api/admin/location` (la seule porte de la tuile), l'en-tête avec son retour, et la feuille de style.
 * 🔴 Correction d'Arno (17/10/2026) : les écrans de la Location vivent ICI, jamais dans la Gestion ; seules les DONNÉES
 * sont communes.
 */
export const API = '/api/admin/location';

export type Chargement<T> = { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: T };

/** Lit `/api/admin/location?…` et rend l'état de chargement. `rafraichir` relit sans recharger la page. */
export function useLecture<T>(parametres: string | null): { etat: Chargement<T>; rafraichir: () => void } {
  /**
   * 🔴🔴 CORRECTIF DU 17/10/2026 (plantage de l'accueil sur les vraies données de recette) — LA RÉPONSE EST LIÉE À LA
   * DEMANDE QUI L'A PRODUITE. Avant, changer d'onglet rendait UNE fois l'écran avec les lignes de l'onglet précédent
   * (la remise à « chargement » n'arrivait qu'après, dans l'effet) : des propriétaires étaient lus comme des biens, sans
   * `annexes`, et l'écran tombait. Désormais une réponse n'est montrée que pour SES paramètres ; pour toute autre
   * demande, on est « en chargement » DÈS LE RENDU — sans attendre l'effet. Un simple rafraîchissement (mêmes
   * paramètres, après un geste) garde l'affichage en place jusqu'à la nouvelle réponse : pas de clignotement.
   */
  const [lu, setLu] = useState<{ cle: string; etat: Chargement<T> } | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (parametres === null) return;
    let vivant = true;
    const poser = (etat: Chargement<T>): void => { if (vivant) setLu({ cle: parametres, etat }); };
    void (async () => {
      try {
        const res = await fetch(`${API}?${parametres}`, { cache: 'no-store' });
        if (res.status === 403) { poser({ etat: 'erreur', message: 'Accès refusé : droit « Location » requis.' }); return; }
        const d = await res.json() as { etat?: string; data?: T; message?: string };
        if (d.etat === 'ok' && d.data !== undefined) poser({ etat: 'ok', data: d.data });
        else if (d.etat === 'inconnu') poser({ etat: 'erreur', message: 'Cette fiche n’existe plus.' });
        else if (d.etat === 'sans_schema') poser({ etat: 'erreur', message: MOTIF_SANS_MIGRATION });
        else poser({ etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
      } catch {
        poser({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' });
      }
    })();
    return () => { vivant = false; };
  }, [parametres, n]);
  const etat: Chargement<T> = lu !== null && parametres !== null && lu.cle === parametres ? lu.etat : { etat: 'charge' };
  return { etat, rafraichir: useCallback(() => setN((x) => x + 1), []) };
}

/** Une liste attendue : toujours un tableau, même si la réponse n'en porte pas (jamais `undefined.map`). */
export const liste = <T,>(x: readonly T[] | null | undefined): readonly T[] => (Array.isArray(x) ? x : []);

/** Envoie un geste. Rend `null` si c'est enregistré, sinon le motif (jamais une exception). */
export async function envoyer(corps: Record<string, unknown>): Promise<{ motif: string | null; data?: unknown }> {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await res.json() as { etat?: string; motif?: string; message?: string; data?: unknown };
    if (d.etat === 'ok') return { motif: null, data: d.data };
    if (d.etat === 'sans_schema') return { motif: MOTIF_SANS_MIGRATION };
    if (d.etat === 'inconnu') return { motif: 'Cette fiche n’existe plus.' };
    return { motif: d.motif ?? d.message ?? 'Enregistrement refusé.' };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.' };
  }
}

/**
 * Les gestes des CARTES de personnes (le même composant que la Gestion, pour les mêmes données), branchés sur la porte
 * de la Location. Pas de « Supprimer » ni d'ordre ici : la fiche se corrige, s'archive ou se sépare, comme ailleurs.
 */
export function gestesLocation(modifiable: boolean, apres: () => void): GestesCartes {
  const geste = async (corps: Record<string, unknown>): Promise<string | null> => {
    const r = await envoyer(corps);
    if (r.motif === null) apres();
    return r.motif;
  };
  return {
    modifiable,
    onEnregistrer: (sujet, id, champs) => geste({ action: 'modifier', sujet, id, champs }),
    onArchiver: (sujet, id, archiver) => geste({ action: archiver ? 'archiver' : 'restaurer', sujet, id }),
    onSeparer: (sujet, id, o) => geste({ action: 'separer', sujet, id, ...o }),
    onOrdonner: async () => null,
    onAjouter: () => {},
  };
}

export function EnTeteLocation({ titre, sous, actions, retour = true }: {
  titre: string; sous?: React.ReactNode; actions?: React.ReactNode; retour?: boolean;
}) {
  return (
    <header className="loc-tete">
      {retour && <p className="loc-retour"><a href="/admin/location">← Location</a></p>}
      <div className="loc-tete-ligne">
        <div>
          <h2 className="loc-titre">{titre}</h2>
          {sous !== undefined && <p className="loc-sous">{sous}</p>}
        </div>
        {actions !== undefined && <div className="loc-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function EtatLecture({ etat }: { etat: Chargement<unknown> }) {
  if (etat.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (etat.etat === 'erreur') return <p className="gst-erreur" role="alert">{etat.message}</p>;
  return null;
}

export const CSS_LOCATION_ECRANS = `
.loc-page{display:flex;flex-direction:column;gap:16px}
.loc-retour{margin:0 0 6px}
.loc-tete-ligne{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}
.loc-titre{margin:0;font-size:1.3rem;font-weight:800}
.loc-sous{margin:4px 0 0;color:var(--color-svv-muted)}
.loc-actions{display:flex;flex-wrap:wrap;gap:8px}
.loc-bloc{border:1px solid var(--color-svv-line);border-radius:14px;padding:14px 16px;background:var(--color-svv-surface)}
.loc-bloc h3{margin:0 0 10px;font-size:1rem}
.loc-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 14px}
.loc-champ{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--color-svv-muted)}
.loc-champ input,.loc-champ select{min-height:44px;border:1px solid var(--color-svv-line);border-radius:9px;padding:0 10px;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.loc-boutons{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:10px}
.loc-actions .svv-btn,.loc-boutons .svv-btn,.loc-alerte .svv-btn{width:auto}
/* Bouton rouge plein : texte en couleur de SURFACE (convention de la Gestion, cf. .hdb-petit--actif) — blanc en Clair, encre
   sombre sur le rouge clair du thème Sombre (≈ 5,8:1, contre 2,78:1 pour du blanc). Limité à la tuile Location. */
.loc-page .svv-btn-primary{color:var(--color-svv-surface)}
.loc-select{min-height:44px;border:1px solid var(--color-svv-line);border-radius:9px;padding:0 10px;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-surface);max-width:100%}
.loc-liste{list-style:none;margin:0;padding:0}
.loc-liste > li{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-svv-line)}
.loc-liste > li:last-child{border-bottom:0}
.loc-liste a{font-weight:600}
.loc-muet{color:var(--color-svv-muted);font-size:.88rem}
.loc-pastille{display:inline-block;border-radius:999px;padding:1px 9px;font-size:.75rem;font-weight:700;background:var(--color-svv-field);color:var(--color-svv-muted)}
.loc-pastille--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.loc-pastille--violet{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}
.loc-arbre{list-style:none;margin:0;padding:0}
.loc-arbre > li{border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;margin:0 0 8px;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:space-between;align-items:center}
.loc-arbre > li.loc-enfant{margin-left:28px;position:relative}
.loc-arbre > li.loc-enfant::before{content:"";position:absolute;left:-18px;top:-9px;bottom:50%;width:14px;border-left:2px solid var(--color-svv-line);border-bottom:2px solid var(--color-svv-line);border-bottom-left-radius:6px}
.loc-onglets{display:flex;gap:4px;border-bottom:1px solid var(--color-svv-line);margin:0 0 8px;flex-wrap:wrap}
.loc-onglets button{border:0;background:transparent;padding:10px 14px;min-height:44px;font:inherit;font-weight:700;color:var(--color-svv-muted);cursor:pointer}
.loc-onglets button[aria-selected="true"]{color:var(--color-svv-red);border-bottom:3px solid var(--color-svv-red)}
.loc-recherche{display:flex;gap:8px;align-items:center;border:2px solid var(--color-svv-ink);border-radius:12px;padding:4px 6px 4px 14px;background:var(--color-svv-surface)}
.loc-recherche input{flex:1;border:0;min-height:44px;font:inherit;font-size:1rem;background:transparent;color:var(--color-svv-ink);outline:none}
.loc-alerte{border-radius:10px;padding:10px 12px;background:var(--color-svv-blue-soft);color:var(--color-svv-blue);font-size:.92rem}
.loc-alerte a{color:inherit}
.loc-alerte--orange{background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.loc-cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
/* La carte commune de la Gestion se cale sur la largeur de l'ÉCRAN ; dans un bloc de la Location, sur celle de sa colonne. */
.loc-cartes .cp-carte{width:auto;max-width:100%;min-width:0}
@media (max-width:640px){ .loc-arbre > li.loc-enfant{margin-left:16px} }
`;
