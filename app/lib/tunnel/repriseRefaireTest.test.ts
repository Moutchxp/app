import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { afficherPointRepris, demanderGpsALOuverture, prendreReprise } from './repriseRefaireTest';

const VALIDE = { lat: 48.90693182287072, lon: 2.269431435588249, batimentOrigine: { id: 7, cleabs: 'BATIMENT0000000123' }, altitudeTerrainOrigineM: 31.5 };

const BRUT = { lat: 48.90693182287072, lon: 2.269431435588249 };
const RECADRE = { lat: 48.90695, lon: 2.26946 };
const controle = (pointSnappeWgs84: { lat: number; lon: number } | null) => ({
  statut: 'VALIDE' as const, valide: true, message: '', dansBatiment: true, distanceAuBatimentM: 0,
  batimentOrigine: VALIDE.batimentOrigine, altitudeTerrainOrigineM: 31.5, pointSnappeWgs84, pointSnappeL93: null,
});

describe('reprise de « Refaire le test » — logique', () => {
  it('test validé en mode Façade → la carte se rouvre sur le point RECADRÉ, en mode Façade', () => {
    const r = prendreReprise('8 Rue Denfert-Rochereau', VALIDE, 'semi_auto', controle(RECADRE));
    expect(r?.mode).toBe('semi_auto');
    expect(r?.pointAffiche).toEqual(RECADRE);
  });
  it('… et l’analyse reçoit EXACTEMENT ce qu’elle avait reçu : le point validé (posé par l’internaute) et son bâtiment, avec le même mode', () => {
    const r = prendreReprise('8 Rue Denfert-Rochereau', VALIDE, 'semi_auto', controle(RECADRE));
    expect(r?.valide).toBe(VALIDE); // même objet : mêmes coordonnées, même bâtiment, même altitude terrain
    expect(r?.controle?.pointSnappeWgs84).toEqual(RECADRE); // contrôle restitué tel quel (reprises enchaînées comprises)
  });
  it('test validé en mode Libre → point de l’internaute NON corrigé, en mode Libre', () => {
    const r = prendreReprise('8 Rue Denfert-Rochereau', VALIDE, 'manuel', controle(BRUT));
    expect(r?.mode).toBe('manuel');
    expect(r?.pointAffiche).toEqual({ lat: VALIDE.lat, lon: VALIDE.lon });
  });
  it('mode Façade sans point recadré connu → point validé (jamais de point inventé)', () => {
    expect(prendreReprise('a', VALIDE, 'semi_auto', null)?.pointAffiche).toEqual({ lat: VALIDE.lat, lon: VALIDE.lon });
  });
  it('aucun point validé → rien à reprendre (mécanique d’avant)', () => {
    expect(prendreReprise('8 Rue de Belfort', null, 'semi_auto', null)).toBeNull();
  });
  it('à l’ouverture de la caméra : pas de demande GPS pendant une reprise (elle viderait l’adresse et replacerait le point) ; sinon comme avant', () => {
    expect(demanderGpsALOuverture(prendreReprise('a', VALIDE, 'semi_auto', null))).toBe(false);
    expect(demanderGpsALOuverture(null)).toBe(true);
  });
  it('l’écran affiche le point repris seulement si la reprise est active ET le point toujours validé (un geste ou un changement de mode le dévalide)', () => {
    expect(afficherPointRepris(true, VALIDE)).toBe(true);
    expect(afficherPointRepris(true, null)).toBe(false);
    expect(afficherPointRepris(false, VALIDE)).toBe(false);
  });
});

