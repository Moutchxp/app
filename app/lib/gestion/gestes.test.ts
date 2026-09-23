import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));

import {
  affecter, changerEtatEvenement, classerSansSuite, detacher, estEtat, listerEvenementsOuverts, modifierEvenement,
  preremplir, rouvrir, texte,
} from './gestes';

/**
 * LOT 4b — LES DEUX GESTES. Ce qui est vérifié n'est pas « ça marche » mais les TROIS RÈGLES du module :
 *   ① on ne supprime jamais (tout est changement d'état ou ligne de plus) ;
 *   ② tout geste est réversible ;
 *   ③ tout geste est journalisé, avec qui et quand.
 * Chaque test qui suit tient l'une des trois.
 */

const ARNO = { id: 1, libelle: 'arno' };
const sqls = () => queryMock.mock.calls.map((c) => c[0]).filter((t): t is string => typeof t === 'string').map((s) => s.replace(/\s+/g, ' '));
const journaux = () => sqls().filter((s) => s.includes('INSERT INTO gestion_journal'));
const params = (i: number) => queryMock.mock.calls[i][1] as unknown[];

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('③ AUCUN geste ne s’écrit sans laisser QUI et QUAND', () => {
  it('affectation à un événement existant → une ligne de journal nominative', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] })   // le fil
      .mockResolvedValueOnce({ rows: [{ reference: 'GES-2026-000009' }] }) // l'événement
      .mockResolvedValueOnce({ rows: [] })                                // aucune affectation active à défaire
      .mockResolvedValueOnce({ rows: [{ id: 77 }] })                      // la nouvelle affectation
      .mockResolvedValueOnce({ rows: [] })                                // l'état du fil
      .mockResolvedValueOnce({ rows: [] });                               // le journal
    const r = await affecter(5, { evenementId: 9 }, ARNO);
    expect(r).toEqual({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
    expect(journaux()).toHaveLength(1);
    const p = params(queryMock.mock.calls.findIndex((c) => String(c[0]).includes('gestion_journal')));
    expect(p).toContain('affectation');
    expect(p).toContain(1);       // l'identifiant de l'auteur
    expect(p).toContain('arno');  // …ET son nom, figé en texte : lisible même si le compte est désactivé
  });

  it('classement sans suite → journalisé, avec l’état d’avant et d’après', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] }).mockResolvedValue({ rows: [] });
    expect(await classerSansSuite(5, ARNO, 'facture pour information')).toEqual({ ok: true });
    expect(journaux()).toHaveLength(1);
    const p = params(1);
    expect(p).toContain('sans_suite');
    expect(p).toContain('a_classer');
    expect(p).toContain('facture pour information');
  });

  it('réouverture → journalisée elle aussi (un retour en arrière est un fait, pas un effacement)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockResolvedValue({ rows: [] });
    expect(await rouvrir(5, ARNO)).toEqual({ ok: true });
    expect(journaux()).toHaveLength(1);
  });
});

describe('① ON NE SUPPRIME JAMAIS', () => {
  it('aucun geste n’émet de DELETE ni de TRUNCATE', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 5, etat: 'a_classer', evenement_id: 9, reference: 'GES-2026-000001', dernier: 1 }] });
    await affecter(5, { evenementId: 9 }, ARNO);
    await detacher(5, ARNO);
    await classerSansSuite(5, ARNO);
    await rouvrir(5, ARNO);
    for (const s of sqls()) expect(/DELETE\s+FROM|TRUNCATE/i.test(s)).toBe(false);
  });

  it('détacher DÉSACTIVE l’affectation et la date — il ne l’efface pas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 77, evenement_id: 9 }] }).mockResolvedValue({ rows: [] });
    expect(await detacher(5, ARNO, 'mauvaise carte')).toEqual({ ok: true, evenementId: 9 });
    expect(sqls()[0]).toContain('SET actif = false, detache_le = now()');
    expect(params(0)).toContain('mauvaise carte');
  });

  it('réaffecter conserve l’ancienne affectation, désactivée, et journalise les DEUX faits', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'affecte' }] })
      .mockResolvedValueOnce({ rows: [{ reference: 'GES-2026-000002' }] })
      .mockResolvedValueOnce({ rows: [{ id: 70, evenement_id: 9 }] })  // l'ancienne, LUE (verrouillée) avant d'écrire
      .mockResolvedValueOnce({ rows: [{ id: 70, evenement_id: 9 }] })  // …puis désactivée
      .mockResolvedValueOnce({ rows: [] })                             // son journal
      .mockResolvedValueOnce({ rows: [{ id: 78 }] })                   // la nouvelle
      .mockResolvedValue({ rows: [] });
    expect(await affecter(5, { evenementId: 12 }, ARNO)).toMatchObject({ ok: true, evenementId: 12 });
    expect(journaux()).toHaveLength(2); // détachement PUIS affectation : l'histoire dit où l'échange est passé
  });
});

