// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 FICHE COMMUNE OUVERTE DEPUIS LA LOCATION (Arno, 17/10/2026) — « aucune écriture ni réponse de mail (Écrire /
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
vi.mock('../../../../lib/admin/comptes', () => ({
  trouverCompteParId: vi.fn(async () => ({ id: 7, actif: true, role: 'administrateur' })),
  capaciteEnvoiGestion: () => true,
}));

import { FicheCommuneLocation } from './FicheCommune';
import { peutEnvoyerAuNomDeGestion } from '../../../../lib/gestion/gardeEnvoi';
import { requeteDepuisLaLocation, MOTIF_ENVOI_DEPUIS_LOCATION } from '../../../../lib/gestion/contexteLocation';

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
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    appels.push({ url, contexte: new Headers(init?.headers).get('x-svav-contexte') });
    if (url.includes('/api/admin/gestion/annuaire?locataire=')) return reponse({ etat: 'ok', data: ficheLocataire });
    return reponse({ etat: 'inconnu' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

describe('🔴 ① fiche commune ouverte depuis la Location : aucun bouton d’envoi de mail', () => {
  it('chaque appel de la fiche porte « contexte Location » ; ni Écrire, ni Répondre, ni Transférer, ni Nouveau message', async () => {
    await act(async () => { root.render(createElement(FicheCommuneLocation, { fiche: { sorte: 'locataire', id: 92 } })); });
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    const fiche = appels.find((a) => a.url.includes('/api/admin/gestion/annuaire?locataire=92'));
    expect(fiche?.contexte).toBe('location');
    expect(appels.filter((a) => a.url.startsWith('/api/')).every((a) => a.contexte === 'location')).toBe(true);
    const boutons = [...container.querySelectorAll('button, a')].map((b) => b.textContent?.trim() ?? '');
    expect(boutons.filter((t) => /^(Écrire|Répondre|Répondre à tous|Transférer|Nouveau message)\b/.test(t))).toEqual([]);
    expect(container.textContent).toContain('DURAND Léa');
    expect(container.textContent).toContain('les mails sont en lecture');
    expect(container.querySelector('a[href="/admin/location"]')?.textContent).toBe('← Location');
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

describe('🔴 ② envoi refusé côté serveur en contexte Location ; la Gestion inchangée', () => {
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
  it('la garde d’envoi : un administrateur peut envoyer depuis la Gestion, jamais depuis la Location', async () => {
    expect(await peutEnvoyerAuNomDeGestion(requete({ referer: 'http://localhost/admin/gestion' }))).toBe(true);
    expect(await peutEnvoyerAuNomDeGestion(requete({ 'x-svav-contexte': 'location' }))).toBe(false);
    expect(await peutEnvoyerAuNomDeGestion(requete({ referer: 'http://localhost/admin/location/locataire/5' }))).toBe(false);
  });
  it('la route d’envoi et les brouillons refusent en contexte Location, avec le motif (avant toute autre garde d’envoi)', async () => {
    const lire = (f: string) => require('node:fs').readFileSync(f, 'utf8') as string;
    for (const f of ['app/(admin)/api/admin/gestion/envois/route.ts', 'app/(admin)/api/admin/gestion/brouillons/route.ts']) {
      const src = lire(f);
      const n = (src.match(/if \(requeteDepuisLaLocation\(request\)\) return refusEnvoiDepuisLocation\(\);/g) ?? []).length;
      const gardes = (src.match(/if \(!await peutEnvoyerAuNomDeGestion\(request\)\) return refusEnvoi\(\);/g) ?? []).length;
      expect(n, f).toBe(gardes);
      expect(n, f).toBeGreaterThan(0);
    }
    expect((lire('app/(admin)/api/admin/gestion/brouillons/[id]/pieces/route.ts').match(/requeteDepuisLaLocation\(request\)/g) ?? []).length).toBe(3);
    const { refusEnvoiDepuisLocation } = await import('../../../../lib/gestion/contexteLocation');
    const r = refusEnvoiDepuisLocation();
    expect(r.status).toBe(403);
    expect((await r.json()).motif).toBe(MOTIF_ENVOI_DEPUIS_LOCATION);
  });
});
