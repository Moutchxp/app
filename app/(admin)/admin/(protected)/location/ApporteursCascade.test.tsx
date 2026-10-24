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
const { aujourdhuiParis } = await import('../../../../lib/location/suivi/suivi');

/**
 * 🔴 Arno (24/10/2026, migration 420) — À L'ÉCRAN : « Effet de ce réglage » recalculé à chaque frappe (rien n'est envoyé), « Depuis
 * toujours » et son récapitulatif, la rémunération du collègue dans le même formulaire (externe seulement), la cascade sur la carte et
 * au panneau (interne : sans ligne collègue), un seul badge « PARTENAIRE EXTERNE ». Données fictives, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Le texte d'un bloc, ses enfants séparés d'une espace (« libellé montant »). */
const t = (el: Element | null | undefined): string => (el ? n([...el.children].map((c) => c.textContent).join(' ') || el.textContent) : '');
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let cumulAvecAnnees = false;

const EXTERNE: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2020-01-01', taux: 0.5, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 1 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }], remunerations: [] };
const INTERNE: Apporteur = { id: 9, nom: 'Marie Interne', type: 'collaborateur', archive: false, compteId: 2, nomFamille: 'Interne', prenom: 'Marie',
  baremes: [{ depuis: '2026-01-01', taux: 0.05, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 2 }], collegues: [], remunerations: [] };
const AGENCE: Apporteur = { id: 7, nom: 'Agence Test', type: 'agence', archive: false, compteId: null, nomFamille: '', prenom: null,
  baremes: [], collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }], remunerations: [] };
const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: 1, type: 'bail', dateSignature: '2025-06-10', libelleProprietaire: 'MARTIN Paul', libelleLocataire: 'DURAND Léa', honoProprietaireHt: 600, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 4, apporteurNom: 'Léa Fictive', apporteurTaux: 0.5, commissionSaisie: 500,
  negociateurId: 3, negociateurLibelle: 'Paul Collègue', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', lotId: 51, bailId: 70, source: 'import', locataires: [], lots: [], ...o,
});
// Deux dossiers de Léa Fictive : 2025 (repris du fichier, 50 % saisis) et octobre 2026 (sans montant saisi).
const DOSSIERS = [ligne({}), ligne({ id: 2, dateSignature: '2026-10-05', apporteurTaux: null, commissionSaisie: null, source: 'saisie' })];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  cumulAvecAnnees = false;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Marie Interne' }, { id: 5, libelle: 'Paul Collègue' }], apporteurs: [EXTERNE, INTERNE, AGENCE] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json({ etat: 'ok' }); }
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-24', dossiers: u.includes('id=4') ? DOSSIERS : [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: cumulAvecAnnees
      ? { total: { nb: 2, ca: 2000, commission: 1000 }, parAnnee: [{ annee: 2026, nb: 1, ca: 1000, commission: 500 }, { annee: 2025, nb: 1, ca: 1000, commission: 500 }], parMois: [] }
      : { total: { nb: 0, ca: 0, commission: 0 }, parAnnee: [], parMois: [] } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 4: { nb: 2, ca: 2000, commission: 1000, collegue: 33.335 }, 9: { nb: 1, ca: 1000, commission: 50 } } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: Element, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const formulaire = async (id: number) => {
  await annuaire();
  await clic(container.querySelector(`[data-apporteur-bouton="${id}"][data-panneau-bouton="taux"]`)!);
  await calmer();
  return container.querySelector(`[data-nouvelle-version="${id}"]`)!;
};

