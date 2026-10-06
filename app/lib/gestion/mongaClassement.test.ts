/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 2 — ÉPREUVES DU CLASSEMENT AUTOMATIQUE ═══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce que ces épreuves tiennent, et qu'aucune relecture ne tiendrait :
 *
 *   ① LES TROIS PORTES SONT APPELÉES, DANS LE BON ORDRE — le LOT avant la PERSONNE. La base refuse une
 *      intervention sur un mail sans lien « bien » vivant : l'ordre inverse n'échouerait que sur les mails
 *      qu'on vient classer, c'est-à-dire exactement ceux qui comptent. Une épreuve d'ordre, pas de présence.
 *   ② AUCUNE FENÊTRE DE SUIVI N'EST TOUCHÉE — « la porte de ce mail uniquement » (Arno).
 *   ③ LES DEUX DÉCISIONS HUMAINES ARRÊTENT LE CLASSEMENT (« interne », mail inerte), et aucune écriture n'a lieu.
 *   ④ AUCUNE DÉDUCTION DE BIEN : un événement sans bien ne fait rien poser.
 *
 * 🔴 LES PORTES SONT SIMULÉES, ET C'EST LE POINT. On n'éprouve pas ici que `rattacher` écrit bien — il a ses
 * propres épreuves, et la base ses contraintes. On éprouve que le classement Monga EMPRUNTE ces portes-là, avec
 * ces arguments-là, dans cet ordre-là. C'est la seule chose que ce fichier décide.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const appels: string[] = [];
const rattacher = vi.fn(async (o: { cible: { sorte: string; cle: string | null; id: number | null } }) => {
  appels.push(`rattacher:${o.cible.sorte}:${o.cible.cle ?? o.cible.id}`);
  return { ok: true as const, id: 1 };
});
interface AppelInterventions {
  personnes: { sorte: string; cle: string; libelle: string; role: string }[];
  contact: unknown; origine?: string; parLeSuivi?: boolean;
}
/**
 * 🔴🔴 LA PORTE DE L'ÉVÉNEMENT EST `deplacerMessage` — `gestion_affectation`, l'axe que l'écran de la carte lit.
 * La première écriture de ce point empruntait `rattacher` avec la cible « evenement » : un axe qui ne porte
 * aucune ligne en base et que `carteRepo` ne lit jamais. Ces épreuves tiennent désormais la bonne porte.
 */
const deplacerMessage = vi.fn(async (_m: number, evenementId: number, _a: unknown, motif?: string) => {
  appels.push(`affectation:${evenementId}`);
  derniersMotifs.push(motif ?? '');
  return { ok: true as const, evenementId, reference: 'GES-2026-000042' };
});
const derniersMotifs: string[] = [];
const poserInterventions = vi.fn(async (_o: AppelInterventions) => {
  appels.push('poserInterventions');
  return { ok: true as const, posees: 2, retirees: 0 };
});
/** La base par défaut. ⚠️ REPOSÉE À CHAQUE ÉPREUVE (`beforeEach`) : la dernière la remplace pour simuler un
 *  mail interne au milieu de trois, et une implantation qui survivrait fausserait l'épreuve suivante. */
const baseParDefaut = async (sql: string): Promise<{ rows: unknown[] }> => {
  if (sql.includes('gestion_rattachement_examen')) { appels.push('examen'); return { rows: [] }; }
  if (sql.includes('gestion_affectation')) return { rows: etat.biensDeLEvenement.map((c) => ({ cle: c })) };
  if (sql.includes('corbeille_le IS NOT NULL')) return { rows: [etat.mail] };
  return { rows: [] };
};
const query = vi.fn(baseParDefaut);

/** L'état que la base est censée rendre. Chaque épreuve n'en change qu'un morceau. */
const etat = {
  monga: {
    reference: 'MNG-23987' as string | null, libelle: 'barre de douche defixer',
    adresse: '53 avenue des Ternes, 75017 PARIS', lienMission: null,
    etape: 'devis_rappel', evenementId: '4242' as string | null,
  } as Record<string, unknown> | null,
  biensDeLEvenement: ['lot-27'] as string[],
  mail: {
    recu_le: '2026-10-05', corbeille: false, a_un_bien: false, interne: false,
  } as Record<string, unknown>,
  personnes: [{
    cle: 'lot-27',
    personnes: [
      { sorte: 'proprietaire', cle: 'P1', nom: 'Mme PIRIOU', role: 'proprietaire', actif: true },
      { sorte: 'locataire', cle: 'L1', nom: 'M. ACKET', role: 'locataire_occupant' },
      // ⚠️ CELUI-LÀ NE DOIT PAS ÊTRE POSÉ : parti avant la date du mail.
      { sorte: 'locataire', cle: 'L0', nom: 'M. PARTI', role: 'locataire_sortant' },
    ],
  }],
};

