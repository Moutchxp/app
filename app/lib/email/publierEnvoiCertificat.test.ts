import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { recuperer, stockageConfigure } = vi.hoisted(() => ({ recuperer: vi.fn(), stockageConfigure: vi.fn() }));
const { lireConfigEmail, obtenirTransporteur, envoyerCertificat } = vi.hoisted(() => ({
  lireConfigEmail: vi.fn(),
  obtenirTransporteur: vi.fn(),
  envoyerCertificat: vi.fn(),
}));

vi.mock('../db/client', () => ({ query }));
vi.mock('../stockage', () => ({ recuperer, stockageConfigure }));
vi.mock('./index', () => ({ lireConfigEmail, obtenirTransporteur, envoyerCertificat }));

import { publierEnvoiCertificat } from './publierEnvoiCertificat';

const PDF = Buffer.from('pdf-bytes');
const CONFIG = { host: 'smtp', port: 465, user: 'compte@sansvisavis.com', pass: 'p', from: 'noreply@sansvisavis.com' };
const TRANSP = { sendMail: vi.fn() };

function ligne(over: Record<string, unknown> = {}) {
  return { numero: 'SAVV-2026-000123', reference: 'SVAV-K7M2-9QX4', prenom: 'Jean', email: 'client@example.com', pdf_cle: 'internautes/a/certificats/x.pdf', ...over };
}

const ORIG = { ...process.env };
beforeEach(() => {
  query.mockReset();
  recuperer.mockReset();
  stockageConfigure.mockReset();
  lireConfigEmail.mockReset();
  obtenirTransporteur.mockReset();
  envoyerCertificat.mockReset();
  process.env.SITE_URL = 'https://www.sansvisavis.com';
  stockageConfigure.mockReturnValue(true);
  lireConfigEmail.mockReturnValue(CONFIG);
  obtenirTransporteur.mockReturnValue(TRANSP);
  envoyerCertificat.mockResolvedValue(undefined);
  recuperer.mockResolvedValue(PDF);
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
  it('nominal → relit le PDF, envoie (from alias), statut → envoye', async () => {
    await publierEnvoiCertificat(7);
    expect(recuperer).toHaveBeenCalledWith('internautes/a/certificats/x.pdf');
    expect(envoyerCertificat).toHaveBeenCalledWith(TRANSP, 'noreply@sansvisavis.com', {
      to: 'client@example.com',
      prenom: 'Jean',
      numero: 'SAVV-2026-000123',
      reference: 'SVAV-K7M2-9QX4',
      siteUrl: 'https://www.sansvisavis.com',
      pdf: PDF,
    });
    const upd = query.mock.calls.find((c) => /statut = 'envoye'/.test(c[0] as string));
    expect(upd?.[1]).toEqual([7]);
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
