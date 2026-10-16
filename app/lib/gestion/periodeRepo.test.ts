import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LE DÉPÔT DES PÉRIODES ET LEUR PROJECTION ═════════════════════════════════════
 *
 * Le module PUR (`periodesConversation.test.ts`) éprouve déjà la RÈGLE : quelle période pour quel mail, ce que
 * fait chaque choix, le scénario d'Arno. Ce fichier-ci garde ce que la règle devient EN BASE, et rien d'autre :
 *
 *   ① SANS LA MIGRATION 290, AUCUNE TABLE N'EST NOMMÉE. Nommer une table absente ne casse pas la fonction
 *      nouvelle : elle casse TOUTE la boîte (leçon de la migration 251).
 *   ② RIEN N'EST SUPPRIMÉ : une période remplacée est DATÉE, un lien en trop est RETIRÉ (statut), jamais effacé.
 *   ③ 🔴🔴 LA PROJECTION EST UN DIFF. Reposer un lien identique lui ferait perdre sa date, son auteur et son
 *      motif d'origine — tout ce qui permet de dire, six mois plus tard, d'où vient un rattachement.
 *   ④ ELLE NE TOUCHE QUE LES LOTS CONFIRMÉS : ni les propositions que personne n'a tranchées, ni les vieux liens
 *      « personne », ni les liens posés sur une pièce jointe.
 */

const queryMock = vi.fn();
const qMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => Promise<unknown>) => f(qMock),
}));

let migration290 = true;
let migration257 = true;
/**
 * ══ 🔴 LOT CONTACTS-EXTERNES — LA SEULE MODIFICATION DE CE FICHIER, ET ELLE N'EST PAS UN ATTENDU ══════════════
 *
 * `periodeRepo` sonde désormais une troisième migration (la 293, les interventions). Ce faux module doit donc
 * répondre à `interventionsDisponibles`, comme il répond déjà aux deux autres — sans quoi la sonde vaudrait
 * `undefined` et les 16 épreuves de ce fichier tomberaient sur un appel de non-fonction.
 *
 * 🔴 AUCUN ATTENDU N'A CHANGÉ, et c'est le point : `false` par défaut, donc la projection des interventions sort
 * à sa première ligne et `periodeRepo` se comporte EXACTEMENT comme avant ce lot. C'est la gratuité de ce lot sur
 * l'existant, vérifiée par les 16 épreuves telles qu'elles étaient écrites.
 *
 * (Le cas « 293 présente » est éprouvé à part, dans `contactsExternes.suivi.test.ts` : un fichier NOUVEAU.)
 */
let migration293 = false;
/** Le libellé de l'auteur, nommé avant les fabriques `vi.mock` qui le citent (elles sont hissées en tête). */
const AUTEUR_LIBELLE = 'a.jorel@sansvisavis.com';
vi.mock('./schema', () => ({
  periodesDisponibles: async () => migration290,
  rattachementsDisponibles: async () => migration257,
  interventionsDisponibles: async () => migration293,
  /* 🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — la sonde de la migration 297. ⚠️ UNE FABRIQUE `vi.mock`
     QUI OUBLIE UN EXPORT NEUF FAIT TOMBER LE MODULE À L'APPEL, pas à l'import : le piège est déjà consigné
     plusieurs fois dans ce dépôt. Elle rend `false` : la table n'est alors nommée nulle part, et les
     épreuves de FORME du SQL écrites avant ce lot restent vraies à la lettre. */
  interneDuMessageDisponible: async () => false,
}));

const rattacher = vi.fn(async () => ({ ok: true }));
const changerStatut = vi.fn(async () => ({ ok: true }));
vi.mock('./rattachementRepo', () => ({
  rattacher: (...a: unknown[]) => rattacher(...(a as [])),
  changerStatut: (...a: unknown[]) => changerStatut(...(a as [])),
}));
const marquerInterne = vi.fn(async () => ({ ok: true, nb: 0 }));
const annulerInterne = vi.fn(async () => ({ ok: true, nb: 0 }));
/**
 * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 2 — LA MARQUE D'ÉCHANGE, LUE UNE FOIS PAR PROJECTION.
 *
 * Elle décide si le REPLI a quelque chose à dire sur les mails de cette conversation, donc s'il faut écrire
 * « on s'est prononcé » pour l'empêcher de redonner « Interne » à un mail qu'une fenêtre a classé sur un bien.
 *
 * ⚠️ `echangeMarqueInterne` PILOTE LA RÉPONSE, et le défaut est `false` : sans marque d'échange, la projection
 * est mot pour mot celle d'avant ce lot — c'est ce que les épreuves de FORME du SQL écrites avant vérifient.
 */
let echangeMarqueInterne = false;
const lireInterne = vi.fn(async (fils: readonly number[]) => (echangeMarqueInterne
  ? new Map(fils.map((f) => [f, { filId: f, poseLe: '2026-10-01T09:00:00Z', posePar: AUTEUR_LIBELLE }]))
  : new Map()));
