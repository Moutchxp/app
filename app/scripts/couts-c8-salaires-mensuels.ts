/**
 * ══ 🔴 « LES COÛTS », DÉCISION C8 D'ARNO (03/11/2026) — EFFACER LES ANCIENS SALAIRES MENSUELS, APRÈS LES AVOIR SAUVEGARDÉS ═════════════════════════
 * « Les salaires déjà saisis en montant mensuel sont EFFACÉS : tout sera ressaisi par salarié à partir de 2026. » Ce script le fait, en trois
 * gestes séparés, sur UNE base nommée explicitement (garde : `--base=<nom>` doit être la base de DATABASE_URL, sinon il refuse) :
 *
 *   npx tsx app/scripts/couts-c8-salaires-mensuels.ts --base=<nom>                         lecture : ce qui serait effacé (rien n'est écrit)
 *   npx tsx app/scripts/couts-c8-salaires-mensuels.ts --base=<nom> --sauvegarder            écrit .captures/sauvegardes/salaires-mensuels-<date>.json
 *   npx tsx app/scripts/couts-c8-salaires-mensuels.ts --base=<nom> --effacer=<sauvegarde>   efface EXACTEMENT ces montants (refus si l'un a changé)
 *   npx tsx app/scripts/couts-c8-salaires-mensuels.ts --base=<nom> --restaurer=<sauvegarde> remet ces montants là où la colonne est vide
 *
 * Effacer = la colonne à NULL (la ligne reste) ; chaque geste est journalisé (`transaction_journal`, avant / après, annulable). ⚠️ Recette d'abord ;
 * en production, seulement sur décision d'Arno (aucun lancement automatique).
 */
import '../lib/chargerEnv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '../lib/db/client';
import { effacerSalairesMensuels, lireSalairesMensuels, restaurerSalairesMensuels, type SalaireMensuel } from '../lib/transaction/repo';
import { horodatage, RACINE_PROJET } from '../lib/ops/rapportScript';
import { lireSauvegardeC8 } from '../lib/mon-espace/c8';

const arg = (nom: string): string | null => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? (process.argv.includes(`--${nom}`) ? '' : null);
const AUTEUR = { id: null, libelle: 'script C8 (couts-c8-salaires-mensuels)' };

async function main(): Promise<void> {
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0].b;
  if (arg('base') !== base) throw new Error(`Base « ${base} » : relancez avec --base=${base} pour confirmer que c'est bien celle-ci (rien n'a été fait).`);
  const presents = await lireSalairesMensuels();
  const resume = (xs: readonly SalaireMensuel[]): string => xs.map((x) => `  ${x.table.padEnd(23)} ${x.annee}-${String(x.mois).padStart(2, '0')}  ${x.montantHt.toFixed(2)} €`).join('\n');
  if (arg('sauvegarder') !== null) {
    const dossier = join(RACINE_PROJET, '.captures', 'sauvegardes'); mkdirSync(dossier, { recursive: true });
    const fichier = join(dossier, `salaires-mensuels-${base}-${horodatage()}.json`);
    writeFileSync(fichier, JSON.stringify({ base, cree_le: new Date().toISOString(), decision: 'C8 (Arno, 03/11/2026)', salaires: presents }, null, 1));
    console.log(`Sauvegarde : ${fichier}\n${presents.length} montant(s) :\n${resume(presents)}`);
    return;
  }
  const effacer = arg('effacer'); const restaurer = arg('restaurer');
  if (effacer || restaurer) {
    const s = lireSauvegardeC8(readFileSync((effacer || restaurer) as string, 'utf8'), base);
    const r = effacer ? await effacerSalairesMensuels(s, AUTEUR) : await restaurerSalairesMensuels(s, AUTEUR);
    if (!r.ok) throw new Error(r.motif);
    console.log(`${effacer ? 'Effacés' : 'Restaurés'} : ${r.valeur} montant(s) (journalisés).`);
    return;
  }
  console.log(`LECTURE SEULE — base « ${base} » : ${presents.length} salaire(s) mensuel(s) d'avant seraient effacés :\n${resume(presents)}\nSauvegarder d'abord : --sauvegarder`);
}
main().then(() => process.exit(0), (e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
