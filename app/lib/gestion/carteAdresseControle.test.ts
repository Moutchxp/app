import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses uniformisées », lot 2) — L'ADRESSE POSTALE D'UNE CARTE DE CONTACT (garant, contact), au serveur, sur
 * une base SIMULÉE : refus AVANT toute écriture ; nature et pays écrits ensemble ; une adresse RECOPIÉE d'une carte existante (déplacement,
 * rattachement à un autre bien) garde sa nature, sans nouveau contrôle. Base Adresse Nationale simulée. Données fictives.
 */
const h = vi.hoisted(() => ({ etat: 'trouvee' as 'trouvee' | 'introuvable' | 'muet', verifs: 0, avant: null as Record<string, unknown> | null,
  appels: [] as { sql: string; params: unknown[] }[] }));
const rep = async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  h.appels.push({ sql: s, params });
  if (s.startsWith('SELECT * FROM gestion_contact_carte WHERE id = $1')) return { rows: h.avant === null ? [] : [h.avant] };
  if (s.startsWith('UPDATE gestion_contact_carte')) return { rows: [{ id: '5' }] };
  if (s.startsWith('INSERT INTO gestion_contact_carte')) return { rows: [{ id: '6', retire: null }] };
  return { rows: [] };
};
vi.mock('../db/client', () => ({ query: (sql: string, p?: unknown[]) => rep(sql, p), withTransaction: (fn: (q: unknown) => Promise<unknown>) => fn((sql: string, p?: unknown[]) => rep(sql, p)) }));
vi.mock('./schema', () => ({
  partieCategorieDisponible: async () => true, contactCarteDisponible: async () => true, contactAncienLocataireDisponible: async () => true,
  noteContactCarteDisponible: async () => true, ficheContactCarteDisponible: async () => true,
}));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./verificationAdresseRepo', () => ({ etatsAdresses: async () => { h.verifs += 1; return [h.etat]; } }));
import { modifierCarte, poserCarteAlaMain } from './partieCategorieRepo';

const AUTEUR = { id: 7, libelle: 'a.jorel@sansvisavis.com' };
const ecritures = () => h.appels.filter((a) => /^(INSERT|UPDATE)\b/.test(a.sql));
const FICHE = { civilite: 'Mme', prenom: 'Zoé', qualite: 'Garant', adressePostale: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS', note: null,
  coordonnees: [{ sorte: 'email' as const, libelle: 'E-mail', valeur: 'zoe@fictif.test' }] };
beforeEach(() => { h.etat = 'trouvee'; h.verifs = 0; h.appels = []; h.avant = { id: '5', adresse_postale: '7 rue des Essais', code_postal: '92400', commune: 'COURBEVOIE', adresse_nature: null, adresse_pays: null }; });

describe('🔴 modifier la carte (le crayon)', () => {
  it('une adresse introuvable : refus clair, AUCUNE écriture', async () => {
    h.etat = 'introuvable';
    const r = await modifierCarte({ id: 5, nom: 'ROSKY', fiche: { ...FICHE, adresseSaisie: { nature: 'liste' } }, auteur: AUTEUR });
    expect(r).toMatchObject({ ok: false, motif: expect.stringContaining('introuvable dans la Base Adresse Nationale') });
    expect(ecritures()).toEqual([]);
  });
  it('à l’étranger : la nature et le pays dans la MÊME écriture que l’adresse', async () => {
    await modifierCarte({ id: 5, nom: 'ROSKY', fiche: { ...FICHE, adressePostale: 'Rue de la Loi 16', codePostal: '1000', commune: 'Bruxelles', adresseSaisie: { nature: 'etranger', pays: 'Belgique' } }, auteur: AUTEUR });
    const u = ecritures().find((e) => e.sql.startsWith('UPDATE gestion_contact_carte'))!;
    expect(u.sql).toContain('adresse_nature = $'); expect(u.sql).toContain('adresse_pays = $');
    expect(u.params).toEqual(expect.arrayContaining(['etranger', 'Belgique', 'Rue de la Loi 16']));
    expect(h.verifs).toBe(0);
  });
  it('🔴 une adresse NON TOUCHÉE : ni vérifiée ni requalifiée', async () => {
    await modifierCarte({ id: 5, nom: 'ROSKY', fiche: { ...FICHE, adressePostale: '7 rue des Essais', codePostal: '92400', commune: 'Courbevoie' }, auteur: AUTEUR });
    expect(h.verifs).toBe(0);
    expect(ecritures()[0].sql).not.toContain('adresse_nature');
  });
});

describe('🔴 poser une carte', () => {
  it('une adresse SAISIE introuvable : refus avant toute écriture', async () => {
    h.etat = 'introuvable';
    const r = await poserCarteAlaMain({ lotCle: '155', cote: 'proprietaire', adresse: 'zoe@fictif.test', fiche: { ...FICHE, adresseSaisie: { nature: 'liste' } }, auteur: AUTEUR });
    expect(r.ok).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('une adresse RECOPIÉE (déplacement, autre bien) : sans contrôle, avec sa nature et son pays', async () => {
    h.etat = 'introuvable';
    await poserCarteAlaMain({ lotCle: '155', cote: 'proprietaire', adresse: 'zoe@fictif.test', auteur: AUTEUR,
      fiche: { ...FICHE, adressePostale: '2 chemin perdu', adresseRecopiee: { nature: 'hors_liste', pays: null } } });
    expect(h.verifs).toBe(0);
    const i = ecritures().find((e) => e.sql.startsWith('INSERT INTO gestion_contact_carte'))!;
    expect(i.sql).toContain('adresse_nature = EXCLUDED.adresse_nature');
    expect(i.params).toContain('hors_liste');
  });
});
