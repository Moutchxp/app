/**
 * PARC-1 — CLI de RAPPROCHEMENT cadastral parcelle ↔ dossier Sitadel. Écrit dans `permis_parcelle` des liens `origine_lien =
 * 'cadastral'` DÉDUITS de la référence cadastrale des dossiers (code INSEE + section + numéro), résolus vers la table `parcelle`.
 *
 * 🔴 GARDES :
 *  · PRÉSÉANCE : ne touche JAMAIS une ligne existante. On n'insère un 'cadastral' que si AUCUN lien n'existe encore sur la paire
 *    (dossier, parcelle idu) — donc jamais par-dessus un 'instruit' (lecture Cerfa). Cf. `resoudrePreseance` (module pur).
 *  · AMBIGUÏTÉ REFUSÉE : une clé qui retombe sur ≥ 2 parcelles n'est PAS appariée (comptée en échec), jamais un faux succès.
 *  · IDEMPOTENTE : re-jouable sans doublon (NOT EXISTS sur (dossier, idu) + ON CONFLICT sur la clé unique).
 *  · Ne touche NI le moteur, NI le verdict, NI une altitude. N'est PAS branchée sur la veille.
 *
 * Normalisation SQL = MIROIR EXACT de `normaliserCleCadastrale` (upper + btrim section, btrim numéro ; PAS de zéros de tête —
 * mesuré sans gain). Cf. `app/lib/permis/cleCadastrale.ts`. Tout tourne dans UNE transaction (tables TEMP `ON COMMIT DROP`).
 *
 * Lancer :  npm run permis:rapprocher-parcelles -- [--dry-run]
 *   --dry-run : compte et journalise SANS écrire (transaction ouverte puis refermée sans INSERT).
 */
import '../lib/chargerEnv';
import { withTransaction, closePool, type RequeteTx } from '../lib/db/client';

const MAJ_PAR = 'cli:rapprocher-parcelles';

