/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — LA PASSE DE RATTRAPAGE DES EMPREINTES ═══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « une pièce dont le CONTENU est déjà dans le Drive doit être reconnue, quel que soit
 * son nom. Range le md5 de chaque pièce (calculé à la capture, et un rattrapage pour l'existant ; octets lus
 * MinIO → Drive “00 Arrivée” → Gmail ; simulation puis application). Range le md5Checksum de chaque copie Drive
 * écrite par l'application (rattrapage en lisant les métadonnées des fichiers du registre, en lecture seule). »
 *
 * 🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN. Il lit, il compte, il montre ce qu'il écrirait.
 * 🔒 ET IL N'ÉCRIT JAMAIS DANS LE DRIVE, ni ici ni ailleurs : la passe ② n'émet que des `files.get`.
 *
 * ═══ POURQUOI DEUX PASSES, ET POURQUOI ELLES NE SE RESSEMBLENT PAS ═══════════════════════════════════════════════
 *
 *   ① LES PIÈCES (`gestion_piece.md5`). Il faut les OCTETS, donc une lecture de contenu : MinIO d'abord, la copie
 *      Drive vérifiée ensuite, le message d'origine dans Gmail en dernier recours. C'est `lireOctetsPiece` qui
 *      descend cet escalier, et c'est le même code que l'application utilise pour afficher une pièce — on ne
 *      recopie pas sa logique, on l'appelle.
 *
 *   ② LES COPIES DU REGISTRE (`gestion_piece_drive.md5`). Il ne faut QUE des métadonnées : Google rend
 *      `md5Checksum` dans un `files.get` à un champ. Aucun contenu n'est téléchargé.
 *
 * ⚠️ LA PASSE ② NE CONCERNE QUE 30 LIGNES SUR 26 552, et ce n'est pas un détail : les 26 522 autres
 * (`origine='copie'`, la campagne automatique) portent déjà leur empreinte. Les 30 qui manquent sont exactement
 * celles que `memoriserDepot` écrit — c'est-à-dire TOUT ce qu'un humain range par la fenêtre « Ranger une pièce
 * dans le Drive ». Les 5 copies du document d'Arno sont de celles-là, et c'est la seconde moitié du défaut.
 *
 * ⚠️ LES MÉTADONNÉES DE « Documents clients scannés » SONT LISIBLES, et seulement lisibles. Un `files.get` sur
 * `md5Checksum` ne lit pas le contenu du fichier et ne peut rien y écrire : c'est la même permission que le fil
 * d'Ariane de la fenêtre utilise déjà. Aucune écriture n'est possible depuis ce script.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/empreintes-md5-pieces.ts                      # simulation, tout
 *   npx tsx --env-file=.env app/scripts/empreintes-md5-pieces.ts --limite=200         # simulation, 200 pièces
 *   npx tsx --env-file=.env app/scripts/empreintes-md5-pieces.ts --appliquer
 *   npx tsx --env-file=.env app/scripts/empreintes-md5-pieces.ts --registre-seul      # la passe ② seule
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { query } from '../lib/db/client';
import { lirePiecesALire, depsOctetsPiece } from '../lib/gestion/octetsPieceCablage';
import { lireOctetsPiece } from '../lib/gestion/octetsPiece';
import { pieceMd5Disponible } from '../lib/gestion/schema';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { lireJeton } from '../lib/gestion/googleJeton';
import { lireIdentifiants, rafraichirJeton } from '../lib/gestion/google';

/** 🔒 Le compte qui LIT les métadonnées du Drive. Celui de la maison, avec la délégation qui existe déjà. */
const SUJET_DRIVE = 'a.jorel@sansvisavis.com';
const API = 'https://www.googleapis.com/drive/v3';
/** Combien de pièces lues avant d'annoncer où l'on en est : une passe de 27 000 pièces ne doit pas paraître figée. */
const PAS_AVANCEMENT = 250;

