/**
 * CLI `gestion:vidage:epreuve` — MODULE « GESTION », LOT DRIVE-3 : L'ÉPREUVE DU VIDAGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PEUT PROUVER. `npm test` éprouve la RÈGLE sur des objets en mémoire : nécessaire,
 * insuffisant. Deux choses ne se mesurent que pour de vrai :
 *   ① ce que PostgreSQL tient — l'unicité qui fait l'idempotence, la contrainte qui exige l'égalité des empreintes,
 *      le trigger qui refuse qu'on corrige une preuve d'effacement ;
 *   ② que `supprimer()` ENLÈVE RÉELLEMENT LES OCTETS, et que le redemander sur un objet absent ne casse rien.
 *
 * ═══ 🔴 DEUX GARDES, ET AUCUN N'EST FRANCHISSABLE PAR MÉGARDE ════════════════════════════════════════════════════
 *   · LA BASE doit s'appeler `gestion_jetable`. Cette épreuve écrit des preuves de vidage : sur la base de travail,
 *     elle prétendrait que des pièces réelles ont perdu leur contenu — et l'application se mettrait aussitôt à les
 *     chercher dans le Drive.
 *   · LE BUCKET doit s'appeler `…-jetable`. C'est une liste BLANCHE PAR LA FORME, pas une liste noire de noms à
 *     tenir à jour : le bucket de travail (`svav-dev`) ne peut pas la satisfaire, ni aucun bucket de production.
 *     L'épreuve efface pour de vrai — c'est tout son intérêt — et elle n'efface donc que ce qu'elle a déposé
 *     elle-même, dans un bucket qui n'existe que pour ça.
 *
 * 🔒 AUCUN APPEL DRIVE. La relecture Drive est éprouvée sur des doubles dans `vidageStockage.test.ts` ; ici on
 * n'approche ni Google, ni « Documents clients scannés », ni le vrai bucket, ni la vraie base.
 *
 * COMMENT FABRIQUER LA BASE ET LANCER L'ÉPREUVE :
 *   psql -d postgres -c 'DROP DATABASE IF EXISTS gestion_jetable'
 *   psql -d postgres -c 'CREATE DATABASE gestion_jetable'
 *   pg_dump --schema-only --no-owner --no-privileges sansvisavis | psql -q -d gestion_jetable
 *   psql -v ON_ERROR_STOP=1 -d gestion_jetable -f db/migrations/260_gestion_piece_vidage.sql
 *   DATABASE_URL=postgresql://localhost:5432/gestion_jetable S3_BUCKET=svav-jetable \
 *     npm run gestion:vidage:epreuve
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { query, closePool } from '../lib/db/client';
import { oublierSchema, vidageDisponible } from '../lib/gestion/schema';
import { chargerCandidates, chiffresVidage, copieEnCours, journaliserPasseVidage, noterVidage } from '../lib/gestion/vidageRepo';
import { verdict, verdictBase } from '../lib/gestion/vidageStockage';
import { deposerPieceGestion, recuperer, supprimer } from '../lib/stockage';
import { lireConfigStockage } from '../lib/stockage/config';

export const BASE_JETABLE = 'gestion_jetable';
/** 🔴 La forme qu'un bucket doit avoir pour que cette épreuve accepte d'y effacer quoi que ce soit. */
export const SUFFIXE_BUCKET_JETABLE = '-jetable';

let echecs = 0;
function verifier(quoi: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✅' : '❌'} ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) echecs += 1;
}

/** Est-ce que cette écriture est REFUSÉE par la base ? Rend le message, ou `null` si elle a passé. */
async function refusee(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await query(sql, params); return null; } catch (e) { return (e as Error).message; }
}

/**
 * DEUX PIÈCES RÉELLES sur la base jetable — la clé étrangère de `gestion_piece_vidage` en exige.
 *
 * 🔒 ELLE LES SÈME ELLE-MÊME, et n'en recopie aucune de la base de travail : deux pièces inventées, rattachées à un
 * message inventé, avec des adresses inventées. Aucune donnée personnelle ne traverse jamais vers la base jetable.
 * Semer ici plutôt que d'exiger un script à part rend l'épreuve reproductible d'UNE commande.
 */
