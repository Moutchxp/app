import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  signerJeton,
  verifierJeton,
  sessionDepuisPayload,
  permsToutes,
  permsAucune,
  NOM_COOKIE,
  TTL_SECONDES,
  optionsCookie,
  type SessionAdmin,
} from './session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

/** Session administrateur nommée de référence. */
function sessionAdmin(): SessionAdmin {
  return { sub: 7, identifiant: 'arno', role: 'administrateur', perms: permsToutes() };
}

describe('session admin — roundtrip', () => {
  it('signe puis vérifie un jeton de compte nommé (sub/identifiant/role/perms)', async () => {
    const jeton = await signerJeton(sessionAdmin());
    const payload = await verifierJeton(jeton);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('7'); // claim standard = chaîne
    expect(payload?.identifiant).toBe('arno');
    expect(payload?.role).toBe('administrateur');
    expect(payload?.jti).toBeTypeOf('string');
  });

  it('VOIE DE SECOURS : sub=null → aucune claim standard `sub` posée', async () => {
    const jeton = await signerJeton({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes() });
    const payload = await verifierJeton(jeton);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBeUndefined();
    expect(payload?.identifiant).toBeNull();
  });
});

describe('session admin — sessionDepuisPayload (tolérance)', () => {
  it('(d) ANCIEN jeton { role:"admin" } sans sub/perms → administrateur complet, sub null', async () => {
    // Jeton antérieur à M3 : ni sub, ni perms, role legacy "admin".
    const ancien = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(new TextEncoder().encode(SECRET));
    const payload = await verifierJeton(ancien);
    expect(payload).not.toBeNull();
    const session = sessionDepuisPayload(payload!);
    expect(session.role).toBe('administrateur');
    expect(session.perms).toEqual(permsToutes());
    expect(session.sub).toBeNull();
  });

  it('jeton sans rôle du tout → administrateur complet (tolérant)', async () => {
    const jeton = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(new TextEncoder().encode(SECRET));
    const session = sessionDepuisPayload((await verifierJeton(jeton))!);
    expect(session.role).toBe('administrateur');
    expect(session.perms).toEqual(permsToutes());
  });

  it('collaborateur → permissions EXPLICITES du jeton (les autres restent false)', async () => {
    const perms = { ...permsAucune(), curation: true, banc_test: true };
    const jeton = await signerJeton({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms });
    const session = sessionDepuisPayload((await verifierJeton(jeton))!);
    expect(session.role).toBe('collaborateur');
    expect(session.perms.curation).toBe(true);
    expect(session.perms.banc_test).toBe(true);
    expect(session.perms.pilotage).toBe(false);
    expect(session.perms.statistiques).toBe(false);
    expect(session.sub).toBe(3);
    expect(session.identifiant).toBe('lea');
  });

  it('administrateur → toutes perms true même si le jeton portait des perms partielles', async () => {
    // Sécurité : un administrateur ne peut être bridé par des colonnes perms_* — elles sont implicites.
    const jeton = await signerJeton({ sub: 1, identifiant: 'chef', role: 'administrateur', perms: permsAucune() });
    const session = sessionDepuisPayload((await verifierJeton(jeton))!);
    expect(session.perms).toEqual(permsToutes());
  });
});

describe('session admin — rejets', () => {
  it('jeton falsifié (dernier caractère altéré) → null', async () => {
    const jeton = await signerJeton(sessionAdmin());
    const falsifie = jeton.slice(0, -1) + (jeton.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifierJeton(falsifie)).toBeNull();
  });

  it('jeton signé avec une mauvaise clé → null', async () => {
    const mauvaiseCle = new TextEncoder().encode('une-autre-cle-totalement-differente-9876543210');
    const jetonAutreCle = await new SignJWT({ role: 'administrateur' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(mauvaiseCle);
    expect(await verifierJeton(jetonAutreCle)).toBeNull();
  });

  it('jeton expiré → null', async () => {
    const jetonExpire = await new SignJWT({ role: 'administrateur' })
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
    await expect(signerJeton(sessionAdmin())).rejects.toThrow(/ADMIN_SESSION_SECRET/);
  });
});
