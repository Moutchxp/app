import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const auteurMock = vi.fn();
vi.mock('../../../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: (...a: unknown[]) => auteurMock(...a),
}));
const categoriesMock = vi.fn();
const cartesMock = vi.fn();
const poserCategorieMock = vi.fn();
const poserCarteMock = vi.fn();
const retirerCarteMock = vi.fn();
const annulerMock = vi.fn();
/* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — le GET rend aussi de quoi PRÉ-REMPLIR la carte du « + » (nom, téléphone
   trouvé en signature). La doublure rend un tableau vide par défaut : les cas d'avant ce lot ne changent pas. */
const coordonneesMock = vi.fn();
/* 🔴🔴 LOT HISTORIQUE-BIEN-7 — les trois gestes d'une carte de contact. */
const verifierCarteMock = vi.fn();
const modifierCarteMock = vi.fn();
vi.mock('../../../../../../lib/gestion/partieCategorieRepo', () => ({
  lireCategoriesDuBien: (...a: unknown[]) => categoriesMock(...a),
  lireCartesDuBien: (...a: unknown[]) => cartesMock(...a),
  coordonneesDesParties: (...a: unknown[]) => coordonneesMock(...a),
  marquerCarteVerifiee: (...a: unknown[]) => verifierCarteMock(...a),
  modifierCarte: (...a: unknown[]) => modifierCarteMock(...a),
  poserCategorieAlaMain: (...a: unknown[]) => poserCategorieMock(...a),
  poserCarteAlaMain: (...a: unknown[]) => poserCarteMock(...a),
  retirerCarte: (...a: unknown[]) => retirerCarteMock(...a),
  annulerGesteDeRangement: (...a: unknown[]) => annulerMock(...a),
}));

import { GET, POST } from './route';

/**
 * LOT HISTORIQUE-BIEN-2 — LA PORTE D'ÉCRITURE DU BLOC « PARTIES ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ELLE SERT. Le bouton « + » d'une partie NON affectée : « une petite carte de création de contact
 * (nom, adresse mail pré-remplie, téléphone, et un choix de catégorie Propriétaire / Locataire / Tiers
 * indépendant) […] Valider range la partie dans le bon groupe en direct » (Arno, 04/10/2026).
 *
 * 🔴 CE QUE CE FICHIER PROTÈGE, ET QUE LES TESTS D'ÉCRAN NE PEUVENT PAS PROTÉGER : que le droit est exigé AVANT
 * toute écriture, que l'auteur vient de la SESSION et jamais du corps de la requête, qu'un tiers indépendant ne
 * reçoit AUCUNE carte, et qu'un échec de la carte ne défait pas le rangement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const poste = (corps: unknown): Request => new Request('http://local/api/admin/gestion/historique/parties', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

const BASE = { cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'locataire' };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  auteurMock.mockReset(); auteurMock.mockResolvedValue({ id: 3, libelle: 'a.jorel@sansvisavis.com' });
  categoriesMock.mockReset(); categoriesMock.mockResolvedValue([]);
  cartesMock.mockReset(); cartesMock.mockResolvedValue([]);
  coordonneesMock.mockReset(); coordonneesMock.mockResolvedValue([]);
  verifierCarteMock.mockReset(); verifierCarteMock.mockResolvedValue({ ok: true, id: 1463, nb: 1 });
  modifierCarteMock.mockReset(); modifierCarteMock.mockResolvedValue({ ok: true, id: 1463, nb: 1 });
  poserCategorieMock.mockReset(); poserCategorieMock.mockResolvedValue({ ok: true, id: 1, nb: 1 });
  poserCarteMock.mockReset(); poserCarteMock.mockResolvedValue({ ok: true, id: 2, nb: 1 });
  retirerCarteMock.mockReset(); retirerCarteMock.mockResolvedValue({ ok: true, id: 9, nb: 1 });
  annulerMock.mockReset(); annulerMock.mockResolvedValue({ ok: true, id: null, nb: 4 });
});

describe('🔒 le droit, et l’auteur', () => {
  it('🔒 exige le droit « gestion » AVANT toute écriture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(poste(BASE))).status).toBe(403);
    expect(poserCategorieMock).not.toHaveBeenCalled();
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 L'AUTEUR EST LU DANS LA SESSION, JAMAIS DANS LE CORPS. Un corps qui nommerait son auteur permettrait de
   * signer un rangement au nom d'un collègue — et un rangement manuel PRIME sur tous les autres.
   */
  it('🔴🔴 l’auteur vient de la session, et le corps ne peut pas le choisir', async () => {
    await POST(poste({ ...BASE, auteur: { id: 99, libelle: 'quelqu’un d’autre' } }));
    expect(poserCategorieMock.mock.calls[0][0].auteur).toEqual({ id: 3, libelle: 'a.jorel@sansvisavis.com' });
  });
});

