/** La navigation de la page de connexion (isolée pour être éprouvée : jsdom ne laisse pas espionner `window.location`). */
export function allerA(url: string, o: { remplacer?: boolean } = {}): void {
  if (o.remplacer) window.location.replace(url); else window.location.assign(url);
}
