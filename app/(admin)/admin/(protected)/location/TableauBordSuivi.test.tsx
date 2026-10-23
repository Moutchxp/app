// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauBordSuivi } from './TableauBordSuivi';
import { lireClasseur, type ClasseurLu } from '../../../../lib/location/suivi/lectureExcel';
import { activitesDuMois, retrocessionDuMois } from '../../../../lib/location/suivi/repriseExcel';
import type { ActiviteLue, DonneesTableau } from '../../../../lib/location/suivi/tableauBord';

/**
 * 🔴 Arno (22/10/2026) — « Outils de suivi » : le tableau de bord, sur la copie anonymisée de son suivi 2026 (et deux lignes
 * 2025 fabriquées pour N−1). Les vrais composants, route simulée : rien n'est écrit. On éprouve : les 4 tuiles (au centime du
 * fichier), un chiffre qui s'ouvre sur ses baux, les filtres, la section « Négociateurs » réservée au droit, l'export.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const classeur = JSON.parse(readFileSync(path.join(process.cwd(), 'app/lib/location/suivi/__fixtures__/suiviMensuel2026.anonyme.json'), 'utf8')) as ClasseurLu;
const mois = lireClasseur(classeur, 2026);
const lignes2026: ActiviteLue[] = mois.flatMap((m) => activitesDuMois(m, { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux'], negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS' }))
  .map((a) => ({ ...a, lotId: null, bailId: null, source: 'import' }));
const n1 = (id: string, date: string, hp: number, hl: number): ActiviteLue => ({ ...lignes2026[10], id, dateSignature: date, honoProprietaireHt: hp, honoLocataireHt: hl, commissionSaisie: 0, apporteurNom: null, apporteurTaux: null, primeSaisie: 0 });
let donnees: DonneesTableau;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  donnees = {
    disponible: true, annee: 2026, annees: [2025, 2026], aujourdhui: '2026-10-22',
    activites: [...lignes2026, n1('n1-a', '2025-09-10', 1000, 1000), n1('n1-b', '2025-03-01', 500, 500)],
    regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
    apporteurs: [], retrocessions: mois.map((m) => retrocessionDuMois(m, { negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS' })).filter((r) => r !== null).map((r, i) => ({ ...r, id: i + 1 })),
    negociateurs: [{ cle: 'id:5', libelle: 'Jean-Baptiste PONS' }],
    gestion: { disponible: true, stock: 120, transitions: [{ lotId: 7, avant: 'location_seule', apres: 'en_gestion', effetLe: '2026-09-12' }, { lotId: 8, avant: 'en_gestion', apres: 'ancienne_gestion', effetLe: '2026-10-01' }] },
    preavis: { '2026-09': 3 }, voirCommissions: true,
  };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) }) as unknown as Response) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (vue: 'mois' | 'annee' = 'annee') => { await act(async () => { root.render(createElement(TableauBordSuivi, { vue })); }); await calmer(); };
const choisir = async (filtre: string, v: string) => {
  const el = container.querySelector(`[data-filtre="${filtre}"]`) as HTMLSelectElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await calmer();
};
const tuile = (k: string) => container.querySelector(`[data-tuile="${k}"]`) as HTMLButtonElement;
const nbsp = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');

describe('🔴 « Outils de suivi » — le tableau de bord', () => {
  const ongletMois = async (m: number) => { await act(async () => { (container.querySelector(`[data-onglet-mois="${m}"]`) as HTMLButtonElement).click(); }); await calmer(); };

  it('Suivi du mois, septembre 2026 : les 4 tuiles mensuelles — CA du mois (au centime du fichier) face à N−1, baux, cumul, gestion', async () => {
    await monter('mois');
    await ongletMois(9);
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('15 471,70 €');
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-n1')?.textContent)).toBe('2 000,00 € en 2025 · +673,6 %');
    expect(tuile('baux-mois').querySelector('.tdb-tuile-valeur')?.textContent).toBe('17');
    expect(nbsp(tuile('ca-cumul').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('94 612,61 €');
    expect(tuile('gestion').querySelector('.tdb-tuile-valeur')?.textContent).toBe('121');
    expect(tuile('gestion').querySelector('.tdb-tuile-n1')?.textContent).toContain('+1 / −0');
  });

  it('un chiffre s’ouvre sur la liste de ses baux ; Échap la ferme', async () => {
    await monter('mois');
    await ongletMois(8);
    await act(async () => { tuile('ca-mois').click(); });
    const d = container.querySelector('[data-detail]')!;
    expect(d.getAttribute('aria-label')).toBe('CA HT — Août 2026');
    expect(d.querySelectorAll('[data-ligne-detail]')).toHaveLength(14);
    expect(nbsp(d.textContent)).toContain('14 ligne(s) · CA HT 13 471,10 €');
    expect(d.textContent).toContain('historique non rattaché');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(container.querySelector('[data-detail]')).toBeNull();
  });

  it('A : août — la commission brute du négociateur retranche la rétrocession (formule du fichier)', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="8"]') as HTMLButtonElement).click(); });
    expect(nbsp(container.querySelector('[data-ligne-a="commission"] td')?.textContent)).toBe('1 965,93 €');
    expect(nbsp(container.querySelector('[data-ligne-a="retrocessions"] td')?.textContent)).toBe('200,00 €');
    expect(nbsp(container.querySelector('[data-ligne-a="avecGestion"] td')?.textContent)).toBe('13 471,10 €');
  });

  it('filtres : « sans gestion » et « sans apporteur » recalculent tout ; l’export garde les filtres', async () => {
    await monter('mois');
    await ongletMois(9);
    await choisir('gestion', 'sans');
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('1 158,34 €');
    // Le Suivi annuel : l'export garde les filtres.
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('annee');
    await choisir('gestion', 'sans');
    await choisir('apporteur', 'aucun');
    expect((container.querySelector('[data-export]') as HTMLAnchorElement).getAttribute('href')).toBe('/api/admin/location/suivi/export?annee=2026&apporteur=aucun&gestion=sans');
  });

  describe('🔴 Arno (23/10/2026) — Suivi annuel : les 4 tuiles montrent l’ANNÉE, face à N−1 sur la même période', () => {
    const val = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-valeur')?.textContent);
    const n1 = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-n1')?.textContent);
    const mot = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-mot')?.textContent);

    it('année en cours (2026, mois choisi : octobre par défaut) : janv. → oct., N−1 sur janv. → oct. 2025, écart en valeur et en %', async () => {
      await monter('annee');
      expect(container.querySelector('[data-tuile="ca-mois"]')).toBeNull();
      expect(mot('ca-annee')).toBe('CA HT 2026 (janv. → oct.)');
      expect(val('ca-annee')).toBe('94 612,61 €');
      expect(n1('ca-annee')).toBe('janv. → oct. 2025 : 3 000,00 € · +91 612,61 € · +3 053,8 %');
      expect(mot('baux-annee')).toBe('Baux signés en 2026 (janv. → oct.)');
      expect(mot('ca-net-annee')).toBe('CA net d’apporteurs 2026 (janv. → oct.)');
      expect(val('ca-net-annee')).toBe('90 538,16 €');
      expect(val('gestion')).toBe('120');
      expect(n1('gestion')).toBe('2026 (janv. → oct.) : +0 / −0 · récurrent +0,00 € / −0,00 € par mois');
      // Le mois choisi borne la période : à fin mars, seul le CA de janvier à mars compte (n−1 : janv. → mars 2025).
      await choisir('mois', '3');
      expect(mot('ca-annee')).toBe('CA HT 2026 (janv. → mars)');
      expect(val('ca-annee')).toBe('25 305,33 €');
      expect(n1('ca-annee')).toBe('janv. → mars 2025 : 1 000,00 € · +24 305,33 € · +2 430,5 %');
    });

    it('année passée (2025) : l’année complète, face à 2024 entière ; N−1 absente : « 2024 : non importé »', async () => {
      donnees = { ...donnees, annee: 2025, activites: donnees.activites.filter((a) => a.dateSignature.startsWith('2025-')) };
      await monter('annee');
      await choisir('annee', '2025');
      expect(mot('ca-annee')).toBe('CA HT 2025');
      expect(val('ca-annee')).toBe('3 000,00 €');
      expect(n1('ca-annee')).toBe('2024 : non importé');
      expect(n1('baux-annee')).toBe('2024 : non importé');
    });

    it('les filtres s’appliquent aux tuiles ; la gestion de l’année compte nouvelles et perdues avec leurs honoraires', async () => {
      donnees = { ...donnees, gestionLignes: [
        { lotId: 7, libelle: 'A', proprietaire: 'P', effetLe: '2026-03-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 100, base: 'cc', tauxHt: 6 },
        { lotId: 8, libelle: 'B', proprietaire: 'Q', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
        { lotId: 9, libelle: 'C', proprietaire: 'R', effetLe: '2026-11-02', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
      ] };
      await monter('annee');
      expect(n1('gestion')).toBe('2026 (janv. → oct.) : +1 / −1 · récurrent +66,00 € / −40,00 € par mois');   // novembre : hors période
      await choisir('gestion', 'sans');
      expect(val('ca-annee')).not.toBe('94 612,61 €');
      const filtrees = donnees.activites.filter((a) => a.dateSignature.startsWith('2026-') && !a.avecGestion);
      expect(val('ca-annee')).toBe(nbsp(`${filtrees.reduce((t, a) => t + a.honoProprietaireHt + a.honoLocataireHt, 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`));
      expect(n1('ca-annee')).toMatch(/^janv\. → oct\. 2025 : /);
    });
  });

  it('🔒 sans « Voir les commissions » : ni section « Négociateurs », ni primes, ni commission', async () => {
    donnees = { ...donnees, voirCommissions: false, regles: [], retrocessions: [] };
    await monter('mois');
    expect(container.querySelector('[data-ligne-a="commission"]')).toBeNull();
    expect(container.querySelector('[data-total-commission]')).toBeNull();
    expect(container.querySelector('[data-total="retrocessions"]')).toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('annee');
    expect(container.querySelector('[data-section="F"]')).toBeNull();
    expect(container.querySelector('[data-ligne-a="commission"]')).toBeNull();
    expect(container.querySelector('[data-ligne-a="primes"]')).toBeNull();
    expect(container.querySelector('[data-section="C"]')).not.toBeNull();
  });

  it('F : par négociateur et par mois, sur l’année', async () => {
    await monter();
    await act(async () => { (container.querySelector('[data-portee="annee"]') as HTMLButtonElement).click(); });
    const lignes = [...container.querySelectorAll('[data-negociateur-ligne]')].map((l) => l.getAttribute('data-negociateur-ligne'));
    expect(lignes).toHaveLength(9);
    const sept = container.querySelector('[data-negociateur-ligne="Jean-Baptiste PONS|2026-09"] .tdb-fort');
    expect(nbsp(sept?.textContent)).toBe('2 670,42 €');
  });

  it('🔴 les deux briques se partagent les sections : A et la feuille au mois, B à G à l’année — rien ne manque', async () => {
    await monter('mois');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['A']);
    expect(container.querySelector('[data-feuille-mois]')).not.toBeNull();
    expect(container.querySelectorAll('[data-onglet-mois]')).toHaveLength(12);
    expect(container.querySelector('[data-onglet-mois="10"]')?.getAttribute('aria-selected')).toBe('true');   // le mois en cours
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('annee');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['B', 'C', 'D', 'E', 'F', 'G']);
    expect(container.querySelector('[data-onglets-mois]')).toBeNull();
  });

  it('la feuille de septembre : une ligne par bail, le bas de feuille du fichier, au centime', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('[data-ligne-feuille]')).toHaveLength(17);
    const total = (k: string) => nbsp(container.querySelector(`[data-total="${k}"]`)?.textContent);
    expect(total('ca')).toBe('15 471,70 €');
    expect(total('apporteurs')).toBe('2 002,26 €');
    expect(total('ca-net')).toBe('13 469,45 €');
    expect(total('primes')).toBe('650,00 €');
    expect(total('avec')).toBe('14 313,36 €');
    expect(total('sans')).toBe('1 158,34 €');
    expect(nbsp(container.querySelector('[data-total-commission="Jean-Baptiste PONS"]')?.textContent)).toBe('2 670,42 €');
  });

  it('nouvelles gestions, mandats perdus et balance du mois', async () => {
    donnees = { ...donnees, gestionLignes: [
      { lotId: 7, libelle: '1 rue Fictive, Puteaux', proprietaire: 'DUPONT', effetLe: '2026-09-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 100, base: 'cc', tauxHt: 6 },
      { lotId: 8, libelle: '2 rue Fictive, Paris', proprietaire: 'DURAND', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
    ] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    expect(nbsp(container.querySelector('[data-bloc="nouvelles-gestions"] [data-ligne-gestion="7"]')?.textContent)).toContain('66,00 €792,00 €');
    expect(nbsp(container.querySelector('[data-bloc="mandats-perdus"] [data-ligne-gestion="8"]')?.textContent)).toContain('30/09/2026Ancienne gestion40,00 €480,00 €');
    expect(nbsp(container.querySelector('[data-total="balance"]')?.textContent)).toBe('+26,00 € / mois · +312,00 € / an');
  });

  it('une ligne se corrige dans la feuille : origine, apporteur « à rattacher » non choisissable, prime ; la confirmation est celle de la tuile', async () => {
    donnees = { ...donnees, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }],
      apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'partenaire', archive: false, baremes: [], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
        { id: 4, nom: 'Orphelin', type: 'partenaire', archive: false, baremes: [], collegues: [] }] };
    const posts: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector('[data-modifier-ligne="2026-09#3"]') as HTMLButtonElement).click(); });
    const sel = (q: string) => container.querySelector(q) as HTMLSelectElement;
    const choisirSel = async (el: HTMLSelectElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }); };
    await choisirSel(sel('[data-edition-origine]'), 'apporteur');
    expect(([...sel('[data-edition-apporteur]').options]).find((o) => o.value === '4')?.disabled).toBe(true);
    await choisirSel(sel('[data-edition-apporteur]'), '3');
    await choisirSel(sel('[data-edition-prime]'), 'aucune');
    await act(async () => { (container.querySelector('[data-edition-enregistrer]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'modifier-activite', id: '2026-09#3', champs: { origineContact: 'apporteur', apporteurId: 3, primeMode: 'aucune' } });
  });

  it('🔴 Arno (23/10/2026) — les cases de la ligne : « % » et « € » en suffixe ; l’apporteur choisi garde son nom entier, « à rattacher » en badge', async () => {
    donnees = { ...donnees, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }],
      apporteurs: [{ id: 4, nom: 'Frédéric Rousseau', type: 'partenaire', archive: false, baremes: [], collegues: [] }] };
    const ligne = lignes2026.find((a) => a.dateSignature.startsWith('2026-09'))!;
    donnees = { ...donnees, activites: donnees.activites.map((a) => (a === ligne ? { ...a, origineContact: 'apporteur', apporteurId: 4, commissionSaisie: 45.74, apporteurTaux: 0.1 } : a)) };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector(`[data-modifier-ligne="${String(ligne.id)}"]`) as HTMLButtonElement).click(); });
    const taux = container.querySelector('[data-edition-taux]') as HTMLInputElement;
    const hono = container.querySelector('[data-edition-commission]') as HTMLInputElement;
    expect(taux.closest('.fdm-saisie')?.querySelector('.fdm-unite')?.textContent).toBe('%');
    expect(hono.closest('.fdm-saisie')?.querySelector('.fdm-unite')?.textContent).toBe('€');
    expect(hono.value).toBe('45,74');
    expect(hono.disabled || hono.readOnly).toBe(false);   // toujours modifiable
    const sel = container.querySelector('[data-edition-apporteur]') as HTMLSelectElement;
    expect(sel.selectedOptions[0].textContent).toBe('Frédéric Rousseau');
    expect(container.querySelector('[data-edition-apporteur-a-rattacher]')?.textContent).toBe('à rattacher');
    // Aucun champ ne disparaît : origine, apporteur, taux, honoraires, prime, Fermer, Enregistrer.
    for (const q of ['[data-edition-origine]', '[data-edition-apporteur]', '[data-edition-taux]', '[data-edition-commission]', '[data-edition-prime]', '[data-edition-fermer]', '[data-edition-enregistrer]']) {
      expect(container.querySelector(q)).not.toBeNull();
    }
  });

  describe('🔴 Arno (23/10/2026) — la ligne en édition se ferme quand on veut, sans condition', () => {
    const sansOrigine = lignes2026.find((a) => a.dateSignature.startsWith('2026-09') && a.origineContact === null)!;
    const id = String(sansOrigine.id);
    let posts: Record<string, unknown>[];
    const ouvrirLigne = async (cle = id) => {
      donnees = { ...donnees, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }] };
      posts = [];
      global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
        return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
      }) as unknown as typeof fetch;
      await monter('mois');
      await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${cle}"]`) as HTMLButtonElement).click(); });
      expect(container.querySelector(`[data-edition-ligne="${cle}"]`)).not.toBeNull();
    };
    const prime = async (v: string) => {
      const el = container.querySelector('[data-edition-prime]') as HTMLSelectElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    const cellule = (mot: string) => container.querySelector(`[data-ligne-feuille="${id}"] td[data-mot="${mot}"]`)?.textContent;

    it('ouvrir puis « Fermer » sans rien toucher (ligne « à renseigner ») : la ligne se ferme, rien n’est écrit', async () => {
      await ouvrirLigne();
      expect(cellule('Origine du contact')).toBe('à renseigner');
      await act(async () => { (container.querySelector('[data-edition-fermer]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(posts).toEqual([]);
      expect(cellule('Origine du contact')).toBe('à renseigner');
      // Le bouton de tête de ligne (« Fermer ») referme de même.
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${id}"]`) as HTMLButtonElement).click(); });
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${id}"]`) as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(posts).toEqual([]);
    });

    it('ouvrir, modifier la prime, puis « Fermer » : la saisie est abandonnée, l’ancienne valeur revient, rien n’est écrit', async () => {
      await ouvrirLigne();
      const avant = (container.querySelector('[data-edition-prime]') as HTMLSelectElement).value;
      const primeAvant = cellule('Prime de gestion');
      await prime(avant === 'aucune' ? 'regle' : 'aucune');
      await act(async () => { (container.querySelector('[data-edition-fermer]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(cellule('Prime de gestion')).toBe(primeAvant);
      expect(posts).toEqual([]);
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${id}"]`) as HTMLButtonElement).click(); });
      expect((container.querySelector('[data-edition-prime]') as HTMLSelectElement).value).toBe(avant);
    });

    it('Échap : même chose', async () => {
      await ouvrirLigne();
      await prime('aucune');
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(posts).toEqual([]);
    });

    it('« Modifier » sur une autre ligne referme la première, sans rien écrire', async () => {
      await ouvrirLigne();
      const autre = lignes2026.find((a) => a.dateSignature.startsWith('2026-09') && a.id !== sansOrigine.id)!;
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${String(autre.id)}"]`) as HTMLButtonElement).click(); });
      expect([...container.querySelectorAll('[data-edition-ligne]')].map((e) => e.getAttribute('data-edition-ligne'))).toEqual([String(autre.id)]);
      expect(posts).toEqual([]);
    });

    it('« Enregistrer » sans origine : bloqué, message sous le champ, rien d’envoyé, la ligne reste ouverte', async () => {
      await ouvrirLigne();
      expect(container.querySelector('[data-edition-sans-origine]')).toBeNull();   // pas de contrôle à l'ouverture
      await act(async () => { (container.querySelector('[data-edition-enregistrer]') as HTMLButtonElement).click(); });
      await calmer();
      expect(container.querySelector('[data-edition-sans-origine]')?.textContent).toBe('L’origine du contact est obligatoire.');
      expect(container.querySelector('[data-edition-origine]')?.closest('label')?.querySelector('[data-edition-sans-origine]')).not.toBeNull();
      expect(container.querySelector(`[data-edition-ligne="${id}"]`)).not.toBeNull();
      expect(posts).toEqual([]);
      // … et « Fermer » referme quand même, aussitôt.
      await act(async () => { (container.querySelector('[data-edition-fermer]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(posts).toEqual([]);
    });
  });

  describe('🔴 Arno (23/10/2026) — « Hono. d’apporteur » : 2 décimales à l’écran, la valeur exacte en base gardée si on n’y touche pas', () => {
    const ligne = lignes2026.find((a) => a.dateSignature.startsWith('2026-09'))!;
    let posts: Record<string, unknown>[];
    const ouvrirLigne = async () => {
      donnees = { ...donnees, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }],
        apporteurs: [{ id: 4, nom: 'Frédéric Rousseau', type: 'partenaire', archive: false, baremes: [], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] }],
        activites: donnees.activites.map((a) => (a === ligne ? { ...a, origineContact: 'apporteur', apporteurId: 4, commissionSaisie: 64.362, apporteurTaux: 0.1 } : a)) };
      posts = [];
      global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
        return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
      }) as unknown as typeof fetch;
      await monter('mois');
      await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
      await act(async () => { (container.querySelector(`[data-modifier-ligne="${String(ligne.id)}"]`) as HTMLButtonElement).click(); });
    };
    const taper = async (q: string, v: string) => {
      const el = container.querySelector(q) as HTMLInputElement | HTMLSelectElement;
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
    };
    const enregistrer = async () => { await act(async () => { (container.querySelector('[data-edition-enregistrer]') as HTMLButtonElement).click(); }); await calmer(); };
    const champs = () => posts.at(-1)?.champs as Record<string, unknown>;

    it('la case affiche 64,36 (2 décimales), pas 64,362', async () => {
      await ouvrirLigne();
      expect((container.querySelector('[data-edition-commission]') as HTMLInputElement).value).toBe('64,36');
    });

    it('une autre correction (prime, origine) ne réécrit NI le montant NI le taux : « conserverMontants »', async () => {
      await ouvrirLigne();
      await taper('[data-edition-prime]', 'aucune');
      await enregistrer();
      expect(champs()).toMatchObject({ primeMode: 'aucune', conserverMontants: true });
    });

    it('le montant modifié part arrondi au centime', async () => {
      await ouvrirLigne();
      await taper('[data-edition-commission]', '70,125');
      await enregistrer();
      expect(champs()).toMatchObject({ commissionApporteur: '70,13', conserverMontants: false });
    });

    it('le taux modifié : les montants ne sont plus conservés, le montant part au centime', async () => {
      await ouvrirLigne();
      await taper('[data-edition-taux]', '12');
      await enregistrer();
      expect(champs()).toMatchObject({ apporteurTaux: '12', commissionApporteur: '64,36', conserverMontants: false });
    });
  });

  it('🔴 408 (Arno, 23/10/2026) : une gestion perdue du fichier dans « Mandats de gestion perdus », et la note d’un écart avec le fichier', async () => {
    donnees = { ...donnees, gestionLignes: [
      { lotId: null, libelle: 'PROPRIÉTAIRE PERDU 1', proprietaire: 'PROPRIÉTAIRE PERDU 1', effetLe: '2026-09-01', avant: 'en_gestion', apres: 'perdue_fichier',
        loyerHc: 1380, provisions: 0, base: 'cc', tauxHt: 4.5, origine: 'fichier', tauxSource: 'reglage', commentaire: 'Parti ailleurs' },
    ], ecartsFichier: [
      { mois: '2026-09', champ: 'apporteurs', fichier: 86.67, outil: 215, libelle: 'Le total des apporteurs du fichier (=SUM(H2:H9)) sans les lignes 13, 14 : 128,33 € absents du total' },
      { mois: '2026-09', champ: 'commission', fichier: 4365.31, outil: 1448.64, libelle: 'La commission du fichier AJOUTE 2916,67 € hors location' },
    ] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const perte = container.querySelector('[data-bloc="mandats-perdus"] [data-ligne-gestion="fichier"]')!;
    expect(perte.querySelector('a')).toBeNull();   // non rattachée : pas de lien vers un bien
    expect(perte.querySelector('[data-perte-fichier]')?.textContent).toBe('suivi mensuel · non rattaché');
    expect(nbsp(perte.textContent)).toContain('09/2026 (mois)Perdue (suivi mensuel)62,10 € *745,20 €');
    expect(nbsp(container.querySelector('[data-total="balance"]')?.textContent)).toBe('−62,10 € / mois · −745,20 € / an');
    const notes = [...container.querySelectorAll('[data-ecart-fichier]')];
    expect(notes.map((n) => n.getAttribute('data-ecart-fichier'))).toEqual(['apporteurs', 'commission']);
    expect(notes[0].textContent).toContain('Écart avec le fichier, expliqué');
    expect(nbsp(notes[0].getAttribute('title'))).toBe('Honoraires d’apporteurs — fichier : 86,67 € · outil (calcul juste) : 215,00 €');
    // Sans « Voir les commissions » : la note de commission reste, sans ses montants.
    act(() => { root.unmount(); }); root = createRoot(container);
    donnees = { ...donnees, voirCommissions: false };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const sans = container.querySelector('[data-ecart-fichier="commission"]')!;
    expect(sans.getAttribute('title')).toBeNull();
    expect(sans.textContent).not.toContain('4');
  });

  it('apporteurs du mois : par apporteur, et par collègue (les affaires de SES apporteurs, à la date de l’affaire)', async () => {
    const ids = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09') && a.apporteurNom === 'Apporteur A');
    donnees = { ...donnees, activites: donnees.activites.map((a) => (ids.includes(a) ? { ...a, apporteurId: 9 } : a)),
      apporteurs: [{ id: 9, nom: 'Apporteur A', type: 'partenaire', archive: false, baremes: [],
        collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }, { depuis: '2026-10-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }] }] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    expect(nbsp(container.querySelector('[data-apporteur-mois="Apporteur A"]')?.textContent)).toBe(`Apporteur A${ids.length}3 941,03 €394,10 €`);
    expect(nbsp(container.querySelector('[data-collegue-mois="Arnaud Jorel"]')?.textContent)).toBe(`Arnaud Jorel${ids.length}3 941,03 €394,10 €`);
    expect(container.querySelector('[data-collegue-mois="Jean-Baptiste PONS"]')).toBeNull();
  });

  it('🔴 historique (Arno, 23/10/2026) : « Année par année » — une barre et une ligne par année ; un clic ouvre l’année ; la commission réservée au droit', async () => {
    donnees = { ...donnees, annees: [2024, 2025, 2026], historique: [
      { annee: 2024, nbBaux: 100, nb: 107, ca: 95124.22, caNet: 88836.23, apporteurs: 6287.99, commission: 17075.43 },
      { annee: 2025, nbBaux: 130, nb: 139, ca: 126660.04, caNet: 121956.75, apporteurs: 4703.29, commission: 23930.6 },
      { annee: 2026, nbBaux: 105, nb: 112, ca: 94612.61, caNet: 90538.16, apporteurs: 4074.45, commission: 17570.72 },
    ] };
    await monter('annee');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['H', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(container.querySelectorAll('[data-barre-annee]')).toHaveLength(3);
    expect(nbsp(container.querySelector('[data-annee-historique="2025"]')?.textContent)).toBe('2025130126 660,04 €4 703,29 €121 956,75 €23 930,60 €+33,2 %');
    expect(container.querySelector('[data-annee-historique="2026"]')?.className).toBe('tdb-fort');
    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    await act(async () => { container.querySelector('[data-barre-annee="2025"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await calmer();
    expect(String((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.slice(appels).map((c) => c[0]))).toContain('annee=2025');
    // Sans « Voir les commissions » : pas de colonne commission.
    act(() => { root.unmount(); }); root = createRoot(container);
    donnees = { ...donnees, voirCommissions: false, historique: donnees.historique!.map((h) => ({ ...h, commission: null })) };
    await monter('annee');
    expect(container.querySelector('[data-historique-annees] thead')?.textContent).not.toContain('Commission');
  });

  describe('🔴 Arno (23/10/2026) — Suivi du mois : l’histogramme mois par mois', () => {
    const barre = (m: number) => container.querySelector(`[data-barre-mois="${m}"]`)!;
    const valeur = (m: number) => barre(m).querySelector('[data-valeur]')?.getAttribute('data-valeur') ?? null;

    it('12 mois ; le mois de l’onglet en rouge ; N−1 à côté ; les mois à venir sans barre ; un mois passé sans activité à 0', async () => {
      await monter('mois');
      const h = container.querySelector('[data-bloc="histogramme-mois"]')!;
      expect(h.compareDocumentPosition(container.querySelector('[data-section="A"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // avant « Le mois »
      expect(container.querySelectorAll('[data-barre-mois]')).toHaveLength(12);
      expect(barre(10).querySelector('.tdb-barre--courante')).not.toBeNull();   // octobre, le mois en cours
      expect(container.querySelectorAll('.tdb-barre--courante')).toHaveLength(1);
      expect(Number(valeur(9))).toBeCloseTo(15471.7, 2);
      expect(valeur(10)).toBe('0');                                          // passé (en cours), sans activité : 0
      expect([valeur(11), valeur(12)]).toEqual([null, null]);                 // à venir : pas de barre
      expect(container.querySelectorAll('[data-barre-n1]')).toHaveLength(12);
      expect(barre(9).querySelector('[data-barre-n1]')).not.toBeNull();
      expect(nbsp(h.querySelector('figcaption')?.textContent)).toBe(' 2026 ·  2025');
      expect(nbsp(barre(9).querySelector('title')?.textContent)).toBe('Septembre 2026 : 15 471,70 € HT, 17 bail(s) · 2025 : 2 000,00 € HT, 1 bail(s) · écart +13 471,70 € (+673,6 %)');
      expect(nbsp(h.querySelector('[data-histo-detail]')?.textContent)).toContain('Octobre 2026 : 0,00 € HT');
    });

    it('un clic sur une barre ouvre l’onglet de ce mois ; le détail s’écrit sous le graphique (lisible au toucher)', async () => {
      await monter('mois');
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(container.querySelector('[data-onglet-mois="9"]')?.getAttribute('aria-selected')).toBe('true');
      expect(container.querySelector('[data-feuille-mois]')?.getAttribute('data-feuille-mois')).toBe('2026-09');
      expect(barre(9).querySelector('.tdb-barre--courante')).not.toBeNull();
      expect(nbsp(container.querySelector('[data-histo-detail]')?.textContent)).toContain('Septembre 2026 : 15 471,70 € HT');
    });

    it('les filtres s’appliquent ; N−1 absente : pas de barre N−1, pas de légende N−1', async () => {
      await monter('mois');
      await choisir('gestion', 'sans');
      expect(Number(valeur(9))).toBeCloseTo(1158.34, 2);
      act(() => { root.unmount(); }); root = createRoot(container);
      donnees = { ...donnees, activites: donnees.activites.filter((a) => a.dateSignature.startsWith('2026-')) };
      await monter('mois');
      expect(container.querySelectorAll('[data-barre-n1]')).toHaveLength(0);
      expect(nbsp(container.querySelector('[data-bloc="histogramme-mois"] figcaption')?.textContent)).toBe(' 2026');
      expect(nbsp(barre(9).querySelector('title')?.textContent)).toContain('2025 : non importé');
    });
  });

  it('sans la migration 406 : le dit', async () => {
    donnees = { ...donnees, disponible: false, activites: [] };
    await monter();
    expect(container.querySelector('[data-tdb-sans-migration]')?.textContent).toContain('migration 406');
  });
});
