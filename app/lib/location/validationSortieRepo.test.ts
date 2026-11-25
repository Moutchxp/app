import { texteProprietaire } from './validationSortie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/** 🔴🔴 Arno (11/11/2026, lot 4) — « Valider l'état des lieux de sortie », le serveur : refus AVANT toute écriture, un mail par destinataire, historiques. */
const h = vi.hoisted(() => ({
  query: vi.fn(), enregistrerSortie: vi.fn(), envoyerSerie: vi.fn(), sans467: false,
  copro: false as boolean | null, piecesLues: { ok: true, pieces: [] } as unknown, metas: [] as unknown[],
  // 🔴 (24/11/2026) le bien en gestion et la liste « Sorties » des Paramètres Location : hors gestion et vide par défaut (les épreuves d'avant inchangées)
  enGestion: false, partenaires: [] as { adresse: string; libelle: string }[],
}));
vi.mock('./piecesSortieRepo', () => ({
  MOTIF_SANS_468: 'sans 468', piecesSortieDisponibles: async () => true,
  metaPieces: async () => h.metas, piecesPourEnvoi: async () => h.piecesLues,
}));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
// 🔴 (Arno, 25/11/2026, 22h06) le montant des 20 % : le dépôt connu (centimes) est doublé, l'écriture épiée ; vérification et choix du dépôt : les VRAIS
const montant = vi.hoisted(() => ({ depot: null as number | null, notes: [] as unknown[] }));
vi.mock('./montantVingtRepo', async (orig) => ({ ...(await orig<typeof import('./montantVingtRepo')>()),
  depotsDesOccupations: async (ids: readonly number[]) => new Map(ids.map((i) => [i, montant.depot])),
  montantVingtDisponible: async () => true,
  noterMontantVingt: async (m: unknown) => { montant.notes.push(m); return m; } }));
// 🔴 (16/11/2026, 475) l'historique des AG de la copropriété : absent par défaut (les épreuves d'avant inchangées)
const ag = vi.hoisted(() => ({ dispo: false, copro: null as { id: number; libelle: string; cle: string } | null, entrees: [] as unknown[], ajouts: [] as unknown[][], creees: [] as string[],
  arrete: null as { jour: number; mois: number } | null }));
vi.mock('./agCoproprieteRepo', () => ({
  historiqueAgDisponible: async () => ag.dispo,
  entreesAgDuLot: async () => ({ contexte: { lotId: 7, immeuble: { cle: '4 rue fictive', libelle: '4 rue Fictive' }, copropriete: ag.copro,
    adresse: { libelle: '4 rue Fictive', codePostal: null, commune: null, normalisee: null }, coproprieteSaisie: null }, entrees: ag.entrees }),
  coproprietesPourLot: async () => [{ id: 7, libelle: 'Résidence Fictive', cle: 'residence fictive' }],
  ajouterEntreesAg: async (...a: unknown[]) => { ag.ajouts.push(a); return 0; },
  rattacherLotACopropriete: async (_q: unknown, _c: unknown, id: number) => ({ ok: true, copropriete: { id, libelle: 'Résidence Fictive', cle: 'residence fictive' } }),
  creerCoproprietePourLot: async (_q: unknown, _c: unknown, nom: string) => { ag.creees.push(nom); return { ok: true, copropriete: { id: 99, libelle: nom, cle: 'x' } }; },
}));
vi.mock('./arreteComptesRepo', () => ({ lireArrete: async () => ({ arrete: ag.arrete, par: null, le: null }) }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'arno@exemple.test', nom: 'Arno Test' }) }));
vi.mock('./mailNouvelleLocationRepo', () => ({ lireDestinatairesDefaut: async () => h.partenaires }));
vi.mock('./mailsPreavisSortieRepo', () => ({
  MOTIF_SANS_457: 'sans 457', mailsAvisDisponibles: async () => true, proprietairesDuMailDisponible: async () => !h.sans467,
  signatureEcran: async () => ({ brute: '', ecran: { html: '', texte: '' } }), envoyerSerie: h.envoyerSerie,
  logementDe: async () => ({ lotId: 7, adresse: '4 rue Fictive', proprietaire: 'DUPONT Jean', enGestion: h.enGestion, copropriete: h.copro }),
}));
const BAIL = { lotId: 7, adresse: '4 rue Fictive', locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' }], annexes: [] };
vi.mock('./sortieLocatairesRepo', () => ({
  lireBail: async () => BAIL, enregistrerSortie: h.enregistrerSortie,
  donneesMailSortie: () => ({ adresse: '4 rue Fictive', lotId: 7, type: 'T2', etage: null, porte: null, annexes: [], proprietaire: 'DUPONT Jean',
    sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-10' }], vacant: true, restants: [], auteur: { nom: 'Arno Test', email: 'arno@exemple.test' }, quand: '2026-11-11T10:00:00Z' }),
  sortiePrevue: (b: typeof BAIL, s: number[], date: string) => ({ bail: b, date, sortants: b.locataires.filter((l) => s.includes(l.occupationId)), occupationIds: s, vacant: s.length === 2, restants: [], annexes: [] }),
  encartDuBail: async () => ({ lotId: 7, proprietaire: { id: 5, nom: 'DUPONT Jean' }, coordonnees: {
    proprietaire: null,
    proprietaires: [{ id: 5, nom: 'DUPONT Jean', telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] }],
    locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: [], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] }] } }),
}));
import { apercuValidationSortie, demandeValidationDuCorps, MOTIF_SANS_467, validerSortieEdls } from './validationSortieRepo';

