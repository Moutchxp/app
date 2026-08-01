/**
 * I/O de l'ingestion de l'annuaire CADA des PRADA (chantier S14b) : lecture de la page pour trouver le lien .csv,
 * téléchargement CALQUÉ sur `ingestionMillesime.ts:109-139` (vers `.part`, contrôle de complétude, promotion atomique par
 * rename, 3 essais, on JETTE plutôt qu'ingérer un partiel), puis insertion en UNE transaction. Réutilise le tokenizer
 * `csv.ts` et le verdict `csvParaitComplet` de `ingest.ts` — jamais dupliqués. AUCUN ENVOI ; la seule requête sortante est
 * la lecture de la page CADA + le téléchargement du CSV. AUCUN rapprochement de commune (code_insee reste NULL).
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { query, withTransaction } from '../db/client';
import { enregistrementsBruts } from './csv';
import { csvParaitComplet } from './ingest';
import {
  DELIMITEUR_CADA, extraireLienCsv, millesimeDepuisNomFichier, parserAnnuaireCada, rapportDepartements,
  sqlUpsertPradaImport, sqlUpsertPradaMillesime,
} from './prada';

const UA = 'sansvisavis-prada-ingest';
export const PAGE_ANNUAIRE_CADA = 'https://www.cada.fr/lacada/annuaire-des-prada';
export const DOSSIER_LOCAL_PRADA = 'data/prada';

export interface CompteursPrada {
  millesime: string;
  fichierSource: string;
  lignesLues: number;
  inserees: number;
  misesAJour: number;
  parDepartement: [string, number][];
  cibles: Record<string, number>;
  courrielsVides: number;
}

/**
 * Complétude d'un CSV CADA téléchargé, avec le verdict PARTAGÉ `csvParaitComplet` (en-tête vs dernier ENREGISTREMENT +
 * fin par saut de ligne). ⚠️ On parcourt le fichier ENTIER via le tokenizer (fichier petit, ~660 Ko) au lieu d'un simple
 * découpage de queue : l'adresse PRADA est MULTI-LIGNES entre guillemets, si bien qu'un `split('\n')` de la fin
 * confondrait une continuation d'adresse avec une ligne tronquée (≠ Sitadel, aux lignes mono-physiques). Le premier octet
 * lu depuis la fin donne la présence du saut de ligne final.
 */
async function telechargementComplet(chemin: string): Promise<boolean> {
  const fh = await open(chemin, 'r');
  let finitParSautDeLigne: boolean;
  try {
    const { size } = await fh.stat();
    if (size === 0) return false;
    const dernier = Buffer.alloc(1);
    await fh.read(dernier, 0, 1, size - 1);
    const c = dernier.toString('utf8');
    finitParSautDeLigne = c === '\n' || c === '\r';
  } finally {
    await fh.close();
  }
  let enteteLen = 0, derniereLen = 0;
  for await (const rec of enregistrementsBruts(createReadStream(chemin, { encoding: 'utf8' }), DELIMITEUR_CADA)) {
    if (enteteLen === 0) enteteLen = rec.length;
    derniereLen = rec.length;
  }
  return csvParaitComplet(enteteLen, derniereLen, finitParSautDeLigne);
}

/**
 * Télécharge le CSV en REFUSANT toute troncature (calqué sur `ingestionMillesime.telecharger`) : `.part`, vérification de
 * complétude, promotion atomique par rename, 3 essais, puis on JETTE. Un fichier déjà présent n'est réutilisé que s'il est
 * complet (répare un cache tronqué).
 */
