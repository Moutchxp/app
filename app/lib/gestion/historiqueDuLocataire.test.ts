import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cibleDepuisTexte, texteCible } from './historique';
import { cibleLocataire, cibleLot, cibleProprietaire, SORTES_RATTACHEMENT_PERMISES } from './rattachement';
import { libelleCible } from './rattachementRepo';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — L'HISTORIQUE PAR LOCATAIRE ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « HISTORIQUE PAR LOCATAIRE (nouveau) : sur le modèle de l'historique propriétaire,
 * même présentation, accessible depuis la fiche annuaire du locataire, avec le même fragment unique. Contenu : les
 * mails rattachés aux biens qu'il occupe, UNIQUEMENT pendant sa période d'occupation (entrée → sortie, ou
 * aujourd'hui), plus les mails dont il est lui-même l'expéditeur ou le destinataire. Jamais le courrier de ses
 * prédécesseurs ou successeurs. Un locataire de plusieurs biens (ex. TATA CONSULTANCY) voit tous ses biens, chacun
 * sur sa période. Les historiques bien et propriétaire existants ne bougent pas. »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER TIENT, ET CE QU'IL NE PEUT PAS TENIR ═════════════════════════════════════════════════
 *
 * Il tient l'ADRESSAGE (une cible de locataire s'écrit et se relit), les MOTS, et la FORME du code qui porte les
 * deux axes — notamment que la règle du lien de bien vient du fragment unique et non d'une quatrième copie.
 *
 * ⚠️ IL NE PEUT PAS TENIR LE CONTENU : il n'y a pas de base dans une épreuve. Le contenu est éprouvé par
 * `app/scripts/verifier-historique-locataire.ts`, qui appelle les VRAIES fonctions de l'écran sur TOUTE la base et
 * parcourt chaque frise page par page. Mesuré le 04/10/2026 : 510 locataires, 40 046 lignes, 33 489 mails
 * distincts — **0** ligne hors période, **0** ligne hors sujet.
 *
 * 🔴 ET CETTE ÉPREUVE A DÉJÀ SERVI, DANS L'AUTRE SENS : sa première version dénonçait 119 lignes chez BENABDALLAH
 * Hicham. Le défaut était dans l'ÉPREUVE — elle ne gardait qu'UNE tranche par lot, alors qu'un locataire peut
 * REVENIR dans le même logement (3 cas en base). C'est pour ce genre d'erreur que l'oracle ne doit jamais
 * partager le code qu'il contrôle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
const ECRAN = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueCible.tsx', 'utf8');
const FICHE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

describe('🔴🔴 ① une cible de locataire s’écrit, et se relit', () => {
  /**
   * 🔴🔴 LA RÉGRESSION QUE CE TEST FERME, ET QUI ÉTAIT RÉELLE. `texteCible` enchaînait deux conditions puis
   * retombait sur « carte » : TOUTE sorte non nommée devenait une carte. Un locataire se serait écrit
   * `carte-254`, et l'adresse aurait désigné la carte nº 0 — un écran « cette cible n'existe pas ».
   */
  it('🔴🔴 `locataire-254`, et pas `carte-254`', () => {
    expect(texteCible(cibleLocataire('254'))).toBe('locataire-254');
    expect(cibleDepuisTexte('locataire-254')).toEqual({ sorte: 'locataire', cle: '254', id: null });
  });

  /** 🔴 LES TROIS CIBLES D'AVANT NE BOUGENT PAS D'UN CARACTÈRE : c'est la moitié de la demande d'Arno. */
  it('🔴 lot, propriétaire et carte s’écrivent exactement comme avant', () => {
    expect(texteCible(cibleLot('478'))).toBe('lot-478');
    expect(texteCible(cibleProprietaire('335'))).toBe('proprio-335');
    expect(texteCible({ sorte: 'evenement', cle: null, id: 12 })).toBe('carte-12');
    expect(cibleDepuisTexte('lot-478')).toEqual({ sorte: 'lot', cle: '478', id: null });
    expect(cibleDepuisTexte('proprio-335')).toEqual({ sorte: 'proprietaire', cle: '335', id: null });
    expect(cibleDepuisTexte('carte-12')).toEqual({ sorte: 'evenement', cle: null, id: 12 });
  });

  /**
   * ⚠️ UNE CLÉ WIPPIMMO PEUT CONTENIR UN TIRET (les jeux d'épreuve en portent : « J-1 ») : la lecture coupe au
   * PREMIER tiret et garde tout le reste. La règle existait ; on vérifie qu'elle tient aussi pour le préfixe le
   * plus long du jeu.
   */
  it('⚠️ une clé à tiret survit au préfixe le plus long', () => {
    expect(cibleDepuisTexte('locataire-J-1')).toEqual({ sorte: 'locataire', cle: 'J-1', id: null });
    expect(texteCible(cibleLocataire('J-1'))).toBe('locataire-J-1');
  });

  it('🔴 le libellé de repli nomme un locataire, pas une carte', () => {
    const vide = { lots: new Map<string, string>(), proprietaires: new Map<string, string>() };
    expect(libelleCible(cibleLocataire('254'), vide)).toBe('locataire 254');
  });
});

