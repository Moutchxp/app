import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { debutFenetre, executerSonde, versSonde, type DepsSonde } from './sonder-gestion';
import type { ClientApprofondi } from '../lib/veille/releveApprofondie'; // TYPE SEUL — le faux client est vérifié CONTRE le vrai contrat
import type { MessageBoite } from '../lib/veille/releveReponses';

/**
 * CLI `gestion:sonder` — LOT 0. Le cœur `executerSonde` est testé avec un client FAUX : aucun IMAP, aucune base, aucun
 * réseau. Deux familles de garanties : le COMPORTEMENT (lister, choisir le dossier, échantillonner, isoler un message
 * illisible, toujours refermer) et une garantie STATIQUE — le fichier n'atteint AUCUN chemin d'écriture, ce qui rend la
 * lecture stricte vérifiable et pas seulement promise.
 */

/** Un message minimal, à la forme exacte que `versMessageBoite` (imap.ts) produit. */
function boite(uid: number, objet: string | null = 'Objet'): MessageBoite {
  return { uid, recuLe: new Date(), deNom: null, pieces: [], message: { messageId: `<m${uid}@x.fr>`, deAdresse: 'a@x.fr', objet: objet ?? undefined, entetes: {} } };
}

/** Client IMAP FAUX, TYPÉ `ClientApprofondi` : si le contrat d'imap.ts changeait, ce fichier ne compilerait plus. */
function clientFaux(over: {
  boites?: string[];
  uidsParRecherche?: (from: string | undefined) => number[];
  telecharger?: (uid: number) => Promise<MessageBoite>;
  chercherJette?: boolean;
} = {}) {
  const appels = { ouvrirBoite: [] as string[], fermer: 0, telecharges: [] as number[], recherches: [] as (string | undefined)[] };
  const client: ClientApprofondi = {
    ouvrir: async () => {},
    listerBoites: async () => over.boites ?? ['INBOX', 'GESTION'],
    ouvrirBoite: async (chemin: string) => { appels.ouvrirBoite.push(chemin); },
    chercher: async (c: { depuis: Date; from?: string }) => {
      appels.recherches.push(c.from);
      if (over.chercherJette) throw new Error('recherche impossible');
      return (over.uidsParRecherche ?? ((f) => (f === undefined ? [1, 2] : [2])))(c.from);
    },
    telechargerMessage: async (uid: number) => {
      appels.telecharges.push(uid);
      return over.telecharger ? over.telecharger(uid) : boite(uid);
    },
    fermer: async () => { appels.fermer += 1; },
  };
  return { client, appels };
}

/** Dépendances injectées : instant FIGÉ (rapport reproductible) et journal en mémoire. */
function deps(client: ClientApprofondi | null): { d: DepsSonde; lignes: string[] } {
  const lignes: string[] = [];
  return { lignes, d: { creerClient: () => client, maintenant: () => new Date('2026-09-23T10:00:00Z'), log: (s) => lignes.push(s) } };
}

describe('gestion:sonder — garanties de LECTURE STRICTE', () => {
  const src = readFileSync('app/scripts/sonder-gestion.ts', 'utf8');
  /**
   * Modules présents dans le graphe D'EXÉCUTION : imports statiques et dynamiques, à l'EXCLUSION des `import type`
   * (entièrement effacés à la compilation — ils n'amènent aucun code). Les commentaires, eux, ne pèsent rien.
   */
  const modules = src.split('\n')
    .filter((l) => !/^\s*import\s+type\b/.test(l))
    .flatMap((l) => [...l.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1]));

  it('n’atteint AUCUN chemin d’écriture : ni base, ni stockage objet, ni envoi', () => {
    expect(modules).toContain('../lib/email/imap'); // le relevé fonctionne (sinon le test passerait pour rien)
    for (const interdit of ['db/client', 'lib/db', 'stockage', 'nodemailer', 'Repo']) {
      expect(modules.filter((m) => m.includes(interdit))).toEqual([]);
    }
  });

  it('n’appelle que le client qui ouvre en readOnly, jamais celui du module Permis (INBOX en dur)', () => {
    expect(src).toContain('creerClientApprofondi(compte)'); // imap.ts : ouvre n'importe quel dossier en EXAMINE
    expect(src).not.toContain('creerClientBoite(');         // celui-là code INBOX en dur → chemin du module Permis
  });
});

