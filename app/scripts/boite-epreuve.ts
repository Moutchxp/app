/**
 * CLI `gestion:boite:epreuve` — LOTS BOITE-SENS + ENVOI-DIAG : L'ÉPREUVE SUR CLUSTER JETABLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PROUVE. `npm test` éprouve la FORME du SQL et les fonctions pures. Mais « un échange
 * où l'on a reçu ET répondu apparaît dans les DEUX listes, chacune avec SON message » est une affirmation sur ce que
 * PostgreSQL rend vraiment, sur de vraies lignes. Elle ne se vérifie qu'en semant un échange et en regardant les deux
 * listes. Idem pour l'avis de non-remise : le rattachement passe par une jointure sur `message_id`, et c'est la base
 * qui dit si elle reconnaît l'identifiant cité.
 *
 * 🔴 ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR `gestion_jetable`. Elle écrit des messages et des avis : lancée par
 * mégarde sur la base de travail, elle salirait la vraie boîte. Le garde est la PREMIÈRE chose qu'elle fait.
 *
 * 🔒 AUCUN APPEL EXTÉRIEUR : ni Gmail, ni Drive, ni MinIO. Tout est inventé — adresses en `.invalid`, noms fictifs.
 *
 * COMMENT FABRIQUER LA BASE ET LANCER L'ÉPREUVE :
 *   psql -d postgres -c 'DROP DATABASE IF EXISTS gestion_jetable'
 *   psql -d postgres -c 'CREATE DATABASE gestion_jetable'
 *   pg_dump --schema-only --no-owner --no-privileges sansvisavis | psql -q -d gestion_jetable
 *   psql -v ON_ERROR_STOP=1 -d gestion_jetable -f db/migrations/261_gestion_non_remise.sql
 *   DATABASE_URL=postgresql://localhost:5432/gestion_jetable npm run gestion:boite:epreuve
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { oublierSchema } from '../lib/gestion/schema';
import { comptesBoite, compterBoite, lireBoiteMail, type LigneBoite } from '../lib/gestion/boiteRepo';
import { lireMessagesDuFil } from '../lib/gestion/carteRepo';
import { mentionNonRemise } from '../lib/gestion/conversation';
import { chiffresNonRemise, lireAvisEnAttente } from '../lib/gestion/nonRemiseRepo';
import { estAvisNonRemise, lireAvis, sorteAvis } from '../lib/gestion/nonRemise';
import type { Etiquette } from '../lib/gestion/ecranUrl';

export const BASE_JETABLE = 'gestion_jetable';

let echecs = 0;
function verifier(quoi: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✅' : '❌'} ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) echecs += 1;
}

async function refusee(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await query(sql, params); return null; } catch (e) { return (e as Error).message; }
}

const etiq = (sorte: Etiquette['sorte']): Etiquette => ({ sorte, evenementId: null } as Etiquette);

/** La liste d'une étiquette, en entier (le volume semé est minuscule). */
async function liste(sorte: Etiquette['sorte']): Promise<LigneBoite[]> {
  return (await lireBoiteMail(null, [], 100, { etiquette: etiq(sorte) })).lignes;
}
const dans = (l: LigneBoite[], filId: number): LigneBoite | undefined => l.find((x) => x.filId === filId);

