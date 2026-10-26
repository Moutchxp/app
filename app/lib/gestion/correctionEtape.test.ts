import { describe, it, expect } from 'vitest';
import {
  NATURES_CARTE, NATURES_POINT, REFUS_NATURE_BORNE, REFUS_TITRE_LIBRE, REFUS_VERS_BORNE, estBorne, familleDe, motCorrection,
  motRetrait, natureParDefautApresTransformation, naturesPour, peutRevenirAutomatique, phraseDelier, validerCorrection,
} from './correctionEtape';
import { MENTION_DATE_RDV } from './frise';

/** LOT FRISE-CORRECTION-MANUELLE — les règles pures, partagées par la route et par l'écran. */
describe('point ou carte', () => {
  it('la famille vient du type : un commentaire est un point, un RDV une carte', () => {
    expect(familleDe('commentaire')).toBe('point');
    expect(familleDe('rdv_intervention')).toBe('carte');
    expect(naturesPour('point')).toBe(NATURES_POINT);
    expect(naturesPour('carte')).toBe(NATURES_CARTE);
  });

  it('aucune borne n’est proposée comme nature de correction', () => {
    for (const b of ['ouverture', 'cloture', 'reouverture'] as const) {
      expect(estBorne(b)).toBe(true);
      expect(NATURES_CARTE).not.toContain(b);
      expect(NATURES_POINT).not.toContain(b);
    }
  });

  it('transformer propose une nature de l’autre famille', () => {
    expect(familleDe(natureParDefautApresTransformation('commentaire'))).toBe('carte');
    expect(natureParDefautApresTransformation('facture')).toBe('devis_recu');
    expect(familleDe(natureParDefautApresTransformation('rdv_intervention'))).toBe('point');
  });
});

describe('valider une correction', () => {
  it('point → carte, avec une date : accepté, la date change', () => {
    expect(validerCorrection({ type: 'commentaire', jour: '2026-10-23' }, { type: 'rdv_intervention', titre: ' RDV ', jour: '2026-10-28' }))
      .toEqual({ refus: null, type: 'rdv_intervention', titre: 'RDV', jour: '2026-10-28', dateInchangee: false });
  });

  it('même jour : la date est gardée à la seconde (dateInchangee)', () => {
    const v = validerCorrection({ type: 'commentaire', jour: '2026-10-23' }, { type: 'note', titre: null, jour: '2026-10-23' });
    expect(v).toMatchObject({ refus: null, dateInchangee: true });
  });

  it('borne : le titre se corrige, la date est IGNORÉE (pas refusée), la nature est refusée', () => {
    expect(validerCorrection({ type: 'ouverture', jour: '2026-10-23' }, { type: 'ouverture', titre: 'Accusé', jour: '2030-01-01' }))
      .toEqual({ refus: null, type: 'ouverture', titre: 'Accusé', jour: '2026-10-23', dateInchangee: true });
    expect(validerCorrection({ type: 'cloture', jour: '2026-10-23' }, { type: 'commentaire', titre: null, jour: null }))
      .toEqual({ refus: REFUS_NATURE_BORNE });
  });

  it('on ne transforme rien EN borne', () => {
    expect(validerCorrection({ type: 'commentaire', jour: null }, { type: 'cloture', titre: null, jour: null })).toEqual({ refus: REFUS_VERS_BORNE });
  });

  it('carte libre sans titre, rendez-vous sans date, date mal formée : refusés avec leur motif', () => {
    expect(validerCorrection({ type: 'commentaire', jour: null }, { type: 'autre', titre: '  ', jour: null })).toEqual({ refus: REFUS_TITRE_LIBRE });
    expect(validerCorrection({ type: 'commentaire', jour: null }, { type: 'rdv_intervention', titre: null, jour: null })).toEqual({ refus: MENTION_DATE_RDV });
    expect(validerCorrection({ type: 'commentaire', jour: null }, { type: 'note', titre: null, jour: '28/10/2026' }).refus).not.toBeNull();
  });
});

describe('ce que l’écran dit d’une correction', () => {
  const base = { source: 'monga' as const, corrigeLe: '2026-10-26 09:12:00', corrigeParLibelle: 'Arnaud' };
  it('« classé automatiquement en point, corrigé en carte par Arnaud le 26/10/2026 »', () => {
    expect(motCorrection({ ...base, type: 'rdv_intervention', autoType: 'commentaire' }))
      .toBe('classé automatiquement en point, corrigé en carte par Arnaud le 26/10/2026');
  });
  it('même famille : les deux natures sont nommées', () => {
    expect(motCorrection({ ...base, type: 'note', autoType: 'commentaire' }))
      .toBe('classé automatiquement « Commentaire Monga », corrigé en « Note » par Arnaud le 26/10/2026');
  });
  it('jamais corrigée : rien à dire ; manuelle corrigée : « corrigée à la main »', () => {
    expect(motCorrection({ source: 'monga', type: 'commentaire' })).toBeNull();
    expect(motCorrection({ ...base, source: 'manuelle', type: 'note' })).toBe('corrigée à la main par Arnaud le 26/10/2026');
  });
  it('retrait et retour à l’automatique', () => {
    expect(motRetrait({ source: 'monga', type: 'ouverture', retireLe: '2026-10-26 10:00:00', retireParLibelle: 'Arnaud' }))
      .toBe('retiré de la frise par Arnaud le 26/10/2026');
    expect(peutRevenirAutomatique({ source: 'monga', type: 'note', autoType: 'commentaire' })).toBe(true);
    expect(peutRevenirAutomatique({ source: 'manuelle', type: 'note', autoType: null })).toBe(false);
    expect(peutRevenirAutomatique({ source: 'monga', type: 'note' })).toBe(false);
  });
  it('la confirmation de « Délier » dit ce qui va se passer, en clair', () => {
    const p = phraseDelier('MNG-25126', 'GES-2026-000011');
    expect(p).toContain('MNG-25126');
    expect(p).toContain('GES-2026-000011');
    expect(p).toContain('quittent cette frise');
    expect(p).toContain('restent dans l’historique du bien');
    expect(p).toContain('relier à nouveau');
  });
});