vi.mock('./interneRepo', () => ({
  marquerInterne: (...a: unknown[]) => marquerInterne(...(a as [])),
  annulerInterne: (...a: unknown[]) => annulerInterne(...(a as [])),
  lireInterne: (...a: unknown[]) => lireInterne(...(a as [readonly number[]])),
}));
const marquerHorsGestion = vi.fn(async () => ({ ok: true, nb: 0 }));
const annulerHorsGestion = vi.fn(async () => ({ ok: true, nb: 0 }));
vi.mock('./horsGestionRepo', () => ({
  marquerHorsGestion: (...a: unknown[]) => marquerHorsGestion(...(a as [])),
  annulerHorsGestion: (...a: unknown[]) => annulerHorsGestion(...(a as [])),
}));

import {
  annulerClassement, heriterLesNouveauxMails, poserClassement, projeterLeFil, reprendreExistant, MOTIF_POSE_PAR_SUIVI,
  MOTIF_DETACHE_A_LA_MAIN, MOTIF_REMPLACE_PAR_FENETRE,
} from './periodeRepo';

const AUTEUR = { id: 7, libelle: AUTEUR_LIBELLE };

/** La conversation que la fausse base raconte : ses mails, ses périodes, ses exceptions, ses liens posés. */
interface FausseBase {
  mails: number[];
  periodes: { id: string; depuis: number; sorte: string; biens: { cle: string; libelle: string }[] | null }[];
  exceptions: { id: string; message: number; sorte: string; biens: { cle: string; libelle: string }[] | null }[];
  liens: { id: number; message: number; cle: string; parLeSuivi?: boolean }[];
  filsARerendre: number[];
  dejaRepris: number;
}
let base: FausseBase;

const sqls = () => [...queryMock.mock.calls, ...qMock.mock.calls].map((c) => String(c[0]).replace(/\s+/g, ' '));
const toutLeSql = () => sqls().join(' § ');

function reponse(sql: string, params: unknown[] = []): { rows: unknown[] } {
  const s = sql.replace(/\s+/g, ' ');
  /* 🔴 LOT GESTION-DETACHER — les biens confirmés d'un mail, et les liens de ces biens sur ces mails. */
  /* 🔴 LOT GESTION-FENETRES-SUIVI — les liens des mails gouvernés qui ne sont pas des biens gardés. */
  if (s.includes('SELECT r.id::text, r.message_id::text FROM gestion_rattachement r WHERE r.message_id = ANY($1::bigint[]) AND NOT (r.cible_cle = ANY($2::text[]))')) {
    const mails = (params[0] as number[]).map(Number); const gardes = params[1] as string[];
    return { rows: base.liens.filter((l) => mails.includes(l.message) && !gardes.includes(l.cle)).map((l) => ({ id: String(l.id), message_id: String(l.message) })) };
  }
  if (s.includes('FROM gestion_message WHERE fil_id')) return { rows: base.mails.map((id) => ({ id: String(id) })) };
  if (s.includes('FROM gestion_fil_periode p')) {
    return { rows: base.periodes.map((p) => ({
      id: p.id, depuis_message_id: String(p.depuis), sorte: p.sorte,
      cree_par_libelle: AUTEUR.libelle, cree_le: '2026-10-01T09:00:00Z', biens: p.biens,
    })) };
  }
  if (s.includes('FROM gestion_message_exception e')) {
    return { rows: base.exceptions.map((e) => ({
      id: e.id, message_id: String(e.message), sorte: e.sorte,
      cree_par_libelle: AUTEUR.libelle, cree_le: '2026-10-01T09:00:00Z', biens: e.biens,
    })) };
  }
  if (s.includes('SELECT id::text, message_id::text, cible_cle')) {
    return { rows: base.liens.map((l) => ({
      id: String(l.id), message_id: String(l.message), cible_cle: l.cle,
      // ⚠️ Par défaut, un lien de la fausse base vient de la FENÊTRE : c'est le cas courant de la projection.
      par_le_suivi: l.parLeSuivi !== false,
    })) };
  }
  if (s.includes('SELECT DISTINCT m.fil_id')) return { rows: base.filsARerendre.map((f) => ({ fil_id: String(f) })) };
  if (s.includes('count(*)::int AS n FROM gestion_fil_periode')) return { rows: [{ n: base.dejaRepris }] };
  if (s.includes('SELECT r.message_id::text, r.cible_cle')) {
    return { rows: base.liens.map((l) => ({
      message_id: String(l.message), cible_cle: l.cle, cible_libelle: null,
    })) };
  }
  return { rows: [{ id: '990' }] }; // les INSERT … RETURNING id
}

beforeEach(() => {
  migration290 = true; migration257 = true; migration293 = false;
  base = { mails: [10, 20, 30], periodes: [], exceptions: [], liens: [], filsARerendre: [], dejaRepris: 0 };
  for (const m of [queryMock, qMock, rattacher, changerStatut, marquerInterne, annulerInterne,
    marquerHorsGestion, annulerHorsGestion]) m.mockClear();
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => reponse(sql, params));
  qMock.mockImplementation(async (sql: string, params?: unknown[]) => reponse(sql, params));
});

