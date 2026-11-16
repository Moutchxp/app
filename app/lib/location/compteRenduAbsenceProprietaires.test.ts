import { describe, expect, it } from 'vitest';
import { estPhraseAbsence, MOTIF_PRESENCE, nomCollaborateur, phraseAbsence } from './texteCompteRendu';
import { compteRenduAffiche, presencesDuJournal, presencesDuTexte, texteSaisiDuMail, tracePresences } from './compteRenduPrevisite';
import { mailCompteRenduProprietaire, paragraphesCompteRenduLocataire, partiesCompteRenduProprietaire, TEXTE_ATTENTION_PREVISITE } from './previsite';
import { BROUILLON_VIDE, brouillonVide, nettoyerBrouillon } from './brouillonCompteRendu';
import { ORDRE_LOCATAIRES_DABORD, rappelFamilles, trierParFamille } from './famillesMails';
import { libelleMail } from './confirmationEnvois';

/**
 * 🔴🔴 (16/11/2026, responsable location) — « ABSENCE DE LA PARTIE LOCATAIRE » et le compte rendu de pré-visite AUX PROPRIÉTAIRES : les textes,
 * le journal, la consultation, le brouillon, l'ordre du récapitulatif. Les mails réels (un par adresse, confidentialité) : `previsiteRepo.test.ts`.
 */
const PHRASE = 'Pré-visite réalisée en l’absence des locataires, par Arnaud JOREL (Sans Vis-à-Vis / CRITERIMMO).';
const LOC = [{ occupationId: 559, civilite: null, prenom: 'Locataire fictif', nom: 'TEST' }];

describe('la phrase de l’absence', () => {
  it('« Prénom NOM » du collaborateur, l’agence ; avec les personnes ajoutées : « en présence de … »', () => {
    expect(nomCollaborateur({ prenom: 'Arnaud', nom: 'Jorel' })).toBe('Arnaud JOREL');
    expect(phraseAbsence('Arnaud JOREL', [])).toBe(PHRASE);
    expect(phraseAbsence('Arnaud JOREL', [{ civilite: 'Madame', prenom: 'Léa', nom: 'Martin' }, { civilite: 'Monsieur', prenom: 'Jean', nom: 'Durand' }]))
      .toBe('Pré-visite réalisée en l’absence des locataires, par Arnaud JOREL (Sans Vis-à-Vis / CRITERIMMO), en présence de Mme Léa Martin et de M. Jean Durand.');
    // collaborateur inconnu : la phrase reste juste, sans « par »
    expect(phraseAbsence('', [])).toBe('Pré-visite réalisée en l’absence des locataires.');
    expect(estPhraseAbsence(PHRASE)).toBe(true);
    expect(estPhraseAbsence('En présence de M. X.')).toBe(false);
    expect(MOTIF_PRESENCE).toContain('« Absence de la partie locataire »');
  });
  it('le mail d’un locataire : l’introduction sans « en présence de », la phrase juste après', () => {
    const p = paragraphesCompteRenduLocataire({ locataire: { civilite: null, nom: 'TEST' }, adresse: '1 rue X', rdv: { jour: '2026-11-16', heure: '09:53' },
      presence: '', texte: 'Logement propre.', legendesPhotos: [], vocaux: [], absence: PHRASE });
    expect(p[1]).toBe('Suite à la pré-visite de votre logement situé 1 rue X effectuée le 16/11/2026 à 09h53, vous trouverez ci-dessous le compte rendu des points relevés en vue de l’état des lieux de sortie.');
    expect(p[2]).toBe(PHRASE);
    expect(p[3]).toBe('- Logement propre.');
  });
});

describe('le mail aux propriétaires (texte)', () => {
  const m = mailCompteRenduProprietaire({ de: 'gestion@exemple.test', objet: 'Compte rendu', email: 'proprio@exemple.test', nomProprietaire: 'DUPONT Jean', adresse: '1 rue X',
    rdv: { jour: '2026-11-16', heure: '09:53' }, presence: PHRASE, texte: 'Salon propre.\n- Rayure', legendesPhotos: ['Parquet', 'Joint'], plusieursLocataires: false,
    qui: { prenom: 'Arnaud', nomFamille: 'Jorel', email: 'a.jorel@exemple.test' }, signature: { texte: '', html: '' } });
  it('appel, introduction propriétaire, présence, compte rendu en points, photos et légendes, politesse ; seul destinataire, aucune copie', () => {
    expect(m.a).toEqual(['proprio@exemple.test']); expect(m.cc).toEqual([]);
    expect(m.texte).toContain('Bonjour DUPONT Jean,\n\nNous avons réalisé le 16/11/2026 la pré-visite de votre logement situé 1 rue X, en vue du départ de votre locataire.');
    expect(m.texte).toContain(PHRASE);
    expect(m.texte).toContain('- Salon propre.\n- Rayure');
    expect(m.texte).toContain('Vous trouverez en pièces jointes les 2 photos prises lors de la pré-visite :\nPhoto 1 — Parquet\nPhoto 2 — Joint');
    expect(m.texte).toContain('Nous vous prions d’agréer, Madame, Monsieur, nos salutations distinguées.');
  });
  it('🔴 jamais l’encadré ATTENTION des locataires', () => {
    expect(m.texte).not.toContain('ATTENTION');
    for (const t of TEXTE_ATTENTION_PREVISITE) expect(m.texte).not.toContain(t.slice(0, 40));
  });
  it('modifiable comme les autres mails : appel, introduction, conclusion, politesse ; le reste protégé', () => {
    const parties = partiesCompteRenduProprietaire({ presence: PHRASE, texte: 'X', legendesPhotos: [], plusieursLocataires: true });
    expect(parties.filter((x) => x.modifiable).map((x) => x.cle)).toEqual(['appel', 'intro', 'conclusion', 'politesse']);
    expect(parties.find((x) => x.cle === 'intro')!.texte).toContain('en vue du départ de vos locataires');
    expect(m.edition?.cle).toBe('previsite_compte_rendu_proprietaire');
  });
});

