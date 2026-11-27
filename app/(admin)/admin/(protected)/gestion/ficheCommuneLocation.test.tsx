// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 (Arno, 27/11/2026, 12h37) « impossible d'envoyer un mail depuis une page d'historique » : la règle du 17/10/2026 ci-dessous est LEVÉE —
 * depuis la Location, la fiche a le même module d'écriture que la Gestion ; c'est le DROIT d'envoi du compte qui décide (administrateur : toujours).
 * AVANT — 🔴🔴 FICHE COMMUNE OUVERTE DEPUIS LA LOCATION (Arno, 17/10/2026) — « aucune écriture ni réponse de mail (Écrire /
 * Répondre / Transférer et composition absents) ; vérifié côté serveur aussi : une requête d'envoi venant du contexte
 * Location est refusée. Dans la Gestion, rien ne change. »
 *   ① À L'ÉCRAN : la page de la Location monte la fiche de la Gestion SANS rédaction ; chaque appel porte l'en-tête
 *      « contexte Location » ; aucun bouton d'envoi n'apparaît ;
 *   ② AU SERVEUR : la garde d'envoi refuse en contexte Location (en-tête OU Referer), accepte comme avant depuis la
 *      Gestion ; la route d'envoi rend 403 avec le motif.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/session', () => ({
  NOM_COOKIE: 'svav_admin',
  verifierJeton: vi.fn(async () => ({ sub: '7', role: 'administrateur' })),
  sessionDepuisPayload: () => ({ sub: 7, role: 'administrateur', perms: {} }),
}));
const droit = vi.hoisted(() => ({ envoi: true }));
vi.mock('../../../../lib/admin/comptes', () => ({
  trouverCompteParId: vi.fn(async () => ({ id: 7, actif: true, role: 'administrateur' })),
  capaciteEnvoiGestion: () => droit.envoi,
}));

