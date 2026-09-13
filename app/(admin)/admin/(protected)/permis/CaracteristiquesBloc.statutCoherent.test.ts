// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';

/**
 * BUG CRITIQUE « 2 cartes / 3 validés » (arithmétiquement impossible). Option A (décision Arno) : le nombre de bâtiments EST le nombre de
 * CARTES ACTIVES. On MONTE le bloc avec un nb_batiments_valide STOCKÉ PÉRIMÉ (=3) alors qu'il n'y a que 2 cartes actives (la dérive réelle,
 * causée par des retraits hors « changer le nombre ») et on prouve LE COMPORTEMENT : le statut n'affiche JAMAIS « N cartes / M validés » et
 * le champ manuel vaut le nombre de cartes ACTIVES — pas le nombre stocké. Aucune assertion de forme (couleur/classe/HTML). fetch mocké.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

function corps(id: number, avecAltitude = true) {
  return { id, repere: `B${id}`, nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: null, altitudeDernierPlancherNgfOrigine: null, altitudeSommetNgf: avecAltitude ? 30 : null, altitudeSommetNgfOrigine: avecAltitude ? 'ia' : null,
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null, altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null, altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null };
}
function etat(nbActifs: number, nbValideStocke: number | null, nbRetires: number, nbSansAltitude = 0) {
  return { faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: Array.from({ length: nbActifs }, (_, i) => corps(i + 1, i >= nbSansAltitude)), bornes: bornesTous,
    journal: { parCorps: {}, permis: {} }, naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
    nbBatimentsValide: nbValideStocke, nbBatimentsDetecte: 2,
    corpsRetires: Array.from({ length: nbRetires }, (_, i) => ({ id: 100 + i, nom: `R${i}`, valideeAltitude: false, desactiveLe: '2026-01-01', desactiveParNom: 'X' })) };
}

let root: Root | null = null; const fetchOrig = global.fetch; const confirmOrig = window.confirm;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; window.confirm = confirmOrig; });
async function flush(n = 12) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
function champNb(c: HTMLElement) { return c.querySelector('input[aria-label="Nouveau nombre de bâtiments"]') as HTMLInputElement; }
function boutonTexte(c: HTMLElement, txt: string) { return [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(txt)) as HTMLButtonElement | undefined; }
// le motif « N cartes / M validés » (numérateur ≠ dénominateur) : doit avoir DISPARU du rendu
function afficheCoherenceNombre(c: HTMLElement): boolean { return /\d+\s*cartes?\s*\/\s*\d+\s*validés?/.test((c.textContent ?? '').replace(/\s+/g, ' ')); }

// nb_batiments_valide STOCKÉ figé (périmé) ; seul le nombre de cartes ACTIVES bouge avec les gestes.
async function monter(nbActifs: number, nbValideStocke: number | null, nbRetires = 4, nbSansAltitude = 0) {
  const s = { nbActifs, nbSansAltitude };
  global.fetch = vi.fn(async (_u: unknown, opts?: { method?: string; body?: string }) => {
    if ((opts?.method ?? 'GET') === 'POST') {
      const body = JSON.parse(opts!.body ?? '{}');
      if (body.action === 'creer') s.nbActifs += 1;
      else if (body.action === 'supprimer') s.nbActifs = Math.max(0, s.nbActifs - 1);
      else if (body.action === 'nb_batiments') s.nbActifs = body.nombre; // le nombre stocké reste PÉRIMÉ dans ce mock (dérive)
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, json: async () => etat(s.nbActifs, nbValideStocke, nbRetires, s.nbSansAltitude) } as unknown as Response;
  }) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468, avecEtatFamilles: true })); });
  await flush();
  const b = boutonTexte(container, 'futurs bâtiments'); if (b) await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  return container;
}

describe('statut cohérent — le nombre de bâtiments = cartes actives (nb_batiments_valide périmé ignoré)', () => {
  it('CAS D’ARNO : 2 cartes actives, nb_batiments_valide stocké = 3, 4 retirées → JAMAIS « 2 cartes / 3 validés » ; champ manuel = 2', async () => {
    const c = await monter(2, 3, 4);
    expect(afficheCoherenceNombre(c)).toBe(false); // le motif de cohérence de NOMBRE a disparu
    expect(champNb(c).value).toBe('2');             // champ manuel = cartes ACTIVES (pas le 3 stocké)
  });

  it('« + ajouter » → cartes 2→3 : champ manuel suit (3), toujours aucun « / validés »', async () => {
    const c = await monter(2, 3, 4);
    act(() => { boutonTexte(c, '+ ajouter un bâtiment')!.click(); }); await flush();
    expect(champNb(c).value).toBe('3');
    expect(afficheCoherenceNombre(c)).toBe(false);
  });

  it('« supprimer ce bâtiment » → cartes 2→1 : champ manuel suit (1), toujours aucun « / validés »', async () => {
    window.confirm = () => true;
    const c = await monter(2, 3, 4);
    act(() => { boutonTexte(c, 'supprimer ce bâtiment')!.click(); }); await flush();
    expect(champNb(c).value).toBe('1');
    expect(afficheCoherenceNombre(c)).toBe(false);
  });

  it('l’altitude reste, elle, un motif : 2 cartes dont 1 sans altitude (valide périmé=3) → « altitude manquante (1/2) » et AUCUN « / validés »', async () => {
    const c = await monter(2, 3, 4, 1); // 1 carte sans altitude de sommet
    const txt = (c.textContent ?? '').replace(/\s+/g, ' ');
    expect(txt).toContain('altitude manquante (1/2)'); // le motif altitude fonctionne toujours
    expect(afficheCoherenceNombre(c)).toBe(false);      // mais aucune cohérence de nombre
    expect(champNb(c).value).toBe('2');
  });
});
