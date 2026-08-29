import { describe, it, expect } from 'vitest';
import {
  classerPiece, diagnostiquerCompletude, lignesDepuisClassements, famillesAttenduesDepuisConfig,
  type PieceLueDiag,
} from './diagnosticCompletude';
import type { FamillePlan } from './planMasse';

/**
 * PART-2 — diagnostic de complétude, module PUR. Les textes ci-dessous déclenchent le VRAI classement par contenu :
 *  · Cerfa  ← n° 13409 + contexte « permis de construire » (estPieceCerfaPc) ;
 *  · masse  ← cartouche réglementaire « constructions à édifier ou modifier » (estPageCartouche) ;
 *  · étage  ← cartouche de niveau « plan du RDC » (ETAGE_CARTOUCHE) sur une planche courte ;
 *  · coupe  ← ici via le NOM (PC03), contenu muet — pour éprouver l'appoint par le nom.
 */
const CERFA = 'cerfa n° 13409*15 — demande de permis de construire déposée en mairie';
const MASSE = 'PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER — échelle 1:200';
const ETAGE = 'plan du RDC';

const TOUTES: FamillePlan[] = ['masse', 'coupe', 'etage', 'cerfa'];
const p = (nomFichier: string, ...pagesTexte: string[]): PieceLueDiag => ({ nomFichier, pagesTexte });

describe('famillesAttenduesDepuisConfig', () => {
  it('respecte les interrupteurs, dans l’ordre d’affichage', () => {
    expect(famillesAttenduesDepuisConfig({ cerfa: true, masse: true, coupe: true, etage: true })).toEqual(['masse', 'coupe', 'etage', 'cerfa']);
    expect(famillesAttenduesDepuisConfig({ cerfa: false, masse: true, coupe: false, etage: true })).toEqual(['masse', 'etage']);
  });
});

describe('classerPiece — contenu prioritaire, nom en appoint, désaccord signalé', () => {
  it('contenu Cerfa (13409) → cerfa, quel que soit le nom', () => {
    expect(classerPiece(p('scan_001.pdf', CERFA)).famille).toBe('cerfa');
  });
  it('fichier MAL NOMMÉ mais contenu de plan de masse → masse (le contenu classe)', () => {
    const c = classerPiece(p('scan_001.pdf', MASSE));
    expect(c.famille).toBe('masse');
    expect(c.parContenu).toBe('masse');
    expect(c.parNom).toBeNull();
    expect(c.desaccord).toBe(false);
  });
  it('contenu muet + nom PC03 → coupe (appoint par le nom)', () => {
    const c = classerPiece(p('PC03 - coupe.pdf')); // aucune page
    expect(c.famille).toBe('coupe');
    expect(c.parContenu).toBeNull();
    expect(c.parNom).toBe('coupe');
  });
  it('DÉSACCORD : nom « plan de masse » mais contenu = plan d’étage → le CONTENU l’emporte, désaccord visible', () => {
    const c = classerPiece(p('plan de masse - projet.pdf', ETAGE));
    expect(c.parNom).toBe('masse');    // forme « plan de masse »
    expect(c.parContenu).toBe('etage'); // cartouche de niveau
    expect(c.famille).toBe('etage');   // le contenu l’emporte
    expect(c.desaccord).toBe(true);
  });
});

describe('diagnostiquerCompletude', () => {
  it('les 4 familles présentes → complet (chaque ligne présente, avec ses pièces)', () => {
    const d = diagnostiquerCompletude([p('a.pdf', MASSE), p('PC03 - coupe.pdf'), p('plan du R+2.pdf'), p('c.pdf', CERFA)], TOUTES);
    expect(d.lignes.every((l) => l.presente)).toBe(true);
    expect(d.lignes.find((l) => l.famille === 'masse')!.pieces).toEqual(['a.pdf']);
    expect(d.nonClassees).toEqual([]);
  });

  it('Cerfa absent → signalé manquant (les autres présents)', () => {
    const d = diagnostiquerCompletude([p('a.pdf', MASSE), p('PC03 - coupe.pdf'), p('plan du R+2.pdf')], TOUTES);
    expect(d.lignes.find((l) => l.famille === 'cerfa')!.presente).toBe(false);
    expect(d.lignes.find((l) => l.famille === 'masse')!.presente).toBe(true);
  });

  it('aucune pièce → les familles attendues toutes manquantes, aucun plantage', () => {
    const d = diagnostiquerCompletude([], TOUTES);
    expect(d.lignes.map((l) => l.presente)).toEqual([false, false, false, false]);
    expect(d.nonClassees).toEqual([]);
  });

  it('pièce muette à nom opaque → NON classée (exposée), jamais un faux « manquant » silencieux', () => {
    const d = diagnostiquerCompletude([p('scan_001.pdf'), p('a.pdf', MASSE)], TOUTES);
    expect(d.nonClassees).toEqual(['scan_001.pdf']);
    expect(d.lignes.find((l) => l.famille === 'masse')!.presente).toBe(true);
  });

  it('famille DÉCOCHÉE dans les réglages → plus jamais signalée (aucune ligne)', () => {
    const d = diagnostiquerCompletude([p('a.pdf', MASSE)], famillesAttenduesDepuisConfig({ cerfa: false, masse: true, coupe: true, etage: true }));
    expect(d.lignes.some((l) => l.famille === 'cerfa')).toBe(false);
  });

  it('le désaccord remonte dans `desaccords`', () => {
    const d = diagnostiquerCompletude([p('plan de masse - projet.pdf', ETAGE)], TOUTES);
    expect(d.desaccords.map((c) => c.nomFichier)).toEqual(['plan de masse - projet.pdf']);
  });
});

describe('lignesDepuisClassements — rejoué à l’affichage sans relire les PDF', () => {
  it('recompose les lignes depuis des classements stockés + config vive', () => {
    const classements = [
      { nomFichier: 'a.pdf', famille: 'masse' as const, parContenu: 'masse' as const, parNom: null, desaccord: false },
      { nomFichier: 'b.pdf', famille: null, parContenu: null, parNom: null, desaccord: false },
    ];
    const d = lignesDepuisClassements(classements, ['masse', 'cerfa']);
    expect(d.lignes.find((l) => l.famille === 'masse')!.presente).toBe(true);
    expect(d.lignes.find((l) => l.famille === 'cerfa')!.presente).toBe(false);
    expect(d.nonClassees).toEqual(['b.pdf']);
  });
});
