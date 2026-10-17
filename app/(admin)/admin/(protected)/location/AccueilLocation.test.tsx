// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilLocation } from './AccueilLocation';
import { FicheBienLocation } from './FicheBienLocation';

/**
 * 🔴🔴 CORRECTIF DU 17/10/2026 — « Cannot read properties of undefined (reading 'map') » sur /admin/location avec les
 * vraies données de recette. Deux causes, deux épreuves :
 *   ① en changeant d'onglet, l'écran rendait une fois les lignes de l'onglet PRÉCÉDENT (propriétaires lus comme des
 *      biens, sans `annexes`) — la réponse est désormais liée à SA demande ;
 *   ② un bien sans annexe (champ absent ou vide) doit s'afficher, sur l'accueil comme sur sa fiche.
 * Le VRAI composant, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bien = (id: number, avecAnnexes: boolean) => ({
  id, numero: String(id), adresse: `${id} rue de l’Essai`, codePostal: '75011', commune: 'PARIS', nature: 'Appartement', typeBien: 'Type 2',
  categorie: 'logement', etage: null, porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: null,
  proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: false, ...(avecAnnexes ? { annexes: [] } : {}),
});
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

let container: HTMLDivElement;
let root: Root;
let lacherBiens: (() => void) | null;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  lacherBiens = null;
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('liste=proprietaires')) return ok({ lignes: [{ id: 1, nom: 'EXEMPLE Claire', biens: 2, numeroMandat: null }], total: 1, page: 0 });
    if (u.includes('liste=locataires')) return ok({ lignes: [{ id: 2, nom: 'MODÈLE Jules', enPlace: true, logement: '14 rue', lotId: 10 }], total: 1, page: 0 });
    if (u.includes('liste=biens')) {
      // La réponse des biens SE FAIT ATTENDRE : l'écran doit rendre l'onglet « Biens » sans relire les propriétaires.
      await new Promise<void>((r) => { lacherBiens = r; });
      return ok({ lignes: [bien(10, false), bien(11, true)], total: 2, page: 0 });
    }
    if (u.includes('lot=')) {
      return ok({
        fiche: { id: 10, numero: '10', adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', proprietaireNom: 'EXEMPLE Claire',
          proprietaires: [], occupants: [], occupations: [], modifiable: true },
        bien: bien(10, false), parent: null, rattachables: [], locations: [], location372: true,
        // `annexes` ABSENT exprès : la fiche doit s'afficher quand même.
      });
    }
    return ok({ personnes: [], biens: [], tronque: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (texte: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement;

describe('🔴 /admin/location ne plante plus', () => {
  it('① passer de Propriétaires à Biens pendant le chargement : « Chargement… », jamais les propriétaires lus comme des biens', async () => {
    await act(async () => { root.render(createElement(AccueilLocation, { administrateur: true })); });
    await calmer();
    expect(container.textContent).toContain('EXEMPLE Claire');
    await act(async () => { bouton('Biens').click(); });
    // La réponse n'est pas encore là : l'onglet Biens est « en chargement », sans erreur.
    expect(container.textContent).toContain('Chargement…');
    expect(container.querySelector('a[href="/admin/location/proprietaire/1"]')).toBeNull();
    await act(async () => { lacherBiens?.(); });
    await calmer();
    // ② un bien SANS champ `annexes` et un bien à `annexes: []` s'affichent tous les deux.
    expect(container.querySelector('a[href="/admin/location/bien/10"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/location/bien/11"]')).not.toBeNull();
    await act(async () => { bouton('Locataires').click(); });
    await calmer();
    expect(container.textContent).toContain('MODÈLE Jules');
  });

  it('② la fiche d’un bien sans annexe s’affiche (champ absent)', async () => {
    await act(async () => { root.render(createElement(FicheBienLocation, { id: 10 })); });
    await calmer();
    expect(container.textContent).toContain('Le logement et ses annexes');
    expect(container.textContent).toContain('10 rue de l’Essai');
    expect(container.querySelectorAll('[data-annexe="oui"]')).toHaveLength(0);
  });
});
