import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_GESTION_DEFAUT } from './config';

/**
 * LOT 3-quinquies — garde-fous STATIQUES de la migration 231. Deux choses sont protégées ici, et la seconde est la plus
 * grave : qu'on ne mémorise JAMAIS un UID sans son UIDVALIDITY. Un UID seul est un piège — le serveur les réattribue
 * depuis 1 quand il recrée un dossier, et des messages jamais lus passeraient alors pour lus.
 */
const prose = readFileSync('db/migrations/231_gestion_uid_et_pieces_calendrier.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('231 — UID et UIDVALIDITY vont ENSEMBLE', () => {
  it('ajoute les deux colonnes, jamais l’une sans l’autre', () => {
    expect(/ADD COLUMN IF NOT EXISTS uid_imap\s+bigint/.test(code)).toBe(true);
    expect(/ADD COLUMN IF NOT EXISTS uid_validity bigint/.test(code)).toBe(true);
  });

  it('elles sont NULLABLES : on n’invente pas un UID pour les messages déjà capturés', () => {
    expect(/uid_imap\s+bigint NOT NULL|uid_validity bigint NOT NULL/.test(code)).toBe(false);
  });

  it('l’index porte les DEUX, dans cet ordre, et seulement les lignes qui ont un UID', () => {
    expect(code).toContain('ON gestion_message (uid_validity, uid_imap) WHERE uid_imap IS NOT NULL');
  });

  it('le DANGER d’un UID sans UIDVALIDITY est écrit en clair', () => {
    expect(prose).toContain('RÉATTRIBUE les UID depuis 1');
    expect(prose).toContain('messages jamais lus pour des messages déjà lus');
  });
});

describe('231 — les invitations de rendez-vous, AJOUTÉES sans écraser', () => {
  it('complète la liste sans jamais la remplacer', () => {
    expect(code).toContain("types_pieces_acceptes || ',text/calendar'");
    expect(code).toContain("types_pieces_acceptes || ',application/ics'");
  });

  it('ne rajoute rien si le type y est déjà (rejouable, et un réglage manuel n’est pas écrasé)', () => {
    expect(code).toContain("types_pieces_acceptes NOT LIKE '%text/calendar%'");
    expect(code).toContain("types_pieces_acceptes NOT LIKE '%application/ics%'");
  });

  it('le repli du code connaît les mêmes deux types', () => {
    expect(CONFIG_GESTION_DEFAUT.typesPiecesAcceptes).toContain('text/calendar');
    expect(CONFIG_GESTION_DEFAUT.typesPiecesAcceptes).toContain('application/ics');
  });

  it('le stockage sait leur donner une extension (sinon la pièce serait déposée en « bin »)', () => {
    const src = readFileSync('app/lib/stockage/index.ts', 'utf8');
    expect(src).toContain("'text/calendar': 'ics'");
    expect(src).toContain("'application/ics': 'ics'");
  });
});

describe('231 — additive, idempotente, sans effet sur le reste', () => {
  it('n’écrit QUE dans la configuration du module, et seulement pour compléter une liste', () => {
    const cibles = [...code.matchAll(/(?:UPDATE|INSERT INTO)\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
    expect(new Set(cibles)).toEqual(new Set(['gestion_config']));
    expect(/DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX)/i.test(code)).toBe(false);
  });

  it('n’altère que gestion_message, et aucune table d’un autre module', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alterees)).toEqual(new Set(['gestion_message']));
  });

  it('dit que la relève fonctionne SANS elle', () => {
    expect(prose).toContain('LA RELÈVE FONCTIONNE SANS CETTE MIGRATION');
    expect(prose).toContain('42703');
  });

  it('une seule transaction, un bloc de vérification, un rollback, et livrée NON APPLIQUÉE', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/231_gestion_uid_et_pieces_calendrier.sql');
  });
});
