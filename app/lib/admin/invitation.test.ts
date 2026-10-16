import { describe, expect, it } from 'vitest';
import {
  DELAI_MIN_RENVOI_MS, DUREE_INVITATION_JOURS, compteActive, corpsInvitation, estInvitationAdmin, lienActivation,
  messageIdInvitation, OBJET_INVITATION, phraseEnvoi, refusRenvoi, verdictInvitation,
} from './invitation';

const T = new Date('2026-10-16T10:00:00Z');
const lien = (o: Partial<{ expireLe: string; utiliseLe: string | null; remplaceeLe: string | null; compteActif: boolean }> = {}) =>
  ({ expireLe: '2026-10-20T10:00:00Z', utiliseLe: null, remplaceeLe: null, compteActif: true, ...o });

describe('le lien d’activation', () => {
  it('valide → peut agir', () => { expect(verdictInvitation(lien(), T)).toEqual({ ok: true }); });
  it('faux (inconnu) → refusé', () => { expect(verdictInvitation(null, T)).toMatchObject({ ok: false, cause: 'inconnu' }); });
  it('expiré → refusé', () => { expect(verdictInvitation(lien({ expireLe: '2026-10-16T09:59:59Z' }), T)).toMatchObject({ ok: false, cause: 'expire' }); });
  it('déjà utilisé → refusé', () => { expect(verdictInvitation(lien({ utiliseLe: '2026-10-16T09:00:00Z' }), T)).toMatchObject({ ok: false, cause: 'deja_utilise' }); });
  it('remplacé par un renvoi → refusé', () => { expect(verdictInvitation(lien({ remplaceeLe: '2026-10-16T09:00:00Z' }), T)).toMatchObject({ ok: false, cause: 'remplace' }); });
  it('compte désactivé → refusé', () => { expect(verdictInvitation(lien({ compteActif: false }), T)).toMatchObject({ ok: false, cause: 'compte_inactif' }); });
  it('durée de validité raisonnable (7 jours) et pointe vers l’adresse de base donnée', () => {
    expect(DUREE_INVITATION_JOURS).toBe(7);
    expect(lienActivation('https://authentification.sansvisavis.com/', 'J+/=')).toBe('https://authentification.sansvisavis.com/admin/activation?j=J%2B%2F%3D');
  });
});

describe('renvoi', () => {
  it('compte activé (connecté une fois, ou lien utilisé) → plus de renvoi', () => {
    expect(compteActive({ derniereConnexion: '2026-10-15T08:00:00Z', invitationUtilisee: false })).toBe(true);
    expect(compteActive({ derniereConnexion: null, invitationUtilisee: true })).toBe(true);
    expect(compteActive({ derniereConnexion: null, invitationUtilisee: false })).toBe(false);
    expect(refusRenvoi({ actif: true, active: true, dernierEnvoi: null }, T)).toMatch(/déjà activé/);
  });
  it('trop rapproché (moins de 2 minutes) → refusé ; au-delà → permis', () => {
    expect(DELAI_MIN_RENVOI_MS).toBe(120_000);
    expect(refusRenvoi({ actif: true, active: false, dernierEnvoi: new Date(T.getTime() - 30_000) }, T)).toMatch(/attendez 2 min/);
    expect(refusRenvoi({ actif: true, active: false, dernierEnvoi: new Date(T.getTime() - 100_000) }, T)).toMatch(/attendez 20 s/);
    expect(refusRenvoi({ actif: true, active: false, dernierEnvoi: new Date(T.getTime() - 121_000) }, T)).toBeNull();
  });
  it('compte désactivé → refusé', () => { expect(refusRenvoi({ actif: false, active: false, dernierEnvoi: null }, T)).toMatch(/désactivé/); });
});

describe('le mail et l’écran', () => {
  it('le mail contient le lien et l’identifiant, JAMAIS un mot de passe', () => {
    const c = corpsInvitation({ prenom: 'Léa', identifiant: 'lea@criterimmo.fr', invitant: 'Arnaud Jorel', lien: 'https://x/admin/activation?j=J', expireLe: 'ven. 23 oct.' });
    for (const t of [c.texte, c.html]) {
      expect(t).toContain('https://x/admin/activation?j=J');
      expect(t).toContain('lea@criterimmo.fr');
      expect(t.toLowerCase()).not.toMatch(/mot de passe temporaire|password/);
    }
  });
  it('la phrase de l’écran dit la vérité : envoyé, ou NON envoyé avec le motif réel', () => {
    expect(phraseEnvoi({ etat: 'envoye', destinataire: 'a@b.fr' })).toBe('Mail d’invitation envoyé à a@b.fr.');
    expect(phraseEnvoi({ etat: 'echec', destinataire: 'a@b.fr', motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' }))
      .toBe('Mail d’invitation NON envoyé à a@b.fr : Le jeton de gestion@ n’a pas pu être rafraîchi.');
    expect(phraseEnvoi({ etat: 'factice', destinataire: 'a@b.fr' })).toContain('rien n’est parti');
  });
  it('la relève de gestion@ reconnaît le mail (jamais rattaché à un bien)', () => {
    expect(estInvitationAdmin({ messageIdEntete: messageIdInvitation('criterimmo.fr', 'abc') })).toBe(true);
    expect(estInvitationAdmin({ sens: 'envoye', objet: OBJET_INVITATION })).toBe(true);
    expect(estInvitationAdmin({ sens: 'recu', objet: 'Re: ' + OBJET_INVITATION, messageIdEntete: '<autre@x>' })).toBe(false);
  });
});
