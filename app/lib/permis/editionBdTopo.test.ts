import { describe, it, expect } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { millesimeEditionCourante, MILLESIME_INCONNU } from './editionBdTopo';

/**
 * BDT-2 — lecture du millésime de l'édition courante. `q` est une fausse RequeteTx : aucune base réelle. On vérifie la
 * résilience (table absente → 'inconnu') et le fait qu'on n'INVENTE jamais un millésime (aucune édition courante → 'inconnu').
 */
const faussReq = (repond: (sql: string) => QueryResultRow[]) =>
  (async (sql: string) => ({ rows: repond(sql) } as QueryResult<QueryResultRow>)) as never;

describe('millesimeEditionCourante', () => {
  it('table absente (migration 120 non appliquée) → INCONNU, sans requêter l’édition', async () => {
    let interrogeEdition = false;
    const q = faussReq((sql) => {
      if (/to_regclass/i.test(sql)) return [{ t: null }];
      if (/FROM bdtopo_edition/i.test(sql)) { interrogeEdition = true; return []; }
      return [];
    });
    expect(await millesimeEditionCourante(q)).toBe(MILLESIME_INCONNU);
    expect(interrogeEdition).toBe(false); // court-circuit : pas de requête sur une table absente
  });

  it('table présente + édition courante → son millésime', async () => {
    const q = faussReq((sql) => {
      if (/to_regclass/i.test(sql)) return [{ t: 'bdtopo_edition' }];
      if (/FROM bdtopo_edition WHERE courante/i.test(sql)) return [{ millesime: '2026-03-15' }];
      return [];
    });
    expect(await millesimeEditionCourante(q)).toBe('2026-03-15');
  });

  it('table présente mais AUCUNE édition courante → INCONNU (jamais supposé)', async () => {
    const q = faussReq((sql) => (/to_regclass/i.test(sql) ? [{ t: 'bdtopo_edition' }] : []));
    expect(await millesimeEditionCourante(q)).toBe(MILLESIME_INCONNU);
  });
});
