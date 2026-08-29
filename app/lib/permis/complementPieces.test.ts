import { describe, it, expect } from 'vitest';
import { composerComplementPieces, estNoReply, entetesFil } from './complementPieces';

describe('entetesFil — répondre dans le fil du dernier message', () => {
  it('In-Reply-To = Message-ID reçu ; References = chaîne existante + Message-ID', () => {
    const r = entetesFil('<abc@mairie.fr>', '<x@svav.com> <y@mairie.fr>');
    expect(r.inReplyTo).toBe('<abc@mairie.fr>');
    expect(r.references).toBe('<x@svav.com> <y@mairie.fr> <abc@mairie.fr>');
  });
  it('sans References préalables → References = juste le Message-ID', () => {
    expect(entetesFil('<abc@mairie.fr>', null).references).toBe('<abc@mairie.fr>');
  });
});

describe('estNoReply', () => {
  it('reconnaît les adresses non répondables', () => {
    expect(estNoReply('no-reply@paris.fr')).toBe(true);
    expect(estNoReply('noreply@paris.fr')).toBe(true);
    expect(estNoReply('ne-pas-repondre@mairie.fr')).toBe(true);
    expect(estNoReply('')).toBe(true);
    expect(estNoReply(null)).toBe(true);
  });
  it('accepte une adresse personnelle répondable', () => {
    expect(estNoReply('lauriane.pangui@mairie-aubervilliers.fr')).toBe(false);
    expect(estNoReply('urba-reglementaire@mairie-aubervilliers.fr')).toBe(false);
  });
});

/** PART-3a — générateur PUR du courriel « complément de pièces ». Complément de dossier courtois, JAMAIS une relance de cascade. */
describe('composerComplementPieces', () => {
  it('ne cite QUE les familles demandées (2 manquantes, 1 cochée → 1 seule dans le corps)', () => {
    const r = composerComplementPieces('0930012500081', ['etage'])!;
    expect(r.corps).toContain('plans des différents niveaux');
    expect(r.corps).not.toContain('Cerfa'); // la famille NON cochée n'apparaît pas
    expect(r.corps).not.toContain('plan de masse');
    expect(r.corps).not.toContain('plan de coupe');
  });

  it('rappelle le NUMÉRO DE PERMIS (pas la référence interne) dans l’objet et le corps, et remercie pour les pièces déjà transmises', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa', 'etage'])!;
    expect(r.objet).toContain('0930012500081');
    expect(r.objet).not.toContain('SVAV');
    expect(r.corps).toContain('0930012500081');
    expect(r.corps).not.toContain('SVAV');
    expect(r.corps).toContain('déjà transmises');
  });

  it('AUCUNE mention de refus tacite, de CADA ni de Commission d’accès (ce n’est pas une relance)', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa', 'masse', 'coupe', 'etage'])!;
    const c = r.corps.toLowerCase();
    expect(c).not.toContain('refus tacite');
    expect(c).not.toContain('cada');
    expect(c).not.toContain('commission d’accès');
    expect(c).not.toContain('commission d\'accès');
    expect(c).not.toContain('délai');
  });

  it('à la première personne du singulier', () => {
    const r = composerComplementPieces('0930012500081', ['cerfa'])!;
    expect(r.corps).toContain('Je vous remercie');
    expect(r.corps).toContain('je me permets');
  });

  it('ordre stable (masse, coupe, étages, Cerfa) quel que soit l’ordre d’entrée', () => {
    const r = composerComplementPieces('X', ['cerfa', 'coupe', 'masse', 'etage'])!;
    const iMasse = r.corps.indexOf('plan de masse');
    const iCoupe = r.corps.indexOf('plan de coupe');
    const iEtage = r.corps.indexOf('plans des différents niveaux');
    const iCerfa = r.corps.indexOf('formulaire Cerfa');
    expect(iMasse).toBeLessThan(iCoupe);
    expect(iCoupe).toBeLessThan(iEtage);
    expect(iEtage).toBeLessThan(iCerfa);
  });

  it('aucune famille → null (filet ; l’appelant refuse l’envoi en amont)', () => {
    expect(composerComplementPieces('X', [])).toBeNull();
  });
});
