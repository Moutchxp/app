// LOCATION « OUTILS DE SUIVI » — l'import des lignes d'octobre 2026 : ce qu'il LIT, ce qu'il JOURNALISE, et `--annuler`. L'écriture des
// lignes elle-même est celle de la reprise (`importSuiviRepo.ecrireImport`), appelée telle quelle. Même convention que `importSuiviRepo` :
// pas de `import 'server-only'` (lu par le script sous tsx et par les tests). Rien n'est jamais supprimé : annuler = `annule_le`.
import { query, withTransaction } from '../../db/client';
import { MARQUE, MOIS_OCTOBRE, PREFIXE_CLE, type EmpreinteMois, type LigneExistante } from './importOctobre';

const n = (v: unknown): number => Number(v);
/** Le motif LIKE des clés d'import d'octobre (« _ » et « % » échappés). */
const MOTIF_CLE = `${PREFIXE_CLE.replace(/_/g, '\\_')}%`;
const MOTIF_MARQUE = `${MARQUE} du %`;

/** Les lignes d'octobre 2026 en base, non annulées (saisies, ou importées). */
export async function lireLignesOctobre(): Promise<LigneExistante[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, coalesce(libelle_proprietaire, '') AS p, coalesce(libelle_locataire, '') AS l, hono_proprietaire_ht AS hp, hono_locataire_ht AS hl,
            source, import_cle
       FROM gestion_location_activite
      WHERE date_signature >= $1::date AND date_signature < ($1::date + interval '1 month') AND annule_le IS NULL
      ORDER BY id`, [`${MOIS_OCTOBRE}-01`]);
  return rows.map((r) => ({ id: n(r.id), proprietaire: String(r.p), locataire: String(r.l), hp: n(r.hp), hl: n(r.hl), source: String(r.source),
    importCle: (r.import_cle as string | null) ?? null }));
}

/** Les numéros que porte chaque lot (porte, n° de lot de copropriété) : le « 421 » de « NGO 421 » s'y cherche. */
export async function lireNumerosDesLots(): Promise<Map<number, string[]>> {
  const { rows } = await query<{ id: string; porte: string | null; num: string | null }>(
    'SELECT id, porte, num_lot_copro AS num FROM gestion_annuaire_lot');
  return new Map(rows.map((r) => [n(r.id), [r.porte, r.num].filter((x): x is string => x !== null && x.trim() !== '')]));
}

/**
 * L'empreinte de chaque mois de 2026 : nombre de lignes non annulées, somme des honoraires HT, et une somme de contrôle (md5 de chaque
 * ligne : identifiant, type, date, honoraires, prime, commission saisie, bail, apporteur), dans l'ordre des identifiants.
 */
export async function empreintes2026(): Promise<EmpreinteMois[]> {
  const { rows } = await query<{ mois: string; lignes: string; montant: string; controle: string }>(
    `SELECT to_char(date_signature, 'YYYY-MM') AS mois, count(*)::text AS lignes,
            coalesce(sum(hono_proprietaire_ht + hono_locataire_ht), 0)::text AS montant,
            md5(string_agg(concat_ws(':', id, type, date_signature, hono_proprietaire_ht, hono_locataire_ht, prime_gestion_saisie,
                                     apporteur_commission_saisie, bail_id, apporteur_id), ',' ORDER BY id)) AS controle
       FROM gestion_location_activite
      WHERE date_signature >= '2026-01-01' AND date_signature < '2027-01-01' AND annule_le IS NULL
      GROUP BY 1 ORDER BY 1`);
  return rows.map((r) => ({ mois: r.mois, lignes: n(r.lignes), montantHt: n(r.montant), controle: r.controle }));
}

/** Les lignes que cet import a ajoutées (marque et clé d'octobre), annulées comprises. */
export async function lignesDeCetImport(): Promise<{ id: number; cle: string; annule: boolean }[]> {
  const { rows } = await query<{ id: string; import_cle: string; annule: boolean }>(
    `SELECT id, import_cle, annule_le IS NOT NULL AS annule FROM gestion_location_activite
      WHERE import_cle LIKE $1 AND cree_par_libelle LIKE $2 ORDER BY id`, [MOTIF_CLE, MOTIF_MARQUE]);
  return rows.map((r) => ({ id: n(r.id), cle: r.import_cle, annule: r.annule === true }));
}

/**
 * Décision 6 — chaque ligne ajoutée laisse une trace au journal (append-only), une fois : rejouer n'en écrit pas une seconde.
 * Rend le nombre de traces écrites.
 */
export async function journaliserAjouts(marque: string): Promise<number> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; cle: string; resume: string }>(
      `SELECT a.id, a.import_cle AS cle,
              concat(coalesce(a.libelle_proprietaire, ''), ' / ', coalesce(a.libelle_locataire, ''), ' — ',
                     to_char(a.hono_proprietaire_ht + a.hono_locataire_ht, 'FM999G990D00'), ' € HT') AS resume
         FROM gestion_location_activite a
        WHERE a.import_cle LIKE $1 AND a.cree_par_libelle LIKE $2 AND a.annule_le IS NULL
          AND NOT EXISTS (SELECT 1 FROM gestion_journal j WHERE j.entite = 'location_activite' AND j.entite_id = a.id AND j.action = 'location_import_fichier')
        ORDER BY a.id FOR UPDATE`, [MOTIF_CLE, MOTIF_MARQUE]);
    for (const r of rows) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
               VALUES ('location_activite', $1, 'location_import_fichier', NULL, $2, $3, $4)`,
        [n(r.id), r.resume, `${marque} — ligne ajoutée (clé ${r.cle}) ; réversible par --annuler (désactivation, jamais de suppression)`, marque]);
    }
    return rows.length;
  });
}

/**
 * `--annuler` — désactive (annule_le) exactement les lignes que cet import a ajoutées et qui sont encore actives ; une trace par ligne.
 * Rien n'est supprimé ; les lignes saisies à la main ne portent pas la marque et ne sont jamais visées.
 */
export async function annulerCetImport(auteur: string): Promise<{ id: number; cle: string }[]> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: string; import_cle: string }>(
      `SELECT id, import_cle FROM gestion_location_activite
        WHERE import_cle LIKE $1 AND cree_par_libelle LIKE $2 AND annule_le IS NULL ORDER BY id FOR UPDATE`, [MOTIF_CLE, MOTIF_MARQUE]);
    for (const r of rows) {
      await q('UPDATE gestion_location_activite SET annule_le = now(), annule_par_libelle = $2 WHERE id = $1 AND annule_le IS NULL', [n(r.id), auteur]);
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
               VALUES ('location_activite', $1, 'location_import_fichier_annule', 'active', 'annulée', $2, $3)`,
        [n(r.id), `${auteur} — ligne de l'import d'octobre 2026 désactivée (clé ${r.import_cle}), rien n'est supprimé`, auteur]);
    }
    return rows.map((r) => ({ id: n(r.id), cle: r.import_cle }));
  });
}
