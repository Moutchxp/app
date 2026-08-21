/**
 * N10-O — CLI : lit le Cerfa SCANNÉ (13409*15 sans AcroForm) d'UN permis par DEUX sources (OCR + vision Mistral) et écrit ses 5
 * champs si les deux s'accordent. CIBLÉE sur un permis — AUCUNE passe automatique sur le stock (orchestration = lot à part).
 * N'envoie à l'API que les pages du triage. `--dry-run` : lit + décide + affiche, n'écrit RIEN.
 * Lancer : npm run permis:ecrire-cerfa-scan -- --permis <num_dau> [--type PC|PD] [--dry-run].
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { resoudreDossier, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { lireCerfaScan, lecteurMistral } from '../lib/permis/lireCerfaScan';
import { ecrireCerfaScan } from '../lib/permis/ecritureCerfaScan';

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

  // Le Cerfa 13409 (demande de PC) — le scan sans AcroForm.
  const { rows } = await query<{ nom_fichier: string; cle_stockage: string }>(
    `SELECT nom_fichier, cle_stockage FROM dossier_document WHERE dossier_id = $1 AND nom_fichier ~* 'cerfa[_ ]?13409' ORDER BY length(nom_fichier) LIMIT 1`, [dossierId]);
  if (!rows.length) { console.error(`[cerfa-scan] aucun Cerfa 13409 trouvé pour ${dau}`); process.exitCode = 2; return; }
  const piece = rows[0].nom_fichier;

  const deps = depsReellesLectureGed();
  const pdf = await deps.lireObjet(rows[0].cle_stockage);

  console.log(`\n══════ CERFA SCANNÉ — ${dau} · pièce « ${piece} »${dryRun ? ' · DRY-RUN (rien écrit)' : ''} ══════`);
  const lectures = await lireCerfaScan(pdf, lecteurMistral());
  const res = await ecrireCerfaScan(dossierId, piece, lectures, MAJ_PAR, dryRun);

  console.log('\n── lectures (OCR ⟷ vision) et décision par champ :');
  for (const l of res.plan.journal) {
    const tag = l.role === 'retenue' ? '√ ÉCRIT ' : '✗ non écrit';
    console.log(`  ${tag} · ${l.champ.padEnd(24)} · ${l.extrait}${l.motif ? `  [${l.motif}]` : ''}`);
  }
  console.log(`\n→ écrits : ${res.ecrits.length ? res.ecrits.join(', ') : 'aucun'} · abstentions : ${res.abstentions.join(', ') || '—'} · désaccords : ${res.desaccords.join(', ') || '—'}`);

  // SITADEL EN REGARD (corroboration, JAMAIS source) — étiqueté comme tel, aucun report croisé.
  const { rows: sit } = await query<{ surf: string | number | null; num: string | null; voie: string | null; loc: string | null }>(
    `SELECT surf_creee AS surf, adr_num_ter AS num, adr_libvoie_ter AS voie, adr_localite_ter AS loc FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  if (sit[0]) console.log(`\n(en regard, Sitadel — corroboration, pas source) surf_creee = ${sit[0].surf ?? '—'} m² ⚠ ≠ surface de plancher · adresse = ${[sit[0].num, sit[0].voie, sit[0].loc].filter(Boolean).join(' ') || '—'}`);
  console.log('');
}

void main().catch((e) => { console.error('[cerfa-scan] échec', e); process.exitCode = 1; }).finally(() => closePool());
