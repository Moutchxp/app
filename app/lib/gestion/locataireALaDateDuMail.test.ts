import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  motAujourdhui, motSansLocataire, occupantsAujourdhuiADire, type OccupantDuJour,
} from './ficheRattachement';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — LE LOCATAIRE À LA DATE DU MAIL AFFICHÉ ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026), prise sur l'audit : « la fenêtre et l'historique nomment le locataire en place à la
 * date du MAIL AFFICHÉ (enTete.recuLe), et non celui du dernier mail de la conversation. Si l'occupant
 * d'aujourd'hui est différent, ajoute une petite ligne discrète “Aujourd'hui : <nom>” avec sa fiche annuaire.
 * Vacant à la date → “Vacant à cette date”. Vérifie le cas fil 36475 / message 57119. »
 *
 * ═══ 🔴🔴 CE QUE L'AUDIT A MESURÉ, ET QUE CE POINT CORRIGE ═══════════════════════════════════════════════════════
 *
 * La fenêtre cherchait l'occupant à la date du mail LE PLUS RÉCENT de l'échange portant ce bien — les liens étant
 * triés `recu_le DESC`, c'était la première date rencontrée. Ouverte sur un mail ANCIEN d'une conversation qui
 * traverse un changement de locataire, elle nommait donc l'occupant de la FIN de la conversation.
 *
 * 🔴 CHIFFRE EXACT : **89** couples (mail, bien) sur 11 706 nommaient la mauvaise personne. Dont le cas d'Arno —
 * fil 36475 / message 57119, bien 315 : au 28/09/2026 le logement était occupé par « LEON GUIMAREY DI FIORE
 * Isabella et Hugo », et la fenêtre écrivait « Vacant à cette date (29/09/2026) » — une date qui n'était même pas
 * celle du mail affiché, mais celle du dernier mail de l'échange.
 *
 * ⚠️ CE FICHIER N'A PAS DE BASE. Il éprouve la DÉCISION (pure) et fige les deux lignes de code du dépôt qui
 * choisissent la date. Le reste — que la fenêtre nomme bien la bonne personne sur les 11 706 couples — est éprouvé
 * par le script d'audit, qui recompte tout en lecture seule et que ce point relance.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const occupant = (cle: string, nom: string, id: number | null = 7): OccupantDuJour => ({ cle, id, nom });

describe('🔴🔴 ① « Aujourd’hui » ne se dit que quand ça a changé', () => {
  /**
   * 🔴🔴 LE CAS LE PLUS FRÉQUENT EST LE SILENCE, et c'est l'assertion qui protège la fenêtre du bruit : sur
   * 11 706 couples, 89 ont changé d'occupant. Une ligne systématique répéterait 11 617 fois ce qui est déjà écrit
   * juste au-dessus.
   */
  it('🔴🔴 même occupant ⇒ rien à ajouter', () => {
    expect(occupantsAujourdhuiADire([{ cle: 'L1' }], [occupant('L1', 'DI FIORE Isabella')])).toBeNull();
    /* L'ORDRE NE COMPTE PAS : une colocation rendue dans l'autre sens est la même colocation. */
    expect(occupantsAujourdhuiADire(
      [{ cle: 'L1' }, { cle: 'L2' }], [occupant('L2', 'B'), occupant('L1', 'A')],
    )).toBeNull();
    /* VACANT À LA DATE ET VACANT AUJOURD'HUI : rien n'a changé, donc rien à dire. */
    expect(occupantsAujourdhuiADire([], [])).toBeNull();
  });

  /**
   * 🔴🔴 LA COMPARAISON PORTE SUR LES CLÉS, JAMAIS SUR LES NOMS. Un ré-import WIPPIMMO retouche l'orthographe
   * (casse, accents, « Représentée par M. X ») sans changer la clé : comparer les noms ferait surgir la ligne
   * « Aujourd'hui » sur un simple changement de casse, ce qui ferait croire à un changement de locataire.
   */
  it('🔴🔴 un nom réécrit n’est pas un changement de locataire', () => {
    expect(occupantsAujourdhuiADire([{ cle: 'L1' }], [occupant('L1', 'DI FIORE ISABELLA')])).toBeNull();
  });

  it('🔴 occupant différent ⇒ on l’ajoute', () => {
    expect(occupantsAujourdhuiADire([{ cle: 'L1' }], [occupant('L9', 'BLACHE Romain', 42)]))
      .toEqual([{ cle: 'L9', id: 42, nom: 'BLACHE Romain' }]);
  });

  /**
   * 🔴🔴 UN TABLEAU VIDE N'EST PAS « RIEN À DIRE ». Il veut dire « plus personne aujourd'hui », c'est-à-dire que
   * le locataire du mail est parti — exactement l'information qu'on vient chercher avant de décrocher le
   * téléphone. Le confondre avec `null` tairait le départ.
   */
  it('🔴🔴 parti depuis ⇒ « Aujourd’hui : vacant »', () => {
    const a = occupantsAujourdhuiADire([{ cle: 'L1' }], []);
    expect(a).toEqual([]);
    expect(motAujourdhui(a ?? [])).toBe('Aujourd’hui : vacant');
  });

  /**
   * ⚠️ `undefined` NE VEUT PAS DIRE « VACANT ». Une page ouverte avant la mise en service reçoit une réponse sans
   * le champ ; la traiter comme une liste vide écrirait « Aujourd'hui : vacant » sur un logement habité. Faute de
   * savoir, on se TAIT — règle du module (« rien n'est inventé »).
   */
  it('⚠️ champ absent ⇒ silence, jamais « vacant »', () => {
    expect(occupantsAujourdhuiADire([{ cle: 'L1' }], undefined)).toBeNull();
    expect(occupantsAujourdhuiADire([], undefined)).toBeNull();
  });

  it('🔴 arrivé depuis ⇒ on le nomme, même si le mail était sur un logement vide', () => {
    expect(occupantsAujourdhuiADire([], [occupant('L9', 'TATA CONSULTANCY', 3)]))
      .toEqual([{ cle: 'L9', id: 3, nom: 'TATA CONSULTANCY' }]);
    expect(motAujourdhui([occupant('L9', 'TATA CONSULTANCY', 3)])).toBe('Aujourd’hui : TATA CONSULTANCY');
  });

  it('🔴 une colocation se dit en entier, séparée par des virgules', () => {
    expect(motAujourdhui([occupant('A', 'MARTIN Léa'), occupant('B', 'NGUYEN Thi')]))
      .toBe('Aujourd’hui : MARTIN Léa, NGUYEN Thi');
  });
});

