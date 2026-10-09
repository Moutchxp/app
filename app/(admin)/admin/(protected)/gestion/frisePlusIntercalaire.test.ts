/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT FRISE-PLUS-INTERCALAIRE-ET-ENTETE-EVENEMENTS (08/10/2026) ══════════════════════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   1. « Un élément (point OU carré) créé depuis un “+” intercalaire doit être enregistré EXACTEMENT à cet
 *      emplacement (entre les deux éléments qui entourent ce “+”), via rang_pose. Seul le grand carré rouge “+”
 *      de fin ajoute en dernière position. Cet emplacement voulu ne doit faire passer AUCUN carré à l'orange. »
 *   2. « Ajouter un “+” intercalaire entre le dernier élément de la frise et le grand carré rouge “+”. »
 *   3. « Depuis un “+” INTERCALAIRE : la forme est présélectionnée sur “Simple information (point)”. Depuis le
 *      grand carré rouge “+” : inchangé. On peut toujours changer de forme à la main. »
 *   4. « Les “+” intercalaires ET les points sont centrés à mi-hauteur des carrés, posés SUR le fil. »
 *   5. « 1re ligne = titre “Événements” + compteur ; 2e ligne = “New” et “Urgent” à gauche, “Plein écran” à
 *      droite, sur la même ligne […] que celle du panneau de gauche. »
 *
 * Le placement en ligne (points 1-2) est éprouvé sur `rangerEnLigne` dans `frise.test.ts` ; la règle vert/orange
 * l'est ci-dessous sur la fonction elle-même. Ce fichier tient la CHAÎNE : le rang calculé en base, la place
 * transmise, la forme présélectionnée, et les deux mises en page.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cartesHorsChronologie } from '../../../../lib/gestion/frise';

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const MIGRATION = readFileSync('db/migrations/322_gestion_etape_pose_choisie.sql', 'utf8');
const FEUILLE = (/const CSS_FRISE_AVANCEMENT = `([\s\S]*?)\n`;/.exec(FRISE)?.[1] ?? '');

describe('🔴🔴 ① la carte se pose là où le « + » a été cliqué', () => {
  /**
   * 🔴🔴 LA CAUSE, ET SA CORRECTION. Le dépôt écrivait `coalesce(max(rang_pose), 0) + 1` dans TOUS les cas :
   * quel que soit le « + » cliqué, la carte prenait le dernier rang. Trois chemins désormais, et le défaut
   * — « au bout » — reste celui du gros « + » rouge.
   */
  it('🔴🔴 trois places possibles, et « au bout » reste le défaut', () => {
    expect(REPO).toContain("insererApres?: number | 'debut';");
    expect(REPO).toContain("a.insererApres === undefined\n    ? 'coalesce(max(x.rang_pose), 0) + 1'");
    expect(REPO).toContain("? 'coalesce(min(x.rang_pose) / 2, 1)'");
    expect(REPO).toContain('WHEN s.suivant IS NULL THEN v.rang + 1 ELSE (v.rang + s.suivant) / 2 END');
  });

  /**
   * 🔴 LE MILIEU, ET AUCUNE RENUMÉROTATION : entre 3 et 4 on pose 3,5. C'est la raison d'être du type
   * `numeric` de `rang_pose`, et c'est ce qui laisse les cartes voisines intactes — on ne réécrit que la
   * ligne qu'on insère.
   */
  it('🔴 le calcul reste dans la requête d’insertion, en une seule fois', () => {
    const bloc = REPO.slice(REPO.indexOf('export async function ajouterEtapeManuelle'),
      REPO.indexOf('export async function reordonnerCartes'));
    expect(bloc).toContain('INSERT INTO gestion_monga_etape');
    expect(bloc).toContain('rang_pose, pose_choisie');
    /* ⚠️ UN REPLI SÛR : l'étape nommée a pu disparaître ; l'ajout pose alors au bout plutôt que d'échouer. */
    expect(bloc).toContain('coalesce(\n           (SELECT CASE');
  });

  /** 🔴 ET LA ROUTE TRANSMET, avec un repli tolérant : une valeur illisible vaut « au bout ». */
  it('🔴 la route lit la place demandée, et tolère l’illisible', () => {
    expect(ROUTE).toContain("function placeDemandee(brut: unknown): number | 'debut' | undefined {");
    expect(ROUTE).toContain("if (brut === 'debut') return 'debut';");
    expect(ROUTE).toContain('return Number.isInteger(n) && n > 0 ? n : undefined;');
    expect(ROUTE).toContain('insererApres: placeDemandee(corps.insererApres),');
  });

  /** 🔴 ET L'ÉCRAN L'ENVOIE : le « + » intercalaire dit sa place, le gros « + » rouge n'en dit aucune. */
  it('🔴🔴 l’écran envoie la place du « + » cliqué', () => {
    expect(FRISE).toContain("onClick={() => p.onAjouter(jour, p.el.apresId, 'information')}");
    expect(FRISE).toContain('insererApres={reservoir?.apresId}');
    expect(FRISE).toContain('insererApres,\n          }),');
    /* 🔴 LE GROS « + » ROUGE N'ENVOIE RIEN : `onAjouter(p.aujourdhui)` tout court — donc au bout, en carré. */
    expect(FRISE).toContain('onClick={() => p.onAjouter(p.aujourdhui)}');
  });
});

