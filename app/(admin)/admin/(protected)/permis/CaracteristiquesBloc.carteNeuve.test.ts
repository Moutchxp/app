// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * POINT 1 — une carte NEUVE (ou vide) est NON enregistrée. Bug : « + ajouter un bâtiment » affichait le bouton VERT « Bâtiment enregistré »
 * (règle « aucune valeur extraite » vraie par vacuité). On MONTE le bloc, on exerce le geste, on lit LE COMPORTEMENT : bouton rouge
 * « Enregistrer ce bâtiment » + titre parent en manquement « … à enregistrer … ». Aucune assertion de couleur/forme/classe.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

// origine 'saisie'/'extraite'/null par mesure B1 ; sommet validé indépendant.
function corps(id: number, o: { nbEtages?: number | null; nbEtagesOrigine?: string | null; adresse?: string | null; adresseOrigine?: string | null; sommet?: number | null; sommetOrigine?: string | null; sommetConfirmeLe?: string | null } = {}) {
  return { id, repere: `BP${id}`,
    nbEtages: o.nbEtages ?? null, nbEtagesOrigine: o.nbEtagesOrigine ?? null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: null, altitudeDernierPlancherNgfOrigine: null,
    altitudeSommetNgf: o.sommet ?? null, altitudeSommetNgfOrigine: o.sommetOrigine ?? null,
    altitudeSommetNgfConfirmeLe: o.sommetConfirmeLe ?? null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null, altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null, altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: o.adresse ?? null, adresseOrigine: o.adresseOrigine ?? null, majLe: null, majPar: null };
}
const carteNeuve = (id: number) => corps(id); // tout null (comme après « + ajouter »)
const carteSommetValideSansB1 = (id: number) => corps(id, { sommet: 30, sommetOrigine: 'saisie', sommetConfirmeLe: '2026-01-01' }); // altitude OK, aucune valeur B1
const carteEnregistree = (id: number) => corps(id, { nbEtages: 3, nbEtagesOrigine: 'saisie', sommet: 30, sommetOrigine: 'saisie', sommetConfirmeLe: '2026-01-01' });

function etat(corpsList: object[]) {
  return { faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: corpsList, bornes: bornesTous, journal: { parCorps: {}, permis: {} }, naturesPossibles: [], piecesParNom: {},
    destinationsPossibles: [], margeCoherenceSommetM: 0.1, nbBatimentsValide: null, nbBatimentsDetecte: null, corpsRetires: [] };
}

let root: Root | null = null; const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });
async function flush(n = 12) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
function boutons(c: HTMLElement, txt: string) { return [...c.querySelectorAll('button')].filter((b) => (b.textContent ?? '') === txt); }
function unBouton(c: HTMLElement, inclut: string) { return [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(inclut)); }

async function monter(corpsInitial: object[], apresCreer?: object[]) {
  let cs = corpsInitial;
  global.fetch = vi.fn(async (_u: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') {
      const body = JSON.parse(opts!.body ?? '{}');
      if (body.action === 'creer' && apresCreer) cs = apresCreer;
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, json: async () => etat(cs) } as unknown as Response;
  }) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468, avecEtatFamilles: true, durcirStatutFraicheur: true })); });
  await flush();
  const b = unBouton(container, 'futurs bâtiments'); if (b) await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  return container;
}

describe('POINT 1 — carte neuve / vide = NON enregistrée', () => {
  it('carte à SOMMET VALIDÉ mais SANS valeur B1 → bouton « Enregistrer ce bâtiment » (rouge) + titre « … à enregistrer »', async () => {
    const c = await monter([carteSommetValideSansB1(1)]);
    expect(boutons(c, 'Enregistrer ce bâtiment').length).toBe(1); // NON enregistré (rouge)
    expect(boutons(c, 'Bâtiment enregistré').length).toBe(0);      // surtout pas « enregistré » par vacuité
    expect((c.textContent ?? '')).toContain('à enregistrer');      // le titre parent signale le manquement
  });

  it('« + ajouter un bâtiment » → la carte neuve est NON enregistrée (bouton « Enregistrer ce bâtiment »)', async () => {
    const c = await monter([carteEnregistree(1)], [carteEnregistree(1), carteNeuve(2)]);
    // au départ : 1 carte enregistrée (verte)
    expect(boutons(c, 'Bâtiment enregistré').length).toBe(1);
    act(() => { unBouton(c, '+ ajouter un bâtiment')!.click(); }); await flush();
    // après ajout : la carte neuve apparaît NON enregistrée
    expect(boutons(c, 'Enregistrer ce bâtiment').length).toBe(1); // la neuve
    expect(boutons(c, 'Bâtiment enregistré').length).toBe(1);      // l'ancienne reste enregistrée (non-régression)
    expect((c.textContent ?? '')).toContain('à enregistrer');       // le titre parent bascule en manquement
  });

  it('NON-RÉGRESSION : carte réellement enregistrée (valeur saisie) → « Bâtiment enregistré » (vert), pas de « à enregistrer »', async () => {
    const c = await monter([carteEnregistree(1)]);
    expect(boutons(c, 'Bâtiment enregistré').length).toBe(1);
    expect(boutons(c, 'Enregistrer ce bâtiment').length).toBe(0);
    expect((c.textContent ?? '')).not.toContain('à enregistrer');
  });

  it('NON-RÉGRESSION : carte à valeur EXTRAITE non confirmée → « Enregistrer ce bâtiment » (rouge)', async () => {
    const c = await monter([corps(1, { nbEtages: 3, nbEtagesOrigine: 'extraite', sommet: 30, sommetOrigine: 'saisie', sommetConfirmeLe: '2026-01-01' })]);
    expect(boutons(c, 'Enregistrer ce bâtiment').length).toBe(1);
    expect(boutons(c, 'Bâtiment enregistré').length).toBe(0);
  });
});
