/**
 * ══ 🔴🔴 LOT GES-16/21 (Arno, 10/11/2026) — REMETTRE DANS LEUR ÉCHANGE LES RÉPONSES RANGÉES PAR L'ANCIENNE RÈGLE ══════════
 *
 * Sur UN événement, les réponses qu'il a reçues AUTOMATIQUEMENT (motif « réponse à un mail déplacé : suit le mail ») sont jugées
 * PAR LE BIEN (🔴 décision d'Arno du 11/11/2026, `trierParBien`) : une réponse rattachée à un bien qui n'est PAS un bien de
 * l'événement est remise dans son échange ; les échanges du bien de l'événement ne sont JAMAIS retirés. (La première règle, « suivre
 * le parent », retirait tout l'échange « Humidité… 25 rue Edith Cavell » de GES-16 à l'essai du 11/11 : elle est abandonnée.)
 * Une réponse gardée qui répond à un mail retiré est SIGNALÉE « à vérifier », jamais déplacée d'office.
 * Le retrait est exactement le geste « Remettre dans son échange » de l'écran : l'affectation n'est pas supprimée, elle est
 * désactivée, datée et journalisée.
 *
 * CE QU'IL NE TOUCHE JAMAIS : les affectations posées par une personne ; les rattachements mail → bien (historique
 * inaltérable : un bien ne quitte un mail que par « Sortir du suivi ») ; aucun mail, aucune pièce. Aucun envoi.
 *
 * `--vers=GES-…` (facultatif) range ensuite ces réponses dans un autre événement. ⚠️ Elles y emportent leurs biens : le
 * rapport les liste AVANT, pour décider en connaissance de cause.
 *
 * Lancer :  npm run gestion:reponses-suivies:reaffecter -- --evenement=GES-2026-000016              (ESSAI : rien écrit)
 *           npm run gestion:reponses-suivies:reaffecter -- --evenement=GES-2026-000016 --appliquer  (une transaction)
 * Rapport : .captures/reaffecter-reponses-suivies/rapport-<date>.txt (ou --rapport=).
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { pool, closePool } from '../lib/db/client';
import { citationsDuMessage } from '../lib/gestion/captureRepo';
import { rejouerReponsesSuivies, trierParBien, type ReponseSuivie } from '../lib/gestion/repriseReponsesSuivies';
import { sqlLiensDuBien } from '../lib/gestion/rattachement';
import { cheminRapport } from '../lib/ops/rapportScript';

const MOTIF_SUIVI = 'réponse à un mail déplacé : suit le mail';
const AUTEUR = 'reprise GES-16/21 (décision d’Arno)';
const NOM = 'reaffecter-reponses-suivies';

const arg = (nom: string): string | null => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  return a === undefined ? null : a.slice(nom.length + 3);
};

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const reference = arg('evenement');
  const vers = arg('vers');
  if (reference === null) throw new Error('Précisez --evenement=GES-AAAA-NNNNNN.');
  const lignes: string[] = [];
  const dire = (t = '') => { lignes.push(t); console.log(t); };
  dire(`══ Réponses suivies de ${reference} — ${appliquer ? 'APPLIQUER (une transaction)' : 'ESSAI (rien n’est écrit)'}${vers ? ` — puis vers ${vers}` : ''}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!appliquer) await client.query('SET TRANSACTION READ ONLY');
    const q = async <R>(t: string, p: unknown[] = []) => (await client.query(t, p)).rows as R[];

    const [ev] = await q<{ id: number }>(`SELECT id::int AS id FROM gestion_evenement WHERE reference = $1`, [reference]);
    if (!ev) throw new Error(`Événement ${reference} introuvable.`);
    const cible = vers === null ? null
      : (await q<{ id: number }>(`SELECT id::int AS id FROM gestion_evenement WHERE reference = $1`, [vers]))[0] ?? null;
    if (vers !== null && cible === null) throw new Error(`Événement ${vers} introuvable.`);

    const suivies = await q<{ affectation_id: number; message_id: number; recu_le: string; de: string | null; objet: string | null;
      in_reply_to: string | null; references_brut: string | null }>(
      `SELECT a.id::int AS affectation_id, m.id::int AS message_id, to_char(m.recu_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS recu_le,
              m.de_adresse AS de, left(m.objet, 70) AS objet, m.in_reply_to, m.references_brut
         FROM gestion_affectation a JOIN gestion_message m ON m.id = a.message_id
        WHERE a.evenement_id = $1 AND a.actif AND a.message_id IS NOT NULL AND a.motif = $2
        ORDER BY m.recu_le, m.id ${appliquer ? 'FOR UPDATE OF a' : ''}`, [ev.id, MOTIF_SUIVI]);
    const entrees: ReponseSuivie[] = suivies.map((s) => ({
      affectationId: s.affectation_id, messageId: s.message_id,
      citations: citationsDuMessage({ inReplyTo: s.in_reply_to, referencesBrut: s.references_brut }),
    }));
    const mids = [...new Set(entrees.flatMap((e) => e.citations))];
    const connusLignes = await q<{ id: number; mid: string }>(
      `SELECT id::int AS id, message_id AS mid FROM gestion_message WHERE message_id = ANY($1::text[])`, [mids]);
    const connus = new Map<string, number[]>();
    for (const c of connusLignes) connus.set(c.mid, [...(connus.get(c.mid) ?? []), c.id]);
    const ids = [...new Set([...connusLignes.map((c) => c.id), ...entrees.map((e) => e.messageId)])];
    const evenementDuMail = new Map<number, number>();
    for (const a of await q<{ message_id: number; evenement_id: number }>(
      `SELECT message_id::int AS message_id, evenement_id::int AS evenement_id FROM gestion_affectation
        WHERE actif AND message_id = ANY($1::bigint[]) ORDER BY affecte_le`, [ids])) evenementDuMail.set(a.message_id, a.evenement_id);
    const refs = new Map((await q<{ id: number; reference: string }>(
      `SELECT id::int AS id, reference FROM gestion_evenement`)).map((e) => [e.id, e.reference]));
    const biens = new Map<number, string[]>();
    const clesDuMail = new Map<number, string[]>();
    for (const b of await q<{ message_id: number; bien: string }>(
      `SELECT r.message_id::int AS message_id, r.cible_cle || ' ' || coalesce(lo.adresse, '?') AS bien
         FROM gestion_rattachement r LEFT JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
        WHERE r.message_id = ANY($1::bigint[]) AND r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
        ORDER BY r.cible_cle`, [entrees.map((e) => e.messageId)])) biens.set(b.message_id, [...(biens.get(b.message_id) ?? []), b.bien]);
    for (const b of await q<{ message_id: number; cle: string }>(
      `SELECT DISTINCT r.message_id::int AS message_id, r.cible_cle AS cle FROM gestion_rattachement r
        WHERE r.message_id = ANY($1::bigint[]) AND ${sqlLiensDuBien('r')}`, [entrees.map((e) => e.messageId)])) {
      clesDuMail.set(b.message_id, [...(clesDuMail.get(b.message_id) ?? []), b.cle]);
    }

    // 🔴 LES BIENS DE L'ÉVÉNEMENT : ses parties « bien » ; à défaut, les biens des mails qu'une PERSONNE y a rangés (son échange, ou un mail
    //    déplacé à la main) — jamais ceux des réponses rangées automatiquement, qui sont justement jugées ici.
    const parties = (await q<{ cle: string }>(
      `SELECT DISTINCT p.cle FROM gestion_evenement_partie p WHERE p.evenement_id = $1 AND p.sorte = 'lot' AND p.retire_le IS NULL AND btrim(coalesce(p.cle, '')) <> ''`,
      [ev.id]).catch(() => [])).map((x) => x.cle);
    const desMails = (await q<{ cle: string }>(
      `WITH mails AS (
         SELECT m.id FROM gestion_affectation a
           JOIN gestion_message m ON (a.message_id IS NOT NULL AND m.id = a.message_id)
             OR (a.message_id IS NULL AND m.fil_id = a.fil_id AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2 WHERE a2.message_id = m.id AND a2.actif))
          WHERE a.evenement_id = $1 AND a.actif AND (a.message_id IS NULL OR a.motif IS DISTINCT FROM $2))
       SELECT DISTINCT r.cible_cle AS cle FROM gestion_rattachement r WHERE r.message_id IN (SELECT id FROM mails) AND ${sqlLiensDuBien('r')}`,
      [ev.id, MOTIF_SUIVI])).map((x) => x.cle);
    const biensEvenement = new Set(parties.length > 0 ? parties : desMails);
    const libelles = new Map((await q<{ cle: string; l: string }>(
      `SELECT wippimmo_id AS cle, wippimmo_id || ' ' || coalesce(adresse, '?') AS l FROM gestion_annuaire_lot WHERE wippimmo_id = ANY($1::text[])`,
      [[...biensEvenement]])).map((x) => [x.cle, x.l]));
    dire(`Biens de ${reference} (${parties.length > 0 ? 'ses parties' : 'les mails rangés par une personne'}) : ${[...biensEvenement].map((c) => libelles.get(c) ?? c).join(' ; ') || 'aucun — rien ne sera retiré'}.`);

    const parents = rejouerReponsesSuivies(ev.id, entrees, connus, evenementDuMail);
    const verdicts = trierParBien(entrees.map((e) => ({ ...e, parent: parents.find((p) => p.messageId === e.messageId)?.parent ?? null })), clesDuMail, biensEvenement);
    dire(`${suivies.length} réponse(s) rangée(s) automatiquement dans ${reference} — jugées par le bien.`);
    for (const v of verdicts) {
      const s = suivies.find((x) => x.message_id === v.messageId)!;
      const p = parents.find((x) => x.messageId === v.messageId);
      const parent = p?.parent == null ? 'aucun mail cité connu'
        : `répond à ${p.parent} (${p.evenementDuParent === null ? 'dans son échange' : refs.get(p.evenementDuParent) ?? p.evenementDuParent})`;
      dire(`  ${v.garder ? (v.aVerifier ? 'À VÉRIFIER' : 'GARDÉ     ') : 'REMIS     '} mail ${v.messageId} · ${s.recu_le} · ${s.de ?? '?'} · ${s.objet ?? ''}`);
      dire(`             ${parent} · biens du mail : ${(biens.get(v.messageId) ?? []).join(' ; ') || 'aucun'}`
        + (v.garder ? (v.aVerifier ? ' · gardé (bien de l’événement), mais il répond à un mail retiré : à vérifier à la main' : '')
          : ` · retiré : concerne ${v.autresBiens.join(', ')}, qui n’est pas un bien de l’événement`));
    }
    const remis = verdicts.filter((v) => !v.garder);
    const aVerifier = verdicts.filter((v) => v.aVerifier);
    if (aVerifier.length > 0) dire(`⚠ ${aVerifier.length} mail(s) à vérifier à la main (gardés) : ${aVerifier.map((v) => v.messageId).join(', ')}.`);
    dire(`→ ${remis.length} à remettre dans leur échange${cible ? `, puis à ranger dans ${vers}` : ''}.`);

    if (appliquer) {
      for (const v of remis) {
        await q(`UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par_libelle = $2,
                        detache_motif = 'remis dans son échange : il concerne un autre bien que celui de cet événement'
                  WHERE id = $1 AND actif`, [v.affectationId, AUTEUR]);
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
                 VALUES ('affectation', $1, 'detachement', $2, $3)`,
          [v.affectationId, `mail ${v.messageId} remis dans son échange (il quitte ${reference}) : il concerne ${v.autresBiens.join(', ')}, autre bien que celui de l’événement`, AUTEUR]);
        if (cible !== null) {
          const [n] = await q<{ id: number }>(
            `INSERT INTO gestion_affectation (fil_id, evenement_id, message_id, motif, affecte_par_libelle)
             SELECT fil_id, $2, id, $3, $4 FROM gestion_message WHERE id = $1 RETURNING id::int AS id`,
            [v.messageId, cible.id, `rangé dans ${vers} par la reprise GES-16/21 (décision d’Arno)`, AUTEUR]);
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
                   VALUES ('affectation', $1, 'affectation', $2, $3)`,
            [n.id, `mail ${v.messageId} rattaché à l’événement ${vers}, sans son échange (reprise GES-16/21)`, AUTEUR]);
        }
      }
      await client.query('COMMIT');
      dire(`✓ Écrit : ${remis.length} affectation(s) désactivée(s)${cible ? `, ${remis.length} posée(s) dans ${vers}` : ''}.`);
    } else {
      await client.query('ROLLBACK');
      dire('Essai : rien n’a été écrit. Relancer avec --appliquer pour écrire.');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    const chemin = cheminRapport({ nomScript: NOM, demande: arg('rapport') });
    writeFileSync(chemin, `${lignes.join('\n')}\n`);
    console.log(`Rapport : ${chemin}`);
  }
}

void main()
  .catch((e) => { console.error(`[${NOM}] échec`, e); process.exitCode = 1; })
  .finally(() => closePool());
