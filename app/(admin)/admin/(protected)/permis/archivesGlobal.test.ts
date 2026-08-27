import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔑 D3-fix — GARDE : l'onglet Archives est GLOBAL (une fois les documents obtenus, le process d'origine ne détermine plus aucun
 * geste). Un filtre de process qui réapparaîtrait ici serait INVISIBLE À L'ŒIL : on ne remarque pas qu'une archive manque. Ce
 * test CASSE si `ArchivesVue` refiltre par process (appel `dansProcess`, import du module process, ou prop `process`) — et si le
 * commutateur redevient affiché sur Archives (PermisTuile).
 */
const RACINE = process.cwd();
const lire = (rel: string): string => readFileSync(join(RACINE, rel), 'utf8');

describe('D3-fix — Archives ne filtre JAMAIS par process', () => {
  const src = lire('app/(admin)/admin/(protected)/permis/ArchivesVue.tsx');

  it('ArchivesVue n’appelle pas dansProcess et n’importe pas le module process', () => {
    expect(src).not.toMatch(/dansProcess\s*\(/);
    expect(src).not.toMatch(/from ['"][^'"]*\/sitadel\/process['"]/);
  });

  it('ArchivesVue ne prend AUCUNE prop process (signature globale)', () => {
    // signature à paramètres vides, et jamais un « process » dans les props.
    expect(src).toMatch(/export function ArchivesVue\s*\(\s*\)/);
    expect(src).not.toMatch(/export function ArchivesVue\s*\([^)]*\bprocess\b/);
  });

  it('la liste rendue/paginée est `archives` (non filtrée), pas une variable scopée', () => {
    expect(src).toMatch(/archives\.slice\(/); // pagination sur la liste ENTIÈRE
    expect(src).not.toMatch(/archivesP\b/);   // plus de variable filtrée par process
  });

  it('PermisTuile n’affiche pas le commutateur sur Archives et ne lui passe pas de process', () => {
    const tuile = lire('app/(admin)/admin/(protected)/permis/PermisTuile.tsx');
    // 'archives' n'est PAS dans la liste des onglets coiffés par le commutateur.
    expect(tuile).toMatch(/ONGLETS_DEMANDES[^\n]*=\s*\[[^\]]*\]/);
    const ligne = tuile.match(/ONGLETS_DEMANDES[^\n]*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(ligne).not.toContain('archives');
    // ArchivesVue montée SANS prop process.
    expect(tuile).toMatch(/<ArchivesVue\s*\/>/);
    expect(tuile).not.toMatch(/<ArchivesVue[^/]*process/);
  });
});
