/**
 * ══ REPRISE DES DIGICODES DÉJÀ SAISIS SUR DES BIENS → L'IMMEUBLE DE LEUR ADRESSE (Arno, 21/10/2026, migration 396) ═══════════
 *
 * À BLANC PAR DÉFAUT : rien n'est écrit, le rapport dit ce qui serait fait. `--reel` écrit (migration 396 requise).
 * Règle : pour chaque adresse (normalisée), si tous les biens qui ont un code ont le MÊME (ou un seul en a un), il passe sur
 * l'immeuble ; s'ils ont des codes DIFFÉRENTS, rien n'est choisi — l'adresse va dans « À ARBITRER » (adresse, biens, codes),
 * et l'ancien code de chaque bien reste lisible. Rien n'est supprimé : les colonnes des biens restent telles quelles.
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/reprendre-digicodes-immeubles.ts [--reel] [--rapport=chemin]
 * Rapport : .captures/reprendre-digicodes-immeubles/rapport-<date>.txt par défaut ; `--rapport=` fichier ou dossier.
 */
import { writeFileSync } from 'node:fs';
import { closePool } from '../lib/db/client';
import { executerRepriseDigicodes, texteRapportReprise } from '../lib/location/digicodeImmeubleRepo';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

const REEL = process.argv.includes('--reel');
// Arno (21/10/2026) : jamais sur le Bureau — `.captures/reprendre-digicodes-immeubles/rapport-<date>.txt` ; `--rapport=` peut
// désigner un fichier ou un DOSSIER (le fichier est alors créé dedans).
const RAPPORT = cheminRapport({ nomScript: 'reprendre-digicodes-immeubles', demande: optionLigne(process.argv, 'rapport'), prefixe: REEL ? 'rapport-reel' : 'rapport' });

async function main(): Promise<void> {
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '(inconnue)';
  console.log(`Base : ${base} — ${REEL ? 'RÉEL : les immeubles seront écrits' : 'À BLANC : rien ne sera écrit'}`);
  const r = await executerRepriseDigicodes({ reel: REEL });
  const texte = `Base : ${base}\n${texteRapportReprise(r)}\n`;
  writeFileSync(RAPPORT, texte);
  console.log(texte);
  console.log(`Rapport : ${RAPPORT}`);
}

void main().then(() => closePool()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
