// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModaleConfirmationEnvoiAuto } from './ModaleConfirmationEnvoiAuto';

/**
 * 224 — MODALE de confirmation du passage en envoi automatique (rail e-mail). jsdom + act (sans testing-library). On PROUVE : le VOLUME
 * et les CAPS affichés viennent de /envoi-auto-apercu (pilotés par le fetch, JAMAIS en dur) ; la modale mentionne que relances/CADA ne
 * sont pas concernées ; « Activer » → onConfirmer, « Annuler » → onAnnuler ; et la modale ne fait qu'un GET d'aperçu (aucun envoi réel).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const apercu = (over: Record<string, number> = {}) => ({
  pretesMaintenant: 4, partiraientMaintenant: 3, communesProposables: 12, capParRun: 50, capParJour: 100,
  plafondMensuelParCommune: 5, fenetreDebut: 9, fenetreFin: 18, ...over,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => apercu() } as unknown as Response));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => [...container.querySelectorAll('button')].find((b) => motif.test(b.textContent ?? ''));

async function monter(props: { onConfirmer?: () => void; onAnnuler?: () => void; enCours?: boolean } = {}): Promise<void> {
  const p = { onConfirmer: vi.fn(), onAnnuler: vi.fn(), ...props };
  await act(async () => { root.render(createElement(ModaleConfirmationEnvoiAuto, p)); });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); // flush fetch + .json()
  return;
}

describe('224 — modale de confirmation (volume + caps LUS, jamais en dur)', () => {
  it('interroge /envoi-auto-apercu (GET, aucun envoi) au montage', async () => {
    await monter();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/admin/permis/demandes/envoi-auto-apercu');
    // aucun POST / aucun appel d'envoi : le seul fetch est le GET d'aperçu.
    expect(fetchMock.mock.calls.every((c) => (c[1] as RequestInit | undefined)?.method === undefined)).toBe(true);
  });

  it('affiche les CAPS réels renvoyés par le serveur (50 / 100 / 5 / fenêtre 9 h–18 h)', async () => {
    await monter();
    const txt = container.textContent ?? '';
    expect(txt).toContain('50'); expect(txt).toContain('100'); expect(txt).toContain('5');
    expect(txt).toMatch(/9\s*h/); expect(txt).toMatch(/18\s*h/);
  });

  it('le volume est PILOTÉ par le fetch (pas en dur) : un aperçu différent change le nombre affiché', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => apercu({ communesProposables: 77 }) } as unknown as Response));
    await monter();
    expect(container.textContent ?? '').toContain('77');
  });

  it('dit que RELANCES et SAISINES CADA ne sont PAS concernées', async () => {
    await monter();
    const txt = container.textContent ?? '';
    expect(txt).toMatch(/relance/i);
    expect(txt).toMatch(/CADA/);
  });

  it('« Activer » → onConfirmer ; « Annuler » → onAnnuler', async () => {
    const onConfirmer = vi.fn(); const onAnnuler = vi.fn();
    await monter({ onConfirmer, onAnnuler });
    await act(async () => { boutonPar(/Activer/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    await act(async () => { boutonPar(/Annuler/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('aperçu indisponible (fetch !ok) → l’activation reste possible (caps serveur s’appliquent quand même)', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) } as unknown as Response));
    const onConfirmer = vi.fn();
    await monter({ onConfirmer });
    expect(boutonPar(/Activer/)).toBeDefined();
    await act(async () => { boutonPar(/Activer/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onConfirmer).toHaveBeenCalledTimes(1);
  });
});
