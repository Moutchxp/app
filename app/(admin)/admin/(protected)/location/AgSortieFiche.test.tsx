// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (23/11/2026) — « Valider la sortie », bien sans copropriété : « Créer une copropriété » = EXACTEMENT le parcours de la Gestion (la fiche
 * Copropriété elle-même, pour l'adresse du bien). La fiche est observée (son comportement a ses propres épreuves : adresse officielle, parcelle,
 * adresses prises, anti-doublon, « Rattacher à … ? », « Non » mémorisé).
 */
const fiche = vi.fn();
vi.mock('../gestion/FicheCopropriete', () => ({
  FicheCopropriete: (p: { lotId?: number | null; immeuble?: string | null; onFerme: () => void }) => {
    fiche(p); return createElement('button', { 'data-stub-fiche': String(p.lotId), onClick: p.onFerme }, 'Fermer la fiche');
  },
}));
const arrete = vi.fn();
vi.mock('../gestion/ArreteComptes', () => ({ ArreteComptes: (p: Record<string, unknown>) => { arrete(p); return null; } }));
const { AgSortie, saisieAgInitiale, luAgPropre, corpsAg, BANDEAU_DERNIERE_AGO_MANQUANTE, prochaineCalculee, ARRETE_SANS_COPROPRIETE } = await import('./AgSortie');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); fiche.mockClear(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const LU = luAgPropre({ disponible: true, lotId: 7, copropriete: null, immeuble: '4 rue Fictive', coproprieteSaisie: true, suggestions: [],
  proposition: { derniere: null, prochaine: null }, adresse: '4 rue Fictive', moi: 'arno@exemple.fr' });

describe('« Créer une copropriété » depuis la fenêtre de sortie', () => {
  it('ouvre LA fiche Copropriété pour le bien (lotId), sans nom tapé ; à sa fermeture, la fenêtre se RELIT', async () => {
    const relire = vi.fn();
    const s = saisieAgInitiale(LU);
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s, onChange: () => {}, desactive: false, onRelire: relire })); });
    expect(container.querySelector('input[data-ag-copro-nom]')).toBeNull();
    await act(async () => { (container.querySelector('button[data-ag-copro="creer"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenCalledWith(expect.objectContaining({ lotId: 7 }));
    await act(async () => { (container.querySelector('[data-stub-fiche="7"]') as HTMLButtonElement).click(); });
    expect(relire).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-stub-fiche]')).toBeNull();
  });
  it('le corps envoyé ne porte JAMAIS de création par nom (seulement « rattacher » ou rien)', () => {
    const s = saisieAgInitiale(LU);
    expect(corpsAg({ ...s, copro: 'aucune' }, LU)).not.toHaveProperty('coproprieteChoix.creer');
    expect(corpsAg({ ...s, copro: 'rattacher', rattacher: 12 }, LU)).toMatchObject({ coproprieteChoix: { rattacher: 12 } });
  });
  it('le serveur ne crée plus de copropriété depuis la sortie : `creerCoproprietePourLot` n’y est plus appelé (gardé dans agCoproprieteRepo)', () => {
    expect(readFileSync('app/lib/location/validationSortieRepo.ts', 'utf8')).not.toContain('creerCoproprietePourLot');
    expect(readFileSync('app/lib/location/agCoproprieteRepo.ts', 'utf8')).toContain('export async function creerCoproprietePourLot');
  });

});

