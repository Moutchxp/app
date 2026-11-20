/**
 * ══ 🔴🔴 LA CORRESPONDANCE CODE POSTAL → INSEE, DEPUIS LA « BASE OFFICIELLE DES CODES POSTAUX » (Arno, 20/11/2026, « Adresse officielle BAN », lot 3 bis) ══
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/codes-postaux-import.ts --fichier=<chemin du CSV>             → à blanc
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/codes-postaux-import.ts --fichier=<chemin du CSV> --appliquer
 *
 * Lit le fichier CSV de La Poste DÉPOSÉ À LA MAIN (aucun téléchargement : le script n'ouvre aucune connexion à l'extérieur), au format d'aujourd'hui
 * (`code_commune_insee,nom_de_la_commune,code_postal,libelle_d_acheminement,ligne_5`, virgules) comme à l'ancien (`#Code_commune_INSEE;…`, points-virgules),
 * et remplit `code_postal_insee` (migration 507) : une ligne par couple (code postal, INSEE), REJOUABLE SANS DOUBLON (ON CONFLICT DO NOTHING), rien
 * n'est jamais modifié ni supprimé. 🔴 GARDE : la base doit être `svav_recette` (la production viendra avec le lot 8). Rapport dans `.captures/codes-postaux-import/`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { query, withTransaction } from '../lib/db/client';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

export interface LigneCodePostal { codePostal: string; insee: string; nom: string; acheminement: string | null }

/** Le CSV de La Poste → les couples (code postal, INSEE), dédoublonnés ; les lignes illisibles sont comptées, pas devinées. PUR. */
export function lireCodesPostaux(texte: string): { lignes: LigneCodePostal[]; ecartees: number } {
  const brutes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const tete = (brutes.shift() ?? '').replace(/^#/, '');
  const sep = tete.includes(';') ? ';' : ',';
  const cols = tete.split(sep).map((c) => c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const i = { insee: cols.indexOf('code_commune_insee'), nom: cols.indexOf('nom_de_la_commune'), cp: cols.indexOf('code_postal'), ach: cols.indexOf('libelle_d_acheminement') };
  if (i.insee < 0 || i.nom < 0 || i.cp < 0) throw new Error('En-tête inattendu : ce n’est pas la « Base officielle des codes postaux ».');
  const vus = new Map<string, LigneCodePostal>();
  let ecartees = 0;
  for (const l of brutes) {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    const insee = (c[i.insee] ?? '').padStart(5, '0'); const cp = (c[i.cp] ?? '').padStart(5, '0');
    if (!/^[0-9][0-9AB][0-9]{3}$/.test(insee) || !/^[0-9]{5}$/.test(cp) || (c[i.nom] ?? '') === '') { ecartees++; continue; }
    const k = `${cp}|${insee}`;
    if (!vus.has(k)) vus.set(k, { codePostal: cp, insee, nom: c[i.nom], acheminement: i.ach < 0 ? null : (c[i.ach] || null) });
  }
  return { lignes: [...vus.values()], ecartees };
}

/** Le fichier de La Poste est publié en ISO-8859-1 (« Libellé » y est illisible lu comme de l'UTF-8) : UTF-8 s'il est valide, sinon Latin-1. PUR. */
export function decoderFichier(octets: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); } catch { return new TextDecoder('latin1').decode(octets); }
}

async function main(): Promise<void> {
  const fichier = optionLigne(process.argv, 'fichier');
  if (fichier === null) { console.error('Indiquez le fichier : --fichier=<chemin du CSV de La Poste>.'); process.exit(2); }
  const appliquer = process.argv.includes('--appliquer');
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  if (base !== 'svav_recette') { console.error(`Base « ${base} » : ce script ne s'exécute que sur svav_recette. Rien n'est écrit.`); process.exit(3); }
  const { lignes, ecartees } = lireCodesPostaux(decoderFichier(readFileSync(fichier)));
  let ajoutees = 0;
  if (appliquer) {
    ajoutees = await withTransaction(async (q) => {
      const { rows: [g] } = await q<{ b: string }>('SELECT current_database() AS b');
      if (g?.b !== 'svav_recette') throw new Error('GARDE : la destination n’est pas svav_recette, rien n’est écrit.');
      let n = 0;
      for (let k = 0; k < lignes.length; k += 1000) {
        const t = lignes.slice(k, k + 1000);
        const r = await q(
          `INSERT INTO code_postal_insee (code_postal, insee, nom_commune, libelle_acheminement, source, millesime)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS x(cp, insee, nom, ach) CROSS JOIN (VALUES ('La Poste — Base officielle des codes postaux', $5::text)) AS s(source, millesime)
           ON CONFLICT (code_postal, insee) DO NOTHING`,
          [t.map((x) => x.codePostal), t.map((x) => x.insee), t.map((x) => x.nom), t.map((x) => x.acheminement), new Date().toISOString().slice(0, 10)]);
        n += (r as { rowCount?: number }).rowCount ?? 0;
      }
      return n;
    });
  }
  const texte = [`Base : ${base} — ${appliquer ? 'APPLIQUÉ' : 'à blanc (rien n’est écrit)'} — fichier ${fichier}`,
    `Couples (code postal, INSEE) lus : ${lignes.length} — lignes écartées : ${ecartees}${appliquer ? ` — ajoutés : ${ajoutees}` : ''}`].join('\n');
  const chemin = cheminRapport({ nomScript: 'codes-postaux-import', prefixe: appliquer ? 'applique' : 'a-blanc' });
  writeFileSync(chemin, `${texte}\n`);
  console.log(texte); console.log(`Rapport : ${chemin}`);
}
if (process.argv[1]?.endsWith('codes-postaux-import.ts')) void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
