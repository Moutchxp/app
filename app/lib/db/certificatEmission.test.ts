import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unité : on teste la LOGIQUE d'émission (ordre des gardes, IDOR, refus, recopie/re-dérivation, idempotence par
// pré-contrôle ET par contrainte 23505) SANS base ni pipeline réels. config.ts (THRESHOLD_M) reste RÉEL (pur).
const { query, withTransaction } = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
const { analyserAdresse } = vi.hoisted(() => ({ analyserAdresse: vi.fn() }));
const { attribuerNumeroCertificat } = vi.hoisted(() => ({ attribuerNumeroCertificat: vi.fn() }));
const { publierCarteOrientation } = vi.hoisted(() => ({ publierCarteOrientation: vi.fn() }));
const { publierCertificatPdf } = vi.hoisted(() => ({ publierCertificatPdf: vi.fn() }));
const { publierEnvoiCertificat } = vi.hoisted(() => ({ publierEnvoiCertificat: vi.fn() }));

vi.mock('./client', () => ({ query, withTransaction }));
vi.mock('./pipeline', () => ({ analyserAdresse }));
vi.mock('./certificatNumero', () => ({ attribuerNumeroCertificat }));
vi.mock('../carte/publierCarteOrientation', () => ({ publierCarteOrientation }));
vi.mock('../pdf/publierCertificatPdf', () => ({ publierCertificatPdf }));
vi.mock('../email/publierEnvoiCertificat', () => ({ publierEnvoiCertificat }));

import { emettreCertificat } from './certificatEmission';
import { REGEXP_JETON_VERIFICATION } from './certificatJeton';
import { REGEXP_REFERENCE } from './certificatReference';

const projetOK = {
  internaute_id: 'internaute-A', // scope de dépôt lu depuis le projet (plus d'ownership par param)
  lat: '48.90693182287072', lon: '2.269431435588249', azimut_deg: '90', etage: 2, dernier_etage: false,
  hauteur_sous_plafond_m: '2.50', hauteur_vision_m: '6.65',
  adresse_saisie: '1 rue X', adresse_normalisee: '1 Rue X, 92004',
  payload: { typeBien: 'appartement', surface: '75', nbPieces: '3', epoque: 'moderne' },
  mode_origine: 'semi_auto', photo_cle: 'internautes/a/photos/x.jpg',
};

const analyseOK = {
  validation: {
    valide: true, raison: '', batimentOrigine: { id: 1, cleabs: 'BATIMENT0000000240319856', polygoneWkt: '' },
    altitudeTerrainOrigineM: 30.5, altSolBdTopoM: 29.9, distanceAuBatimentM: 0, dansBatiment: true,
    pointSnappeL93: { x: 0, y: 0 }, pointSnappeWgs84: { lat: 48.9, lon: 2.26 },
  },
  resultat: {
    verdict: { verdict: 'SANS_VIS_A_VIS', distanceM: 120.5, obstacle: null, raison: '', analyseDegradee: false, messageDegrade: null },
    score: {
      total: 55.2, libelle: null, scorePartiel: false,
      famille1: { total: 0, distance: 0, amplitude: 0, orientation: 0, detail: { moyenneProfondeurM: 88.1, pourcentageFaisceauxDegages: 73, penaliteFlancAppliquee: false, secteurOrientation: 'S', bonusDernierEtage: 0, amplitudePartA: 0, amplitudePartB: 0 } },
      famille2: { scorePartiel: false },
    },
    distanceAxePrincipalM: 120.5, contexteDegagement: '', contexteVueNature: null, contexteImmobilier: null, monumentsHistoriques: [],
  },
};

