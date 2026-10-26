// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ActiviteLue, ContexteCalcul, DonneesTableau, LigneGestion } from '../../../../lib/location/suivi/tableauBord';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams() }));
const { FeuilleDuMois } = await import('./FeuilleDuMois');

/**
 * 🔴 Arno (26/10/2026) — À L'ÉCRAN, la feuille de septembre 2026 (données fictives calquées sur la production) : le badge suit la fiche du
 * bien (BENTZ → « Relocation gestion », DEMANGE reste « Nouvelle gestion », ZHIVULINA sans bien garde son badge, CHEKROUNE inchangé) ; la
 * prime « Personnalisé » soulignée avec sa bulle (survol / toucher / focus), les autres non ; « Loyer (cc) » = loyer + charges, « à saisir ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
let container: HTMLDivElement;
let root: Root;

const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: 1, type: 'bail', dateSignature: '2026-09-01', libelleProprietaire: 'X', libelleLocataire: 'Y', honoProprietaireHt: 416.67, honoLocataireHt: 229.85,
  primeSaisie: 0, mandatGestion: false, categoriePrime: 'logement', apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null,
  negociateurId: null, negociateurLibelle: 'Nég', avecGestion: true, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', primeMode: 'aucune', lotId: 1, bailId: 1,
  source: 'import', locataires: [], lots: [], ...o,
});
const LIGNES = [
  ligne({ id: 826, libelleProprietaire: 'BENTZ 1004', lotId: 136, entreeGestionBien: '2020-08-28' }),
  ligne({ id: 828, libelleProprietaire: 'DEMANGE', lotId: 434, mandatGestion: true, primeMode: 'regle', primeSaisie: 150, entreeGestionBien: '2026-09-18' }),
  ligne({ id: 821, libelleProprietaire: 'ZHIVULINA-KOROTICH', lotId: null, bailId: null, rattachement: 'douteux', mandatGestion: true, primeMode: 'personnalise', primeSaisie: 50, entreeGestionBien: null }),
  ligne({ id: 823, libelleProprietaire: 'CHEKROUNE (Petit local)', lotId: 364, origineContact: null, mandatGestion: true, primeMode: 'regle', primeSaisie: 150, entreeGestionBien: '2026-01-30' }),
];
const GESTIONS: LigneGestion[] = [
  { lotId: 436, libelle: '25 Rue Henri Barbusse, GENNEVILLIERS', proprietaire: 'CHALAH Ramdane', effetLe: '2026-09-20', avant: null, apres: 'en_gestion', loyerHc: 579.63, provisions: 80, base: 'cc', tauxHt: 4.5 },
  { lotId: 434, libelle: '14 Rue du Bicentenaire, Puteaux', proprietaire: 'DEMANGE Hélène', effetLe: '2026-09-18', avant: null, apres: 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null },
];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: { disponible: true, annuaire: true, negociateurs: [], regles: [], retrocessions: [], collegues: [], apporteurs: [] } }) }) as unknown as Response);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function feuille(): Promise<void> {
  const regles = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
  const ctx: ContexteCalcul = { regles, apporteurs: [], retrocessions: [], recurrents: [], aujourdhui: '2026-10-26' };
  const d = { disponible: true, annee: 2026, annees: [2026], aujourdhui: '2026-10-26', activites: LIGNES, regles, apporteurs: [], retrocessions: [], negociateurs: [],
    gestion: { transitions: [], stock: 0, disponible: true }, preavis: {}, voirCommissions: false, gestionLignes: GESTIONS, collegues: [], annuaire: true, ecartsFichier: [] } as DonneesTableau;
  await act(async () => { root.render(createElement(FeuilleDuMois, { d, lignes: LIGNES, ctx, annee: 2026, mois: 9, negociateur: null, onDetail: () => {}, onRelire: () => {} })); });
}
const badge = (id: number) => container.querySelector(`[data-ligne-feuille="${id}"] [data-nature-bien]`)?.getAttribute('data-nature-bien');
const gestion = (id: number) => container.querySelector(`[data-ligne-feuille="${id}"] td[data-mot="Gestion"]`)!;

describe('🔴 règle A : le badge suit la fiche du bien', () => {
  it('BENTZ (en gestion depuis 2020) → Relocation gestion ; DEMANGE (entré en septembre) et ZHIVULINA (sans bien) → Nouvelle gestion ; CHEKROUNE → À qualifier', async () => {
    await feuille();
    expect([badge(826), badge(828), badge(821), badge(823)]).toEqual(['relocation', 'nouveau_gestion', 'nouveau_gestion', 'a_qualifier']);
    expect(container.querySelector('[data-ligne-feuille="826"] [data-nature-bien]')?.getAttribute('title')).toBe('bien en gestion depuis le 28/08/2020 (fiche du bien)');
    expect(n(container.querySelector('[data-legende-nature-item="relocation"] .fdm-legende-nb')?.textContent)).toBe('1');
  });
});

describe('🔴 prime saisie à la main : trait rouge et bulle', () => {
  it('« Personnalisé » (ZHIVULINA, 50 €) seulement ; CHEKROUNE et DEMANGE (la règle, 150 €) sans trait ; montants inchangés', async () => {
    await feuille();
    expect(n(gestion(821).querySelector('[role="tooltip"]')?.textContent)).toBe('prime saisie à la main');
    expect(n(gestion(821).querySelector('.fdm-prime-main-montant')?.textContent)).toBe('50,00 €');
    expect([n(gestion(823).textContent), n(gestion(828).textContent)]).toEqual(['150,00 €', '150,00 €']);
    expect(container.querySelectorAll('[data-prime-manuelle]')).toHaveLength(1);
  });
  it('la bulle : décrite au lecteur d’écran, ouverte au focus clavier et au toucher (sans déplier la ligne), refermée par Échap et la perte du focus', async () => {
    await feuille();
    const p = gestion(821).querySelector<HTMLElement>('[data-prime-manuelle]')!;
    const bulle = container.querySelector(`#${p.getAttribute('aria-describedby')}`)!;
    expect([bulle.getAttribute('role'), bulle.textContent, p.tabIndex]).toEqual(['tooltip', 'prime saisie à la main', 0]);
    await act(async () => { p.focus(); });
    expect(p.hasAttribute('data-ouvert')).toBe(true);
    await act(async () => { p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(p.hasAttribute('data-ouvert')).toBe(false);
    await act(async () => { p.click(); });
    expect(p.hasAttribute('data-ouvert')).toBe(true);
    expect(container.querySelector('[data-ligne-feuille="821"]')?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { p.blur(); });
    expect(p.hasAttribute('data-ouvert')).toBe(false);
  });
});

describe('🔴 « Nouvelles gestions du mois » : la colonne « Loyer (cc) »', () => {
  it('en-tête « Loyer (cc) » ; loyer + charges en une valeur (659,63 €) ; « à saisir » si inconnu ; honoraires inchangés', async () => {
    await feuille();
    const bloc = container.querySelector('[data-bloc="nouvelles-gestions"]')!;
    expect([...bloc.querySelectorAll('thead th')].map((th) => n(th.textContent))).toContain('Loyer (cc)');
    const loyer = (lot: number) => n(bloc.querySelector(`[data-ligne-gestion="${lot}"] td[data-mot="Loyer (cc)"]`)?.textContent);
    expect([loyer(436), loyer(434)]).toEqual(['659,63 €', 'à saisir']);
    expect(n(bloc.querySelector('[data-ligne-gestion="436"] td[data-mot="Honoraires / mois"]')?.textContent)).toBe('29,68 €');
  });
});
