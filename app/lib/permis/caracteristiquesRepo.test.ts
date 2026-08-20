import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N3-B — dépôt des caractéristiques physiques. On éprouve : (1) l'INVARIANT central `repartirEcriture` (pur, les deux sens) ;
 * (2) son application par `ecrireCorps`/`ecrireGlobal` (auto n'écrase pas 'saisie' → champ IGNORÉ ; main écrase même 'extraite') ;
 * (3) valeur + origine posées ENSEMBLE (null ⇒ origine null) ; (4) lecture multi-corps ordre stable + NULL distinct de 0.
 * `db/client` est mocké (routé par fragment SQL) → aucune I/O réelle, la table n'a pas besoin d'exister.
 *
 * Les propriétés de SCHÉMA (CHECK de plage refusant le hors-bornes, cascade ON DELETE) sont vérifiées par le BLOC DE CONTRÔLE
 * de la migration 103 (négatifs « doivent échouer »), pas ici : elles ne sont pas testables sans la table appliquée.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    originesCorps: {} as Record<string, unknown>,   // ligne renvoyée par le SELECT des colonnes _origine d'un corps
    originesGlobal: {} as Record<string, unknown>,  // idem pour les colonnes déclarées de permis_caracteristique (N7-D)
    parkingOrigine: null as string | null,           // parking_origine actuel (global)
    parkingRowExiste: false,                         // la ligne permis_caracteristique existe-t-elle ?
    destinationsOrigine: null as string | null,      // N13 : destinations_origine actuel
    lecture: { global: null as unknown, corps: [] as unknown[] },
    insertId: 77,
    deleteCount: 1,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/json_agg/i.test(sql)) return { rows: [state.lecture] };                                   // lecture globale
    if (/SELECT\s+parking_origine\b/i.test(sql)) return { rows: state.parkingRowExiste ? [{ o: state.parkingOrigine }] : [] };
    if (/SELECT\s+destinations_origine\b/i.test(sql)) return { rows: [{ o: state.destinationsOrigine }] }; // N13
    if (/INSERT\s+INTO\s+permis_caracteristique\b[\s\S]*destinations\b/i.test(sql)) return { rows: [] };   // N13 upsert tableau
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [state.originesCorps] };
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_caracteristique/i.test(sql)) return { rows: [state.originesGlobal] };
    if (/INSERT\s+INTO\s+permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.insertId }] };
    if (/DELETE\s+FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [], rowCount: state.deleteCount };
    return { rows: [] };                                                                            // UPDATE / upsert : ignorés du routage
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { repartirEcriture, ecrireCorps, ecrireGlobal, ecrireCaracteristiquesGlobales, ecrireDestinations, lirePermisCaracteristiques, creerCorps, supprimerCorps, definirRepere, validerSommetCorps } from './caracteristiquesRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ');
const trouver = (re: RegExp) => H.appels.find((a) => re.test(a.sql));
beforeEach(() => {
  H.appels.length = 0;
  H.state.originesCorps = {}; H.state.originesGlobal = {}; H.state.parkingOrigine = null; H.state.parkingRowExiste = false;
  H.state.lecture = { global: null, corps: [] }; H.state.insertId = 77; H.state.deleteCount = 1; H.state.destinationsOrigine = null;
});

describe('N13 — ecrireDestinations (tableau text[], invariant réutilisé)', () => {
  it('mode saisie → upsert du tableau + origine ensemble ; le string[] est passé LIÉ', async () => {
    const r = await ecrireDestinations(1, ['Bureau', 'Restauration'], 'saisie', 'admin');
    expect(r).toEqual({ ecrit: true, ignore: false });
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique[\s\S]*destinations/i)!;
    expect(up.params[1]).toEqual(['Bureau', 'Restauration']); // tableau lié tel quel (pg sérialise en text[])
    expect(up.params[2]).toBe('saisie');                       // valeur + origine ensemble
  });
  it('tableau vide → NULL + origine NULL (jamais un tableau vide stocké)', async () => {
    await ecrireDestinations(1, [], 'saisie', 'admin');
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique[\s\S]*destinations/i)!;
    expect(up.params[1]).toBeNull(); expect(up.params[2]).toBeNull();
  });
  it('AUTOMATIQUE sur des destinations déjà « saisie » → IGNORÉ, aucun upsert (la main l’emporte)', async () => {
    H.state.destinationsOrigine = 'saisie';
    const r = await ecrireDestinations(1, ['Bureau'], 'extraite', 'auto');
    expect(r).toEqual({ ecrit: false, ignore: true });
    expect(trouver(/INSERT\s+INTO\s+permis_caracteristique[\s\S]*destinations/i)).toBeUndefined();
  });
});

