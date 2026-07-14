import { describe, it, expect } from 'vitest';
import { construireFiltres, clauseFromInvariant, AXE_DEFAUT, lireFiltres, versCsv, type LigneProfil } from './extraction';
import type { CleFinalite } from './textesConsentement';

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

  it('communes INSEE valides → clause IN paramétrée (AND sur le set F1)', () => {
    const r = construireFiltres({ communesInsee: ['92004', '75056'] });
    expect(r.clauses).toEqual(['p.commune_insee IN ($1, $2)']);
    expect(r.params).toEqual(['92004', '75056']);
  });

  it('communes : codes malformés (injection) écartés ; ensemble vide → aucune clause', () => {
    const r = construireFiltres({ communesInsee: ['92004', '1; DROP TABLE internaute', 'abc'] });
    expect(r.clauses).toEqual(['p.commune_insee IN ($1)']); // seul le code valide est lié
    expect(r.params).toEqual(['92004']);
    expect(construireFiltres({ communesInsee: [] }).clauses).toEqual([]);
    expect(construireFiltres({ communesInsee: ['xx', 'yy'] }).clauses).toEqual([]); // que des invalides → rien
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
    const r = construireFiltres({ communesInsee: ['75056'], scoreMin: 50, dernierEtage: true });
    expect(r.clauses).toEqual(['p.commune_insee IN ($1)', 'p.score >= $2', 'p.dernier_etage = $3']);
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

describe('clauseFromInvariant — FROM/JOIN paramétré par axe (LOT 1 : refactor ISO-COMPORTEMENT)', () => {
  it('AXE_DEFAUT = F1, et clauseFromInvariant() (défaut) === clauseFromInvariant("recontact_interne")', () => {
    expect(AXE_DEFAUT).toBe('recontact_interne');
    expect(clauseFromInvariant()).toBe(clauseFromInvariant('recontact_interne'));
  });

  it('axe F1 : joint recontact_interne actif ET CONSERVE tous les garde-fous historiques (opposition, effacé, dernier projet)', () => {
    const f1 = clauseFromInvariant('recontact_interne');
    expect(f1).toContain('JOIN internaute_consentement_actif ca');
    expect(f1).toContain("ca.finalite = 'recontact_interne'");
    expect(f1).toContain('ca.actif = true');
    expect(f1).toContain('i.opposition_recontact = false'); // opt-out F1 CONSERVÉ tel quel (inchangé ce lot)
    expect(f1).toContain('i.efface_a IS NULL'); //             un profil effacé ne réapparaît jamais
    expect(f1).toContain('ORDER BY pr.cree_a DESC LIMIT 1'); // dernier projet (LATERAL)
    expect(f1).not.toContain('$1'); //                         AUCUN paramètre lié dans le FROM → les filtres commencent à $1
  });

  it('axe F2 : SEULE la finalité change — preuve d’ISO (le reste du fragment est identique à F1)', () => {
    const f1 = clauseFromInvariant('recontact_interne');
    const f2 = clauseFromInvariant('email_marketing');
    expect(f2).toContain("ca.finalite = 'email_marketing'");
    expect(f2).not.toContain("ca.finalite = 'recontact_interne'");
    // F2 = F1 où l’on n’a substitué QUE le littéral de finalité (aucune autre différence).
    expect(f2).toBe(f1.replace("ca.finalite = 'recontact_interne'", "ca.finalite = 'email_marketing'"));
    // F3 : même mécanique paramétrée.
    expect(clauseFromInvariant('retargeting_tiers')).toContain("ca.finalite = 'retargeting_tiers'");
  });

  it('anti-injection : un axe non-identifiant est REFUSÉ (défense en profondeur — jamais atteint via le typage)', () => {
    expect(() => clauseFromInvariant("recontact_interne'; DROP TABLE internaute --" as CleFinalite)).toThrow();
  });
});

describe('lireFiltres — parsing des query params', () => {
  it('parse nombres, booléens, chaînes ; ignore vide', () => {
    const p = new URLSearchParams('communes=92004,92012&scoreMin=10&dernierEtage=true&residencePrincipale=false&verdict=VIS_A_VIS&scoreMax=');
    const f = lireFiltres(p);
    expect(f.communesInsee).toEqual(['92004', '92012']);
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
