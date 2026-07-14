import { describe, it, expect } from 'vitest';
import { construireFiltres, clauseStatuts, exprConsentiLe, normaliserStatuts, lireStatuts, ordreListe, STATUTS_EXPORT, FINALITE_F1, lireFiltres, versCsv, type LigneProfil } from './extraction';

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

  it('AUCUNE clause de consentement ici : les statuts F1/F2/F3 sont portés par `clauseStatuts`, jamais par construireFiltres', () => {
    expect(construireFiltres({}).clauses).toEqual([]); // filtres secondaires SEULEMENT ; le consentement ne fuit pas ici
  });
});

describe('recherche texte `q` (LOT A-2) — tokenisée, insensible aux accents, LIÉE (anti-injection), OR CONFINÉ au nom', () => {
  it('un mot → clause (unaccent prénom ILIKE $ OR unaccent nom ILIKE $), même paramètre lié `%mot%`', () => {
    const r = construireFiltres({ q: 'thevenin' });
    expect(r.clauses).toEqual(['(unaccent(i.prenom) ILIKE unaccent($1) OR unaccent(i.nom) ILIKE unaccent($1))']);
    expect(r.params).toEqual(['%thevenin%']); // wildcards ajoutés côté JS ; la valeur est LIÉE, jamais interpolée
  });

  it('ORDRE LIBRE : « thevenin pierre » = « pierre thevenin » (chaque mot = 1 clause, toutes ANDées)', () => {
    const a = construireFiltres({ q: 'thevenin pierre' });
    const b = construireFiltres({ q: 'pierre  thevenin' }); // espaces multiples tolérés
    expect(a.clauses).toHaveLength(2);
    expect(a.params).toEqual(['%thevenin%', '%pierre%']);
    expect(b.params).toEqual(['%pierre%', '%thevenin%']);
    // Mêmes prédicats (à l'ordre près) → même population (jointure AND côté repo, commutative).
    expect(new Set(a.params)).toEqual(new Set(b.params));
  });

  it('OR CONFINÉ au filtre nom/prénom, JAMAIS entre statuts (les EXISTS de statuts restent en AND)', () => {
    const from = clauseStatuts(['recontact_interne', 'email_marketing']); // 2 EXISTS
    const { clauses } = construireFiltres({ q: 'thevenin pierre' });
    const requete = `SELECT i.id ${from} WHERE true AND ${clauses.join(' AND ')}`;
    expect(from).not.toMatch(/\bOR\b/); //           les 2 statuts ne sont JAMAIS joints par OR
    expect(from).toContain('AND EXISTS'); //         2e statut précédé de AND
    clauses.forEach((c) => {
      expect(c.startsWith('(') && c.endsWith(')')).toBe(true); // chaque OR est entre parenthèses (confiné)
      expect((c.match(/ OR /g) ?? [])).toHaveLength(1); //        exactement 1 OR (prénom OU nom) par mot
    });
    // Total des OR de la requête = nombre de mots (2) → aucun OR ailleurs (ni entre EXISTS).
    expect((requete.match(/ OR /g) ?? [])).toHaveLength(2);
  });

  it('métacaractères LIKE (%, _, \\) ÉCHAPPÉS → littéraux (pas de joker involontaire)', () => {
    expect(construireFiltres({ q: '50%' }).params).toEqual(['%50\\%%']);
    expect(construireFiltres({ q: 'a_b' }).params).toEqual(['%a\\_b%']);
    expect(construireFiltres({ q: 'x\\y' }).params).toEqual(['%x\\\\y%']);
  });

  it('injection SQL impossible : `q` est LIÉE ($n) — AUCUN caractère utilisateur dans le SQL, charge dans les paramètres', () => {
    const { clauses, params } = construireFiltres({ q: "x'; DROP TABLE internaute --" });
    const sql = clauses.join(' ');
    expect(sql).not.toContain('DROP'); //   la charge n'est PAS dans le texte SQL
    expect(sql).not.toContain("'"); //      AUCUNE apostrophe littérale dans le SQL (tout passe par $n)
    expect(sql).toContain('$1'); //         les valeurs sont LIÉES en paramètres
    expect(params.join('|')).toContain('DROP'); // la charge (tokenisée) vit dans les PARAMÈTRES, inerte
  });

  it('q vide / uniquement des espaces → AUCUNE clause', () => {
    expect(construireFiltres({ q: '' }).clauses).toEqual([]);
    expect(construireFiltres({ q: '   ' }).clauses).toEqual([]);
  });

  it('ordreListe : q actif → ALPHABÉTIQUE stable (nom, prénom, i.id) ; sinon → récent d’abord', () => {
    expect(ordreListe({ q: 'thevenin' })).toBe('ORDER BY i.nom NULLS LAST, i.prenom NULLS LAST, i.id');
    expect(ordreListe({ q: '   ' })).toBe('ORDER BY i.cree_a DESC'); // q blanc → pas une recherche
    expect(ordreListe({})).toBe('ORDER BY i.cree_a DESC');
  });
});