describe('② tout geste est RÉVERSIBLE, et les refus sont explicites', () => {
  it('détacher un échange qui n’est rattaché à rien → refus lisible, jamais un faux succès', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await detacher(5, ARNO)).toEqual({ ok: false, motif: 'Cet échange n’est rattaché à aucun événement.' });
  });

  it('classer deux fois → refus (et aucune seconde ligne de journal)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await classerSansSuite(5, ARNO)).toEqual({ ok: false, motif: 'Cet échange est déjà classé sans suite, ou n’existe pas.' });
    expect(journaux()).toHaveLength(0);
  });

  it('rouvrir ce qui n’est pas classé → refus', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await rouvrir(5, ARNO)).toEqual({ ok: false, motif: 'Cet échange n’est pas classé sans suite.' });
  });

  it('rattacher au MÊME événement → refus, plutôt qu’un doublon silencieux', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'affecte' }] })
      .mockResolvedValueOnce({ rows: [{ reference: 'GES-2026-000009' }] })
      .mockResolvedValueOnce({ rows: [{ id: 70, evenement_id: 9 }] });
    expect(await affecter(5, { evenementId: 9 }, ARNO)).toEqual({ ok: false, motif: 'Cet échange est déjà rattaché à cet événement.' });
  });

  /**
   * RÉGRESSION MESURÉE (lot 4b, base réelle jetable). `withTransaction` COMMITE dès que la fonction REND une valeur
   * (`db/client.ts:52-54`) : un refus rendu APRÈS un UPDATE est un refus qui a quand même écrit. La première version
   * d'`affecter` désactivait l'affectation active AVANT de constater « déjà rattaché » → l'échange perdait sa carte
   * tout en restant à l'état « affecte » : invisible dans la file ET absent de toute carte. Reproduit en base
   * (0 affectation active après le refus), puis corrigé en LISANT avant d'écrire.
   */
  it('un refus n’a RIEN écrit — ni détachement, ni changement d’état, ni journal', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'affecte' }] })
      .mockResolvedValueOnce({ rows: [{ reference: 'GES-2026-000009' }] })
      .mockResolvedValueOnce({ rows: [{ id: 70, evenement_id: 9 }] });
    await affecter(5, { evenementId: 9 }, ARNO);
    expect(sqls().filter((s) => /^UPDATE|^INSERT|^DELETE/.test(s))).toEqual([]);
    expect(journaux()).toEqual([]);
  });

  it('…et la lecture qui précède l’écriture est VERROUILLÉE (deux clics simultanés se suivent au lieu de se croiser)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'affecte' }] })
      .mockResolvedValueOnce({ rows: [{ reference: 'GES-2026-000009' }] })
      .mockResolvedValueOnce({ rows: [{ id: 70, evenement_id: 9 }] });
    await affecter(5, { evenementId: 9 }, ARNO);
    const lecture = sqls().find((s) => s.includes('FROM gestion_affectation'));
    expect(lecture).toContain('FOR UPDATE');
  });
});

