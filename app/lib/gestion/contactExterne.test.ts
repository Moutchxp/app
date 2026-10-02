import { describe, it, expect } from 'vitest';
import {
  basculerEtape2, choixSuiviDeContact, clePersonne, etape2Requise, etape2Validable, libelleContactExterne,
  mentionVia, motRoleInstantane, motTypeContact, motifIntervention, ordonnerEtape2,
  roleLocataireALaDate, roleLocataireParmiOccupations, roleRecu, suiviContactRecu, tonRoleInstantane,
  typeLibreRecu, typeRecu, typesProposes,
  BIEN_UNIQUEMENT, CHOIX_ETAPE2_VIDE, CHOIX_SUIVI_CONTACT, LIEN_ANCIENS_LOCATAIRES, REGLE_INTERVENTION,
  ROLES_INSTANTANES, SUIVI_CONTACT_DEFAUT, TYPES_AVANT_294, TYPES_CONTACT_EXTERNE, TYPE_A_PERSONNALISER,
  TYPE_LONGUEUR_MAX,
  type ContexteEtape2, type PersonneEtape2,
} from './contactExterne';
import { motClassement } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES DÉCISIONS, ÉPROUVÉES SANS BASE NI ÉCRAN ═══════════════════════════════════
 *
 * Ce fichier garde la RÈGLE. Les scénarios d'Arno s'y rejouent à la main, sur une table de cas : c'est la seule
 * façon de vérifier un « rôle à la date du mail » sans fabriquer un mail, un locataire et une occupation.
 *
 * ⚠️ AUCUN MOCK, AUCUN `vi.mock` : le module est PUR, et s'il cessait de l'être ce fichier ne compilerait plus.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   C-A — FAUT-IL L'ÉTAPE 2 ? LES SEPT REFUS D'ARNO, UN PAR UN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const RECU: ContexteEtape2 = {
  sens: 'recu', expediteurConnu: false, expediteurInterne: false, document: false,
  biensCoches: ['421'], interne: false, horsGestion: false,
};

