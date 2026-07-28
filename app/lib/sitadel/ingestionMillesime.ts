/**
 * Orchestration RÉUTILISABLE de l'ingestion Sitadel (chantier S11a) — extraite telle quelle de l'ancien
 * `app/scripts/sitadel-ingest.ts` (chantiers S2/S2b) pour être appelable par le CLI ET par le moteur `executerVeille`,
 * en RETOURNANT des compteurs (l'ancien `main()` ne faisait qu'imprimer). Le comportement est INCHANGÉ : mêmes
 * téléchargements, même garde-fou de complétude (S2b), mêmes filtres/mapping/UPSERT (`ingest.ts`, non touché), mêmes
 * logs console. Cette extraction est NEUTRE (prouvée par un re-run idempotent : « déjà présent / 0 nouveau »).
 *
 * N'INGÈRE QUE : aucun contact moteur/score/certificat/`batiment`. Ne charge PAS `.env` ni ne ferme le pool (c'est au CLI
 * appelant de le faire — cf. `app/lib/chargerEnv.ts` + `closePool`).
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { query } from '../db/client';
import { enregistrements, enregistrementsBruts } from './csv';
import {
  type Dossier, type LigneBrute, type Requete,
  dansPerimetre, pcRetenu, pdRetenu, mapLignePC, mapLignePD, fusionnerPC, upserterDossier, csvParaitComplet,
} from './ingest';

/** Millésime de RÉFÉRENCE (S2, premier ingéré) — sert seulement de valeur par défaut à `fichiersMillesime`. ⚠️ Depuis
 *  S11a-FIX il n'est PLUS la cible figée de l'ingestion : `ingererMillesime` ingère le millésime DÉTECTÉ à distance. */
export const MILLESIME = '2026-06';
export const RIDS = {
  logements: '8b35affb-55fc-4c1f-915b-7750f974446a',
  locaux: 'f8f0700f-806c-40a7-83b1-f21cf507e7c4',
  pd: '1a9a2f0c-56fe-4e69-84a7-fbbda2121f02',
} as const;
const BASE_DIDO = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles';
export const urlDido = (rid: string): string => `${BASE_DIDO}/${rid}/csv`;
/** Endpoint de MÉTADONNÉES (JSON, quelques Ko) : donne `millesime`/`last_modified` SANS télécharger les ~880 Mo de CSV. */
export const urlMetadonneesDido = (rid: string): string => `${BASE_DIDO}/${rid}`;
export const DOSSIER_LOCAL = 'data/sitadel';

/** Chemins locaux des 3 CSV d'un millésime. */
export function fichiersMillesime(millesime: string = MILLESIME): { logements: string; locaux: string; pd: string } {
  return {
    logements: `${DOSSIER_LOCAL}/logements.${millesime}.csv`,
    locaux: `${DOSSIER_LOCAL}/locaux.${millesime}.csv`,
    pd: `${DOSSIER_LOCAL}/pd.${millesime}.csv`,
  };
}

/** Compteurs RÉELS d'un run d'ingestion (ce que l'ancien `main()` imprimait sans le retourner). */
export interface CompteursIngestion {
  millesime: string;
  millesimeId: number;
  lignesLues: number;
  dossiersRetenus: number;
  dossiersNouveaux: number;
  dossiersDejaConnus: number;
  pc: number;
  pd: number;
}

interface StatCommune { lu: number; retenu: number; nouveau: number; dejaConnu: number; adr: number; cad: number; }

const q: Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> =>
  query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Millésime distant, LU par les métadonnées DiDo (bon marché). Lit le rid « logements » (millésime commun aux 3 fichiers). */
export async function millesimeDistantDido(): Promise<string> {
  const res = await fetch(urlMetadonneesDido(RIDS.logements), { headers: { 'User-Agent': 'sansvisavis-sitadel-ingest' } });
  if (!res.ok) throw new Error(`DiDo métadonnées HTTP ${res.status} pour rid ${RIDS.logements}`);
  const meta = (await res.json()) as { millesime?: unknown };
  const mil = typeof meta.millesime === 'string' ? meta.millesime.trim() : '';
  if (mil === '') throw new Error('DiDo métadonnées : champ « millesime » absent ou vide');
  return mil;
}

/** Nombre de champs d'une ligne CSV (via le VRAI tokenizer → guillemets/`;` internes corrects). */
async function nbChamps(ligne: string): Promise<number> {
  const src = (async function* () { yield ligne.endsWith('\n') ? ligne : `${ligne}\n`; })();
  for await (const rec of enregistrementsBruts(src)) return rec.length;
  return 0;
}

/**
 * Un fichier téléchargé est-il COMPLET ? Contrôle léger (en-tête + queue seulement, sans relire tout le fichier) :
 * la dernière ligne a-t-elle autant de champs que l'en-tête, et le fichier finit-il par un saut de ligne ? Capte la
 * troncature chunkée observée au 2026-06 (cf. `csvParaitComplet`).
 */
