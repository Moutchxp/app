import { describe, it, expect } from 'vitest';
import { validerCorpsIngestion, consentementServicePresent, auMoinsUnConsentement } from './ingestion';
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

describe('consentementServicePresent — recontactabilité F1 (PAS la porte de création)', () => {
  it('F1 présent → true (recontactable par téléphone)', () => {
    expect(consentementServicePresent([{ finalite: 'recontact_interne', version: 1 }])).toBe(true);
  });
  it('seulement F2 → false (pas recontactable par téléphone, même si un profil PEUT être créé)', () => {
    expect(consentementServicePresent([{ finalite: 'email_marketing', version: 1 }])).toBe(false);
  });
  it('liste vide → false', () => {
    expect(consentementServicePresent([])).toBe(false);
  });
});

describe('auMoinsUnConsentement — PORTE DE CRÉATION élargie (au moins un des 3)', () => {
  it('F1 seul → true (profil créé, non-régression)', () => {
    expect(auMoinsUnConsentement([{ finalite: 'recontact_interne', version: 1 }])).toBe(true);
  });
  it('F2 SEUL → true : profil créé + consentement F2 persistable (le trou RGPD est fermé)', () => {
    expect(auMoinsUnConsentement([{ finalite: 'email_marketing', version: 1 }])).toBe(true);
  });
  it('F1 + F2 → true', () => {
    expect(
      auMoinsUnConsentement([
        { finalite: 'recontact_interne', version: 1 },
        { finalite: 'email_marketing', version: 1 },
      ]),
    ).toBe(true);
  });
  it('AUCUN consentement → false (certificat délivré ailleurs, mais AUCUN profil créé — non-couplage)', () => {
    expect(auMoinsUnConsentement([])).toBe(false);
  });
});

describe('catalogue de textes de consentement', () => {
  it('F1 (service) v1 existe', () => {
    expect(texteExiste(FINALITE_SERVICE, 1)).toBe(true);
  });
  it('une version inconnue n’existe pas', () => {
    expect(texteExiste(FINALITE_SERVICE, 999)).toBe(false);
  });
  it('F2 (email marketing) v1 existe', () => {
    expect(texteExiste('email_marketing', 1)).toBe(true);
  });
  it('F1 et F2 sont affichées dans le tunnel ; F3 reste masquée', () => {
    const actives = finalitesActivesTunnel();
    expect(actives.map((t) => t.finalite)).toEqual(['recontact_interne', 'email_marketing']);
  });
  it('F2 porte un titre de section (mise en page dédiée) et son libellé vient du catalogue', () => {
    const f2 = finalitesActivesTunnel().find((t) => t.finalite === 'email_marketing');
    expect(f2?.titre).toBe('Votre accord pour l’envoi de mails');
    expect(f2?.libelleCase).toContain('sansvisavis.com');
  });
  it('aucun texte du catalogue ne mentionne « juriste » ni « provisoire » (textes définitifs)', () => {
    const tous = finalitesActivesTunnel();
    for (const t of tous) {
      expect(`${t.libelleCase} ${t.contenu} ${t.titre ?? ''}`.toLowerCase()).not.toContain('juriste');
      expect(`${t.libelleCase} ${t.contenu} ${t.titre ?? ''}`.toLowerCase()).not.toContain('provisoire');
    }
  });
});
