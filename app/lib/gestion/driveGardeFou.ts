/**
 * MODULE « GESTION » — LOT DRIVE-1 : LE DOUBLE GARDE-FOU DES ÉCRITURES DRIVE. Module PUR (aucune base, aucun
 * réseau, aucune horloge) — et c'est délibéré : une protection qui dépendrait d'une réponse réseau pourrait être
 * mise en défaut par une panne de réseau.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 EXIGENCE D'ARNO DU 26/09/2026, PRIORITAIRE SUR TOUT LE RESTE. Ce lot CRÉE un dossier neuf et son contenu. Il ne
 * modifie, ne renomme, ne déplace, ne supprime, ne partage, ne copie et ne dépose RIEN dans ce qui existait avant
 * lui — « Documents clients scannés » au premier chef, et pas davantage le reste de « GESTION LOCATIVE ».
 *
 * 🔴 DEUX GARDES, ET IL FAUT LES DEUX. Ils ne protègent pas de la même chose :
 *
 *   ① SOUS LA RACINE. Le parent doit être la racine « Base de données locative », ou l'un de ses descendants.
 *      Vérifié en REMONTANT les parents jusqu'à elle. Ce garde attrape la faute de programmation : un identifiant
 *      de dossier qui vient d'ailleurs (copié-collé, lu dans un autre écran, rendu par une recherche).
 *
 *   ② LISTE BLANCHE. Le parent doit être un dossier que LE PROGRAMME A LUI-MÊME CRÉÉ, enregistré en base à la
 *      seconde où il l'a créé. Ce garde attrape ce que ① laisserait passer : un dossier qu'un humain aurait déposé
 *      à la main SOUS notre racine. Il est sous la racine — ① l'accepterait —, mais nous ne l'avons pas fait, donc
 *      nous n'y touchons pas. C'est la différence entre « mon territoire » et « ce que j'ai construit ».
 *
 * 🔴 CE MODULE NE SAIT PAS ÉCRIRE. Il rend un verdict, rien d'autre. C'est `driveEcriture.ts` qui l'interroge AVANT
 * chaque appel à Drive, et qui n'a aucun autre chemin pour écrire. Séparer les deux permet d'éprouver la règle sans
 * réseau — ce que fait `driveGardeFou.test.ts`, exhaustivement.
 *
 * ⚠️ AUCUNE OPTION NE LE CONTOURNE. Pas de `--force`, pas de mode « je sais ce que je fais ». Un garde-fou qui a une
 * porte dérobée n'est pas un garde-fou : c'est une convention.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le nom de la racine, écrit UNE fois. C'est aussi ce qu'on cherche pour refuser de la recréer. */
export const RACINE_NOM = 'Base de données locative';

/** Le Drive partagé dans lequel — et dans lequel SEULEMENT — la racine a le droit de naître. */
export const DRIVE_NOM = 'GESTION LOCATIVE';

/**
 * Profondeur maximale d'ascension. L'arborescence en fait 5 (racine → biens → bien → rubrique → occupation) ; 32
 * laisse une marge confortable et BORNE la boucle : une table abîmée par un cycle ne doit pas figer le programme.
 */
export const ASCENSION_MAX = 32;

/** Les opérations d'écriture Drive. Le garde vaut pour TOUTES, pas seulement pour la création. */
export type OperationDrive =
  | 'creer_dossier' | 'creer_raccourci' | 'modifier' | 'copier' | 'supprimer' | 'partager' | 'deposer';

/** Un dossier que nous avons créé, tel qu'il est mémorisé. C'est la ligne de `gestion_drive_arbre`. */
export interface NoeudArbre {
  driveId: string;
  /** `null` pour la racine, et pour elle seule. */
  parentDriveId: string | null;
  sorte: string;
  nom: string;
  chemin: string;
}

export type Verdict =
  | { ok: true }
  | { ok: false; garde: 'hors_racine' | 'hors_liste_blanche' | 'racine_existante' | 'autre'; motif: string };

/**
 * L'index de la liste blanche : identifiant Drive → nœud. Construit une fois par passe, à partir de la base.
 *
 * ⚠️ UN RACCOURCI N'EST PAS UN PARENT POSSIBLE. Drive le refuserait de toute façon, mais on le dit ici : un
 * raccourci qui servirait de parent ferait sortir l'écriture de l'arborescence par la porte de derrière.
 */
export type IndexArbre = ReadonlyMap<string, NoeudArbre>;

export function indexer(noeuds: readonly NoeudArbre[]): Map<string, NoeudArbre> {
  const m = new Map<string, NoeudArbre>();
  for (const n of noeuds) m.set(n.driveId, n);
  return m;
}

