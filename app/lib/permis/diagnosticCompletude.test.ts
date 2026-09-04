import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classerPiece, diagnostiquerCompletude, lignesDepuisClassements, famillesAttenduesDepuisConfig, estRubriqueAutresPieces,
  cerfaParNom, type PieceLueDiag,
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
    // LOT 60 — muette (aucun texte) → raison 'illisible' (scan) ; le nom n'est pas la rubrique « autres pièces ».
    expect(d.nonClassees).toEqual([{ nomFichier: 'scan_001.pdf', raison: 'illisible', rubriqueAutresPieces: false }]);
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

describe('LOT 76 — un fichier nommé Cerfa compte comme Cerfa PRÉSENT (présence par le nom), sans toucher la lecture', () => {
  it('CERFA_13409 SANS couche texte (scan) → famille cerfa PRÉSENTE (parNom, parContenu null)', () => {
    const c = classerPiece(p('CERFA_13409_15_VF_signe___20250331171427.pdf')); // aucune page = scan muet
    expect(c.famille).toBe('cerfa');
    expect(c.parNom).toBe('cerfa');
    expect(c.parContenu).toBeNull();
    expect(c.desaccord).toBe(false);
  });
  it('reconnaît aussi cerfa_13824 et le mot « cerfa » nu ; un numéro 13409 seul suffit', () => {
    expect(classerPiece(p('cerfa_13824_04_2D.pdf')).famille).toBe('cerfa');
    expect(classerPiece(p('CERFA formulaire signé.pdf')).famille).toBe('cerfa');
    expect(classerPiece(p('13409.pdf')).famille).toBe('cerfa');
  });
  it('le CONTENU reste prioritaire : nom « cerfa » mais contenu plan de masse → masse, désaccord exposé', () => {
    const c = classerPiece(p('cerfa.pdf', MASSE));
    expect(c.parNom).toBe('cerfa');
    expect(c.parContenu).toBe('masse');
    expect(c.famille).toBe('masse');
    expect(c.desaccord).toBe(true);
  });
  it('STRICT — un nom opaque ou un plan quelconque n’est PAS pris pour un Cerfa (pas de faux positif)', () => {
    expect(cerfaParNom('C_A1_2D_PDM__20251219164340.pdf')).toBe(false);
    expect(cerfaParNom('PC4_A2_2D_PDM.pdf')).toBe(false);
    expect(cerfaParNom('scan_001.pdf')).toBe(false);
    expect(classerPiece(p('scan_001.pdf')).famille).toBeNull(); // reste non classé, pas un faux Cerfa
  });
  it('11430 (07512024V0037) : le Cerfa scanné cesse de manquer → Cerfa PRÉSENT', () => {
    // Cerfa scanné + les 3 autres familles déjà attestées par le contenu → dossier COMPLET.
    const d = diagnostiquerCompletude(
      [p('CERFA_13409_15_VF_signe.pdf'), p('a.pdf', MASSE), p('PC03 - coupe.pdf'), p('plan du R+2.pdf')], TOUTES);
    expect(d.lignes.find((l) => l.famille === 'cerfa')!.presente).toBe(true);
    expect(d.lignes.every((l) => l.presente)).toBe(true);
  });
  it('la LECTURE de valeurs ne s’appuie PAS sur le nom : recapCerfa/decisionCerfa n’importent pas cerfaParNom', () => {
    const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    expect(lire('app/lib/permis/recapCerfa.ts')).not.toContain('cerfaParNom');
    expect(lire('app/lib/permis/decisionCerfa.ts')).not.toContain('cerfaParNom');
    // et planMasse (sélecteur de tracé) reste cerfa-free par le nom (PROV-2a intact)
    expect(lire('app/lib/permis/planMasse.ts')).not.toContain('cerfaParNom');
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
    // LOT 60 — classement ANTÉRIEUR au LOT 60 (aucun `aTexte`) → raison 'indetermine' (on n'affirme NI lisible NI illisible).
    expect(d.nonClassees).toEqual([{ nomFichier: 'b.pdf', raison: 'indetermine', rubriqueAutresPieces: false }]);
  });
});

describe('LOT 60 — non classée : la VRAIE raison, jamais « illisible » un contenu lisible', () => {
  it('pièce à TEXTE lisible mais aucune des 4 familles → raison hors_familles (lue et rangée)', () => {
    const d = diagnostiquerCompletude([p('note-en-prose.pdf', 'Note d’accompagnement du permis : présentation des enjeux du projet.'), p('a.pdf', MASSE)], TOUTES);
    expect(d.nonClassees).toEqual([{ nomFichier: 'note-en-prose.pdf', raison: 'hors_familles', rubriqueAutresPieces: false }]);
  });

  it('rubrique Cerfa standard « PC200 autres pièces » à texte lisible → hors_familles + rubriqueAutresPieces', () => {
    const d = diagnostiquerCompletude([p('PC200 Autres pieces-3.pdf', 'Notice descriptive en prose, plusieurs pages lisibles.')], ['masse', 'coupe', 'etage', 'cerfa']);
    expect(d.nonClassees).toEqual([{ nomFichier: 'PC200 Autres pieces-3.pdf', raison: 'hors_familles', rubriqueAutresPieces: true }]);
  });

  it('estRubriqueAutresPieces : reconnaît le slot standard, sans faux positif (PC2/PC20 exclus)', () => {
    expect(estRubriqueAutresPieces('PC200 Autres pieces-3.pdf')).toBe(true);
    expect(estRubriqueAutresPieces('Autres pièces jointes.pdf')).toBe(true);
    expect(estRubriqueAutresPieces('PC02 Plan de masse.pdf')).toBe(false);
    expect(estRubriqueAutresPieces('PC20 façade.pdf')).toBe(false);
  });
});
