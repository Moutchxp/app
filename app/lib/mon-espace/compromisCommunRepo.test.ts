import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageAEnvoyer } from '../gestion/envoiGmail';
import type { DossierSaisie } from '../transaction/saisie';

/**
 * 🔴 Arno (05/11/2026) — APRÈS la création d'un compromis depuis « Mon espace » : la marque « commun », un mail à chaque collaborateur d'un
 * côté sauf le créateur, la variante (clients saisis / à saisir, avec le lien), le journal. Base simulée, transport FACTICE : rien ne part.
 */
const h = vi.hoisted(() => ({ avec459: true, ecritures: [] as { sql: string; params: unknown[] }[], ventes: [] as unknown[] }));
vi.mock('../transaction/repo', () => ({ lireVentes: async () => h.ventes }));
vi.mock('../db/client', () => ({ query: vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM admin_utilisateur WHERE id = ANY')) return { rows: [
    { id: '2', prenom: 'Arnaud', nom: 'Jorel', identifiant: 'a.jorel@sansvisavis.com' },
    { id: '5', prenom: 'Léa', nom: 'MARTIN', identifiant: 'lea@sansvisavis.com' },
    { id: '7', prenom: 'Pierre', nom: 'Thevenin', identifiant: 'p.thevenin@sansvisavis.com' }].filter((r) => (params[0] as number[]).includes(Number(r.id))) };
  if (s.startsWith('INSERT')) { h.ecritures.push({ sql: s, params }); return { rows: [], rowCount: 1 }; }
  return { rows: [] };
}) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec459 }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));
vi.mock('../gestion/adresseApplication', () => ({ adresseApplication: () => ({ base: 'https://exemple.test', locale: false }) }));
const { apresCreationCompromis, partageDefiniSaisie } = await import('./compromisCommunRepo');

const envoyes: MessageAEnvoyer[] = [];
const transport = { envoyer: async (m: MessageAEnvoyer) => { envoyes.push(m); return { ok: true as const, id: null, factice: true }; } };
const AUTEUR = { id: 5, libelle: 'lea@sansvisavis.com' };
const vendeur = { id: null, role: 'vendeur' as const, nom: 'DUPONT', prenom: 'Jean', telephone: '0600000000', email: null, adresse: null };
const acquereur = { ...vendeur, role: 'acquereur' as const, nom: 'BERNARD', prenom: 'Alice' };
const saisie = (o: Partial<DossierSaisie> = {}): DossierSaisie => ({ societe: 'criterimmo', statut: 'compromis', libelle: null, honorairesTtc: 20000, dateCompromis: null,
  dateActePrevue: null, dateActe: null, adresseBien: '12 rue de l’Essai, 75011 Paris', note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null,
  retroApporteurTtc: 0, retroUnite: 'ttc', personnes: [vendeur], prixVente: 450000, numeroMandat: { saisi: 'M-42', normalise: 'M42' }, lignes: [],
  parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, societe: 'criterimmo' },
    { sorte: 'sortie', compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, societe: 'macj' }], ...o } as DossierSaisie);
const journal = () => h.ecritures.filter((e) => e.sql.includes('INSERT INTO mon_espace_mail_compromis'));
beforeEach(() => { h.avec459 = true; h.ecritures.length = 0; envoyes.length = 0; h.ventes = []; });

describe('🔴 le créateur sur UN côté : l’autre collaborateur prévenu', () => {
  it('ses clients PAS saisis : la variante « à renseigner », avec le lien qui ouvre CE compromis sur SON côté ; le compromis est marqué', async () => {
    const r = await apresCreationCompromis(99, saisie(), 5, '2026-11-05', AUTEUR, { transport });
    expect(envoyes.map((m) => [m.a, m.objet])).toEqual([[['p.thevenin@sansvisavis.com'], 'Nouveau compromis commun — mandat M-42 — 12 rue de l’Essai, 75011 Paris']]);
    expect(envoyes[0].corps).toContain('Les coordonnées de vos clients ne sont pas encore saisies.');
    expect(envoyes[0].corps).toContain('Renseigner mes clients : https://exemple.test/admin/mon-espace?affaire=99&cote=sortie&modifier=1');
    expect(envoyes[0].corps).toContain('Léa MARTIN a créé le 05/11/2026');
    expect(r.mails).toEqual([{ compteId: 7, nom: 'Pierre Thevenin', email: 'p.thevenin@sansvisavis.com', envoye: true, motif: null, variante: 'clients_a_saisir' }]);
    expect(r.cotes).toEqual({ entree: 'Léa MARTIN', sortie: 'Pierre Thevenin' });
    expect(r.partage).toEqual(['entrée du mandat — Léa MARTIN (CRITERIMMO) : 50 %', 'sortie du mandat — Pierre Thevenin (MACJ) : 50 %']);
    expect(h.ecritures.some((e) => e.sql.includes('INSERT INTO mon_espace_compromis_commun'))).toBe(true);
    expect(journal().map((e) => [e.params[0], e.params[1], e.params[6], e.params[7]])).toEqual([[99, 7, 'clients_a_saisir', 'envoye']]);
  });
  it('ses clients saisis par le créateur : « 2 fiches clients créées », sans lien', async () => {
    await apresCreationCompromis(99, saisie({ personnes: [vendeur, acquereur, { ...acquereur, nom: 'BERNARD', prenom: 'Bob', email: 'b@x.fr', telephone: null }] }), 5, '2026-11-05', AUTEUR, { transport });
    expect(envoyes[0].corps).toContain('Les coordonnées de vos clients ont été saisies : 2 fiches clients créées.');
    expect(envoyes[0].corps).not.toContain('Renseigner mes clients');
  });
});

