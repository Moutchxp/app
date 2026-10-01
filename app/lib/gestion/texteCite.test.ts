import { describe, it, expect } from 'vitest';
import { retirerBlocsCites, retirerSignatureAgence, texteNonCite } from './texteCite';
import { ADRESSES_AGENCE, VOIES_AGENCE, citeUneAdresseAgence, ligneEstAdresseAgence } from './adressesAgence';
import { adresseCitee, proposerBiens, texteCherchable, type BienConnu } from './propositionsBien';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — CE QUI, DANS UN MAIL, PEUT FONDER UNE PROPOSITION ══════════════════
 *
 * LE CAS RÉEL D'ARNO (01/10/2026, mail 57306, fil 36558) : Mme THAI écrit, et l'automatisation lui propose
 * « 2 Rue Mars et Roty, Puteaux — Local commercial — lot 494 ». La cause : NOTRE signature, citée sous sa réponse.
 * 2 226 propositions vivantes en base pour cette seule raison.
 *
 * 🔴 ET LA MOITIÉ QUI COMPTE AUTANT : le lot 494 est un vrai lot, et il reste proposable quand un TIERS cite son
 * adresse dans un texte qu'il a écrit. On ne met pas une adresse sur une liste noire — on reconnaît une SIGNATURE.
 */

/** Le corps réel du mail 57306, raccourci mais pas retouché : c'est lui qui a produit le défaut. */
const MAIL_57306 = `Bonjour,

Je vous remercie.

Pourriez vous m’indiquer - lorsque vous aurez l’information - si quelqu’un
sera bien présent pour ouvrir au technicien ?

Bien cordialement,
C. Thai

Le mer. 30 sept. 2026 à 12:15, Gestion CRITERIMMO <gestion@criterimmo.fr> a
écrit :

> Bonjour Cécile,
>
> C’est bien transmis à vos locataires.
>
> *Service Gestion *
>
> 2 rue Mars et Roty, 92800 Puteaux
> <https://www.google.com/maps/search/2+rue+Mars+et+Roty,+92800+Puteaux?entry=gmail>
>
> 06 23 53 32 36
`;

const LOT_494: BienConnu = {
  cle: '494', numero: '494', adresse: '2 Rue Mars et Roty', commune: 'Puteaux',
  proprietaireCle: 'MARS', proprietaireNom: 'MARS AVENIR',
};

