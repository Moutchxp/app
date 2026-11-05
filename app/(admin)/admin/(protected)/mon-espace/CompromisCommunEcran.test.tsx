// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BANDEAU_CLIENTS_A_RENSEIGNER, MesCompteurs } from './MesCompteurs';
import { URL_REFERENCES } from './NouveauCompromis';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 Arno (05/11/2026) — DANS L'ESPACE DE L'AUTRE COLLABORATEUR (Pierre, 7) : un compromis COMMUN dont SES clients (côté acquéreur) ne sont pas
 * renseignés → bandeau « Coordonnées de vos clients à renseigner … » + « Renseigner », montant en ROUGE, HORS des grandes cases ; renseigné → vert,
 * compté, bandeau retiré. Le LIEN du mail ouvre CE compromis en modification sur SON côté. Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
const compromis = (id: number, o: Partial<Vente> = {}) => ({ id, societe: 'criterimmo', libelle: `AFFAIRE ${id}`, honorairesTtc: 12000, statut: 'compromis', annee: 2026, mois: null,
  dateCompromis: '2026-11-0' + String(id % 9 || 1), apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, numeroMandat: `M-${id}`,
  repartition: { retroApporteurTtc: 0, parties: [
    { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
    { sorte: 'sortie', compteId: 7, negociateur: 'Pierre THEVENIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Pierre THEVENIN' }, apporteurId: null,
    personnes: [{ id: 1, role: 'vendeur', nom: 'DUPONT', telephone: '06', email: null, adresse: null }] },
  lignes: [], mesCotes: ['sortie'], commissionsRetirees: false, ...o });
let ventes: unknown[] = [];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  try { window.localStorage.setItem('trx-affichage-montants', 'ttc'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_REFERENCES)) return ok({ disponible: true, aujourdhui: '2026-11-05', titulaireId: 7, administrateur: false, lotD: true, personneType: true, prixVente: true,
      mandat: true, uniteCommission: true, negociateurs: [{ id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' }, { id: 7, nom: 'Pierre THEVENIN', societe: 'criterimmo' }],
      apporteurs: [], personnes: [], collegues: [] });
    return ok({ disponible: true, aujourdhui: '2026-11-05', titulaire: { id: 7, prenom: 'Pierre', administrateur: false }, ventes,
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true },
      compteurs: { compromis: { nb: ventes.length, ids: (ventes as { id: number }[]).map((v) => v.id), ca: { htC: 0, ttcC: 0 } }, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const rendre = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); };
const nbCompromis = () => container.querySelector('[data-valeur-compromis="nombre"]')?.textContent?.trim();

describe('🔴 la ligne du compromis commun, tant que MES clients ne sont pas renseignés', () => {
  it('bandeau + « Renseigner », montant en rouge, et HORS des grandes cases (1 compromis compté sur 2)', async () => {
    ventes = [compromis(11, { clientsARenseigner: ['sortie'] } as never), compromis(12)];
    await rendre();
    const ligne = container.querySelector('[data-clients-a-renseigner]')!;
    expect(ligne.className).toContain('mes-a-renseigner');
    expect(ligne.querySelector('[data-bandeau-renseigner="11"]')?.textContent).toBe(`${BANDEAU_CLIENTS_A_RENSEIGNER}Renseigner`);
    expect(ligne.querySelector('[data-ma-vente="11"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-bandeau-renseigner]')).toHaveLength(1);
    expect(nbCompromis()).toBe('1');
  });
  it('renseigné (relu sans le marqueur) : la ligne redevient normale, et comptée (2 sur 2)', async () => {
    ventes = [compromis(11), compromis(12)];
    await rendre();
    expect(container.querySelector('[data-clients-a-renseigner]')).toBeNull();
    expect(container.querySelector('[data-bandeau-renseigner]')).toBeNull();
    expect(nbCompromis()).toBe('2');
  });
  it('« Renseigner » ouvre CE compromis en modification, sur le bloc acquéreur (ligne prête à la saisie)', async () => {
    ventes = [compromis(11, { clientsARenseigner: ['sortie'] } as never)];
    await rendre();
    await act(async () => { (container.querySelector('[data-renseigner="11"]') as HTMLButtonElement).click(); }); await calmer();
    expect(container.querySelector('[data-formulaire-dossier="11"]')).not.toBeNull();
    const champ = container.querySelector<HTMLInputElement>('[data-bloc-dossier="acquereurs"] [data-personne-nom]');
    expect(champ).not.toBeNull();
    expect(document.activeElement).toBe(champ);
  });
});

describe('🔴 le LIEN du mail', () => {
  it('?affaire=11&cote=sortie&modifier=1 : CE compromis s’ouvre en modification, sur le bloc de mon côté ; l’adresse est nettoyée', async () => {
    window.history.replaceState(null, '', '/admin/mon-espace?affaire=11&cote=sortie&modifier=1');
    ventes = [compromis(12), compromis(11, { clientsARenseigner: ['sortie'] } as never)];
    await rendre(); await calmer();
    expect(container.querySelector('[data-formulaire-dossier="11"]')).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-bloc-dossier="acquereurs"] [data-personne-nom]'));
    expect(window.location.search).toBe('');
  });
  it('🔴 un compromis qui n’est PAS le mien (le serveur ne me l’a pas envoyé) : rien ne s’ouvre', async () => {
    window.history.replaceState(null, '', '/admin/mon-espace?affaire=77&cote=sortie&modifier=1');
    ventes = [compromis(12)];
    await rendre(); await calmer();
    expect(container.querySelector('[data-formulaire-dossier]')).toBeNull();
  });
});
