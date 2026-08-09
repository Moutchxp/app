/**
 * CLI d'ENVOI des SAISINES CADA (chantier X3) : npm run saisines:envoyer [-- --appliquer]
 *
 * SIMULATION PAR DÉFAUT (aucune connexion SMTP, aucun octet, écritures ROLLBACK). `--appliquer` = envoi RÉEL. DEUX canaux
 * selon config_veille.cada_email : renseigné → envoi e-mail à la CADA (copie de la demande en pièce jointe) ; VIDE → aucune
 * émission, la file « à saisir sur le formulaire CADA » est imprimée (dépôt manuel). Calque de relances-envoyer.ts.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { envoyerSaisinesCada, type RapportEnvoiSaisine } from '../lib/sitadel/envoiSaisineCada';

function imprimer(r: RapportEnvoiSaisine): void {
  const titre = r.mode === 'simulation' ? 'SIMULATION (aucun octet parti)' : 'APPLIQUÉ (envoi réel)';
  console.log(`\n[saisines:envoyer] ${titre} — canal ${r.canal === 'formulaire' ? 'FORMULAIRE (dépôt manuel)' : 'E-MAIL'}`);
  console.log(`  candidats (brouillon, demande envoyée, dossier dû) : ${r.candidats}`);
  if (r.bloqueesForclusion.length > 0) {
    console.log(`  ✗ écartées (fenêtre CADA refermée / pas ouverte) : ${r.bloqueesForclusion.length}`);
    for (const b of r.bloqueesForclusion) console.log(`      ${b.reference} : ${b.motif}`);
  }

  if (r.canal === 'formulaire') {
    console.log(`  ⚠ cada_email VIDE → dépôt MANUEL : rien n'est envoyé. À saisir sur le formulaire en ligne :`);
    for (const f of r.fileADeposer) console.log(`    ${f.reference}  ${(f.communeNom ?? '?')}  → ${f.urlFormulaire}\n        objet : ${f.objet}\n        (copier le corps de la saisine, joindre la copie de la demande)`);
    if (r.fileADeposer.length === 0) console.log(`    (aucune saisine à déposer)`);
    return;
  }

  console.log(`  émissions déjà faites (jour, PARTAGÉ demandes+relances) : ${r.emisAujourdhui}`);
  console.log(`  caps                                            : ${r.capParRun}/action · ${r.capParJour}/jour`);
  if (r.bloqueesCorps.length > 0) {
    console.log(`  ✗ écartées (corps non exploitable, gabarit) : ${r.bloqueesCorps.length}`);
    for (const b of r.bloqueesCorps) console.log(`      ${b.reference} : ${b.motif}`);
  }
  if (r.bloqueesCompte.length > 0) {
    console.log(`  ✗ écartées (adresse/compte d'envoi du profil non configuré) : ${r.bloqueesCompte.length}`);
    for (const b of r.bloqueesCompte) console.log(`      ${b.reference} : ${b.motif}`);
  }
  if (r.bloqueesPiece.length > 0) {
    console.log(`  ✗ écartées (pièce jointe impossible à produire — R343-1) : ${r.bloqueesPiece.length}`);
    for (const b of r.bloqueesPiece) console.log(`      ${b.reference} : ${b.motif}`);
  }
  console.log(`  salve autorisée (budget)    : ${r.budget}   = min(envoyables, cap/action, reste du jour)`);
  if (r.destinataires.length > 0) {
    console.log(`  destinataires de la salve   :`);
    for (const d of r.destinataires) console.log(`    ${d.reference}  ${(d.commune ?? '?').padEnd(24)} → ${d.email}   (expédié depuis ${d.expediteur})\n        « ${d.apercuCorps} »`);
  }
  const par = (i: string) => r.resultats.filter((x) => x.issue === i).length;
  if (r.resultats.length > 0) console.log(`  résultats                   : envoyé=${par('envoye')} · rebond=${par('rebond')} · échec=${par('echec')} · gabarit=${par('gabarit')}`);
  console.log(`  octets réellement partis    : ${r.octetsPartis}`); // 0 en simulation, non nul après un envoi réel
  if (r.mode === 'simulation') console.log(`\n  ⚠ SIMULATION : rien n'a été envoyé ni écrit. Relancer avec « --appliquer » pour l'envoi réel.`);
}

void envoyerSaisinesCada({ appliquer: process.argv.includes('--appliquer') })
  .then(imprimer)
  .catch((e) => { console.error('[saisines:envoyer] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
