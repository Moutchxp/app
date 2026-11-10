// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationLocataire } from './CreationLocataire';

/**
 * 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, points A et B (Arno, 10/11/2026) — « Nouveau locataire », le cas PIEULHET rejoué à l'écran :
 *   A. la date de signature du suivi (le mois compté) suit la DATE D'ENTRÉE (10/10/2026), modifiable ; l'alerte dit que la location sera
 *      comptée en octobre et non en novembre (mois de la saisie) ;
 *   B. le serveur trouve la ligne importée 847 (fichier d'octobre) : l'écran pose la question « la relier à ce bail ? » ; la réponse repart.
 * Les vrais composants, routes simulées : rien n'est écrit. Le jour est figé au 06/11/2026 (jour de la saisie réelle).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const refusImportee = () => ({ ok: true, status: 200, json: async () => ({ etat: 'refus',
  motif: 'Une ligne importée existe déjà pour ce locataire (PIEULHET) en octobre 2026 : la relier à ce bail ? Rien n’a été enregistré pour le suivi : choisissez de la relier ou de créer une nouvelle ligne.',
  lignesImportees: [{ id: 847, dateSignature: '2026-10-01', libelleLocataire: 'PIEULHET', libelleProprietaire: '', caHt: 425.66, memeBien: false }] }) }) as unknown as Response;
const CALCUL_OK = { etat: 'ok', surface: '61.8', zone: 'tres_tendue', date: '2026-10-10', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01',
  source: 'Arrêté', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034' };
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T11:20:00+01:00'));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ ...corps, url: u });
      if (u.includes('/suivi')) return ((corps.activite as Record<string, unknown>)?.ligneImportee === undefined ? refusImportee() : ok({ id: 847 }));
      return ok(corps.action === 'apercu-lots' ? { recap: ['Le logement est loué.'] } : { locataireIds: [531], reintegrations: [], bailId: 542 });
    }
    if (u.includes('/suivi?vue=proposition')) return ok({ avecGestion: true, categoriePrime: 'logement', origineProprietaire: 'deja', origineLocataire: 'nouveau' });
    if (u.includes('/suivi')) return ok({ disponible: true, moi: 5, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }], apporteurs: [], regles: [], retrocessions: [] });
    if (u.includes('schemaConditionsEntree')) return ok({ conditions: true, loyer: true, manquantes: [] });
    if (u.includes('honorairesProprietaire=7')) return ok(CALCUL_OK);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '28 Avenue Marceau, Courbevoie', detail: 'Appartement', loue: false }]);
    if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'lot', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [], categorie: null }], sorte: 'simple', origineLibelle: '' });
    if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie: 'logement' }, complements: { entretienAPrevoir: null, entretiens: [] } });
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pilule = (groupe: string, mot: string) => [...container.querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;
const dateSignature = () => container.querySelector('input[data-date-signature]') as HTMLInputElement;
const alerte = () => container.querySelector('[data-alerte-mois-compte]')?.textContent ?? null;
const preparer = async (entree: string) => {
  await act(async () => { root.render(createElement(CreationLocataire)); }); await calmer();
  const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
  const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
  await saisir(nom, 'PIEULHET');
  const v = form.querySelectorAll('.cp-saisie--valeur');
  await saisir(v[0] as HTMLInputElement, '06 12 34 56 78');
  await saisir(v[1] as HTMLInputElement, 'fictif@exemple.test');
  await clic(form.querySelector('button[type="submit"]')!);
  await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Marceau');
  await calmer();
  await clic(container.querySelector('.loc-choix button')!);
  await calmer();
  await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, entree);
  await calmer();
};
const toutRepondre = async () => {
  await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
  await clic(pilule('Prélèvement', 'Non'));
  await clic(pilule('Garant personne physique', 'Non'));
  await clic(pilule('Assurance loyers impayés', 'Visale'));
  await clic(container.querySelector('[data-entretien-reponse="non"]')!);
  await clic(pilule('Honoraires du locataire', 'Compte bancaire transaction'));
  await clic(pilule('Honoraires du propriétaire', 'Compte bancaire gestion'));
  await clic(pilule('Mode de règlement', 'Chèque'));
  for (const sel of ['[data-loyer="principal"] input', '[data-loyer="provisions"] input', '[data-somme="depotGarantie"] input', '[data-somme="honorairesAgence"] input', '[data-hono-montant] input']) {
    const c = container.querySelector(sel) as HTMLInputElement | null;
    if (c !== null && c.value === '' && !c.disabled) await saisir(c, '0');
  }
  const charges = pilule('Paiement des charges', 'Agence');
  if (charges !== undefined && charges.getAttribute('aria-pressed') !== 'true') await clic(charges);
};
const soumettre = async () => { await clic(container.querySelector('[data-collant] button[type="submit"]')!); await calmer(); };

describe('🔴🔴 A — la date de signature suit la date d’entrée ; l’alerte du mois compté', () => {
  it('entrée le 10/10/2026, saisie le 06/11/2026 : la date de signature vaut le 10/10 et l’alerte dit « comptée en octobre »', async () => {
    await preparer('2026-10-10');
    expect(dateSignature().value).toBe('2026-10-10');
    expect(alerte()).toBe('L’entrée du locataire (10/10/2026) est en octobre 2026 : la location sera comptée en octobre 2026, et non dans le mois de la saisie (novembre 2026).');
  });
  it('le champ reste modifiable : changée à la main, la date tient (même si l’entrée change ensuite), et l’alerte le signale', async () => {
    await preparer('2026-10-10');
    await saisir(dateSignature(), '2026-11-06'); await calmer();
    expect(alerte()).toBe('Attention : la date de signature (06/11/2026) fera compter cette location en novembre 2026, alors que l’entrée du locataire (10/10/2026) est en octobre 2026.');
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-10-12'); await calmer();
    expect(dateSignature().value).toBe('2026-11-06');
  });
  it('entrée dans le mois de la saisie : ni décalage, ni alerte', async () => {
    await preparer('2026-11-02');
    expect(dateSignature().value).toBe('2026-11-02');
    expect(alerte()).toBeNull();
  });
});

describe('🔴🔴 B — une ligne importée existe déjà : la question, et la réponse renvoyée', () => {
  const question = () => document.querySelector('[role="alertdialog"]') as HTMLElement | null;   // ModaleIssue : rendue en portail, hors du conteneur
  const bouton = (mot: string) => [...(question()?.querySelectorAll('button, a') ?? [])].find((b) => b.textContent === mot) as HTMLButtonElement;
  it('« Oui, la relier à ce bail » : la question d’Arno s’affiche, puis le suivi repart avec { relier: 847 } — une seule ligne', async () => {
    await preparer('2026-10-10'); await toutRepondre();
    await soumettre(); await soumettre();
    expect(question()?.textContent).toContain('Une ligne importée existe déjà pour ce locataire (PIEULHET) en octobre 2026 : la relier à ce bail ?');
    expect(question()?.textContent).toContain('Ligne n° 847 du fichier de suivi : 01/10/2026 · PIEULHET · 425,66 € HT.');
    await clic(bouton('Oui, la relier à ce bail')); await calmer();
    const suivis = posts.filter((p) => p.action === 'enregistrer-activite');
    expect(suivis).toHaveLength(2);
    expect((suivis[0].activite as Record<string, unknown>).ligneImportee).toBeUndefined();
    expect(suivis[1]).toMatchObject({ bailId: 542, activite: { ligneImportee: { relier: 847 }, dateSignature: '2026-10-10' } });
  });
  it('« Non, créer une nouvelle ligne » : le choix repart tel quel (« nouvelle »), tracé par le serveur', async () => {
    await preparer('2026-10-10'); await toutRepondre();
    await soumettre(); await soumettre();
    await clic(bouton('Non, créer une nouvelle ligne')); await calmer();
    expect(posts.filter((p) => p.action === 'enregistrer-activite').map((p) => (p.activite as Record<string, unknown>).ligneImportee)).toEqual([undefined, 'nouvelle']);
  });
});
