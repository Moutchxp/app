import { estAdresseInterne } from './adresseInterne';
import { normaliserEmail, normaliserTelephone } from './annuaire';

/**
 * LOT FICHES-ANNUAIRE (étape C) — LES RÈGLES DE LA SAISIE. Module PUR : aucune base, aucun réseau, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI SE JOUE ICI. L'annuaire était en lecture seule : WIPPIMMO faisait foi, et rien ne pouvait être faux
 * sans l'être déjà à la source. À partir du moment où l'on SAISIT, chaque règle écrite ici décide de ce qui entre
 * dans la base — et un numéro mal accepté se retrouve dans un mail envoyé à un locataire.
 *
 * 🔴🔴 LES ADRESSES INTERNES SONT REFUSÉES COMME COORDONNÉE D'UNE PERSONNE. Demande d'Arno, et elle se comprend en
 * une phrase : `gestion@criterimmo.fr` sur la fiche d'un locataire ferait que TOUT mail venant de nous serait
 * rapproché de ce locataire — le moteur de propositions rattacherait notre propre courrier à son logement. C'est
 * exactement le défaut corrigé au lot BOITE-INTERNE-CORBEILLE, et on ne le laisse pas rentrer par la saisie.
 *
 * ⚠️ LE REFUS PORTE UN MOTIF EN FRANÇAIS, destiné à l'écran. « Invalide » n'apprend rien ; « c'est une adresse de
 * l'agence » dit quoi faire à la place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une coordonnée telle que l'écran la saisit, avant toute vérification. */
export interface CoordonneeSaisie {
  sorte: 'telephone' | 'email';
  /** Ce qui a été tapé, tel quel. C'est cette forme qu'on réaffiche — un numéro reformaté n'est plus reconnu. */
  valeur: string;
  /** Le libellé voulu (« Mobile », « Fixe », « Pro », « Email 1 »…). Vide = l'écran affichera le mot générique. */
  libelle: string;
}

/** Une coordonnée acceptée : sa forme canonique (pour comparer), sa forme saisie (pour afficher), son libellé. */
export interface CoordonneeRetenue {
  sorte: 'telephone' | 'email';
  valeur: string;
  valeurBrute: string;
  libelle: string | null;
  rang: number;
}

export type IssueCoordonnees =
  | { ok: true; retenues: CoordonneeRetenue[] }
  | { ok: false; motif: string; rang: number };

/** La longueur au-delà de laquelle un libellé n'est plus un libellé mais une phrase. */
export const LIBELLE_MAX = 40;
/** Une note libre reste une note : au-delà, c'est un document, et il a sa place dans le Drive. */
export const NOTE_MAX = 2000;

/**
 * ══ 🔴 VÉRIFIER ET NORMALISER UNE LISTE DE COORDONNÉES ════════════════════════════════════════════════════════
 *
 * L'ORDRE DE LA LISTE EST L'ORDRE VOULU : c'est lui qui devient le `rang`. Arno peut réordonner ses numéros, et
 * le premier est celui qu'on appelle.
 *
 * 🔴 ON REFUSE LA LISTE ENTIÈRE À LA PREMIÈRE ERREUR, en disant LAQUELLE (son rang). Accepter les bonnes et taire
 * les mauvaises ferait disparaître un numéro sans un mot — et c'est le genre de perte qu'on ne voit que le jour
 * où l'on en a besoin.
 *
 * ⚠️ LES DOUBLONS SONT REFUSÉS, sur la forme CANONIQUE : « 06 12 34 56 78 » et « +33612345678 » sont le même
 * numéro, et les garder tous les deux ferait deux lignes pour un seul téléphone.
 */
export function verifierCoordonnees(saisies: readonly CoordonneeSaisie[]): IssueCoordonnees {
  const retenues: CoordonneeRetenue[] = [];
  const vues = new Set<string>();
  for (const [rang, c] of saisies.entries()) {
    const brut = (c.valeur ?? '').trim();
    if (brut === '') return { ok: false, motif: 'Cette coordonnée est vide.', rang };

    if (c.sorte === 'email') {
      const normalise = normaliserEmail(brut);
      if (normalise === null) {
        return { ok: false, motif: `« ${brut} » n’est pas une adresse e-mail.`, rang };
      }
      /**
       * 🔴🔴 LE REFUS DES ADRESSES DE LA MAISON. Une adresse `@criterimmo.fr` ou `@sansvisavis.com` sur la fiche
       * d'un propriétaire ou d'un locataire ferait rapprocher NOTRE propre courrier de cette personne : le moteur
       * de propositions désignerait son logement à chaque mail que nous écrivons.
       */
      if (estAdresseInterne(normalise)) {
        return {
          ok: false,
          motif: `« ${brut} » est une adresse de l’agence : elle ne peut pas être la coordonnée d’un `
            + 'propriétaire ni d’un locataire. Mettez l’adresse personnelle de la personne.',
          rang,
        };
      }
      if (vues.has(`email:${normalise}`)) {
        return { ok: false, motif: `« ${brut} » est déjà dans la liste.`, rang };
      }
      vues.add(`email:${normalise}`);
      retenues.push({ sorte: 'email', valeur: normalise, valeurBrute: brut, libelle: libellePropre(c.libelle), rang });
      continue;
    }

    const normalise = normaliserTelephone(brut);
    if (normalise === null) {
      return { ok: false, motif: `« ${brut} » n’est pas un numéro de téléphone lisible.`, rang };
    }
    if (vues.has(`tel:${normalise}`)) {
      return { ok: false, motif: `« ${brut} » est déjà dans la liste.`, rang };
    }
    vues.add(`tel:${normalise}`);
    retenues.push({ sorte: 'telephone', valeur: normalise, valeurBrute: brut, libelle: libellePropre(c.libelle), rang });
  }
  return { ok: true, retenues };
}

