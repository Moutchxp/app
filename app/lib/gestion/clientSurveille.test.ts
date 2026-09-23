import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ErreurConnexion, noterErreur, nouvelEtat, surveiller, type ClientDossier } from './clientSurveille';

/**
 * LOT 3-ter — la surveillance de la connexion. Ce qui est en jeu, mesuré sur l'incident du 23/09 :
 *   ① une panne réseau TUAIT le processus (événement « error » sans écouteur) ;
 *   ② une connexion morte passait pour un SUCCÈS (« 3 capturés, 397 illisibles »).
 * La pièce qui répare les deux est la DISTINCTION entre panne de MESSAGE et panne de CONNEXION.
 */

/** Client faux : on décide quel appel échoue, et si l'écouteur d'erreur a été déclenché entre-temps. */
function clientFaux(over: { echoue?: (quoi: string) => Error | null } = {}) {
  const appels: string[] = [];
  const jette = (quoi: string) => { appels.push(quoi); const e = over.echoue?.(quoi); if (e) throw e; };
  const c: ClientDossier = {
    ouvrir: async () => { jette('ouvrir'); },
    ouvrirBoite: async () => { jette('ouvrirBoite'); },
    chercher: async () => { jette('chercher'); return [1, 2, 3]; },
    telechargerMessage: async (uid) => {
      jette(`telecharger:${uid}`);
      return { uid, recuLe: new Date(), deNom: null, pieces: [], message: { messageId: `<m${uid}@x>`, deAdresse: 'a@x.fr', entetes: {} } };
    },
    fermer: async () => { appels.push('fermer'); },
  };
  return { c, appels };
}

describe('l’écouteur d’erreur — la pièce qui empêche le processus de mourir', () => {
  it('retient la PREMIÈRE erreur (la cause), pas les suivantes (qui en découlent)', () => {
    const etat = nouvelEtat();
    const sur = noterErreur(etat);
    sur(new Error('Socket timeout'));
    sur(new Error('Connection closed'));
    expect(etat.erreur?.message).toBe('Socket timeout');
  });

  it('un état neuf ne porte aucune erreur', () => {
    expect(nouvelEtat().erreur).toBeNull();
  });
});

describe('panne de MESSAGE ≠ panne de CONNEXION', () => {
  it('un message illisible est rendu TEL QUEL : la passe pourra continuer', async () => {
    const { c } = clientFaux({ echoue: (q) => (q === 'telecharger:2' ? new Error('MIME cassé') : null) });
    const client = surveiller(c, nouvelEtat());
    await expect(client.telechargerMessage(2)).rejects.toThrow('MIME cassé');
    await expect(client.telechargerMessage(2)).rejects.not.toBeInstanceOf(ErreurConnexion);
  });

  it('un échec APRÈS une erreur de connexion notée devient une ErreurConnexion, qui NOMME la vraie cause', async () => {
    const etat = nouvelEtat();
    const { c } = clientFaux({ echoue: () => { noterErreur(etat)(new Error('Socket timeout')); return new Error('command failed'); } });
    const client = surveiller(c, etat);
    const erreur = await client.telechargerMessage(7).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurConnexion);
    expect((erreur as Error).message).toContain('Socket timeout'); // « command failed » aurait caché la cause
    expect((erreur as Error).message).toContain('message 7');
  });

  it('tout appel SUIVANT échoue vite, sans même déranger le serveur', async () => {
    const etat = nouvelEtat();
    const { c, appels } = clientFaux();
    const client = surveiller(c, etat);
    noterErreur(etat)(new Error('Socket timeout'));
    await expect(client.telechargerMessage(1)).rejects.toBeInstanceOf(ErreurConnexion);
    await expect(client.chercher({ depuis: new Date() })).rejects.toBeInstanceOf(ErreurConnexion);
    expect(appels).toEqual([]); // aucun appel n'a été tenté : la connexion est morte, inutile d'insister
  });

  it('chaque étape nomme ce qu’elle faisait — un message d’échec doit se lire sans le code sous les yeux', async () => {
    const etat = nouvelEtat();
    noterErreur(etat)(new Error('Socket timeout'));
    const client = surveiller(clientFaux().c, etat);
    for (const [appel, mot] of [
      [() => client.ouvrir(), 'la connexion'],
      [() => client.ouvrirBoite('_GESTION BOITE MAIL'), '_GESTION BOITE MAIL'],
      [() => client.chercher({ depuis: new Date() }), 'la recherche'],
      [() => client.telechargerMessage(42), 'message 42'],
    ] as [() => Promise<unknown>, string][]) {
      await expect(appel()).rejects.toThrow(mot);
    }
  });

  it('la FERMETURE reste silencieuse même connexion tombée — sinon elle masquerait la vraie cause', async () => {
    const etat = nouvelEtat();
    noterErreur(etat)(new Error('Socket timeout'));
    const { c, appels } = clientFaux();
    await expect(surveiller(c, etat).fermer()).resolves.toBeUndefined();
    expect(appels).toEqual(['fermer']);
  });

  it('sans incident, l’enveloppe est transparente', async () => {
    const { c } = clientFaux();
    const client = surveiller(c, nouvelEtat());
    await client.ouvrir();
    await client.ouvrirBoite('X');
    expect(await client.chercher({ depuis: new Date() })).toEqual([1, 2, 3]);
    expect((await client.telechargerMessage(5)).uid).toBe(5);
  });
});

describe('garantie STATIQUE — le module reste pur, et imap.ts reste opt-in', () => {
  it('clientSurveille n’importe rien : ni imapflow, ni base, ni stockage', () => {
    const src = readFileSync('app/lib/gestion/clientSurveille.ts', 'utf8');
    const modules = src.split('\n').filter((l) => !/^\s*import\s+type\b/.test(l))
      .flatMap((l) => [...l.matchAll(/(?:from\s*|import\s*\(\s*|^\s*import\s+)'([^']+)'/g)].map((m) => m[1]));
    expect(modules).toEqual([]);
  });

  it('imap.ts n’attache l’écouteur QUE si l’appelant le fournit → le module Permis est inchangé', () => {
    const src = readFileSync('app/lib/email/imap.ts', 'utf8');
    expect(src).toContain("if (surErreur) client.on('error', surErreur);");
    // Un SEUL écouteur, et il est conditionnel : aucun `.on(` inconditionnel n'a été ajouté à ce fichier.
    const ecouteurs = [...src.matchAll(/^\s*(?:if \([^)]*\) )?client\.on\(/gm)].map((m) => m[0].trim());
    expect(ecouteurs).toEqual(["if (surErreur) client.on("]);
  });

  it('la relève RÉELLE fournit bien l’écouteur ET l’enveloppe (sinon tout ceci ne servirait à rien)', () => {
    const src = readFileSync('app/lib/gestion/releveReelle.ts', 'utf8');
    expect(src).toContain('creerClientApprofondi(compte, noterErreur(etat))');
    expect(src).toContain('surveiller(brut, etat)');
  });
});
