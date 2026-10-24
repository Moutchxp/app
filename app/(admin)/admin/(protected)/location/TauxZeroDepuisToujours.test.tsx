// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { effetReglage, totauxApporteurs, type ActiviteCalcul } from '../../../../lib/location/suivi/tableauBord';
import { libelleHistorique, tauxVide, verifierRemuneration, type Apporteur, type BaremeApporteur } from '../../../../lib/location/suivi/suivi';
import { autresConditions, detailDossier } from '../../../../lib/location/suivi/detailDossier';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — « 0 % DEPUIS TOUJOURS » (COHEN Michel, apporteur 12) : 0 % est une valeur valide, un champ vide est refusé ;
 * « Depuis toujours » remplace dans le calcul les montants saisis à l'import (sans les effacer : ils restent dits dans le détail) ; une
 * version datée les laisse ; l'effet annoncé est le vrai ; un refus du serveur s'affiche dans le panneau. Données fictives (les montants
 * de COHEN Michel), routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const n = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const JOUR = '2026-10-24';
const dossier = (id: number, date: string, ca: number, commission: number): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: date, libelleProprietaire: `PROPRIÉTAIRE ${id}`, libelleLocataire: `LOCATAIRE ${id}`, honoProprietaireHt: ca, honoLocataireHt: 0,
  primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 12, apporteurNom: 'Michel Cohen', apporteurTaux: 0.5, commissionSaisie: commission,
  negociateurId: 3, negociateurLibelle: 'Paul Collègue', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur',
});
// Les 8 dossiers de COHEN Michel, repris du fichier (montant saisi à l'import, 50 %) : 7 134,01 € d'honoraires, 3 567,01 € dus.
const DOSSIERS = [
  dossier(222, '2021-04-01', 1050, 525), dossier(235, '2021-05-01', 1235.08, 617.54), dossier(441, '2022-10-01', 1006.92, 503.46), dossier(442, '2022-10-01', 840.25, 420.125),
  dossier(498, '2023-04-01', 1355.76, 677.88), dossier(701, '2025-01-01', 875, 437.5), dossier(723, '2025-03-01', 421, 210.5), dossier(772, '2025-07-01', 350, 175),
];
const V50: BaremeApporteur = { depuis: '2021-01-01', taux: 0.5, mode: 'one_shot', tauxGestion: 0, ordre: 12 };
const V20: BaremeApporteur = { depuis: '2026-10-24', taux: 0.2, mode: 'one_shot', tauxGestion: 0, ordre: 27 };
// La version « 0 % depuis toujours » telle que la base la rend : clé technique an 1, enregistrée le 24/10/2026 (le même jour que la 20 %).
const V0: BaremeApporteur = { depuis: '0001-01-01', taux: 0, mode: 'one_shot', tauxGestion: 0, ordre: 28, toujours: true, toujoursLe: JOUR, saisiPar: 'a.jorel@sansvisavis.com' };
const cohen = (baremes: BaremeApporteur[]): Apporteur => ({ id: 12, nom: 'Michel Cohen', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Cohen', prenom: 'Michel',
  baremes, collegues: [{ depuis: '0001-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }], remunerations: [] });

describe('🔴 le calcul : « Depuis toujours » remplace les montants importés, une version datée les laisse', () => {
  it('avant : 3 567,01 € dus (montants importés) ; après « 0 % depuis toujours » (même jour qu’une autre version) : 0,00 €, 8/8 dossiers', () => {
    expect(totauxApporteurs(DOSSIERS, [cohen([V50, V20])], JOUR)[12].commission).toBeCloseTo(3567.005, 6);
    const ap = [cohen([V50, V20, V0])];
    expect(totauxApporteurs(DOSSIERS, ap, JOUR)[12].commission).toBe(0);
    // Plus aucun dossier « à d'autres conditions » : tous suivent la version d'aujourd'hui.
    expect(autresConditions(DOSSIERS, ap, 12, JOUR)).toEqual([]);
  });
  it('le montant importé n’est pas effacé : le détail du dossier le dit, remplacé depuis toujours, avec la date et l’auteur', () => {
    const d = detailDossier(DOSSIERS[0], [cohen([V50, V20, V0])], JOUR)!;
    expect(d.apporteur.total).toBe(0);
    expect(d.importRemplace).toEqual({ montant: 525, le: JOUR, par: 'a.jorel@sansvisavis.com' });
    expect(d.net).toBe(1050);
    // Sans « depuis toujours » : rien n'est remplacé.
    expect(detailDossier(DOSSIERS[0], [cohen([V50, V20])], JOUR)!.importRemplace).toBeNull();
  });
  it('une version DATÉE à 0 % (sans « Depuis toujours ») : les montants importés antérieurs restent', () => {
    const date: BaremeApporteur = { depuis: '2026-11-01', taux: 0, mode: 'one_shot', tauxGestion: 0, ordre: 29 };
    expect(totauxApporteurs(DOSSIERS, [cohen([V50, V20, date])], JOUR)[12].commission).toBeCloseTo(3567.005, 6);
  });
  it('« Effet de ce réglage » annonce le vrai résultat : 8 sur 8, 3 567,01 € → 0,00 €', () => {
    const e = effetReglage({ dossiers: DOSSIERS, apporteurs: [cohen([V50, V20])], apporteurId: 12, aujourdhui: JOUR,
      bareme: { depuis: JOUR, taux: 0, mode: 'one_shot', tauxGestion: 0, dureeAnnees: null, toujours: true } });
    expect([e.concernes, e.total, e.changes, e.toujours]).toEqual([8, 8, 8, true]);
    expect(e.avantApporteur).toBeCloseTo(3567.005, 6);
    expect(e.apresApporteur).toBe(0);
  });
  it('l’historique date une « depuis toujours » de son enregistrement (jamais de sa clé technique)', () => {
    expect(libelleHistorique(V0, 'One shot — location 0 %, gestion 0 %')).toBe('24/10/2026 : remplacé depuis toujours par One shot — location 0 %, gestion 0 %');
  });
});

describe('🔴 0 % est une valeur ; seul un champ vide est refusé', () => {
  it('tauxVide : « 0 » n’est pas vide ; « », « % », null le sont', () => {
    expect([tauxVide('0'), tauxVide(0), tauxVide('0,0'), tauxVide(''), tauxVide(' % '), tauxVide(null), tauxVide(undefined)]).toEqual([false, false, false, true, true, true, true]);
  });
  it('rémunération du collègue : 0 % / 0 % accepté (one shot et récurrent)', () => {
    expect(verifierRemuneration({ remunere: true, depuis: JOUR, mode: 'one_shot', taux: '0', tauxGestion: '0' }).ok).toBe(true);
    expect(verifierRemuneration({ remunere: true, depuis: JOUR, mode: 'recurrent', taux: '0', tauxGestion: '0', dureeAnnees: 'indeterminee' }).ok).toBe(true);
  });
});

// ── À l'écran : le panneau « Taux » ────────────────────────────────────────────────────────────────────────────────────
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let reponse: { etat: string; motif?: string };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; reponse = { etat: 'ok' };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Arnaud Jorel' }], apporteurs: [cohen([V50, V20])] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json(reponse); }
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: JOUR, dossiers: DOSSIERS } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {} });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: JOUR, manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: Element, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const panneauTaux = async (): Promise<Element> => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
  await clic(container.querySelector('[data-apporteur-bouton="12"][data-panneau-bouton="taux"]')!);
  await calmer();
  return container.querySelector('[data-apporteur="12"] [data-panneau="taux"]')!;
};