const BIEN = { cle: '421', libelle: '28 av. Marceau — Logement' };

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① sans la migration 290, aucune table n’est nommée', () => {
  beforeEach(() => { migration290 = false; });

  it('🔴🔴 poser un classement est refusé, et la base n’est pas touchée', async () => {
    const r = await poserClassement({
      filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('290');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('🔴 projeter et hériter ne font rien, en silence', async () => {
    expect(await projeterLeFil(1, AUTEUR)).toBe(0);
    expect(await heriterLesNouveauxMails(1, AUTEUR)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('🔴 la reprise rend des chiffres vides sans rien lire', async () => {
    expect(await reprendreExistant({ auteur: AUTEUR })).toEqual(
      { filsVus: 0, filsRepris: 0, periodes: 0, exceptions: 0, filsInfideles: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ② une période est une décision HUMAINE', () => {
  it('🔴 un auteur anonyme est refusé, et le refus est DIT', async () => {
    const r = await poserClassement({
      filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'suite',
      auteur: { id: null, libelle: '' },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('à la main');
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** 🔴 LE MOT QUE LA RELÈVE SIGNE EST REFUSÉ NOMMÉMENT — comme pour « interne ». */
  it('🔴 « automatique » est refusé nommément, quelle que soit la casse', async () => {
    for (const libelle of ['automatique', ' AUTOMATIQUE ']) {
      const r = await poserClassement({
        filId: 1, messageId: 10, classement: { sorte: 'interne', biens: [] }, choix: 'suite',
        auteur: { id: null, libelle },
      });
      expect(r.ok, libelle).toBe(false);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('⚠️ un mail qui n’appartient pas à la conversation est refusé', async () => {
    const r = await poserClassement({
      filId: 1, messageId: 999, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('cette conversation');
    expect(toutLeSql()).not.toContain('INSERT INTO gestion_fil_periode');
  });
});

describe('🔴🔴 ③ ce que chaque choix ÉCRIT', () => {
  it('🔴 « Ce mail et la suite » insère UNE période à ce mail, et ne remplace rien', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] }];
    const r = await poserClassement({
      filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_fil_periode');
    expect(sql).not.toContain('remplacee_le = now()');
    // …à partir de CE mail, et signée.
    const insert = qMock.mock.calls.find((c) => String(c[0]).includes('INSERT INTO gestion_fil_periode'));
    expect(insert?.[1]).toEqual([1, 20, 'biens', 7, AUTEUR.libelle]);
  });

  it('🔴 « Ce mail uniquement » n’insère AUCUNE période', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] }];
    await poserClassement({
      filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'mail', auteur: AUTEUR,
    });
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_message_exception');
    expect(sql).not.toContain('INSERT INTO gestion_fil_periode ');
  });

  /**
   * 🔴🔴 « TOUTE LA CONVERSATION » PART DU PREMIER MAIL, pas de celui qu'on regarde. Le module pur rend
   * `depuisMessageId = 0` et c'est ici qu'on lui substitue le premier mail de la conversation : le pur ne
   * connaît pas l'ordre de lecture de la base.
   */
  it('🔴🔴 « Toute la conversation » part du PREMIER mail et DATE les périodes, sans rien supprimer', async () => {
    base.periodes = [
      { id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] },
      { id: '5', depuis: 20, sorte: 'interne', biens: null },
    ];
    await poserClassement({
      filId: 1, messageId: 30, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'conversation',
      auteur: AUTEUR,
    });
    const insert = qMock.mock.calls.find((c) => String(c[0]).includes('INSERT INTO gestion_fil_periode'));
    expect(insert?.[1]).toEqual([1, 10, 'biens', 7, AUTEUR.libelle]); // 10 = le premier mail, pas 30

    const remplace = qMock.mock.calls.find((c) => String(c[0]).includes('remplacee_le = now()'));
    expect(remplace?.[1]).toEqual([[1, 5], AUTEUR.libelle]);
    expect(toutLeSql()).not.toContain('DELETE');
  });

  /** 🔴🔴 LES EXCEPTIONS SURVIVENT À « TOUTE LA CONVERSATION » — c'est la règle d'Arno, et on ne les touche pas. */
  it('🔴🔴 « Toute la conversation » ne retire AUCUNE exception des autres mails', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] }];
    base.exceptions = [{ id: '9', message: 20, sorte: 'biens', biens: [{ cle: '200', libelle: 'C' }] }];
    await poserClassement({
      filId: 1, messageId: 30, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'conversation',
      auteur: AUTEUR,
    });
    expect(toutLeSql()).not.toContain('UPDATE gestion_message_exception SET retiree_le');
  });

  /** ⚠️ …sauf celle du mail qu'on reclasse en période : elle masquerait la règle qu'on vient de poser. */
  it('⚠️ reclasser en période le mail qui portait une exception la retire, en la DATANT', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] }];
    base.exceptions = [{ id: '9', message: 20, sorte: 'biens', biens: [{ cle: '200', libelle: 'C' }] }];
    await poserClassement({
      filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [BIEN] }, choix: 'suite', auteur: AUTEUR,
    });
    const retrait = qMock.mock.calls.find((c) => String(c[0]).includes('SET retiree_le = now()'));
    expect(retrait?.[1]).toEqual([20]);
  });
});

describe('🔴🔴 ④ la projection est un DIFF', () => {
  it('🔴🔴 un lien déjà posé n’est NI reposé NI retiré', async () => {
    base.mails = [10];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 77, message: 10, cle: BIEN.cle }];
    expect(await projeterLeFil(1, AUTEUR)).toBe(0);
    expect(rattacher).not.toHaveBeenCalled();
    expect(changerStatut).not.toHaveBeenCalled();
  });

  it('🔴 ce qui manque est posé, ce qui est en trop est RETIRÉ (jamais effacé)', async () => {
    base.mails = [10, 20];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 77, message: 10, cle: BIEN.cle }, { id: 78, message: 10, cle: 'vieux' }];
    expect(await projeterLeFil(1, AUTEUR)).toBe(2);
    expect(changerStatut).toHaveBeenCalledWith(expect.objectContaining({ lienId: 78, statut: 'retire' }));
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 20, cible: { sorte: 'lot', cle: BIEN.cle, id: null },
    }));
    expect(rattacher).toHaveBeenCalledTimes(1);
  });

  /** ⚠️ UN MAIL ANTÉRIEUR À TOUTE PÉRIODE N'EST PAS TOUCHÉ : il reste à classer, il n'est pas « vidé ». */
  it('⚠️ les mails d’avant la première période sont laissés tels quels', async () => {
    base.mails = [10, 20];
    base.periodes = [{ id: '1', depuis: 20, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 77, message: 10, cle: 'autre' }];
    await projeterLeFil(1, AUTEUR);
    expect(changerStatut).not.toHaveBeenCalled();
    expect(rattacher).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴🔴 ON NE LIT QUE LES LOTS CONFIRMÉS. Une proposition que personne n'a tranchée serait, sinon, comptée
   * comme « en trop » et retirée au nom d'une période qui ne parle pas d'elle (point 3 d'Arno).
   */
  it('🔴🔴 la lecture de l’existant se borne aux lots confirmés, hors pièce jointe', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    await projeterLeFil(1, AUTEUR);
    const lecture = sqls().find((s) => s.includes('SELECT id::text, message_id::text, cible_cle')) ?? '';
    expect(lecture).toContain("cible_sorte = 'lot'");
    expect(lecture).toContain("statut = 'confirme'");
    expect(lecture).toContain('piece_id IS NULL');
  });

  /**
   * ══ 🔴🔴 LOT PREUVE-SUIVI-CONVERSATION — CE QU'UN HUMAIN A POSÉ N'EST JAMAIS DÉPLACÉ PAR UNE FENÊTRE ════════
   *
   * LE DÉFAUT QUE LE SCÉNARIO S11 A TROUVÉ (01/10/2026) : la projection retirait TOUT lien confirmé qu'une
   * fenêtre ne voulait plus — y compris celui qu'une personne avait posé en regardant le mail. Arno : « Un
   * rattachement posé à la main n'est jamais déplacé par un changement de fenêtre (sauf “Toute la
   * conversation”, qui le remplace). »
   *
   * ⚠️ MESURÉ SUR LA BASE RÉELLE AVANT LE CORRECTIF : 2 liens retirés par le suivi, tous deux posés par le suivi
   * lui-même. Aucun lien humain n'avait encore été touché — le défaut existait, il n'avait pas servi.
   */
  it('🔴🔴 un lien POSÉ À LA MAIN n’est pas retiré par une fenêtre', async () => {
    base.mails = [10];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 78, message: 10, cle: 'pose-a-la-main', parLeSuivi: false }];
    await projeterLeFil(1, AUTEUR);
    expect(changerStatut).not.toHaveBeenCalled();
    // …et la fenêtre pose quand même le sien, à côté.
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({
      cible: { sorte: 'lot', cle: BIEN.cle, id: null },
    }));
  });

  /** 🔴 LA SEULE EXCEPTION, ET ARNO LA NOMME : « Toute la conversation » remplace tout, le manuel compris. */
  it('🔴🔴 …sauf « Toute la conversation », qui le remplace', async () => {
    base.mails = [10];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 78, message: 10, cle: 'pose-a-la-main', parLeSuivi: false }];
    await projeterLeFil(1, AUTEUR, { remplacerLesLiensManuels: true });
    expect(changerStatut).toHaveBeenCalledWith(expect.objectContaining({ lienId: 78, statut: 'retire' }));
  });

  /** ⚠️ ET LA REQUÊTE SAIT LE DIRE : c'est le MOTIF qui distingue, pas `origine` (toujours « manuel »). */
  it('⚠️ la lecture distingue les liens de la fenêtre par leur MOTIF', async () => {
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    await projeterLeFil(1, AUTEUR);
    const lecture = sqls().find((x) => x.includes('SELECT id::text, message_id::text, cible_cle')) ?? '';
    expect(lecture).toContain('par_le_suivi');
    expect(queryMock.mock.calls.some((c) => (c[1] as unknown[])?.includes(MOTIF_POSE_PAR_SUIVI))).toBe(true);
  });

  it('⚠️ sans aucune période ni exception, la projection ne pose rien', async () => {
    expect(await projeterLeFil(1, AUTEUR)).toBe(0);
    expect(rattacher).not.toHaveBeenCalled();
    expect(annulerHorsGestion).not.toHaveBeenCalled();
  });
});

