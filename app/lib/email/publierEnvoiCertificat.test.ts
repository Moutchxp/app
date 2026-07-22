import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { recuperer, stockageConfigure } = vi.hoisted(() => ({ recuperer: vi.fn(), stockageConfigure: vi.fn() }));
const { lireConfigEmail, obtenirTransporteur, envoyerCertificat } = vi.hoisted(() => ({
  lireConfigEmail: vi.fn(),
  obtenirTransporteur: vi.fn(),
  envoyerCertificat: vi.fn(),
}));
const { signerJetonRetrait } = vi.hoisted(() => ({ signerJetonRetrait: vi.fn() }));
// Effacement auto (Commit 4-A2) : appelé après le passage à 'envoye'. Mocké en no-op ici → le test de l'ENVOI reste
// centré sur l'envoi ; le comportement de l'effacement est prouvé dans effacementIdentite.test.ts.
const { effacerIdentiteLivraisonSiEligible } = vi.hoisted(() => ({ effacerIdentiteLivraisonSiEligible: vi.fn() }));
// Générateurs des documents SECONDAIRES (anonymisé PDF, visuel PNG) — mockés : le test cible le CÂBLAGE (best-effort,
// pièces jointes), pas le rendu (prouvé dans certificatPdf.test.ts / genererVisuelPng.test.ts).
const { genererBufferCertificat } = vi.hoisted(() => ({ genererBufferCertificat: vi.fn() }));
const { genererVisuelPng } = vi.hoisted(() => ({ genererVisuelPng: vi.fn() }));

vi.mock('../db/client', () => ({ query }));
vi.mock('../stockage', () => ({ recuperer, stockageConfigure }));
vi.mock('../internaute/jetonRectification', () => ({ signerJetonRetrait }));
vi.mock('../internaute/cycleVie', () => ({ effacerIdentiteLivraisonSiEligible }));
vi.mock('./index', () => ({ lireConfigEmail, obtenirTransporteur, envoyerCertificat }));
vi.mock('../pdf/publierCertificatPdf', () => ({ genererBufferCertificat }));
vi.mock('../visuel/genererVisuelPng', () => ({ genererVisuelPng }));

import { publierEnvoiCertificat } from './publierEnvoiCertificat';

const PDF = Buffer.from('pdf-bytes');
const PDF_ANON = Buffer.from('pdf-anonyme-bytes');
const VISUEL = Buffer.from('visuel-png-bytes');
const CONFIG = { host: 'smtp', port: 465, user: 'compte@sansvisavis.com', pass: 'p', from: 'noreply@sansvisavis.com' };
const TRANSP = { sendMail: vi.fn() };

function ligne(over: Record<string, unknown> = {}) {
  return {
    numero: 'SAVV-2026-000123', reference: 'SVAV-K7M2-9QX4', prenom: 'Jean', email: 'client@example.com',
    pdf_cle: 'internautes/a/certificats/x.pdf', internaute_id: 'uuid-internaute-1', a_un_compte: true,
    verdict: 'SANS_VIS_A_VIS', score: '82', type_bien: 'Appartement', surface_m2: '72.35', nb_pieces: 3,
    annee_batiment: 2008, epoque: null, etage: 5, dernier_etage: false, visuel_exterieur: 'Balcon', visuel_ville: 'Asnières-sur-Seine',
    ...over,
  };
}

