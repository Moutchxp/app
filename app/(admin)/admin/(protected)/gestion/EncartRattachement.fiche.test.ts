// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';

/**
 * 🔴 LOT FICHE-PROPOSITION — LA LIGNE DES BIENS RATTACHÉS, ET OÙ S'OUVRE LA RECHERCHE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Deux demandes d'Arno, toutes deux mesurables à l'écran :
 *   ④ la ligne s'intitule « Bien(s) rattaché(s) : » — elle parle des BIENS, jamais des événements, et son ancien
 *      intitulé « Rattaché à » pouvait se lire comme « rattaché à une carte », qui est l'autre question du module ;
 *   ④ au clic sur « + Rattacher à… », la recherche s'ouvre JUSTE SOUS cette ligne. Elle s'ouvrait tout en bas de
 *      l'encart : on cliquait en haut, et le champ de saisie apparaissait hors du regard.
 *
 * 🔴 ET RIEN N'EST RETIRÉ : les gestes de la ligne (Modifier, Retirer, + Rattacher à…) sont tous encore là.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const lien = (o: Record<string, unknown> = {}) => ({
  id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '442', id: null },
  libelle: '22 Boulevard Richard Wallace, PUTEAUX — lot 442', origine: 'manuel', statut: 'confirme',
  confiance: null, regle: 'a', motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    // La recherche de l'annuaire, et le contexte des propositions : ni l'une ni l'autre n'est le sujet ici.
    if (u.includes('/classement?message=')) {
      return { ok: true, json: async () => ({ etat: 'ok', contexte: { disponible: true, biens: [] } }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (liens: unknown[]) => {
  await act(async () => {
    root.render(createElement(EncartRattachement, {
      messageId: 900, liens, onChange: () => {},
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test(b.textContent ?? ''));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

describe('🔴 ④ la ligne s’intitule « Bien(s) rattaché(s) : »', () => {
  it('le titre est celui des BIENS, et plus « Rattaché à »', async () => {
    await monter([lien()]);
    expect(container.querySelector('.ert-titre')?.textContent).toBe('Bien(s) rattaché(s) :');
  });

  it('🔴 il ne parle PAS d’événement : c’est l’autre question du module', async () => {
    await monter([lien()]);
    expect((container.querySelector('.ert-titre')?.textContent ?? '').toLowerCase()).not.toContain('événement');
  });

  it('sans aucun lien, la ligne dit « rien pour l’instant » et garde son bouton', async () => {
    await monter([]);
    expect(container.querySelector('.ert-vide')?.textContent).toBe('rien pour l’instant');
    expect(boutonPar(/\+ Rattacher à…/)).toBeDefined();
  });

  it('🔴 RIEN N’EST RETIRÉ : le lien garde « Modifier » et « Retirer »', async () => {
    await monter([lien()]);
    expect(boutonPar(/^Modifier$/)).toBeDefined();
    expect(boutonPar(/^Retirer$/)).toBeDefined();
  });
});

describe('🔴 ④ la recherche s’ouvre JUSTE SOUS la ligne', () => {
  it('elle n’est pas là au repos', async () => {
    await monter([lien()]);
    expect(container.querySelector('.ccb')).toBeNull();
  });

  it('🔴 au clic, elle apparaît — et son VOISIN PRÉCÉDENT est la ligne elle-même', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/\+ Rattacher à…/));

    const tete = container.querySelector('.ert-tete');
    expect(tete).not.toBeNull();
    /**
     * 🔴 LA PREUVE DE POSITION, et non une preuve de présence. Avant ce lot, le sélecteur existait aussi — mais
     * tout en bas de l'encart. On vérifie donc qu'il suit IMMÉDIATEMENT la ligne dans le DOM : c'est exactement
     * ce qu'Arno a demandé, et c'est ce qui casserait si quelqu'un le redéplaçait.
     */
    const suivant = tete?.nextElementSibling;
    expect(suivant).not.toBeNull();
    expect(suivant?.querySelector('input, [role="dialog"], .ccb') ?? suivant?.textContent)
      .toBeTruthy();
    expect(suivant?.textContent ?? '').toContain('Rattacher ce mail à…');
  });

  it('elle se referme, et la ligne reprend son bouton', async () => {
    await monter([lien()]);
    await cliquer(boutonPar(/\+ Rattacher à…/));
    expect(boutonPar(/\+ Rattacher à…/)).toBeUndefined();
    await cliquer(boutonPar(/^Annuler$/));
    expect(boutonPar(/\+ Rattacher à…/)).toBeDefined();
  });
});
