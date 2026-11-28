// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** 🔴🔴 Arno (28/11/2026, 12h17) — la fiche d'un syndic dans la Location. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ouvertes = vi.hoisted(() => ({ brouillons: [] as { a: string[]; objet: string }[] }));
vi.mock('../gestion/FenetresRedaction', () => ({
  useFenetresRedaction: () => ({
    fenetres: [], brouillons: new Map(), fermetures: new Map(),
    ouvrirFenetre: (_cle: string, b: { a: string[]; objet: string }) => { ouvertes.brouillons.push(b); return null; },
    majBrouillon: vi.fn(), fermerLa: vi.fn(), demanderFermeture: vi.fn(), changerLEtat: vi.fn(),
  }),
  FenetresRedaction: () => null,
}));
import { FicheSyndicLocationVue } from './EcransLocation';

const CONTEXTE = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '', nomExpediteur: 'CRITERIMMO',
  adresseGestion: 'gestion@criterimmo.fr', delaiAnnulationS: 10, piecesDisponibles: false, htmlDisponible: false, classementDisponible: false,
  interneDisponible: false, corbeilleBrouillon: false };
const LOT = (id: number, adresse: string, numero = String(id)) => ({ id, numero, adresse, commune: 'COURBEVOIE', statut: 'en_gestion' as const });
let syndic: Record<string, unknown>;
const BASE = { id: 4, nom: 'CABINET _TEST', adresse: null, codePostal: null, ville: null, telephone: null, telephone2: null, email: 'syndic@exemple.test', note: null,
  contacts: [], coproprietes: [{ id: 157, cle: '43 avenue marceau', libelle: '43 Avenue Marceau', codePostal: '92400', commune: 'COURBEVOIE', debut: '2020-01-01',
    lots: [LOT(1, '43 Avenue Marceau'), LOT(2, '43 avenue Marceau'), LOT(3, '43 avenue Marceau'), LOT(4, '80 rue de Normandie'), LOT(5, '80 rue de Normandie')] }] };

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ouvertes.brouillons.length = 0; syndic = BASE;
  global.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    if (url.startsWith('/api/admin/gestion/redaction')) return reponse(CONTEXTE);
    if (url.includes('syndic=4')) return reponse({ etat: 'ok', data: syndic });
    return reponse({ etat: 'inconnu' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }); };
const rendre = async () => { await act(async () => { root.render(createElement(FicheSyndicLocationVue, { id: 4 })); }); await calmer(); };

describe('🔴🔴 point 4 — les adresses d’une copropriété : jamais répétées', () => {
  it('« 43 Avenue Marceau · 43 avenue Marceau · 43 avenue Marceau · 80 rue de Normandie · 80 rue de Normandie » → deux adresses, chaque bien garde son lien', async () => {
    await rendre();
    const adresses = [...container.querySelectorAll('[data-adresse-copro]')];
    expect(adresses).toHaveLength(2);
    expect(adresses[0].textContent).toContain('43 Avenue Marceau');
    expect(adresses[1].textContent).toContain('80 rue de Normandie');
    expect([...container.querySelectorAll('[data-adresses-copro] a')].map((a) => a.getAttribute('href')))
      .toEqual([1, 2, 3, 4, 5].map((i) => `/admin/location/bien/${i}`));
  });
});
