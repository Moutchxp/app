import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { deposer, recuperer, stockageConfigure } = vi.hoisted(() => ({ deposer: vi.fn(), recuperer: vi.fn(), stockageConfigure: vi.fn() }));
const { genererCertificatPdf } = vi.hoisted(() => ({ genererCertificatPdf: vi.fn() }));

vi.mock('../db/client', () => ({ query }));
vi.mock('../stockage', () => ({ deposer, recuperer, stockageConfigure }));
vi.mock('./certificatPdf', () => ({ genererCertificatPdf }));

import { publierCertificatPdf, assembler } from './publierCertificatPdf';

const CARTE = Buffer.from('carte-png');
const PHOTO = Buffer.from('photo-jpeg');

/** Ligne jointe complète (certificat + projet + internaute + acheminement). */
function ligne(over: Record<string, unknown> = {}) {
  return {
    numero: 'SAVV-2026-000123', reference: 'SVAV-K7M2-9QX4', emis_le: new Date('2026-07-14T12:32:00.000Z'),
    verdict: 'SANS_VIS_A_VIS', score: '82.4', distance_obstacle_m: null, profondeur_moyenne_m: '187.4',
    lat: '48.858370', lon: '2.362350', azimut_deg: '123.4', etage: 4, dernier_etage: false,
    hauteur_sous_plafond_m: '2.5', hauteur_vision_m: '12.85', adresse: '34 rue de Turenne, 75003 Paris',
    type_bien: 'Appartement', surface_m2: '72.35', nb_pieces: 3, annee_batiment: 2008, altitude_terrain_m: '35.2',
    altitude_sol_m: '34.8', reference_cadastrale: '75103000AB0123', jeton_verification: 'ABCDEFGHJKMNPQRS',
    photo_cle: 'internautes/a/photos/x.jpg',
    residence_principale: true, mode_origine: 'semi_auto', payload: { balcon: true },
    prenom: 'Jean', nom: 'Dupont', email: 'jean@e.fr', telephone: '06 12 34 56 78',
    carte_orientation_cle: 'internautes/a/cartes/c.png',
    ...over,
  };
}

describe('assembler — formatage + tas A nullable', () => {
  it('nominal : demandeur, usage, mode, extérieur, coordonnées, obstacle « > 200 m »', () => {
    const d = assembler(ligne() as never, 'https://www.sansvisavis.com', CARTE, PHOTO);
    // Modèle : le bloc demandeur porte AUSSI l'adresse (celle du bien, seule dispo — `internaute` n'a pas d'adresse postale).
    expect(d.demandeur).toEqual({ nom: 'Jean Dupont', adresse: '34 rue de Turenne, 75003 Paris', email: 'jean@e.fr', telephone: '06 12 34 56 78' });
    expect(d.bien.usage).toBe('Habitation principale');
    expect(d.photo.mode).toBe('snapping façade');
    expect(d.empreinteCaracteristiques).toContainEqual(['Extérieur', 'Balcon']);
    expect(d.empreinteCoordonnees).toContainEqual(['Latitude', '48.858370']);
    expect(d.analyseResultat[0]).toEqual(['Obstacle face détecté', '> 200 m']); // distance null → > 200 m
    expect(d.score.valeur).toBe(82); // 82,4 arrondi
    expect(d.urlBase).toBe('https://www.sansvisavis.com');
    expect(d.urlVerification).toBe('www.sansvisavis.com/verifier');
    expect(d.siteWeb).toBe('www.sansvisavis.com');
    expect(d.empreintePosition).toContainEqual(['Sous-plafond déclaré', '2,50 m']); // sous-plafond OBLIGATOIRE présent
    expect(d.empreintePosition).toContainEqual(['Hauteur de vision', '12,85 m']); // valeur MOTEUR, formatée telle quelle
  });

  it('tas A NULL (effacement RGPD / non-couplage) → demandeur null, usage/mode absents, extérieur absent, aucun « undefined »', () => {
    const d = assembler(
      ligne({ prenom: null, nom: null, email: null, telephone: null, residence_principale: null, mode_origine: null, payload: null }) as never,
      'https://www.sansvisavis.com',
      CARTE,
      null,
    );
    expect(d.demandeur).toBeNull();
    expect(d.bien.usage).toBeNull();
    expect(d.photo.mode).toBeNull();
    expect(d.empreinteCaracteristiques.find((r) => r[0] === 'Extérieur')).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain('undefined');
    expect(d.photoJpeg).toBeNull();
  });

  it('obstacle entre 40 et 200 → distance affichée ; ≥ 200 → « > 200 m »', () => {
    expect(assembler(ligne({ distance_obstacle_m: '123.4' }) as never, 'https://x.com', CARTE, null).analyseResultat[0]).toEqual(['Obstacle face détecté', '123,4 m']);
    expect(assembler(ligne({ distance_obstacle_m: '250' }) as never, 'https://x.com', CARTE, null).analyseResultat[0]).toEqual(['Obstacle face détecté', '> 200 m']);
  });

  it('résidence secondaire → usage « Habitation secondaire » ; mode manuel → « GPS libre »', () => {
    const d = assembler(ligne({ residence_principale: false, mode_origine: 'manuel' }) as never, 'https://x.com', CARTE, null);
    expect(d.bien.usage).toBe('Habitation secondaire');
    expect(d.photo.mode).toBe('GPS libre');
  });
});