describe('🔴 « Pour un collègue » : DEUX mails ; le créateur seul sur les deux côtés : AUCUN', () => {
  it('un administrateur (2) crée pour Léa (entrée) et Pierre (sortie) : deux mails', async () => {
    const r = await apresCreationCompromis(99, saisie(), 2, '2026-11-05', { id: 2, libelle: 'a.jorel@sansvisavis.com' }, { transport });
    expect(envoyes.map((m) => m.a[0])).toEqual(['lea@sansvisavis.com', 'p.thevenin@sansvisavis.com']);
    expect(envoyes[0].corps).toContain('Votre côté : entrée du mandat (côté vendeur)');
    expect(envoyes[0].corps).toContain('Les coordonnées de vos clients ont été saisies : 1 fiche client créée.'); // le vendeur saisi
    expect(r.mails.map((m) => m.nom)).toEqual(['Léa MARTIN', 'Pierre Thevenin']);
  });
  it('Léa sur les deux côtés : aucun mail, rien de marqué (confirmation simple)', async () => {
    const r = await apresCreationCompromis(99, saisie({ sortieId: 5 }), 5, '2026-11-05', AUTEUR, { transport });
    expect(envoyes).toEqual([]);
    expect(r.mails).toEqual([]);
    expect(h.ecritures).toEqual([]);
  });
});

describe('les cas de bord', () => {
  it('sans la migration 459 : rien n’est marqué, aucun mail ; le récapitulatif le dit', async () => {
    h.avec459 = false;
    const r = await apresCreationCompromis(99, saisie(), 5, '2026-11-05', AUTEUR, { transport });
    expect(envoyes).toEqual([]);
    expect(r.disponible).toBe(false);
  });
  it('un envoi en échec : journalisé « echec » et rendu, jamais un faux « envoyé »', async () => {
    const r = await apresCreationCompromis(99, saisie(), 5, '2026-11-05', AUTEUR, { transport: { envoyer: async () => ({ ok: false as const, motif: 'Gmail injoignable' }) } });
    expect(r.mails[0]).toMatchObject({ envoye: false, motif: 'Gmail injoignable' });
    expect(journal()[0].params[7]).toBe('echec');
  });
  it('le partage côté serveur : une part pour chaque côté', () => {
    expect(partageDefiniSaisie(saisie().parties)).toBe(true);
    expect(partageDefiniSaisie([saisie().parties[0]])).toBe(false);
    expect(partageDefiniSaisie([{ ...saisie().parties[0], sorte: 'entree_sortie', pourcentage: 100 }])).toBe(true);
  });
});

describe('🔴 Arno (05/11/2026) — le partage du mail = celui du compromis ENREGISTRÉ (60 / 40), montants de la ligne « Mon espace » au centime', () => {
  const enregistree = { id: 99, societe: 'criterimmo', libelle: 'DUPONT', honorairesTtc: 20000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: null,
    apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
    repartition: { retroApporteurTtc: 0, parties: [
      { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
      { sorte: 'sortie', compteId: 7, negociateur: 'Pierre THEVENIN', societe: 'macj', nom: null, coordonnees: null, pourcentage: 40, montantHt: null }] },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Pierre THEVENIN' }, apporteurId: null, personnes: [] } };
  it('les lignes du mail et du récapitulatif : 60 % soit 12 000 € TTC (10 000 € HT), 40 % soit 8 000 € TTC (6 666,67 € HT) — ceux de `lignesCarteAffaire`', async () => {
    h.ventes = [enregistree];
    // La saisie dit AUTRE CHOSE (50 / 50) : seul l'enregistré compte.
    const r = await apresCreationCompromis(99, saisie(), 5, '2026-11-05', AUTEUR, { transport });
    const sp = (x: string) => x.replace(/[\u202f\u00a0]/g, ' ');
    expect(r.partage.map(sp)).toEqual(['entrée du mandat — Léa MARTIN (CRITERIMMO) : 60 % soit 12 000 € TTC (10 000 € HT)',
      'sortie du mandat — Pierre Thevenin (MACJ) : 40 % soit 8 000 € TTC (6 666,67 € HT)']);
    expect(sp(envoyes[0].corps)).toContain('Partage des honoraires :\n– entrée du mandat — Léa MARTIN (CRITERIMMO) : 60 % soit 12 000 € TTC (10 000 € HT)\n– sortie du mandat — Pierre Thevenin (MACJ) : 40 % soit 8 000 € TTC (6 666,67 € HT)');
    const { lignesCarteAffaire } = await import('../transaction/carteAffaireLignes');
    const ligne = lignesCarteAffaire(enregistree as never, null).lignes.find((l) => l.cote === 'sortie')!;
    expect([ligne.honoraires.ttcC, ligne.honoraires.htC]).toEqual([800000, 666667]);
  });
});