describe('🔴 ⑤ Interne et Hors gestion se projettent chacun à leur grain', () => {
  it('🔴 « interne » porte sur L’ÉCHANGE : il se pose une fois, pas par mail', async () => {
    base.mails = [10, 20, 30];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'interne', biens: null }];
    await projeterLeFil(4, AUTEUR);
    expect(marquerInterne).toHaveBeenCalledTimes(1);
    expect(marquerInterne).toHaveBeenCalledWith(expect.objectContaining({ filIds: [4] }));
    expect(marquerHorsGestion).not.toHaveBeenCalled();
  });

  it('🔴 « hors gestion » porte sur LE MAIL : il se pose mail par mail', async () => {
    base.mails = [10, 20];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'hors_gestion', biens: null }];
    await projeterLeFil(4, AUTEUR);
    expect(marquerHorsGestion).toHaveBeenCalledTimes(2);
  });

  /**
   * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES — ÉPREUVE RETOURNÉE, ET C'EST UNE DÉCISION D'ARNO ══════════════════════
   *
   * AVANT, cette ligne attendait `annulerInterne` dès que la période en cours n'était pas « interne » : la
   * projection RETIRAIT la marque de l'échange entier. Mesuré en production sur le fil 36671 — marque posée à
   * 10:18:14, retirée à 10:19:37 avec le motif « suivi de la conversation », c'est-à-dire par la projection.
   *
   * ARNO (03/10/2026) : « Chaque fenêtre est TOTALEMENT indépendante des autres : ni la distribution des mails
   * aux biens, ni le statut […] ne sont modifiés par la création ou la modification d'une autre fenêtre. »
   *
   * ⚠️ L'ÉPREUVE N'EST PAS AFFAIBLIE, ELLE EST INVERSÉE : elle vérifie maintenant qu'on ne retire RIEN.
   */
  it('🔴🔴 une fenêtre d’une AUTRE nature ne retire plus la marque « Interne »', async () => {
    base.mails = [10, 20];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'hors_gestion', biens: null }];
    await projeterLeFil(4, AUTEUR);
    expect(annulerInterne).not.toHaveBeenCalled();
  });

  /** 🔴🔴 LE CAS D'ARNO, MOT POUR MOT : une fenêtre « biens » ouverte au mail 2 ne touche pas au mail 1. */
  it('🔴🔴 une fenêtre « biens » ouverte au 2ᵉ mail ne retire pas « Interne »', async () => {
    base.mails = [10, 20];
    base.periodes = [{ id: '1', depuis: 20, sorte: 'biens', biens: [BIEN] }];
    await projeterLeFil(4, AUTEUR);
    expect(annulerInterne).not.toHaveBeenCalled();
    // ⚠️ ET LE MAIL 1 N'EST TOUCHÉ PAR RIEN : il est antérieur à toute fenêtre.
    expect(rattacher).toHaveBeenCalledTimes(1);
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({ messageId: 20 }));
  });

  /** 🔴 UNE EXCEPTION « HORS GESTION » NE FAIT PAS BASCULER L'ÉCHANGE : elle ne concerne que son mail. */
  it('🔴 une exception « hors gestion » au milieu d’une période « biens »', async () => {
    base.mails = [10, 20, 30];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [BIEN] }];
    base.exceptions = [{ id: '9', message: 20, sorte: 'hors_gestion', biens: null }];
    await projeterLeFil(4, AUTEUR);
    expect(marquerHorsGestion).toHaveBeenCalledTimes(1);
    expect(marquerHorsGestion).toHaveBeenCalledWith(expect.objectContaining({ messageIds: [20] }));
    // le mail en exception ne reçoit pas le bien de la période
    expect(rattacher).toHaveBeenCalledTimes(2);
    for (const c of rattacher.mock.calls) {
      expect(((c as unknown[])[0] as { messageId: number }).messageId).not.toBe(20);
    }
  });
});

