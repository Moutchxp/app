/**
 * CLI de RELÈVE des réponses CRPA (chantier R3) : npm run demandes:relever [-- --appliquer] [--profil=entreprise|personne] [--plafond=N]
 *
 * SIMULATION PAR DÉFAUT : la boîte est lue (LECTURE STRICTE, jamais de modification) mais AUCUNE écriture en base — le
 * rapport dit ce qui SERAIT enregistré. `--appliquer` = écriture réelle (enregistrement des réponses + passage des
 * acheminements rebondés à 'rebond'). Profil inactif (compte IMAP absent) → message clair + sortie 0 (pas une erreur).
 * Même convention que `demandes:envoyer`.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { lireCompteImap } from '../lib/email';
import { creerClientBoite } from '../lib/email/imap';
import { releverBoite, type RapportReleve } from '../lib/veille/releveReponses';
import type { ProfilBoite } from '../lib/veille/demandeReponseRepo';

const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

function lireProfil(): ProfilBoite {
  const arg = process.argv.find((a) => a.startsWith('--profil='))?.split('=')[1] ?? 'entreprise';
  if (arg !== 'entreprise' && arg !== 'personne') {
    console.error(`[demandes:relever] profil invalide « ${arg} » (attendu : entreprise | personne)`);
    process.exit(2);
  }
  return arg;
}

function lirePlafond(): number | undefined {
  const brut = process.argv.find((a) => a.startsWith('--plafond='))?.split('=')[1];
  if (brut === undefined) return undefined;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function imprimer(r: RapportReleve): void {
  const titre = r.mode === 'simulation' ? 'SIMULATION (aucune écriture)' : 'APPLIQUÉ (écriture réelle)';
  console.log(`\n[demandes:relever] ${titre} — profil « ${r.profil} »`);
  if (!r.connecte) {
    console.log('  aucune demande envoyée pour ce profil → pas de connexion à la boîte, rien à relever.');
    return;
  }
  console.log(`  fenêtre (depuis)            : ${r.depuis}`);
  console.log(`  messages vus                : ${r.vus}`);
  console.log(`  déjà connus (ignorés)       : ${r.dejaConnus}`);
  console.log(`  rattachés / non rattachés   : ${r.rattaches} / ${r.nonRattaches}`);
  const meth = Object.entries(r.parMethode).map(([m, n]) => `${m}=${n}`).join(' · ') || 'aucune';
  console.log(`  par méthode                 : ${meth}`);
  console.log(`  rebonds détectés / appliqués: ${r.rebondsDetectes} / ${r.rebondsAppliques}`);
  console.log(`  enregistrées                : ${r.ecrites}`);
  if (r.lignes.length > 0) {
    console.log('  détail :');
    for (const l of r.lignes) {
      const cible = l.demandeId === null ? '— (à rattacher)' : `demande ${l.demandeId}`;
      console.log(`    ${l.rebond ? '↩ REBOND ' : ''}${cible} [${l.methode}] ${l.deAdresse}  « ${(l.objet ?? '').slice(0, 60)} »`);
    }
  }
  if (r.mode === 'simulation') console.log(`\n  ⚠ SIMULATION : rien n'a été écrit. Relancer avec « --appliquer » pour enregistrer.`);
}

async function main(): Promise<void> {
  const profil = lireProfil();
  const appliquer = process.argv.includes('--appliquer');
  const plafond = lirePlafond();

  const compte = lireCompteImap(INFIXE[profil]);
  if (compte === null) {
    console.log(`[demandes:relever] profil « ${profil} » INACTIF : aucun compte IMAP configuré (variables SMTP_${INFIXE[profil]}* absentes). Rien à relever — ce n'est pas une erreur.`);
    return; // sortie 0
  }

  const client = creerClientBoite(compte);
  const rapport = await releverBoite({ client, profil, plafond, appliquer });
  imprimer(rapport);
}

void main()
  .catch((e) => { console.error('[demandes:relever] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
