// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentsAutomatiques } from './DocumentsAutomatiques';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — LA SECTION, MONTÉE POUR DE VRAI ═══════════════════════════════════════
 *
 * Demande d'Arno : « une section “Documents automatiques” : le nombre, une liste par date décroissante (date,
 * sous-type lisible, objet), un filtre par sous-type et par année, un clic ouvre le mail. […] Une fiche sans
 * document → pas de section vide ; une ligne discrète “Aucun document automatique”. »
 *
 * 🔒 Aucune donnée réelle : des documents inventés, et `fetch` est simulé — rien ne sort.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOCS = [
  { messageId: 10, filId: 1, le: '2026-09-01', sousType: 'Quittance', objet: 'Quittance DUPONT septembre' },
  { messageId: 11, filId: 2, le: '2026-03-04', sousType: 'Décompte', objet: 'Décompte N°1 DUPONT' },
  { messageId: 12, filId: 3, le: '2025-07-12', sousType: 'Quittance', objet: 'Quittance DUPONT juillet' },
];

let root: Root | null = null;
let hote: HTMLDivElement | null = null;

const repondre = (corps: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => corps })));

beforeEach(() => { repondre({ etat: 'ok', data: DOCS }); });
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null; hote?.remove(); hote = null; vi.unstubAllGlobals();
});

async function monter(node: ReactElement): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root!.render(node); });
  await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
  return hote;
}
const lignes = (c: HTMLElement) => [...c.querySelectorAll('.dau-ligne')];

describe('🔴 la section s’affiche, avec son compte et sa liste', () => {
  it('🔴 le nombre, puis une ligne par document', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.querySelector('.dau')).not.toBeNull();
    expect(c.querySelector('.gst-compte')?.textContent).toBe('3');
    expect(lignes(c)).toHaveLength(3);
    // 🔴 DATE, SOUS-TYPE LISIBLE, OBJET — les trois, dans cet ordre.
    const l0 = lignes(c)[0].textContent ?? '';
    expect(l0).toContain('2026-09-01');
    expect(l0).toContain('Quittance');
    expect(l0).toContain('Quittance DUPONT septembre');
  });

  it('🔴 un clic ouvre le mail, à son message', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.querySelector('.dau-lien')?.getAttribute('href')).toBe('/admin/gestion?fil=1&message=10');
  });

  /** 🔴 « Ils sont rangés par personne, et n'entrent dans l'historique d'aucun bien » — l'écran le DIT. */
  it('🔴 l’écran dit que ce n’est pas l’historique d’un bien', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'proprietaire', id: 3 }));
    expect(c.textContent).toContain('n’entrent dans l’historique d’aucun bien');
  });
});

describe('🔴 les deux filtres', () => {
  it('🔴 filtrer par sous-type ne garde que lui', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    const select = c.querySelectorAll('select')[0] as HTMLSelectElement;
    await act(async () => {
      const poser = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      poser?.call(select, 'Décompte');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(lignes(c)).toHaveLength(1);
    expect(lignes(c)[0].textContent).toContain('Décompte N°1');
  });

  it('🔴 filtrer par année ne garde qu’elle', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    const select = c.querySelectorAll('select')[1] as HTMLSelectElement;
    await act(async () => {
      const poser = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      poser?.call(select, '2025');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(lignes(c)).toHaveLength(1);
    expect(lignes(c)[0].textContent).toContain('juillet');
  });

  it('⚠️ un filtre qui ne garde rien le DIT, il ne laisse pas une liste vide', async () => {
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    const [type, annee] = [...c.querySelectorAll('select')] as HTMLSelectElement[];
    const poser = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      poser?.call(type, 'Décompte'); type.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      poser?.call(annee, '2025'); annee.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(lignes(c)).toHaveLength(0);
    expect(c.textContent).toContain('Aucun document ne correspond à ce filtre');
  });
});

describe('🔴 ce qui ne s’affiche PAS', () => {
  /** 🔴🔴 SANS LA MIGRATION, PAS DE SECTION DU TOUT : ni cadre vide, ni « bientôt disponible ». */
  it('🔴🔴 sans la migration 291, la fiche est exactement celle d’avant', async () => {
    repondre({ etat: 'sans_schema' });
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.innerHTML).toBe('');
  });

  it('🔴 une fiche sans document : une ligne discrète, pas une section vide', async () => {
    repondre({ etat: 'ok', data: [] });
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.querySelector('.dau')).toBeNull();
    expect(c.textContent).toBe('Aucun document automatique');
  });

  it('⚠️ une panne de lecture ne laisse pas un cadre en erreur dans la fiche', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau'); }));
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.innerHTML).toBe('');
  });

  it('⚠️ un seul sous-type et une seule année : aucun filtre à montrer', async () => {
    repondre({ etat: 'ok', data: [DOCS[0]] });
    const c = await monter(createElement(DocumentsAutomatiques, { sorte: 'locataire', id: 7 }));
    expect(c.querySelectorAll('select')).toHaveLength(0);
    expect(lignes(c)).toHaveLength(1);
  });
});
