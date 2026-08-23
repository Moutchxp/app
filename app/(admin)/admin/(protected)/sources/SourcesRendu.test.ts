import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableauSources, GrilleCouverture, LigneContexte, LigneDepliable, ResumeMisesAJour, SectionReingestion, SectionPerimeesSansProcedure, SectionMorphologie, SectionProtocoles, SectionAutomatisation } from './SourcesRendu';
import { ContenuTuileSources } from '../TuileSourcesActions';
import { construireEtatAutomatisation } from '../../../../lib/veille/ingestionAuto';
import { construireEtatSources, type LectureSource, type LectureDetection } from '../../../../lib/admin/sourcesFraicheur';
import { construireMorphologie, MORPHOLOGIE_INDISPONIBLE, type LigneTable } from '../../../../lib/admin/morphologieDisque';
import { compterMisesAJourActionnables, misesAJourActionnables } from '../../../../lib/admin/pastilleSources';
import { construireAffichageProtocoles } from '../../../../lib/admin/protocolesReingestion';
import type { AffichageProtocoles } from '../../../../lib/admin/protocolesReingestion';

/**
 * FRAÎCHEUR DES DONNÉES — rendu PUR. Vérifie que l'écran AFFICHE fidèlement les règles d'honnêteté du modèle :
 * une ligne par source dans l'ordre, LiDAR « millésime inconnu » + « aucune procédure de réingestion », source vide
 * explicite, substitut jamais déguisé en millésime, couverture par département, ligne de contexte sur le verdict.
 */

const MAINTENANT = new Date('2026-08-23T09:00:00Z');

function lignes(over: Partial<Record<string, Partial<LectureSource>>> = {}, detections: LectureDetection[] = []) {
  const base: LectureSource[] = [
    { cle: 'lidar', millesime: null, substitut: 'millésime inconnu — 64 dalles MNT + 64 MNS', dateReference: null, vide: false, partielsParDept: ['92'] },
    { cle: 'bdtopo_bati', millesime: '2026-06-15', substitut: null, dateReference: '2026-06-15', vide: false, comptesParDept: { '75': 1, '77': 1, '92': 1 } },
    { cle: 'bdtopo_adresse', millesime: null, substitut: 'aucun millésime — dernière modification : 2026-03-20', dateReference: '2026-03-20', vide: false, comptesParDept: { '92': 169484 } },
    { cle: 'cadastre', millesime: '2026-06-01', substitut: null, dateReference: '2026-06-01', vide: false, comptesParDept: { '75': 78154, '93': 232874 } },
    { cle: 'sitadel', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false, comptesParDept: { '92': 5782 } },
    { cle: 'dila', millesime: '2026-08-03', substitut: null, dateReference: '2026-08-03', vide: false },
    { cle: 'prada', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false },
    { cle: 'bdnb', millesime: null, substitut: 'aucun millésime en base — 191262 lignes (année de construction)', dateReference: null, vide: false },
  ];
  const lectures = base.map((l) => (over[l.cle] ? { ...l, ...over[l.cle] } : l));
  return construireEtatSources(lectures, MAINTENANT, detections);
}

const D = (o: Partial<LectureDetection>): LectureDetection =>
  ({ source: 'x', actif: true, verifieLe: '2026-08-22T09:00:00Z', succes: true, dernierSuccesLe: '2026-08-22T09:00:00Z', editionDistante: null, dateDistante: null, motif: null, ...o });

describe('TableauSources — une ligne par source, dans l’ordre', () => {
  it('affiche les 8 sources, LiDAR en tête', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    for (const nom of ['LiDAR HD', 'BD TOPO® bâtiment', 'BD TOPO® adresse', 'Cadastre', 'Sitadel', 'DILA', 'PRADA', 'BDNB']) {
      expect(h).toContain(nom);
    }
    expect(h.indexOf('LiDAR HD')).toBeLessThan(h.indexOf('BD TOPO® bâtiment'));
    expect(h.indexOf('Sitadel')).toBeLessThan(h.indexOf('BDNB'));
  });

  it('LiDAR → « millésime inconnu » + « aucune procédure de réingestion » (honnêteté principale)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('millésime inconnu');
    expect(h).toContain('aucune procédure de réingestion');
  });

  it('un substitut est signalé comme tel, jamais présenté en millésime', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('substitut, pas un millésime');
  });

  it('réingestion visible par source ; plus d’ancienne colonne oui/non', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('npm run veille:run');
    expect(h).toContain('npm run bdtopo:import');
    expect(h).not.toContain('>oui<'); // l'ancienne colonne « Surveillance » oui/non a disparu
    expect(h).not.toContain('>non<');
  });

  it('source vide → « aucune donnée en base », âge « — »', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({ lidar: { vide: true, partielsParDept: [] } }) }));
    expect(h).toContain('aucune donnée en base');
  });

  it('l’âge affiché est calculé (bâti 2026-06-15 → 69 j au 2026-08-23)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('69 j');
    expect(h).toContain('inconnu'); // LiDAR / BDNB : aucune date
  });
});

