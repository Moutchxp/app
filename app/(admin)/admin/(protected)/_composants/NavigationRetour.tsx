'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { verifierApresChangementDePage } from './verrouDefilement';
import {
  adresseInterne, apresRetour, clicASuivre, CLE_PILE, CLE_RESTAURER, empiler, lirePile, origineDe, restaurationPour, type Depart, type Restauration,
} from '../../../../lib/navigation/retour';

/**
 * ══ 🔴🔴 LE « ← RETOUR » VERS LA PAGE D'ORIGINE — LE MÉCANISME COMMUN, CÔTÉ NAVIGATEUR (Arno, 11/11/2026) ══════════════════════════════════
 * Règles : `lib/navigation/retour.ts`. Ici, quatre pièces, et rien d'autre ailleurs :
 *   · `SuiviNavigationRetour` — monté UNE fois (gabarit des pages protégées) : note un départ à chaque lien interne suivi dans le même
 *     onglet, et applique la RESTAURATION (défilement) quand la page d'origine se recharge ;
 *   · `useEtatRetour` — un bloc inscrit son état (ligne dépliée, filtres) : noté au départ, rendu au retour ;
 *   · `LienRetour` — LE lien « ← Retour » de toutes les pages : vers l'origine si elle est connue, sinon vers la page parente (comme avant) ;
 *   · `retourVersOrigine()` / `noterDepart()` — pour les boutons et les changements d'écran qui ne sont pas des liens (Gestion).
 * Tout est borné à l'onglet (sessionStorage) ; sans stockage disponible, chaque lien de retour suit son adresse parente, comme avant.
 */

const registre = new Map<string, () => unknown>();
/** La navigation vers l'origine (remplaçable par les épreuves : jsdom ne sait pas changer de page). */
export const naviguerRetour = { vers: (url: string): void => { window.location.assign(url); } };
const EVENEMENT = 'svav-retour-restaurer';
const ici = (): string => `${window.location.pathname}${window.location.search}`;
const lire = (cle: string): string | null => { try { return window.sessionStorage.getItem(cle); } catch { return null; } };
const ecrire = (cle: string, v: string | null): void => {
  try { if (v === null) window.sessionStorage.removeItem(cle); else window.sessionStorage.setItem(cle, v); } catch { /* sans stockage : le parent */ }
};
const etatDesBlocs = (): Record<string, unknown> => {
  const e: Record<string, unknown> = {};
  for (const [cle, lireValeur] of registre) { try { e[cle] = lireValeur(); } catch { /* un bloc démonté : ignoré */ } }
  return e;
};

/** Note un DÉPART d'ici vers `vers` (adresse interne) : défilement et état des blocs inscrits. */
export function noterDepart(vers: string): void {
  if (typeof window === 'undefined') return;
  const cible = adresseInterne(vers, window.location.origin);
  if (cible === null) return;
  const d: Depart = { depuis: ici(), vers: cible, defilement: window.scrollY, etat: etatDesBlocs(), le: Date.now() };
  ecrire(CLE_PILE, JSON.stringify(empiler(lirePile(lire(CLE_PILE)), d)));
}

/** L'origine connue de la page courante (ou `null`). */
export function origineCourante(): Depart | null {
  if (typeof window === 'undefined') return null;
  return origineDe(lirePile(lire(CLE_PILE)), ici())?.depart ?? null;
}

/**
 * RETOURNE À L'ORIGINE si elle est connue : pose la restauration (état, défilement), retire le départ de la pile, et y va. Rend `false`
 * sans origine — l'appelant suit alors son chemin d'avant (adresse parente, écran par défaut).
 */
export function retourVersOrigine(o: {
  /** Seulement si l'origine est sur la MÊME page (un écran de la Gestion) : sinon, rien (l'appelant garde son geste). */
  memePage?: boolean;
  /** Pour une origine sur la même page : y aller SANS recharger (l'écran se change lui-même), puis l'état et le défilement sont rendus. */
  naviguer?: (url: string) => void;
} = {}): boolean {
  if (typeof window === 'undefined') return false;
  const pile = lirePile(lire(CLE_PILE));
  const t = origineDe(pile, ici());
  if (t === null) return false;
  const memeChemin = new URL(t.depart.depuis, window.location.origin).pathname === window.location.pathname;
  if (o.memePage === true && !memeChemin) return false;
  const r: Restauration = { url: t.depart.depuis, defilement: t.depart.defilement, etat: t.depart.etat, le: Date.now() };
  ecrire(CLE_RESTAURER, JSON.stringify(r));
  ecrire(CLE_PILE, JSON.stringify(apresRetour(pile, t.index)));
  if (memeChemin && o.naviguer !== undefined) {
    o.naviguer(t.depart.depuis);
    window.dispatchEvent(new Event(EVENEMENT));
    return true;
  }
  naviguerRetour.vers(t.depart.depuis);
  return true;
}

/** La restauration en attente pour la page courante (lue sans la consommer). */
function restaurationIci(): Restauration | null {
  return typeof window === 'undefined' ? null : restaurationPour(lire(CLE_RESTAURER), ici(), Date.now());
}

