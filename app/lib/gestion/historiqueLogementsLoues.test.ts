import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-ECHANGES-ANCIEN-LOCATAIRE (Arno, 14/10/2026) — LES MAILS DES LOGEMENTS QU'IL A LOUÉS, AU SERVEUR ════
 *
 * Ce que ces épreuves tiennent :
 *   ① `loues=1&tranches=1` (« Pendant sa location ») : l'axe « occupation » seul — chaque logement sur SA période —, et
 *      AUCUN mail pris par ses adresses (règle « mails du logement ») ;
 *   ② `loues=1` sans `tranches` (« Tous les échanges ») : toute la vie de ces logements (axe « lots »), sans ses adresses ;
 *   ③ sans `loues` : la sélection d'un locataire exactement comme avant (ses tranches + ses adresses) ;
 *   ④ une date inconnue reste `null` dans les paramètres liés : pas de borne de ce côté, jamais une date devinée.
 * Base simulée : rien n'est lu ni écrit pour de vrai. Assertions sur les PARAMÈTRES LIÉS et des fragments (AGENTS.md).
 */
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  deplacementsDeMailsDisponibles: () => Promise.resolve(false),
  horsGestionDisponible: () => Promise.resolve(false),
  rattachementsDisponibles: () => Promise.resolve(true),
  nomUsageDisponible: () => Promise.resolve(false),
  depotsDriveDisponibles: () => Promise.resolve(false),
  pieceIntegreeDisponible: () => Promise.resolve(false),
}));
vi.mock('./coordonneeVivante', () => ({ conditionCoordonneeVivante: () => Promise.resolve('') }));

import { etendreCible, porteursDePieces } from './historiqueRepo';
import { FILTRES_VIDES, lireFiltres, ecrireFiltres, type FiltresHistorique } from './historique';

const OCCUPATIONS = [
  { cle: '322', adresse: '1 rue B', cp: '92400', commune: 'Courbevoie', nature: null, type_bien: null, prop: null, depuis: '2025-11-19', jusqua: '2026-01-23' },
  { cle: '239', adresse: '2 rue A', cp: '92800', commune: 'Puteaux', nature: null, type_bien: null, prop: null, depuis: null, jusqua: '2026-01-23' },
];
beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM gestion_annuaire_locataire')) return { rows: [{ id: '44', nom: 'DUPONT Jean', absent: false }] };
    if (sql.includes('FROM gestion_annuaire_occupation')) return { rows: OCCUPATIONS };
    if (sql.includes('FROM gestion_annuaire_contact')) return { rows: [{ valeur: 'jean@exemple.test' }] };
    return { rows: [] };
  });
});
const filtres = (o: Partial<FiltresHistorique>): FiltresHistorique => ({ ...FILTRES_VIDES, ...o });
const etendre = async (o: Partial<FiltresHistorique>) => {
  const r = await etendreCible({ sorte: 'locataire', cle: 'L44', id: null }, filtres(o));
  if (r.etat !== 'ok') throw new Error(r.etat);
  return r.data;
};

describe('etendreCible — ancien locataire, les logements qu’il a loués', () => {
  it('① « Pendant sa location » : ses tranches, AUCUNE de ses adresses, aucun lot entier', async () => {
    const c = await etendre({ logementsLoues: true, tranches: true });
    expect(c.lots).toEqual([]);
    expect(c.adresses).toEqual([]);
    expect(c.occupations.map((o) => [o.cle, o.depuis, o.jusqua])).toEqual([['322', '2025-11-19', '2026-01-23'], ['239', null, '2026-01-23']]);
  });
  it('② « Tous les échanges » : toute la vie de TOUS ses logements, sans ses adresses', async () => {
    const c = await etendre({ logementsLoues: true });
    expect(c.lots).toEqual(['322', '239']);
    expect(c.adresses).toEqual([]);
  });
  it('③ sans `loues` : la sélection d’un locataire d’avant (tranches + adresses), inchangée', async () => {
    const c = await etendre({});
    expect(c.lots).toEqual([]);
    expect(c.adresses).toEqual(['jean@exemple.test']);
  });
  it('les échanges l’emportent : `echanges=1` garde sa sélection par adresses', async () => {
    const c = await etendre({ echanges: true, logementsLoues: true });
    expect(c.echanges).toBe(true);
    expect(c.adresses).toEqual(['jean@exemple.test']);
  });
});

describe('paramètres liés à la requête (pièces, même chemin que la liste et la frise)', () => {
  it('④ « Pendant sa location » : clés, bornes (null = pas de borne), adresses VIDES ; l’axe occupation est nommé', async () => {
    const c = await etendre({ logementsLoues: true, tranches: true });
    queryMock.mockClear();
    await porteursDePieces(c, filtres({ logementsLoues: true, tranches: true }));
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params.slice(0, 8)).toEqual([[], [], [], ['322', '239'], ['2025-11-19', null], ['2026-01-23', '2026-01-23'], [], 'L44']);
    const plat = sql.replace(/\s+/g, ' ');
    expect(plat).toContain('JOIN unnest($4::text[], $5::date[], $6::date[]) AS per(cle, d1, d2)');
    expect(plat).toContain('per.d1 IS NULL OR');
  });
  it('« Tous les échanges » : les lots entiers en $1', async () => {
    const c = await etendre({ logementsLoues: true });
    queryMock.mockClear();
    await porteursDePieces(c, filtres({ logementsLoues: true }));
    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toEqual(['322', '239']);
    expect(params[6]).toEqual([]);
  });
});

describe('filtres d’adresse : loues / tranches', () => {
  it('lus strictement, réécrits seulement quand ils sont allumés ; absents par défaut', () => {
    expect(lireFiltres(new URLSearchParams('loues=1&tranches=1'))).toMatchObject({ logementsLoues: true, tranches: true });
    expect(lireFiltres(new URLSearchParams('loues=oui&tranches=0'))).toMatchObject({ logementsLoues: false, tranches: false });
    expect(ecrireFiltres(filtres({ logementsLoues: true, tranches: true }))).toBe('?loues=1&tranches=1');
    expect(ecrireFiltres(FILTRES_VIDES)).toBe('');
    // Le paramètre `logements` (logements d'un PROPRIÉTAIRE) garde son sens.
    expect(lireFiltres(new URLSearchParams('logements=0')).avecLogements).toBe(false);
  });
});
