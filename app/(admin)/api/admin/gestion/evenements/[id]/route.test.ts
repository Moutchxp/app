import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const repo = { lireCarte: vi.fn() };
vi.mock('../../../../../../lib/gestion/carteRepo', () => ({ lireCarte: (...a: unknown[]) => repo.lireCarte(...a) }));
const gestes = { modifierEvenement: vi.fn(), changerEtatEvenement: vi.fn() };
vi.mock('../../../../../../lib/gestion/gestes', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../../../../../../lib/gestion/gestes')>();
  return {
    estEtat: vrai.estEtat, // la VRAIE validation d'état : c'est elle qu'on veut éprouver ici
    modifierEvenement: (...a: unknown[]) => gestes.modifierEvenement(...a),
    changerEtatEvenement: (...a: unknown[]) => gestes.changerEtatEvenement(...a),
  };
});
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'arno' }) }));
/**
 * 🔴 LOT MONGA-1, POINT 4 — l'intervention Monga de la carte, lue par la route à côté de `lireCarte`. Mockée
 * ici comme le dépôt de la carte : ce fichier éprouve le CONTRAT de la route, pas la lecture elle-même.
 */
const monga = { mongaDeLEvenement: vi.fn() };
vi.mock('../../../../../../lib/gestion/mongaRepo', () => ({
  mongaDeLEvenement: (...a: unknown[]) => monga.mongaDeLEvenement(...a),
}));
/**
 * 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — les BIENS de l'événement, lus à côté de la carte : c'est eux que le gros
 * bouton « Ouvrir la fiche du bien sur cet événement → » adresse. Mockés comme les deux autres lectures — ce
 * fichier éprouve le CONTRAT de la route.
 */
const biens = { biensNommesDeLEvenement: vi.fn() };
vi.mock('../../../../../../lib/gestion/mongaEtapeRepo', () => ({
  biensNommesDeLEvenement: (...a: unknown[]) => biens.biensNommesDeLEvenement(...a),
}));
/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — LES PARTIES DU BIEN, PAR LE CALCUL QUI EXISTE DÉJÀ ═════════════════════
 *
 * Arno : « Réutilise le calcul du bloc Parties de la fiche bien (pas de seconde requête qui recalcule à sa
 * façon). » `personnesDesBiens` EST ce calcul — celui que l'étape 2 du classement affiche, et celui que la
 * création d'un événement depuis Monga emploie déjà pour POSER les parties d'une carte neuve.
 *
 * 🔴 MOCKÉ COMME LES TROIS AUTRES LECTURES, et pour la même raison : ce fichier éprouve le CONTRAT de la route —
 * ce qu'elle appelle, avec quoi, et ce qu'elle rend. Le calcul lui-même a ses propres épreuves.
 *
 * ⚠️ `personnesEnVigueur` N'EST PAS MOCKÉE, ET C'EST VOULU : c'est un module PUR, et c'est la RÈGLE qu'on veut
 * voir appliquée (propriétaires en cours, locataires OCCUPANTS du jour). La doubler aurait éprouvé que la route
 * appelle une fonction, non qu'elle retient les bonnes personnes.
 */
const parts = { personnesDesBiens: vi.fn() };
vi.mock('../../../../../../lib/gestion/contactExterneRepo', () => ({
  personnesDesBiens: (...a: unknown[]) => parts.personnesDesBiens(...a),
}));

import { GET, PATCH } from './route';

