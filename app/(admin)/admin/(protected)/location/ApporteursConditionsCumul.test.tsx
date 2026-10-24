// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ActiviteCalcul } from '../../../../lib/location/suivi/tableauBord';
import { cumulApporteur, dontAnneeBrut, repartirAuCentime, totauxApporteurs } from '../../../../lib/location/suivi/tableauBord';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';
import { autresConditions, conditionsCollegue, detailDossier, phraseAutresConditions } from '../../../../lib/location/suivi/detailDossier';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — (1) aucun dû n'a l'air calculé au taux « en vigueur » quand il ne l'est pas ; (2) le bloc « Conditions » à la
 * place de la cascade sur la carte ; (3) le Cumul par ANNÉE, fermé par défaut, qui se déplie sur les dossiers décomposés location /
 * gestion — une ligne seulement si son montant n'est pas nul, un sous-total seulement quand il y a deux lignes, au centime.
 * Données fictives, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const JOUR = '2026-10-24';

const dossier = (o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2025-06-10', libelleProprietaire: 'MARTIN Paul', libelleLocataire: 'DURAND Léa', honoProprietaireHt: 600, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 4, apporteurNom: 'Léa Fictive', apporteurTaux: null, commissionSaisie: null,
  negociateurId: 3, negociateurLibelle: 'Paul Collègue', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', ...o,
});
// Un externe « One shot » : 50 % depuis le 31/12/2020, puis 20 % depuis le 23/10/2026 ; son collègue rémunéré 5 % / 10 % (one shot).
const ONE_SHOT: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa',
  baremes: [{ depuis: '2020-12-31', taux: 0.5, mode: 'one_shot', tauxGestion: 0, ordre: 1 }, { depuis: '2026-10-23', taux: 0.2, mode: 'one_shot', tauxGestion: 0, ordre: 2 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }],
  remunerations: [{ depuis: '2021-01-01', remunere: true, mode: 'one_shot', taux: 0.05, tauxGestion: 0.1, dureeAnnees: null }] };
// Un externe « Récurrent » 10 % / 20 % pendant 3 ans ; son collègue : aucune rémunération.
const RECURRENT: Apporteur = { id: 6, nom: 'Hugo Exemple', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Exemple', prenom: 'Hugo',
  baremes: [{ depuis: '2024-01-01', taux: 0.1, mode: 'recurrent', tauxGestion: 0.2, dureeAnnees: 3, ordre: 3 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }],
  remunerations: [{ depuis: '2024-01-01', remunere: false, mode: 'one_shot', taux: 0, tauxGestion: 0, dureeAnnees: null }] };
const INTERNE: Apporteur = { id: 9, nom: 'Marie Interne', type: 'collaborateur', archive: false, compteId: 2, nomFamille: 'Interne', prenom: 'Marie',
  baremes: [{ depuis: '2026-01-01', taux: 0.05, mode: 'one_shot', tauxGestion: 0, ordre: 4 }], collegues: [], remunerations: [] };
const APPORTEURS = [ONE_SHOT, RECURRENT, INTERNE];

// Les dossiers de Léa Fictive : un dossier « location + gestion » (1er janvier 2025) et un dossier « location seule » repris de l'import (mars 2025).
const LOC_GESTION = dossier({ id: 21, dateSignature: '2025-01-01', libelleProprietaire: 'BERNARD Anne', libelleLocataire: 'PETIT Marc', honoProprietaireHt: 1000, honoLocataireHt: 0,
  avecGestion: true, loyerHc: 1000, charges: 100, tauxGestionBien: 6 });
const LOC_SEULE = dossier({ id: 22, dateSignature: '2025-03-01', libelleProprietaire: 'COHEN Michel', libelleLocataire: 'WALCH Elise', honoProprietaireHt: 421, honoLocataireHt: 0,
  apporteurTaux: 0.5, commissionSaisie: 210.5 });

