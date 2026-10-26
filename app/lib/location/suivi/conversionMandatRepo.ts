import { query, withTransaction, type RequeteTx } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import type { Auteur } from '../../gestion/gestes';
import type { Issue } from '../locationRepo';

/**
 * ══ 🔴🔴 Arno (26/10/2026, décision C, migration 431) — CONVERTIR UNE LIGNE « BAIL » EN « MANDAT DE GESTION SEUL » ══════════════════════
 * Pour le bail d'un locataire EN PLACE saisi comme un bail signé par l'agence (CHALAH / REIFHI, ligne 837) : la ligne prend la DATE DU
 * MANDAT, sort de « Baux signés » et du CA location (honoraires de location à 0), sa prime de nouvelle gestion est datée du mandat (elle suit
 * la date de la ligne) ; négociateur, apporteur, origine et cases restent tels quels. La nature, la date et les honoraires d'ORIGINE sont
 * gardés (`*_origine`) : « Annuler la conversion » les remet. Lu et verrouillé avant d'écrire (un refus n'écrit rien) ; chaque geste a sa
 * ligne au journal (`gestion_journal`, entité `location_activite`). Sans la migration 431 : `sans_schema`. Rien n'est jamais supprimé.
 */
export function conversionDisponible(): Promise<boolean> { return colonneExisteMemo('gestion_location_activite', 'converti_le'); }

const dateValide = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const fr = (iso: string): string => iso.split('-').reverse().join('/');

interface LigneLue { type: string; d: string; hp: string; hl: string; converti: boolean; annule: boolean }
async function lireVerrouillee(q: RequeteTx, id: number): Promise<LigneLue | undefined> {
  return (await q<LigneLue>(
    `SELECT type, date_signature::text AS d, hono_proprietaire_ht::text AS hp, hono_locataire_ht::text AS hl,
            converti_le IS NOT NULL AS converti, annule_le IS NOT NULL AS annule
       FROM gestion_location_activite WHERE id = $1 FOR UPDATE`, [id])).rows[0];
}

/**
 * LA CONVERSION, DANS UNE TRANSACTION OUVERTE (le script la fait avec le reste du cas, d'un seul tenant). Rend le motif d'un refus — rien
 * n'est alors écrit —, ou la phrase de ce qui a été fait.
 */
