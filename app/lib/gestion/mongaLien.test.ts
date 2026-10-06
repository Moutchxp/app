/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 3 — ÉPREUVES DU CLIC QUI RELIE, ET DE L'« ANNULER » ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce que ces épreuves tiennent :
 *
 *   ① LE LIEN EST POSÉ **AVANT** LE CLASSEMENT. Le classement LIT le lien pour savoir où ranger : dans l'autre
 *      ordre, il refuserait chaque mail avec « référence à relier », et le clic n'aurait rien classé. C'est une
 *      épreuve d'ORDRE, et c'est le défaut le plus facile à introduire en relisant ce fichier.
 *   ② LA RÈGLE DU NOM PASSE PAR `modifierEvenement`, la porte qui journalise l'AVANT et l'APRÈS — c'est ainsi, et
 *      pas autrement, que « l'ancien nom reste visible dans l'historique » (Arno).
 *   ③ UN AUTEUR AUTOMATIQUE EST REFUSÉ. La base le refuse déjà ; ici on le refuse AVEC UN MOT LISIBLE, et une
 *      épreuve l'exige — la décision n° 1 d'Arno ne doit pas tenir au hasard d'une contrainte.
 *   ④ L'« ANNULER » NE DÉFAIT QUE CE QUE LE CLIC A FAIT, reconnu par son MOTIF. Un bien qu'Arno avait rattaché à
 *      la main AVANT le clic reste rattaché. C'est la même discipline que les fenêtres de suivi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appels: string[] = [];
const sql: string[] = [];
const params: unknown[][] = [];

const etat = {
  evenement: { objet: 'Fuite salle de bain', etat: 'en_cours' } as { objet: string; etat: string } | undefined,
  lecture: {
    libelle: 'barre de douche defixer', adresse: '53 avenue des Ternes, 75017 PARIS',
    lien_mission: 'https://app.monga.io/missions/view/abc',
  } as Record<string, unknown> | undefined,
  lienVivant: undefined as { id: string; evenement_id: string; nom_avant: string | null } | undefined,
  dejaRelie: 0,
  affectes: [] as { message_id: string }[],
  /** `nee` : la ligne est NÉE du classement (⇒ retire). Sinon le moteur la PROPOSAIT (⇒ retour à propose). */
  liensPoses: [] as { id: string; sorte: string; nee: boolean }[],
  resteAffecte: 0,
  insertEchoue: false,
  examensRepris: [] as string[],
  filsAReexaminer: [] as string[],
};

const query = vi.fn(async (brut: string, p?: unknown[]) => {
  /* ⚠️ ON RECONNAÎT LA REQUÊTE SUR SA FORME NORMALISÉE, jamais sur le texte brut : une coupure de ligne entre
     « gestion_rattachement » et « WHERE » faisait rater la branche, et l'épreuve de l'ordre a trouvé le défaut. */
  const texte = brut.replace(/\s+/g, ' ');
  sql.push(texte);
  params.push(p ?? []);
  if (texte.includes('INSERT INTO gestion_monga_lien')) {
    appels.push('insert:lien');
    if (etat.insertEchoue) throw new Error('doublon');
    return { rows: [] };
  }
  if (texte.includes('UPDATE gestion_monga_lien')) { appels.push('retire:lien'); return { rows: [] }; }
  if (texte.includes('FROM gestion_evenement WHERE id')) {
    return { rows: etat.evenement === undefined ? [] : [etat.evenement] };
  }
  if (texte.includes('FROM gestion_monga_mail mm')) {
    return { rows: etat.lecture === undefined ? [] : [etat.lecture] };
  }
  if (texte.includes('count(*)::int AS n FROM gestion_monga_lien')) {
    return { rows: [{ n: etat.dejaRelie }] };
  }
  if (texte.includes('FROM gestion_monga_lien WHERE reference')) {
    return { rows: etat.lienVivant === undefined ? [] : [etat.lienVivant] };
  }
  if (texte.includes('FROM gestion_affectation WHERE evenement_id') && texte.includes('count(*)')) {
    return { rows: [{ n: etat.resteAffecte }] };
  }
  if (texte.includes('FROM gestion_affectation')) return { rows: etat.affectes };
  if (texte.includes('FROM gestion_rattachement WHERE statut')) return { rows: etat.liensPoses };
  if (texte.includes('UPDATE gestion_rattachement_examen')) {
    appels.push('examens:repris');
    return { rows: etat.examensRepris.map((m) => ({ message_id: m })) };
  }
  if (texte.includes('FROM gestion_monga_mail mm JOIN gestion_message')) {
    return { rows: etat.filsAReexaminer.map((f) => ({ fil_id: f })) };
  }
  return { rows: [] };
});

