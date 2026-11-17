import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (17/11/2026, « Adresses uniformisées », lot 3) — « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse)
 * passent sur ChampAdresseBan réutilisé tel quel ; […] adresse absente de la liste = saisie libre autorisée avec confirmation, marquée « hors liste —
 * à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. » Le contrôle serveur ; base et service simulés.
 */
const h = vi.hoisted(() => ({ etat: 'trouvee' as 'trouvee' | 'introuvable' | 'muet', appels: 0, avec485: true, lot: null as Record<string, unknown> | null, ecrits: [] as unknown[][] }));
vi.mock('../gestion/verificationAdresseRepo', () => ({ etatsAdresses: async () => { h.appels += 1; return [h.etat]; } }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec485 }));
vi.mock('../db/client', () => ({
  query: async (sql: string) => ({ rows: h.lot === null ? [] : [sql.includes('wippimmo_id') && !sql.includes('adresse,') ? { wippimmo_id: h.lot.wippimmo_id } : h.lot] }),
}));
import { controlerAdresseBien, controlerAdresseBienExistant, ecrireNatureAdresseBien, MOTIF_BIEN_ETRANGER } from './adresseBienRepo';

const PORT = { adresse: '3 Rue du Port', codePostal: '92400', commune: 'COURBEVOIE' };
beforeEach(() => {
  h.etat = 'trouvee'; h.appels = 0; h.avec485 = true; h.ecrits = [];
  h.lot = { wippimmo_id: 'app-1', adresse: '3 Rue du Port', code_postal: '92400', commune: 'COURBEVOIE', adresse_nature: null, adresse_pays: null };
});

describe('🔴 un bien à créer (« Nouveau bien », annexe « Autre adresse »)', () => {
  it('choisie dans la liste : retrouvée, nature « liste » ; introuvable ou service muet : refus clair, rien n’est enregistré', async () => {
    expect(await controlerAdresseBien(null, PORT, { nature: 'liste' })).toEqual({ ok: true, nature: 'liste', ecrire: true });
    h.etat = 'introuvable';
    expect(await controlerAdresseBien(null, PORT, { nature: 'liste' })).toMatchObject({ ok: false, motif: expect.stringContaining('introuvable dans la Base Adresse Nationale') });
    h.etat = 'muet';
    expect(await controlerAdresseBien(null, PORT, { nature: 'liste' })).toMatchObject({ ok: false, motif: expect.stringContaining('ne répond pas') });
  });
  it('hors liste : seulement confirmée (sans appel au service) ; jamais « à l’étranger » pour un bien', async () => {
    expect(await controlerAdresseBien(null, { adresse: '2 impasse Neuve', codePostal: '92400', commune: 'COURBEVOIE' }, { nature: 'hors_liste', horsListeConfirme: true }))
      .toEqual({ ok: true, nature: 'hors_liste', ecrire: true });
    expect((await controlerAdresseBien(null, PORT, { nature: 'hors_liste' })).ok).toBe(false);
    expect(await controlerAdresseBien(null, PORT, { nature: 'etranger', pays: 'Belgique' })).toEqual({ ok: false, motif: MOTIF_BIEN_ETRANGER });
    expect(h.appels).toBe(0);
  });
  it('rue sans numéro : refusée tant qu’elle n’est pas confirmée à l’écran (la même fenêtre que partout)', async () => {
    const rue = { adresse: 'Rue du Port', codePostal: '92400', commune: 'COURBEVOIE' };
    expect(await controlerAdresseBien(null, rue, { nature: 'liste' })).toMatchObject({ ok: false, motif: expect.stringContaining('n’a pas de numéro') });
    expect(await controlerAdresseBien(null, rue, { nature: 'liste', sansNumeroConfirme: true })).toEqual({ ok: true, nature: 'liste', ecrire: true });
  });
  it('sans la migration 485 : la saisie d’avant (rien contrôlé, rien écrit en plus)', async () => {
    h.avec485 = false;
    expect(await controlerAdresseBien(null, { adresse: 'n’importe quoi' }, undefined)).toEqual({ ok: true, nature: null, ecrire: false });
    await ecrireNatureAdresseBien((async (...a: unknown[]) => { h.ecrits.push(a); return { rows: [] }; }) as never, 1, 'liste');
    expect(h.ecrits).toEqual([]);
    expect(h.appels).toBe(0);
  });
});

describe('🔴 un bien existant : AUCUNE ADRESSE EXISTANTE RÉÉCRITE', () => {
  it('non touchée : ni revérifiée ni requalifiée — même si l’écran dit « liste » (une adresse d’avant ce lot reste sans nature)', async () => {
    expect(await controlerAdresseBienExistant(1, PORT, undefined)).toEqual({ ok: true, nature: null, ecrire: false });
    expect(await controlerAdresseBienExistant(1, { ...PORT, commune: 'Courbevoie' }, { nature: 'liste' })).toEqual({ ok: true, nature: null, ecrire: false });
    expect(h.appels).toBe(0);
  });
  it('changée : retrouvée ; une « hors liste » choisie ensuite dans la liste redevient « liste »', async () => {
    expect(await controlerAdresseBienExistant(1, { ...PORT, adresse: '5 Rue du Port' }, { nature: 'liste' })).toEqual({ ok: true, nature: 'liste', ecrire: true });
    h.lot = { ...h.lot, adresse_nature: 'hors_liste' };
    expect(await controlerAdresseBienExistant(1, PORT, { nature: 'liste' })).toEqual({ ok: true, nature: 'liste', ecrire: true });
    expect(h.appels).toBe(2);
  });
  it('un bien importé de WIPPIMMO (adresse tenue par l’import) ou inconnu : rien à contrôler, rien d’écrit', async () => {
    h.lot = { ...h.lot, wippimmo_id: '1234' };
    expect(await controlerAdresseBienExistant(1, { adresse: 'autre chose' }, { nature: 'liste' })).toEqual({ ok: true, nature: null, ecrire: false });
    h.lot = null;
    expect(await controlerAdresseBienExistant(1, { adresse: 'autre chose' }, { nature: 'liste' })).toEqual({ ok: true, nature: null, ecrire: false });
    expect(h.appels).toBe(0);
  });
  it('la nature retenue s’écrit avec l’adresse (dans la transaction de l’appelant)', async () => {
    await ecrireNatureAdresseBien((async (...a: unknown[]) => { h.ecrits.push(a); return { rows: [] }; }) as never, 7, 'hors_liste');
    expect(h.ecrits).toEqual([['UPDATE gestion_annuaire_lot SET adresse_nature = $2 WHERE id = $1', [7, 'hors_liste']]]);
  });
});
