import { describe, it, expect } from 'vitest';
import {
  aEnteteRedirection, choisirDossier, domaineDe, domaineIdentifiant, echantillonner, estReponseOuTransfert,
  formaterRapport, grouperEnFils, identifiantsFil, lireEntier, lireTexte, part, poids, referencesMng, synthetiser,
  type ContexteSonde, type MessageSonde,
} from './sonde';

/**
 * LOT 0 — cœur PUR de la sonde du dossier « GESTION ». Tout est testé SANS connexion : les fonctions ne font que mesurer
 * un lot de messages déjà lus. Les trois mesures qui décident de l'ergonomie — sortants recopiés, références MNG-,
 * en-têtes de fil survivants — ont chacune leur cas.
 */

/** Fabrique un message de sonde ; tout champ non précisé prend une valeur neutre. */
function msg(p: Partial<MessageSonde> & { uid: number }): MessageSonde {
  return {
    messageId: `<m${p.uid}@exemple.fr>`, inReplyTo: null, references: [], deAdresse: 'locataire@exemple.fr',
    objet: null, corpsTexte: null, entetes: {}, pieces: [], ...p,
  };
}

const CONTEXTE: ContexteSonde = {
  dossier: 'GESTION', jours: 90, depuis: new Date('2026-06-25T00:00:00Z'), totalFenetre: 4,
  sortantsGestion: 0, adresseSortante: 'gestion@criterimmo.fr', echecsTelechargement: 0,
};

describe('échantillonnage', () => {
  it('prend TOUT quand le lot tient sous la borne, et quand la borne est 0 (« tout »)', () => {
    expect(echantillonner([3, 1, 2], 150)).toEqual([1, 2, 3]); // trié, complet
    expect(echantillonner([3, 1, 2], 0)).toEqual([1, 2, 3]);
  });

  it('étale l’échantillon à PAS CONSTANT sur toute la fenêtre (jamais les seuls plus récents)', () => {
    const uids = Array.from({ length: 100 }, (_, i) => i + 1);
    const ech = echantillonner(uids, 10);
    expect(ech).toHaveLength(10);
    expect(ech[0]).toBe(1); // le plus ancien est pris → la saisonnalité du courrier reste visible
    expect(ech[ech.length - 1]).toBeGreaterThan(80);
    expect([...ech].sort((a, b) => a - b)).toEqual(ech); // trié
  });

  it('est DÉTERMINISTE : deux passes donnent le même échantillon (rapports comparables)', () => {
    const uids = Array.from({ length: 57 }, (_, i) => i * 3);
    expect(echantillonner(uids, 12)).toEqual(echantillonner(uids, 12));
  });
});

describe('lecture des adresses et des identifiants', () => {
  it('domaine d’une adresse et domaine porté par un Message-ID', () => {
    expect(domaineDe('A.Jorel@SansVisAVis.com')).toBe('sansvisavis.com');
    expect(domaineDe('sans-arobase')).toBe('');
    expect(domaineIdentifiant('<abc.def@mail.gmail.com>')).toBe('mail.gmail.com');
    expect(domaineIdentifiant('')).toBe('');
  });
});

describe('objet de réponse ou de transfert', () => {
  it('reconnaît les préfixes FR et EN, avec ou sans compteur', () => {
    for (const o of ['Re: fuite', 'RE : fuite', 'Rép : fuite', 'Re[2]: fuite', 'Fwd: bail', 'TR : bail', 'Transfert : bail']) {
      expect(estReponseOuTransfert(o)).toBe(true);
    }
  });

  it('un PREMIER message n’est pas une réponse (sinon la boîte passerait pour cassée)', () => {
    expect(estReponseOuTransfert('Fuite salle de bain')).toBe(false);
    expect(estReponseOuTransfert(null)).toBe(false);
    expect(estReponseOuTransfert('Reçu de loyer')).toBe(false); // « Reçu » ne doit PAS être pris pour « Re: »
  });
});

describe('références MNG-', () => {
  it('extrait les références DISTINCTES, en majuscules', () => {
    expect(referencesMng('Intervention mng-23987 — suite de MNG-23987 et MNG-24001')).toEqual(['MNG-23987', 'MNG-24001']);
  });

  it('ne capte rien sans chiffres ni sans préfixe', () => {
    expect(referencesMng('MNG- sans numéro')).toEqual([]);
    expect(referencesMng('dossier 23987')).toEqual([]);
    expect(referencesMng(null)).toEqual([]);
  });
});

