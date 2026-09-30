/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — CHRONOMÈTRE DU RANGEMENT D'UNE PIÈCE ═════════════════════════════════
 *
 * Demande d'Arno : « MESURE : chronomètre lâcher → “Rangée” confirmé, et découpe chaque étape (lecture des
 * octets depuis MinIO, la copie Drive ou Gmail ; vérification de sécurité ; envoi ; journal). Tableau avant /
 * après. »
 *
 * 🔴 IL MESURE LE VRAI CHEMIN, PAS UNE IMITATION. Les mêmes fonctions que la route : le même jeton délégué, la
 * même vérification de cible, le même verdict d'archive, le même dépôt, le même journal. Un banc qui appellerait
 * des doublures mesurerait la doublure.
 *
 * ⚠️ IL ÉCRIT DANS LE DRIVE — c'est le geste qu'on mesure. Il dépose dans le dossier qu'on lui donne, sous un nom
 * préfixé « _MESURE », et il REDÉPOSE la même pièce à chaque voie : c'est au lanceur de nettoyer. Il ne supprime
 * rien lui-même (l'application ne supprime pas).
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/mesurer-depot-drive.ts --piece=26994 --dossier=<id> [--voies=octets,copie]
 */
import { performance } from 'node:perf_hooks';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { verifierCibleDepot } from '../lib/gestion/cibleDepot';
import { verdictDeposer } from '../lib/gestion/driveVerdict';
import { lireDossier, memoiserLecture, deposerFichier } from '../lib/gestion/drive';
import { copierFichier } from '../lib/gestion/driveMouvement';
import { lirePieceAServir } from '../lib/gestion/carteRepo';
import { recuperer } from '../lib/stockage';
import { lireDepotExistant } from '../lib/gestion/driveRepo';

/**
 * ⚠️ LE COMPTE AU NOM DUQUEL ON AGIT. Le dépôt depuis l'écran part avec le jeton DU COLLABORATEUR — c'est Google
 * qui applique ses droits, dossier par dossier. Mesurer avec un autre compte mesurerait d'autres droits, donc
 * d'autres temps de réponse.
 */
const COMPTE = process.env.MESURE_COMPTE ?? 'gestion@criterimmo.fr';

function arg(nom: string): string {
  const t = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return t === undefined ? '' : t.slice(nom.length + 3);
}

/** Chronomètre UNE étape. Rend la valeur ET le temps : mesurer ne doit pas obliger à réécrire l'appel. */
async function etape<T>(nom: string, f: () => Promise<T>, lignes: [string, number][]): Promise<T> {
  const t0 = performance.now();
  try {
    return await f();
  } finally {
    lignes.push([nom, Math.round(performance.now() - t0)]);
  }
}

function tableau(titre: string, lignes: readonly [string, number][]): void {
  const total = lignes.reduce((t, [, ms]) => t + ms, 0);
  const large = Math.max(...lignes.map(([n]) => n.length), 'TOTAL'.length);
  console.log(`\n── ${titre} ${'─'.repeat(Math.max(0, 60 - titre.length))}`);
  for (const [nom, ms] of lignes) console.log(`   ${nom.padEnd(large)}  ${String(ms).padStart(6)} ms`);
  console.log(`   ${'TOTAL'.padEnd(large)}  ${String(total).padStart(6)} ms`);
}

async function main(): Promise<void> {
  const pieceId = Number(arg('piece'));
  const dossierId = arg('dossier').trim();
  const voies = (arg('voies') || 'octets,copie').split(',').map((v) => v.trim());
  if (!Number.isInteger(pieceId) || pieceId <= 0 || dossierId === '') {
    console.error('usage : --piece=<id> --dossier=<idDrive> [--voies=octets,copie]');
    process.exit(2);
  }

  const commun: [string, number][] = [];
  const jeton = await etape('jeton délégué (Google)', () => jetonPourSubject(COMPTE, { fetch }), commun);
  if (!jeton.ok) { console.error('jeton indisponible :', jeton.motif); process.exit(1); }

  const lire = memoiserLecture((id: string) => lireDossier(jeton.jeton, id, { fetch }));
  /* 🔴 EN PARALLÈLE, comme la route depuis ce lot : deux questions indépendantes posées à Google. Les mesurer en
     série mesurerait un chemin que plus personne n'emprunte. */
  await etape('vérifications de sécurité (cible + archive, en parallèle)', async () => {
    const [c, v] = await Promise.all([
      verifierCibleDepot(dossierId, lire),
      verdictDeposer(COMPTE, jeton.jeton, dossierId),
    ]);
    if (!c.ok) throw new Error(c.motif);
    if (!v.deposer) throw new Error(v.motif ?? 'dépôt refusé');
  }, commun);
  const piece = await etape('lecture de la pièce (base)', () => lirePieceAServir(pieceId), commun);
  if (piece === null) { console.error('pièce inconnue'); process.exit(1); }
  await etape('dépôt déjà existant ? (base)', () => lireDepotExistant(pieceId, dossierId), commun);

  tableau('COMMUN AUX DEUX VOIES (vérifications + lectures)', commun);
  const totalCommun = commun.reduce((t, [, ms]) => t + ms, 0);

  const nom = `_MESURE ${Date.now()} ${piece.nomFichier}`;

  if (voies.includes('octets')) {
    const l: [string, number][] = [];
    const octets = await etape('lecture des octets (MinIO)', async () => new Uint8Array(await recuperer(piece.cleStockage)), l);
    await etape(`téléversement Drive (${(octets.byteLength / 1024).toFixed(0)} ko)`, async () => {
      const r = await deposerFichier(jeton.jeton, { nom: `${nom} [octets]`, typeMime: piece.typeMime, octets, dossierId }, { fetch });
      if (!r.ok) throw new Error(r.motif);
    }, l);
    tableau('VOIE ① — NOS OCTETS (avant ce lot : la voie ordinaire)', l);
    console.log(`   ⇒ avec le commun : ${totalCommun + l.reduce((t, [, ms]) => t + ms, 0)} ms`);
  }

  if (voies.includes('copie') && (piece.driveFileId ?? '') !== '') {
    const l: [string, number][] = [];
    await etape('copie Drive → Drive (files.copy)', async () => {
      const r = await copierFichier(jeton.jeton,
        { id: piece.driveFileId as string, parentCible: dossierId, nom: `${nom} [copie]` }, { fetch });
      if (!r.ok) throw new Error(r.motif);
    }, l);
    tableau('VOIE ② — COPIE DRIVE → DRIVE (après ce lot : la voie ordinaire)', l);
    console.log(`   ⇒ avec le commun : ${totalCommun + l.reduce((t, [, ms]) => t + ms, 0)} ms`);
  } else if (voies.includes('copie')) {
    console.log('\n   (voie ② impossible : cette pièce n’a aucune copie Drive prouvée)');
  }
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
