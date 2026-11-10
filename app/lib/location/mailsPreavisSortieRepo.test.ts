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
/** 🔴 461 — la copropriété saisie sur le bien (null : non renseignée). */
let copro: boolean | null = null;

vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    // Le statut du bien (et, 461, sa copropriété saisie) — par le SENS de la requête, pas sa forme exacte.
    if (s.includes('FROM gestion_annuaire_lot lo WHERE lo.id')) return { rows: [{ s: enGestion ? 'en_gestion' : 'location_seule', c: copro }] };
    if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l')) {
      const ids = (params[0] as number[]).map(Number);
      return { rows: [
        { occupation_id: '11', nom: 'BERNARD Alice', prenom: null, entree: '2022-09-01', sortie: null, emails: ['alice@exemple.test'] },
        { occupation_id: '12', nom: 'MARTIN', prenom: 'Paul', entree: '2022-09-01', sortie: null, emails: emailsPaul },
      ].filter((r) => ids.includes(Number(r.occupation_id))) };
    }
    if (s.includes('::text AS j')) return { rows: [{ j: '2026-11-05' }] };
    // L'auteur du compte rendu interne (le même que l'envoi, `auteurDuMail`).
    if (s.includes('FROM admin_utilisateur WHERE actif')) return { rows: [{ identifiant: 'collegue@exemple.test' }] };
    if (s.includes('FROM admin_utilisateur WHERE id')) return { rows: [{ identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arno', nom: 'Jorel' }] };
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
    entree: '2022-09-01', locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'MARTIN', entree: '2022-09-01' }],
    annexes: [], autresOccupants: [] }),
}));

const enregistrerPreavis = vi.fn();
vi.mock('./preavisRepo', () => ({ enregistrerPreavis: (...a: unknown[]) => enregistrerPreavis(...a) }));

