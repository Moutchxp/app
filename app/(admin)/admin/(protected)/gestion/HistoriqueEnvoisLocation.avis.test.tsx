// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriqueEnvoisLocation } from './HistoriqueEnvoisLocation';

/**
 * 🔴 Arno (05/11/2026) — LES MAILS DE PRÉAVIS ET DE SORTIE ENTRENT DANS L'HISTORIQUE DU BIEN : une bande « Mails de préavis et de
 * sortie (N) », lue par la route du bien. La bande « Envois ADHOC & MONGA » reste telle quelle. `fetch` doublé : aucune base.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const AVIS = [{ id: 3, sorte: 'preavis_adhoc', quand: '2026-11-05T10:12:41+01:00', par: 'a.jorel@sansvisavis.com', a: ['gestion.criterimmo@gmail.com'],
  cc: ['gestion@criterimmo.fr'], objet: '[Information] Préavis reçu — 12 rue de l’Essai', texte: 'Bonjour,\n\nPour information…', statut: 'envoye' }];
const rendre = async (corps: unknown) => {
  global.fetch = vi.fn(async () => ({ json: async () => corps }) as unknown as Response) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(HistoriqueEnvoisLocation, { lotId: 441 })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('🔴 l’historique du bien : les mails de préavis et de sortie', () => {
  it('la bande apparaît avec son compte, repliée ; dépliée : sorte, objet, destinataires, qui a validé, et le texte', async () => {
    await rendre({ etat: 'ok', envois: [], avis: AVIS });
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('envois-location?lot=441');
    const bande = container.querySelector('[data-historique-mails-avis]')!;
    expect(bande.querySelector('button')?.textContent).toBe('▶Mails de préavis, pré-visite et sortie1');
    expect(bande.querySelector('[data-mail-avis]')).toBeNull();
    act(() => (bande.querySelector('button') as HTMLButtonElement).click());
    const ligne = bande.querySelector('[data-mail-avis="3"]')!;
    expect(ligne.textContent).toContain('Information préavis (ADHOC) — « [Information] Préavis reçu — 12 rue de l’Essai »');
    expect(ligne.textContent).toContain('À : gestion.criterimmo@gmail.com · Cc : gestion@criterimmo.fr · validé par a.jorel@sansvisavis.com');
    expect(ligne.querySelector('[data-texte-avis]')?.textContent).toBe('Bonjour,\n\nPour information…');
    // Sans envoi « Nouvelle location » : sa bande n'apparaît pas (comme avant).
    expect(container.querySelector('[data-historique-envois-location]')).toBeNull();
  });

  it('aucun mail de préavis ni de sortie : pas de bande ; les envois ADHOC & MONGA restent affichés', async () => {
    await rendre({ etat: 'ok', envois: [{ id: 1, bailId: 2, quand: '2026-10-21T10:00:00Z', par: 'Arno', n: 3, message: null }], avis: [] });
    expect(container.querySelector('[data-historique-mails-avis]')).toBeNull();
    expect(container.querySelector('[data-historique-envois-location]')).not.toBeNull();
  });
});

describe('🔴 Arno (10/11/2026, pré-visite, règle 7) — l’historique d’un LOCATAIRE : ses mails Location, avec un libellé clair par type', () => {
  it('lu par la fiche du locataire (`?locataire=`) ; les mails de pré-visite portent leur libellé', async () => {
    global.fetch = vi.fn(async () => ({ json: async () => ({ etat: 'ok', envois: [], avis: [
      { id: 7, sorte: 'previsite_locataires', quand: '2026-11-10T10:00:00+01:00', par: 'Arno Test', a: ['alice@exemple.test'], cc: ['gestion@criterimmo.fr'],
        objet: 'Rendez-vous de pré-visite', texte: 'Bonjour Alice,', statut: 'envoye' },
      { id: 8, sorte: 'previsite_alerte', quand: '2026-11-12T08:00:00+01:00', par: 'Envoi automatique (pré-visite)', a: ['arno@exemple.test'], cc: [],
        objet: 'Alerte préavis — aucune pré-visite fixée', texte: 'Bonjour,', statut: 'echec' },
    ] }) }) as unknown as Response) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(HistoriqueEnvoisLocation, { locataire: 'LOC 42' })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('envois-location?locataire=LOC%2042');
    const bande = container.querySelector('[data-historique-mails-avis]')!;
    act(() => (bande.querySelector('button') as HTMLButtonElement).click());
    expect(bande.querySelector('[data-mail-avis="7"]')?.textContent).toContain('Pré-visite — confirmation du rendez-vous (locataires) — « Rendez-vous de pré-visite »');
    expect(bande.querySelector('[data-mail-avis="8"]')?.textContent).toContain('Pré-visite — alerte « aucune pré-visite fixée » (collaborateurs) — « Alerte préavis — aucune pré-visite fixée » — NON ENVOYÉ');
  });
});
