/**
 * ══ 🔴🔴 « MANDAT PAR BIEN », LOT 3 — LA REPRISE DES N° DE MANDAT DES FICHES PROPRIÉTAIRES SUR LEURS BIENS (Arno, 18/11/2026) ═══════════════════════
 *
 * À BLANC PAR DÉFAUT (décision d'Arno : « Le script de reprise reste à blanc par défaut ; ne lance PAS --reel (rien à reprendre ici ; il servira sur une
 * copie de la production) ») : la session est en LECTURE SEULE, le rapport dit ce que la reprise ferait. `--reel` écrit : seulement les n° encore vides
 * des biens (règles : `planRepriseMandats`), une ligne au journal de chaque bien ; aucun DELETE, la fiche des propriétaires n'est jamais touchée ;
 * refus sans la 492. Les biens à arbitrer (copropriétaires aux n° différents, n° partagé entre propriétaires différents) ne sont jamais écrits.
 * Le rapport va dans `.captures/mandats/` (ou `--rapport=<fichier ou dossier>`).
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/mandats-par-bien-reprise.ts [--reel] [--rapport=…]
 */
import { writeFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { planRepriseMandats, texteRapportMandats } from '../lib/location/repriseMandatsParBien';
import { appliquerRepriseMandats, lirePourReprise } from '../lib/location/repriseMandatsParBienRepo';
import { cheminRapport } from '../lib/ops/rapportScript';

async function main(): Promise<void> {
  const reel = process.argv.includes('--reel');
  if (!reel) await query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const { proprietaires, biens } = await lirePourReprise();
  const plan = planRepriseMandats(proprietaires, biens);
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  let texte = texteRapportMandats(plan, base, quand, reel);
  if (reel) {
    const r = await appliquerRepriseMandats(plan, { id: null, libelle: 'reprise « mandat par bien » (script)' });
    texte += r.ok ? `\nÉCRIT : ${r.ecrits} bien(s).\n` : `\nREFUSÉ : ${r.motif}\n`;
  }
  const demande = process.argv.find((a) => a.startsWith('--rapport='))?.slice('--rapport='.length) ?? null;
  const chemin = cheminRapport({ nomScript: 'mandats', demande, prefixe: reel ? 'mandats-par-bien-reprise' : 'mandats-par-bien-a-blanc' });
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte.split('\n').slice(0, 12).join('\n'));
  console.log(`\nRapport complet : ${chemin}`);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
