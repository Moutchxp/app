/**
 * ══ 🔴🔴 LE STOCK, RAPPROCHÉ DE LA BASE ADRESSE NATIONALE — « --essai » (Arno, 20/11/2026, « Adresse officielle BAN », lot 3) ═════════════════════════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/adresses-officielles-stock.ts
 *     → rapproche chaque bien en portefeuille par le MODULE UNIQUE (`app/lib/adresse/banRepo.ts` — aucun autre accès à la BAN) et écrit le rapport dans
 *       `.captures/adresse-officielle-ban/essai-stock-AAAA-MM-JJ/` : `resume.txt`, `rapport.html` (lisible), `ecritures.csv` et `reunions.csv` (Numbers).
 *
 * 🔴 AUCUNE ÉCRITURE EN BASE, PAR CONSTRUCTION : la connexion est ouverte en LECTURE SEULE (PGOPTIONS default_transaction_read_only=on, vérifié avant
 * toute lecture — sinon arrêt) ; les tables touchées par le chantier sont COMPTÉES avant et après, et le résumé le prouve. `--appliquer` n'existe pas
 * encore (lot 5, après l'accord d'Arno) : refusé.
 *
 * LOT 8 (production, plus tard, rien n'est lancé ici) : le même script tourne sur le serveur, dans le dossier de l'application, avec le DATABASE_URL de
 * la production ; il n'écrit que ses fichiers de rapport (dans `.captures/` du serveur, à rapatrier) et refuse une base qui n'est pas en lecture seule.
 * Option `--dossier=<chemin>` : un autre dossier de rapport.
 */
process.env.PGOPTIONS = `${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on`.trim();

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { csvEcritures, csvReunions, htmlRapport, texteResume } from '../lib/adresse/essaiStock';
import { essaiDuStock, TABLES_COMPTEES } from '../lib/adresse/essaiStockRepo';
import { optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';

async function main(): Promise<void> {
  if (process.argv.includes('--appliquer')) {
    console.error('« --appliquer » n’existe pas encore : il viendra au lot 5, après l’accord d’Arno sur ce rapport. Rien n’est fait.');
    process.exit(2);
  }
  const e = await essaiDuStock();
  if (!e.ok) { console.error(e.motif); process.exit(3); }
  const { rapport, avant, apres, intact } = e;
  const maintenant = new Date();
  const jour = maintenant.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const dossier = optionLigne(process.argv, 'dossier') ?? join(RACINE_PROJET, '.captures', 'adresse-officielle-ban', `essai-stock-${jour}`);
  mkdirSync(dossier, { recursive: true });
  const entete = [
    `Base : ${e.base} — ESSAI (aucune écriture : connexion en lecture seule) — ${maintenant.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    `Règle : module unique app/lib/adresse (même commune, numéro et indice ; voie ≥ 0,90 ; type contradictoire jamais certain ; plage toujours à vérifier)`,
    `Preuve « rien n’est écrit » : ${intact ? 'tables identiques avant et après' : '⚠️ UNE TABLE A CHANGÉ PENDANT L’ESSAI (une autre écriture ?)'} — `
      + TABLES_COMPTEES.map((t) => `${t} ${avant[t] ?? 'absente'}→${apres[t] ?? 'absente'}`).join(', '),
  ];
  writeFileSync(join(dossier, 'resume.txt'), `${texteResume(rapport, entete)}\n`);
  writeFileSync(join(dossier, 'rapport.html'), htmlRapport(rapport, entete));
  writeFileSync(join(dossier, 'ecritures.csv'), csvEcritures(rapport));
  writeFileSync(join(dossier, 'reunions.csv'), csvReunions(rapport));
  console.log(texteResume(rapport, entete).split('\n').slice(0, 10).join('\n'));
  console.log(`\nRapport : ${dossier}`);
  if (!intact) process.exit(4);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
