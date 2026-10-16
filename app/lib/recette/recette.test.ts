import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * MODE RECETTE (lot RECETTE-MAC) : activation et refus, ce qui est intercepté, verrou réseau, SMTP. Aucun accès réseau :
 * le `fetch` de base est un faux, la boîte de test est remplacée par un relevé en mémoire.
 */
const { depots } = vi.hoisted(() => ({ depots: [] as Record<string, unknown>[] }));
vi.mock('./boite', async (orig) => ({ ...(await orig<typeof import('./boite')>()), deposerDansBoite: (e: Record<string, unknown>) => { depots.push(e); } }));

import { etatRecette, modeRecette } from './mode';
import { decisionRecette, resumerRfc822 } from './interception';
import { installerVerrouRecette, verrouRecettePose } from './installer';
import { obtenirTransporteur } from '../email';

const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('activation : `npm run recette` seulement, et jamais en production', () => {
  const MAC = { SVAV_RECETTE: '1', NODE_ENV: 'development', SITE_URL: 'https://x.trycloudflare.com' };
  it('Mac, serveur de développement, SVAV_RECETTE=1 → actif', () => {
    expect(etatRecette(MAC, 'MacBook-Pro-de-Arnaud.local')).toEqual({ actif: true });
  });
  it('sans la variable → inactif, et rien n’est signalé', () => {
    expect(etatRecette({ NODE_ENV: 'development' }, 'mac')).toEqual({ actif: false, demande: false });
    expect(etatRecette({ SVAV_RECETTE: 'true', NODE_ENV: 'development' }, 'mac')).toEqual({ actif: false, demande: false }); // « 1 » exactement
  });
  it('REFUSÉ en production : NODE_ENV=production, adresse de la production, ou machine svav-prod', () => {
    expect(etatRecette({ ...MAC, NODE_ENV: 'production' }, 'mac')).toMatchObject({ actif: false, demande: true, refus: 'NODE_ENV=production' });
    expect(etatRecette({ ...MAC, SITE_URL: 'https://authentification.sansvisavis.com' }, 'mac')).toMatchObject({ actif: false, refus: expect.stringContaining('SITE_URL') });
    expect(etatRecette({ ...MAC, GESTION_URL_APPLICATION: 'https://authentification.sansvisavis.com/' }, 'mac')).toMatchObject({ actif: false, refus: expect.stringContaining('GESTION_URL_APPLICATION') });
    expect(etatRecette(MAC, 'svav-prod')).toMatchObject({ actif: false, refus: expect.stringContaining('svav-prod') });
  });
});

describe('ce qui est intercepté', () => {
  it('lectures et demande de jeton : laissées passer', () => {
    expect(decisionRecette('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x', 'GET', 'i').action).toBe('laisser');
    expect(decisionRecette('https://www.googleapis.com/drive/v3/files/abc', undefined, 'i').action).toBe('laisser');
    expect(decisionRecette('https://oauth2.googleapis.com/token', 'POST', 'i').action).toBe('laisser');
  });
  it('envoi Gmail (y compris /upload/) → simulé « envoyé », identifiant recette-', () => {
    for (const u of ['https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send']) {
      expect(decisionRecette(u, 'POST', 'abc')).toMatchObject({ action: 'simuler', canal: 'gmail_envoi', statut: 200, corps: { id: 'recette-abc' } });
    }
  });
  it('autres écritures Gmail (libellés, lu/non lu, corbeille, suppression) → simulées, la vraie boîte n’est pas touchée', () => {
    expect(decisionRecette('https://gmail.googleapis.com/gmail/v1/users/me/messages/1/modify', 'POST', 'i')).toMatchObject({ action: 'simuler', canal: 'gmail_ecriture' });
    expect(decisionRecette('https://gmail.googleapis.com/gmail/v1/users/me/threads/1/trash', 'POST', 'i')).toMatchObject({ canal: 'gmail_ecriture' });
    expect(decisionRecette('https://gmail.googleapis.com/gmail/v1/users/me/messages/1', 'DELETE', 'i')).toMatchObject({ canal: 'gmail_ecriture', statut: 204 });
  });
  it('agenda : création, modification, suppression → simulées', () => {
    expect(decisionRecette('https://www.googleapis.com/calendar/v3/calendars/primary/events', 'POST', 'i')).toMatchObject({ action: 'simuler', canal: 'agenda', statut: 200 });
    expect(decisionRecette('https://www.googleapis.com/calendar/v3/calendars/primary/events/e1', 'PATCH', 'i')).toMatchObject({ canal: 'agenda' });
    expect(decisionRecette('https://www.googleapis.com/calendar/v3/calendars/primary/events/e1', 'DELETE', 'i')).toMatchObject({ canal: 'agenda', statut: 204 });
  });
  it('Drive : toute écriture REFUSÉE (403, message RECETTE), envoi de fichier compris ; lots Google refusés', () => {
    for (const [u, m] of [['https://www.googleapis.com/drive/v3/files', 'POST'], ['https://www.googleapis.com/drive/v3/files/x', 'PATCH'], ['https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', 'POST'], ['https://www.googleapis.com/drive/v3/files/x', 'DELETE']]) {
      expect(decisionRecette(u, m, 'i')).toMatchObject({ action: 'refuser', canal: 'drive', statut: 403 });
    }
    expect(decisionRecette('https://www.googleapis.com/batch/drive/v3', 'POST', 'i')).toMatchObject({ action: 'refuser', canal: 'google_lot' });
  });
  it('le reste (IA, base d’adresses, autres sites) : inchangé', () => {
    expect(decisionRecette('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', 'POST', 'i').action).toBe('laisser');
    expect(decisionRecette('https://api-adresse.data.gouv.fr/search/?q=x', 'GET', 'i').action).toBe('laisser');
  });
  it('résumé d’un message RFC 822 : destinataires et objet (MIME décodé)', () => {
    const raw = b64url('To: a@b.fr\r\nCc: c@d.fr\r\nSubject: =?UTF-8?B?' + Buffer.from('Tâche à accepter').toString('base64') + '?=\r\n\r\ncorps');
    expect(resumerRfc822(raw)).toEqual({ a: 'a@b.fr, c@d.fr', objet: 'Tâche à accepter' });
  });
});