describe('🔴🔴 ⑥ un mail qui arrive hérite de la période EN COURS', () => {
  it('🔴 il reçoit le classement de la dernière période ouverte', async () => {
    base.mails = [10, 20, 30];
    base.periodes = [
      { id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] },
      { id: '2', depuis: 20, sorte: 'biens', biens: [BIEN] },
    ];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: BIEN.cle }];
    await heriterLesNouveauxMails(4, AUTEUR);
    expect(rattacher).toHaveBeenCalledTimes(1);
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 30, cible: { sorte: 'lot', cle: BIEN.cle, id: null },
    }));
  });

  /** 🔴🔴 UNE EXCEPTION NE S'HÉRITE JAMAIS : c'est la moitié qui compte de la règle d'Arno. */
  it('🔴🔴 une exception sur le mail précédent ne devient pas la règle du nouveau', async () => {
    base.mails = [10, 20, 30];
    base.periodes = [{ id: '1', depuis: 10, sorte: 'biens', biens: [{ cle: '100', libelle: 'A' }] }];
    base.exceptions = [{ id: '9', message: 20, sorte: 'biens', biens: [BIEN] }];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: BIEN.cle }];
    await heriterLesNouveauxMails(4, AUTEUR);
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 30, cible: { sorte: 'lot', cle: '100', id: null },
    }));
  });

  it('⚠️ une conversation sans période : rien à hériter, et rien n’est posé', async () => {
    base.mails = [10, 20];
    expect(await heriterLesNouveauxMails(4, AUTEUR)).toBe(0);
    expect(rattacher).not.toHaveBeenCalled();
    expect(changerStatut).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 ⑦ la reprise de l’existant ne perd rien', () => {
  it('🔴🔴 par défaut elle SIMULE : elle compte sans écrire une seule ligne', async () => {
    base.filsARerendre = [4];
    base.mails = [10, 20, 30];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: '100' },
      { id: 3, message: 30, cle: '100' }];
    const c = await reprendreExistant({ auteur: AUTEUR });
    expect(c.filsVus).toBe(1);
    expect(c.filsRepris).toBe(1);
    expect(c.periodes).toBe(1);
    expect(c.filsInfideles).toBe(0);
    expect(qMock).not.toHaveBeenCalled(); // aucune transaction ouverte
  });

  it('🔴 avec --appliquer, la période est insérée avec ses biens', async () => {
    base.filsARerendre = [4];
    base.mails = [10, 20];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: '100' }];
    await reprendreExistant({ auteur: AUTEUR, appliquer: true });
    const sql = toutLeSql();
    expect(sql).toContain('INSERT INTO gestion_fil_periode');
    expect(sql).toContain('INSERT INTO gestion_fil_periode_bien');
  });

  /** ⚠️ RELANÇABLE SANS RIEN ABÎMER : une conversation déjà reprise est sautée. */
  it('⚠️ une conversation qui porte déjà une période est sautée', async () => {
    base.filsARerendre = [4];
    base.dejaRepris = 2;
    base.mails = [10, 20];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: '100' }];
    const c = await reprendreExistant({ auteur: AUTEUR, appliquer: true });
    expect(c.filsVus).toBe(1);
    expect(c.filsRepris).toBe(0);
    expect(qMock).not.toHaveBeenCalled();
  });

  /** 🔴 UN RATTACHEMENT POSÉ SUR UN SEUL MAIL EST REPRIS EN EXCEPTION (point 6 d'Arno). */
  it('🔴 un bien qui n’apparaît qu’une fois devient une exception, pas une période', async () => {
    base.filsARerendre = [4];
    base.mails = [10, 20, 30];
    base.liens = [{ id: 1, message: 10, cle: '100' }, { id: 2, message: 20, cle: '200' },
      { id: 3, message: 30, cle: '100' }];
    const c = await reprendreExistant({ auteur: AUTEUR });
    expect(c.periodes).toBe(1);
    expect(c.exceptions).toBe(1);
    expect(c.filsInfideles).toBe(0);
  });
});

