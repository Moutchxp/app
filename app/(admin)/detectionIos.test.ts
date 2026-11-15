import { describe, expect, it } from 'vitest';
import { metadata } from './layout';

/**
 * 🔴 Arno (15/11/2026) — pastille « 1 Issue » sur le compte rendu (iPhone) : iOS transformait l'adresse e-mail du bandeau de recette en lien,
 * le DOM ne correspondait plus à celui de React (« Hydration failed »). Dans l'admin, la détection automatique d'iOS est coupée.
 */
describe('admin : détection automatique d’iOS coupée', () => {
  it('e-mail, téléphone, adresse, date : non', () => {
    expect(metadata.formatDetection).toEqual({ email: false, telephone: false, address: false, date: false });
  });
});
