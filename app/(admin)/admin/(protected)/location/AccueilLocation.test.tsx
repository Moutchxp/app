// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilLocation } from './AccueilLocation';
import { EcranLocataires, EcranProprietairesBiens } from './EcransLocation';
import { SectionLocationBien } from '../gestion/SectionsLocationFiche';

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
    if (u.includes('anciens=1')) return ok({ lignes: [{ id: 9, nom: 'ANCIEN Proprio', biens: 0, numeroMandat: null }], total: 1, page: 0 });
    if (u.includes('q=')) {
      const l = (id: number, titre: string, o: Record<string, unknown> = {}) => ({ id, titre, telephone: null, email: null, adresse: null, detail: null, ancien: false, ...o });
      return ok({
        proprietaires: [l(1, 'EXEMPLE Claire', { telephone: '06 12 34 56 78', email: 'claire@exemple.test', adresse: '14 rue de l’Essai, PARIS' }),
          l(3, 'ANCIEN Paul', { ancien: true })],
        locataires: [],
        syndics: [l(5, 'FONCIA Courbevoie', { telephone: '01 40 00 00 00' })],
        biens: [l(10, '10 rue de l’Essai, PARIS', { detail: 'EXEMPLE Claire' })], tronque: false });
    }
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
  it('① écran Propriétaires et biens : les 3 grosses cases dans l’ordre (effet 3D), sans l’ancien bouton ni le tableau (retraits décidés par Arno)', async () => {
    await act(async () => { root.render(createElement(EcranProprietairesBiens)); });
    await calmer();
    // Arno (18/10/2026) : « Supprimer un propriétaire » EN PREMIER et SEUL en rouge, puis « Créer… » et « Ajouter un nouveau bien » en blanc.
    const cases = [...container.querySelectorAll('.loc-gros-boutons--3d.loc-gros-boutons--trois a.loc-gros-bouton')];
    expect(cases.map((x) => x.getAttribute('href')))
      .toEqual(['/admin/location/proprietaires/supprimer', '/admin/location/nouveau-proprietaire', '/admin/location/nouveau-bien']);
    expect(cases.map((x) => x.firstChild?.textContent)).toEqual(['Supprimer un propriétaire / un bien', 'Créer un nouveau propriétaire', 'Ajouter un nouveau bien']);
    expect(cases.map((x) => x.classList.contains('loc-gros-bouton--plein'))).toEqual([true, false, false]);
    expect(container.querySelector('a[href="/admin/location/nouveau"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.textContent).not.toContain('EXEMPLE Claire');
    // Même en-tête que l'accueil (classes d'EnTetePage), puis le même espace réservé que sous le moteur.
    expect(container.querySelector('.svv-page-head .svv-page-title')?.textContent).toBe('Propriétaires et biens');
    expect(container.querySelector('[data-espace-accueil]')?.className).toBe('loc-zone-resultats loc-zone-resultats--vide');
  });

  it('③ écran Locataires : la liste, et la bascule « Anciens »', async () => {
    await act(async () => { root.render(createElement(EcranLocataires)); });
    await calmer();
    expect(container.textContent).toContain('MODÈLE Jules');
    expect(container.querySelector('a[href="/admin/location/nouveau-locataire"]')).not.toBeNull();
    await act(async () => { bouton('Anciens (sortis du portefeuille)').click(); });
    await calmer();
    expect(container.textContent).toContain('ANCIEN Proprio');
  });

  it('② (fiche commune, section « Location ») un bien sans annexe s’affiche (champ absent)', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    expect(container.textContent).toContain('Le logement et ses annexes');
    expect(container.textContent).toContain('10 rue de l’Essai');
    expect(container.querySelectorAll('[data-annexe="oui"]')).toHaveLength(0);
  });

  it('④ l’accueil : un moteur en haut, UNE LISTE de résultats (une ligne chacun, anciens en bas) ; puis les 3 grosses cases', async () => {
    await act(async () => { root.render(createElement(AccueilLocation)); });
    await calmer();
    const cases = [...container.querySelectorAll('a.loc-case')].map((a) => a.getAttribute('href'));
    // Titres sur deux lignes (Arno, 17/10/2026).
    expect([...container.querySelectorAll('.loc-cases--accueil .loc-case-titre')].map((t) => [...t.querySelectorAll('.loc-case-ligne')].map((l) => l.textContent)))
      .toEqual([['Ajouter / supprimer', 'un propriétaire / bien'], ['Ajouter / supprimer', 'un locataire'], ['Outils', 'de suivi']]);
    expect(cases).toEqual(['/admin/location/proprietaires', '/admin/location/locataires', '/admin/location/outils']);
    // Plus d'onglets ni de listes sur l'accueil : ils sont dans les trois écrans.
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    // La zone de résultats est RÉSERVÉE dès l'ouverture (les cases ne bougent jamais) : vide et sans cadre.
    const zone = () => container.querySelector('[data-resultats]') as HTMLElement;
    expect(zone().className).toBe('loc-zone-resultats loc-zone-resultats--vide');
    expect(zone().textContent).toBe('');
    const champ = container.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champ, 'essai');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    await calmer();
    // UNE LISTE UNIQUE : propriétaires, syndics, biens… puis l'ANCIEN tout en bas, grisé et nommé.
    const lignes = [...container.querySelectorAll('a.loc-res-ligne')];
    expect(lignes.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/location/proprietaire/1', '/admin/location/syndic/5', '/admin/location/bien/10', '/admin/location/proprietaire/3']);
    expect(lignes.map((a) => a.querySelector('.loc-res-type')?.textContent)).toEqual(['Propriétaire', 'Syndic', 'Bien', 'Ancien · Propriétaire']);
    expect(lignes[0].textContent).toContain('06 12 34 56 78');
    expect(lignes[0].textContent).toContain('claire@exemple.test');
    expect(lignes[0].textContent).toContain('14 rue de l’Essai, PARIS');
    expect(lignes[3].className).toContain('loc-res-ligne--ancien');
    expect(container.textContent).toContain('Anciens — sortis du portefeuille');
    // Le panneau s'ancre dans l'espace réservé : les cases restent à leur place, toujours présentes.
    expect(zone().querySelector('[data-panneau]')).not.toBeNull();
    expect(container.querySelectorAll('a.loc-case')).toHaveLength(3);
    // Flèche bas : la première ligne est visée ; Échap : la recherche est vidée, l'espace réservé redevient vide.
    await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(lignes[0].getAttribute('aria-selected')).toBe('true');
    await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(champ.value).toBe('');
    expect(zone().querySelector('[data-panneau]')).toBeNull();
    expect(zone().textContent).toBe('');
  });
});
