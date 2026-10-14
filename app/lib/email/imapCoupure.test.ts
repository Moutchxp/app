import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * ══ LOT RELÈVE-QUI-SURVIT-AUX-COUPURES-IMAP (Arno, 14/10/2026) ══════════════════════════════════════════════════════════
 * Un FAUX client imapflow (aucune connexion, aucune vraie boîte) qui reproduit ce que fait la vraie bibliothèque sur une
 * coupure (imapflow 1.6.6, comportement MESURÉ sur le faux serveur local) : « error » émis sur l'instance (imap-flow.js:509),
 * puis « close » ; et `search()` ne rejette PAS — elle rend `false` (commands/search.js:186-189), ou `undefined` quand la
 * boîte n'est plus ouverte (imap-flow.js:3254-3257). Une fermeture propre par le serveur n'émet que « close ».
 * On éprouve, pour la RELÈVE AUTOMATIQUE et la CAPTURE DES ENVOYÉS :
 *   · le processus ne meurt pas (l'émission d'« error » ne jette plus) ;
 *   · l'opération coupée ÉCHOUE (`ErreurConnexionImap`) — jamais un résultat vide pris pour un succès ;
 *   · la connexion est fermée (LOGOUT tenté puis socket fermé), même si le LOGOUT échoue ;
 *   · la coupure est journalisée comme une ERREUR ;
 *   · le run passe « erreur », le verrou est relâché, et la passe suivante reprend ;
 *   · rien ne change à la lecture : EXAMINE (`readOnly`), et le fonctionnement normal reste celui d'avant.
 * La preuve de l'échec AVANT correctif, sur la vraie bibliothèque et un faux serveur local, est dans
 * `.captures/releve-coupures-imap/` (processus mort en ~0,1 s ; serveur muet : bloqué 300 s puis mort).
 */
const F = vi.hoisted(() => {
  type Scenario = 'normal' | 'coupure-operation' | 'fermeture-serveur' | 'coupure-au-repos' | 'logout-echoue';
  const etat = { scenario: 'normal' as Scenario, instances: [] as unknown[] };
  return { etat };
});

vi.mock('imapflow', async () => {
  const { EventEmitter: EE } = await import('node:events');
  class FauxImapFlow extends EE {
    options: Record<string, unknown>;
    fermetures = 0;
    logouts = 0;
    ouvertures: { chemin: string; opts: unknown }[] = [];
    constructor(options: Record<string, unknown>) { super(); this.options = options; F.etat.instances.push(this); }
    async connect(): Promise<void> {}
    async list() { return [{ path: 'Sent', specialUse: '\\Sent', flags: new Set<string>() }, { path: 'INBOX', flags: new Set<string>() }]; }
    async mailboxOpen(chemin: string, opts: unknown) { this.ouvertures.push({ chemin, opts }); return { uidValidity: 1 }; }
    /** Comme imapflow 1.6.6 : sur coupure, « error » puis « close » sont émis, et `search` RÉSOUT `false` (elle ne rejette pas). */
    search(): Promise<number[] | false | undefined> {
      const sc = F.etat.scenario;
      if (sc === 'coupure-au-repos') return Promise.resolve(undefined); // boîte déjà fermée par la coupure : imapflow rend undefined
      if (sc !== 'coupure-operation' && sc !== 'fermeture-serveur') return Promise.resolve([1, 2, 3]);
      return new Promise((resoudre) => {
        setImmediate(() => {
          if (sc === 'coupure-operation') this.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })); // SANS écouteur : jette
          this.emit('close');
          resoudre(false);
        });
      });
    }
    /** Coupure au repos, après l'ouverture : ce que fait imapflow quand le socket tombe entre deux commandes. */
    couperAuRepos(): void { this.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })); this.emit('close'); }
    async *fetch() { yield { uid: 1, envelope: { inReplyTo: '<m@mairie>', to: [{ address: 'urba@mairie.fr' }], cc: [] }, headers: Buffer.from('References: <m@mairie>\r\n') }; }
    async logout(): Promise<void> { this.logouts += 1; if (F.etat.scenario === 'logout-echoue') throw new Error('NoConnection'); this.emit('close'); } // un LOGOUT réussi ferme la connexion
    close(): void { this.fermetures += 1; }
  }
  return { ImapFlow: FauxImapFlow };
});

