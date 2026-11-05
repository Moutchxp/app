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
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', nom: 'Arno JOREL' }) }));
vi.mock('./sortieLocatairesRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sortieLocatairesRepo')>()),
  lireBail: async () => ({ lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean',
    entree: '2022-09-01', locataires: [], annexes: [], autresOccupants: [] }),
}));

const { apercuMailsPreavis, envoyerMailsPreavis, envoyerMailSortieAdhoc } = await import('./mailsPreavisSortieRepo');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
const envoyes: MessageAEnvoyer[] = [];
const deps = {
  transport: { envoyer: async (m: MessageAEnvoyer) => { envoyes.push(m); return { ok: true as const, id: null, factice: true }; } },
  signatureBrute: async () => '',
};
const DEMANDE = { occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois' as const, duree: 1 as const } };
const journalAvis = () => ecritures.filter((e) => e.sql.includes('INSERT INTO gestion_location_mail_avis'));

beforeEach(() => { enGestion = true; avec457 = true; emailsPaul = ['paul@exemple.test']; ecritures.length = 0; envoyes.length = 0; });

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
