import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (15/11/2026) — le brouillon côté serveur (474) : un vivant par pré-visite, jamais supprimé ; pièces relues pour CES occupations. */
const appels: { sql: string; params: unknown[] }[] = [];
let lignes: Record<string, unknown[]> = {};
let disponible = true;
vi.mock('../db/client', () => ({ query: vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  const k = Object.keys(lignes).find((x) => sql.replace(/\s+/g, ' ').includes(x));
  return { rows: k ? lignes[k] : [] };
}) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => disponible }));
vi.mock('./piecesSortieRepo', () => ({ metaPieces: async (ids: number[]) => ids.filter((i) => i === 71).map((id) => ({ id, nom: 'p.jpg', typeMime: 'image/jpeg', taille: 3, provenance: 'x' })) }));
vi.mock('./vocauxCompteRenduRepo', () => ({ vocauxDesOccupations: async (ids: number[]) => ids.filter((i) => i === 81).map((id) => ({ id, nom: 'v', typeMime: 'audio/mp4', taille: 3, cle: 'k' })) }));
import { ecrireBrouillon, effacerBrouillon, lireBrouillon } from './brouillonCompteRenduRepo';
const AUTEUR = { id: 1, libelle: 'Arno' };
beforeEach(() => { appels.length = 0; disponible = true; lignes = { 'FROM gestion_location_previsite WHERE': [{ id: '7' }] }; });

describe('brouillon côté serveur', () => {
  it('écrit (crée ou met à jour le vivant) un contenu nettoyé, rattaché à la pré-visite ouverte', async () => {
    lignes['INSERT INTO gestion_location_previsite_brouillon'] = [{ enregistre_le: '2026-11-15 13:05:00+00' }];
    const r = await ecrireBrouillon([11], { corps: 'CR', presents: [11], inconnu: 1 }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { enregistreLe: '2026-11-15T13:05:00.000Z' } });
    const ins = appels.find((a) => a.sql.includes('INSERT INTO gestion_location_previsite_brouillon'))!;
    expect(ins.sql).toContain('ON CONFLICT (previsite_id) WHERE efface_le IS NULL');
    expect(ins.params[0]).toBe(7);
    expect(JSON.parse(String(ins.params[2]))).toMatchObject({ corps: 'CR', presents: [11] });
    expect(JSON.parse(String(ins.params[2]))).not.toHaveProperty('inconnu');
  });
  // 🔴🔴 (9e retour) une pièce introuvable (ou d'un autre bail) n'est plus retirée en silence : elle revient « perdue », sans son numéro
  it('lit le vivant ; une photo ou une prise introuvable pour CES occupations revient « perdue » (jamais son numéro)', async () => {
    lignes['FROM gestion_location_previsite_brouillon'] = [{ enregistre_le: '2026-11-15 13:05:00+00', contenu: { corps: 'CR', presents: [11, 99], photos: [{ id: 71, legende: 'A' }, { id: 72, legende: 'autre bail' }],
      fichiers: [{ cle: 'f', nom: 'V', locataires: false, prises: [{ id: 81, dureeS: 2 }, { id: 82, dureeS: 1 }] }] } }];
    const r = await lireBrouillon([11]);
    expect(r.etat === 'ok' && r.data.brouillon).toEqual(expect.objectContaining({ presents: [11],
      photos: [{ id: 71, legende: 'A' }, { cle: 'perdue-72', legende: 'autre bail', perdue: true }],
      fichiers: [expect.objectContaining({ prises: [{ id: 81, dureeS: 2 }, { cle: 'perdue-82', dureeS: 1, perdue: true }] })] }));
  });
  it('une photo ou une prise pas encore confirmée (référencée par sa clé) est rendue telle quelle', async () => {
    lignes['FROM gestion_location_previsite_brouillon'] = [{ enregistre_le: '2026-11-15 13:05:00+00', contenu: { corps: 'CR', photos: [{ cle: 'ph1', legende: 'L' }],
      fichiers: [{ cle: 'f', nom: 'V', locataires: false, prises: [{ cle: 'pr1', dureeS: 3 }] }] } }];
    const r = await lireBrouillon([11]);
    expect(r.etat === 'ok' && r.data.brouillon).toMatchObject({ photos: [{ cle: 'ph1', legende: 'L' }], fichiers: [{ prises: [{ cle: 'pr1', dureeS: 3 }] }] });
  });
  it('« Effacer » et l’envoi MARQUENT le brouillon (jamais de DELETE) ; sans la 474 : sans_schema, rien n’est écrit', async () => {
    lignes['UPDATE gestion_location_previsite_brouillon'] = [{ id: '3' }];
    expect(await effacerBrouillon([11], AUTEUR)).toEqual({ etat: 'ok', data: { efface: true } });
    const up = appels.find((a) => a.sql.includes('UPDATE gestion_location_previsite_brouillon'))!;
    expect(up.sql).toContain('SET efface_le = now(), efface_motif = $2');
    expect(up.params).toEqual([7, 'efface', 'Arno']);
    expect(appels.some((a) => /DELETE/i.test(a.sql))).toBe(false);
    disponible = false; appels.length = 0;
    expect((await ecrireBrouillon([11], { corps: 'x' }, AUTEUR)).etat).toBe('sans_schema');
    expect(appels).toEqual([]);
  });
});
