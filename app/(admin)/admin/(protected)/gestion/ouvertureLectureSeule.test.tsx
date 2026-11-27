// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';
import { ChampsEvenement } from './BlocEvenement';
import { MOT_OUVERTURE_CREATION_COURT } from '../../../../lib/gestion/ouvertureEvenement';

/**
 * 🔴 Arno (23/10/2026, option A, accord explicite pour ce champ) — la carte « Ouverture » affiche sa date en LECTURE SEULE, avec
 * « Pour une date à venir, ajoutez une carte RDV intervention. » et un lien qui ouvre DIRECTEMENT l'ajout d'une carte RDV
 * intervention ; le formulaire de création n'a plus de champ de date d'ouverture. Vrais composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let ouvert: boolean;
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  ouvert = true; appels = [];
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    if (String(url).includes('/frise')) return json({ etat: 'ok', ouvert, ouvertLe: '2026-10-23T09:12:00+02:00', etapes: [] });
    return json({ etat: 'ok' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const attendre = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const rendre = async (props: Record<string, unknown> = {}) => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 10, ...props })); });
  await attendre();
};

describe('🔴 la carte Ouverture : date en lecture seule, aide et lien vers RDV intervention', () => {
  it('la date s’affiche, sans champ ni bouton pour la corriger', async () => {
    await rendre();
    const carte = q('[data-ouverture-lecture]')!;
    expect(carte.textContent).toContain('23/10/2026');
    expect(carte.tagName).toBe('SPAN');   // ni bouton, ni champ
    expect(document.querySelector('input[aria-label="Date d’ouverture"]')).toBeNull();
    expect(document.querySelector('[title="Corriger la date d’ouverture de l’événement"]')).toBeNull();
  });
  /** 🔴 (décision d'Arno du 27/11/2026) le lien « Ajouter une carte RDV intervention » et sa phrase, sous la carte Ouverture, sont RETIRÉS. */
  it('sous la carte Ouverture : ni la phrase « Pour une date à venir… », ni le lien ; ouvert, clos ou en lecture seule', async () => {
    for (const [o, props] of [[true, {}], [false, {}], [true, { lectureSeule: true }]] as const) {
      ouvert = o;
      await rendre(props);
      expect([q('[data-aide-ouverture]'), q('[data-lien-rdv]')]).toEqual([null, null]);
      expect(document.body.textContent).not.toContain('Pour une date à venir');
      expect(document.body.textContent).not.toContain('Ajouter une carte RDV intervention');
      expect(q('[data-ouverture-lecture]')).not.toBeNull();
      act(() => root.unmount()); root = createRoot(container);
    }
  });
  it('la carte RDV intervention reste proposée par le « + » de la frise, inchangée : la choisir ouvre son ajout, rien n’est écrit', async () => {
    await rendre();
    const plus = [...document.querySelectorAll('button[aria-label="Ajouter une étape ou une information"]')].at(-1) as HTMLButtonElement;
    await act(async () => { plus.click(); });
    await attendre();
    const rdv = q('[data-carte-grille="rdv_intervention"]') as HTMLButtonElement;
    expect(rdv).not.toBeNull();
    await act(async () => { rdv.click(); });
    await attendre();
    expect((q('#fav-type') as HTMLSelectElement).value).toBe('rdv_intervention');
    expect(appels.filter((a) => a.init?.method && a.init.method !== 'GET')).toHaveLength(0);
  });
});

describe('🔴 le formulaire de création : plus de champ de date d’ouverture, la clôture reste', () => {
  const props = {
    titre: 'T', onTitre: () => {}, categorie: '', onCategorie: () => {}, urgence: '', onUrgence: () => {}, qualifieDisponible: true,
    libellesDesBiens: [], closLe: '', onClosLe: () => {}, note: '', onNote: () => {},
  };
  for (const enBlocs of [false, true]) {
    it(`mise en page ${enBlocs ? 'en blocs (fenêtre du mail)' : 'simple (encart)'} : une seule saisie de date, la clôture`, async () => {
      await act(async () => { root.render(createElement(ChampsEvenement, { ...props, enBlocs })); });
      const dates = [...container.querySelectorAll('input[type="date"]')];
      expect(dates).toHaveLength(1);
      expect(dates[0].closest('label')?.textContent).toContain('Date de clôture (facultative)');
      expect(container.querySelector('[data-ouverture-auto]')?.textContent).toBe(`Date d’ouverture${MOT_OUVERTURE_CREATION_COURT}`);
    });
  }
});

/** 🔴🔴 Arno (27/11/2026, 09h48) — « le nom de celui ou celle qui a ouvert l'événement doit être écrit sous le bloc d'ouverture avec la date d'ouverture ». */
describe('sous la carte Ouverture : « Ouvert par Prénom NOM le JJ/MM/AAAA »', () => {
  const avec = (ouvreur: unknown) => {
    global.fetch = vi.fn(async (url: string) => (String(url).includes('/frise')
      ? json({ etat: 'ok', ouvert: true, ouvertLe: '2026-10-23T09:12:00+02:00', ouvreur, etapes: [] }) : json({ etat: 'ok' }))) as unknown as typeof fetch;
  };
  it('un utilisateur, automatique, non renseigné ; le lien « Ajouter une carte RDV intervention » reste en place', async () => {
    avec({ sorte: 'utilisateur', cle: 'u2', nom: 'Arnaud JOREL' });
    await rendre();
    expect(q('[data-ouvert-par]')?.textContent).toBe('Ouvert par Arnaud JOREL le 23/10/2026');
    expect(q('[data-lien-rdv]')).toBeNull(); // (27/11/2026) le lien est retiré
    act(() => root.unmount()); root = createRoot(container);
    avec({ sorte: 'automatique', cle: 'auto' });
    await rendre();
    expect(q('[data-ouvert-par]')?.textContent).toBe('Ouvert automatiquement le 23/10/2026');
    act(() => root.unmount()); root = createRoot(container);
    avec(null);
    await rendre();
    expect(q('[data-ouvert-par]')?.textContent).toBe('Ouvert le 23/10/2026 — par : non renseigné');
  });
  it('une réponse d’avant (sans le champ) : aucune ligne inventée', async () => {
    await rendre();
    expect(q('[data-ouvert-par]')).toBeNull();
  });
});
