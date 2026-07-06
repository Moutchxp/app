import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { signerJeton, verifierJeton, NOM_COOKIE, TTL_SECONDES, optionsCookie } from './session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

describe('session admin — roundtrip', () => {
  it('signe puis vérifie un jeton valide (role admin)', async () => {
    const jeton = await signerJeton();
    const payload = await verifierJeton(jeton);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe('admin');
  });
});

describe('session admin — rejets', () => {
  it('jeton falsifié (dernier caractère altéré) → null', async () => {
    const jeton = await signerJeton();
    const falsifie = jeton.slice(0, -1) + (jeton.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifierJeton(falsifie)).toBeNull();
  });

  it('jeton signé avec une mauvaise clé → null', async () => {
    const mauvaiseCle = new TextEncoder().encode('une-autre-cle-totalement-differente-9876543210');
    const jetonAutreCle = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(mauvaiseCle);
    expect(await verifierJeton(jetonAutreCle)).toBeNull();
  });

  it('jeton expiré → null', async () => {
    const jetonExpire = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(0)
      .setExpirationTime(1) // exp = 1970-01-01, largement dépassé
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifierJeton(jetonExpire)).toBeNull();
  });

  it('chaîne arbitraire non-JWT → null', async () => {
    expect(await verifierJeton('pas-un-jwt')).toBeNull();
  });
});

describe('session admin — constantes/options', () => {
  it('constantes exposées', () => {
    expect(NOM_COOKIE).toBe('svv_admin_session');
    expect(TTL_SECONDES).toBe(8 * 3600);
  });

  it('optionsCookie(prod) : httpOnly, sameSite strict, path /, maxAge=TTL, secure suit prod', () => {
    const dev = optionsCookie(false);
    expect(dev).toMatchObject({ httpOnly: true, sameSite: 'strict', secure: false, path: '/', maxAge: TTL_SECONDES });
    expect(optionsCookie(true).secure).toBe(true);
  });

  it('signerJeton throw si ADMIN_SESSION_SECRET absent', async () => {
    delete process.env.ADMIN_SESSION_SECRET;
    await expect(signerJeton()).rejects.toThrow(/ADMIN_SESSION_SECRET/);
  });
});
