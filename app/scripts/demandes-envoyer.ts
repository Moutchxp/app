/**
 * CLI d'ENVOI des demandes CRPA (chantier S38) : npm run demandes:envoyer [-- --appliquer]
 *
 * SIMULATION PAR DÉFAUT (aucune connexion SMTP, aucun octet, écritures ROLLBACK). `--appliquer` = envoi RÉEL (refuse si un
 * garde-fou manque : adresse de réponse, SMTP, caps). Imprime un RAPPORT CHIFFRÉ. Sur le modèle de `dila-ingest.ts`.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { envoyerDemandes, type RapportEnvoi } from '../lib/sitadel/envoiDemande';

function imprimer(r: RapportEnvoi): void {
  const titre = r.mode === 'simulation' ? 'SIMULATION (aucun octet parti)' : r.mode === 'refuse' ? 'REFUSÉ (garde-fou manquant)' : 'APPLIQUÉ (envoi réel)';
  console.log(`\n[demandes:envoyer] ${titre}`);
  if (r.probleme) console.log(`  ⚠ garde-fou : ${r.probleme}`);
  console.log(`  candidats (prête, e-mail)   : ${r.candidats}`);
  console.log(`  émissions déjà faites (jour): ${r.emisAujourdhui}`);
  console.log(`  caps                        : ${r.capParRun}/action · ${r.capParJour}/jour`);
  console.log(`  salve autorisée (budget)    : ${r.budget}   = min(candidats, cap/action, reste du jour)`);
  if (r.destinataires.length > 0) {
    console.log(`  destinataires de la salve   :`);
    for (const d of r.destinataires) console.log(`    ${d.reference}  ${(d.commune ?? '?').padEnd(24)} ${d.email}\n        « ${d.apercuCorps} »`);
  }
  const par = (i: string) => r.resultats.filter((x) => x.issue === i).length;
  if (r.resultats.length > 0) console.log(`  résultats                   : envoyé=${par('envoye')} · rebond=${par('rebond')} · échec=${par('echec')}`);
  console.log(`  octets réellement partis    : ${r.octetsPartis}`);
  if (r.mode === 'simulation') console.log(`\n  ⚠ SIMULATION : rien n'a été envoyé ni écrit. Relancer avec « --appliquer » pour l'envoi réel.`);
}

void envoyerDemandes({ appliquer: process.argv.includes('--appliquer') })
  .then(imprimer)
  .catch((e) => { console.error('[demandes:envoyer] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