describe('reprise de « Refaire le test » — câblage dans le tunnel (app/page.tsx)', () => {
  const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');

  it('le bouton « Refaire le test » garde sa mécanique et AJOUTE seulement l’instantané de reprise', () => {
    const i = src.indexOf('onRefaireTest={() => {');
    const bloc = src.slice(i, src.indexOf('}}', i));
    expect(bloc).toContain('repriseRef.current = prendreReprise(address, origine.valide, mode, origine.resultat);');
    for (const geste of ['reinitialiserCapteurs();', 'setPhoto(null);', 'setCapturedOrientation(null);', 'origine.reset();', 'conserverPositionRef.current = true;', 'setEtape("photo");', 'startCamera();']) {
      expect(bloc).toContain(geste);
    }
  });

  it('à la photo, la reprise remet adresse, position et point validé ; sans reprise, le point conservé est réévalué comme avant', () => {
    expect(src).toContain('setMode(reprise.mode); setPosition({ latitude: reprise.pointAffiche.lat, longitude: reprise.pointAffiche.lon });');
    expect(src).toContain('origine.reprendre(reprise.valide, reprise.controle); setPointRepris(true);');
    expect(src).toContain('setAddress(reprise.adresse);');
    expect(src).toContain('origine.evaluer(position.latitude, position.longitude, mode); // re-évalue le point conservé (sans GPS)');
  });

  it('« Continuer avec ce point » ne touche pas au point validé : l’analyse lit toujours origine.valide et le mode', () => {
    const i = src.lastIndexOf('Continuer avec ce point');
    const bouton = src.slice(src.lastIndexOf('<button', i), i);
    expect(bouton).toContain('onClick={() => { setPointRepris(false); setEtape("orientation"); }}');
    expect(src).toContain('const lat = origine.valide.lat; const lon = origine.valide.lon;');
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
    expect(src).toContain('if (etape === "accueil") reinitialiserSessionTest();');
    const i = src.indexOf('function reprendrePhoto() {');
    const bloc = src.slice(i, src.indexOf('startCamera();', i));
    expect(bloc).not.toContain('repriseRef');
    expect(src).toContain('if (demanderGpsALOuverture(repriseRef.current)) demanderPositionGPS();');
  });
});

describe('retour à l’accueil = session de test VIERGE (retour d’Arno du 16/10/2026)', () => {
  const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  const i = src.indexOf('function reinitialiserSessionTest() {');
  const corps = src.slice(i, src.indexOf('function reinitialiserCapteurs() {', i));

  it('tout chemin vers l’accueil passe par setEtape("accueil"), qui déclenche la remise à zéro', () => {
    expect(src).toContain('useEffect(() => { if (etape === "accueil") reinitialiserSessionTest();');
    expect(src).toContain('onRecommencer={() => setEtape("accueil")}');
    expect(src).toContain('onAccueil={() => setEtape("accueil")}');
  });

  it('adresse, point, mode, validation, photo, capteurs, étage, analyse et résultat sont remis à leur valeur de première visite', () => {
    for (const geste of [
      'repriseRef.current = null;', 'setPointRepris(false);', 'conserverPositionRef.current = false;', 'userMovedRef.current = false;',
      'setAddress("");', 'setAddressInfo("");', 'setPositionGPSObtenue(false);', 'setCarteCentrePret(false);', 'setCommuneInsee(null);',
      'setPosition({ latitude: 48.8566, longitude: 2.3522 });', 'origine.reset();', 'setMode("semi_auto");', 'setPointDeplace(false);',
      'stopCamera();', 'reinitialiserCapteurs();', 'setPhoto(null);', 'setCapturedOrientation(null);', 'setAzimutAjuste(null);',
      'setEtage("");', 'setHauteurSousPlafondM(2.5);', 'setDernierEtage(null);',
      'setAnalyseEnCours(false);', 'setAnalyse(null);', 'setAnalyseErreur(null);', 'setEtatPhoto("echec");', 'setAnalyseEtape(0);',
    ]) expect(corps, geste).toContain(geste);
  });

  it('les valeurs remises sont bien celles du premier rendu (aucune divergence silencieuse)', () => {
    expect(src).toContain('const [mode, setMode] = useState<ModeOrigine>("semi_auto");');
    expect(src).toContain('const [hauteurSousPlafondM, setHauteurSousPlafondM] = useState<number>(2.5);');
    expect(src).toContain('const [position, setPosition] = useState({ latitude: 48.8566, longitude: 2.3522, });');
    expect(src).toContain('const [etatPhoto, setEtatPhoto] = useState<"en_cours" | "exploitable" | "inexploitable" | "echec">("echec");');
  });

  it('« Refaire le test » ne passe PAS par l’accueil : la reprise reste intacte', () => {
    const j = src.indexOf('onRefaireTest={() => {');
    const bloc = src.slice(j, src.indexOf('}}', j));
    expect(bloc).not.toContain('setEtape("accueil")');
    expect(bloc).not.toContain('reinitialiserSessionTest');
  });
});
