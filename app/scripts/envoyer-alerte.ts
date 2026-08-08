/**
 * CLI de l'ALERTE quotidienne (chantier R8) : npm run alertes:envoyer [-- --appliquer]
 *
 * SIMULATION PAR DÉFAUT : compose le récapitulatif et l'AFFICHE dans le terminal, SANS rien envoyer ni écrire — la seule
 * façon de relire le texte avant qu'il parte. `--appliquer` = envoi réel au destinataire configuré (config_veille.alerte_email),
 * via le compte SMTP par défaut. Rien à dire → on le dit et on n'envoie pas. Même convention que `demandes:relever`.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { chargerConfigVeille } from '../lib/sitadel/veilleConfig';
import { composerAlerte } from '../lib/veille/alerte';
import { chargerEntreeAlerte, envoyerAlerteReelle } from '../lib/veille/alerteAuto';

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const compose = composerAlerte(await chargerEntreeAlerte());

  if (compose === null) {
    console.log('[alertes:envoyer] rien à dire — aucune alerte ne serait envoyée aujourd’hui.');
    return;
  }

  console.log(`\n[alertes:envoyer] SUJET : ${compose.sujet}\n`);
  console.log(compose.corps);
  console.log('');

  if (!appliquer) {
    console.log('[alertes:envoyer] SIMULATION — rien envoyé, rien écrit. Relancer avec « --appliquer » pour envoyer réellement.');
    return;
  }

  const dest = (await chargerConfigVeille()).alerteEmail.trim();
  if (dest === '') {
    console.error('[alertes:envoyer] alerte_email vide (config_veille) : impossible d’envoyer. Renseignez l’adresse dans l’onglet Réglages.');
    process.exitCode = 1;
    return;
  }
  await envoyerAlerteReelle(dest, compose.sujet, compose.corps);
  console.log(`[alertes:envoyer] envoyé à ${dest}.`);
}

void main()
  .catch((e) => { console.error('[alertes:envoyer] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
