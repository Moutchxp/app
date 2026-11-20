// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 Arno (20/11/2026) — les blocs 3 « Conditions d'entrée » et 4 « Suivi commercial » de « Nouveau locataire » sur la fiche du locataire :
 * repliés ensemble sur une ligne, dépliés au clic, leur propre « Enregistrer » (aucun mail), « Envoi ADHOC & MONGA » sous le bloc 4.
 * Les blocs eux-mêmes (`ContenuConditionsBail`, `ContenuSuiviLocataire`) sont les composants du formulaire, éprouvés ailleurs : ici, des
 * bouchons qui disent qu'ils sont montés ; les états des deux blocs sont simulés. Rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const L = { bailId: 551, lotId: 7, activiteId: 3, version: 'v1', lots: [], entree: '2025-06-01', bien: { id: 7, titre: '4 rue Fictive', famille: 'logement' } };
let bloc3: Record<string, unknown>;
let bloc4: Record<string, unknown>;
const lire3 = vi.fn(async () => undefined);
const lire4 = vi.fn(async () => undefined);
vi.mock('./BlocConditionsBail', () => ({
  CSS_CONDITIONS_BAIL: '',
  useConditionsBail: () => bloc3,
  ContenuConditionsBail: (p: { conditions: unknown; creation?: unknown }) => createElement('div', { 'data-stub': 'bloc3', 'data-creation': String(p.creation !== undefined) }),
}));
vi.mock('./SuiviCommercialLocataire', () => ({
  CSS_SUIVI_LOCATAIRE: '',
  useSuiviLocataire: () => bloc4,
  ContenuSuiviLocataire: () => createElement('div', { 'data-stub': 'bloc4' }),
  RecapSuivi: () => createElement('div', { 'data-stub': 'recap4' }),
}));
// Le contrôle du Dossier (`refusDossier`) est éprouvé avec le Dossier ; ici, la lecture simulée est réputée complète.
vi.mock('../../../../lib/location/dossierLocation', async (orig) => ({ ...(await orig<Record<string, unknown>>()), refusDossier: () => null }));
vi.mock('./EnvoiAdhocMonga', () => ({ BlocEnvoiFicheLocataire: (p: { locataireId: number }) => createElement('div', { 'data-stub': 'adhoc', 'data-locataire': p.locataireId }) }));

import { ConditionsSuiviFicheLocataire, ligneRepliee } from './ConditionsSuiviFicheLocataire';