const AUTEUR = { id: 1, libelle: 'Arno Test' };
const DEMANDE = { occupationId: 11, realise: true, date: '2026-11-10', sortants: [11, 12], compteRendu: 'Logement rendu propre.', destinataires: ['loc-11', 'pro-5', 'pro-99'], informerPartenaires: true };
beforeEach(() => {
  h.sans467 = false; h.copro = false; h.metas = []; h.piecesLues = { ok: true, pieces: [] }; h.enGestion = false; h.partenaires = [];
  h.query.mockReset().mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : { rows: [] }));
  h.enregistrerSortie.mockReset().mockResolvedValue({ etat: 'ok', data: { bail: BAIL, date: '2026-11-10', sortants: BAIL.locataires, occupationIds: [11, 12], vacant: true, restants: [], annexes: [] } });
  h.envoyerSerie.mockReset().mockImplementation(async (mails: { sorte: string; objet: string; a: string[]; cc: string[] }[]) => mails.map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, envoye: true, motif: null })));
});

describe('l’aperçu', () => {
  it('lecture seule : rien n’est écrit ni envoyé ; une clé inconnue (pro-99) est ignorée ; locataire, propriétaire, puis copie interne', async () => {
    const r = await apercuValidationSortie(DEMANDE, AUTEUR);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.mails.map((m) => [m.famille, m.a])).toEqual([['locataire', ['alice@exemple.test']], ['proprietaire', ['jean@exemple.test']], ['interne', ['gestion@exemple.test', 'arno@exemple.test']]]);
    expect(r.data.alertes).toEqual([]);
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect(h.envoyerSerie).not.toHaveBeenCalled();
  });
});

describe('la validation', () => {
  it('🔴 coordonnées d’un tiers dans le compte rendu : REFUS, la sortie n’est pas écrite, rien ne part', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, compteRendu: 'Clés remises à M. Dupont (06 11 22 33 44).' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus', champ: 'compteRendu' });
    expect((r as { motif: string }).motif).toContain('Attention : ce texte contient les coordonnées de Jean DUPONT (nom, téléphone).');
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect(h.envoyerSerie).not.toHaveBeenCalled();
  });
  it('date dans le futur, case « réalisé » décochée, sans la 467 : refus, rien n’est écrit', async () => {
    expect(await validerSortieEdls({ ...DEMANDE, date: '2026-11-12' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await validerSortieEdls({ ...DEMANDE, realise: false }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'realise' });
    h.sans467 = true;
    expect(await validerSortieEdls(DEMANDE, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_SANS_467 });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
  });
  it('avec destinataires : la sortie, PUIS un envoi par mail, chacun rangé dans l’historique de SON destinataire (locataire, propriétaire) ; la copie interne dans tous', async () => {
    const r = await validerSortieEdls(DEMANDE, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(h.enregistrerSortie).toHaveBeenCalledWith({ occupationId: 11, sortants: [11, 12], date: '2026-11-10' }, AUTEUR);
    expect(h.enregistrerSortie.mock.invocationCallOrder[0]).toBeLessThan(h.envoyerSerie.mock.invocationCallOrder[0]);
    const appels = h.envoyerSerie.mock.calls.map(([mails, , o]) => ({ sorte: mails[0].sorte, a: mails[0].a, cc: mails[0].cc, occ: o.occupationIds, pro: o.proprietaireIds, lot: o.lotId }));
    expect(appels).toEqual([
      { sorte: 'sortie_edls_locataire', a: ['alice@exemple.test'], cc: [], occ: [11], pro: [], lot: 7 },
      { sorte: 'sortie_edls_proprietaire', a: ['jean@exemple.test'], cc: [], occ: [], pro: [5], lot: 7 },
      { sorte: 'sortie_edls_interne', a: ['gestion@exemple.test', 'arno@exemple.test'], cc: [], occ: [11, 12], pro: [5], lot: 7 },
    ]);
    // Le compte rendu entre au journal du bien.
    expect(h.query.mock.calls.some(([sql, p]) => String(sql).includes('location_edls_realise') && String(p[2]).includes('Logement rendu propre.'))).toBe(true);
  });
  it('sans destinataire : la sortie et la copie interne SEULE', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, destinataires: [] }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(h.envoyerSerie.mock.calls.map(([m]) => m[0].sorte)).toEqual(['sortie_edls_interne']);
  });
});