export async function convertirDans(q: RequeteTx, id: number, dateMandat: string, auteur: Auteur): Promise<{ refus: string } | { fait: string }> {
  if (!dateValide(dateMandat)) return { refus: 'La date du mandat de gestion est à saisir au format JJ/MM/AAAA.' };
  const l = await lireVerrouillee(q, id);
  if (l === undefined) return { refus: `La ligne de suivi n° ${id} n’existe pas.` };
  if (l.annule) return { refus: `La ligne de suivi n° ${id} est annulée.` };
  if (l.converti) return { refus: `La ligne de suivi n° ${id} est déjà convertie en « Mandat de gestion seul ».` };
  if (l.type !== 'bail') return { refus: `Seule une ligne « Bail » se convertit (la ligne n° ${id} est « ${l.type} »).` };
  await q(`UPDATE gestion_location_activite
              SET type_origine = type, date_signature_origine = date_signature,
                  hono_proprietaire_ht_origine = hono_proprietaire_ht, hono_locataire_ht_origine = hono_locataire_ht,
                  type = 'gestion_seule', date_signature = $2::date, hono_proprietaire_ht = 0, hono_locataire_ht = 0,
                  converti_le = now(), converti_par_libelle = $3, modifie_le = now(), modifie_par_libelle = $3
            WHERE id = $1`, [id, dateMandat, auteur.libelle]);
  const fait = `ligne n° ${id} convertie : « Bail » du ${fr(l.d)} → « Mandat de gestion seul » du ${fr(dateMandat)} (locataire en place) ; `
    + `honoraires de location ${Number(l.hp).toFixed(2)} € + ${Number(l.hl).toFixed(2)} € → 0 ; nature, date et honoraires d’origine gardés`;
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           VALUES ('location_activite', $1, 'location_conversion_mandat_seul', $2, $3, $4, $5, $6)`,
    [id, `Bail du ${fr(l.d)}`, `Mandat de gestion seul du ${fr(dateMandat)}`, fait, auteur.id, auteur.libelle]);
  return { fait };
}

/** « Convertir en « Mandat de gestion seul » » (Suivi du mois). */
export async function convertirEnMandatSeul(id: number, dateMandat: string, auteur: Auteur): Promise<Issue<{ phrase: string }>> {
  if (!(await conversionDisponible())) return { etat: 'sans_schema' };
  const r = await withTransaction((q) => convertirDans(q, id, dateMandat, auteur));
  return 'refus' in r ? { etat: 'refus', motif: r.refus } : { etat: 'ok', data: { phrase: r.fait } };
}

/** « Annuler la conversion » : la nature, la date et les honoraires d'origine reviennent ; la trace reste au journal. */
export async function annulerConversion(id: number, auteur: Auteur): Promise<Issue<{ phrase: string }>> {
  if (!(await conversionDisponible())) return { etat: 'sans_schema' };
  try {
    const r = await withTransaction(async (q): Promise<{ refus: string } | { fait: string }> => {
      const l = await lireVerrouillee(q, id);
      if (l === undefined) return { refus: `La ligne de suivi n° ${id} n’existe pas.` };
      if (!l.converti) return { refus: `La ligne de suivi n° ${id} n’est pas une conversion.` };
      const o = (await q<{ type: string; d: string }>('SELECT type_origine AS type, date_signature_origine::text AS d FROM gestion_location_activite WHERE id = $1', [id])).rows[0];
      await q(`UPDATE gestion_location_activite
                  SET type = type_origine, date_signature = date_signature_origine,
                      hono_proprietaire_ht = hono_proprietaire_ht_origine, hono_locataire_ht = hono_locataire_ht_origine,
                      type_origine = NULL, date_signature_origine = NULL, hono_proprietaire_ht_origine = NULL, hono_locataire_ht_origine = NULL,
                      converti_le = NULL, converti_par_libelle = NULL, modifie_le = now(), modifie_par_libelle = $2
                WHERE id = $1`, [id, auteur.libelle]);
      const fait = `conversion annulée : la ligne n° ${id} redevient « ${o.type === 'bail' ? 'Bail' : o.type} » du ${fr(o.d)} (honoraires d’origine remis)`;
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
               VALUES ('location_activite', $1, 'location_conversion_annulee', $2, $3, $4, $5, $6)`,
        [id, `Mandat de gestion seul du ${fr(l.d)}`, `${o.type === 'bail' ? 'Bail' : o.type} du ${fr(o.d)}`, fait, auteur.id, auteur.libelle]);
      return { fait };
    });
    return 'refus' in r ? { etat: 'refus', motif: r.refus } : { etat: 'ok', data: { phrase: r.fait } };
  } catch (e) {
    // Un autre « Bail » a été saisi depuis pour le même bail : l'index unique refuse — dit, rien n'est écrit.
    if ((e as { code?: string })?.code === '23505') return { etat: 'refus', motif: 'Un autre « Bail » existe déjà pour ce bail : la conversion ne peut pas être annulée.' };
    throw e;
  }
}

/** La date du mandat à proposer : celle du mandat de gestion du propriétaire du bien de la ligne, s'il est saisi. LECTURE SEULE. */
export async function dateMandatProposee(id: number): Promise<string | null> {
  if (!(await colonneExisteMemo('gestion_annuaire_proprietaire', 'mandat_gestion_signe_le'))) return null;
  const r = (await query<{ d: string | null }>(
    `SELECT p.mandat_gestion_signe_le::text AS d FROM gestion_location_activite a
       JOIN gestion_annuaire_lot l ON l.id = a.lot_id JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id WHERE a.id = $1`, [id])).rows[0];
  return r?.d ?? null;
}
