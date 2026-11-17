import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (11/11/2026, lot 4) — « Valider l'état des lieux de sortie », le serveur : refus AVANT toute écriture, un mail par destinataire, historiques. */
const h = vi.hoisted(() => ({
  query: vi.fn(), enregistrerSortie: vi.fn(), envoyerSerie: vi.fn(), sans467: false,
  copro: false as boolean | null, piecesLues: { ok: true, pieces: [] } as unknown, metas: [] as unknown[],
}));
vi.mock('./piecesSortieRepo', () => ({
  MOTIF_SANS_468: 'sans 468', piecesSortieDisponibles: async () => true,
  metaPieces: async () => h.metas, piecesPourEnvoi: async () => h.piecesLues,
}));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
// 🔴 (16/11/2026, 475) l'historique des AG de la copropriété : absent par défaut (les épreuves d'avant inchangées)
const ag = vi.hoisted(() => ({ dispo: false, copro: null as { id: number; libelle: string; cle: string } | null, entrees: [] as unknown[], ajouts: [] as unknown[][], creees: [] as string[] }));
vi.mock('./agCoproprieteRepo', () => ({
  historiqueAgDisponible: async () => ag.dispo,
  entreesAgDuLot: async () => ({ contexte: { lotId: 7, immeuble: { cle: '4 rue fictive', libelle: '4 rue Fictive' }, copropriete: ag.copro,
    adresse: { libelle: '4 rue Fictive', codePostal: null, commune: null, normalisee: null }, coproprieteSaisie: null }, entrees: ag.entrees }),
  coproprietesPourLot: async () => [{ id: 7, libelle: 'Résidence Fictive', cle: 'residence fictive' }],
  ajouterEntreesAg: async (...a: unknown[]) => { ag.ajouts.push(a); return 0; },
  rattacherLotACopropriete: async (_q: unknown, _c: unknown, id: number) => ({ ok: true, copropriete: { id, libelle: 'Résidence Fictive', cle: 'residence fictive' } }),
  creerCoproprietePourLot: async (_q: unknown, _c: unknown, nom: string) => { ag.creees.push(nom); return { ok: true, copropriete: { id: 99, libelle: nom, cle: 'x' } }; },
}));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'arno@exemple.test', nom: 'Arno Test' }) }));
vi.mock('./mailNouvelleLocationRepo', () => ({ lireDestinatairesDefaut: async () => [] }));
vi.mock('./mailsPreavisSortieRepo', () => ({
  MOTIF_SANS_457: 'sans 457', mailsAvisDisponibles: async () => true, proprietairesDuMailDisponible: async () => !h.sans467,
  signatureEcran: async () => ({ brute: '', ecran: { html: '', texte: '' } }), envoyerSerie: h.envoyerSerie,
  logementDe: async () => ({ lotId: 7, adresse: '4 rue Fictive', proprietaire: 'DUPONT Jean', enGestion: false, copropriete: h.copro }),
}));
const BAIL = { lotId: 7, adresse: '4 rue Fictive', locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' }], annexes: [] };
vi.mock('./sortieLocatairesRepo', () => ({
  lireBail: async () => BAIL, enregistrerSortie: h.enregistrerSortie, donneesMailSortie: () => ({}),
  sortiePrevue: (b: typeof BAIL, s: number[], date: string) => ({ bail: b, date, sortants: b.locataires.filter((l) => s.includes(l.occupationId)), occupationIds: s, vacant: s.length === 2, restants: [], annexes: [] }),
  encartDuBail: async () => ({ lotId: 7, proprietaire: { id: 5, nom: 'DUPONT Jean' }, coordonnees: {
    proprietaire: null,
    proprietaires: [{ id: 5, nom: 'DUPONT Jean', telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] }],
    locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: [], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] }] } }),
}));
import { apercuValidationSortie, MOTIF_SANS_467, validerSortieEdls } from './validationSortieRepo';

