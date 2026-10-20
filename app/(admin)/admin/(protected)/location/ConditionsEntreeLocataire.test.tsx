// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { CreationLocataire } from './CreationLocataire';
import { SectionLocationLocataire } from '../gestion/SectionsLocationFiche';

/**
 * 🔴 Arno (20/10/2026) — « Nouveau locataire », bloc 3 « Conditions d'entrée » (fiche papier « Nouveau dossier ») :
 *   · choix obligatoires (« Reste à renseigner », Enregistrer bloqué), sous-choix « au 5 / au 10 », champs « préciser »,
 *     total des sommes calculé ; envoyés avec le bail ;
 *   · « Entretien à prévoir » = la donnée DU BIEN (même composant que « Nouveau bien », pré-rempli depuis le bien) ;
 *   · sans la migration 391 : le bloc le dit, et le locataire se crée exactement comme avant ;
 *   · l'encart « Conditions d'entrée » de la fiche du locataire, modifiable par le MÊME formulaire.
 * Les VRAIS composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let disponible: boolean;
let categorie: string;
let entretienDuBien: { entretienAPrevoir: boolean | null; entretiens: unknown[] };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; disponible = true; categorie = 'logement'; entretienDuBien = { entretienAPrevoir: null, entretiens: [] };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok(corps.action === 'apercu-lots' ? { recap: ['Le logement est loué.'] } : { locataireIds: [50], reintegrations: [] });
    }
    if (u.includes('conditionsEntreeDisponible')) return ok(disponible);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'libre' }]);
    if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
    if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie }, complements: { ...entretienDuBien } });
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const pilule = (groupe: string, mot: string) => [...container.querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => { await clic(container.querySelector('[data-collant] button[type="submit"]')!); await calmer(); };

/** Un locataire (carte complète enregistrée) et le bien 7 choisi : il ne reste que le bloc 3. */
const preparer = async () => {
  await act(async () => { root.render(createElement(CreationLocataire)); });
  await calmer();
  const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
  const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
  await saisir(nom, 'FICTIF');
  const v = form.querySelectorAll('.cp-saisie--valeur');
  await saisir(v[0] as HTMLInputElement, '06 12 34 56 78');
  await saisir(v[1] as HTMLInputElement, 'fictif@exemple.test');
  await clic(form.querySelector('button[type="submit"]')!);
  await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Fictive');
  await calmer();
  await clic(container.querySelector('.loc-choix button')!);
  await calmer();
};
/** Tous les choix obligatoires du bloc 3 (l'entretien du bien compris). */
const toutRepondre = async () => {
  await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
  await clic(pilule('Prélèvement', 'Oui'));
  await clic(pilule('Jour du prélèvement', 'au 10'));
  await clic(pilule('Garant personne physique', 'Non'));
  await clic(pilule('Assurance loyers impayés', 'Visale'));
  await clic(container.querySelector('[data-entretien-reponse="non"]')!);
  await clic(pilule('Honoraires du locataire', 'Compte bancaire agence'));
  await clic(pilule('Honoraires du propriétaire', 'Compte bancaire gestion'));
  await clic(pilule('Mode de règlement', 'Chèque'));
};

