/**
 * CLI `gestion:rattachement:epreuve` — MODULE « GESTION », LOT RATTACHEMENT-1 : L'ÉPREUVE SUR CLUSTER JETABLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PEUT PROUVER. `npm test` éprouve le moteur sur des jeux fictifs, en mémoire : c'est
 * nécessaire et insuffisant. Ce que PostgreSQL fait VRAIMENT — un index unique PARTIEL qui laisse remettre un lien
 * retiré, un `ON CONFLICT` qui met à jour au lieu de doubler, un trigger append-only qui refuse qu'on corrige le
 * journal, une contrainte qui rejette une cible sans identité — ne se mesure que sur une vraie base.
 *
 * 🔴 ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR `gestion_jetable`. Elle EFFACE le courrier et l'annuaire entre deux
 * épreuves : lancée par mégarde sur la base de travail, elle détruirait 56 805 mails. Le garde est la PREMIÈRE chose
 * qu'elle fait, avant toute lecture, et aucune option ne le contourne.
 *
 * COMMENT FABRIQUER LA BASE ET LANCER L'ÉPREUVE :
 *   psql -d postgres -c 'DROP DATABASE IF EXISTS gestion_jetable'
 *   psql -d postgres -c 'CREATE DATABASE gestion_jetable'
 *   pg_dump --schema-only --no-owner --no-privileges sansvisavis | psql -q -d gestion_jetable
 *   psql -v ON_ERROR_STOP=1 -d gestion_jetable -f db/migrations/257_gestion_rattachement.sql
 *   DATABASE_URL=postgresql://localhost:5432/gestion_jetable npm run gestion:rattachement:epreuve
 *
 * 🔒 ELLE N'ÉCRIT QUE DES DONNÉES INVENTÉES : adresses en @fictif.fr, clés de lot « J-… », et aucun nom réel.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { oublierSchema, rattachementsDisponibles } from '../lib/gestion/schema';
import {
  chargerLibelles, changerStatut, chiffresRattachement, examinerPaquet, fileATrier, liensDeLaPiece,
  liensDesMessages, rattacher, COMPTES_VIDES, type ComptesPasse,
} from '../lib/gestion/rattachementRepo';
import { cibleCourte, cibleLot, cibleProprietaire } from '../lib/gestion/rattachement';

/** Le SEUL nom de base sur lequel cette épreuve accepte de travailler. */
export const BASE_JETABLE = 'gestion_jetable';

const AUTEUR = { id: null, libelle: 'épreuve automatique' };

let echecs = 0;
function verifier(quoi: string, condition: boolean, detail = ''): void {
  if (condition) { console.log(`  ✅ ${quoi}${detail === '' ? '' : ` — ${detail}`}`); return; }
  echecs += 1;
  console.log(`  ❌ ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
}

async function compte(table: string, ou = 'true'): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table} WHERE ${ou}`);
  return Number(rows[0].n);
}

