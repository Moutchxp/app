// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — LA CARTE ALLÉGÉE et « PASSER EN INTERNE ». La carte : nom + badges, synthèse, 4 boutons — et CHAQUE
 * information retirée se retrouve dans son panneau (coordonnées → Fiche ; rattachement, collègue, rémunération, historique →
 * Rattachement ; règle et historique → Taux). Le bouton : compte (un compte déjà lié montré, non choisissable), récapitulatif,
 * Confirmer. Données fictives, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
const EXTERNE: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa', societe: 'Fictive Conseil',
  telephone: '06 00 00 00 04', email: 'lea@exemple.fr', version: 'v1',
  baremes: [{ depuis: '2021-01-01', taux: 0.5, mode: 'one_shot', tauxGestion: 0, ordre: 1 }, { depuis: '2026-01-01', taux: 0.2, mode: 'one_shot', tauxGestion: 0, ordre: 2 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 6, collegueLibelle: 'Paul Collègue' }],
  remunerations: [{ depuis: '2021-01-01', remunere: true, mode: 'one_shot', taux: 0.03, tauxGestion: 0, dureeAnnees: null }] };
const INTERNE: Apporteur = { id: 9, nom: 'Marie Interne', type: 'collaborateur', archive: false, compteId: 2, nomFamille: 'Interne', prenom: 'Marie', compteLibelle: 'Marie Interne',
  compteIdentifiant: 'marie@exemple.fr', telephone: '06 00 00 00 09', interneDepuis: '2026-10-01', baremes: [{ depuis: '2026-01-01', taux: 0.05, ordre: 3 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 6, collegueLibelle: 'Paul Collègue' }], remunerations: [] };
const ORPHELIN: Apporteur = { id: 11, nom: 'Hugo Exemple', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Exemple', prenom: 'Hugo', baremes: [], collegues: [], remunerations: [] };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Marie Interne' }, { id: 5, libelle: 'Léa Fictive' }, { id: 6, libelle: 'Paul Collègue' }], apporteurs: [EXTERNE, INTERNE, ORPHELIN] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json({ etat: 'ok' }); }
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-24', dossiers: [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 0, ca: 0, commission: 0 }, parAnnee: [], parMois: [] } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {} });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const carte = (id: number) => container.querySelector(`[data-apporteur="${id}"]`)!;
const ouvrir = async (id: number, p: string) => { await clic(container.querySelector(`[data-apporteur-bouton="${id}"][data-panneau-bouton="${p}"]`)!); };
const panneau = (id: number) => carte(id).querySelector('[data-panneau]')!;

describe('🔴 la carte allégée : chaque information retirée est dans son panneau', () => {
  it('la carte : nom + badges, synthèse, 4 boutons — plus de rattachement, collègue, coordonnées, règle ni historique', async () => {
    await annuaire();
    const c = carte(4);
    expect(c.querySelector('[data-rattache-libelle], [data-collegue-remuneration], [data-regle-apporteur], [data-historique-regles-apporteur], [data-compte-apporteur]')).toBeNull();
    expect(c.textContent).not.toMatch(/Rattaché à|Collègue :|Fictive Conseil|06 00 00 00 04|lea@exemple\.fr|location 20 %|Historique/);
    expect(carte(9).textContent).not.toMatch(/Lié à son compte|06 00 00 00 09/);
    expect([...c.querySelectorAll('[data-panneau-bouton]')].map((b) => b.textContent)).toEqual(['Fiche', 'Rattachement', 'Taux', 'Cumul']);
  });
  it('coordonnées → Fiche (externe éditable, interne en lecture avec « Lié à son compte »)', async () => {
    await annuaire();
    await ouvrir(4, 'fiche');
    const f = panneau(4);
    expect([f.querySelector('[data-fiche-societe]'), f.querySelector('[data-fiche-telephone]'), f.querySelector('[data-fiche-email]')].map((x) => (x as HTMLInputElement).value))
      .toEqual(['Fictive Conseil', '06 00 00 00 04', 'lea@exemple.fr']);
    await ouvrir(9, 'fiche');
    expect(panneau(9).querySelector('[data-fiche-interne-coordonnees]')?.textContent).toBe('06 00 00 00 09');
    expect(panneau(9).querySelector('[data-compte-apporteur]')?.textContent).toBe('Lié à son compte de l’interface — rattaché à personne (interne depuis le 01/10/2026).');
  });
  it('rattachement, collègue, sa rémunération et leur historique → Rattachement ; l’historique d’un interne passé reste lisible', async () => {
    await annuaire();
    await ouvrir(4, 'rattachement');
    const r = panneau(4);
    expect(r.querySelector('[data-rattache-libelle]')?.textContent).toBe('Rattaché à Paul Collègue depuis toujours');
    expect(r.querySelector('[data-collegue-remuneration="4"]')?.textContent).toBe('Collègue : Paul Collègue — One shot — location 3 %, gestion 0 %');
    expect(r.querySelector('[data-historique-collegues]')?.textContent).toBe('Rattaché à Paul Collègue depuis toujours');
    expect(r.querySelector('[data-remuneration-en-vigueur]')?.textContent).toBe('One shot — location 3 %, gestion 0 % (depuis le 01/01/2021)');
    await ouvrir(9, 'rattachement');
    expect(panneau(9).querySelector('[data-rattachement-interne]')?.textContent).toBe('Apporteur interne — pas de rattachement.');
    expect(panneau(9).querySelector('[data-historique-collegues-clos]')?.textContent).toBe('Rattachements clos le 01/10/2026 : Paul Collègue depuis toujours');
    expect(panneau(9).querySelector('input, button, [role="combobox"]')).toBeNull();
  });
  it('règle de commission en vigueur et historique des versions → Taux', async () => {
    await annuaire();
    await ouvrir(4, 'taux');
    expect(panneau(4).querySelector('[data-regle-apporteur="4"]')?.textContent).toBe('En vigueur : One shot — location 20 %, gestion 0 % (depuis le 01/01/2026)');
    expect(panneau(4).querySelector('[data-historique-regles-apporteur]')?.textContent)
      .toBe('Historique : 01/01/2021 → One shot — location 50 %, gestion 0 % · 01/01/2026 → One shot — location 20 %, gestion 0 %');
  });
});

