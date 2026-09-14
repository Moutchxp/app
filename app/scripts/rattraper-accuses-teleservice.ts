/**
 * CLI `permis:rattraper-accuses` — RATTRAPAGE de l'auto-confirmation des accusés téléservice déjà en base (accusés non rattachés
 * citant le num_dau d'une demande EN ATTENTE). MÊME foyer que la relève (`autoConfirmerAccusesTeleservice`) — aucun 2e chemin.
 *
 *   • DÉFAUT (sans --appliquer) = DRY-RUN : simule et imprime ce qui SERAIT confirmé, SANS AUCUNE écriture en base.
 *   • --appliquer = ÉCRITURE RÉELLE : bascule la demande en envoyée (envoye_le = recu_le de l'accusé), enregistre la référence
 *     mairie (source 'accuse_reception', le trigger 163 lève le verrou de commune), rattache l'accusé, trace 'systeme'.
 *
 * IDEMPOTENT : rejouer --appliquer ne refait rien (demande déjà envoyée, message déjà rattaché). AUCUN envoi d'e-mail.
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import type { RapportAutoConfirmation } from '../lib/veille/autoConfirmationTeleservice';

/** Rendu lisible du rapport (dry-run comme apply). PUR (juste des chaînes) → testable si besoin. */
export function imprimer(rapport: RapportAutoConfirmation, log: (s: string) => void): void {
  log(`Mode : ${rapport.mode === 'applique' ? 'APPLIQUÉ (écriture réelle)' : 'DRY-RUN (aucune écriture)'}`);
  log(`Accusés non rattachés examinés : ${rapport.accusesExamines}`);
  const aFaire = rapport.resultats.filter((r) => r.demandeId !== null);
  log(`Confirmables : ${aFaire.length}${rapport.mode === 'applique' ? ` — confirmés : ${rapport.confirmees}` : ''}`);
  for (const r of rapport.resultats) {
    if (r.demandeId !== null) {
      log(`  • message ${r.reponseId} → demande ${r.demandeId} : ${r.raison}` + (rapport.mode === 'applique' ? (r.applique ? ' [APPLIQUÉ]' : '') : ' [serait appliqué]'));
    } else {
      log(`  • message ${r.reponseId} : rien — ${r.raison}`);
    }
  }
  if (aFaire.length === 0) log('Rien à confirmer (aucun accusé non rattaché ne cite exactement une demande en attente).');
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const { autoConfirmerAccusesTeleservice } = await import('../lib/veille/autoConfirmationTeleservice');
  const rapport = await autoConfirmerAccusesTeleservice(appliquer);
  imprimer(rapport, (s) => console.log(s));
  if (!appliquer) console.log('\n(DRY-RUN — relancer avec --appliquer pour écrire.)');
}

// N'exécute `main()` que si lancé DIRECTEMENT (`tsx …/rattraper-accuses-teleservice.ts`), jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error('[permis:rattraper-accuses] échec', e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