describe('gestion:sonder — comportement', () => {
  it('sans compte IMAP configuré : le dit et sort en 0 (ce n’est pas une erreur)', async () => {
    const { d, lignes } = deps(null);
    expect(await executerSonde([], d)).toBe(0);
    expect(lignes.join('\n')).toContain('aucun compte IMAP configuré');
  });

  it('--lister-dossiers ne fait QUE lister : aucune boîte ouverte, aucun message lu', async () => {
    const { client, appels } = clientFaux({ boites: ['INBOX', 'GESTION', '[Gmail]/Spam'] });
    const { d, lignes } = deps(client);
    expect(await executerSonde(['--lister-dossiers'], d)).toBe(0);
    expect(appels.ouvrirBoite).toEqual([]);
    expect(appels.telecharges).toEqual([]);
    expect(appels.fermer).toBe(1);
    expect(lignes.join('\n')).toContain('[Gmail]/Spam');
  });

  it('dossier introuvable : liste les dossiers RÉELS, sort en 1, et n’ouvre rien', async () => {
    const { client, appels } = clientFaux({ boites: ['INBOX', 'Courrier'] });
    const { d, lignes } = deps(client);
    expect(await executerSonde([], d)).toBe(1);
    expect(appels.ouvrirBoite).toEqual([]);
    expect(lignes.join('\n')).toContain('aucun dossier ne correspond');
    expect(lignes.join('\n')).toContain('Courrier');
  });

  it('ouvre le dossier demandé (casse résolue), interroge le total PUIS les sortants, et rend le rapport', async () => {
    const { client, appels } = clientFaux({ uidsParRecherche: (from) => (from === undefined ? [10, 11, 12] : [11]) });
    const { d, lignes } = deps(client);
    expect(await executerSonde(['--dossier=gestion'], d)).toBe(0);
    expect(appels.ouvrirBoite).toEqual(['GESTION']);
    expect(appels.recherches).toEqual([undefined, 'gestion@criterimmo.fr']);
    expect(appels.telecharges).toEqual([10, 11, 12]);
    expect(appels.fermer).toBe(1);
    const texte = lignes.join('\n');
    expect(texte).toContain('LES TROIS MESURES');
    expect(texte).toContain('1 sur 3'); // (a) sortants, comptés côté serveur
  });

  it('referme TOUJOURS la boîte, même quand la recherche échoue', async () => {
    const { client, appels } = clientFaux({ chercherJette: true });
    const { d } = deps(client);
    await expect(executerSonde([], d)).rejects.toThrow('recherche impossible');
    expect(appels.fermer).toBe(1); // le `finally` ne laisse jamais une connexion ouverte
  });

  it('un message illisible est ISOLÉ : signalé, jamais fatal, les autres sont lus', async () => {
    const { client, appels } = clientFaux({
      uidsParRecherche: (from) => (from === undefined ? [1, 2, 3] : []),
      telecharger: async (uid) => {
        if (uid === 2) throw new Error('MIME cassé');
        return boite(uid, null);
      },
    });
    const { d, lignes } = deps(client);
    expect(await executerSonde([], d)).toBe(0);
    expect(appels.telecharges).toEqual([1, 2, 3]);
    const texte = lignes.join('\n');
    expect(texte).toContain('illisible');
    expect(texte).toContain('messages analysés          : 2');
    expect(texte).toContain('1 illisibles, ignorés');
  });

  it('--echantillon borne le nombre de messages réellement lus, et le dit', async () => {
    const tous = Array.from({ length: 40 }, (_, i) => i + 1);
    const { client, appels } = clientFaux({ uidsParRecherche: (from) => (from === undefined ? tous : []) });
    const { d, lignes } = deps(client);
    expect(await executerSonde(['--echantillon=5'], d)).toBe(0);
    expect(appels.telecharges).toHaveLength(5);
    expect(lignes.join('\n')).toContain('échantillon à pas constant');
  });

  it('--jours pilote la fenêtre (recul exact en jours)', () => {
    expect(debutFenetre(new Date('2026-09-23T10:00:00Z'), 90).toISOString().slice(0, 10)).toBe('2026-06-25');
    expect(debutFenetre(new Date('2026-09-23T10:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-09-22');
  });
});

describe('gestion:sonder — projection d’un message', () => {
  it('ABANDONNE le contenu des pièces (mémoire bornée) et ne garde que type et poids', () => {
    const vue = versSonde({
      uid: 7, recuLe: new Date(), deNom: 'Mme Martin',
      message: {
        messageId: '<a@x.fr>', deAdresse: 'm@x.fr', objet: 'Fuite', corpsTexte: 'texte',
        entetes: { 'delivered-to': 'x' }, references: ['<r@x.fr>'], inReplyTo: '<p@x.fr>',
      },
      pieces: [{ nomFichier: 'photo.heic', typeMime: 'image/heic', tailleOctets: 42, contenu: Buffer.from('CONTENU SECRET') }],
    });
    expect(vue.pieces).toEqual([{ typeMime: 'image/heic', tailleOctets: 42 }]);
    expect(JSON.stringify(vue)).not.toContain('CONTENU SECRET');
    expect(vue.references).toEqual(['<r@x.fr>']);
    expect(vue.inReplyTo).toBe('<p@x.fr>');
  });

  it('tolère un message minimal (champs absents) sans jeter', () => {
    const vue = versSonde({ uid: 1, recuLe: new Date(), deNom: null, pieces: [], message: { messageId: '', deAdresse: 'a@x.fr', entetes: {} } });
    expect(vue).toMatchObject({ uid: 1, messageId: '', inReplyTo: null, references: [], objet: null, corpsTexte: null });
  });
});