import { creerClientBoite, creerClientEnvoyes, DELAIS_IMAP, ErreurConnexionImap } from './imap';
import { executerReleveManuelle, executerReleveDemandee, type DepsReleveAuto } from '../veille/releveAuto';

type Faux = EventEmitter & { options: Record<string, unknown>; fermetures: number; logouts: number; ouvertures: { chemin: string; opts: unknown }[]; couperAuRepos(): void };
const derniere = (): Faux => F.etat.instances[F.etat.instances.length - 1] as Faux;
const COMPTE = { host: 'imap.exemple.test', port: 993, tls: true, user: 'u', pass: 'p' } as never;

let erreurs: ReturnType<typeof vi.spyOn>;
beforeEach(() => { F.etat.scenario = 'normal'; F.etat.instances.length = 0; erreurs = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { erreurs.mockRestore(); });

describe('MESURE — sans écouteur, l’émission d’« error » JETTE (le mécanisme qui tuait le processus)', () => {
  it('un EventEmitter Node qui émet « error » sans écouteur lève l’erreur — c’est ce que fait ImapFlow.emitError', () => {
    const nu = new EventEmitter();
    expect(() => nu.emit('error', new Error('read ECONNRESET'))).toThrow('read ECONNRESET');
  });
});

describe.each([
  ['relève automatique', () => creerClientBoite(COMPTE)],
  ['dossier envoyés', () => creerClientEnvoyes(COMPTE)],
] as const)('%s — l’adaptateur survit à la coupure', (chemin, fabriquer) => {
  it('délais EXPLICITES, aux valeurs par défaut d’imapflow 1.6.6 (fonctionnement normal inchangé)', () => {
    fabriquer();
    expect(derniere().options).toMatchObject({ connectionTimeout: 90_000, greetingTimeout: 16_000, socketTimeout: 300_000 });
    expect(DELAIS_IMAP).toEqual({ connexionMs: 90_000, accueilMs: 16_000, socketMs: 300_000 });
  });

  it('un écouteur « error » est TOUJOURS posé : l’émission ne jette plus, et la coupure est journalisée comme une ERREUR', () => {
    fabriquer();
    const c = derniere();
    expect(c.listenerCount('error')).toBe(1);
    expect(c.listenerCount('close')).toBe(1);
    expect(() => c.emit('error', Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' }))).not.toThrow();
    expect(erreurs).toHaveBeenCalledWith(`[imap] ${chemin} — connexion IMAP perdue (ETIMEOUT) : Socket timeout`);
  });

  it('fermer() : LOGOUT tenté, puis socket fermé ; et toujours fermé même si le LOGOUT échoue (aucune connexion orpheline)', async () => {
    const client = fabriquer();
    await client.fermer();
    expect(derniere().logouts).toBe(1);
    expect(derniere().fermetures).toBe(1);
    F.etat.scenario = 'logout-echoue';
    const client2 = fabriquer();
    await expect(client2.fermer()).resolves.toBeUndefined();
    expect(derniere().fermetures).toBe(1);
  });
});

describe('relève automatique — coupure en pleine opération', () => {
  it('l’opération ÉCHOUE (et non « aucun message »), la boîte avait été ouverte en lecture seule, et fermer() ferme', async () => {
    F.etat.scenario = 'coupure-operation';
    const client = creerClientBoite(COMPTE);
    await client.ouvrir();
    expect(derniere().ouvertures).toEqual([{ chemin: 'INBOX', opts: { readOnly: true } }]); // EXAMINE, inchangé
    await expect(client.chercher({ depuis: new Date('2026-01-01') })).rejects.toBeInstanceOf(ErreurConnexionImap);
    await client.fermer();
    expect(derniere().fermetures).toBe(1);
    expect(erreurs).toHaveBeenCalledWith('[imap] relève automatique — connexion IMAP perdue (ECONNRESET) : read ECONNRESET');
  });

  it('fermeture PROPRE par le serveur (« close » sans « error ») et coupure au repos : échec aussi, jamais un succès vide', async () => {
    F.etat.scenario = 'fermeture-serveur';
    const a = creerClientBoite(COMPTE);
    await a.ouvrir();
    await expect(a.chercher({ depuis: new Date('2026-01-01') })).rejects.toThrow('relève automatique — connexion IMAP perdue : connexion fermée par le serveur');
    await a.fermer();
    F.etat.scenario = 'coupure-au-repos';
    const b = creerClientBoite(COMPTE);
    await b.ouvrir();
    derniere().couperAuRepos();
    await expect(b.chercherReferences(new Date('2026-01-01'), ['PC 092 004 26 00001'])).rejects.toBeInstanceOf(ErreurConnexionImap);
    await b.fermer();
    expect(derniere().fermetures).toBe(1);
  });

  it('fonctionnement normal : mêmes résultats qu’avant, et le LOGOUT (qui ferme la connexion) n’est pas pris pour une coupure', async () => {
    const client = creerClientBoite(COMPTE);
    await client.ouvrir();
    expect(await client.chercher({ depuis: new Date('2026-01-01') })).toEqual([1, 2, 3]);
    await client.fermer();
    expect(erreurs).not.toHaveBeenCalled();
  });

  it('le run passe « erreur » avec le motif, le verrou est relâché, et la passe suivante reprend « ok »', async () => {
    const finaliser = vi.fn(async () => {});
    // `relever` reproduit la forme de releverBoite (releveReponses.ts:491/636-637) : ouvrir, lire, et fermer dans un finally.
    const deps = (): DepsReleveAuto => ({
      maintenant: () => new Date('2026-10-14T10:00:00Z'),
      lireConfig: async () => ({ active: true, intervalleMinutes: 15, profil: 'entreprise' }),
      dernierOkLe: async () => null,
      creerClient: async () => creerClientBoite(COMPTE),
      relever: async (client) => {
        await client.ouvrir();
        try { await client.chercher({ depuis: new Date('2026-01-01') }); }
        finally { await client.fermer(); }
        return { retenus: 0, rattaches: 0, ecrites: 0 } as never;
      },
      insererRun: async () => 7,
      finaliserRun: finaliser,
    });
    const verrou = { pris: 0, rendu: 0 };
    const demandee = (d: DepsReleveAuto) => executerReleveDemandee({
      acquerirVerrou: async () => { verrou.pris += 1; return true; },
      libererVerrou: async () => { verrou.rendu += 1; },
      relever: () => executerReleveManuelle(d),
    });

    F.etat.scenario = 'coupure-operation';
    const issue = await demandee(deps());
    expect(issue.resultat).toBe('erreur');                              // jamais « ok »
    expect(issue.raison).toContain('connexion IMAP perdue : read ECONNRESET');
    expect(finaliser).toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'erreur' }));
    expect(finaliser).not.toHaveBeenCalledWith(7, expect.objectContaining({ resultat: 'ok' }));
    expect(derniere().fermetures).toBe(1);                              // connexion fermée
    expect(verrou).toEqual({ pris: 1, rendu: 1 });                      // verrou relâché

    F.etat.scenario = 'normal';
    expect((await demandee(deps())).resultat).toBe('ok');               // la passe suivante reprend
    expect(verrou).toEqual({ pris: 2, rendu: 2 });
  });
});

