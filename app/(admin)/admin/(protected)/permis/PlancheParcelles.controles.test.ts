// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * NON-RÉGRESSION — PRÉSENCE ET PLACEMENT des contrôles du bloc « Planche cadastrale » (comportement, DOM réel).
 *
 * Pourquoi ce test existe : l'alignement des colonnes (f30e208) avait DESCENDU la saisie d'adresse ET le curseur
 * « Voisines à … » SOUS le schéma cadastral. Sur un schéma haut (et en iPhone portrait), ces contrôles partaient
 * hors de vue : cliquer « Centrer sur l'adresse » ne montrait « rien » — la saisie semblait avoir disparu. Les tests
 * existants (lecture de SOURCE, `toContain`) ne l'ont pas vu : le JSX EXISTAIT dans le fichier, simplement mal placé.
 *
 * On MONTE donc réellement le composant (jsdom) et on prouve LE COMPORTEMENT :
 *   (1) les trois modes de centrage, le curseur des voisines et la validation sont PRÉSENTS ;
 *   (2) la saisie d'adresse APPARAÎT au clic « Centrer sur l'adresse » ;
 *   (3) — le cœur de la régression — saisie d'adresse ET curseur sont AU-DESSUS du schéma (ordre DOM), donc visibles
 *       juste sous la barre « Centrer : » où on les déclenche, jamais repoussés sous un grand schéma ;
 *   (4) les mêmes contrôles restent disponibles dans le PLEIN ÉCRAN du schéma (une seule source de vérité).
 * La liseuse (enfant réseau/pdf.js) est STUBBÉE ; aucun appel réseau réel (fetch mocké).
 */
vi.mock('./LiseusePieces', () => ({ LiseusePieces: () => null }));

import { PlancheParcelles } from './PlancheParcelles';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Planche = Record<string, unknown>;
// Planche NORMALE : empreinte + 1 parcelle du permis + 1 voisine → le schéma DESSINE (svg présent) et `parcellesChoix`
//   est non vide (pas d'auto-bascule en mode adresse : on teste le clic MANUEL sur « Centrer sur l'adresse »).
const planche = (): Planche => ({
  schema: { largeur: 360, hauteur: 300, empreintePath: 'M0,0 L10,0 L10,10 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'P1', path: 'M0,0 L10,0 L10,10 Z', cx: 5, cy: 5, horsEmpreinte: false },
      { repere: 'B', cleabs: 'P2', path: 'M20,0 L30,0 L30,10 Z', cx: 25, cy: 5, horsEmpreinte: true },
    ],
    transform: { minX: 0, minY: 0, scale: 1, padX: 0, padY: 0, hauteur: 300 } },
  meta: [
    { idu: 'P1', section: 'AB', numero: '1', retenue: true, origine: 'extraite', surfaceM2: 100, majPar: null, majLe: null, acteurNom: null },
    { idu: 'P2', section: 'AB', numero: '2', retenue: false, origine: null, surfaceM2: 80, majPar: null, majLe: null, acteurNom: null },
  ],
  rayonM: 50, nbRetenues: 1, nbVoisines: 1, motif: null,
  centre: { mode: 'empreinte', idu: null, point: null, provenance: null, label: null },
  centreAvertissement: null, marqueurAdresse: null,
  parcellesChoix: [{ idu: 'P1', section: 'AB', numero: '1' }],
  localisation: { communeCode: '75119', communeNom: 'Paris 19e', sections: ['AB'], feuilleLibelle: 'Paris 19e — section AB', feuilleNote: '' },
  selection: { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null },
  retenuesHorsVue: 0,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ planche: planche() }) } as unknown as Response)) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

async function flush(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
function boutonTexte(txt: string, racine: ParentNode = container): HTMLButtonElement | null {
  return [...racine.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === txt) as HTMLButtonElement | null ?? null;
}
// Vrai si `avant` PRÉCÈDE `apres` dans l'ordre du document (placement « au-dessus » dans une colonne flex verticale).
function precede(avant: Element | null, apres: Element | null): boolean {
  if (!avant || !apres) return false;
  return (apres.compareDocumentPosition(avant) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

describe('Planche cadastrale — présence des contrôles (comportement, DOM réel)', () => {
  it('les TROIS modes de centrage + le curseur « Voisines à … » + la validation sont présents au chargement', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // (1) trois modes de centrage
    expect(boutonTexte('Toutes les parcelles')).not.toBeNull();
    expect(boutonTexte('Centrer sur une parcelle')).not.toBeNull();
    expect(boutonTexte('Centrer sur l’adresse')).not.toBeNull();
    // curseur des voisines (inconditionnel) : label + input range
    expect(container.textContent).toContain('Voisines à');
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    // validation : au chargement la composition = défaut → « Modifier la sélection » (acquise) ; le schéma est dessiné
    expect(boutonTexte('Modifier la sélection')).not.toBeNull();
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('la SAISIE D’ADRESSE apparaît au clic « Centrer sur l’adresse » (+ « Localiser »)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    expect(container.querySelector('input[aria-label="Adresse à localiser"]')).toBeNull(); // gate : absente en mode empreinte
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    expect(container.querySelector('input[aria-label="Adresse à localiser"]')).not.toBeNull();
    expect(boutonTexte('Localiser')).not.toBeNull();
  });

  it('RÉGRESSION f30e208 — saisie d’adresse ET curseur sont AU-DESSUS du schéma (ordre DOM), pas repoussés dessous', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    const svg = container.querySelector('svg[role="img"]');
    // le curseur (toujours affiché) précède le schéma
    expect(precede(container.querySelector('input[type="range"]'), svg)).toBe(true);
    // en mode adresse, la saisie précède le schéma (juste sous la barre « Centrer : », jamais sous le dessin)
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    const svgApres = container.querySelector('svg[role="img"]');
    expect(precede(container.querySelector('input[aria-label="Adresse à localiser"]'), svgApres)).toBe(true);
    expect(precede(container.querySelector('input[type="range"]'), svgApres)).toBe(true);
  });

  it('PLEIN ÉCRAN — les contrôles de sélection restent disponibles dans le dialog agrandi (saisie d’adresse + curseur)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // passer en mode adresse puis agrandir
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    act(() => { boutonTexte('⤢ Agrandir le schéma')!.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    // dans le plein écran : saisie d'adresse, curseur des voisines et validation sont là (même état de composant partagé)
    expect(dialog!.querySelector('input[aria-label="Adresse à localiser"]')).not.toBeNull();
    expect(dialog!.querySelector('input[type="range"]')).not.toBeNull();
    expect(dialog!.textContent).toContain('Voisines à');
    expect(boutonTexte('Localiser', dialog!)).not.toBeNull();
    // et toujours au-dessus du schéma agrandi
    expect(precede(dialog!.querySelector('input[aria-label="Adresse à localiser"]'), dialog!.querySelector('svg[role="img"]'))).toBe(true);
  });
});
