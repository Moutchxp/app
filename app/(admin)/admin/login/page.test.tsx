// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AdminLoginPage from './page';

/**
 * AUDIT POINT A (décision d'Arno du 15/10/2026) — la voie de secours est RETIRÉE de la page de connexion : la mention
 * « Laisser vide pour l'accès de secours » disparaît et l'adresse e-mail devient obligatoire. Le reste de la page est
 * inchangé (titre, deux champs, bouton).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLElement | null = null;
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); });

function rendre(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine!.render(createElement(AdminLoginPage)));
  return hote;
}

describe('page de connexion admin', () => {
  it('plus aucune mention de l’accès de secours', () => {
    const page = rendre();
    expect(page.textContent).not.toMatch(/secours|Laisser vide/i);
  });

  it('l’adresse e-mail est obligatoire (identifiant vide impossible depuis la page)', () => {
    const champ = rendre().querySelector<HTMLInputElement>('#admin-identifiant')!;
    expect(champ.required).toBe(true);
    expect(champ.type).toBe('email');
  });

  it('le reste est inchangé : titre, adresse, mot de passe obligatoire, bouton', () => {
    const page = rendre();
    expect(page.textContent).toContain('Administration');
    expect(page.textContent).toContain('Adresse e-mail');
    expect(page.textContent).toContain('Mot de passe');
    expect(page.querySelector<HTMLInputElement>('#admin-password')!.required).toBe(true);
    expect(page.querySelector('button[type="submit"]')!.textContent).toBe('Se connecter');
  });
});
