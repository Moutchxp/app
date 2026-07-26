/**
 * CLI d'INGESTION Sitadel (chantier S2). Exécuté par `tsx` :  npm run sitadel:ingest
 *
 * PAS d'ordonnanceur ici (décision d'exploitation d'Arno — cf. analytics:maintenance). Ce script :
 *   1) télécharge les 3 CSV du millésime (rids DiDo) dans `data/sitadel/` (dossier LOCAL git-ignoré) s'ils manquent ;
 *   2) lit chaque fichier EN FLUX (jamais tout en mémoire — seuls les dossiers RETENUS des départements actifs sont
 *      conservés, soit quelques milliers de lignes) ;
 *   3) filtre : périmètre (département actif) → volumétrie (PC : ETAT=2 + construction/agrandissement ; PD : ETAT=2) ;
 *   4) dédoublonne les PC par NUM_DAU entre logements et locaux (règle de fusion : cf. `fusionnerPC`) ;
 *   5) UPSERT idempotent (rejouer le même millésime ne change rien ; aucun dossier supprimé) ;
 *   6) imprime, PAR COMMUNE : lu / retenu / nouveau / déjà connu + remplissage adresse et cadastre (santé de S3).
 *
 * N'INGÈRE QUE : aucun contact moteur/score/certificat/`batiment`. DATABASE_URL chargé via `db/client`.
 */
import 'dotenv/config';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { query, closePool } from '../lib/db/client';
import { enregistrements } from '../lib/sitadel/csv';
import {
  type Dossier, type LigneBrute, type Requete,
  dansPerimetre, pcRetenu, pdRetenu, mapLignePC, mapLignePD, fusionnerPC, upserterDossier,
} from '../lib/sitadel/ingest';

const MILLESIME = '2026-06';
const RIDS = {
  logements: '8b35affb-55fc-4c1f-915b-7750f974446a',
  locaux: 'f8f0700f-806c-40a7-83b1-f21cf507e7c4',
  pd: '1a9a2f0c-56fe-4e69-84a7-fbbda2121f02',
} as const;
const urlDido = (rid: string): string =>
  `https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/${rid}/csv`;
const DOSSIER_LOCAL = 'data/sitadel';

interface StatCommune { lu: number; retenu: number; nouveau: number; dejaConnu: number; adr: number; cad: number; }

// Adaptateur : `query` de db/client contraint R à QueryResultRow ; `Requete` le laisse libre. Le pont est sûr
// (QueryResult expose bien `rows`), on caste à la frontière.
const q: Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> =>
  query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Télécharge un CSV vers un fichier local s'il n'existe pas déjà (re-jouable sans re-télécharger). */
async function telecharger(rid: string, chemin: string): Promise<void> {
  if (existsSync(chemin)) {
    console.log(`  ✓ déjà présent : ${chemin}`);
    return;
  }
  console.log(`  ↓ téléchargement ${chemin} …`);
  const res = await fetch(urlDido(rid), { headers: { 'User-Agent': 'sansvisavis-sitadel-ingest' } });
  if (!res.ok || res.body === null) throw new Error(`DiDo HTTP ${res.status} pour rid ${rid}`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(chemin));
}

/** Flux de lignes objet d'un CSV local (décodage UTF-8, parseur en flux). */
function lignes(chemin: string): AsyncGenerator<LigneBrute> {
  return enregistrements(createReadStream(chemin, { encoding: 'utf8' }));
}

