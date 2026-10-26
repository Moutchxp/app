// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Les fiches ouvertes depuis le panneau (Annuaire, ModifierFicheBien) lisent le routeur de Next : simulé ici.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
import { anneesComparables, comparerDeLAdresse, LARGEURS_A, moisCompare, moisDeLaCourbe, TableauBordSuivi } from './TableauBordSuivi';
import { lireClasseur, type ClasseurLu } from '../../../../lib/location/suivi/lectureExcel';
import { activitesDuMois, retrocessionDuMois } from '../../../../lib/location/suivi/repriseExcel';
import { cumulDepuisJanvier, natureBienLoue, sectionCumul, soldeGestionParMois, suiviDuNegociateur, totauxPeriode, variablesDuNegociateur, type ActiviteLue, type DonneesTableau } from '../../../../lib/location/suivi/tableauBord';

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
/** 🔴 26/10/2026 — « Résultat net de l'agence » est REPLIÉ par défaut : le déplier (chaque bloc encore replié) avant de lire sa cascade. */
const deplierNet = async () => {
  for (const b of [...document.querySelectorAll<HTMLButtonElement>('[data-deplier="resultat-net"][aria-expanded="false"]')]) await act(async () => { b.click(); });
};
/** 🔴 Arno (24/10/2026) — les listes de Location sont des ListeChoix vertes : ouvrir le champ, cliquer l'option. `v` '' : le choix vide. */
const choisirListe = async (el: Element, v: string) => {
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { (el.closest('.lch')!.querySelector(`li[data-option="${v}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const choisir = async (filtre: string, v: string) => {
  await choisirListe(container.querySelector(`[data-filtre="${filtre}"]`)!, v);
  await calmer();
};
const tuile = (k: string) => container.querySelector(`[data-tuile="${k}"]`) as HTMLButtonElement;
const nbsp = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');
/** 🔴 Arno (25/10/2026) — les blocs « Négociateur » sont repliés à chaque chargement : les déplier pour lire la cascade. */
const deplierNegos = async () => {
  for (const b of [...container.querySelectorAll('[data-deplier-negociateur][aria-expanded="false"]')]) await act(async () => { (b as HTMLButtonElement).click(); });
};
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
    expect(nbsp(tuile('ca-mois').querySelector('.tdb-tuile-n1')?.textContent)).toBe('2 000,00 € en 2025 (+673,6 %)');
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
    // Le Suivi annuel : l'export garde les filtres (une adresse nue : la période par défaut).
    act(() => { root.unmount(); }); root = createRoot(container);
    window.history.replaceState(null, '', '/');
    await monter('annee');
    await choisir('gestion', 'sans');
    await choisir('apporteur', 'aucun');
    // 🔴 25/10/2026 — l'export suit la PÉRIODE (Début / Fin ; défaut : Origine → aujourd'hui).
    expect((container.querySelector('[data-export]') as HTMLAnchorElement).getAttribute('href')).toBe('/api/admin/location/suivi/export?debut=2025-01-01&fin=2026-10-22&apporteur=aucun&gestion=sans');
  });

  describe('🔴 Arno (25/10/2026) — Suivi annuel : les 4 tuiles montrent la PÉRIODE « Début / Fin », face à la période précédente (2a)', () => {
    const val = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-valeur')?.textContent);
    const n1 = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-n1')?.textContent);
    const mot = (k: string) => nbsp(tuile(k).querySelector('.tdb-tuile-mot')?.textContent);

    it('défaut Origine → aujourd’hui : toute la période ; pas de période précédente complète : « — »', async () => {
      await monter('annee');
      expect(container.querySelector('[data-tuile="ca-mois"]')).toBeNull();
      expect(mot('ca-annee')).toBe('CA HT (Origine → aujourd’hui (2025 → 22/10/2026))');
      expect(val('ca-annee')).toBe('97 612,61 €');   // 94 612,61 (2026) + 3 000,00 (2025)
      expect(n1('ca-annee')).toBe('Période précédente : —');
      expect(n1('baux-annee')).toBe('Période précédente : —');
      expect(val('gestion')).toBe('120');
      expect(gestion()).toEqual({ periode: 'Origine → aujourd’hui (2025 → 22/10/2026) :', nouveaux: '+0', sortis: '−0', solde: '0', sens: 'nul' });
      expect(n1('gestion')).toBe('récurrent +0,00 € / −0,00 € par mois');
    });

    it('2026 → aujourd’hui : face au 01/01 → 22/10/2025 (mêmes dates, un an plus tôt), écart en valeur et en %', async () => {
      await monter('annee');
      await choisir('debut', '2026');
      expect(mot('ca-annee')).toBe('CA HT (2026 → aujourd’hui (2026 → 22/10/2026))');
      expect(val('ca-annee')).toBe('94 612,61 €');
      expect(n1('ca-annee')).toBe('01/01/2025 → 22/10/2025 : 3 000,00 € · +91 612,61 € (+3 053,8 %)');
      expect(val('ca-net-annee')).toBe('90 538,16 €');
    });

    it('2025 → 2025 : l’année complète ; la période précédente (2024) commence avant la première donnée : « — »', async () => {
      await monter('annee');
      await choisir('fin', '2025');
      await choisir('debut', '2025');
      expect(mot('ca-annee')).toBe('CA HT (2025 → 2025)');
      expect(val('ca-annee')).toBe('3 000,00 €');
      expect(n1('ca-annee')).toBe('Période précédente : —');
    });

    it('🔴 « Début » et « Fin » à la place d’« Année » et « Mois » ; Début > Fin impossible : chaque liste ne propose que des années compatibles', async () => {
      donnees = { ...donnees, annees: [2023, 2024, 2025, 2026] };
      await monter('annee');
      expect(container.querySelector('[data-filtre="annee"]')).toBeNull();
      expect(container.querySelector('[data-filtre="mois"]')).toBeNull();
      const options = async (f: string) => {
        await act(async () => { (container.querySelector(`[data-filtre="${f}"]`) as HTMLElement).click(); });
        const o = [...container.querySelector(`[data-filtre="${f}"]`)!.closest('.lch')!.querySelectorAll('li[data-option]')].map((li) => li.getAttribute('data-option'));
        await act(async () => { (container.querySelector(`[data-filtre="${f}"]`) as HTMLElement).click(); });
        return o;
      };
      expect(await options('debut')).toEqual(['origine', '2023', '2024', '2025', '2026']);
      expect(await options('fin')).toEqual(['aujourdhui', '2023', '2024', '2025', '2026']);
      await choisir('debut', '2025');
      expect(await options('fin')).toEqual(['aujourdhui', '2025', '2026']);
      await choisir('fin', '2025');
      expect(await options('debut')).toEqual(['origine', '2023', '2024', '2025']);
      expect(container.querySelector('[data-periode-libelle]')?.textContent).toBe('Période : 2025 → 2025');
      expect(new URLSearchParams(window.location.search).toString()).toBe('debut=2025&fin=2025');
    });

    it('🔴 une adresse INCOHÉRENTE (début après la fin) : le message, et la période par défaut', async () => {
      window.history.replaceState(null, '', '/?debut=2026&fin=2025');
      await monter('annee');
      expect(container.querySelector('[data-periode-incoherente]')?.textContent).toBe('La période de l’adresse est incohérente (début 2026 après la fin 2025) : la période par défaut est affichée (Origine → aujourd’hui).');
      expect(container.querySelector('[data-periode-libelle]')?.textContent).toBe('Période : Origine → aujourd’hui (2025 → 22/10/2026)');
    });

    it('🔴 une ANCIENNE adresse ?annee=2026&mois=3 : « 2026 → fin mars 2026 », face au 01/01 → 31/03/2025', async () => {
      window.history.replaceState(null, '', '/?annee=2026&mois=3');
      await monter('annee');
      expect(mot('ca-annee')).toBe('CA HT (2026 → fin mars 2026)');
      expect(val('ca-annee')).toBe('25 305,33 €');
      expect(n1('ca-annee')).toBe('01/01/2025 → 31/03/2025 : 1 000,00 € · +24 305,33 € (+2 430,5 %)');
      expect(new URLSearchParams(window.location.search).toString()).toBe('debut=2026&fin=2026-03');
    });

    it('les filtres s’appliquent aux tuiles ; la gestion de la période compte nouvelles et perdues avec leurs honoraires', async () => {
      donnees = { ...donnees, gestionLignes: [
        { lotId: 7, libelle: 'A', proprietaire: 'P', effetLe: '2026-03-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 100, base: 'cc', tauxHt: 6 },
        { lotId: 8, libelle: 'B', proprietaire: 'Q', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
        { lotId: 9, libelle: 'C', proprietaire: 'R', effetLe: '2026-11-02', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
      ] };
      await monter('annee');
      await choisir('debut', '2026');
      expect(gestion()).toEqual({ periode: '2026 → aujourd’hui (2026 → 22/10/2026) :', nouveaux: '+1', sortis: '−1', solde: '0', sens: 'nul' });   // novembre : hors période
      expect(n1('gestion')).toBe('récurrent +66,00 € / −40,00 € par mois');
      await choisir('gestion', 'sans');
      const filtrees = donnees.activites.filter((a) => a.dateSignature.startsWith('2026-') && !a.avecGestion);
      expect(val('ca-annee')).toBe(nbsp(`${filtrees.reduce((t, a) => t + a.honoProprietaireHt + a.honoLocataireHt, 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`));
      expect(n1('ca-annee')).toMatch(/^01\/01\/2025 → 22\/10\/2025 : /);
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

  it('F : par négociateur et par mois, sur la période (accord 1a : plus de boutons de portée)', async () => {
    await monter();
    expect(container.querySelector('[data-portee]')).toBeNull();
    await choisir('debut', '2026');
    await act(async () => { (container.querySelector('[data-deplier="F"]') as HTMLButtonElement).click(); });   // 🔴 25/10/2026 : replié par défaut
    const lignes = [...container.querySelectorAll('[data-negociateur-ligne]')].map((l) => l.getAttribute('data-negociateur-ligne'));
    expect(lignes).toHaveLength(9);
    const sept = container.querySelector('[data-negociateur-ligne="Jean-Baptiste PONS|2026-09"] .tdb-fort');
    expect(nbsp(sept?.textContent)).toBe('2 670,42 €');
  });

  it('🔴 les deux briques se partagent les sections : A et la feuille au mois, H, F, C, E, G à l’année (B et D retirés, accord d’Arno)', async () => {
    await monter('mois');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['A']);
    expect(container.querySelector('[data-feuille-mois]')).not.toBeNull();
    expect(container.querySelectorAll('[data-onglet-mois]')).toHaveLength(12);
    expect(container.querySelector('[data-onglet-mois="10"]')?.getAttribute('aria-selected')).toBe('true');   // le mois en cours
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('annee');
    // 🔴 25/10/2026 — « Année par année » (H) suit la période : il est là dès qu'elle compte une année.
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['H', 'F', 'C', 'E', 'G']);
    expect(container.querySelector('[data-onglets-mois]')).toBeNull();
  });

  it('la feuille de septembre : une ligne par bail, le bas de feuille du fichier, au centime', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('[data-ligne-feuille]')).toHaveLength(17);
    const total = (k: string) => nbsp(container.querySelector(`[data-total="${k}"]`)?.textContent);
    expect(total('ca')).toBe('15 471,70 €');
    // 🔴 25/10/2026 (suite) — les honoraires d'apporteurs VENTILÉS (externes + internes = 2 002,26 €).
    expect([total('apporteurs-externes'), total('apporteurs-internes')]).toEqual(['2 002,26 €', '0,00 €']);
    // 🔴 Arno (25/10/2026) — le CA HT NET retire aussi les collègues (0 ici) : 15 471,70 − 2 002,26 − 0,00 = 13 469,44 au centime affiché ;
    // l'ancien « CA HT − apporteurs » (part location, 13 469,45) reste : c'est la base de calcul du négociateur.
    expect(total('ca-net')).toBe('13 469,44 €');
    // 🔴 25/10/2026 — la base du négociateur = CA HT net de commissions (ici : les seules parts location), au centime des montants affichés.
    await deplierNegos();
    expect(nbsp(container.querySelector('[data-base-negociateur="Jean-Baptiste PONS"]')?.textContent)).toBe('13 469,44 €');
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
    // 🔴 25/10/2026 — le Solde du Portefeuille réparti dans ses colonnes (/ mois, / an).
    expect([nbsp(container.querySelector('[data-total="balance"]')?.textContent), nbsp(container.querySelector('[data-total="balance-an"]')?.textContent)]).toEqual(['+26,00 €', '+312,00 €']);
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
    const sel = (q: string) => container.querySelector(q)!;
    await choisirListe(sel('[data-edition-origine]'), 'apporteur');
    await act(async () => { (sel('[data-edition-apporteur]') as HTMLElement).click(); });
    expect(sel('[data-edition-apporteur]').closest('.lch')!.querySelector('li[data-option="4"]')?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { (sel('[data-edition-apporteur]') as HTMLElement).click(); });
    await choisirListe(sel('[data-edition-apporteur]'), '3');
    await choisirListe(sel('[data-edition-prime]'), 'aucune');
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
    const sel = container.querySelector('[data-edition-apporteur]')!;
    expect(sel.textContent).toBe('Frédéric Rousseau');
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
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toMatch(/^[+−][\d ]+,\d\d € \([+−][\d ]+,\d %\)$/);
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
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toBe('+2 000,60 € (+14,9 %)');
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
      expect(nbsp(container.querySelector('[data-a-ecart]')?.textContent)).toBe('+15 471,70 € (—)');
      await deplierCarteMois();
      // 🔴 25/10/2026 — sans base (comparé à 0) : l'écart en valeur, et « (—) » pour le pourcentage.
      expect(container.querySelector('[data-ligne-a="nb"] td:nth-of-type(3)')?.textContent).toBe('+17 (—)');
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
        // 🔴 26/10/2026 — une prime « Personnalisé » porte sa bulle « prime saisie à la main » : le montant est lu sans elle (il ne change pas).
        expect(nbsp((c('Gestion').querySelector('.fdm-prime-main-montant') ?? c('Gestion')).textContent)).toBe(prime === 0 ? '' : `${prime.toLocaleString('fr-FR', { minimumFractionDigits: 2 }).replace(/[  ]/g, ' ')} €`);
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
        // 🔴 Arno (25/10/2026, 424) — « Nature du bien » devient « Statut du bien » : même place, même ordre (seul le nom change).
        'Statut du bien', 'Date de signature', 'Nature', 'Type de bien', 'Gestion', 'Origine du contact', 'Apporteur', 'Collègue', 'Hono. d’apporteur',
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
      // 🔴 Arno (25/10/2026) — les nouveaux libellés (valeurs internes inchangées).
      expect(pastille(ids[1])?.textContent).toBe('Relocation sans gestion');
      expect(pastille(ids[2])?.textContent).toBe('Nouvelle gestion');
      expect(pastille(ids[3])?.textContent).toBe('Nouveau sans gestion');
      expect(pastille(ids[4])?.textContent).toBe('À qualifier');
      expect(pastille(ids[4])?.querySelector('.fdm-nature--a_qualifier')).not.toBeNull();
      // La légende : chaque pastille et son compte, sur la ligne au-dessus du tableau.
      const legende = [...container.querySelectorAll('[data-legende-nature-item]')].map((e) => [e.getAttribute('data-legende-nature-item'), e.querySelector('.fdm-legende-nb')?.textContent]);
      // 🔴 Arno (25/10/2026) — le nouvel ordre : Nouvelle gestion, Relocation gestion, Nouveau sans gestion, Relocation sans gestion, À qualifier.
      expect(legende).toEqual([['nouveau_gestion', '1'], ['relocation', '1'], ['nouveau_sans_gestion', '1'], ['client_hors_gestion', '1'], ['a_qualifier', String(sept.length - 4)]]);
      expect([...container.querySelectorAll('[data-legende-nature-item] .fdm-nature')].map((e) => e.textContent))
        .toEqual(['Nouvelle gestion', 'Relocation gestion', 'Nouveau sans gestion', 'Relocation sans gestion', 'À qualifier']);
      // Les pastilles « historique » / « à vérifier » restent à côté du nom.
      expect(ligne(ids[0]).querySelector('th[data-mot="Propriétaires"] .loc-pastille')?.textContent).toBe('historique');
      await deplier(ids[1]);
      expect(nbsp(container.querySelector(`[data-detail-ligne="${ids[1]}"] [data-champ="Statut du bien"]`)?.textContent))
        .toBe('Relocation sans gestion — propriétaire déjà client, bien sans gestion');
    });

    it('🔴 les fiches complètes : un bouton par locataire et par bien ; « non rattaché » sinon ; chacun ouvre sa grande modale', async () => {
      const ids = sept.map((a) => String(a.id));
      donnees = { ...donnees, annuaire: true, activites: donnees.activites.map((a) => (String(a.id) === ids[0]
        ? { ...a, locataires: [{ id: 41, libelle: 'MARTIN Léa' }, { id: 42, libelle: 'DURAND Paul' }], lots: [{ id: 363, libelle: 'Appartement — 7 Avenue de Bretteville Neuilly' }] } : a)) };
      // Le tableau répond ; les fiches ouvertes (annuaire, bien, trace) : « inconnu » (seule leur ouverture est éprouvée ici).
      global.fetch = vi.fn(async (u: unknown) => ({ ok: true, status: 200, json: async () => (String(u).includes('vue=tableau') ? { etat: 'ok', data: donnees } : { etat: 'inconnu' }) }) as unknown as Response) as unknown as typeof fetch;
      await ouvrirSeptembre();
      await deplier(ids[0]);
      await deplier(ids[1]);
      const p0 = container.querySelector(`[data-detail-ligne="${ids[0]}"]`)!;
      expect([...p0.querySelectorAll('[data-fiche-locataire]')].map((b) => b.textContent)).toEqual(['Fiche locataire — MARTIN Léa', 'Fiche locataire — DURAND Paul']);
      expect([...p0.querySelectorAll('[data-fiche-bien]')].map((b) => b.textContent)).toEqual(['Fiche du bien']);
      expect(p0.querySelector('[data-modifier-ligne]')).not.toBeNull();   // « Modifier » reste là
      const p1 = container.querySelector(`[data-detail-ligne="${ids[1]}"]`)!;
      expect(p1.querySelector('[data-fiche-locataire], [data-fiche-bien]')).toBeNull();
      expect(p1.querySelector('[data-locataire-non-rattache]')?.textContent).toBe('Fiche locataire : non rattaché');
      expect(p1.querySelector('[data-bien-non-rattache]')?.textContent).toBe('Fiche du bien : non rattaché');
      await act(async () => { (p0.querySelector('[data-fiche-bien="363"]') as HTMLButtonElement).click(); });
      expect(document.querySelector('[data-modale-caracteristiques-bien="363"]')).not.toBeNull();
      expect(document.querySelector('[data-modale-caracteristiques-bien="363"] h2')?.textContent).toBe('Fiche du bien');
      act(() => { root.unmount(); }); root = createRoot(container);
      await ouvrirSeptembre();
      await deplier(ids[0]);
      await act(async () => { (container.querySelector('[data-fiche-locataire="42"]') as HTMLButtonElement).click(); });
      expect(document.querySelector('[data-modale-fiche-locataire="42"] h2')?.textContent).toBe('Fiche locataire — DURAND Paul');
      await act(async () => { (document.querySelector('[data-fermer-fiche-locataire]') as HTMLButtonElement).click(); });
      expect(document.querySelector('[data-modale-fiche-locataire]')).toBeNull();
    });

    it('🔴 Q1 — une ligne reprise rattachée : les noms de l’annuaire sur la ligne, le texte du fichier en « Libellé d’origine »', async () => {
      const x = String(sept[0].id);
      donnees = { ...donnees, activites: donnees.activites.map((a) => (String(a.id) === x
        ? { ...a, libelleProprietaire: 'DUPONT Jean', libelleLocataire: 'MARTIN Léa', libelleOrigine: { proprietaire: 'DUPONT PARK', locataire: 'MARTIN' } } : a)) };
      await ouvrirSeptembre();
      expect(ligne(x).querySelector('th[data-mot="Propriétaires"]')?.textContent).toContain('DUPONT Jean');
      expect(ligne(x).querySelector('[data-mot="Locataires"]')?.textContent).toBe('MARTIN Léa');
      await deplier(x);
      expect(container.querySelector(`[data-detail-ligne="${x}"] [data-champ="Libellé d’origine"]`)?.textContent).toBe('DUPONT PARK / MARTIN');
      // Une ligne sans libellé d’origine n’a pas ce champ.
      await deplier(String(sept[1].id));
      expect(container.querySelector(`[data-detail-ligne="${String(sept[1].id)}"] [data-champ="Libellé d’origine"]`)).toBeNull();
    });

    it('🔴 « Dossier de location » en PREMIER ; ligne sans bail : inactif, « Dossier non rattaché — à rattacher d’abord » ; rattachée : ouvre la modale', async () => {
      const ids = sept.map((a) => String(a.id));
      donnees = { ...donnees, annuaire: true, activites: donnees.activites.map((a) => (String(a.id) === ids[0] ? { ...a, id: 100 as unknown as string, bailId: 70 } : a)) };
      global.fetch = vi.fn(async (u: unknown) => ({ ok: true, status: 200, json: async () => (String(u).includes('vue=tableau') ? { etat: 'ok', data: donnees } : { etat: 'inconnu' }) }) as unknown as Response) as unknown as typeof fetch;
      await ouvrirSeptembre();
      await deplier('100');
      await deplier(ids[1]);
      const p0 = container.querySelector('[data-detail-ligne="100"] .fdm-detail-gestes')!;
      expect(p0.firstElementChild?.getAttribute('data-dossier-location')).toBe('100');
      expect((p0.firstElementChild as HTMLButtonElement).disabled).toBe(false);
      const p1 = container.querySelector(`[data-detail-ligne="${ids[1]}"] .fdm-detail-gestes`)!;
      const b1 = p1.firstElementChild as HTMLButtonElement;
      expect(b1.disabled).toBe(true);
      expect(b1.textContent).toBe('Dossier de location — Dossier non rattaché — à rattacher d’abord');
      await act(async () => { (p0.firstElementChild as HTMLButtonElement).click(); });
      await calmer();
      expect(document.querySelector('[data-modale-dossier-location="100"]')).not.toBeNull();
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
      await choisirListe(container.querySelector('[data-edition-prime]')!, v);
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
      const avant = container.querySelector('[data-edition-prime]')!.getAttribute('data-valeur')!;
      const primeAvant = cellule('Prime de gestion');
      await prime(avant === 'aucune' ? 'regle' : 'aucune');
      await act(async () => { (container.querySelector('[data-edition-fermer]') as HTMLButtonElement).click(); });
      expect(container.querySelector('[data-edition-ligne]')).toBeNull();
      expect(cellule('Prime de gestion')).toBe(primeAvant);
      expect(posts).toEqual([]);
      await modifierLigne(id);
      expect(container.querySelector('[data-edition-prime]')!.getAttribute('data-valeur')).toBe(avant);
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
      const el = container.querySelector(q)!;
      if (el.getAttribute('role') === 'combobox') { await choisirListe(el, v); return; }
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
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

    it('le montant modifié part au centime (🔴 25/10/2026 : la 3ᵉ décimale est ignorée dès la frappe)', async () => {
      await ouvrirLigne();
      await taper('[data-edition-commission]', '70,125');
      await enregistrer();
      expect(champs()).toMatchObject({ commissionApporteur: '70,12', conserverMontants: false });
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
    expect([nbsp(container.querySelector('[data-total="balance"]')?.textContent), nbsp(container.querySelector('[data-total="balance-an"]')?.textContent)]).toEqual(['−62,10 €', '−745,20 €']);
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
    // 🔴 25/10/2026 — les badges : Externe (sans compte) et « Meilleur apporteur » (le plus fort CA du mois).
    expect(nbsp(container.querySelector('[data-apporteur-mois="Apporteur A"]')?.textContent)).toBe(`Apporteur AExterneMeilleur apporteur${ids.length}3 941,03 €394,10 €`);
    // 🔴 25/10/2026 — un seul apport (via ses apporteurs) : une ligne, la mention en petit ; le badge du meilleur collègue.
    expect(nbsp(container.querySelector('[data-collegue-mois="Arnaud Jorel"]')?.textContent)).toBe(`Arnaud JorelMeilleur collèguevia ses apporteurs${ids.length}3 941,03 €394,10 €`);
    expect(container.querySelector('[data-collegue-mois="Jean-Baptiste PONS"]')).toBeNull();
  });

  it('🔴 historique : « Année par année » — une barre et une ligne par année de la PÉRIODE ; l’encart compare la même portion de l’année d’avant ; un clic ouvre l’année', async () => {
    // 2024 : 2 500 € ; 2025 : 3 000 € jusqu'au 22/10 + 400 € en décembre ; 2026 : 94 612,61 € (au 22/10).
    const bail = (a: ActiviteLue): ActiviteLue => ({ ...a, type: 'bail' });
    donnees = { ...donnees, annees: [2024, 2025, 2026], activites: [...donnees.activites.map((a) => (a.dateSignature < '2026' ? bail(a) : a)),
      bail(n1('a24-1', '2024-02-10', 600, 400)), bail(n1('a24-2', '2024-11-05', 1000, 500)), bail(n1('a25-d', '2025-12-15', 200, 200))] };
    await monter('annee');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['H', 'F', 'C', 'E', 'G']);
    expect(container.querySelectorAll('[data-barre-annee]')).toHaveLength(3);
    expect([...container.querySelectorAll('[data-barre-annee] [data-valeur]')].map((r) => Number(r.getAttribute('data-valeur')))).toEqual([2500, 3400, 94612.61]);
    await act(async () => { (container.querySelector('[data-deplier-historique]') as HTMLElement).click(); });
    const cellule = (a: number, mot: string) => nbsp(container.querySelector(`[data-annee-historique="${a}"] td[data-mot="${mot}"]`)?.textContent);
    expect([cellule(2025, 'Baux'), cellule(2025, 'CA HT'), cellule(2025, 'Évolution du CA')]).toEqual(['3', '3 400,00 €', '+36 %']);
    expect(container.querySelector('[data-annee-historique="2026"]')?.classList.contains('tdb-fort')).toBe(true);
    // Au survol : l'année (rouge), l'année d'avant (gris) sur la MÊME PORTION, l'écart.
    const survoler = async (a: number) => { await act(async () => { container.querySelector(`[data-barre-annee="${a}"]`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); };
    await survoler(2025);
    expect(container.querySelector('[data-bulle="survol"]')).toBeNull();
    const bulle = () => container.querySelector('[data-histo-detail] [data-bulle="sous"]')!;
    expect(bulle().querySelector('.tdb-bulle-titre')?.textContent).toBe('Année 2025');
    expect(nbsp(bulle().querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2025CA HT3 400,00 €Baux3');
    expect(nbsp(bulle().querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2024CA HT2 500,00 €Baux2');
    expect(nbsp(bulle().querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+900,00 € (+36 %)');
    // 🔴 La dernière année, partielle (au 22/10) : face à 2025 au 22/10 (3 000 €, pas les 3 400 € de l'année entière).
    await survoler(2026);
    expect(bulle().querySelector('.tdb-bulle-titre')?.textContent).toBe('Année 2026 (janv. → oct.)');
    expect(nbsp(bulle().querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2025 (janv. → oct.)CA HT3 000,00 €Baux2');
    expect(nbsp(bulle().querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+91 612,61 € (+3 053,8 %)');
    await survoler(2024);
    expect(container.querySelector('[data-histo-detail] [data-bulle-pied]')?.textContent).toBe('N−1 non importée');
    // Les couleurs : le bloc de l'année en ROUGE (celui de la barre), N−1 en GRIS (celui des hachures), le pied neutre.
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.tdb-bulle-bloc--courant{color:var(--color-svv-red)}');
    expect(css).toContain('.tdb-bulle-bloc--n1{color:var(--color-svv-muted)}');
    expect(css).toContain('.tdb-barre-n1-trait{stroke:var(--color-svv-muted)');
    // Un clic sur une année l'OUVRE : la période devient « 2025 → 2025 » (une barre).
    const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    await act(async () => { container.querySelector('[data-barre-annee="2025"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await calmer();
    expect(String((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.slice(appels).map((c) => c[0]))).toContain('annee=2025&toutes=1');
    expect(container.querySelector('[data-periode-libelle]')?.textContent).toBe('Période : 2025 → 2025');
    expect(container.querySelectorAll('[data-barre-annee]')).toHaveLength(1);
    // Sans « Voir les commissions » : pas de colonne commission.
    act(() => { root.unmount(); }); root = createRoot(container);
    donnees = { ...donnees, voirCommissions: false };
    window.history.replaceState(null, '', '/');
    await monter('annee');
    expect(container.querySelector('[data-historique-annees] thead')?.textContent).not.toContain('Commission');
  });

  describe('🔴 Arno (25/10/2026) — « Année par année » : CA · Baux · Gestion et la bascule « Annuel / Cumul »', () => {
    // 🔴 25/10/2026 — les années se calculent sur les AFFAIRES de la période : 2024 (2 baux, 2 500 €), 2025 (3 000 €), 2026 (94 612,61 €).
    const ca = [2500, 3000, 94612.61];
    beforeEach(() => {
      const bail = (a: ActiviteLue): ActiviteLue => ({ ...a, type: 'bail' });
      donnees = { ...donnees, annees: [2024, 2025, 2026], activites: [...donnees.activites, bail(n1('a24-1', '2024-02-10', 600, 400)), bail(n1('a24-2', '2024-11-05', 1000, 500))],
        gestion: { ...donnees.gestion, transitions: [
        { lotId: 1, avant: null, apres: 'en_gestion', effetLe: '2024-03-01' }, { lotId: 2, avant: null, apres: 'en_gestion', effetLe: '2024-06-01' },
        { lotId: 3, avant: 'en_gestion', apres: 'ancienne_gestion', effetLe: '2025-02-01' }, { lotId: 4, avant: null, apres: 'en_gestion', effetLe: '2025-05-01' },
        { lotId: 5, avant: null, apres: 'en_gestion', effetLe: '2025-07-01' },
        ...donnees.gestion.transitions,                                                        // 2026 : +1 (12/09), −1 (01/10)
        { lotId: 6, avant: null, apres: 'en_gestion', effetLe: '2026-11-20' }] } } as typeof donnees;   // après le mois courant : pas compté
    });
    const h = () => container.querySelector('[data-section="H"]') as HTMLElement;
    const presse = () => [...h().querySelectorAll('[data-mesure-bouton]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-mesure-bouton'));
    const bascule = () => h().querySelector('[data-cumul-bouton]') as HTMLButtonElement;
    const libelle = () => bascule().querySelector('[data-cumul-libelle]')?.textContent;
    const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
    const url = (k: string) => new URLSearchParams(window.location.search).get(k);
    const barres = () => [...h().querySelectorAll('[data-barre-annee] [data-valeur]')].map((r) => Number(r.getAttribute('data-valeur')));
    const points = () => [...h().querySelectorAll('[data-courbe="annees-cumul"] [data-point-cumul]')].map((c) => Number(c.getAttribute('data-valeur')));

    it('l’en-tête de « Mois par mois » : titre et bascule « Annuel » dans la colonne du graphique, CA · Baux · Gestion dans celle de l’encart ; une seule mesure active', async () => {
      await monter('annee');
      const entete = h().querySelector('[data-histo-entete]')!;
      expect(entete.querySelector('[data-entete-graphe] h3')?.textContent).toBe('Année par année (CA HT ; une année s’ouvre d’un clic)');
      expect(entete.querySelector('[data-entete-graphe] [data-cumul-bouton]')).not.toBeNull();
      expect(entete.querySelector('[data-entete-detail] [data-mesures]')).not.toBeNull();
      expect([libelle(), bascule().title, presse()]).toEqual(['Annuel', 'Afficher le cumul', ['ca']]);
      await clic(h().querySelector('[data-mesure-bouton="baux"]')!);
      expect(presse()).toEqual(['baux']);
      await clic(h().querySelector('[data-mesure-bouton="gestion"]')!);
      expect(presse()).toEqual(['gestion']);
      expect(entete.querySelector('h3')?.textContent).toBe('Année par année (solde de gestions ; une année s’ouvre d’un clic)');
      await clic(bascule());
      expect([libelle(), bascule().title, presse()]).toEqual(['Cumul', 'Afficher l’annuel', ['gestion']]);
      expect(entete.querySelector('h3')?.textContent).toBe('Année par année (solde de gestions, cumulé depuis 2024 ; une année s’ouvre d’un clic)');
      // Le tableau « Année par année » dessous ne change pas.
      expect(h().querySelector('[data-historique-annees]')).not.toBeNull();
    });

    it('les valeurs annuelles = le tableau « Année par année » (CA HT, Baux) ; Gestion = solde de l’année, arrêté au mois courant', async () => {
      await monter('annee');
      expect(barres()).toEqual(ca);
      await clic(h().querySelector('[data-deplier-historique]')!);
      for (const [i, a] of [2024, 2025, 2026].entries()) expect(nbsp(h().querySelector(`[data-annee-historique="${a}"] td[data-mot="CA HT"]`)?.textContent)).toBe(nbsp(`${ca[i].toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`));
      await clic(h().querySelector('[data-mesure-bouton="baux"]')!);
      expect(barres()[0]).toBe(2);
      for (const [i, a] of [2024, 2025, 2026].entries()) expect(Number(h().querySelector(`[data-annee-historique="${a}"] td[data-mot="Baux"]`)?.textContent)).toBe(barres()[i]);
      await clic(h().querySelector('[data-mesure-bouton="gestion"]')!);
      // 2024 : +2 ; 2025 : −1 +2 = +1 ; 2026 : +1 −1 = 0 (l'entrée du 20/11/2026 est après le mois courant).
      expect(barres()).toEqual([2, 1, 0]);
      const det = h().querySelector('[data-histo-detail]')!;
      expect(det.querySelector('.tdb-bulle-titre')?.textContent).toBe('Année 2026 (janv. → oct.)');
      expect(nbsp(det.querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart−1 (−100 %)');
    });

    it('Cumul : un point par année ; le cumul 2026 = la somme des années (au centime) ; l’encart : cumuls à fin d’année et leur écart', async () => {
      await monter('annee');
      await clic(bascule());
      expect(points()).toHaveLength(3);
      const centimes = (x: number) => Math.round(x * 100);
      expect(centimes(points()[2])).toBe(ca.reduce((t, x) => t + centimes(x), 0));
      const det = h().querySelector('[data-histo-detail]')!;
      expect(det.querySelector('.tdb-bulle-titre')?.textContent).toBe('Cumul à fin 2026 (janv. → oct.)');
      expect(nbsp(det.querySelector('[data-bulle-pied]')?.textContent)).toBe('Écart+94 612,61 € (+1 720,2 %)');
      // 🔴 Le cumul part du DÉBUT choisi : 2025 → aujourd'hui commence à 3 000 €.
      await choisir('debut', '2025');
      expect(points()).toEqual([3000, 3000 + 94612.61]);
      await act(async () => { h().querySelector('[data-annee-cumul="2025"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(det.querySelector('.tdb-bulle-titre')?.textContent).toBe('Cumul à fin 2025');
      await choisir('debut', 'origine');
      await clic(h().querySelector('[data-mesure-bouton="gestion"]')!);
      expect(points()).toEqual([2, 3, 3]);
      // Une année s'ouvre d'un clic.
      const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
      await act(async () => { h().querySelector('[data-annee-cumul="2025"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await calmer();
      expect(String((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.slice(appels).map((c) => c[0]))).toContain('annee=2025');
    });

    it('l’adresse : ?vue=baux&cumul=1 le rouvre ; CA et Annuel (le défaut) n’écrivent rien', async () => {
      await monter('annee');
      expect([url('vue'), url('cumul')]).toEqual([null, null]);
      await clic(h().querySelector('[data-mesure-bouton="baux"]')!);
      await clic(bascule());
      expect([url('vue'), url('cumul')]).toEqual(['baux', '1']);
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?vue=gestion&cumul=1');
      await monter('annee');
      expect([presse(), libelle()]).toEqual([['gestion'], 'Cumul']);
      expect(h().querySelector('[data-courbe="annees-cumul"]')).not.toBeNull();
    });
  });

  describe('🔴 Arno (25/10/2026) — « Année par année » replié sur une ligne, défilement interne au-delà de huit années', () => {
    // 🔴 25/10/2026 — les années du tableau sont celles de la PÉRIODE (Origine = la première année connue) : `annees` les fixe.
    const annees = (de: number, a: number) => Array.from({ length: a - de + 1 }, (_, i) => de + i);
    const rangees = () => [...container.querySelectorAll('[data-historique-annees] tbody tr')].map((t) => t.getAttribute('data-annee-historique'));
    const bouton = () => container.querySelector('[data-deplier-historique]') as HTMLButtonElement;
    const cadre = () => container.querySelector('[data-historique-cadre]') as HTMLDivElement;

    it('REPLIÉ au chargement : l’en-tête et l’année en cours (en gras), le chevron ▸ et « 8 années — cliquer pour tout afficher »', async () => {
      donnees = { ...donnees, annees: annees(2019, 2026) };
      await monter('annee');
      expect(rangees()).toEqual(['2026']);
      expect(container.querySelector('[data-historique-annees] thead')?.textContent).toBe('AnnéeBauxCA HTApporteursCA netCommission bruteÉvolution du CA');
      expect(container.querySelector('[data-annee-historique="2026"]')?.classList.contains('tdb-fort')).toBe(true);
      // L'évolution de l'année en cours reste calculée sur l'année d'avant (2025 : 3 000 €), même repliée.
      expect(nbsp(container.querySelector('[data-annee-historique="2026"] td[data-mot="Évolution du CA"]')?.textContent)).toBe('+3 053,8 %');
      expect(nbsp(bouton().textContent)).toBe('8 années — cliquer pour tout afficher▸');
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
      expect(cadre().getAttribute('data-historique-cadre')).toBe('replie');
    });

    it('bascule au CLIC (ligne hors lien, chevron) et au CLAVIER (Entrée, Espace) ; le lien de l’année ouvre l’année (sa période) sans déplier', async () => {
      donnees = { ...donnees, annees: annees(2019, 2026) };
      await monter('annee');
      const ligne = () => container.querySelector('[data-annee-historique="2026"]') as HTMLElement;
      await act(async () => { (ligne().querySelector('td') as HTMLElement).click(); });
      expect(rangees()).toEqual(['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']);
      expect([bouton().getAttribute('aria-expanded'), nbsp(bouton().textContent)]).toEqual(['true', '8 années — cliquer pour replier▾']);
      await act(async () => { bouton().click(); });
      expect(rangees()).toEqual(['2026']);
      await act(async () => { ligne().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(rangees()).toHaveLength(8);
      await act(async () => { ligne().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
      expect(rangees()).toEqual(['2026']);
      expect(ligne().tabIndex).toBe(0);
      // Le lien d'une année l'OUVRE (la période devient cette année) et ne déplie rien.
      await act(async () => { bouton().click(); });
      const appels = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
      await act(async () => { (container.querySelector('[data-annee-historique="2021"] .tdb-chiffre') as HTMLElement).click(); });
      await calmer();
      expect(String((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.slice(appels).map((c) => c[0]))).toContain('annee=2021&toutes=1');
      expect(container.querySelector('[data-periode-libelle]')?.textContent).toBe('Période : 2021 → 2021');
      expect(rangees()).toEqual(['2021']);
      expect(container.querySelector('[data-annee-historique="2021"] .tdb-chiffre')?.getAttribute('aria-current')).toBe('true');
    });

    it('déplié : hauteur MESURÉE = en-tête + 8 années ; au-delà (12 années), défilement interne positionné sur l’année en cours ; en-tête figé', async () => {
      // Le rendu simulé : en-tête de 30 px, chaque année 40 px ; le cadre en haut (0).
      const indice = (el: Element) => [...el.parentElement!.children].indexOf(el);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const haut = this.matches('tr[data-annee-historique]') ? 30 + indice(this) * 40 : 0;
        return { top: haut, bottom: haut + (this.matches('tr[data-annee-historique]') ? 40 : 0), left: 0, right: 0, width: 0, height: 0, x: 0, y: haut, toJSON: () => ({}) } as DOMRect;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('tr[data-annee-historique]') ? 30 + indice(this) * 40 : 0; });
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('tr[data-annee-historique]') ? 40 : 0; });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return parseFloat(this.style.maxHeight) || 0; });
      const defile: number[] = [];
      vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, v: number) { if (this.matches('[data-historique-cadre]')) defile.push(v); });

      donnees = { ...donnees, annees: annees(2015, 2026) };
      await monter('annee');
      expect(rangees()).toEqual(['2026']);
      expect(cadre().style.maxHeight).toBe('');
      expect(nbsp(bouton().textContent)).toBe('12 années — cliquer pour tout afficher▸');
      await act(async () => { bouton().click(); });
      expect(rangees()).toHaveLength(12);
      expect(cadre().style.maxHeight).toBe(`${30 + 8 * 40}px`);
      // 2026 est la 12e : son bas (30 + 12 × 40) aligné sur le bas du cadre.
      expect(defile.at(-1)).toBe(30 + 12 * 40 - (30 + 8 * 40));
      const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
      expect(css).toContain('.tdb-h-cadre--ouvert{overflow-y:auto;overflow-x:hidden;');
      expect(css).toContain('.tdb-h-cadre--ouvert .tdb-table thead th{position:sticky;top:0;');
      expect(cadre().classList.contains('tdb-h-cadre--ouvert')).toBe(true);
      // Replié : plus de borne ni de défilement interne.
      await act(async () => { bouton().click(); });
      expect([cadre().style.maxHeight, cadre().classList.contains('tdb-h-cadre--ouvert')]).toEqual(['', false]);
    });

    it('huit années ou moins : la borne mesurée égale la hauteur du tableau entier (rien ne défile)', async () => {
      const indice = (el: Element) => [...el.parentElement!.children].indexOf(el);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const haut = this.matches('tr[data-annee-historique]') ? 30 + indice(this) * 40 : 0;
        return { top: haut, bottom: haut + (this.matches('tr[data-annee-historique]') ? 40 : 0), left: 0, right: 0, width: 0, height: 0, x: 0, y: haut, toJSON: () => ({}) } as DOMRect;
      });
      donnees = { ...donnees, annees: annees(2022, 2026) };
      await monter('annee');
      await act(async () => { bouton().click(); });
      expect(rangees()).toHaveLength(5);
      expect(cadre().style.maxHeight).toBe(`${30 + 5 * 40}px`);
    });
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
      // 🔴 25/10/2026 — la mesure s'écrit dans « vue » (plus « mesure ») ; CA, le défaut, n'écrit rien.
      expect(new URLSearchParams(window.location.search).get('vue')).toBeNull();
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
      expect(new URLSearchParams(window.location.search).get('vue')).toBe('baux');
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
      expect(new URLSearchParams(window.location.search).get('vue')).toBe('gestion');
      await cliquer('ca');
      expect(new URLSearchParams(window.location.search).get('vue')).toBeNull();
    });

    it('l’adresse (?mesure=gestion) rouvre la mesure choisie ; N−1 de gestion : comptée quand elle existe, l’écart nul en gris', async () => {
      window.history.replaceState(null, '', '/?mesure=gestion');
      donnees = { ...donnees, gestion: { ...donnees.gestion, transitions: [...donnees.gestion.transitions, { lotId: 9, avant: null, apres: 'en_gestion', effetLe: '2025-09-03' }] } } as typeof donnees;
      await monter('mois');
      expect(presse()).toEqual(['gestion']);
      // 🔴 25/10/2026 — une ancienne adresse « ?mesure= » s'ouvre encore, et se réécrit en « ?vue= ».
      expect([new URLSearchParams(window.location.search).get('vue'), new URLSearchParams(window.location.search).get('mesure')]).toEqual(['gestion', null]);
      expect(barre(9).querySelector('[data-barre-n1]')).not.toBeNull();
      await act(async () => { barre(9).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(nbsp(container.querySelector('[data-histo-detail] [data-bulle-pied]')?.textContent)).toBe('Écart0 (+0 %)');
      expect(container.querySelector('[data-histo-detail] [data-ecart]')?.getAttribute('data-ecart')).toBe('nul');
    });
  });

  describe('🔴 Arno (25/10/2026) — « Mois par mois » : le bouton « Cumul »', () => {
    const presse = () => [...container.querySelectorAll('[data-mesure-bouton]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-mesure-bouton'));
    const cumul = () => container.querySelector('[data-cumul-bouton]') as HTMLButtonElement;
    const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
    const url = (k: string) => new URLSearchParams(window.location.search).get(k);
    const points = () => [...container.querySelectorAll('[data-courbe="mois-cumul"] [data-point-cumul]')].map((c) => Number(c.getAttribute('data-valeur')));

    const libelle = () => cumul().querySelector('[data-cumul-libelle]')?.textContent;
    it('🔴 la bascule À GAUCHE des trois mesures, sans filet ; son libellé dit le graphique : « Mensuel » (barres) ↔ « Cumul » (courbe) ; l’adresse le porte', async () => {
      await monter('mois');
      // 🔴 25/10/2026 (suite) — la bascule dans la COLONNE DU GRAPHIQUE (après le titre), les mesures dans celle de l'ENCART.
      const entete = container.querySelector('[data-histo-entete]')!;
      expect([...entete.children].map((e) => (e.hasAttribute('data-entete-graphe') ? 'graphe' : e.hasAttribute('data-entete-detail') ? 'encart' : '?'))).toEqual(['graphe', 'encart']);
      expect([...entete.querySelector('[data-entete-graphe]')!.children].map((e) => e.tagName === 'H3' ? 'titre' : e.hasAttribute('data-cumul-bouton') ? 'bascule' : '?')).toEqual(['titre', 'bascule']);
      expect(entete.querySelector('[data-entete-detail] [data-mesures]')).not.toBeNull();
      expect(entete.querySelector('[data-entete-detail] [data-cumul-bouton]')).toBeNull();
      expect(container.querySelector('.tdb-mesures-filet')).toBeNull();
      // Un vrai bouton, distinct des onglets ; l'icône ⇄ ; l'infobulle dit l'action.
      expect([cumul().tagName, cumul().type, cumul().className]).toEqual(['BUTTON', 'button', 'tdb-bascule-cumul']);
      expect([cumul().textContent, libelle(), cumul().title]).toEqual(['⇄Mensuel', 'Mensuel', 'Afficher le cumul']);
      expect(container.querySelector('[data-barre-mois="9"]')).not.toBeNull();
      expect(url('cumul')).toBeNull();
      await clic(cumul());
      expect([libelle(), cumul().title, cumul().getAttribute('data-cumul-etat')]).toEqual(['Cumul', 'Afficher le mensuel', 'cumul']);
      expect(cumul().className).toBe('tdb-bascule-cumul');   // la même apparence dans les deux états
      expect(container.querySelector('[data-barre-mois]')).toBeNull();
      expect(container.querySelector('[data-courbe="mois-cumul"]')).not.toBeNull();
      expect(container.querySelector('[data-bloc="histogramme-mois"] h3')?.textContent).toBe('Mois par mois — 2026 (CA HT, cumulé depuis janvier ; un mois s’ouvre d’un clic)');
      expect([url('cumul'), url('vue')]).toEqual(['1', null]);
      await clic(cumul());
      expect([libelle(), url('cumul')]).toEqual(['Mensuel', null]);
      expect(container.querySelector('[data-barre-mois="9"]')).not.toBeNull();
    });

    it('🔴 la place : l’en-tête suit la grille du graphique et de son encart (mêmes colonnes, même écart) ; le bord droit de la bascule sur celui de la zone tracée ; aucun chevauchement', async () => {
      await monter('mois');
      const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx'), 'utf8');
      const regle = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';
      // Même gabarit de colonnes que la rangée graphique | encart.
      expect(regle('.tdb-histo-rangee')).toContain('grid-template-columns:minmax(0,1fr) 270px');
      expect(regle('.tdb-histo-entete')).toContain('grid-template-columns:minmax(0,1fr) 270px;column-gap:20px');
      expect(regle('.tdb-histo-rangee')).toContain('gap:4px 20px');
      // La colonne du graphique s'arrête à la zone tracée : la marge droite du dessin (12 sur 640).
      expect(regle('.tdb-histo-entete-graphe')).toContain('padding-right:calc(100% * 12 / 640)');
      // Le titre se replie (min-width:0), jamais la bascule (flex:0 0 auto).
      expect(regle('.tdb-histo-entete-graphe h3')).toContain('flex:1 1 auto;min-width:0');
      expect(regle('.tdb-histo-entete-graphe .tdb-bascule-cumul')).toBe('flex:0 0 auto;margin-bottom:1px');
      // Encart sous le graphique : bouton puis mesures sur une ligne, à droite.
      expect(css).toContain('@media (max-width:760px){\n  .tdb-histo-entete{display:flex;flex-wrap:wrap;justify-content:flex-end');
      expect(css).toContain('@media (max-width:760px){ .tdb-histo-rangee{grid-template-columns:minmax(0,1fr)');
    });

    it('au CLAVIER : Entrée et Espace basculent ; les autres touches non', async () => {
      await monter('mois');
      const touche = async (key: string) => { await act(async () => { cumul().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }); await calmer(); };
      await touche('Enter');
      expect([libelle(), url('cumul')]).toEqual(['Cumul', '1']);
      await touche(' ');
      expect([libelle(), url('cumul')]).toEqual(['Mensuel', null]);
      await touche('a');
      expect(libelle()).toBe('Mensuel');
      const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx'), 'utf8');
      expect(css).toContain('.tdb-bascule-cumul:focus-visible{outline:2px solid var(--color-svv-red)');
      expect(css).toContain('.tdb-bascule-cumul:hover{');
    });

    it('une seule mesure à la fois ; changer de mesure GARDE le cumul ; l’adresse ?vue=baux&cumul=1 le rouvre', async () => {
      await monter('mois');
      await clic(cumul());
      await clic(container.querySelector('[data-mesure-bouton="baux"]')!);
      expect(presse()).toEqual(['baux']);
      expect(libelle()).toBe('Cumul');
      expect([url('vue'), url('cumul')]).toEqual(['baux', '1']);
      await clic(container.querySelector('[data-mesure-bouton="gestion"]')!);
      expect(presse()).toEqual(['gestion']);
      act(() => { root.unmount(); }); root = createRoot(container);
      window.history.replaceState(null, '', '/?vue=baux&cumul=1');
      await monter('mois');
      expect([presse(), libelle()]).toEqual([['baux'], 'Cumul']);
      expect(container.querySelector('[data-courbe="mois-cumul"]')).not.toBeNull();
    });

    it('CA : le cumul au point de chaque mois ; la courbe s’arrête au MOIS COURANT (octobre) ; un mois à venir : « À venir »', async () => {
      await monter('mois');
      await clic(cumul());
      const ctx = { regles: donnees.regles, apporteurs: donnees.apporteurs, retrocessions: donnees.retrocessions, aujourdhui: donnees.aujourdhui };
      const attendu = sectionCumul(donnees.activites, ctx, 2026).map((p) => p.caCumule);
      expect(points()).toHaveLength(10);
      points().forEach((v, i) => expect(v).toBeCloseTo(attendu[i], 6));
      await act(async () => { container.querySelector('[data-mois-cumul="11"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      const det = container.querySelector('[data-histo-detail]')!;
      expect(det.querySelector('.tdb-bulle-titre')?.textContent).toBe('Cumul à fin novembre');
      expect(nbsp(det.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026À venir');
      // Le mois survolé : le cumul de l'année, celui de N−1, l'écart « +x € (+y %) ».
      await act(async () => { container.querySelector('[data-mois-cumul="9"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(nbsp(det.querySelector('[data-bulle-bloc="n1"]')?.textContent)).toBe('2025CA HT3 000,00 €Baux2');
      expect(nbsp(det.querySelector('[data-bulle-pied]')?.textContent)).toMatch(/^Écart\+[\d ]+,\d\d € \(\+[\d ,]+ %\)$/);
    });

    it('Baux : baux cumulés ; Gestion : SOLDE cumulé (entrées − sorties, la source de la section Gestion), en nombres entiers', async () => {
      window.history.replaceState(null, '', '/?vue=gestion&cumul=1');
      await monter('mois');
      // L'entrée du 12/09/2026 (+1), la sortie du 01/10/2026 (−1) : septembre 1, octobre 0.
      expect(points()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
      const det = container.querySelector('[data-histo-detail]')!;
      expect(nbsp(det.querySelector('[data-bulle-bloc="courant"]')?.textContent)).toBe('2026Solde de gestions (cumul)0');
      await clic(container.querySelector('[data-mesure-bouton="baux"]')!);
      const ctx = { regles: donnees.regles, apporteurs: donnees.apporteurs, retrocessions: donnees.retrocessions, aujourdhui: donnees.aujourdhui };
      const nb = cumulDepuisJanvier(sectionCumul(donnees.activites, ctx, 2026).map((p) => p.nb));
      expect(points()).toEqual(nb.slice(0, 10));
      expect([...container.querySelectorAll('[data-courbe="mois-cumul"] .tdb-axe')].map((t) => nbsp(t.textContent)).filter((t) => /^-?[\d ]+$/.test(t)).every((t) => !t.includes(','))).toBe(true);
    });
  });

  describe('🔴 Arno (25/10/2026) — le cumul : décembre = le total de l’année au centime ; jusqu’où trace la courbe', () => {
    it('cumul de décembre = total de l’année (CA HT au centime, baux) ; solde de gestions = entrées − sorties', () => {
      const ctx = { regles: donnees.regles, apporteurs: donnees.apporteurs, retrocessions: donnees.retrocessions, aujourdhui: donnees.aujourdhui };
      const B = sectionCumul(donnees.activites, ctx, 2026);
      const total = totauxPeriode(donnees.activites, ctx, { annee: 2026, mois: null });
      const centimes = (x: number) => Math.round(x * 100);
      expect(centimes(cumulDepuisJanvier(B.map((p) => p.ca))[11])).toBe(centimes(total.ca));
      expect(cumulDepuisJanvier(B.map((p) => p.nb))[11]).toBe(total.nb);
      const t = [{ lotId: 1, avant: null, apres: 'en_gestion', effetLe: '2025-01-10' }, { lotId: 2, avant: 'location_seule', apres: 'en_gestion', effetLe: '2025-01-20' },
        { lotId: 3, avant: 'en_gestion', apres: 'ancienne_gestion', effetLe: '2025-03-02' }, { lotId: 4, avant: null, apres: 'en_gestion', effetLe: '2026-01-02' }];
      expect(cumulDepuisJanvier(soldeGestionParMois(t, 2025))).toEqual([2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    });
    it('année en cours : jusqu’au mois courant ; année passée : 12 mois ; année à venir : aucun', () => {
      expect([moisDeLaCourbe(2026, '2026-10-25'), moisDeLaCourbe(2025, '2026-10-25'), moisDeLaCourbe(2027, '2026-10-25')]).toEqual([10, 12, 0]);
    });
  });

  describe('🔴 Arno (23/10/2026) — Suivi du mois : le sélecteur d’année au bout de la rangée des mois', () => {
    const selecteur = () => container.querySelector('[data-annee-onglets]') as HTMLButtonElement;
    const filtreAnnee = () => container.querySelector('[data-filtre="annee"]')!;
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
      expect(filtreAnnee().getAttribute('data-valeur')).toBe('2025');
      expect(window.location.search).toBe('?annee=2025&mois=9');
      // Une année passée : ses 12 mois actifs, aucun point gris.
      expect(container.querySelectorAll('[data-onglets-mois] .tdb-onglet-vide')).toHaveLength(0);
      // Et l'inverse : le filtre « Année » change le sélecteur.
      await choisirListe(filtreAnnee(), '2026');
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
      expect(filtreAnnee().getAttribute('data-valeur')).toBe('2025');
    });
  });

  it('sans la migration 406 : le dit', async () => {
    donnees = { ...donnees, disponible: false, activites: [] };
    await monter();
    expect(container.querySelector('[data-tdb-sans-migration]')?.textContent).toContain('migration 406');
  });
});

describe('🔴 Arno (25/10/2026) — le résumé de transaction : source unique et « Statut du bien » (424)', () => {
  const sept = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09'));
  const id = String(sept[0].id);
  let posts: Record<string, unknown>[];
  const servir = () => {
    posts = [];
    global.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
    }) as unknown as typeof fetch;
  };
  const ouvrir = async () => {
    servir();
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector(`[data-deplier-ligne="${id}"]`) as HTMLButtonElement).click(); });
  };
  const champ = (mot: string) => container.querySelector(`[data-detail-ligne="${id}"] [data-champ="${mot}"]`);
  const modale = () => document.querySelector(`[data-modale-statut-bien="${id}"]`);
  const ouvrirModale = async () => { await act(async () => { (champ('Statut du bien')!.querySelector('[data-statut-bien-ouvrir]') as HTMLButtonElement).click(); }); };
  const avec = (p: Partial<ActiviteLue>) => { donnees = { ...donnees, statutBienManuel: true, activites: donnees.activites.map((a) => (String(a.id) === id ? { ...a, ...p } : a)) }; };

  it('CHEKROUNE : « Type de bien » = la fiche du bien (« Local ») ; la disposition de l’encart ne change pas', async () => {
    avec({ categoriePrime: 'local' });
    await ouvrir();
    expect(champ('Type de bien')?.textContent).toBe('Local');
    expect([...container.querySelectorAll(`[data-detail-ligne="${id}"] [data-champ]`)].map((e) => e.getAttribute('data-champ')).slice(0, 4))
      .toEqual(['Statut du bien', 'Date de signature', 'Nature', 'Type de bien']);
  });

  it('la modale : les 5 statuts, chacun avec son « i » ; le calculé présélectionné et « proposé » ; fermée seulement par la croix, un clic dehors ou Annuler', async () => {
    avec({ origineContact: 'internet', avecGestion: false, mandatGestion: false });
    await ouvrir();
    expect(nbsp(champ('Statut du bien')?.textContent)).toBe('Nouveau sans gestion — nouveau client, bien sans gestion');
    await ouvrirModale();
    const choix = [...modale()!.querySelectorAll('[data-statut-bien-choix]')];
    expect(choix.map((b) => [b.getAttribute('data-statut-bien-choix'), b.getAttribute('aria-checked'), b.querySelector('[data-statut-propose]') !== null]))
      .toEqual([['nouveau_gestion', 'false', false], ['relocation', 'false', false], ['nouveau_sans_gestion', 'true', true], ['client_hors_gestion', 'false', false], ['a_qualifier', 'false', false]]);
    expect(choix.map((b) => b.querySelector('.fdm-nature')?.textContent)).toEqual(['Nouvelle gestion', 'Relocation gestion', 'Nouveau sans gestion', 'Relocation sans gestion', 'À qualifier']);
    const infos = [...modale()!.querySelectorAll('[data-statut-info]')] as HTMLButtonElement[];
    expect(infos.map((b) => b.getAttribute('aria-label'))).toEqual(['Ce que veut dire « Nouvelle gestion »', 'Ce que veut dire « Relocation gestion »',
      'Ce que veut dire « Nouveau sans gestion »', 'Ce que veut dire « Relocation sans gestion »', 'Ce que veut dire « À qualifier »']);
    // 🔴 Arno (25/10/2026) — le « i » déplie la description DANS la modale, sous SA ligne ; une seule ouverte ; le « i » suivant reste cliquable.
    const desc = () => [...modale()!.querySelectorAll('[data-statut-description]')].map((e) => [e.getAttribute('data-statut-description'), e.closest('li')?.querySelector('[data-statut-bien-choix]')?.getAttribute('data-statut-bien-choix')]);
    await act(async () => { infos[0].click(); });
    expect(desc()).toEqual([['nouveau_gestion', 'nouveau_gestion']]);
    expect(infos[0].getAttribute('aria-expanded')).toBe('true');
    expect(modale()!.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => { infos[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); infos[1].click(); });
    expect(desc()).toEqual([['relocation', 'relocation']]);
    expect([infos[0].getAttribute('aria-expanded'), infos[1].getAttribute('aria-expanded')]).toEqual(['false', 'true']);
    await act(async () => { infos[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); infos[3].click(); });
    expect(desc()).toEqual([['client_hors_gestion', 'client_hors_gestion']]);
    expect(modale()!.querySelector('[data-statut-description]')?.textContent).toContain('Relocation sans gestion : le propriétaire était déjà client');
    // Un second clic referme ; un clic ailleurs referme ; Échap referme la description, jamais la modale.
    await act(async () => { infos[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); infos[3].click(); });
    expect(desc()).toEqual([]);
    await act(async () => { infos[4].click(); });
    await act(async () => { modale()!.querySelector('.msb-note')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(desc()).toEqual([]);
    await act(async () => { infos[2].click(); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(desc()).toEqual([]);
    expect(modale()).not.toBeNull();
    await act(async () => { (modale()!.querySelector('[data-fermer-statut-bien]') as HTMLButtonElement).click(); });
    expect(modale()).toBeNull();
    await ouvrirModale();
    await act(async () => { (modale()!.querySelector('[data-annuler-statut-bien]') as HTMLButtonElement).click(); });
    expect(modale()).toBeNull();
    await ouvrirModale();
    const voile = document.querySelector('[data-voile-statut-bien]')!;
    await act(async () => { voile.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(modale()).toBeNull();
    expect(posts).toEqual([]);
  });

  it('« Valider » enregistre le statut choisi sur la ligne ; validé, il l’emporte (pastille, légende, rubrique « validé par … le … ») ; « Revenir au statut calculé »', async () => {
    avec({ origineContact: 'internet', avecGestion: false, mandatGestion: false });
    await ouvrir();
    await ouvrirModale();
    await act(async () => { (modale()!.querySelector('[data-statut-bien-choix="nouveau_gestion"]') as HTMLButtonElement).click(); });
    await act(async () => { (modale()!.querySelector('[data-valider-statut-bien]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts).toEqual([{ action: 'statut-bien', id: sept[0].id, statut: 'nouveau_gestion' }]);
    expect(modale()).toBeNull();
    // La ligne relue porte le statut validé : il l'emporte partout.
    act(() => { root.unmount(); }); root = createRoot(container);
    avec({ natureManuelle: { nature: 'nouveau_gestion', par: 'Arnaud Jorel', le: '2026-10-25T09:00:00Z' } });
    await ouvrir();
    expect(container.querySelector(`[data-ligne-feuille="${id}"] [data-mot="Bien"]`)?.getAttribute('data-nature-bien')).toBe('nouveau_gestion');
    expect(nbsp(champ('Statut du bien')?.textContent)).toBe('Nouvelle gestion — validé par Arnaud Jorel le 25/10/2026');
    const nb = (n: string) => container.querySelector(`[data-legende-nature-item="${n}"] .fdm-legende-nb`)?.textContent;
    const duMois = donnees.activites.filter((a) => a.dateSignature.startsWith('2026-09'));
    expect(nb('nouveau_gestion')).toBe(String(duMois.filter((a) => natureBienLoue(a).nature === 'nouveau_gestion').length));
    expect(nb('nouveau_gestion')).toBe(String(duMois.filter((a) => natureBienLoue({ ...a, natureManuelle: null }).nature === 'nouveau_gestion').length + 1));
    await ouvrirModale();
    expect(modale()!.querySelector('[data-statut-bien-choix="nouveau_gestion"]')?.getAttribute('aria-checked')).toBe('true');
    expect(modale()!.querySelector('[data-statut-bien-choix="nouveau_sans_gestion"] [data-statut-propose]')).not.toBeNull();
    await act(async () => { (modale()!.querySelector('[data-statut-bien-calcule]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts).toEqual([{ action: 'statut-bien', id: sept[0].id, statut: null }]);
  });

  it('sans la migration 424 : la modale le dit, « Valider » est inactif (rien ne part)', async () => {
    avec({});
    donnees = { ...donnees, statutBienManuel: false };
    await ouvrir();
    await ouvrirModale();
    expect(modale()!.querySelector('[data-statut-sans-424]')?.textContent).toContain('migration 424');
    expect((modale()!.querySelector('[data-valider-statut-bien]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('🔴 Arno (25/10/2026) — les tuiles centrées ; « Biens en gestion » : le Solde, puis la ligne de la période', () => {
  const ordre = () => {
    const t = container.querySelector('[data-tuile="gestion"]')!;
    return [...t.children].map((e) => e.className) .concat([...t.querySelector('[data-gestion-mouvements]')!.children].map((e) => e.className));
  };
  it('Suivi du mois : titre, chiffre, puis « Solde +N » (en grand), puis « Sept. 2026 : +N −N » en dessous', async () => {
    await monter('mois');
    expect(ordre()).toEqual(['tdb-tuile-mot', 'tdb-tuile-valeur', 'tdb-gestion', 'tdb-gestion-solde', 'tdb-gestion-comptes']);
    expect(container.querySelector('[data-tuile="gestion"] .tdb-gestion-solde')?.textContent).toMatch(/^Solde[+−]?\d+$/);
    expect(container.querySelector('[data-tuile="gestion"] .tdb-gestion-comptes')?.textContent).toMatch(/^[A-Za-zéû.]+ \d{4} :\+\d+−\d+$/);
  });

  it('Suivi annuel (même composant) : le même ordre, la ligne « récurrent » reste en dernier', async () => {
    await monter('annee');
    expect(ordre()).toEqual(['tdb-tuile-mot', 'tdb-tuile-valeur', 'tdb-gestion', 'tdb-tuile-n1 tdb-gestion-recurrent', 'tdb-gestion-solde', 'tdb-gestion-comptes']);
  });

  it('tout centré (titre, chiffre, comparaison, solde, ligne du mois) ; mêmes dimensions qu’avant', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx'), 'utf8');
    expect(css).toContain('.tdb-tuile{appearance:none;width:100%;height:100%;min-height:9rem;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;');
    expect(css).toContain('.tdb-gestion{display:flex;flex-direction:column;align-items:center;');
    expect(css).toContain('.tdb-gestion-comptes{display:flex;flex-wrap:wrap;justify-content:center;');
    expect(css).toContain('.tdb-gestion-solde{display:flex;justify-content:center;');
    expect(css).toContain('.tdb-tuile:has(.tdb-gestion){min-height:11rem}');
  });
});

describe('🔴 Arno (25/10/2026) — « Résumé du mois » : le bas de feuille par familles', () => {
  const euros = (t: string | null | undefined): number => Number((t ?? '').replace(/[\s  €]/g, '').replace('−', '-').replace(',', '.'));
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };
  const bas = () => container.querySelector('[data-bloc="bas-de-feuille"]') as HTMLElement;

  it('5 encadrés titrés, dans l’ordre : Résultat, CA par statut, avec / sans gestion, portefeuille, négociateur', async () => {
    await septembre();
    expect(bas().querySelector('h3')?.textContent).toBe('Résumé du mois — Septembre 2026');
    // 🔴 Arno (25/10/2026, répartition « A ») — deux colonnes indépendantes : à gauche Résultat puis CA par statut, à droite Portefeuille
    // puis Honoraires ; les négociateurs dessous, sur toute la largeur (hors des colonnes).
    const col = (c: string) => [...bas().querySelectorAll(`[data-colonne="${c}"] > [data-famille]`)].map((f) => [f.getAttribute('data-famille'), f.querySelector('h4')?.textContent]);
    expect(col('gauche')).toEqual([['resultat', 'Résultat du mois'], ['statuts', 'CA par statut du bien']]);
    expect(col('droite')).toEqual([['portefeuille', 'Portefeuille de gestion — septembre 2026 (honoraires de gestion HT)'], ['gestion', 'Honoraires avec / sans gestion']]);
    const negos = bas().querySelector('[data-famille="negociateurs"]')!;
    expect(negos.parentElement?.classList.contains('fdm-familles')).toBe(true);
    expect(negos.classList.contains('fdm-famille--large')).toBe(true);
    // 🔴 25/10/2026 (suite) — replié sur UNE ligne : le nom et le chevron, aucun montant.
    expect(nbsp(negos.querySelector('[data-deplier-negociateur]')?.textContent)).toBe('▸Négociateur — Jean-Baptiste PONS');
    // Au téléphone (une colonne) : Résultat, CA par statut, Portefeuille, Honoraires, Négociateurs — l'ordre CSS.
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx'), 'utf8');
    expect(css).toContain('.fdm-familles [data-famille="resultat"]{order:1} .fdm-familles [data-famille="statuts"]{order:2} .fdm-familles [data-famille="portefeuille"]{order:3}');
    expect(css).toContain('.fdm-familles [data-famille="gestion"]{order:4} .fdm-familles [data-famille="resultat-net"]{order:5} .fdm-familles [data-famille="negociateurs"]{order:6}');
    expect(css).toContain('.fdm-colonne{display:contents}');
    expect(css).toContain('.fdm-colonne{display:flex;flex-direction:column;gap:14px;min-width:0}');
    // 🔴 25/10/2026 (suite) — les deux colonnes finissent à la même hauteur (au bureau seulement) : le dernier bloc de chaque colonne
    // s'étire (la colonne la plus courte comble l'écart), le contenu reste en haut ; au téléphone, les colonnes n'existent pas (contents).
    const bureau = css.slice(css.indexOf('@media (min-width:900px){'), css.indexOf('.fdm-famille--large{grid-column:1 / -1}'));
    expect(bureau).toContain('.fdm-familles > .fdm-colonne{align-self:stretch}');
    expect(bureau).toContain('.fdm-colonne > .fdm-famille:last-child{flex:1 1 auto;justify-content:flex-start}');
    expect([...bas().querySelectorAll('.fdm-colonne > .fdm-famille:last-child')].map((f) => f.getAttribute('data-famille'))).toEqual(['statuts', 'gestion']);
    expect([...bas().querySelectorAll('[data-famille="resultat"] dt')].map((x) => x.textContent))
      .toEqual(['CA HT global', '− Commissions apporteurs externes', '− Commissions apporteurs internes', '− Rémunération des collègues sur leurs apporteurs', '= CA HT net']);
    expect([...bas().querySelectorAll('[data-statut-ca] .fdm-nature')].map((x) => x.textContent))
      .toEqual(['Nouvelle gestion', 'Relocation gestion', 'Nouveau sans gestion', 'Relocation sans gestion', 'À qualifier']);
  });

  it('les contrôles au centime : CA net = CA − apporteurs − collègues ; Σ statuts = CA ; avec + sans = CA ; dossiers comptés une fois', async () => {
    await septembre();
    const v = (k: string) => euros(bas().querySelector(`[data-total="${k}"]`)?.textContent);
    expect(Math.round((v('ca') - v('apporteurs-externes') - v('apporteurs-internes') - v('collegues')) * 100)).toBe(Math.round(v('ca-net') * 100));
    const ca = (sel: string) => [...bas().querySelectorAll(`${sel} [data-mot="CA HT"]`)].map((x) => euros(x.textContent));
    const statuts = ca('tbody [data-statut-ca]');
    expect(Math.abs(statuts.reduce((s, x) => s + x, 0) - v('ca'))).toBeLessThanOrEqual(0.05);
    expect(euros(bas().querySelector('[data-statut-ca="total"] [data-mot="CA HT"]')?.textContent)).toBe(v('ca'));
    expect(Math.round((v('avec') + v('sans')) * 100)).toBe(Math.round(v('ca') * 100));
    const nb = (sel: string) => [...bas().querySelectorAll(`${sel} [data-mot="Dossiers"]`)].map((x) => Number(x.textContent));
    expect(nb('tbody [data-statut-ca]').reduce((s, x) => s + x, 0)).toBe(17);
    expect(nb('tbody [data-gestion-ca]').reduce((s, x) => s + x, 0)).toBe(17);
  });

  it('portefeuille : gagnées, perdues, solde = gagnées − perdues (mensuel et annuel), coloré ; la mention « sans loyer » dans l’encadré', async () => {
    donnees = { ...donnees, gestionLignes: [
      { lotId: 7, libelle: '1 rue Fictive', proprietaire: 'DUPONT', effetLe: '2026-09-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 100, base: 'cc', tauxHt: 6 },
      { lotId: 8, libelle: '2 rue Fictive', proprietaire: 'DURAND', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
      { lotId: 9, libelle: '3 rue Fictive', proprietaire: 'MARTIN', effetLe: '2026-09-15', avant: 'location_seule', apres: 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null },
    ] };
    await septembre();
    const ligne = (k: string) => [...bas().querySelectorAll(`[data-portefeuille="${k}"] th, [data-portefeuille="${k}"] td`)].map((x) => nbsp(x.textContent));
    expect(ligne('gagnes')).toEqual(['Gagnées (entrées)', '2', '66,00 €', '792,00 €']);
    expect(ligne('perdus')).toEqual(['Perdues (sorties)', '1', '−40,00 €', '−480,00 €']);
    expect(ligne('solde')).toEqual(['Solde', '+1', '+26,00 €', '+312,00 €']);
    expect(bas().querySelector('[data-portefeuille="solde"]')?.classList.contains('tdb-signe--positif')).toBe(true);
    expect(bas().querySelector('[data-famille="portefeuille"] [data-portefeuille-mois] .fdm-pf-note')?.textContent).toBe('1 bien(s) sans loyer de départ saisi : non comptés (rien n’est inventé).');
  });

  it('🔴 RIEN NE DISPARAÎT : chaque chiffre de l’ancien bas de feuille est dans une famille', async () => {
    await septembre();
    const ou = (sel: string) => bas().querySelector(sel)?.closest('[data-famille]')?.getAttribute('data-famille');
    expect([ou('[data-total="ca"]'), ou('[data-total="apporteurs-externes"]'), ou('[data-total="apporteurs-internes"]'), ou('[data-total="collegues"]'), ou('[data-total="ca-net"]')])
      .toEqual(['resultat', 'resultat', 'resultat', 'resultat', 'resultat']);
    expect([ou('[data-total="avec"]'), ou('[data-total="sans"]')]).toEqual(['gestion', 'gestion']);
    expect(ou('[data-total="balance"]')).toBe('portefeuille');
    // 🔴 25/10/2026 — les rétrocessions : seulement si ≠ 0 (aucune en septembre). Le bloc du négociateur est replié : le déplier.
    await deplierNegos();
    expect([ou('[data-total="primes"]'), ou('[data-total-commission="Jean-Baptiste PONS"]'), ou('[data-base-negociateur="Jean-Baptiste PONS"]')])
      .toEqual(['negociateurs', 'negociateurs', 'negociateurs']);
    expect(bas().querySelector('[data-total="retrocessions"]')).toBeNull();
    expect(nbsp(bas().querySelector('[data-total="primes"]')?.textContent)).toBe('650,00 €');
    // Le TOTAL CA HT garde son clic (le détail des baux).
    expect(bas().querySelector('button[data-total="ca"]')).not.toBeNull();
  });

  it('🔒 Arno (25/10/2026) — un compte NON administrateur qui n’est pas négociateur du mois : le bloc Négociateur est ABSENT (ni bloc, ni mention)', async () => {
    donnees = { ...donnees, voirCommissions: false };
    await septembre();
    expect(bas().querySelector('[data-famille="negociateurs"]')).toBeNull();
    expect(bas().querySelector('[data-deplier-negociateur], [data-total-commission], [data-total="retrocessions"], [data-base-negociateur]')).toBeNull();
    expect(bas().textContent).not.toContain('Négociateur');
  });
});

describe('🔴 Arno (25/10/2026) — l’encadré « Négociateur » : le variable en cascade, un « i » par ligne', () => {
  const euros = (t: string | null | undefined): number => Math.round(Number((t ?? '').replace(/[\s  €]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); await deplierNegos(); };
  const cascade = () => container.querySelector('[data-cascade-negociateur="Jean-Baptiste PONS"]') as HTMLElement;
  const montant = (cle: string) => cascade().querySelector(`[data-cascade-ligne="${cle}"] .fnc-montant`)?.textContent;
  const info = async (cle: string) => { await act(async () => { (cascade().querySelector(`[data-cascade-info="${cle}"]`) as HTMLButtonElement).click(); }); };
  const detail = () => [...cascade().querySelectorAll('[data-cascade-detail]')].map((e) => [e.getAttribute('data-cascade-detail'), nbsp(e.textContent)]);

  it('une ligne = une opération ; la cascade retombe au centime sur le variable affiché ; pas de rétrocession à 0', async () => {
    await septembre();
    expect([...cascade().querySelectorAll('[data-cascade-ligne]')].map((l) => l.getAttribute('data-cascade-ligne'))).toEqual(['ca', 'commissions', 'net', 'taux', 'resultat', 'primes', 'variable']);
    expect(nbsp(cascade().querySelector('[data-cascade-ligne="taux"] .fnc-mot')?.textContent)).toBe('Taux commercial');
    expect(nbsp(montant('taux'))).toBe('15 %');
    expect(nbsp(cascade().querySelector('[data-cascade-ligne="variable"] .fnc-mot')?.textContent)).toBe('Variable HT dû — Septembre 2026');
    expect(euros(montant('net'))).toBe(euros(montant('ca')) - euros(montant('commissions')));
    expect(euros(montant('resultat')) + euros(montant('primes'))).toBe(euros(montant('variable')));
    expect(nbsp(montant('variable'))).toBe('2 670,42 €');
    expect(cascade().querySelector('[data-cascade-ligne="retrocessions"]')).toBeNull();
    expect(cascade().querySelector('[data-recurrents-non-deduits]')).toBeNull();
  });

  it('chaque « i » : l’opération avec les vrais chiffres et ses composants ; un seul ouvert ; second clic / Échap / clic ailleurs le referment', async () => {
    await septembre();
    await info('net');
    expect(detail()).toEqual([['net', `${nbsp(montant('ca'))} − ${nbsp(montant('commissions'))} = ${nbsp(montant('net'))}`]]);
    await info('commissions');
    expect(detail().map((d) => d[0])).toEqual(['commissions']);
    const com = cascade().querySelector('[data-cascade-detail="commissions"]')!;
    expect(nbsp(com.textContent)).toContain('apporteur Apporteur G · part location 933,00 €');
    expect(com.querySelectorAll('li').length).toBeGreaterThan(0);
    await info('commissions');
    expect(detail()).toEqual([]);
    await info('primes');
    expect([...cascade().querySelectorAll('[data-cascade-detail="primes"] li')].map((li) => nbsp(li.lastElementChild?.textContent)).reduce((s, x) => s + euros(x), 0)).toBe(euros(montant('primes')));
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(detail()).toEqual([]);
    await info('variable');
    expect(detail()).toEqual([['variable', `${nbsp(montant('resultat'))} + ${nbsp(montant('primes'))} = ${nbsp(montant('variable'))}`]]);
    await act(async () => { container.querySelector('[data-famille="resultat"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(detail()).toEqual([]);
  });

  it('une rétrocession ≠ 0 : sa ligne paraît, déduite ; la cascade tient toujours au centime', async () => {
    donnees = { ...donnees, retrocessions: [...donnees.retrocessions, { id: 99, negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-09-01', montant: 120.5, libelle: 'Avance sur variable' }] };
    await septembre();
    expect(nbsp(montant('retrocessions'))).toBe('120,50 €');
    expect(euros(montant('resultat')) + euros(montant('primes')) - euros(montant('retrocessions'))).toBe(euros(montant('variable')));
    await info('retrocessions');
    expect(nbsp(cascade().querySelector('[data-cascade-detail="retrocessions"]')?.textContent)).toContain('Avance sur variable');
  });

  it('🔒 non administrateur, sans cascade à lui : aucun variable, aucun bloc', async () => {
    donnees = { ...donnees, voirCommissions: false };
    await septembre();
    expect(container.querySelector('[data-cascade-negociateur]')).toBeNull();
    expect(container.querySelector('[data-total-commission]')).toBeNull();
    expect(container.querySelector('[data-famille="negociateurs"]')).toBeNull();
  });
});

describe('🔴 Arno (25/10/2026) — « Apporteurs du mois » : tous les apporteurs, le meilleur mis en avant', () => {
  it('septembre : le meilleur surligné et badgé ; plus de ligne « Sans apporteur » ; Total = les seules affaires d’apporteurs (au centime)', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const bloc = container.querySelector('[data-bloc="apporteurs-mois"]') as HTMLElement;
    const lignes = [...bloc.querySelectorAll('.fdm-apporteurs [data-apporteur-mois]')].map((l) => l.getAttribute('data-apporteur-mois'));
    // 🔴 Arno (26/10/2026, accord explicite) — la ligne « Sans apporteur » est retirée.
    expect(lignes).not.toContain('sans');
    expect(lignes.at(-1)).toBe('total');
    expect(bloc.textContent).not.toContain('Sans apporteur');
    const meilleurs = [...bloc.querySelectorAll('tr.fdm-meilleur')];
    expect(meilleurs.length).toBeGreaterThanOrEqual(1);
    expect(meilleurs[0].querySelector('[data-meilleur-apporteur]')?.textContent).toBe('Meilleur apporteur');
    expect(meilleurs[0]).toBe(bloc.querySelector('.fdm-apporteurs tbody tr'));
    // Le Total = la somme des lignes d'apporteurs (au centime), et non plus le CA HT global du mois (qui, lui, ne change pas).
    const euros = (t: string | null | undefined) => Math.round(Number(nbsp(t).replace(/[\s€]/g, '').replace(',', '.')) * 100);
    const lignesApp = [...bloc.querySelectorAll('.fdm-apporteurs tbody tr[data-apporteur-mois]')];
    const somme = lignesApp.reduce((t, l) => t + euros(l.querySelector('[data-mot="CA apporté"]')?.textContent), 0);
    expect(euros(bloc.querySelector('[data-total-apporteurs-ca]')?.textContent)).toBe(somme);
    const nbApp = lignesApp.reduce((t, l) => t + Number(l.querySelector('[data-mot="Affaires"]')?.textContent), 0);
    expect(Number(bloc.querySelector('[data-apporteur-mois="total"] [data-mot="Affaires"]')?.textContent)).toBe(nbApp);
    expect(nbApp).toBeLessThan(17);
    expect(nbsp(container.querySelector('[data-bloc="bas-de-feuille"] [data-total="ca"]')?.textContent)).toBe('15 471,70 €');
  });
  it('un mois sans aucun apporteur : « Aucun apporteur ce mois-ci », Total à zéro', async () => {
    donnees = { ...donnees, activites: donnees.activites.map((a) => ({ ...a, apporteurId: null, apporteurNom: null, origineContact: null, collegueId: null, collegueLibelle: null, commissionSaisie: 0 })) };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const bloc = container.querySelector('[data-bloc="apporteurs-mois"]') as HTMLElement;
    expect(bloc.querySelector('[data-aucun-apporteur]')?.textContent).toBe('Aucun apporteur ce mois-ci.');
    expect(bloc.querySelector('[data-apporteur-mois="total"] [data-mot="Affaires"]')?.textContent).toBe('0');
  });
});

describe('🔴 Arno (25/10/2026) — les collègues : UNE ligne chacun, le détail via / direct en petit sous le nom', () => {
  it('une ligne par collègue (ses totaux) ; le détail des seules origines présentes ; totaux = via + direct au centime ; les montants du détail ouvrent leurs dossiers', async () => {
    const sept = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09'));
    const viaA = sept.filter((a) => a.apporteurNom === 'Apporteur A');
    const sansApp = sept.filter((a) => a.apporteurNom === null && a.apporteurId === null);
    donnees = { ...donnees, activites: donnees.activites.map((a) => (viaA.includes(a) ? { ...a, apporteurId: 9 }
      : a === sansApp[0] ? { ...a, origineContact: 'collegue', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }
      : a === sansApp[1] ? { ...a, origineContact: 'collegue', collegueId: 7, collegueLibelle: 'Cédric Jullien' } : a)),
      apporteurs: [{ id: 9, nom: 'Apporteur A', type: 'partenaire', archive: false, baremes: [], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] }] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const euros = (t: string | null | undefined) => Math.round(Number(nbsp(t).replace(/[\s€]/g, '').replace(',', '.')) * 100);
    const aj = container.querySelector('tr[data-collegue-mois="Arnaud Jorel"]') as HTMLElement;
    expect(container.querySelectorAll('tr[data-collegue-mois="Arnaud Jorel"]')).toHaveLength(1);
    expect(container.querySelector('[data-collegue-part]')).toBeNull();
    // 🔴 Arno (25/10/2026, suite) — REPLIÉE au chargement : une ligne (les totaux, la mention en petit) et un chevron (deux origines).
    expect(aj.hasAttribute('data-deux-chemins')).toBe(false);
    expect(nbsp(aj.querySelector('[data-origines-collegue]')?.textContent)).toBe('via ses apporteurs et en direct');
    const totalReplie = euros(aj.querySelector('[data-mot="CA apporté"]')?.textContent);
    await act(async () => { (aj.querySelector('[data-deplier-collegue]') as HTMLButtonElement).click(); });
    expect(aj.querySelector('[data-deplier-collegue]')?.getAttribute('aria-expanded')).toBe('true');
    // DÉPLIÉE — deux chemins : dans chaque cellule, 3 valeurs empilées (via, direct, total), alignées d'une colonne à l'autre.
    expect(aj.hasAttribute('data-deux-chemins')).toBe(true);
    const pile = (mot: string) => [...aj.querySelectorAll(`[data-mot="${mot}"] [data-pile]`)].map((e) => [e.getAttribute('data-pile'), nbsp(e.textContent)]);
    expect(pile('Affaires').map((x) => x[0])).toEqual(['via', 'direct', 'total']);
    expect(pile('CA apporté').map((x) => x[0])).toEqual(['via', 'direct', 'total']);
    expect(pile('Hono. d’apporteur').map((x) => x[0])).toEqual(['via', 'direct', 'total']);
    // Un seul apporteur dans « via » : pas de sous-ligne, son nom en petit après « via ses apporteurs ».
    expect([...aj.querySelectorAll('th [data-pile]')].map((e) => nbsp(e.textContent))).toEqual(['via ses apporteurs · Apporteur A', 'en direct', 'Total']);
    // Les mêmes emplacements (le nom, puis via, direct, total) dans CHAQUE cellule : les lignes s'alignent.
    for (const cell of aj.querySelectorAll('th, td')) {
      expect([...cell.querySelectorAll('.fdm-pile-l')].map((e) => e.className.replace('fdm-pile-l ', ''))).toEqual(['fdm-pile-l--nom', 'fdm-pile-l--detail', 'fdm-pile-l--detail', 'fdm-pile-l--total']);
    }
    const [v, d, t] = pile('CA apporté').map((x) => euros(x[1]));
    expect(t).toBe(v + d);
    expect(t).toBe(totalReplie);
    const [nv, nd, nt] = pile('Affaires').map((x) => Number(x[1]));
    expect(nt).toBe(nv + nd);
    // Cliquables : nombre et CA de chaque origine, et le total.
    expect([...aj.querySelectorAll('button[data-detail-origine]')].map((b) => b.getAttribute('data-detail-origine')))
      .toEqual(['via-nb', 'direct-nb', 'total-nb', 'via-ca', 'direct-ca', 'total-ca']);
    // UN seul chemin : inchangé (une ligne de chiffres, la mention en petit).
    const cj = container.querySelector('tr[data-collegue-mois="Cédric Jullien"]') as HTMLElement;
    expect(cj.querySelector('[data-pile]')).toBeNull();
    expect(cj.querySelector('[data-deplier-collegue]')).toBeNull();
    expect(nbsp(cj.querySelector('[data-origines-collegue]')?.textContent)).toBe('en direct');
    expect(cj.querySelector('[data-mot="Affaires"] button')?.textContent).toBe('1');
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx'), 'utf8');
    expect(css).toContain('.fdm-pile-l--detail{height:1.3rem;');
    expect(css).toContain('.fdm-pile-l--total{height:1.7rem;');
    expect(aj.querySelector('[data-meilleur-collegue]')?.textContent).toBe('Meilleur collègue');
    // Le Total du tableau : la somme des collègues.
    const tot = euros(container.querySelector('[data-total-collegues-ca]')?.textContent);
    expect(tot).toBe([...container.querySelectorAll('tr[data-collegue-mois]:not([data-collegue-mois="total"]) [data-mot="CA apporté"]')]
      .reduce((s2, e) => s2 + euros((e.querySelector('[data-pile="total"]') ?? e).textContent), 0));
  });
});

describe('🔴 Arno (25/10/2026) — les collègues dépliables, apporteur par apporteur', () => {
  it('repliée au chargement ; dès deux apporteurs une sous-ligne chacun (CA décroissant) ; un clic sur la ligne déplie, un montant non ; égalités au centime', async () => {
    const sept = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09'));
    const viaA = sept.filter((a) => a.apporteurNom === 'Apporteur A');
    expect(viaA.length).toBeGreaterThanOrEqual(2);
    const col = [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }];
    donnees = { ...donnees, annuaire: true, activites: donnees.activites.map((a) => (a === viaA[0] ? { ...a, apporteurId: 10, apporteurNom: 'Apporteur B' } : viaA.includes(a) ? { ...a, apporteurId: 9 } : a)),
      apporteurs: [{ id: 9, nom: 'Apporteur A', type: 'partenaire', archive: false, baremes: [], collegues: col },
        { id: 10, nom: 'Apporteur B', type: 'partenaire', archive: false, baremes: [], collegues: col }] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const euros = (t: string | null | undefined) => Math.round(Number(nbsp(t).replace(/[\s€]/g, '').replace(',', '.')) * 100);
    const aj = () => container.querySelector('tr[data-collegue-mois="Arnaud Jorel"]') as HTMLElement;
    const totalTableau = euros(container.querySelector('[data-total-collegues-ca]')?.textContent);
    // Repliée : une ligne, la mention, le chevron ▸ (aria-expanded=false).
    expect(aj().hasAttribute('data-collegue-deplie')).toBe(false);
    expect(nbsp(aj().querySelector('[data-origines-collegue]')?.textContent)).toBe('via ses apporteurs');
    const chevron = aj().querySelector('button[data-deplier-collegue]') as HTMLButtonElement;
    expect([chevron.getAttribute('aria-expanded'), chevron.textContent]).toEqual(['false', '▸']);
    // Un montant cliquable ne déplie pas la ligne.
    await act(async () => { (aj().querySelector('[data-mot="Affaires"] button') as HTMLButtonElement).click(); });
    expect(aj().hasAttribute('data-collegue-deplie')).toBe(false);
    // Un clic sur la ligne (le nom) la déplie.
    await act(async () => { (aj().querySelector('th') as HTMLElement).click(); });
    expect(aj().hasAttribute('data-collegue-deplie')).toBe(true);
    expect(aj().querySelector('button[data-deplier-collegue]')?.textContent).toBe('▾');
    const ca = [...aj().querySelectorAll('[data-mot="CA apporté"] [data-pile]')].map((e) => [e.getAttribute('data-pile'), euros(e.textContent)] as [string, number]);
    // 🔴 Une seule origine : pas de sous-total « via » (il répéterait le Total) — les apporteurs puis le Total.
    expect(ca.map((x) => x[0])).toEqual(['apporteur', 'apporteur', 'total']);
    expect(aj().querySelector('[data-pile="via"]')).toBeNull();
    const mots = [...aj().querySelectorAll('th [data-pile="apporteur"]')].map((e) => nbsp(e.textContent));
    expect(mots.length).toBe(2);
    expect(ca[0][1]).toBeGreaterThanOrEqual(ca[1][1]);
    expect(ca[2][1]).toBe(ca[0][1] + ca[1][1]);
    // Les mêmes emplacements dans CHAQUE cellule : les lignes s'alignent.
    for (const cell of aj().querySelectorAll('th, td')) expect(cell.querySelectorAll('.fdm-pile-l').length).toBe(4);
    // Le Total du tableau ne bouge pas au dépliage.
    expect(euros(container.querySelector('[data-total-collegues-ca]')?.textContent)).toBe(totalTableau);
    // Le chevron replie (Entrée / Espace : c'est un vrai bouton).
    expect(chevron.tagName).toBe('BUTTON');
    await act(async () => { (aj().querySelector('button[data-deplier-collegue]') as HTMLButtonElement).click(); });
    expect(aj().hasAttribute('data-collegue-deplie')).toBe(false);
  });
});

describe('🔴 Arno (25/10/2026) — le titre du Portefeuille porte le mois, sur UNE ligne', () => {
  it('« Portefeuille de gestion — <mois année> (honoraires de gestion HT) » ; jamais de retour à la ligne ni de troncature, plancher 13 px', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="6"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-titre-portefeuille]')?.textContent).toBe('Portefeuille de gestion — juin 2026 (honoraires de gestion HT)');
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx'), 'utf8');
    // 🔴 25/10/2026 — la taille du titre est PARTAGÉE avec le sous-titre « Depuis le 1er janvier » (une seule règle) ; le titre reste sur une ligne.
    expect(css).toContain('.fdm-famille > h4.fdm-titre-une-ligne,.fdm-titre-bloc.fdm-titre-taille{font-size:clamp(13px, calc(100cqi / (var(--lettres) * .46)), .95rem)}');
    expect(css).toContain('.fdm-famille > h4.fdm-titre-une-ligne{white-space:nowrap;overflow:visible}');
    expect(css).toContain('.fdm-famille > h4,.fdm-titre-bloc{margin:0;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}');
    expect(container.querySelector('[data-sous-titre-portefeuille]')?.className).toBe('fdm-titre-bloc fdm-titre-taille');
    expect((container.querySelector('[data-famille="portefeuille"]') as HTMLElement).style.getPropertyValue('--lettres')).toBe('62');
    expect((container.querySelector('[data-titre-portefeuille]') as HTMLElement).style.getPropertyValue('--lettres')).toBe('62');
    expect(css).not.toMatch(/fdm-titre-une-ligne\{[^}]*(ellipsis|overflow:hidden)/);
  });
});

describe('🔴 Arno (25/10/2026) — Portefeuille de gestion : « Depuis le 1er janvier »', () => {
  it('sous le Solde du mois : entrées, sorties, solde mensuel cumulés (chaque gain compté une fois) ; un montant ouvre la liste des biens', async () => {
    donnees = { ...donnees, gestionLignes: [
      { lotId: 7, libelle: '1 rue Fictive', proprietaire: 'DUPONT', effetLe: '2026-01-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1500, provisions: 0, base: 'hc', tauxHt: 10 },
      { lotId: 8, libelle: '2 rue Fictive', proprietaire: 'DURAND', effetLe: '2026-02-03', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 0, base: 'hc', tauxHt: 10 },
      { lotId: 9, libelle: '3 rue Fictive', proprietaire: 'MARTIN', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
      { lotId: 10, libelle: '4 rue Fictive', proprietaire: 'LEROY', effetLe: '2026-05-30', avant: 'location_seule', apres: 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null },
    ] };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const c = container.querySelector('[data-famille="portefeuille"] [data-portefeuille-cumul]') as HTMLElement;
    expect(c.querySelector('.fdm-cumul-titre')?.textContent).toBe('Depuis le 1er janvier 2026');
    const ligne = (k: string) => [...c.querySelectorAll(`[data-cumul="${k}"] th, [data-cumul="${k}"] td`)].map((x) => nbsp(x.textContent));
    expect(ligne('entrees')).toEqual(['Gestions entrées', '3', '250,00 €', '3 000,00 €']);
    expect(ligne('sorties')).toEqual(['Gestions sorties', '1', '−40,00 €', '−480,00 €']);
    expect(ligne('solde')).toEqual(['Solde mensuel', '+2', '+210,00 €', '+2 520,00 €']);
    expect(c.querySelector('[data-cumul="solde"]')?.classList.contains('tdb-signe--positif')).toBe(true);
    expect(c.querySelector('[data-cumul-sans-loyer]')?.textContent).toBe('1 bien(s) sans loyer de départ saisi depuis le 1er janvier : non comptés.');
    await act(async () => { (c.querySelector('[data-cumul="entrees"] button') as HTMLButtonElement).click(); });
    expect([...container.querySelectorAll('[data-famille="portefeuille"] [data-cumul-biens="entrees"] li')].map((li) => nbsp(li.textContent)))
      .toEqual(['1 rue FictiveJanvier 2026150,00 € / mois', '2 rue FictiveFévrier 2026100,00 € / mois', '4 rue FictiveMai 2026sans loyer — non compté']);
  });
});

describe('🔴 Arno (25/10/2026) — Portefeuille : une seule grille de colonnes pour le mois et « Depuis le 1er janvier »', () => {
  it('un seul tableau, deux groupes de lignes, mêmes en-têtes ; le Solde du haut dans ses colonnes', async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); });
    const pf = container.querySelector('[data-famille="portefeuille"]') as HTMLElement;
    expect(pf.querySelectorAll('table')).toHaveLength(1);
    const table = pf.querySelector('table.fdm-portefeuille')!;
    expect(table.querySelectorAll('col')).toHaveLength(4);
    expect([...table.querySelectorAll('thead th')].map((x) => x.textContent)).toEqual(['Gestions', 'Biens', '/ mois', '/ an']);
    expect([...table.querySelectorAll('[data-portefeuille-cumul] tr.fdm-pf-entetes th')].map((x) => x.textContent)).toEqual(['Gestions', 'Biens', '/ mois', '/ an']);
    // 🔴 25/10/2026 (427) — « Nouvelles GLI » sous le Solde, dans la même grille, en haut et en bas.
    expect([...table.querySelectorAll('[data-portefeuille-mois] tr[data-portefeuille] th')].map((x) => x.textContent)).toEqual(['Gagnées (entrées)', 'Perdues (sorties)', 'Solde', 'Nouvelles GLI']);
    expect([...table.querySelectorAll('[data-portefeuille-cumul] tr[data-cumul] th')].map((x) => x.textContent)).toEqual(['Gestions entrées', 'Gestions sorties', 'Solde mensuel', 'Nouvelles GLI']);
    // Chaque ligne de chiffres a ses 4 cellules (le Solde du haut aussi : plus de cellule fusionnée).
    for (const tr of table.querySelectorAll('tr[data-portefeuille], tr[data-cumul]')) expect(tr.children).toHaveLength(4);
    expect(table.querySelector('[data-portefeuille="solde"] [colspan]')).toBeNull();
  });
});

describe('🔴 Arno (25/10/2026, 427) — Portefeuille : « Nouvelles GLI » (loyer CC × marge GLI à leur date)', () => {
  const gli = (bailId: number, date: string, loyerHc: number | null, provisions: number | null) =>
    ({ bailId, activiteId: null, lotId: bailId, bien: `${bailId} rue Fictive`, locataire: `Locataire ${bailId}`, date, loyerHc, provisions });
  beforeEach(() => {
    donnees = { ...donnees,
      margesGli: [{ depuis: '2026-01-01', marge: 2.5 }, { depuis: '2026-09-15', marge: 3 }],
      gli: [gli(1, '2026-03-04', 1000, 100), gli(2, '2026-09-02', 1234.56, 85.44), gli(3, '2026-09-20', 800, 50), gli(4, '2026-09-25', null, 30), gli(5, '2026-10-01', 900, 0)] };
  });
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };
  const cellules = (sel: string) => [...container.querySelectorAll(`[data-famille="portefeuille"] ${sel} > *`)].map((x) => nbsp(x.textContent));

  it('le mois : sous le Solde, même grille ; nombre, gain / mois = Σ loyer CC × marge à SA date, / an = × 12 ; la mention des GLI sans loyer', async () => {
    await septembre();
    // 2 : (1 234,56 + 85,44) × 2,5 % = 33,00 (avant le 15/09) ; 3 : 850 × 3 % = 25,50 ; 4 : sans loyer CC.
    expect(cellules('[data-portefeuille="gli"]')).toEqual(['Nouvelles GLI', '3', '58,50 €', '702,00 €']);
    expect(container.querySelector('[data-gli-sans-loyer="mois"]')?.textContent).toBe('1 GLI sans loyer charges comprises : non comptées');
    // Sous le Solde (après lui dans le même groupe de lignes) ; 4 cellules, aux colonnes Biens · / mois · / an.
    const rangs = [...container.querySelectorAll('[data-portefeuille-mois] tr')].map((t) => t.getAttribute('data-portefeuille'));
    expect(rangs.indexOf('gli')).toBeGreaterThan(rangs.indexOf('solde'));
    expect([...container.querySelectorAll('[data-portefeuille="gli"] td')].map((x) => x.getAttribute('data-mot'))).toEqual(['Biens', '/ mois', '/ an']);
  });

  it('« Depuis le 1er janvier » : chaque GLI UNE fois (mars 27,50 + septembre 58,50 = 86,00), rien d’octobre', async () => {
    await septembre();
    expect(cellules('[data-cumul="gli"]')).toEqual(['Nouvelles GLI', '4', '86,00 €', '1 032,00 €']);
    expect(container.querySelector('[data-gli-sans-loyer="cumul"]')?.textContent).toBe('1 GLI sans loyer charges comprises : non comptées');
  });

  it('un montant ouvre la liste (bail, locataire, loyer CC, marge, gain / mois) ; un second clic la referme', async () => {
    await septembre();
    const bouton = container.querySelector('[data-gli-ouvrir="mois"]') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { bouton.click(); });
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    expect([...container.querySelectorAll('[data-gli-liste] li')].map((li) => nbsp(li.textContent))).toEqual([
      '2 rue FictiveLocataire 2 · GLI du 02/09/20261 320,00 € CC × 2,5 % = 33,00 € / mois',
      '3 rue FictiveLocataire 3 · GLI du 20/09/2026850,00 € CC × 3 % = 25,50 € / mois',
      '4 rue FictiveLocataire 4 · GLI du 25/09/2026sans loyer CC — non comptée']);
    expect(container.querySelector('[data-gli-bail="2"] a')?.getAttribute('href')).toBe('/admin/location/bien/2');
    await act(async () => { (container.querySelector('[data-gli-ouvrir-an="cumul"]') as HTMLButtonElement).click(); });
    expect(container.querySelectorAll('[data-gli-liste] li')).toHaveLength(4);
    await act(async () => { (container.querySelector('[data-gli-ouvrir="cumul"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-gli-liste]')).toBeNull();
  });

  it('visible sans le droit « Voir les commissions » (comme le Portefeuille)', async () => {
    donnees = { ...donnees, voirCommissions: false };
    await septembre();
    expect(cellules('[data-portefeuille="gli"]')).toEqual(['Nouvelles GLI', '3', '58,50 €', '702,00 €']);
  });
});

describe('🔴 Arno (25/10/2026) — « Résultat net de l’agence » : après les 4 blocs, avant le Négociateur, pleine largeur', () => {
  const cent = (t: string | null | undefined): number => Math.round(Number(nbsp(t).replace(/[\s€]/g, '').replace('−', '-').replace(',', '.')) * 100);
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };

  it('placé entre les colonnes et le Négociateur, sur toute la largeur ; titre avec le mois', async () => {
    await septembre();
    const familles = container.querySelector('.fdm-familles') as HTMLElement;
    expect([...familles.children].map((e) => e.getAttribute('data-colonne') ?? e.getAttribute('data-famille'))).toEqual(['gauche', 'droite', 'resultat-net', 'negociateurs']);
    const bloc = familles.querySelector('[data-famille="resultat-net"]') as HTMLElement;
    expect(bloc.classList.contains('fdm-famille--large')).toBe(true);
    expect(bloc.querySelector('h4 .tdb-replie-mot')?.textContent).toBe('Résultat net de l’agence — Septembre 2026');
    await deplierNet();
    expect([...bloc.querySelectorAll('[data-net-ligne] .fnc-mot')].map((e) => e.textContent))
      .toEqual(['CA HT global', 'Commissions apporteurs externes (sans accès à l’interface)', 'Commissions apporteurs internes (collègues qui apportent en direct)',
        'Rémunération des collègues sur leurs apporteurs (rattachement rémunéré)', 'Variable des négociateurs', 'CA net de toutes variables']);
  });

  it('les montants sont ceux des autres blocs ; net = CA − apporteurs − collègues − variables au centime ; sa part du CA', async () => {
    await septembre();
    await deplierNet();
    const bloc = container.querySelector('[data-famille="resultat-net"]') as HTMLElement;
    const v = (sel: string) => cent(bloc.querySelector(sel)?.textContent);
    const ailleurs = (sel: string) => cent(container.querySelector(`[data-famille="resultat"] ${sel}`)?.textContent);
    expect(v('[data-net="ca"]')).toBe(ailleurs('[data-total="ca"]'));
    expect(v('[data-net="externes"]')).toBe(ailleurs('[data-total="apporteurs-externes"]'));
    expect(v('[data-net="internes"]')).toBe(ailleurs('[data-total="apporteurs-internes"]'));
    expect(v('[data-net="collegues"]')).toBe(ailleurs('[data-total="collegues"]'));
    await deplierNegos();
    const variables = [...container.querySelectorAll('[data-famille="negociateurs"] [data-total-commission]')].map((e) => cent(e.textContent));
    expect(variables.length).toBeGreaterThan(0);
    expect(v('[data-net-variable]')).toBe(variables.reduce((s, x) => s + x, 0));
    expect(v('[data-net="net"]')).toBe(v('[data-net="ca"]') - v('[data-net="externes"]') - v('[data-net="internes"]') - v('[data-net="collegues"]') - v('[data-net-variable]'));
    const part = (v('[data-net="net"]') / v('[data-net="ca"]')) * 100;
    expect(nbsp(bloc.querySelector('[data-net-part]')?.textContent)).toBe(`soit ${part.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/ | /g, ' ')} % du CA HT global`);
    // Le « i » du net : l'opération avec les vrais chiffres.
    await act(async () => { (bloc.querySelector('[data-cascade-info="net"]') as HTMLButtonElement).click(); });
    expect(nbsp(bloc.querySelector('[data-cascade-detail="net"]')?.textContent)).toContain(`= ${nbsp(bloc.querySelector('[data-net="net"]')?.textContent)}`);
  });

  it('🔴 26/10/2026 (428) — un compte SANS « Accès au Résultat net » : le bloc est ABSENT (ni version tronquée, ni mention)', async () => {
    donnees = { ...donnees, voirCommissions: false, voirResultatNet: false, regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [] };
    await septembre();
    expect(container.querySelector('[data-famille="resultat-net"]')).toBeNull();
    expect(container.querySelector('[data-net-sans-droit]')).toBeNull();
    expect(container.textContent).not.toContain('Résultat net de l’agence');
  });

  it('🔴 26/10/2026 (428) — un collaborateur avec Location + « Oui » : le bloc EN ENTIER (commissions, variable, net, %), au centime de l’administrateur', async () => {
    await septembre();
    const lire = () => {
      const b = container.querySelector('[data-famille="resultat-net"]') as HTMLElement;
      if (b.querySelector('[data-deplier="resultat-net"]')?.getAttribute('aria-expanded') === 'false') act(() => { (b.querySelector('[data-deplier="resultat-net"]') as HTMLButtonElement).click(); });
      return [...b.querySelectorAll('[data-net-ligne]')].map((l) => `${l.getAttribute('data-net-ligne')}=${nbsp(l.querySelector('.fnc-montant')?.textContent)}`);
    };
    const admin = lire();
    expect(admin.some((x) => x.startsWith('net='))).toBe(true);
    act(() => { root.unmount(); }); root = createRoot(container);
    // Ce que le serveur envoie à ce compte : les taux à zéro et aucune rétrocession pour TOUS les blocs, et — à part — le taux réel et les
    // rétrocessions, pour ce seul bloc (`ctxResultatNet`).
    donnees = { ...donnees, voirCommissions: false, voirResultatNet: true, ctxResultatNet: { regles: donnees.regles, retrocessions: donnees.retrocessions },
      regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [] };
    await septembre();
    expect(lire()).toEqual(admin);
    expect(container.querySelector('[data-net-sans-droit]')).toBeNull();
    // Les autres blocs gardent leurs règles : aucun bloc Négociateur (il n'est ni administrateur ni ce négociateur).
    expect(container.querySelector('[data-negociateur-bloc]')).toBeNull();
  });

  it('titre du Portefeuille : sous 430 px seulement, la fin passe à la ligne (plancher 13 px conservé)', async () => {
    await septembre();
    const t = container.querySelector('[data-titre-portefeuille]') as HTMLElement;
    expect(t.textContent).toBe('Portefeuille de gestion — septembre 2026 (honoraires de gestion HT)');
    expect(t.querySelector('.fdm-titre-suite')?.textContent).toBe('(honoraires de gestion HT)');
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx'), 'utf8');
    expect(css).toContain('@media (max-width:430px){\n  .fdm-famille > h4.fdm-titre-une-ligne,.fdm-titre-bloc.fdm-titre-taille{font-size:clamp(13px, calc(100cqi / (var(--lettres-ligne) * .46)), .95rem)}\n  .fdm-titre-une-ligne .fdm-titre-suite{display:block}\n}');
  });
});

describe('🔴 Arno (25/10/2026) — Suivi annuel : le « Résumé de la période » (le Résumé du mois, sur la période Début / Fin)', () => {
  const resume = () => container.querySelector('[data-bloc="resume-periode"]') as HTMLElement;
  const montant = (sel: string) => nbsp(resume().querySelector(sel)?.textContent);
  const choisirFiltre = async (filtre: string, v: string) => {
    await act(async () => { (container.querySelector(`[data-filtre="${filtre}"]`) as HTMLElement).click(); });
    await act(async () => { (container.querySelector(`[data-filtre="${filtre}"]`)!.closest('.lch')!.querySelector(`li[data-option="${v}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await calmer();
  };

  it('juste sous « Année par année », avant « Les négociateurs » (à la place du cumul) ; « Résumé de la période — Origine → aujourd’hui (…) » ; les mêmes familles que le mois', async () => {
    await monter('annee');
    const blocs = [...container.querySelectorAll('[data-section="H"], [data-bloc="resume-periode"], [data-section="F"]')].map((e) => e.getAttribute('data-section') ?? e.getAttribute('data-bloc'));
    expect(blocs).toEqual(['H', 'resume-periode', 'F']);
    expect(resume().querySelector('h3')?.textContent).toBe('Résumé de la période — Origine → aujourd’hui (2025 → 22/10/2026)');
    expect([...resume().querySelectorAll('[data-famille]')].map((e) => e.getAttribute('data-famille'))).toEqual(['resultat', 'statuts', 'portefeuille', 'gestion', 'resultat-net', 'negociateurs']);
    expect(resume().querySelector('#fra-f1')?.textContent).toBe('Résultat de la période');
    expect(resume().querySelector('[data-titre-portefeuille]')?.textContent).toBe('Portefeuille de gestion — Origine → aujourd’hui (2025 → 22/10/2026) (honoraires de gestion HT)');
    // « Depuis le début » = depuis le Début choisi.
    expect(resume().querySelector('[data-sous-titre-portefeuille]')?.textContent).toBe('Depuis le début (2025)');
    expect(resume().querySelector('[data-sous-titre-portefeuille]')?.className).toBe('fdm-titre-bloc fdm-titre-taille');
    expect(resume().querySelector('[data-famille="resultat-net"] h4 .tdb-replie-mot')?.textContent).toBe('Résultat net de l’agence — Origine → aujourd’hui (2025 → 22/10/2026)');
    expect(resume().querySelector('[data-filtres-actifs]')).toBeNull();
    // Le CA HT global = la tuile « CA HT » de la période (97 612,61 € = 94 612,61 + 3 000).
    expect(montant('[data-total="ca"]')).toBe('97 612,61 €');
    expect(montant('[data-total="ca"]')).toBe(nbsp(container.querySelector('[data-tuile="ca-annee"] .tdb-tuile-valeur')?.textContent));
  });

  it('2025 → 2025 : l’année seule ; « Depuis le début (2025) » ; le Négociateur replié', async () => {
    window.history.replaceState(null, '', '/?debut=2025&fin=2025');
    await monter('annee');
    expect(resume().querySelector('h3')?.textContent).toBe('Résumé de la période — 2025 → 2025');
    expect(resume().querySelector('[data-sous-titre-portefeuille]')?.textContent).toBe('Depuis le début (2025)');
    expect(resume().querySelector('[data-negociateur-bloc] [data-deplier-negociateur]')?.getAttribute('aria-expanded')).toBe('false');
    expect(montant('[data-total="ca"]')).toBe('3 000,00 €');
  });

  it('🔴 les FILTRES des tuiles : le résumé les suit, la mention les dit', async () => {
    await monter('annee');
    await choisirFiltre('gestion', 'avec');
    expect(resume().querySelector('[data-filtres-actifs]')?.textContent).toBe('Filtres actifs (comme les tuiles) : Avec gestion.');
    expect(montant('[data-total="ca"]')).toBe(nbsp(container.querySelector('[data-tuile="ca-annee"] .tdb-tuile-valeur')?.textContent));
    expect(montant('[data-gestion-ca="sans"] [data-total="sans"]')).toBe('0,00 €');
  });

  it('🔴 un collaborateur NON négociateur, sans « Accès au Résultat net » (428) : ni bloc Négociateur, ni bloc « Résultat net »', async () => {
    donnees = { ...donnees, voirCommissions: false, voirResultatNet: false, regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [] };
    await monter('annee');
    expect(resume().querySelector('[data-famille="negociateurs"]')).toBeNull();
    expect(resume().querySelector('[data-famille="resultat-net"]')).toBeNull();
    expect(resume().querySelector('[data-net-sans-droit]')).toBeNull();
  });

  it('🔴 Location + « Oui » (428) : le « Résumé de la période » porte le bloc entier, au centime de l’administrateur', async () => {
    await monter('annee');
    const net = () => nbsp(resume().querySelector('[data-famille="resultat-net"] [data-net-replie-montant]')?.textContent);
    const admin = net();
    expect(admin).toMatch(/€$/);
    act(() => { root.unmount(); }); root = createRoot(container);
    donnees = { ...donnees, voirCommissions: false, voirResultatNet: true, ctxResultatNet: { regles: donnees.regles, retrocessions: donnees.retrocessions },
      regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [] };
    await monter('annee');
    expect(net()).toBe(admin);
  });

  it('le Suivi du mois garde son « Résumé du mois » (même composant, mots du mois)', async () => {
    await monter('mois');
    expect(container.querySelector('[data-bloc="resume-periode"]')).toBeNull();
    expect(container.querySelector('[data-bloc="bas-de-feuille"] h3')?.textContent).toMatch(/^Résumé du mois — /);
    expect(container.querySelector('[data-bloc="bas-de-feuille"] [data-sous-titre-portefeuille]')?.textContent).toBe('Depuis le 1er janvier 2026');
  });
});

describe('🔴 Arno (25/10/2026) — le bloc Négociateur : replié, et visible seulement du négociateur concerné et des administrateurs', () => {
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };
  const bas = () => container.querySelector('[data-bloc="bas-de-feuille"]') as HTMLElement;

  it('administrateur : replié à chaque chargement (une ligne, aucun montant) ; le clic déplie la cascade, un second la replie', async () => {
    await septembre();
    const bouton = bas().querySelector('[data-deplier-negociateur="Jean-Baptiste PONS"]') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(bouton.tagName).toBe('BUTTON');
    expect(bas().querySelector('[data-cascade-negociateur]')).toBeNull();
    expect(bas().querySelector('[data-negociateur-bloc="Jean-Baptiste PONS"]')?.textContent).not.toMatch(/€/);
    await act(async () => { bouton.click(); });
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    expect(bas().querySelector('[data-cascade-negociateur="Jean-Baptiste PONS"] [data-total-commission]')).not.toBeNull();
    await act(async () => { bouton.click(); });
    expect(bas().querySelector('[data-cascade-negociateur]')).toBeNull();
    // Rechargé : de nouveau replié.
    act(() => { root.unmount(); }); root = createRoot(container);
    await septembre();
    expect(bas().querySelector('[data-deplier-negociateur]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('administrateur, plusieurs négociateurs : un bloc chacun ; le Résultat net montre le variable de chacun et le net', async () => {
    const sept = lignes2026.filter((a) => a.dateSignature.startsWith('2026-09'));
    donnees = { ...donnees, activites: donnees.activites.map((a) => (a === sept[0] ? { ...a, negociateurId: 9, negociateurLibelle: 'Cédric Jullien' } : a)) };
    await septembre();
    expect([...bas().querySelectorAll('[data-negociateur-bloc]')].map((e) => e.getAttribute('data-negociateur-bloc')).sort()).toEqual(['Cédric Jullien', 'Jean-Baptiste PONS']);
    await deplierNet();
    expect(bas().querySelectorAll('[data-famille="resultat-net"] [data-net-variable]')).toHaveLength(2);
    expect(bas().querySelector('[data-famille="resultat-net"] [data-net="net"]')).not.toBeNull();
  });

  it('un négociateur NON administrateur : SON bloc seulement (sa cascade, venue du serveur) ; sans « Accès au Résultat net » (428), pas de bloc « Résultat net »', async () => {
    // L'administrateur calcule la cascade de septembre ; le serveur l'envoie au seul négociateur, rien d'autre (ni taux, ni rétrocession).
    await septembre();
    await deplierNegos();
    const varAdmin = nbsp(bas().querySelector('[data-total-commission="Jean-Baptiste PONS"]')?.textContent);
    act(() => { root.unmount(); }); root = createRoot(container);
    const ctx = { regles: donnees.regles, apporteurs: donnees.apporteurs, retrocessions: donnees.retrocessions, aujourdhui: donnees.aujourdhui };
    const propres = variablesDuNegociateur(donnees.activites, ctx, 2026, 5);
    donnees = { ...donnees, voirCommissions: false, regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [], variablesPropres: propres };
    await septembre();
    expect([...bas().querySelectorAll('[data-negociateur-bloc]')].map((e) => e.getAttribute('data-negociateur-bloc'))).toEqual(['Jean-Baptiste PONS']);
    await deplierNegos();
    expect(nbsp(bas().querySelector('[data-total-commission="Jean-Baptiste PONS"]')?.textContent)).toBe(varAdmin);
    expect(bas().querySelector('[data-famille="resultat-net"]')).toBeNull();
  });
});

describe('🔴 Arno (25/10/2026) — l’écart : « +9 004,81 € (+139,2 %) », le pourcentage entre parenthèses ; sans base : « (—) »', () => {
  it('le format, le cas sans base, et le pire cas tient sur une ligne', async () => {
    const { ecartEtPct } = await import('./TableauBordSuivi');
    expect(nbsp(ecartEtPct('+9 004,81 €', 1.392))).toBe('+9 004,81 € (+139,2 %)');
    expect(nbsp(ecartEtPct('−123 456,78 €', -1))).toBe('−123 456,78 € (−100 %)');
    expect(nbsp(ecartEtPct('+12,00 €', null))).toBe('+12,00 € (—)');
    const css = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx'), 'utf8');
    expect(css).toContain('.tdb-a-ecart,.tdb-a-ecart-ligne{white-space:nowrap}');
    expect(css).not.toMatch(/ecartEur\([^)]*\)\} · \$\{signe/);
  });

  it('carte « Le mois » dépliée : chaque indicateur porte son écart « montant (%) » ; le nombre de baux « +n (%) »', async () => {
    await monter('mois');
    await deplierCarteMois();
    const ecart = (k: string) => nbsp(container.querySelector(`[data-ligne-a="${k}"] [data-mot="Écart"]`)?.textContent);
    expect(ecart('caProprietaire')).toMatch(/^[+−][\d ]+,\d\d € \(([+−][\d ]+,\d %|—)\)$/);
    expect(ecart('nb')).toMatch(/^[+−]\d+ \(([+−][\d ]+,\d %|—)\)$/);
  });
});

describe('🔴 Arno (25/10/2026, suite) — Suivi annuel vu par un négociateur NON administrateur : SA commission seulement', () => {
  it('section « Négociateur — JB » avec ses seules lignes ; historique avec sa commission ; rien de la commission globale', async () => {
    const ctx = { regles: donnees.regles, apporteurs: donnees.apporteurs, retrocessions: donnees.retrocessions, aujourdhui: donnees.aujourdhui };
    const propre = suiviDuNegociateur(donnees.activites, donnees.activites, ctx, 2026, 5)!;
    donnees = { ...donnees, voirCommissions: false, regles: donnees.regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions: [], negociateurPropre: propre,
      historique: [{ annee: 2025, nbBaux: 1, nb: 1, ca: 1000, caNet: 900, apporteurs: 100, commission: null }, { annee: 2026, nbBaux: 2, nb: 2, ca: 2000, caNet: 1800, apporteurs: 200, commission: null }] };
    window.history.replaceState(null, '', '/?annee=2026&mois=9');
    await monter('annee');
    const f = container.querySelector('[data-section="F"]') as HTMLElement;
    expect(f.querySelector('h3')?.textContent).toMatch(/^Négociateur — Jean-Baptiste PONS — /);
    await act(async () => { (f.querySelector('[data-deplier="F"]') as HTMLButtonElement).click(); });
    const lignesF = [...f.querySelectorAll('[data-negociateur-ligne]')].map((e) => e.getAttribute('data-negociateur-ligne')!.split('|')[0]);
    expect(lignesF.length).toBeGreaterThan(0);
    expect(new Set(lignesF)).toEqual(new Set(['Jean-Baptiste PONS']));
    expect(container.querySelector('[data-historique-annees] th:nth-of-type(6)')?.textContent).toBe('Commission brute — Jean-Baptiste PONS');
    expect(container.querySelector('[data-commission-propre="2026"]')?.textContent).not.toBe('—');
    expect(container.querySelector('[data-ligne-a="commission"]')).toBeNull();
  });
});

describe('🔴 Arno (25/10/2026, accord explicite) — Suivi annuel épuré : deux blocs retirés, négociateurs à la place du cumul, tableaux repliés', () => {
  const centimes = (t: string | null | undefined): number => Math.round(Number(nbsp(t).replace(/[^\d,-]/g, '').replace(',', '.')) * 100);
  const resumeDe = (k: string) => nbsp(container.querySelector(`[data-resume-replie="${k}"]`)?.textContent);
  const deplier = async (k: string) => { await act(async () => { (container.querySelector(`[data-deplier="${k}"]`) as HTMLButtonElement).click(); }); };

  it('« Le cumul … mois par mois » et « La gestion récurrente — 12 mois » (et sa commission récurrente) ont disparu ; le Suivi du mois ne change pas', async () => {
    await monter('annee');
    expect(container.querySelector('[data-section="B"]')).toBeNull();
    expect(container.querySelector('[data-section="D"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Le cumul de \d{4}, mois par mois/);
    expect(container.textContent).not.toContain('La gestion récurrente — 12 mois');
    expect(container.textContent).not.toContain('Commission récurrente sur la gestion — année par année');
    // Le cumul reste sous le bouton « Cumul » de « Année par année ».
    expect(container.querySelector('[data-section="H"] [aria-pressed]')).not.toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('mois');
    expect([...container.querySelectorAll('[data-section]')].map((x) => x.getAttribute('data-section'))).toEqual(['A']);
    expect(container.querySelector('[data-feuille-mois]')).not.toBeNull();
  });

  it('« Les négociateurs » À LA PLACE du cumul (juste après le Résumé de la période) ; négociateurs et apporteurs REPLIÉS par défaut, sur une ligne', async () => {
    await monter('annee');
    const ordre = [...container.querySelectorAll('[data-section], [data-bloc="resume-periode"]')].map((e) => e.getAttribute('data-section') ?? e.getAttribute('data-bloc'));
    expect(ordre).toEqual(['H', 'resume-periode', 'F', 'C', 'E', 'G']);
    for (const k of ['F', 'C']) {
      const s = container.querySelector(`[data-section="${k}"]`) as HTMLElement;
      expect(s.getAttribute('data-replie')).toBe('replie');
      expect(s.querySelector('table')).toBeNull();
      const b = s.querySelector(`[data-deplier="${k}"]`) as HTMLButtonElement;
      expect([b.tagName, b.getAttribute('aria-expanded'), b.closest('h3') !== null]).toEqual(['BUTTON', 'false', true]);   // un vrai bouton : Entrée / Espace
    }
    expect(nbsp(container.querySelector('[data-section="F"] h3')?.textContent)).toMatch(/^Les négociateurs — .+\d+ lignes? · commission brute [\d ]+,\d\d €▸$/);
    expect(nbsp(container.querySelector('[data-section="C"] h3')?.textContent)).toMatch(/^Les apporteurs — .+\d+ apporteurs? · CA apporté [\d ]+,\d\d €▸$/);
  });

  it('déplié au clic : le tableau d’avant, inchangé, dans un cadre à défilement interne (en-tête figé) ; replié à nouveau ; replié à chaque chargement', async () => {
    await monter('annee');
    await deplier('F');
    const f = container.querySelector('[data-section="F"]') as HTMLElement;
    expect(f.getAttribute('data-replie')).toBe('ouvert');
    expect(f.querySelector('[data-deplier="F"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(f.querySelector('[data-contenu-replie="F"]')?.className).toBe('tdb-h-cadre tdb-h-cadre--ouvert tdb-replie-cadre');
    expect([...f.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Négociateur', 'Mois', 'Baux', 'CA HT', 'Apporteurs', 'CA − apporteurs', 'Primes', 'Rétrocessions', 'Commission brute']);
    expect(f.textContent).toContain('Commission brute = taux × (CA HT − commissions des apporteurs)');
    await deplier('C');
    expect([...container.querySelectorAll('[data-section="C"] thead th')].map((t) => t.textContent)).toEqual(['Apporteur', 'Baux', 'CA apporté HT', 'Commissions', 'Reste à l’agence', 'Coût pour 1 € de CA']);
    await deplier('F');
    expect(f.querySelector('table')).toBeNull();
    act(() => { root.unmount(); }); root = createRoot(container);
    await monter('annee');
    expect(container.querySelector('[data-section="C"]')?.getAttribute('data-replie')).toBe('replie');
  });

  it('🔴 les totaux de la ligne repliée = les sommes du tableau, au centime', async () => {
    await monter('annee');
    await deplier('F');
    await deplier('C');
    const lignesF = [...container.querySelectorAll('[data-negociateur-ligne]')];
    const commission = lignesF.reduce((t, l) => t + centimes(l.querySelector('td[data-mot="Commission brute"]')?.textContent), 0);
    expect(resumeDe('F')).toBe(`${lignesF.length} ligne${lignesF.length > 1 ? 's' : ''} · commission brute ${nbsp(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(commission / 100))}`);
    const lignesC = [...container.querySelectorAll('[data-apporteur-ligne]')];
    expect(lignesC.length).toBeGreaterThan(0);
    const ca = lignesC.reduce((t, l) => t + centimes(l.querySelector('td[data-mot="CA apporté HT"]')?.textContent), 0);
    expect(centimes(resumeDe('C').split('CA apporté ')[1])).toBe(ca);
    expect(resumeDe('C')).toMatch(new RegExp(`^${lignesC.length} apporteurs? · `));
  });

  it('🔴 confidentialité : un collaborateur NON négociateur n’a pas le bloc des négociateurs (ni sa ligne repliée) ; les apporteurs, oui', async () => {
    donnees = { ...donnees, voirCommissions: false };
    await monter('annee');
    expect(container.querySelector('[data-section="F"]')).toBeNull();
    expect(container.textContent).not.toContain('commission brute');
    expect(container.querySelector('[data-section="C"]')?.getAttribute('data-replie')).toBe('replie');
  });
});

describe('🔴 Arno (26/10/2026) — « Résultat net de l’agence » REPLIÉ par défaut sur une ligne (Suivi du mois et Résumé de la période)', () => {
  const septembre = async () => { await monter('mois'); await act(async () => { (container.querySelector('[data-onglet-mois="9"]') as HTMLButtonElement).click(); }); };
  const bloc = () => container.querySelector('[data-famille="resultat-net"]') as HTMLElement;
  const bouton = () => bloc().querySelector('[data-deplier="resultat-net"]') as HTMLButtonElement;
  const cent = (t: string | null | undefined): number => Math.round(Number(nbsp(t).replace(/[^\d,-]/g, '').replace(',', '.')) * 100);

  for (const [ecran, ouvrir] of [['Suivi du mois', septembre], ['Résumé de la période', () => monter('annee')]] as const) {
    it(`${ecran} : replié (une ligne : titre ; « CA net de toutes variables », montant vert gras, « (x,x %) », ▸) ; la cascade n’est pas là`, async () => {
      await ouvrir();
      expect(bloc().getAttribute('data-replie')).toBe('replie');
      expect([bouton().tagName, bouton().getAttribute('aria-expanded'), bouton().closest('h4') !== null]).toEqual(['BUTTON', 'false', true]);   // un vrai bouton : Entrée / Espace
      expect(bloc().querySelector('[data-resultat-net]')).toBeNull();
      expect(nbsp(bloc().querySelector('[data-net-replie]')?.textContent)).toMatch(/^CA net de toutes variables [−-]?[\d ]+,\d\d € \(\d+,\d %\)$/);
      expect(bloc().querySelector('[data-net-replie-montant]')?.tagName).toBe('STRONG');
      expect(bouton().querySelector('.tdb-h-chevron')?.textContent).toBe('▸');
    });

    it(`${ecran} : déplié au clic, la cascade inchangée ; montant replié = ligne « CA net » au centime, % = « soit … % » ; un « i » ne replie rien ; second clic replie`, async () => {
      await ouvrir();
      const replie = cent(bloc().querySelector('[data-net-replie-montant]')?.textContent);
      const pct = nbsp(bloc().querySelector('[data-net-replie-part]')?.textContent);
      await act(async () => { bouton().click(); });
      expect([bloc().getAttribute('data-replie'), bouton().getAttribute('aria-expanded'), bouton().querySelector('.tdb-h-chevron')?.textContent]).toEqual(['ouvert', 'true', '▾']);
      expect(cent(bloc().querySelector('[data-net-ligne="net"] .fnc-montant')?.textContent)).toBe(replie);
      expect(nbsp(bloc().querySelector('[data-net-part]')?.textContent)).toBe(`soit ${pct.slice(1, -1)} du CA HT global`);
      // Un « i » de la cascade : il ouvre son détail, le bloc reste déplié.
      await act(async () => { (bloc().querySelector('[data-cascade-info="ca"]') as HTMLButtonElement).click(); });
      expect(bloc().querySelector('[data-cascade-detail="ca"]')).not.toBeNull();
      expect(bloc().getAttribute('data-replie')).toBe('ouvert');
      await act(async () => { bouton().click(); });
      expect(bloc().getAttribute('data-replie')).toBe('replie');
      expect(bloc().querySelector('[data-resultat-net]')).toBeNull();
    });
  }

  it('replié à CHAQUE chargement ; même composant que les autres blocs repliés (BlocReplie)', async () => {
    await septembre();
    await act(async () => { bouton().click(); });
    act(() => { root.unmount(); }); root = createRoot(container);
    await septembre();
    expect(bloc().getAttribute('data-replie')).toBe('replie');
    const src = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx'), 'utf8');
    expect(src).toContain("<BlocReplie id={`${idp}-f6`} section=\"resultat-net\"");
    expect(readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx'), 'utf8')).toContain("import { BlocReplie, CSS_BLOC_REPLIE } from './BlocReplie';");
  });
});

/**
 * 🔴 Arno (26/10/2026) — OUTILS DE SUIVI : UNE SEULE LIGNE PAR BIEN (lot principal + annexes rattachées). Le regroupement suit le LIEN
 * (une annexe à une autre adresse est regroupée), une annexe détachée garde sa ligne sans mention, les titres comptent les biens affichés,
 * et aucun montant ne change (la balance et le portefeuille sont les mêmes avec ou sans les liens).
 */
describe('🔴 une seule ligne par bien (lot principal + annexes)', () => {
  const lien = (id: number, parentId: number, parentAdresse: string, x: { categorie: string; porte: string; adresse: string }) => ({
    id, parentId, parentLibelle: `${parentAdresse}, Puteaux`, parentAdresse, parentCommune: 'Puteaux', etage: null, nature: null, typeBien: null, numLotCopro: null,
    commune: 'Puteaux', ...x });
  const ligne = (lotId: number, libelle: string, effetLe: string, sortie: boolean, loyerHc: number | null) => ({
    lotId, libelle, proprietaire: 'COHEN Samuel', effetLe, avant: sortie ? 'en_gestion' : 'location_seule', apres: sortie ? 'ancienne_gestion' : 'en_gestion',
    loyerHc, provisions: 0, base: 'hc' as const, tauxHt: loyerHc === null ? null : 5 });
  const LIGNES = [
    ligne(30, '1 Rue Louis Pouey, Puteaux', '2026-10-05', false, 1000), ligne(31, '1 Rue Louis Pouey, Puteaux', '2026-10-05', false, null),
    ligne(40, '12 Rue de l’Église, Puteaux', '2026-10-08', false, 1200), ligne(41, '3 Rue Autre, Puteaux', '2026-10-08', false, 100),
    ligne(50, '8 Rue Denfert, Puteaux', '2026-10-09', false, 300),
    ligne(60, '9 Rue Perdue, Puteaux', '2026-10-15', true, 800), ligne(61, '9 Rue Perdue, Puteaux', '2026-10-15', true, null),
  ];
  const LIENS = [
    lien(31, 30, '1 Rue Louis Pouey', { categorie: 'cave', porte: '56', adresse: '1 Rue Louis Pouey' }),
    lien(41, 40, '12 Rue de l’Église', { categorie: 'parking', porte: '12', adresse: '3 Rue Autre' }),
    lien(61, 60, '9 Rue Perdue', { categorie: 'cave', porte: '2', adresse: '9 Rue Perdue' }),
  ];
  const ouvrirOctobre = async (avecLiens: boolean, bascule: string | null = '2026-01-01') => {
    donnees = { ...donnees, gestionLignes: LIGNES, basculeAnnexes: bascule, annexes: [31, 41, 50, 61], ...(avecLiens ? { liensAnnexes: LIENS } : {}) };
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="10"]') as HTMLButtonElement).click(); });
    await calmer();
  };
  const rangees = (bloc: string) => [...container.querySelectorAll(`[data-bloc="${bloc}"] [data-ligne-gestion]`)] as HTMLElement[];
  const rangee = (bloc: string, id: number) => container.querySelector(`[data-bloc="${bloc}"] [data-ligne-gestion="${id}"]`) as HTMLElement;

  it('le lot principal et ses annexes sur UNE ligne, « + 1 annexe » après l’adresse ; une annexe à une AUTRE adresse est regroupée', async () => {
    await ouvrirOctobre(true);
    expect(rangees('nouvelles-gestions').map((r) => r.getAttribute('data-ligne-gestion'))).toEqual(['30', '40', '50']);
    const th = rangee('nouvelles-gestions', 30).querySelector('th')!;
    expect(th.querySelector('a')?.getAttribute('href')).toBe('/admin/location/bien/30');
    expect([nbsp(th.querySelector('a')?.textContent), th.querySelector('[data-annexes-declencheur]')?.textContent]).toEqual(['1 Rue Louis Pouey, Puteaux', '+ 1 annexe']);
    // L'annexe à « 3 Rue Autre » rejoint son lot principal : la bulle dit son type, sa place et SON adresse ; son montant est inclus dans la somme.
    const bulle40 = rangee('nouvelles-gestions', 40).querySelector('[data-annexes-bulle]')!;
    expect(nbsp(bulle40.textContent)).toContain('Parking · Place 12 · 3 Rue Autre, Puteaux');
    expect(nbsp(bulle40.textContent)).toContain('annexe non comptée');
    expect(nbsp(rangee('nouvelles-gestions', 40).textContent)).toContain('65,00 €780,00 €');
    // Même adresse que le lot principal : l'adresse n'est pas répétée.
    expect(nbsp(rangee('nouvelles-gestions', 30).querySelector('[data-annexes-bulle]')?.textContent)).toBe('Cave · N° 56 — annexe non comptée');
    expect(rangees('mandats-perdus').map((r) => r.getAttribute('data-ligne-gestion'))).toEqual(['60']);
  });

  it('une annexe DÉTACHÉE (bien autonome, pas dans les liens) garde sa ligne, sans aucune mention d’annexe', async () => {
    await ouvrirOctobre(true);
    const r = rangee('nouvelles-gestions', 50);
    expect(r.querySelector('[data-annexes-declencheur]')).toBeNull();
    expect(r.querySelector('[data-annexe-non-comptee]')).toBeNull();
    expect(nbsp(r.textContent)).not.toContain('annexe');
  });

  it('les titres comptent les BIENS affichés', async () => {
    await ouvrirOctobre(true);
    expect(container.querySelector('#fdm-gestions [data-compte-biens]')?.textContent).toBe('(3)');
    expect(container.querySelector('#fdm-perdus [data-compte-biens]')?.textContent).toBe('(1)');
  });

  it('la bulle s’ouvre au toucher et au clavier, se referme avec Échap ; pastille discrète, zone d’au moins 24 px', async () => {
    await ouvrirOctobre(true);
    const declencheur = rangee('nouvelles-gestions', 30).querySelector('[data-annexes-declencheur]') as HTMLButtonElement;
    const bulle = rangee('nouvelles-gestions', 30).querySelector('[data-annexes-bulle]')!;
    expect(bulle.hasAttribute('data-ouvert')).toBe(false);
    await act(async () => { declencheur.click(); });
    expect(bulle.hasAttribute('data-ouvert')).toBe(true);
    await act(async () => { declencheur.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(bulle.hasAttribute('data-ouvert')).toBe(false);
    await act(async () => { declencheur.blur(); declencheur.focus(); });
    expect(bulle.hasAttribute('data-ouvert')).toBe(true);
    const { CSS_BULLE_ANNEXES } = await import('./BulleAnnexes');
    const cssA = CSS_BULLE_ANNEXES.replace(/\s+/g, ' ');
    // 🔴 Arno (26/10/2026) — discrète : couleur secondaire, sans bord ni fond, alignée sur la ligne de base ; zone active ≥ 24 px.
    expect(cssA).toContain('min-height:24px');
    expect(cssA).toMatch(/\.anx-bulle-declencheur\{[^}]*border:0[^}]*background:none[^}]*color:var\(--color-svv-muted\)/);
    expect(cssA).toContain('vertical-align:baseline');
  });

  it('la fenêtre « Gestion » de la tuile : « Bien n° 30 + 1 annexe », le titre compte les biens, l’annexe reste nommée dans la bulle', async () => {
    donnees = { ...donnees, gestion: { disponible: true, stock: 120, transitions: [
      { lotId: 30, avant: 'location_seule', apres: 'en_gestion', effetLe: '2026-10-05' }, { lotId: 31, avant: 'location_seule', apres: 'en_gestion', effetLe: '2026-10-05' },
    ] } };
    // Sans bascule (avant la règle 426), l'annexe est un lot entré comme un autre : la liste l'aurait montré sur sa propre ligne.
    await ouvrirOctobre(true, null);
    await act(async () => { tuile('gestion').click(); });
    const fenetre = container.querySelector('[data-detail]')!;
    expect(nbsp(fenetre.querySelector('h4')?.textContent)).toBe('Entrés en gestion (1)');
    const li = fenetre.querySelector('[data-lot-bien="30"]')!;
    expect([li.querySelector('a')?.textContent, li.querySelector('[data-annexes-declencheur]')?.textContent]).toEqual(['Bien n° 30', '+ 1 annexe']);
    expect(nbsp(li.querySelector('[data-annexes-bulle]')?.textContent)).toContain('bien n° 31');
  });

  it('AUCUN montant ne change : honoraires, balance et portefeuille identiques avec ou sans le regroupement', async () => {
    const lire = () => ({
      balance: nbsp(container.querySelector('[data-total="balance"]')?.textContent), balanceAn: nbsp(container.querySelector('[data-total="balance-an"]')?.textContent),
      portefeuille: nbsp(container.querySelector('[data-famille="portefeuille"]')?.textContent?.replace(/\+ \d annexes?/g, '')),
      honoraires: rangees('nouvelles-gestions').reduce((s, r) => s + Number(nbsp(r.querySelector('td[data-mot="Honoraires / mois"]')?.textContent).replace(/[^\d,]/g, '').replace(',', '.') || 0), 0),
    });
    await ouvrirOctobre(false);
    const sans = lire();
    expect(rangees('nouvelles-gestions')).toHaveLength(5);   // sans les liens : une ligne par lot, comme avant
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrirOctobre(true);
    const avec = lire();
    expect(avec).toEqual(sans);
    expect(sans.balance).toBe('+90,00 €');   // (50 + 65 + 15) gagnés − 40 perdus
  });
});

describe('🔴 431 — décision B : un bien rentré vide sans locataire n’est pas compté (le bloc « En attente » est retiré, accord d’Arno)', () => {
  const ligne = (lotId: number, libelle: string, effetLe: string, loyerHc: number | null) => ({
    lotId, libelle, proprietaire: 'TEST Test', effetLe, avant: null, apres: 'en_gestion', loyerHc, provisions: 0, base: 'hc' as const, tauxHt: loyerHc === null ? null : 5 });
  const ouvrir = async (mois: string) => {
    donnees = { ...donnees, gestionLignes: [ligne(436, '25 Rue Henri Barbusse, GENNEVILLIERS', '2026-10-20', 579.63)],
      gestionEnAttente: [ligne(440, '12 Rue de l’Église, PARIS', '2026-10-26', null), ligne(442, '8 Rue Denfert - Rochereau, ASNIÈRES-SUR-SEINE', '2026-10-26', null)] };
    await monter('mois');
    await act(async () => { (container.querySelector(`[data-onglet-mois="${mois}"]`) as HTMLButtonElement).click(); });
    await calmer();
  };
  it('octobre : le bloc « En attente de locataire » est retiré (accord d’Arno) ; les deux biens restent hors des Nouvelles gestions et du titre', async () => {
    await ouvrir('10');
    expect(container.querySelector('[data-bloc="en-attente-locataire"]')).toBeNull();
    expect(nbsp(container.textContent)).not.toContain('En attente de locataire');
    // La règle ne change pas : ils ne sont pas comptés.
    expect(container.querySelector('#fdm-gestions [data-compte-biens]')?.textContent).toBe('(1)');
    expect([...container.querySelectorAll('[data-bloc="nouvelles-gestions"] [data-ligne-gestion]')].map((r) => r.getAttribute('data-ligne-gestion'))).toEqual(['436']);
  });
  it('un autre mois (septembre) : aucun bloc — un bien en attente ne se montre qu’au mois de son entrée en gestion', async () => {
    await ouvrir('9');
    expect(container.querySelector('[data-bloc="en-attente-locataire"]')).toBeNull();
  });
});

describe('🔴 Arno (26/10/2026) — corrections de la page « Suivi du mois »', () => {
  const ligneG = (lotId: number, libelle: string, effetLe: string, sortie: boolean) => ({ lotId, libelle, proprietaire: 'TEST Test', effetLe,
    avant: sortie ? 'en_gestion' : null, apres: sortie ? 'ancienne_gestion' : 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null });
  const octobre = async () => {
    await monter('mois');
    await act(async () => { (container.querySelector('[data-onglet-mois="10"]') as HTMLButtonElement).click(); });
    await calmer();
  };
  it('un bien sorti sans avoir été compté : bloc replié à part, absent des « Mandats de gestion perdus »', async () => {
    donnees = { ...donnees, gestionLignes: [], gestionSortiesNonComptees: [ligneG(440, '12 Rue de l’Église, PARIS', '2026-10-26', true), ligneG(442, '8 Rue Denfert-Rochereau, ASNIÈRES', '2026-10-26', true)] };
    await octobre();
    const bloc = container.querySelector('[data-bloc="sortis-non-comptes"]') as HTMLElement;
    expect(nbsp(bloc.querySelector('.tdb-replie-mot')?.textContent)).toBe('Sortis sans avoir été comptés (2)');
    expect(container.querySelector('#fdm-perdus [data-compte-biens]')?.textContent).toBe('(0)');
    await act(async () => { (bloc.querySelector('[data-deplier="sortis-non-comptes"]') as HTMLButtonElement).click(); });
    expect([...container.querySelectorAll('[data-sorti-non-compte]')].map((x) => x.getAttribute('data-sorti-non-compte'))).toEqual(['440', '442']);
  });
  it('« Résultat net de l’agence » : le triangle À GAUCHE du titre, comme les lignes « Négociateur »', async () => {
    await octobre();
    const ligne = container.querySelector('[data-famille="resultat-net"] .tdb-replie-ligne') as HTMLElement;
    expect(ligne.firstElementChild?.className).toBe('tdb-h-chevron tdb-h-chevron--gauche');
    expect(ligne.querySelectorAll('.tdb-h-chevron')).toHaveLength(1);
    // Ailleurs (blocs repliés sans l'option), le triangle reste à droite, comme avant.
    expect(readFileSync('app/(admin)/admin/(protected)/location/BlocReplie.tsx', 'utf8')).toContain("{!chevronAGauche && <span className=\"tdb-h-chevron\" aria-hidden=\"true\">");
  });
  it('« Négociateurs à rapprocher » (administrateur) : le libellé, son nombre de lignes, « Rattacher » au compte choisi', async () => {
    const posts: Record<string, unknown>[] = [];
    donnees = { ...donnees, negociateursARapprocher: { aRapprocher: [{ libelle: 'JB', nb: 3, candidats: [{ id: 5, nom: 'Jean-Baptiste PONS' }] }], rattaches: [{ libelle: 'J-B Pons', compte: 'Jean-Baptiste PONS' }], disponible: true } };
    global.fetch = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response; }
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await octobre();
    const bloc = container.querySelector('[data-bloc="negociateurs-a-rapprocher"]') as HTMLElement;
    expect(nbsp(bloc.querySelector('.tdb-replie-mot')?.textContent)).toBe('Négociateurs à rapprocher (1)');
    await act(async () => { (bloc.querySelector('[data-deplier="negociateurs-a-rapprocher"]') as HTMLButtonElement).click(); });
    expect(nbsp(container.querySelector('[data-negociateur-a-rapprocher="JB"]')?.textContent)).toContain('JB — 3 lignes');
    await choisirListe(container.querySelector('[data-compte-pour="JB"]')!, '5');
    await act(async () => { (container.querySelector('[data-rattacher-negociateur="JB"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'rattacher-negociateur', libelle: 'JB', compteId: 5 });
    await act(async () => { (container.querySelector('[data-detacher-negociateur="J-B Pons"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'detacher-negociateur', libelle: 'J-B Pons' });
  });
  it('« Convertir en « Mandat de gestion seul » » est DANS la rangée de « Dossier de location », « Modifier », les fiches', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8');
    const rangee = src.slice(src.indexOf('<div className="fdm-detail-gestes">'), src.indexOf('{edition === a.id && ('));
    expect(rangee).toContain('<ConversionMandat a={a} onFini={onRelire} />');
    expect(rangee.indexOf('<ConversionMandat')).toBeGreaterThan(rangee.indexOf('data-fiche-bien'));
    expect(src).toContain('.fdm-detail-gestes .fdm-conversion{display:contents}');
  });
});
