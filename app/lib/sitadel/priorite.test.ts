import { describe, it, expect } from 'vitest';
import { CONFIG_VEILLE_DEFAUT, type ConfigVeille } from './veilleConfig';
import {
  type DossierClassable, type FiltresPermis,
  classer, construireRequeteListe, construireRequeteTotal, construireRequeteComptes, lireFiltres,
  formaterDateJour, libelleCommune,
} from './priorite';

const C = CONFIG_VEILLE_DEFAUT; // seuils 10 / 1500 ; rangs 1..5

function pc(over: Partial<DossierClassable> = {}): DossierClassable {
  return { type: 'PC', natureProjetCompletee: null, iExtension: false, iSurelevation: false, nbLgtTotCrees: null, surfCreee: null, ...over };
}
const FILTRES_VIDES: FiltresPermis = {
  departement: null, commune: null, type: null, rang: null, depuis: null, jusqua: null, surfaceMin: null, logementsMin: null, q: null,
};

describe('Sitadel S3 — classement (un cas par rang)', () => {
  it('rang 1 : immeuble neuf par LOGEMENTS (nature=1, nb_lgt ≥ seuil)', () => {
    expect(classer(pc({ natureProjetCompletee: '1', nbLgtTotCrees: 30 }), C)).toMatchObject({ cle: 'immeuble_neuf', rang: 1 });
  });
  it('rang 1 : immeuble NON RÉSIDENTIEL (0 logement, 40 000 m²) → immeuble neuf par la SURFACE', () => {
    expect(classer(pc({ natureProjetCompletee: '1', nbLgtTotCrees: 0, surfCreee: 40000 }), C)).toMatchObject({ cle: 'immeuble_neuf', rang: 1 });
  });
  it('rang 2 : surélévation (i_surelevation, nature ≠ 1)', () => {
    expect(classer(pc({ natureProjetCompletee: '2', iSurelevation: true }), C)).toMatchObject({ cle: 'surelevation', rang: 2 });
  });
  it('rang 3 : construction neuve (nature=1, petite)', () => {
    expect(classer(pc({ natureProjetCompletee: '1', nbLgtTotCrees: 1, surfCreee: 90 }), C)).toMatchObject({ cle: 'construction_neuve', rang: 3 });
  });
  it('rang 4 : extension (nature ∈ {3,5} ou i_extension)', () => {
    expect(classer(pc({ natureProjetCompletee: '5' }), C)).toMatchObject({ cle: 'extension', rang: 4 });
    expect(classer(pc({ natureProjetCompletee: '2', iExtension: true }), C)).toMatchObject({ cle: 'extension', rang: 4 });
  });
  it('rang 5 : démolition (type=PD)', () => {
    expect(classer(pc({ type: 'PD' }), C)).toMatchObject({ cle: 'demolition', rang: 5 });
  });

  it('surface NULL ne casse pas le classement (traitée comme 0 → pas immeuble par surface)', () => {
    const r = classer(pc({ natureProjetCompletee: '1', nbLgtTotCrees: 2, surfCreee: null }), C);
    expect(r.cle).toBe('construction_neuve');
  });

  it('ordre STABLE : deux appels identiques donnent le même classement', () => {
    const d = pc({ natureProjetCompletee: '1', nbLgtTotCrees: 30, surfCreee: 5000 });
    expect(classer(d, C)).toEqual(classer(d, C));
  });
});

describe('Sitadel S3 — un seuil de config change le rang (sans toucher au code)', () => {
  it('même dossier : immeuble par surface OU construction neuve selon seuil_surface_immeuble_m2', () => {
    const d = pc({ natureProjetCompletee: '1', nbLgtTotCrees: 0, surfCreee: 1000 });
    const strict: ConfigVeille = { ...C, seuilSurfaceImmeubleM2: 1500 }; // 1000 < 1500 → pas immeuble
    const lache: ConfigVeille = { ...C, seuilSurfaceImmeubleM2: 500 };   // 1000 ≥ 500  → immeuble
    expect(classer(d, strict).cle).toBe('construction_neuve');
    expect(classer(d, lache).cle).toBe('immeuble_neuf');
  });
  it('rangs réordonnables : rang_extension=1 fait passer une extension devant', () => {
    const d = pc({ natureProjetCompletee: '5' });
    expect(classer(d, { ...C, rangExtension: 1 }).rang).toBe(1);
  });
});

