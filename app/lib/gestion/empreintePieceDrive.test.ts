import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — RECONNAÎTRE UN CONTENU, PAS UN NOM ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « Depuis gestion@, j'envoie à mon adresse perso un mail avec une pièce prise dans
 * notre Drive et RENOMMÉE. Je me renvoie ce mail vers gestion@. Les pièces du mail revenu sont les mêmes fichiers,
 * mais la loupe ne trouve rien et aucune pastille verte n'apparaît. »
 *
 * RÈGLE D'ARNO : « une pièce dont le CONTENU est déjà dans le Drive doit être reconnue, quel que soit son nom —
 * au minimum par la loupe, avec le chemin tracé ; au mieux dès l'ouverture de la fenêtre, par la pastille verte. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ, PARCE QU'IL EXPLIQUE LA FORME DE CE QUI SUIT ════════════════════════════════════
 *
 * Les trois pièces de la chaîne (27122, 27124 notre envoi, 27125 le mail revenu) portent le MÊME contenu à
 * l'octet : md5 `4b782aa3d863fd2e7f2e849d523b0448`, sha256 `0d2f4019…dfcaec`, 133 157 octets. Le contenu a
 * traversé Gmail SANS MODIFICATION, aller-retour compris. Et pourtant rien ne s'allumait, pour deux raisons :
 *
 *   ① `gestion_piece_drive` ne connaît pas la pièce 27125 (0 ligne) : une pièce revenue par mail est NEUVE.
 *      La loupe et la pastille partaient toutes deux du lien `piece_id` — sans lien, aucun départ.
 *   ② l'empreinte manquait des DEUX côtés : nous ne gardions que le sha256 (Google ne connaît que le md5), et la
 *      colonne `md5` du registre n'est remplie que pour `origine='copie'` — 26 522 lignes sur 26 552. Les 30
 *      autres sont celles que la fenêtre « Ranger une pièce dans le Drive » écrit, dont les 5 copies d'Arno.
 *
 * ⚠️ ET GOOGLE NE SAIT PAS CHERCHER PAR EMPREINTE : `files.list` avec `q=md5Checksum='…'` répond HTTP 400
 * « Invalid Value », mesuré ce jour sur les 10 drives partagés et avec `corpora=allDrives`. Ce qu'on veut
 * reconnaître, il faut donc l'avoir rangé chez nous — c'est toute la raison de la colonne `gestion_piece.md5`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
let migration298 = true;
vi.mock('./schema', () => ({
  copiePiecesDisponible: async () => true,
  corbeilleDriveDisponible: async () => true,
  journalMouvementDriveDisponible: async () => true,
  pieceMd5Disponible: async () => migration298,
}));

import { fichiersDriveDeLaPiece } from './driveMouvementRepo';
import { phraseMethode } from './localisationDrive';

const sql = () => String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');

