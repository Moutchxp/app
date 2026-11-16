import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 2) — l'écriture : refus avant toute écriture, création au premier « Valider », jamais d'effacement. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], coproDeCle: {} as Record<string, { id: string; cle: string; libelle: string }>, syndicExiste: true,
  liens: [] as { id: string; syndic_id: string }[], enCours: [] as { id: string; cle: string; libelle: string }[], contacts: [] as unknown[], fiche: null as unknown,
  parcelle: [] as unknown[], prise: {} as Record<string, unknown>, porteur: {} as Record<string, unknown> }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
  const s = norm(sql); h.sql.push({ s, p });
  if (s.startsWith('SELECT c.id::text, c.cle_immeuble AS cle, c.libelle FROM gestion_copropriete c')) { const x = h.coproDeCle[p[0] as string]; return { rows: x ? [x] : [] }; }
  // le conflit de parcelle (règle commune) : la copropriété d'une adresse de la parcelle, avec son syndic ; et celle qui est notée
  if (s.startsWith('SELECT c.cle_immeuble AS cle, c.libelle, s.id::text AS syndic_id')) { const x = h.prise[p[0] as string]; return { rows: x ? [x] : [] }; }
  if (s.startsWith('SELECT c.id::text, cs.syndic_id::text AS syndic FROM gestion_copropriete c')) { const x = h.porteur[p[0] as string]; return { rows: x ? [x] : [] }; }
  if (s.startsWith('SELECT id::text FROM gestion_syndic WHERE id = $1')) return { rows: h.syndicExiste ? [{ id: String(p[0]) }] : [] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1')) return { rows: [{ id: '7' }] };
  if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse')) return { rows: h.enCours };
  if (s.startsWith('SELECT id::text, syndic_id::text FROM gestion_copropriete_syndic')) return { rows: h.liens };
  if (s.startsWith('SELECT syndic_id::text AS syndic FROM gestion_copropriete_syndic')) return { rows: [{ syndic: '9' }] };
  if (s.startsWith('SELECT id::text, immeuble FROM gestion_annuaire_lot')) return { rows: [{ id: '1', immeuble: '12 rue des Lilas' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./coproprieteRepo', () => ({ fiche476Disponible: async () => true, ficheCopropriete: async () => h.fiche }));
vi.mock('./contactsImmeubleRepo', () => ({ enregistrerContactsImmeuble: async (_q: unknown, c: unknown) => { h.contacts.push(c); } }));
const dg = vi.hoisted(() => ({ avec477: true, ecrits: [] as unknown[][] }));
vi.mock('../location/digicodeImmeubleRepo', () => ({ depuisCoproprieteDisponible: async () => dg.avec477,
  enregistrerDigicodeDans: async (...a: unknown[]) => { dg.ecrits.push(a.slice(1)); return { ok: true, change: true, immeubleId: 1 }; } }));
// 🔴 (« Digicodes unifiés », lot 3) la base unique : absente pour les épreuves d'avant, présente pour les siennes (le chemin serveur unique simulé)
const un = vi.hoisted(() => ({ avec478: false, ecrits: [] as Record<string, unknown>[], issue: { ok: true, change: true, id: 1 } as Record<string, unknown> }));
vi.mock('./digicodesRepo', () => ({ digicodesUnifiesDisponibles: async () => un.avec478, RefusDigicode: class extends Error {},
  ecrireDigicode: async (_q: unknown, e: Record<string, unknown>) => { un.ecrits.push(e); return typeof un.issue === 'function' ? (un.issue as (x: unknown) => unknown)(e) : un.issue; },
  annulerChangement: async (_q: unknown, adresseCle: string, id: number) => { un.ecrits.push({ annulation: id, adresseCle }); return { ok: true, change: true, id }; } }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: h.parcelle }) }));
const va = vi.hoisted(() => ({ vues: [] as unknown[][], issue: { ok: true } as { ok: true } | { ok: false; motif: string } }));
vi.mock('./verificationAdresseRepo', () => ({ verifierAdresses: async (a: unknown[]) => { va.vues.push(a); return va.issue; } }));
import { enregistrerCopropriete, gesteDigicodeCopro, validerSaisieCopropriete } from './coproprieteEcritureRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const FICHE = (o: Record<string, unknown> = {}) => ({ cle: 'residence les tilleuls', declaree: true, id: 7, libelle: 'Résidence Les Tilleuls', nom: null, horsCopropriete: false, nomenclature: null,
  codePostal: '75011', commune: 'Paris', adresses: [], digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: null, code: null }, batiments: [] }],
  batimentsConnus: [{ cle: 'a', libelle: 'A', sorte: 'lettre' }], nomenclatureEffective: 'lettres', saisieDigicodes: true, syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' }, gestionnaires: [], contacts: [], biens: [], desaccord: false, avec476: true, ...o });
