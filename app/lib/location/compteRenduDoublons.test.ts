import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nomsDeLaPhrase, presencesDuJournal, presencesDuTexte, texteSaisiDuMail, tracePresences } from './compteRenduPrevisite';

/**
 * 🔴🔴 Arno (15/11/2026, retours sur la fenêtre « Compte rendu de pré-visite ») — les présences ENREGISTRÉES à l'envoi et relues par la fenêtre
 * (plus jamais « Présences non enregistrées » quand le mail dit « En présence de … ») ; pour l'existant sans rien d'enregistré, reconstituées
 * depuis le texte ; et le TEXTE saisi seul (aucune partie générée pour le mail : chacune a sa section).
 */
const LOC = [{ occupationId: 559, civilite: null, prenom: 'Locataire fictif', nom: 'TEST' }, { occupationId: 560, civilite: 'Madame', prenom: 'Alice', nom: 'Bernard' }];
/** le mail INTERNE tel qu'envoyé le 15/11/2026 à 15h49 (préavis de test 559), mot pour mot */
const MAIL = ['Compte rendu de la pré-visite du 15/11/2026 — 1 rue du Préavis de Test (FICTIF), 00000 TEST', 'En présence de Locataire fictif TEST.',
  'Épreuve de l’envoi final : logement propre, une rayure au parquet de la chambre.', 'Photos',
  'Photo 1 — Rayure du parquet de la chambre\nPhoto 2 — Joint de la douche', 'Enregistrements vocaux joints', 'Vocal pour locataire (3 prises, à écouter dans l’ordre)',
  'Mail envoyé par Arnaud JOREL (a.jorel@sansvisavis.com)', '-- \nService Gestion', '2 rue Mars et Roty, 92800 Puteaux'].join('\n\n');

describe('les présences enregistrées avec le compte rendu (journal)', () => {
  it('version 2 : chaque personne avec son rôle ; le locataire par son occupation ; la note interne de la personne présente', () => {
    const v = tracePresences('En présence de Mme Alice Bernard et de M. Jean Durand.', [
      { role: 'locataire', occupationId: 560, civilite: 'Madame', prenom: 'Alice', nom: 'Bernard' },
      { role: 'personne', civilite: 'Monsieur', prenom: 'Jean', nom: 'Durand', note: 'frère du locataire' }]);
    expect(presencesDuJournal(v, LOC)).toEqual({ occupations: [560], locataires: [LOC[1]],
      personnes: [{ civilite: 'Monsieur', prenom: 'Jean', nom: 'Durand', note: 'frère du locataire' }] });
  });
  it('version 2 : un locataire qui n’est plus de ce préavis n’est jamais rendu (confidentialité)', () => {
    const v = tracePresences('x', [{ role: 'locataire', occupationId: 999, civilite: null, prenom: 'Autre', nom: 'CLIENT' }]);
    expect(presencesDuJournal(v, LOC)).toEqual({ occupations: [], locataires: [], personnes: [] });
  });
  it('version 1 (envois d’avant le rôle, comme ceux du 15/11 à 12h16 et 15h48) : le rôle retrouvé par le nom des locataires du préavis', () => {
    const v = JSON.stringify({ phrase: 'En présence de Locataire fictif TEST.', presents: [{ civilite: null, prenom: 'Locataire fictif', nom: 'TEST' },
      { civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: 'mère' }] });
    expect(presencesDuJournal(v, LOC)).toEqual({ occupations: [559], locataires: [LOC[0]], personnes: [{ civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: 'mère' }] });
  });
  it('illisible : null (la fenêtre passe à la source suivante)', () => {
    expect(presencesDuJournal('pas du json', LOC)).toBeNull();
    expect(presencesDuJournal(null, LOC)).toBeNull();
    expect(presencesDuJournal('{"phrase":"x"}', LOC)).toBeNull();
  });
});

describe('reconstitution depuis le texte (existant sans présences enregistrées — rien n’est écrit)', () => {
  it('les noms de la phrase « En présence de … » : un, deux, trois, « d’ » devant une voyelle', () => {
    expect(nomsDeLaPhrase(MAIL)).toEqual(['Locataire fictif TEST']);
    expect(nomsDeLaPhrase('x\n\nEn présence de Mme Léa Martin et de M. Jean Durand.')).toEqual(['Mme Léa Martin', 'M. Jean Durand']);
    expect(nomsDeLaPhrase('En présence d’Alice Bernard, M. Jean Durand et de Mme Léa Martin.')).toEqual(['Alice Bernard', 'M. Jean Durand', 'Mme Léa Martin']);
    expect(nomsDeLaPhrase('Logement propre.')).toEqual([]);
    expect(nomsDeLaPhrase(null)).toEqual([]);
  });
  it('un nom de locataire du préavis : locataire ; sinon : personne présente, nom tel qu’écrit ; marqué « texte »', () => {
    expect(presencesDuTexte(MAIL, LOC)).toEqual({ occupations: [559], locataires: [LOC[0]], personnes: [], source: 'texte' });
    expect(presencesDuTexte('En présence de Mme Alice Bernard et de M. Jean Durand.', LOC)).toEqual({ occupations: [560], locataires: [LOC[1]],
      personnes: [{ civilite: '', prenom: '', nom: 'M. Jean Durand', note: '' }], source: 'texte' });
    expect(presencesDuTexte('Logement propre.', LOC)).toBeNull();
  });
});

