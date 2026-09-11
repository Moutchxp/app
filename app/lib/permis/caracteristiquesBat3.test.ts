import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * BAT-3 — primitives de dépôt du RETRAIT NON DESTRUCTIF : `retirerCorps` (soft, JAMAIS de DELETE), `reactiverCorps` (réversible, valeurs
 * intactes), `lireCartesPourPlan` (cartes ACTIVES + « vide »), `lireCorpsRetires` (réactivation), `journalBatiments` (trace inerte,
 * best-effort) et la RÉSILIENCE des lecteurs à l'absence de la colonne `actif` (migration 219 non appliquée → aucun filtre, aucun crash).
 * `db/client` mocké (routé par fragment SQL) → aucune I/O ; la colonne `actif` peut être « absente » à volonté (state.colonneActif).
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    colonneActif: true,                 // migration 219 appliquée ? (pilote la sonde information_schema)
    cartesPlan: [] as Record<string, unknown>[],   // lignes rendues par lireCartesPourPlan
    cartesRetires: [] as Record<string, unknown>[], // lignes rendues par lireCorpsRetires
    emprisesCorps: [] as number[],      // corps_id ayant une emprise reconstruite
    comptes: [] as Record<string, unknown>[],       // lignes de lireCaracteristiquesComptesParDossier
    retirerRowCount: 1, reactiverRowCount: 1,
    journalLeve: false,                 // journalBatiments : simuler une table 104 absente (INSERT qui lève)
  };
  const queryMock = async (sql: string, params: unknown[] = []) => {
    appels.push({ sql, params: params ?? [] });
    if (/information_schema\.columns/i.test(sql) && /'actif'/i.test(sql)) return { rows: state.colonneActif ? [{ ok: 1 }] : [] };
    if (/UPDATE\s+permis_corps_batiment\s+SET\s+actif\s*=\s*false/i.test(sql)) return { rows: [], rowCount: state.retirerRowCount };
    if (/UPDATE\s+permis_corps_batiment\s+SET\s+actif\s*=\s*true/i.test(sql)) return { rows: [], rowCount: state.reactiverRowCount };
    if (/FROM\s+permis_emprise_reconstruite\s+WHERE\s+corps_id\s*=\s*ANY/i.test(sql)) return { rows: state.emprisesCorps.map((id) => ({ id })) };
    if (/NOT\s+cb\.actif/i.test(sql)) return { rows: state.cartesRetires };           // lireCorpsRetires
    if (/sans_valeur/i.test(sql)) return { rows: state.cartesPlan };                   // lireCartesPourPlan
    if (/nb_cartes/i.test(sql)) return { rows: state.comptes };                        // lireCaracteristiquesComptesParDossier
    if (/nb_batiments_valide\s+AS\s+n/i.test(sql)) return { rows: [] };
    if (/INSERT\s+INTO\s+permis_extraction_journal/i.test(sql)) { if (state.journalLeve) throw new Error('42P01 table absente'); return { rows: [] }; }
    return { rows: [] };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { _resetCacheCorpsActif } from './corpsActif';
import { retirerCorps, reactiverCorps, lireCartesPourPlan, lireCorpsRetires, journalBatiments, lireCaracteristiquesComptesParDossier } from './caracteristiquesRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ');
const trouver = (re: RegExp) => H.appels.find((a) => re.test(a.sql));
beforeEach(() => {
  H.appels.length = 0; _resetCacheCorpsActif();
  H.state.colonneActif = true; H.state.cartesPlan = []; H.state.cartesRetires = []; H.state.emprisesCorps = [];
  H.state.comptes = []; H.state.retirerRowCount = 1; H.state.reactiverRowCount = 1; H.state.journalLeve = false;
});

describe('BAT-3 — retirerCorps (retrait SOFT, JAMAIS de DELETE)', () => {
  it('émet un UPDATE actif=false + trace desactive_le/_par (qui/quand), gardé « AND actif » ; AUCUN DELETE', async () => {
    const ok = await retirerCorps(7, 'admin');
    expect(ok).toBe(true);
    const up = trouver(/UPDATE\s+permis_corps_batiment\s+SET\s+actif\s*=\s*false/i)!;
    const s = norm(up.sql);
    expect(s).toContain('desactive_le = now()');
    expect(s).toContain('desactive_par = $2');
    expect(s).toContain('WHERE id = $1 AND actif'); // idempotent : ne re-retire pas une carte déjà retirée
    expect(up.params).toEqual([7, 'admin']);
    expect(trouver(/DELETE\s+FROM\s+permis_corps_batiment/i)).toBeUndefined(); // 🔴 jamais destructif
  });
  it('renvoie false si aucune ligne modifiée (inconnue ou déjà retirée)', async () => {
    H.state.retirerRowCount = 0;
    expect(await retirerCorps(999, 'admin')).toBe(false);
  });
});