describe('🔴🔴 Arno (11/11/2026, 468) — pièces jointes et retenue de 20 %, côté serveur', () => {
  const PIECES = [{ id: 1, nom: 'edl.pdf', typeMime: 'application/pdf', taille: 3 }, { id: 2, nom: 'salon.jpg', typeMime: 'image/jpeg', taille: 4 }];
  it('les MÊMES pièces, avec leurs octets, dans CHAQUE mail (locataire, propriétaire, copie interne) ; la sortie validée et la retenue inscrites', async () => {
    h.copro = true; h.metas = PIECES;
    h.piecesLues = { ok: true, pieces: PIECES.map((p) => ({ ...p, octets: new Uint8Array([1, 2, 3]) })) };
    const r = await validerSortieEdls({ ...DEMANDE, pieceIds: [1, 2], retenue: true, montantVingt: '400,00', paragrapheRetenue: 'Provision de 20 % conservée.' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { retenue: true } });
    const mails = h.envoyerSerie.mock.calls.map(([m]) => m[0] as { sorte: string; texte: string; pieces?: { nom: string; octets?: Uint8Array }[] });
    expect(mails.map((m) => [m.sorte, (m.pieces ?? []).map((p) => [p.nom, p.octets?.length])])).toEqual([
      ['sortie_edls_locataire', [['edl.pdf', 3], ['salon.jpg', 3]]], ['sortie_edls_proprietaire', [['edl.pdf', 3], ['salon.jpg', 3]]], ['sortie_edls_interne', [['edl.pdf', 3], ['salon.jpg', 3]]]]);
    expect(mails[0].texte).toContain('Provision de 20 % conservée.');
    // 🔴 Arno (23/11/2026) — la phrase des propriétaires, plus « ronde », avec la référence COMPLÈTE de la loi
    // 🔴 (23/11/2026) deux locataires sortants : « vos locataires » ; sans date (case non cochée) : la demande de la date de l'AGO
    expect(mails[1].texte).toContain(texteProprietaire({ jour: null, statut: null, cloture: null, pluriel: true }));
    expect(mails[1].texte).toContain('loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs');
    const inscrite = h.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO gestion_location_sortie_validee'));
    expect(inscrite?.[1]).toEqual([7, [11, 12], '2026-11-10', true, [1, 2], 1, 'Arno Test']);
  });
  it('aperçu : chaque mail annonce ses pièces ; la retenue décochée n’ajoute rien', async () => {
    h.copro = true; h.metas = PIECES;
    const a = await apercuValidationSortie({ ...DEMANDE, pieceIds: [1, 2], retenue: false }, AUTEUR);
    expect(a.etat === 'ok' && a.data.mails.map((m) => m.pieces)).toEqual([['edl.pdf', 'salon.jpg'], ['edl.pdf', 'salon.jpg'], ['edl.pdf', 'salon.jpg']]);
    expect(a.etat === 'ok' && a.data.mails.filter((m) => m.famille !== 'interne').some((m) => m.texte.includes('20 %'))).toBe(false);
  });
  it('copropriété Non : la retenue est REFUSÉE, rien n’est écrit ; Non renseigné : permise', async () => {
    h.copro = false;
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00' }, AUTEUR)).toMatchObject({ etat: 'refus', motif: 'Retenue impossible : le bien n’est pas en copropriété (article 22).' });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    h.copro = null;
    expect((await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00' }, AUTEUR)).etat).toBe('ok');
  });
  it('une pièce illisible ou d’un autre bail : refus AVANT la sortie, rien n’est écrit ni envoyé', async () => {
    h.copro = true; h.metas = PIECES;
    h.piecesLues = { ok: false, motif: 'La pièce « edl.pdf » est illisible sur le stockage : rien n’est parti.' };
    expect(await validerSortieEdls({ ...DEMANDE, pieceIds: [1, 2] }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'pieces' });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect(h.envoyerSerie).not.toHaveBeenCalled();
    h.metas = [PIECES[0]];
    expect(await apercuValidationSortie({ ...DEMANDE, pieceIds: [1, 99] }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'pieces' });
  });
});

describe('🔴🔴 Arno (16/11/2026, 475) — case 20 % cochée : les dates d’AG de la copropriété', () => {
  const AG = { derniere: '2026-03-12', derniereConfirmee: false, prochaine: '2027-03-12', statut: 'projetee' };
  beforeEach(() => {
    ag.dispo = true; ag.copro = { id: 7, libelle: 'Résidence Fictive', cle: 'residence fictive' }; ag.entrees = []; ag.ajouts = []; ag.creees = []; ag.arrete = null; h.copro = true;
    h.query.mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : sql.includes('RETURNING id') ? { rows: [{ id: '41' }] } : { rows: [] }));
  });
  it('dernière AG vide, ou prochaine sans statut : REFUS avant toute écriture (champ « ag ») ; sans la 475 : rien n’est demandé', async () => {
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: { ...AG, derniere: '' } }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'ag', motif: 'Renseignez la date de la dernière AGO connue (assemblée générale ordinaire).' });
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: { ...AG, statut: null } }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'ag' });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    ag.dispo = false;
    expect((await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00' }, AUTEUR)).etat).toBe('ok');
    // case 20 % décochée : aucune date demandée
    ag.dispo = true;
    expect((await apercuValidationSortie({ ...DEMANDE, retenue: false }, AUTEUR)).etat).toBe('ok');
  });
  it('🔴 (Arno, 17/11/2026) une date PROJETÉE déjà passée : REFUS au serveur avant toute écriture ; une date OFFICIELLE passée reste admise', async () => {
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: { ...AG, derniere: '2015-03-12', prochaine: '2016-03-12', statut: 'projetee' } }, AUTEUR))
      .toMatchObject({ etat: 'refus', champ: 'ag', motif: expect.stringContaining('Une date projetée doit être à venir') });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    expect((await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: { ...AG, derniere: '2015-03-12', prochaine: '2016-03-12', statut: 'officielle' } }, AUTEUR)).etat).toBe('ok');
  });
  // 🔴 Arno (23/11/2026) — le texte des propriétaires, modifiable dans la fenêtre : c'est LUI qui part (ses paragraphes), borné comme celui des locataires
  it('le texte des propriétaires modifié part TEL QUEL dans leur mail (et seulement le leur) ; trop long : refus avant tout', async () => {
    const r = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true, phraseProprietaire: '  Premier paragraphe _TEST.\n\nSecond paragraphe _TEST.  ' }, AUTEUR);
    if (r.etat !== 'ok') throw new Error(r.etat);
    const pro = r.data.mails.find((m) => m.famille === 'proprietaire')!.texte;
    expect(pro).toContain('Premier paragraphe _TEST.\n\nSecond paragraphe _TEST.');
    expect(pro).not.toContain('Le logement étant situé dans un immeuble en copropriété');
    expect(r.data.mails.find((m) => m.famille === 'locataire')!.texte).not.toContain('_TEST.');
    expect(await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG, phraseProprietaire: 'x'.repeat(20_001) }, AUTEUR))
      .toMatchObject({ etat: 'refus', champ: 'retenue', motif: expect.stringContaining('Le texte des propriétaires dépasse') });
  });
  it('l’aperçu dit les deux dates avec leur statut et la copropriété ; la phrase des propriétaires porte la mention si elle est choisie', async () => {
    const r = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true }, AUTEUR);
    if (r.etat !== 'ok') throw new Error(r.etat);
    expect(r.data.ag).toEqual({ lignes: [['Dernière AGO (assemblée générale ordinaire)', '12/03/2026'], ['Prochaine AGO', '12/03/2027 (date projetée)']], copropriete: 'Résidence Fictive', aRattacher: false });
    // 🔴 Arno (23/11/2026) — le propriétaire : la MÊME date que le locataire (l'AGO qui compte ; ici arrêté inconnu → la première après la validation)
    expect(r.data.mails.find((m) => m.famille === 'proprietaire')!.texte).toContain('Ces comptes seront approuvés lors de l’assemblée générale ordinaire attendue vers mars 2027 (date approximative, estimée d’après les précédentes assemblées). Le solde sera ensuite restitué ou ajusté à vos locataires vers avril 2027.');
    expect(r.data.mails.find((m) => m.famille === 'interne')!.texte).toContain('Prochaine AGO : 12/03/2027 (date projetée)');
    expect(ag.ajouts).toEqual([]); // l'aperçu n'écrit rien
  });
  // 🔴🔴 Arno (23/11/2026) — « une date officielle va sur la copropriété (même table, même journal), une date projetée n'est jamais enregistrée »
  it('la confirmation : APRÈS la sortie, la dernière AG (officielle) rangée sur la copropriété ; la PROJETÉE n’est JAMAIS enregistrée', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { ag: { copropriete: 'Résidence Fictive', aRattacher: false, motif: null } } });
    expect(ag.ajouts).toHaveLength(1);
    const [, cible, entrees, origine] = ag.ajouts[0];
    expect(cible).toEqual({ coproprieteId: 7, cle: '4 rue fictive', lotId: 7, sortieId: 41 });
    expect(entrees).toEqual([{ type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false }]);
    expect(origine).toBe('sortie');
    ag.ajouts = [];
    // une prochaine OFFICIELLE saisie, elle, va sur la copropriété
    await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: { ...AG, statut: 'officielle' } }, AUTEUR);
    expect(ag.ajouts[0][2]).toEqual([{ type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false }, { type: 'prochaine', statut: 'officielle', date: '2027-03-12', confirmation: false }]);
    expect(h.enregistrerSortie.mock.invocationCallOrder[0]).toBeLessThan(h.envoyerSerie.mock.invocationCallOrder[0]);
  });
  // 🔴🔴 Arno (23/11/2026) — la sortie ne crée plus de copropriété par un nom tapé : c'est la fiche Copropriété (parcours de la Gestion) qui la crée
  it('un bien sans copropriété : un `{ creer }` (écran plus ancien) est IGNORÉ — rien n’est créé ; « immeuble en copropriété » coché', async () => {
    ag.copro = null; h.copro = null;
    const r = await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG, coproprieteChoix: { creer: 'Résidence Neuve' }, coproprieteOui: true }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { ag: { copropriete: null, aRattacher: true } } });
    expect(ag.creees).toEqual([]);
    expect(h.query.mock.calls.some(([sql]) => String(sql).includes('SET copropriete = true WHERE id = $1 AND copropriete IS NULL'))).toBe(true);
    ag.ajouts = [];
    const r2 = await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG }, AUTEUR);
    expect(r2).toMatchObject({ etat: 'ok', data: { ag: { copropriete: null, aRattacher: true } } });
    // 🔴 Arno (23/11/2026) — « Ne pas rattacher maintenant » : AUCUNE date enregistrée (elles n'ont servi qu'à la phrase du mail)
    expect(ag.ajouts).toEqual([]);
  });
});

