import { describe, it, expect } from 'vitest';
import {
  CSP_CADRE, CSS_BASE_CADRE, cssDuMailFiltre, documentDuCadre, SANDBOX_CADRE, SANDBOX_INTERDITS, stylesDuMail,
} from './cadreMail';

/**
 * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE CADRE EST SÛR, ET IL LE RESTE ════════════════════════════════════════════
 *
 * Décision d'Arno (03/10/2026, option « a ») : un cadre isolé pour le corps des mails REÇUS, afin de garder leurs
 * `<style>` d'en-tête — 34 366 mails stockés en portent qui changent le rendu — sans aucun risque pour l'appli.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 LE GARDE-FOU — IL ÉCHOUE SI QUELQU'UN AJOUTE UN JOUR `allow-scripts`
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 le bac à sable du cadre', () => {
  /**
   * 🔴🔴 LE CAS QU'ARNO A DEMANDÉ EXPRESSÉMENT. `allow-same-origin` n'est dangereux que COMBINÉ à
   * `allow-scripts` : c'est cette paire qui permet à un cadre de retirer son propre bac à sable. Tant qu'aucun
   * script ne peut s'exécuter, l'accès n'existe QUE DE L'APPLICATION VERS LE CADRE.
   *
   * Si quelqu'un ajoute `allow-scripts` un jour — par commodité, pour faire marcher autre chose —, ce cas tombe.
   */
  it('🔴🔴 `allow-scripts` n’y est pas, et n’y sera jamais', () => {
    expect(SANDBOX_CADRE).not.toContain('allow-scripts');
  });

  it('🔴🔴 aucun des jetons dangereux n’y est', () => {
    const jetons = SANDBOX_CADRE.split(/\s+/);
    for (const interdit of SANDBOX_INTERDITS) {
      expect(jetons, `${interdit} ne doit jamais être accordé`).not.toContain(interdit);
    }
  });

  it('🔴 et les trois jetons permis y sont, eux — sinon le cadre ne sert à rien', () => {
    const jetons = SANDBOX_CADRE.split(/\s+/).filter((x) => x !== '');
    // `allow-same-origin` : pour que l'APPLI mesure le cadre et branche le clic des images.
    // `allow-popups` + `…-to-escape-sandbox` : pour qu'un lien s'ouvre dans un VRAI nouvel onglet.
    expect(jetons.sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin']);
  });
});

