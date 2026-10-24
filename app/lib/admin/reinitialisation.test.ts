import { describe, expect, it } from 'vitest';
import {
  adresseNormalisee, attenteApres, corpsReinitialisation, lienReinitialisation, MESSAGE_DEMANDE, OBJET_REINITIALISATION, verdictLien,
} from './reinitialisation';
import { estInvitationAdmin } from './invitation';

/** 🔴 Arno (24/10/2026, 416) — les règles PURES du « mot de passe oublié » de l'administration. */
describe('🔴 les règles', () => {
  const ok = { expireLe: '2026-10-24T11:00:00Z', utiliseLe: null, remplaceeLe: null, compteActif: true };
  const t = new Date('2026-10-24T10:30:00Z');
  it('le lien agit : non utilisé, non remplacé, compte actif, avant l’heure', () => {
    expect(verdictLien(ok, t)).toEqual({ ok: true });
    expect(verdictLien(null, t)).toEqual({ ok: false, cause: 'inconnu' });
    expect(verdictLien({ ...ok, utiliseLe: t }, t)).toEqual({ ok: false, cause: 'deja_utilise' });
    expect(verdictLien({ ...ok, remplaceeLe: t }, t)).toEqual({ ok: false, cause: 'remplace' });
    expect(verdictLien({ ...ok, compteActif: false }, t)).toEqual({ ok: false, cause: 'compte_inactif' });
    expect(verdictLien(ok, new Date('2026-10-24T11:00:00Z'))).toEqual({ ok: false, cause: 'expire' });
  });
  it('le message de la demande ne dit jamais si l’adresse existe', () => {
    expect(MESSAGE_DEMANDE).toBe('Si un compte est associé à cette adresse, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.');
    expect(MESSAGE_DEMANDE).not.toMatch(/inconnu|introuvable|n’existe pas/);
  });
  it('anti-rafale : 3 libres, puis 1 min, 2 min, 4 min… plafonné à 1 h', () => {
    expect([0, 1, 2].map(attenteApres)).toEqual([0, 0, 0]);
    expect([3, 4, 5].map(attenteApres)).toEqual([60, 120, 240]);
    expect(attenteApres(500)).toBe(3600);
  });
  it('l’adresse normalisée ; le lien ; le mail ne contient aucun mot de passe', () => {
    expect(adresseNormalisee('  Lea@Criterimmo.FR ')).toBe('lea@criterimmo.fr');
    expect(adresseNormalisee(42)).toBe('');
    expect(lienReinitialisation('https://a.fr/', 'ab+c')).toBe('https://a.fr/admin/reinitialiser?j=ab%2Bc');
    const c = corpsReinitialisation({ prenom: 'Léa', identifiant: 'lea@x.fr', lien: 'https://a.fr/admin/reinitialiser?j=J' });
    expect(c.texte).toContain('https://a.fr/admin/reinitialiser?j=J');
    expect(c.texte).toContain('n’est valable qu’une heure');
    expect(c.html).toContain('Choisir un nouveau mot de passe');
    expect(c.texte).not.toMatch(/mot de passe\s*:/i);
  });
  it('la relève de gestion@ ne rattache jamais ce mail à un bien (comme une invitation)', () => {
    expect(estInvitationAdmin({ messageIdEntete: '<admin-reinitialisation.abc@criterimmo.fr>' })).toBe(true);
    expect(estInvitationAdmin({ sens: 'envoye', objet: OBJET_REINITIALISATION })).toBe(true);
    expect(estInvitationAdmin({ sens: 'envoye', objet: 'Autre chose' })).toBe(false);
  });
});
