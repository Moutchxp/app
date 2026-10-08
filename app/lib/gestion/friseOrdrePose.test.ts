import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  carteDeplacable, cartesHorsChronologie, construireFrise, parOrdreDePose, rangerEnLigne,
  TYPES_BORNE, type CaseFrise, type EtapeAAfficher,
} from './frise';
import {
  glisserAbandonne, glisserSArme, MAINTIEN_MS, MOUVEMENT_PX,
  placesPermises, placeVisee, rangeeApresGlisser, sequenceReordonnee,
  type CarteGlissable,
} from './glisserCarte';
import { rangEtape, TYPES_AJOUTABLES, type TypeEtape } from './mongaEtape';
/* 🔴 LOT FRISE-POIGNEE-DE-SAISIE — le seuil de l'AUTRE geste, celui qui gagnait la course. L'épreuve le lit
   là où il vit : une valeur recopiée ici cesserait de dire quoi que ce soit le jour où il changerait. */
import { SEUIL_GLISSER } from './defilementFrise';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — L'ORDRE EST CELUI DE LA POSE, ET IL SE DÉPLACE À LA SOURIS ═══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLES D'ARNO (08/10/2026) :
 *   A1. « Une carte ajoutée se place TOUJOURS au bout à droite de la frise (juste avant le carré “+”). »
 *   A3. « La date saisie à la main est PUREMENT INFORMATIVE : elle s'affiche dans la carte mais n'a AUCUNE
 *        influence sur la place des cartes entre elles. »
 *   A4. « Les cartes existantes reçoivent une position qui reproduit EXACTEMENT l'ordre affiché aujourd'hui. »
 *   B5. « Aucune date saisissable à la main pour [Ouverture, Clôture, Réouverture] : la date inscrite dans la
 *        carte est celle du jour de leur pose, fixée automatiquement. »
 *   B6. « Le TITRE et la DATE de ces cartes sont tous deux CENTRÉS dans le carré. »
 *   C8. « Une carte posée peut être saisie par clic maintenu et glissée à une autre place […] le glisser ne
 *        démarre qu'après un vrai maintien + mouvement. »
 *   C9. « Ouverture, Clôture, Réouverture et Clôture Monga NE se déplacent PAS ; aucune carte ne peut être
 *        glissée avant l'Ouverture. »
 *  C10. « La carte qu'on a déplacée et qui n'est plus à sa place chronologique voit sa ligne “créée le …”
 *        passer de VERT à ORANGE […] Les autres cartes ne changent pas de couleur. »
 *
 * 🔒 Aucun réseau, aucune base, aucun événement RÉEL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

let n = 0;
const etape = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: (n += 1), reference: null, type: 'prise_rdv', survenuLe: '2026-09-01T00:00:00', heureConnue: false,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: null, auteur: null,
  source: 'manuelle', certitude: 'fiable', messageId: null, aEuUnMail: false, filId: null,
  creeParLibelle: 'Arnaud', creeLe: '2026-09-01T10:00:00', titre: null, pieceNom: null, rangDevis: null,
  rangPose: null, ...p,
});

