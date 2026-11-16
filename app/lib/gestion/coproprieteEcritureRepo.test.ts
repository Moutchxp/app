import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 2) — l'écriture : refus avant toute écriture, création au premier « Valider », jamais d'effacement. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], coproDeCle: {} as Record<string, { id: string; cle: string; libelle: string }>, syndicExiste: true,
  liens: [] as { id: string; syndic_id: string }[], enCours: [] as { id: string; cle: string; libelle: string }[], contacts: [] as unknown[], fiche: null as unknown }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
  const s = norm(sql); h.sql.push({ s, p });
  if (s.startsWith('SELECT c.id::text, c.cle_immeuble AS cle, c.libelle FROM gestion_copropriete c')) { const x = h.coproDeCle[p[0] as string]; return { rows: x ? [x] : [] }; }
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
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: [] }) }));
import { enregistrerCopropriete, validerSaisieCopropriete } from './coproprieteEcritureRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const FICHE = (o: Record<string, unknown> = {}) => ({ cle: 'residence les tilleuls', declaree: true, id: 7, libelle: 'Résidence Les Tilleuls', nom: null, horsCopropriete: false, nomenclature: null,
  codePostal: '75011', commune: 'Paris', adresses: [], syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris', depuis: '2026-01-01' }, gestionnaires: [], contacts: [], biens: [], desaccord: false, avec476: true, ...o });
const SAISIE = { immeuble: 'Résidence Les Tilleuls', nom: 'Les Tilleuls', horsCopropriete: false, adresses: [{ libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris' }],
  contacts: [{ id: null, categorie: 'coproprietaire', civilite: 'Mme', prenom: 'Léa', nom: 'Martin', coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.test' }] }] };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.sql = []; h.coproDeCle = {}; h.syndicExiste = true; h.liens = [{ id: '30', syndic_id: '2' }]; h.enCours = []; h.contacts = []; h.fiche = FICHE(); });

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
    h.coproDeCle['10 rue voisine'] = { id: '12', cle: '10 rue voisine', libelle: '10 rue Voisine' };
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
