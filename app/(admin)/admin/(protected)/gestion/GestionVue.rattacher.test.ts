import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT ERGO-BOITE-2 — LE COMPTEUR « À RATTACHER » COMPTE CE QUI SE TRANCHE, PAS CE QUI EXISTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT VU PAR ARNO, le 27/09/2026. L'entrée annonçait **19 108** quand la file de tri, elle, n'offrait que
 * **3 261** mails à départager. Le compteur additionnait deux populations que rien ne permet de confondre :
 *   · `aTrier`       = le mail a AU MOINS UNE proposition à confirmer ou à rejeter → un clic suffit ;
 *   · `sansCandidat` = le programme n'a rien trouvé à proposer → il faut aller chercher la cible à la main.
 * Additionnés, ils annonçaient près de six fois le travail réellement décidable. Un compteur qui exagère est pire
 * qu'aucun compteur : on cesse de le regarder.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 CE FICHIER A CHANGÉ DE SUJET LE 09/10/2026, ET IL FAUT DIRE POURQUOI ═══════════════════════════════════
 *
 * Il montait l'écran entier pour vérifier l'ENTRÉE « À rattacher » de la colonne de la boîte : son nombre, son
 * info-bulle, son comportement sans schéma. Cette entrée a été RETIRÉE au lot
 * RACCOURCI-EVENEMENTS-ACCUEIL-GESTION-ET-LIGNE-DE-FILTRES, avec l'accord explicite d'Arno (« RETIRER le bouton
 * “À rattacher 16706” de cette colonne »), et remplacée par le raccourci « Événements ». Quatre cas éprouvaient
 * donc un élément qui n'existe plus.
 *
 * 🔒 MAIS LA RÈGLE QU'ILS PROTÉGEAIENT, ELLE, N'A PAS DISPARU — elle a seulement changé d'écran. C'est
 * maintenant `FileATrier` qui porte les deux nombres, et c'est lui qu'on garde ici : les deux populations
 * restent SÉPARÉES et NOMMÉES, et leur somme ne s'affiche jamais comme un travail à faire. Supprimer ce
 * fichier aurait rendu la leçon du 27/09 à l'oubli ; c'est précisément ce que le dépôt s'interdit.
 *
 * ⚠️ ET LA FONCTION N'EST PAS PERDUE : l'écran « À rattacher » garde DEUX chemins — le bouton de la barre
 * d'actions (rendue sur l'écran partagé, les événements, l'annuaire et l'historique) et l'adresse directe
 * `?ecran=a_trier`. Les deux sont vérifiés plus bas.
 */

const FILE = readFileSync('app/(admin)/admin/(protected)/gestion/FileATrier.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const PLEIN = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');

describe('🔴 « À rattacher » : les deux populations restent séparées', () => {
  /**
   * 🔴🔴 LE TITRE DIT « 3 261 », ET « + 15 847 sans candidat » À CÔTÉ — jamais 19 108. C'est exactement la
   * correction du 27/09, et elle vit désormais dans l'écran de la file.
   */
  it('🔴🔴 le titre de la file sépare « à trier » et « sans candidat »', () => {
    expect(FILE).toContain('À trier <span className="gst-compte">{data.totaux.aTrier}</span>');
    expect(FILE).toContain('{data.totaux.sansCandidat} sans candidat');
    /* 🔴 LA LIGNE DE CHIFFRES LES NOMME TOUS LES TROIS, en clair, sans jamais les additionner pour le lecteur. */
    expect(FILE).toContain('{data.totaux.aTrier} à départager');
  });

  /**
   * ⚠️ LA SEULE SOMME QUI SUBSISTE EST CELLE DU FILTRE « Tous », et c'est juste : elle dit combien de LIGNES
   * cet onglet montre, pas combien de travail attend. Le distinguer est tout l'objet de la correction.
   */
  it('⚠️ la somme ne sert qu’à compter les lignes de l’onglet « Tous »', () => {
    expect(FILE).toContain("const totalDuFiltre = issue === 'a_trier' ? data.totaux.aTrier");
    expect(FILE).toContain('data.totaux.aTrier + data.totaux.sansCandidat;');
  });
});

describe('🔴🔴 l’écran « À rattacher » garde ses chemins après le retrait de l’entrée', () => {
  /**
   * 🔴🔴 CE QUI EST RETIRÉ DOIT EXISTER AILLEURS, ET ON LE PROUVE (règle du dépôt). Deux chemins, vérifiés
   * avant le retrait et figés ici pour qu'un lot suivant ne retire pas le dernier sans s'en apercevoir.
   */
  it('🔴🔴 ① le bouton de la barre d’actions mène toujours à la file', () => {
    expect(VUE).toContain("aller({ ...ETAT_DEFAUT, ecran: 'a_trier' })");
    expect(VUE).toContain('À rattacher');
    /* ⚠️ ET IL N'EST MASQUÉ QUE SUR L'ÉCRAN QU'IL OUVRE : partout ailleurs, il est là. */
    expect(VUE).toContain("{ecran !== 'a_trier' && (");
  });

  /** 🔴 ② L'ADRESSE DIRECTE : `a_trier` reste un écran connu de l'adresse, donc copiable et rechargeable. */
  it('🔴 ② l’adresse `?ecran=a_trier` reste valide', () => {
    const URL = readFileSync('app/lib/gestion/ecranUrl.ts', 'utf8');
    expect(URL).toContain("'a_trier'");
    expect(VUE).toContain("ecran === 'a_trier' ?");
  });

  /** 🔴 ET L'ENTRÉE DE LA COLONNE A BIEN CÉDÉ SA PLACE À « Événements », au même endroit. */
  it('🔴🔴 la colonne porte « Événements » à la place exacte', () => {
    expect(PLEIN).not.toContain('<span className="cm-texte">À rattacher</span>');
    expect(PLEIN).toContain('<span className="cm-nom"><span className="cm-texte">Événements</span></span>');
    /* 🔴 ET SON COMPTEUR DIT LES ÉVÉNEMENTS EN COURS, pas leur total (Arno). */
    expect(PLEIN).toContain('{evenementsOuverts !== null && <span className="gst-compte">{evenementsOuverts}</span>}');
    expect(VUE).toContain('evenementsOuverts={d.evenementsOuverts}');
  });
});
