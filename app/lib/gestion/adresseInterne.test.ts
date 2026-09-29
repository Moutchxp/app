import { describe, expect, it } from 'vitest';
import { adressesRapprochables, DOMAINES_INTERNES, estAdresseInterne } from './adresseInterne';
import { estInterne } from './adressesMessage';
import { estAdresseMaison, DOMAINES_MAISON } from './triPieces';
import { proposerBiens, type AdresseVue, type BienConnu } from './propositionsBien';

/**
 * LOT BOITE-INTERNE-CORBEILLE — NOS ADRESSES NE DÉSIGNENT JAMAIS UNE PARTIE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CES TESTS PROTÈGENT. Six fiches WIPPIMMO portent une de nos adresses — ce sont de VRAIS dossiers :
 * nous sommes bailleurs ou preneurs à titre personnel ou par nos sociétés. Rien ne permet de les repérer par leur
 * contenu ; seule l'adresse les trahit. Sans la règle, tout mail interne se coiffe de « PROPRIÉTAIRE JOREL
 * Arnaud… », ce qui affirme une qualité que le mail n'a pas.
 *
 * 🔴 ET SURTOUT : QUE LA RÈGLE N'AIT QU'UN SEUL ENDROIT. Elle existait en deux copies, et une troisième voie ne la
 * connaissait pas. Les tests de convergence ci-dessous sont là POUR ÇA : ils échouent le jour où quelqu'un réécrit
 * la règle localement au lieu de l'importer.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les adresses relevées en base le 29/09/2026, avec la fiche qu'elles atteignaient à tort. */
const NOS_ADRESSES = [
  'a.jorel@sansvisavis.com',      // PROPRIÉTAIRE 45, 149, 344 — et LOCATAIRE 850
  'c.jullien@sansvisavis.com',    // PROPRIÉTAIRE 79, 344 — et LOCATAIRE 850
  'm.cohen@sansvisavis.com',      // PROPRIÉTAIRE 256
  'gestion@criterimmo.fr',
  'jb.pons@sansvisavis.com',
];

describe('la règle : @sansvisavis.com et @criterimmo.fr, jamais une clé', () => {
  it.each(NOS_ADRESSES)('🔴 « %s » est interne', (a) => {
    expect(estAdresseInterne(a)).toBe(true);
  });

  it('une adresse de client ne l’est pas', () => {
    expect(estAdresseInterne('marinejaffret@yahoo.com')).toBe(false);
    expect(estAdresseInterne('richard.hary57@outlook.com')).toBe(false);
  });

  /** ⚠️ LA CASSE ET LES ESPACES NE SAUVENT PERSONNE : un en-tête écrit « A.Jorel@SansVisAVis.com » à l'occasion. */
  it('la casse et les espaces ne contournent pas la règle', () => {
    expect(estAdresseInterne('  A.Jorel@SansVisAVis.COM ')).toBe(true);
  });

  /** ⚠️ LES SOUS-DOMAINES COMPTENT — le jour où l'on enverra depuis `mail.criterimmo.fr`. */
  it('🔴 un sous-domaine est interne aussi', () => {
    expect(estAdresseInterne('robot@mail.criterimmo.fr')).toBe(true);
    expect(estAdresseInterne('x@envoi.sansvisavis.com')).toBe(true);
  });

  /**
   * 🔴 LE PIÈGE DU SUFFIXE. « criterimmo.fr.attaquant.com » se TERMINE par rien de commun, mais
   * « faussecriterimmo.fr » se termine bien par « criterimmo.fr » en simple comparaison de chaînes. Le point
   * séparateur est ce qui distingue un sous-domaine d'un domaine qui nous ressemble.
   */
  it('🔴 un domaine qui RESSEMBLE au nôtre n’est pas le nôtre', () => {
    expect(estAdresseInterne('x@faussecriterimmo.fr')).toBe(false);
    expect(estAdresseInterne('x@criterimmo.fr.exemple.com')).toBe(false);
  });

  /** Une adresse illisible ne désigne personne — la traiter comme utilisable ferait chercher une fiche pour rien. */
  it('une adresse vide ou sans arobase ne rapproche rien non plus', () => {
    expect(estAdresseInterne('')).toBe(true);
    expect(estAdresseInterne(null)).toBe(true);
    expect(estAdresseInterne('pas-une-adresse')).toBe(true);
  });

  /** Le partenaire interne (ADHOC) : ni nous ni un client, mais des deux côtés de tous les dossiers. */
  it('une adresse passée en « autres » est interne', () => {
    expect(estAdresseInterne('compta@adhoc-gestion.fr')).toBe(false);
    expect(estAdresseInterne('compta@adhoc-gestion.fr', ['compta@adhoc-gestion.fr'])).toBe(true);
  });
});

describe('🔴 ce qu’il reste à rapprocher', () => {
  it('nos adresses sortent, les tierces restent, dans l’ordre', () => {
    expect(adressesRapprochables([
      'a.jorel@sansvisavis.com', 'marinejaffret@yahoo.com', 'gestion@criterimmo.fr', 'syndic@exemple.fr',
    ])).toEqual(['marinejaffret@yahoo.com', 'syndic@exemple.fr']);
  });

  /**
   * 🔴 LE CAS DU MAIL INTERNE : il ne reste PERSONNE. C'est une réponse, pas un échec — et c'est elle qui fait
   * disparaître le bloc des parties entièrement, au lieu de le vider en laissant son cadre.
   */
  it('🔴 un mail entre nous ne laisse personne à rapprocher', () => {
    expect(adressesRapprochables([
      'a.jorel@sansvisavis.com', 'jb.pons@sansvisavis.com', 'gestion@criterimmo.fr',
    ])).toEqual([]);
  });

  it('dédoublonne et met en minuscules', () => {
    expect(adressesRapprochables(['Marine@Yahoo.com', 'marine@yahoo.com'])).toEqual(['marine@yahoo.com']);
  });
});