describe('N7-D — ecrireCaracteristiquesGlobales (colonnes déclarées 106, invariant réutilisé)', () => {
  it('écrit valeur + origine ENSEMBLE (mode extraite) via un upsert', async () => {
    const r = await ecrireCaracteristiquesGlobales(1, { surfacePlancherM2: 13032, natureProjet: 'mixte' }, 'extraite', 'auto');
    expect(r.ecrits.sort()).toEqual(['natureProjet', 'surfacePlancherM2']);
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique/);
    expect(up).toBeDefined();
    expect(up!.params).toContain(13032);
    expect(up!.params).toContain('mixte');
    expect(norm(up!.sql)).toContain('surface_plancher_m2_origine');
    expect(norm(up!.sql)).toContain('ON CONFLICT (dossier_id)');
  });

  it('AUTOMATIQUE sur un champ déjà « saisie » → IGNORÉ, aucun upsert', async () => {
    H.state.originesGlobal = { surfacePlancherM2: 'saisie' };
    const r = await ecrireCaracteristiquesGlobales(1, { surfacePlancherM2: 999 }, 'extraite', 'auto');
    expect(r).toEqual({ ecrits: [], ignores: ['surfacePlancherM2'] });
    expect(trouver(/INSERT\s+INTO\s+permis_caracteristique/)).toBeUndefined();
  });

  it('valeur null → origine null (posées ensemble)', async () => {
    const r = await ecrireCaracteristiquesGlobales(1, { adresseTerrain: null }, 'extraite', 'auto');
    expect(r.ecrits).toEqual(['adresseTerrain']);
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique/)!;
    // dossier_id=1, adresse_terrain=null, adresse_terrain_origine=null, maj_par='auto'
    expect(up.params).toEqual([1, null, null, 'auto']);
  });

  it('N8-C — altitude_sommet_ngf du permis : saisie manuelle écrite ; puis AUTOMATIQUE ne l’écrase pas (invariant)', async () => {
    // (b) le POST écrit le sommet permis en 'saisie'
    const r1 = await ecrireCaracteristiquesGlobales(1, { altitudeSommetNgf: 91.2 }, 'saisie', 'admin');
    expect(r1.ecrits).toEqual(['altitudeSommetNgf']);
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique/)!;
    expect(up.params).toContain(91.2);
    expect(norm(up!.sql)).toContain('altitude_sommet_ngf_origine');
    // une écriture AUTOMATIQUE ultérieure (ex. N8-B) laisse la saisie intacte → champ IGNORÉ, aucun upsert
    H.appels.length = 0; H.state.originesGlobal = { altitudeSommetNgf: 'saisie' };
    const r2 = await ecrireCaracteristiquesGlobales(1, { altitudeSommetNgf: 89.46 }, 'extraite', 'auto');
    expect(r2).toEqual({ ecrits: [], ignores: ['altitudeSommetNgf'] });
    expect(trouver(/INSERT\s+INTO\s+permis_caracteristique/)).toBeUndefined();
  });
});

