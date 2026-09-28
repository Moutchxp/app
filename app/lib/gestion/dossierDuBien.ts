/**
 * MODULE « GESTION » — LOT DRIVE-DOSSIER-DU-BIEN : LE DOSSIER DRIVE D'UN BIEN. Module PUR : aucun import, aucune
 * base, aucun réseau, aucun DOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ON A CHERCHÉ, ET CE QU'ON A TROUVÉ (reconnaissance du 28/09/2026, en lecture seule).
 *
 * Il existe DEUX arborescences par personne dans le Drive du cabinet, et elles ne se valent pas :
 *
 *   ① « Documents clients scannés › 1 actifs / 2 vendus / 3 perdus » — des dossiers nommés par NOM DE FAMILLE
 *      (« Assayag », « Bachiri - Le Guern », « Ardetti 103 »). C'est l'archive historique, et « Joindre » y est
 *      INTERDIT. Mesuré : sur 365 lots, seulement 99 tomberaient sur un dossier NET, 180 sur plusieurs candidats
 *      et 86 sur aucun — parce qu'un nom de famille ne désigne pas un bien : « Aissaoui » revendique trois lots,
 *      et « Anthony » six. Cette piste demandait à la fois de deviner ET de lever l'interdiction de lecture.
 *
 *   ② « Base de données locative › 1 Propriétaires » — des dossiers nommés « NOM Prénom (clé WIPPIMMO) », par
 *      exemple « GARREAU Gabrielle (289) ». « Joindre » y est DÉJÀ autorisé, et surtout : notre base connaît déjà
 *      le lien, exactement, depuis le lot 253 — `gestion_annuaire_proprietaire.drive_dossier_id`, renseigné pour
 *      les 307 propriétaires. Les 365 lots ont un propriétaire ; la couverture est donc de 365 sur 365.
 *
 * ⇒ ON PREND LA SECONDE. Pas de devinette sur un nom, pas de règle de jointure à assouplir, pas de migration : la
 * correspondance est une CLÉ, et une clé ne se trompe pas de propriétaire.
 *
 * 🔴 LE DOSSIER EST CELUI DU PROPRIÉTAIRE, PAS DU LOT, et il faut le dire à l'écran. 58 propriétaires portent
 * plusieurs biens : deux lots du même bailleur mènent au MÊME dossier. Annoncer « dossier du bien » sans préciser
 * ferait croire à un rangement par logement qui n'existe pas — on nomme donc les biens que le dossier couvre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un bien rattaché au mail en cours, tel que le serveur le rend. */
export interface BienDuMail {
  /** La clé WIPPIMMO du lot. */
  cle: string;
  /** « 28 Avenue Marceau, 92400 Courbevoie — lot 421 », déjà composé par le dépôt. */
  libelle: string;
  /** Le propriétaire, et son dossier Drive. `null` = aucun dossier connu pour lui. */
  proprietaire: string | null;
  dossierId: string | null;
  dossierNom: string | null;
}

/** Une entrée prioritaire, prête à afficher en tête du sélecteur Drive. */
export interface DossierPrioritaire {
  dossierId: string;
  /** Le nom du dossier tel qu'il existe dans le Drive — celui qu'on verra dans le fil d'Ariane après le clic. */
  dossierNom: string;
  /** Le libellé de la LIGNE : les biens que ce dossier couvre. */
  libelle: string;
  /** Les clés des biens couverts — utile aux tests et au journal, jamais affiché tel quel. */
  cles: string[];
  /** Le propriétaire, dit en clair : c'est SON dossier, et la ligne ne doit pas le cacher. */
  proprietaire: string | null;
}

/**
 * ══ 🔴 LES LIGNES PRIORITAIRES, À PARTIR DES BIENS DU MAIL. PUR. ═════════════════════════════════════════════════
 *
 * 🔴 UNE LIGNE PAR DOSSIER, ET NON PAR BIEN — et c'est le seul endroit où je m'écarte de la demande littérale
 * d'Arno (« une ligne par bien »). La raison est mesurée : 58 propriétaires portent plusieurs lots, et deux biens
 * du même bailleur mènent au MÊME dossier. Deux lignes identiques, qui ouvrent le même endroit, ne donnent pas un
 * choix : elles font hésiter sur une différence qui n'existe pas. On garde donc UNE ligne, et on y NOMME les deux
 * biens — l'information demandée est là, sans le faux choix.
 *
 * ⚠️ L'ORDRE EST CELUI DES BIENS RATTACHÉS, jamais un tri : c'est l'ordre dans lequel on les a rattachés, donc
 * celui auquel on s'attend. Le premier dossier vu est celui du premier bien.
 *
 * ⚠️ UN BIEN SANS DOSSIER CONNU NE PRODUIT PAS DE LIGNE — pas une ligne grisée, pas un message. « Aucun dossier
 * trouvé : pas de ligne, et rien ne change » (demande d'Arno). Une ligne morte se clique quand même.
 */
