// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauTaches } from './TableauTaches';

/**
 * ══ 🔴 LOT GESTION-TACHES-SANS-BIEN — « + Créer une tâche » (module de l'écran partagé ET page pleine : même composant) ══
 * La fenêtre de création s'ouvre SANS bien : contacts saisis à la main, pas de contacts de fiche ; la création part sans
 * bien. Une tâche sans bien s'affiche « Sans bien », sans adresse cliquable.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let envois: Record<string, unknown>[];
let lectures: string[];
let container: HTMLDivElement;
let root: Root;
const SANS_BIEN = {
  id: 31, lotId: null, lotCle: null, adresseBien: '', evenement: null, objet: '_TEST sans bien', note: null, jour: '2026-10-21',
  heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel', creeLe: '', creeParLibelle: '', majLe: '',
  faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0,
};
beforeEach(() => {
  envois = []; lectures = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    lectures.push(url);
    if (init?.method === 'POST') { envois.push(JSON.parse(String(init.body))); return Response.json({ etat: 'ok', id: 32, message: 'Tâche créée.' }); }
    if (url.endsWith('/api/admin/gestion/taches')) return Response.json({ etat: 'ok', taches: [SANS_BIEN], moi: 2, tronque: false });
    if (url.includes('collaborateurs')) return Response.json({ etat: 'ok', moi: 2, collaborateurs: [{ id: 2, libelle: 'Arnaud Jorel', accesGestion: true }] });
    return Response.json({});
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('« + Créer une tâche »', () => {
  it('ouvre la fenêtre SANS bien ; contacts saisis à la main ; la création part sans bien', async () => {
    await act(async () => { root.render(createElement(TableauTaches, { onOuvrirBien: () => {} })); });
    await calmer();
    // La tâche sans bien : « Sans bien », aucune adresse cliquable.
    expect(container.querySelector('[data-tache="31"] .tch-l2-sans-bien')?.textContent).toBe('Sans bien');
    expect(container.querySelector('[data-tache="31"] [data-action="ouvrir-bien"]')).toBeNull();

    await act(async () => { (container.querySelector('[data-action="creer-tache"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(container.querySelector('#tchf-titre')?.textContent).toBe('Nouvelle tâche — sans bien');
    expect(lectures.some((u) => u.includes('/taches/contacts'))).toBe(false); // aucune fiche de bien lue
    expect(container.querySelector('.tchf-contacts-manuels legend')?.textContent).toBe('Contacts de la tâche (saisis à la main)');
    await saisir(container.querySelector('[data-champ-contact="nom"]') as HTMLInputElement, '_TEST M. Dupont');
    await saisir(container.querySelector('[data-champ-contact="telephone"]') as HTMLInputElement, '06 00 00 00 09');
    await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent === '+ Ajouter ce contact') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-contact-nouveau="0"]')?.textContent).toContain('_TEST M. Dupont · 06 00 00 00 09');
    await saisir(container.querySelector('.tchf-corps input[type="text"]') as HTMLInputElement, 'Réunion syndic');
    await act(async () => { ([...container.querySelectorAll('button')].find((b) => b.textContent === 'Créer la tâche') as HTMLButtonElement).click(); });
    await calmer();
    expect(envois).toHaveLength(1);
    expect(envois[0].lotId).toBeNull();
    expect(envois[0]).toMatchObject({ objet: 'Réunion syndic', contactsManuels: [{ nom: '_TEST M. Dupont', qualite: null, telephone: '06 00 00 00 09', email: null }] });
  });
});
