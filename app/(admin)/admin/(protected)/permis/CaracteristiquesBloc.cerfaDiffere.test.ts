// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DeclarationsCerfaDiffere } from './CaracteristiquesBloc';

/**
 * PC-3 étendu — la sous-section « Déclarations du Cerfa » en CHARGEMENT DIFFÉRÉ (pour un dossier dont l'instantané n'est pas encore stocké) :
 *   · pendant l'appel, elle DIT clairement que CETTE ligne se prépare (jamais muette) ;
 *   · récap trouvé → contenu (description VERBATIM) ; aucun récap → message honnête ; erreur → message d'erreur.
 * `fetch` est mocké : aucun réseau réel, aucune écriture, aucune IA.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recap = (descriptionProjet: string | null) => ({
  present: true, dateDepot: null, superficieTerrainM2: null, logementsTotal: null, logementsIndividuels: null, logementsCollectifs: null,
  niveauxDessusSol: null, niveauxDessousSol: null, stationnementAvant: null, stationnementApres: null, empriseAuSolCreeeM2: null,
  surfacePlancherTotaleM2: null, descriptionProjet, descriptionProjetProvenance: descriptionProjet ? ('texte' as const) : ('absent' as const), decompte: null, absents: [], ambigus: [],
});

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

async function monter(reponse: unknown, differer = false): Promise<HTMLElement> {
  global.fetch = vi.fn(async () => {
    if (differer) await new Promise((r) => setTimeout(r, 5));
    return { ok: true, json: async () => reponse } as unknown as Response;
  }) as unknown as typeof fetch;
  const c = document.createElement('div'); document.body.appendChild(c);
  root = createRoot(c);
  await act(async () => { root!.render(createElement(DeclarationsCerfaDiffere, { dossierId: 468 })); });
  return c;
}
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 2)); }); };

describe('PC-3 — DeclarationsCerfaDiffere (chargement différé, jamais muet)', () => {
  it('pendant la préparation → DIT que cette ligne se prépare (jamais un blanc)', async () => {
    const c = await monter({ declarationsCerfa: { declarations: recap('Immeuble neuf.'), pieceSource: 'cerfa.pdf' } }, true);
    expect(c.textContent ?? '').toContain('Préparation de cette ligne');
    await flush();
    c.remove();
  });

  it('récap trouvé → contenu affiché, description VERBATIM', async () => {
    const c = await monter({ declarationsCerfa: { declarations: recap('Surélévation et création de 3 logements.'), pieceSource: 'cerfa_13409-13.pdf' } });
    await flush();
    const t = c.textContent ?? '';
    expect(t).toContain('Déclarations du Cerfa');
    expect(t).toContain('Ce que le pétitionnaire a écrit'); // la description libre est bien remontée
    expect(t).not.toContain('Préparation de cette ligne'); // le message d'attente a disparu
    c.remove();
  });

  it('aucun récapitulatif lisible → message honnête, jamais muet', async () => {
    const c = await monter({ declarationsCerfa: null });
    await flush();
    expect(c.textContent ?? '').toContain('Aucun récapitulatif Cerfa lisible');
    c.remove();
  });

  it('échec réseau → message d’erreur explicite (jamais muet)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as unknown as typeof fetch;
    const c = document.createElement('div'); document.body.appendChild(c);
    root = createRoot(c);
    await act(async () => { root!.render(createElement(DeclarationsCerfaDiffere, { dossierId: 468 })); });
    await flush();
    expect(c.textContent ?? '').toContain('indisponible');
    c.remove();
  });
});
