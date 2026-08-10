import { describe, it, expect } from 'vitest';
import { CONFIG_VEILLE_DEFAUT, type ConfigVeille } from './veilleConfig';
import {
  type DossierClassable, type FiltresPermis,
  classer, construireRequeteListe, construireRequeteTotal, construireRequeteComptes, lireFiltres,
  formaterDateJour, libelleCommune, libelleEtat, compteursEtatDepuisRow,
  expressionRattachementSql, construireRequeteComptesRattachement,
} from './priorite';

const C = CONFIG_VEILLE_DEFAUT; // seuils 10 / 1500 ; rangs 1..5

function pc(over: Partial<DossierClassable> = {}): DossierClassable {
  return { type: 'PC', natureProjetCompletee: null, iExtension: false, iSurelevation: false, nbLgtTotCrees: null, surfCreee: null, ...over };
}
const FILTRES_VIDES: FiltresPermis = {
  departement: null, communes: [], type: null, rang: null, depuis: null, jusqua: null,
  surfaceMin: null, logementsMin: null, q: null, sansDestinataire: false, etatDau: null, rattachement: null,
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
    expect(req({ communes: ['92050'] }).texte).toContain('d.code_insee = ANY');
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

describe('V2 — ordre secondaire de tri PILOTÉ par config (tri_candidats)', () => {
  // Chaîne EXACTE de l'ex-const ORDRE_SECONDAIRE (surface DESC, puis date DESC, puis num_dau) — référence de non-régression.
  const ORDRE_HISTORIQUE =
    "(CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST, " +
    "d.date_reelle_autorisation DESC NULLS LAST, d.num_dau ASC";
  const SURFACE = "CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST";
  const DATE = 'd.date_reelle_autorisation DESC NULLS LAST';

  it('CONFIG_VEILLE_DEFAUT porte « surface_puis_date »', () => {
    expect(C.triCandidats).toBe('surface_puis_date');
  });

  it('défaut « surface_puis_date » → ordre secondaire BYTE-IDENTIQUE à l’historique (non-régression forte)', () => {
    const c: ConfigVeille = { ...C, triCandidats: 'surface_puis_date' };
    const { texte } = construireRequeteListe(FILTRES_VIDES, c, 1, 25);
    expect(texte).toContain(ORDRE_HISTORIQUE);   // exactement la chaîne d'avant le chantier
    expect(texte).toContain('num_dau ASC LIMIT'); // num_dau reste le dernier départage, avant LIMIT
  });

  it('« surface_puis_date » : la SURFACE précède la DATE', () => {
    const c: ConfigVeille = { ...C, triCandidats: 'surface_puis_date' };
    const { texte } = construireRequeteListe(FILTRES_VIDES, c, 1, 25);
    expect(texte.indexOf(SURFACE)).toBeLessThan(texte.indexOf(DATE));
  });

  it('« date_puis_surface » : la DATE précède la SURFACE, num_dau ASC toujours en dernier, NULLS LAST conservé', () => {
    const c: ConfigVeille = { ...C, triCandidats: 'date_puis_surface' };
    const { texte } = construireRequeteListe(FILTRES_VIDES, c, 1, 25);
    const iDate = texte.indexOf(DATE);
    const iSurface = texte.indexOf(SURFACE);
    expect(iDate).toBeGreaterThan(-1);
    expect(iSurface).toBeGreaterThan(-1);
    expect(iDate).toBeLessThan(iSurface);          // date AVANT surface (l'inverse du défaut)
    expect(texte).toContain('num_dau ASC LIMIT');  // départage stable conservé en dernier
    expect((texte.match(/NULLS LAST/g) ?? []).length).toBe(2); // NULLS LAST sur surface ET date
    expect(texte).not.toContain(ORDRE_HISTORIQUE); // ce n'est plus l'ordre historique
  });

  it('« date_ancienne_puis_surface » (Q3) : DATE CROISSANTE avant la surface ; num_dau ASC en dernier ; NULLS LAST conservé', () => {
    const c: ConfigVeille = { ...C, triCandidats: 'date_ancienne_puis_surface' };
    const { texte } = construireRequeteListe(FILTRES_VIDES, c, 1, 25);
    const ORDRE_ANCIENS =
      'd.date_reelle_autorisation ASC NULLS LAST, ' +
      "(CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST, d.num_dau ASC";
    expect(texte).toContain(ORDRE_ANCIENS);                    // chaîne EXACTE du nouvel ordre
    expect(texte).toContain('d.date_reelle_autorisation ASC'); // date CROISSANTE (jamais DESC dans ce mode)
    expect(texte).toContain('num_dau ASC LIMIT');              // départage stable conservé en dernier
    expect((texte.match(/NULLS LAST/g) ?? []).length).toBe(2); // date ASC + surface DESC
    expect(texte).not.toContain(ORDRE_HISTORIQUE);             // ce n'est pas l'ordre historique
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

  it('filtre « sans destinataire » (S15, PRADA-aware) : aucune adresse e-mail nulle part (contact NI PRADA), plus le canal', () => {
    const t = construireRequeteTotal({ ...FILTRES_VIDES, sansDestinataire: true }, C).texte;
    expect(t).toContain("coalesce(btrim(mc.email), '') = ''");   // pas d'e-mail de contact
    expect(t).toContain("coalesce(btrim(mp.courriel), '') = ''"); // ET pas de courriel PRADA (sinon la commune est joignable)
    expect(t).not.toContain("mc.canal = 'inconnu'");             // l'ancien critère faux est retiré
    expect(construireRequeteTotal({ ...FILTRES_VIDES, sansDestinataire: false }, C).texte).not.toContain('mp.courriel');
  });

  it('la requête joint le registre mairie (LEFT JOIN, orphelin/sans contact non exclus)', () => {
    expect(construireRequeteListe(FILTRES_VIDES, C, 1, 25).texte).toContain('LEFT JOIN mairie_contact mc');
  });

  it('multi-communes (S6) : 0 → aucune clause ; 1 et N → ANY(array) + expansion des fusions', () => {
    expect(construireRequeteTotal({ ...FILTRES_VIDES, communes: [] }, C).texte).not.toContain('code_insee = ANY');

    const un = construireRequeteTotal({ ...FILTRES_VIDES, communes: ['93066'] }, C);
    expect(un.texte).toContain('d.code_insee = ANY');
    expect(un.texte).toContain('commune_fusion'); // sélectionner Saint-Denis (93066) inclut ses anciens codes (93059)
    expect(un.params).toContainEqual(['93066']);  // un SEUL param tableau

    const n = construireRequeteTotal({ ...FILTRES_VIDES, communes: ['92050', '93066'] }, C);
    expect(n.params).toContainEqual(['92050', '93066']);
  });

  it('anti-doublon (S6) : filtre = WHERE sur d.code_insee (jamais un JOIN) → une ligne ne peut pas être doublée', () => {
    const { texte } = construireRequeteTotal({ ...FILTRES_VIDES, communes: ['93066', '93059'] }, C);
    // `d.code_insee = ANY(...)` OU `IN (SELECT ancien_code ...)` : un dossier a UN code → matché au plus une fois.
    expect(texte).toContain('d.code_insee = ANY');
    expect(texte).toContain('d.code_insee IN (SELECT ancien_code FROM commune_fusion');
  });

  it('multi-communes combiné avec un autre filtre (département)', () => {
    const { texte, params } = construireRequeteTotal({ ...FILTRES_VIDES, departement: '93', communes: ['93066'] }, C);
    expect(texte).toContain('d.departement =');
    expect(texte).toContain('d.code_insee = ANY');
    expect(params).toEqual(expect.arrayContaining(['93', ['93066']]));
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

  it('lireFiltres : `communes` répété et/ou séparé par virgules → codes 5 chiffres dédupliqués', () => {
    const sp = new URLSearchParams('communes=92050&communes=93066,78551&communes=92050&communes=abc');
    expect(lireFiltres(sp).communes.sort()).toEqual(['78551', '92050', '93066']); // dédup + 'abc' ignoré
    expect(lireFiltres(new URLSearchParams('')).communes).toEqual([]); // 0 commune
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

describe('Sitadel S12 — libelleEtat (traduction + non renseigné, jamais un tiret muet)', () => {
  it('traduit les codes connus, garde l’inattendu, dit « non renseigné » pour null/vide', () => {
    expect(libelleEtat('2')).toBe('Autorisé');
    expect(libelleEtat('4')).toBe('Annulé');
    expect(libelleEtat('5')).toBe('Commencé');
    expect(libelleEtat('6')).toBe('Terminé');
    expect(libelleEtat('32')).toBe('état 32'); // inattendu → tel quel
    expect(libelleEtat(null)).toBe('non renseigné');
    expect(libelleEtat('')).toBe('non renseigné');
  });

  it('le filtre etat lit ?etat= et n’accepte que les codes connus', () => {
    expect(lireFiltres(new URLSearchParams('etat=4')).etatDau).toBe('4');
    expect(lireFiltres(new URLSearchParams('etat=99')).etatDau).toBeNull();
    expect(lireFiltres(new URLSearchParams('')).etatDau).toBeNull();
  });
});

describe('S12b-fix — compteursEtat : contrat route↔vue (toujours 3 clés, 0 par défaut)', () => {
  it('base VIDE (aucune ligne remontée) → les 3 clés présentes et = 0, jamais undefined', () => {
    const c = compteursEtatDepuisRow(undefined);
    expect(c).toEqual({ annules: 0, absents: 0, ambigus: 0 });
    // la vue appelle .toLocaleString sans condition → aucune valeur ne doit être undefined
    for (const v of Object.values(c)) expect(typeof v).toBe('number');
  });

  it('sans AUCUN dossier ambigu → la clé « ambigus » existe et vaut 0 (le cas qui plantait)', () => {
    expect(compteursEtatDepuisRow({ annules: 5, absents: 3, ambigus: 0 }).ambigus).toBe(0);
  });

  it('clé manquante ou nulle (forme de réponse plus ancienne) → 0, pas de fuite d’undefined', () => {
    expect(compteursEtatDepuisRow({ annules: 5, absents: 3 })).toEqual({ annules: 5, absents: 3, ambigus: 0 });
    expect(compteursEtatDepuisRow({ annules: null, absents: null, ambigus: null })).toEqual({ annules: 0, absents: 0, ambigus: 0 });
  });
});

// ── D1 : état de rattachement (donnée d'affichage, jamais un critère de sélection) ───────────────────
describe('D1 — expressionRattachementSql : trois états + priorité STRICTE (rattaché > abandonné > jamais)', () => {
  const e = expressionRattachementSql();
  it('les trois valeurs sont produites', () => {
    expect(e).toContain("'rattache'");
    expect(e).toContain("'abandonne'");
    expect(e).toContain("'jamais'");
  });
  it('la branche ACTIVE est testée EN PREMIER → un dossier avec lignes inactives ET une active est « rattaché »', () => {
    const iActive = e.indexOf('AND dd.actif'); // 1re branche : EXISTS ligne active → 'rattache'
    const iRattache = e.indexOf("'rattache'");
    const iAny = e.indexOf('WHERE dd.dossier_id = d.id) THEN'); // 2e branche : EXISTS ligne quelconque → 'abandonne'
    const iAbandonne = e.indexOf("'abandonne'");
    expect(iActive).toBeGreaterThan(-1);
    expect(iActive).toBeLessThan(iAny);          // actif testé avant « n'importe quelle ligne »
    expect(iRattache).toBeLessThan(iAbandonne);  // 'rattache' court-circuite avant 'abandonne'
  });
});

describe('D1 — construireRequeteListe : jointure de rattachement OPT-IN (byte-identique par défaut)', () => {
  it('SANS opt-in (chemin CANDIDATS) → AUCUN fragment de rattachement, ordre historique conservé', () => {
    const { texte } = construireRequeteListe(FILTRES_VIDES, C, 1, 25);
    expect(texte).not.toContain('demande_dossier');
    expect(texte).not.toContain('etat_rattachement');
    expect(texte).not.toContain('LEFT JOIN LATERAL');
    expect(texte).toContain('num_dau ASC LIMIT'); // structure historique intacte
  });
  it('AVEC opt-in (chemin AFFICHAGE) → colonnes + latérale de rattachement ajoutées', () => {
    const { texte } = construireRequeteListe(FILTRES_VIDES, C, 1, 25, { avecRattachement: true });
    expect(texte).toContain('etat_rattachement');
    expect(texte).toContain('rat.reference AS demande_reference');
    expect(texte).toContain('rat.statut AS demande_statut');
    expect(texte).toContain('LEFT JOIN LATERAL');
    expect(texte).toContain('WHERE dd.dossier_id = d.id AND dd.actif'); // latérale = demande ACTIVE seulement
  });
});

describe('D1 — filtre par rattachement (affichage) + compteurs sur l’ensemble filtré', () => {
  it('le filtre rattachement pousse l’expression + LIE la valeur (n’affiche qu’une catégorie)', () => {
    const { texte, params } = construireRequeteTotal({ ...FILTRES_VIDES, rattachement: 'rattache' }, C);
    const norm = texte.replace(/\s+/g, ' ');
    expect(norm).toContain('CASE WHEN EXISTS'); // l'expression de rattachement est dans le WHERE
    expect(params).toContain('rattache');       // valeur LIÉE (jamais interpolée)
  });
  it('sans filtre rattachement → aucune clause de rattachement (invariant candidats)', () => {
    expect(construireRequeteTotal(FILTRES_VIDES, C).params).not.toContain('rattache');
  });
  it('compteurs par rattachement : GROUP BY etat_rattachement, IGNORE le filtre rattachement (toujours 3), garde les autres', () => {
    const { texte, params } = construireRequeteComptesRattachement({ ...FILTRES_VIDES, rattachement: 'jamais', departement: '92' }, C);
    const norm = texte.replace(/\s+/g, ' ');
    expect(norm).toContain('GROUP BY etat_rattachement');
    expect(norm).toContain('departement =');   // le filtre département reste
    expect(params).not.toContain('jamais');     // le filtre rattachement est neutralisé (on veut les 3 décomptes)
  });
});

describe('D1 — lireFiltres : paramètre rattachement (liste fermée)', () => {
  it('valeur connue → retenue ; inconnue/absente → null', () => {
    expect(lireFiltres(new URLSearchParams('rattachement=rattache')).rattachement).toBe('rattache');
    expect(lireFiltres(new URLSearchParams('rattachement=abandonne')).rattachement).toBe('abandonne');
    expect(lireFiltres(new URLSearchParams('rattachement=nimporte')).rattachement).toBeNull();
    expect(lireFiltres(new URLSearchParams('')).rattachement).toBeNull();
  });
});
