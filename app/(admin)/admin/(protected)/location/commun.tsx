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
.loc-recherche--large{border-width:2px;padding:6px 8px 6px 16px}
.loc-recherche--large input{font-size:1.08rem;min-height:48px}
.loc-groupes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px 20px}
.loc-groupe h3{margin:0 0 4px;font-size:.95rem}
/* Les 3 grosses cases : le style des tuiles de l'accueil admin (GrilleModules : fond champ, bordure ligne, radius 14), en plus grand. */
.loc-cases{list-style:none;margin:0;padding:0;display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
.loc-case{display:flex;flex-direction:column;gap:8px;height:100%;box-sizing:border-box;min-height:9rem;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:14px;padding:20px 22px;text-decoration:none}
.loc-case:hover{border-color:var(--color-svv-line-strong-hover)}
.loc-case:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.loc-case-titre{font-weight:800;font-size:1.12rem;color:var(--color-svv-ink)}
.loc-case-phrase{font-size:.9rem;color:var(--color-svv-muted)}
.loc-cases--accueil .loc-case{min-height:18rem;padding:28px 30px;gap:14px;border-radius:20px}
.loc-cases--accueil .loc-case-titre{font-size:1.5rem;line-height:1.25}
.loc-case-ligne{display:block}
/* Arno (17/10/2026) — LA ZONE DE RÉSULTATS RÉSERVÉE : toujours là, hauteur FIXE (celle d'une zone à un résultat, mesurée
   101 px au bureau et 128 px au téléphone avant ce lot) ; les 3 cases ne bougent jamais. Trop de résultats : on défile dedans. */
.loc-zone-resultats{box-sizing:border-box;height:101px;flex:0 0 auto;overflow-y:auto;overscroll-behavior:contain}
.loc-zone-resultats--vide{border:0;background:transparent;padding:0}
/* L'EFFET 3D des 3 grosses cases : soulèvement + petit agrandissement + ombre forte et diffuse, ~200 ms ; au survol (souris
   seulement — rien sur un écran tactile) et au focus clavier. Ombre en couleurs du thème : sombre en Clair ; en Sombre, un
   halo clair (une ombre noire ne se verrait pas sur le fond le plus sombre du thème). */
.loc-cases--accueil,.loc-gros-boutons--3d{--loc-ombre-case:0 22px 44px -12px color-mix(in srgb, var(--color-svv-ink) 38%, transparent),0 8px 16px -8px color-mix(in srgb, var(--color-svv-ink) 22%, transparent)}
.svv-adm-root[data-theme='dark'] .loc-cases--accueil,.svv-adm-root[data-theme='dark'] .loc-gros-boutons--3d{--loc-ombre-case:0 22px 48px -10px color-mix(in srgb, var(--color-svv-line-strong-hover) 55%, transparent),0 0 0 1px var(--color-svv-line-strong-hover)}
@media (prefers-color-scheme: dark){ .svv-adm-root[data-theme='system'] .loc-cases--accueil,.svv-adm-root[data-theme='system'] .loc-gros-boutons--3d{--loc-ombre-case:0 22px 48px -10px color-mix(in srgb, var(--color-svv-line-strong-hover) 55%, transparent),0 0 0 1px var(--color-svv-line-strong-hover)} }
/* Le MÊME effet sur les 3 cases de l'accueil ET sur les 2 gros boutons de l'écran ① (Arno, 17/10/2026). */
.loc-cases--accueil .loc-case,.loc-gros-boutons--3d .loc-gros-bouton{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.loc-cases--accueil .loc-case:focus-visible,.loc-gros-boutons--3d .loc-gros-bouton:focus-visible{transform:translateY(-6px) scale(1.02);box-shadow:var(--loc-ombre-case);border-color:var(--color-svv-line-strong-hover)}
@media (hover:hover) and (pointer:fine){
  .loc-cases--accueil .loc-case:hover,.loc-gros-boutons--3d .loc-gros-bouton:hover{transform:translateY(-6px) scale(1.02);box-shadow:var(--loc-ombre-case);border-color:var(--color-svv-line-strong-hover)}
}
@media (prefers-reduced-motion:reduce){ .loc-cases--accueil .loc-case,.loc-gros-boutons--3d .loc-gros-bouton{transition:none} .loc-cases--accueil .loc-case:hover,.loc-cases--accueil .loc-case:focus-visible,.loc-gros-boutons--3d .loc-gros-bouton:hover,.loc-gros-boutons--3d .loc-gros-bouton:focus-visible{transform:none} }
.loc-tete-comme-accueil.svv-page-head{margin:0}
.loc-cases--accueil .loc-case-phrase{font-size:1rem;line-height:1.5}
.loc-bascule{display:inline-flex;border:1px solid var(--color-svv-line-strong);border-radius:10px;overflow:hidden}
.loc-bascule button{border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:0 14px;min-height:44px;font:inherit;font-weight:600;cursor:pointer}
.loc-bascule button + button{border-left:1px solid var(--color-svv-line-strong)}
.loc-bascule button[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface)}
.loc-sortie{border-radius:10px;padding:10px 12px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}
.loc-confirmation{border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:12px;background:var(--color-svv-field);color:var(--color-svv-ink)}
.loc-choix{list-style:none;margin:6px 0 0;padding:0;border:1px solid var(--color-svv-line);border-radius:10px;max-height:16rem;overflow:auto}
.loc-choix button{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);padding:10px 12px;min-height:44px;font:inherit;cursor:pointer}
.loc-choix button[aria-pressed="true"]{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);font-weight:700}
@media (max-width:760px){ .loc-cases{grid-template-columns:1fr} .loc-zone-resultats{height:128px} }
@media (max-width:640px){ .loc-arbre > li.loc-enfant{margin-left:16px} }
`;

/**
 * ══ LES ÉCRANS DE CRÉATION (Arno, 17/10/2026) — « AÉRÉ, inspiration légèrement playschool mais pro : grosses cases, gros
 * boutons, gros champs de saisie, coins arrondis, espacements larges, une section = une grande carte. » ══════════════════
 * Uniquement les variables du thème (Clair / Sombre / Système), comme tout le reste de la tuile. Portée : `.loc-ample`.
 */
export const CSS_LOCATION_CREATION = `
.loc-ample{gap:26px}
.loc-ample .loc-titre{font-size:1.7rem}
.loc-ample .loc-sous{font-size:1.02rem}
.loc-gros-boutons{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.loc-gros-bouton{display:flex;flex-direction:column;justify-content:center;gap:10px;box-sizing:border-box;height:100%;min-height:9.5rem;padding:26px 30px;border-radius:24px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);text-decoration:none;font-size:1.45rem;font-weight:800;line-height:1.2;cursor:pointer;text-align:left;font-family:inherit;width:100%}
.loc-gros-bouton:hover{border-color:var(--color-svv-ink)}
.loc-gros-bouton:focus-visible{outline:3px solid var(--color-svv-red);outline-offset:3px}
.loc-gros-bouton small{font-size:1rem;font-weight:500;color:var(--color-svv-muted);line-height:1.45}
.loc-gros-bouton--plein{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}
.loc-gros-bouton--plein small{color:var(--color-svv-surface)}
.loc-gros-bouton--plein:hover{border-color:var(--color-svv-ink)}
.loc-gros-bouton:disabled{opacity:.55;cursor:not-allowed}
.loc-gros-bouton--centre{align-items:center;text-align:center}
.loc-oui-non .loc-gros-bouton{min-height:7rem;font-size:1.6rem}
.loc-gros-bouton[aria-pressed="true"]{background:var(--color-svv-ink);border-color:var(--color-svv-ink);color:var(--color-svv-surface);box-shadow:0 0 0 4px var(--color-svv-line-strong)}
/* Le « Enregistrer » des cartes de contact (composant de la Gestion, inchangé là-bas) : ICI un vrai bouton, même taille
   que « Annuler », couleur du bouton principal du thème (Arno, 17/10/2026). */
