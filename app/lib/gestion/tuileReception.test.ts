import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 3 — LA TUILE « RÉCEPTION », DEPUIS N'IMPORTE QUEL ÉCRAN ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Clic sur la tuile (nom ou total) → la liste Réception, depuis n'importe quel écran
 * (mail ouvert, fiche, annuaire, recherche, autre dossier). Clic sur “N non lus” → la Réception filtrée sur les
 * non lus. Vérifie les deux depuis 5 écrans différents ; corrige tout chemin qui ne mène pas au bon endroit. »
 *
 * ═══ 🔴🔴 LES DEUX CHEMINS QUI NE MENAIENT PAS AU BON ENDROIT, VUS À L'ÉCRAN ═══════════════════════════════════════
 *
 *   ① DEPUIS UNE RECHERCHE FAITE DANS « RÉCEPTION », la tuile ne faisait RIEN. L'étiquette ne changeait pas (on y
 *      était déjà), l'adresse non plus — et la liste continuait d'afficher les résultats de « facture », le champ
 *      de recherche toujours rempli. La tuile promettait un dossier et rendait une recherche.
 *
 *   ② DEPUIS « À RATTACHER » ET DEPUIS UN HISTORIQUE, il n'y avait AUCUN chemin vers la Réception. Ces écrans
 *      n'ont pas la colonne de gauche, donc pas de tuile, et leur seule sortie menait à l'écran partagé — d'où il
 *      fallait un second geste pour retrouver son courrier.
 *
 * ⚠️ RIEN N'A ÉTÉ RETIRÉ POUR AUTANT : « ← Écran partagé » reste à sa place et dit toujours où il va. On a AJOUTÉ
 * le chemin qui manquait, à côté.
 *
 * ⚠️ L'ANNUAIRE, LUI, ÉTAIT DÉJÀ BON : son « ← Retour » mène à la boîte. Vérifié, et laissé tel quel.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PLEIN = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 UN SEUL GESTE POUR « MONTRE-MOI CE DOSSIER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① cliquer une entrée de la colonne', () => {
  /**
   * 🔴 LES QUATRE BOUTONS DE LA COLONNE PASSENT PAR LA MÊME PORTE : le nom de « Réception », ses deux sélecteurs
   * (« N non lus » et le total), et le bouton des autres entrées. Quatre gestes écrits à quatre endroits
   * finiraient par ne plus faire la même chose — c'est exactement ce qui vient d'être réparé ailleurs dans ce lot.
   */
  it('🔴🔴 les quatre boutons appellent `allerAuDossier`', () => {
    expect(PLEIN).toContain('const allerAuDossier = (e: Etiquette): void => {');
    expect(PLEIN.match(/allerAuDossier\(e\.etiquette\)/g) ?? []).toHaveLength(4);
  });

  /** 🔴 ET CE GESTE FAIT LES TROIS CHOSES : l'étiquette, la sortie de recherche, et le panneau mobile. */
  it('🔴 il va au dossier, quitte la recherche, et bascule le panneau mobile', () => {
    const i = PLEIN.indexOf('const allerAuDossier');
    const bloc = PLEIN.slice(i, i + 260);
    expect(bloc).toContain('onEtiquette(e);');
    expect(bloc).toContain('setRetourAuDossier((n) => n + 1);');
    expect(bloc).toContain("setPanneauMobile('contenu');");
  });

  /** 🔴 LES DEUX SÉLECTEURS GARDENT LEUR FILTRE : « N non lus » filtre, le total le retire. */
  it('🔴🔴 « N non lus » filtre, le total rend la liste entière', () => {
    expect(PLEIN).toContain("onClick={() => { allerAuDossier(e.etiquette); onFiltre('non-lus'); }}");
    expect(PLEIN).toContain('onClick={() => { allerAuDossier(e.etiquette); onFiltre(null); }}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE DÉFAUT DE LA RECHERCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② depuis une recherche, la tuile rend bien le dossier', () => {
  /**
   * 🔴🔴 UN NOMBRE, ET NON UN BOOLÉEN NI L'ÉTIQUETTE. Depuis une recherche faite DANS « Réception », l'étiquette
   * ne change pas : c'est précisément ce cas-là qui ne marchait pas. Et un drapeau serait resté à `true`, de
   * sorte qu'un second clic n'aurait rien fait.
   */
  it('🔴🔴 la liste écoute un compteur, pas un drapeau', () => {
    expect(PLEIN).toContain('const [retourAuDossier, setRetourAuDossier] = useState(0);');
    expect(PLEIN).toContain('retourAuDossier={retourAuDossier}');
    expect(BOITE).toContain('retourAuDossier?: number;');
    expect(BOITE).toContain('retourAuDossier = 0,');
  });

  /**
   * 🔴 ON VIDE LES DEUX : la saisie (ce qu'on voit dans le champ) ET le critère (ce qui commande la liste). N'en
   * vider qu'un laisserait soit un champ qui ment, soit une liste qui ne correspond plus à ce qu'il affiche.
   */
  it('🔴🔴 la saisie ET le critère sont vidés', () => {
    const i = BOITE.indexOf('if (retourAuDossier === 0) return;');
    expect(i).toBeGreaterThan(0);
    const bloc = BOITE.slice(i, i + 200);
    expect(bloc).toContain('setSaisie(CRITERE_VIDE);');
    expect(bloc).toContain('setCritere(CRITERE_VIDE);');
  });

  /** ⚠️ ET `0` NE DÉCLENCHE RIEN : une recherche tapée ne doit pas s'effacer au simple montage de la liste. */
  it('⚠️ au montage, rien ne s’efface', () => {
    expect(BOITE).toContain('if (retourAuDossier === 0) return;');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LES ÉCRANS SANS COLONNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ les écrans qui n’ont pas de colonne', () => {
  /**
   * 🔴🔴 « À RATTACHER » ET L'HISTORIQUE N'AVAIENT AUCUN CHEMIN VERS LA RÉCEPTION. Vérifié à l'écran : leur seule
   * sortie était « ← Écran partagé ». Ils reçoivent un bouton « Réception », à côté — jamais à la place.
   */
  it('🔴🔴 « À rattacher » et l’historique mènent à la Réception', () => {
    for (const f of ['FileATrier.tsx', 'HistoriqueCible.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
      expect(src, f).toContain('onReception?: () => void;');
      expect(src, f).toContain('{onReception !== undefined && (');
      /* ⚠️ RIEN N'EST RETIRÉ : le retour d'origine reste, et dit toujours où il va. */
      expect(src, f).toContain('← Écran partagé');
    }
    expect(VUE.match(/onReception=\{\(\) => aller\(\{ \.\.\.ETAT_DEFAUT, ecran: 'boite', etiquette: ETIQUETTE_RECEPTION \}\)\}/g) ?? [])
      .toHaveLength(2);
  });
});
