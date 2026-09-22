// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Écran d'aperçu — le bouton « Télécharger ce document ».
 *
 * PROUVE le correctif A du 22/09 : le lien N'A PLUS l'attribut `download`. C'est le SERVEUR qui pilote
 * l'enregistrement (`Content-Disposition: attachment`, nom de fichier compris) ; `download` était redondant et
 * engageait le chemin « téléchargement piloté par le navigateur », qui sur Safari iOS rejoue la requête dans un
 * contexte n'attachant pas toujours le cookie de session (journal du 22/09 : un 200 suivi d'un 401 sur la MÊME URL).
 * La destination, le libellé et la place du bouton sont INCHANGÉS.
 *
 * `next/link` et `next/dynamic` sont neutralisés : on teste CE composant, pas le routeur ni PDF.js.
 */
vi.mock('next/link', () => ({
  default: ({ href, children, ...r }: { href: string; children: unknown }) =>
    createElement('a', { href, ...r }, children as never),
}));
vi.mock('next/dynamic', () => ({ default: () => () => createElement('div', { 'data-pdf': 'stub' }) }));

import ApercuDocument from './ApercuDocument';
import { LIB_TELECHARGER_DOCUMENT, LIB_RETOUR_ESPACE } from './presentation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

/** Rend l'écran et renvoie les liens produits. */
function rendre(props: Partial<Parameters<typeof ApercuDocument>[0]> = {}) {
  act(() => {
    root.render(createElement(ApercuDocument, {
      certificatId: 468, doc: 'visuel', analyseId: 42, disponible: true, ...props,
    } as Parameters<typeof ApercuDocument>[0]));
  });
  return [...container.querySelectorAll('a')];
}

const lienTelecharger = (liens: HTMLAnchorElement[]) =>
  liens.find((a) => (a.textContent ?? '').includes(LIB_TELECHARGER_DOCUMENT));

describe('bouton « Télécharger ce document »', () => {
  it('LE TEST DU LOT — n’a PLUS l’attribut `download`', () => {
    const lien = lienTelecharger(rendre());
    expect(lien).toBeDefined();
    expect(lien!.hasAttribute('download')).toBe(false);
  });

  it('pointe TOUJOURS vers la même route avec `?telecharger=1` (destination inchangée)', () => {
    const lien = lienTelecharger(rendre());
    expect(lien!.getAttribute('href')).toBe(
      '/api/internaute/espace/certificats/468/telecharger?doc=visuel&telecharger=1',
    );
  });

  it.each(['nominatif', 'anonyme', 'visuel'] as const)('vaut pour les trois documents (%s)', (doc) => {
    const lien = lienTelecharger(rendre({ doc }));
    expect(lien!.hasAttribute('download')).toBe(false);
    expect(lien!.getAttribute('href')).toBe(
      `/api/internaute/espace/certificats/468/telecharger?doc=${doc}&telecharger=1`,
    );
  });

  it('libellé et place inchangés : le bouton reste AVANT « Retour »', () => {
    const liens = rendre();
    const textes = liens.map((a) => a.textContent);
    expect(textes).toContain(LIB_TELECHARGER_DOCUMENT);
    expect(textes.indexOf(LIB_TELECHARGER_DOCUMENT)).toBeLessThan(textes.indexOf(LIB_RETOUR_ESPACE));
  });

  it('« Retour » ramène à l’espace sur l’analyse d’où l’on vient (inchangé)', () => {
    const retour = rendre().find((a) => (a.textContent ?? '').includes(LIB_RETOUR_ESPACE));
    expect(retour!.getAttribute('href')).toBe('/espace?analyse=42');
  });

  it('nominatif pas encore déposé → aucun lien de téléchargement, seulement le retour', () => {
    const liens = rendre({ doc: 'nominatif', disponible: false });
    expect(lienTelecharger(liens)).toBeUndefined();
    expect(liens.some((a) => (a.textContent ?? '').includes(LIB_RETOUR_ESPACE))).toBe(true);
  });
});
