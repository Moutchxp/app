// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';
import { LigneTache } from './LigneTache';
import { ajouterJours, jourParisDe, type Tache } from '../../../../lib/gestion/taches';

/**
 * 🔴🔴 Arno (11/11/2026, lot C) — « RDV / TÂCHES » À L'ÉCRAN : le choix OBLIGATOIRE « Rendez-vous » / « Tâche » en tête de la fenêtre (le reste
 * inactif tant qu'aucun n'est choisi) ; le rendez-vous : objet proposé qui suit la date et l'heure tant qu'on ne l'a pas modifié, heure de
 * début et durée obligatoires (choix rapides + saisie libre), heure de fin affichée ; la tâche : date seule, pas de durée ; le type part avec
 * la création ; le libellé « RDV » / « Tâche » sur la ligne. Les vraies fenêtres, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let posts: { url: string; corps: Record<string, unknown> }[];
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') posts.push({ url, corps: JSON.parse(String(init?.body)) });
    if (url.includes('/taches/apercu')) return Response.json({ etat: 'ok', total: 0, collaborateurs: [], exterieurs: [], texteCollaborateur: null, texteExterieur: null });
    if (method !== 'GET') return Response.json({ etat: 'ok', id: 9, message: 'Tâche créée.' });
    if (url.includes('/taches/collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 1, libelle: 'Arno Jorel' }], moi: 1 });
    if (url.includes('/biens/evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    return Response.json({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const clic = async (sel: string) => { const el = container.querySelector(sel) ?? document.querySelector(sel); if (!el) throw new Error(`absent : ${sel}`); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const ouvrir = async () => {
  await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'creer', lotId: 10, lotCle: '315', adresse: '7 avenue de l’Union' }, onFermer: () => {} })); });
  await calmer();
};
const objet = () => (container.querySelector('[data-champ-objet]') as HTMLInputElement).value;

describe('le choix obligatoire « Rendez-vous » / « Tâche »', () => {
  it('tant qu’aucun n’est choisi : tout le formulaire est inactif, « Créer » aussi', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-choix-sorte] [data-sorte]')].map((b) => b.textContent)).toEqual(['Rendez-vous', 'Tâche']);
    expect((container.querySelector('[data-formulaire-actif]') as HTMLFieldSetElement).disabled).toBe(true);
    expect((container.querySelector('[data-enregistrer-tache]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('#tchf-titre')?.textContent).toContain('Nouveau RDV / tâche');
    await clic('[data-sorte="tache"]');
    expect((container.querySelector('[data-formulaire-actif]') as HTMLFieldSetElement).disabled).toBe(false);
    expect(container.querySelector('#tchf-titre')?.textContent).toContain('Nouvelle tâche');
  });
});

describe('Rendez-vous', () => {
  it('objet proposé qui suit la date et l’heure ; plus touché une fois modifié ; heure et durée obligatoires ; fin affichée ; le type et la durée partent', async () => {
    await ouvrir();
    await clic('[data-sorte="rdv"]');
    await saisir('.tchf-corps input[type="date"]', '2026-11-20');
    expect(objet()).toBe('Demande de rendez-vous le 20/11/2026 à HHhMM');
    await saisir('.tchf-corps input[type="time"]', '10:30');
    expect(objet()).toBe('Demande de rendez-vous le 20/11/2026 à 10h30');
    expect(container.querySelector('.tchf-corps')?.textContent).toContain('Heure de début *');
    // Sans durée : refusé, rien ne part.
    await clic('[data-enregistrer-tache]');
    expect(container.querySelector('.tchf-alerte')?.textContent).toBe('Indiquez la durée du rendez-vous (entre 5 min et 24 h).');
    expect(posts).toEqual([]);
    // 🔴 Arno (11/11/2026) — 5 min et 15 min en tête ; « Autre (min) » à la suite.
    expect([...container.querySelectorAll('[data-duree-rapide]')].map((b) => b.textContent)).toEqual(['5 min', '15 min', '30 min', '1 h', '1 h 30', '2 h']);
    await clic('[data-duree-rapide="5"]');
    expect(container.querySelector('[data-heure-fin]')?.textContent).toBe('Fin : 10h35');
    await clic('[data-duree-rapide="15"]');
    expect(container.querySelector('[data-heure-fin]')?.textContent).toBe('Fin : 10h45');
    await clic('[data-duree-rapide="90"]');
    expect(container.querySelector('[data-heure-fin]')?.textContent).toBe('Fin : 12h00');
    await saisir('[data-duree-libre]', '45');
    expect(container.querySelector('[data-heure-fin]')?.textContent).toBe('Fin : 11h15');
    // L'objet modifié à la main n'est plus remplacé.
    await saisir('[data-champ-objet]', 'Visite avec le plombier');
    await saisir('.tchf-corps input[type="time"]', '11:00');
    expect(objet()).toBe('Visite avec le plombier');
    await clic('[data-enregistrer-tache]');
    expect(posts.find((p) => p.url.includes('/taches/apercu'))?.corps).toMatchObject({ sorte: 'rdv', heure: '11:00', dureeMinutes: 45, objet: 'Visite avec le plombier' });
  });
});

describe('Tâche', () => {
  it('date seule obligatoire ; heure facultative ; pas de durée ; le type part', async () => {
    await ouvrir();
    await clic('[data-sorte="tache"]');
    expect(container.querySelector('[data-duree-rdv]')).toBeNull();
    await saisir('.tchf-corps input[type="time"]', '09:00');
    expect(container.querySelector('[data-champ-duree]')).toBeNull();
    expect(container.querySelector('.tchf-corps')?.textContent).toContain('Heure (facultative)');
    await saisir('[data-champ-objet]', 'Relancer le syndic');
    await clic('[data-enregistrer-tache]');
    const corps = posts.find((p) => p.url.includes('/taches/apercu'))?.corps;
    expect(corps).toMatchObject({ sorte: 'tache', objet: 'Relancer le syndic' });
    expect(corps && 'dureeMinutes' in corps).toBe(false);
  });
});

describe('le libellé du type sur la ligne', () => {
  const T = (o: Partial<Tache>): Tache => ({
    id: 7, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite', note: null, jour: ajouterJours(jourParisDe(new Date()), 2), heure: '10:00',
    rappels: [], etat: 'a_faire', confieeA: 1, confieeALibelle: 'Arno Jorel', creeLe: '2026-11-01T10:00:00Z', creeParLibelle: 'Arno', majLe: '2026-11-01T10:00:00Z',
    faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, nbPieces: 0, creePar: 1, acceptation: null, ...o,
  } as Tache);
  it('« RDV » pour un rendez-vous ; « Tâche » pour une tâche, et pour une tâche d’avant (sans type)', async () => {
    for (const [t, mot] of [[T({ sorte: 'rdv' }), 'RDV'], [T({ sorte: 'tache' }), 'Tâche'], [T({}), 'Tâche']] as const) {
      await act(async () => { root.render(createElement(LigneTache, { tache: t, maintenant: new Date(), moi: 1, onDetail: () => {}, onChange: () => {} } as never)); });
      expect(container.querySelector('[data-sorte-tache]')?.textContent).toBe(mot);
    }
  });
});

describe('🔴 Arno (11/11/2026) — « Rendez-vous » et « Tâche » : toute la largeur, à parts égales, sur une ligne (empilés sur mobile)', () => {
  it('deux colonnes égales ; le texte d’aide sous les deux ; une colonne au téléphone', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/FenetreTache.tsx', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.tchf-sorte{display:grid;grid-template-columns:1fr 1fr;');
    expect(css).toContain('.tchf-sorte > :not(.tchf-sorte-btn){grid-column:1 / -1}');
    expect(css).toContain('@media (max-width:600px){.tchf-sorte{grid-template-columns:1fr}}');
    expect(css).toContain('.tchf-sorte .tchf-sorte-btn{min-height:44px;width:100%;');
  });
});
