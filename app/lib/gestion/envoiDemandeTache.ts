import 'server-only';
import { randomUUID } from 'node:crypto';
import { construireRfc822, envoyerViaGmail, type MessageAEnvoyer } from './envoiGmail';
import { lireIdentifiants, rafraichirJeton } from './google';
import { lireJeton } from './googleJeton';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — LE TRANSPORT DU MAIL DE DEMANDE ═════════════════════════════════════════════════
 *
 * Arno : « le mail part de gestion@criterimmo.fr, par la voie d'envoi déjà existante, sans nouvelle autorisation
 * Google ». Le transport RÉEL est donc celui du composeur : le jeton de gestion@ (`googleJeton` + `rafraichirJeton`,
 * comme `envoiReel.ts`), le message RFC 822 de `construireRfc822`, et `envoyerViaGmail`. Rien d'autre.
 *
 * 🔴 AUCUN VRAI MAIL PENDANT LES TESTS : sous vitest (ou NODE_ENV=test), le transport est TOUJOURS factice, quoi
 * que dise le réglage. Et en dehors des tests, rien ne part tant que le réglage « Envoyer les demandes
 * d'acceptation par mail » est désactivé (c'est `envoyerDemande` qui le lit, dans `acceptationRepo.ts`).
 */
export type IssueTransport = { ok: true; id: string | null; factice: boolean } | { ok: false; motif: string };
export interface TransportDemande { envoyer(m: MessageAEnvoyer): Promise<IssueTransport> }

/** Les messages « envoyés » par le transport factice — lus par les tests, jamais par l'application. */
export const ENVOIS_FACTICES: MessageAEnvoyer[] = [];

export const transportFactice: TransportDemande = {
  async envoyer(m) { ENVOIS_FACTICES.push(m); return { ok: true, id: null, factice: true }; },
};

export const transportReel: TransportDemande = {
  async envoyer(m) {
    const identifiants = lireIdentifiants();
    const jeton = lireJeton();
    if (identifiants === null || jeton === null) return { ok: false, motif: 'La connexion Google de gestion@ n’est pas configurée.' };
    const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch }).catch(() => null);
    if (acces === null || !acces.ok) return { ok: false, motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' };
    const r = await envoyerViaGmail({ accessToken: acces.valeur, rfc822: construireRfc822(m, randomUUID().replace(/-/g, "")) }, { fetch });
    return r.ok ? { ok: true, id: r.gmailMessageId, factice: false } : { ok: false, motif: r.motif };
  },
};

/** Sous les tests, TOUJOURS factice. Ailleurs, le transport réel (que le réglage autorise ou non à utiliser). */
export function transportParDefaut(env: Record<string, string | undefined> = process.env): TransportDemande {
  return env.VITEST || env.NODE_ENV === 'test' ? transportFactice : transportReel;
}
