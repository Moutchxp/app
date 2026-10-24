// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { adressePageDepuisModale } from './parametresAdresse';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

const redirect = vi.fn((u: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { cible: u }); });
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/outils/parametres', redirect: (u: string) => redirect(u),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('server-only', () => ({}));
vi.mock('./acces', () => ({ accesLocation: async () => ({ autorise: true, administrateur: true, gestion: true }), REFUS_LOCATION: 'refus' }));
const { PageParametresLocation, ModaleParametresLocation } = await import('./ParametresLocation');
const { default: PageOutils } = await import('./outils/page');

/**
 * 🔴 Arno (25/10/2026) — « PARAMÈTRES LOCATION » EN PAGE depuis Outils de suivi (`/admin/location/outils/parametres?onglet=…`), la MODALE pour
 * les autres raccourcis ; un seul jeu de composants ; les anciennes adresses `?parametres=…` redirigées. Et les cases du « Total depuis le
 * début » : libellé + montant, toutes au même format. Données fictives, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('🔴 les anciennes adresses de la modale mènent à la page', () => {
  it('?parametres=apporteurs&apporteur=4&panneau=cumul → la page, même onglet, même carte, même panneau ; sans ?parametres : rien', () => {
    expect(adressePageDepuisModale({ parametres: 'apporteurs', apporteur: '4', panneau: 'cumul' })).toBe('/admin/location/outils/parametres?onglet=apporteurs&apporteur=4&panneau=cumul');
    expect(adressePageDepuisModale({ parametres: 'baremes' })).toBe('/admin/location/outils/parametres?onglet=baremes');
    expect(adressePageDepuisModale({ parametres: 'inconnu' })).toBe('/admin/location/outils/parametres?onglet=destinataires');
    expect(adressePageDepuisModale({ apporteur: '4' })).toBeNull();
  });
  it('la page Outils de suivi redirige une ancienne adresse (serveur)', async () => {
    await expect(PageOutils({ searchParams: Promise.resolve({ parametres: 'apporteurs', apporteur: '12', panneau: 'taux' }) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/admin/location/outils/parametres?onglet=apporteurs&apporteur=12&panneau=taux');
    redirect.mockClear();
    await PageOutils({ searchParams: Promise.resolve({}) });
    expect(redirect).not.toHaveBeenCalled();
  });
});

const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
const LEA: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2020-01-01', taux: 0.2, mode: 'one_shot', tauxGestion: 0, ordre: 1 }], collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }],
  remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'one_shot', taux: 0.05, tauxGestion: 0, dureeAnnees: null }] };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.history.replaceState(null, '', '/admin/location/outils/parametres?onglet=apporteurs');
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 4: { nb: 2, ca: 2000, commission: 400, collegue: 100 } } });
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-25', dossiers: [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 2, avenants: 1, ca: 2000, commission: 400, collegue: 100, location: 400, gestion: 0, recurrente: 0 },
      parAnnee: [{ annee: 2025, nb: 2, ca: 2000, commission: 400, collegue: 100 }], parMois: [] } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true,
      negociateurs: [], regles: [], retrocessions: [], collegues: [{ id: 5, libelle: 'Paul Collègue' }], apporteurs: [LEA] } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-25', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };

describe('🔴 la page « Paramètres Location »', () => {
  it('le MÊME contenu que la modale, en page : « ← Outils de suivi », pas de voile ni de croix ; onglet, carte et panneau dans l’adresse', async () => {
    await act(async () => { root.render(createElement(PageParametresLocation, { ongletInitial: 'apporteurs' })); });
    await calmer();
    expect(container.querySelector('[data-retour-outils]')?.getAttribute('href')).toBe('/admin/location/outils');
    expect(container.querySelector('[data-page-parametres]')).not.toBeNull();
    expect(container.querySelector('[data-voile-parametres], [data-modale-parametres], .plo-x, [role="dialog"]')).toBeNull();
    expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('data-onglet'))).toEqual(['destinataires', 'baremes', 'archivage', 'apporteurs', 'commissions', 'indices']);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-onglet')).toBe('apporteurs');
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    expect(window.location.search).toBe('?onglet=apporteurs&apporteur=4&panneau=cumul');
    await clic(container.querySelector('[data-fermer-panneau="4"]')!);
    expect(window.location.search).toBe('?onglet=apporteurs');
    await clic(container.querySelector('[data-onglet="baremes"]')!);
    expect(window.location.search).toBe('?onglet=baremes');
    expect(container.querySelector('[data-page-parametres]')).not.toBeNull();
  });
  it('la modale, elle, garde son enveloppe (voile, croix, dialogue) : c’est le même composant', async () => {
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {}, ongletInitial: 'apporteurs' })); });
    await calmer();
    expect(container.querySelector('[data-voile-parametres] [role="dialog"][data-modale-parametres] .plo-x')).not.toBeNull();
    expect(container.querySelector('[data-page-parametres]')).toBeNull();
    const src = readFileSync(join(__dirname, 'ParametresLocation.tsx'), 'utf8');
    expect(src).toMatch(/<ModaleParametresLocation page ongletInitial=\{ongletInitial\}/);   // la page REND la modale en mode page : pas de copie
  });
});

describe('🔴 les cases du « Total depuis le début » : libellé + montant, toutes au même format', () => {
  it('aucune mention sous les montants ; « Dû au collègue HT » en case du même format ; styles communs (colonnes égales, sous-grille, centrage)', async () => {
    await act(async () => { root.render(createElement(PageParametresLocation, { ongletInitial: 'apporteurs' })); });
    await calmer();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    const cases = [...container.querySelectorAll('[data-totaux-apporteur] > li')];
    expect(cases.map((c) => c.getAttribute('data-total-apporteur'))).toEqual(['dossiers', 'ht', 'ttc', 'du', 'collegue', 'net']);
    for (const c of cases) {
      expect([...c.children].map((x) => x.tagName)).toEqual(['SPAN', 'STRONG']);   // le libellé, le montant — rien d'autre
      expect(c.querySelector('.plo-total-note')).toBeNull();
    }
    expect(container.querySelector('[data-totaux-apporteur]')?.textContent).not.toMatch(/TVA|dont/);
    expect((container.querySelector('[data-totaux-apporteur]') as HTMLElement).style.getPropertyValue('--plo-cases')).toBe('6');
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('').replace(/\s+/g, '');
    expect(css).toMatch(/\.plo-totaux\{[^}]*display:grid;grid-template-columns:repeat\(var\(--plo-cases\),minmax\(0,1fr\)\)/);
    expect(css).toMatch(/\.plo-totauxli\{display:grid;grid-row:span2;grid-template-rows:subgrid;[^}]*justify-items:center;[^}]*text-align:center/);
    expect(css).toMatch(/\.plo-totauxstrong\{[^}]*font-size:1\.05rem/);
  });
});
