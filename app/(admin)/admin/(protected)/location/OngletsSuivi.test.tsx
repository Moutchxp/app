// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (22/10/2026, migration 406) — la roue « Paramètres Location », onglets « Apporteurs » et « Commissions » : le
 * référentiel et ses taux DATÉS (une nouvelle version, jamais une correction en arrière), la règle du négociateur, les
 * rétrocessions (annulées, jamais supprimées). Les vrais composants, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let suivi: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  suivi = { disponible: true, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }],
    apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }, { depuis: '2026-06-01', taux: 0.12, coutFixeMensuel: 50 }] }],
    regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
    retrocessions: [{ id: 8, negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-08-01', montant: 200, libelle: 'Alex Coms' }] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push({ ...JSON.parse(String(init.body)) as Record<string, unknown>, url: String(url) }); return json({ etat: 'ok' }); }
    if (String(url).includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 7, avenants: 1, ca: 5825.03, commission: 582.5 },
      parAnnee: [{ annee: 2026, nb: 5, avenants: 1, ca: 3941.03, commission: 394.1 }, { annee: 2025, nb: 2, avenants: 0, ca: 1884, commission: 188.4 }],
      parMois: [{ mois: '2026-09', nb: 5, avenants: 1, ca: 3941.03, commission: 394.1 }, { mois: '2025-11', nb: 2, avenants: 0, ca: 1884, commission: 188.4 }] } });
    if (String(url).includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 3: { nb: 9, avenants: 0, ca: 1200, commission: 600 }, 4: { nb: 7, avenants: 1, ca: 5825.03, commission: 582.5 } } });
    if (String(url).includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-22', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
/** 🔴 Arno (24/10/2026) — un des 4 boutons d'une carte (Fiche · Rattachement · Taux · Cumul). */
const bouton = (id: number, p: string) => container.querySelector(`[data-apporteur-bouton="${id}"][data-panneau-bouton="${p}"]`)!;
const ouvrir = async (onglet: string) => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector(`[data-onglet="${onglet}"]`)!);
};

