/**
 * CLI d'ENVOI des demandes CRPA (chantiers S38 / S43) : npm run demandes:envoyer [-- --appliquer]
 *
 * SIMULATION PAR DÉFAUT (aucune connexion SMTP, aucun octet, écritures ROLLBACK). `--appliquer` = envoi RÉEL. L'identité
 * d'expédition est choisie PAR PROFIL (S43) : une demande dont l'adresse ou le compte SMTP de son profil manque est ÉCARTÉE
 * (motif nommé) sans bloquer les autres profils. Imprime un RAPPORT CHIFFRÉ. Sur le modèle de `dila-ingest.ts`.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { envoyerDemandes, type RapportEnvoi } from '../lib/sitadel/envoiDemande';

function imprimer(r: RapportEnvoi): void {
  const titre = r.mode === 'simulation' ? 'SIMULATION (aucun octet parti)' : 'APPLIQUÉ (envoi réel)';
  console.log(`\n[demandes:envoyer] ${titre}`);
  console.log(`  candidats (prête, e-mail)   : ${r.candidats}`);
  console.log(`  émissions déjà faites (jour): ${r.emisAujourdhui}`);
  console.log(`  caps                        : ${r.capParRun}/action · ${r.capParJour}/jour`);
  if (r.bloqueesCorps.length > 0) {
    console.log(`  ✗ écartées (corps non exploitable, gabarit non renseigné) : ${r.bloqueesCorps.length}`);
    for (const b of r.bloqueesCorps) console.log(`      ${b.reference} : ${b.motif}`);
  }
  if (r.bloqueesCompte.length > 0) {
    console.log(`  ✗ écartées (adresse/compte d'envoi du profil non configuré) : ${r.bloqueesCompte.length}`);
    for (const b of r.bloqueesCompte) console.log(`      ${b.reference} : ${b.motif}`);
  }
  console.log(`  salve autorisée (budget)    : ${r.budget}   = min(envoyables, cap/action, reste du jour)`);
  if (r.destinataires.length > 0) {
    console.log(`  destinataires de la salve   :`);
    for (const d of r.destinataires) console.log(`    ${d.reference}  ${(d.commune ?? '?').padEnd(24)} → ${d.email}   (expédié depuis ${d.expediteur})\n        « ${d.apercuCorps} »`);
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
