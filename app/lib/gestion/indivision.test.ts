import { describe, expect, it } from 'vitest';
import { motIndivision, sqlCoproprietairesActifs, sqlLienEnCours } from './indivision';

/** 🔴 Arno (20/10/2026) — la mention « en indivision avec » : les AUTRES copropriétaires ACTIFS de CE bien, sinon rien. */
const norme = (s: string): string => s.replace(/\s+/g, ' ');

describe('motIndivision', () => {
  it('aucun autre copropriétaire actif → aucune mention', () => {
    expect(motIndivision([])).toBeNull();
    expect(motIndivision(null)).toBeNull();
    expect(motIndivision(undefined)).toBeNull();
    expect(motIndivision(['  '])).toBeNull();
  });
  it('des copropriétaires → la mention ne cite qu’eux, au singulier ou au pluriel ; jamais le mot « indivision »', () => {
    expect(motIndivision(['DUPONT Jean'])).toBe('Copropriétaire : DUPONT Jean');
    expect(motIndivision(['DUPONT Jean', 'MARTIN Léa'])).toBe('Copropriétaires : DUPONT Jean, MARTIN Léa');
    expect(motIndivision(['DUPONT Jean', 'MARTIN Léa'])).not.toMatch(/indivis/i);
  });
});

describe('sqlCoproprietairesActifs — par fragments sémantiques', () => {
  const sql = norme(sqlCoproprietairesActifs('lo', '$1', 'px.supprime_le IS NULL'));
  it('jamais le propriétaire de la fiche affichée', () => { expect(sql).toContain('px.id <> $1'); });
  it('fiche archivée ou supprimée → exclue', () => {
    expect(sql).toContain('px.archive_le IS NULL');
    expect(sql).toContain('px.supprime_le IS NULL');
  });
  it('POUR CE BIEN : le titulaire, ou un lien de ce bien-là (jamais un lien d’un autre bien)', () => {
    expect(sql).toContain('px.id = lo.proprietaire_id');
    expect(sql).toContain('lp.lot_id = lo.id AND lp.proprietaire_id = px.id');
  });
  it('lien terminé ou pas encore commencé → exclu', () => {
    expect(norme(sqlLienEnCours('lp'))).toBe("(lp.depuis IS NULL OR lp.depuis <= (now() AT TIME ZONE 'Europe/Paris')::date) AND "
      + "(lp.jusqu_a IS NULL OR lp.jusqu_a >= (now() AT TIME ZONE 'Europe/Paris')::date)");
    expect(sql).toContain(norme(sqlLienEnCours('lp')));
  });
});
