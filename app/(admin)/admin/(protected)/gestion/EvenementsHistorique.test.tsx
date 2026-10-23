// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EvenementsDuBien } from './EvenementsDuBien';
import { FriseAvancement } from './FriseAvancement';

/**
 * 🔴 Arno (23/10/2026) — FICHE BIEN : CLÔTURE, HISTORIQUE DES ÉVÉNEMENTS, RÉOUVERTURE, avec les vrais composants et des routes
 * simulées (rien n'est écrit) :
 *   · clôture : « Clôture » choisie puis « Valider » → MODALE (mots d'Arno, Annuler / Clôturer) → la carte part ;
 *   · un événement clos quitte la liste (sa frise disparaît) et vit dans « Historique des événements (N) », replié ; déplié :
 *     intitulé, type, périodes, réouvertures ; ouvert : ses périodes (qui, quand) et sa frise COMPLÈTE en lecture seule ;
 *   · « Rouvrir » → modale → une carte « Réouverture » (datée du jour par la route) → la fiche se relit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps }) as unknown as Response;

const PERIODES_CLOS = [
  { du: '2026-03-01T09:00:00+01:00', au: '2026-04-02T12:00:00+02:00', ouvertLe: '2026-03-01T09:00:00+01:00', ouvertPar: 'arno@exemple.test', ouvertSource: 'evenement',
    closLe: '2026-04-02T17:24:00+02:00', closPar: 'lea@exemple.test', closSource: 'manuelle' },
  { du: '2026-06-05T12:00:00+02:00', au: '2026-07-01T12:00:00+02:00', ouvertLe: '2026-06-05T08:10:00+02:00', ouvertPar: 'arno@exemple.test', ouvertSource: 'manuelle',
    closLe: '2026-07-01T18:00:00+02:00', closPar: 'arno@exemple.test', closSource: 'manuelle' },
];
const OUVERT = { id: 1, reference: 'GES-2026-000001', objet: 'Fuite salle de bains', etat: 'en_cours', ouvertLe: '2026-09-23T22:23:23+02:00', traiteLe: null,
  closLe: null, clos: false, nbEtapes: 1, derniereEtapeType: null, derniereEtapeLe: null, mongaRefs: [], urgence: null, categorie: 'fuite_eau',
  periodes: [{ du: '2026-09-23T22:23:23+02:00', au: null }] };
const CLOS = { id: 2, reference: 'GES-2026-000002', objet: 'Volet roulant bloqué', etat: 'traite', ouvertLe: '2026-03-01T09:00:00+01:00', traiteLe: null,
  closLe: '2026-07-01T12:00:00+02:00', clos: true, nbEtapes: 3, derniereEtapeType: 'cloture', derniereEtapeLe: '2026-07-01T12:00:00+02:00', mongaRefs: [], urgence: null,
  categorie: 'travaux', periodes: PERIODES_CLOS };
const ETAPE = (id: number, type: string, survenuLe: string) => ({ id, reference: null, type, survenuLe, heureConnue: false, heureFin: null, numero: null, rang: null,
  montantCents: type === 'devis_recu' ? 88500 : null, texte: 'Commentaire de la carte', auteur: null, source: 'manuelle', certitude: 'fiable', messageId: null,
  aEuUnMail: false, filId: null, creeParLibelle: 'arno@exemple.test', rangDevis: null, creeLe: survenuLe, rangPose: id, poseChoisie: false, jourConnu: true, titre: null, pieceNom: null });

let container: HTMLDivElement;
let root: Root;
let evenements: unknown[];
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  appels = []; evenements = [OUVERT, CLOS];
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, init });
    if (u.startsWith('/api/admin/gestion/biens/evenements')) return json({ etat: 'ok', evenements });
    if (u.endsWith('/frise') && init?.method === 'POST') return json({ etat: 'ok', message: 'Carte posée.', etatEvenement: 'en_cours' });
    if (u.includes('/evenements/2/frise')) return json({ etat: 'ok', ouvert: false, ouvertLe: '2026-03-01T09:00:00+01:00',
      etapes: [ETAPE(21, 'devis_recu', '2026-03-10T12:00:00+01:00'), ETAPE(22, 'cloture', '2026-04-02T12:00:00+02:00'),
        ETAPE(23, 'reouverture', '2026-06-05T12:00:00+02:00'), ETAPE(24, 'cloture', '2026-07-01T12:00:00+02:00')] });
    if (u.includes('/frise')) return json({ etat: 'ok', ouvert: true, ouvertLe: '2026-09-23T22:23:23+02:00', etapes: [] });
    return json({ etat: 'ok' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const clic = async (e: Element | null) => { if (!e) throw new Error('absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) ?? null;
const rendreBloc = async () => { await act(async () => { root.render(createElement(EvenementsDuBien, { lotCle: '219' })); }); await attendre(); };

describe('🔴 la clôture : une modale, avec les mots d’Arno', () => {
  it('« Clôture » puis « Valider » → la modale ; « Annuler » ne pose rien ; « Clôturer » pose la carte', async () => {
    await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 1 })); }); await attendre();
    await clic(q('.fav-carre--plus'));
    await clic([...document.querySelectorAll('.fav-reservoir button')].find((b) => /Clôture/.test(b.textContent ?? '')) ?? null);
    await clic(bouton('Valider'));
    const modale = q('.mis-boite');
    expect(modale?.textContent).toContain('Clôturer cet événement ?');
    expect(modale?.textContent).toContain('Cet événement sera clôturé. Sa frise disparaîtra de la fiche, ainsi que son rappel / suivi dans le bloc « Événements » de la page partagée. Il restera consultable dans l’Historique des événements.');
    await clic(q('[data-annuler-carte-borne]'));
    expect(q('.mis-boite')).toBeNull();
    expect(appels.filter((a) => a.init?.method === 'POST')).toHaveLength(0);
    await clic(bouton('Valider'));
    await clic(q('[data-confirmer-carte-borne]'));
    const posts = appels.filter((a) => a.init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('/api/admin/gestion/evenements/1/frise');
    expect(JSON.parse(String(posts[0].init?.body))).toMatchObject({ type: 'cloture' });
  });
});

describe('🔴 la fiche : un événement clos quitte la liste et vit dans l’Historique des événements', () => {
  it('la liste ne garde que l’événement en cours (sa frise) ; le compteur dit les en cours ; l’Historique est replié', async () => {
    await rendreBloc();
    expect(q('#evb-titre')?.textContent).toBe('Événements 1');
    expect([...container.querySelectorAll('.evb-liste:not(.evb-liste--histo) > .evb-item .evb-ref')].map((e) => e.textContent)).toEqual(['GES-2026-000001']);
    expect(q('[data-historique-evenements] .evb-histo-tete')?.textContent).toBe('▶Historique des événements (1)');
    expect(q('[data-evenement-historique]')).toBeNull();
  });

  it('déplié : intitulé, type, périodes, réouvertures ; ouvert : qui a clos et quand, et la frise COMPLÈTE en lecture seule', async () => {
    await rendreBloc();
    await clic(q('.evb-histo-tete'));
    const ligne = q('[data-evenement-historique="2"]')!;
    expect(ligne.querySelector('.evb-objet')?.textContent).toBe('Volet roulant bloqué');
    expect(ligne.querySelector('[data-type-evenement]')?.textContent).toBe('Travaux');
    expect(ligne.querySelector('[data-periodes]')?.textContent).toBe('du 01/03/2026 au 02/04/2026 · du 05/06/2026 au 01/07/2026');
    expect(ligne.querySelector('[data-reouvertures]')?.textContent).toBe('1 réouverture');
    await clic(ligne.querySelector('.evb-tete'));
    expect([...ligne.querySelectorAll('[data-liste-periodes] li')].map((l) => l.textContent)).toEqual([
      'Période 1 — du 01/03/2026 au 02/04/2026 : ouvert le 01/03/2026 à 09:00 par arno@exemple.test, clos le 02/04/2026 à 17:24 par lea@exemple.test.',
      'Période 2 — du 05/06/2026 au 01/07/2026 : rouvert le 05/06/2026 à 08:10 par arno@exemple.test, clos le 01/07/2026 à 18:00 par arno@exemple.test.',
    ]);
    const frise = ligne.querySelector('[data-lecture-seule="oui"]')!;
    expect(frise).not.toBeNull();
    expect(frise.querySelectorAll('.fav-el--carre').length).toBeGreaterThanOrEqual(4);   // toute la frise est là
    // Rien ne s'y écrit : ni « + », ni intercalaire, ni crayon, ni poignée.
    expect(frise.querySelectorAll('.fav-carre--plus, .fav-entre, .fav-poignee').length).toBe(0);
    expect([...frise.querySelectorAll('button')].some((b) => b.textContent === '✎')).toBe(false);
  });

  it('« Rouvrir » → modale ; « Rouvrir » pose une carte Réouverture (datée du jour par la route) et la fiche se relit', async () => {
    const etat = vi.fn();
    await act(async () => { root.render(createElement(EvenementsDuBien, { lotCle: '219', onEtatEvenement: etat })); }); await attendre();
    await clic(q('.evb-histo-tete'));
    await clic(q('[data-evenement-historique="2"] .evb-tete'));
    await clic(q('[data-rouvrir="2"]'));
    expect(q('.mis-boite')?.textContent).toContain('Une nouvelle période commencera aujourd’hui.');
    const lectures = () => appels.filter((a) => a.url.startsWith('/api/admin/gestion/biens/evenements')).length;
    const avant = lectures();
    evenements = [OUVERT, { ...CLOS, clos: false, closLe: null, periodes: [...PERIODES_CLOS, { du: '2026-10-23T12:00:00+02:00', au: null }] }];
    await clic(q('[data-confirmer-rouvrir]'));
    const post = appels.find((a) => a.init?.method === 'POST' && a.url.endsWith('/frise'))!;
    expect(post.url).toBe('/api/admin/gestion/evenements/2/frise');
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ type: 'reouverture' });
    expect(JSON.parse(String(post.init?.body))).not.toHaveProperty('survenuLe');   // la date : celle du jour, posée par la route
    expect(lectures()).toBe(avant + 1);
    expect(etat).toHaveBeenCalled();
    // Rouvert : il revient dans la liste des en cours, et l'Historique ne le porte plus.
    expect(q('#evb-titre')?.textContent).toBe('Événements 2');
    expect(q('[data-historique-evenements]')).toBeNull();
  });
});