/** LOT 4c — le détail d'une carte, et ses corrections. Contrat de la route : qui passe, quoi est transmis, quoi est rendu. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps?: unknown) => new Request('http://local/x', {
  method: 'PATCH', ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
});
const CARTE = { evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite', fils: [] };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  monga.mongaDeLEvenement.mockReset(); monga.mongaDeLEvenement.mockResolvedValue(null);
  biens.biensNommesDeLEvenement.mockReset(); biens.biensNommesDeLEvenement.mockResolvedValue([]);
  parts.personnesDesBiens.mockReset(); parts.personnesDesBiens.mockResolvedValue([]);
  repo.lireCarte.mockReset(); repo.lireCarte.mockResolvedValue(CARTE);
  gestes.modifierEvenement.mockReset(); gestes.modifierEvenement.mockResolvedValue({ ok: true, evenementId: 9 });
  gestes.changerEtatEvenement.mockReset(); gestes.changerEtatEvenement.mockResolvedValue({ ok: true, evenementId: 9 });
});

describe('GET — le détail, servi seulement à qui a le droit', () => {
  it('exige le droit « gestion » : le détail contient le texte de mails de locataires', async () => {
    await GET(new Request('http://local/x'), ctx('9'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refus → aucune lecture en base', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(403);
    expect(repo.lireCarte).not.toHaveBeenCalled();
  });

  it('rend la carte, et INTERDIT toute mise en cache partagée', async () => {
    const res = await GET(new Request('http://local/x'), ctx('9'));
    /**
     * 🔴 LOT MONGA-1, POINT 4 — `monga: null` EST LE CAS ORDINAIRE, et de très loin : une carte qui ne porte
     * aucune intervention Monga n'affiche aucun badge et reste exactement celle d'avant ce lot. C'est aussi ce
     * que rend la route sans la migration 311.
     */
    /**
     * 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — `biens` S'AJOUTE AU CONTRAT, et la liste vide est une réponse : un
     * événement rattaché à aucun bien n'a pas de fiche à ouvrir, et l'écran le DIT plutôt que d'offrir un bouton
     * qui ne mène nulle part.
     */
    /**
     * 🔴 LOT URGENCE-EVENEMENT, POINT 5 — `parties` S'AJOUTE AU CONTRAT, et la liste vide est une réponse : un
     * événement sans bien n'a aucune partie à nommer, et la carte dépliée n'affiche alors rien de plus qu'avant
     * ce lot.
     */
    expect(await res.json()).toEqual({ ...CARTE, monga: null, biens: [], parties: [] });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — LES PARTIES EN VIGUEUR, ET ELLES SEULES ══════════════════════════
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  it('🔴🔴 LOT URGENCE-EVENEMENT — les parties sont lues pour TOUS les biens, en un seul appel', async () => {
    biens.biensNommesDeLEvenement.mockResolvedValue([
      { cle: '315', adresse: 'a', commune: 'b' },
      { cle: '402', adresse: 'c', commune: 'd' },
    ]);
    await GET(new Request('http://local/x'), ctx('9'));
    /* 🔴 UN SEUL APPEL, AVEC LES DEUX CLÉS : c'est la promesse de `personnesDesBiens` (deux requêtes pour tous
       les biens, jamais deux par bien), et la route ne doit pas la casser en l'appelant dans une boucle. */
    expect(parts.personnesDesBiens).toHaveBeenCalledTimes(1);
    expect(parts.personnesDesBiens.mock.calls[0][0]).toEqual(['315', '402']);
    /* 🔴 ET LA DATE EST CELLE D'AUJOURD'HUI : « locataires ACTUELS » (Arno), et non ceux de la date d'un mail. */
    expect(parts.personnesDesBiens.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * 🔴🔴 ON NE RETIENT QUE LES PERSONNES EN VIGUEUR, et c'est `personnesEnVigueur` (module PUR) qui tranche :
   * propriétaires EN COURS, et locataires OCCUPANTS du jour. Un ancien propriétaire d'un bien vendu et un
   * locataire sortant existent en base et n'ont rien à faire sur la carte d'aujourd'hui.
   */
  it('🔴🔴 LOT URGENCE-EVENEMENT — un ancien propriétaire et un sortant sont ÉCARTÉS', async () => {
    biens.biensNommesDeLEvenement.mockResolvedValue([{ cle: '315', adresse: 'a', commune: 'b' }]);
    parts.personnesDesBiens.mockResolvedValue([{
      cle: '315', adresseComplete: 'a', nature: null, typeBien: null,
      personnes: [
        { sorte: 'proprietaire', cle: 'p1', id: 1, nom: 'SCI DES LILAS', civilite: null,
          role: 'proprietaire', actif: true },
        { sorte: 'proprietaire', cle: 'p2', id: 2, nom: 'ANCIEN VENDEUR', civilite: null,
          role: 'proprietaire', actif: false },
        { sorte: 'locataire', cle: 'l1', id: 3, nom: 'DUPONT Marie', civilite: null,
          role: 'locataire_occupant' },
        { sorte: 'locataire', cle: 'l2', id: 4, nom: 'PARTI Paul', civilite: null,
          role: 'locataire_sortant' },
      ],
    }]);
    const res = await GET(new Request('http://local/x'), ctx('9'));
    const d = (await res.json()) as { parties: { sorte: string; nom: string }[] };
    expect(d.parties).toEqual([
      { sorte: 'proprietaire', nom: 'SCI DES LILAS' },
      { sorte: 'locataire', nom: 'DUPONT Marie' },
    ]);
  });

  it('🔴 LOT MONGA-1, POINT 4 — une carte RELIÉE porte son badge, son étape et son lien', async () => {
    monga.mongaDeLEvenement.mockResolvedValue({
      reference: 'MNG-23987', libelle: 'barre de douche defixer',
      lienMission: 'https://app.monga.io/missions/view/abc', derniereEtape: 'devis_rappel',
      derniereEtapeMot: 'Devis en attente de validation · 05/10', nbMails: 4,
      badge: 'Monga MNG-23987', terminee: false,
    });
    const res = await GET(new Request('http://local/x'), ctx('9'));
    const d = (await res.json()) as { monga: { badge: string; terminee: boolean } };
    expect(d.monga.badge).toBe('Monga MNG-23987');
    expect(d.monga.terminee).toBe(false);
    expect(monga.mongaDeLEvenement).toHaveBeenCalledWith(9);
  });

  it('carte inconnue → 404 ; identifiant absurde → 400 sans toucher la base', async () => {
    repo.lireCarte.mockResolvedValue(null);
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(404);
    repo.lireCarte.mockClear();
    expect((await GET(new Request('http://local/x'), ctx('abc'))).status).toBe(400);
    expect(repo.lireCarte).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais une carte vide qui ferait croire à une carte sans échange', async () => {
    repo.lireCarte.mockRejectedValue(new Error('base indisponible'));
    expect((await GET(new Request('http://local/x'), ctx('9'))).status).toBe(503);
  });
});

describe('PATCH — changer l’état', () => {
  it('transmet l’état et l’auteur', async () => {
    const res = await PATCH(req({ etat: 'traite' }), ctx('9'));
    expect(gestes.changerEtatEvenement.mock.calls[0]).toEqual([9, 'traite', { id: 1, libelle: 'arno' }]);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('un état inventé est REFUSÉ à la porte — rien ne descend vers la base', async () => {
    for (const faux of ['archive', 'TRAITE', '', 42]) {
      const res = await PATCH(req({ etat: faux }), ctx('9'));
      expect(res.status).toBe(400);
    }
    expect(gestes.changerEtatEvenement).not.toHaveBeenCalled();
  });

  it('refus métier (déjà dans cet état) → 409 avec le motif lisible', async () => {
    gestes.changerEtatEvenement.mockResolvedValue({ ok: false, motif: 'Cet événement est déjà « traite ».' });
    const res = await PATCH(req({ etat: 'traite' }), ctx('9'));
    expect(res.status).toBe(409);
    expect((await res.json() as { erreur: string }).erreur).toContain('déjà');
  });
});

describe('PATCH — corriger ce que le pré-remplissage n’a pu que proposer', () => {
  it('transmet les champs donnés, et EUX SEULS (un champ absent n’est pas un champ vidé)', async () => {
    await PATCH(req({ adresseLibre: '28 avenue Marceau' }), ctx('9'));
    const champs = gestes.modifierEvenement.mock.calls[0][1] as Record<string, unknown>;
    expect(champs.adresseLibre).toBe('28 avenue Marceau');
    expect(champs.objet).toBeUndefined();
    expect(gestes.changerEtatEvenement).not.toHaveBeenCalled();
  });

  it('vider explicitement un champ est transmis comme tel — effacer une donnée fausse est légitime', async () => {
    await PATCH(req({ adresseLibre: '' }), ctx('9'));
    expect((gestes.modifierEvenement.mock.calls[0][1] as Record<string, unknown>).adresseLibre).toBe('');
  });

  it('corps illisible → 422, sans rien écrire', async () => {
    const res = await PATCH(new Request('http://local/x', { method: 'PATCH', body: 'pas du json' }), ctx('9'));
    expect(res.status).toBe(422);
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
  });

  it('panne → 503, jamais un faux succès', async () => {
    gestes.modifierEvenement.mockRejectedValue(new Error('base indisponible'));
    expect((await PATCH(req({ objet: 'x' }), ctx('9'))).status).toBe(503);
  });

  it('la garde protège aussi l’écriture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(req({ objet: 'x' }), ctx('9'))).status).toBe(403);
    expect(gestes.modifierEvenement).not.toHaveBeenCalled();
  });
});