describe('🔴🔴 ② l’emplacement voulu ne fait passer personne à l’orange', () => {
  /**
   * 🔴🔴 LE CŒUR DU POINT 1. Une carte insérée au milieu porte l'horodatage le PLUS RÉCENT : sans exemption,
   * la règle la verrait déplacée — et, pire, elle casserait la suite croissante de ses voisines, qui
   * passeraient à l'orange SANS AVOIR BOUGÉ. C'est ce second effet qu'Arno nomme (« AUCUN carré »).
   */
  it('🔴🔴 ni elle ni ses voisines ne s’allument', () => {
    const suite = [
      { cle: 'a', creeLe: '2026-10-01 09:00:00' },
      /* la carte insérée : la plus récente, posée au milieu, et marquée comme telle */
      { cle: 'insere', creeLe: '2026-10-09 18:00:00', poseChoisie: true },
      { cle: 'b', creeLe: '2026-10-02 09:00:00' },
      { cle: 'c', creeLe: '2026-10-03 09:00:00' },
    ];
    expect([...cartesHorsChronologie(suite)]).toEqual([]);
  });

  /**
   * 🔴 ET SANS L'EXEMPTION, LA MÊME SUITE S'ALLUME — c'est la preuve que l'exemption SERT. Sans elle, la
   * plus longue suite croissante est a-b-c, et la carte insérée ressort orange.
   */
  it('🔴🔴 sans l’exemption, la même suite s’allumerait', () => {
    const suite = [
      { cle: 'a', creeLe: '2026-10-01 09:00:00' },
      { cle: 'insere', creeLe: '2026-10-09 18:00:00' },
      { cle: 'b', creeLe: '2026-10-02 09:00:00' },
      { cle: 'c', creeLe: '2026-10-03 09:00:00' },
    ];
    expect([...cartesHorsChronologie(suite)]).toEqual(['insere']);
  });

  /** 🔴 LA RÈGLE DU DÉPLACEMENT À LA MAIN EST INTACTE : une carte ordinaire hors de son ordre s'allume. */
  it('🔴 une carte ordinaire déplacée s’allume toujours', () => {
    expect([...cartesHorsChronologie([
      { cle: 'tard', creeLe: '2026-10-09 18:00:00' },
      { cle: 'tot', creeLe: '2026-10-01 09:00:00' },
    ])]).toEqual(['tard']);
  });

  /** ⚠️ `poseChoisie` ABSENT VAUT `false` : sans la migration 322, la frise est celle d'avant ce lot. */
  it('⚠️ le champ absent ne change rien', () => {
    expect([...cartesHorsChronologie([{ cle: 'x', creeLe: '2026-10-01 09:00:00' }])]).toEqual([]);
  });

  /** 🔴 LA MIGRATION EST D'AJOUT PUR, et son retour en arrière est écrit. */
  it('🔴 la migration 322 ajoute une colonne, et rien d’autre', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS pose_choisie boolean NOT NULL DEFAULT false');
    expect(MIGRATION).toContain('DROP COLUMN pose_choisie');
    for (const interdit of ['DROP TABLE', 'ALTER COLUMN', 'RENAME', 'DELETE FROM', 'UPDATE ']) {
      expect(MIGRATION, interdit).not.toContain(interdit);
    }
  });
});

