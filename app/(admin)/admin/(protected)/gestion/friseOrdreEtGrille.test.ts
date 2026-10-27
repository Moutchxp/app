// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';
import { cartesDuReservoir } from '../../../../lib/gestion/mongaEtape';
import { MOT_BORNE_NON_TRANSFORMABLE } from '../../../../lib/gestion/correctionEtape';
import { motDateAvantDernier } from '../../../../lib/gestion/frise';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE (Arno, 27/10/2026) — LES GESTES À L'ÉCRAN. Les VRAIS composants, route simulée. ═══════════════════════════════
 *   · la grille de « Transformer en étape » (bulle ET panneau de correction) est celle du « + » : mêmes cartes, même ordre, même style ;
 *   · « Clôture » choisie dans la grille ouvre le parcours de clôture du « + » (formulaire, modale, POST de la frise) ;
 *   · « Transformer en point d'information » depuis une carte (date, titre, mail gardés) ; sur une borne, une bulle dit pourquoi ;
 *   · une carte posée au bout ne se date pas avant le dernier élément de la frise.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Etape = Record<string, unknown>;
const etape = (id: number, p: Etape = {}): Etape => ({ id, reference: 'MNG-20922', type: 'commentaire', survenuLe: '2026-10-23 10:00:00', heureConnue: true, jourConnu: true,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: `commentaire ${id}`, auteur: 'Jean-Baptiste PONS', source: 'monga', certitude: 'confirmee',
  statut: 'vif', messageId: 900 + id, messageCle: `cle-${id}`, aEuUnMail: true, filId: 50, pieceNom: null, creeParLibelle: null, creeLe: '2026-10-23 10:00:05', titre: null,
  rangPose: null, poseChoisie: false, rangDevis: null, expediteurNom: 'Monga Support', expediteurAdresse: 'support@monga.fr', ...p });

