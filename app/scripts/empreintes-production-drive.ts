/**
 * CLI `gestion:drive:empreintes-production` — MODULE « GESTION », LOT DRIVE-2-bis.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 STRICTEMENT EN LECTURE, ET SUR UN DOSSIER EN PRODUCTION. « Documents clients scannés » est le dossier réel de
 * l'agence : intouchable. Cette commande n'émet que des `files.list` — MÉTADONNÉES uniquement (identifiant, nom,
 * empreinte MD5, taille). Aucun octet de contenu n'est téléchargé, aucune écriture n'est envoyée, et ce dossier
 * n'entre JAMAIS dans la liste blanche : le garde-fou refuserait toute écriture s'il en venait une.
 *
 * CE QU'ELLE SERT À : savoir ce qui est DÉJÀ en production, pour ne pas le recopier. Elle marque chaque pièce
 * copiée dont l'empreinte se retrouve là-bas. C'est un CONSTAT : rien n'est supprimé de ce fait dans ce lot.
 *
 * ⚠️ L'EMPREINTE MD5 EST LA SEULE COMPARAISON QUI VAILLE. Deux fichiers de même nom peuvent différer, deux fichiers
 * de noms différents peuvent être identiques. Quand Drive ne rend pas de MD5 (documents Google), le fichier est
 * relevé mais ne peut servir à aucune comparaison — et le rapport le dit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { adressesMessagesDisponibles } from '../lib/gestion/schema';
import { inventorierDossier, type DepsCopie } from '../lib/gestion/copiePiecesReel';
import { DRIVE_NOM } from '../lib/gestion/driveGardeFou';
import { dureeFr, tailleFr } from '../lib/gestion/copiePieces';

const P = '[gestion:drive:empreintes-production]';
export const DOSSIER_PRODUCTION = 'Documents clients scannés';

/** Le Drive partagé et le dossier de production, LUS chez Google — jamais codés en dur. */
async function trouverProduction(jeton: string): Promise<{ driveId: string; dossierId: string } | null> {
  const drives = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)',
    { headers: { Authorization: `Bearer ${jeton}` } });
  if (!drives.ok) return null;
  const jd = (await drives.json()) as { drives?: { id: string; name: string }[] };
  const d = (jd.drives ?? []).find((x) => x.name.trim().toUpperCase() === DRIVE_NOM);
  if (d === undefined) return null;

  const q = `'${d.id}' in parents and trashed = false and name = '${DOSSIER_PRODUCTION.replace(/'/g, "\\'")}'`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true`
    + `&includeItemsFromAllDrives=true&corpora=drive&driveId=${d.id}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${jeton}` } });
  if (!res.ok) return null;
  const jf = (await res.json()) as { files?: { id: string }[] };
  const dossier = (jf.files ?? [])[0];
  return dossier === undefined ? null : { driveId: d.id, dossierId: dossier.id };
}

async function principal(): Promise<void> {
  const compte = process.argv.find((a) => a.startsWith('--compte='))?.slice('--compte='.length)
    ?? 'gestion@criterimmo.fr';
  console.log('');
  console.log(`${P} ── INVENTAIRE EN LECTURE SEULE de « ${DOSSIER_PRODUCTION} » ──`);

  if (!(await adressesMessagesDisponibles())) {
    console.error(`${P} ❌ La migration 256 n’est pas appliquée : il n’y a nulle part où ranger l’inventaire.\n`);
    process.exitCode = 1;
    return;
  }

  const jeton = await jetonPourSubject(compte, { fetch });
  if (!jeton.ok) { console.error(`${P} ❌ ${jeton.motif}`); process.exitCode = 1; return; }
  const cible = await trouverProduction(jeton.jeton);
  if (cible === null) {
    console.error(`${P} ❌ « ${DOSSIER_PRODUCTION} » introuvable dans « ${DRIVE_NOM} » pour ${compte}.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${P} dossier : ${cible.dossierId} · Drive : ${cible.driveId}`);

  const deps: DepsCopie = { fetch };
  const debut = Date.now();
  let vus = 0;
  let sansMd5 = 0;
  let octets = 0;

  const r = await inventorierDossier(
    { racineId: cible.dossierId, driveId: cible.driveId }, jeton.jeton, deps,
    async (f) => {
      vus += 1;
      if (f.md5 === null) sansMd5 += 1;
      octets += f.taille ?? 0;
      await query(
        `INSERT INTO gestion_drive_production (drive_file_id, md5, taille_octets, nom, chemin, releve_le)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (drive_file_id) DO UPDATE SET
           md5 = EXCLUDED.md5, taille_octets = EXCLUDED.taille_octets, nom = EXCLUDED.nom,
           chemin = EXCLUDED.chemin, releve_le = now()`,
        [f.id, f.md5, f.taille, f.nom, f.chemin]);
      if (vus % 1000 === 0) console.log(`${P}   ${vus} fichiers relevés…`);
    });

  if (!r.ok) { console.error(`${P} ❌ ${r.motif}`); process.exitCode = 1; return; }

  // ── LE RAPPROCHEMENT : quelles pièces copiées sont DÉJÀ là ? ────────────────────────────────────────────────
  const { rows: maj } = await query<{ n: string }>(
    `WITH rapprochees AS (
       UPDATE gestion_piece_drive d
          SET deja_en_production = true, production_drive_file_id = pr.drive_file_id
         FROM (SELECT DISTINCT ON (md5) md5, drive_file_id FROM gestion_drive_production
                WHERE md5 IS NOT NULL ORDER BY md5, id) pr
        WHERE d.md5 = pr.md5 AND d.origine = 'copie'
        RETURNING d.piece_id)
     SELECT count(*)::text AS n FROM rapprochees`);
  await query(
    `UPDATE gestion_piece_drive SET deja_en_production = false
      WHERE origine = 'copie' AND md5 IS NOT NULL AND deja_en_production IS NULL`);

  const { rows: ex } = await query<{ piece_id: string; nom: string; chemin: string }>(
    `SELECT d.piece_id, pr.nom, pr.chemin
       FROM gestion_piece_drive d
       JOIN gestion_drive_production pr ON pr.drive_file_id = d.production_drive_file_id
      WHERE d.deja_en_production = true ORDER BY d.piece_id LIMIT 15`);

  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
     VALUES ('production_drive', $1, 'inventaire', $2, 'inventaire automatique')`,
    [vus, `${vus} fichiers relevés dans « ${DOSSIER_PRODUCTION} » (lecture seule), ${maj[0].n} pièce(s) déjà présente(s)`]);

  console.log('');
  console.log(`${P} ── INVENTAIRE ── ${dureeFr(Date.now() - debut)}`);
  console.log(`${P} fichiers relevés ........... ${vus} dans ${r.dossiers} dossiers · ${tailleFr(octets)}`);
  console.log(`${P} sans empreinte MD5 ......... ${sansMd5} (documents Google : aucune comparaison possible)`);
  console.log(`${P} 🔴 PIÈCES DÉJÀ EN PRODUCTION : ${maj[0].n}`);
  if (ex.length > 0) {
    console.log(`${P} exemples :`);
    for (const e of ex) console.log(`${P}   pièce ${String(e.piece_id).padStart(5)} → ${e.chemin}`);
  }
  console.log('');
  console.log(`${P} 🔒 Aucun contenu n’a été téléchargé, aucune écriture n’a été envoyée dans ce dossier.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
