import { describe, it, expect, beforeEach, vi } from 'vitest';

// On teste la SÉMANTIQUE (existence vs détails, normalisation, non-fuite) sans base : `withTransaction` est mocké
// et route par SQL (SET TRANSACTION READ ONLY vs SELECT).
const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock('./client', () => ({ withTransaction }));

import { verifierCertificat, verifierParReference } from './certificatVerification';

const JETON = 'ABCDEFGHJKMNPQRS'; // 16 car. Crockford valides
const EMIS = new Date('2026-07-15T09:30:00.000Z');

// Ligne complète telle qu'elle serait en base — inclut des champs INTERDITS de sortie, pour prouver qu'ils ne
// fuient jamais (même si un jour le SELECT en ramenait plus, la sortie ne doit porter que les 5 champs publics).
const LIGNE = {
  numero: 'SAVV-2026-000007',
  emis_le: EMIS,
  verdict: 'SANS_VIS_A_VIS',
  adresse: '12 rue des Fleurs, 92004',
  etage: 3,
  jeton_verification: JETON,
  a_un_compte: true, // par défaut : certificat rattaché à un compte (authentifiable) — cf. cas one-shot dédiés plus bas
};

/** Route `withTransaction` : la 1re requête DOIT être SET TRANSACTION READ ONLY ; la 2e le SELECT. */
function installer(row: unknown | null) {
  const vues: string[] = [];
  withTransaction.mockImplementation(async (fn: (q: unknown) => unknown) => {
    const q = vi.fn(async (sql: string) => {
      vues.push(sql);
      if (/SELECT .* FROM certificat WHERE (numero|reference)/.test(sql)) return { rows: row ? [row] : [] };
      return { rows: [] };
    });
    return fn(q);
  });
  return { vues };
}

beforeEach(() => {
  withTransaction.mockReset();
});

describe('verifierCertificat — validation du numéro', () => {
  it.each([['vide', ''], ['garbage', 'xxx'], ['casse basse partielle', 'savv-2026-1'], ['non-string', 42], ['null', null]])(
    'numéro mal formé (%s) → numero_invalide, AUCUN accès base',
    async (_l, val) => {
      installer(null);
      const r = await verifierCertificat(val as unknown);
      expect(r).toEqual({ statut: 'numero_invalide' });
      expect(withTransaction).not.toHaveBeenCalled();
    },
  );

  it('numéro en minuscules mais bien formé → normalisé en MAJUSCULES puis interrogé', async () => {
    const { vues } = installer(LIGNE);
    await verifierCertificat('savv-2026-000007', JETON);
    expect(withTransaction).toHaveBeenCalled();
    // 1re instruction de la transaction = lecture seule réelle
    expect(vues[0]).toBe('SET TRANSACTION READ ONLY');
  });
});

describe('verifierCertificat — existence vs détails', () => {
  it('numéro inexistant → inexistant', async () => {
    installer(null);
    expect(await verifierCertificat('SAVV-2026-000007', JETON)).toEqual({ statut: 'inexistant' });
  });

  it('numéro réel SANS jeton → existe (rien d’autre)', async () => {
    installer(LIGNE);
    expect(await verifierCertificat('SAVV-2026-000007')).toEqual({ statut: 'existe' });
  });

  it('numéro réel avec jeton FAUX → existe (rien d’autre)', async () => {
    installer(LIGNE);
    expect(await verifierCertificat('SAVV-2026-000007', 'ZZZZZZZZZZZZZZZZ')).toEqual({ statut: 'existe' });
  });

  it('numéro réel avec le BON jeton → verifie + contenu minimal', async () => {
    installer(LIGNE);
    const r = await verifierCertificat('SAVV-2026-000007', JETON);
    expect(r).toEqual({
      statut: 'verifie',
      certificat: { numero: 'SAVV-2026-000007', emisLe: EMIS.toISOString(), verdict: 'SANS_VIS_A_VIS', adresse: '12 rue des Fleurs, 92004', etage: 3 },
    });
  });

  it('jeton en MINUSCULES → accepté (normalisation canonique majuscules)', async () => {
    installer(LIGNE);
    const r = await verifierCertificat('SAVV-2026-000007', JETON.toLowerCase());
    expect(r.statut).toBe('verifie');
  });

  it('jeton avec espaces/tirets et saisie Crockford (o→0, i/l→1) → normalisé puis comparé', async () => {
    installer({ ...LIGNE, jeton_verification: '0123456789ABCDEF' });
    // saisie « brouillon » : minuscules, tirets, espaces, o pour 0, l/i pour 1 → doit canoniser en 0123456789ABCDEF
    const r = await verifierCertificat('SAVV-2026-000007', 'o123-4567 89ab-cdef');
    expect(r.statut).toBe('verifie');
  });
});

