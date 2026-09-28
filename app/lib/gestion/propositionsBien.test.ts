import { describe, it, expect } from 'vitest';
import {
  adresseCitee, citationDuBien, lotCite, normaliser, proposerBiens, texteCherchable,
  type AdresseVue, type BienConnu,
} from './propositionsBien';

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — LA CIBLE D'UN CLASSEMENT EST TOUJOURS UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Module PUR : les cinq cas d'Arno se rejouent ici sans base, sans écran et sans rien écrire.
 *   (a) locataire dans l'échange → son bien, quasi certain ;
 *   (b) propriétaire à UN seul bien → ce bien, quasi certain ;
 *   (c) propriétaire à PLUSIEURS biens → tous, rien de coché, sauf citation explicite ;
 *   (d) aucune adresse reconnue → le bien cité dans l'objet, le corps ou un nom de pièce ;
 *   (e) NOS adresses ne sont jamais une source — mais les tierces qu'elles citent le restent.
 *
 * 🔴 ET SURTOUT : on ne propose JAMAIS un propriétaire ni un locataire seul. Le cas réel qui a déclenché le lot —
 * « Contestation de la retenue de 450 € sur dépôt de garantie » proposait « PROPRIÉTAIRE MARTY (310) » — est rejoué
 * tel quel plus bas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const bien = (cle: string, o: Partial<BienConnu> = {}): BienConnu => ({
  cle, numero: cle, adresse: '12 rue Danton', commune: 'Levallois-Perret',
  proprietaireCle: 'P1', proprietaireNom: 'MARTY Jean-François', ...o,
});
const adr = (o: Partial<AdresseVue> = {}): AdresseVue => ({
  adresse: 'x@exemple.fr', interne: false, partie: null, lotCle: null, proprietaireCle: null, duMail: true, ...o,
});

describe('🔴 (a) une adresse de LOCATAIRE désigne SON bien', () => {
  it('un seul locataire ⇒ un seul bien, quasi certain, et le lien est AUTOMATIQUE', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'thirion@gmail.com', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' })],
      biens: [bien('445')],
    });
    expect(r.issue).toBe('automatique');
    expect(r.propositions).toHaveLength(1);
    expect(r.propositions[0]).toMatchObject({ cle: '445', cas: 'a', certitude: 'quasi_certaine', preCoche: true });
    expect(r.propositions[0].motif).toContain('locataire en place à la date du mail');
  });

  it('🔴 le bail du locataire est celui de LA DATE DU MAIL : un lot absent de la reconnaissance ne donne rien', () => {
    // Locataire parti : l'annuaire le reconnaît (partie), mais aucun bail ne couvre la date ⇒ `lotCle` vide.
    const r = proposerBiens({
      adresses: [adr({ adresse: 'parti@gmail.com', partie: 'locataire', lotCle: null, proprietaireCle: null })],
      biens: [bien('445')],
    });
    expect(r.issue).toBe('sans_candidat');
    expect(r.motif).toContain('aucune ne désigne de bien à la date du mail');
  });

  it('deux locataires de deux biens ⇒ DEUX propositions, et rien d’automatique : ce sont deux dossiers', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'a@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' }),
        adr({ adresse: 'b@x.fr', partie: 'locataire', lotCle: '446', proprietaireCle: 'P2' }),
      ],
      biens: [bien('445'), bien('446', { proprietaireCle: 'P2' })],
    });
    expect(r.issue).toBe('a_trancher');
    expect(r.propositions.map((p) => p.cle)).toEqual(['445', '446']);
    expect(r.motif).toContain('plusieurs dossiers');
  });

  it('🔴 l’adresse d’un locataire n’ouvre PAS la liste des biens de son bailleur', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' })],
      biens: [bien('445'), bien('446'), bien('447')],
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['445']);
  });
});

describe('🔴 (b) un PROPRIÉTAIRE qui n’a QU’UN bien', () => {
  it('⇒ ce bien, quasi certain, et le lien est AUTOMATIQUE', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [bien('445')],
    });
    expect(r.issue).toBe('automatique');
    expect(r.propositions[0]).toMatchObject({ cle: '445', cas: 'b', preCoche: true });
    expect(r.propositions[0].motif).toContain('n’a qu’un bien en gestion');
  });

  it('🔴 et c’est un BIEN qui est proposé, jamais le propriétaire lui-même', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [bien('445')],
    });
    // Aucune proposition ne porte une clé de propriétaire : la cible est toujours une clé de LOT.
    expect(r.propositions.every((p) => p.cle !== 'P1')).toBe(true);
  });
});

