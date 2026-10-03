import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const schemaMock = vi.fn();
const journalMock = vi.fn();
/** LOT 5-PJ-C — la colonne `compte_google` n'existe qu'après la migration 246 : le dépôt la nomme SOUS SONDE. */
const compteColonneMock = vi.fn();
/** LOT 5-PJ-D — le réglage du nombre de dossiers récents n'existe qu'après la migration 248. Même précaution. */
const reglageRecentsMock = vi.fn();
/**
 * 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — la colonne `md5` du registre n'existe qu'avec la migration 255 (la MÊME que
 * `verifie_le`, que `copiePiecesDisponible` sonde : elles arrivent ensemble). Elle est donc nommée SOUS SONDE,
 * comme `compte_google` et `nom_depose`.
 */
const md5ColonneMock = vi.fn();
const copieDisparueMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
}));
vi.mock('./schema', () => ({
  depotsDriveDisponibles: () => schemaMock(),
  journalPieceDriveDisponible: () => journalMock(),
  compteGoogleDuDepotDisponible: () => compteColonneMock(),
  reglageRecentsDisponible: () => reglageRecentsMock(),
  copiePiecesDisponible: () => md5ColonneMock(),
  /**
   * 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — la colonne `disparu_le` (migration 288). C'est elle qui fait qu'une copie
   * mise à la corbeille cesse d'être annoncée comme un dépôt. Pilotée à part : sans elle, le fragment rend `true`
   * et la requête est mot pour mot celle d'avant ce lot.
   */
  copieDisparueDisponible: () => copieDisparueMock(),
  // ⚠️ Non sollicitée par ces épreuves (aucune ne passe de `nomDepose`), mais exportée pour que le module charge.
  nomDeposeDisponible: async () => false,
}));

import {
  deplacerCopieAuRegistre, dernierDossierDuFil, dossiersRecentsDeposes, lireDepotExistant, lireDepotsDesPieces,
  lireMaxDossiersRecents, memoriserDepot,
} from './driveRepo';

const sql = (i: number): string => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');
const params = (i: number): unknown[] => queryMock.mock.calls[i][1] as unknown[];

const aDeposer = {
  pieceId: 7, driveFileId: 'F1', dossierId: 'DOS', dossierNom: 'Dupont', driveId: 'DRV',
  webViewLink: 'https://drive/F1', auteurId: 3, auteurLibelle: 'Arnaud Jorel',
};

beforeEach(() => {
  queryMock.mockReset(); schemaMock.mockReset(); journalMock.mockReset(); compteColonneMock.mockReset();
  reglageRecentsMock.mockReset(); md5ColonneMock.mockReset(); copieDisparueMock.mockReset();
  copieDisparueMock.mockResolvedValue(true);
  schemaMock.mockResolvedValue(true); journalMock.mockResolvedValue(true); compteColonneMock.mockResolvedValue(true);
  reglageRecentsMock.mockResolvedValue(true); md5ColonneMock.mockResolvedValue(true);
});

describe('sans la migration 245', () => {
  /**
   * 🔴 CELLE-CI CONDITIONNE LA FONCTIONNALITÉ, contrairement à la 244. Sans mémoire, on ne peut pas empêcher un
   * doublon : déposer quand même enverrait une seconde copie au clic suivant, sans le dire.
   */
  it('aucune requête n’est émise, et on le DIT à l’appelant', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await lireDepotsDesPieces([1, 2])).toEqual([]);
    expect(await dernierDossierDuFil(383)).toBeNull();
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'sans_schema' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('lire les dépôts', () => {
  it('une SEULE requête pour tout un message, avec les identifiants LIÉS', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireDepotsDesPieces([1, 2, 3]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(params(0)).toEqual([[1, 2, 3]]);
    expect(sql(0)).toContain('piece_id = ANY($1::bigint[])');
  });

  it('aucune pièce → aucune requête', async () => {
    expect(await lireDepotsDesPieces([])).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rend le lien Drive et le nom du dossier tels qu’enregistrés', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        piece_id: 7, drive_file_id: 'F1', drive_dossier_id: 'DOS', dossier_nom: 'Dupont',
        web_view_link: 'https://drive/F1', depose_le: '2026-09-25T10:00:00Z', depose_par_libelle: 'Arnaud Jorel',
      }],
    });
    expect((await lireDepotsDesPieces([7]))[0]).toMatchObject({
      pieceId: 7, dossierId: 'DOS', dossierNom: 'Dupont', webViewLink: 'https://drive/F1', deposePar: 'Arnaud Jorel',
    });
  });
});

