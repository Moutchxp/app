// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SuiviDemandes } from './SuiviDemandes';

/**
 * §2 — BARRE DE MASSE de « À demander » selon le rail. Comportement réel (jsdom + act), `fetch` mocké (liste /demandes). On prouve :
 * rail e-mail = les 5 gestes présents ; rail téléservice = « Passer en prête » et « Annuler la prête » ABSENTS, les 3 autres présents
 * (Annuler la demande, Tout annuler, Basculer). Une prête est présente dans la vue des DEUX rails → l'absence en téléservice est bien
 * due à la garde, pas à l'absence de cible. Aucune assertion de couleur/pixel.
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

const monter = async (process: 'email' | 'formulaire'): Promise<void> => {
  await act(async () => { root.render(createElement(SuiviDemandes, { categories: CATS, perimetre: 'a_demander', process, signalRafraichir: 0 })); });
  await flush();
};

describe('§2 — barre de masse « À demander » selon le rail', () => {
  it('rail E-MAIL : les 5 gestes présents (dont « Passer en prête » et « Annuler la prête »)', async () => {
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

  it('rail TÉLÉSERVICE : « Passer en prête » et « Annuler la prête » ABSENTS ; les 3 autres présents', async () => {
    liste = { demandes: [
      demande({ id: 1, statut: 'brouillon', canal: 'formulaire' }),
      demande({ id: 2, statut: 'prete', canal: 'formulaire', reference: 'SVAV-DEM-2026-000002', numeros: ['PC0920042500002'] }),
    ], alertesIdentite: [] };
    await monter('formulaire');
    // une prête EST dans la vue (sinon « Annuler la prête » serait absent pour une autre raison) : preuve indirecte via « Tout annuler »
    expect(aBouton(/Passer en prête/)).toBe(false);
    expect(aBouton(/Annuler la prête/)).toBe(false);
    expect(aBouton(/Annuler la demande/)).toBe(true);
    expect(aBouton(/Tout annuler/)).toBe(true);
    expect(container.textContent).toContain('Basculer la sélection en');
  });

  it('NON-RÉGRESSION téléservice : une prête garde un chemin d’annulation via son panneau détail (§1)', async () => {
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

    // Barre seule : « Annuler la demande » (:705) présent une fois ; « Annuler la prête » (:720) retiré (§2).
    const nbAnnulerDemande = () => boutons().filter((b) => (b.textContent ?? '').trim() === 'Annuler la demande').length;
    expect(nbAnnulerDemande()).toBe(1);
    expect(aBouton(/Annuler la prête/)).toBe(false);

    // On ouvre le détail de la prête → le panneau ajoute SON geste d'annulation (§1) : la prête n'est jamais sans chemin.
    const ouvrir = boutons().find((b) => /ouvrir/.test(b.textContent ?? ''));
    await act(async () => { ouvrir!.click(); });
    await flush();
    expect(nbAnnulerDemande()).toBe(2); // barre (:705) + panneau détail (§1) → chemin d'annulation garanti pour la prête
  });
});
