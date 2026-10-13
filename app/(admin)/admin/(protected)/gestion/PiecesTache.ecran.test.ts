// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';

/**
 * LOT TACHES-PIECES-DRIVE — À L'ÉCRAN : « + Pièce jointe (Drive) » entre les contacts et les rappels ; le sélecteur
 * s'ouvre sur le dossier du bien, navigue, remonte ; les fichiers choisis partent avec la tâche ; dans le détail,
 * la pièce s'ouvre dans le Drive (nouvel onglet) et « Retirer » l'enlève de la tâche seulement.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let envois: { method: string; corps: Record<string, unknown> }[];
let lectures: string[];
let container: HTMLDivElement;
let root: Root;
const PDF = 'application/pdf';

beforeEach(() => {
  envois = [];
  lectures = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    if (init?.method && init.method !== 'GET') {
      envois.push({ method: init.method, corps: JSON.parse(String(init.body)) });
      return Response.json({ etat: 'ok', id: 7, message: 'ok' });
    }
    if (url.includes('/taches/drive')) {
      lectures.push(url.split('?')[1]);
      if (url.includes('bien=27')) return Response.json({ etat: 'ok', depart: { id: 'DOSSIER_LOT', nom: '26 - 7 avenue de l’Union' }, message: null });
      if (url.includes('dossier=DOSSIER_LOT')) {
        return Response.json({ etat: 'ok', dossier: { id: 'DOSSIER_LOT', nom: '26 - 7 avenue de l’Union' }, parent: { id: 'PARENT', nom: 'Biens' },
          elements: [
            { id: 'SOUS', nom: 'Bail', typeMime: 'application/vnd.google-apps.folder', dossier: true, modifieLe: null, lien: null },
            { id: 'EDL', nom: 'Etat des lieux.pdf', typeMime: PDF, dossier: false, modifieLe: '2026-09-01T10:00:00Z', lien: 'https://drive/EDL' },
            { id: 'PHOTO', nom: 'Photo.jpg', typeMime: 'image/jpeg', dossier: false, modifieLe: '2026-09-02T10:00:00Z', lien: 'https://drive/PHOTO' },
          ], tronque: false });
      }
      if (url.includes('dossier=SOUS')) {
        return Response.json({ etat: 'ok', dossier: { id: 'SOUS', nom: 'Bail' }, parent: { id: 'DOSSIER_LOT', nom: '26 - 7 avenue de l’Union' },
          elements: [{ id: 'BAIL', nom: 'Bail signé.pdf', typeMime: PDF, dossier: false, modifieLe: null, lien: 'https://drive/BAIL' }], tronque: false });
      }
    }
    if (url.includes('collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 2, libelle: 'Arnaud Jorel', accesGestion: true }], moi: 2 });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    if (url.includes('evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.endsWith('/taches/7')) {
      return Response.json({ etat: 'ok', traces: [], contacts: [],
        tache: { id: 7, lotId: 27, lotCle: '26', adresseBien: 'x', evenement: null, objet: 'Visite', note: null, jour: '2026-10-15',
          heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'A', creeLe: '', creeParLibelle: '', majLe: '',
          faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, nbPieces: 1 },
        pieces: [{ driveId: 'EDL', nom: 'Etat des lieux.pdf', typeMime: PDF, lien: 'https://drive/EDL', ajouteLe: '', ajouteParLibelle: 'A' }] });
    }
    return Response.json({});
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const bouton = (mot: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(mot)) as HTMLButtonElement;

describe('🔴 pièces jointes depuis le Drive', () => {
  it('création : bouton à sa place, ouverture sur le dossier du bien, navigation, remontée, plusieurs fichiers, envoi', async () => {
    await act(async () => {
      root.render(createElement(FenetreTache, { mode: { sorte: 'creer', lotId: 27, lotCle: '26', adresse: 'x' }, onFermer: () => {} }));
    });
    await calmer();
    const texte = container.querySelector('.tchf-corps')?.textContent ?? '';
    expect(texte.indexOf('Contacts de la tâche')).toBeLessThan(texte.indexOf('+ Pièce jointe (Drive)'));
    expect(texte.indexOf('+ Pièce jointe (Drive)')).toBeLessThan(texte.indexOf('Rappels'));

    await act(async () => { bouton('+ Pièce jointe (Drive)').click(); });
    await calmer();
    expect(lectures.slice(0, 2)).toEqual(['bien=27', 'dossier=DOSSIER_LOT']);
    expect(container.querySelector('.sdt-ici')?.textContent).toContain('26 - 7 avenue de l’Union');
    // Icône du type, nom, date de modification.
    const edl = container.querySelector('[data-drive="EDL"]')?.textContent ?? '';
    expect(edl).toContain('📕');
    expect(edl).toContain('Etat des lieux.pdf');
    expect(edl).toContain('01/09/2026');
    await act(async () => { (container.querySelector('[data-drive="EDL"] input') as HTMLInputElement).click(); });
    // Entrer dans un sous-dossier, y choisir un fichier, remonter.
    await act(async () => { (container.querySelector('[data-drive="SOUS"] button') as HTMLButtonElement).click(); });
    await calmer();
    await act(async () => { (container.querySelector('[data-drive="BAIL"] input') as HTMLInputElement).click(); });
    await act(async () => { bouton('↑ Remonter').click(); });
    await calmer();
    expect(container.querySelector('.sdt-ici')?.textContent).toContain('26 - 7 avenue');
    await act(async () => { bouton('Ajouter (2)').click(); });
    expect(container.querySelector('.sdt')).toBeNull();
    expect([...container.querySelectorAll('.tchf-piece')].map((l) => l.getAttribute('data-piece'))).toEqual(['EDL', 'BAIL']);

    const objet = container.querySelector('.tchf input[type="text"]') as HTMLInputElement;
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { poser?.call(objet, 'Visite'); objet.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { bouton('Créer la tâche').click(); });
    await calmer();
    expect(envois).toEqual([expect.objectContaining({ method: 'POST', corps: expect.objectContaining({ pieces: ['EDL', 'BAIL'] }) })]);
  });

  it('détail : la pièce s’ouvre dans le Drive (nouvel onglet) ; « Retirer » l’enlève de la tâche seulement', async () => {
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 7 }, onFermer: () => {} })); });
    await calmer();
    await calmer();
    const lien = container.querySelector('[data-piece="EDL"] a') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('https://drive/EDL');
    expect(lien.getAttribute('target')).toBe('_blank');
    await act(async () => { (container.querySelector('[data-piece="EDL"] button') as HTMLButtonElement).click(); });
    await calmer();
    expect(envois).toEqual([{ method: 'PATCH', corps: { geste: 'retirerPiece', driveId: 'EDL' } }]);
  });
});