describe('le dernier dossier de l’échange', () => {
  it('remonte de l’échange aux dépôts, et prend le plus récent', async () => {
    queryMock.mockResolvedValue({ rows: [{ drive_dossier_id: 'DOS', dossier_nom: 'Dupont' }] });
    expect(await dernierDossierDuFil(383)).toEqual({ id: 'DOS', nom: 'Dupont' });
    expect(sql(0)).toContain('ORDER BY d.depose_le DESC');
    expect(sql(0)).toContain('LIMIT 1');
    expect(params(0)).toEqual([383]);
  });
  it('aucun dépôt pour cet échange → null, et le sélecteur s’ouvrira à la racine', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await dernierDossierDuFil(383)).toBeNull();
  });
});

/**
 * LOT 5-PJ-D — LES DOSSIERS RÉCENTS. Cette liste est DÉRIVÉE de la mémoire des dépôts, jamais tenue à la main : un
 * dossier y figure parce qu'un fichier y est parti. Elle est commune à toute l'équipe ; les DROITS, eux, sont
 * vérifiés ensuite, dossier par dossier (cf. `dossiersRecents.ts`).
 */
describe('les dossiers récents', () => {
  it('rend des dossiers DISTINCTS, le plus récent d’abord, et le nombre demandé est LIÉ', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await dossiersRecentsDeposes(18);
    expect(params(0)).toEqual([18]);
    expect(sql(0)).toContain('DISTINCT ON (drive_dossier_id)');
    expect(sql(0)).toContain('ORDER BY dernier DESC');
    expect(sql(0)).toContain('LIMIT $1');
  });

  it('rend le nom et le Drive du DERNIER dépôt de chaque dossier', async () => {
    queryMock.mockResolvedValue({
      rows: [{ drive_dossier_id: 'DOS', dossier_nom: 'Dupont', drive_id: 'DRV', dernier: '2026-09-25T10:00:00Z' }],
    });
    expect(await dossiersRecentsDeposes(6)).toEqual([
      { id: 'DOS', nom: 'Dupont', driveId: 'DRV', dernierDepot: '2026-09-25T10:00:00Z' },
    ]);
  });

  it('sans la migration 245, aucune requête : il ne peut exister aucun dépôt', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await dossiersRecentsDeposes(6)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('un nombre nul ou négatif n’interroge pas la base', async () => {
    expect(await dossiersRecentsDeposes(0)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('le réglage du nombre de dossiers récents', () => {
  it('sans la migration 248, le défaut de six, et AUCUNE requête sur une colonne absente', async () => {
    reglageRecentsMock.mockResolvedValue(false);
    expect(await lireMaxDossiersRecents()).toBe(6);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('avec la migration, la valeur de la base est lue', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 9 }] });
    expect(await lireMaxDossiersRecents()).toBe(9);
    expect(sql(0)).toContain('drive_dossiers_recents_max');
  });

  /** Une valeur aberrante ne doit pas vider l'écran : elle est ramenée dans ses bornes, comme les autres réglages. */
  it('une valeur hors bornes est ramenée, jamais refusée', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 500 }] });
    expect(await lireMaxDossiersRecents()).toBe(20);
  });

  it('une base qui refuse la lecture rend le défaut, pas une exception : le sélecteur s’ouvre quand même', async () => {
    queryMock.mockRejectedValue(new Error('colonne inconnue'));
    expect(await lireMaxDossiersRecents()).toBe(6);
  });
});

