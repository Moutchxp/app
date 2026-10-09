import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formaterDateIso } from '../../../../lib/gestion/annuaireRecherche';

/**
 * ══ 🔴🔴 LOT CARTE-BIEN-DATE-ENTREE-LOCATAIRE (09/10/2026) ══════════════════════════════════════════════════════
 *
 * ARNO : « Sur le bloc vert “LOCATAIRE” de la carte d'un bien, ajouter sous le nom du locataire une ligne
 * “Entré(e) dans les lieux le JJ/MM/AAAA” (plus petite et plus discrète que le nom), seulement si le logement
 * n'est pas vacant ; avec plusieurs locataires actuels, afficher la date la plus ancienne ; si elle est inconnue,
 * “Entrée : non renseignée” en gris italique. »
 *
 * ══ 🔴🔴 LA SOURCE, ÉTABLIE EN LECTURE SEULE AVANT D'ÉCRIRE UNE LIGNE DE CODE ═══════════════════════════════════
 *
 * `gestion_annuaire_occupation.entree` — et c'est la SEULE qui existe : aucune table de bail dans le schéma,
 * aucune autre colonne de date d'entrée. Mesuré le 09/10/2026 sur la base locale : 317 occupations en cours
 * (`sortie IS NULL`, `absent_le IS NULL`), **317 avec une date, 0 sans**, de 1994-10-01 à 2026-09-21 ; et JAMAIS
 * deux occupations en cours pour un même lot. Le détail est dans
 * `app/.captures/carte-bien-date-entree-locataire/mesures.md`.
 *
 * 🔴 RIEN N'EST DÉDUIT. Arno l'interdit en toutes lettres (« pas de “premier mail reçu” »), et la branche
 * « non renseignée » existe pour ça : le jour où une occupation arrivera sans date, la carte le DIRA.
 */

const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');

/** Le SQL se lit par FRAGMENTS SÉMANTIQUES sur une chaîne aux blancs normalisés (convention du dépôt). */
const sql = (t: string): string => t.replace(/\s+/g, ' ');

describe('🔴🔴 la date lue est celle du bail en cours, et c’est la PLUS ANCIENNE', () => {
  /**
   * 🔴🔴 UN `min`, PAS LA DATE DE LA LIGNE QUI DONNE LE NOM. La lecture du NOM prend la plus RÉCENTE
   * (`ORDER BY o.entree DESC`) — c'est sa règle, posée bien avant ce lot. Arno demande, pour la DATE, la plus
   * ancienne. Les deux ne peuvent donc pas sortir de la même ligne.
   */
  it('🔴🔴 la date vient d’un min() sur les occupations en cours', () => {
    const q = sql(REPO.slice(REPO.indexOf('async function biensDuProprietaire')));
    expect(q).toContain('en.entree::text AS locataire_depuis');
    expect(q).toContain('SELECT min(o2.entree) AS entree FROM gestion_annuaire_occupation o2'
      + ' WHERE o2.lot_id = lo.id AND o2.sortie IS NULL');
  });

  /**
   * 🔴🔴 ET LE NOM AFFICHÉ N'A PAS BOUGÉ — c'est la raison d'être des DEUX lectures plutôt qu'une. Fondre les
   * deux aurait changé, en passant, QUEL NOM s'affiche sur la carte : un élément existant, qu'Arno n'a pas
   * demandé de toucher. Aujourd'hui cela ne se verrait pas (jamais deux occupations en cours pour un lot), mais
   * le jour où il y en aurait deux, le nom se mettrait à changer sans que personne ait rien demandé.
   */
  it('🔴🔴 la lecture du nom garde sa règle (la plus récente), intacte', () => {
    const q = sql(REPO.slice(REPO.indexOf('async function biensDuProprietaire')));
    expect(q).toContain('SELECT l.nom, o.locataire_id, o.entree FROM gestion_annuaire_occupation o'
      + ' JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id'
      + ' WHERE o.lot_id = lo.id AND o.sortie IS NULL'
      + ' ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1');
    expect(q).toContain('oc.nom AS locataire');
  });

  /**
   * ⚠️ LA MÊME PORTE QUE LE NOM : `sortie IS NULL`, l'occupation EN COURS. Sans cette condition, un ancien bail
   * remonterait une date d'entrée — et comme on prend la plus ancienne, ce serait justement celle-là qui
   * gagnerait. La carte dirait « entré en 1994 » d'un locataire arrivé l'an dernier.
   */
  it('⚠️ un ancien bail ne peut pas remonter sa date', () => {
    const debut = REPO.indexOf('min(o2.entree)');
    expect(debut).toBeGreaterThan(0);
    expect(sql(REPO.slice(debut, debut + 300))).toContain('o2.sortie IS NULL');
  });

  /** 🔴 LECTURE SEULE : ce lot n'écrit nulle part, et n'a donc aucune migration. */
  it('🔴 la lecture ajoutée n’écrit rien', () => {
    const ajout = REPO.slice(REPO.indexOf('min(o2.entree)'), REPO.indexOf('min(o2.entree)') + 300);
    expect(ajout).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
  });
});