describe('🔴🔴 ② un locataire reste HORS des cibles de rattachement', () => {
  /**
   * 🔴🔴 CE POINT N'ENTAME PAS LA RÈGLE CENTRALE DU MODULE. « La cible est toujours un bien » : on ne POSE rien
   * sur une personne — elle déménage, le logement non. Ce qu'Arno a demandé est un point de LECTURE, qui
   * RASSEMBLE ; la liste blanche d'écriture ne change pas d'un cran.
   *
   * ⚠️ SI CE TEST CASSE, CE N'EST PAS LUI QU'IL FAUT CORRIGER : quelqu'un vient d'autoriser le rattachement d'un
   * mail à une personne, et c'est la confusion qui a coûté une nuit le 28/09/2026.
   */
  it('🔴🔴 `SORTES_RATTACHEMENT_PERMISES` ne l’accueille pas', () => {
    expect([...SORTES_RATTACHEMENT_PERMISES]).toEqual(['lot', 'evenement']);
    expect(SORTES_RATTACHEMENT_PERMISES).not.toContain('locataire');
  });
});

describe('🔴🔴 ③ les deux axes, et le fragment unique', () => {
  /**
   * 🔴🔴 L'AXE « BIEN » DU LOCATAIRE LIT LE MÊME FRAGMENT QUE LES QUATRE AUTRES ÉCRANS — condition d'Arno, et ce
   * qui rend ce nouvel axe digne de confiance : il ne redéfinit pas « un mail rattaché à un bien », il le
   * réutilise et n'ajoute QUE la tranche de temps.
   */
  it('🔴🔴 l’axe « occupation » passe par `sqlLiensDuBien`', () => {
    expect(REPO).toContain("WHERE ${sqlLiensDuBien('ro')}");
  });

  /**
   * 🔴🔴 LA TRANCHE EST JOINTE PAR LOT. `unnest` déplie les triplets (clé, entrée, sortie) : TATA CONSULTANCY
   * voit ses trois logements, chacun sur SA période. Une seule paire de bornes pour tout le monde aurait laissé
   * entrer le courrier d'un logement à une date où il ne l'occupait pas encore.
   */
  it('🔴🔴 une tranche par lot, pas une pour tous', () => {
    expect(REPO).toContain('JOIN unnest($4::text[], $5::date[], $6::date[]) AS per(cle, d1, d2)');
    expect(REPO).toContain('ON per.cle = ro.cible_cle');
  });

  /**
   * 🔴 LA BORNE HAUTE EST INCLUSE, et c'est une décision : un mail du jour de la sortie est encore le sien —
   * c'est le jour où il rend les clés, et souvent celui de l'état des lieux.
   */
  it('🔴 les deux bornes, et la haute incluse', () => {
    expect(REPO).toContain("AND (per.d1 IS NULL OR (mo.recu_le AT TIME ZONE 'UTC')::date >= per.d1)");
    expect(REPO).toContain("AND (per.d2 IS NULL OR (mo.recu_le AT TIME ZONE 'UTC')::date <= per.d2)");
  });

  /**
   * 🔴 L'AXE « CORRESPONDANCE » LIT `gestion_message_adresse`, DONC LES DEUX SENS. Un mail qu'on lui a ÉCRIT le
   * concerne autant qu'un mail qu'il a écrit — c'est le mot d'Arno (« l'expéditeur ou le destinataire »), et
   * c'est la même table que le filtre « interlocuteurs », donc le même périmètre, déjà éprouvé.
   */
  it('🔴 son propre courrier vient des adresses du message, dans les deux sens', () => {
    expect(REPO).toContain('FROM gestion_message_adresse ia');
    expect(REPO).toContain('WHERE ia.adresse = ANY($7::text[])');
    expect(REPO).toContain("'locataire'::text AS cible_sorte, $8::text AS cible_cle");
  });

  /**
   * 🔴🔴 `lots` RESTE VIDE POUR UN LOCATAIRE, et c'est ce qui garantit qu'aucun mail hors période ne peut entrer.
   * Le remplir lui donnerait TOUT le courrier du logement — prédécesseurs et successeurs compris —, exactement
   * ce qu'Arno interdit.
   */
  it('🔴🔴 la branche « locataire » ne remplit pas `lots`', () => {
    const debut = REPO.indexOf("if (cible.sorte === 'locataire') {");
    const fin = REPO.indexOf('// ── UN PROPRIÉTAIRE', debut);
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    const branche = REPO.slice(debut, fin);
    expect(branche).toContain('occupations,');
    expect(branche).toContain('adresses: ads.map((a) => a.valeur),');
    /* ⚠️ AUCUNE AFFECTATION DE `lots` : ni `lots:`, ni un repli qui le remplirait « au cas où ». */
    expect(branche).not.toMatch(/\blots\s*:/);
  });
});

