// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';
import { LigneTache } from './LigneTache';
import type { Tache } from '../../../../lib/gestion/taches';

/**
 * 🔴🔴 Arno (18/11/2026) — module Tâches : les minutes du réglage (00, 15, 30, 45) UNIQUEMENT pour une tâche qui est un rendez-vous de préavis
 * (pré-visite, état des lieux de sortie), dans la fenêtre ET dans le décalage ; les autres tâches gardent leur champ d'heure. Vrais composants,
 * routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const base: Tache = {
  id: 41, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'État des lieux de sortie', note: null,
  jour: '2099-01-06', heure: '09:53', rappels: [], etat: 'a_faire', confieeA: 1, confieeALibelle: 'Arno Jorel', creeLe: '2026-11-18T10:00:00Z',
  creeParLibelle: 'Arno Jorel', majLe: '2026-11-18T10:00:00Z', faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null,
  nbContacts: 0, nbPieces: 0, creePar: 1, acceptation: null, sorte: 'rdv', dureeMinutes: 60,
} as unknown as Tache;
let detail: Tache;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  detail = base;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (/\/taches\/41$/.test(url)) return Response.json({ etat: 'ok', tache: detail, traces: [], contacts: [], pieces: [] });
    if (url.includes('/taches/collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 1, libelle: 'Arno Jorel' }], moi: 1 });
    if (url.includes('/biens/evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    return Response.json({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const minutesDe = (el: Element): string[] => {
  const m = el.querySelector('[data-minute]') as HTMLElement;
  flushSync(() => m.click());
  const l = [...m.closest('.lch')!.querySelectorAll('li[data-option]')].map((x) => x.getAttribute('data-option') ?? '');
  flushSync(() => m.click());
  return l;
};
const ligne = async (t: Tache) => {
  await act(async () => { root.render(createElement(LigneTache, { tache: t, maintenant: new Date('2026-11-18T10:00:00Z'), deplie: true, onDetail: () => {} })); }); await calmer();
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.includes('Décaler')) as HTMLButtonElement;
  await act(async () => { b.click(); }); await calmer();
};

describe('🔴 le décalage', () => {
  it('un rendez-vous de préavis : l’heure (00 à 23) et les minutes 00, 15, 30, 45 seulement ; 09h53 n’est pas repris (la minute est à choisir)', async () => {
    await ligne({ ...base, rdvPreavis: true, minutesRdv: [0, 15, 30, 45] } as Tache);
    const h = container.querySelector('.tch-decaler [data-decaler-heure]')!;
    expect(h).not.toBeNull();
    expect(container.querySelector('.tch-decaler input[type="time"]')).toBeNull();
    expect(minutesDe(h)).toEqual(['', '00', '15', '30', '45']);
    expect(h.querySelector('[data-heure]')?.getAttribute('data-valeur')).toBe('09');
    expect(h.getAttribute('data-valeur')).toBe('');
  });
  it('une autre tâche : le champ d’heure de toujours (libre)', async () => {
    await ligne({ ...base, objet: 'Appeler le syndic' });
    expect(container.querySelector('.tch-decaler input[type="time"]')).not.toBeNull();
    expect(container.querySelector('.tch-decaler [data-choix-heure]')).toBeNull();
  });
});

describe('🔴 la fenêtre de la tâche', () => {
  it('un rendez-vous de préavis : heure + minutes du réglage, et la minute d’origine (09h53 tel quel tant qu’on ne le change pas)', async () => {
    detail = { ...base, rdvPreavis: true, minutesRdv: [0, 15, 30, 45] } as Tache;
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 41 }, onFermer: () => {} })); }); await calmer(); await calmer();
    const c = container.querySelector('[data-champ-heure][data-choix-heure]')!;
    expect(c).not.toBeNull();
    expect(c.getAttribute('data-valeur')).toBe('09:53');
    expect(minutesDe(c)).toEqual(['', '00', '15', '30', '45', '53']);
  });
  it('une autre tâche : le champ d’heure de toujours', async () => {
    detail = { ...base, objet: 'Appeler le syndic' };
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 41 }, onFermer: () => {} })); }); await calmer(); await calmer();
    expect(container.querySelector('input[type="time"][data-champ-heure]')).not.toBeNull();
  });
});