const AUTEUR = { id: 1, libelle: 'Arno Test' };
const DEMANDE = { occupationId: 11, realise: true, date: '2026-11-10', sortants: [11, 12], compteRendu: 'Logement rendu propre.', destinataires: ['loc-11', 'pro-5', 'pro-99'], informerPartenaires: true };
beforeEach(() => {
  h.sans467 = false; h.copro = false; h.metas = []; h.piecesLues = { ok: true, pieces: [] };
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
    const r = await validerSortieEdls({ ...DEMANDE, pieceIds: [1, 2], retenue: true, paragrapheRetenue: 'Provision de 20 % conservée.' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { retenue: true } });
    const mails = h.envoyerSerie.mock.calls.map(([m]) => m[0] as { sorte: string; texte: string; pieces?: { nom: string; octets?: Uint8Array }[] });
    expect(mails.map((m) => [m.sorte, (m.pieces ?? []).map((p) => [p.nom, p.octets?.length])])).toEqual([
      ['sortie_edls_locataire', [['edl.pdf', 3], ['salon.jpg', 3]]], ['sortie_edls_proprietaire', [['edl.pdf', 3], ['salon.jpg', 3]]], ['sortie_edls_interne', [['edl.pdf', 3], ['salon.jpg', 3]]]]);
    expect(mails[0].texte).toContain('Provision de 20 % conservée.');
    expect(mails[1].texte).toContain('Une provision de 20 % du dépôt de garantie est conservée jusqu’à l’approbation des comptes de la copropriété.');
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
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true }, AUTEUR)).toMatchObject({ etat: 'refus', motif: 'Retenue impossible : le bien n’est pas en copropriété (article 22).' });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    h.copro = null;
    expect((await validerSortieEdls({ ...DEMANDE, retenue: true }, AUTEUR)).etat).toBe('ok');
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
    ag.dispo = true; ag.copro = { id: 7, libelle: 'Résidence Fictive', cle: 'residence fictive' }; ag.entrees = []; ag.ajouts = []; ag.creees = []; h.copro = true;
    h.query.mockImplementation(async (sql: string) => (sql.includes('AS j') ? { rows: [{ j: '2026-11-11' }] } : sql.includes('RETURNING id') ? { rows: [{ id: '41' }] } : { rows: [] }));
  });
  it('dernière AG vide, ou prochaine sans statut : REFUS avant toute écriture (champ « ag ») ; sans la 475 : rien n’est demandé', async () => {
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, ag: { ...AG, derniere: '' } }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'ag', motif: 'Renseignez la date de la dernière AGO connue (assemblée générale ordinaire).' });
    expect(await validerSortieEdls({ ...DEMANDE, retenue: true, ag: { ...AG, statut: null } }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'ag' });
    expect(h.enregistrerSortie).not.toHaveBeenCalled();
    ag.dispo = false;
    expect((await validerSortieEdls({ ...DEMANDE, retenue: true }, AUTEUR)).etat).toBe('ok');
    // case 20 % décochée : aucune date demandée
    ag.dispo = true;
    expect((await apercuValidationSortie({ ...DEMANDE, retenue: false }, AUTEUR)).etat).toBe('ok');
  });
  it('l’aperçu dit les deux dates avec leur statut et la copropriété ; la phrase des propriétaires porte la mention si elle est choisie', async () => {
    const r = await apercuValidationSortie({ ...DEMANDE, retenue: true, ag: AG, mentionAg: true }, AUTEUR);
    if (r.etat !== 'ok') throw new Error(r.etat);
    expect(r.data.ag).toEqual({ lignes: [['Dernière AGO (assemblée générale ordinaire)', '12/03/2026'], ['Prochaine AGO', '12/03/2027 (date projetée)']], copropriete: 'Résidence Fictive', aRattacher: false });
    expect(r.data.mails.find((m) => m.famille === 'proprietaire')!.texte).toContain('prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
    expect(r.data.mails.find((m) => m.famille === 'interne')!.texte).toContain('Prochaine AGO : 12/03/2027 (date projetée)');
    expect(ag.ajouts).toEqual([]); // l'aperçu n'écrit rien
  });
  it('la confirmation : APRÈS la sortie, la dernière AG et la PROJETÉE rangées sur la copropriété avec le numéro de la sortie', async () => {
    const r = await validerSortieEdls({ ...DEMANDE, retenue: true, ag: AG }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { ag: { copropriete: 'Résidence Fictive', aRattacher: false, motif: null } } });
    expect(ag.ajouts).toHaveLength(1);
    const [, cible, entrees, origine] = ag.ajouts[0];
    expect(cible).toEqual({ coproprieteId: 7, cle: '4 rue fictive', lotId: 7, sortieId: 41 });
    expect(entrees).toEqual([{ type: 'derniere', statut: 'officielle', date: '2026-03-12', confirmation: false }, { type: 'prochaine', statut: 'projetee', date: '2027-03-12', confirmation: false }]);
    expect(origine).toBe('sortie');
    expect(h.enregistrerSortie.mock.invocationCallOrder[0]).toBeLessThan(h.envoyerSerie.mock.invocationCallOrder[0]);
  });
  it('un bien sans copropriété : créée (nom + adresse) puis les dates dessus ; sans choix : gardées avec la sortie, « à rattacher » ; « immeuble en copropriété » coché', async () => {
    ag.copro = null; h.copro = null;
    const r = await validerSortieEdls({ ...DEMANDE, retenue: true, ag: AG, coproprieteChoix: { creer: 'Résidence Neuve' }, coproprieteOui: true }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { ag: { copropriete: 'Résidence Neuve', aRattacher: false } } });
    expect(ag.creees).toEqual(['Résidence Neuve']);
    expect((ag.ajouts[0][1] as { coproprieteId: number }).coproprieteId).toBe(99);
    expect(h.query.mock.calls.some(([sql]) => String(sql).includes('SET copropriete = true WHERE id = $1 AND copropriete IS NULL'))).toBe(true);
    ag.ajouts = [];
    const r2 = await validerSortieEdls({ ...DEMANDE, retenue: true, ag: AG }, AUTEUR);
    expect(r2).toMatchObject({ etat: 'ok', data: { ag: { copropriete: null, aRattacher: true } } });
    expect(ag.ajouts[0][1]).toEqual({ coproprieteId: null, cle: '4 rue fictive', lotId: 7, sortieId: 41 });
  });
});
