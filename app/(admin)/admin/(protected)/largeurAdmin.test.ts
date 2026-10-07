import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ══ 🔴🔴 LOT ADMIN-PLEINE-LARGEUR — TOUTE L'ADMINISTRATION VA JUSQU'AU BORD DROIT ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « toutes les pages de l'administration qui laissent une marge vide à droite doivent occuper
 * toute la largeur disponible, comme l'écran partagé au lot ECRAN-PARTAGE-PLEINE-LARGEUR (0ae9eb79). […]
 * Factorise si possible : une seule règle de largeur partagée par les pages admin, plutôt qu'un plafond levé page
 * par page. Les plafonds propres à chaque page sont retirés, puisque c'est l'objet de la demande. »
 *
 * ═══ CE QUE CE FICHIER TIENT, ET QU'AUCUN AUTRE NE PEUT TENIR ════════════════════════════════════════════════════
 *   ① que la règle est UNE — `.svv-adm-main`, sans plafond, à marge intérieure uniforme ;
 *   ② qu'AUCUNE racine de page admin ne repose un plafond, aujourd'hui ni demain — c'est la garde qui empêche
 *     qu'un lot futur en réintroduise un sans s'en apercevoir ;
 *   ③ que le menu latéral et les colonnes de gauche gardent leur largeur ;
 *   ④ que les pages HORS périmètre — authentification, public — gardent les leurs.
 *
 * ⚠️ ON NE CHERCHE QUE LES PLAFONDS DE CONTENEUR DE PAGE, et c'est toute la difficulté : une modale de 420 px,
 * une bulle d'aide de 240 px, une cellule de tableau tronquée à 220 px ou un SVG de 520 px sont légitimes — Arno
 * le dit lui-même (« Les petits éléments isolés n'ont pas à être étirés »). Le critère retenu est donc la RACINE
 * RENDUE par la page, et elle seule.
 *
 * ═══ MESURÉ LE 07/10/2026, DANS LE VRAI NAVIGATEUR ═══════════════════════════════════════════════════════════════
 * 13 pages × 3 largeurs (1600, 1280, 1000) = 39 mesures. Marge gauche = marge droite = 20 px PARTOUT, menu latéral
 * à 240 px PARTOUT, et AUCUN défilement horizontal nulle part.
 *
 * ⚠️ TROIS DÉBORDEMENTS MESURÉS, TOUS ANTÉRIEURS AU LOT ET TOUS CONTENUS :
 *   · les tuiles Leaflet de la Curation et du Banc de test débordent de leur panneau, qui les rogne — c'est le
 *     fonctionnement normal d'une carte glissante ;
 *   · le grand tableau des Permis (1486 px) vit dans un conteneur à défilement horizontal, selon la convention du
 *     module ; ce conteneur passe de 1080 à 1320 px, donc il défile MOINS qu'avant ;
 *   · les objets et aperçus de la boîte en plein écran sont rognés par `.bte-sujet` (overflow:hidden), bien à
 *     l'intérieur de la page.
 * Dans les trois cas, `scrollWidth === clientWidth` : la PAGE, elle, ne défile jamais.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SIDEBAR = readFileSync('app/(admin)/admin/(protected)/Sidebar.tsx', 'utf8');
/** La feuille de la coquille, sans ses commentaires : on éprouve des DÉCLARATIONS, pas des explications. */
const SIDEBAR_CODE = SIDEBAR.replace(/\/\*[\s\S]*?\*\//g, '');

describe('🔴🔴 ① une seule règle de largeur, pour toute l’administration', () => {
  /**
   * 🔴🔴 ELLE NE POSE AUCUN PLAFOND, et sa marge intérieure est UNIFORME sur les quatre côtés : une page s'arrête
   * donc exactement à la même distance du bord droit que du menu. C'est ce qui rend la demande d'Arno vraie par
   * construction plutôt que par réglage — il n'y avait rien à ajouter, il y avait des plafonds à retirer.
   */
  it('🔴🔴 `.svv-adm-main` donne la largeur, sans plafond et à marge uniforme', () => {
    expect(SIDEBAR).toContain('.svv-adm-main{flex:1;padding:1.25rem;min-width:0}');
    expect(SIDEBAR_CODE).not.toMatch(/\.svv-adm-main\{[^}]*max-width/);
    /* 🔴 ET UNE SEULE DÉCLARATION DE CETTE RÈGLE : deux finiraient par différer. */
    expect((SIDEBAR_CODE.match(/\.svv-adm-main\{/g) ?? [])).toHaveLength(1);
  });

  /**
   * 🔴🔴 LE MENU LATÉRAL NE BOUGE PAS (Arno : « gardent EXACTEMENT leur largeur et leur aspect »). Sa largeur est
   * écrite à un seul endroit, et aucune page ne la redéfinit.
   */
  it('🔴🔴 le menu latéral garde sa largeur, et aucune page n’y touche', () => {
    expect(SIDEBAR).toContain('.svv-adm-sidebar{width:240px;flex:0 0 240px;');
    /* ⚠️ SANS LES COMMENTAIRES : les encadrés de ce lot RENVOIENT à `.svv-adm-main` pour dire d'où vient
       désormais la largeur — une lecture brute tomberait sur l'explication au lieu d'une redéfinition. */
    for (const [nom, chemin] of RACINES) {
      const code = readFileSync(chemin, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, nom).not.toContain('.svv-adm-sidebar');
      expect(code, nom).not.toContain('.svv-adm-main');
    }
  });

  /**
   * 🔴 LES COLONNES DE GAUCHE PROPRES À UNE PAGE NE BOUGENT PAS NON PLUS. La plus visible est celle de la boîte
   * en plein écran (Réception, Envoyés, À classer…), portée par `ColonneMode` dans la coquille : sa largeur vit
   * dans la feuille du menu, et ce lot n'écrit pas une ligne dedans.
   */
  it('🔴 la colonne de la boîte en plein écran garde sa place', () => {
    expect(SIDEBAR).toContain('.svv-adm-mode{padding:.25rem .75rem}');
    expect(SIDEBAR).toContain('.svv-adm-mode:empty{display:none}');
  });
});

/**
 * ══ LES RACINES DE PAGE DE L'ADMINISTRATION ═══════════════════════════════════════════════════════════════════════
 *
 * Le fichier qui rend le conteneur de plus haut niveau de chaque page. Pour la plupart c'est `page.tsx` ; pour
 * trois d'entre elles, la page délègue à un composant qui porte la racine (Curation, Banc de test, Gestion).
 *
 * ⚠️ LA LISTE EST VÉRIFIÉE CONTRE LE SYSTÈME DE FICHIERS juste en dessous : une page admin ajoutée demain sans
 * entrer ici fait rougir la suite, plutôt que d'échapper à la garde en silence.
 */
const RACINES: readonly (readonly [string, string])[] = [
  ['Tableau de bord', 'app/(admin)/admin/(protected)/page.tsx'],
  ['Statistiques', 'app/(admin)/admin/(protected)/statistiques/page.tsx'],
  ['Internautes (BD)', 'app/(admin)/admin/(protected)/internautes/page.tsx'],
  ['Pilotage Moteur', 'app/(admin)/admin/(protected)/pilotage/page.tsx'],
  ['Années de construction', 'app/(admin)/admin/(protected)/cartes-annee/page.tsx'],
  ['Banc de test', 'app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx'],
  ['Curation', 'app/(admin)/admin/(protected)/curation/CurationCarte.tsx'],
  ['Permis de construire', 'app/(admin)/admin/(protected)/permis/page.tsx'],
  ['Sources de données', 'app/(admin)/admin/(protected)/sources/page.tsx'],
  ['Gestion', 'app/(admin)/admin/(protected)/gestion/GestionVue.tsx'],
  ['Audit', 'app/(admin)/admin/(protected)/audit/page.tsx'],
  ['Administratif — comptes', 'app/(admin)/admin/(protected)/comptes/page.tsx'],
];

describe('🔴🔴 ② aucune page admin ne repose un plafond de largeur', () => {
  /**
   * 🔴🔴 LA LISTE CI-DESSUS EST COMPLÈTE, ET LE RESTE. On relit le dossier : chaque `page.tsx` sous
   * `(protected)` doit être couvert — soit directement, soit par le composant auquel il délègue sa racine.
   * Sans ce cas, une page ajoutée demain échapperait à toute la garde sans que personne ne le voie.
   */
  it('🔴🔴 toutes les pages de `(protected)` sont couvertes par la garde', () => {
    const base = 'app/(admin)/admin/(protected)';
    const pages = ['page.tsx', ...readdirSync(base)
      .filter((d) => statSync(join(base, d)).isDirectory() && d !== '_composants')
      .map((d) => `${d}/page.tsx`)]
      .filter((f) => { try { return statSync(join(base, f)).isFile(); } catch { return false; } });
    const couvertes = new Set(RACINES.map(([, c]) => c));
    for (const f of pages) {
      const chemin = `${base}/${f}`;
      if (couvertes.has(chemin)) continue;
      /* Sinon : la page délègue sa racine, et le composant qu'elle rend DOIT être dans la liste. */
      const src = readFileSync(chemin, 'utf8');
      const delegue = RACINES.some(([, c]) => {
        const nom = c.split('/').pop()?.replace(/\.tsx$/, '') ?? '';
        return c.startsWith(`${base}/${f.split('/')[0]}/`) && src.includes(nom);
      });
      expect(delegue, `${chemin} n'est couvert par aucune racine de la garde`).toBe(true);
    }
  });

  /**
   * 🔴🔴 LA GARDE ELLE-MÊME. Aucune racine ne doit porter de `maxWidth` en ligne ni de `max-width` en pixels sur
   * sa propre classe de conteneur. L'inventaire du 07/10/2026 en a retiré dix :
   *   tableau de bord 720 · Statistiques 960 · Internautes 960 · Pilotage 960 · Années de construction 820 ·
   *   Banc de test 720 · Curation 1100 · Permis 1120 · Gestion 1120 (et sa levée conditionnelle) · Audit 760.
   * Administratif et Sources de données n'en avaient aucun — ils étaient déjà à la bonne largeur.
   *
   * ⚠️ ON NE REGARDE QUE LA RACINE RENDUE : la ligne du `<section>` (ou `<div>`) de plus haut niveau, et la règle
   * de la classe qu'elle porte. Tout le reste du fichier — modales, bulles, cellules, SVG — garde ses plafonds,
   * et c'est ce qu'Arno demande (« les petits éléments isolés n'ont pas à être étirés »).
   */
  it.each(RACINES)('🔴🔴 %s : sa racine ne porte aucun plafond', (nom, chemin) => {
    const src = readFileSync(chemin, 'utf8');
    /* ① aucune racine à style EN LIGNE avec un plafond : `<section style={{ maxWidth: … }}>`. */
    for (const m of src.matchAll(/<(section|main|div)[^>]*style=\{\{([^}]*)\}\}/g)) {
      if (/maxWidth/.test(m[2])) {
        /* Seules les racines sont visées : on exige que la balise ne soit pas au niveau 4 d'indentation du
           `return (` d'un composant de PAGE. Plus simple et plus sûr : on interdit tout `maxWidth` numérique sur
           une balise placée en TOUT DÉBUT de rendu, c'est-à-dire précédée de « return ( ». */
        const avant = src.slice(Math.max(0, m.index - 40), m.index);
        expect(/return \(\s*$/.test(avant), `${nom} : racine avec maxWidth en ligne`).toBe(false);
      }
    }
    /* ② ni plafond en pixels sur la classe de conteneur de la page, dans sa propre feuille. */
    const feuille = src.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const classe of ['svv-pil', 'svv-ca', 'svv-cur-wrap', 'gst-page', 'svv-stats', 'svv-audit', 'svv-sources']) {
      expect(feuille, `${nom} · .${classe}`).not.toMatch(new RegExp(`\\.${classe}\\{[^}]*max-width:\\s*\\d`));
    }
  });

  /**
   * 🔴 ET LES DIX PLAFONDS RETIRÉS NE SONT PLUS LÀ, nommément. Ce cas dit ce que le lot a fait, là où le cas
   * précédent dit ce qu'il interdit — les deux ensemble rendent un retour en arrière visible.
   */
  it('🔴 les dix plafonds de l’inventaire ont disparu', () => {
    const disparus: readonly (readonly [string, string, string])[] = [
      ['Tableau de bord', 'app/(admin)/admin/(protected)/page.tsx', 'maxWidth: 720'],
      ['Statistiques', 'app/(admin)/admin/(protected)/statistiques/page.tsx', 'maxWidth: 960'],
      ['Internautes (BD)', 'app/(admin)/admin/(protected)/internautes/page.tsx', 'maxWidth: 960'],
      ['Pilotage Moteur', 'app/(admin)/admin/(protected)/pilotage/page.tsx', '.svv-pil{max-width:960px}'],
      ['Années de construction', 'app/(admin)/admin/(protected)/cartes-annee/page.tsx', '.svv-ca{max-width:820px}'],
      ['Banc de test', 'app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx', 'maxWidth: 720'],
      ['Curation', 'app/(admin)/admin/(protected)/curation/CurationCarte.tsx', 'gap:.6rem;max-width:1100px'],
      ['Permis de construire', 'app/(admin)/admin/(protected)/permis/page.tsx', 'maxWidth: 1120'],
      ['Gestion', 'app/(admin)/admin/(protected)/gestion/GestionVue.tsx', '.gst-page{max-width:1120px}'],
      ['Audit', 'app/(admin)/admin/(protected)/audit/page.tsx', 'maxWidth: 760'],
    ];
    for (const [nom, chemin, plafond] of disparus) {
      const code = readFileSync(chemin, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${nom} · ${plafond}`).not.toContain(plafond);
    }
  });
});

describe('⚠️ ③ ce qui est HORS périmètre garde ses plafonds', () => {
  /**
   * 🔴🔴 LES PAGES D'AUTHENTIFICATION SONT EXCLUES PAR ARNO, et elles vivent HORS de la coquille `(protected)` :
   * leur carte de 360 px est ce qui les rend lisibles sur un écran de 1600 px. L'élargir serait un défaut, pas
   * une application de la règle.
   */
  it('🔴🔴 la connexion et le mot de passe gardent leur carte étroite', () => {
    for (const chemin of [
      'app/(admin)/admin/login/page.tsx',
      'app/(admin)/admin/compte/mot-de-passe/page.tsx',
    ]) {
      expect(readFileSync(chemin, 'utf8'), chemin).toContain("maxWidth: 360");
    }
  });

  /**
   * ⚠️ ET LES PETITS ÉLÉMENTS ISOLÉS GARDENT LES LEURS (Arno : « n'ont pas à être étirés »). Trois témoins,
   * choisis dans trois pages différentes : une modale, une bulle d'aide, une carte d'avertissement.
   */
  it('⚠️ modales, bulles et cartes isolées gardent leur largeur', () => {
    const temoins: readonly (readonly [string, string])[] = [
      ['app/(admin)/admin/(protected)/comptes/page.tsx', '.cpt-modale{width:100%;max-width:420px'],
      ['app/(admin)/admin/(protected)/internautes/InternautesVue.tsx', 'max-width:240px'],
      ['app/(admin)/admin/(protected)/RevocationWatcher.tsx', '.svv-revoque-carte{width:100%;max-width:360px'],
    ];
    for (const [chemin, regle] of temoins) {
      expect(readFileSync(chemin, 'utf8'), chemin).toContain(regle);
    }
  });

  /**
   * 🔴🔴 LES PAGES PUBLIQUES NE SONT PAS TOUCHÉES. Elles ne partagent ni la coquille, ni la feuille : ce lot
   * n'écrit pas une ligne hors de `(admin)`. Ce cas le vérifie sur le témoin le plus large — la page du tunnel,
   * dont la colonne de lecture est volontairement étroite.
   */
  it('🔴🔴 le site public garde ses largeurs', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    expect(page).toMatch(/max-?[Ww]idth/);
  });
});
