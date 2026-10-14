import { describe, it, expect, vi } from 'vitest';
import {
  COMPTES_SMTP, ENDPOINT_DRIVE_FICHIERS, ENDPOINT_GMAIL_PROFIL, ENDPOINT_JETON_GOOGLE, NOMS_PROTEGES, NOM_RACINE_APPLICATION,
  PREFIXE_AGENDA, estNomProtege, fetchDriveLectureSeule, fetchLectureSeule, motifErreur, requeteEnfants, verifierAgenda,
  verifierCompteSmtp, verifierDrive, verifierGmail,
} from './verifierEnvois';
import { PRODUCTION_INTERDITE } from '../gestion/classement';
import { SOUS_DOSSIERS_PRODUCTION } from '../gestion/classementDrive';
import { RACINE_NOM } from '../gestion/driveGardeFou';

/**
 * Lot PRÉPARATIFS DE BASCULE — `npm run smtp:verifier` vérifie les comptes d'envoi SANS RIEN ENVOYER. Transports et
 * `fetch` SIMULÉS : aucun réseau. Ce que ces épreuves tiennent : aucune méthode d'envoi n'est jamais appelée, et toute
 * requête Google autre que le jeton et les deux lectures est refusée avant de partir.
 */
const COMPTE = { host: 'smtp.exemple.test', port: 587, user: 'alertes@exemple.test', pass: 'secret-jamais-affiche' };

/** Un faux transport COMPLET (comme nodemailer) : s'il était utilisé pour envoyer, on le verrait. */
function fauxTransport(verify: () => Promise<unknown>) {
  return { verify: vi.fn(verify), close: vi.fn(), sendMail: vi.fn(async () => ({})), send: vi.fn() };
}

describe('SMTP — connexion et authentification seulement', () => {
  it('compte valide : OK, le transport est fermé, AUCUNE méthode d’envoi appelée, mot de passe jamais affiché', async () => {
    const t = fauxTransport(async () => true);
    const r = await verifierCompteSmtp('compte par défaut', COMPTE, () => t);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('smtp.exemple.test:587 (STARTTLS), utilisateur alertes@exemple.test — connexion et authentification acceptées');
    expect(t.verify).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.sendMail).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain('secret-jamais-affiche');
  });

  it('authentification refusée : ÉCHEC avec la raison du serveur, transport fermé, rien envoyé', async () => {
    const t = fauxTransport(async () => { throw Object.assign(new Error('Invalid login: 535 5.7.8 Username and Password not accepted'), { code: 'EAUTH', responseCode: 535 }); });
    const r = await verifierCompteSmtp('profil personne', { ...COMPTE, port: 465 }, () => t);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('(TLS)');
    expect(r.detail).toContain('EAUTH — SMTP 535 — Invalid login');
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.sendMail).not.toHaveBeenCalled();
  });

  it('compte non configuré : ÉCHEC « non configuré », aucun transport créé', async () => {
    const creer = vi.fn();
    const r = await verifierCompteSmtp('profil personne', null, creer);
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining('non configuré') });
    expect(creer).not.toHaveBeenCalled();
  });

  it('les deux comptes SMTP de l’inventaire sont vérifiés : défaut (SMTP_*) et « personne » (SMTP_PERSONNE_*)', () => {
    expect(COMPTES_SMTP.map((c) => c.infixe)).toEqual(['', 'PERSONNE_']);
  });

  it('motif d’erreur lisible, jamais vide', () => {
    expect(motifErreur(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe('ETIMEDOUT — timeout');
    expect(motifErreur('brut')).toBe('brut');
  });
});