/* ══ 🔴🔴 LOT GESTION-DETACHER (16/10/2026) — DÉCOCHER UN BIEN LE DÉTACHE VRAIMENT ═══════════════════════════════════════
   Cas exact du défaut : le lien vient du MOTEUR (ou d'une personne), pas d'une fenêtre — la projection ne le retirait
   pas. Il sort désormais du suivi par `changerStatut`, sur les mails que la portée couvre, et lui seul. */
describe('🔴🔴 LOT GESTION-DETACHER — décocher un bien puis valider le détache', () => {
  const detaches = () => (changerStatut.mock.calls as unknown as [{ lienId: number; statut: string; motif?: string }][])
    .map((c) => c[0]).filter((x) => x.motif === MOTIF_DETACHE_A_LA_MAIN || x.motif === MOTIF_REMPLACE_PAR_FENETRE);
  it('🔴🔴 le seul bien (lien du moteur), « ce mail seul » : sorti de CE mail, par la porte existante', async () => {
    base.liens = [{ id: 1, message: 20, cle: '421', parLeSuivi: false }, { id: 2, message: 30, cle: '421', parLeSuivi: false }];
    const r = await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [] }, choix: 'mail', auteur: AUTEUR });
    expect(r.ok).toBe(true);
    expect(detaches()).toEqual([{ lienId: 1, statut: 'retire', auteur: AUTEUR, motif: MOTIF_DETACHE_A_LA_MAIN }]);
    expect(r.ok === true && r.trace.liensDetaches).toEqual([1]);
    expect(toutLeSql()).not.toMatch(/DELETE FROM gestion_rattachement/);
  });
  it('🔴 un bien sur deux : seul le bien décoché part, l’autre reste', async () => {
    base.liens = [{ id: 1, message: 20, cle: '421', parLeSuivi: false }, { id: 3, message: 20, cle: '500', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '500', libelle: 'B' }] }, choix: 'mail', auteur: AUTEUR });
    expect(detaches().map((d) => d.lienId)).toEqual([1]);
  });
  it('🔴 « ce mail + futurs » : ce mail et les suivants, jamais les plus anciens', async () => {
    base.liens = [10, 20, 30].map((m, i) => ({ id: i + 1, message: m, cle: '421', parLeSuivi: false }));
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [] }, choix: 'suite', auteur: AUTEUR });
    expect(detaches().map((d) => d.lienId)).toEqual([2, 3]);
  });
  it('🔴 « toute la conversation » : tous les mails', async () => {
    base.liens = [10, 20, 30].map((m, i) => ({ id: i + 1, message: m, cle: '421', parLeSuivi: false }));
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [] }, choix: 'conversation', auteur: AUTEUR });
    expect(detaches().map((d) => d.lienId).sort()).toEqual([1, 2, 3]);
  });
  it('⚠️ rien de décoché : aucun détachement (un ajout ne retire rien)', async () => {
    base.liens = [{ id: 1, message: 20, cle: '421', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '421', libelle: 'A' }, BIEN] }, choix: 'mail', auteur: AUTEUR });
    expect(detaches()).toEqual([]);
  });
});