vi.mock('../db/client', () => ({ query: (sql: string) => query(sql), withTransaction: vi.fn() }));
vi.mock('./rattachementRepo', () => ({ rattacher: (o: never) => rattacher(o) }));
vi.mock('./contactExterneRepo', () => ({
  poserInterventions: (o: never) => poserInterventions(o),
  personnesDesBiens: async () => etat.personnes,
}));
vi.mock('./mongaRepo', () => ({
  mongaDuMail: async () => etat.monga,
  mailsDeLaReference: async () => ['700', '791', '57489'],
  lireEtGarderUnMail: async () => ({}),
  SQL_EST_MAIL_MONGA: '(true)',
}));
vi.mock('./schema', () => ({
  mongaDisponible: async () => true, evenementQualifieDisponible: async () => true,
}));
vi.mock('./gestes', () => ({
  deplacerMessage: (m: number, e: number, a: unknown, mo?: string) => deplacerMessage(m, e, a, mo),
}));

const { classerUnMailMonga, classerLesMailsDeLaReference, AUTEUR_MONGA } =
  await import('./mongaClassement');

beforeEach(() => {
  appels.length = 0;
  derniersMotifs.length = 0;
  rattacher.mockClear();
  deplacerMessage.mockClear();
  poserInterventions.mockClear();
  etat.monga = {
    reference: 'MNG-23987', libelle: 'barre de douche defixer',
    adresse: '53 avenue des Ternes, 75017 PARIS', lienMission: null,
    etape: 'devis_rappel', evenementId: '4242',
  };
  etat.biensDeLEvenement = ['lot-27'];
  etat.mail = { recu_le: '2026-10-05', corbeille: false, a_un_bien: false, interne: false };
  etat.personnes = [{
    cle: 'lot-27',
    personnes: [
      { sorte: 'proprietaire', cle: 'P1', nom: 'Mme PIRIOU', role: 'proprietaire', actif: true },
      { sorte: 'locataire', cle: 'L1', nom: 'M. ACKET', role: 'locataire_occupant' },
      { sorte: 'locataire', cle: 'L0', nom: 'M. PARTI', role: 'locataire_sortant' },
    ],
  }];
  query.mockImplementation(baseParDefaut);
  query.mockClear();
});

