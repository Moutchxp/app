import { describe, it, expect } from 'vitest';
import {
  sqlSelectionCandidats, sqlHorsPerimetre, sqlMajRapprochement, sqlMatchCommune,
  sqlUpsertMairiePrada, sqlJournalMairiePrada,
} from './pradaRapprocher';

describe('S14c — invariants SQL du rapprochement (verrouillés, sans base)', () => {
  it('candidats : classement Mairie + périmètre LU EN BASE (jamais en dur) + jamais une ligne manuel', () => {
    const s = sqlSelectionCandidats();
    expect(s).toContain("classement = 'Mairie'");
    expect(s).toContain('SELECT DISTINCT departement FROM commune'); // périmètre lu en base
    expect(s).not.toMatch(/'7[58]'|'9[23]'/);                        // aucun code de département en dur
    expect(s).toContain("rapprochement <> 'manuel'");
  });

  it('hors périmètre en masse → \'hors_perimetre\', sans jamais toucher une ligne manuel', () => {
    const s = sqlHorsPerimetre();
    expect(s).toContain("rapprochement = 'hors_perimetre'");
    expect(s).toContain("rapprochement <> 'manuel'");
    expect(s).toContain('SELECT DISTINCT departement FROM commune');
  });

  it('INVARIANT humain (prada_import) : la MAJ du rapprochement garde rapprochement <> manuel', () => {
    expect(sqlMajRapprochement()).toContain("rapprochement <> 'manuel'");
  });

  it('comparaison EXACTE : departement égal + lower(svv_unaccent_immutable(nom)) des DEUX côtés', () => {
    const s = sqlMatchCommune();
    expect(s).toContain('departement = $1');
    expect(s).toMatch(/lower\(svv_unaccent_immutable\(nom\)\)\s*=\s*lower\(svv_unaccent_immutable\(\$2\)\)/);
  });

  it('INVARIANT humain (mairie_prada) : DO UPDATE n’écrase NI confirme NI saisie_manuelle', () => {
    const s = sqlUpsertMairiePrada();
    expect(s).toContain('ON CONFLICT (code_insee) DO UPDATE');
    expect(s).toContain("mairie_prada.statut <> 'confirme'");
    expect(s).toContain("mairie_prada.origine <> 'saisie_manuelle'");
    expect(s).toContain("'annuaire_cada'"); // origine posée à la création
    expect(s).toContain("'presume'");        // statut posé à la création
    expect(s).toContain('(xmax = 0) AS insere');
    expect(s).not.toContain('statut = EXCLUDED');  // ne rétrograde jamais un statut
    expect(s).not.toContain('origine = EXCLUDED'); // ne réécrit jamais l'origine
  });

  it('journal PRADA : append-only sur mairie_prada_journal (colonnes transposées)', () => {
    const s = sqlJournalMairiePrada();
    expect(s).toContain('INSERT INTO mairie_prada_journal');
    expect(s).toContain('courriel_avant');
    expect(s).toContain('courriel_apres');
  });
});