/** Sème un échange et ses messages. `sens`/`quand` par message ; rend l'identifiant du fil et ceux des messages. */
async function semer(cle: string, objet: string, messages: readonly {
  sens: 'recu' | 'envoye'; quand: string; de: string; deNom?: string | null; dest: string;
  messageId: string; corps?: string;
}[]): Promise<{ filId: number; ids: number[] }> {
  const { rows: f } = await query<{ id: string }>(
    `INSERT INTO gestion_fil (cle, objet_initial) VALUES ($1, $2) RETURNING id`, [cle, objet]);
  const filId = Number(f[0].id);
  const ids: number[] = [];
  for (const m of messages) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_message
         (fil_id, message_id, sens, de_adresse, de_nom, destinataires, nb_destinataires, objet, recu_le, corps_texte,
          dest_a)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8::timestamptz,$9,$10::jsonb) RETURNING id`,
      [filId, m.messageId, m.sens, m.de, m.deNom ?? null, m.dest, objet, m.quand, m.corps ?? 'corps',
        JSON.stringify([{ nom: null, adresse: m.dest }])]);
    ids.push(Number(rows[0].id));
  }
  return { filId, ids };
}

/** Un avis de non-remise, tel qu'un serveur l'écrit vraiment (forme relevée en base le 26/09/2026). */
function corpsAvis(o: { destinataire: string; statut: string; action: string; diagnostic: string; origine?: string }): string {
  return ['** Message non distribué **', '',
    `Un problème est survenu lors de la distribution de votre message à ${o.destinataire}.`, '',
    'Reporting-MTA: dns; googlemail.com',
    ...(o.origine === undefined ? [] : [`X-Original-Message-ID: ${o.origine}`]), '',
    `Final-Recipient: rfc822; ${o.destinataire}`,
    `Action: ${o.action}`,
    `Status: ${o.statut}`,
    `Diagnostic-Code: smtp; ${o.diagnostic}`,
  ].join('\n');
}

async function principal(): Promise<void> {
  const { rows: b } = await query<{ base: string }>('SELECT current_database() AS base');
  if (b[0].base !== BASE_JETABLE) {
    console.error(`\n❌ REFUS : cette épreuve écrit des messages et des avis. Base visée « ${b[0].base} », attendue « ${BASE_JETABLE} ».`);
    console.error(`   Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }
  oublierSchema();
  console.log(`\n╔══ ÉPREUVE DE LA BOÎTE ET DES NON-REMISES sur « ${b[0].base} »\n`);

  // ════ PARTIE A — LA RÈGLE DES DEUX LISTES ════════════════════════════════════════════════════════════════════
  // L'échange d'Arno, reproduit : il écrit à 18:04, on répond à 18:06 puis à 18:15.
  const mixte = await semer('epreuve-mixte', 'test', [
    { sens: 'recu', quand: '2026-09-26T16:04:35Z', de: 'arnaud@exemple.invalid', deNom: 'Arnaud', dest: 'gestion@exemple.invalid', messageId: '<recu-1@exemple.invalid>' },
    { sens: 'envoye', quand: '2026-09-26T16:06:21Z', de: 'gestion@exemple.invalid', dest: 'arnaud@exemple.invalid', messageId: '<envoye-1@exemple.invalid>' },
    { sens: 'envoye', quand: '2026-09-26T16:15:05Z', de: 'gestion@exemple.invalid', dest: 'arnaud@exemple.invalid', messageId: '<envoye-2@exemple.invalid>' },
  ]);
  const queRecu = await semer('epreuve-recu', 'demande seule', [
    { sens: 'recu', quand: '2026-09-20T09:00:00Z', de: 'locataire@exemple.invalid', deNom: 'Mme Martin', dest: 'gestion@exemple.invalid', messageId: '<recu-2@exemple.invalid>' },
  ]);
  const queEnvoye = await semer('epreuve-envoye', 'relance seule', [
    { sens: 'envoye', quand: '2026-09-21T09:00:00Z', de: 'gestion@exemple.invalid', dest: 'proprio@exemple.invalid', messageId: '<envoye-3@exemple.invalid>' },
  ]);

  console.log('① 🔴 L’ÉCHANGE MIXTE EST DANS LES DEUX LISTES — c’est tout le lot');
  const rec = await liste('reception');
  const env = await liste('envoyes');
  const lRec = dans(rec, mixte.filId);
  const lEnv = dans(env, mixte.filId);
  verifier('présent en Réception', lRec !== undefined);
  verifier('présent en Envoyés', lEnv !== undefined);

  console.log('\n② et chaque liste montre SON message, jamais celui de l’autre sens');
  verifier('Réception montre le dernier message REÇU (18:04)',
    lRec?.dernierLe === '2026-09-26T16:04:35Z' && lRec?.dernierSens === 'recu', lRec?.dernierLe ?? '—');
  verifier('Réception montre l’EXPÉDITEUR', lRec?.interlocuteur === 'Arnaud', lRec?.interlocuteur ?? '—');
  verifier('Envoyés montre le dernier message ENVOYÉ (18:15), pas celui de 18:06',
    lEnv?.dernierLe === '2026-09-26T16:15:05Z' && lEnv?.dernierSens === 'envoye', lEnv?.dernierLe ?? '—');
  verifier('🔴 Envoyés montre le DESTINATAIRE, et sous le nom connu dans l’échange',
    lEnv?.interlocuteur === 'Arnaud', lEnv?.interlocuteur ?? '—');

  console.log('\n③ les échanges à sens unique ne paraissent QUE d’un côté');
  verifier('« demande seule » en Réception seulement',
    dans(rec, queRecu.filId) !== undefined && dans(env, queRecu.filId) === undefined);
  verifier('« relance seule » en Envoyés seulement',
    dans(env, queEnvoye.filId) !== undefined && dans(rec, queRecu.filId) !== undefined
      && dans(rec, queEnvoye.filId) === undefined);

  console.log('\n④ les compteurs disent EXACTEMENT ce que les listes montrent');
  const c = await comptesBoite();
  verifier('colonne de gauche : Réception = longueur de la liste', c.reception === rec.length, `${c.reception} / ${rec.length}`);
  verifier('colonne de gauche : Envoyés = longueur de la liste', c.envoyes === env.length, `${c.envoyes} / ${env.length}`);
  verifier('en-tête de liste : Réception identique', (await compterBoite(false, 'recu', true)) === rec.length);
  verifier('en-tête de liste : Envoyés identique', (await compterBoite(false, 'envoye', true)) === env.length);
  /**
   * 🔴 LA SOMME N'EST PLUS LE TOTAL, ET C'EST NORMAL. Sous l'ancienne règle les deux boîtes étaient disjointes et
   * leur somme valait le nombre d'échanges. Ici l'échange mixte compte deux fois. Le vérifier explicitement évite
   * qu'on « répare » un jour cette prétendue incohérence.
   */
  verifier('la somme DÉPASSE le nombre d’échanges : le mixte compte des deux côtés',
    c.reception + c.envoyes === 4 && c.lisibles === 3, `${c.reception} + ${c.envoyes} pour ${c.lisibles} échanges`);

  console.log('\n⑤ la corbeille, et le retour automatique — par la règle du sens');
  await query(`UPDATE gestion_fil SET corbeille_le = '2026-09-26T17:00:00Z' WHERE id = $1`, [mixte.filId]);
  verifier('mis à la corbeille : il quitte les DEUX listes',
    dans(await liste('reception'), mixte.filId) === undefined
      && dans(await liste('envoyes'), mixte.filId) === undefined);
  verifier('et il apparaît sous « Corbeille »', dans(await liste('corbeille'), mixte.filId) !== undefined);
  // Un nouveau message REÇU, postérieur au geste : il revient — en Réception seulement, puisque rien n'a été envoyé après.
  await query(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, de_nom, destinataires, nb_destinataires,
                                  objet, recu_le, corps_texte)
     VALUES ($1, '<recu-3@exemple.invalid>', 'recu', 'arnaud@exemple.invalid', 'Arnaud',
             'gestion@exemple.invalid', 1, 'test', '2026-09-26T18:00:00Z', 'et une relance')`, [mixte.filId]);
  verifier('🔴 un nouveau message REÇU le ramène en Réception, tout seul',
    dans(await liste('reception'), mixte.filId) !== undefined);
  verifier('mais PAS en Envoyés : rien n’a été envoyé depuis le geste',
    dans(await liste('envoyes'), mixte.filId) === undefined);
  await query(`UPDATE gestion_fil SET corbeille_le = NULL WHERE id = $1`, [mixte.filId]);

  // ════ PARTIE B — LES AVIS DE NON-REMISE ══════════════════════════════════════════════════════════════════════
  console.log('\n⑥ 🔴 UN AVIS DE NON-REMISE SE RATTACHE AU MESSAGE QU’IL CONCERNE');
  // Trois avis, dans un échange à eux comme la relève les capture.
  await semer('epreuve-avis', 'Delivery Status Notification (Failure)', [
    {
      sens: 'recu', quand: '2026-09-21T09:05:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
      messageId: '<avis-1@exemple.invalid>',
      corps: corpsAvis({
        destinataire: 'proprio@exemple.invalid', statut: '5.1.1', action: 'failed',
        diagnostic: '550 5.1.1 The email account does not exist', origine: '<envoye-3@exemple.invalid>',
      }),
    },
    {
      // Cite un message que nous ne connaissons pas : envoi fait hors de l'application.
      sens: 'recu', quand: '2026-09-21T09:06:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
      messageId: '<avis-2@exemple.invalid>',
      corps: corpsAvis({
        destinataire: 'inconnu@exemple.invalid', statut: '5.7.1', action: 'failed',
        diagnostic: '550 5.7.1 rejected per SPAM policy', origine: '<jamais-vu@ailleurs.invalid>',
      }),
    },
    {
      // Un avis de BONNE remise : il ne doit RIEN produire.
      sens: 'recu', quand: '2026-09-21T09:07:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
      messageId: '<avis-3@exemple.invalid>',
      corps: corpsAvis({
        destinataire: 'proprio@exemple.invalid', statut: '2.0.0', action: 'delivered',
        diagnostic: '250 2.0.0 OK', origine: '<envoye-3@exemple.invalid>',
      }),
    },
  ]);
  // Et un avis qui cite le Message-ID d'un message REÇU : le garde « sens = envoye » doit refuser de le rattacher.
  await semer('epreuve-avis-recu', 'Delivery Status Notification (Failure)', [{
    sens: 'recu', quand: '2026-09-21T09:08:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
    messageId: '<avis-4@exemple.invalid>',
    corps: corpsAvis({
      destinataire: 'x@exemple.invalid', statut: '5.1.1', action: 'failed',
      diagnostic: '550 no such user', origine: '<recu-2@exemple.invalid>',
    }),
  }]);

  const lus = await lireAvisEnAttente(4000, 500);
  verifier('les quatre avis sont reconnus', lus.reconnus === 4, `${lus.reconnus}`);
  verifier('🔴 l’avis de BONNE remise n’est PAS inscrit', lus.inscrits === 3, `${lus.inscrits} inscrit(s)`);
  verifier('un seul est rattaché : celui qui cite un message que nous avons ENVOYÉ',
    lus.rattaches === 1, `${lus.rattaches}`);
  verifier('les deux autres sont orphelins, et le restent', lus.orphelins === 2, `${lus.orphelins}`);

  console.log('\n⑦ le message d’origine le DIT, dans le fil');
  const fil = await lireMessagesDuFil(queEnvoye.filId, [], false);
  const m = fil?.messages.find((x) => x.messageIdRfc === '<envoye-3@exemple.invalid>');
  const mention = m === undefined ? null : mentionNonRemise(m);
  verifier('le message porte l’avis', (m?.nonRemises ?? []).length === 1);
  verifier('🔴 la phrase dit « non distribué », le destinataire ET la cause',
    mention !== null && mention.definitif
      && mention.texte.includes('non distribué')
      && mention.texte.includes('proprio@exemple.invalid')
      && mention.texte.includes('n’existe pas'), mention?.texte ?? '—');

  console.log('\n⑧ et la LIGNE d’Envoyés le dit aussi — sans avoir à ouvrir l’échange');
  const ligneEnv = dans(await liste('envoyes'), queEnvoye.filId);
  verifier('la ligne porte la mention', ligneEnv?.nonRemise !== null && ligneEnv?.nonRemise !== undefined);
  verifier('elle est marquée DÉFINITIVE', ligneEnv?.nonRemise?.sorte === 'permanent');
  verifier('et la Réception, elle, n’en parle pas : rien n’y a échoué',
    dans(await liste('reception'), queRecu.filId)?.nonRemise === null);

  console.log('\n⑨ l’idempotence, et ce que la base refuse');
  const relance = await lireAvisEnAttente(4000, 500);
  verifier('relancer n’inscrit RIEN de plus', relance.inscrits === 0, `${relance.inscrits}`);
  verifier('UPDATE refusé', (await refusee(`UPDATE gestion_non_remise SET motif = 'réécrit'`)) !== null);
  verifier('DELETE refusé', (await refusee('DELETE FROM gestion_non_remise')) !== null);
  verifier('TRUNCATE refusé', (await refusee('TRUNCATE gestion_non_remise')) !== null);
  verifier('une sorte inventée est refusée', (await refusee(
    `INSERT INTO gestion_non_remise (avis_message_id, sorte, motif)
     SELECT id, 'peut-etre', 'x' FROM gestion_message WHERE message_id = '<recu-1@exemple.invalid>'`)) !== null);
  verifier('un motif vide est refusé', (await refusee(
    `INSERT INTO gestion_non_remise (avis_message_id, sorte, motif)
     SELECT id, 'permanent', '  ' FROM gestion_message WHERE message_id = '<recu-1@exemple.invalid>'`)) !== null);
  verifier('🔴 un avis rattaché à LUI-MÊME est refusé', (await refusee(
    `INSERT INTO gestion_non_remise (avis_message_id, origine_message_id, sorte, motif)
     SELECT id, id, 'permanent', 'x' FROM gestion_message WHERE message_id = '<recu-1@exemple.invalid>'`)) !== null);

  console.log('\n⑩ les chiffres d’ensemble, et la lecture pure sur les mêmes textes');
  const t = await chiffresNonRemise();
  verifier('trois avis, tous définitifs', t?.total === 3 && t?.permanents === 3, `${t?.total ?? '—'}`);
  verifier('un rattaché, deux orphelins', t?.rattaches === 1 && t?.orphelins === 2);
  // La fonction pure, sur la MÊME forme de texte : ce que la base a fait, un test unitaire peut le refaire.
  const brut = corpsAvis({
    destinataire: 'x@exemple.invalid', statut: '4.2.2', action: 'delayed',
    diagnostic: '452 4.2.2 The recipient’s inbox is out of storage space',
  });
  verifier('un 4.2.2 est un RETARD, pas une perte',
    sorteAvis(lireAvis(brut)) === 'temporaire', sorteAvis(lireAvis(brut)));
  verifier('une RÉPONSE à un avis n’est pas un avis', !estAvisNonRemise({
    deAdresse: 'collegue@exemple.invalid', objet: 'Re: Delivery Status Notification (Failure)', corps: 'Salut,',
  }));

  /**
   * ⑪ 🔴 « LE PLUS RÉCENT » SUIT LA DATE DE L'AVIS, PAS L'ORDRE D'INSERTION.
   *
   * Défaut trouvé au premier rattrapage réel (27/09/2026) : 74 avis étalés sur vingt mois avaient tous le même
   * `constate_le`, à la seconde près. On sème donc ici l'ordre CONTRAIRE — l'avis le plus RÉCENT est inscrit en
   * PREMIER, donc porte le plus petit identifiant. Un tri sur l'insertion choisirait l'autre.
   */
  console.log('\n⑪ 🔴 entre DEUX avis, c’est la DATE DE L’AVIS qui tranche — pas l’ordre où on les a lus');
  const deuxAvis = await semer('epreuve-deux-avis', 'relance double', [
    { sens: 'envoye', quand: '2026-09-01T09:00:00Z', de: 'gestion@exemple.invalid', dest: 'deux@exemple.invalid', messageId: '<envoye-4@exemple.invalid>' },
  ]);
  await semer('epreuve-avis-recent', 'Delivery Status Notification (Delay)', [{
    // LE PLUS RÉCENT, semé d'abord : identifiant le plus PETIT.
    sens: 'recu', quand: '2026-09-25T10:00:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
    messageId: '<avis-recent@exemple.invalid>',
    corps: corpsAvis({
      destinataire: 'deux@exemple.invalid', statut: '4.2.2', action: 'delayed',
      diagnostic: '452 4.2.2 boite pleine AUJOURD-HUI', origine: '<envoye-4@exemple.invalid>',
    }),
  }]);
  await semer('epreuve-avis-ancien', 'Delivery Status Notification (Delay)', [{
    // LE PLUS ANCIEN, semé ensuite : identifiant le plus GRAND. C'est lui qu'un tri sur l'insertion choisirait.
    sens: 'recu', quand: '2026-09-02T10:00:00Z', de: 'mailer-daemon@googlemail.com', dest: 'gestion@exemple.invalid',
    messageId: '<avis-ancien@exemple.invalid>',
    corps: corpsAvis({
      destinataire: 'deux@exemple.invalid', statut: '4.4.1', action: 'delayed',
      diagnostic: 'timed out IL Y A LONGTEMPS', origine: '<envoye-4@exemple.invalid>',
    }),
  }]);
  await lireAvisEnAttente(4000, 500);

  const ligneDeux = dans(await liste('envoyes'), deuxAvis.filId);
  verifier('la ligne montre l’avis le plus RÉCENT (boîte pleine), pas le plus anciennement daté',
    (ligneDeux?.nonRemise?.phrase ?? '').includes('pleine'), ligneDeux?.nonRemise?.phrase ?? '—');
  const filDeux = await lireMessagesDuFil(deuxAvis.filId, [], false);
  const mDeux = filDeux?.messages.find((x) => x.messageIdRfc === '<envoye-4@exemple.invalid>');
  verifier('le message porte LES DEUX avis : aucun n’est perdu', (mDeux?.nonRemises ?? []).length === 2,
    `${(mDeux?.nonRemises ?? []).length}`);
  verifier('et le plus récent est en tête', (mDeux?.nonRemises ?? [])[0]?.phrase.includes('pleine') === true);

  console.log('');
  if (echecs === 0) console.log('╚══ ✅ ÉPREUVE PASSÉE — les deux listes et les avis tiennent sur de vraies lignes.\n');
  else { console.log(`╚══ ❌ ${echecs} ÉCHEC(S).\n`); process.exitCode = 1; }
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
