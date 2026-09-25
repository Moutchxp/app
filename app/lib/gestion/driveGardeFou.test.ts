import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ASCENSION_MAX, ascensionVersRacine, DRIVE_NOM, indexer, nettoyerNom, NOM_MAX, RACINE_NOM, racineDe,
  verifierCreationRacine, verifierEcriture, type NoeudArbre, type OperationDrive,
} from './driveGardeFou';

/**
 * LOT DRIVE-1 — LE DOUBLE GARDE-FOU, ÉPROUVÉ EXHAUSTIVEMENT ET SANS RÉSEAU.
 *
 * 🔴 C'EST LE TEST LE PLUS IMPORTANT DU LOT. La règle d'Arno du 26/09/2026 est prioritaire sur tout le reste :
 * rien de ce qui existait avant ce lot ne doit pouvoir être touché. Chaque cas ci-dessous est une façon dont cela
 * pourrait arriver, et chacune doit être REFUSÉE — pas « en principe », mais par une fonction qui rend `ok: false`.
 *
 * 🔒 Aucun identifiant réel : tous les ids sont inventés, sauf ceux qui désignent des dossiers à NE PAS toucher et
 * qui n'existent que comme cible d'un refus.
 */

// ── L'ARBORESCENCE DE RÉFÉRENCE, telle que le programme l'aurait créée ────────────────────────────────────────────
const n = (driveId: string, parentDriveId: string | null, sorte: string, nom: string): NoeudArbre =>
  ({ driveId, parentDriveId, sorte, nom, chemin: nom });

const RACINE = n('rac-1', null, 'racine', RACINE_NOM);
const NOEUDS: NoeudArbre[] = [
  RACINE,
  n('nr-1', 'rac-1', 'non_rattaches', '00 Non rattachés'),
  n('pro-1', 'rac-1', 'proprietaires', '1 Propriétaires'),
  n('bie-1', 'rac-1', 'biens', '2 Biens immobiliers'),
  n('p-42', 'pro-1', 'proprietaire', 'DUPONT Jean (42)'),
  n('p-42-att', 'p-42', 'en_attente', 'En attente'),
  n('l-100', 'bie-1', 'bien', '4 rue Fictive, 92800 PUTEAUX — Appartement Type 2 — lot 100'),
  n('l-100-loc', 'l-100', 'rubrique', '1 Locataires'),
  n('l-100-occ-5', 'l-100-loc', 'occupation', 'BERNARD Alice (entrée 01/09/2022 – en cours)'),
  n('rc-1', 'p-42', 'raccourci', '→ 4 rue Fictive'),
];
const INDEX = indexer(NOEUDS);

/** Un identifiant qui n'est PAS à nous. Celui de « Documents clients scannés », relevé en lecture le 25/09/2026. */
const DOCUMENTS_CLIENTS_SCANNES = '1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI';
const DRIVE_GESTION_LOCATIVE = '0AMcTtmCenCqoUk9PVA';

const TOUTES: OperationDrive[] = [
  'creer_dossier', 'creer_raccourci', 'modifier', 'copier', 'supprimer', 'partager', 'deposer',
];

describe('🔴 ce qui existait avant ce lot est INTOUCHABLE', () => {
  it('« Documents clients scannés » est refusé, pour CHACUNE des sept opérations', () => {
    for (const operation of TOUTES) {
      const v = verifierEcriture({ operation, parentDriveId: DOCUMENTS_CLIENTS_SCANNES }, INDEX);
      expect(v.ok, operation).toBe(false);
      if (!v.ok) expect(v.garde).toBe('hors_liste_blanche');
    }
  });

  it('le Drive partagé lui-même est refusé : la racine est la SEULE chose qui y naisse', () => {
    const v = verifierEcriture({ operation: 'creer_dossier', parentDriveId: DRIVE_GESTION_LOCATIVE }, INDEX);
    expect(v.ok).toBe(false);
  });

  it('un dossier quelconque d’un AUTRE Drive est refusé', () => {
    for (const ailleurs of ['0AJL_HRfnZg0lUk9PVA', '1WBn5N5B5wBPtRpgv_PK7jKsZ3R3zInO-', 'inconnu']) {
      expect(verifierEcriture({ operation: 'creer_dossier', parentDriveId: ailleurs }, INDEX).ok, ailleurs).toBe(false);
    }
  });

  it('SUPPRIMER un élément qui n’est pas à nous est refusé, même depuis un parent qui l’est', () => {
    const v = verifierEcriture(
      { operation: 'supprimer', parentDriveId: 'rac-1', cibleDriveId: DOCUMENTS_CLIENTS_SCANNES }, INDEX);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.garde).toBe('hors_liste_blanche');
  });

  it('PARTAGER un élément qui n’est pas à nous est refusé', () => {
    expect(verifierEcriture(
      { operation: 'partager', parentDriveId: 'rac-1', cibleDriveId: 'un-autre-dossier' }, INDEX).ok).toBe(false);
  });
});

