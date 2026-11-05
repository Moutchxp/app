import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE (Arno, 05/11/2026) — LE COMPTE DU NÉGOCIATEUR POSÉ SUR LA LIGNE, SEULEMENT QUAND IL EST SÛR (migration 458).
 * Sûr = la règle d'Arno du 26/10/2026 : rattachement posé à la main, ou libellé égal au « prénom nom », « nom prénom » ou à l'adresse d'UN
 * SEUL compte. Un prénom seul, un homonyme, un inconnu : rien — on ne devine pas. Base simulée : rien n'est écrit.
 */
const h = vi.hoisted(() => ({ avec458: true, comptes: [] as { id: number; identifiant: string; prenom: string | null; nom: string | null }[] }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec458 }));
vi.mock('../location/suivi/negociateurIdentiteRepo', () => ({ lireComptesNegociateurs: async () => h.comptes, lireAliasNegociateurs: async () => [] }));
vi.mock('../db/client', () => ({ query: vi.fn() }));
const { compteSurDuLibelle, correspondancesSures, relierComptesSurs } = await import('./negociateurCompte');

const PIERRE = { id: 8, identifiant: 'p.thevenin@sansvisavis.com', prenom: 'Pierre', nom: 'Thevenin' };
const JB = { id: 5, identifiant: 'jb.pons@sansvisavis.com', prenom: 'Jean-Baptiste', nom: 'PONS' };
const DOUBLON = { id: 11, identifiant: 'pierre.thevenin@exemple.test', prenom: 'Pierre', nom: 'THEVENIN' };
beforeEach(() => { h.avec458 = true; h.comptes = [PIERRE, JB]; });

describe('le compte SÛR d’un libellé', () => {
  it('nom exact (accents, casse, espaces neutralisés), nom inversé, ou adresse d’un seul compte : le compte', () => {
    expect(compteSurDuLibelle('Pierre Thevenin', [PIERRE, JB], [])).toBe(8);
    expect(compteSurDuLibelle('  THEVENIN   pierre ', [PIERRE, JB], [])).toBe(8);
    expect(compteSurDuLibelle('jb.pons@sansvisavis.com', [PIERRE, JB], [])).toBe(5);
    expect(compteSurDuLibelle('Jean-Baptiste PONS', [PIERRE, JB], [])).toBe(5);
  });
  it('🔴 jamais deviné : un prénom seul, un homonyme (doublon), un libellé inconnu → aucun compte', () => {
    expect(compteSurDuLibelle('PIERRE', [PIERRE, JB], [])).toBeNull();
    expect(compteSurDuLibelle('Pierre Thevenin', [PIERRE, DOUBLON], [])).toBeNull();
    expect(compteSurDuLibelle('MYLENE', [PIERRE, JB], [])).toBeNull();
    expect(compteSurDuLibelle('Jean Baptiste', [PIERRE, JB], [])).toBeNull();
  });
  it('un rattachement posé par Arno vaut, même pour un prénom seul', () => {
    expect(compteSurDuLibelle('PIERRE', [PIERRE, DOUBLON], [{ libelleNormalise: 'pierre', libelle: 'PIERRE', compteId: 8 }])).toBe(8);
  });
  it('correspondances : les seuls libellés sûrs, sans doublon', () => {
    expect(correspondancesSures(['Pierre Thevenin', 'PIERRE', 'Pierre Thevenin', 'jb.pons@sansvisavis.com'], [PIERRE, JB], []))
      .toEqual([{ libelle: 'Pierre Thevenin', compteId: 8 }, { libelle: 'jb.pons@sansvisavis.com', compteId: 5 }]);
  });
});

describe('après une saisie : la case vide reçoit le compte sûr, rien d’autre', () => {
  const faux = (libelles: string[]) => {
    const appels: { sql: string; p: unknown[] }[] = [];
    const q = vi.fn(async (sql: string, p: unknown[] = []) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), p });
      return sql.includes('SELECT DISTINCT') ? { rows: libelles.map((negociateur) => ({ negociateur })), rowCount: libelles.length } : { rows: [], rowCount: 1 };
    });
    return { q, appels };
  };
  it('ne vise que les cases VIDES, de la vente saisie, avec le compte sûr ; le prénom seul n’est pas posé', async () => {
    const { q, appels } = faux(['Pierre Thevenin', 'PIERRE']);
    expect(await relierComptesSurs(q as never, { venteIds: [42] })).toBe(1);
    const maj = appels.find((a) => a.sql.startsWith('UPDATE transaction_vente_ligne'))!;
    expect(maj.sql).toContain('l.compte_id IS NULL');
    expect(maj.sql).not.toMatch(/SET negociateur/);
    expect(maj.p[0]).toEqual([42]);
    expect(JSON.parse(String(maj.p[1]))).toEqual([{ libelle: 'Pierre Thevenin', compte_id: 8 }]);
  });
  it('les rétrocessions de même ; aucun libellé sûr : aucune écriture', async () => {
    const a = faux(['jb.pons@sansvisavis.com']);
    await relierComptesSurs(a.q as never, { retroIds: [7] });
    expect(a.appels.find((x) => x.sql.startsWith('UPDATE transaction_retrocession'))?.sql).toContain('t.compte_id IS NULL');
    const b = faux(['MYLENE']);
    expect(await relierComptesSurs(b.q as never, { venteIds: [1] })).toBe(0);
    expect(b.appels.some((x) => x.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('sans la migration 458 : rien, aucune requête', async () => {
    h.avec458 = false;
    const { q } = faux(['Pierre Thevenin']);
    expect(await relierComptesSurs(q as never, { venteIds: [1] })).toBe(0);
    expect(q).not.toHaveBeenCalled();
  });
});