describe('🔴🔴 ① le cas d’Arno : la signature citée ne propose plus rien', () => {
  it('🔴🔴 le corps du mail 57306 ne cite plus le lot 494', () => {
    // AVANT le correctif, l'adresse était bel et bien « citée » — c'est tout le défaut.
    expect(adresseCitee(LOT_494, texteCherchable({ corps: MAIL_57306 }))).toBe(false);
  });

  it('🔴🔴 et donc la règle (d) ne propose plus ce lot', () => {
    const r = proposerBiens({ adresses: [], textes: { corps: MAIL_57306 }, biens: [LOT_494] });
    expect(r.issue).toBe('sans_candidat');
    expect(r.propositions).toEqual([]);
  });

  /** 🔴 LA MOITIÉ QUI COMPTE AUTANT. Un tiers qui cite l'adresse dans SON texte continue de désigner le lot. */
  it('🔴🔴 un tiers qui cite l’adresse dans un texte NON cité propose toujours le lot 494', () => {
    const r = proposerBiens({
      adresses: [],
      textes: { corps: 'Bonjour, notre technicien interviendra au 2 rue Mars et Roty mardi matin.' },
      biens: [LOT_494],
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['494']);
    expect(r.propositions[0].cas).toBe('d');
  });

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — LE CAS QU'ARNO DEMANDE D'ÉPROUVER ═══════════════════
   *
   * « Un mail dont l'expéditeur est inconnu et qui ne contient que notre signature → message affiché,
   * 0 proposition. » Côté moteur, c'est ceci : aucune adresse reconnue, un corps qui n'est QUE notre signature,
   * et pas une seule proposition. (La phrase affichée, elle, s'éprouve sur la modale.)
   */
  it('🔴🔴 expéditeur inconnu + notre signature seule : AUCUNE proposition', () => {
    const SIGNATURE_SEULE = `Bonjour,

Je reviens vers vous prochainement.

Bien cordialement,

Service Gestion

2 rue Mars et Roty, 92800 Puteaux

06 23 53 32 36
`;
    const r = proposerBiens({
      // Une adresse d'un tiers, que l'annuaire ne connaît pas : ni partie, ni propriétaire.
      adresses: [{ adresse: 'inconnu@ailleurs.fr', interne: false, partie: null, lotCle: null,
        proprietaireCle: null, duMail: true }],
      textes: { objet: 'Votre demande', corps: SIGNATURE_SEULE },
      biens: [LOT_494],
    });
    expect(r.issue).toBe('sans_candidat');
    expect(r.propositions).toEqual([]);
  });

  it('🔴 l’objet, lui, n’est jamais une citation : il continue de compter', () => {
    const r = proposerBiens({
      adresses: [],
      textes: { objet: 'Devis 2 rue Mars et Roty', corps: MAIL_57306 },
      biens: [LOT_494],
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['494']);
  });
});

describe('🔴 ② les blocs cités', () => {
  it('🔴 tout ce qui suit « Le … a écrit : » est retiré, saut de ligne compris', () => {
    const t = retirerBlocsCites('Ma phrase.\nLe lun. 1 sept., Jean <j@x.fr> a\nécrit :\nson texte à lui');
    expect(t).toContain('Ma phrase.');
    expect(t).not.toContain('son texte à lui');
  });

  it('🔴 « On … wrote: », « Message d’origine », « Message transféré »', () => {
    for (const annonce of [
      'On Mon, Sep 1, Jean <j@x.fr> wrote:', '-----Message d’origine-----', '---- Message transféré ----',
    ]) {
      expect(retirerBlocsCites(`garde\n${annonce}\njette`), annonce).not.toContain('jette');
    }
  });

  it('🔴 les lignes préfixées de « > », même sans annonce', () => {
    expect(retirerBlocsCites('garde\n> jette\n>> jette aussi')).toBe('garde');
  });

  it('🔴 les conteneurs HTML : blockquote et gmail_quote', () => {
    expect(retirerBlocsCites('<p>garde</p><blockquote>jette</blockquote>')).not.toContain('jette');
    expect(retirerBlocsCites('<p>garde</p><div class="gmail_quote x">jette</div>')).not.toContain('jette');
  });

  it('⚠️ un mail sans citation n’est pas touché', () => {
    const t = 'Bonjour,\n\nLe technicien passe mardi.\n\nCordialement';
    expect(retirerBlocsCites(t)).toBe(t);
  });

  /** ⚠️ LE PRIX ASSUMÉ : répondre SOUS la citation fait perdre son texte. Il est dit, donc il est su. */
  it('⚠️ répondre sous la citation : le texte du bas part avec elle (prix assumé)', () => {
    expect(retirerBlocsCites('Le lun. 1 sept., Jean a écrit :\n> sa phrase\nma réponse'))
      .not.toContain('ma réponse');
  });
});

describe('🔴🔴 ③ la signature de l’agence', () => {
  it('🔴 une ligne qui n’est QUE l’adresse de l’agence est une signature', () => {
    expect(ligneEstAdresseAgence('2 rue Mars et Roty, 92800 Puteaux')).toBe(true);
    expect(ligneEstAdresseAgence('   2 rue Mars et Roty   ')).toBe(true);
    expect(ligneEstAdresseAgence('Siège social : 191-195 avenue Charles de Gaulle, 92200 Neuilly-sur-Seine'))
      .toBe(true);
  });

  /** 🔴🔴 UNE PHRASE N'EST PAS UNE SIGNATURE, et c'est ce qui garde le lot 494 proposable. */
  it('🔴🔴 une phrase qui cite l’adresse n’en est pas une', () => {
    expect(ligneEstAdresseAgence('Le technicien interviendra au 2 rue Mars et Roty mardi matin')).toBe(false);
    expect(ligneEstAdresseAgence('Je vous confirme le rendez-vous du 2 rue Mars et Roty avec le syndic'))
      .toBe(false);
  });

  it('⚠️ une ligne sans adresse de l’agence n’est jamais retirée', () => {
    expect(ligneEstAdresseAgence('10 rue Chateaubriand, 92320 CHATILLON')).toBe(false);
    expect(ligneEstAdresseAgence('')).toBe(false);
  });

  it('🔴 la signature est retirée du corps, la phrase reste', () => {
    const t = retirerSignatureAgence('Service Gestion\n2 rue Mars et Roty, 92800 Puteaux\nintervention au 2 rue Mars et Roty');
    expect(t).not.toContain('92800');
    expect(t).toContain('intervention au 2 rue Mars et Roty');
  });

  /** ⚠️ UNE ADRESSE DANS UN LIEN N'EST PAS UNE PHRASE : le plan Google de notre signature la portait. */
  it('⚠️ une adresse glissée dans un lien ne compte pas', () => {
    expect(texteNonCite('https://www.google.com/maps/search/2+rue+Mars+et+Roty,+92800+Puteaux'))
      .not.toContain('Mars');
  });
});

describe('🔴 ④ la liste centrale', () => {
  it('🔴 elle porte le bureau ET le siège, et c’est la seule', () => {
    expect(ADRESSES_AGENCE.map((a) => a.role)).toEqual(['bureau', 'siege']);
    expect(VOIES_AGENCE).toEqual(['2 rue Mars et Roty', '191-195 avenue Charles de Gaulle']);
  });

  it('les deux adresses sont reconnues dans un texte', () => {
    expect(citeUneAdresseAgence('…au 2 Rue Mars et Roty…')).toBe(true);
    expect(citeUneAdresseAgence('…191-195 avenue Charles de Gaulle…')).toBe(true);
    expect(citeUneAdresseAgence('…10 rue Chateaubriand…')).toBe(false);
  });
});
