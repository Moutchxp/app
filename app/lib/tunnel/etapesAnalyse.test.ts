import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ETAPES_ANALYSE, etapeSuivante, plafondEtapeAnalyse, scoreAttendPhoto } from './etapesAnalyse';

const INDEX = (l: (typeof ETAPES_ANALYSE)[number]) => ETAPES_ANALYSE.indexOf(l);
const derouler = (phase: 'geometrie' | 'photo', depart = 0, pas = 20) => {
  let e = depart;
  for (let i = 0; i < pas; i++) e = etapeSuivante(e, phase);
  return e;
};

describe('checklist de l’écran d’attente', () => {
  it('garde les 6 étapes affichées, dans le même ordre', () => {
    expect(ETAPES_ANALYSE).toEqual([
      'Localisation', 'Obstacles', 'Altitudes terrain', 'Hauteurs des bâtiments', 'Analyse photo (IA)', 'Calcul du résultat',
    ]);
  });

  it('pendant le calcul géométrique : au plus « Hauteurs des bâtiments » en cours, la photo n’est jamais cochée', () => {
    const e = derouler('geometrie');
    expect(e).toBe(INDEX('Hauteurs des bâtiments'));
    expect(e).toBeLessThan(INDEX('Analyse photo (IA)')); // « fait » = index < étape courante
  });

  it('pendant l’analyse de la photo : au plus « Analyse photo (IA) » en cours, jamais cochée', () => {
    expect(derouler('photo', derouler('geometrie'))).toBe(INDEX('Analyse photo (IA)'));
  });

  it('« Calcul du résultat » n’est jamais atteinte ni cochée au minuteur (la page de score s’ouvre à la vraie fin)', () => {
    expect(plafondEtapeAnalyse('photo')).toBeLessThan(INDEX('Calcul du résultat'));
  });

  it('avance d’une étape à la fois et ne recule jamais', () => {
    expect(etapeSuivante(0, 'geometrie')).toBe(1);
    expect(etapeSuivante(4, 'geometrie')).toBe(4);
  });

  it('seul un vrai verdict attend la photo (l’écran sans verdict n’affiche aucun score)', () => {
    expect(scoreAttendPhoto({ verdict: { verdict: 'SANS_VIS_A_VIS' } })).toBe(true);
    expect(scoreAttendPhoto({ verdict: { verdict: 'VIS_A_VIS' } })).toBe(true);
    expect(scoreAttendPhoto({ verdict: { verdict: 'INDETERMINE' } })).toBe(false);
    expect(scoreAttendPhoto(null)).toBe(false);
    expect(scoreAttendPhoto(undefined)).toBe(false);
  });
});

describe('câblage dans le tunnel (page.tsx)', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  const analyse = page.slice(page.indexOf('async function handleAnalyse()'), page.indexOf('async function lancerAnalysePhoto('));

  it('pour un vrai verdict, l’analyse de la photo est ATTENDUE avant de quitter l’écran d’attente', () => {
    expect(analyse).toContain('phaseAnalyseRef.current = "photo"');
    expect(analyse).toContain('await lancerAnalysePhoto(');
    // le résultat n'est publié qu'après la photo, avec le score final
    expect(analyse.indexOf('await lancerAnalysePhoto(')).toBeLessThan(analyse.indexOf('setEtatPhoto(photoRes.etat)'));
    // l'écran d'attente ne tombe qu'au finally, donc après la photo
    expect(analyse.lastIndexOf('setAnalyseEnCours(false)')).toBeGreaterThan(analyse.indexOf('setEtatPhoto(photoRes.etat)'));
  });

  it('la checklist suit la phase réelle', () => {
    expect(page).toContain('etapeSuivante(e, phaseAnalyseRef.current)');
  });

  it('les délais existants sont conservés : 60 s pour le calcul géométrique, 45 s pour la photo', () => {
    expect(analyse).toContain('ctrl.abort(), 60000');
    const photo = page.slice(page.indexOf('async function lancerAnalysePhoto('), page.indexOf('function reprendrePhoto()'));
    expect(photo).toContain('ctrl.abort(), 45000');
  });
});