/**
 * 🔴🔴 Arno (24/11/2026) — « lorsque l'on coche "Informer nos partenaires", il faut afficher en dessous les différents partenaires possibles à informer
 * et pouvoir les sélectionner individuellement. » Côté serveur : UN mail par partenaire coché, un seul destinataire « À » par mail ; aucun coché =
 * aucun mail partenaire ; seule la liste « Sorties » des Paramètres Location décide (une adresse venue de la requête est ignorée).
 */
describe('🔴🔴 Arno (24/11/2026) — les partenaires, un par un', () => {
  const ADHOC = { adresse: 'adhoc@exemple.test', libelle: 'ADHOC' };
  const MONGA = { adresse: 'monga@exemple.test', libelle: 'MONGA' };
  const partenaires = async (d: Partial<typeof DEMANDE> & { partenaires?: string[] }) => {
    const r = await apercuValidationSortie({ ...DEMANDE, ...d }, AUTEUR);
    if (r.etat !== 'ok') throw new Error('aperçu refusé');
    return r.data.mails.filter((m) => m.famille === 'partenaires').map((m) => ({ a: m.a, cc: m.cc, libelle: m.libelle }));
  };
  beforeEach(() => { h.enGestion = true; h.partenaires = [ADHOC, MONGA]; });

  it('🔴 sans sélection transmise (comme avant) : tous les partenaires — mais UN mail chacun, un seul destinataire « À », nos copies inchangées', async () => {
    expect(await partenaires({})).toEqual([
      { a: ['adhoc@exemple.test'], cc: ['gestion@exemple.test', 'arno@exemple.test'], libelle: 'ADHOC' },
      { a: ['monga@exemple.test'], cc: ['gestion@exemple.test', 'arno@exemple.test'], libelle: 'MONGA' },
    ]);
  });
  it('🔴 sélection individuelle : seul le partenaire coché reçoit SON mail (casse indifférente)', async () => {
    expect((await partenaires({ partenaires: ['MONGA@exemple.test'] })).map((x) => x.a)).toEqual([['monga@exemple.test']]);
  });
  it('🔴🔴 aucun partenaire coché : aucun mail partenaire (les autres mails partent)', async () => {
    expect(await partenaires({ partenaires: [] })).toEqual([]);
    const r = await apercuValidationSortie({ ...DEMANDE, partenaires: [] }, AUTEUR);
    expect(r.etat === 'ok' && r.data.mails.map((m) => m.famille)).toEqual(['locataire', 'proprietaire', 'interne']);
  });
  it('🔴 case principale décochée : aucun mail partenaire, quelle que soit la liste', async () => {
    expect(await partenaires({ informerPartenaires: false, partenaires: ['adhoc@exemple.test'] })).toEqual([]);
  });
  it('🔴🔴 une adresse qui n’est pas dans la liste « Sorties » est IGNORÉE : jamais un destinataire venu de la requête', async () => {
    expect(await partenaires({ partenaires: ['pirate@exemple.test', 'adhoc@exemple.test'] })).toEqual([
      { a: ['adhoc@exemple.test'], cc: ['gestion@exemple.test', 'arno@exemple.test'], libelle: 'ADHOC' }]);
  });
  it('🔴 à la validation : un envoi par partenaire coché, chacun à un seul destinataire', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, partenaires: ['adhoc@exemple.test', 'monga@exemple.test'] }, AUTEUR);
    expect(r.etat).toBe('ok');
    const adhoc = h.envoyerSerie.mock.calls.map(([m]) => m[0]).filter((m) => m.sorte === 'sortie_adhoc');
    expect(adhoc.map((m) => m.a)).toEqual([['adhoc@exemple.test'], ['monga@exemple.test']]);
  });
  it('⚠️ bien hors gestion : aucun mail partenaire, même cochés', async () => {
    h.enGestion = false;
    expect(await partenaires({ partenaires: ['adhoc@exemple.test'] })).toEqual([]);
  });
});

