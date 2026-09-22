/**
 * BASE ABSOLUE DU SITE pour les QR de certificat — source UNIQUE des trois documents.
 *
 * Les trois documents portent un QR construit sur cette base (cf. `pdf/certificatPdf.ts:118`,
 * `visuel/genererVisuelPng.ts:57`) :
 *   - nominatif  : {base}/verifier?n=<numéro>&j=<jeton>
 *   - anonymisé  : {base}/verifier?n=<numéro>&j=<jeton>&doc=anonyme
 *   - visuel PNG : {base}/verifier?ref=<référence>&doc=visuel
 *
 * ── Pourquoi cette garde ─────────────────────────────────────────────────────────────────────────
 * Une URL imprimée dans un QR FAIT FOI et ne doit JAMAIS changer après émission. La garde historique
 * (`SITE_URL` absente ou mal formée → document non fabriqué) ne savait pas refuser une adresse
 * syntaxiquement valide mais PÉRISSABLE. Constaté le 22/09/2026 : le certificat SAVV-2026-000023 a été
 * émis avec `SITE_URL=http://192.168.1.164:3000`, une ancienne IP DHCP du Mac — le QR pointait vers une
 * machine qui n'existait plus (ping 100 % de perte, ARP incomplète), et le scan n'affichait rien.
 *
 * ── Ce que la garde fait, et quand ───────────────────────────────────────────────────────────────
 * UNIQUEMENT en production (`NODE_ENV === 'production'`) : l'adresse doit être en https et son hôte ne
 * doit être ni local, ni privé, ni un tunnel jetable. Refus = comportement IDENTIQUE à la garde
 * existante (document NON fabriqué, erreur tracée).
 * En développement : AUCUNE adresse n'est refusée — les certificats d'essai en local doivent continuer
 * à fonctionner — mais une adresse temporaire déclenche un AVERTISSEMENT explicite en console.
 *
 * ⚠️ Ne couvre QUE les QR de certificat. Les autres usages de `SITE_URL` (liens de confirmation CADA,
 * `veille/propositionAuto.ts`, `veille/surveillancePolygonesAuto.ts`) gardent leur propre lecture : ce
 * sont des liens d'e-mail révocables, pas des adresses gravées dans un document qui fait foi.
 */

/** Hôtes locaux : la machine elle-même, sous ses formes équivalentes. */
const HOTE_LOCAL = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?::1\]?)$/i;

/** Plages IPv4 PRIVÉES (RFC 1918) : joignables seulement depuis le réseau où la machine se trouve. */
const IP_PRIVEE = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

/** Tunnel rapide Cloudflare : l'hôte change À CHAQUE lancement — jamais gravable dans un document. */
const TUNNEL_CLOUDFLARE = /(^|\.)trycloudflare\.com$/i;

/** ngrok, toutes déclinaisons (ngrok.io, ngrok-free.app, ngrok.app…) : même caractère jetable. */
const TUNNEL_NGROK = /(^|\.)ngrok/i;

/**
 * Motif pour lequel l'adresse est TEMPORAIRE (non gravable dans un certificat), ou `null` si elle est
 * durable. Exporté pour les tests et pour l'avertissement de développement.
 */
export function motifAdresseTemporaire(url: URL): string | null {
  if (url.protocol !== 'https:') return 'adresse non chiffrée (http)';
  const hote = url.hostname;
  if (HOTE_LOCAL.test(hote)) return `hôte local (${hote})`;
  if (IP_PRIVEE.test(hote)) return `adresse IP privée (${hote}) — change au gré du bail DHCP`;
  if (TUNNEL_CLOUDFLARE.test(hote)) return `tunnel rapide Cloudflare (${hote}) — change à chaque lancement`;
  if (TUNNEL_NGROK.test(hote)) return `tunnel ngrok (${hote}) — change à chaque lancement`;
  return null;
}

/**
 * Base absolue du site pour un QR de certificat (serveur only), sans barre oblique finale.
 * `null` = document NON fabriqué : absente, mal formée, ou — en production seulement — temporaire.
 */
export function siteUrlCertificat(): string | null {
  const brut = (process.env.SITE_URL ?? '').trim();
  // Garde historique, INCHANGÉE et toujours en premier : absente ou mal formée → null, dans tous les
  // environnements. Un QR vers une URL fausse est pire qu'un document absent.
  if (!/^https?:\/\/.+/.test(brut)) return null;

  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return null; // syntaxe acceptée par la regex mais refusée par l'analyseur d'URL → même traitement
  }

  const motif = motifAdresseTemporaire(url);
  if (motif === null) return brut.replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    // On trace l'hôte et le motif (une adresse de site n'est pas un secret) ; jamais le jeton, jamais
    // le numéro — aucun n'entre ici.
    console.error(`[site-url] SITE_URL refusée en production : ${motif}. Document NON fabriqué (QR périssable évité).`);
    return null;
  }

  console.warn(
    `[site-url] SITE_URL temporaire : ${motif}. Accepté en développement UNIQUEMENT — un QR gravé avec ` +
      `cette adresse cessera de fonctionner. Adresse publique définitive : https://authentification.sansvisavis.com`,
  );
  return brut.replace(/\/+$/, '');
}
