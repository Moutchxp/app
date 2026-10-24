// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { anneesComparables, comparerDeLAdresse, LARGEURS_A, moisCompare, TableauBordSuivi } from './TableauBordSuivi';
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
  window.history.replaceState(null, '', '/');   // l'adresse garde l'année et le mois choisis : chaque épreuve repart d'une adresse nue
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) }) as unknown as Response) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
/** La tuile « Biens en gestion » : la période, les comptes, le solde et son sens (sa couleur). */
const gestion = () => {
  const t = container.querySelector('[data-tuile="gestion"]')!;
  return { periode: t.querySelector('.tdb-gestion-periode')?.textContent, nouveaux: t.querySelector('[data-gestion-nouveaux]')?.textContent,
    sortis: t.querySelector('[data-gestion-sortis]')?.textContent, solde: t.querySelector('[data-gestion-solde]')?.textContent,
    sens: t.querySelector('[data-gestion-solde]')?.getAttribute('data-gestion-solde') };
};
const monter = async (vue: 'mois' | 'annee' = 'annee') => { await act(async () => { root.render(createElement(TableauBordSuivi, { vue })); }); await calmer(); };
const choisir = async (filtre: string, v: string) => {
  const el = container.querySelector(`[data-filtre="${filtre}"]`) as HTMLSelectElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await calmer();
};
const tuile = (k: string) => container.querySelector(`[data-tuile="${k}"]`) as HTMLButtonElement;
const nbsp = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');
/** 🔴 Arno (24/10/2026) — la carte « Le mois » est repliée par défaut : le chevron la déplie. */
const deplierCarteMois = async () => { await act(async () => { (container.querySelector('[data-carte-mois-chevron]') as HTMLButtonElement).click(); }); };
/** 🔴 Arno (24/10/2026) — « Modifier » est dans le panneau déplié : on déplie la ligne (si besoin), puis on clique « Modifier ». */
const modifierLigne = async (cle: string) => {
  if (container.querySelector(`[data-modifier-ligne="${cle}"]`) === null) {
    await act(async () => { (container.querySelector(`[data-deplier-ligne="${cle}"]`) as HTMLButtonElement).click(); });
  }
  await act(async () => { (container.querySelector(`[data-modifier-ligne="${cle}"]`) as HTMLButtonElement).click(); });
};

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
    // Arno (23/10/2026) : nouveaux en vert, sortis en rouge, le solde en gros (vert / rouge / gris).
    expect(gestion()).toEqual({ periode: 'Sept. 2026 :', nouveaux: '+1', sortis: '−0', solde: '+1', sens: 'positif' });
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
    await deplierCarteMois();
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
      expect(gestion()).toEqual({ periode: '2026 (janv. → oct.) :', nouveaux: '+0', sortis: '−0', solde: '0', sens: 'nul' });
      expect(n1('gestion')).toBe('récurrent +0,00 € / −0,00 € par mois');
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
      expect(gestion()).toEqual({ periode: '2026 (janv. → oct.) :', nouveaux: '+1', sortis: '−1', solde: '0', sens: 'nul' });   // novembre : hors période
      expect(n1('gestion')).toBe('récurrent +66,00 € / −40,00 € par mois');
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
    await deplierCarteMois();
    expect(container.querySelector('[data-ligne-a="ca"]')).not.toBeNull();
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
    await modifierLigne('2026-09#3');
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
    await modifierLigne(String(ligne.id));
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

  describe('🔴 Arno (24/10/2026) — carte « Le mois » : repliée par défaut, mois de comparaison au choix', () => {
    const resume = (k: string) => nbsp(container.querySelector(`[data-a-total="${k}"]`)?.textContent);
    const choisirListe = async (q: string, libelle: string) => {
      await act(async () => { (container.querySelector(q) as HTMLButtonElement).click(); });
      const o = [...container.querySelectorAll('[role="option"]')].find((x) => x.textContent?.replace('✓', '').trim() === libelle) as HTMLElement;
      await act(async () => { o.click(); });
      await calmer();
    };
    /** Les en-têtes de colonnes (ligne 1), hors l'intitulé (titre + sélecteurs). */
    const entetes = () => [...container.querySelectorAll('[data-a-entetes] th:not(.tdb-a-intitule)')].map((t) => t.textContent);
    const titre = () => nbsp(container.querySelector('#tdb-a')?.textContent);
    const colonnes = () => [...container.querySelectorAll('[data-section="A"] colgroup col')].map((c) => `${c.className}|${(c as HTMLElement).style.width}`);
    const ouvrirSeptembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };

    it('la période comparée : défaut N−1, choix libre, adresse illisible → défaut', () => {
      expect(moisCompare(2026, 1, null)).toEqual({ annee: 2025, mois: 1, choisi: false });
      expect(moisCompare(2026, 1, '2024-03')).toEqual({ annee: 2024, mois: 3, choisi: true });
      expect(moisCompare(2026, 9, '2026-02')).toEqual({ annee: 2026, mois: 2, choisi: true });   // un autre mois de l'année en cours
      expect(moisCompare(2026, 9, '2026-09')).toEqual({ annee: 2026, mois: 9, choisi: true });   // le mois lui-même : permis
      for (const x of ['2025-13', '2025-00', '2025-1', 'abc', '', '1999-05', '20250-01']) expect(moisCompare(2026, 4, x)).toEqual({ annee: 2025, mois: 4, choisi: false });
      expect(comparerDeLAdresse('?annee=2026&comparer=2024-03')).toBe('2024-03');
      expect(comparerDeLAdresse('?comparer=2024-3')).toBeNull();
      expect(anneesComparables([2026, 2019, 2023], 2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    });

    it('repliée = les 2 premières lignes du tableau (en-têtes, TOTAL CA HT) ; la ligne 2 ou le chevron déplie ; les sélecteurs non', async () => {
      await ouvrirSeptembre();
      const carte = container.querySelector('[data-section="A"]')!;
      expect(carte.getAttribute('data-carte-mois')).toBe('repliee');
      expect(carte.querySelectorAll('table')).toHaveLength(1);
      expect([...carte.querySelectorAll('tbody > tr')].map((r) => r.getAttribute('data-a-entetes') !== null ? 'entetes' : r.getAttribute('data-ligne-a'))).toEqual(['entetes', 'ca']);
      expect(titre()).toBe('Le mois — septembre 2026 comparé à septembre 2025');
      expect(entetes()).toEqual(['Septembre 2026', 'Septembre 2025', 'Écart']);
      expect(nbsp(carte.querySelector('[data-ligne-a="ca"] th')?.textContent)).toBe('TOTAL CA HT');
      expect(resume('courant')).toBe('15 471,70 €');
      expect(container.querySelector('[data-a-ecart]')?.className).toMatch(/tdb-signe--(positif|negatif|nul)/);
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toMatch(/^[+−][\d ]+,\d\d € · /);
      // Le chevron couvre les deux lignes.
      expect(container.querySelector('[data-carte-mois-chevron]')?.closest('td')?.getAttribute('rowspan')).toBe('2');
      // Un clic sur un sélecteur ne déplie pas.
      await act(async () => { (container.querySelector('[data-comparer-mois]') as HTMLButtonElement).click(); });
      expect(carte.getAttribute('data-carte-mois')).toBe('repliee');
      await act(async () => { (container.querySelector('[data-comparer-mois]') as HTMLButtonElement).click(); });
      // La ligne 2 (hors montant cliquable) déplie, le chevron replie.
      await act(async () => { (carte.querySelector('[data-ligne-a="ca"] th') as HTMLElement).click(); });
      expect(carte.getAttribute('data-carte-mois')).toBe('ouverte');
      expect(carte.querySelectorAll('[data-ligne-a]').length).toBe(11);
      expect(carte.querySelectorAll('[data-a-entetes]')).toHaveLength(1);   // les en-têtes ne se répètent pas
      expect(container.querySelector('[data-carte-mois-chevron]')?.getAttribute('aria-expanded')).toBe('true');
      await deplierCarteMois();
      expect(carte.querySelectorAll('[data-ligne-a]').length).toBe(1);
    });

    it('🔴 une seule grille : mêmes colonnes repliée et dépliée, largeurs fixes indépendantes des données (janvier = septembre)', async () => {
      await monter('mois');
      await act(async () => { (container.querySelector('[data-onglet-mois="1"]') as HTMLButtonElement).click(); });
      const janvier = colonnes();
      expect(janvier).toEqual(['tdb-a-col-indicateur|', `|${LARGEURS_A.montant}px`, `|${LARGEURS_A.montant}px`, `|${LARGEURS_A.ecart}px`, `|${LARGEURS_A.chevron}px`]);
      await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
      expect(colonnes()).toEqual(janvier);
      await deplierCarteMois();
      expect(colonnes()).toEqual(janvier);
      // Chaque ligne (en-têtes comprises) a le même nombre de colonnes que la grille (le chevron couvre les deux premières).
      const lignesA = [...container.querySelectorAll('[data-section="A"] tbody > tr')];
      const largeur = (r: Element) => [...r.children].reduce((t, c) => t + Number(c.getAttribute('colspan') ?? 1), 0);
      expect(largeur(lignesA[0])).toBe(5);
      expect(lignesA.slice(2).every((r) => largeur(r) === 4)).toBe(true);
      expect(largeur(lignesA[1])).toBe(4);
      // La largeur fixe est posée par la feuille de style (table-layout fixed), pas par le contenu.
      expect(container.querySelector('style')?.textContent).toContain('.tdb-a-table{table-layout:fixed}');
      expect(container.querySelector('style')?.textContent).toMatch(/\.tdb-a-choix>\.lch:first-child\{width:\d+px\}/);
    });

    it('choisir un autre mois de l’année : la ligne, le titre, les en-têtes et l’adresse suivent', async () => {
      await ouvrirSeptembre();
      await choisirListe('[data-comparer-annee]', '2026');
      await choisirListe('[data-comparer-mois]', 'août');
      expect(new URLSearchParams(window.location.search).get('comparer')).toBe('2026-08');
      expect(titre()).toBe('Le mois — septembre 2026 comparé à août 2026');
      expect(entetes()).toEqual(['Septembre 2026', 'Août 2026', 'Écart']);
      expect(resume('compare')).toBe('13 471,10 €');
      expect(container.querySelector('[data-a-ecart]')?.getAttribute('data-a-ecart')).toBe('positif');
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toBe('+2 000,60 € · +14,9 %');
      await deplierCarteMois();
      expect(entetes()).toEqual(['Septembre 2026', 'Août 2026', 'Écart']);
      // Le choix survit au changement d'onglet de mois (absolu, porté par l'adresse).
      await act(async () => { (container.querySelector('[data-onglet-mois="3"]') as HTMLButtonElement).click(); });
      expect(entetes()).toEqual(['Mars 2026', 'Août 2026', 'Écart']);
    });

    it('un mois futur sans données : 0, rien ne casse ; une adresse illisible revient au défaut', async () => {
      window.history.replaceState(null, '', '/?comparer=2026-12');
      await ouvrirSeptembre();
      expect(resume('compare')).toBe('0,00 €');
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toBe('+15 471,70 € · —');
      await deplierCarteMois();
      expect(container.querySelector('[data-ligne-a="nb"] td:nth-of-type(3)')?.textContent).toBe('—');
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?comparer=2026-99');
      await ouvrirSeptembre();
      expect(titre()).toBe('Le mois — septembre 2026 comparé à septembre 2025');
      expect(new URLSearchParams(window.location.search).get('comparer')).toBeNull();
    });

    it('une année hors des deux lues (mars 2024) : ses lignes se lisent à part, « — » si elle n’a pas de données', async () => {
      const appels: string[] = [];
      global.fetch = vi.fn(async (u: unknown) => {
        appels.push(String(u));
        const data = String(u).includes('annee=2024') ? { ...donnees, annee: 2024, activites: [] } : donnees;
        return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) } as unknown as Response;
      }) as unknown as typeof fetch;
      window.history.replaceState(null, '', '/?annee=2026&mois=1&comparer=2024-03');
      await monter('mois');
      await calmer();
      expect(appels.some((u) => u.includes('vue=tableau&annee=2024'))).toBe(true);
      expect(titre()).toBe('Le mois — janvier 2026 comparé à mars 2024');
      expect(resume('compare')).toBe('—');
      expect(container.querySelector('[data-a-ecart]')?.getAttribute('data-a-ecart')).toBe('nul');
      await deplierCarteMois();
      expect(entetes()).toEqual(['Janvier 2026', 'Mars 2024', 'Écart']);
    });

    it('🔴 aucune erreur React sur la page (le « 1 Issue » de Next : un <col> directement dans <table>)', async () => {
      const erreurs: string[] = [];
      const avant = console.error;
      console.error = (...a: unknown[]) => { erreurs.push(a.map(String).join(' ')); };
      try {
        donnees = { ...donnees, annuaire: true };
        await monter('mois');
        await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
        await deplierCarteMois();
        await act(async () => { (container.querySelector('[data-deplier-ligne]') as HTMLButtonElement).click(); });
      } finally { console.error = avant; }
      expect(erreurs).toEqual([]);
    });
  });

  describe('🔴 Arno (24/10/2026) — « Locations du mois » : la ligne synthétique du fichier, dépliable', () => {
    const sept = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09'));
    const ouvrirSeptembre = async () => {
      await monter('mois');
      await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    };
    const ligne = (id: string) => container.querySelector(`[data-ligne-feuille="${id}"]`) as HTMLTableRowElement;
    const deplier = async (id: string) => { await act(async () => { (container.querySelector(`[data-deplier-ligne="${id}"]`) as HTMLButtonElement).click(); }); };

    it('les colonnes de l’Excel, dans l’ordre : Propriétaires (nom | HT), Locataires (nom | HT), Total CA HT, Gestion, Apporteurs, Coms, chevron', async () => {
      await ouvrirSeptembre();
      const tete = [...container.querySelectorAll('[data-bloc="locations"] thead th')];
      expect(tete.map((t) => t.textContent)).toEqual(['Bien', 'Propriétaires', 'Locataires', 'Total CA HT', 'Gestion', 'Apporteurs d’affaires', 'Coms apporteurs d’affaires', 'Détail']);
      expect(tete.slice(1, 3).map((t) => t.getAttribute('colspan'))).toEqual(['2', '2']);
      const a = sept[0];
      const cases = [...ligne(String(a.id)).children].map((c) => c.getAttribute('data-mot'));
      expect(cases).toEqual(['Bien', 'Propriétaires', 'Hono. propriétaire HT', 'Locataires', 'Hono. locataire HT', 'Total CA HT', 'Gestion', 'Apporteurs d’affaires', 'Coms apporteurs d’affaires', null]);
      // Aucune des anciennes colonnes ne reste sur la ligne : elles sont dans le panneau.
      expect(ligne(String(a.id)).querySelector('[data-modifier-ligne]')).toBeNull();
      expect(container.querySelector('[data-detail-ligne]')).toBeNull();
    });

    it('montants « 1 234,56 € » à droite ; honoraires nuls « 0,00 € » ; Gestion et Coms vides à 0', async () => {
      await ouvrirSeptembre();
      for (const a of sept) {
        const c = (mot: string) => ligne(String(a.id)).querySelector(`[data-mot="${mot}"]`) as HTMLElement;
        expect(nbsp(c('Hono. propriétaire HT').textContent)).toMatch(/^\d{1,3}( \d{3})*,\d{2} €$/);
        expect(nbsp(c('Hono. locataire HT').textContent)).toMatch(/^\d{1,3}( \d{3})*,\d{2} €$/);
        expect(c('Total CA HT').classList.contains('fdm-montant')).toBe(true);
        if (a.honoLocataireHt === 0) expect(nbsp(c('Hono. locataire HT').textContent)).toBe('0,00 €');
        const prime = a.primeSaisie ?? 0;
        expect(nbsp(c('Gestion').textContent)).toBe(prime === 0 ? '' : `${prime.toLocaleString('fr-FR', { minimumFractionDigits: 2 }).replace(/[  ]/g, ' ')} €`);
        if ((a.commissionSaisie ?? 0) === 0 && a.apporteurTaux === null) expect(c('Coms apporteurs d’affaires').textContent).toBe('');
      }
    });

    it('la colonne « Apporteurs d’affaires » reprend la colonne G du fichier', async () => {
      await ouvrirSeptembre();
      for (const a of sept) {
        const attendu = a.apporteurNom ?? (a.origineContact === 'collegue' ? a.collegueLibelle : a.origineContact === 'internet' ? 'Internet' : null) ?? '';
        expect(ligne(String(a.id)).querySelector('[data-mot="Apporteurs d’affaires"]')?.textContent).toBe(attendu);
      }
    });

    it('le chevron, un clic sur la ligne : déplier / replier ; plusieurs lignes à la fois ; le nom du bien n’est pas un clic de dépliage', async () => {
      donnees = { ...donnees, annuaire: true };
      await ouvrirSeptembre();
      const [x, y] = [String(sept[0].id), String(sept[1].id)];
      await deplier(x);
      expect(container.querySelector(`[data-detail-ligne="${x}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-deplier-ligne="${x}"]`)?.getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector(`[data-deplier-ligne="${x}"]`)?.textContent).toBe('▾');
      await act(async () => { (ligne(y).querySelector('[data-mot="Locataires"]') as HTMLElement).click(); });
      expect([...container.querySelectorAll('[data-detail-ligne]')].map((e) => e.getAttribute('data-detail-ligne'))).toEqual([x, y]);
      await deplier(x);
      expect(container.querySelector(`[data-detail-ligne="${x}"]`)).toBeNull();
      expect(container.querySelector(`[data-deplier-ligne="${x}"]`)?.textContent).toBe('▸');
      expect(container.querySelector(`[data-detail-ligne="${y}"]`)).not.toBeNull();
    });

    it('🔴 rien ne disparaît : le panneau porte tout ce qui a quitté la ligne, et « Modifier »', async () => {
      donnees = { ...donnees, annuaire: true };
      await ouvrirSeptembre();
      const x = String(sept[0].id);
      await deplier(x);
      const p = container.querySelector(`[data-detail-ligne="${x}"]`)!;
      expect([...p.querySelectorAll('[data-champ]')].map((e) => e.getAttribute('data-champ'))).toEqual([
        'Nature du bien', 'Date de signature', 'Nature', 'Type de bien', 'Gestion', 'Origine du contact', 'Apporteur', 'Collègue', 'Hono. d’apporteur',
        'Prime de gestion', 'Choix de prime', 'Négociateur', 'Client']);
      expect(p.querySelector('[data-champ="Négociateur"]')?.textContent).toBe('Jean-Baptiste PONS');
      expect(p.querySelector('[data-champ="Date de signature"]')?.textContent).toBe('01/09/2026 (supposée : le 1er du mois)');
      expect(p.querySelector('[data-modifier-ligne]')?.textContent).toBe('Modifier');
      await act(async () => { (p.querySelector('[data-modifier-ligne]') as HTMLButtonElement).click(); });
      expect(container.querySelector(`[data-detail-ligne="${x}"] [data-edition-ligne="${x}"]`)).not.toBeNull();
      // Replier la ligne abandonne la saisie (comme « Fermer ») ; la déplier à nouveau ne la rouvre pas.
      await deplier(x);
      await deplier(x);
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
    });

    it('🔴 la pastille « BIEN » en tête de ligne, la légende avec ses comptes, la raison dans le panneau', async () => {
      const ids = sept.map((a) => String(a.id));
      donnees = { ...donnees, activites: donnees.activites.map((a) => {
        const i = ids.indexOf(String(a.id));
        if (i === 0) return { ...a, origineContact: 'relocation', avecGestion: true, mandatGestion: false };
        if (i === 1) return { ...a, origineContact: 'proprietaire_deja_client', avecGestion: false, mandatGestion: false };
        if (i === 2) return { ...a, origineContact: 'proprietaire_deja_client', avecGestion: false, mandatGestion: true };
        if (i === 3) return { ...a, origineContact: 'internet', avecGestion: false, mandatGestion: false };
        if (i >= 4) return { ...a, origineContact: null };
        return a;
      }) };
      await ouvrirSeptembre();
      const pastille = (id: string) => ligne(id).querySelector('[data-mot="Bien"]');
      expect(pastille(ids[0])?.getAttribute('data-nature-bien')).toBe('relocation');
      expect(pastille(ids[0])?.textContent).toBe('Relocation gestion');
      expect(pastille(ids[1])?.textContent).toBe('Client hors gestion');
      expect(pastille(ids[2])?.textContent).toBe('Nouveau · gestion');
      expect(pastille(ids[3])?.textContent).toBe('Nouveau · sans gestion');
      expect(pastille(ids[4])?.textContent).toBe('à qualifier');
      expect(pastille(ids[4])?.querySelector('.fdm-nature--a_qualifier')).not.toBeNull();
      // La légende : chaque pastille et son compte, sur la ligne au-dessus du tableau.
      const legende = [...container.querySelectorAll('[data-legende-nature-item]')].map((e) => [e.getAttribute('data-legende-nature-item'), e.querySelector('.fdm-legende-nb')?.textContent]);
      expect(legende).toEqual([['relocation', '1'], ['client_hors_gestion', '1'], ['nouveau_gestion', '1'], ['nouveau_sans_gestion', '1'], ['a_qualifier', String(sept.length - 4)]]);
      // Les pastilles « historique » / « à vérifier » restent à côté du nom.
      expect(ligne(ids[0]).querySelector('th[data-mot="Propriétaires"] .loc-pastille')?.textContent).toBe('historique');
      await deplier(ids[1]);
      expect(nbsp(container.querySelector(`[data-detail-ligne="${ids[1]}"] [data-champ="Nature du bien"]`)?.textContent))
        .toBe('Client hors gestion — propriétaire déjà client, bien sans gestion');
    });

    it('après « Enregistrer » : la feuille se relit (ligne et bas de feuille), le panneau reste ouvert', async () => {
      donnees = { ...donnees, annuaire: true };
      let lectures = 0;
      global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response;
        lectures += 1;
        return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
      }) as unknown as typeof fetch;
      await ouvrirSeptembre();
      const x = String(sept.find((a) => a.origineContact !== null)!.id);
      await modifierLigne(x);
      const avant = lectures;
      await act(async () => { (container.querySelector('[data-edition-enregistrer]') as HTMLButtonElement).click(); });
      await calmer();
      expect(lectures).toBeGreaterThan(avant);
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(container.querySelector(`[data-detail-ligne="${x}"]`)).not.toBeNull();
      expect(container.querySelector('[data-total="ca"]')).not.toBeNull();
    });
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
      await modifierLigne(cle);
      expect(container.querySelector(`[data-edition-ligne="${cle}"]`)).not.toBeNull();
    };
    const prime = async (v: string) => {
      const el = container.querySelector('[data-edition-prime]') as HTMLSelectElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    const cellule = (mot: string) => container.querySelector(`[data-detail-ligne="${id}"] [data-champ="${mot}"]`)?.textContent;

    it('ouvrir puis « Fermer » sans rien toucher (ligne « à renseigner ») : la ligne se ferme, rien n’est écrit', async () => {
      await ouvrirLigne();
      expect(cellule('Origine du contact')).toBe('à renseigner');
      await act(async () => { (container.querySelector('[data-edition-fermer]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(posts).toEqual([]);
      expect(cellule('Origine du contact')).toBe('à renseigner');
      // Le bouton de tête de ligne (« Fermer ») referme de même.
      await modifierLigne(id);
      await modifierLigne(id);
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
      await modifierLigne(id);
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
      await modifierLigne(String(autre.id));
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
      await modifierLigne(String(ligne.id));
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
    // Au survol, le BLOC DE DÉTAIL (plus de bulle flottante — accord d'Arno, 23/10/2026) : l'année (rouge), l'année d'avant (gris), l'écart.
    await act(async () => { container.querySelector('[data-barre-annee="2025"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(container.querySelector('[data-bulle="survol"]')).toBeNull();
    const bulle = container.querySelector('[data-histo-detail] [data-bulle="sous"]')!;
    expect(bulle.querySelector('.tdb-bulle-titre')?.textContent).toBe('Année 2025');
    expect(nbsp(bulle.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2025CA HT126 660,04 €Baux130');
    expect(nbsp(bulle.querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2024CA HT95 124,22 €Baux100');
    expect(nbsp(bulle.querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+31 535,82 € (+33,2 %)');
    await act(async () => { container.querySelector('[data-barre-annee="2024"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(container.querySelector('[data-histo-detail] [data-bulle-pied]')?.textContent).toBe('N−1 non importée');
    // Les couleurs : le bloc de l'année en ROUGE (celui de la barre), N−1 en GRIS (celui des hachures), le pied neutre.
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.tdb-bulle-bloc--courant{color:var(--color-svv-red)}');
    expect(css).toContain('.tdb-bulle-bloc--n1{color:var(--color-svv-muted)}');
    expect(css).toContain('.tdb-barre-n1-trait{stroke:var(--color-svv-muted)');
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
      // Au survol : le bloc de détail — l'en-tête, 2026 (rouge) EN HAUT, 2025 (gris) dessous, l'écart en pied ; aucune bulle flottante.
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(container.querySelector('[data-bulle="survol"]')).toBeNull();
      const bulle = container.querySelector('[data-histo-detail] [data-bulle="sous"]')!;
      expect(bulle.querySelector('.tdb-bulle-titre')?.textContent).toBe('Septembre');
      expect([...bulle.querySelectorAll('[data-bulle-bloc]')].map((b) => b.getAttribute('data-bulle-bloc'))).toEqual(['courant', 'n1']);
      expect(bulle.querySelector('[data-bulle-bloc="courant"]')?.className).toContain('tdb-bulle-bloc--courant');
      expect(bulle.querySelector('[data-bulle-bloc="n1"]')?.className).toContain('tdb-bulle-bloc--n1');
      expect(nbsp(bulle.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026CA HT15 471,70 €Baux17');
      expect(nbsp(bulle.querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2025CA HT2 000,00 €Baux1');
      expect(nbsp(bulle.querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+13 471,70 € (+673,6 %)');
      await act(async () => { container.querySelector('.tdb-histo-zone')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); });
      expect(container.querySelector('[data-bulle="survol"]')).toBeNull();
      // Le détail sous le graphique : la même bulle, pour le mois de l'onglet (octobre, en cours : 0).
      const sous = h.querySelector('[data-histo-detail] [data-bulle="sous"]')!;
      expect(sous.querySelector('.tdb-bulle-titre')?.textContent).toBe('Octobre');
      expect(nbsp(sous.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026CA HT0,00 €Baux0');
    });

    it('Arno (23/10/2026) : le détail est À DROITE du graphique, dans la même carte ; il montre le mois choisi et suit la barre survolée', async () => {
      await monter('mois');
      const rangee = container.querySelector('[data-bloc="histogramme-mois"] [data-histo-rangee]')!;
      expect([...rangee.children].map((e) => e.className)).toEqual(['tdb-histo-graphe', 'tdb-histo-detail', 'loc-muet tdb-histo-legende']);
      const titre = () => container.querySelector('[data-histo-detail] .tdb-bulle-titre')?.textContent;
      expect(titre()).toBe('Octobre');
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(titre()).toBe('Septembre');
      expect(container.querySelector('[data-histo-detail] [data-ecart]')?.getAttribute('data-ecart')).toBe('positif');   // +13 471,70 € : vert
      await act(async () => { container.querySelector('.tdb-histo-zone')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); });
      expect(titre()).toBe('Octobre');
    });

    it('un clic sur une barre ouvre l’onglet de ce mois ; le détail s’écrit sous le graphique (lisible au toucher)', async () => {
      await monter('mois');
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(container.querySelector('[data-onglet-mois="9"]')?.getAttribute('aria-selected')).toBe('true');
      expect(container.querySelector('[data-feuille-mois]')?.getAttribute('data-feuille-mois')).toBe('2026-09');
      expect(barre(9).querySelector('.tdb-barre--courante')).not.toBeNull();
      expect(nbsp(container.querySelector('[data-histo-detail] [data-bulle-bloc="courant"]')?.textContent)).toBe('2026CA HT15 471,70 €Baux17');
      expect(container.querySelector('[data-histo-detail] .tdb-bulle-titre')?.textContent).toBe('Septembre');
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
      const sous = container.querySelector('[data-histo-detail] [data-bulle="sous"]')!;
      expect([...sous.querySelectorAll('[data-bulle-bloc]')].map((b) => b.getAttribute('data-bulle-bloc'))).toEqual(['courant']);
      expect(sous.querySelector('[data-bulle-pied]')?.textContent).toBe('N−1 non importée');
      // Un mois à venir : « À venir », pas de montant.
      await act(async () => { barre(12).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(nbsp(container.querySelector('[data-histo-detail] [data-bulle-bloc="courant"]')?.textContent)).toBe('2026À venir');
    });
  });

  describe('🔴 Arno (23/10/2026) — « Mois par mois » : les boutons CA · Baux · Gestion', () => {
    const barre = (m: number) => container.querySelector(`[data-barre-mois="${m}"]`)!;
    const valeur = (m: number) => barre(m).querySelector('[data-valeur]')?.getAttribute('data-valeur') ?? null;
    const presse = () => [...container.querySelectorAll('[data-mesure-bouton]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-mesure-bouton'));
    const axe = () => [...container.querySelectorAll('[data-bloc="histogramme-mois"] svg .tdb-axe')].map((t) => nbsp(t.textContent)).filter((t) => !/^[a-zéû.]+$/i.test(t));
    const cliquer = async (cle: string) => { await act(async () => { (container.querySelector(`[data-mesure-bouton="${cle}"]`) as HTMLButtonElement).click(); }); await calmer(); };

    it('trois boutons exclusifs sur la ligne du titre ; « CA » par défaut : le comportement d’avant, l’adresse ne porte pas de mesure', async () => {
      await monter('mois');
      expect([...container.querySelectorAll('[data-mesure-bouton]')].map((b) => b.textContent)).toEqual(['CA', 'Baux', 'Gestion']);
      expect(presse()).toEqual(['ca']);
      expect(container.querySelector('[data-bloc="histogramme-mois"] .tdb-titre-mesures h3')?.textContent).toBe('Mois par mois — 2026 (CA HT ; un mois s’ouvre d’un clic)');
      expect(Number(valeur(9))).toBeCloseTo(15471.7, 2);
      expect(axe().every((t) => t.endsWith('€'))).toBe(true);
      expect(new URLSearchParams(window.location.search).get('mesure')).toBeNull();
    });

    it('Baux : les baux signés du mois (avenants compris), N−1 hachurée, mois à venir vides ; axe en nombres entiers ; détail en nombre', async () => {
      await monter('mois');
      await cliquer('baux');
      expect(presse()).toEqual(['baux']);
      expect(container.querySelector('[data-bloc="histogramme-mois"] h3')?.textContent).toBe('Mois par mois — 2026 (baux signés ; un mois s’ouvre d’un clic)');
      expect(valeur(9)).toBe('17');
      expect([valeur(11), valeur(12)]).toEqual([null, null]);
      expect(barre(9).querySelector('[data-barre-n1]')).not.toBeNull();
      expect(axe().every((t) => /^\d+$/.test(t))).toBe(true);   // 0, 5, 10… jamais un montant, jamais une décimale
      expect(new URLSearchParams(window.location.search).get('mesure')).toBe('baux');
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      const det = container.querySelector('[data-histo-detail]')!;
      expect(nbsp(det.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026Baux signés17');
      expect(nbsp(det.querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2025Baux signés1');
      expect(nbsp(det.querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+16 (+1 600 %)');
      expect(det.querySelector('[data-ecart]')?.getAttribute('data-ecart')).toBe('positif');
      // Le clic sur une barre ouvre toujours le mois.
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(container.querySelector('[data-onglet-mois="9"]')?.getAttribute('aria-selected')).toBe('true');
      expect(presse()).toEqual(['baux']);
    });

    it('Gestion : les NOUVELLES gestions du mois (une sortie ne se soustrait pas) ; sans transition en N−1 : pas de hachures, « N−1 non importée »', async () => {
      await monter('mois');
      await cliquer('gestion');
      expect(container.querySelector('[data-bloc="histogramme-mois"] h3')?.textContent).toBe('Mois par mois — 2026 (nouvelles gestions ; un mois s’ouvre d’un clic)');
      expect(valeur(9)).toBe('1');                                   // l'entrée du 12/09/2026
      expect(valeur(10)).toBe('0');                                  // la sortie du 01/10/2026 ne compte pas
      expect([valeur(11), valeur(12)]).toEqual([null, null]);
      expect(container.querySelectorAll('[data-barre-n1]')).toHaveLength(0);
      const det = container.querySelector('[data-histo-detail]')!;
      expect(nbsp(det.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026Nouvelles gestions0');
      expect(det.querySelector('[data-bulle-pied]')?.textContent).toBe('N−1 non importée');
      expect(new URLSearchParams(window.location.search).get('mesure')).toBe('gestion');
      await cliquer('ca');
      expect(new URLSearchParams(window.location.search).get('mesure')).toBeNull();
    });

    it('l’adresse (?mesure=gestion) rouvre la mesure choisie ; N−1 de gestion : comptée quand elle existe, l’écart nul en gris', async () => {
      window.history.replaceState(null, '', '/?mesure=gestion');
      donnees = { ...donnees, gestion: { ...donnees.gestion, transitions: [...donnees.gestion.transitions, { lotId: 9, avant: null, apres: 'en_gestion', effetLe: '2025-09-03' }] } } as typeof donnees;
      await monter('mois');
      expect(presse()).toEqual(['gestion']);
      expect(barre(9).querySelector('[data-barre-n1]')).not.toBeNull();
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(nbsp(container.querySelector('[data-histo-detail] [data-bulle-pied]')?.textContent)).toBe('Écart0 (+0 %)');
      expect(container.querySelector('[data-histo-detail] [data-ecart]')?.getAttribute('data-ecart')).toBe('nul');
    });
  });

  describe('🔴 Arno (23/10/2026) — Suivi du mois : le sélecteur d’année au bout de la rangée des mois', () => {
    const selecteur = () => container.querySelector('[data-annee-onglets]') as HTMLButtonElement;
    const filtreAnnee = () => container.querySelector('[data-filtre="annee"]') as HTMLSelectElement;
    const choisirAnnee = async (a: string) => {
      await act(async () => { selecteur().click(); });
      await act(async () => { (container.querySelector(`[data-liste-choix] [data-option="${a}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await calmer();
    };

    it('au bout de la rangée, après « Décembre » ; par défaut l’année EN COURS ; la plus récente en premier', async () => {
      donnees = { ...donnees, annees: [2019, 2020, 2025, 2026] };
      await monter('mois');
      const rangee = container.querySelector('[data-rangee-mois]')!;
      expect([...rangee.children].map((x) => x.hasAttribute('data-onglets-mois') ? 'onglets' : x.hasAttribute('data-selecteur-annee') ? 'annee' : '?')).toEqual(['onglets', 'annee']);
      expect(container.querySelectorAll('[data-onglets-mois] [data-onglet-mois]')).toHaveLength(12);
      expect(selecteur().textContent).toBe('2026');
      expect(selecteur().className).toContain('tdb-onglet');
      await act(async () => { selecteur().click(); });
      expect([...container.querySelectorAll('[data-liste-choix] [role="option"]')].map((o) => o.getAttribute('data-option'))).toEqual(['2026', '2025', '2020', '2019']);
      expect(window.location.search).toBe('?annee=2026&mois=10');
    });

    it('changer l’année recharge la feuille, les tuiles et l’histogramme de cette année, au même mois ; le filtre suit ; l’adresse aussi', async () => {
      await monter('mois');
      await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
      await choisirAnnee('2025');
      expect((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('annee=2025'))).toBe(true);
      expect(container.querySelector('[data-feuille-mois]')?.getAttribute('data-feuille-mois')).toBe('2025-09');
      expect(container.querySelector('[data-onglet-mois="9"]')?.getAttribute('aria-selected')).toBe('true');
      expect(nbsp(container.querySelector('[data-tuile="ca-mois"] .tdb-tuile-valeur')?.textContent)).toBe('2 000,00 €');
      expect(container.querySelector('#tdb-histo')?.textContent).toContain('Mois par mois — 2025');
      expect(filtreAnnee().value).toBe('2025');
      expect(window.location.search).toBe('?annee=2025&mois=9');
      // Une année passée : ses 12 mois actifs, aucun point gris.
      expect(container.querySelectorAll('[data-onglets-mois] .tdb-onglet-vide')).toHaveLength(0);
      // Et l'inverse : le filtre « Année » change le sélecteur.
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(filtreAnnee(), '2026'); filtreAnnee().dispatchEvent(new Event('change', { bubbles: true })); });
      await calmer();
      expect(selecteur().textContent).toBe('2026');
      expect(container.querySelector('[data-feuille-mois]')?.getAttribute('data-feuille-mois')).toBe('2026-09');
      expect(container.querySelectorAll('[data-onglets-mois] .tdb-onglet-vide').length).toBeGreaterThan(0);   // l'année en cours : les mois à venir
    });

    it('l’adresse garde la sélection : ?annee=2025&mois=3 ouvre mars 2025', async () => {
      window.history.replaceState(null, '', '/admin/location/outils/mois?annee=2025&mois=3');
      await monter('mois');
      expect(selecteur().textContent).toBe('2025');
      expect(container.querySelector('[data-onglet-mois="3"]')?.getAttribute('aria-selected')).toBe('true');
      expect(container.querySelector('[data-feuille-mois]')?.getAttribute('data-feuille-mois')).toBe('2025-03');
      expect(filtreAnnee().value).toBe('2025');
    });
  });

  it('sans la migration 406 : le dit', async () => {
    donnees = { ...donnees, disponible: false, activites: [] };
    await monter();
    expect(container.querySelector('[data-tdb-sans-migration]')?.textContent).toContain('migration 406');
  });
});