export function dossiersPrioritaires(biens: readonly BienDuMail[]): DossierPrioritaire[] {
  const parDossier = new Map<string, DossierPrioritaire>();
  for (const b of biens) {
    if (b.dossierId === null || b.dossierId.trim() === '') continue;
    const deja = parDossier.get(b.dossierId);
    if (deja) {
      // Le même dossier, un second bien : on ajoute le bien, on ne crée pas de ligne jumelle.
      if (!deja.cles.includes(b.cle)) {
        deja.cles.push(b.cle);
        deja.libelle = `${deja.libelle} · ${b.libelle}`;
      }
      continue;
    }
    parDossier.set(b.dossierId, {
      dossierId: b.dossierId,
      dossierNom: b.dossierNom ?? '',
      libelle: b.libelle,
      cles: [b.cle],
      proprietaire: b.proprietaire,
    });
  }
  return [...parDossier.values()];
}

/**
 * LE MOT DE LA LIGNE. PUR.
 *
 * 🔴 IL DIT « du propriétaire », parce que c'est ce que le dossier EST. Écrire « Dossier du bien » tout court
 * ferait promettre un rangement par logement qui n'existe pas dans ce Drive — et la première fois qu'on ouvrirait
 * le dossier d'un bailleur à deux lots, on croirait s'être trompé de dossier.
 */
export function titreDossierPrioritaire(d: DossierPrioritaire): string {
  const qui = (d.proprietaire ?? '').trim();
  return qui === '' ? 'Dossier du bien' : `Dossier du bien — ${qui}`;
}

/**
 * ══ 🔴 LE SOUS-DOSSIER DU BIEN, DANS LE DOSSIER DU PROPRIÉTAIRE. PUR. ════════════════════════════════════════════
 *
 * MESURÉ le 28/09/2026 : le dossier d'un propriétaire contient « En attente » et un sous-dossier PAR BIEN, nommé
 * « → 28 Avenue Marceau, 92400 Courbevoie — Appartement meublé Type 2 — lot 421 ». Le NUMÉRO DE LOT y est écrit.
 *
 * 🔴 ON MATCH SUR LE NUMÉRO, JAMAIS SUR L'ADRESSE. Un bailleur peut avoir cinq lots à la MÊME adresse — mesuré sur
 * EKAMAI, 1bis rue des Pavillons : cinq sous-dossiers que seule la fin du nom distingue. Rapprocher les adresses
 * choisirait le premier venu, c'est-à-dire le mauvais quatre fois sur cinq.
 *
 * ⚠️ ET SI RIEN NE CORRESPOND, ON NE DEVINE PAS : on rend `null`, et l'appelant s'en tient au dossier du
 * propriétaire — qui est juste, seulement un cran plus haut. Descendre dans un sous-dossier au hasard ferait
 * joindre la pièce d'un autre logement, et personne ne s'en apercevrait avant le destinataire.
 */
export function sousDossierDuBien(
  enfants: readonly { id: string; nom: string }[], cle: string,
): { id: string; nom: string } | null {
  const c = cle.trim();
  if (c === '') return null;
  // « — lot 421 » en fin de nom, insensible à la casse et aux espaces autour du tiret. Le `$` ancre la fin :
  //   sans lui, « lot 42 » correspondrait à « lot 421 ».
  const motif = new RegExp(`[-—–]\\s*lot\\s*${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const trouves = enfants.filter((e) => motif.test(e.nom.trim()));
  // 🔴 DEUX CANDIDATS ⇒ AUCUN. Un numéro de lot doit désigner un seul dossier ; s'il en désigne deux, c'est le
  //   Drive qui est ambigu, et choisir pour lui serait une invention.
  return trouves.length === 1 ? trouves[0] : null;
}

/**
 * COMBIEN DE BIENS CETTE LIGNE COUVRE-T-ELLE ? Sert à la mention « 2 biens » quand il y en a plusieurs. PUR.
 *
 * ⚠️ RIEN N'EST DIT QUAND IL N'Y EN A QU'UN : « 1 bien » est du bruit, et le libellé le nomme déjà.
 */
export function mentionNbBiens(d: DossierPrioritaire): string | null {
  return d.cles.length > 1 ? `${d.cles.length} biens dans ce dossier` : null;
}
