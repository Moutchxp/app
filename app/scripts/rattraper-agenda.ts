/**
 * CLI `gestion:agenda:rattraper` — LOT AGENDA-TITRE-ET-LIENS : REMETTRE À JOUR LES ÉVÉNEMENTS DÉJÀ POSÉS PAR L'APPLICATION
 * (nouveau titre « Tâche gestion — <titre> — <adresse> », lien « Fiche du bien » fiable).
 *
 * 🔴 SANS `--appliquer`, ELLE NE FAIT QUE LISTER (titre et date) les événements qui portent la MARQUE de
 * l'application, dans les agendas que l'application connaît. Les autres rendez-vous ne sont ni lus ni touchés.
 * Avec `--appliquer`, chaque événement rattaché à sa tâche est remis à jour par la synchronisation habituelle
 * (relecture de la marque avant toute modification). Aucun mail (sendUpdates=none).
 *
 * Usage :
 *   npm run gestion:agenda:rattraper
 *   npm run gestion:agenda:rattraper -- --appliquer
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';

const P = '[gestion:agenda:rattraper]';

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const { rattraperAgenda } = await import('../lib/gestion/agendaSynchro');
  const { adresseApplication } = await import('../lib/gestion/adresseApplication');
  const a = adresseApplication();
  console.log(`${P} Adresse des liens : ${a.base}${a.locale ? ' (locale)' : ''}`);
  const r = await rattraperAgenda({ appliquer });
  console.log(`${P} Événements de l'application trouvés : ${r.evenements.length}`);
  for (const e of r.evenements) {
    console.log(`${P}    · ${e.debut} — ${e.titre} — tâche ${e.tacheId}${e.rattache ? '' : ' (NON rattaché en base : laissé tel quel)'} [${e.agenda}]`);
  }
  if (appliquer) console.log(`${P} ✅ Événements remis à jour : ${r.modifies}`);
  else console.log(`${P} (liste seulement — relancer avec --appliquer pour mettre à jour)`);
  for (const x of r.echecs) console.error(`${P} ⚠️ ${x}`);
}

const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  main().catch((e) => { console.error(`${P} échec`, e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
