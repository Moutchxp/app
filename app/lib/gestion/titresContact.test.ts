import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { choixDe, PERSONNALISE, TITRES_CONTACT, valeurDuChoix } from './syndics';

/**
 * 🔴 Accord d'Arno (18/10/2026) : « Gestionnaire de copropriété » et « Comptable » AJOUTÉS EN TÊTE de la liste commune des
 * fonctions des contacts de syndic — rien n'est retiré ni renommé. La liste est la même source pour la fiche syndic de la
 * Gestion et pour la modale de la tuile Location.
 */
describe('🔴 fonctions des contacts du syndic : la liste commune de la Gestion', () => {
  it('les deux nouvelles en tête, les deux anciennes inchangées derrière', () => {
    expect(TITRES_CONTACT).toEqual(['Gestionnaire de copropriété', 'Comptable', 'Responsable de copropriété', 'Service comptabilité']);
  });
  it('un titre déjà saisi garde son texte : prédéfini ⇒ son choix, autre ⇒ « Personnalisé » + libre', () => {
    expect(choixDe('Comptable', TITRES_CONTACT)).toEqual({ choix: 'Comptable', libre: '' });
    expect(choixDe('personnel', TITRES_CONTACT)).toEqual({ choix: PERSONNALISE, libre: 'personnel' });
    expect(valeurDuChoix(PERSONNALISE, 'personnel')).toBe('personnel');
  });
  it('la fiche syndic de la Gestion et la modale de la Location lisent la même liste', () => {
    for (const f of ['app/(admin)/admin/(protected)/gestion/FicheSyndic.tsx', 'app/(admin)/admin/(protected)/gestion/SyndicConnuLocation.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/options=\{TITRES_CONTACT\}|TITRES_CONTACT\.map/);
    }
  });
});