describe('🔴 (1) le détail d’un dossier : d’où vient chaque dû', () => {
  it('location seule (import) : pas de ligne gestion, pas de sous-total ; le dû dit « montant saisi à l’import » et son taux', () => {
    const d = detailDossier(LOC_SEULE, APPORTEURS, JOUR)!;
    expect(d.honoraires).toMatchObject({ location: 421, gestion: 0, baseGestion: null });
    expect(d.apporteur.location).toMatchObject({ montant: 210.5, taux: 0.5, source: { sorte: 'import_montant' } });
    expect(d.apporteur.gestion).toBeNull();
    expect(d.collegue).toMatchObject({ nom: 'Paul Collègue', location: { montant: 21.05, taux: 0.05 }, gestion: null, total: 21.05 });
    expect(d.net).toBe(189.45);
  });
  it('location + gestion : la version en vigueur à la SIGNATURE (50 %), pas celle d’aujourd’hui (20 %) ; la gestion du collègue en one shot sur 12 mois', () => {
    const d = detailDossier(LOC_GESTION, APPORTEURS, JOUR)!;
    expect(d.apporteur.location).toMatchObject({ montant: 500, taux: 0.5, source: { sorte: 'version', depuis: '2020-12-31' } });
    expect(d.apporteur.gestion).toBeNull();   // gestion 0 % dans la version de 2020 : pas de ligne
    expect(d.honoraires).toEqual({ location: 1000, gestion: 792, baseGestion: '12 mois × 66,00 € / mois', total: 1792 });
    expect(d.collegue).toMatchObject({ location: { montant: 50 }, gestion: { montant: 79.2, taux: 0.1, detail: 'one shot 12 mois' }, total: 129.2 });
    expect(d.net).toBe(1162.8);
  });
  it('récurrent : la gestion sur les mois dus jusqu’au jour, dans la durée ; aucune rémunération du collègue : pas de bloc collègue', () => {
    const d = detailDossier(dossier({ id: 30, apporteurId: 6, apporteurNom: 'Hugo Exemple', dateSignature: '2026-03-15', avecGestion: true, loyerHc: 1000, charges: 0, tauxGestionBien: 5 }), APPORTEURS, JOUR)!;
    expect(d.apporteur.location).toMatchObject({ montant: 100, taux: 0.1 });
    expect(d.apporteur.gestion).toMatchObject({ montant: 80, taux: 0.2, detail: 'récurrent pendant 3 ans — 8 mois dus' });
    expect(d.apporteur.total).toBe(180);
    expect(d.honoraires).toMatchObject({ location: 1000, gestion: 400, total: 1400, baseGestion: '8 mois × 50,00 € / mois' });
    expect(d.collegue).toBeNull();
    expect(d.net).toBe(1220);
  });
  it('au centime : chaque montant arrondi une fois ; totaux et net calculés à partir des montants affichés ; mêmes dus que les totaux de l’annuaire', () => {
    const a: Apporteur = { ...ONE_SHOT, baremes: [{ depuis: '2020-01-01', taux: 1 / 3, mode: 'one_shot', tauxGestion: 1 / 7, ordre: 1 }],
      remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'one_shot', taux: 0.07, tauxGestion: 0.03, dureeAnnees: null }] };
    const x = dossier({ honoProprietaireHt: 333.33, honoLocataireHt: 0.01, avecGestion: true, loyerHc: 777.77, charges: 11.11, tauxGestionBien: 7.3 });
    const d = detailDossier(x, [a], JOUR)!;
    const c = (v: number) => Math.round(v * 100);
    for (const b of [d.apporteur, d.collegue!]) expect(c(b.total)).toBe(c(b.location!.montant) + c(b.gestion!.montant));
    expect(c(d.honoraires.total)).toBe(c(d.honoraires.location) + c(d.honoraires.gestion));
    expect(c(d.net)).toBe(c(d.honoraires.total) - c(d.apporteur.total) - c(d.collegue!.total));
    const t = totauxApporteurs([x], [a], JOUR)[4];
    expect(Math.abs(d.apporteur.total - t.commission)).toBeLessThan(0.01);
    expect(Math.abs(d.collegue!.total - t.collegue)).toBeLessThan(0.01);
  });
});

// Les dossiers « Récurrent » de Hugo Exemple : montants qui ne tombent pas rond, dus sur plusieurs années (2024 → 2026).
const RECURRENTS = [
  dossier({ id: 41, apporteurId: 6, apporteurNom: 'Hugo Exemple', dateSignature: '2024-03-17', libelleProprietaire: 'AUBERT Lise', libelleLocataire: 'NOËL Tom',
    honoProprietaireHt: 777.77, honoLocataireHt: 333.33, avecGestion: true, loyerHc: 1234.57, charges: 98.76, tauxGestionBien: 6.85 }),
  dossier({ id: 42, apporteurId: 6, apporteurNom: 'Hugo Exemple', dateSignature: '2025-05-02', libelleProprietaire: 'BLANC Yves', libelleLocataire: 'COLIN Ana',
    honoProprietaireHt: 512.49, honoLocataireHt: 0, avecGestion: true, loyerHc: 987.65, charges: 43.21, tauxGestionBien: 7.13 }),
  dossier({ id: 43, apporteurId: 6, apporteurNom: 'Hugo Exemple', dateSignature: '2025-11-28', libelleProprietaire: 'DUVAL Rémi', libelleLocataire: 'ÉVRARD Zoé',
    honoProprietaireHt: 401.01, honoLocataireHt: 199.99 }),
];

