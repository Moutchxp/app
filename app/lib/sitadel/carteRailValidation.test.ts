import { describe, it, expect, vi } from 'vitest';
import {
  origineRail, diffAffectation, aDesChangements, libelleBoutonCarte, appliquerAffectations, type DepsAffectation,
} from './carteRailValidation';

const COORD = { email: 'm@x.fr', urlFormulaire: '', adressePostale: '' };

describe('origineRail — communes actuellement sur le rail (dérivé du canal)', () => {
  const communes = [
    { code: 'A', canal: 'email' }, { code: 'B', canal: 'formulaire' },
    { code: 'C', canal: 'inconnu' }, { code: 'D', canal: null }, { code: 'E', canal: 'email' },
  ];
  it('rail email → seulement les canaux email', () => {
    expect([...origineRail(communes, 'email')].sort()).toEqual(['A', 'E']);
  });
  it('rail formulaire → seulement les canaux formulaire', () => {
    expect([...origineRail(communes, 'formulaire')]).toEqual(['B']);
  });
});

describe('diffAffectation + aDesChangements + libelleBoutonCarte', () => {
  it('adds = sélectionnées hors origine ; removes = origine désélectionnées', () => {
    const d = diffAffectation(new Set(['a', 'b']), new Set(['b', 'c']));
    expect(d.adds).toEqual(['a']); expect(d.removes).toEqual(['c']);
  });
  it('aDesChangements : faux si sélection == origine, vrai sinon', () => {
    expect(aDesChangements(new Set(['b']), new Set(['b']))).toBe(false);
    expect(aDesChangements(new Set(['a', 'b']), new Set(['b']))).toBe(true); // add
    expect(aDesChangements(new Set(['b']), new Set(['a', 'b']))).toBe(true); // remove
  });
  it('cycle du bouton à 3 temps', () => {
    expect(libelleBoutonCarte(false, false)).toBe('Modifier la sélection');
    expect(libelleBoutonCarte(false, true)).toBe('Modifier la sélection'); // repos, quel que soit le changement
    expect(libelleBoutonCarte(true, false)).toBe('Garder la sélection');
    expect(libelleBoutonCarte(true, true)).toBe('Valider ma sélection');
  });
});

function deps(over: Partial<DepsAffectation> = {}): DepsAffectation & { apercuFn: ReturnType<typeof vi.fn>; annulerFn: ReturnType<typeof vi.fn>; patchFn: ReturnType<typeof vi.fn> } {
  const apercuFn = vi.fn(async (code: string) => ({ raisonRefus: null as string | null, ids: [] as number[], coordonnees: COORD, communeNom: `Nom-${code}` }));
  const annulerFn = vi.fn(async () => true);
  const patchFn = vi.fn(async () => true);
  return { apercu: over.apercu ?? apercuFn, annulerLot: over.annulerLot ?? annulerFn, patchContact: over.patchContact ?? patchFn, apercuFn, annulerFn, patchFn };
}

describe('appliquerAffectations — RÉUTILISE le geste existant, refus PARTIEL, retrait = hors process', () => {
  it('ADD qui passe → PATCH canal=rail (affectation ; exclusivité structurelle)', async () => {
    const d = deps();
    const r = await appliquerAffectations(d, { adds: ['A'], removes: [], rail: 'email', motif: 'm' });
    expect(r.appliquees).toEqual(['A']); expect(r.refusees).toEqual([]);
    expect(d.patchFn).toHaveBeenCalledWith('A', 'email', COORD, 'm');
  });

  it('ADD refusé par la règle (coordonnée manquante) → PARTIEL : listé, PATCH jamais appelé', async () => {
    const apercu = vi.fn(async (code: string) => ({ raisonRefus: 'e-mail invalide — renseignez la coordonnée', ids: [], coordonnees: COORD, communeNom: `Nom-${code}` }));
    const d = deps({ apercu });
    const r = await appliquerAffectations(d, { adds: ['A'], removes: [], rail: 'email', motif: 'm' });
    expect(r.appliquees).toEqual([]);
    expect(r.refusees).toEqual([{ code: 'A', nom: 'Nom-A', raison: 'e-mail invalide — renseignez la coordonnée' }]);
    expect(d.patchFn).not.toHaveBeenCalled();
  });

  it('ADD avec demandes non envoyées → annuler-lot AVANT le PATCH', async () => {
    const apercu = vi.fn(async () => ({ raisonRefus: null, ids: [11, 12], coordonnees: COORD, communeNom: 'X' }));
    const d = deps({ apercu });
    await appliquerAffectations(d, { adds: ['A'], removes: [], rail: 'email', motif: 'm' });
    expect(d.annulerFn).toHaveBeenCalledWith([11, 12]);
    expect(d.patchFn).toHaveBeenCalledWith('A', 'email', COORD, 'm');
  });

  it('REMOVE → PATCH canal="inconnu" (désaffecter = hors process) ; le refus « déjà sur ce rail » est ignoré', async () => {
    const apercu = vi.fn(async (code: string) => ({ raisonRefus: 'la commune est déjà sur ce rail', ids: [], coordonnees: COORD, communeNom: `Nom-${code}` }));
    const d = deps({ apercu });
    const r = await appliquerAffectations(d, { adds: [], removes: ['B'], rail: 'email', motif: 'm' });
    expect(r.appliquees).toEqual(['B']); expect(r.refusees).toEqual([]);
    expect(d.patchFn).toHaveBeenCalledWith('B', 'inconnu', COORD, 'm'); // désaffecté, pas laissé sur le rail
  });

  it('MIXTE : un add passe, un add refusé → PARTIEL (l\'un n\'empêche pas l\'autre)', async () => {
    const apercu = vi.fn(async (code: string) => code === 'BAD'
      ? { raisonRefus: 'coordonnée manquante', ids: [], coordonnees: COORD, communeNom: 'Bad' }
      : { raisonRefus: null, ids: [], coordonnees: COORD, communeNom: 'Ok' });
    const d = deps({ apercu });
    const r = await appliquerAffectations(d, { adds: ['OK', 'BAD'], removes: [], rail: 'email', motif: 'm' });
    expect(r.appliquees).toEqual(['OK']);
    expect(r.refusees.map((x) => x.code)).toEqual(['BAD']);
  });

  it('échec d\'annulation → refusée, PATCH non appelé', async () => {
    const apercu = vi.fn(async () => ({ raisonRefus: null, ids: [9], coordonnees: COORD, communeNom: 'X' }));
    const d = deps({ apercu, annulerLot: vi.fn(async () => false) });
    const r = await appliquerAffectations(d, { adds: ['A'], removes: [], rail: 'email', motif: 'm' });
    expect(r.appliquees).toEqual([]);
    expect(r.refusees[0].raison).toContain('annulation');
    expect(d.patchFn).not.toHaveBeenCalled();
  });
});
