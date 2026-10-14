import { describe, it, expect } from 'vitest';
import { verifierUrlsPubliques } from './verifierUrlsPubliques';

const CORRECT = {
  NODE_ENV: 'production',
  SITE_URL: 'https://www.exemple.fr',
  GESTION_URL_APPLICATION: 'https://app.exemple.fr',
  SVAV_URL_PUBLIQUE: 'https://app.exemple.fr/',
  S3_ENDPOINT: 'https://s3.exemple.fr',
};

describe('verifierUrlsPubliques', () => {
  it('production, toutes en https public → aucun message', () => {
    expect(verifierUrlsPubliques(CORRECT)).toEqual([]);
  });

  it('variable ABSENTE → un message qui la nomme', () => {
    const { SITE_URL: _retire, ...env } = CORRECT;
    const m = verifierUrlsPubliques(env);
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('SITE_URL');
    expect(m[0]).toContain('absente ou vide');
  });

  it('variable VIDE (ou blancs) → un message', () => {
    const m = verifierUrlsPubliques({ ...CORRECT, GESTION_URL_APPLICATION: '   ' });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('GESTION_URL_APPLICATION');
  });

  it('contient localhost (casse indifférente) → message, sans la valeur complète', () => {
    const valeur = 'http://LocalHost:3000/chemin-secret';
    const m = verifierUrlsPubliques({ ...CORRECT, SVAV_URL_PUBLIQUE: valeur });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('SVAV_URL_PUBLIQUE');
    expect(m[0]).toContain('localhost');
    expect(m[0]).not.toContain(valeur);
    expect(m[0]).not.toContain('chemin-secret');
  });

  it('contient 127.0.0.1 → message', () => {
    const m = verifierUrlsPubliques({ ...CORRECT, S3_ENDPOINT: 'http://127.0.0.1:9000' });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('S3_ENDPOINT');
    expect(m[0]).toContain('127.0.0.1');
    expect(m[0]).not.toContain(':9000');
  });

  it('les quatre absentes → quatre messages', () => {
    expect(verifierUrlsPubliques({ NODE_ENV: 'production' })).toHaveLength(4);
  });

  it('NODE_ENV ≠ production → aucun message, même tout absent ou local', () => {
    expect(verifierUrlsPubliques({})).toEqual([]);
    expect(verifierUrlsPubliques({ NODE_ENV: 'development', SITE_URL: 'http://localhost:3000' })).toEqual([]);
    expect(verifierUrlsPubliques({ NODE_ENV: 'test' })).toEqual([]);
  });
});
