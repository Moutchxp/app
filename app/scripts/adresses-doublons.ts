/**
 * ══ 🔴🔴 « ADRESSES UNIFORMISÉES », LOT 1 — LES DOUBLONS PROBABLES D'ADRESSES, LECTURE SEULE (Arno, 17/11/2026) ══════════════════
 *
 * Repère, sous un même code postal, les adresses écrites de plusieurs façons (majuscules, accents, ponctuation ; puis abréviations,
 * petits mots, « 12ter »), toutes fiches confondues : biens (adresse et « Immeuble »), propriétaires, locataires, cartes de contact,
 * syndics, adresses des copropriétés, apporteurs, Transaction. 🔴 AUCUNE ADRESSE N'EST RÉÉCRITE : le rapport les montre, rien de plus.
 *
 * 🔒 AUCUNE ÉCRITURE EN BASE : la garde ci-dessous refuse un verbe d'écriture dans ce fichier, et la session est en lecture seule.
 * Le rapport va dans `.captures/adresses-doublons/` (ou `--rapport=<fichier ou dossier>`).
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/adresses-doublons.ts [--rapport=…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { texteRapportDoublons, type AdresseLue } from '../lib/gestion/adressesDoublons';
import { adressesPostalesDesCartes } from '../lib/gestion/partieCategorieRepo';
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

/** Les sources : un nom lisible, la table et ses colonnes. Une table absente (base plus ancienne) est sautée, et le rapport le dit. */
const SOURCES: { nom: string; table: string; adresse: string; codePostal: string | null; filtre?: string }[] = [
  { nom: 'biens (adresse)', table: 'gestion_annuaire_lot', adresse: 'adresse', codePostal: 'code_postal' },
  { nom: 'biens (« Immeuble »)', table: 'gestion_annuaire_lot', adresse: 'immeuble', codePostal: 'code_postal' },
  { nom: 'propriétaires', table: 'gestion_annuaire_proprietaire', adresse: 'adresse', codePostal: 'code_postal' },
  { nom: 'locataires', table: 'gestion_annuaire_locataire', adresse: 'adresse', codePostal: 'code_postal' },
  { nom: 'syndics', table: 'gestion_syndic', adresse: 'adresse', codePostal: 'code_postal' },
  { nom: 'copropriétés (adresses)', table: 'gestion_copropriete_adresse', adresse: 'libelle', codePostal: 'code_postal', filtre: 'retire_le IS NULL' },
  { nom: 'apporteurs', table: 'gestion_location_apporteur', adresse: 'adresse', codePostal: null },
  { nom: 'Transaction (personnes)', table: 'transaction_personne', adresse: 'adresse', codePostal: null },
  { nom: 'Transaction (biens)', table: 'transaction_vente', adresse: 'adresse_bien', codePostal: null },
];

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  await query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const lues: { nom: string; lignes: AdresseLue[] }[] = [];
  const absentes: string[] = [];
  for (const s of SOURCES) {
    const existe = (await query<{ ok: boolean }>(
      `SELECT count(*) = $3 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
      [s.table, [s.adresse, ...(s.codePostal ? [s.codePostal] : [])], s.codePostal ? 2 : 1])).rows[0]?.ok;
    if (!existe) { absentes.push(s.nom); continue; }
    const { rows } = await query<{ id: string; adresse: string | null; cp: string | null }>(
      `SELECT id::text AS id, ${s.adresse} AS adresse, ${s.codePostal ?? 'NULL::text'} AS cp FROM ${s.table}
        WHERE ${s.adresse} IS NOT NULL AND btrim(${s.adresse}) <> ''${s.filtre ? ` AND ${s.filtre}` : ''}`);
    lues.push({ nom: s.nom, lignes: rows.map((r) => ({ source: s.nom, id: Number(r.id), adresse: r.adresse, codePostal: r.cp })) });
  }
  // les cartes de contact (garants, contacts) : lues par leur dépôt, seul à nommer leur table (règle de la migration 304)
  lues.push({ nom: 'cartes de contact', lignes: (await adressesPostalesDesCartes()).map((r) => ({ source: 'cartes de contact', id: r.id, adresse: r.adresse, codePostal: r.codePostal })) });
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const texte = texteRapportDoublons(lues, base, quand) + (absentes.length > 0 ? `\nSources absentes de cette base : ${absentes.join(', ')}.\n` : '');
  const demande = process.argv.find((a) => a.startsWith('--rapport='))?.slice('--rapport='.length) ?? null;
  const chemin = cheminRapport({ nomScript: 'adresses-doublons', demande, prefixe: 'doublons' });
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte.split('\n').slice(0, 18).join('\n'));
  console.log(`\nRapport complet : ${chemin}`);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
