import { describe, it, expect } from 'vitest';
import { origineAutorisee } from './controleOrigine';

const h = (o: Record<string, string>) => new Headers({ host: 'authentification.sansvisavis.com', ...o });

describe('origineAutorisee (audit point 6)', () => {
  it('lectures (GET, HEAD, OPTIONS) : toujours autorisées', () => {
    for (const m of ['GET', 'head', 'OPTIONS']) expect(origineAutorisee(m, h({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  it('Sec-Fetch-Site : same-origin et none passent ; same-site et cross-site sont refusés', () => {
    expect(origineAutorisee('POST', h({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(origineAutorisee('POST', h({ 'sec-fetch-site': 'none' }))).toBe(true);
    expect(origineAutorisee('POST', h({ 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(origineAutorisee('DELETE', h({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  });

  it('Sec-Fetch-Site décide même si Origin semble correcte (un sous-domaine ne peut pas se faire passer pour l’admin)', () => {
    expect(origineAutorisee('POST', h({ 'sec-fetch-site': 'same-site', origin: 'https://authentification.sansvisavis.com' }))).toBe(false);
  });

  it('sans Sec-Fetch-Site : Origin du même hôte (http ou https) passe ; autre hôte, null ou illisible → refusé', () => {
    expect(origineAutorisee('POST', h({ origin: 'https://authentification.sansvisavis.com' }))).toBe(true);
    expect(origineAutorisee('POST', h({ origin: 'http://authentification.sansvisavis.com' }))).toBe(true);
    expect(origineAutorisee('POST', h({ origin: 'https://blog.sansvisavis.com' }))).toBe(false);
    expect(origineAutorisee('POST', h({ origin: 'null' }))).toBe(false);
    expect(origineAutorisee('POST', h({ origin: 'pas une url' }))).toBe(false);
    expect(origineAutorisee('POST', new Headers({ origin: 'https://authentification.sansvisavis.com' }))).toBe(false); // pas de Host
  });

  it('ni Origin ni Sec-Fetch-Site (client hors navigateur) → autorisé : la session décide', () => {
    expect(origineAutorisee('POST', h({}))).toBe(true);
  });

  it('développement local : même origine localhost:3000 → passe', () => {
    expect(origineAutorisee('POST', new Headers({ host: 'localhost:3000', origin: 'http://localhost:3000' }))).toBe(true);
  });
});
