import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, 417) — LES FICHES MODIFIÉES DEPUIS « SUIVI DU MOIS », sur une base SIMULÉE : l'écriture va dans la source
 * unique (l'annuaire), la copie du nom sur les lignes de suivi SAISIES suit dans la MÊME transaction, le journal porte le compte, la
 * session, l'écran et le champ, et une fiche modifiée entre-temps par quelqu'un d'autre n'est PAS écrasée. Données fictives.
 */
interface Ecrit { sql: string; params: unknown[]; dansTx: boolean }
let ecrits: Ecrit[];
let dansTx = false;
let journalApres: { quand: string; par: string } | null;
const locataire = { id: '7', nom: 'MARTIN', prenom: 'Léa', civilite: 'Mme', qualite: null, adresse: null, code_postal: null, commune: null, note: null, archive_le: null };

function repondre(sqlBrut: string, p: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  ecrits.push({ sql: s, params: p, dansTx });
  if (s.startsWith('SELECT * FROM gestion_annuaire_locataire WHERE id = $1 FOR UPDATE')) return r([{ ...locataire }]);
  if (s.includes('FROM gestion_journal j') && s.includes('j.id > $2')) return r(journalApres === null ? [] : [journalApres]);
  if (s.startsWith('SELECT sorte, valeur FROM gestion_annuaire_contact')) return r([{ sorte: 'telephone', valeur: '0600000000' }, { sorte: 'email', valeur: 'lea@exemple.fr' }]);
  return r([]);
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => {
    dansTx = true;
    try { return await fn((sql: string, params?: unknown[]) => query(sql, params ?? [])); } finally { dansTx = false; }
  },
}));
vi.mock('./schema', () => ({ annuaireModifiableDisponible: async () => true, suppressionPersonneDisponible: async () => true }));
vi.mock('./rafraichirPropositions', () => ({ rafraichirPourAdresses: async () => {}, rafraichirPourNoms: async () => {} }));
vi.mock('./familleCarteRepo', () => ({ refusFamilleCarte: async () => null }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true, oublierSchemaLocation: () => {} }));

const { modifierPersonne } = await import('./annuaireEditionRepo');
const { avecTrace, ecranDemande } = await import('./traceJournal');
const { changementsCarte, mentionDerniereModification, motifConflitFiche, dateHeureParis, saisieDesChangements } = await import('./traceFiche');

const auteur = { id: 12, libelle: 'lea.martin@exemple.fr' };
const trace = { sessionId: 'jti-session-abc', ecran: 'Suivi du mois' as const };
beforeEach(() => { ecrits = []; dansTx = false; journalApres = null; query.mockClear(); });
const ecritures = () => ecrits.filter((e) => /^(INSERT|UPDATE|DELETE)\b/.test(e.sql));

describe('🔴 la modification d’un locataire depuis « Suivi du mois »', () => {
  it('écrit dans la SOURCE (l’annuaire) et met à jour la copie des lignes de suivi SAISIES, dans la même transaction', async () => {
    const issue = await avecTrace(trace, () => modifierPersonne('locataire', 7, { nom: 'MARTIN-DURAND' }, auteur, { depuisJournalId: 500 }));
    expect(issue).toEqual({ etat: 'ok', data: undefined });
    const w = ecritures();
    expect(w.every((e) => e.dansTx)).toBe(true);   // tout dans la transaction
    const source = w.find((e) => e.sql.startsWith('UPDATE gestion_annuaire_locataire SET nom = $2'));
    expect(source?.params).toEqual([7, 'MARTIN-DURAND']);
    const copie = w.find((e) => e.sql.startsWith('UPDATE gestion_location_activite'));
    expect(copie).toBeDefined();
    expect(copie!.sql).toContain('SET libelle_locataire =');
    expect(copie!.sql).toContain("a.source = 'saisie'");   // une ligne reprise du fichier garde le texte du fichier
    expect(copie!.sql).toContain('oc.locataire_id = $1');
    expect(copie!.params).toEqual([7]);
    // L'ordre : la source d'abord, la copie ensuite (la copie relit le nouveau nom dans la même transaction).
    expect(w.indexOf(source!)).toBeLessThan(w.indexOf(copie!));
  });

  it('le journal : compte (id + identifiant), session, écran, entité, champ, ancienne et nouvelle valeur', async () => {
    await avecTrace(trace, () => modifierPersonne('locataire', 7, { nom: 'MARTIN-DURAND' }, auteur, { depuisJournalId: 500 }));
    const j = ecritures().find((e) => e.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j).toBeDefined();
    expect(j!.sql).toContain('sujet, champ, session_id, ecran');
    expect(j!.sql).toContain("VALUES ('annuaire', $1");
    expect(j!.params).toEqual([7, 'annuaire_nom', 'MARTIN', 'MARTIN-DURAND', 'nom modifié dans la fiche', 12, 'lea.martin@exemple.fr',
      'locataire', 'Nom', 'jti-session-abc', 'Suivi du mois']);
    expect(j!.dansTx).toBe(true);
  });

  it('sans écran tracé : le journal garde son sujet et son champ, sans session ni écran', async () => {
    await modifierPersonne('locataire', 7, { prenom: 'Léonie' }, auteur);
    const j = ecritures().find((e) => e.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(-4)).toEqual(['locataire', 'Prénom', null, null]);
    // Le conflit n'est pas contrôlé sans repère (le geste d'avant).
    expect(ecrits.some((e) => e.sql.includes('j.id > $2'))).toBe(false);
  });

  it('🔴 CONFLIT : modifiée par quelqu’un d’autre depuis l’ouverture → refus, qui et quand, RIEN n’est écrit', async () => {
    journalApres = { quand: '2026-10-24 12:05:00+00', par: 'Jean-Baptiste Pons' };
    const issue = await avecTrace(trace, () => modifierPersonne('locataire', 7, { nom: 'MARTIN-DURAND' }, auteur, { depuisJournalId: 500 }));
    expect(issue.etat).toBe('conflit');
    expect(issue.etat === 'conflit' && issue.motif).toBe('Cette fiche a été modifiée par Jean-Baptiste Pons le 24/10/2026 à 14:05 depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.');
    expect(ecritures()).toEqual([]);
    // Le repère est passé à la requête, avec l'identifiant.
    const c = ecrits.find((e) => e.sql.includes('j.id > $2'))!;
    expect(c.params).toEqual([7, 500]);
    expect(c.sql).toContain("j.sujet = 'locataire'");
  });

  it('un prénom changé sans nom : la copie suit aussi ; une note changée : aucune copie touchée', async () => {
    await modifierPersonne('locataire', 7, { prenom: 'Léonie' }, auteur);
    expect(ecritures().some((e) => e.sql.startsWith('UPDATE gestion_location_activite'))).toBe(true);
    ecrits = [];
    await modifierPersonne('locataire', 7, { note: 'Préfère le mail' }, auteur);
    expect(ecritures().some((e) => e.sql.startsWith('UPDATE gestion_location_activite'))).toBe(false);
  });

  it('un propriétaire renommé ne touche pas les lignes de suivi (les locataires seulement)', async () => {
    await modifierPersonne('proprietaire', 7, { prenom: 'Léonie' }, auteur);
    expect(ecritures().some((e) => e.sql.startsWith('UPDATE gestion_location_activite'))).toBe(false);
  });

  it('seul « Suivi du mois » est un écran tracé', () => {
    expect(ecranDemande('Suivi du mois')).toBe('Suivi du mois');
    expect(ecranDemande('Autre')).toBeNull();
    expect(ecranDemande(42)).toBeNull();
  });
});

