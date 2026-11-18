import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (18/11/2026) — le dépôt des réponses des locataires, base simulée EN MÉMOIRE (jetons, journal, tâche) : le COMPORTEMENT et ce qui est
 * écrit, jamais la forme d'un SQL. « la simple ouverture du lien n'enregistre rien ; la validation à la main n'envoie aucun mail aux locataires ;
 * le mail de confirmation interne part aux bons destinataires, sans doublon ; si tous refusent […] aucun changement de statut n'a lieu ; après
 * une modification du rendez-vous, les anciennes réponses sont caduques ; un jeton expiré ou falsifié est refusé. »
 */
const h = vi.hoisted(() => ({
  sql: [] as string[],
  jetons: [] as { id: number; tache_id: number; sorte: string; occupation_id: number; occupation_ids: number[]; creneau: string; duree: number | null; empreinte: string; expire_le: string; cree: number }[],
  evts: [] as { id: number; tache_id: number; sorte: string; creneau: string; nature: string; jeton_id: number | null; occupation_id: number | null; par_libelle: string; le: string }[],
  tache: { etat: 'a_faire', jour: '2026-11-20', heure: '10:00', duree: 60 } as { etat: string; jour: string; heure: string; duree: number },
  envois: [] as { a: string[]; objet: string; texte: string; sorte: string }[],
  horloge: 0,
  /** le rendez-vous est-il bien celui de ce préavis ? (faux : écran périmé) */
  tacheDuPreavis: true,
}));
const noms: Record<number, { nom: string; prenom: string }> = { 553: { nom: 'ESSAIPREAVIS', prenom: 'Paul' }, 554: { nom: 'ESSAIPREAVIS', prenom: 'Alice' } };
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    h.sql.push(s);
    if (s.startsWith('INSERT INTO gestion_rdv_jeton')) {
      h.jetons.push({ id: h.jetons.length + 1, tache_id: p[0] as number, sorte: p[1] as string, occupation_id: p[2] as number, occupation_ids: p[3] as number[],
        creneau: p[4] as string, duree: p[5] as number | null, empreinte: p[6] as string, expire_le: p[7] as string, cree: h.horloge++ });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO gestion_rdv_reponse')) {
      // le choix « Non » : la nature est écrite dans la requête ('non_invite'), l'auteur suit
      const nonInvite = s.includes("'non_invite'");
      const jeton = s.includes('jeton_id, occupation_id, par_libelle') ? { jeton_id: p[4] as number, occupation_id: p[5] as number, par_libelle: p[6] as string }
        : nonInvite ? { jeton_id: null, occupation_id: null, par_libelle: p[4] as string }
          : s.includes('par_id, par_libelle') ? { jeton_id: null, occupation_id: null, par_libelle: p[5] as string } : { jeton_id: null, occupation_id: null, par_libelle: p[4] as string };
      h.evts.push({ id: h.evts.length + 1, tache_id: p[0] as number, sorte: p[1] as string, creneau: p[2] as string, nature: nonInvite ? 'non_invite' : p[3] as string, ...jeton,
        le: new Date(Date.UTC(2026, 10, 18, 10, 0, h.horloge++)).toISOString() });
      return { rows: [] };
    }
    if (s.includes('FROM gestion_rdv_jeton j JOIN gestion_annuaire_occupation') && s.includes('WHERE j.jeton_empreinte = $1')) {
      const j = h.jetons.find((x) => x.empreinte === p[0]);
      return { rows: j === undefined ? [] : [{ id: String(j.id), tache_id: String(j.tache_id), sorte: j.sorte, occupation_id: String(j.occupation_id), occupation_ids: j.occupation_ids.map(String),
        creneau: j.creneau, expire_le: j.expire_le, ...noms[j.occupation_id], adresse: '12 rue de l’Essai, 75011 PARIS' }] };
    }
    if (s.startsWith('SELECT DISTINCT j.tache_id::text')) {
      return { rows: h.jetons.filter((j) => (p[0] as number[]).includes(j.tache_id)).map((j) => ({ tache_id: String(j.tache_id), sorte: j.sorte, creneau: j.creneau, occupation_id: String(j.occupation_id), ...noms[j.occupation_id] })) };
    }
    if (s.startsWith('SELECT tache_id::text, sorte, creneau, nature')) {
      return { rows: h.evts.filter((e) => (p[0] as number[]).includes(e.tache_id)).map((e) => ({ ...e, tache_id: String(e.tache_id), occupation_id: e.occupation_id === null ? null : String(e.occupation_id) })) };
    }
    if (s.startsWith('SELECT nature FROM gestion_rdv_reponse')) {
      const d = h.evts.filter((e) => e.tache_id === p[0] && e.creneau === p[1] && e.occupation_id === p[2] && (e.nature === 'accepte' || e.nature === 'refuse')).pop();
      return { rows: d === undefined ? [] : [{ nature: d.nature }] };
    }
    if (s.includes('FROM gestion_tache WHERE id = $1')) return { rows: [{ ...h.tache }] };
    if (s.includes('FROM gestion_tache_action a JOIN admin_utilisateur')) return { rows: [{ identifiant: 'jb.pons@sansvisavis.com' }] };
    if (s.startsWith('SELECT t.etat FROM gestion_location_')) return { rows: h.tacheDuPreavis ? [{ etat: h.tache.etat }] : [] };
    if (s.includes('FROM gestion_location_previsite x JOIN gestion_tache') || s.includes('FROM gestion_location_edls x JOIN gestion_tache')) {
      return { rows: [{ n: h.tacheDuPreavis && h.tache.etat === 'a_faire' ? 1 : 0 }] };
    }
    if (s.startsWith('SELECT count(*)::int AS n FROM gestion_rdv_jeton')) {
      return { rows: [{ n: h.jetons.filter((j) => j.tache_id === p[0] && j.sorte === 'edl' && j.creneau === p[1]).length }] };
    }
    if (s.startsWith('SELECT creneau, duree_minutes AS duree FROM gestion_rdv_jeton')) {
      return { rows: h.jetons.filter((j) => j.tache_id === p[0] && j.sorte === 'edl').sort((a, b) => b.cree - a.cree).slice(0, 1).map((j) => ({ creneau: j.creneau, duree: j.duree })) };
    }
    if (s.includes('FROM pg_constraint')) return { rows: [{ ok: true }] };
    if (s.startsWith('SELECT e.tache_id::text FROM gestion_location_edls')) return { rows: [{ tache_id: '60' }] };
    if (s.startsWith('SELECT coalesce(max(id), 0)::text AS v FROM gestion_rdv_reponse')) return { rows: [{ v: String(h.evts.length) }] };
    return { rows: [] };
  },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true, oublierSchemaLocation: () => {} }));
