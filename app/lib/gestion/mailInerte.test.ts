import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mailInerte, sqlPasInerte, MOT_MAIL_INERTE } from './mailInerte';
import { interneDuMail } from './interneDuMail';

/**
 * ══ 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — UN MAIL JETÉ SANS STATUT EST INERTE ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (06/10/2026) : « Si le mail n'a NI bien rattaché NI marque Interne au moment de sa mise à la
 * corbeille, il devient INERTE : il sort de “À classer” et de “À rattacher” […], ses propositions de rattachement
 * ne sont plus montrées, la passe automatique ne le rattache plus et ne lui propose plus rien, et il n'apparaît
 * dans aucun historique de bien. Ne supprime rien : les propositions restent en base, simplement ignorées tant
 * que le mail est à la corbeille. »
 *
 * ═══ 🔴 CE QUE LA MESURE A APPRIS AVANT D'ÉCRIRE UNE LIGNE ══════════════════════════════════════════════════════
 *
 * Trois des cinq conséquences demandées étaient DÉJÀ vraies, pour tout mail à la corbeille :
 *   · la PASSE l'écarte (`clauseHorsSpam` ajoute `corbeille_le IS NULL` au chargement du paquet) ;
 *   · « À classer » l'écarte (`sqlCompteBoite` applique la même exclusion, aux deux étages) ;
 *   · l'historique d'un bien ne peut pas le montrer : il sélectionne par lien CONFIRMÉ, et un mail inerte n'en a
 *     aucun — par définition.
 *
 * Ce qui manquait était « À rattacher » : la file et ses compteurs ne lisent pas les messages, ils lisent
 * `gestion_rattachement_examen` — la table des examens DÉJÀ faits — qui ne savait rien de la corbeille. Mesuré en
 * base le 06/10/2026 : **43 mails à la corbeille sans statut**, dont **31 portent des propositions** ; et dans la
 * file, **29 en `a_trier` et 13 en `sans_candidat`**. Après correction : 16 641 → 16 612 et 7 541 → 7 528.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴🔴 les huit cas possibles, et trois seulement sont inertes… non : UN seul', () => {
  /**
   * 🔴 LA TABLE DE VÉRITÉ ENTIÈRE, et c'est la bonne façon de l'éprouver : trois booléens font huit cas, et il
   * n'y en a qu'UN d'inerte. Les éprouver un par un rend la règle lisible — et rend impossible de la relâcher par
   * mégarde, ce qui serait le défaut grave (un mail classé qui disparaîtrait de l'historique de son bien).
   */
  const cas = [
    { aLaCorbeille: false, aUnBienRattache: false, estInterne: false, inerte: false },
    { aLaCorbeille: false, aUnBienRattache: false, estInterne: true, inerte: false },
    { aLaCorbeille: false, aUnBienRattache: true, estInterne: false, inerte: false },
    { aLaCorbeille: false, aUnBienRattache: true, estInterne: true, inerte: false },
    { aLaCorbeille: true, aUnBienRattache: false, estInterne: false, inerte: true },
    { aLaCorbeille: true, aUnBienRattache: false, estInterne: true, inerte: false },
    { aLaCorbeille: true, aUnBienRattache: true, estInterne: false, inerte: false },
    { aLaCorbeille: true, aUnBienRattache: true, estInterne: true, inerte: false },
  ];

  for (const c of cas) {
    const nom = `corbeille=${c.aLaCorbeille} bien=${c.aUnBienRattache} interne=${c.estInterne}`;
    it(`${c.inerte ? '🔴🔴 INERTE' : '⚠️ actif'} — ${nom}`, () => {
      expect(mailInerte(c)).toBe(c.inerte);
    });
  }

  it('🔴🔴 UN SEUL des huit cas est inerte : jeté, sans bien, sans marque', () => {
    expect(cas.filter((c) => mailInerte(c))).toHaveLength(1);
  });

  /**
   * 🔴🔴 CE QUI REND LA RÉINTÉGRATION EXACTE SANS RIEN RECONSTRUIRE : l'inertie est un état DÉRIVÉ, et retirer le
   * mail de la corbeille suffit à le réveiller. Rien à défaire, rien à relire.
   */
  it('🔴🔴 RÉINTÉGRER RÉVEILLE, et le rejeter rendort — sans limite', () => {
    const sansStatut = { aUnBienRattache: false, estInterne: false };
    expect(mailInerte({ ...sansStatut, aLaCorbeille: true })).toBe(true);
    expect(mailInerte({ ...sansStatut, aLaCorbeille: false })).toBe(false);
    expect(mailInerte({ ...sansStatut, aLaCorbeille: true })).toBe(true);
    expect(mailInerte({ ...sansStatut, aLaCorbeille: false })).toBe(false);
  });

  /** 🔴 ET RATTACHER UN MAIL DÉJÀ JETÉ LE RÉVEILLE AUSSI : il a un statut, donc il n'est plus inerte. */
  it('🔴 rattacher un mail jeté le réveille', () => {
    expect(mailInerte({ aLaCorbeille: true, aUnBienRattache: false, estInterne: false })).toBe(true);
    expect(mailInerte({ aLaCorbeille: true, aUnBienRattache: true, estInterne: false })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA MÊME RÈGLE EN SQL — ÉCRITE UNE FOIS, ET ELLE DIT LA MÊME CHOSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const TOUT = { corbeille: true, rattachements: true, interne: true, interneParMail: true };

describe('🔴🔴 la clause SQL', () => {
  it('🔴 elle rend la forme NÉGATIVE, prête à coller derrière un `AND`', () => {
    const c = sqlPasInerte('m', TOUT);
    expect(c.startsWith('AND NOT (')).toBe(true);
    expect(c).toContain('m.corbeille_le IS NOT NULL');
  });

  it('🔴🔴 les TROIS conditions y sont, et sur le bon alias', () => {
    const c = sqlPasInerte('zz', TOUT);
    expect(c).toContain('zz.corbeille_le IS NOT NULL');
    expect(c).toContain('r_in.message_id = zz.id');
    expect(c).toContain("r_in.statut = 'confirme'");
    expect(c).toContain("r_in.cible_sorte IN ('lot', 'proprietaire', 'locataire')");
    expect(c).toContain('mi_in.message_id = zz.id');
    expect(c).toContain('fi_in.fil_id = zz.fil_id');
  });

  /**
   * ⚠️ LES ALIAS SONT SUFFIXÉS `_in`, ET CE N'EST PAS UN GOÛT : cette clause s'insère dans des requêtes qui
   * emploient déjà `r0`, `i0`, `h0`, `m2`, `e`… et une collision d'alias est SILENCIEUSE — elle ne lève pas, elle
   * répond faux. C'est le genre de défaut qu'on ne voit qu'en comptant à la main.
   */
  it('⚠️ aucun alias ne peut entrer en collision avec ceux des requêtes qui l’accueillent', () => {
    const c = sqlPasInerte('m', TOUT);
    for (const alias of ['r0', 'i0', 'h0', 'm2', 'f0', 'e ', 'ml ']) {
      expect(c, alias).not.toContain(` ${alias}`);
    }
  });

  /**
   * 🔴🔴 LA MARQUE DU MAIL L'EMPORTE SUR CELLE DE L'ÉCHANGE, et une marque RETIRÉE sur ce mail compte comme une
   * décision — c'est la règle de `interneDuMail`, traduite et non réécrite. L'ORDRE des `WHEN` est cette règle.
   */
  it('🔴🔴 l’ordre des trois `WHEN` EST la règle de `interneDuMail`', () => {
    const c = sqlPasInerte('m', TOUT);
    const vivante = c.indexOf('mi_in.retire_le IS NULL) THEN true');
    const connue = c.indexOf('WHERE mi_in.message_id = m.id) THEN false');
    const fil = c.indexOf('fi_in.retire_le IS NULL) THEN true');
    expect(vivante).toBeGreaterThan(-1);
    expect(vivante).toBeLessThan(connue);
    expect(connue).toBeLessThan(fil);
    /* 🔴 ET LA VERSION PURE DIT LA MÊME CHOSE, sur les trois cas qui comptent. */
    expect(interneDuMail({ marqueDuMailVivante: true, marqueDuMailConnue: true, marqueDeLEchange: false }))
      .toBe(true);
    expect(interneDuMail({ marqueDuMailVivante: false, marqueDuMailConnue: true, marqueDeLEchange: true }))
      .toBe(false);
    expect(interneDuMail({ marqueDuMailVivante: false, marqueDuMailConnue: false, marqueDeLEchange: true }))
      .toBe(true);
  });

  /**
   * ⚠️ CHAQUE MIGRATION ABSENTE RETIRE SA CONDITION, ET NE FAIT PAS ÉCHOUER LA LECTURE. Nommer une table absente
   * ferait tomber TOUTE la file, pas seulement ce filtre — c'est la leçon du lot 4a, et elle vaut ici aussi.
   */
  it('⚠️ SANS LA CORBEILLE (275), RIEN N’EST INERTE — et la clause est vide', () => {
    expect(sqlPasInerte('m', { ...TOUT, corbeille: false })).toBe('');
  });

  it('⚠️ sans les rattachements (257), la condition du bien n’est pas nommée', () => {
    const c = sqlPasInerte('m', { ...TOUT, rattachements: false });
    expect(c).not.toContain('gestion_rattachement');
    expect(c).toContain('m.corbeille_le IS NOT NULL');
  });

  it('⚠️ sans aucune table « interne », la condition de la marque n’est pas nommée', () => {
    const c = sqlPasInerte('m', { ...TOUT, interne: false, interneParMail: false });
    expect(c).not.toContain('gestion_fil_interne');
    expect(c).not.toContain('gestion_message_interne');
    expect(c).not.toContain('CASE');
  });

  it('⚠️ sans la marque PAR MAIL seule, celle de l’échange répond seule', () => {
    const c = sqlPasInerte('m', { ...TOUT, interneParMail: false });
    expect(c).not.toContain('gestion_message_interne');
    expect(c).toContain('gestion_fil_interne');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 OÙ LA RÈGLE S'APPLIQUE — ET OÙ ELLE ÉTAIT DÉJÀ VRAIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 les cinq conséquences demandées par Arno', () => {
  const RAT = readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8');
  const BOITE = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
  const ROUTE = readFileSync('app/(admin)/api/admin/gestion/corbeille/route.ts', 'utf8');

  /**
   * 🔴🔴 ① ET ② — « À rattacher » : LA FILE ET SES COMPTEURS. C'est ce que ce lot ajoute, et c'est le seul
   * endroit qui manquait. Ils lisent `gestion_rattachement_examen`, pas les messages : la corbeille leur était
   * invisible.
   */
  it('🔴🔴 la file « À rattacher » et ses quatre totaux appliquent la clause', () => {
    /* La liste elle-même. */
    expect(RAT).toContain("WHERE e.issue = ANY($1::text[]) ${pasInerte}");
    /* Les quatre totaux de la file : trois issues + les non examinés. */
    const i = RAT.indexOf('AS non_examines');
    const totaux = RAT.slice(RAT.indexOf('const pasInerte = await clausePasInerte'), i);
    expect((totaux.match(/\$\{pasInerte\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    /* Et les chiffres de la colonne de gauche. */
    expect((RAT.match(/clausePasInerte\('m'\)/g) ?? []).length).toBe(2);
  });

  /**
   * ⚠️ LES AUTRES NOMBRES DE `chiffresRattachement` NE BOUGENT PAS, et c'est voulu : ils décrivent l'ÉTAT DE LA
   * BASE (combien de liens vivants, combien d'examens faits), pas un travail à faire. Les filtrer aurait fait
   * mentir un rapport sur ce que la base contient.
   */
  it('⚠️ seuls `aTrier` et `sansCandidat` sont filtrés dans les chiffres', () => {
    const i = RAT.indexOf('AS messages,');
    const bloc = RAT.slice(i, RAT.indexOf('AS proprios', i));
    expect(bloc).toContain('AS messages');
    /* Les deux seuls à porter la clause, dans tout le bloc. */
    expect((bloc.match(/\$\{pasInerte\}/g) ?? []).length).toBe(2);
    /* 🔴 ET CE SONT BIEN CES DEUX-LÀ : la clause suit `a_trier` et `sans_candidat`, et aucune autre ligne. */
    for (const avec of ["e.issue = 'a_trier' ${pasInerte}", "e.issue = 'sans_candidat' ${pasInerte}"]) {
      expect(bloc, avec).toContain(avec);
    }
  });

  /**
   * 🔴 ③ LA PASSE AUTOMATIQUE L'ÉCARTAIT DÉJÀ, et il faut le dire plutôt que d'ajouter un second filtre : le
   * chargement du paquet pose `corbeille_le IS NULL`. Un mail jeté n'est donc ni réexaminé ni proposé — quel que
   * soit son statut. Ce garde fige ce fait, pour qu'on ne le défasse pas en croyant simplifier.
   */
  it('🔴 la passe automatique n’examine aucun mail à la corbeille', () => {
    expect(RAT).toContain('async function clauseHorsSpam(alias: string)');
    expect(RAT).toContain('corbeille ? ` AND ${alias}.corbeille_le IS NULL` : \'\'');
    /* Les deux chargements de paquet l'appliquent. */
    expect((RAT.match(/await clauseHorsSpam\('m'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  /** 🔴 ④ « À classer » L'ÉCARTAIT DÉJÀ AUSSI, aux deux étages du regroupement. */
  it('🔴 « À classer » n’a jamais compté un mail à la corbeille', () => {
    expect(BOITE).toContain("const horsCorbeille = corbeille ? 'AND m.corbeille_le IS NULL' : ''");
    expect(BOITE).toContain("const horsCorbeilleM2 = corbeille ? 'AND m2.corbeille_le IS NULL' : ''");
    /* Et le compteur de la colonne emprunte LE MÊME constructeur que la liste. */
    expect(BOITE).toContain("sqlCompteBoite(false, { sorte: 'a_classer_statut', evenementId: null }, corbeille");
  });

  /**
   * 🔴 ⑤ L'HISTORIQUE D'UN BIEN NE PEUT PAS LE MONTRER, et ce n'est pas un filtre : c'est une conséquence de la
   * définition. Il sélectionne par lien CONFIRMÉ (`sqlLiensDuBien`), et un mail inerte n'en a aucun — sans quoi
   * il ne serait pas inerte. Le garde lit la définition, là où elle est écrite.
   */
  it('🔴 l’historique d’un bien sélectionne par lien CONFIRMÉ, donc jamais un mail inerte', () => {
    const ratt = readFileSync('app/lib/gestion/rattachement.ts', 'utf8');
    expect(ratt).toContain("`${alias}.statut = 'confirme'`");
  });

  /**
   * 🔴🔴 ⑥ AUCUN BLOCAGE AVANT DE JETER — « aucune obligation, aucun blocage, aucun message demandant un
   * statut » (Arno). La route prend des identifiants et agit ; elle n'a jamais regardé le statut d'un mail, et ce
   * lot ne lui apprend pas à le faire. Ce garde l'interdit explicitement.
   */
  it('🔴🔴 la corbeille ne demande JAMAIS de statut avant d’agir', () => {
    const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const interdit of ['gestion_rattachement', 'gestion_fil_interne', 'statut_requis', 'sansStatut']) {
      expect(code, interdit).not.toContain(interdit);
    }
  });
});

/** ⚠️ LA PHRASE N'EST PAS UN MESSAGE DE BLOCAGE : elle explique, là où un mail inerte est quand même visible. */
describe('⚠️ ce qu’on dit, et où', () => {
  it('⚠️ la phrase explique et renvoie au geste qui réveille', () => {
    expect(MOT_MAIL_INERTE).toContain('sans statut');
    expect(MOT_MAIL_INERTE).toContain('réintégrer');
    expect(MOT_MAIL_INERTE).toContain('À classer');
  });
});