describe('🔴 à l’écran : « 0 % depuis toujours »', () => {
  it('l’effet annoncé AVANT d’enregistrer (8 sur 8, 3 567,01 € → 0,00 €), puis l’envoi de 0 et 0 « depuis toujours »', async () => {
    const p = await panneauTaux();
    await saisir(p.querySelector('[data-version-taux]')!, '0');
    await saisir(p.querySelector('[data-version-taux-gestion]')!, '0');
    await clic(p.querySelector('[data-application="version"] [data-application-toujours]')!);
    expect(n(p.querySelector('[data-effet-reglage="apporteur"] [data-effet-ligne]')?.textContent))
      .toBe('Dossiers concernés : 8 sur 8 (depuis toujours — tous les dossiers, passés compris) · Dû à l’apporteur HT : avant 3 567,01 € → après 0,00 €');
    await clic(p.querySelector('[data-enregistrer-version]')!);
    expect(n(p.querySelector('[data-recap-ligne="apporteur"]')?.textContent)).toBe('Dû à l’apporteur HT : 3 567,01 € → 0,00 € (−3 567,01 €)');
    await clic(p.querySelector('[data-recap-confirmer]')!);
    expect(posts).toEqual([{ action: 'bareme-apporteur', apporteurId: 12, bareme: { mode: 'one_shot', taux: '0', tauxGestion: '0', depuis: JOUR, toujours: true } }]);
  });
  it('un champ vide est refusé AVANT tout envoi, motif affiché ; un refus du serveur s’affiche dans le panneau (jamais un échec muet)', async () => {
    const p = await panneauTaux();
    await saisir(p.querySelector('[data-version-taux]')!, '0');
    await saisir(p.querySelector('[data-version-taux-gestion]')!, '');
    expect(p.querySelector('[data-effet-attente]')?.textContent).toBe('Saisissez les deux taux (0 est accepté) : l’effet s’affiche ensuite.');
    await clic(p.querySelector('[data-enregistrer-version]')!);
    expect(p.querySelector('[data-refus-local-version]')?.textContent).toBe('Taux sur la gestion : saisissez un pourcentage (0 est accepté).');
    expect(posts).toEqual([]);
    reponse = { etat: 'refus', motif: 'Motif fictif du serveur.' };
    await saisir(p.querySelector('[data-version-taux-gestion]')!, '0');
    await clic(p.querySelector('[data-enregistrer-version]')!);
    await clic(p.querySelector('[data-recap-confirmer]')!);
    expect(posts).toHaveLength(1);
    const alerte = container.querySelector('[data-apporteur="12"] [data-panneau="taux"] [data-reponse-version] [data-motif-carte="12"]');
    expect(alerte?.textContent).toBe('Motif fictif du serveur.');
    expect(alerte?.getAttribute('role')).toBe('alert');
  });
  it('rémunération du collègue à 0 % / 0 % (panneau Rattachement) : « Enregistrer » n’est plus grisé ; un champ vide le grise', async () => {
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
    await calmer();
    await clic(container.querySelector('[data-onglet="apporteurs"]')!);
    await clic(container.querySelector('[data-apporteur-bouton="12"][data-panneau-bouton="rattachement"]')!);
    const p = container.querySelector('[data-apporteur="12"] [data-panneau="rattachement"]')!;
    await clic(p.querySelector('[data-modifier-remuneration]')!);
    await clic(p.querySelector('[data-reponse="oui"]')!);
    await saisir(p.querySelector('[data-remuneration-taux]')!, '0');
    await saisir(p.querySelector('[data-remuneration-taux-gestion]')!, '');
    await clic(p.querySelector('[data-application="remuneration"] [data-application-toujours]')!);
    expect((p.querySelector('[data-enregistrer-rattachement]') as HTMLButtonElement).disabled).toBe(true);
    await saisir(p.querySelector('[data-remuneration-taux-gestion]')!, '0');
    expect((p.querySelector('[data-enregistrer-rattachement]') as HTMLButtonElement).disabled).toBe(false);
    await clic(p.querySelector('[data-enregistrer-rattachement]')!);
    await clic(p.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'rattachement', apporteurId: 12, rattachement: { sorte: 'remuneration', remuneration: { remunere: true, taux: '0', tauxGestion: '0' } } });
  });
});