describe('🔴 la règle n’a qu’un seul endroit — les autres voies la LISENT', () => {
  /**
   * Ces deux tests échouent le jour où quelqu'un réécrit la règle localement. C'est exactement ce qui s'était
   * produit : deux copies qui tenaient, une troisième voie qui ne savait rien.
   */
  it('`triPieces.estAdresseMaison` donne la même réponse', () => {
    for (const a of [...NOS_ADRESSES, 'marinejaffret@yahoo.com', 'x@mail.criterimmo.fr', 'x@faussecriterimmo.fr']) {
      expect(estAdresseMaison(a, [])).toBe(estAdresseInterne(a));
    }
  });

  it('`adressesMessage.estInterne` donne la même réponse', () => {
    for (const a of [...NOS_ADRESSES, 'marinejaffret@yahoo.com', 'x@envoi.sansvisavis.com']) {
      expect(estInterne(a, 'gestion@criterimmo.fr')).toBe(estAdresseInterne(a, ['gestion@criterimmo.fr']));
    }
  });

  it('`DOMAINES_MAISON` EST la liste centrale, pas une copie', () => {
    expect(DOMAINES_MAISON).toBe(DOMAINES_INTERNES);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   AUCUNE PROPOSITION DE BIEN — ET POURTANT LA RÈGLE (d) RESTE ACTIVE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const LOT_MARCEAU: BienConnu = {
  cle: '421', numero: '421', adresse: '28 Avenue Marceau', commune: 'Courbevoie',
  proprietaireCle: 'P289', proprietaireNom: 'GARREAU Gabrielle',
};
const LOT_UNION: BienConnu = {
  cle: '45', numero: '45', adresse: '7 avenue de l’Union', commune: 'ASNIERES SUR SEINE',
  proprietaireCle: 'P144', proprietaireNom: 'JOREL Arnaud',
};

/** L'adresse telle que la relève la marque : interne, donc jamais reconnue comme partie (`reconnaitre`). */
const interne = (adresse: string): AdresseVue => ({
  adresse, interne: true, partie: null, lotCle: null, proprietaireCle: null, duMail: true,
});

describe('🔴 un mail interne ne propose aucun bien PAR L’ADRESSE', () => {
  it('même si l’adresse porte une fiche, elle ne donne rien', () => {
    /**
     * ⚠️ LE PIÈGE QU'ON SIMULE ICI : une adresse interne à qui l'on aurait quand même attaché sa fiche. C'est ce
     * qui arriverait si `reconnaitre` cessait d'écarter les internes — le moteur doit tenir TOUT SEUL.
     */
    const piegee: AdresseVue = {
      adresse: 'a.jorel@sansvisavis.com', interne: true, partie: 'proprietaire',
      lotCle: null, proprietaireCle: 'P144', duMail: true,
    };
    const e = proposerBiens({ adresses: [piegee], biens: [LOT_UNION] });
    expect(e.issue).toBe('sans_candidat');
    expect(e.propositions).toEqual([]);
  });

  it('un échange entièrement interne, sans texte, ne propose rien', () => {
    const e = proposerBiens({
      adresses: [interne('a.jorel@sansvisavis.com'), interne('jb.pons@sansvisavis.com'),
        interne('gestion@criterimmo.fr')],
      biens: [LOT_UNION, LOT_MARCEAU],
    });
    expect(e.issue).toBe('sans_candidat');
  });
});

describe('🔴 …mais la règle (d) reste pleinement active sur un mail interne', () => {
  /**
   * 🔴 DEMANDE EXPLICITE D'ARNO : « Les propositions par adresse ou n° de lot cité dans l'objet, le corps ou une
   * pièce jointe (règle d) restent actives pour un mail interne. » Elles ne partent d'aucune adresse électronique,
   * donc rien de ce lot ne les concerne — et c'est ce qui explique que le mail 57185 garde ses 4 propositions.
   */
  it('l’adresse postale citée dans le corps propose toujours le logement', () => {
    const e = proposerBiens({
      adresses: [interne('a.jorel@sansvisavis.com'), interne('jb.pons@sansvisavis.com')],
      textes: { corps: 'Le studio du 28 Avenue Marceau se libère fin octobre.' },
      biens: [LOT_MARCEAU],
    });
    expect(e.propositions.map((p) => p.cle)).toEqual(['421']);
    expect(e.propositions[0].cas).toBe('d');
  });

  it('le n° de lot cité dans l’objet aussi', () => {
    const e = proposerBiens({
      adresses: [interne('gestion@criterimmo.fr')],
      textes: { objet: 'Régularisation lot 421' },
      biens: [LOT_MARCEAU],
    });
    expect(e.propositions.map((p) => p.cas)).toEqual(['d']);
  });

  /** ⚠️ ET ELLE NE DEVIENT JAMAIS AUTOMATIQUE : la règle (d) propose, un humain tranche. */
  it('🔴 une proposition (d) reste à trancher, jamais automatique', () => {
    const e = proposerBiens({
      adresses: [interne('a.jorel@sansvisavis.com')],
      textes: { corps: '28 Avenue Marceau' },
      biens: [LOT_MARCEAU],
    });
    expect(e.issue).toBe('a_trancher');
  });
});
