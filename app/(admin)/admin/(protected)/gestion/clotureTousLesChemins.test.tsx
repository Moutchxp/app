// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';

/**
 * 🔴 Arno (23/10/2026) — « Passer un événement à l'étape “Clôture”, PAR QUELQUE CHEMIN QUE CE SOIT […], déclenche la MÊME
 * clôture : d'abord la modale de confirmation […] Annuler : rien ne change. » Les chemins de la frise qui y échappaient,
 * éprouvés avec le vrai composant et des routes simulées (rien n'est écrit) :
 *   ① CONFIRMER (✓) une Clôture venue de Monga « à confirmer » ;
 *   ② MODIFIER une carte en changeant son type en « Clôture » ;
 *   ③ RETIRER une Réouverture dont le retrait remet l'événement à « Clôture ».
 * La carte neuve (« + » → Clôture → Valider) est éprouvée par `EvenementsHistorique.test.tsx`.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps }) as unknown as Response;
const PHRASE = 'Cet événement sera clôturé. Sa frise disparaîtra de la fiche, ainsi que son rappel / suivi dans le bloc « Événements » de la page partagée. Il restera consultable dans l’Historique des événements.';

const ETAPE = (id: number, type: string, survenuLe: string, plus: Record<string, unknown> = {}) => ({
  id, reference: null, type, survenuLe, heureConnue: false, heureFin: null, numero: null, rang: null,
  montantCents: null, texte: null, auteur: null, source: 'manuelle', certitude: 'fiable', messageId: null,
  aEuUnMail: false, filId: null, creeParLibelle: 'arno@exemple.test', rangDevis: null, creeLe: survenuLe, rangPose: id,
  poseChoisie: false, jourConnu: true, titre: null, pieceNom: null, ...plus,
});

let container: HTMLDivElement;
let root: Root;
let etapes: unknown[];
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  appels = [];
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, init });
    if (init?.method === 'PATCH' || init?.method === 'DELETE') return json({ etat: 'ok', message: 'Fait.', etatEvenement: 'traite' });
    if (u.includes('/frise')) return json({ etat: 'ok', ouvert: true, ouvertLe: '2026-01-05T09:00:00+01:00', etapes });
    return json({ etat: 'ok' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const clic = async (e: Element | null | undefined) => { if (!e) throw new Error('absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const bouton = (texte: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) ?? null;
const ecritures = () => appels.filter((a) => a.init?.method === 'PATCH' || a.init?.method === 'DELETE' || a.init?.method === 'POST');
const rendre = async () => { await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 1 })); }); await attendre(); };
const modaleDeCloture = () => {
  const m = q('.mis-boite');
  expect(m?.textContent).toContain('Clôturer cet événement ?');
  expect(m?.textContent).toContain(PHRASE);
};

describe('🔴 ① confirmer (✓) une Clôture venue de Monga', () => {
  it('✓ → la modale ; Annuler → rien n’est envoyé ; Clôturer → la confirmation part', async () => {
    etapes = [ETAPE(31, 'cloture', '2026-02-10T12:00:00+01:00', { source: 'monga', certitude: 'a_confirmer', reference: 'MNG-1' })];
    await rendre();
    await clic(q('button[title="Confirmer cette étape"]'));
    modaleDeCloture();
    await clic(q('[data-annuler-carte-borne]'));
    expect(q('.mis-boite')).toBeNull();
    expect(ecritures()).toHaveLength(0);
    await clic(q('button[title="Confirmer cette étape"]'));
    await clic(q('[data-confirmer-carte-borne]'));
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].url).toBe('/api/admin/gestion/etapes/31');
    expect(JSON.parse(String(ecritures()[0].init?.body))).toEqual({ geste: 'confirmer' });
  });

  it('confirmer une étape qui n’est pas une Clôture ne demande rien (aucune modale apprise pour rien)', async () => {
    etapes = [ETAPE(32, 'devis_recu', '2026-02-10T12:00:00+01:00', { source: 'monga', certitude: 'a_confirmer', reference: 'MNG-1' })];
    await rendre();
    await clic(q('button[title="Confirmer cette étape"]'));
    expect(q('.mis-boite')).toBeNull();
    expect(ecritures()).toHaveLength(1);
  });
});

describe('🔴 ② modifier une carte : son type devient « Clôture »', () => {
  const choisirLeType = async (t: string) => {
    const s = q('#fav-type') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, t);
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await attendre();
  };
  it('✎ → type « Clôture » → Enregistrer → la modale ; Annuler → rien ; Clôturer → la modification part', async () => {
    etapes = [ETAPE(41, 'devis_recu', '2026-02-10T12:00:00+01:00')];
    await rendre();
    await clic(bouton('✎'));
    await choisirLeType('cloture');
    await clic(bouton('Enregistrer'));
    modaleDeCloture();
    await clic(q('[data-annuler-carte-borne]'));
    expect(ecritures()).toHaveLength(0);
    await clic(bouton('Enregistrer'));
    await clic(q('[data-confirmer-carte-borne]'));
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].url).toBe('/api/admin/gestion/etapes/41');
    expect(JSON.parse(String(ecritures()[0].init?.body))).toMatchObject({ geste: 'modifier', type: 'cloture' });
  });

  it('modifier une carte sans changer son type ne demande rien', async () => {
    etapes = [ETAPE(42, 'devis_recu', '2026-02-10T12:00:00+01:00')];
    await rendre();
    await clic(bouton('✎'));
    await clic(bouton('Enregistrer'));
    expect(q('.mis-boite')).toBeNull();
    expect(ecritures()).toHaveLength(1);
  });
});

describe('🔴 ③ retirer une Réouverture qui remettrait l’événement à « Clôture »', () => {
  it('Retirer → la modale ; Annuler → rien ; Clôturer → le retrait part', async () => {
    etapes = [ETAPE(51, 'cloture', '2026-03-01T12:00:00+01:00'), ETAPE(52, 'reouverture', '2026-06-01T12:00:00+02:00')];
    await rendre();
    const carre = [...document.querySelectorAll('.fav-el--carre')].find((el) => /Réouverture/.test(el.textContent ?? ''));
    await clic(carre?.querySelector('button.fav-carre-clic'));
    await clic(bouton('Retirer'));
    modaleDeCloture();
    await clic(q('[data-annuler-carte-borne]'));
    expect(ecritures()).toHaveLength(0);
    await clic(bouton('Retirer'));
    await clic(q('[data-confirmer-carte-borne]'));
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].url).toBe('/api/admin/gestion/etapes/52');
    expect(ecritures()[0].init?.method).toBe('DELETE');
  });

  it('retirer une carte ordinaire ne demande rien', async () => {
    etapes = [ETAPE(53, 'devis_recu', '2026-03-01T12:00:00+01:00')];
    await rendre();
    const carre = [...document.querySelectorAll('.fav-el--carre')].find((el) => /Devis/.test(el.textContent ?? ''));
    await clic(carre?.querySelector('button.fav-carre-clic'));
    await clic(bouton('Retirer'));
    expect(q('.mis-boite')).toBeNull();
    expect(ecritures()).toHaveLength(1);
  });
});