const SAISIE = { immeuble: 'Résidence Les Tilleuls', nom: 'Les Tilleuls', horsCopropriete: false, adresses: [{ libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris' }],
  contacts: [{ id: null, categorie: 'coproprietaire', civilite: 'Mme', prenom: 'Léa', nom: 'Martin', coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.test' }] }] };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { dg.avec477 = true; dg.ecrits = []; h.sql = []; h.coproDeCle = {}; h.syndicExiste = true; h.liens = [{ id: '30', syndic_id: '2' }]; h.enCours = []; h.contacts = []; h.fiche = FICHE(); h.parcelle = []; h.prise = {}; h.porteur = {}; va.vues = []; va.issue = { ok: true }; un.avec478 = false; un.ecrits = []; un.issue = { ok: true, change: true, id: 1 }; });

describe('la saisie', () => {
  it('adresses dédoublonnées, statuts du carnet validés (Copropriétaire accepté ; Personnaliser exige son texte), syndic', () => {
    const v = validerSaisieCopropriete({ ...SAISIE, adresses: [...SAISIE.adresses, { libelle: '12  RUE des lilas' }], syndicId: 4 });
    expect(v.ok && [v.saisie.adresses.length, v.saisie.contacts?.[0].categorie, v.saisie.syndicId]).toEqual([1, 'coproprietaire', 4]);
    expect(validerSaisieCopropriete({ ...SAISIE, contacts: [{ categorie: 'personnalise', nom: 'X' }] })).toMatchObject({ ok: false });
    expect(validerSaisieCopropriete({ immeuble: ' ' })).toEqual({ ok: false, motif: 'Copropriété non désignée.' });
  });
});

describe('l’enregistrement', () => {
  it('🔴 une adresse déjà à une AUTRE copropriété : refus, et RIEN n’est écrit', async () => {
    h.coproDeCle['12 rue des lilas'] = { id: '9', cle: 'autre copro', libelle: 'Autre copro' };
    expect(await enregistrerCopropriete(SAISIE, AUTEUR)).toEqual({ ok: false, motif: '12 rue des Lilas, 75011 Paris est déjà une adresse de la copropriété « Autre copro ».' });
    expect(ecritures()).toEqual([]);
  });
  it('créée au premier « Valider » ; nom et « hors copropriété » ; la nouvelle adresse ajoutée ; le carnet par la porte commune', async () => {
    h.fiche = FICHE({ declaree: false, id: null, syndic: null });
    const r = await enregistrerCopropriete(SAISIE, AUTEUR);
    expect(r.ok).toBe(true);
    const e = ecritures().map((x) => x.s);
    expect([e.length, e[0].startsWith('INSERT INTO gestion_copropriete (cle_immeuble'), e[1].startsWith('UPDATE gestion_copropriete SET nom = $2'), e[2].startsWith('INSERT INTO gestion_copropriete_adresse')]).toEqual([3, true, true, true]);
    expect(ecritures()[1].p).toEqual(['7', 'Les Tilleuls', false, AUTEUR.libelle]);
    expect(h.contacts).toMatchObject([{ immeuble: 'Résidence Les Tilleuls', contacts: [{ categorie: 'coproprietaire', prenom: 'Léa' }] }]);
  });
  it('une adresse absente de la saisie est RETIRÉE (jamais effacée), avec le journal des biens qui perdent le syndic', async () => {
    h.enCours = [{ id: '40', cle: '12 rue des lilas', libelle: '12 rue des Lilas' }];
    await enregistrerCopropriete({ ...SAISIE, adresses: [] }, AUTEUR);
    expect(ecritures().some((x) => x.s.startsWith('UPDATE gestion_copropriete_adresse SET retire_le = now()'))).toBe(true);
    expect(ecritures().find((x) => x.s.includes("'syndic_retire'"))?.p[0]).toBe('1');
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('changer de syndic depuis la fiche : l’ancien lien FERMÉ (« changement de syndic »), ses gestionnaires détachés, le nouveau ouvert ; conflit confirmé noté', async () => {
    voisineDuCabinetB();
    await enregistrerCopropriete({ ...SAISIE, syndicId: 5, conflitsParcelle: [{ autre: '10 rue Voisine', parcelle: 'AB12' }] }, AUTEUR);
    const e = ecritures().map((x) => x.s);
    expect(e.some((s) => s.includes("fin_motif = 'changement de syndic'"))).toBe(true);
    expect(e.some((s) => s.startsWith('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()'))).toBe(true);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_syndic'))?.p).toEqual(['7', 5, 2, AUTEUR.libelle]);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_conflit'))?.p.slice(0, 5)).toEqual(['7', 5, '12', '9', 'AB12']);
  });
  it('le même syndic : aucun lien touché ; un syndic supprimé : refus avant toute écriture', async () => {
    await enregistrerCopropriete({ ...SAISIE, syndicId: 2 }, AUTEUR);
    expect(ecritures().some((x) => x.s.includes('gestion_copropriete_syndic'))).toBe(false);
    h.sql = []; h.syndicExiste = false;
    expect(await enregistrerCopropriete({ ...SAISIE, syndicId: 5 }, AUTEUR)).toEqual({ ok: false, motif: 'Ce syndic n’existe plus : choisissez-en un autre.' });
    expect(ecritures()).toEqual([]);
  });
  it('l’alerte « autres adresses de la parcelle » marquée vue une seule fois', async () => {
    await enregistrerCopropriete({ ...SAISIE, alerteParcelleVue: true }, AUTEUR);
    expect(ecritures().some((x) => x.s.includes('SET alerte_parcelle_le = now()') && x.s.includes('alerte_parcelle_le IS NULL'))).toBe(true);
  });
});

/** Sur la même parcelle : le 10 rue Voisine, copropriété du cabinet B (syndic 9). */
function voisineDuCabinetB(): void {
  h.parcelle = [{ cle: '10 rue voisine', libelle: '10 rue Voisine', codePostal: '75011', commune: 'Paris', parcelle: 'AB12' }];
  h.prise['10 rue voisine'] = { cle: '10 rue voisine', libelle: '10 rue Voisine', syndic_id: '9', syndic_nom: 'Cabinet B', syndic_ville: null };
  h.porteur['10 rue voisine'] = { id: '12', syndic: '9' };
}

describe('🔴🔴 le conflit de parcelle, depuis la fiche copropriété (la règle commune aux deux fiches)', () => {
  it('conflit posé : SANS la confirmation, refus clair AVANT toute écriture, avec la question à poser', async () => {
    voisineDuCabinetB();
    const r = await enregistrerCopropriete({ ...SAISIE, syndicId: 5 }, AUTEUR);
    expect(r).toMatchObject({ ok: false, motif: 'Conflit de parcelle non confirmé pour « Résidence Les Tilleuls » : sur la même parcelle, 10 rue Voisine, 75011 Paris (10 rue Voisine) est gérée par Cabinet B. Confirmez un autre syndic pour cette copropriété : rien n’est enregistré sans cette confirmation.',
      conflitsParcelle: [{ immeuble: 'Résidence Les Tilleuls', libelle: '10 rue Voisine', parcelle: 'AB12', syndic: { id: 9, nom: 'Cabinet B' } }] });
    expect(ecritures()).toEqual([]);
  });
  it('AVEC la confirmation : enregistré, le conflit noté (les deux copropriétés, leurs syndics, la parcelle)', async () => {
    voisineDuCabinetB();
    expect((await enregistrerCopropriete({ ...SAISIE, syndicId: 5, conflitsParcelle: [{ autre: '10 rue Voisine', parcelle: 'AB12' }] }, AUTEUR)).ok).toBe(true);
    expect(ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_conflit')).map((x) => x.p.slice(0, 5))).toEqual([['7', 5, '12', '9', 'AB12']]);
  });
  it('rattachée au syndic de la parcelle (même syndic), ou syndic inchangé : aucune question, aucun conflit noté', async () => {
    voisineDuCabinetB();
    h.fiche = FICHE({ contacts: [], nom: 'Les Tilleuls' });
    expect((await enregistrerCopropriete({ ...SAISIE, syndicId: 9 }, AUTEUR)).ok).toBe(true);
    expect((await enregistrerCopropriete({ ...SAISIE, syndicId: 2 }, AUTEUR)).ok).toBe(true);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete_conflit'))).toBe(false);
  });
});

describe('🔴🔴 (16/11/2026, option C) une nouvelle adresse est une adresse VÉRIFIÉE', () => {
  it('seules les NOUVELLES adresses sont vérifiées (ni la principale, ni celles déjà rattachées)', async () => {
    h.fiche = FICHE({ adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', principale: true }, { cle: '12 rue des lilas', libelle: '12 rue des Lilas', principale: false }] });
    await enregistrerCopropriete({ ...SAISIE, adresses: [...SAISIE.adresses, { libelle: '14 rue des Lilas', codePostal: '75011', commune: 'Paris' }] }, AUTEUR);
    expect(va.vues).toEqual([[{ libelle: '14 rue des Lilas', codePostal: '75011', commune: 'Paris' }]]);
  });
  it('introuvable (ni parcelle ni suggestions) ou service muet : REFUS clair, AVANT toute écriture — même pour un regroupement', async () => {
    va.issue = { ok: false, motif: 'L’adresse 99 rue Imaginaire est introuvable dans la Base Adresse Nationale : … Rien n’est enregistré.' };
    expect(await enregistrerCopropriete(SAISIE, AUTEUR)).toEqual(va.issue);
    expect(await enregistrerCopropriete({ ...SAISIE, regrouperAvec: '10 rue Voisine' }, AUTEUR)).toEqual(va.issue);
    expect(ecritures()).toEqual([]);
  });
});

describe('🔴 (16/11/2026) une adresse SANS NUMÉRO : acceptée seulement avec la confirmation de l’écran', () => {
  const RUE = { libelle: 'Rue Pierre Lhomme', codePostal: '92400', commune: 'COURBEVOIE' };
  it('sans confirmation : refus clair, AVANT toute écriture (et avant la vérification en ligne)', async () => {
    expect(await enregistrerCopropriete({ ...SAISIE, adresses: [...SAISIE.adresses, RUE] }, AUTEUR))
      .toEqual({ ok: false, motif: 'L’adresse Rue Pierre Lhomme, 92400 COURBEVOIE n’a pas de numéro : confirmez-la à l’écran (« Confirmer ») ou choisissez une adresse numérotée. Rien n’est enregistré.' });
    expect([ecritures(), va.vues]).toEqual([[], []]);
  });
  it('avec la confirmation : vérifiée puis enregistrée ; une adresse sans numéro DÉJÀ rattachée n’est pas revue', async () => {
    expect((await enregistrerCopropriete({ ...SAISIE, adresses: [...SAISIE.adresses, RUE], sansNumeroConfirmees: ['Rue Pierre Lhomme'] }, AUTEUR)).ok).toBe(true);
    expect(va.vues.at(-1)).toContainEqual(RUE);
    h.fiche = FICHE({ adresses: [{ cle: 'rue pierre lhomme', libelle: 'Rue Pierre Lhomme', principale: false }] });
    expect((await enregistrerCopropriete({ ...SAISIE, adresses: [RUE] }, AUTEUR)).ok).toBe(true);
  });
});

describe('🔴 (lot 3) les digicodes depuis la fiche copropriété', () => {
  const D = (batiments: { libelle: string; code: string; aucun?: boolean; confirme?: boolean }[], commun?: { code: string; aucun: boolean }) =>
    ({ ...SAISIE, digicodes: [{ cle: 'Résidence Les Tilleuls', ...(commun ? { commun } : {}), batiments: batiments.map((b) => ({ aucun: false, ...b })) }] });
  it('le commun et un bâtiment : écrits « depuis la fiche copropriété » ; le nouveau bâtiment entre au registre ; la règle connue est enregistrée', async () => {
    const r = await enregistrerCopropriete(D([{ libelle: 'Bât. B', code: 'B42' }], { code: '1234', aucun: false }), AUTEUR);
    expect(r.ok).toBe(true);
    expect(dg.ecrits.map((a) => [a[1], a[3], a[5]])).toEqual([[{ digicode: true, code: '1234' }, 'fiche_copropriete', null], [{ digicode: true, code: 'B42' }, 'fiche_copropriete', 'Bât. B']]);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment'))?.p.slice(0, 4)).toEqual(['7', 'b', 'B', 'lettre']);
    expect(ecritures().some((x) => x.s.includes('SET nomenclature_batiments = $2') && x.p[1] === 'lettres')).toBe(true);
  });
  it('« pas de digicode » = le « Non » d’avant ; un code vidé = plus rien de connu', async () => {
    await enregistrerCopropriete(D([{ libelle: 'A', code: '', aucun: true }], { code: '', aucun: false }), AUTEUR);
    expect(dg.ecrits.map((a) => a[1])).toEqual([{ digicode: null, code: null }, { digicode: false, code: null }]);
  });
  it('🔴 (lot D) mélange lettres / chiffres NON confirmé : refus avec le même message clair, AVANT toute écriture ; sans la 477 : refus, rien n’est écrit', async () => {
    expect(await enregistrerCopropriete(D([{ libelle: '2', code: 'X' }]), AUTEUR)).toEqual({ ok: false, motif: 'Cette copropriété nomme ses bâtiments par des LETTRES (A, B, C…) : utilisez une lettre, ou un intitulé libre (« Côté cour »).' });
    expect([ecritures(), dg.ecrits]).toEqual([[], []]);
    expect((await enregistrerCopropriete(D([{ libelle: 'Côté cour', code: 'X' }]), AUTEUR)).ok).toBe(true); // un intitulé libre : permis, sans confirmation
    h.sql = []; dg.ecrits = []; dg.avec477 = false;
    expect(await enregistrerCopropriete(D([{ libelle: 'B', code: 'X' }]), AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 477') });
    expect([ecritures(), dg.ecrits]).toEqual([[], []]);
  });
  it('🔴 (lot D) mélange CONFIRMÉ à l’écran : accepté, écrit, entré au registre ; la référence (lettres) n’est PAS changée par l’exception', async () => {
    const r = await enregistrerCopropriete(D([{ libelle: '2', code: '2222', confirme: true }]), AUTEUR);
    expect(r.ok).toBe(true);
    expect(dg.ecrits.map((a) => a[5])).toEqual(['2']);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment'))?.p.slice(1, 4)).toEqual(['2', '2', 'chiffre']);
    expect(ecritures().filter((x) => x.s.includes('SET nomenclature_batiments = $2')).map((x) => x.p[1])).toEqual(['lettres']); // la règle déjà en place, jamais « chiffres »
  });
  it('un code trop long : refusé dès la saisie ; une adresse qui n’est pas de la copropriété : refusée', async () => {
    expect((await enregistrerCopropriete(D([{ libelle: 'B', code: '123456789' }]), AUTEUR)).ok).toBe(false);
    expect(await enregistrerCopropriete({ ...SAISIE, digicodes: [{ cle: '99 rue Ailleurs', batiments: [{ libelle: 'B', code: '1', aucun: false }] }] }, AUTEUR))
      .toMatchObject({ ok: false, motif: expect.stringContaining('n’est pas (ou plus) une adresse de cette copropriété') });
    expect(dg.ecrits).toEqual([]);
  });
});

describe('🔴 (lot 6) « Même syndic : regrouper ? », déplacé de la fiche syndic', () => {
  const R = (o: Record<string, unknown> = {}) => ({ ...SAISIE, contacts: [], nom: null, regrouperAvec: '10 rue Voisine', ...o });
  beforeEach(() => { h.coproDeCle['10 rue voisine'] = { id: '12', cle: '10 rue voisine', libelle: '10 rue Voisine' }; h.fiche = FICHE({ declaree: false, id: null, contacts: [] }); });
  it('syndic différent : REFUS avant toute écriture', async () => {
    expect(await enregistrerCopropriete(R(), AUTEUR)).toEqual({ ok: false, motif: 'Le regroupement n’est possible qu’avec une copropriété du MÊME syndic.' });
    expect(ecritures()).toEqual([]);
  });
  it('même syndic : regroupée — adresses ajoutées à l’autre, adresses en cours retirées, lien fermé « regroupement », gestionnaires détachés', async () => {
    h.fiche = FICHE({ contacts: [], syndic: { id: 9, nom: 'Cabinet B', ville: null, depuis: '2026-01-01' } });
    h.liens = [{ id: '30', syndic_id: '9' }];
    const r = await enregistrerCopropriete(R(), AUTEUR);
    expect(r.ok).toBe(true);
    const e = ecritures();
    expect(e.filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse')).map((x) => [x.p[0], x.p[2]])).toEqual([['12', 'Résidence Les Tilleuls'], ['12', '12 rue des Lilas']]);
    expect(e.some((x) => x.s.startsWith('UPDATE gestion_copropriete_adresse SET retire_le = now()'))).toBe(true);
    expect(e.some((x) => x.s.includes("fin_motif = 'regroupement'"))).toBe(true);
    expect(e.some((x) => x.s.includes("retire_motif = 'regroupement'"))).toBe(true);
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('🔴 une copropriété qui a ses propres habitants (ou un nom) : REFUS — rien n’est déplacé automatiquement', async () => {
    h.fiche = FICHE({ syndic: { id: 9, nom: 'Cabinet B', ville: null, depuis: '2026-01-01' }, contacts: [{ id: 1, categorie: 'gardien', libelle: null, civilite: null, prenom: 'Paul', nom: 'Loge', note: null, coordonnees: [] }] });
    expect(await enregistrerCopropriete(R(), AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('le regroupement se fait à la main') });
    h.fiche = FICHE({ syndic: { id: 9, nom: 'Cabinet B', ville: null, depuis: '2026-01-01' }, contacts: [] });
    expect(await enregistrerCopropriete(R({ nom: 'Les Tilleuls' }), AUTEUR)).toMatchObject({ ok: false });
    expect(ecritures()).toEqual([]);
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 3) avec la 478 : le chemin serveur unique', () => {
  const D = (batiments: { libelle: string; code: string; aucun?: boolean; confirme?: boolean }[], commun?: { code: string; aucun: boolean }) =>
    ({ ...SAISIE, digicodes: [{ cle: 'Résidence Les Tilleuls', ...(commun ? { commun } : {}), batiments: batiments.map((b) => ({ aucun: false, ...b })) }] });
  it('« Valider » : la PREMIÈRE valeur de chaque place part en « saisie » par le chemin unique (jamais dans les anciennes tables) ; une place laissée vide n’écrit rien', async () => {
    un.avec478 = true;
    expect((await enregistrerCopropriete(D([{ libelle: 'B', code: 'B42' }, { libelle: 'C', code: '' }], { code: '1234', aucun: false }), AUTEUR)).ok).toBe(true);
    expect(un.ecrits.map((e) => [e.adresseCle, e.batiment, e.valeur, e.nature, e.origine])).toEqual([
      ['residence les tilleuls', null, { digicode: true, code: '1234' }, 'saisie', 'fiche_copropriete'], ['residence les tilleuls', 'B', { digicode: true, code: 'B42' }, 'saisie', 'fiche_copropriete']]);
    expect(dg.ecrits).toEqual([]);
  });
  it('un refus du chemin unique (code déjà connu) : RIEN n’est enregistré, le message est rendu', async () => {
    un.avec478 = true; un.issue = { ok: false, motif: 'Ce digicode est déjà connu (oui · code 1111) : …' };
    expect(await enregistrerCopropriete(D([], { code: '9999', aucun: false }), AUTEUR)).toEqual({ ok: false, motif: 'Ce digicode est déjà connu (oui · code 1111) : …' });
  });
  it('« Corriger une erreur » / « Garder ce code » : immédiats, à une adresse de la copropriété ; sinon refus ; sans la 478 : refus', async () => {
    un.avec478 = true;
    h.fiche = FICHE({ adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', principale: true }] });
    expect((await gesteDigicodeCopro({ immeuble: 'Résidence Les Tilleuls', adresseCle: 'Résidence Les Tilleuls', batiment: 'B', digicode: true, code: 'B7' }, 'correction', AUTEUR)).ok).toBe(true);
    expect((await gesteDigicodeCopro({ immeuble: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', batiment: '', digicode: false }, 'arbitrage', AUTEUR)).ok).toBe(true);
    expect(un.ecrits.map((e) => [e.adresseCle, e.batiment, e.nature, (e.copropriete as { cle: string }).cle])).toEqual([
      ['residence les tilleuls', 'B', 'correction', 'residence les tilleuls'], ['residence les tilleuls', null, 'arbitrage', 'residence les tilleuls']]);
    expect(await gesteDigicodeCopro({ immeuble: 'Résidence Les Tilleuls', adresseCle: '99 rue Ailleurs', digicode: true, code: '1' }, 'correction', AUTEUR))
      .toMatchObject({ ok: false, motif: expect.stringContaining('n’est pas (ou plus) une adresse de cette copropriété') });
    un.avec478 = false;
    expect((await gesteDigicodeCopro({ immeuble: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', digicode: true, code: '1' }, 'correction', AUTEUR)).ok).toBe(false);
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 5) « Modifier » : changements datés, tous ou aucun ; annulation d’un changement prévu', () => {
  beforeEach(() => { un.avec478 = true; h.fiche = FICHE({ adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', principale: true }] }); });
  const P = { immeuble: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', appliqueLe: '2026-11-20T08:00:00.000Z',
    changements: [{ batiment: null, digicode: true, code: 'Z7' }, { batiment: 'B', digicode: true, code: 'B9' }] };
  it('chaque code coché part en « changement », à la MÊME date d’application', async () => {
    expect((await gesteDigicodeCopro(P, 'planification', AUTEUR)).ok).toBe(true);
    expect(un.ecrits.map((e) => [e.batiment, e.valeur, e.nature, e.appliqueLe])).toEqual([
      [null, { digicode: true, code: 'Z7' }, 'changement', '2026-11-20T08:00:00.000Z'], ['B', { digicode: true, code: 'B9' }, 'changement', '2026-11-20T08:00:00.000Z']]);
  });
  it('un code refusé (date passée, changement déjà prévu…) : TOUT est annulé (refus levé), le message dit lequel', async () => {
    un.issue = ((e: Record<string, unknown>) => (e.batiment === 'B' ? { ok: false, motif: 'Un changement est déjà prévu pour ce digicode (…) : annulez-le d’abord. Rien n’est enregistré.' } : { ok: true, change: true, id: 1 })) as never;
    expect(await gesteDigicodeCopro(P, 'planification', AUTEUR)).toEqual({ ok: false, motif: 'Bâtiment B : Un changement est déjà prévu pour ce digicode (…) : annulez-le d’abord. Rien n’est enregistré.' });
  });
  it('une saisie incomplète est refusée avant toute écriture ; « Annuler ce changement » passe par le chemin unique', async () => {
    expect(await gesteDigicodeCopro({ ...P, changements: [] }, 'planification', AUTEUR)).toEqual({ ok: false, motif: 'Choisissez au moins un digicode qui change.' });
    expect(un.ecrits).toEqual([]);
    expect((await gesteDigicodeCopro({ immeuble: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', ligneId: 42 }, 'annulation', AUTEUR)).ok).toBe(true);
    expect(un.ecrits).toEqual([{ annulation: 42, adresseCle: 'residence les tilleuls' }]);
  });
});
