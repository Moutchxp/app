import { describe, it, expect } from 'vitest';
import { hacher, verifier } from './motDePasse';

/**
 * Correctif « expansion @next/env » : le hash argon2 de la voie de SECOURS (break-glass) est stocké en .env
 * ENCODÉ EN BASE64 (`ADMIN_PASSWORD_ARGON2_B64`) et DÉCODÉ dans la route avant `verifier`. Ces tests prouvent
 * le round-trip AVEC LE VRAI argon2 (pas de mock) : c'est la garantie de bout en bout que
 *   CLI: hacher → base64        (app/scripts/admin.ts, `admin:secours-hash`)
 *   route: base64 → décodage    (session/route.ts, `hashBreakGlass`)
 * redonnent exactement le hash d'origine, et que la valeur stockée est immunisée contre l'expansion Next.
 */
describe('break-glass base64 — round-trip argon2 (fix expansion @next/env)', () => {
  it('hacher(secret) → base64 → décodage → verifier(secret, hash) === true', async () => {
    const secret = 'dev-admin-2026';
    const hash = await hacher(secret);                          // ce que produit `hacher()` (CLI + prod)
    const b64 = Buffer.from(hash, 'utf8').toString('base64');   // ce que le CLI imprime dans .env
    const decode = Buffer.from(b64, 'base64').toString('utf8'); // ce que fait `hashBreakGlass()` dans la route
    expect(decode).toBe(hash);                                  // round-trip EXACT (aucune perte)
    expect(await verifier(secret, decode)).toBe(true);          // le bon secret est validé
    expect(await verifier('mauvais-secret', decode)).toBe(false); // un mauvais secret est rejeté
  });

  it('un hash argon2 encodé base64 ne contient JAMAIS de « $ » → rien à expanser (cœur du fix)', async () => {
    // Le hash brut argon2id commence par « $argon2id$… » (plusieurs `$` → mutilés par @next/env). Le base64
    // (alphabet A-Za-z0-9+/=) n'en contient aucun : la valeur .env traverse le loader Next intacte.
    const hashBrut = await hacher('x');
    expect(hashBrut).toContain('$');                            // le hash BRUT contient bien des `$` (source du bug)
    const b64 = Buffer.from(hashBrut, 'utf8').toString('base64');
    expect(b64).not.toContain('$');                            // le hash ENCODÉ n'en contient aucun (immunisé)
  });

  it('décodage tolérant : une valeur non-base64 ne throw pas (fail-closed → verifier false)', async () => {
    // Reproduit `hashBreakGlass()` sur une valeur corrompue : Buffer.from(...,'base64') est indulgent (n'échoue
    // jamais) ; la valeur décodée n'est pas un hash argon2 valide → `verifier` renvoie false sans exception.
    const decode = Buffer.from('@@@ pas du base64 @@@', 'base64').toString('utf8');
    expect(await verifier('peu-importe', decode)).toBe(false);
  });
});
