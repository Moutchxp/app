import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LA PRÉ-VISITE (Arno, 10/11/2026) — le dépôt, base SIMULÉE (les suivis en mémoire), module de tâches simulé (on vérifie qu'on
 * L'APPELLE : aucun second système de tâches), canal des mails Location simulé (rien ne part). Fragments sémantiques, jamais la forme
 * exacte d'un SQL. Deux locataires sur le même préavis, deux collègues.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface Suivi { id: string; cle: string; lot_id: string; occupation_ids: string[]; recu_le: string; tache_id: string | null; rdv_saisi_le: string | null;
  rdv_modifie_le: string | null; alerte_envoyee_le: string | null; cr_invitation_le: string | null; effectuee_le: string | null; refus_le: string | null;
  tache_etat: string | null; jour: string | null; heure: string | null; duree: number | null }
let suivi: Suivi | null = null;
let jour = '2026-11-12';
let groupe: Record<string, unknown>[] = [];
let reponses: Record<string, unknown>[] = [];
const MAINTENANT = '2026-11-12T09:00:00Z';

/** Les AUTRES préavis (premier passage : plusieurs préavis en retard) — le préavis principal reste `suivi`. */
let autres: Suivi[] = [];
let groupeAutre: Record<string, unknown>[] = [];
/** Une alerte a-t-elle déjà été envoyée un jour (hors des suivis en mémoire) ? */
let dejaAlerte = false;
const tous = (): Suivi[] => [...(suivi ? [suivi] : []), ...autres];
const neuf = (id: string, params: unknown[]): Suivi => ({ id, cle: String(params[0]), lot_id: String(params[1]), occupation_ids: (params[2] as number[]).map(String),
  recu_le: String(params[3]), tache_id: null, rdv_saisi_le: null, rdv_modifie_le: null, alerte_envoyee_le: null, cr_invitation_le: null, effectuee_le: null,
  refus_le: null, tache_etat: null, jour: null, heure: null, duree: null });

function repondre(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = norme(sql);
  appels.push({ sql: s, params });
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  if (s.includes('FROM gestion_annuaire_occupation o LEFT JOIN gestion_location_preavis p')) {
    return r((params[0] as number[]).includes(51) ? groupeAutre : groupe);
  }
  if (s.endsWith('AS j')) return r([{ j: jour }]);
  if (s.startsWith('SELECT EXISTS') && s.includes('alerte_envoyee_le IS NOT NULL')) return r([{ deja: dejaAlerte || tous().some((x) => x.alerte_envoyee_le !== null) }]);
  if (s.startsWith('SELECT') && s.includes('FROM gestion_location_previsite s') && s.includes('cr_invitation_le IS NULL')) {
    return r(suivi && suivi.cr_invitation_le === null && suivi.effectuee_le === null && suivi.tache_etat === 'a_faire' ? [suivi] : []);
  }
  if (s.startsWith('SELECT') && s.includes('FROM gestion_location_previsite s') && s.includes('s.cle = $1')) return r(tous().filter((x) => x.cle === params[0]));
  if (s.startsWith('SELECT') && s.includes('FROM gestion_location_previsite s')) return r(suivi ? [suivi] : []);
  if (s.startsWith('INSERT INTO gestion_location_previsite')) {
    if (!tous().some((x) => x.cle === params[0])) {
      if (suivi === null && String(params[0]).startsWith('bail:9|')) suivi = neuf('40', params);
      else autres.push(neuf(String(41 + autres.length), params));
    }
    return r([]);
  }
  const cible = tous().find((x) => x.id === String(params[0]));
  if (s.startsWith('UPDATE gestion_location_previsite') && cible !== undefined) {
    if (s.includes('SET tache_id')) {
      Object.assign(cible, { tache_id: String(params[1]), rdv_saisi_le: cible.rdv_saisi_le ?? MAINTENANT, rdv_modifie_le: MAINTENANT, cr_invitation_le: null,
        tache_etat: 'a_faire', jour: '2026-11-20', heure: '10:00', duree: 60 });
    } else if (s.includes('SET rdv_modifie_le')) Object.assign(cible, { rdv_modifie_le: '2026-11-12T10:00:00Z', cr_invitation_le: null });
    else if (s.includes('SET alerte_envoyee_le = now()')) {
      if (cible.alerte_envoyee_le !== null) return r([]);
      cible.alerte_envoyee_le = MAINTENANT; return r([{ id: cible.id }]);
    } else if (s.includes('SET alerte_envoyee_le = NULL')) cible.alerte_envoyee_le = null;
    else if (s.includes('SET cr_invitation_le = now()')) {
      if (cible.cr_invitation_le !== null) return r([]);
      cible.cr_invitation_le = MAINTENANT; return r([{ id: cible.id }]);
    } else if (s.includes('SET cr_invitation_le = NULL')) cible.cr_invitation_le = null;
    else if (s.includes('SET effectuee_le')) cible.effectuee_le = MAINTENANT;
    else if (s.includes('SET refus_le')) cible.refus_le = MAINTENANT;
    return r([]);
  }
  if (s.includes('FROM gestion_tache_demande d')) return r(reponses);
  if (s.includes('FROM admin_utilisateur')) return r([{ id: 3 }, { id: 4 }, { id: 5 }]);
  if (s.includes('SELECT note FROM gestion_tache')) return r([{ note: 'récap' }]);
  if (s.includes('FROM gestion_tache_action')) return r([{ n: 0 }]);
  if (s.includes('FROM gestion_tache_invite')) return r([]);
  return { rows: [], rowCount: 1 };
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
let lignesEnCours: unknown[] = [];
vi.mock('./preavisRepo', () => ({ preavisEnCours: async () => ({ disponible: true, etatDesLieux: true, planification: true, lignes: lignesEnCours }) }));
vi.mock('../gestion/schema', () => ({ tachesDisponibles: async () => true }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@exemple.test' }) }));
vi.mock('../gestion/adresseApplication', () => ({ adresseApplication: () => ({ base: 'http://localhost:3000', locale: true }) }));
const creerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demandes: [
  { demandeId: 1, statut: 'en_attente', jeton: 'j1', destinataireLibelle: 'Claire Test' }, { demandeId: 2, statut: 'en_attente', jeton: 'j2', destinataireLibelle: 'Paul Test' }] }));
const decalerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demandes: [{ demandeId: 3, statut: 'en_attente', jeton: 'j3' }, { demandeId: 4, statut: 'en_attente', jeton: 'j4' }] }));
const modifierTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demandes: [{ demandeId: 5, statut: 'en_attente', jeton: 'j5' }] }));
const annulerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500 }));
const marquerFaite = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500 }));
vi.mock('../gestion/tachesRepo', () => ({
  creerTache: (...a: unknown[]) => creerTache(...a), decalerTache: (...a: unknown[]) => decalerTache(...a), modifierTache: (...a: unknown[]) => modifierTache(...a),
  annulerTache: (...a: unknown[]) => annulerTache(...a), marquerFaite: (...a: unknown[]) => marquerFaite(...a),
  listerCollaborateurs: async () => [{ id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true },
    { id: 5, libelle: 'Paul Test', accesGestion: false }, { id: 6, libelle: 'Zoé Sans-accès', accesGestion: false }],
}));
vi.mock('../gestion/invitesRepo', () => ({ renvoyerInvitation: vi.fn(async () => ({ ok: true, demandes: [] })) }));
const INTERNES = ['arno@exemple.test', 'claire@exemple.test', 'paul@exemple.test'];
vi.mock('./sortieLocatairesRepo', () => ({ destinatairesSortie: async () => INTERNES }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'arno@exemple.test', nom: 'Arno Test', prenom: 'Arno', nomFamille: 'Test' }) }));
let echecEnvoi = false;
const envoyerSerie = vi.fn(async (mails: { sorte: string; objet: string; a: string[]; cc: string[]; texte: string }[], ..._r: unknown[]) =>
  mails.map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, envoye: !echecEnvoi, motif: echecEnvoi ? 'Gmail indisponible' : null, texte: m.texte })));