const { apercuMailsSortie, envoyerMailsSortie, envoyerMailSortieLocataires, destinatairesPourInfo, apercuMailsPreavis, envoyerMailsPreavis, envoyerMailSortieAdhoc, enregistrerPreavisAvecMails, mailsAvisDuBien, partenairesDeSortie } = await import('./mailsPreavisSortieRepo');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
const envoyes: MessageAEnvoyer[] = [];
const deps = {
  transport: { envoyer: async (m: MessageAEnvoyer) => { envoyes.push(m); return { ok: true as const, id: null, factice: true }; } },
  signatureBrute: async () => '',
};
const DEMANDE = { occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois' as const, duree: 1 as const } };
const journalAvis = () => ecritures.filter((e) => e.sql.includes('INSERT INTO gestion_location_mail_avis'));
/** 🔴 Arno (10/11/2026, confidentialité) — gestion@ + la personne qui valide : la COPIE INTERNE (mail à part), jamais plus en copie visible. */
const INTERNE = ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com'];

beforeEach(() => { copro = null; enGestion = true; avec457 = true; emailsPaul = ['paul@exemple.test']; ecritures.length = 0; envoyes.length = 0; listes = { preavis: [ADHOC], sortie: [ADHOC] }; });

describe('l’aperçu : lecture seule', () => {
  it('sélection multiple : 🔴 un accusé PAR locataire, la copie interne, puis le mail aux partenaires — sans rien envoyer ni écrire', async () => {
    const r = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.mails.map((m) => [m.sorte, m.a, m.cc])).toEqual([
      ['preavis_locataires', ['alice@exemple.test'], []],
      ['preavis_locataires', ['paul@exemple.test'], []],
      ['preavis_locataires', INTERNE, []],
      ['preavis_adhoc', ['gestion.criterimmo@gmail.com'], INTERNE],
    ]);
    // Aucune adresse d'un autre client dans l'accusé d'un locataire.
    expect(r.data.mails[0].texte).not.toContain('paul@exemple.test');
    expect(r.data.mails[1].texte).not.toContain('alice@exemple.test');
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
  it('🔴 un accusé PAR locataire (seul destinataire, aucune copie), la copie interne à part, puis les partenaires — chacun journalisé (auteur, texte tel qu’il part)', async () => {
    const r = await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    expect(envoyes.map((m) => [m.de, m.a, m.cc, m.cci, m.objet])).toEqual([
      ['gestion@criterimmo.fr', ['alice@exemple.test'], [], [], 'Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux'],
      ['gestion@criterimmo.fr', ['paul@exemple.test'], [], [], 'Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux'],
      ['gestion@criterimmo.fr', INTERNE, [], [], '[Copie interne] Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux'],
      ['gestion@criterimmo.fr', ['gestion.criterimmo@gmail.com'], INTERNE, [],
        '[Information] Préavis reçu — 4 rue Fictive, 92800 Puteaux — Alice BERNARD et Paul MARTIN'],
    ]);
    expect(envoyes[0].corps.startsWith('Bonjour Alice BERNARD,')).toBe(true);
    expect(envoyes[1].corps.startsWith('Bonjour Paul MARTIN,')).toBe(true);
    for (const [k, autre] of [[0, /paul|MARTIN/i], [1, /alice|BERNARD/i]] as const) expect(`${envoyes[k].corps} ${envoyes[k].corpsHtml ?? ''}`).not.toMatch(autre);
    // Le mail aux partenaires : la copie du PREMIER accusé, et « envoyé à chacun des 2 locataires ».
    expect(envoyes[3].corps).toContain('envoyé à chacun des 2 locataires, séparément et à son nom');
    const j = journalAvis();
    expect(j.map((e) => [e.params[0], e.params[1], e.params[2], e.params[9], e.params[13]])).toEqual([
      ['preavis_locataires', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
      ['preavis_locataires', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
      ['preavis_locataires', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
      ['preavis_adhoc', 7, [11, 12], 'envoye', 'a.jorel@sansvisavis.com'],
    ]);
    expect(j[0].params[7]).toBe(envoyes[0].corps);
    // 🔴 Arno (05/11/2026) — la mention du compte qui valide : dans chaque mail parti ET dans la copie enregistrée pour l'historique du bien.
    for (const k of [0, 1, 2, 3]) {
      expect(envoyes[k].corps).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
      expect(j[k].params[7]).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
      expect(j[k].params[8]).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
    }
    // Et une ligne au journal du bien pour chacun.
    expect(ecritures.filter((e) => e.sql.includes('INSERT INTO gestion_journal')).map((e) => e.params[1])).toEqual([
      'location_mail_preavis_locataires', 'location_mail_preavis_locataires', 'location_mail_preavis_locataires', 'location_mail_preavis_adhoc']);
  });

  it('un colocataire décoché : seul l’autre reçoit l’accusé', async () => {
    await envoyerMailsPreavis({ ...DEMANDE, occupationIds: [11] }, AUTEUR, deps);
    expect(envoyes[0].a).toEqual(['alice@exemple.test']);
    expect(envoyes[0].corps.startsWith('Bonjour Alice BERNARD,')).toBe(true);
  });

  it('🔴 bien HORS gestion : l’accusé seul, aucun mail à ADHOC', async () => {
    enGestion = false;
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test'], ['paul@exemple.test'], INTERNE]);
  });

  it('un échec d’envoi est journalisé « echec » et rendu, sans lever', async () => {
    const r = await envoyerMailsPreavis(DEMANDE, AUTEUR, { ...deps, transport: { envoyer: async () => ({ ok: false as const, motif: 'Gmail injoignable' }) } });
    expect(r.etat === 'ok' && r.envois.map((e) => [e.envoye, e.motif])).toEqual(Array.from({ length: 4 }, () => [false, 'Gmail injoignable']));
    expect(journalAvis().map((e) => [e.params[9], e.params[10]])).toEqual(Array.from({ length: 4 }, () => ['echec', 'Gmail injoignable']));
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
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test'], ['paul@exemple.test'], INTERNE, ['gestion.criterimmo@gmail.com']]);
    expect(r.etat).toBe('ok');
    expect(r.mails?.etat === 'ok' && r.mails.envois.map((e) => e.envoye)).toEqual([true, true, true, true]);
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
    expect(envoyes).toHaveLength(4); // un accusé par locataire, la copie interne, + UN mail partenaires
  });
  it('préavis, case DÉCOCHÉE : aucun mail partenaire ; l’accusé aux locataires part toujours', async () => {
    await envoyerMailsPreavis(DEMANDE, AUTEUR, deps, false);
    expect(envoyes.map((m) => m.a)).toEqual([['alice@exemple.test'], ['paul@exemple.test'], INTERNE]);
  });
  it('préavis, liste VIDE : aucun mail partenaire ; l’aperçu n’annonce aucune case (liste vide)', async () => {
    listes = { preavis: [], sortie: [] };
    const a = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
    expect(a.etat === 'ok' && [a.data.partenaires, a.data.mails.map((m) => m.sorte)]).toEqual([[], ['preavis_locataires', 'preavis_locataires', 'preavis_locataires']]);
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
  it('bien en gestion : le mail de départ aux locataires sortants, le compte rendu interne, le mail aux partenaires ; copropriété et bien dits ; rien n’est écrit ni envoyé', async () => {
    listes = { preavis: [], sortie: [ADHOC] };
    const r = await apercuMailsSortie(11, AUTEUR, { sortants: [11], date: '2026-11-04' });
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data).toMatchObject({ enGestion: true, copropriete: null, lotId: 7, sansEmail: [] });
    expect(r.data.mails.map((m) => [m.sorte, m.objet, m.a, m.cc])).toEqual([
      ['sortie_locataires', 'Votre départ du logement — 4 rue Fictive, 92800 Puteaux', ['alice@exemple.test'], []],
      ['sortie_locataires', '[Copie interne] Votre départ du logement — 4 rue Fictive, 92800 Puteaux', INTERNE, []],
      ['sortie_interne', 'Sortie de locataire — 4 rue Fictive, 92800 Puteaux', ['a.jorel@sansvisavis.com', 'collegue@exemple.test'], []],
      ['sortie_adhoc', '[Information] Sortie de locataire(s) — 4 rue Fictive, 92800 Puteaux', ['gestion.criterimmo@gmail.com'], ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']],
    ]);
    expect(r.data.mails[0].texte).toContain('effectif le 04/11/2026, date de la remise des clés');
    expect(ecritures).toEqual([]);
    expect(envoyes).toEqual([]);
  });
  it('bien HORS gestion : le mail de départ et le compte rendu interne, pas de partenaires', async () => {
    enGestion = false;
    const r = await apercuMailsSortie(11, AUTEUR, { sortants: [11], date: '2026-11-04' });
    expect(r.etat === 'ok' ? r.data.mails.map((m) => m.sorte) : null).toEqual(['sortie_locataires', 'sortie_locataires', 'sortie_interne']);
  });
  it('un sortant SANS e-mail : signalé ; le mail part aux autres', async () => {
    emailsPaul = [];
    const r = await apercuMailsSortie(11, AUTEUR, { sortants: [11, 12], date: '2026-11-04' });
    expect(r.etat === 'ok' ? r.data.sansEmail : null).toEqual(['Paul MARTIN']);
    expect(r.etat === 'ok' ? r.data.mails[0].a : null).toEqual(['alice@exemple.test']);
  });
});

describe('🔴 Arno (06/11/2026, 461) — la copropriété SAISIE sur le bien décide du paragraphe de 20 %', () => {
  for (const [c, attendu] of [[true, 'Enfin, le logement étant situé dans un immeuble en copropriété'], [false, null], [null, 'Si le logement est situé dans un immeuble en copropriété']] as const) {
    it(`accusé de préavis — copropriété ${c === null ? 'non renseignée' : c ? 'oui' : 'non'}`, async () => {
      copro = c;
      const r = await apercuMailsPreavis(DEMANDE, AUTEUR, deps);
      expect(r.etat).toBe('ok');
      if (r.etat !== 'ok') return;
      expect(r.data.copropriete).toBe(c);
      const t = r.data.mails[0].texte;
      if (attendu === null) expect(t).not.toContain('20 %'); else expect(t).toContain(attendu);
    });
  }
});

describe('🔴 Arno (06/11/2026) — l’ENVOI du mail de départ aux locataires', () => {
  const FAITE_L = { bail: { lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux' }, date: '2026-11-04', sortants: [{ occupationId: 11, nom: 'BERNARD Alice' }, { occupationId: 12, nom: 'MARTIN' }],
    occupationIds: [11, 12], vacant: true, restants: [], annexes: [] } as never;
  it('🔴 un mail PAR sortant (seul destinataire, aucune copie, aucune adresse d’un autre client), puis la copie interne ; journalisés pour le bien', async () => {
    copro = true;
    const r = await envoyerMailSortieLocataires(FAITE_L, AUTEUR, deps);
    expect(r.etat).toBe('ok');
    const objet = 'Votre départ du logement — 4 rue Fictive, 92800 Puteaux';
    expect(envoyes.map((m) => [m.objet, m.a, m.cc, m.cci])).toEqual([[objet, ['alice@exemple.test'], [], []], [objet, ['paul@exemple.test'], [], []],
      [`[Copie interne] ${objet}`, INTERNE, [], []]]);
    expect(`${envoyes[0].corps} ${envoyes[0].corpsHtml ?? ''}`).not.toMatch(/paul|MARTIN/i);
    expect(`${envoyes[1].corps} ${envoyes[1].corpsHtml ?? ''}`).not.toMatch(/alice|BERNARD/i);
    expect(envoyes[0].corps).toContain('Le logement étant situé dans un immeuble en copropriété');
    expect(envoyes[0].corps).not.toContain('Enfin, le logement');
    expect(envoyes[0].corps).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
    expect(journalAvis().map((e) => e.params[0])).toEqual(['sortie_locataires', 'sortie_locataires', 'sortie_locataires']);
  });
  it('aucun sortant avec une adresse : rien ne part', async () => {
    emailsPaul = [];
    const r = await envoyerMailSortieLocataires({ ...(FAITE_L as object), sortants: [{ occupationId: 12, nom: 'MARTIN' }] } as never, AUTEUR, deps);
    expect(r).toEqual({ etat: 'ok', envois: [] });
    expect(envoyes).toEqual([]);
  });
});

describe('🔴 Arno (06/11/2026) — le texte du RÉCAPITULATIF est EXACTEMENT celui qui part (même code serveur, comparaison au caractère près)', () => {
  it('préavis : l’accusé ET le mail aux partenaires (avec la copie complète de l’accusé), mention et signature comprises', async () => {
    const d2 = { ...deps, signatureBrute: async () => '<div>Service Gestion<br>CRITERIMMO</div>' };
    const ap = await apercuMailsPreavis(DEMANDE, AUTEUR, d2);
    expect(ap.etat).toBe('ok');
    if (ap.etat !== 'ok') return;
    await envoyerMailsPreavis(DEMANDE, AUTEUR, d2);
    expect(ap.data.mails.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_locataires', 'preavis_locataires', 'preavis_adhoc']);
    expect(envoyes.map((m) => m.corps)).toEqual(ap.data.mails.map((m) => m.texte));
    expect(ap.data.mails[3].texte).toContain(ap.data.mails[0].texte);   // la copie complète du premier accusé
    expect(ap.data.mails[3].texte).not.toContain(ap.data.mails[1].texte);
    expect(ap.data.mails[0].texte).toContain('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)');
    expect(ap.data.mails[0].texte).toContain('Service Gestion');
  });
  it('sortie : le mail de départ, le compte rendu interne ET le mail aux partenaires — chacun identique à l’envoi', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    try {
      const d2 = { ...deps, signatureBrute: async () => '<div>Service Gestion</div>' };
      listes = { preavis: [], sortie: [ADHOC] };
      const ap = await apercuMailsSortie(11, AUTEUR, { sortants: [11, 12], date: '2026-11-04' }, d2);
      expect(ap.etat).toBe('ok');
      if (ap.etat !== 'ok') return;
      const texte = (sorte: string) => ap.data.mails.find((m) => m.sorte === sorte)?.texte;
      const departs = ap.data.mails.filter((m) => m.sorte === 'sortie_locataires').map((m) => m.texte);
      const { lireBail, sortiePrevue, notifierSortie } = await import('./sortieLocatairesRepo');
      const f = { ...sortiePrevue((await lireBail(11))!, [11, 12], '2026-11-04') };
      await envoyerMailsSortie(f as never, AUTEUR, { ...d2, maintenant: new Date() }, true);
      expect(departs).toHaveLength(3); // Alice, Paul, la copie interne
      expect(envoyes.map((m) => m.corps)).toEqual([...departs, texte('sortie_adhoc')]);
      // 🔴 la copie COMPLÈTE du PREMIER mail de départ, après notre signature, dans le mail aux partenaires ; et « chacun des 2 locataires »
      expect(texte('sortie_adhoc')).toContain(`---------- Copie du mail envoyé aux locataires ----------\nDe : gestion@criterimmo.fr\nÀ : alice@exemple.test\nObjet : Votre départ du logement — 4 rue Fictive, 92800 Puteaux\n\n${departs[0]}`);
      expect(texte('sortie_adhoc')).toContain('Le mail de départ a été envoyé à chacun des 2 locataires');
      const interne: string[] = [];
      await notifierSortie(f as never, AUTEUR, { transport: { envoyer: async (m: MessageAEnvoyer) => { interne.push(m.corps); return { ok: true as const, id: null, factice: true }; } },
        maintenant: new Date() });
      expect(interne).toEqual([texte('sortie_interne')]);
      for (const k of ['sortie_locataires', 'sortie_interne', 'sortie_adhoc']) expect((texte(k) ?? '').length).toBeGreaterThan(100);
    } finally { vi.useRealTimers(); }
  });
});

describe('🔴 Arno (06/11/2026) — sortie SANS mail de départ (aucun sortant avec une adresse) : pas de copie, une ligne le dit', () => {
  it('récapitulatif et envoi identiques ; la ligne « aucun mail de départ » ; aucune copie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    try {
      emailsPaul = [];
      listes = { preavis: [], sortie: [ADHOC] };
      const d2 = { ...deps, signatureBrute: async () => '' };
      const ap = await apercuMailsSortie(11, AUTEUR, { sortants: [12], date: '2026-11-04' }, d2);
      if (ap.etat !== 'ok') throw new Error('aperçu');
      expect(ap.data.mails.map((m) => m.sorte)).toEqual(['sortie_interne', 'sortie_adhoc']);
      const adhoc = ap.data.mails.find((m) => m.sorte === 'sortie_adhoc')!.texte!;
      expect(adhoc).toContain('Aucun des locataires n’a d’adresse e-mail connue : le mail de départ ne leur a pas été envoyé par mail.');
      expect(adhoc).not.toContain('Copie du mail envoyé aux locataires');
      const { lireBail, sortiePrevue } = await import('./sortieLocatairesRepo');
      const f = sortiePrevue((await lireBail(11))!, [12], '2026-11-04');
      await envoyerMailsSortie(f as never, AUTEUR, { ...d2, maintenant: new Date() }, true);
      expect(envoyes.map((m) => m.corps)).toEqual([adhoc]);
    } finally { vi.useRealTimers(); }
  });
});