describe('🔴 (2c) « dont <année> » : la somme des dossiers dépliés = la ligne de l’année, au centime', () => {
  it('la répartition au centime : somme exacte, chaque « dont » à moins d’un centime de sa valeur brute', () => {
    const cumul = cumulApporteur(RECURRENTS, APPORTEURS, 6, JOUR);
    expect(cumul.parAnnee.map((y) => y.annee)).toEqual([2026, 2025, 2024]);
    for (const y of cumul.parAnnee) {
      const bruts = RECURRENTS.map((d) => ({ id: d.id, brut: dontAnneeBrut(d, APPORTEURS, JOUR, y.annee) }));
      // La somme brute des dossiers EST le dû de l'année du Cumul.
      expect(Math.abs(bruts.reduce((s, x) => s + x.brut, 0) - y.commission)).toBeLessThan(1e-6);
      const cible = Math.round(y.commission * 100);
      const dont = repartirAuCentime(bruts, cible);
      expect([...dont.values()].reduce((s, c) => s + c, 0)).toBe(cible);
      for (const x of bruts) expect(Math.abs((dont.get(x.id) ?? 0) - x.brut * 100)).toBeLessThan(1);
    }
  });
  it('des restes qui ne tombent pas juste : la somme reste exacte (plus forts restes)', () => {
    const d = repartirAuCentime([{ id: 'a', brut: 0.333 }, { id: 'b', brut: 0.333 }, { id: 'c', brut: 0.334 }], 100);
    expect([...d.values()].reduce((s, c) => s + c, 0)).toBe(100);
    expect(d.get('c')).toBe(34);
  });
});

describe('🔴 (2) les conditions d’un apporteur', () => {
  it('les dossiers qui ne suivent PAS la version d’aujourd’hui : saisis à l’import (et conformes à la version de l’époque), ou version antérieure', () => {
    const imports = [1, 2, 3].map((i) => dossier({ id: i, dateSignature: '2025-0' + i + '-01', honoProprietaireHt: 100 * i, honoLocataireHt: 0, apporteurTaux: 0.5, commissionSaisie: 50 * i }));
    expect(autresConditions(imports, APPORTEURS, 4, JOUR).map(phraseAutresConditions))
      .toEqual(['3 dossiers : montants saisis à l’import (location 50 %, conformes à la version du 31/12/2020)']);
    const anterieurs = [dossier({ id: 7, dateSignature: '2024-05-01' }), dossier({ id: 8, dateSignature: '2026-10-24' })];
    expect(autresConditions(anterieurs, APPORTEURS, 4, JOUR).map(phraseAutresConditions)).toEqual(['1 dossier calculé aux conditions antérieures (One shot 50 %)']);
    // Saisi à l'import, mais exactement aux conditions d'aujourd'hui (20 %, version du 23/10/2026) : rien à signaler.
    expect(autresConditions([dossier({ id: 9, dateSignature: '2026-10-24', apporteurTaux: 0.2, commissionSaisie: 200 })], APPORTEURS, 4, JOUR)).toEqual([]);
  });
  it('le collègue : sa rémunération en vigueur, ou « aucune rémunération » ; rien pour un interne', () => {
    expect(conditionsCollegue(ONE_SHOT, JOUR)?.texte).toBe('Paul Collègue : One shot — location 5 %, gestion 10 % (depuis le 01/01/2021)');
    expect(conditionsCollegue(RECURRENT, JOUR)?.texte).toBe('Paul Collègue : aucune rémunération');
    expect(conditionsCollegue(INTERNE, JOUR)).toBeNull();
  });
});