const modifierEvenement = vi.fn(async (_id: number, champs: { objet?: string }) => {
  appels.push(`renomme:${champs.objet ?? ''}`);
  return { ok: true as const, evenementId: 4242 };
});
const deplacerMessageVersNouveau = vi.fn(async (_m: number, nouveau: {
  objet: string; parties?: readonly { sorte: string; cle: string }[];
}) => {
  appels.push(`cree:${nouveau.objet}`);
  partiesVues.push([...(nouveau.parties ?? [])]);
  return { ok: true as const, evenementId: 777, reference: 'GES-2026-000777' };
});
const partiesVues: { sorte: string; cle: string }[][] = [];
const remettreMessage = vi.fn(async (m: number) => { appels.push(`remet:${m}`); return { ok: true as const }; });
const changerStatut = vi.fn(async (o: { lienId: number; statut: string }) => {
  appels.push(`statut:${o.lienId}:${o.statut}`);
  return { ok: true as const, id: o.lienId };
});

vi.mock('../db/client', () => ({
  query: (t: string, p?: unknown[]) => query(t, p), withTransaction: vi.fn(),
}));
vi.mock('./gestes', () => ({
  deplacerMessage: vi.fn(async () => ({ ok: true })),
  deplacerMessageVersNouveau: (m: number, n: never) => deplacerMessageVersNouveau(m, n),
  modifierEvenement: (i: number, c: never) => modifierEvenement(i, c),
  remettreMessage: (m: number) => remettreMessage(m),
}));
vi.mock('./rattachementRepo', () => ({
  rattacher: vi.fn(async () => ({ ok: true, id: 1 })),
  changerStatut: (o: never) => changerStatut(o),
}));
vi.mock('./contactExterneRepo', () => ({
  poserInterventions: vi.fn(async () => ({ ok: true, posees: 0, retirees: 0 })),
  personnesDesBiens: async () => [{
    cle: 'lot-27',
    adresseComplete: '53 avenue des Ternes, 75017 PARIS',
    personnes: [
      { sorte: 'proprietaire', cle: 'P1', nom: 'Mme PIRIOU', role: 'proprietaire', actif: true },
      { sorte: 'locataire', cle: 'L1', nom: 'M. ACKET', role: 'locataire_occupant' },
      { sorte: 'locataire', cle: 'L0', nom: 'M. PARTI', role: 'locataire_sortant' },
    ],
  }],
}));
vi.mock('./mongaRepo', () => ({
  mongaDuMail: async () => null,
  mailsDeLaReference: async () => ['700', '791'],
  lireEtGarderUnMail: async () => ({}),
  SQL_EST_MAIL_MONGA: '(true)',
}));
vi.mock('./schema', () => ({
  mongaDisponible: async () => true, evenementQualifieDisponible: async () => true,
}));

const mod = await import('./mongaClassement');

/**
 * ⚠️ LE CLASSEMENT TOURNE POUR DE VRAI DANS CES ÉPREUVES, et il ne faut pas le simuler : il vit dans le MÊME
 * module que `relierLaReference`, que `vi.mock` ne peut donc pas atteindre. Avec `mongaDuMail` qui rend `null`,
 * il refuse chaque mail (« pas un mail Monga ») et n'écrit rien — ce qui laisse voir l'ordre des trois gestes du
 * clic sans bruit. Son propre comportement est éprouvé dans `mongaClassement.test.ts`.
 */
const ARNO = { id: 7, libelle: 'Arnaud JOREL' };

beforeEach(() => {
  appels.length = 0;
  sql.length = 0;
  params.length = 0;
  partiesVues.length = 0;
  query.mockClear();
  modifierEvenement.mockClear();
  deplacerMessageVersNouveau.mockClear();
  remettreMessage.mockClear();
  changerStatut.mockClear();
  etat.evenement = { objet: 'Fuite salle de bain', etat: 'en_cours' };
  etat.lecture = {
    libelle: 'barre de douche defixer', adresse: '53 avenue des Ternes, 75017 PARIS',
    lien_mission: 'https://app.monga.io/missions/view/abc',
  };
  etat.lienVivant = undefined;
  etat.dejaRelie = 0;
  etat.affectes = [];
  etat.liensPoses = [];
  etat.resteAffecte = 0;
  etat.insertEchoue = false;
  etat.examensRepris = [];
  etat.filsAReexaminer = [];
});

