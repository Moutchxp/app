import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT ETOILE-ET-SIGNATURE — UNE SEULE ÉTOILE, CELLE DE GMAIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT, TEL QU'ARNO L'A VU, ET LES CHIFFRES QUI L'EXPLIQUENT.
 *
 * Dans le fil 334 (« Urgence – Fuite importante… », 11 messages), le message du 18 septembre porte l'étoile rouge.
 * Le filtre étoile de la Réception ne renvoie AUCUN mail.
 *
 * Mesuré sur la vraie boîte le 29/09/2026 :
 *
 *     étoiles dans GMAIL (API, « is:starred »)  →  611 messages
 *     étoiles vues par le filtre                →    0 échange  (gestion_fil_etoile : 8 lignes, aucune à `true`)
 *
 * IL Y AVAIT DEUX ÉTOILES. Celle qu'on POSE, dans la conversation, bascule le libellé `STARRED` dans Gmail et ne
 * laisse aucune trace chez nous. Celle que le filtre LISAIT vivait dans `gestion_fil_etoile`, une table à nous que
 * Gmail ne connaît pas. Poser l'étoile là où on la voit ne pouvait donc jamais la faire apparaître là où on la
 * cherche — et aucun test ne pouvait le voir, puisque chacune des deux marchait parfaitement de son côté.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ══════════════════════════════════════════════════════════════════════════════════
 *   ① LE FILTRE LIT L'ÉTOILE DE GMAIL, et il la lit sur TOUT l'échange — pas seulement sur le dernier message ;
 *   ② LE MIROIR NE S'EFFACE PAS TOUT SEUL : « Gmail porte des étoiles et rien ne correspond » est une panne ;
 *   ③ LE GESTE EST CELUI DE GMAIL : poser sur un message, retirer sur tous — et Gmail AVANT notre base.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...a)),
}));
/** ⚠️ Variable du fichier, relue à chaque appel : les deux mondes (migration là / pas là) s'éprouvent tous deux. */
let migration277 = true;
vi.mock('./schema', () => ({
  etoileGmailDisponible: async () => migration277,
  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la 296 n'est pas le sujet ici : absente, le SQL est celui d'avant. */
  pieceIntegreeDisponible: async () => false,
}));