/**
 * 🔴🔴 Arno (24/11/2026, remplace le paragraphe de cf7ecb2f) — le bloc « Retenue de 20 % … : OUI / NON » du mail aux partenaires, juste après
 * « Le logement est désormais vacant. » ; la MÊME AGO qui compte que le locataire ; un seul bloc pour la sortie ; le MÊME texte au récapitulatif
 * et à l'envoi, pour chaque partenaire.
 */
describe('🔴🔴 Arno (24/11/2026) — le bloc « Retenue de 20 % » du mail aux partenaires', () => {
  const AG = { derniere: '2026-03-12', derniereConfirmee: false, prochaine: '2027-03-12', statut: 'projetee' };
  const textesAdhoc = async (d: Record<string, unknown>): Promise<string[]> => {
    const r = await apercuValidationSortie({ ...DEMANDE, ...d }, AUTEUR);
    if (r.etat !== 'ok') throw new Error(JSON.stringify(r));
    return r.data.mails.filter((m) => m.famille === 'partenaires').map((m) => m.texte);
  };
  const texteAdhoc = async (d: Record<string, unknown>): Promise<string> => (await textesAdhoc(d))[0];
  beforeEach(() => {
    h.enGestion = true; h.partenaires = [{ adresse: 'adhoc@exemple.test', libelle: 'ADHOC' }, { adresse: 'monga@exemple.test', libelle: 'MONGA' }];
    ag.dispo = true; ag.copro = { id: 7, libelle: 'Résidence Fictive', cle: 'residence fictive' }; ag.entrees = []; ag.ajouts = []; ag.arrete = null; h.copro = true;
  });

  it('🔴 NON : « … (article 22) : NON », juste après « Le logement est désormais vacant. », et rien d’autre', async () => {
    expect(await texteAdhoc({ retenue: false })).toContain('Le logement est désormais vacant.\n\nRetenue de 20 % du dépôt de garantie (article 22) : NON\n\nCe message est purement informatif');
  });
  it('🔴🔴 OUI projetée, arrêté 31/12, case cochée : le bloc entier, et la MÊME AGO que le locataire (mars 2027)', async () => {
    ag.arrete = { jour: 31, mois: 12 };
    const t = await texteAdhoc({ retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true });
    expect(t).toContain(['Le logement est désormais vacant.', '',
      'Retenue de 20 % du dépôt de garantie (article 22 de la loi n° 89-462 du 6 juillet 1989) : OUI',
      '– Date d’arrêté des comptes de la copropriété : 31/12',
      '– Dernière AGO connue : 12/03/2026',
      '– AGO qui permettra la restitution : vers mars 2027 (date projetée, approximative)',
      '– Restitution au locataire attendue : vers avril 2027', '', 'Ce message est purement informatif'].join('\n'));
    const r = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true }, AUTEUR);
    expect(r.etat === 'ok' && r.data.mails.find((m) => m.famille === 'proprietaire')!.texte).toContain('vers avril 2027');
  });
  it('🔴 OUI officielle : « le 12/03/2027 (date officielle) » et « au plus tard le 12/04/2027 »', async () => {
    ag.arrete = { jour: 31, mois: 12 };
    const t = await texteAdhoc({ retenue: true, montantVingt: '400,00', ag: { ...AG, statut: 'officielle' }, mentionAg: true });
    expect(t).toContain('– AGO qui permettra la restitution : le 12/03/2027 (date officielle)\n– Restitution au locataire attendue : au plus tard le 12/04/2027');
  });
  it('🔴 OUI sans date : case « Indiquer l’AGO » non cochée — la restitution « dans le mois qui suit l’approbation des comptes de l’immeuble »', async () => {
    expect(await texteAdhoc({ retenue: true, montantVingt: '400,00', ag: AG, mentionAg: false })).toContain('– Restitution au locataire attendue : dans le mois qui suit l’approbation des comptes de l’immeuble');
  });
  it('🔴 arrêté MANQUANT : « non renseignée » ; bien SANS copropriété : « aucune copropriété rattachée »', async () => {
    expect(await texteAdhoc({ retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true })).toContain('– Date d’arrêté des comptes de la copropriété : non renseignée\n');
    ag.copro = null; h.copro = null;
    expect(await texteAdhoc({ retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true })).toContain('– Date d’arrêté des comptes de la copropriété : aucune copropriété rattachée\n');
  });
  it('🔴 le MÊME bloc pour chaque partenaire, et le MÊME texte à l’envoi qu’au récapitulatif ; deux locataires sortis : UN bloc', async () => {
    ag.arrete = { jour: 31, mois: 12 };
    const d = { retenue: true, montantVingt: '400,00', ag: AG, mentionAg: true };
    const apercus = await textesAdhoc(d);
    expect(apercus).toHaveLength(2);
    expect(apercus[0]).toBe(apercus[1]);
    expect(apercus[0].match(/Retenue de 20 %/g)).toHaveLength(1);
    await validerSortieEdls({ ...DEMANDE, ...d }, AUTEUR);
    const envoyes = h.envoyerSerie.mock.calls.map(([m]) => m[0]).filter((m) => m.sorte === 'sortie_adhoc').map((m) => (m as { texte: string }).texte);
    expect(envoyes).toEqual(apercus);
  });
});