describe('🔴🔴 ② la date qui décide est celle du mail affiché', () => {
  const REPO = readFileSync('app/lib/gestion/ficheRattachementRepo.ts', 'utf8');

  /**
   * 🔴🔴 C'EST L'ASSERTION QUI CORRIGE LES 89 CAS. La date de résolution vient de `enTete.recuLe` — l'en-tête du
   * mail dont la fenêtre PARLE — et non plus de `l.date_mail`, la date du lien le plus récent.
   */
  it('🔴🔴 la date vient de `enTete.recuLe`, pas du lien le plus récent', () => {
    expect(REPO).toContain("const dateAffichee = enTete === null ? null : enTete.recuLe.slice(0, 10);");
    expect(REPO).toContain('if (!dateParCle.has(cle)) dateParCle.set(cle, dateAffichee ?? l.date_mail);');
  });

  /**
   * 🔴 UNE SEULE DATE POUR TOUTE LA FENÊTRE. La fenêtre porte sur UN mail (lot VISUALISER-UNIFIE) : « à cette
   * date » ne peut pas désigner six dates différentes dans une même fenêtre à six biens.
   */
  it('🔴 la même date pour tous les biens de la fenêtre', () => {
    /* La boucle ne consulte plus `l.date_mail` qu'en REPLI — donc une seule fois, après le `??`. */
    expect((REPO.match(/l\.date_mail/g) ?? [])).toHaveLength(1);
  });

  /**
   * 🔴🔴 « AUJOURD'HUI » EST UN JOUR DE PARIS, pas de l'horloge du serveur. Un bail qui finit le 31 ne doit pas se
   * lire fini le 30 parce que la machine pense en UTC — la même précaution que l'heure du bandeau.
   */
  it('🔴🔴 « aujourd’hui » se lit à Paris', () => {
    expect(REPO).toContain("(now() AT TIME ZONE 'Europe/Paris')::date");
    expect(REPO).not.toContain('current_date');
  });

  /**
   * ⚠️ UNE SEULE REQUÊTE POUR LES DEUX DATES. La boucle fait déjà un aller-retour par lot : une requête de plus
   * en aurait fait douze pour une fenêtre à six biens. Les deux appartenances sont rendues en COLONNES.
   */
  it('⚠️ les deux dates dans la même requête, en colonnes', () => {
    expect(REPO).toContain('AS a_la_date');
    expect(REPO).toContain('AS aujourdhui');
    expect(REPO).toContain('rows.filter((r) => r.a_la_date)');
    expect(REPO).toContain('rows.filter((r) => r.aujourdhui)');
  });
});

describe('🔴 ③ les mots inchangés', () => {
  /**
   * 🔴 « VACANT À CETTE DATE » NE CHANGE PAS D'UN CARACTÈRE. Arno a validé ce mot ; le point 2 corrige QUELLE date
   * est prise, pas ce qui est écrit. On le fige donc pour qu'une retouche de confort ne passe pas inaperçue.
   */
  it('🔴 « Vacant à cette date (JJ/MM/AAAA) »', () => {
    expect(motSansLocataire('2026-09-28')).toBe('Vacant à cette date (28/09/2026)');
    expect(motSansLocataire(null)).toBe('Vacant (aucune date de mail connue)');
  });

  /**
   * ⚠️ LA LIGNE EST DISCRÈTE PAR LA FEUILLE DE STYLE, pas par une couleur en dur : `.rdf-aujourdhui` n'apporte
   * qu'un demi-cran d'air, et la couleur reste celle de `.rdf-detail`, qui bascule seule en Clair et en Sombre.
   */
  it('⚠️ la ligne « Aujourd’hui » n’a pas de couleur à elle', () => {
    const vue = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(vue).toContain('.rdf-aujourdhui{margin-top:.15rem}');
    expect(vue).toContain('<p className="rdf-detail rdf-aujourdhui">');
    /* 🔴 ET ELLE MÈNE À LA FICHE ANNUAIRE, comme Arno l'a demandé — quand cette fiche existe. */
    expect(vue).toContain("adresseFicheAnnuaire({ role: 'locataire', id: o.id })");
  });
});
