/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 4 — LES MAILS CONTRAIRES AUX RÈGLES ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « LES 14 MAILS CONTRAIRES AUX RÈGLES (6 Interne avec bien, 8 Documents CRITERIMMO
 * avec bien) : sauvegarde (Bureau : sauvegarde-avant-reparation-14-mails.sql), liste dans le terminal (fil, message,
 * bien, raison), puis retire ces rattachements par la porte existante (statut 'retire'), tracés. Relance l'audit : 0.
 * Trouve quel chemin a contourné la règle et ferme-le, avec un test. »
 *
 * ═══ 🔴🔴 MON AUDIT S'EST TROMPÉ SUR LES 8 « DOCUMENTS CRITERIMMO », ET IL FAUT LE DIRE AVANT TOUT ════════════════
 *
 * Mon audit comptait les documents sur l'OBJET SEUL (`objet LIKE 'Document CRITERIMMO%'`), sans regarder le SENS.
 * Mesuré le 04/10/2026 :
 *
 *   · 26 126 « Document CRITERIMMO » que NOUS AVONS ENVOYÉS → **0** porte un bien. La règle du 01/10 fonctionne.
 *   · 11 mails REÇUS dont l'objet commence par « Document CRITERIMMO » → 8 portent un bien.
 *
 * 🔴 CES 8 SONT DU VRAI COURRIER CLIENT. Ce sont des réponses à nos documents, renvoyées par le client depuis une
 * messagerie qui n'ajoute pas « Re: » (SFR Mail, Gmail mobile). Le mail 8453 dit, mot pour mot : « Bonjour M Calvo,
 * Est ce que ce document est simplement informatif, ou doit-on régler quelque chose ? […] Emmanuel AUVINET ». C'est
 * une question d'un propriétaire sur son bien.
 *
 * 🔴 ET LA RÈGLE D'ARNO LES PROTÈGE EXPLICITEMENT : « CELA NE CONCERNE QUE NOS ENVOIS. Une RÉPONSE humaine à un
 * document est du vrai courrier client : elle repasse par le moteur normalement et GARDE SES BIENS. »
 * (`rattachement.ts`, encadré du 01/10/2026.) Les retirer effacerait du courrier client de 5 historiques de biens.
 *
 * ⚠️ JE NE LES RETIRE DONC PAS, et c'est une correction de la PRÉMISSE, pas un refus de la consigne. Sur cet axe,
 * le vrai compte est **1** : le mail 57370, « Fwd: Document CRITERIMMO - D11 - Préavis - Accusé », que NOUS avons
 * envoyé et que quelqu'un a rattaché À LA MAIN au bien 188 le 01/10/2026 — le jour même de la règle.
 *
 * ═══ 🔴🔴 LE CHEMIN QUI CONTOURNAIT LA RÈGLE « INTERNE », ET LA CHRONOLOGIE QUI LE PROUVE ════════════════════════
 *
 * Aucun des 6 liens « Interne » n'a été posé APRÈS la marque. Relevé à la seconde :
 *
 *   · liens 172463 / 172464 posés le 03/10 à 11:58:53 → échange 36694 marqué interne le 03/10 à 13:09:55 ;
 *   · lien 172477 posé le 03/10 à 15:11:21            → mail 5499 marqué interne le 04/10 à 09:20:25 ;
 *   · lien 172425 posé le 02/10                        → échange 36665 marqué interne le 03/10 à 15:37:59 ;
 *   · liens 139584 / 139712 posés le 01/10             → mails marqués le 04/10 à 09:20:25.
 *
 * 🔴 PERSONNE N'A DONC CONTOURNÉ LA RÈGLE SUR CES SIX-LÀ : le bien a été rattaché d'abord, la marque posée ensuite,
 * et rien ne retire un rattachement quand on marque un mail « interne ».
 *
 * 🔴 MAIS UN CHEMIN ÉTAIT BEL ET BIEN OUVERT, ET IL L'EST POUR L'AVENIR. Le module sait arbitrer ce conflit :
 * `leverInterneApresRattachement` LÈVE la marque quand un humain rattache un bien (« un rattachement l'emporte sur
 * Interne »). Cette levée exige un auteur HUMAIN — et c'est juste. La passe AUTOMATIQUE, elle, ne levait rien et ne
 * regardait pas la marque : elle pouvait poser un bien confirmé sur un mail marqué interne, sans arbitrage et sans
 * trace. Mesuré : le mail 57433 de l'échange 36665, marqué le 03/10 à 15:37, rendait encore `automatique,
 * certain=448`. Le refus est désormais dans `examinerMessage` (paramètre `interne`), et éprouvé.
 *
 * ═══ 🔒 CE QUE CE SCRIPT ÉCRIT, ET PAR QUELLE PORTE ══════════════════════════════════════════════════════════════
 *
 * UNIQUEMENT par `changerStatut({ statut: 'retire' })` — la porte du lot RATTACHEMENT-1, celle de l'écran, avec son
 * journal (`gestion_rattachement_journal`), son auteur et son motif. Aucun `UPDATE` écrit ici, aucune suppression :
 * la ligne reste, datée, signée et motivée, et l'écran peut la remettre.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/reparer-mails-contraires-aux-regles.ts            ← liste seulement
 *   npx tsx --env-file=.env app/scripts/reparer-mails-contraires-aux-regles.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { query } from '../lib/db/client';
import { changerStatut } from '../lib/gestion/rattachementRepo';
import { lireInterneDesMessages } from '../lib/gestion/interneMessageRepo';
import { lireInterne } from '../lib/gestion/interneRepo';
import { interneDuMail } from '../lib/gestion/interneDuMail';
import { estDocumentEnvoye } from '../lib/gestion/documentsAuto';

/** L'auteur du geste, nommé : le journal doit pouvoir se relire dans six mois. */
const AUTEUR = {
  id: null as number | null,
  libelle: 'réparation lot HISTORIQUES-UNE-SEULE-REGLE point 4 (04/10/2026)',
};

const MOTIF_INTERNE = 'mail marqué « interne » : un mail interne ne concerne aucun bien (lot '
  + 'HISTORIQUES-UNE-SEULE-REGLE, point 4)';
const MOTIF_DOCUMENT = 'document automatique que nous avons envoyé : il se range dans une fiche, jamais dans un '
  + 'bien (lot HISTORIQUES-UNE-SEULE-REGLE, point 4)';

interface Candidat {
  lienId: number; filId: number; messageId: number; bien: string; objet: string;
  origine: string; creeLe: string; raison: 'interne' | 'document_envoye'; motif: string;
}

async function principal(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');

  /**
   * ① TOUS LES LIENS DE BIEN VIVANTS dont le mail est soit marqué « interne », soit un document que nous avons
   *   envoyé. On ratisse large en SQL, et c'est le code de PRODUCTION qui tranche ensuite — `interneDuMail` pour
   *   la marque, `estDocumentEnvoye` pour le document. Trancher en SQL aurait réécrit les deux règles.
   */
  const { rows } = await query<{
    lien_id: string; fil_id: string; message_id: string; bien: string; objet: string | null;
    origine: string; cree_le: string; sens: string | null; exclusion: string | null;
    marque_mail: boolean; marque_fil: boolean;
  }>(
    `SELECT r.id::text AS lien_id, m.fil_id::text, m.id::text AS message_id, r.cible_cle AS bien,
            m.objet, r.origine, r.cree_le::text AS cree_le, m.sens,
            m.exclu_par_regle_id::text AS exclusion,
            EXISTS (SELECT 1 FROM gestion_message_interne mi WHERE mi.message_id = m.id) AS marque_mail,
            EXISTS (SELECT 1 FROM gestion_fil_interne fi
                     WHERE fi.fil_id = m.fil_id AND fi.retire_le IS NULL) AS marque_fil
       FROM gestion_rattachement r
       JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
        AND r.piece_id IS NULL
        AND (EXISTS (SELECT 1 FROM gestion_message_interne mi WHERE mi.message_id = m.id)
          OR EXISTS (SELECT 1 FROM gestion_fil_interne fi
                      WHERE fi.fil_id = m.fil_id AND fi.retire_le IS NULL)
          OR m.objet ILIKE '%Document CRITERIMMO%'
          OR m.exclu_par_regle_id IS NOT NULL)
      ORDER BY r.id`);

  /**
   * Les marques, lues par les dépôts de PRODUCTION (et non par le SQL ci-dessus, qui n'a servi qu'à ratisser).
   *
   * ⚠️ PAR LOTS DE 500, ET CE N'EST PAS UNE COQUETTERIE. Les deux lecteurs bornent leur entrée à 500 identifiants
   * (`MESSAGES_MAX`) — une garde saine pour un écran, un piège pour un script. Ma première version passait la
   * liste entière : les marques au-delà du 500e étaient SILENCIEUSEMENT absentes, et les 6 mails « interne »
   * d'Arno ressortaient comme « pas interne ». Le script se serait cru d'accord avec lui-même.
   */
  const parMail = new Map<number, Awaited<ReturnType<typeof lireInterneDesMessages>> extends Map<number, infer V>
    ? V : never>();
  const desFils = new Map<number, Awaited<ReturnType<typeof lireInterne>> extends Map<number, infer V>
    ? V : never>();
  const messageIds = [...new Set(rows.map((r) => Number(r.message_id)))];
  const filIds = [...new Set(rows.map((r) => Number(r.fil_id)))];
  for (let i = 0; i < messageIds.length; i += 500) {
    for (const [k, v] of await lireInterneDesMessages(messageIds.slice(i, i + 500))) parMail.set(k, v);
  }
  for (let i = 0; i < filIds.length; i += 500) {
    for (const [k, v] of await lireInterne(filIds.slice(i, i + 500))) desFils.set(k, v);
  }

  const retenus: Candidat[] = [];
  const ecartes: string[] = [];
  for (const r of rows) {
    const marque = parMail.get(Number(r.message_id));
    const interne = interneDuMail({
      marqueDuMailVivante: marque?.vivante === true,
      marqueDuMailConnue: marque !== undefined,
      marqueDeLEchange: desFils.has(Number(r.fil_id)),
    });
    const document = estDocumentEnvoye({
      sens: r.sens, objet: r.objet,
      exclusionRegleId: r.exclusion === null ? null : Number(r.exclusion),
    });
    const commun = {
      lienId: Number(r.lien_id), filId: Number(r.fil_id), messageId: Number(r.message_id),
      bien: r.bien, objet: (r.objet ?? '(sans objet)').slice(0, 56), origine: r.origine, creeLe: r.cree_le,
    };
    if (interne) retenus.push({ ...commun, raison: 'interne', motif: MOTIF_INTERNE });
    else if (document) retenus.push({ ...commun, raison: 'document_envoye', motif: MOTIF_DOCUMENT });
    else {
      /* 🔴 CE QU'ON NE RETIRE PAS, ET POURQUOI — les 8 réponses de clients. Voir l'encadré en tête de fichier. */
      ecartes.push(`fil ${r.fil_id} / mail ${r.message_id} — bien ${r.bien} — « ${(r.objet ?? '').slice(0, 44)} » `
        + `— sens=${r.sens ?? '?'} : ni marqué interne, ni un document que NOUS avons envoyé — il garde ses biens`);
    }
  }

  process.stdout.write('mails contraires aux règles — liens de bien vivants\n');
  process.stdout.write(`  liens ratissés ....................... ${rows.length}\n`);
  process.stdout.write(`  🔴 à retirer ......................... ${retenus.length}\n`);
  process.stdout.write(`      dont « interne » ................. ${
    retenus.filter((c) => c.raison === 'interne').length}\n`);
  process.stdout.write(`      dont document que nous envoyons .. ${
    retenus.filter((c) => c.raison === 'document_envoye').length}\n`);
  process.stdout.write(`  ⚠️ écartés (du vrai courrier client) . ${ecartes.length}\n\n`);

  process.stdout.write('  LISTE À RETIRER (fil · message · bien · raison)\n');
  for (const c of retenus) {
    process.stdout.write(`    fil ${c.filId} · message ${c.messageId} · bien ${c.bien} · ${c.raison}`
      + ` · lien ${c.lienId} posé ${c.creeLe.slice(0, 10)} (${c.origine}) · « ${c.objet} »\n`);
  }
  process.stdout.write('\n  LISTE ÉCARTÉE — NE PAS RETIRER\n');
  for (const x of ecartes) process.stdout.write(`    ${x}\n`);

  /**
   * ② LA SAUVEGARDE, AVANT TOUT GESTE. Elle contient de quoi REMETTRE exactement l'état d'avant : les lignes
   *   complètes, en `INSERT` commentés — et surtout les `UPDATE` de remise en l'état, qui est le vrai chemin de
   *   retour (on ne supprime jamais une ligne, on change son statut).
   */
  const ids = retenus.map((c) => c.lienId);
  const { rows: avant } = await query<Record<string, unknown>>(
    `SELECT * FROM gestion_rattachement WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
  const lignes: string[] = [
    '-- ══════════════════════════════════════════════════════════════════════════════════════════════════════',
    '-- SAUVEGARDE AVANT RÉPARATION — lot HISTORIQUES-UNE-SEULE-REGLE, point 4',
    `-- Écrite le ${new Date().toISOString()} par app/scripts/reparer-mails-contraires-aux-regles.ts`,
    '--',
    '-- CE FICHIER NE SUPPRIME RIEN ET NE RECRÉE RIEN : les lignes n’ont pas été supprimées, leur STATUT a été',
    '-- changé en « retire » par la porte normale. Le chemin de retour est donc un UPDATE, écrit plus bas.',
    '-- L’état complet d’avant est conservé en commentaire, colonne par colonne, pour qu’il soit relisible.',
    '-- ══════════════════════════════════════════════════════════════════════════════════════════════════════',
    '',
    '-- ÉTAT D’AVANT, LIGNE PAR LIGNE :',
  ];
  for (const l of avant) {
    lignes.push(`--   ${Object.entries(l).map(([k, v]) => `${k}=${valeurLisible(v)}`).join(' · ')}`);
  }
  lignes.push('', '-- POUR TOUT REMETTRE EN L’ÉTAT (à exécuter à la main, en connaissance de cause) :');
  for (const l of avant) {
    lignes.push(`UPDATE gestion_rattachement SET statut = ${sqlTexte(String(l.statut))},`
      + ` statut_le = ${sqlHorodatage(l.statut_le)},`
      + ` statut_par = ${l.statut_par === null ? 'NULL' : Number(l.statut_par)},`
      + ` statut_par_libelle = ${sqlTexte(l.statut_par_libelle === null ? null : String(l.statut_par_libelle))},`
      + ` statut_motif = ${sqlTexte(l.statut_motif === null ? null : String(l.statut_motif))}`
      + ` WHERE id = ${Number(l.id)};`);
  }
  lignes.push('');
  const dest = join(homedir(), 'Desktop', 'sauvegarde-avant-reparation-14-mails.sql');
  writeFileSync(dest, lignes.join('\n'), 'utf8');
  process.stdout.write(`\n  sauvegarde ........................... ${dest}\n`);

  if (!appliquer) {
    process.stdout.write('\n  ⚠️ RIEN N’A ÉTÉ ÉCRIT. Relancer avec --appliquer pour retirer ces rattachements.\n');
    return;
  }

  /** ③ LE RETRAIT, PAR LA PORTE EXISTANTE ET UNIQUEMENT PAR ELLE. */
  let faits = 0;
  for (const c of retenus) {
    const issue = await changerStatut({ lienId: c.lienId, statut: 'retire', auteur: AUTEUR, motif: c.motif });
    if (issue.ok) { faits += 1; continue; }
    process.stdout.write(`  ⚠️ lien ${c.lienId} non retiré : ${issue.motif}\n`);
  }
  process.stdout.write(`\n  retraits effectués ................... ${faits} / ${retenus.length}\n`);

  /** ④ LE RECOMPTE, APRÈS. Les mêmes règles, relues : il doit rester zéro. */
  const { rows: apres } = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM gestion_rattachement r
       JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.piece_id IS NULL
        AND (EXISTS (SELECT 1 FROM gestion_message_interne mi
                      WHERE mi.message_id = m.id AND mi.retire_le IS NULL)
          OR EXISTS (SELECT 1 FROM gestion_fil_interne fi
                      WHERE fi.fil_id = m.fil_id AND fi.retire_le IS NULL)
          OR (m.sens = 'envoye' AND (m.objet ILIKE '%Document CRITERIMMO%' OR m.exclu_par_regle_id IS NOT NULL)))`);
  process.stdout.write(`  🔴 liens restants contraires aux règles ... ${apres[0]?.n ?? '?'}\n`);
}

/** Un texte SQL échappé, ou `NULL`. Le fichier se relit et s'exécute sans retouche. */
function sqlTexte(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
}

/**
 * ══ 🔴🔴 UN HORODATAGE QUE POSTGRESQL RELIT — et ma première version n'en écrivait pas ════════════════════════════
 *
 * ⚠️ `pg` REND UN `timestamptz` EN OBJET `Date`, et `String(date)` donne la forme JavaScript : « Sat Oct 03 2026
 * 15:11:21 GMT+0200 (Central European Summer Time) ». PostgreSQL REFUSE cette chaîne. Le fichier de sauvegarde
 * était donc lisible mais INEXÉCUTABLE — c'est-à-dire sans valeur le jour où l'on en aurait besoin. On écrit donc
 * la forme ISO, qui est universelle et porte son décalage.
 */
function sqlHorodatage(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
  return `'${String(v).replace(/'/g, "''")}'::timestamptz`;
}

/** La même prudence pour les commentaires : une date lisible est une date ISO, pas une phrase anglaise. */
function valeurLisible(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  return v instanceof Date ? v.toISOString() : String(v);
}

void principal().then(() => process.exit(0));
