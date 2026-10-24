// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ActiviteLue, ContexteCalcul, DonneesTableau } from '../../../../lib/location/suivi/tableauBord';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams() }));
const { ModaleParametresLocation } = await import('./ParametresLocation');
const { FeuilleDuMois } = await import('./FeuilleDuMois');

/**
 * 🔴 Arno (24/10/2026, migration 419) — À L'ÉCRAN : la carte d'un INTERNE (badge, rattaché à personne) et d'un EXTERNE (badge, ligne
 * « Collègue : <nom> — <rémunération> », « Dû au collègue HT ») ; la création d'un externe SANS collègue refusée avant l'envoi ; la
 * rémunération du collègue enregistrée en version datée ; dans Suivi du mois, « Commission collègue (apport) » au panneau et la ligne
 * du bas de feuille. Les vrais composants, routes simulées, données fictives : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];

const EXTERNE: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }],
  remunerations: [{ depuis: '2026-01-01', remunere: true, mode: 'recurrent', taux: 0.05, tauxGestion: 0.1, dureeAnnees: 3 }] };
const INTERNE: Apporteur = { id: 9, nom: 'Arnaud Jorel', type: 'collaborateur', archive: false, compteId: 2, nomFamille: 'Jorel', prenom: 'Arnaud',
  baremes: [{ depuis: '2026-01-01', taux: 0.05, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1, dureeAnnees: 1 }], collegues: [], remunerations: [] };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Arnaud Jorel' }, { id: 5, libelle: 'Jean-Baptiste Pons' }, { id: 6, libelle: 'Cédric Exemple' }], apporteurs: [EXTERNE, INTERNE] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json({ etat: 'ok' }); }
    if (String(url).includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 0, ca: 0, commission: 0 }, parAnnee: [], parMois: [] } });
    if (String(url).includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 4: { nb: 2, ca: 2000, commission: 200, collegue: 130 }, 9: { nb: 1, ca: 1000, commission: 50 } } });
    if (String(url).includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};

describe('🔴 l’annuaire : internes et externes', () => {
  it('la carte INTERNE : badge, rattaché à personne — ni collègue, ni « à rattacher », ni « Dû au collègue »', async () => {
    await annuaire();
    const c = container.querySelector('[data-apporteur="9"]')!;
    expect(c.querySelector('[data-badge-apporteur]')?.textContent).toBe('INTERNE');
    expect(c.querySelector('[data-compte-apporteur]')?.textContent).toBe('Lié à son compte de l’interface — rattaché à personne.');
    expect(c.querySelector('[data-a-rattacher], [data-collegue-apporteur], [data-collegue-remuneration], [data-du-collegue]')).toBeNull();
    expect(c.textContent).toContain('Récurrent — location 5 %, gestion 10 % / mois, pendant 1 an');
    await clic(c.querySelector('[data-ouvrir-fiche="9"]')!);
    // Le seul champ qui disparaît pour un interne (voulu par Arno) : le collègue de rattachement.
    expect(c.querySelector('[data-rattacher], [data-rattacher-collegue], [data-remuneration-collegue]')).toBeNull();
    expect(c.querySelector('[data-fiche-type-interne]')?.textContent).toContain('Apporteur interne');
  });
  it('la carte EXTERNE : badge, « Collègue : <nom> — <rémunération résumée> », « Dû au collègue HT »', async () => {
    await annuaire();
    const c = container.querySelector('[data-apporteur="4"]')!;
    expect(c.querySelector('[data-badge-apporteur]')?.textContent).toBe('PARTENAIRE EXTERNE');
    expect(c.querySelector('[data-collegue-remuneration="4"]')?.textContent).toBe('Collègue : Jean-Baptiste Pons — Récurrent — location 5 %, gestion 10 % / mois, pendant 3 ans');
    expect(n(c.querySelector('[data-du-collegue="4"]')?.textContent)).toBe('Dû au collègue HT130,00 €');
    expect(n(c.querySelector('[data-totaux-ligne="4"]')?.textContent)).toBe('Dossiers2Honoraires HT2 000,00 €Dû HT200,00 €Dû au collègue HT130,00 €');
  });
  it('la rémunération du collègue : « Rémunération », Récurrent, ses taux, 3 ans, une date d’effet → une version datée envoyée', async () => {
    await annuaire();
    const c = container.querySelector('[data-apporteur="4"]')!;
    await clic(c.querySelector('[data-ouvrir-fiche="4"]')!);
    const b = c.querySelector('[data-remuneration-collegue="4"]')!;
    expect(b.querySelector('h4')?.textContent).toBe('Rémunération de Jean-Baptiste Pons (a apporté cet apporteur)');
    expect(b.querySelector('[data-remunere="oui"]')?.getAttribute('aria-pressed')).toBe('true');
    await saisir(b.querySelector('[data-remuneration-taux]') as HTMLInputElement, '6');
    await saisir(b.querySelector('[data-remuneration-depuis]') as HTMLInputElement, '2026-11-01');
    await clic(b.querySelector('[data-enregistrer-remuneration]')!);
    expect(posts.at(-1)).toEqual({ action: 'remuneration-collegue', apporteurId: 4,
      remuneration: { remunere: true, mode: 'recurrent', taux: '6', tauxGestion: '10', dureeAnnees: '3', depuis: '2026-11-01' } });
    await clic(b.querySelector('[data-remunere="non"]')!);
    expect(b.querySelector('[data-remuneration-taux]')).toBeNull();
    await clic(b.querySelector('[data-enregistrer-remuneration]')!);
    expect(posts.at(-1)).toMatchObject({ remuneration: { remunere: false } });
  });
  it('🔴 créer un EXTERNE sans collègue : refusé à l’écran, RIEN n’est envoyé ; un INTERNE : son compte, sans collègue', async () => {
    await annuaire();
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Paul Exemple');
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-refus-local-ajout]')?.textContent).toBe('Un partenaire externe doit être rattaché à un collègue (de qui vient ce contact) : choisissez le collègue de rattachement.');
    await clic(container.querySelector('[data-sorte="interne"]')!);
    expect(container.querySelector('[data-nom-apporteur], [data-collegue-apporteur-nouveau]')).toBeNull();
    await clic(container.querySelector('[data-compte-apporteur-nouveau]')!);
    // Un compte déjà apporteur interne (Arnaud Jorel) n'est pas proposé.
    expect([...container.querySelectorAll('[data-liste-choix] [data-option]')].map((o) => o.textContent?.replace('✓', '').trim())).toEqual(['— choisir —', 'Jean-Baptiste Pons', 'Cédric Exemple']);
    await clic(container.querySelector('[data-liste-choix] [data-option="6"]')!);
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { interne: true, compteId: 6 } });
    expect((posts.at(-1)!.apporteur as Record<string, unknown>).collegueId).toBeUndefined();
  });
});

describe('🔴 Suivi du mois : la commission du collègue', () => {
  const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
    id: 1, type: 'bail', dateSignature: '2026-10-05', libelleProprietaire: 'MARTIN Paul', libelleLocataire: 'DURAND Léa', honoProprietaireHt: 600, honoLocataireHt: 400,
    primeSaisie: null, mandatGestion: true, categoriePrime: 'logement', apporteurId: 4, apporteurNom: 'Léa Fictive', apporteurTaux: null, commissionSaisie: null,
    negociateurId: 3, negociateurLibelle: 'Jean-Baptiste Pons', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100,
    assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', tauxGestionBien: 5, finGestion: null,
    lotId: 51, bailId: 70, source: 'saisie', locataires: [], lots: [], ...o,
  });
  it('le panneau : « Commission collègue (apport) : <nom> — <montant> » ; le bas de feuille : « Commissions collègues (apport d’apporteurs) »', async () => {
    const lignes = [ligne({}), ligne({ id: 2, apporteurId: 9, apporteurNom: 'Arnaud Jorel' })];
    const regles = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
    const ctx: ContexteCalcul = { regles, apporteurs: [EXTERNE, INTERNE], retrocessions: [], recurrents: lignes, aujourdhui: '2026-10-24' };
    const d = { disponible: true, annee: 2026, annees: [2026], aujourdhui: '2026-10-24', activites: lignes, regles, apporteurs: [EXTERNE, INTERNE], retrocessions: [],
      negociateurs: [], gestion: { transitions: [], stock: 0, disponible: true }, preavis: {}, voirCommissions: false, gestionLignes: [], collegues: [], annuaire: true, ecartsFichier: [] } as DonneesTableau;
    await act(async () => { root.render(createElement(FeuilleDuMois, { d, lignes, ctx, annee: 2026, mois: 10, negociateur: null, onDetail: () => {}, onRelire: () => {} })); });
    await calmer();
    await clic(container.querySelector('[data-deplier-ligne="1"]')!);
    const champ = [...container.querySelectorAll('[data-detail-ligne="1"] dt')].find((x) => x.textContent === 'Commission collègue (apport)');
    // CA 1 000 € × 5 % = 50 € à la signature ; puis 10 % × 50 € de gestion mensuelle = 5 € / mois, pendant 3 ans.
    expect(n(champ?.nextElementSibling?.textContent)).toBe('Jean-Baptiste Pons — 50,00 € + 5,00 € / mois (pendant 3 ans)');
    // L'apporteur INTERNE ne rémunère aucun collègue : pas de champ.
    await clic(container.querySelector('[data-deplier-ligne="2"]')!);
    expect([...container.querySelectorAll('[data-detail-ligne="2"] dt')].some((x) => x.textContent === 'Commission collègue (apport)')).toBe(false);
    const bas = container.querySelector('[data-bloc="bas-de-feuille"]')!;
    expect(n(bas.querySelector('[data-total="collegues"]')?.textContent)).toBe('55,00 €');   // 50 € (signature) + 5 € (octobre)
    expect(bas.querySelector('[data-total="collegues"]')?.previousElementSibling?.textContent).toBe('Commissions collègues (apport d’apporteurs)');
    // Les totaux existants : les honoraires d'apporteurs ne comprennent PAS la commission du collègue.
    // Externe : 10 % × 1 000 € (one shot, gestion 0 %) = 100 € ; interne : 5 % × 1 000 € + 10 % × 50 € (récurrent d'octobre) = 55 €.
    expect(n(bas.querySelector('[data-total="apporteurs"]')?.textContent)).toBe('155,00 €');
  });
});
