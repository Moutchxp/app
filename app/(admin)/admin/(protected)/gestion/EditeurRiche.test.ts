// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { COULEURS, EditeurRiche, estPresqueBlanc, MOT_COULEUR_AUTOMATIQUE, SURLIGNAGES } from './EditeurRiche';
import { assainirHtml } from '../../../../lib/gestion/htmlMail';

/**
 * 🔴 LOT EDITEUR-PJ — LA BARRE DE MISE EN FORME, ET LA COULEUR « AUTOMATIQUE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA DEMANDE D'ARNO, MOT POUR MOT : « En aucun cas du blanc en dur ne doit partir dans un mail. » Du texte
 * blanc arrive NOIR SUR BLANC chez le destinataire, c'est-à-dire invisible — et l'on ne s'en aperçoit jamais de
 * notre côté, puisque chez nous il se lit très bien sur fond sombre. C'est le défaut le plus silencieux possible.
 *
 * Ce qui est tenu ici :
 *   ① la palette contient « Automatique » EN PREMIÈRE POSITION, et elle ne contient AUCUN blanc ;
 *   ② « Automatique » ne pose pas une couleur : elle RETIRE celle de la sélection — le HTML repart sans `color` ;
 *   ③ les commandes qui MANQUAIENT sont là : surlignage, justifier, annuler, rétablir ;
 *   ④ tout ce que la barre produit survit à l'assainissement de l'envoi.
 *
 * ⚠️ `document.execCommand` N'EXISTE PAS DANS jsdom. On le remplace par un faux qui écrit ce que Chrome écrirait
 * VRAIMENT — les formes ont été relevées dans le navigateur le 28/09/2026. Tester contre une forme idéale ne
 * prouverait rien : c'est précisément l'écart entre l'idéal et le réel qui a fait passer les défauts.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let commandes: { nom: string; valeur?: string }[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  commandes = [];
  /**
   * LE FAUX `execCommand`. Il enregistre ce qu'on lui demande, et — pour `foreColor` — il écrit dans la zone ce
   * que Chrome y écrirait : un `<span style="color: …">` autour du contenu. C'est ce qui permet d'éprouver le
   * SECOND temps d'« Automatique », celui qui retire la déclaration.
   */
  (document as unknown as { execCommand: unknown }).execCommand =
    (nom: string, _ui: boolean, valeur?: string) => {
      if (nom !== 'styleWithCSS') commandes.push({ nom, valeur });
      if (nom === 'foreColor') {
        const zone = container.querySelector('.edr-zone');
        if (zone) zone.innerHTML = `<p><span style="color: ${valeur};">texte</span></p>`;
      }
      return true;
    };
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async (html = '<p>texte</p>') => {
  await act(async () => {
    root.render(createElement(EditeurRiche, {
      htmlInitial: html, onChange: () => {}, barreVisible: true,
    } as never));
  });
};
const bouton = (lbl: string) =>
  [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === lbl);
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); });
};
const zone = () => container.querySelector('.edr-zone') as HTMLDivElement;

describe('🔴 ① la palette : « Automatique » d’abord, et AUCUN blanc', () => {
  it('🔴🔴 aucune couleur de la palette n’est blanche ni presque blanche', () => {
    for (const c of COULEURS) expect(estPresqueBlanc(c.valeur), c.mot).toBe(false);
    for (const c of SURLIGNAGES) expect(c.valeur, c.mot).not.toBe('#ffffff');
  });

  it('la reconnaissance du blanc attrape ses trois écritures', () => {
    expect(estPresqueBlanc('#fff')).toBe(true);
    expect(estPresqueBlanc('#FFFFFF')).toBe(true);
    expect(estPresqueBlanc('white')).toBe(true);
    expect(estPresqueBlanc('rgb(255, 255, 255)')).toBe(true);
    expect(estPresqueBlanc('rgb(250, 250, 251)')).toBe(true); // « presque » blanc : tout aussi invisible
    expect(estPresqueBlanc('#a30402')).toBe(false);
    expect(estPresqueBlanc('rgb(163, 4, 2)')).toBe(false);
  });

  it('🔴 « Automatique » est la PREMIÈRE pastille — c’est l’état de départ, celui où l’on revient', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    const pastilles = [...container.querySelectorAll('.edr-pastille')];
    expect(pastilles[0].getAttribute('aria-label')).toBe(MOT_COULEUR_AUTOMATIQUE);
    expect(pastilles[1].getAttribute('aria-label')).toBe('Noir');
  });

  /**
   * ⚠️ SA COULEUR EST UN JETON DE CHARTE, et c'est le SEUL cas juste dans cette barre : elle ne représente pas une
   * couleur de contenu, elle montre l'état « celle de l'écran ». Noire en thème clair, blanche en thème sombre.
   */
  it('sa pastille suit la couleur de TEXTE du thème, pas une teinte écrite en dur', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/EditeurRiche.tsx', 'utf8');
    expect(css).toContain('.edr-pastille--auto{background:var(--color-svv-ink)');
  });
});

