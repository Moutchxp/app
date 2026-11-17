/**
 * ══ 🔴🔴 « ADRESSES MULTIPLES D'UNE COPROPRIÉTÉ », LOT 2 — LE RAPPORT À BLANC DES BÂTIMENTS PAR ADRESSE, LECTURE SEULE (Arno, 17/11/2026) ══════════
 *
 * Pour chaque bâtiment du registre (476) : l'adresse de sa copropriété que la reprise lui donnerait, et la règle qui l'a déduite ; la liste « adresse à
 * préciser » (choix par Arno) ; les séparations (un bâtiment trouvé à plusieurs adresses devient un bâtiment par adresse) ; les biens reliés hors des
 * adresses de leur copropriété (signalés). Les règles : `planBatimentsParAdresse` (lib/gestion/batimentsParAdresse.ts).
 * Décision d'Arno : « Aucune reprise réelle avant validation d'Arno. »
 *
 * 🔒 AUCUNE ÉCRITURE EN BASE : la garde ci-dessous refuse un verbe d'écriture dans ce fichier, et la session est en lecture seule.
 * Le rapport va dans `.captures/copropriete/` (ou `--rapport=<fichier ou dossier>`).
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/batiments-par-adresse.ts [--rapport=…]
 *         (la recette : DATABASE_URL pointé sur svav_recette)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { planBatimentsParAdresse, texteRapportBatiments, type BatimentLu, type BienRelie, type CoproLue, type PreuveDigicode } from '../lib/gestion/batimentsParAdresse';
import { cheminRapport } from '../lib/ops/rapportScript';

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
    console.error(`ARRÊT : ce script de lecture contient un verbe d'écriture (${trouves.join(', ')}). Rien n'a été lu.`);
    process.exit(1);
  }
}

async function colonne(table: string, col: string): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT count(*) = 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, col]);
  return rows[0]?.ok === true;
}

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  await query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  if (!(await colonne('gestion_copropriete_batiment', 'id'))) {
    console.error('Le registre des bâtiments (476) est absent de cette base : rien à rapporter.');
    return;
  }
  const avec489 = await colonne('gestion_copropriete_batiment', 'adresse_cle');
  // les adresses de chaque copropriété : la principale d'abord, puis les secondaires en cours (335), dans leur ordre
  const { rows: c } = await query<{ id: string; libelle: string; cle: string }>('SELECT id::text, libelle, cle_immeuble AS cle FROM gestion_copropriete ORDER BY id');
  const { rows: sec } = await query<{ copro: string; cle: string; libelle: string }>(
    'SELECT copropriete_id::text AS copro, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id');
  const copros: CoproLue[] = c.map((x) => ({ id: Number(x.id), libelle: x.libelle,
    adresses: [{ cle: x.cle, libelle: x.libelle }, ...sec.filter((a) => a.copro === x.id).map((a) => ({ cle: a.cle, libelle: a.libelle }))] }));
  const { rows: b } = await query<{ id: string; copro: string; cle: string; libelle: string; adresse: string | null }>(
    `SELECT id::text, copropriete_id::text AS copro, batiment_cle AS cle, batiment_libelle AS libelle, ${avec489 ? 'adresse_cle' : 'NULL::text'} AS adresse
       FROM gestion_copropriete_batiment b ORDER BY b.copropriete_id, b.id`);
  const batiments: BatimentLu[] = b.map((x) => ({ id: Number(x.id), coproId: Number(x.copro), cle: x.cle, libelle: x.libelle, adresseCle: x.adresse }));
  const digicodes: PreuveDigicode[] = (await colonne('gestion_digicode', 'adresse_cle'))
    ? (await query<{ a: string; b: string }>(`SELECT DISTINCT adresse_cle AS a, batiment_cle AS b FROM gestion_digicode WHERE batiment_cle <> '' AND annule_le IS NULL`)).rows
      .map((x) => ({ adresseCle: x.a, batimentCle: x.b }))
    : [];
  const biens: BienRelie[] = (await colonne('gestion_annuaire_lot', 'copropriete_batiment_id'))
    ? (await query<{ id: string; bat: string; immeuble: string | null; adresse: string | null }>(
      `SELECT id::text, copropriete_batiment_id::text AS bat, immeuble, adresse FROM gestion_annuaire_lot
        WHERE copropriete_batiment_id IS NOT NULL AND absent_le IS NULL ORDER BY id`)).rows
      .map((x) => ({ lotId: Number(x.id), batimentId: Number(x.bat), immeuble: x.immeuble, adresse: x.adresse }))
    : [];
  const plan = planBatimentsParAdresse(copros, batiments, digicodes, biens);
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const texte = texteRapportBatiments(plan, base, quand) + (avec489 ? '' : '\n⚠️ La migration 489 n’est pas posée sur cette base : la colonne « adresse » n’existe pas encore.\n');
  const demande = process.argv.find((a) => a.startsWith('--rapport='))?.slice('--rapport='.length) ?? null;
  const chemin = cheminRapport({ nomScript: 'copropriete', demande, prefixe: 'batiments-par-adresse-a-blanc' });
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte.split('\n').slice(0, 14).join('\n'));
  console.log(`\nRapport complet : ${chemin}`);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
