import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { montrerRenvoi, LIB_RENVOYER_INVITATION, type InvitationVue } from './page';

// LOT GESTION-INVITATION-ADMIN — le bouton « Renvoyer le mail d'invitation » de la liste des comptes.
const inv = (o: Partial<InvitationVue> = {}): InvitationVue => ({ active: false, dernierEnvoi: null, mailEtat: null, mailErreur: null, expireLe: null, ...o });

describe('« Renvoyer le mail d’invitation »', () => {
  it('compte pas encore activé → le bouton apparaît', () => {
    expect(montrerRenvoi({ invitation: inv() }, false)).toBe(true);
  });
  it('compte déjà activé → pas de bouton', () => {
    expect(montrerRenvoi({ invitation: inv({ active: true }) }, false)).toBe(false);
  });
  it('compte désactivé, ou invitations non installées → pas de bouton', () => {
    expect(montrerRenvoi({ invitation: inv() }, true)).toBe(false);
    expect(montrerRenvoi({ invitation: null }, false)).toBe(false);
    expect(montrerRenvoi({}, false)).toBe(false);
  });
  it('libellé exact, et la carte affiche la phrase VRAIE du renvoi ; la modale de création dit le sort du mail', () => {
    expect(LIB_RENVOYER_INVITATION).toBe('Renvoyer le mail d’invitation');
    const src = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/comptes/page.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(src).toContain("fetch(`/api/admin/comptes/${c.id}/invitation`, { method: 'POST' })");
    expect(src).toContain("{invitation.ok ? '✓ ' : '⚠ '}{invitation.phrase}");
    // la fonction existante est conservée : « Régénérer le mot de passe » reste là
    expect(src).toContain('Régénérer le mot de passe');
  });
});
