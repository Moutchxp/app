/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LA PASSE DE RATTRAPAGE DES IMAGES INTÉGRÉES ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « les images intégrées au corps du mail ne sont PAS des pièces jointes ».
 *
 * Le critère est exact et ne suppose rien : mailparser pose les parties `related` d'un mail dans le HTML sous
 * forme de `data:image/…;base64,…`. Une image dont l'empreinte sha256 figure parmi celles des images `data:` du
 * corps a donc ses octets DÉJÀ dans le message — c'est une image intégrée. Éprouvé sur les messages 57424 (un
 * correspondant) et 57464 (notre propre signature), aux empreintes près.
 *
 * ═══ 🔒 CE QUE CETTE PASSE NE FAIT PAS ══════════════════════════════════════════════════════════════════════════
 *
 *   · elle ne SUPPRIME aucune pièce — elle écrit une colonne, et rien d'autre ;
 *   · elle ne touche aucun rattachement, aucun dépôt Drive, aucun nom ;
 *   · elle n'écrit RIEN sans `--appliquer`. Sans l'option, elle compte et montre des exemples.
 *
 * ⚠️ UNE PIÈCE SANS EMPREINTE RESTE `NULL`, donc comptée. Ne pas savoir n'est pas une raison de retirer une pièce
 * d'un compteur : 39 pièces de la base sont dans ce cas, et elles doivent le rester.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/marquer-images-integrees.ts            # simulation
 *   npx tsx --env-file=.env app/scripts/marquer-images-integrees.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../lib/db/client';
import { estPoseeDansLeCorps } from '../lib/gestion/imageDansLeCorps';
import { empreintesDesImagesDuCorps } from '../lib/gestion/imageDansLeCorpsReel';
import { pieceIntegreeDisponible } from '../lib/gestion/schema';

/** Par paquets : un `IN (…)` de six mille identifiants et six mille corps HTML en mémoire, non. */
const PAQUET = 200;

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  if (!(await pieceIntegreeDisponible())) {
    console.log('Migration 296 non appliquée : la colonne `gestion_piece.integree` n’existe pas. Rien à faire.');
    return;
  }

  const { rows: messages } = await query<{ id: string }>(
    `SELECT DISTINCT p.message_id::text AS id FROM gestion_piece p
      WHERE p.type_mime LIKE 'image/%' ORDER BY 1`);
  console.log(`${appliquer ? 'APPLICATION' : 'SIMULATION'} — ${messages.length} message(s) portant au moins une image.`);

  let vues = 0; let integrees = 0; let ecrites = 0; let sansEmpreinte = 0;
  const exemples: string[] = [];

  for (let i = 0; i < messages.length; i += PAQUET) {
    const ids = messages.slice(i, i + PAQUET).map((m) => Number(m.id));
    const { rows: corps } = await query<{ id: string; corps_html: string | null }>(
      'SELECT id::text, corps_html FROM gestion_message WHERE id = ANY($1::bigint[])', [ids]);
    const parMessage = new Map(corps.map((c) => [c.id, empreintesDesImagesDuCorps(c.corps_html)]));

    const { rows: pieces } = await query<{
      id: string; message_id: string; nom_fichier: string; taille_octets: string | null;
      empreinte_sha256: string | null; integree: boolean | null;
    }>(
      `SELECT id::text, message_id::text, nom_fichier, taille_octets::text, empreinte_sha256, integree
         FROM gestion_piece WHERE message_id = ANY($1::bigint[]) AND type_mime LIKE 'image/%'
        ORDER BY id`, [ids]);

    const aMarquer: number[] = [];
    for (const p of pieces) {
      vues += 1;
      if (p.empreinte_sha256 === null) { sansEmpreinte += 1; continue; }
      const dansLeCorps = estPoseeDansLeCorps(
        p.empreinte_sha256, parMessage.get(p.message_id) ?? new Set<string>());
      if (!dansLeCorps) continue;
      integrees += 1;
      if (p.integree === true) continue;   // déjà marquée : une passe relancée ne réécrit rien
      aMarquer.push(Number(p.id));
      if (exemples.length < 10) {
        exemples.push(`pièce ${p.id} « ${p.nom_fichier} » ${p.taille_octets ?? '?'} o (message ${p.message_id})`);
      }
    }

    if (aMarquer.length > 0 && appliquer) {
      const r = await query(
        'UPDATE gestion_piece SET integree = true WHERE id = ANY($1::bigint[]) AND integree IS DISTINCT FROM true',
        [aMarquer]);
      ecrites += r.rowCount ?? 0;
    } else {
      ecrites += aMarquer.length;
    }
  }

  console.log(`\n══ BILAN ══════════════════════════════════════════════════════════════`);
  console.log(`images examinées                     : ${vues}`);
  console.log(`  dont octets posés dans le corps    : ${integrees}`);
  console.log(`  dont sans empreinte (laissées NULL): ${sansEmpreinte}`);
  console.log(`lignes ${appliquer ? 'ÉCRITES' : 'à écrire'}                     : ${ecrites}`);
  console.log(`\nEXEMPLES :`);
  for (const e of exemples) console.log(`  · ${e}`);
  if (!appliquer) console.log('\n(simulation — relancer avec --appliquer pour écrire)');
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
