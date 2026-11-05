// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs } from './MesCompteurs';
import { URL_COMPROMIS, URL_MANDAT, URL_REFERENCES, URL_VENTE } from './NouveauCompromis';

/**
 * 🔴 MON ESPACE, LOT 5 — le parcours « + Nouveau compromis » dans le VRAI écran de « Mon espace », routes simulées (rien n'est écrit) :
 * ① la structure seule ; ② le n° obligatoire (impossible d'avancer sans lui) ; ③ libre → le côté, puis le formulaire EXISTANT (structure et n°
 * posés, n° non modifiable, moi à mon côté), envoyé à la route de « Mon espace » ; enregistré → « Mes compromis en cours », la nouvelle affaire
 * en haut, dépliée ; ③ pris → la transaction existante ; 🔴 LOT 6 : « Rejoindre » → un côté LIBRE, puis le formulaire EXISTANT sur CETTE affaire
 * (commissions non visibles), envoyé avec la preuve du n° et la version ; deux côtés tenus : aucun bouton. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const LEA = { id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' as const };
const MARC = { id: 7, nom: 'Marc DURAND', societe: 'macj' as const };
const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
const venteCreee = { id: 99, societe: 'criterimmo', libelle: 'NOUVEAU / ACHETEUR', honorairesTtc: 12000, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-01-01',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, numeroMandat: 'M-42',
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree_sortie', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 5, nom: 'Léa MARTIN' }, apporteurId: null, personnes: [] },
  mesCotes: ['entree', 'sortie'], commissionsRetirees: false };
const ancienne = { ...venteCreee, id: 50, libelle: 'PLUS RÉCENTE', dateCompromis: '2026-10-30' };
// 🔴 LOT 6 — l'affaire qui porte déjà le n° : Marc (7) à l'entrée, la sortie libre ; telle que Léa la reçoit (sans la commission de Marc).
const aRejoindre = { ...venteCreee, id: 3, libelle: 'DUPONT / MARTIN', numeroMandat: 'M-0042', version: 41, honorairesTtc: 12000,
  repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: '1 rue A, Puteaux', dateActePrevue: null, dateActe: null, entree: { id: 7, nom: 'Marc DURAND' }, sortie: null, apporteurId: null, personnes: [] },
  mesCotes: [], commissionsRetirees: true };
let cree = false;
let prise: unknown = null;
// 🔴 Décision 12 — la structure du profil (une seule) ; null : les deux, ou aucun rattachement (la question reste)
let imposee: string | null = null;
let admin = false;
let posts: { url: string; corps: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  cree = false; prise = null; posts = []; imposee = null; admin = false;
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (init?.method === 'POST') { posts.push({ url: u, corps: JSON.parse(String(init.body)) }); cree = true; return ok(99); }
    if (u.startsWith(URL_REFERENCES)) return ok({ disponible: true, aujourdhui: '2026-11-02', titulaireId: 5, administrateur: false, lotD: true, personneType: true, prixVente: true,
      mandat: true, uniteCommission: true, negociateurs: [LEA, MARC], apporteurs: [], personnes: [], structureImposee: imposee });
    if (u.startsWith(URL_MANDAT)) return ok(prise === null ? { libre: true, numero: 'M-42' } : { libre: false, numero: 'M-42', transaction: prise });
    if (u.startsWith(URL_VENTE)) return ok(aRejoindre);
    const ventes = cree ? [ancienne, venteCreee] : [ancienne];
    if (u.includes('agence=')) return ok({ disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: true }, ventes: [], agence: { cle: 'macj', societe: 'macj' },
      compteurs: { compromis: vide, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
    return ok({ disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: admin }, ventes,
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true },
      compteurs: { compromis: { nb: ventes.length, ids: ventes.map((v) => v.id), ca: { htC: 0, ttcC: 0 } }, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-nouveau-compromis-mon-espace]'); };

describe('🔴 « + Nouveau compromis » depuis « Mon espace »', () => {
  it('① la structure seule ; ② impossible d’avancer sans n° (bouton désactivé, aucune vérification)', async () => {
    await ouvrir();
    expect(container.querySelector('[data-parcours="structure"]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-parcours] [data-structure]')].map((b) => b.textContent)).toEqual(['CRITERIMMO', 'MACJ']);
    expect(container.querySelector('[data-parcours] input')).toBeNull();
    await cliquer('[data-structure="criterimmo"]');
    expect((container.querySelector('[data-parcours-verifier]') as HTMLButtonElement).disabled).toBe(true);
    await saisir('[data-parcours-mandat]', '   ');
    expect((container.querySelector('[data-parcours-verifier]') as HTMLButtonElement).disabled).toBe(true);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).startsWith(URL_MANDAT))).toBe(false);
  });

  it('n° libre : mon côté, puis le formulaire EXISTANT (n° posé, non modifiable ; moi à l’entrée) ; enregistré → en haut de « Mes compromis », déplié', async () => {
    await ouvrir();
    await cliquer('[data-structure="criterimmo"]');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]) === `${URL_MANDAT}?societe=criterimmo&numero=M-42`)).toBe(true);
    await cliquer('[data-cote="entree"]');
    const champ = container.querySelector<HTMLInputElement>('[data-formulaire-dossier="nouveau"] [data-champ="numero-mandat"]')!;
    expect([champ.value, champ.readOnly]).toEqual(['M-42', true]);
    expect(texte('[data-formulaire-dossier="nouveau"] h3')).toBe('Nouveau compromis — CRITERIMMO');
    await saisir('[data-formulaire-dossier] [data-champ="commission"]', '10000');
    // 🔴 Arno (05/11/2026) — je tiens l'entrée : mon vendeur RENSEIGNÉ et le collaborateur de la sortie (le partage 50/50 est proposé).
    await saisir('[data-personne-nom="vendeur-0"], [data-bloc-dossier="vendeurs"] [data-personne-nom]', 'DUPONT');
    await saisir('[data-bloc-dossier="vendeurs"] [data-personne-prenom]', 'Jean');
    await saisir('[data-bloc-dossier="vendeurs"] [data-personne-telephone]', '0600000000');
    await cliquer('[data-champ="sortie"]'); await cliquer('[role="option"][data-option="7"]');
    // 🔴 Arno (05/11/2026) — le partage SAISI par le créateur (les parts s'ouvrent vides) : 60 / 40.
    expect([...container.querySelectorAll<HTMLInputElement>('[data-partie-pct]')].slice(0, 2).map((x) => x.value)).toEqual(['', '']);
    await saisir('[data-partie-pct="0"]', '60');
    await saisir('[data-partie-pct="1"]', '40');
    await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(URL_COMPROMIS);
    expect(posts[0].corps).toMatchObject({ id: null, dossier: { societe: 'criterimmo', statut: 'compromis', numeroMandat: 'M-42', entreeId: 5, sortieId: 7,
      parties: [{ sorte: 'entree', compteId: 5, pourcentage: 60 }, { sorte: 'sortie', compteId: 7, pourcentage: 40 }] } });
    await calmer();
    // 🔴 Arno (05/11/2026) — la fenêtre « Compromis enregistré », puis « Voir le compromis ».
    expect(container.querySelector('[data-confirmation-compromis="99"]')).not.toBeNull();
    await cliquer('[data-voir-compromis]');
    expect(container.querySelector('[data-formulaire-dossier]')).toBeNull();
    expect(container.querySelector('[data-vue="compromis"]')!.getAttribute('aria-selected')).toBe('true'); // « Compromis » (décision 11)
    // en haut malgré une date de compromis plus ancienne, et déplié
    expect([...container.querySelectorAll('[data-ma-vente]')].map((x) => x.getAttribute('data-ma-vente'))).toEqual(['99', '50']);
    expect(container.querySelector('[data-ma-vente="99"] [data-colonne="vendeur"]')).not.toBeNull();
  });

  it('n° déjà pris : la transaction existante décrite ; « Rejoindre » → le côté libre seulement → le formulaire EXISTANT sur CETTE affaire, sans ses commissions ; envoyé avec la preuve et la version', async () => {
    prise = { id: 3, societe: 'criterimmo', numero: 'M-0042', libelle: 'DUPONT / MARTIN', statut: 'compromis', dateCompromis: '2026-10-01', dateActe: null,
      adresseBien: '1 rue A, Puteaux', vendeurs: ['M. Paul DUPONT'], acquereurs: ['Mme Anne MARTIN'], entree: 'Marc DURAND', sortie: null };
    await ouvrir();
    await cliquer('[data-structure="criterimmo"]');
    await saisir('[data-parcours-mandat]', 'm 42');
    await cliquer('[data-parcours-verifier]');
    const d = '[data-transaction-existante="3"]';
    expect(texte(d)).toContain('N° de mandatM-0042');
    expect(texte(d)).toContain('Bien1 rue A, Puteaux');
    expect(texte(d)).toContain('Vendeur(s)M. Paul DUPONT');
    expect(texte(d)).toContain('Statutcompromis en cours');
    expect(texte(d)).toContain('Date du compromis01/10/2026');
    expect(texte(d)).toContain('Négociateur d’entréeMarc DURAND');
    expect(container.querySelector('[data-formulaire-dossier]')).toBeNull();
    await cliquer('[data-rejoindre]');
    // l'entrée est tenue (un texte, pas un bouton) ; la sortie est libre (un bouton)
    expect(texte('[data-cote-tenu="entree"]')).toBe('Entrée du mandat (côté vendeur) : déjà tenue par Marc DURAND.');
    expect(container.querySelector('[data-rejoindre-cote="entree"]')).toBeNull();
    await cliquer('[data-rejoindre-cote="sortie"]');
    // le formulaire EXISTANT sur l'affaire 3 (aucune création), moi à la sortie, Marc gardé à l'entrée ; commissions non visibles
    expect(container.querySelector('[data-formulaire-dossier="3"]')).not.toBeNull();
    expect(container.querySelector('[data-commission-masquee="entree"]')).not.toBeNull();
    expect(container.querySelector('[data-champ="commission-entree"]')).toBeNull();
    expect(container.querySelector('[data-champ="commission-sortie"]')).toBeNull();
    await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(URL_COMPROMIS);
    expect(posts[0].corps).toMatchObject({ id: 3, version: 41, rejoindre: { numero: 'M-42' }, dossier: { entreeId: 7, sortieId: 5 } });
  });

  it('les deux côtés déjà tenus : aucun côté à rejoindre, le message le dit ; rien n’est envoyé', async () => {
    prise = { id: 3, societe: 'criterimmo', numero: 'M-0042', libelle: 'DUPONT / MARTIN', statut: 'compromis', dateCompromis: null, dateActe: null,
      adresseBien: null, vendeurs: [], acquereurs: [], entree: 'Marc DURAND', sortie: 'Zoé ITEST' };
    await ouvrir();
    await cliquer('[data-structure="criterimmo"]');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    await cliquer('[data-rejoindre]');
    expect(container.querySelector('[data-rejoindre-cote]')).toBeNull();
    expect(container.querySelector('[data-deux-cotes-tenus]')).not.toBeNull();
    expect(posts).toEqual([]);
  });
});

describe('🔴 décision 12 — la structure du nouveau compromis', () => {
  it('rattachée à UNE structure : la question n’est pas posée ; « Structure : CRITERIMMO » en lecture seule ; la vérification part dans CETTE structure', async () => {
    imposee = 'criterimmo';
    await ouvrir();
    expect(container.querySelector('[data-parcours="structure"]')).toBeNull();
    expect(container.querySelector('[data-parcours="mandat"]')).not.toBeNull();
    expect(texte('[data-structure-imposee]')).toBe('Structure : CRITERIMMO (celle de votre profil)');
    expect([...container.querySelectorAll('[data-parcours] button')].map((b) => b.textContent)).not.toContain('Changer de structure');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    expect((globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0])).find((u) => u.startsWith(URL_MANDAT))).toContain('societe=criterimmo');
  });
  it('rattachée aux deux (ou sans rattachement) : la question reste', async () => {
    await ouvrir();
    expect(container.querySelector('[data-parcours="structure"]')).not.toBeNull();
    expect(container.querySelector('[data-structure-imposee]')).toBeNull();
  });
  it('mode agence (administrateur) : la question reste, même si son profil n’a qu’une structure', async () => {
    imposee = 'criterimmo'; admin = true;
    await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-nouveau-compromis-mon-espace]');
    expect(container.querySelector('[data-parcours="structure"]')).not.toBeNull();
  });
});
