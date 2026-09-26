/**
 * CLI `gestion:vidage:preuve-drive` — MODULE « GESTION », LOT DRIVE-3 : LE CHEMIN DE LECTURE DRIVE, ÉPROUVÉ EN RÉEL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE PROUVE, ET POURQUOI IL FAUT LE PROUVER AVANT LE PREMIER VIDAGE. Après un vidage, le contenu d'une
 * pièce n'existe plus QUE dans le Drive : si le chemin de lecture Drive était faux, on ne s'en apercevrait qu'après
 * avoir effacé. On l'éprouve donc TANT QUE LES DEUX COPIES EXISTENT : on lit la pièce dans le Drive, on lit la même
 * pièce dans MinIO, et on compare les empreintes. Si elles sont identiques, l'application peut servir depuis le Drive
 * sans que personne voie la différence.
 *
 * 🔒 LECTURE SEULE, DE BOUT EN BOUT. Elle appelle les MÊMES fonctions que la route, dans le même ordre :
 *   `lirePieceAServir` (base) → `lireContenuDrive` (GET ?alt=media) → `recuperer` (GET S3) → comparaison d'empreintes.
 * Aucun effacement MinIO. Aucune écriture Drive. Aucune écriture en base. « Documents clients scannés » n'est pas
 * approché : les identifiants viennent de `gestion_piece_drive` avec `origine = 'copie'`, donc de fichiers que le
 * programme a lui-même créés dans « 00 Arrivée des mails ».
 *
 * 🔒 ELLE N'AFFICHE AUCUN NOM DE FICHIER : un nom de pièce porte souvent le nom d'une personne. Identifiants,
 * tailles et empreintes suffisent à la démonstration.
 *
 * USAGE :
 *   npm run gestion:vidage:preuve-drive            # 3 pièces, les plus récemment vérifiées
 *   npm run gestion:vidage:preuve-drive -- --combien=5
 *   npm run gestion:vidage:preuve-drive -- --piece=1234
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { createHash } from 'node:crypto';
import { query, closePool } from '../lib/db/client';
import { lirePieceAServir } from '../lib/gestion/carteRepo';
import { lireContenuDrive } from '../lib/gestion/pieceDriveLecture';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { vidageDisponible } from '../lib/gestion/schema';
import { recuperer } from '../lib/stockage';

const COMPTE_DRIVE = 'gestion@criterimmo.fr';
const P = '   ';

function entier(argv: readonly string[], nom: string, defaut: number): number {
  const brut = argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? '';
  if (brut.trim() === '') return defaut;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : defaut;
}

/**
 * Les pièces présentes AUX DEUX ENDROITS : contenu MinIO encore là, copie Drive vérifiée.
 *
 * ⚠️ LA SONDE EST FAITE AVANT D'ÉMETTRE LE SQL. Cette preuve doit tourner AVANT que la migration 260 soit appliquée
 * — c'est même tout son intérêt : elle éprouve le chemin de lecture avant qu'un seul octet ait été effacé. Nommer
 * `gestion_piece_vidage` sans l'avoir sondée ferait échouer la commande là où elle doit justement fonctionner.
 */
