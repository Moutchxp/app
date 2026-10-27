/**
 * CLI `transaction:importer` — LA REPRISE DE L'HISTORIQUE DE LA TRANSACTION (Arno, 27/10/2026, lot B).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Lit les « TABLEAU DE BORD » d'Arno (CRITERIMMO : « TABLEAU DE BORD AAAA.xlsx » ; MACJ : « TABLEAU DE BORD MACJ AAAA.xlsx ») d'un
 * dossier, et reprend les ventes, compromis, rétrocessions, montants « à rattacher » et la gestion du mois (onglet GESTION) dans les
 * tables de la tuile Transaction (migration 433), selon les décisions D1 à D7 (`lectureTableau.ts`, `planImport.ts`).
 *
 * 🔴 À BLANC PAR DÉFAUT : lit, planifie, réconcilie, écrit son rapport ; aucune écriture en base. `--appliquer` écrit.
 * 🔴 D7 — FICHIER PAR FICHIER : `--fichier=…` (répétable, ou séparé par des virgules) limite l'ÉCRITURE à ces fichiers ; tous les
 *    fichiers du dossier sont LUS pour le plan (un compromis repris dans un fichier plus récent — D2 — se voit d'un fichier à l'autre).
 * 🔴 IDEMPOTENT : chaque ligne porte sa clé (fichier|onglet|ligne) et la marque « import fichier transaction du JJ/MM » ; rejouer
 *    n'écrit que ce qui manque.
 * 🔴 B4 — un fichier dont un total ne s'explique pas au centime n'est PAS écrit (code 2). Un total AFFICHÉ non recalculé par Excel
 *    se fait accepter, fichier par fichier, par `--accepter-non-recalcule=<nom du fichier>` (décision d'Arno).
 * 🔴 `--annuler` : montre (à blanc) puis, avec `--appliquer`, RETIRE ce que l'import a écrit (tout, ou `--fichier=`) — jamais de
 *    suppression ; les saisies faites à l'écran ne sont jamais visées.
 * 🔴 Le rapport va dans `.captures/importer-transaction/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run transaction:importer -- [--sources=/dossier] [--fichier="TABLEAU DE BORD 2025.xlsx"] [--appliquer]
 *   npm run transaction:importer -- --annuler [--fichier=…] [--appliquer]      (retire ce que l'import a écrit)
 *   npm run transaction:importer -- --retablir [--fichier=…] [--appliquer]     (remet ce que --annuler a retiré)
 *   options : --accepter-non-recalcule="TABLEAU DE BORD MACJ 2023.xlsx" · --parts-egales=doublon · --rapport=/chemin
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import ExcelJS from 'exceljs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';
import { depuisExcelJs } from '../lib/location/suivi/classeurExcelJs';
import { identifierFichier, lireFichier, type FichierLu } from '../lib/transaction/lectureTableau';
import { ACCEPTATIONS_NON_RECALCULE, planifier, type OptionsPlan } from '../lib/transaction/planImport';
import { texteFichier, texteSynthese } from '../lib/transaction/rapportImport';

const P = '[transaction:importer]';
const NOM_SCRIPT = 'importer-transaction';
export const SOURCES_DEFAUT = join(RACINE_PROJET, '.captures/transaction/sources');
const jourJJMM = (): string => new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

/** Les valeurs d'une option répétable (`--fichier=a --fichier=b` ou `--fichier=a,b`). */
export function optionsMultiples(argv: readonly string[], nom: string): string[] {
  return argv.filter((a) => a.startsWith(`--${nom}=`)).flatMap((a) => a.slice(nom.length + 3).split(',')).map((x) => x.trim()).filter(Boolean);
}

/** Les fichiers du dossier que l'import sait lire (D1 : société et année dans le nom), triés. */
export function fichiersDuDossier(dossier: string): string[] {
  return readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$') && identifierFichier(f) !== null).sort();
}

export async function lireDossier(dossier: string): Promise<FichierLu[]> {
  const lus: FichierLu[] = [];
  for (const f of fichiersDuDossier(dossier)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(dossier, f));
    lus.push(lireFichier(f, depuisExcelJs(wb as never)));
  }
  return lus;
}

