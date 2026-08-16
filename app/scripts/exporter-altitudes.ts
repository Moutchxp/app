/**
 * FUS-3f — CLI d'EXPORT du registre d'altitudes (pièce de preuve) par POLYGONE (cleabs) ou par PARCELLE (idu). Sort à la fois
 * la STRUCTURE JSON (archivable, réexploitable) et un RENDU TEXTE lisible. Lecture SEULE. NON lancé automatiquement — Arno le lance.
 * Lancer : npm run permis:exporter-altitudes -- (--polygone <cleabs> | --parcelle <idu>) [--json-seul | --texte-seul]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { exporterParPolygone, exporterParParcelle, rendreTextePiece } from '../lib/permis/exportAltitudes';

const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
const USAGE = 'usage : npm run permis:exporter-altitudes -- (--polygone <cleabs> | --parcelle <idu>) [--json-seul | --texte-seul]';

async function main(): Promise<void> {
  const cleabs = arg('--polygone');
  const idu = arg('--parcelle');
  if ((!cleabs && !idu) || (cleabs && idu)) { console.error(USAGE); process.exitCode = 2; return; }

  // genereLe posé ICI (l'appelant), pas dans le module pur : la pièce porte son horodatage d'édition.
  const genereLe = new Date().toISOString();
  const piece = cleabs ? await exporterParPolygone(cleabs, genereLe) : await exporterParParcelle(idu as string, genereLe);

  const jsonSeul = process.argv.includes('--json-seul');
  const texteSeul = process.argv.includes('--texte-seul');
  if (!jsonSeul) { console.log(rendreTextePiece(piece)); console.log(''); }
  if (!texteSeul) { console.log('----- JSON -----'); console.log(JSON.stringify(piece, null, 2)); }
}

void main().catch((e) => { console.error('[permis:exporter-altitudes] échec', e); process.exitCode = 1; }).finally(() => closePool());
