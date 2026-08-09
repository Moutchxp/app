import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BadgeRattachement, CompteursRattachement, LIBELLE_RATTACHEMENT } from './PermisRattachementRendu';
import type { EtatRattachement } from '../../../../lib/sitadel/priorite';

/**
 * D1 — rendu PUR de l'état de rattachement (renderToStaticMarkup, aucun DOM). Couvre : les 3 libellés validés ; la référence
 * + le statut de la demande active pour « rattaché » ; les compteurs des 3 états avec la mention « sur l'ensemble filtré,
 * pas la page » ; l'isolement d'une catégorie par le filtre (aria-pressed).
 */
const badge = (etat?: EtatRattachement, reference?: string | null, statut?: string | null) =>
  renderToStaticMarkup(createElement(BadgeRattachement, { etat, reference, statut }));

describe('D1 — BadgeRattachement : les trois états, libellés validés', () => {
  it('libellés exacts', () => {
    expect(LIBELLE_RATTACHEMENT).toEqual({ rattache: 'rattaché', abandonne: 'demande abandonnée', jamais: 'jamais demandé' });
  });
  it('« jamais demandé » : libellé seul, pas de référence', () => {
    const h = badge('jamais');
    expect(h).toContain('jamais demandé');
    expect(h).not.toContain('SVAV-DEM');
  });
  it('« demande abandonnée » : libellé seul, pas de référence (le dossier est de nouveau proposable)', () => {
    const h = badge('abandonne', null, null);
    expect(h).toContain('demande abandonnée');
    expect(h).not.toContain('SVAV-DEM');
  });
  it('« rattaché » : libellé + RÉFÉRENCE + STATUT de la demande active', () => {
    const h = badge('rattache', 'SVAV-DEM-2026-000042', 'brouillon');
    expect(h).toContain('rattaché');
    expect(h).toContain('SVAV-DEM-2026-000042');
    expect(h).toContain('brouillon');
  });
  it('état absent (chemin sans rattachement) → rien', () => {
    expect(badge(undefined)).toBe('');
  });
});

describe('D1 — CompteursRattachement : décomptes sur l’ensemble filtré + filtre', () => {
  const comptes = [{ etat: 'rattache' as const, n: 40 }, { etat: 'abandonne' as const, n: 15 }, { etat: 'jamais' as const, n: 100 }];
  it('affiche les trois états avec leur décompte + « Tous » (total)', () => {
    const h = renderToStaticMarkup(createElement(CompteursRattachement, { comptes, actif: null }));
    expect(h).toContain('rattaché (40)');
    expect(h).toContain('demande abandonnée (15)');
    expect(h).toContain('jamais demandé (100)');
    expect(h).toContain('Tous (155)'); // total = somme des trois
  });
  it('un état absent des comptes est affiché à 0 (jamais un compteur muet)', () => {
    const h = renderToStaticMarkup(createElement(CompteursRattachement, { comptes: [{ etat: 'rattache' as const, n: 3 }], actif: null }));
    expect(h).toContain('rattaché (3)');
    expect(h).toContain('demande abandonnée (0)');
    expect(h).toContain('jamais demandé (0)');
  });
  it('dit EXPLICITEMENT que les décomptes portent sur l’ensemble filtré, pas la page', () => {
    const h = renderToStaticMarkup(createElement(CompteursRattachement, { comptes, actif: null }));
    expect(h).toContain('pas seulement sur la page affichée');
  });
  it('le filtre isole une catégorie : la chip active porte aria-pressed', () => {
    const h = renderToStaticMarkup(createElement(CompteursRattachement, { comptes, actif: 'rattache' }));
    expect(h).toMatch(/aria-pressed="true"[^>]*>rattaché/); // « rattaché » est le filtre actif
    // « Tous » n'est PAS actif quand une catégorie est sélectionnée
    expect(h).toMatch(/aria-pressed="false"[^>]*>Tous/);
  });
});
