import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * « Nouveau locataire », étape 2 (Arno, 19/10/2026) : le bien se trouve par son ADRESSE OU par le NOM DU PROPRIÉTAIRE,
 * accents et casse ignorés ; chaque résultat dit l'adresse, le type, l'étage et le propriétaire. Base simulée.
 */
const appels: { sql: string; params: unknown[] }[] = [];
let lignes: Record<string, unknown>[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: sql.includes('FROM gestion_annuaire_lot lo') ? lignes : [] }; }),
  withTransaction: vi.fn(),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));

import { biensPourLocataire } from './portefeuilleRepo';

beforeEach(() => {
  appels.length = 0;
  lignes = [{ id: '7', adresse: '4 rue Fictive', commune: 'Puteaux', proprietaire: 'DUPONT Jean', loue: false, annexe: null,
    etage: '3', type_logement: null, nature: 'Appartement', type_bien: 'T3' }];
});

describe('biensPourLocataire — adresse OU nom du propriétaire', () => {
  it('« DÜpont » (accent, casse) : le mot normalisé est cherché dans l’adresse OU le nom normalisé du propriétaire, dans le portefeuille', async () => {
    const r = await biensPourLocataire('DÜpont');
    const q = appels.find((a) => a.sql.includes('FROM gestion_annuaire_lot lo'))!;
    expect(q.params).toEqual([['dupont']]);
    expect(q.sql).toContain("(coalesce(lo.adresse_normalisee, '') LIKE '%' || ($1::text[])[1] || '%' OR coalesce(pr.nom_normalise, '') LIKE '%' || ($1::text[])[1] || '%')");
    expect(q.sql).toContain('lo.gestion_fin IS NULL AND lo.absent_le IS NULL');
    expect(r).toEqual([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement T3 · 3e étage · propriétaire : DUPONT Jean · libre' }]);
  });

  it('plusieurs mots : chacun dans l’adresse OU le propriétaire (« Lilas Dupont »)', async () => {
    await biensPourLocataire('Lilas Dupont');
    const q = appels.find((a) => a.sql.includes('FROM gestion_annuaire_lot lo'))!;
    expect(q.params).toEqual([['lilas', 'dupont']]);
    expect(q.sql).toContain("pr.nom_normalise, '') LIKE '%' || ($1::text[])[2] || '%')");
  });
});
