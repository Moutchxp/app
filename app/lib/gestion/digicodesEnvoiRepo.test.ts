import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 6) — l'écran des destinataires et l'envoi : le changement d'abord (refusé : rien ne part), puis UN
 * mail par personne, rangé dans l'historique du bien, du locataire et du propriétaire. 🔒 Base et transport simulés : rien n'est écrit ni envoyé.
 */
const h = vi.hoisted(() => ({ avec479: true, avec484: true, planif: { ok: true } as Record<string, unknown>, envois: [] as { a: string[]; cc?: string[]; sorte: string; o: Record<string, unknown>; texte?: string; objet?: string }[],
  occ: [] as Record<string, unknown>[], pro: [] as Record<string, unknown>[], locs: [] as Record<string, unknown>[], nomCopro: null as string | null, echecs: new Set<string>() }));
vi.mock('../db/client', () => ({ query: async (sql: string) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes("pg_get_constraintdef(oid) LIKE '%digicode_locataire%'")) return { rows: [{ ok: h.avec479 }] };
  if (s.includes("pg_get_constraintdef(oid) LIKE '%digicode_gestion%'")) return { rows: [{ ok: h.avec484 }] };
  if (s.includes('FROM gestion_annuaire_occupation o WHERE o.lot_id')) return { rows: h.occ };
  if (s.includes('FROM gestion_annuaire_lot WHERE id = ANY')) return { rows: h.pro };
  if (s.includes('annexe_id::text AS id FROM gestion_lot_annexe')) return { rows: [] };
  return { rows: [] };
} }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('./config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('../location/mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', nom: 'Arnaud' }) }));
vi.mock('../location/mailsPreavisSortieRepo', () => ({
  signatureEcran: async () => ({ brute: '', ecran: { html: '', texte: '' } }),
  locatairesAvis: async () => h.locs,
  envoyerSerie: async (mails: { a: string[]; cc: string[]; sorte: string; objet: string; texte?: string }[], _b: string, o: Record<string, unknown>) => {
    for (const m of mails) h.envois.push({ a: m.a, cc: m.cc, sorte: m.sorte, o, texte: m.texte, objet: m.objet });
    return mails.map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: [], envoye: !m.a.some((x) => h.echecs.has(x)), motif: m.a.some((x) => h.echecs.has(x)) ? 'refusé par le serveur' : null }));
  },
}));
vi.mock('./coproprieteRepo', () => ({ ficheCopropriete: async () => ({ cle: '1 rue essai', nom: h.nomCopro, adresses: [{ cle: '1 rue essai', libelle: '1 rue Essai' }] }) }));
vi.mock('./coproprieteEcritureRepo', () => ({ gesteDigicodeCopro: async () => h.planif }));
vi.mock('./digicodesRepo', () => ({
  digicodesUnifiesDisponibles: async () => true,
  chargerAnciens: async () => ({ lotsBruts: [
    { id: 1, numero: 'W1', immeuble: '1 rue Essai', adresse: '1 rue Essai', batiment: 'A', batimentLieCle: 'a' },
    { id: 2, numero: 'W2', immeuble: '1 rue Essai', adresse: '1 rue Essai', batiment: 'B', batimentLieCle: 'b' },
    { id: 3, numero: 'W3', immeuble: '9 rue Ailleurs', adresse: '9 rue Ailleurs', batiment: null, batimentLieCle: null }] }),
  adresseCleDuBien: (l: { immeuble: string }) => l.immeuble.toLowerCase(),
  batimentCleDuBien: (l: { batimentLieCle: string | null }) => l.batimentLieCle ?? '',
  // 🔴 (Arno, 17/11/2026) le code en vigueur AUJOURD'HUI de chaque place : l'« ancien » du mail à la Gestion
  digicodesDesAdresses: async () => [{ adresseCle: '1 rue essai', commun: { code: { valeur: { digicode: true, code: 'OLD0' } } },
    batiments: [{ cle: 'a', code: { valeur: { digicode: true, code: 'A111' } } }, { cle: 'b', code: { valeur: { digicode: true, code: 'B222' } } }] }],
  digicodesDuBien: async (id: number) => ({ batiment: { libelle: id === 1 ? 'A' : 'B' }, commun: { valeur: { digicode: true, code: 'OLD0' } }, codeBatiment: { valeur: { digicode: true, code: id === 1 ? 'A111' : 'B222' } } }),
}));
import { apercuChangement, planifierEtPrevenir } from './digicodesEnvoiRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const CORPS = { immeuble: '1 rue essai', adresseCle: '1 rue essai', appliqueLe: '2026-11-20T08:00:00.000Z', changements: [{ batiment: 'A', digicode: true, code: 'A999' }] };
beforeEach(() => {
  h.avec479 = true; h.avec484 = true; h.planif = { ok: true }; h.envois = []; h.nomCopro = null; h.echecs = new Set();
  h.occ = [{ id: '11', lot: '1', locataire: '21', depart: null }, { id: '12', lot: '1', locataire: '22', depart: null }, { id: '13', lot: '2', locataire: '23', depart: '2026-11-01' }];
  h.locs = [{ occupationId: 11, nom: 'MARTIN', prenom: 'Léa', emails: ['lea@exemple.test'] }, { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: ['paul@exemple.test'] },
    { occupationId: 13, nom: 'DURAND', prenom: 'Zoé', emails: ['zoe@exemple.test'] }];
  h.pro = [{ lot: '1', id: '31', nom: 'PROPRIO', prenom: 'Jean', emails: ['jean@exemple.test'] }];
});