describe('🔴 Paramètres Location — Apporteurs et Commissions', () => {
  it('les cinq onglets ; les trois d’avant sont toujours là', async () => {
    await ouvrir('apporteurs');
    expect([...container.querySelectorAll('[data-onglet]')].map((b) => b.textContent))
      .toEqual(['Destinataires du mail', 'Barèmes d’honoraires', 'Archivage des fins de gestion', 'Apporteurs', 'Commissions']);
  });

  it('Apporteurs : le taux EN VIGUEUR aujourd’hui et l’historique ; « Nouveau taux » crée une version datée', async () => {
    await ouvrir('apporteurs');
    const ligne = container.querySelector('[data-apporteur="3"]')!;
    // 413 — les règles d'avant se lisent « One shot — location X %, gestion 0 % ».
    // 🔴 Arno (24/10/2026) — le coût fixe mensuel n'existe plus : ni affiché (même s'il en reste un en base), ni saisi, ni envoyé.
    // 🔴 Arno (24/10/2026) — carte allégée : la règle en vigueur et l'historique sont au panneau « Taux ».
    expect(ligne.textContent).not.toMatch(/coût fixe|\/mois|Historique/i);
    await clic(bouton(3, 'taux'));
    const taux = ligne.querySelector('[data-panneau="taux"]')!;
    expect(taux.textContent).toContain('One shot — location 12 %, gestion 0 % (depuis le 01/06/2026)');
    expect(taux.textContent).toContain('Historique : 01/01/2026 → One shot — location 10 %, gestion 0 %');
    expect(taux.textContent).not.toMatch(/coût fixe/i);
    await saisir(ligne.querySelector('[data-version-taux]') as HTMLInputElement, '15');
    await saisir(ligne.querySelector('[data-application="version"] [data-application-date]') as HTMLInputElement, '2026-11-01');
    await clic(ligne.querySelector('[data-enregistrer-version]')!);
    expect(posts).toEqual([]);   // le récapitulatif d'abord
    await clic(ligne.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'bareme-apporteur', apporteurId: 3, bareme: { taux: '15', depuis: '2026-11-01' } });
    expect((posts.at(-1)!.bareme as Record<string, unknown>).coutFixe).toBeUndefined();
  });

  it('Arno (24/10/2026, 413) — « Nouveau taux » commence par le choix One shot / Récurrent, puis les deux taux ; la règle se lit en clair', async () => {
    suivi = { ...suivi, apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'agence', archive: false,
      baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1 }] }] };
    await ouvrir('apporteurs');
    const ligne = container.querySelector('[data-apporteur="3"]')!;
    await clic(bouton(3, 'taux'));
    expect(ligne.querySelector('[data-regle-apporteur="3"]')?.textContent).toBe('En vigueur : Récurrent — location 10 %, gestion 10 % / mois, durée indéterminée (depuis le 01/01/2026)');
    const form = ligne.querySelector('[data-nouvelle-version]')!;
    // le formulaire COMMENCE par le choix du mode (pré-rempli avec la règle en vigueur)
    expect(form.firstElementChild?.hasAttribute('data-mode-apporteur')).toBe(true);
    expect(form.querySelector('[data-mode="recurrent"]')?.getAttribute('aria-pressed')).toBe('true');
    expect([...form.querySelectorAll('label > span')].map((x) => x.textContent)).toEqual(['Taux sur la location (%)', 'Taux sur la gestion (%)']);
    // Arno (24/10/2026, 420) — « Applicable à partir du » OU « Depuis toujours ».
    expect(form.querySelector('[data-application="version"] > span')?.textContent).toBe('Applicable à partir du');
    await clic(form.querySelector('[data-mode="one_shot"]')!);
    expect(form.querySelector('[data-mode="one_shot"]')?.getAttribute('aria-pressed')).toBe('true');
    await saisir(form.querySelector('[data-version-taux-gestion]') as HTMLInputElement, '20');
    await saisir(form.querySelector('[data-application="version"] [data-application-date]') as HTMLInputElement, '2026-11-01');
    await clic(ligne.querySelector('[data-enregistrer-version]')!);
    await clic(ligne.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'bareme-apporteur', apporteurId: 3, bareme: { mode: 'one_shot', taux: '10', tauxGestion: '20', depuis: '2026-11-01' } });
  });

  it('Apporteurs : « + Ajouter l’apporteur »', async () => {
    await ouvrir('apporteurs');
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Leboncoin');
    await saisir(container.querySelector('[data-taux-apporteur]') as HTMLInputElement, '0');
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { nom: 'Leboncoin', type: 'partenaire', taux: '0', mode: 'one_shot', tauxGestion: '' } });
  });

  it('Commissions : la règle en vigueur ; une rétrocession s’ajoute, et s’ANNULE (jamais supprimée)', async () => {
    await ouvrir('commissions');
    expect(container.querySelector('[data-regle="2026-01-01"]')?.textContent).toContain('Taux 15 % · prime logement 150,00 € · prime local 150,00 € · prime parking 15,00 €');
    expect(container.querySelector('[data-retrocession="8"]')?.textContent).toContain('Alex Coms — 200,00 €');
    await clic(container.querySelector('[data-annuler-retrocession="8"]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'annuler-retrocession', id: 8 });
    expect(container.querySelector('[data-enregistrer-parametres]')).toBeNull();   // chaque ligne a son bouton
    await clic(container.querySelector('[data-onglet="baremes"]')!);
    expect(container.querySelector('[data-enregistrer-parametres]')).not.toBeNull();   // les autres onglets gardent le leur
  });

  it('Arno (24/10/2026) — « Nouvelle règle » : la prime LOCAL pré-remplie au montant en vigueur (le logement s’il n’y en a pas), envoyée', async () => {
    await ouvrir('commissions');
    await clic(container.querySelector('[data-nouvelle-regle]')!);
    const local = container.querySelector('[data-prime-local]') as HTMLInputElement;
    expect(local.closest('label')?.textContent).toContain('Prime nouvelle gestion — local (€)');
    expect(local.value).toBe('150');
    await clic(container.querySelector('[data-enregistrer-regle]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'regle', regle: { primeLogement: '150', primeLocal: '150', primeParking: '15' } });
  });

  it('sans la migration 406 : le dit, rien à saisir', async () => {
    suivi = { disponible: false };
    await ouvrir('commissions');
    expect(container.querySelector('[data-suivi-sans-migration]')?.textContent).toContain('migration 406');
    expect(container.querySelector('[data-ajouter-retrocession]')).toBeNull();
  });
});

describe('🔴 407 — l’annuaire des apporteurs', () => {
  const avec407 = () => {
    suivi = { ...suivi, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }, { id: 5, libelle: 'Jean-Baptiste PONS' }],
      apporteurs: [
        { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, societe: 'Kin SAS', telephone: '01 02 03 04 05', email: 'kin@exemple.test', baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }],
          collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
        { id: 4, nom: 'Apporteur Repris', type: 'partenaire', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }], collegues: [] },
      ] };
  };
  it('un apporteur sans collègue s’affiche en orange « à rattacher » ; le rattaché montre son collègue', async () => {
    avec407();
    await ouvrir('apporteurs');
    expect(container.querySelector('[data-apporteur="4"]')?.className).toContain('plo-a-rattacher');
    expect(container.querySelector('[data-apporteur="4"] [data-a-rattacher]')?.textContent).toBe('à rattacher');
    expect(container.querySelector('[data-apporteur="3"] [data-collegue-apporteur]')?.textContent).toBe('Arnaud Jorel');
    expect(container.querySelector('[data-alerte-a-rattacher]')?.textContent).toContain('1 apporteur(s) « à rattacher »');
  });
  it('Rattachement (« depuis toujours » proposé d’office au 1er), Fiche (refusée tant que « à rattacher »), Cumul par an et par mois', async () => {
    avec407();
    await ouvrir('apporteurs');
    // 🔴 Arno (24/10/2026) — « à rattacher » : le bouton Rattachement est mis en évidence.
    expect(bouton(4, 'rattachement').className).toContain('plo-bouton-alerte');
    expect(bouton(3, 'rattachement').className).not.toContain('plo-bouton-alerte');
    await clic(bouton(4, 'rattachement'));
    let f = container.querySelector('[data-apporteur="4"] [data-panneau="rattachement"]')!;
    await clic(f.querySelector('[data-rattacher-collegue]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="5"]')!);
    expect((f.querySelector('[data-rattacher-toujours]') as HTMLInputElement).checked).toBe(true);
    expect((f.querySelector('[data-rattacher-depuis]') as HTMLInputElement).disabled).toBe(true);
    expect((f.querySelector('[data-rattacher-depuis]') as HTMLInputElement).value).toBe('');
    // 🔴 Arno (24/10/2026) — UN formulaire : la question sur les honoraires du collègue est obligatoire, puis le récapitulatif.
    const enregistrer = f.querySelector('[data-enregistrer-rattachement]') as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(true);
    await clic(f.querySelector('[data-reponse="non"]')!);
    expect(enregistrer.disabled).toBe(false);
    await clic(enregistrer);
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'rattachement', apporteurId: 4, rattachement: { sorte: 'rattacher', collegueId: 5, depuisToujours: true, remuneration: { remunere: false } } });
    expect((posts.at(-1)!.rattachement as Record<string, unknown>).depuis).toBeUndefined();
    // Décochée : une date d'effet (un rattachement daté, qui prend le relais à sa date). Le formulaire est reparti à vide.
    await clic(f.querySelector('[data-rattacher-collegue]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="5"]')!);
    await clic(f.querySelector('[data-rattacher-toujours]')!);
    await saisir(f.querySelector('[data-rattacher-depuis]') as HTMLInputElement, '2026-11-01');
    await clic(f.querySelector('[data-reponse="non"]')!);
    await clic(f.querySelector('[data-enregistrer-rattachement]')!);
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ rattachement: { collegueId: 5, depuis: '2026-11-01' } });
    // 🔴 419 — tant qu'il n'est pas rattaché (la relecture simulée le laisse « à rattacher »), sa fiche ne s'enregistre pas : refus dit, rien n'est envoyé.
    await clic(bouton(4, 'fiche'));
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="rattachement"]')).toBeNull();   // un seul panneau par carte
    f = container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')!;
    await saisir(f.querySelector('[data-fiche-societe]') as HTMLInputElement, 'Repris SARL');
    const avant = posts.length;
    await clic(f.querySelector('[data-enregistrer-fiche]')!);
    expect(posts.length).toBe(avant);
    expect(f.querySelector('[data-refus-local]')?.textContent).toMatch(/rattachez-le d’abord à un collègue/);
    const n = (t: string | null | undefined) => (t ?? '').replace(/[\u202f\u00a0]/g, ' ');
    await clic(bouton(4, 'cumul'));
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')).toBeNull();
    // Arno (23/10/2026) : « Total depuis le début » en 5 chiffres, au-dessus du cumul.
    const tot = (k: string) => n(container.querySelector(`[data-total-apporteur="${k}"]`)?.textContent);
    expect(tot('dossiers')).toBe('Dossiers7dont 1 avenant');
    expect(tot('ht')).toBe('Honoraires apportés HT5 825,03 €');
    expect(tot('ttc')).toBe('Honoraires apportés TTC6 990,04 €TVA 20 %');
    expect(tot('du')).toBe('Dû à l’apporteur HT582,50 €dont location 582,50 € · dont gestion (one shot) 0,00 € · dont gestion récurrente 0,00 €');
    expect(tot('net')).toBe('Net pour l’agence HT5 242,53 €');
    expect(container.textContent).not.toMatch(/versé/i);
    // Le tableau : la ligne « Depuis le début » en tête, puis les années (🔴 Arno, 24/10/2026 : les lignes par mois retirées, avec son
    // accord ; chaque année est fermée par défaut et se déplie sur ses dossiers).
    const lignes = [...container.querySelectorAll('[data-cumul-apporteur] tbody tr')].map((r) => n(r.textContent));
    expect(lignes[0]).toBe('Depuis le début75 825,03 €6 990,04 €582,50 €—5 242,53 €');   // « — » : aucun collègue rémunéré
    expect(container.querySelector('[data-cumul-ligne="total"]')?.className).toBe('plo-cumul-total');
    expect(lignes.slice(1)).toEqual(['▸Année 202653 941,03 €4 729,24 €394,10 €—3 546,93 €', '▸Année 202521 884,00 €2 260,80 €188,40 €—1 695,60 €']);
    expect([...container.querySelectorAll('[data-cumul-apporteur] thead th')].map((x) => x.textContent))
      .toEqual(['Période', 'Dossiers', 'Honoraires HT', 'Honoraires TTC', 'Dû à l’apporteur HT', 'Dû au collègue HT', 'Net agence HT']);
  });
  it('🔴 Arno (23/10/2026) : la fiche, le nouveau taux et la nouvelle règle se ferment quand on veut (bouton ou Échap), sans rien écrire', async () => {
    avec407();
    const fermee = vi.fn();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: fermee })); });
    await calmer();
    await clic(container.querySelector('[data-onglet="apporteurs"]')!);
    const echap = async (el: Element) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); };
    // La fiche : saisie abandonnée par un second clic sur « Fiche » ; rouverte, elle revient aux valeurs en base.
    await clic(bouton(3, 'fiche'));
    expect(bouton(3, 'fiche').getAttribute('aria-pressed')).toBe('true');
    await saisir(container.querySelector('[data-fiche-societe]') as HTMLInputElement, 'Autre SAS');
    await clic(bouton(3, 'fiche'));
    expect(container.querySelector('[data-panneau]')).toBeNull();
    expect(bouton(3, 'fiche').getAttribute('aria-pressed')).toBe('false');
    await clic(bouton(3, 'fiche'));
    expect((container.querySelector('[data-fiche-societe]') as HTMLInputElement).value).toBe('Kin SAS');
    // Échap dans la fiche : le panneau se ferme, pas la roue.
    await echap(container.querySelector('[data-fiche-societe]')!);
    expect(container.querySelector('[data-panneau]')).toBeNull();
    expect(fermee).not.toHaveBeenCalled();
    // Le taux : Annuler, puis Échap.
    await clic(bouton(3, 'taux'));
    await clic(container.querySelector('[data-annuler-version]')!);
    expect(container.querySelector('[data-nouvelle-version]')).toBeNull();
    await clic(bouton(3, 'taux'));
    await echap(container.querySelector('[data-nouvelle-version] input')!);
    expect(container.querySelector('[data-nouvelle-version]')).toBeNull();
    // La nouvelle règle : Échap.
    await clic(container.querySelector('[data-onglet="commissions"]')!);
    await clic(container.querySelector('[data-nouvelle-regle]')!);
    await echap(container.querySelector('[data-saisie-regle] input')!);
    expect(container.querySelector('[data-saisie-regle]')).toBeNull();
    expect(fermee).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });
  it('🔴 Arno (23/10/2026) : « À rattacher (N) » en tête de liste ne montre que les apporteurs sans collègue', async () => {
    avec407();
    await ouvrir('apporteurs');
    const filtre = container.querySelector('[data-filtre-a-rattacher]') as HTMLButtonElement;
    expect(filtre.textContent).toBe('À rattacher (1)');
    expect(container.querySelectorAll('[data-apporteur]')).toHaveLength(2);
    await clic(filtre);
    expect([...container.querySelectorAll('[data-apporteur]')].map((x) => x.getAttribute('data-apporteur'))).toEqual(['4']);
    expect(filtre.getAttribute('aria-pressed')).toBe('true');
    await clic(filtre);
    expect(container.querySelectorAll('[data-apporteur]')).toHaveLength(2);
  });
  it('la modale s’ouvre directement sur un onglet choisi', async () => {
    avec407();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {}, ongletInitial: 'apporteurs' })); });
    await calmer();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-onglet')).toBe('apporteurs');
  });
  it('🔴 Arno (23/10/2026) : la liste montre dossiers, honoraires HT et dû HT ; tri ALPHABÉTIQUE par nom de famille (24/10/2026), puis au choix', async () => {
    avec407();
    await ouvrir('apporteurs');
    const ordre = () => [...container.querySelectorAll('[data-apporteur]')].map((x) => x.getAttribute('data-apporteur'));
    // 🔴 Arno (24/10/2026) — « Trier par » est la liste verte (ListeChoix) : mêmes options, même tri.
    const tri = container.querySelector('[data-tri]') as HTMLElement;
    expect(tri.getAttribute('role')).toBe('combobox');
    expect(tri.getAttribute('data-valeur')).toBe('nom');
    expect(ordre()).toEqual(['3', '4']);   // « Kin Immo » (une agence : par son nom) avant « REPRIS Apporteur »
    const trier = async (v: string) => {
      await act(async () => { tri.click(); });
      await act(async () => { (tri.closest('.lch')!.querySelector(`li[data-option="${v}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    await act(async () => { tri.click(); });
    expect([...tri.closest('.lch')!.querySelectorAll('li[role="option"]')].map((o) => o.getAttribute('data-option'))).toEqual(['ca', 'commission', 'nb', 'nom']);
    expect([...tri.closest('.lch')!.querySelectorAll('li[role="option"]')].map((o) => o.textContent?.replace('✓', '').trim()))
      .toEqual(['Honoraires HT (décroissant)', 'Dû à l’apporteur HT (décroissant)', 'Dossiers (décroissant)', 'Nom de famille (A → Z)']);
    await act(async () => { tri.click(); });
    await trier('ca');
    expect(ordre()).toEqual(['4', '3']);   // 5 825,03 € avant 1 200 €
    expect(container.querySelector('[data-totaux-ligne="4"]')?.textContent?.replace(/[\u202f\u00a0]/g, ' ')).toBe('Dossiers7Honoraires HT5 825,03 €Dû à l’apporteur HT582,50 €Net agence HT5 242,53 €');
    await trier('nb');
    expect(ordre()).toEqual(['3', '4']);   // 9 dossiers avant 7
    await trier('commission');
    expect(ordre()).toEqual(['3', '4']);   // 600 € dus avant 582,50 €
    await trier('nom');
    expect(ordre()).toEqual(['3', '4']);   // par nom de famille : « Kin Immo » (une agence : par son nom) avant « REPRIS Apporteur »
    await trier('ca');
    // Le filtre « À rattacher » garde le tri et ne change pas.
    await clic(container.querySelector('[data-filtre-a-rattacher]')!);
    expect(ordre()).toEqual(['4']);
  });
  it('🔴 Arno (24/10/2026, 414) — « NOM Prénom » dans la liste ; nom de famille et prénom corrigés dans la fiche', async () => {
    avec407();
    suivi = { ...suivi, nomPrenom: true, apporteurs: [...(suivi.apporteurs as unknown[]),
      { id: 5, nom: 'Marjorie Arthur Immo', type: 'partenaire', archive: false, baremes: [], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
      { id: 6, nom: 'Hélène Beketov', type: 'partenaire', archive: false, baremes: [], collegues: [], nomFamille: 'Beketov', prenom: 'Hélène' }] };
    await ouvrir('apporteurs');
    const noms = () => [...container.querySelectorAll('[data-nom-apporteur-liste]')].map((x) => x.textContent);
    // par nom de famille (une structure par son nom) : Beketov, Immo, Kin Immo (agence), Repris
    expect(noms()).toEqual(['BEKETOV Hélène', 'IMMO Marjorie Arthur', 'Kin Immo', 'REPRIS Apporteur']);
    await clic(bouton(5, 'fiche'));
    const nf = container.querySelector('[data-fiche-nom-famille]') as HTMLInputElement;
    expect(nf.value).toBe('Immo');                                    // la reprise PROPOSE le dernier mot…
    expect((container.querySelector('[data-fiche-prenom]') as HTMLInputElement).value).toBe('Marjorie Arthur');
    await saisir(nf, 'Arthur');                                       // … corrigeable dans la fiche
    await saisir(container.querySelector('[data-fiche-prenom]') as HTMLInputElement, 'Marjorie');
    await clic(container.querySelector('[data-enregistrer-fiche]')!);
    // 🔴 le récapitulatif des SEULS champs modifiés, puis l'envoi (avec la version lue : contrôle de conflit).
    expect([...container.querySelectorAll('[data-recap-fiche] [data-recap-champ]')].map((x) => x.textContent)).toEqual(['Nom de famille : Immo → Arthur', 'Prénom : Marjorie Arthur → Marjorie']);
    await clic(container.querySelector('[data-recap-confirmer]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'fiche-apporteur', apporteurId: 5, fiche: { nomFamille: 'Arthur', prenom: 'Marjorie' }, version: null });
  });

  it('un nouvel apporteur part avec son collègue de rattachement', async () => {
    avec407();
    await ouvrir('apporteurs');
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Nouveau');
    await clic(container.querySelector('[data-collegue-apporteur-nouveau]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="2"]')!);
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { nom: 'Nouveau', collegueId: 2 } });
  });
});
