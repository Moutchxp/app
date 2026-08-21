/**
 * T7-A décision #2 (correctif du 21/08) — RECLASSEMENT RÉTROACTIF des natures périmées : re-passe le foyer T7-A sur les messages
 * classés `autre` et promeut en `documents` ceux dont le CONTENU CAPTÉ le justifie désormais (≥ 1 pièce OU ≥ 1 lien FORT — cas
 * typique : un lien GED devenu fort après le correctif du tiret). Motif : un tel message compte encore comme « à répondre »
 * (ligne bleue « réponse attendue », pilotée par nature='autre') alors qu'il a livré les documents.
 *
 * ⚠️ PÉRIMÈTRE STRICT — recalcul depuis ce qui est EN BASE (pièces, liens fort/faible). AUCUNE relecture d'e-mail, AUCUN réseau,
 * AUCUNE ré-extraction. ADDITIF : uniquement `autre` → `documents`. N'écrit JAMAIS nature_classee_le (ancre anti-alerte-
 * rétroactive). Ne touche NI satisfait_le, NI reponse_id, NI rattachement, NI repondu_*, NI aucun compteur (tous dérivés).
 *
 * DRY-RUN PAR DÉFAUT : sans `--apply`, liste ce qui changerait et n'écrit RIEN. Idempotent : un 2ᵉ passage après `--apply` = 0.
 * Lancer :   npm run veille:reclasser-natures              (DRY-RUN)
 *            npm run veille:reclasser-natures -- --apply   (applique)
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { reclasserNaturesPerimees } from '../lib/veille/demandeReponseRepo';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  console.log(`\n══════ RECLASSEMENT NATURES PÉRIMÉES (T7-A) — ${APPLY ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'} ══════\n`);
  const reclasses = await reclasserNaturesPerimees(APPLY);
  for (const r of reclasses) {
    const signal = [r.nbPieces > 0 ? `${r.nbPieces} pièce(s)` : null, r.aLienFort ? 'lien fort' : null].filter(Boolean).join(', ');
    console.log(`  message ${r.id}${r.demandeId !== null ? ` (demande ${r.demandeId})` : ' (non rattaché)'} · ${r.deAdresse}`);
    console.log(`    objet   ${r.objet ?? '—'}`);
    console.log(`    nature  autre → documents  (${signal})`);
  }
  console.log(`\n▶ ${reclasses.length} message(s) ${APPLY ? 'reclassé(s)' : 'à reclasser'} (autre → documents)`);
  if (!APPLY && reclasses.length > 0) console.log('  (DRY-RUN — relancez avec « -- --apply » pour écrire)');
  console.log('');
}

void main().catch((e) => { console.error('[veille:reclasser-natures] échec', e); process.exitCode = 1; }).finally(() => closePool());