vi.mock('./mailsPreavisSortieRepo', () => ({
  envoyerSerie: (...a: unknown[]) => envoyerSerie(...(a as [never])),
  mailsAvisDisponibles: async () => true,
  signatureEcran: async () => ({ brute: '', ecran: { html: '', texte: '' } }),
  logementDe: async () => ({ lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', proprietaire: null, enGestion: true, copropriete: null }),
  locatairesAvis: async () => [
    { occupationId: 11, nom: 'TEST', prenom: 'Alice', emails: ['alice@exemple.test'], entree: null, sortie: null },
    { occupationId: 12, nom: 'TEST', prenom: 'Bruno', emails: ['bruno@exemple.test'], entree: null, sortie: null }],
}));

import {
  deplacerPrevisite, envoyerCompteRendu, envoyerMailLocatairesPrevisite, envoyerRefus, passeAlertesPrevisite, passeInvitationsCompteRendu,
  programmerPrevisite, reaffecterPrevisite, apercuRdvPrevisite, avecPrevisites, passePrevisite,
} from './previsiteRepo';
import type { LignePreavisAccueil } from './preavis';

const AUTEUR = { id: 3, libelle: 'arno@exemple.test' };
const OCC = [11, 12];
const ecritures = (): Appel[] => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql));
const journal = (): Appel[] => appels.filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
const LIGNE: LignePreavisAccueil = { cle: 'x', lotId: 7, adresse: '4 rue Fictive', occupationId: 11, occupationIds: OCC,
  locataires: [{ occupationId: 11, locataireId: 101, nom: 'TEST Alice' }, { occupationId: 12, locataireId: 102, nom: 'TEST Bruno' }],
  recuLe: '2026-11-01', dateMax: '2027-02-01', etatDesLieuxLe: null };
const programmee = () => { suivi = { id: '40', cle: 'bail:9|2026-11-01', lot_id: '7', occupation_ids: ['11', '12'], recu_le: '2026-11-01', tache_id: '500',
  rdv_saisi_le: '2026-11-09T10:00:00Z', rdv_modifie_le: '2026-11-09T10:00:00Z', alerte_envoyee_le: null, cr_invitation_le: null, effectuee_le: null, refus_le: null,
  tache_etat: 'a_faire', jour: '2026-11-12', heure: '10:00', duree: 60 }; };

beforeEach(() => {
  appels.length = 0; suivi = null; autres = []; dejaAlerte = false; jour = '2026-11-12'; echecEnvoi = false; reponses = [];
  groupeAutre = [{ id: '51', locataire_id: '501', lot_id: '8', sortie: null, entree: '2023-01-01', bail_id: '10', recu_le: '2026-10-01', date_max: '2027-01-01' }];
  groupe = [
    { id: '11', locataire_id: '101', lot_id: '7', sortie: null, entree: '2024-01-01', bail_id: '9', recu_le: '2026-11-01', date_max: '2027-02-01' },
    { id: '12', locataire_id: '102', lot_id: '7', sortie: null, entree: '2024-01-01', bail_id: '9', recu_le: '2026-11-01', date_max: '2027-02-01' }];
  for (const f of [creerTache, decalerTache, modifierTache, annulerTache, marquerFaite, envoyerSerie]) f.mockClear();
});

