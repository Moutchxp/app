/**
 * ══ 🔴 Arno (13/11/2026) — LE RETOUR APRÈS CONNEXION ══════════════════════════════════════════════════════════════════════════════
 * Le cookie de session est `SameSite=Strict` (et le reste) : un lien ouvert depuis une AUTRE application (Mail sur iPhone, Gmail…) arrive
 * SANS le cookie, et le garde renvoie à la connexion. La page demandée est donc portée par `?retour=` jusqu'à la connexion, qui y ramène
 * — ou, si la session est en fait valide (la page de connexion, elle, est du même site et reçoit le cookie), y ramène tout de suite.
 * 🔴 SÉCURITÉ : seul un chemin INTERNE à l'admin est accepté (pas d'autre site, pas de `//`, pas de schéma, pas de barre oblique inverse,
 * pas la page de connexion elle-même) : jamais une redirection ouverte. ⚠️ AUCUN IMPORT (pur, partagé entre le garde et la page).
 *
 * ══ 🔴 Arno (14/11/2026, production) — JAMAIS DE BOUCLE ═══════════════════════════════════════════════════════════════════════════
 * Le retour automatique n'avait AUCUNE borne : si la sonde reçoit le cookie (requête du même site) mais que la navigation AUTOMATIQUE qui suit
 * (`location.replace`, sans geste de l'utilisateur) part sans lui — ce que WebKit (Safari ET Chrome sur iPhone) peut faire après une
 * arrivée depuis une autre application —, le garde renvoie à la connexion, la sonde réussit, on repart… sans fin.
 * Le retour automatique porte donc la marque `reprise=1` : le garde la conserve dans `retour`, et la connexion qui la revoit NE REPART PLUS
 * d'elle-même — elle affiche un message et un bouton (un TOUCHER : navigation de l'utilisateur, le cookie part). Au plus un aller-retour.
 */
export const PARAM_RETOUR = 'retour';
/** La marque du retour automatique déjà tenté (une seule fois). */
export const PARAM_REPRISE = 'reprise';
const LONGUEUR_MAX = 1000;

/** Le chemin de retour s'il est sûr (`/admin…`), sinon null. PUR. */
export function retourSur(x: string | null | undefined): string | null {
  if (typeof x !== 'string' || x.length === 0 || x.length > LONGUEUR_MAX) return null;
  if (!/^\/admin(?:[/?#]|$)/.test(x)) return null;
  if (x.includes('//') || x.includes('\\') || /[\u0000-\u001f\u007f]/.test(x)) return null;
  if (/^\/admin\/login(?:[/?#]|$)/.test(x)) return null;
  return x;
}

/** L'adresse de la connexion qui ramène à `chemin` (chemin + requête de la page demandée) ; sans retour sûr : la connexion seule. PUR. */
export function urlConnexion(chemin: string): string {
  const r = retourSur(chemin);
  return r === null || r === '/admin' ? '/admin/login' : `/admin/login?${PARAM_RETOUR}=${encodeURIComponent(r)}`;
}

const decouper = (chemin: string): { base: string; requete: URLSearchParams; ancre: string } => {
  const i = chemin.indexOf('#');
  const sansAncre = i < 0 ? chemin : chemin.slice(0, i);
  const ancre = i < 0 ? '' : chemin.slice(i);
  const q = sansAncre.indexOf('?');
  return { base: q < 0 ? sansAncre : sansAncre.slice(0, q), requete: new URLSearchParams(q < 0 ? '' : sansAncre.slice(q + 1)), ancre };
};
const recoller = (x: { base: string; requete: URLSearchParams; ancre: string }): string => {
  const s = x.requete.toString();
  return `${x.base}${s ? `?${s}` : ''}${x.ancre}`;
};

/** Le retour automatique a-t-il déjà été tenté pour ce chemin ? PUR. */
export const estReprise = (chemin: string): boolean => decouper(chemin).requete.get(PARAM_REPRISE) === '1';

/** Le chemin marqué « retour automatique tenté ». PUR. */
export function avecReprise(chemin: string): string {
  const x = decouper(chemin); x.requete.set(PARAM_REPRISE, '1'); return recoller(x);
}

/** Le chemin sans la marque (l'adresse que voit l'utilisateur, ou celle d'un geste). PUR. */
export function sansReprise(chemin: string): string {
  const x = decouper(chemin);
  if (!x.requete.has(PARAM_REPRISE)) return chemin;
  x.requete.delete(PARAM_REPRISE); return recoller(x);
}

/**
 * Ce que fait la page de connexion qui porte `retour` : `aller` (retour automatique, une fois), `proposer` (déjà tenté : message et bouton,
 * jamais de nouveau départ automatique), `former` (session absente : le formulaire). PUR.
 */
export function decisionRetour(retour: string, sessionValide: boolean): { geste: 'aller'; vers: string } | { geste: 'proposer'; vers: string } | { geste: 'former' } {
  if (!sessionValide) return { geste: 'former' };
  return estReprise(retour) ? { geste: 'proposer', vers: sansReprise(retour) } : { geste: 'aller', vers: avecReprise(retour) };
}

export const MESSAGE_REPRISE = 'Votre session est ouverte, mais ce navigateur n’a pas transmis la connexion en ouvrant le lien (lien venu d’une autre application). Touchez « Ouvrir la page demandée » — ou reconnectez-vous ci-dessous.';
export const MESSAGE_CONNEXION_RETOUR = 'Connectez-vous pour ouvrir la page demandée.';
