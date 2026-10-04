/**
 * ══ 🔴🔴 LOT PREUVE-SUIVI-CONVERSATION — LES PÉRIODES, ÉPROUVÉES SUR UNE VRAIE BASE ════════════════════════════
 *
 * Demande d'Arno (01/10/2026) : « Prouver, par des essais réels et sans toucher à la vraie base, que le bloc
 * “Suivi dans la conversation” se comporte EXACTEMENT comme je l'ai demandé, notamment quand plusieurs fenêtres
 * de configuration se suivent. »
 *
 * ═══ 🔴🔴 CE FICHIER NE TOURNE JAMAIS SUR LA BASE RÉELLE ════════════════════════════════════════════════════════
 *
 * Il ÉCRIT (c'est tout son objet : poser des périodes, des exceptions, des rattachements) et il refuse de
 * démarrer si `DATABASE_URL` ne désigne pas une base de test. Le garde est la PREMIÈRE chose qu'il fait, avant
 * toute requête : une protection qui s'exécuterait après la première écriture ne protégerait rien.
 *
 *   createdb svav_test_suivi && for f in db/migrations/*.sql; do psql svav_test_suivi -f $f; done
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_suivi \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/suiviConversation.itest.ts
 *
 * ⚠️ `.itest.ts` : `npm test` ne le ramasse pas (voir `vitest.config.ts`), et c'est voulu — il demande une base.
 *
 * ═══ CE QU'IL ÉPROUVE, ET DANS QUEL VOCABULAIRE ═════════════════════════════════════════════════════════════════
 *
 * Une PÉRIODE (le mot du code) est une FENÊTRE (le mot d'Arno) : elle commence à un mail et court jusqu'à la
 * suivante. L'HISTORIQUE d'un bien est ce que `gestion_rattachement` porte APRÈS projection — c'est la table que
 * tout le reste de l'application lit, et donc la seule preuve qui vaille.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query, closePool } from '../db/client';
import {
  poserClassement, heriterLesNouveauxMails, simplifierLeFil, suiviDuFil, mailsDuFil,
} from './periodeRepo';
import { projeter, mailsDuBien, reperesDuFil, periodeEnCours } from './periodesConversation';
import { changerStatut, rattacher } from './rattachementRepo';
import { lireInterne } from './interneRepo';
/**
 * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE — « CE MAIL EST-IL INTERNE ? » SE DEMANDE À LA RÈGLE, PAS À UNE TABLE.
 *
 * Les scénarios S8 et S12 posaient la question à `gestion_fil_interne` seule. Depuis la migration 297, la vérité
 * est la marque PAR MAIL, et la marque d'échange n'est plus qu'un REPLI : regarder une seule des deux tables fait
 * conclure à côté. `interneDuMail` porte les trois cas, et c'est lui que l'application lit.
 */
import { lireInterneDesMessages } from './interneMessageRepo';
import { interneDuMail } from './interneDuMail';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE GARDE : CETTE ÉPREUVE ÉCRIT, ELLE NE DOIT TOUCHER QU'UNE BASE JETABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const URL_BASE = process.env.DATABASE_URL ?? '';
const NOM_BASE = URL_BASE.split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) {
  throw new Error(
    `suiviConversation.itest : refus de tourner sur « ${NOM_BASE || '(aucune base)'} ». `
    + 'Cette épreuve ÉCRIT : elle exige une base dont le nom commence par « svav_test ».',
  );
}

const AUTEUR = { id: null, libelle: 'épreuve des périodes' };
/** Les biens fictifs de l'exemple d'Arno. Aucun ne ressemble à un vrai lot. */
const LOTS = ['LOT-A', 'LOT-B', 'LOT-C', 'LOT-D'] as const;
const bien = (cle: string) => ({ cle, libelle: `Bien fictif ${cle}` });
const biens = (cle: string) => ({ sorte: 'biens' as const, biens: [bien(cle)] });
/**
 * 🔴 PLUSIEURS BIENS DANS UN MÊME CLASSEMENT — c'est la forme que prend un AJOUT à l'écran.
 *
 * La modale envoie TOUTES les cases cochées (`appliquerCibles`, `EncartRattachement.tsx`), et celles des biens
 * déjà rattachés le sont d'avance : ajouter un bien produit donc un classement à deux biens, jamais un classement
 * qui remplacerait le premier. C'est ce que le scénario T7 éprouve.
 */
const plusieurs = (...cles: string[]) => ({ sorte: 'biens' as const, biens: cles.map(bien) });
const INTERNE = { sorte: 'interne' as const, biens: [] };
const HORS = { sorte: 'hors_gestion' as const, biens: [] };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES DÉCORS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

let compteur = 0;

