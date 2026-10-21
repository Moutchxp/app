import { describe, expect, it, vi } from 'vitest';
import { estDoublon, phraseDoublon } from './doublonBien';
import { etageDeLaSaisie, pastillesBien } from '../gestion/pastillesBien';

vi.mock('server-only', () => ({}));

/** 🔴 Arno (21/10/2026) — l'anti-doublon de « Nouveau bien » : même propriétaire, même adresse normalisée, même étage, même porte. */
describe('estDoublon', () => {
  const B = { adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', etage: '4', porte: 'C43', categorie: 'logement' };
  it('même adresse (accents, casse, ponctuation), même étage, même porte → doublon', () => {
    expect(estDoublon(B, { adresse: '25 rue Henri-Barbusse', commune: 'Gennevilliers', etage: '4 ', porte: 'c43', categorie: 'logement' })).toBe(true);
    expect(estDoublon({ ...B, etage: 'RDC' }, { ...B, etage: '0' })).toBe(true);
  });
  it('autre étage, autre porte, autre adresse, ou catégorie différente (logement / cave) → pas un doublon', () => {
    expect(estDoublon(B, { ...B, etage: '5' })).toBe(false);
    expect(estDoublon(B, { ...B, porte: 'C44' })).toBe(false);
    expect(estDoublon(B, { ...B, adresse: '27 rue Royer Bendélé' })).toBe(false);
    expect(estDoublon(B, { ...B, categorie: 'cave' })).toBe(false);
  });
  it('un bien importé sans catégorie, sans étage ni porte, à la même adresse : doublon d’un nouveau bien sans étage ni porte', () => {
    expect(estDoublon({ ...B, etage: null, porte: null }, { adresse: '25 RUE HENRI BARBUSSE', commune: 'GENNEVILLIERS', etage: null, porte: null, categorie: null })).toBe(true);
    expect(estDoublon({ ...B, adresse: '' , commune: '' }, { ...B, adresse: '', commune: '' })).toBe(false);
  });
  it('la phrase dit l’adresse, l’étage et la porte', () => {
    expect(phraseDoublon({ ...B, id: 436 })).toBe('Un bien de ce propriétaire existe déjà au 25 Rue Henri Barbusse, GENNEVILLIERS (étage 4, porte C43).');
  });
});

describe('pastilles d’un bien créé dans la Location (sans nature ni type WIPPIMMO)', () => {
  it('le logement : « Logement · 1 pièce · 4e étage » ; sa cave : « Cave · Étage -2 » — plus jamais deux cartes muettes', () => {
    expect(pastillesBien({ nature: null, typeBien: null, categorie: 'logement', nombrePieces: 1, etageSaisi: '4' })).toEqual(['Logement', '1 pièce', '4e étage']);
    expect(pastillesBien({ nature: null, typeBien: null, categorie: 'cave', nombrePieces: 2, etageSaisi: '-2' })).toEqual(['Cave', 'Étage -2']);
  });
  it('un bien WIPPIMMO : rien ne change (la nature l’emporte, la catégorie n’est pas ajoutée)', () => {
    expect(pastillesBien({ nature: 'Appartement', typeBien: 'Type 2', categorie: 'logement', etageSaisi: '3' })).toEqual(['Appartement', '2 pièces', '3e étage']);
    expect(pastillesBien({ nature: 'Appartement', typeBien: 'Type 2' })).toEqual(['Appartement', '2 pièces']);
  });
  it('etageDeLaSaisie : nombres, RDC ; le reste → null', () => {
    expect([etageDeLaSaisie('4'), etageDeLaSaisie('-2'), etageDeLaSaisie('RDC'), etageDeLaSaisie('rez-de-chaussée'), etageDeLaSaisie('4e'), etageDeLaSaisie(null)])
      .toEqual([4, -2, 0, 0, null, null]);
  });
});

describe('bienExistantPareil (côté serveur, dans la transaction verrouillée)', () => {
  it('cherche parmi les biens EN PORTEFEUILLE des propriétaires (titulaire ou lien en cours) et rend le premier pareil', async () => {
    vi.doMock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
    const { bienExistantPareil } = await import('./creationBienRepo');
    const appels: { sql: string; params: unknown[] }[] = [];
    const q = vi.fn(async (sql: string, params: unknown[]) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), params });
      return { rows: [{ id: '315', adresse: '27 rue Royer Bendélé', commune: 'GENNEVILLIERS', etage: null, porte: null, categorie: null },
        { id: '436', adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', etage: '4', porte: 'C43', categorie: 'logement' }], rowCount: 2 };
    });
    const r = await bienExistantPareil(q as never, [49], { adresse: '25 rue Henri Barbusse', commune: 'Gennevilliers', etage: '4', porte: 'C43', categorie: 'logement' });
    expect(r).toMatchObject({ id: 436 });
    expect(appels[0].params).toEqual([[49]]);
    expect(appels[0].sql).toContain('lp.jusqu_a IS NULL');
    expect(appels[0].sql).toContain('lo.sorti_portefeuille_le IS NULL');
    expect(await bienExistantPareil(q as never, [49], { adresse: '25 rue Henri Barbusse', commune: 'Gennevilliers', etage: '5', porte: 'C51', categorie: 'logement' })).toBeNull();
  });
});
