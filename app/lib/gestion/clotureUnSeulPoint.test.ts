import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  jourDePoseParis, ouvertSelonLesBornes, retraitCloturerait, sqlInstantDeBorne, type BorneDeFrise,
} from './etatParLaFrise';
import { appliquerFiltres, auStadeCloture, LIGNE_PAR_DEFAUT } from './ligneFiltresEvenements';
import type { CarteEvenement } from './fileRepo';

/**
 * 🔴 Arno (23/10/2026) — « Un événement à l'étape “Clôture” ne doit JAMAIS rester dans le bloc “Événements” ». Base SIMULÉE :
 * rien n'est écrit. Ce qu'on éprouve :
 *   ① la cause (une clôture datée de midi sur un événement créé l'après-midi laissait la période ouverte) et sa correction ;
 *   ② le SEUL point d'entrée serveur (`poserCarteDeBorne`) : daté après la dernière borne, vérifié, annulé s'il ne ferme pas ;
 *   ③ les autres chemins : carte qui DEVIENT une Clôture, confirmation d'une Clôture Monga ; aucun autre écrivain ;
 *   ④ le filtre de sécurité du bloc « Événements ».
 */
const emis: { sql: string; params: unknown[] }[] = [];
let ouvert = true;
let fermeApresInsertion = true;
let rollback = 0;
let typeLu = 'devis_recu';
vi.mock('../db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('AS ouvert')) return { rows: [{ ouvert }], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_monga_etape')) {
      if (params[1] === 'cloture' && fermeApresInsertion) ouvert = false;
      if (params[1] === 'reouverture') ouvert = true;
      return { rows: [{ id: '777' }], rowCount: 1 };
    }
    if (sql.includes('UPDATE gestion_monga_etape')) {
      if ((params[1] === 'cloture' || sql.includes("certitude = 'confirmee'")) && fermeApresInsertion) ouvert = false;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM gestion_evenement WHERE id = $1 FOR UPDATE')) return { rows: [{ id: String(params[0]) }], rowCount: 1 };
    if (sql.includes('SELECT type FROM gestion_monga_etape')) return { rows: [{ type: typeLu }], rowCount: 1 };
    if (sql.includes('evenement_id::text FROM (')) return { rows: [{ evenement_id: '5' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return {
    query,
    withTransaction: async (fn: (q: typeof query) => unknown) => {
      try { return await fn(query); } catch (e) { rollback += 1; throw e; }
    },
  };
});
const { ajouterEtapeManuelle, modifierEtapeManuelle, poserCarteDeBorne, trancherEtape } = await import('./mongaEtapeRepo');

beforeEach(() => { emis.length = 0; ouvert = true; fermeApresInsertion = true; rollback = 0; typeLu = 'devis_recu'; });
const norm = (s: string) => s.replace(/\s+/g, ' ');
const B = (id: number, type: BorneDeFrise['type'], survenuLe: string, certitude = 'fiable'): BorneDeFrise => ({ id, type, certitude, survenuLe });

describe('🔴 ① la cause du constat d’Arno, et sa correction (pli pur, même règle que le SQL)', () => {
  it('créé à 14 h 05, clos par une carte datée de midi le même jour → resté ouvert (le défaut)', () => {
    expect(ouvertSelonLesBornes([B(11, 'cloture', '2026-10-23 12:00:00+02')], '2026-10-23 14:05:00+02')).toBe(true);
  });
  it('clos une seconde après la dernière borne → fermé', () => {
    expect(ouvertSelonLesBornes([B(11, 'cloture', '2026-10-23 14:05:01+02')], '2026-10-23 14:05:00+02')).toBe(false);
  });
  it('une clôture « à confirmer » ou écartée ne ferme rien ; une carte Ouverture remplace l’ouverture dérivée', () => {
    expect(ouvertSelonLesBornes([B(11, 'cloture', '2026-10-24 12:00:00+02', 'a_confirmer')], '2026-10-23T12:00')).toBe(true);
    expect(ouvertSelonLesBornes([B(11, 'cloture', '2026-10-24 12:00:00+02', 'ecartee')], '2026-10-23T12:00')).toBe(true);
    expect(ouvertSelonLesBornes([B(10, 'ouverture', '2026-10-25T12:00'), B(11, 'cloture', '2026-10-24T12:00')], '2026-10-01T12:00')).toBe(true);
  });
  it('le jour de pose : midi, à Paris (et non le jour UTC)', () => {
    expect(jourDePoseParis(new Date('2026-10-23T22:30:00Z'))).toBe('2026-10-24T12:00');
    expect(jourDePoseParis(new Date('2026-10-23T08:00:00Z'))).toBe('2026-10-23T12:00');
  });
  it('l’instant SQL : GREATEST(voulu, dernière borne + 1 s), toutes les bornes de l’événement, ouverture dérivée comprise', () => {
    const sql = norm(sqlInstantDeBorne('$1', '-1', '$3::timestamptz'));
    expect(sql).toContain("GREATEST($3::timestamptz, (SELECT max(svv_db.quand) + interval '1 second'");
    expect(sql).toContain('WHERE svv_ev.id IN ($1) AND svv_db.carte <> -1');
    expect(sql).toContain('svv_ev.ouvert_le AS quand');   // l'ouverture dérivée est dans les bornes lues
  });
});

describe('🔴 ② le SEUL point d’entrée de la clôture : poserCarteDeBorne', () => {
  const poser = (type: 'cloture' | 'reouverture') => poserCarteDeBorne({
    evenementId: 5, type, jourDePose: '2026-10-23T12:00', texte: null, pieceNom: null, parId: 1, parLibelle: 'arno@x.test',
  });
  it('la carte est datée APRÈS la dernière borne, dans une transaction, l’événement verrouillé ; l’effet est vérifié', async () => {
    const r = await poser('cloture');
    expect(r).toEqual({ ok: true, id: 777, ouvertAvant: true, ouvertApres: false });
    const verrou = emis.findIndex((e) => e.sql.includes('FOR UPDATE'));
    const ins = emis.findIndex((e) => e.sql.includes('INSERT INTO gestion_monga_etape'));
    expect(verrou).toBeGreaterThanOrEqual(0);
    expect(verrou).toBeLessThan(ins);
    expect(norm(emis[ins].sql)).toContain("VALUES ($1,$2,GREATEST($3::timestamptz, (SELECT max(svv_db.quand) + interval '1 second'");
    expect(emis[ins].params[2]).toBe('2026-10-23T12:00');
    expect(emis[ins].params[10]).toBe(true);   // une borne a toujours sa date
    expect(emis.slice(ins + 1).some((e) => e.sql.includes('AS ouvert'))).toBe(true);
  });
  it('une Clôture qui laisserait la période ouverte est ANNULÉE (rien n’est écrit)', async () => {
    fermeApresInsertion = false;
    await expect(poser('cloture')).rejects.toThrow('Clôture sans effet');
    expect(rollback).toBe(1);
  });
  it('un événement déjà clos : refus, et aucune carte posée', async () => {
    ouvert = false;
    expect(await poser('cloture')).toEqual({ ok: false, motif: 'deja_clos' });
    expect(emis.some((e) => e.sql.includes('INSERT'))).toBe(false);
  });
  it('la Réouverture passe par le même point, et doit rouvrir', async () => {
    ouvert = false;
    expect(await poser('reouverture')).toMatchObject({ ok: true, ouvertAvant: false, ouvertApres: true });
  });
  it('la porte ordinaire refuse une Clôture ou une Réouverture (elle n’en écrit jamais)', async () => {
    const a = { evenementId: 5, survenuLe: '2026-10-23', heureConnue: false, jourConnu: true, texte: null, montantCents: null,
      pieceNom: null, titre: null, parId: null, parLibelle: 'x' };
    await expect(ajouterEtapeManuelle({ ...a, type: 'cloture' })).rejects.toThrow('poserCarteDeBorne');
    await expect(ajouterEtapeManuelle({ ...a, type: 'reouverture' })).rejects.toThrow('poserCarteDeBorne');
    expect(emis).toHaveLength(0);
    expect(await ajouterEtapeManuelle({ ...a, type: 'devis_recu' })).toBe(777);
  });
});

describe('🔴 ③ les autres chemins vers « Clôture » passent par la même règle', () => {
  const modifier = (type: 'cloture' | 'devis_recu') => modifierEtapeManuelle({
    id: 41, type, survenuLe: '2026-02-10', heureConnue: false, jourConnu: true, texte: null, montantCents: null, titre: null,
    pieceNom: null, parLibelle: 'arno@x.test', jourDePose: '2026-10-23T12:00',
  });
  it('une carte qui DEVIENT une Clôture : datée après la dernière borne, l’effet vérifié', async () => {
    expect(await modifier('cloture')).toEqual({ ok: true, ouvertAvant: true, ouvertApres: false });
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(norm(maj.sql)).toContain('survenu_le = GREATEST($3::timestamptz,');
    expect(norm(maj.sql)).toContain('svv_db.carte <> $1');   // la carte réécrite ne compte pas parmi les bornes
    expect(maj.params[2]).toBe('2026-10-23T12:00');
  });
  it('… et si elle ne fermait pas, rien n’est écrit', async () => {
    fermeApresInsertion = false;
    await expect(modifier('cloture')).rejects.toThrow('Clôture sans effet');
    expect(rollback).toBe(1);
  });
  it('une modification qui garde le type ordinaire ne touche pas à la date saisie', async () => {
    expect(await modifier('devis_recu')).toEqual({ ok: true, ouvertAvant: null, ouvertApres: null });
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(norm(maj.sql)).toContain('survenu_le = $3,');
    expect(maj.params[2]).toBe('2026-02-10');
  });
  it('confirmer une Clôture venue de Monga la place après la dernière borne et ferme l’événement', async () => {
    typeLu = 'cloture';
    expect(await trancherEtape(31, 'confirmer', 'arno@x.test')).toEqual({ fait: true, etatChange: true, ouvertApres: false });
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(norm(maj.sql)).toContain("certitude = 'confirmee'");
    expect(norm(maj.sql)).toContain('survenu_le = GREATEST(survenu_le,');
  });
  it('confirmer une autre étape ne déplace pas sa date', async () => {
    typeLu = 'devis_recu';
    await trancherEtape(32, 'confirmer', 'arno@x.test');
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(norm(maj.sql)).toContain('survenu_le = survenu_le');
  });
  it('retirer une Réouverture qui referme : l’écran le sait AVANT (la modale)', () => {
    const cartes = [B(51, 'cloture', '2026-03-01T12:00'), B(52, 'reouverture', '2026-06-01T12:00')];
    expect(retraitCloturerait(cartes, '2026-01-05T09:00', 52)).toBe(true);
    expect(retraitCloturerait(cartes, '2026-01-05T09:00', 51)).toBe(false);   // retirer la Clôture rouvre, ne ferme pas
  });
  it('aucun autre code n’écrit une carte manuelle : un seul INSERT manuel, appelé par les deux portes', () => {
    const repo = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
    expect((repo.match(/'manuelle','fiable'/g) ?? []).length).toBe(1);
    expect(readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8'))
      .toContain("if (type === 'cloture' || type === 'reouverture') {\n      const issue = await poserCarteDeBorne({");
  });
});

describe('🔴 ④ le bloc « Événements » n’affiche jamais un événement à l’étape « Clôture »', () => {
  const carte = (id: number, etat: string, derniere: string | null) => ({
    evenementId: id, etat, derniereEtape: derniere === null ? null : { type: derniere },
  }) as unknown as CarteEvenement;
  it('clos, OU dont l’étape courante est « Clôture » (même si sa période n’était pas fermée)', () => {
    expect(auStadeCloture(carte(1, 'traite', null))).toBe(true);
    expect(auStadeCloture(carte(2, 'en_cours', 'cloture'))).toBe(true);
    expect(auStadeCloture(carte(3, 'en_cours', 'devis_recu'))).toBe(false);
  });
  it('le plein écran « En cours » l’écarte aussi, même avant l’arrivée des ensembles ; « Tous » le garde', () => {
    const l = [carte(2, 'en_cours', 'cloture'), carte(3, 'en_cours', null)];
    expect(appliquerFiltres(l, LIGNE_PAR_DEFAUT, null).map((c) => c.evenementId)).toEqual([3]);
    expect(appliquerFiltres(l, LIGNE_PAR_DEFAUT, { encours: [2, 3] }).map((c) => c.evenementId)).toEqual([3]);
    expect(appliquerFiltres(l, { ...LIGNE_PAR_DEFAUT, etat: 'tous' }, null).map((c) => c.evenementId)).toEqual([2, 3]);
  });
  it('la colonne de la page partagée et son compteur lisent la même règle', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8'))
      .toContain('const evenementsEnCours = evenementsRanges.filter((e) => !auStadeCloture(e));');
    expect(norm(readFileSync('app/lib/gestion/fileRepo.ts', 'utf8')))
      .toContain("AND NOT ${sqlEtapeCouranteEstCloture('e')})::int AS ouverts");
  });
});
