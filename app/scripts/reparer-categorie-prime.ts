/**
 * CLI `location:reparer-categorie-prime` — LA CATÉGORIE DE PRIME DES LIGNES REPRISES DU FICHIER, RECALCULÉE (Arno, 24/10/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * La règle d'import classait « parking » toute prime inférieure à 150 € (ZHIVULINA-KOROTICH, septembre 2026 : un appartement avec
 * une prime de 50 €). La règle corrigée : « parking » seulement si le libellé le dit (parking, park, box, garage, stationnement) ou
 * si le lot rattaché est un parking ; sinon « logement » (`categoriePrimeImport`). Ce script recalcule les lignes REPRISES
 * (`source = 'import'`) et dit, ligne par ligne, la catégorie avant → après. Une ligne sans bien rattaché ni honoraires est
 * SIGNALÉE « à vérifier à la main », jamais touchée. La prime (montant, choix) ne change jamais. REJOUABLE (une ligne déjà juste
 * n'est plus listée).
 *
 * 🔴 ESSAI PAR DÉFAUT : il lit et écrit son rapport, aucune écriture en base. `--reel` corrige, dans UNE transaction, et journalise
 *    chaque changement (`gestion_journal`, entité « location_activite » — migration 418 requise : sans elle, `--reel` est refusé).
 * 🔴 Le rapport va dans `.captures/reparer-categorie-prime/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:reparer-categorie-prime                (essai)
 *   npm run location:reparer-categorie-prime -- --reel      (corrige pour de bon)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { planReparationCategorie, texteReparationCategorie, type LigneACategoriser } from '../lib/location/suivi/reparationCategorie';

const P = '[location:reparer-categorie-prime]';
const NOM_SCRIPT = 'reparer-categorie-prime';
const AUTEUR = `script ${NOM_SCRIPT}`;

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const { familleDuLot } = await import('../lib/location/bienComplet');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const { rows } = await query<{ id: string; mois: string; proprietaire: string | null; locataire: string | null; prime: string | null; ca: string;
      categorie: string | null; lot_id: string | null; lcat: string | null; nature: string | null; type_bien: string | null }>(
      `SELECT a.id::text, to_char(a.date_signature, 'YYYY-MM') AS mois, a.libelle_proprietaire AS proprietaire, a.libelle_locataire AS locataire,
              a.prime_gestion_saisie::text AS prime, (a.hono_proprietaire_ht + a.hono_locataire_ht)::text AS ca, a.categorie_prime AS categorie,
              a.lot_id::text, l.categorie AS lcat, l.nature, l.type_bien
         FROM gestion_location_activite a LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
        WHERE a.source = 'import' AND a.annule_le IS NULL
        ORDER BY a.date_signature, a.id`);
    const lignes: LigneACategoriser[] = rows.map((r) => ({
      id: Number(r.id), mois: r.mois, proprietaire: r.proprietaire ?? '', locataire: r.locataire ?? '', prime: Number(r.prime ?? 0), ca: Number(r.ca),
      categorie: r.categorie === 'parking' || r.categorie === 'logement' || r.categorie === 'local' ? r.categorie : null,
      lotParking: r.lot_id === null ? null : familleDuLot({ categorie: r.lcat, nature: r.nature, typeBien: r.type_bien }) === 'parking',
    }));
    const plan = planReparationCategorie(lignes);
    let ecrites = 0;
    if (reel) {
      const { rows: c } = await query<{ def: string | null }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass`);
      if (!(c[0]?.def ?? '').includes("'location_activite'")) throw new Error('migration 418 absente : chaque changement doit être journalisé — appliquez-la, puis relancez.');
      ecrites = await withTransaction(async (q) => {
        let n = 0;
        for (const d of plan) {
          if (d.sorte !== 'change') continue;
          // Relu et verrouillé : une ligne modifiée depuis la lecture n'est corrigée que si sa catégorie est encore celle lue.
          const r = await q(`UPDATE gestion_location_activite SET categorie_prime = $2, modifie_le = now(), modifie_par_libelle = $4
                              WHERE id = $1 AND categorie_prime IS NOT DISTINCT FROM $3`, [d.ligne.id, d.nouvelle, d.ligne.categorie, AUTEUR]);
          if ((r.rowCount ?? 0) === 0) continue;
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                   VALUES ('location_activite', $1, 'location_categorie_prime_reparee', $2, $3, $4, NULL, $5)`,
            [d.ligne.id, d.ligne.categorie, d.nouvelle, `Catégorie de prime recalculée (${d.raison}) — ligne reprise de « ${d.ligne.mois} »`, AUTEUR]);
          n += 1;
        }
        return n;
      });
    }
    const texte = texteReparationCategorie(plan, { reel, base, lues: lignes.length, ecrites });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
