/**
 * ══ 🔴🔴 LOT SUPPRIMER-CARTE — « CETTE FICHE EXISTE-T-ELLE ENCORE ? », ÉCRIT UNE SEULE FOIS. Module PUR. ══════
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`. Ce module est lu par `CartesPersonnes.tsx`, un composant du NAVIGATEUR : la
 * version qui importait `./schema` (donc `../db/client`, donc `pg`) a été attrapée par
 * `clientBoundary.guard.test.ts` en une seconde. C'est l'incident du 24/09/2026, où webpack a refusé de
 * construire et où TOUTE l'application est tombée, page de connexion comprise, avec 8 800 tests au vert.
 *
 * 🔴 D'OÙ LA SÉPARATION : ici les DÉCISIONS et les MOTS (purs) ; dans `personneVivanteSql.ts` le fragment qui
 * interroge la sonde. L'écran ne lit que ce fichier-ci.
 *
 * Arno : « la personne n'apparaît plus NULLE PART dans l'app ».
 *
 * 🔴 « NULLE PART » SE TIENT PAR UN SEUL FRAGMENT, PAS PAR LA DISCIPLINE. Les deux tables de personnes sont lues
 * à soixante-deux endroits du module. Recopier `supprime_le IS NULL` à la main aurait donné soixante-deux
 * occasions d'en oublier un — et un seul oubli fait reparaître quelqu'un dans un coin de l'application, des
 * semaines plus tard, sans que rien ne l'explique.
 *
 * 🔴 LA COLONNE N'EST NOMMÉE QUE SI ELLE EXISTE. Sans la migration 287, ce fragment rend `true` : les requêtes
 * sont alors mot pour mot celles d'avant ce lot. Nommer une colonne absente ferait échouer la lecture de
 * l'annuaire ENTIÈRE. Règle du module depuis le lot 4a.
 */

/**
 * LE MÊME FRAGMENT, SYNCHRONE, pour les modules PURS et pour les requêtes qui ont déjà sondé.
 *
 * ⚠️ REÇU EN PARAMÈTRE : c'est le patron du module (`spamConnu`, `corbeilleConnue`, `nomUsageConnu`). Un module
 * pur qui sonderait lui-même cesserait d'être éprouvable sans base.
 */
export function personneVivanteAvec(avecSuppression: boolean, alias: string): string {
  return avecSuppression ? `${alias}.supprime_le IS NULL` : 'true';
}

/**
 * ══ 🔴 CE QUE LA CONFIRMATION DIT, MOT POUR MOT ═══════════════════════════════════════════════════════════════
 *
 * Arno : « Supprimer la fiche de <civilité nom> ? Elle disparaîtra de cette fiche, de l'annuaire et des
 * propositions. »
 *
 * 🔴 LA PHRASE DIT CE QUI ARRIVE VRAIMENT, et elle ne dit RIEN de plus. Elle ne promet pas que « rien n'est
 * perdu » — ce serait vrai en base et faux à l'écran, donc trompeur. Elle nomme les trois endroits d'où la fiche
 * disparaît, qui sont ceux où l'on s'attend à la retrouver.
 */
export function phraseSuppression(nomAffiche: string): string {
  const nom = nomAffiche.trim();
  return `Supprimer la fiche de ${nom === '' ? 'cette personne' : nom} ? `
    + 'Elle disparaîtra de cette fiche, de l’annuaire et des propositions.';
}

/**
 * 🔴 « CIVILITÉ NOM », COMME LE TITRE DE LA CARTE. Arno a écrit « Supprimer la fiche de <civilité nom> ? » : la
 * phrase doit nommer la personne EXACTEMENT comme la carte au-dessus d'elle la nomme, sinon on confirme la
 * suppression d'un nom qu'on ne lit nulle part ailleurs à l'écran — et sur une fiche à plusieurs cartes, deux
 * homonymes ne se distinguent parfois QUE par la civilité.
 *
 * ⚠️ LA CIVILITÉ PEUT ÊTRE ABSENTE OU BLANCHE (une société n'en a pas) : on ne colle alors rien devant le nom,
 * et surtout pas une espace qui ferait « Supprimer la fiche de  Dupont ? ».
 */
export function nomAvecCivilite(civilite: string | null, nomAffiche: string): string {
  const titre = (civilite ?? '').trim();
  const nom = nomAffiche.trim();
  return titre === '' || nom === '' ? nom : `${titre} ${nom}`;
}

/**
 * 🔴 LE MOTIF DU REFUS, quand il ne reste qu'une carte. Écrit une fois : l'infobulle de l'écran et le refus du
 * serveur disent LA MÊME phrase — deux formulations feraient douter qu'il s'agisse de la même règle.
 */
export const MOTIF_DERNIERE_CARTE = 'Une fiche doit garder au moins un propriétaire.';

/** Le mot du lien qui montre les archivées. `0` ⇒ pas de lien : rien à montrer. PUR. */
export function motVoirArchivees(n: number): string {
  return `Voir les archivées (${n})`;
}
