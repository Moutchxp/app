import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detailsAnnexe, estLotAnnexe, motCompteur, questionDetacher, typeDuLot } from './annexesBien';

/** 🔴 Arno (21/10/2026) — les annexes en cases : les mots (PUR), puis la lecture serveur (base SIMULÉE, lecture seule). */
describe('les mots des cases', () => {
  const A = { id: 437, categorie: 'cave', etage: '-2', nature: null, typeBien: null, porte: '56', numLotCopro: '183', adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS' };
  const BIEN = { adresse: '25 rue Henri-Barbusse', commune: 'Gennevilliers' };
  it('type, N°, lot, niveau ; l’adresse seulement si elle diffère ; place pour un parking ; RDC', () => {
    expect(typeDuLot(A)).toBe('Cave');
    expect(detailsAnnexe(A, BIEN)).toEqual(['N° 56', 'Lot 183', 'Niveau -2']);
    expect(detailsAnnexe({ ...A, categorie: 'parking', etage: 'RDC', adresse: '3 rue Voisine' }, BIEN)).toEqual(['Place 56', 'Lot 183', 'Rez-de-chaussée', '3 rue Voisine, GENNEVILLIERS']);
    expect(detailsAnnexe({ ...A, etage: '2', porte: null, numLotCopro: null }, BIEN)).toEqual(['2e étage']);
  });
  it('le compteur et la question', () => {
    expect(motCompteur('Logement', 0)).toBeNull();
    expect(motCompteur('Logement', 1)).toBe('Logement · 1 annexe');
    expect(motCompteur('Logement', 2)).toBe('Logement · 2 annexes');
    expect(questionDetacher('Cave', 'Logement')).toBe('Détacher cette cave du logement ? Elle deviendra un bien à part entière, avec le même propriétaire.');
    expect(questionDetacher('Parking', 'Logement')).toBe('Détacher ce parking du logement ? Il deviendra un bien à part entière, avec le même propriétaire.');
    expect(questionDetacher('Autre', 'Local')).toBe('Détacher cette annexe du local ? Elle deviendra un bien à part entière, avec le même propriétaire.');
  });
  it('estLotAnnexe : la catégorie, sinon la nature WIPPIMMO', () => {
    expect(estLotAnnexe({ categorie: 'cave', nature: null, typeBien: null })).toBe(true);
    expect(estLotAnnexe({ categorie: 'logement', nature: 'Parking', typeBien: null })).toBe(false);
    expect(estLotAnnexe({ categorie: null, nature: 'Parking', typeBien: null })).toBe(true);
    expect(estLotAnnexe({ categorie: null, nature: 'Appartement', typeBien: 'Type 2' })).toBe(false);
  });
});

const appels: { sql: string; params: unknown[] }[] = [];
let lignes: (sql: string) => unknown[] = () => [];
vi.mock('../db/client', () => ({ query: async (sql: string, params: unknown[] = []) => { const s = sql.replace(/\s+/g, ' '); appels.push({ sql: s, params }); return { rows: lignes(s), rowCount: 0 }; } }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { annexesDuLot, evenementsAnnexes } = await import('./annexesBienRepo');

describe('annexesDuLot — lecture seule', () => {
  beforeEach(() => { appels.length = 0; });
  const LOT = (o: Record<string, unknown>) => ({ id: '437', categorie: 'cave', etage: '-2', nature: null, type_bien: null, porte: '56', num_lot_copro: '183', adresse: 'a', commune: 'c', proprietaire_id: '49', gestion_fin: null, detachee: false, ...o });
  it('un logement : ses annexes RATTACHÉES (non détachées) en cases ; pas de « Rattacher »', async () => {
    lignes = (s) => (s.includes('WHERE lo.id = $1') ? [LOT({ id: '436', categorie: 'logement' })]
      : s.includes('WHERE ax.parent_id = $1') ? [LOT({})] : []);
    const r = await annexesDuLot(436);
    expect(r).toMatchObject({ lotId: 436, typeLot: 'Logement', principal: null, detachee: false, candidats: null, annexes: [{ id: 437, categorie: 'cave', porte: '56' }] });
    expect(appels.find((a) => a.sql.includes('WHERE ax.parent_id = $1'))?.sql).toContain('af.annexe_detachee_le IS NULL');
  });
  it('une annexe DÉTACHÉE : son seul bien d’origine comme candidat', async () => {
    lignes = (s) => (s.includes('WHERE lo.id = $1') ? [LOT({ detachee: true })]
      : s.includes('WHERE ax.annexe_id = $1') ? [{ id: '436', adresse: '25 Rue', commune: 'G', categorie: 'logement' }] : []);
    expect((await annexesDuLot(437))?.candidats).toEqual([{ id: 436, adresse: '25 Rue', commune: 'G', categorie: 'logement', origine: true }]);
  });
  it('une annexe rattachée : aucune action ; un lot de type annexe jamais lié : les biens principaux du même titulaire, hors annexes', async () => {
    lignes = (s) => (s.includes('WHERE lo.id = $1') ? [LOT({})] : s.includes('WHERE ax.annexe_id = $1') ? [{ id: '436', adresse: null, commune: null, categorie: 'logement' }] : []);
    expect((await annexesDuLot(437))?.candidats).toBeNull();
    lignes = (s) => (s.includes('WHERE lo.id = $1') ? [LOT({ id: '500', categorie: null, nature: 'Parking' })]
      : s.includes('lo.proprietaire_id = $1 AND lo.id <> $2') ? [
        { id: '436', adresse: 'L', commune: 'G', categorie: 'logement', nature: null, type_bien: null },
        { id: '501', adresse: 'P', commune: 'G', categorie: null, nature: 'Cave', type_bien: null }] : []);
    const r = await annexesDuLot(500);
    expect(r?.candidats).toEqual([{ id: 436, adresse: 'L', commune: 'G', categorie: 'logement', origine: false }]);
    expect(appels.find((a) => a.sql.includes('lo.proprietaire_id = $1 AND lo.id <> $2'))?.params).toEqual([49, 500]);
  });
  it('evenementsAnnexes : les trois gestes d’annexe, sur CE bien', async () => {
    lignes = () => [{ id: '9', quand: 'q', action: 'location_annexe_detachee', valeur_apres: null, commentaire: 'annexe détachée (bien principal 436)', auteur_libelle: 'x' }];
    expect(await evenementsAnnexes(437)).toEqual([{ id: 9, quand: 'q', action: 'location_annexe_detachee', texte: 'annexe détachée (bien principal 436)', par: 'x' }]);
    expect(appels.at(-1)?.params).toEqual([437]);
    expect(appels.at(-1)?.sql).toContain("j.action IN ('location_annexe_detachee', 'location_annexe_rattachee', 'location_annexe_reintegree')");
  });
});
