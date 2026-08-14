/**
 * CLI de DUMP de la GED d'un permis (chantier N4) : npm run ged:dump -- --permis <num_dau> [--type PC] [--sortie <chemin>]
 *
 * N'ajoute QUE le formatage en fichier texte : toute la logique (résolution du permis, lecture des objets, extraction page par
 * page, bilan chiffré) vit dans `app/lib/permis/lectureGed.ts`. STRICTEMENT EN LECTURE : aucune écriture en base, aucun e-mail.
 * `chargerEnv` EN PREMIER (avant tout module touchant `db/client`). Défaut de sortie : `.tmp/ged-<num_dau>.txt` (.tmp ignoré par git).
 */
import '../lib/chargerEnv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed, type DossierResolu, type ResultatLectureGed } from '../lib/permis/lectureGed';

/** Lit la valeur d'un argument `--flag valeur` (espace). Absent → undefined. */
function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const ouNon = (v: string | null): string => (v && v.trim() !== '' ? v : 'non renseignée');

/** Formate le dump en TEXTE (en-tête + bilan + une section par pièce + section « pièces sans texte extrait »). */
function formater(d: DossierResolu, res: ResultatLectureGed): string {
  const b = res.bilan;
  const L: string[] = [];
  L.push(`GED DU PERMIS ${d.numDau} (${d.type})`);
  L.push(`Commune : ${ouNon(d.communeNom)} (INSEE ${d.codeInsee})`);
  L.push(`Adresse : ${ouNon(d.adresse)}`);
  L.push(`Date d'autorisation : ${ouNon(d.dateAutorisation)}`);
  L.push('');
  L.push(`BILAN : ${b.nbPieces} pièce(s) · ${b.nbPages} page(s) · ${b.pagesAvecTexte} page(s) avec texte · ${b.pagesSansTexte} page(s) sans texte · ${b.piecesMuettes} pièce(s) muette(s)`);
  L.push('');

  res.pieces.forEach((p, i) => {
    L.push(`===== PIÈCE ${i + 1}/${res.pieces.length} — ${p.nomFichier} — ${p.typeMime ?? 'type inconnu'} — ${p.nbPages} page(s) =====`);
    if (p.pages.length === 0) {
      L.push(`(aucun texte extrait — ${p.motif ?? 'motif inconnu'})`);
    } else {
      for (const pg of p.pages) {
        L.push(`--- page ${pg.page} ---`);
        L.push(pg.aTexte ? pg.texte : '(page sans texte extrait)');
      }
    }
    L.push('');
  });

  L.push('PIÈCES SANS TEXTE EXTRAIT');
  const muettes = res.pieces.filter((p) => p.muette);
  if (muettes.length === 0) L.push('  (aucune — toutes les pièces ont au moins une page avec du texte)');
  else for (const p of muettes) L.push(`  · ${p.nomFichier} — ${p.motif ?? 'motif inconnu'}`);
  L.push('');
  return L.join('\n');
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) {
    console.error('usage : npm run ged:dump -- --permis <num_dau> [--type PC|PD] [--sortie <chemin>]');
    process.exitCode = 2;
    return;
  }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') {
      console.error(`[ged:dump] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    } else {
      console.error(`[ged:dump] num_dau « ${numDau} » AMBIGU (plusieurs types) — relance en précisant --type parmi :`);
      for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`);
    }
    process.exitCode = 2;
    return;
  }

  const res = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  const sortie = lireArg('--sortie') ?? `.tmp/ged-${numDau}.txt`;
  await mkdir(dirname(sortie), { recursive: true });
  await writeFile(sortie, formater(resolu.dossier, res), 'utf8');

  const b = res.bilan;
  console.log(`[ged:dump] permis ${resolu.dossier.numDau} (${resolu.dossier.type}) → ${sortie}`);
  console.log(`[ged:dump] ${b.nbPieces} pièce(s) · ${b.nbPages} page(s) · ${b.pagesAvecTexte} avec texte · ${b.pagesSansTexte} sans texte · ${b.piecesMuettes} muette(s)`);
  if (b.piecesMuettes > 0) console.log('[ged:dump] ⚠ des pièces sont muettes (voir la section « PIÈCES SANS TEXTE EXTRAIT ») → OCR probablement nécessaire.');
}

void main()
  .catch((e) => { console.error('[ged:dump] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