describe('🔴 ② « Automatique » RETIRE la couleur — elle n’en pose pas une', () => {
  it('🔴 le HTML repart SANS la moindre déclaration `color`, et sans `inherit`', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton(MOT_COULEUR_AUTOMATIQUE));
    const html = zone().innerHTML;
    expect(html).not.toMatch(/color\s*:/);
    expect(html).not.toContain('inherit');
    expect(zone().textContent).toBe('texte');
  });

  /** 🔴 LE SPAN VIDÉ DISPARAÎT : sans cela, trois allers-retours donneraient un mail imbriqué sur dix niveaux. */
  it('🔴 la balise qui ne portait QUE la couleur est déballée', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton(MOT_COULEUR_AUTOMATIQUE));
    expect(zone().querySelectorAll('span')).toHaveLength(0);
  });

  it('elle passe bien par `foreColor` à `inherit` — c’est lui qui sait défaire une sélection complexe', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton(MOT_COULEUR_AUTOMATIQUE));
    expect(commandes).toContainEqual({ nom: 'foreColor', valeur: 'inherit' });
  });

  /**
   * 🔴 LE CAS RÉEL D'ARNO : on écrit en thème sombre, on passe en rouge, on remet « Automatique ». Rien de blanc
   * ne doit partir — et il ne part RIEN du tout, ce qui est mieux : le texte prend la couleur par défaut du
   * lecteur, donc du noir.
   */
  it('🔴🔴 rouge puis « Automatique » ⇒ aucun `color` dans le HTML ENVOYÉ (après assainissement)', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton('Rouge SVAV'));
    expect(zone().innerHTML).toMatch(/color\s*:/);       // la couleur est bien posée…
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton(MOT_COULEUR_AUTOMATIQUE));
    const envoye = assainirHtml(zone().innerHTML);       // …puis retirée, jusque dans ce qui part
    expect(envoye).not.toMatch(/color\s*:/);
    expect(envoye.toLowerCase()).not.toContain('#fff');
    expect(envoye).not.toContain('255, 255, 255');
  });

  it('une couleur choisie, elle, reste bien posée', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    await cliquer(bouton('Rouge SVAV'));
    expect(commandes).toContainEqual({ nom: 'foreColor', valeur: '#a30402' });
  });
});

describe('🔴 ③ les commandes qui MANQUAIENT à la barre', () => {
  it('surlignage, justifier, annuler et rétablir existent désormais', async () => {
    await monter();
    expect(bouton('Surlignage')).toBeDefined();
    expect(bouton('Justifier')).toBeDefined();
    expect(bouton('Annuler')).toBeDefined();
    expect(bouton('Rétablir')).toBeDefined();
  });

  it('le surlignage passe par `hiliteColor`, qui produit un `background-color`', async () => {
    await monter();
    await cliquer(bouton('Surlignage'));
    await cliquer(bouton('Surligner en jaune'));
    expect(commandes).toContainEqual({ nom: 'hiliteColor', valeur: '#fff2a8' });
  });

  it('« Aucun surlignage » retire le fond — la même porte de sortie que pour la couleur', async () => {
    await monter();
    await cliquer(bouton('Surlignage'));
    await cliquer(bouton('Aucun surlignage'));
    expect(commandes).toContainEqual({ nom: 'hiliteColor', valeur: 'transparent' });
  });

  /**
   * ⚠️ ILS PASSENT PAR `agir`, DONC PAR LE RÉTABLISSEMENT DE LA SÉLECTION. `execCommand('undo')` appliqué hors du
   * champ défait la frappe d'ailleurs dans la page, ou ne fait rien du tout.
   */
  it('annuler et rétablir sont bien les commandes du champ', async () => {
    await monter();
    await cliquer(bouton('Annuler'));
    await cliquer(bouton('Rétablir'));
    expect(commandes.map((c) => c.nom)).toContain('undo');
    expect(commandes.map((c) => c.nom)).toContain('redo');
  });

  it('les deux palettes ne peuvent pas être ouvertes ensemble : deux menus superposés se cachent l’un l’autre', async () => {
    await monter();
    await cliquer(bouton('Couleur du texte'));
    expect(bouton(MOT_COULEUR_AUTOMATIQUE)).toBeDefined();
    await cliquer(bouton('Surlignage'));
    expect(bouton(MOT_COULEUR_AUTOMATIQUE)).toBeUndefined();
    expect(bouton('Surligner en jaune')).toBeDefined();
  });
});

describe('🔴 ④ tout ce que la barre produit survit à l’envoi', () => {
  /** Les formes EXACTES relevées dans Chrome le 28/09/2026 — voir aussi `htmlMail.test.ts`. */
  it('les couleurs de la palette traversent l’assainissement', () => {
    for (const c of COULEURS) {
      expect(assainirHtml(`<span style="color: ${c.valeur};">x</span>`), c.mot).toContain(c.valeur);
    }
    for (const c of SURLIGNAGES) {
      expect(assainirHtml(`<span style="background-color: ${c.valeur};">x</span>`), c.mot).toContain(c.valeur);
    }
  });
});
