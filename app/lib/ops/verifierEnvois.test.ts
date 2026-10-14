import { describe, it, expect, vi } from 'vitest';
import {
  COMPTES_SMTP, ENDPOINT_GMAIL_PROFIL, ENDPOINT_JETON_GOOGLE, PREFIXE_AGENDA,
  fetchLectureSeule, motifErreur, verifierAgenda, verifierCompteSmtp, verifierGmail,
} from './verifierEnvois';

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
