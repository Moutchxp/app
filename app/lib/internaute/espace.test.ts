import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * ESPACE CLIENT — accès données (Commit C). `espace` est `server-only` + pool `pg` ; on MOCKE `query` pour PROUVER que
 * CHAQUE lecture est SCOPÉE par l'`internauteId` (WHERE internaute_id = $1, ou via la jointure internaute_projet), et
 * que la résolution du PDF porte la garde de propriété `c.id = $1 AND ip.internaute_id = $2`. Aucune base réelle.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { listerAnalyses, listerCertificats, resoudrePdfCertificat } from './espace';

describe('espace — accès données scopé par internaute_id (Commit C)', () => {
  beforeEach(() => query.mockReset());

  it('listerAnalyses : WHERE internaute_id = $1 + mapping (id→number, date→ISO, score→number)', async () => {
    query.mockResolvedValue({
      rows: [{ id: '42', cree_a: new Date('2026-07-01T10:00:00Z'), verdict: 'SANS_VIS_A_VIS', score: '87.5', etage: 3, adresse: '1 rue X' }],
    });
    const r = await listerAnalyses('A');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM internaute_projet/);
    expect(sql).toMatch(/WHERE internaute_id = \$1/);
    expect(params).toEqual(['A']);
    expect(r[0]).toEqual({ id: 42, creeA: '2026-07-01T10:00:00.000Z', verdict: 'SANS_VIS_A_VIS', score: 87.5, etage: 3, adresse: '1 rue X' });
  });

  it('listerCertificats : propriété via internaute_projet.internaute_id = $1', async () => {
    query.mockResolvedValue({
      rows: [{ id: '7', numero: 'SAVV-2026-000007', emis_le: new Date('2026-07-02T09:00:00Z'), verdict: 'VIS_A_VIS', score: '60', adresse: '2 rue Y', telechargeable: true }],
    });
    const r = await listerCertificats('A');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/JOIN internaute_projet ip ON ip\.id = c\.projet_id/);
    expect(sql).toMatch(/WHERE ip\.internaute_id = \$1/);
    expect(params).toEqual(['A']);
    expect(r[0]).toMatchObject({ id: 7, numero: 'SAVV-2026-000007', telechargeable: true });
  });

  it('resoudrePdfCertificat : garde de propriété c.id = $1 AND ip.internaute_id = $2 → clé', async () => {
    query.mockResolvedValue({ rows: [{ pdf_cle: 'internautes/A/certificats/x.pdf' }] });
    const r = await resoudrePdfCertificat('A', 7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE c\.id = \$1 AND ip\.internaute_id = \$2/);
    expect(params).toEqual([7, 'A']);
    expect(r).toEqual({ statut: 'ok', cle: 'internautes/A/certificats/x.pdf' });
  });

  it('resoudrePdfCertificat : 0 ligne (pas à lui / inexistant) → introuvable (aucune fuite)', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await resoudrePdfCertificat('A', 999)).toEqual({ statut: 'introuvable' });
  });

  it('resoudrePdfCertificat : à lui mais PDF non généré → pdf_absent', async () => {
    query.mockResolvedValue({ rows: [{ pdf_cle: null }] });
    expect(await resoudrePdfCertificat('A', 7)).toEqual({ statut: 'pdf_absent' });
  });
});