describe('🔴 Règle 3 — « RDV pré-visite » : le module de tâches, plusieurs collègues, la date de PREMIÈRE saisie', () => {
  it('le premier collègue reçoit la tâche, les autres y sont invités ; chacun sa demande (deux mails Accepter / Refuser)', async () => {
    const r = await programmerPrevisite({ occupationIds: OCC, jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [4, 5] }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(creerTache).toHaveBeenCalledTimes(1);
    const [lot, saisie] = creerTache.mock.calls[0] as [number, Record<string, unknown>];
    expect(lot).toBe(7);
    expect(saisie).toMatchObject({ objet: 'Pré-visite EDL de sortie', jour: '2026-11-20', heure: '10:00', dureeMinutes: 60, confieeA: 4, invites: [5] });
    if (r.etat === 'ok') expect(r.demandes?.map((d) => d.demandeId)).toEqual([1, 2]);
    expect(suivi).toMatchObject({ tache_id: '500', rdv_saisi_le: MAINTENANT, cle: 'bail:9|2026-11-01' });
    // le journal de CHAQUE locataire du préavis
    expect(journal().map((a) => a.params[0])).toEqual([101, 102]);
  });
  it('un collègue sans accès à Gestion ni Location (ou hors Workspace) : refusé, rien n’est créé', async () => {
    const r = await programmerPrevisite({ occupationIds: OCC, jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [6] }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus', champ: 'destinataires' });
    expect(creerTache).not.toHaveBeenCalled();
    expect(ecritures()).toEqual([]);
  });
  it('déjà programmée : refusé (« déplacez-la »), rien n’est créé', async () => {
    programmee();
    const r = await programmerPrevisite({ occupationIds: OCC, jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [4] }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
    expect(creerTache).not.toHaveBeenCalled();
  });
  it('à la saisie, UN mail de confirmation à TOUS les locataires du préavis, avec l’invitation d’agenda', async () => {
    const r = await programmerPrevisite({ occupationIds: OCC, jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [4] }, AUTEUR);
    if (r.etat !== 'ok') throw new Error('attendu ok');
    const m = await envoyerMailLocatairesPrevisite(r.data, AUTEUR);
    const [mails, , o] = envoyerSerie.mock.calls[0] as unknown as [{ sorte: string; a: string[]; cc: string[]; objet: string; ics: { contenu: string } }[], string, { occupationIds: number[]; lotId: number }];
    expect(mails[0].sorte).toBe('previsite_locataires');
    expect(mails[0].a).toEqual(['alice@exemple.test', 'bruno@exemple.test']);
    expect(mails[0].cc).toEqual(['gestion@exemple.test', 'arno@exemple.test']);
    expect(mails[0].ics.contenu).toContain('UID:previsite-40@exemple.test');
    // 🔴 Règle 7 — rangé dans l'historique du bien ET des deux locataires (lot + occupations du journal).
    expect(o).toMatchObject({ lotId: 7, occupationIds: [11, 12] });
    expect(m.envois[0].envoye).toBe(true);
  });
  it('l’aperçu donne le texte intégral de chaque mail (un par collègue, puis celui des locataires), sans rien écrire', async () => {
    const r = await apercuRdvPrevisite({ occupationIds: OCC, jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [4, 5] }, AUTEUR);
    if (r.etat !== 'ok') throw new Error('attendu ok');
    expect(r.data.mails.map((m) => m.sorte)).toEqual(['previsite_invitation', 'previsite_invitation', 'previsite_locataires']);
    expect(r.data.mails[0].texte).toContain('[lien personnel « Accepter »]');
    expect(r.data.mails[2].texte).toContain('le 20/11/2026 de 10h00 à 11h00');
    expect(ecritures()).toEqual([]);
    expect(creerTache).not.toHaveBeenCalled();
  });
});

describe('🔴 Règle 4 — déplacer : statuts remis à zéro (module de tâches), mail de modification aux locataires', () => {
  it('decalerTache avec la nouvelle date ; la date de première saisie est gardée ; l’invitation au compte rendu redevient à faire', async () => {
    programmee(); suivi!.cr_invitation_le = '2026-11-12T12:00:00Z';
    const r = await deplacerPrevisite({ occupationIds: OCC, jour: '2026-11-25', debut: '14:00', fin: '15:00' }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(decalerTache).toHaveBeenCalledWith(500, { jour: '2026-11-25', heure: '14:00', dureeMinutes: 60 }, AUTEUR);
    expect(suivi).toMatchObject({ rdv_saisi_le: '2026-11-09T10:00:00Z', cr_invitation_le: null });
    if (r.etat !== 'ok') return;
    expect(r.demandes).toHaveLength(2);
    expect(r.data.ancien).toEqual({ jour: '2026-11-12', heure: '10:00', dureeMinutes: 60 });
    await envoyerMailLocatairesPrevisite(r.data, AUTEUR);
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ sorte: string; texte: string }[]];
    expect(mails[0].sorte).toBe('previsite_locataires_modif');
    expect(mails[0].texte).toContain('prévu le 12/11/2026 de 10h00 à 11h00, est déplacé au 25/11/2026 de 14h00 à 15h00');
  });
  it('rien à déplacer : refusé', async () => {
    expect(await deplacerPrevisite({ occupationIds: OCC, jour: '2026-11-25', debut: '14:00', fin: '15:00' }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(decalerTache).not.toHaveBeenCalled();
  });
});

describe('★ Tous refusent : « Personne n’a accepté la pré-visite » et réaffecter', () => {
  it('la ligne le dit', async () => {
    programmee();
    reponses = [{ tache_id: '500', destinataire_id: '4', libelle: 'Claire Test', email: 'claire@exemple.test', statut: 'refusee', motif: 'absente' },
      { tache_id: '500', destinataire_id: '5', libelle: 'Paul Test', email: 'paul@exemple.test', statut: 'refusee', motif: 'congés' }];
    const r = await avecPrevisites({ disponible: true, lignes: [{ ...LIGNE }] }, new Date(MAINTENANT));
    expect(r.lignes[0].previsite).toMatchObject({ statut: 'programmee', tousRefusent: true });
  });
  it('réaffecter n’est possible que si tous ont refusé', async () => {
    programmee();
    reponses = [{ tache_id: '500', destinataire_id: '4', libelle: 'Claire Test', email: null, statut: 'refusee', motif: 'x' },
      { tache_id: '500', destinataire_id: '5', libelle: 'Paul Test', email: null, statut: 'en_attente', motif: null }];
    expect(await reaffecterPrevisite({ occupationIds: OCC, destinataires: [3] }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(modifierTache).not.toHaveBeenCalled();
    reponses[1].statut = 'refusee';
    const r = await reaffecterPrevisite({ occupationIds: OCC, destinataires: [3] }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(modifierTache.mock.calls[0][1]).toMatchObject({ confieeA: 3, invites: [], jour: '2026-11-12', heure: '10:00' });
  });
});

describe('🔴 Règle 5 — le compte rendu fait passer en « Pré-visite effectuée »', () => {
  it('À : tous les collaborateurs ; objet prérempli ; parti → effectuée, tâche faite', async () => {
    programmee();
    const r = await envoyerCompteRendu({ occupationIds: OCC, corps: 'Logement propre.\n\nRepeindre la chambre.', aussiLocataires: false }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { statut: 'effectuee' } });
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ a: string[]; cc: string[]; objet: string; texte: string }[]];
    expect(mails[0].a).toEqual(INTERNES);
    expect(mails[0].objet).toBe('Compte rendu de pré-visite d’état des lieux de sortie effectuée le 12/11/2026 à 10h00');
    expect(mails[0].texte).toBe('Logement propre.\n\nRepeindre la chambre.\n\nMail envoyé par Arno TEST (arno@exemple.test)');
    expect(suivi?.effectuee_le).toBe(MAINTENANT);
    expect(marquerFaite).toHaveBeenCalledWith(500, AUTEUR);
  });
  it('« Envoyer aussi aux locataires » : À les locataires, copie aux collaborateurs', async () => {
    programmee();
    await envoyerCompteRendu({ occupationIds: OCC, corps: 'CR', aussiLocataires: true }, AUTEUR);
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ a: string[]; cc: string[] }[]];
    expect(mails[0].a).toEqual(['alice@exemple.test', 'bruno@exemple.test']);
    expect(mails[0].cc).toEqual(INTERNES);
  });
  it('l’envoi échoue : le statut ne change pas', async () => {
    programmee(); echecEnvoi = true;
    const r = await envoyerCompteRendu({ occupationIds: OCC, corps: 'CR', aussiLocataires: false }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { statut: null } });
    expect(suivi?.effectuee_le).toBeNull();
    expect(marquerFaite).not.toHaveBeenCalled();
  });
  it('corps vide : refusé, rien ne part', async () => {
    programmee();
    expect(await envoyerCompteRendu({ occupationIds: OCC, corps: '  ', aussiLocataires: false }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'corps' });
    expect(envoyerSerie).not.toHaveBeenCalled();
  });
});

describe('🔴 Règle 6 — le refus / l’absence : aux locataires, copie aux collaborateurs une fois par adresse ; statut', () => {
  it('parti → « refusée / absente » ; le texte modifié est celui qui part', async () => {
    const r = await envoyerRefus({ occupationIds: OCC, texte: 'Bonjour,\n\nTexte modifié par Arno.' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { statut: 'refusee' } });
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ a: string[]; cc: string[]; texte: string; sorte: string }[]];
    expect(mails[0]).toMatchObject({ sorte: 'previsite_refus', a: ['alice@exemple.test', 'bruno@exemple.test'], cc: INTERNES });
    expect(mails[0].texte.startsWith('Bonjour,\n\nTexte modifié par Arno.')).toBe(true);
    expect(suivi?.refus_le).toBe(MAINTENANT);
    expect(journal().map((a) => a.params[1])).toEqual(['location_previsite_refusee', 'location_previsite_refusee']);
  });
});

