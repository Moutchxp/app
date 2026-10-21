'use client';

import { useEffect, useState } from 'react';
import { ModaleIssue } from './ModaleIssue';
import { annonceDeLaReponse, requeteAConfirmer, type Annonce } from '../../../../lib/location/confirmationEnregistrement';

/**
 * ══ 🔴🔴 TUILE LOCATION — L'HÔTE DES CONFIRMATIONS D'ENREGISTREMENT (Arno, 21/10/2026) ═════════════════════════════════════════
 *
 * Monté UNE fois pour toute la tuile (`location/layout.tsx`). Il enveloppe `fetch` (dès son premier rendu, avant les écrans) et,
 * pour chaque écriture vers les routes de la Location et de la fiche commune (`requeteAConfirmer`) :
 *   · le BOUTON qui l'a déclenchée passe à « Enregistrement… » et ne répond plus au clic tant que la réponse n'est pas là ;
 *   · une MÊME requête déjà en vol n'est pas renvoyée (double clic, double Entrée) : le second appel reçoit la même réponse ;
 *   · à la réponse : la modale VERTE « ✓ … » (résumé, « Voir la fiche ») ou ROUGE (quoi, pourquoi, quoi faire ; saisie conservée).
 * La réponse rendue à l'écran est INTACTE : ses messages d'avant restent ; la modale s'y ajoute. Hors de la tuile : rien.
 */
type FenetreAvecFetch = Window & { __svavConfirmations?: { origine: typeof fetch; actif: boolean } };
const EVENEMENT = 'svav:enregistrement';
const MS_DERNIER_CLIC = 2000;

let dernierBouton: { el: HTMLElement; le: number } | null = null;

/** Marque le bouton du geste : « Enregistrement… », clic bloqué. Rend la fonction qui le rend à son état. */
function marquerBouton(): () => void {
  const b = dernierBouton !== null && Date.now() - dernierBouton.le < MS_DERNIER_CLIC && dernierBouton.el.isConnected ? dernierBouton.el : null;
  dernierBouton = null;
  if (b === null || b.dataset.enregistrement === 'en-cours') return () => {};
  b.style.setProperty('--enr-couleur', getComputedStyle(b).color);
  b.dataset.enregistrement = 'en-cours';
  b.setAttribute('aria-busy', 'true');
  return () => { delete b.dataset.enregistrement; b.removeAttribute('aria-busy'); b.style.removeProperty('--enr-couleur'); };
}

/** Le nom de la fiche affichée (son titre), pour le résumé. */
function ficheAffichee(): string | null {
  const t = document.querySelector('.ann-tete-nom, .svv-page-title, h1');
  const s = (t?.textContent ?? '').trim();
  return s === '' ? null : s.slice(0, 160);
}

export function installerConfirmations(w: FenetreAvecFetch = window as FenetreAvecFetch): void {
  if (w.__svavConfirmations !== undefined) { w.__svavConfirmations.actif = true; return; }
  const origine = w.fetch;
  const etat = { origine, actif: true };
  w.__svavConfirmations = etat;
  const enVol = new Map<string, Promise<Response>>();
  w.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET');
    // Hors de la tuile Location (l'hôte démonté) : l'enveloppe laisse tout passer, telle quelle.
    const r = etat.actif ? requeteAConfirmer(url, methode, init?.body, init?.headers !== undefined ? new Headers(init.headers) : null) : null;
    if (r === null) return origine.call(w, entree, init);
    const cle = `${methode} ${url} ${typeof init?.body === 'string' ? init.body : ''}`;
    const deja = enVol.get(cle);
    if (deja !== undefined) return deja.then((c) => c.clone());   // double clic : la même réponse, aucune seconde écriture
    const rendre = marquerBouton();
    const base = origine.call(w, entree, init);
    const copie = base.then((x) => x.clone());
    copie.catch(() => undefined);   // un serveur muet : l'écran reçoit l'erreur par `base` ; la copie ne doit pas lever en plus
    enVol.set(cle, copie);
    const fin = (): void => { rendre(); setTimeout(() => enVol.delete(cle), 400); };
    base.then(async () => {
      const c = await copie;
      const json = await c.clone().json().catch(() => null);
      const a = annonceDeLaReponse({ action: r.action, corps: r.corps, statut: c.status, json, fiche: ficheAffichee() });
      if (a !== null) w.dispatchEvent(new CustomEvent<Annonce>(EVENEMENT, { detail: a }));
    }, () => {
      const a = annonceDeLaReponse({ action: r.action, corps: r.corps, statut: null, json: null, fiche: null });
      if (a !== null) w.dispatchEvent(new CustomEvent<Annonce>(EVENEMENT, { detail: a }));
    }).finally(fin);
    return base;
  }) as typeof fetch;
  // Le bouton du geste : le dernier bouton pressé (souris, toucher, clavier) ou le bouton d'envoi d'un formulaire.
  const noter = (e: Event): void => {
    if (!etat.actif) return;
    const el = (e.target as Element | null)?.closest?.('button, [type="submit"], [role="button"]') as HTMLElement | null;
    if (el !== null) dernierBouton = { el, le: Date.now() };
  };
  w.document.addEventListener('click', noter, true);
  w.document.addEventListener('submit', (e) => { const s = (e as SubmitEvent).submitter as HTMLElement | null; if (s) dernierBouton = { el: s, le: Date.now() }; }, true);
}

export function ConfirmationsEnregistrement() {
  // Dès le premier rendu (avant les effets des écrans, qui chargent et écrivent) — comme l'en-tête de contexte de la fiche.
  useState(() => { if (typeof window !== 'undefined') installerConfirmations(); return null; });
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  useEffect(() => {
    const ecouter = (e: Event): void => setAnnonce((e as CustomEvent<Annonce>).detail);
    installerConfirmations();
    window.addEventListener(EVENEMENT, ecouter);
    return () => {
      window.removeEventListener(EVENEMENT, ecouter);
      const e = (window as FenetreAvecFetch).__svavConfirmations;
      if (e !== undefined) e.actif = false;
    };
  }, []);
  const ici = typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`;
  return (
    <>
      <style>{CSS_ENREGISTREMENT_EN_COURS}</style>
      {annonce !== null && (annonce.sorte === 'succes' ? (
        <ModaleIssue sorte="succes" titre={annonce.titre} lignes={annonce.lignes} notes={annonce.notes} onFermer={() => setAnnonce(null)}
          actions={[{ libelle: 'Fermer', onClick: () => setAnnonce(null), repere: 'fermer-confirmation' },
            { libelle: 'Voir la fiche', href: ici, principal: true, repere: 'voir-fiche-confirmation' }]} />
      ) : (
        <ModaleIssue sorte="erreur" titre={annonce.titre} echec={annonce.echec} onFermer={() => setAnnonce(null)}
          actions={[{ libelle: 'Fermer', onClick: () => setAnnonce(null), principal: true, repere: 'fermer-confirmation' }]} />
      ))}
    </>
  );
}

/** Le bouton en attente : son texte cède la place à « Enregistrement… » ; plus de clic. AUCUN ACCENT GRAVE ICI. */
export const CSS_ENREGISTREMENT_EN_COURS = `
[data-enregistrement="en-cours"]{position:relative;color:transparent !important;pointer-events:none;cursor:progress}
[data-enregistrement="en-cours"] *{visibility:hidden}
[data-enregistrement="en-cours"]::after{content:"Enregistrement…";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--enr-couleur);visibility:visible;white-space:nowrap;overflow:hidden;font-weight:inherit}
`;