async function telecharger(url: string, chemin: string): Promise<void> {
  if (existsSync(chemin) && (await telechargementComplet(chemin))) {
    console.log(`  ✓ complet, déjà présent : ${chemin}`);
    return;
  }
  const part = `${chemin}.part`;
  const MAX_ESSAIS = 3;
  for (let essai = 1; essai <= MAX_ESSAIS; essai++) {
    console.log(`  ↓ téléchargement ${chemin} (essai ${essai}/${MAX_ESSAIS}) …`);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok || res.body === null) throw new Error(`Annuaire CADA HTTP ${res.status} pour ${url}`);
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
    `Téléchargement annuaire CADA incomplet (tronqué) après ${MAX_ESSAIS} essais pour ${chemin} — ` +
    `import refusé pour ne pas ingérer un fichier partiel.`,
  );
}

/** Lit la page de l'annuaire CADA et en déduit le lien .csv, le nom de fichier et le millésime (sans télécharger le CSV). */
export async function lienCsvDistant(): Promise<{ url: string; nomFichier: string; millesime: string }> {
  const res = await fetch(PAGE_ANNUAIRE_CADA, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Page annuaire CADA HTTP ${res.status} pour ${PAGE_ANNUAIRE_CADA}`);
  const html = await res.text();
  const url = extraireLienCsv(html, PAGE_ANNUAIRE_CADA);
  const nomFichier = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
  const millesime = millesimeDepuisNomFichier(nomFichier);
  return { url, nomFichier, millesime };
}

/** Vrai si ce millésime est déjà journalisé dans `prada_millesime` (→ « rien de nouveau », sans télécharger). */
export async function millesimeDejaImporte(code: string): Promise<boolean> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM prada_millesime WHERE code = $1`, [code]);
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Insère les lignes BRUTES en UNE transaction : `prada_import` (upsert sur (millesime, ligne), 8 colonnes brutes
 * uniquement — code_insee/rapprochement JAMAIS écrasés), puis `prada_millesime`. `ligne` = rang 1-based de la ligne de
 * données (en-tête exclu). Retourne les compteurs pour le rapport CLI.
 */
export async function ingererLignes(millesime: string, nomFichier: string, lignes: string[][]): Promise<CompteursPrada> {
  const sqlImport = sqlUpsertPradaImport();
  let inserees = 0, misesAJour = 0;
  await withTransaction(async (q) => {
    for (let i = 0; i < lignes.length; i++) {
      const r = await q<{ insere: boolean }>(sqlImport, [millesime, i + 1, ...lignes[i]]);
      if (r.rows[0]?.insere) inserees += 1; else misesAJour += 1;
    }
    await q(sqlUpsertPradaMillesime(), [millesime, nomFichier, lignes.length, lignes.length]);
  });
  const rap = rapportDepartements(lignes);
  return {
    millesime, fichierSource: nomFichier, lignesLues: lignes.length, inserees, misesAJour,
    parDepartement: rap.parDepartement, cibles: rap.cibles, courrielsVides: rap.courrielsVides,
  };
}

/**
 * Point d'entrée : lit la page CADA → millésime ; si déjà importé et non forcé → 'rien_a_faire' SANS télécharger ; sinon
 * télécharge (garde-fou de troncature), parse (rejet du fichier entier si non conforme) et insère en transaction.
 */
export async function importerAnnuaireCada(opts: { forcer?: boolean } = {}): Promise<
  { statut: 'importe'; millesime: string; compteurs: CompteursPrada } | { statut: 'rien_a_faire'; millesime: string }
> {
  const { url, nomFichier, millesime } = await lienCsvDistant();
  if (opts.forcer !== true && (await millesimeDejaImporte(millesime))) {
    return { statut: 'rien_a_faire', millesime };
  }
  await mkdir(DOSSIER_LOCAL_PRADA, { recursive: true });
  const chemin = `${DOSSIER_LOCAL_PRADA}/${nomFichier}`;
  await telecharger(url, chemin);
  const lignes = await parserAnnuaireCada(createReadStream(chemin, { encoding: 'utf8' }));
  const compteurs = await ingererLignes(millesime, nomFichier, lignes);
  return { statut: 'importe', millesime, compteurs };
}
