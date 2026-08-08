import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R6 — l'adaptateur IMAP multi-boîtes de la relève approfondie (`creerClientApprofondi`) : il LISTE toutes les boîtes (en
 * écartant les conteneurs non sélectionnables \Noselect) et les ouvre TOUJOURS en LECTURE STRICTE (readOnly / EXAMINE) —
 * INBOX comme indésirables. On mocke imapflow pour vérifier que `mailboxOpen` reçoit bien `{ readOnly: true }`. Aucune connexion.
 */
const h = vi.hoisted(() => ({
  fake: {
    connect: vi.fn(async () => {}),
    list: vi.fn(async () => [
      { path: 'INBOX', flags: new Set<string>() },
      { path: '[Gmail]/Spam', flags: new Set<string>(['\\Junk']) },
      { path: '[Gmail]', flags: new Set<string>(['\\Noselect']) }, // conteneur : à écarter
    ]),
    mailboxOpen: vi.fn(async () => ({})),
    search: vi.fn(async () => [] as number[]),
    fetchOne: vi.fn(async () => false),
    logout: vi.fn(async () => {}),
  },
}));
// `new ImapFlow(...)` doit être constructible : une fonction (nommée) qui recopie le faux client sur l'instance.
vi.mock('imapflow', () => ({ ImapFlow: vi.fn(function FakeImapFlow(this: Record<string, unknown>) { Object.assign(this, h.fake); }) }));

import { creerClientApprofondi } from './imap';

const COMPTE = { host: 'imap.exemple.fr', port: 993, user: 'u@exemple.fr', pass: 'secret', tls: true };

beforeEach(() => { vi.clearAllMocks(); });

describe('R6 — creerClientApprofondi : multi-boîtes en LECTURE STRICTE', () => {
  it('listerBoites : renvoie les chemins sélectionnables, écarte \\Noselect', async () => {
    const c = creerClientApprofondi(COMPTE);
    await c.ouvrir();
    expect(h.fake.connect).toHaveBeenCalledTimes(1);
    expect(await c.listerBoites()).toEqual(['INBOX', '[Gmail]/Spam']); // le conteneur [Gmail] est écarté
  });

  it('ouvrirBoite : ouvre TOUJOURS en readOnly (EXAMINE), y compris les indésirables', async () => {
    const c = creerClientApprofondi(COMPTE);
    await c.ouvrir();
    await c.ouvrirBoite('[Gmail]/Spam');
    expect(h.fake.mailboxOpen).toHaveBeenCalledWith('[Gmail]/Spam', { readOnly: true });
    await c.ouvrirBoite('INBOX');
    expect(h.fake.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true });
    // AUCUNE écriture dans la boîte : pas d'ajout/retrait de flag, pas de déplacement/suppression.
    expect((h.fake as Record<string, unknown>).messageFlagsAdd).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageMove).toBeUndefined();
    expect((h.fake as Record<string, unknown>).messageDelete).toBeUndefined();
  });
});
