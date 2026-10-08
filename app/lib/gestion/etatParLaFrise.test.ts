import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BORNES_FERMANTES, BORNES_OUVRANTES, borneCompte, CERTITUDE_A_CONFIRMER, CERTITUDE_ECARTEE,
  etatAffiche, etatApresCarteSelonLaFrise, etatDeTravail, ETATS_DE_TRAVAIL,
  motCarteDeBorne, MOTIF_CLOTURE_PAR_LA_FRISE, questionAvantRetrait,
  rangDeLaBorne, RANG_OUVERTURE_DERIVEE, sensDeLaBorne,
  sqlBornesDeLEvenement, sqlClosLeParLaFrise, sqlDansUnePeriodeOuverte,
  sqlEvenementOuvertParLaFrise, sqlPeriodes, sqlPeriodesDeLEvenement,
} from './etatParLaFrise';
import { TYPES_BORNE } from './frise';
import {
  cartesDuReservoir, informationsDuReservoir, rangEtape, TYPES_AJOUTABLES, TYPES_INFORMATION,
  type TypeEtape,
} from './mongaEtape';

/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — L'ÉTAT D'UN ÉVÉNEMENT SE DÉDUIT DE SES CARTES DE BORNE ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (08/10/2026) : sur le bien 315, GES-2026-000001 s'affichait « clos · clos le 08/10/2026 » alors
 * qu'il n'y avait PLUS de carte Clôture sur sa frise. Supprimer la carte n'avait pas rouvert l'événement.
 *
 * SA RÈGLE, SOURCE UNIQUE DE VÉRITÉ :
 *   1. l'état se déduit des cartes de BORNE, dans l'ordre de leurs dates : dernière borne = Clôture ⇒ CLOS ;
 *   2. supprimer la carte Clôture ROUVRE, sans carte Réouverture, après confirmation ;
 *   3. poser une Réouverture rouvre aussi ;
 *   4. un événement clos ne propose QUE « Réouverture » dans la grille ;
 *   5. les PÉRIODES se calculent à partir des bornes, et un mail n'est étiqueté que DANS une période ouverte.
 *
 * ═══ CE QUE CE FICHIER TIENT, ET CE QU'IL NE PEUT PAS TENIR ═════════════════════════════════════════════════════
 *
 * 🔴 ICI : la CLASSIFICATION (quel type est une borne, dans quel sens, quand elle compte, dans quel ordre), les
 * phrases, et le CÂBLAGE — qui appelle la règle, et qui ne la recopie pas.
 *
 * 🔴 LE PLI LUI-MÊME (ouvrir, fermer, rouvrir) est écrit en SQL, et un pli ne se vérifie pas en lisant son texte :
 * il se JOUE. C'est l'objet d'`etatParLaFrise.itest.ts`, qui le passe à PostgreSQL sur des bornes LITTÉRALES —
 * sans créer la moindre ligne, et sur le MÊME pli que la production.
 *
 * 🔒 Aucun réseau, aucune base, aucun événement RÉEL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Blancs normalisés : on éprouve le SENS d'un SQL émis, jamais sa mise en forme (AGENTS.md). */
const plat = (t: string): string => t.replace(/\s+/g, ' ');