/** Le jeton Gmail de gestion@, pour le dernier recours. `null` ⇒ ce recours n'existe pas, et le motif le dira. */
async function jetonGmail(): Promise<string | null> {
  const j = lireJeton();
  const ids = lireIdentifiants();
  if (j === null || ids === null) return null;
  const r = await rafraichirJeton({ identifiants: ids, refreshToken: j.refreshToken }, { fetch });
  return r.ok ? r.valeur : null;
}

const argNombre = (nom: string): number | null => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  const n = a === undefined ? NaN : Number(a.slice(nom.length + 3));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES PIÈCES — IL FAUT LES OCTETS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 ①a — LA REPRISE GRATUITE : L'EMPREINTE EST DÉJÀ EN BASE POUR 97,8 % DES PIÈCES ═════════════════════════
 *
 * MESURÉ LE 03/10/2026, et c'est ce qui change tout : 26 522 pièces sur 27 127 ont une copie Drive VÉRIFIÉE qui
 * porte son `md5`. Et une copie « vérifiée » n'est pas une copie « qu'on croit bonne » : au moment de la
 * campagne, le md5 rendu par Google a été COMPARÉ au md5 des octets lus sur MinIO (`conclure` →
 * `verifierCopie({ md5Attendu, md5Rendu })`), et `verifie_le` n'a été posé qu'en cas d'égalité.
 *
 * 🔴 DONC CE md5 **EST** CELUI DU CONTENU DE LA PIÈCE, par construction — pas une ressemblance, une égalité
 * prouvée à l'époque. Le recopier est exact, instantané, et n'émet pas un octet de réseau.
 *
 * ⚠️ ET CE N'EST PAS UN RACCOURCI DE CONFORT : ces 26 522 pièces sont EXACTEMENT celles qui ont été VIDÉES du
 * stockage objet. Leurs octets ne vivent plus que dans le Drive — les redemander un par un, c'est 26 522
 * téléchargements complets, soit près de six heures mesurées (0,8 s par pièce sur un échantillon de 200). Pour
 * aboutir au même chiffre, déjà écrit dans la ligne d'à côté.
 *
 * 🔒 ON NE REMPLACE JAMAIS UNE EMPREINTE DÉJÀ POSÉE, et l'on n'accepte que les copies vivantes et vérifiées.
 */
