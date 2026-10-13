import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT TACHES-AGENDA — LES SCÉNARIOS D'ARNO, de bout en bout, sur une base SIMULÉE et le FAUX Google (aucun appel réel) :
 *   soi-même → tout de suite ; collègue → rien avant acceptation, après acceptation oui, rien si refus ;
 *   décaler, modifier, faite (✓), annulée (suppression), réattribution ; échec de Google → « à resynchroniser » +
 *   reprise ; garde-fou : aucun événement étranger touché ; hors Workspace → pas d'agenda ; réglage coupé → aucun appel.
 * Le SQL réel est éprouvé à part, sur la base de test (`agendaSynchro.itest.ts`).
 */
interface Ligne {
  id: number; etat: string; objet: string; note: string | null; jour: string; heure: string | null; rappels: unknown[];
  duree_minutes: number | null; confiee_a: number; confiee_a_libelle: string; cree_par: number; lot_id: number;
  google_agenda: string | null; google_evenement_id: string | null; synchro_version: number; synchro_essais: number;
  synchro_etat: string; synchro_erreur: string | null; synchro_prochain_essai: number | null;
  confiee_email: string; confiee_actif: boolean; adresse: string; code_postal: string; commune: string; acceptation: string | null;
}
let reglage = true;
const taches = new Map<number, Ligne>();
let journal: unknown[][] = [];
/** Un geste glissé PENDANT une synchronisation (course). */
let pendant: (() => void) | null = null;

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('information_schema')) return { rows: [{ n: 1 }] };
  if (s.includes('SELECT envoi_agenda AS a FROM gestion_tache_reglage')) return { rows: [{ a: reglage }] };
  if (s.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (s.includes('FROM gestion_tache t JOIN gestion_annuaire_lot l')) {
    const ids = (params[0] as number[]).map(Number);
    return { rows: ids.map((i) => taches.get(i)).filter(Boolean).map((t) => ({ ...t, synchro_version: String(t!.synchro_version) })) };
  }
  if (s.includes('FROM gestion_tache_contact') || s.includes('FROM gestion_tache_piece')) return { rows: [] };
  if (s.includes('INSERT INTO gestion_tache_agenda_appel')) { journal.push(params); return { rows: [] }; }
  const t = taches.get(Number(params[0]));
  if (s.includes('SET synchro_version = synchro_version + 1') && t) {
    t.synchro_version += 1; t.synchro_essais = 0; t.synchro_prochain_essai = null;
    if (reglage || t.google_evenement_id !== null) t.synchro_etat = 'a_envoyer';
    return { rows: [] };
  }
  if (s.includes("SET synchro_etat = 'echec', synchro_erreur = $2, synchro_le = now(), synchro_essais = $3") && t) {
    Object.assign(t, { synchro_etat: 'echec', synchro_erreur: params[1], synchro_essais: params[2],
      synchro_prochain_essai: Date.now() + Number(params[3]), google_agenda: params[4], google_evenement_id: params[5] });
    return { rows: [] };
  }
  if (s.includes('SET google_agenda = $2, google_evenement_id = $3') && t) {
    Object.assign(t, { google_agenda: params[1], google_evenement_id: params[2], synchro_erreur: null, synchro_essais: 0,
      synchro_prochain_essai: null, synchro_etat: String(t.synchro_version) === params[3] ? params[4] : 'a_envoyer' });
    return { rows: [] };
  }
  if (s.includes("SELECT id::int AS id FROM gestion_tache WHERE synchro_etat IN ('a_envoyer', 'echec')")) {
    return { rows: [...taches.values()].filter((x) => ['a_envoyer', 'echec'].includes(x.synchro_etat)
      && (x.synchro_prochain_essai === null || x.synchro_prochain_essai <= Date.now())).map((x) => ({ id: x.id })) };
  }
  if (s.startsWith('UPDATE gestion_tache SET synchro_etat = \'echec\'')) throw new Error(`exception inattendue : ${s}`);
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: async () => 'criterimmo.fr,sansvisavis.com' }));