const MIGRATION = readFileSync('db/migrations/321_gestion_etape_rang_pose.sql', 'utf8');
const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const ROUTE_FRISE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const ROUTE_ETAPES = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'ORDRE EST CELUI DE LA POSE — ET LA DATE N'Y FAIT PLUS RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① l’ordre de la frise est l’ordre de pose', () => {
  /**
   * 🔴🔴 LA RÈGLE A3, ÉPROUVÉE SUR LE CAS QUI LA MOTIVE : trois cartes posées dans cet ordre, avec des dates
   * saisies VOLONTAIREMENT dans le désordre. Avant ce lot, elles se rangeaient par date et la dernière posée se
   * retrouvait au milieu. Elles restent maintenant dans l'ordre où on les a posées.
   */
  it('🔴🔴 trois cartes aux dates en désordre restent dans l’ordre de POSE', () => {
    const { majeures } = construireFrise([
      etape({ id: 1, type: 'prise_rdv', survenuLe: '2026-12-01T00:00:00', rangPose: 1 }),
      etape({ id: 2, type: 'devis_recu', survenuLe: '2026-01-15T00:00:00', rangPose: 2 }),
      etape({ id: 3, type: 'intervention', survenuLe: '2026-06-30T00:00:00', rangPose: 3 }),
    ]);
    expect(majeures.map((c) => c.etape?.id)).toEqual([1, 2, 3]);
  });

  /** 🔴 A1 — la carte posée en dernier est la DERNIÈRE, quelle que soit sa date. */
  it('🔴🔴 la carte posée en dernier est au bout à droite, même datée du passé', () => {
    const { majeures } = construireFrise([
      etape({ id: 1, survenuLe: '2026-06-01T00:00:00', rangPose: 1 }),
      etape({ id: 2, type: 'devis_recu', survenuLe: '2020-01-01T00:00:00', rangPose: 2 }),
    ]);
    expect(majeures[majeures.length - 1].etape?.id).toBe(2);
  });

  /**
   * ══ 🔴🔴 LE REPLI, ET C'EST LA GARANTIE DU POINT A4 ═══════════════════════════════════════════════════════
   *
   * « Rien ne doit bouger à l'écran après la migration. » Tant qu'aucune carte n'a de rang (migration 321 non
   * appliquée), le comparateur retombe EXACTEMENT sur l'ancienne clé : date, puis rang de type, puis
   * identifiant. Les soixante-neuf épreuves de `frise.test.ts`, écrites avant ce lot, le vérifient d'ailleurs
   * à chaque exécution — elles n'ont pas changé d'une ligne.
   */
  it('🔴🔴 sans rang de pose, l’ordre est EXACTEMENT celui d’avant ce lot', () => {
    const a = etape({ id: 9, type: 'intervention', survenuLe: '2026-10-01T00:00:00' });
    const b = etape({ id: 1, type: 'rdv_intervention', survenuLe: '2026-10-01T00:00:00' });
    /* À date égale : le rang de type tranche, et `rdv_intervention` (6) précède `intervention` (7). */
    expect([a, b].sort(parOrdreDePose).map((x) => x.id)).toEqual([1, 9]);
    expect(rangEtape('rdv_intervention')).toBeLessThan(rangEtape('intervention'));
  });

  /** ⚠️ ET UNE CARTE SANS RANG PASSE APRÈS CELLES QUI EN ONT UN : sa place est à la fin, pas au début. */
  it('⚠️ une carte sans rang se range après celles qui en ont un', () => {
    const avec = etape({ id: 1, survenuLe: '2026-12-01T00:00:00', rangPose: 5 });
    const sans = etape({ id: 2, survenuLe: '2020-01-01T00:00:00' });
    expect([sans, avec].sort(parOrdreDePose).map((x) => x.id)).toEqual([1, 2]);
  });

  /**
   * 🔴🔴 LES POINTS SE TISSENT PAR LA POSE, EUX AUSSI. Un point posé entre deux carrés reste entre eux, même si
   * sa date le mettrait ailleurs — carrés et points sont posés dans la même suite, et la migration les numérote
   * ensemble.
   */
  it('🔴🔴 un point se tisse à sa place de POSE, pas à sa date', () => {
    const { majeures, reperes } = construireFrise([
      etape({ id: 1, type: 'prise_rdv', survenuLe: '2026-01-01T00:00:00', rangPose: 1 }),
      etape({ id: 2, type: 'note', survenuLe: '2026-12-31T00:00:00', rangPose: 2 }),
      etape({ id: 3, type: 'intervention', survenuLe: '2026-02-01T00:00:00', rangPose: 3 }),
    ]);
    const ligne = rangerEnLigne(majeures, reperes, '2026-10-06');
    const sortes = ligne.filter((x) => x.sorte === 'carre' || x.sorte === 'points')
      .map((x) => (x.sorte === 'points' ? `point:${x.messages?.[0].id}` : `carre:${x.case?.etape?.id}`));
    expect(sortes).toEqual(['carre:1', 'point:2', 'carre:3']);
  });

  /** 🔴 C9 — l'ouverture dérivée est TOUJOURS la première : rien ne peut être glissé avant elle. */
  it('🔴🔴 l’ouverture dérivée ouvre toujours la marche', () => {
    const { majeures } = construireFrise(
      [etape({ id: 1, survenuLe: '2020-01-01T00:00:00', rangPose: 1 })], '2026-09-01T12:00:00');
    expect(majeures[0].sorte).toBe('ouverture');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA MIGRATION 321 — ELLE REPRODUIT L'ORDRE AFFICHÉ, ET NE PEUT PAS DÉRIVER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② la migration 321 n’ajoute qu’une colonne, et la remplit dans l’ordre de l’écran', () => {
  /**
   * 🔴🔴 LA SEULE RECOPIE DU LOT EST SURVEILLÉE ICI. Le `CASE` de la migration recopie `RANG_ETAPE` — il le
   * faut, une migration SQL ne peut pas appeler du TypeScript. Cette épreuve compare les deux à chaque
   * exécution de `npm test` : si l'un bouge sans l'autre, elle rougit.
   */
  it('🔴🔴 le CASE de la migration est RANG_ETAPE, type par type', () => {
    for (const t of [...TYPES_AJOUTABLES, 'rappel_devis', 'commentaire', 'note'] as TypeEtape[]) {
      expect(MIGRATION, t).toContain(`WHEN '${t}' THEN ${rangEtape(t)}`);
    }
  });

  /**
   * 🔴 AJOUT SEULEMENT (Arno) : aucune colonne retirée, aucune renommée, aucune contrainte touchée.
   *
   * ⚠️ ON INTERDIT LE CODE, PAS LA MENTION : l'encadré d'en-tête DIT comment revenir en arrière
   * (« ALTER TABLE … DROP COLUMN rang_pose »), et il doit pouvoir le dire — une migration qui ne dit pas
   * comment se défaire est une migration qu'on n'ose pas appliquer. On retire donc les commentaires avant de
   * regarder, comme `frisesGeometrie.test.ts` le fait déjà pour les feuilles de style.
   */
  it('🔴🔴 elle n’enlève ni ne renomme rien', () => {
    const sql = MIGRATION.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rang_pose numeric');
    expect(sql).not.toMatch(/\bDROP\s+(COLUMN|TABLE|CONSTRAINT)\b/);
    expect(sql).not.toMatch(/\bRENAME\b/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/);
    /* ⚠️ ET AUCUNE CONTRAINTE N'EST REJOUÉE : la colonne est nullable, sans valeur par défaut imposée. */
    expect(sql).not.toMatch(/\bALTER\s+COLUMN\b/);
  });

  /**
   * 🔴 ET ELLE NE REMPLIT QUE LES CASES VIDES : rejouée, elle ne réécrit aucun rang déjà posé — ni ceux de la
   * migration, ni ceux qu'un glisser a enregistrés depuis.
   */
  it('🔴🔴 rejouée, elle ne touche pas aux rangs déjà posés', () => {
    expect(MIGRATION).toContain('WHERE e.id = o.id AND e.rang_pose IS NULL');
  });

  /** ⚠️ ET L'ORDRE DE REMPLISSAGE EST CELUI DE L'ÉCRAN : date, rang de type, identifiant. */
  it('⚠️ elle numérote par date, rang de type, puis identifiant', () => {
    const plat = MIGRATION.replace(/\s+/g, ' ');
    expect(plat).toContain('ORDER BY survenu_le, CASE type');
    expect(plat).toContain('ELSE 99 END, id )');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LES BORNES — DATE IMPOSÉE, TITRE CENTRÉ, IMMOBILES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ Ouverture, Clôture, Réouverture : date du jour, centrées, immobiles', () => {
  /** 🔴 C9 — elles ne se déplacent pas, et la liste vient de `TYPES_BORNE`, jamais recopiée. */
  it('🔴🔴 aucune borne n’est déplaçable, toutes les autres cartes le sont', () => {
    const carte = (t: TypeEtape): CaseFrise => ({
      cle: `e1`, type: t, mot: '', etape: etape({ type: t }), sorte: 'reelle', survenuLe: '2026-01-01',
    });
    for (const t of TYPES_BORNE) expect(carteDeplacable(carte(t)), t).toBe(false);
    for (const t of ['prise_rdv', 'devis_recu', 'intervention', 'autre', 'note'] as TypeEtape[]) {
      expect(carteDeplacable(carte(t)), t).toBe(true);
    }
  });

  /** ⚠️ L'OUVERTURE DÉRIVÉE NON PLUS : elle n'est pas une ligne de la table, il n'y a aucun rang à lui écrire. */
  it('⚠️ l’ouverture dérivée ne se déplace pas davantage', () => {
    expect(carteDeplacable({
      cle: 'ouverture-evenement', type: 'ouverture', mot: 'Ouverture', etape: null,
      sorte: 'ouverture', survenuLe: '2026-01-01',
    })).toBe(false);
  });

  /**
   * 🔴🔴 B5 — LE SERVEUR IMPOSE LA DATE DU JOUR, et ne se contente pas de cacher le champ. Un appel qui
   * oublierait le formulaire pourrait sinon antidater une clôture — et l'état de l'événement se lit sur l'ordre
   * des bornes depuis le lot ETAT-PAR-LA-FRISE.
   */
  it('🔴🔴 la route impose le jour de pose à une carte de borne', () => {
    expect(ROUTE_FRISE).toContain('const survenuLe = dateAuCentre(type) ? jourDePose : String(corps.survenuLe ?? \'\');');
    expect(ROUTE_FRISE).toContain("timeZone: 'Europe/Paris'");
  });

  /** 🔴 ET LE CRAYON NE LA CHANGE PAS — la date enregistrée est relue et réécrite telle quelle (point 7). */
  it('🔴🔴 le crayon n’est pas une seconde porte vers la date d’une borne', () => {
    expect(ROUTE_ETAPES).toContain('const dateImposee = dateAuCentre(type) ? await dateDeLEtape(etapeId) : null;');
    expect(ROUTE_ETAPES).toContain('survenuLe: dateImposee ?? survenuLe,');
  });

  /** 🔴 B5 À L'ÉCRAN : le champ ne s'applique pas, et une phrase le DIT — un champ qui disparaît sans mot se lit
      comme une panne. C'est le seul élément que ce lot retire, et l'accord d'Arno porte sur lui, nommément. */
  it('🔴🔴 le formulaire remplace le champ date par la phrase qui l’explique', () => {
    expect(FRISE).toContain('{dateAuCentre(type) ? (');
    expect(FRISE).toContain('Date fixée automatiquement au jour de la pose');
    expect(FRISE).toContain('La date de cette carte n’est pas modifiable');
  });

  /**
   * 🔴 B6 — titre ET date centrés. Le titre d'une Clôture était calé à gauche sous une date centrée.
   *
   * ══ 🔴🔴 CE QUE CE CAS EXIGEAIT, ET POURQUOI LE VERDICT A CHANGÉ (lot FRISE-HORODATAGE-SECONDE-ET-PICTOS) ══
   *
   * IL EXIGEAIT `.fav-titre--centree{text-align:center;padding-right:24px}` et, juste après, la PRÉSENCE de
   * `.fav-menu{position:absolute;right:4px` — avec ce commentaire : « LA MARGE À DROITE EST NÉCESSAIRE : le
   * menu “…” est posé en absolu dans ce coin. » C'était exact : sans la marge, un titre centré passait sous le
   * menu, et les deux se superposaient.
   *
   * 🔴 LE DÉCOR A CHANGÉ, PAS LA RÈGLE. Au point 7, Arno a fait DESCENDRE le menu « … » dans une rangée de
   * pictos en bas du carré (son accord porte nommément sur ce déplacement). Le coin haut droit est donc libre,
   * la marge n'a plus d'objet, et `.fav-menu` n'est plus posée par le balisage — exiger sa règle de feuille
   * reviendrait à exiger du code mort. CE QU'ARNO DEMANDAIT RESTE VÉRIFIÉ, et plus largement qu'avant : le
   * centrage est devenu le cas GÉNÉRAL (point 9) et vit sur le conteneur de texte, d'où chaque ligne l'hérite.
   */
  it('🔴🔴 le titre d’une borne est centré comme sa date', () => {
    expect(FRISE).toContain("`fav-titre${dateAuCentre(e.type) ? ' fav-titre--centree' : ''}`");
    /* 🔴 LE CENTRAGE VIENT DU CONTENEUR, UNE FOIS POUR TOUTES LES LIGNES (point 9). */
    expect(FRISE).toContain('text-align:center;background:none;border:0;cursor:pointer');
    /* ⚠️ ET LE MODIFICATEUR DE BORNE GARDE CE QUI LUI EST PROPRE : le gras. */
    expect(FRISE).toContain('.fav-titre--centree{font-weight:700}');
    /* ⚠️ LE MENU « … » N'EST PLUS DANS LE COIN : il est dans la rangée du bas, et son action est intacte. */
    expect(FRISE).not.toContain('className="fav-menu"');
    expect(FRISE).toContain('aria-label={`Détail de l’étape ${c.mot}`}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE GLISSER — SEUIL, PLACES PERMISES, NOUVEL ORDRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const carte = (id: number, centre: number, deplacable = true): CarteGlissable => ({ id, deplacable, centre });

describe('🔴🔴 ④ le glisser : un vrai maintien, et un vrai mouvement', () => {
  /**
   * ══ 🔴🔴 LOT FRISE-POIGNEE-DE-SAISIE (08/10/2026) — LE VERDICT S'INVERSE, ET C'EST LA CORRECTION ═════════
   *
   * Cette épreuve exigeait `glisserDemarre(220 ms, 6 px) === true` : maintien ET mouvement AU MÊME INSTANT.
   * C'est précisément ce qui ne prenait pas chez Arno — voir l'encadré de `glisserCarte`. Ce qui produit les
   * `pointermove`, c'est le MOUVEMENT : quand les 220 ms sont écoulées, la main a déjà dépassé les 4 px du
   * DÉFILEMENT de la piste, qui a pris la capture du pointeur depuis longtemps (mesuré : t+5 ms).
   *
   * 🔴 LE GESTE S'ARME DÉSORMAIS SUR L'IMMOBILITÉ : appuyer et ne pas bouger. Et il est ABANDONNÉ dès que la
   * main part avant — c'est alors un défilement, et la frise le prend. Les deux gestes sont exclusifs.
   */
  it('🔴🔴 le maintien s’arme sur l’IMMOBILITÉ, jamais sur un mouvement simultané', () => {
    /* Appuyé et immobile assez longtemps : c'est un clic maintenu. */
    expect(glisserSArme(MAINTIEN_MS, 0, 0)).toBe(true);
    expect(glisserSArme(MAINTIEN_MS, MOUVEMENT_PX - 1, MOUVEMENT_PX - 1)).toBe(true);
    /* Pas encore assez long : rien. */
    expect(glisserSArme(MAINTIEN_MS - 1, 0, 0)).toBe(false);
    /* Assez long MAIS la main a déjà filé : ce n'est pas un maintien, c'est un défilement. */
    expect(glisserSArme(900, MOUVEMENT_PX, 0)).toBe(false);
  });

  /**
   * 🔴🔴 ET L'ABANDON EST CE QUI LAISSE SA PLACE AU DÉFILEMENT. Sans lui, le geste de carte resterait en
   * embuscade et s'armerait au bout de 220 ms EN PLEIN défilement — la frise sauterait sous la main.
   */
  it('🔴🔴 bouger avant la fin du maintien rend le geste à la frise', () => {
    expect(glisserAbandonne(50, MOUVEMENT_PX, 0)).toBe(true);
    expect(glisserAbandonne(50, 0, MOUVEMENT_PX)).toBe(true);
    /* Immobile : on n'abandonne pas, on attend. */
    expect(glisserAbandonne(50, MOUVEMENT_PX - 1, 0)).toBe(false);
    /* Après l'armement, l'abandon n'a plus cours. */
    expect(glisserAbandonne(MAINTIEN_MS, 999, 0)).toBe(false);
  });

  /**
   * ⚠️ LES DEUX PRÉDICATS SONT EXCLUSIFS, ET C'EST CE QUI REND LE GESTE PRÉVISIBLE : aucun couple (durée,
   * distance) ne peut à la fois armer et abandonner. Éprouvé sur une grille, pas sur trois exemples choisis.
   */
  it('🔴🔴 s’armer et abandonner ne sont jamais vrais ensemble', () => {
    for (const ms of [0, 50, 219, 220, 500]) {
      for (const d of [0, 3, 5, 6, 7, 50]) {
        expect(glisserSArme(ms, d, 0) && glisserAbandonne(ms, d, 0), `${ms}ms ${d}px`).toBe(false);
      }
    }
  });

  /**
   * 🔴🔴 ET LE SEUIL DE LA CARTE RESTE AU-DESSUS DE CELUI DE LA FRISE (6 px contre 4) : à égalité, un geste
   * hésitant aurait pu armer les deux. C'est la frise qui doit gagner un mouvement franc, et la carte une
   * main posée.
   */
  it('🔴🔴 le seuil de la carte est plus exigeant que celui du défilement', () => {
    expect(MOUVEMENT_PX).toBeGreaterThan(SEUIL_GLISSER);
  });

  /** ⚠️ LE SEUIL EST AU-DESSUS D'UN CLIC HUMAIN ORDINAIRE (70 à 150 ms), et en dessous du « coincé ». */
  it('⚠️ le seuil de maintien tient entre un clic et une attente', () => {
    expect(MAINTIEN_MS).toBeGreaterThanOrEqual(200);
    expect(MAINTIEN_MS).toBeLessThanOrEqual(300);
    expect(MOUVEMENT_PX).toBeGreaterThanOrEqual(4);
  });

  /** 🔴 LA PLACE VISÉE SE DÉCIDE AU CENTRE DES CARTES : on bascule à la moitié, pas à l'effleurement. */
  it('🔴 la carte bascule quand on dépasse le centre de sa voisine', () => {
    const autres = [carte(1, 100), carte(2, 300), carte(3, 500)];
    expect(placeVisee(autres, 50)).toBe(0);
    expect(placeVisee(autres, 299)).toBe(1);
    expect(placeVisee(autres, 301)).toBe(2);
    expect(placeVisee(autres, 900)).toBe(3);
  });

  /**
   * 🔴🔴 C9 — LES PLACES PERMISES DÉCOULENT DES BORNES, et les deux interdits d'Arno n'en font qu'un : si les
   * bornes ne bougent pas, aucune carte ne peut les traverser — donc aucune ne passe devant l'Ouverture.
   */
  it('🔴🔴 on ne peut pas glisser avant l’Ouverture ni après la Clôture', () => {
    /* Ouverture (fixe), deux cartes, Clôture (fixe). */
    const autres = [carte(1, 100, false), carte(2, 300), carte(3, 500), carte(4, 700, false)];
    expect(placesPermises(autres)).toEqual({ min: 1, max: 3 });
  });

  it('⚠️ sans aucune borne, toutes les places sont permises', () => {
    expect(placesPermises([carte(1, 100), carte(2, 300)])).toEqual({ min: 0, max: 2 });
  });

  it('⚠️ une rangée entièrement fixe n’offre aucune place, sans jamais rendre un intervalle inversé', () => {
    const p = placesPermises([carte(1, 100, false), carte(2, 300, false)]);
    expect(p.min).toBeGreaterThanOrEqual(p.max);
  });

  /** 🔴 LE NOUVEL ORDRE EST COMPLET ET IDEMPOTENT — c'est ce que la route attend. */
  it('🔴🔴 glisser la dernière carte au milieu rend la rangée entière, dans l’ordre', () => {
    const rangee = [carte(1, 100, false), carte(2, 300), carte(3, 500), carte(4, 700)];
    expect(rangeeApresGlisser(rangee, 4, 290)).toEqual([1, 4, 2, 3]);
  });

  /** ⚠️ `null` QUAND RIEN NE CHANGE : un glisser qui repose la carte où elle était n'écrit pas en base. */
  it('⚠️ reposer la carte à sa place n’écrit rien', () => {
    const rangee = [carte(1, 100, false), carte(2, 300), carte(3, 500)];
    expect(rangeeApresGlisser(rangee, 2, 290)).toBeNull();
  });

  /** 🔴 UNE BORNE NE SE DÉPLACE PAS, même si l'appelant le demande : la garde est ici ET dans la route. */
  it('🔴🔴 une borne saisie ne produit aucun ordre', () => {
    const rangee = [carte(1, 100, false), carte(2, 300), carte(3, 500)];
    expect(rangeeApresGlisser(rangee, 1, 900)).toBeNull();
  });

  /**
   * ══ 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 08/10/2026 — LES POINTS MANQUAIENT À L'ORDRE ENVOYÉ ═══════════════════
   *
   * La rangée se lit dans le DOM, qui ne contient que les CARRÉS. Les POINTS (messages informatifs) en étaient
   * absents : l'ordre envoyé était incomplet, et le dépôt le refusait en bloc — à juste titre. Résultat, sur
   * toute frise portant ne serait-ce qu'un point, AUCUN déplacement n'aboutissait, et rien ne le disait.
   * Mesuré sur un événement d'essai portant une « Facture » en point.
   *
   * 🔴 LA RÈGLE : les carrés se réordonnent entre eux, chaque point garde sa place ABSOLUE. C'est la seule qui
   * ne demande pas de deviner à quel carré un point serait « attaché ».
   */
  it('🔴🔴 un point garde sa place quand un carré bouge', () => {
    /* Suite : carte 1, carte 2, POINT 9, carte 3. On déplace la 3 en tête des cartes. */
    expect(sequenceReordonnee([1, 2, 9, 3], [1, 2, 3], [3, 1, 2])).toEqual([3, 1, 9, 2]);
  });

  it('🔴🔴 la suite rendue est une PERMUTATION de celle reçue : rien n’est perdu, rien n’est inventé', () => {
    const suite = [5, 9, 1, 8, 2, 3];
    const cartes = [5, 1, 2, 3];
    const apres = sequenceReordonnee(suite, cartes, [3, 5, 1, 2]);
    expect([...apres].sort((a, b) => a - b)).toEqual([...suite].sort((a, b) => a - b));
    /* ⚠️ ET LES POINTS N'ONT PAS BOUGÉ D'INDICE : 9 en 1re place, 8 en 3e, comme avant. */
    expect(apres[1]).toBe(9);
    expect(apres[3]).toBe(8);
  });

  it('⚠️ sans aucun point, elle rend exactement le nouvel ordre des cartes', () => {
    expect(sequenceReordonnee([1, 2, 3], [1, 2, 3], [3, 2, 1])).toEqual([3, 2, 1]);
  });

  /**
   * 🔴 ET C'EST LA SUITE COMPLÈTE QUI PART, pas la rangée des seuls carrés. Elle se lit DANS LE DOM : tout ce
   * qui porte un `data-carte`, dans l'ordre du document — littéralement ce qu'on voit. Aucune liste parallèle
   * à tenir d'accord avec l'écran.
   */
  it('🔴🔴 l’ordre envoyé est la suite complète, points compris', () => {
    const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useGlisserCarte.ts', 'utf8');
    expect(CROCHET).toContain("p.querySelectorAll<HTMLElement>('[data-carte]')");
    expect(CROCHET).toContain('sequenceReordonnee(sequence(), avant, apres.filter((id) => id > 0))');
    /* 🔴 ET LES POINTS PORTENT LEUR IDENTIFIANT, sans quoi ils manqueraient à cette suite. */
    expect(FRISE).toContain('data-carte={m.id} data-fixe="oui"');
  });

  /** 🔴 ET UNE CARTE POUSSÉE TROP LOIN EST RABOTÉE SUR LA DERNIÈRE PLACE PERMISE, jamais refusée en silence. */
  it('🔴🔴 une carte poussée au-delà d’une borne s’arrête juste avant elle', () => {
    const rangee = [carte(1, 100, false), carte(2, 300), carte(3, 500), carte(4, 700, false)];
    expect(rangeeApresGlisser(rangee, 2, 9999)).toEqual([1, 3, 2, 4]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ L'ORANGE — SEULE LA CARTE DÉPLACÉE CHANGE DE COULEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ la ligne « créée le » passe à l’orange quand la carte a bougé', () => {
  const c = (cle: string, creeLe: string | null) => ({ cle, creeLe });

  it('🔴 une frise dans l’ordre de création n’allume rien', () => {
    expect([...cartesHorsChronologie([c('A', '2026-01-01'), c('B', '2026-01-02'), c('C', '2026-01-03')])])
      .toEqual([]);
  });

  /**
   * 🔴🔴 LA GARANTIE D'ARNO : « LES AUTRES CARTES NE CHANGENT PAS DE COULEUR ». Une règle de voisinage en
   * aurait allumé DEUX sur ce cas (la 3 est après la 1, mais la 2 est après la 3) ; on cherche donc la plus
   * longue suite déjà en ordre, et l'on marque exactement ce qui n'en est pas.
   */
  it('🔴🔴 glisser une carte n’en allume QU’UNE — celle qu’on a prise', () => {
    const orange = cartesHorsChronologie([c('A', '2026-01-01'), c('C', '2026-01-03'), c('B', '2026-01-02')]);
    expect([...orange]).toEqual(['C']);
  });

  it('🔴🔴 remettre la carte à sa place la rend verte', () => {
    expect([...cartesHorsChronologie([c('A', '2026-01-01'), c('B', '2026-01-02'), c('C', '2026-01-03')])])
      .toEqual([]);
  });

  /** ⚠️ DEUX CARTES CRÉÉES LE MÊME JOUR SONT DANS L'ORDRE, quel que soit leur sens. */
  it('⚠️ des dates égales ne s’allument jamais', () => {
    expect([...cartesHorsChronologie([c('A', '2026-01-01'), c('B', '2026-01-01'), c('C', '2026-01-01')])])
      .toEqual([]);
  });

  /** ⚠️ UNE CARTE SANS DATE DE CRÉATION NE S'ALLUME PAS : on ne sait pas où est sa place. */
  it('⚠️ une carte sans date de création est hors du calcul', () => {
    const orange = cartesHorsChronologie([c('A', '2026-01-02'), c('X', null), c('B', '2026-01-01')]);
    expect(orange.has('X')).toBe(false);
    expect(orange.size).toBe(1);
  });

  /** 🔴 DEUX CARTES VRAIMENT DÉPLACÉES S'ALLUMENT TOUTES LES DEUX : la règle ne ment pas par économie. */
  it('🔴 deux déplacements allument deux cartes', () => {
    const orange = cartesHorsChronologie([
      c('D', '2026-01-04'), c('A', '2026-01-01'), c('E', '2026-01-05'), c('B', '2026-01-02'),
    ]);
    expect(orange.size).toBe(2);
  });

  it('⚠️ une frise vide ou d’une seule carte n’allume rien', () => {
    expect(cartesHorsChronologie([]).size).toBe(0);
    expect(cartesHorsChronologie([c('A', '2026-01-01')]).size).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LE CÂBLAGE — QUI ÉCRIT LE RANG, ET QUI LE VÉRIFIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑥ le câblage : un rang à la pose, un ordre complet au dépôt', () => {
  /** 🔴 A1 — la carte neuve prend le rang suivant, calculé DANS la requête d'insertion (pas en deux temps). */
  it('🔴🔴 l’ajout pose la carte au bout, en une seule requête', () => {
    expect(REPO).toContain('(SELECT coalesce(max(x.rang_pose), 0) + 1 FROM gestion_monga_etape x');
  });

  /** 🔴 C8 — l'ordre complet est reçu, vérifié en bloc, et écrit sous transaction. */
  it('🔴🔴 le dépôt refuse un ensemble qui ne correspond pas, et renumérote sous transaction', () => {
    expect(REPO).toContain('export async function reordonnerCartes(');
    expect(REPO).toContain('La frise a changé entre-temps');
    expect(REPO).toContain('Deux fois la même carte dans l’ordre reçu.');
    expect(REPO).toContain('FOR UPDATE');
    expect(REPO).toContain('unnest($2::bigint[]) WITH ORDINALITY');
  });

  /**
   * 🔴🔴 C9 À LA ROUTE, ET PAS SEULEMENT À L'ÉCRAN : la suite des bornes doit être la MÊME avant et après. Une
   * règle tenue par le seul navigateur est contournée par le premier appel qui l'oublie — et celle-ci garde
   * l'ÉTAT de l'événement, qui se lit sur l'ordre des bornes.
   */
  it('🔴🔴 la route refuse un ordre qui déplace une borne', () => {
    /**
     * ══ 🔴🔴 DÉFAUT MESURÉ À L'ÉCRAN AVANT DE LIVRER ══════════════════════════════════════════════════════
     *
     * Le premier jet comparait la SUITE des bornes. Sur une frise qui n'en porte QU'UNE — le cas ordinaire,
     * une Clôture et une ouverture dérivée — la suite ne change jamais, où qu'on mette la Clôture : l'appel de
     * contrôle l'a ramenée en tête, et la route a répondu « ok ». On compare donc l'INDICE, borne par borne.
     */
    expect(ROUTE_FRISE).toContain('const indiceAvant = new Map(avant.map((e, i) => [e.id, i]));');
    expect(ROUTE_FRISE).toContain('indiceAvant.get(id) !== i');
    expect(ROUTE_FRISE).toContain('Ouverture, Clôture et Réouverture ne se déplacent pas');
    /* 🔴 ET LA SUITE SEULE NE SUFFIT PLUS : l'ancienne comparaison ne doit plus exister. */
    expect(ROUTE_FRISE).not.toContain("bornesAvant.join(',')");
  });

  /** ⚠️ L'OUVERTURE DÉRIVÉE EST RETIRÉE DE L'ENVOI : son identifiant `0` n'existe pas en base. */
  it('⚠️ l’écran n’envoie que de vraies cartes', () => {
    expect(FRISE).toContain("{ geste: 'ordre', cartes: ordre.filter((id) => id > 0) }");
  });

  /**
   * ══ 🔴🔴 LOT FRISE-POIGNEE-DE-SAISIE — LA POIGNÉE, ET LE CONFLIT QU'ELLE CLÔT ════════════════════════════
   *
   * ARNO : « sur chaque carré déplaçable, une petite poignée visible (icône ⠿) […] Saisir la poignée démarre
   * le glisser IMMÉDIATEMENT, sans délai de maintien. »
   */
  it('🔴🔴 la poignée existe sur les cartes déplaçables, et sur elles seules', () => {
    expect(FRISE).toContain('{deplacable && onPoignee !== undefined && (');
    expect(FRISE).toContain('className="fav-poignee"');
    expect(FRISE).toContain('<span aria-hidden="true">⠿</span>');
    /* ⚠️ ELLE EST NOMMÉE POUR LE LECTEUR D'ÉCRAN : un ⠿ seul ne se lit pas. */
    expect(FRISE).toContain('aria-label={`Déplacer la carte ${c.mot}`}');
  });

  /** 🔴 « main ouverte » au survol, « main fermée » pendant le glisser (Arno). */
  it('🔴🔴 la poignée annonce qu’elle se prend, et qu’on la tient', () => {
    expect(FRISE).toContain('cursor:grab;touch-action:none}');
    expect(FRISE).toContain('.fav-el--saisie .fav-poignee{cursor:grabbing');
    /**
     * ⚠️ ET ELLE NE CHEVAUCHE PAS LE TITRE. CE CAS EXIGEAIT `.fav-titre--poignee{padding-left:18px}` (le titre
     * reculait d'un côté) et la présence de `.fav-menu{position:absolute;right:4px` (le menu tenait l'autre
     * coin). Depuis le lot FRISE-HORODATAGE-SECONDE-ET-PICTOS, le titre est CENTRÉ (point 9) : il lui faut donc
     * une gouttière SYMÉTRIQUE de 11 px — la largeur mesurée de la poignée, 16 px posés à 3 px du bord, moins
     * les 8 px de retrait du contenu — et le menu, lui, est descendu en bas.
     * La propriété vérifiée change d'endroit ; ce qu'elle garantit est le même, et plus fort : la poignée a sa
     * place des DEUX côtés.
     */
    expect(FRISE).toContain('padding:0 11px}');
    expect(FRISE).toContain('.fav-poignee{position:absolute;left:3px;top:2px');
  });

  /** 🔴🔴 ET ELLE DÉMARRE SANS AUCUN SEUIL — c'est tout l'intérêt d'une poignée. */
  it('🔴🔴 la poignée arme le glisser sur-le-champ, et prend le geste pour elle', () => {
    const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useGlisserCarte.ts', 'utf8');
    expect(CROCHET).toContain('const commencerParLaPoignee = useCallback(');
    /* ⚠️ `stopPropagation` : sans lui, le même appui armerait AUSSI le maintien du carré et le tirage de la
       piste. La poignée prend le geste pour elle, et c'est sa raison d'être. */
    expect(CROCHET).toContain('ev.stopPropagation();');
    /* 🔴 ET AUCUN SEUIL N'EST CONSULTÉ SUR CE CHEMIN : `armer()` est appelé directement. */
    const i = CROCHET.indexOf('const commencerParLaPoignee');
    const bloc = CROCHET.slice(i, CROCHET.indexOf('}, [armer]);', i));
    expect(bloc).toContain('armer();');
    expect(bloc).not.toContain('glisserSArme');
  });

  /**
   * ══ 🔴🔴 LA CAUSE DU CONSTAT D'ARNO EST FERMÉE DES DEUX CÔTÉS ════════════════════════════════════════════
   *
   * La piste démarrait son tirage à 4 px sans délai et prenait la capture du pointeur. Tant qu'une carte est
   * saisie, elle se tait — et c'est une référence PARTAGÉE qui le dit, pas deux états à tenir d'accord.
   */
  it('🔴🔴 la piste ne tire plus pendant qu’on déplace une carte', () => {
    const DEFIL = readFileSync('app/(admin)/admin/(protected)/gestion/useDefilementFrise.ts', 'utf8');
    expect(DEFIL).toContain('if (gesteDeCarte?.() === true) return;');
    /* ⚠️ FACULTATIF : la frise des MAILS ne le passe pas, et se comporte exactement comme avant. */
    expect(DEFIL).toContain('gesteDeCarte?: () => boolean,');
    /**
     * 🔴 UN ÉCRIVAIN, UN LECTEUR, ET AUCUNE RÉFÉRENCE QUI VOYAGE. Le drapeau est créé par `useDrapeauGeste`,
     * qui ne laisse sortir que deux fonctions : le glisser POSE, le défilement LIT. Une référence passée d'un
     * crochet à l'autre puis mutée est refusée par le compilateur React — et il a raison sur le fond : une
     * référence qui circule est une référence dont plus personne ne sait qui l'écrit.
     */
    expect(FRISE).toContain('const drapeauGeste = useDrapeauGeste();');
    expect(FRISE).toContain('useDefilementFrise<HTMLOListElement>(vue, drapeauGeste.lire)');
    expect(FRISE).toContain('useGlisserCarte(defilement.ref, deposer, drapeauGeste.poser)');
  });

  /** 🔴 LE REPÈRE DE DÉPÔT, ET ÉCHAP QUI ANNULE (Arno). */
  it('🔴🔴 un repère montre où la carte tombe, et Échap la remet en place', () => {
    const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useGlisserCarte.ts', 'utf8');
    expect(FRISE).toContain('<span className="fav-repere" ref={poserLeRepere} hidden aria-hidden="true" />');
    expect(FRISE).toContain('.fav-repere{position:absolute;');
    /* ⚠️ DANS LA PISTE, donc dans le repère du CONTENU : posé dans le cadre, il se décalerait du défilement. */
    expect(FRISE).toContain('.fav-piste{position:relative;');
    expect(CROCHET).toContain("if (ev.key !== 'Escape' || geste.current === null) return;");
    /* 🔴 ANNULER N'ENVOIE RIEN : `ranger` remet le fantôme, et le geste est marqué mort. */
    expect(CROCHET).toContain('geste.current.mort = true;');
  });

  /** 🔴 ET LE DÉFILEMENT RESTE UTILISABLE PENDANT LE GLISSER (exigence d'Arno, point 8). */
  it('🔴🔴 la piste défile toute seule aux bords, et les flèches ne sont pas touchées', () => {
    const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useGlisserCarte.ts', 'utf8');
    expect(CROCHET).toContain('p.scrollLeft -= PAS_PX');
    expect(CROCHET).toContain('p.scrollLeft += PAS_PX');
    /* ⚠️ `touch-action:none` SUR LES SEULES CARTES, jamais sur la piste : sinon le défilement au doigt meurt. */
    expect(FRISE).not.toMatch(/\.fav-piste\{[^}]*touch-action/);
  });
});
