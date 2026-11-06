// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴 Arno (06/11/2026) — LA TUILE SUIVI CA n'est pas concernée par la présentation commune « deux côtés » (réservée à « Mon espace ») : la carte
 * d'une affaire tenue des deux côtés y garde EXACTEMENT le même HTML. Route simulée : rien n'est écrit. Données fictives.
 */
let sansFusion = false;
const appels = { n: 0 };
vi.mock('../../../../lib/transaction/deuxCotes', async (orig) => {
  const m = await orig<typeof import('../../../../lib/transaction/deuxCotes')>();
  return { ...m, fusionDeuxCotes: (...a: Parameters<typeof m.fusionDeuxCotes>) => { appels.n += 1; return sansFusion ? null : m.fusionDeuxCotes(...a); } };
});
const { EcranSociete } = await import('./EcransTransaction');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const LEA = { id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' as const };
const deux = { id: 41, societe: 'criterimmo', libelle: 'DEUX CÔTÉS', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-11-06', apporteur: null, note: null,
  origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null,
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 5, negociateur: LEA.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  lignes: [{ id: 1, negociateur: LEA.nom, role: 'negociateur', cote: 'entree', montantTtc: 6000, taux: 50, mode: 'calculee', nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null },
    { id: 2, negociateur: LEA.nom, role: 'negociateur', cote: 'sortie', montantTtc: 1500, taux: 50, mode: 'manuelle', nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null }],
  dossier: { adresseBien: '1 rue A', dateActePrevue: null, dateActe: null, entree: { id: 5, nom: LEA.nom }, sortie: { id: 5, nom: LEA.nom }, apporteurId: null, personnes: [] } };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); sansFusion = false; appels.n = 0;
  try { window.localStorage.setItem('trx-affichage-montants', 'ttc'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    const references = { lotD: true, prixVente: true, annulation: true, uniteCommission: true, negociateurs: [LEA], apporteurs: [], personnes: [] };
    const data = u.includes('vue=compromis') ? { disponible: true, aujourdhui: '2026-11-06', societe: 'criterimmo', compromis: [deux], actesDuMois: [], annules: [], ...references }
      : u.includes('vue=references') ? { disponible: true, aujourdhui: '2026-11-06', ...references } : u.includes('vue=journal') ? []
      : { disponible: true, societe: 'criterimmo', aujourdhui: '2026-11-06', ventes: [], retrocessions: [], aRattacher: [], doubles: [] };
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const rendre = async (): Promise<string> => {
  await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer();
  await act(async () => { (container.querySelector('[data-deplier="compromis-41"]') as HTMLElement).click(); }); await calmer();
  // Les identifiants de React (`useId`) changent d'un rendu à l'autre : neutralisés pour comparer.
  return container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_');
};

describe('🔴 la tuile Suivi CA : la carte « deux côtés » inchangée', () => {
  it('même HTML avec ou sans la présentation commune ; aucune présentation « affaire entière » ; la fonction n’est même pas appelée', async () => {
    const avec = await rendre();
    act(() => { root.unmount(); }); root = createRoot(container); sansFusion = true;
    const sans = await rendre();
    expect(avec).toBe(sans);
    expect(avec).not.toContain('data-deux-cotes');
    expect(container.querySelector('[data-ventilation="sortie"]')).not.toBeNull();
    expect(appels.n).toBe(0);
  });
});
