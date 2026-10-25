/**
 * CLI `location:liens-annexes` — RELIER LES ANNEXES À LEUR LOT PRINCIPAL (Arno, 25/10/2026, migration 426).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Les lots de type annexe (parking, cave, box, garage, cellier) qui ne sont reliés à aucun lot principal : un lien est PROPOSÉ quand le
 * propriétaire n'a qu'un lot principal (ou un seul à la même adresse) ; AMBIGUS et SANS LOT PRINCIPAL listés à part, sans y toucher
 * (`planLiensAnnexes`). REJOUABLE : un lot déjà relié n'est plus examiné. Ces liens servent aux NOUVEAUX dossiers : une annexe reliée et
 * relouée après la date de bascule compte en relocation, pas en nouvelle gestion ; RIEN du passé ne change.
 *
 * 🔴 ESSAI PAR DÉFAUT : il lit et écrit son rapport, aucune écriture en base. `--reel` pose les liens proposés (`gestion_lot_annexe`, en ajout
 *    seul — la même écriture que « Rattacher à un bien »), dans UNE transaction, journalisés sur les DEUX lots. ⚠️ Comme le geste de la fiche,
 *    poser un lien aligne le statut de l'annexe sur celui de son lot principal (déclencheur de la 403). Aucune action Drive.
 * 🔴 Le rapport va dans `.captures/liens-annexes/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:liens-annexes                 (essai)
 *   npm run location:liens-annexes -- --reel       (pour de bon)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { planLiensAnnexes, texteLiensAnnexes, type LotExamine } from '../lib/location/suivi/liensAnnexes';

const P = '[location:liens-annexes]';
const NOM_SCRIPT = 'liens-annexes';
const AUTEUR = `script ${NOM_SCRIPT}`;

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const avecLiens = (await query<{ n: string }>(`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'gestion_lot_annexe'`)).rows[0]?.n === '1';
    if (!avecLiens) throw new Error('table gestion_lot_annexe absente (migration 372) : rien à relier.');
    const avecSortie = (await query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'sorti_portefeuille_le'`)).rows[0]?.n === '1';
    const { rows } = await query<{ id: string; proprietaire_id: string | null; nature: string | null; type_bien: string | null; categorie: string | null; adresse: string | null; relie: boolean }>(
      `SELECT l.id::text, l.proprietaire_id::text, l.nature, l.type_bien, l.categorie, l.adresse,
              EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = l.id OR a.parent_id = l.id) AS relie
         FROM gestion_annuaire_lot l WHERE l.absent_le IS NULL${avecSortie ? ' AND l.sorti_portefeuille_le IS NULL' : ''} ORDER BY l.proprietaire_id, l.id`);
    const lots: LotExamine[] = rows.map((r) => ({ id: Number(r.id), proprietaireId: r.proprietaire_id === null ? null : Number(r.proprietaire_id), nature: r.nature,
      typeBien: r.type_bien, categorie: r.categorie, adresse: r.adresse, relie: r.relie === true }));
    const plan = planLiensAnnexes(lots);
    let ecrits = 0;
    if (reel) {
      ecrits = await withTransaction(async (q) => {
        let n = 0;
        for (const d of plan) {
          if (d.sorte !== 'proposer') continue;
          const deja = await q('SELECT 1 FROM gestion_lot_annexe WHERE annexe_id = $1', [d.annexe.id]);
          if (deja.rows.length > 0) continue;
          await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [d.annexe.id, d.parent.id, AUTEUR]);
          for (const [lot, apres, commentaire] of [[d.parent.id, `annexe ${d.annexe.id}`, 'annexe reliée à ce lot principal (script liens-annexes)'],
            [d.annexe.id, `bien principal ${d.parent.id}`, 'reliée comme annexe de ce lot principal (script liens-annexes)']] as const) {
            await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                     VALUES ('annuaire_lot', $1, 'location_annexe_rattachee', NULL, $2, $3, NULL, $4)`, [lot, apres, commentaire, AUTEUR]);
          }
          n += 1;
        }
        return n;
      });
    }
    const texte = texteLiensAnnexes(plan, { reel, base, ecrits, examines: lots.length });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exitCode = 1; });
}