describe('relierLaReference — relier à un événement EXISTANT', () => {
  it('🔴🔴 LE LIEN D’ABORD, LE NOM ENSUITE, LE CLASSEMENT EN DERNIER', async () => {
    const issue = await mod.relierLaReference({
      reference: 'MNG-23987', evenementId: '4242', auteur: ARNO,
    });
    expect(issue.ok).toBe(true);
    /**
     * 🔴 L'ORDRE EST LA RÈGLE : le classement LIT le lien. Posé après lui, il refuserait chaque mail avec
     * « référence à relier » — le clic n'aurait rien classé, et personne ne l'aurait vu tout de suite.
     */
    expect(appels).toEqual(['insert:lien', 'renomme:barre de douche defixer']);
    /* ⚠️ `classes === 0` ICI, et c'est voulu : les deux mails simulés ne sont pas des mails Monga, donc le
       classement les refuse. Ce qui compte dans cette épreuve est que le lien soit posé AVANT lui. */
    expect(issue.ok && issue.classes).toBe(0);
  });

  it('🔴 LE NOM D’AVANT EST GARDÉ POUR L’« ANNULER » — et seulement quand il change', async () => {
    await mod.relierLaReference({ reference: 'MNG-23987', evenementId: '4242', auteur: ARNO });
    const p = params[sql.findIndex((s) => s.includes('INSERT INTO gestion_monga_lien'))];
    expect(p[0]).toBe('MNG-23987');
    expect(p[1]).toBe('4242');
    expect(p[2]).toBe('barre de douche defixer'); // le libellé LU, figé : la trace de la décision
    expect(p[3]).toBe('53 avenue des Ternes, 75017 PARIS');
    expect(p[5]).toBe('Fuite salle de bain'); // nom_avant
    expect(p[7]).toBe('Arnaud JOREL');
  });

  it('⚠️ le nom ne change pas ⇒ aucun renommage, et `nom_avant` reste NULL', async () => {
    etat.evenement = { objet: 'barre de douche defixer', etat: 'en_cours' };
    const issue = await mod.relierLaReference({
      reference: 'MNG-23987', evenementId: '4242', auteur: ARNO,
    });
    expect(issue.ok && issue.renomme).toBeNull();
    expect(modifierEvenement).not.toHaveBeenCalled();
    const p = params[sql.findIndex((s) => s.includes('INSERT INTO gestion_monga_lien'))];
    expect(p[5]).toBeNull();
  });

  it('🔴🔴 UN AUTEUR AUTOMATIQUE EST REFUSÉ, avec un mot lisible', async () => {
    for (const libelle of ['automatique', 'Automatique', '  ', '']) {
      const issue = await mod.relierLaReference({
        reference: 'MNG-23987', evenementId: '4242', auteur: { id: null, libelle },
      });
      expect(issue.ok).toBe(false);
      expect(issue.ok === false && issue.motif).toContain('geste humain');
    }
    // 🔴 ET RIEN N'A ÉTÉ ÉCRIT : pas d'insertion, pas de renommage, pas de classement.
    expect(appels).toEqual([]);
  });

  it('⚠️ un événement inconnu est refusé avant toute écriture', async () => {
    etat.evenement = undefined;
    const issue = await mod.relierLaReference({
      reference: 'MNG-23987', evenementId: '9999', auteur: ARNO,
    });
    expect(issue.ok).toBe(false);
    expect(appels).toEqual([]);
  });

  it('🔴 UNE RÉFÉRENCE DÉJÀ RELIÉE N’EST PAS ÉCRASÉE : l’index unique parle, on le DIT', async () => {
    etat.insertEchoue = true;
    const issue = await mod.relierLaReference({
      reference: 'MNG-23987', evenementId: '4242', auteur: ARNO,
    });
    expect(issue.ok).toBe(false);
    expect(issue.ok === false && issue.motif).toContain('déjà reliée');
    // ⚠️ Et le nom n'a PAS été changé : un lien refusé ne renomme rien.
    expect(modifierEvenement).not.toHaveBeenCalled();
  });
});