describe('l’écran des destinataires (lecture seule)', () => {
  it('seul le bâtiment A change : seuls SES logements, à cette adresse ; une ligne par logement (les deux colocataires ensemble) ; ses codes : le nouveau A, le commun en vigueur', async () => {
    const r = await apercuChangement(CORPS);
    if (!r.ok) throw new Error(r.motif);
    expect(r.data.logements.map((l) => [l.lotId, l.batiment, l.locataires.map((x) => x.prenom)])).toEqual([[1, 'A', ['Léa', 'Paul']]]);
    expect(r.data.logements[0].codes).toMatchObject({ commun: { digicode: true, code: 'OLD0' }, batiment: { digicode: true, code: 'A999' }, communChange: false, batimentChange: true });
    expect(r.data.logements[0].codes).not.toHaveProperty('communLe'); // le commun ne change pas : pas de date à lui
  });
  it('le commun change : toute l’adresse ; un locataire parti plus de 7 jours avant : exclu avec la raison', async () => {
    const r = await apercuChangement({ ...CORPS, changements: [{ batiment: null, digicode: true, code: 'N3W0' }] });
    if (!r.ok) throw new Error(r.motif);
    expect(r.data.logements.map((l) => l.lotId)).toEqual([1, 2]);
    expect(r.data.logements[1].locataires[0]).toMatchObject({ prenom: 'Zoé', inclus: false, raison: 'parti le 01/11' });
  });
});

describe('enregistrer, puis prévenir', () => {
  it('un mail PAR PERSONNE, à elle seule ; rangé dans l’historique du bien et du locataire ; propriétaires seulement si cochés (un mail, ses logements, son historique)', async () => {
    const r = await planifierEtPrevenir({ ...CORPS, proprietaires: false }, AUTEUR);
    expect(r.ok && r.data.envois.map((e) => [e.pour, e.a])).toEqual([['Léa MARTIN', ['lea@exemple.test']], ['Paul MARTIN', ['paul@exemple.test']]]);
    expect(h.envois.filter((e) => e.sorte !== 'digicode_gestion').map((e) => [e.sorte, e.o.lotId, e.o.occupationIds])).toEqual([['digicode_locataire', 1, [11]], ['digicode_locataire', 1, [12]]]);
    h.envois = [];
    await planifierEtPrevenir({ ...CORPS, proprietaires: true }, AUTEUR);
    expect(h.envois.filter((e) => e.sorte !== 'digicode_gestion').at(-1)).toMatchObject({ sorte: 'digicode_proprietaire', a: ['jean@exemple.test'], o: { lotId: 1, proprietaireIds: [31] } });
  });
  it('🔴 le changement refusé : RIEN ne part ; sans la 479 : rien n’est enregistré ni envoyé', async () => {
    h.planif = { ok: false, motif: 'Un changement est déjà prévu …' };
    expect(await planifierEtPrevenir(CORPS, AUTEUR)).toEqual({ ok: false, motif: 'Un changement est déjà prévu …' });
    expect(h.envois).toEqual([]);
    h.avec479 = false; h.planif = { ok: true };
    expect((await planifierEtPrevenir(CORPS, AUTEUR)).ok).toBe(false);
    expect(h.envois).toEqual([]);
  });
});

describe('🔴🔴 Arno (17/11/2026) — UN MAIL PAR DESTINATAIRE, verrouillé', () => {
  it('une personne à DEUX adresses : DEUX mails, chacun à UNE adresse, sans copie, chacun avec le verrou `uneSeuleAdresse` ; le propriétaire aussi', async () => {
    h.locs[0] = { ...h.locs[0], emails: ['lea@exemple.test', 'lea.pro@exemple.test'] };
    h.pro = [{ lot: '1', id: '31', nom: 'PROPRIO', prenom: 'Jean', emails: ['jean@exemple.test', 'jean2@exemple.test'] }];
    const r = await planifierEtPrevenir({ ...CORPS, proprietaires: true }, AUTEUR);
    expect(r.ok && r.data.envois.map((e) => [e.pour, e.a])).toEqual([['Léa MARTIN', ['lea@exemple.test']], ['Léa MARTIN', ['lea.pro@exemple.test']],
      ['Paul MARTIN', ['paul@exemple.test']], ['Jean PROPRIO', ['jean@exemple.test']], ['Jean PROPRIO', ['jean2@exemple.test']]]);
    expect(h.envois.filter((e) => e.sorte !== 'digicode_gestion').every((e) => e.a.length === 1 && (e.cc ?? []).length === 0 && e.o.uneSeuleAdresse === true)).toBe(true);
  });
});