describe('🔴 « Nouveau taux » : l’effet en direct', () => {
  it('recalculé à chaque frappe, sans rien envoyer ; ce qui reste au taux précédent est dit', async () => {
    const f = await formulaire(4);
    const effet = () => t(f.querySelector('[data-effet-reglage="apporteur"]'));
    // Pré-rempli : 50 %, à partir d'aujourd'hui → aucun dossier concerné.
    // La date d'application pré-remplie est AUJOURD'HUI (le test ne dépend pas du jour où il tourne).
    const auj = aujourdhuiParis().split('-').reverse().join('/');
    expect(effet()).toBe(`Effet de ce réglage Dossiers concernés : 0 sur 2 (signés à partir du ${auj}) · Dû à l’apporteur HT : avant 1 000,00 € → après 1 000,00 € Les 2 dossiers signés avant le ${auj} restent au taux précédent.`);
    await saisir(f.querySelector('[data-version-taux]')!, '20');
    await saisir(f.querySelector('[data-application="version"] [data-application-date]')!, '2026-01-01');
    // Le dossier d'octobre 2026 (sans montant saisi) passe à 20 % ; celui de 2025 reste à 50 %.
    expect(effet()).toBe('Effet de ce réglage Dossiers concernés : 1 sur 2 (signés à partir du 01/01/2026) · Dû à l’apporteur HT : avant 1 000,00 € → après 700,00 € Le dossier signé avant le 01/01/2026 reste au taux précédent.');
    expect(posts).toEqual([]);
  });
  it('« Depuis toujours » : tous les dossiers ; « Enregistrer » montre d’abord le récapitulatif (combien changent, de combien) ; « Confirmer » envoie', async () => {
    const f = await formulaire(4);
    await saisir(f.querySelector('[data-version-taux]')!, '20');
    await clic(f.querySelector('[data-application="version"] [data-application-toujours]')!);
    expect((f.querySelector('[data-application="version"] [data-application-date]') as HTMLInputElement).disabled).toBe(true);
    expect(n(f.querySelector('[data-effet-reglage="apporteur"] [data-effet-ligne]')?.textContent))
      .toBe('Dossiers concernés : 2 sur 2 (depuis toujours — tous les dossiers, passés compris) · Dû à l’apporteur HT : avant 1 000,00 € → après 400,00 €');
    expect(f.querySelector('[data-effet-reste]')).toBeNull();
    await clic(f.querySelector('[data-enregistrer-version]')!);
    expect(posts).toEqual([]);
    const r = f.querySelector('[data-recap-toujours]')!;
    expect(n(r.querySelector('strong')?.textContent)).toBe('« Depuis toujours » : 2 dossier(s) sur 2 changent');
    expect(n(r.querySelector('[data-recap-ligne="apporteur"]')?.textContent)).toBe('Dû à l’apporteur HT : 1 000,00 € → 400,00 € (−600,00 €)');
    await clic(r.querySelector('[data-recap-confirmer]')!);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'bareme-apporteur', apporteurId: 4, bareme: { taux: '20', toujours: true, depuis: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } });
  });
  it('la rémunération du collègue (panneau « Rattachement », externe) : son effet en direct ; « Depuis toujours » par le récapitulatif', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="rattachement"]')!);
    const f = container.querySelector('[data-apporteur="4"] [data-panneau="rattachement"]')!;
    // 🔴 « Modifier la rémunération » : les étapes c → e avec le collègue actuel (en vigueur : aucune → « Non » présélectionné).
    await clic(f.querySelector('[data-modifier-remuneration]')!);
    const b = f.querySelector('[data-formulaire-rattachement="remuneration"]')!;
    expect(n(b.querySelector('[data-question-honoraires] > span')?.textContent)).toBe('Paul Collègue touche des honoraires sur l’activité de cet apporteur ?');
    expect(b.querySelector('[data-reponse="non"]')?.getAttribute('aria-checked')).toBe('true');
    await clic(b.querySelector('[data-reponse="oui"]')!);
    await saisir(b.querySelector('[data-remuneration-taux]')!, '5');
    // 🔴 Arno (24/10/2026) — un champ vide n'est plus lu comme 0 % : la gestion se saisit (0 est accepté).
    await saisir(b.querySelector('[data-remuneration-taux-gestion]')!, '0');
    await clic(b.querySelector('[data-application="remuneration"] [data-application-toujours]')!);
    expect(n(b.querySelector('[data-effet-reglage="collegue"] [data-effet-ligne]')?.textContent))
      .toBe('Dossiers concernés : 2 sur 2 (depuis toujours — tous les dossiers, passés compris) · Dû à Paul Collègue HT : avant 0,00 € → après 100,00 €');
    await clic(f.querySelector('[data-enregistrer-rattachement]')!);
    expect(n(f.querySelector('[data-recap-ligne="effet"]')?.textContent)).toBe('Dû à Paul Collègue HT : 0,00 € → 100,00 €');
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(posts.map((p) => p.action)).toEqual(['rattachement']);
    expect(posts[0]).toMatchObject({ rattachement: { sorte: 'remuneration', remuneration: { remunere: true, taux: '5', toujours: true } } });
    // Le panneau « Taux » ne porte plus la rémunération (elle est au « Rattachement »).
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="taux"]')!);
    expect(container.querySelector('[data-apporteur="4"] [data-remuneration-formulaire], [data-apporteur="4"] [data-remuneration-collegue]')).toBeNull();
  });
  it('un INTERNE : « Rattachement » réduit (aucun champ), pas de rémunération ; son « Taux » a l’effet en direct', async () => {
    const f = await formulaire(9);
    expect(f.querySelector('[data-remuneration-formulaire]')).toBeNull();
    expect(f.querySelector('[data-effet-reglage="apporteur"]')).not.toBeNull();
    await clic(container.querySelector('[data-apporteur-bouton="9"][data-panneau-bouton="rattachement"]')!);
    const r = container.querySelector('[data-apporteur="9"] [data-panneau="rattachement"]')!;
    expect(r.textContent).toBe('Apporteur interne — pas de rattachement.');
    expect(r.querySelector('input, button, [role="combobox"]')).toBeNull();
  });
});