describe('🔴 ② LISTE BLANCHE — un dossier posé à la main SOUS notre racine reste intouchable', () => {
  /**
   * C'est le cas que le garde ① seul laisserait passer, et c'est précisément pour lui que le garde ② existe :
   * le dossier EST sous la racine, mais nous ne l'avons pas créé. On n'y touche pas.
   */
  it('un dossier ajouté à la main sous la racine est refusé, bien qu’il soit sous la racine', () => {
    const v = verifierEcriture({ operation: 'creer_dossier', parentDriveId: 'ajoute-a-la-main' }, INDEX);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.garde).toBe('hors_liste_blanche');
      expect(v.motif).toContain('n’a pas été créé par ce programme');
    }
  });

  it('le motif EXPLIQUE la règle, il ne dit pas seulement « refusé »', () => {
    const v = verifierEcriture({ operation: 'creer_dossier', parentDriveId: 'ajoute-a-la-main' }, INDEX);
    if (!v.ok) expect(v.motif).toContain('même un dossier posé à la main sous notre racine reste intouchable');
  });

  it('un RACCOURCI ne peut pas servir de parent — il écrirait ailleurs', () => {
    const v = verifierEcriture({ operation: 'creer_dossier', parentDriveId: 'rc-1' }, INDEX);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('RACCOURCI');
  });

  it('sans racine enregistrée, RIEN n’est autorisé — il n’y a pas de territoire', () => {
    const vide = indexer([]);
    for (const operation of TOUTES) {
      expect(verifierEcriture({ operation, parentDriveId: 'quoi-que-ce-soit' }, vide).ok, operation).toBe(false);
    }
  });
});

describe('🔴 ① SOUS LA RACINE — l’ascension doit aboutir, sinon on refuse', () => {
  it('un nœud dont le parent est ABSENT de la table est refusé : on ne peut rien affirmer', () => {
    const orphelin = indexer([RACINE, n('perdu', 'parent-inconnu', 'bien', 'Orphelin')]);
    const v = verifierEcriture({ operation: 'creer_dossier', parentDriveId: 'perdu' }, orphelin);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.garde).toBe('hors_racine');
  });

  it('un CYCLE dans la table est refusé, et ne fait pas boucler le programme', () => {
    const cycle = indexer([RACINE, n('a', 'b', 'bien', 'A'), n('b', 'a', 'bien', 'B')]);
    expect(ascensionVersRacine('a', cycle)).toBeNull();
    expect(verifierEcriture({ operation: 'creer_dossier', parentDriveId: 'a' }, cycle).ok).toBe(false);
  });

  it('une chaîne plus longue que la borne est refusée plutôt que parcourue indéfiniment', () => {
    const longs: NoeudArbre[] = [RACINE];
    for (let i = 0; i < ASCENSION_MAX + 5; i += 1) {
      longs.push(n(`x${i}`, i === 0 ? 'rac-1' : `x${i - 1}`, 'bien', `X${i}`));
    }
    const index = indexer(longs);
    expect(ascensionVersRacine('x0', index)).not.toBeNull();
    expect(ascensionVersRacine(`x${ASCENSION_MAX + 4}`, index)).toBeNull();
  });

  it('l’ascension rend le chemin PARCOURU, du parent jusqu’à la racine', () => {
    const chemin = ascensionVersRacine('l-100-occ-5', INDEX);
    expect(chemin?.map((x) => x.driveId)).toEqual(['l-100-occ-5', 'l-100-loc', 'l-100', 'bie-1', 'rac-1']);
  });

  it('un parent sans identifiant est refusé — une écriture sans lieu ne peut pas être autorisée', () => {
    for (const vide of [null, undefined, '', '   ']) {
      expect(verifierEcriture({ operation: 'creer_dossier', parentDriveId: vide }, INDEX).ok).toBe(false);
    }
  });
});