describe('le journal et la fenêtre de consultation', () => {
  it('l’absence rangée avec le compte rendu, relue (« Locataires absents » + le collaborateur)', () => {
    const v = tracePresences(PHRASE, [{ role: 'personne', civilite: 'Madame', prenom: 'Léa', nom: 'Martin' }], { par: 'Arnaud JOREL' });
    expect(presencesDuJournal(v, LOC)).toEqual({ occupations: [], locataires: [], personnes: [{ civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: '' }], absence: { par: 'Arnaud JOREL' } });
    // sans absence : rien de changé
    expect(presencesDuJournal(tracePresences('x', []), LOC)).toEqual({ occupations: [], locataires: [], personnes: [] });
  });
  it('un envoi sans présences enregistrées : l’absence reconstituée depuis la phrase du mail ; le texte saisi sans elle', () => {
    const mail = ['Compte rendu de la pré-visite du 16/11/2026 — 1 rue X', 'Pré-visite réalisée en l’absence des locataires, par Arnaud JOREL (Sans Vis-à-Vis / CRITERIMMO), en présence de Mme Léa Martin.',
      'Logement propre.', 'Mail envoyé par Arnaud JOREL (a@b.c)'].join('\n\n');
    expect(presencesDuTexte(mail, LOC)).toEqual({ occupations: [], locataires: [], personnes: [{ civilite: '', prenom: '', nom: 'Mme Léa Martin', note: '' }], source: 'texte', absence: { par: 'Arnaud JOREL' } });
    expect(texteSaisiDuMail(mail)).toBe('Logement propre.');
  });
  it('les mails aux propriétaires (même sorte) : jamais pris pour le mail interne ; leurs destinataires dits « propriétaire »', () => {
    const annuaire = { locataires: [{ nom: 'TEST', prenom: 'Locataire', emails: ['loc@exemple.test'] }], proprietaires: [{ nom: 'DUPONT Jean', emails: ['proprio@exemple.test'] }],
      internes: [{ nom: 'Arnaud JOREL', email: 'a.jorel@sansvisavis.com' }], domainesAgence: ['sansvisavis.com'] };
    const e = (a: string, texte: string, le: string) => ({ destinataires: [a], copies: [], objet: 'CR', texte, statut: 'envoye' as const, erreur: null, envoyeLe: le, auteur: 'x', pieceIds: [] });
    const r = compteRenduAffiche([e('proprio@exemple.test', 'MAIL PROPRIO', '2026-11-16T09:00:00Z'), e('a.jorel@sansvisavis.com', 'MAIL INTERNE', '2026-11-16T09:00:01Z'),
      e('loc@exemple.test', 'MAIL LOC', '2026-11-16T09:00:02Z')], annuaire, { effectueeLe: null, effectueePar: null });
    expect(r.texte).toBe('MAIL INTERNE');
    expect(r.destinataires.map((d) => [d.famille, d.nom])).toEqual([['locataire', 'Locataire TEST'], ['proprietaire', 'DUPONT Jean'], ['interne', 'Arnaud JOREL']]);
  });
});

describe('le brouillon, le récapitulatif, la fenêtre de résultat', () => {
  it('le brouillon garde l’absence, l’état du bouton propriétaires et les adresses cochées ; absence cochée : aucun locataire coché', () => {
    const c = nettoyerBrouillon({ corps: 'x', presents: [559], absence: true, aussiProprietaires: true, adressesProprietaires: ['5|proprio@exemple.test', '5|proprio@exemple.test', 3] });
    expect(c).toMatchObject({ presents: [], absence: true, aussiProprietaires: true, adressesProprietaires: ['5|proprio@exemple.test'] });
    expect(nettoyerBrouillon({})).toMatchObject({ absence: false, aussiProprietaires: false, adressesProprietaires: null });
    expect(brouillonVide(BROUILLON_VIDE)).toBe(true);
    expect(brouillonVide({ ...BROUILLON_VIDE, absence: true })).toBe(false);
    expect(brouillonVide({ ...BROUILLON_VIDE, aussiProprietaires: true })).toBe(false);
  });
  it('ordre du récapitulatif de la pré-visite : locataires → propriétaires → interne', () => {
    const m = [{ famille: 'interne' as const, n: 1 }, { famille: 'proprietaire' as const, n: 2 }, { famille: 'locataire' as const, n: 3 }, { famille: 'proprietaire' as const, n: 4 }];
    expect(trierParFamille(m, ORDRE_LOCATAIRES_DABORD).map((x) => x.n)).toEqual([3, 2, 4, 1]);
    expect(rappelFamilles(m, ORDRE_LOCATAIRES_DABORD)).toBe('1 mail locataire · 2 mails propriétaires · 1 mail interne');
  });
  it('la fenêtre de résultat nomme le compte rendu parti au propriétaire', () => {
    expect(libelleMail({ sorte: 'previsite_compte_rendu', famille: 'proprietaire' })).toBe('Compte rendu de pré-visite (propriétaire)');
    expect(libelleMail({ sorte: 'previsite_compte_rendu' })).toBe('Compte rendu de pré-visite');
  });
});
