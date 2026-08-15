import { describe, it, expect } from 'vitest';
import { MARQUEUR_FICHE_SYNTHESE, PREFIXE_NOTE_VERSEMENT_AUTO } from './gedConstantes';

/**
 * N6-F — les constantes de note GED sont la SOURCE UNIQUE partagée par l'écrivain (depotManuel) et le lecteur
 * (lireDocumentsManuels). Ce test VERROUILLE leur valeur EXACTE : le préfixe de versement automatique doit correspondre
 * MOT POUR MOT à ce qui est DÉJÀ en base (vérifié en lecture) — sinon les pièces existantes ne seraient plus reconnues et il
 * faudrait un rattrapage de données. Le tiret est un cadratin « — » (U+2014), avec une espace finale.
 */
describe('N6-F — constantes de note GED (valeurs exactes, anti-rattrapage)', () => {
  it('préfixe versement auto = « versement automatique — message » (em-dash U+2014, espace finale)', () => {
    expect(PREFIXE_NOTE_VERSEMENT_AUTO).toBe('versement automatique — message ');
    expect(PREFIXE_NOTE_VERSEMENT_AUTO).toContain('—'); // tiret cadratin, pas un tiret simple
    expect(PREFIXE_NOTE_VERSEMENT_AUTO.endsWith(' ')).toBe(true);
  });
  it('une note réelle commence bien par ce préfixe (échantillon du dossier 11434)', () => {
    const noteReelle = 'versement automatique — message <CADzMkGJQ+YiyhAy46TV4Zg+xiASx1Hjx3_WCUdQgU+6BtB_KOw@mail.gmail.com>';
    expect(noteReelle.startsWith(PREFIXE_NOTE_VERSEMENT_AUTO)).toBe(true);
    expect(noteReelle.startsWith(MARQUEUR_FICHE_SYNTHESE)).toBe(false);
  });
});
