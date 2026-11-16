import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (16/11/2026, 475) — l'historique des AG porté par la COPROPRIÉTÉ : une petite base en mémoire qui répond aux requêtes du dépôt
 * (le vrai SQL a été rejoué sur la base de recette, dans une transaction annulée).
 */
interface Copro { id: number; cle: string; libelle: string }
interface Lot { id: number; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null; adresse_normalisee: string | null; categorie: string | null; copropriete: boolean | null }
interface Ag { id: number; copropriete_id: number | null; cle_immeuble: string | null; lot_id: number | null; sortie_validee_id: number | null; type_ag: string; statut: string; date_ag: string | null;
  confirmation: boolean; origine: string; saisie_le: string; saisie_par_libelle: string }
const b = vi.hoisted(() => ({
  copros: [] as { id: number; cle: string; libelle: string }[],
  adresses: [] as { copropriete_id: number; cle: string; retire: boolean }[],
  lots: [] as unknown[], ag: [] as unknown[], syndics: [] as { copropriete_id: number; syndic: string; fin: boolean }[],
  sql: [] as string[], horloge: 0, ag377: [] as unknown[],
}));
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    const s = norm(sql); b.sql.push(s);
    const copros = b.copros as Copro[]; const lots = b.lots as Lot[]; const ag = b.ag as Ag[];
    const coproDe = (cle: string): Copro | undefined => copros.find((c) => c.cle === cle)
      ?? copros.find((c) => c.id === b.adresses.find((a) => a.cle === cle && !a.retire)?.copropriete_id);
    if (s.startsWith('SELECT c.id::text, c.libelle, c.cle_immeuble AS cle FROM gestion_copropriete c')) {
      const c = coproDe(p[0] as string); return { rows: c ? [{ id: String(c.id), libelle: c.libelle, cle: c.cle }] : [] };
    }
    if (s.startsWith('SELECT immeuble, adresse, code_postal, commune, adresse_normalisee, categorie')) return { rows: lots.filter((l) => l.id === p[0]) };
    if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1 UNION')) {
      const id = p[0] as number; return { rows: [...copros.filter((c) => c.id === id).map((c) => ({ cle: c.cle })), ...b.adresses.filter((a) => a.copropriete_id === id && !a.retire).map((a) => ({ cle: a.cle }))] };
    }
    if (s.includes('FROM gestion_copropriete_ag h')) {
      const [copro, cles, cle, lot] = p as [number | null, string[], string | null, number | null];
      return { rows: ag.filter((h) => (copro !== null && (h.copropriete_id === copro || (h.copropriete_id === null && cles.includes(h.cle_immeuble ?? ''))))
        || (copro === null && h.copropriete_id === null && (h.cle_immeuble === cle || h.lot_id === lot)))
        .sort((x, y) => y.saisie_le.localeCompare(x.saisie_le) || y.id - x.id)
        .map((h) => ({ ...h, id: String(h.id), sortie_validee_id: h.sortie_validee_id === null ? null : String(h.sortie_validee_id), copropriete_id: h.copropriete_id === null ? null : String(h.copropriete_id) })) };
    }
    if (s.startsWith('INSERT INTO gestion_copropriete_ag')) {
      const [copropriete_id, cle_immeuble, lot_id, sortie_validee_id, type_ag, statut, date_ag, confirmation, origine, , saisie_par_libelle] = p as [number | null, string | null, number | null, number | null, string, string, string | null, boolean, string, number, string];
      ag.push({ id: ag.length + 1, copropriete_id, cle_immeuble, lot_id, sortie_validee_id, type_ag, statut, date_ag, confirmation, origine, saisie_le: `2026-11-16T10:00:${String(++b.horloge).padStart(2, '0')}Z`, saisie_par_libelle });
      return { rows: [] };
    }
    if (s.startsWith('SELECT immeuble, adresse FROM gestion_annuaire_lot WHERE adresse_normalisee = $1')) return { rows: lots.filter((l) => l.adresse_normalisee === p[0] && l.id !== p[1]) };
    if (s.startsWith('SELECT id::text, libelle, cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1')) {
      return { rows: copros.filter((c) => c.id === p[0]).map((c) => ({ id: String(c.id), libelle: c.libelle, cle: c.cle })) };
    }
    if (s.startsWith('INSERT INTO gestion_copropriete_adresse')) { b.adresses.push({ copropriete_id: p[0] as number, cle: p[1] as string, retire: false }); return { rows: [] }; }
    if (s.startsWith('INSERT INTO gestion_copropriete (')) { const id = 900 + copros.length; copros.push({ id, cle: p[0] as string, libelle: p[1] as string }); return { rows: [{ id: String(id) }] }; }
    if (s.startsWith('INSERT INTO gestion_journal')) return { rows: [] };
    if (s.startsWith('SELECT identifiant, prenom, nom FROM admin_utilisateur')) return { rows: [{ identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' }] };
    if (s.includes('gestion_immeuble_ag')) { b.ag377.push(s); return { rows: [] }; }
    throw new Error(`requête inattendue : ${s.slice(0, 120)}`);
  },
}));
import { ajouterEntreesAg, contexteAgDuLot, coproprietesPourLot, creerCoproprietePourLot, entreesAgDuLot, rattacherLotACopropriete } from './agCoproprieteRepo';
import { enregistrerAg, lireAg } from './immeubleAgRepo';
import { propositionAg } from './agCopropriete';
import { query } from '../db/client';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' }; // l'identifiant ; l'historique garde « Prénom NOM »
const LOT = (id: number, o: Partial<Lot> = {}): Lot => ({ id, immeuble: null, adresse: '12 rue des Lilas', code_postal: '75011', commune: 'Paris', adresse_normalisee: '12 rue des lilas paris', categorie: 'appartement', copropriete: true, ...o });
beforeEach(() => {
  b.copros = [{ id: 7, cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls' }];
  b.adresses = [{ copropriete_id: 7, cle: '12 rue des lilas', retire: false }];
  b.lots = [LOT(1, { immeuble: 'Résidence Les Tilleuls' }), LOT(2, { immeuble: null }), LOT(3, { adresse: '3 impasse Neuve', adresse_normalisee: '3 impasse neuve paris', copropriete: null })];
  b.ag = []; b.syndics = [{ copropriete_id: 7, syndic: 'Cabinet A', fin: false }]; b.sql = []; b.horloge = 0; b.ag377 = [];
});

describe('la copropriété, distincte du syndic', () => {
  it('le bien est relié à SA copropriété par son immeuble (ou une adresse de la copropriété) ; le syndic n’est jamais lu', async () => {
    expect((await contexteAgDuLot(1))?.copropriete).toEqual({ id: 7, libelle: 'Résidence Les Tilleuls', cle: 'residence les tilleuls' });
    expect((await contexteAgDuLot(2))?.copropriete?.id).toBe(7); // par l'adresse secondaire « 12 rue des Lilas »
    expect(b.sql.some((x) => /syndic/i.test(x))).toBe(false);
    expect(b.sql.some((x) => /gestion_immeuble\b(?!_ag)/.test(x))).toBe(false); // le digicode (immeuble de l'adresse) n'est pas touché
  });
  it('🔴 changement de syndic : les AG restent (portées par la copropriété), rien n’est perdu', async () => {
    const c = (await contexteAgDuLot(1))!;
    await ajouterEntreesAg(query, { coproprieteId: 7, cle: c.immeuble!.cle, lotId: 1, sortieId: null }, [{ type: 'derniere', statut: 'officielle', date: '2026-03-12' }], 'fiche_bien', AUTEUR);
    b.syndics = [{ copropriete_id: 7, syndic: 'Cabinet A', fin: true }, { copropriete_id: 7, syndic: 'Cabinet B', fin: false }];
    const h = (await entreesAgDuLot(1))!;
    expect(h.entrees.map((e) => [e.type, e.date, e.saisiePar])).toEqual([['derniere', '2026-03-12', 'Arnaud JOREL']]);
    expect(b.sql.some((x) => /syndic/i.test(x))).toBe(false);
  });
});

describe('une date OFFICIELLE remonte sur la copropriété, réutilisée pour tous ses biens', () => {
  it('saisie depuis le bien 1 : le bien 2 de la même adresse la voit, proposée en priorité avec son auteur', async () => {
    await ajouterEntreesAg(query, { coproprieteId: 7, cle: 'residence les tilleuls', lotId: 1, sortieId: 12 }, [
      { type: 'derniere', statut: 'officielle', date: '2026-03-12' }, { type: 'prochaine', statut: 'officielle', date: '2027-04-02' }], 'sortie', AUTEUR);
    const h2 = (await entreesAgDuLot(2))!;
    expect(propositionAg(h2.entrees, '2026-11-16').prochaine).toMatchObject({ date: '2027-04-02', statut: 'officielle', par: 'Arnaud JOREL' });
    expect(h2.entrees.find((e) => e.type === 'prochaine')).toMatchObject({ origine: 'sortie', sortieId: 12, aRattacher: false });
  });
  it('une date PROJETÉE est gardée avec la sortie (son numéro), et montrée comme projection', async () => {
    await ajouterEntreesAg(query, { coproprieteId: 7, cle: 'residence les tilleuls', lotId: 1, sortieId: 13 }, [{ type: 'prochaine', statut: 'projetee', date: '2027-03-12' }], 'sortie', AUTEUR);
    const e = (await entreesAgDuLot(2))!.entrees[0];
    expect([e.statut, e.sortieId, e.origine]).toEqual(['projetee', 13, 'sortie']);
    expect(propositionAg([e], '2026-11-16').prochaine).toBeNull(); // jamais reprise comme officielle
  });
});

describe('le repli : un bien relié à aucune copropriété', () => {
  it('sans rattachement : la date est gardée sous l’immeuble du bien, « à rattacher » ; rattaché ensuite : elle rejoint la copropriété', async () => {
    const c = (await contexteAgDuLot(3))!;
    expect(c.copropriete).toBeNull();
    await ajouterEntreesAg(query, { coproprieteId: null, cle: c.immeuble!.cle, lotId: 3, sortieId: 14 }, [{ type: 'derniere', statut: 'officielle', date: '2026-02-01' }], 'sortie', AUTEUR);
    expect((await entreesAgDuLot(3))!.entrees.map((e) => e.aRattacher)).toEqual([true]);
    const r = await rattacherLotACopropriete(query, c, 7, AUTEUR);
    expect(r).toMatchObject({ ok: true, copropriete: { id: 7 } });
    const apres = (await entreesAgDuLot(3))!;
    expect(apres.contexte.copropriete?.id).toBe(7);
    expect(apres.entrees.map((e) => [e.date, e.aRattacher])).toEqual([['2026-02-01', false]]);
  });
  it('les copropriétés qui couvrent son adresse sont proposées ; on peut aussi en créer une (nom + adresse du bien)', async () => {
    b.lots.push(LOT(4, { immeuble: 'Résidence Les Tilleuls', adresse: '3 impasse Neuve', adresse_normalisee: '3 impasse neuve paris' }));
    expect((await coproprietesPourLot((await contexteAgDuLot(3))!)).map((x) => x.libelle)).toEqual(['Résidence Les Tilleuls']);
    const r = await creerCoproprietePourLot(query, (await contexteAgDuLot(3))!, '  Copro de l’impasse  ', AUTEUR);
    expect(r).toMatchObject({ ok: true, copropriete: { libelle: 'Copro de l’impasse' } });
    expect((await contexteAgDuLot(3))?.copropriete?.libelle).toBe('Copro de l’impasse');
  });
});

describe('une seule vérité : le champ « Date de la dernière AG » (fiche, création) lit et écrit l’historique', () => {
  it('l’écriture ajoute une entrée (origine, auteur) sans toucher la table 377 ; la lecture rend la plus récente ; même date : rien', async () => {
    await enregistrerAg({ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls' }, '2026-03-12', 1, AUTEUR);
    await enregistrerAg({ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls' }, '2026-03-12', 1, AUTEUR);
    await enregistrerAg({ cle: '12 rue des lilas', libelle: '12 rue des Lilas' }, '2026-03-20', 2, AUTEUR, 'creation_bien');
    expect((b.ag as Ag[]).map((h) => [h.copropriete_id, h.date_ag, h.origine])).toEqual([[7, '2026-03-12', 'fiche_bien'], [7, '2026-03-20', 'creation_bien']]);
    expect(await lireAg('residence les tilleuls')).toBe('2026-03-20');
    expect(b.ag377).toEqual([]);
  });
});