describe('🔴🔴 ce qui s’affiche, et seulement quand il y a un locataire', () => {
  /**
   * 🔴🔴 LA LIGNE VIT DANS LA BRANCHE « UN LOCATAIRE EXISTE ». C'est ce qui garantit qu'un logement VACANT est
   * inchangé : il affiche « Vacant » et rien d'autre, comme avant ce lot. Une ligne posée au-dessous du ternaire
   * se serait affichée sur les deux — « Entrée : non renseignée » sous « Vacant », ce qui n'a aucun sens.
   */
  it('🔴🔴 la ligne est à l’intérieur de la branche du locataire', () => {
    const carte = ANNUAIRE.slice(ANNUAIRE.indexOf('function CarteBien'), ANNUAIRE.indexOf('export const CSS_ANNUAIRE'));
    const vacant = carte.indexOf('<span className="ann-vacant">Vacant</span>');
    const valeur = carte.indexOf('<span className="ann-fait-valeur">');
    const entree = carte.indexOf('<span className="ann-entree">');
    expect(vacant).toBeGreaterThan(0);
    expect(valeur).toBeGreaterThan(vacant);
    /* L'ordre du fichier dit l'imbrication : la ligne est APRÈS l'ouverture de la branche « un nom existe ». */
    expect(entree).toBeGreaterThan(valeur);
    expect(carte.slice(valeur, entree)).toContain('{b.locataire}');
  });

  /** 🔴 LES MOTS D'ARNO, AU MOT PRÈS — « Entré(e) dans les lieux le », puis la date. */
  it('🔴 le libellé est exactement celui demandé', () => {
    expect(ANNUAIRE).toContain('Entré(e) dans les lieux le {formaterDateIso(b.locataireDepuis)}');
  });

  /**
   * ⚠️ L'ABSENCE SE DIT DE LA MÊME FAÇON PARTOUT DANS LA CARTE : `ann-inconnu`, le gris italique de
   * « SURFACE non renseignée » deux lignes plus haut. Deux dessins pour une même absence, et le lecteur croit à
   * deux sortes d'absence.
   */
  it('⚠️ la date inconnue se dit, dans le dessin déjà employé par la carte', () => {
    expect(ANNUAIRE).toContain('<span className="ann-inconnu">Entrée : non renseignée</span>');
    expect(ANNUAIRE).toContain('.ann-inconnu{font-size:.85rem;color:var(--color-svv-muted);font-style:italic}');
  });

  /**
   * 🔴🔴 « PLUS PETITE ET PLUS DISCRÈTE QUE LE NOM » (Arno) — et c'est MESURABLE, pas une impression :
   *   · plus petite : 0,74 rem contre 0,82 rem pour la ligne de fait ;
   *   · plus discrète : graisse ORDINAIRE là où `.ann-fait--locataire .ann-fait-valeur` met 700. Sans
   *     `font-weight:400`, elle hériterait du gras du nom et ferait deux titres.
   * 🔴🔴 ET SANS OPACITÉ : la première écriture en posait une (0,85), qui faisait tomber le contraste à
   * 3,65:1 en thème Clair — sous les 4,5:1 que le lot FILTRES-FAMILLES-ET-BOUTONS-ROUGES a posés pour ce
   * module la veille. Sans elle : 4,75:1 en Clair, 9,01:1 en Sombre. Ce cas interdit qu'elle revienne.
   */
  it('🔴🔴 plus petite et plus discrète que le nom, en chiffres', () => {
    const feuille = ANNUAIRE.slice(ANNUAIRE.indexOf('export const CSS_ANNUAIRE'));
    expect(feuille).toContain('.ann-entree{display:block;font-size:.74rem;font-weight:400;'
      + 'color:var(--color-svv-green-ink)}');
    /* ⚠️ Le défaut mesuré, nommé : une opacité sur cette ligne la repasserait sous le seuil. */
    expect(feuille.slice(feuille.indexOf('.ann-entree{'), feuille.indexOf('.ann-entree{') + 120))
      .not.toContain('opacity');
    expect(feuille).toContain('.ann-fait--locataire .ann-fait-valeur{font-weight:700;');
    const taille = (r: RegExp): number => Number(feuille.match(r)?.[1]);
    expect(taille(/\.ann-entree\{display:block;font-size:\.(\d+)rem/)).toBeLessThan(
      taille(/\.ann-fait\{display:flex;flex-wrap:wrap;align-items:baseline;gap:\.4rem;font-size:\.(\d+)rem/));
  });

  /** 🔴 LE MÊME BLOC VERT : la ligne est DANS `.ann-fait--locataire`, et prend donc son fond et son encre. */
  it('🔴 elle reste dans le bloc vert', () => {
    const feuille = ANNUAIRE.slice(ANNUAIRE.indexOf('export const CSS_ANNUAIRE'));
    expect(feuille).toContain('.ann-fait--locataire{background:var(--color-svv-green-soft);');
    expect(ANNUAIRE).toContain('.ann-entree{display:block;font-size:.74rem;font-weight:400;'
      + 'color:var(--color-svv-green-ink)}');
  });
});

/**
 * 🔴 LA DATE EST RENDUE PAR LA FONCTION DÉJÀ EMPLOYÉE PAR LA CARTE, et son format est bien JJ/MM/AAAA. Ce cas
 * n'invente pas un formateur pour ce lot — il vérifie celui que la ligne appelle vraiment.
 */
describe('🔴 JJ/MM/AAAA, par le formateur de la carte', () => {
  it('🔴 rend la date au format demandé', () => {
    expect(formaterDateIso('1994-10-01')).toBe('01/10/1994');
    expect(formaterDateIso('2026-09-21')).toBe('21/09/2026');
  });
});
