import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 2) — l'écriture : refus avant toute écriture, création au premier « Valider », jamais d'effacement. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], coproDeCle: {} as Record<string, { id: string; cle: string; libelle: string }>, syndicExiste: true,
  liens: [] as { id: string; syndic_id: string }[], enCours: [] as { id: string; cle: string; libelle: string }[], contacts: [] as unknown[], fiche: null as unknown,
  parcelle: [] as unknown[], prise: {} as Record<string, unknown>, porteur: {} as Record<string, unknown>,
  actuelles: [] as { cle: string; libelle: string; code_postal: string | null; commune: string | null; deja: boolean }[] }));
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
  // 🔴 (26/11/2026) les adresses secondaires en cours après l'enregistrement, et si elles sont déjà confirmées depuis leur rattachement
  if (s.startsWith('SELECT a.cle_immeuble AS cle, a.libelle, a.code_postal, a.commune, EXISTS')) return { rows: h.actuelles };
  if (s.startsWith('SELECT syndic_id::text AS syndic FROM gestion_copropriete_syndic')) return { rows: [{ syndic: '9' }] };
  if (s.startsWith('SELECT immeuble, adresse, code_postal AS cp, commune FROM gestion_annuaire_lot WHERE id = $1')) {
    return { rows: p[0] === 451 ? [{ immeuble: 'Résidence Les Tilleuls', adresse: '3 allée des Tilleuls', cp: '75011', commune: 'Paris' }]
      : p[0] === 9 ? [{ immeuble: '99 rue Ailleurs', adresse: '99 rue Ailleurs', cp: '75011', commune: 'Paris' }] : [] };
  }
  if (s.startsWith('SELECT id::text, immeuble FROM gestion_annuaire_lot')) return { rows: [{ id: '1', immeuble: '12 rue des Lilas' }] };
  if (s.startsWith('SELECT coalesce(a.ban_id, c.ban_id) AS ban')) return { rows: bn.autre ? [bn.autre] : [] };
  if (s.startsWith('SELECT libelle, arrete_comptes_jour AS jour')) return { rows: [{ libelle: 'Résidence Les Tilleuls', jour: null, mois: null, le: null, par: null }] };
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
  annulerChangement: async (_q: unknown, adresseCle: string, id: number) => { un.ecrits.push({ annulation: id, adresseCle }); return { ok: true, change: true, id }; },
  retirerDigicode: async (_q: unknown, e: Record<string, unknown>) => { un.ecrits.push({ retrait: e }); return { ok: true, change: true, id: 3 }; } }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: h.parcelle }) }));
const va = vi.hoisted(() => ({ vues: [] as unknown[][], issue: { ok: true } as { ok: true } | { ok: false; motif: string } }));
vi.mock('./verificationAdresseRepo', () => ({ verifierAdresses: async (a: unknown[]) => { va.vues.push(a); return va.issue; } }));
// 🔴 (lot 0) le retrait d'une adresse depuis la fiche passe par le regroupement (504) : l'appel est observé ici, son effet est éprouvé à part
const rg = vi.hoisted(() => ({ appels: [] as unknown[][] }));
vi.mock('./regroupementCoproprietesRepo', () => ({ noterRetraitDAdressesRegroupees: async (_q: unknown, ...a: unknown[]) => { rg.appels.push(a); return []; } }));
// 🔴 (20/11/2026, journal des syndics) les gestes du journal, observés (leur écriture est éprouvée dans journalSyndicCopro.test.ts)
const js = vi.hoisted(() => ({ gestes: [] as Record<string, unknown>[] }));
vi.mock('./journalSyndicCopro', () => ({ journaliserLienSyndic: async (_q: unknown, g: Record<string, unknown>) => { js.gestes.push(g); } }));
// 🔴 (lot 7a) le format unique : l'identifiant BAN d'une nouvelle adresse retrouvée avec certitude (aucun par défaut : les épreuves d'avant)
const bn = vi.hoisted(() => ({ ids: {} as Record<string, string>, dispo: false, autre: null as null | { ban: string; libelle: string } }));
vi.mock('../adresse/adresseSaisieRepo', () => ({ banIdDeLAdresse: async (a: { libelle: string }) => bn.ids[a.libelle] ?? null, formatUniqueDisponible: async () => bn.dispo }));
// 🔴 (Arno, 23/11/2026) les sondes des migrations 481 (AG) et 512 (arrêté des comptes), et le nom de l'auteur
const sl = vi.hoisted(() => ({ dispo: true }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => sl.dispo }));
vi.mock('../location/mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nomFamille: 'Jorel' }) }));
import { enregistrerCopropriete, gesteDigicodeCopro, reponseGesteDigicode, validerSaisieCopropriete } from './coproprieteEcritureRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const FICHE = (o: Record<string, unknown> = {}) => ({ cle: 'residence les tilleuls', declaree: true, id: 7, libelle: 'Résidence Les Tilleuls', nom: null, horsCopropriete: false, nomenclature: null,
  codePostal: '75011', commune: 'Paris', adresses: [], digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: null, code: null }, batiments: [] }],
  batimentsConnus: [{ cle: 'a', libelle: 'A', sorte: 'lettre' }], nomenclatureEffective: 'lettres', saisieDigicodes: true, syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' }, gestionnaires: [], contacts: [], biens: [], desaccord: false, avec476: true, ...o });
