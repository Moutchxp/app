import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LA LEVÉE EN BASE, SANS BASE ═════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) : « Quand un HUMAIN rattache un bien à un mail marqué Interne, la marque Interne est
 * levée pour ce mail, selon la même fenêtre choisie. […] La passe AUTOMATIQUE ne lève jamais la marque. »
 *
 * CE QUE CE FICHIER TIENT, et pourquoi chaque épreuve existe :
 *   ① LES TROIS CAS DU REPLI décident QUI est interne — et donc qui est levé. La règle vient du module pur ;
 *   ② DEUX ÉCRITURES DIFFÉRENTES selon le cas, et elles ne sont pas interchangeables : une marque VIVANTE se
 *      retire, un mail interne par le seul REPLI n'a RIEN à retirer et reçoit une ligne née retirée. C'est le
 *      défaut qu'on ne verrait jamais en lisant le code : l'`UPDATE` ne trouverait aucune ligne, ne lèverait rien,
 *      et ne le dirait pas ;
 *   ③ L'« ANNULER » défait les DEUX moitiés, liens d'abord ;
 *   ④ LES GARDES : un auteur non humain n'écrit rien, et un identifiant de lien ancien n'est pas retiré.
 *
 * ⚠️ LA BASE EST REMPLACÉE PAR UN ESPION QUI RÉPOND SELON LE SQL REÇU. On n'éprouve donc pas PostgreSQL : on
 * éprouve la DÉCISION — quelle écriture, dans quel ordre, et avec quel motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

let migration281 = true;
let migration297 = true;
let migration257 = true;
vi.mock('./schema', () => ({
  interneDisponible: async () => migration281,
  interneDuMessageDisponible: async () => migration297,
  rattachementsDisponibles: async () => migration257,
  annuaireDisponible: async () => true,
}));

/** La PORTE EXISTANTE des rattachements. On l'espionne : ce qui compte est qu'on passe par elle, et avec quel motif. */
const changerStatutMock = vi.fn(async (_geste: unknown) => ({ ok: true as const, id: 1 }));
vi.mock('./rattachementRepo', () => ({ changerStatut: (geste: unknown) => changerStatutMock(geste) }));

import {
  leverInterneApresRattachementHumain, mailsInternesParmi, remettreInterneApresAnnulation,
  retirerBiensApresAnnulationLevee,
} from './interneRepo';
import { MOTIF_LEVE_PAR_RATTACHEMENT, MOTIF_RATTACHEMENT_ANNULE } from './interneLevee';

const AUTEUR = { id: 7, libelle: 'Arnaud JOREL' };
const AUTOMATIQUE = { id: null, libelle: 'automatique' };

/** Les SQL émis, à blanc normalisé — jamais comparés en entier (règle du dépôt), seulement par fragments. */
const sqls = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const sqlQuiContient = (fragment: string): string[] => sqls().filter((s) => s.includes(fragment));

/**
 * ══ L'ÉTAT DE LA BASE, DÉCRIT PAR MAIL ══════════════════════════════════════════════════════════════════════════
 *
 * `vivante` : une marque par mail vivante · `connue` : une ligne existe (vivante ou retirée) · `echange` : la
 * marque de l'échange est vivante. Exactement les trois signaux de `interneDuMail`.
 */
type Etat = { id: number; vivante: boolean; connue: boolean; echange: boolean };

function brancher(etats: readonly Etat[]): void {
  queryMock.mockImplementation(async (sql: string) => {
    const plat = String(sql).replace(/\s+/g, ' ');
    // ① `mailsInternesParmi` : les trois signaux, par mail.
    if (plat.includes('AS vivante') && plat.includes('AS echange')) {
      return {
        rows: etats.map((e) => ({
          id: String(e.id), vivante: e.vivante, connue: e.connue, echange: e.echange,
        })),
      };
    }
    // ② `lireInterneDesMessages` : seules les lignes CONNUES existent.
    if (plat.includes('FROM gestion_message_interne') && plat.startsWith('SELECT DISTINCT ON')) {
      return {
        rows: etats.filter((e) => e.connue).map((e) => ({
          message_id: String(e.id), vivante: e.vivante, pose_le: '2026-10-01T00:00:00Z', pose_par: 'X',
        })),
      };
    }
    // ③ Les écritures rendent une ligne par identifiant, comme la vraie base.
    return { rows: [{ id: '1' }] };
  });
}