async function choisir(combien: number, precise: number | null): Promise<number[]> {
  if (precise !== null) return [precise];
  const avecVidage = await vidageDisponible();
  const { rows } = await query<{ id: string }>(
    `SELECT p.id
       FROM gestion_piece p
       JOIN gestion_piece_drive d
         ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
      WHERE p.cle_stockage IS NOT NULL AND btrim(p.cle_stockage) <> ''
        AND p.taille_octets IS NOT NULL
        ${avecVidage
    // Pas encore vidée : il FAUT que MinIO ait encore le contenu, sinon il n'y a rien à comparer.
    ? 'AND NOT EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : ''}
      ORDER BY d.verifie_le DESC
      LIMIT $1`, [combien]);
  return rows.map((r) => Number(r.id));
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const combien = entier(argv, 'combien', 3);
  const precise = argv.some((a) => a.startsWith('--piece=')) ? entier(argv, 'piece', 0) : null;

  console.log('\n╔══ PREUVE DU CHEMIN DE LECTURE DRIVE (lot DRIVE-3) — lecture seule, aucun effacement');
  console.log('║  On lit la MÊME pièce des deux côtés et on compare les empreintes.\n');

  const ids = await choisir(combien, precise === 0 ? null : precise);
  if (ids.length === 0) {
    console.log('   Aucune pièce ne remplit les conditions (contenu MinIO présent ET copie Drive vérifiée).\n');
    return;
  }

  const jeton = await jetonPourSubject(COMPTE_DRIVE, { fetch });
  if (!jeton.ok) {
    console.error(`❌ Impossible d’obtenir un jeton Drive : ${jeton.motif}\n`);
    process.exitCode = 1;
    return;
  }

  let concordantes = 0;
  for (const id of ids) {
    console.log(`── pièce n° ${id}`);
    const piece = await lirePieceAServir(id);
    if (piece === null) { console.log(`${P}❌ introuvable, ou aucun contenu déposé`); continue; }
    if (piece.driveFileId === null) { console.log(`${P}❌ aucune copie Drive vérifiée enregistrée`); continue; }

    console.log(`${P}type ................ ${piece.typeMime ?? '(inconnu)'}`);
    console.log(`${P}stockage vidé ? ..... ${piece.stockageVide ? 'OUI (le contenu a déjà quitté MinIO)' : 'non'}`);

    // ① LE DRIVE — exactement l'appel de la route : GET ?alt=media, empreinte recalculée sur les octets reçus.
    const t0 = Date.now();
    const drive = await lireContenuDrive(piece.driveFileId, jeton.jeton, { fetch });
    const msDrive = Date.now() - t0;
    if (!drive.ok) { console.log(`${P}❌ lecture Drive impossible : ${drive.motif}`); process.exitCode = 1; continue; }
    console.log(`${P}Drive ............... ${drive.octets.byteLength} octets · md5 ${drive.md5} · ${msDrive} ms`);

    // ② MinIO — la source d'origine, tant qu'elle existe.
    if (piece.stockageVide) {
      console.log(`${P}⚠️ MinIO n’a plus le contenu : comparaison impossible, mais l’empreinte enregistrée à la copie sert de témoin.`);
      const attendu = (piece.md5Attendu ?? '').toLowerCase();
      const pareil = attendu !== '' && attendu === drive.md5.toLowerCase();
      console.log(`${P}${pareil ? '✅' : '❌'} md5 Drive ${pareil ? '=' : '≠'} md5 enregistré à la copie`);
      if (pareil) concordantes += 1; else process.exitCode = 1;
      continue;
    }
    const t1 = Date.now();
    const minio = await recuperer(piece.cleStockage);
    const msMinio = Date.now() - t1;
    const md5Minio = createHash('md5').update(minio).digest('hex');
    console.log(`${P}MinIO ............... ${minio.byteLength} octets · md5 ${md5Minio} · ${msMinio} ms`);

    // ③ LA COMPARAISON — la seule chose qui compte.
    const memeTaille = minio.byteLength === drive.octets.byteLength;
    const memeMd5 = md5Minio === drive.md5;
    const identiques = memeMd5 && memeTaille && minio.equals(drive.octets);
    console.log(`${P}${identiques ? '✅ IDENTIQUES' : '❌ DIFFÉRENTS'} — md5 ${memeMd5 ? '=' : '≠'}, taille ${memeTaille ? '=' : '≠'}`
      + `, octet par octet ${minio.equals(drive.octets) ? '=' : '≠'}`);
    if (identiques) concordantes += 1; else process.exitCode = 1;
    console.log('');
  }

  console.log(`╚══ ${concordantes === ids.length ? '✅' : '❌'} ${concordantes} / ${ids.length} pièce(s) concordante(s).`);
  console.log('    Ce que cela démontre : après un vidage, l’application rendra les MÊMES octets qu’aujourd’hui.\n');
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