describe('le texte SAISI seul, retrouvé dans le mail envoyé (le mail lui-même n’est jamais modifié)', () => {
  it('sans l’en-tête, la présence, les photos, les vocaux joints, « Mail envoyé par … » ni la signature', () => {
    const avant = MAIL;
    expect(texteSaisiDuMail(MAIL)).toBe('Épreuve de l’envoi final : logement propre, une rayure au parquet de la chambre.');
    expect(MAIL).toBe(avant);
  });
  it('tirets, retours à la ligne et paragraphes du texte gardés ; les notes de présence (internes) retirées', () => {
    const m = ['Compte rendu de la pré-visite du 15/11/2026 — 1 rue X', 'En présence de Mme Léa Martin.', 'Logement propre.\n- Rayure du parquet\n- Joint de la douche',
      'Cuisine à nettoyer.', 'Notes de présence (internes)', 'Mme Léa Martin — mère du locataire', 'Mail envoyé par Arno (a@b.c)'].join('\n\n');
    expect(texteSaisiDuMail(m)).toBe('Logement propre.\n- Rayure du parquet\n- Joint de la douche\n\nCuisine à nettoyer.');
  });
  it('« Mail envoyé par … » sans ligne vide avant : coupé quand même ; un texte sans partie générée : tel quel', () => {
    expect(texteSaisiDuMail('Bonjour,\nLogement en bon état.\nMail envoyé par Arno')).toBe('Bonjour,\nLogement en bon état.');
    expect(texteSaisiDuMail('Salon propre.\n- Rayure')).toBe('Salon propre.\n- Rayure');
    expect(texteSaisiDuMail(null)).toBe('');
  });
});

// ── la LECTURE (« Voir le compte rendu ») : base simulée, rien n'est écrit ──────────────────────────────────────────────────────────────
const requetes: string[] = [];
let journalPresences: { v: string }[] = [];
let brouillonEnvoye: unknown = null;
vi.mock('../db/client', () => ({ query: vi.fn(async (sql: string) => {
  requetes.push(sql);
  if (sql.includes('FROM gestion_location_mail_avis')) return { rows: [{ destinataires: ['arno@sansvisavis.com'], copies: [], objet: 'Objet', texte: MAIL, statut: 'envoye', erreur: null,
    envoye_le: '2026-11-15T14:49:06Z', auteur_libelle: 'a.jorel@sansvisavis.com', piece_ids: [] }] };
  if (sql.includes('effectuee_par_libelle')) return { rows: [{ p: null }] };
  if (sql.includes('j.action = $1') && journalPresences.length > 0 && sql.includes('LIMIT 1')) return { rows: journalPresences };
  if (sql.includes('gestion_location_previsite_brouillon')) return { rows: brouillonEnvoye === null ? [] : [{ contenu: brouillonEnvoye }] };
  return { rows: [] };
}) }));
vi.mock('./previsiteBase', () => ({ previsiteDisponible: async () => true, lireGroupe: async () => ({ ok: true, g: { cle: 'k', lignes: [{ id: '559', locataire_id: '532' }] } }),
  suiviOuvert: async () => ({ id: '7', effectuee_le: '2026-11-15T14:49:07Z' }) }));
vi.mock('./mailsPreavisSortieRepo', () => ({ mailsAvisDisponibles: async () => true, piecesDuMailDisponible: async () => true,
  locatairesAvis: async () => [{ occupationId: 559, civilite: null, prenom: 'Locataire fictif', nom: 'TEST', emails: [] }] }));
vi.mock('./piecesSortieRepo', () => ({ metaPieces: async () => [] }));
vi.mock('./vocauxCompteRenduRepo', () => ({ vocauxDesOccupations: async () => [] }));
vi.mock('./brouillonCompteRenduRepo', () => ({ brouillonDisponible: async () => true }));
vi.mock('./sortieLocatairesRepo', () => ({ encartDuBail: async () => null }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@sansvisavis.com' }) }));
const { lireCompteRenduPrevisite } = await import('./compteRenduPrevisiteRepo');
beforeEach(() => { requetes.length = 0; journalPresences = []; brouillonEnvoye = null; });
const lire = async () => { const r = await lireCompteRenduPrevisite([559]); if (r.etat !== 'ok') throw new Error(r.etat); return r.data; };

describe('« Voir le compte rendu » relit les présences', () => {
  it('🔴 la CAUSE du bug : envoyé sans brouillon sur le serveur, les présences du journal sont affichées (plus « Présences non enregistrées »)', async () => {
    journalPresences = [{ v: JSON.stringify({ phrase: 'En présence de Locataire fictif TEST.', presents: [{ civilite: null, prenom: 'Locataire fictif', nom: 'TEST' }] }) }];
    expect((await lire()).presences).toEqual({ occupations: [559], locataires: [LOC[0]], personnes: [] });
  });
  it('le journal l’emporte sur le brouillon envoyé (même source que l’envoi)', async () => {
    journalPresences = [{ v: tracePresences('x', [{ role: 'personne', civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: 'mère' }]) }];
    brouillonEnvoye = { corps: 'CR', presents: [559], ajoutees: [], photos: [], fichiers: [] };
    expect((await lire()).presences).toEqual({ occupations: [], locataires: [], personnes: [{ civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: 'mère' }] });
  });
  it('rien d’enregistré (ni journal, ni brouillon) : reconstituées depuis le texte, marquées « texte »', async () => {
    expect((await lire()).presences).toEqual({ occupations: [559], locataires: [LOC[0]], personnes: [], source: 'texte' });
  });
  it('aucune écriture en lisant', async () => {
    await lire();
    expect(requetes.some((q) => /\b(INSERT|UPDATE|DELETE)\b/i.test(q))).toBe(false);
  });
});