describe('indices de recopie', () => {
  it('détecte les en-têtes de redirection automatique (insensible à la casse)', () => {
    expect(aEnteteRedirection({ 'x-forwarded-for': 'gestion@criterimmo.fr a.jorel@sansvisavis.com' })).toBe(true);
    expect(aEnteteRedirection({ 'Delivered-To': 'a.jorel@sansvisavis.com' })).toBe(true);
    expect(aEnteteRedirection({ subject: 'x', from: 'y' })).toBe(false);
  });
});

describe('regroupement en fils', () => {
  it('relie un message à sa réponse par In-Reply-To', () => {
    const fils = grouperEnFils([
      msg({ uid: 1, messageId: '<a@x.fr>' }),
      msg({ uid: 2, messageId: '<b@x.fr>', inReplyTo: '<a@x.fr>' }),
    ]);
    expect(fils).toHaveLength(1);
    expect(fils[0].map((m) => m.uid)).toEqual([1, 2]);
  });

  it('relie deux réponses à un parent ABSENT de la boîte (elles citent la même ancre)', () => {
    const fils = grouperEnFils([
      msg({ uid: 1, messageId: '<b@x.fr>', references: ['<absent@x.fr>'] }),
      msg({ uid: 2, messageId: '<c@x.fr>', inReplyTo: '<absent@x.fr>' }),
    ]);
    expect(fils).toHaveLength(1);
  });

  it('ne fusionne JAMAIS deux échanges sans ancre commune', () => {
    const fils = grouperEnFils([msg({ uid: 1 }), msg({ uid: 2 })]);
    expect(fils).toHaveLength(2);
  });

  it('un message SANS aucun identifiant reste seul (repli sur son UID, jamais fusionné au hasard)', () => {
    const fils = grouperEnFils([
      msg({ uid: 1, messageId: '' }),
      msg({ uid: 2, messageId: '' }),
      msg({ uid: 3, messageId: '<c@x.fr>' }),
    ]);
    expect(fils).toHaveLength(3);
  });

  it('normalise les chevrons et la casse du domaine avant de comparer', () => {
    expect(identifiantsFil(msg({ uid: 1, messageId: '<A-1@Exemple.FR>' }))).toEqual(['A-1@exemple.fr']);
    const fils = grouperEnFils([
      msg({ uid: 1, messageId: '<A-1@Exemple.FR>' }),
      msg({ uid: 2, messageId: '<b@x.fr>', inReplyTo: 'A-1@exemple.fr' }), // sans chevrons, domaine en minuscules
    ]);
    expect(fils).toHaveLength(1);
  });

  it('recolle une chaîne de 4 messages en UN seul fil (le cas « 6 mails, 1 ligne »)', () => {
    const fils = grouperEnFils([
      msg({ uid: 1, messageId: '<1@x.fr>' }),
      msg({ uid: 2, messageId: '<2@x.fr>', inReplyTo: '<1@x.fr>', references: ['<1@x.fr>'] }),
      msg({ uid: 3, messageId: '<3@x.fr>', inReplyTo: '<2@x.fr>', references: ['<1@x.fr>', '<2@x.fr>'] }),
      msg({ uid: 4, messageId: '<4@x.fr>', inReplyTo: '<3@x.fr>', references: ['<1@x.fr>', '<2@x.fr>', '<3@x.fr>'] }),
    ]);
    expect(fils).toHaveLength(1);
    expect(fils[0]).toHaveLength(4);
  });
});

