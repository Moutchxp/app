import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconnaitre, type ContactConnu, type OccupationConnue } from './adressesMessage';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — TOUTES LES ADRESSES D'UNE FICHE, ET AUCUN CACHE PÉRIMÉ ════════════
 *
 * ═══ LE CAS D'ARNO, 01/10/2026 ══════════════════════════════════════════════════════════════════════════════════
 *
 * Mme THAI écrit depuis `cecilethai85@gmail.com`. Arno ajoute cette SECONDE adresse à sa fiche, recharge, rouvre
 * le mail (fil 36558) : aucune proposition de ses deux biens du 10 rue Chateaubriand.
 *
 * 🔴 LE PREMIER BLOC CI-DESSOUS MONTRE QUE LE MOTEUR N'Y ÉTAIT POUR RIEN : il a toujours lu TOUTES les lignes de
 * contact d'une fiche. Le défaut était ailleurs — dans `gestion_message_adresse`, qui garde le RÉSULTAT de cette
 * lecture, calculé une fois pour toutes à la capture du mail. C'est ce cache que les blocs suivants invalident.
 */

const OCCUPATIONS: OccupationConnue[] = [];

describe('🔴🔴 ① une fiche a plusieurs adresses, et elles comptent TOUTES', () => {
  /** La fiche de Mme THAI, telle qu'elle est en base depuis le 01/10 : deux adresses, une seule personne. */
  const THAI: ContactConnu[] = [
    { email: 'cecilethai@hotmail.com', role: 'proprietaire', sujetId: 286, proprietaireCle: '250' },
    { email: 'cecilethai85@gmail.com', role: 'proprietaire', sujetId: 286, proprietaireCle: '250' },
  ];
  const vue = (adresse: string) =>
    reconnaitre({ adresse, adresseBrute: adresse, role: 'expediteur', interne: false },
      '2026-09-30', THAI, OCCUPATIONS);

  it('🔴🔴 la SECONDE adresse désigne la même personne que la première', () => {
    expect(vue('cecilethai85@gmail.com').proprietaireCle).toBe('250');
    expect(vue('cecilethai@hotmail.com').proprietaireCle).toBe('250');
  });

  it('🔴 et une troisième, et une dixième : rien ne borne la liste', () => {
    const dix: ContactConnu[] = Array.from({ length: 10 }, (_, i) => ({
      email: `a${i}@x.fr`, role: 'proprietaire' as const, sujetId: 7, proprietaireCle: 'P7',
    }));
    for (const c of dix) {
      expect(reconnaitre({ adresse: c.email, adresseBrute: c.email, role: 'copie', interne: false },
        '2026-09-30', dix, OCCUPATIONS).proprietaireCle, c.email).toBe('P7');
    }
  });

  it('⚠️ une adresse étrangère à la fiche n’est toujours pas reconnue', () => {
    expect(vue('inconnu@ailleurs.fr').partie).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE CACHE, ET CE QUI L'INVALIDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => Promise<unknown>) => f(queryMock),
}));
let schema = true;
vi.mock('./schema', () => ({
  adressesMessagesDisponibles: async () => schema,
  rattachementsDisponibles: async () => schema,
}));

const recalculerLesAdresses = vi.fn(async () => 3);
const messagesAReconnaitre = vi.fn(async () => [] as number[]);
const messagesDeCesAdresses = vi.fn(async () => ({ messageIds: [] as number[], filIds: [] as number[] }));
vi.mock('./adressesRepo', () => ({
  recalculerLesAdresses: (...a: unknown[]) => recalculerLesAdresses(...(a as [])),
  messagesAReconnaitre: (...a: unknown[]) => messagesAReconnaitre(...(a as [])),
  messagesDeCesAdresses: (...a: unknown[]) => messagesDeCesAdresses(...(a as [])),
}));

const examinerFilsPrecis = vi.fn(async () => undefined);
vi.mock('./rattachementRepo', () => ({
  examinerFilsPrecis: (...a: unknown[]) => examinerFilsPrecis(...(a as [])),
  chargerLibelles: async () => ({ lots: new Map(), proprietaires: new Map(), evenements: new Map() }),
  COMPTES_VIDES: {},
}));

const { FILS_MAX_PAR_GESTE, LONGUEUR_NOM_CHERCHABLE, rafraichirLesFils, rafraichirPourAdresses,
  rafraichirPourNoms } = await import('./rafraichirPropositions');

beforeEach(() => {
  schema = true;
  for (const m of [queryMock, recalculerLesAdresses, messagesAReconnaitre, messagesDeCesAdresses,
    examinerFilsPrecis]) m.mockClear();
  queryMock.mockResolvedValue({ rows: [] });
  recalculerLesAdresses.mockResolvedValue(3);
  messagesAReconnaitre.mockResolvedValue([]);
  messagesDeCesAdresses.mockResolvedValue({ messageIds: [], filIds: [] });
});

describe('🔴🔴 ② modifier une fiche recalcule les mails de cette adresse, TOUT DE SUITE', () => {
  it('🔴🔴 les adresses sont recalculées, PUIS les conversations réexaminées', async () => {
    messagesDeCesAdresses.mockResolvedValue({ messageIds: [11, 12], filIds: [5] });
    const c = await rafraichirPourAdresses(['cecilethai85@gmail.com']);

    expect(messagesDeCesAdresses).toHaveBeenCalledWith(['cecilethai85@gmail.com']);
    expect(recalculerLesAdresses).toHaveBeenCalledWith([11, 12]);
    expect(examinerFilsPrecis).toHaveBeenCalled();
    expect(c.messagesPerimes).toBe(2);
    expect(c.filsReexamines).toBe(1);

    /**
     * 🔴🔴 L'ORDRE EST LA FONCTIONNALITÉ. Réexaminer AVANT d'avoir recalculé la reconnaissance relirait l'ancienne
     * lecture de l'annuaire : la passe aurait l'air de travailler et ne changerait rien.
     */
    expect(recalculerLesAdresses.mock.invocationCallOrder[0])
      .toBeLessThan(examinerFilsPrecis.mock.invocationCallOrder[0]);
  });

  it('🔴 le réexamen est SIGNÉ : on doit pouvoir dire pourquoi un lien a disparu ce jour-là', async () => {
    messagesDeCesAdresses.mockResolvedValue({ messageIds: [11], filIds: [5] });
    await rafraichirPourAdresses(['x@y.fr']);
    const retrait = (examinerFilsPrecis.mock.calls[0] as unknown[])[4] as { auteur: string; motif: string };
    expect(retrait.auteur).toContain('fiche');
    expect(retrait.motif).toContain('coordonnées');
  });

  it('⚠️ aucune adresse connue des mails ⇒ rien n’est touché', async () => {
    const c = await rafraichirPourAdresses(['jamais-vue@x.fr']);
    expect(recalculerLesAdresses).not.toHaveBeenCalled();
    expect(examinerFilsPrecis).not.toHaveBeenCalled();
    expect(c.messagesPerimes).toBe(0);
  });

  /** ⚠️ UNE BORNE, pour qu'une modification de fiche ne puisse jamais bloquer l'écran plusieurs secondes. */
  it('⚠️ le nombre de conversations réexaminées est borné', async () => {
    const beaucoup = Array.from({ length: FILS_MAX_PAR_GESTE + 50 }, (_, i) => i + 1);
    messagesDeCesAdresses.mockResolvedValue({ messageIds: [1], filIds: beaucoup });
    const c = await rafraichirPourAdresses(['x@y.fr']);
    expect(c.filsReexamines).toBe(FILS_MAX_PAR_GESTE);
    expect(((examinerFilsPrecis.mock.calls[0] as unknown[])[0] as number[]).length)
      .toBe(FILS_MAX_PAR_GESTE);
  });

  it('⚠️ sans le schéma des adresses, rien n’est nommé ni recalculé', async () => {
    schema = false;
    await rafraichirPourAdresses(['x@y.fr']);
    expect(recalculerLesAdresses).not.toHaveBeenCalled();
    expect(examinerFilsPrecis).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 ③ à l’ouverture d’un mail : seulement si une fiche a bougé', () => {
  it('🔴🔴 rien de périmé ⇒ AUCUNE écriture (le cas de presque toutes les ouvertures)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '11' }, { id: '12' }] });
    const c = await rafraichirLesFils([5]);
    expect(messagesAReconnaitre).toHaveBeenCalledWith([11, 12]);
    expect(recalculerLesAdresses).not.toHaveBeenCalled();
    expect(examinerFilsPrecis).not.toHaveBeenCalled();
    expect(c.messagesPerimes).toBe(0);
  });

  it('🔴🔴 une fiche modifiée depuis le calcul ⇒ on recalcule, puis on réexamine', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '11' }, { id: '12' }, { fil_id: '5' }] });
    messagesAReconnaitre.mockResolvedValue([12]);
    const c = await rafraichirLesFils([5]);
    expect(recalculerLesAdresses).toHaveBeenCalledWith([12]);
    expect(c.messagesPerimes).toBe(1);
  });

  /** 🔴 TOUTE LA CONVERSATION, pas le seul mail ouvert : les propositions se fondent aussi sur les autres mails. */
  it('🔴 c’est toute la conversation qu’on examine, pas le mail seul', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: '11' }, { id: '12' }] });
    await rafraichirLesFils([5]);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('fil_id = ANY');
  });

  it('⚠️ aucune conversation ⇒ aucune requête', async () => {
    await rafraichirLesFils([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/**
 * ══ 🔴🔴 ③ bis LOT PROPOSITIONS-PAR-LE-CONTENU — UN NOM QUI CHANGE ════════════════════════════════════════════
 *
 * Arno : « Les propositions se recalculent quand une fiche change (même mécanisme que pour les adresses
 * e-mail). » Un NOM n'a pas de table : on le cherche là où il peut être, dans le texte des mails.
 */
describe('🔴🔴 ③ bis le nom d’une fiche a changé', () => {
  it('🔴 les conversations où le nom est écrit sont réexaminées', async () => {
    queryMock.mockResolvedValue({ rows: [{ fil_id: '5' }, { fil_id: '9' }] });
    const c = await rafraichirPourNoms(['CHAKROUN Zahra']);
    expect(examinerFilsPrecis).toHaveBeenCalled();
    expect((examinerFilsPrecis.mock.calls[0] as unknown[])[0]).toEqual([5, 9]);
    expect(c.filsReexamines).toBe(2);
    // ⚠️ ON CHERCHE DANS L'OBJET **ET** DANS LE CORPS : un nom se cite aussi bien dans l'un que dans l'autre.
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('m.objet');
    expect(sql).toContain('corps_texte');
    // …et jamais dans le spam ni la corbeille.
    expect(sql).toContain('spam_le IS NULL');
    expect(sql).toContain('corbeille_le IS NULL');
  });

  /** ⚠️ UN MOT TROP COURT RAMÈNERAIT LA MOITIÉ DE LA BOÎTE pour ne rien apprendre. */
  it('⚠️ les mots trop courts ne sont pas cherchés', async () => {
    await rafraichirPourNoms(['Le', 'de', 'A']);
    expect(queryMock).not.toHaveBeenCalled();
    expect(LONGUEUR_NOM_CHERCHABLE).toBe(4);
  });

  it('⚠️ un nom qu’aucun mail ne porte ne déclenche aucun réexamen', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const c = await rafraichirPourNoms(['INTROUVABLE']);
    expect(examinerFilsPrecis).not.toHaveBeenCalled();
    expect(c.filsReexamines).toBe(0);
  });
});

/**
 * ══ 🔴🔴 ④ LES DEUX BRANCHEMENTS, GARDÉS SUR LE TEXTE ══════════════════════════════════════════════════════════
 *
 * Le reste du fichier éprouve la MÉCANIQUE ; ces gardes-ci vérifient qu'elle est bien BRANCHÉE aux deux endroits
 * qu'Arno a nommés. Un module parfait que personne n'appelle ne corrige rien — et c'est précisément ce qui s'est
 * passé le 28/09 avec le moteur de rattachement, resté juste sur le disque et faux en mémoire.
 */
describe('🔴🔴 ④ c’est bien branché, aux deux endroits', () => {
  const lire = async (f: string): Promise<string> => {
    const { readFileSync } = await import('node:fs');
    return readFileSync(f, 'utf8');
  };

  it('🔴🔴 modifier, créer ou séparer une fiche déclenche le recalcul', async () => {
    const repo = await lire('app/lib/gestion/annuaireEditionRepo.ts');
    expect(repo).toContain('rafraichirPourAdresses');
    // Les TROIS chemins qui écrivent une coordonnée, et aucun n'est oublié.
    expect(repo.match(/await rafraichirPourAdresses\(/g) ?? []).toHaveLength(3);
  });

  /** 🔴 APRÈS LE COMMIT, JAMAIS DEDANS : à l'intérieur, le recalcul lirait l'annuaire d'AVANT. */
  it('🔴🔴 le recalcul est appelé APRÈS la transaction, et il ne peut pas la faire échouer', async () => {
    const repo = await lire('app/lib/gestion/annuaireEditionRepo.ts');
    for (const bloc of repo.split('await rafraichirPourAdresses(').slice(1)) {
      // chaque appel est dans un `try` dont le `catch` journalise
      expect(bloc).toContain('catch');
    }
    expect(repo).toContain('await withTransaction(');
  });

  /** 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — et un NOM corrigé déclenche le même recalcul qu'une adresse. */
  it('🔴🔴 modifier ou créer une fiche recalcule aussi pour le NOM', async () => {
    const repo = await lire('app/lib/gestion/annuaireEditionRepo.ts');
    expect(repo).toContain('rafraichirPourNoms');
    expect(repo.match(/await rafraichirPourNoms\(/g) ?? []).toHaveLength(2);
    // ⚠️ L'ANCIEN NOM EST GARDÉ AUTANT QUE LE NOUVEAU : sinon les propositions de l'ancien resteraient.
    expect(repo).toContain('nomsTouches.add');
  });

  it('🔴🔴 l’ouverture d’un mail passe par le filet', async () => {
    const route = await lire('app/(admin)/api/admin/gestion/classement/route.ts');
    expect(route).toContain('rafraichirAvantOuverture(message)');
  });

  /**
   * ══ 🔴🔴 AUCUNE VOIE NE LIT « LA PREMIÈRE ADRESSE » ═══════════════════════════════════════════════════════
   *
   * Arno demande de vérifier que TOUS les rapprochements adresse → personne lisent toutes les coordonnées d'une
   * fiche, e-mails comme téléphones. L'audit du 01/10/2026 a trouvé les quatre voies ci-dessous, et aucune ne
   * borne : elles comparent toutes `valeur` à l'ensemble des lignes vivantes. Ce garde empêche qu'une
   * optimisation future (« on ne garde que la principale ») ne rouvre le défaut sans qu'on s'en aperçoive.
   */
  it('🔴🔴 toutes les coordonnées d’une fiche comptent, e-mails comme téléphones', async () => {
    /** Les quatre voies de rapprochement, et le prédicat par lequel chacune compare une coordonnée. */
    const voies: [string, string][] = [
      // ① la reconnaissance des adresses d'un mail : elle charge TOUTES les lignes « email » vivantes
      ['app/lib/gestion/adressesRepo.ts', "WHERE c.sorte = 'email' AND c.absent_le IS NULL"],
      // ② le bloc des parties : l'adresse du mail comparée à toutes les lignes
      ['app/lib/gestion/annuaireRepo.ts', "WHERE sorte = 'email' AND absent_le IS NULL AND valeur = ANY($1::text[])"],
      // ③ la recherche d'un bien — ici, un TÉLÉPHONE autant qu'un e-mail
      ['app/lib/gestion/rechercheBienRepo.ts', 'SELECT sujet, sujet_id FROM gestion_annuaire_contact'],
      // ④ le tri des pièces jointes
      ['app/lib/gestion/triPiecesRepo.ts', "WHERE sorte = 'email' AND absent_le IS NULL"],
    ];
    for (const [f, predicat] of voies) {
      const sql = (await lire(f)).replace(/\s+/g, ' ');
      expect(sql, f).toContain(predicat);
      // 🔴 ET AUCUNE DE CES COMPARAISONS NE SE BORNE À UN RANG : ni « la première », ni « la principale ».
      const apres = sql.slice(sql.indexOf(predicat), sql.indexOf(predicat) + 400);
      expect(apres, f).not.toMatch(/\brang\s*=/i);
    }
    // ③ compare bien un téléphone ET un e-mail, sur la même lecture (trois paramètres, un par forme saisie).
    const recherche = (await lire('app/lib/gestion/rechercheBienRepo.ts')).replace(/\s+/g, ' ');
    expect(recherche).toContain('($2::text IS NOT NULL AND valeur = $2)');
    expect(recherche).toContain('($4::text IS NOT NULL AND valeur = $4)');
  });
});