.loc-ample .cp-form-boutons{flex-wrap:nowrap}
.loc-ample .cp-form-boutons .cp-bouton{flex:1 1 0;width:auto;min-height:52px;border-radius:14px}
.loc-ample .cp-form-boutons button[type="submit"]{background:var(--color-svv-red);border:1px solid var(--color-svv-red);color:var(--color-svv-surface)}
.loc-ample .cp-form-boutons button[type="submit"]:disabled{background:var(--color-svv-field);border-color:var(--color-svv-line);color:var(--color-svv-muted)}
.loc-section{border:1px solid var(--color-svv-line);border-radius:26px;padding:28px 30px;background:var(--color-svv-surface);display:flex;flex-direction:column;gap:18px}
.loc-section > h3{margin:0;font-size:1.35rem;font-weight:800;display:flex;align-items:center;gap:14px;color:var(--color-svv-ink)}
.loc-num{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:2.4rem;height:2.4rem;border-radius:999px;background:var(--color-svv-field);border:2px solid var(--color-svv-line-strong);font-size:1.1rem;font-weight:800;color:var(--color-svv-ink)}
.loc-section-phrase{margin:-8px 0 0;color:var(--color-svv-muted);font-size:1rem}
.loc-sous-section{display:flex;flex-direction:column;gap:14px;padding-top:6px}
.loc-sous-section > h4{margin:0;font-size:1.08rem;font-weight:700;color:var(--color-svv-ink)}
.loc-ample .loc-grille{grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:18px 22px}
.loc-ample .loc-champ{font-size:1rem;gap:8px;color:var(--color-svv-ink);font-weight:600}
.loc-ample .loc-champ input,.loc-ample .loc-champ select,.loc-ample .loc-champ textarea{min-height:58px;font-size:1.1rem;font-weight:400;border-radius:16px;border:2px solid var(--color-svv-line);padding:0 16px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-family:inherit;box-sizing:border-box;width:100%}
.loc-ample .loc-champ textarea{padding:14px 16px;min-height:9rem;resize:vertical;line-height:1.5}
.loc-ample .loc-champ input:focus,.loc-ample .loc-champ select:focus,.loc-ample .loc-champ textarea:focus{border-color:var(--color-svv-ink);outline:none}
.loc-oblig{color:var(--color-svv-red)}
.loc-manque{color:var(--color-svv-red);font-size:.95rem;font-weight:600;margin:0}
.loc-ample .svv-btn{min-height:52px;border-radius:16px;font-size:1.02rem;padding:0 22px}
.loc-pilules{display:flex;flex-wrap:wrap;gap:10px}
.loc-pilules button{min-height:54px;padding:0 22px;border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.05rem;font-weight:700;cursor:pointer}
.loc-pilules button[aria-pressed="true"]{background:var(--color-svv-ink);border-color:var(--color-svv-ink);color:var(--color-svv-surface)}
.loc-pilules button:focus-visible{outline:3px solid var(--color-svv-red);outline-offset:2px}
.loc-puces{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:12px}
.loc-puce{display:inline-flex;align-items:center;gap:12px;border-radius:999px;padding:8px 8px 8px 20px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);font-size:1.05rem;font-weight:700;border:2px solid var(--color-svv-green-ink)}
.loc-puce small{font-weight:500;font-size:.9rem}
.loc-puce button{width:40px;height:40px;border-radius:999px;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.1rem;font-weight:800;cursor:pointer}
.loc-ample .loc-recherche{border-radius:18px;padding:6px 10px 6px 18px}
.loc-ample .loc-recherche input{min-height:54px;font-size:1.1rem}
.loc-ample .loc-choix{border-radius:16px}
.loc-ample .loc-choix button{min-height:58px;font-size:1.05rem;padding:12px 18px}
.loc-annexes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.loc-annexes > li{border:2px solid var(--color-svv-line);border-radius:20px;padding:18px 20px;background:var(--color-svv-field)}
.loc-annexes > li.loc-racine{background:var(--color-svv-surface);font-weight:700;font-size:1.05rem}
.loc-annexes > li.loc-enfant{margin-left:34px;position:relative}
.loc-annexes > li.loc-enfant::before{content:"";position:absolute;left:-24px;top:-16px;bottom:50%;width:18px;border-left:3px solid var(--color-svv-line-strong);border-bottom:3px solid var(--color-svv-line-strong);border-bottom-left-radius:10px}
.loc-annexes .loc-annexe-tete{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin:0 0 12px;font-weight:800;font-size:1.08rem;color:var(--color-svv-ink)}
.loc-collant{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:12px 16px;justify-content:flex-end;align-items:center;padding:16px 18px;margin:0 -2px;border:1px solid var(--color-svv-line);border-radius:22px;background:var(--color-svv-surface)}
.loc-collant .loc-manques{flex:1 1 16rem;margin:0;color:var(--color-svv-muted);font-size:.98rem}
.loc-collant .svv-btn{width:auto}
.loc-collant .svv-btn-primary{min-height:60px;font-size:1.15rem;padding:0 32px}
.loc-annexe-tete .svv-btn{width:auto}
.loc-cartes-creation{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr));gap:20px;align-items:start}
.loc-cartes-creation .cp-carte{width:auto;max-width:100%;min-width:0;border-radius:22px;padding:20px}
.loc-ample .cp-saisie{min-height:52px;font-size:1.05rem;border-radius:12px}
.loc-ample .cp-form-titre{font-size:1.15rem}
.loc-recap{display:flex;flex-direction:column;gap:6px;border:2px solid var(--color-svv-green-ink);border-radius:22px;padding:20px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.loc-recap strong{font-size:1.15rem}
.loc-recap .loc-boutons{justify-content:flex-start}
.loc-ajouter-carte{display:flex;align-items:center;justify-content:center;min-height:10rem;border:2px dashed var(--color-svv-line-strong);border-radius:22px;background:transparent;color:var(--color-svv-ink);font:inherit;font-size:1.2rem;font-weight:800;cursor:pointer;width:100%}
.loc-ajouter-carte:hover{border-color:var(--color-svv-ink)}
@media (max-width:760px){
  .loc-gros-boutons{grid-template-columns:1fr}
  .loc-gros-bouton{min-height:7.5rem;font-size:1.25rem;padding:22px}
  .loc-section{padding:20px 18px;border-radius:22px}
  .loc-annexes > li.loc-enfant{margin-left:22px}
  .loc-annexes > li.loc-enfant::before{left:-16px;width:12px}
  .loc-collant{padding:12px 14px;gap:8px 10px}
  .loc-collant .loc-manques{flex-basis:100%;font-size:.9rem}
  .loc-collant .svv-btn-primary{flex:1 1 auto;padding:0 18px}
}
`;