describe('🔴🔴 ③ la forme présélectionnée', () => {
  /** 🔴 DEPUIS UN INTERCALAIRE : « Simple information (point) ». Depuis le gros « + » : « Étape (carré) ». */
  it('🔴🔴 l’intercalaire ouvre sur le point, le gros « + » sur le carré', () => {
    expect(FRISE).toContain("onClick={() => p.onAjouter(jour, p.el.apresId, 'information')}");
    expect(FRISE).toContain("forme: 'etape' | 'information' = 'etape',");
    expect(FRISE).toContain("formeDefaut={reservoir?.forme ?? 'etape'}");
  });

  /**
   * 🔴 ET UNE MODIFICATION GARDE LA FORME DE SA CARTE : un carré rouvert pour correction ne doit pas se
   * changer en point parce qu'un « + » a été cliqué avant. C'est la carte qui décide, pas le chemin.
   */
  it('🔴🔴 modifier une carte garde SA forme', () => {
    expect(FRISE).toContain('modifie === null ? formeDefaut : depart.forme);');
  });

  /** ⚠️ ET LA BASCULE RESTE : « On peut toujours changer de forme à la main » (Arno). */
  it('⚠️ la bascule Étape / Simple information n’est pas retirée', () => {
    expect(FRISE).toContain('Simple information (point)');
    expect(FRISE).toContain("onClick={() => setForme('etape')}>Étape (carré)</button>");
  });
});

describe('🔴🔴 ④ le fil et ce qui est posé dessus', () => {
  /**
   * 🔴🔴 UNE SEULE MESURE POUR TROIS ÉLÉMENTS. Les trois nombres écrits à la main (44, 32, 38) étaient
   * accordés à un carré de 92 px ; le carré a grandi deux fois sans eux, et le fil s'est retrouvé 15 px
   * au-dessus du milieu. Ils dérivent maintenant de `--fav-mi-carre`.
   */
  it('🔴🔴 le fil, les « + » et les points dérivent de la mi-hauteur du carré', () => {
    expect(FEUILLE).toContain('.fav-piste{--fav-mi-carre:59px}');
    expect(FEUILLE).toContain('top:var(--fav-mi-carre)');
    expect(FEUILLE).toContain('padding-top:calc(var(--fav-mi-carre) - 12px)');
    expect(FEUILLE).toContain('padding-top:calc(var(--fav-mi-carre) - 5.5px)');
  });

  /** 🔴 ET LA MESURE EST VRAIMENT LA MOITIÉ DU CARRÉ : les deux nombres se tiennent, et se tiendront. */
  it('🔴🔴 la mi-hauteur suit la hauteur du carré', () => {
    const h = /\.fav-carre\{[^}]*min-height:(\d+)px/.exec(FEUILLE);
    const mi = /--fav-mi-carre:(\d+)px/.exec(FEUILLE);
    expect(Number(mi?.[1])).toBe(Math.round(Number(h?.[1]) / 2));
  });

  /** ⚠️ LA RANGÉE ALIGNE TOUJOURS PAR LE HAUT : c'est ce qui rend ces trois calculs lisibles. */
  it('⚠️ la rangée aligne par le haut, comme avant', () => {
    expect(FEUILLE).toMatch(/\.fav-piste\{[^}]*align-items:flex-start/);
  });
});