const { synchroniserTache, marquerASynchroniser, reprendreSynchros, complementsAgenda, porteParDefaut, fauxGoogleDesTests } = await import('./agendaSynchroRepo');
const { creerPorteAgenda } = await import('./agendaGoogle');
const { creerFauxGoogle, jetonFactice } = await import('./agendaFauxGoogle');
type Faux = ReturnType<typeof creerFauxGoogle>;

const ARNO = 'a.jorel@sansvisavis.com';
const CLAIRE = 'claire@criterimmo.fr';
const q = (...a: unknown[]) => queryMock(...(a as [string, unknown[]]));

let faux: Faux;
let porte: ReturnType<typeof creerPorteAgenda>;
let etrangersAvant: string;
const etrangers = () => JSON.stringify([ARNO, CLAIRE].map((a) => [...(faux.agendas.get(a)?.entries() ?? [])]
  .filter(([id]) => id.startsWith('etranger'))));

function tache(id: number, o: Partial<Ligne> = {}): Ligne {
  const t: Ligne = {
    id, etat: 'a_faire', objet: '_TEST agenda', note: null, jour: '2026-10-14', heure: null, rappels: [], duree_minutes: null,
    confiee_a: 2, confiee_a_libelle: 'Arnaud Jorel', cree_par: 2, lot_id: 27, google_agenda: null, google_evenement_id: null,
    synchro_version: 0, synchro_essais: 0, synchro_etat: 'non_demandee', synchro_erreur: null, synchro_prochain_essai: null,
    confiee_email: ARNO, confiee_actif: true, adresse: '7 avenue de l’Union', code_postal: '92600', commune: 'Asnières-sur-Seine',
    acceptation: 'acceptee', ...o,
  };
  taches.set(id, t);
  return t;
}
/** Un geste : changer la tâche, la marquer (comme le fait le dépôt dans sa transaction), puis synchroniser (la route). */
async function geste(id: number, changement: Partial<Ligne> = {}) {
  Object.assign(taches.get(id)!, changement);
  await marquerASynchroniser(q as never, id);
  return synchroniserTache(id, { porte, siteUrl: 'https://app.test' });
}
const evenements = (a: string) => [...(faux.agendas.get(a)?.values() ?? [])].filter((e) => !String(e.id).startsWith('etranger'));
const ecritures = () => faux.appels.filter((x) => x.methode !== 'GET');

beforeEach(() => {
  reglage = true; taches.clear(); journal = []; pendant = null;
  faux = creerFauxGoogle();
  const base = creerPorteAgenda({ jeton: jetonFactice, fetch: faux.fetch });
  porte = { ...base, async chercher(a, t) { pendant?.(); return base.chercher(a, t); } };
  // 🔴 Les VRAIS rendez-vous, dans les deux agendas : ils ne doivent JAMAIS bouger.
  faux.semer(ARNO, { summary: 'Dentiste', start: { dateTime: '2026-10-14T10:00:00' } });
  faux.semer(ARNO, { summary: 'Notaire', extendedProperties: { private: { autreApp: 'x' } } });
  faux.semer(CLAIRE, { summary: 'Réunion syndic' });
  etrangersAvant = etrangers();
});

describe('🔴 règle 1 — confiée à soi-même : dans son agenda dès la création', () => {
  it('création → un événement, privé, au bon titre, marqué de la tâche ; rien d’autre ne bouge', async () => {
    tache(41);
    expect(await geste(41)).toMatchObject({ etat: 'ok', place: { sorte: 'present' } });
    const [ev] = evenements(ARNO);
    expect(ev.summary).toBe('Gestion — 7 avenue de l’Union — _TEST agenda');
    expect(ev.visibility).toBe('private');
    expect(ev.start).toEqual({ date: '2026-10-14' });
    expect(taches.get(41)).toMatchObject({ synchro_etat: 'envoyee', google_agenda: ARNO, google_evenement_id: ev.id });
    expect(etrangers()).toBe(etrangersAvant);
  });
  it('décaler / modifier → le MÊME événement est mis à jour ; faite → « ✓ » ; annulée → supprimé', async () => {
    tache(41);
    await geste(41);
    const id = taches.get(41)!.google_evenement_id;
    await geste(41, { jour: '2026-10-15' });
    expect(evenements(ARNO)).toHaveLength(1);
    expect(evenements(ARNO)[0]).toMatchObject({ id, start: { date: '2026-10-15' }, end: { date: '2026-10-16' } });
    await geste(41, { objet: 'Visite', heure: '09:30', duree_minutes: 90 });
    expect(evenements(ARNO)[0]).toMatchObject({ id, summary: 'Gestion — 7 avenue de l’Union — Visite', end: { dateTime: '2026-10-15T11:00:00' } });
    await geste(41, { etat: 'faite' });
    expect(evenements(ARNO)[0]).toMatchObject({ id, summary: '✓ Gestion — 7 avenue de l’Union — Visite' });
    await geste(41, { etat: 'annulee' });
    expect(evenements(ARNO)).toEqual([]);
    expect(taches.get(41)).toMatchObject({ synchro_etat: 'retiree', google_evenement_id: null });
    expect(etrangers()).toBe(etrangersAvant);
  });
});