describe('creerEvenementEtRelier — créer l’événement « <libellé Monga> » sur le lot choisi', () => {
  it('🔴 LA CARTE PREND LE LIBELLÉ MONGA, ET DIT SUR QUOI ELLE PORTE', async () => {
    const issue = await mod.creerEvenementEtRelier({
      reference: 'MNG-23987', messageId: '57489', lotCle: 'lot-27', auteur: ARNO,
    });
    expect(issue.ok).toBe(true);
    expect(appels[0]).toBe('cree:barre de douche defixer');
    /**
     * 🔴 LES PARTIES : le lot choisi, son propriétaire actif, son locataire du jour — et PAS le locataire parti.
     * C'est ce que `biensDeLEvenement` lira en premier pour classer les mails suivants : la carte neuve sait donc
     * tout de suite quel est son bien, sans rien dériver.
     */
    expect(partiesVues[0].map((p) => `${p.sorte}:${p.cle}`)).toEqual([
      'lot:lot-27', 'proprietaire:P1', 'locataire:L1',
    ]);
    // Puis le lien, sur la carte qui vient de naître.
    expect(appels).toContain('insert:lien');
  });

  it('⚠️ AUCUN LIBELLÉ MONGA ⇒ ON REFUSE, et on dit quoi faire', async () => {
    etat.lecture = { libelle: null, adresse: null, lien_mission: null };
    const issue = await mod.creerEvenementEtRelier({
      reference: 'MNG-19492', messageId: '1', lotCle: 'lot-27', auteur: ARNO,
    });
    expect(issue.ok).toBe(false);
    expect(issue.ok === false && issue.motif).toContain('à la main');
    // 🔴 Rien n'est créé : une carte « sans objet » serait introuvable, et la base la refuserait de toute façon.
    expect(deplacerMessageVersNouveau).not.toHaveBeenCalled();
  });

  it('⚠️ une référence déjà reliée ne crée pas une seconde carte', async () => {
    etat.dejaRelie = 1;
    const issue = await mod.creerEvenementEtRelier({
      reference: 'MNG-23987', messageId: '1', lotCle: 'lot-27', auteur: ARNO,
    });
    expect(issue.ok).toBe(false);
    expect(deplacerMessageVersNouveau).not.toHaveBeenCalled();
  });
});