export async function principal(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const appliquer = argv.includes('--appliquer');
  const annuler = argv.includes('--annuler');
  const retablir = argv.includes('--retablir');
  const dossier = optionLigne(argv, 'sources') ?? SOURCES_DEFAUT;
  const choisis = optionsMultiples(argv, 'fichier').map((f) => basename(f));
  const options: OptionsPlan = { partsEgales: optionLigne(argv, 'parts-egales') === 'doublon' ? 'doublon' : 'parts',
    accepterNonRecalcule: optionsMultiples(argv, 'accepter-non-recalcule').map((f) => basename(f)) };
  const { closePool } = await import('../lib/db/client');
  const repo = await import('../lib/transaction/importRepo');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  const marque = repo.marqueDuJour(jourJJMM());
  const sortie: string[] = [`${P} ${new Date().toISOString()} — base « ${base} » — ${appliquer ? 'ÉCRITURE (--appliquer)' : 'À BLANC (aucune écriture)'}${annuler ? ' — ANNULATION' : ''}`];
  const dire = (...l: string[]): void => { sortie.push(...l); };
  try {
    if (!existsSync(dossier)) throw new Error(`dossier des sources introuvable : ${dossier}`);
    const presentes = await repo.tablesPresentes();
    if (appliquer && !presentes) throw new Error('migration 433 non appliquée : les tables de la Transaction n’existent pas — rien n’est écrit.');
    if (retablir) {
      const comptes = await repo.retablirImport(choisis.length === 0 ? null : choisis, marque, appliquer);
      dire(`Rétablissement ${appliquer ? 'fait' : 'à blanc'} (${choisis.length === 0 ? 'tout l’import' : choisis.join(', ')}) — lignes retirées par --annuler ${appliquer ? 'rétablies' : 'qui seraient rétablies'} :`,
        ...Object.entries(comptes).map(([t, k]) => `   ${t} : ${k}`));
      return;
    }
    if (annuler) {
      const comptes = await repo.annulerImport(choisis.length === 0 ? null : choisis, marque, appliquer);
      dire(`Annulation ${appliquer ? 'faite' : 'à blanc'} (${choisis.length === 0 ? 'tout l’import' : choisis.join(', ')}) — lignes ${appliquer ? 'retirées' : 'qui seraient retirées'} (retire_le, rien n’est supprimé) :`,
        ...Object.entries(comptes).map(([t, k]) => `   ${t} : ${k}`));
      return;
    }
    const lus = await lireDossier(dossier);
    const inconnus = choisis.filter((c) => !lus.some((l) => l.fichier === c));
    if (inconnus.length > 0) throw new Error(`fichier(s) absent(s) du dossier ${dossier} : ${inconnus.join(', ')}`);
    dire(`Sources : ${dossier} — ${lus.length} fichier(s) lu(s) : ${lus.map((l) => l.fichier).join(' · ')}`,
      `Options : parts égales = ${options.partsEgales} (décision d'Arno du 27/10/2026 : les deux parts sont gardées) ; totaux non recalculés acceptés : ${[...ACCEPTATIONS_NON_RECALCULE.map((a) => `${a.fichier} (décision d'${a.decision})`), ...options.accepterNonRecalcule].join(', ') || 'aucun'}`,
      `Écriture visée : ${choisis.length === 0 ? 'tous les fichiers lus' : choisis.join(', ')}`);
    const plan = planifier(lus, options);
    const location = await repo.caLocationParMois().catch(() => null);
    for (const r of plan.rapports) dire(...texteFichier(r, lus.find((f) => f.fichier === r.fichier), plan, location));
    dire(...texteSynthese(plan));
    const vises = plan.rapports.filter((r) => choisis.length === 0 || choisis.includes(r.fichier));
    const bloques = vises.filter((r) => r.bloque);
    if (!appliquer) {
      dire('', `À BLANC : rien n’a été écrit. ${bloques.length > 0 ? `Bloqué(s) pour --appliquer (B4) : ${bloques.map((r) => r.fichier).join(', ')}.` : 'Aucun fichier bloqué.'}`);
      if (bloques.length > 0) process.exitCode = 2;
      return;
    }
    dire('', '═'.repeat(110), `ÉCRITURE — marque « ${marque} »`);
    for (const r of vises) {
      if (r.bloque) { dire(`⛔ ${r.fichier} : un total ne s’explique pas (B4) — RIEN n’est écrit pour ce fichier.`); process.exitCode = 2; continue; }
      const b = await repo.ecrireFichier(plan, r.fichier, marque);
      dire(`✔ ${r.fichier} : ventes créées ${b.ventesCreees}, mises à jour ${b.ventesMisesAJour}, marquées « à attribuer » ${b.doubles}, lignes ${b.lignes}, rétrocessions ${b.retros}, à rattacher ${b.aRattacher}, gestion ${b.gestion} mois`,
        ...b.gestionLaissee.map((x) => `     gestion ${x}`), ...b.retrosSansVente.map((x) => `     ${x}`));
    }
  } finally {
    await closePool();
    const texte = `${sortie.join('\n')}\n`;
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exit(1); });
}