/** 🔴🔴 Arno (17/11/2026) : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » : un mail interne à gestion@criterimmo.fr (adresse prise dans les préférences existantes, rien en dur) […] Aucun mail aux locataires. B. « Écrire maintenant aux locataires » […] Seuls les locataires cochés reçoivent un mail […]. Ensuite, un mail à la Gestion l'informe que les locataires listés ont été prévenus. Chaque mail reste rangé dans l'historique du bien et de la personne. » */
describe('🔴🔴 les deux choix', () => {
  it('A : AUCUN mail aux locataires ; UN mail à la Gestion (adresse des préférences), la date et les logements concernés avec leurs locataires ; rangé dans l’historique du logement', async () => {
    const r = await planifierEtPrevenir({ ...CORPS, mode: 'gestion', proprietaires: true }, AUTEUR);
    expect(h.envois.map((e) => [e.sorte, e.a])).toEqual([['digicode_gestion', ['gestion@exemple.test']]]);
    expect(h.envois[0].o).toMatchObject({ lotId: 1, occupationIds: [] });
    // 🔴 (Arno, 17/11/2026) CE QU'IL DISAIT : « [À prévenir] Changement des digicodes … » ; désormais l'ALERTE
    expect(h.envois[0].objet).toBe('[ALERTE] Digicode modifié sans que les locataires aient été prévenus — 1 rue Essai');
    expect(h.envois[0].texte).toContain('AUCUN mail n’a été envoyé aux locataires');
    expect(h.envois[0].texte).toContain('Léa MARTIN (lea@exemple.test) — NON PRÉVENU');
    expect(r.ok && [r.data.mode, r.data.envois.length, r.data.gestion?.envoye]).toEqual(['gestion', 0, true]);
  });
  it('B : un locataire DÉCOCHÉ ne reçoit rien ; les cochés reçoivent le leur ; puis la Gestion : prévenus / décochés', async () => {
    const r = await planifierEtPrevenir({ ...CORPS, mode: 'locataires', decoches: [12] }, AUTEUR);
    expect(h.envois.map((e) => [e.sorte, e.a])).toEqual([['digicode_locataire', ['lea@exemple.test']], ['digicode_gestion', ['gestion@exemple.test']]]);
    const g = h.envois[1];
    // 🔴 (Arno, 17/11/2026) CE QU'IL DISAIT : « [Locataires prévenus] … » ; un locataire décoché : l'ALERTE, en objet et en tête
    expect(g.objet).toBe('[ALERTE] Digicode modifié : 1 locataire non prévenu — 1 rue Essai');
    expect(g.texte).toContain('Léa MARTIN (lea@exemple.test) — prévenu par mail');
    expect(g.texte).toContain('Paul MARTIN (paul@exemple.test) — NON PRÉVENU (décoché)');
    expect(r.ok && r.data.nonCoches).toEqual(['Paul MARTIN']);
  });
  it('🔴 (Arno, 17/11/2026) B, tous les locataires concernés prévenus : le mail d’INFORMATION, APRÈS les leurs ; le nom de la copropriété, ancien → nouveau', async () => {
    h.nomCopro = 'Résidence _TEST GESTION DIGICODE';
    await planifierEtPrevenir({ ...CORPS, mode: 'locataires' }, AUTEUR);
    expect(h.envois.map((e) => e.sorte)).toEqual(['digicode_locataire', 'digicode_locataire', 'digicode_gestion']);
    const g = h.envois[2];
    expect(g.objet).toBe('[Information] Digicodes mis à jour — Résidence _TEST GESTION DIGICODE — 1 rue Essai — à compter du 20/11/2026 à 09:00');
    expect(g.texte).toContain('tous les locataires concernés ont été prévenus par des mails individuels.');
    expect(g.texte).toContain('Digicode du bâtiment A : A111 → A999, à partir du 20/11/2026 à 09:00');
  });
  it('🔴 (Arno, 17/11/2026) B, un mail en ÉCHEC D’ENVOI : le locataire n’est pas prévenu — le mail d’ALERTE le dit, avec la raison', async () => {
    h.echecs = new Set(['paul@exemple.test']);
    const r = await planifierEtPrevenir({ ...CORPS, mode: 'locataires' }, AUTEUR);
    const g = h.envois.find((e) => e.sorte === 'digicode_gestion')!;
    expect(g.objet).toBe('[ALERTE] Digicode modifié : 1 locataire non prévenu — 1 rue Essai');
    expect(g.texte).toContain('Paul MARTIN (paul@exemple.test) — NON PRÉVENU (échec d’envoi)');
    expect(g.texte).toContain('Léa MARTIN (lea@exemple.test) — prévenu par mail');
    expect(r.ok && r.data.envois.map((e) => [e.pour, e.envoye])).toEqual([['Léa MARTIN', true], ['Paul MARTIN', false]]);
  });
  it('sans la 484 : rien n’est enregistré ni envoyé', async () => {
    h.avec484 = false;
    expect(await planifierEtPrevenir({ ...CORPS, mode: 'gestion' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 484') });
    expect(h.envois).toEqual([]);
  });
});
