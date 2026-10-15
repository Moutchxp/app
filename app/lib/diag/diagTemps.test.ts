import { describe, it, expect } from 'vitest';
import {
  CAS_INDETERMINE_SERVEUR, cumulParEtape, etapeDepuisPile, libelleArret, lireArguments, longueurCouloir, plusLentes, rendreRapport,
  tuilesLues, type MesureRequete,
} from './diagTemps';

const pile = (...fonctions: string[]): string =>
  ['Error', ...fonctions.map((f, i) => `    at ${f} (/depot/app/lib/db/f${i}.ts:1:1)`)].join('\n');

const mesure = (n: number, dureeMs: number, etape = 'obstaclesSurAxe'): MesureRequete => ({
  n, etape, appelant: 'app/lib/db/obstacles.ts:echantillonnerGrille', sql: `SELECT ${n}`, params: [], dureeMs,
  nbLignes: 1, couloirM: 200, tuiles: null, erreur: null,
});

describe('lireArguments', () => {
  it('sans argument → le cas mesuré à 60 s sur le serveur, top 10, EXPLAIN, pas de JSON', () => {
    const a = lireArguments([]);
    expect(a.point).toEqual(CAS_INDETERMINE_SERVEUR.point);
    expect(a).toMatchObject({ azimutPrincipalDeg: 0, etage: 0, dernierEtage: false, top: 10, explain: true, json: null });
  });

  it('lit un autre point en pleine précision et les options', () => {
    const a = lireArguments(['--lat=48.90693182287072', '--lon=2.269431435588249', '--azimut=90', '--etage=2',
      '--dernier-etage', '--top=3', '--sans-explain', '--json=sortie.json']);
    expect(a.point).toEqual({ lat: 48.90693182287072, lon: 2.269431435588249 });
    expect(a).toMatchObject({ azimutPrincipalDeg: 90, etage: 2, dernierEtage: true, top: 3, explain: false, json: 'sortie.json' });
  });

  it('une valeur illisible est refusée (on ne mesure jamais un autre cas que celui demandé)', () => {
    expect(() => lireArguments(['--lat=abc'])).toThrow('--lat=abc');
    expect(() => lireArguments(['--etage='])).toThrow('--etage=');
    expect(() => lireArguments(['--top=0'])).toThrow('--top=0');
  });
});

describe('longueurCouloir', () => {
  it('lit le paramètre multiplié dans ST_Translate(o.g, $N * …), quelle que soit la mise en forme', () => {
    expect(longueurCouloir('ST_MakeLine(o.g, ST_Translate(o.g, $5*d.dx, $5*d.dy))', [0, 0, 0, 0, 200, 1])).toBe(200);
    expect(longueurCouloir('ST_Translate(o.g, $3 * sin(radians(az)), $3 * cos(radians(az)))', [0, 0, 150])).toBe(150);
    expect(longueurCouloir('ST_Translate( o.g , $4*sin(radians($3)), …)', [0, 0, 0, '200'])).toBe(200);
  });

  it('à défaut, un nombre de cellules de 0,5 m (profil d’axe : 400 cellules → 200 m)', () => {
    expect(longueurCouloir('ST_X(o.g) + ((i+0.5)*0.5)*d.dx FROM generate_series(0, $4-1) AS i', [0, 0, 0, 400])).toBe(200);
  });

  it('null quand la requête ne construit pas d’axe, ou que le paramètre est illisible', () => {
    expect(longueurCouloir('SELECT * FROM config_scoring WHERE id = 1', [])).toBeNull();
    expect(longueurCouloir('ST_Translate(o.g, $2*d.dx, 0)', [0, 'x'])).toBeNull();
  });
});

describe('etapeDepuisPile', () => {
  it('la fonction appelée directement par construireEntree', () => {
    expect(etapeDepuisPile(pile('pool.query', 'query', 'echantillonnerGrille', 'async Promise.all (index 0)',
      'async obstaclesParBalayage', 'async obstaclesSurAxe', 'async construireEntree', 'async main'))).toBe('obstaclesSurAxe');
    expect(etapeDepuisPile(pile('query', 'validerOrigine', 'construireEntree', 'main'))).toBe('validerOrigine');
  });

  it('pile coupée par un Promise.all (faisceaux) → l’étape précédente ; rien du tout → « (hors étape) »', () => {
    const coupee = pile('query', 'async obstaclesSurAxe', 'async Promise.all (index 12)', 'process.processTicksAndRejections');
    expect(etapeDepuisPile(coupee, 'faisceauxAmplitude')).toBe('faisceauxAmplitude');
    expect(etapeDepuisPile(coupee)).toBe('(hors étape)');
  });

  it('chargerProfilDegagement, où qu’il soit dans la pile', () => {
    expect(etapeDepuisPile(pile('query', 'Object.chargerProfilDegagement', 'main'), 'resoudreMonuments')).toBe('chargerProfilDegagement');
  });
});