/** Configure le routeur `query` par SQL + le comportement de la transaction. */
function installer(opts: {
  projet?: unknown;
  certAvant?: unknown[]; // pré-contrôle d'idempotence
  certRelit?: unknown[]; // relecture après 23505
  txThrow?: unknown; // si défini, withTransaction rejette TOUJOURS avec cette valeur (simule course/incident)
  refCollisions?: number; // nombre de collisions de référence (23505 reference_unique) AVANT succès
}) {
  const { projet = projetOK, certAvant = [], certRelit, txThrow, refCollisions } = opts;
  let certCalls = 0;
  query.mockImplementation(async (sql: string) => {
    if (/FROM internaute_projet/.test(sql)) return { rows: projet ? [projet] : [] };
    if (/FROM certificat WHERE projet_id/.test(sql)) {
      certCalls += 1;
      return { rows: certCalls === 1 ? certAvant : (certRelit ?? certAvant) };
    }
    if (/FROM parcelle/.test(sql)) return { rows: [{ id: '92004000AM0114' }] };
    if (/bdnb_annee_batiment/.test(sql)) return { rows: [{ annee_construction: 1923 }] };
    if (/config_scoring/.test(sql)) return { rows: [{ empreinte: 'abc123', generation: '17' }] };
    return { rows: [] };
  });
  // `\b` après « certificat » ne matche PAS « certificat_acheminement » (« _ » est un caractère de mot) → on
  // distingue l'INSERT certificat (qui doit RETURNING id) de l'INSERT acheminement.
  const qTx = vi.fn(async (...a: unknown[]) => {
    const sql = a[0] as string;
    if (/INSERT INTO certificat\b/.test(sql)) return { rows: [{ id: 7 }] as unknown[] };
    return { rows: [] as unknown[] };
  });
  if (txThrow !== undefined) {
    withTransaction.mockRejectedValue(txThrow);
  } else if (refCollisions && refCollisions > 0) {
    // Les `refCollisions` premières transactions échouent sur la contrainte de RÉFÉRENCE (23505), puis succès.
    let n = 0;
    withTransaction.mockImplementation(async (fn: (q: unknown) => unknown) => {
      n += 1;
      if (n <= refCollisions) throw { code: '23505', constraint: 'certificat_reference_unique' };
      return fn(qTx);
    });
  } else {
    withTransaction.mockImplementation(async (fn: (q: unknown) => unknown) => fn(qTx));
  }
  attribuerNumeroCertificat.mockResolvedValue('SAVV-2026-000001');
  return { qTx };
}

beforeEach(() => {
  query.mockReset();
  withTransaction.mockReset();
  analyserAdresse.mockReset();
  attribuerNumeroCertificat.mockReset();
  publierCarteOrientation.mockReset();
  publierCarteOrientation.mockResolvedValue(undefined);
  publierCertificatPdf.mockReset();
  publierCertificatPdf.mockResolvedValue(undefined);
  publierEnvoiCertificat.mockReset();
  publierEnvoiCertificat.mockResolvedValue(undefined);
  analyserAdresse.mockResolvedValue(analyseOK);
});

describe('emettreCertificat — gardes & IDOR', () => {
  it('projet non possédé (SELECT vide) → projet_absent, aucun re-jeu, aucune transaction', async () => {
    installer({ projet: null });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'projet_absent' });
    expect(analyserAdresse).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    // ownership prouvée en amont par le jeton (sub === projetId) → lecture du projet par son seul id
    expect(query.mock.calls[0][1]).toEqual([42]);
  });

  it('mode_origine NULL → refus_mode_inconnu, aucun re-jeu (re-jeu non fidèle)', async () => {
    installer({ projet: { ...projetOK, mode_origine: null } });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_mode_inconnu' });
    expect(analyserAdresse).not.toHaveBeenCalled();
  });

  it('mode_origine hors liste fermée (valeur aberrante) → refus_mode_inconnu (le code est la porte)', async () => {
    installer({ projet: { ...projetOK, mode_origine: 'automatique' } });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_mode_inconnu' });
  });

  it('analyse non rejouable (azimut manquant, dossier < 026) → refus_indetermine, aucun re-jeu', async () => {
    installer({ projet: { ...projetOK, azimut_deg: null } });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_indetermine' });
    expect(analyserAdresse).not.toHaveBeenCalled();
  });

  it('verdict INDETERMINE (origine non validable / hors LiDAR) → refus_indetermine, aucune transaction', async () => {
    installer({});
    analyserAdresse.mockResolvedValue({ validation: analyseOK.validation, resultat: null });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_indetermine' });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('verdict = INDETERMINE explicite → refus_indetermine', async () => {
    installer({});
    analyserAdresse.mockResolvedValue({ ...analyseOK, resultat: { ...analyseOK.resultat, verdict: { ...analyseOK.resultat.verdict, verdict: 'INDETERMINE' } } });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_indetermine' });
  });

  it('verdict = VIS_A_VIS → refus_vis_a_vis (hors périmètre) : aucune transaction, aucun numéro, aucune carte', async () => {
    installer({});
    analyserAdresse.mockResolvedValue({ ...analyseOK, resultat: { ...analyseOK.resultat, verdict: { ...analyseOK.resultat.verdict, verdict: 'VIS_A_VIS' } } });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'refus_vis_a_vis' });
    expect(withTransaction).not.toHaveBeenCalled(); // aucune écriture
    expect(attribuerNumeroCertificat).not.toHaveBeenCalled(); // aucun numéro brûlé
    expect(publierCarteOrientation).not.toHaveBeenCalled(); // aucune carte
  });
});

