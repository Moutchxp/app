import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import {
  signerJetonRectification,
  verifierJetonRectification,
  signerJetonEmission,
  verifierJetonEmission,
  signerJetonCada,
  verifierJetonCada,
} from './jetonRectification';

beforeAll(() => {
  process.env.INTERNAUTE_TOKEN_SECRET = 'secret-de-test-au-moins-32-octets-abcdefgh';
});

describe('jetons — allers-retours', () => {
  it('rectification : sub = internauteId', async () => {
    const j = await signerJetonRectification('internaute-uuid-123');
    expect(await verifierJetonRectification(j)).toBe('internaute-uuid-123');
  });

  it('émission : sub = projetId (nombre)', async () => {
    const j = await signerJetonEmission(42);
    expect(await verifierJetonEmission(j)).toBe(42);
  });

  it('émission : jeton illisible → null', async () => {
    expect(await verifierJetonEmission('pas-un-jwt')).toBeNull();
  });
});

// ⚠️ LE CŒUR DU CORRECTIF : la séparation stricte des capacités par le SCOPE (vérifié, pas seulement lu).
describe('SÉPARATION STRICTE des scopes — une capacité ne passe JAMAIS par la mauvaise porte', () => {
  it('un jeton de RECTIFICATION présenté à verifierJetonEmission → REJET (null)', async () => {
    const rectif = await signerJetonRectification('internaute-uuid-123');
    expect(await verifierJetonEmission(rectif)).toBeNull();
  });

  it('un jeton d’ÉMISSION présenté à verifierJetonRectification → REJET (null)', async () => {
    const emission = await signerJetonEmission(42);
    expect(await verifierJetonRectification(emission)).toBeNull();
  });
});

// X5 — jeton de CONFIRMATION de saisine CADA : scope fermé 'confirm-cada', 7 jours, expiré DISTINCT d'invalide.
describe('X5 — confirm-cada : scope fermé, aller-retour, expiré ≠ invalide', () => {
  const secret = () => new TextEncoder().encode(process.env.INTERNAUTE_TOKEN_SECRET as string);

  it('aller-retour : sub = id de la demande (nombre)', async () => {
    const j = await signerJetonCada(42);
    expect(await verifierJetonCada(j)).toEqual({ ok: true, demandeId: 42 });
  });

  it('un jeton d’un AUTRE scope (rectification / émission) → invalide (jamais accepté ici)', async () => {
    expect(await verifierJetonCada(await signerJetonRectification('uuid'))).toEqual({ ok: false, raison: 'invalide' });
    expect(await verifierJetonCada(await signerJetonEmission(7))).toEqual({ ok: false, raison: 'invalide' });
  });

  it('un jeton confirm-cada n’ouvre NI l’émission NI la rectification (scope séparé)', async () => {
    const j = await signerJetonCada(42);
    expect(await verifierJetonEmission(j)).toBeNull();
    expect(await verifierJetonRectification(j)).toBeNull();
  });

  it('jeton illisible / forgé (mauvaise signature) → invalide', async () => {
    expect(await verifierJetonCada('pas-un-jwt')).toEqual({ ok: false, raison: 'invalide' });
    const forge = await new SignJWT({ scope: 'confirm-cada' }).setProtectedHeader({ alg: 'HS256' }).setSubject('42')
      .setExpirationTime('7d').sign(new TextEncoder().encode('un-AUTRE-secret-de-test-de-32-octets-xx'));
    expect(await verifierJetonCada(forge)).toEqual({ ok: false, raison: 'invalide' });
  });

  it('sub non numérique → invalide', async () => {
    const j = await new SignJWT({ scope: 'confirm-cada' }).setProtectedHeader({ alg: 'HS256' }).setSubject('abc')
      .setExpirationTime('7d').sign(secret());
    expect(await verifierJetonCada(j)).toEqual({ ok: false, raison: 'invalide' });
  });

  it('jeton EXPIRÉ (bon scope, bon secret) → raison « expire » (DISTINCT d’invalide, pour renvoyer vers l’onglet)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expire = await new SignJWT({ scope: 'confirm-cada' }).setProtectedHeader({ alg: 'HS256' }).setSubject('42')
      .setIssuedAt(nowSec - 100).setExpirationTime(nowSec - 10).sign(secret());
    expect(await verifierJetonCada(expire)).toEqual({ ok: false, raison: 'expire' });
  });
});
