import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIBELLE_MAX, MOTIF_DERNIER_PROPRIETAIRE, MOTIF_SANS_MIGRATION, NOTE_MAX, civiliteDesigneSociete, libellePropre,
  manquesDeLaFiche, notePropre, ordreDesCartes, phraseArchivage, poidsCivilite, proposerCoupure, texteOuRien,
  verifierCoordonnees, verifierSeparation, type CoordonneeSaisie,
} from './annuaireEdition';

/**
 * LOT FICHES-ANNUAIRE, ÉTAPE C — LES RÈGLES DE LA SAISIE, ÉPROUVÉES.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE FICHIER TIENT CE QU'AUCUN AUTRE NE PEUT TENIR : à partir de cette étape, l'annuaire n'est plus le reflet de
 * WIPPIMMO — on y SAISIT. Une règle relâchée ici met un mauvais numéro dans un mail envoyé à un locataire, ou fait
 * rapprocher notre propre courrier de la fiche d'un client.
 *
 * ⚠️ LES GARANTIES D'ÉCRAN ET DE DÉPÔT SONT LUES DANS LA SOURCE (fin de fichier). Ce sont les seules qui puissent
 * dire « aucun DELETE » ou « le journal est écrit dans la même transaction » — un test de fonction pure ne voit rien
 * de tout cela, et c'est précisément là que se joue la promesse « rien n'est jamais supprimé ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const tel = (valeur: string, libelle = ''): CoordonneeSaisie => ({ sorte: 'telephone', valeur, libelle });
const mail = (valeur: string, libelle = ''): CoordonneeSaisie => ({ sorte: 'email', valeur, libelle });

describe('vérifier des coordonnées', () => {
  it('garde la forme SAISIE pour l’affichage et la forme CANONIQUE pour comparer', () => {
    const issue = verifierCoordonnees([tel('06 12 34 56 78', 'Mobile')]);
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    expect(issue.retenues[0].valeurBrute).toBe('06 12 34 56 78');
    expect(issue.retenues[0].valeur).toBe('+33612345678');
    expect(issue.retenues[0].libelle).toBe('Mobile');
    // Le RANG est la position dans la liste : c'est l'ordre voulu par Arno, et le premier est celui qu'on appelle.
    expect(issue.retenues[0].rang).toBe(0);
  });

  it('l’ordre de la liste devient le rang — réordonner est donc le même geste que modifier', () => {
    const issue = verifierCoordonnees([mail('b@exemple.fr'), mail('a@exemple.fr')]);
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    expect(issue.retenues.map((c) => [c.valeur, c.rang])).toEqual([['b@exemple.fr', 0], ['a@exemple.fr', 1]]);
  });

  /**
   * 🔴🔴 LA RÈGLE LA PLUS IMPORTANTE DE CE FICHIER. Une adresse de la maison sur la fiche d'un client ferait
   * rapprocher TOUT notre courrier de cette personne : le moteur de propositions désignerait son logement à chaque
   * mail que nous écrivons. C'est le défaut corrigé au lot BOITE-INTERNE-CORBEILLE (1 346 mails, 948 échanges), et
   * la saisie ne doit pas le laisser rentrer par la fenêtre.
   */
  it('🔴 une adresse de l’agence est REFUSÉE, avec un motif qui dit quoi faire', () => {
    for (const adresse of ['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com', 'A.JOREL@SansVisAVis.com']) {
      const issue = verifierCoordonnees([mail(adresse)]);
      expect(issue.ok).toBe(false);
      if (issue.ok) return;
      expect(issue.motif).toContain('adresse de l’agence');
      expect(issue.motif).toContain('personnelle');
      expect(issue.rang).toBe(0);
    }
  });

  it('🔴 refuse la liste ENTIÈRE à la première erreur, en disant LAQUELLE', () => {
    const issue = verifierCoordonnees([tel('06 12 34 56 78'), mail('pas une adresse'), tel('01 02 03 04 05')]);
    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    // Le rang nommé est celui de la ligne fautive : sans lui, l'écran ne saurait pas quel champ montrer.
    expect(issue.rang).toBe(1);
  });

  it('refuse une coordonnée vide plutôt que de l’écrire', () => {
    const issue = verifierCoordonnees([tel('   ')]);
    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    expect(issue.motif).toContain('vide');
  });

  /** ⚠️ LE DOUBLON SE JUGE SUR LA FORME CANONIQUE : deux écritures d'un même numéro sont un seul téléphone. */
  it('🔴 refuse deux écritures du MÊME numéro — une ligne par téléphone, pas par graphie', () => {
    const issue = verifierCoordonnees([tel('06 12 34 56 78'), tel('+33612345678')]);
    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    expect(issue.motif).toContain('déjà dans la liste');
    expect(issue.rang).toBe(1);
  });

  it('un téléphone illisible est refusé, et le motif le dit en français', () => {
    const issue = verifierCoordonnees([tel('appeler le concierge')]);
    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    expect(issue.motif).toContain('téléphone');
  });
});

describe('les champs de texte', () => {
  it('un libellé est borné, et le vide devient `null` — jamais une chaîne vide', () => {
    expect(libellePropre('  Mobile   pro ')).toBe('Mobile pro');
    expect(libellePropre('')).toBeNull();
    expect(libellePropre(null)).toBeNull();
    expect((libellePropre('x'.repeat(200)) ?? '').length).toBe(LIBELLE_MAX);
  });

  it('un champ court perd ses espaces multiples ; une NOTE garde ses retours à la ligne', () => {
    expect(texteOuRien('  12   rue  X ')).toBe('12 rue X');
    // 🔴 LA NOTE EST UNE NOTE : aplatir ses lignes en ferait un paragraphe illisible.
    expect(notePropre('ligne 1\nligne 2')).toBe('ligne 1\nligne 2');
    expect((notePropre('x'.repeat(5000)) ?? '').length).toBe(NOTE_MAX);
    expect(notePropre('   ')).toBeNull();
  });
});