async function telechargementComplet(chemin: string): Promise<boolean> {
  const fh = await open(chemin, 'r');
  try {
    const { size } = await fh.stat();
    if (size === 0) return false;
    const tete = Buffer.alloc(Math.min(size, 65536));
    await fh.read(tete, 0, tete.length, 0);
    const entete = tete.toString('utf8').split('\n')[0];
    const queueLen = Math.min(size, 1_048_576);
    const queue = Buffer.alloc(queueLen);
    await fh.read(queue, 0, queueLen, size - queueLen);
    const texte = queue.toString('utf8');
    const lignesArr = texte.split('\n').filter((l) => l.length > 0);
    const derniere = lignesArr[lignesArr.length - 1] ?? '';
    return csvParaitComplet(await nbChamps(entete), await nbChamps(derniere), texte.endsWith('\n'));
  } finally {
    await fh.close();
  }
}

/**
 * Télécharge un CSV localement, EN REFUSANT toute troncature : téléchargement vers `.part`, vérification de complétude,
 * puis promotion atomique (rename) — sinon nouvel essai (jusqu'à 3). Un fichier déjà présent n'est réutilisé que s'il est
 * complet (sinon on le re-télécharge : c'est ce qui répare un cache tronqué). Échec après 3 essais → on JETTE plutôt que
 * d'ingérer des données partielles en silence.
 */
async function telecharger(rid: string, chemin: string): Promise<void> {
  if (existsSync(chemin) && (await telechargementComplet(chemin))) {
    console.log(`  ✓ complet, déjà présent : ${chemin}`);
    return;
  }
  const part = `${chemin}.part`;
  const MAX_ESSAIS = 3;
  for (let essai = 1; essai <= MAX_ESSAIS; essai++) {
    console.log(`  ↓ téléchargement ${chemin} (essai ${essai}/${MAX_ESSAIS}) …`);
    const res = await fetch(urlDido(rid), { headers: { 'User-Agent': 'sansvisavis-sitadel-ingest' } });
    if (!res.ok || res.body === null) throw new Error(`DiDo HTTP ${res.status} pour rid ${rid}`);
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(part));
    if (await telechargementComplet(part)) {
      await rename(part, chemin);
      console.log(`  ✓ complet : ${chemin}`);
      return;
    }
    console.warn(`  ⚠ téléchargement INCOMPLET (tronqué) de ${chemin} — nouvel essai`);
  }
  await rm(part, { force: true });
  throw new Error(
    `Téléchargement Sitadel incomplet (tronqué) après ${MAX_ESSAIS} essais pour ${chemin} — ` +
    `ingestion refusée pour ne pas ingérer de données partielles.`,
  );
}

/** Flux de lignes objet d'un CSV local (décodage UTF-8, parseur en flux). */
function lignes(chemin: string): AsyncGenerator<LigneBrute> {
  return enregistrements(createReadStream(chemin, { encoding: 'utf8' }));
}

/**
 * Ingère LE MILLÉSIME DEMANDÉ (celui détecté à distance — plus de constante figée : cf. S11a-FIX, où l'ancien pin
 * `MILLESIME='2026-06'` faisait diverger `millesime_ingere` de `millesime_detecte`) et RETOURNE ses compteurs. Corps
 * repris à l'identique de l'ancien `main()` (mêmes logs, même séquence, même garde-fou S2b), enrichi des seuls TOTAUX
 * nouveau/déjàconnu pour le retour. Les `RIDS` sont STABLES : le même datafile sert le CSV du millésime courant.
 */
export async function ingererMillesime(millesime: string): Promise<CompteursIngestion> {
  await mkdir(DOSSIER_LOCAL, { recursive: true });
  const fichiers = fichiersMillesime(millesime);
  console.log(`Sitadel — millésime ${millesime}`);
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
    [millesime, RIDS.logements, RIDS.locaux, RIDS.pd],
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

  // 3) UPSERT (PC puis PD) + compteurs par commune ET totaux.
  const tousLesDossiers = [...pcParNum.values(), ...pdParNum.values()];
  let totalNouveau = 0;
  let totalDejaConnu = 0;
  for (const d of tousLesDossiers) {
    const s = stat(d.codeInsee);
    s.retenu++;
    if (d.adrLibvoieTer !== null) s.adr++;
    if (d.secCadastre1 !== null) s.cad++;
    const { nouveau } = await upserterDossier(q, d, millesimeId, millesime);
    if (nouveau) { s.nouveau++; totalNouveau++; } else { s.dejaConnu++; totalDejaConnu++; }
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
    `(PC ${pcParNum.size} + PD ${pdParNum.size}) · millésime ${millesime} (id ${millesimeId}).`);

  return {
    millesime, millesimeId, lignesLues, dossiersRetenus: lignesRetenues,
    dossiersNouveaux: totalNouveau, dossiersDejaConnus: totalDejaConnu, pc: pcParNum.size, pd: pdParNum.size,
  };
}
