import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (15/11/2026, 9e retour) — CHAQUE ÉPREUVE PART D'UN BROUILLON PROPRE. Les épreuves simulent des dépôts (numéros de pièces fictifs) ;
 * depuis le 9e retour, une pièce citée par le brouillon mais introuvable revient « vide ou perdue » (rouge, bloquante) au lieu de disparaître :
 * un brouillon d'épreuve resté vivant bloquerait donc l'épreuve suivante. Avant chaque épreuve, le brouillon du PRÉAVIS DE TEST est marqué
 * effacé par le geste normal (« Effacer le brouillon » : jamais supprimé). Aucun autre brouillon n'est touché.
 */
export function brouillonPropreAvantChaqueEpreuve(): void {
  const occ = Number(process.env.E2E_OCCUPATION ?? '');
  const jeton = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
  const base = process.env.E2E_BASE ?? 'http://localhost:3000';
  test.beforeEach(async ({ request }) => {
    if (!Number.isSafeInteger(occ) || occ <= 0 || jeton === '') return;
    const r = await request.post(`${base}/api/admin/location`, {
      headers: { cookie: `svv_admin_session=${jeton}`, origin: base, 'content-type': 'application/json', 'x-svav-confirmation': 'propre' },
      data: { action: 'effacer-brouillon-previsite', occupationIds: [occ] },
    });
    expect(r.status()).toBe(200);
  });
}