/** La racine mémorisée, ou `null` si l'arborescence n'existe pas encore. PUR. */
export function racineDe(index: IndexArbre): NoeudArbre | null {
  for (const n of index.values()) if (n.sorte === 'racine') return n;
  return null;
}

/**
 * ① LE PARENT EST-IL LA RACINE OU L'UN DE SES DESCENDANTS ? On remonte les parents, un par un.
 *
 * Rend le chemin parcouru (du parent vers la racine) quand il aboutit, `null` sinon. Le chemin sert au message de
 * refus : dire « ce dossier n'est pas sous la racine » sans montrer où il mène n'aide personne à comprendre.
 */
export function ascensionVersRacine(depart: string, index: IndexArbre): NoeudArbre[] | null {
  const chemin: NoeudArbre[] = [];
  const vus = new Set<string>();
  let courant: string | null = depart;

  for (let i = 0; i < ASCENSION_MAX && courant !== null; i += 1) {
    if (vus.has(courant)) return null;        // cycle : table abîmée, on refuse plutôt que de boucler
    vus.add(courant);
    const n: NoeudArbre | undefined = index.get(courant);
    if (n === undefined) return null;          // chaînon absent : on ne peut RIEN affirmer, donc on refuse
    chemin.push(n);
    if (n.sorte === 'racine') return chemin;   // arrivé
    courant = n.parentDriveId;
  }
  return null;
}

/**
 * LE VERDICT SUR UNE ÉCRITURE. C'est la seule fonction que `driveEcriture` appelle, et elle décide de tout.
 *
 * 🔴 L'ORDRE DES VÉRIFICATIONS N'EST PAS INDIFFÉRENT : on exige d'abord un parent, puis la liste blanche (②), puis
 * l'ascension (①). La liste blanche d'abord parce que c'est la condition la plus forte et la moins coûteuse : si le
 * parent n'est pas un dossier que nous avons créé, il n'y a rien d'autre à examiner.
 */
export function verifierEcriture(
  demande: {
    operation: OperationDrive;
    /** Le dossier dans lequel on veut écrire. Toujours exigé — même pour une suppression. */
    parentDriveId: string | null | undefined;
    /** L'élément visé, quand il existe déjà (modification, suppression, partage). */
    cibleDriveId?: string | null;
  },
  index: IndexArbre,
): Verdict {
  const parent = (demande.parentDriveId ?? '').trim();
  if (parent === '') {
    return {
      ok: false, garde: 'autre',
      motif: 'Écriture refusée : aucun dossier parent n’est indiqué. Une écriture sans parent ne peut pas être '
        + 'située, donc elle ne peut pas être autorisée.',
    };
  }

  const racine = racineDe(index);
  if (racine === null) {
    return {
      ok: false, garde: 'hors_liste_blanche',
      motif: `Écriture refusée : la racine « ${RACINE_NOM} » n’est pas enregistrée. Tant qu’elle n’existe pas, `
        + 'aucune écriture Drive n’est possible — il n’y a pas de territoire où écrire.',
    };
  }

  // ── ② LISTE BLANCHE ───────────────────────────────────────────────────────────────────────────────────────────
  const noeudParent = index.get(parent);
  if (noeudParent === undefined) {
    return {
      ok: false, garde: 'hors_liste_blanche',
      motif: `Écriture refusée (liste blanche) : le dossier ${parent} n’a pas été créé par ce programme. Seuls les `
        + 'dossiers que nous avons créés nous-mêmes, et enregistrés à cette seconde-là, peuvent recevoir une '
        + 'écriture — même un dossier posé à la main sous notre racine reste intouchable.',
    };
  }
  if (noeudParent.sorte === 'raccourci') {
    return {
      ok: false, garde: 'hors_liste_blanche',
      motif: `Écriture refusée : « ${noeudParent.nom} » est un RACCOURCI, pas un dossier. Écrire « dans » un `
        + 'raccourci écrirait en réalité ailleurs — exactement ce que ce garde interdit.',
    };
  }

  // ── ① SOUS LA RACINE ──────────────────────────────────────────────────────────────────────────────────────────
  const chemin = ascensionVersRacine(parent, index);
  if (chemin === null) {
    return {
      ok: false, garde: 'hors_racine',
      motif: `Écriture refusée (hors racine) : en remontant les parents de ${parent}, on n’atteint pas `
        + `« ${RACINE_NOM} ». Tout ce qui est hors de cette racine — « Documents clients scannés » compris — est `
        + 'défendu.',
    };
  }

  // Une écriture qui VISE un élément existant doit viser un élément à nous, lui aussi.
  const cible = (demande.cibleDriveId ?? '').trim();
  if (cible !== '') {
    const noeudCible = index.get(cible);
    if (noeudCible === undefined) {
      return {
        ok: false, garde: 'hors_liste_blanche',
        motif: `Écriture refusée (liste blanche) : l’élément visé ${cible} n’a pas été créé par ce programme.`,
      };
    }
    if (ascensionVersRacine(cible, index) === null) {
      return {
        ok: false, garde: 'hors_racine',
        motif: `Écriture refusée (hors racine) : l’élément visé ${cible} n’est pas sous « ${RACINE_NOM} ».`,
      };
    }
  }

  return { ok: true };
}

