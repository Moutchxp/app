import { describe, it, expect } from 'vitest';
import { construireFiltres, lireFiltres, versCsv, type LigneProfil } from './extraction';

describe('construireFiltres — clauses paramétrées, extensibles, anti-injection', () => {
  it('aucun filtre → aucune clause, aucun paramètre', () => {
    const r = construireFiltres({});
    expect(r.clauses).toEqual([]);
    expect(r.params).toEqual([]);
  });

  it('score min + max → placeholders séquentiels $1, $2', () => {
    const r = construireFiltres({ scoreMin: 10, scoreMax: 80 });
    expect(r.clauses).toEqual(['p.score >= $1', 'p.score <= $2']);
    expect(r.params).toEqual([10, 80]);
  });

  it('commune INSEE valide → clause paramétrée', () => {
    const r = construireFiltres({ communeInsee: '92004' });
    expect(r.clauses).toEqual(['p.commune_insee = $1']);
    expect(r.params).toEqual(['92004']);
  });

  it('commune malformée (tentative d’injection) → IGNORÉE (jamais interpolée)', () => {
    const r = construireFiltres({ communeInsee: "1; DROP TABLE internaute" });
    expect(r.clauses).toEqual([]);
    expect(r.params).toEqual([]);
  });

  it('verdict hors énumération → ignoré ; verdict valide → clause', () => {
    expect(construireFiltres({ verdict: 'HACK' }).clauses).toEqual([]);
    expect(construireFiltres({ verdict: 'SANS_VIS_A_VIS' }).clauses).toEqual(['p.verdict = $1']);
  });

  it('booléens : true/false → clause ; null → ignoré', () => {
    expect(construireFiltres({ dernierEtage: true }).clauses).toEqual(['p.dernier_etage = $1']);
    expect(construireFiltres({ dernierEtage: false }).params).toEqual([false]);
    expect(construireFiltres({ dernierEtage: null }).clauses).toEqual([]);
  });

  it('dates ISO → clauses sur i.cree_a ; date invalide → ignorée', () => {
    const r = construireFiltres({ creeApres: '2026-07-01', creeAvant: '2026-07-31' });
    expect(r.clauses).toEqual(['i.cree_a >= $1', 'i.cree_a <= $2']);
    expect(construireFiltres({ creeApres: 'hier' }).clauses).toEqual([]);
    expect(construireFiltres({ creeApres: '2026-13-45' }).clauses).toEqual([]); // format ISO mais date impossible → ignorée
  });

  it('combinaison → placeholders continus dans l’ordre d’ajout', () => {
    const r = construireFiltres({ communeInsee: '75056', scoreMin: 50, dernierEtage: true });
    expect(r.clauses).toEqual(['p.commune_insee = $1', 'p.score >= $2', 'p.dernier_etage = $3']);
    expect(r.params).toEqual(['75056', 50, true]);
  });

  it('consentement F2/F3 = AND EXISTS RESTRICTIF (jamais un OR, jamais un ajout de non-F1)', () => {
    // F2 coché → une clause EXISTS supplémentaire (finalité email_marketing ACTIVE pour cette personne), sans paramètre.
    const f2 = construireFiltres({ aF2: true });
    expect(f2.clauses).toHaveLength(1);
    expect(f2.clauses[0]).toContain('EXISTS');
    expect(f2.clauses[0]).toContain("finalite = 'email_marketing'");
    expect(f2.clauses[0]).toContain('actif = true');
    expect(f2.params).toEqual([]); // finalité = littéral constant, jamais un paramètre lié (anti-injection)
    // F3 → finalité retargeting_tiers.
    expect(construireFiltres({ aF3: true }).clauses[0]).toContain("finalite = 'retargeting_tiers'");
    // GARDE-FOU sémantique : les clauses sont jointes par AND dans extractionRepo (RÉDUISENT) — aucune n'introduit
    // « OR » qui élargirait hors F1.
    expect(f2.clauses[0]).not.toContain('OR');
    // F2 + F3 cochés → DEUX clauses AND cumulatives (F1 ∧ F2 ∧ F3).
    expect(construireFiltres({ aF2: true, aF3: true }).clauses).toHaveLength(2);
    // Non coché (false / null / absent) → AUCUNE clause (n'élargit ni ne restreint).
    expect(construireFiltres({ aF2: false, aF3: null }).clauses).toEqual([]);
    expect(construireFiltres({}).clauses).toEqual([]);
  });
});

describe('lireFiltres — parsing des query params', () => {
  it('parse nombres, booléens, chaînes ; ignore vide', () => {
    const p = new URLSearchParams('commune=92004&scoreMin=10&dernierEtage=true&residencePrincipale=false&verdict=VIS_A_VIS&scoreMax=');
    const f = lireFiltres(p);
    expect(f.communeInsee).toBe('92004');
    expect(f.scoreMin).toBe(10);
    expect(f.scoreMax).toBeNull();
    expect(f.dernierEtage).toBe(true);
    expect(f.residencePrincipale).toBe(false);
    expect(f.verdict).toBe('VIS_A_VIS');
  });

  it('f2/f3 : « true » → restriction demandée ; absent → null (aucune restriction)', () => {
    const f = lireFiltres(new URLSearchParams('f2=true&f3=true'));
    expect(f.aF2).toBe(true);
    expect(f.aF3).toBe(true);
    const vide = lireFiltres(new URLSearchParams(''));
    expect(vide.aF2).toBeNull();
    expect(vide.aF3).toBeNull();
  });
});

describe('versCsv — sérialisation minimisée et échappée', () => {
  const base: LigneProfil = {
    id: 'x', prenom: 'Ada', nom: 'Lovelace', email: 'ada@example.com', telephone: '+33612345678',
    cree_a: '2026-07-01T10:00:00Z', verdict: 'SANS_VIS_A_VIS', score: 42.5, commune_insee: '92004',
    dernier_etage: true, residence_principale: false, consenti_le: '2026-07-01T10:00:00Z',
  };

  it('en-tête + une ligne', () => {
    const csv = versCsv([base]);
    const [entete, ligne] = csv.split('\r\n');
    expect(entete).toBe('prenom,nom,email,telephone,commune_insee,verdict,score,dernier_etage,residence_principale,profil_cree_le,consenti_le');
    expect(ligne.startsWith('Ada,Lovelace,ada@example.com')).toBe(true);
  });

  it('échappe virgule/guillemet/retour ligne (RFC 4180) et null → vide', () => {
    const csv = versCsv([{ ...base, prenom: 'Nom, avec virgule', nom: 'Guill"emet', email: null }]);
    const ligne = csv.split('\r\n')[1];
    expect(ligne).toContain('"Nom, avec virgule"');
    expect(ligne).toContain('"Guill""emet"');
    expect(ligne).toContain(',,'); // email null → champ vide
  });
});