describe('🔴 règle 2 — confiée à un collègue : seulement après acceptation', () => {
  it('en attente → rien ; acceptée → dans SON agenda ; refusée (après relance) → retirée', async () => {
    tache(42, { confiee_a: 3, confiee_a_libelle: 'Claire', confiee_email: CLAIRE, acceptation: 'en_attente' });
    expect(await geste(42)).toMatchObject({ etat: 'ok', place: { sorte: 'absent', raison: 'en_attente' } });
    expect(faux.appels).toEqual([]);
    await geste(42, { acceptation: 'acceptee' });
    expect(evenements(CLAIRE)).toHaveLength(1);
    expect(evenements(ARNO)).toEqual([]);
    // Changer la date relance la demande (lot ACCEPTATION) : l'événement quitte l'agenda jusqu'à la nouvelle réponse.
    await geste(42, { jour: '2026-10-20', acceptation: 'en_attente' });
    expect(evenements(CLAIRE)).toEqual([]);
    await geste(42, { acceptation: 'refusee' });
    expect(evenements(CLAIRE)).toEqual([]);
    expect(etrangers()).toBe(etrangersAvant);
  });
  it('refusée d’emblée → aucun appel', async () => {
    tache(43, { confiee_a: 3, confiee_email: CLAIRE, acceptation: 'en_attente' });
    await geste(43);
    await geste(43, { acceptation: 'refusee' });
    expect(faux.appels).toEqual([]);
  });
});

describe('🔴 réattribution', () => {
  it('supprimée de l’ancien agenda, puis créée chez le nouveau selon les règles 1 et 2', async () => {
    tache(44);
    await geste(44);
    expect(evenements(ARNO)).toHaveLength(1);
    await geste(44, { confiee_a: 3, confiee_a_libelle: 'Claire', confiee_email: CLAIRE, acceptation: 'en_attente' });
    expect(evenements(ARNO)).toEqual([]);
    expect(evenements(CLAIRE)).toEqual([]);
    await geste(44, { acceptation: 'acceptee' });
    expect(evenements(CLAIRE)).toHaveLength(1);
    expect(etrangers()).toBe(etrangersAvant);
  });
});

describe('🔴 échec de Google : jamais silencieux, et repris plus tard', () => {
  it('panne → « echec » + motif + prochain essai ; la reprise (délai passé) envoie, sans doublon', async () => {
    tache(45);
    faux.panne = true;
    const r = await geste(45);
    expect(r).toMatchObject({ etat: 'echec', motif: expect.stringMatching(/indisponible/) });
    expect(taches.get(45)).toMatchObject({ synchro_etat: 'echec', synchro_essais: 1 });
    expect(taches.get(45)!.synchro_prochain_essai).toBeGreaterThan(Date.now());
    expect((await complementsAgenda([45])).get(45)?.agenda).toMatchObject({ etat: 'a_resynchroniser', peutReessayer: true });
    // Trop tôt : la reprise ne la tente pas.
    expect(await reprendreSynchros({ porte })).toEqual({ tentees: 0, echecs: 0 });
    faux.panne = false;
    taches.get(45)!.synchro_prochain_essai = Date.now() - 1;
    expect(await reprendreSynchros({ porte })).toEqual({ tentees: 1, echecs: 0 });
    expect(evenements(ARNO)).toHaveLength(1);
    expect(taches.get(45)).toMatchObject({ synchro_etat: 'envoyee', synchro_essais: 0, synchro_erreur: null });
  });
  it('un geste PENDANT la synchronisation : la tâche reste « à envoyer » (jamais déclarée à jour à tort)', async () => {
    tache(46);
    pendant = () => { taches.get(46)!.synchro_version += 1; };
    await geste(46);
    expect(taches.get(46)!.synchro_etat).toBe('a_envoyer');
  });
});

