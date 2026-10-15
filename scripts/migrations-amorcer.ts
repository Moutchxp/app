/**
 * migrations-amorcer.ts — inscrit au registre `svav_migration` (migration 358) les migrations DÉJÀ appliquées.
 *
 * Le registre n'existait pas : toutes les migrations jusqu'ici sont passées à la main. Avant la première mise à jour
 * automatique, il faut y inscrire celles qui sont déjà en base, sans quoi la mise à jour les rejouerait — et la plupart
 * ne supportent pas d'être rejouées. C'est l'étape délicate : ce script AFFICHE d'abord, et n'écrit que sur demande
 * explicite, avec l'empreinte de la liste affichée (ce qui est inscrit = ce qui a été lu).
 *
 *   npm run migrations:amorcer -- --jusqua=357
 *       → AFFICHE, sans rien écrire : chaque migration 001→357 (mode, empreinte), et la PREUVE qu'elle est en base :
 *         tables qu'elle crée et colonnes qu'elle ajoute, retrouvées ou non dans la base. Puis l'empreinte de la liste.
 *   npm run migrations:amorcer -- --jusqua=357 --appliquer --empreinte=<celle affichée>
 *       → UNE transaction : crée la table (358) et inscrit 001→357 (origine « amorcage ») puis 358.
 *
 * MIGRATIONS « À EXAMINER » (un élément qu'elles créent est introuvable en base — constaté le 15/10/2026 sur le Mac :
 * 148, 212, 216, 262 jamais appliquées) : l'inscription est REFUSÉE tant que chacune n'a pas reçu une décision :
 *   --ecarter=148,212   inscrites « ecartee » : jamais appliquées, la mise à jour ne les tente pas et le rappelle ;
 *   --malgre=262        inscrites « amorcage » malgré tout (ex. table renommée depuis par une voie non détectée).
 * Ces décisions entrent dans l'empreinte : il faut les donner dès l'affichage, puis à l'identique avec --appliquer.
 *
 * Refuse si le registre contient déjà des lignes (l'amorçage ne se fait qu'une fois). Les migrations au-delà de
 * --jusqua (hors 358) sont laissées à la mise à jour : elles seront appliquées comme nouvelles.
 * Ne lit aucune table LiDAR. Ne modifie aucune migration.
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closePool, query, withTransaction } from '../app/lib/db/client';
import { analyserMigration, empreinte, type AnalyseMigration } from '../app/lib/ops/migrationsNouvelles';

const FICHIER_REGISTRE = '358_svav_migration.sql';
const DOSSIER = path.join(process.cwd(), 'db/migrations');

function arg(nom: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  return a?.slice(nom.length + 3);
}

function sortir(code: number, message: string): never {
  console.error(message);
  process.exit(code);
}

async function main() {
  const jusqua = Number(arg('jusqua'));
  const appliquer = process.argv.includes('--appliquer');
  if (!Number.isInteger(jusqua) || jusqua < 1) sortir(2, 'Indiquer --jusqua=<numéro de la dernière migration appliquée en base> (ex. --jusqua=357).');

  const analyses = readdirSync(DOSSIER).filter((n) => n.endsWith('.sql')).sort()
    .map((n) => analyserMigration({ fichier: n, contenu: readFileSync(path.join(DOSSIER, n), 'utf8') }));
  const registre = analyses.find((a) => a.fichier === FICHIER_REGISTRE);
  if (!registre) sortir(2, `${FICHIER_REGISTRE} introuvable dans db/migrations.`);
  if (jusqua >= (registre.numero as number)) sortir(2, `--jusqua doit être inférieur à ${registre.numero} (la migration du registre).`);
  const horsFormat = analyses.filter((a) => a.numero === null);
  if (horsFormat.length) sortir(2, `Noms hors format : ${horsFormat.map((a) => a.fichier).join(', ')}`);

  const existe = (await query<{ t: string | null }>(`SELECT to_regclass('public.svav_migration')::text AS t`)).rows[0].t;
  if (existe) {
    const n = (await query<{ n: string }>('SELECT count(*) AS n FROM svav_migration')).rows[0].n;
    if (Number(n) > 0) sortir(0, `Registre déjà amorcé (${n} lignes) — rien à faire.`);
  }

  const amorcees = analyses.filter((a) => (a.numero as number) <= jusqua && a.fichier !== FICHIER_REGISTRE);
  const laissees = analyses.filter((a) => (a.numero as number) > jusqua && a.fichier !== FICHIER_REGISTRE);

  // ── Preuve : tables créées et colonnes ajoutées, retrouvées en base ? ──
  const tables = [...new Set(amorcees.flatMap((a) => a.tablesCreees))];
  const presentes = new Set((await query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = ANY($1)`, [tables])).rows.map((r) => r.relname));
  const paires = amorcees.flatMap((a) => a.colonnesAjoutees);
  const colonnes = new Set((await query<{ k: string }>(
    `SELECT table_name || '.' || column_name AS k FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`, [[...new Set(paires.map((p) => p.table))]])).rows.map((r) => r.k));
  const supprimeePar = new Map<string, number>();
  for (const a of amorcees) for (const t of a.tablesSupprimees) supprimeePar.set(t, a.numero as number);

  const numeros = (nom: string): number[] => (arg(nom) ?? '').split(',').filter(Boolean).map(Number);
  const ecarter = new Set(numeros('ecarter'));
  const malgre = new Set(numeros('malgre'));
  for (const n of [...ecarter, ...malgre]) {
    if (!amorcees.some((a) => a.numero === n)) sortir(2, `--ecarter/--malgre : ${n} n'est pas une migration de la liste.`);
    if (ecarter.has(n) && malgre.has(n)) sortir(2, `${n} ne peut pas être à la fois écartée et inscrite malgré tout.`);
  }

  const aExaminer: { numero: number; texte: string }[] = [];
  const preuve = (a: AnalyseMigration): string => {
    const manque: string[] = [];
    const explique: string[] = [];
    for (const t of a.tablesCreees) {
      if (presentes.has(t)) continue;
      const par = supprimeePar.get(t);
      (par && par > (a.numero as number) ? explique : manque).push(par && par > (a.numero as number) ? `table ${t} (supprimée par ${par})` : `table ${t}`);
    }
    for (const p of a.colonnesAjoutees) {
      if (colonnes.has(`${p.table}.${p.colonne}`)) continue;
      const par = supprimeePar.get(p.table);
      (par && par > (a.numero as number) ? explique : manque).push(`colonne ${p.table}.${p.colonne}${par && par > (a.numero as number) ? ` (table supprimée par ${par})` : ''}`);
    }
    const total = a.tablesCreees.length + a.colonnesAjoutees.length;
    if (manque.length) aExaminer.push({ numero: a.numero as number, texte: `${a.fichier} : absent de la base → ${manque.join(', ')}` });
    if (total === 0) return 'rien à vérifier (pas de création de table ni d’ajout de colonne)';
    const ok = total - manque.length - explique.length;
    return `${ok}/${total} retrouvés${explique.length ? ` · ${explique.length} supprimés plus tard` : ''}${manque.length ? ` · ${manque.length} ABSENTS` : ''}`;
  };

  console.log(`== Migrations à inscrire comme DÉJÀ APPLIQUÉES (001 → ${String(jusqua).padStart(3, '0')}) : ${amorcees.length} ==`);
  const statut = (a: AnalyseMigration) => (ecarter.has(a.numero as number) ? '[ÉCARTÉE] ' : malgre.has(a.numero as number) ? '[MALGRÉ] ' : '');
  for (const a of amorcees) console.log(`${a.fichier.padEnd(58)} ${a.mode.padEnd(19)} ${a.sha256.slice(0, 12)}  ${statut(a)}${preuve(a)}`);
  const sansDecision = aExaminer.filter((x) => !ecarter.has(x.numero) && !malgre.has(x.numero));
  const verifiables = amorcees.filter((a) => a.tablesCreees.length + a.colonnesAjoutees.length > 0).length;
  console.log(`\n== Bilan ==`);
  console.log(`${amorcees.length} migrations · ${verifiables} vérifiables par leurs tables/colonnes · ${aExaminer.length} à examiner · ${amorcees.length - verifiables} sans élément vérifiable`);
  if (aExaminer.length) {
    console.log('\n== À EXAMINER avant d’inscrire (un élément créé par la migration est introuvable) ==');
    for (const x of aExaminer) console.log(`  ${ecarter.has(x.numero) ? '[ÉCARTÉE] ' : malgre.has(x.numero) ? '[MALGRÉ] ' : '[SANS DÉCISION] '}${x.texte}`);
  }
  if (ecarter.size) console.log(`\nÉcartées (inscrites « ecartee », jamais appliquées) : ${[...ecarter].sort((x, y) => x - y).join(', ')}`);
  if (malgre.size) console.log(`Inscrites malgré l'absence : ${[...malgre].sort((x, y) => x - y).join(', ')}`);
  console.log(`\n== Laissées à la mise à jour (appliquées plus tard comme nouvelles) : ${laissees.length} ==`);
  for (const a of laissees) console.log(`  ${a.fichier}`);

  const origine = (a: AnalyseMigration) => (ecarter.has(a.numero as number) ? 'ecartee' : 'amorcage');
  const emp = empreinte(`${amorcees.map((a) => `${a.fichier} ${a.sha256} ${origine(a)}`).join('\n')}\njusqua=${jusqua}`).slice(0, 16);
  console.log(`\nEmpreinte de cette liste : ${emp}`);
  const decisions = `${ecarter.size ? ` --ecarter=${[...ecarter].join(',')}` : ''}${malgre.size ? ` --malgre=${[...malgre].join(',')}` : ''}`;

  if (sansDecision.length) {
    console.log(`\nRIEN ÉCRIT. ${sansDecision.length} migration(s) à examiner SANS DÉCISION (${sansDecision.map((x) => x.numero).join(', ')}) :`
      + ' relancer avec --ecarter=… (jamais appliquées) ou --malgre=… (inscrites quand même).');
    if (appliquer) process.exitCode = 2;
    return;
  }
  if (!appliquer) {
    console.log(`\nRIEN ÉCRIT. Pour inscrire exactement cette liste :\n  npm run migrations:amorcer -- --jusqua=${jusqua}${decisions} --appliquer --empreinte=${emp}`);
    return;
  }
  if (arg('empreinte') !== emp) sortir(2, `Empreinte attendue ${emp}, reçue « ${arg('empreinte') ?? ''} » : la liste a changé ou n'a pas été lue. RIEN ÉCRIT.`);

  const sql358 = readFileSync(path.join(DOSSIER, FICHIER_REGISTRE), 'utf8');
  const inscrites = await withTransaction(async (q) => {
    await q(sql358);
    const r = await q(
      `INSERT INTO svav_migration (fichier, sha256, origine)
       SELECT f, s, o FROM unnest($1::text[], $2::text[], $3::text[]) AS u(f, s, o)`,
      [
        [...amorcees.map((a) => a.fichier), registre.fichier],
        [...amorcees.map((a) => a.sha256), registre.sha256],
        [...amorcees.map(origine), 'amorcage'],
      ],
    );
    return r.rowCount;
  });
  console.log(`\nINSCRIT : ${inscrites} lignes dans svav_migration (${amorcees.length - ecarter.size} déjà appliquées, ${ecarter.size} écartées, + ${FICHIER_REGISTRE}).`);
}

main()
  .catch((e) => { console.error('ERREUR', (e as Error)?.message); process.exitCode = 1; })
  .finally(() => closePool());
