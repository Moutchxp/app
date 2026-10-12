import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LE DÉPÔT, SUR UNE BASE SIMULÉE ══════════════════════════
 * 🔒 Données de banc : la base est simulée (aucune lecture ni écriture réelle), la fiche et l'enregistrement d'un
 * syndic aussi.
 */
const appels: Array<{ sql: string; params: unknown[] }> = [];
let journal: Array<{ lot: string; syndic: string }> = [];
const COPROS = [
  { id: '7', cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', code_postal: '92400', commune: 'COURBEVOIE', sid: '2', snom: 'TEST ARNAUD', sville: 'Asnieres' },
  { id: '9', cle: '27 rue edith cavell', libelle: '27 rue Edith Cavell', code_postal: '92400', commune: 'COURBEVOIE', sid: '3', snom: 'CABINET B', sville: 'Paris' },
];
const LOTS = [
  { id: '176', numero: '219', immeuble: '25 rue Edith Cavell', adresse: '25 rue Edith Cavell', code_postal: '92400', commune: 'COURBEVOIE' },
  /* Le même immeuble, écrit autrement dans l'export : sa clé d'immeuble diffère, il n'a donc PAS de syndic. */
  { id: '500', numero: '901', immeuble: '25, r. Edith-Cavell', adresse: '25 r. Edith-Cavell', code_postal: '92400', commune: 'COURBEVOIE' },
  { id: '501', numero: '902', immeuble: null, adresse: '25 rue Edith Cavell', code_postal: '92400', commune: 'COURBEVOIE' },
  { id: '502', numero: '903', immeuble: '1 rue Ailleurs', adresse: '1 rue Ailleurs', code_postal: '75001', commune: 'PARIS' },
];
const repondre = (sql: string): { rows: unknown[] } => {
  if (sql.includes('FROM gestion_copropriete c') && sql.includes('JOIN gestion_copropriete_syndic cs')) return { rows: COPROS };
  if (sql.includes('FROM gestion_copropriete_adresse a')) return { rows: [] };
  if (sql.includes('FROM gestion_annuaire_lot lo WHERE lo.absent_le IS NULL')) return { rows: LOTS };
  if (sql.includes('FROM gestion_journal j')) return { rows: journal };
  if (sql.includes('SELECT id::text FROM gestion_annuaire_lot WHERE id = $1')) return { rows: [{ id: '500' }] };
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) => fn(async (sql: string) => repondre(sql))),
}));
const parcelle = vi.fn(async () => ({ parcelles: [] as string[], adresses: [] as Array<{ cle: string; libelle: string }> }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: (...a: unknown[]) => parcelle(...(a as [])) }));
const enregistrer = vi.fn(async () => ({ ok: true as const, id: 2 }));
vi.mock('./syndicRepo', async (orig) => ({
  ...(await orig<typeof import('./syndicRepo')>()),
  ficheSyndic: vi.fn(async () => ({
    id: 2, nom: 'TEST ARNAUD', adresse: '8 rue Denfert', codePostal: '92600', ville: 'Asnieres', telephone: '0613861877',
    telephone2: null, email: 'arnaud.jorel@gmail.com', note: null, creeLe: '', creeParLibelle: 'a', majLe: null, majParLibelle: null,
    noteBien: null, anciens: [], historique: [],
    contacts: [{ id: 51, titre: 'Responsable de copropriété', prenom: 'Arnaud', nom: 'JOREL', civilite: 'M.', tousImmeubles: false,
      immeubles: ['25 rue edith cavell'], coordonnees: [{ id: 1, sorte: 'email', libelle: null, valeur: 'arnaud.jorel@gmail.com' }] }],
    coproprietes: [{ id: 7, cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', debut: '', lots: [], codePostal: '92400', commune: 'COURBEVOIE', adresses: [] }],
  })),
  enregistrerSyndic: (...a: unknown[]) => enregistrer(...(a as [])),
}));

const { syndicsConnusPourAdresse, propositionPourBien, biensAvecProposition, rattacherBienAuSyndic, ignorerProposition } =
  await import('./doublonSyndicRepo');
const auteur = { id: 2, libelle: 'a.jorel@sansvisavis.com' };

beforeEach(() => { appels.length = 0; journal = []; parcelle.mockClear(); enregistrer.mockClear(); });

describe('🔴🔴 PARTIE 2 — un syndic déjà connu pour la même adresse postale', () => {
  it('la même adresse écrite autrement : sa copropriété ET le bien du portefeuille qui en relève', async () => {
    const r = await syndicsConnusPourAdresse({ libelle: '25 r. Edith-Cavell', codePostal: '92400', commune: 'Courbevoie' });
    expect(r.map((s) => [s.syndic.nom, s.copro.cle, s.via, s.biens.map((b) => b.numero)]))
      .toEqual([['TEST ARNAUD', '25 rue edith cavell', ['copropriete', 'bien'], ['219']]]);
  });
  it('le syndic qu’on vient de retirer n’est jamais reproposé ; le bien d’où l’on vient n’est pas cité', async () => {
    expect(await syndicsConnusPourAdresse({ libelle: '25 rue Edith Cavell', codePostal: '92400', commune: '' }, { exclureSyndic: 2 })).toEqual([]);
    const r = await syndicsConnusPourAdresse({ libelle: '25 rue Edith Cavell', codePostal: '92400', commune: '' }, { lotId: 176 });
    expect(r[0].biens).toEqual([]);
  });
  it('la même parcelle : une copropriété voisine d’un AUTRE syndic est citée aussi (le conflit se lit à l’écran)', async () => {
    parcelle.mockResolvedValueOnce({ parcelles: ['92026000AB0001'], adresses: [{ cle: '27 rue edith cavell', libelle: '27 rue Edith Cavell' }] });
    const r = await syndicsConnusPourAdresse({ libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' });
    expect(r.map((s) => [s.syndic.nom, s.via])).toEqual([['CABINET B', ['parcelle']], ['TEST ARNAUD', ['copropriete', 'bien']]]);
  });
  it('une autre adresse : rien', async () => {
    expect(await syndicsConnusPourAdresse({ libelle: '1 rue Ailleurs', codePostal: '75001', commune: 'Paris' })).toEqual([]);
  });
});

describe('🔴🔴 PARTIE 3 — le bandeau d’un bien sans syndic à une adresse déjà connue', () => {
  it('le bien à la même adresse, sans syndic, reçoit la proposition ; celui qui a déjà le sien, non', async () => {
    const p = await propositionPourBien(500);
    expect(p?.syndics.map((s) => [s.syndic.id, s.copro.cle, s.biens.map((b) => b.numero)])).toEqual([[2, '25 rue edith cavell', ['219']]]);
    expect(await propositionPourBien(176)).toBeNull();
    /* Sans « Immeuble », un bien ne reçoit un syndic que par son immeuble : aucune proposition (règle du dépôt). */
    expect(await propositionPourBien(501)).toBeNull();
    expect(await propositionPourBien(502)).toBeNull();
  });
  it('« Ignorer » est mémorisé pour ce bien : la proposition ne revient pas', async () => {
    journal = [{ lot: '500', syndic: '2' }];
    expect(await propositionPourBien(500)).toBeNull();
  });
  it('le décompte : un bien sur quatre', async () => {
    expect((await biensAvecProposition()).map((p) => p.lot.numero)).toEqual(['901']);
  });
  it('« Ignorer » s’écrit au journal (ajout seul, entité annuaire_lot) — et seulement là', async () => {
    expect(await ignorerProposition(500, 2, auteur)).toEqual({ ok: true });
    const ins = appels.filter((a) => /INSERT/.test(a.sql));
    expect(ins).toHaveLength(1);
    expect(ins[0].sql.replace(/\s+/g, ' ')).toContain("INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6)");
    expect(ins[0].params.slice(0, 3)).toEqual([500, 'syndic_proposition_ignoree', '2']);
  });
  it('🔒 la lecture du bandeau n’écrit rien', async () => {
    await propositionPourBien(500);
    await biensAvecProposition();
    expect(appels.some((a) => /INSERT|UPDATE|DELETE/.test(a.sql))).toBe(false);
  });
});

describe('🔴🔴 LE RATTACHEMENT, SUR UN CLIC, PAR LA PORTE UNIQUE enregistrerSyndic', () => {
  it('avec la copropriété connue : l’immeuble du bien devient une adresse SECONDAIRE de cette copropriété', async () => {
    expect(await rattacherBienAuSyndic(2, { libelle: '25, r. Edith-Cavell', codePostal: '92400', commune: 'COURBEVOIE' }, '25 rue edith cavell', auteur))
      .toEqual({ ok: true, id: 2 });
    const [id, saisie] = enregistrer.mock.calls[0] as unknown as [number, { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }>; confirmeDoublons?: boolean; contacts: unknown[] }];
    expect(id).toBe(2);
    expect(saisie.immeubles.map((i) => [i.libelle, (i.adresses ?? []).map((a) => a.libelle)])).toEqual([['25 rue Edith Cavell', ['25, r. Edith-Cavell']]]);
    expect(saisie.confirmeDoublons).toBe(true);
    expect(saisie.contacts).toHaveLength(1);
  });
  it('sans copropriété (choisi par le cabinet) : l’immeuble du bien devient une copropriété de ce syndic', async () => {
    await rattacherBienAuSyndic(2, { libelle: '1 rue Ailleurs', codePostal: '75001', commune: 'PARIS' }, null, auteur);
    const [, saisie] = enregistrer.mock.calls[0] as unknown as [number, { immeubles: Array<{ libelle: string }> }];
    expect(saisie.immeubles.map((i) => i.libelle)).toEqual(['25 rue Edith Cavell', '1 rue Ailleurs']);
  });
  it('un bien sans « Immeuble » : refusé, rien n’est écrit', async () => {
    expect((await rattacherBienAuSyndic(2, { libelle: ' ', codePostal: '', commune: '' }, null, auteur)).ok).toBe(false);
    expect(enregistrer).not.toHaveBeenCalled();
  });
  it('⚠️ aucun accent dans le SQL du dépôt (piège du lot 19d3c67d)', () => {
    const src = readFileSync('app/lib/gestion/doublonSyndicRepo.ts', 'utf8');
    for (const sql of src.match(/`[^`]*`/g) ?? []) expect(sql, sql.slice(0, 60)).not.toMatch(/[À-ÿ]/);
  });
});