/** 🔴🔴 Arno (25/11/2026, 22h06) — « ajouter le montant des 20 % retenus en le calculant directement depuis les informations saisies en amont […], sinon
 *  laisser la capacité de le rentrer à la main, et faire suivre cette information tout le long du processus. » */
describe('🔴🔴 le montant des 20 % retenus à la validation de la sortie', () => {
  beforeEach(() => {
    ag.dispo = false; h.copro = null;                                               // copropriété « non renseignée » : retenue permise, pas d'AG exigée
    h.query.mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : sql.includes('RETURNING id') ? { rows: [{ id: '41' }] } : { rows: [] }));
  });
  it('case cochée SANS montant : refus avant toute écriture (champ « montantVingt ») ; case décochée : rien n’est demandé', async () => {
    montant.notes = [];
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantVingt' });
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: 'abc' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantVingt' });
    expect(montant.notes).toEqual([]);
    expect((await validerSortieEdls({ ...DEMANDE, retenue: false }, AUTEUR)).etat).toBe('ok');
    expect(montant.notes).toEqual([]);
  });
  it('dépôt connu (2 000,00 €) et 400,00 € : « calculé » ; 380,00 € : « saisi » ; dépôt inconnu : « saisi » — au récapitulatif, au résultat, ÉCRIT après la sortie', async () => {
    montant.depot = 200000; montant.notes = [];
    const ap = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '400,00' }, AUTEUR);
    expect(ap).toMatchObject({ etat: 'ok', data: { montantVingt: { montant: 400, origine: 'calcule', depot: 2000 } } });
    expect(montant.notes).toEqual([]);                                              // l'aperçu n'écrit rien
    const r = await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: '380' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { montantVingt: { montant: 380, origine: 'saisi', depot: 2000 } } });
    expect(montant.notes.at(-1)).toMatchObject({ montant: 380, depotCentimes: 200000 });
    montant.depot = null;
    const r2 = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '412,50' }, AUTEUR);
    expect(r2).toMatchObject({ etat: 'ok', data: { montantVingt: { montant: 412.5, origine: 'saisi', depot: null } } });
  });
});