describe('🔴 (c) un PROPRIÉTAIRE à PLUSIEURS biens', () => {
  const troisBiens = [
    bien('445', { adresse: '1bis rue des Pavillons', commune: 'Puteaux' }),
    bien('446', { adresse: '1bis rue des Pavillons', commune: 'Puteaux' }),
    bien('447', { adresse: '30 avenue de Verdun', commune: 'Courbevoie' }),
  ];

  it('⇒ TOUS ses biens sont proposés, et AUCUN n’est pré-coché', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
    });
    expect(r.issue).toBe('a_trancher');
    expect(r.propositions.map((p) => p.cle)).toEqual(['445', '446', '447']);
    expect(r.propositions.every((p) => p.preCoche === false)).toBe(true);
    expect(r.propositions[0].motif).toContain('un des 3 biens de MARTY Jean-François');
  });

  it('🔴 SAUF si l’adresse d’un de ces biens est citée dans l’objet : celui-là est coché, et on DIT pourquoi', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { objet: 'Charges 30 avenue de Verdun, Courbevoie' },
    });
    const coches = r.propositions.filter((p) => p.preCoche);
    expect(coches.map((p) => p.cle)).toEqual(['447']);
    expect(coches[0].motif).toContain('adresse cité dans le mail');
  });

  it('…ou si le n° de lot est cité dans le corps', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { corps: 'Bonjour, concernant le lot 446, voici la facture.' },
    });
    expect(r.propositions.filter((p) => p.preCoche).map((p) => p.cle)).toEqual(['446']);
    expect(r.propositions.find((p) => p.cle === '446')?.motif).toContain('n° de lot cité dans le mail');
  });

  it('…ou dans le NOM D’UNE PIÈCE JOINTE', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { pieces: ['Quittance 30 avenue de Verdun juillet.pdf'] },
    });
    expect(r.propositions.filter((p) => p.preCoche).map((p) => p.cle)).toEqual(['447']);
  });

  it('plusieurs biens cités ⇒ plusieurs cochés : un mail parle parfois de deux appartements', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { corps: 'appels de fonds pour le lot 445 et le lot 447' },
    });
    expect(r.propositions.filter((p) => p.preCoche).map((p) => p.cle)).toEqual(['445', '447']);
  });

  it('🔴 une citation ne rend PAS le lien automatique : elle coche, l’humain valide', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { corps: 'le lot 446' },
    });
    expect(r.issue).toBe('a_trancher');
  });
});

describe('🔴 (d) aucune adresse reconnue : le TEXTE, et lui seul', () => {
  it('l’adresse du bien citée dans l’objet suffit à le proposer — et jamais à l’automatiser', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'syndic@inconnu.fr' })],
      biens: [bien('445', { adresse: '18 rue Danton', commune: 'Levallois-Perret' }), bien('999', {
        adresse: '4 place Charras', commune: 'Courbevoie', proprietaireCle: 'P9',
      })],
      textes: { objet: 'Taxes foncières 2026 — 18 rue Danton à Levallois-Perret' },
    });
    expect(r.issue).toBe('a_trancher');
    expect(r.propositions.map((p) => p.cle)).toEqual(['445']);
    expect(r.propositions[0]).toMatchObject({ cas: 'd', preCoche: true });
    expect(r.propositions[0].motif).toContain('aucune adresse connue');
  });

  it('le n° de lot cité suffit aussi (mails Monga, comptabilité)', () => {
    const r = proposerBiens({
      adresses: [],
      biens: [bien('375', { adresse: '1bis rue des Pavillons' })],
      textes: { corps: 'MNG-20354 — rappel pour le lot 375, porte de box défaillante' },
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['375']);
  });

  it('🔴 le cas (d) ne se déclenche QUE si aucune adresse n’a rien donné', () => {
    // Une adresse de locataire a déjà tranché : on n'ajoute pas les biens cités par le texte par-dessus.
    const r = proposerBiens({
      adresses: [adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' })],
      biens: [bien('445'), bien('999', { adresse: '4 place Charras', proprietaireCle: 'P9' })],
      textes: { corps: 'voir aussi le 4 place Charras' },
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['445']);
  });
});

describe('🔴 (e) nos adresses ne sont jamais une source — les tierces qu’elles citent, si', () => {
  it('un mail de la compta externalisée seule ne propose RIEN par ses adresses', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'gestion.criterimmo@gmail.com', interne: true, proprietaireCle: 'P1' }),
        adr({ adresse: 'gestion@criterimmo.fr', interne: true, proprietaireCle: 'P1' }),
      ],
      biens: [bien('445'), bien('446')],
    });
    expect(r.issue).toBe('sans_candidat');
    expect(r.motif).toContain('aucune adresse de l’échange n’est connue');
  });

  it('…mais l’adresse TIERCE mise en copie par la compta reste pleinement utilisable', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'gestion.criterimmo@gmail.com', interne: true }),
        adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' }),
      ],
      biens: [bien('445')],
    });
    expect(r.issue).toBe('automatique');
    expect(r.propositions[0].cle).toBe('445');
  });
});

