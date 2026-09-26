import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  arretSubi, etatCopie, motifCourtCopie, processusVivant, COMMANDE_REPRISE, MUET,
  type CopieVue, type MotifEchecVue, type PasseCopieVue,
} from './copieArretee';
import { motifBorne } from './copieEchecRepo';
import { inventorierDossier } from './copiePiecesReel';

/**
 * LOT COPIE-SURV — L'ALERTE DE COPIE, LES MOTIFS D'ÉCHEC, ET LE JETON DE L'INVENTAIRE.
 *
 * 🔴 CE QUE CE FICHIER EMPÊCHE DE REVIVRE, deux fois :
 *   ① le 26/09/2026 à 13:58, la copie s'est arrêtée sur dix échecs d'affilée alors qu'il restait 24 000 pièces, et
 *      AUCUN écran ne le disait. L'arrêt a été découvert par hasard deux heures plus tard ;
 *   ② la même passe est morte à la seconde près au bout d'une heure, parce que son jeton Google était pris une seule
 *      fois. L'inventaire de production portait le même motif, sans être encore tombé.
 *
 * 🔒 AUCUN APPEL RÉEL. L'inventaire est éprouvé sur des doubles : `fetch` est une fonction de test, et rien ne part
 * vers Google. « Documents clients scannés » n'est pas approché.
 */

const passe = (o: Partial<PasseCopieVue> = {}): PasseCopieVue => ({
  id: 4, resultat: 'arret', termineLe: '2026-09-26T11:58:38Z', motifArret: '10 échecs d’affilée',
  echecs: 11, piecesCopiees: 2199, vivant: false, ...o,
});

const vue = (o: Partial<CopieVue> = {}): CopieVue => ({
  derniere: passe(), restantes: 23837, motifs: [], ...o,
});

const motif = (o: Partial<MotifEchecVue> = {}): MotifEchecVue => ({
  pieceId: 2297, etape: 'envoi', codeHttp: 401, motif: 'La connexion Google a expiré (le dépôt).',
  survenuLe: '2026-09-26T11:58:30Z', ...o,
});

describe('🔴 arrêt SUBI ou arrêt VOULU — la différence se lit sur les données, jamais sur la phrase', () => {
  it('« echec » est subi d’emblée', () => {
    expect(arretSubi(passe({ resultat: 'echec', echecs: 0 }))).toBe(true);
  });

  it('« arret » AVEC des échecs est subi — c’est le cas des dix d’affilée, et celui du garde-fou', () => {
    expect(arretSubi(passe({ resultat: 'arret', echecs: 11 }))).toBe(true);
    expect(arretSubi(passe({ resultat: 'arret', echecs: 1 }))).toBe(true);
  });

  it('« arret » SANS aucun échec est voulu — limite atteinte, ou Ctrl-C', () => {
    expect(arretSubi(passe({ resultat: 'arret', echecs: 0, motifArret: 'limite de 20 pièces atteinte' }))).toBe(false);
    expect(arretSubi(passe({ resultat: 'arret', echecs: 0, motifArret: 'arrêt demandé (SIGINT/SIGTERM)' }))).toBe(false);
  });

  it('🔴 le MOTIF n’entre pas dans la décision : c’est une phrase pour un humain, elle changera', () => {
    // Deux passes au motif identique, mais l'une a des échecs et l'autre non : le verdict DOIT différer.
    const meme = 'la copie s’arrête';
    expect(arretSubi(passe({ resultat: 'arret', echecs: 3, motifArret: meme }))).toBe(true);
    expect(arretSubi(passe({ resultat: 'arret', echecs: 0, motifArret: meme }))).toBe(false);
  });

  it('une passe terminée normalement n’est pas un arrêt subi', () => {
    expect(arretSubi(passe({ resultat: 'ok', echecs: 0, motifArret: null }))).toBe(false);
  });
});