import {
  compterFilsEtoiles, ecrireEtoileMessage, filsEtoiles, messagesEtoilesDuFil, reconcilierEtoiles,
} from './etoileGmailRepo';
import { basculerEtoileDuFil, MENTION_SANS_MESSAGE, type DepsEtoileFil } from './etoileFil';
import { sqlPageBoite } from './boiteRepo';

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  migration277 = true;
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE FILTRE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① le filtre lit l’étoile de GMAIL, sur tout l’échange', () => {
  /**
   * 🔴 C'EST LE CAS DU FIL 334, ÉCRIT EN SQL. Le prédicat porte sur `me.fil_id = m.fil_id` — l'ÉCHANGE — et non
   * sur `m.id`. Un filtre qui n'aurait regardé que le message de la ligne aurait raté celui du 18 septembre, qui
   * n'est pas le dernier des onze.
   */
  it('🔴 le prédicat interroge tout l’échange, pas la ligne', () => {
    const sql = sqlPageBoite(false, undefined, false, false, null, true, false, false, null, true)
      .replace(/\s+/g, ' ');
    expect(sql).toContain('EXISTS (SELECT 1 FROM gestion_message me WHERE me.fil_id = m.fil_id');
    expect(sql).toContain('me.etoile_le IS NOT NULL');
    // …et l'ancienne table n'est plus nommée du tout.
    expect(sql).not.toContain('gestion_fil_etoile');
  });

  /** ⚠️ SANS LA MIGRATION 277, on retombe MOT POUR MOT sur l'ancien prédicat — rien ne casse, rien ne ment. */
  it('sans la migration 277, c’est encore l’étoile de l’équipe qui répond', () => {
    const sql = sqlPageBoite(false, undefined, false, false, null, true, false, false, null, false)
      .replace(/\s+/g, ' ');
    expect(sql).toContain('gestion_fil_etoile');
    expect(sql).not.toContain('etoile_le');
  });

  /** ⚠️ ET SANS LE FILTRE, NI L'UNE NI L'AUTRE N'EST NOMMÉE : on ne paie pas un EXISTS qu'on n'a pas demandé. */
  it('sans le filtre, aucune des deux sources n’est nommée', () => {
    const sql = sqlPageBoite(false, undefined, false, false, null, false, false, false, null, true);
    expect(sql).not.toContain('etoile_le');
    expect(sql).not.toContain('gestion_fil_etoile');
  });

  it('les échanges étoilés d’une page se lisent en UNE requête', async () => {
    queryMock.mockResolvedValue({ rows: [{ fil_id: '334' }] });
    expect(await filsEtoiles([334, 359])).toEqual(new Set([334]));
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(SQL()[0]).toContain('etoile_le IS NOT NULL');
  });

  it('sans la migration, la lecture rend un ensemble vide SANS rien demander', async () => {
    migration277 = false;
    expect(await filsEtoiles([334])).toEqual(new Set());
    expect(await compterFilsEtoiles()).toBe(0);
    expect(await messagesEtoilesDuFil(334)).toEqual([]);
    await ecrireEtoileMessage(1, true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** Le compteur compte des ÉCHANGES, pas des messages : onze messages étoilés d'un même fil font UNE ligne. */
  it('🔴 le compteur compte des échanges, pas des messages', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 7 }] });
    expect(await compterFilsEtoiles()).toBe(7);
    expect(SQL()[0]).toContain('count(DISTINCT fil_id)');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE MIROIR
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② la réconciliation est un miroir, et elle refuse de s’effacer toute seule', () => {
  it('pose sur ce que Gmail étoile, RETIRE de tout le reste', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 3 }], rowCount: 3 });
    const r = await reconcilierEtoiles(['<a@x>', 'b@y']);
    expect(r).toEqual({ poses: 3, retires: 3 });
    expect(SQL()[1]).toContain('SET etoile_le = coalesce(etoile_le, now())');
    expect(SQL()[2]).toContain('SET etoile_le = NULL');
    expect(SQL()[2]).toContain('NOT (message_id = ANY($1::text[]))');
  });

  /**
   * 🔴 LES DEUX ÉCRITURES D'UN `Message-ID`, avec et sans chevrons. C'est exactement le défaut qui a VIDÉ la
   * colonne `corbeille_le` sans un mot le 29/09/2026 : notre base garde les chevrons, Gmail les rend sans.
   */
  it('🔴 chaque Message-ID est comparé dans SES DEUX écritures', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
    await reconcilierEtoiles(['<a@x>']);
    expect(PARAMS(0)[0]).toEqual(expect.arrayContaining(['a@x', '<a@x>']));
  });

  /**
   * 🔴🔴 LE GARDE-FOU. « Gmail porte 611 étoiles et AUCUNE ne correspond chez nous » n'est pas un état, c'est une
   * signature de panne : on ne retire alors rien du tout. Une colonne vidée ressemble exactement à un travail bien
   * fait — c'est ce qui rend ce cas si dangereux.
   */
  it('🔴 Gmail étoile, rien ne correspond ⇒ REFUS, et aucune écriture', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }], rowCount: 0 });
    const r = await reconcilierEtoiles(['<a@x>', '<b@y>']);
    expect(r).toEqual({ poses: 0, retires: 0, refuse: 'aucune_correspondance' });
    expect(queryMock).toHaveBeenCalledTimes(1); // le comptage seul : aucun UPDATE
  });

  /** ⚠️ UNE BOÎTE RÉELLEMENT SANS ÉTOILE PASSE : elle vide la colonne, et c'est la vérité. */
  it('aucune étoile chez Gmail ⇒ la colonne se vide, sans refus', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }], rowCount: 4 });
    expect(await reconcilierEtoiles([])).toEqual({ poses: 4, retires: 4 });
  });

  it('sans la migration, la réconciliation rend `null` sans rien demander', async () => {
    migration277 = false;
    expect(await reconcilierEtoiles(['<a@x>'])).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE GESTE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const M = (n: number) => ({ messageId: n, messageIdRfc: `<m${n}@x>` });

function monde(o: Partial<{
  droit: boolean; jeton: string | null; dernier: ReturnType<typeof M> | null;
  etoiles: ReturnType<typeof M>[]; gmailRefuse: boolean; introuvable: boolean;
}> = {}) {
  const trace = { modifs: [] as { id: string; o: unknown }[], notes: [] as [number, boolean][], journal: 0 };
  const deps: DepsEtoileFil = {
    peutEcrire: async () => o.droit !== false,
    jetonAcces: async () => (o.jeton === undefined ? 'jeton' : o.jeton),
    dernierMessage: async () => (o.dernier === undefined ? M(9) : o.dernier),
    messagesEtoiles: async () => o.etoiles ?? [],
    ancrage: async (id) => ({ messageIdRfc: `<m${id}@x>`, gmailMessageId: `g${id}`, gmailThreadId: 't', de: 'a@b', deNom: null }),
    memoriser: async () => {},
    chercher: async () => (o.introuvable ? { ok: true, valeur: null } : { ok: true, valeur: { id: 'gX', threadId: 't' } }),
    modifier: async (_t, id, opts) => {
      trace.modifs.push({ id, o: opts });
      return o.gmailRefuse
        ? { ok: false, motif: 'Gmail a refusé.' }
        : { ok: true, valeur: { id, threadId: 't', libelles: [] } as never };
    },
    noter: async (m, e) => { trace.notes.push([m, e]); },
    journaliser: async () => { trace.journal += 1; },
  };
  return { deps, trace };
}

describe('🔴 ③ le geste est celui de Gmail — et Gmail passe AVANT notre base', () => {
  /**
   * 🔴 POSER : SUR LE SEUL MESSAGE DE LA LIGNE. Étoiler les onze messages du fil 334 pour un clic rendrait la
   * chose impossible à défaire message par message, et remplirait « Suivis » de bruit.
   */
  it('🔴 poser l’étoile ne touche QUE le dernier message', async () => {
    const { deps, trace } = monde({ dernier: M(57) });
    const r = await basculerEtoileDuFil(334, true, deps);
    expect(r).toEqual({ ok: true, etoilee: true, touches: 1 });
    expect(trace.modifs).toEqual([{ id: 'g57', o: { ajouter: ['STARRED'] } }]);
    expect(trace.notes).toEqual([[57, true]]);
  });

  /**
   * 🔴 RETIRER : SUR TOUS LES ÉTOILÉS. Sinon l'échange resterait dans le filtre après qu'on a cliqué pour l'en
   * sortir — le geste aurait l'air de n'avoir rien fait.
   */
  it('🔴 retirer l’étoile les touche TOUS', async () => {
    const { deps, trace } = monde({ etoiles: [M(1), M(2), M(3)] });
    const r = await basculerEtoileDuFil(334, false, deps);
    expect(r).toEqual({ ok: true, etoilee: false, touches: 3 });
    expect(trace.modifs.map((m) => m.id)).toEqual(['g1', 'g2', 'g3']);
    expect(trace.modifs[0].o).toEqual({ retirer: ['STARRED'] });
    expect(trace.notes).toEqual([[1, false], [2, false], [3, false]]);
  });

  /**
   * 🔴 GMAIL REFUSE ⇒ ON N'ÉCRIT RIEN CHEZ NOUS. C'est ce qui fait de `etoile_le` un miroir et non une opinion :
   * écrire d'abord chez nous ferait de notre base la vérité qui se trompe.
   */
  it('🔴 Gmail refuse ⇒ aucune trace locale, et on le dit', async () => {
    const { deps, trace } = monde({ gmailRefuse: true });
    const r = await basculerEtoileDuFil(334, true, deps);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe('refus_gmail');
    expect(trace.notes).toEqual([]);
    expect(trace.journal).toBe(0);
  });

  /**
   * 🔴 RETIRER CE QUI N'EST PLUS LÀ EST UN SUCCÈS. Notre miroir peut avoir un cran de retard (étoile décrochée
   * depuis un téléphone) : répondre « introuvable » ferait croire à une panne alors que l'état voulu est déjà vrai.
   */
  it('🔴 décrocher une étoile déjà absente réussit, sans rien toucher', async () => {
    const { deps, trace } = monde({ etoiles: [] });
    expect(await basculerEtoileDuFil(334, false, deps)).toEqual({ ok: true, etoilee: false, touches: 0 });
    expect(trace.modifs).toEqual([]);
  });

  it('un échange dont aucun message n’est retrouvé dans Gmail le dit', async () => {
    const { deps } = monde({ dernier: null });
    const r = await basculerEtoileDuFil(334, true, deps);
    expect(r.ok === false && r.motif).toBe(MENTION_SANS_MESSAGE);
  });

  it('sans droit d’écriture, rien ne part vers Gmail', async () => {
    const { deps, trace } = monde({ droit: false });
    expect((await basculerEtoileDuFil(334, true, deps)).ok).toBe(false);
    expect(trace.modifs).toEqual([]);
  });

  /** ⚠️ SANS CONNEXION GOOGLE, on ne fait pas semblant : l'étoile VIT dans Gmail, elle ne se pose pas sans lui. */
  it('sans connexion Google, le geste est refusé, pas simulé', async () => {
    const { deps, trace } = monde({ jeton: null });
    const r = await basculerEtoileDuFil(334, true, deps);
    expect(r.ok === false && r.code).toBe('sans_jeton');
    expect(trace.notes).toEqual([]);
  });
});
