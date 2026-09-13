// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * (A)+(B1) — le bouton « Enregistrer ce bâtiment » REFLÈTE SON ÉTAT : VERT « Bâtiment enregistré » quand la saisie correspond à l'état en
 * base ; ROUGE « Enregistrer ce bâtiment » dès qu'un champ enregistré est modifié (repère, adresse, ou une des 7 mesures hors sommet),
 * y compris s'il est vidé ; revenir à la valeur d'origine rend le vert. Après un ré-enregistrement, retour au vert. On MONTE réellement
 * le bloc (jsdom) ; aucun réseau réel (fetch mocké) ; on n'asserte que le COMPORTEMENT (libellé du bouton), jamais une couleur/classe.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));
const libelle = (cle: string) => MESURES.find((m) => m.cle === cle)!.libelle;

// Corps TEL QUE json_build_object le rend (mesures = NOMBRES). Une carte DÉJÀ renseignée (donc « enregistrée à jour » au chargement).
function corpsInitial() {
  return {
    id: 5, repere: 'B1',
    nbEtages: 3, nbEtagesOrigine: 'saisie', nbNiveauxSousSol: 1, nbNiveauxSousSolOrigine: 'saisie',
    altitudeDernierPlancherNgf: 10, altitudeDernierPlancherNgfOrigine: 'saisie',
    altitudeSommetNgf: 20, altitudeSommetNgfOrigine: 'saisie',
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: '1 rue de la Paix', adresseOrigine: 'saisie', majLe: null, majPar: null,
  };
}
function etatAvec(corps: object) {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: [corps], bornes: bornesTous,
    journal: { parCorps: {}, permis: {} },
    naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

// Saisie dans un input CONTRÔLÉ React (setter natif + événement 'input').
function saisir(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function inputParLabel(c: HTMLElement, label: string): HTMLInputElement {
  const el = [...c.querySelectorAll('input')].find((i) => i.getAttribute('aria-label') === label);
  if (!el) throw new Error(`input introuvable: ${label}`);
  return el as HTMLInputElement;
}
function libelleBouton(c: HTMLElement): string | null {
  const b = [...c.querySelectorAll('button')].find((x) => /Enregistrer ce bâtiment|Bâtiment enregistré/.test(x.textContent ?? ''));
  return b ? (b.textContent ?? '').trim() : null;
}
function boutonEnregistrer(c: HTMLElement): HTMLButtonElement {
  const b = [...c.querySelectorAll('button')].find((x) => /Enregistrer ce bâtiment|Bâtiment enregistré/.test(x.textContent ?? ''));
  if (!b) throw new Error('bouton d’enregistrement introuvable');
  return b as HTMLButtonElement;
}

async function monter(): Promise<{ c: HTMLElement; getPosts: () => number }> {
  const etatCourant = etatAvec(corpsInitial());
  let posts = 0;
  global.fetch = vi.fn(async (_url: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') {
      posts++;
      const body = JSON.parse(opts!.body ?? '{}');
      if (body.action === 'corps') { // reproduit l'écriture serveur → le GET suivant (rafraichir) reflète la nouvelle base
        const cc = etatCourant.corps[0] as Record<string, unknown>;
        if ('repere' in body) cc.repere = body.repere;
        if ('adresse' in body) cc.adresse = body.adresse;
        if (body.valeurs) Object.assign(cc, body.valeurs); // clés valeurs == clés corps (mêmes noms), nombres|null
      }
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, json: async () => etatCourant } as unknown as Response;
  }) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468 })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const btn = [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('futurs bâtiments'));
  if (btn) await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return { c: container, getPosts: () => posts };
}

describe('(A)+(B1) — « Enregistrer ce bâtiment » reflète l’état d’enregistrement', () => {
  it('au chargement, une carte à jour affiche « Bâtiment enregistré »', async () => {
    const { c } = await monter();
    expect(libelleBouton(c)).toBe('Bâtiment enregistré');
  });

  it('modifier PLUSIEURS champs différents repasse au rouge ; revenir à la valeur d’origine redonne le vert', async () => {
    const { c } = await monter();
    // (1) une mesure numérique
    saisir(inputParLabel(c, libelle('nbEtages')), '4');
    expect(libelleBouton(c)).toBe('Enregistrer ce bâtiment');
    saisir(inputParLabel(c, libelle('nbEtages')), '3'); // valeur d'origine
    expect(libelleBouton(c)).toBe('Bâtiment enregistré');
    // (2) l'adresse (texte)
    saisir(inputParLabel(c, 'Adresse du bâtiment'), '2 avenue Neuve');
    expect(libelleBouton(c)).toBe('Enregistrer ce bâtiment');
    saisir(inputParLabel(c, 'Adresse du bâtiment'), '1 rue de la Paix');
    expect(libelleBouton(c)).toBe('Bâtiment enregistré');
    // (3) une autre mesure : altitude du dernier plancher
    saisir(inputParLabel(c, libelle('altitudeDernierPlancherNgf')), '11');
    expect(libelleBouton(c)).toBe('Enregistrer ce bâtiment');
    saisir(inputParLabel(c, libelle('altitudeDernierPlancherNgf')), '10');
    expect(libelleBouton(c)).toBe('Bâtiment enregistré');
    // (4) VIDER un champ rempli est une modification
    saisir(inputParLabel(c, libelle('nbNiveauxSousSol')), '');
    expect(libelleBouton(c)).toBe('Enregistrer ce bâtiment');
    saisir(inputParLabel(c, libelle('nbNiveauxSousSol')), '1');
    expect(libelleBouton(c)).toBe('Bâtiment enregistré');
  });

  it('ré-enregistrer après modification redonne « Bâtiment enregistré »', async () => {
    const { c, getPosts } = await monter();
    saisir(inputParLabel(c, libelle('altitudeTerrainNaturelNgf')), '5');
    expect(libelleBouton(c)).toBe('Enregistrer ce bâtiment');
    await act(async () => { boutonEnregistrer(c).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getPosts()).toBeGreaterThan(0);            // l'écriture a bien eu lieu (comportement d'écriture inchangé)
    expect(libelleBouton(c)).toBe('Bâtiment enregistré'); // et l'état est de nouveau à jour
  });
});