describe('ce que le bandeau dit — et surtout quand il se TAIT', () => {
  it('aucune passe n’a jamais tourné ⇒ rien', () => {
    expect(etatCopie(vue({ derniere: null }))).toEqual(MUET);
  });

  it('🔴 une passe EN COURS ⇒ rien, même avec des échecs au compteur', () => {
    // Elle travaille : les échecs passagers font partie de son fonctionnement (attente croissante, puis reprise).
    expect(etatCopie(vue({ derniere: passe({ termineLe: null, echecs: 4, resultat: 'en_cours' }) }))).toEqual(MUET);
  });

  it('plus rien à copier ⇒ rien, même après un arrêt sur échecs', () => {
    expect(etatCopie(vue({ restantes: 0 }))).toEqual(MUET);
  });

  it('🔴 « on ne sait pas encore combien il reste » NE VAUT PAS ZÉRO : on se tait, on ne rassure pas', () => {
    // Taire une alerte méritée serait pire que de la dire une minute plus tard.
    expect(etatCopie(vue({ restantes: null })).niveau).toBe('muet');
  });

  it('🔴 arrêt SUBI + des pièces restantes ⇒ ALERTE, avec le motif ET la commande de reprise', () => {
    const e = etatCopie(vue());
    expect(e.niveau).toBe('alerte');
    expect(e.texte).toContain('ARRÊTÉE');
    expect(e.texte).toContain('23837 pièces restantes');
    expect(e.texte).toContain('10 échecs d’affilée');
    expect(e.aide).toContain(COMMANDE_REPRISE);
  });

  it('l’alerte cite le DERNIER motif d’échec quand on le connaît', () => {
    const e = etatCopie(vue({ motifs: [motif()] }));
    expect(e.texte).toContain('pièce 2297');
    expect(e.texte).toContain('(401)');
    expect(e.texte).toContain('La connexion Google a expiré');
  });

  it('🔴 arrêt VOULU + des pièces restantes ⇒ ligne CALME, jamais une alarme', () => {
    // Crier sur une décision ferait de l'alerte un bruit de fond, et on apprendrait à l'ignorer.
    const e = etatCopie(vue({ derniere: passe({ echecs: 0, motifArret: 'limite de 20 pièces atteinte' }) }));
    expect(e.niveau).toBe('calme');
    expect(e.texte).toContain('à reprendre');
    expect(e.texte).not.toContain('⚠');
    expect(e.aide).toBeNull();
  });

  it('les pluriels tiennent, à une pièce près', () => {
    expect(etatCopie(vue({ restantes: 1 })).texte).toContain('1 pièce restante');
    expect(etatCopie(vue({ restantes: 2 })).texte).toContain('2 pièces restantes');
  });

  it('🔴 la commande de reprise écrit en AJOUT, jamais en écrasement', () => {
    // C'est l'écrasement qui a coûté les onze motifs de la passe n° 4.
    expect(COMMANDE_REPRISE).toContain('>> ~/Desktop/copie-pieces.log');
    expect(COMMANDE_REPRISE).not.toMatch(/[^>]> ~\/Desktop/);
  });
});

describe('un motif d’échec, dit court', () => {
  it('porte la pièce, l’étape et le code', () => {
    expect(motifCourtCopie(motif())).toBe('pièce 2297 · envoi (401) — La connexion Google a expiré (le dépôt).');
  });

  it('sans pièce et sans code, il reste lisible', () => {
    expect(motifCourtCopie(motif({ pieceId: null, codeHttp: null, etape: 'jeton', motif: 'jeton indisponible' })))
      .toBe('jeton — jeton indisponible');
  });

  it('un motif est mis sur UNE ligne et borné : il va en base et dans un bandeau', () => {
    expect(motifBorne('  a\n\n  b  ')).toBe('a b');
    expect(motifBorne('x'.repeat(900))).toHaveLength(500);
    expect(motifBorne('x'.repeat(900)).endsWith('…')).toBe(true);
    expect(motifBorne('   ')).toBe('motif non précisé');
  });
});

describe('le processus est-il encore vivant ?', () => {
  it('le nôtre l’est', () => {
    expect(processusVivant(process.pid, 'ici', 'ici')).toBe(true);
  });

  it('un identifiant qui n’existe pas ne l’est pas', () => {
    expect(processusVivant(4_194_303, 'ici', 'ici')).toBe(false);
  });

  it('sur une AUTRE machine, on ne peut pas savoir — et on le dit, plutôt que de supposer', () => {
    expect(processusVivant(1234, 'autre-mac', 'ici')).toBeNull();
    expect(processusVivant(null, 'ici', 'ici')).toBeNull();
    expect(processusVivant(1234, null, 'ici')).toBeNull();
  });
});