describe('synthèse — les trois mesures demandées', () => {
  const messages: MessageSonde[] = [
    msg({ uid: 1, objet: 'Intervention MNG-23987 — barre de douche', deAdresse: 'interventions@monga.io', messageId: '<a@monga.io>' }),
    msg({ uid: 2, objet: 'Re: Intervention MNG-23987', deAdresse: 'gestion@criterimmo.fr', messageId: '<b@criterimmo.fr>', inReplyTo: '<a@monga.io>' }),
    msg({ uid: 3, objet: 'Fuite salle de bain', deAdresse: 'locataire@exemple.fr', messageId: '<c@exemple.fr>',
      entetes: { 'x-forwarded-for': 'gestion@criterimmo.fr' }, pieces: [{ typeMime: 'image/heic', tailleOctets: 2_500_000 }] }),
    msg({ uid: 4, objet: 'Re: Fuite salle de bain', deAdresse: 'locataire@exemple.fr', messageId: '<d@exemple.fr>',
      corpsTexte: 'cf. MNG-24001', references: ['<c@exemple.fr>'] }),
  ];

  it('(a) compte les sortants — le chiffre exhaustif vient du serveur, l’échantillon ne fait que recouper', () => {
    const s = synthetiser({ ...CONTEXTE, sortantsGestion: 37 }, messages);
    expect(s.contexte.sortantsGestion).toBe(37); // exhaustif (SEARCH FROM), jamais recalculé depuis l'échantillon
    expect(s.sortantsEchantillon).toBe(1);
  });

  it('(b) compte les messages et les références MNG-, objet et corps séparément', () => {
    const s = synthetiser(CONTEXTE, messages);
    expect(s.mngObjet).toBe(2);
    expect(s.mngObjetRefs).toBe(1);   // MNG-23987, citée par deux messages
    expect(s.mngCorps).toBe(1);
    expect(s.mngRefsToutes).toBe(2);  // + MNG-24001, vue dans un corps
  });

  it('(c) mesure les en-têtes de fil LÀ OÙ ILS DOIVENT ÊTRE (sur les réponses seulement)', () => {
    const s = synthetiser(CONTEXTE, messages);
    expect(s.reponses).toBe(2);
    expect(s.reponsesAvecAncre).toBe(2);
    expect(s.sansMessageId).toBe(0);
    expect(s.domaineIdentifiantConforme).toBe(4); // les 4 Message-ID portent le domaine de leur expéditeur → identifiants d'origine
    expect(s.avecEnteteRedirection).toBe(1);
    expect(s.nbFils).toBe(2);
    expect(s.plusGrandFil).toBe(2);
  });

  it('relève les pièces par type et par poids, sans jamais toucher leur contenu', () => {
    const s = synthetiser(CONTEXTE, messages);
    expect(s.messagesAvecPieces).toBe(1);
    expect(s.parType).toEqual([{ type: 'image/heic', nb: 1, octets: 2_500_000 }]);
    expect(s.plusGrossePiece).toBe(2_500_000);
  });

  it('dit si l’échantillon couvre TOUT (sinon le nombre de fils est minoré, et le rapport le dit)', () => {
    expect(synthetiser(CONTEXTE, messages).couvertureTotale).toBe(true);
    const partiel = synthetiser({ ...CONTEXTE, totalFenetre: 1200 }, messages);
    expect(partiel.couvertureTotale).toBe(false);
    expect(formaterRapport(partiel).join('\n')).toContain('ÉCHANTILLON PARTIEL');
  });

  it('les échecs de lecture comptent dans la couverture (un message illisible a bien été vu)', () => {
    expect(synthetiser({ ...CONTEXTE, totalFenetre: 5, echecsTelechargement: 1 }, messages).couvertureTotale).toBe(true);
  });
});