describe('publierCertificatPdf — orchestration best-effort', () => {
  beforeEach(() => {
    query.mockReset();
    deposer.mockReset();
    recuperer.mockReset();
    stockageConfigure.mockReset();
    genererCertificatPdf.mockReset();
    process.env.SITE_URL = 'https://www.sansvisavis.com';
    stockageConfigure.mockReturnValue(true);
    recuperer.mockResolvedValue(CARTE);
    genererCertificatPdf.mockResolvedValue(Buffer.from('pdf'));
    deposer.mockResolvedValue({ cle: 'internautes/internaute-A/certificats/uuid.pdf', bucket: 'b', taille: 3, type: 'application/pdf' });
    query.mockImplementation(async (sql: string) => {
      if (/FROM certificat c/.test(sql)) return { rows: [ligne()] };
      return { rows: [] };
    });
  });
  afterEach(() => {
    delete process.env.SITE_URL;
  });

  it('stockage non configuré → silencieux : aucune requête, aucun dépôt', async () => {
    stockageConfigure.mockReturnValue(false);
    await publierCertificatPdf('internaute-A', 7);
    expect(query).not.toHaveBeenCalled();
    expect(deposer).not.toHaveBeenCalled();
  });

  it('SITE_URL absente → PDF NON généré (QR faux évité) : aucune requête, aucun dépôt', async () => {
    delete process.env.SITE_URL;
    await publierCertificatPdf('internaute-A', 7);
    expect(query).not.toHaveBeenCalled();
    expect(genererCertificatPdf).not.toHaveBeenCalled();
  });

  it('nominal → génère, dépose (application/pdf scopé internaute), statut → genere', async () => {
    await publierCertificatPdf('internaute-A', 7);
    expect(genererCertificatPdf).toHaveBeenCalledTimes(1);
    expect(genererCertificatPdf.mock.calls[0][0]).toMatchObject({ urlBase: 'https://www.sansvisavis.com', numero: 'SAVV-2026-000123' });
    expect(deposer).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', { internauteId: 'internaute-A' });
    const upd = query.mock.calls.find((c) => /statut = 'genere'/.test(c[0] as string));
    expect(upd?.[1]).toEqual(['internautes/internaute-A/certificats/uuid.pdf', 7]);
  });

  it('carte indisponible → PDF différé (pas de génération, pas de statut echec)', async () => {
    recuperer.mockImplementation(async (cle: string) => {
      if (/cartes/.test(cle)) throw new Error('carte absente');
      return PHOTO;
    });
    await publierCertificatPdf('internaute-A', 7);
    expect(genererCertificatPdf).not.toHaveBeenCalled();
    expect(query.mock.calls.some((c) => /statut = 'echec'/.test(c[0] as string))).toBe(false);
  });

  it('échec de génération → statut echec + derniere_erreur (nom d’erreur, jamais le jeton), aucune exception', async () => {
    genererCertificatPdf.mockRejectedValue(Object.assign(new Error('boom'), { name: 'ErreurRendu' }));
    await expect(publierCertificatPdf('internaute-A', 7)).resolves.toBeUndefined();
    const echec = query.mock.calls.find((c) => /statut = 'echec'/.test(c[0] as string));
    expect(echec?.[1]).toEqual(['ErreurRendu', 7]);
    // le jeton du certificat ne doit apparaître dans AUCUN paramètre d'UPDATE
    for (const c of query.mock.calls) expect(JSON.stringify(c[1] ?? [])).not.toContain('ABCDEFGHJKMNPQRS');
  });
});
