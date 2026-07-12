import { describe, it, expect } from 'vitest';
import { validerCorpsIngestion, consentementServicePresent } from './ingestion';
import { finalitesActivesTunnel, texteExiste, FINALITE_SERVICE } from './textesConsentement';

function corpsValide(overrides: Record<string, unknown> = {}) {
  return {
    identite: { prenom: 'Ada', nom: 'Lovelace', email: 'ada@example.com', telephone: '+33612345678' },
    consentements: [{ finalite: 'recontact_interne', version: 1 }],
    projet: {
      versionTunnel: 1,
      payload: { typeBien: 'appartement', surface: '75' },
      verdict: 'SANS_VIS_A_VIS',
      score: 42.5,
      etage: 3,
      dernierEtage: true,
      residencePrincipale: true,
      communeInsee: '92004',
      lat: 48.9,
      lon: 2.26,
      adresseSaisie: '1 rue X',
      adresseNormalisee: '1 Rue X, 92004',
    },
    ...overrides,
  };
}

describe('validerCorpsIngestion — chemin nominal', () => {
  it('un corps complet et valide → ok, normalisé', () => {
    const r = validerCorpsIngestion(corpsValide());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.corps.identite.email).toBe('ada@example.com');
      expect(r.corps.consentements).toHaveLength(1);
      expect(r.corps.projet.verdict).toBe('SANS_VIS_A_VIS');
      expect(r.corps.projet.score).toBe(42.5);
    }
  });

  it('trim l’identité', () => {
    const r = validerCorpsIngestion(corpsValide({ identite: { prenom: '  Ada  ', nom: ' Lovelace ', email: ' ada@example.com ' } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.corps.identite.prenom).toBe('Ada');
      expect(r.corps.identite.telephone).toBeNull(); // absent → null (nullable)
    }
  });

  it('colonnes stables nullables : un projet INDÉTERMINÉ (verdict null, score null) reste valide', () => {
    const r = validerCorpsIngestion(
      corpsValide({ projet: { versionTunnel: 1, payload: {}, verdict: null, score: null, communeInsee: null } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('validerCorpsIngestion — rejets', () => {
  it('corps non-objet → erreur', () => {
    expect(validerCorpsIngestion(null).ok).toBe(false);
    expect(validerCorpsIngestion('x').ok).toBe(false);
  });

  it('email invalide → erreur', () => {
    const r = validerCorpsIngestion(corpsValide({ identite: { prenom: 'A', nom: 'B', email: 'pas-un-email' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('email invalide');
  });

  it('prénom/nom manquants → erreur', () => {
    const r = validerCorpsIngestion(corpsValide({ identite: { prenom: '', nom: '', email: 'a@b.co' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs).toContain('prenom requis');
      expect(r.erreurs).toContain('nom requis');
    }
  });

  it('consentement inconnu (version forgée) → erreur (anti-forge)', () => {
    const r = validerCorpsIngestion(corpsValide({ consentements: [{ finalite: 'recontact_interne', version: 99 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.some((e) => e.includes('consentement inconnu'))).toBe(true);
  });

  it('verdict hors énumération → erreur', () => {
    const r = validerCorpsIngestion(corpsValide({ projet: { versionTunnel: 1, payload: {}, verdict: 'PEUT_ETRE' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('verdict invalide');
  });

  it('versionTunnel manquant → erreur', () => {
    const r = validerCorpsIngestion(corpsValide({ projet: { payload: {} } }));
    expect(r.ok).toBe(false);
  });

  it('etage fractionnaire forgé (3.5) → erreur (entier attendu)', () => {
    const r = validerCorpsIngestion(corpsValide({ projet: { versionTunnel: 1, payload: {}, etage: 3.5 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('etage invalide');
  });

  it('commune_insee non conforme au format INSEE → erreur (null reste accepté)', () => {
    const mauvais = validerCorpsIngestion(corpsValide({ projet: { versionTunnel: 1, payload: {}, communeInsee: '9200' } }));
    expect(mauvais.ok).toBe(false);
    if (!mauvais.ok) expect(mauvais.erreurs).toContain('communeInsee invalide');
    const nul = validerCorpsIngestion(corpsValide({ projet: { versionTunnel: 1, payload: {}, communeInsee: null } }));
    expect(nul.ok).toBe(true);
  });
});

describe('consentementServicePresent — porte F1', () => {
  it('F1 présent → true', () => {
    expect(consentementServicePresent([{ finalite: 'recontact_interne', version: 1 }])).toBe(true);
  });
  it('seulement F2 → false (pas de profil recontactable sans F1)', () => {
    expect(consentementServicePresent([{ finalite: 'email_marketing', version: 1 }])).toBe(false);
  });
  it('liste vide → false', () => {
    expect(consentementServicePresent([])).toBe(false);
  });
});

describe('catalogue de textes de consentement', () => {
  it('F1 (service) v1 existe', () => {
    expect(texteExiste(FINALITE_SERVICE, 1)).toBe(true);
  });
  it('une version inconnue n’existe pas', () => {
    expect(texteExiste(FINALITE_SERVICE, 999)).toBe(false);
  });
  it('seule F1 est affichée dans le tunnel au lancement', () => {
    const actives = finalitesActivesTunnel();
    expect(actives.map((t) => t.finalite)).toEqual([FINALITE_SERVICE]);
  });
});
