// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeCriteresTeleservice, messageHorsBornes } from './ResumeCriteresTeleservice';

/**
 * Lot 3 — COMPORTEMENT du résumé des critères (jsdom + act, sans testing-library). `fetch` mocké. Aucune assertion de
 * couleur/classe/pixel, aucune lecture de source. Les saisies contrôlées passent par le setter natif + l'événement React.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VEILLE = {
  teleservicePermisParCommuneParMois: 5, teleserviceDossiersParDepot: 5, teleserviceProfilDemandeurDefaut: 'entreprise',
  ancienneteMaxDemandeAnnees: 1, triCandidats: 'date_ancienne_puis_surface', nbCandidatsExamines: 400,
};
const BORNES = {
  teleservice_permis_par_commune_par_mois: { min: 1, max: 50 },
  teleservice_dossiers_par_depot: { min: 1, max: 20 },
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const brancherFetch = (surPatch?: (corps: unknown) => void): void => {
  global.fetch = vi.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
    if (opts?.method === 'PATCH') { surPatch?.(JSON.parse(String(opts.body))); return { ok: true, json: async () => ({ ok: true }) } as unknown as Response; }
    return { ok: true, json: async () => ({ veille: VEILLE, bornes: BORNES }) } as unknown as Response; // GET
  }) as unknown as typeof fetch;
};
const monter = async (onChangement = vi.fn()): Promise<ReturnType<typeof vi.fn>> => {
  await act(async () => { root.render(createElement(ResumeCriteresTeleservice, { signalRafraichir: 0, onChangement, onAllerReglages: vi.fn() })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return onChangement;
};
const saisir = (el: HTMLInputElement | HTMLSelectElement, valeur: string): void => {
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => { setter.call(el, valeur); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const inputsNombre = (): HTMLInputElement[] => [...container.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
const cliquerEnregistrer = async (): Promise<void> => {
  await act(async () => { boutons().find((b) => /Enregistrer les critères/.test(b.textContent ?? ''))!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('messageHorsBornes (pur)', () => {
  it('dans les bornes → null ; en-dessous/au-dessus → message ; non entier → message ; sans bornes → null', () => {
    expect(messageHorsBornes(5, { min: 1, max: 50 })).toBeNull();
    expect(messageHorsBornes(0, { min: 1, max: 50 })).toMatch(/hors bornes/);
    expect(messageHorsBornes(51, { min: 1, max: 50 })).toMatch(/hors bornes/);
    expect(messageHorsBornes(1.5, { min: 1, max: 50 })).toMatch(/entier/);
    expect(messageHorsBornes(999, undefined)).toBeNull();
  });
});

describe('Lot 3 — résumé des critères téléservice', () => {
  it('§1 — REPLIÉ au montage (<details> sans `open`), tout le contenu reste présent dans le dépliant', async () => {
    brancherFetch();
    await monter();
    const d = container.querySelector('details');
    expect(d).not.toBeNull();
    expect(d?.open).toBe(false); // fermé au montage, comme les autres blocs repliables de l'écran
    // le contenu n'est ni retiré ni masqué : les 3 critères propres (2 nombres + 1 select), le bouton d'enregistrement,
    //   le verrou « référence mairie », et le pavé partagé « AUSSI pour le rail E-mail » vivent tous dans le dépliant.
    expect(container.querySelector('summary')?.textContent).toMatch(/Critères de sélection des cartes/);
    expect(inputsNombre()).toHaveLength(2);
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.textContent).toMatch(/Enregistrer les critères/);
    expect(container.textContent).toMatch(/référence mairie/i);
    expect(container.textContent).toMatch(/AUSSI pour le rail E-mail/i);
  });

  it('les 3 critères PARTAGÉS sont NON éditables (aucun contrôle) et renvoient vers Réglages', async () => {
    brancherFetch();
    await monter();
    // seuls les 3 critères PROPRES ont des contrôles : 2 champs nombre (plafond, dossiers) + 1 select (profil)
    expect(inputsNombre()).toHaveLength(2);
    expect(container.querySelectorAll('select')).toHaveLength(1);
    const t = container.textContent ?? '';
    expect(t).toMatch(/moins de\s*1\s*an/i);                         // ancienneté (partagé, en texte)
    expect(t).toMatch(/400/);                                        // profondeur d'examen (partagé)
    expect(t).toMatch(/Plus anciens d['’]abord/);                    // ordre d'examen (libellé FR)
    expect(t).toMatch(/AUSSI pour le rail E-mail/i);                 // mention explicite
    expect(boutons().some((b) => /Réglages/.test(b.textContent ?? ''))).toBe(true); // renvoi
  });

  it('un critère PROPRE modifié part vers PATCH /reglages avec la BONNE clé (colonne)', async () => {
    let corps: unknown = null;
    brancherFetch((b) => { corps = b; });
    await monter();
    saisir(inputsNombre()[0], '3'); // plafond mensuel (1er champ nombre)
    await cliquerEnregistrer();
    expect(corps).toEqual({ veille: { teleservice_permis_par_commune_par_mois: 3 } });
  });

  it('une valeur HORS BORNES est refusée CÔTÉ CLIENT (aucun PATCH émis, message affiché)', async () => {
    brancherFetch();
    await monter();
    saisir(inputsNombre()[0], '99'); // > 50
    await cliquerEnregistrer();
    const patchs = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(patchs).toHaveLength(0);
    expect(container.textContent).toMatch(/hors bornes/i);
  });

  it('un enregistrement réussi déclenche le rafraîchissement (signal existant : onChangement)', async () => {
    brancherFetch();
    const onChangement = vi.fn();
    await monter(onChangement);
    saisir(inputsNombre()[1], '4'); // dossiers par dépôt (valide 1..20)
    await cliquerEnregistrer();
    expect(onChangement).toHaveBeenCalledTimes(1);
  });
});