const ORIG = { ...process.env };
beforeEach(() => {
  query.mockReset();
  recuperer.mockReset();
  stockageConfigure.mockReset();
  lireConfigEmail.mockReset();
  obtenirTransporteur.mockReset();
  envoyerCertificat.mockReset();
  signerJetonRetrait.mockReset();
  process.env.SITE_URL = 'https://www.sansvisavis.com';
  stockageConfigure.mockReturnValue(true);
  lireConfigEmail.mockReturnValue(CONFIG);
  obtenirTransporteur.mockReturnValue(TRANSP);
  envoyerCertificat.mockResolvedValue(undefined);
  signerJetonRetrait.mockResolvedValue('JETON_DESABO_TEST');
  recuperer.mockResolvedValue(PDF);
  genererBufferCertificat.mockReset();
  genererVisuelPng.mockReset();
  genererBufferCertificat.mockResolvedValue(PDF_ANON);
  genererVisuelPng.mockResolvedValue(VISUEL);
  query.mockImplementation(async (sql: string) => (/FROM certificat c/.test(sql) ? { rows: [ligne()] } : { rows: [] }));
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('publierEnvoiCertificat — gardes (pas d’envoi à moitié configuré)', () => {
  it('stockage non configuré → silencieux, aucune requête, aucun envoi', async () => {
    stockageConfigure.mockReturnValue(false);
    await publierEnvoiCertificat(7);
    expect(query).not.toHaveBeenCalled();
    expect(envoyerCertificat).not.toHaveBeenCalled();
  });

  it('config SMTP absente → pas d’envoi, aucune requête', async () => {
    lireConfigEmail.mockReturnValue(null);
    await publierEnvoiCertificat(7);
    expect(query).not.toHaveBeenCalled();
    expect(envoyerCertificat).not.toHaveBeenCalled();
  });

  it('SITE_URL absente → pas d’envoi', async () => {
    delete process.env.SITE_URL;
    await publierEnvoiCertificat(7);
    expect(query).not.toHaveBeenCalled();
  });

  it('destinataire effacé (email NULL) → pas d’envoi, PAS une erreur (aucun statut modifié)', async () => {
    query.mockImplementation(async (sql: string) => (/FROM certificat c/.test(sql) ? { rows: [ligne({ email: null })] } : { rows: [] }));
    await publierEnvoiCertificat(7);
    expect(envoyerCertificat).not.toHaveBeenCalled();
    expect(query.mock.calls.some((c) => /UPDATE/.test(c[0] as string))).toBe(false); // aucun UPDATE
  });

  it('PDF non généré (pdf_cle NULL) → envoi différé, aucun envoi', async () => {
    query.mockImplementation(async (sql: string) => (/FROM certificat c/.test(sql) ? { rows: [ligne({ pdf_cle: null })] } : { rows: [] }));
    await publierEnvoiCertificat(7);
    expect(recuperer).not.toHaveBeenCalled();
    expect(envoyerCertificat).not.toHaveBeenCalled();
  });
});

describe('publierEnvoiCertificat — nominal & échec', () => {
  it('nominal → relit le PDF, envoie (from alias), pied de désabonnement (jeton scellé sur l’internaute), statut → envoye', async () => {
    await publierEnvoiCertificat(7);
    expect(recuperer).toHaveBeenCalledWith('internautes/a/certificats/x.pdf');
    expect(signerJetonRetrait).toHaveBeenCalledWith('uuid-internaute-1'); // jeton scellé sur l'UUID de l'internaute
    expect(envoyerCertificat).toHaveBeenCalledWith(TRANSP, 'noreply@sansvisavis.com', {
      to: 'client@example.com',
      prenom: 'Jean',
      numero: 'SAVV-2026-000123',
      reference: 'SVAV-K7M2-9QX4',
      siteUrl: 'https://www.sansvisavis.com',
      pdf: PDF,
      pdfAnonyme: PDF_ANON, // titulaire de compte → anonymisé joint
      visuelPng: VISUEL, //    titulaire de compte → visuel joint
      jetonDesabonnement: 'JETON_DESABO_TEST',
    });
    const upd = query.mock.calls.find((c) => /statut = 'envoye'/.test(c[0] as string));
    expect(upd?.[1]).toEqual([7]);
  });

  it('jeton de désabonnement non frappé (secret absent) → envoi SANS pied (jetonDesabonnement null), jamais d’exception', async () => {
    signerJetonRetrait.mockRejectedValue(Object.assign(new Error('INTERNAUTE_TOKEN_SECRET manquant'), { name: 'Error' }));
    await expect(publierEnvoiCertificat(7)).resolves.toBeUndefined();
    // Best-effort : le certificat part quand même, sans la ligne de désabonnement (le pied est OMIS côté envoyerCertificat).
    expect(envoyerCertificat).toHaveBeenCalledWith(
      TRANSP,
      'noreply@sansvisavis.com',
      expect.objectContaining({ to: 'client@example.com', jetonDesabonnement: null }),
    );
    const upd = query.mock.calls.find((c) => /statut = 'envoye'/.test(c[0] as string));
    expect(upd?.[1]).toEqual([7]); // envoi réussi malgré l'absence de pied
  });

  it('échec d’envoi → statut RESTE genere, derniere_erreur = NOM (jamais adresse/jeton), aucune exception', async () => {
    envoyerCertificat.mockRejectedValue(Object.assign(new Error('550 relay client@example.com denied'), { name: 'ErreurSMTP' }));
    await expect(publierEnvoiCertificat(7)).resolves.toBeUndefined();
    // pas de passage à 'envoye' ni à 'echec' ; seulement derniere_erreur
    expect(query.mock.calls.some((c) => /statut = 'envoye'/.test(c[0] as string))).toBe(false);
    expect(query.mock.calls.some((c) => /statut = 'echec'/.test(c[0] as string))).toBe(false);
    const err = query.mock.calls.find((c) => /derniere_erreur/.test(c[0] as string));
    expect(err?.[1]).toEqual(['ErreurSMTP', 7]); // le NOM, jamais le message SMTP (qui porte l'adresse)
    for (const c of query.mock.calls) {
      const p = JSON.stringify(c[1] ?? []);
      expect(p).not.toContain('client@example.com'); // aucune adresse en clair dans un paramètre
      expect(p).not.toContain('550'); // aucun fragment de message SMTP
    }
  });
});

describe('publierEnvoiCertificat — 3 documents (best-effort, réservés au compte)', () => {
  /** Récupère l'objet MailCertificat passé à envoyerCertificat. */
  function mailArg(): Record<string, unknown> {
    return envoyerCertificat.mock.calls[0]![2] as Record<string, unknown>;
  }

  it('titulaire de compte → anonymisé + visuel générés et joints ; générateurs appelés avec les bons paramètres', async () => {
    await publierEnvoiCertificat(7);
    // Anonymisé : gabarit anonyme + typeDocument 'anonyme'.
    expect(genererBufferCertificat).toHaveBeenCalledWith(7, { anonymise: true, typeDocument: 'anonyme' });
    // Visuel : reçoit la référence (jamais numéro ni jeton) + urlBase + descriptif.
    const dv = genererVisuelPng.mock.calls[0]![0] as { reference: string; urlBase: string; descriptif: Record<string, unknown> };
    expect(dv.reference).toBe('SVAV-K7M2-9QX4');
    expect(dv.urlBase).toBe('https://www.sansvisavis.com');
    expect(dv.descriptif).toMatchObject({ ville: 'Asnières-sur-Seine', typeBien: 'Appartement', surfaceM2: 72.35, exterieur: 'Balcon' });
    expect(JSON.stringify(dv)).not.toContain('SAVV-2026-000123'); // jamais le numéro
    expect(mailArg().pdfAnonyme).toBe(PDF_ANON);
    expect(mailArg().visuelPng).toBe(VISUEL);
  });

  it('ONE-SHOT (pas de compte) → aucun document secondaire (générateurs NON appelés), nominatif seul', async () => {
    query.mockImplementation(async (sql: string) => (/FROM certificat c/.test(sql) ? { rows: [ligne({ a_un_compte: false })] } : { rows: [] }));
    await publierEnvoiCertificat(7);
    expect(genererBufferCertificat).not.toHaveBeenCalled();
    expect(genererVisuelPng).not.toHaveBeenCalled();
    expect(mailArg().pdf).toBe(PDF);
    expect(mailArg().pdfAnonyme).toBeUndefined();
    expect(mailArg().visuelPng).toBeUndefined();
  });

  it('BEST-EFFORT : la génération de l’anonymisé LÈVE → e-mail avec nominatif + visuel (sans anonymisé)', async () => {
    genererBufferCertificat.mockRejectedValue(new Error('boom-anonyme'));
    await expect(publierEnvoiCertificat(7)).resolves.toBeUndefined();
    expect(mailArg().pdf).toBe(PDF);
    expect(mailArg().pdfAnonyme).toBeUndefined();
    expect(mailArg().visuelPng).toBe(VISUEL);
    const upd = query.mock.calls.find((c) => /statut = 'envoye'/.test(c[0] as string));
    expect(upd?.[1]).toEqual([7]); // l'envoi réussit malgré l'échec du secondaire
  });

  it('BEST-EFFORT : la génération du visuel LÈVE → e-mail avec les 2 PDF (sans visuel)', async () => {
    genererVisuelPng.mockRejectedValue(new Error('boom-visuel'));
    await expect(publierEnvoiCertificat(7)).resolves.toBeUndefined();
    expect(mailArg().pdf).toBe(PDF);
    expect(mailArg().pdfAnonyme).toBe(PDF_ANON);
    expect(mailArg().visuelPng).toBeUndefined();
  });

  it('anonymisé indisponible (générateur renvoie null) → omis, nominatif + visuel partent', async () => {
    genererBufferCertificat.mockResolvedValue(null);
    await publierEnvoiCertificat(7);
    expect(mailArg().pdfAnonyme).toBeUndefined();
    expect(mailArg().visuelPng).toBe(VISUEL);
  });
});