/**
 * UN BLOC INSCRIT SON ÉTAT : `valeur` est notée à chaque départ ; au retour, `appliquer` reçoit la valeur notée (une fois). `cle` doit être
 * propre au bloc ET à son écran (deux instances d'un même composant ne partagent pas leur état).
 */
export function useEtatRetour<T>(cle: string, valeur: T, appliquer: (v: T) => void): void {
  const courante = useRef(valeur);
  const appliquerRef = useRef(appliquer);
  useEffect(() => { courante.current = valeur; appliquerRef.current = appliquer; });
  useEffect(() => {
    registre.set(cle, () => courante.current);
    const r = restaurationIci();
    if (r !== null && cle in r.etat) appliquerRef.current(r.etat[cle] as T);
    return () => { registre.delete(cle); };
  }, [cle]);
}

/**
 * LE SUIVI, MONTÉ UNE FOIS. ① Un clic sur un lien interne (même onglet) note un départ. ② Une navigation sans lien (`router.push`) vers une
 * AUTRE page aussi. ③ À l'arrivée sur la page d'origine : le défilement est rendu quand le contenu est assez haut (les listes se chargent
 * après coup), puis la restauration est retirée.
 */
export function SuiviNavigationRetour() {
  // 🔴 Arno (11/11/2026) — à chaque changement de page : aucun blocage du défilement ne survit sans fenêtre ouverte (`verrouDefilement`).
  const chemin = usePathname();
  useEffect(() => {
    const t = window.setTimeout(verifierApresChangementDePage, 0);
    return () => window.clearTimeout(t);
  }, [chemin]);
  useEffect(() => {
    const clic = (e: MouseEvent): void => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a === null) return;
      if (!clicASuivre({ href: a.getAttribute('href'), target: a.getAttribute('target'), download: a.hasAttribute('download'), bouton: e.button,
        modificateur: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, empeche: e.defaultPrevented, lienRetour: a.hasAttribute('data-retour-lien') })) return;
      noterDepart(a.href);
    };
    document.addEventListener('click', clic);
    window.addEventListener('popstate', verifierApresChangementDePage);
    // Les navigations de l'application sans lien (`router.push`) vers une autre page : notées elles aussi.
    const pousser = window.history.pushState;
    window.history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      const vers = args[2];
      if (typeof vers === 'string' || vers instanceof URL) {
        const cible = adresseInterne(String(vers), window.location.origin);
        if (cible !== null && new URL(cible, window.location.origin).pathname !== window.location.pathname) noterDepart(String(vers));
      }
      return pousser.apply(this, args);
    };
    // La restauration du défilement : réessayée tant que la page n'est pas assez haute (au plus ~6 s).
    let essais = 0;
    let minuterie: number | undefined;
    const appliquer = (): void => {
      const r = restaurationIci();
      if (r === null) return;
      window.clearInterval(minuterie);
      essais = 0;
      minuterie = window.setInterval(() => {
        essais += 1;
        const possible = document.documentElement.scrollHeight - window.innerHeight >= r.defilement - 2;
        if (possible) window.scrollTo(0, r.defilement);
        if ((possible && Math.abs(window.scrollY - r.defilement) < 3) || essais > 60) {
          window.clearInterval(minuterie);
          ecrire(CLE_RESTAURER, null);
        }
      }, 100);
    };
    appliquer();
    window.addEventListener(EVENEMENT, appliquer);
    return () => {
      document.removeEventListener('click', clic);
      window.removeEventListener('popstate', verifierApresChangementDePage);
      window.history.pushState = pousser;
      window.removeEventListener(EVENEMENT, appliquer);
      window.clearInterval(minuterie);
    };
  }, []);
  return null;
}

/**
 * LE LIEN « ← RETOUR » COMMUN. `href` / `mot` : la page PARENTE et son libellé, ceux d'avant (sans origine connue, rien ne change). Origine
 * connue : « ← Retour », vers elle, dans son état. `surClic` (une modale à refermer) garde la priorité, comme avant.
 */
export function LienRetour({ href, mot = 'Retour', className, surClic, enfants, ...donnees }: {
  href: string; mot?: string; className?: string; surClic?: () => void; enfants?: ReactNode; [donnee: `data-${string}`]: string | undefined;
}) {
  const [origine, setOrigine] = useState(false);
  // Lu APRÈS le montage : le rendu du serveur et le premier rendu du navigateur sont identiques (le libellé d'avant).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOrigine(surClic === undefined && origineCourante() !== null); }, [surClic]);
  return (
    <a href={href} className={className} data-retour-lien="" data-retour-origine={origine ? 'oui' : 'non'} {...donnees}
      onClick={(e) => {
        if (surClic !== undefined) { e.preventDefault(); surClic(); return; }
        if (retourVersOrigine()) e.preventDefault();
      }}>
      {enfants ?? `← ${origine ? 'Retour' : mot}`}
    </a>
  );
}
