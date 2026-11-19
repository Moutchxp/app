// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRecapEnvois } from './RecapEnvoisTache';

/**
 * 🔴🔴 Arno (19/11/2026) — le récapitulatif COMMUN (état des lieux, tâches de rendez-vous) : un changement de collaborateur seul y montre le résumé mot
 * pour mot, et la fenêtre de résultat reprend sa phrase. Le vrai composant ; l'aperçu est fourni, rien ne part.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement; let racine: Root;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });
const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

const LIGNES = ['Le rendez-vous est maintenu sans changement : le 25/11/2026, de 14h00 à 15h00.', 'Changement de collaborateur en charge : Claire Test remplace Arno Test.',
  'Claire Test recevra une invitation à accepter ou à refuser ce rendez-vous.'];
function Banc() {
  const recap = useRecapEnvois();
  useEffect(() => {
    void recap.demander({ titre: 'Rendez-vous déplacé', apercu: {}, maintien: { lignes: LIGNES, phrase: 'Le rendez-vous du 25/11/2026, de 14h00 à 15h00, est maintenu : Claire Test remplace Arno Test.' },
      lireApercu: async () => ({ collaborateurs: [{ libelle: 'Claire Test', mail: true, motif: null }], exterieurs: [], total: 1, texteCollaborateur: null, texteExterieur: null }),
      action: async () => ({ ok: true, message: 'Rendez-vous déplacé — mail à Claire Test : envoyé', collaborateurs: [] }) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createElement('div', { className: 'svv-adm-root' }, recap.fenetre);
}

describe('🔴 le récapitulatif d’un changement de collaborateur seul', () => {
  it('le résumé en tête, mot pour mot ; puis la fenêtre de résultat reprend sa phrase', async () => {
    await act(async () => { racine.render(createElement(Banc)); });
    await calmer();
    expect([...document.querySelectorAll('[data-recap-maintien] p')].map((p) => p.textContent)).toEqual(LIGNES);
    await act(async () => { (document.querySelector('[data-confirmer-recap]') as HTMLButtonElement).click(); });
    await calmer();
    expect(document.querySelector('[data-resultat-message]')?.textContent).toBe('Le rendez-vous du 25/11/2026, de 14h00 à 15h00, est maintenu : Claire Test remplace Arno Test.');
  });
});
