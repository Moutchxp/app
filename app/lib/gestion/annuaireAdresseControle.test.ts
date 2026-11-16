import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses uniformisées », lot 2) — L'ADRESSE D'UN PROPRIÉTAIRE OU D'UN LOCATAIRE, AU SERVEUR, sur une base
 * SIMULÉE : une adresse de la liste est retrouvée dans la Base Adresse Nationale (simulée) ; un refus arrive AVANT toute écriture ; la
 * nature et le pays s'écrivent ENSEMBLE et se journalisent ; une adresse non touchée n'est ni revérifiée ni requalifiée. Données fictives.
 */
interface Ecrit { sql: string; params: unknown[] }
let ecrits: Ecrit[];
const h = vi.hoisted(() => ({ etat: 'trouvee' as 'trouvee' | 'introuvable' | 'muet', verifs: 0 }));
const locataire = { id: '7', nom: 'MARTIN', prenom: 'Léa', civilite: 'Mme', qualite: null, adresse: '7 rue des Essais', code_postal: '92400', commune: 'COURBEVOIE',
  note: null, archive_le: null, adresse_nature: null, adresse_pays: null };
function repondre(sqlBrut: string, p: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  ecrits.push({ sql: s, params: p });
  if (s.startsWith('SELECT * FROM gestion_annuaire_locataire WHERE id = $1 FOR UPDATE')) return r([{ ...locataire }]);
  if (s.startsWith('SELECT sorte, valeur FROM gestion_annuaire_contact')) return r([{ sorte: 'telephone', valeur: '0600000000' }, { sorte: 'email', valeur: 'lea@exemple.fr' }]);
  if (s.startsWith('INSERT INTO gestion_annuaire_locataire')) return r([{ id: '8' }]);
  return r([]);
}
vi.mock('../db/client', () => ({
  query: async (sql: string, params?: unknown[]) => repondre(sql, params ?? []),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(async (sql: string, params?: unknown[]) => repondre(sql, params ?? [])),
}));
vi.mock('./schema', () => ({ annuaireModifiableDisponible: async () => true, suppressionPersonneDisponible: async () => true }));
vi.mock('./rafraichirPropositions', () => ({ rafraichirPourAdresses: async () => {}, rafraichirPourNoms: async () => {} }));
vi.mock('./familleCarteRepo', () => ({ refusFamilleCarte: async () => null }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true, oublierSchemaLocation: () => {} }));
vi.mock('./verificationAdresseRepo', () => ({ etatsAdresses: async () => { h.verifs += 1; return [h.etat]; } }));

const { creerPersonne, modifierPersonne } = await import('./annuaireEditionRepo');
const auteur = { id: 12, libelle: 'a.jorel@sansvisavis.com' };
const LILAS = { adresse: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS' };
beforeEach(() => { ecrits = []; h.etat = 'trouvee'; h.verifs = 0; });
const ecritures = () => ecrits.filter((e) => /^(INSERT|UPDATE|DELETE)\b/.test(e.sql));
const nature = () => ecritures().find((e) => e.sql.includes('SET adresse_nature = $2, adresse_pays = $3'));

describe('🔴 modifier l’adresse d’une personne', () => {
  it('une adresse de la liste INTROUVABLE : refus clair, AUCUNE écriture', async () => {
    h.etat = 'introuvable';
    const r = await modifierPersonne('locataire', 7, { ...LILAS, adresseSaisie: { nature: 'liste' } }, auteur);
    expect(r).toMatchObject({ etat: 'refus', motif: expect.stringContaining('introuvable dans la Base Adresse Nationale') });
    expect(ecritures()).toEqual([]);
  });
  it('le service muet : refus clair (« réessayez »), aucune écriture', async () => {
    h.etat = 'muet';
    const r = await modifierPersonne('locataire', 7, { ...LILAS, adresseSaisie: { nature: 'liste' } }, auteur);
    expect(r).toMatchObject({ etat: 'refus', motif: expect.stringContaining('réessayez') });
    expect(ecritures()).toEqual([]);
  });
  it('une adresse de la liste retrouvée : l’adresse, puis la nature « liste » (une seule écriture, journalisée)', async () => {
    expect(await modifierPersonne('locataire', 7, { ...LILAS, adresseSaisie: { nature: 'liste' } }, auteur)).toEqual({ etat: 'ok', data: undefined });
    expect(nature()?.params).toEqual([7, 'liste', null]);
    expect(ecritures().some((e) => e.sql.startsWith('INSERT INTO gestion_journal') && e.params.includes('annuaire_adresse_nature'))).toBe(true);
  });
  it('hors liste confirmée : sans appel au service ; à l’étranger : le code postal tel quel et le pays', async () => {
    await modifierPersonne('locataire', 7, { ...LILAS, adresseSaisie: { nature: 'hors_liste', horsListeConfirme: true } }, auteur);
    expect(nature()?.params).toEqual([7, 'hors_liste', null]);
    ecrits = [];
    await modifierPersonne('locataire', 7, { adresse: '10 Downing Street', codePostal: 'SW1A 2AA', commune: 'London', adresseSaisie: { nature: 'etranger', pays: 'Royaume-Uni' } }, auteur);
    expect(nature()?.params).toEqual([7, 'etranger', 'Royaume-Uni']);
    expect(ecritures().find((e) => e.sql.startsWith('UPDATE gestion_annuaire_locataire SET code_postal = $2'))?.params).toEqual([7, 'SW1A 2AA']);
    expect(h.verifs).toBe(0);
  });
  it('🔴 une adresse NON TOUCHÉE (autre champ modifié) : ni vérifiée, ni requalifiée', async () => {
    await modifierPersonne('locataire', 7, { prenom: 'Lou', adresse: '7 rue des Essais', codePostal: '92400', commune: 'Courbevoie' }, auteur);
    expect(h.verifs).toBe(0);
    expect(nature()).toBeUndefined();
  });
});

describe('🔴 créer une personne', () => {
  it('une adresse introuvable : refus avant d’ouvrir la transaction (aucune fiche créée)', async () => {
    h.etat = 'introuvable';
    const r = await creerPersonne('locataire', { nom: 'DURAND', ...LILAS, adresseSaisie: { nature: 'liste' } }, auteur);
    expect(r.etat).toBe('refus');
    expect(ecritures()).toEqual([]);
  });
  it('une adresse retrouvée : la fiche, puis sa nature « liste »', async () => {
    expect(await creerPersonne('locataire', { nom: 'DURAND', ...LILAS, adresseSaisie: { nature: 'liste' } }, auteur)).toEqual({ etat: 'ok', data: { id: 8 } });
    expect(nature()?.params).toEqual([8, 'liste', null]);
  });
  it('la page « Nouveau propriétaire + bien » (en attente de la décision d’Arno) garde sa saisie : aucun contrôle', async () => {
    h.etat = 'introuvable';
    expect((await creerPersonne('locataire', { nom: 'DURAND', ...LILAS }, auteur, { controleAdresse: false })).etat).toBe('ok');
    expect(h.verifs).toBe(0);
  });
});