describe('classement Monga — les trois portes, dans l’ordre', () => {
  it('🔴🔴 LE LOT AVANT L’ÉVÉNEMENT, ET L’ÉVÉNEMENT AVANT LA PERSONNE', async () => {
    const issue = await classerUnMailMonga({ messageId: '57489' });
    expect(issue.classe).toBe(true);
    expect(issue.reference).toBe('MNG-23987');
    expect(issue.biens).toEqual(['lot-27']);
    /**
     * 🔴 L'ORDRE EST LA RÈGLE, et il est éprouvé comme tel. La base refuse une intervention sur un mail sans
     * lien « bien » vivant (migration 293) : poser la personne d'abord échouerait, et seulement sur les mails
     * qui n'avaient aucun bien — donc précisément ceux que ce lot classe.
     */
    expect(appels).toEqual([
      'rattacher:lot:lot-27',
      'affectation:4242',
      'poserInterventions',
      'examen',
    ]);
  });

  it('les liens sont « Auto », signés, et portent le motif qui nomme la référence', async () => {
    await classerUnMailMonga({ messageId: '57489' });
    for (const appel of rattacher.mock.calls) {
      const o = appel[0] as unknown as { origine: string; motif: string; auteur: { libelle: string } };
      expect(o.origine).toBe('automatique');
      expect(o.motif).toBe('classé automatiquement — intervention Monga MNG-23987');
      // ⚠️ UN NOM PROPRE, PAS « automatique » : on doit pouvoir dire LAQUELLE des automatisations a agi.
      expect(o.auteur.libelle).toBe('classement Monga');
    }
    expect(poserInterventions.mock.calls[0]?.[0].origine).toBe('automatique');
    /* ⚠️ LE MOTIF DE L'AFFECTATION NE DIT PLUS « à la main » : il était écrit en dur, et c'était vrai tant que ce
       geste n'avait qu'une origine. Le laisser aurait inscrit en base qu'un humain avait fait ce que personne
       n'a fait. */
    expect(derniersMotifs).toEqual(['classé automatiquement — intervention Monga MNG-23987']);
    expect(AUTEUR_MONGA.libelle).toBe('classement Monga');
    // 🔴 Et il ne peut PAS poser de lien référence ↔ événement : la base refuse « automatique » sur cette table.
    expect(AUTEUR_MONGA.libelle.toLowerCase()).not.toBe('automatique');
  });

  it('🔴 LE PROPRIÉTAIRE ET LE LOCATAIRE **À LA DATE DU MAIL**, et personne d’autre', async () => {
    await classerUnMailMonga({ messageId: '57489' });
    const o = poserInterventions.mock.calls[0]?.[0] as AppelInterventions;
    expect(o.personnes.map((p) => p.cle)).toEqual(['P1', 'L1']);
    // ⚠️ Le locataire SORTANT est écarté : un mail d'octobre ne concerne pas celui qui est parti en août.
    expect(o.personnes.map((p) => p.cle)).not.toContain('L0');
    expect(o.personnes.map((p) => p.role)).toEqual(['proprietaire', 'locataire_occupant']);
    // 🔴🔴 AUCUNE FENÊTRE DE SUIVI : `parLeSuivi` n'est jamais passé. C'est « la porte de ce mail uniquement ».
    expect(o.parLeSuivi).toBeUndefined();
  });

  it('⚠️ un bien sans locataire à cette date ne bloque rien : on pose le propriétaire seul', async () => {
    etat.personnes = [{
      cle: 'lot-27',
      personnes: [{ sorte: 'proprietaire', cle: 'P1', nom: 'Mme PIRIOU', role: 'proprietaire', actif: true }],
    }];
    const issue = await classerUnMailMonga({ messageId: '57489' });
    expect(issue.classe).toBe(true);
    const o = poserInterventions.mock.calls[0]?.[0] as AppelInterventions;
    expect(o.personnes.map((p) => p.cle)).toEqual(['P1']);
  });

  it('plusieurs biens : un lien par bien, tous avant la personne', async () => {
    etat.biensDeLEvenement = ['lot-27', 'lot-146'];
    await classerUnMailMonga({ messageId: '57489' });
    expect(appels).toEqual([
      'rattacher:lot:lot-27', 'rattacher:lot:lot-146', 'affectation:4242',
      'poserInterventions', 'examen',
    ]);
  });

  it('il sort de « À rattacher » : la ligne d’examen passe à « automatique »', async () => {
    await classerUnMailMonga({ messageId: '57489' });
    const sql = query.mock.calls.map((c) => c[0] as string)
      .find((s) => s.includes('gestion_rattachement_examen')) ?? '';
    expect(sql.replace(/\s+/g, ' ')).toContain("VALUES ($1, 'automatique', 0, 0, $2, now())");
    expect(sql.replace(/\s+/g, ' ')).toContain("SET issue = 'automatique'");
  });
});

