import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Page de résultat (lot SCORE-BOUTONS, 16/10/2026) : cercle d'attente retiré, rebond final unique du score,
// « Refaire une analyse » sur les deux verdicts, lien d'accueil aligné à gauche sur la page certifiée.
const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
// Fin de l'écran de résultat : le début de l'écran suivant (lot REPRISE-CARACTERISTIQUES : `const TYPES_BIEN =` n'est plus
// dans la page, la liste vient de `repriseCaracteristiques`).
const ecran = page.slice(page.indexOf('function EcranResultat({'), page.indexOf('function sessionAppareil('));
const boutons = ecran.slice(ecran.indexOf('{/* 6. BOUTONS'));
const certifie = boutons.slice(boutons.indexOf('{certifie ? ('), boutons.indexOf(') : ( <> <button type="button" onClick={onRefaireTest}'));
const visAVis = boutons.slice(boutons.indexOf(') : ( <> <button type="button" onClick={onRefaireTest}'));

describe('jauge du score', () => {
  it('le cercle d’attente rouge tournant n’existe plus sur la page de score', () => {
    expect(ecran).not.toContain('animate-spin');
  });
  it('l’animation de remplissage de l’anneau et la montée du chiffre sont inchangées', () => {
    expect(ecran).toContain('const DUREE = 2500;');
    expect(ecran).toContain('const c1 = 1.70158, c3 = c1 + 1; // easeOutBack');
    expect(ecran).toContain('const offset = C * (1 - Math.max(0, Math.min(100, scoreAnime)) / 100);');
    expect(ecran).toContain('strokeDashoffset={offset}');
    expect(ecran).toContain('{Math.round(scoreAnime)}');
  });
  it('la légende sous la jauge garde ses trois états', () => {
    expect(ecran).toContain('Score partiel');
    expect(ecran).toContain('"Score global"');
    expect(ecran).toContain('Score estimé');
  });
});

describe('rebond final du score', () => {
  it('les classes Tailwind restent séparées de l’interpolation (sinon Tailwind ne génère pas items-baseline et « /100 » remonte)', () => {
    expect(ecran).toContain('<div className={`flex items-baseline ${bumpScore ? "svv-score-bump" : ""}`}>');
  });
  it('se déclenche une seule fois, quand le chiffre est définitif (dernière image du reveal)', () => {
    expect(ecran).toContain('if (t >= 1) { setScoreAnime(cible); setBumpScore(true); return; }');
    expect(ecran).toContain('animation: svvScoreBump 600ms ease-out 1;');
    expect(ecran).not.toMatch(/svvScoreBump[^;]*infinite/);
  });
  it('reste discret : grossissement maximal 1,08', () => {
    const kf = ecran.slice(ecran.indexOf('@keyframes svvScoreBump'), ecran.indexOf('@media (prefers-reduced-motion: reduce)'));
    const echelles = [...kf.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(Math.max(...echelles)).toBe(1.08);
  });
  it('jamais sous « réduire les animations » : ni déclenché par le code, ni joué par le CSS', () => {
    const effet = ecran.slice(ecran.indexOf('const cible = resultat.score.total;'));
    const reduit = effet.slice(0, effet.indexOf('const DUREE'));
    expect(reduit).toContain('setBumpScore(false);');
    expect(reduit).not.toContain('setBumpScore(true)');
    expect(ecran).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\}[^}]*\}[^}]*\.svv-score-bump \{ animation: none; \}/);
  });
});

describe('boutons de la page de résultat', () => {
  it('certifié : « Refaire une analyse » entre « Obtenir mon certificat » et « Calculer la plus-value de ma vue »', () => {
    const iCert = certifie.indexOf('Obtenir mon certificat');
    const iRefaire = certifie.indexOf('Refaire une analyse');
    const iPlus = certifie.indexOf('Calculer la plus-value de ma vue');
    expect(iCert).toBeGreaterThan(-1);
    expect(iRefaire).toBeGreaterThan(iCert);
    expect(iPlus).toBeGreaterThan(iRefaire);
  });
  it('certifié : fond blanc, bordure et texte rouges ; même geste que la page vis-à-vis', () => {
    expect(certifie).toContain('<button type="button" onClick={onRefaireTest} className="svv-btn svv-btn-outline svv-btn-outline--danger mt-3">');
  });
  it('vis-à-vis : seul le libellé change (« Refaire une analyse »), même bouton plein rouge, même place', () => {
    expect(visAVis).toContain('<button type="button" onClick={onRefaireTest} className="svv-btn svv-btn-primary">');
    expect(visAVis.indexOf('Refaire une analyse')).toBeLessThan(visAVis.indexOf('Estimation immobilière'));
    expect(ecran).not.toContain('Refaire le test </button>');
  });
  it('« Retour à l’accueil » : aligné à gauche sur la page certifiée seulement', () => {
    expect(boutons).toContain('className={`svv-link mt-1 ${certifie ? "justify-start" : ""}`}');
  });
});
