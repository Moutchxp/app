import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motifSession } from './RevocationWatcher';

/**
 * Foyer UNIQUE des messages de session admin (401 expiration / 403 droits). Environnement de test = node (aucun DOM, pas de
 * RTL) : on éprouve la DÉCISION pure `motifSession` (qui pilote l'overlay) + des garanties STATIQUES sur le rendu (texte, et
 * surtout AUCUNE redirection — le retour à la connexion est un LIEN cliqué, jamais une navigation programmatique).
 */
describe('RevocationWatcher — motifSession : quelle réponse déclenche quel overlay', () => {
  it('401 sur /api/admin/* → « expire » (session expirée)', () => {
    expect(motifSession(401, '/api/admin/permis/demandes/proposition', null)).toBe('expire');
    expect(motifSession(401, '/api/admin/curation', null)).toBe('expire');
  });

  it('401 sur /api/admin/session (mauvais mot de passe, connexion) → AUCUN overlay', () => {
    expect(motifSession(401, '/api/admin/session', null)).toBeNull();
  });

  it('401 HORS /api/admin/ (espace public/internaute) → AUCUN overlay', () => {
    expect(motifSession(401, '/api/internaute/session', null)).toBeNull();
    expect(motifSession(401, '/api/certificat', null)).toBeNull();
  });

  it('403 ACCES_REVOQUE sur /api/admin/* → « revoque » (comportement inchangé)', () => {
    expect(motifSession(403, '/api/admin/curation', 'ACCES_REVOQUE')).toBe('revoque');
  });

  it('403 d’une autre cause (INTERDIT, corps vide/non-JSON) → AUCUN overlay (403 non-révocation inchangé)', () => {
    expect(motifSession(403, '/api/admin/comptes', 'INTERDIT')).toBeNull();
    expect(motifSession(403, '/api/admin/curation', null)).toBeNull();
  });

  it('403 ACCES_REVOQUE HORS /api/admin/ → AUCUN overlay (scope strict)', () => {
    expect(motifSession(403, '/api/internaute/x', 'ACCES_REVOQUE')).toBeNull();
  });

  it('autres statuts (200, 503) → AUCUN overlay', () => {
    expect(motifSession(200, '/api/admin/curation', null)).toBeNull();
    expect(motifSession(503, '/api/admin/curation', null)).toBeNull();
  });
});

describe('RevocationWatcher — garanties statiques : texte des deux motifs + AUCUNE redirection', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/RevocationWatcher.tsx', 'utf8');

  it('« expire » affiche « Session expirée » ; « revoque » garde le texte des droits', () => {
    expect(src).toContain('Session expirée');
    expect(src).toContain('Vos droits d’accès ont été modifiés');
  });

  it('retour à la connexion = LIEN manuel vers /admin/login, jamais une redirection/reconnexion automatique', () => {
    expect(src).toContain('href="/admin/login"');
    // aucune navigation programmatique (location.*, window.location, router.push/replace, redirect(...)).
    expect(/window\.location|location\.(href|assign|replace)|router\.(push|replace)|\bredirect\s*\(/.test(src)).toBe(false);
  });
});
