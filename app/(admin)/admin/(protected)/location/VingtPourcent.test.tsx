// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import type { SuiviVingtLu } from '../../../../lib/location/vingtPourcent';

/** 🔴 Arno (23/11/2026) — « 20 % à restituer » : l'écran (point 3) et ses accès (point 4), routes simulées : rien n'est écrit, rien ne part. */
const fiche = vi.fn();
vi.mock('../gestion/FicheCopropriete', () => ({
  FicheCopropriete: (p: { immeuble?: string | null; onFerme: () => void }) => { fiche(p); return createElement('button', { 'data-stub-fiche': p.immeuble ?? '', onClick: p.onFerme }, 'fermer'); },
}));
const { EcranVingtPourcent } = await import('./VingtPourcent');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LU: SuiviVingtLu = {
  aujourdhui: '2026-11-23',
  manquantes: [{ cle: 'copro-20', coproprieteId: 20, libelle: 'Copro B', immeuble: 'b', lotId: 2, manque: ['derniere_ago', 'arrete'], locataires: ['MARTIN Paul', 'MARTIN Léa'] }],
  lignes: [
    { sortieId: 5, lotId: 1, locataires: ['DUPONT Alice'], logement: '1 rue A, 92800 Puteaux', dateSortie: '2026-11-15', valideLe: '2026-11-20',
      copropriete: { id: 10, libelle: 'Copro A', aRattacher: false }, arrete: { jour: 31, mois: 12 },
      suivi: { etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, incertaine: false, limite: '2027-04-25', alerte: 'a_venir', joursRestants: 153 } },
    { sortieId: 7, lotId: 3, locataires: ['DURAND Léo'], logement: null, dateSortie: '2026-01-10', valideLe: '2026-01-12',
      copropriete: { id: 30, libelle: 'Copro C', aRattacher: false }, arrete: null,
      suivi: { etat: 'ok', exercice: null, ago: { date: '2026-09-22', statut: 'officielle' }, incertaine: true, limite: '2026-10-22', alerte: 'depassee', joursRestants: -32 } },
    { sortieId: 6, lotId: 2, locataires: ['MARTIN Paul', 'MARTIN Léa'], logement: '2 rue B', dateSortie: '2026-10-01', valideLe: '2026-10-02',
      copropriete: { id: 20, libelle: 'Copro B', aRattacher: false }, arrete: null, suivi: { etat: 'sans_ago', exercice: null, mention: 'Dernière AGO inconnue' } },
  ],
};
let container: HTMLDivElement; let root: Root; let lectures: string[]; let donnees: SuiviVingtLu;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); lectures = []; donnees = LU; fiche.mockClear();
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET'); // LECTURE SEULE
    lectures.push(String(u));
    return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const rendre = async (el: ReturnType<typeof createElement>) => { await act(async () => { root.render(el); }); await calmer(); };

describe('point 3 — l’écran « 20 % à restituer »', () => {
  it('lit la route qu’on lui donne ; « Dates manquantes » EN TÊTE : copropriété, ce qui manque, locataires, « Compléter la fiche Copropriété »', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    expect(lectures[0]).toMatch(/^\/api\/admin\/gestion\/preavis\?vingtPourcent=1/);
    const blocs = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    expect(blocs).toEqual(['Dates manquantes', 'Locataires sortis avec 20 % retenus']);
    const m = container.querySelector('[data-vgp-manque="copro-20"]')!;
    expect(m.textContent).toContain('Copro B');
    expect(m.querySelector('[data-vgp-ce-qui-manque]')?.textContent).toBe('Manque : dernière AGO et date d’arrêté des comptes');
    expect(m.querySelector('[data-vgp-locataires]')?.textContent).toBe('2 locataires concernés : MARTIN Paul, MARTIN Léa');
  });
  it('« Compléter la fiche Copropriété » ouvre LA fenêtre de la fiche (même composant que l’annuaire) ; à sa fermeture, la liste se relit', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await act(async () => { (container.querySelector('[data-vgp-completer="copro-20"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenCalledWith(expect.objectContaining({ immeuble: 'b' }));
    donnees = { ...LU, manquantes: [] };
    await act(async () => { (container.querySelector('[data-stub-fiche]') as HTMLButtonElement).click(); });
    await calmer();
    expect(lectures).toHaveLength(2);
    expect(container.querySelector('[data-vgp-manquantes]')?.getAttribute('data-vgp-manquantes')).toBe('0');
    expect(container.querySelector('[data-vgp-manquantes-aucune]')).not.toBeNull();
  });
  it('chaque locataire : logement, copropriété, sortie, exercice, AGO qui compte (projetée / officielle, incertaine), limite, alerte EN MOTS', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = container.querySelector('[data-vgp-sortie="5"]')!;
    expect(a.textContent).toContain('1 rue A, 92800 Puteaux');
    expect(a.querySelector('[data-vgp-exercice]')?.textContent).toBe('Exercice clos le 31/12/2026 (arrêté au 31/12)');
    expect(a.querySelector('[data-vgp-ago]')?.textContent).toBe('25/03/2027 — date projetée');
    expect(a.querySelector('[data-vgp-limite]')?.textContent).toBe('25/04/2027');
    expect(a.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('À restituer au plus tard le 25/04/2027');
    const c = container.querySelector('[data-vgp-sortie="7"]')!;
    expect(c.getAttribute('data-vgp-alerte')).toBe('depassee');
    expect(c.querySelector('[data-vgp-ago]')?.textContent).toBe('22/09/2026 — date officielle · Projection incertaine — date d’arrêté des comptes manquante');
    expect(c.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('Restitution en retard — la limite du 22/10/2026 est dépassée de 32 jours');
    const b = container.querySelector('[data-vgp-sortie="6"]')!;
    expect(b.querySelector('[data-vgp-ago]')?.textContent).toBe('Dernière AGO inconnue');
    expect(b.querySelector('[data-vgp-limite]')?.textContent).toBe('—');
    expect(b.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('Pas de date limite — Dernière AGO inconnue : à compléter dans la fiche Copropriété.');
  });
});

