import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cheminSousDossierInterdit, DOSSIER_INTERDIT_LECTURE, indexerMaillons, peutJoindre, PROFONDEUR_MAX,
  type Maillon,
} from './driveLectureFichier';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE LA PLUS IMPORTANTE DU LOT, ET LA SEULE QUI NE SE NÉGOCIE PAS.
 *
 * « Documents clients scannés » est l'archive historique du cabinet : des années de pièces d'identité, d'avis
 * d'imposition, de relevés bancaires. « Joindre » y est INTERDIT — joindre, c'est télécharger les octets et les
 * mettre dans un mail qui part sur l'Internet ouvert, sans authentification, vers une adresse tapée à la main.
 * « Insérer un lien », lui, reste permis partout : il ne lit RIEN, et Google appliquera ses propres droits à qui
 * ouvrira le lien.
 *
 * 🔴 ET ON REFUSE QUAND ON NE SAIT PAS. Tous les cas d'incertitude ci-dessous rendent « interdit » : un garde-fou
 * qui laisse passer l'incertain ne garde rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const maillons = (...m: Maillon[]) => indexerMaillons(m);

/** L'arborescence réelle : GESTION LOCATIVE › { Documents clients scannés › 2019 › Dupont | Base de données locative }. */
const DRIVE = maillons(
  { id: 'drive', nom: 'GESTION LOCATIVE', parentId: null },
  { id: 'scan', nom: 'Documents clients scannés', parentId: 'drive' },
  { id: '2019', nom: '2019', parentId: 'scan' },
  { id: 'dupont', nom: 'Dupont', parentId: '2019' },
  { id: 'base', nom: 'Base de données locative', parentId: 'drive' },
  { id: 'bien', nom: '12 rue des Lilas', parentId: 'base' },
);

describe('🔴🔴 « Joindre » sous « Documents clients scannés »', () => {
  it('🔴 INTERDIT, directement dans le dossier', () => {
    const v = peutJoindre('scan', DRIVE);
    expect(v.joindre).toBe(false);
    expect(v.joindre === false && v.motif).toContain(DOSSIER_INTERDIT_LECTURE);
  });

  /** 🔴 UN FICHIER RANGÉ PLUS BAS EST TOUT AUSSI INTERDIT : on remonte la chaîne, on ne regarde pas le dossier immédiat. */
  it('🔴 INTERDIT, à trois niveaux en dessous', () => {
    expect(peutJoindre('dupont', DRIVE).joindre).toBe(false);
    expect(peutJoindre('2019', DRIVE).joindre).toBe(false);
  });

  it('le motif EXPLIQUE, et propose la sortie : le lien', () => {
    const v = peutJoindre('dupont', DRIVE);
    expect(v.joindre === false && v.motif).toContain('lien');
    expect(v.joindre === false && v.motif).toContain('ses propres droits Google');
  });

  it('AUTORISÉ ailleurs dans le même Drive', () => {
    expect(peutJoindre('bien', DRIVE).joindre).toBe(true);
    expect(peutJoindre('base', DRIVE).joindre).toBe(true);
    expect(peutJoindre('drive', DRIVE).joindre).toBe(true);
  });
});

describe('🔴 on refuse quand on ne sait pas', () => {
  it('emplacement absent', () => {
    expect(peutJoindre(null, DRIVE).joindre).toBe(false);
    expect(peutJoindre('', DRIVE).joindre).toBe(false);
  });

  /** Chaîne incomplète : un parent qu'on ne connaît pas peut TRÈS BIEN être le dossier interdit. */
  it('🔴 chaîne de parents INCOMPLÈTE : interdit, pas « probablement bon »', () => {
    const partiel = maillons({ id: 'x', nom: 'Documents', parentId: 'inconnu' });
    const v = peutJoindre('x', partiel);
    expect(v.joindre).toBe(false);
    expect(v.joindre === false && v.motif).toContain('incomplet');
  });

  it('dossier inconnu de l’index', () => {
    expect(peutJoindre('jamais-vu', DRIVE).joindre).toBe(false);
  });

  it('cycle dans l’arborescence : refusé, et sans boucler', () => {
    const cycle = maillons(
      { id: 'a', nom: 'A', parentId: 'b' },
      { id: 'b', nom: 'B', parentId: 'a' },
    );
    const v = peutJoindre('a', cycle);
    expect(v.joindre).toBe(false);
    expect(v.joindre === false && v.motif).toContain('incohérente');
  });

  it('arborescence plus profonde que la borne : refusé, et sans boucler', () => {
    const profond: Maillon[] = [];
    for (let i = 0; i <= PROFONDEUR_MAX + 5; i += 1) {
      profond.push({ id: `n${i}`, nom: `niveau ${i}`, parentId: `n${i + 1}` });
    }
    const v = peutJoindre('n0', indexerMaillons(profond));
    expect(v.joindre).toBe(false);
  });
});

/**
 * 🔴 LE NOM A ÉTÉ TAPÉ À LA MAIN IL Y A DES ANNÉES. Un accent manquant, une majuscule, un espace en trop ne doivent
 * PAS rouvrir la porte : la comparaison se fait sur une forme normalisée.
 */
describe('🔴 le nom du dossier, écrit autrement', () => {
  it('accents, casse et espaces ne contournent pas la règle', () => {
    for (const variante of [
      'Documents clients scannes',
      'DOCUMENTS CLIENTS SCANNÉS',
      'documents clients scannés',
      '  Documents   clients  scannés  ',
      'Documents clients scannés',
    ]) {
      const idx = maillons(
        { id: 'r', nom: 'GESTION LOCATIVE', parentId: null },
        { id: 's', nom: variante, parentId: 'r' },
        { id: 'f', nom: 'sous-dossier', parentId: 's' },
      );
      expect(peutJoindre('f', idx).joindre, variante).toBe(false);
    }
  });

  /** ⚠️ …mais un dossier qui RESSEMBLE sans être le même reste autorisé : la règle vise UN dossier, pas un thème. */
  it('un nom différent n’est PAS bloqué par ressemblance', () => {
    const idx = maillons(
      { id: 'r', nom: 'GESTION LOCATIVE', parentId: null },
      { id: 's', nom: 'Documents clients scannés 2024 (copie)', parentId: 'r' },
    );
    expect(peutJoindre('s', idx).joindre).toBe(true);
  });
});

describe('la même question depuis le CHEMIN affiché', () => {
  it('sert l’écran, qui affiche déjà le chemin', () => {
    expect(cheminSousDossierInterdit(['GESTION LOCATIVE', 'Documents clients scannés', '2019'])).toBe(true);
    expect(cheminSousDossierInterdit(['GESTION LOCATIVE', 'Base de données locative'])).toBe(false);
    expect(cheminSousDossierInterdit([])).toBe(false);
  });
});

describe('garanties STATIQUES', () => {
  it('🔴 module PUR : aucun import, donc rien qui puisse tirer `pg` ni le réseau', () => {
    const src = readFileSync('app/lib/gestion/driveLectureFichier.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
    expect(/fetch\(|query\(|googleapis/.test(src)).toBe(false);
  });

  /** ⚠️ Aucune porte dérobée : un garde-fou qui a un `--force` n'est pas un garde-fou, c'est une convention. */
  it('🔴 aucune option ne contourne la règle', () => {
    const src = readFileSync('app/lib/gestion/driveLectureFichier.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/force|bypass|ignorer|sauf si|override/i.test(src)).toBe(false);
  });
});
