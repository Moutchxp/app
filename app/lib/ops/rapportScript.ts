import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ══ 🔴🔴 OÙ UN SCRIPT ÉCRIT SON RAPPORT (Arno, 21/10/2026) ═══════════════════════════════════════════════════════════════════
 * « Interdit d'écrire sur le Bureau. » Par défaut, le rapport d'un script va dans `.captures/<nom-du-script>/` du PROJET (hors git),
 * nommé `<préfixe>-<date>.<ext>` ; `--rapport=` (ou l'option du script) peut désigner un FICHIER, ou un DOSSIER — le fichier est
 * alors créé dedans au lieu d'échouer (l'erreur EISDIR constatée). Les dossiers manquants sont créés.
 * 🔴 Arno (22/10/2026) — AUCUN RAPPORT N'EN ÉCRASE UN AUTRE (deux scripts lancés la même minute dans `…/rapports/` s'étaient
 * écrasés) : un DOSSIER demandé reçoit le sous-dossier du script (`<dossier>/<nom-du-script>/`, sauf s'il porte déjà ce nom) ;
 * le nom du fichier porte les SECONDES ; et un fichier déjà présent n'est jamais repris (`-2`, `-3`… ajoutés).
 * ⚠️ Ne concerne que les RAPPORTS et journaux de lecture : les sauvegardes de base avant écriture ne sont pas des rapports.
 */

/** La racine du projet (`<racine>/app/lib/ops` → `<racine>`), quel que soit le dossier courant. */
export const RACINE_PROJET = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** « 2026-10-21-010507 » : la date locale du fichier, à la seconde, triable. PUR. */
export function horodatage(d: Date = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

/** Le dossier des rapports d'un script : `<racine>/.captures/<nom-du-script>/`. PUR. */
export function dossierRapports(nomScript: string, racine = RACINE_PROJET): string {
  return join(racine, '.captures', nomScript);
}

/**
 * Le CHEMIN DU RAPPORT : `demande` (l'option `--rapport=` ou équivalent) s'il est donné — un dossier existant (ou terminé par
 * « / ») reçoit `<nomScript>/<préfixe>-<date>.<ext>` (pas de sous-dossier s'il porte déjà le nom du script) ; un fichier est pris
 * tel quel ; sinon `.captures/<nomScript>/<préfixe>-<date>.<ext>`. Crée les dossiers. Un fichier qui existe déjà n'est jamais
 * repris pour un nom choisi ici : `-2`, `-3`… (un FICHIER demandé explicitement reste celui demandé).
 */
export function cheminRapport(o: { nomScript: string; demande?: string | null; prefixe?: string; extension?: string; maintenant?: Date; racine?: string }): string {
  const fichier = `${o.prefixe ?? 'rapport'}-${horodatage(o.maintenant)}.${o.extension ?? 'txt'}`;
  const demande = (o.demande ?? '').trim();
  let chemin: string;
  let choisi = true;
  if (demande === '') chemin = join(dossierRapports(o.nomScript, o.racine), fichier);
  else if (/[\\/]$/.test(demande) || (existsSync(demande) && statSync(demande).isDirectory())) {
    const dossier = demande.replace(/[\\/]+$/, '');
    chemin = join(basename(dossier) === o.nomScript ? dossier : join(dossier, o.nomScript), fichier);
  } else { chemin = demande; choisi = false; }
  mkdirSync(dirname(chemin), { recursive: true });
  if (choisi && existsSync(chemin)) {
    const ext = `.${o.extension ?? 'txt'}`;
    const sans = chemin.slice(0, -ext.length);
    let n = 2;
    while (existsSync(`${sans}-${n}${ext}`)) n += 1;
    chemin = `${sans}-${n}${ext}`;
  }
  return chemin;
}

/** La valeur d'une option `--nom=valeur` de la ligne de commande, ou `null`. PUR. */
export function optionLigne(argv: readonly string[], nom: string): string | null {
  const a = argv.find((x) => x.startsWith(`--${nom}=`));
  return a === undefined ? null : a.slice(nom.length + 3);
}