let container: HTMLDivElement; let root: Root;
let appels: { url: string; methode: string; corps: unknown }[]; let etapes: Etape[]; let ouvert: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; ouvert = true;
  etapes = [
    etape(1, { type: 'ouverture', survenuLe: '2026-10-23 09:12:00', certitude: 'a_confirmer', texte: null }),
    etape(2), etape(3, { survenuLe: '2026-10-24 11:00:00', creeLe: '2026-10-24 11:00:05' }),
    etape(9, { type: 'devis_recu', source: 'manuelle', reference: null, messageId: null, messageCle: null, aEuUnMail: false, filId: null,
      survenuLe: '2026-10-25 12:00:00', creeLe: '2026-10-25 12:00:05', rangPose: 1, texte: null }),
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== undefined && init.method !== 'GET') { appels.push({ url, methode: init.method, corps: JSON.parse(String(init.body ?? 'null')) }); return Response.json({ etat: 'ok' }); }
    return Response.json({ etat: 'ok', ouvert, ouvertLe: '2026-10-23 09:12:00+02', typesAjoutables: [], passagesEnFiableProposes: [], correction: true, etapes, taches: [] });
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 37, onOuvrirFil: () => {} })); });
  await calmer();
};
const cliquer = async (b: Element | null) => { expect(b).not.toBeNull(); await act(async () => { (b as HTMLButtonElement).click(); }); await calmer(); };
const point = (id: number) => container.querySelector(`.fav-point[data-carte="${id}"]`);
const grille = (porte: 'ajout' | 'transformer') => [...container.querySelectorAll(`[data-grille-cartes="${porte}"] [data-carte-grille]`)];
const signature = (b: Element) => `${b.getAttribute('data-carte-grille')}|${b.className}|${b.textContent}`;
const menuDe = (id: number) => container.querySelector(`li[data-carte="${id}"] .fav-pictos button[aria-label^="Détail"]`);
const champ = (el: HTMLInputElement, v: string) => {
  const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (x: string) => void;
  poser.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('🔴🔴 l’ordre affiché : l’Ouverture d’abord, la carte posée à la main après les points de la relève', () => {
  it('Ouverture, puis les points Monga, puis la carte (rang 1) — rien avant l’Ouverture', async () => {
    await monter();
    const suite = [...container.querySelectorAll('.fav-piste [data-carte]')].map((e) => e.getAttribute('data-carte'));
    expect(suite).toEqual(['1', '2', '3', '9']);
  });
});

describe('🔴🔴 B1 — la MÊME grille au « + » et à la transformation', () => {
  it('bulle d’un point : mêmes cartes, même ordre, même style que « Ajouter une carte »', async () => {
    await monter();
    await cliquer(container.querySelector('.fav-carre--plus'));
    const ajout = grille('ajout').map(signature);
    expect(ajout.map((s) => s.split('|')[0])).toEqual(cartesDuReservoir(true));
    // La forme « Étape (carré) / Simple information (point) » reste dans le panneau du « + » (B4).
    expect(container.querySelector('.fav-reservoir')?.textContent).toContain('Simple information (point)');
    await cliquer([...container.querySelectorAll('.fav-reservoir .fav-btn')].find((b) => b.textContent === 'Fermer') ?? null);
    await cliquer(point(2));
    await cliquer(container.querySelector('.fav-zone [data-transformer-en-etape="2"]'));
    expect(grille('transformer').map(signature)).toEqual(ajout);
    // « Annuler » referme la grille sans rien écrire.
    await cliquer([...container.querySelectorAll('.fav-zone .fav-bulle [data-liste-transformer="2"] .fav-btn')].find((b) => b.textContent === 'Annuler') ?? null);
    expect(container.querySelector('.fav-zone .fav-bulle [data-liste-transformer]')).toBeNull();
    expect(appels).toEqual([]);
  });

  it('panneau « Corriger ce point d’information » : « Transformer en carte d’étape » ouvre la même grille, le choix transforme', async () => {
    await monter();
    await cliquer(point(3));
    await cliquer(container.querySelector('[data-panneau-transformer-en-carte="3"]'));
    const dansLePanneau = [...container.querySelectorAll('.pce [data-grille-cartes="transformer"] [data-carte-grille]')];
    expect(dansLePanneau.map((b) => b.getAttribute('data-carte-grille'))).toEqual(cartesDuReservoir(true));
    await cliquer(dansLePanneau.find((b) => b.getAttribute('data-carte-grille') === 'rapport') ?? null);
    expect(appels).toEqual([{ url: '/api/admin/gestion/etapes/3/correction', methode: 'PATCH', corps: { geste: 'corriger', type: 'rapport', titre: null, jour: '2026-10-24' } }]);
  });

  it('« Carte libre » : titre à saisir (prérempli du nom du point), puis la transformation', async () => {
    await monter();
    await cliquer(point(2));
    await cliquer(container.querySelector('.fav-zone [data-transformer-en-etape="2"]'));
    await cliquer(container.querySelector('.fav-zone .fav-bulle [data-carte-grille="autre"]'));
    const saisie = container.querySelector('[data-titre-carte-libre="2"] input') as HTMLInputElement;
    expect(saisie.value).toBe('Commentaire Monga');
    await act(async () => { champ(saisie, 'Passage du syndic'); });
    await cliquer([...container.querySelectorAll('[data-titre-carte-libre="2"] button')].find((b) => b.textContent === 'Transformer en carte libre') ?? null);
    expect(appels.at(-1)).toEqual({ url: '/api/admin/gestion/etapes/2/correction', methode: 'PATCH', corps: { geste: 'corriger', type: 'autre', titre: 'Passage du syndic', jour: '2026-10-23' } });
  });
});

describe('🔴🔴 B2 — « Clôture » dans la grille : le parcours de clôture du « + »', () => {
  it('le formulaire de la Clôture, puis la modale, puis le POST de la frise — aucune correction du point', async () => {
    await monter();
    await cliquer(point(2));
    await cliquer(container.querySelector('.fav-zone [data-transformer-en-etape="2"]'));
    await cliquer(container.querySelector('.fav-zone .fav-bulle [data-carte-grille="cloture"]'));
    expect(container.querySelector('.fav-reservoir .fav-ajout-titre')?.textContent).toBe('Ajouter — Clôture');
    await cliquer([...container.querySelectorAll('.fav-reservoir .fav-btn')].find((b) => b.textContent === 'Valider') ?? null);
    expect(appels).toEqual([]);
    await cliquer(document.querySelector('[data-repere="confirmer-carte-borne"], [data-modale-action="confirmer-carte-borne"]')
      ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Clôturer') ?? null);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ url: '/api/admin/gestion/evenements/37/frise', methode: 'POST', corps: { type: 'cloture' } });
  });
});

describe('🔴🔴 B3 — « Transformer en point d’information » depuis une carte', () => {
  it('par le « … » de la carte : la date et le titre (mot de la carte) gardés, nature « Note » pour une carte posée à la main', async () => {
    await monter();
    await cliquer(menuDe(9));
    const b = container.querySelector('.fav-zone .fav-bulle [data-transformer-en-point="9"]');
    expect(b?.textContent).toBe('Transformer en point d’information');
    // Le panneau de correction le porte aussi.
    expect(container.querySelector('.pce [data-transformer-en-point="9"]')).not.toBeNull();
    await cliquer(b);
    expect(appels).toEqual([{ url: '/api/admin/gestion/etapes/9/correction', methode: 'PATCH', corps: { geste: 'corriger', type: 'note', titre: 'Devis reçu', jour: '2026-10-25' } }]);
  });

  it('sur l’Ouverture : le bouton reste visible, et une bulle dit pourquoi — rien n’est envoyé', async () => {
    await monter();
    await cliquer(menuDe(1));
    const b = container.querySelector('.fav-zone .fav-bulle [data-transformer-en-point="1"]');
    expect(b).not.toBeNull();
    await cliquer(b);
    expect(container.querySelector('[data-borne-non-transformable="1"]')?.textContent).toBe(MOT_BORNE_NON_TRANSFORMABLE);
    expect(appels).toEqual([]);
    // Les autres contrôles restent.
    expect(container.querySelector('.fav-zone')?.textContent).toContain('Fermer');
    expect(container.querySelector('.pce')?.textContent).toContain('Retirer de la frise');
    expect(container.querySelector('.pce')?.textContent).toContain('Enregistrer la correction');
  });
});

describe('🔴🔴 A3 — la date d’une carte posée au bout', () => {
  it('une date antérieure au dernier élément est refusée avec la phrase d’Arno ; une date postérieure part', async () => {
    await monter();
    await cliquer(container.querySelector('.fav-carre--plus'));
    await cliquer(container.querySelector('[data-grille-cartes="ajout"] [data-carte-grille="rapport"]'));
    const jour = container.querySelector('#fav-jour') as HTMLInputElement;
    await act(async () => { champ(jour, '2026-10-20'); });
    expect(container.querySelector('.fav-reservoir')?.textContent).toContain(motDateAvantDernier('2026-10-25'));
    const valider = [...container.querySelectorAll('.fav-reservoir .fav-btn')].find((b) => b.textContent === 'Valider') as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    await act(async () => { champ(jour, '2026-10-26'); });
    expect(container.querySelector('.fav-reservoir')?.textContent).not.toContain('ne peut pas être datée avant');
    await cliquer(valider);
    expect(appels).toEqual([expect.objectContaining({ methode: 'POST', corps: expect.objectContaining({ type: 'rapport', survenuLe: '2026-10-26', jourConnu: true }) })]);
  });
});
