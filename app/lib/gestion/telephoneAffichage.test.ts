import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normaliserTelephone } from './annuaire';
import {
  TYPES_COORDONNEE, chiffresTelephone, formaterSaisieTelephone, formaterTelephone, lignesParType, motType,
  sorteDuType, typeDeLibelle,
} from './telephoneAffichage';

/**
 * LOT FICHES-RETOUCHES — DES NUMÉROS LISIBLES, ET UNE NOMENCLATURE UNIQUE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE. Un numéro se lit à voix haute, se recopie, se compose. « +33659088256 » ne se fait
 * aucune de ces trois choses. Mais le reformater a un prix : si la forme affichée remontait jusqu'aux COMPARAISONS,
 * un espace suffirait à créer un doublon dans l'annuaire, ou une fausse divergence dans le rapport de l'import.
 * Ces épreuves tiennent les deux bouts : la forme lue change, la forme comparée jamais.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('afficher un numéro', () => {
  it('🔴 un numéro français national se lit par paires : « 06 59 08 82 56 »', () => {
    expect(formaterTelephone('+33659088256', '0659088256')).toBe('06 59 08 82 56');
    expect(formaterTelephone('+33659088256', '06 59 08 82 56')).toBe('06 59 08 82 56');
    expect(formaterTelephone('+33659088256', '06.59.08.82.56')).toBe('06 59 08 82 56');
    expect(formaterTelephone('+33659088256', '06-59-08-82-56')).toBe('06 59 08 82 56');
  });

  /**
   * 🔴 ON SUIT L'ÉCRITURE D'ORIGINE. Un numéro écrit « +33 6 59… » a été VOULU international (carte de visite,
   * correspondant à l'étranger) : le ramener au national effacerait une information que personne n'a demandé
   * d'effacer.
   */
  it('🔴 un numéro écrit en international le reste : « +33 6 59 08 82 56 »', () => {
    expect(formaterTelephone('+33659088256', '+33659088256')).toBe('+33 6 59 08 82 56');
    expect(formaterTelephone('+33659088256', '+33 6 59 08 82 56')).toBe('+33 6 59 08 82 56');
    // « 0033… » est la même écriture internationale, à la française.
    expect(formaterTelephone('+33659088256', '0033659088256')).toBe('+33 6 59 08 82 56');
  });

  it('un 01 (fixe) se groupe exactement comme un 06', () => {
    expect(formaterTelephone('+33147838294', '0147838294')).toBe('01 47 83 82 94');
  });

  /**
   * ⚠️ MESURÉ LE 29/09/2026 : 78 des 803 numéros de la base sont étrangers (+212, +216, +237, +34, +39, +351, +1…).
   * Les regrouper par deux à l'aveugle donnerait « +2 12 66 16 54 06 7 », qui n'est la convention d'aucun pays.
   */
  it('🔴 un numéro étranger est rendu TEL QU’IL A ÉTÉ ÉCRIT, avec ses espaces', () => {
    expect(formaterTelephone('+212661654067', '+212 661 654 067')).toBe('+212 661 654 067');
    expect(formaterTelephone('+34660632618', '+34 660 632 618')).toBe('+34 660 632 618');
    expect(formaterTelephone('+14754595709', '+1 475 459 5709')).toBe('+1 475 459 5709');
  });

  it('sans écriture d’origine, un étranger garde sa forme canonique — on n’invente pas un découpage', () => {
    expect(formaterTelephone('+212661654067', '')).toBe('+212661654067');
    expect(formaterTelephone('+212661654067', null)).toBe('+212661654067');
  });

  /**
   * 🔴 UN NUMÉRO ILLISIBLE N'EST JAMAIS AVALÉ. Une ligne de la base porte deux numéros collés (importée d'une
   * cellule « … - … ») : elle s'affiche telle quelle plutôt que découpée en paires qui ne voudraient rien dire.
   */
  it('🔴 ce qui n’est pas un numéro reste affiché tel quel, jamais vidé', () => {
    expect(formaterTelephone('+351932472464351934722745', '+351 932 472 464 - +351 934 722 745'))
      .toBe('+351 932 472 464 - +351 934 722 745');
    expect(formaterTelephone(null, 'poste 42')).toBe('poste 42');
    expect(formaterTelephone('', '')).toBe('');
  });

  it('le canonique peut être déduit de l’écriture quand il manque', () => {
    expect(formaterTelephone(null, '0659088256')).toBe('06 59 08 82 56');
  });
});

