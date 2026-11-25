import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/client';
import { messageIdDemande } from '../gestion/acceptationTache';
import { adresseApplication } from '../gestion/adresseApplication';
import { chargerConfigGestion } from '../gestion/config';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { alerteDue, CHEMIN_ECRAN_VINGT, mailAlerteVingt, momentParis, nombreLocatairesAlerte, PREFIXE_OBJET_ALERTE_VINGT, HEURE_ALERTE } from './alerteVingt';
import { colonneExisteMemo } from './sondeLocation';
import { classerVingtPourcent } from './vingtPourcent';
import { lireSuiviVingtPourcent } from './vingtPourcentRepo';

/**
 * ══ 🔴🔴 L'ALERTE « 20 % À RESTITUER EN RETARD » — LA PASSE (Arno, 25/11/2026 ; remplace l'alerte du lundi du 24/11). IMPUR (base, envoi). ═══════
 * Appelée par la MINUTERIE DU SERVEUR WEB (`minuteriePrevisite.ts`, toutes les 5 minutes — l'ordonnanceur déjà en place) : à partir de 8 h (Paris),
 * tous les 2 jours, si au moins un locataire est en « Alerte restitution en retard », UN mail récapitulatif à l'adresse de la Gestion du réglage
 * (gestion@criterimmo.fr) ; aucun mail sinon. L'ancien mail du lundi (« [Urgent] … ») ne part plus ; ses lignes restent au journal.
 *   · LE JOURNAL : la table de la 514, SANS NOUVELLE MIGRATION — sa colonne `lundi` porte désormais LE JOUR de l'envoi (le nom date de l'alerte
 *     du lundi) ; les envois de cette alerte s'y reconnaissent à leur objet (« [Alerte] 20 % à restituer en retard — … ») ;
 *   · LE RYTHME : le dernier envoi RÉUSSI de cette alerte date d'au moins 2 jours (`alerteDue`) ; un serveur arrêté le jour prévu envoie le lendemain ;
 *   · LE DOUBLE ENVOI : sous verrou, un « envoye » déjà journalisé pour ce jour (index unique de la 514, toutes alertes confondues) → rien ne part ;
 *   · CHAQUE TENTATIVE EST JOURNALISÉE : « envoye » ou « echec » (motif) ; un échec est réessayé à la passe suivante ;
 *   · LE TRANSPORT est celui des mails de la Location (`transportParDefaut`) : en RECETTE, le verrou réseau l'intercepte comme les autres ;
 *   · LE MODE ESSAI (`essai: true`) : le mail tel qu'il partirait, quel que soit le jour — RIEN n'est envoyé, RIEN n'est écrit.
 * Sans la 514 : jamais d'envoi (pas de garde contre le double envoi) ; l'essai reste possible.
 */

export const alerteVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_alerte_vingt', 'lundi');

export interface MailAlerteVingtLu { de: string; a: string[]; objet: string; texte: string; html: string; nombre: number; lundi: string }
export type IssueAlerteVingt =
  | { etat: 'pas_le_moment'; jour: string }
  | { etat: 'aucun_retard'; jour: string }
  | { etat: 'deja_envoye'; jour: string }
  | { etat: 'sans_schema'; jour: string }
  | { etat: 'essai'; mail: MailAlerteVingtLu | null }
  | { etat: 'envoye' | 'echec'; mail: MailAlerteVingtLu; motif: string | null };

export interface DepsAlerteVingt { maintenant?: Date; essai?: boolean; transport?: TransportDemande; env?: Record<string, string | undefined> }

/** Le mail du jour (ou `null` : personne en « Alerte restitution en retard »). Lecture seule. */
async function preparerMail(jour: string, env: Record<string, string | undefined>): Promise<MailAlerteVingtLu | null> {
  const lu = await lireSuiviVingtPourcent();
  const retard = classerVingtPourcent(lu).retard;
  if (retard.length === 0) return null;
  const config = await chargerConfigGestion();
  const lien = `${adresseApplication(env).base.replace(/\/+$/, '')}${CHEMIN_ECRAN_VINGT}`;
  const m = mailAlerteVingt(retard, lien, lu.aujourdhui);
  return { de: config.adresseGestion, a: [config.adresseGestion], ...m, nombre: nombreLocatairesAlerte(retard), lundi: jour };
}

/** Le dernier envoi RÉUSSI de cette alerte (AAAA-MM-JJ) ou `null`. */
const SQL_DERNIER_ENVOI = `SELECT max(lundi)::text AS d FROM gestion_location_alerte_vingt WHERE statut = 'envoye' AND objet LIKE $1`;
const motifObjet = `${PREFIXE_OBJET_ALERTE_VINGT}%`;

/** UNE PASSE : rien avant 8 h ni moins de 2 jours après le dernier envoi ; personne en retard : rien ; déjà un envoi ce jour : rien ; sinon UN mail, journalisé. */
export async function passeAlerteVingt(d: DepsAlerteVingt = {}): Promise<IssueAlerteVingt> {
  const env = d.env ?? process.env;
  const m = momentParis(d.maintenant ?? new Date());
  if (d.essai === true) return { etat: 'essai', mail: await preparerMail(m.jour, env) };
  if (m.heure < HEURE_ALERTE) return { etat: 'pas_le_moment', jour: m.jour };
  if (!(await alerteVingtDisponible())) return { etat: 'sans_schema', jour: m.jour };
  // avant toute lecture lourde : un envoi ce jour (toutes alertes : index unique) ? le dernier de cette alerte date-t-il de 2 jours ?
  const { rows: deja } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_location_alerte_vingt WHERE lundi = $1 AND statut = 'envoye'`, [m.jour]);
  if (Number(deja[0]?.n ?? 0) > 0) return { etat: 'deja_envoye', jour: m.jour };
  const { rows: der } = await query<{ d: string | null }>(SQL_DERNIER_ENVOI, [motifObjet]);
  if (!alerteDue(m, der[0]?.d ?? null)) return { etat: 'pas_le_moment', jour: m.jour };
  const mail = await preparerMail(m.jour, env);
  if (mail === null) return { etat: 'aucun_retard', jour: m.jour };
  const transport = d.transport ?? transportParDefaut(env);
  return withTransaction(async (q) => {
    // un seul envoi à la fois ; relu SOUS le verrou (deux processus, deux passes)
    await q('SELECT pg_advisory_xact_lock(514, 1)');
    const { rows } = await q<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_location_alerte_vingt WHERE lundi = $1 AND statut = 'envoye'`, [m.jour]);
    if (Number(rows[0]?.n ?? 0) > 0) return { etat: 'deja_envoye', jour: m.jour } as IssueAlerteVingt;
    const { rows: d2 } = await q<{ d: string | null }>(SQL_DERNIER_ENVOI, [motifObjet]);
    if (!alerteDue(m, d2[0]?.d ?? null)) return { etat: 'pas_le_moment', jour: m.jour } as IssueAlerteVingt;
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