describe('🔒 la CSP du document du cadre', () => {
  it('🔴🔴 tout est fermé par défaut, et AUCUN script n’est permis', () => {
    expect(CSP_CADRE).toContain("default-src 'none'");
    expect(CSP_CADRE).toContain("script-src 'none'");
    expect(CSP_CADRE).not.toContain("script-src 'unsafe-inline'");
    expect(CSP_CADRE).not.toContain('script-src *');
  });

  it('🔴 les styles en ligne sont permis — c’est tout l’objet du lot', () => {
    expect(CSP_CADRE).toContain("style-src 'unsafe-inline'");
  });

  /**
   * ⚠️ LA POLITIQUE D'IMAGES NE CHANGE PAS (demande d'Arno). `data:` pour une image intégrée, notre propre
   * origine pour les pièces (`cid:`) et le relais des images distantes. Aucune adresse distante n'est ouverte
   * ici : une image qu'on ne relaie pas ne doit pas pouvoir signaler l'ouverture du mail à un tiers.
   */
  it('🔴 les images suivent la politique actuelle, et rien de plus', () => {
    expect(CSP_CADRE).toContain("img-src data: 'self'");
    expect(CSP_CADRE).not.toMatch(/img-src[^;]*\*/);
  });

  it('🔴 ni formulaire, ni cadre imbriqué, ni objet', () => {
    expect(CSP_CADRE).toContain("form-action 'none'");
    expect(CSP_CADRE).toContain("frame-src 'none'");
    expect(CSP_CADRE).toContain("object-src 'none'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LE CSS DU MAIL, FILTRÉ — LES ESSAIS D'INTRUSION DU RAPPORT, DEVENUS DES TESTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le CSS d’en-tête d’un mail, filtré', () => {
  it('🔴 un @import est refusé — il irait chercher une feuille au dehors', () => {
    const s = cssDuMailFiltre('@import url(https://voleur.test/x.css); .a{color:red}');
    expect(s).not.toContain('@import');
    expect(s).not.toContain('voleur.test');
    // …et le reste de la feuille passe.
    expect(s).toContain('.a{color:red}');
  });

  it('🔴🔴 une url() EXTERNE est refusée — c’est une balise espion', () => {
    const s = cssDuMailFiltre('.a{background:url(https://espion.test/p.gif)} .b{color:#111}');
    expect(s).not.toContain('espion.test');
    expect(s).not.toContain('url(http');
    expect(s).toContain('.b{color:#111}');
  });

  /** ⚠️ `url(data:…)` RESTE PERMIS : il ne va chercher RIEN au dehors, et la CSP l'autorise aussi. */
  it('⚠️ une url(data:…) reste permise — elle voyage DANS le mail', () => {
    expect(cssDuMailFiltre('.a{background:url(data:image/gif;base64,R0lGOD)}')).toContain('data:image/gif');
  });

  it('🔴 expression(), javascript:, behavior et -moz-binding sont retirés', () => {
    const s = cssDuMailFiltre('.a{width:expression(alert(1));behavior:url(x.htc);-moz-binding:url(y)}'
      + '.b{background:javascript:alert(1)}');
    for (const mot of ['expression(', 'javascript:', 'behavior:', '-moz-binding']) {
      expect(s, mot).not.toContain(mot);
    }
  });

  /**
   * 🔴🔴 LA SEULE ÉVASION POSSIBLE D'UN BLOC DE STYLE : refermer la balise et écrire du HTML derrière. Elle est
   * fermée ici — sans quoi un mail poserait un `<script>` dans le document du cadre.
   */
  it('🔴🔴 un mail ne peut pas refermer la balise <style> pour écrire du HTML derrière', () => {
    const s = cssDuMailFiltre('.a{color:red}</style><script>vol()</script><img src=x onerror=vol()>');
    expect(s).not.toContain('</style');
    expect(s).not.toContain('<script');
    expect(s).not.toContain('<img');
    expect(documentDuCadre({ corpsAssaini: '<p>x</p>', cssDuMail: s })).not.toContain('<script');
  });

  it('⚠️ un mail sans <style> rend une chaîne vide, jamais `null`', () => {
    expect(stylesDuMail('<p>bonjour</p>')).toBe('');
    expect(stylesDuMail(null)).toBe('');
  });

  /**
   * 🔴 LES BLOCS SONT LUS SUR LE **BRUT**, avant assainissement : `assainirHtml` vide la balise `<style>`,
   * contenu compris. Sans cette lecture en amont, il n'y aurait rien à mettre dans le cadre.
   */
  it('🔴🔴 plusieurs <style> sont repris, dans l’ordre', () => {
    const s = stylesDuMail('<html><head><style>.a{color:red}</style><style>.b{color:blue}</style></head>'
      + '<body>x</body></html>');
    expect(s.indexOf('.a{color:red}')).toBeGreaterThanOrEqual(0);
    expect(s.indexOf('.b{color:blue}')).toBeGreaterThan(s.indexOf('.a{color:red}'));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LE DOCUMENT DU CADRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le document posé dans le cadre', () => {
  const doc = documentDuCadre({
    corpsAssaini: '<a href="https://app.monga.io/x" target="_blank" rel="noopener noreferrer">Vers Mission</a>',
    cssDuMail: '.bouton{background:#1B4DFF}',
  });

  /** 🔴 LA CSP EST EN PREMIER : une méta-CSP ne vaut que pour ce qui la SUIT. */
  it('🔴🔴 la CSP est la toute première chose du document', () => {
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style'));
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<body'));
    expect(doc).toContain(CSP_CADRE);
  });

  it('🔴 la feuille de base vient AVANT celle du mail — le mail l’emporte', () => {
    expect(doc.indexOf('background:#fff')).toBeLessThan(doc.indexOf('.bouton{background:#1B4DFF}'));
  });

  /** 🔴 FOND BLANC IMPOSÉ, en thème Sombre comme en Clair : un mail est écrit pour du papier blanc. */
  it('🔴🔴 le fond du cadre est blanc, et le navigateur n’inverse rien', () => {
    expect(CSS_BASE_CADRE).toContain('background:#fff');
    expect(CSS_BASE_CADRE).toContain('color-scheme:light');
  });

  /** 🔴 AUCUNE BARRE DE DÉFILEMENT INTERNE : la hauteur est calculée par l'application (lot DEFILEMENT-MODALES). */
  it('🔴🔴 le document n’a aucune barre de défilement verticale', () => {
    expect(CSS_BASE_CADRE).toContain('html{overflow-y:hidden}');
  });

  it('🔴 tous les liens s’ouvrent dans un nouvel onglet', () => {
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('rel="noopener noreferrer"');
  });

  it('⚠️ un mail sans feuille ne pose pas de balise <style> vide', () => {
    const nu = documentDuCadre({ corpsAssaini: '<p>x</p>', cssDuMail: '' });
    expect((nu.match(/<style/g) ?? []).length).toBe(1); // la feuille de base, et elle seule
  });

  /**
   * 🔴🔴 LE CORPS ARRIVE DÉJÀ ASSAINI : ce module n'assainit rien lui-même, et il ne doit RIEN ajouter qui
   * puisse exécuter quoi que ce soit. On le vérifie sur le document entier.
   */
  it('🔴🔴 le document fini ne porte aucun script, nulle part', () => {
    expect(doc).not.toContain('<script');
    expect(doc).not.toMatch(/\son[a-z]+\s*=/i);
    expect(doc).not.toContain('javascript:');
  });
});
