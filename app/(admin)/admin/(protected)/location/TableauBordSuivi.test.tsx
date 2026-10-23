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
  it('septembre 2026 : les 4 tuiles — CA du mois (au centime du fichier) face à N−1, baux, cumul, gestion', async () => {
    await monter();
    await choisir('mois', '9');
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('15 471,70 €');
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-n1')?.textContent)).toBe('2 000,00 € en 2025 · +673,6 %');
    expect(tuile('baux-mois').querySelector('.tdb-tuile-valeur')?.textContent).toBe('17');
    expect(nbsp(tuile('ca-cumul').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('94 612,61 €');
    expect(tuile('gestion').querySelector('.tdb-tuile-valeur')?.textContent).toBe('121');
    expect(tuile('gestion').querySelector('.tdb-tuile-n1')?.textContent).toContain('+1 / −0');
  });

  it('un chiffre s’ouvre sur la liste de ses baux ; Échap la ferme', async () => {
    await monter();
    await choisir('mois', '8');
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
    await monter();
    await choisir('mois', '9');
    await choisir('gestion', 'sans');
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-valeur')?.textContent)).toBe('1 158,34 €');
    await choisir('apporteur', 'aucun');
    expect((container.querySelector('[data-export]') as HTMLAnchorElement).getAttribute('href')).toBe('/api/admin/location/suivi/export?annee=2026&apporteur=aucun&gestion=sans');
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

  it('sans la migration 406 : le dit', async () => {
    donnees = { ...donnees, disponible: false, activites: [] };
    await monter();
    expect(container.querySelector('[data-tdb-sans-migration]')?.textContent).toContain('migration 406');
  });
});
