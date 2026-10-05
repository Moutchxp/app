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

  /**
   * ══ 🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — CET ATTENDU EST RETOURNÉ, SUR DEMANDE D'ARNO ═════════════════
   *
   * Il disait : « SAUF si l'adresse d'un de ces biens est citée dans l'objet : celui-là est COCHÉ. » Arno a
   * tranché le 02/10/2026, après avoir vu « 76 bien(s) coché(s) sur 76 affiché(s) » sur le fil 193 :
   *
   *     « Pourquoi la règle "adresse citée" pré-coche-t-elle ? Elle fait partie des propositions par le contenu,
   *       qui doivent être DÉCOCHÉES, comme la règle e. »
   *
   * 🔴 LA PROPOSITION RESTE, ET SON MOTIF AUSSI : seule la CASE change. Rien n'est retiré — on cesse de cocher.
   * Le n° de lot, lui, continue de cocher (épreuve suivante) : il désigne UN logement, pas un immeuble.
   */
  it('🔴🔴 une adresse citée PROPOSE, mais ne coche JAMAIS (76 lots au même numéro)', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { objet: 'Charges 30 avenue de Verdun, Courbevoie' },
    });
    // La proposition EST là, et elle dit pourquoi…
    const cite = r.propositions.find((p) => p.cle === '447');
    expect(cite?.motif).toContain('adresse citée dans le mail');
    // … mais AUCUNE case n'est cochée.
    expect(r.propositions.filter((p) => p.preCoche)).toEqual([]);
    // ⚠️ ET LES TROIS BIENS SONT TOUJOURS PROPOSÉS : on n'a rien perdu.
    expect(r.propositions.map((p) => p.cle).sort()).toEqual(['445', '446', '447']);
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

  it('…et le NOM D’UNE PIÈCE JOINTE est fouillé lui aussi — mais une adresse n’y coche pas davantage', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { pieces: ['Quittance 30 avenue de Verdun juillet.pdf'] },
    });
    // 🔴 LA FOUILLE DU NOM DE PIÈCE N'A PAS CHANGÉ : le bien est bien reconnu, et son motif le dit.
    expect(r.propositions.find((p) => p.cle === '447')?.motif).toContain('adresse citée dans le mail');
    // 🔴 SEULE LA CASE CHANGE : une adresse, d'où qu'elle vienne, ne coche plus.
    expect(r.propositions.filter((p) => p.preCoche)).toEqual([]);
  });

  it('🔴🔴 un n° de lot dans le nom d’une pièce, LUI, coche toujours : il désigne UN logement', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'marty@free.fr', partie: 'proprietaire', proprietaireCle: 'P1' })],
      biens: troisBiens,
      textes: { pieces: ['Appel de fonds lot 446.pdf'] },
    });
    expect(r.propositions.filter((p) => p.preCoche).map((p) => p.cle)).toEqual(['446']);
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
    /**
     * 🔴🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — `preCoche` ÉTAIT `true` ICI, et c'est le défaut du fil 193.
     * Ce cas est la DERNIÈRE chance du moteur : aucune adresse n'est connue, et il fouille le texte. Une
     * trouvaille de dernière chance ne coche pas — elle propose. (Le n° de lot garde son droit : épreuve
     * suivante.)
     */
    expect(r.propositions[0]).toMatchObject({ cas: 'd', preCoche: false, certitude: 'a_trancher' });
    expect(r.propositions[0].motif).toContain('aucune adresse connue');
    expect(r.propositions[0].motif).toContain('adresse citée dans le mail');
    // 🔴 ET LE N° DE LOT N'EST PLUS ÉCRIT : le mail ne le citait pas (demande d'Arno).
    expect(r.propositions[0].motif).not.toContain('lot 445');
    expect(r.propositions[0].motif).toContain('18 rue Danton');
  });

  it('le n° de lot cité suffit aussi (mails Monga, comptabilité) — et LUI coche', () => {
    const r = proposerBiens({
      adresses: [],
      biens: [bien('375', { adresse: '1bis rue des Pavillons' })],
      textes: { corps: 'MNG-20354 — rappel pour le lot 375, porte de box défaillante' },
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['375']);
    // 🔴 UN N° DE LOT DÉSIGNE UN LOGEMENT, pas un immeuble : il garde son droit de cocher.
    expect(r.propositions[0].preCoche).toBe(true);
    // 🔴 ET LE MOTIF PEUT, LUI, ÉCRIRE LE N° : le mail le cite vraiment.
    expect(r.propositions[0].motif).toContain('lot 375');
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LE CAS D'ARNO : UNE ADRESSE, SOIXANTE-SEIZE LOTS (fil 193, 02/10/2026)
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Un immeuble de N lots à la même adresse — exactement le 54 avenue Puvis de Chavannes et ses 76 lots. */
  const immeuble = (n: number, proprietaireCle: string | null = null) =>
    Array.from({ length: n }, (_, i) => bien(String(100 + i), {
      adresse: '54 avenue Puvis de Chavannes', commune: 'Courbevoie', proprietaireCle,
    }));

  it('🔴🔴 76 lots à la même adresse : TOUS proposés, AUCUN coché', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'frederic.racan@free.fr' })],
      biens: immeuble(76),
      textes: { objet: 'Remboursement dépôt de garantie / 54 avenue Puvis de Chavannes, Courbevoie' },
    });
    expect(r.propositions).toHaveLength(76);
    // 🔴 LE DÉFAUT D'ARNO, RETOURNÉ : « 76 bien(s) coché(s) sur 76 affiché(s) » devient zéro coché.
    expect(r.propositions.filter((p) => p.preCoche)).toEqual([]);
    expect(r.issue).toBe('a_trancher');
  });

  it('🔴🔴 et seuls CINQ sont montrés : les 71 autres se replient derrière « voir les autres »', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'frederic.racan@free.fr' })],
      biens: immeuble(76),
      textes: { objet: 'Remboursement dépôt de garantie / 54 avenue Puvis de Chavannes, Courbevoie' },
    });
    expect(r.propositions.filter((p) => p.replie !== true)).toHaveLength(5);
    expect(r.propositions.filter((p) => p.replie === true)).toHaveLength(71);
    // ⚠️ RIEN N'EST PERDU : les 76 sont toujours là, et se cochent si on les déplie.
    expect(r.propositions).toHaveLength(76);
  });

  it('🔴🔴 le LOT CITÉ passe devant, et il est coché — même au milieu de 76', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'frederic.racan@free.fr' })],
      biens: immeuble(76),
      // Le mail nomme l'immeuble ET un lot précis : c'est celui-là qu'on veut voir, et cocher.
      textes: { objet: 'Dépôt de garantie 54 avenue Puvis de Chavannes, Courbevoie — lot 142' },
    });
    const coches = r.propositions.filter((p) => p.preCoche);
    expect(coches.map((p) => p.cle)).toEqual(['142']);
    // 🔴 ET IL EST VISIBLE D'EMBLÉE : un bien coché qu'il faudrait déplier pour voir serait le pire des cas.
    expect(r.propositions.find((p) => p.cle === '142')?.replie).not.toBe(true);
  });

  /**
   * ⚠️ UNE ÉPREUVE QUI A CHANGÉ DE SUJET, ET C'EST ELLE QUI L'A VOULU. Elle devait montrer qu'un bien dont le
   * propriétaire écrit dans l'échange passe devant ses voisins. Elle a montré AUTRE CHOSE : dès qu'une adresse
   * reconnue désigne un propriétaire qui possède un bien, c'est le cas (c) qui répond — et le cas (d) ne se
   * déclenche jamais. Le critère était donc inatteignable ; il a été retiré de `biensCitesAMontrer`, et cette
   * épreuve garde désormais la raison pour laquelle il n'y est pas.
   */
  it('🔴 un propriétaire reconnu fait répondre le cas (c), jamais le (d) — d’où un seul bien proposé', () => {
    const biens = [
      ...immeuble(10),
      bien('999', { adresse: '54 avenue Puvis de Chavannes', commune: 'Courbevoie', proprietaireCle: 'P7' }),
    ];
    const r = proposerBiens({
      adresses: [adr({ adresse: 'bailleur@x.fr', proprietaireCle: 'P7' })],
      biens,
      textes: { objet: 'Charges 54 avenue Puvis de Chavannes, Courbevoie' },
    });
    // Le cas (b) a tranché : un propriétaire à bien UNIQUE, c'est son bien, et lui seul.
    expect(r.propositions.map((p) => p.cle)).toEqual(['999']);
    expect(r.propositions[0].cas).toBe('b');
  });

  it('🔴 au-dessous de six, rien ne se replie : le dépliage ne sert à rien sur cinq lignes', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'syndic@inconnu.fr' })],
      biens: immeuble(4),
      textes: { objet: 'Ravalement 54 avenue Puvis de Chavannes, Courbevoie' },
    });
    expect(r.propositions).toHaveLength(4);
    expect(r.propositions.every((p) => p.replie !== true)).toBe(true);
  });

  it('🔴🔴 le motif DIT combien de lots partagent l’adresse, et n’écrit PAS le n° de lot', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'syndic@inconnu.fr' })],
      biens: immeuble(76),
      textes: { objet: 'Ravalement 54 avenue Puvis de Chavannes, Courbevoie' },
    });
    const m = r.propositions[0].motif;
    expect(m).toContain('adresse citée dans le mail');
    expect(m).toContain('un des 76 lots de cette adresse');
    // 🔴 DEMANDE D'ARNO : « n'affiche le n° de lot que s'il figure vraiment dans le mail ».
    expect(m).not.toContain('lot 100');
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

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LE CAS (e), ET SA RÈGLE ABSOLUE ═════════════════════════════════════
 *
 * ARNO (01/10/2026) : « Une correspondance trouvée dans le CONTENU (et pas dans l'adresse de l'expéditeur ou des
 * destinataires) ne rattache JAMAIS le mail automatiquement : jamais de statut “Auto”, jamais de lien confirmé,
 * jamais d'héritage de période ; dans la modale, ces propositions apparaissent DÉCOCHÉES. »
 */