describe('clauseStatuts — INTERSECTION de statuts (un EXISTS par statut en AND, zéro OR, fail-closed sur vide)', () => {
  const F1 = 'recontact_interne';
  const F2 = 'email_marketing';
  const F3 = 'retargeting_tiers';

  it('{F1} : EXISTS(recontact_interne actif) + opposition_recontact (opt-out F1) + efface_a ; jamais un LEFT, zéro OR', () => {
    const q = clauseStatuts([F1]);
    expect(q).toContain("ca_recontact_interne.finalite = 'recontact_interne' AND ca_recontact_interne.actif = true");
    expect(q).toContain('i.opposition_recontact = false'); // F1 ∈ statuts → opt-out appliqué
    expect(q).toContain('i.efface_a IS NULL');
    expect(q).toContain('ORDER BY pr.cree_a DESC LIMIT 1'); // dernier projet (LATERAL)
    expect(q).not.toContain('LEFT JOIN internaute_consentement_actif'); // jamais un LEFT sur le consentement
    expect(q).not.toContain('WHERE false');
    expect(q).not.toContain('$1'); //  AUCUN paramètre lié → les filtres de construireFiltres commencent à $1
    expect(q).not.toMatch(/\bOR\b/);
  });

  it('{F2} : EXISTS(email_marketing actif), AUCUNE opposition (opt-out propre à F1) ; zéro OR', () => {
    const q = clauseStatuts([F2]);
    expect(q).toContain("ca_email_marketing.finalite = 'email_marketing' AND ca_email_marketing.actif = true");
    expect(q).not.toContain('opposition_recontact'); // F1 ∉ statuts
    expect(q).toContain('i.efface_a IS NULL'); //       commun à tous les statuts
    expect(q).not.toMatch(/\bOR\b/);
  });

  it('{F1,F2,F3} : TROIS EXISTS joints en AND (intersection stricte), opposition présente (F1), zéro OR', () => {
    const q = clauseStatuts([F1, F2, F3]);
    expect(q).toContain("ca_recontact_interne.finalite = 'recontact_interne'");
    expect(q).toContain("ca_email_marketing.finalite = 'email_marketing'");
    expect(q).toContain("ca_retargeting_tiers.finalite = 'retargeting_tiers'");
    expect(q.match(/EXISTS \(/g) ?? []).toHaveLength(3); // exactement 3 EXISTS, reliés par AND
    expect(q).toContain('i.opposition_recontact = false');
    expect(q).not.toMatch(/\bOR\b/);
  });

  it('ÉTANCHÉITÉ CROISÉE : {F1} n’exige QUE F1 (un F2-only, sans F1 actif, est exclu par l’EXISTS) et inversement pour {F2}', () => {
    const qF1 = clauseStatuts([F1]);
    const qF2 = clauseStatuts([F2]);
    expect(qF1).toContain("finalite = 'recontact_interne'");
    expect(qF1).not.toContain("'email_marketing'"); // {F1} ne mentionne jamais F2
    expect(qF2).toContain("finalite = 'email_marketing'");
    expect(qF2).not.toContain("'recontact_interne'"); // {F2} ne mentionne jamais F1 → un F1-only (sans F2 actif) est exclu
  });

  it('ORDRE CANONIQUE : le SQL ne dépend pas de l’ordre d’arrivée des statuts (déterministe)', () => {
    expect(clauseStatuts([F2, F1])).toBe(clauseStatuts([F1, F2]));
    expect(clauseStatuts([F3, F2, F1])).toBe(clauseStatuts([F1, F2, F3]));
  });

  it('FAIL-CLOSED : sélection VIDE → WHERE false (matche RIEN), JAMAIS de requête sans contrainte de finalité', () => {
    const q = clauseStatuts([]);
    expect(q).toContain('WHERE false');
    expect(q).not.toContain('EXISTS');
    expect(q).not.toContain('opposition_recontact');
    expect(q).not.toMatch(/\bOR\b/);
  });

  it('anti-injection : un statut forgé est ÉCARTÉ par normalisation → sélection vide → WHERE false (jamais interpolé)', () => {
    const q = clauseStatuts(["email_marketing'; DROP TABLE internaute --" as never]);
    expect(q).toContain('WHERE false');
    expect(q).not.toContain('DROP');
  });

  it('assemblage réel {F1,F2} + filtre secondaire (score) : EXISTS en AND + filtres en AND, zéro OR', () => {
    const from = clauseStatuts([F1, F2]);
    const { clauses } = construireFiltres({ scoreMin: 50 });
    const where = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
    const requete = `SELECT i.id ${from}${where} ORDER BY i.cree_a DESC`;
    expect(requete).toContain("finalite = 'recontact_interne'");
    expect(requete).toContain("finalite = 'email_marketing'");
    expect(requete).toContain('p.score >= $1'); // filtre secondaire LIÉ (paramètre), pas interpolé
    expect(requete).not.toMatch(/\bOR\b/);
  });
});

describe('exprConsentiLe — date de consentement de référence (AFFICHAGE : F1 prioritaire, sinon le plus récent)', () => {
  it('{F1} ou {F1,F2} → horodatage F1 (finalite IN recontact_interne)', () => {
    expect(exprConsentiLe(['recontact_interne'])).toContain("cax.finalite IN ('recontact_interne')");
    expect(exprConsentiLe(['recontact_interne', 'email_marketing'])).toContain("cax.finalite IN ('recontact_interne')");
    expect(exprConsentiLe(['recontact_interne'])).toContain('max(cax.horodatage)');
  });
  it('sans F1 → max des horodatages des statuts cochés', () => {
    expect(exprConsentiLe(['email_marketing', 'retargeting_tiers'])).toContain("cax.finalite IN ('email_marketing', 'retargeting_tiers')");
  });
  it('vide → NULL (cohérent avec le fail-closed)', () => {
    expect(exprConsentiLe([])).toBe('NULL::timestamptz');
  });
});

describe('normaliserStatuts & lireStatuts — validation, ordre canonique, dédoublonnage ; PEUT être vide (jamais un défaut F1)', () => {
  it('normaliserStatuts : ne garde que les clés connues, dans l’ordre canonique, sans doublon', () => {
    expect(normaliserStatuts(['email_marketing', 'recontact_interne'])).toEqual(['recontact_interne', 'email_marketing']);
    expect(normaliserStatuts(['recontact_interne', 'recontact_interne'])).toEqual(['recontact_interne']); // dédoublonné
    expect(normaliserStatuts(['inconnu', 'x'])).toEqual([]); //                                            inconnus écartés
    expect(normaliserStatuts([])).toEqual([]);
  });
  it('lireStatuts : parse `statuts=csv`, valide & normalise ; absent / vide / forgé → [] (JAMAIS un repli F1)', () => {
    expect(lireStatuts(new URLSearchParams('statuts=email_marketing,recontact_interne'))).toEqual(['recontact_interne', 'email_marketing']);
    expect(lireStatuts(new URLSearchParams(''))).toEqual([]); //                                absent → vide
    expect(lireStatuts(new URLSearchParams('statuts='))).toEqual([]); //                        vide → vide
    expect(lireStatuts(new URLSearchParams("statuts=hack'; DROP TABLE internaute"))).toEqual([]); // forgé → écarté → vide
    expect(lireStatuts(new URLSearchParams('statuts=recontact_interne,inconnu'))).toEqual(['recontact_interne']); // garde le connu
  });
});

describe('STATUTS_EXPORT — les 3 statuts sélectionnables (clés issues de FINALITES_SEED)', () => {
  it('F1/F2/F3, F1 en tête (= FINALITE_F1)', () => {
    expect(STATUTS_EXPORT.map((s) => s.statut)).toEqual(['recontact_interne', 'email_marketing', 'retargeting_tiers']);
    expect(STATUTS_EXPORT.map((s) => s.code)).toEqual(['F1', 'F2', 'F3']);
    expect(STATUTS_EXPORT[0].statut).toBe(FINALITE_F1);
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

  it('les statuts F1/F2/F3 ne transitent PAS par lireFiltres (portés par `lireStatuts`) — `f2`/`f3` ignorés ici', () => {
    const f = lireFiltres(new URLSearchParams('f2=true&f3=true&scoreMin=10'));
    expect(f.scoreMin).toBe(10); // les filtres secondaires passent
    expect(f).not.toHaveProperty('aF2'); // aucun champ de consentement dans FiltresExtraction
    expect(f).not.toHaveProperty('aF3');
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
