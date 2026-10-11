// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';

/**
 * ══ 🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — LES PUCES DE À / Cc / Cci, TEINTÉES DE LEUR FAMILLE ══════════
 * Dans les composeurs (Nouveau message, Répondre, Écrire depuis gestion@) : la couleur vient de l'ADRESSE, quel que
 * soit le chemin d'ajout (pré-remplie, choisie dans la liste, tapée à la main). Inconnue ⇒ neutre à contour pointillé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
};
const FAMILLES: Record<string, unknown> = {
  'proprio@x.fr': { ton: 'proprietaire', propre: true, nom: 'DUPONT Jean', role: 'Propriétaire' },
  'loc@x.fr': { ton: 'locataire', propre: true, nom: 'ROI Léa', role: 'Locataire' },
  'ancien@x.fr': { ton: 'ancien_locataire', propre: true, nom: 'HIRSCH Thibaut', role: 'Ancien locataire' },
  'garant@x.fr': { ton: 'locataire', propre: false, nom: null, role: 'Contact du locataire' },
  'syndic@x.fr': { ton: 'syndic', propre: true, nom: null, role: 'Syndic — e-mail général · TEST' },
  'gardien@x.fr': { ton: 'immeuble', propre: true, nom: null, role: 'Gardien' },
  'artisan@x.fr': { ton: 'neutre', propre: true, nom: 'Plomberie Martin', role: 'Contact externe' },
};
const BASE = { id: null, citation: null, destinatairesApproximatifs: false, filId: null, corps: '\n\nService Gestion' };
const COMPOSEURS: Array<[string, Partial<BrouillonEcran>]> = [
  ['Nouveau message', { voie: 'nouveau', objet: '', repondALeMessageId: null }],
  ['Répondre', { voie: 'repondre', objet: 'Re: X', filId: 10, repondALeMessageId: 77 }],
  ['Écrire depuis gestion@', { voie: 'nouveau', objet: 'Arnaud JOREL / Cabinet Criterimmo', repondALeMessageId: null, depuisLeBien: true,
    cibles: [{ sorte: 'lot', cle: '219', id: 176, libelle: 'lot 219' }],
    suggestionsBien: rangerSuggestions({ clients: [
      { adresse: 'proprio@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null }] }),
  } as Partial<BrouillonEcran>],
];

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let appels: string[];
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes('/adresses/familles')) {
      appels.push(url);
      const voulues = new URL(`http://x${url}`).searchParams.getAll('a');
      return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(voulues.map((a) => [a, FAMILLES[a] ?? null])) }));
    }
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const lire = async () => { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); };
const monter = async (b: BrouillonEcran) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
const puce = (adresse: string) => [...container.querySelectorAll('.red-pastille')]
  .find((p) => p.querySelector(`button[aria-label="Retirer ${adresse}"]`)) as HTMLElement | undefined;

describe.each(COMPOSEURS)('composeur « %s »', (_nom, voie) => {
  it('🔴 une puce par famille (propre / rattaché) et une adresse extérieure, dans À, Cc et Cci', async () => {
    await monter({ ...BASE, ...voie, a: ['proprio@x.fr', 'z@ailleurs.fr'], cc: ['loc@x.fr', 'garant@x.fr', 'ancien@x.fr'],
      cci: ['syndic@x.fr', 'gardien@x.fr', 'artisan@x.fr'] } as BrouillonEcran);
    await lire();
    const classes = (a: string) => puce(a)?.className;
    expect(classes('proprio@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--proprietaire');
    expect(classes('loc@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--locataire');
    expect(classes('garant@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--locataire red-pastille--rattache');
    expect(classes('ancien@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--ancien_locataire');
    expect(classes('syndic@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--syndic');
    expect(classes('gardien@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--immeuble');
    expect(classes('artisan@x.fr')).toBe('red-pastille red-pastille--famille red-pastille--neutre');
    expect(classes('z@ailleurs.fr')).toBe('red-pastille red-pastille--inconnue');
    // L'info-bulle : le nom et le rôle.
    expect(puce('proprio@x.fr')?.title).toBe('DUPONT Jean · Propriétaire — proprio@x.fr');
    expect(puce('z@ailleurs.fr')?.title).toBe('z@ailleurs.fr — adresse extérieure, inconnue de notre système');
  });

  it('🔴 une adresse CONNUE tapée à la main est colorée elle aussi ; une adresse fautive garde sa marque', async () => {
    await monter({ ...BASE, ...voie, a: [], cc: [], cci: [] } as BrouillonEcran);
    const champ = container.querySelector('[data-champ="À"] input.red-saisie') as HTMLInputElement;
    for (const texte of ['loc@x.fr', 'pas une adresse']) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(champ, texte);
        champ.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
      await calmer();
    }
    await lire();
    expect(puce('loc@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--locataire');
    expect(puce('pas une adresse')?.className).toBe('red-pastille red-pastille--fautive');
  });

  it('chaque adresse n’est lue qu’UNE fois ; jamais de lecture sans adresse', async () => {
    await monter({ ...BASE, ...voie, a: ['loc@x.fr'], cc: [], cci: [] } as BrouillonEcran);
    await lire();
    await lire();
    expect(appels.length).toBe(1);
    expect(appels[0]).toContain('a=loc%40x.fr');
    if (voie.depuisLeBien) expect(appels[0]).toContain('lot=176');
    else expect(appels[0]).not.toContain('lot=');
  });
});

it('🔴 depuis une fiche bien : les adresses que la liste propose sont colorées D’EMBLÉE (sans attendre de lecture)', async () => {
  await monter({ ...BASE, ...COMPOSEURS[2][1], a: ['proprio@x.fr'], cc: [], cci: [] } as BrouillonEcran);
  expect(puce('proprio@x.fr')?.className).toBe('red-pastille red-pastille--famille red-pastille--proprietaire');
  await lire();
  expect(appels).toEqual([]);
});