describe('mémoriser un dépôt', () => {
  it('écrit la ligne, puis le journal', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'enregistre' });
    expect(sql(0)).toContain('INSERT INTO gestion_piece_drive');
    expect(sql(1)).toContain('INSERT INTO gestion_journal');
  });

  /** L'anti-doublon est tenu par la BASE : entre lire et écrire, il y a toujours la place pour un second clic. */
  it('le doublon est refusé par la base, pas par une lecture préalable', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'doublon' });
    expect(sql(0)).toContain('ON CONFLICT (piece_id, drive_dossier_id) DO NOTHING');
  });

  it('un doublon n’écrit AUCUNE ligne de journal — il ne s’est rien passé', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await memoriserDepot(aDeposer);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('l’auteur est figé en texte, avec son identifiant', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot(aDeposer);
    expect(params(0)).toContain('Arnaud Jorel');
    expect(params(0)).toContain(3);
  });

  /**
   * LOT 5-PJ-C — on sait AVEC QUEL COMPTE GOOGLE le fichier est parti. C'est ce compte-là qui en est propriétaire
   * côté Drive : sans lui, on saurait qui a cliqué sans savoir sous quelle identité.
   */
  it('avec la migration 246, le compte Google employé est enregistré ET journalisé', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot({ ...aDeposer, compteGoogle: 'a.jorel@criterimmo.fr' });
    expect(sql(0)).toContain('compte_google');
    expect(params(0)).toContain('a.jorel@criterimmo.fr');
    // Le commentaire du journal est le 4e paramètre lié (entite, entite_id, valeur_apres, COMMENTAIRE, …).
    expect(String(params(1)[3])).toContain('a.jorel@criterimmo.fr');
  });

  /** Sans la 246, NOMMER la colonne ferait échouer toute la requête — et le fichier, lui, est déjà dans le Drive. */
  it('sans la migration 246, la colonne n’est pas nommée, et le dépôt s’enregistre quand même', async () => {
    compteColonneMock.mockResolvedValue(false);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await memoriserDepot({ ...aDeposer, compteGoogle: 'a@criterimmo.fr' })).toEqual({ etat: 'enregistre' });
    expect(sql(0)).not.toContain('compte_google');
    expect(params(0)).not.toContain('a@criterimmo.fr');
  });

  /**
   * 🔴 L'ENTITÉ EST DÉCIDÉE, PAS DEVINÉE. Écrire « envoi » en dur avait fait rendre un échec pour un message
   * pourtant parti, le 23/09. Sans la 245, on se range sur une entité que la base accepte déjà.
   */
  it('sans l’élargissement du journal, la ligne se range sur une entité admise', async () => {
    journalMock.mockResolvedValue(false);
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })              // l'insertion du dépôt
      .mockResolvedValueOnce({ rows: [{ message_id: 42 }] })          // le message qui porte la pièce
      .mockResolvedValueOnce({ rows: [] });                           // le journal
    await memoriserDepot(aDeposer);
    const journal = queryMock.mock.calls.find((c) => String(c[0]).includes('gestion_journal'));
    expect((journal?.[1] as unknown[])[0]).toBe('message');
    expect((journal?.[1] as unknown[])[1]).toBe(42);
  });

  it('avec la 245, la ligne se range sur « piece_drive »', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot(aDeposer);
    expect(params(1)[0]).toBe('piece_drive');
    expect(params(1)[1]).toBe(7);
  });

  /** Le fichier est DANS le Drive : un journal impossible ne doit pas faire croire que le dépôt a échoué. */
  it('un journal qui échoue ne défait pas le dépôt', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(new Error('journal refusé'));
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'enregistre' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — L'EMPREINTE DE LA COPIE ENTRE AU REGISTRE, AU DÉPÔT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (03/10/2026) : « à chaque dépôt réussi […] enregistrer IMMÉDIATEMENT la copie (fileId, md5,
   parents, nom) au registre et dans l'index ».

   🔴 CE QUI ÉTAIT ÉCRIT : la colonne existait depuis la migration 255, et SEULE la copie automatique la
   remplissait (`enregistrerCopie`, `copiePiecesReel.ts`). Un rangement à la main écrivait donc une ligne à `md5`
   NULL — vérifié en base sur le cas d'Arno : `gestion_piece_drive` id 26554, déposée le 03/10 à 21:37:35, `md5`
   vide. `fichiersDriveDeLaPiece` et `emplacementsDesPieces` cherchent « le même contenu » par `lower(d.md5)` : une
   copie sans empreinte n'était retrouvable que par son lien `piece_id`.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’empreinte au registre', () => {
  const MD5 = '7b2364ff4527e7a55365f506f98bf888';

  it('🔴🔴 elle est écrite, et c’est un paramètre LIÉ', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot({ ...aDeposer, md5: MD5 });
    expect(sql(0)).toContain('md5');
    expect(params(0)).toContain(MD5);
  });

  /**
   * 🔴 NORMALISÉE PAR LE MÊME MODULE QUE L'INDEX (`empreinteNormalisee`). Google rend le md5 en minuscules, mais
   * rien ne le garantit par contrat, et les index SQL portent sur `lower(md5)` : deux normalisations différentes
   * des deux côtés feraient rater la comparaison que tout ce lot existe pour rendre possible.
   */
  it('🔴 une empreinte en MAJUSCULES est rangée en minuscules', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot({ ...aDeposer, md5: MD5.toUpperCase() });
    expect(params(0)).toContain(MD5);
  });

  /**
   * ⚠️ SANS LA MIGRATION 255, LA COLONNE N'EST NOMMÉE NULLE PART. Nommer une colonne absente ferait échouer la
   * requête ENTIÈRE — alors que le fichier EST déjà dans le Drive. Règle du module, et elle a déjà coûté une fois.
   */
  it('⚠️ sans la migration 255, « md5 » n’est pas nommé', async () => {
    md5ColonneMock.mockResolvedValue(false);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot({ ...aDeposer, md5: MD5 });
    expect(sql(0)).not.toContain('md5');
    expect(params(0)).not.toContain(MD5);
  });

  /**
   * ⚠️ PAS D'EMPREINTE ⇒ PAS DE COLONNE, et surtout pas une chaîne vide : une empreinte absente et une empreinte
   * vide ne doivent pas pouvoir s'apparier entre elles. « Deux documents Google natifs n'ont pas le même
   * contenu » (encadré d'`empreinteNormalisee`).
   */
  it('⚠️ un document sans empreinte n’écrit rien, et le dépôt réussit', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    for (const md5 of [undefined, null, '', '   ']) {
      queryMock.mockClear();
      const r = await memoriserDepot({ ...aDeposer, md5 });
      expect(r.etat).toBe('enregistre');
      expect(sql(0)).not.toContain('md5');
    }
  });

  /** ⚠️ ET UN APPELANT D'AVANT CE LOT (aucun `md5`) ÉCRIT EXACTEMENT CE QU'IL ÉCRIVAIT. */
  it('⚠️ un appelant d’avant ce lot est inchangé', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot(aDeposer);
    expect(sql(0)).not.toContain('md5');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — UN DÉPLACEMENT SUIT L'ENTRÉE, IL N'EN CRÉE PAS UNE SECONDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   RÈGLE D'ARNO (03/10/2026) : « un DÉPLACEMENT met à jour les parents de l'entrée EXISTANTE du registre et de
   l'index. Il ne crée jamais une seconde entrée. Après un déplacement, un seul emplacement connu : le dernier. »

   🔴 MESURÉ SUR LA BASE D'ARNO : 26 555 lignes vives, UNE SEULE divergente — la ligne 26554, où le registre dit
   « Test creation dossier drive » et `files.get` dit « _MESURE nom immediat ». Le picto du mail annonçait donc un
   chemin faux et ouvrait la fenêtre là où le document n'est plus.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le parent du registre suit un déplacement', () => {
  it('🔴🔴 c’est un UPDATE sur le FICHIER, et jamais un INSERT', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await deplacerCopieAuRegistre('F1', 'CIBLE', 'Travaux')).toBe(1);
    expect(sql(0)).toContain('UPDATE gestion_piece_drive');
    expect(sql(0)).not.toContain('INSERT');
    expect(sql(0)).toContain('WHERE drive_file_id = $1');
    expect(params(0)).toEqual(['F1', 'CIBLE', 'Travaux']);
  });

  /**
   * 🔴 LE NOM DU DOSSIER SUIT LE DOSSIER. Sans lui, le menu d'emplacements afficherait l'ANCIEN nom à côté du
   * nouvel identifiant — deux vérités sur une seule ligne.
   */
  it('🔴 `dossier_nom` suit, et un nom vide ne l’écrase pas', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await deplacerCopieAuRegistre('F1', 'CIBLE', null);
    expect(sql(0)).toContain("coalesce(nullif(btrim($3), ''), dossier_nom)");
    expect(params(0)).toEqual(['F1', 'CIBLE', '']);
  });

  /** ⚠️ LA LIGNE DÉJÀ À LA BONNE PLACE N'EST PAS RÉÉCRITE : `drive_dossier_id <> $2` dans le `WHERE`. */
  it('⚠️ aucune écriture quand le parent est déjà le bon', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await deplacerCopieAuRegistre('F1', 'CIBLE', 'Travaux')).toBe(0);
    expect(sql(0)).toContain('drive_dossier_id <> $2');
  });

  /** ⚠️ UN IDENTIFIANT VIDE N'INTERROGE PAS LA BASE : il ne désigne ni fichier ni dossier. */
  it('⚠️ un identifiant vide n’émet aucune requête', async () => {
    expect(await deplacerCopieAuRegistre('   ', 'CIBLE', null)).toBe(0);
    expect(await deplacerCopieAuRegistre('F1', '  ', null)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** ⚠️ SANS LA MIGRATION 245, la table n'est NOMMÉE NULLE PART — règle du module, inchangée. */
  it('⚠️ sans la migration 245, aucune requête', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await deplacerCopieAuRegistre('F1', 'CIBLE', 'Travaux')).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ UN CONFLIT D'UNICITÉ N'EST PAS UNE PANNE. L'index `(piece_id, drive_dossier_id)` interdit deux lignes de la
   * même pièce dans le même dossier : si une ligne y est déjà, on laisse celle-ci telle quelle plutôt que de faire
   * échouer un déplacement qui a EU LIEU chez Google. Le nettoyage des fantômes, lui, le verra.
   */
  it('⚠️ un conflit d’unicité ne lève pas : le déplacement a eu lieu chez Google', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
    expect(await deplacerCopieAuRegistre('F1', 'CIBLE', 'Travaux')).toBe(0);
    erreur.mockRestore();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — UNE COPIE DISPARUE N'EST PLUS UN DÉPÔT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   🔴 DÉFAUT TROUVÉ SUR LE VRAI DRIVE le 03/10/2026, en instruisant le point 1 : `lireDepotsDesPieces` était le
   SEUL des huit endroits du module à joindre `gestion_piece_drive` SANS le fragment `sqlCopieVivante`
   (migration 288). Après avoir mis une copie à la corbeille depuis la fenêtre :

     ① la carte de la pièce annonçait encore « Dans le Drive · _MESURE dossier instantane · ouvrir » — un lien
        vers un fichier à la corbeille, et c'était la ligne la plus RÉCENTE qui gagnait (`depose_le DESC`) ;
     ② `lireDepotExistant`, qui s'appuie sur cette lecture, aurait répondu « déjà là » pour ce dossier : autrement
        dit l'application aurait REFUSÉ, en silence, de ranger un document qui n'y est plus.

   ⚠️ LA LIGNE RESTE EN BASE : on cesse de la LIRE, on ne l'efface pas. Elle dit un fait daté.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 les dépôts écartent les copies disparues', () => {
  it('🔴🔴 la lecture porte le fragment « copie vivante »', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireDepotsDesPieces([7]);
    expect(sql(0)).toContain('disparu_le IS NULL');
    // 🔴 ET LE PARAMÈTRE RESTE LIÉ : le fragment ne doit pas déplacer les numéros de paramètre.
    expect(params(0)).toEqual([[7]]);
  });

  /**
   * 🔴🔴 `lireDepotExistant` EN HÉRITE, et c'est l'essentiel : c'est lui qui décide si un rangement est un
   * doublon. Il n'a pas sa propre requête — il lit celle-ci, ce qui garantit qu'ils ne peuvent pas diverger.
   */
  it('🔴🔴 le détecteur de doublon lit la MÊME requête', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireDepotExistant(7, 'DOS');
    expect(sql(0)).toContain('disparu_le IS NULL');
  });

  /** ⚠️ SANS LA MIGRATION 288, la colonne n'est pas nommée : requête mot pour mot celle d'avant ce lot. */
  it('⚠️ sans la migration 288, « disparu_le » n’est pas nommé', async () => {
    copieDisparueMock.mockResolvedValue(false);
    queryMock.mockResolvedValue({ rows: [] });
    await lireDepotsDesPieces([7]);
    expect(sql(0)).not.toContain('disparu_le');
  });
});