describe('typologie du flux — (d) ce qui sort, (e) ce qui entre', () => {
  /** Un flux de gérance plausible : quittances envoyées par un logiciel, réponses écrites à la main, notifications reçues. */
  const flux: MessageSonde[] = [
    // sortants « logiciel » (un X-Mailer se nomme), un seul destinataire
    ...[1, 2, 3].map((i) => msg({
      uid: i, deAdresse: 'gestion@criterimmo.fr', objet: `Quittance de loyer septembre 2026 — Mme Martin ${i}`,
      entetes: { 'x-mailer': 'Logiciel 4.2', to: `loc${i}@orange.fr` },
    })),
    // sortants « écrits à la main » : aucun signal, une vraie réponse, deux destinataires
    ...[4, 5].map((i) => msg({
      uid: i, deAdresse: 'gestion@criterimmo.fr', objet: 'Re: Fuite salle de bain chez M. Durand',
      inReplyTo: `<in${i}@orange.fr>`, entetes: { to: 'loc@orange.fr, syndic@abc.fr' },
    })),
    // entrants automatiques (adresse sans réponse + désabonnement)
    ...[6, 7].map((i) => msg({
      uid: i, deAdresse: 'no-reply@monga.io', objet: `Intervention MNG-${23000 + i}`,
      entetes: { 'list-unsubscribe': '<https://monga.io/u>', to: 'gestion@criterimmo.fr' },
    })),
    // entrants humains
    ...[8, 9, 10].map((i) => msg({ uid: i, deAdresse: `locataire${i}@orange.fr`, objet: 'Problème de chauffage', entetes: { to: 'gestion@criterimmo.fr' } })),
    // courrier INTERNE : une autre adresse du même domaine que la gestion
    msg({ uid: 11, deAdresse: 'a.jorel@criterimmo.fr', objet: 'Point hebdo', entetes: { to: 'gestion@criterimmo.fr' } }),
  ];
  const s = synthetiser({ ...CONTEXTE, totalFenetre: 11 }, flux);

  it('partage le flux par SENS sur l’adresse de gestion, à l’exact', () => {
    expect(s.envois.total).toBe(5);
    expect(s.recus.total).toBe(6);
  });

  it('(d) distingue les envois de LOGICIEL des envois écrits à la main, et dit quel signal a tranché', () => {
    expect(s.envois.automatiques).toBe(3);
    expect(s.envois.parSignal).toEqual([{ signal: 'x-mailer', nb: 3 }]);
    expect(s.envois.reponses).toBe(2);           // In-Reply-To présent
    expect(s.envois.multiDestinataires).toBe(2); // To + Cc ≥ 2
    expect(s.envois.domaines).toBeNull();        // côté envoi l'expéditeur est constant : aucun intérêt
  });

  it('(e) classe les entrants et rend les DOMAINES (jamais les adresses)', () => {
    expect(s.recus.automatiques).toBe(2);
    expect(s.recus.parSignal).toEqual([{ signal: 'adresse sans réponse', nb: 2 }, { signal: 'list-unsubscribe', nb: 2 }]);
    expect(s.recus.domaines?.lignes).toEqual([
      { valeur: 'monga.io', nb: 2 }, { valeur: 'orange.fr', nb: 3 }, { valeur: 'criterimmo.fr', nb: 1 },
    ].sort((a, b) => b.nb - a.nb || a.valeur.localeCompare(b.valeur)));
  });

  it('compte à part le courrier INTERNE (autre adresse du même domaine) : il gonflerait la file pour rien', () => {
    expect(s.recusMemeDomaine).toBe(1);
    expect(formaterRapport(s).join('\n')).toContain('courrier INTERNE');
  });

  it('les objets affichés sont des GABARITS : ni nom, ni date, ni référence, ni adresse', () => {
    const objets = [...s.envois.objets.lignes, ...s.recus.objets.lignes].map((x) => x.valeur);
    expect(objets).toContain('Quittance de loyer <date>');
    expect(objets).toContain('Problème de chauffage');
    for (const o of objets) {
      expect(o).not.toMatch(/@/);
      expect(o).not.toMatch(/Martin|Durand|Jorel/);
      expect(o).not.toMatch(/\d/); // tout chiffre est passé en <n>/<date>/<ref>
    }
  });

  it('un gabarit vu moins de 3 fois est COMPTÉ mais jamais montré', () => {
    // « Re: Fuite… » n'apparaît que 2 fois et « Point hebdo » 1 fois → sous le seuil, donc masqués.
    const montres = [...s.envois.objets.lignes, ...s.recus.objets.lignes].map((x) => x.valeur);
    expect(montres).not.toContain('Fuite salle de bain chez <nom>');
    expect(s.envois.objets.masquees).toBe(1);
    expect(s.envois.objets.masqueesOccurrences).toBe(2);
  });

  it('(f) le rapport ÉNONCE sa règle de classement et sa règle d’anonymisation', () => {
    const texte = formaterRapport(s).join('\n');
    expect(texte).toContain('(f) LA RÈGLE « humain / automatique », EN CLAIR');
    expect(texte).toContain('probablement AUTOMATIQUE');
    expect(texte).toContain('LIMITES CONNUES');
    expect(texte).toContain('ANONYMISATION — ce que ce rapport ne montre jamais');
    expect(texte).toContain('AU MOINS 3 FOIS');
  });

  it('un sens VIDE ne casse rien et le dit', () => {
    const texte = formaterRapport(synthetiser(CONTEXTE, [msg({ uid: 1 })])).join('\n');
    expect(texte).toContain('(rien à profiler dans ce sens)');
  });
});

