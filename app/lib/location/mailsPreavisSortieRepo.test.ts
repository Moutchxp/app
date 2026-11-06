import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageAEnvoyer } from '../gestion/envoiGmail';

/**
 * ══ LOCATION — LES MAILS DU PRÉAVIS ET DE LA SORTIE, CÔTÉ ENVOI (Arno, 05/11/2026) ════════════════════════════════════════
 * Base simulée, transport FACTICE injecté : rien ne part, rien ne s'écrit. On éprouve QUI reçoit quoi, en copie, ce qui est
 * journalisé, et les cas « hors gestion », « sans e-mail », « sans la migration 457 ».
 */
let enGestion = true;
let avec457 = true;
let emailsPaul: string[] = ['paul@exemple.test'];
// 🔴 Arno (05/11/2026, 460) — les listes « Préavis » / « Sorties » de « Paramètres Location » (simulées ; l'amorce de la 460 : ADHOC).
const ADHOC = { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' };
let listes: Record<string, { adresse: string; libelle: string }[]> = { preavis: [ADHOC], sortie: [ADHOC] };
vi.mock('./mailNouvelleLocationRepo', () => ({ lireDestinatairesDefaut: async (sorte: string) => listes[sorte] ?? [] }));
const ecritures: { sql: string; params: unknown[] }[] = [];

vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('AS s FROM gestion_annuaire_lot')) return { rows: [{ s: enGestion ? 'en_gestion' : 'location_seule' }] };
    if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l')) {
      const ids = (params[0] as number[]).map(Number);
      return { rows: [
        { occupation_id: '11', nom: 'BERNARD Alice', prenom: null, entree: '2022-09-01', sortie: null, emails: ['alice@exemple.test'] },
        { occupation_id: '12', nom: 'MARTIN', prenom: 'Paul', entree: '2022-09-01', sortie: null, emails: emailsPaul },
      ].filter((r) => ids.includes(Number(r.occupation_id))) };
    }
    if (s.includes('::text AS j')) return { rows: [{ j: '2026-11-05' }] };
    if (s.startsWith('INSERT')) { ecritures.push({ sql: s, params }); return { rows: [], rowCount: 1 }; }
    throw new Error(`requête inattendue : ${s.slice(0, 80)}`);
  }),
  withTransaction: vi.fn(), closePool: vi.fn(),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (t: string) => (t === 'gestion_location_mail_avis' ? avec457 : true) }));
vi.mock('../gestion/statutBienRepo', () => ({ sqlStatutBien: async () => 'lo.statut_bien' }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));
// 🔴 Arno (05/11/2026) — le compte connecté (session), lu côté serveur : prénom et nom séparés pour « Mail envoyé par … ».
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', nom: 'Arno Jorel', prenom: 'Arno', nomFamille: 'Jorel' }) }));
vi.mock('./sortieLocatairesRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sortieLocatairesRepo')>()),
  destinatairesSortie: async (e: string | null) => [...(e === null ? [] : [e]), 'collegue@exemple.test'],
  lireBail: async () => ({ lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean',
    entree: '2022-09-01', locataires: [], annexes: [], autresOccupants: [] }),
}));

const enregistrerPreavis = vi.fn();
vi.mock('./preavisRepo', () => ({ enregistrerPreavis: (...a: unknown[]) => enregistrerPreavis(...a) }));

