/**
 * CLI d'ENVOI des RELANCES CRPA (chantier W1) : npm run relances:envoyer [-- --appliquer]
 *
 * SIMULATION PAR DÉFAUT (aucune connexion SMTP, aucun octet, écritures ROLLBACK). `--appliquer` = envoi RÉEL. Une relance
 * dont l'adresse/compte SMTP de son profil manque, ou dont le corps porte un gabarit, ou dont des dossiers ont été satisfaits
 * depuis le brouillon, est ÉCARTÉE (motif nommé) sans bloquer les autres. Imprime un RAPPORT CHIFFRÉ. Calque de
 * `demandes-envoyer.ts`. AUCUN branchement dans executerVeille : geste manuel uniquement.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { envoyerRelances, type RapportEnvoiRelance } from '../lib/sitadel/envoiRelance';

function imprimer(r: RapportEnvoiRelance): void {
  const titre = r.mode === 'simulation' ? 'SIMULATION (aucun octet parti)' : 'APPLIQUÉ (envoi réel)';
  console.log(`\n[relances:envoyer] ${titre}`);
  console.log(`  candidats (brouillon, demande envoyée, e-mail) : ${r.candidats}`);
  console.log(`  émissions déjà faites (jour, PARTAGÉ demandes)  : ${r.emisAujourdhui}`);
  console.log(`  caps                                            : ${r.capParRun}/action · ${r.capParJour}/jour`);
  if (r.bloqueesCorps.length > 0) {
    console.log(`  ✗ écartées (corps non exploitable, gabarit) : ${r.bloqueesCorps.length}`);
    for (const b of r.bloqueesCorps) console.log(`      ${b.reference} : ${b.motif}`);
  }
  if (r.bloqueesCompte.length > 0) {
    console.log(`  ✗ écartées (adresse/compte d'envoi du profil non configuré) : ${r.bloqueesCompte.length}`);
    for (const b of r.bloqueesCompte) console.log(`      ${b.reference} : ${b.motif}`);
  }
  if (r.bloqueesObsoletes.length > 0) {
    console.log(`  ✗ écartées (brouillon obsolète — dossiers satisfaits depuis) : ${r.bloqueesObsoletes.length}`);
    for (const b of r.bloqueesObsoletes) console.log(`      ${b.reference} : ${b.motif}`);
  }
  console.log(`  salve autorisée (budget)    : ${r.budget}   = min(envoyables, cap/action, reste du jour)`);
  if (r.destinataires.length > 0) {
    console.log(`  destinataires de la salve   :`);
    for (const d of r.destinataires) console.log(`    ${d.reference}  ${(d.commune ?? '?').padEnd(24)} → ${d.email}   (expédié depuis ${d.expediteur})\n        « ${d.apercuCorps} »`);
  }
  const par = (i: string) => r.resultats.filter((x) => x.issue === i).length;
  if (r.resultats.length > 0) console.log(`  résultats                   : envoyé=${par('envoye')} · rebond=${par('rebond')} · échec=${par('echec')} · gabarit=${par('gabarit')}`);
  console.log(`  octets réellement partis    : ${r.octetsPartis}`); // W1 : 0 en simulation, non nul après un envoi réel (correction du 0 trompeur de demandes:envoyer)
  if (r.mode === 'simulation') console.log(`\n  ⚠ SIMULATION : rien n'a été envoyé ni écrit. Relancer avec « --appliquer » pour l'envoi réel.`);
}

void envoyerRelances({ appliquer: process.argv.includes('--appliquer') })
  .then(imprimer)
  .catch((e) => { console.error('[relances:envoyer] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
