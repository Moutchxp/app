/**
 * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — L'EXCEPTION, ÉPROUVÉE SUR UNE VRAIE BASE ══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « Modifier → exception sur ce seul mail, 0 PÉRIODE TOUCHÉE (empreinte avant/après),
 * mail suivant inchangé ; retour à l'état de la fenêtre → exception supprimée. »
 *
 * 🔴 POURQUOI SUR UNE VRAIE BASE, ET PAS EN SIMULATION. « Zéro période touchée » est une promesse qui porte sur ce
 * qui est ÉCRIT, pas sur ce qu'un composant croit envoyer. La seule preuve qui vaille est une EMPREINTE des tables
 * de périodes prise avant le geste et comparée après — et une empreinte ne se prend que sur de vraies lignes.
 *
 * 🔴 L'EMPREINTE EST UN `md5` DU CONTENU ENTIER des deux tables de périodes (la période et ses biens), lignes
 * ordonnées. Compter les lignes ne suffirait pas : une période FERMÉE puis une autre OUVERTE laisse le compte
 * inchangé, et c'est exactement le genre d'écriture qu'Arno interdit ici.
 *
 * ═══ 🔴🔴 CE FICHIER NE TOURNE JAMAIS SUR LA BASE RÉELLE ════════════════════════════════════════════════════════
 *
 * Il ÉCRIT. Le garde est la PREMIÈRE chose qu'il fait, avant toute requête : une protection qui s'exécuterait
 * après la première écriture ne protégerait rien.
 *
 *   createdb svav_test_visu && for f in db/migrations/*.sql; do psql -q -d svav_test_visu -f $f; done
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_visu \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/visualiserUnifie.itest.ts
 *
 * ⚠️ `.itest.ts` : `npm test` ne le ramasse pas (voir `vitest.config.ts`), et c'est voulu — il demande une base.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query, closePool } from '../db/client';
import { poserClassement, suiviDuFil, mailsDuFil } from './periodeRepo';
import { projeter } from './periodesConversation';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE GARDE : CETTE ÉPREUVE ÉCRIT, ELLE NE DOIT TOUCHER QU'UNE BASE JETABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const URL_BASE = process.env.DATABASE_URL ?? '';
const NOM_BASE = URL_BASE.split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) {
  throw new Error(
    `visualiserUnifie.itest : refus de tourner sur « ${NOM_BASE || '(aucune base)'} ». `
    + 'Cette épreuve ÉCRIT : elle exige une base dont le nom commence par « svav_test ».',
  );
}

const AUTEUR = { id: null, libelle: 'épreuve de la fenêtre unifiée' };
const LOTS = ['LOT-FEN-A', 'LOT-FEN-B', 'LOT-FEN-C'] as const;
const bien = (cle: string) => ({ cle, libelle: `Bien fictif ${cle}` });
const biens = (...cles: string[]) => ({ sorte: 'biens' as const, biens: cles.map(bien) });

let compteur = 0;

/** Une conversation fictive de `n` mails, et les identifiants de ses messages DANS L'ORDRE DE LECTURE. */
async function conversation(n: number): Promise<{ filId: number; mails: number[] }> {
  compteur += 1;
  const cle = `fictif-visu-${Date.now()}-${compteur}`;
  const { rows: f } = await query<{ id: string }>(
    "INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer') RETURNING id::text", [cle]);
  const filId = Number(f[0].id);
  const mails: number[] = [];
  for (let i = 1; i <= n; i += 1) {
    const { rows: m } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, 'recu', $3, $4::timestamptz, $5) RETURNING id::text`,
      [filId, `${cle}-${i}`, `expediteur${i}@example.test`,
        `2026-02-0${Math.min(i, 9)}T09:00:00Z`, `Mail fictif n°${i}`]);
    mails.push(Number(m[0].id));
  }
  return { filId, mails };
}

/**
 * ══ 🔴🔴 L'EMPREINTE DES PÉRIODES — LA PREUVE DE « ZÉRO PÉRIODE TOUCHÉE » ════════════════════════════════════════
 *
 * Un `md5` du contenu ENTIER des deux tables, pour CE fil, lignes ordonnées. Tout y entre : la date de
 * REMPLACEMENT, l'auteur, les biens de chaque période. Une période fermée et remplacée a le même COMPTE et une autre
 * EMPREINTE — c'est précisément ce qu'on veut attraper.
 */
async function empreintePeriodes(filId: number): Promise<string> {
  const { rows } = await query<{ md5: string }>(
    `SELECT md5(coalesce(string_agg(x.ligne, '|' ORDER BY x.ligne), '')) AS md5
       FROM (
         SELECT concat_ws(';', 'p', p.id::text, p.fil_id::text, p.depuis_message_id::text, p.sorte,
                          p.cree_le::text, p.cree_par_libelle,
                          p.remplacee_le::text, p.remplacee_par_libelle) AS ligne
           FROM gestion_fil_periode p WHERE p.fil_id = $1
         UNION ALL
         SELECT concat_ws(';', 'b', b.periode_id::text, b.cible_cle, b.cible_libelle) AS ligne
           FROM gestion_fil_periode_bien b
           JOIN gestion_fil_periode p ON p.id = b.periode_id WHERE p.fil_id = $1
       ) x`, [filId]);
  return rows[0]?.md5 ?? '';
}

/** Les exceptions vivantes du fil, par mail — pour dire « posée » et « supprimée » sans ambiguïté. */
async function exceptionsDuFil(filId: number): Promise<number[]> {
  const { exceptions } = await suiviDuFil(filId);
  return exceptions.map((e) => e.messageId).sort((a, b) => a - b);
}

/** Le classement EN VIGUEUR sur un mail, tel que la projection le calcule — la vérité de l'écran. */
async function classementDuMail(filId: number, messageId: number): Promise<string[]> {
  const [suivi, mails] = await Promise.all([suiviDuFil(filId), mailsDuFil(filId)]);
  const vu = projeter(mails, suivi.periodes, suivi.exceptions);
  const c = vu.get(messageId) ?? null;
  return c === null || c.sorte !== 'biens' ? [] : c.biens.map((b) => b.cle).sort();
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

beforeEach(async () => {
  await query('DELETE FROM gestion_message_exception_bien');
  await query('DELETE FROM gestion_message_exception');
  await query('DELETE FROM gestion_fil_periode_bien');
  await query('DELETE FROM gestion_fil_periode');
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 V1 — « MODIFIER LES BIENS DE CE MAIL » POSE UNE EXCEPTION, ET RIEN D'AUTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('V1 — modifier les biens d’un mail ne touche aucune période', () => {
  /**
   * 🔴🔴 LE SCÉNARIO EST CELUI D'ARNO, À LA FORME DU FIL 3490 : une fenêtre de suivi court sur toute la
   * conversation (lot A), et l'on vient corriger UN mail — on y ajoute le lot B, on en retire le lot A.
   *
   * C'est exactement ce que la fenêtre envoie : la LISTE VOULUE pour ce mail, avec `choix: 'mail'`.
   */
  it('🔴🔴 empreinte des périodes IDENTIQUE avant et après, et une exception posée sur ce seul mail', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A'), choix: 'suite', auteur: AUTEUR,
    });

    const avant = await empreintePeriodes(filId);
    const { periodes: pAvant } = await suiviDuFil(filId);

    // ── LE GESTE DE LA FENÊTRE : les biens VOULUS pour le mail 3, en une requête, portée « ce mail uniquement ».
    const r = await poserClassement({
      filId, messageId: mails[2], classement: biens('LOT-FEN-B'), choix: 'mail', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);

    // 🔴🔴 ZÉRO PÉRIODE TOUCHÉE — ni créée, ni fermée, ni modifiée. L'empreinte le dit mieux qu'un compte.
    expect(await empreintePeriodes(filId)).toBe(avant);
    const { periodes: pApres } = await suiviDuFil(filId);
    expect(pApres.map((p) => p.id)).toEqual(pAvant.map((p) => p.id));

    // 🔴 ET L'EXCEPTION EST BIEN LÀ, sur ce mail et sur lui seul.
    expect(await exceptionsDuFil(filId)).toEqual([mails[2]]);
    expect(await classementDuMail(filId, mails[2])).toEqual(['LOT-FEN-B']);
  });

  /** 🔴🔴 « MAIL SUIVANT INCHANGÉ » (Arno) — et le précédent aussi : une exception ne déborde pas. */
  it('🔴🔴 les autres mails de la conversation ne bougent pas d’un pouce', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A'), choix: 'suite', auteur: AUTEUR,
    });
    await poserClassement({
      filId, messageId: mails[2], classement: biens('LOT-FEN-B'), choix: 'mail', auteur: AUTEUR,
    });

    for (const i of [0, 1, 3]) {
      expect(await classementDuMail(filId, mails[i]), `mail n°${i + 1}`).toEqual(['LOT-FEN-A']);
    }
  });

  /**
   * 🔴🔴 LES AJOUTS **ET** LES RETRAITS — « Valider fixe les biens de CE mail (ajouts ET retraits) » (Arno).
   *
   * ⚠️ TOUT DÉCOCHER EST UN GESTE PLEIN : « ce mail ne concerne aucun bien ». C'est le seul moyen de retirer le
   * dernier bien, et c'est pour cela que la fenêtre autorise la validation d'une liste vide.
   */
  it('🔴🔴 une liste vide retire tout — sur ce mail, et sur lui seul', async () => {
    const { filId, mails } = await conversation(3);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A', 'LOT-FEN-C'), choix: 'suite', auteur: AUTEUR,
    });
    const avant = await empreintePeriodes(filId);

    await poserClassement({
      filId, messageId: mails[1], classement: biens(), choix: 'mail', auteur: AUTEUR,
    });

    expect(await empreintePeriodes(filId)).toBe(avant);
    expect(await classementDuMail(filId, mails[1])).toEqual([]);
    expect(await classementDuMail(filId, mails[2])).toEqual(['LOT-FEN-A', 'LOT-FEN-C']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 V2 — LE RETOUR À LA CONFIGURATION DE LA FENÊTRE SUPPRIME L'EXCEPTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('V2 — revenir à la configuration en vigueur n’écrit rien', () => {
  /**
   * 🔴🔴 RÈGLE D'ARNO : « un retour à la configuration de la fenêtre en vigueur SUPPRIME l'exception (règle du
   * dernier choix, rien d'écrit) ».
   *
   * 🔴 ELLE N'A PAS ÉTÉ ÉCRITE POUR CE LOT : c'est la règle 2 du lot SUIVI-DERNIER-CHOIX (`effetDuChoix`), qui
   * retire la décision d'un mail dès qu'elle aboutit à la configuration en vigueur juste avant lui. On éprouve
   * ici qu'elle couvre bien le geste de la fenêtre — et donc qu'il n'a fallu l'écrire nulle part.
   */
  it('🔴🔴 l’exception est posée, puis SUPPRIMÉE quand on revient aux biens de la fenêtre', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A'), choix: 'suite', auteur: AUTEUR,
    });
    const avant = await empreintePeriodes(filId);

    // ① on modifie : exception posée
    await poserClassement({
      filId, messageId: mails[2], classement: biens('LOT-FEN-B'), choix: 'mail', auteur: AUTEUR,
    });
    expect(await exceptionsDuFil(filId)).toEqual([mails[2]]);

    // ② on rouvre la fenêtre et l'on revient aux biens de la fenêtre en vigueur : plus d'exception du tout
    await poserClassement({
      filId, messageId: mails[2], classement: biens('LOT-FEN-A'), choix: 'mail', auteur: AUTEUR,
    });
    expect(await exceptionsDuFil(filId)).toEqual([]);
    expect(await classementDuMail(filId, mails[2])).toEqual(['LOT-FEN-A']);

    // 🔴 ET TOUJOURS AUCUNE PÉRIODE TOUCHÉE, d'un bout à l'autre du va-et-vient.
    expect(await empreintePeriodes(filId)).toBe(avant);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 V3 — LE LIEN « CHANGER PLUTÔT LA RÈGLE DE SUIVI » : LES DEUX AUTRES PORTÉES, INCHANGÉES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('V3 — les deux options du bloc de suivi gardent leur comportement', () => {
  /** « Ce mail et la conversation à venir » : nouvelle fenêtre à partir d'ici, le passé ne bouge pas. */
  it('🔴 « à venir » ouvre une fenêtre ici, et laisse le passé tranquille', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A'), choix: 'suite', auteur: AUTEUR,
    });
    await poserClassement({
      filId, messageId: mails[2], classement: biens('LOT-FEN-B'), choix: 'suite', auteur: AUTEUR,
    });

    expect(await classementDuMail(filId, mails[0])).toEqual(['LOT-FEN-A']);
    expect(await classementDuMail(filId, mails[1])).toEqual(['LOT-FEN-A']);
    expect(await classementDuMail(filId, mails[2])).toEqual(['LOT-FEN-B']);
    expect(await classementDuMail(filId, mails[3])).toEqual(['LOT-FEN-B']);
  });

  /** « Toute la conversation » : tous les mails, et les exceptions déjà posées sont CONSERVÉES. */
  it('🔴🔴 « toute la conversation » reclasse tout, mais garde les exceptions', async () => {
    const { filId, mails } = await conversation(4);
    await poserClassement({
      filId, messageId: mails[0], classement: biens('LOT-FEN-A'), choix: 'suite', auteur: AUTEUR,
    });
    // une exception posée par la fenêtre, sur le mail 2
    await poserClassement({
      filId, messageId: mails[1], classement: biens('LOT-FEN-C'), choix: 'mail', auteur: AUTEUR,
    });

    await poserClassement({
      filId, messageId: mails[3], classement: biens('LOT-FEN-B'), choix: 'conversation', auteur: AUTEUR,
    });

    expect(await classementDuMail(filId, mails[0])).toEqual(['LOT-FEN-B']);
    // 🔴🔴 L'EXCEPTION SURVIT : c'est la décision la plus fine de la conversation, et elle l'emporte.
    expect(await classementDuMail(filId, mails[1])).toEqual(['LOT-FEN-C']);
    expect(await classementDuMail(filId, mails[2])).toEqual(['LOT-FEN-B']);
    expect(await classementDuMail(filId, mails[3])).toEqual(['LOT-FEN-B']);
  });
});