/** Une conversation fictive de `n` mails, et les identifiants de ses messages DANS L'ORDRE DE LECTURE. */
async function conversation(n: number): Promise<{ filId: number; mails: number[] }> {
  compteur += 1;
  const cle = `fictif-${Date.now()}-${compteur}`;
  const { rows: f } = await query<{ id: string }>(
    "INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer') RETURNING id::text", [cle]);
  const filId = Number(f[0].id);
  const mails: number[] = [];
  for (let i = 1; i <= n; i += 1) {
    const { rows: m } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, 'recu', $3, $4::timestamptz, $5) RETURNING id::text`,
      [filId, `${cle}-${i}`, `expediteur${i}@example.test`,
        `2026-01-0${Math.min(i, 9)}T09:00:00Z`, `Mail fictif n°${i}`]);
    mails.push(Number(m[0].id));
  }
  return { filId, mails };
}

/** L'historique d'un bien, LU EN BASE : les mails qui lui sont rattachés de façon CONFIRMÉE. */
async function historique(filId: number, cle: string): Promise<number[]> {
  const { rows } = await query<{ message_id: string }>(
    `SELECT r.message_id::text FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE m.fil_id = $1 AND r.cible_cle = $2 AND r.statut = 'confirme' AND r.piece_id IS NULL
      ORDER BY m.recu_le, m.id`, [filId, cle]);
  return rows.map((r) => Number(r.message_id));
}

/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE — LES MAILS « INTERNE » D'UNE CONVERSATION, PAR LEUR RANG ════════════════
 *
 * Rend les RANGS des mails qu'un écran afficherait « Interne », en appliquant la règle du repli mail par mail :
 * marque par mail vivante → interne ; marque par mail retirée → PAS interne, et la marque d'échange ne le
 * ressuscite pas ; aucune marque par mail → la marque d'échange répond.
 *
 * ⚠️ UNE SEULE PAIRE DE LECTURES POUR TOUTE LA CONVERSATION : on ne demande pas mail par mail.
 */
async function rangsInternes(filId: number, mails: readonly number[]): Promise<number[]> {
  const parMail = await lireInterneDesMessages(mails);
  const echange = (await lireInterne([filId])).has(filId);
  return mails
    .filter((m) => interneDuMail({
      marqueDuMailVivante: parMail.get(m)?.vivante === true,
      marqueDuMailConnue: parMail.has(m),
      marqueDeLEchange: echange,
    }))
    .map((m) => mails.indexOf(m) + 1);
}

/** La position d'un mail dans sa conversation (1, 2, 3…), pour des attendus lisibles. */
const rang = (mails: readonly number[], id: number): number => mails.indexOf(id) + 1;
const rangs = (mails: readonly number[], ids: readonly number[]): number[] =>
  ids.map((i) => rang(mails, i)).sort((a, b) => a - b);

beforeAll(async () => {
  // Les quatre biens fictifs : le moteur de projection n'a besoin que de leur clé.
  for (const cle of LOTS) {
    await query(
      `INSERT INTO gestion_annuaire_lot (wippimmo_id, adresse, commune, nature, proprietaire_texte)
       VALUES ($1, $2, 'VILLE-TEST', 'Appartement', 'Propriétaire fictif')
       ON CONFLICT (wippimmo_id) DO NOTHING`, [cle, `1 rue Fictive ${cle}`]);
  }
});
afterAll(async () => { await closePool(); });

/** Chaque scénario part d'une base propre de périodes : on ne veut pas qu'un essai en explique un autre. */
beforeEach(async () => {
  await query('DELETE FROM gestion_message_exception_bien');
  await query('DELETE FROM gestion_message_exception');
  await query('DELETE FROM gestion_fil_periode_bien');
  await query('DELETE FROM gestion_fil_periode');
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S1 — L'APPARITION DU BLOC : SES DEUX CONDITIONS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S1 — le bloc n’apparaît qu’aux deux conditions', () => {
  it('🔴 absent sur le 1er mail, absent tant qu’aucun classement n’est posé, présent ensuite', async () => {
    const { filId, mails } = await conversation(3);
    const { blocSuiviVisible } = await import('./periodesConversation');

    // ⚠️ LOT MODALE-SUIVI-ET-DEFILEMENT — le bloc a une TROISIÈME condition : la sélection doit DIFFÉRER du
    //    rattachement validé. On la fournit ici (une case changée), pour n'éprouver que les deux premières.
    const change = { reference: ['LOT-A'], selection: ['LOT-B'] };
    // ① premier mail : jamais, même une fois la conversation classée
    expect(blocSuiviVisible({ estPremierMail: true, dejaClassee: true, ...change })).toBe(false);
    // ② deuxième mail, conversation JAMAIS classée : non plus
    expect(blocSuiviVisible({ estPremierMail: false, dejaClassee: false, ...change })).toBe(false);

    // ③ on pose un classement : la conversation est désormais « déjà classée »
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const { periodes } = await suiviDuFil(filId);
    expect(periodes).toHaveLength(1);
    expect(blocSuiviVisible({ estPremierMail: false, dejaClassee: periodes.length > 0, ...change })).toBe(true);
    // 🔴🔴 ET SANS CHANGEMENT, TOUJOURS PAS DE BLOC : c'est le défaut du fil 3490, éprouvé ici aussi.
    expect(blocSuiviVisible({
      estPremierMail: false, dejaClassee: periodes.length > 0, reference: ['LOT-A'], selection: ['LOT-A'],
    })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S2 — LE CHOIX PAR DÉFAUT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S2 — le choix coché d’avance', () => {
  it('🔴 c’est « Ce mail et la conversation à venir »', async () => {
    const { SUIVI_DEFAUT } = await import('./periodesConversation');
    expect(SUIVI_DEFAUT).toBe('suite');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 S3 — L'EXEMPLE D'ARNO, DE BOUT EN BOUT, SUR UNE VRAIE BASE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S3 — l’exemple d’Arno : 8 mails, une exception, une nouvelle fenêtre', () => {
  it('🔴🔴 A = {1,2,3,5} · C = {4} · B = {6,7,8} — et le mail 9 qui arrive suit B', async () => {
    const { filId, mails } = await conversation(8);

    // mails 1 à 3 → Lot A (le rattachement initial, posé sur le premier mail, court sur toute la suite)
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    // mail 4 → Lot C, « Ce mail uniquement »
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    // mail 6 → Lot B, « Ce mail et la conversation à venir »
    await poserClassement({ filId, messageId: mails[5], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 5]);
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([4]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([6, 7, 8]);

    // ── LE MAIL 9 ARRIVE : il hérite de la fenêtre EN COURS, c'est-à-dire B ──────────────────────────────────
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, 'recu', 'neuf@example.test', '2026-01-09T09:00:00Z', 'Mail fictif n°9')
       RETURNING id::text`, [filId, `neuf-${filId}`]);
    const neuf = Number(rows[0].id);
    await heriterLesNouveauxMails(filId, AUTEUR);

    expect(await historique(filId, 'LOT-B')).toContain(neuf);
    expect(await historique(filId, 'LOT-A')).not.toContain(neuf);
    expect(await historique(filId, 'LOT-C')).not.toContain(neuf);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S4 — QUATRE FENÊTRES EN SÉRIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S4 — des fenêtres en série ne déplacent jamais le passé', () => {
  it('🔴 A puis B au mail 3, C au mail 5, D au mail 7 : chaque mail dans sa fenêtre', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const apresA = rangs(mails, await historique(filId, 'LOT-A'));
    expect(apresA).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    // 🔴 LE PASSÉ NE BOUGE PAS : A garde ses mails 1 et 2, et les perd sur la suite.
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);

    await poserClassement({ filId, messageId: mails[4], classement: biens('LOT-C'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[6], classement: biens('LOT-D'), choix: 'suite', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([3, 4]);
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([5, 6]);
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([7, 8]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S5 — UNE EXCEPTION AU MILIEU D'UNE FENÊTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S5 — après une exception, on revient à la fenêtre EN COURS', () => {
  it('🔴 et non à la règle initiale', async () => {
    const { filId, mails } = await conversation(6);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    // exception AU MILIEU de la fenêtre B
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([4]);
    // 🔴 LE MAIL 5 REVIENT À B, la fenêtre en cours — pas à A, la règle initiale.
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([3, 5, 6]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 S6 — « TOUTE LA CONVERSATION »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S6 — « Toute la conversation » remplace tout, sauf les exceptions', () => {
  it('🔴🔴 tous les mails passent au nouveau bien, les exceptions restent', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[5], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    await poserClassement({
      filId, messageId: mails[7], classement: biens('LOT-D'), choix: 'conversation', auteur: AUTEUR,
    });

    // 🔴 TOUS LES MAILS, PASSÉS ET À VENIR — SAUF le 4, qui porte une exception.
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([1, 2, 3, 5, 6, 7, 8]);
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([4]);
    expect(await historique(filId, 'LOT-A')).toEqual([]);
    expect(await historique(filId, 'LOT-B')).toEqual([]);

    // 🔴 LES FENÊTRES INTERMÉDIAIRES SONT REMPLACÉES PAR UNE SEULE — datées, jamais supprimées.
    const { periodes } = await suiviDuFil(filId);
    expect(periodes).toHaveLength(1);
    const { rows } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_fil_periode WHERE fil_id = $1 AND remplacee_le IS NOT NULL',
      [filId]);
    expect(rows[0].n).toBe(2);
  });

  it('🔴 « Annuler » ne change RIEN : rien n’est écrit tant qu’on ne valide pas', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const avant = rangs(mails, await historique(filId, 'LOT-A'));
    const { periodes } = await suiviDuFil(filId);

    // Annuler = ne pas appeler `poserClassement`. C'est la seule porte d'écriture : sans elle, rien ne bouge.
    const apres = rangs(mails, await historique(filId, 'LOT-A'));
    expect(apres).toEqual(avant);
    expect((await suiviDuFil(filId)).periodes).toEqual(periodes);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S7 — UN CHANGEMENT SUR UN MAIL ANCIEN, ALORS QU'UNE FENÊTRE EXISTE PLUS LOIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S7 — « à venir » posé AVANT une fenêtre existante (description, pas de correction)', () => {
  it('📋 ce que le code fait réellement', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[5], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    // …puis on revient en arrière : « à venir » au mail 2.
    await poserClassement({ filId, messageId: mails[1], classement: biens('LOT-C'), choix: 'suite', auteur: AUTEUR });

    const a = rangs(mails, await historique(filId, 'LOT-A'));
    const b = rangs(mails, await historique(filId, 'LOT-B'));
    const c = rangs(mails, await historique(filId, 'LOT-C'));
    console.log(`S7 — A=${JSON.stringify(a)} B=${JSON.stringify(b)} C=${JSON.stringify(c)}`);

    // L'ATTENDU D'ARNO : la nouvelle fenêtre couvre 2 à 5, et B reste à partir de 6.
    expect(a).toEqual([1]);
    expect(c).toEqual([2, 3, 4, 5]);
    expect(b).toEqual([6, 7, 8]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 T7 — AJOUTER UN BIEN « POUR CE MAIL ET LA CONVERSATION À VENIR »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * DÉCISION D'ARNO (01/10/2026), LECTURE 1, MOT POUR MOT : « L'ajout d'un bien avec “Ce mail et la conversation à
 * venir” ouvre une NOUVELLE FENÊTRE, sans effet sur les fenêtres passées. Attendu au mail 4 : A = tous les mails,
 * B = mails 4 et suivants. Seule “Toute la conversation” est rétroactive, et elle épargne les exceptions “Ce mail
 * uniquement”. »
 *
 * ═══ POURQUOI « A = TOUS LES MAILS » N'EST PAS UNE EXCEPTION À S4 ════════════════════════════════════════════════
 *
 * S4 montre qu'une fenêtre REMPLACE la précédente : poser B seul au mail 4 rendrait A = 1 à 3. Ici le geste n'est
 * pas le même — c'est un AJOUT. La modale envoie toutes les cases cochées, et celle du bien déjà rattaché l'est
 * d'avance : le classement de la nouvelle fenêtre vaut donc { A, B }, et A continue sans rupture. Les deux règles
 * disent la même chose ; c'est le GESTE qui diffère, pas le moteur.
 *
 * ⚠️ C'EST AUSSI CE QUI REND LE SCÉNARIO UTILE. Si un jour l'écran n'envoyait plus que le bien ajouté, A
 * disparaîtrait des mails 4 à 8 sans que personne l'ait demandé — et ce sont ces essais-là qui s'en apercevraient.
 */
describe('🔴🔴 T7 — ajouter un bien « à venir » n’efface pas celui qui était déjà là', () => {
  it('🔴🔴 au mail 4 : A garde TOUS les mails, B prend le 4 et les suivants', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // L'AJOUT : le bien déjà coché (A) part avec le nouveau (B), comme la modale l'envoie.
    await poserClassement({
      filId, messageId: mails[3], classement: plusieurs('LOT-A', 'LOT-B'), choix: 'suite', auteur: AUTEUR,
    });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([4, 5, 6, 7, 8]);
  });

  it('🔴 « sans effet sur les fenêtres passées » : la première reste vivante, rien n’est remplacé', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({
      filId, messageId: mails[3], classement: plusieurs('LOT-A', 'LOT-B'), choix: 'suite', auteur: AUTEUR,
    });

    // DEUX fenêtres vivantes, dans l'ordre, et AUCUNE remplacée : « à venir » n'a touché à rien derrière lui.
    const { periodes } = await suiviDuFil(filId);
    expect(periodes.map((p) => p.classement.biens.map((b) => b.cle)))
      .toEqual([['LOT-A'], ['LOT-A', 'LOT-B']]);
    const { rows } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_fil_periode WHERE fil_id = $1 AND remplacee_le IS NOT NULL', [filId]);
    expect(rows[0].n).toBe(0);
  });

  /**
   * 🔴 LE CONTRASTE, SUR LE MÊME DÉCOR — c'est lui qui donne son sens à la règle : REMPLACER et AJOUTER ne sont pas
   * le même geste, et seul le premier fait perdre des mails au bien d'avant.
   */
  it('🔴 poser B SEUL au mail 4, c’est remplacer : A s’arrête au 3 (règle S4, inchangée)', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([4, 5, 6, 7, 8]);
  });

  /**
   * 🔴🔴 « SEULE “TOUTE LA CONVERSATION” EST RÉTROACTIVE, ET ELLE ÉPARGNE LES EXCEPTIONS “CE MAIL UNIQUEMENT”. »
   *
   * Les deux moitiés de la phrase sont éprouvées ici, l'une après l'autre, sur le décor de T7 : « à venir » ne
   * remonte pas le temps, « toute la conversation » le remonte — sauf là où une personne a dit « ce mail
   * uniquement », qui reste intact.
   */
  it('🔴🔴 « à venir » ne remonte pas le temps, « toute la conversation » oui — sauf les exceptions', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    // Une exception « ce mail uniquement » sur le mail 2, posée avant tout le reste.
    await poserClassement({ filId, messageId: mails[1], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    await poserClassement({
      filId, messageId: mails[3], classement: plusieurs('LOT-A', 'LOT-B'), choix: 'suite', auteur: AUTEUR,
    });

    // ① « À VENIR » N'EST PAS RÉTROACTIF : le mail 2 reste au LOT-C, et B ne descend pas sous le 4.
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([2]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([4, 5, 6, 7, 8]);
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 3, 4, 5, 6, 7, 8]);

    // ② « TOUTE LA CONVERSATION » L'EST, ET ELLE ÉPARGNE L'EXCEPTION.
    await poserClassement({
      filId, messageId: mails[7], classement: biens('LOT-D'), choix: 'conversation', auteur: AUTEUR,
    });
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([1, 3, 4, 5, 6, 7, 8]);
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([2]);
    expect(await historique(filId, 'LOT-A')).toEqual([]);
    expect(await historique(filId, 'LOT-B')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S8 — INTERNE ET HORS GESTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S8 — « Interne » et « Hors gestion » suivent la même logique', () => {
  /**
   * ══ 🔴🔴 ATTENDUS RÉÉCRITS LE 04/10/2026 — LOT INTERNE-ANNULER-ET-SUITE ══════════════════════════════════════
   *
   * DÉCISION D'ARNO : « on garde la correction du 03/10. Réécris les attendus des scénarios S8 et S12 pour qu'ils
   * décrivent le comportement validé actuel. »
   *
   * ═══ CE QUE CE SCÉNARIO ATTENDAIT, ET POURQUOI IL AVAIT RAISON À L'ÉPOQUE ═══════════════════════════════════
   *
   * Il attendait qu'une fenêtre « biens » posée après une fenêtre « interne » fasse TOMBER LA MARQUE DE
   * L'ÉCHANGE (`gestion_fil_interne`). C'était vrai quand « interne » n'existait QUE sur l'échange : il n'y avait
   * pas d'autre endroit où dire « ces mails-ci ne sont plus internes ».
   *
   * ═══ 🔴🔴 CE QUE DEUX CORRECTIONS ONT CHANGÉ, ET POURQUOI L'ANCIEN ATTENDU EST DEVENU FAUX ═══════════════════
   *
   *   ① MIGRATION 297 (03/10) — « Interne » devient un statut PAR MAIL, et la marque d'échange n'est plus qu'un
   *      REPLI : elle répond pour les mails dont personne ne s'est occupé. La projection écrit donc la vérité au
   *      grain du MAIL, et n'a plus besoin de toucher l'échange.
   *   ② COMMIT 559d394a (03/10) — la projection a cessé de RETIRER la marque d'échange, avec ce motif, écrit dans
   *      `periodeRepo` : « elle reste le repli, et un repli qu'une projection effacerait ne serait pas un repli ».
   *      Une fenêtre qui l'effacerait priverait de leur statut tous les mails qu'AUCUNE fenêtre ne couvre.
   *
   * 🔴 L'ANCIEN ATTENDU DEMANDAIT DONC EXACTEMENT CE QUE LA CORRECTION INTERDIT. Il est remplacé par la question
   * qui compte vraiment — et que l'écran pose : QUELS MAILS sont interne ? La marque d'échange, elle, survit, et
   * c'est voulu.
   */
  it('🔴 à partir de ce mail la conversation devient interne, puis un bien la rouvre', async () => {
    const { filId, mails } = await conversation(6);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: INTERNE, choix: 'suite', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);
    // 🔴 LA MARQUE D'ÉCHANGE EST POSÉE (migration 281), et les mails que la fenêtre couvre portent la leur.
    expect((await lireInterne([filId])).get(filId)).toBeDefined();
    /**
     * ══ ⚠️⚠️ ET LES MAILS 1-2 LA LISENT AUSSI, LE TEMPS D'UNE PASSE. CE N'EST PAS CE QU'ON VOUDRAIT ═══════════
     *
     * Ils portent LOT-A et sont couverts par la première fenêtre : ils ne devraient pas se lire « interne ». Ils
     * le font pourtant à cet instant précis, et la raison est un ORDRE, pas une règle :
     * `projeterLeFil` lit « cet échange est-il marqué ? » AVANT sa boucle, et POSE la marque d'échange APRÈS
     * (quand la fenêtre en cours est « interne »). Pendant cette passe-là, la réponse était donc « non », et la
     * ligne « on s'est prononcé » qui les protégerait n'a pas été écrite.
     *
     * 🔴 ÇA SE RATTRAPE À LA PASSE SUIVANTE, et l'assertion d'après le prouve : au geste suivant, les mails 1-2
     * sortent de la liste. Avant le lot INTERNE-ANNULER-ET-SUITE, ils n'en sortaient JAMAIS — aucun mécanisme
     * n'écrivait cette ligne. Le transitoire est donc un reste, pas une régression ; il est figé ici pour qu'une
     * correction de l'ordre de la projection se voie, au lieu de passer pour une régression.
     */
    expect(await rangsInternes(filId, mails)).toEqual([1, 2, 3, 4, 5, 6]);

    // …puis un bien rouvre une fenêtre « biens » à partir du 5e mail.
    await poserClassement({ filId, messageId: mails[4], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([5, 6]);

    /**
     * 🔴🔴 CE QUI TOMBE, C'EST LE STATUT DES MAILS QUE LA NOUVELLE FENÊTRE COUVRE — et eux seuls. Les mails 3 et
     * 4 restent sous la fenêtre « interne » : leur statut n'a aucune raison de changer, et c'est la règle
     * d'indépendance des fenêtres (lot FENETRES-INDEPENDANTES).
     */
    expect(await rangsInternes(filId, mails)).toEqual([3, 4]);

    /**
     * 🔴🔴 ET LA MARQUE DE L'ÉCHANGE SURVIT, DÉLIBÉRÉMENT. Elle n'est plus la vérité d'un mail mais son REPLI :
     * la retirer ici priverait de leur statut les mails qu'aucune fenêtre ne couvre — et il n'existe aucun autre
     * endroit pour le leur rendre. C'est l'arbitrage du 03/10, confirmé par Arno le 04/10.
     */
    expect((await lireInterne([filId])).get(filId)).toBeDefined();
  });

  it('🔴 une exception « hors gestion » au milieu d’une fenêtre de biens', async () => {
    const { filId, mails } = await conversation(5);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: HORS, choix: 'mail', auteur: AUTEUR });

    // Le mail 3 sort de l'historique du bien ; les autres y restent.
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 4, 5]);
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_hors_gestion
        WHERE message_id = $1 AND retire_le IS NULL`, [mails[2]]);
    expect(rows[0].n).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S9 — LES REPÈRES DANS LE FIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S9 — les repères « À partir d’ici : … »', () => {
  it('🔴 un repère par changement de fenêtre, aucun pour une exception', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[5], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    const { periodes } = await suiviDuFil(filId);
    const reperes = reperesDuFil(await mailsDuFil(filId), periodes);
    // 🔴 UN SEUL : celui de la fenêtre B. La fenêtre qui commence au PREMIER mail n'en produit pas (elle ne
    //   marque aucun changement), et l'exception du mail 4 non plus — elle se dit dans l'en-tête du mail.
    expect(reperes).toHaveLength(1);
    expect(reperes[0].avantMessageId).toBe(mails[5]);
    expect(reperes[0].versQuoi).toContain('LOT-B');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S10 — DÉFAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S10 — revenir en arrière', () => {
  it('📋 reposer la fenêtre précédente rétablit l’historique d’avant', async () => {
    const { filId, mails } = await conversation(6);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const avant = rangs(mails, await historique(filId, 'LOT-A'));

    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);

    // On défait en reposant A à partir du même mail : l'historique redevient celui d'avant.
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual(avant);
    expect(await historique(filId, 'LOT-B')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S11 — UN RATTACHEMENT POSÉ À LA MAIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S11 — ce qu’un humain a posé n’est jamais déplacé par une fenêtre', () => {
  /** Le geste humain qu'on protège : un rattachement posé à la main, sur un seul mail. */
  const aLaMain = (messageId: number, cle: string) => rattacher({
    messageId, cible: { sorte: 'lot', cle, id: null },
    auteur: { id: null, libelle: 'a.jorel@example.test' }, motif: 'rattaché à la main',
  });

  /**
   * 🔴🔴 LE DÉFAUT QUE CE SCÉNARIO A TROUVÉ (01/10/2026). La projection retirait TOUT lien confirmé qu'une
   * fenêtre ne voulait plus — y compris celui qu'une personne avait posé en regardant le mail. Arno : « Un
   * rattachement posé à la main n'est jamais déplacé par un changement de fenêtre. »
   */
  it('🔴🔴 une nouvelle fenêtre n’efface pas le lien posé à la main : les deux coexistent', async () => {
    const { filId, mails } = await conversation(5);
    await aLaMain(mails[2], 'LOT-D');
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([3]);

    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });

    // 🔴 LE LIEN HUMAIN EST TOUJOURS LÀ…
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([3]);
    // …et la fenêtre a posé le sien par-dessus, sur tous les mails.
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('🔴 une fenêtre POSTÉRIEURE ne le touche pas davantage', async () => {
    const { filId, mails } = await conversation(5);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await aLaMain(mails[3], 'LOT-D');
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([4]);
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([3, 4, 5]);
  });

  /** 🔴 LA SEULE EXCEPTION, ET ARNO LA NOMME : « Toute la conversation » remplace tout, le manuel compris. */
  it('🔴🔴 « Toute la conversation », elle, le remplace — et elle seule', async () => {
    const { filId, mails } = await conversation(5);
    await aLaMain(mails[2], 'LOT-D');
    await poserClassement({
      filId, messageId: mails[4], classement: biens('LOT-A'), choix: 'conversation', auteur: AUTEUR,
    });
    expect(await historique(filId, 'LOT-D')).toEqual([]);
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4, 5]);
  });

  /** ⚠️ ET LE LIEN DU MOTEUR DE RATTACHEMENT NON PLUS : lui aussi a regardé le mail, pas la fenêtre. */
  it('⚠️ un lien du moteur de rattachement n’est pas retiré non plus', async () => {
    const { filId, mails } = await conversation(4);
    await query(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, cible_libelle, origine, regle, confiance, motif, statut,
          cree_par_libelle)
       VALUES ($1, 'lot', 'LOT-C', 'Bien fictif LOT-C', 'automatique', 'a', 'haute',
               'locataire en place à la date du mail', 'confirme', 'moteur de rattachement')`, [mails[1]]);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([2]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   S13 — LA RÈGLE (e) N'ENTRE JAMAIS DANS UNE PÉRIODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('S13 — une proposition « trouvée dans le contenu » ne rattache rien', () => {
  it('🔴🔴 elle reste « proposée », et la projection ne la voit pas', async () => {
    const { filId, mails } = await conversation(3);
    // Une proposition de contenu, telle que le moteur l'écrit : statut « propose », règle (e).
    await query(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, cible_libelle, origine, regle, confiance, motif, statut,
          cree_par_libelle)
       VALUES ($1, 'lot', 'LOT-C', 'Bien fictif LOT-C', 'automatique', 'e', 'basse',
               'trouvé dans le contenu du mail', 'propose', 'moteur de rattachement')`, [mails[1]]);

    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });

    // 🔴 L'historique du LOT-C reste VIDE : une proposition n'est pas un rattachement.
    expect(await historique(filId, 'LOT-C')).toEqual([]);
    // …et la période n'a pas repris le LOT-C : elle ne connaît que ce qu'Arno a posé.
    const { periodes } = await suiviDuFil(filId);
    expect(periodes[0].classement.biens.map((b) => b.cle)).toEqual(['LOT-A']);
    // …et la proposition est toujours là, intacte.
    const { rows } = await query<{ statut: string }>(
      "SELECT statut FROM gestion_rattachement WHERE message_id = $1 AND regle = 'e'", [mails[1]]);
    expect(rows.map((r) => r.statut)).toEqual(['propose']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA PROJECTION PURE ET LA BASE DISENT LA MÊME CHOSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 la projection pure et la base ne divergent jamais', () => {
  it('🔒 `projeter` rend exactement ce que `gestion_rattachement` porte', async () => {
    const { filId, mails } = await conversation(8);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[3], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[5], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    const liste = await mailsDuFil(filId);
    const { periodes, exceptions } = await suiviDuFil(filId);
    const voulu = projeter(liste, periodes, exceptions);
    for (const cle of LOTS) {
      expect(mailsDuBien(liste, periodes, exceptions, cle), cle).toEqual(await historique(filId, cle));
    }
    // …et la fenêtre EN COURS est bien la dernière ouverte, jamais une exception.
    expect(periodeEnCours(liste, periodes)?.classement.biens.map((b) => b.cle)).toEqual(['LOT-B']);
    expect(voulu.get(mails[3])?.biens.map((b) => b.cle)).toEqual(['LOT-C']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 S12 — UN MAIL ENTRANT DONT L'EXPÉDITEUR DÉSIGNE UN AUTRE BIEN QUE LA FENÊTRE : LA FENÊTRE GAGNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ CE BLOC N'ÉPROUVE PAS UN MODULE PUR, IL ÉPROUVE LA RELÈVE. Il enchaîne, DANS SON ORDRE :
 *   ① `heriterLesNouveauxMails` — la fenêtre en cours est projetée sur les mails neufs ;
 *   ② `examinerFilsPrecis` — le VRAI moteur de rattachement, qui lit `gestion_message_adresse` et décide.
 * Écrire le lien d'expéditeur « à la main » au lieu d'appeler le moteur prouverait seulement que l'épreuve sait
 * écrire une ligne. Ce qu'Arno veut savoir est ce que fait la RELÈVE, et c'est donc elle qu'on appelle.
 */
describe('🔴🔴 S12 — la fenêtre gagne, l’expéditeur devient une proposition décochée', () => {
  /** Un mail qui arrive dans la conversation, dont l'adresse d'expéditeur est RECONNUE comme locataire d'un bien. */
  async function mailEntrant(filId: number, lotDeLExpediteur: string): Promise<number> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, 'recu', $3, '2026-01-09T09:00:00Z', 'Mail fictif entrant') RETURNING id::text`,
      [filId, `entrant-${filId}-${lotDeLExpediteur}`, `locataire-${lotDeLExpediteur}@example.test`]);
    const id = Number(rows[0].id);
    // La reconnaissance d'adresse telle que la relève l'écrit : cette personne est la locataire de ce bien.
    await query(
      `INSERT INTO gestion_message_adresse
         (message_id, adresse, role, interne, partie, lot_cle, motif)
       VALUES ($1, $2, 'expediteur', false, 'locataire', $3, 'locataire en place à la date du mail')`,
      [id, `locataire-${lotDeLExpediteur}@example.test`, lotDeLExpediteur]);
    return id;
  }

  /** La relève, dans son ordre : la fenêtre hérite, puis le moteur examine le fil entier. */
  async function releve(filId: number): Promise<void> {
    await heriterLesNouveauxMails(filId, AUTEUR);
    const { examinerFilsPrecis, chargerLibelles, COMPTES_VIDES } = await import('./rattachementRepo');
    await examinerFilsPrecis([filId], await chargerLibelles(), { ...COMPTES_VIDES }, true);
  }

  /**
   * LES LIENS VIVANTS d'un bien sur un mail précis, sous la forme « statut (origine) ».
   *
   * ⚠️ ON NE FILTRE PAS SUR L'ORIGINE, et c'est ce qui rend l'attendu honnête : quand la fenêtre a DÉJÀ posé le
   * bien (`origine = 'manuel'`), le moteur n'en pose pas un second — il respecte la ligne existante. Un attendu
   * qui n'aurait regardé que les lignes « automatique » aurait conclu « aucun lien » là où il y en a un.
   */
  async function liens(messageId: number, cle: string): Promise<string[]> {
    const { rows } = await query<{ statut: string; origine: string }>(
      `SELECT statut, origine FROM gestion_rattachement
        WHERE message_id = $1 AND cible_cle = $2 AND piece_id IS NULL
          AND statut IN ('propose', 'confirme') ORDER BY id`, [messageId, cle]);
    return rows.map((r) => `${r.statut} (${r.origine})`);
  }

  /**
   * 🔴🔴 LA DÉCISION D'ARNO (01/10/2026), MOT POUR MOT : « Un mail entrant dans une conversation qui a une fenêtre
   * en cours : la FENÊTRE GAGNE. Le mail est rattaché aux biens de la fenêtre. Si l'adresse de l'expéditeur désigne
   * un AUTRE bien, ce bien devient une proposition DÉCOCHÉE (pas de lien confirmé). »
   *
   * ⚠️ AVANT CE LOT, LES DEUX LIENS ÉTAIENT CONFIRMÉS et le mail apparaissait dans DEUX historiques de biens.
   */
  it('🔴🔴 l’autre bien est PROPOSÉ, pas confirmé — et le bien de la fenêtre l’est', async () => {
    const { filId, mails } = await conversation(3);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const entrant = await mailEntrant(filId, 'LOT-C');

    await releve(filId);

    // ① LE MAIL EST DANS L'HISTORIQUE DU BIEN DE LA FENÊTRE.
    expect(await historique(filId, 'LOT-A')).toContain(entrant);
    // ② IL N'EST PAS DANS CELUI DU BIEN DE L'EXPÉDITEUR…
    expect(await historique(filId, 'LOT-C')).toEqual([]);
    // ③ …mais le bien de l'expéditeur est bien là, PROPOSÉ : rien n'est perdu, c'est à un clic.
    expect(await liens(entrant, 'LOT-C')).toEqual(['propose (automatique)']);
  });

  /** ⚠️ L'AUTRE MOITIÉ DE LA RÈGLE : quand les deux disent la même chose, le lien se CONFIRME, comme avant. */
  it('⚠️ quand l’expéditeur désigne le bien de la fenêtre, le lien est confirmé', async () => {
    const { filId, mails } = await conversation(3);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-C'), choix: 'suite', auteur: AUTEUR });
    const entrant = await mailEntrant(filId, 'LOT-C');

    await releve(filId);

    expect(await historique(filId, 'LOT-C')).toContain(entrant);
    // 🔴 UN SEUL LIEN, CONFIRMÉ : celui que la fenêtre a posé. Le moteur l'a RESPECTÉ au lieu d'en poser un second.
    expect(await liens(entrant, 'LOT-C')).toEqual(['confirme (manuel)']);
  });

  /**
   * 🔴 LE COURRIER ORDINAIRE NE CHANGE PAS. Sans aucune fenêtre, le moteur confirme comme il l'a toujours fait —
   * c'est le cas de l'immense majorité des mails, et la décision d'Arno ne doit rien y toucher.
   */
  it('🔴 sans fenêtre, le lien d’expéditeur reste confirmé (aucune régression)', async () => {
    const { filId } = await conversation(2);
    const entrant = await mailEntrant(filId, 'LOT-C');

    await releve(filId);

    expect(await historique(filId, 'LOT-C')).toContain(entrant);
    expect(await liens(entrant, 'LOT-C')).toEqual(['confirme (automatique)']);
  });

  /**
   * ══ 🔴🔴 ATTENDU RÉÉCRIT LE 04/10/2026 — LOT INTERNE-ANNULER-ET-SUITE ════════════════════════════════════════
   *
   * DÉCISION D'ARNO : « on garde la correction du 03/10. Réécris les attendus des scénarios S8 et S12 pour qu'ils
   * décrivent le comportement validé actuel. »
   *
   * ═══ CE QUE CE SCÉNARIO ATTENDAIT, ET CE QUI L'A DÉPASSÉ ════════════════════════════════════════════════════
   *
   * Il attendait que le bien de l'expéditeur reste en PROPOSITION décochée : « rien n'est perdu, c'est à un
   * clic ». C'était la règle de S12 — la fenêtre gagne, l'autre bien se propose — appliquée à une fenêtre
   * « interne ».
   *
   * 🔴🔴 UNE RÈGLE PLUS FORTE EST PASSÉE DEPUIS, ET ELLE VIENT D'ARNO AUSSI (lot HISTORIQUES-UNE-SEULE-REGLE,
   * point 4) : « la passe automatique ne pose jamais de bien sur un mail Interne ». Le moteur ne propose donc
   * plus RIEN sur un tel mail — ni lien, ni candidat à trancher — et il écrit POURQUOI. Ce n'est pas une
   * proposition perdue : c'est une proposition qui n'a jamais eu lieu, sur un mail dont une personne a dit qu'il
   * ne concerne aucun bien.
   *
   * ⚠️ LE MAIL ENTRANT EST INTERNE PARCE QUE LA FENÊTRE LE COUVRE, et c'est la migration 297 qui le permet : la
   * projection lui écrit SA marque, au grain du mail. Avant elle, seul l'échange portait la marque — le moteur
   * n'avait aucun moyen de savoir que ce mail-ci était interne, et il proposait.
   *
   * 🔴 ON ÉPROUVE DONC LES TROIS FAITS, ET PAS SEULEMENT L'ABSENCE : le mail est interne, le moteur n'a rien
   * posé, et son refus est MOTIVÉ. Un attendu qui se contenterait d'une liste vide passerait aussi sur un moteur
   * en panne.
   */
  it('🔴 une fenêtre « interne » ne laisse RIEN poser sur le mail entrant, et dit pourquoi', async () => {
    const { filId, mails } = await conversation(3);
    await poserClassement({ filId, messageId: mails[0], classement: INTERNE, choix: 'suite', auteur: AUTEUR });
    const entrant = await mailEntrant(filId, 'LOT-C');

    await releve(filId);

    // ① LA FENÊTRE A ÉCRIT SON STATUT SUR LE MAIL ENTRANT : il est interne, par sa propre marque.
    expect(await rangsInternes(filId, [entrant])).toEqual([1]);
    // ② AUCUN LIEN, AUCUNE PROPOSITION : ni dans l'historique du bien, ni en attente de tri.
    expect(await historique(filId, 'LOT-C')).toEqual([]);
    expect(await liens(entrant, 'LOT-C')).toEqual([]);
    /**
     * ③ 🔴 ET LE REFUS EST MOTIVÉ, EN BASE. C'est ce qui permet à la file « À trier » de dire pourquoi elle n'a
     * rien à proposer, au lieu de laisser croire que le moteur n'a pas vu le mail.
     */
    const { rows } = await query<{ issue: string; motif: string | null }>(
      'SELECT issue, motif FROM gestion_rattachement_examen WHERE message_id = $1', [entrant]);
    expect(rows).toHaveLength(1);
    expect(rows[0].issue).toBe('sans_candidat');
    expect(rows[0].motif).toBe('mail marqué « interne » par une personne : il ne concerne aucun bien');
  });

  /**
   * 🔴🔴 ET LE GESTE HUMAIN RESTE SOUVERAIN. Si une personne a confirmé le bien de l'expéditeur, une passe du
   * moteur ne le remet pas en proposition — c'est la règle ① d'`ecrireLienMoteur`, et S12 ne l'entame pas.
   */
  it('🔴🔴 un lien confirmé PAR UNE PERSONNE n’est pas remis en proposition', async () => {
    const { filId, mails } = await conversation(3);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    const entrant = await mailEntrant(filId, 'LOT-C');
    await releve(filId);
    expect(await liens(entrant, 'LOT-C')).toEqual(['propose (automatique)']);

    // Arno regarde le mail et confirme le bien de l'expéditeur : c'est lui qui a vu le mail, pas la fenêtre.
    const { rows } = await query<{ id: string }>(
      `SELECT id::text FROM gestion_rattachement
        WHERE message_id = $1 AND cible_cle = 'LOT-C' AND piece_id IS NULL`, [entrant]);
    await changerStatut({
      lienId: Number(rows[0].id), statut: 'confirme',
      auteur: { id: null, libelle: 'a.jorel@example.test' }, motif: 'vu le mail',
    });

    await releve(filId);   // une 2e passe de la relève : elle ne doit RIEN défaire
    expect(await historique(filId, 'LOT-C')).toContain(entrant);
    expect(await historique(filId, 'LOT-A')).toContain(entrant);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 S14 — LOT SUIVI-DERNIER-CHOIX : SEUL LE DERNIER CHOIX EXISTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (02/10/2026), fil 546 / message 57242 : quatre repères empilés au même endroit — « À partir
   d'ici : aucun bien » trois fois, puis « À partir d'ici : lot 365, lot 366 ». « Les décisions successives
   s'accumulent : ça n'a aucun intérêt. »

     RÈGLE 1 — plusieurs changements sur le MÊME mail : le dernier REMPLACE la période ou l'exception qui
               commençait déjà là. Un seul repère par point de départ.
     RÈGLE 2 — si le dernier choix aboutit à la configuration déjà en vigueur juste avant ce mail, on ne pose
               RIEN : la décision de ce mail est retirée, et les mails concernés reviennent à la configuration
               précédente.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les repères réellement affichés dans le fil, LUS COMME L'ÉCRAN LES LIT. */
async function reperes(filId: number): Promise<string[]> {
  const mails = await mailsDuFil(filId);
  const { periodes } = await suiviDuFil(filId);
  return reperesDuFil(mails, periodes).map((r) => `${rang(mails, r.avantMessageId)} → ${r.versQuoi}`);
}

describe('S14 — plusieurs changements sur le même mail : seul le dernier existe', () => {
  it('🔴🔴 trois changements de suite au mail 3 : UNE période, UN repère, et c’est le dernier', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-C'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-D'), choix: 'suite', auteur: AUTEUR });

    const { periodes } = await suiviDuFil(filId);
    // Une pour le mail 1, une pour le mail 3 — et pas quatre.
    expect(periodes).toHaveLength(2);
    expect(await reperes(filId)).toEqual(['3 → Bien fictif LOT-D']);

    // Et l'historique dit la même chose : B et C n'ont jamais eu lieu.
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2]);
    expect(rangs(mails, await historique(filId, 'LOT-D'))).toEqual([3, 4]);
    expect(await historique(filId, 'LOT-B')).toEqual([]);
    expect(await historique(filId, 'LOT-C')).toEqual([]);
  });

  it('🔴🔴 A → B → A au même mail : plus AUCUNE période là, et les rattachements d’origine reviennent', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4]);

    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([3, 4]);

    // ── LE RETOUR À A : ce n'est plus un changement, donc ce n'est plus une décision ────────────────────────────
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });

    const { periodes } = await suiviDuFil(filId);
    expect(periodes).toHaveLength(1);                       // celle du mail 1, et elle seule
    expect(await reperes(filId)).toEqual([]);               // aucun repère : rien n'a changé en route
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4]);
    expect(await historique(filId, 'LOT-B')).toEqual([]);   // les liens de B sont retirés
  });

  it('⚠️ deux mails DIFFÉRENTS : deux repères — la règle ne déborde jamais sur le voisin', async () => {
    const { filId, mails } = await conversation(5);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[4], classement: biens('LOT-C'), choix: 'suite', auteur: AUTEUR });

    expect((await suiviDuFil(filId)).periodes).toHaveLength(3);
    expect(await reperes(filId)).toEqual(['3 → Bien fictif LOT-B', '5 → Bien fictif LOT-C']);
  });

  it('🔴🔴 exception puis « à venir » au même mail : seul le dernier — la période gagne', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([3]);

    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    const { periodes, exceptions } = await suiviDuFil(filId);
    expect(exceptions).toHaveLength(0);                     // l'exception a cédé la place
    expect(periodes).toHaveLength(2);
    expect(await reperes(filId)).toEqual(['3 → Bien fictif LOT-B']);
    expect(await historique(filId, 'LOT-C')).toEqual([]);
    expect(rangs(mails, await historique(filId, 'LOT-B'))).toEqual([3, 4]);
  });

  it('🔴🔴 et dans l’autre sens : « à venir » puis exception au même mail — l’exception gagne', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-C'), choix: 'mail', auteur: AUTEUR });

    const { periodes, exceptions } = await suiviDuFil(filId);
    expect(periodes).toHaveLength(1);                       // la période du mail 3 a été REMPLACÉE, pas doublée
    expect(exceptions).toHaveLength(1);
    expect(await reperes(filId)).toEqual([]);
    // Le mail 3 est sur C ; le mail 4 reprend A, puisque la période B n'existe plus.
    expect(rangs(mails, await historique(filId, 'LOT-C'))).toEqual([3]);
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 4]);
    expect(await historique(filId, 'LOT-B')).toEqual([]);
  });

  it('🔴 une exception qui redit la période en cours ne laisse rien', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-A'), choix: 'mail', auteur: AUTEUR });

    expect((await suiviDuFil(filId)).exceptions).toHaveLength(0);
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual([1, 2, 3, 4]);
  });

  /**
   * 🔴🔴 « ANNULER » : OUVRIR LA MODALE ET NE PAS VALIDER N'ÉCRIT RIEN.
   *
   * Le bouton rend la main sans appeler la route d'écriture — ce que cette épreuve vérifie en rejouant TOUT ce
   * que l'ouverture de la modale lit, puis en comparant l'état de la conversation au caractère près.
   */
  it('🔴 « Annuler » : tout ce que la modale LIT à l’ouverture n’écrit rien', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    const etat = async (): Promise<string> => JSON.stringify({
      suivi: await suiviDuFil(filId),
      a: await historique(filId, 'LOT-A'),
      b: await historique(filId, 'LOT-B'),
      reperes: await reperes(filId),
    });
    const avant = await etat();

    // L'ouverture de la modale : les mails, le suivi, les repères — et rien d'autre.
    await mailsDuFil(filId);
    await suiviDuFil(filId);
    await reperes(filId);

    expect(await etat()).toBe(avant);
  });
});