const SAISIE = { immeuble: 'Résidence Les Tilleuls', nom: 'Les Tilleuls', horsCopropriete: false, adresses: [{ libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris' }],
  contacts: [{ id: null, categorie: 'coproprietaire', civilite: 'Mme', prenom: 'Léa', nom: 'Martin', coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.test' }] }] };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { sl.dispo = true; bn.ids = {}; bn.dispo = false; bn.autre = null; dg.avec477 = true; dg.ecrits = []; h.sql = []; h.coproDeCle = {}; h.syndicExiste = true; h.liens = [{ id: '30', syndic_id: '2' }]; h.enCours = []; h.contacts = []; h.fiche = FICHE(); h.parcelle = []; h.prise = {}; h.porteur = {}; h.actuelles = []; va.vues = []; va.issue = { ok: true }; un.avec478 = false; un.ecrits = []; un.issue = { ok: true, change: true, id: 1 }; });

describe('la saisie', () => {
  it('adresses dédoublonnées, statuts du carnet validés (Copropriétaire accepté ; Personnaliser exige son texte), syndic', () => {
    const v = validerSaisieCopropriete({ ...SAISIE, adresses: [...SAISIE.adresses, { libelle: '12  RUE des lilas' }], syndicId: 4 });
    expect(v.ok && [v.saisie.adresses.length, v.saisie.contacts?.[0].categorie, v.saisie.syndicId]).toEqual([1, 'coproprietaire', 4]);
    expect(validerSaisieCopropriete({ ...SAISIE, contacts: [{ categorie: 'personnalise', nom: 'X' }] })).toMatchObject({ ok: false });
    expect(validerSaisieCopropriete({ immeuble: ' ' })).toEqual({ ok: false, motif: 'Copropriété non désignée.' });
  });
});

describe('l’enregistrement', () => {
  it('🔴 (lot 7a) une NOUVELLE adresse retrouvée avec certitude reçoit son identifiant BAN ; non retrouvée : aucun (pas de supposition)', async () => {
    h.fiche = FICHE({ declaree: false, id: null, syndic: null });
    bn.ids = { '12 rue des Lilas': '75111_5555_00012' };
    expect((await enregistrerCopropriete(SAISIE, AUTEUR)).ok).toBe(true);
    const ins = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))!;
    expect(ins.s).toContain('cree_par_libelle, ban_id)');
    expect(ins.p).toEqual(['7', '12 rue des lilas', '12 rue des Lilas', '75011', 'Paris', 2, AUTEUR.libelle, '75111_5555_00012']);
    h.sql = []; bn.ids = {};
    expect((await enregistrerCopropriete(SAISIE, AUTEUR)).ok).toBe(true);
    const sans = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))!;
    expect(sans.s).not.toContain('ban_id');
    expect(sans.p).toHaveLength(7);
  });
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
    expect([e.length, e[0].startsWith('INSERT INTO gestion_copropriete (cle_immeuble'), e[1].startsWith('UPDATE gestion_copropriete SET nom = $2'), e[2].startsWith('INSERT INTO gestion_copropriete_adresse')]).toEqual([4, true, true, true]);
    expect(e[3]).toMatch(/^INSERT INTO gestion_journal .*'adresse_ajoutee'/); // 🔴 (lot 7d) l'ajout journalisé
    expect(ecritures()[1].p).toEqual(['7', 'Les Tilleuls', false, AUTEUR.libelle]);
    expect(h.contacts).toMatchObject([{ immeuble: 'Résidence Les Tilleuls', contacts: [{ categorie: 'coproprietaire', prenom: 'Léa' }] }]);
  });
  it('une adresse absente de la saisie est RETIRÉE (jamais effacée), avec le journal des biens qui perdent le syndic', async () => {
    h.enCours = [{ id: '40', cle: '12 rue des lilas', libelle: '12 rue des Lilas' }];
    rg.appels = [];
    await enregistrerCopropriete({ ...SAISIE, adresses: [] }, AUTEUR);
    expect(ecritures().some((x) => x.s.startsWith('UPDATE gestion_copropriete_adresse SET retire_le = now()'))).toBe(true);
    // 🔴 (lot 0) jamais en silence pour une adresse de regroupement : les adresses retirées passent par le regroupement, avec l'écran d'origine
    expect(rg.appels).toEqual([[['40'], 'depuis la fiche copropriété', AUTEUR]]);
    expect(ecritures().find((x) => x.s.includes("'syndic_retire'"))?.p[0]).toBe('1');
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  // 🔴🔴 (Arno, 26/11/2026, 11h58, point 1) « chaque geste est journalisé dans l'historique de la copropriété »
  it('🔴 26/11 : le retrait d’une adresse entre au journal de la copropriété (« adresse_retiree ») ; rien n’est effacé', async () => {
    h.enCours = [{ id: '40', cle: '12 rue des lilas', libelle: '12 rue des Lilas' }];
    await enregistrerCopropriete({ ...SAISIE, adresses: [] }, AUTEUR);
    const j = ecritures().find((x) => x.s.includes("'adresse_retiree'"))!;
    expect(j.s).toContain("INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_retiree'");
    expect(j.p).toEqual(['7', '12 rue des lilas', 'Adresse retirée de la copropriété : 12 rue des Lilas', 2, AUTEUR.libelle]);
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('🔴 26/11 : « Confirmer cette adresse » : une ligne « adresse_confirmee » par adresse confirmée, en cours et pas déjà confirmée ; rien d’autre', async () => {
    h.enCours = [{ id: '40', cle: '12 rue des lilas', libelle: '12 rue des Lilas' }];
    h.actuelles = [{ cle: '12 rue des lilas', libelle: '12 rue des Lilas', code_postal: '75011', commune: 'Paris', deja: false },
      { cle: '14 rue des lilas', libelle: '14 rue des Lilas', code_postal: '75011', commune: 'Paris', deja: true }];
    const v = validerSaisieCopropriete({ ...SAISIE, adressesConfirmees: ['12 rue des Lilas', '14 rue des Lilas', '99 rue Inconnue'] });
    expect(v.ok && v.saisie.adressesConfirmees).toEqual(['12 rue des lilas', '14 rue des lilas', '99 rue inconnue']);
    await enregistrerCopropriete({ ...SAISIE, adressesConfirmees: ['12 rue des Lilas', '14 rue des Lilas', '99 rue Inconnue'] }, AUTEUR);
    const j = ecritures().filter((x) => x.s.includes("'adresse_confirmee'"));
    expect(j.map((x) => x.p)).toEqual([['7', '12 rue des lilas', 'Adresse confirmée (vérifiée à l’écran) : 12 rue des Lilas, 75011 Paris', 2, AUTEUR.libelle]]);
    // sans confirmation : la lecture n'est même pas faite
    h.sql = [];
    await enregistrerCopropriete(SAISIE, AUTEUR);
    expect(h.sql.some((x) => x.s.startsWith('SELECT a.cle_immeuble AS cle, a.libelle, a.code_postal, a.commune, EXISTS'))).toBe(false);
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
  it('🔴 le journal des syndics : changer de syndic = « remplacé » (avec l’ancien) ; rattacher sans syndic = « rattaché » ; même syndic : rien', async () => {
    js.gestes = [];
    await enregistrerCopropriete({ ...SAISIE, syndicId: 5 }, AUTEUR);
    expect(js.gestes).toEqual([{ coproId: '7', nature: 'remplace', syndicId: 5, ancienSyndicId: 2, ecran: 'la fiche copropriété' }]);
    js.gestes = []; h.liens = []; h.fiche = FICHE({ syndic: null });
    await enregistrerCopropriete({ ...SAISIE, syndicId: 5 }, AUTEUR);
    expect(js.gestes).toEqual([{ coproId: '7', nature: 'rattache', syndicId: 5, ancienSyndicId: null, ecran: 'la fiche copropriété' }]);
    js.gestes = []; h.fiche = FICHE();
    await enregistrerCopropriete({ ...SAISIE, syndicId: 2 }, AUTEUR);
    expect(js.gestes).toEqual([]);
  });
  // 🔴🔴 (Arno, 20/11/2026) « Retirer le syndic » (préparé dans la modale, appliqué à « Valider »)
  it('RETIRER SEUL : le lien FERMÉ (« retrait du syndic »), ses contacts détachés (fonction unique, motif lié), journal « retiré » ; rien d’effacé, aucun lien ouvert', async () => {
    js.gestes = [];
    await enregistrerCopropriete({ ...SAISIE, syndicId: null, retirerSyndic: true }, AUTEUR);
    const e = ecritures();
    expect(e.some((x) => x.s.includes("fin_motif = 'retrait du syndic'"))).toBe(true);
    expect(e.some((x) => x.s.startsWith('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()') && x.p.includes('syndic retiré de la copropriété'))).toBe(true);
    expect(e.some((x) => x.s.startsWith('INSERT INTO gestion_copropriete_syndic'))).toBe(false);
    expect(e.some((x) => /^UPDATE gestion_syndic_contact SET|^DELETE/.test(x.s))).toBe(false);
    expect(js.gestes).toEqual([{ coproId: '7', nature: 'retire', syndicId: 2, ecran: 'la fiche copropriété', motif: 'retrait du syndic' }]);
  });
  it('RETIRER + un autre syndic : le chemin du changement (« remplacé », contacts de l’ancien détachés) — un seul lien fermé', async () => {
    js.gestes = [];
    await enregistrerCopropriete({ ...SAISIE, syndicId: 5, retirerSyndic: true }, AUTEUR);
    expect(ecritures().filter((x) => x.s.startsWith('UPDATE gestion_copropriete_syndic SET fin = now()'))).toHaveLength(1);
    expect(js.gestes).toEqual([{ coproId: '7', nature: 'remplace', syndicId: 5, ancienSyndicId: 2, ecran: 'la fiche copropriété' }]);
  });
  it('SANS « retirerSyndic » (ou sans syndic en cours) : aucun lien touché', async () => {
    await enregistrerCopropriete({ ...SAISIE, syndicId: null }, AUTEUR);
    expect(ecritures().some((x) => x.s.includes('gestion_copropriete_syndic'))).toBe(false);
    h.fiche = FICHE({ syndic: null });
    await enregistrerCopropriete({ ...SAISIE, syndicId: null, retirerSyndic: true }, AUTEUR);
    expect(ecritures().some((x) => x.s.includes('gestion_copropriete_syndic'))).toBe(false);
    expect(validerSaisieCopropriete({ ...SAISIE, retirerSyndic: true })).toMatchObject({ ok: true, saisie: { retirerSyndic: true } });
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
  // 🔴🔴 (Arno, 26/11/2026, 11h58, point 2) « un digicode pour chacune des adresses de la copropriété » — y compris celle rattachée dans ce « Valider »
  it('🔴 26/11 : une adresse rattachée DANS CE « Valider » a ses digicodes : le code de l’adresse et une cage, écrits à SON adresse, après son ajout', async () => {
    const r = await enregistrerCopropriete({ ...SAISIE, digicodes: [{ cle: '12 rue des lilas', commun: { code: '1212', aucun: false }, batiments: [{ libelle: 'Cage 1', code: 'C1', aucun: false }] }] }, AUTEUR);
    expect(r.ok).toBe(true);
    expect(dg.ecrits.map((a) => [a[0], a[1], a[5]])).toEqual([
      [{ voie: '12 rue des Lilas', codePostal: '75011', commune: 'Paris' }, { digicode: true, code: '1212' }, null],
      [{ voie: '12 rue des Lilas', codePostal: '75011', commune: 'Paris' }, { digicode: true, code: 'C1' }, 'Cage 1']]);
    // l'adresse est ajoutée AVANT ses digicodes (même transaction)
    const i = h.sql.findIndex((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'));
    expect(i).toBeGreaterThanOrEqual(0);
    // une adresse ni enregistrée ni dans la saisie : toujours refusée
    dg.ecrits = []; h.sql = [];
    expect(await enregistrerCopropriete({ ...SAISIE, digicodes: [{ cle: '99 rue ailleurs', commun: { code: '1', aucun: false }, batiments: [] }] }, AUTEUR))
      .toMatchObject({ ok: false, motif: expect.stringContaining('n’est pas (ou plus) une adresse de cette copropriété') });
    expect([dg.ecrits, ecritures()]).toEqual([[], []]);
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
    // 🔴 (20/11/2026) les gestionnaires détachés par la fonction unique (detacherContactsDeLAncienSyndic) : le motif est un paramètre lié
    expect(e.some((x) => x.s.startsWith('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()') && x.p.includes('regroupement'))).toBe(true);
    expect(h.sql.some((x) => x.s.startsWith('DELETE'))).toBe(false);
    // 🔴 (20/11/2026) le journal des syndics : le syndic quitte cette copropriété, qui rejoint l'autre
    expect(js.gestes.at(-1)).toEqual({ coproId: 7, nature: 'retire', syndicId: 9, ecran: 'la fiche copropriété (« Même syndic : regrouper ? »)', motif: 'regroupement avec la copropriété 10 rue Voisine' });
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

/** 🔴 (Arno, 17/11/2026 — « Annuler ce changement ») la réponse d'un geste de digicode, la même pour toutes les routes (Location, fiche du bien, fiche Copropriété) */
describe('🔴 la réponse d’un geste de digicode', () => {
  it('fait : « etat: ok » (l’écran relit les codes) ; refusé : « etat: refus » avec son motif', () => {
    expect(reponseGesteDigicode({ ok: true, fiche: { cle: 'x' } as never })).toEqual({ etat: 'ok', data: { cle: 'x' } });
    expect(reponseGesteDigicode({ ok: false, motif: 'Refusé : …' })).toEqual({ etat: 'refus', motif: 'Refusé : …' });
  });
});

/**
 * 🔴🔴 Décision d'Arno (17/11/2026) — « Un retrait de code fait depuis la fiche du bien (« Nouveau bien », « Modifier le bien », fiche du bien Gestion) est noté
 * avec l'origine « fiche du bien » ET écrit une ligne dans le journal propre du bien (même logique que les PV d'AG, ec7ee478). »
 */
describe('🔴 le retrait d’un code : l’origine et le bien, dits par la route', () => {
  const R = { immeuble: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', batiment: 'B' };
  beforeEach(() => { un.avec478 = true; un.ecrits = []; h.fiche = FICHE({ adresses: [{ cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', principale: true }] }); });
  it('fiche Copropriété : origine « fiche_copropriete », aucun bien (même si le corps en nomme un)', async () => {
    expect((await gesteDigicodeCopro({ ...R, lotId: 451 }, 'retrait', AUTEUR)).ok).toBe(true);
    expect(un.ecrits).toEqual([{ retrait: expect.objectContaining({ batiment: 'B', origine: 'fiche_copropriete', lotId: null }) }]);
  });
  it('fiche du bien (« Modifier le bien », fiche du bien Gestion) : origine « fiche_bien » et le bien (son journal) ; « Nouveau bien » (pas encore de bien) : origine « fiche_bien », sans journal', async () => {
    expect((await gesteDigicodeCopro({ ...R, lotId: 451 }, 'retrait', AUTEUR, 'fiche_bien')).ok).toBe(true);
    expect((await gesteDigicodeCopro(R, 'retrait', AUTEUR, 'fiche_bien')).ok).toBe(true);
    expect(un.ecrits).toEqual([{ retrait: expect.objectContaining({ origine: 'fiche_bien', lotId: 451 }) }, { retrait: expect.objectContaining({ origine: 'fiche_bien', lotId: null }) }]);
  });
  it('un bien d’une autre adresse (ou inconnu) : refus, rien n’est écrit', async () => {
    expect(await gesteDigicodeCopro({ ...R, lotId: 9 }, 'retrait', AUTEUR, 'fiche_bien')).toEqual({ ok: false, motif: 'Ce bien n’est pas à cette adresse : rechargez la fiche. Rien n’est enregistré.' });
    expect((await gesteDigicodeCopro({ ...R, lotId: 12345 }, 'retrait', AUTEUR, 'fiche_bien')).ok).toBe(false);
    expect(un.ecrits).toEqual([]);
  });
});

describe('🔴🔴 (Arno, 20/11/2026, lot 7d) le « + » de la fiche copropriété : une adresse OFFICIELLE seulement', () => {
  beforeEach(() => { h.fiche = FICHE({ declaree: false, id: null, syndic: null }); bn.dispo = true; });
  it('une adresse sans identifiant BAN (non retrouvée avec certitude, aucun choix dans la liste) : refus clair, RIEN n’est écrit', async () => {
    expect(await enregistrerCopropriete(SAISIE, AUTEUR)).toEqual({ ok: false, motif: '12 rue des Lilas, 75011 Paris n’est pas une adresse officielle retrouvée avec certitude : choisissez-la dans la liste proposée (Base Adresse Nationale). Rien n’est ajouté.' });
    expect(ecritures()).toEqual([]);
  });
  it('l’identifiant du choix dans la liste est retenu quand la Base locale ne la connaît pas (la vérification nationale l’a confirmée)', async () => {
    expect((await enregistrerCopropriete({ ...SAISIE, adresses: [{ ...SAISIE.adresses[0], banId: '75111_9999_00012' }] }, AUTEUR)).ok).toBe(true);
    expect(ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_adresse'))!.p[7]).toBe('75111_9999_00012');
  });
  it('une adresse officielle déjà portée par une AUTRE copropriété : refus qui NOMME cette copropriété, rien n’est écrit', async () => {
    bn.ids = { '12 rue des Lilas': '75111_5555_00012' }; bn.autre = { ban: '75111_5555_00012', libelle: 'Résidence Voisine' };
    expect(await enregistrerCopropriete(SAISIE, AUTEUR)).toEqual({ ok: false, motif: '12 rue des Lilas, 75011 Paris est déjà l’adresse officielle de la copropriété « Résidence Voisine » : elle ne peut pas être ajoutée ici. Rien n’est ajouté.' });
    expect(ecritures()).toEqual([]);
  });
  it('chaque ajout est journalisé sur la copropriété, avec son adresse officielle', async () => {
    bn.ids = { '12 rue des Lilas': '75111_5555_00012' };
    expect((await enregistrerCopropriete(SAISIE, AUTEUR)).ok).toBe(true);
    const j = ecritures().filter((x) => x.s.startsWith('INSERT INTO gestion_journal') && x.s.includes("'adresse_ajoutee'"));
    expect(j.map((x) => [x.p[0], x.p[1], x.p[2]])).toEqual([['7', '75111_5555_00012', 'Adresse ajoutée à la copropriété : 12 rue des Lilas, 75011 Paris (adresse officielle 75111_5555_00012)']]);
  });
});

/**
 * 🔴🔴 Arno (23/11/2026) — fiche Copropriété NOUVELLE : « ces saisies sont enregistrées avec la copropriété au « Valider » (tout ou rien) » ; une fiche
 * existante : comme aujourd'hui (même table gestion_copropriete_ag, même journal).
 */
describe('🔴🔴 fiche nouvelle : arrêté des comptes et AG officielles avec le premier « Valider »', () => {
  const NOUVELLE = { ...SAISIE, adresses: [], contacts: [], arrete: { jour: '31', mois: '12' }, ags: [{ date: '2026-03-25', nature: 'ago' }, { date: '2999-03-15', nature: 'age', note: ' convocation reçue ' }] };
  it('écrits DANS la transaction qui crée la copropriété : l’arrêté (journalisé) et les AG (tenue : dernière ; à venir : prochaine), toutes officielles', async () => {
    h.fiche = FICHE({ declaree: false, id: null, syndic: null });
    expect((await enregistrerCopropriete(NOUVELLE, AUTEUR)).ok).toBe(true);
    const w = ecritures();
    const iCopro = w.findIndex((x) => x.s.startsWith('INSERT INTO gestion_copropriete ('));
    const arrete = w.findIndex((x) => x.s.startsWith('UPDATE gestion_copropriete SET arrete_comptes_jour'));
    expect(iCopro).toBeGreaterThanOrEqual(0);
    expect(arrete).toBeGreaterThan(iCopro);
    expect(w[arrete].p).toEqual(['7', 31, 12, 'Arnaud JOREL']); // (23/11/2026) prénom NOM de l'auteur, comme pour les AG
    const journal = w.find((x) => x.s.startsWith('INSERT INTO gestion_journal') && x.p.includes('31/12'))!;
    expect(journal.s).toContain("'copropriete', $1, 'copropriete_arrete_comptes'");
    const ags = w.filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_ag'));
    expect(ags.map((x) => x.p)).toEqual([['7', 'derniere', '2026-03-25', 2, 'Arnaud JOREL', 'ago', null], ['7', 'prochaine', '2999-03-15', 2, 'Arnaud JOREL', 'age', 'convocation reçue']]);
    for (const x of ags) expect(x.s).toContain("'officielle', $3::date, 'fiche_copropriete'");
  });
  it('refus AVANT toute écriture : un arrêté ou une AG invalide, ou sans la 481 — rien n’est écrit, pas même la copropriété', async () => {
    h.fiche = FICHE({ declaree: false, id: null, syndic: null });
    expect(await enregistrerCopropriete({ ...NOUVELLE, arrete: { jour: '31', mois: '2' } }, AUTEUR)).toMatchObject({ ok: false });
    expect(await enregistrerCopropriete({ ...NOUVELLE, ags: [{ date: '2026-03-25' }] }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('AG : Choisissez le type') });
    sl.dispo = false;
    expect(await enregistrerCopropriete({ ...NOUVELLE, arrete: null }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 481') });
    expect(ecritures()).toEqual([]);
  });
  it('une fiche DÉJÀ enregistrée : « Valider » n’écrit ni arrêté ni AG (ses propres gestes le font, tout de suite)', async () => {
    expect((await enregistrerCopropriete(NOUVELLE, AUTEUR)).ok).toBe(true);
    expect(ecritures().some((x) => x.s.startsWith('INSERT INTO gestion_copropriete_ag') || x.s.includes('arrete_comptes_jour'))).toBe(false);
  });
});
