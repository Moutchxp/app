/**
 * CR-1 — RATTRAPAGE de la « Courte description de votre projet ou de vos travaux ». La coupe naïve d'avant ramenait du GABARIT
 * VIERGE sur les Cerfa aplatis (flux pdfjs réordonné) ; la nouvelle coupe (`descriptionProjet.ts`) rend la vraie déclaration ou
 * s'abstient. Ce script RECALCULE `descriptionProjet` pour les dossiers DÉJÀ en base (`permis_cerfa_recap`) et montre, par dossier :
 * ancien nombre de caractères, nouveau, provenance, et un extrait de 200 caractères.
 *
 * DRY-RUN PAR DÉFAUT — aucune écriture. `--appliquer` upsert le récap recalculé (résilient : no-op si la table 192 manque). Ne touche
 * NI le moteur, NI le verdict, NI le golden, NI une altitude ; n'écrit QUE `permis_cerfa_recap`. AUCUN appel IA, AUCUN service payant
 * (texte pdf.js déjà extrait). Lecture GED par dossier (~2 à 10 s chacun) — nécessaire pour recalculer, y compris en dry-run (aperçu).
 *
 * Lancer :
 *   npm run permis:rattraper-description                → DRY-RUN : avant/après par dossier, AUCUNE écriture.
 *   npm run permis:rattraper-description -- --appliquer  → recalcule et upsert les récaps.
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { texteDeGed, ecrireDeclarationsRecap } from '../lib/permis/cerfaRecapRepo';
import { lireDeclarationsRecapCerfa } from '../lib/permis/recapCerfa';
import { trouverCerfaPc } from '../lib/permis/identifierCerfa';

/** Dossiers ayant un instantané de récap stocké, avec l'ancienne description. Ordre stable (dossier_id croissant). */
export async function candidatsRattrapageDescription(): Promise<{ dossierId: number; ancienne: string | null }[]> {
  const { rows } = await query<{ dossier_id: number | string; ancienne: string | null }>(
    `SELECT dossier_id, declarations->>'descriptionProjet' AS ancienne
       FROM permis_cerfa_recap
      ORDER BY dossier_id`);
  return rows.map((r) => ({ dossierId: Number(r.dossier_id), ancienne: r.ancienne }));
}

const apercu = (s: string | null): string => (s ? JSON.stringify(s.replace(/\s+/g, ' ').slice(0, 200)) : '(vide)');

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const candidats = await candidatsRattrapageDescription();
  console.log(`[rattraper-description] ${candidats.length} dossier(s) avec récap stocké.`);
  const deps = depsReellesLectureGed();
  let changes = 0, ecrits = 0;
  for (const { dossierId, ancienne } of candidats) {
    const ged = await lireGedPermis(dossierId, deps);
    const metas = await deps.listerPieces(dossierId);
    const decl = lireDeclarationsRecapCerfa(texteDeGed(ged));
    const nouvelle = decl.descriptionProjet;
    const change = (ancienne ?? null) !== (nouvelle ?? null);
    if (change) changes++;
    const flag = change ? '≠' : '=';
    console.log(
      `\n  ${flag} dossier ${dossierId} — provenance=${decl.descriptionProjetProvenance}` +
      `  ancien=${ancienne?.length ?? 0}c  nouveau=${nouvelle?.length ?? 0}c`);
    console.log(`     avant : ${apercu(ancienne)}`);
    console.log(`     après : ${apercu(nouvelle)}`);
    if (appliquer) {
      const source = trouverCerfaPc(ged, metas)?.nomFichier ?? null;
      const ok = await ecrireDeclarationsRecap(dossierId, decl, source, 'recap:rattrapage-description');
      if (ok) ecrits++;
    }
  }
  if (!appliquer) {
    console.log(`\n[rattraper-description] DRY-RUN — aucune écriture. ${changes} dossier(s) changeraient. Relancez avec « -- --appliquer » pour écrire.`);
  } else {
    console.log(`\n[rattraper-description] terminé : ${ecrits} récap(s) réécrit(s) (${changes} description(s) modifiée(s)).`);
  }
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:rattraper-description] échec', e); process.exitCode = 1; }).finally(() => closePool());