describe('le verrou réseau et le SMTP', () => {
  const avant = { fetch: globalThis.fetch, env: { ...process.env } };
  beforeEach(() => { depots.length = 0; });
  afterEach(() => { globalThis.fetch = avant.fetch; process.env = { ...avant.env }; });

  it('posé : les lectures vont au vrai fetch ; un envoi Gmail NE l’atteint PAS et va dans la boîte de test', async () => {
    const base = vi.fn(async () => new Response('{"ok":1}', { status: 200 }));
    globalThis.fetch = base as unknown as typeof fetch;
    expect(installerVerrouRecette()).toBe(true);
    expect(verrouRecettePose()).toBe(true);
    expect(installerVerrouRecette()).toBe(false); // idempotent
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/1');
    expect(base).toHaveBeenCalledTimes(1);
    const raw = b64url('To: locataire@example.invalid\r\nSubject: Quittance\r\n\r\nx');
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
    expect(base).toHaveBeenCalledTimes(1); // rien n'est parti
    expect((await r.json()).id).toMatch(/^recette-/);
    expect(depots).toEqual([expect.objectContaining({ canal: 'gmail_envoi', issue: 'intercepte', a: 'locataire@example.invalid', objet: 'Quittance' })]);
    const d = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: '{}' });
    expect(d.status).toBe(403);
    expect(base).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(depots)).not.toMatch(/Bearer|Authorization/);
  });

  it('SMTP en recette : aucun serveur contacté, message dans la boîte, réponse « 250 RECETTE »', async () => {
    process.env.SVAV_RECETTE = '1'; delete process.env.SITE_URL; delete process.env.GESTION_URL_APPLICATION;
    expect(modeRecette()).toBe(true);
    const info = await obtenirTransporteur({ host: '127.0.0.1', port: 9, user: 'u', pass: 'p' })
      .sendMail({ from: 'a@b.fr', to: 'proprio@example.invalid', subject: 'Votre certificat', text: 'Bonjour', attachments: [{ filename: 'certificat.pdf', content: Buffer.from('x') }] });
    expect(String(info.response)).toContain('RECETTE');
    expect(depots).toEqual([expect.objectContaining({ canal: 'smtp', a: 'proprio@example.invalid', objet: 'Votre certificat', apercu: 'Bonjour', pieces: ['certificat.pdf'] })]);
  });

  it('hors recette : le transporteur SMTP réel est rendu (comportement inchangé)', () => {
    delete process.env.SVAV_RECETTE;
    const t = obtenirTransporteur({ host: 'smtp.example.invalid', port: 587, user: 'u', pass: 'p' });
    expect((t as unknown as { options?: { host?: string } }).options?.host).toBe('smtp.example.invalid');
  });
});