describe('🔴🔴 ④ les paramètres liés, là où un décalage ne se voit pas', () => {
  /**
   * ══ 🔴🔴 POURQUOI CE GROUPE EXISTE ═══════════════════════════════════════════════════════════════════════════
   *
   * Un placeholder décalé lie une valeur AU MAUVAIS ENDROIT sans la moindre erreur de PostgreSQL : le filtre
   * d'interlocuteurs est devenu un `LIMIT` le 26/09/2026, et la base a refusé — mais ce jour-là elle a eu la
   * bonté de refuser. Rien ne garantit qu'elle refuse la prochaine fois : un `date` lié à la place d'un `text[]`
   * passerait, et l'historique serait simplement faux.
   *
   * 🔴 LE DÉCALAGE VIENT DONC DU MÊME ENDROIT QUE LES VALEURS. Trois paramètres de base pour toute cible, huit
   * pour un locataire — jamais un « 3 » écrit en dur dans `conditions`.
   */
  it('🔴🔴 `conditions` ne connaît plus de décalage en dur', () => {
    /**
     * ⚠️ LA SIGNATURE A PRIS UN TROISIÈME ARGUMENT AU LOT FILTRE-COMME-ETIQUETTE (07/10/2026) : `deplacements`,
     * la sonde de la migration 234, parce que le filtre « Événement ouvert » appelle désormais la requête de
     * l'étiquette, qui ne nomme `gestion_affectation.message_id` que si la colonne existe. Le DÉCALAGE, lui,
     * n'a pas bougé d'un caractère — et c'est tout ce que ce groupe surveille. Le filtre ne lie, du reste,
     * aucune valeur : `filtreCommeEtiquette.test.ts` le tient (« pas un seul placeholder de plus »).
     */
    expect(REPO).toContain('f: FiltresHistorique, apres: number, deplacements: boolean,');
    expect(REPO).toContain('const ajouter = (v: unknown): string => `$${params.push(v) + apres}`;');
    expect(REPO).not.toContain('params.push(v) + 3');
  });

  /** 🔴 TROIS, OU HUIT. Jamais autre chose — voir l'encadré d'`avecLocataire` : Postgres refuse une sur-alimentation. */
  it('🔴 trois paramètres de base, ou huit pour un locataire', () => {
    expect(REPO).toContain('function decalage(c: CibleEtendue): number { return estLocataire(c) ? 8 : 3; }');
    expect(REPO).toContain('if (!estLocataire(c)) return base;');
  });

  /**
   * 🔴🔴 TOUTES LES QUESTIONS DE L'ÉCRAN LISENT LA MÊME LISTE. La frise, le compteur d'en-tête, les
   * interlocuteurs — et, depuis le lot HISTORIQUE-BIEN-11 point 5, les pièces de toute la sélection — partagent
   * `baseParams` et `decalage` : des listes recopiées finiraient par ne plus être dans le même ordre, et c'est
   * toujours celle qu'on regarde le moins qui garderait le faux.
   *
   * ⚠️ LE COMPTE EXACT A ÉTÉ ABANDONNÉ, ET C'EST LA LEÇON DE CE LOT. Cette épreuve exigeait « exactement 3 »
   * appels ; ajouter un QUATRIÈME lecteur qui passe par `baseParams` — donc qui fait exactement ce que la règle
   * demande — la faisait échouer. Un compte figé transforme la bonne conduite en régression. Ce qui compte est
   * qu'aucun lecteur ne RECOPIE la liste, et c'est ce que la dernière assertion tient.
   */
  it('🔴🔴 une seule liste de paramètres, pour toutes les questions', () => {
    const parBaseParams = (REPO.match(/const base = baseParams\(c\);/g) ?? []).length;
    expect(parBaseParams).toBeGreaterThanOrEqual(4);
    expect((REPO.match(/decalage\(c\)/g) ?? []).length).toBeGreaterThanOrEqual(parBaseParams);
    /* 🔴 ET AUCUNE LISTE RECOPIÉE : c'est la faute que `baseParams` a été écrit pour fermer. */
    expect(REPO).not.toContain('[lots, props, evs, ...cond.params');
    expect(REPO).not.toContain('[c.lots, c.proprietaires, c.evenements, ...cond.params');
  });

  /**
   * 🔴 ET LE PLAFOND DE PAGE SE CALCULE SUR LA LISTE, pas sur un 4 en dur. C'est le même défaut que le décalage,
   * à l'autre bout de la requête : avec huit paramètres de base, un `$4` figé aurait visé le premier filtre.
   */
  it('🔴 le `LIMIT` se numérote sur la liste, pas sur un 4 en dur', () => {
    expect(REPO).toContain('const pTaille = base.length + 1 + cond.params.length;');
    expect(REPO).toContain('const pLimite = base.length + 1 + cond.params.length;');
    expect(REPO).not.toContain('= 4 + cond.params.length');
  });
});

