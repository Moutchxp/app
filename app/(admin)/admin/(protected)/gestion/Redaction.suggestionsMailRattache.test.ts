// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { rangerSuggestions } from '../../../../lib/gestion/suggestionsBien';
import type { BienClient } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 GARDE PERMANENTE — LOT REGRESSION-SUGGESTIONS-ADRESSES-DANS-REPONDRE ══════════════════════════════════════════
 *
 * CONSTAT D'ARNO (13/10/2026), mail 58133 « PROBLÈME CHAUDIÈRE », rattaché au 70ter rue de la République (bien-396) :
 * « Répondre », clic dans À — les adresses du dossier du bien (puces colorées) n'apparaissent plus.
 *
 * LA CAUSE : une réponse HÉRITE du bien rattaché au mail (`classementHerite`) avec sa CLÉ WIPPIMMO, mais sans son
 * identifiant interne (`cible_id` n'est jamais renseigné en base). La liste du bien se lit par identifiant
 * (`/biens/<id>/ecrire`) : le bien hérité était donc ignoré, et il bloquait en plus l'ajout d'office du même bien par
 * le client tapé en À (« déjà dans le contexte »). Aucune liste n'était jamais demandée.
 *
 * CE QUE CETTE GARDE EXIGE : un composeur ouvert sur un mail RATTACHÉ (Répondre, Répondre à tous, Transférer) propose
 * les adresses du dossier du bien dans À, Cc et Cci, QUEL QUE SOIT l'état de classement affiché (case verte
 * « Rattaché »), que le destinataire soit un client du bien ou non (Transférer part sans destinataire).
 * 🔒 Données inventées, `fetch` simulé, aucun envoi.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, classementDisponible: true,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5,
} as ContexteRedactionEcran;