// ── À l'écran ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Marie Interne' }, { id: 5, libelle: 'Paul Collègue' }], apporteurs: APPORTEURS };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: JOUR, dossiers: u.includes('id=4') ? [LOC_SEULE, LOC_GESTION] : u.includes('id=6') ? RECURRENTS : [] } });
    if (u.includes('vue=cumul-apporteur') && u.includes('id=6')) return json({ etat: 'ok', data: cumulApporteur(RECURRENTS, APPORTEURS, 6, JOUR) });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 2, ca: 1421, commission: 710.5 },
      parAnnee: [{ annee: 2025, nb: 2, ca: 1421, commission: 710.5 }], parMois: [{ mois: '2025-03', nb: 1, ca: 421, commission: 210.5 }, { mois: '2025-01', nb: 1, ca: 1000, commission: 500 }] } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {
      4: { nb: 2, ca: 1421, commission: 710.5, collegue: 150.25, autres: [{ sorte: 'anterieure', nb: 1, libelle: 'One shot 50 %' }, { sorte: 'import', nb: 1, libelle: 'location 50 %, conformes à la version du 31/12/2020' }] },
      6: { nb: 0, ca: 0, commission: 0, collegue: 0, autres: [] }, 9: { nb: 0, ca: 0, commission: 0, autres: [] } } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: JOUR, manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const carte = (id: number) => container.querySelector(`[data-apporteur="${id}"]`)!;

describe('🔴 (2) la carte : le bloc « Conditions » à la place de la cascade', () => {
  it('One shot : pastille, taux, « depuis le » ; les dossiers à d’autres conditions ; le collègue et sa rémunération ; plus de cascade', async () => {
    await annuaire();
    const c = carte(4).querySelector('[data-conditions="4"]')!;
    expect(c.querySelector('[data-mode-conditions]')?.textContent).toBe('One shot');
    expect(n(c.querySelector('[data-conditions-texte]')?.textContent)).toBe('location 20 % · gestion 0 % · depuis le 23/10/2026');
    expect([...c.querySelectorAll('[data-autres-conditions]')].map((x) => x.textContent)).toEqual([
      '1 dossier calculé aux conditions antérieures (One shot 50 %)', '1 dossier : montants saisis à l’import (location 50 %, conformes à la version du 31/12/2020)']);
    expect(c.querySelector('[data-conditions-collegue]')?.textContent).toBe('Collègue — Paul Collègue : One shot — location 5 %, gestion 10 % (depuis le 01/01/2021)');
    expect(carte(4).querySelector('[data-cascade]')).toBeNull();
    // La ligne de totaux reste au-dessus, inchangée.
    expect(n(carte(4).querySelector('[data-totaux-ligne="4"]')?.textContent)).toBe('Dossiers2Honoraires HT1 421,00 €Dû HT710,50 €Dû au collègue HT150,25 €');
  });
  it('Récurrent : pastille, taux, durée ; collègue « aucune rémunération » ; un interne : pas de ligne collègue', async () => {
    await annuaire();
    const c = carte(6).querySelector('[data-conditions="6"]')!;
    expect(c.querySelector('[data-mode-conditions]')?.getAttribute('data-mode-conditions')).toBe('recurrent');
    expect(c.querySelector('[data-mode-conditions]')?.textContent).toBe('Récurrent');
    expect(n(c.querySelector('[data-conditions-texte]')?.textContent)).toBe('location 10 % · gestion 20 % · pendant 3 ans · depuis le 01/01/2024');
    expect(c.querySelector('[data-autres-conditions]')).toBeNull();
    expect(c.querySelector('[data-conditions-collegue]')?.textContent).toBe('Collègue — Paul Collègue : aucune rémunération');
    expect(carte(9).querySelector('[data-conditions="9"] [data-conditions-collegue]')).toBeNull();
  });
});