describe('Google — seul le jeton et deux lectures peuvent partir', () => {
  const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

  it('fetchLectureSeule laisse passer : POST du jeton, GET du profil Gmail, GET d’une liste d’événements', async () => {
    const reel = vi.fn(async () => reponse({}));
    const f = fetchLectureSeule(reel as unknown as typeof fetch);
    await f(ENDPOINT_JETON_GOOGLE, { method: 'POST' });
    await f(ENDPOINT_GMAIL_PROFIL);
    await f(`${PREFIXE_AGENDA}${encodeURIComponent('a.jorel@sansvisavis.com')}/events?maxResults=1`);
    expect(reel).toHaveBeenCalledTimes(3);
  });

  it('fetchLectureSeule REFUSE avant de partir : envoi Gmail, étiquettes, écriture / suppression d’événement, Drive', async () => {
    const reel = vi.fn(async () => reponse({}));
    const f = fetchLectureSeule(reel as unknown as typeof fetch);
    const interdits: [string, string][] = [
      ['POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'],
      ['POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/abc/modify'],
      ['GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages'],
      ['POST', `${PREFIXE_AGENDA}a.jorel%40sansvisavis.com/events`],
      ['PATCH', `${PREFIXE_AGENDA}a.jorel%40sansvisavis.com/events/xyz`],
      ['DELETE', `${PREFIXE_AGENDA}a.jorel%40sansvisavis.com/events/xyz`],
      ['GET', `${PREFIXE_AGENDA}a.jorel%40sansvisavis.com/events/xyz`],
      ['GET', 'https://www.googleapis.com/drive/v3/files'],
      ['GET', ENDPOINT_JETON_GOOGLE],
    ];
    for (const [method, url] of interdits) await expect(f(url, { method }), `${method} ${url}`).rejects.toThrow('requête refusée');
    expect(reel).not.toHaveBeenCalled();
  });

  it('Gmail : jeton rafraîchi puis profil de gestion@ → OK ; un seul GET, sur le profil', async () => {
    const reel = vi.fn(async (_u: unknown, _i?: unknown) => reponse({ emailAddress: 'gestion@criterimmo.fr', messagesTotal: 1 }));
    const r = await verifierGmail({
      fetch: reel as unknown as typeof fetch, compteAttendu: 'gestion@criterimmo.fr',
      jetonAcces: async () => ({ ok: true, valeur: 'jeton' }),
    });
    expect(r).toMatchObject({ ok: true, detail: 'boîte gestion@criterimmo.fr accessible' });
    expect(reel).toHaveBeenCalledTimes(1);
    expect(reel.mock.calls[0][0]).toBe(ENDPOINT_GMAIL_PROFIL);
  });

  it('Gmail : jeton d’une autre boîte, jeton absent, ou profil illisible → ÉCHEC expliqué', async () => {
    const f = (corps: unknown, status = 200) => vi.fn(async () => reponse(corps, status)) as unknown as typeof fetch;
    const ok = async () => ({ ok: true as const, valeur: 'jeton' });
    expect((await verifierGmail({ fetch: f({ emailAddress: 'arno@gmail.com' }), compteAttendu: 'gestion@criterimmo.fr', jetonAcces: ok })).detail)
      .toBe('le jeton ouvre « arno@gmail.com », pas gestion@criterimmo.fr');
    expect((await verifierGmail({ fetch: f({}), compteAttendu: 'gestion@criterimmo.fr', jetonAcces: async () => ({ ok: false, motif: 'aucun jeton Gmail' }) })))
      .toMatchObject({ ok: false, detail: 'aucun jeton Gmail' });
    expect((await verifierGmail({ fetch: f({}, 401), compteAttendu: 'gestion@criterimmo.fr', jetonAcces: ok })).detail).toBe('profil illisible (HTTP 401)');
  });

  it('Agenda : un GET maxResults=1 limité à la date ; OK avec ou sans événement ; jamais le titre', async () => {
    const reel = vi.fn(async (_u: unknown, _i?: unknown) => reponse({ items: [{ start: { dateTime: '2026-10-15T09:00:00+02:00' }, summary: 'Rendez-vous privé' }] }));
    const r = await verifierAgenda('a.jorel@sansvisavis.com', {
      fetch: reel as unknown as typeof fetch, maintenant: () => new Date('2026-10-14T20:00:00Z'),
      jetonAgenda: async () => ({ ok: true, jeton: 'jeton' }),
    });
    expect(r).toMatchObject({ ok: true, detail: 'accessible — prochain événement le 2026-10-15T09:00:00+02:00' });
    expect(r.detail).not.toContain('Rendez-vous');
    const url = new URL(String(reel.mock.calls[0][0]));
    expect(url.pathname).toBe('/calendar/v3/calendars/a.jorel%40sansvisavis.com/events');
    expect(url.searchParams.get('maxResults')).toBe('1');
    expect(url.searchParams.get('fields')).toBe('items(start)');
    expect(url.searchParams.get('timeMin')).toBe('2026-10-14T20:00:00.000Z');
    expect((reel.mock.calls[0][1] as RequestInit | undefined)?.method ?? 'GET').toBe('GET');

    const vide = vi.fn(async () => reponse({ items: [] })) as unknown as typeof fetch;
    expect((await verifierAgenda('a.jorel@sansvisavis.com', { fetch: vide, maintenant: () => new Date(), jetonAgenda: async () => ({ ok: true, jeton: 'j' }) })).detail)
      .toBe('accessible — aucun événement à venir');
  });

  it('Agenda : délégation refusée → ÉCHEC avec la raison de Google', async () => {
    const r = await verifierAgenda('a.jorel@sansvisavis.com', {
      fetch: vi.fn() as unknown as typeof fetch, maintenant: () => new Date(),
      jetonAgenda: async () => ({ ok: false, motif: 'Agenda pas autorisé par l’administrateur : la délégation ne couvre pas l’agenda.' }),
    });
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining('délégation ne couvre pas') });
  });
});

