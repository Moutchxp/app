/**
 * ══ 🔴🔴 LOT GESTION-MENU-HISTORIQUE (Arno, 16/10/2026) — UN MENU OUVERT SE REFERME QUAND LA PAGE PERD LE FOCUS ═══════════
 *
 * DÉFAUT CONSTATÉ : le menu du bouton « Historique » ne se refermait pas quand on cliquait dans le CORPS du mail, juste
 * en dessous. Ce corps est rendu dans un cadre isolé (`CadreMail`, une iframe) : un clic dedans n'atteint JAMAIS le
 * document de la page — l'écouteur « clic à côté » ne l'entend pas. En revanche, il retire le focus à la page : la
 * fenêtre reçoit `blur`. On referme donc aussi sur `blur` (même effet qu'un clic à côté : rien d'autre ne se passe).
 * Rend la fonction qui retire l'écouteur, à appeler au démontage / à la fermeture.
 */
export function fermerQuandLaPagePerdLeFocus(fermer: () => void): () => void {
  const surPerte = (): void => { fermer(); };
  window.addEventListener('blur', surPerte);
  return () => window.removeEventListener('blur', surPerte);
}