async function main(): Promise<void> {
  await mkdir(DOSSIER_LOCAL, { recursive: true });
  const fichiers = {
    logements: `${DOSSIER_LOCAL}/logements.${MILLESIME}.csv`,
    locaux: `${DOSSIER_LOCAL}/locaux.${MILLESIME}.csv`,
    pd: `${DOSSIER_LOCAL}/pd.${MILLESIME}.csv`,
  };
  console.log(`Sitadel — millésime ${MILLESIME}`);
  await telecharger(RIDS.logements, fichiers.logements);
  await telecharger(RIDS.locaux, fichiers.locaux);
  await telecharger(RIDS.pd, fichiers.pd);

  // Millésime (get-or-create) + départements actifs.
  const mil = await q<{ id: number }>(
    `INSERT INTO sitadel_millesime (code, rid_logements, rid_locaux, rid_pd)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (code) DO UPDATE SET rid_logements = EXCLUDED.rid_logements, rid_locaux = EXCLUDED.rid_locaux,
       rid_pd = EXCLUDED.rid_pd, telecharge_a = now()
     RETURNING id`,
    [MILLESIME, RIDS.logements, RIDS.locaux, RIDS.pd],
  );
  const millesimeId = mil.rows[0].id;
  const actifsRows = await q<{ departement: string }>(`SELECT DISTINCT departement FROM commune_perimetre WHERE actif`);
  const actifs = new Set(actifsRows.rows.map((r) => r.departement.trim()));
  console.log(`Départements actifs : ${[...actifs].sort().join(', ') || '(aucun)'}`);

  const stats = new Map<string, StatCommune>();
  const stat = (comm: string): StatCommune => {
    let s = stats.get(comm);
    if (!s) { s = { lu: 0, retenu: 0, nouveau: 0, dejaConnu: 0, adr: 0, cad: 0 }; stats.set(comm, s); }
    return s;
  };
  let lignesLues = 0;

  // 1) PC : logements puis locaux → carte dédoublonnée par NUM_DAU (seuls les retenus du périmètre sont gardés).
  const pcParNum = new Map<string, Dossier>();
  for (const fichier of [fichiers.logements, fichiers.locaux]) {
    for await (const r of lignes(fichier)) {
      lignesLues++;
      const dep = (r.DEP_CODE ?? '').trim();
      if (!dansPerimetre(dep, actifs)) continue;
      stat((r.COMM ?? '').trim()).lu++;
      if (!pcRetenu(r)) continue;
      const d = mapLignePC(r);
      const existant = pcParNum.get(d.numDau);
      pcParNum.set(d.numDau, existant ? fusionnerPC(existant, d) : d);
    }
  }

  // 2) PD : dédoublonné par NUM_PD (namespace distinct des PC).
  const pdParNum = new Map<string, Dossier>();
  for await (const r of lignes(fichiers.pd)) {
    lignesLues++;
    const dep = (r.DEP_CODE ?? '').trim();
    if (!dansPerimetre(dep, actifs)) continue;
    stat((r.COMM ?? '').trim()).lu++;
    if (!pdRetenu(r)) continue;
    const d = mapLignePD(r);
    if (!pdParNum.has(d.numDau)) pdParNum.set(d.numDau, d);
  }

  // 3) UPSERT (PC puis PD) + compteurs par commune.
  const tousLesDossiers = [...pcParNum.values(), ...pdParNum.values()];
  for (const d of tousLesDossiers) {
    const s = stat(d.codeInsee);
    s.retenu++;
    if (d.adrLibvoieTer !== null) s.adr++;
    if (d.secCadastre1 !== null) s.cad++;
    const { nouveau } = await upserterDossier(q, d, millesimeId, MILLESIME);
    if (nouveau) s.nouveau++; else s.dejaConnu++;
  }
  const lignesRetenues = tousLesDossiers.length;

  await q(`UPDATE sitadel_millesime SET lignes_lues = $1, lignes_retenues = $2 WHERE id = $3`,
    [lignesLues, lignesRetenues, millesimeId]);

  // 4) Sortie par commune (santé de S3 : remplissage adresse / cadastre).
  console.log('\ncommune    |     lu | retenu | nouveau | déjàconnu |  adr% | cad%');
  console.log('-----------+--------+--------+---------+-----------+-------+------');
  const pct = (n: number, d: number): string => (d === 0 ? '   —' : `${Math.round((100 * n) / d)}%`.padStart(4));
  for (const comm of [...stats.keys()].sort()) {
    const s = stats.get(comm)!;
    console.log(
      `${comm.padEnd(10)} | ${String(s.lu).padStart(6)} | ${String(s.retenu).padStart(6)} | ` +
      `${String(s.nouveau).padStart(7)} | ${String(s.dejaConnu).padStart(9)} | ${pct(s.adr, s.retenu)} | ${pct(s.cad, s.retenu)}`,
    );
  }
  console.log(`\nTOTAL : ${lignesLues} lignes lues · ${lignesRetenues} dossiers retenus ` +
    `(PC ${pcParNum.size} + PD ${pdParNum.size}) · millésime ${MILLESIME} (id ${millesimeId}).`);
}

void main()
  .catch((e) => { console.error('[sitadel:ingest] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