describe('classement Monga — ce qui l’arrête, et n’écrit rien', () => {
  const rienEcrit = (): void => {
    expect(rattacher).not.toHaveBeenCalled();
    expect(deplacerMessage).not.toHaveBeenCalled();
    expect(poserInterventions).not.toHaveBeenCalled();
    expect(appels).not.toContain('examen');
  };

  it('ce n’est pas un mail Monga', async () => {
    etat.monga = null;
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('pas_un_mail_monga');
    rienEcrit();
  });

  it('⚠️ aucune référence lisible (mesuré : 2 mails sur 97)', async () => {
    etat.monga = { ...(etat.monga as object), reference: null };
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('sans_reference');
    rienEcrit();
  });

  it('🔴 LA RÉFÉRENCE N’EST PAS RELIÉE : c’est un clic d’Arno, jamais une déduction', async () => {
    etat.monga = { ...(etat.monga as object), evenementId: null };
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('reference_a_relier');
    expect(issue.reference).toBe('MNG-23987');
    rienEcrit();
  });

  it('🔴 AUCUNE DÉDUCTION DE BIEN : un événement sans bien ne fait rien poser', async () => {
    etat.biensDeLEvenement = [];
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('evenement_sans_bien');
    // ⚠️ On ne cherche PAS le lot dans l'adresse du mail. « Aucune déduction automatique » (Arno).
    rienEcrit();
  });

  it('🔴🔴 UN MAIL « INTERNE » N’EST PAS CLASSÉ — un humain s’est prononcé', async () => {
    etat.mail = { ...etat.mail, interne: true };
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('mail_interne');
    rienEcrit();
  });

  it('🔴🔴 UN MAIL INERTE N’EST PAS CLASSÉ (lot CORBEILLE-SANS-STATUT)', async () => {
    etat.mail = { ...etat.mail, corbeille: true, a_un_bien: false, interne: false };
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.refus).toBe('mail_inerte');
    rienEcrit();
  });

  it('🔴🔴 L’ANCRE EST CLASSÉE MÊME INERTE — c’est le mail depuis lequel Arno clique', async () => {
    /**
     * LE DÉFAUT QUE CETTE ÉPREUVE FERME, trouvé en préparant l'essai réel : le mail 57489 (MNG-23987) est à la
     * corbeille sans statut, donc inerte. Arno ouvre SA fenêtre, clique « Créer l'événement » — et ce mail-là se
     * faisait refuser pendant que les autres se classaient. Il aurait vu l'événement se remplir sans le mail
     * depuis lequel il venait de cliquer.
     *
     * 🔴 LA RÈGLE EST DÉJÀ CELLE D'ARNO : « rattacher un mail déjà jeté le réveille aussi, parce qu'il a alors un
     * statut ». L'inertie protège du classement AUTOMATIQUE, pas d'une décision.
     */
    etat.mail = { ...etat.mail, corbeille: true, a_un_bien: false, interne: false };
    expect((await classerUnMailMonga({ messageId: '57489' })).refus).toBe('mail_inerte');
    appels.length = 0;
    rattacher.mockClear();
    deplacerMessage.mockClear();
    poserInterventions.mockClear();
    const issue = await classerUnMailMonga({ messageId: '57489', ancre: true });
    expect(issue.classe).toBe(true);
  });

  it('🔴🔴 MAIS L’ANCRE NE LÈVE JAMAIS LA MARQUE « INTERNE »', async () => {
    /* Dire « interne » est un jugement explicite sur le CONTENU d'un mail ; le défaire a sa propre confirmation
       à l'écran (lot PHOTOS-ET-INTERNE-INVERSE), et ce n'est pas à l'encart Monga de la contourner. */
    etat.mail = { ...etat.mail, interne: true };
    expect((await classerUnMailMonga({ messageId: '1', ancre: true })).refus).toBe('mail_interne');
    rienEcrit();
  });

  it('⚠️ MAIS un mail jeté AVEC un statut n’est pas inerte : il se classe', async () => {
    etat.mail = { ...etat.mail, corbeille: true, a_un_bien: true };
    const issue = await classerUnMailMonga({ messageId: '1' });
    expect(issue.classe).toBe(true);
  });
});

describe('classement Monga — tous les mails de la référence suivent', () => {
  it('⚠️ L’ANCRE NE VAUT QUE POUR ELLE : les autres mails gardent la règle automatique', async () => {
    /* Mesuré sur MNG-23987 : DEUX de ses quatre mails sont à la corbeille. Celui qu'Arno regarde se classe ;
       l'autre reste tranquille, parce que personne n'a cliqué dessus. */
    let n = 0;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('gestion_rattachement_examen')) { appels.push('examen'); return { rows: [] }; }
      if (sql.includes('gestion_affectation')) return { rows: [{ cle: 'lot-27' }] };
      if (sql.includes('corbeille_le IS NOT NULL')) {
        n += 1;
        return { rows: [{ ...etat.mail, corbeille: true, a_un_bien: false }] };
      }
      return { rows: [] };
    });
    const bilan = await classerLesMailsDeLaReference({ reference: 'MNG-23987', ancre: '791' });
    expect(n).toBe(3);
    expect(bilan.classes).toBe(1);
    expect(bilan.refuses.map((r) => r.messageId)).toEqual(['700', '57489']);
    expect(bilan.refuses.every((r) => r.refus === 'mail_inerte')).toBe(true);
  });

  it('🔴 LE POINT 3 EN DÉCOULE : un clic, et l’historique entier rejoint l’événement', async () => {
    const bilan = await classerLesMailsDeLaReference({ reference: 'MNG-23987' });
    expect(bilan.classes).toBe(3);
    expect(bilan.refuses).toEqual([]);
    // Trois mails × un lot = trois rattachements de bien, et trois affectations vers la carte.
    expect(rattacher).toHaveBeenCalledTimes(3);
    expect(deplacerMessage).toHaveBeenCalledTimes(3);
  });

  it('⚠️ un mail refusé n’arrête pas les autres', async () => {
    let n = 0;
    const monga = etat.monga;
    // Le deuxième mail est « interne » : lui seul doit être écarté.
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('gestion_rattachement_examen')) { appels.push('examen'); return { rows: [] }; }
      if (sql.includes('gestion_affectation')) return { rows: [{ cle: 'lot-27' }] };
      if (sql.includes('corbeille_le IS NOT NULL')) {
        n += 1;
        return { rows: [{ ...etat.mail, interne: n === 2 }] };
      }
      return { rows: [] };
    });
    etat.monga = monga;
    const bilan = await classerLesMailsDeLaReference({ reference: 'MNG-23987' });
    expect(bilan.classes).toBe(2);
    expect(bilan.refuses).toEqual([{ messageId: '791', refus: 'mail_interne' }]);
  });
});