describe('🔴 Règle 2 — l’alerte du 11e jour : UN mail par adresse, jamais deux fois', () => {
  it('11e jour sans rendez-vous : un mail, À tous les collaborateurs ; la passe suivante n’envoie rien', async () => {
    jour = '2026-11-12';
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 1, echecs: 0 });
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ sorte: string; a: string[]; texte: string }[]];
    expect(mails[0].sorte).toBe('previsite_alerte');
    expect(mails[0].a).toEqual(INTERNES);
    expect(new Set(mails[0].a).size).toBe(mails[0].a.length);
    expect(mails[0].texte).toContain('http://localhost:3000/admin/location?previsite=11');
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 0, echecs: 0 });
    expect(envoyerSerie).toHaveBeenCalledTimes(1);
  });
  it('10e jour : rien', async () => {
    jour = '2026-11-11';
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 0, echecs: 0 });
    expect(envoyerSerie).not.toHaveBeenCalled();
  });
  it('rendez-vous SAISI le 8e jour (pour le 12e) : aucune alerte au 11e jour', async () => {
    programmee(); suivi!.rdv_saisi_le = '2026-11-09T10:00:00Z'; suivi!.jour = '2026-11-13';
    jour = '2026-11-12';
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 0, echecs: 0 });
  });
  it('un préavis déjà en cours depuis longtemps est aussi alerté', async () => {
    groupe = groupe.map((g) => ({ ...g, recu_le: '2026-09-01' }));
    expect(await passeAlertesPrevisite([{ ...LIGNE, recuLe: '2026-09-01' }])).toMatchObject({ alertes: 1, echecs: 0 });
  });
  it('l’envoi échoue : la réservation est rendue, la passe suivante réessaie (et alors une seule fois)', async () => {
    echecEnvoi = true;
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 0, echecs: 1 });
    expect(suivi?.alerte_envoyee_le).toBeNull();
    echecEnvoi = false;
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 1, echecs: 0 });
    expect(await passeAlertesPrevisite([LIGNE])).toMatchObject({ alertes: 0, echecs: 0 });
  });
  it('la ligne de l’accueil : « Alerte préavis » au 11e jour', async () => {
    const r = await avecPrevisites({ disponible: true, lignes: [{ ...LIGNE }] }, new Date(MAINTENANT));
    expect(r.lignes[0].previsite?.statut).toBe('alerte');
  });
});

