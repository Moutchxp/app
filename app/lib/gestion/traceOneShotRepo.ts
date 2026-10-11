import { query } from '../db/client';
import { photoDuFond, type PhotoFond } from './suiviOneShot';
import type { Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT TRACE-ONE-SHOT (migration 342) — LA PORTÉE ET LA PHOTO DU FOND, CÔTÉ BASE ════════════════════════════
 *
 * Deux services, et rien d'autre :
 *   · `traceOneShotDisponible()` : les colonnes de la 342 sont-elles là ? Sans elles, AUCUNE écriture ne les nomme —
 *     le geste s'écrit exactement comme avant ce lot (leçon de la 293 : nommer une colonne absente fait échouer tout
 *     le geste, pas seulement sa trace) ;
 *   · `photoDuFondEnBase(messageId)` : la photo du suivi de fond JUSTE AVANT un geste « ce mail uniquement », lue en
 *     base (fenêtres vivantes du fil + marque d'échange). À appeler AVANT d'écrire quoi que ce soit.
 *
 * ⚠️ PAS D'IMPORT DE `periodeRepo` ICI, et c'est voulu : `periodeRepo` appelle ce module. Les fenêtres sont relues
 * par une requête courte, la même que `suiviDuFil` (seuls la sorte, les biens et les personnes servent à la photo).
 * ⚠️ UNE PHOTO QUI ÉCHOUE NE BLOQUE JAMAIS LE GESTE : elle rend `null`, et la modale recalculera.
 */

let disponible: boolean | null = null;

export async function traceOneShotDisponible(): Promise<boolean> {
  if (disponible === true) return true;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE (table_name = 'gestion_message_exception' AND column_name = 'fond_avant')
           OR (table_name = 'gestion_message_interne' AND column_name IN ('portee', 'fond_avant'))
           OR (table_name = 'gestion_hors_gestion' AND column_name IN ('portee', 'fond_avant'))
           OR (table_name = 'gestion_rattachement' AND column_name = 'sorti_fond_avant')`);
    disponible = (rows[0]?.n ?? 0) === 6;
  } catch { disponible = false; }
  return disponible;
}

/** Pour les épreuves : relire la disponibilité. */
export function oublierDisponibiliteTraceOneShot(): void { disponible = null; }

export async function photoDuFondEnBase(messageId: number): Promise<PhotoFond | null> {
  try {
    const { rows: m } = await query<{ fil_id: string | null }>(
      'SELECT fil_id::text FROM gestion_message WHERE id = $1', [messageId]);
    const filId = m[0]?.fil_id === null || m[0]?.fil_id === undefined ? null : Number(m[0].fil_id);
    if (filId === null) return { fenetre: null, interneEchange: false, le: new Date().toISOString() };
    const { rows: mails } = await query<{ id: string }>(
      'SELECT id::text FROM gestion_message WHERE fil_id = $1 ORDER BY recu_le, id', [filId]);
    const { rows: pr } = await query<{
      id: string; depuis: string; sorte: string;
      biens: { cle: string; libelle: string }[] | null;
      personnes: { sorte: 'proprietaire' | 'locataire'; cle: string; libelle: string }[] | null;
    }>(
      `SELECT p.id::text, p.depuis_message_id::text AS depuis, p.sorte,
              (SELECT json_agg(json_build_object('cle', b.cible_cle, 'libelle', b.cible_libelle))
                 FROM gestion_fil_periode_bien b WHERE b.periode_id = p.id) AS biens,
              (SELECT json_agg(json_build_object('sorte', x.cible_sorte, 'cle', x.cible_cle,
                                                 'libelle', coalesce(x.cible_libelle, x.cible_cle)))
                 FROM gestion_fil_periode_personne x WHERE x.periode_id = p.id) AS personnes
         FROM gestion_fil_periode p
        WHERE p.fil_id = $1 AND p.remplacee_le IS NULL
        ORDER BY p.id`, [filId]);
    const periodes: Periode[] = pr.map((r) => ({
      id: Number(r.id), depuisMessageId: Number(r.depuis),
      classement: r.sorte === 'biens'
        ? { sorte: 'biens', biens: r.biens ?? [], ...((r.personnes ?? []).length > 0 ? { personnes: r.personnes ?? [] } : {}) }
        : { sorte: r.sorte === 'interne' ? 'interne' : 'hors_gestion', biens: [] },
    }));
    const { rows: ie } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_fil_interne WHERE fil_id = $1 AND retire_le IS NULL', [filId]);
    return photoDuFond({
      messageId, mails: mails.map((x) => Number(x.id)), periodes, interneEchange: (ie[0]?.n ?? 0) > 0, le: new Date(),
    });
  } catch (e) {
    console.error('[gestion/trace-one-shot] photo du fond impossible (message=%d)', messageId, e);
    return null;
  }
}