/** Est-ce que cette écriture est REFUSÉE par la base ? Rend le message, ou `null` si elle a passé. */
async function refusee(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await query(sql, params);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

// ── LE JEU D'ESSAI ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * CINQ FILS, SEPT MAILS, ET DE QUOI ÉPROUVER CHAQUE RÈGLE. Tout est inventé.
 *
 *  · fil 1 — mail 1 : le locataire du lot J-1 écrit (occupé à la date)         ⇒ automatique, lot J-1
 *             mail 2 : un syndic inconnu écrit dans le même fil                ⇒ à trier PAR LA RÈGLE b
 *  · fil 2 — mail 3 : deux locataires de DEUX lots du MÊME bailleur            ⇒ à trier, 3 candidats (règle a)
 *  · fil 3 — mail 4 : nous seuls (gestion@ + compta externalisée), SEUL        ⇒ sans candidat
 *  · fil 4 — mail 5 : un locataire PARTI (bail clos avant la date), SEUL       ⇒ sans candidat, mais RECONNU
 *  · fil 5 — mail 6 : le bailleur seul                                        ⇒ automatique, propriétaire P-1
 *             mail 7 : le locataire de J-1, porte DEUX pièces jointes          ⇒ automatique, sert à l'héritage
 *
 * 🔴 POURQUOI LES MAILS 4 ET 5 SONT SEULS DANS LEUR FIL, et ce n'est pas un détail de mise en scène. À la première
 * exécution de cette épreuve, ils partageaient un fil avec des mails informatifs : la règle b les rattrapait, et
 * leur proposait les cibles de leurs voisins. Le moteur avait RAISON — un mail de ce fil-là fait bien partie de
 * l'échange — mais on ne prouvait plus ce qu'on voulait prouver : qu'une adresse INTERNE, et qu'un locataire PARTI,
 * ne rattachent rien PAR EUX-MÊMES. Pour éprouver une règle, il faut la mettre seule.
 */
async function semer(): Promise<{ messages: number[]; pieces: number[]; repereJournal: number }> {
  /**
   * 🔴 `gestion_journal` N'EST PAS DANS CE TRUNCATE, ET IL NE PEUT PAS L'ÊTRE. Un trigger `BEFORE TRUNCATE` le
   * refuse — mesuré à la première exécution de cette épreuve : « gestion_journal est APPEND-ONLY (pièce de preuve) :
   * TRUNCATE interdit ». C'est précisément la garantie qu'on veut, et elle vaut aussi contre nous. On prend donc un
   * REPÈRE et on ne compte que ce qui s'écrit après lui : sans cela, les lignes des épreuves précédentes seraient
   * comptées avec celles de la passe en cours, et les vérifications se mettraient à réussir toutes seules.
   */
  const { rows: repere } = await query<{ n: string | null }>('SELECT max(id)::text AS n FROM gestion_journal');
  const repereJournal = Number(repere[0]?.n ?? 0);

  await query(`TRUNCATE gestion_rattachement, gestion_rattachement_examen, gestion_message_adresse,
                        gestion_piece, gestion_message, gestion_fil,
                        gestion_annuaire_contact, gestion_annuaire_occupation, gestion_annuaire_locataire,
                        gestion_annuaire_lot, gestion_annuaire_proprietaire
               RESTART IDENTITY CASCADE`);

  // ── L'ANNUAIRE : un bailleur, deux lots, deux locataires en place, un locataire parti ────────────────────────
  const { rows: prop } = await query<{ id: string }>(
    `INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise)
     VALUES ('P-1', 'BAILLEUR', 'BAILLEUR Fictif', 'bailleur fictif') RETURNING id`);
  const propId = Number(prop[0].id);

  const lots: Record<string, number> = {};
  for (const [cle, adresse] of [['J-1', '1 rue Inventée'], ['J-2', '2 rue Inventée']] as const) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_annuaire_lot
         (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, commune, code_postal)
       VALUES ($1, $2, 'BAILLEUR Fictif', $3, 'VILLEFICTIVE', '99999') RETURNING id`, [cle, propId, adresse]);
    lots[cle] = Number(rows[0].id);
  }

  const locs: Record<string, number> = {};
  for (const nom of ['LOC-UN', 'LOC-DEUX', 'LOC-PARTI']) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise)
       VALUES (lower($1), $1, $1, lower($1)) RETURNING id`, [nom]);
    locs[nom] = Number(rows[0].id);
  }

  // LOC-UN occupe J-1 depuis 2020, LOC-DEUX occupe J-2 depuis 2020, LOC-PARTI a quitté J-1 en 2019.
  await query(
    `INSERT INTO gestion_annuaire_occupation
       (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie) VALUES
       ('O-1', $1, $2, 'J-1', DATE '2020-01-01', NULL),
       ('O-2', $3, $4, 'J-2', DATE '2020-01-01', NULL),
       ('O-3', $5, $2, 'J-1', DATE '2015-01-01', DATE '2019-12-31')`,
    [locs['LOC-UN'], lots['J-1'], locs['LOC-DEUX'], lots['J-2'], locs['LOC-PARTI']]);

  for (const [sujet, id, email] of [
    ['proprietaire', propId, 'bailleur@fictif.fr'],
    ['locataire', locs['LOC-UN'], 'un@fictif.fr'],
    ['locataire', locs['LOC-DEUX'], 'deux@fictif.fr'],
    ['locataire', locs['LOC-PARTI'], 'parti@fictif.fr'],
  ] as const) {
    await query(
      `INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute)
       VALUES ($1, $2, 'email', $3, $3)`, [sujet, id, email]);
  }

  // ── LE COURRIER ─────────────────────────────────────────────────────────────────────────────────────────────
  const fils: number[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const { rows } = await query<{ id: string }>(
      'INSERT INTO gestion_fil (cle, objet_initial) VALUES ($1, $1) RETURNING id', [`fil-jetable-${i}`]);
    fils.push(Number(rows[0].id));
  }

  const messages: number[] = [];
  const plan: { fil: number; de: string; date: string }[] = [
    { fil: fils[0], de: 'un@fictif.fr', date: '2024-03-01T10:00:00Z' },
    { fil: fils[0], de: 'syndic@fictif.fr', date: '2024-03-02T10:00:00Z' },
    { fil: fils[1], de: 'un@fictif.fr', date: '2024-04-01T10:00:00Z' },
    { fil: fils[2], de: 'gestion@criterimmo.fr', date: '2024-04-02T10:00:00Z' },
    { fil: fils[3], de: 'parti@fictif.fr', date: '2024-05-01T10:00:00Z' },
    { fil: fils[4], de: 'bailleur@fictif.fr', date: '2024-05-02T10:00:00Z' },
    { fil: fils[4], de: 'un@fictif.fr', date: '2024-05-03T10:00:00Z' },
  ];
  for (const [i, p] of plan.entries()) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le)
       VALUES ($1, $2, 'recu', $3, $4::timestamptz) RETURNING id`,
      [p.fil, `<jetable-${i + 1}@fictif.fr>`, p.de, p.date]);
    messages.push(Number(rows[0].id));
  }

  // DEUX pièces sur le dernier mail : c'est l'héritage qu'on veut voir.
  const pieces: number[] = [];
  for (const nom of ['quittance.pdf', 'photo.jpg']) {
    const { rows } = await query<{ id: string }>(
      'INSERT INTO gestion_piece (message_id, nom_fichier) VALUES ($1, $2) RETURNING id',
      [messages[6], nom]);
    pieces.push(Number(rows[0].id));
  }

  // ── LA TRACE DES ADRESSES (ce que le lot DRIVE-2-bis écrit) ─────────────────────────────────────────────────
  const a = async (
    msg: number, adresse: string, role: string, interne: boolean,
    partie: string | null, prop: string | null, loc: number | null, lot: string | null, motif: string,
  ): Promise<void> => {
    await query(
      `INSERT INTO gestion_message_adresse
         (message_id, adresse, adresse_brute, role, interne, partie, proprietaire_cle, locataire_id, lot_cle, motif)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [msg, adresse, role, interne, partie, prop, loc, lot, motif]);
  };

  // mail 1 : le locataire du lot J-1, et nous.
  await a(messages[0], 'un@fictif.fr', 'expediteur', false, 'locataire', 'P-1', locs['LOC-UN'], 'J-1', 'bail en cours');
  await a(messages[0], 'gestion@criterimmo.fr', 'destinataire', true, null, null, null, null, 'adresse interne');
  // mail 2 : un syndic inconnu, et nous. Rien de reconnu → la règle b doit le rattraper par le fil.
  await a(messages[1], 'syndic@fictif.fr', 'expediteur', false, null, null, null, null, 'inconnue de l’annuaire');
  await a(messages[1], 'gestion@criterimmo.fr', 'destinataire', true, null, null, null, null, 'adresse interne');
  // mail 3 : DEUX locataires, DEUX lots, MÊME bailleur → trois candidats.
  await a(messages[2], 'un@fictif.fr', 'expediteur', false, 'locataire', 'P-1', locs['LOC-UN'], 'J-1', 'bail en cours');
  await a(messages[2], 'deux@fictif.fr', 'copie', false, 'locataire', 'P-1', locs['LOC-DEUX'], 'J-2', 'bail en cours');
  // mail 4 : NOUS SEULS — dont la comptabilité externalisée, marquée interne.
  await a(messages[3], 'gestion@criterimmo.fr', 'expediteur', true, null, null, null, null, 'adresse interne');
  await a(messages[3], 'compta@partenaire-fictif.fr', 'destinataire', true, 'locataire', 'P-1', locs['LOC-UN'], 'J-1',
    'partenaire interne : jamais une clé de rattachement');
  // mail 5 : le locataire PARTI — reconnu, mais aucun bail à la date du mail.
  await a(messages[4], 'parti@fictif.fr', 'expediteur', false, 'locataire', null, locs['LOC-PARTI'], null,
    'locataire, mais aucun bail en cours à la date du mail');
  // mail 6 : le bailleur seul.
  await a(messages[5], 'bailleur@fictif.fr', 'expediteur', false, 'proprietaire', 'P-1', null, null,
    'adresse d’un propriétaire');
  // mail 7 : le locataire du lot J-1, celui qui porte les deux pièces.
  await a(messages[6], 'un@fictif.fr', 'expediteur', false, 'locataire', 'P-1', locs['LOC-UN'], 'J-1', 'bail en cours');

  return { messages, pieces, repereJournal };
}

