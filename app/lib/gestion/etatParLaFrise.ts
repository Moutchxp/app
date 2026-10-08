/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — L'ÉTAT D'UN ÉVÉNEMENT SE DÉDUIT DE SES CARTES DE BORNE. MODULE PUR. ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (08/10/2026) : sur le bien 315, GES-2026-000001 s'affichait « clos · clos le 08/10/2026 » alors
 * qu'il n'y avait PLUS de carte Clôture sur sa frise — il venait de la supprimer. Supprimer la carte n'avait pas
 * rouvert l'événement, parce que l'état vivait AILLEURS que sur la frise : dans `gestion_evenement.etat`, écrit
 * une fois par le geste qui avait posé la carte, et plus jamais relu depuis elle.
 *
 * RÈGLE D'ARNO, SOURCE UNIQUE DE VÉRITÉ :
 *   1. « L'état d'un événement se déduit des cartes de BORNE de sa frise (Ouverture, Clôture, Réouverture,
 *      Clôture Monga validée), dans l'ordre de leurs dates : la dernière borne est une Clôture → l'événement est
 *      CLOS ; sinon → il est OUVERT. »
 *   2. « Supprimer la carte Clôture d'un événement clos le ROUVRE, sans carte Réouverture. »
 *   3. « Poser une carte Réouverture le rouvre aussi. »
 *   4. « Quand l'événement est clos, la grille ne propose QUE “Réouverture”. »
 *   5. « Les PÉRIODES se calculent à partir des bornes (Ouverture→Clôture, Réouverture→Clôture suivante,
 *      Réouverture→aujourd'hui si non reclose). Un mail ne porte “Événement en cours” que s'il est daté DANS une
 *      période ouverte. »
 *
 * ═══ 🔴🔴 LE CHOIX DE CONCEPTION, ET POURQUOI C'EST LE PLUS SÛR DES DEUX ═══════════════════════════════════════
 *
 * Arno en proposait deux : CALCULER à chaque lecture, ou RECALCULER la colonne à chaque écriture de carte.
 * C'est le PREMIER qui est retenu, et la raison tient en une phrase :
 *
 *   🔴 RIEN DE STOCKÉ NE PEUT CONTREDIRE LA FRISE SI RIEN DE STOCKÉ N'EST CONSULTÉ.
 *
 * Recalculer la colonne demande que CHAQUE écriture pense à appeler la fonction — la route d'aujourd'hui, celle
 * de demain, un script de reprise, une correction à la main en psql. C'est une garantie de VIGILANCE. Calculer à
 * la lecture est une garantie de CONSTRUCTION : il n'existe plus de valeur à mettre d'accord.
 *
 * 🔴 ET C'EST LA SEULE DES DEUX QUI RÉPARE LE CAS D'ARNO SANS RIEN ÉCRIRE EN BASE. Dès ce lot en place,
 * GES-2026-000001 se lit OUVERT parce que sa frise le dit — sans migration, sans reprise de données, et sans
 * toucher à un seul événement réel (Arno demande justement la liste AVANT toute correction, point D).
 *
 * ⚠️ `gestion_evenement.etat` ET `traite_le` NE SONT PAS SUPPRIMÉES, ET RIEN N'EST ÉCRIT DEDANS PAR CE LOT. Elles
 * restent exactement ce qu'elles étaient, simplement plus consultées pour dire « ouvert / clos ». La colonne
 * `etat` garde un sens PROPRE — « à traiter » contre « en cours », l'avancement de celui qui s'en occupe — et il
 * reste écrit par le sélecteur à trois boutons de la carte en plein écran. Voir `ETATS_DE_TRAVAIL`.
 *
 * ═══ 🔴🔴 UNE SEULE ÉCRITURE DE LA RÈGLE, ET ELLE EST EN SQL ════════════════════════════════════════════════════
 *
 * Le pli (ouvrir, fermer, rouvrir) est écrit UNE fois, ici, sous forme de SQL ÉMIS PAR CE MODULE. Il n'en existe
 * pas de seconde version en TypeScript, et c'est délibéré : le filtre « Événement ouvert » doit s'appliquer AVANT
 * la pagination et le compteur, donc en SQL ; une version TypeScript à côté aurait été la deuxième vérité que ce
 * lot vient justement supprimer.
 *
 * 🔴 CE QUI EST PUR ICI, ET DONC ÉPROUVÉ SANS BASE : la CLASSIFICATION (quel type est une borne, dans quel sens,
 * quand une borne est acquise, dans quel ordre elles se lisent). Le SQL est ENGENDRÉ à partir d'elle — il ne
 * recopie ni la liste des types, ni les rangs, qui viennent de `mongaEtape` et de `frise`.
 *
 * ⚠️ LE PLI LUI-MÊME SE VÉRIFIE SUR LA VRAIE BASE (`etatParLaFrise.itest.ts`), en LECTURE SEULE : l'épreuve passe
 * des bornes littérales (`VALUES`) à la MÊME requête que la production, sans créer la moindre ligne. C'est
 * possible parce que la source des bornes est un PARAMÈTRE du générateur, comme `sqlEvenementsDesMessages` le
 * fait déjà dans `historiqueRepo`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { rangEtape, type TypeEtape } from './mongaEtape';
import { TYPES_BORNE } from './frise';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA CLASSIFICATION — PURE, ET C'EST ELLE QUI ENGENDRE LE SQL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'une carte de borne fait à la période en cours. `null` = ce n'est pas une borne. */
export type SensDeBorne = 'ouvre' | 'ferme';

/**
 * Les cartes qui OUVRENT une période, et celles qui la FERMENT.
 *
 * 🔴 DÉRIVÉES DE `TYPES_BORNE`, PAS RECOPIÉES. C'est la même liste que celle des cartes à date centrée du lot
 * FRISE-COULEURS-DATES, et ce n'est pas une coïncidence : une borne est exactement une carte dont la DATE est le
 * fait. Le jour où une quatrième borne apparaît là-bas, le compilateur l'amène ici.
 */
export const BORNES_FERMANTES: readonly TypeEtape[] = TYPES_BORNE.filter((t) => t === 'cloture');
export const BORNES_OUVRANTES: readonly TypeEtape[] = TYPES_BORNE.filter((t) => t !== 'cloture');

export function sensDeLaBorne(t: TypeEtape): SensDeBorne | null {
  if (BORNES_FERMANTES.includes(t)) return 'ferme';
  if (BORNES_OUVRANTES.includes(t)) return 'ouvre';
  return null;
}

/**
 * ══ 🔴🔴 QUAND UNE BORNE COMPTE — ET POURQUOI LES DEUX SENS NE SE VALENT PAS ═════════════════════════════════════
 *
 * ARNO écrit « Clôture Monga VALIDÉE », et il ne le dit que de la clôture. Ce n'est pas une inattention, c'est la
 * différence entre les deux sens :
 *
 *   · FERMER est une CONSÉQUENCE — le bien perd son événement ouvert, les mails qui suivent sortent de la
 *     période. Une clôture seulement LUE dans un mail Monga, pas encore confirmée, ne doit pas produire cela :
 *     elle s'affiche en AMBRE sur la frise avec ses deux boutons ✓ / ✕, et c'est le ✓ qui en fait un fait.
 *     Mesuré le 08/10/2026 : **5 clôtures Monga** sont dans cet état.
 *
 *   · OUVRIR ne fait que DATER un début. La frise montre TOUJOURS une carte d'ouverture (enregistrée, ou dérivée
 *     de `gestion_evenement.ouvert_le`), et une période a besoin d'un début : refuser une ouverture « à
 *     confirmer » laisserait l'événement sans borne basse, donc sans période du tout, donc sans aucun mail
 *     étiqueté. Mesuré : **37 ouvertures Monga** sont « à confirmer ».
 *
 * ⚠️ UNE CARTE ÉCARTÉE N'EST PAS SUR LA FRISE, dans aucun sens : `construireFrise` la retire (`certitude !==
 * 'ecartee'`), et l'état doit lire exactement ce que la frise montre.
 */
export const CERTITUDE_ECARTEE = 'ecartee';
export const CERTITUDE_A_CONFIRMER = 'a_confirmer';

export function borneCompte(type: TypeEtape, certitude: string): boolean {
  const sens = sensDeLaBorne(type);
  if (sens === null) return false;
  if (certitude === CERTITUDE_ECARTEE) return false;
  return sens === 'ouvre' || certitude !== CERTITUDE_A_CONFIRMER;
}

/**
 * ══ 🔴 L'ORDRE DES BORNES EST CELUI DE LA FRISE, AU CARACTÈRE PRÈS ══════════════════════════════════════════════
 *
 * `construireFrise` trie par DATE, puis — à date égale — par `rangEtape`, puis par identifiant. Lire les bornes
 * dans un autre ordre donnerait un état qui contredit ce qu'on voit, ce qui est exactement le défaut réparé ici.
 *
 * 🔴 LE CAS N'EST PAS THÉORIQUE : l'événement d'essai GES-2026-900001 porte, LE MÊME JOUR, une réouverture (438),
 * une clôture (439) et une réouverture (440). Lues par identifiant : ouvre, ferme, ouvre. Lues comme la frise les
 * montre (`cloture` 9 avant `reouverture` 9,5) : ferme, ouvre, ouvre. Les deux lectures ne donnent pas les mêmes
 * périodes.
 *
 * ⚠️ LES RANGS VIENNENT DE `rangEtape`, JAMAIS RECOPIÉS : une table de rangs écrite ici aurait divergé du tri de
 * la frise au premier type ajouté.
 */
export function rangDeLaBorne(t: TypeEtape): number {
  return rangEtape(t);
}

/**
 * 🔴 LA CARTE D'OUVERTURE **DÉRIVÉE** PASSE EN DERNIER À DATE ÉGALE, et c'est `construireFrise` qui le décide :
 * elle l'insère devant la première carte STRICTEMENT postérieure (`c.survenuLe > ouvertLe`), donc après toutes
 * celles du même instant. Un rang plus élevé que tous les autres reproduit exactement ce placement.
 */
export const RANG_OUVERTURE_DERIVEE = 999;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE SQL — LE PLI, ÉCRIT UNE SEULE FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une liste de types, en littéral SQL. Les types ne contiennent que des lettres et des « _ » (contrainte base). */
function listeSql(types: readonly TypeEtape[]): string {
  return types.map((t) => `'${t}'`).join(', ');
}

/**
 * ══ 🔴🔴 LES CARTES DE BORNE D'UN ÉVÉNEMENT — EXACTEMENT CELLES QUE LA FRISE MONTRE ══════════════════════════════
 *
 * `alias` est la table `gestion_evenement` de la requête appelante : le texte est CORRÉLÉ sur `alias.id`, et se
 * glisse donc dans n'importe quel `EXISTS` ou sous-requête scalaire.
 *
 * 🔴 LES DEUX RATTACHEMENTS D'UNE CARTE, COMME DANS `friseDeLEvenement` : par `evenement_id` (une carte posée sur
 * ce dossier) ET par RÉFÉRENCE Monga reliée (`gestion_monga_lien`). Ne lire que le premier aurait donné un état
 * qui ignore les cartes que la frise affiche — le défaut d'origine, par une autre porte.
 *
 * 🔴 L'OUVERTURE DÉRIVÉE EST UNE BORNE À PART ENTIÈRE. Quand aucune carte « ouverture » n'est enregistrée, la
 * frise en montre une, datée de `gestion_evenement.ouvert_le` (lot FRISE-CONSTRUCTIBLE). Sans elle, un événement
 * ordinaire — le cas le plus courant — n'aurait aucune période, et plus un seul mail étiqueté.
 */
export function sqlBornesDeLEvenement(alias: string): string {
  return `SELECT ${alias}.ouvert_le AS quand, 'ouvre'::text AS sens,
                 ${RANG_OUVERTURE_DERIVEE}::numeric AS rang, 0::bigint AS carte
            WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_monga_etape svv_ouv
                     WHERE svv_ouv.statut = 'vif' AND svv_ouv.type = 'ouverture'
                       AND svv_ouv.certitude <> '${CERTITUDE_ECARTEE}'
                       AND (${sqlCarteDeLEvenement('svv_ouv', alias)}))
           UNION ALL
           SELECT svv_brn.survenu_le, CASE WHEN svv_brn.type IN (${listeSql(BORNES_FERMANTES)})
                                     THEN 'ferme' ELSE 'ouvre' END,
                  ${sqlRangDesBornes('svv_brn')}, svv_brn.id
             FROM gestion_monga_etape svv_brn
            WHERE svv_brn.statut = 'vif'
              AND svv_brn.type IN (${listeSql(TYPES_BORNE)})
              AND svv_brn.certitude <> '${CERTITUDE_ECARTEE}'
              AND (svv_brn.type NOT IN (${listeSql(BORNES_FERMANTES)})
                   OR svv_brn.certitude <> '${CERTITUDE_A_CONFIRMER}')
              AND (${sqlCarteDeLEvenement('svv_brn', alias)})`;
}

/** « Cette carte est sur la frise de cet événement » — les deux voies, écrites une fois. */
function sqlCarteDeLEvenement(carte: string, alias: string): string {
  return `${carte}.evenement_id = ${alias}.id
          OR ${carte}.reference IN (SELECT svv_lien.reference FROM gestion_monga_lien svv_lien
                                     WHERE svv_lien.evenement_id = ${alias}.id AND svv_lien.retire_le IS NULL)`;
}

/** Le rang d'affichage à date égale, engendré depuis `rangEtape` — jamais une seconde table de rangs. */
function sqlRangDesBornes(carte: string): string {
  const cas = TYPES_BORNE.map((t) => `WHEN '${t}' THEN ${rangDeLaBorne(t)}`).join(' ');
  return `(CASE ${carte}.type ${cas} ELSE ${RANG_OUVERTURE_DERIVEE} END)::numeric`;
}

/**
 * ══ 🔴🔴 LE PLI — DES BORNES AUX PÉRIODES. LA RÈGLE D'ARNO, POINT 5, EN UNE REQUÊTE ══════════════════════════════
 *
 * « Ouverture→Clôture, Réouverture→Clôture suivante, Réouverture→aujourd'hui si non reclose. »
 *
 * 🔴 COMMENT IL MARCHE, puisqu'il faut pouvoir le relire : chaque borne reçoit un NUMÉRO DE CYCLE — le nombre de
 * clôtures qui la PRÉCÈDENT STRICTEMENT (`ROWS … AND 1 PRECEDING`). Une clôture appartient donc au cycle qu'elle
 * ferme, et la borne suivante en ouvre un nouveau. Dans chaque cycle, `du` est la PREMIÈRE ouverture et `au` la
 * première clôture.
 *
 * 🔴 CE QUE CETTE FORME RÈGLE TOUTE SEULE, ET QU'UNE BOUCLE AURAIT DÛ ÉNUMÉRER :
 *   · deux ouvertures de suite (une Réouverture posée sur un dossier déjà ouvert) : `min` garde la première, la
 *     période ne redémarre pas — ce qui est juste, rien ne s'était arrêté ;
 *   · une clôture sans rien d'ouvert avant elle (une Clôture posée en tête de frise) : le cycle n'a pas de `du`,
 *     et le `HAVING` l'écarte — on ne fabrique pas une période qui n'a jamais commencé ;
 *   · plusieurs cycles clôture / réouverture : ils sortent tels quels, un par ligne, dans l'ordre.
 *
 * ⚠️ `au IS NULL` VEUT DIRE « ENCORE OUVERTE », ET NON « DATE INCONNUE ». C'est la borne haute absente, celle que
 * la règle d'Arno lit « jusqu'à aujourd'hui ». Les appelants comparent donc `… OR p.au IS NULL`, jamais
 * `coalesce(p.au, now())` — un `now()` figé dans une requête se compare mal à un instant stocké.
 *
 * ⚠️ `sourceDesBornes` EST UN PARAMÈTRE, et c'est ce qui rend le pli éprouvable SANS RIEN ÉCRIRE : l'épreuve lui
 * passe un `VALUES` littéral, la production lui passe `sqlBornesDeLEvenement`. Même pli, deux sources. C'est le
 * procédé de `sqlEvenementsDesMessages` dans `historiqueRepo`, et pour la même raison.
 */
export function sqlPeriodes(sourceDesBornes: string): string {
  return `WITH svv_bornes AS (${sourceDesBornes}),
               svv_cycles AS (
                 SELECT svv_b.quand, svv_b.sens,
                        coalesce(sum(CASE WHEN svv_b.sens = 'ferme' THEN 1 ELSE 0 END)
                                 OVER (ORDER BY svv_b.quand, svv_b.rang, svv_b.carte
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS cycle
                   FROM svv_bornes svv_b)
          SELECT cycle,
                 min(quand) FILTER (WHERE sens = 'ouvre') AS du,
                 min(quand) FILTER (WHERE sens = 'ferme') AS au
            FROM svv_cycles
           GROUP BY cycle
          HAVING min(quand) FILTER (WHERE sens = 'ouvre') IS NOT NULL`;
}

/** Les périodes d'un événement, corrélées sur l'alias donné. Le pli de `sqlPeriodes`, sur les vraies bornes. */
export function sqlPeriodesDeLEvenement(alias: string): string {
  return sqlPeriodes(sqlBornesDeLEvenement(alias));
}

/**
 * ══ 🔴🔴 « CET ÉVÉNEMENT EST-IL OUVERT ? » — LA RÈGLE, POINT 1, EN UN BOOLÉEN SQL ════════════════════════════════
 *
 * « La dernière borne est une Clôture → CLOS ; sinon → OUVERT. » Dit en périodes : il reste une période sans
 * borne haute. Les deux phrases sont la même, et celle-ci se corrèle dans un `WHERE`.
 *
 * 🔴 C'EST LE REMPLAÇANT DE `sqlEvenementOuvert(alias)` (`etat <> 'traite'`), et de lui seul. Partout où
 * l'application demandait « ouvert ? » à la colonne, elle le demande maintenant à la frise.
 */
export function sqlEvenementOuvertParLaFrise(alias: string): string {
  return `EXISTS (SELECT 1 FROM (${sqlPeriodesDeLEvenement(alias)}) svv_p WHERE svv_p.au IS NULL)`;
}

/**
 * LA DATE DE CLÔTURE SELON LA FRISE : celle de la DERNIÈRE clôture, ou `NULL` si l'événement est ouvert.
 *
 * 🔴 ELLE EST PLUS JUSTE QUE `traite_le`, et c'est un gain de ce lot : `traite_le` portait l'instant du CLIC,
 * jamais la date écrite sur la carte. Un dossier clos le 14/10 par une carte posée le 08/10 s'affichait « clos le
 * 08/10 » — mesuré sur GES-2026-000001, dont la carte Clôture (retirée depuis) était datée du 14/10/2026.
 *
 * ⚠️ `max(au)` ET NON `min` : après plusieurs cycles, c'est la DERNIÈRE clôture qui dit depuis quand le dossier
 * est fermé.
 *
 * 🔴 ET ELLE EST `NULL` DÈS QUE L'ÉVÉNEMENT EST OUVERT, même s'il a été clos puis rouvert. Sans cette garde,
 * GES-2026-900001 — ouvert, clos, rouvert le même jour — aurait rendu « clos le 08/10/2026 » tout en étant
 * ouvert : exactement la contradiction que ce lot supprime, réintroduite par la porte de l'affichage. Le
 * `FILTER` ne compte donc les clôtures que s'il ne reste aucune période sans borne haute.
 */
export function sqlClosLeParLaFrise(alias: string): string {
  return `(SELECT max(svv_p.au) FILTER (WHERE NOT EXISTS (SELECT 1 FROM (${sqlPeriodesDeLEvenement(alias)}) svv_q
                                                           WHERE svv_q.au IS NULL))
             FROM (${sqlPeriodesDeLEvenement(alias)}) svv_p)`;
}

/**
 * ══ 🔴🔴 « CE MAIL EST-IL DANS UNE PÉRIODE OUVERTE DE CET ÉVÉNEMENT ? » (Arno, point 5) ══════════════════════════
 *
 * « Un mail ne porte “Événement en cours” (et ne compte dans l'événement) que s'il est daté DANS une période
 * ouverte. Un mail reçu entre une Clôture et la Réouverture suivante n'est PAS étiqueté. Si une Clôture est
 * supprimée, la période se recalcule : les mails de l'ancien trou redeviennent dans l'événement. »
 *
 * 🔴 « PLUSIEURS FENÊTRES », ET C'EST TOUT L'OBJET DU POINT C. L'ancienne condition était UNE fenêtre, écrite en
 * dur dans `sqlEvenementsDesMessages` : `msg.recu_le >= ev.ouvert_le AND (ev.traite_le IS NULL OR msg.recu_le <=
 * ev.traite_le)`. Elle ne savait pas dire « ouvert, puis fermé, puis rouvert » : un dossier rouvert repêchait
 * tous les mails de l'intervalle où il était clos.
 *
 * ⚠️ BORNES INCLUSES DES DEUX CÔTÉS, comme l'ancienne condition (`>=` et `<=`) : un mail arrivé le jour même de
 * la clôture appartient encore au dossier qu'il clôt — c'est souvent LUI qui l'a clos.
 */
export function sqlDansUnePeriodeOuverte(alias: string, instant: string): string {
  return `EXISTS (SELECT 1 FROM (${sqlPeriodesDeLEvenement(alias)}) svv_p
                   WHERE ${instant} >= svv_p.du AND (svv_p.au IS NULL OR ${instant} <= svv_p.au))`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ CE QUE LA COLONNE `etat` VEUT ENCORE DIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 `etat` N'EST PAS SUPPRIMÉE : ELLE GARDE SON SENS PROPRE ═════════════════════════════════════════════════
 *
 * `gestion_evenement.etat` vaut `a_traiter`, `en_cours` ou `traite`. Les DEUX PREMIERS disent l'avancement de
 * celui qui s'en occupe — « pas encore regardé » contre « je m'en occupe » —, et ce sont des faits que la frise
 * ne connaît pas : aucune carte ne dit qu'on a commencé à regarder. Ils restent donc stockés, et le sélecteur à
 * trois boutons de la carte en plein écran (`EtatCarte`) continue de les écrire.
 *
 * 🔴 SEULE LA TROISIÈME VALEUR EST REPRISE PAR LA FRISE. « Traité » est un synonyme de « clos », et c'est ce
 * synonyme qui mentait : il pouvait rester vrai alors que la carte Clôture n'était plus là. Il ne se choisit donc
 * plus à la main — `changerEtatEvenement` le refuse et DIT par où passer (poser une carte « Clôture »).
 *
 * ⚠️ AUCUN BOUTON N'EST RETIRÉ (garde-fou CLAUDE.md) : les trois boutons d'`EtatCarte` sont tous là. Le troisième
 * répond désormais par une phrase qui apprend la règle, au lieu d'écrire une valeur que plus personne ne lit.
 */
export const ETATS_DE_TRAVAIL: readonly string[] = ['a_traiter', 'en_cours'];

/** Le refus, mot pour mot, quand on tente de clore (ou de rouvrir) autrement que par une carte de la frise. */
export const MOTIF_CLOTURE_PAR_LA_FRISE =
  'La clôture se pose sur la frise : ajoutez une carte « Clôture » (ou retirez-la pour rouvrir).';

export function etatDeTravail(etat: string): boolean {
  return ETATS_DE_TRAVAIL.includes(etat);
}

/**
 * ══ 🔴🔴 LES TROIS ÉTATS DE LA CARTE, ASSEMBLÉS EN UN SEUL ENDROIT. PUR. ═════════════════════════════════════════
 *
 * Les écrans (la carte dépliée, la file, la recherche) affichent « À traiter / En cours / Traité ». Les deux
 * premiers viennent de la COLONNE — l'avancement de celui qui s'en occupe. Le troisième vient de la FRISE.
 *
 * 🔴 LA FRISE L'EMPORTE, ET C'EST TOUT LE LOT : un événement dont la dernière borne n'est pas une Clôture n'est
 * pas « Traité », quoi que dise la colonne. Et réciproquement — une Clôture posée hors de l'application (une
 * reprise, un script) se lit « Traité » sans qu'on ait à écrire quoi que ce soit.
 *
 * ⚠️ `a_traiter` EST LE REPLI, comme avant ce lot : toute valeur inattendue de la colonne (une reprise ancienne,
 * un état retiré de la contrainte) se lit « à traiter » plutôt que de faire disparaître la carte.
 *
 * ⚠️ UNE COLONNE RESTÉE À `traite` SUR UN ÉVÉNEMENT QUE LA FRISE DIT OUVERT se lit donc « à traiter ». C'est le
 * cas de GES-2026-000001 tant qu'Arno n'a pas tranché la réparation (point D du lot) : il redevient ouvert — ce
 * qu'il est — et son avancement repart de la valeur la plus prudente.
 */
export function etatAffiche(etatStocke: string, ouvertParLaFrise: boolean): 'a_traiter' | 'en_cours' | 'traite' {
  if (!ouvertParLaFrise) return 'traite';
  return etatStocke === 'en_cours' ? 'en_cours' : 'a_traiter';
}

/**
 * CE QUE LA ROUTE ANNONCE À L'ÉCRAN QUAND L'ÉTAT A CHANGÉ — la valeur que la fiche du bien attend pour se relire
 * (lot MARQUES-EVENEMENT-EN-COURS, champ `etatEvenement`).
 *
 * ⚠️ ELLE EST CALCULÉE SUR L'ÉTAT **RELU APRÈS** LA CARTE, jamais devinée depuis le type posé : une Clôture
 * datée avant une Réouverture déjà présente ne ferme rien, et annoncer « clôturé » dans ce cas aurait fait
 * relire la fiche sur une fausse nouvelle.
 */
export function etatApresCarteSelonLaFrise(ouvertApres: boolean): 'traite' | 'en_cours' {
  return ouvertApres ? 'en_cours' : 'traite';
}

/**
 * ══ 🔴🔴 CE QU'ON DEMANDE AVANT DE RETIRER UNE CARTE (Arno, point 2). PUR. ═══════════════════════════════════════
 *
 * ARNO, mot pour mot : « Supprimer la carte Clôture d'un événement clos le ROUVRE, sans carte Réouverture.
 * Confirmation avant suppression : “Supprimer cette clôture rouvrira l'événement.” (Annuler / Supprimer). »
 *
 * 🔴 ELLE NE SE POSE QUE SI LE RETRAIT ROUVRE VRAIMENT, et c'est pour cela qu'elle prend l'état du dossier et
 * non le seul type : une Clôture SUIVIE d'une Réouverture ne ferme rien, et promettre une réouverture là serait
 * une phrase fausse — la plus dangereuse des confirmations, celle qu'on croit avoir lue.
 *
 * ⚠️ `null` POUR TOUT LE RESTE : une confirmation sur chaque geste s'apprend, et l'on cesse de la lire. C'est
 * exactement le raisonnement de `confirmationCarte`, à l'autre bout du même geste.
 */
export function questionAvantRetrait(type: TypeEtape, evenementOuvert: boolean): string | null {
  if (sensDeLaBorne(type) !== 'ferme' || evenementOuvert) return null;
  return 'Supprimer cette clôture rouvrira l’événement.';
}

/**
 * LE COMPTE RENDU D'UNE CARTE DE BORNE, en toutes lettres.
 *
 * 🔴 IL DIT CE QUI S'EST PASSÉ, et non ce qu'on a cliqué : poser une Clôture antérieure à la dernière
 * Réouverture laisse le dossier ouvert, et la phrase doit le dire plutôt que d'annoncer une fermeture qui n'a
 * pas eu lieu. C'est la même exigence que le champ `etatEvenement` juste au-dessus.
 */
export function motCarteDeBorne(ouvertAvant: boolean, ouvertApres: boolean): string {
  if (ouvertAvant === ouvertApres) {
    return ouvertApres
      ? 'Carte posée. L’événement reste ouvert : sa dernière borne n’est pas une clôture.'
      : 'Carte posée. L’événement reste clos.';
  }
  return ouvertApres ? 'Événement rouvert.' : 'Événement clôturé.';
}
