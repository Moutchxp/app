import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { creerDossier, voisinsDuNom } from './driveCreation';
import { MIME_DOSSIER } from './drive';
import {
  DOSSIER_INTERDIT_LECTURE, indexerMaillons, peutCreerDossier, type Maillon,
} from './driveLectureFichier';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — LA SEULE ÉCRITURE DRIVE DE L'ÉDITEUR DE MAIL, ET CE QU'ELLE NE FAIT PAS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE FICHIER TIENT TROIS PROMESSES, ET LES DEUX DERNIÈRES SONT DES GARANTIES STATIQUES — celles qu'aucun test de
 * fonction ne peut tenir :
 *   ① rien ne se crée sous « Documents clients scannés », à AUCUNE profondeur ;
 *   ② il n'existe AUCUNE fonction de suppression, de renommage, de déplacement ni de partage dans le module ;
 *   ③ il n'y a qu'UN verbe d'écriture HTTP dans tout le fichier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une arborescence d'essai : l'interdit à la racine d'un Drive partagé, et un dossier permis à côté. */
function arbre(): Map<string, Maillon> {
  return indexerMaillons([
    { id: 'drive', nom: 'GESTION LOCATIVE', parentId: null },
    { id: 'interdit', nom: DOSSIER_INTERDIT_LECTURE, parentId: 'drive' },
    { id: 'n1', nom: '1 actifs', parentId: 'interdit' },
    { id: 'n2', nom: 'Assayag', parentId: 'n1' },
    { id: 'n3', nom: 'Baux', parentId: 'n2' },
    { id: 'permis', nom: 'Base de données locative', parentId: 'drive' },
    { id: 'permis2', nom: '1 Propriétaires', parentId: 'permis' },
  ]);
}

describe('🔴🔴 ① aucune création sous « Documents clients scannés », à AUCUNE profondeur', () => {
  it('refuse DANS le dossier interdit lui-même', () => {
    const v = peutCreerDossier('interdit', arbre());
    expect(v.creer).toBe(false);
    if (!v.creer) expect(v.motif).toContain(DOSSIER_INTERDIT_LECTURE);
  });

  /**
   * 🔴 LES TROIS PROFONDEURS DEMANDÉES PAR ARNO, une par une. Ce ne sont pas trois fois le même test : c'est la
   * preuve que la règle remonte la CHAÎNE et ne regarde pas le dossier immédiat. Un garde qui ne verrait que le
   * parent direct laisserait créer au niveau 2.
   */
  it.each([
    ['profondeur 1', 'n1'],
    ['profondeur 2', 'n2'],
    ['profondeur 3', 'n3'],
  ])('refuse à %s sous le dossier interdit', (_mot, id) => {
    const v = peutCreerDossier(id, arbre());
    expect(v.creer).toBe(false);
    if (!v.creer) expect(v.motif).toContain('sous-dossiers');
  });

  it('AUTORISE ailleurs — un garde qui refuse tout ne protège rien, il supprime une fonction', () => {
    expect(peutCreerDossier('permis', arbre()).creer).toBe(true);
    expect(peutCreerDossier('permis2', arbre()).creer).toBe(true);
    expect(peutCreerDossier('drive', arbre()).creer).toBe(true);
  });

  /**
   * ⚠️ NE PAS SAVOIR VAUT INTERDIT. Chaîne trouée, cycle, départ vide : on refuse. Un garde-fou qui laisse passer
   * l'incertain ne garde rien — et le motif dit qu'on n'a pas su situer l'endroit, pas qu'il est interdit.
   */
  it('refuse quand on ne sait pas où l’on est', () => {
    const vide = indexerMaillons([]);
    for (const depart of ['', null, 'inconnu']) {
      const v = peutCreerDossier(depart as string | null, vide);
      expect(v.creer, String(depart)).toBe(false);
      if (!v.creer) expect(v.motif).toContain('on ne crée pas là où l’on ne sait pas où l’on est');
    }
  });

  it('refuse une arborescence cyclique plutôt que de tourner', () => {
    const cycle = indexerMaillons([
      { id: 'a', nom: 'A', parentId: 'b' },
      { id: 'b', nom: 'B', parentId: 'a' },
    ]);
    expect(peutCreerDossier('a', cycle).creer).toBe(false);
  });

  /** Le nom du dossier interdit se compare SANS accent ni casse : il a été tapé à la main il y a des années. */
  it('la comparaison du nom interdit ignore accents et casse', () => {
    for (const nom of ['documents clients scannes', 'DOCUMENTS CLIENTS SCANNÉS', 'Documents  clients  scannés']) {
      const index = indexerMaillons([{ id: 'x', nom, parentId: null }, { id: 'y', nom: 'Sous', parentId: 'x' }]);
      expect(peutCreerDossier('y', index).creer, nom).toBe(false);
    }
  });
});