describe('🔴🔴 (e) le texte nomme quelqu’un de l’annuaire', () => {
  const CHAKROUN = {
    cle: 'locataire|106', role: 'locataire' as const, nom: 'CHAKROUN Zahra',
    emails: ['zahrachakroun@gmail.com'], telephones: [], lots: ['295'],
  };
  const CONTENU = { personnes: [CHAKROUN] };
  const MOTIF = { corps: 'Motif de l’opération : LOYER ZAHRA CHAKROUN oct 2026' };

  it('🔴 le bien de la personne nommée est proposé, avec l’extrait réel', () => {
    const r = proposerBiens({ adresses: [], textes: MOTIF, biens: [bien('295')], contenu: CONTENU });
    expect(r.propositions.map((p) => p.cle)).toEqual(['295']);
    expect(r.propositions[0].motif).toContain('trouvé dans le contenu du mail');
    expect(r.propositions[0].motif).toContain('LOYER ZAHRA CHAKROUN');
  });

  /** 🔴🔴 LA RÈGLE ABSOLUE, ÉPROUVÉE DE TROIS FAÇONS : décoché, à trancher, et jamais « automatique ». */
  it('🔴🔴 JAMAIS cochée, JAMAIS quasi certaine, JAMAIS automatique — même toute seule', () => {
    const r = proposerBiens({ adresses: [], textes: MOTIF, biens: [bien('295')], contenu: CONTENU });
    expect(r.propositions[0]).toMatchObject({ cas: 'e', certitude: 'a_trancher', preCoche: false });
    expect(r.issue).toBe('a_trancher');
    expect(r.issue).not.toBe('automatique');
  });

  it('🔴 son adresse e-mail citée dans le texte ne la coche pas davantage', () => {
    const r = proposerBiens({
      adresses: [], textes: { corps: 'merci d’écrire à zahrachakroun@gmail.com' },
      biens: [bien('295')], contenu: CONTENU,
    });
    expect(r.propositions[0]).toMatchObject({ cas: 'e', preCoche: false });
  });

  /**
   * 🔴🔴 ELLES S'AJOUTENT, ELLES NE REMPLACENT PAS (Arno) : « si le mail a déjà des propositions d'expéditeur
   * (cochées), celles du contenu s'ajoutent en dessous, décochées ».
   */
  it('🔴🔴 elles s’ajoutent SOUS les propositions d’expéditeur, sans les toucher', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' })],
      textes: MOTIF, biens: [bien('445'), bien('295')], contenu: CONTENU,
    });
    expect(r.propositions.map((p) => p.cle)).toEqual(['445', '295']);
    expect(r.propositions[0]).toMatchObject({ cas: 'a', preCoche: true, certitude: 'quasi_certaine' });
    expect(r.propositions[1]).toMatchObject({ cas: 'e', preCoche: false, certitude: 'a_trancher' });
  });

  /**
   * 🔴🔴 ET ELLES N'EMPÊCHENT PAS UN RATTACHEMENT AUTOMATIQUE QUI EXISTAIT AVANT CE LOT. Compter le contenu dans
   * « un seul bien certain » aurait fait basculer en « à trancher » des mails que le moteur posait tout seul
   * depuis des mois — une fonctionnalité retirée en silence.
   */
  it('🔴🔴 un bien CERTAIN reste automatique, même si le texte nomme quelqu’un d’autre', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '445', proprietaireCle: 'P1' })],
      textes: MOTIF, biens: [bien('445'), bien('295')], contenu: CONTENU,
    });
    expect(r.issue).toBe('automatique');
    // …et la proposition de contenu est TOUJOURS là, décochée, à côté du lien certain.
    expect(r.propositions.filter((p) => p.cas === 'e')).toHaveLength(1);
  });

  it('⚠️ sans annuaire des personnes, le cas (e) ne joue pas : le moteur est celui d’avant', () => {
    const r = proposerBiens({ adresses: [], textes: MOTIF, biens: [bien('295')] });
    expect(r.issue).toBe('sans_candidat');
  });

  /** ⚠️ UN BIEN DÉJÀ PROPOSÉ GARDE SON MOTIF, le plus sûr des deux : on ne le propose pas deux fois. */
  it('⚠️ un bien déjà proposé par son propriétaire n’est pas reproposé par le contenu', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'loc@x.fr', partie: 'locataire', lotCle: '295', proprietaireCle: 'P1' })],
      textes: MOTIF, biens: [bien('295')], contenu: CONTENU,
    });
    expect(r.propositions).toHaveLength(1);
    expect(r.propositions[0].cas).toBe('a');
  });

  /** 🔴 LE MOTIF DE L'EXAMEN DIT D'OÙ ÇA VIENT — et pas « l'échange en porte », qui serait faux. */
  it('🔴 quand seul le contenu a parlé, le motif le dit', () => {
    const r = proposerBiens({ adresses: [], textes: MOTIF, biens: [bien('295')], contenu: CONTENU });
    expect(r.motif).toContain('personne nommée dans le texte');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — (f) UNE CARTE DE CONTACT RATTACHE UNE ADRESSE À UN BIEN ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « But (à rappeler dans le code) : ce contact, désormais rattaché à
 * une partie du bien, permet ensuite de rattacher automatiquement ses nouveaux mails au bien. Vérifie que la passe
 * de rattachement automatique utilise bien ces cartes de contact (côté propriétaire et côté locataire) ; si ce
 * n'est pas le cas, branche-la. Les Tiers indépendants restent exclus de l'automatisation. »
 *
 * 🔴 ELLE NE LES UTILISAIT PAS, ET C'EST MESURÉ. `gestion_contact_carte` n'était lue que par
 * `partieCategorieRepo` — l'écran qui POSE les cartes, et personne d'autre. Le « + » de la fiche d'un bien
 * n'avait donc aucune suite : créer la carte de `secretariat.rosky@secri.fr` côté propriétaire du lot 29 ne
 * changeait RIEN au classement de ses mails suivants.
 *
 * 🔴 CE QUE LE BRANCHEMENT CHANGE, MESURÉ SUR LA BASE DU 05/10/2026 : **485 cartes actives** (318 côté
 * propriétaire, 167 côté locataire) sur 485 adresses et 164 biens. Elles touchent **3 290 mails** et produisent
 * **3 324 couples (mail, bien)**, dont **1 234 ne portent aujourd'hui AUCUN lien** vers ce bien — autant de
 * propositions qui n'existaient pas.
 *
 * ⚠️ ET AUCUNE N'EST PRÉ-COCHÉE. 1 234 propositions pré-cochées auraient classé 1 234 mails sans qu'on les lise :
 * c'est la faute du cas (d) avant sa correction (76 cases cochées sur un seul mail). Une carte dit « cette
 * personne parle de ce logement », pas « ce mail-ci concerne ce logement ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('(f) — la carte de contact d’un bien propose ce bien', () => {
  const LOT = bien('29', { adresse: '2 rue Anatole France', commune: 'COURBEVOIE' });

  it('🔴🔴 UNE ADRESSE QUI PORTE UNE CARTE PROPOSE SON BIEN', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'secretariat.rosky@secri.fr', cartesLots: ['29'] })],
      biens: [LOT],
    });
    const f = r.propositions.find((p) => p.cas === 'f');
    expect(f).toBeDefined();
    expect(f?.cle).toBe('29');
    expect(f?.motif).toContain('contact rattaché à ce bien');
    expect(f?.motif).toContain('secretariat.rosky@secri.fr');
  });

  it('🔴🔴 ELLE NE COCHE JAMAIS RIEN, et sa certitude reste « à trancher »', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'x@fictif.test', cartesLots: ['29'] })],
      biens: [LOT],
    });
    const f = r.propositions.find((p) => p.cas === 'f');
    expect(f?.preCoche).toBe(false);
    expect(f?.certitude).toBe('a_trancher');
    /* Et le mail n'est donc JAMAIS classé tout seul sur ce seul indice. */
    expect(r.issue).not.toBe('automatique');
  });

  it('⚠️ SANS LE CHAMP, LE CAS NE JOUE PAS : le moteur est celui d’avant ce lot', () => {
    const r = proposerBiens({ adresses: [adr({ adresse: 'x@fictif.test' })], biens: [LOT] });
    expect(r.propositions.some((p) => p.cas === 'f')).toBe(false);
  });

  it('⚠️ UNE CARTE SUR PLUSIEURS BIENS PROPOSE CHACUN — le secrétariat d’un propriétaire de quatre logements', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'secretariat@fictif.test', cartesLots: ['29', '155', '315'] })],
      biens: [LOT, bien('155'), bien('315')],
    });
    const f = r.propositions.filter((p) => p.cas === 'f');
    expect(f.map((p) => p.cle).sort()).toEqual(['155', '29', '315']);
    expect(f.every((p) => !p.preCoche)).toBe(true);
  });

  it('🔴 NOS ADRESSES NE SONT JAMAIS UNE SOURCE, carte ou pas — la règle (e) tient pour (f) aussi', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'gestion@criterimmo.fr', interne: true, cartesLots: ['29'] })],
      biens: [LOT],
    });
    expect(r.propositions.some((p) => p.cas === 'f')).toBe(false);
  });

  it('🔴 (a) L’EMPORTE SUR (f) POUR UN MÊME BIEN : une quasi-certitude ne se rétrograde pas', () => {
    const r = proposerBiens({
      adresses: [adr({ adresse: 'locataire@fictif.test', partie: 'locataire', lotCle: '29', cartesLots: ['29'] })],
      biens: [LOT],
    });
    const pour29 = r.propositions.filter((p) => p.cle === '29');
    expect(pour29).toHaveLength(1);
    expect(pour29[0].cas).toBe('a');
    expect(pour29[0].preCoche).toBe(true);
  });

  it('⚠️ UN BIEN ABSENT DU CATALOGUE EST QUAND MÊME PROPOSÉ, sans son nom', () => {
    /* La carte désigne un bien par sa clé : la proposition tient même si le catalogue chargé ne le porte pas. */
    const r = proposerBiens({ adresses: [adr({ adresse: 'x@fictif.test', cartesLots: ['999'] })], biens: [LOT] });
    const f = r.propositions.find((p) => p.cas === 'f');
    expect(f?.cle).toBe('999');
    expect(f?.motif).toBe('contact rattaché à ce bien (x@fictif.test)');
  });

  it('⚠️ UNE CLÉ VIDE NE PROPOSE RIEN', () => {
    const r = proposerBiens({ adresses: [adr({ adresse: 'x@fictif.test', cartesLots: [''] })], biens: [LOT] });
    expect(r.propositions.some((p) => p.cas === 'f')).toBe(false);
  });
});