describe('GrilleCouverture — présent / partiel / absent par département', () => {
  it('LiDAR partiel sur le 92, absent ailleurs ; libellés accessibles (pas la couleur seule)', () => {
    const h = renderToStaticMarkup(createElement(GrilleCouverture, { lignes: lignes() }));
    expect(h).toContain('92 : partiel');
    expect(h).toContain('75 : absent');
    expect(h).toContain('75 : présent'); // cadastre couvre le 75
  });

  it('ne montre QUE les sources spatiales (pas DILA/PRADA/BDNB)', () => {
    const h = renderToStaticMarkup(createElement(GrilleCouverture, { lignes: lignes() }));
    expect(h).toContain('LiDAR HD');
    expect(h).toContain('Cadastre');
    expect(h).not.toContain('PRADA');
  });
});

describe('LigneContexte — le verdict ne vit que là où le LiDAR existe', () => {
  it('énonce que seul le LiDAR entre dans le verdict', () => {
    const h = renderToStaticMarkup(createElement(LigneContexte, { lignes: lignes() }));
    expect(h).toContain('Seul le LiDAR entre dans le verdict');
    expect(h).toContain('92');
  });
});

describe('TableauSources — colonne UNIQUE « Surveillance » (G1, fusion : les 5 états)', () => {
  it('① surveillée, jamais encore vérifiée (case cochée, aucune passe)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() })); // aucune détection fournie
    expect(h).toContain('Surveillée — jamais encore vérifiée');
    expect(h).toContain('Surveiller BD TOPO® bâtiment'); // la case existe (source sondée)
  });
  it('② surveillée, vérifiée le <date>, à jour', () => {
    const det = [D({ source: 'dila', editionDistante: '2026-08-03', dateDistante: '2026-08-03', dernierSuccesLe: '2026-08-22T09:00:00Z' })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('Surveillée — vérifiée le 2026-08-22, à jour');
    expect(h).toContain('Surveiller DILA');
  });
  it('③ surveillée, vérifiée le <date>, mise à jour disponible (édition)', () => {
    const det = [D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15', dernierSuccesLe: '2026-08-22T09:00:00Z' })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('vérifiée le 2026-08-22, mise à jour disponible (2026-06-15)');
  });
  it('④ non surveillée (case décochée)', () => {
    const det = [D({ source: 'dila', actif: false })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('Non surveillée');
  });
  it('⑤ non surveillable, avec le motif en PHRASE (LiDAR) ; aucune case', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('Non surveillable');
    expect(h).toContain('passage unique'); // le motif est une phrase, pas un mot-clé
    expect(h).not.toContain('Surveiller LiDAR HD');
  });

  it('échec → « vérification en échec depuis N j », JAMAIS « à jour »', () => {
    const det = [D({ source: 'cadastre', succes: false, verifieLe: '2026-08-23T09:00:00Z', dernierSuccesLe: '2026-08-16T09:00:00Z', motif: 'HTTP 500' })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('vérification en échec depuis 7 j');
    expect(h).not.toContain('à jour');
  });

  it('Sitadel : mécanisme propre, SANS case (le contrôle qui échouerait ne s’affiche pas)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('Surveillée par son propre mécanisme de veille');
    expect(h).not.toContain('Surveiller Sitadel'); // basculerDetectionSource rejette Sitadel → pas de case
  });
});

describe('SectionReingestion (lot 3) — préparer la commande, jamais l’exécuter', () => {
  const REPO = '/Users/x/sansvisavis/app';
  const section = (cle: string, detections: LectureDetection[] = []) => {
    const l = lignes({}, detections).filter((x) => x.cle === cle);
    return renderToStaticMarkup(createElement(SectionReingestion, { lignes: l, cheminDepot: REPO }));
  };

  it('mise à jour disponible + procédure (DILA) → bloc avec cd absolu, env et commande', () => {
    const h = section('dila', [D({ source: 'dila', editionDistante: '2026-08-21', dateDistante: '2026-08-21' })]);
    expect(h).toContain('Préparer la commande');
    expect(h).toContain(`cd ${REPO}`);
    expect(h).toContain('set -a &amp;&amp; source .env &amp;&amp; set +a'); // « && » échappé dans le HTML
    expect(h).toContain('npm run dila:ingest');
    expect(h).toContain('360'); // avertissement de poids
  });

  it('mise à jour disponible MAIS pas de procédure (adresse orpheline) → pas de bouton, motif du manque', () => {
    const h = section('bdtopo_adresse', [D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15' })]);
    expect(h).toContain('manque à combler');
    expect(h).not.toContain('Préparer la commande');
    expect(h).not.toContain('npm run');
  });

  it('non détectable (LiDAR) → pas de bouton, « aucune procédure de réingestion »', () => {
    const h = section('lidar');
    expect(h).toContain('aucune procédure de réingestion');
    expect(h).not.toContain('Préparer la commande');
  });

  it('déjà à jour (cadastre) → pas de bouton, « déjà à jour »', () => {
    const h = section('cadastre', [D({ source: 'cadastre', editionDistante: '2026-06-01', dateDistante: '2026-06-01' })]);
    expect(h).toContain('déjà à jour');
    expect(h).not.toContain('Préparer la commande');
  });

  it('Sitadel (réingestion automatique) → pas de bouton, dit que c’est automatique', () => {
    const h = section('sitadel', [D({ source: 'sitadel', editionDistante: '2026-07', dateDistante: '2026-07-01' })]);
    expect(h).toContain('automatique');
    expect(h).not.toContain('Préparer la commande');
  });
});

describe('SectionMorphologie (F4) — répartition disque', () => {
  const T = (table: string, total: number, donnees: number, index: number, lignes: number): LigneTable => ({ table, total, donnees, index, lignes });
  const morpho = () => construireMorphologie([
    T('batiment', 1000, 800, 200, 3_000_000),
    T('bdtopo_edition', 10, 5, 5, 7),
    T('import_log', 10, 5, 5, 8),
    T('batiment_2026_03_15', 400, 350, 50, 697_886),
    T('adresse_ban', 200, 160, 40, 557_710),
    T('spatial_ref_sys', 7, 6, 1, 8_500),
    T('deno_affichage', 3, 0, 3, -1),
  ], 1700);

  it('affiche les postes, le total base et les sous-lignes vive/copies du bâti', () => {
    const h = renderToStaticMarkup(createElement(SectionMorphologie, { morphologie: morpho() }));
    expect(h).toContain('Total base');
    expect(h).toContain('BD TOPO bâtiment');
    expect(h).toContain('Édition courante');
    expect(h).toContain('Copies et staging');
    expect(h).toContain('Non rattaché'); // deno_affichage y tombe, affiché
  });

  it('sentinelle : mesure indisponible → « indisponible », JAMAIS « 0 o »', () => {
    const h = renderToStaticMarkup(createElement(SectionMorphologie, { morphologie: MORPHOLOGIE_INDISPONIBLE }));
    expect(h).toContain('indisponible');
    expect(h).not.toContain('0 o');
  });
});

describe('SectionProtocoles (F5) — mode d’emploi, lecture seule', () => {
  const TXT = [
    'Note d’ouverture : sûr → risqué.',
    '<!-- SOURCE: cadastre -->',
    '## Cadastre — parcelles',
    'CAS : (a) complet et outillé.',
    '```bash',
    'cd /Users/x/app',
    'npm run cadastre:ingest -- --dep 75,78,92,93',
    '```',
    '<!-- SOURCE: lidar -->',
    '## LiDAR HD',
    'CAS : (c) aucune procédure connue.',
  ].join('\n');
  const ORDRE = [{ cle: 'cadastre', nom: 'Cadastre' }, { cle: 'lidar', nom: 'LiDAR HD' }, { cle: 'dila', nom: 'DILA' }];

  it('section (a) → titre, commande et bouton de copie', () => {
    const h = renderToStaticMarkup(createElement(SectionProtocoles, { protocoles: construireAffichageProtocoles(TXT, ORDRE) }));
    expect(h).toContain('Cadastre — parcelles');
    expect(h).toContain('npm run cadastre:ingest');
    expect(h).toContain('Copier la commande'); // BoutonCopier réutilisé
    expect(h).toContain('Note d’ouverture'); // intro affichée
  });

  it('section (c) SEULE → « aucune procédure connue », AUCUN bouton de copie', () => {
    const h = renderToStaticMarkup(createElement(SectionProtocoles, {
      protocoles: construireAffichageProtocoles(TXT, [{ cle: 'lidar', nom: 'LiDAR HD' }]),
    }));
    expect(h).toContain('aucune procédure connue');
    expect(h).not.toContain('Copier la commande');
  });

  it('section manquante (dila absente du texte) → sentinelle par source', () => {
    const h = renderToStaticMarkup(createElement(SectionProtocoles, { protocoles: construireAffichageProtocoles(TXT, ORDRE) }));
    expect(h).toContain('Protocole non documenté pour cette source');
  });

  it('fichier absent → sentinelle globale distincte', () => {
    const h = renderToStaticMarkup(createElement(SectionProtocoles, { protocoles: construireAffichageProtocoles(null) }));
    expect(h).toContain('Protocoles non documentés');
  });
});

describe('SectionPerimeesSansProcedure (F7) — regroupement dédié', () => {
  const PROTOS = [
    '<!-- SOURCE: dila -->', '## DILA', 'CAS (a).', '```bash', 'npm run dila:ingest', '```',
    '<!-- SOURCE: bdtopo_adresse -->', '## BD TOPO adresse', 'CAS (c) aucune procédure connue.',
  ].join('\n');
  const ORDRE = [{ cle: 'dila', nom: 'DILA' }, { cle: 'bdtopo_adresse', nom: 'BD TOPO adresse / BAN' }];
  const proto = (): AffichageProtocoles => construireAffichageProtocoles(PROTOS, ORDRE);

  // adresse (c) périmée + dila (a) périmée : seule l'adresse doit apparaître dans le regroupement.
  const detAdresse = D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15' });
  const detDila = D({ source: 'dila', editionDistante: '2026-08-21', dateDistante: '2026-08-21' });

  it('source (c) périmée → listée, avec la phrase qui explique POURQUOI le bloc existe', () => {
    const l = lignes({}, [detAdresse, detDila]);
    const h = renderToStaticMarkup(createElement(SectionPerimeesSansProcedure, { lignes: l, protocoles: proto() }));
    expect(h).toContain('Périmées sans procédure connue');
    expect(h).toContain('aucun geste n’est documenté'); // le POURQUOI, pas juste un titre
    expect(h).toContain('BD TOPO® adresse'); // le nom réel de la source (catalogue)
    expect(h).toContain('2026-06-15'); // l'édition disponible
    expect(h).not.toContain('DILA'); // la (a) n'est PAS dans ce regroupement
  });

  it('aucune source périmée-sans-procédure → composant vide (pas de bloc au rebut)', () => {
    const h = renderToStaticMarkup(createElement(SectionPerimeesSansProcedure, { lignes: lignes(), protocoles: proto() }));
    expect(h).toBe('');
  });
});

describe('SectionAutomatisation (F6) — interrupteurs et fenêtre', () => {
  const modele = construireEtatAutomatisation({
    sources: [{ cle: 'dila', nom: 'DILA' }, { cle: 'lidar', nom: 'LiDAR HD' }],
    actionnables: new Set(['dila']),
    avecCommande: new Set(['dila']),
    fenetre: { debut: 3, fin: 6 },
    actifs: { dila: true },
    dernierParSource: {},
    nuit: '2026-08-23',
  });

  it('source (a) → interrupteur + « se fera cette nuit » ; source (c) → « manuelle uniquement », AUCUN interrupteur', () => {
    const h = renderToStaticMarkup(createElement(SectionAutomatisation, { automatisation: modele }));
    expect(h).toContain('Automatiser la mise à jour de DILA la nuit'); // interrupteur (aria-label) pour la (a)
    expect(h).toContain('se fera cette nuit');
    expect(h).toContain('mise à jour manuelle uniquement — aucune procédure connue'); // LiDAR (c)
    expect(h).not.toContain('Automatiser la mise à jour de LiDAR'); // pas d'interrupteur pour la (c)
  });

  it('fenêtre nocturne éditable (sélecteurs d’heures, accessibles)', () => {
    const h = renderToStaticMarkup(createElement(SectionAutomatisation, { automatisation: modele }));
    expect(h).toContain('Heure de début de la fenêtre nocturne');
    expect(h).toContain('Heure de fin de la fenêtre nocturne');
  });
});

describe('LigneDepliable (G1) — compaction', () => {
  it('rend un <details> FERMÉ par défaut (aucune section ouverte), titre + synthèse à droite', () => {
    const h = renderToStaticMarkup(createElement(LigneDepliable, { titre: 'Espace occupé par base', synthese: '3.34 Go' }, createElement('p', {}, 'détail')));
    expect(h).toContain('<details'); // vrai contrôle natif (clavier + état annoncé)
    expect(h).not.toMatch(/<details[^>]*\sopen/); // FERMÉ par défaut
    expect(h).toContain('Espace occupé par base');
    expect(h).toContain('3.34 Go');
    expect(h).toContain('détail'); // le contenu est présent (masqué), déplié en un clic
  });
});

describe('G3 — pastille de mises à jour propagée aux 3 niveaux, un seul compte', () => {
  const PROTOS = [
    '<!-- SOURCE: dila -->', '## DILA', '```bash', 'npm run dila:ingest', '```',
    '<!-- SOURCE: prada -->', '## PRADA', '```bash', 'npm run prada:ingest', '```',
    '<!-- SOURCE: bdtopo_adresse -->', '## BD TOPO adresse', 'CAS (c) aucune procédure connue.',
  ].join('\n');
  const ORDRE = [{ cle: 'dila', nom: 'DILA' }, { cle: 'prada', nom: 'PRADA' }, { cle: 'bdtopo_adresse', nom: 'BD TOPO adresse / BAN' }];
  const proto = () => construireAffichageProtocoles(PROTOS, ORDRE);
  // dila + prada périmées (cas a) → comptées ; adresse périmée (cas c) → exclue.
  const dets = [
    D({ source: 'dila', editionDistante: '2026-08-21', dateDistante: '2026-08-21' }),
    D({ source: 'prada', editionDistante: '2026-08', dateDistante: '2026-08-01' }),
    D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15' }),
  ];
  const L = () => lignes({}, dets);

  it('compte nominal : cumul = nombre de capsules = 2 (adresse cas c EXCLUE)', () => {
    expect(compterMisesAJourActionnables(L(), proto())).toBe(2);
    expect(misesAJourActionnables(L(), proto()).map((l) => l.cle).sort()).toEqual(['dila', 'prada']);
  });

  it('haut de page total>0 → pastille + phrase (aria-label explicite)', () => {
    const h = renderToStaticMarkup(createElement(ResumeMisesAJour, { total: 2 }));
    expect(h).toContain('2 base');
    expect(h).toContain('aria-label="2 base');
  });

  it('haut de page : total 0 (bonne nouvelle, VERT) vs total null (panne, ROUGE) — distincts à l’œil, AUCUNE pastille', () => {
    const zero = renderToStaticMarkup(createElement(ResumeMisesAJour, { total: 0 }));
    const nul = renderToStaticMarkup(createElement(ResumeMisesAJour, { total: null }));
    expect(zero).not.toContain('aria-label'); // 0 → pas de pastille (jamais « 0 »)
    expect(nul).not.toContain('aria-label'); // null → pas de pastille non plus
    expect(zero).toContain('tout est à jour');
    expect(nul).toContain('indisponible');
    expect(zero).toContain('var(--color-svv-green'); // vert = bonne nouvelle
    expect(zero).not.toContain('var(--color-svv-red'); // le 0 n'emprunte JAMAIS la couleur d'alerte
    expect(nul).toContain('var(--color-svv-red'); // rouge = panne à ne pas confondre
  });

  it('ligne Réingestion dépliée : capsule sur les sources en attente (aria nommant la source), pas sur les autres', () => {
    const h = renderToStaticMarkup(createElement(SectionReingestion, { lignes: L(), cheminDepot: '/x', actionnables: new Set(['dila', 'prada']) }));
    expect(h).toContain('DILA : mise à jour disponible'); // la capsule NOMME la source
    expect(h).not.toContain('BDNB : mise à jour disponible');
  });

  it('source cas (c) détectée périmée (adresse) → PAS de capsule (hors du jeu, reste dans son regroupement)', () => {
    const setMaj = new Set(misesAJourActionnables(L(), proto()).map((l) => l.cle));
    const h = renderToStaticMarkup(createElement(SectionReingestion, { lignes: L(), cheminDepot: '/x', actionnables: setMaj }));
    expect(h).not.toContain('BD TOPO® adresse : mise à jour disponible');
  });

  it('COHÉRENCE tuile home ↔ haut de page : MÊME nombre pour un même état de base (même fonction)', () => {
    const total = compterMisesAJourActionnables(L(), proto()); // la fonction UNIQUE (tuile via route, page directement)
    expect(total).toBe(2);
    const tuile = renderToStaticMarkup(createElement(ContenuTuileSources, { desc: 'x', total: total ?? 0 }));
    const haut = renderToStaticMarkup(createElement(ResumeMisesAJour, { total }));
    expect(tuile).toContain('>2<'); // « 2 » dans la pastille de la tuile
    expect(haut).toContain('>2<'); // « 2 » dans la pastille du haut de page
    expect(tuile).toContain('2 mises à jour de base de données disponibles');
  });
});
