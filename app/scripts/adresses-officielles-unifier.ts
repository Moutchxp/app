/**
 * ══ 🔴🔴 UNIFIER LES ADRESSES DU STOCK : UNE SEULE ADRESSE OFFICIELLE PAR ADRESSE RÉELLE (Arno, 20/11/2026, « Adresse officielle BAN », lot 5) ════════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/adresses-officielles-unifier.ts            → « --essai » (par défaut)
 *
 * Rend, SANS RIEN ÉCRIRE, ce que l'unification ferait : les rapprochements des biens (certains appliqués ; à vérifier et introuvables enregistrés pour la
 * file du lot 6), les copropriétés réunies, les écritures d'origine, les adresses officielles posées, les regroupements 504 absorbés, les digicodes
 * fusionnés ou « à trancher », les conflits (rien n'est écrasé), les autres données rangées par adresse. Rapport dans
 * `.captures/adresse-officielle-ban/essai-unification-AAAA-MM-JJ-HHMM/` (`resume.txt`, `rapport.html`, `plan.json`).
 *
 * 🔴 La connexion est ouverte en LECTURE SEULE (vérifiée), les tables du chantier sont comptées avant et après. `--appliquer` n'est PAS encore là : il sera
 * écrit et lancé après la validation de ce rapport par Arno (une écriture en base qui touche des données réelles, même en recette) — refusé.
 */
process.env.PGOPTIONS = `${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on`.trim();

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES_COMPTEES } from '../lib/adresse/essaiStockRepo';
import { htmlUnification, texteResumeUnification } from '../lib/adresse/unificationStock';
import { unificationDuStock } from '../lib/adresse/unificationStockRepo';
import { optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';

async function main(): Promise<void> {
  if (process.argv.includes('--appliquer')) {
    console.error('« --appliquer » n’existe pas encore : il sera écrit après la validation du rapport d’essai par Arno. Rien n’est fait.');
    process.exit(2);
  }
  const e = await unificationDuStock();
  if (!e.ok) { console.error(e.motif); process.exit(3); }
  const maintenant = new Date();
  const horo = maintenant.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', '-').replace(/:/g, '').slice(0, 15);
  const dossier = optionLigne(process.argv, 'dossier') ?? join(RACINE_PROJET, '.captures', 'adresse-officielle-ban', `essai-unification-${horo}`);
  mkdirSync(dossier, { recursive: true });
  const entete = [
    `Base : ${e.base} — ESSAI (aucune écriture : connexion en lecture seule) — ${maintenant.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    `Preuve « rien n’est écrit » : ${e.intact ? 'tables identiques avant et après' : '⚠️ UNE TABLE A CHANGÉ PENDANT L’ESSAI'} — `
      + TABLES_COMPTEES.map((t) => `${t} ${e.avant[t] ?? 'absente'}→${e.apres[t] ?? 'absente'}`).join(', '),
  ];
  writeFileSync(join(dossier, 'resume.txt'), `${texteResumeUnification(e.plan, entete)}\n`);
  writeFileSync(join(dossier, 'rapport.html'), htmlUnification(e.plan, entete));
  writeFileSync(join(dossier, 'plan.json'), JSON.stringify(e.plan, null, 1));
  console.log(texteResumeUnification(e.plan, entete).split('\nIMMEUBLES QUI CHANGENT')[0]);
  console.log(`\nRapport : ${dossier}`);
  if (!e.intact) process.exit(4);
}
void main().then(() => process.exit(0), (x) => { console.error(x); process.exit(1); });
