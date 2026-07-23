import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * ESPACE CLIENT — accès données (Commit C). `espace` est `server-only` + pool `pg` ; on MOCKE `query` pour PROUVER que
 * CHAQUE lecture est SCOPÉE par l'`internauteId` (WHERE internaute_id = $1, ou via la jointure internaute_projet), et
 * que la résolution du PDF porte la garde de propriété `c.id = $1 AND ip.internaute_id = $2`. Aucune base réelle.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { listerAnalyses, listerCertificats, resoudrePdfCertificat, resoudreVisuelCertificat, lireIdentite } from './espace';

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

  it('lireIdentite : SELECT prenom, nom scopé par id de session ; que ces 2 colonnes', async () => {
    query.mockResolvedValue({ rows: [{ prenom: 'Jean', nom: 'Dupont' }] });
    const r = await lireIdentite('A');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT prenom, nom FROM internaute WHERE id = \$1/);
    expect(sql).not.toMatch(/email|telephone/i); // aucune autre PII
    expect(params).toEqual(['A']);
    expect(r).toEqual({ prenom: 'Jean', nom: 'Dupont' });
  });

  it('lireIdentite : dossier anonymisé (prenom/nom NULL) → renvoyés tels quels', async () => {
    query.mockResolvedValue({ rows: [{ prenom: null, nom: null }] });
    expect(await lireIdentite('A')).toEqual({ prenom: null, nom: null });
  });

  it('lireIdentite : id inconnu (0 ligne) → { null, null }', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await lireIdentite('A')).toEqual({ prenom: null, nom: null });
  });

  it('resoudrePdfCertificat : garde de propriété c.id = $1 AND ip.internaute_id = $2 → clé + numéro', async () => {
    query.mockResolvedValue({ rows: [{ numero: 'SAVV-2026-000016', pdf_cle: 'internautes/A/certificats/x.pdf' }] });
    const r = await resoudrePdfCertificat('A', 7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT c\.numero, a\.pdf_cle/); // le numéro imprimé sort du gate, pas d'une seconde lecture
    expect(sql).toMatch(/WHERE c\.id = \$1 AND ip\.internaute_id = \$2/);
    expect(params).toEqual([7, 'A']);
    expect(r).toEqual({ statut: 'ok', cle: 'internautes/A/certificats/x.pdf', numero: 'SAVV-2026-000016' });
  });

  it('resoudrePdfCertificat : 0 ligne (pas à lui / inexistant) → introuvable (aucune fuite)', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await resoudrePdfCertificat('A', 999)).toEqual({ statut: 'introuvable' });
  });

  it('resoudrePdfCertificat : à lui mais PDF non généré → pdf_absent (avec numéro)', async () => {
    query.mockResolvedValue({ rows: [{ numero: 'SAVV-2026-000016', pdf_cle: null }] });
    expect(await resoudrePdfCertificat('A', 7)).toEqual({ statut: 'pdf_absent', numero: 'SAVV-2026-000016' });
  });

  // ── resoudreVisuelCertificat : SECONDE barrière de propriété (scopée) + mapping du descriptif ──
  it('resoudreVisuelCertificat : re-scopé c.id = $1 AND ip.internaute_id = $2 + mapping (numeric→number, année/époque)', async () => {
    query.mockResolvedValue({
      rows: [{
        reference: 'REF9ABC', verdict: 'SANS_VIS_A_VIS', score: '88',
        type_bien: 'Appartement', surface_m2: '72', nb_pieces: 3, annee_batiment: 1930, epoque: 'Années 30',
        etage: 2, dernier_etage: false, visuel_exterieur: 'Balcon', visuel_ville: 'Asnières',
      }],
    });
    const r = await resoudreVisuelCertificat('A', 7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/JOIN internaute_projet ip ON ip\.id = c\.projet_id/);
    expect(sql).toMatch(/WHERE c\.id = \$1 AND ip\.internaute_id = \$2/); // même garde anti-IDOR que le PDF
    expect(sql).not.toMatch(/adresse|lat|lon|nom|email|jeton/i); // AUCUNE colonne nominative dans le visuel
    expect(params).toEqual([7, 'A']);
    expect(r).toEqual({
      reference: 'REF9ABC', verdict: 'SANS_VIS_A_VIS', score: 88,
      descriptif: {
        ville: 'Asnières', typeBien: 'Appartement', surfaceM2: 72, pieces: 3,
        anneeOuEpoque: '1930', etage: 2, dernierEtage: false, exterieur: 'Balcon', // année prime sur l'époque
      },
    });
  });

  it('resoudreVisuelCertificat : année absente → repli sur l’époque ; numeric NULL tolérés', async () => {
    query.mockResolvedValue({
      rows: [{
        reference: 'REF0', verdict: 'SANS_VIS_A_VIS', score: null,
        type_bien: null, surface_m2: null, nb_pieces: null, annee_batiment: null, epoque: 'Années 60',
        etage: null, dernier_etage: null, visuel_exterieur: null, visuel_ville: null,
      }],
    });
    const r = await resoudreVisuelCertificat('A', 7);
    expect(r).toMatchObject({ score: null, descriptif: { anneeOuEpoque: 'Années 60', surfaceM2: null, ville: null } });
  });

  it('resoudreVisuelCertificat : 0 ligne (pas à lui / inexistant) → null (aucune fuite)', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await resoudreVisuelCertificat('A', 999)).toBeNull();
  });
});
