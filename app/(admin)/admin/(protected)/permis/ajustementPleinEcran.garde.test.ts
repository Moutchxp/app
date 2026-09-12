import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * BAT (défaut 1) — GARDE par lecture de source (BlocTraceEmprise est un composant client lourd, non monté en test, cf. autres gardes du
 * dossier). Elle verrouille la correction du bug « poignées absentes à l'arrivée en plein écran » et son garde-fou « pas de session parasite » :
 *  · l'OUVERTURE arme une session d'ajustement (poignées d'emblée) — `ouvrirPleinEcran` appelle `demarrerAjustement` ;
 *  · la FERMETURE purge une session intouchée (ajustement OU retouche) — `fermerPleinEcran` appelle `purgerSessionIntouchee` ;
 *  · TOUTES les sorties (bouton ✕, fond du dialogue, touche Échap) passent par `fermerPleinEcran` (jamais un `setPleinEcran(false)` nu qui
 *    laisserait fuir une session provisoire vers la vue normale).
 * Assertions SÉMANTIQUES sur une source whitespace-normalisée (aucun saut de ligne → `.` suffit, pas besoin du flag dotAll).
 */
const SRC = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const corps = (nom: string): string => SRC.match(new RegExp(`const ${nom} = useCallback\\(\\(\\) => \\{.*?\\}, \\[`))?.[0] ?? '';

describe('BlocTraceEmprise — armement des poignées à l’ouverture, purge à la fermeture (plein écran)', () => {
  it('ouvrirPleinEcran ARME une session (demarrerAjustement) sans exiger de geste préalable', () => {
    const bloc = corps('ouvrirPleinEcran');
    expect(bloc).toContain('setPleinEcran(true)');
    expect(bloc).toContain('demarrerAjustement(');
  });

  it('fermerPleinEcran PURGE une session intouchée (purgerSessionIntouchee)', () => {
    const bloc = corps('fermerPleinEcran');
    expect(bloc).toContain('setPleinEcran(false)');
    expect(bloc).toContain('purgerSessionIntouchee()');
  });

  it('quitter l’XL PURGE aussi une session intouchée (quitterImageAgrandie), et la bascule XL sort par là', () => {
    const bloc = corps('quitterImageAgrandie');
    expect(bloc).toContain('setImageAgrandie(false)');
    expect(bloc).toContain('purgerSessionIntouchee()');
    expect(corps('basculerImageAgrandie')).toContain('quitterImageAgrandie()'); // la sortie XL (bouton + liseuse) passe par la purge
    expect(SRC).toMatch(/Escape' && !planSeul\) quitterImageAgrandie\(\)/);      // Échap en XL purge aussi
  });

  it('le bouton « Agrandir le schéma » ouvre via ouvrirPleinEcran (jamais un setPleinEcran(true) nu)', () => {
    expect(SRC).toContain('onClick={ouvrirPleinEcran}>⤢ Agrandir le schéma');
  });

  it('les TROIS sorties (fond, ✕, Échap) passent par fermerPleinEcran', () => {
    expect(SRC).toContain('onClick={fermerPleinEcran}'); // fond du dialogue + bouton ✕
    expect(SRC).toMatch(/Escape'\) fermerPleinEcran\(\)/); // touche Échap
    // aucune sortie ne doit rester un setPleinEcran(false) nu DANS le JSX (le seul est encapsulé dans fermerPleinEcran)
    expect((SRC.match(/setPleinEcran\(false\)/g) ?? []).length).toBe(1);
  });

  it('la purge ne concerne qu’une session intouchée (jamais le mode bloc, ni un ajustement/retouche modifié) et couvre les DEUX natures', () => {
    const bloc = corps('purgerSessionIntouchee');
    expect(bloc).toContain('!a.bloc');                 // le geste d'ENSEMBLE (explicite) n'est pas purgé
    expect(bloc).toContain('estAjustementModifie');    // un AJUSTEMENT modifié (travail non enregistré) est conservé
    expect(bloc).toContain('estRetoucheModifiee(r.hist.length)'); // une RETOUCHE intouchée (historique vide) est purgée ; modifiée → conservée
  });
});