describe('les chiffres, et rien d’autre — la forme sur laquelle on COMPARE', () => {
  /**
   * ══ 🔴🔴 LA GARANTIE CENTRALE DU LOT ════════════════════════════════════════════════════════════════════════
   *
   * Arno : « Stockage et comparaisons […] sur les CHIFFRES seulement, pour qu'un espace ne crée jamais de fausse
   * divergence ni de doublon. » Quatre écritures d'un même numéro doivent donner UNE seule forme canonique — et
   * c'est cette forme, jamais celle qu'on affiche, qui sert à comparer.
   */
  it('🔴 quatre écritures d’un même numéro donnent LE MÊME canonique', () => {
    const formes = ['0659088256', '06 59 08 82 56', '06.59.08.82.56', '+33 6 59 08 82 56', '0033659088256'];
    const canoniques = new Set(formes.map((f) => normaliserTelephone(f)));
    expect(canoniques).toEqual(new Set(['+33659088256']));
  });

  it('🔴 le formatage d’affichage ne change PAS le canonique — sinon un espace ferait un doublon', () => {
    const affiche = formaterTelephone('+33659088256', '0659088256');
    expect(affiche).toBe('06 59 08 82 56');
    expect(normaliserTelephone(affiche)).toBe('+33659088256');
    // Et le tour complet est stable : afficher, relire, réafficher ne dérive pas.
    expect(formaterTelephone(normaliserTelephone(affiche), affiche)).toBe(affiche);
  });

  it('les chiffres seuls ignorent espaces, points, tirets, parenthèses et le « + »', () => {
    for (const f of ['06 59 08 82 56', '06.59.08.82.56', '(06) 59-08-82-56']) {
      expect(chiffresTelephone(f)).toBe('0659088256');
    }
    expect(chiffresTelephone('+33 6 59 08 82 56')).toBe('33659088256');
    expect(chiffresTelephone(null)).toBe('');
  });
});

describe('formater pendant la frappe', () => {
  it('un numéro national se met en paires, au fur et à mesure', () => {
    expect(formaterSaisieTelephone('0')).toBe('0');
    expect(formaterSaisieTelephone('06')).toBe('06');
    expect(formaterSaisieTelephone('065')).toBe('06 5');
    expect(formaterSaisieTelephone('0659')).toBe('06 59');
    expect(formaterSaisieTelephone('0659088256')).toBe('06 59 08 82 56');
  });

  it('les points et les tirets sont acceptés, et deviennent des espaces', () => {
    expect(formaterSaisieTelephone('06.59.08.82.56')).toBe('06 59 08 82 56');
    expect(formaterSaisieTelephone('06-59-08-82-56')).toBe('06 59 08 82 56');
  });

  it('« +33 » et « 0033 » donnent la forme internationale, indicatif détaché', () => {
    expect(formaterSaisieTelephone('+33659088256')).toBe('+33 6 59 08 82 56');
    expect(formaterSaisieTelephone('0033659088256')).toBe('+33 6 59 08 82 56');
    expect(formaterSaisieTelephone('+336')).toBe('+33 6');
    expect(formaterSaisieTelephone('+33')).toBe('+33');
  });

  /**
   * 🔴 ON NE FORMATE QUE CE QU'ON RECONNAÎT. Reformater un indicatif étranger, c'est imposer un découpage qu'aucun
   * pays n'emploie ; reformater une note, c'est empêcher de taper ce qu'on veut.
   */
  it('🔴 un indicatif étranger ou un texte libre est rendu INCHANGÉ', () => {
    expect(formaterSaisieTelephone('+212 661 654 067')).toBe('+212 661 654 067');
    expect(formaterSaisieTelephone('+1 475 459 5709')).toBe('+1 475 459 5709');
    expect(formaterSaisieTelephone('poste 42')).toBe('poste 42');
    expect(formaterSaisieTelephone('')).toBe('');
    expect(formaterSaisieTelephone('   ')).toBe('   ');
  });

  it('ce que la frappe produit reste lisible par la normalisation', () => {
    expect(normaliserTelephone(formaterSaisieTelephone('0659088256'))).toBe('+33659088256');
    expect(normaliserTelephone(formaterSaisieTelephone('+33659088256'))).toBe('+33659088256');
  });
});