describe('Drive — lecture seule stricte de la racine de l’application', () => {
  const RACINE = 'RACINE_ID_123';
  const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
  const urlMeta = `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}?fields=id%2Cname%2CmimeType&supportsAllDrives=true`;
  const urlEnfants = (extra = '') => `${ENDPOINT_DRIVE_FICHIERS}?${new URLSearchParams({ q: requeteEnfants(RACINE), fields: 'nextPageToken,files(id)' }).toString()}${extra}`;

  it('les noms protégés et la racine sont ceux du code de l’application (une seule vérité)', () => {
    expect(NOMS_PROTEGES).toEqual([PRODUCTION_INTERDITE, ...SOUS_DOSSIERS_PRODUCTION]);
    expect(NOM_RACINE_APPLICATION).toBe(RACINE_NOM);
    for (const n of ['Documents clients scannés', 'DOCUMENTS CLIENTS SCANNES', '  documents   clients scannés ', '1 actifs', '2 Vendus', '3 perdus']) expect(estNomProtege(n)).toBe(true);
    for (const n of ['Base de données locative', '00 Arrivée des mails', 'Documents clients', '4 archives']) expect(estNomProtege(n)).toBe(false);
  });

  it('PREUVE : toute écriture Drive et toute lecture de contenu sont refusées AVANT de partir', async () => {
    const reel = vi.fn(async () => reponse({}));
    const f = fetchDriveLectureSeule(reel as unknown as typeof fetch, RACINE);
    const interdits: [string, string][] = [
      ['POST', `${ENDPOINT_DRIVE_FICHIERS}?supportsAllDrives=true`],                                   // création
      ['POST', `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`],              // téléversement
      ['POST', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}/copy`],                                          // copie
      ['PATCH', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}?addParents=x&removeParents=y`],                 // déplacement
      ['PATCH', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}`],                                              // renommage / corbeille
      ['DELETE', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}`],                                             // suppression
      ['POST', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}/permissions`],                                   // partage
      ['GET', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}?alt=media`],                                      // contenu
      ['GET', `${ENDPOINT_DRIVE_FICHIERS}/AUTRE_ID?fields=id%2Cname%2CmimeType`],                     // autre dossier
      ['GET', `${ENDPOINT_DRIVE_FICHIERS}?${new URLSearchParams({ q: "'AUTRE_ID' in parents and trashed = false", fields: 'nextPageToken,files(id)' })}`],
      ['GET', `${ENDPOINT_DRIVE_FICHIERS}?${new URLSearchParams({ q: requeteEnfants(RACINE), fields: 'files(id,name,webViewLink)' })}`],
      ['GET', `${ENDPOINT_DRIVE_FICHIERS}/${RACINE}?fields=*`],
      ['GET', 'https://www.googleapis.com/drive/v3/changes?pageToken=1'],
    ];
    for (const [method, url] of interdits) await expect(f(url, { method }), `${method} ${url}`).rejects.toThrow('requête Drive refusée');
    expect(reel).not.toHaveBeenCalled();
    // Les trois requêtes permises passent.
    await f(ENDPOINT_JETON_GOOGLE, { method: 'POST' });
    await f(urlMeta);
    await f(urlEnfants('&pageSize=1000'));
    expect(reel).toHaveBeenCalledTimes(3);
  });

  it('racine lue en base → métadonnées puis enfants directs comptés (pagination) ; OK', async () => {
    const appels: string[] = [];
    const reel = vi.fn(async (u: unknown, _i?: unknown) => {
      const url = String(u);
      appels.push(url);
      if (url.startsWith(`${ENDPOINT_DRIVE_FICHIERS}/${RACINE}`)) return reponse({ id: RACINE, name: 'Base de données locative' });
      return url.includes('pageToken=p2') ? reponse({ files: [{ id: 'c' }] }) : reponse({ files: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' });
    });
    const r = await verifierDrive({
      fetch: reel as unknown as typeof fetch, sujet: 'gestion@criterimmo.fr',
      lireRacine: async () => ({ id: RACINE, nom: 'Base de données locative' }),
      jetonDrive: async () => ({ ok: true, jeton: 'jeton' }),
    });
    expect(r).toMatchObject({ ok: true, detail: `racine « Base de données locative » (${RACINE}) accessible — 3 enfant(s) direct(s)` });
    expect(appels).toHaveLength(3);
    expect(reel.mock.calls.every((c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it('🔴 racine enregistrée sous un nom protégé : REFUSÉ avant tout appel (pas même le jeton)', async () => {
    const reel = vi.fn();
    const jetonDrive = vi.fn();
    const r = await verifierDrive({
      fetch: reel as unknown as typeof fetch, sujet: 'gestion@criterimmo.fr',
      lireRacine: async () => ({ id: RACINE, nom: 'Documents clients scannés' }), jetonDrive,
    });
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining('REFUSÉ') });
    expect(reel).not.toHaveBeenCalled();
    expect(jetonDrive).not.toHaveBeenCalled();
  });

  it('🔴 l’identifiant désigne en réalité un dossier protégé : REFUSÉ après les seules métadonnées, aucun enfant listé', async () => {
    const reel = vi.fn(async () => reponse({ id: RACINE, name: '1 actifs' }));
    const r = await verifierDrive({
      fetch: reel as unknown as typeof fetch, sujet: 'gestion@criterimmo.fr',
      lireRacine: async () => ({ id: RACINE, nom: 'Base de données locative' }), jetonDrive: async () => ({ ok: true, jeton: 'j' }),
    });
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining('dossier protégé') });
    expect(reel).toHaveBeenCalledTimes(1);
  });

  it('pas de racine en base, jeton refusé, ou identifiant d’un autre dossier : ÉCHEC expliqué', async () => {
    const base = { fetch: vi.fn(async () => reponse({ id: RACINE, name: 'Autre chose' })) as unknown as typeof fetch, sujet: 'gestion@criterimmo.fr' };
    expect((await verifierDrive({ ...base, lireRacine: async () => null, jetonDrive: async () => ({ ok: true, jeton: 'j' }) })).detail).toContain('aucune racine');
    expect((await verifierDrive({ ...base, lireRacine: async () => ({ id: RACINE, nom: 'Base de données locative' }), jetonDrive: async () => ({ ok: false, motif: 'Drive pas encore configuré par l’administrateur.' }) })).detail)
      .toBe('Drive pas encore configuré par l’administrateur.');
    expect((await verifierDrive({ ...base, lireRacine: async () => ({ id: RACINE, nom: 'Base de données locative' }), jetonDrive: async () => ({ ok: true, jeton: 'j' }) })).detail)
      .toContain('« Autre chose », pas « Base de données locative »');
  });
});
