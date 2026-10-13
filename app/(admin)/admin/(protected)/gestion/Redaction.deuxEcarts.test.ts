// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';
import type { BienClient } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 LOT DEUX-ECARTS-SUGGESTIONS — LES DEUX DÉCISIONS D'ARNO, DANS LE VRAI COMPOSEUR ═══════════════════════════════
 *   1. (écart 748023a5) un contact de syndic se lit « Syndic — <rôle> · <cabinet> », et taper le nom du cabinet propose
 *      ses contacts ET son e-mail général ;
 *   2. (écart 1806463e) au-delà de 20 adresses, chaque puce prend sa couleur (lecture par paquets de 20), SANS qu'aucun
 *      bien supplémentaire n'entre d'office : les biens qui partiront à l'envoi sont exactement ceux d'avant.
 * 🔒 Données inventées, `fetch` simulé (la route des biens garde sa borne de 20, comme le serveur), aucun envoi.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;

/** 25 clients, chacun locataire d'UN bien (le cas où un bien entre d'office). */
const N = 25;
const adresse = (i: number) => `client${String(i).padStart(2, '0')}@x.fr`;
const BIENS: Record<string, BienClient[]> = Object.fromEntries(Array.from({ length: N }, (_, k) => {
  const i = k + 1;
  return [adresse(i), [{ lotId: 1000 + i, cle: String(500 + i), libelle: `${500 + i} rue des Tests — lot ${500 + i}`,
    categorie: 'logement', role: 'locataire', nom: `CLIENT ${i}` } as BienClient]];
}));

let container: HTMLDivElement;
let root: Root;
let courant: BrouillonEcran;
let lues: string[];
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  lues = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string }) => {
    const url = String(u);
    lues.push(`${init?.method ?? 'GET'} ${url}`);
    const q = new URL(`http://x${url}`).searchParams.getAll('a');
    /* ⚠️ LA BORNE DU SERVEUR : 20 adresses lues par appel, les suivantes ignorées (route adresses/biens). */
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.slice(0, 20).map((a) => [a, BIENS[a] ?? []])) }));
    /* La lecture générale ne connaît PERSONNE : la couleur ne peut venir que des biens. */
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, null])) }));
    if (url.includes('/gestion/classement')) {
      return new Response(JSON.stringify({ etat: 'ok', contexte: { biens: [], examen: { issue: 'a_trancher', motif: '' }, proprietaire: null, interneDabord: false, disponible: true } }));
    }
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const laisser = async () => { for (let i = 0; i < 5; i++) { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); } };
const monter = async (b: BrouillonEcran) => {
  courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    brouillon: courant, contexte: CONTEXTE, lotFiche: null,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await laisser();
};
const nouveau = (a: string[], o: Partial<BrouillonEcran> = {}) => ({
  id: null, voie: 'nouveau', a, cc: [], cci: [], objet: 'Essai', corps: '\n\nService Gestion', citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null, ...o,
}) as unknown as BrouillonEcran;
const puce = (a: string) => [...container.querySelectorAll('.red-pastille')]
  .find((p) => p.querySelector(`button[aria-label="Retirer ${a}"]`)) as HTMLElement | undefined;
const ciblesLots = () => ((courant.cibles ?? []) as Array<{ sorte: string; cle: string | null }>)
  .filter((c) => c.sorte === 'lot').map((c) => c.cle).sort();