describe('🔴 ce qu’elle refuse', () => {
  it('🔴 une cible qui n’est pas un bien', async () => {
    for (const cible of ['locataire-12', 'proprietaire-4', '', 'lot-']) {
      const r = await POST(poste({ ...BASE, cible }));
      expect(r.status).toBe(400);
    }
    expect(poserCategorieMock).not.toHaveBeenCalled();
  });

  it('🔴 aucune adresse', async () => {
    const r = await POST(poste({ ...BASE, adresse: '   ' }));
    expect(r.status).toBe(400);
    expect((await r.json()).motif).toContain('Aucune adresse');
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3 — « NON AFFECTÉS » EST DEVENUE POSABLE, ET C'EST UN CHANGEMENT DE SENS ═════════
   *
   * ═══ CE QUE CE CAS ATTENDAIT, ET POURQUOI C'ÉTAIT JUSTE ══════════════════════════════════════════════════════
   * Que `a_repartir` soit REFUSÉE, au même titre qu'une catégorie inconnue. C'était exact au lot 2 : « non
   * affectée » y était l'ABSENCE de rangement, et la figer à la main n'avait aucun sens pour le bouton « + » —
   * on aurait écrit noir sur blanc un non-choix.
   *
   * ═══ 🔴 CE QU'ARNO A TRANCHÉ LE 05/10/2026 ═══════════════════════════════════════════════════════════════════
   * « Les capsules des CONTACTS se glissent-déposent d'une catégorie à l'autre : Propriétaire ⇄ Locataire ⇄
   * Tiers indépendant ⇄ Non affectés. » « Non affectés » devient une ZONE DE DÉPÔT : y glisser un contact est
   * une décision — « ce n'est ni l'un ni l'autre, et je le dis ». Elle est donc posée `manuel` comme les trois
   * autres, et l'automatisation ne la reprendra plus (« le choix manuel prime »).
   *
   * Ce qui reste refusé : l'absence de catégorie, et toute valeur hors des quatre.
   */
  it('🔴🔴 les quatre catégories sont posables ; tout le reste est refusé', async () => {
    for (const categorie of ['proprietaire', 'locataire', 'independant', 'a_repartir']) {
      poserCategorieMock.mockClear();
      const r = await POST(poste({ ...BASE, categorie }));
      expect(r.status).toBe(200);
      expect(poserCategorieMock.mock.calls[0][0].categorie).toBe(categorie);
    }
    poserCategorieMock.mockClear();
    for (const categorie of [undefined, '', 'syndic', 42, 'a-repartir']) {
      const r = await POST(poste({ ...BASE, categorie }));
      expect(r.status).toBe(400);
      expect((await r.json()).motif).toContain('Choisissez une catégorie');
    }
    expect(poserCategorieMock).not.toHaveBeenCalled();
  });

  it('🔴 un corps qui n’est pas du JSON', async () => {
    const r = await POST(new Request('http://local/x', { method: 'POST', body: 'pas du json' }));
    expect(r.status).toBe(400);
  });
});

describe('🔴🔴 ce qu’elle écrit', () => {
  it('🔴 le rangement part avec la clé du bien, l’adresse et la catégorie', async () => {
    await POST(poste({ ...BASE, nom: ' Sophie AXA ', telephone: ' 06 11 22 33 44 ' }));
    expect(poserCategorieMock.mock.calls[0][0]).toMatchObject({
      adresse: 'assureur@fictif.test', lotCle: '155', categorie: 'locataire',
    });
    /* ⚠️ LES BLANCS SONT COUPÉS : « Sophie AXA » et non « Sophie AXA » avec ses espaces. */
    expect(poserCarteMock.mock.calls[0][0]).toMatchObject({
      lotCle: '155', cote: 'locataire', adresse: 'assureur@fictif.test',
      nom: 'Sophie AXA', telephone: '06 11 22 33 44',
    });
  });

  /** 🔴 LE CÔTÉ DE LA CARTE VIENT DE `coteDeLaCategorie`, le juge du rangement — jamais d'un `if` écrit ici. */
  it('🔴 une catégorie « propriétaire » range la carte du côté propriétaire', async () => {
    await POST(poste({ ...BASE, categorie: 'proprietaire', nom: 'M. ROI' }));
    expect(poserCarteMock.mock.calls[0][0].cote).toBe('proprietaire');
  });

  /**
   * 🔴🔴 UN TIERS INDÉPENDANT NE REÇOIT AUCUNE CARTE. Règle du lot précédent, inchangée : il n'est pas un contact
   * de CE bien, il travaille pour nous sur beaucoup de biens. C'est `coteDeLaCategorie` qui rend `null`, et ce
   * `null` — pas une condition recopiée — qui empêche la carte.
   */
  it('🔴🔴 un tiers indépendant est rangé, et ne reçoit AUCUNE carte', async () => {
    const r = await POST(poste({ ...BASE, categorie: 'independant', nom: 'GDS PROPRETÉ' }));
    expect((await r.json()).etat).toBe('ok');
    expect(poserCategorieMock.mock.calls[0][0].categorie).toBe('independant');
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /** ⚠️ NOM ET TÉLÉPHONE SONT FACULTATIFS : une carte nue, à compléter, vaut mieux que pas de rangement. */
  it('⚠️ sans nom ni téléphone, la carte est posée quand même', async () => {
    await POST(poste(BASE));
    expect(poserCarteMock.mock.calls[0][0]).toMatchObject({ nom: null, telephone: null });
  });
});

describe('🔴🔴 ce qu’elle fait quand le dépôt refuse', () => {
  /** 🔴 UN REFUS DU RANGEMENT ARRÊTE TOUT : pas de carte pour une partie qu'on n'a pas su ranger. */
  it('🔴 rangement refusé ⇒ aucune carte, et le motif est rendu tel quel', async () => {
    poserCategorieMock.mockResolvedValue({ ok: false, motif: 'Adresse illisible.' });
    const r = await POST(poste(BASE));
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toBe('Adresse illisible.');
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 UN ÉCHEC DE LA **CARTE** NE DÉFAIT PAS LE RANGEMENT, et il est DIT. Les deux tables sont indépendantes,
   * et le rangement est ce qui compte : rendre une erreur sèche aurait laissé croire que rien n'a été fait alors
   * que la partie a bien changé de groupe — et l'on aurait recommencé, en double.
   */
  it('🔴🔴 carte refusée ⇒ le rangement tient, et le refus de la carte est rendu', async () => {
    poserCarteMock.mockResolvedValue({ ok: false, motif: 'Sans la migration 304, aucune carte.' });
    const r = await POST(poste(BASE));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.etat).toBe('ok');
    expect(d.carteRefusee).toBe('Sans la migration 304, aucune carte.');
  });

  /** ⚠️ UNE PANNE DE BASE EST UNE PANNE, et elle ne se lit pas « rangé ». */
  it('⚠️ la base ne répond pas ⇒ 503, et on le dit', async () => {
    poserCategorieMock.mockRejectedValue(new Error('pg down'));
    const r = await POST(poste(BASE));
    expect(r.status).toBe(503);
    expect((await r.json()).motif).toContain('n’a pas répondu');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-3 — LE DÉPLACEMENT : LA CARTE SUIT LA CATÉGORIE, ET « ANNULER » DÉFAIT EXACTEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la carte de contact suit la catégorie', () => {
  const carte = (o: Partial<{ id: number; cote: string; adresse: string; nom: string | null; telephone: string | null }>) => ({
    id: 70, lotCle: '155', cote: 'proprietaire', adresse: 'assureur@fictif.test',
    nom: 'Sophie AXA', telephone: '06 11 22 33 44', origine: 'manuel',
    verifieLe: null, verifiePar: null, creeLe: '2026-10-04', creePar: 'x', ...o,
  });

  /**
   * 🔴🔴 « DÉPLACÉE » = L'ANCIENNE RETIRÉE, LA NOUVELLE POSÉE AVEC SON NOM ET SON TÉLÉPHONE. La clé de la table
   * est (bien, côté, adresse) : changer de côté EST une autre ligne, il n'y a pas d'`UPDATE` possible. Sans le
   * report du nom et du numéro, déplacer un contact lui faisait perdre le travail de vérification déjà fait.
   */
  it('🔴🔴 déplacer d’un côté à l’autre retire l’ancienne carte et reporte nom et téléphone', async () => {
    cartesMock.mockResolvedValue([carte({ cote: 'proprietaire' })]);
    await POST(poste({ ...BASE, categorie: 'locataire' }));
    expect(retirerCarteMock.mock.calls[0][0]).toMatchObject({ id: 70 });
    expect(retirerCarteMock.mock.calls[0][0].motif).toContain('déplacé côté locataire');
    expect(poserCarteMock.mock.calls[0][0]).toMatchObject({
      cote: 'locataire', nom: 'Sophie AXA', telephone: '06 11 22 33 44',
    });
  });

  /**
   * 🔴🔴 GLISSER VERS TIERS NE CRÉE AUCUNE CARTE, ET RETIRE CELLE QUI EXISTAIT. Arno : « Glisser vers Tiers ne
   * crée aucune carte côté propriétaire ou locataire. » Un tiers n'est pas un contact de CE bien : il travaille
   * pour nous sur beaucoup de biens.
   */
  it('🔴🔴 vers « Tiers indépendant » : la carte est retirée, aucune n’est posée', async () => {
    cartesMock.mockResolvedValue([carte({ cote: 'locataire' })]);
    const r = await POST(poste({ ...BASE, categorie: 'independant' }));
    expect(r.status).toBe(200);
    expect(retirerCarteMock).toHaveBeenCalledTimes(1);
    expect(retirerCarteMock.mock.calls[0][0].motif).toContain('n’est pas un contact de ce bien');
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /** 🔴 MÊME CHOSE VERS « NON AFFECTÉS » : plus aucune carte ne subsiste pour cette adresse sur ce bien. */
  it('🔴🔴 vers « Non affectés » : la carte est retirée aussi', async () => {
    cartesMock.mockResolvedValue([carte({ cote: 'proprietaire' })]);
    await POST(poste({ ...BASE, categorie: 'a_repartir' }));
    expect(retirerCarteMock).toHaveBeenCalledTimes(1);
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * ══ 🔴🔴 ON NE REPOSE PAS UNE CARTE DÉJÀ DU BON CÔTÉ, ET LE PIÈGE EST SÉRIEUX ════════════════════════════════
   *
   * `poserCarteAlaMain` est un `ON CONFLICT DO UPDATE` : reposer aurait rendu l'identifiant d'une carte
   * PRÉEXISTANTE, qui entrerait alors dans « posées » — et « Annuler » l'aurait RETIRÉE, détruisant une carte que
   * le geste n'avait pas créée. C'est exactement le genre de dégât qu'une annulation ne doit jamais faire.
   */
  it('🔴🔴 une carte déjà du bon côté n’est pas reposée, et n’entre pas dans « posées »', async () => {
    cartesMock.mockResolvedValue([carte({ cote: 'locataire', id: 71 })]);
    const r = await POST(poste({ ...BASE, categorie: 'locataire' }));
    expect(poserCarteMock).not.toHaveBeenCalled();
    expect(retirerCarteMock).not.toHaveBeenCalled();
    expect((await r.json()).geste.cartesPosees).toEqual([]);
  });

  /** ⚠️ …SAUF SI LE GESTE APPORTE UN NOM OU UN TÉLÉPHONE : c'est alors une mise à jour voulue. */
  it('⚠️ un nom fourni met à jour la carte déjà du bon côté', async () => {
    cartesMock.mockResolvedValue([carte({ cote: 'locataire', id: 71 })]);
    const r = await POST(poste({ ...BASE, categorie: 'locataire', nom: 'Sophie A.' }));
    expect(poserCarteMock.mock.calls[0][0].nom).toBe('Sophie A.');
    /* …mais elle n'est toujours pas « posée » : elle existait. */
    expect((await r.json()).geste.cartesPosees).toEqual([]);
  });

  /** ⚠️ UNE CARTE D'UNE AUTRE ADRESSE N'EST JAMAIS TOUCHÉE. */
  it('⚠️ seules les cartes de CETTE adresse sont touchées', async () => {
    cartesMock.mockResolvedValue([carte({ adresse: 'quelqun-autre@fictif.test', cote: 'proprietaire' })]);
    await POST(poste({ ...BASE, categorie: 'independant' }));
    expect(retirerCarteMock).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 le geste est rendu, et « Annuler » le défait', () => {
  /**
   * 🔴 LE GESTE EST CE QUE L'ÉCRAN GARDE DERRIÈRE « ANNULER » : ce qui a été posé, ce qui a été retiré. Sans ces
   * identifiants, annuler aurait voulu dire « reposer la catégorie d'avant » — ce qui aurait figé une PROPOSITION
   * en décision humaine, que l'automatisation ne reprendrait plus jamais.
   */
  it('🔴🔴 la réponse porte les quatre listes du geste', async () => {
    poserCategorieMock.mockResolvedValue({ ok: true, id: 101, nb: 1, retires: [100] });
    cartesMock.mockResolvedValue([]);
    poserCarteMock.mockResolvedValue({ ok: true, id: 202, nb: 1 });
    const d = await (await POST(poste({ ...BASE, categorie: 'locataire' }))).json();
    expect(d.geste).toEqual({
      categoriesPosees: [101], categoriesRetirees: [100], cartesPosees: [202], cartesRetirees: [],
    });
  });

  it('🔴 « Annuler » passe le geste au dépôt, et ne range rien de neuf', async () => {
    const geste = {
      categoriesPosees: [101], categoriesRetirees: [100], cartesPosees: [202], cartesRetirees: [9],
    };
    const r = await POST(poste({ action: 'annuler', geste }));
    expect(r.status).toBe(200);
    expect(annulerMock.mock.calls[0][0].geste).toEqual(geste);
    expect(poserCategorieMock).not.toHaveBeenCalled();
    expect(poserCarteMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 LES IDENTIFIANTS DU CORPS SONT FILTRÉS SUR LEUR FORME. Le navigateur renvoie ce que la route lui a
   * donné, mais rien n'oblige à le croire : une chaîne, un nombre négatif ou un flottant ne désignent aucune
   * ligne, et les laisser passer aurait fait écrire du SQL sur des valeurs non vérifiées.
   */
  it('🔴🔴 les identifiants mal formés sont écartés', async () => {
    await POST(poste({
      action: 'annuler',
      geste: {
        categoriesPosees: [101, '102', -3, 0, 1.5, null],
        categoriesRetirees: 'pas un tableau',
        cartesPosees: [202],
        cartesRetirees: [],
      },
    }));
    expect(annulerMock.mock.calls[0][0].geste).toEqual({
      categoriesPosees: [101], categoriesRetirees: [], cartesPosees: [202], cartesRetirees: [],
    });
  });

  it('🔒 annuler exige le droit « gestion », comme poser', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(poste({ action: 'annuler', geste: { categoriesPosees: [1] } }))).status).toBe(403);
    expect(annulerMock).not.toHaveBeenCalled();
  });

  it('⚠️ un refus du dépôt est rendu tel quel', async () => {
    annulerMock.mockResolvedValue({ ok: false, motif: 'Rien à annuler.' });
    const r = await POST(poste({ action: 'annuler', geste: { categoriesPosees: [1] } }));
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toBe('Rien à annuler.');
  });
});

describe('⚠️ la lecture n’a pas bougé', () => {
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE GET REND DE QUOI PRÉ-REMPLIR LA CARTE DU « + » ═══════════════════
   *
   * DEMANDE D'ARNO : la carte « est pré-remplie : nom, adresse, téléphone trouvé en signature ».
   *
   * 🔴 ELLES ARRIVENT AVEC LA LISTE, EN UN SEUL APPEL, et c'est volontaire deux fois : le « + » n'a rien à
   * demander au moment du clic, et AUCUNE ADRESSE PERSONNELLE NE VOYAGE DANS UNE CHAÎNE DE REQUÊTE — ce que ce
   * dépôt refuse partout ailleurs, et que je ne vais pas autoriser pour un pré-remplissage.
   */
  it('🔴🔴 le GET rend les coordonnées trouvées, et rien de plus du corps des mails', async () => {
    coordonneesMock.mockResolvedValue([
      { adresse: 'assureur@fictif.test', nom: 'AXA Courbevoie', telephone: '01 41 21 43 31' },
    ]);
    const r = await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-155'));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.data.coordonnees).toEqual([
      { adresse: 'assureur@fictif.test', nom: 'AXA Courbevoie', telephone: '01 41 21 43 31' },
    ]);
    /* ⚠️ AUCUN EXTRAIT DE COURRIER NE SORT : le corps a été lu pour y chercher un numéro, il n'en reste rien. */
    const brut = JSON.stringify(d);
    expect(brut).not.toContain('corps');
    expect(brut).not.toContain('extrait');
  });

  it('⚠️ SANS COORDONNÉES, LA RÉPONSE PORTE UN TABLEAU VIDE — jamais une absence de champ', async () => {
    const d = await (await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-155'))).json();
    expect(d.data.coordonnees).toEqual([]);
  });

  /** La route sert les deux : le GET du lot précédent reste ce qu'il était, au caractère près. */
  it('⚠️ le GET lit toujours les deux dépôts en parallèle', async () => {
    const r = await GET(new Request('http://local/api/admin/gestion/historique/parties?cible=lot-155'));
    expect(r.status).toBe(200);
    expect(categoriesMock.mock.calls[0][0]).toBe('155');
    expect(cartesMock.mock.calls[0][0]).toBe('155');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES TROIS GESTES D'UNE CARTE DE CONTACT ═════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : le gabarit d'une carte porte un bouton « Vérifié », un crayon pour modifier, et un « … » avec
 * « Retirer » (statut 'retire', jamais supprimée).
 *
 * 🔴 « CHANGER DE CÔTÉ » ET « PASSER EN TIERS INDÉPENDANT » N'ONT PAS DE GESTE À EUX : ce sont des RANGEMENTS, et
 * le geste « ranger » les fait déjà. C'est tout l'intérêt de la seule porte d'écriture qu'Arno demande.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 les trois gestes d’une carte de contact', () => {
  const poste = (corps: unknown): Request => new Request('http://local/api/admin/gestion/historique/parties', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps),
  });

  it('🔴 « Vérifié » marque la carte, et rend le nombre de lignes touchées', async () => {
    const r = await POST(poste({ action: 'verifier', id: 1463 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ etat: 'ok', nb: 1 });
    expect(verifierCarteMock).toHaveBeenCalledWith({ id: 1463, auteur: expect.anything() });
  });

  it('🔴 « Modifier » porte le nom, le téléphone et la note — jamais l’adresse', async () => {
    await POST(poste({
      action: 'modifier', id: 1463, nom: 'Puro Flow Paris', telephone: '01 41 21 43 31', note: 'rappeler le matin',
      /* ⚠️ MÊME ENVOYÉE, L'ADRESSE EST IGNORÉE : elle est l'IDENTITÉ de la carte, pas un champ. */
      adresse: 'autre@fictif.test',
    }));
    const recu = modifierCarteMock.mock.calls[0][0] as Record<string, unknown>;
    expect(recu.id).toBe(1463);
    expect(recu.nom).toBe('Puro Flow Paris');
    expect(recu.telephone).toBe('01 41 21 43 31');
    expect(recu.note).toBe('rappeler le matin');
    expect(recu).not.toHaveProperty('adresse');
  });

  it('🔴 « Retirer » passe par `retirerCarte` et porte un motif — jamais un DELETE', async () => {
    retirerCarteMock.mockResolvedValue({ ok: true, id: 1463, nb: 1 });
    const r = await POST(poste({ action: 'retirer', id: 1463 }));
    expect(r.status).toBe(200);
    const recu = retirerCarteMock.mock.calls[0][0] as Record<string, unknown>;
    expect(recu.id).toBe(1463);
    expect(typeof recu.motif).toBe('string');
  });

  it('⚠️ UNE CARTE DÉJÀ TOUCHÉE PAR L’AUTRE ENDROIT REND `nb: 0`, ET CE N’EST PAS UN REFUS', async () => {
    /* Les deux endroits de l'écran peuvent agir sur la même carte : dire « refus » ferait croire à une panne là
       où deux gestes se sont croisés. L'appelant relit, et la carte a simplement disparu. */
    verifierCarteMock.mockResolvedValue({ ok: true, id: null, nb: 0 });
    const r = await POST(poste({ action: 'verifier', id: 1463 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ etat: 'ok', nb: 0 });
  });

  it('⚠️ SANS IDENTIFIANT, LE GESTE EST REFUSÉ — et aucune écriture n’est tentée', async () => {
    for (const corps of [{ action: 'verifier' }, { action: 'retirer', id: 0 }, { action: 'modifier', id: -3 }]) {
      const r = await POST(poste(corps));
      expect(r.status).toBe(400);
      expect((await r.json()).motif).toContain('Aucune carte désignée');
    }
    expect(verifierCarteMock).not.toHaveBeenCalled();
    expect(modifierCarteMock).not.toHaveBeenCalled();
  });

  it('🔴 UN REFUS DU DÉPÔT EST RENDU TEL QUEL, avec son motif', async () => {
    verifierCarteMock.mockResolvedValue({ ok: false, motif: 'L’auteur du geste doit être identifié.' });
    const r = await POST(poste({ action: 'verifier', id: 1463 }));
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toContain('identifié');
  });

  it('⚠️ CES GESTES NE DEMANDENT AUCUNE CIBLE : la carte se désigne par son identifiant', async () => {
    /* Aucun `cible` dans le corps, et pourtant 200 : c'est voulu — la carte porte déjà son bien. */
    const r = await POST(poste({ action: 'verifier', id: 1463 }));
    expect(r.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LA FICHE COMPLÈTE TRAVERSE LA MÊME PORTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Le formulaire du “+” doit être le MÊME que celui des clients […] Le même formulaire complet
   sert à “Modifier ce contact” (le crayon de la carte). »

   🔴 CE QUE CE GROUPE PROTÈGE : que les huit champs et la liste des coordonnées arrivent AU DÉPÔT, que la liste
   passe par le module PUR (une ligne illisible est ignorée, jamais devinée), et qu'un appelant qui n'en parle pas
   obtienne EXACTEMENT le comportement du lot 7 — c'est ce dernier point qui rend ce lot sans danger.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la fiche d’un contact, du corps de la requête jusqu’au dépôt', () => {
  const FICHE = {
    civilite: 'Mme', prenom: 'Fanny', qualite: 'syndic',
    adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'PUTEAUX',
    note: 'ne pas appeler avant 10 h',
    coordonnees: [
      { sorte: 'telephone', libelle: 'Mobile', valeur: '06 11 22 33 44' },
      { sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' },
    ],
  };

  it('🔴🔴 LE « + » LA FAIT SUIVRE AU DÉPÔT, en entier', async () => {
    await POST(poste({ ...BASE, nom: 'ROSKY', ...FICHE }));
    const recu = poserCarteMock.mock.calls[0][0] as { fiche?: Record<string, unknown> };
    expect(recu.fiche).toEqual(FICHE);
  });

  it('🔴🔴 LE CRAYON LA FAIT SUIVRE AUSSI — c’est le même formulaire', async () => {
    await POST(poste({ action: 'modifier', id: 1463, nom: 'ROSKY', ...FICHE }));
    const recu = modifierCarteMock.mock.calls[0][0] as { fiche?: Record<string, unknown> };
    expect(recu.fiche).toEqual(FICHE);
  });

  /**
   * 🔴🔴 UN CORPS DE REQUÊTE ET UNE COLONNE `jsonb` SONT DEUX INCONNUS DE MÊME NATURE : la MÊME fonction pure les
   * relit (`coordonneesDeLaCarte`). Écrire ici une seconde lecture « pour le réseau » aurait autorisé en entrée ce
   * que la relecture refuse ensuite — et c'est une carte qui ment pour toujours.
   */
  it('🔴🔴 LES COORDONNÉES PASSENT PAR LE MODULE PUR : l’illisible est écarté, jamais deviné', async () => {
    await POST(poste({
      ...BASE, nom: 'ROSKY',
      coordonnees: ['texte', 42, null, { sorte: 'fax', valeur: '01' }, { sorte: 'email', valeur: '   ' },
        { sorte: 'email', valeur: 'f.rosky@fictif.test', libelle: 'E-mail' }],
    }));
    const recu = poserCarteMock.mock.calls[0][0] as { fiche?: { coordonnees?: unknown } };
    expect(recu.fiche?.coordonnees)
      .toEqual([{ sorte: 'email', valeur: 'f.rosky@fictif.test', libelle: 'E-mail' }]);
  });

  it('⚠️ LES CHAMPS SONT BORNÉS, comme partout dans cette route', async () => {
    await POST(poste({ ...BASE, nom: 'ROSKY', commune: 'x'.repeat(400), codePostal: '928001234567' }));
    const f = (poserCarteMock.mock.calls[0][0] as { fiche: { commune: string; codePostal: string } }).fiche;
    expect(f.commune).toHaveLength(120);
    expect(f.codePostal).toHaveLength(10);
  });

  /**
   * 🔴🔴 LE POINT LE PLUS IMPORTANT DU GROUPE : un corps SANS aucun champ de fiche ne donne PAS une fiche vide —
   * il donne `undefined`, et le dépôt ne nomme alors AUCUNE colonne de la 306. Une fiche vide, elle, aurait
   * effacé (au crayon) ou tenté d'écrire sept colonnes peut-être absentes. Un script, ou un écran d'avant ce lot,
   * garde donc exactement l'effet qu'il avait.
   */
  it('🔴🔴 SANS AUCUN CHAMP DE FICHE, LE DÉPÔT N’EN REÇOIT AUCUNE — l’effet du lot 7, à la lettre', async () => {
    await POST(poste({ ...BASE, nom: 'ROSKY', telephone: '01 41 21 43 31' }));
    expect((poserCarteMock.mock.calls[0][0] as { fiche?: unknown }).fiche).toBeUndefined();

    await POST(poste({ action: 'modifier', id: 1463, nom: 'ROSKY', telephone: '01 41 21 43 31' }));
    expect((modifierCarteMock.mock.calls[0][0] as { fiche?: unknown }).fiche).toBeUndefined();
  });

  /**
   * 🔴🔴 LA FICHE SUIT AUSSI UN CHANGEMENT DE CÔTÉ. La clé de la table est (bien, côté, adresse) : changer de côté
   * EST une autre ligne, et tout ce qu'un humain a saisi doit être recopié. Sans ce report, glisser une capsule
   * d'un côté à l'autre lui faisait perdre son adresse postale, sa qualité et ses coordonnées.
   */
  it('🔴🔴 UN CHANGEMENT DE CÔTÉ RECOPIE LA FICHE DE L’ANCIENNE CARTE', async () => {
    cartesMock.mockResolvedValue([{
      id: 480, cote: 'proprietaire', adresse: 'assureur@fictif.test', nom: 'ROSKY',
      telephone: '01 41 21 43 31', origine: 'manuel', verifieLe: null, verifiePar: null,
      note: 'ne pas appeler avant 10 h', civilite: 'Mme', prenom: 'Fanny', qualite: 'syndic',
      adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'PUTEAUX',
      coordonnees: [{ sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' }],
    }]);
    /* Aucun champ de fiche dans le corps : c'est le geste du menu « ⋯ » (« Changer de côté »). */
    await POST(poste(BASE));
    const recu = poserCarteMock.mock.calls[0][0] as { fiche?: Record<string, unknown> };
    expect(recu.fiche).toEqual({
      civilite: 'Mme', prenom: 'Fanny', qualite: 'syndic',
      adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'PUTEAUX',
      note: 'ne pas appeler avant 10 h',
      coordonnees: [{ sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' }],
    });
  });

  /**
   * 🔴 LA FICHE DU GESTE L'EMPORTE SUR CELLE DE LA CARTE DÉPLACÉE, et l'ordre compte : quand le formulaire envoie
   * une fiche, c'est elle qu'un humain vient d'écrire.
   */
  it('🔴 LA FICHE DU FORMULAIRE L’EMPORTE SUR CELLE DE LA CARTE QU’ON DÉPLACE', async () => {
    cartesMock.mockResolvedValue([{
      id: 480, cote: 'proprietaire', adresse: 'assureur@fictif.test', nom: 'ANCIEN',
      telephone: null, origine: 'manuel', verifieLe: null, verifiePar: null, note: null,
      civilite: 'M.', prenom: 'Ancien', qualite: null, adressePostale: null, codePostal: null,
      commune: null, coordonnees: [],
    }]);
    await POST(poste({ ...BASE, nom: 'ROSKY', ...FICHE }));
    const recu = poserCarteMock.mock.calls[0][0] as { fiche?: { civilite?: string | null } };
    expect(recu.fiche?.civilite).toBe('Mme');
  });

  /**
   * 🔴🔴 LE GET REND CE QUE LA CARTE DU HAUT AFFICHE, et le crayon rouvre. Ce qui ne part pas d'ici ne peut ni
   * s'afficher ni se rouvrir — et un formulaire qui perd la moitié de ce qu'on y a saisi est pire que pas de
   * formulaire.
   */
  it('🔴🔴 LE GET REND LES SEPT CHAMPS DE LA CARTE', async () => {
    cartesMock.mockResolvedValue([{
      id: 480, cote: 'proprietaire', adresse: 'assureur@fictif.test', nom: 'ROSKY', telephone: null,
      origine: 'manuel', verifieLe: null, verifiePar: null, note: null, civilite: 'Mme', prenom: 'Fanny',
      qualite: 'syndic', adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'PUTEAUX',
      coordonnees: [{ sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' }],
    }]);
    const r = await GET(new Request('http://local/api?cible=lot-155'));
    const [carte] = (await r.json()).data.cartes as Record<string, unknown>[];
    expect(carte.civilite).toBe('Mme');
    expect(carte.prenom).toBe('Fanny');
    expect(carte.qualite).toBe('syndic');
    expect(carte.adressePostale).toBe('2 rue Mars et Roty');
    expect(carte.codePostal).toBe('92800');
    expect(carte.commune).toBe('PUTEAUX');
    expect(carte.coordonnees).toEqual([{ sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' }]);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8 — VALIDER UNE PROPOSITION, ET POUVOIR L'ANNULER EXACTEMENT ════════════════════════
 *
 * Le défaut trouvé par l'essai réel (voir l'encadré de `poserCarteAlaMain`) a changé ce que la pose rend : elle
 * RETIRE la proposition et pose une carte NEUVE. La route doit donc ranger la neuve dans `cartesPosees` et la
 * proposition dans `cartesRetirees` — sans quoi « Annuler » laisserait l'une ou l'autre en place.
 */
describe('🔴🔴 le geste d’une proposition validée se défait exactement', () => {
  it('🔴🔴 LA CARTE NEUVE EST « POSÉE », LA PROPOSITION EST « RETIRÉE »', async () => {
    poserCarteMock.mockResolvedValue({ ok: true, id: 1470, nb: 1, retires: [480] });
    const r = await POST(poste({ ...BASE, nom: 'TADEU' }));
    const d = await r.json();
    expect(d.geste.cartesPosees).toEqual([1470]);
    expect(d.geste.cartesRetirees).toEqual([480]);
  });

  /**
   * ⚠️ ET UNE CARTE DÉJÀ MANUELLE DU BON CÔTÉ N'ENTRE TOUJOURS PAS DANS « POSÉES » : elle a été complétée, pas
   * créée. La mettre là ferait retirer par « Annuler » une carte que le geste n'avait pas créée — garde du lot 3.
   */
  it('⚠️ UNE CARTE COMPLÉTÉE SUR PLACE N’ENTRE PAS DANS « POSÉES »', async () => {
    cartesMock.mockResolvedValue([{
      id: 1465, cote: 'locataire', adresse: 'assureur@fictif.test', nom: 'BRUNEEL', telephone: null,
      origine: 'manuel', verifieLe: null, verifiePar: null, note: null, civilite: null, prenom: null,
      qualite: null, adressePostale: null, codePostal: null, commune: null, coordonnees: [],
    }]);
    poserCarteMock.mockResolvedValue({ ok: true, id: 1465, nb: 1, retires: [] });
    const r = await POST(poste({ ...BASE, nom: 'BRUNEEL' }));
    const d = await r.json();
    expect(d.geste.cartesPosees).toEqual([]);
    expect(d.geste.cartesRetirees).toEqual([]);
  });
});