describe('N3-B — repartirEcriture (invariant PUR, les deux sens)', () => {
  it('saisie → écrit TOUT (la main écrase, y compris une valeur extraite)', () => {
    expect(repartirEcriture('saisie', ['nbEtages', 'altitudeSommetNgf'], { nbEtages: 'extraite', altitudeSommetNgf: 'saisie' }))
      .toEqual({ ecrits: ['nbEtages', 'altitudeSommetNgf'], ignores: [] });
  });
  it('extraite → écarte les champs déjà « saisie », écrit les autres', () => {
    expect(repartirEcriture('extraite', ['nbEtages', 'altitudeSommetNgf'], { nbEtages: 'saisie', altitudeSommetNgf: 'extraite' }))
      .toEqual({ ecrits: ['altitudeSommetNgf'], ignores: ['nbEtages'] });
  });
  it('extraite sur un champ vierge (origine null) → écrit', () => {
    expect(repartirEcriture('extraite', ['nbEtages'], {})).toEqual({ ecrits: ['nbEtages'], ignores: [] });
  });
  // N10-C — ④ : une valeur CONFIRMÉE est protégée d'un recompute EXACTEMENT comme une saisie. Retirer `confirmes` casse ce test.
  it('extraite → écarte aussi un champ CONFIRMÉ (même origine extraite) ; sans le set confirmes il serait réécrit', () => {
    expect(repartirEcriture('extraite', ['altitudeSommetNgf'], { altitudeSommetNgf: 'extraite' }, new Set(['altitudeSommetNgf'])))
      .toEqual({ ecrits: [], ignores: ['altitudeSommetNgf'] });
    // preuve que la garde `confirmes` EST la cause : sans elle, la même valeur extraite serait écrite.
    expect(repartirEcriture('extraite', ['altitudeSommetNgf'], { altitudeSommetNgf: 'extraite' }))
      .toEqual({ ecrits: ['altitudeSommetNgf'], ignores: [] });
  });
});

describe('N3-B — ecrireCorps : invariant appliqué', () => {
  it('AUTOMATIQUE sur un champ « saisie » → valeur INCHANGÉE (aucun UPDATE) + champ listé « ignoré »', async () => {
    H.state.originesCorps = { nbEtages: 'saisie' };
    const r = await ecrireCorps(1, { nbEtages: 9 }, 'extraite', 'bot');
    expect(r).toEqual({ ecrits: [], ignores: ['nbEtages'] });
    expect(trouver(/UPDATE\s+permis_corps_batiment/i)).toBeUndefined(); // rien écrit
  });

  it('À LA MAIN sur un champ « extraite » → valeur ÉCRASÉE ; valeur ET origine posées ensemble', async () => {
    H.state.originesCorps = { nbEtages: 'extraite' };
    const r = await ecrireCorps(1, { nbEtages: 9 }, 'saisie', 'admin');
    expect(r).toEqual({ ecrits: ['nbEtages'], ignores: [] });
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('nb_etages = $');
    expect(norm(up.sql)).toContain('nb_etages_origine = $');
    expect(up.params).toContain(9);
    expect(up.params).toContain('saisie');
  });

  it('AUTOMATIQUE mixte → écrit le champ vierge, IGNORE le champ « saisie »', async () => {
    H.state.originesCorps = { nbEtages: 'saisie', altitudeSommetNgf: 'extraite' };
    const r = await ecrireCorps(1, { nbEtages: 3, altitudeSommetNgf: 30 }, 'extraite', 'bot');
    expect(r).toEqual({ ecrits: ['altitudeSommetNgf'], ignores: ['nbEtages'] });
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('altitude_sommet_ngf = $');
    expect(norm(up.sql)).not.toContain('nb_etages ='); // le champ protégé n'est pas touché
    expect(up.params).toContain(30);
  });

  it('valeur NULL ⇒ origine NULL (jamais l’une sans l’autre)', async () => {
    const r = await ecrireCorps(1, { nbEtages: null }, 'saisie', 'admin');
    expect(r.ecrits).toEqual(['nbEtages']);
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('nb_etages = $');
    expect(norm(up.sql)).toContain('nb_etages_origine = $');
    expect(up.params).toContain(null);                 // valeur ET origine à null
    expect(up.params).not.toContain('saisie');         // pas d'origine posée sans valeur
  });

  it('emprise : WKT → ST_GeomFromText(…, 2154) ; null → « emprise = NULL »', async () => {
    await ecrireCorps(1, { emprise: 'POLYGON((0 0,0 1,1 1,1 0,0 0))' }, 'saisie', 'admin');
    let up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('emprise = ST_GeomFromText($');
    expect(norm(up.sql)).toContain('2154');
    expect(up.params).toContain('POLYGON((0 0,0 1,1 1,1 0,0 0))');
    H.appels.length = 0;
    await ecrireCorps(1, { emprise: null }, 'saisie', 'admin');
    up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('emprise = NULL');
  });
});

