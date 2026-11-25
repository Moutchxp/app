import { query } from '../db/client';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { refusUnLocataireParMail, type CleModeleVingt } from './mailVingtPourcent';
import { colonneExisteMemo } from './sondeLocation';
import { SQL_MESSAGE_DE_L_ENVOI } from '../gestion/envoiCiblesRepo';
import type { MailVingtEnvoye } from './vingtPourcent';

/**
 * ══ 🔴🔴 « UN MAIL PAR LOCATAIRE » — LE CONTRÔLE DU SERVEUR (Arno, 25/11/2026, décision 2A). IMPUR (base), LECTURE SEULE. ═════════════════════════════
 * Pour un mail parti de l'écran « 20 % à restituer » (marque `vingtPourcent: { sortieId }`), le serveur relit LUI-MÊME les adresses encore valables de
 * chaque locataire de la sortie (jamais une liste venue du navigateur) et applique `refusUnLocataireParMail`. Les autres mails ne passent pas ici.
 */
export async function adressesDesLocatairesDeLaSortie(sortieId: number): Promise<string[][]> {
  const vivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<{ locataire: string; adresse: string | null }>(
    `SELECT o.locataire_id::text AS locataire, nullif(btrim(coalesce(c.valeur_brute, c.valeur)), '') AS adresse
       FROM gestion_location_sortie_validee s
       JOIN gestion_annuaire_occupation o ON o.id = ANY(s.occupation_ids)
       LEFT JOIN gestion_annuaire_contact c ON c.sujet = 'locataire' AND c.sujet_id = o.locataire_id AND c.sorte = 'email' AND c.absent_le IS NULL${vivante}
      WHERE s.id = $1`, [sortieId]);
  const par = new Map<string, string[]>();
  for (const r of rows) {
    const l = par.get(r.locataire) ?? [];
    if (r.adresse !== null) l.push(r.adresse);
    par.set(r.locataire, l);
  }
  return [...par.values()];
}

/** Le refus (motif) d'un mail parti de l'écran « 20 % à restituer », ou `null`. */
export async function refusMailVingtPourcent(sortieId: number, destinataires: readonly string[]): Promise<string | null> {
  return refusUnLocataireParMail(await adressesDesLocatairesDeLaSortie(sortieId), destinataires);
}

// ══ 🔴🔴 Arno (25/11/2026) — « x mail(s) envoyé(s) depuis cette page » (migration 515) ══════════════════════════════════════════════════════════════
export const mailsVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_mail_vingt', 'cle_idempotence');

/** À la demande d'envoi (route `envois`, après le contrôle « un mail par locataire ») : le lien envoi ↔ ligne. Sans la 515 : rien. Ne lève jamais. */
export async function noterMailVingt(o: { sortieId: number; cleIdempotence: string; modele: CleModeleVingt | null }): Promise<void> {
  try {
    if (!(await mailsVingtDisponible())) return;
    await query(`INSERT INTO gestion_location_mail_vingt (sortie_validee_id, cle_idempotence, modele) VALUES ($1, $2, $3) ON CONFLICT (cle_idempotence) DO NOTHING`,
      [o.sortieId, o.cleIdempotence, o.modele]);
  } catch (e) { console.warn('[20 % à restituer] lien du mail non noté : %s', (e as Error)?.message ?? 'erreur'); }
}

/**
 * Les mails RÉELLEMENT PARTIS du module de chaque ligne : l'envoi de même clé est « envoye », et il n'est pas une SIMULATION de la recette (le verrou réseau
 * répond à un envoi intercepté par un identifiant Gmail « recette-… » : intercepté, il n'est pas parti, il ne compte pas). Ni brouillon, ni envoi en file
 * ou en échec. Le lien vers le mail : dès que la relève l'a capturé (le même rapprochement que les cibles d'envoi). Sans la 515 : rien. LECTURE SEULE.
 */
export async function mailsEnvoyesDesSorties(sortieIds: readonly number[]): Promise<Map<number, MailVingtEnvoye[]>> {
  const out = new Map<number, MailVingtEnvoye[]>();
  if (sortieIds.length === 0 || !(await mailsVingtDisponible())) return out;
  const { rows } = await query<{ sortie: string; modele: string | null; le: string; a: unknown; cc: unknown; cci: unknown; message: string | null; fil: string | null }>(
    `SELECT x.sortie, x.modele, x.le, x.a, x.cc, x.cci, m.id::text AS message, m.fil_id::text AS fil
       FROM (SELECT l.sortie_validee_id::text AS sortie, l.modele, to_char(e.parti_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI') AS le,
                    e.dest_a AS a, e.dest_cc AS cc, e.dest_cci AS cci, ${SQL_MESSAGE_DE_L_ENVOI} AS message_id, e.parti_le
               FROM gestion_location_mail_vingt l JOIN gestion_envoi e ON e.cle_idempotence = l.cle_idempotence
              WHERE l.sortie_validee_id = ANY($1::bigint[]) AND e.etat = 'envoye' AND e.parti_le IS NOT NULL
                AND coalesce(e.gmail_message_id, '') NOT LIKE 'recette-%') x
       LEFT JOIN gestion_message m ON m.id = x.message_id
      ORDER BY x.parti_le, x.sortie`, [sortieIds]);
  const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  for (const r of rows) {
    const k = Number(r.sortie);
    const l = out.get(k) ?? [];
    l.push({ le: r.le, a: liste(r.a), copies: liste(r.cc).length + liste(r.cci).length, modele: r.modele,
      lien: r.message !== null && r.fil !== null ? `/admin/gestion?fil=${r.fil}&message=${r.message}` : null });
    out.set(k, l);
  }
  return out;
}
