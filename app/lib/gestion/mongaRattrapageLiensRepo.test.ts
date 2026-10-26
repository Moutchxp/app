import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT MONGA-LIEN-PAR-LE-GESTE — le rattrapage des liens qu'un geste humain aurait dû poser. À blanc par défaut : il
 * n'écrit RIEN ; `appliquer` pose chaque lien (signé par l'auteur de l'affectation d'origine) puis classe les mails.
 * Le SQL a été éprouvé sur le cluster jetable ; ici, le comportement et les paramètres liés.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');
const appels: { sql: string; params: unknown[] }[] = [];
let candidates: unknown[] = [];

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = plat(sql);
  appels.push({ sql: s, params });
  if (s.includes('WITH aff AS')) return { rows: candidates };
  if (s.includes('FROM gestion_monga_etape')) return { rows: [{ reference: 'MNG-25126', n: 6 }] };
  if (s.includes('FROM gestion_monga_lien l')) return { rows: [] };
  if (s.includes('INSERT INTO gestion_monga_lien')) return { rows: [{ id: 1 }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a),
  withTransaction: (fn: (q: unknown) => unknown) => fn((...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a)),
}));
const classer = vi.fn<(...a: unknown[]) => Promise<{ classes: number; refuses: unknown[] }>>(async () => ({ classes: 3, refuses: [] }));
vi.mock('./mongaClassement', () => ({
  AUTEUR_MONGA: { id: null, libelle: 'classement Monga' },
  classerLesMailsDeLaReference: (...a: unknown[]) => classer(...a),
}));
const migration311 = vi.fn(async () => true);
vi.mock('./schema', () => ({ mongaDisponible: () => migration311() }));

import { passerRattrapageLiensMonga, planRattrapage, type LigneCandidate } from './mongaRattrapageLiensRepo';

const ligne = (p: Partial<LigneCandidate>): LigneCandidate => ({
  reference: 'MNG-25126', evenementId: 37, evenementReference: 'GES-2026-000011', objet: 'Problème de chauffage',
  auteurId: 4, auteurLibelle: 'a.dasilva', affecteLe: '2026-10-23 16:55:00', ...p,
});

beforeEach(() => {
  appels.length = 0; queryMock.mockClear(); classer.mockClear();
  migration311.mockResolvedValue(true);
  candidates = [{
    reference: 'MNG-25126', evenement_id: 37, evenement_reference: 'GES-2026-000011', objet: 'Problème de chauffage',
    affecte_par: 4, affecte_par_libelle: 'a.dasilva', affecte_le: '2026-10-23 16:55:00',
  }];
});

describe('le plan (pur)', () => {
  it('une référence, un événement → un lien, signé par l’auteur de la PREMIÈRE affectation, avec ses étapes vives', () => {
    const p = planRattrapage([
      ligne({ auteurLibelle: 'b.second', affecteLe: '2026-10-24 09:00:00' }),
      ligne({}),
    ], new Map([['MNG-25126', 6]]));
    expect(p.ambigues).toEqual([]);
    expect(p.liens).toEqual([expect.objectContaining({
      reference: 'MNG-25126', evenementId: 37, evenementReference: 'GES-2026-000011', auteurLibelle: 'a.dasilva', etapes: 6,
    })]);
  });

  it('une référence candidate pour PLUSIEURS événements → aucun lien, listée à part', () => {
    const p = planRattrapage([
      ligne({ reference: 'MNG-25300', evenementId: 40, evenementReference: 'GES-2026-000020', auteurLibelle: 'x.un' }),
      ligne({ reference: 'MNG-25300', evenementId: 41, evenementReference: 'GES-2026-000021', auteurLibelle: 'y.deux' }),
    ], new Map());
    expect(p.liens).toEqual([]);
    expect(p.ambigues).toEqual([{ reference: 'MNG-25300', evenements: [
      { evenementId: 40, evenementReference: 'GES-2026-000020', auteurLibelle: 'x.un' },
      { evenementId: 41, evenementReference: 'GES-2026-000021', auteurLibelle: 'y.deux' },
    ] }]);
  });

  it('une affectation non humaine ne fonde jamais un lien', () => {
    expect(planRattrapage([ligne({ auteurLibelle: 'automatique' }), ligne({ auteurLibelle: '  ' })], new Map()).liens).toEqual([]);
  });
});

describe('la passe', () => {
  it('À BLANC (par défaut) : seules des lectures, et le plan est rendu', async () => {
    const p = await passerRattrapageLiensMonga({ appliquer: false, jour: '26/10/2026' });
    expect(p.liens).toHaveLength(1);
    expect(p.liens[0]).toMatchObject({ reference: 'MNG-25126', etapes: 6, auteurLibelle: 'a.dasilva' });
    expect(appels.some((a) => /\b(INSERT|UPDATE|DELETE)\b/.test(a.sql))).toBe(false);
    expect(classer).not.toHaveBeenCalled();
  });

  it('les lectures excluent la relève : paramètres liés = format MNG et signature du classement Monga', async () => {
    await passerRattrapageLiensMonga({ appliquer: false, jour: '26/10/2026' });
    const lecture = appels.find((a) => a.sql.includes('WITH aff AS'));
    expect(lecture?.params).toEqual(['^MNG-[0-9]{4,6}$', 'classement Monga']);
    const etapes = appels.find((a) => a.sql.includes('FROM gestion_monga_etape'));
    expect(etapes?.sql).toContain("statut = 'vif'");
  });

  it('--appliquer : le lien est posé (auteur d’origine), journalisé « rattrapage du 26/10/2026 », puis les mails classés', async () => {
    const p = await passerRattrapageLiensMonga({ appliquer: true, jour: '26/10/2026' });
    const ins = appels.find((a) => a.sql.includes('INSERT INTO gestion_monga_lien'));
    expect(ins?.params).toEqual(['MNG-25126', 37, 4, 'a.dasilva']);
    const j = appels.find((a) => a.sql.includes('INSERT INTO gestion_journal'));
    expect(j?.params.some((x) => typeof x === 'string' && x.includes('rattrapage du 26/10/2026'))).toBe(true);
    expect(classer).toHaveBeenCalledWith({ reference: 'MNG-25126' });
    expect(p.poses).toEqual([{ reference: 'MNG-25126', issue: 'cree', mailsClasses: 3 }]);
  });

  it('ne touche JAMAIS une étape : aucune écriture sur gestion_monga_etape, même en --appliquer', async () => {
    await passerRattrapageLiensMonga({ appliquer: true, jour: '26/10/2026' });
    expect(appels.some((a) => /(INSERT INTO|UPDATE) gestion_monga_etape/.test(a.sql))).toBe(false);
  });

  it('migration 311 absente → rien n’est lu ni écrit', async () => {
    migration311.mockResolvedValue(false);
    const p = await passerRattrapageLiensMonga({ appliquer: true, jour: '26/10/2026' });
    expect(p.disponible).toBe(false);
    expect(appels).toHaveLength(0);
  });
});
