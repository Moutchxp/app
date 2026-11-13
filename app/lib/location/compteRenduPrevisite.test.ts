import { describe, expect, it } from 'vitest';
import { adresseMasquee, compteRenduAffiche, identifier, quandFr, type AnnuaireCr, type EnvoiJournalCr } from './compteRenduPrevisite';

/**
 * 🔴 Arno (13/11/2026) — le compte rendu de pré-visite en lecture : depuis le journal des envois, chaque destinataire par son NOM et sa famille,
 * la date, l'état ; aucune adresse de client rendue.
 */
const A: AnnuaireCr = {
  locataires: [{ nom: 'FAYET', prenom: 'Robin', emails: ['robin@exemple.test'] }, { nom: 'FAYET', prenom: 'Léa', emails: [] }],
  proprietaires: [{ nom: 'DUPONT Jean', emails: ['jean@exemple.test'] }],
  internes: [{ nom: 'Arnaud Jorel', email: 'a.jorel@sansvisavis.com' }],
  domainesAgence: ['criterimmo.fr', 'sansvisavis.com'],
};
const env = (x: Partial<EnvoiJournalCr>): EnvoiJournalCr => ({ destinataires: [], copies: [], objet: 'Compte rendu', texte: 'Texte', statut: 'envoye', erreur: null,
  envoyeLe: '2026-11-13T12:52:00Z', auteur: 'Arnaud Jorel', pieceIds: [], ...x });

describe('qui est chaque destinataire', () => {
  it('locataire, propriétaire, interne par la fiche ; une adresse de l’agence sans compte : interne ; une adresse inconnue : masquée', () => {
    expect(identifier('Robin@Exemple.test', A)).toMatchObject({ nom: 'Robin FAYET', famille: 'locataire' });
    expect(identifier('jean@exemple.test', A)).toMatchObject({ nom: 'DUPONT Jean', famille: 'proprietaire' });
    expect(identifier('a.jorel@sansvisavis.com', A)).toMatchObject({ nom: 'Arnaud Jorel', famille: 'interne' });
    expect(identifier('gestion@criterimmo.fr', A)).toMatchObject({ nom: 'gestion@criterimmo.fr', famille: 'interne' });
    expect(identifier('inconnu@gmail.com', A)).toMatchObject({ nom: 'i…@gmail.com', famille: 'autre' });
    expect(adresseMasquee('x')).toBe('…');
  });
});

describe('le compte rendu affiché', () => {
  it('le texte du mail INTERNE ; qui/quand du suivi ; chaque destinataire (nom, famille, date, état) ; le locataire sans mail : « non envoyé » ; aucune adresse de client', () => {
    const r = compteRenduAffiche([
      env({ destinataires: ['a.jorel@sansvisavis.com', 'gestion@criterimmo.fr'], texte: 'Texte interne' }),
      env({ destinataires: ['robin@exemple.test'], texte: 'Bonjour Robin FAYET', envoyeLe: '2026-11-13T12:53:00Z', statut: 'echec', erreur: 'boîte pleine' }),
    ], A, { effectueeLe: '2026-11-13T12:52:30Z', effectueePar: 'Arnaud Jorel' }, [{ id: 3, nom: 'p.pdf', taille: 10 }]);
    expect([r.texte, r.saisiPar, r.saisiLe, r.aucunEnvoi, r.pieces.length]).toEqual(['Texte interne', 'Arnaud Jorel', '2026-11-13T12:52:30Z', false, 1]);
    expect(r.destinataires.map((d) => [d.famille, d.nom, d.quand, d.etat, d.motif])).toEqual([
      ['locataire', 'Léa FAYET', null, 'non_envoye', 'pas d’adresse e-mail'],
      ['locataire', 'Robin FAYET', '2026-11-13T12:53:00Z', 'echec', 'boîte pleine'],
      ['interne', 'Arnaud Jorel', '2026-11-13T12:52:00Z', 'envoye', null],
      ['interne', 'gestion@criterimmo.fr', '2026-11-13T12:52:00Z', 'envoye', null],
    ]);
    expect(JSON.stringify(r.destinataires)).not.toContain('robin@exemple.test');
  });
  it('un envoi réussi l’emporte sur un échec du même destinataire', () => {
    const r = compteRenduAffiche([env({ destinataires: ['robin@exemple.test'], statut: 'echec', erreur: 'x' }), env({ destinataires: ['robin@exemple.test'], envoyeLe: '2026-11-13T13:00:00Z' })],
      A, { effectueeLe: null, effectueePar: null });
    expect(r.destinataires.find((d) => d.nom === 'Robin FAYET')).toMatchObject({ etat: 'envoye', quand: '2026-11-13T13:00:00Z' });
  });
  it('tous les envois en échec : « aucun mail envoyé » ; aucun envoi journalisé : aucun compte rendu (texte null), personne listé', () => {
    expect(compteRenduAffiche([env({ destinataires: ['a.jorel@sansvisavis.com'], statut: 'echec' })], A, { effectueeLe: null, effectueePar: null }).aucunEnvoi).toBe(true);
    const vide = compteRenduAffiche([], A, { effectueeLe: null, effectueePar: null });
    expect([vide.texte, vide.destinataires, vide.aucunEnvoi]).toEqual([null, [], true]);
  });
  it('la date en heure de Paris', () => {
    expect(quandFr('2026-11-13T12:52:00Z')).toBe('le 13/11/2026 à 13h52');
    expect(quandFr('2026-07-01T08:05:00Z')).toBe('le 01/07/2026 à 10h05');
  });
});
