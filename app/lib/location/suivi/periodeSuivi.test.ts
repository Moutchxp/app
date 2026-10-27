import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireClasseur, type ClasseurLu } from './lectureExcel';
import { activitesDuMois } from './repriseExcel';
import { SANS_REGLE_ANNEXES } from './annexesGestion';
import {
  anneesProposees, choixDeLAdresse, finAnneeMois, incoherente, moisDeLaPeriode, parametresDe, periodeDe, periodePrecedente, PERIODE_DEFAUT, reculer,
  titreApporteursPeriode,
} from './periodeSuivi';
import { historiquePeriode, mouvementsGestionEntre, stockALaDate, tuilesPeriode } from './suiviPeriode';
import { totauxPeriode, type ActiviteLue, type ContexteCalcul, type Transition } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026) — LA PÉRIODE « DÉBUT / FIN » DU SUIVI ANNUEL : les défauts (Origine → aujourd'hui), Début > Fin impossible, la période
 * précédente (2a : mêmes dates, autant d'années plus tôt ; « — » avant la première donnée), les anciennes adresses converties, et les
 * sommes : le total de la période = la somme de ses années = la somme de ses mois, au centime (copies anonymisées 2025 et 2026).
 */
const JOUR = '2026-10-25';

describe('🔴 le choix et son libellé', () => {
  it('défauts : Origine → aujourd’hui ; le défaut n’écrit rien dans l’adresse', () => {
    expect(choixDeLAdresse('', 2019, JOUR)).toEqual({ choix: PERIODE_DEFAUT, message: null });
    const p = periodeDe(PERIODE_DEFAUT, 2019, JOUR);
    expect([p.debutDate, p.finDate, p.libelle]).toEqual(['2019-01-01', '2026-10-25', 'Origine → aujourd’hui (2019 → 25/10/2026)']);
    expect(parametresDe(PERIODE_DEFAUT)).toEqual({ debut: null, fin: null });
  });
  it('des années : du 1er janvier au 31 décembre ; l’année en cours en fin = jusqu’à aujourd’hui', () => {
    expect(periodeDe({ debut: 2023, fin: 2025 }, 2019, JOUR)).toMatchObject({ debutDate: '2023-01-01', finDate: '2025-12-31', libelle: '2023 → 2025' });
    expect(periodeDe({ debut: 2026, fin: 2026 }, 2019, JOUR)).toMatchObject({ finDate: '2026-10-25', libelle: '2026 → aujourd’hui (2026 → 25/10/2026)' });
    expect(choixDeLAdresse('?debut=2023&fin=2025', 2019, JOUR).choix).toEqual({ debut: 2023, fin: 2025 });
    expect(parametresDe({ debut: 2023, fin: 2025 })).toEqual({ debut: '2023', fin: '2025' });
  });
  it('🔴 Début > Fin impossible : l’adresse incohérente est dite et revient au défaut ; les années proposées vont de l’origine à l’année en cours', () => {
    expect(incoherente({ debut: 2025, fin: 2023 }, 2019, JOUR)).toBe(true);
    const lu = choixDeLAdresse('?debut=2025&fin=2023', 2019, JOUR);
    expect(lu.choix).toEqual(PERIODE_DEFAUT);
    expect(lu.message).toBe('La période de l’adresse est incohérente (début 2025 après la fin 2023) : la période par défaut est affichée (Origine → aujourd’hui).');
    expect(anneesProposees(2019, JOUR)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  });
  it('🔴 une ANCIENNE adresse ?annee=2025&mois=10 : 2025 → 2025, arrêtée à la fin d’octobre', () => {
    const { choix } = choixDeLAdresse('?annee=2025&mois=10', 2019, JOUR);
    expect(choix).toEqual({ debut: 2025, fin: '2025-10' });
    expect(periodeDe(choix, 2019, JOUR)).toMatchObject({ debutDate: '2025-01-01', finDate: '2025-10-31', libelle: '2025 → fin oct. 2025' });
    expect(finAnneeMois(choix, JOUR)).toEqual({ annee: 2025, mois: 10 });
    expect(choixDeLAdresse('?annee=2025', 2019, JOUR).choix).toEqual({ debut: 2025, fin: 2025 });
  });
  it('les mois de la période', () => {
    expect(moisDeLaPeriode({ debutDate: '2025-01-01', finDate: '2026-02-14' })).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08',
      '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('🔴 2a — la période précédente : mêmes dates, autant d’années plus tôt', () => {
  const prec = (debut: number | 'origine', fin: number | 'aujourdhui') => periodePrecedente(periodeDe({ debut, fin }, 2019, JOUR), 2019);
  it('2026 → aujourd’hui : 01/01 → 25/10/2025 (même nombre de jours) ; 2024 → 2025 : 2022 → 2023 ; 2025 → 2025 : 2024', () => {
    expect(prec(2026, 'aujourdhui')).toEqual({ debutDate: '2025-01-01', finDate: '2025-10-25', libelle: '01/01/2025 → 25/10/2025' });
    expect(prec(2024, 2025)).toEqual({ debutDate: '2022-01-01', finDate: '2023-12-31', libelle: '2022 → 2023' });
    expect(prec(2025, 2025)).toEqual({ debutDate: '2024-01-01', finDate: '2024-12-31', libelle: '2024' });
    expect(prec(2025, 'aujourdhui')).toEqual({ debutDate: '2023-01-01', finDate: '2024-10-25', libelle: '01/01/2023 → 25/10/2024' });
  });
  it('« — » quand elle commence avant la première donnée (Origine → aujourd’hui ; 2020 → 2025)', () => {
    expect(prec('origine', 'aujourdhui')).toBeNull();
    expect(prec(2020, 2025)).toBeNull();
  });
  it('un 29 février recule au 28', () => {
    expect(reculer('2024-02-29', 1)).toBe('2023-02-28');
  });
});

describe('🔴 les sommes au centime : période = somme des années = somme des mois', () => {
  const lire = (annee: number): ActiviteLue[] => {
    const c = JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
    return lireClasseur(c, annee).flatMap((m) => activitesDuMois(m, { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux'], negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS' }))
      .map((a) => ({ ...a, lotId: null, bailId: null, source: 'import' } as ActiviteLue));
  };
  const activites = [...lire(2024), ...lire(2025), ...lire(2026)];
  const ctx: ContexteCalcul = { regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [], retrocessions: [], aujourdhui: JOUR };
  const c = (x: number) => Math.round((x + Number.EPSILON) * 100);
  const p = periodeDe({ debut: 2024, fin: 'aujourdhui' }, 2024, JOUR);

  it('les tuiles (CA HT, baux, CA net) = la somme des années de « Année par année » = la somme des mois', () => {
    const t = tuilesPeriode(activites, ctx, p, periodePrecedente(p, 2024), [], SANS_REGLE_ANNEXES, [], 0);
    const h = historiquePeriode(activites, ctx, p, true);
    expect(h.map((x) => x.annee)).toEqual([2024, 2025, 2026]);
    expect(c(t.courant.ca)).toBe(h.reduce((s, x) => s + c(x.ca), 0));
    expect(t.courant.nbBaux).toBe(h.reduce((s, x) => s + x.nbBaux, 0));
    const mois = moisDeLaPeriode(p).map((m) => totauxPeriode(activites, ctx, { annee: Number(m.slice(0, 4)), mois: Number(m.slice(5, 7)) }));
    expect(c(t.courant.ca)).toBe(mois.reduce((s, x) => s + c(x.ca), 0));
    expect(t.courant.nb).toBe(mois.reduce((s, x) => s + x.nb, 0));
    expect(t.precedent).toBeNull();   // 2021 → 2023 commencerait avant 2024
  });
  it('une année entière de « Année par année » = celle d’avant la période (totauxPeriode de l’année)', () => {
    const h = historiquePeriode(activites, ctx, periodeDe({ debut: 2025, fin: 2025 }, 2024, JOUR), true)[0];
    const an = totauxPeriode(activites, ctx, { annee: 2025, mois: null });
    expect([c(h.ca), h.nbBaux, c(h.caNet), c(h.commission ?? 0)]).toEqual([c(an.ca), an.nbBaux, c(an.caNet), c(an.commission)]);
  });
  it('la gestion : solde sur la période et stock à la fin', () => {
    const tr: Transition[] = [{ lotId: 1, avant: null, apres: 'en_gestion', effetLe: '2025-03-01' }, { lotId: 2, avant: 'en_gestion', apres: 'ancienne_gestion', effetLe: '2025-06-01' },
      { lotId: 3, avant: null, apres: 'en_gestion', effetLe: '2026-02-01' }];
    expect(mouvementsGestionEntre(tr, { debutDate: '2025-01-01', finDate: '2025-12-31' }, SANS_REGLE_ANNEXES)).toEqual({ entrees: 1, sorties: 1, solde: 0 });
    // Aujourd'hui 10 biens ; au 31/12/2025, l'entrée de février 2026 n'y était pas : 9.
    expect(stockALaDate(tr, 10, '2025-12-31', SANS_REGLE_ANNEXES)).toBe(9);
  });
});

/** 🔴 Arno (27/10/2026) — le titre du module « Apporteurs » du Suivi annuel : les années réellement couvertes, une année partielle dite. */
describe('🔴 titre des apporteurs de la période', () => {
  it('une année entière ; plusieurs années ; une année partielle (jusqu’à aujourd’hui, à partir du, du … au …)', () => {
    expect(titreApporteursPeriode({ debutDate: '2025-01-01', finDate: '2025-12-31' })).toBe('Apporteur de l’année 2025');
    expect(titreApporteursPeriode({ debutDate: '2024-01-01', finDate: '2026-12-31' })).toBe('Apporteur des années 2024, 2025, 2026');
    expect(titreApporteursPeriode({ debutDate: '2026-01-01', finDate: '2026-10-27' })).toBe('Apporteur de l’année 2026, jusqu’au 27/10');
    expect(titreApporteursPeriode({ debutDate: '2024-01-01', finDate: '2026-10-27' })).toBe('Apporteur des années 2024, 2025, 2026, jusqu’au 27/10');
    expect(titreApporteursPeriode({ debutDate: '2024-03-15', finDate: '2025-12-31' })).toBe('Apporteur des années 2024, à partir du 15/03, 2025');
    expect(titreApporteursPeriode({ debutDate: '2026-03-15', finDate: '2026-10-27' })).toBe('Apporteur de l’année 2026, du 15/03 au 27/10');
  });
  it('les bornes réelles de la page : « Origine → aujourd’hui », une année passée, l’année en cours, une ancienne adresse (fin d’un mois)', () => {
    expect(titreApporteursPeriode(periodeDe({ debut: 'origine', fin: 'aujourdhui' }, 2019, '2026-10-27'))).toBe('Apporteur des années 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, jusqu’au 27/10');
    expect(titreApporteursPeriode(periodeDe({ debut: 2025, fin: 2025 }, 2019, '2026-10-27'))).toBe('Apporteur de l’année 2025');
    expect(titreApporteursPeriode(periodeDe({ debut: 2026, fin: 2026 }, 2019, '2026-10-27'))).toBe('Apporteur de l’année 2026, jusqu’au 27/10');
    expect(titreApporteursPeriode(periodeDe({ debut: 2025, fin: '2025-03' }, 2019, '2026-10-27'))).toBe('Apporteur de l’année 2025, jusqu’au 31/03');
  });
});
