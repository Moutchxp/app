import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ASCENSION_MAX, ascensionVersRacine, DRIVE_NOM, indexer, nettoyerNom, NOM_MAX, RACINE_NOM, racineDe,
  verifierCopieDepuisScannes, verifierCreationRacine, verifierDestinationCopie, verifierEcriture,
  type ContexteCopieScannes, type NoeudArbre, type OperationDrive,
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
/**
 * 🔴 LA COPIE DEPUIS « Documents clients scannés » — DÉCISION D'ARNO DU 18/10/2026.
 *
 * Une SEULE combinaison passe : copier un FICHIER du manifeste, situé dans « Documents clients scannés », vers un
 * dossier que nous avons créé SOUS le dossier de copie. Le produit cartésien ci-dessous le prouve : toutes les
 * opérations × toutes les sources × toutes les destinations, et un seul triplet rend `ok`.
 */
describe('🔴 copie depuis « Documents clients scannés » : une seule combinaison passe', () => {
  const SCANNES = DOCUMENTS_CLIENTS_SCANNES;
  // L'arborescence de référence, plus le dossier de copie et ses miroirs (créés par nous).
  const NOEUDS_COPIE: NoeudArbre[] = [
    ...NOEUDS,
    n('arr-1', 'rac-1', 'arrivee', '00 Arrivée des mails'),
    n('arr-1-2026', 'arr-1', 'periode', '2026'),
    n('cp-1', 'rac-1', 'copie_scannes', 'Import Documents clients scannés – copie du 18-10-2026'),
    n('cp-1-actifs', 'cp-1', 'copie_scannes', '1 actifs'),
    n('cp-1-actifs-x', 'cp-1-actifs', 'copie_scannes', 'NOM'),
    n('cp-1-rc', 'cp-1-actifs', 'raccourci', '→ ailleurs'),
  ];
  const IDX = indexer(NOEUDS_COPIE);
  const CTX: ContexteCopieScannes = {
    scannesId: SCANNES, racineCopieId: 'cp-1', manifeste: new Set(['f-scan-1']),
    destinationsInterdites: new Set(['arr-1']),
  };
  const PDF = 'application/pdf';
  const DOSSIER = 'application/vnd.google-apps.folder';

  type Source = { nom: string; id: string; mime: string; chaine: string[] };
  const SOURCES: Source[] = [
    { nom: 'fichier de Documents clients scannés, au manifeste', id: 'f-scan-1', mime: PDF, chaine: ['br-actifs', SCANNES, 'drive'] },
    { nom: 'fichier de Documents clients scannés, HORS manifeste', id: 'f-scan-2', mime: PDF, chaine: ['br-actifs', SCANNES, 'drive'] },
    { nom: 'Documents clients scannés lui-même', id: SCANNES, mime: DOSSIER, chaine: ['drive'] },
    { nom: 'une branche (« 1 actifs »)', id: 'br-actifs', mime: DOSSIER, chaine: [SCANNES, 'drive'] },
    { nom: 'fichier du manifeste… prétendu dossier', id: 'f-scan-1', mime: DOSSIER, chaine: ['br-actifs', SCANNES, 'drive'] },
    { nom: 'fichier HORS de Documents clients scannés', id: 'f-ailleurs', mime: PDF, chaine: ['autre-dossier', 'drive'] },
    { nom: 'fichier au manifeste mais chaîne hors Documents clients scannés', id: 'f-scan-1', mime: PDF, chaine: ['autre', 'drive'] },
  ];
  const DESTINATIONS: { nom: string; id: string }[] = [
    { nom: 'miroir à nous sous le dossier de copie', id: 'cp-1-actifs-x' },
    { nom: 'le dossier de copie lui-même', id: 'cp-1' },
    { nom: 'notre racine (hors dossier de copie)', id: 'rac-1' },
    { nom: 'un bien de l’ancienne arborescence', id: 'l-100' },
    { nom: '00 Arrivée des mails', id: 'arr-1' },
    { nom: 'un mois de 00 Arrivée des mails', id: 'arr-1-2026' },
    { nom: 'Documents clients scannés', id: SCANNES },
    { nom: 'une branche de Documents clients scannés', id: 'br-actifs' },
    { nom: 'un raccourci sous le dossier de copie', id: 'cp-1-rc' },
    { nom: 'un dossier inconnu', id: 'inconnu' },
    { nom: 'le Drive partagé', id: DRIVE_GESTION_LOCATIVE },
  ];
  const OPERATIONS: OperationDrive[] = [...TOUTES, 'copier_depuis_scannes'];

  /** Le verdict que reçoit une opération donnée : la nouvelle a le sien, les autres gardent `verifierEcriture`. */
  const verdict = (op: OperationDrive, s: Source, d: { id: string }) => (op === 'copier_depuis_scannes'
    ? verifierCopieDepuisScannes({ sourceId: s.id, sourceMime: s.mime, sourceChaine: s.chaine, destinationId: d.id }, IDX, CTX)
    : verifierEcriture({ operation: op, parentDriveId: d.id, cibleDriveId: s.id }, IDX));

  it('le produit cartésien opérations × sources × destinations : UN SEUL triplet autorisé', () => {
    const passes: string[] = [];
    let total = 0;
    for (const op of OPERATIONS) {
      for (const s of SOURCES) {
        for (const d of DESTINATIONS) {
          total += 1;
          if (verdict(op, s, d).ok) passes.push(`${op} | ${s.nom} | ${d.nom}`);
        }
      }
    }
    expect(total).toBe(OPERATIONS.length * SOURCES.length * DESTINATIONS.length);
    expect(passes).toEqual([
      'copier_depuis_scannes | fichier de Documents clients scannés, au manifeste | miroir à nous sous le dossier de copie',
    ]);
  });

  it('les sept opérations anciennes refusent TOUTE source de Documents clients scannés, partout — rien n’est relâché', () => {
    for (const op of TOUTES) {
      for (const s of SOURCES.filter((x) => x.chaine.includes(SCANNES) || x.id === SCANNES)) {
        for (const d of DESTINATIONS) expect(verdict(op, s, d).ok, `${op} ${s.nom} → ${d.nom}`).toBe(false);
      }
    }
  });

  it('un dossier de copie qui porterait le nom EXACT « Documents clients scannés » est refusé', () => {
    const idx = indexer([...NOEUDS, n('cp-x', 'rac-1', 'copie_scannes', 'Documents clients scannés'),
      n('cp-x-1', 'cp-x', 'copie_scannes', '1 actifs')]);
    const ctx = { ...CTX, racineCopieId: 'cp-x' };
    const v = verifierCopieDepuisScannes(
      { sourceId: 'f-scan-1', sourceMime: PDF, sourceChaine: ['br-actifs', SCANNES], destinationId: 'cp-x-1' }, idx, ctx);
    expect(v.ok).toBe(false);
    // Même verdict pour une variante de casse ou d'accent.
    const idx2 = indexer([...NOEUDS, n('cp-y', 'rac-1', 'copie_scannes', 'documents CLIENTS scannes')]);
    expect(verifierDestinationCopie('cp-y', idx2, { ...CTX, racineCopieId: 'cp-y' }).ok).toBe(false);
  });

  it('les dossiers miroirs, eux, peuvent naître à même le dossier de copie (les branches « 1 actifs »…)', () => {
    expect(verifierDestinationCopie('cp-1', IDX, CTX).ok).toBe(true);
    expect(verifierDestinationCopie('cp-1-actifs-x', IDX, CTX).ok).toBe(true);
    for (const id of ['rac-1', 'l-100', 'arr-1', 'arr-1-2026', SCANNES, 'cp-1-rc', 'inconnu']) {
      expect(verifierDestinationCopie(id, IDX, CTX).ok, id).toBe(false);
    }
  });

  it('un miroir dont un ANCÊTRE s’appelle « Documents clients scannés » est refusé', () => {
    const idx = indexer([...NOEUDS_COPIE, n('cp-1-piege', 'cp-1', 'copie_scannes', 'Documents clients scannés'),
      n('cp-1-piege-1', 'cp-1-piege', 'copie_scannes', 'sous')]);
    expect(verifierDestinationCopie('cp-1-piege-1', idx, CTX).ok).toBe(false);
  });

  it('sans « Documents clients scannés » localisé, ou sans dossier de copie à nous, RIEN ne passe', () => {
    const s = SOURCES[0];
    expect(verifierCopieDepuisScannes(
      { sourceId: s.id, sourceMime: s.mime, sourceChaine: s.chaine, destinationId: 'cp-1-actifs-x' }, IDX,
      { ...CTX, scannesId: '' }).ok).toBe(false);
    expect(verifierCopieDepuisScannes(
      { sourceId: s.id, sourceMime: s.mime, sourceChaine: s.chaine, destinationId: 'cp-1-actifs-x' }, IDX,
      { ...CTX, racineCopieId: 'inconnu' }).ok).toBe(false);
  });
});

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
    const appels = ecriture.match(/verifierEcriture\(|verifierCreationRacine\(|verifierCopieDepuisScannes\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(verbes.length);
  });

  /** Le corps d'une fonction exportée du module d'écriture, jusqu'à la suivante. */
  const corpsDe = (nom: string): string => {
    const code = sansCommentaires(ecriture);
    const debut = code.indexOf(`export async function ${nom}(`) >= 0
      ? code.indexOf(`export async function ${nom}(`) : code.indexOf(`export function ${nom}(`);
    expect(debut, nom).toBeGreaterThanOrEqual(0);
    const suite = code.slice(debut + 10).search(/\nexport /);
    return suite < 0 ? code.slice(debut) : code.slice(debut, debut + 10 + suite);
  };

  it('🔴 aucune écriture n’échappe au garde : chaque fonction qui émet un POST appelle SON verdict', () => {
    const attendus: Record<string, RegExp> = {
      creerDossier: /verifierEcriture\(/,
      creerRaccourci: /verifierEcriture\(/,
      creerRacine: /verifierCreationRacine\(/,
      copierDepuisScannes: /verifierCopieDepuisScannes\(/,
      creerDossierDeCopie: /verifierEcriture\([\s\S]*verifierDestinationCopie\(/,
    };
    const code = sansCommentaires(ecriture);
    const fonctionsQuiEcrivent = [...code.matchAll(/export async function (\w+)\(/g)].map((m) => m[1])
      .filter((f) => /method:\s*'(POST|PATCH|PUT|DELETE)'/.test(corpsDe(f)));
    expect(new Set(fonctionsQuiEcrivent)).toEqual(new Set(Object.keys(attendus)));
    for (const [f, verdict] of Object.entries(attendus)) expect(corpsDe(f), f).toMatch(verdict);
  });

  it('🔴 `files.copy` n’est émis QUE par copierDepuisScannes, et seulement à travers fetchCopieScannes', () => {
    const code = sansCommentaires(ecriture);
    const copies = [...code.matchAll(/\/copy\?/g)].map((m) => m.index ?? -1);
    expect(copies.length).toBeGreaterThan(0);
    const dansCopier = corpsDe('copierDepuisScannes');
    const dansFetch = corpsDe('fetchCopieScannes');
    const debutCopier = code.indexOf(dansCopier);
    const debutFetch = code.indexOf(dansFetch);
    for (const i of copies) {
      const dedans = (i >= debutCopier && i < debutCopier + dansCopier.length)
        || (i >= debutFetch && i < debutFetch + dansFetch.length);
      expect(dedans, `\/copy? à la position ${i}`).toBe(true);
    }
    expect(dansCopier).toMatch(/fetchCopieScannes\(deps\.fetch/);
    // Aucune autre méthode HTTP d'écriture que POST dans tout le module.
    expect(code).not.toMatch(/method:\s*'(PATCH|PUT|DELETE)'/);
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