describe('C-A — l’étape 2 n’est demandée que dans le cas exact d’Arno', () => {
  it('🔴 inconnu, reçu, un bien coché → ÉTAPE 2', () => {
    expect(etape2Requise(RECU)).toEqual({ requise: true, motif: null });
  });

  it('🔴 expéditeur CONNU d’une des fiches des biens cochés → pas d’étape 2', () => {
    expect(etape2Requise({ ...RECU, expediteurConnu: true }))
      .toEqual({ requise: false, motif: 'expediteur_connu' });
  });

  it('🔴 un mail que NOUS avons envoyé → pas d’étape 2', () => {
    expect(etape2Requise({ ...RECU, sens: 'envoye' })).toEqual({ requise: false, motif: 'envoye' });
    // ⚠️ UN SENS INCONNU EST TRAITÉ COMME « PAS REÇU » : on ne demande rien sur un mail qu'on ne sait pas lire.
    expect(etape2Requise({ ...RECU, sens: null }).requise).toBe(false);
  });

  it('🔴 une de nos adresses (@sansvisavis.com, @criterimmo.fr) → pas d’étape 2', () => {
    expect(etape2Requise({ ...RECU, expediteurInterne: true }))
      .toEqual({ requise: false, motif: 'adresse_interne' });
  });

  it('🔴 « Interne » et « Hors gestion » → pas d’étape 2', () => {
    expect(etape2Requise({ ...RECU, interne: true })).toEqual({ requise: false, motif: 'interne' });
    expect(etape2Requise({ ...RECU, horsGestion: true })).toEqual({ requise: false, motif: 'hors_gestion' });
  });

  it('🔴🔴 un « Document CRITERIMMO » → pas d’étape 2', () => {
    expect(etape2Requise({ ...RECU, document: true })).toEqual({ requise: false, motif: 'document' });
  });

  it('🔴 « Valider — aucun bien » → pas d’étape 2 (il RETIRE les rattachements)', () => {
    expect(etape2Requise({ ...RECU, biensCoches: [] })).toEqual({ requise: false, motif: 'aucun_bien' });
  });

  it('🔴 l’ordre des refus est celui de la liste d’Arno : le premier qui s’applique est rendu', () => {
    // Un mail ENVOYÉ, interne, document, sans bien, connu : c'est « envoye » qu'on vérifierait d'abord à la main.
    expect(etape2Requise({
      sens: 'envoye', expediteurConnu: true, expediteurInterne: true, document: true,
      biensCoches: [], interne: true, horsGestion: true,
    }).motif).toBe('envoye');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-B — LE RÔLE À LA DATE DU MAIL (et pas à celle d'aujourd'hui)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C-B — le statut est calculé À LA DATE DE RÉCEPTION DU MAIL', () => {
  it('🔴🔴 un mail ancien, un locataire parti DEPUIS → « occupant » à cette date', () => {
    // L'occupation : 01/02/2024 → 31/08/2025. Le mail : 12/03/2025, soit EN PLEINE occupation.
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2025-03-12' }))
      .toBe('locataire_occupant');
    // Le même locataire, un mail d'AUJOURD'HUI : il est sortant. C'est bien la DATE qui décide, pas la personne.
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2026-10-02' }))
      .toBe('locataire_sortant');
  });

  it('🔴 les bornes sont INCLUSES : le jour de l’entrée et le jour de la sortie comptent', () => {
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2024-02-01' }))
      .toBe('locataire_occupant');
    // Le jour de la sortie est celui où l'on en parle le plus : état des lieux, clés, dépôt de garantie.
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2025-08-31' }))
      .toBe('locataire_occupant');
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2025-09-01' }))
      .toBe('locataire_sortant');
  });

  it('🔴 une borne absente n’est pas une borne à zéro : « depuis toujours » / « toujours en cours »', () => {
    expect(roleLocataireALaDate({ entree: null, sortie: null, dateMail: '2020-01-01' }))
      .toBe('locataire_occupant');
    expect(roleLocataireALaDate({ entree: null, sortie: '2025-08-31', dateMail: '2010-01-01' }))
      .toBe('locataire_occupant');
    expect(roleLocataireALaDate({ entree: '2024-02-01', sortie: null, dateMail: '2099-01-01' }))
      .toBe('locataire_occupant');
  });

  it('🔴 un locataire pas encore entré à la date du mail → « à venir », jamais « occupant »', () => {
    expect(roleLocataireALaDate({ entree: '2026-11-01', sortie: null, dateMail: '2026-10-02' }))
      .toBe('locataire_a_venir');
  });

  it('⚠️ une date de mail illisible ne s’arrondit pas en « occupant »', () => {
    expect(roleLocataireALaDate({ entree: null, sortie: null, dateMail: '' })).toBe('locataire_a_venir');
    expect(roleLocataireALaDate({ entree: null, sortie: null, dateMail: 'hier' })).toBe('locataire_a_venir');
  });

  it('🔴 un horodatage complet est lu comme son JOUR : aucun fuseau ne décale la décision', () => {
    expect(roleLocataireALaDate({
      entree: '2024-02-01', sortie: '2025-08-31', dateMail: '2025-08-31T23:30:00Z',
    })).toBe('locataire_occupant');
  });

  it('🔴 plusieurs occupations : « occupant » l’emporte, puis « sortant », puis « à venir »', () => {
    const studio = { entree: '2020-01-01', sortie: '2022-12-31' };
    const deuxPieces = { entree: '2023-01-01', sortie: null };
    expect(roleLocataireParmiOccupations([studio, deuxPieces], '2024-05-05')).toBe('locataire_occupant');
    expect(roleLocataireParmiOccupations([studio], '2024-05-05')).toBe('locataire_sortant');
    expect(roleLocataireParmiOccupations([{ entree: '2030-01-01', sortie: null }], '2024-05-05'))
      .toBe('locataire_a_venir');
  });

  it('🔴🔴 AUCUNE occupation connue n’est PAS « occupant » (piège de l’ensemble vide)', () => {
    expect(roleLocataireParmiOccupations([], '2024-05-05')).toBe('locataire_a_venir');
  });

  it('🔴 les mots sont CEUX D’ARNO : « Locataire occupant », « Locataire sortant » — jamais « en place »', () => {
    expect(motRoleInstantane('locataire_occupant')).toBe('Locataire occupant');
    expect(motRoleInstantane('locataire_sortant')).toBe('Locataire sortant');
    expect(motRoleInstantane('proprietaire')).toBe('Propriétaire');
    for (const r of ROLES_INSTANTANES) expect(motRoleInstantane(r)).not.toMatch(/en place/i);
  });

  it('🔴 le ton d’Arno : occupant VERT, sortant ROUGE — et le MOT porte l’information', () => {
    expect(tonRoleInstantane('locataire_occupant')).toBe('vert');
    expect(tonRoleInstantane('locataire_sortant')).toBe('rouge');
    expect(tonRoleInstantane('proprietaire')).toBe('gris');
    expect(tonRoleInstantane('locataire_a_venir')).toBe('gris');
  });

  it('⚠️ un rôle venu du navigateur est re-validé contre la liste fermée', () => {
    expect(roleRecu('locataire_sortant')).toBe('locataire_sortant');
    expect(roleRecu('locataire_en_place')).toBeNull();
    expect(roleRecu(null)).toBeNull();
    expect(roleRecu(42)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-C — L'ORDRE D'ARNO, ET CE QUI SE REPLIE DERRIÈRE « Voir tous les anciens locataires… »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const p = (o: Partial<PersonneEtape2> & { cle: string }): PersonneEtape2 => ({
  sorte: 'locataire', id: 1, nom: o.cle, civilite: null, role: 'locataire_occupant', ...o,
});

describe('C-C — propriétaires actifs, occupants, le dernier sortant, puis le reste', () => {
  it('🔴🔴 l’ordre exact, et un SEUL sortant visible : le plus récent', () => {
    const { visibles, repliees } = ordonnerEtape2([
      p({ cle: 'SORT-2023', role: 'locataire_sortant', sortie: '2023-06-30' }),
      p({ cle: 'OCC', role: 'locataire_occupant' }),
      p({ cle: 'PROP', sorte: 'proprietaire', role: 'proprietaire', actif: true }),
      p({ cle: 'SORT-2025', role: 'locataire_sortant', sortie: '2025-08-31' }),
      p({ cle: 'SORT-2024', role: 'locataire_sortant', sortie: '2024-01-15' }),
    ]);
    expect(visibles.map((x) => x.cle)).toEqual(['PROP', 'OCC', 'SORT-2025']);
    // Les autres sortants sont derrière le lien, du plus récent au plus ancien.
    expect(repliees.map((x) => x.cle)).toEqual(['SORT-2024', 'SORT-2023']);
  });

  it('🔴 un ANCIEN propriétaire (bien vendu) n’est pas en tête : il passe derrière le lien', () => {
    const { visibles, repliees } = ordonnerEtape2([
      p({ cle: 'VENDEUR', sorte: 'proprietaire', role: 'proprietaire', actif: false }),
      p({ cle: 'ACTUEL', sorte: 'proprietaire', role: 'proprietaire', actif: true }),
    ]);
    expect(visibles.map((x) => x.cle)).toEqual(['ACTUEL']);
    expect(repliees.map((x) => x.cle)).toEqual(['VENDEUR']);
  });

  it('⚠️ un sortant SANS date de sortie ne peut pas être « le plus récent » : il se replie', () => {
    const { visibles, repliees } = ordonnerEtape2([
      p({ cle: 'SANS-DATE', role: 'locataire_sortant', sortie: null }),
    ]);
    expect(visibles).toHaveLength(0);
    expect(repliees.map((x) => x.cle)).toEqual(['SANS-DATE']);
  });

  it('🔴 un locataire « à venir » se replie aussi — il n’occupe rien à cette date', () => {
    const { visibles, repliees } = ordonnerEtape2([
      p({ cle: 'ENTRANT', role: 'locataire_a_venir', entree: '2026-12-01' }),
      p({ cle: 'OCC', role: 'locataire_occupant' }),
    ]);
    expect(visibles.map((x) => x.cle)).toEqual(['OCC']);
    expect(repliees.map((x) => x.cle)).toEqual(['ENTRANT']);
  });

  it('🔴 une personne n’est JAMAIS dans les deux listes, et aucune n’est perdue', () => {
    const tous = [
      p({ cle: 'A', sorte: 'proprietaire', role: 'proprietaire', actif: true }),
      p({ cle: 'B', role: 'locataire_occupant' }),
      p({ cle: 'C', role: 'locataire_sortant', sortie: '2025-01-01' }),
      p({ cle: 'D', role: 'locataire_sortant', sortie: '2024-01-01' }),
      p({ cle: 'E', role: 'locataire_a_venir' }),
      p({ cle: 'F', sorte: 'proprietaire', role: 'proprietaire', actif: false }),
    ];
    const { visibles, repliees } = ordonnerEtape2(tous);
    expect(visibles.length + repliees.length).toBe(tous.length);
    const cles = [...visibles, ...repliees].map((x) => x.cle).sort();
    expect(cles).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('🔴 le lien porte LES MOTS D’ARNO, au caractère près', () => {
    expect(LIEN_ANCIENS_LOCATAIRES).toBe('Voir tous les anciens locataires…');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-D — L'EXCLUSIVITÉ DE « LE BIEN UNIQUEMENT », ET LA CONDITION DE « VALIDER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C-D — « Le bien uniquement » est exclusif, dans les deux sens', () => {
  it('🔴 rien n’est coché au départ, et « Valider » est inactif', () => {
    expect(CHOIX_ETAPE2_VIDE).toEqual({ bienUniquement: false, personnes: [] });
    expect(etape2Validable(CHOIX_ETAPE2_VIDE)).toBe(false);
  });

  it('🔴🔴 cocher « Le bien uniquement » DÉCOCHE les personnes', () => {
    const avec = { bienUniquement: false, personnes: ['locataire:L1', 'proprietaire:P1'] };
    expect(basculerEtape2(avec, null)).toEqual({ bienUniquement: true, personnes: [] });
  });

  it('🔴🔴 cocher une personne DÉCOCHE « Le bien uniquement »', () => {
    const bien = { bienUniquement: true, personnes: [] };
    expect(basculerEtape2(bien, 'locataire:L1'))
      .toEqual({ bienUniquement: false, personnes: ['locataire:L1'] });
  });

  it('🔴 décocher la dernière personne rend « Valider » inactif — et ne coche rien d’autre', () => {
    const une = { bienUniquement: false, personnes: ['locataire:L1'] };
    const vide = basculerEtape2(une, 'locataire:L1');
    expect(vide).toEqual({ bienUniquement: false, personnes: [] });
    expect(etape2Validable(vide)).toBe(false);
  });

  it('🔴 re-cliquer « Le bien uniquement » le décoche, et laisse tout vide', () => {
    expect(basculerEtape2({ bienUniquement: true, personnes: [] }, null))
      .toEqual({ bienUniquement: false, personnes: [] });
  });

  it('🔴 plusieurs personnes, toutes fiches confondues (cas 4 d’Arno)', () => {
    let c = CHOIX_ETAPE2_VIDE;
    c = basculerEtape2(c, 'proprietaire:P1');
    c = basculerEtape2(c, 'locataire:L1');
    expect(c).toEqual({ bienUniquement: false, personnes: ['proprietaire:P1', 'locataire:L1'] });
    expect(etape2Validable(c)).toBe(true);
  });

  it('🔴 une personne n’est jamais comptée deux fois', () => {
    let c = basculerEtape2(CHOIX_ETAPE2_VIDE, 'locataire:L1');
    c = basculerEtape2(c, 'locataire:L1');
    c = basculerEtape2(c, 'locataire:L1');
    expect(c.personnes).toEqual(['locataire:L1']);
  });

  it('🔴 l’identité d’une personne est (sorte, clé) : deux sortes de même clé ne se confondent pas', () => {
    expect(clePersonne({ sorte: 'proprietaire', cle: 'X' }))
      .not.toBe(clePersonne({ sorte: 'locataire', cle: 'X' }));
  });

  it('🔴 « Valider » n’attend AUCUN des trois champs facultatifs', () => {
    // La condition ne regarde que le choix : ni nom, ni téléphone, ni type n'y figurent.
    expect(etape2Validable({ bienUniquement: true, personnes: [] })).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 C-E — LE SUIVI, ET SA TRADUCTION DANS LE MÉCANISME EXISTANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C-E — les deux choix tombent sur les fenêtres de conversation existantes', () => {
  it('🔴 « Suivi automatique » est coché par défaut (demande d’Arno)', () => {
    expect(SUIVI_CONTACT_DEFAUT).toBe('auto');
    expect(CHOIX_SUIVI_CONTACT[0].cle).toBe('auto');
    expect(CHOIX_SUIVI_CONTACT).toHaveLength(2);
  });

  it('🔴🔴 « auto » → une NOUVELLE PÉRIODE (`suite`) · « ponctuel » → une EXCEPTION (`mail`)', () => {
    expect(choixSuiviDeContact('auto')).toBe('suite');
    expect(choixSuiviDeContact('ponctuel')).toBe('mail');
  });

  it('⚠️ un choix inconnu retombe sur le défaut, jamais sur « ponctuel » par surprise', () => {
    expect(suiviContactRecu(undefined)).toBe('auto');
    expect(suiviContactRecu('n’importe quoi')).toBe('auto');
    expect(suiviContactRecu('ponctuel')).toBe('ponctuel');
  });

  it('🔴 chaque choix porte une phrase d’aide en français simple', () => {
    for (const c of CHOIX_SUIVI_CONTACT) {
      expect(c.mot.length).toBeGreaterThan(5);
      expect(c.aide.length).toBeGreaterThan(20);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 C-F — LES MOTS : « via Me Martin, avocat », le motif, le libellé
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C-F — la mention « via … » et les motifs se relisent dans deux ans', () => {
  it('🔴🔴 « via Me Martin, avocat » — le nom tel qu’Arno l’a saisi, et le type en minuscules', () => {
    expect(mentionVia({ email: 'contact@cabinet.fr', nom: 'Me Martin', telephone: null, type: 'avocat' }))
      .toBe('via Me Martin, avocat');
  });

  it('🔴 sans nom, l’ADRESSE fait office de nom — jamais « (sans nom) »', () => {
    expect(mentionVia({ email: 'contact@belmonts.fr', nom: null, telephone: null, type: 'syndic' }))
      .toBe('via contact@belmonts.fr, syndic');
    expect(mentionVia({ email: 'contact@belmonts.fr', nom: '  ', telephone: null, type: null }))
      .toBe('via contact@belmonts.fr');
  });

  it('⚠️ le « Me » n’est JAMAIS fabriqué depuis le type : il vient de la saisie', () => {
    expect(mentionVia({ email: 'a@b.fr', nom: 'Cabinet Dupuis', telephone: null, type: 'avocat' }))
      .toBe('via Cabinet Dupuis, avocat');
  });

  it('🔴 le motif du lien dit QUI, À QUEL TITRE, et il se relit sans rejouer le moteur', () => {
    const m = motifIntervention({
      contact: { email: 'a@b.fr', nom: 'Me Martin', telephone: null, type: 'avocat' },
      role: 'locataire_sortant',
    });
    expect(m).toContain('Me Martin');
    expect(m).toContain('avocat');
    expect(m).toContain('locataire sortant');
    expect(m).toContain('à la date du mail');
  });

  it('⚠️ sans contact mémorisé, le motif le DIT au lieu de laisser un blanc', () => {
    expect(motifIntervention({ contact: null, role: 'proprietaire' }))
      .toContain('un contact extérieur');
  });

  it('🔴 « Contact externe : <adresse> » — les mots d’Arno', () => {
    expect(libelleContactExterne('contact@belmonts.fr')).toBe('Contact externe : contact@belmonts.fr');
  });

  it('🔴 les types d’Arno, dans son ordre, et « autre » en dernier', () => {
    /**
     * 🔴🔴 L'ORDRE EST DICTÉ, PAS DÉDUIT. Arno l'a écrit mot pour mot le 02/10/2026 : « Avocat, Garant, Artisan,
     * Syndic, Expert, Assurance, Notaire, Diagnostiqueur, Famille, Autre, Personnaliser… ». Il n'est pas
     * alphabétique, et il n'a pas à l'être : c'est l'ordre qu'on LIT à l'écran.
     *
     * 🔴 « Famille » ajouté avec le lot BROUILLONS-APERCU-TYPES-LIBELLES — un proche qui écrit à la place du
     * locataire ou du propriétaire. « Diagnostiqueur » a rejoint la fin des métiers, à la place qu'Arno lui donne.
     */
    expect([...TYPES_CONTACT_EXTERNE]).toEqual([
      'avocat', 'garant', 'artisan', 'syndic', 'expert', 'assurance', 'notaire', 'diagnostiqueur',
      'famille', 'autre',
    ]);
    expect(motTypeContact('avocat')).toBe('Avocat');
    expect(motTypeContact('diagnostiqueur')).toBe('Diagnostiqueur');
    expect(motTypeContact('famille')).toBe('Famille');
    // ⚠️ « Autre » FERME LA LISTE : le choix de ce qu'on ne sait pas nommer ne se met pas au milieu.
    expect(TYPES_CONTACT_EXTERNE[TYPES_CONTACT_EXTERNE.length - 1]).toBe('autre');
  });

  /**
   * 🔴🔴 LE GARDE-FOU QUI ÉVITE UN CHOIX QUI ÉCHOUERAIT EN SILENCE. Tant que la migration 294 n'est pas
   * appliquée, la base refuse tout ce qui n'est pas dans ses huit mots : « famille » et « diagnostiqueur » n'y
   * sont pas, et l'écran ne doit donc pas les proposer.
   */
  it('🔴🔴 sans la migration 294, ni « famille » ni « diagnostiqueur » ne sont proposés', () => {
    expect(TYPES_AVANT_294).not.toContain('famille');
    expect(TYPES_AVANT_294).not.toContain('diagnostiqueur');
    expect(typesProposes([], { typeLibre: false })).toEqual([...TYPES_AVANT_294]);
    // …et AVEC la 294, les dix de la liste, dans l'ordre d'Arno.
    expect(typesProposes([], { typeLibre: true })).toEqual([...TYPES_CONTACT_EXTERNE]);
  });

  it('⚠️ un type venu du navigateur est re-validé, et « aucun » reste permis', () => {
    expect(typeRecu('SYNDIC')).toBe('syndic');
    expect(typeRecu('huissier')).toBeNull();
    expect(typeRecu(null)).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-H — LE TYPE ÉCRIT À LA MAIN (lot URGENT-VERIF-SUIVI-ET-76-BIENS)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-H — « Personnaliser… » : un type qu’Arno écrit lui-même', () => {
  it('🔴 il est enregistré TEL QUEL — on ne traduit pas, on ne range pas dans une case existante', () => {
    expect(typeLibreRecu('huissier de justice')).toBe('huissier de justice');
    expect(typeLibreRecu('diagnostiqueur amiante')).toBe('diagnostiqueur amiante');
    // ⚠️ LES ACCENTS, LES TIRETS ET LES APOSTROPHES PASSENT : « maître d'œuvre » est un métier.
    expect(typeLibreRecu('maître d’œuvre')).toBe('maître d’œuvre');
    expect(typeLibreRecu('bureau d-études')).toBe('bureau d-études');
  });

  it('🔴 il est NORMALISÉ juste ce qu’il faut : casse, blancs de bord, blancs multiples', () => {
    expect(typeLibreRecu('  HUISSIER  ')).toBe('huissier');
    expect(typeLibreRecu('huissier   de    justice')).toBe('huissier de justice');
    // Sans cela, « Syndic » et « syndic » feraient DEUX types dans la liste des prochaines fois.
    expect(typeLibreRecu('Syndic')).toBe(typeLibreRecu('syndic'));
  });

  it('🔴 ce qui ne dit rien est refusé — et « aucun type » reste permis', () => {
    expect(typeLibreRecu('')).toBeNull();
    expect(typeLibreRecu('   ')).toBeNull();
    expect(typeLibreRecu(null)).toBeNull();
    expect(typeLibreRecu(42)).toBeNull();
  });

  it('🔴🔴 le MARQUEUR d’écran n’est JAMAIS enregistré comme un type', () => {
    expect(typeLibreRecu(TYPE_A_PERSONNALISER)).toBeNull();
    // ⚠️ Et il ne peut pas se confondre avec un métier : aucun ne s'écrit avec des tirets bas doublés.
    expect((TYPES_CONTACT_EXTERNE as readonly string[])).not.toContain(TYPE_A_PERSONNALISER);
  });

  it('⚠️ il est borné, et les caractères de commande sont retirés', () => {
    expect(typeLibreRecu('x'.repeat(200))).toHaveLength(TYPE_LONGUEUR_MAX);
    expect(typeLibreRecu('huissier  de justice')).toBe('huissier de justice');
  });

  it('🔴 un type inconnu s’AFFICHE quand même, avec une majuscule et rien de plus', () => {
    expect(motTypeContact('huissier de justice')).toBe('Huissier de justice');
    expect(motTypeContact('')).toBe('');
  });
});

describe('🔴🔴 C-I — la liste proposée suit ce que la base accepte', () => {
  it('🔴 SANS la migration 294 : les huit d’origine, et PAS « Diagnostiqueur »', () => {
    const l = typesProposes(['huissier'], { typeLibre: false });
    expect(l).toEqual([...TYPES_AVANT_294]);
    expect(l).not.toContain('diagnostiqueur');
    expect(l).not.toContain('huissier');
  });

  it('🔴 un choix qui échouerait n’est jamais proposé — c’est pour cela que la liste est bornée', () => {
    // La base de la 293 n'accepte QUE ces huit mots : la liste affichée leur est identique.
    expect(typesProposes([], { typeLibre: false }).every((t) => TYPES_AVANT_294.includes(t))).toBe(true);
  });

  it('🔴🔴 AVEC la 294 : les neuf, PLUS les types déjà écrits à la main', () => {
    const l = typesProposes(['huissier', 'Huissier', 'maître d’œuvre'], { typeLibre: true });
    expect(l.slice(0, TYPES_CONTACT_EXTERNE.length)).toEqual([...TYPES_CONTACT_EXTERNE]);
    // Les ajoutés viennent après, SANS DOUBLON (la casse ne crée pas un second type) et par ordre alphabétique.
    expect(l.slice(TYPES_CONTACT_EXTERNE.length)).toEqual(['huissier', 'maître d’œuvre']);
  });

  it('⚠️ un type déjà écrit qui est devenu l’un des neuf n’apparaît pas deux fois', () => {
    const l = typesProposes(['diagnostiqueur', 'SYNDIC'], { typeLibre: true });
    expect(l.filter((t) => t === 'diagnostiqueur')).toHaveLength(1);
    expect(l.filter((t) => t === 'syndic')).toHaveLength(1);
  });

  it('🔴 l’ordre est STABLE : deux appels rendent la même liste', () => {
    const a = typesProposes(['zeta', 'alpha'], { typeLibre: true });
    const b = typesProposes(['alpha', 'zeta'], { typeLibre: true });
    expect(a).toEqual(b);
  });

  it('🔴 la règle qui nomme ces liens est « intervention », et pas « document_auto »', () => {
    expect(REGLE_INTERVENTION).toBe('intervention');
    expect(REGLE_INTERVENTION).not.toBe('document_auto');
  });

  it('🔴 « Le bien uniquement » et son sous-titre sont les mots d’Arno', () => {
    expect(BIEN_UNIQUEMENT).toBe('Le bien uniquement');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-G — LE REPÈRE « À PARTIR D'ICI » MENTIONNE LES PERSONNES… ET RIEN NE CHANGE SANS ELLES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C-G — `motClassement` gagne les personnes sans toucher à ce qu’il rendait', () => {
  it('🔴🔴 SANS personne, la phrase est EXACTEMENT celle d’avant ce lot', () => {
    expect(motClassement({ sorte: 'biens', biens: [{ cle: '421', libelle: '28 av. Marceau' }] }))
      .toBe('28 av. Marceau');
    expect(motClassement({ sorte: 'biens', biens: [] })).toBe('aucun bien');
    expect(motClassement({ sorte: 'interne', biens: [] })).toBe('Interne');
    expect(motClassement({ sorte: 'hors_gestion', biens: [] })).toBe('Hors gestion');
    // Et un tableau VIDE de personnes ne change rien non plus : `undefined` et `[]` disent la même chose.
    expect(motClassement({ sorte: 'biens', biens: [{ cle: '421', libelle: '28 av. Marceau' }], personnes: [] }))
      .toBe('28 av. Marceau');
  });

  it('🔴 AVEC des personnes, le repère les mentionne (demande d’Arno)', () => {
    expect(motClassement({
      sorte: 'biens',
      biens: [{ cle: '421', libelle: '28 av. Marceau' }],
      personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'THAI Cécile' }],
    })).toBe('28 av. Marceau · pour THAI Cécile');
  });

  it('⚠️ « Interne » et « Hors gestion » ne portent AUCUNE personne, même si on en passe', () => {
    expect(motClassement({
      sorte: 'interne', biens: [],
      personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'THAI Cécile' }],
    })).toBe('Interne');
  });
});