describe('la nomenclature Mobile / Fixe / E-mail', () => {
  it('🔴 la liste est FERMÉE, et porte trois types — pas un de plus', () => {
    expect(TYPES_COORDONNEE.map((t) => t.type)).toEqual(['mobile', 'fixe', 'email']);
    expect(TYPES_COORDONNEE.map((t) => t.mot)).toEqual(['Mobile', 'Fixe', 'E-mail']);
  });

  it('le type porte la SORTE — il n’existe pas de « Mobile » de sorte e-mail', () => {
    expect(sorteDuType('mobile')).toBe('telephone');
    expect(sorteDuType('fixe')).toBe('telephone');
    expect(sorteDuType('email')).toBe('email');
    expect(motType('fixe')).toBe('Fixe');
  });

  /**
   * ══ 🔴🔴 LES LIBELLÉS IMPORTÉS DE WIPPIMMO, RANGÉS — À L'AFFICHAGE SEULEMENT ════════════════════════════════
   *
   * Arno : « Mobile* → Mobile, Téléphone* / Fixe* → Fixe, Email* → E-mail. Seulement à l'affichage : ne réécris
   * rien en base sans me demander. »
   *
   * ⚠️ MESURÉ LE 29/09/2026 sur les 1 793 coordonnées : « Mobile » (631), « Mobile 1..4 » (172), « Email » (637),
   * « Email 1..4 » (355), et deux sans libellé. AUCUN libellé ne tombe hors des trois types.
   */
  it('🔴 les libellés réellement présents dans la base se rangent tous', () => {
    for (const l of ['Mobile', 'Mobile 1', 'Mobile 2', 'Mobile 3', 'Mobile 4']) {
      expect(typeDeLibelle(l, 'telephone')).toEqual({ type: 'mobile', mot: 'Mobile' });
    }
    for (const l of ['Email', 'Email 1', 'Email 2', 'Email 3', 'Email 4']) {
      expect(typeDeLibelle(l, 'email')).toEqual({ type: 'email', mot: 'E-mail' });
    }
  });

  it('« Téléphone 2 » et « Fixe » deviennent Fixe — c’est le choix d’Arno, pas une déduction', () => {
    expect(typeDeLibelle('Téléphone 2', 'telephone')).toEqual({ type: 'fixe', mot: 'Fixe' });
    expect(typeDeLibelle('telephone', 'telephone')).toEqual({ type: 'fixe', mot: 'Fixe' });
    expect(typeDeLibelle('Fixe 1', 'telephone')).toEqual({ type: 'fixe', mot: 'Fixe' });
  });

  it('sans libellé, la SORTE tranche — elle, elle ne ment pas', () => {
    expect(typeDeLibelle(null, 'telephone').mot).toBe('Mobile');
    expect(typeDeLibelle('', 'email').mot).toBe('E-mail');
  });

  /** 🔴 UN LIBELLÉ HORS NOMENCLATURE RESTE AFFICHÉ TEL QUEL : on ne le range pas de force dans une case fausse. */
  it('🔴 un libellé qu’aucun type ne couvre est rendu tel quel, et signalé comme non rangé', () => {
    expect(typeDeLibelle('Télécoms', 'telephone')).toEqual({ type: null, mot: 'Télécoms' });
    expect(typeDeLibelle('Standard usine', 'telephone')).toEqual({ type: null, mot: 'Standard usine' });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES GARANTIES D'ÉCRAN — CE QU'AUCUNE FONCTION PURE NE PEUT TENIR
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la saisie : deux cases, un type fermé, une valeur large', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');

  it('🔴 la 3e case (libellé libre) n’existe plus', () => {
    expect(src).not.toContain('cp-saisie--libelle');
    expect(src).not.toContain('aria-label="Libellé"');
  });

  it('🔴 la 1re case est le TYPE, alimentée par la liste fermée', () => {
    expect(src).toContain('aria-label="Type de coordonnée"');
    expect(src).toContain('{TYPES_COORDONNEE.map(');
    // Aucune liste d'options écrite à la main : deux vocabulaires finiraient par diverger.
    expect(src).not.toContain('<option value="telephone">');
  });

  it('🔴 « + Téléphone » ajoute un MOBILE présélectionné, « + E-mail » un e-mail', () => {
    expect(src).toContain("type: 'mobile' as TypeCoordonnee");
    expect(src).toContain("type: 'email' as TypeCoordonnee");
  });

  /** 🔴 LA VALEUR PREND LA PLACE LIBÉRÉE : c'est la case qu'on relit avant d'enregistrer. */
  it('🔴 la grille de la ligne passe de trois cases à deux, la valeur en `1fr`', () => {
    expect(src).toContain('.cp-coord-edit{display:grid;grid-template-columns:minmax(0,6rem) minmax(0,1fr)');
    expect(src).toContain('.cp-coord-edit{grid-template-columns:6rem minmax(0,1fr) auto}');
  });

  /**
   * ⚠️ LE FORMATAGE PENDANT LA FRAPPE NE S'APPLIQUE QUE SI LE CURSEUR EST AU BOUT. Sans ce garde, corriger un
   * chiffre au milieu du champ renverrait le curseur à la fin à chaque touche — le défaut classique de ces
   * champs, et celui qui les rend inutilisables.
   */
  it('🔴 le champ formate pendant la frappe, sans déplacer le curseur d’une correction', () => {
    expect(src).toContain('formaterSaisieTelephone');
    expect(src).toContain('champ.selectionStart === champ.value.length');
  });

  it('🔴 le type redevient `sorte` + `libelle` à l’envoi — le serveur n’apprend pas de vocabulaire', () => {
    expect(src).toContain('sorte: sorteDuType(l.type), valeur: l.valeur, libelle: motType(l.type)');
  });

  it('les capsules de la fiche suivent la nomenclature', () => {
    expect(src).toContain('typeDeLibelle(c.libelle, c.sorte).mot');
  });
});

describe('🔴 la carte de bien : « Historique » puis deux boutons de même largeur', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  /**
   * ══ 🔴🔴 LA DEMANDE D'ARNO, MOT POUR MOT ════════════════════════════════════════════════════════════════════
   * « “Fiche du locataire →” et “Dossier Drive du lot ↗” […] deviennent deux BOUTONS côte à côte sur la même
   * ligne, de même hauteur et de même largeur, avec la même présentation que le bouton “Dossier Drive ↗” de
   * l'en-tête. […] “Historique” […] DANS chaque carte de bien, sur toute la largeur, AU-DESSUS des deux boutons. »
   */
  it('🔴 ce ne sont plus des liens soulignés, mais les boutons de la charte', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const pied = carte.slice(carte.indexOf('ann-carte-pied'));
    // Le bouton de l'en-tête et ceux de la carte portent EXACTEMENT les mêmes classes de charte.
    expect((pied.match(/svv-btn svv-btn-outline gst-btn/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(pied).not.toContain('className="ann-lien"');
  });

  it('🔴 « Historique » est AU-DESSUS, sur toute la largeur', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const pied = carte.slice(carte.indexOf('ann-carte-pied'));
    expect(pied.indexOf('Historique')).toBeGreaterThan(0);
    expect(pied.indexOf('Historique')).toBeLessThan(pied.indexOf('ann-carte-duo'));
    expect(pied).toContain('ann-carte-bouton--large');
  });

  /** 🔴 « MÊME LARGEUR » SE TIENT PAR UNE GRILLE, pas par un flex qui donnerait à chacun la largeur de son texte. */
  it('🔴 les deux boutons du bas sont dans une grille de colonnes égales', () => {
    expect(src).toContain('.ann-carte-duo{display:grid;grid-template-columns:1fr 1fr');
    // Un seul des deux ? Il prend toute la ligne : une demi-ligne vide se lirait comme un bouton manquant.
    expect(src).toContain('.ann-carte-duo:has(> :only-child){grid-template-columns:1fr}');
  });

  it('🔴 « Historique » ouvre la fiche DE CE BIEN, posée sur sa « vie du bien »', () => {
    expect(src).toContain('onHistoriqueDuBien');
    expect(src).toContain('const ouvrirVieDuBien');
    expect(src).toContain('poserSurVieDuBien');
    expect(src).toContain("ancreVie.current?.scrollIntoView({ block: 'start' })");
  });

  /**
   * ══ 🔴 L'HISTORIQUE COMPLET DU PROPRIÉTAIRE : GARDÉ, MAIS SEULEMENT QUAND IL N'EST PAS REDONDANT ═══════════
   *
   * Mesuré le 29/09/2026 : sur 32 938 rattachements confirmés, TOUS visent un lot, AUCUN un propriétaire.
   * L'historique d'un propriétaire est donc exactement l'union de ceux de ses biens. À un seul bien, le lien
   * rendrait mot pour mot la même liste que le bouton de l'unique carte.
   */
  it('🔴 le lien « tous biens confondus » n’apparaît qu’au-delà d’un bien', () => {
    expect(src).toContain('f.biens.length > 1 && onHistorique !== undefined');
    expect(src).toContain('Historique, tous biens confondus');
    // Et l'ancien bouton du bas de page a bien disparu de la fiche propriétaire.
    const vue = src.slice(src.indexOf('function VueProprietaire'), src.indexOf('function BoutonDepart'));
    expect(vue).not.toContain("cible={{ sorte: 'proprietaire'");
  });
});

describe('🔴 le numéro affiché par l’app l’est partout de la même façon', () => {
  /**
   * 🔴 LES QUATRE DÉPÔTS QUI FABRIQUENT UN NUMÉRO AFFICHÉ le font par la MÊME fonction. Si un seul y échappait,
   * le même numéro se lirait de deux façons selon l'écran — et l'on se demanderait lequel est le bon.
   */
  it('les fiches, le classement, la recherche et le bandeau passent tous par `formaterTelephone`', () => {
    for (const f of [
      'app/lib/gestion/annuaireRepo.ts',        // les trois fiches de l'annuaire
      'app/lib/gestion/classementBien.ts',      // le bloc des parties, dans la modale de classement
      'app/lib/gestion/ficheRattachementRepo.ts', // le bandeau « Rattaché à »
      'app/lib/gestion/rechercheBienRepo.ts',   // la recherche d'un bien
    ]) {
      expect(readFileSync(f, 'utf8')).toContain('formaterTelephone');
    }
  });

  /**
   * 🔴🔴 ON NE TOUCHE PAS AU TEXTE DES MAILS. Un numéro cité dans le corps d'un message est le texte de son
   * expéditeur : le reformater serait réécrire ce que quelqu'un a écrit. Aucun module de lecture de mail ne
   * connaît ce formateur.
   */
  it('🔴 aucun module qui rend le CORPS d’un mail n’importe le formateur', () => {
    for (const f of [
      'app/lib/gestion/htmlMail.ts',
      'app/lib/gestion/corpsMail.ts',
      'app/(admin)/admin/(protected)/gestion/Conversation.tsx',
    ]) {
      let src: string;
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      expect(src).not.toContain('formaterTelephone');
      expect(src).not.toContain('telephoneAffichage');
    }
  });

  /** ⚠️ LE LIEN `tel:` NE PORTE JAMAIS D'ESPACES : il part de la forme canonique, jamais de l'affichage. */
  it('🔴 le lien `tel:` est construit sur la valeur canonique', () => {
    const cartes = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(cartes).toContain('href={`tel:${c.valeur}`}');
    /* ⚠️ RÉÉCRIT (lot CONTACT-LIGNES) : les deux listes (téléphones, e-mails) ont fusionné en une seule, pour
       que le regroupement par type puisse décider de l'ordre. La variable s'appelle donc `c` et non `t` — la
       règle, elle, est intacte : le lien part de la forme CANONIQUE, l'écran montre la forme LUE. */
    const props = readFileSync('app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx', 'utf8');
    expect(props).toContain('lienTelephone(c.valeur)');
    expect(props).toContain('{c.affichage}');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT CONTACT-LIGNES — LE TYPE DANS LE TITRE, ÉCRIT UNE SEULE FOIS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 regrouper les coordonnées par type', () => {
  const c = (sorte: 'telephone' | 'email', libelle: string | null, valeur: string) => ({ sorte, libelle, valeur });

  /**
   * ══ 🔴🔴 LA RÈGLE D'ARNO, MOT POUR MOT ══════════════════════════════════════════════════════════════════════
   * « Plusieurs numéros du même type : le titre n'apparaît qu'une fois, en face du premier. »
   */
  it('🔴 le titre n’est écrit qu’une fois, en face du premier de son groupe', () => {
    const lignes = lignesParType([
      c('telephone', 'Mobile 1', 'a'), c('telephone', 'Mobile 2', 'b'), c('email', 'Email 1', 'c'),
    ]);
    expect(lignes.map((l) => l.titre)).toEqual(['Mobile', null, 'E-mail']);
    expect(lignes.map((l) => l.contact.valeur)).toEqual(['a', 'b', 'c']);
  });

  /**
   * 🔴 LES GROUPES SE SUIVENT, ET DANS UN ORDRE FIXE : Mobile, Fixe, E-mail. Sans regroupement, une liste
   * mobile / fixe / mobile écrirait « MOBILE » deux fois — ce qui se lirait comme deux blocs distincts.
   */
  it('🔴 les groupes sont rangés Mobile, Fixe, E-mail — et jamais entrelacés', () => {
    const lignes = lignesParType([
      c('email', 'Email 1', 'mail'), c('telephone', 'Fixe', 'fixe'), c('telephone', 'Mobile', 'mob1'),
      c('telephone', 'Mobile 2', 'mob2'),
    ]);
    expect(lignes.map((l) => [l.titre, l.contact.valeur]))
      .toEqual([['Mobile', 'mob1'], [null, 'mob2'], ['Fixe', 'fixe'], ['E-mail', 'mail']]);
  });

  /**
   * ⚠️ L'ORDRE INTERNE D'UN GROUPE EST CONSERVÉ : c'est celui du rang, réglé à la main dans le mode Modifier
   * (lot FICHES-ANNUAIRE). On range les groupes, jamais les numéros d'un même groupe.
   */
  it('🔴 l’ordre voulu à la main est conservé DANS un groupe', () => {
    const lignes = lignesParType([
      c('telephone', 'Mobile', 'second'), c('telephone', 'Mobile', 'premier'),
    ]);
    expect(lignes.map((l) => l.contact.valeur)).toEqual(['second', 'premier']);
  });

  /** 🔴 UN LIBELLÉ HORS NOMENCLATURE FAIT SON PROPRE GROUPE, sous son intitulé d'origine. */
  it('🔴 un libellé hors nomenclature garde son mot, et passe après les trois types', () => {
    const lignes = lignesParType([
      c('telephone', 'Standard usine', 'x'), c('telephone', 'Mobile', 'y'), c('telephone', 'Standard usine', 'z'),
    ]);
    expect(lignes.map((l) => [l.titre, l.contact.valeur]))
      .toEqual([['Mobile', 'y'], ['Standard usine', 'x'], [null, 'z']]);
  });

  it('sans libellé, la sorte tranche — et les deux groupes restent distincts', () => {
    const lignes = lignesParType([c('email', null, 'a'), c('telephone', null, 'b')]);
    expect(lignes.map((l) => l.titre)).toEqual(['Mobile', 'E-mail']);
  });

  it('une liste vide ne rend rien', () => {
    expect(lignesParType([])).toEqual([]);
  });
});

describe('🔴 les tuiles de contact : titre | valeur | Copier', () => {
  /**
   * ══ 🔴🔴 OÙ VIVAIT LE MOTIF, ET OÙ IL A ÉTÉ CORRIGÉ ════════════════════════════════════════════════════════
   *
   * Constat d'Arno : « les petites capsules grises “Mobile” / “E-mail” sont en doublon avec le titre de la
   * ligne ; les deux boutons “Copier” doivent être justifiés à droite ; même chose sur toutes les tuiles de
   * contact concernées. » Cherchées une par une, elles étaient QUATRE :
   *   · `CartesPersonnes` — les cartes de propriétaires et d'occupants (fiches propriétaire, bien, locataire) ;
   *   · `Annuaire` (BlocOccupant) — l'historique des locataires, sur la fiche du bien ;
   *   · `PropositionsDeBiens` — le bloc des parties, dans la modale de classement ;
   *   · `RattachementsDuFil` — le bandeau « Rattaché à » de la modale Visualiser / Modifier.
   * Les quatre passent désormais par `lignesParType`, et les quatre collent leur « Copier » à droite.
   */
  it('🔴 les quatre tuiles regroupent par type', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx',
      'app/(admin)/admin/(protected)/gestion/Annuaire.tsx',
      'app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx',
      'app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx',
    ]) {
      expect(readFileSync(f, 'utf8'), f).toContain('lignesParType');
    }
  });

  /** 🔴 « COPIER » COLLÉ AU BORD DROIT, et la valeur tronquée plutôt que repliée — dans les quatre. */
  it('🔴 « Copier » est collé à droite, et la valeur est tronquée, jamais repliée', () => {
    const props = readFileSync('app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx', 'utf8');
    expect(props).toContain('.pdb-contact>.bcp{flex:0 0 auto;margin-left:auto}');
    expect(props).toContain('white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    // 🔴 PLUS DE `flex-wrap` : c'est lui qui faisait passer « Copier » à la ligne sous une adresse longue.
    expect(props).toContain('.pdb-contact{display:flex;flex-wrap:nowrap');

    const rdf = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(rdf).toContain('.rdf-contact>.bcp{flex:0 0 auto;margin-left:auto}');
    expect(rdf).toContain('.rdf-contact{display:flex;flex-wrap:nowrap');
    expect(rdf).toContain('white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  });

  /** ⚠️ LA CELLULE DE TITRE EXISTE MÊME VIDE : sans elle, la valeur remonterait d'une colonne. */
  it('🔴 la cellule de titre est rendue même quand le groupe est déjà titré', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx',
      'app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('aria-hidden="true" />');
    }
  });

  /** 🔴 L'INFOBULLE PORTE LE TEXTE ENTIER, et la copie part de la valeur — jamais de ce que l'écran a coupé. */
  it('🔴 une adresse tronquée garde son texte entier en infobulle, et sa copie intacte', () => {
    const rdf = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(rdf).toContain("title={c.sorte === 'email' ? c.valeur : c.affichage}");
    expect(rdf).toContain('<BoutonCopier valeur={c.affichage}');
    const props = readFileSync('app/(admin)/admin/(protected)/gestion/PropositionsDeBiens.tsx', 'utf8');
    expect(props).toContain("title={c.sorte === 'email' ? c.valeur : c.affichage}");
  });
});
