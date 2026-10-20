/**
 * CLI `gestion:rattachements:reprise` — LOCATION / GESTION, MIGRATION 393 : LA REPRISE DES GARANTS ET CONTACTS EXISTANTS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Arno (20/10/2026, point 4) : « pour chaque carte côté locataire, s'il y a exactement un bail en cours avec un seul
 * locataire, proposer ce rattachement ; sinon (colocation, plusieurs baux, bien libre), la lister dans un rapport “à
 * rattacher à la main”, avec chiffres et liste. Rien n'est supprimé. »
 *
 * 🔴 À BLANC PAR DÉFAUT : elle LIT, classe et imprime ; rien n'est écrit. `--reel` écrit les rattachements proposés, dans UNE
 *    transaction (un garant → `gestion_bail_garant` ; un autre contact → le locataire de sa carte, seulement
 *    sur une carte encore libre), chacun au journal. Rien n'est jamais supprimé ni remplacé.
 * 🔴 ELLE REFUSE DE TOURNER SANS LA MIGRATION 393.
 * 🔒 AUCUNE DONNÉE PERSONNELLE dans la sortie : des identifiants (carte, bien, bail, locataire), la qualité, des comptes.
 *
 * COMMENT LA LANCER (à blanc) :
 *   DATABASE_URL=postgresql://localhost:5432/svav_recette npm run gestion:rattachements:reprise
 *   … -- --csv=.captures/<lot>/reprise.csv   (la liste complète en CSV, en plus de la sortie)
 *   … -- --reel                               (écrit les rattachements proposés — seulement sur l'accord d'Arno)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { closePool, query, withTransaction } from '../lib/db/client';
import { garantsDisponibles } from '../lib/location/bailRepo';
import { classerReprise, LIBELLE_MOTIF_MAIN, type ClasseReprise, type MotifMain } from '../lib/location/rattachements';
import { ecrireRattachementsDans } from '../lib/location/rattachementsRepo';
import { cartesLocataireSansRattachement } from '../lib/gestion/partieCategorieRepo';

const AUTEUR = { id: null, libelle: 'reprise des rattachements (migration 393)' };

interface CarteLue { id: number; lotId: number | null; lotNumero: string | null; qualite: string | null }

async function principal(): Promise<void> {
  const args = process.argv.slice(2);
  const reel = args.includes('--reel');
  const csv = args.find((a) => a.startsWith('--csv='))?.slice('--csv='.length) ?? null;
  const { rows: b } = await query<{ base: string }>('SELECT current_database() AS base');
  if (!(await garantsDisponibles())) {
    console.error(`\n❌ REFUS : la migration 393 n'est pas appliquée sur « ${b[0].base} ».\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n╔══ REPRISE DES RATTACHEMENTS (393) sur « ${b[0].base} » — ${reel ? '🔴 RÉEL : écrit les rattachements proposés' : 'À BLANC : rien n’est écrit'}\n`);

  // Les cartes côté locataire, vivantes, sans aucun rattachement (ni locataire, ni garantie en cours).
  const cartes = await cartesLocataireSansRattachement();
  // Les baux EN COURS de chaque bien : un bail du bien (ou dont une occupation est sur ce lot), avec ses locataires en place.
  const { rows: baux } = await query<{ lot_id: string; bail_id: string; locataires: string[] }>(
    `SELECT x.lot_id::text, x.bail_id::text, array_agg(DISTINCT o.locataire_id::text) AS locataires
       FROM (SELECT b.id AS bail_id, b.lot_id FROM gestion_bail b
             UNION SELECT o.bail_id, o.lot_id FROM gestion_annuaire_occupation o WHERE o.bail_id IS NOT NULL AND o.lot_id IS NOT NULL) x
       JOIN gestion_annuaire_occupation o ON o.bail_id = x.bail_id AND o.sortie IS NULL
      GROUP BY x.lot_id, x.bail_id`);
  const parLot = new Map<number, { bailId: number; locataires: number[] }[]>();
  for (const r of baux) {
    const l = parLot.get(Number(r.lot_id)) ?? [];
    l.push({ bailId: Number(r.bail_id), locataires: r.locataires.map(Number) });
    parLot.set(Number(r.lot_id), l);
  }

  const lues: (CarteLue & { c: ClasseReprise })[] = cartes.map((r) => {
    const carte = { id: r.id, lotId: r.lotId, lotNumero: r.numero, qualite: r.qualite };
    return { ...carte, c: classerReprise(carte, carte.lotId === null ? [] : parLot.get(carte.lotId) ?? []) };
  });
  const proposees = lues.filter((x) => x.c.sorte === 'proposee');
  const main = lues.filter((x) => x.c.sorte === 'main');
  const parMotif = new Map<MotifMain, number>();
  for (const x of main) if (x.c.sorte === 'main') parMotif.set(x.c.motif, (parMotif.get(x.c.motif) ?? 0) + 1);

  console.log(`  Cartes côté locataire sans rattachement : ${lues.length}`);
  console.log(`  ① rattachement PROPOSÉ (un bail en cours, un seul locataire) : ${proposees.length}`
    + ` (dont ${proposees.filter((x) => x.c.sorte === 'proposee' && x.c.garant).length} garant(s))`);
  console.log(`  ② À RATTACHER À LA MAIN : ${main.length}`);
  for (const [m, n] of [...parMotif].sort((a, z) => z[1] - a[1])) console.log(`       · ${LIBELLE_MOTIF_MAIN[m]} : ${n}`);
  console.log('\n  Liste — à rattacher à la main (carte · bien · motif · qualité) :');
  for (const x of main) {
    if (x.c.sorte !== 'main') continue;
    console.log(`       carte ${x.id} · bien ${x.lotId ?? '—'}${x.lotNumero ? ` (réf. ${x.lotNumero})` : ''} · ${LIBELLE_MOTIF_MAIN[x.c.motif]} · ${x.qualite ?? 'qualité non renseignée'}`);
  }
  console.log('\n  Liste — proposées (carte · bien · bail · locataire · garant/contact) :');
  for (const x of proposees) {
    if (x.c.sorte !== 'proposee') continue;
    console.log(`       carte ${x.id} · bien ${x.lotId} · bail ${x.c.bailId} · locataire ${x.c.locataireId} · ${x.c.garant ? 'garant' : 'contact'}`);
  }
  if (csv !== null) {
    const lignes = ['carte;bien;reference;classe;motif;bail;locataire;qualite',
      ...lues.map((x) => [x.id, x.lotId ?? '', x.lotNumero ?? '', x.c.sorte, x.c.sorte === 'main' ? x.c.motif : (x.c.garant ? 'garant' : 'contact'),
        x.c.sorte === 'proposee' ? x.c.bailId : '', x.c.sorte === 'proposee' ? x.c.locataireId : '', (x.qualite ?? '').replace(/;/g, ',')].join(';'))];
    writeFileSync(csv, `${lignes.join('\n')}\n`);
    console.log(`\n  CSV écrit : ${csv}`);
  }

  if (!reel) { console.log('\n╚══ À BLANC : rien n’a été écrit. `--reel` écrirait les rattachements proposés.\n'); return; }
  const n = await withTransaction(async (q) => {
    let total = 0;
    for (const x of proposees) {
      if (x.c.sorte !== 'proposee') continue;
      total += await ecrireRattachementsDans(q, x.c.bailId, [{ carteId: x.id,
        r: { garant: x.c.garant, garantit: x.c.garant ? [0] : [], locataire: x.c.garant ? null : 0 } }], [x.c.locataireId], AUTEUR);
    }
    return total;
  });
  console.log(`\n╚══ RÉEL : ${n} rattachement(s) écrit(s), au journal. Rien n’a été supprimé.\n`);
}

principal().catch((e: unknown) => { console.error(e); process.exitCode = 1; }).finally(() => { void closePool(); });