beforeEach(() => {
  migration281 = true; migration297 = true; migration257 = true;
  queryMock.mockReset(); changerStatutMock.mockClear();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('🔴🔴 ① qui est « interne » : la règle du repli, et elle seule', () => {
  it('🔴🔴 marque vivante · marque retirée · aucune marque + échange', async () => {
    brancher([
      { id: 10, vivante: true, connue: true, echange: false },   // ① interne par sa propre marque
      { id: 11, vivante: false, connue: true, echange: true },    // ② retirée ⇒ PAS interne, malgré l'échange
      { id: 12, vivante: false, connue: false, echange: true },   // ③ interne par le REPLI
      { id: 13, vivante: false, connue: false, echange: false },  // rien du tout
    ]);
    expect(await mailsInternesParmi([10, 11, 12, 13])).toEqual([10, 12]);
  });

  /**
   * ⚠️ SANS LA MIGRATION 297, LA TABLE N'EST NOMMÉE NULLE PART, et seul le repli répond. C'est le comportement
   * d'avant la marque par mail — pas une liste vide, qui se lirait « aucun mail n'est interne ».
   */
  it('⚠️ sans la 297, `gestion_message_interne` n’apparaît pas dans le SQL', async () => {
    migration297 = false;
    brancher([{ id: 12, vivante: false, connue: false, echange: true }]);
    expect(await mailsInternesParmi([12])).toEqual([12]);
    expect(sqlQuiContient('gestion_message_interne')).toEqual([]);
    expect(sqlQuiContient('gestion_fil_interne').length).toBe(1);
  });

  it('⚠️ aucune des deux migrations ⇒ aucune requête du tout', async () => {
    migration281 = false; migration297 = false;
    expect(await mailsInternesParmi([1, 2])).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 ② deux écritures, selon ce que le mail porte déjà', () => {
  it('🔴🔴 une marque VIVANTE est RETIRÉE, avec le motif de la levée', async () => {
    brancher([{ id: 10, vivante: true, connue: true, echange: false }]);
    const r = await leverInterneApresRattachementHumain({ messageIds: [10], auteur: AUTEUR });
    expect(r).toEqual([10]);
    const maj = sqlQuiContient('UPDATE gestion_message_interne');
    expect(maj.length).toBe(1);
    expect(maj[0]).toContain('SET retire_le = now()');
    /* 🔴 LE MOTIF EST BIEN CELUI DE CE GESTE : c'est la seule preuve dont l'« Annuler » disposera. */
    const params = queryMock.mock.calls
      .find((c) => String(c[0]).includes('UPDATE gestion_message_interne'))?.[1] as unknown[];
    expect(params).toContain(MOTIF_LEVE_PAR_RATTACHEMENT);
    /* …et AUCUNE ligne née retirée : il n'y avait rien à déclarer, la marque existait. */
    expect(sqlQuiContient('INSERT INTO gestion_message_interne')).toEqual([]);
  });

  /**
   * 🔴🔴 LE CAS QU'UN `UPDATE` SEUL AURAIT MANQUÉ EN SILENCE. Le mail est interne par le REPLI : il n'a aucune
   * ligne à retirer. Sans la ligne née retirée, il resterait interne avec un bien rattaché — l'état même que le
   * point e) de l'audit doit voir à zéro.
   */
  it('🔴🔴 un mail interne par le REPLI reçoit une ligne NÉE RETIRÉE', async () => {
    brancher([{ id: 12, vivante: false, connue: false, echange: true }]);
    const r = await leverInterneApresRattachementHumain({ messageIds: [12], auteur: AUTEUR });
    expect(r).toEqual([12]);
    const ins = sqlQuiContient('INSERT INTO gestion_message_interne');
    expect(ins.length).toBe(1);
    /* 🔴 NÉE RETIRÉE : la pose ET le retrait dans la même ligne, c'est ce qui dit « on s'est prononcé ». */
    expect(ins[0]).toContain('retire_le, retire_par, retire_par_libelle, retire_motif');
    expect(ins[0]).toContain('now()');
    /* ⚠️ ET JAMAIS DEUX FOIS : un mail qui porte déjà une ligne n'en reçoit pas une seconde. */
    expect(ins[0]).toContain('NOT EXISTS (SELECT 1 FROM gestion_message_interne x WHERE x.message_id = m.id)');
    expect(sqlQuiContient('UPDATE gestion_message_interne')).toEqual([]);
  });

  it('🔴 les deux cas dans le même geste : chacun sa requête, chacun ses mails', async () => {
    brancher([
      { id: 10, vivante: true, connue: true, echange: false },
      { id: 12, vivante: false, connue: false, echange: true },
      { id: 11, vivante: false, connue: true, echange: true },
    ]);
    const r = await leverInterneApresRattachementHumain({ messageIds: [10, 11, 12], auteur: AUTEUR });
    /* ⚠️ LE MAIL 11 N'EST PAS LEVÉ : il n'était pas interne. On ne touche pas ce qui n'est pas concerné. */
    expect(r).toEqual([10, 12]);
    expect(sqlQuiContient('UPDATE gestion_message_interne').length).toBe(1);
    expect(sqlQuiContient('INSERT INTO gestion_message_interne').length).toBe(1);
  });

  it('un mail qui n’est pas interne ne déclenche AUCUNE écriture', async () => {
    brancher([{ id: 11, vivante: false, connue: true, echange: true }]);
    const r = await leverInterneApresRattachementHumain({ messageIds: [11], auteur: AUTEUR });
    expect(r).toEqual([]);
    expect(sqlQuiContient('UPDATE gestion_message_interne')).toEqual([]);
    expect(sqlQuiContient('INSERT INTO gestion_message_interne')).toEqual([]);
  });

  /**
   * 🔴🔴 ET LA MARQUE DE L'ÉCHANGE N'EST JAMAIS TOUCHÉE, QUEL QUE SOIT LE CAS. Arno écrit « levée POUR CE MAIL » ;
   * et le commit 559d394a du 03/10 a précisément retiré de la projection le retrait de cette marque — « un repli
   * qu'une projection effacerait ne serait pas un repli ».
   */
  it('🔴🔴 dans tous les cas, `gestion_fil_interne` n’est jamais ÉCRITE', async () => {
    brancher([
      { id: 10, vivante: true, connue: true, echange: true },
      { id: 12, vivante: false, connue: false, echange: true },
    ]);
    await leverInterneApresRattachementHumain({ messageIds: [10, 12], auteur: AUTEUR });
    expect(sqlQuiContient('UPDATE gestion_fil_interne')).toEqual([]);
    expect(sqlQuiContient('INSERT INTO gestion_fil_interne')).toEqual([]);
    /* ⚠️ Elle est LUE, en revanche : c'est le repli, et il décide qui est interne. */
    expect(sqlQuiContient('FROM gestion_fil_interne').length).toBeGreaterThan(0);
  });
});

describe('🔴🔴 ③ l’« Annuler » défait les DEUX moitiés', () => {
  it('🔴🔴 la marque revient sur les mails nommés, par la porte existante', async () => {
    brancher([]);
    const r = await remettreInterneApresAnnulation({ messageIds: [10, 12], auteur: AUTEUR });
    expect(r).toBe(1);
    const ins = sqlQuiContient('INSERT INTO gestion_message_interne');
    expect(ins.length).toBe(1);
    expect(ins[0]).toContain('ON CONFLICT (message_id) WHERE retire_le IS NULL DO NOTHING');
    /* ⚠️ ET JAMAIS LA MARQUE DE L'ÉCHANGE : la levée ne l'avait pas touchée, l'annulation non plus. */
    expect(sqlQuiContient('INSERT INTO gestion_fil_interne')).toEqual([]);
  });

  /**
   * 🔴🔴 ET LE RATTACHEMENT PART AVEC. Remettre la marque sans retirer le bien reconstruirait « Interne avec un
   * bien » — précisément ce que ce lot ferme.
   */
  it('🔴🔴 le lien est RETIRÉ par `changerStatut`, avec le motif de l’annulation', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '4242' }] });
    const n = await retirerBiensApresAnnulationLevee([4242], AUTEUR);
    expect(n).toBe(1);
    expect(changerStatutMock).toHaveBeenCalledWith({
      lienId: 4242, statut: 'retire', auteur: AUTEUR, motif: MOTIF_RATTACHEMENT_ANNULE,
    });
  });

  /**
   * 🔴🔴 LES DEUX GARDES DU RETRAIT, LUS DANS LE SQL ÉMIS. Sans le second, un appel forgé pourrait retirer
   * n'importe quel rattachement de la base en se faisant passer pour une annulation.
   */
  it('🔴🔴 seuls un lien VIVANT, visant un BIEN, et créé à l’instant sont retirés', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await retirerBiensApresAnnulationLevee([4242], AUTEUR);
    const lu = sqlQuiContient('FROM gestion_rattachement');
    expect(lu.length).toBe(1);
    expect(lu[0]).toContain("statut = 'confirme'");
    expect(lu[0]).toContain("cible_sorte = 'lot'");
    expect(lu[0]).toContain("cree_le > now() - interval '2 minutes'");
    /* …et rien n'a été changé, puisque la lecture n'a rien rendu. */
    expect(changerStatutMock).not.toHaveBeenCalled();
  });

  it('⚠️ sans la migration 257, aucun lien n’est touché et rien n’est demandé', async () => {
    migration257 = false;
    expect(await retirerBiensApresAnnulationLevee([4242], AUTEUR)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 ④ les gardes : la levée est RÉSERVÉE À QUELQU’UN', () => {
  /**
   * 🔴🔴 LA DEMANDE D'ARNO, TENUE ICI AU NIVEAU DU DÉPÔT : « La passe AUTOMATIQUE ne lève jamais la marque. » Le
   * garde de source (`mailInterneSansBien.test.ts`, groupe ④) dit que personne ne l'appelle depuis la passe ;
   * celui-ci dit que même appelée, elle ne ferait rien.
   */
  it('🔴🔴 un auteur « automatique » ne lève RIEN, et n’émet aucune requête', async () => {
    brancher([{ id: 10, vivante: true, connue: true, echange: true }]);
    const r = await leverInterneApresRattachementHumain({ messageIds: [10], auteur: AUTOMATIQUE });
    expect(r).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('🔴 et il ne remet rien non plus', async () => {
    brancher([]);
    const r = await remettreInterneApresAnnulation({ messageIds: [10], auteur: AUTOMATIQUE });
    expect(r).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ UN ÉCHEC NE FAIT PAS ÉCHOUER LE RATTACHEMENT : il est déjà posé quand on arrive ici. On rend ce qu'on a pu
   * faire — et surtout, on ne lève pas d'exception dans le dos de l'appelant.
   */
  it('⚠️ une base muette ne lève aucune exception : on rend un geste vide', async () => {
    queryMock.mockRejectedValue(new Error('la base n’a pas répondu'));
    await expect(leverInterneApresRattachementHumain({ messageIds: [10], auteur: AUTEUR }))
      .resolves.toEqual([]);
    await expect(remettreInterneApresAnnulation({ messageIds: [10], auteur: AUTEUR })).resolves.toBe(0);
    await expect(retirerBiensApresAnnulationLevee([1], AUTEUR)).resolves.toBe(0);
  });
});