describe('🔴 Règle 5 — l’invitation au compte rendu, après la fin du rendez-vous, une fois', () => {
  it('aux collègues qui n’ont pas refusé, avec le lien qui ouvre la ligne', async () => {
    programmee();
    reponses = [{ tache_id: '500', destinataire_id: '4', libelle: 'Claire Test', email: 'claire@exemple.test', statut: 'acceptee', motif: null },
      { tache_id: '500', destinataire_id: '5', libelle: 'Paul Test', email: 'paul@exemple.test', statut: 'refusee', motif: 'x' }];
    expect(await passeInvitationsCompteRendu({ maintenant: new Date('2026-11-12T09:30:00Z') })).toEqual({ invitations: 0, echecs: 0 }); // 10h30 Paris : pas fini
    expect(await passeInvitationsCompteRendu({ maintenant: new Date('2026-11-12T10:05:00Z') })).toEqual({ invitations: 1, echecs: 0 });
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ sorte: string; a: string[]; texte: string }[]];
    expect(mails[0]).toMatchObject({ sorte: 'previsite_invitation_cr', a: ['claire@exemple.test'] });
    expect(mails[0].texte).toContain('http://localhost:3000/admin/location?previsite=11');
    expect(await passeInvitationsCompteRendu({ maintenant: new Date('2026-11-12T11:00:00Z') })).toEqual({ invitations: 0, echecs: 0 });
  });
});