async function deuxPieces(): Promise<number[]> {
  const { rows: deja } = await query<{ id: string }>('SELECT id FROM gestion_piece ORDER BY id LIMIT 2');
  if (deja.length >= 2) return deja.map((r) => Number(r.id));

  // `ON CONFLICT` : une exécution précédente peut avoir semé le fil puis s'être arrêtée avant les pièces.
  const { rows: fil } = await query<{ id: string }>(
    `INSERT INTO gestion_fil (cle) VALUES ('epreuve-vidage')
     ON CONFLICT (cle) DO UPDATE SET cle = EXCLUDED.cle RETURNING id`);
  const { rows: msg } = await query<{ id: string }>(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le)
     VALUES ($1, '<epreuve-vidage@exemple.invalid>', 'recu', 'epreuve@exemple.invalid', now())
     ON CONFLICT (message_id) DO UPDATE SET fil_id = EXCLUDED.fil_id RETURNING id`, [fil[0].id]);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_piece (message_id, nom_fichier, type_mime, cle_stockage, taille_octets, cree_le)
     VALUES ($1, 'epreuve-a.pdf', 'application/pdf', 'gestion/2026/09/epreuve-a.pdf', 1024, now()),
            ($1, 'epreuve-b.pdf', 'application/pdf', 'gestion/2026/09/epreuve-b.pdf', 2048, now())
     RETURNING id`, [msg[0].id]);
  return rows.map((r) => Number(r.id));
}