describe('N10-C/D — invariant confirmé + geste « Valider cette hauteur »', () => {
  it('④/⑤ AUTOMATIQUE sur un sommet DÉCIDÉ (confirme_le posé) → INCHANGÉ, aucun UPDATE (recompute n’efface pas une décision humaine)', async () => {
    H.state.originesCorps = { altitudeSommetNgf: 'extraite', __sommetConfirme: true }; // le SELECT rend le drapeau de validation
    const r = await ecrireCorps(1, { altitudeSommetNgf: 42 }, 'extraite', 'bot');
    expect(r).toEqual({ ecrits: [], ignores: ['altitudeSommetNgf'] });
    expect(trouver(/UPDATE\s+permis_corps_batiment/i)).toBeUndefined();
  });

  it('⑥ « Enregistrer ce bâtiment » (sans le sommet dans le lot) ne touche JAMAIS la colonne du sommet', async () => {
    await ecrireCorps(1, { nbEtages: 5 }, 'saisie', 'admin'); // le sommet est EXCLU par l'appelant
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('nb_etages = $');
    expect(norm(up.sql)).not.toContain('altitude_sommet_ngf'); // ni valeur, ni origine, ni marqueur
  });

  it('⑦ validerSommetCorps(valeur) : écrit LA VALEUR fournie en origine « saisie » + trace nominative', async () => {
    await validerSommetCorps(9, 101, 'admin');
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    const s = norm(up.sql);
    expect(s).toContain('altitude_sommet_ngf = $');                  // écrit LA VALEUR du champ
    expect(s).toContain("altitude_sommet_ngf_origine = 'saisie'");    // décision humaine
    expect(s).toContain('altitude_sommet_ngf_confirme_le = now()');   // trace : quand
    expect(s).toContain('altitude_sommet_ngf_confirme_par = $');      // trace : qui
    expect(up.params).toContain(101);
    expect(up.params).toContain('admin');
  });

  it('validerSommetCorps(null) : champ vidé → efface valeur, origine ET marqueur (ensemble)', async () => {
    await validerSommetCorps(9, null, 'admin');
    const s = norm(trouver(/UPDATE\s+permis_corps_batiment/i)!.sql);
    expect(s).toContain('altitude_sommet_ngf = NULL');
    expect(s).toContain('altitude_sommet_ngf_origine = NULL');
    expect(s).toContain('altitude_sommet_ngf_confirme_le = NULL');
  });
});

describe('N3-B — ecrireGlobal : parking suit l’invariant ; commentaire sans origine', () => {
  it('AUTOMATIQUE sur un parking déjà « saisie » → ignoré, aucun upsert', async () => {
    H.state.parkingRowExiste = true; H.state.parkingOrigine = 'saisie';
    const r = await ecrireGlobal(1, { parking: true }, 'extraite', 'bot');
    expect(r).toEqual({ ecrits: [], ignores: ['parking'] });
    expect(trouver(/INSERT\s+INTO\s+permis_caracteristique/i)).toBeUndefined();
  });
  it('À LA MAIN → upsert parking (valeur+origine) + commentaire', async () => {
    const r = await ecrireGlobal(1, { parking: false, commentaire: 'RAS' }, 'saisie', 'admin');
    expect(r.ecrits).toEqual(['parking', 'commentaire']);
    const up = trouver(/INSERT\s+INTO\s+permis_caracteristique/i)!;
    expect(norm(up.sql)).toContain('parking');
    expect(norm(up.sql)).toContain('parking_origine');
    expect(up.params).toContain(false);
    expect(up.params).toContain('saisie');
    expect(up.params).toContain('RAS');
  });
});

