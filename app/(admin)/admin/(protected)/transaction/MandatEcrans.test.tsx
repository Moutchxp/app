// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranSociete } from './EcransTransaction';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE, LOT 2 (Arno, 02/11/2026) — le n° de mandat dans les VRAIS écrans de la tuile Suivi CA, route simulée (rien n'est écrit) :
 * le champ du formulaire (obligatoire à la création d'un compromis, facultatif pour une fiche existante, absent sans la 449 avec la mention),
 * envoyé au serveur ; le refus du serveur (« Ce mandat existe déjà : … ») montré tel quel, la saisie gardée ; le n° sur la ligne dépliée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JB = { id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' as const };
const compromis: Vente = { id: 41, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-10-20',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, numeroMandat: 'M-0042',
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree_sortie', compteId: 5, negociateur: JB.nom, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: '1 rue A, Puteaux', dateActePrevue: '2027-01-15', dateActe: null, entree: { id: 5, nom: JB.nom }, sortie: { id: 5, nom: JB.nom }, apporteurId: null,
    personnes: [{ id: 3, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }] } };
let liste: Vente[] = [];
let references: Record<string, unknown> = {};
let posts: Record<string, unknown>[];
let reponsePost: { etat: string; motif?: string };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  posts = []; reponsePost = { etat: 'ok' }; liste = [compromis];
  references = { lotD: true, prixVente: true, annulation: true, mandat: true, negociateurs: [JB], apporteurs: [], personnes: [] };
  window.history.replaceState(null, '', '/');
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ ...reponsePost, data: null }) }; }
    const u = String(url);
    const data = u.includes('vue=compromis') ? { disponible: true, aujourdhui: '2026-11-02', societe: 'criterimmo', compromis: liste, actesDuMois: [], annules: [], ...references }
      : u.includes('vue=references') ? { disponible: true, aujourdhui: '2026-11-02', ...references } : u.includes('vue=journal') ? []
      : { disponible: true, societe: 'criterimmo', aujourdhui: '2026-11-02', ventes: [], retrocessions: [], aRattacher: [], doubles: [] };
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async () => { await act(async () => { root.render(createElement(EcranSociete, { societe: 'criterimmo' })); }); await calmer(); };
/** « + Nouveau compromis » ouvert, la commission (obligatoire) saisie. */
const nouveau = async () => { await ouvrir(); await cliquer('[data-nouveau-compromis]'); await saisir('[data-formulaire-dossier] [data-champ="commission"]', '10000'); };
const champMandat = () => container.querySelector<HTMLInputElement>('[data-formulaire-dossier] [data-champ="numero-mandat"]');

describe('🔴 le n° de mandat dans la tuile Suivi CA', () => {
  it('« + Nouveau compromis » : le champ est OBLIGATOIRE, envoyé au serveur avec le dossier', async () => {
    await nouveau();
    expect(texte('[data-formulaire-dossier="nouveau"] [data-champ-mandat]')).toContain('N° de mandat (obligatoire)');
    expect(champMandat()!.required).toBe(true);
    await saisir('[data-formulaire-dossier] [data-champ="numero-mandat"]', 'M-0042');
    await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'dossier-enregistrer', id: null, dossier: { numeroMandat: 'M-0042' } });
  });

  it('refus du serveur (n° déjà pris) : le motif avec le résumé de la vente est montré tel quel, la saisie reste', async () => {
    reponsePost = { etat: 'refus', motif: 'Ce mandat existe déjà : n° M-0042 chez CRITERIMMO — « DUPONT / MARTIN », compromis en cours. Rien n’a été enregistré.' };
    await nouveau();
    await saisir('[data-formulaire-dossier] [data-champ="numero-mandat"]', 'm 42');
    await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(texte('[data-motif-dossier]')).toBe('Ce mandat existe déjà : n° M-0042 chez CRITERIMMO — « DUPONT / MARTIN », compromis en cours. Rien n’a été enregistré.');
    expect(champMandat()!.value).toBe('m 42');
  });

  it('ligne dépliée : le n° de mandat dans les Informations communes ; « Modifier » : champ facultatif, prérempli', async () => {
    await ouvrir();
    await cliquer('[data-deplier="compromis-41"]');
    expect(texte('[data-compromis="41"] [data-info="mandat"]')).toBe('N° de mandatM-0042');
    await cliquer('[data-compromis="41"] [data-modifier-compromis]');
    expect(texte('[data-formulaire-dossier="41"] [data-champ-mandat]')).toContain('(facultatif pour une fiche existante)');
    expect([champMandat()!.value, champMandat()!.required]).toEqual(['M-0042', false]);
  });

  it('fiche existante sans n° : « à renseigner » sur la ligne dépliée', async () => {
    liste = [{ ...compromis, numeroMandat: null }];
    await ouvrir();
    await cliquer('[data-deplier="compromis-41"]');
    expect(texte('[data-compromis="41"] [data-info="mandat"] dd')).toBe('à renseigner');
  });

  it('sans la migration 449 : aucun champ, la mention « disponible après la mise à jour » ; rien n’est envoyé ; aucune ligne « N° de mandat »', async () => {
    references = { ...references, mandat: false };
    liste = [{ ...compromis, numeroMandat: undefined }];
    await ouvrir();
    await cliquer('[data-deplier="compromis-41"]');
    expect(container.querySelector('[data-compromis="41"] [data-info="mandat"]')).toBeNull();
    await cliquer('[data-nouveau-compromis]');
    await saisir('[data-formulaire-dossier] [data-champ="commission"]', '10000');
    expect(champMandat()).toBeNull();
    expect(texte('[data-formulaire-dossier="nouveau"] [data-mandat-indisponible]')).toBe('Disponible après la mise à jour de la base (migration 449).');
    await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(posts.at(-1)?.dossier).not.toHaveProperty('numeroMandat');
  });
});
