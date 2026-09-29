// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Brouillons } from './Brouillons';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — « ABANDONNER » DIT ENFIN OÙ VA LE BROUILLON.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEMANDE D'ARNO, mot pour mot : « Même règle pour « Abandonner » et tout autre bouton qui supprime un
 * brouillon. » Ce bouton-ci passait DÉJÀ par la même porte que l'éditeur (`DELETE /api/admin/gestion/brouillons`),
 * donc par la même corbeille — il ne le DISAIT pas. Deux mots pour un seul geste, c'est un geste qu'on apprend
 * deux fois, et dont on ne sait jamais lequel des deux est vrai.
 *
 * 🔴 ET IL SUIT LA MIGRATION 276, comme l'éditeur. Sans la colonne, rien n'est réintégrable : le mot d'avant
 * revient, et la note sous la liste cesse de promettre un retour. Une promesse qu'on ne peut pas tenir est pire
 * que pas de promesse — c'est la règle de tout ce lot, et elle vaut ici aussi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BROUILLON = {
  id: 57, voie: 'nouveau', objet: '_TEST BROUILLON a ignorer', corps: 'texte', corpsHtml: null,
  a: ['gestion@criterimmo.fr'], cc: [], cci: [], filId: null, repondAMessageId: null,
  citation: null, citationHtml: null, majLe: '2026-09-29T17:44:00Z', cibles: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => (
    { ok: true, json: async () => ({ brouillons: [BROUILLON] }) } as unknown as Response
  )) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async (corbeille: boolean) => {
  await act(async () => {
    root.render(createElement(Brouillons, {
      maintenant: new Date('2026-09-29T19:00:00Z'), corbeille,
      onOuvrir: () => {}, onReprendre: () => {}, onChange: () => {},
    } as never));
  });
  await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
};
const boutons = () => [...container.querySelectorAll('.gst-actions button')].map((b) => b.textContent?.trim());

describe('🔴 le bouton de la liste emploie les mots de l’éditeur', () => {
  it('🔴 avec la corbeille : « Mettre à la corbeille », et la note dit d’où il revient', async () => {
    await monter(true);
    expect(boutons()).toContain('Mettre à la corbeille');
    expect(boutons()).not.toContain('Abandonner');
    expect(container.textContent).toContain('Réintégrer');
  });

  /** 🔴 SANS LA MIGRATION 276, le mot d'avant revient — et la note ne promet plus aucun retour. */
  it('🔴 sans la corbeille : « Supprimer le brouillon », et aucune promesse de retour', async () => {
    await monter(false);
    expect(boutons()).toContain('Supprimer le brouillon');
    expect(container.textContent).not.toContain('Réintégrer');
    expect(container.textContent).toContain('daté et conservé en base');
  });

  /**
   * 🔒 LE DÉFAUT EST LE MOT PRUDENT. Le contexte de rédaction arrive par le réseau : pendant le premier rendu il
   * n'est pas encore là. Promettre la corbeille par défaut la promettrait aussi quand elle n'existe pas.
   */
  it('🔒 sans rien dire du tout, c’est le mot qui ne promet rien', async () => {
    await act(async () => {
      root.render(createElement(Brouillons, {
        maintenant: new Date('2026-09-29T19:00:00Z'),
        onOuvrir: () => {}, onReprendre: () => {}, onChange: () => {},
      } as never));
    });
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(boutons()).toContain('Supprimer le brouillon');
  });
});