describe('🔴🔴 garde-fou : aucun événement étranger touché', () => {
  it('une référence en base vers un VRAI rendez-vous : ni modifié ni supprimé ; le nôtre est créé à côté', async () => {
    const dentiste = [...faux.agendas.get(ARNO)!.keys()][0];
    tache(47, { google_agenda: ARNO, google_evenement_id: dentiste });
    await geste(47);
    await geste(47, { etat: 'annulee' });
    expect(etrangers()).toBe(etrangersAvant);
    expect(journal.some((p) => p[4] === 'refus_garde')).toBe(true);
  });
  it('idempotence : un événement déjà créé (réponse perdue) est repris, pas doublé', async () => {
    tache(48);
    await porte.creer(ARNO, 48, (await import('./agendaTache')).construireEvenement({
      id: 48, objet: 'x', texte: '', jour: '2026-10-14', heure: null, dureeMinutes: null, rappels: [], faite: false, lotId: 27,
      adresse: null, codePostal: null, commune: null, pieces: [] }, { motRappel: () => '' }));
    await geste(48);
    expect(evenements(ARNO)).toHaveLength(1);
    expect(evenements(ARNO)[0].summary).toBe('Gestion — 7 avenue de l’Union — _TEST agenda');
  });
});

describe('🔴 LOT FICHE-CARTE-4-BLOCS — « Envoyer » une tâche créée avant l’activation', () => {
  it('« Pas encore dans l’agenda » ; « Envoyer » (reessayerSynchro, la synchronisation existante) la pose', async () => {
    const { reessayerSynchro } = await import('./agendaSynchroRepo');
    tache(60); // créée avant l'activation : non demandée, aucun événement
    expect((await complementsAgenda([60])).get(60)?.agendaCarte).toMatchObject({ etat: 'pas_encore', peutReessayer: true });
    const avant = fauxGoogleDesTests().appels.length;
    expect(await reessayerSynchro(60)).toMatchObject({ etat: 'ok', place: { sorte: 'present' } });
    expect(fauxGoogleDesTests().appels.slice(avant).some((x) => x.methode === 'POST')).toBe(true);
    expect(taches.get(60)).toMatchObject({ synchro_etat: 'envoyee', google_agenda: ARNO });
    expect((await complementsAgenda([60])).get(60)?.agendaCarte?.etat).toBe('dans_agenda');
  });
});

describe('🔴 règle 3 et réglage', () => {
  it('compte hors Workspace : aucun appel ; mention « pas d’agenda Google »', async () => {
    tache(49, { confiee_email: 'gestion.criterimmo@gmail.com' });
    await geste(49);
    expect(faux.appels).toEqual([]);
    expect((await complementsAgenda([49])).get(49)?.agenda?.texte).toBe('pas d’agenda Google');
  });
  it('réglage COUPÉ (défaut) : aucun appel, aucune mention ; une tâche sans événement reste muette', async () => {
    reglage = false;
    tache(50);
    expect(await geste(50)).toEqual({ etat: 'desactive' });
    expect(faux.appels).toEqual([]);
    expect(taches.get(50)!.synchro_etat).toBe('non_demandee');
    expect((await complementsAgenda([50])).get(50)?.agenda).toBeNull();
  });
  it('sous les tests, la porte par défaut est le FAUX Google', async () => {
    tache(51);
    await marquerASynchroniser(q as never, 51);
    await synchroniserTache(51, { porte: porteParDefaut() });
    expect(fauxGoogleDesTests().appels.length).toBeGreaterThan(0);
    expect(ecritures()).toEqual([]); // le faux de CE fichier n'a rien reçu : c'est celui des tests par défaut
  });
});
