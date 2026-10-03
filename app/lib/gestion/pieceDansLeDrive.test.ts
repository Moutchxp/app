import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bullePieceDansLeDrive, cheminLisible, dossierDeLEmplacement, emplacementsDe, ligneEmplacement,
  nbEmplacements, titreMenuEmplacements, EMPLACEMENTS_MAX, MOT_PIECE_DANS_LE_DRIVE,
  type EmplacementPiece,
} from './pieceDansLeDrive';

/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LES MOTS, LES CHEMINS, ET LA SOURCE ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Bulle au survol : “Pièce jointe dans le Drive”, avec “(N emplacements)” si
 * plusieurs. […] plusieurs emplacements → petit menu listant les chemins (Drive › … › dossier, nom du fichier). »
 * Et la contrainte qui tient tout : « même source que la pastille verte et la loupe (registre + empreinte md5 +
 * index des empreintes). Une seule source de vérité, pas de recalcul différent. »
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① la bulle, mot pour mot, et « (N emplacements) » SEULEMENT au-delà d'un ;
 *   ② le chemin reste lisible quand le Drive fait treize niveaux, et ce qu'il cache est COMPTÉ ;
 *   ③ le nom du fichier LÀ-BAS est dit — il n'est pas toujours celui de la pièce, et c'est le cœur du lot ;
 *   ④ la lecture se fait en base, par les TROIS voies de la loupe, en UNE instruction et sans un appel Google.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const emplacement = (p: Partial<EmplacementPiece> = {}): EmplacementPiece => ({
  driveFileId: 'F1', nom: 'facture.pdf', dossierId: 'D1', dossierNom: 'Quittances',
  chemin: [{ id: 'D1', nom: 'Quittances' }], voie: 'registre', ...p,
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA BULLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① « Pièce jointe dans le Drive »', () => {
  it('🔴🔴 le mot d’Arno, et le nombre SEULEMENT s’il y en a plusieurs', () => {
    expect(MOT_PIECE_DANS_LE_DRIVE).toBe('Pièce jointe dans le Drive');
    expect(bullePieceDansLeDrive(1)).toBe('Pièce jointe dans le Drive');
    expect(bullePieceDansLeDrive(2)).toBe('Pièce jointe dans le Drive (2 emplacements)');
    expect(bullePieceDansLeDrive(9)).toBe('Pièce jointe dans le Drive (9 emplacements)');
  });

  /**
   * ⚠️ « (1 emplacement) » SERAIT DU BRUIT : le picto ne paraît que lorsqu'il y en a au moins un, donc le dire ne
   * distingue rien. Et `0` ne devrait jamais arriver — le composant ne rend alors rien — mais la fonction répond
   * quand même plutôt que de se taire bizarrement.
   */
  it('⚠️ zéro et un disent la même chose : la phrase simple', () => {
    expect(bullePieceDansLeDrive(0)).toBe(MOT_PIECE_DANS_LE_DRIVE);
  });

  /** 🔴 « CONNUS », jamais « les emplacements » : l'index est un reflet, et promettre l'exhaustivité ferait mentir. */
  it('🔴🔴 le titre du menu ne promet pas l’exhaustivité', () => {
    expect(titreMenuEmplacements(9)).toBe('9 emplacements connus dans le Drive');
    expect(titreMenuEmplacements(9)).toContain('connus');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE CHEMIN, LISIBLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « Drive › … › dossier, nom du fichier »', () => {
  /** ⚠️ `chemin` ARRIVE DU PARENT VERS LA RACINE (forme de la loupe) : on l'inverse pour l'affichage. */
  it('🔴 il se lit de la racine vers le dossier', () => {
    const e = emplacement({
      chemin: [{ id: 'c', nom: 'Kharrat' }, { id: 'b', nom: '1 actifs' }, { id: 'a', nom: 'Documents clients scannés' }],
    });
    expect(cheminLisible(e)).toBe('Documents clients scannés › 1 actifs › Kharrat');
  });

  /**
   * 🔴🔴 LE DRIVE DU CABINET FAIT TREIZE NIVEAUX. Un fil d'Ariane complet passe à la ligne et cesse d'être lisible
   * exactement là où il servirait. On garde les DEUX BOUTS — d'où l'on part, où l'on arrive — et l'on compte ce
   * qu'on cache : masquer sans le dire ferait croire que le dossier est à la racine.
   */
  it('🔴🔴 un chemin long garde ses deux bouts, et COMPTE ce qu’il cache', () => {
    const noms = ['Drive', 'A', 'B', 'C', 'D', 'Dossier'];
    const e = emplacement({ chemin: [...noms].reverse().map((n, i) => ({ id: `x${i}`, nom: n })) });
    expect(cheminLisible(e)).toBe('Drive › … (3) › D › Dossier');
  });

  /** ⚠️ CHEMIN INCONNU : le nom du dossier s'il existe, et sinon un mot — jamais une flèche vide. */
  it('⚠️ sans chemin, on dit ce qu’on sait, et rien de plus', () => {
    expect(cheminLisible(emplacement({ chemin: [] }))).toBe('Quittances');
    expect(cheminLisible(emplacement({ chemin: [], dossierNom: null }))).toBe('Emplacement connu');
    expect(cheminLisible(emplacement({ chemin: [], dossierNom: '   ' }))).toBe('Emplacement connu');
  });

  /**
   * 🔴🔴 LE NOM DU FICHIER LÀ-BAS EST DIT, ET C'EST TOUT LE LOT. Le document peut être rangé sous un tout autre
   * nom que la pièce — c'est le cas d'Arno, le fichier revenu renommé. Afficher le seul chemin laisserait croire
   * qu'on va retrouver le même nom en arrivant.
   */
  it('🔴🔴 la ligne du menu porte le chemin ET le nom du fichier', () => {
    expect(ligneEmplacement(emplacement({ nom: 'Recommandé M X.pdf' })))
      .toBe('Quittances · Recommandé M X.pdf');
    /* ⚠️ SANS NOM, on ne laisse pas un « · » orphelin. */
    expect(ligneEmplacement(emplacement({ nom: '  ' }))).toBe('Quittances');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴 OÙ LA FENÊTRE S'OUVRE, ET CE QU'ON COMPTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ le dossier d’un emplacement, et les comptes', () => {
  it('🔴 le dossier qui contient le document, avec un nom d’attente', () => {
    expect(dossierDeLEmplacement(emplacement())).toEqual({ id: 'D1', nom: 'Quittances' });
    /* ⚠️ SANS `dossierNom`, le premier cran du chemin fait l'attente : le serveur corrigera. */
    expect(dossierDeLEmplacement(emplacement({ dossierNom: null }))).toEqual({ id: 'D1', nom: 'Quittances' });
  });

  /** ⚠️ `null` QUAND LE DOSSIER EST INCONNU : un identifiant inventé mènerait à une erreur Google. */
  it('⚠️ pas de dossier connu, pas de point de départ', () => {
    expect(dossierDeLEmplacement(emplacement({ dossierId: '' }))).toBeNull();
    expect(dossierDeLEmplacement(emplacement({ dossierId: '   ' }))).toBeNull();
  });

  it('🔴 compter et retrouver les emplacements d’une pièce', () => {
    const statuts = [{ pieceId: 7, emplacements: [emplacement(), emplacement({ driveFileId: 'F2' })] }];
    expect(nbEmplacements(statuts, 7)).toBe(2);
    expect(emplacementsDe(statuts, 7)).toHaveLength(2);
    /* ⚠️ UNE PIÈCE ABSENTE DE LA RÉPONSE = AUCUN EMPLACEMENT : l'écran les traite pareil, le picto ne paraît pas. */
    expect(nbEmplacements(statuts, 99)).toBe(0);
    expect(emplacementsDe(statuts, 99)).toEqual([]);
  });

  /** ⚠️ LA MÊME BORNE QUE LA LOUPE (`OCCURRENCES_MAX`) : au-delà, la question n'est plus « où est-il ? ». */
  it('⚠️ la borne est celle de la loupe', () => {
    expect(EMPLACEMENTS_MAX).toBe(50);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LA SOURCE : LES TROIS VOIES, EN BASE, EN UNE INSTRUCTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ « même source que la pastille verte et la loupe »', () => {
  const REPO = readFileSync('app/lib/gestion/pieceDansLeDriveRepo.ts', 'utf8');
  /** Le code SEUL : les encadrés de ce module parlent beaucoup de Google et d'écriture. */
  const CODE = REPO.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  /**
   * 🔴🔴 LES TROIS VOIES SONT CELLES DU LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, et c'est la contrainte d'Arno :
   * « une seule source de vérité, pas de recalcul différent ». Le registre des dépôts, le même registre par
   * EMPREINTE, et l'index des empreintes.
   */
  it('🔴🔴 registre, registre par empreinte, index des empreintes', () => {
    expect(CODE).toContain('gestion_piece_drive');
    expect(CODE).toContain('gestion_drive_empreinte');
    /* 🔴 LA RECONNAISSANCE PAR CONTENU, DES DEUX CÔTÉS — c'est elle qui retrouve une pièce revenue renommée. */
    expect(CODE).toContain('lower(d.md5) = c.md5');
    expect(CODE).toContain('lower(e.md5) = c.md5');
  });

  /**
   * 🔴🔴 « UNE SEULE REQUÊTE, SANS APPEL GOOGLE À L'OUVERTURE DU MAIL » (Arno). Un seul `query(` dans tout le
   * fichier, et pas un `fetch` : les chemins eux-mêmes sont remontés EN BASE, par l'index qui porte les dossiers.
   */
  it('🔴🔴 une seule instruction SQL, et aucun appel réseau', () => {
    expect((CODE.match(/\bquery</g) ?? []).length).toBe(1);
    expect(CODE).not.toContain('fetch(');
    expect(CODE).toContain('WITH RECURSIVE');
  });

  /**
   * 🔒 ELLE NE SAIT QUE LIRE. Pas un verbe d'écriture SQL, nulle part — « Documents clients scannés » n'est lu
   * qu'en métadonnées, exactement comme le fait déjà le fil d'Ariane de la fenêtre Drive.
   */
  it('🔒 aucune écriture, nulle part', () => {
    for (const verbe of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER', 'DROP']) {
      expect(CODE, verbe).not.toContain(verbe);
    }
  });

  /**
   * 🔴 LES TROIS SONDES DE SCHÉMA, et chacune retire sa part sans rien casser : les migrations 245, 298 et 299
   * sont livrées séparément, et nommer une table absente ferait échouer la requête, donc la route, donc l'écran.
   */
  it('🔴 trois sondes, trois absences possibles', () => {
    expect(CODE).toContain('depotsDriveDisponibles()');
    expect(CODE).toContain('pieceMd5Disponible()');
    expect(CODE).toContain('indexEmpreintesDriveDisponible()');
  });

  /**
   * 🔴🔴 PAS DE `OR` DANS LA JOINTURE DU REGISTRE, ET C'EST MESURÉ : avec un `OR`, le planificateur abandonne les
   * deux index et balaie `gestion_piece_drive` en entier (26 552 lignes, 12 ms). En deux branches, chacune prend
   * son index et la réponse tombe en 1,3 ms. C'est le genre de régression qu'on ne voit jamais à l'œil.
   */
  it('🔴🔴 deux branches indexables, jamais un `OR`', () => {
    expect(CODE).toContain('UNION ALL');
    expect(CODE).not.toContain('OR lower(d.md5)');
    /* ⚠️ `lower(d.md5)` SANS `btrim` : l'index EST `btree (lower(md5))`, et l'expression doit être IDENTIQUE. */
    expect(CODE).not.toContain('lower(btrim(d.md5))');
  });
});