describe('verifierCertificat — GARANTIE DE NON-FUITE', () => {
  it('AUCUN champ hors liste ne sort, quel que soit le chemin (jamais le jeton, lat/lon, score, resultat…)', async () => {
    // La ligne base porte des champs interdits ; on vérifie qu'ils ne transitent jamais vers la sortie.
    const ligneAvecInterdits = { ...LIGNE, lat: '48.9', lon: '2.26', score: '55.2', distance_obstacle_m: '120', resultat: '{"x":1}' };
    for (const [numero, jeton] of [
      ['SAVV-2026-000007', JETON], // verifie
      ['SAVV-2026-000007', undefined], // existe
      ['SAVV-2026-000007', 'ZZZZZZZZZZZZZZZZ'], // existe (faux)
    ] as const) {
      installer(ligneAvecInterdits);
      const r = await verifierCertificat(numero, jeton);
      const json = JSON.stringify(r);
      for (const interdit of ['jeton', 'lat', 'lon', 'score', 'distance', 'resultat', '48.9', '2.26', '55.2']) {
        expect(json).not.toContain(interdit);
      }
    }
  });

  it('le contenu « verifie » a EXACTEMENT 5 clés, ni plus ni moins', async () => {
    installer(LIGNE);
    const r = await verifierCertificat('SAVV-2026-000007', JETON);
    expect(r.statut).toBe('verifie');
    if (r.statut === 'verifie') {
      expect(Object.keys(r.certificat).sort()).toEqual(['adresse', 'emisLe', 'etage', 'numero', 'verdict']);
    }
  });
});

describe('verifierCertificat — GATE COMPTE (défense en profondeur one-shot)', () => {
  const SANS_COMPTE = { ...LIGNE, a_un_compte: false };

  it('certificat SANS compte + BON jeton → sans_compte (jamais verifie), AUCUN champ', async () => {
    installer(SANS_COMPTE);
    const r = await verifierCertificat('SAVV-2026-000007', JETON);
    expect(r).toEqual({ statut: 'sans_compte' }); // exactement ce statut, aucune autre clé (pas de `certificat`)
  });

  it('certificat SANS compte + jeton absent/faux → sans_compte aussi (tranché avant la comparaison)', async () => {
    installer(SANS_COMPTE);
    expect(await verifierCertificat('SAVV-2026-000007')).toEqual({ statut: 'sans_compte' });
    installer(SANS_COMPTE);
    expect(await verifierCertificat('SAVV-2026-000007', 'ZZZZZZZZZZZZZZZZ')).toEqual({ statut: 'sans_compte' });
  });

  it('fail-closed : a_un_compte non strictement true (null/undefined) → sans_compte', async () => {
    installer({ ...LIGNE, a_un_compte: null as unknown as boolean });
    expect(await verifierCertificat('SAVV-2026-000007', JETON)).toEqual({ statut: 'sans_compte' });
  });

  it('NON-FUITE en sans_compte : ni les 5 champs ni le jeton ne sortent', async () => {
    installer({ ...SANS_COMPTE, lat: '48.9', lon: '2.26', score: '55.2' });
    const r = await verifierCertificat('SAVV-2026-000007', JETON);
    const json = JSON.stringify(r);
    for (const interdit of ['jeton', 'ABCDEFGHJKMNPQRS', '12 rue des Fleurs', 'SANS_VIS_A_VIS', 'emisLe', 'etage', 'lat', 'lon', 'score', '48.9', '2.26', '55.2']) {
      expect(json).not.toContain(interdit);
    }
  });

  it('NON-RÉGRESSION : certificat AVEC compte + BON jeton → verifie (5 champs) inchangé', async () => {
    installer(LIGNE);
    const r = await verifierCertificat('SAVV-2026-000007', JETON);
    expect(r).toEqual({
      statut: 'verifie',
      certificat: { numero: 'SAVV-2026-000007', emisLe: EMIS.toISOString(), verdict: 'SANS_VIS_A_VIS', adresse: '12 rue des Fleurs, 92004', etage: 3 },
    });
  });
});