describe('delierLaReference — l’« Annuler » des secondes qui suivent', () => {
  beforeEach(() => {
    etat.lienVivant = { id: '1', evenement_id: '4242', nom_avant: 'Fuite salle de bain' };
    etat.affectes = [{ message_id: '700' }, { message_id: '57489' }];
    /* Le cas RÉEL, mesuré sur MNG-23987 : les PERSONNES naissent du classement, le LOT était déjà proposé par
       le moteur. Les deux ne se défont donc pas de la même façon. */
    etat.liensPoses = [
      { id: '11', sorte: 'proprietaire', nee: true },
      { id: '12', sorte: 'locataire', nee: true },
      { id: '13', sorte: 'lot', nee: false },
    ];
    etat.examensRepris = ['700', '57489'];
  });

  it('🔴🔴 IL DÉFAIT DANS L’ORDRE INVERSE : le nom, les affectations, les liens, le lien Monga, les examens',
    async () => {
    const issue = await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO });
    expect(issue.ok).toBe(true);
    expect(appels).toEqual([
      'renomme:Fuite salle de bain',
      'remet:700', 'remet:57489',
      /**
       * 🔴🔴 DEUX GESTES DIFFÉRENTS, ET C'EST LE DÉFAUT QUE L'ESSAI RÉEL A TROUVÉ. Les personnes sont NÉES du
       * classement : on les retire. Le lot, lui, était PROPOSÉ par le moteur avant le clic — « retirer » aurait
       * effacé une proposition que personne n'avait refusée. Il revient donc à `propose`.
       */
      'statut:11:retire', 'statut:12:retire', 'statut:13:propose',
      'retire:lien',
      /* ⑤ EN DERNIER, et c'est l'ordre juste : le lien est la DÉCISION qu'on défait ; la ligne d'examen n'est
         qu'une conséquence de son classement. */
      'examens:repris',
    ]);
    expect(issue.nomRemis).toBe('Fuite salle de bain');
    expect(issue.mailsRemis).toBe(2);
    expect(issue.liensRetires).toBe(2);
    expect(issue.liensRendus).toBe(1);
    /**
     * 🔴 ET LES LIGNES D'EXAMEN DU CLASSEMENT SONT REPRISES. Sans ce passage, un mail à la corbeille gardait son
     * issue « automatique » après l'annulation : la passe du moteur n'ouvre pas les mails jetés, donc le
     * réexamen ne pouvait pas le corriger. Mesuré sur 57489.
     */
    expect(issue.examensRepris).toBe(2);
  });

  it('🔴🔴 IL NE RECONNAÎT QUE CE QUE LE CLASSEMENT A POSÉ — par le MOTIF', async () => {
    await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO });
    const iAff = sql.findIndex((s) => s.includes('FROM gestion_affectation WHERE evenement_id')
      && s.includes('motif = $2'));
    expect(iAff).toBeGreaterThanOrEqual(0);
    expect(params[iAff][1]).toBe('classé automatiquement — intervention Monga MNG-23987');
    const iRat = sql.findIndex((s) => s.includes('FROM gestion_rattachement WHERE statut'));
    expect(params[iRat][0]).toBe('classé automatiquement — intervention Monga MNG-23987');
    /**
     * 🔴🔴 LA SIGNATURE EST CHERCHÉE DANS LES **DEUX** COLONNES, et c'est le cœur du correctif. `rattacher` ne
     * crée pas toujours : quand le moteur avait déjà proposé le bien — le cas de TOUS les mails Monga, dont le
     * corps porte l'adresse —, elle CONFIRME la ligne existante, et c'est `statut_motif` qui porte notre
     * signature tandis que `motif` reste celui du moteur. Chercher dans `motif` seul ne trouvait rien : mesuré
     * à l'essai réel, l'annulation laissait les neuf liens en place (`liensRetires: 0`).
     */
    expect(sql[iRat]).toContain("coalesce(motif, '') = $1 OR coalesce(statut_motif, '') = $1");
    /**
     * ⚠️ UN BIEN RATTACHÉ À LA MAIN AVANT LE CLIC NE PORTE PAS CE MOTIF : il n'est donc jamais retiré. C'est la
     * même règle que « une fenêtre ne retire que ce qu'une fenêtre a posé », et pour la même raison — un geste
     * humain ne se défait jamais tout seul.
     */
    expect(sql[iRat]).toContain("origine = 'automatique'");
  });

  it('⚠️ UNE CARTE NÉE DU GESTE RESTE, VIDE, et le résultat le DIT', async () => {
    etat.resteAffecte = 0;
    const issue = await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO });
    expect(issue.evenementVide).toBe(true);
    // 🔴 Rien n'est supprimé dans ce dépôt : aucun DELETE n'est émis.
    for (const s of sql) expect(s).not.toMatch(/^\s*DELETE/i);
  });

  it('un événement qui porte encore des mails n’est pas annoncé vide', async () => {
    etat.resteAffecte = 3;
    const issue = await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO });
    expect(issue.evenementVide).toBe(false);
  });

  it('⚠️ aucun nom d’avant (carte née du geste) ⇒ aucun renommage', async () => {
    etat.lienVivant = { id: '1', evenement_id: '777', nom_avant: null };
    const issue = await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO });
    expect(issue.nomRemis).toBeNull();
    expect(modifierEvenement).not.toHaveBeenCalled();
  });

  it('une référence qui n’est reliée à rien est refusée, sans rien défaire', async () => {
    etat.lienVivant = undefined;
    const issue = await mod.delierLaReference({ reference: 'MNG-99999', auteur: ARNO });
    expect(issue.ok).toBe(false);
    expect(issue.motif).toContain('n’est reliée à aucun événement');
    expect(appels).toEqual([]);
  });

  it('🔴 LE LIEN EST RETIRÉ, JAMAIS SUPPRIMÉ — daté, signé, et la référence redevient reliable', async () => {
    await mod.delierLaReference({ reference: 'MNG-23987', auteur: ARNO, motif: 'essai' });
    const i = sql.findIndex((s) => s.includes('UPDATE gestion_monga_lien'));
    expect(sql[i]).toContain('SET retire_le = now()');
    expect(sql[i]).toContain('WHERE id = $1 AND retire_le IS NULL');
    expect(params[i][2]).toBe('Arnaud JOREL');
    expect(params[i][3]).toBe('essai');
  });
});
