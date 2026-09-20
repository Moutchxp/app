// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SuiviDemandes } from './SuiviDemandes';

/**
 * ALLÈGEMENT du rail TÉLÉSERVICE, écran « À demander » (comportement réel, jsdom + act, `fetch` mocké /demandes). On prouve, PAR RAIL :
 *  · FILTRES — e-mail : les 5 filtres présents (Statut, Profil, Commune, Référence, Tri, Type) ; téléservice : SEUL « Statut » reste,
 *    les 5 autres retirés.
 *  · GESTES — e-mail : les 5 gestes présents ; téléservice : SEUL « Basculer le profil » reste (Passer en prête / Annuler la prête /
 *    Annuler la demande / Tout annuler retirés).
 *  · NON-RÉGRESSION téléservice : le panneau détail (bloc ③, conservé) garde le chemin d'annulation par unité.
 * Le rail E-MAIL est STRICTEMENT inchangé (assertion explicite). Aucune assertion de couleur/pixel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let liste: { demandes: unknown[]; alertesIdentite: unknown[] };

const CATS = [{ cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 }];

const demande = (over: Record<string, unknown> = {}) => ({
  id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Asnières', codeInsee: '92004',
  nbDossiers: 1, statut: 'brouillon', profil: 'entreprise', creeLe: '2026-01-01T00:00:00Z',
  canal: 'formulaire', rangs: [1], numeros: ['PC0920042500001'], referencesExternes: [], destOrigine: 'mairie_contact', destNom: null, ...over,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  liste = { demandes: [], alertesIdentite: [] };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/admin/permis/demandes') && !u.includes('/en-cours')) return { ok: true, json: async () => liste } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const aBouton = (re: RegExp): boolean => boutons().some((b) => re.test(b.textContent ?? ''));
const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

// Sélecteurs de FILTRES (uniques) — le libellé de filtre est un <label> dont le texte COMMENCE par son nom (« Basculer la sélection en… »
//   ne commence pas par « Profil », donc n'est jamais confondu avec le filtre Profil).
const labelDebut = (deb: string): boolean => [...container.querySelectorAll('label')].some((l) => (l.textContent ?? '').trim().startsWith(deb));
const aFiltreStatut = (): boolean => labelDebut('Statut');
const aFiltreProfil = (): boolean => labelDebut('Profil');
const aFiltreTri = (): boolean => labelDebut('Tri');
const aFiltreReference = (): boolean => container.querySelector('input[aria-label^="Rechercher par référence"]') !== null;
const aFiltreCommune = (): boolean => container.querySelector('input[placeholder="nom ou code"]') !== null;
const aFiltreType = (): boolean => container.querySelector('[aria-label="Filtrer par type de permis"]') !== null;

const monter = async (process: 'email' | 'formulaire'): Promise<void> => {
  await act(async () => { root.render(createElement(SuiviDemandes, { categories: CATS, perimetre: 'a_demander', process, signalRafraichir: 0 })); });
  await flush();
};

describe('Allègement téléservice « À demander » — FILTRES par rail', () => {
  it('rail E-MAIL : les 5 filtres présents (STRICTEMENT inchangé) + Statut', async () => {
    liste = { demandes: [demande({ canal: 'email' })], alertesIdentite: [] };
    await monter('email');
    expect(aFiltreStatut()).toBe(true);
    expect(aFiltreProfil()).toBe(true);
    expect(aFiltreCommune()).toBe(true);
    expect(aFiltreReference()).toBe(true);
    expect(aFiltreTri()).toBe(true);
    expect(aFiltreType()).toBe(true);
  });

  it('rail TÉLÉSERVICE : SEUL « Statut » reste ; Profil, Commune, Référence, Tri, Type RETIRÉS', async () => {
    liste = { demandes: [demande({ canal: 'formulaire' })], alertesIdentite: [] };
    await monter('formulaire');
    expect(aFiltreStatut()).toBe(true);       // conservé (révèle les annulées via « Toutes »)
    expect(aFiltreProfil()).toBe(false);
    expect(aFiltreCommune()).toBe(false);
    expect(aFiltreReference()).toBe(false);
    expect(aFiltreTri()).toBe(false);
    expect(aFiltreType()).toBe(false);
  });

  it('rail TÉLÉSERVICE : le filtre Statut n’offre PLUS l’option « prête » (sans objet), mais garde « Toutes » et « annulée »', async () => {
    liste = { demandes: [demande({ canal: 'formulaire' })], alertesIdentite: [] };
    await monter('formulaire');
    const statut = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'tous'));
    const valeurs = statut ? [...statut.options].map((o) => o.value) : [];
    expect(valeurs).toContain('tous');       // « Toutes » → révèle les annulées
    expect(valeurs).toContain('annulee');
    expect(valeurs).toContain('brouillon');
    expect(valeurs).not.toContain('prete');  // option « prête » retirée
  });
});

describe('Allègement téléservice « À demander » — GESTES DE MASSE par rail', () => {
  it('rail E-MAIL : les 5 gestes présents (STRICTEMENT inchangé)', async () => {
    liste = { demandes: [
      demande({ id: 1, statut: 'brouillon', canal: 'email' }),
      demande({ id: 2, statut: 'prete', canal: 'email', reference: 'SVAV-DEM-2026-000002', numeros: ['PC0920042500002'] }),
    ], alertesIdentite: [] };
    await monter('email');
    expect(aBouton(/Passer en prête/)).toBe(true);
    expect(aBouton(/Annuler la prête/)).toBe(true);
    expect(aBouton(/Annuler la demande/)).toBe(true);
    expect(aBouton(/Tout annuler/)).toBe(true);
    expect(container.textContent).toContain('Basculer la sélection en');
  });

  it('rail TÉLÉSERVICE : SEUL « Basculer le profil » reste ; Annuler la demande, Tout annuler, Passer en prête, Annuler la prête RETIRÉS', async () => {
    liste = { demandes: [
      demande({ id: 1, statut: 'brouillon', canal: 'formulaire' }),
      demande({ id: 2, statut: 'prete', canal: 'formulaire', reference: 'SVAV-DEM-2026-000002', numeros: ['PC0920042500002'] }),
    ], alertesIdentite: [] };
    await monter('formulaire');
    expect(container.textContent).toContain('Basculer la sélection en'); // conservé (change le profil EN PLACE, régénère le corps)
    expect(aBouton(/Passer en prête/)).toBe(false);
    expect(aBouton(/Annuler la prête/)).toBe(false);
    expect(aBouton(/Annuler la demande/)).toBe(false);                   // retiré (redondant : carrousel + panneau détail)
    expect(aBouton(/Tout annuler/)).toBe(false);                         // retiré (redondant : annulation par carte au carrousel)
  });

  it('NON-RÉGRESSION téléservice : une demande garde un chemin d’annulation via son PANNEAU DÉTAIL (bloc ③ conservé)', async () => {
    liste = { demandes: [demande({ id: 2, statut: 'prete', canal: 'formulaire', reference: 'SVAV-DEM-2026-000002', numeros: ['PC0920042500002'] })], alertesIdentite: [] };
    const detail = {
      id: 2, reference: 'SVAV-DEM-2026-000002', communeNom: 'Asnières', codeInsee: '92004', statut: 'prete', profil: 'entreprise',
      canal: 'formulaire', destEmail: null, destAdressePostale: null, destUrlFormulaire: 'https://teleservice.example',
      destOrigine: 'mairie_contact', destNom: null, corps: 'CORPS', dossiers: [{ numDau: 'PC0920042500002', date: null }],
      dossiersRetires: [], referencesMairie: [], referencesMairieIndisponible: false,
    };
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (/\/api\/admin\/permis\/demandes\/\d+$/.test(u)) return { ok: true, json: async () => detail } as unknown as Response; // fetch DÉTAIL
      if (u.includes('/api/admin/permis/demandes') && !u.includes('/en-cours')) return { ok: true, json: async () => liste } as unknown as Response;
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    await monter('formulaire');

    // Barre allégée : plus AUCUN « Annuler la demande » (retiré du rail téléservice).
    const nbAnnulerDemande = () => boutons().filter((b) => (b.textContent ?? '').trim() === 'Annuler la demande').length;
    expect(nbAnnulerDemande()).toBe(0);

    // On ouvre le détail → le PANNEAU (conservé) porte le geste d'annulation : la demande n'est jamais sans chemin.
    const ouvrir = boutons().find((b) => /ouvrir/.test(b.textContent ?? ''));
    await act(async () => { ouvrir!.click(); });
    await flush();
    expect(nbAnnulerDemande()).toBe(1); // uniquement le panneau détail (bloc ③)
  });
});
