import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { adresseApplication } from '../gestion/adresseApplication';
import { cookieSecurise, optionsCookie } from '../admin/session';

/**
 * 🔴 Arno (15/11/2026) — LA RECETTE PUBLIÉE PAR UN TUNNEL (test sur iPhone) : les liens des mails de recette mènent au tunnel https (même
 * variable que la production), JAMAIS hors recette ; le cookie de session est `Secure` en https ; le nom d'hôte du tunnel n'est admis
 * par le serveur de développement que par une variable de recette (rien d'écrit en dur).
 */
const TUNNEL = 'https://essai-iphone-xyz.trycloudflare.com';

describe('liens des mails : le tunnel https, en recette seulement', () => {
  it('recette : les liens mènent au tunnel', () => {
    expect(adresseApplication({ SVAV_RECETTE: '1', NODE_ENV: 'development', GESTION_URL_APPLICATION: TUNNEL })).toEqual({ base: TUNNEL, locale: false });
  });
  it('hors recette : un tunnel reste refusé (liens locaux, comme avant)', () => {
    expect(adresseApplication({ NODE_ENV: 'development', GESTION_URL_APPLICATION: TUNNEL }).locale).toBe(true);
    expect(adresseApplication({ SVAV_RECETTE: '1', NODE_ENV: 'production', GESTION_URL_APPLICATION: TUNNEL }).locale).toBe(true);
  });
  it('un tunnel en http n’est jamais accepté', () => {
    expect(adresseApplication({ SVAV_RECETTE: '1', NODE_ENV: 'development', GESTION_URL_APPLICATION: 'http://essai.trycloudflare.com' }).locale).toBe(true);
  });
});

describe('cookie de session `Secure` en https', () => {
  it('production : toujours ; ailleurs : quand la requête arrive en https (tunnel)', () => {
    expect(cookieSecurise(new Headers(), { NODE_ENV: 'production' })).toBe(true);
    expect(cookieSecurise(new Headers({ 'x-forwarded-proto': 'https' }), { NODE_ENV: 'development' })).toBe(true);
    expect(cookieSecurise(new Headers({ 'x-forwarded-proto': 'http' }), { NODE_ENV: 'development' })).toBe(false);
    expect(cookieSecurise(null, { NODE_ENV: 'development' })).toBe(false);
    expect(optionsCookie(true)).toMatchObject({ secure: true, sameSite: 'strict', httpOnly: true });
  });
  it('les quatre endroits qui posent le cookie suivent la requête', () => {
    for (const f of ['app/(admin)/api/admin/session/route.ts', 'app/(admin)/api/admin/reinitialiser/route.ts', 'app/(admin)/api/admin/compte/mot-de-passe/route.ts', 'proxy.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).toContain('optionsCookie(cookieSecurise(request.headers))');
      expect(s, f).not.toContain("optionsCookie(process.env.NODE_ENV === 'production')");
    }
  });
});

describe('le tunnel n’est admis que par une variable de recette', () => {
  it('next.config lit RECETTE_ORIGINES_DEV ; aucun nouveau nom de tunnel en dur', () => {
    const s = readFileSync('next.config.ts', 'utf8');
    expect(s).toContain("(process.env.RECETTE_ORIGINES_DEV ?? '').split(',')");
  });
  it('recette.sh : RECETTE_URL_PUBLIQUE autre qu’un https://…trycloudflare.com → rien n’est lancé', () => {
    const s = readFileSync('scripts/recette.sh', 'utf8');
    expect(s).toContain('^https://[a-z0-9-]+\\.trycloudflare\\.com/?$');
    expect(s).toContain('GESTION_URL_APPLICATION="${APPEL_URL_PUBLIQUE%/}"');
    expect(() => execFileSync('bash', ['-n', 'scripts/recette.sh'])).not.toThrow();
  });
});