describe('🔴 LE CAS RÉEL D’ARNO — « Contestation de la retenue de 450 € sur dépôt de garantie »', () => {
  const biensMarty = [
    bien('310a', { numero: '310', adresse: '18 rue Danton', commune: 'Levallois-Perret' }),
    bien('310b', { numero: '311', adresse: '20 rue Danton', commune: 'Levallois-Perret' }),
  ];

  it('ne propose PLUS « propriétaire MARTY » : il propose ses BIENS, à trancher', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'gestion.criterimmo@gmail.com', interne: true }),
        adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' }),
      ],
      biens: biensMarty,
      textes: { objet: 'Contestation de la retenue de 450€ sur dépôt de garantie' },
    });
    expect(r.issue).toBe('a_trancher');
    expect(r.propositions.map((p) => p.cle)).toEqual(['310a', '310b']);
    expect(r.propositions.every((p) => p.motif.includes('biens de MARTY Jean-François'))).toBe(true);
  });

  it('🔴 « 450 » du montant ne coche AUCUN lot : un nombre nu n’est pas un n° de lot', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: [...biensMarty, bien('450', { adresse: '9 rue de Paris', commune: 'Puteaux' })],
      textes: { objet: 'Contestation de la retenue de 450€ sur dépôt de garantie' },
    });
    expect(r.propositions.every((p) => p.preCoche === false)).toBe(true);
  });
});

describe('la reconnaissance d’un bien dans un texte', () => {
  it('normalise accents, casse et ponctuation', () => {
    expect(normaliser('127 Rue GÉRHARD, Puteaux !')).toBe('127 rue gerhard puteaux');
    expect(normaliser(null)).toBe('');
  });

  it('🔴 une adresse exige le NUMÉRO et le nom de voie : « rue Danton » seul ne suffit pas', () => {
    const b = bien('1', { adresse: '18 rue Danton' });
    expect(adresseCitee(b, normaliser('facture 18 rue Danton'))).toBe(true);
    expect(adresseCitee(b, normaliser('un souci rue Danton'))).toBe(false);
    expect(adresseCitee(b, normaliser('facture 20 rue Danton'))).toBe(false);
  });

  it('une adresse sans numéro ne peut pas être reconnue — et on ne devine pas', () => {
    expect(adresseCitee(bien('1', { adresse: 'rue Danton' }), normaliser('rue Danton'))).toBe(false);
    expect(adresseCitee(bien('1', { adresse: null }), normaliser('peu importe'))).toBe(false);
  });

  it('🔴 un n° de lot exige le MOT « lot » : sinon tout montant deviendrait un lot', () => {
    const b = bien('445');
    expect(lotCite(b, normaliser('le lot 445'))).toBe(true);
    expect(lotCite(b, normaliser('LOT N° 445'))).toBe(true);
    expect(lotCite(b, normaliser('logement 445'))).toBe(true);
    expect(lotCite(b, normaliser('une retenue de 445 euros'))).toBe(false);
    expect(lotCite(b, normaliser('le lot 4456'))).toBe(false);
  });

  it('une clé non numérique n’est pas cherchée comme un n° de lot', () => {
    expect(lotCite(bien('AB12', { numero: 'AB12' }), normaliser('lot AB12'))).toBe(false);
  });

  it('la citation dit PAR QUOI le bien a été reconnu', () => {
    const b = bien('445', { adresse: '18 rue Danton' });
    expect(citationDuBien(b, normaliser('18 rue Danton'))).toBe('adresse');
    expect(citationDuBien(b, normaliser('le lot 445'))).toBe('lot');
    expect(citationDuBien(b, normaliser('rien à voir'))).toBeNull();
  });

  it('le texte cherché réunit objet, corps et noms de pièces', () => {
    expect(texteCherchable({ objet: 'Objet', corps: 'Corps', pieces: ['P1.pdf'] })).toBe('objet corps p1 pdf');
  });
});

describe('l’échange comme second souffle', () => {
  it('le mail ne dit rien, mais l’échange porte un locataire ⇒ proposition (jamais automatique)', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'syndic@inconnu.fr', duMail: true }),
        adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1', duMail: false }),
      ],
      biens: [bien('445')],
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['445']);
    expect(r.propositions[0].motif).toContain('vu ailleurs dans l’échange');
    /**
     * 🔴 TOUJOURS À TRANCHER, MÊME SEUL. Le mail d'un tiers — syndic, artisan, assureur — ne doit jamais hériter
     * d'office du logement du voisin de fil : ce serait écrire dans le dossier d'un client une pièce qui n'est
     * peut-être pas la sienne, sans que personne le voie. Règle déjà mesurée au lot RATTACHEMENT-1.
     */
    expect(r.issue).toBe('a_trancher');
    expect(r.motif).toContain('à confirmer à la main');
  });

  it('le mail prime : s’il désigne un bien, l’échange n’ajoute rien', () => {
    const r = proposerBiens({
      adresses: [
        adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1', duMail: true }),
        adr({ adresse: 'autre@x.fr', partie: 'locataire', lotCle: '999', proprietaireCle: 'P9', duMail: false }),
      ],
      biens: [bien('445'), bien('999', { proprietaireCle: 'P9' })],
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['445']);
  });
});