describe('les deux portes existantes : « Auto » ne change RIEN pour un clic', () => {
  /**
   * ══ 🔴🔴 LE GARDE QUI PROTÈGE LE RESTE DU MODULE ════════════════════════════════════════════════════════════
   *
   * `rattacher` sert à SEPT écrans, et `poserInterventions` à la projection des fenêtres. Ce lot leur ajoute un
   * paramètre `origine` FACULTATIF. La seule chose qui compte ici : que son défaut soit mot pour mot l'ancien
   * comportement. Ces épreuves lisent le code émis — convention du dépôt pour ce qu'aucun appel ne peut montrer.
   */
  const lire = (f: string): string => readFileSync(`app/lib/gestion/${f}`, 'utf8').replace(/\s+/g, ' ');

  it('🔴 le défaut reste « manuel », dans les deux portes', () => {
    const r = lire('rattachementRepo.ts');
    expect(r).toContain("const auto = (o.origine ?? 'manuel') === 'automatique'");
    expect(r).toContain("const auteurAutomatique = (o.origine ?? 'manuel') === 'automatique'");
    expect(lire('contactExterneRepo.ts')).toContain("(o.origine ?? 'manuel') === 'automatique' ? 'automatique'");
  });

  it('🔴🔴 UN LIEN « AUTO » SIGNE SON STATUT — sinon le moteur l’effacerait à la relève suivante', () => {
    /**
     * `retirerLiensPerimes` retire tout lien `origine = 'automatique'` dont `statut_par_libelle IS NULL` et que
     * le moteur ne propose plus. Le moteur ne propose jamais le lot d'un mail Monga (76 lots à la même adresse),
     * et jamais aucune personne : sans cette signature, le classement aurait disparu en silence.
     */
    // Le rang du paramètre diffère entre les deux portes (10 et 11) : on éprouve la CONDUITE, pas le rang.
    expect(lire('rattachementRepo.ts'))
      .toContain("CASE WHEN $10 = 'automatique' THEN $9::text END");
    expect(lire('contactExterneRepo.ts'))
      .toContain("CASE WHEN $11 = 'automatique' THEN $8::text END");
    // Et la garde qu'on ne doit pas perdre, dans le fichier du moteur :
    expect(lire('rattachementRepo.ts')).toContain(
      "AND origine = 'automatique' AND statut IN ('propose', 'confirme') AND statut_par_libelle IS NULL");
  });

  it('🔴 une automatisation ne lève AUCUNE marque humaine', () => {
    expect(lire('rattachementRepo.ts')).toContain('if (issue.ok && !auteurAutomatique) await leverLaMarque()');
  });

  it('⚠️ le classement Monga n’emprunte AUCUNE porte de fenêtre de suivi', () => {
    const code = readFileSync('app/lib/gestion/mongaClassement.ts', 'utf8');
    for (const interdit of ['poserClassement', 'periodeRepo', 'gestion_fil_periode', 'annulerClassement']) {
      // ⚠️ Les encadrés CITENT ces noms pour expliquer pourquoi on ne s'en sert pas : on ne lit donc que le CODE,
      //    commentaires retirés.
      const sansCommentaires = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(sansCommentaires).not.toContain(interdit);
    }
  });
});