const etat3 = (o: Record<string, unknown> = {}) => ({
  etat: { sorte: 'ok', l: L, conditions: { loyer: { principal: '900', provisions: '50' }, sommes: {} }, entretien: null, creation: false },
  changements: [], touche: false, manques: [], creation: false, saisie: { version: 'v1', locataires: [], conditions: { commentaire: 'x' }, entretien: null, suivi: {} },
  hono: { valeur: '', manuel: false }, setHono: vi.fn(), manqueDe: () => null, toucher: vi.fn(), setTente: vi.fn(), poserConditions: vi.fn(), poserEntretien: vi.fn(),
  lire: lire3, ...o,
});
const etat4 = (o: Record<string, unknown> = {}) => ({
  courant: { sorte: 'ligne', valide: true, activiteId: 3, bailId: 551 }, changements: [], touche: false, manques: [], envoi: null, lire: lire4, ...o,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); bloc3 = etat3(); bloc4 = etat4(); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const rendre = () => act(() => root.render(createElement(ConditionsSuiviFicheLocataire, { locataireId: 541 })));
const ligne = () => container.querySelector('[data-ligne-conditions-suivi]') as HTMLButtonElement;
const cliquer = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('la ligne repliée (PUR)', () => {
  it('titre lisible, mention « non renseignées » si les deux blocs sont vides, sinon celle du bloc vide', () => {
    expect(ligneRepliee({ conditionsVides: true, suiviVide: true, ouvert: false })).toEqual({ titre: 'Conditions d’entrée et suivi commercial', mention: 'non renseignées', geste: 'cliquer pour afficher' });
    expect(ligneRepliee({ conditionsVides: true, suiviVide: false, ouvert: true }).mention).toBe('conditions d’entrée non renseignées');
    expect(ligneRepliee({ conditionsVides: false, suiviVide: true, ouvert: true })).toMatchObject({ mention: 'suivi commercial non renseigné', geste: 'cliquer pour replier' });
    expect(ligneRepliee({ conditionsVides: false, suiviVide: false, ouvert: false }).mention).toBeNull();
  });
});

describe('les blocs 3 et 4 sur la fiche du locataire', () => {
  it('REMPLI : repliés par défaut sur UNE ligne, sans mention « non renseignées » ; rien des blocs n’est rendu', () => {
    rendre();
    expect(ligne().getAttribute('aria-expanded')).toBe('false');
    expect(ligne().textContent).toContain('Conditions d’entrée et suivi commercial');
    expect(ligne().textContent).toContain('cliquer pour afficher');
    expect(container.querySelector('[data-mention-vide]')).toBeNull();
    expect(container.querySelector('[data-stub="bloc3"], [data-stub="bloc4"], [data-stub="adhoc"]')).toBeNull();
  });

  it('VIDE (bail jamais saisi) : la ligne dit « non renseignées » ; dépliés, les deux blocs s’affichent quand même (formulaire de création)', async () => {
    bloc3 = etat3({ etat: { ...etat3().etat as object, creation: true }, creation: true });
    bloc4 = etat4({ courant: { sorte: 'sans_ligne', bailId: 551 } });
    rendre();
    expect(container.querySelector('[data-mention-vide]')?.textContent).toBe('non renseignées');
    await cliquer(ligne());
    expect(container.querySelector('[data-stub="bloc3"]')?.getAttribute('data-creation')).toBe('true');
    expect(container.querySelector('[data-stub="bloc4"]')).not.toBeNull();
  });

  it('SANS BAIL EN COURS : rien ne s’affiche, rien ne casse', () => {
    bloc3 = etat3({ etat: { sorte: 'aucun' } });
    rendre();
    expect(container.innerHTML).toBe('');
  });

  it('REPLI / DÉPLI : un clic déplie les DEUX blocs (titres du formulaire) et, dessous, « Envoi ADHOC & MONGA » ; un nouveau clic replie', async () => {
    rendre();
    await cliquer(ligne());
    expect(ligne().getAttribute('aria-expanded')).toBe('true');
    expect(ligne().textContent).toContain('cliquer pour replier');
    expect([...container.querySelectorAll('[data-conditions-suivi-deplies] h3')].map((h) => h.textContent)).toEqual(['3Conditions d’entrée', '4Suivi commercial']);
    const ordre = [...container.querySelectorAll('[data-stub]')].map((x) => x.getAttribute('data-stub'));
    expect(ordre).toEqual(['bloc3', 'bloc4', 'adhoc']);
    expect(container.querySelector('[data-stub="adhoc"]')?.getAttribute('data-locataire')).toBe('541');
    await cliquer(ligne());
    expect(container.querySelector('[data-conditions-suivi-deplies]')).toBeNull();
  });

  it('ENREGISTRER : inactif sans modification ; le récapitulatif, puis UNE requête (blocs 3 et 4, bail en cours, sans mail), et la relecture', async () => {
    rendre();
    await cliquer(ligne());
    const bouton = () => container.querySelector('[data-enregistrer-conditions-suivi]') as HTMLButtonElement;
    expect(bouton().disabled).toBe(true);
    act(() => root.unmount()); root = createRoot(container);
    bloc3 = etat3({ changements: [{ bloc: 3, champ: 'Commentaires', avant: 'x', apres: 'y' }] });
    bloc4 = etat4({ touche: true, changements: [{ bloc: 4, champ: 'Négociateur', avant: 'A', apres: 'B' }], envoi: { bailId: 551, activiteId: 3, version: 'v1', suivi: { negociateurId: 2 } } });
    const fetchs = vi.fn(async () => ({ json: async () => ({ etat: 'ok', data: {} }) }) as unknown as Response);
    global.fetch = fetchs as unknown as typeof fetch;
    rendre();
    await cliquer(ligne());
    expect(bouton().disabled).toBe(false);
    await cliquer(bouton());
    expect(document.body.textContent).toContain('Aucun mail n’est envoyé par cet enregistrement.');
    expect(fetchs).not.toHaveBeenCalled();
    await cliquer([...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer'));
    expect(fetchs).toHaveBeenCalledTimes(1);
    const [url, init] = fetchs.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/gestion/annuaire/location');
    expect((init.headers as Record<string, string>)['x-svav-confirmation']).toBe('propre');
    const corps = JSON.parse(String(init.body));
    expect(corps).toMatchObject({ action: 'enregistrer-conditions-fiche-locataire', id: 541, bailId: 551,
      conditions: { version: 'v1', conditions: { commentaire: 'x' }, entretien: null }, suivi: { bailId: 551, activiteId: 3, version: 'v1' } });
    expect(container.querySelector('[data-conditions-suivi-enregistres]')?.textContent).toBe('✓ Modifications enregistrées.');
    expect(lire3).toHaveBeenCalled();
    expect(lire4).toHaveBeenCalled();
  });

  it('ENREGISTRER, bloc 3 en création incomplet : les obligations de « Nouveau locataire », rien ne part', async () => {
    const fetchs = vi.fn();
    global.fetch = fetchs as unknown as typeof fetch;
    bloc3 = etat3({ etat: { ...etat3().etat as object, creation: true }, creation: true, touche: true, manques: ['Prélèvement : répondez Oui ou Non.'] });
    rendre();
    await cliquer(ligne());
    await cliquer(container.querySelector('[data-enregistrer-conditions-suivi]'));
    expect(document.body.textContent).toContain('Conditions d’entrée — reste à renseigner : Prélèvement : répondez Oui ou Non.');
    expect(bloc3.setTente).toHaveBeenCalledWith(true);
    expect(fetchs).not.toHaveBeenCalled();
  });
});
