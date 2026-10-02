// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CadreMail, CSS_CADRE_MAIL } from './CadreMail';
import { SANDBOX_CADRE } from '../../../../lib/gestion/cadreMail';

/**
 * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE CADRE, MONTÉ POUR DE VRAI ════════════════════════════════════════════════
 *
 * ⚠️ CE QUE JSDOM NE SAIT PAS FAIRE, ET QUI EST ÉPROUVÉ AILLEURS : il ne met rien en page, il ne charge pas un
 * `srcdoc` et il n'applique aucune feuille de style. La HAUTEUR AUTOMATIQUE et l'APPLICATION DU `<style>` du mail
 * se vérifient donc dans Chrome, sur la vraie page (mesures au rapport du lot). Ce qui se vérifie ICI, c'est ce
 * qui ne dépend pas de la mise en page : le bac à sable, le document posé, et l'absence de script.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const monter = async (props: Record<string, unknown>) => {
  await act(async () => { root.render(createElement(CadreMail, props as never)); });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  return container.querySelector('iframe') as HTMLIFrameElement;
};

describe('🔴🔴 le cadre isolé d’un mail reçu', () => {
  it('🔴🔴 son bac à sable est celui du module pur — et il n’a PAS `allow-scripts`', async () => {
    const f = await monter({ html: '<p>bonjour</p>' });
    expect(f.getAttribute('sandbox')).toBe(SANDBOX_CADRE);
    expect(f.getAttribute('sandbox')).not.toContain('allow-scripts');
  });

  it('🔴🔴 le document posé porte la CSP, la feuille du mail, et aucun script', async () => {
    const f = await monter({
      html: '<a href="https://app.monga.io/x">Vers Mission</a>',
      cssMail: '.bouton{background:#1B4DFF}',
    });
    const doc = f.getAttribute('srcdoc') ?? '';
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain('.bouton{background:#1B4DFF}');
    expect(doc).toContain('<base target="_blank">');
    expect(doc).not.toContain('<script');
    expect(doc).not.toMatch(/\son[a-z]+\s*=/i);
  });

  /**
   * 🔴 LE `<style>` DU MAIL N'ATTEINT JAMAIS L'APPLICATION. Il n'est écrit QUE dans le `srcdoc` : aucune balise
   * `<style>` n'est posée dans la page, et le texte de la feuille n'y apparaît nulle part.
   */
  it('🔴🔴 la feuille du mail ne touche pas l’application', async () => {
    const avant = document.querySelectorAll('style').length;
    const f = await monter({ html: '<p>x</p>', cssMail: 'body{background:#ff0000}' });
    /**
     * 🔴🔴 CE QUI COMPTE : AUCUNE BALISE `<style>` N'EST POSÉE DANS LA PAGE. La feuille du mail n'existe qu'en
     * TEXTE, dans l'attribut `srcdoc` du cadre — c'est-à-dire nulle part où un navigateur l'appliquerait à
     * l'application. Elle ne devient une feuille qu'à l'intérieur du cadre, où elle ne peint que le mail.
     *
     * ⚠️ C'EST BIEN UN ATTRIBUT, PAS UN NŒUD : chercher la chaîne dans `innerHTML` la trouverait forcément (elle
     * y est, échappée, dans `srcdoc`) et ne prouverait rien. On compte donc les ÉLÉMENTS.
     */
    expect(container.querySelector('style')).toBeNull();
    expect(document.querySelectorAll('style').length).toBe(avant);
    expect(f.getAttribute('srcdoc')).toContain('body{background:#ff0000}');
  });

  it('⚠️ un mail sans feuille se monte quand même, sans rien inventer', async () => {
    const f = await monter({ html: '<p>bonjour</p>' });
    expect(f.getAttribute('srcdoc')).toContain('<p>bonjour</p>');
  });

  it('🔴 le cadre porte un titre, pour qui lit l’écran au clavier', async () => {
    const f = await monter({ html: '<p>x</p>', titre: 'Corps du message — Essai' });
    expect(f.getAttribute('title')).toBe('Corps du message — Essai');
  });

  /** 🔴 LA BOÎTE NE DÉFILE PAS D'ELLE-MÊME : sa hauteur est calculée, et son fond reste blanc en thème Sombre. */
  it('🔴🔴 la feuille du cadre impose le fond blanc et aucune bordure à l’impression', () => {
    expect(CSS_CADRE_MAIL).toContain('background:#fff');
    expect(CSS_CADRE_MAIL).toContain('color-scheme:light');
    expect(CSS_CADRE_MAIL).toContain('@media print');
  });
});