describe('🔴🔴 ⑤ l’en-tête du panneau « Événements »', () => {
  /**
   * 🔴🔴 « New » ET « Urgent » SONT DANS LA RANGÉE DES OUTILS, plus dans le titre. C'est ce qui aligne les
   * deux panneaux : la colonne de gauche met ses filtres dans cette même rangée (`BoiteReception`).
   */
  it('🔴🔴 les deux boutons sont descendus dans la rangée des outils', () => {
    const tete = VUE.slice(VUE.indexOf('id="gst-titre-ev"'), VUE.indexOf('gst-corps-partage'));
    const titre = tete.slice(0, tete.indexOf('gst-tete-partage-outils'));
    /* 🔴 PLUS DANS LE TITRE… */
    expect(titre).not.toContain('{boutonsDeTri}');
    /* …ET DANS LES OUTILS, avant « Plein écran ». */
    expect(tete).toContain('<div className="gst-tete-partage-outils">\n              {boutonsDeTri}');
    /* ⚠️ ON COMPARE AU BOUTON, PAS AU MOT : « Plein écran » apparaît aussi dans le commentaire qui explique
       le déplacement, et il y apparaît AVANT — ce qui ferait échouer une comparaison sur le texte. */
    expect(tete.indexOf('{boutonsDeTri}')).toBeLessThan(tete.indexOf('className="svv-btn svv-btn-outline gst-btn gst-plein"'));
  });

  /**
   * 🔴 LA MÊME CLASSE QUE LA COLONNE DE GAUCHE, ET NON UNE IMITATION : elle porte déjà la hauteur minimale et
   * la marge automatique qui envoie « Plein écran » à droite. Deux rangées qui se ressemblent à un pixel près
   * se mettent à diverger au premier ajustement.
   */
  it('🔴🔴 les deux panneaux partagent la rangée, sa hauteur et sa marge', () => {
    const gauche = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
    expect(gauche).toContain('gst-tete-partage-outils');
    /* ⚠️ DEUX CHANGEMENTS DU LOT BOUTONS-PLATS-ET-SYMETRIE-PANNEAUX, ET LEURS RAISONS.
       ① Le gap s'écrit en deux valeurs, `12px 6px` : la colonne reste à 6 px — rien ne bouge sur une seule
          ligne — et la RANGÉE passe à 12 px pour que deux lignes de boutons repliés n'aient pas des zones de
          clic de 44 px qui se chevauchent.
       ② La hauteur minimale passe de 44 à 32 px : elle réservait la cible tactile du §15, que les boutons
          portent désormais par un rectangle invisible. La rangée épouse donc ses boutons — et c'est ce qui
          permet à « Plein écran » d'être sur la même ligne des deux côtés (`align-content:flex-end`).
       Ce que ce cas tient reste le même : les deux panneaux partagent LA MÊME déclaration de rangée. */
    expect(VUE).toContain('.gst-tete-partage-outils{display:flex;flex-wrap:wrap;align-items:center;align-content:flex-end;gap:12px 6px;\n  min-height:32px}');
    expect(VUE).toContain('.gst-tete-partage-outils .gst-plein{margin-left:auto;');
  });

  /**
   * 🔴🔴 « MÊME HAUTEUR QUE LE PANNEAU DE GAUCHE » SE MESURE, et la structure ne suffisait pas : à l'écran, la
   * tête de gauche faisait 80 px et celle des Événements 73, les deux listes commençant à 341 et 334 px.
   * L'écart venait de la rangée du TITRE, laissée à son contenu : le bouton « relever » de la boîte de
   * réception la porte à 30 px, « Événements » + compteur n'en demandent que 22,5.
   * ⚠️ ON ÉPROUVE LES DEUX RANGÉES ENSEMBLE : fixer la hauteur des outils sans celle du titre laisse
   * exactement le défaut qu'Arno voyait — deux rangées justes et deux têtes inégales.
   */
  it('🔴🔴 les deux rangées de l’en-tête ont une hauteur fixée, titre compris', () => {
    /* ⚠️ `align-items` EST PASSÉ DE `baseline` À `center` (lot BOUTONS-PLATS-ET-SYMETRIE-PANNEAUX) : la
       hauteur fixée de 30 px — ce que ce cas tient — n'a pas bougé, mais le calage sur la ligne de base
       laissait la pastille du compteur 3,8 px plus bas à gauche qu'à droite, parce que le bouton rond
       « relever » y abaissait la ligne de base. Mesuré, puis corrigé des deux côtés. */
    expect(VUE).toContain('.gst-tete-partage-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;min-height:30px}');
    /* ⚠️ ET LE COMMENTAIRE DIT LA MESURE : sans elle, le prochain passage remettra 23 px « pour faire serré ». */
    expect(VUE).toContain('Les deux tetes faisaient donc 80 et 73');
  });

  /** ⚠️ RIEN N'EST RETIRÉ : ce sont les MÊMES boutons, avec le même état et les mêmes gestes. */
  it('⚠️ les filtres gardent leur comportement', () => {
    expect(VUE).toContain('const boutonsDeTri');
    expect(VUE).toContain('Plein écran');
  });
});