describe('créer un événement depuis un échange', () => {
  it('attribue la référence par un compteur ATOMIQUE, année par année', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] })
      .mockResolvedValueOnce({ rows: [{ dernier: 42 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })
      .mockResolvedValue({ rows: [{ id: 78 }] });
    const r = await affecter(5, { nouveau: { objet: 'Fuite' } }, ARNO);
    const annee = new Date().getFullYear();
    expect(r).toMatchObject({ ok: true, reference: `GES-${annee}-000042` });
    expect(sqls()[1]).toContain('ON CONFLICT (annee) DO UPDATE SET dernier = gestion_compteur.dernier + 1');
  });

  it('refuse une carte sans objet, et une cible absente — jamais une carte vide', async () => {
    expect(await affecter(5, {}, ARNO)).toEqual({ ok: false, motif: 'Indiquez l’événement à rattacher, ou donnez un objet au nouvel événement.' });
    expect(await affecter(5, { nouveau: { objet: '   ' } }, ARNO)).toMatchObject({ ok: false });
    expect(queryMock).not.toHaveBeenCalled(); // refusé AVANT de toucher la base
  });

  it('refuse un échange ou un événement inexistants', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await affecter(5, { evenementId: 9 }, ARNO)).toEqual({ ok: false, motif: 'Cet échange n’existe pas.' });
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] }).mockResolvedValue({ rows: [] });
    expect(await affecter(5, { evenementId: 9 }, ARNO)).toEqual({ ok: false, motif: 'Cet événement n’existe pas.' });
  });
});

describe('le pré-remplissage ne devine RIEN au-delà du mail', () => {
  it('propose l’objet du fil et l’interlocuteur du dernier message REÇU (celui qui demande, pas nous)', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Fuite', nom: 'Mme M.', email: 'm@x.fr', corps: null }] });
    expect(await preremplir(5)).toEqual({ objet: 'Fuite', demandeurNom: 'Mme M.', demandeurEmail: 'm@x.fr', adresseLibre: null });
    expect(sqls()[0]).toContain("m.sens = 'recu'");
  });

  /**
   * LOT 4c — l'objet arrive lesté de sa cascade de préfixes. On le nettoie À LA SOURCE : la carte créée depuis cette
   * proposition NAÎT donc avec un titre propre, et aucune donnée déjà enregistrée n'est réécrite pour autant.
   */
  it('l’objet proposé est débarrassé des « Re: / TR: / Fwd: » en cascade', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Re: TR: Préavis de départ', nom: null, email: null, corps: null }] });
    expect((await preremplir(5))?.objet).toBe('Préavis de départ');
  });

  it('un objet qui n’est QUE des préfixes ne donne pas un titre vide à l’écran', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Re: ', nom: null, email: null, corps: null }] });
    expect((await preremplir(5))?.objet).toBe('(sans objet)');
  });

  it('l’ADRESSE est proposée quand elle est ÉCRITE dans l’objet — lue, jamais devinée', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Re: Lease closure - 28 avenue Marceau 92400 COURBEVOIE', nom: null, email: null, corps: null }] });
    const p = await preremplir(5);
    expect(p?.adresseLibre).toBe('28 avenue Marceau 92400 COURBEVOIE');
    expect(p?.objet).toBe('Lease closure - 28 avenue Marceau 92400 COURBEVOIE'); // l'objet, lui, n'est pas amputé
  });

  it('à défaut de l’objet, la première ligne utile du CORPS du premier message reçu', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Re: Dates travaux', nom: null, email: null, corps: 'Bonjour,\n\n12 rue de la Paix 75002 PARIS\n\nCordialement' }] });
    expect((await preremplir(5))?.adresseLibre).toBe('12 rue de la Paix 75002 PARIS');
  });

  it('aucune adresse dans le mail → champ VIDE. Il n’existe pas de fichier des lots, on n’en invente pas un', async () => {
    queryMock.mockResolvedValue({ rows: [{ objet: 'Re: Dates travaux', nom: null, email: null, corps: 'Bonjour, pouvez-vous confirmer ?' }] });
    expect((await preremplir(5))?.adresseLibre).toBeNull();
  });

  it('échange inconnu → null, jamais une proposition fabriquée', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await preremplir(5)).toBeNull();
  });

  it('le sélecteur ne propose que des événements OUVERTS (rattacher à une carte traitée n’a pas de sens)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, reference: 'GES-2026-000001', objet: 'x' }] });
    await listerEvenementsOuverts();
    expect(sqls()[0]).toContain('WHERE traite_le IS NULL');
  });
});

