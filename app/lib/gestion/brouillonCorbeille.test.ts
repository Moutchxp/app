import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — UN BROUILLON JETÉ PART À LA CORBEILLE, ET IL EN REVIENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ARNO DEMANDAIT, ET POURQUOI CE N'ÉTAIT PAS POSSIBLE TEL QUEL.
 *
 * « Le brouillon part dans la CORBEILLE (état Gmail, comme un mail), d'où il peut être réintégré. »
 *
 * VÉRIFIÉ LE 29/09/2026 SUR LE VRAI COMPTE : Gmail l'accepte parfaitement — `messages.trash` sur le message d'un
 * brouillon rend `DRAFT TRASH`, le brouillon quitte la liste des brouillons, et `untrash` le ramène. Le blocage
 * n'est pas là.
 *
 * IL EST CHEZ NOUS : `gestion_brouillon` est NOTRE table. Elle ne porte aucun identifiant Gmail, et rien n'est
 * jamais poussé chez Google — nos brouillons n'existent pas dans Gmail, donc il n'y a RIEN à y mettre à la
 * corbeille. Décision d'Arno, prise en connaissance de cause : une corbeille LOCALE, montrée dans la même liste
 * que les mails, avec une capsule qui dit qu'elle est à nous.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ══════════════════════════════════════════════════════════════════════════════════
 *   ① RIEN N'EST JAMAIS SUPPRIMÉ — le geste DATE la ligne, il ne l'efface pas. Aucun `DELETE` dans ce module ;
 *   ② LE RETOUR EXISTE — et il rend le brouillon À SA PLACE, dans « Brouillons », avec son contenu et ses pièces ;
 *   ③ UN BROUILLON PARTI NE REVIENT PAS — ce n'est plus un brouillon, c'est un message.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...a)),
}));
vi.mock('./schema', () => ({
  redactionDisponible: async () => true,
  brouillonHtmlDisponible: async () => true,
  brouillonPieceDisponible: async () => false,
}));

import {
  abandonnerBrouillon, brouillonsALaCorbeille, compterBrouillonsALaCorbeille, restaurerBrouillon,
} from './redactionRepo';

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('🔴 ① rien n’est jamais supprimé', () => {
  it('« Mettre à la corbeille » POSE une date, et n’efface rien', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('UPDATE gestion_brouillon SET abandonne_le = now()');
    expect(SQL().join(' ').toUpperCase()).not.toContain('DELETE');
    expect(PARAMS(0)[0]).toBe(7);
  });

  /**
   * ⚠️ `envoye_le IS NULL` DANS LA CONDITION : un brouillon déjà PARTI n'est plus un brouillon, et le jeter
   * reviendrait à prétendre défaire un envoi. La garde est dans la requête, pas dans l'appelant.
   */
  it('🔴 un brouillon déjà parti n’est pas jetable', async () => {
    await abandonnerBrouillon(7);
    expect(SQL()[0]).toContain('envoye_le IS NULL');
  });
});

describe('🔴 ② le retour existe, et il remet le brouillon à sa place', () => {
  it('« Réintégrer » remet la date à NULL — le même verbe, par l’autre bout', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    expect(await restaurerBrouillon(7)).toBe(true);
    expect(SQL()[0]).toContain('SET abandonne_le = NULL');
    expect(SQL()[0]).toContain('abandonne_le IS NOT NULL');
  });

  /**
   * 🔴 IL DIT S'IL A FAIT QUELQUE CHOSE. Un brouillon qui n'était pas à la corbeille (ou déjà parti) ne se
   * restaure pas : la route doit pouvoir répondre « ce brouillon n'y est pas » plutôt qu'un succès qui ment.
   */
  it('🔴 restaurer ce qui n’y est pas rend `false`, jamais un faux succès', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await restaurerBrouillon(7)).toBe(false);
  });

  /** ⚠️ `maj_le` est touché : c'est la colonne sur laquelle « Brouillons » trie. Sans elle, il reviendrait au fond. */
  it('le brouillon réintégré remonte dans « Brouillons »', async () => {
    await restaurerBrouillon(7);
    expect(SQL()[0]).toContain('maj_le = now()');
  });
});

describe('🔴 ③ ce que la corbeille montre, et ce qu’elle compte', () => {
  it('la liste ne prend QUE les jetés, du plus récemment jeté au plus ancien', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille();
    const sql = SQL()[0];
    expect(sql).toContain('abandonne_le IS NOT NULL AND envoye_le IS NULL');
    expect(sql).toContain('ORDER BY abandonne_le DESC');
  });

  it('elle est BORNÉE : une corbeille se lit, elle ne défile pas', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille(999);
    expect(PARAMS(0)[0]).toBe(200);
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    await brouillonsALaCorbeille(-4);
    expect(PARAMS(0)[0]).toBe(1);
  });

  /**
   * 🔴 LE COMPTEUR COMPTE EXACTEMENT CE QUE LA LISTE MONTRE — même condition, écrite de la même façon. C'est la
   * règle du module depuis le lot BOITE-SENS : un compteur qui compte autrement fait chercher ailleurs ce qui est
   * sous les yeux, et c'est toujours le compteur qu'on croit.
   */
  it('🔴 le compteur porte la MÊME condition que la liste', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 3 }] });
    expect(await compterBrouillonsALaCorbeille()).toBe(3);
    expect(SQL()[0]).toContain('abandonne_le IS NOT NULL AND envoye_le IS NULL');
  });
});

/**
 * 🔒 GARDE STATIQUE — CE QUE LE MODULE NE FAIT PAS.
 *
 * Écrit sur le TEXTE plutôt que sur un cas d'essai : un `DELETE` ajouté dans une branche qu'aucun test ne
 * traverse passerait autrement inaperçu. Et c'est une promesse faite à Arno, pas une propriété d'un scénario.
 */
describe('🔒 garde statique', () => {
  it('aucun DELETE sur les brouillons', async () => {
    const { readFileSync } = await import('node:fs');
    const brut = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8');
    // ⚠️ Les commentaires sont retirés : ce module RACONTE ce qu'il ne fait pas, et le mot y figure donc.
    const code = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(code.toUpperCase()).not.toContain('DELETE FROM GESTION_BROUILLON');
  });
});