describe('🔴 le récapitulatif : les SEULS champs modifiés', () => {
  const avant = { civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '3 rue A', codePostal: '92400', commune: 'Courbevoie', note: null,
    contacts: [{ sorte: 'telephone' as const, affichage: '06 00 00 00 00' }, { sorte: 'email' as const, affichage: 'lea@exemple.fr' }] };
  it('rien de changé : vide (le bouton reste inactif)', () => {
    expect(changementsCarte(avant, { civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: '', adresse: '3 rue A', codePostal: '92400', commune: 'Courbevoie', note: '',
      coordonnees: [{ sorte: 'email', valeur: 'lea@exemple.fr' }, { sorte: 'telephone', valeur: '06 00 00 00 00' }] })).toEqual([]);
  });
  it('« Champ : ancienne valeur → nouvelle valeur », seulement ce qui change', () => {
    expect(changementsCarte(avant, { nom: 'MARTIN-DURAND', commune: 'Puteaux', coordonnees: [{ sorte: 'telephone', valeur: '06 00 00 00 00' }] })).toEqual([
      { champ: 'Nom', avant: 'MARTIN', apres: 'MARTIN-DURAND', cle: 'nom' },
      { champ: 'Commune', avant: 'Courbevoie', apres: 'Puteaux', cle: 'commune' },
      { champ: 'Coordonnées', avant: 'E-mail lea@exemple.fr · Téléphone 06 00 00 00 00', apres: 'Téléphone 06 00 00 00 00', cle: 'coordonnees' },
    ]);
    expect(changementsCarte(avant, { qualite: 'Étudiante' })).toEqual([{ champ: 'Qualité', avant: '(vide)', apres: 'Étudiante', cle: 'qualite' }]);
  });
  it('ce qui PART : les seuls champs du récapitulatif (le serveur n’écrit que ce qu’il reçoit)', () => {
    const saisie = { civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: '', adresse: '3 rue A', codePostal: '92400', commune: 'Puteaux', note: '',
      coordonnees: [{ sorte: 'telephone' as const, valeur: '06 00 00 00 00' }, { sorte: 'email' as const, valeur: 'lea@exemple.fr' }] };
    expect(saisieDesChangements(saisie, changementsCarte(avant, saisie))).toEqual({ commune: 'Puteaux' });
  });
  it('« Dernière modification » et le conflit, à l’heure de Paris', () => {
    expect(mentionDerniereModification(null)).toBe('Aucune modification enregistrée.');
    expect(mentionDerniereModification({ par: 'Léa Martin', quand: '2026-01-15 08:30:00+00' })).toBe('Dernière modification : Léa Martin, le 15/01/2026 à 09:30.');
    expect(dateHeureParis('2026-07-01T22:10:00Z')).toEqual({ date: '02/07/2026', heure: '00:10' });
    expect(motifConflitFiche(null)).toMatch(/rechargez-la/);
  });
});
