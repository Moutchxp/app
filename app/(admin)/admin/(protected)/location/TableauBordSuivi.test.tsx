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
const monter = async () => { await act(async () => { root.render(createElement(TableauBordSuivi)); }); await calmer(); };
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
    await monter();
    await choisir('mois', '8');
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
    await monter();
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

  it('sans la migration 406 : le dit', async () => {
    donnees = { ...donnees, disponible: false, activites: [] };
    await monter();
    expect(container.querySelector('[data-tdb-sans-migration]')?.textContent).toContain('migration 406');
  });
});
