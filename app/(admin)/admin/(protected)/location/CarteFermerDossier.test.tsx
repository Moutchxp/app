// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { contributionsAnnees, cumulApporteur, type ActiviteCalcul } from '../../../../lib/location/suivi/tableauBord';
import { detailDossier } from '../../../../lib/location/suivi/detailDossier';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/outils' }));
const { OuvrirAnnuaireApporteurs } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — (1) un ONE SHOT : le montant de son année = EXACTEMENT son dû affiché (plus d'écart d'un centime) ; (2) « Fermer ✕ »
 * sur la carte ouverte : ferme le panneau, met l'adresse à jour, laisse la modale ouverte ; (3) aucune commande technique (`npm …`)
 * visible dans l'interface Location. Données fictives, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-10-24';
const A: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2020-01-01', taux: 0.5, mode: 'one_shot', tauxGestion: 0, ordre: 1 }], collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }], remunerations: [] };
const dossier = (id: number, ca: number): ActiviteCalcul => ({ id, type: 'bail', dateSignature: '2024-0' + id + '-10', libelleProprietaire: 'P', libelleLocataire: 'L',
  honoProprietaireHt: ca, honoLocataireHt: 0, primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 4, apporteurNom: null, apporteurTaux: null,
  commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'X', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur' });

describe('🔴 (1) un one shot : son année porte EXACTEMENT son dû affiché', () => {
  it('517,49 € à 50 % = 258,745 € : affiché 258,75 €, compté 258,75 € dans 2024 (pas 258,76 €) ; l’année = la somme des dus affichés', () => {
    const ds = [dossier(1, 517.49), dossier(2, 333.33), dossier(3, 101.01)];
    for (const d of ds) {
      const affiche = Math.round(detailDossier(d, [A], JOUR)!.apporteur.total * 100);
      expect(contributionsAnnees(d, [A], JOUR)).toEqual(new Map([[2024, affiche]]));
    }
    expect(Math.round(detailDossier(ds[0], [A], JOUR)!.apporteur.total * 100)).toBe(25875);
    const y = cumulApporteur(ds, [A], 4, JOUR).parAnnee.find((x) => x.annee === 2024)!;
    expect(Math.round(y.commission * 100)).toBe(25875 + 16667 + 5051);
  });
});

const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.history.replaceState(null, '', '/admin/location/outils');
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {} });
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: JOUR, dossiers: [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 0, ca: 0, commission: 0 }, parAnnee: [], parMois: [] } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true,
      negociateurs: [], regles: [], retrocessions: [], collegues: [{ id: 5, libelle: 'Paul Collègue' }], apporteurs: [A] } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: JOUR, manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };

describe('🔴 (2) « Fermer ✕ » sur la carte ouverte', () => {
  it('absent sans panneau ; présent avec un panneau ; ferme le panneau (adresse mise à jour), la modale reste ouverte', async () => {
    await act(async () => { root.render(createElement(OuvrirAnnuaireApporteurs, { rendu: (ouvrir: () => void) => createElement('button', { type: 'button', onClick: ouvrir, 'data-brique': 'annuaire' }, 'Annuaire') })); });
    await clic(container.querySelector('[data-brique="annuaire"]')!);
    expect(container.querySelector('[data-fermer-panneau]')).toBeNull();
    for (const p of ['fiche', 'rattachement', 'taux', 'cumul']) {
      await clic(container.querySelector(`[data-apporteur-bouton="4"][data-panneau-bouton="${p}"]`)!);
      expect(window.location.search).toBe(`?parametres=apporteurs&apporteur=4&panneau=${p}`);
      const fermer = container.querySelector('[data-apporteur="4"] .plo-carte-tete [data-fermer-panneau="4"]')!;
      expect(fermer.textContent).toBe('Fermer ✕');
      await clic(fermer);
      expect(container.querySelector('[data-apporteur="4"] [data-panneau]')).toBeNull();
      expect(container.querySelector('[data-fermer-panneau]')).toBeNull();
      expect(window.location.search).toBe('?parametres=apporteurs');
      expect(container.querySelector('[data-modale-parametres]')).not.toBeNull();
    }
  });
  it('la Fiche : « Apporteur externe (sans accès à l’interface) » et le bouton « Passer en interne » juste à côté', async () => {
    await act(async () => { root.render(createElement(OuvrirAnnuaireApporteurs, { rendu: (ouvrir: () => void) => createElement('button', { type: 'button', onClick: ouvrir, 'data-brique': 'annuaire' }, 'Annuaire') })); });
    await clic(container.querySelector('[data-brique="annuaire"]')!);
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="fiche"]')!);
    const ligne = container.querySelector('[data-panneau="fiche"] [data-fiche-sorte-ligne]')!;
    expect(ligne.querySelector('[data-fiche-sorte]')?.textContent).toBe('Apporteur externe (sans accès à l’interface)');
    expect(ligne.querySelector('[data-passer-interne="4"]')?.textContent).toBe('Passer en interne');
    expect(container.querySelectorAll('[data-passer-interne]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/npm/);
  });
});

describe('🔴 (3) aucune commande technique visible dans l’interface Location', () => {
  it('aucun « npm … » dans le texte des écrans de la tuile (hors commentaires)', () => {
    const dossier = __dirname;
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.tsx') && !x.includes('.test.'))) {
      const sansCommentaires = readFileSync(join(dossier, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(sansCommentaires, f).not.toMatch(/npm (run|exec)|npx /);
    }
  });
});