describe('🔴 (3) le Cumul : une ligne par année, fermée ; dépliée, les dossiers décomposés', () => {
  it('« Depuis le début » puis les années — plus aucune ligne par mois ; chaque année fermée par défaut, un clic la déplie et la replie', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    const lignes = [...container.querySelectorAll('[data-cumul-apporteur] tbody tr')].map((r) => n(r.textContent));
    expect(lignes).toEqual(['Depuis le début21 421,00 €1 705,20 €710,50 €710,50 €', '▸Année 202521 421,00 €1 705,20 €710,50 €710,50 €']);
    const b = container.querySelector('[data-deplier-annee="2025"]')!;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-annee-detail]')).toBeNull();
    await clic(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    // Les dossiers de l'année, dans l'ordre chronologique, avec « date — propriétaire / locataire ».
    expect([...container.querySelectorAll('[data-annee-detail="2025"] [data-dossier-detail] .plo-dossier-titre')].map((x) => x.textContent))
      .toEqual(['01/01/2025 — BERNARD Anne / PETIT Marc', '01/03/2025 — COHEN Michel / WALCH Elise']);
    await clic(b);
    expect(container.querySelector('[data-annee-detail]')).toBeNull();
  });
  it('un dossier location seule : aucune ligne gestion, aucun sous-total ; location + gestion : les deux lignes ET le sous-total ; taux et source en petit', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="cumul"]')!);
    await calmer();
    await clic(container.querySelector('[data-deplier-annee="2025"]')!);
    const lignes = (id: number) => [...container.querySelectorAll(`[data-dossier-detail="${id}"] [data-ligne-dossier]`)]
      .map((x) => `${x.getAttribute('data-ligne-dossier')} | ${n([...x.children].map((e) => e.textContent).join(' | '))}`);
    expect(lignes(22)).toEqual([
      'honoraires-tete | Honoraires HT',
      'honoraires-location | Transaction locative | 421,00 €',
      'apporteur-tete | − Dû à l’apporteur (FICTIVE Léa)',
      'apporteur-location | sur la location (50 %)taux utilisé 50 % — montant saisi à l’import | 210,50 €',
      'apporteur-dont | dont 2025 : | 210,50 €',
      'collegue-tete | − Dû au collègue (Paul Collègue)',
      'collegue-location | sur la location (5 %)taux utilisé 5 % — version du 01/01/2021 | 21,05 €',
      'net | = Net agence HT | 189,45 €',
    ]);
    expect(lignes(21)).toEqual([
      'honoraires-tete | Honoraires HT',
      'honoraires-location | Transaction locative | 1 000,00 €',
      'honoraires-gestion | Gestion12 mois × 66,00 € / mois | 792,00 €',
      'honoraires-total | Total honoraires | 1 792,00 €',
      'apporteur-tete | − Dû à l’apporteur (FICTIVE Léa)',
      'apporteur-location | sur la location (50 %)taux utilisé 50 % — version du 31/12/2020 | 500,00 €',
      'apporteur-dont | dont 2025 : | 500,00 €',
      'collegue-tete | − Dû au collègue (Paul Collègue)',
      'collegue-location | sur la location (5 %)taux utilisé 5 % — version du 01/01/2021 | 50,00 €',
      'collegue-gestion | sur la gestion (10 %, one shot 12 mois)taux utilisé 10 % — version du 01/01/2021 | 79,20 €',
      'collegue-total | Total collègue | 129,20 €',
      'net | = Net agence HT | 1 162,80 €',
    ]);
  });
});

describe('🔴 (2c) à l’écran : chaque dossier déplié dit « dont <année> »', () => {
  it('chaque année dépliée : la somme des « dont » affichés = le « Dû à l’apporteur HT » de la ligne de l’année ; un dossier d’avant y est pour son récurrent', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="6"][data-panneau-bouton="cumul"]')!);
    await calmer();
    const centimes = (t: string | null | undefined): number => Math.round(Number(n(t).replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
    for (const an of ['2026', '2025', '2024']) {
      await clic(container.querySelector(`[data-deplier-annee="${an}"]`)!);
      const ligne = container.querySelector(`[data-annee="${an}"] [data-mot="Dû à l’apporteur HT"]`)?.textContent;
      const donts = [...container.querySelectorAll(`[data-annee-detail="${an}"] [data-ligne-dossier="apporteur-dont"]`)];
      expect(donts.length, an).toBeGreaterThan(0);
      expect(donts.every((d) => n(d.children[0].textContent) === `dont ${an} :`)).toBe(true);
      expect(donts.reduce((s, d) => s + centimes(d.children[1].textContent), 0), an).toBe(centimes(ligne));
    }
    // 2026 : aucun dossier signé, mais les récurrents de 2024 et 2025 y sont, annoncés comme tels.
    const d2026 = [...container.querySelectorAll('[data-annee-detail="2026"] [data-dossier-detail]')].map((x) => x.getAttribute('data-dossier-detail'));
    expect(d2026).toEqual(['41', '42']);
    expect(container.querySelector('[data-annee-detail="2026"] [data-dossier-detail="41"] [data-dossier-anterieur]')?.textContent)
      .toBe('Signé en 2024 : seul son dû récurrent de 2026 compte dans cette année.');
  });
});