/**
 * LE VERDICT SUR LA CRÉATION DE LA RACINE — le seul cas où l'on écrit HORS de l'arborescence, et donc le seul qui
 * échappe aux deux gardes ci-dessus. Il a ses propres conditions, et elles sont serrées :
 *
 *   · le parent doit être EXACTEMENT le Drive partagé « GESTION LOCATIVE » (son identifiant, vérifié par l'appelant
 *     qui l'a lu chez Google, jamais un nom saisi) ;
 *   · aucune racine ne doit être déjà enregistrée chez nous ;
 *   · aucun élément du même nom ne doit exister dans le Drive — s'il y en a un, on S'ARRÊTE et on demande. On ne le
 *     réutilise pas : ce serait adopter un dossier dont on ignore l'origine et le contenu, et le faire entrer d'un
 *     coup dans la liste blanche.
 */
export function verifierCreationRacine(
  demande: { driveIdCible: string; driveIdAttendu: string; homonymesTrouves: readonly { id: string; nom: string }[] },
  index: IndexArbre,
): Verdict {
  if (demande.driveIdCible !== demande.driveIdAttendu) {
    return {
      ok: false, garde: 'autre',
      motif: `Création refusée : la racine ne peut naître que dans le Drive partagé « ${DRIVE_NOM} » `
        + `(${demande.driveIdAttendu}), et non dans ${demande.driveIdCible}.`,
    };
  }
  const deja = racineDe(index);
  if (deja !== null) {
    return {
      ok: false, garde: 'racine_existante',
      motif: `Création refusée : une racine est déjà enregistrée (${deja.driveId}). La construction doit la `
        + 'réutiliser, pas en créer une seconde.',
    };
  }
  if (demande.homonymesTrouves.length > 0) {
    const liste = demande.homonymesTrouves.map((h) => `« ${h.nom} » (${h.id})`).join(', ');
    return {
      ok: false, garde: 'racine_existante',
      motif: `Création ARRÊTÉE : un élément nommé « ${RACINE_NOM} » existe déjà dans « ${DRIVE_NOM} » — ${liste}. `
        + 'Ce lot ne réutilise pas et ne modifie pas un dossier qu’il n’a pas créé. Arno doit trancher : le '
        + 'renommer, le supprimer, ou choisir un autre nom de racine.',
    };
  }
  return { ok: true };
}

/**
 * NETTOIE UN NOM DE DOSSIER pour Drive.
 *
 * Drive n'interdit en réalité presque rien. On retire donc le strict nécessaire : les CARACTÈRES DE CONTRÔLE (qui
 * rendent un nom illisible et cassent les exports), les espaces multiples, et on borne la longueur — un nom de
 * 300 caractères est illisible dans une colonne.
 *
 * ⚠️ LA BARRE OBLIQUE EST CONSERVÉE, et c'est un correctif : elle avait d'abord été remplacée par un tiret « par
 * prudence », ce qui transformait en silence « entrée 01/09/2022 » en « entrée 01-09-2022 » — donc un format de
 * date qu'Arno avait explicitement demandé. Drive accepte la barre oblique dans un nom ; nettoyer au-delà du
 * nécessaire, c'est déformer la donnée sans que personne ne l'ait demandé. (Défaut trouvé par le test du plan.)
 *
 * ⚠️ ON NE TRANSLITTÈRE PAS LES ACCENTS NON PLUS : « Frédéric » doit s'écrire « Frédéric ». Drive les gère
 * parfaitement, et un nom déformé rendrait le dossier introuvable à l'œil.
 */
export const NOM_MAX = 120;

export function nettoyerNom(brut: string): string {
  const propre = (brut ?? '')
    // Les caractères de contrôle : ils rendent un nom illisible et cassent les exports.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (propre === '') return 'sans nom';
  if (propre.length <= NOM_MAX) return propre;
  // On coupe sur un espace quand c'est possible : un nom tronqué au milieu d'un mot se lit mal.
  const coupe = propre.slice(0, NOM_MAX - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > NOM_MAX / 2 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

