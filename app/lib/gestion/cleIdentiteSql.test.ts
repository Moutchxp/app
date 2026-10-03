import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleIdentitePiece, sqlCleIdentitePiece } from './piecesConversation';

/**
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES — LA LIGNE ET LE RÉCAPITULATIF COMPTENT LA MÊME CHOSE ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026) : « dédoublonne le compteur de pièces de la ligne de liste par empreinte, comme la
 * conversation le fait déjà, dans les cinq compteurs. »
 *
 * LE DÉFAUT MESURÉ LA VEILLE, échange 36694 : la ligne annonçait « 📎 4 », la conversation « 3 pièces ». La
 * quatrième était `test renomage.pdf` (pièce 27121), qui porte EXACTEMENT la même empreinte sha256 que
 * `0851_001.pdf` (pièce 27087) — le même document, réattaché par notre propre transfert.
 *
 * 🔴 CE FICHIER TIENT LES DEUX RENDUS ENSEMBLE. `cleIdentitePiece` (TypeScript, pour le récapitulatif et le
 * trombone) et `sqlCleIdentitePiece` (SQL, pour les cinq compteurs) doivent produire la MÊME clé, caractère pour
 * caractère. Une « équivalence » approximative compterait autrement un jour, et l'on repaierait ce défaut.
 *
 * ⚠️ ON NE PEUT PAS EXÉCUTER LE SQL ICI (ce fichier n'ouvre aucune base) : on éprouve donc le FRAGMENT — qu'il
 * porte les deux espaces de noms, la normalisation, le repli de taille, et surtout qu'il lise le nom d'USAGE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (o: Partial<Parameters<typeof cleIdentitePiece>[0]>) =>
  ({ nomFichier: 'bail.pdf', tailleOctets: 1024, empreinte: null, ...o });

describe('🔴🔴 la clé d’identité, côté TypeScript', () => {
  /** 🔴 L'EMPREINTE EST UNE PREUVE : deux pièces de mêmes octets et même taille sont le même document. */
  it('🔴 deux pièces de même empreinte ont la même clé, quel que soit leur nom', () => {
    const a = cleIdentitePiece(piece({ nomFichier: '0851_001.pdf', empreinte: 'DDB0275F' }));
    const b = cleIdentitePiece(piece({ nomFichier: 'test renomage.pdf', empreinte: 'ddb0275f' }));
    expect(a.cle).toBe(b.cle);
    expect(a.parNomEtTaille).toBe(false);
  });

  /** 🔴 LE NOM EST UNE PRÉSOMPTION, et elle se dit : `parNomEtTaille` le porte jusqu'à l'écran. */
  it('🔴 sans empreinte, le rapprochement se fait sur le nom et la taille, et l’annonce', () => {
    const a = cleIdentitePiece(piece({ nomFichier: 'Bail.PDF' }));
    const b = cleIdentitePiece(piece({ nomFichier: '  bail.pdf  ' }));
    expect(a.cle).toBe(b.cle);
    expect(a.parNomEtTaille).toBe(true);
  });

  /**
   * 🔴🔴 LES DEUX ESPACES DE NOMS NE SE MÉLANGENT JAMAIS. Une pièce reconnue par son empreinte ne doit pas se
   * confondre avec une pièce reconnue par son nom : la première est une preuve, la seconde une présomption.
   */
  it('🔴🔴 une clé d’empreinte et une clé de nom ne se rencontrent pas', () => {
    expect(cleIdentitePiece(piece({ empreinte: 'abc' })).cle)
      .not.toBe(cleIdentitePiece(piece({ nomFichier: 'abc' })).cle);
  });

  /** ⚠️ UNE TAILLE INCONNUE NE CONFOND PAS DEUX FICHIERS AVEC UNE TAILLE CONNUE. */
  it('⚠️ la taille entre dans la clé, et son absence se note', () => {
    expect(cleIdentitePiece(piece({ tailleOctets: null })).cle).toContain('|?');
    expect(cleIdentitePiece(piece({ tailleOctets: null })).cle)
      .not.toBe(cleIdentitePiece(piece({ tailleOctets: 0 })).cle);
  });

  /**
   * ⚠️ UN NOM ABSENT NE FAIT PAS TOMBER UN COMPTEUR DE LISTE. Les doubles de test rendent parfois des lignes
   * incomplètes, et la base pourrait un jour en rendre une : un compteur n'a pas à lever pour autant.
   */
  it('⚠️ un nom absent se comporte comme un nom vide', () => {
    expect(() => cleIdentitePiece({ nomFichier: undefined as unknown as string, tailleOctets: 1, empreinte: null }))
      .not.toThrow();
  });
});