describe('🔴 écart 1806463e — les couleurs au-delà de 20 adresses', () => {
  it('25 adresses : TOUTES les puces ont leur couleur', async () => {
    await monter(nouveau(Array.from({ length: N }, (_, k) => adresse(k + 1))));
    for (let i = 1; i <= N; i++) {
      expect(puce(adresse(i))?.className ?? '', `puce ${adresse(i)}`).toContain('red-pastille--famille');
    }
  });

  it('chaque lecture des biens porte au plus 20 adresses, et aucune adresse n’est laissée sans lecture', async () => {
    await monter(nouveau(Array.from({ length: N }, (_, k) => adresse(k + 1))));
    const appels = lues.filter((u) => u.includes('/adresses/biens')).map((u) => new URL(`http://x${u.slice(4)}`).searchParams.getAll('a'));
    expect(appels.every((a) => a.length <= 20)).toBe(true);
    expect(new Set(appels.flat()).size).toBe(N);
    expect(lues.filter((u) => u.includes('/adresses/biens')).every((u) => u.startsWith('GET '))).toBe(true);
  });

  it('🔴 les biens rattachés à l’envoi sont EXACTEMENT ceux d’avant : seuls les 20 premiers clients font entrer leur bien', async () => {
    await monter(nouveau(Array.from({ length: N }, (_, k) => adresse(k + 1))));
    /* Le comportement d'avant ce lot : la route ne lisait que les 20 premières adresses, donc seuls leurs biens entraient
       d'office. La lecture « couleurs » n'en ajoute aucun. */
    expect(ciblesLots()).toEqual(Array.from({ length: 20 }, (_, k) => String(501 + k)).sort());
    for (let i = 21; i <= N; i++) expect(ciblesLots()).not.toContain(String(500 + i));
  });

  it('20 adresses ou moins : une seule lecture, comme avant', async () => {
    await monter(nouveau(Array.from({ length: 5 }, (_, k) => adresse(k + 1))));
    expect(lues.filter((u) => u.includes('/adresses/biens'))).toHaveLength(1);
    expect(ciblesLots()).toEqual(['501', '502', '503', '504', '505']);
  });
});

describe('🔴 écart 748023a5 — le nom du cabinet, visible et cherchable', () => {
  const LISTE = rangerSuggestions({
    immeuble: [
      { adresse: 'resp@cab.fr', nom: 'Arnaud JOREL', role: 'Syndic — Responsable de copropriété', cabinet: 'TEST ARNAUD',
        ton: 'syndic', propre: true, civilite: null, nomFamille: 'JOREL' },
      { adresse: 'contact@cab.fr', nom: 'TEST ARNAUD', role: 'Syndic — TEST ARNAUD', ton: 'syndic', propre: true,
        civilite: null, nomFamille: null },
      { adresse: 'gardien@x.fr', nom: 'Rose', role: 'Gardien', ton: 'immeuble', propre: true, civilite: null, nomFamille: null },
    ],
  });
  const saisir = async (texte: string) => {
    const s = container.querySelector('[data-champ="À"] input.red-saisie') as HTMLInputElement;
    await act(async () => { s.focus(); s.click(); });
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(s, texte);
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await laisser();
  };
  const lignes = () => [...container.querySelectorAll('.red-suggestions--bien .red-suggestion--bien')].map((x) => x.textContent ?? '');

  it('la ligne d’un contact de syndic dit « Syndic — <rôle> · <cabinet> »', async () => {
    await monter(nouveau([], { suggestionsBien: LISTE } as Partial<BrouillonEcran>));
    await saisir('');
    const ligne = lignes().find((t) => t.includes('resp@cab.fr')) ?? '';
    expect(ligne).toContain('Syndic — Responsable de copropriété · TEST ARNAUD');
    /* L'e-mail général et le gardien gardent exactement leur ligne. */
    expect(lignes().find((t) => t.includes('contact@cab.fr'))).toContain('Syndic — TEST ARNAUD');
    expect(lignes().find((t) => t.includes('contact@cab.fr'))).not.toContain('· TEST ARNAUD');
    expect(lignes().find((t) => t.includes('gardien@x.fr'))).toContain('Gardien');
  });

  it('taper le nom du cabinet propose ses contacts et son e-mail général, et rien d’autre', async () => {
    await monter(nouveau([], { suggestionsBien: LISTE } as Partial<BrouillonEcran>));
    await saisir('test arn');
    const vues = lignes();
    expect(vues.some((t) => t.includes('resp@cab.fr'))).toBe(true);
    expect(vues.some((t) => t.includes('contact@cab.fr'))).toBe(true);
    expect(vues.some((t) => t.includes('gardien@x.fr'))).toBe(false);
  });

  it('l’info-bulle de la puce d’un contact choisi est celle d’avant (le cabinet n’y est pas ajouté)', async () => {
    await monter(nouveau(['resp@cab.fr'], { suggestionsBien: LISTE } as Partial<BrouillonEcran>));
    const p = puce('resp@cab.fr');
    expect(p?.getAttribute('title') ?? '').toContain('Syndic — Responsable de copropriété');
    expect(p?.getAttribute('title') ?? '').not.toContain('TEST ARNAUD');
  });
});
