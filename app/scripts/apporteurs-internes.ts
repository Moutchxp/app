/**
 * CLI `location:apporteurs-internes` — LES APPORTEURS QUI SONT DES COLLÈGUES, PASSÉS EN « INTERNE » (Arno, 24/10/2026, migration 419).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Propose le passage en INTERNE (lié à son compte de l'interface, rattaché à personne) des apporteurs dont le nom est EXACTEMENT celui
 * d'un compte ; liste les cas DOUTEUX (plusieurs comptes, seul le nom de famille, compte déjà lié) sans les toucher
 * (`planPassageInterne`). REJOUABLE : un apporteur déjà interne n'est plus examiné.
 *
 * Un passage s'écrit par `passerEnInterne` — la règle du bouton « Passer en interne » de la fiche : `compte_id`, type « Collaborateur »,
 * `interne_depuis` = aujourd'hui (422) ; le rattachement et la rémunération du collègue prennent fin ce jour-là, les dossiers déjà signés
 * gardent leur calcul, l'historique est conservé.
 *
 * 🔴 ESSAI PAR DÉFAUT : il lit et écrit son rapport, aucune écriture en base. `--reel` passe les apporteurs « à passer », dans UNE
 *    transaction, et journalise chaque passage (`gestion_journal`, entité « location_apporteur » — migrations 419 et 422 requises : sans
 *    elles, `--reel` est refusé). `--lier=12:5,14:7` : des liens apporteur → compte tranchés à la main (cas douteux).
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
import { lireLiens, planPassageInterne, textePassageInterne, type ApporteurExamine, type CompteInterface } from '../lib/location/suivi/apporteursInternes';

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
      // 🔴 La MÊME règle que le bouton « Passer en interne » de la fiche (`passerEnInterne`) : interne à compter d'aujourd'hui, rattachement
      // et rémunération du collègue clos ce jour-là (dossiers déjà signés inchangés), journalisé. Migrations 419 et 422 requises.
      const { passerEnInterne, passageInterneDisponible, MOT_SANS_422 } = await import('../lib/location/suivi/passageInterne');
      if (!avec419 || !(await passageInterneDisponible(query))) throw new Error(`migration 419 ou 422 absente — ${MOT_SANS_422}`);
      const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      ecrits = await withTransaction(async (q) => {
        let n = 0;
        for (const d of plan) {
          if (d.sorte !== 'passer') continue;
          const r = await passerEnInterne(q as typeof query, { apporteurId: d.apporteur.id, compteId: d.compte.id, jour, raison: d.raison, auteur: { id: null, libelle: AUTEUR } });
          if (r.etat === 'ok') n += 1; else console.log(`${P} apporteur n° ${d.apporteur.id} non passé : ${r.motif}`);
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
