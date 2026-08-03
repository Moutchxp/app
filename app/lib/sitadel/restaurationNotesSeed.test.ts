import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S26 — garde-fous STATIQUES du seed de restauration des notes de protocole effacées. On vérifie que le seed : (1) est un
 * UPDATE ... FROM (jamais un INSERT dans mairie_contact), (2) ne repose la note QUE si elle est actuellement vide (le
 * travail humain prime), (3) ne touche QUE la colonne note, (4) journalise, (5) reprend VERBATIM des notes des seeds
 * sources (ancrage anti-dérive). Aucune connexion DB.
 */
const seed = readFileSync('db/seed/2026-08-03f_restauration_notes.sql', 'utf8');
const src = {
  protocoles: readFileSync('db/seed/2026-08-03_protocoles_communes.sql', 'utf8'),
  complement: readFileSync('db/seed/2026-08-03b_protocoles_complement.sql', 'utf8'),
  lot2: readFileSync('db/seed/2026-08-03d_protocoles_lot2.sql', 'utf8'),
};
/** Lignes de code effectives (hors commentaires `--`). */
const code = seed.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S26 — seed restauration des notes : garde-fous + ancrage verbatim', () => {
  it('UPDATE ... FROM, jamais d’INSERT INTO mairie_contact (les lignes existent déjà)', () => {
    expect(/UPDATE\s+mairie_contact/i.test(code)).toBe(true);
    expect(/INSERT\s+INTO\s+mairie_contact\b/i.test(code)).toBe(false); // le journal, lui, EST un INSERT — table distincte
    expect(/INSERT\s+INTO\s+mairie_contact_journal/i.test(code)).toBe(true);
  });
  it('ne repose la note QUE là où elle est VIDE (une note modifiée à la main est protégée)', () => {
    expect(/coalesce\(btrim\(mc\.note\),\s*''\)\s*=\s*''/i.test(code)).toBe(true);
  });
  it('ne touche QUE la colonne note (ni canal, ni email, ni adresse)', () => {
    expect(/SET\s+note\s*=/.test(code)).toBe(true);
    expect(/SET\s+canal/i.test(code)).toBe(false);
    expect(/SET\s+email/i.test(code)).toBe(false);
    expect(/adresse_postale\s*=/.test(code)).toBe(false);
  });
  it('une seule transaction, aucun DDL/DELETE destructeur', () => {
    expect(/BEGIN;/.test(code)).toBe(true);
    expect(/COMMIT;/.test(code)).toBe(true);
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|VIEW)|DELETE\s+FROM|ALTER\s+TABLE/i.test(code)).toBe(false);
  });
  it('les notes reposées sont VERBATIM celles des seeds sources (ancrage anti-dérive)', () => {
    // Paris (protocoles_communes)
    const paris = "'Consult''ADS, compte MonParis + FranceConnect obligatoire. PRADA Charles Chenel, daj-cada@paris.fr. Ancienne adresse courrier BASU conservée.'";
    expect(code).toContain(paris);
    expect(src.protocoles).toContain(paris);
    // Goupillières (b_protocoles_complement)
    const goupillieres = "'Aucune adresse e-mail publiée, formulaire de contact générique uniquement. CC Cœur d''Yvelines.'";
    expect(code).toContain(goupillieres);
    expect(src.complement).toContain(goupillieres);
    // Meudon (d_protocoles_lot2)
    const meudon = "'Consultation des dossiers DÉCIDÉS possible, sur rendez-vous. Fermé le jeudi.'";
    expect(code).toContain(meudon);
    expect(src.lot2).toContain(meudon);
  });
  it('le lot couvre bien 23 communes (6 + 2 + 15)', () => {
    const codesInsee = [...code.matchAll(/\('(\d{5})'/g)].map((m) => m[1]);
    expect(new Set(codesInsee).size).toBe(23);
  });
});
