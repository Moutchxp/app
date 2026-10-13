/**
 * ══ 🔴🔴 LOT AGENDA-TITRE-ET-LIENS (Arno, 13/10/2026) — L'ADRESSE DE BASE DES LIENS SORTANTS DE LA GESTION ═══════════
 *
 * Constat d'Arno : le lien « Fiche du bien » d'un événement d'agenda pointait vers une adresse de TUNNEL TEMPORAIRE
 * (`*.trycloudflare.com`, lue dans `SITE_URL`) qui n'existait déjà plus (DNS_PROBE_FINISHED_NXDOMAIN) : lien mort.
 *
 * 🔴 UNE SEULE ADRESSE, RÉGLÉE À UN SEUL ENDROIT : la variable `GESTION_URL_APPLICATION` (fichier `.env`). Elle sert à
 * TOUS les liens sortants de la Gestion : description des événements d'agenda ET liens « Accepter / Refuser » des
 * mails de demande. (`SITE_URL` n'est plus lue ici : elle reste celle des certificats et de la veille.)
 *
 * 🔴 JAMAIS UN TUNNEL TEMPORAIRE (trycloudflare, ngrok) : une telle adresse est ignorée, comme une adresse absente ou
 * mal formée. On retombe alors sur `http://localhost:3000`, et le lien porte la mention « (lien valable sur
 * l'ordinateur où tourne l'application) » — un lien qui marche sur le Mac plutôt qu'un lien mort partout.
 *
 * PUR : aucune base, aucun réseau.
 */
export const VARIABLE_URL_APPLICATION = 'GESTION_URL_APPLICATION';
export const URL_LOCALE = 'http://localhost:3000';
export const MENTION_LIEN_LOCAL = '(lien valable sur l’ordinateur où tourne l’application)';

const TUNNEL = /(^|\.)(trycloudflare\.com|ngrok(-free)?\.(io|app|dev)|ngrok\.io|loca\.lt|localtunnel\.me)$/i;
const LOCAL = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])$/i;

/** L'hôte est-il un tunnel temporaire ? PUR. */
export function estTunnelTemporaire(hote: string): boolean {
  return TUNNEL.test(hote.trim());
}

/**
 * L'ADRESSE DE BASE des liens sortants, sans « / » final. `locale` vrai ⇒ les liens ne marchent que sur la machine
 * de l'application, et on le dit (`MENTION_LIEN_LOCAL`). PUR.
 */
export function adresseApplication(env: Record<string, string | undefined> = process.env): { base: string; locale: boolean } {
  const brut = (env[VARIABLE_URL_APPLICATION] ?? '').trim();
  if (brut !== '') {
    try {
      const u = new URL(brut);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !estTunnelTemporaire(u.hostname)) {
        return { base: `${u.origin}${u.pathname}`.replace(/\/+$/, ''), locale: LOCAL.test(u.hostname) };
      }
    } catch { /* adresse mal formée : repli local */ }
  }
  return { base: URL_LOCALE, locale: true };
}
