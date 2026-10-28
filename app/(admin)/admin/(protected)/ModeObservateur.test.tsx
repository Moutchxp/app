// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { estBoutonAction, ModeObservateur } from './ModeObservateur';

/**
 * 🔴 LOT P — l'OBSERVATEUR à l'écran : bandeau ; boutons d'action VISIBLES mais inactifs avec la mention « lecture seule (observateur) » ;
 * boutons de lecture utilisables ; écriture vers l'API admin arrêtée dans le navigateur (le serveur la refuse aussi).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let fetchReel: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div class="svv-adm-content"><button type="button" id="e">Enregistrer</button><button type="button" id="p">+ Nouveau compromis</button>'
    + '<button type="submit" id="s">OK</button><button type="button" role="tab" id="t">Le mois</button><button type="button" id="d">Déplier</button><button type="button" id="f">Fermer</button></div>';
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  fetchReel = vi.fn(async () => new Response('{}', { status: 200 }));
  globalThis.fetch = fetchReel as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); document.body.innerHTML = ''; });
const b = (id: string) => document.getElementById(id) as HTMLButtonElement;

describe('🔴 LOT P — mode observateur', () => {
  it('actif : bandeau, actions inactives (visibles, mention), lecture utilisable', async () => {
    await act(async () => { root.render(createElement(ModeObservateur, { actif: true })); });
    expect(document.querySelector('[data-mode-observateur]')!.textContent).toMatch(/Lecture seule \(observateur\)/);
    for (const id of ['e', 'p', 's']) { expect(b(id).disabled).toBe(true); expect(b(id).title).toBe('lecture seule (observateur)'); expect(b(id).isConnected).toBe(true); }
    for (const id of ['t', 'd', 'f']) expect(b(id).disabled).toBe(false);
  });
  it('actif : une écriture vers l’API admin est arrêtée (403, motif) ; une lecture passe', async () => {
    await act(async () => { root.render(createElement(ModeObservateur, { actif: true })); });
    const r = await fetch('/api/admin/transaction', { method: 'POST', body: '{}' });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { motif: string }).motif).toMatch(/Lecture seule \(observateur\)/);
    expect(fetchReel).not.toHaveBeenCalled();
    await fetch('/api/admin/transaction?vue=compromis');
    expect(fetchReel).toHaveBeenCalledTimes(1);
  });
  it('inactif (tout autre statut) : rien ne change', async () => {
    await act(async () => { root.render(createElement(ModeObservateur, { actif: false })); });
    expect(document.querySelector('[data-mode-observateur]')).toBeNull();
    expect(b('e').disabled).toBe(false);
  });
  it('les verbes d’écriture', () => {
    expect(['Enregistrer', '+ Ajouter un vendeur', 'Acte signé', 'Annulation', 'Valider', 'Rétablir le compromis'].every((t) => estBoutonAction('button', t))).toBe(true);
    expect(['Le mois', 'Fermer', 'Historique', 'Détails', 'Déconnexion', '← Retour'].some((t) => estBoutonAction('button', t))).toBe(false);
  });
});
