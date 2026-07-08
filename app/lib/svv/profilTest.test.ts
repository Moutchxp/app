/**
 * Banc M5 · Lot 2 — profil de test synchronisé (module PUR profilTest.ts).
 * Aucun accès DB : clone d'immutabilité, statut des variables, récap des écarts, validation cartes.
 */
import { describe, it, expect } from 'vitest';
import { PROFIL_DEGAGEMENT_DEFAUT, type ProfilDegagement } from './profilDegagement';
import {
  clonerProfil,
  diffProfils,
  STATUT_VARIABLE,
  VARIABLES_VESTIGIALES,
  validerCartesAnnee,
} from './profilTest';

const base = (): ProfilDegagement => clonerProfil(PROFIL_DEGAGEMENT_DEFAUT);

describe('clonerProfil — snapshot profondément indépendant (BE-20, immutabilité)', () => {
  it('produit une copie dont muter les champs (y compris imbriqués) ne touche PAS la source', () => {
    const source = clonerProfil(PROFIL_DEGAGEMENT_DEFAUT);
    const test = clonerProfil(source);
    test.boostF4 = 999;
    test.famillesPonderation.mh.cone = 42;
    test.orientationPts.S = 0;
    test.famillesAnnee.push({ borneMin: 2000, opMin: '>', borneMax: null, opMax: null, cone: 3, flanc: 2, distMaxM: 500 });
    test.famillesAnnee[0].cone = 7;
    expect(source.boostF4).toBe(PROFIL_DEGAGEMENT_DEFAUT.boostF4);
    expect(source.famillesPonderation.mh.cone).toBe(PROFIL_DEGAGEMENT_DEFAUT.famillesPonderation.mh.cone);
    expect(source.orientationPts.S).toBe(PROFIL_DEGAGEMENT_DEFAUT.orientationPts.S);
    expect(source.famillesAnnee).toHaveLength(PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee.length);
    expect(source.famillesAnnee[0].cone).toBe(PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee[0].cone);
  });

  it('deux clones du même profil sont égaux en valeur mais distincts en référence', () => {
    const a = base();
    const b = clonerProfil(a);
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    expect(b.famillesPonderation).not.toBe(a.famillesPonderation);
    expect(b.famillesAnnee).not.toBe(a.famillesAnnee);
  });
});

describe('STATUT_VARIABLE — VIVE / VESTIGIALE / GARDE (BE-21a)', () => {
  it('les 4 vestigiales sont marquées vestigiale', () => {
    for (const k of ['boostF2', 'forfaitConeCentral', 'forfaitExtremites', 'coneF3DemiAngleDeg'] as const) {
      expect(STATUT_VARIABLE[k]).toBe('vestigiale');
    }
    expect([...VARIABLES_VESTIGIALES].sort()).toEqual(
      ['boostF2', 'coneF3DemiAngleDeg', 'forfaitConeCentral', 'forfaitExtremites'].sort(),
    );
  });

  it('les modes de combinaison sont des variables de GARDE (enum fermé)', () => {
    expect(STATUT_VARIABLE.modeCombinaison).toBe('garde');
    expect(STATUT_VARIABLE.modeCombinaisonRepli).toBe('garde');
  });

  it('les variables de dégagement sont VIVES', () => {
    for (const k of ['boostF4', 'distanceMaxM', 'plafondDegagement', 'couloirMalusPct', 'orientationPts'] as const) {
      expect(STATUT_VARIABLE[k]).toBe('vive');
    }
  });
});

describe('diffProfils — récap des écarts actif → test (BE-25/25a/25b)', () => {
  it('profil de test identique au profil actif → aucun écart (CA-2.5)', () => {
    const actif = base();
    const test = clonerProfil(actif);
    const d = diffProfils(actif, test);
    expect(d.total).toBe(0);
    expect(d.scalaires).toHaveLength(0);
    expect(d.cartesAnnee.ajouts).toHaveLength(0);
    expect(d.cartesAnnee.suppressions).toHaveLength(0);
    expect(d.cartesAnnee.modifications).toHaveLength(0);
  });

  it('détecte un écart scalaire de premier niveau avec son statut', () => {
    const actif = base();
    const test = clonerProfil(actif);
    test.boostF4 = actif.boostF4 + 1;
    const d = diffProfils(actif, test);
    expect(d.scalaires).toHaveLength(1);
    expect(d.scalaires[0]).toMatchObject({
      champ: 'boostF4',
      statut: 'vive',
      valeurActive: actif.boostF4,
      valeurTest: actif.boostF4 + 1,
    });
    expect(d.total).toBe(1);
  });

  it('détecte un écart imbriqué avec chemin pointé', () => {
    const actif = base();
    const test = clonerProfil(actif);
    test.famillesPonderation.mh.distMaxM = 500;
    test.orientationPts.E = 9;
    const d = diffProfils(actif, test);
    const champs = d.scalaires.map((e) => e.champ).sort();
    expect(champs).toEqual(['famillesPonderation.mh.distMaxM', 'orientationPts.E']);
  });

  it('détecte un écart sur naturesRemarquables (tableau) comme un seul écart', () => {
    const actif = base();
    const test = clonerProfil(actif);
    test.naturesRemarquables = [...actif.naturesRemarquables, 'Beffroi'];
    const d = diffProfils(actif, test);
    expect(d.scalaires).toHaveLength(1);
    expect(d.scalaires[0].champ).toBe('naturesRemarquables');
  });

  it('classe les cartes d’année en ajout / suppression / modification', () => {
    const actif = base(); // 2 cartes par défaut
    const testAjout = clonerProfil(actif);
    testAjout.famillesAnnee.push({ borneMin: 1935, opMin: '>', borneMax: null, opMax: null, cone: 1.1, flanc: 1.05, distMaxM: 150 });
    expect(diffProfils(actif, testAjout).cartesAnnee.ajouts).toHaveLength(1);

    const testSuppr = clonerProfil(actif);
    testSuppr.famillesAnnee.pop();
    expect(diffProfils(actif, testSuppr).cartesAnnee.suppressions).toHaveLength(1);

    const testModif = clonerProfil(actif);
    testModif.famillesAnnee[0].cone = 1.9;
    const dm = diffProfils(actif, testModif).cartesAnnee.modifications;
    expect(dm).toHaveLength(1);
    expect(dm[0].index).toBe(0);
  });

  it('éditer une variable vestigiale apparaît au récap avec statut vestigiale (griser en UI)', () => {
    const actif = base();
    const test = clonerProfil(actif);
    test.boostF2 = 5;
    const d = diffProfils(actif, test);
    expect(d.scalaires).toHaveLength(1);
    expect(d.scalaires[0]).toMatchObject({ champ: 'boostF2', statut: 'vestigiale' });
  });
});

describe('validerCartesAnnee — garde de chevauchement réutilisée (BE-24)', () => {
  it('refuse un jeu de cartes aux intervalles chevauchants', () => {
    const res = validerCartesAnnee([
      { borneMin: null, opMin: null, borneMax: 1950, opMax: '<=', cone: 1.5, flanc: 1.2, distMaxM: 300 },
      { borneMin: 1940, opMin: '>=', borneMax: null, opMax: null, cone: 1.2, flanc: 1.1, distMaxM: 200 },
    ]);
    expect(res.ok).toBe(false);
  });

  it('accepte les cartes par défaut (non chevauchantes)', () => {
    expect(validerCartesAnnee(base().famillesAnnee).ok).toBe(true);
  });
});