describe('rapport', () => {
  it('nomme les trois mesures et conclut sur les en-têtes quand ils sont exploitables', () => {
    const s = synthetiser({ ...CONTEXTE, sortantsGestion: 12 }, [
      msg({ uid: 1, messageId: '<a@x.fr>' }),
      msg({ uid: 2, objet: 'Re: x', messageId: '<b@x.fr>', inReplyTo: '<a@x.fr>' }),
    ]);
    const texte = formaterRapport(s).join('\n');
    expect(texte).toContain("LES TROIS MESURES QUI DÉCIDENT DE L'ERGONOMIE");
    expect(texte).toContain('(a) RÉPONSES SORTANTES');
    expect(texte).toContain('(b) RÉFÉRENCES MNG-');
    expect(texte).toContain('(c) EN-TÊTES DE FIL');
    expect(texte).toContain('en-têtes EXPLOITABLES');
    expect(texte).toContain("écriture n'a eu lieu"); // la garantie de lecture stricte est écrite dans le rapport lui-même
  });

  it('conclut « en-têtes ABÎMÉS » quand les réponses n’ont pas d’ancre — c’est ce cas qui déclenche X-GM-THRID', () => {
    const s = synthetiser(CONTEXTE, [msg({ uid: 1, objet: 'Re: x' }), msg({ uid: 2, objet: 'Re: y' })]);
    expect(formaterRapport(s).join('\n')).toContain('en-têtes ABÎMÉS');
  });

  it('dit « aucune réponse sortante » quand le libellé n’en porte pas — conséquence énoncée, pas un simple zéro', () => {
    const texte = formaterRapport(synthetiser({ ...CONTEXTE, sortantsGestion: 0 }, [msg({ uid: 1 })])).join('\n');
    expect(texte).toContain('AUCUNE réponse sortante');
  });

  it('n’affiche jamais « 0 % » là où il n’y avait rien à mesurer', () => {
    expect(part(0, 0)).toBe('—');
    expect(part(1, 4)).toBe('25 %');
    expect(poids(0)).toBe('0 o');
    expect(poids(2048)).toBe('2 Ko');
    expect(poids(3 * 1024 * 1024)).toBe('3.0 Mo');
  });
});

describe('options de ligne de commande', () => {
  it('lit un entier, refuse une valeur non entière, et n’accepte 0 que si « tout » a un sens', () => {
    expect(lireEntier(['--jours=30'], 'jours', 90)).toBe(30);
    expect(lireEntier(['--jours=abc'], 'jours', 90)).toBe(90);
    expect(lireEntier(['--jours=-5'], 'jours', 90)).toBe(90);
    expect(lireEntier([], 'jours', 90)).toBe(90);
    expect(lireEntier(['--echantillon=0'], 'echantillon', 150, true)).toBe(0);
    expect(lireEntier(['--jours=0'], 'jours', 90)).toBe(90); // 0 jour n'a aucun sens → défaut
  });

  it('lit une valeur texte, y compris avec un « = » dedans', () => {
    expect(lireTexte(['--dossier=GESTION'], 'dossier', 'X')).toBe('GESTION');
    expect(lireTexte(['--dossier=a=b'], 'dossier', 'X')).toBe('a=b');
    expect(lireTexte(['--dossier=  '], 'dossier', 'X')).toBe('X');
    expect(lireTexte([], 'dossier', 'X')).toBe('X');
  });
});

describe('choix du dossier IMAP', () => {
  const boites = ['INBOX', '[Gmail]/Messages envoyés', 'GESTION', 'Gestion/Archives'];

  it('préfère l’égalité EXACTE', () => {
    expect(choisirDossier(boites, 'GESTION')).toBe('GESTION');
  });

  it('accepte une casse différente, puis le dernier segment du chemin', () => {
    expect(choisirDossier(['Gestion'], 'GESTION')).toBe('Gestion');
    expect(choisirDossier(['INBOX', 'Perso/GESTION'], 'gestion')).toBe('Perso/GESTION');
    expect(choisirDossier(['INBOX', '[Gmail]/Tous les messages'], 'tous les messages')).toBe('[Gmail]/Tous les messages');
  });

  it('renvoie null plutôt que d’ouvrir un dossier au hasard', () => {
    expect(choisirDossier(boites, 'INTROUVABLE')).toBeNull();
    expect(choisirDossier(boites, '   ')).toBeNull();
    expect(choisirDossier([], 'GESTION')).toBeNull();
  });
});