vi.mock('./preavisTestRepo', () => ({ perimetreDuGeste: async () => ({ ok: true, perimetre: null }) }));
vi.mock('./mailsPreavisSortieRepo', () => ({
  mailsAvisDisponibles: async () => true,
  envoyerSerie: async (mails: { a: string[]; objet: string; texte: string; sorte: string }[]) => { h.envois.push(...mails); return mails.map((m) => ({ ...m, cc: [], envoye: true, motif: null })); },
}));
vi.mock('./previsiteBase', async (orig) => ({
  ...(await orig<typeof import('./previsiteBase')>()),
  // 🔴 la liste « collaborateurs prévenus » contient AUSSI la personne qui a fixé le rendez-vous : le mail ne lui part qu'une fois
  collaborateursInternes: async () => ['a.jorel@sansvisavis.com', 'JB.Pons@sansvisavis.com', 'gestion@criterimmo.fr'],
  sequenceTache: async () => 0,
  contexte: async () => ({ adresse: '12 rue de l’Essai, 75011 PARIS', lotId: 7, expediteur: 'gestion@criterimmo.fr', brute: '', signature: { html: '', texte: '' },
    qui: { nom: 'Arnaud JOREL', email: 'a.jorel@sansvisavis.com' },
    locataires: [{ occupationId: 553, nom: 'ESSAIPREAVIS', prenom: 'Paul', civilite: null, emails: ['paul@exemple.test'], entree: null, sortie: null },
      { occupationId: 554, nom: 'ESSAIPREAVIS', prenom: 'Alice', civilite: null, emails: ['alice@exemple.test'], entree: null, sortie: null }] }),
}));

import { apercuLocatairesEdls, creerJetons, envoyerMailLocatairesEdls, etatsDesRdv, lireJetonRdv, marquerNonInvites, repondreParJeton, validerRdvALaMain, versionRdv } from './reponsesRdvRepo';

