/**
 * migrations-plan.ts — LECTURE SEULE : quelles migrations de db/migrations sont nouvelles pour cette base, comment les
 * appliquer, et ce qui est refusé. Lu par deploy/maj/serveur.sh (lot 4 de la mise à jour de la prod).
 *
 *   npm run -s migrations:plan     → plan au format TSV (planEnTsv), sur la sortie standard
 *
 * Registre `svav_migration` absent → une seule ligne « REGISTRE<TAB>absent » (l'amorçage doit passer d'abord) et code 3.
 * N'écrit rien, nulle part.
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closePool, query } from '../app/lib/db/client';
import { planEnTsv, planifier, type LigneRegistre } from '../app/lib/ops/migrationsNouvelles';

async function main() {
  const dossier = path.join(process.cwd(), 'db/migrations');
  const fichiers = readdirSync(dossier).filter((n) => n.endsWith('.sql')).sort()
    .map((n) => ({ fichier: n, contenu: readFileSync(path.join(dossier, n), 'utf8') }));
  const existe = (await query<{ t: string | null }>(`SELECT to_regclass('public.svav_migration')::text AS t`)).rows[0].t;
  if (!existe) {
    console.log('REGISTRE\tabsent');
    process.exitCode = 3;
    return;
  }
  const registre = (await query<LigneRegistre>('SELECT fichier, sha256, origine FROM svav_migration')).rows;
  const tsv = planEnTsv(planifier(fichiers, registre));
  if (tsv) console.log(tsv);
}

main()
  .catch((e) => { console.error('ERREUR', (e as Error)?.message); process.exitCode = 1; })
  .finally(() => closePool());