/** Un libellé propre, borné. `null` quand il n'y en a pas : l'écran affiche alors le mot générique. PUR. */
export function libellePropre(brut: string | null | undefined): string | null {
  const s = (brut ?? '').replace(/\s+/g, ' ').trim().slice(0, LIBELLE_MAX);
  return s === '' ? null : s;
}

/** Un champ de texte libre, propre et borné. Rend `null` pour une chaîne vide — jamais `''`, qui se lit mal. PUR. */
export function texteOuRien(brut: string | null | undefined, max = 200): string | null {
  const s = (brut ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
}

/** La note libre garde ses retours à la ligne : c'est une note, pas un titre. PUR. */
export function notePropre(brut: string | null | undefined): string | null {
  const s = (brut ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, NOTE_MAX);
  return s === '' ? null : s;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'ORDRE DES CARTES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'il faut savoir d'une personne pour la ranger. */
export interface PersonneARanger {
  id: number;
  civilite: string | null;
  nom: string;
  /** L'ordre réglé À LA MAIN. `0` = jamais réglé : on retombe alors sur l'ordre par défaut. */
  rang: number;
}

/**
 * ══ 🔴 L'ORDRE DES CARTES : MONSIEUR, MADAME, PUIS LES AUTRES ═════════════════════════════════════════════════
 *
 * Demande d'Arno, mot pour mot : « Monsieur en premier, Madame en deuxième, puis les autres (société,
 * représentant…) ; l'ordre se règle à la main dans le mode Modifier ».
 *
 * 🔴 LE RANG RÉGLÉ À LA MAIN L'EMPORTE TOUJOURS. L'ordre par civilité n'est qu'un DÉFAUT — celui qu'on applique
 * tant que personne n'a rien dit. Le jour où Arno place la société en premier, aucune règle ne doit la ramener
 * en troisième position la fois suivante.
 *
 * ⚠️ « MONSIEUR » SE RECONNAÎT SOUS PLUSIEURS FORMES (« M. », « M », « Mr », « Monsieur ») : WIPPIMMO n'écrit pas
 * toujours la même. On compare sur une forme réduite, sans accent ni ponctuation. PUR.
 */
export function ordreDesCartes<T extends PersonneARanger>(personnes: readonly T[]): T[] {
  return [...personnes].sort((a, b) => {
    // ① Le rang réglé à la main, quand il existe — et il gagne sur tout le reste.
    const ra = a.rang > 0 ? a.rang : Number.MAX_SAFE_INTEGER;
    const rb = b.rang > 0 ? b.rang : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    // ② À défaut, la civilité : Monsieur, Madame, puis les autres.
    const ca = poidsCivilite(a.civilite);
    const cb = poidsCivilite(b.civilite);
    if (ca !== cb) return ca - cb;
    // ③ À défaut encore, le nom — pour que deux affichages successifs ne se permutent pas.
    return a.nom.localeCompare(b.nom, 'fr');
  });
}

/** 0 = Monsieur, 1 = Madame, 2 = tout le reste (société, représentant, civilité absente). PUR. */
export function poidsCivilite(civilite: string | null | undefined): number {
  const c = (civilite ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
  if (c === 'm' || c === 'mr' || c === 'monsieur') return 0;
  if (c === 'mme' || c === 'madame' || c === 'mlle' || c === 'mademoiselle') return 1;
  return 2;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   SÉPARER UNE FICHE EN DEUX PERSONNES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LES DEUX NOMS QU'UNE FICHE PORTE — PROPOSÉS, JAMAIS APPLIQUÉS ════════════════════════════════════════
 *
 * Mesuré le 29/09/2026 : 66 fiches de propriétaires sur 307 et 116 de locataires sur 510 nomment DEUX personnes
 * dans leur nom (« AISSAOUI Mohamed et Amina », « BARKAOUI Meriem et CHAABANE Mohamed », « Société CLK -
 * M. MOTHERON et M. WATIEZ »). Elles sont ingérables telles quelles : on ne sait pas quel numéro est à qui.
 *
 * 🔴 CETTE FONCTION NE DÉCIDE RIEN. Elle PROPOSE une coupure, à l'endroit le plus probable, et c'est tout. Arno
 * relit les deux noms, les corrige s'il le faut, et RÉPARTIT LUI-MÊME chaque téléphone et chaque e-mail par des
 * cases à cocher. Une répartition automatique se tromperait une fois sur trois — et personne ne le verrait avant
 * d'appeler le mauvais numéro.
 *
 * ⚠️ « AISSAOUI Mohamed et Amina » : le NOM DE FAMILLE se partage, seuls les prénoms diffèrent. On le rend alors
 * aux deux (« AISSAOUI Mohamed », « AISSAOUI Amina »), parce que « Amina » toute seule ne désigne personne dans
 * une liste de 510 locataires. C'est une proposition : elle se corrige à l'écran.
 */
export interface PropositionDeCoupure {
  /** Vrai quand la fiche semble porter deux personnes. Faux = on ne propose rien, et l'écran le dit. */
  possible: boolean;
  premier: string;
  second: string;
  /** Ce qui a fait croire à deux personnes, pour que l'écran puisse l'expliquer. */
  motif: string | null;
}

/** Les mots qui, entourés d'espaces, séparent deux personnes dans un nom. Ordre = priorité d'essai. */
const SEPARATEURS = [' et ', ' & ', ' ET ', ' / '];

export function proposerCoupure(nomComplet: string): PropositionDeCoupure {
  const nom = (nomComplet ?? '').replace(/\s+/g, ' ').trim();
  const separateur = SEPARATEURS.find((s) => nom.includes(s)) ?? null;
  if (separateur === null) {
    return { possible: false, premier: nom, second: '', motif: null };
  }
  const coupe = nom.indexOf(separateur);
  const gauche = nom.slice(0, coupe).trim();
  const droite = nom.slice(coupe + separateur.length).trim();
  if (gauche === '' || droite === '') {
    return { possible: false, premier: nom, second: '', motif: null };
  }

  /**
   * 🔴 LE NOM DE FAMILLE SE PARTAGE QUAND LE SECOND MORCEAU N'EN PORTE PAS. « AISSAOUI Mohamed et Amina » : la
   * droite (« Amina ») est un seul mot, et il commence par une majuscule suivie de minuscules — un prénom. On
   * préfixe alors du nom de famille de gauche. « BARKAOUI Meriem et CHAABANE Mohamed » : la droite en porte
   * deux, dont un tout en majuscules — on n'y touche pas.
   */
  const motsDroite = droite.split(' ');
  const seulPrenom = motsDroite.length === 1 && /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(motsDroite[0]);
  const famille = gauche.split(' ').filter((m) => m === m.toUpperCase() && m.length > 1).join(' ');
  const second = seulPrenom && famille !== '' ? `${famille} ${droite}` : droite;

  return {
    possible: true,
    premier: gauche,
    second,
    motif: `Ce nom contient « ${separateur.trim()} » : il désigne probablement deux personnes.`,
  };
}

/** À qui va chaque coordonnée, décidé À LA MAIN dans l'écran de séparation. */
export type PartDeCoordonnee = 'premier' | 'second' | 'les_deux';

export interface RepartitionCoordonnee {
  /** L'identifiant de la coordonnée existante. */
  contactId: number;
  part: PartDeCoordonnee;
}

/**
 * VÉRIFIE une demande de séparation, AVANT toute écriture.
 *
 * 🔴 LES DEUX NOMS DOIVENT ÊTRE RENSEIGNÉS ET DIFFÉRENTS : séparer une fiche en deux fiches du même nom ne
 * sépare rien, et laisse deux doublons que personne ne saura départager ensuite. PUR.
 */
export function verifierSeparation(premier: string, second: string): { ok: true } | { ok: false; motif: string } {
  const a = (premier ?? '').replace(/\s+/g, ' ').trim();
  const b = (second ?? '').replace(/\s+/g, ' ').trim();
  if (a === '' || b === '') return { ok: false, motif: 'Les deux noms doivent être renseignés.' };
  if (a.toLowerCase() === b.toLowerCase()) {
    return { ok: false, motif: 'Les deux noms sont identiques : il n’y aurait rien à séparer.' };
  }
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS DE L'ÉCRAN
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Le motif affiché sur « Modifier » quand la migration 278 n'est pas là. Écrit UNE fois : l'écran, la route et
 * les épreuves doivent dire exactement la même chose.
 */
export const MOTIF_SANS_MIGRATION =
  'Modification impossible pour l’instant : une mise à jour de la base (migration 278) doit être appliquée. '
  + 'Sans elle, une correction saisie ici serait écrasée au prochain import WIPPIMMO.';

/** La phrase de confirmation d'un archivage. Elle DIT ce qui est gardé — c'est ce qui rend le geste acceptable. */
export function phraseArchivage(nom: string): string {
  return `Archiver ${nom} ? La fiche sort de l’annuaire actif. Rien n’est supprimé : ses mails, ses `
    + 'rattachements et son historique restent, et « Restaurer » la ramène.';
}