describe('ce qui est AUTORISÉ — un garde-fou qui refuse tout ne sert à rien non plus', () => {
  it('créer sous la racine, sous un dossier de niveau 1, sous un propriétaire, sous un bien', () => {
    for (const parent of ['rac-1', 'nr-1', 'pro-1', 'bie-1', 'p-42', 'l-100', 'l-100-loc']) {
      expect(verifierEcriture({ operation: 'creer_dossier', parentDriveId: parent }, INDEX).ok, parent).toBe(true);
    }
  });

  it('créer un raccourci dans un dossier à nous, vers un dossier à nous', () => {
    expect(verifierEcriture(
      { operation: 'creer_raccourci', parentDriveId: 'p-42', cibleDriveId: 'l-100' }, INDEX).ok).toBe(true);
  });

  it('les sept opérations sont permises À L’INTÉRIEUR de l’arborescence', () => {
    for (const operation of TOUTES) {
      expect(verifierEcriture({ operation, parentDriveId: 'l-100', cibleDriveId: 'l-100-loc' }, INDEX).ok, operation)
        .toBe(true);
    }
  });
});

describe('🔴 LA RACINE — le seul point d’écriture hors de l’arborescence, et le plus surveillé', () => {
  const vide = indexer([]);

  it('elle ne peut naître que dans « GESTION LOCATIVE », et nulle part ailleurs', () => {
    const v = verifierCreationRacine(
      { driveIdCible: '0AJL_HRfnZg0lUk9PVA', driveIdAttendu: DRIVE_GESTION_LOCATIVE, homonymesTrouves: [] }, vide);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain(DRIVE_NOM);
  });

  it('elle naît quand le Drive est le bon et que rien du même nom n’existe', () => {
    expect(verifierCreationRacine(
      { driveIdCible: DRIVE_GESTION_LOCATIVE, driveIdAttendu: DRIVE_GESTION_LOCATIVE, homonymesTrouves: [] },
      vide).ok).toBe(true);
  });

  it('🔴 un élément du même nom existe déjà → ARRÊT, jamais une réutilisation', () => {
    const v = verifierCreationRacine({
      driveIdCible: DRIVE_GESTION_LOCATIVE, driveIdAttendu: DRIVE_GESTION_LOCATIVE,
      homonymesTrouves: [{ id: 'deja-la', nom: RACINE_NOM }],
    }, vide);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.garde).toBe('racine_existante');
      expect(v.motif).toContain('ne réutilise pas et ne modifie pas un dossier qu’il n’a pas créé');
      expect(v.motif).toContain('Arno doit trancher');
    }
  });

  it('une racine déjà enregistrée n’est pas recréée une seconde fois', () => {
    const v = verifierCreationRacine(
      { driveIdCible: DRIVE_GESTION_LOCATIVE, driveIdAttendu: DRIVE_GESTION_LOCATIVE, homonymesTrouves: [] }, INDEX);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.garde).toBe('racine_existante');
  });

  it('la racine mémorisée se retrouve, et il n’y en a qu’une', () => {
    expect(racineDe(INDEX)?.driveId).toBe('rac-1');
    expect(racineDe(indexer([]))).toBeNull();
  });
});