describe('BAT-3 — reactiverCorps (réversible, valeurs intactes)', () => {
  it('émet un UPDATE actif=true + efface la trace de retrait, sans toucher AUCUNE valeur (altitude/emprise/repère préservés)', async () => {
    const ok = await reactiverCorps(7, 'admin');
    expect(ok).toBe(true);
    const up = trouver(/UPDATE\s+permis_corps_batiment\s+SET\s+actif\s*=\s*true/i)!;
    const s = norm(up.sql);
    expect(s).toContain('desactive_le = NULL');
    expect(s).toContain('desactive_par = NULL');
    expect(s).toContain('WHERE id = $1 AND NOT actif');
    // aucune colonne de valeur touchée → la carte revient telle quelle
    expect(s).not.toContain('altitude_sommet_ngf');
    expect(s).not.toContain('emprise');
    expect(up.params).toEqual([7, 'admin']);
  });
});

describe('BAT-3 — lireCartesPourPlan (cartes ACTIVES + « vide »)', () => {
  it('filtre « AND cb.actif » (219 présente) ; « vide » = sans valeur ET sans emprise reconstruite', async () => {
    H.state.cartesPlan = [
      { id: 1, repere: 'A1', nom_repli: null, validee_altitude: true, sans_valeur: false },
      { id: 2, repere: null, nom_repli: 'BP2', validee_altitude: false, sans_valeur: true },  // vide
      { id: 3, repere: null, nom_repli: 'BP3', validee_altitude: false, sans_valeur: true },  // sans valeur MAIS a une emprise reconstruite → NON vide
    ];
    H.state.emprisesCorps = [3];
    const cartes = await lireCartesPourPlan(42);
    expect(norm(trouver(/sans_valeur/i)!.sql)).toContain('AND cb.actif');
    expect(cartes.find((c) => c.id === 1)).toMatchObject({ nom: 'A1', valideeAltitude: true, vide: false });
    expect(cartes.find((c) => c.id === 2)!.vide).toBe(true);
    expect(cartes.find((c) => c.id === 3)!.vide).toBe(false); // emprise reconstruite → protégée
  });
});

describe('BAT-3 — lireCorpsRetires (réactivation) + résilience 219 absente', () => {
  it('219 non appliquée → [] (aucune carte ne peut être retirée), AUCUNE requête de lecture des retirées', async () => {
    H.state.colonneActif = false;
    expect(await lireCorpsRetires(42)).toEqual([]);
    expect(trouver(/NOT\s+cb\.actif/i)).toBeUndefined();
  });
  it('219 appliquée → cartes retirées mappées (nom, altitude validée conservée)', async () => {
    H.state.cartesRetires = [{ id: 5, repere: 'B2', nom_repli: null, validee_altitude: true, desactive_le: '2026-09-11T10:00:00Z', desactive_par_nom: 'Jean Test' }];
    const r = await lireCorpsRetires(42);
    expect(r).toEqual([{ id: 5, nom: 'B2', valideeAltitude: true, desactiveLe: '2026-09-11T10:00:00Z', desactiveParNom: 'Jean Test' }]);
  });
});

describe('BAT-3 — lireCaracteristiquesComptesParDossier : filtre les retirées, résilient si 219 absente', () => {
  it('219 présente → « AND actif » dans le compte des cartes', async () => {
    H.state.comptes = [{ dossier_id: 1, nb_cartes: 2, nb_sans_alt: 1 }];
    await lireCaracteristiquesComptesParDossier([1]);
    expect(norm(trouver(/nb_cartes/i)!.sql)).toContain('ANY($1::int[]) AND actif');
  });
  it('219 ABSENTE → aucun filtre « actif », aucun crash (comportement d’avant)', async () => {
    H.state.colonneActif = false; H.state.comptes = [{ dossier_id: 1, nb_cartes: 3, nb_sans_alt: 0 }];
    const m = await lireCaracteristiquesComptesParDossier([1]);
    const s = norm(trouver(/nb_cartes/i)!.sql);
    expect(s).not.toContain('actif'); // aucun filtre → pas de 42703
    expect(m.get(1)?.nbCartes).toBe(3);
  });
});

describe('BAT-3 — journalBatiments (trace INERTE, best-effort)', () => {
  it('insère une ligne role=candidat / methode=motifs (inerte pour les lecteurs du journal), avec corps_id + récit', async () => {
    await journalBatiments(42, 5, 'corps_actif', null, 'Bâtiment « B2 » retiré · par admin');
    const ins = trouver(/INSERT\s+INTO\s+permis_extraction_journal/i)!;
    const s = norm(ins.sql);
    expect(s).toContain("'candidat'"); // exclu de lireJournalChamps / proprietairesRetenue (role retenue/ecartee)
    expect(s).toContain("'motifs'");
    expect(s).not.toContain('origine'); // origine NULL → exclu de lireOrigineExtractionSansIa
    expect(ins.params).toEqual([42, 5, 'corps_actif', null, 'Bâtiment « B2 » retiré · par admin']);
  });
  it('table 104 absente (INSERT lève) → NE FAIT JAMAIS échouer l’opération (best-effort)', async () => {
    H.state.journalLeve = true;
    await expect(journalBatiments(42, null, 'nb_batiments_valide', 3, 'Nombre : 5 → 3')).resolves.toBeUndefined();
  });
});