describe('le titre d’une carte NEUVE naît propre — et aucune carte existante n’est réécrite', () => {
  it('« Re: TR: Fuite » devient « Fuite » à la création', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] })
      .mockResolvedValueOnce({ rows: [{ dernier: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })
      .mockResolvedValue({ rows: [{ id: 78 }] });
    await affecter(5, { nouveau: { objet: 'Re: TR: Fuite salle de bain' } }, ARNO);
    const creation = queryMock.mock.calls.findIndex((c) => String(c[0]).includes('INSERT INTO gestion_evenement'));
    expect(params(creation)).toContain('Fuite salle de bain');
  });

  it('AUCUN geste ne met à jour l’objet d’un événement déjà enregistré', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 5, etat: 'a_classer' }] })
      .mockResolvedValueOnce({ rows: [{ dernier: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })
      .mockResolvedValue({ rows: [{ id: 78 }] });
    await affecter(5, { nouveau: { objet: 'Re: Fuite' } }, ARNO);
    expect(sqls().filter((s) => /^UPDATE gestion_evenement/.test(s))).toEqual([]);
  });
});

describe('bornes de sûreté sur les saisies', () => {
  it('nettoie, borne, et rend null sur du vide — une saisie absurde est refusée, pas une saisie longue', () => {
    expect(texte('  Fuite  ')).toBe('Fuite');
    expect(texte('')).toBeNull();
    expect(texte('   ')).toBeNull();
    expect(texte(42)).toBeNull();
    expect(texte('x'.repeat(500))).toHaveLength(300);
  });
});

describe('LOT 4c — MODIFIER une carte : corriger ce que le pré-remplissage n’a pu que proposer', () => {
  const AVANT = { objet: 'Fuite', demandeur_nom: 'Mme M.', demandeur_email: null, adresse_libre: null, reference: 'GES-2026-000001' };

  it('écrit UNIQUEMENT les champs demandés, et journalise l’AVANT et l’APRÈS de chacun', async () => {
    queryMock.mockResolvedValueOnce({ rows: [AVANT] }).mockResolvedValue({ rows: [] });
    expect(await modifierEvenement(9, { adresseLibre: '28 avenue Marceau' }, ARNO)).toEqual({ ok: true, evenementId: 9 });
    const maj = sqls().find((s) => s.startsWith('UPDATE gestion_evenement')) ?? '';
    expect(maj).toContain('adresse_libre = $2');
    expect(maj).not.toContain('objet =');       // un champ non demandé n'est pas réécrit
    expect(journaux()).toHaveLength(1);
    const p = params(queryMock.mock.calls.findIndex((c) => String(c[0]).includes('gestion_journal')));
    expect(p).toContain(null);                   // la valeur d'AVANT (l'adresse était vide)
    expect(p).toContain('28 avenue Marceau');    // …et la valeur d'APRÈS
    expect(p).toContain('arno');
  });

  it('une modification qui ne change RIEN n’écrit rien et ne journalise rien', async () => {
    queryMock.mockResolvedValueOnce({ rows: [AVANT] }).mockResolvedValue({ rows: [] });
    expect(await modifierEvenement(9, { objet: 'Fuite', demandeurNom: 'Mme M.' }, ARNO)).toEqual({ ok: true, evenementId: 9 });
    expect(sqls().filter((s) => s.startsWith('UPDATE'))).toEqual([]);
    expect(journaux()).toEqual([]);
  });

  it('plusieurs champs d’un coup → une ligne de journal PAR champ, jamais une ligne fourre-tout', async () => {
    queryMock.mockResolvedValueOnce({ rows: [AVANT] }).mockResolvedValue({ rows: [] });
    await modifierEvenement(9, { objet: 'Fuite salle de bain', adresseLibre: '3 rue X' }, ARNO);
    expect(journaux()).toHaveLength(2);
  });

  it('vider le « quoi » est REFUSÉ — une carte sans titre n’est plus retrouvable — et rien n’est écrit', async () => {
    queryMock.mockResolvedValue({ rows: [AVANT] });
    const r = await modifierEvenement(9, { objet: '   ' }, ARNO);
    expect(r.ok).toBe(false);
    expect(sqls().filter((s) => /^UPDATE|^INSERT/.test(s))).toEqual([]);
  });

  it('vider une adresse fausse, en revanche, est LÉGITIME', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...AVANT, adresse_libre: '3 rue Fausse' }] }).mockResolvedValue({ rows: [] });
    expect((await modifierEvenement(9, { adresseLibre: '' }, ARNO)).ok).toBe(true);
    const i = queryMock.mock.calls.findIndex((c) => String(c[0]).startsWith('UPDATE gestion_evenement'));
    expect(params(i)).toContain(null);
  });

  it('carte inconnue → refus, et la lecture qui précède est VERROUILLÉE', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await modifierEvenement(9, { objet: 'x' }, ARNO)).toEqual({ ok: false, motif: 'Cet événement n’existe pas.' });
    expect(sqls()[0]).toContain('FOR UPDATE');
  });
});

