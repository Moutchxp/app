import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔑 LOT 40 — GARDE : le commutateur de process (E-mail / Téléservice + « Hors process ») a été RETIRÉ de l'onglet « Réponses »
 * (ses compteurs comptent la population « en cours », réponses EXCLUES → ils contredisaient le contenu de l'onglet). Deux
 * exigences INVISIBLES à l'œil que ce test verrouille :
 *   1) le commutateur n'est plus monté dans « Réponses » (ONGLETS_DEMANDES = À demander + En cours seulement) ;
 *   2) EFFET DE BORD — la liste des réponses n'est PLUS filtrée par rail : `ReponsesVue` ne prend plus de prop `process` et
 *      n'appelle plus `dansProcess`, donc elle affiche TOUS les rails (e-mail ET téléservice). Un filtre qui réapparaîtrait
 *      re-viderait la liste au dernier rail choisi ailleurs — exactement le piège à empêcher.
 * Test par lecture de source (comme archivesGlobal.test.ts) : le rendu par onglet n'est pas montable unitairement ici.
 */
const RACINE = process.cwd();
const lire = (rel: string): string => readFileSync(join(RACINE, 'app/(admin)/admin/(protected)/permis/', rel), 'utf8');

describe('LOT 40 — commutateur retiré de « Réponses »', () => {
  const tuile = lire('PermisTuile.tsx');

  it('ONGLETS_DEMANDES ne contient plus « reponses » (commutateur non monté dans Réponses)', () => {
    const ligne = tuile.match(/ONGLETS_DEMANDES[^\n]*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(ligne).toContain('a_demander');
    expect(ligne).toContain('en_cours');
    expect(ligne).not.toContain('reponses');
  });

  it('ReponsesVue est monté SANS prop process (l’onglet n’est plus scopé par rail)', () => {
    const compact = tuile.replace(/\s+/g, ' ');
    expect(compact).toMatch(/<ReponsesVue onRecompter=\{apresAction\} \/>/);
    expect(compact).not.toMatch(/<ReponsesVue[^>]*\bprocess=/);
  });

  it('EFFET DE BORD — ReponsesVue n’a plus de prop process ni de filtre dansProcess (affiche TOUS les rails)', () => {
    const src = lire('ReponsesVue.tsx');
    expect(src).not.toMatch(/dansProcess\s*\(/);                                   // plus de filtre par canal
    expect(src).not.toMatch(/from ['"][^'"]*\/sitadel\/process['"]/);             // import du module process retiré
    expect(src).toMatch(/export function ReponsesVue\(\{\s*onRecompter\s*\}/);     // signature sans `process`
    expect(src).not.toMatch(/process === 'formulaire'/);                          // bloc « Dépôts à confirmer » n'est plus gardé par le rail
    expect(src).not.toMatch(/process === 'email'/);                              // bloc « Relances préparées » non plus
    expect(src).toContain('return data.demandes.map((d) =>');                     // la liste part de TOUTES les demandes, sans filtre
  });
});
