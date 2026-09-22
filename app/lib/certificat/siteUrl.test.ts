import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { siteUrlCertificat, motifAdresseTemporaire } from './siteUrl';

/**
 * Garde « pas d'adresse temporaire dans un QR de certificat ». Une URL imprimée dans un QR fait foi et
 * ne doit jamais changer après émission : en production, seule une adresse durable est acceptée ; en
 * développement rien n'est refusé, mais l'adresse temporaire est signalée.
 */

/** Adresses PÉRISSABLES, chacune avec le fragment attendu du motif de refus. */
const TEMPORAIRES: ReadonlyArray<readonly [string, string, RegExp]> = [
  ['http non chiffré', 'http://authentification.sansvisavis.com', /non chiffrée/],
  ['localhost', 'https://localhost:3000', /hôte local/],
  ['boucle locale 127.x', 'https://127.0.0.1:3000', /hôte local/],
  ['IPv6 boucle locale', 'https://[::1]:3000', /hôte local/],
  ['IP privée 192.168.x (le cas réel du 22/09)', 'https://192.168.1.164:3000', /IP privée/],
  ['IP privée 10.x', 'https://10.0.0.7', /IP privée/],
  ['IP privée 172.16.x', 'https://172.16.4.2', /IP privée/],
  ['IP privée 172.31.x', 'https://172.31.255.254', /IP privée/],
  ['tunnel rapide Cloudflare', 'https://brave-lion-echo-fox.trycloudflare.com', /Cloudflare/],
  ['tunnel ngrok historique', 'https://a1b2c3.ngrok.io', /ngrok/],
  ['tunnel ngrok-free', 'https://a1b2c3.ngrok-free.app', /ngrok/],
];

/** Adresses DURABLES : gravables dans un document qui fait foi. */
const DURABLES: ReadonlyArray<readonly [string, string]> = [
  ['adresse publique définitive', 'https://authentification.sansvisavis.com'],
  ['barre oblique finale retirée', 'https://authentification.sansvisavis.com/'],
  ['site principal', 'https://www.sansvisavis.com'],
  // 172.15 et 172.32 sont HORS de la plage privée 172.16-31 : ne pas élargir le refus par erreur.
  ['IP publique voisine de la plage privée (172.15)', 'https://172.15.0.1'],
  ['IP publique voisine de la plage privée (172.32)', 'https://172.32.0.1'],
];

let erreur: ReturnType<typeof vi.spyOn>;
let avertissement: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
  avertissement = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('EN PRODUCTION — une adresse temporaire est REFUSÉE (document non fabriqué)', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it.each(TEMPORAIRES)('refuse %s', (_nom, url, motif) => {
    vi.stubEnv('SITE_URL', url);
    expect(siteUrlCertificat()).toBeNull();
    // Refus TRACÉ, avec le motif — même comportement que la garde historique (rien n'est fabriqué).
    expect(erreur).toHaveBeenCalledTimes(1);
    expect(String(erreur.mock.calls[0][0])).toMatch(motif);
    expect(avertissement).not.toHaveBeenCalled();
  });

  it.each(DURABLES)('accepte %s', (_nom, url) => {
    vi.stubEnv('SITE_URL', url);
    expect(siteUrlCertificat()).toBe(url.replace(/\/+$/, ''));
    expect(erreur).not.toHaveBeenCalled();
    expect(avertissement).not.toHaveBeenCalled();
  });

  it('LE TEST DU LOT : https://authentification.sansvisavis.com est accepté tel quel', () => {
    vi.stubEnv('SITE_URL', 'https://authentification.sansvisavis.com');
    expect(siteUrlCertificat()).toBe('https://authentification.sansvisavis.com');
  });

  it('aucun secret dans la trace de refus (ni jeton, ni numéro de certificat)', () => {
    vi.stubEnv('SITE_URL', 'https://192.168.1.164:3000');
    siteUrlCertificat();
    expect(String(erreur.mock.calls[0][0])).not.toMatch(/SAVV-|SVAV-|jeton|[0-9A-HJKMNP-TV-Z]{16}/);
  });
});

describe('EN DÉVELOPPEMENT — rien n’est refusé, mais le caractère temporaire est signalé', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));

  it.each(TEMPORAIRES)('accepte %s AVEC un avertissement', (_nom, url, motif) => {
    vi.stubEnv('SITE_URL', url);
    expect(siteUrlCertificat()).toBe(url.replace(/\/+$/, ''));
    expect(avertissement).toHaveBeenCalledTimes(1);
    const texte = String(avertissement.mock.calls[0][0]);
    expect(texte).toMatch(motif);
    // L'avertissement dit ce qu'il faut viser, sinon il ne sert à rien.
    expect(texte).toMatch(/authentification\.sansvisavis\.com/);
    expect(erreur).not.toHaveBeenCalled();
  });

  it('une IP locale reste utilisable pour un certificat d’essai (exigence explicite)', () => {
    vi.stubEnv('SITE_URL', 'http://192.168.1.14:3000');
    expect(siteUrlCertificat()).toBe('http://192.168.1.14:3000');
  });

  it('une adresse durable ne déclenche AUCUN avertissement', () => {
    vi.stubEnv('SITE_URL', 'https://authentification.sansvisavis.com');
    expect(siteUrlCertificat()).toBe('https://authentification.sansvisavis.com');
    expect(avertissement).not.toHaveBeenCalled();
  });
});

describe('la garde HISTORIQUE est inchangée, dans tous les environnements', () => {
  it.each(['production', 'development'] as const)('%s : absente / vide / mal formée → null', (env) => {
    vi.stubEnv('NODE_ENV', env);
    for (const valeur of ['', '   ', 'sansvisavis.com', 'ftp://sansvisavis.com', 'https://']) {
      vi.stubEnv('SITE_URL', valeur);
      expect(siteUrlCertificat()).toBeNull();
    }
    vi.stubEnv('SITE_URL', undefined as unknown as string);
    expect(siteUrlCertificat()).toBeNull();
  });
});

describe('motifAdresseTemporaire', () => {
  it('rend null pour une adresse durable et un motif lisible sinon', () => {
    expect(motifAdresseTemporaire(new URL('https://authentification.sansvisavis.com'))).toBeNull();
    expect(motifAdresseTemporaire(new URL('https://192.168.1.164:3000'))).toMatch(/DHCP/);
  });
});