/** Le bien rattaché : clé WIPPIMMO 396, identifiant interne 77 (les deux nombres diffèrent, comme en vrai). */
const CLE = '396';
const LOT_ID = 77;
const BIENS: Record<string, BienClient[]> = {
  'locataire.unique@x.fr': [{ lotId: LOT_ID, cle: CLE, libelle: `${CLE} rue des Tests — lot ${CLE}`, categorie: 'logement', role: 'locataire', nom: 'ROI Léa' }],
};
const LISTE = rangerSuggestions({
  clients: [
    { adresse: 'proprio.du.bien@x.fr', nom: 'Proprio Dubien', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null },
    { adresse: 'locataire.unique@x.fr', nom: 'Léa Roi', role: 'Locataire', ton: 'locataire', propre: true, civilite: null, nomFamille: null },
  ],
  immeuble: [{ adresse: 'syndic.du.bien@x.fr', nom: 'Syndic Dubien', role: 'Syndic — e-mail général', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
});

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
    if (url.includes('/adresses/biens')) return new Response(JSON.stringify({ etat: 'ok', biens: Object.fromEntries(q.map((a) => [a, BIENS[a] ?? []])) }));
    if (url.includes('/adresses/familles')) return new Response(JSON.stringify({ etat: 'ok', familles: Object.fromEntries(q.map((a) => [a, null])) }));
    if (url.includes(`/annuaire?lotCle=${CLE}`)) return new Response(JSON.stringify({ etat: 'ok', data: { id: LOT_ID, numero: CLE } }));
    if (url.includes(`/biens/${LOT_ID}/ecrire`)) {
      return new Response(JSON.stringify({ etat: 'ok', cible: { cle: CLE, libelle: `${CLE} rue des Tests — lot ${CLE}` }, groupes: LISTE }));
    }
    if (url.includes('/gestion/classement')) {
      return new Response(JSON.stringify({ etat: 'ok', contexte: { biens: [], examen: { issue: 'a_trancher', motif: '' }, proprietaire: null, interneDabord: false, disponible: true } }));
    }
    return new Response(JSON.stringify({ ok: true, correspondants: [] }));
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const laisser = async () => { for (let i = 0; i < 4; i++) { await act(async () => { vi.advanceTimersByTime(300); }); await calmer(); } };

/** Le brouillon tel que la conversation l'ouvre sous un mail rattaché : le bien hérité porte sa clé, pas d'identifiant. */
const reponse = (voie: 'repondre' | 'repondre_tous' | 'transferer', a: string[], cc: string[] = []): BrouillonEcran => ({
  id: null, voie, a, cc, cci: [], objet: voie === 'transferer' ? 'Tr: Chaudière' : 'Re: Chaudière', corps: '\n\nService Gestion',
  citation: null, destinatairesApproximatifs: false, filId: 36798, repondALeMessageId: 58133,
  cibles: [{ sorte: 'lot', cle: CLE, id: null, libelle: `${CLE} rue des Tests — Appartement` }], interne: false, horsGestion: false,
} as unknown as BrouillonEcran);

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
const champ = (l: string) => container.querySelector(`[data-champ="${l}"]`) as HTMLElement | null;
const ouvrirChamp = async (l: 'Cc' | 'Cci') => {
  if (champ(l) !== null) return;
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === l);
  expect(b, `bouton « ${l} »`).toBeDefined();
  await act(async () => { (b as HTMLButtonElement).click(); });
  await laisser();
};
const cliquerDans = async (l: string) => {
  const s = champ(l)?.querySelector('input.red-saisie') as HTMLInputElement;
  await act(async () => { s.focus(); s.click(); });
  await laisser();
};
const adressesProposees = () => [...container.querySelectorAll('.red-suggestions--bien .red-suggestion--bien')]
  .map((x) => x.textContent ?? '');

describe('🔴🔴 garde — les adresses du dossier du bien dans un composeur ouvert sur un mail rattaché', () => {
  for (const voie of ['repondre', 'repondre_tous'] as const) {
    it(`${voie} au locataire : la case verte « Rattaché » est affichée ET les suggestions sont là, dans À, Cc et Cci`, async () => {
      await monter(reponse(voie, ['locataire.unique@x.fr'], voie === 'repondre_tous' ? ['quelqu.un@ailleurs.fr'] : []));
      expect(container.querySelector('.ccl-case--verte')?.textContent).toContain('Rattaché');
      expect(lues.some((u) => u.includes(`/biens/${LOT_ID}/ecrire`)), 'la liste du bien rattaché est lue').toBe(true);
      await cliquerDans('À');
      expect(adressesProposees().join(' | ')).toContain('proprio.du.bien@x.fr');
      expect(adressesProposees().join(' | ')).toContain('syndic.du.bien@x.fr');
      await ouvrirChamp('Cc');
      await cliquerDans('Cc');
      expect(adressesProposees().join(' | ')).toContain('proprio.du.bien@x.fr');
      await ouvrirChamp('Cci');
      await cliquerDans('Cci');
      expect(adressesProposees().join(' | ')).toContain('syndic.du.bien@x.fr');
    });
  }

  it('Transférer (aucun destinataire, donc aucun client pour retrouver le bien) : les suggestions du bien rattaché sont là', async () => {
    await monter(reponse('transferer', []));
    expect(lues.some((u) => u.includes(`/biens/${LOT_ID}/ecrire`)), 'la liste du bien rattaché est lue').toBe(true);
    await cliquerDans('À');
    expect(adressesProposees().join(' | ')).toContain('proprio.du.bien@x.fr');
  });

  it('les puces gardent la couleur de leur famille (le dossier du bien les connaît)', async () => {
    await monter(reponse('repondre', ['locataire.unique@x.fr']));
    await cliquerDans('À');
    const lignes = [...container.querySelectorAll('.red-suggestions--bien .red-suggestion--bien')];
    expect(lignes.length).toBeGreaterThan(0);
    expect(container.querySelector('.red-suggestions--bien')?.innerHTML).toMatch(/proprietaire/);
  });

  it('le classement hérité n’est pas touché : la cible garde sa clé, sans identifiant inventé', async () => {
    await monter(reponse('repondre', ['locataire.unique@x.fr']));
    const lots = ((courant.cibles ?? []) as Array<{ sorte: string; cle: string | null; id: number | null }>).filter((c) => c.sorte === 'lot');
    expect(lots.map((c) => c.cle)).toEqual([CLE]);
    expect(lots[0].id).toBeNull();
  });

  it('lecture seule : aucune écriture pour proposer les adresses', async () => {
    await monter(reponse('transferer', []));
    await cliquerDans('À');
    /* ⚠️ Hors du sujet, donc écartés : l'enregistrement automatique du brouillon (`/brouillons`, comportement existant
       du composeur) et la lecture du moteur de classement (un POST qui n'écrit rien). */
    expect(lues.filter((u) => !u.startsWith('GET ') && !u.includes('/gestion/classement') && !u.includes('/gestion/brouillons')))
      .toEqual([]);
    expect(lues.filter((u) => u.includes('lotCle=') || u.includes('/ecrire')).every((u) => u.startsWith('GET '))).toBe(true);
  });
});