describe('l’appel à Google, quand il est permis', () => {
  it('crée un dossier : un POST, le bon parent, le bon type MIME', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ id: 'neuf', name: 'Travaux 2026', webViewLink: 'https://drive.google.com/x' }),
    });
    const r = await creerDossier('JETON', { parentId: 'permis', nom: 'Travaux 2026' }, { fetch: fetchFaux as never });
    expect(r).toEqual({ ok: true, valeur: { id: 'neuf', nom: 'Travaux 2026', lien: 'https://drive.google.com/x' } });

    const [url, init] = fetchFaux.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(url).toContain('supportsAllDrives=true'); // sans quoi un Drive partagé répond 404
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Travaux 2026', mimeType: MIME_DOSSIER, parents: ['permis'],
    });
  });

  /**
   * 🔴 AUCUN RÉESSAI, ET C'EST VOULU. Rejouer une création après une réponse perdue créerait DEUX dossiers du même
   * nom — précisément ce que ce lot interdit. L'échec est rendu tel quel, et c'est l'humain qui reprend, en voyant
   * d'abord si le dossier est là.
   */
  it('ne réessaie JAMAIS une création — un seul appel, même sur erreur', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const r = await creerDossier('JETON', { parentId: 'permis', nom: 'X' }, { fetch: fetchFaux as never });
    expect(r.ok).toBe(false);
    expect(fetchFaux).toHaveBeenCalledTimes(1);
  });

  it('rend un refus lisible quand Google répond 403', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const r = await creerDossier('JETON', { parentId: 'permis', nom: 'X' }, { fetch: fetchFaux as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('droit d’écrire');
  });

  it('refuse une réponse sans identifiant plutôt que de dire « créé »', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: 'X' }) });
    const r = await creerDossier('JETON', { parentId: 'permis', nom: 'X' }, { fetch: fetchFaux as never });
    expect(r.ok).toBe(false);
  });

  it('les voisins du nom sont demandés en LECTURE, dans le parent, sans la corbeille', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ files: [{ id: 'a', name: 'Travaux 2026', mimeType: MIME_DOSSIER }] }),
    });
    const r = await voisinsDuNom('JETON', { parentId: 'permis', nom: 'Travaux' }, { fetch: fetchFaux as never });
    expect(r).toEqual({ ok: true, valeur: [{ id: 'a', nom: 'Travaux 2026', dossier: true }] });
    const [url, init] = fetchFaux.mock.calls[0] as [string, RequestInit | undefined];
    expect(init?.method ?? 'GET').toBe('GET');
    // ⚠️ `URLSearchParams` encode l'espace en `+` : on le rend avant de lire la requête, sinon on compare deux
    //   écritures de la même chose (et le test échouerait sur la forme, pas sur le fond).
    const q = decodeURIComponent(url.replace(/\+/g, ' '));
    expect(q).toContain("'permis' in parents");
    expect(q).toContain('trashed = false');
  });

  /** Une apostrophe dans un nom fermerait la chaîne de la requête Google — ou, pire, en changerait le sens. */
  it('échappe l’apostrophe d’un nom dans la requête', async () => {
    const fetchFaux = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ files: [] }) });
    await voisinsDuNom('JETON', { parentId: 'p', nom: "Bail d'habitation" }, { fetch: fetchFaux as never });
    expect(decodeURIComponent(String(fetchFaux.mock.calls[0][0]).replace(/\+/g, ' '))).toContain("d\\'habitation");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * GARANTIES STATIQUES — ce qu'aucun test de fonction ne peut tenir : qu'il n'existe pas d'autre écriture, et
 * qu'aucune suppression n'est écrite « pour annuler ».
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 ② et ③ — ce que le module NE SAIT PAS FAIRE', () => {
  const src = readFileSync('app/lib/gestion/driveCreation.ts', 'utf8');
  const routeCreation = readFileSync('app/(admin)/api/admin/gestion/drive/dossier/route.ts', 'utf8');
  const routeApercu = readFileSync('app/(admin)/api/admin/gestion/drive/apercu/route.ts', 'utf8');

  /** ⚠️ ON EXAMINE LE CODE, PAS LA PROSE : les commentaires PROMETTENT ce qu'on cherche, et les compter ferait échouer le test sur sa propre documentation. */
  const sansCommentaires = (s: string): string => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  it('il n’y a qu’UN SEUL verbe d’écriture HTTP dans tout le module de création', () => {
    const verbes = sansCommentaires(src).match(/method:\s*'(POST|PATCH|PUT|DELETE)'/g) ?? [];
    expect(verbes).toEqual(["method: 'POST'"]);
  });

  /**
   * 🔴 AUCUNE FONCTION DE SUPPRESSION N'EST ÉCRITE, MÊME « POUR ANNULER » — exigence d'Arno, mot pour mot. Ce qui
   * n'existe pas ne s'appelle pas par erreur, et ne s'ajoute pas « en deux lignes » un soir de correctif.
   */
  it('aucune suppression, aucune corbeille, aucun renommage, aucun déplacement, aucun partage', () => {
    for (const s of [src, routeCreation, routeApercu]) {
      const code = sansCommentaires(s);
      expect(code).not.toMatch(/files\.delete|files\/[^']*\?\s*.*method:\s*'DELETE'/i);
      expect(code).not.toMatch(/trashed\s*:\s*true/);
      expect(code).not.toMatch(/addParents|removeParents/);
      expect(code).not.toMatch(/permissions/);
      expect(code).not.toMatch(/\bsupprimer\s*\(|\bcorbeille\s*\(|\brenommer\s*\(|\bdeplacer\s*\(|\bpartager\s*\(/i);
    }
  });

  it('le module de création ne connaît AUCUN identifiant de dossier en dur', () => {
    expect(src).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI'); // « Documents clients scannés »
    expect(src).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  /**
   * 🔴 LA ROUTE DE CRÉATION INTERROGE LE VERDICT, ET LE JOURNAL. Les deux, et avant d'écrire : sans le premier on
   * créerait dans l'archive, sans le second on créerait un dossier que personne ne pourrait expliquer.
   */
  it('la route de création passe par le verdict ET par la sonde du journal', () => {
    const code = sansCommentaires(routeCreation);
    expect(code).toContain('verdictCreer(');
    expect(code).toContain('journalDossierDriveDisponible()');
    expect(code).toContain('journaliserDossierCree(');
    // Le POST ne doit pas avoir d'autre chemin d'écriture que `creerDossier`.
    expect(code.match(/creerDossier\(/g) ?? []).toHaveLength(1);
  });

  /** L'aperçu est une LECTURE de contenu : il doit passer par la MÊME règle que « Joindre », pas par une variante. */
  it('la route d’aperçu passe par le verdict de lecture, et ne sert qu’une liste blanche de types', () => {
    const code = sansCommentaires(routeApercu);
    expect(code).toContain('verdictJoindre(');
    expect(code).toContain('typeServi(');
    expect(code).toContain('nosniff');
  });
});
