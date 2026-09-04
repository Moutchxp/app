/**
 * N10-O — CLI : lit le Cerfa SCANNÉ (13409*15 sans AcroForm) d'UN permis par DEUX sources (OCR + vision Mistral) et écrit ses 5
 * champs si les deux s'accordent. CIBLÉE sur un permis — AUCUNE passe automatique sur le stock (orchestration = lot à part).
 * N'envoie à l'API que les pages du triage. `--dry-run` : lit + décide + affiche, n'écrit RIEN.
 * Lancer : npm run permis:ecrire-cerfa-scan -- --permis <num_dau> [--type PC|PD] [--dry-run].
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { resoudreDossier, depsReellesLectureGed, lireGedPermis } from '../lib/permis/lectureGed';
import { lireCerfaScan, lecteurMistral } from '../lib/permis/lireCerfaScan';
import { ecrireCerfaScan } from '../lib/permis/ecritureCerfaScan';
import { trouverCerfaPc } from '../lib/permis/identifierCerfa'; // LECT-1 (A) : Cerfa par CONTENU (13409), pas par nom
import { avecVerrouDossier } from '../lib/permis/verrouExtraction'; // LOT 58 — MÊME verrou que la route web / completer (une analyse à la fois par permis)

const MAJ_PAR = 'extraction:cerfa-scan';
const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(n);

async function main(): Promise<void> {
  const numDau = arg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-cerfa-scan -- --permis <num_dau> [--type PC|PD] [--dry-run]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, arg('--type'));
  if (!resolu.ok) { console.error(`[cerfa-scan] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const { dossierId, numDau: dau } = resolu.dossier;
  const dryRun = flag('--dry-run');

  // LECT-1 (A) — le Cerfa PC identifié par son CONTENU (n° 13409 en tête), jamais par son nom de fichier (noms opaques côté mairie).
  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(dossierId, deps);
  const cerfa = trouverCerfaPc(ged, await deps.listerPieces(dossierId));
  if (!cerfa) { console.error(`[cerfa-scan] aucun Cerfa 13409 identifié dans les pièces de ${dau}`); process.exitCode = 2; return; }
  const piece = cerfa.nomFichier;
  const pdf = await deps.lireObjet(cerfa.cleStockage);

  console.log(`\n══════ CERFA SCANNÉ — ${dau} · pièce « ${piece} »${dryRun ? ' · DRY-RUN (rien écrit)' : ''} ══════`);
  // LOT 58 — VERROU PAR DOSSIER (même helper que la route web / completer) : pas de vision ni d'écriture si une analyse de ce permis tourne déjà.
  const verrou = await avecVerrouDossier(dossierId, async () => {
    const lectures = await lireCerfaScan(pdf, lecteurMistral());
    return ecrireCerfaScan(dossierId, piece, lectures, MAJ_PAR, dryRun);
  });
  if (!verrou.ok) { console.error(`[cerfa-scan] une analyse de ce permis (${dau}) est déjà en cours — passe ignorée (aucune écriture).`); process.exitCode = 3; return; }
  const res = verrou.valeur;

  console.log('\n── lectures (OCR ⟷ vision) et décision par champ :');
  // N10-P — UNE ligne par CHAMP (les deux entrées de journal restent écrites ; c'est l'affichage qu'on regroupe).
  const parChamp = new Map<string, typeof res.plan.journal>();
  for (const l of res.plan.journal) (parChamp.get(l.champ) ?? parChamp.set(l.champ, []).get(l.champ)!).push(l);
  for (const [champ, lignes] of parChamp) {
    const retenues = lignes.filter((l) => l.role === 'retenue');
    if (retenues.length) console.log(`  √ ÉCRIT     · ${champ.padEnd(24)} · ${retenues.map((l) => l.extrait).join(' · ')}`);
    else console.log(`  ✗ non écrit · ${champ.padEnd(24)} · ${lignes.map((l) => l.extrait).join(' | ')}${lignes.find((l) => l.motif)?.motif ? `  [${lignes.find((l) => l.motif)!.motif}]` : ''}`);
  }
  console.log(`\n→ écrits : ${res.ecrits.length ? res.ecrits.join(', ') : 'aucun'} · abstentions : ${res.abstentions.join(', ') || '—'} · désaccords : ${res.desaccords.join(', ') || '—'}`);

  // SITADEL EN REGARD (corroboration, JAMAIS source) — étiqueté comme tel, aucun report croisé.
  const { rows: sit } = await query<{ surf: string | number | null; num: string | null; voie: string | null; loc: string | null }>(
    `SELECT surf_creee AS surf, adr_num_ter AS num, adr_libvoie_ter AS voie, adr_localite_ter AS loc FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  if (sit[0]) console.log(`\n(en regard, Sitadel — corroboration, pas source) surf_creee = ${sit[0].surf ?? '—'} m² ⚠ ≠ surface de plancher · adresse = ${[sit[0].num, sit[0].voie, sit[0].loc].filter(Boolean).join(' ') || '—'}`);
  console.log('');
}

void main().catch((e) => { console.error('[cerfa-scan] échec', e); process.exitCode = 1; }).finally(() => closePool());
