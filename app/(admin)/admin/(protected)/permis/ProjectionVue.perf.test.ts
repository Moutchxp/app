import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * PERF-1 — GARDE-FOU du CHARGEMENT PARESSEUX de la fiche « Analyse et projection ».
 *
 * ⚠️ HONNÊTETÉ : ce dépôt n'a AUCUNE infra de rendu DOM (env node) — on ne peut pas monter les composants pour observer les requêtes
 * réseau. Ce test fait ce qui est vérifiable en node pur : il SCANNE LE SOURCE et prouve la STRUCTURE qui garantit la paresse —
 *   (1) les blocs coûteux (fil, caractéristiques, bâtiments, pièces) sont montés via une RENDER-PROP `() => <…>` de BlocRepliable
 *       → leur enfant (donc leur requête) n'existe pas tant que le bloc n'est pas déplié ;
 *   (2) BlocRepliable ne rend l'enfant qu'après la 1re ouverture (`dejaOuvert`) et le garde monté caché (`hidden`) → pas de refetch ;
 *   (3) BlocCompletude est monté DIRECTEMENT (pas derrière une render-prop) : il fait la lecture légère du bilan pour la ligne de titre.
 * La preuve du zéro-requête effectif est fournie par la MESURE navigateur/HTTP du rapport ; ce test empêche une régression de structure.
 */
const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const PROJ = lire('./ProjectionVue.tsx');
const REPLIABLE = lire('./BlocRepliable.tsx');
const COMPLETUDE = lire('./BlocCompletude.tsx');

describe('PERF-1 — blocs coûteux montés au dépliage (render-prop)', () => {
  for (const bloc of ['BlocFilEchanges', 'CaracteristiquesBloc', 'BlocPiecesPermis']) {
    it(`${bloc} est monté via une render-prop () => <…> (chargé au dépliage, pas au rendu de la fiche)`, () => {
      expect(PROJ).toContain(`() => <${bloc}`);
    });
  }

  // POLISH-1 — BlocTraceEmprise reste chargé AU DÉPLIAGE, mais sa render-prop retourne désormais un fragment : le bloc « Bâtiments
  //   et projection » enferme AUSSI le bouton « Valider la projection » (il n'apparaît plus hors du bloc replié). La requête /emprise
  //   ne part donc toujours qu'au dépliage. On vérifie que trace ET bouton vivent dans la MÊME render-prop lazy.
  it('BlocTraceEmprise + BoutonValiderProjection sont enfermés dans la render-prop lazy du bloc « Bâtiments et projection » (POLISH-1)', () => {
    const bat = PROJ.slice(PROJ.indexOf('onOuvertChange={setBatimentsOuvert}'));
    expect(bat).toContain('{() => ('); // render-prop (lazy) — /emprise seulement au dépliage
    expect(bat.indexOf('<BlocTraceEmprise')).toBeGreaterThan(-1);
    expect(bat.indexOf('<BoutonValiderProjection')).toBeGreaterThan(bat.indexOf('<BlocTraceEmprise')); // bouton ENFERMÉ après la trace, dans le même bloc
  });

  it('les 4 blocs coûteux du détail sont enveloppés dans BlocRepliable = 4 wrappers (LOT 54 : plus de groupe de tête)', () => {
    // 4 render-props lazy du DÉTAIL (fil / caractéristiques / bâtiments+projection / pièces) — /emprise & co au seul dépliage.
    //   Le groupe de tête « Test Permis » du LOT 52 a été RETIRÉ au LOT 54 : les dossiers en test se signalent par leur en-tête de
    //   colonne, pas par un pli. Il ne reste donc que les 4 wrappers du détail.
    expect((PROJ.match(/<BlocRepliable/g) ?? []).length).toBe(4);
    expect(PROJ).not.toContain('Test Permis');
  });

  it('BlocCompletude est monté DIRECTEMENT (bilan léger visible sans déplier), jamais derrière une render-prop', () => {
    expect(PROJ).toContain('<BlocCompletude ');
    expect(PROJ.includes('() => <BlocCompletude')).toBe(false);
  });
});

describe('PERF-1 — BlocRepliable : montage paresseux + pas de refetch', () => {
  it('n’évalue la render-prop qu’après la 1re ouverture (dejaOuvert) et appelle children()', () => {
    expect(REPLIABLE).toContain('dejaOuvert');
    expect(REPLIABLE).toContain('children()');
  });
  it('garde l’enfant monté et le cache en CSS quand replié (hidden) → aucune requête à la refermeture/réouverture', () => {
    expect(REPLIABLE).toContain('hidden={!ouvert}');
  });
});

describe('PERF-1 — BlocCompletude : titre renommé + bilan + détail au dépliage', () => {
  it('titre renommé « Complétude des pièces et relances semi-automatiques »', () => {
    expect(COMPLETUDE).toContain('Complétude des pièces et relances semi-automatiques');
  });
  it('bilan dérivé du diagnostic mémorisé (resumeCompletude) et détail derrière une render-prop', () => {
    expect(COMPLETUDE).toContain('resumeCompletude');
    // Q4 — le détail (CorpsCompletude) reste monté PARESSEUSEMENT via la render-prop de BlocRepliable dans le chemin AUTONOME (Analyse) :
    //   `corps` = l'élément CorpsCompletude, rendu par `{() => corps}` (comportement PERF-1 inchangé) ; en `sansPli` il est rendu direct (encart).
    expect(COMPLETUDE).toContain('<CorpsCompletude etat={etat}');
    expect(COMPLETUDE).toContain('{() => corps}');
  });
});

describe('PERF-2 — BlocCompletude : recalcul auto non bloquant sur écart GED', () => {
  it('déclenche via doitRecalculerAuto, sous garde anti-boucle dejaLance, par un POST', () => {
    expect(COMPLETUDE).toContain('doitRecalculerAuto');
    expect(COMPLETUDE).toContain('dejaLance');
    expect(COMPLETUDE).toContain("method: 'POST'");
  });
  it('ne présente jamais un bilan périmé pendant le recalcul (recalcEnCours prioritaire dans le titre)', () => {
    // Le garde d'ordre : recalcEnCours est testé AVANT le calcul du résumé (resumeCompletude) dans TitreBilan.
    expect(COMPLETUDE.indexOf('if (recalcEnCours)')).toBeGreaterThan(-1);
    expect(COMPLETUDE.indexOf('if (recalcEnCours)')).toBeLessThan(COMPLETUDE.indexOf('resumeCompletude(etat.completude)'));
  });
});