describe('🔴 Arno (23/11/2026) — copropriété rattachée : ce qui manque est MIS EN AVANT dans la fenêtre de sortie', () => {
  it('l’arrêté des comptes : le MÊME composant que la fiche Copropriété, pour la copropriété du bien, avec son bandeau', async () => {
    const lu = { ...LU, copropriete: { id: 310, libelle: 'Copro Essai' } };
    await act(async () => { root.render(createElement(AgSortie, { lu, s: saisieAgInitiale(lu), onChange: () => {}, desactive: false })); });
    expect(arrete).toHaveBeenCalledWith(expect.objectContaining({ coproprieteId: 310, alerteSiManquante: true }));
  });
  it('la dernière AGO manquante : bandeau ; connue : pas de bandeau', async () => {
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-bandeau-derniere]')?.textContent).toBe(`⚠ ${BANDEAU_DERNIERE_AGO_MANQUANTE}`);
    const connu = luAgPropre({ ...LU, proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: null } });
    await act(async () => { root.render(createElement(AgSortie, { lu: connu, s: saisieAgInitiale(connu), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-bandeau-derniere]')).toBeNull();
  });
});

describe('🔴 Arno (23/11/2026) — « Prochaine AGO » PRÉREMPLIE par le calcul du suivi des 20 % (b0453dc2), option A', () => {
  const JOUR = '2026-11-23';
  it('projection après l’arrêté qui clôt l’exercice de la sortie, jamais avant la validation ; arrêté inconnu : après la validation', () => {
    expect(prochaineCalculee({ officielles: ['2026-03-25'], derniere: '', dateSortie: '2026-11-15', arrete: { jour: 31, mois: 12 }, jour: JOUR }))
      .toEqual({ date: '2027-03-25', statut: 'projetee' });
    expect(prochaineCalculee({ officielles: ['2026-03-25'], derniere: '', dateSortie: '2026-11-15', arrete: { jour: 30, mois: 6 }, jour: JOUR }))
      .toEqual({ date: '2028-03-25', statut: 'projetee' });
    expect(prochaineCalculee({ officielles: ['2026-09-22'], derniere: '', dateSortie: '', arrete: null, jour: JOUR }))
      .toEqual({ date: '2027-09-22', statut: 'projetee' });
    expect(prochaineCalculee({ officielles: [], derniere: '', dateSortie: '', arrete: null, jour: JOUR })).toBeNull();
    // la dernière AGO SAISIE dans la fenêtre sert aussi de base
    expect(prochaineCalculee({ officielles: [], derniere: '2026-06-10', dateSortie: '2026-11-15', arrete: { jour: 31, mois: 12 }, jour: JOUR }))
      .toEqual({ date: '2027-06-10', statut: 'projetee' });
  });
  it('à l’ouverture : la prochaine AGO préremplie par le calcul (statut à choisir, comme aujourd’hui) ; une officielle à venir reste prioritaire', () => {
    const lu = luAgPropre({ ...LU, officielles: ['2026-03-25'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: { date: '2027-03-25', statut: null, mention: 'x', par: null, le: null } } });
    expect(saisieAgInitiale(lu, JOUR)).toMatchObject({ derniere: '2026-03-25', prochaine: '2027-03-25', statut: null, alerte: null });
    const off = luAgPropre({ ...LU, officielles: ['2026-03-25', '2027-02-14'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: 'y' }, prochaine: { date: '2027-02-14', statut: 'officielle', mention: null, par: 'z', le: 'w' } } });
    expect(saisieAgInitiale(off, JOUR)).toMatchObject({ prochaine: '2027-02-14', statut: 'officielle' });
  });
  it('option A : dernière AGO de plus d’un an → la décision du 17/11 (champ vide, alerte) ; rien n’est prérempli tant qu’elle n’est pas confirmée', () => {
    const vieille = luAgPropre({ ...LU, officielles: ['2015-03-12'], proposition: { derniere: { date: '2015-03-12', par: 'x', le: 'y' }, prochaine: null, projectionPerimee: '2016-03-12' } });
    expect(saisieAgInitiale(vieille, JOUR)).toMatchObject({ prochaine: '', alerte: { date: '2016-03-12', sorte: 'calculee' } });
  });
  it('option A : la dernière AGO ancienne CONFIRMÉE comme référence → la prochaine AGO suit alors le calcul (la sortie se débloque)', async () => {
    const vieille = luAgPropre({ ...LU, officielles: ['2015-03-12'], proposition: { derniere: { date: '2015-03-12', par: 'x', le: 'y' }, prochaine: null, projectionPerimee: '2016-03-12' } });
    const change = vi.fn();
    const s0 = { ...saisieAgInitiale(vieille, JOUR), alerte: null };
    await act(async () => { root.render(createElement(AgSortie, { lu: vieille, s: s0, onChange: change, desactive: false })); });
    expect(change).not.toHaveBeenCalled(); // tant qu'elle n'est pas confirmée : rien n'est prérempli
    await act(async () => { root.render(createElement(AgSortie, { lu: vieille, s: { ...s0, derniereConfirmee: true }, onChange: change, desactive: false })); });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ prochaine: expect.stringMatching(/^20(2[7-9])-03-12$/) }));
  });
});

describe('🔴 Arno (23/11/2026) — « le bouton "Créer une copropriété" doit prendre toute la largeur de la colonne »', () => {
  it('la règle du bouton : étiré sur toute la largeur (aucune largeur automatique, aucun alignement à gauche)', async () => {
    const { CSS_AG_SORTIE } = await import('./AgSortie');
    const regle = /\.vag-creer-btn\{([^}]*)\}/.exec(CSS_AG_SORTIE)?.[1] ?? '';
    expect(regle).toContain('width:100%');
    expect(regle).toContain('align-self:stretch');
    expect(regle).not.toContain('width:auto');
    expect(regle).not.toContain('flex-start');
  });
});

describe('🔴 Arno (23/11/2026) — « Si une date de clôture des comptes n’a jamais été renseignée […] cela doit être possible directement dans cette modale »', () => {
  it('sans copropriété : « Rattachez ou créez la copropriété pour saisir sa date d’arrêté des comptes. » ; aucun champ d’arrêté', async () => {
    arrete.mockClear();
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-arrete-sans-copro]')?.textContent).toBe(ARRETE_SANS_COPROPRIETE);
    expect(ARRETE_SANS_COPROPRIETE).toBe('Rattachez ou créez la copropriété pour saisir sa date d’arrêté des comptes.');
    expect(arrete).not.toHaveBeenCalled();
  });
  it('juste après « Créer une copropriété » (fiche validée, fenêtre relue) : le champ d’arrêté de LA nouvelle copropriété, avec son bandeau', async () => {
    arrete.mockClear();
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    const relue = luAgPropre({ ...LU, copropriete: { id: 313, libelle: '_TEST SORTIE CREATION COPRO' } });
    await act(async () => { root.render(createElement(AgSortie, { key: 'copro-313', lu: relue, s: saisieAgInitiale(relue), onChange: () => {}, desactive: false })); });
    expect(arrete).toHaveBeenCalledWith(expect.objectContaining({ coproprieteId: 313, alerteSiManquante: true }));
    expect(container.querySelector('[data-ag-arrete-sans-copro]')).toBeNull();
  });
  it('la fenêtre repart de la copropriété relue (clé par copropriété) : l’arrêté d’une copropriété rattachée n’est pas celui d’avant', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/location/ValidationSortieEdls.tsx', 'utf8')).toContain("<AgSortie key={`copro-${ag.copropriete?.id ?? 'aucune'}`}");
  });
});
