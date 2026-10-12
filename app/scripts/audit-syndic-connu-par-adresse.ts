/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — DÉCOMPTE DE LA PARTIE 3, LECTURE SEULE ══════════════════
 *
 * Combien de biens du portefeuille afficheraient aujourd'hui le bandeau « Syndic connu pour cette adresse » : un bien
 * sans syndic dont l'adresse est la même qu'un bien rattaché à un syndic (ou qu'une adresse de sa copropriété), hors
 * propositions « Ignorées ». Le calcul est celui de l'écran (`biensAvecProposition`), rien d'autre.
 *
 * 🔒 AUCUNE ÉCRITURE : ni en base (garde ci-dessous), ni sur disque — le résultat sort sur la console.
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/audit-syndic-connu-par-adresse.ts
 */
import { readFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { biensAvecProposition } from '../lib/gestion/doublonSyndicRepo';

const VERBES_INTERDITS = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

function GARDE_LECTURE_SEULE(): void {
  const code = readFileSync(new URL(import.meta.url).pathname, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.includes('VERBES_INTERDITS'))
    .join('\n')
    .toUpperCase();
  const trouves = VERBES_INTERDITS.filter((v) => code.includes(v));
  if (trouves.length > 0) {
    console.error(`ARRÊT : ce script d'audit contient un verbe d'écriture (${trouves.join(', ')}). Rien n'a été lu.`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_annuaire_lot WHERE absent_le IS NULL`);
  const liste = await biensAvecProposition();
  console.log(`Biens du portefeuille : ${rows[0]?.n ?? '?'} — bandeau « Syndic connu pour cette adresse » : ${liste.length}`);
  for (const p of liste) {
    console.log(`  · lot ${p.lot.numero} (${p.lot.immeuble ?? p.lot.adresse ?? ''}) : ${p.syndics.map((s) => `${s.syndic.nom} (${s.via.join(', ')})`).join(' ; ')}`);
  }
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
