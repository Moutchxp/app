/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE — LES DEUX POINTS, ÉPROUVÉS SUR UNE VRAIE BASE ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISIONS D'ARNO (04/10/2026) :
 *
 *   1) « “Annuler” REJOUE AUSSI LA DÉCISION DE SUIVI D'AVANT. Après Annuler, l'état est exactement celui d'avant
 *      le geste : liens, interventions, marque Interne, ET décision de suivi (fenêtre, personnes, en-tête du
 *      bandeau). Aucune “décision vide” ni fausse exception ne doit rester. Test : photographie avant = après
 *      Annuler, pour les 3 fenêtres. »
 *
 *   2) « Fenêtre “Ce mail et la conversation à venir” ou “Toute la conversation” : les mails À VENIR suivent le
 *      nouveau choix (le bien) et n'héritent plus de la marque Interne. […] Fenêtre “Ce mail uniquement” : c'est
 *      une exception, la conversation garde sa marque Interne pour la suite. […] Tests : les 3 fenêtres, un mail
 *      à venir simulé, Annuler. »
 *
 * ═══ 🔴🔴 CE FICHIER NE TOURNE JAMAIS SUR LA BASE RÉELLE ════════════════════════════════════════════════════════
 *
 * Il ÉCRIT (c'est tout son objet) et il refuse de démarrer si `DATABASE_URL` ne désigne pas une base de test. Le
 * garde est la PREMIÈRE chose qu'il fait, avant toute requête : une protection qui s'exécuterait après la
 * première écriture ne protégerait rien. Même discipline que `suiviConversation.itest.ts`.
 *
 *   createdb svav_test_interne && for f in db/migrations/*.sql; do psql svav_test_interne -f $f; done
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_interne \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/interneAnnulerEtSuite.itest.ts
 *
 * ⚠️ `.itest.ts` : `npm test` ne le ramasse pas (voir `vitest.config.ts`), et c'est voulu — il demande une base.
 *
 * ═══ 🔴🔴 LA « PHOTOGRAPHIE » DE CE FICHIER, ET CE QU'ELLE COMPARE ══════════════════════════════════════════════
 *
 * Elle photographie l'état VIVANT d'une conversation : sa décision de suivi (périodes et exceptions, avec leurs
 * biens, leurs personnes, leurs dates et leurs auteurs), ses rattachements vivants, ses interventions vivantes, et
 * la marque « interne » de chacun de ses mails telle que la règle du repli la rend (`interneDuMail`).
 *
 * ⚠️ ELLE NE COMPTE PAS LES LIGNES RETIRÉES, ET C'EST VOLONTAIRE : le module ne supprime jamais rien. Un geste
 * annulé laisse derrière lui sa période refermée et son lien retiré, datés et signés — c'est l'historique, pas
 * l'état. Ce qu'Arno demande est que l'ÉTAT soit celui d'avant ; les traces, elles, doivent rester.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query, closePool } from '../db/client';
import {
  annulerClassement, mailsDuFil, poserClassement, suiviDuFil, type TraceClassement,
} from './periodeRepo';
import { lireInterne, marquerInterne } from './interneRepo';
import { lireInterneDesMessages } from './interneMessageRepo';
import { interneDuMail } from './interneDuMail';
import { REGLE_INTERVENTION } from './contactExterne';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE GARDE : CETTE ÉPREUVE ÉCRIT, ELLE NE DOIT TOUCHER QU'UNE BASE JETABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const URL_BASE = process.env.DATABASE_URL ?? '';
const NOM_BASE = URL_BASE.split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) {
  throw new Error(
    `interneAnnulerEtSuite.itest : refus de tourner sur « ${NOM_BASE || '(aucune base)'} ». `
    + 'Cette épreuve ÉCRIT : elle exige une base dont le nom commence par « svav_test ».',
  );
}

const AUTEUR = { id: null, libelle: 'épreuve interne-annuler-et-suite' };
const LOTS = ['LOT-INT-A', 'LOT-INT-B'] as const;
const bien = (cle: string) => ({ cle, libelle: `Bien fictif ${cle}` });
const biens = (cle: string) => ({ sorte: 'biens' as const, biens: [bien(cle)] });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE DÉCOR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

let compteur = 0;

/** Une conversation fictive de `n` mails, MARQUÉE « interne » au niveau de l'ÉCHANGE (la case du bandeau). */
async function conversationInterne(n: number): Promise<{ filId: number; mails: number[]; cle: string }> {
  compteur += 1;
  const cle = `int-${Date.now()}-${compteur}`;
  const { rows: f } = await query<{ id: string }>(
    "INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer') RETURNING id::text", [cle]);
  const filId = Number(f[0].id);
  const mails: number[] = [];
  for (let i = 1; i <= n; i += 1) mails.push(await ajouterMail(filId, cle, i));
  /**
   * 🔴 LA MARQUE PORTE SUR L'ÉCHANGE, ET C'EST TOUT L'OBJET DU POINT 2 : aucun mail ne porte de marque propre,
   * ils sont tous « interne » par le REPLI (cas ③ d'`interneDuMail`). C'est l'état que la case verte du bandeau
   * produit, et celui sur lequel `annulerInterneDesMessages` seul ne pouvait rien.
   */
  const pose = await marquerInterne({ filIds: [filId], auteur: AUTEUR });
  expect(pose.ok, 'la marque d’échange doit être posée').toBe(true);
  return { filId, mails, cle };
}

/** Un mail de plus dans la conversation — c'est ainsi qu'on simule un mail À VENIR. */
async function ajouterMail(filId: number, cle: string, rang: number): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
     VALUES ($1, $2, 'recu', $3, $4::timestamptz, $5) RETURNING id::text`,
    [filId, `${cle}-${rang}`, `expediteur${rang}@example.test`,
      `2026-02-${String(Math.min(rang, 28)).padStart(2, '0')}T09:00:00Z`, `Mail fictif n°${rang}`]);
  return Number(rows[0].id);
}

/**
 * ══ 🔴🔴 « CE MAIL EST-IL INTERNE ? » — PAR LA RÈGLE, JAMAIS PAR UNE TABLE ═════════════════════════════════════
 *
 * Elle lit les trois signaux et les passe au module PUR `interneDuMail`. Une épreuve qui regarderait
 * `gestion_message_interne` directement prouverait ce que la base contient, et non ce que l'écran montre — or
 * c'est l'écran qui doit changer.
 */
async function interneDesMails(filId: number, mails: readonly number[]): Promise<boolean[]> {
  const parMail = await lireInterneDesMessages(mails);
  const echange = (await lireInterne([filId])).has(filId);
  return mails.map((m) => interneDuMail({
    marqueDuMailVivante: parMail.get(m)?.vivante === true,
    marqueDuMailConnue: parMail.has(m),
    marqueDeLEchange: echange,
  }));
}

/** Les biens VIVANTS d'un mail, par leur clé, triés — l'historique tel que tout le reste de l'application le lit. */
async function biensDuMail(messageId: number): Promise<string[]> {
  const { rows } = await query<{ cible_cle: string }>(
    `SELECT cible_cle FROM gestion_rattachement
      WHERE message_id = $1 AND cible_sorte = 'lot' AND piece_id IS NULL AND statut = 'confirme'
      ORDER BY cible_cle`, [messageId]);
  return rows.map((r) => r.cible_cle);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA PHOTOGRAPHIE D'UNE CONVERSATION — L'INSTRUMENT DU POINT 1
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Tout ce qui est VIVANT dans une conversation, sous une forme comparable. */
async function photographie(filId: number): Promise<unknown> {
  const mails = await mailsDuFil(filId);
  const suivi = await suiviDuFil(filId);
  const { rows: liens } = await query<Record<string, unknown>>(
    `SELECT r.message_id::text AS mail, r.cible_sorte, r.cible_cle, r.cible_id::text, r.cible_libelle,
            r.regle, r.motif, r.origine
       FROM gestion_rattachement r
      WHERE r.message_id = ANY($1::bigint[]) AND r.statut = 'confirme'
      ORDER BY r.message_id, r.cible_sorte, r.cible_cle, r.cible_id, r.regle`, [mails]);
  const { rows: interventions } = await query<Record<string, unknown>>(
    `SELECT message_id::text AS mail, cible_sorte, cible_cle, cible_libelle
       FROM gestion_rattachement
      WHERE message_id = ANY($1::bigint[]) AND statut = 'confirme' AND regle = $2
      ORDER BY message_id, cible_sorte, cible_cle`, [mails, REGLE_INTERVENTION]);
  return {
    /* 🔴 LA DÉCISION DE SUIVI AVEC SES DATES ET SES AUTEURS : c'est ce que l'en-tête du bandeau affiche, et c'est
       la moitié que « rejouer une décision » ne pourrait jamais rendre à l'identique. */
    suivi,
    liens,
    interventions,
    interne: await interneDesMails(filId, mails),
  };
}

beforeAll(async () => {
  for (const cle of LOTS) {
    await query(
      `INSERT INTO gestion_annuaire_lot (wippimmo_id, adresse, commune, nature, proprietaire_texte)
       VALUES ($1, $2, 'VILLE-TEST', 'Appartement', 'Propriétaire fictif')
       ON CONFLICT (wippimmo_id) DO NOTHING`, [cle, `1 rue Fictive ${cle}`]);
  }
});
afterAll(async () => { await closePool(); });

/** Chaque scénario part d'une base propre de décisions : on ne veut pas qu'un essai en explique un autre. */
beforeEach(async () => {
  await query('DELETE FROM gestion_message_exception_bien');
  await query('DELETE FROM gestion_message_exception');
  await query('DELETE FROM gestion_fil_periode_bien');
  await query('DELETE FROM gestion_fil_periode');
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 POINT 1 — « ANNULER » REMET EXACTEMENT L'ÉTAT D'AVANT, POUR LES TROIS FENÊTRES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 POINT 1 — photographie AVANT = photographie APRÈS Annuler', () => {
  /**
   * ══ 🔴🔴 LE SCÉNARIO, POUR CHACUNE DES TROIS FENÊTRES ══════════════════════════════════════════════════════
   *
   * La conversation porte DÉJÀ une décision (une fenêtre sur un bien au 1er mail) et une exception sur un autre
   * mail : c'est le cas qui compte, parce que c'est celui où le geste FERME des lignes — et où « rejouer une
   * décision » ne rendrait jamais l'état d'avant.
   *
   * 🔴 ON COMPARE LA PHOTOGRAPHIE ENTIÈRE, par égalité profonde : décision de suivi (avec ses dates, ses
   * auteurs, ses biens, ses personnes), rattachements vivants, interventions vivantes, et la marque « interne »
   * de chaque mail. Un seul champ qui bouge fait rougir l'épreuve.
   */
  for (const choix of ['mail', 'suite', 'conversation'] as const) {
    it(`🔴🔴 fenêtre « ${choix} » : l’annulation rend la conversation à l’identique`, async () => {
      const { filId, mails } = await conversationInterne(4);
      // ① UN DÉCOR QUI A DÉJÀ UNE HISTOIRE : une fenêtre au 1er mail, une exception au 3e.
      await poserClassement({
        filId, messageId: mails[0], classement: biens('LOT-INT-A'), choix: 'suite', auteur: AUTEUR,
      });
      await poserClassement({
        filId, messageId: mails[2], classement: biens('LOT-INT-B'), choix: 'mail', auteur: AUTEUR,
      });

      const avant = await photographie(filId);

      // ② LE GESTE, sur le 2e mail, avec la fenêtre éprouvée.
      const issue = await poserClassement({
        filId, messageId: mails[1], classement: biens('LOT-INT-B'), choix, auteur: AUTEUR,
      });
      expect(issue.ok).toBe(true);
      const trace = (issue as { trace: TraceClassement }).trace;
      // ⚠️ LE GESTE A BIEN CHANGÉ QUELQUE CHOSE : sans cette assertion, l'égalité d'après ne prouverait rien.
      expect(await photographie(filId)).not.toEqual(avant);

      // ③ L'ANNULATION, par la trace.
      const annul = await annulerClassement({ trace, auteur: AUTEUR });
      expect(annul.ok).toBe(true);

      expect(await photographie(filId)).toEqual(avant);
    });
  }

  /**
   * 🔴🔴 LE CAS QUI A COÛTÉ UNE FAUSSE EXCEPTION AU LOT PRÉCÉDENT : le geste pose la PREMIÈRE décision de la
   * conversation. L'annulation doit la retirer ET retirer le lien qu'elle a posé — alors que la projection, elle,
   * n'a plus aucune décision à projeter et sort à zéro.
   *
   * ⚠️ C'EST ICI QUE « rejouer une décision vide » se trompait : il créait une exception « aucun bien » là où il
   * n'y en avait AUCUNE. L'égalité des photographies l'interdit.
   */
  it('🔴🔴 une conversation SANS décision la retrouve sans décision, et sans bien', async () => {
    const { filId, mails } = await conversationInterne(3);
    const avant = await photographie(filId);
    expect((avant as { suivi: { periodes: unknown[]; exceptions: unknown[] } }).suivi)
      .toEqual({ periodes: [], exceptions: [] });

    const issue = await poserClassement({
      filId, messageId: mails[1], classement: biens('LOT-INT-A'), choix: 'suite', auteur: AUTEUR,
    });
    expect(issue.ok && (issue as { trace: TraceClassement }).trace.periodeCreee).not.toBeNull();
    expect(await biensDuMail(mails[1])).toEqual(['LOT-INT-A']);

    await annulerClassement({ trace: (issue as { trace: TraceClassement }).trace, auteur: AUTEUR });

    expect(await photographie(filId)).toEqual(avant);
    /* 🔴 ET AUCUNE DÉCISION VIVANTE N'EST RESTÉE : ni période, ni exception, pas même vide. */
    expect(await suiviDuFil(filId)).toEqual({ periodes: [], exceptions: [] });
    expect(await biensDuMail(mails[1])).toEqual([]);
    expect(await interneDesMails(filId, mails)).toEqual([true, true, true]);
  });

  /**
   * ⚠️ LES TROIS GARDES DE LA RÉOUVERTURE, ÉPROUVÉS PAR LEUR REFUS. Une trace qui désigne une AUTRE conversation
   * ne doit rien rouvrir : c'est le garde qui empêche un appel forgé de ressusciter la décision de quelqu'un
   * d'autre.
   */
  it('🔒 une trace qui ment sur la conversation ne rouvre rien', async () => {
    const a = await conversationInterne(2);
    const b = await conversationInterne(2);
    // On ferme une décision dans A…
    const premier = await poserClassement({
      filId: a.filId, messageId: a.mails[0], classement: biens('LOT-INT-A'), choix: 'suite', auteur: AUTEUR,
    });
    const second = await poserClassement({
      filId: a.filId, messageId: a.mails[0], classement: biens('LOT-INT-B'), choix: 'suite', auteur: AUTEUR,
    });
    const traceA = (second as { trace: TraceClassement }).trace;
    expect(traceA.periodesRemplacees)
      .toEqual([(premier as { trace: TraceClassement }).trace.periodeCreee]);

    const avant = await photographie(a.filId);
    // …et l'on tente de l'annuler en prétendant que la trace appartient à B.
    await annulerClassement({ trace: { ...traceA, filId: b.filId }, auteur: AUTEUR });
    expect(await photographie(a.filId)).toEqual(avant);
  });

  /** 🔒 Et jamais automatiquement : une décision de suivi ne se défait qu'à la main, comme elle se pose. */
  it('🔒 un auteur « automatique » ne défait aucune décision', async () => {
    const { filId, mails } = await conversationInterne(2);
    const issue = await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-INT-A'), choix: 'suite', auteur: AUTEUR,
    });
    const apres = await photographie(filId);
    const r = await annulerClassement({
      trace: (issue as { trace: TraceClassement }).trace,
      auteur: { id: null, libelle: 'automatique' },
    });
    expect(r.ok).toBe(false);
    expect(await photographie(filId)).toEqual(apres);
  });
});