const { apercuMailsSortie, destinatairesPourInfo, apercuMailsPreavis, envoyerMailsPreavis, envoyerMailSortieAdhoc, enregistrerPreavisAvecMails, mailsAvisDuBien, partenairesDeSortie } = await import('./mailsPreavisSortieRepo');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
const envoyes: MessageAEnvoyer[] = [];
const deps = {
  transport: { envoyer: async (m: MessageAEnvoyer) => { envoyes.push(m); return { ok: true as const, id: null, factice: true }; } },
  signatureBrute: async () => '',
};
const DEMANDE = { occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois' as const, duree: 1 as const } };
const journalAvis = () => ecritures.filter((e) => e.sql.includes('INSERT INTO gestion_location_mail_avis'));

beforeEach(() => { enGestion = true; avec457 = true; emailsPaul = ['paul@exemple.test']; ecritures.length = 0; envoyes.length = 0; listes = { preavis: [ADHOC], sortie: [ADHOC] }; });

describe('l’aperçu : lecture seule', () => {
  it('sélection multiple : les deux mails, sans rien envoyer ni écrire', async () => {
    const r = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.mails.map((m) => [m.sorte, m.a, m.cc])).toEqual([
      ['preavis_locataires', ['alice@exemple.test', 'paul@exemple.test'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']],
      ['preavis_adhoc', ['gestion.criterimmo@gmail.com'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']],
    ]);
    expect(r.data.dateFin).toBe('2026-12-04');
    expect(r.data.sansEmail).toEqual([]);
    // 🔴 Arno (05/11/2026) — l'aperçu montre la mention, comme le mail qui partira.
    expect(r.data.mails.every((m) => m.texte.includes('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)'))).toBe(true);
    expect(envoyes).toEqual([]);
    expect(ecritures).toEqual([]);
  });

  it('un locataire sans e-mail : signalé, pas bloquant', async () => {
    emailsPaul = [];
    const r = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat === 'ok' && r.data.sansEmail).toEqual(['Paul MARTIN']);
    expect(r.etat === 'ok' && r.data.mails[0].a).toEqual(['alice@exemple.test']);
  });

  it('une saisie invalide est refusée avec le même motif que le préavis', async () => {
    expect(await apercuMailsPreavis({ ...DEMANDE, recuLe: '' }, AUTEUR, deps)).toEqual({ etat: 'refus', motif: 'Saisissez la date de réception du recommandé' });
    expect(await apercuMailsPreavis({ ...DEMANDE, occupationIds: [] }, AUTEUR, deps)).toEqual({ etat: 'refus', motif: 'Cochez au moins un locataire.' });
  });
});

describe('l’envoi du préavis', () => {
  it('deux mails, dans l’ordre, de gestion@ : destinataires et copies ; chacun journalisé (auteur, texte tel qu’il part)', async () => {
    const r = await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    expect(envoyes.map((m) => [m.de, m.a, m.cc, m.objet])).toEqual([
      ['gestion@criterimmo.fr', ['alice@exemple.test', 'paul@exemple.test'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com'],
        'Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux'],
      ['gestion@criterimmo.fr', ['gestion.criterimmo@gmail.com'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com'],
        '[Information] Préavis reçu — 4 rue Fictive, 92800 Puteaux — Alice BERNARD et Paul MARTIN'],
    ]);
    const j = journalAvis();
    expect(j.map((e) => [e.params[0], e.params[1], e.params[2], e.params[9], e.params[13]])).toEqual([
      ['preavis_locataires', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
      ['preavis_adhoc', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
    ]);
    expect(j[0].params[7]).toBe(envoyes[0].corps);
    // 🔴 Arno (05/11/2026) — la mention du compte qui valide : dans chaque mail parti ET dans la copie enregistrée pour l'historique du bien.
    for (const k of [0, 1]) {
      expect(envoyes[k].corps).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
      expect(j[k].params[7]).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
      expect(j[k].params[8]).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
    }
    // Et une ligne au journal du bien pour chacun.
    expect(ecritures.filter((e) => e.sql.includes('INSERT INTO gestion_journal')).map((e) => e.params[1])).toEqual([
      'location_mail_preavis_locataires', 'location_mail_preavis_adhoc']);
  });

  it('un colocataire décoché : seul l’autre reçoit l’accusé', async () => {
    await envoyerMailsPreavis({ ...DEMANDE, occupationIds: [11] }, AUTEUR, deps);
    expect(envoyes[0].a).toEqual(['alice@exemple.test']);
    expect(envoyes[0].corps.startsWith('Bonjour Alice BERNARD,')).toBe(true);
  });

  it('🔴 bien HORS gestion : l’accusé seul, aucun mail à ADHOC', async () => {
    enGestion = false;
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test', 'paul@exemple.test']]);
  });

  it('un échec d’envoi est journalisé « echec » et rendu, sans lever', async () => {
    const r = await envoyerMailsPreavis(DEMANDE, AUTEUR, { ...deps, transport: { envoyer: async () => ({ ok: false as const, motif: 'Gmail injoignable' }) } });
    expect(r.etat === 'ok' && r.envois.map((e) => [e.envoye, e.motif])).toEqual([[false, 'Gmail injoignable'], [false, 'Gmail injoignable']]);
    expect(journalAvis().map((e) => [e.params[9], e.params[10]])).toEqual([['echec', 'Gmail injoignable'], ['echec', 'Gmail injoignable']]);
  });

  it('sans la migration 457 : aucun mail ne part, et la raison est dite', async () => {
    avec457 = false;
    const r = await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat).toBe('sans_schema');
    expect(envoyes).toEqual([]);
  });
});

describe('l’information ADHOC de la sortie', () => {
  const FAITE = {
    bail: { lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
      locataires: [], annexes: [], autresOccupants: [] },
    date: '2026-11-04', sortants: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }], occupationIds: [11],
    vacant: false, restants: ['MARTIN Paul'], annexes: [],
  };

  it('À = ADHOC, Cc = gestion@ + la personne qui valide ; journalisé', async () => {
    const r = await envoyerMailSortieAdhoc(FAITE, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    expect(envoyes.map((m) => [m.a, m.cc, m.objet])).toEqual([[['gestion.criterimmo@gmail.com'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com'],
      '[Information] Sortie de locataire(s) — 4 rue Fictive, 92800 Puteaux']]);
    expect(envoyes[0].corps).toContain('Le logement reste loué à Paul MARTIN.');
    expect(journalAvis().map((e) => e.params[0])).toEqual(['sortie_adhoc']);
  });

  it('🔴 bien HORS gestion : rien', async () => {
    enGestion = false;
    expect(await envoyerMailSortieAdhoc(FAITE, AUTEUR, deps)).toEqual({ etat: 'ok', envois: [] });
    expect(envoyes).toEqual([]);
  });
});

describe('🔴 Arno (05/11/2026) — LA porte commune à toutes les entrées : `enregistrerPreavisAvecMails`', () => {
  beforeEach(() => { enregistrerPreavis.mockReset(); });

  it('le préavis D’ABORD, les mails ENSUITE (accusé puis ADHOC), leur issue est rendue', async () => {
    enregistrerPreavis.mockImplementation(async () => { expect(envoyes).toEqual([]); return { etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } }; });
    const r = await enregistrerPreavisAvecMails({ ...DEMANDE, motif: null }, AUTEUR, true, deps);
    expect(enregistrerPreavis).toHaveBeenCalledWith({ ...DEMANDE, motif: null }, AUTEUR);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test', 'paul@exemple.test'], ['gestion.criterimmo@gmail.com']]);
    expect(r.etat).toBe('ok');
    expect(r.mails?.etat === 'ok' && r.mails.envois.map((e) => e.envoye)).toEqual([true, true]);
  });

  it('un préavis refusé : aucun mail ; sans « Valider et envoyer » : le préavis seul, aucun mail', async () => {
    enregistrerPreavis.mockResolvedValue({ etat: 'refus', motif: 'Déjà en préavis' });
    expect(await enregistrerPreavisAvecMails(DEMANDE, AUTEUR, true, deps)).toEqual({ etat: 'refus', motif: 'Déjà en préavis' });
    enregistrerPreavis.mockResolvedValue({ etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } });
    expect(await enregistrerPreavisAvecMails(DEMANDE, AUTEUR, false, deps)).toEqual({ etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } });
    expect(envoyes).toEqual([]);
  });
});

describe('🔴 Arno (05/11/2026) — le mail ADHOC entre dans l’historique du BIEN ; l’adresse d’ADHOC n’est rattachée à AUCUN bien', () => {
  it('l’envoi n’écrit QUE son journal et la ligne du journal du bien : ni contact, ni rattachement, ni occupation pour ADHOC', async () => {
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    const tables = ecritures.map((e) => /INSERT INTO (\w+)/.exec(e.sql)?.[1]);
    expect(new Set(tables)).toEqual(new Set(['gestion_location_mail_avis', 'gestion_journal']));
    expect(ecritures.some((e) => /(INSERT INTO|UPDATE)\s+(gestion_annuaire_contact|gestion_annuaire_occupation|gestion_rattachement\w*|gestion_partenaire_interne|gestion_lien\w*)\b/.test(e.sql))).toBe(false);
    // Le mail ADHOC est rangé sous le BIEN (lot 7), pas sous une adresse.
    const adhoc = journalAvis().find((e) => e.params[0] === 'preavis_adhoc')!;
    expect(adhoc.params[1]).toBe(7);
    expect(adhoc.params[4]).toEqual(['gestion.criterimmo@gmail.com']);
  });

  it('l’historique du bien lit ces mails PAR LE BIEN (`lot_id`), jamais par une adresse', async () => {
    const { query } = await import('../db/client');
    const q = query as unknown as ReturnType<typeof vi.fn>;
    q.mockImplementationOnce(async (sql: string, params: unknown[]) => {
      const s = sql.replace(/\s+/g, ' ');
      expect(s).toContain('FROM gestion_location_mail_avis WHERE lot_id = $1');
      expect(s).not.toMatch(/destinataires\s*@>|ANY\(destinataires|gestion_annuaire_contact/);
      expect(params).toEqual([7]);
      return { rows: [{ id: '3', sorte: 'preavis_adhoc', quand: '2026-11-05', par: 'x', a: ['gestion.criterimmo@gmail.com'], cc: [], objet: 'o', texte: 't', statut: 'envoye' }] };
    });
    expect((await mailsAvisDuBien(7)).map((m) => [m.id, m.sorte])).toEqual([[3, 'preavis_adhoc']]);
  });

  it('l’adresse d’ADHOC (amorce de la 460) est celle du PARTENAIRE de la Gestion, jamais « nous » ni un client', async () => {
    const { ADRESSES_INTERNES } = await import('../gestion/adresseInterne');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('db/migrations/460_location_destinataires_preavis_sortie.sql', 'utf8')).toContain('"adresse": "gestion.criterimmo@gmail.com", "libelle": "ADHOC"');
    expect(ADRESSES_INTERNES).toContain(ADHOC.adresse);
  });
});

describe('🔴 Arno (05/11/2026, 460) — « Informer nos partenaires » : la liste configurée, la case', () => {
  it('préavis, case cochée : un seul mail aux partenaires, À = la liste DANS L’ORDRE, Cc = gestion@ + la personne qui valide', async () => {
    listes = { preavis: [{ adresse: 'laura@monga.io', libelle: 'MONGA' }, ADHOC], sortie: [] };
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps, true);
    const p = envoyes.find((m) => m.a.includes('laura@monga.io'))!;
    expect(p.a).toEqual(['laura@monga.io', 'gestion.criterimmo@gmail.com']);
    expect(p.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
    expect(envoyes).toHaveLength(2); // l'accusé aux locataires + UN mail partenaires
  });
  it('préavis, case DÉCOCHÉE : aucun mail partenaire ; l’accusé aux locataires part toujours', async () => {
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps, false);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test', 'paul@exemple.test']]);
  });
  it('préavis, liste VIDE : aucun mail partenaire ; l’aperçu n’annonce aucune case (liste vide)', async () => {
    listes = { preavis: [], sortie: [] };
    const a = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(a.etat === 'ok' && [a.data.partenaires, a.data.mails.map((m) => m.sorte)]).toEqual([[], ['preavis_locataires']]);
  });
  it('préavis, bien HORS gestion : ni partenaires annoncés, ni mail partenaire', async () => {
    enGestion = false;
    const a = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(a.etat === 'ok' && a.data.partenaires).toEqual([]);
  });
  const FAITE = {
    bail: { lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
      locataires: [], annexes: [], autresOccupants: [] },
    date: '2026-11-04', sortants: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }], occupationIds: [11],
    vacant: true, restants: [], annexes: [],
  };
  it('sortie : la liste « Sorties » dans l’ordre ; case décochée ou liste vide : aucun mail', async () => {
    listes = { preavis: [], sortie: [{ adresse: 'b@x.fr', libelle: 'B' }, { adresse: 'a@x.fr', libelle: 'A' }] };
    await envoyerMailSortieAdhoc(FAITE, AUTEUR, deps, true);
    expect(envoyes.map((m) => m.a)).toEqual([['b@x.fr', 'a@x.fr']]);
    envoyes.length = 0;
    await envoyerMailSortieAdhoc(FAITE, AUTEUR, deps, false);
    listes.sortie = [];
    await envoyerMailSortieAdhoc(FAITE, AUTEUR, deps, true);
    expect(envoyes).toEqual([]);
  });
  it('les partenaires de la sortie pour l’écran : la liste si le bien est en gestion, rien sinon', async () => {
    expect(await partenairesDeSortie(11)).toEqual({ enGestion: true, liste: [ADHOC] });
    enGestion = false;
    expect(await partenairesDeSortie(11)).toEqual({ enGestion: false, liste: [] });
  });
});

