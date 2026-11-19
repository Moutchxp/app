// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';
import type { Tache } from '../../../../lib/gestion/taches';

/**
 * 🔴🔴 Arno (19/11/2026) — ANNULER DEPUIS LA FENÊTRE DE LA TÂCHE : UNE seule fenêtre (l'étape « Confirmer l'annulation / Ne pas annuler » du pied
 * est fusionnée dedans) : la phrase, les personnes prévenues, « Confirmer l'annulation » / « Ne pas annuler » ; puis la confirmation habituelle.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const T = {
  id: 41, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite', note: null, jour: '2099-01-06', heure: '10:00',
  rappels: [], etat: 'a_faire', confieeA: 1, confieeALibelle: 'Arno Jorel', creeLe: '2026-11-18T10:00:00Z', creeParLibelle: 'Arno Jorel', majLe: '2026-11-18T10:00:00Z',
  faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, nbPieces: 0, creePar: 1, acceptation: null, sorte: 'rdv', dureeMinutes: 30,
} as unknown as Tache;
let gestes: unknown[] = []; let fermee = 0;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  gestes = []; fermee = 0;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    if (/\/taches\/41$/.test(url) && init?.method === 'PATCH') { gestes.push(JSON.parse(String(init.body))); return Response.json({ etat: 'ok', id: 41, message: 'La tâche « Visite » est annulée : elle n’apparaît plus dans l’interface. 1 personne a été prévenue par mail.' }); }
    if (/\/taches\/41$/.test(url)) return Response.json({ etat: 'ok', tache: T, traces: [], contacts: [], pieces: [] });
    if (url.includes('/taches/apercu')) return Response.json({ etat: 'ok', total: 1, collaborateurs: [{ libelle: 'Cédric JULLIEN', mail: true, motif: null }], exterieurs: [],
      texteCollaborateur: null, texteExterieur: null, editions: [],
      annulation: { phrase: 'La tâche disparaîtra de l’interface et les personnes ayant accepté le rendez-vous seront prévenues par mail.', locataires: [], motifLocataires: null } });
    if (url.includes('/taches/collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 1, libelle: 'Arno Jorel' }], moi: 1 });
    if (url.includes('/biens/evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    return Response.json({});
  }));
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };

describe('🔴 une seule fenêtre pour annuler, depuis la fenêtre de la tâche', () => {
  it('« Annuler la tâche » ouvre la fenêtre (phrase, personnes prévenues, « Confirmer l’annulation » / « Ne pas annuler ») ; plus d’étape dans le pied', async () => {
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 41 }, onFermer: () => { fermee += 1; } })); }); await calmer(); await calmer();
    await clic(container.querySelector('[data-annuler-tache]'));
    expect([...container.querySelectorAll('.tchf-pied button')].map((b) => b.textContent)).not.toContain('Confirmer l’annulation');
    const f = document.querySelector('[data-fenetre-envois="recap"]')!;
    expect(f.querySelector('[data-phrase-annulation]')?.textContent).toBe('La tâche disparaîtra de l’interface et les personnes ayant accepté le rendez-vous seront prévenues par mail.');
    expect([...f.querySelectorAll('[data-recap-collaborateurs] li')].map((l) => l.textContent)).toEqual(['Cédric JULLIEN — mail d’annulation']);
    expect(f.querySelector('[data-confirmer-recap]')?.textContent).toBe('Confirmer l’annulation');
    expect(f.querySelector('[data-revenir-recap]')?.textContent).toBe('Ne pas annuler');
    await clic(f.querySelector('[data-revenir-recap]'));
    expect(gestes).toEqual([]);
    await clic(container.querySelector('[data-annuler-tache]'));
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(gestes).toEqual([{ geste: 'annuler' }]);
    expect(document.querySelector('[data-modale-confirmation] [data-phrase-confirmation]')?.textContent).toContain('est annulée : elle n’apparaît plus dans l’interface');
    await clic(document.querySelector('[data-ok-confirmation]'));
    expect(fermee).toBe(1);
  });
});