describe('N3-B — lecture : plusieurs corps ordre stable + NULL distinct de 0', () => {
  it('rend tous les corps dans l’ordre (ORDER BY id) et distingue NULL de 0', async () => {
    H.state.lecture = {
      global: { parking: null, parkingOrigine: null, commentaire: null, majLe: null, majPar: null },
      corps: [
        { id: 1, repere: 'A1', nbEtages: null, nbEtagesOrigine: null, altitudeSommetNgf: null, empriseWkt: null },
        { id: 2, repere: 'A2', nbEtages: 0, nbEtagesOrigine: 'saisie', altitudeSommetNgf: 0, empriseWkt: null },
      ],
    };
    const res = await lirePermisCaracteristiques(42);
    expect(res.corps.map((c) => c.id)).toEqual([1, 2]);       // ordre stable
    expect(res.corps[0].nbEtages).toBeNull();                 // NULL = non renseigné
    expect(res.corps[1].nbEtages).toBe(0);                    // 0 = renseigné à zéro (distinct)
    expect(res.corps[0].altitudeSommetNgf).toBeNull();
    expect(res.corps[1].altitudeSommetNgf).toBe(0);
    const sel = trouver(/json_agg/i)!;
    expect(norm(sel.sql)).toContain('ORDER BY id');
  });
  it('permis sans caractéristiques → global null, corps []', async () => {
    H.state.lecture = { global: null, corps: [] };
    expect(await lirePermisCaracteristiques(999)).toEqual({ global: null, corps: [] });
  });
});

describe('N3-B — creerCorps / supprimerCorps', () => {
  it('creerCorps → renvoie l’id, params (dossierId, repere, majPar)', async () => {
    const id = await creerCorps(42, 'A1', 'admin');
    expect(id).toBe(77);
    const ins = trouver(/INSERT\s+INTO\s+permis_corps_batiment/i)!;
    expect(ins.params).toEqual([42, 'A1', 'admin']);
  });
  it('supprimerCorps → true si une ligne supprimée, false sinon', async () => {
    expect(await supprimerCorps(5)).toBe(true);
    H.state.deleteCount = 0;
    expect(await supprimerCorps(999)).toBe(false);
  });
  it('definirRepere → UPDATE repere (sans origine) ; null = anonyme', async () => {
    await definirRepere(5, 'A1', 'admin');
    let up = trouver(/UPDATE\s+permis_corps_batiment\s+SET\s+repere/i)!;
    expect(up.params).toEqual([5, 'A1', 'admin']);
    H.appels.length = 0;
    await definirRepere(5, null, 'admin');
    up = trouver(/UPDATE\s+permis_corps_batiment\s+SET\s+repere/i)!;
    expect(up.params).toEqual([5, null, 'admin']);
  });
});

describe('N10-E — hauteur maximale PLU : champ de corps ordinaire (invariant réutilisé)', () => {
  it('AUTOMATIQUE sur un champ vierge → écrit valeur + origine ensemble', async () => {
    const r = await ecrireCorps(1, { hauteurMaxPluNgf: 101 }, 'saisie', 'admin');
    expect(r.ecrits).toContain('hauteurMaxPluNgf');
    const up = trouver(/UPDATE\s+permis_corps_batiment/i)!;
    expect(norm(up.sql)).toContain('hauteur_max_plu_ngf = $');
    expect(norm(up.sql)).toContain('hauteur_max_plu_ngf_origine = $');
    expect(up.params).toContain(101);
    expect(up.params).toContain('saisie');
  });

  it('AUTOMATIQUE n’écrase pas une hauteur PLU déjà « saisie » (invariant standard)', async () => {
    H.state.originesCorps = { hauteurMaxPluNgf: 'saisie' };
    const r = await ecrireCorps(1, { hauteurMaxPluNgf: 90 }, 'extraite', 'bot');
    expect(r).toEqual({ ecrits: [], ignores: ['hauteurMaxPluNgf'] });
    expect(trouver(/UPDATE\s+permis_corps_batiment/i)).toBeUndefined();
  });
});
