/**
 * ══ REPRISE DES DIGICODES D'AVANT DANS LA BASE UNIQUE (Arno, 16/11/2026, chantier « Digicodes unifiés », migration 478) ═════════════════════
 *
 * À BLANC PAR DÉFAUT : rien n'est écrit, le rapport dit ce qui serait fait. `--reel` écrit (migration 478 requise ; jamais sans l'accord d'Arno).
 * Règle : chaque place (adresse de copropriété × bâtiment ; '' = code commun) qui porte une valeur d'avant (396, 399, colonnes du bien) et
 * aucun code dans la base unique : UNE seule valeur → reprise telle quelle, avec sa date ; plusieurs valeurs DIFFÉRENTES → « À ARBITRER » (rien
 * n'est choisi). Les anciennes tables ne sont NI vidées NI modifiées. 🔒 Le rapport ne montre jamais un code en clair (deux derniers caractères).
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/reprendre-digicodes-unifies.ts [--reel] [--rapport=chemin]
 * Rapport : .captures/reprendre-digicodes-unifies/rapport-<date>.txt par défaut ; `--rapport=` fichier ou dossier.
 */
import { writeFileSync } from 'node:fs';
import { closePool } from '../lib/db/client';
import { texteRapportRepriseUnifiee } from '../lib/gestion/digicodes';
import { repriseDigicodesUnifies } from '../lib/gestion/digicodesRepo';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

const REEL = process.argv.includes('--reel');
const RAPPORT = cheminRapport({ nomScript: 'reprendre-digicodes-unifies', demande: optionLigne(process.argv, 'rapport'), prefixe: REEL ? 'rapport-reel' : 'rapport' });

async function main(): Promise<void> {
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '(inconnue)';
  console.log(`Base : ${base} — ${REEL ? 'RÉEL : la base unique sera écrite' : 'À BLANC : rien ne sera écrit'}`);
  const { plan, ecrites } = await repriseDigicodesUnifies({ reel: REEL });
  const texte = `Base : ${base}\n${texteRapportRepriseUnifiee(plan, { reel: REEL, ecrites, date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) })}\n`;
  writeFileSync(RAPPORT, texte);
  console.log(texte);
  console.log(`Rapport : ${RAPPORT}`);
}

void main().then(() => closePool()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
