import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 9 — les écritures de « Mes apporteurs », annuaire simulé EN MÉMOIRE (la création de la Location y ajoute la fiche) :
 * création acceptée (externe rattaché au titulaire, origine « mon-espace »), doublon (homonyme / téléphone / e-mail) → 409 sans création, deux
 * créations simultanées → UNE fiche, nom déjà pris en base (23505) → 409, « L'utiliser » sans la 450 → refus clair, modifier : qui a le droit.
 */
const h = vi.hoisted(() => ({
  annuaire: [] as Record<string, unknown>[], creer: vi.fn(), fiche: vi.fn(), requetes: [] as string[], admin: false, a450: true,
}));
vi.mock('../db/client', () => ({ query: async (sql: string) => { h.requetes.push(sql); return { rows: [{ n: 1 }] }; } }));
vi.mock('../admin/schemaDroits', () => ({ apporteursUtilisesDisponible: async () => h.a450 }));
vi.mock('./compteRepo', () => ({ estAdministrateur: async () => h.admin }));
vi.mock('../location/suivi/suiviRepo', () => ({
  lireApporteurs: async () => h.annuaire, creerApporteur: h.creer, enregistrerFicheApporteur: h.fiche,
  lireComptesInterface: async () => [], ficheIdentiteDisponible: async () => true, nomPrenomDisponible: async () => true,
}));
vi.mock('../transaction/repo', () => ({ lireVentes: async () => [], lireRetrocessions: async () => [], transactionDisponible: async () => true }));
vi.mock('./mesAffairesRepo', () => ({ moiDansLesVentes: async () => ({ ids: new Set(), libelles: new Set() }) }));
import { creerApporteurMonEspace, modifierFicheMonEspace, utiliserApporteur } from './apporteursRepo';

const AUTEUR = { id: 5, libelle: 'lea@x.fr' };
const fiche = (id: number, nom: string, o: Record<string, unknown> = {}) => ({ id, nom, type: 'partenaire', baremes: [], archive: false, collegues: [], ...o });
beforeEach(() => {
  h.annuaire = [fiche(1, 'DURAND Paul', { telephone: '0612345678', email: 'paul@durand.fr', collegues: [{ depuis: '0001-01-01', collegueId: 7, collegueLibelle: 'Marc' }] })];
  h.requetes = []; h.admin = false; h.a450 = true;
  h.creer.mockReset().mockImplementation(async (s: Record<string, unknown>) => {
    await new Promise((r) => setTimeout(r, 5)); // l'écriture prend du temps : deux créations se croiseraient sans la file
    const id = 100 + h.annuaire.length;
    h.annuaire.push(fiche(id, String(s.nom), { telephone: s.telephone, email: s.email }));
    return { etat: 'ok', data: { id } };
  });
  h.fiche.mockReset().mockResolvedValue({ etat: 'ok', data: { id: 1 } });
});

describe('🔴 créer depuis « Mon espace » : jamais un doublon', () => {
  it('une création acceptée : la fonction de la Location, externe rattaché au titulaire, puis « utilisé » par lui', async () => {
    const r = await creerApporteurMonEspace(5, { nom: 'Zoé NOUVELLE', interne: false, telephone: '0699999999', email: '' }, AUTEUR);
    expect(r).toEqual({ ok: true, id: 101 });
    expect(h.creer).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Zoé NOUVELLE', collegueId: 5, origine: 'mon-espace' }), AUTEUR);
    expect(h.requetes.some((q) => q.includes('INSERT INTO mon_espace_apporteur'))).toBe(true);
  });
  it('un collègue choisi est gardé tel quel', async () => {
    await creerApporteurMonEspace(5, { nom: 'Autre PERSONNE', collegueId: 7 }, AUTEUR);
    expect(h.creer.mock.calls[0][0]).toMatchObject({ collegueId: 7 });
  });
  it.each([
    ['homonyme', { nom: 'Paul Durand' }],
    ['même téléphone', { nom: 'Quelqu’un', telephone: '+33 6 12 34 56 78' }],
    ['même e-mail', { nom: 'Autre', email: 'PAUL@durand.fr' }],
  ])('%s : 409 avec la fiche existante et son collègue, rien n’est créé', async (_, saisie) => {
    const r = await creerApporteurMonEspace(5, saisie, AUTEUR);
    expect(r).toMatchObject({ ok: false, statut: 409, doublons: [{ id: 1, collegue: 'Marc' }] });
    expect(h.creer).not.toHaveBeenCalled();
  });
  it('deux créations SIMULTANÉES du même apporteur : une seule fiche, l’autre 409', async () => {
    const [a, b] = await Promise.all([
      creerApporteurMonEspace(5, { nom: 'Jean SIMULTANE', telephone: '0711111111' }, AUTEUR),
      creerApporteurMonEspace(7, { nom: 'Jean SIMULTANE', telephone: '0711111111' }, { id: 7, libelle: 'marc@x.fr' }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(h.creer).toHaveBeenCalledTimes(1);
    expect(h.annuaire.filter((x) => x.nom === 'Jean SIMULTANE')).toHaveLength(1);
  });
  it('le nom déjà pris en base (index unique, 23505) : 409, jamais une erreur 500', async () => {
    h.creer.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    expect(await creerApporteurMonEspace(5, { nom: 'Inédit NOM' }, AUTEUR)).toMatchObject({ ok: false, statut: 409 });
  });
});

describe('🔴 « L’utiliser » et modifier la fiche', () => {
  it('« L’utiliser » : une ligne (ON CONFLICT : deux clics, une ligne) ; sans la 450 : refus clair, aucune écriture', async () => {
    expect(await utiliserApporteur(5, 1, AUTEUR)).toEqual({ ok: true });
    expect(h.requetes.find((q) => q.includes('INSERT INTO mon_espace_apporteur'))).toContain('ON CONFLICT');
    h.a450 = false; h.requetes = [];
    expect(await utiliserApporteur(5, 1, AUTEUR)).toMatchObject({ ok: false, statut: 422 });
    expect(h.requetes).toEqual([]);
  });
  it('modifier : Marc (son collègue) oui ; Léa non (403, rien n’est écrit) ; un administrateur oui ; conflit → 409', async () => {
    expect(await modifierFicheMonEspace(7, 1, { nom: 'DURAND Paul' }, 'v1', AUTEUR)).toMatchObject({ ok: true });
    h.fiche.mockClear();
    expect(await modifierFicheMonEspace(5, 1, { nom: 'X' }, 'v1', AUTEUR)).toMatchObject({ ok: false, statut: 403 });
    expect(h.fiche).not.toHaveBeenCalled();
    h.admin = true;
    expect(await modifierFicheMonEspace(5, 1, { nom: 'X' }, 'v1', AUTEUR)).toMatchObject({ ok: true });
    h.fiche.mockResolvedValue({ etat: 'conflit', motif: 'Un collègue vient de modifier cette fiche.' });
    expect(await modifierFicheMonEspace(5, 1, { nom: 'X' }, 'v0', AUTEUR)).toMatchObject({ ok: false, statut: 409 });
    expect(await modifierFicheMonEspace(5, 999, {}, null, AUTEUR)).toMatchObject({ ok: false, statut: 404 });
  });
});
