import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — les biens d'une adresse cliente, par la recherche EXISTANTE
 * (`chercherBiens`) : seules les correspondances PAR L'E-MAIL comptent ; rôle propriétaire / locataire en place /
 * ancien locataire.
 * LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — puis, pour une adresse qui n'est pas un client : l'e-mail
 * rattaché (biens de ses cartes), puis l'immeuble (contact du syndic : copropriétés suivies ; e-mail général : toutes
 * les copropriétés du syndic ; carnet : sa copropriété, adresses secondaires comprises).
 */
const chercherBiens = vi.fn();
vi.mock('./rechercheBienRepo', () => ({ chercherBiens: (...a: unknown[]) => chercherBiens(...a) }));
const cartes = vi.fn();
vi.mock('./partieCategorieRepo', () => ({ biensEtCotesDesContacts: (...a: unknown[]) => cartes(...a) }));
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
/* 🔴 LOT PARTENAIRE-INTERNE-JAMAIS-UNE-CLE — la table des partenaires internes (ADHOC), lue par sa porte existante. */
const partenaires = vi.fn();
vi.mock('./partenaires', () => ({ lirePartenairesInternes: () => partenaires() }));
const { biensDesClients } = await import('./biensDesClientsRepo');

const ligne = (cle: string, raisons: Array<{ sorte: string; detail: string }>, locataires: string[] = []) => ({
  cle, lotId: Number(cle), libelle: `${cle} rue X, 75000 PARIS — lot ${cle}`, adresse: '', adresseVoie: null, commune: null,
  nature: 'Appartement', typeBien: 'Type 2', raisons,
  parties: locataires.map((e) => ({ role: 'locataire', cle: 'L', nom: 'ROI', emails: [{ valeur: e }], telephones: [] })),
});
const lot = (id: number, cle: string, immeuble: string) => ({
  id: String(id), cle, immeuble, adresse: immeuble, code_postal: '92400', commune: 'COURBEVOIE', nature: 'Appartement', type_bien: 'Type 2',
});
const LOTS = [lot(7, '373', '15 rue Carle Hebert'), lot(8, '406', '15 rue Carle Hebert'), lot(176, '219', '25 rue Edith Cavell'),
  lot(49, '58', '155 avenue Paul Vaillant Couturier'), lot(300, '500', '74 rue de Normandie'), lot(301, '501', '1 rue Ailleurs')];
const IMMEUBLE = [
  // arnaud.jorel@gmail.com : contact du syndic (Carle Hebert, Edith Cavell) ET e-mail général (les 3 copropriétés)
  { adresse: 'arnaud.jorel@gmail.com', sorte: 'syndic_contact', nom: 'JOREL Arnaud', copro: '60' },
  { adresse: 'arnaud.jorel@gmail.com', sorte: 'syndic_contact', nom: 'JOREL Arnaud', copro: '7' },
  { adresse: 'arnaud.jorel@gmail.com', sorte: 'syndic', nom: 'TEST ARNAUD', copro: '60' },
  { adresse: 'arnaud.jorel@gmail.com', sorte: 'syndic', nom: 'TEST ARNAUD', copro: '7' },
  { adresse: 'arnaud.jorel@gmail.com', sorte: 'syndic', nom: 'TEST ARNAUD', copro: '26' },
  { adresse: 'gardien@x.fr', sorte: 'immeuble', nom: 'MARTIN Paul', copro: '157' },
  { adresse: 'seul@syndic.fr', sorte: 'syndic_contact', nom: null, copro: '7' },
];
const CLES = [{ copro: '60', cle: '15 rue carle hebert' }, { copro: '7', cle: '25 rue edith cavell' },
  { copro: '26', cle: '155 avenue paul vaillant couturier' }, { copro: '157', cle: '80 rue de normandie' },
  { copro: '157', cle: '74 rue de normandie' }];

beforeEach(() => {
  partenaires.mockReset().mockResolvedValue([{ adresse: 'compta@adhoc.test', libelle: 'Comptabilité (ADHOC Gestion)' }]);
  chercherBiens.mockReset().mockImplementation(async (a: string) => ({ disponible: true, tronque: false, lignes: a === 'p@x.fr'
    ? [ligne('1', [{ sorte: 'email_proprietaire', detail: 'DUPONT Jean' }]), ligne('2', [{ sorte: 'email_proprietaire', detail: 'DUPONT Jean' }]),
      ligne('9', [{ sorte: 'proprietaire', detail: 'P X' }])]                                   // un NOM qui ressemble : ignoré
    : a === 'l@x.fr'
      ? [ligne('3', [{ sorte: 'email_locataire', detail: 'ROI Léa' }], ['l@x.fr']), ligne('4', [{ sorte: 'email_locataire', detail: 'ROI Léa' }])]
      : [] }));
  cartes.mockReset().mockImplementation(async (a: string[]) => new Map(a.includes('assistante@x.fr')
    ? [['assistante@x.fr', [{ lotCle: '219', cote: 'proprietaire' }, { lotCle: '999', cote: 'locataire' }]]]
    /* Le cas d'Arno (26/10/2026) : des cartes de contact existent pour le partenaire interne — reste de la reprise du 04/10. */
    : a.some((x) => x === 'compta@adhoc.test' || x === 'gestion.criterimmo@gmail.com')
      ? a.filter((x) => x === 'compta@adhoc.test' || x === 'gestion.criterimmo@gmail.com').map((x) => [x, [{ lotCle: '219', cote: 'locataire' }]])
      : []));
  query.mockReset().mockImplementation(async (sql: string, p: unknown[]) => {
    if (sql.includes('FROM gestion_annuaire_lot')) return { rows: LOTS };
    if (sql.includes('gestion_syndic_coordonnee')) {
      const voulues = p[0] as string[];
      return { rows: IMMEUBLE.filter((r) => voulues.includes(r.adresse)) };
    }
    if (sql.includes('gestion_copropriete_adresse')) return { rows: CLES.filter((c) => (p[0] as string[]).includes(c.copro)) };
    throw new Error(`requête inattendue : ${sql}`);
  });
});