describe('🔴 La passe de la minuterie du serveur web : alerte puis invitation au compte rendu', () => {
  it('les préavis en cours sont lus ; l’alerte part une fois, même sur plusieurs tours', async () => {
    lignesEnCours = [LIGNE];
    expect(await passePrevisite()).toEqual({ alertes: 1, invitations: 0, echecs: 0, recapitulatif: true });
    expect(await passePrevisite()).toEqual({ alertes: 0, invitations: 0, echecs: 0, recapitulatif: false });
    expect(envoyerSerie).toHaveBeenCalledTimes(1);
    lignesEnCours = [];
  });
});

describe('🔴 Arno (10/11/2026) — le PREMIER passage : UN SEUL mail récapitulatif (un par adresse) ; ensuite, chaque alerte son mail, une fois', () => {
  const AUTRE: LignePreavisAccueil = { ...LIGNE, cle: 'y', lotId: 8, occupationId: 51, occupationIds: [51],
    locataires: [{ occupationId: 51, locataireId: 501, nom: 'RETARD Rémi' }], recuLe: '2026-10-01', dateMax: '2027-01-01' };
  it('deux préavis déjà en retard : tous deux en alerte, UN mail récapitulatif qui les liste, rangé dans les deux historiques', async () => {
    const b = await passeAlertesPrevisite([LIGNE, AUTRE]);
    expect(b).toEqual({ alertes: 2, echecs: 0, recapitulatif: true });
    expect(envoyerSerie).toHaveBeenCalledTimes(1);
    const [mails, , o] = envoyerSerie.mock.calls[0] as unknown as [{ sorte: string; a: string[]; objet: string; texte: string }[], string,
      { occupationIds: number[]; autres: { occupationIds: number[] }[] }];
    expect(mails).toHaveLength(1);
    expect(mails[0].sorte).toBe('previsite_alerte');
    expect(mails[0].objet).toBe('Alerte préavis — 2 préavis sans pré-visite fixée');
    // un mail, chaque adresse UNE fois
    expect(mails[0].a).toEqual(INTERNES);
    expect(new Set(mails[0].a.map((x) => x.toLowerCase())).size).toBe(mails[0].a.length);
    expect(mails[0].texte).toContain('reçu le 01/11/2026');
    expect(mails[0].texte).toContain('reçu le 01/10/2026');
    expect(mails[0].texte).toContain('http://localhost:3000/admin/location?previsite=11');
    expect(mails[0].texte).toContain('http://localhost:3000/admin/location?previsite=51');
    expect(o.occupationIds).toEqual([11, 12]);
    expect(o.autres.map((x) => x.occupationIds)).toEqual([[51]]);
    expect(tous().every((x) => x.alerte_envoyee_le !== null)).toBe(true);
    // jamais deux fois
    expect(await passeAlertesPrevisite([LIGNE, AUTRE])).toEqual({ alertes: 0, echecs: 0, recapitulatif: false });
    expect(envoyerSerie).toHaveBeenCalledTimes(1);
  });
  it('le récapitulatif échoue : toutes les réservations sont rendues, la passe suivante le refait (une fois)', async () => {
    echecEnvoi = true;
    expect(await passeAlertesPrevisite([LIGNE, AUTRE])).toEqual({ alertes: 0, echecs: 2, recapitulatif: false });
    expect(tous().every((x) => x.alerte_envoyee_le === null)).toBe(true);
    echecEnvoi = false;
    expect(await passeAlertesPrevisite([LIGNE, AUTRE])).toMatchObject({ alertes: 2, recapitulatif: true });
    expect(envoyerSerie).toHaveBeenCalledTimes(2);
  });
  it('après le premier passage, une NOUVELLE alerte envoie son propre mail', async () => {
    dejaAlerte = true;
    expect(await passeAlertesPrevisite([LIGNE])).toEqual({ alertes: 1, echecs: 0, recapitulatif: false });
    const [mails] = envoyerSerie.mock.calls[0] as unknown as [{ objet: string }[]];
    expect(mails[0].objet).toBe('Alerte préavis — aucune pré-visite fixée — 4 rue Fictive, 92800 Puteaux');
    expect(await passeAlertesPrevisite([LIGNE])).toEqual({ alertes: 0, echecs: 0, recapitulatif: false });
  });
});