describe('🔴 « Passer en interne »', () => {
  it('externe seulement ; un compte déjà lié est montré, non choisissable, avec sa mention ; le récapitulatif, puis Confirmer', async () => {
    await annuaire();
    await ouvrir(9, 'fiche');
    expect(panneau(9).querySelector('[data-passer-interne]')).toBeNull();
    await ouvrir(4, 'fiche');
    const f = panneau(4);
    await clic(f.querySelector('[data-passer-interne="4"]')!);
    expect((f.querySelector('[data-passage-continuer]') as HTMLButtonElement).disabled).toBe(true);
    await clic(f.querySelector('[data-passage-compte]')!);
    const deja = f.querySelector('[data-liste-choix] [data-option="2"]')!;
    expect(deja.getAttribute('aria-disabled')).toBe('true');
    expect(deja.textContent).toContain('déjà l’apporteur interne « INTERNE Marie »');
    await clic(deja);
    expect((f.querySelector('[data-passage-continuer]') as HTMLButtonElement).disabled).toBe(true);
    await clic(f.querySelector('[data-passage-compte]')!);
    await clic(f.querySelector('[data-liste-choix] [data-option="5"]')!);
    await clic(f.querySelector('[data-passage-continuer]')!);
    expect(posts).toEqual([]);
    expect(f.querySelector('[data-recap-passage-texte]')?.textContent).toBe('FICTIVE Léa devient apporteur INTERNE lié au compte Léa Fictive. Le rattachement à Paul Collègue et '
      + 'la rémunération de ce collègue (One shot — location 3 %, gestion 0 %) prennent fin à compter d’aujourd’hui ; les dossiers déjà signés gardent leur calcul.');
    expect(f.querySelector('[data-passage-nom-different]')).toBeNull();   // même nom : pas d'alerte
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(posts).toEqual([{ action: 'passer-interne', apporteurId: 4, compteId: 5 }]);
  });
  it('un compte d’un autre nom : l’alerte le dit ; « Revenir » ne fait rien', async () => {
    await annuaire();
    await ouvrir(4, 'fiche');
    const f = panneau(4);
    await clic(f.querySelector('[data-passer-interne="4"]')!);
    await clic(f.querySelector('[data-passage-compte]')!);
    await clic(f.querySelector('[data-liste-choix] [data-option="6"]')!);
    await clic(f.querySelector('[data-passage-continuer]')!);
    expect(f.querySelector('[data-passage-nom-different]')?.textContent).toContain('n’est pas celui du compte');
    await clic(f.querySelector('[data-recap-revenir]')!);
    expect(f.querySelector('[data-recap-passage]')).toBeNull();
    expect(posts).toEqual([]);
  });
});
