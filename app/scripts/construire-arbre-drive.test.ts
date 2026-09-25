import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { construirePlanArbre, RUBRIQUES_BIEN, type LotSource, type OccupationSource, type ProprietaireSource } from '../lib/gestion/driveArbre';
import { COMPTE_DEFAUT, lireOptions, restreindreAEssai } from './construire-arbre-drive';
import { comparer, type Empreinte } from './empreinte-drive';
import { csv, dureeLisible, tailleLisible } from './rapport-tri-pieces';

/**
 * LOT DRIVE-1 — LES COMMANDES, PAR LEURS PARTIES PURES, ET LES MIGRATIONS PAR LEUR FORME.
 *
 * 🔒 Aucune donnée réelle. Les seuls identifiants réels cités le sont comme CIBLE D'UN REFUS — jamais comme cible
 * d'une écriture.
 */

const PROPS: ProprietaireSource[] = [
  { wippimmoId: '1', nomComplet: 'ALPHA Anne' },
  { wippimmoId: '2', nomComplet: 'BETA Bernard' },
];
const LOTS: LotSource[] = [
  { wippimmoId: '100', proprietaireWippimmoId: '1', adresse: '4 rue Fictive', codePostal: '92800', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 2' },
  { wippimmoId: '101', proprietaireWippimmoId: '1', adresse: '7 rue Fictive', codePostal: '92800', commune: 'PUTEAUX', nature: 'Parking', typeBien: null },
  { wippimmoId: '200', proprietaireWippimmoId: '2', adresse: '9 allée Imaginaire', codePostal: '92400', commune: 'COURBEVOIE', nature: 'Studio', typeBien: 'Type 1' },
];
const OCCS: OccupationSource[] = [
  { wippimmoId: '500', lotWippimmoId: '100', locataireNom: 'BERNARD Alice', entree: '2022-09-01', sortie: null },
  { wippimmoId: '600', lotWippimmoId: '200', locataireNom: 'ROUX Sophie', entree: '2021-06-15', sortie: null },
];
const PLAN = construirePlanArbre({ proprietaires: PROPS, lots: LOTS, occupations: OCCS });

describe('la ligne de commande', () => {
  it('sans option : le compte de gestion, à blanc, arborescence complète', () => {
    expect(lireOptions([])).toEqual({ compte: COMPTE_DEFAUT, appliquer: false, essai: false });
  });

  it('« --appliquer » est la SEULE façon d’écrire, et rien d’approchant ne l’active', () => {
    expect(lireOptions(['--appliquer']).appliquer).toBe(true);
    for (const presque of ['--appliquez', '-appliquer', 'appliquer', '--appliquer=1']) {
      expect(lireOptions([presque]).appliquer, presque).toBe(false);
    }
  });

  it('« --compte= » choisit au nom de qui écrire', () => {
    expect(lireOptions(['--compte=a.jorel@sansvisavis.com']).compte).toBe('a.jorel@sansvisavis.com');
  });
});

describe('🔴 le mode ESSAI ne crée QUE ce qu’Arno a demandé de voir', () => {
  const essai = restreindreAEssai(PLAN);
  const sortes = (s: string) => essai.noeuds.filter((n) => n.sorte === s);

  it('la racine, les trois dossiers de tête, UN propriétaire, UN bien', () => {
    expect(sortes('racine')).toHaveLength(1);
    expect(sortes('non_rattaches')).toHaveLength(1);
    expect(sortes('proprietaires')).toHaveLength(1);
    expect(sortes('biens')).toHaveLength(1);
    expect(sortes('proprietaire')).toHaveLength(1);
    expect(sortes('bien')).toHaveLength(1);
  });

  it('le propriétaire retenu est le PREMIER par ordre alphabétique', () => {
    expect(sortes('proprietaire')[0].nom).toBe('ALPHA Anne (1)');
  });

  it('le bien retenu porte ses quatre rubriques et son « En attente » — l’essai doit prouver quelque chose', () => {
    expect(sortes('rubrique').map((n) => n.nom)).toEqual([...RUBRIQUES_BIEN]);
    expect(sortes('en_attente')).toHaveLength(2);   // celui du propriétaire ET celui du bien
  });

  it('un seul raccourci, et il vise le bien de l’essai — jamais un bien non créé', () => {
    const r = sortes('raccourci');
    expect(r).toHaveLength(1);
    const biens = new Set(sortes('bien').map((n) => n.cle));
    expect(biens.has(r[0].cible?.cle ?? '')).toBe(true);
  });

  it('🔴 l’ordre reste sûr : aucun nœud ne précède son parent ni sa cible', () => {
    const vus = new Set<string>();
    for (const n of essai.noeuds) {
      if (n.parent !== null) expect(vus.has(`${n.parent.sorte}|${n.parent.cle}`), n.chemin).toBe(true);
      if (n.cible !== undefined) expect(vus.has(`${n.cible.sorte}|${n.cible.cle}`), n.chemin).toBe(true);
      vus.add(`${n.sorte}|${n.cle}`);
    }
  });

  it('il est BEAUCOUP plus petit que le plan complet — c’est tout son intérêt', () => {
    expect(essai.comptes.total).toBeLessThan(PLAN.comptes.total / 2);
  });

  it('un annuaire vide ne fait pas échouer l’essai : la racine et les têtes suffisent', () => {
    const vide = restreindreAEssai(construirePlanArbre({ proprietaires: [], lots: [], occupations: [] }));
    expect(vide.noeuds).toHaveLength(4);
  });
});

/**
 * 🔴 LA PREUVE « RIEN N'A BOUGÉ ». C'est elle qu'Arno lira pour se rassurer : elle doit détecter TOUT changement
 * d'un élément préexistant, et ne tolérer QUE l'apparition de la racine.
 */
describe('🔴 la comparaison avant / après', () => {
  const el = (id: string, nom: string, modifie: string) => ({ id, nom, modifie });
  const base: Empreinte = {
    releveLe: '2026-09-26T00:00:00Z', compte: 'gestion@criterimmo.fr', driveId: 'D',
    gestionLocative: [el('a', 'Artisans', 'T1'), el('b', 'Documents clients scannés', 'T2')],
    documentsClientsScannes: [el('c', '1 actifs', 'T3'), el('d', '2 vendus', 'T4')],
  };

  it('deux relevés identiques : AUCUN écart', () => {
    expect(comparer(base, base)).toEqual([]);
  });

  it('la seule chose tolérée est l’APPARITION de « Base de données locative »', () => {
    const apres: Empreinte = {
      ...base,
      gestionLocative: [...base.gestionLocative, el('neuf', 'Base de données locative', 'T9')],
    };
    expect(comparer(base, apres)).toEqual([]);
  });

  it('🔴 tout AUTRE dossier qui apparaît est un écart', () => {
    const apres: Empreinte = { ...base, gestionLocative: [...base.gestionLocative, el('z', 'Autre chose', 'T9')] };
    expect(comparer(base, apres)).toHaveLength(1);
    expect(comparer(base, apres)[0]).toContain('APPARU');
  });

  it('🔴 un dossier MODIFIÉ est un écart — c’est le cas qui compte le plus', () => {
    const apres: Empreinte = { ...base, gestionLocative: [el('a', 'Artisans', 'T1-MODIFIÉ'), base.gestionLocative[1]] };
    expect(comparer(base, apres)[0]).toContain('MODIFIÉ');
  });

  it('🔴 un dossier RENOMMÉ est un écart', () => {
    const apres: Empreinte = { ...base, gestionLocative: [el('a', 'Artisans (renommé)', 'T1'), base.gestionLocative[1]] };
    expect(comparer(base, apres)[0]).toContain('RENOMMÉ');
  });

  it('🔴 un dossier DISPARU est un écart', () => {
    const apres: Empreinte = { ...base, gestionLocative: [base.gestionLocative[1]] };
    expect(comparer(base, apres)[0]).toContain('DISPARU');
  });

  it('🔴 dans « Documents clients scannés », MÊME une apparition nommée comme la racine est un écart', () => {
    const apres: Empreinte = {
      ...base,
      documentsClientsScannes: [...base.documentsClientsScannes, el('z', 'Base de données locative', 'T9')],
    };
    expect(comparer(base, apres)).toHaveLength(1);
    expect(comparer(base, apres)[0]).toContain('Documents clients scannés');
  });

  it('un changement dans « Documents clients scannés » est nommé comme tel', () => {
    const apres: Empreinte = {
      ...base, documentsClientsScannes: [el('c', '1 actifs', 'T3-BOUGÉ'), base.documentsClientsScannes[1]],
    };
    expect(comparer(base, apres)[0]).toContain('Documents clients scannés');
    expect(comparer(base, apres)[0]).toContain('MODIFIÉ');
  });
});

describe('les mots du rapport de tri', () => {
  it('les tailles se disent en Go, Mo, Ko', () => {
    expect(tailleLisible(2 * 1024 ** 3)).toBe('2.0 Go');
    expect(tailleLisible(5 * 1024 ** 2)).toBe('5 Mo');
    expect(tailleLisible(2048)).toBe('2 Ko');
  });

  it('les durées se disent en heures et minutes, jamais « 0 min »', () => {
    expect(dureeLisible(3600 + 1800)).toBe('1 h 30');
    expect(dureeLisible(120)).toBe('2 min');
    expect(dureeLisible(3)).toBe('1 min');
  });

  it('le CSV échappe ce qui casserait une colonne — un objet de mail contient de tout', () => {
    expect(csv('simple')).toBe('simple');
    expect(csv('avec;point-virgule')).toBe('"avec;point-virgule"');
    expect(csv('avec "guillemets"')).toBe('"avec ""guillemets"""');
    expect(csv(null)).toBe('');
  });
});

/** LA MIGRATION 254, éprouvée par sa FORME — jamais par un fait qui change. */
describe('la migration 254', () => {
  const sql = readFileSync('db/migrations/254_gestion_drive_arbre.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée la table de mémoire ET le journal des refus', () => {
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_drive_arbre');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_drive_refus');
  });

  it('🔴 exige la migration 253 : l’arborescence découle de l’annuaire', () => {
    expect(code).toContain("to_regclass('public.gestion_annuaire_proprietaire')");
    expect(code).toContain('RAISE EXCEPTION');
  });

  it('🔴 la LISTE BLANCHE est tenue par la base : un parent doit exister dans la table', () => {
    expect(code).toContain('REFERENCES gestion_drive_arbre(drive_id)');
    expect(code).toContain('ON DELETE RESTRICT');
  });

  it('🔴 une SEULE racine, et elle seule est sans parent', () => {
    expect(code).toContain('gestion_drive_arbre_racine_unique');
    expect(code).toContain("CHECK ((sorte = 'racine') = (parent_drive_id IS NULL))");
  });

  it('🔴 on ne peut enregistrer QUE ce que le programme a créé', () => {
    expect(code).toContain("CHECK (cree_par = 'construction')");
  });

  it('l’idempotence est tenue en base : (sorte, cle) est unique', () => {
    expect(code).toContain('gestion_drive_arbre_cle_unique');
    expect(code).toContain('ON gestion_drive_arbre (sorte, cle)');
  });

  it('le journal des refus est append-only, garanti par un trigger', () => {
    expect(code).toContain('gestion_drive_refus_append_only');
    expect(code).toContain('BEFORE UPDATE OR DELETE ON gestion_drive_refus');
    expect(code).toContain('BEFORE TRUNCATE ON gestion_drive_refus');
  });

  it('élargit le journal du module à « drive_arbre », sans en retirer aucune entité', () => {
    for (const e of ['message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
      'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre']) {
      expect(code, e).toContain(`'${e}'`);
    }
  });

  it('donne la commande exacte, et dit ce que le retour en arrière NE fait PAS', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/254_gestion_drive_arbre.sql');
    expect(sql).toContain('ne SUPPRIME rien dans Drive');
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_drive_arbre/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});

/** LES COMMANDES elles-mêmes : ce qu'elles ne doivent JAMAIS contenir. */
describe('🔴 les commandes ne connaissent aucun dossier préexistant', () => {
  const construire = readFileSync('app/scripts/construire-arbre-drive.ts', 'utf8');
  const empreinte = readFileSync('app/scripts/empreinte-drive.ts', 'utf8');
  const rapport = readFileSync('app/scripts/rapport-tri-pieces.ts', 'utf8');

  it('aucun identifiant Drive n’est écrit en dur — le Drive est LU chez Google au moment de s’en servir', () => {
    for (const [nom, src] of [['construire', construire], ['empreinte', empreinte]] as const) {
      expect(src, nom).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');   // Documents clients scannés
      expect(src, nom).not.toMatch(/'0A[A-Za-z0-9_-]{15,}'/);                 // un identifiant de Drive partagé
    }
    expect(construire).toContain('trouverDrive');
  });

  it('la commande de construction ne sait ni supprimer, ni renommer, ni déplacer, ni partager', () => {
    expect(construire).not.toMatch(/method:\s*'(DELETE|PATCH|PUT)'/);
    expect(construire).not.toMatch(/\bpermissions\b/);
  });

  it('le rapport de tri n’écrit RIEN : ni Drive, ni base, ni MinIO', () => {
    expect(rapport).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    expect(rapport).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM)?\s*gestion_/i);
    // Il n'écrit que sur le Bureau, hors du dépôt.
    expect(rapport).toContain("join(homedir(), 'Desktop', 'rapport-tri-pieces')");
  });

  it('la commande d’empreinte est en LECTURE seule', () => {
    expect(empreinte).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
  });
});