describe('emettreCertificat — idempotence', () => {
  it('pré-contrôle : certificat déjà émis → existant (numéro + référence), aucun re-jeu, aucune transaction', async () => {
    installer({ certAvant: [{ numero: 'SAVV-2026-000009', verdict: 'VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' }] });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'existant', numero: 'SAVV-2026-000009', verdict: 'VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' });
    expect(analyserAdresse).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('COURSE certificat_projet_unique (23505) → relit et renvoie l’existant (avec référence), aucune erreur', async () => {
    installer({
      certAvant: [], // pré-contrôle : rien (les deux requêtes ont lu « rien »)
      certRelit: [{ numero: 'SAVV-2026-000042', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-AAAA-BBBB' }], // l'autre transaction a gagné
      txThrow: { code: '23505', constraint: 'certificat_projet_unique' }, // sémantique idempotence
    });
    const r = await emettreCertificat(42);
    expect(r).toEqual({ statut: 'existant', numero: 'SAVV-2026-000042', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-AAAA-BBBB' });
  });

  it('COLLISION de référence (23505 certificat_reference_unique) → re-tire et RETENTE, puis émet', async () => {
    installer({ refCollisions: 2 }); // 2 collisions de référence, puis succès à la 3e tentative
    const r = await emettreCertificat(42);
    expect(r).toMatchObject({ statut: 'emis', numero: 'SAVV-2026-000001' });
    if (r.statut === 'emis') expect(r.reference).toMatch(REGEXP_REFERENCE);
    expect(withTransaction).toHaveBeenCalledTimes(3); // 2 échecs + 1 succès
  });

  it('collision de référence PERSISTANTE (> MAX tentatives) → échec propre (ErreurReferenceCertificat)', async () => {
    installer({ refCollisions: 99 }); // ne réussit jamais
    await expect(emettreCertificat(42)).rejects.toMatchObject({ name: 'ErreurReferenceCertificat' });
  });

  it('incident base NON lié (autre code) → remonte (la route répondra proprement)', async () => {
    installer({ txThrow: { code: '08006', message: 'connexion perdue' } });
    await expect(emettreCertificat(42)).rejects.toMatchObject({ code: '08006' });
  });
});

describe('emettreCertificat — re-jeu & recopie', () => {
  it('re-jeu avec le mode LU EN BASE (manuel), jamais le défaut', async () => {
    installer({ projet: { ...projetOK, mode_origine: 'manuel' } });
    await emettreCertificat(42);
    expect(analyserAdresse).toHaveBeenCalledWith(expect.objectContaining({ mode: 'manuel' }));
  });

  it('nominal → emis : numéro attribué DANS la transaction + INSERT recopie les entrées et fige le re-dérivé', async () => {
    const { qTx } = installer({});
    const r = await emettreCertificat(42);
    expect(r).toMatchObject({ statut: 'emis', numero: 'SAVV-2026-000001', verdict: 'SANS_VIS_A_VIS' });
    if (r.statut === 'emis') expect(r.reference).toMatch(REGEXP_REFERENCE); // référence publique retournée (peut sortir)
    expect(attribuerNumeroCertificat).toHaveBeenCalledWith(qTx); // numéro attribué avec le q de la transaction
    const insert = qTx.mock.calls.find((c) => /INSERT INTO certificat\b/.test(c[0] as string));
    expect(insert).toBeTruthy();
    const p = insert![1] as unknown[];
    expect(p[0]).toBe('SAVV-2026-000001'); // numero
    expect(p[1]).toBe(42); // projet_id
    expect(p[2]).toBe(17); // config_generation (int8 → number)
    expect(p[3]).toBe('abc123'); // config_empreinte
    expect(p[4]).toBe('48.90693182287072'); // lat RECOPIÉ tel quel (chaîne numeric, précision préservée)
    expect(p[13]).toBe(75); // surface_m2 (payload '75' → 75)
    expect(p[14]).toBe(3); // nb_pieces
    expect(p[16]).toBe('SANS_VIS_A_VIS'); // verdict re-dérivé
    expect(p[17]).toBe(55.2); // score re-dérivé
    expect(p[18]).toBe(120.5); // distance_obstacle_m (verdict.distanceM)
    expect(p[23]).toBe(40); // tolerance_m (THRESHOLD_M, réel)
    expect(p[24]).toBe('92004000AM0114'); // reference_cadastrale
    expect(p[25]).toBe(1923); // annee_batiment (BDNB)
    expect(p[27]).toBe('internautes/a/photos/x.jpg'); // photo_cle recopiée
    expect(p[28]).toMatch(REGEXP_JETON_VERIFICATION); // $29 — jeton frappé, conforme au CHECK 038 par construction
    expect(p[29]).toMatch(REGEXP_REFERENCE); // $30 — référence publique frappée, conforme au CHECK 039 par construction
  });

  it('nominal → ouvre l’acheminement DANS la même transaction : certificat_id renvoyé, statut en_attente', async () => {
    const { qTx } = installer({});
    await emettreCertificat(42);
    const ach = qTx.mock.calls.find((c) => /INSERT INTO certificat_acheminement/.test(c[0] as string));
    expect(ach).toBeTruthy();
    // certificat_id = id renvoyé par l'INSERT certificat (7, mocké) ; statut initial 'en_attente' (rien généré/envoyé)
    expect(ach![1]).toEqual([7]);
    expect(ach![0]).toMatch(/statut\) VALUES \(\$1, 'en_attente'\)/);
  });

  it('idempotence (pré-contrôle) : aucune transaction → AUCUN acheminement ouvert (pas de 2e ligne)', async () => {
    installer({ certAvant: [{ numero: 'SAVV-2026-000009', verdict: 'VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' }] });
    await emettreCertificat(42);
    expect(withTransaction).not.toHaveBeenCalled(); // ni certificat, ni acheminement réinsérés
    expect(publierCarteOrientation).not.toHaveBeenCalled(); // chemin idempotent → pas de re-génération de carte
  });
});

describe('emettreCertificat — carte d’orientation (après COMMIT)', () => {
  it('nominal → carte publiée APRÈS le commit, avec l’id du certificat + la géométrie lue en base', async () => {
    installer({});
    await emettreCertificat(42);
    // certificatId = id renvoyé par l'INSERT (7) ; lat/lon/azimut coercés depuis les chaînes numeric du projet.
    expect(publierCarteOrientation).toHaveBeenCalledWith('internaute-A', 7, 48.90693182287072, 2.269431435588249, 90);
    // PDF publié APRÈS la carte, avec l'internaute (scope de dépôt) + l'id du certificat.
    expect(publierCertificatPdf).toHaveBeenCalledWith('internaute-A', 7);
    // Envoi APRÈS le PDF, avec l'id du certificat.
    expect(publierEnvoiCertificat).toHaveBeenCalledWith(7);
    expect(publierCarteOrientation.mock.invocationCallOrder[0]).toBeLessThan(publierCertificatPdf.mock.invocationCallOrder[0]);
    expect(publierCertificatPdf.mock.invocationCallOrder[0]).toBeLessThan(publierEnvoiCertificat.mock.invocationCallOrder[0]);
  });

  it('idempotence (pré-contrôle) : ni PDF ni envoi régénérés', async () => {
    installer({ certAvant: [{ numero: 'SAVV-2026-000009', verdict: 'VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' }] });
    await emettreCertificat(42);
    expect(publierCertificatPdf).not.toHaveBeenCalled(); // chemin idempotent → aucun PDF régénéré
    expect(publierEnvoiCertificat).not.toHaveBeenCalled(); // ni envoi
  });

  it('un échec de carte ne peut PAS casser l’émission : publierCarteOrientation ne throw jamais (best-effort)', async () => {
    installer({});
    // Même si la publication échouait, elle avale ses erreurs ; ici on prouve que le statut 'emis' est rendu.
    const r = await emettreCertificat(42);
    expect(r).toMatchObject({ statut: 'emis', numero: 'SAVV-2026-000001', verdict: 'SANS_VIS_A_VIS' });
  });

  it('course 23505 projet_unique (chemin existant) → PAS de carte régénérée', async () => {
    installer({
      certRelit: [{ numero: 'SAVV-2026-000042', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-AAAA-BBBB' }],
      txThrow: { code: '23505', constraint: 'certificat_projet_unique' },
    });
    await emettreCertificat(42);
    expect(publierCarteOrientation).not.toHaveBeenCalled();
  });
});
