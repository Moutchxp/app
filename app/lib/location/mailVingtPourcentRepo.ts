import { query } from '../db/client';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { refusUnLocataireParMail, type CleMarqueVingt } from './mailVingtPourcent';
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

/**
 * 🔴🔴 Arno (25/11/2026) — « il faut une traçabilité depuis le préavis de ce locataire, pour que le bien soit clairement identifié du début du préavis
 * jusqu'à la restitution finale » : LE bien d'un mail parti d'une ligne, relu par le serveur sur la SORTIE VALIDÉE (`lot_id` posé à la validation, jamais
 * recalculé : ni l'adresse, ni le bail en cours — un logement reloué entre-temps garde son identité). `null` : sortie introuvable. LECTURE SEULE.
 */
export async function cibleDeLaSortie(sortieId: number): Promise<{ sorte: 'lot'; cle: string | null; id: number; libelle: string } | null> {
  const { rows } = await query<{ id: string; cle: string | null; libelle: string | null }>(
    `SELECT lo.id::text, lo.wippimmo_id::text AS cle,
            nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS libelle
       FROM gestion_location_sortie_validee s JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id WHERE s.id = $1`, [sortieId]);
  const r = rows[0];
  return r === undefined ? null : { sorte: 'lot', cle: r.cle, id: Number(r.id), libelle: r.libelle ?? `Bien ${r.id}` };
}

/**
 * 🔴🔴 Arno (25/11/2026) — « combien de mails ont été échangés » : par fil, le nombre de mails (envoyés + reçus) et le dernier (Paris), comptés comme la
 * conversation de la boîte Gestion les montre (`lireMessagesDuFil` : un mail déplacé vers une autre carte n'y est plus). LECTURE SEULE.
 */
export async function comptesDesFils(filIds: readonly number[]): Promise<Map<number, { nombre: number; dernierLe: string | null }>> {
  const out = new Map<number, { nombre: number; dernierLe: string | null }>();
  if (filIds.length === 0) return out;
  const { rows } = await query<{ fil: string; nombre: string; dernier: string | null }>(
    `SELECT m.fil_id::text AS fil, count(*)::text AS nombre, to_char(max(m.recu_le) AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI') AS dernier
       FROM gestion_message m
      WHERE m.fil_id = ANY($1::bigint[])
        AND NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.message_id = m.id AND am.actif)
      GROUP BY m.fil_id`, [[...filIds]]);
  for (const r of rows) out.set(Number(r.fil), { nombre: Number(r.nombre), dernierLe: r.dernier });
  return out;
}

// ══ 🔴🔴 Arno (25/11/2026) — « x mail(s) envoyé(s) depuis cette page » (migration 515) ══════════════════════════════════════════════════════════════
export const mailsVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_mail_vingt', 'cle_idempotence');

/** À la demande d'envoi (route `envois`, après le contrôle « un mail par locataire ») : le lien envoi ↔ ligne. Sans la 515 : rien. Ne lève jamais. */
export async function noterMailVingt(o: { sortieId: number; cleIdempotence: string; modele: CleMarqueVingt | null }): Promise<void> {
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
      lien: r.message !== null && r.fil !== null ? `/admin/gestion?fil=${r.fil}&message=${r.message}` : null,
      messageId: r.message !== null ? Number(r.message) : null, filId: r.fil !== null ? Number(r.fil) : null });
    out.set(k, l);
  }
  return out;
}
