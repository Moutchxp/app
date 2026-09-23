import { describe, it, expect } from 'vitest';
import { adresseProposee, nettoyerObjet } from './objet';

/**
 * LOT 4c-A — les deux lectures d'un objet de mail. Les cas ne sont pas inventés : ce sont les objets RÉELS vus par
 * Arno à l'écran le 23/09/2026, recopiés tels quels. Un test écrit sur des exemples de laboratoire n'aurait rien prouvé
 * de cette boîte-là.
 */

describe('nettoyer l’objet — défaire la cascade de préfixes, et RIEN d’autre', () => {
  it('retire un préfixe simple, français comme anglais', () => {
    expect(nettoyerObjet('Re: Dates travaux')).toBe('Dates travaux');
    expect(nettoyerObjet('TR: Préavis de départ')).toBe('Préavis de départ');
    expect(nettoyerObjet('Fwd: Lease closure')).toBe('Lease closure');
  });

  it('retire la CASCADE entière — c’est le cas courant d’une boîte de gestion', () => {
    expect(nettoyerObjet('Re: RE: TR: Fwd: Préavis de départ')).toBe('Préavis de départ');
    expect(nettoyerObjet('RE : Re: Dates travaux')).toBe('Dates travaux');
  });

  it('accepte les variantes d’Outlook et les espaces avant les deux-points', () => {
    expect(nettoyerObjet('RE[2]: Résiliation')).toBe('Résiliation');
    expect(nettoyerObjet('Re(3) : Résiliation')).toBe('Résiliation');
  });

  it('ne touche à RIEN d’autre : ni la casse, ni les accents, ni la ponctuation interne', () => {
    expect(nettoyerObjet('OS DU 07 09 26 APT BENKIRANE')).toBe('OS DU 07 09 26 APT BENKIRANE');
    expect(nettoyerObjet('Re: Résiliation - ZGUANG JIXI - 34 Quai de Dion Bouton'))
      .toBe('Résiliation - ZGUANG JIXI - 34 Quai de Dion Bouton');
  });

  it('un mot qui COMMENCE par « re » n’est pas un préfixe (« Relance », « Reçu »)', () => {
    expect(nettoyerObjet('Relance : facture de septembre')).toBe('Relance : facture de septembre');
    expect(nettoyerObjet('Reçu de paiement')).toBe('Reçu de paiement');
  });

  it('objet vide ou absent → chaîne vide, jamais « undefined » affiché à l’écran', () => {
    expect(nettoyerObjet(null)).toBe('');
    expect(nettoyerObjet('   ')).toBe('');
    expect(nettoyerObjet('Re:')).toBe('');
  });
});

describe('proposer une adresse — LUE, jamais devinée (objets réels de la boîte)', () => {
  it('« Re: Préavis de départ - 1bis rue des pavillons Puteaux »', () => {
    expect(adresseProposee('Re: Préavis de départ - 1bis rue des pavillons Puteaux'))
      .toBe('1bis rue des pavillons Puteaux');
  });

  it('« Re: Résiliation - ZGUANG JIXI - 34 Quai de Dion Bouton 92800 PUTEAUX » — le nom du locataire reste dehors', () => {
    expect(adresseProposee('Re: Résiliation - ZGUANG JIXI - 34 Quai de Dion Bouton 92800 PUTEAUX'))
      .toBe('34 Quai de Dion Bouton 92800 PUTEAUX');
  });

  it('« Re: Lease closure - 28 avenue Marceau 92400 COURBEVOIE »', () => {
    expect(adresseProposee('Re: Lease closure - 28 avenue Marceau 92400 COURBEVOIE'))
      .toBe('28 avenue Marceau 92400 COURBEVOIE');
  });

  it('« OS DU 07 09 26 APT BENKIRANE 11 rue Paul chatrousse , Neuilly sur Seine » — les chiffres d’une date ne font pas un numéro de voie', () => {
    expect(adresseProposee('OS DU 07 09 26 APT BENKIRANE 11 rue Paul chatrousse , Neuilly sur Seine'))
      .toBe('11 rue Paul chatrousse, Neuilly sur Seine');
  });

  it('« Re: Dates travaux » — AUCUNE adresse : le champ reste vide, on n’invente pas', () => {
    expect(adresseProposee('Re: Dates travaux')).toBeNull();
    expect(adresseProposee('Appel de provisions 4e trimestre')).toBeNull();
    expect(adresseProposee(null)).toBeNull();
  });

  it('à défaut de l’objet, la PREMIÈRE LIGNE UTILE du corps (les formules d’ouverture ne comptent pas)', () => {
    const corps = 'Bonjour,\n\n12 rue de la Paix 75002 PARIS — merci de votre retour.\n\nCordialement';
    expect(adresseProposee('Re: Dates travaux', corps)).toBe('12 rue de la Paix 75002 PARIS');
  });

  it('l’objet PRIME sur le corps quand les deux portent une adresse', () => {
    expect(adresseProposee('Fuite - 5 rue Lafayette 75009 PARIS', '99 avenue Foch 75116 PARIS'))
      .toBe('5 rue Lafayette 75009 PARIS');
  });

  it('un code postal SEUL ne situe rien — il faut la commune derrière', () => {
    expect(adresseProposee('Régularisation 92800')).toBeNull();
    expect(adresseProposee('Régularisation 92800 PUTEAUX')).toBe('92800 PUTEAUX');
  });

  it('ce qui suit un tiret entouré d’espaces n’est pas de l’adresse', () => {
    expect(adresseProposee('28 avenue Marceau 92400 COURBEVOIE - merci de confirmer le rendez-vous'))
      .toBe('28 avenue Marceau 92400 COURBEVOIE');
  });

  it('la proposition reste bornée — un objet à rallonge ne remplit pas le champ de bruit', () => {
    const long = `4 rue ${'très longue '.repeat(40)}`;
    expect((adresseProposee(long) ?? '').length).toBeLessThanOrEqual(160);
  });
});
