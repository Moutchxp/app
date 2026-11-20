/**
 * ══ 🔴🔴 COMPLÉTER LA BASE ADRESSE LOCALE DEPUIS UN FICHIER DE LA BAN OFFICIELLE (Arno, 20/11/2026, « Adresse officielle BAN », lot 3 ter) ════════════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/ban-csv-import.ts --fichier=.captures/ban-paris/adresses-75.csv             → à blanc
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npx tsx app/scripts/ban-csv-import.ts --fichier=.captures/ban-paris/adresses-75.csv --appliquer
 *
 * LE TROU CONSTATÉ (production, recette et base du Mac, 20/11) : Paris 11e n'a que 410 adresses (34 voies, sans la rue Jean-Pierre Timbaud) et le 20e
 * aucune — l'extrait BD TOPO d'où vient `adresse_ban` est incomplet pour Paris. Le fichier « adresses-75.csv » de la BAN officielle (adresse.data.gouv.fr),
 * DÉPOSÉ À LA MAIN (le script n'ouvre aucune connexion), comble le trou.
 *
 * CE QU'IL FAIT : chaque adresse du fichier dont l'IDENTIFIANT BAN (`id` → `cle_d_interoperabilite`) n'est pas déjà dans `adresse_ban` y est AJOUTÉE
 * (numéro, indice, voie, INSEE, commune, position Lambert-93, parcelles, certification) ; une adresse déjà présente n'est JAMAIS modifiée, rien n'est
 * supprimé ; REJOUABLE SANS DOUBLON. 🔴 (lot 3 quater) « Déjà présente » = même identifiant, OU la MÊME ADRESSE sous un autre identifiant (même commune,
 * même numéro et indice, même voie normalisée, à moins de 5 m : un identifiant de voie renuméroté par la BAN, « 75105_x125_00001 » devenu
 * « 75105_m7yz55_00001 ») — écartée et comptée, jamais ajoutée en double. Les lignes ajoutées portent `source_adresse = 'BAN adresse.data.gouv.fr (import AAAA-MM-JJ)'` : on les retrouve.
 * Les `fid` nouveaux suivent le plus grand `fid` « réel » (sous 900 000 000 : au-dessus, les lignes d'essai), puis la séquence est recalée au-dessus.
 * 🔴 GARDE : la base doit être `svav_recette` (la production : décision d'Arno, lot 8). Comptages avant / après par commune dans `.captures/ban-csv-import/`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { query, withTransaction } from '../lib/db/client';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

export interface AdresseCsv {
  id: string; voie: string | null; numero: number; suffixe: string | null; nomVoie: string; insee: string; commune: string;
  x: number | null; y: number | null; typePosition: string | null; lieuDit: string | null; certifiee: boolean | null; parcelles: string | null;
}

/** Le CSV de la BAN officielle (« id;id_fantoir;numero;rep;nom_voie;…;x;y;… ») → les adresses ; une ligne illisible est comptée, pas devinée. PUR. */
export function lireBanCsv(texte: string): { adresses: AdresseCsv[]; ecartees: number } {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = (lignes.shift() ?? '').split(';').map((c) => c.trim());
  const i = (n: string) => cols.indexOf(n);
  const I = { id: i('id'), fantoir: i('id_fantoir'), numero: i('numero'), rep: i('rep'), voie: i('nom_voie'), insee: i('code_insee'), commune: i('nom_commune'),
    x: i('x'), y: i('y'), type: i('type_position'), ld: i('nom_ld'), cert: i('certification_commune'), parcelles: i('cad_parcelles') };
  if ([I.id, I.numero, I.voie, I.insee, I.x, I.y].some((k) => k < 0)) throw new Error('En-tête inattendu : ce n’est pas un fichier « adresses » de la BAN.');
  const nul = (v: string | undefined) => ((v ?? '').trim() === '' ? null : (v ?? '').trim());
  const out: AdresseCsv[] = [];
  let ecartees = 0;
  for (const l of lignes) {
    const c = l.split(';');
    const numero = Number(c[I.numero]);
    if (c.length !== cols.length || !/^[0-9][0-9AB][0-9]{3}_/.test(c[I.id] ?? '') || !Number.isSafeInteger(numero) || nul(c[I.voie]) === null) { ecartees++; continue; }
    const x = Number(c[I.x]); const y = Number(c[I.y]);
    out.push({ id: c[I.id].trim(), voie: nul(c[I.fantoir]), numero, suffixe: nul(c[I.rep]), nomVoie: c[I.voie].trim(), insee: c[I.insee].trim(), commune: nul(c[I.commune]) ?? '',
      x: Number.isFinite(x) && c[I.x] !== '' ? x : null, y: Number.isFinite(y) && c[I.y] !== '' ? y : null, typePosition: nul(c[I.type]), lieuDit: I.ld < 0 ? null : nul(c[I.ld]),
      certifiee: I.cert < 0 || nul(c[I.cert]) === null ? null : c[I.cert].trim() === '1', parcelles: I.parcelles < 0 ? null : nul(c[I.parcelles]) });
  }
  return { adresses: out, ecartees };
}