const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const AVANT = new Date('2026-11-19T12:00:00Z');
const jetonDe = (lien: string): string => new URL(lien).searchParams.get('j') as string;
const ecrituresReponses = () => h.sql.filter((s) => s.startsWith('INSERT INTO gestion_rdv_reponse'));
const inviter = async () => creerJetons({ tacheId: 34, sorte: 'previsite', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 }, occupationIds: [553, 554],
  locataires: [{ occupationId: 553, emails: ['paul@exemple.test'] }, { occupationId: 554, emails: ['alice@exemple.test'] }, { occupationId: 555, emails: [] }], auteur: AUTEUR });
const etat = async () => (await etatsDesRdv([{ sorte: 'previsite', tacheId: 34, jour: h.tache.jour, heure: h.tache.heure }])).get('previsite:34') ?? null;

beforeEach(() => { h.sql = []; h.jetons = []; h.evts = []; h.envois = []; h.tache = { etat: 'a_faire', jour: '2026-11-20', heure: '10:00', duree: 60 }; h.tacheDuPreavis = true; });

describe('🔴 les liens personnels', () => {
  it('un lien par locataire AVEC une adresse ; seule l’empreinte est gardée (jamais le jeton en clair)', async () => {
    const liens = await inviter();
    expect([...liens.keys()]).toEqual([553, 554]);
    expect(h.jetons.map((j) => j.empreinte)).toHaveLength(2);
    for (const j of h.jetons) expect(j.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(h.jetons.some((j) => j.empreinte === jetonDe(liens.get(553)!.accepter))).toBe(false);
  });
  it('🔴 la simple OUVERTURE du lien n’enregistre rien', async () => {
    const liens = await inviter();
    const l = await lireJetonRdv(jetonDe(liens.get(553)!.accepter), AVANT);
    expect(l).toMatchObject({ ok: true, rdv: { sorte: 'previsite', jour: '2026-11-20', heure: '10:00', nom: 'Paul ESSAIPREAVIS', reponse: null } });
    expect(ecrituresReponses()).toHaveLength(0);
  });
  it('🔴 un jeton falsifié ou expiré est refusé, sans rien écrire', async () => {
    const liens = await inviter();
    expect(await repondreParJeton('Z'.repeat(43), 'accepter', { maintenant: AVANT })).toMatchObject({ ok: false, cause: 'inconnu' });
    expect(await repondreParJeton('pas-un-jeton', 'accepter', { maintenant: AVANT })).toMatchObject({ ok: false, cause: 'inconnu' });
    expect(await repondreParJeton(jetonDe(liens.get(553)!.accepter), 'accepter', { maintenant: new Date('2026-11-20T09:00:00Z') })).toMatchObject({ ok: false, cause: 'expire' });
    expect(ecrituresReponses()).toHaveLength(0);
  });
});

describe('🔴 les réponses et le cartouche', () => {
  it('une acceptation allume « Confirmé » et envoie le mail interne UNE fois, aux bons destinataires, sans doublon', async () => {
    const liens = await inviter();
    expect(await repondreParJeton(jetonDe(liens.get(553)!.accepter), 'accepter', { maintenant: AVANT })).toMatchObject({ ok: true, rdv: { reponse: 'accepte' } });
    expect(await etat()).toMatchObject({ etat: 'confirme', par: 'Paul ESSAIPREAVIS', main: false });
    expect(h.envois).toHaveLength(1);
    expect(h.envois[0].objet).toBe('[Copie interne] Pré-visite confirmée — 12 rue de l’Essai, 75011 PARIS — 20/11/2026 à 10h00');
    expect(h.envois[0].a).toEqual(['jb.pons@sansvisavis.com', 'a.jorel@sansvisavis.com', 'gestion@criterimmo.fr']);
    // la seconde acceptation (Alice) ne renvoie rien : l'état ne change pas
    await repondreParJeton(jetonDe(liens.get(554)!.accepter), 'accepter', { maintenant: AVANT });
    expect(h.envois).toHaveLength(1);
  });
  it('un refus suivi d’une acceptation allume aussi « Confirmé » ; on peut changer d’avis', async () => {
    const liens = await inviter();
    await repondreParJeton(jetonDe(liens.get(553)!.refuser), 'refuser', { maintenant: AVANT });
    expect((await etat())?.etat).toBe('attente');
    await repondreParJeton(jetonDe(liens.get(553)!.accepter), 'accepter', { maintenant: AVANT });
    expect((await etat())?.etat).toBe('confirme');
    expect(ecrituresReponses()).toHaveLength(3); // refus, acceptation, mail interne — tout s'ajoute, rien ne s'efface
  });
  it('🔴 tous refusent : « Refusé », le mail interne « refusé » à l’équipe, et AUCUN changement de statut (aucune autre écriture)', async () => {
    const liens = await inviter();
    await repondreParJeton(jetonDe(liens.get(553)!.refuser), 'refuser', { maintenant: AVANT });
    await repondreParJeton(jetonDe(liens.get(554)!.refuser), 'refuser', { maintenant: AVANT });
    expect((await etat())?.etat).toBe('refuse');
    expect(h.envois.map((m) => m.objet)).toEqual(['[Copie interne] Pré-visite refusée par les locataires — 12 rue de l’Essai, 75011 PARIS — 20/11/2026 à 10h00']);
    expect(h.sql.filter((s) => /^(UPDATE|DELETE)/.test(s) || /^INSERT INTO (?!gestion_rdv_)/.test(s))).toEqual([]);
  });
  it('🔴 après une modification du rendez-vous, les anciennes réponses sont CADUQUES (le lien aussi), sans rien effacer', async () => {
    const liens = await inviter();
    await repondreParJeton(jetonDe(liens.get(553)!.accepter), 'accepter', { maintenant: AVANT });
    h.tache = { ...h.tache, jour: '2026-11-22' };
    expect(await etat()).toBeNull(); // aucun locataire invité sur le nouveau créneau, aucune validation : rien de « Confirmé »
    expect(await lireJetonRdv(jetonDe(liens.get(553)!.accepter), AVANT)).toMatchObject({ ok: false, cause: 'caduc' });
    expect(h.evts.some((e) => e.nature === 'accepte')).toBe(true); // la réponse d'avant reste au journal
  });
});

describe('🔴 la validation à la main', () => {
  it('allume « Confirmé à la main », n’envoie AUCUN mail aux locataires (seulement le mail interne), et se retire', async () => {
    await inviter();
    expect(await validerRdvALaMain({ sorte: 'previsite', tacheId: 34, occupationIds: [553, 554] }, AUTEUR)).toMatchObject({ etat: 'ok', data: { etat: { etat: 'confirme', main: true, par: 'Arnaud Jorel' } } });
    expect(h.envois.flatMap((m) => m.a).some((a) => a.includes('exemple.test'))).toBe(false);
    expect(h.envois.map((m) => m.sorte)).toEqual(['rdv_confirmation_interne']);
    expect(await validerRdvALaMain({ sorte: 'previsite', tacheId: 34, occupationIds: [553, 554] }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(await validerRdvALaMain({ sorte: 'previsite', tacheId: 34, occupationIds: [553, 554], annuler: true }, AUTEUR)).toMatchObject({ etat: 'ok', data: { etat: { etat: 'attente' } } });
    expect(h.envois).toHaveLength(1);
  });
});

describe('🔴 l’invitation des locataires à l’état des lieux', () => {
  it('un mail par locataire avec SES boutons, la copie interne SANS lien personnel ; un créneau déjà invité ne l’est pas deux fois ; déplacé : la modification', async () => {
    h.tache = { etat: 'a_faire', jour: '2026-11-25', heure: '14:00', duree: 60 };
    await envoyerMailLocatairesEdls(60, [553, 554], AUTEUR);
    const auxLocataires = h.envois.filter((m) => m.sorte === 'edls_locataires' && !m.objet.startsWith('[Copie interne]'));
    expect(auxLocataires.map((m) => m.a)).toEqual([['paul@exemple.test'], ['alice@exemple.test']]);
    for (const m of auxLocataires) expect(m.texte).toContain('J’accepte le rendez-vous : http');
    const copie = h.envois.find((m) => m.objet.startsWith('[Copie interne]'))!;
    expect(copie.texte).not.toContain('/rdv/reponse');
    h.envois = [];
    await envoyerMailLocatairesEdls(60, [553, 554], AUTEUR);
    expect(h.envois).toEqual([]);
    h.tache = { ...h.tache, jour: '2026-11-27' };
    await envoyerMailLocatairesEdls(60, [553, 554], AUTEUR);
    expect(h.envois.filter((m) => m.sorte === 'edls_locataires_modif').map((m) => m.objet)[0])
      .toBe('Modification de votre rendez-vous d’état des lieux de sortie — nouvelle date : 27/11/2026 à 14h00 — 12 rue de l’Essai, 75011 PARIS');
    expect(h.envois.find((m) => m.sorte === 'edls_locataires_modif')!.texte).toContain('prévu le 25/11/2026 de 14h00 à 15h00, est déplacé au 27/11/2026 de 14h00 à 15h00');
  });
});

describe('🔴 (2e lot) le choix « Envoyer l’invitation aux locataires : Non »', () => {
  it('« Non » : le cartouche dit « Locataires non invités » (jamais « En attente ») ; aucun lien, aucun mail', async () => {
    expect(await marquerNonInvites('previsite', 34, AUTEUR)).toBe(true);
    expect(await etat()).toMatchObject({ etat: 'non_invites' });
    expect(h.jetons).toEqual([]);
    expect(h.envois).toEqual([]);
  });
  it('« Non » sur l’ancien créneau, puis déplacé avec « Oui » : « En attente » pour le nouveau créneau', async () => {
    await marquerNonInvites('previsite', 34, AUTEUR);
    h.tache = { ...h.tache, jour: '2026-11-21' };
    await creerJetons({ tacheId: 34, sorte: 'previsite', rdv: { jour: '2026-11-21', heure: '10:00', dureeMinutes: 60 }, occupationIds: [553],
      locataires: [{ occupationId: 553, emails: ['paul@exemple.test'] }], auteur: AUTEUR });
    expect((await etat())?.etat).toBe('attente');
  });
  it('le récapitulatif de l’état des lieux : « Non » → personne ; « Oui » → les locataires avec une adresse, le texte (boutons à l’envoi), jamais la copie', async () => {
    expect(await apercuLocatairesEdls({ occupationIds: [553, 554], jour: '2026-11-25', debut: '14:00', fin: '15:00', deplacer: false, choix: 'non' }, AUTEUR))
      .toEqual({ choix: 'non', invites: [], sansEmail: [], impossible: null, texte: null });
    const oui = await apercuLocatairesEdls({ occupationIds: [553, 554], jour: '2026-11-25', debut: '14:00', fin: '15:30', deplacer: false, choix: 'oui' }, AUTEUR);
    expect(oui).toMatchObject({ choix: 'oui', invites: ['Paul ESSAIPREAVIS', 'Alice ESSAIPREAVIS'], impossible: null });
    expect(oui.texte).toContain('le 25/11/2026 de 14h00 à 15h30');
    expect(oui.texte).toContain('J’accepte le rendez-vous : [lien personnel créé à l’envoi]');
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x))).toBe(false); // LECTURE seule
  });
});

