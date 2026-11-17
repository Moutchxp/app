import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 4) — la fiche du bien écrit par le MÊME chemin serveur que la fiche Copropriété. Base simulée. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], ecrits: [] as Record<string, unknown>[], liens: [] as unknown[][], issue: { ok: true, change: true, id: 1 } as Record<string, unknown>,
  fiche: null as unknown }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT immeuble, adresse, code_postal AS cp, commune')) return { rows: [{ immeuble: 'Résidence Les Tilleuls', adresse: '12 rue des Lilas', cp: '75011', commune: 'Paris', batiment: null }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./coproprieteRepo', () => ({ ficheCopropriete: async () => h.fiche, etatPlace: () => null }));
vi.mock('./digicodesRepo', () => ({
  digicodesUnifiesDisponibles: async () => true, digicodesDesAdresses: async () => [],
  RefusDigicode: class RefusDigicode extends Error {},
  ecrireDigicode: async (_q: unknown, e: Record<string, unknown>) => { h.ecrits.push(e); return h.issue; },
  relierBienAuBatiment: async (_q: unknown, ...a: unknown[]) => { h.liens.push(a); return { ok: true, change: true }; },
}));
import { digicodesPourBien, ecrireDigicodesDuBien, realignerBatimentDuBien } from './digicodesBienRepo';
import { RefusDigicode } from './digicodesRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const FICHE = { cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', nomenclatureEffective: 'lettres',
  adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls' }], batimentsConnus: [{ cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'b', libelle: 'B', sorte: 'lettre' }] };
const RIEN = { batiment: null, batimentConfirme: false, commun: null, codeBatiment: null };
beforeEach(() => { h.sql = []; h.ecrits = []; h.liens = []; h.issue = { ok: true, change: true, id: 1 }; h.fiche = FICHE; });

describe('le bâtiment du bien, choisi au menu de la copropriété', () => {
  it('un bâtiment CONNU : le lien sûr et le texte « Bâtiment » ; aucun : le lien est retiré', async () => {
    expect(await ecrireDigicodesDuBien(q as never, 5, { ...RIEN, batiment: 'Bât. B' }, 'fiche_bien', AUTEUR)).toBeNull();
    expect(h.liens).toEqual([[5, { cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris' }, 'Bât. B', AUTEUR]]);
    expect(h.sql.find((x) => x.s.startsWith('UPDATE gestion_annuaire_lot SET batiment'))?.p).toEqual([5, 'B']);
    h.liens = [];
    await ecrireDigicodesDuBien(q as never, 5, RIEN, 'fiche_bien', AUTEUR);
    expect(h.liens[0][2]).toBeNull();
  });
  it('🔴 un NOUVEAU bâtiment qui ne suit pas la numérotation : refusé SANS la confirmation de l’écran (rien n’est écrit) ; confirmé : accepté', async () => {
    expect(await ecrireDigicodesDuBien(q as never, 5, { ...RIEN, batiment: '3' }, 'nouveau_bien', AUTEUR)).toContain('LETTRES');
    expect([h.liens, h.ecrits, h.sql.filter((x) => /^(INSERT|UPDATE)/.test(x.s))]).toEqual([[], [], []]);
    expect(await ecrireDigicodesDuBien(q as never, 5, { ...RIEN, batiment: '3', batimentConfirme: true }, 'nouveau_bien', AUTEUR)).toBeNull();
    expect(h.liens[0][2]).toBe('3');
  });
});

describe('les premières valeurs, par le chemin unique', () => {
  it('le code commun et celui du bâtiment, en « saisie », avec l’origine et le bien ; une place laissée vide n’écrit rien', async () => {
    await ecrireDigicodesDuBien(q as never, 5, { batiment: 'A', batimentConfirme: false, commun: { code: '', aucun: true }, codeBatiment: { code: 'A12', aucun: false } }, 'nouveau_bien', AUTEUR);
    expect(h.ecrits.map((e) => [e.adresseCle, e.batiment, e.valeur, e.nature, e.origine, e.lotId])).toEqual([
      ['residence les tilleuls', null, { digicode: false, code: null }, 'saisie', 'nouveau_bien', 5], ['residence les tilleuls', 'A', { digicode: true, code: 'A12' }, 'saisie', 'nouveau_bien', 5]]);
    h.ecrits = [];
    await ecrireDigicodesDuBien(q as never, 5, { ...RIEN, commun: { code: '', aucun: false } }, 'fiche_bien', AUTEUR);
    expect(h.ecrits).toEqual([]);
  });
  it('⚠️ un refus du chemin unique APRÈS le lien : LEVÉ (la transaction est annulée, le lien ne reste pas écrit)', async () => {
    h.issue = { ok: false, motif: 'Ce digicode est déjà connu …' };
    await expect(ecrireDigicodesDuBien(q as never, 5, { ...RIEN, commun: { code: '1', aucun: false } }, 'fiche_bien', AUTEUR)).rejects.toBeInstanceOf(RefusDigicode);
  });
});

describe('un « Bâtiment » RETAPÉ dans l’encart (sans menu)', () => {
  it('le même nom qu’au registre : relié ; un nom inconnu : le lien est retiré, rien n’est créé au registre', async () => {
    await realignerBatimentDuBien(q as never, 5, 'b', AUTEUR);
    await realignerBatimentDuBien(q as never, 5, 'Z', AUTEUR);
    expect(h.liens.map((l) => l[2])).toEqual(['b', null]);
  });
});

describe('🔴 (Arno, 17/11/2026 — l’écart du lot 4) un bien encore SANS adresse', () => {
  it('une place VIDE, jamais `null` (`null` = base sans la 478) : le composant unique s’affiche, les codes arrivent avec l’adresse', async () => {
    const d = await digicodesPourBien({ adresse: '', codePostal: null, commune: null });
    expect(d).toMatchObject({ adresseCle: '', connus: [], nomenclature: null, adresse: { cle: '', voie: '', batiments: [] } });
    expect(h.sql).toEqual([]); // rien n'est lu en base pour une place vide
  });
});