describe('S14-bis — la reprise désempile ce qui s’est accumulé avant ce lot', () => {
  /** Empile des périodes à la main, comme la base en porte depuis le 02/10 — `poserClassement` ne le permet plus. */
  async function empiler(filId: number, messageId: number, cles: readonly string[]): Promise<number> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_fil_periode (fil_id, depuis_message_id, sorte, cree_par_libelle)
       VALUES ($1, $2, 'biens', 'décor de l’épreuve') RETURNING id::text`, [filId, messageId]);
    const id = Number(rows[0].id);
    for (const cle of cles) {
      await query(
        `INSERT INTO gestion_fil_periode_bien (periode_id, cible_cle, cible_libelle)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, cle, `Bien fictif ${cle}`]);
    }
    return id;
  }

  it('🔴🔴 le fil 546 d’Arno, rejoué : 4 décisions au même mail ⇒ une seule, la dernière', async () => {
    const { filId, mails } = await conversation(5);
    await empiler(filId, mails[0], ['LOT-A']);
    const morte1 = await empiler(filId, mails[4], []);
    const morte2 = await empiler(filId, mails[4], []);
    const morte3 = await empiler(filId, mails[4], []);
    const derniere = await empiler(filId, mails[4], ['LOT-B']);
    expect((await suiviDuFil(filId)).periodes).toHaveLength(5);

    const issue = await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });

    expect(issue.pointsEmpiles).toBe(1);
    expect(issue.periodesRetirees.sort((a, b) => a - b)).toEqual([morte1, morte2, morte3].sort((a, b) => a - b));
    const { periodes } = await suiviDuFil(filId);
    expect(periodes).toHaveLength(2);
    expect(periodes.map((p) => p.id)).toContain(derniere);
    expect(await reperes(filId)).toEqual(['5 → Bien fictif LOT-B']);
  });

  it('🔴🔴 une décision qui redit la précédente est retirée, et les rattachements ne bougent pas', async () => {
    const { filId, mails } = await conversation(4);
    await empiler(filId, mails[0], ['LOT-A']);
    const redondante = await empiler(filId, mails[2], ['LOT-A']);
    // On aligne d'abord les rattachements sur cet état empilé, comme la base l'est aujourd'hui.
    const { projeterLeFil } = await import('./periodeRepo');
    await projeterLeFil(filId, AUTEUR);
    const avant = rangs(mails, await historique(filId, 'LOT-A'));

    const issue = await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });

    expect(issue.decisionsRedondantes).toBe(1);
    expect(issue.periodesRetirees).toEqual([redondante]);
    expect(await reperes(filId)).toEqual([]);
    // 🔴 LA GARANTIE : l'historique du bien est le MÊME — on a retiré un repère, pas un classement.
    expect(rangs(mails, await historique(filId, 'LOT-A'))).toEqual(avant);
  });

  it('🔴 RIEN n’est supprimé : la période retirée est datée et signée', async () => {
    const { filId, mails } = await conversation(3);
    await empiler(filId, mails[0], ['LOT-A']);
    const redondante = await empiler(filId, mails[1], ['LOT-A']);
    await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });

    const { rows } = await query<{ remplacee_le: string | null; remplacee_par_libelle: string | null }>(
      'SELECT remplacee_le::text, remplacee_par_libelle FROM gestion_fil_periode WHERE id = $1', [redondante]);
    expect(rows[0].remplacee_le).not.toBeNull();
    expect(rows[0].remplacee_par_libelle).toBe(AUTEUR.libelle);
  });

  it('⚠️ la simulation ne touche à rien, et la reprise est rejouable', async () => {
    const { filId, mails } = await conversation(3);
    await empiler(filId, mails[0], ['LOT-A']);
    await empiler(filId, mails[1], ['LOT-A']);

    const vue = await simplifierLeFil({ filId, auteur: AUTEUR });        // sans `appliquer`
    expect(vue.periodesRetirees).toHaveLength(1);
    expect((await suiviDuFil(filId)).periodes).toHaveLength(2);          // rien n'a bougé

    await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });
    const encore = await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });
    expect(encore.periodesRetirees).toEqual([]);
    expect(encore.exceptionsRetirees).toEqual([]);
  });

  it('⚠️ une conversation déjà propre n’est pas touchée du tout', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({ filId, messageId: mails[0], classement: biens('LOT-A'), choix: 'suite', auteur: AUTEUR });
    await poserClassement({ filId, messageId: mails[2], classement: biens('LOT-B'), choix: 'suite', auteur: AUTEUR });

    const issue = await simplifierLeFil({ filId, auteur: AUTEUR, appliquer: true });
    expect(issue.periodesRetirees).toEqual([]);
    expect(issue.projetes).toBe(0);
    expect((await suiviDuFil(filId)).periodes).toHaveLength(2);
  });
});