/**
 * 🔴 L'INVENTAIRE DE PRODUCTION — SUR DES DOUBLES, ET SANS JAMAIS APPROCHER LE VRAI DRIVE.
 *
 * 🔒 « Documents clients scannés » ne doit JAMAIS être modifié. Ces tests vérifient DEUX choses distinctes : que le
 * jeton est redemandé à chaque page (le défaut du 26/09), et qu'aucun appel d'écriture n'existe dans ce chemin.
 */
describe('🔴 l’inventaire redemande son jeton à chaque page', () => {
  /** Un faux Drive : deux pages, puis plus rien. Compte les jetons employés. */
  const fauxDrive = (jetonsVus: string[]) => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const entetes = (init?.headers ?? {}) as Record<string, string>;
    jetonsVus.push((entetes.Authorization ?? '').replace('Bearer ', ''));
    const avecPage = String(url).includes('pageToken');
    return {
      ok: true,
      json: async () => (avecPage
        ? { files: [{ id: 'f2', name: 'b.pdf', mimeType: 'application/pdf', md5Checksum: 'm2', size: '2' }] }
        : {
          nextPageToken: 'p2',
          files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf', md5Checksum: 'm1', size: '1' }],
        }),
    } as unknown as Response;
  });

  it('un jeton NEUF est demandé pour chaque page — et le renouvellement est donc possible', async () => {
    const jetonsVus: string[] = [];
    let n = 0;
    const r = await inventorierDossier(
      { racineId: 'racine', driveId: 'D' },
      // Un fournisseur qui rend un jeton DIFFÉRENT à chaque appel : si l'inventaire n'en demandait qu'un, les deux
      // pages porteraient le même — et c'est exactement le défaut qu'on veut interdire.
      async () => `jeton-${++n}`,
      { fetch: fauxDrive(jetonsVus) as unknown as typeof fetch },
      async () => { /* on ne garde rien : seul le jeton nous intéresse ici */ },
    );
    expect(r.ok).toBe(true);
    expect(jetonsVus).toEqual(['jeton-1', 'jeton-2']);
    expect(new Set(jetonsVus).size).toBe(2);
  });

  it('un jeton indisponible arrête l’inventaire PROPREMENT, avec un motif — jamais avec une chaîne vide', () => {
    return inventorierDossier(
      { racineId: 'racine', driveId: 'D' },
      async () => null,
      { fetch: vi.fn() as unknown as typeof fetch },
      async () => { /* jamais appelé */ },
    ).then((r) => {
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motif).toContain('jeton Drive indisponible');
    });
  });
});

describe('🔒 l’inventaire de production reste en LECTURE de métadonnées, et rien d’autre', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  const script = sansCommentaires(readFileSync('app/scripts/empreintes-production-drive.ts', 'utf8'));
  const reel = sansCommentaires(readFileSync('app/lib/gestion/copiePiecesReel.ts', 'utf8'));
  const inventaire = reel.slice(
    reel.indexOf('export async function inventorierDossier'),
    reel.indexOf('export async function inventorierDossier') + 3000);

  it('🔴 AUCUN verbe d’écriture HTTP, ni dans la commande, ni dans la fonction d’inventaire', () => {
    for (const [nom, src] of [['commande', script], ['inventaire', inventaire]] as const) {
      expect(src, nom).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    }
  });

  it('🔴 aucun mot qui modifierait le Drive : corbeille, renommage, déplacement, partage', () => {
    for (const [nom, src] of [['commande', script], ['inventaire', inventaire]] as const) {
      for (const interdit of ['trashed: true', 'addParents', 'removeParents', 'permissions', 'uploadType']) {
        expect(src, `${nom} / ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it('🔴 aucun téléchargement de contenu : jamais `alt=media`', () => {
    expect(script).not.toContain('alt=media');
    expect(inventaire).not.toContain('alt=media');
  });

  it('🔴 ce dossier n’entre JAMAIS dans la liste blanche du garde-fou', () => {
    // Sans quoi une écriture y deviendrait possible — c'est la seconde barrière du double garde-fou.
    expect(script).not.toContain('enregistrerNoeud');
    expect(inventaire).not.toContain('enregistrerNoeud');
  });

  it('elle ne demande que les champs de MÉTADONNÉES qu’elle affiche', () => {
    expect(inventaire).toContain('fields: ');
    expect(inventaire).toContain('md5Checksum');
    // Et elle liste, elle ne lit pas un fichier un par un.
    expect(inventaire).toContain('/files?');
  });
});