async function reprisParLeRegistre(appliquer: boolean): Promise<void> {
  const SOURCE = `SELECT p.id, min(lower(btrim(d.md5))) AS md5
                    FROM gestion_piece p
                    JOIN gestion_piece_drive d ON d.piece_id = p.id
                   WHERE coalesce(p.md5, '') = ''
                     AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
                     AND coalesce(btrim(d.md5), '') <> '' AND d.disparu_le IS NULL
                   GROUP BY p.id`;
  const { rows: combien } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM (${SOURCE}) t`);
  console.log(`\n① a) REPRISE PAR LE REGISTRE (copies vérifiées, sans réseau) : ${combien[0].n} pièce(s)`);
  if (!appliquer) { console.log('   (simulation — rien écrit)'); return; }
  const r = await query(
    `UPDATE gestion_piece p SET md5 = t.md5 FROM (${SOURCE}) t
      WHERE p.id = t.id AND coalesce(p.md5, '') = ''`);
  console.log(`   ✅ ${r.rowCount ?? 0} empreinte(s) reprise(s) du registre.`);
}

async function passePieces(appliquer: boolean, limite: number | null): Promise<void> {
  if (!(await pieceMd5Disponible())) {
    console.log('\n══ ① LES PIÈCES ═══════════════════════════════════════════════════════════════');
    console.log('⚠️ La migration 298 n’est pas appliquée : `gestion_piece.md5` n’existe pas.');
    console.log('   Rien à rattraper, et rien n’est nommé. Appliquer la migration d’abord.');
    return;
  }

  const { rows: etat } = await query<{ total: string; avec: string; sans_octets: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE coalesce(md5, '') <> '')::text AS avec,
            count(*) FILTER (WHERE cle_stockage IS NULL)::text AS sans_octets
       FROM gestion_piece`);
  console.log('\n══ ① LES PIÈCES ═══════════════════════════════════════════════════════════════');
  console.log(`pièces en tout : ${etat[0].total} — avec empreinte md5 : ${etat[0].avec}`
    + ` — jamais déposées au stockage : ${etat[0].sans_octets}`);

  /* 🔴 LA REPRISE GRATUITE D'ABORD : elle règle 97,8 % des pièces sans un octet de réseau. Voir son encadré. */
  await reprisParLeRegistre(appliquer);

  const { rows: aFaire } = await query<{ id: string }>(
    `SELECT id::text FROM gestion_piece
      WHERE coalesce(md5, '') = '' ORDER BY id DESC ${limite === null ? '' : `LIMIT ${limite}`}`);
  console.log(`\n① b) RESTE À CALCULER SUR LES OCTETS : ${aFaire.length}`
    + `${limite === null ? '' : ` (borné à ${limite})`}`);
  if (aFaire.length === 0) return;

  const deps = depsOctetsPiece(jetonGmail);
  const parSource = new Map<string, number>();
  const refus = new Map<string, number>();
  let calcules = 0; let ecrits = 0;

  for (const [i, r] of aFaire.entries()) {
    const id = Number(r.id);
    /**
     * ⚠️ UNE PIÈCE À LA FOIS, ET C'EST VOULU. `lireOctetsPiece` peut rapatrier un message entier depuis Gmail en
     * dernier recours : paralléliser ferait partir des dizaines de rapatriements de douze mégaoctets d'un coup,
     * pour un gain qui ne se verrait pas — le goulot est le réseau, pas nous.
     */
    const brute = (await lirePiecesALire([id])).get(id);
    if (brute === undefined) { refus.set('introuvable en base', (refus.get('introuvable en base') ?? 0) + 1); continue; }
    const lu = await lireOctetsPiece(brute, deps);
    if (!lu.ok) {
      /* ⚠️ ON REGROUPE LES MOTIFS, on ne les empile pas : 27 000 lignes de refus ne s'analysent pas. */
      const court = lu.motif.split('.')[0].slice(0, 80);
      refus.set(court, (refus.get(court) ?? 0) + 1);
    } else {
      calcules += 1;
      parSource.set(lu.source, (parSource.get(lu.source) ?? 0) + 1);
      if (appliquer) {
        const md5 = createHash('md5').update(lu.octets).digest('hex');
        /* 🔒 `coalesce(md5,'') = ''` DANS LE `WHERE` : on ne REMPLACE jamais une empreinte déjà posée. */
        const w = await query(
          `UPDATE gestion_piece SET md5 = $2 WHERE id = $1 AND coalesce(md5, '') = ''`, [id, md5]);
        ecrits += w.rowCount ?? 0;
      }
    }
    if ((i + 1) % PAS_AVANCEMENT === 0) console.log(`  … ${i + 1}/${aFaire.length}`);
  }

  console.log(`\nempreintes calculées : ${calcules}`);
  for (const [s, n] of [...parSource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  · octets lus depuis ${s} : ${n}`);
  }
  if (refus.size > 0) {
    console.log(`\npièces dont les octets sont introuvables : ${[...refus.values()].reduce((a, b) => a + b, 0)}`);
    for (const [m, n] of [...refus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  · ${n} × ${m}`);
    }
  }
  console.log(appliquer ? `\n✅ ${ecrits} empreinte(s) écrite(s) sur les pièces.` : '\n(simulation — rien écrit)');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES COPIES DU REGISTRE — DES MÉTADONNÉES SUFFISENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function passeRegistre(appliquer: boolean): Promise<void> {
  console.log('\n══ ② LES COPIES DU REGISTRE DRIVE ══════════════════════════════════════════════');
  const { rows: etat } = await query<{ origine: string; total: string; avec: string }>(
    `SELECT origine, count(*)::text AS total, count(*) FILTER (WHERE coalesce(md5, '') <> '')::text AS avec
       FROM gestion_piece_drive WHERE disparu_le IS NULL GROUP BY origine ORDER BY 2 DESC`);
  for (const e of etat) console.log(`  · origine « ${e.origine} » : ${e.total} copie(s), dont ${e.avec} avec md5`);

  const { rows: aFaire } = await query<{ id: string; drive_file_id: string; piece_id: string }>(
    `SELECT id::text, drive_file_id, piece_id::text FROM gestion_piece_drive
      WHERE coalesce(md5, '') = '' AND disparu_le IS NULL AND btrim(drive_file_id) <> '' ORDER BY id`);
  console.log(`\nà lire chez Google : ${aFaire.length} copie(s)`);
  if (aFaire.length === 0) return;

  const j = await jetonPourSubject(SUJET_DRIVE, { fetch });
  if (!j.ok) { console.log(`jeton Drive refusé — ${j.motif}`); return; }

  let lus = 0; let sansEmpreinte = 0; let illisibles = 0; let ecrits = 0;
  for (const c of aFaire) {
    /* 🔒 UN SEUL VERBE, ET IL EST EN LECTURE : `GET files/{id}` sur trois champs. Rien d'autre ne part d'ici. */
    const res = await fetch(`${API}/files/${c.drive_file_id}?supportsAllDrives=true&fields=id,md5Checksum,size`,
      { headers: { Authorization: `Bearer ${j.jeton}` } });
    if (!res.ok) { illisibles += 1; console.log(`  ! ${c.drive_file_id} (pièce ${c.piece_id}) : HTTP ${res.status}`); continue; }
    const m = (await res.json()) as { md5Checksum?: string; size?: string };
    if (typeof m.md5Checksum !== 'string' || m.md5Checksum === '') {
      /* ⚠️ UN DOCUMENT GOOGLE NATIF N'A PAS D'EMPREINTE : Google n'en calcule pas. Ce n'est pas une panne. */
      sansEmpreinte += 1; continue;
    }
    lus += 1;
    if (appliquer) {
      const w = await query(
        `UPDATE gestion_piece_drive SET md5 = $2, taille_octets = coalesce(taille_octets, $3::bigint)
          WHERE id = $1 AND coalesce(md5, '') = ''`,
        [Number(c.id), m.md5Checksum.toLowerCase(), m.size === undefined ? null : Number(m.size)]);
      ecrits += w.rowCount ?? 0;
    }
  }
  console.log(`\nempreintes lues : ${lus} — sans empreinte (document Google natif) : ${sansEmpreinte}`
    + ` — illisibles : ${illisibles}`);
  console.log(appliquer ? `✅ ${ecrits} empreinte(s) écrite(s) au registre.` : '(simulation — rien écrit)');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ CE QUE ÇA CHANGE, VÉRIFIÉ SUR LES PIÈCES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function bilan(): Promise<void> {
  if (!(await pieceMd5Disponible())) return;
  console.log('\n══ ③ CE QUE LA RECONNAISSANCE PAR CONTENU RATTRAPE ═════════════════════════════');
  const { rows } = await query<{ pieces: string; emplacements: string }>(
    `SELECT count(DISTINCT p.id)::text AS pieces, count(*)::text AS emplacements
       FROM gestion_piece p
       JOIN gestion_piece_drive d ON lower(btrim(d.md5)) = lower(btrim(p.md5))
      WHERE coalesce(btrim(p.md5), '') <> '' AND d.disparu_le IS NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_piece_drive x WHERE x.piece_id = p.id AND x.disparu_le IS NULL)`);
  console.log(`pièces SANS aucun dépôt à leur nom mais dont le contenu EST dans le Drive : ${rows[0].pieces}`);
  console.log(`emplacements que la loupe et la pastille montreront pour elles : ${rows[0].emplacements}`);
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const registreSeul = process.argv.includes('--registre-seul');
  const piecesSeules = process.argv.includes('--pieces-seules');
  console.log(appliquer ? '🔴 MODE APPLICATION' : '🔒 SIMULATION (rien ne sera écrit)');
  if (!registreSeul) await passePieces(appliquer, argNombre('limite'));
  if (!piecesSeules) await passeRegistre(appliquer);
  await bilan();
  if (!appliquer) console.log('\n(relancer avec --appliquer, APRÈS accord d’Arno, pour écrire)');
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
