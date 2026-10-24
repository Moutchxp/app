/**
 * CLI `location:apporteurs-internes` — LES APPORTEURS QUI SONT DES COLLÈGUES, PASSÉS EN « INTERNE » (Arno, 24/10/2026, migration 419).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Propose le passage en INTERNE (lié à son compte de l'interface, rattaché à personne) des apporteurs dont le nom est EXACTEMENT celui
 * d'un compte ; liste les cas DOUTEUX (plusieurs comptes, seul le nom de famille, compte déjà lié) sans les toucher
 * (`planPassageInterne`). REJOUABLE : un apporteur déjà interne n'est plus examiné.
 *
 * Un passage écrit `compte_id` (et le type « Collaborateur ») sur la fiche de l'apporteur. Rien d'autre : ses taux, ses dossiers et son
 * historique de rattachement restent tels quels (les dossiers d'avant gardent le collègue de l'époque).
 *
 * 🔴 ESSAI PAR DÉFAUT : il lit et écrit son rapport, aucune écriture en base. `--reel` passe les apporteurs « à passer », dans UNE
 *    transaction, et journalise chaque passage (`gestion_journal`, entité « location_apporteur » — migration 419 requise : sans elle,
 *    `--reel` est refusé). `--lier=12:5,14:7` : des liens apporteur → compte tranchés à la main (cas douteux).
 * 🔴 Le rapport va dans `.captures/apporteurs-internes/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:apporteurs-internes                       (essai)
 *   npm run location:apporteurs-internes -- --reel             (pour de bon)
 *   npm run location:apporteurs-internes -- --lier=12:5        (essai, avec un lien tranché à la main)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { libelleCompte, lireLiens, planPassageInterne, textePassageInterne, type ApporteurExamine, type CompteInterface } from '../lib/location/suivi/apporteursInternes';

const P = '[location:apporteurs-internes]';
const NOM_SCRIPT = 'apporteurs-internes';
const AUTEUR = `script ${NOM_SCRIPT}`;

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const forces = lireLiens(optionLigne(argv, 'lier') ?? null);
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const avec419 = (await query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'gestion_location_apporteur' AND column_name = 'compte_id'`)).rows[0]?.n === '1';
    const avec414 = (await query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'gestion_location_apporteur' AND column_name = 'nom_famille'`)).rows[0]?.n === '1';
    const { rows: a } = await query<{ id: string; nom: string; type: string; nom_famille: string | null; prenom: string | null; compte_id: string | null; archive: boolean }>(
      `SELECT id::text, nom, type, ${avec414 ? 'nom_famille, prenom' : 'NULL::text AS nom_famille, NULL::text AS prenom'},
              ${avec419 ? 'compte_id::text' : 'NULL::text AS compte_id'}, archive_le IS NOT NULL AS archive
         FROM gestion_location_apporteur ORDER BY id`);
    const { rows: c } = await query<{ id: string; prenom: string | null; nom: string | null; identifiant: string | null; actif: boolean }>(
      'SELECT id::text, prenom, nom, identifiant, actif FROM admin_utilisateur ORDER BY id');
    const apporteurs: ApporteurExamine[] = a.map((r) => ({ id: Number(r.id), nom: r.nom, type: r.type, nomFamille: r.nom_famille, prenom: r.prenom,
      compteId: r.compte_id === null ? null : Number(r.compte_id), archive: r.archive }));
    const comptes: CompteInterface[] = c.map((r) => ({ id: Number(r.id), prenom: r.prenom, nom: r.nom, identifiant: r.identifiant, actif: r.actif === true }));
    const plan = planPassageInterne(apporteurs, comptes, forces);
    let ecrits = 0;
    if (reel) {
      const { rows: k } = await query<{ def: string | null }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass`);
      if (!avec419 || !(k[0]?.def ?? '').includes("'location_apporteur'")) throw new Error('migration 419 absente : le passage en interne et son journal ne peuvent pas être écrits — appliquez-la, puis relancez.');
      ecrits = await withTransaction(async (q) => {
        let n = 0;
        for (const d of plan) {
          if (d.sorte !== 'passer') continue;
          // Relu et verrouillé : seulement s'il est encore externe et que le compte n'est l'apporteur de personne.
          const r = await q(`UPDATE gestion_location_apporteur SET compte_id = $2, type = 'collaborateur', modifie_le = now(), modifie_par_libelle = $3
                              WHERE id = $1 AND compte_id IS NULL AND archive_le IS NULL
                                AND NOT EXISTS (SELECT 1 FROM gestion_location_apporteur x WHERE x.compte_id = $2 AND x.archive_le IS NULL)`, [d.apporteur.id, d.compte.id, AUTEUR]);
          if ((r.rowCount ?? 0) === 0) continue;
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                   VALUES ('location_apporteur', $1, 'location_apporteur_passe_interne', $2, $3, $4, NULL, $5)`,
            [d.apporteur.id, `externe (${d.apporteur.type})`, `interne — compte n° ${d.compte.id} ${libelleCompte(d.compte)}`,
              `Apporteur « ${d.apporteur.nom} » passé en interne (${d.raison})`, AUTEUR]);
          n += 1;
        }
        return n;
      });
    }
    const texte = textePassageInterne(plan, { reel, base, lus: apporteurs.filter((x) => !x.archive && x.compteId === null).length, comptes: comptes.length, ecrits });
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