describe('tuilesLues', () => {
  it('somme lignes × boucles des nœuds qui parcourent mns_lidar_brut / mnt_lidar_brut, à toute profondeur', () => {
    const plan = [{ Plan: {
      'Node Type': 'Nested Loop', 'Actual Rows': 1, 'Actual Loops': 1,
      Plans: [
        { 'Node Type': 'Index Scan', 'Relation Name': 'mns_lidar_brut', 'Actual Rows': 3, 'Actual Loops': 61 },
        { 'Node Type': 'Seq Scan', 'Relation Name': 'mnt_lidar_brut', 'Actual Rows': 1, 'Actual Loops': 1 },
        { 'Node Type': 'Index Scan', 'Relation Name': 'bdtopo_batiment', 'Actual Rows': 900, 'Actual Loops': 1 },
        { 'Node Type': 'Limit', Plans: [{ 'Relation Name': 'mns_lidar_brut', 'Actual Rows': 2, 'Actual Loops': 1 }] },
      ],
    } }];
    expect(tuilesLues(plan)).toEqual({ mns: 185, mnt: 1 });
    expect(tuilesLues(null)).toEqual({ mns: 0, mnt: 0 });
  });
});

describe('classement et rapport', () => {
  const journal = [mesure(1, 120, 'validerOrigine'), mesure(2, 60036), mesure(3, 8), mesure(4, 8, 'faisceauxAmplitude')];

  it('plusLentes : de la plus lente à la plus rapide, ordre d’émission à durée égale, bornée à n', () => {
    expect(plusLentes(journal, 10).map((q) => q.n)).toEqual([2, 1, 3, 4]);
    expect(plusLentes(journal, 2).map((q) => q.n)).toEqual([2, 1]);
  });

  it('cumulParEtape : nombre et cumul par étape, dans l’ordre de première apparition', () => {
    expect(cumulParEtape(journal)).toEqual([
      { etape: 'validerOrigine', nbRequetes: 1, sqlMs: 120 },
      { etape: 'obstaclesSurAxe', nbRequetes: 2, sqlMs: 60044 },
      { etape: 'faisceauxAmplitude', nbRequetes: 1, sqlMs: 8 },
    ]);
  });

  it('rendreRapport : total, étapes, et les N plus lentes avec lignes, couloir et tuiles', () => {
    const avecTuiles = journal.map((q) => (q.n === 2 ? { ...q, tuiles: { mns: 4000, mnt: 0 } } : q));
    const texte = rendreRapport({
      cas: { ...lireArguments([]), top: 2 }, machine: 'serveur', totalMs: 60500, construireEntreeMs: 60490, analyserMs: 2,
      verdict: 'INDETERMINE', distanceM: 0, validationValide: true, journal: avecTuiles,
    });
    expect(texte).toContain('TOTAL : 60500.0 ms');
    expect(texte).toContain('4 requêtes, 60172.0 ms cumulées');
    expect(texte).toContain('Les 2 requêtes les plus lentes');
    expect(texte).toContain('60036.0 ms  n°2');
    expect(texte).toContain('couloir 200 m · tuiles lues : MNS 4000, MNT 0');
    expect(texte).not.toContain('n°3 ');
    expect(texte).toContain('verdict : INDETERMINE (distance 0 m)');
    expect(texte).toContain('la requête n°1 porte l’amorçage');
    expect(texte).not.toContain('ARRÊT SANS ANALYSE');
  });

  it('rendreRapport : arrêt sans analyse → le motif en clair, sous la ligne du verdict', () => {
    const texte = rendreRapport({
      cas: lireArguments([]), machine: 'serveur', totalMs: 1600, construireEntreeMs: 1600, analyserMs: null,
      verdict: null, distanceM: null, validationValide: true, arret: libelleArret('pas_de_lidar', null), journal: [mesure(1, 1584, 'validerOrigine')],
    });
    expect(texte).toContain('Origine valide : oui · verdict : —\nARRÊT SANS ANALYSE : aucune dalle LiDAR (MNT) sous l’origine');
  });
});

describe('libelleArret', () => {
  it('chaque motif en clair ; null quand l’analyse a eu lieu', () => {
    expect(libelleArret(null, null)).toBeNull();
    expect(libelleArret('origine_invalide', 'Point à 3.20 m du bâtiment')).toBe('origine invalide — Point à 3.20 m du bâtiment');
    expect(libelleArret('pas_de_lidar', null)).toContain('aucune dalle LiDAR (MNT)');
    expect(libelleArret('altitude_indisponible', null)).toContain('sans valeur à ce point (nodata)');
  });
});
