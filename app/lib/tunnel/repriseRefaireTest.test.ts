import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { afficherPointRepris, demanderGpsALOuverture, prendreReprise } from './repriseRefaireTest';

const VALIDE = { lat: 48.90693182287072, lon: 2.269431435588249, batimentOrigine: { id: 7, cleabs: 'BATIMENT0000000123' }, altitudeTerrainOrigineM: 31.5 };

describe('reprise de « Refaire le test » — logique', () => {
  it('refaire le test → l’adresse et le point VALIDÉ (bâtiment, altitude compris) sont repris tels quels', () => {
    expect(prendreReprise('8 Rue de Belfort 92600 Asnières-sur-Seine', VALIDE)).toEqual({ adresse: '8 Rue de Belfort 92600 Asnières-sur-Seine', valide: VALIDE });
  });
  it('aucun point validé → rien à reprendre (mécanique d’avant)', () => {
    expect(prendreReprise('8 Rue de Belfort', null)).toBeNull();
  });
  it('à l’ouverture de la caméra : pas de demande GPS pendant une reprise (elle viderait l’adresse et replacerait le point) ; sinon comme avant', () => {
    expect(demanderGpsALOuverture(prendreReprise('a', VALIDE))).toBe(false);
    expect(demanderGpsALOuverture(null)).toBe(true);
  });
  it('l’écran affiche le point repris seulement si la reprise est active ET le point toujours validé (un geste sur la carte le dévalide)', () => {
    expect(afficherPointRepris(true, VALIDE)).toBe(true);
    expect(afficherPointRepris(true, null)).toBe(false);   // carte touchée → evaluer a remis le point « à valider »
    expect(afficherPointRepris(false, VALIDE)).toBe(false); // reprise tombée (ou validation normale)
  });
});

describe('reprise de « Refaire le test » — câblage dans le tunnel (app/page.tsx)', () => {
  const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');

  it('le bouton « Refaire le test » garde sa mécanique et AJOUTE seulement l’instantané de reprise', () => {
    const i = src.indexOf('onRefaireTest={() => {');
    const bloc = src.slice(i, src.indexOf('}}', i));
    expect(bloc).toContain('repriseRef.current = prendreReprise(address, origine.valide);');
    for (const geste of ['reinitialiserCapteurs();', 'setPhoto(null);', 'setCapturedOrientation(null);', 'origine.reset();', 'conserverPositionRef.current = true;', 'setEtape("photo");', 'startCamera();']) {
      expect(bloc).toContain(geste);
    }
  });

  it('à la photo, la reprise remet adresse, position et point validé ; sans reprise, le point conservé est réévalué comme avant', () => {
    expect(src).toContain('origine.reprendre(reprise.valide); setPointRepris(true);');
    expect(src).toContain('setAddress(reprise.adresse);');
    expect(src).toContain('origine.evaluer(position.latitude, position.longitude, mode); // re-évalue le point conservé (sans GPS)');
  });

  it('point déplacé (ou mode changé) → la reprise tombe et le contrôle normal s’applique', () => {
    expect(src).toMatch(/onPositionChange=\{\(newPosition\) => \{ userMovedRef\.current = true;[^}]*setPointRepris\(false\);[^}]*origine\.evaluer\(newPosition\.latitude/);
    expect(src).toContain('onModeChange={(x) => { setMode(x); setPointRepris(false); origine.evaluer(');
  });

  it('écran de localisation : « Continuer avec ce point » pendant la reprise, sinon le bouton « Valider votre point de vue » inchangé', () => {
    expect(src).toContain('afficherPointRepris(pointRepris, origine.valide) ?');
    expect(src).toContain('✓ Point validé lors du test précédent');
    expect(src).toContain('Continuer avec ce point');
    expect(src).toContain('disabled={!pointDeplace || origine.resultat?.statut !== "VALIDE" || !!origine.valide}');
  });

  it('nouveau test depuis l’accueil → rien de repris ; « Refaire la photo » n’utilise pas la reprise', () => {
    expect(src).toContain('if (etape === "accueil") { repriseRef.current = null; setPointRepris(false); }');
    const i = src.indexOf('function reprendrePhoto() {');
    const bloc = src.slice(i, src.indexOf('startCamera();', i));
    expect(bloc).not.toContain('repriseRef');
    expect(src).toContain('if (demanderGpsALOuverture(repriseRef.current)) demanderPositionGPS();');
  });
});
