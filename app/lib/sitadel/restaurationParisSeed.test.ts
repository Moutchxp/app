import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S23 — garde-fous STATIQUES du seed de restauration de l'adresse BASU de Paris. On vérifie que le seed : (1) repose la
 * valeur EXACTE de la migration 051 (aucune dérive), (2) est un UPDATE ... FROM (jamais un INSERT dans mairie_contact),
 * (3) ne touche NI au canal NI à l'e-mail, (4) est idempotent par CONTENU, (5) journalise. Aucune connexion DB.
 */
const seed = readFileSync('db/seed/2026-08-03e_restauration_paris.sql', 'utf8');
const migration051 = readFileSync('db/migrations/051_mairie_canal.sql', 'utf8');

/** Le littéral SQL d'adresse BASU tel qu'écrit dans la migration 051 (apostrophes SQL doublées incluses). */
const ADRESSE_051 = "'Direction de l''Urbanisme — Bureau Accueil et Service à l''Usager (BASU), 6 promenade Claude-Lévi-Strauss, CS 51388, 75639 PARIS CEDEX 13'";
/** Lignes de code effectives (hors commentaires `--`). */
const code = seed.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S23 — seed restauration Paris : valeur exacte + garde-fous', () => {
  it('la migration 051 contient bien l’adresse de référence (ancrage)', () => {
    expect(migration051).toContain(ADRESSE_051);
  });
  it('le seed repose EXACTEMENT cette adresse (aucune dérive vs 051)', () => {
    expect(code).toContain(ADRESSE_051);
  });
  it('UPDATE ... FROM, jamais d’INSERT INTO mairie_contact (la ligne existe déjà)', () => {
    expect(/UPDATE\s+mairie_contact/i.test(code)).toBe(true);
    expect(/INSERT\s+INTO\s+mairie_contact\b/i.test(code)).toBe(false); // (le journal, lui, est bien un INSERT — table distincte)
  });
  it('ne touche NI au canal NI à l’e-mail : seule adresse_postale (+ maj_le) est écrite', () => {
    expect(/SET\s+canal/i.test(code)).toBe(false);
    expect(/SET\s+email/i.test(code)).toBe(false);
    expect(/adresse_postale\s*=/.test(code)).toBe(true);
  });
  it('idempotence de CONTENU (IS DISTINCT FROM) et journalisation', () => {
    expect(/adresse_postale\s+IS\s+DISTINCT\s+FROM/i.test(code)).toBe(true);
    expect(/INSERT\s+INTO\s+mairie_contact_journal/i.test(code)).toBe(true);
  });
  it('une seule transaction, aucun DDL destructeur', () => {
    expect(/BEGIN;/.test(code)).toBe(true);
    expect(/COMMIT;/.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|VIEW)|DELETE\s+FROM|ALTER\s+TABLE/i.test(code)).toBe(false);
  });
});