async function comptages(insee: readonly string[]): Promise<Map<string, { adresses: number; voies: number }>> {
  const { rows } = await query<{ insee: string; a: string; v: string }>(
    `SELECT i AS insee, count(b.fid)::text AS a, count(DISTINCT b.nom_voie)::text AS v FROM unnest($1::text[]) AS i LEFT JOIN adresse_ban b ON b.insee_commune = i GROUP BY i ORDER BY i`, [[...insee]]);
  return new Map(rows.map((r) => [r.insee, { adresses: Number(r.a), voies: Number(r.v) }]));
}

async function timbaud(): Promise<string> {
  const { rows: [r] } = await query<{ n: string; du: number | null; au: number | null }>(
    `SELECT count(*)::text AS n, min(numero) AS du, max(numero) AS au FROM adresse_ban WHERE insee_commune = '75111' AND lower(unaccent(nom_voie)) LIKE '%jean%pierre%timbaud%'`);
  return Number(r.n) > 0 ? `OUI — ${r.n} adresses, du ${r.du} au ${r.au}` : 'NON';
}

async function main(): Promise<void> {
  const fichier = optionLigne(process.argv, 'fichier');
  if (fichier === null) { console.error('Indiquez le fichier : --fichier=<chemin du CSV de la BAN>.'); process.exit(2); }
  const appliquer = process.argv.includes('--appliquer');
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  if (base !== 'svav_recette') { console.error(`Base « ${base} » : ce script ne s'exécute que sur svav_recette. Rien n'est écrit.`); process.exit(3); }
  const { adresses, ecartees } = lireBanCsv(readFileSync(fichier, 'utf8'));
  const insee = [...new Set(adresses.map((a) => a.insee))].sort();
  const avant = await comptages(insee);
  const timbaudAvant = await timbaud();
  const jour = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  let ajoutees = 0;
  let memeAdresse = 0;
  if (appliquer) {
    ajoutees = await withTransaction(async (q) => {
      const { rows: [g] } = await q<{ b: string }>('SELECT current_database() AS b');
      if (g?.b !== 'svav_recette') throw new Error('GARDE : la destination n’est pas svav_recette, rien n’est écrit.');
      await q('LOCK TABLE adresse_ban IN SHARE ROW EXCLUSIVE MODE');
      await q(`CREATE TEMP TABLE ban_entrante (id text, voie text, numero int, suffixe text, nom_voie text, insee text, commune text, x double precision, y double precision,
                type_position text, lieu_dit text, certifiee boolean, parcelles text) ON COMMIT DROP`);
      for (let k = 0; k < adresses.length; k += 2000) {
        const t = adresses.slice(k, k + 2000);
        await q(`INSERT INTO ban_entrante SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::float8[], $9::float8[],
                  $10::text[], $11::text[], $12::bool[], $13::text[])`,
          [t.map((a) => a.id), t.map((a) => a.voie), t.map((a) => a.numero), t.map((a) => a.suffixe), t.map((a) => a.nomVoie), t.map((a) => a.insee), t.map((a) => a.commune),
            t.map((a) => a.x), t.map((a) => a.y), t.map((a) => a.typePosition), t.map((a) => a.lieuDit), t.map((a) => a.certifiee), t.map((a) => a.parcelles)]);
      }
      // les adresses déjà là pour les communes du fichier, avec leur clé « même adresse » (voie normalisée, indice écrit en entier, position)
      const VOIE = (c: string) => `btrim(regexp_replace(lower(unaccent(${c})), '[^a-z0-9]+', ' ', 'g'))`;
      const INDICE = (c: string) => `CASE lower(coalesce(${c}, '')) WHEN 'b' THEN 'bis' WHEN 't' THEN 'ter' WHEN 'q' THEN 'quater' ELSE lower(coalesce(${c}, '')) END`;
      await q(`CREATE TEMP TABLE ban_existante ON COMMIT DROP AS
                 SELECT cle_d_interoperabilite AS id, insee_commune AS insee, numero, ${INDICE('suffixe')} AS ind, ${VOIE('nom_voie')} AS v, geom
                   FROM adresse_ban WHERE insee_commune = ANY($1::text[])`, [insee]);
      await q('CREATE INDEX ON ban_existante (id)');
      await q('CREATE INDEX ON ban_existante (insee, numero, ind, v)');
      await q(`CREATE TEMP TABLE ban_nouvelle ON COMMIT DROP AS
                 SELECT DISTINCT ON (e.id) e.*, ${INDICE('e.suffixe')} AS ind, ${VOIE('e.nom_voie')} AS v,
                        CASE WHEN e.x IS NULL OR e.y IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(e.x, e.y), 2154) END AS geom
                   FROM ban_entrante e WHERE NOT EXISTS (SELECT 1 FROM ban_existante x WHERE x.id = e.id) ORDER BY e.id`);
      const { rows: [meme] } = await q<{ n: number }>(
        `WITH m AS (SELECT n.id FROM ban_nouvelle n WHERE EXISTS (SELECT 1 FROM ban_existante x WHERE x.insee = n.insee AND x.numero = n.numero AND x.ind = n.ind
                      AND x.v = n.v AND x.geom IS NOT NULL AND n.geom IS NOT NULL AND ST_DWithin(x.geom, n.geom, 5)))
         DELETE FROM ban_nouvelle WHERE id IN (SELECT id FROM m) RETURNING 1`).then((r) => ({ rows: [{ n: (r as { rowCount?: number }).rowCount ?? 0 }] }));
      memeAdresse = meme.n;
      const { rows: [m] } = await q<{ m: number }>('SELECT coalesce(max(fid), 0) AS m FROM adresse_ban WHERE fid < 900000000');
      const r = await q(
        `INSERT INTO adresse_ban (fid, numero, suffixe, identifiant_voie, nom_voie, insee_commune, nom_commune, type_position, lieu_dit, source_adresse,
                                  certification_commune, parcelles_cadastrales, cle_d_interoperabilite, geom)
         SELECT $1::int + row_number() OVER (ORDER BY e.id), e.numero, e.suffixe, e.voie, e.nom_voie, e.insee, e.commune, e.type_position, e.lieu_dit, $2,
                e.certifiee, e.parcelles, e.id, e.geom
           FROM ban_nouvelle e`,
        [m.m, `BAN adresse.data.gouv.fr (import ${jour})`]);
      // la séquence repart au-dessus des fid réels : une insertion future ne heurte aucune ligne ajoutée ici
      await q(`SELECT setval('adresse_ban_fid_seq', (SELECT max(fid) FROM adresse_ban WHERE fid < 900000000))`);
      return (r as { rowCount?: number }).rowCount ?? 0;
    });
    await query('ANALYZE adresse_ban');
  }
  const apres = await comptages(insee);
  const lignes = [`Base : ${base} — ${appliquer ? 'APPLIQUÉ' : 'à blanc (rien n’est écrit)'} — fichier ${fichier}`,
    `Adresses lues : ${adresses.length} — écartées : ${ecartees}${appliquer ? ` — AJOUTÉES : ${ajoutees} — non ajoutées, même adresse déjà là sous un autre identifiant : ${memeAdresse}` : ''}`,
    `Rue Jean-Pierre Timbaud dans 75111 : avant ${timbaudAvant} ; après ${appliquer ? await timbaud() : '(à blanc)'}`,
    'Commune : adresses avant → après (voies avant → après)',
    ...insee.map((c) => `  ${c} : ${avant.get(c)?.adresses ?? 0} → ${apres.get(c)?.adresses ?? 0} (${avant.get(c)?.voies ?? 0} → ${apres.get(c)?.voies ?? 0})`)];
  const chemin = cheminRapport({ nomScript: 'ban-csv-import', prefixe: appliquer ? 'applique' : 'a-blanc' });
  writeFileSync(chemin, `${lignes.join('\n')}\n`);
  console.log(lignes.join('\n')); console.log(`Rapport : ${chemin}`);
}
if (process.argv[1]?.endsWith('ban-csv-import.ts')) void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