describe('l’ordre des cartes', () => {
  const p = (id: number, civilite: string | null, nom: string, rang = 0) => ({ id, civilite, nom, rang });

  it('🔴 Monsieur, puis Madame, puis les autres — la demande d’Arno, mot pour mot', () => {
    const ordre = ordreDesCartes([p(1, 'SCI', 'DU MOULIN'), p(2, 'Mme', 'ROI'), p(3, 'M.', 'ROI')]);
    expect(ordre.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  /**
   * 🔴 LE RANG RÉGLÉ À LA MAIN L'EMPORTE SUR TOUT. Sans cela, placer la société en premier ne tiendrait pas : la
   * règle par civilité la ramènerait en dernier à la visite suivante, et le geste d'Arno serait défait en silence.
   */
  it('🔴 un rang réglé à la main gagne contre la civilité', () => {
    const ordre = ordreDesCartes([p(1, 'M.', 'ROI', 2), p(2, 'SCI', 'DU MOULIN', 1)]);
    expect(ordre.map((x) => x.id)).toEqual([2, 1]);
  });

  it('rang 0 = jamais réglé : ces cartes passent APRÈS celles qui le sont', () => {
    const ordre = ordreDesCartes([p(1, 'M.', 'AAA', 0), p(2, 'Mme', 'ZZZ', 3)]);
    expect(ordre.map((x) => x.id)).toEqual([2, 1]);
  });

  it('les formes de civilité de WIPPIMMO sont toutes reconnues', () => {
    for (const m of ['M.', 'M', 'Mr', 'Monsieur', 'monsieur']) expect(poidsCivilite(m)).toBe(0);
    for (const f of ['Mme', 'Madame', 'Mlle', 'MADAME']) expect(poidsCivilite(f)).toBe(1);
    for (const autre of ['SCI', 'SARL', null, '', 'Indivision']) expect(poidsCivilite(autre)).toBe(2);
  });

  it('à égalité, le nom tranche — deux affichages successifs ne se permutent pas', () => {
    const ordre = ordreDesCartes([p(1, null, 'ZOLA'), p(2, null, 'ABEL')]);
    expect(ordre.map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('proposer une coupure de nom', () => {
  /**
   * 🔴 « AISSAOUI Mohamed et Amina » : le nom de famille se PARTAGE, parce que « Amina » toute seule ne désigne
   * personne dans une liste de 510 locataires.
   */
  it('partage le nom de famille quand la droite n’est qu’un prénom', () => {
    const c = proposerCoupure('AISSAOUI Mohamed et Amina');
    expect(c.possible).toBe(true);
    expect(c.premier).toBe('AISSAOUI Mohamed');
    expect(c.second).toBe('AISSAOUI Amina');
    expect(c.motif).toContain('deux personnes');
  });

  it('ne touche à rien quand la droite porte déjà son nom de famille', () => {
    const c = proposerCoupure('BARKAOUI Meriem et CHAABANE Mohamed');
    expect(c).toMatchObject({ possible: true, premier: 'BARKAOUI Meriem', second: 'CHAABANE Mohamed' });
  });

  it('reconnaît « & » et « / » aussi bien que « et »', () => {
    expect(proposerCoupure('DUPONT Jean & DURAND Marie').possible).toBe(true);
    expect(proposerCoupure('DUPONT Jean / DURAND Marie').possible).toBe(true);
  });

  /**
   * 🔴🔴 ON NE PROPOSE RIEN QUAND RIEN NE LE JUSTIFIE. Proposer de couper « SCI DU MOULIN » inviterait à casser une
   * société en deux, et le nom du séparateur (« du ») n'est pas une conjonction.
   */
  it('🔴 un nom sans séparateur n’est jamais proposé à la coupure', () => {
    for (const nom of ['SCI DU MOULIN', 'ROI Nathan', 'MARS AVENIR', 'DUPONT-ETIENNE Paul']) {
      expect(proposerCoupure(nom).possible).toBe(false);
    }
  });

  it('un séparateur au bord ne coupe rien — « X et » ne désigne pas deux personnes', () => {
    expect(proposerCoupure('DUPONT et ').possible).toBe(false);
  });
});

describe('vérifier une séparation', () => {
  it('accepte deux noms différents', () => {
    expect(verifierSeparation('A', 'B')).toEqual({ ok: true });
  });
  it('refuse un nom vide, et refuse deux noms identiques', () => {
    expect(verifierSeparation('A', ' ').ok).toBe(false);
    const meme = verifierSeparation('DUPONT Jean', 'dupont jean');
    expect(meme.ok).toBe(false);
    if (meme.ok) return;
    expect(meme.motif).toContain('rien à séparer');
  });
});

describe('les mots de l’écran', () => {
  /** ⚠️ UNE SEULE ÉCRITURE DU MOTIF : l'écran, la route et les épreuves doivent dire exactement la même chose. */
  it('le motif d’indisponibilité nomme la migration et dit POURQUOI on refuse', () => {
    expect(MOTIF_SANS_MIGRATION).toContain('278');
    expect(MOTIF_SANS_MIGRATION).toContain('écrasée au prochain import');
  });

  /** 🔴 LA PHRASE D'ARCHIVAGE DIT CE QUI EST GARDÉ : c'est ce qui rend le geste acceptable sans hésiter. */
  it('la phrase d’archivage promet que rien n’est supprimé, et que « Restaurer » existe', () => {
    const p = phraseArchivage('M. ROI Nathan');
    expect(p).toContain('M. ROI Nathan');
    expect(p).toContain('Rien n’est supprimé');
    expect(p).toContain('Restaurer');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES GARANTIES QU'AUCUNE FONCTION PURE NE PEUT TENIR — LUES DANS LA SOURCE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le dépôt d’écriture : rien n’est supprimé, tout est journalisé, tout est verrouillé', () => {
  const repo = readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 LA PROMESSE CENTRALE DE L'ÉTAPE C ══════════════════════════════════════════════════════════════════
   *
   * Arno : « “Supprimer” = ARCHIVER, jamais d'effacement ». Ce test lit le TEXTE du module : pas un `DELETE`, pas
   * un `TRUNCATE`. C'est la seule façon de tenir cette promesse pour de bon — un test de comportement ne
   * couvrirait que les chemins qu'il a pensé à emprunter.
   */
  it('🔴 AUCUN DELETE, AUCUN TRUNCATE dans tout le module d’écriture', () => {
    expect(repo).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(repo).not.toMatch(/\bTRUNCATE\b/i);
    // Ce qui « retire » DATE une colonne, et rien d'autre.
    expect(repo).toContain('archive_le = now()');
  });

  /** 🔴 QUI, QUAND, AVANT, APRÈS — et dans la MÊME transaction que la modification qu'il explique. */
  it('🔴 chaque geste écrit dans `gestion_journal`, avec l’avant et l’après', () => {
    expect(repo).toContain('INSERT INTO gestion_journal');
    expect(repo).toContain('valeur_avant');
    expect(repo).toContain('valeur_apres');
    expect(repo).toContain('auteur_libelle');
    // `entite = 'annuaire'` est déjà accepté par la contrainte du journal : aucune migration pour journaliser.
    expect(repo).toContain("'annuaire'");
  });

  /**
   * 🔴🔴 UN VERROU PAR CHAMP, JAMAIS PAR FICHE. Corriger un téléphone ne doit pas geler l'adresse postale, que
   * WIPPIMMO continue de tenir à jour. Une fiche entière verrouillée se figerait en silence.
   */
  it('🔴 modifier un champ POSE un verrou sur CE champ, avec la valeur que WIPPIMMO portait', () => {
    expect(repo).toContain('INSERT INTO gestion_annuaire_verrou');
    expect(repo).toContain('valeur_import');
    // Reverrouiller ne doit PAS réécrire `valeur_import` : c'est le premier verrou qui raconte la divergence.
    const verrou = repo.slice(repo.indexOf('async function verrouiller'), repo.indexOf('① MODIFIER UNE PERSONNE'));
    expect(verrou).toContain('ON CONFLICT (sujet, sujet_id, champ) DO UPDATE');
    expect(verrou).not.toMatch(/DO UPDATE[\s\S]*valeur_import\s*=/);
  });

  /** ⚠️ TOUT PASSE PAR UNE TRANSACTION : une coordonnée sans son verrou serait écrasée au prochain import. */
  it('🔴 chaque écriture est dans une transaction, et refuse proprement sans la migration', () => {
    expect(repo).toContain('withTransaction');
    expect(repo).toContain('annuaireModifiableDisponible');
    // Le refus est un ÉTAT, pas une exception : l'écran grise « Modifier » avec son motif.
    expect((repo.match(/etat: 'sans_schema'/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  /**
   * 🔴 SÉPARER GARDE LA FICHE D'ORIGINE, avec ses biens et son historique, et crée la SECONDE à côté. L'archiver
   * aurait détaché tout son passé — c'est précisément ce qu'on refuse.
   */
  it('🔴 séparer conserve la fiche d’origine et relie la nouvelle par `issu_de`', () => {
    const bloc = repo.slice(repo.indexOf('export async function separerPersonne'));
    expect(bloc).toContain('issu_de');
    expect(bloc).not.toMatch(/archive_le\s*=\s*now\(\)\s*WHERE id = \$1'?,\s*\[id\]/);
    // La répartition vient du dehors : la fonction ne la calcule jamais.
    expect(bloc).toContain('o.repartition');
  });

  /** 🔴 UNE VENTE CLÔT LE LIEN, elle ne le détache pas : l'ancien propriétaire reste dans l'historique du bien. */
  it('🔴 remplacer un propriétaire DATE l’ancien lien (`jusqu_a`) au lieu de l’enlever', () => {
    const bloc = repo.slice(repo.indexOf('export async function remplacerProprietaireDuLot'));
    expect(bloc).toContain('SET jusqu_a =');
    expect(bloc).not.toMatch(/\bDELETE\b/i);
  });
});

describe('🔴 l’import WIPPIMMO respecte ce qui a été saisi, et DIT les divergences', () => {
  const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');

  /**
   * ══ 🔴🔴 LA PRIORITÉ DE LA SAISIE — LA PROMESSE FAITE À ARNO ════════════════════════════════════════════════
   *
   * « Une valeur modifiée dans l'app devient PRIORITAIRE et n'est jamais écrasée par un réimport. L'import liste
   * les divergences (“WIPPIMMO dit X, l'app dit Y”) dans son rapport, sans les appliquer. »
   */
  it('🔴 les verrous sont lus AVANT d’écrire, et retirés du SET de l’`ON CONFLICT`', () => {
    expect(repo).toContain('async function lireVerrous');
    expect(repo).toContain('function setSansVerrous');
    expect(repo).toContain('ON CONFLICT (wippimmo_id) DO UPDATE SET ${set}');
    expect(repo).toContain('ON CONFLICT (cle_personne) DO UPDATE SET ${set}');
  });

  /**
   * 🔴 LE CHAMP VERROUILLÉ SORT AUSSI DE LA COMPARAISON. Sans cela, la fiche serait « à mettre à jour » à chaque
   * import, pour toujours : le rapport annoncerait des mises à jour qui n'en sont pas, et l'idempotence de
   * l'import — sa propriété la plus précieuse — serait perdue sans un mot.
   */
  it('🔴 un champ verrouillé sort de la comparaison, sinon l’import ne serait plus idempotent', () => {
    expect(repo).toContain('const comparable: Empreinte = { ...apres }');
    expect(repo).toContain('delete comparable[col]');
    expect(repo).toContain('memeEmpreinte(comparable, avant)');
  });

  /**
   * 🔴 `nom_complet` ET `nom_normalise` SUIVENT LE NOM. Ce sont des colonnes dérivées, et `nom_normalise` est ce
   * que la RECHERCHE interroge : les réécrire sans le nom rendrait une personne introuvable sous le nom affiché.
   */
  it('🔴 verrouiller le nom gèle aussi le nom complet et le nom normalisé', () => {
    const f = repo.slice(repo.indexOf('function setSansVerrous'), repo.indexOf('function phraseDivergence'));
    expect(f).toContain("col === 'nom_complet'");
    expect(f).toContain("col === 'nom_normalise'");
    // `absent_le` et `importe_le` NE SE VERROUILLENT JAMAIS : ils disent que l'export vient de nommer la fiche.
    expect(f).toContain("'absent_le = NULL'");
    expect(f).toContain("'importe_le = now()'");
  });

  /** 🔴 LES DEUX MOITIÉS DU VERROU DES COORDONNÉES : ni ajout, ni marquage en « absent ». */
  it('🔴 une fiche dont les coordonnées sont à nous ne se vide pas toute seule', () => {
    const bloc = repo.slice(repo.indexOf('export async function ecrireContacts'));
    expect(bloc).toContain("'contacts'");
    // Le garde est posé DEUX fois : à l'ajout, et au marquage des disparus. Les deux, ou la fiche d'Arno se
    // viderait toute seule à chaque import — le pire résultat, parce qu'il ressemble à un effacement.
    expect((bloc.match(/bloque\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(bloc).toContain('if (bloque(a.sujet, a.sujetId))');
    expect(bloc).toContain('if (bloque(sujet, sujetId)) continue;');
  });

  it('🔴 les divergences sont DITES, en toutes lettres, et non appliquées', () => {
    expect(repo).toContain('divergences');
    expect(repo).toContain('WIPPIMMO dit');
    expect(repo).toContain('l’app dit');
    expect(repo).toContain('(non appliqué)');
    // Le rapport de la commande les imprime, une par ligne.
    const cli = readFileSync('app/scripts/importer-annuaire.ts', 'utf8');
    expect(cli).toContain('DIVERGENCES NON APPLIQUÉES');
    expect(cli).toContain('c.divergences');
  });

  /**
   * ⚠️ `COMPTES_VIDES` PORTE UN TABLEAU, et `{ ...COMPTES_VIDES }` en copie la RÉFÉRENCE : sans réécriture
   * explicite, chaque import pousserait ses divergences dans la constante partagée, et le second hériterait de
   * celles du premier. Un cumul invisible, et faux.
   */
  it('🔴 chaque import repart d’un tableau de divergences NEUF', () => {
    expect(repo).toContain('{ ...COMPTES_VIDES, divergences: [] }');
  });
});

describe('🔴 une coordonnée retirée à la main ne pèse plus, NULLE PART', () => {
  /**
   * ══ 🔴🔴 POURQUOI UN SEUL ENDROIT POUR CETTE CONDITION ══════════════════════════════════════════════════════
   *
   * Neuf requêtes du module rapprochent un mail d'une fiche par son adresse. Si UNE SEULE oubliait `archive_le`,
   * une adresse retirée continuerait de proposer un bien — le geste d'Arno serait à moitié appliqué, ce qui est
   * pire que pas appliqué du tout : il aurait toutes les raisons de croire que c'est fait.
   */
  it('🔴 le moteur de propositions, la recherche de bien et le tri des pièces l’écartent tous', () => {
    for (const fichier of [
      'app/lib/gestion/classementBien.ts',      // le MOTEUR de propositions
      'app/lib/gestion/rechercheBienRepo.ts',   // la recherche d'un bien
      'app/lib/gestion/triPiecesRepo.ts',       // le tri des pièces vers le Drive
      'app/lib/gestion/adressesRepo.ts',        // la reconnaissance des adresses d'un échange
      'app/lib/gestion/ficheRattachementRepo.ts', // la fiche « Rattaché à »
      'app/lib/gestion/annuaireRepo.ts',        // les fiches et l'encart « qui est cet expéditeur »
    ]) {
      expect(readFileSync(fichier, 'utf8')).toContain('conditionCoordonneeVivante');
    }
  });

  /**
   * ══ 🔴 DÉFAUT MESURÉ À L'ÉCRAN LE 29/09/2026, ET SON GARDE ══════════════════════════════════════════════════
   *
   * Sans la migration 278, la fiche de M. ROI Nathan rendait « Fiche illisible » : la requête des cartes triait
   * par `ORDER BY (0 = 0), 0, …`, et PostgreSQL lit un ENTIER LITTÉRAL dans un `ORDER BY` comme une POSITION de
   * colonne. D'où « ORDER BY position 0 is not in select list ».
   *
   * 🔴 LE PIÈGE EST SILENCIEUX DÈS QU'IL NE PLANTE PAS : `ORDER BY 2` aurait trié sur la deuxième colonne du
   * SELECT, sans un mot. Le transtypage `0::int` en fait une expression — donc une vraie constante.
   */
  it('🔴 une constante de tri est TRANSTYPÉE : un entier nu serait lu comme un numéro de colonne', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    const f = repo.slice(repo.indexOf('async function personnesDe'), repo.indexOf('async function coproprietairesDe'));
    expect(f).toContain("'0::int'");
    expect(f).not.toMatch(/modifiable \? 'rang' : '0'/);
  });

  /** ⚠️ `archive_le` ET `absent_le` NE SONT PAS LA MÊME ABSENCE, et le module le dit là où il les distingue. */
  it('la condition est SONDÉE : sans la migration 278, la colonne n’est nommée nulle part', () => {
    const src = readFileSync('app/lib/gestion/coordonneeVivante.ts', 'utf8');
    expect(src).toContain('annuaireModifiableDisponible');
    expect(src).toContain("return ''");
    expect(src).toContain('archive_le IS NULL');
  });
});

describe('🔴 l’écran : des cartes côte à côte, alignées, et modifiables', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');

  /**
   * ══ 🔴🔴 L'ALIGNEMENT, DEMANDE EXPRESSE D'ARNO ══════════════════════════════════════════════════════════════
   *
   * « des écarts de niveaux partout […] chaque ligne libellé | valeur | capsule | Copier est sur UNE ligne de base
   * commune : alignement vertical centré, même hauteur de ligne, libellé aligné sur la valeur (pas plus haut). »
   *
   * 🔴 D'OÙ UNE GRILLE, ET NON UN `<dl>` : les `<dt>` et `<dd>` vivent dans deux flux séparés, et leurs hauteurs
   * ne peuvent pas se répondre. C'est ce qui produisait les décalages.
   */
  it('🔴 chaque ligne est une GRILLE de deux colonnes, centrée verticalement', () => {
    expect(src).toContain('.cp-ligne{display:grid');
    expect(src).toContain('align-items:center');
    // Le libellé est centré sur sa valeur, pas aligné en haut.
    expect(src).toContain('.cp-lab{');
    expect(src).toContain('align-self:center');
    // 🔴 AUCUN `<dl>` RENDU DANS LA CARTE : c'est la structure qui produisait les écarts. (Le mot apparaît dans
    //    le commentaire qui l'explique — on cherche donc la BALISE ouvrante suivie d'un attribut ou d'un chevron.)
    // (Les noms de balises apparaissent dans le commentaire qui explique le choix : on cherche donc ce qu'un
    //  rendu JSX produirait vraiment — une balise ouvrante avec sa classe, et une fermante.)
    expect(src).not.toContain('<dl className');
    expect(src).not.toContain('</dl>');
  });

  it('🔴 l’espacement vertical est UNIQUE — plus de trou entre TÉLÉPHONE et E-MAIL', () => {
    // Un seul `row-gap`, posé sur le conteneur : deux espacements différents rouvriraient le défaut.
    expect(src).toContain('.cp-lignes{display:flex;flex-direction:column;row-gap:');
  });

  it('🔴 plusieurs numéros : une ligne chacun, le libellé n’apparaît qu’une fois', () => {
    expect(src).toContain('libelle={i === 0 ?');
    expect(src).toContain('cp-lab--vide');
  });

  /** 🔴 CAPSULE ET « COPIER » À LA MÊME HAUTEUR QUE LA VALEUR, compacts et collés : la demande, mot pour mot. */
  it('la capsule et le bouton Copier partagent une hauteur de ligne', () => {
    expect(src).toMatch(/\.cp-caps\{[^}]*align-items:center/);
    expect(src).toMatch(/\.cp-copier\{[^}]*align-items:center/);
  });

  /**
   * 🔴 LES CARTES SE SUIVENT DE GAUCHE À DROITE, avec flèches, fondu et glisser — et les flèches n'existent QUE
   * s'il y a une suite : une flèche qui ne fait rien apprend à ne plus regarder les flèches.
   */
  it('🔴 la rangée défile : largeur de carte fixe, flèches conditionnelles, fondu, glisser', () => {
    expect(src).toContain('overflow-x:auto');
    expect(src).toContain('.cp-carte{flex:0 0 auto;width:min(');
    expect(src).toContain('{bords.gauche && (');
    expect(src).toContain('{bords.droite && (');
    expect(src).toContain('mask-image');
    expect(src).toContain('onPointerMove');
    // Le seuil de 6 px protège le clic : sans lui, un frémissement de la main avalerait le clic sur « Copier ».
    expect(src).toContain('Math.abs(delta) < 6');
  });

  it('🔴 la carte « + Ajouter » est au BOUT de la rangée', () => {
    const bloc = src.slice(src.indexOf('export function BlocCartes'));
    expect(bloc).toContain('cp-carte--ajout');
    expect(bloc).toContain('{motAjouter}');
    // Elle vient APRÈS les cartes dans le flux — c'est ce qui la place au bout.
    expect(bloc.indexOf('<CartePersonne')).toBeLessThan(bloc.indexOf('cp-carte--ajout'));
  });

  /** 🔴 LE CRAYON ET LE « ⋯ » SUR CHAQUE CARTE, en haut à droite — la demande, mot pour mot. */
  it('🔴 chaque carte porte son crayon « Modifier » et son menu « ⋯ »', () => {
    expect(src).toContain('cp-tete-actions');
    expect(src).toContain('aria-label="Modifier"');
    expect(src).toContain('aria-label="Autres gestes"');
    expect(src).toContain('Remplacer (vente, changement)');
    expect(src).toContain('Séparer en deux personnes');
    expect(src).toContain('Archiver (restaurable)');
    expect(src).toContain('Restaurer dans l’annuaire');
  });

  /**
   * 🔒 SANS LA MIGRATION, « MODIFIER » EST DÉSACTIVÉ AVEC SON MOTIF — jamais absent, ce qui enverrait chercher un
   * bogue, ni actif, ce qui promettrait un geste impossible.
   */
  it('🔴 sans la migration 278, les gestes sont DÉSACTIVÉS et le motif est écrit', () => {
    expect(src).toContain('disabled={!gestes.modifiable}');
    expect(src).toContain('MOTIF_SANS_MIGRATION');
  });

  /** 🔴 « JAMAIS AUTOMATIQUEMENT » : chaque coordonnée démarre sur l'état NEUTRE, « Les deux ». */
  it('🔴 l’écran « Séparer » ne répartit rien de lui-même', () => {
    const bloc = src.slice(src.indexOf('function EcranSeparer'));
    expect(bloc).toContain("'les_deux' as PartDeCoordonnee");
    expect(bloc).toContain('La première');
    expect(bloc).toContain('La seconde');
    expect(bloc).toContain('Les deux');
    expect(bloc).toContain('Rien n’est supprimé');
  });

  /** ⚠️ MOBILE D'ABORD (§15) : cibles suffisantes, et AUCUNE action révélée au seul survol. */
  it('mobile d’abord : la carte tient à 390 px, et rien n’apparaît au survol', () => {
    expect(src).toContain('calc(100vw - 3rem)');
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });
});

describe('🔴 la fiche locataire montre TOUS les occupants du même logement', () => {
  it('la règle d’Arno est tenue par le dépôt, pas par l’écran', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    const bloc = repo.slice(repo.indexOf('export async function ficheLocataire'));
    // On part des logements OCCUPÉS aujourd'hui, et on ramène toutes les occupations EN COURS de ces lots.
    expect(bloc).toContain('lotsEnCours');
    expect(bloc).toContain('sortie IS NULL');
    // ⚠️ La personne demandée est TOUJOURS dedans : un locataire parti n'a plus de logement en cours, et sa
    //    propre fiche ne doit pas disparaître de sa propre fiche.
    expect(bloc).toContain('const idsFoyer = [Number(p.id)]');
  });

  it('l’écran le DIT quand les cartes portent plus que la personne cherchée', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain('tous les occupants du même logement');
    // Les mails d'un locataire sont ceux de son LOGEMENT : la règle centrale du module, dite à l'écran.
    expect(src).toContain('un mail est rattaché à un bien, jamais à une personne');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FICHES-RETOUCHES-2
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 un bien doit toujours avoir au moins un propriétaire', () => {
  /**
   * ══ 🔴🔴 L'INVARIANT, ET POURQUOI IL SE TIENT AUX DEUX BOUTS ════════════════════════════════════════════════
   *
   * Arno : « Il est impossible d'archiver ou de remplacer-sans-successeur le DERNIER propriétaire actif d'un bien.
   * L'action est grisée, avec l'infobulle “Un bien doit toujours avoir au moins un propriétaire”. Garde côté
   * serveur aussi : refus dans la transaction, avec un test, même en cas d'appel direct. »
   *
   * 🔴 LE BOUTON GRISÉ PROTÈGE DE LA MALADRESSE ; IL NE PROTÈGE DE RIEN CONTRE un appel direct à la route, ou
   * contre une fenêtre restée ouverte pendant qu'un collègue archivait l'autre propriétaire. Un bien sans
   * propriétaire est un bien qu'on ne sait plus à qui facturer.
   */
  it('🔴 le motif est écrit UNE fois, et l’écran comme le serveur le citent', () => {
    expect(MOTIF_DERNIER_PROPRIETAIRE).toBe('Un bien doit toujours avoir au moins un propriétaire.');
    const cartes = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(cartes).toContain('MOTIF_DERNIER_PROPRIETAIRE');
    const repo = readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8');
    expect(repo).toContain('MOTIF_DERNIER_PROPRIETAIRE');
  });

  it('🔴 l’entrée « Archiver » est DÉSACTIVÉE, pas absente, avec son infobulle', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    const menu = src.slice(src.indexOf('function MenuCarte'), src.indexOf('// ══ ④'));
    expect(menu).toContain('disabled={p.dernierProprietaire}');
    expect(menu).toContain('title={p.dernierProprietaire ? MOTIF_DERNIER_PROPRIETAIRE : undefined}');
    // Une entrée qui DISPARAÎT fait chercher où elle est passée ; une entrée grisée apprend la règle.
    expect(menu).toContain('Archiver (restaurable)…');
  });

  /**
   * 🔴 LE GARDE DU SERVEUR EST DANS LA TRANSACTION, APRÈS LE `FOR UPDATE` de la fiche : entre la lecture et
   * l'écriture, personne ne peut archiver l'autre propriétaire du même bien sans attendre ce verrou.
   */
  it('🔴 le serveur refuse dans la transaction, en regardant LES DEUX sources de propriété', () => {
    const repo = readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8');
    const bloc = repo.slice(repo.indexOf('export async function archiverPersonne'),
      repo.indexOf('async function lotSansProprietaireApres'));
    expect(bloc).toContain('await lotSansProprietaireApres(q, id)');
    expect(bloc).toContain("etat: 'refus'");
    // Le verrou de ligne est pris AVANT le garde : le `FOR UPDATE` est dans la même fonction, plus haut.
    expect(bloc).toContain('FOR UPDATE');

    const garde = repo.slice(repo.indexOf('async function lotSansProprietaireApres'));
    // Les DEUX sources : celle de l'import, et les liens ajoutés à la main, EN COURS.
    expect(garde).toContain('FROM gestion_annuaire_lot WHERE proprietaire_id = $1');
    expect(garde).toContain('FROM gestion_annuaire_lot_proprietaire WHERE proprietaire_id = $1 AND jusqu_a IS NULL');
    expect(garde).toContain('archive_le IS NULL');
  });

  /** 🔴 « REMPLACER » RESTE POSSIBLE — mais pas par personne : le successeur doit exister et ne pas être archivé. */
  it('🔴 remplacer exige un successeur vivant, sans quoi le bien serait orphelin par la porte de derrière', () => {
    const repo = readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8');
    const bloc = repo.slice(repo.indexOf('export async function remplacerProprietaireDuLot'));
    expect(bloc).toContain('WHERE id = $1 AND archive_le IS NULL');
    expect(bloc).toContain('MOTIF_DERNIER_PROPRIETAIRE');
  });

  /** ⚠️ LA RÈGLE NE VAUT QUE POUR LES PROPRIÉTAIRES : un logement peut être vacant. */
  it('un locataire n’est jamais « dernier propriétaire »', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain("sujet === 'proprietaire'\n    ? await derniersProprietaires(");
    expect(repo).toContain('new Set<number>()');
  });
});

describe('🔴 créer une fiche : ce qu’il faut avoir renseigné', () => {
  const pleine = {
    civilite: 'M.', nom: 'DUPONT', prenom: 'Jean',
    adresse: '12 rue Fictive', codePostal: '92800', commune: 'Puteaux',
    coordonnees: [
      { sorte: 'telephone' as const, valeur: '06 12 34 56 78', libelle: 'Mobile' },
      { sorte: 'email' as const, valeur: 'jean@exemple.fr', libelle: 'E-mail' },
    ],
    date: '2026-09-30',
  };

  it('une fiche complète ne manque de rien', () => {
    expect(manquesDeLaFiche(pleine)).toEqual({});
  });

  /** 🔴 TOUS OBLIGATOIRES, SAUF QUALITÉ ET NOTE — la demande d'Arno, mot pour mot. */
  it('🔴 chaque champ vide est signalé, un par un', () => {
    const vide = manquesDeLaFiche({
      civilite: '', nom: '', prenom: '', adresse: '', codePostal: '', commune: '', coordonnees: [], date: '',
    });
    expect(Object.keys(vide).sort()).toEqual(
      ['adresse', 'civilite', 'codePostal', 'commune', 'date', 'email', 'nom', 'prenom', 'telephone'].sort());
    // Le motif dit ce qui manque, pas « champ invalide ».
    expect(vide.telephone).toContain('au moins un téléphone');
    expect(vide.email).toContain('au moins une adresse e-mail');
  });

  /** 🔴 UNE SCI N'A PAS DE PRÉNOM : l'exiger remplirait l'annuaire de « - » et de « n/a ». */
  it('🔴 le prénom n’est pas exigé d’une société', () => {
    for (const c of ['SCI', 'SARL', 'SAS', 'Sté', 'Société', 'SCI DU MOULIN', 'sasu', 'Indivision']) {
      expect(civiliteDesigneSociete(c), c).toBe(true);
      expect(manquesDeLaFiche({ ...pleine, civilite: c, prenom: '' }).prenom, c).toBeUndefined();
    }
  });

  it('une personne physique, elle, doit avoir son prénom', () => {
    for (const c of ['M.', 'Mme', 'Monsieur', 'Mlle', '']) expect(civiliteDesigneSociete(c), c).toBe(false);
    expect(manquesDeLaFiche({ ...pleine, prenom: '' }).prenom).toContain('obligatoire');
  });

  it('🔴 il faut un téléphone ET un e-mail — l’un ne remplace pas l’autre', () => {
    const sansMail = manquesDeLaFiche({ ...pleine, coordonnees: [pleine.coordonnees[0]] });
    expect(sansMail.email).toBeDefined();
    expect(sansMail.telephone).toBeUndefined();
    const sansTel = manquesDeLaFiche({ ...pleine, coordonnees: [pleine.coordonnees[1]] });
    expect(sansTel.telephone).toBeDefined();
    expect(sansTel.email).toBeUndefined();
  });

  /** ⚠️ UNE COORDONNÉE VIDE NE COMPTE PAS : la carte d'ajout démarre avec deux lignes vides, exprès. */
  it('une ligne de coordonnée laissée vide ne satisfait pas l’exigence', () => {
    const m = manquesDeLaFiche({ ...pleine, coordonnees: [
      { sorte: 'telephone', valeur: '  ', libelle: 'Mobile' },
      { sorte: 'email', valeur: '', libelle: 'E-mail' },
    ] });
    expect(m.telephone).toBeDefined();
    expect(m.email).toBeDefined();
  });

  it('la date doit être une vraie date, pas un fragment', () => {
    expect(manquesDeLaFiche({ ...pleine, date: '30/09/2026' }).date).toBeDefined();
    expect(manquesDeLaFiche({ ...pleine, date: '2026-09' }).date).toBeDefined();
    expect(manquesDeLaFiche({ ...pleine, date: '2026-09-30' }).date).toBeUndefined();
  });

  /** ⚠️ QUALITÉ ET NOTE NE SONT JAMAIS EXIGÉES : elles n'apparaissent pas dans la liste des manques. */
  it('qualité et note ne sont jamais réclamées', () => {
    const m = manquesDeLaFiche(pleine);
    expect(m.qualite).toBeUndefined();
    expect(m.note).toBeUndefined();
  });
});

describe('🔴 la carte d’ajout est la carte « Modifier », vide', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');

  /**
   * 🔴 UN SEUL COMPOSANT POUR LES DEUX MODES. « Identique au mode Modifier » est la demande : deux formulaires
   * jumeaux divergeraient au premier champ ajouté, et l'on saisirait un prénom dans l'un et pas dans l'autre.
   */
  it('🔴 c’est le MÊME `FormulaireCarte`, avec `p` à `null`', () => {
    expect(src).toContain('p: PersonneAnnuaire | null;');
    expect(src).toContain('<FormulaireCarte p={null}');
    // L'ancien formulaire réduit (Civilité / Nom / date) n'existe plus nulle part.
    const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(annuaire).not.toContain('function PanneauAjout');
    // ⚠️ Le bouton « Créer la fiche » de l'ancien panneau n'est plus RENDU nulle part — le mot ne subsiste que
    //    dans le commentaire qui explique son retrait.
    expect(annuaire).not.toContain('>Créer la fiche<');
    expect(annuaire).not.toContain("'Créer la fiche'");
  });

  it('🔴 elle s’ouvre À SA PLACE DANS LA RANGÉE, pas ailleurs dans la page', () => {
    const bloc = src.slice(src.indexOf('export function BlocCartes'));
    // La tuile et la carte sont les deux faces du même emplacement, au bout de la rangée.
    expect(bloc).toContain('{ajout ? (');
    expect(bloc).toContain('cp-carte--ajout');
    expect(bloc.indexOf('<CartePersonne')).toBeLessThan(bloc.indexOf('{ajout ? ('));
  });

  it('🔴 le rappel dit où la personne atterrit, AVANT qu’on remplisse quoi que ce soit', () => {
    expect(src).toContain('{creation.rappel}');
    const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(annuaire).toContain('Sera ajouté comme co-propriétaire sur');
    expect(annuaire).toContain('Sera ajouté comme occupant du lot');
  });

  it('🔴 « Enregistrer » est grisé tant qu’il manque quelque chose, et chaque manque est dit SOUS son champ', () => {
    expect(src).toContain('disabled={envoi || incomplete}');
    expect(src).toContain('manquesDeLaFiche({');
    expect(src).toContain('.cp-manque{display:block');
    // Les deux manques de coordonnées sont dits sous le bloc qui les porte.
    expect(src).toContain("{manqueDe('telephone')}");
    expect(src).toContain("{manqueDe('email')}");
  });

  /** ⚠️ LA CRÉATION EXIGE ; LA MODIFICATION N'EXIGE RIEN DE PLUS QU'AVANT. Une fiche importée peut n'avoir ni
   *  prénom ni e-mail — refuser de la corriger pour cette raison rendrait la correction impossible. */
  it('🔴 l’exigence de complétude ne s’applique QU’À la création', () => {
    expect(src).toContain('const manque = creation === undefined ? {} : manquesDeLaFiche({');
  });

  /** 🔴 TOUTE LA FICHE EN UNE SEULE ÉCRITURE : deux appels laisseraient une fiche nue au moindre refus. */
  it('🔴 le dépôt crée la personne ET ses coordonnées dans la même transaction', () => {
    const repo = readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8');
    const bloc = repo.slice(repo.indexOf('export async function creerPersonne'),
      repo.indexOf('export async function ajouterOccupant'));
    expect(bloc).toContain('withTransaction');
    expect(bloc).toContain('INSERT INTO gestion_annuaire_contact');
    // Et une fiche créée ici est intégralement à nous : chaque champ est verrouillé d'emblée.
    expect(bloc).toContain('await verrouiller(q,');
  });
});

describe('🔴 des cartes de même taille, et des boutons collés en bas', () => {
  /**
   * ══ 🔴🔴 TROIS RÈGLES, ET IL FAUT LES TROIS ════════════════════════════════════════════════════════════════
   * Arno : « toutes les cartes ont la même hauteur : la plus haute impose sa taille aux autres. Pas de hauteur
   * fixe arbitraire. Les boutons du bas sont TOUJOURS collés en bas, alignés au même niveau sur toutes les cartes
   * de la ligne, même quand une carte n'a que 2 boutons (bien vacant). »
   */
  it('🔴 la grille étire, les faits absorbent, le pied est poussé en bas', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain('.ann-cartes{align-items:stretch}');
    expect(src).toContain('.ann-carte-faits{flex:1 1 auto}');
    expect(src).toContain('.ann-carte-pied{margin-top:auto}');
    // 🔴 AUCUNE HAUTEUR FIXE sur une carte : elle couperait la plus haute au premier cartouche d'événement.
    expect(src).not.toMatch(/\.ann-carte\{[^}]*height:\s*\d/);
  });

  it('🔴 la rangée des cartes de personnes étire elle aussi', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(src).toContain('.cp-piste{display:flex;align-items:stretch');
  });
});

describe('🔴 le cartouche « Événement en cours »', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  it('🔴 il est JUSTE AU-DESSUS de la ligne SURFACE, sur toute la largeur', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    expect(carte.indexOf('<CartoucheEvenement')).toBeLessThan(carte.indexOf('Surface'));
    expect(src).toContain('.ann-cartouche{display:flex;align-items:center;justify-content:center;gap:.4rem;');
    expect(src).toContain('width:100%;');
  });

  /** ⚠️ AUCUNE COULEUR NOUVELLE : la paire d'alerte déjà employée par les replis du module. */
  it('🔴 orange SOBRE de la palette existante, jamais une couleur nouvelle', () => {
    const regle = src.slice(src.indexOf('.ann-cartouche{'), src.indexOf('.ann-cartouche:hover'));
    expect(regle).toContain('var(--color-svv-amber-soft)');
    expect(regle).toContain('var(--color-svv-amber)');
    expect(regle).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  /** 🔴 LE NOMBRE N'EST ÉCRIT QU'AU-DELÀ DE UN : « Événement en cours 1 » se lit comme un compteur à surveiller. */
  it('🔴 le nombre n’apparaît qu’à partir de deux, et rien ne s’affiche à zéro', () => {
    const c = src.slice(src.indexOf('function CartoucheEvenement'), src.indexOf('function CarteBien'));
    expect(c).toContain('if (nb <= 0) return null;');
    expect(c).toContain("nb > 1 ? `${nb} événements en cours` : 'Événement en cours'");
  });

  it('🔴 un clic ouvre les événements DE CE BIEN — la vie du bien, filtrée', () => {
    expect(src).toContain("ouvrirVieDuBien(lotId, 'evenement')");
    const vie = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
    expect(vie).toContain('filtreInitial');
    expect(vie).toContain('useState<FiltreVie>(filtreInitial)');
  });

  it('🔴 le MÊME cartouche en tête de la fiche du bien', () => {
    const vue = src.slice(src.indexOf('function VueLot'), src.indexOf('function grouperParPeriode'));
    expect(vue).toContain('<CartoucheEvenement nb={f.evenementsOuverts}');
    // Il est nourri par le dépôt, avec la même lecture que la carte.
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('evenementsOuverts: ev[0]?.n ?? 0');
  });

  /**
   * 🔴 UN BOUTON DANS UN BOUTON est du HTML invalide : le cartouche étant CLIQUABLE, le corps de la carte a dû
   * cesser d'être un bouton géant. C'est l'en-tête teinté qui ouvre le bien, et lui seul.
   */
  it('🔴 rien d’interactif n’est imbriqué dans autre chose d’interactif', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const corps = carte.slice(carte.indexOf('ann-carte-corps'), carte.indexOf('</button>'));
    expect(corps).not.toContain('<button');
    expect(corps).not.toContain('<a ');
    expect(corps).not.toContain('<CartoucheEvenement');
  });
});

describe('🔴 les boutons réagissent au survol', () => {
  /**
   * Arno : « fond légèrement teinté, bordure plus marquée, légère élévation, curseur main, transition courte.
   * Focus clavier visible. Même comportement en Sombre. »
   *
   * ⚠️ LE MOUVEMENT SE COUPE sous `prefers-reduced-motion` : une carte qui saute à chaque passage de souris
   * fatigue plus qu'elle n'informe, et c'est une exigence transverse du dépôt.
   */
  it('🔴 les boutons des cartes et de l’en-tête : fond, bordure, élévation, transition, focus', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    const regle = src.slice(src.indexOf('.ann-carte-bouton,.ann-tete-actions .svv-btn{'));
    expect(regle).toContain('cursor:pointer');
    expect(regle).toContain('transition:background .15s ease');
    expect(regle).toContain('background:var(--color-svv-field)');
    expect(regle).toContain('border-color:var(--color-svv-line-strong-hover)');
    expect(regle).toContain('transform:translateY(-1px)');
    expect(regle).toContain('outline:2px solid var(--color-svv-red)');
    expect(regle).toContain('prefers-reduced-motion');
    // En SOMBRE, c'est le contour clair qui fait le relief : une ombre noire sur fond sombre ne se voit pas.
    expect(regle).toContain("[data-theme='dark'] .ann-carte-bouton:hover");
    expect(regle).toContain('prefers-color-scheme:dark');
  });

  it('🔴 le crayon et le « ⋯ » des cartes réagissent de la même façon', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(src).toContain('.cp-icone:hover:not(:disabled){border-color:var(--color-svv-line-strong-hover)');
    expect(src).toContain('.cp-icone:focus-visible{outline:2px solid var(--color-svv-red)');
    expect(src).toContain(".svv-adm-root[data-theme='dark'] .cp-icone:hover:not(:disabled)");
  });
});