async function preparer(q: RequeteTx): Promise<void> {
  // 1) Clés parcelle NORMALISÉES + comptage d'ambiguïté (nb par clé). min(...) = valeur unique quand la clé n'est pas ambiguë.
  await q(`
    CREATE TEMP TABLE pkn ON COMMIT DROP AS
      SELECT commune, upper(btrim(section)) AS secn, btrim(numero) AS numn,
             min(id) AS idu, min(section) AS section, min(numero) AS numero, min(prefixe) AS prefixe, count(*) AS nb
        FROM parcelle GROUP BY commune, upper(btrim(section)), btrim(numero)`);
  await q('CREATE INDEX ON pkn (commune, secn, numn)');
  await q('CREATE INDEX ON pkn (commune)');
  await q('ANALYZE pkn');

  // 2) Références cadastrales des dossiers, dépliées (≤ 3 par dossier) et normalisées EXACTEMENT comme la clé parcelle.
  await q(`
    CREATE TEMP TABLE refs ON COMMIT DROP AS
      SELECT id AS dossier_id, code_insee AS commune, upper(btrim(sec_cadastre1)) AS secn, btrim(num_cadastre1) AS numn FROM sitadel_dossier WHERE btrim(coalesce(sec_cadastre1,'')) <> '' AND btrim(coalesce(num_cadastre1,'')) <> ''
      UNION ALL SELECT id, code_insee, upper(btrim(sec_cadastre2)), btrim(num_cadastre2) FROM sitadel_dossier WHERE btrim(coalesce(sec_cadastre2,'')) <> '' AND btrim(coalesce(num_cadastre2,'')) <> ''
      UNION ALL SELECT id, code_insee, upper(btrim(sec_cadastre3)), btrim(num_cadastre3) FROM sitadel_dossier WHERE btrim(coalesce(sec_cadastre3,'')) <> '' AND btrim(coalesce(num_cadastre3,'')) <> ''`);

  // 3) Chaque réf ↔ sa clé parcelle (LEFT JOIN → distingue apparié nb=1 / ambigu nb≥2 / échec idu NULL).
  await q(`
    CREATE TEMP TABLE refm ON COMMIT DROP AS
      SELECT DISTINCT r.dossier_id, r.commune, r.secn, r.numn, k.idu, coalesce(k.nb, 0) AS nb, k.section, k.numero, k.prefixe
        FROM refs r LEFT JOIN pkn k ON k.commune = r.commune AND k.secn = r.secn AND k.numn = r.numn`);
  await q('CREATE INDEX ON refm (commune)');

  // Communes RÉELLEMENT couvertes par le cadastre (≈ 350 lignes) — évite une sous-requête corrélée sur pkn (1,14 M) qui
  // dégénère en seq scan répété (timeout mesuré). Distingue « parcelle introuvable » de « commune hors cadastre chargé ».
  await q('CREATE TEMP TABLE communes_couvertes ON COMMIT DROP AS SELECT DISTINCT commune FROM pkn');
  await q('CREATE INDEX ON communes_couvertes (commune)');
  await q('ANALYZE communes_couvertes');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  await withTransaction(async (q) => {
    await q("SET LOCAL statement_timeout = '280s'");
    await preparer(q);

    // 4) JOURNAL (au niveau réf ET dossier).
    const j = (await q<{ refs: string; app: string; amb: string; ech: string; commune_ko: string }>(`
      SELECT count(*) AS refs,
             count(*) FILTER (WHERE nb = 1) AS app,
             count(*) FILTER (WHERE nb >= 2) AS amb,
             count(*) FILTER (WHERE idu IS NULL AND     EXISTS (SELECT 1 FROM communes_couvertes p WHERE p.commune = refm.commune)) AS ech,
             count(*) FILTER (WHERE idu IS NULL AND NOT EXISTS (SELECT 1 FROM communes_couvertes p WHERE p.commune = refm.commune)) AS commune_ko
        FROM refm`)).rows[0];
    const d = (await q<{ avec_ref: string; apparies: string }>(`
      SELECT count(DISTINCT dossier_id) AS avec_ref,
             count(DISTINCT dossier_id) FILTER (WHERE nb = 1) AS apparies FROM refm`)).rows[0];

    // 5) Candidats : paires (dossier, idu) NON ambiguës. Préséance = aucune ligne existante sur cette paire (protège 'instruit').
    const c = (await q<{ n: string; preseance: string }>(`
      WITH cand AS (SELECT DISTINCT dossier_id, idu FROM refm WHERE nb = 1 AND idu IS NOT NULL)
      SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM permis_parcelle pp WHERE pp.dossier_id = cand.dossier_id AND pp.idu = cand.idu)) AS n,
             count(*) FILTER (WHERE     EXISTS (SELECT 1 FROM permis_parcelle pp WHERE pp.dossier_id = cand.dossier_id AND pp.idu = cand.idu)) AS preseance
        FROM cand`)).rows[0];

    console.log(`\n══════ RAPPROCHEMENT CADASTRAL parcelle ↔ dossier${dryRun ? '  (DRY-RUN, aucune écriture)' : ''} ══════`);
    console.log(`Références cadastrales examinées : ${j.refs}`);
    console.log(`  · appariées (1 parcelle)       : ${j.app}`);
    console.log(`  · REFUSÉES (ambiguïté ≥ 2)      : ${j.amb}`);
    console.log(`  · échec (commune couverte, parcelle introuvable) : ${j.ech}`);
    console.log(`  · échec (commune hors cadastre chargé)           : ${j.commune_ko}`);
    console.log(`Dossiers avec référence cadastrale : ${d.avec_ref} → dont appariables : ${d.apparies}`);
    console.log(`Liens cadastraux à écrire : ${c.n}  (déjà liés / préséance, non touchés : ${c.preseance})`);

    if (dryRun) { console.log('\nDRY-RUN : transaction refermée sans écriture.\n'); return; }

    // 6) INSERT réel. Préséance : NOT EXISTS sur (dossier, idu). Idempotence : ON CONFLICT sur la clé unique. origine=NULL (ni
    //    'saisie' ni 'extraite' : ce lien ne vient pas du Cerfa), origine_lien='cadastral', confiance='a_verifier'.
    const ins = await q(`
      WITH cand AS (SELECT DISTINCT dossier_id, idu, section, numero, prefixe FROM refm WHERE nb = 1 AND idu IS NOT NULL)
      INSERT INTO permis_parcelle (dossier_id, prefixe, section, numero, role, origine, origine_lien, idu, confiance, provenance, maj_par)
      SELECT cand.dossier_id, coalesce(cand.prefixe, '000'), cand.section, cand.numero, 'origine', NULL, 'cadastral', cand.idu, 'a_verifier',
             'rapprochement cadastral (référence Sitadel)', $1
        FROM cand
       WHERE NOT EXISTS (SELECT 1 FROM permis_parcelle pp WHERE pp.dossier_id = cand.dossier_id AND pp.idu = cand.idu)
      ON CONFLICT (dossier_id, role, section, numero, prefixe) DO NOTHING`, [MAJ_PAR]);
    console.log(`\nÉcrit : ${ins.rowCount} lien(s) 'cadastral'. Lignes 'instruit' intouchées.\n`);
  });
}

void main().catch((e) => { console.error('[permis:rapprocher-parcelles] échec', e); process.exitCode = 1; }).finally(() => closePool());