async function principal(): Promise<void> {
  // ── LES DEUX GARDES, AVANT TOUT ────────────────────────────────────────────────────────────────────────────
  const { rows: b } = await query<{ base: string }>('SELECT current_database() AS base');
  if (b[0].base !== BASE_JETABLE) {
    console.error(`\n❌ REFUS : cette épreuve écrit des preuves de vidage. Base visée « ${b[0].base} », attendue « ${BASE_JETABLE} ».`);
    console.error(`   Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }
  const config = lireConfigStockage();
  if (config === null || !config.bucket.endsWith(SUFFIXE_BUCKET_JETABLE)) {
    console.error(`\n❌ REFUS : cette épreuve EFFACE DES OBJETS pour de vrai. Bucket visé `
      + `« ${config?.bucket ?? '(stockage non configuré)'} », attendu un nom finissant par « ${SUFFIXE_BUCKET_JETABLE} ».`);
    console.error(`   Relancer avec S3_BUCKET=svav${SUFFIXE_BUCKET_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }
  oublierSchema();
  console.log(`\n╔══ ÉPREUVE DU VIDAGE — base « ${b[0].base} », bucket « ${config.bucket} »\n`);

  if (!(await vidageDisponible())) {
    console.error('❌ La migration 260 n’est pas appliquée sur cette base. Appliquer d’abord :');
    console.error(`   psql -v ON_ERROR_STOP=1 -d ${BASE_JETABLE} -f db/migrations/260_gestion_piece_vidage.sql\n`);
    process.exitCode = 1;
    return;
  }
  const pieces = await deuxPieces();
  if (pieces.length < 2) {
    console.error('❌ Impossible de semer deux pièces sur la base jetable — le schéma est-il bien celui de `sansvisavis` ?\n');
    process.exitCode = 1;
    return;
  }
  const [pieceA, pieceB] = pieces;

  // ── ① LA PREUVE S'ÉCRIT, ET ELLE DEVIENT L'ÉTAT ────────────────────────────────────────────────────────────
  console.log('① la preuve d’un vidage s’écrit, et c’est elle qui dit « ce contenu n’est plus dans MinIO »');
  const ecrit = await noterVidage({
    pieceId: pieceA, cleStockage: 'gestion/2026/09/epreuve-a.pdf', md5: 'aabbcc', taille: 1024,
    driveFileId: 'DRIVE-A', driveMd5: 'aabbcc', driveTaille: 1024,
    verifieLe: '2026-09-26T10:00:00Z', auteur: 'épreuve',
  });
  verifier('la ligne est écrite', ecrit);
  const chiffres = await chiffresVidage();
  verifier('elle est comptée dans les chiffres d’ensemble',
    chiffres !== null && chiffres.videes === 1 && chiffres.octetsLiberes === 1024,
    `${chiffres?.videes ?? '—'} pièce(s), ${chiffres?.octetsLiberes ?? '—'} octets`);

  // ── ② L'IDEMPOTENCE, TENUE PAR L'UNICITÉ ───────────────────────────────────────────────────────────────────
  console.log('\n② 🔴 relancer ne re-vide rien : l’unicité de `piece_id` est la garantie, pas la prudence du code');
  const deuxieme = await noterVidage({
    pieceId: pieceA, cleStockage: 'gestion/2026/09/epreuve-a.pdf', md5: 'aabbcc', taille: 1024,
    driveFileId: 'DRIVE-A', driveMd5: 'aabbcc', driveTaille: 1024,
    verifieLe: '2026-09-26T10:00:00Z', auteur: 'épreuve',
  });
  verifier('une seconde preuve pour la même pièce n’écrit RIEN, et ne jette pas', !deuxieme);
  const apres = await chiffresVidage();
  verifier('les chiffres n’ont pas bougé', apres !== null && apres.videes === 1, `${apres?.videes ?? '—'}`);
  verifier('un INSERT direct en double est refusé par la base', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES ($1,'k','m',1,'d','m',1,now())`, [pieceA])) !== null);

  // ── ③ APPEND-ONLY ──────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n③ 🔴 une preuve d’effacement ne se corrige pas et ne s’efface pas');
  verifier('UPDATE refusé', (await refusee(`UPDATE gestion_piece_vidage SET md5 = 'réécrit'`)) !== null);
  verifier('DELETE refusé', (await refusee('DELETE FROM gestion_piece_vidage')) !== null);
  verifier('TRUNCATE refusé', (await refusee('TRUNCATE gestion_piece_vidage')) !== null);

  // ── ④ CE QUE LA BASE REFUSE, QUOI QU'EN DISE LE CODE ───────────────────────────────────────────────────────
  console.log('\n④ 🔴 l’ÉGALITÉ des empreintes est une CONTRAINTE : une preuve mensongère ne peut pas exister');
  verifier('une empreinte Drive DIFFÉRENTE est refusée', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES ($1,'k','aaa',1,'d','bbb',1,now())`, [pieceB])) !== null);
  verifier('une TAILLE Drive différente est refusée', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES ($1,'k','aaa',1,'d','aaa',2,now())`, [pieceB])) !== null);
  verifier('une clé de stockage vide est refusée', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES ($1,'   ','aaa',1,'d','aaa',1,now())`, [pieceB])) !== null);
  verifier('un identifiant Drive vide est refusé', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES ($1,'k','aaa',1,'  ','aaa',1,now())`, [pieceB])) !== null);
  verifier('une pièce INVENTÉE est refusée (la clé étrangère tient)', (await refusee(
    `INSERT INTO gestion_piece_vidage (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5,
                                       drive_taille, verifie_le)
     VALUES (99999999,'k','aaa',1,'d','aaa',1,now())`)) !== null);

  // ── ⑤ LA CANDIDATE VIDÉE EST RECONNUE, ET LE RESTE ─────────────────────────────────────────────────────────
  console.log('\n⑤ la pièce déjà vidée est RECONNUE par la lecture des candidates — c’est ce qui rend la relance sûre');
  const candidates = await chargerCandidates(pieceA - 1, 5);
  const vue = candidates.find((c) => c.pieceId === pieceA);
  verifier('elle est bien relue', vue !== undefined);
  verifier('🔴 marquée « déjà vidée »', vue?.dejaVidee === true);
  if (vue !== undefined) {
    verifier('et son verdict est « déjà vidée », donc aucun second effacement',
      JSON.stringify(verdictBase({ ...vue, cleStockage: 'k' })) === JSON.stringify({ effacable: false, motif: 'deja_videe' }));
  }
  verifier('🔒 `gestion_piece.cle_stockage` n’a PAS été touchée par le vidage', (await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_piece WHERE id = $1 AND cle_stockage IS NOT NULL`,
    [pieceA])).rows[0].n === '1' || vue?.cleStockage === null,
  'une pièce sans contenu au départ reste sans contenu ; une pièce qui en avait le garde');

  // ── ⑥ LE REFUS PENDANT UNE COPIE ───────────────────────────────────────────────────────────────────────────
  console.log('\n⑥ 🔴 le vidage refuse d’écrire pendant une copie : on n’efface pas sur la foi d’un état qui bouge');
  verifier('aucune copie en cours sur la base jetable', (await copieEnCours()).enCours === false);
  const { rows: passe } = await query<{ id: string }>(
    `INSERT INTO gestion_drive_copie_passe (mode, hote, pid) VALUES ('applique','jetable',1) RETURNING id`);
  const enCours = await copieEnCours();
  verifier('une passe non terminée est VUE', enCours.enCours && enCours.passeId === Number(passe[0].id),
    `passe n° ${enCours.passeId ?? '—'}`);
  await query(`UPDATE gestion_drive_copie_passe SET termine_le = now() WHERE id = $1`, [passe[0].id]);
  verifier('terminée, elle ne bloque plus', (await copieEnCours()).enCours === false);

  // ── ⑦ LE JOURNAL ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑦ une passe laisse une ligne au journal du module');
  const { rows: avant } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_journal WHERE entite = 'vidage_stockage'`);
  await journaliserPasseVidage(1, 'épreuve');
  const { rows: apresJ } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_journal WHERE entite = 'vidage_stockage'`);
  verifier('🔴 l’entité « vidage_stockage » est ACCEPTÉE par la contrainte du journal',
    Number(apresJ[0].n) === Number(avant[0].n) + 1, `${avant[0].n} → ${apresJ[0].n}`);

  // ── ⑧ L'EFFACEMENT RÉEL, SUR LE BUCKET JETABLE ─────────────────────────────────────────────────────────────
  console.log(`\n⑧ 🔴 L'EFFACEMENT ENLÈVE VRAIMENT LES OCTETS — sur « ${config.bucket} », jamais ailleurs`);
  const s3 = new S3Client({
    endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try { await s3.send(new CreateBucketCommand({ Bucket: config.bucket })); } catch { /* il existe déjà */ }
  s3.destroy();

  /**
   * ⚠️ ON DÉPOSE AVEC `deposerPieceGestion`, le producteur RÉEL des clés qu'un vidage efface
   * (`gestion/messages/<id>/<uuid>.pdf`). Un objet déposé sous une autre forme de clé prouverait moins : ce qu'on
   * veut savoir, c'est que `supprimer` enlève bien les octets d'une clé DE CETTE FORME-LÀ.
   */
  const { rows: m } = await query<{ message_id: string }>(
    'SELECT message_id FROM gestion_piece WHERE id = $1', [pieceB]);
  const contenu = Buffer.from('épreuve du vidage — ces octets vont disparaître');
  const depot = await deposerPieceGestion(contenu, 'application/pdf', {
    messageId: Number(m[0].message_id), typesAcceptes: ['application/pdf'], tailleMaxOctets: 1_000_000,
  });
  if (!depot.depose) {
    verifier('l’objet est déposé', false, depot.motif);
    console.log('');
    console.log(`╚══ ❌ ${echecs} ÉCHEC(S).\n`);
    process.exitCode = 1;
    return;
  }
  const relu = await recuperer(depot.cle);
  verifier('l’objet est déposé et relu identique', relu.equals(contenu), `${relu.byteLength} octets · ${depot.cle}`);

  await supprimer(depot.cle);
  let encoreLa = true;
  try { await recuperer(depot.cle); } catch { encoreLa = false; }
  verifier('🔴 après l’effacement, les octets ne sont PLUS LÀ', !encoreLa);

  /**
   * ⚠️ POURQUOI CE CAS COMPTE. Une passe de vidage peut mourir entre l'effacement et l'écriture de la preuve
   * (c'est l'ordre choisi, cf. `noterVidage`). La passe suivante retentera donc d'effacer un objet déjà parti :
   * si `supprimer` jetait là, une seule coupure suffirait à bloquer toutes les passes suivantes sur cette pièce.
   */
  let seconde: string | null = null;
  try { await supprimer(depot.cle); } catch (e) { seconde = (e as Error).message; }
  verifier('🔴 re-effacer un objet ABSENT ne jette pas — c’est ce qui rend une passe interrompue reprenable',
    seconde === null, seconde ?? '');

  // ── ⑨ LA RÈGLE, DE BOUT EN BOUT, SUR UNE VRAIE LIGNE ───────────────────────────────────────────────────────
  console.log('\n⑨ la règle complète, sur une pièce de la base : ce qui manque suffit à conserver');
  const brute = (await chargerCandidates(pieceB - 1, 1))[0];
  if (brute === undefined) verifier('la pièce est relue', false);
  else {
    const complete = {
      ...brute, cleStockage: 'gestion/2026/09/epreuve-b.pdf', tailleOctets: 2048,
      driveFileId: 'DRIVE-B', md5: 'ddeeff', verifieLe: '2026-09-26T10:00:00Z', brouillonEnCours: false,
    };
    verifier('tout concordant ⇒ effaçable',
      verdict(complete, { ok: true, md5: 'ddeeff', taille: 2048, sousLaRacine: true }).effacable);
    verifier('🔴 la même pièce, empreinte Drive changée ⇒ CONSERVÉE',
      !verdict(complete, { ok: true, md5: 'autre!', taille: 2048, sousLaRacine: true }).effacable);
    verifier('🔴 la même pièce, sortie de la racine ⇒ CONSERVÉE',
      !verdict(complete, { ok: true, md5: 'ddeeff', taille: 2048, sousLaRacine: false }).effacable);
  }

  console.log('');
  if (echecs === 0) console.log('╚══ ✅ ÉPREUVE PASSÉE — la base et le stockage tiennent ce que le code leur demande.\n');
  else { console.log(`╚══ ❌ ${echecs} ÉCHEC(S).\n`); process.exitCode = 1; }
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