describe('verifierParReference — VOIE VISUEL (référence seule, sans jeton)', () => {
  const REF = 'SVAV-K7M2-9QX4';
  // Ligne visuel + champs INTERDITS (adresse/lat/lon/prenom/jeton) pour prouver qu'ils ne fuitent jamais dans le set.
  const VISUEL = {
    reference: REF, verdict: 'SANS_VIS_A_VIS', score: '82.4',
    type_bien: 'Appartement', surface_m2: '72.35', nb_pieces: 3, annee_batiment: 2008, epoque: null,
    etage: 5, dernier_etage: false, a_un_compte: true,
    adresse: '12 rue des Fleurs, 92004', lat: '48.9', lon: '2.26', prenom: 'Jean', jeton_verification: JETON,
  };

  it('référence VALIDE d’un compte → visuel_verifie avec le set attendu, SANS adresse', async () => {
    installer(VISUEL);
    const r = await verifierParReference(REF);
    expect(r).toEqual({
      statut: 'visuel_verifie',
      visuel: {
        reference: REF, verdict: 'SANS_VIS_A_VIS', score: 82.4,
        descriptif: {
          typeBien: 'Appartement', surfaceM2: 72.35, pieces: 3, chambres: null,
          anneeOuEpoque: '2008', etage: 5, dernierEtage: false, exterieur: null,
        },
      },
    });
  });

  it('NON-FUITE : le set visuel ne contient JAMAIS adresse / lat / lon / nom / jeton', async () => {
    installer(VISUEL);
    const r = await verifierParReference(REF);
    const json = JSON.stringify(r);
    for (const interdit of ['adresse', '12 rue des Fleurs', 'lat', 'lon', '48.9', '2.26', 'Jean', 'jeton', JETON]) {
      expect(json).not.toContain(interdit);
    }
  });

  it('anneeOuEpoque : époque en repli quand annee_batiment est null', async () => {
    installer({ ...VISUEL, annee_batiment: null, epoque: 'Années 1970' });
    const r = await verifierParReference(REF);
    expect(r.statut === 'visuel_verifie' && r.visuel.descriptif.anneeOuEpoque).toBe('Années 1970');
  });

  it('référence d’un ONE-SHOT (pas de compte) → sans_compte (jamais de set visuel)', async () => {
    installer({ ...VISUEL, a_un_compte: false });
    expect(await verifierParReference(REF)).toEqual({ statut: 'sans_compte' });
  });

  it('référence INEXISTANTE (bien formée) → inexistant', async () => {
    installer(null);
    expect(await verifierParReference('SVAV-AAAA-BBBB')).toEqual({ statut: 'inexistant' });
  });

  it.each([['vide', ''], ['garbage', 'xxx'], ['numéro (mauvais préfixe)', 'SAVV-2026-000007'], ['lettres exclues I/L/O/U', 'SVAV-ILOU-2222'], ['non-string', 42], ['null', null]])(
    'référence mal formée (%s) → reference_invalide, AUCUN accès base',
    async (_l, val) => {
      installer(null);
      // NB : les cas I/L/O sont d'abord canonisés (I/L→1, O→0) ; ici « ILOU » → « 1L0U » contient U (exclu) → invalide.
      const r = await verifierParReference(val as unknown);
      expect(r).toEqual({ statut: 'reference_invalide' });
      expect(withTransaction).not.toHaveBeenCalled();
    },
  );

  it('normalisation Crockford : minuscules + O→0 acceptés (référence canonisée puis résolue)', async () => {
    const { vues } = installer(VISUEL);
    const r = await verifierParReference('svav-k7m2-9qx4'); // minuscules → MAJUSCULES
    expect(r.statut).toBe('visuel_verifie');
    expect(vues[0]).toBe('SET TRANSACTION READ ONLY');
  });
});