describe('🔴 (2e lot) la mise à jour immédiate des cartouches', () => {
  it('l’empreinte change dès qu’un locataire répond (l’écran ouvert relit alors ses lignes)', async () => {
    const liens = await inviter();
    const avant = await versionRdv();
    await repondreParJeton(jetonDe(liens.get(553)!.accepter), 'accepter', { maintenant: AVANT });
    expect(await versionRdv()).not.toBe(avant);
  });
});

describe('🔴 (18/11/2026) « Valider sans prévenir » sur un rendez-vous qui n’est plus à faire : le motif juste, rien n’est écrit', () => {
  it('effectué → « déjà effectué » ; annulé → « annulé » ; écran périmé → « rechargez la page »', async () => {
    const valider = () => validerRdvALaMain({ sorte: 'previsite', tacheId: 34, occupationIds: [557] }, AUTEUR);
    h.tache = { ...h.tache, etat: 'faite' };
    expect(await valider()).toEqual({ etat: 'refus', motif: 'Ce rendez-vous est déjà effectué : il n’y a plus rien à valider.' });
    h.tache = { ...h.tache, etat: 'annulee' };
    expect(await valider()).toEqual({ etat: 'refus', motif: 'Ce rendez-vous est annulé : il n’y a plus rien à valider.' });
    h.tacheDuPreavis = false;
    expect(await valider()).toEqual({ etat: 'refus', motif: 'Ce rendez-vous n’est plus d’actualité pour ce préavis : rechargez la page.' });
    expect(ecrituresReponses()).toEqual([]);
  });
});

