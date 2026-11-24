import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/client';
import { messageIdDemande } from '../gestion/acceptationTache';
import { adresseApplication } from '../gestion/adresseApplication';
import { chargerConfigGestion } from '../gestion/config';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { alerteDue, CHEMIN_ECRAN_VINGT, mailAlerteVingt, momentParis } from './alerteVingt';
import { colonneExisteMemo } from './sondeLocation';
import { classerVingtPourcent } from './vingtPourcent';
import { lireSuiviVingtPourcent } from './vingtPourcentRepo';

/**
 * ══ 🔴🔴 L'ALERTE HEBDOMADAIRE « 20 % À RESTITUER » — LA PASSE (Arno, 24/11/2026). IMPUR (base, envoi). ═══════════════════════════════════════════
 * Appelée par la MINUTERIE DU SERVEUR WEB (`minuteriePrevisite.ts`, toutes les 5 minutes — l'ordonnanceur déjà en place) : le lundi à partir de 8 h
 * (Paris), si au moins un locataire est en « Urgence », UN mail récapitulatif à l'adresse de la Gestion (gestion@criterimmo.fr) ; aucun mail sinon.
 *   · LE DOUBLE ENVOI : sous verrou, un « envoye » déjà journalisé pour ce lundi (514, index unique) → rien ne part ;
 *   · CHAQUE TENTATIVE EST JOURNALISÉE (514) : « envoye » ou « echec » (motif) ; un échec est réessayé à la passe suivante, le même lundi ;
 *   · LE TRANSPORT est celui des mails de la Location (`transportParDefaut`) : en RECETTE, le verrou réseau l'intercepte comme les autres — rien
 *     n'est contourné ; le Message-ID porte la marque des mails de l'application (la relève de gestion@ ne le rattache à aucun bien) ;
 *   · LE MODE ESSAI (`essai: true`) : le mail tel qu'il partirait, quel que soit le jour — RIEN n'est envoyé, RIEN n'est écrit.
 * Sans la 514 : jamais d'envoi (pas de garde contre le double envoi) ; l'essai reste possible.
 */

export const alerteVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_alerte_vingt', 'lundi');

export interface MailAlerteVingtLu { de: string; a: string[]; objet: string; texte: string; html: string; nombre: number; lundi: string }
export type IssueAlerteVingt =
  | { etat: 'pas_le_moment'; jour: string }
  | { etat: 'aucune_urgence'; jour: string }
  | { etat: 'deja_envoye'; jour: string }
  | { etat: 'sans_schema'; jour: string }
  | { etat: 'essai'; mail: MailAlerteVingtLu | null }
  | { etat: 'envoye' | 'echec'; mail: MailAlerteVingtLu; motif: string | null };

export interface DepsAlerteVingt { maintenant?: Date; essai?: boolean; transport?: TransportDemande; env?: Record<string, string | undefined> }

/** Le mail du jour (ou `null` : personne en urgence). Lecture seule. */
async function preparerMail(jour: string, env: Record<string, string | undefined>): Promise<MailAlerteVingtLu | null> {
  const lu = await lireSuiviVingtPourcent();
  const urgence = classerVingtPourcent(lu).urgence;
  if (urgence.length === 0) return null;
  const config = await chargerConfigGestion();
  const lien = `${adresseApplication(env).base.replace(/\/+$/, '')}${CHEMIN_ECRAN_VINGT}`;
  const m = mailAlerteVingt(urgence, lien, lu.aujourdhui);
  return { de: config.adresseGestion, a: [config.adresseGestion], ...m, nombre: urgence.length, lundi: jour };
}

/** UNE PASSE : rien hors du lundi matin ; personne en urgence : rien ; déjà envoyée ce lundi : rien ; sinon UN mail, journalisé. Ne lève jamais. */
export async function passeAlerteVingt(d: DepsAlerteVingt = {}): Promise<IssueAlerteVingt> {
  const env = d.env ?? process.env;
  const m = momentParis(d.maintenant ?? new Date());
  if (d.essai === true) return { etat: 'essai', mail: await preparerMail(m.jour, env) };
  if (!alerteDue(m)) return { etat: 'pas_le_moment', jour: m.jour };
  if (!(await alerteVingtDisponible())) return { etat: 'sans_schema', jour: m.jour };
  // avant toute lecture lourde : déjà envoyée ce lundi ?
  const { rows: deja } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_location_alerte_vingt WHERE lundi = $1 AND statut = 'envoye'`, [m.jour]);
  if (Number(deja[0]?.n ?? 0) > 0) return { etat: 'deja_envoye', jour: m.jour };
  const mail = await preparerMail(m.jour, env);
  if (mail === null) return { etat: 'aucune_urgence', jour: m.jour };
  const transport = d.transport ?? transportParDefaut(env);
  return withTransaction(async (q) => {
    // un seul envoi à la fois ; relu SOUS le verrou (deux processus, deux passes)
    await q('SELECT pg_advisory_xact_lock(514, 1)');
    const { rows } = await q<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_location_alerte_vingt WHERE lundi = $1 AND statut = 'envoye'`, [m.jour]);
    if (Number(rows[0]?.n ?? 0) > 0) return { etat: 'deja_envoye', jour: m.jour } as IssueAlerteVingt;
    const domaine = mail.de.split('@')[1] ?? '';
    const r = await transport.envoyer({ de: mail.de, deNom: 'Gestion', a: mail.a, cc: [], cci: [], objet: mail.objet, corps: mail.texte, corpsHtml: mail.html,
      messageId: messageIdDemande(domaine, randomBytes(12).toString('hex')) }).catch((e: unknown) => ({ ok: false as const, motif: (e as Error)?.message ?? 'envoi impossible' }));
    const statut = r.ok ? 'envoye' : 'echec';
    const motif = r.ok ? null : r.motif;
    await q(`INSERT INTO gestion_location_alerte_vingt (lundi, statut, nombre, destinataires, objet, motif) VALUES ($1, $2, $3, $4, $5, $6)`,
      [m.jour, statut, mail.nombre, mail.a, mail.objet, motif]);
    return { etat: statut, mail, motif } as IssueAlerteVingt;
  });
}