describe('🔴🔴 la MÊME clé, rendue en SQL', () => {
  const sql = sqlCleIdentitePiece('pc', "coalesce(nullif(btrim(pc.nom_usage), ''), pc.nom_fichier)");

  it('🔴 les deux espaces de noms, et la taille, sont là', () => {
    expect(sql).toContain("'e:'");
    expect(sql).toContain("'n:'");
    expect(sql).toContain("coalesce(pc.taille_octets::text, '?')");
  });

  it('🔴 l’empreinte est normalisée exactement comme en TypeScript', () => {
    expect(sql).toContain("lower(btrim(coalesce(pc.empreinte_sha256, '')))");
  });

  /**
   * 🔴🔴 LE NOM EST CELUI D'USAGE, ET C'EST LA GARANTIE CENTRALE DE CE FRAGMENT. En TypeScript, `nomFichier` EST
   * le nom d'usage (lot NOM-UNIQUE-DES-PIECES). Lire `nom_fichier` en SQL donnerait le nom d'ARRIVÉE : une pièce
   * renommée aurait alors deux clés différentes, et le dédoublonnage cesserait de dédoublonner — sans rien dire.
   */
  it('🔴🔴 le fragment ne nomme JAMAIS `nom_fichier` tout seul', () => {
    const src = readFileSync('app/lib/gestion/piecesConversation.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toContain('nom_fichier');
    // Il reçoit le nom tout rendu, et c'est ce que le `|| ` du fragment montre.
    expect(sql).toContain('nom_usage');
  });

  /** ⚠️ L'ALIAS EST RESPECTÉ PARTOUT : les cinq compteurs n'emploient pas tous le même. */
  it('⚠️ l’alias passe dans toutes les parties du fragment', () => {
    const autre = sqlCleIdentitePiece('p', 'p.nom_fichier');
    expect(autre).toContain('p.taille_octets');
    expect(autre).toContain('p.empreinte_sha256');
    expect(autre).not.toContain('pc.');
  });
});

/**
 * ══ 🔴 LES CINQ COMPTEURS PASSENT TOUS PAR LE FRAGMENT ══════════════════════════════════════════════════════════
 *
 * Arno : « dans les cinq compteurs ». Un seul oublié, et une liste annoncerait encore les exemplaires là où les
 * autres annoncent les documents — c'est exactement l'incohérence qu'on répare.
 */
describe('🔴 les cinq compteurs dédoublonnent', () => {
  const FICHIERS = [
    'app/lib/gestion/boiteRepo.ts',
    'app/lib/gestion/rechercheBoite.ts',
    'app/lib/gestion/carteRepo.ts',
    'app/lib/gestion/fileRepo.ts',
    'app/lib/gestion/receptionRepo.ts',
  ];

  it('🔴 chacun appelle `sqlCleIdentitePiece`, et aucun ne compte les exemplaires', () => {
    for (const f of FICHIERS) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('sqlCleIdentitePiece');
      // ⚠️ Plus aucun `count(*)` sur `gestion_piece` : c'est la forme qu'on quitte.
      expect(src.replace(/\s+/g, ' '), f).not.toMatch(/count\(\*\) FROM gestion_piece\b/);
    }
  });

  /** 🔴 ET LE TROMBONE DE LA LIGNE, qui est le nombre qu'Arno lit, dédoublonne lui aussi. */
  it('🔴 le trombone de la ligne passe par la MÊME clé', () => {
    const src = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    const i = src.indexOf('export async function piecesVraiesDesFils');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i)).toContain('cleIdentitePiece(');
  });
});