/**
 * 🔴🔴 Arno (25/11/2026, 23h12) — PANNE : « je n'arrive pas à valider une sortie de locataire ; j'ai bien instruit le champ des 20 % mais j'ai l'impression
 * qu'il n'en tient pas compte ». La route ne transmettait pas `montantVingt` (ni `phraseProprietaire`) : la demande est désormais construite par
 * `demandeValidationDuCorps`, et CHAQUE champ du type `DemandeValidation` doit en sortir.
 */
describe('🔴🔴 la panne du montant des 20 % (23h12)', () => {
  const CORPS = { action: 'apercu-validation-sortie', occupationId: 7, realise: true, date: '2026-11-25', sortants: [7, '8'], compteRendu: 'RAS', destinataires: ['loc-7', 'pro-3', 'x'],
    informerPartenaires: true, partenaires: ['a@exemple.test'], pieceIds: [1], retenue: true, paragrapheRetenue: 'P', phraseProprietaire: 'Texte modifié _TEST',
    ag: { derniere: '2026-04-23' }, mentionAg: true, coproprieteChoix: null, coproprieteOui: true, montantVingt: '1200' };
  const ids = (b: unknown): number[] => (Array.isArray(b) ? b.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
  it('le montant tapé et le texte modifié des propriétaires sont TRANSMIS au serveur (avant : perdus par la route)', () => {
    const d = demandeValidationDuCorps(CORPS, 7, ids);
    expect(d.montantVingt).toBe('1200');
    expect(d.phraseProprietaire).toBe('Texte modifié _TEST');
    expect(d).toMatchObject({ occupationId: 7, sortants: [7, 8], destinataires: ['loc-7', 'pro-3'], partenaires: ['a@exemple.test'], retenue: true, mentionAg: true, coproprieteOui: true });
  });
  it('GARDE : chaque champ du type DemandeValidation sort de la construction (un champ ajouté au type sans être transmis fait rougir cette épreuve)', () => {
    const src = readFileSync('app/lib/location/validationSortieRepo.ts', 'utf8');
    const corpsType = src.slice(src.indexOf('export interface DemandeValidation {'), src.indexOf('\n}\n', src.indexOf('export interface DemandeValidation {')));
    const champs = [...corpsType.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(champs).toContain('montantVingt');
    expect(Object.keys(demandeValidationDuCorps(CORPS, 7, ids)).sort()).toEqual([...champs].sort());
    // la route passe par elle
    const route = readFileSync('app/(admin)/api/admin/location/route.ts', 'utf8');
    expect(route).toContain('const demande = demandeValidationDuCorps(corps as Record<string, unknown>, occ, idsOccupations);');
  });
  describe('le montant tapé, quelle que soit l’écriture (dépôt inconnu)', () => {
    beforeEach(() => {
      ag.dispo = false; h.copro = null; montant.depot = null; montant.notes = [];
      h.query.mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : sql.includes('RETURNING id') ? { rows: [{ id: '41' }] } : { rows: [] }));
    });
    it.each([['1200', 1200], ['1200,00', 1200], ['1 200,50', 1200.5], ['1200.5', 1200.5], ['1 200 €', 1200], ['1 200,50 €', 1200.5]])('« %s » → %s € au récapitulatif', async (saisi, attendu) => {
      // le chemin de la route : le corps de la fenêtre → la demande → l'aperçu
      const corps = { ...DEMANDE, action: 'apercu-validation-sortie', retenue: true, montantVingt: saisi } as unknown as Record<string, unknown>;
      const r = await apercuValidationSortie(demandeValidationDuCorps(corps, DEMANDE.occupationId, ids), AUTEUR);
      expect(r).toMatchObject({ etat: 'ok', data: { montantVingt: { montant: attendu, origine: 'saisi', depot: null } } });
    });
    it.each([['', 'Saisissez le montant des 20 % retenus'], ['0', 'doit être supérieur à 0'], ['0,00', 'doit être supérieur à 0'], ['-50', 'doit être supérieur à 0'],
      ['12,345', 'illisible'], ['abc', 'illisible']])('« %s » : refus clair, champ « montantVingt », rien n’est écrit', async (saisi, motif) => {
      const r = await validerSortieEdls({ ...DEMANDE, retenue: true, montantVingt: saisi }, AUTEUR);
      expect(r).toMatchObject({ etat: 'refus', champ: 'montantVingt' });
      expect((r as { motif: string }).motif).toContain(motif);
      expect(montant.notes).toEqual([]);
    });
    it('dépôt connu (1 400,00 €) : le montant calculé (280,00) passe, « calculé »', async () => {
      montant.depot = 140000;
      const r = await apercuValidationSortie({ ...DEMANDE, retenue: true, montantVingt: '280,00' }, AUTEUR);
      expect(r).toMatchObject({ etat: 'ok', data: { montantVingt: { montant: 280, origine: 'calcule', depot: 1400 } } });
    });
  });
});