import { FicheCommuneLocation } from './FicheCommune';
import { peutEnvoyerAuNomDeGestion } from '../../../../lib/gestion/gardeEnvoi';
import { requeteDepuisLaLocation } from '../../../../lib/gestion/contexteLocation';

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const ficheLocataire = {
  id: 92, nom: 'DURAND Léa', adresse: null, commune: null, codePostal: null, cle: 'L92', absent: false, contacts: [],
  occupations: [], personnes: [], modifiable: false, suppressionDisponible: false,
  logements: [{
    lotId: 25, numero: '25', adresse: '3 rue des Lilas', commune: 'Paris', codePostal: '75011', nature: 'Appartement',
    typeBien: 'Studio', immeuble: 'IMM-SANS', surfaceM2: null, entree: '2022-06-24', sortie: null, encours: true, horsGestion: false,
    proprietaireId: 9, proprietaireNom: 'MARTIN Paul', mails: 12, dernierEchange: '2026-09-17T10:00:00Z', driveDossierId: null,
  }],
};

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; contexte: string | null }[];
let peutEnvoyer: boolean | null;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; peutEnvoyer = null; droit.envoi = true;
  global.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    appels.push({ url, contexte: new Headers(init?.headers).get('x-svav-contexte') });
    if (url.includes('/api/admin/gestion/annuaire?locataire=')) return reponse({ etat: 'ok', data: ficheLocataire });
    // 🔴 (27/11/2026) le contexte d'écriture de la Gestion, lu aussi depuis la Location
    if (url.startsWith('/api/admin/gestion/redaction') && peutEnvoyer !== null) return reponse({ schemaPret: true, peutEnvoyer, jetonPresent: true, signature: '', adresseGestion: 'gestion@criterimmo.fr' });
    return reponse({ etat: 'inconnu' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

describe('🔴 ① fiche commune ouverte depuis la Location : le même module d’écriture que la Gestion (27/11/2026)', () => {
  const ouvrirFiche = async () => {
    await act(async () => { root.render(createElement(FicheCommuneLocation, { fiche: { sorte: 'locataire', id: 92 } })); });
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
  };
  it('chaque appel porte « contexte Location » ; avec le droit d’envoi : « Écrire un mail » en tête de l’historique ; le bandeau dit l’écriture ouverte', async () => {
    peutEnvoyer = true;
    await ouvrirFiche();
    expect(appels.find((a) => a.url.includes('/api/admin/gestion/annuaire?locataire=92'))?.contexte).toBe('location');
    expect(appels.filter((a) => a.url.startsWith('/api/')).every((a) => a.contexte === 'location')).toBe(true);
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/redaction'))).toBe(true);
    expect(container.querySelector('[data-hdb-ecrire]')?.textContent).toBe('Écrire un mail');
    expect(container.querySelector('[data-hdb-envoi-refuse]')).toBeNull();
    expect(container.textContent).toContain('DURAND Léa');
    expect(container.textContent).toContain('écrire, répondre ou transférer un mail se fait ici comme dans la Gestion');
    expect(container.textContent).not.toContain('les mails sont en lecture');
    expect(container.querySelector('a[href="/admin/location"]')?.textContent).toBe('← Location');
  });
  it('sans le droit d’envoi : la mention « Envoi de mails non autorisé pour votre compte » à la place du bouton, jamais un vide', async () => {
    peutEnvoyer = false;
    await ouvrirFiche();
    expect(container.querySelector('[data-hdb-ecrire]')).toBeNull();
    expect(container.querySelector('[data-hdb-envoi-refuse]')?.textContent).toBe('Envoi de mails non autorisé pour votre compte');
  });
  it('au démontage, `fetch` redevient celui de la page (rien ne fuit vers la Gestion)', async () => {
    const avant = global.fetch;
    await act(async () => { root.render(createElement(FicheCommuneLocation, { fiche: { sorte: 'locataire', id: 92 } })); });
    expect(window.fetch).not.toBe(avant);
    act(() => { root.unmount(); });
    root = createRoot(container);
    expect(window.fetch).toBe(avant);
  });
});

describe('🔴 ② au serveur : le DROIT d’envoi décide, depuis la Location comme depuis la Gestion (27/11/2026)', () => {
  const requete = (entetes: Record<string, string>) => new Request('http://localhost/api/admin/gestion/envois', {
    method: 'POST', headers: { cookie: 'svav_admin=jeton', ...entetes },
  });
  it('le contexte se lit par l’en-tête OU par le Referer d’une page /admin/location', () => {
    expect(requeteDepuisLaLocation(requete({ 'x-svav-contexte': 'location' }))).toBe(true);
    expect(requeteDepuisLaLocation(requete({ referer: 'http://localhost/admin/location/bien/3' }))).toBe(true);
    expect(requeteDepuisLaLocation(requete({ referer: 'http://localhost/admin/location' }))).toBe(true);
    expect(requeteDepuisLaLocation(requete({ referer: 'http://localhost/admin/gestion?ecran=annuaire&fiche=lot-3' }))).toBe(false);
    expect(requeteDepuisLaLocation(requete({ referer: 'http://localhost/admin/locationnaire' }))).toBe(false);
    expect(requeteDepuisLaLocation(requete({}))).toBe(false);
  });
  it('la garde d’envoi : un administrateur envoie depuis la Gestion ET depuis la Location ; un compte sans droit d’envoi, nulle part', async () => {
    expect(await peutEnvoyerAuNomDeGestion(requete({ referer: 'http://localhost/admin/gestion' }))).toBe(true);
    expect(await peutEnvoyerAuNomDeGestion(requete({ 'x-svav-contexte': 'location' }))).toBe(true);
    expect(await peutEnvoyerAuNomDeGestion(requete({ referer: 'http://localhost/admin/location/bien/185' }))).toBe(true);
    droit.envoi = false;
    expect(await peutEnvoyerAuNomDeGestion(requete({ referer: 'http://localhost/admin/gestion' }))).toBe(false);
    expect(await peutEnvoyerAuNomDeGestion(requete({ 'x-svav-contexte': 'location' }))).toBe(false);
  });
  it('les routes d’envoi et de brouillons ne refusent plus « depuis la Location », mais gardent TOUTES le contrôle du droit d’envoi', () => {
    const lire = (f: string) => require('node:fs').readFileSync(f, 'utf8') as string;
    for (const f of ['app/(admin)/api/admin/gestion/envois/route.ts', 'app/(admin)/api/admin/gestion/brouillons/route.ts', 'app/(admin)/api/admin/gestion/brouillons/[id]/pieces/route.ts']) {
      expect(lire(f), f).not.toMatch(/requeteDepuisLaLocation\(request\)/);
    }
    for (const f of ['app/(admin)/api/admin/gestion/envois/route.ts', 'app/(admin)/api/admin/gestion/brouillons/route.ts']) {
      expect((lire(f).match(/if \(!await peutEnvoyerAuNomDeGestion\(request\)\) return refusEnvoi\(\);/g) ?? []).length, f).toBeGreaterThan(0);
    }
    expect(lire('app/lib/gestion/gardeEnvoi.ts')).not.toMatch(/requeteDepuisLaLocation/);
  });
});
