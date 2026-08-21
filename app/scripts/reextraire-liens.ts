/**
 * L1 (correctif du 21/08) — RÉ-EXTRACTION CIBLÉE des liens déjà captés : re-passe le parseur `analyserLiensReponse` sur le corps
 * (texte + HTML) CONSERVÉ des réponses existantes, et RECALCULE `fort` / `expire_le` (+ source/indice) sur les lignes
 * demande_reponse_lien qui existent déjà. Motif : la garde anti-slug déclassait tout jeton porteur d'un tiret (ex. Paris
 * « NvurYVHvT-…-… ») → lien FAIBLE → expire_le NULL → aucune alerte d'expiration possible. Le corps HTML est gravé depuis L1,
 * donc la ré-extraction est exacte, sans jamais suivre un lien.
 *
 * ⚠️ PÉRIMÈTRE STRICT — cette commande ne fait QUE recalculer fort/expire_le/expiration_source/expiration_indice sur des lignes
 * demande_reponse_lien DÉJÀ présentes (appariées par (reponse_id, url), la forme brute étant identique). Elle N'INSÈRE aucun
 * nouveau lien, ne bascule AUCUN état, ne pose AUCUN satisfait_le, ne rattache RIEN, ne touche NI demande.statut NI Archives
 * (règle dure L1 : un lien ne fait jamais Archives ni satisfait_le). AUCUN appel réseau (le parseur ne lit que des chaînes).
 *
 * DRY-RUN PAR DÉFAUT : sans `--apply`, la commande LISTE ce qu'elle changerait et n'écrit RIEN. IDEMPOTENTE : un 2ᵉ passage
 * après `--apply` ne trouve plus de différence (0 mise à jour). Rappel : les documents des deux permis sont DÉJÀ obtenus — il n'y
 * a aucune urgence d'expiration à rattraper ; on répare la mécanique pour les liens FUTURS.
 *
 * Lancer :   npm run veille:reextraire-liens              (DRY-RUN, n'écrit rien)
 *            npm run veille:reextraire-liens -- --apply   (applique les mises à jour)
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { analyserLiensReponse } from '../lib/veille/extractionLiens';

const APPLY = process.argv.includes('--apply');

/** Comparaison de deux expirations (null-safe) — le stockage est timestamptz, on compare l'instant. */
function memeExpiration(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}
const isoJour = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '—');

interface LigneLien { id: number; url: string; fort: boolean; expire_le: string | null; expiration_source: string | null; expiration_indice: string | null; }

async function main(): Promise<void> {
  console.log(`\n══════ RÉ-EXTRACTION DES LIENS (L1) — ${APPLY ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'} ══════\n`);

  // Réponses porteuses d'au moins un lien déjà capté : seules elles peuvent voir un fort/expire_le recalculé. EXISTS (et non un
  //   JOIN + DISTINCT) → une seule ligne par réponse sans dédoublonnage, l'id restant unique → ORDER BY r.id sans contrainte.
  const { rows: reponses } = await query<{ id: number; corps_texte: string | null; corps_html: string | null; recu_le: string }>(
    `SELECT r.id::int AS id, r.corps_texte, r.corps_html, r.recu_le::text AS recu_le
       FROM demande_reponse r
      WHERE EXISTS (SELECT 1 FROM demande_reponse_lien l WHERE l.reponse_id = r.id)
      ORDER BY r.id`,
  );

  let nbChanges = 0, nbInchanges = 0, nbOrphelins = 0;
  for (const rep of reponses) {
    const recuLe = new Date(rep.recu_le);
    const { liens: recalcul } = analyserLiensReponse({ corpsTexte: rep.corps_texte, corpsHtml: rep.corps_html, recuLe });
    const parUrl = new Map(recalcul.map((l) => [l.url, l]));

    const { rows: existants } = await query<LigneLien>(
      `SELECT id::int AS id, url, fort, expire_le::text AS expire_le, expiration_source, expiration_indice
         FROM demande_reponse_lien WHERE reponse_id = $1 ORDER BY id`,
      [rep.id],
    );

    for (const ex of existants) {
      const neuf = parUrl.get(ex.url);
      if (!neuf) { nbOrphelins += 1; continue; } // url plus produite par le parseur (jamais le cas ici : la collecte est inchangée) → on ne touche à RIEN
      const exExpire = ex.expire_le ? new Date(ex.expire_le) : null;
      const change = ex.fort !== neuf.fort
        || !memeExpiration(exExpire, neuf.expireLe)
        || (ex.expiration_source ?? null) !== (neuf.expirationSource ?? null)
        || (ex.expiration_indice ?? null) !== (neuf.expirationIndice ?? null);
      if (!change) { nbInchanges += 1; continue; }

      nbChanges += 1;
      console.log(`  réponse ${rep.id} · lien #${ex.id}`);
      console.log(`    url        ${ex.url}`);
      console.log(`    fort       ${ex.fort} → ${neuf.fort}`);
      console.log(`    expire_le  ${isoJour(exExpire)} → ${isoJour(neuf.expireLe)}  (source ${ex.expiration_source ?? '—'} → ${neuf.expirationSource ?? '—'})`);

      if (APPLY) {
        // Recalcul PUR : uniquement les 4 colonnes dérivées du parseur. Aucune autre écriture, aucun état, aucun rattachement.
        await query(
          `UPDATE demande_reponse_lien SET fort = $2, expire_le = $3, expiration_source = $4, expiration_indice = $5 WHERE id = $1`,
          [ex.id, neuf.fort, neuf.expireLe, neuf.expirationSource, neuf.expirationIndice],
        );
      }
    }
  }

  console.log(`\n▶ ${reponses.length} réponse(s) porteuse(s) de liens · ${nbChanges} lien(s) ${APPLY ? 'mis à jour' : 'à mettre à jour'} · ${nbInchanges} inchangé(s)${nbOrphelins > 0 ? ` · ${nbOrphelins} non reproduit(s) (ignoré(s))` : ''}`);
  if (!APPLY && nbChanges > 0) console.log('  (DRY-RUN — relancez avec « -- --apply » pour écrire)');
  console.log('');
}

void main().catch((e) => { console.error('[veille:reextraire-liens] échec', e); process.exitCode = 1; }).finally(() => closePool());