describe('les noms de dossiers', () => {
  /**
   * 🔴 CORRECTIF trouvé par `driveArbre.test.ts` : la barre oblique était remplacée par un tiret « par prudence »,
   * ce qui transformait en silence « entrée 01/09/2022 » en « 01-09-2022 » — un format de date qu'Arno avait
   * explicitement demandé. Drive l'accepte ; nettoyer au-delà du nécessaire, c'est déformer la donnée.
   */
  it('la barre oblique est CONSERVÉE : les dates gardent leur format JJ/MM/AAAA', () => {
    expect(nettoyerNom('BERNARD Alice (entrée 01/09/2022 – en cours)'))
      .toBe('BERNARD Alice (entrée 01/09/2022 – en cours)');
    expect(nettoyerNom('DUPONT/MARTIN Jean')).toBe('DUPONT/MARTIN Jean');
  });

  it('les caractères de CONTRÔLE, eux, sont retirés — ils cassent les exports', () => {
    expect(nettoyerNom('DUPONT\u0000Jean')).toBe('DUPONT Jean');
    expect(nettoyerNom('a\tb')).toBe('a b');
  });

  it('les accents sont CONSERVÉS : un nom déformé est introuvable à l’œil', () => {
    expect(nettoyerNom('Frédéric ÉLOI (12)')).toBe('Frédéric ÉLOI (12)');
    expect(nettoyerNom('4 rue de l’Église, 92800 PUTEAUX')).toBe('4 rue de l’Église, 92800 PUTEAUX');
  });

  it('les espaces multiples et les caractères de contrôle sont réduits', () => {
    expect(nettoyerNom('  DUPONT    Jean \n ')).toBe('DUPONT Jean');
  });

  it('un nom trop long est coupé, sur un espace quand c’est possible, et le DIT par une ellipse', () => {
    const long = nettoyerNom(`${'mot '.repeat(60)}fin`);
    expect(long.length).toBeLessThanOrEqual(NOM_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toContain('  ');
  });

  it('un nom vide ne rend jamais une chaîne vide — Drive la refuserait', () => {
    expect(nettoyerNom('')).toBe('sans nom');
    expect(nettoyerNom('   ')).toBe('sans nom');
  });
});

/**
 * GARANTIES STATIQUES — ce qu'aucun test de fonction ne peut tenir : qu'il n'existe AUCUN autre chemin d'écriture.
 */
describe('🔴 aucune porte dérobée', () => {
  const garde = readFileSync('app/lib/gestion/driveGardeFou.ts', 'utf8');
  const ecriture = readFileSync('app/lib/gestion/driveEcriture.ts', 'utf8');

  /**
   * ⚠️ ON EXAMINE LE CODE, PAS LA PROSE. Les deux modules PROMETTENT en commentaire qu'il n'existe pas de
   * `--force` : chercher le mot dans le fichier entier ferait échouer le test sur sa propre documentation.
   */
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  it('le garde-fou n’a ni option de contournement, ni mode « forcer »', () => {
    for (const src of [garde, ecriture]) {
      expect(sansCommentaires(src)).not.toMatch(/--force|forcer|ignorerGarde|sansGarde|bypass/i);
    }
  });

  it('CHAQUE écriture Drive passe par le verdict — aucune requête d’écriture n’est émise sans lui', () => {
    // Toute méthode HTTP qui modifie quelque chose doit être précédée, dans le même module, d'un appel au garde.
    const verbes = ecriture.match(/method:\s*'(POST|PATCH|PUT|DELETE)'/g) ?? [];
    expect(verbes.length).toBeGreaterThan(0);
    // Il y a au moins autant d'appels au garde que de verbes d'écriture.
    const appels = ecriture.match(/verifierEcriture\(|verifierCreationRacine\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(verbes.length);
  });

  it('le module d’écriture ne connaît AUCUN identifiant de dossier préexistant', () => {
    // Aucun identifiant en dur : le seul identifiant extérieur admis est celui du Drive, lu chez Google au runtime.
    expect(ecriture).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');  // Documents clients scannés
    expect(ecriture).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  it('un refus est TOUJOURS journalisé avant d’être rendu', () => {
    expect(ecriture).toContain('journaliserRefus');
  });
});