describe('🔴 Arno (05/11/2026) — le picto « i » : destinataires et copies configurés, par type d’action (lecture seule)', () => {
  it('préavis / sortie : la liste ; en copie gestion@ puis la personne connectée', async () => {
    listes = { preavis: [ADHOC], sortie: [] };
    expect(await destinatairesPourInfo('preavis', AUTEUR)).toEqual({ destinataires: [ADHOC],
      copies: [{ adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion' }, { adresse: 'a.jorel@sansvisavis.com', libelle: 'Vous (Arno Jorel)' }] });
    expect((await destinatairesPourInfo('sortie', AUTEUR)).destinataires).toEqual([]);
    expect(ecritures).toEqual([]);
    expect(envoyes).toEqual([]);
  });
  it('nouvelle location : la liste ; en copie la copie personnelle seule', async () => {
    listes = { nouvelle_location: [{ adresse: 'laura@monga.io', libelle: 'MONGA' }] };
    expect(await destinatairesPourInfo('nouvelle_location', AUTEUR)).toEqual({ destinataires: [{ adresse: 'laura@monga.io', libelle: 'MONGA' }],
      copies: [{ adresse: 'a.jorel@sansvisavis.com', libelle: 'Vous (Arno Jorel) · copie personnelle' }] });
  });
});

describe('🔴 Arno (06/11/2026) — l’aperçu des mails d’une SORTIE (récapitulatif avant « Confirmer ») : lecture seule', () => {
  it('bien en gestion : le compte rendu interne et le mail aux partenaires (liste « Sorties »), avec leurs copies ; rien n’est écrit ni envoyé', async () => {
    listes = { preavis: [], sortie: [ADHOC] };
    const r = await apercuMailsSortie(11, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { enGestion: true, mails: [
      { sorte: 'sortie_interne', objet: 'Sortie de locataire — 4 rue Fictive, 92800 Puteaux', a: ['a.jorel@sansvisavis.com', 'collegue@exemple.test'], cc: [] },
      { sorte: 'sortie_adhoc', objet: '[Information] Sortie de locataire(s) — 4 rue Fictive, 92800 Puteaux', a: ['gestion.criterimmo@gmail.com'], cc: ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com'] },
    ] } });
    expect(ecritures).toEqual([]);
    expect(envoyes).toEqual([]);
  });
  it('bien HORS gestion : le compte rendu interne seulement', async () => {
    enGestion = false;
    const r = await apercuMailsSortie(11, AUTEUR);
    expect(r.etat === 'ok' ? r.data.mails.map((m) => m.sorte) : null).toEqual(['sortie_interne']);
    expect(r.etat === 'ok' ? r.data.enGestion : null).toBe(false);
  });
});