/* ══ 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — DES FENÊTRES SUCCESSIVES, QUI REMPLACENT ET NE CUMULENT PAS ═══ */
describe('🔴🔴 LOT GESTION-FENETRES-SUIVI — « Ce mail + futurs échanges » ouvre une fenêtre qui REMPLACE', () => {
  const sortis = () => (changerStatut.mock.calls as unknown as [{ lienId: number; motif?: string }][])
    .map((c) => c[0]).filter((x) => x.motif === MOTIF_DETACHE_A_LA_MAIN || x.motif === MOTIF_REMPLACE_PAR_FENETRE)
    .map((x) => x.lienId).sort((a, b) => a - b);
  it('🔴🔴 CAS EXACT DU FIL 36646 : lot 21 confirmé par la 1ʳᵉ fenêtre (motif du moteur), nouvelle fenêtre lot 36 au même mail ⇒ le 21 sort de ce mail et des suivants, rien avant', async () => {
    base.mails = [10, 20, 30, 40];
    base.periodes = [{ id: '1', depuis: 20, sorte: 'biens', biens: [{ cle: '21', libelle: 'lot 21' }] }];
    base.liens = [
      { id: 1, message: 10, cle: '99', parLeSuivi: false },          // mail antérieur : jamais lu
      { id: 2, message: 20, cle: '21', parLeSuivi: false },
      { id: 3, message: 30, cle: '21', parLeSuivi: false },
      { id: 4, message: 40, cle: '21', parLeSuivi: false },
    ];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'suite', auteur: AUTEUR });
    expect(sortis()).toEqual([2, 3, 4]);
    expect(toutLeSql()).not.toMatch(/DELETE FROM gestion_rattachement/);
  });
  it('🔴 la fenêtre s’arrête à la fenêtre suivante : ses mails gardent leur propre suivi (et une fenêtre posée AVANT une existante s’arrête à elle)', async () => {
    base.mails = [10, 20, 30, 40];
    base.periodes = [{ id: '1', depuis: 30, sorte: 'biens', biens: [{ cle: '77', libelle: 'lot 77' }] }];
    base.liens = [{ id: 2, message: 20, cle: '21', parLeSuivi: false }, { id: 3, message: 30, cle: '77', parLeSuivi: false }, { id: 4, message: 40, cle: '77', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'suite', auteur: AUTEUR });
    expect(sortis()).toEqual([2]);
  });
  it('🔴 un one shot à l’intérieur de la fenêtre est conservé', async () => {
    base.mails = [10, 20, 30, 40];
    base.exceptions = [{ id: '5', message: 30, sorte: 'biens', biens: [{ cle: '55', libelle: 'lot 55' }] }];
    base.liens = [{ id: 2, message: 20, cle: '21', parLeSuivi: false }, { id: 3, message: 30, cle: '55', parLeSuivi: false }, { id: 4, message: 40, cle: '21', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'suite', auteur: AUTEUR });
    expect(sortis()).toEqual([2, 4]);
  });
  /* 🔴 LOT GESTION-ONESHOT-CONVERSATION (Arno, 17/10/2026) — remplace la règle 5 de 93019d9b. */
  const preparer = () => {
    base.mails = [10, 20, 30];
    base.periodes = [{ id: '1', depuis: 30, sorte: 'biens', biens: [{ cle: '77', libelle: 'lot 77' }] }];
    base.exceptions = [{ id: '5', message: 20, sorte: 'biens', biens: [{ cle: '55', libelle: 'lot 55' }] }];
    base.liens = [{ id: 1, message: 10, cle: '21', parLeSuivi: false }, { id: 2, message: 20, cle: '55', parLeSuivi: false }, { id: 3, message: 30, cle: '77', parLeSuivi: false }];
  };
  it('🔴🔴 « Toute la conversation », case NON cochée (défaut) : tout est réaligné SAUF le one shot, intact', async () => {
    preparer();
    const r = await poserClassement({ filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'conversation', auteur: AUTEUR });
    expect(sortis()).toEqual([1, 3]);
    expect(toutLeSql()).not.toContain('UPDATE gestion_message_exception e SET retiree_le = now()');
    expect(toutLeSql()).toContain('UPDATE gestion_fil_periode SET remplacee_le = now()');
    expect(r.ok === true && r.trace.exceptionsRetirees).toEqual([]);
  });
  it('🔴🔴 case cochée : le one shot est remplacé aussi (daté, jamais supprimé), et la trace le garde pour l’« Annuler »', async () => {
    preparer();
    const r = await poserClassement({ filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'conversation', auteur: AUTEUR, ecraserOneShot: true });
    expect(sortis()).toEqual([1, 2, 3]);
    expect(toutLeSql()).toContain('UPDATE gestion_message_exception e SET retiree_le = now() WHERE e.message_id = ANY($1::bigint[])');
    expect(toutLeSql()).not.toMatch(/DELETE FROM gestion_message_exception/);
    expect(r.ok === true && r.trace.exceptionsRetirees).toHaveLength(1);
  });
  it('🔴 case cochée depuis un mail qui porte LUI AUSSI un one shot : les deux restent dans la trace (l’« Annuler » rouvre tout)', async () => {
    preparer();
    base.exceptions.push({ id: '6', message: 10, sorte: 'interne', biens: [] });
    const r = await poserClassement({ filId: 1, messageId: 10, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'lot 36' }] }, choix: 'conversation', auteur: AUTEUR, ecraserOneShot: true });
    /* Deux écritures (le one shot du mail 20, puis celui du mail classé) : leurs deux retours restent dans la trace. */
    expect(r.ok === true && r.trace.exceptionsRetirees).toHaveLength(2);
  });
  it('🔴 « Annuler » remet tout comme avant, one shot compris : exceptions rouvertes, liens sortis restaurés', async () => {
    await annulerClassement({
      trace: { filId: 1, messageId: 10, periodeCreee: 900, exceptionCreee: null, periodesRemplacees: [1],
        exceptionsRetirees: [5, 6], liensDetaches: [2] },
      auteur: AUTEUR,
    });
    const appels = (qMock.mock.calls as unknown as [string, unknown[]][])
      .map(([sql, p]) => ({ sql: String(sql).replace(/\s+/g, ' '), p }));
    const rouvre = appels.find((c) => c.sql.includes('UPDATE gestion_message_exception e SET retiree_le = NULL'));
    expect(rouvre?.p?.[0]).toEqual([5, 6]);
    expect(appels.some((c) => c.sql.includes('FROM gestion_rattachement r') && JSON.stringify(c.p?.[0]) === '[2]')).toBe(true);
  });
});