describe('🔴 « Nouveau locataire » — bloc 3 « Conditions d’entrée »', () => {
  it('après le bloc 2, en encadrés : les huit points de la fiche papier, dans l’ordre ; mêmes pilules que « Nouveau bien »', async () => {
    await preparer();
    const sections = [...container.querySelectorAll('.loc-section > h3')].map((h) => h.textContent);
    expect(sections.slice(0, 3)).toEqual(['1Le ou les locataires', '2Bien loué', '3Conditions d’entrée']);
    expect([...container.querySelectorAll('.loc-cond-bloc')].map((b) => b.getAttribute('data-cond')))
      .toEqual(['depot', 'prelevement', 'garanties', 'entretien', 'honoraires', 'sommes', 'reglement', 'commentaire']);
    expect([...container.querySelectorAll('[aria-label="Assurance loyers impayés"] button')].map((b) => b.textContent)).toEqual(['GLI', 'Visale', 'Autre', 'Aucune']);
    expect(container.querySelector('[aria-label="Dépôt de garantie"]')?.className).toBe('loc-pilules');
    // Le même composant de boutons que « Nouveau bien » (aucune copie).
    const src = readFileSync('app/(admin)/admin/(protected)/location/ConditionsEntree.tsx', 'utf8');
    expect(src).toContain("import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';");
    expect(readFileSync('app/(admin)/admin/(protected)/location/CreationBien.tsx', 'utf8')).toContain("from './Pilules';");
  });

  it('OBLIGATOIRES : dans « Reste à renseigner » ; « Enregistrer » n’envoie rien, les messages sont sous les champs', async () => {
    await preparer();
    expect(barre()).toContain('Reste à renseigner : Dépôt de garantie');
    expect(barre()).toContain('Entretien à prévoir : répondez Oui ou Non');
    await soumettre();
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-cond="depot"] .loc-manque')?.textContent).toBe('Dépôt de garantie : conservé par l’agence ou reversé au bailleur ?');
    expect(container.querySelector('[data-cond="reglement"] .loc-manque')?.textContent).toBe('Mode de règlement : Chèque, Virement ou Autre.');
    await toutRepondre();
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
  });

  it('sous-choix « au 5 / au 10 » : seulement après Oui, exigé ; Non le retire', async () => {
    await preparer();
    expect(container.querySelector('[data-cond-jour]')).toBeNull();
    await clic(pilule('Prélèvement', 'Oui'));
    expect([...container.querySelectorAll('[aria-label="Jour du prélèvement"] button')].map((b) => b.textContent)).toEqual(['au 5', 'au 10']);
    expect(barre()).toContain('Prélèvement : au 5 ou au 10');
    await clic(pilule('Prélèvement', 'Non'));
    expect(container.querySelector('[data-cond-jour]')).toBeNull();
    expect(barre()).not.toContain('au 5 ou au 10');
  });

  it('« préciser » : GLI et Autre ouvrent un champ obligatoire ; changer de choix le referme', async () => {
    await preparer();
    await toutRepondre();
    await clic(pilule('Assurance loyers impayés', 'GLI'));
    expect(container.querySelector('[data-cond-precision="assurance"] span')?.textContent).toBe('GLI : laquelle ? *');
    expect(barre()).toBe('Reste à renseigner : GLI : précisez laquelle.');
    await saisir(container.querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement, 'Assureur fictif');
    await clic(pilule('Mode de règlement', 'Autre'));
    expect(barre()).toBe('Reste à renseigner : Autre mode de règlement : précisez lequel.');
    await saisir(container.querySelector('[data-cond-precision="reglement"] input') as HTMLInputElement, 'espèces');
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
    await clic(pilule('Assurance loyers impayés', 'Aucune'));
    expect(container.querySelector('[data-cond-precision="assurance"]')).toBeNull();
  });

  it('TOTAL calculé en direct, au centime ; un montant illisible le dit et bloque', async () => {
    await preparer();
    const somme = (k: string) => container.querySelector(`[data-somme="${k}"] input`) as HTMLInputElement;
    const total = () => container.querySelector('[data-total] strong')?.textContent?.replace(/\s/g, ' ');
    expect(total()).toBe('—');
    await saisir(somme('prorataLoyer'), '412,26');
    await saisir(somme('prorataCharges'), '33,33');
    await saisir(somme('depotGarantie'), '1 180');
    await saisir(somme('honorairesAgence'), '0,1');
    expect(total()).toBe('1 625,69 €');
    await saisir(somme('honorairesAgence'), '12,345');
    expect(total()).toBe('montant illisible');
    await toutRepondre();
    expect(barre()).toContain('Honoraires agence : un montant en euros, au centime');
  });

  it('ENVOYÉ avec le bail : les conditions (jour 10, montants tels quels) et l’entretien du bien', async () => {
    await preparer();
    await toutRepondre();
    await saisir(container.querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement, '1 180');
    await saisir(container.querySelector('[data-cond="commentaire"] textarea') as HTMLTextAreaElement, 'clés remises');
    await soumettre();
    expect(posts.map((p) => p.action)).toEqual(['apercu-lots']);
    await soumettre();
    const creer = posts.find((p) => p.action === 'creer-locataires')!;
    expect(creer).toMatchObject({ lotId: 7, entretien: { aPrevoir: false, entretiens: [] } });
    expect(creer.conditions).toMatchObject({ depot: 'bailleur', prelevement: true, jour: '10', garant: false, assurance: 'visale',
      honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', reglement: 'cheque', commentaire: 'clés remises' });
    expect((creer.conditions as { sommes: Record<string, string> }).sommes.depotGarantie).toBe('1 180');
  });

  it('ENTRETIEN = la donnée du bien : pré-rempli depuis lui ; absent pour un parking (non exigé)', async () => {
    entretienDuBien = { entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-11-01' }] };
    await preparer();
    expect(container.querySelector('[data-entretien-reponse="oui"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('[data-entretien="chaudiere"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('[data-entretien-du-bien]')?.textContent).toContain('le modifier ici le modifie sur sa fiche');
    act(() => { root.unmount(); }); root = createRoot(container);
    categorie = 'parking';
    await preparer();
    expect(container.querySelector('[data-cond="entretien"]')).toBeNull();
    expect(barre()).not.toContain('Entretien');
  });

  it('SANS la migration 391 : le bloc le dit ; le locataire se crée comme avant (ni conditions ni entretien envoyés)', async () => {
    disponible = false;
    await preparer();
    expect(container.querySelector('[data-conditions-sans-migration]')?.textContent).toContain('migration 391');
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
    await soumettre();
    await soumettre();
    const creer = posts.find((p) => p.action === 'creer-locataires')!;
    expect(creer).not.toHaveProperty('conditions');
    expect(creer).not.toHaveProperty('entretien');
  });
});

describe('🔴 fiche du locataire — encart « Conditions d’entrée »', () => {
  const LUES = {
    bailCle: 'bail-x', occupationIds: [11, 12], saisiLe: '2026-10-20 10:00:00+02', saisiPar: 'arno@exemple.fr', modifiees: false,
    conditions: { depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'gli', assurancePrecision: 'Assureur fictif',
      honorairesLocataire: 'agence', honorairesProprietaire: 'agence', sommes: { prorataLoyer: 41226, prorataCharges: null, depotGarantie: 118000, honorairesAgence: null },
      reglement: 'virement', reglementPrecision: null, commentaire: null },
    lignes: [{ mot: 'Dépôt de garantie', valeur: 'Conservé par l’agence' }, { mot: 'Prélèvement', valeur: 'Oui, au 5' }, { mot: 'Total dû à l’entrée', valeur: '1 592,26 €' }],
  };
  const FICHE = (o: Record<string, unknown> = {}) => ({
    fiche: { modifiable: true }, sortie: null, preavis: [],
    locations: [{ occupationId: 11, lotId: 7, adresse: '4 rue Fictive', commune: 'PUTEAUX', entree: '2026-10-20', sortie: null, location: null }],
    conditionsEntree: [LUES], conditionsEntreeDisponible: true, ...o,
  });
  const rendre = async (fiche: unknown) => {
    global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      return ok(fiche);
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await calmer();
  };

  it('en LECTURE : une par bail, son logement, qui et quand ; le total', async () => {
    await rendre(FICHE());
    const e = container.querySelector('[data-encart-conditions-entree]')!;
    expect(e.querySelector('h3')?.textContent).toBe('Conditions d’entrée');
    expect(e.querySelectorAll('[data-conditions-bail]')).toHaveLength(1);
    expect(e.textContent).toContain('4 rue Fictive, PUTEAUX');
    expect(e.textContent).toContain('saisies le 20/10/2026 par arno@exemple.fr');
    expect([...e.querySelectorAll('dt')].map((x) => x.textContent)).toEqual(['Dépôt de garantie', 'Prélèvement', 'Total dû à l’entrée']);
  });

  it('« Modifier » : le MÊME formulaire, pré-rempli ; Enregistrer envoie « conditions-entree » pour ce bail', async () => {
    await rendre(FICHE());
    await clic(container.querySelector('[data-modifier-conditions]')!);
    expect(container.querySelector('[data-conditions-entree]')).not.toBeNull();
    expect(pilule('Jour du prélèvement', 'au 5').getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement).value).toBe('Assureur fictif');
    expect((container.querySelector('[data-somme="prorataLoyer"] input') as HTMLInputElement).value).toBe('412,26');
    // L'entretien est sur la fiche du bien, pas ici.
    expect(container.querySelector('[data-cond="entretien"]')).toBeNull();
    await clic(pilule('Prélèvement', 'Non'));
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'conditions-entree', occupationId: 11, conditions: { prelevement: false, jour: null, depot: 'agence' } });
  });

  it('un choix vidé : refusé à l’écran, rien n’est envoyé', async () => {
    await rendre(FICHE());
    await clic(container.querySelector('[data-modifier-conditions]')!);
    await clic(pilule('Dépôt de garantie', 'Conservé par l’agence'));
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-cond="depot"] .loc-manque')).not.toBeNull();
  });

  it('aucun bail saisi, ou base sans la migration : l’encart le dit', async () => {
    await rendre(FICHE({ conditionsEntree: [] }));
    expect(container.querySelector('[data-encart-conditions-entree]')?.textContent).toContain('Aucune condition d’entrée enregistrée');
    act(() => { root.unmount(); }); root = createRoot(container);
    await rendre(FICHE({ conditionsEntree: [], conditionsEntreeDisponible: false }));
    expect(container.querySelector('[data-encart-conditions-entree]')?.textContent).toContain('migration 391');
  });
});
