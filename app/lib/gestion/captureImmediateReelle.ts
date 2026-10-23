import { query } from '../db/client';
import type { DepsCaptureImmediate } from './captureImmediate';

/**
 * Câblage RÉEL de la capture immédiate d'un envoi (voir `captureImmediate.ts`). Tout ce qui écrit passe par les fonctions de la
 * relève, sans en écrire de seconde : `ecrireMessage`, `resoudreFil`, `deposerPiecesMessage`, et les passes `appliquer…EnAttente`
 * de `suiteReleveReel`. Imports DYNAMIQUES : l'analyseur de mail et le dépôt de capture ne se chargent qu'au moment d'un envoi.
 *
 * ⚠️ PAS DE `server-only` ICI : le travailleur d'envoi tourne aussi sous tsx (relève continue), comme `gardeEnvoiCompte`.
 */
export function depsCaptureImmediateReelle(jetonAcces: () => Promise<string | null>): DepsCaptureImmediate {
  return {
    jetonAcces,
    lireOriginal: async (jeton, gmailId) => {
      const { lireOriginalGmailOctets } = await import('./google');
      return lireOriginalGmailOctets(jeton, gmailId, { fetch });
    },
    analyser: async (original) => {
      const { simpleParser } = await import('mailparser');
      const { versMessageBoite } = await import('../email/imap');
      const { versMessageBrut } = await import('./captureRepo');
      /* uid 0 : ce message n'a pas d'UID IMAP (il n'a pas été lu dans le dossier) ; il n'en enregistre donc aucun. */
      return versMessageBrut(versMessageBoite(await simpleParser(original), 0) as never);
    },
    config: async () => (await import('./config')).chargerConfigGestion(),
    reglesActives: async () => (await import('./captureRepo')).lireReglesActives(),
    dejaConnu: async (mid) => {
      const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_message WHERE message_id = $1`, [mid]);
      return (rows[0]?.n ?? 0) > 0;
    },
    resoudreFil: async (ids, cle, objet) => (await import('./captureRepo')).resoudreFil(ids, cle, objet),
    ecrire: async (m, filId) => {
      const { ecrireMessage } = await import('./captureRepo');
      const s = await import('./schema');
      /* avecUid = false : AUCUN UID n'est écrit (la relève, elle, reconnaîtra le message par son Message-ID). */
      return ecrireMessage(m, filId, null, false, await s.deplacementsDeMailsDisponibles(),
        await s.destinatairesSeparesDisponibles(), false, false);
    },
    deposerPieces: async (id, pieces, config) => (await import('./captureRepo')).deposerPiecesMessage(id, pieces, config),
    memoriserGmailId: async (id, gmailId) => {
      await query(`UPDATE gestion_message SET gmail_message_id = $2 WHERE id = $1 AND gmail_message_id IS NULL`, [id, gmailId]);
    },
    appliquerIntentions: async () => {
      const c = await import('./envoiCiblesRepo');
      await c.appliquerCiblesEnAttente();
      await (await import('./envoiClassementRepo')).appliquerClassementsEnAttente();
      await (await import('./envoiPartiesRepo')).appliquerPartiesEnAttente();
      await c.appliquerInterneEnAttente();
      await c.appliquerHorsGestionEnAttente();
    },
  };
}

/** Le geste d'après-envoi, partagé par le travailleur de la file et l'envoi direct : une seule écriture, deux appelants. */
export async function capturerApresEnvoi(
  o: { envoiId: number; gmailMessageId: string }, jetonAcces: () => Promise<string | null>, origine: string,
): Promise<void> {
  const { capturerEnvoiImmediat } = await import('./captureImmediate');
  const issue = await capturerEnvoiImmediat(o.gmailMessageId, depsCaptureImmediateReelle(jetonAcces));
  if (issue.etat === 'impossible') {
    console.warn('[gestion/%s] envoi %d parti, capture immédiate impossible (%s) : la relève le prendra.', origine, o.envoiId, issue.motif);
  }
}