describe('🔴 ⑤ l’écran dit ce qu’il recouvre, et la fiche y mène', () => {
  /**
   * 🔴🔴 UN HISTORIQUE BORNÉ QU'ON NE DIT PAS BORNÉ SE LIT COMME UN HISTORIQUE INCOMPLET. Celui d'un locataire
   * est forcément plus court que celui du logement : s'il ne disait pas pourquoi, le premier réflexe serait de
   * croire qu'il manque des mails — et c'est l'outil qu'on soupçonnerait.
   */
  it('🔴🔴 les tranches sont écrites, avec leurs dates', () => {
    expect(ECRAN).toContain("{cible.sorte === 'locataire' && d.occupations.length > 0 && (");
    expect(ECRAN).toContain('PENDANT son occupation');
    expect(ECRAN).toContain("{o.jusqua === null ? ', encore en place' : ` au ${dateFr(o.jusqua)}`}");
  });

  /**
   * 🔴 DEUX BOUTONS QUI NE DISENT PAS LA MÊME CHOSE. Celui d'avant ouvre TOUT le courrier du logement —
   * prédécesseurs compris ; le nouveau n'ouvre que SA tranche. Deux libellés identiques auraient été un piège :
   * on cliquerait au hasard et on lirait le courrier d'un autre.
   */
  it('🔴 la fiche du locataire porte les deux entrées, et elles se distinguent', () => {
    expect(FICHE).toContain("cible={{ sorte: 'locataire', cle: f.cle, id: null }}");
    expect(FICHE).toContain('mot="Son historique à lui, période par période →"');
    /* ⚠️ ET LE LIBELLÉ D'AVANT RESTE LE DÉFAUT, au caractère près : tous les appelants antérieurs sont intacts. */
    expect(FICHE).toContain("{mot ?? 'Tout l’historique des échanges →'}");
  });

  /**
   * ⚠️ LA CLÉ WIPPIMMO, PAS L'IDENTIFIANT INTERNE. La fiche s'adresse par `?fiche=locataire-457`, l'historique
   * par `?cible=locataire-254` : les confondre ouvrirait l'historique de quelqu'un d'autre. C'est la même
   * asymétrie que `lotId` / `cle` sur un bien.
   */
  it('⚠️ la fiche porte la clé WIPPIMMO, et sait pourquoi', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('absent_le::text, wippimmo_id AS cle');
    expect(repo).toContain('cle: p.cle,');
  });
});
