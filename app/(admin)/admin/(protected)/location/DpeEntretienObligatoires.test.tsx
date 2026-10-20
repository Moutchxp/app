// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { SectionLocationBien } from '../gestion/SectionsLocationFiche';

/**
 * 🔴 Arno (18/10/2026) : à la création d'un LOGEMENT ou d'un LOCAL (« Ajouter un nouveau bien », et le même formulaire
 * enchaîné après « Créer un nouveau propriétaire »), le DPE (A–G ou « Non soumis », date sauf « Non soumis ») et
 * « Entretien à prévoir » (Oui / Non, rien de présélectionné ; Oui ⇒ au moins un entretien) sont OBLIGATOIRES. Alertes non
 * bloquantes : classe G, DPE de plus de 10 ans. Parking nu non concerné. Bien existant : jamais bloqué, « … à renseigner ».
 * Les VRAIS composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** « Bien en gestion ? » (Arno, 20/10/2026) : obligatoire ; ces épreuves portent sur autre chose, on y répond Oui d'emblée. */
const repondreEnGestion = async () => {
  const oui = document.querySelector('[data-question-gestion="bien"] button');
  if (oui !== null) await act(async () => { oui.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const bienFiche = (id: number, o: Record<string, unknown> = {}) => ({
  id, numero: String(id), adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null,
  categorie: 'logement', etage: null, porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: null,
  proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: false, ...o,
});
const complementsVides = (o: Record<string, unknown> = {}) => ({
  batiment: null, escalier: null, typeLogement: 'studio', nombrePieces: null, meuble: null, surfaceHabitableM2: null, syndicId: null, syndicNom: null,
  epoqueConstruction: null, chauffage: null, dpeClasse: null, dpeDate: null, dpeNonSoumis: null, commentaire: null, typeLocal: null, parkingSituation: null,
  parkingType: null, surfaceM2: null, ascenseur: null, digicode: null, digicodeCode: null, precisionAcces: null, agApplicable: false,
  entretienAPrevoir: null, entretiens: [], ...o,
});
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let defile: Element[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; defile = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { defile.push(this); };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ logementId: 9 }); }
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    // Un bien IMPORTÉ (WIPPIMMO) sans DPE ni entretien ; un parking nu.
    if (u.includes('lot=10')) {
      return ok({ fiche: { id: 10, numero: '10', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
        bien: bienFiche(10), parent: null, rattachables: [], locations: [], location372: true, annexes: [], sortie: null, complements: complementsVides() });
    }
    if (u.includes('lot=20')) {
      return ok({ fiche: { id: 20, numero: '20', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
        bien: bienFiche(20, { categorie: 'parking' }), parent: null, rattachables: [], locations: [], location372: true, annexes: [], sortie: null,
        complements: complementsVides({ typeLogement: null, parkingType: 'box_simple' }) });
    }
    // Des imports WIPPIMMO SANS catégorie : la famille se déduit de la nature (Appartement meublé → logement, Garage → parking).
    for (const [lot, nature] of [[30, 'Appartement meublé'], [40, 'Garage']] as const) {
      if (u.includes(`lot=${lot}`)) {
        return ok({ fiche: { id: lot, numero: String(lot), adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
          bien: bienFiche(lot, { categorie: null, nature }), parent: null, rattachables: [], locations: [], location372: true, annexes: [], sortie: null,
          complements: complementsVides({ typeLogement: null }) });
      }
    }
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const famille = async (f: string) => { await clic(container.querySelector(`[data-famille="${f}"]`)!); };
const dpe = (mot: string) => [...container.querySelectorAll('[aria-label="Classe DPE"] button')].find((b) => b.textContent?.replace('✓ ', '') === mot)!;
const dateDpe = () => container.querySelector('[data-dpe-date] input') as HTMLInputElement;
const entretien = (v: 'oui' | 'non') => container.querySelector(`[data-entretien-reponse="${v}"]`)!;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
/** Logement minimal : famille, type, adresse — sans DPE ni entretien. */
const logementMinimal = async (f: 'logement' | 'local' = 'logement') => {
  await famille(f);
  if (f === 'logement') await clic(container.querySelectorAll('[aria-label="Type de logement"] button')[0]);
  else await clic([...container.querySelectorAll('[aria-label="Type de local"] button')][1]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
};
const rendre = async (props: Parameters<typeof CreationBien>[0] = { proprietairesInitiaux: [1] }) => {
  await act(async () => { root.render(createElement(CreationBien, props)); });
  await calmer();
  await repondreEnGestion();
};

describe('🔴 « Ajouter un nouveau bien » : DPE et entretien obligatoires (logement, local)', () => {
  it('libellés marqués « * » ; rien de présélectionné pour l’entretien ; la barre « Reste à renseigner » les compte', async () => {
    await rendre();
    await logementMinimal();
    expect(container.querySelector('[data-dpe] h4')?.textContent).toBe('DPE *');
    expect(container.querySelector('[data-dpe-date] span')?.textContent).toBe('Date du DPE *');
    expect(container.querySelector('[data-entretien-bloc] h4')?.textContent).toBe('Entretien à prévoir *');
    expect([...container.querySelectorAll('[aria-label="Classe DPE"] button')].map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Non soumis']);
    // Ni Oui ni Non présélectionné.
    expect([entretien('oui'), entretien('non')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(barre()).toContain('Choisissez la classe DPE (A à G) ou « Non soumis »');
    expect(barre()).toContain('La date du DPE est obligatoire (sauf « Non soumis »)');
    expect(barre()).toContain('Entretien à prévoir : répondez Oui ou Non');
    // La date ne peut dépasser aujourd'hui (le sélecteur l'interdit, la règle la refuse).
    expect(dateDpe().max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('bloqué sans classe : rien n’est envoyé, le message est sous le champ et la page défile jusqu’au bloc DPE', async () => {
    await rendre();
    await logementMinimal();
    await soumettre();
    expect(posts).toEqual([]);
    const blocDpe = container.querySelector('[data-dpe]') as HTMLElement;
    expect(blocDpe.querySelector('.loc-manque')?.textContent).toBe('Choisissez la classe DPE (A à G) ou « Non soumis ».');
    expect(defile[0]).toBe(blocDpe);
    expect(container.querySelector('[data-entretien-bloc] .loc-manque')?.textContent).toBe('Entretien à prévoir : répondez Oui ou Non.');
  });

  it('bloqué sans date, puis sans Oui / Non, puis avec Oui sans entretien ; enregistré avec un entretien', async () => {
    await rendre();
    await logementMinimal();
    await clic(dpe('C'));
    await soumettre();
    expect(posts).toEqual([]);
    expect((container.querySelector('[data-dpe]') as HTMLElement).querySelector('.loc-manque')?.textContent).toBe('La date du DPE est obligatoire (sauf « Non soumis »).');
    await saisir(dateDpe(), '2023-05-10');
    await soumettre();
    expect(posts).toEqual([]);
    expect(defile.at(-1)).toBe(container.querySelector('[data-entretien-bloc]'));
    await clic(entretien('oui'));
    await soumettre();
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-entretien-bloc] .loc-manque')?.textContent)
      .toBe('Entretien à prévoir : cochez ou ajoutez au moins un entretien (Chaudière, Ramonage ou un autre entretien nommé).');
    // Un « Autre » sans nom ne compte pas.
    await clic(container.querySelector('[data-ajouter-entretien]')!);
    await soumettre();
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-entretien="autre"] .loc-manque')?.textContent).toBe('Autre entretien 1 : donnez-lui un nom (ex. Climatisation, VMC).');
    await saisir(container.querySelector('[data-entretien="autre"] input:not([type])') as HTMLInputElement, 'VMC');
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0].logement).toMatchObject({ dpeClasse: 'C', dpeDate: '2023-05-10', entretienAPrevoir: true, entretiens: [{ sorte: 'autre', nom: 'VMC', dateAnniversaire: '' }] });
  });

  it('« Non soumis » sans date est accepté (date grisée, vidée) — pour un local aussi', async () => {
    await rendre();
    await logementMinimal('local');
    await saisir(dateDpe(), '2020-01-01');
    await clic(dpe('Non soumis'));
    expect(dateDpe().disabled).toBe(true);
    expect(dateDpe().value).toBe('');
    expect(container.querySelector('[data-dpe-date] span')?.textContent).toBe('Date du DPE (sans objet)');
    await clic(entretien('non'));
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0].logement).toMatchObject({ famille: 'local', dpeClasse: 'non_soumis', dpeDate: '', entretienAPrevoir: false, entretiens: [] });
  });

  it('alertes NON bloquantes : classe G (« Location interdite depuis le 01/01/2025… ») et DPE de plus de 10 ans', async () => {
    await rendre();
    await logementMinimal();
    await clic(dpe('G'));
    await saisir(dateDpe(), '2012-02-01');
    const alertes = () => [...container.querySelectorAll('[data-alerte-dpe]')].map((x) => x.textContent);
    expect(alertes()).toEqual(['⚠ Location interdite depuis le 01/01/2025 pour un nouveau bail', '⚠ DPE de plus de 10 ans : il n’est plus valable']);
    await clic(entretien('non'));
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0].logement).toMatchObject({ dpeClasse: 'G', dpeDate: '2012-02-01' });
    // « Non soumis » : aucune alerte.
    await clic(dpe('Non soumis'));
    expect(alertes()).toEqual([]);
  });

  it('date dans le futur refusée', async () => {
    await rendre();
    await logementMinimal();
    await clic(dpe('B'));
    await saisir(dateDpe(), '2999-01-01');
    await clic(entretien('non'));
    await soumettre();
    expect(posts).toEqual([]);
    expect((container.querySelector('[data-dpe]') as HTMLElement).querySelector('.loc-manque')?.textContent).toBe('La date du DPE ne peut pas être dans le futur.');
  });

  it('un parking nu n’est pas concerné (ni DPE ni entretien, enregistré sans eux)', async () => {
    await rendre();
    await famille('parking');
    await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
    await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
    expect(container.querySelector('[data-dpe]')).toBeNull();
    expect(container.querySelector('[data-entretien-bloc]')).toBeNull();
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts).toHaveLength(1);
  });

  it('le même formulaire enchaîné après « Créer un nouveau propriétaire » applique la même règle', async () => {
    const creerFiches = vi.fn(async () => ({ ids: [41] }));
    await rendre({ proprietairesInitiaux: [], continuite: { proprietaires: [{ nom: 'NOUVEAU Jean' }], contacts: [], creerFiches } });
    await logementMinimal();
    await soumettre();
    expect(creerFiches).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
    expect(container.textContent).toContain('pour un logement ou un local, le DPE et l’entretien à prévoir');
    await clic(dpe('A'));
    await saisir(dateDpe(), '2025-06-01');
    await clic(entretien('non'));
    await soumettre();
    expect(creerFiches).toHaveBeenCalledTimes(1);
    expect(posts[0]).toMatchObject({ action: 'creer-bien', proprietaireIds: [41] });
  });
});

describe('🔴 bien existant (import WIPPIMMO) : jamais bloqué, « DPE à renseigner » / « Entretien à renseigner »', () => {
  it('les mentions sont dans la section Location ; « Modifier » s’enregistre sans DPE ni entretien', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    expect(container.querySelector('summary')?.textContent).toContain('DPE à renseigner · Entretien à renseigner');
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    expect([...comp.querySelectorAll('[data-a-renseigner-bien] span')].map((x) => x.textContent)).toEqual(['DPE à renseigner', 'Entretien à renseigner']);
    expect(comp.querySelector('[data-a-renseigner="DPE"]')?.textContent).toBe('DPE à renseigner');
    expect(comp.querySelector('[data-a-renseigner="Entretien à prévoir"]')?.textContent).toBe('Entretien à renseigner');
    await clic([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Modifier')!);
    // « Non soumis » est proposé aussi dans la fiche.
    expect([...comp.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'non_soumis' && o.textContent === 'Non soumis'))).toBe(true);
    await clic([...comp.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer')!);
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'complements-bien', id: 10, champs: { dpeClasse: '', dpeDate: '', entretienAPrevoir: null } });
  });

  it('un parking nu existant : aucune mention', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 20, ouvrir: () => {} })); });
    await calmer();
    expect(container.querySelector('[data-a-renseigner-bien]')).toBeNull();
    expect(container.textContent).not.toContain('à renseigner');
  });

  it('un import WIPPIMMO sans catégorie : famille déduite de sa nature (Appartement meublé → mentions ; Garage → aucune)', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 30, ouvrir: () => {} })); });
    await calmer();
    expect([...container.querySelectorAll('[data-a-renseigner-bien] span')].map((x) => x.textContent)).toEqual(['DPE à renseigner', 'Entretien à renseigner']);
    act(() => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 40, ouvrir: () => {} })); });
    await calmer();
    expect(container.querySelector('[data-a-renseigner-bien]')).toBeNull();
  });
});