/** Une passe complète du moteur, du premier fil au dernier. Rend ses comptes. */
async function passe(appliquer: boolean): Promise<ComptesPasse> {
  const libelles = await chargerLibelles();
  const c: ComptesPasse = { ...COMPTES_VIDES };
  let depuis = 0;
  for (;;) {
    const suivant = await examinerPaquet(depuis, 50, libelles, c, appliquer);
    if (suivant === null) break;
    depuis = suivant;
  }
  return c;
}

async function principal(): Promise<void> {
  const { rows } = await query<{ base: string }>('SELECT current_database() AS base');
  const base = rows[0].base;
  if (base !== BASE_JETABLE) {
    console.error(`\n❌ REFUS : cette épreuve EFFACE le courrier et l'annuaire. Base visée « ${base} », attendue « ${BASE_JETABLE} ».`);
    console.error(`   Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }
  oublierSchema();
  if (!(await rattachementsDisponibles())) {
    console.error(`\n❌ La migration 257 n'est pas appliquée sur « ${base} ».`);
    console.error(`   psql -v ON_ERROR_STOP=1 -d ${BASE_JETABLE} -f db/migrations/257_gestion_rattachement.sql\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n╔══ ÉPREUVE DES RATTACHEMENTS sur « ${base} »\n`);
  const { messages, pieces, repereJournal } = await semer();
  /** Le journal DE CETTE ÉPREUVE seulement : les lignes écrites après le repère. */
  const journal = (ou: string): Promise<number> => compte('gestion_journal', `id > ${repereJournal} AND ${ou}`);
  console.log(`  semé : ${messages.length} mails, ${pieces.length} pièces, 2 lots, 1 bailleur, 3 locataires\n`);

  // ── ① LA SIMULATION N'ÉCRIT RIEN ───────────────────────────────────────────────────────────────────────────
  console.log('① la simulation calcule tout et n’écrit rien');
  const simul = await passe(false);
  verifier('elle voit les sept mails', simul.messagesVus === 7, `${simul.messagesVus}`);
  verifier('elle annonce 3 automatiques', simul.automatiques === 3, `${simul.automatiques}`);
  verifier('elle annonce 2 à trier', simul.aTrier === 2, `${simul.aTrier}`);
  verifier('elle annonce 2 sans candidat', simul.sansCandidat === 2, `${simul.sansCandidat}`);
  verifier('la table des rattachements est restée VIDE', await compte('gestion_rattachement') === 0);
  verifier('aucun examen n’a été mémorisé', await compte('gestion_rattachement_examen') === 0);

  // ── ② LA PASSE RÉELLE ÉCRIT CE QUE LA SIMULATION ANNONÇAIT ─────────────────────────────────────────────────
  console.log('\n② la passe réelle écrit exactement ce que la simulation annonçait');
  const un = await passe(true);
  verifier('mêmes comptes qu’à blanc',
    un.automatiques === simul.automatiques && un.aTrier === simul.aTrier
    && un.sansCandidat === simul.sansCandidat);
  verifier('7 examens mémorisés', await compte('gestion_rattachement_examen') === 7);
  verifier('3 liens vivants', await compte('gestion_rattachement', "statut = 'confirme'") === 3);
  verifier('les candidats sont « proposés », pas « confirmés »',
    await compte('gestion_rattachement', "statut = 'propose'") === un.candidatsEcrits,
    `${un.candidatsEcrits}`);

  // ── ③ ADRESSES INTERNES IGNORÉES ───────────────────────────────────────────────────────────────────────────
  console.log('\n③ 🔴 nos adresses ne rattachent RIEN — même celle de la comptabilité externalisée');
  const m4 = await compte('gestion_rattachement', `message_id = ${messages[3]}`);
  verifier('le mail où NOUS sommes seuls n’a aucun lien', m4 === 0, `${m4} lien(s)`);
  const { rows: ex4 } = await query<{ issue: string; adresses_utiles: number }>(
    'SELECT issue, adresses_utiles FROM gestion_rattachement_examen WHERE message_id = $1', [messages[3]]);
  verifier('et il est marqué « sans candidat », 0 adresse utile',
    ex4[0].issue === 'sans_candidat' && ex4[0].adresses_utiles === 0);

  // ── ④ LE LOT À LA DATE DU MAIL ─────────────────────────────────────────────────────────────────────────────
  console.log('\n④ 🔴 le lot occupé À LA DATE DU MAIL — un locataire parti ne rattache rien');
  const m5 = await compte('gestion_rattachement', `message_id = ${messages[4]}`);
  verifier('le mail du locataire parti n’a aucun lien', m5 === 0, `${m5} lien(s)`);
  const { rows: ex5 } = await query<{ issue: string; adresses_utiles: number; motif: string }>(
    'SELECT issue, adresses_utiles, motif FROM gestion_rattachement_examen WHERE message_id = $1', [messages[4]]);
  verifier('il est « sans candidat » mais RECONNU (1 adresse utile)',
    ex5[0].issue === 'sans_candidat' && ex5[0].adresses_utiles === 1);
  verifier('et le motif ne prétend pas qu’il est inconnu',
    !ex5[0].motif.includes('aucune adresse de l’échange'), ex5[0].motif.slice(0, 60));
  const { rows: ex1 } = await query<{ issue: string }>(
    'SELECT issue FROM gestion_rattachement_examen WHERE message_id = $1', [messages[0]]);
  verifier('le locataire EN PLACE, lui, est rattaché automatiquement', ex1[0].issue === 'automatique');

  // ── ④bis LA RÈGLE b — ET LE FAIT QU'ELLE NE DÉCIDE JAMAIS SEULE ────────────────────────────────────────────
  console.log('\n④bis 🔴 le mail d’un tiers est rattrapé par son échange — en CANDIDAT, jamais en lien');
  const { rows: lb } = await query<{ regle: string; statut: string; confiance: string }>(
    `SELECT regle, statut, confiance FROM gestion_rattachement WHERE message_id = $1 ORDER BY id`, [messages[1]]);
  verifier('le syndic inconnu reçoit des candidats', lb.length > 0, `${lb.length}`);
  verifier('tous viennent de la règle b', lb.every((l) => l.regle === 'b'));
  verifier('🔴 AUCUN n’est confirmé d’office', lb.every((l) => l.statut === 'propose'));
  verifier('et aucun n’a la confiance « haute »', lb.every((l) => l.confiance !== 'haute'));

  // ── ⑤ PLUSIEURS LIENS POUR UN SEUL MAIL ────────────────────────────────────────────────────────────────────
  console.log('\n⑤ 🔴 un mail peut être rattaché à PLUSIEURS cibles à la fois');
  const cands3 = await compte('gestion_rattachement', `message_id = ${messages[2]} AND statut = 'propose'`);
  verifier('deux lots du même bailleur ⇒ 3 candidats (2 lots + le bailleur)', cands3 === 3, `${cands3}`);
  // On confirme les DEUX lots : rien dans la base ne doit s'y opposer.
  const { rows: aConfirmer } = await query<{ id: string }>(
    `SELECT id FROM gestion_rattachement WHERE message_id = $1 AND cible_sorte = 'lot' ORDER BY id`, [messages[2]]);
  for (const r of aConfirmer) await changerStatut({ lienId: Number(r.id), statut: 'confirme', auteur: AUTEUR });
  const vivants3 = await compte('gestion_rattachement', `message_id = ${messages[2]} AND statut = 'confirme'`);
  verifier('les DEUX lots sont confirmés ensemble, aucun index ne l’empêche', vivants3 === 2, `${vivants3}`);

  // ── ⑥ L'HÉRITAGE DES PIÈCES ────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑥ 🔴 les pièces héritent du rattachement de leur mail');
  const liensPiece = await liensDeLaPiece(pieces[0]);
  verifier('la pièce voit le lien de son mail sans qu’on l’ait répété',
    liensPiece.etat === 'ok' && liensPiece.data.length === 1
    && liensPiece.data[0].pieceId === null && cibleCourte(liensPiece.data[0].cible) === 'lot:J-1',
    liensPiece.etat === 'ok' ? liensPiece.data.map((l) => cibleCourte(l.cible)).join(', ') : liensPiece.etat);

  // Un lien PROPRE à une pièce s'AJOUTE, il ne remplace pas celui du mail.
  await rattacher({
    messageId: messages[6], pieceId: pieces[0], cible: cibleProprietaire('P-1'), auteur: AUTEUR,
    motif: 'cette quittance concerne le bailleur',
  });
  const apres = await liensDeLaPiece(pieces[0]);
  verifier('un lien propre à la pièce s’AJOUTE à celui du mail',
    apres.etat === 'ok' && apres.data.length === 2);
  const autre = await liensDeLaPiece(pieces[1]);
  verifier('et il ne contamine pas l’autre pièce du même mail',
    autre.etat === 'ok' && autre.data.length === 1, autre.etat === 'ok' ? `${autre.data.length}` : autre.etat);

  // ── ⑦ RETRAIT RÉVERSIBLE ET JOURNALISÉ ─────────────────────────────────────────────────────────────────────
  console.log('\n⑦ 🔴 un retrait ne supprime RIEN, se journalise, et se défait');
  const { rows: aRetirer } = await query<{ id: string }>(
    `SELECT id FROM gestion_rattachement WHERE message_id = $1 AND statut = 'confirme' LIMIT 1`, [messages[0]]);
  const lienId = Number(aRetirer[0].id);
  const avant = await compte('gestion_rattachement');
  const r1 = await changerStatut({ lienId, statut: 'retire', auteur: AUTEUR, motif: 'erreur de rattachement' });
  verifier('le retrait réussit', r1.ok === true);
  verifier('AUCUNE ligne n’a disparu', await compte('gestion_rattachement') === avant, `${avant}`);
  const { rows: apresRetrait } = await query<{ statut: string; statut_le: string | null; qui: string | null }>(
    'SELECT statut, statut_le::text, statut_par_libelle AS qui FROM gestion_rattachement WHERE id = $1', [lienId]);
  verifier('le lien est « retiré », daté et signé',
    apresRetrait[0].statut === 'retire' && apresRetrait[0].statut_le !== null
    && apresRetrait[0].qui === AUTEUR.libelle);
  verifier('le journal porte le geste',
    await journal(`entite = 'rattachement' AND entite_id = ${lienId} AND action = 'retirer'`) === 1);

  const r2 = await changerStatut({ lienId, statut: 'confirme', auteur: AUTEUR, motif: 'finalement si' });
  verifier('on le REMET, et l’index unique partiel ne s’y oppose pas', r2.ok === true,
    r2.ok ? '' : r2.motif);
  verifier('les deux gestes sont dans le journal, dans l’ordre',
    await journal(`entite = 'rattachement' AND entite_id = ${lienId}`) === 2);

  // ── ⑧ LE MÊME LIEN NE SE POSE PAS DEUX FOIS ────────────────────────────────────────────────────────────────
  console.log('\n⑧ deux clics sur le même bouton ne font pas deux liens');
  const n8 = await compte('gestion_rattachement', `message_id = ${messages[5]}`);
  await rattacher({ messageId: messages[5], cible: cibleProprietaire('P-1'), auteur: AUTEUR });
  await rattacher({ messageId: messages[5], cible: cibleProprietaire('P-1'), auteur: AUTEUR });
  verifier('toujours le même nombre de lignes',
    await compte('gestion_rattachement', `message_id = ${messages[5]}`) === n8, `${n8}`);
  verifier('et la base REFUSE le doublon si on le tente directement',
    (await refusee(
      `INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut)
       VALUES ($1, 'proprietaire', 'P-1', 'manuel', 'confirme')`, [messages[5]])) !== null);

  // ── ⑨ L'IDEMPOTENCE DE LA COMMANDE, ET LE RESPECT DES DÉCISIONS HUMAINES ────────────────────────────────────
  console.log('\n⑨ 🔴 relancer la commande ne double rien, et ne défait AUCUNE décision humaine');
  const etatAvant = await query<{ id: string; statut: string; origine: string }>(
    'SELECT id, statut, origine FROM gestion_rattachement ORDER BY id');
  // On rejette un candidat : le recalcul ne doit PAS le ressusciter.
  const { rows: aRejeter } = await query<{ id: string }>(
    `SELECT id FROM gestion_rattachement WHERE statut = 'propose' LIMIT 1`);
  const rejeteId = Number(aRejeter[0].id);
  await changerStatut({ lienId: rejeteId, statut: 'rejete', auteur: AUTEUR, motif: 'sans rapport' });

  const lignesAvant = await compte('gestion_rattachement');
  const deux = await passe(true);
  verifier('aucun lien nouveau', await compte('gestion_rattachement') === lignesAvant, `${lignesAvant}`);
  verifier('le candidat rejeté N’EST PAS revenu',
    await compte('gestion_rattachement', `id = ${rejeteId} AND statut = 'rejete'`) === 1);
  verifier('aucun second « proposé » n’a été créé à sa place',
    await compte('gestion_rattachement',
      `statut = 'propose' AND id > ${Number(etatAvant.rows[etatAvant.rows.length - 1].id)}`) === 0);
  verifier('le lien confirmé à la main est intact',
    await compte('gestion_rattachement', `id = ${lienId} AND statut = 'confirme'`) === 1);
  verifier('la passe DIT combien de décisions elle a respectées', deux.respectes > 0, `${deux.respectes}`);
  verifier('elle n’a retiré aucun lien : rien n’a changé dans l’annuaire', deux.liensRetires === 0,
    `${deux.liensRetires}`);

  // 🔴 ET QUAND LE MOTEUR RETIRE VRAIMENT, IL LE JOURNALISE. On fait disparaître le bail : le lot J-1 n'est plus
  //   désigné à la date du mail, donc le moteur ne le propose plus.
  const { rows: aRetirerAuto } = await query<{ id: string }>(
    `SELECT id FROM gestion_rattachement
      WHERE origine = 'automatique' AND statut IN ('propose', 'confirme') AND statut_par_libelle IS NULL
      ORDER BY id LIMIT 1`);
  if (aRetirerAuto.length > 0) {
    await query('UPDATE gestion_message_adresse SET lot_cle = NULL, proprietaire_cle = NULL, partie = NULL');
    const trois = await passe(true);
    verifier('un lien que le moteur ne propose plus est RETIRÉ', trois.liensRetires > 0, `${trois.liensRetires}`);
    verifier('et le retrait automatique est JOURNALISÉ',
      await journal(`entite = 'rattachement' AND action = 'retirer'
                     AND auteur_libelle = 'moteur de rattachement'`) === trois.liensRetires,
      `${trois.liensRetires}`);
    verifier('🔴 il n’a PAS touché les liens qu’un humain avait décidés',
      await compte('gestion_rattachement', `id = ${lienId} AND statut = 'confirme'`) === 1);
    verifier('ni les liens posés à la main',
      await compte('gestion_rattachement', "origine = 'manuel' AND statut = 'confirme'") >= 1);
  }
  verifier('les liens manuels sont intacts',
    await compte('gestion_rattachement', "origine = 'manuel'")
      === etatAvant.rows.filter((r) => r.origine === 'manuel').length);

  // ── ⑩ CE QUE LA BASE REFUSE ────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑩ ce que la base refuse, quoi qu’en dise le code');
  verifier('une cible SANS identité',
    (await refusee(
      `INSERT INTO gestion_rattachement (message_id, cible_sorte, origine, statut)
       VALUES ($1, 'lot', 'manuel', 'confirme')`, [messages[0]])) !== null);
  verifier('un événement désigné par une CLÉ au lieu d’un identifiant',
    (await refusee(
      `INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut)
       VALUES ($1, 'evenement', 'P-1', 'manuel', 'confirme')`, [messages[0]])) !== null);
  verifier('un statut inventé',
    (await refusee(
      `INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut)
       VALUES ($1, 'lot', 'J-2', 'manuel', 'peut-être')`, [messages[0]])) !== null);
  verifier('un retrait SANS date',
    (await refusee(
      `INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut)
       VALUES ($1, 'lot', 'J-2', 'manuel', 'retire')`, [messages[0]])) !== null);
  verifier('🔴 une CORRECTION du journal (trigger append-only)',
    (await refusee(
      `UPDATE gestion_journal SET commentaire = 'réécrit' WHERE entite = 'rattachement'`)) !== null);
  verifier('🔴 une SUPPRESSION dans le journal',
    (await refusee("DELETE FROM gestion_journal WHERE entite = 'rattachement'")) !== null);

  // ── ⑪ LA FILE ET LE BANDEAU LISENT CE QUI A ÉTÉ ÉCRIT ──────────────────────────────────────────────────────
  console.log('\n⑪ la file de tri et le bandeau montrent l’état réel');
  const file = await fileATrier({ taille: 10 });
  verifier('la file rend ses totaux', file.etat === 'ok'
    && file.data.totaux.aTrier + file.data.totaux.sansCandidat + file.data.totaux.automatiques === 7,
    file.etat === 'ok' ? JSON.stringify(file.data.totaux) : file.etat);
  verifier('elle ne compte AUCUN mail non examiné',
    file.etat === 'ok' && file.data.totaux.nonExamines === 0);
  const bandeau = await liensDesMessages([messages[0], messages[2]]);
  verifier('le bandeau rend les liens des deux mails demandés en UNE requête',
    bandeau.etat === 'ok' && bandeau.data.size === 2);

  const chiffres = await chiffresRattachement();
  if (chiffres.etat === 'ok') {
    console.log('');
    console.log(`  état final : ${chiffres.data.liensVivants} liens vivants · ${chiffres.data.liensManuels} manuels`
      + ` · ${chiffres.data.liensRetires} retirés · ${chiffres.data.liensRejetes} rejetés`
      + ` · ${chiffres.data.lotsTouches} lot(s) · ${chiffres.data.proprietairesTouches} propriétaire(s)`);
  }

  console.log('');
  if (echecs === 0) {
    console.log('╚══ ✅ ÉPREUVE PASSÉE — la base tient tout ce que le code lui demande.\n');
  } else {
    console.log(`╚══ ❌ ${echecs} ÉCHEC(S).\n`);
    process.exitCode = 1;
  }
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
