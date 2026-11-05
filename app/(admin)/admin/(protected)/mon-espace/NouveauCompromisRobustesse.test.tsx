// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs } from './MesCompteurs';
import { URL_MANDAT, URL_REFERENCES } from './NouveauCompromis';
import { MESSAGE_FORMULAIRE_EN_ERREUR, ProtectionFormulaire } from './ProtectionFormulaire';
import { phraseListesIndisponibles, referencesSures } from '../transaction/FormulaireDossier';

/**
 * ══ 🔴 Arno (05/11/2026, PRODUCTION) — « Nouveau compromis » : le choix du côté faisait tomber la page (« This page couldn't load »,
 * « Cannot read properties of undefined (reading 'map') »). CAUSE : la route des références ne renvoyait plus `collegues` ni `personnes`
 * (glissés dans un commentaire, lots D29 / D38). ICI : les 3 boutons de côté, la réponse de la production, et chaque liste absente, nulle ou
 * mal formée — jamais de plantage, un message clair ; collaborateur ET administrateur. Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
const BASE = { disponible: true, aujourdhui: '2026-11-05', titulaireId: 5, lotD: true, personneType: true, prixVente: true, mandat: true, uniteCommission: true,
  negociateurs: [{ id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' }, { id: 7, nom: 'Marc DURAND', societe: 'macj' }],
  apporteurs: [], personnes: [], collegues: [{ id: 5, libelle: 'Léa MARTIN' }], structureImposee: null };
let refs: Record<string, unknown> = BASE;
let admin = false;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  refs = BASE; admin = false;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_REFERENCES)) return ok({ ...refs, administrateur: admin });
    if (u.startsWith(URL_MANDAT)) return ok({ libre: true, numero: '1' });
    return ok({ disponible: true, aujourdhui: '2026-11-05', titulaire: { id: 5, prenom: 'Léa', administrateur: admin }, ventes: [],
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true }, compteurs: { compromis: vide, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
  }) as unknown as typeof fetch;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
/** Le parcours jusqu'au choix du côté (CRITERIMMO, n° 1), puis le clic sur ce côté. */
const jusquAuCote = async (cote: 'entree' | 'sortie' | 'aucun') => {
  await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer();
  await cliquer('[data-nouveau-compromis-mon-espace]');
  await cliquer('[data-structure="criterimmo"]');
  await saisir('[data-parcours-mandat]', '1');
  await cliquer('[data-parcours-verifier]');
  await cliquer(`[data-cote="${cote}"]`);
};
const formulaireOuvert = () => container.querySelector('[data-formulaire-dossier="nouveau"]') !== null;
const sansPlantage = () => {
  expect(container.querySelector('[data-formulaire-en-erreur]')).toBeNull();
  expect(container.querySelector('[data-mon-espace-erreur]')).toBeNull();
  expect(container.querySelector('[data-vue="compromis"]')).not.toBeNull(); // le reste de « Mon espace » est là
};

describe('🔴 la réponse de la PRODUCTION (sans `collegues` ni `personnes`) : plus de plantage', () => {
  const PROD = (() => { const { collegues: _c, personnes: _p, ...r } = BASE; return r; })();
  for (const [qui, estAdmin] of [['collaborateur', false], ['administrateur', true]] as const) {
    for (const cote of (estAdmin ? ['entree', 'sortie', 'aucun'] : ['entree', 'sortie']) as ('entree' | 'sortie' | 'aucun')[]) {
      it(`${qui} — côté « ${cote} » : le formulaire s’ouvre, et dit les listes indisponibles`, async () => {
        refs = PROD; admin = estAdmin;
        await jusquAuCote(cote);
        sansPlantage();
        expect(formulaireOuvert()).toBe(true);
        expect(container.querySelector('[data-listes-indisponibles]')?.textContent).toBe('Listes des personnes et des collègues indisponibles, réessayez.');
      });
    }
  }
});

describe('chaque liste absente, nulle ou mal formée (une « erreur » à sa place) : jamais de plantage', () => {
  for (const cle of ['negociateurs', 'apporteurs', 'personnes', 'collegues']) {
    for (const [forme, valeur] of [['absente', undefined], ['nulle', null], ['en erreur', { erreur: 'LECTURE_IMPOSSIBLE' }]] as const) {
      for (const cote of ['entree', 'sortie', 'aucun'] as const) {
        it(`${cle} ${forme} — côté « ${cote} » (administrateur)`, async () => {
          admin = true;
          const r: Record<string, unknown> = { ...BASE };
          if (valeur === undefined) delete r[cle]; else r[cle] = valeur;
          refs = r;
          await jusquAuCote(cote);
          sansPlantage();
          expect(formulaireOuvert()).toBe(true);
          expect(container.querySelector('[data-listes-indisponibles]')).not.toBeNull();
        });
      }
    }
  }
  it('la réponse complète : aucun message', async () => {
    await jusquAuCote('entree');
    expect(formulaireOuvert()).toBe(true);
    expect(container.querySelector('[data-listes-indisponibles]')).toBeNull();
  });
});

describe('les règles (PUR)', () => {
  it('referencesSures : chaque liste en tableau ; les manquantes nommées ; « collègues » absent = réponse d’avant (sans message)', () => {
    const r = referencesSures({ lotD: true, negociateurs: [], apporteurs: 'x', personnes: null } as never);
    expect([r.references.negociateurs, r.references.apporteurs, r.references.personnes, r.references.collegues]).toEqual([[], [], [], []]);
    expect(r.manquantes).toEqual(['apporteurs', 'personnes']);
    expect(referencesSures(undefined).manquantes).toEqual(['negociateurs', 'apporteurs', 'personnes']);
  });
  it('la phrase', () => {
    expect(phraseListesIndisponibles(['collegues'])).toBe('Liste des collègues indisponible, réessayez.');
    expect(phraseListesIndisponibles(['apporteurs', 'personnes', 'collegues'])).toBe('Listes des apporteurs, des personnes et des collègues indisponibles, réessayez.');
  });
});

describe('🔴 la protection d’écran : seule la zone du formulaire tombe', () => {
  const Boum = () => { throw new Error('boum'); };
  it('une erreur dans le formulaire : le message et « Fermer » à sa place ; le reste de la page reste', async () => {
    const fermer = vi.fn();
    await act(async () => {
      root.render(createElement('div', null, createElement('p', { 'data-reste': '' }, 'Le reste'),
        createElement(ProtectionFormulaire, { onFermer: fermer, children: createElement(Boum) })));
    });
    expect(container.querySelector('[data-reste]')?.textContent).toBe('Le reste');
    expect(container.querySelector('[data-formulaire-en-erreur] p')?.textContent).toBe(MESSAGE_FORMULAIRE_EN_ERREUR);
    await act(async () => { (container.querySelector('[data-formulaire-erreur-fermer]') as HTMLButtonElement).click(); });
    expect(fermer).toHaveBeenCalled();
  });
});
