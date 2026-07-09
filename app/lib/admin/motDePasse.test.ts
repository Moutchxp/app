import { describe, it, expect } from 'vitest';
import { hacher, verifier } from './motDePasse';

describe('motDePasse — argon2id', () => {
  it('hacher ne renvoie JAMAIS le clair et produit un encodage argon2id', async () => {
    const clair = 'Corr3ct-Horse-Battery';
    const h = await hacher(clair);
    expect(h).not.toContain(clair);
    expect(h.startsWith('$argon2id$')).toBe(true);
  });

  it('deux hachages du même clair diffèrent (sel aléatoire)', async () => {
    const [a, b] = await Promise.all([hacher('meme-mot'), hacher('meme-mot')]);
    expect(a).not.toBe(b);
  });

  it('verifier : roundtrip vrai pour le bon mot de passe', async () => {
    const h = await hacher('mot-de-passe-valide');
    expect(await verifier('mot-de-passe-valide', h)).toBe(true);
  });

  it('verifier : faux pour un mauvais mot de passe', async () => {
    const h = await hacher('mot-de-passe-valide');
    expect(await verifier('mauvais', h)).toBe(false);
  });

  it('verifier : hash malformé → false, jamais d’exception (utilisé comme leurre temps constant)', async () => {
    expect(await verifier('peu importe', 'pas-un-hash-argon2')).toBe(false);
    expect(await verifier('peu importe', '')).toBe(false);
  });
});