const MODULE = readFileSync('app/lib/gestion/etatParLaFrise.ts', 'utf8');
const REPO_ETAT = readFileSync('app/lib/gestion/evenementEtatRepo.ts', 'utf8');
const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const ROUTE_FRISE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const ROUTE_ETAPES = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');
const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA CLASSIFICATION — QUELLE CARTE EST UNE BORNE, ET DANS QUEL SENS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① les cartes de BORNE, et leur sens', () => {
  /**
   * 🔴🔴 LES TROIS BORNES SONT CELLES D'ARNO, et elles sont DÉRIVÉES de `TYPES_BORNE` — la même liste que les
   * cartes à date centrée du lot FRISE-COULEURS-DATES. Ce n'est pas une coïncidence : une borne est exactement
   * une carte dont la DATE est le fait.
   */
  it('🔴🔴 Ouverture et Réouverture ouvrent, Clôture ferme — et rien d’autre n’est une borne', () => {
    expect(sensDeLaBorne('ouverture')).toBe('ouvre');
    expect(sensDeLaBorne('reouverture')).toBe('ouvre');
    expect(sensDeLaBorne('cloture')).toBe('ferme');
    for (const t of TYPES_AJOUTABLES) {
      if ((TYPES_BORNE as readonly string[]).includes(t)) continue;
      expect(sensDeLaBorne(t), t).toBeNull();
    }
    for (const t of TYPES_INFORMATION) expect(sensDeLaBorne(t), t).toBeNull();
  });

  /** ⚠️ LES DEUX LISTES PARTITIONNENT `TYPES_BORNE` : aucune borne sans sens, aucun sens sans borne. */
  it('⚠️ les deux sens recouvrent exactement les trois bornes', () => {
    expect([...BORNES_OUVRANTES, ...BORNES_FERMANTES].sort()).toEqual([...TYPES_BORNE].sort());
    expect(BORNES_OUVRANTES.filter((t) => BORNES_FERMANTES.includes(t))).toEqual([]);
  });

  /**
   * ══ 🔴🔴 LA PARENTHÈSE D'ARNO : « ET “CLÔTURE MONGA” UNE FOIS VALIDÉE » ════════════════════════════════════
   *
   * FERMER est une CONSÉQUENCE — le bien perd son événement ouvert, les mails qui suivent sortent de la période.
   * Une clôture seulement LUE dans un mail Monga, pas encore confirmée, ne doit pas produire cela. Mesuré le
   * 08/10/2026 : **5 clôtures Monga** sont dans cet état.
   *
   * 🔴 OUVRIR, LUI, NE FAIT QUE DATER UN DÉBUT, et la frise montre TOUJOURS une carte d'ouverture. Refuser une
   * ouverture « à confirmer » laisserait l'événement sans borne basse — donc sans période, donc sans un seul
   * mail étiqueté. Mesuré : **37 ouvertures Monga** sont « à confirmer ».
   */
  it('🔴🔴 une Clôture « à confirmer » ne ferme pas ; une Ouverture « à confirmer » date quand même', () => {
    expect(borneCompte('cloture', CERTITUDE_A_CONFIRMER)).toBe(false);
    expect(borneCompte('cloture', 'fiable')).toBe(true);
    expect(borneCompte('cloture', 'confirmee')).toBe(true);
    expect(borneCompte('ouverture', CERTITUDE_A_CONFIRMER)).toBe(true);
    expect(borneCompte('reouverture', CERTITUDE_A_CONFIRMER)).toBe(true);
  });

  /** ⚠️ UNE CARTE ÉCARTÉE N'EST PAS SUR LA FRISE, dans aucun sens — l'état doit lire ce que la frise montre. */
  it('⚠️ une carte écartée ne compte dans aucun sens', () => {
    for (const t of TYPES_BORNE) expect(borneCompte(t, CERTITUDE_ECARTEE), t).toBe(false);
  });

  /** ⚠️ ET UN TYPE QUI N'EST PAS UNE BORNE NE COMPTE JAMAIS, quelle que soit sa certitude. */
  it('⚠️ un type ordinaire n’est jamais une borne', () => {
    for (const c of ['fiable', 'confirmee', CERTITUDE_A_CONFIRMER]) {
      expect(borneCompte('devis_recu', c), c).toBe(false);
    }
  });

  /**
   * 🔴 L'ORDRE À DATE ÉGALE EST CELUI DE LA FRISE, AU CARACTÈRE PRÈS : `rangEtape`, jamais une table recopiée.
   * Le cas n'est pas théorique — GES-2026-900001 porte le même jour une réouverture, une clôture et une
   * réouverture, et les deux lectures ne donnent pas les mêmes périodes.
   */
  it('🔴🔴 le rang vient de `rangEtape`, et la clôture passe avant la réouverture le même jour', () => {
    for (const t of TYPES_BORNE) expect(rangDeLaBorne(t), t).toBe(rangEtape(t));
    expect(rangDeLaBorne('cloture')).toBeLessThan(rangDeLaBorne('reouverture'));
    expect(rangDeLaBorne('ouverture')).toBeLessThan(rangDeLaBorne('cloture'));
  });

  /**
   * ⚠️ LA CARTE D'OUVERTURE **DÉRIVÉE** PASSE EN DERNIER À DATE ÉGALE, et c'est `construireFrise` qui le
   * décide : elle l'insère devant la première carte STRICTEMENT postérieure.
   */
  it('⚠️ l’ouverture dérivée a le rang le plus élevé', () => {
    for (const t of TYPES_BORNE) expect(RANG_OUVERTURE_DERIVEE).toBeGreaterThan(rangDeLaBorne(t));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE SQL ÉMIS — IL DIT LA MÊME CHOSE QUE LA CLASSIFICATION, ET IL EN VIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le SQL est ENGENDRÉ par la classification, jamais recopié', () => {
  const BORNES = plat(sqlBornesDeLEvenement('ev'));

  /** 🔴 LES TROIS TYPES, LE SENS ET LES RANGS VIENNENT DES CONSTANTES : rien n'est réécrit à la main. */
  it('🔴🔴 les types, le sens et les rangs du SQL sortent des constantes', () => {
    for (const t of TYPES_BORNE) expect(BORNES, t).toContain(`'${t}'`);
    for (const t of TYPES_BORNE) expect(BORNES, t).toContain(`WHEN '${t}' THEN ${rangEtape(t)}`);
    expect(BORNES).toContain(`THEN 'ferme' ELSE 'ouvre' END`);
  });

  /** 🔴 LES DEUX GARDES DE CERTITUDE SONT LÀ, ET SEULE LA CLÔTURE PORTE LA SECONDE. */
  it('🔴🔴 les écartées sortent, et seule la clôture exige d’être confirmée', () => {
    expect(BORNES).toContain(`svv_brn.certitude <> '${CERTITUDE_ECARTEE}'`);
    expect(BORNES).toContain(
      `AND (svv_brn.type NOT IN ('cloture') OR svv_brn.certitude <> '${CERTITUDE_A_CONFIRMER}')`);
  });

  /**
   * 🔴🔴 L'OUVERTURE DÉRIVÉE EST UNE BORNE À PART ENTIÈRE. Sans elle, un événement ordinaire — le cas le plus
   * courant, et celui d'Arno — n'aurait aucune période, donc plus un seul mail étiqueté.
   */
  it('🔴🔴 la carte d’ouverture dérivée est dans les bornes, quand aucune n’est enregistrée', () => {
    expect(BORNES).toContain("SELECT ev.ouvert_le AS quand, 'ouvre'::text AS sens");
    expect(BORNES).toContain("WHERE NOT EXISTS ( SELECT 1 FROM gestion_monga_etape svv_ouv");
    expect(BORNES).toContain("svv_ouv.type = 'ouverture'");
  });

  /** 🔴 LES DEUX RATTACHEMENTS D'UNE CARTE, comme dans `friseDeLEvenement` : `evenement_id` ET la référence. */
  it('🔴🔴 les cartes rattachées par RÉFÉRENCE Monga comptent aussi', () => {
    expect(BORNES).toContain('svv_brn.evenement_id = ev.id');
    expect(BORNES).toContain('FROM gestion_monga_lien svv_lien');
    expect(BORNES).toContain('svv_lien.retire_le IS NULL');
  });

  /** 🔴 ET LE STATUT « vif » : une carte retirée n'est plus sur la frise, donc plus une borne. */
  it('🔴 une carte retirée n’est plus une borne', () => {
    expect(BORNES).toContain("svv_brn.statut = 'vif'");
  });

  /**
   * ══ 🔴🔴 LES ALIAS INTERNES SONT IMPOSSIBLES À CONFONDRE, ET CE N'EST PAS UN DÉTAIL ═══════════════════════
   *
   * Ce SQL se glisse dans des requêtes qui nomment déjà `m`, `e`, `b`, `l`, `p`, `a`. Une déclaration interne
   * portant l'un de ces noms MASQUERAIT la table porteuse : la corrélation deviendrait une tautologie, sans la
   * moindre erreur de PostgreSQL. C'est le piège mesuré au lot FILTRE-COMME-ETIQUETTE, et il se rejouerait ici
   * à l'identique — avec un filtre qui ne filtre plus.
   */
  it('🔴🔴 aucun alias interne ne peut masquer celui d’une requête porteuse', () => {
    const tous = plat([
      sqlBornesDeLEvenement('ev'), sqlPeriodesDeLEvenement('ev'),
      sqlEvenementOuvertParLaFrise('ev'), sqlClosLeParLaFrise('ev'),
      sqlDansUnePeriodeOuverte('ev', 'msg.recu_le'),
    ].join(' '));
    /* Tous les alias déclarés par ce module commencent par `svv_`. */
    for (const mot of [...tous.matchAll(/\b(?:FROM|JOIN)\s+[a-z_]+\s+([a-z_][a-z0-9_]*)/g)]) {
      const alias = mot[1];
      if (alias === 'AS' || alias === 'ON' || alias === 'WHERE') continue;
      expect(alias.startsWith('svv_'), `alias « ${alias} » hors du préfixe svv_`).toBe(true);
    }
    /* Et aucune CTE ni sous-requête nommée n'échappe au préfixe. */
    for (const mot of [...tous.matchAll(/\)\s+([a-z][a-z0-9_]*)\s+(?:WHERE|ORDER|$)/g)]) {
      expect(mot[1].startsWith('svv_'), `sous-requête « ${mot[1]} » hors du préfixe svv_`).toBe(true);
    }
  });

  /**
   * 🔴🔴 LE PLI PREND SA SOURCE EN PARAMÈTRE, et c'est ce qui le rend éprouvable SANS RIEN ÉCRIRE : l'épreuve
   * d'intégration lui passe un `VALUES` littéral, la production lui passe les vraies bornes. Même pli.
   */
  it('🔴🔴 le pli est le MÊME, quelle que soit la source des bornes', () => {
    const avecValues = plat(sqlPeriodes("SELECT * FROM (VALUES (now(), 'ouvre', 0, 0)) v(quand, sens, rang, carte)"));
    const avecBornes = plat(sqlPeriodesDeLEvenement('ev'));
    /* Le corps du pli — cycles, du, au, HAVING — est identique des deux côtés. */
    const corps = "svv_cycles AS ( SELECT svv_b.quand, svv_b.sens,";
    expect(avecValues).toContain(corps);
    expect(avecBornes).toContain(corps);
    const fin = "HAVING min(quand) FILTER (WHERE sens = 'ouvre') IS NOT NULL";
    expect(avecValues).toContain(fin);
    expect(avecBornes).toContain(fin);
  });

  /**
   * 🔴 « OUVERT » SE DIT EN UNE LIGNE : il reste une période sans borne haute. C'est la règle d'Arno, point 1,
   * dite en périodes — les deux phrases sont la même, et celle-ci se corrèle dans un `WHERE`.
   */
  it('🔴🔴 « ouvert » = il reste une période sans borne haute', () => {
    expect(plat(sqlEvenementOuvertParLaFrise('ev'))).toContain('svv_p WHERE svv_p.au IS NULL)');
    expect(sqlEvenementOuvertParLaFrise('ev').startsWith('EXISTS (')).toBe(true);
  });

  /**
   * 🔴 ET « CLOS LE » EST NUL DÈS QUE L'ÉVÉNEMENT EST OUVERT, même après un cycle clos puis rouvert. Sans cette
   * garde, GES-2026-900001 aurait rendu « clos le 08/10/2026 » tout en étant ouvert.
   */
  it('🔴🔴 « clos le » se tait sur un événement ouvert', () => {
    expect(plat(sqlClosLeParLaFrise('ev'))).toContain('max(svv_p.au) FILTER (WHERE NOT EXISTS');
  });

  /** 🔴 LA BORNE D'UN MAIL : dans une période, bornes comprises des deux côtés (comme la fenêtre d'avant). */
  it('🔴🔴 un mail est dans la période, bornes comprises', () => {
    const d = plat(sqlDansUnePeriodeOuverte('ev', 'msg.recu_le'));
    expect(d).toContain('msg.recu_le >= svv_p.du');
    expect(d).toContain('svv_p.au IS NULL OR msg.recu_le <= svv_p.au');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA COLONNE `etat` — CE QU'ELLE VEUT ENCORE DIRE, ET CE QU'ELLE NE DIT PLUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ « traité » vient de la frise, « à traiter / en cours » de la colonne', () => {
  it('🔴🔴 un événement que la frise dit CLOS se lit « traité », quoi que dise la colonne', () => {
    expect(etatAffiche('en_cours', false)).toBe('traite');
    expect(etatAffiche('a_traiter', false)).toBe('traite');
    expect(etatAffiche('traite', false)).toBe('traite');
  });

  /**
   * 🔴🔴 ET L'INVERSE, QUI EST LE CAS D'ARNO : la colonne dit « traite », la frise dit ouvert. C'est la frise
   * qui gagne, et l'avancement repart de la valeur la plus prudente.
   */
  it('🔴🔴 un événement que la frise dit OUVERT n’est jamais « traité » (le cas GES-2026-000001)', () => {
    expect(etatAffiche('traite', true)).toBe('a_traiter');
    expect(etatAffiche('en_cours', true)).toBe('en_cours');
    expect(etatAffiche('a_traiter', true)).toBe('a_traiter');
  });

  /** ⚠️ TOUTE VALEUR INATTENDUE DE LA COLONNE SE LIT « à traiter » — le repli d'avant ce lot, inchangé. */
  it('⚠️ un état illisible retombe sur « à traiter », jamais sur un état inventé', () => {
    expect(etatAffiche('zzz', true)).toBe('a_traiter');
    expect(etatAffiche('', true)).toBe('a_traiter');
  });

  /** 🔴 LES DEUX ÉTATS DE TRAVAIL, ET EUX SEULS, RESTENT ÉCRITS À LA MAIN. */
  it('🔴 « à traiter » et « en cours » sont les deux états de travail', () => {
    expect([...ETATS_DE_TRAVAIL]).toEqual(['a_traiter', 'en_cours']);
    expect(etatDeTravail('a_traiter')).toBe(true);
    expect(etatDeTravail('en_cours')).toBe(true);
    expect(etatDeTravail('traite')).toBe(false);
  });

  /**
   * ══ 🔴🔴 L'AUTRE CHEMIN EST FERMÉ — RÈGLE D'ARNO, POINT B ════════════════════════════════════════════════
   *
   * « Aucun autre chemin ne doit pouvoir mettre l'état en contradiction avec la frise. » Le sélecteur à trois
   * boutons de la carte en plein écran écrivait `etat = 'traite'` sans qu'aucune carte ne soit posée : c'est
   * exactement ce qui a permis au constat d'Arno d'exister.
   *
   * ⚠️ LE BOUTON N'EST PAS RETIRÉ (garde-fou CLAUDE.md) : il répond par une phrase qui apprend la règle.
   */
  it('🔴🔴 `changerEtatEvenement` refuse « traité », et le refus dit par où passer', () => {
    expect(GESTES).toContain('if (!etatDeTravail(etat)) return { ok: false, motif: MOTIF_CLOTURE_PAR_LA_FRISE };');
    expect(MOTIF_CLOTURE_PAR_LA_FRISE).toContain('Clôture');
    expect(MOTIF_CLOTURE_PAR_LA_FRISE).toContain('frise');
    /* 🔴 ET LE REFUS PRÉCÈDE LA TRANSACTION : un refus qui aurait écrit serait le pire des deux. */
    expect(GESTES.indexOf('if (!etatDeTravail(etat))'))
      .toBeLessThan(GESTES.indexOf('return withTransaction(async (q) => {\n    const { rows } = await q<{ etat: string'));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES PHRASES — CE QU'ON DEMANDE, ET CE QU'ON RÉPOND
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ retirer une Clôture : la question d’Arno, mot pour mot', () => {
  /** 🔴🔴 « Supprimer cette clôture rouvrira l'événement. » (Arno, point 2) — au caractère près. */
  it('🔴🔴 la question est posée sur une Clôture qui ferme vraiment', () => {
    expect(questionAvantRetrait('cloture', false)).toBe('Supprimer cette clôture rouvrira l’événement.');
  });

  /**
   * 🔴🔴 ET SUR RIEN D'AUTRE. Une Clôture SUIVIE d'une Réouverture ne ferme rien : promettre une réouverture là
   * serait une phrase fausse — la plus dangereuse des confirmations, celle qu'on croit avoir lue.
   */
  it('🔴🔴 aucune question sur une Clôture qui ne ferme pas, ni sur les autres cartes', () => {
    expect(questionAvantRetrait('cloture', true)).toBeNull();
    for (const t of ['ouverture', 'reouverture', 'devis_recu', 'autre', 'note'] as TypeEtape[]) {
      expect(questionAvantRetrait(t, false), t).toBeNull();
      expect(questionAvantRetrait(t, true), t).toBeNull();
    }
  });

  /**
   * 🔴 LE COMPTE RENDU DIT CE QUI S'EST PASSÉ, et non ce qu'on a cliqué : une Clôture datée avant la dernière
   * Réouverture laisse le dossier ouvert, et la phrase doit le dire.
   */
  it('🔴🔴 le compte rendu d’une carte de borne distingue les quatre cas', () => {
    expect(motCarteDeBorne(true, false)).toBe('Événement clôturé.');
    expect(motCarteDeBorne(false, true)).toBe('Événement rouvert.');
    expect(motCarteDeBorne(true, true)).toContain('reste ouvert');
    expect(motCarteDeBorne(false, false)).toContain('reste clos');
  });

  /** ⚠️ ET LE SIGNAL ENVOYÉ À LA FICHE SUIT L'ÉTAT RELU, jamais le type de carte posé. */
  it('⚠️ le signal de relecture suit l’état relu', () => {
    expect(etatApresCarteSelonLaFrise(true)).toBe('en_cours');
    expect(etatApresCarteSelonLaFrise(false)).toBe('traite');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA GRILLE D'UN ÉVÉNEMENT CLOS — RÈGLE D'ARNO, POINT 4
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ un événement clos ne propose QUE « Réouverture »', () => {
  it('🔴🔴 les deux faces de la grille se réduisent à cette seule carte', () => {
    expect(cartesDuReservoir(false)).toEqual(['reouverture']);
    expect(informationsDuReservoir(false)).toEqual([]);
  });

  /** ⚠️ ET ROUVRIR REND LA GRILLE ENTIÈRE : on n'a pas retiré une possibilité, on a imposé un ordre. */
  it('⚠️ rouvrir rend la grille entière, à l’instant même', () => {
    expect(cartesDuReservoir(true).length).toBeGreaterThan(10);
    expect(cartesDuReservoir(true)).not.toContain('reouverture');
    expect(cartesDuReservoir(true)).toContain('cloture');
    expect(informationsDuReservoir(true)).toEqual([...TYPES_INFORMATION]);
  });

  /**
   * 🔴🔴 LA GARDE EST AUSSI DANS LA ROUTE, et pas seulement dans la grille : deux onglets suffisent à la
   * contourner — l'un clôture, l'autre pose encore un devis sur la grille qu'il affichait avant.
   */
  it('🔴🔴 la route refuse toute autre carte sur un événement clos', () => {
    expect(ROUTE_FRISE).toContain("if (!ouvertAvant && type !== 'reouverture') {");
    expect(ROUTE_FRISE).toContain('Cet événement est clos : posez d’abord une carte « Réouverture »');
  });

  /** ⚠️ ET LA BASCULE N'EST PAS RETIRÉE DE L'ÉCRAN : son second bouton devient inactif, raison écrite à côté. */
  it('⚠️ la bascule « Simple information » reste rendue, inactive et expliquée', () => {
    expect(FRISE).toContain('aria-pressed={forme === \'information\'} disabled={!evenementOuvert}');
    expect(FRISE).toContain('Cet événement est clos : seule une « Réouverture » peut être posée.');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LE CÂBLAGE — QUI LIT LA RÈGLE, ET QUI NE LA RECOPIE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑥ une seule règle, lue par tous les écrans d’Arno', () => {
  /**
   * 🔴🔴 LES SIX CONSÉQUENCES QU'ARNO NOMME — bande orange, étiquettes, compteurs, filtre, cartes de l'écran
   * partagé et du plein écran — lisent toutes la MÊME fonction. C'est ce qui rend l'accord vrai par
   * construction, et non par surveillance.
   */
  it('🔴🔴 les sept dépôts concernés appellent la règle, aucun ne la réécrit', () => {
    for (const f of [
      'app/lib/gestion/annuaireRepo.ts', 'app/lib/gestion/historiqueBienRepo.ts',
      'app/lib/gestion/historiqueRepo.ts', 'app/lib/gestion/fileRepo.ts',
      'app/lib/gestion/carteRepo.ts', 'app/lib/gestion/recherche.ts', 'app/lib/gestion/mongaRepo.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain("from './etatParLaFrise'");
      expect(src, f).toContain('sqlEvenementOuvertParLaFrise');
      /* 🔴 ET AUCUN NE GARDE L'ANCIENNE COMPARAISON : une seule laissée en place serait une divergence. */
      expect(src, f).not.toContain("e.etat <> 'traite'");
      expect(src, f).not.toContain("r.etat !== 'traite'");
    }
  });

  /** 🔴 LE DÉPÔT DE L'ÉTAT NE SAIT PAS ÉCRIRE, et c'est la garantie du choix de conception du lot. */
  it('🔴🔴 le dépôt de l’état n’émet que de la lecture', () => {
    expect(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/.test(REPO_ETAT)).toBe(false);
  });

  /**
   * 🔴🔴 LE MODULE DE LA RÈGLE EST PUR : il n'ouvre aucune base, aucun réseau. Il ÉMET du SQL, il ne l'exécute
   * pas — c'est ce qui permet de l'importer depuis un composant client (la question avant retrait) sans faire
   * remonter `pg`, donc `dns`, et sans faire tomber la construction de toute l'application.
   */
  it('🔴🔴 le module de la règle est pur, et peut donc servir à l’écran', () => {
    expect(MODULE).not.toContain("from '../db/client'");
    expect(MODULE).not.toContain('server-only');
    expect(FRISE).toContain("import { questionAvantRetrait } from '../../../../lib/gestion/etatParLaFrise';");
  });

  /**
   * 🔴🔴 ET LES DEUX ROUTES QUI TOUCHENT AUX CARTES NE FONT QUE RELIRE L'ÉTAT : poser une carte, en retirer une,
   * et dire si l'état a bougé. Aucune n'écrit `gestion_evenement`.
   */
  it('🔴🔴 ni la pose ni le retrait d’une carte n’écrivent l’état', () => {
    for (const [nom, src] of [['POST frise', ROUTE_FRISE], ['DELETE étape', ROUTE_ETAPES]] as const) {
      expect(src, nom).not.toContain('changerEtatEvenement(');
      expect(src, nom).not.toContain('UPDATE gestion_evenement');
    }
    expect(ROUTE_ETAPES).toContain('await evenementOuvertParLaFrise(evenementId)');
  });
});