beforeEach(() => {
  migration298 = true;
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① « MÊME PIÈCE **OU** MÊME CONTENU » — LA REQUÊTE QUI OUVRE LES DEUX VOIES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① les emplacements d’une pièce viennent de deux voies', () => {
  /**
   * 🔴🔴 LA VOIE ② EST CELLE QUI SAUVE LE CAS D'ARNO. La pièce revenue n'a aucun dépôt à son nom : sans la
   * jointure par empreinte, la requête rend zéro ligne et la fenêtre n'a rien à montrer.
   */
  it('🔴🔴 le lien de pièce ET l’empreinte du contenu, réunis', async () => {
    await fichiersDriveDeLaPiece(27125);
    const r = sql();
    expect(r).toContain('d.piece_id = $1');                                  // ① le lien
    expect(r).toContain('lower(btrim(p.md5)) = lower(btrim(d.md5))');        // ② le contenu
    expect(r).toContain('UNION ALL');
  });

  /**
   * 🔴 LA COMPARAISON NORMALISE DES DEUX CÔTÉS, et l'index de la migration 298 porte sur `lower(md5)` : un index
   * qui ne normaliserait pas ne serait jamais pris par le planificateur, et la pastille ferait attendre.
   */
  it('🔴 elle compare en minuscules, des deux côtés', async () => {
    await fichiersDriveDeLaPiece(27125);
    expect(sql()).toContain('lower(btrim(p.md5))');
    expect(sql()).toContain('lower(btrim(d.md5))');
  });

  /** 🔴 UNE PIÈCE SANS EMPREINTE NE SE CHERCHE PAS PAR EMPREINTE : la condition l'écarte en SQL. */
  it('🔴 une empreinte vide n’apparie rien', async () => {
    await fichiersDriveDeLaPiece(27125);
    expect(sql()).toContain("coalesce(btrim(p.md5), '') <> ''");
  });

  /**
   * ⚠️ LES COPIES DISPARUES SONT ÉCARTÉES DES DEUX CÔTÉS. Une empreinte qui ne désigne plus qu'un fichier
   * supprimé ferait annoncer un emplacement où l'on n'irait rien trouver — c'est déjà la règle de la loupe.
   */
  it('⚠️ une copie disparue n’est jamais un emplacement', async () => {
    await fichiersDriveDeLaPiece(27125);
    expect((sql().match(/disparu_le IS NULL/g) ?? [])).toHaveLength(2);
  });

  /**
   * 🔴🔴 UN FICHIER TROUVÉ PAR LES DEUX VOIES NE COMPTE QU'UNE FOIS, et il s'annonce par la voie la plus forte
   * (le registre). Sans ce `DISTINCT ON`, la pastille aurait compté deux fois le même emplacement — un chiffre
   * faux est pire qu'un chiffre absent.
   */
  it('🔴🔴 pas de doublon, et le registre l’emporte', async () => {
    await fichiersDriveDeLaPiece(27125);
    const r = sql();
    expect(r).toContain('DISTINCT ON (drive_file_id)');
    expect(r).toContain('ORDER BY drive_file_id, par_empreinte, id');
  });

  it('🔴 la voie remonte à l’appelant, pour que l’écran puisse la dire', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { drive_file_id: 'A', md5: 'e1', par_empreinte: false },
        { drive_file_id: 'B', md5: 'e1', par_empreinte: true },
      ],
    });
    expect(await fichiersDriveDeLaPiece(27125)).toEqual([
      { driveFileId: 'A', md5: 'e1', parEmpreinte: false },
      { driveFileId: 'B', md5: 'e1', parEmpreinte: true },
    ]);
  });

  /**
   * 🔴🔴 SANS LA MIGRATION 298, `gestion_piece.md5` N'EST NOMMÉE NULLE PART. La requête redevient MOT POUR MOT
   * celle d'avant ce lot : le comportement est celui d'aujourd'hui, et rien ne casse.
   */
  it('🔴🔴 sans la migration 298, la colonne n’est nommée nulle part', async () => {
    migration298 = false;
    await fichiersDriveDeLaPiece(27125);
    const r = sql();
    expect(r).not.toContain('p.md5');
    expect(r).not.toContain('UNION ALL');
    expect(r).not.toContain('gestion_piece ');
  });

  it('⚠️ un identifiant de pièce absurde ne produit aucune requête', async () => {
    expect(await fichiersDriveDeLaPiece(0)).toEqual([]);
    expect(await fichiersDriveDeLaPiece(-3)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'EMPREINTE SE CALCULE À LA CAPTURE — LÀ OÙ ELLE NE COÛTE RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② la relève calcule le md5 au moment où elle tient les octets', () => {
  const src = readFileSync('app/lib/gestion/captureRepo.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  /**
   * 🔴 C'EST LE SEUL MOMENT OÙ C'EST GRATUIT. Plus tard, il faut redemander les octets à MinIO, au Drive ou à
   * Gmail — ce que fait la passe de rattrapage, pour l'existant seulement.
   */
  it('🔴🔴 le md5 vient des octets de la pièce, pas d’une métadonnée', () => {
    expect(code).toContain("createHash('md5').update(p.contenu).digest('hex')");
  });

  /** 🔴 ET LA COLONNE NE SE NOMME QUE SI LA MIGRATION EST LÀ : sinon l'insertion est celle d'avant ce lot. */
  it('🔴🔴 la colonne est conditionnée par la sonde 298', () => {
    expect(code).toContain('const avecMd5 = await pieceMd5Disponible()');
    expect(code).toContain("...(avecMd5 ? ['md5'] : [])");
  });

  /**
   * ⚠️ LA SONDE EST LUE UNE FOIS PAR MESSAGE, HORS DE LA BOUCLE. Elle est mémoïsée, mais la lire par pièce ferait
   * dépendre la forme d'une requête d'un appel répété pour rien.
   */
  it('⚠️ la sonde est lue hors de la boucle des pièces', () => {
    const iSonde = code.indexOf('const avecMd5 = await pieceMd5Disponible()');
    const iBoucle = code.indexOf('for (const p of pieces)');
    expect(iSonde).toBeGreaterThan(0);
    expect(iBoucle).toBeGreaterThan(iSonde);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA PASSE DE RATTRAPAGE N'ÉCRIT RIEN SANS QU'ON LE DEMANDE, ET JAMAIS DANS LE DRIVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 ③ la passe de rattrapage', () => {
  const src = readFileSync('app/scripts/empreintes-md5-pieces.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  it('🔒 sans `--appliquer`, elle simule', () => {
    expect(code).toContain("process.argv.includes('--appliquer')");
    expect(code).toContain('if (appliquer)');
  });

  /**
   * 🔒🔒 ELLE NE PEUT PAS ÉCRIRE DANS LE DRIVE, et c'est une propriété de son code : la passe ② n'émet qu'un
   * `files.get` à trois champs. Aucun verbe d'écriture, aucun module d'écriture Drive.
   */
  it('🔒🔒 aucun verbe d’écriture Drive n’est émis', () => {
    for (const mot of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
      'files.copy', 'driveMouvement', 'driveEcriture', 'trashed:']) {
      expect(code).not.toContain(mot);
    }
    expect(code).toContain('fields=id,md5Checksum,size');
  });

  /** 🔴 ELLE NE REMPLACE JAMAIS UNE EMPREINTE DÉJÀ POSÉE : la condition est dans le `WHERE`, pas dans un `if`. */
  it('🔴 elle ne réécrit pas ce qui est déjà rangé', () => {
    expect((code.match(/coalesce\(md5, ''\) = ''/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  /** ⚠️ ET ELLE REFUSE DE TOURNER SANS LA MIGRATION, au lieu de laisser la base se plaindre à sa place. */
  it('⚠️ sans la migration 298, elle le dit et ne fait rien', () => {
    expect(code).toContain('await pieceMd5Disponible()');
    expect(code).toContain('La migration 298 n’est pas appliquée');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA PHRASE DIT CE QU'ON A COMPARÉ, ET CE QU'ON N'A PAS COMPARÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ ce que la phrase a le droit de promettre', () => {
  /**
   * 🔴 SANS INDEX, « le Drive n'est pas balayé » EST LA VÉRITÉ, et la phrase ne doit pas s'en écarter. Elle
   * nomme désormais les deux sources de la comparaison : ce qu'on a rangé, et ce qu'on a ouvert.
   */
  it('🔴 sans index, elle nomme le rangé et les dossiers ouverts', () => {
    const p = phraseMethode({
      nombre: 2, parRegistre: 0, parEmpreinte: 2, empreinteConnue: true, dossiersLus: 3,
    });
    expect(p).toContain('2 par empreinte de contenu identique');
    expect(p).toContain('ce que l’application a elle-même rangé');
    expect(p).toContain('3 dossiers déjà ouverts');
    expect(p).toContain('le Drive n’est pas balayé');
  });

  /** 🔴 LE COMPTEUR DIT TOUJOURS « CONNU(S) » : promettre l'exhaustivité ferait conclure « il n'est nulle part ». */
  it('🔴 le mot « connus » ne disparaît jamais', () => {
    expect(phraseMethode({
      nombre: 1, parRegistre: 0, parEmpreinte: 1, empreinteConnue: true, dossiersLus: 1, fichiersIndexes: 181001,
    })).toContain('1 emplacement connu');
  });
});
