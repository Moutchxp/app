import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * ÉCRAN D'APERÇU d'un document — PROUVE que sa garde est la MÊME que celle de la livraison des octets : session valide
 * d'abord (sinon redirection, AUCUNE lecture), puis propriété du certificat via le MÊME gate unique
 * (`resoudrePdfCertificat`), avec un `notFound()` indistinguable entre « pas à lui » et « inexistant ».
 * On mocke la garde de page, le gate de propriété, et les deux fonctions de navigation de Next (qui, comme dans Next,
 * interrompent le rendu en levant). Aucun accès base ni réseau réel.
 */
const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
const { internauteConnecteDepuisCookies } = vi.hoisted(() => ({ internauteConnecteDepuisCookies: vi.fn() }));
const { resoudrePdfCertificat } = vi.hoisted(() => ({ resoudrePdfCertificat: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../../../../lib/internaute/gardeEspace', () => ({ internauteConnecteDepuisCookies }));
vi.mock('../../../../lib/internaute/espace', () => ({ resoudrePdfCertificat }));

import ApercuPage from './page';

/** Props d'une page Next 16 : `params` ET `searchParams` sont des PROMESSES. */
const props = (id: string, sp: Record<string, string> = { doc: 'nominatif' }) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(sp),
});

describe('écran d’aperçu — garde d’accès identique à la livraison des octets', () => {
  beforeEach(() => {
    redirect.mockClear();
    notFound.mockClear();
    internauteConnecteDepuisCookies.mockReset();
    resoudrePdfCertificat.mockReset();
  });

  it('NON CONNECTÉ → redirige vers la connexion, AUCUNE lecture (pas même le gate)', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue(null);
    await expect(ApercuPage(props('5'))).rejects.toThrow('REDIRECT:/espace/connexion');
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });

  it.each(['nominatif', 'anonyme', 'visuel'])(
    'AUTRE INTERNAUTE + doc=%s → notFound, aucun écran rendu',
    async (doc) => {
      internauteConnecteDepuisCookies.mockResolvedValue('A');
      resoudrePdfCertificat.mockResolvedValue({ statut: 'introuvable' }); // pas à A
      await expect(ApercuPage(props('5', { doc }))).rejects.toThrow('NOT_FOUND');
      // Propriété vérifiée pour l'id de SESSION, jamais pour un id venu de l'URL.
      expect(resoudrePdfCertificat).toHaveBeenCalledWith('A', 5);
    },
  );

  it('PROPRIÉTAIRE → écran rendu, gate passé pour l’internaute de session', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf', numero: 'SAVV-2026-000023' });
    const el = await ApercuPage(props('5', { doc: 'nominatif', analyse: '42' }));
    expect(el).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('LE POINT SENSIBLE — la CLÉ de stockage ne traverse jamais l’écran', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    resoudrePdfCertificat.mockResolvedValue({
      statut: 'ok', cle: 'internautes/A/certificats/secret.pdf', numero: 'SAVV-2026-000023',
    });
    const el = await ApercuPage(props('5', { doc: 'nominatif', analyse: '42' }));
    const rendu = JSON.stringify(el);
    expect(rendu).not.toMatch(/internautes\/|secret\.pdf|localhost:9000|X-Amz-/);
  });

  it('document INCONNU → notFound, aucune lecture', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    await expect(ApercuPage(props('5', { doc: 'espion' }))).rejects.toThrow('NOT_FOUND');
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });

  it('document ABSENT du paramètre → notFound (un écran d’aperçu nomme toujours son document)', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    await expect(ApercuPage(props('5', {}))).rejects.toThrow('NOT_FOUND');
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });

  it('id non numérique → notFound, aucune lecture', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    await expect(ApercuPage(props('abc'))).rejects.toThrow('NOT_FOUND');
    expect(resoudrePdfCertificat).not.toHaveBeenCalled();
  });

  it('gate indisponible (base KO) → notFound, jamais de détail technique', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    resoudrePdfCertificat.mockRejectedValue(new Error('db down'));
    await expect(ApercuPage(props('5'))).rejects.toThrow('NOT_FOUND');
  });
});

describe('disponibilité des trois documents — rien ne disparaît', () => {
  beforeEach(() => {
    redirect.mockClear();
    notFound.mockClear();
    internauteConnecteDepuisCookies.mockReset();
    resoudrePdfCertificat.mockReset();
    internauteConnecteDepuisCookies.mockResolvedValue('A');
  });

  it.each(['anonyme', 'visuel'])(
    'pdf_absent + doc=%s → écran rendu quand même (documents régénérés, indépendants du PDF stocké)',
    async (doc) => {
      resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent', numero: 'SAVV-2026-000023' });
      const el = await ApercuPage(props('5', { doc }));
      expect(el).toBeTruthy();
      expect(notFound).not.toHaveBeenCalled();
    },
  );

  it('pdf_absent + doc=nominatif → écran rendu (mention « en préparation »), jamais une erreur', async () => {
    resoudrePdfCertificat.mockResolvedValue({ statut: 'pdf_absent', numero: 'SAVV-2026-000023' });
    const el = await ApercuPage(props('5', { doc: 'nominatif' }));
    expect(el).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(['nominatif', 'anonyme', 'visuel'])('propriétaire + doc=%s → écran rendu', async (doc) => {
    resoudrePdfCertificat.mockResolvedValue({ statut: 'ok', cle: 'k.pdf', numero: 'SAVV-2026-000023' });
    const el = await ApercuPage(props('5', { doc, analyse: '7' }));
    expect(el).toBeTruthy();
  });
});
