import { query } from '../db/client';
import { mailsDuFil, periodesRefermeesDuFil, suiviDuFil } from './periodeRepo';
import { MOTIF_DETACHE_PAR_INTERNE } from './interneDetache';
import {
  accoladeInterneSuite, accoladesDuBienDansLeFil, LIBELLE_RETRAIT, type AccoladeDuBien,
} from './accoladesBien';

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — LES ACCOLADES D'UN BIEN, LUES EN BASE. LECTURE SEULE ═══════════════════════════════════
 *
 * 🔒 AUCUN `INSERT`, `UPDATE`, `DELETE`. Les décisions sont dans `accoladesBien.ts` (PUR) ; ce fichier lit les
 * fenêtres des conversations affichées et le mail qui ouvre chaque changement (pour le pied de la modale).
 *
 * ⚠️ D'ABORD LE FILTRE BON MARCHÉ : une page d'historique montre jusqu'à cent mails de dizaines de conversations, et la
 * plupart n'ont aucune fenêtre « la suite ». Une requête dit lesquelles en ont ; le reste n'est lu que pour elles.
 * ⚠️ SILENCIEUX EN CAS D'ÉCHEC : sans accolade, l'historique reste lisible.
 */
export interface AccoladeAffichee extends AccoladeDuBien {
  recuLe: string;
  mail: { de: string; deNom: string | null; recuLe: string; objet: string | null } | null;
}

export async function accoladesDuBien(cle: string, filIds: readonly number[]): Promise<AccoladeAffichee[]> {
  const fils = [...new Set(filIds.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 300);
  if (cle.trim() === '' || fils.length === 0) return [];
  try {
    const { rows: avecSuite } = await query<{ fil_id: string }>(
      `SELECT DISTINCT p.fil_id::text
         FROM gestion_fil_periode p
        WHERE p.fil_id = ANY($1::bigint[]) AND p.remplacee_le IS NULL
          /* 🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR — ou une fenêtre du premier mail posée par un GESTE (pas la reprise) :
             « Ce mail + futurs échanges » sur le premier mail, ou « Toute la conversation ». Voir estUnGeste. */
          AND (p.depuis_message_id <> (SELECT m.id FROM gestion_message m WHERE m.fil_id = p.fil_id
                                        ORDER BY m.recu_le, m.id LIMIT 1)
               OR lower(btrim(p.cree_par_libelle)) NOT LIKE 'reprise%')`, [fils]);
    /* Les marques « Interne » posées « pour la suite » (portée enregistrée depuis la 342), vivantes. */
    const { rows: avec342 } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'gestion_message_interne' AND column_name = 'portee'`);
    const internes = (avec342[0]?.n ?? 0) > 0 ? (await query<{
      fil_id: string; pose: string; par: string; ids: string[];
    }>(
      `SELECT m.fil_id::text, to_char(date_trunc('second', mi.pose_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS pose,
              mi.pose_par_libelle AS par, array_agg(mi.message_id::text) AS ids
         FROM gestion_message_interne mi JOIN gestion_message m ON m.id = mi.message_id
        WHERE m.fil_id = ANY($1::bigint[]) AND mi.retire_le IS NULL AND mi.portee = 'suite'
          AND EXISTS (SELECT 1 FROM gestion_rattachement r
                       WHERE r.message_id = mi.message_id AND r.cible_sorte = 'lot' AND r.cible_cle = $2
                         AND r.statut = 'sorti' AND r.sorti_motif = $3)
        GROUP BY 1, 2, 3`, [fils, cle, MOTIF_DETACHE_PAR_INTERNE])).rows : [];

    const aLire = [...new Set([...avecSuite.map((r) => Number(r.fil_id)), ...internes.map((r) => Number(r.fil_id))])];
    const out: AccoladeDuBien[] = [];
    for (const fil of aLire) {
      const { periodes } = await suiviDuFil(fil);
      const mails = await mailsDuFil(fil);
      const anciennes = await periodesRefermeesDuFil(fil);
      const { rows: ie } = await query<{ n: number }>(
        'SELECT count(*)::int AS n FROM gestion_fil_interne WHERE fil_id = $1 AND retire_le IS NULL', [fil]);
      out.push(...accoladesDuBienDansLeFil({
        filId: fil, mails, periodes, anciennes, cle, interneDeLEchange: (ie[0]?.n ?? 0) > 0,
      }));
      for (const g of internes.filter((x) => Number(x.fil_id) === fil)) {
        const a = accoladeInterneSuite({
          filId: fil, mails, periodes, marques: g.ids.map(Number), parLibelle: g.par, le: g.pose,
          libelle: LIBELLE_RETRAIT, sens: 'retrait',
        });
        if (a !== null) out.push(a);
      }
    }
    if (out.length === 0) return [];
    const { rows: mails } = await query<{ id: string; de: string; de_nom: string | null; recu_le: string; objet: string | null }>(
      `SELECT id::text, de_adresse AS de, de_nom,
              to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le, objet
         FROM gestion_message WHERE id = ANY($1::bigint[])`, [out.map((a) => a.depuisMessageId)]);
    const parId = new Map(mails.map((m) => [Number(m.id), m]));
    return out.flatMap((a) => {
      const m = parId.get(a.depuisMessageId);
      return m === undefined ? [] : [{
        ...a, recuLe: m.recu_le, mail: { de: m.de, deNom: m.de_nom, recuLe: m.recu_le, objet: m.objet },
      }];
    });
  } catch (e) {
    console.error('[gestion/accolades] lecture impossible (cle=%s)', cle, e);
    return [];
  }
}