describe('🔴 la cascade et le badge', () => {
  // 🔴 Arno (24/10/2026) — la cascade a quitté la carte (accord d'Arno) : le bloc « Conditions » y est ; la cascade reste par dossier
  // dans « Cumul », année dépliée (détail au centime : ApporteursConditionsCumul.test.tsx).
  it('la carte : plus de cascade, le bloc « Conditions » à sa place (interne : sans ligne collègue)', async () => {
    await annuaire();
    expect(container.querySelector('[data-apporteur="4"] [data-cascade]')).toBeNull();
    // 🔴 Arno (24/10/2026) — la ligne « Collègue — … » a quitté la carte : la rémunération du collègue est au résumé du panneau Rattachement.
    expect(container.querySelector('[data-conditions="4"] [data-conditions-collegue]')).toBeNull();
    expect(container.querySelector('[data-conditions="9"]')).not.toBeNull();
  });
  it('« Cumul » : la cascade de chaque dossier, dans son année dépliée', async () => {
    cumulAvecAnnees = true;
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    for (const an of ['2025', '2026']) await clic(container.querySelector(`[data-deplier-annee="${an}"]`)!);
    const d = [...container.querySelectorAll('[data-dossier-detail]')];
    expect(d.map((x) => x.getAttribute('data-dossier-detail'))).toEqual(['2', '1']);   // 2026 au-dessus de 2025 (le tableau va du plus récent au plus ancien)
    expect(t(d[0].querySelector('[data-ligne-dossier="net"]'))).toBe('= Net agence HT 500,00 €');
    expect(t(d[1].querySelector('[data-ligne-dossier="net"]'))).toBe('= Net agence HT 500,00 €');
  });
  it('un seul badge « PARTENAIRE EXTERNE » quand la pastille de type le répète ; les deux pour une agence', async () => {
    await annuaire();
    const titre = (id: number) => container.querySelector(`[data-apporteur="${id}"] .plo-version-titre`)!;
    expect(titre(4).querySelector('[data-type-apporteur]')).toBeNull();
    expect(n(titre(4).textContent).match(/PARTENAIRE EXTERNE|Partenaire externe/gi)).toHaveLength(1);
    expect(titre(7).querySelector('[data-badge-apporteur]')?.textContent).toBe('PARTENAIRE EXTERNE');
    expect(titre(7).querySelector('[data-type-apporteur]')?.textContent).toBe('Agence');
  });
});

describe('🔴 Suivi du mois : la cascade du dossier au panneau déplié', () => {
  it('externe rémunéré : les quatre lignes ; interne : sans ligne collègue', async () => {
    const remunere: Apporteur = { ...EXTERNE, remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'one_shot', taux: 0.05, tauxGestion: 0, dureeAnnees: null }] };
    const lignes = [ligne({ dateSignature: '2026-10-05', apporteurTaux: null, commissionSaisie: null }), ligne({ id: 2, dateSignature: '2026-10-06', apporteurId: 9, apporteurNom: 'Marie Interne', apporteurTaux: null, commissionSaisie: null })];
    const regles = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
    const ctx: ContexteCalcul = { regles, apporteurs: [remunere, INTERNE], retrocessions: [], recurrents: lignes, aujourdhui: '2026-10-24' };
    const d = { disponible: true, annee: 2026, annees: [2026], aujourdhui: '2026-10-24', activites: lignes, regles, apporteurs: ctx.apporteurs, retrocessions: [], negociateurs: [],
      gestion: { transitions: [], stock: 0, disponible: true }, preavis: {}, voirCommissions: false, gestionLignes: [], collegues: [], annuaire: true, ecartsFichier: [] } as DonneesTableau;
    await act(async () => { root.render(createElement(FeuilleDuMois, { d, lignes, ctx, annee: 2026, mois: 10, negociateur: null, onDetail: () => {}, onRelire: () => {} })); });
    await calmer();
    await clic(container.querySelector('[data-deplier-ligne="1"]')!);
    await clic(container.querySelector('[data-deplier-ligne="2"]')!);
    expect([...container.querySelectorAll('[data-cascade-ligne-feuille="1"] [data-cascade-ligne]')].map((l) => t(l))).toEqual([
      'Honoraires HT 1 000,00 €', '− Dû à l’apporteur (Léa Fictive) 500,00 €', '− Dû au collègue (Paul Collègue) 50,00 €', '= Net agence HT 450,00 €']);
    expect(container.querySelector('[data-cascade-ligne-feuille="2"] [data-cascade-ligne="collegue"]')).toBeNull();
    expect(t(container.querySelector('[data-cascade-ligne-feuille="2"] [data-cascade-ligne="net"]'))).toBe('= Net agence HT 950,00 €');
  });
});
