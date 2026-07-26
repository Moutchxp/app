/**
 * CLI d'import du référentiel des COMMUNES (chantier S4). Exécuté par `tsx` :  npm run commune:import
 *
 * SOURCE : IGN ADMIN EXPRESS (COG CARTO) via le WFS de la Géoplateforme (`data.geopf.fr`), Licence Ouverte Etalab 2.0
 * — MÊME hôte que le Plan IGN du certificat, JAMAIS un dérivé OpenStreetMap (ODbL, incompatible commercial).
 *
 * Modèle `sitadel-ingest` : téléchargement dans `data/commune/` (LOCAL, git-ignoré), VÉRIFICATION DE COMPLÉTUDE
 * (numberReturned == numberMatched), import IDEMPOTENT (rejouer ne change rien), restreint aux départements 75/92/93/78.
 * Paris : la couche COMMUNE donne 75056 (commune unique) → aligné sur sitadel_dossier ; les arrondissements 751xx ne
 * sont PAS importés. Renseigne `source` + `millesime` sur chaque ligne (obligation Etalab). LECTURE de sitadel_dossier
 * pour confronter la couverture ; n'écrit QUE `commune`.
 */
import 'dotenv/config';
import { createWriteStream, existsSync } from 'node:fs';
import { readFile, mkdir, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { query, closePool } from '../lib/db/client';
import {
  type CollectionCommunes, type Requete,
  DEPARTEMENTS, SOURCE_COMMUNE, MILLESIME_COMMUNE,
  urlWfsCommunes, mapFeature, collectionComplete, upserterCommune,
} from '../lib/sitadel/commune';

const DOSSIER_LOCAL = 'data/commune';
const FICHIER = `${DOSSIER_LOCAL}/adminexpress.75-92-93-78.geojson`;

const q: Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> =>
  query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Télécharge le GeoJSON WFS s'il manque, en refusant toute troncature (vérif complétude → sinon nouvel essai). */
async function telecharger(): Promise<CollectionCommunes> {
  const lire = async (): Promise<CollectionCommunes | null> => {
    try { return JSON.parse(await readFile(FICHIER, 'utf8')) as CollectionCommunes; } catch { return null; }
  };
  if (existsSync(FICHIER)) {
    const c = await lire();
    if (c && collectionComplete(c)) { console.log(`  ✓ complet, déjà présent : ${FICHIER}`); return c; }
  }
  const part = `${FICHIER}.part`;
  const MAX = 3;
  for (let essai = 1; essai <= MAX; essai++) {
    console.log(`  ↓ téléchargement ADMIN EXPRESS (essai ${essai}/${MAX}) …`);
    const res = await fetch(urlWfsCommunes(), { headers: { 'User-Agent': 'sansvisavis-commune-import' } });
    if (!res.ok || res.body === null) throw new Error(`WFS HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(part));
    let c: CollectionCommunes | null = null;
    try { c = JSON.parse(await readFile(part, 'utf8')) as CollectionCommunes; } catch { c = null; }
    if (c && collectionComplete(c)) { await rename(part, FICHIER); console.log(`  ✓ complet : ${FICHIER}`); return c; }
    console.warn('  ⚠ téléchargement incomplet — nouvel essai');
  }
  await rm(part, { force: true });
  throw new Error(`Téléchargement ADMIN EXPRESS incomplet après ${MAX} essais — import refusé (données partielles).`);
}

async function main(): Promise<void> {
  await mkdir(DOSSIER_LOCAL, { recursive: true });
  console.log('Commune — IGN ADMIN EXPRESS COG CARTO (Etalab 2.0)');
  const collection = await telecharger();

  const communes = (collection.features ?? []).map(mapFeature).filter((c): c is NonNullable<typeof c> => c !== null);
  const parDept = new Map<string, { total: number; nouveau: number }>();
  for (const c of communes) {
    const { nouveau } = await upserterCommune(q, c, SOURCE_COMMUNE, MILLESIME_COMMUNE);
    const s = parDept.get(c.departement) ?? { total: 0, nouveau: 0 };
    s.total += 1; if (nouveau) s.nouveau += 1;
    parDept.set(c.departement, s);
  }

  console.log('\nCommunes importées par département :');
  for (const d of DEPARTEMENTS) {
    const s = parDept.get(d) ?? { total: 0, nouveau: 0 };
    console.log(`  ${d} : ${s.total} (dont ${s.nouveau} nouvelles)`);
  }
  console.log(`  TOTAL : ${communes.length} communes.`);

  // Confrontation à sitadel_dossier : codes Sitadel SANS commune correspondante (dégradation gracieuse dans la tuile).
  const orphelins = await q<{ code_insee: string; departement: string; n: number }>(
    `SELECT d.code_insee, d.departement, count(*)::int AS n
     FROM sitadel_dossier d LEFT JOIN commune c ON c.code_insee = d.code_insee
     WHERE c.code_insee IS NULL
     GROUP BY d.code_insee, d.departement ORDER BY n DESC`,
  );
  console.log(`\nCodes Sitadel SANS commune (affichés en code seul) : ${orphelins.rows.length}`);
  for (const o of orphelins.rows) console.log(`  ${o.code_insee} (dép. ${o.departement}) — ${o.n} dossier(s)`);
}

void main()
  .catch((e) => { console.error('[commune:import] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
