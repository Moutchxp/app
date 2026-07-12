import { describe, it, expect } from 'vitest';
import {
  consentementActif,
  derniereDecisionParFinalite,
  FINALITES_SEED,
  type LigneConsentement,
} from './consentement';

const F1 = FINALITES_SEED.recontactInterne;
const F2 = FINALITES_SEED.emailMarketing;

describe('consentementActif — invariant « la dernière décision fait foi »', () => {
  it('aucune décision → INACTIF (jamais actif par défaut)', () => {
    expect(consentementActif([], F1)).toBe(false);
  });

  it('une seule décision « accorde » → ACTIF', () => {
    const h: LigneConsentement[] = [{ finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 }];
    expect(consentementActif(h, F1)).toBe(true);
  });

  it('« refuse » → INACTIF', () => {
    const h: LigneConsentement[] = [{ finalite: F1, etat: 'refuse', horodatage: '2026-07-01T10:00:00Z', id: 1 }];
    expect(consentementActif(h, F1)).toBe(false);
  });

  it('« accorde » puis « retire » (plus récent) → INACTIF (retrait non destructif)', () => {
    const h: LigneConsentement[] = [
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 },
      { finalite: F1, etat: 'retire', horodatage: '2026-07-02T09:00:00Z', id: 2 },
    ];
    expect(consentementActif(h, F1)).toBe(false);
  });

  it('« retire » puis « re-accorde » (plus récent) → ACTIF', () => {
    const h: LigneConsentement[] = [
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 },
      { finalite: F1, etat: 'retire', horodatage: '2026-07-02T09:00:00Z', id: 2 },
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-03T08:00:00Z', id: 3 },
    ];
    expect(consentementActif(h, F1)).toBe(true);
  });

  it('même horodatage → tie-break par id (bigserial monotone : la ligne d’id supérieur gagne)', () => {
    const h: LigneConsentement[] = [
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 5 },
      { finalite: F1, etat: 'retire', horodatage: '2026-07-01T10:00:00Z', id: 6 },
    ];
    expect(consentementActif(h, F1)).toBe(false); // id 6 (« retire ») est la décision retenue
  });

  it('ordre d’arrivée quelconque : la plus récente l’emporte, pas la dernière du tableau', () => {
    const h: LigneConsentement[] = [
      { finalite: F1, etat: 'retire', horodatage: '2026-07-02T09:00:00Z', id: 2 },
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 }, // plus ancienne, placée en dernier
    ];
    expect(consentementActif(h, F1)).toBe(false);
  });

  it("finalités indépendantes : F1 actif n'implique jamais F2", () => {
    const h: LigneConsentement[] = [{ finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 }];
    expect(consentementActif(h, F1)).toBe(true);
    expect(consentementActif(h, F2)).toBe(false);
  });

  it('derniereDecisionParFinalite : une entrée par finalité, la plus récente', () => {
    const h: LigneConsentement[] = [
      { finalite: F1, etat: 'accorde', horodatage: '2026-07-01T10:00:00Z', id: 1 },
      { finalite: F1, etat: 'retire', horodatage: '2026-07-05T10:00:00Z', id: 4 },
      { finalite: F2, etat: 'accorde', horodatage: '2026-07-02T10:00:00Z', id: 2 },
    ];
    const m = derniereDecisionParFinalite(h);
    expect(m.size).toBe(2);
    expect(m.get(F1)?.etat).toBe('retire');
    expect(m.get(F2)?.etat).toBe('accorde');
  });
});