describe('biensDesClients', () => {
  it('propriétaire de 2 biens ; locataire en place d’un bien et ANCIEN d’un autre ; une adresse inconnue : []', async () => {
    const r = await biensDesClients(['P@x.fr', 'l@x.fr', 'z@x.fr', 'pas-une-adresse']);
    expect(Object.keys(r)).toEqual(['p@x.fr', 'l@x.fr', 'z@x.fr']);
    expect(r['p@x.fr'].map((b) => [b.cle, b.role, b.lotId, b.nom, b.categorie])).toEqual([
      ['1', 'proprietaire', 1, 'DUPONT Jean', 'logement'], ['2', 'proprietaire', 2, 'DUPONT Jean', 'logement']]);
    expect(r['l@x.fr'].map((b) => [b.cle, b.role])).toEqual([['3', 'locataire'], ['4', 'ancien_locataire']]);
    expect(r['z@x.fr']).toEqual([]);
    expect(chercherBiens).toHaveBeenCalledWith('p@x.fr', { limite: 50 });
  });

  it('🔴 contact ET e-mail général du syndic : les biens de ses copropriétés suivies, puis de toutes celles du syndic', async () => {
    const r = await biensDesClients(['arnaud.jorel@gmail.com']);
    expect(r['arnaud.jorel@gmail.com'].map((b) => [b.cle, b.role, b.lotId, b.nom])).toEqual([
      ['373', 'syndic_contact', 7, 'JOREL Arnaud'], ['406', 'syndic_contact', 8, 'JOREL Arnaud'],
      ['219', 'syndic_contact', 176, 'JOREL Arnaud'], ['58', 'syndic', 49, 'TEST ARNAUD']]);
    expect(r['arnaud.jorel@gmail.com'][0].libelle).toBe('15 rue Carle Hebert, 92400 COURBEVOIE — lot 373');
  });

  it('contact du syndic qui ne suit qu’une copropriété à un seul lot : un bien', async () => {
    expect((await biensDesClients(['seul@syndic.fr']))['seul@syndic.fr'].map((b) => b.cle)).toEqual(['219']);
  });

  it('gardien : les biens de sa copropriété, adresses secondaires comprises', async () => {
    expect((await biensDesClients(['gardien@x.fr']))['gardien@x.fr'].map((b) => [b.cle, b.role])).toEqual([['500', 'immeuble']]);
  });

  it('e-mail rattaché à une partie : les biens de ses cartes (un lot absent de l’annuaire est ignoré)', async () => {
    expect((await biensDesClients(['assistante@x.fr']))['assistante@x.fr'].map((b) => [b.cle, b.role])).toEqual([['219', 'rattache']]);
  });

  it('un client garde SES biens : les paliers suivants ne sont pas consultés pour lui', async () => {
    await biensDesClients(['p@x.fr']);
    expect(cartes).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('adresse connue de nulle part (agence, inconnue) : []', async () => {
    expect((await biensDesClients(['a.jorel@sansvisavis.com']))['a.jorel@sansvisavis.com']).toEqual([]);
  });

  it('LECTURE SEULE : aucune requête d’écriture', async () => {
    await biensDesClients(['arnaud.jorel@gmail.com', 'gardien@x.fr', 'assistante@x.fr']);
    for (const [sql] of query.mock.calls) expect(String(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });
});

describe('🔴 LOT PARTENAIRE-INTERNE-JAMAIS-UNE-CLE — le partenaire interne n’amène jamais de bien (R2)', () => {
  it('une carte de contact existe pour lui : il rend quand même [] — ni bien d’office, ni proposition, ni pré-coche', async () => {
    const r = await biensDesClients(['Compta@Adhoc.test', 'gestion.criterimmo@gmail.com']);
    expect(r).toEqual({ 'compta@adhoc.test': [], 'gestion.criterimmo@gmail.com': [] });
    /* Il n'est cherché NULLE PART : ni par l'annuaire, ni par les cartes, ni par l'immeuble. */
    expect(chercherBiens).not.toHaveBeenCalled();
    expect(cartes).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('transparent : avec un locataire extérieur, ce sont les biens du locataire qui comptent, et eux seuls', async () => {
    const r = await biensDesClients(['compta@adhoc.test', 'l@x.fr', 'assistante@x.fr']);
    expect(r['compta@adhoc.test']).toEqual([]);
    expect(r['l@x.fr'].map((b) => b.cle)).toEqual(['3', '4']);
    expect(r['assistante@x.fr'].map((b) => b.cle)).toEqual(['219']);
    expect(cartes).toHaveBeenCalledWith(['assistante@x.fr']);
  });

  it('table des partenaires absente ou vide : notre adresse nommée (gestion.criterimmo@gmail.com) reste écartée', async () => {
    partenaires.mockResolvedValue([]);
    expect((await biensDesClients(['gestion.criterimmo@gmail.com']))['gestion.criterimmo@gmail.com']).toEqual([]);
    expect(cartes).not.toHaveBeenCalled();
  });
});