/* ══ 🔴🔴 LOT GESTION-BADGE-ONESHOT — le motif écrit dit si c'est un one shot ou une fenêtre (et donc le badge) ══════════ */
describe('🔴🔴 LOT GESTION-BADGE-ONESHOT — motif de la sortie', () => {
  const motifs = () => (changerStatut.mock.calls as unknown as [{ lienId: number; motif?: string }][]).map((c) => [c[0].lienId, c[0].motif]);
  it('« Ce mail + futurs » : motif de FENÊTRE sur tous ses mails, mail d’ouverture compris', async () => {
    base.mails = [10, 20, 30];
    base.liens = [{ id: 2, message: 20, cle: '21', parLeSuivi: false }, { id: 3, message: 30, cle: '21', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [{ cle: '36', libelle: 'B' }] }, choix: 'suite', auteur: AUTEUR });
    expect(motifs()).toEqual([[2, MOTIF_REMPLACE_PAR_FENETRE], [3, MOTIF_REMPLACE_PAR_FENETRE]]);
  });
  it('« ce mail uniquement » : motif « décoché à la main » (un vrai one shot)', async () => {
    base.liens = [{ id: 2, message: 20, cle: '21', parLeSuivi: false }];
    await poserClassement({ filId: 1, messageId: 20, classement: { sorte: 'biens', biens: [] }, choix: 'mail', auteur: AUTEUR });
    expect(motifs()).toEqual([[2, MOTIF_DETACHE_A_LA_MAIN]]);
  });
});