describe('LOT 4c — CHANGER L’ÉTAT d’une carte', () => {
  it('« traité » pose la date de traitement ET son auteur (la base l’exige : état et date vont ensemble)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ etat: 'en_cours', reference: 'GES-2026-000001' }] }).mockResolvedValue({ rows: [] });
    expect(await changerEtatEvenement(9, 'traite', ARNO)).toEqual({ ok: true, evenementId: 9 });
    const maj = sqls().find((s) => s.startsWith('UPDATE gestion_evenement')) ?? '';
    expect(maj).toContain("traite_le = CASE WHEN $2 = 'traite' THEN now() ELSE NULL END");
    expect(maj).toContain('traite_par_libelle');
  });

  it('revenir en arrière EFFACE la date — un dossier se rouvre, ce n’est pas une réparation', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ etat: 'traite', reference: 'GES-2026-000001' }] }).mockResolvedValue({ rows: [] });
    expect((await changerEtatEvenement(9, 'en_cours', ARNO)).ok).toBe(true);
    expect(params(1)).toContain('en_cours'); // le CASE remet traite_le à NULL pour tout état autre que « traite »
  });

  it('le changement est journalisé avec l’état d’AVANT et celui d’APRÈS', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ etat: 'a_traiter', reference: 'GES-2026-000001' }] }).mockResolvedValue({ rows: [] });
    await changerEtatEvenement(9, 'en_cours', ARNO);
    expect(journaux()).toHaveLength(1);
    const p = params(queryMock.mock.calls.findIndex((c) => String(c[0]).includes('gestion_journal')));
    expect(p).toContain('a_traiter');
    expect(p).toContain('en_cours');
  });

  it('remettre l’état qu’elle a déjà → refus, SANS rien écrire', async () => {
    queryMock.mockResolvedValue({ rows: [{ etat: 'traite', reference: 'GES-2026-000001' }] });
    const r = await changerEtatEvenement(9, 'traite', ARNO);
    expect(r.ok).toBe(false);
    expect(sqls().filter((s) => /^UPDATE|^INSERT/.test(s))).toEqual([]);
  });

  it('seuls les TROIS états existent — rien d’autre ne franchit la porte', () => {
    expect(estEtat('a_traiter') && estEtat('en_cours') && estEtat('traite')).toBe(true);
    for (const faux of ['archive', 'TRAITE', '', null, 42]) expect(estEtat(faux)).toBe(false);
  });
});
