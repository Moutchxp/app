import { describe, it, expect } from 'vitest';
import {
  type LigneBrute, type Requete, type Dossier,
  dansPerimetre, pcRetenu, pdRetenu, mapLignePC, mapLignePD, fusionnerPC, upserterDossier,
} from './ingest';

/** Ligne PC minimale (logements) surchargée par `over`. */
function lignePC(over: Partial<LigneBrute> = {}): LigneBrute {
  return {
    TYPE_DAU: 'PC', NUM_DAU: 'PC0001', COMM: '75056', DEP_CODE: '75',
    ETAT_DAU: '2', DATE_REELLE_AUTORISATION: '2024-05-10',
    NATURE_PROJET_COMPLETEE: '1', I_EXTENSION: 'false', I_SURELEVATION: 'false',
    NB_LGT_TOT_CREES: '3', SURF_HAB_CREEE: '250', SURF_LOC_CREEE: '0',
    ADR_NUM_TER: '10', ADR_LIBVOIE_TER: 'RUE DE LA PAIX', SEC_CADASTRE1: 'AB', NUM_CADASTRE1: '0012',
    ...over,
  };
}

describe('Sitadel S2 — filtre volumétrique PC', () => {
  it('NATURE 1/3/5 retenues, 2/4/6 écartées (ETAT_DAU=2)', () => {
    for (const n of ['1', '3', '5']) expect(pcRetenu(lignePC({ NATURE_PROJET_COMPLETEE: n }))).toBe(true);
    for (const n of ['2', '4', '6']) expect(pcRetenu(lignePC({ NATURE_PROJET_COMPLETEE: n, I_EXTENSION: 'false', I_SURELEVATION: 'false' }))).toBe(false);
  });

  it('I_EXTENSION et I_SURELEVATION retenues MÊME avec NATURE=2', () => {
    expect(pcRetenu(lignePC({ NATURE_PROJET_COMPLETEE: '2', I_EXTENSION: 'true' }))).toBe(true);
    expect(pcRetenu(lignePC({ NATURE_PROJET_COMPLETEE: '2', I_SURELEVATION: 'true' }))).toBe(true);
  });

  it('non autorisé (ETAT_DAU≠2) écarté même si NATURE=1', () => {
    expect(pcRetenu(lignePC({ ETAT_DAU: '4', NATURE_PROJET_COMPLETEE: '1' }))).toBe(false);
  });

  it('PD retenu ssi ETAT_PD=2', () => {
    expect(pdRetenu({ ETAT_PD: '2', NUM_PD: 'PD1' })).toBe(true);
    expect(pdRetenu({ ETAT_PD: '4', NUM_PD: 'PD1' })).toBe(false);
  });
});

describe('Sitadel S2 — périmètre (filtre au département)', () => {
  const actifs = new Set(['75', '92']);
  it('département actif retenu, hors périmètre ignoré', () => {
    expect(dansPerimetre('75', actifs)).toBe(true);
    expect(dansPerimetre('92', actifs)).toBe(true);
    expect(dansPerimetre('93', actifs)).toBe(false);
    expect(dansPerimetre('78', actifs)).toBe(false);
  });
});

describe('Sitadel S2 — dédoublonnage PC logements × locaux', () => {
  it('fusionne un même NUM_DAU : surfaces MAX, nb_lgt préservé, texte = première valeur non nulle', () => {
    const logements = mapLignePC(lignePC({ SURF_HAB_CREEE: '250', SURF_LOC_CREEE: '0', NB_LGT_TOT_CREES: '3' }));
    // Même permis côté locaux : porte la surface locaux, pas de nb_lgt, adresse absente.
    const locaux = mapLignePC(lignePC({
      SURF_HAB_CREEE: '250', SURF_LOC_CREEE: '400', NB_LGT_TOT_CREES: '', ADR_LIBVOIE_TER: '',
    }));
    const f = fusionnerPC(logements, locaux);
    expect(f.numDau).toBe('PC0001');
    expect(f.surfCreee).toBe(650);           // max(250, 650)
    expect(f.nbLgtTotCrees).toBe(3);         // logements fait foi
    expect(f.adrLibvoieTer).toBe('RUE DE LA PAIX'); // première non nulle (logements)
    expect(f.iExtension).toBe(false);
  });
});

describe('Sitadel S2 — champs BRUTS préservés', () => {
  it('libellé de voie tronqué à 26 c et numéro à suffixe traversent INTACTS', () => {
    const d = mapLignePC(lignePC({
      ADR_LIBVOIE_TER: 'AVENUE DU GENERAL MICHEL B', // 26 c, tronqué par Sitadel
      ADR_NUM_TER: '66A',                            // numéro à suffixe
    }));
    expect(d.adrLibvoieTer).toBe('AVENUE DU GENERAL MICHEL B');
    expect(d.adrNumTer).toBe('66A');
  });

  it('PD : num_dau = NUM_PD, pétitionnaire conservé, champs PC absents', () => {
    const d = mapLignePD({ NUM_PD: 'PD9', COMM: '92050', DEP_CODE: '92', ETAT_PD: '2', DENOM_DEM: 'SCI DEMO', SIREN_DEM: '123456789' });
    expect(d.type).toBe('PD');
    expect(d.numDau).toBe('PD9');
    expect(d.denomDem).toBe('SCI DEMO');
    expect(d.natureProjetCompletee).toBeNull();
    expect(d.nbLgtTotCrees).toBeNull();
  });
});

describe('Sitadel S2 — UPSERT idempotent', () => {
  /** Mock de `q` émulant INSERT ... ON CONFLICT (type,num_dau) DO UPDATE SET vu_le_dernier ... RETURNING (xmax=0). */
  function fauxDepot() {
    const store = new Map<string, { valeurs: unknown[]; vuDernier: string }>();
    const q: Requete = (async (_text: string, params?: unknown[]) => {
      const p = params ?? [];
      const cle = `${p[0]}|${p[1]}`;                 // (type, num_dau)
      const vuDernier = p[28] as string;             // vu_le_dernier_millesime
      if (store.has(cle)) {
        store.get(cle)!.vuDernier = vuDernier;       // seul champ qui avance
        return { rows: [{ est_nouveau: false }] };
      }
      store.set(cle, { valeurs: [...p], vuDernier });
      return { rows: [{ est_nouveau: true }] };
    }) as Requete;
    return { q, store };
  }

  const d: Dossier = mapLignePC(lignePC());

  it('1re passe = nouveau ; 2e passe même millésime = déjà connu, store stable', async () => {
    const { q, store } = fauxDepot();
    const r1 = await upserterDossier(q, d, 1, '2026-06');
    expect(r1.nouveau).toBe(true);
    expect(store.size).toBe(1);
    const r2 = await upserterDossier(q, d, 1, '2026-06');
    expect(r2.nouveau).toBe(false);
    expect(store.size).toBe(1);                       // aucune ligne ajoutée
    expect(store.get('PC|PC0001')!.vuDernier).toBe('2026-06');
  });

  it('millésime suivant : reste déjà connu, vu_le_dernier avance', async () => {
    const { q, store } = fauxDepot();
    await upserterDossier(q, d, 1, '2026-06');
    const r = await upserterDossier(q, d, 2, '2026-07');
    expect(r.nouveau).toBe(false);
    expect(store.size).toBe(1);
    expect(store.get('PC|PC0001')!.vuDernier).toBe('2026-07');
  });
});
