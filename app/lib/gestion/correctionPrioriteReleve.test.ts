import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT FRISE-CORRECTION-MANUELLE — « LA CORRECTION HUMAINE FAIT FOI » face à la relève (Arno, 26/10/2026).
 *
 * La relève (`enregistrerEtapesDuMail`, `poserOuvertureDeRepli`) n'écrit que des INSERT ; ces épreuves tiennent les deux
 * gardes qui l'empêchent de recréer à côté ce qu'un humain a corrigé :
 *   · une étape transformée (type changé) n'est pas recréée sous son type d'origine (`auto_type`, migration 429) ;
 *   · une ouverture de repli retirée (ou écartée) ne renaît pas au mail suivant.
 * Comportement et paramètres liés ; le SQL est éprouvé sur le cluster jetable.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');
const appels: { sql: string; params: unknown[] }[] = [];
let ouvertureExistante = false;
const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = plat(sql);
  appels.push({ sql: s, params });
  if (s.includes('min(survenu_le)')) return { rows: [{ premier: '2026-10-23 16:39:00+02' }] };
  if (s.includes("type = 'ouverture' LIMIT 1")) return { rows: ouvertureExistante ? [{ '?column?': 1 }] : [], rowCount: ouvertureExistante ? 1 : 0 };
  if (s.includes('INSERT INTO gestion_monga_etape')) return { rows: [], rowCount: 0 };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a),
  withTransaction: (fn: (q: unknown) => unknown) => fn((...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a)),
}));
const migration429 = vi.fn(async () => true);
vi.mock('./schema', () => ({
  correctionEtapeDisponible: () => migration429(),
  evenementQualifieDisponible: async () => false,
}));

import { enregistrerEtapesDuMail, poserOuvertureDeRepli } from './mongaEtapeRepo';

const MAIL = {
  messageId: 900, messageCle: '<m@monga>', reference: 'MNG-25126', objet: 'MNG-25126 - Nouveau commentaire',
  texte: 'Un nouveau commentaire a été ajouté concernant la mission MNG-25126. Rendez-vous pris. Envoyé par Laura',
  recuLe: '2026-10-23T16:39:00Z',
};

beforeEach(() => { appels.length = 0; queryMock.mockClear(); migration429.mockResolvedValue(true); ouvertureExistante = false; });

describe('une étape transformée par un humain n’est jamais recréée par la relève', () => {
  it('avec la 429 : l’insertion exige qu’aucune étape de CE mail n’ait ce type pour ORIGINE (paramètres liés : type, mail, clé)', async () => {
    await enregistrerEtapesDuMail(MAIL);
    const ins = appels.filter((a) => a.sql.includes('INSERT INTO gestion_monga_etape'));
    expect(ins.length).toBeGreaterThan(0);
    for (const i of ins) {
      expect(i.sql).toContain('x.auto_type = $2');
      expect(i.sql).toContain('ON CONFLICT DO NOTHING');
      expect(i.params[0]).toBe('MNG-25126');
      expect(i.params[9]).toBe(900);
      expect(i.params[10]).toBe('<m@monga>');
    }
  });

  it('sans la 429 : la requête d’avant (aucune colonne de correction nommée)', async () => {
    migration429.mockResolvedValue(false);
    await enregistrerEtapesDuMail(MAIL);
    const ins = appels.filter((a) => a.sql.includes('INSERT INTO gestion_monga_etape'));
    expect(ins.length).toBeGreaterThan(0);
    expect(ins.every((i) => !i.sql.includes('auto_type'))).toBe(true);
  });
});

describe('une ouverture retirée de la frise ne renaît pas', () => {
  it('l’existence d’une ouverture se cherche vive OU retirée', async () => {
    ouvertureExistante = true;
    expect(await poserOuvertureDeRepli('MNG-25126')).toBe(false);
    const garde = appels.find((a) => a.sql.includes("type = 'ouverture' LIMIT 1"));
    expect(garde?.sql).not.toContain("statut = 'vif'");
    expect(appels.some((a) => a.sql.includes('INSERT INTO gestion_monga_etape'))).toBe(false);
  });
});