describe('dossier envoyés — coupure en pleine opération', () => {
  it('lireEntetesReponses et lireSortantsComplets REJETTENT, la connexion est fermée', async () => {
    for (const lire of ['lireEntetesReponses', 'lireSortantsComplets'] as const) {
      F.etat.scenario = 'coupure-operation';
      const client = creerClientEnvoyes(COMPTE);
      await client.ouvrir();
      expect(derniere().ouvertures).toEqual([{ chemin: 'Sent', opts: { readOnly: true } }]); // EXAMINE, inchangé
      await expect(client[lire](['<m@mairie>'], new Date('2026-01-01'))).rejects.toMatchObject({ name: 'ErreurConnexionImap', code: 'NoConnection' });
      await client.fermer();
      expect(derniere().fermetures).toBe(1);
    }
  });

  it('fonctionnement normal : les en-têtes lus comme avant', async () => {
    const client = creerClientEnvoyes(COMPTE);
    await client.ouvrir();
    expect(await client.lireEntetesReponses(['<m@mairie>'], new Date('2026-01-01')))
      .toEqual([{ inReplyTo: '<m@mairie>', references: ['<m@mairie>'], destinataires: ['urba@mairie.fr'] }]);
    await client.fermer();
    expect(erreurs).not.toHaveBeenCalled();
  });
});