describe('Sitadel S3 — construction de la requête filtrée', () => {
  const req = (f: Partial<FiltresPermis>) => construireRequeteTotal({ ...FILTRES_VIDES, ...f }, C);

  it('chaque filtre isolé produit sa clause + son paramètre', () => {
    expect(req({ departement: '92' }).params).toContain('92');
    expect(req({ commune: '92050' }).texte).toContain('code_insee =');
    expect(req({ type: 'PD' }).params).toContain('PD');
    expect(req({ depuis: '2024-01-01' }).texte).toContain('date_reelle_autorisation >=');
    expect(req({ jusqua: '2025-12-31' }).texte).toContain('date_reelle_autorisation <=');
    expect(req({ surfaceMin: 1500 }).params).toContain(1500);
    expect(req({ logementsMin: 10 }).texte).toContain('nb_lgt_tot_crees');
  });

  it('filtre CATÉGORIE (rang) référence l’expression de rang', () => {
    const { texte, params } = req({ rang: 1 });
    expect(texte).toContain('LEAST(');
    expect(params).toContain(1);
  });

  it('deux filtres combinés → deux clauses jointes par AND, deux paramètres', () => {
    const { texte, params } = req({ departement: '75', type: 'PC' });
    expect(texte).toContain(' AND ');
    expect(params).toEqual(expect.arrayContaining(['75', 'PC']));
  });

  it('liste paginée : LIMIT/OFFSET + tri par rang puis num_dau (stable)', () => {
    const { texte, params } = construireRequeteListe(FILTRES_VIDES, C, 3, 25);
    expect(texte).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(texte).toContain('num_dau ASC'); // tri tertiaire stable
    expect(params).toContain(25);           // taille
    expect(params).toContain(50);           // offset = (3-1)*25
  });

  it('compteurs par catégorie : GROUP BY rang, sans le filtre catégorie', () => {
    const { texte } = construireRequeteComptes({ ...FILTRES_VIDES, rang: 1, departement: '93' }, C);
    expect(texte).toContain('GROUP BY rang');
    expect(texte).toContain('departement ='); // le filtre département reste
  });
});

describe('Sitadel S3 — recherche par préfixe / troncature', () => {
  it('la recherche émet ILIKE (sous-chaîne) ET word_similarity (trigramme) — retrouve un libellé tronqué', () => {
    const { texte, params } = construireRequeteTotal({ ...FILTRES_VIDES, q: 'ISSY-LES-MOULINEAUX' }, C);
    expect(texte).toContain('ILIKE');
    expect(texte).toContain('word_similarity'); // c'est LUI qui retrouve « A 49 QUAI D'ISSY-LES-MOUL » tronqué
    expect(params).toContain('ISSY-LES-MOULINEAUX');      // terme brut pour le trigramme
    expect(params).toContain('%ISSY-LES-MOULINEAUX%');    // sous-chaîne voie
    expect(params).toContain('ISSY-LES-MOULINEAUX%');     // préfixe numéro
  });

  it('filtre commune par NOM : clause insensible casse+accents (svv_unaccent_immutable) OU code exact', () => {
    const { texte, params } = construireRequeteTotal({ ...FILTRES_VIDES, commune: 'Le Chesnay' }, C);
    expect(texte).toContain('code_insee =');            // accepte encore le code exact
    expect(texte).toContain('svv_unaccent_immutable');  // + recherche par nom insensible casse/accents
    expect(texte).toContain('LIKE');
    expect(params).toContain('Le Chesnay');
  });

  it('lireFiltres : valeurs valides retenues, invalides ignorées', () => {
    const sp = new URLSearchParams('departement=92&type=XX&rang=2&depuis=2024-01-01&jusqua=mauvais&q=%20rue%20');
    const f = lireFiltres(sp);
    expect(f.departement).toBe('92');
    expect(f.type).toBeNull();      // 'XX' invalide
    expect(f.rang).toBe(2);
    expect(f.depuis).toBe('2024-01-01');
    expect(f.jusqua).toBeNull();    // 'mauvais' non ISO
    expect(f.q).toBe('rue');        // trim
  });
});

describe('Sitadel S4 — affichage (date sans fuseau, commune dégradée)', () => {
  it('formaterDateJour : même jour quel que soit le fuseau (jamais new Date())', () => {
    expect(formaterDateJour('2025-12-10')).toBe('2025-12-10');
    expect(formaterDateJour('2025-12-10T23:00:00.000Z')).toBe('2025-12-10'); // pas de décalage de jour
    expect(formaterDateJour('2025-01-01T00:00:00.000Z')).toBe('2025-01-01');
    expect(formaterDateJour(null)).toBe('—');
  });

  it('libelleCommune : « Nom (code) » si connu, code seul si orphelin (dégradation propre)', () => {
    expect(libelleCommune('Nanterre', '92050')).toBe('Nanterre (92050)');
    expect(libelleCommune(null, '93059')).toBe('93059');   // code Sitadel sans commune → jamais d'erreur
    expect(libelleCommune('', '78503')).toBe('78503');
  });
});
