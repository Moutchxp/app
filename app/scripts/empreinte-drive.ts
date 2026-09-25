/**
 * CLI `gestion:drive:empreinte` — MODULE « GESTION », LOT DRIVE-1 : LA PREUVE QUE RIEN N'A BOUGÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 STRICTEMENT EN LECTURE. Elle relève le `modifiedTime` de chaque élément de 1er niveau de « GESTION LOCATIVE »
 * et de « Documents clients scannés », et les écrit dans un fichier. On la lance AVANT toute création, puis APRÈS,
 * et on compare : deux relevés identiques prouvent qu'aucun élément préexistant n'a été touché.
 *
 * 🔴 POURQUOI `modifiedTime` ET PAS UN SIMPLE COMPTAGE. Un comptage ne verrait pas un renommage, ni un déplacement
 * à l'intérieur, ni un partage modifié. `modifiedTime` bouge dès que le contenu d'un dossier change — y compris
 * quand on y crée quelque chose. C'est précisément ce qu'on veut savoir.
 *
 * ⚠️ « GESTION LOCATIVE » lui-même DOIT changer : on y crée la racine. C'est la seule différence attendue, et la
 * comparaison la nomme explicitement au lieu de la passer sous silence.
 *
 * Usage :
 *   npm run gestion:drive:empreinte -- --sortie=/chemin/avant.json
 *   npm run gestion:drive:empreinte -- --sortie=/chemin/apres.json --comparer=/chemin/avant.json
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { DRIVE_NOM, RACINE_NOM } from '../lib/gestion/driveGardeFou';

const P = '[gestion:drive:empreinte]';
const API = 'https://www.googleapis.com/drive/v3';
const DOSSIER_SCANNES = 'documents clients scannés';

export interface Element { id: string; nom: string; modifie: string }
export interface Empreinte {
  releveLe: string;
  compte: string;
  driveId: string;
  gestionLocative: Element[];
  documentsClientsScannes: Element[];
}

/**
 * COMPARE DEUX RELEVÉS. PUR — donc éprouvable sans réseau, ce qui compte : c'est cette fonction qui rend le verdict.
 *
 * Rend la liste des écarts. Un élément NOUVEAU dans « GESTION LOCATIVE » n'est un écart que s'il ne s'appelle pas
 * « Base de données locative » : c'est celui-là, et lui seul, que ce lot a le droit d'ajouter.
 */
export function comparer(avant: Empreinte, apres: Empreinte): string[] {
  const ecarts: string[] = [];

  const examiner = (quoi: string, a: readonly Element[], b: readonly Element[], toleranceRacine: boolean): void => {
    const parIdA = new Map(a.map((x) => [x.id, x]));
    const parIdB = new Map(b.map((x) => [x.id, x]));

    for (const [id, x] of parIdA) {
      const y = parIdB.get(id);
      if (y === undefined) { ecarts.push(`${quoi} : « ${x.nom} » a DISPARU (${id})`); continue; }
      if (y.nom !== x.nom) ecarts.push(`${quoi} : « ${x.nom} » a été RENOMMÉ en « ${y.nom} » (${id})`);
      if (y.modifie !== x.modifie) {
        ecarts.push(`${quoi} : « ${x.nom} » a été MODIFIÉ (${x.modifie} → ${y.modifie})`);
      }
    }
    for (const [id, y] of parIdB) {
      if (parIdA.has(id)) continue;
      if (toleranceRacine && y.nom.trim() === RACINE_NOM) continue;   // la seule création permise par ce lot
      ecarts.push(`${quoi} : « ${y.nom} » est APPARU (${id})`);
    }
  };

  examiner(DRIVE_NOM, avant.gestionLocative, apres.gestionLocative, true);
  examiner('Documents clients scannés', avant.documentsClientsScannes, apres.documentsClientsScannes, false);
  return ecarts;
}

async function lire(jeton: string, chemin: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${API}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const elements = (j: Record<string, unknown>): Element[] =>
  (Array.isArray(j.files) ? j.files : [])
    .map((f) => f as { id: string; name: string; modifiedTime: string })
    .map((f) => ({ id: f.id, nom: f.name, modifie: f.modifiedTime }))
    .sort((a, b) => a.id.localeCompare(b.id));

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const compte = argv.find((a) => a.startsWith('--compte='))?.slice('--compte='.length) ?? 'gestion@criterimmo.fr';
  const sortie = argv.find((a) => a.startsWith('--sortie='))?.slice('--sortie='.length) ?? null;
  const comparerA = argv.find((a) => a.startsWith('--comparer='))?.slice('--comparer='.length) ?? null;

  const jeton = await jetonPourSubject(compte, { fetch });
  if (!jeton.ok) { console.error(`${P} ❌ ${jeton.motif}`); process.exitCode = 1; return; }

  const drives = await lire(jeton.jeton, '/drives?pageSize=100&fields=drives(id,name)');
  const d = (Array.isArray(drives.drives) ? drives.drives : [])
    .map((x) => x as { id: string; name: string })
    .find((x) => x.name.trim().toUpperCase() === DRIVE_NOM);
  if (d === undefined) { console.error(`${P} ❌ « ${DRIVE_NOM} » invisible pour ${compte}`); process.exitCode = 1; return; }

  const enfants = async (parent: string): Promise<Element[]> => elements(await lire(jeton.jeton,
    `/files?q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}`
    + `&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${d.id}`
    + '&pageSize=1000&fields=files(id,name,modifiedTime)'));

  const niveau1 = await enfants(d.id);
  const scannes = niveau1.find((x) => x.nom.trim().toLowerCase() === DOSSIER_SCANNES);
  const empreinte: Empreinte = {
    releveLe: new Date().toISOString(), compte, driveId: d.id,
    gestionLocative: niveau1,
    documentsClientsScannes: scannes === undefined ? [] : await enfants(scannes.id),
  };

  console.log(`${P} « ${DRIVE_NOM} » : ${empreinte.gestionLocative.length} éléments de 1er niveau`);
  console.log(`${P} « Documents clients scannés » : ${empreinte.documentsClientsScannes.length} éléments`);
  if (sortie !== null) { writeFileSync(sortie, JSON.stringify(empreinte, null, 1)); console.log(`${P} → ${sortie}`); }

  if (comparerA !== null) {
    const avant = JSON.parse(readFileSync(comparerA, 'utf8')) as Empreinte;
    const ecarts = comparer(avant, empreinte);
    console.log('');
    if (ecarts.length === 0) {
      console.log(`${P} ✅ AUCUN élément préexistant n’a changé — ni dans « ${DRIVE_NOM} », ni dans`);
      console.log(`${P}    « Documents clients scannés ». Seule « ${RACINE_NOM} » a pu apparaître.`);
    } else {
      console.log(`${P} 🔴 ${ecarts.length} ÉCART(S) :`);
      for (const e of ecarts) console.log(`${P}    · ${e}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal();
}
