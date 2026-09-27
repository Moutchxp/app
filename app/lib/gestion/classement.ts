/**
 * MODULE « GESTION » — LOT CLASSEMENT-1 : OÙ CHAQUE PIÈCE DOIT ALLER. Module PUR (aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE NE DÉPLACE RIEN, ET NE SAIT PAS LE FAIRE. Il PROPOSE un dossier de destination pour chaque pièce, avec
 * la règle qui l'a décidé et le degré de certitude. C'est `classementDrive.ts` qui saurait déplacer — et il ne
 * s'exécute pas tant qu'Arno n'a pas tranché les choix listés dans le rapport.
 *
 * ═══ LA DESTINATION, ET POURQUOI ELLE EST TOUJOURS L'UN DE CES QUATRE ENDROITS ════════════════════════════════════
 *   ① LA RUBRIQUE D'UN BIEN — « 2 Biens immobiliers / <bien> / 1 Locataires » (ou 2 Travaux, 3 Assurances,
 *      4 Litige). C'est la destination utile, et la seule qui range vraiment ;
 *   ② « En attente » DU BIEN — on sait de quel logement il s'agit, mais pas de quelle rubrique ;
 *   ③ « En attente » DU PROPRIÉTAIRE — on sait à qui, mais pas quel logement ;
 *   ④ « 00 Non rattachés / <année> / <mois> » — on ne sait pas. Elles restent visibles, rangées par mois, jamais
 *      perdues.
 *
 * ⚠️ TROIS DE CES QUATRE DOSSIERS EXISTENT DÉJÀ, LE QUATRIÈME PAS ENTIÈREMENT. Mesuré le 27/09/2026 : les 329 lots et
 * les 286 propriétaires confirmés ont TOUS leur dossier et leur « En attente » (1 460 rubriques, 365 + 307
 * « En attente »). En revanche « 00 Non rattachés » ne contient que `2026/09` : les mois antérieurs manquent, et
 * 10 062 pièces visent donc un dossier qui n'existe pas encore. Les créer est une ÉCRITURE Drive — donc une décision
 * d'Arno, pas une initiative de ce lot.
 *
 * ═══ 🔴 LE PRINCIPE QUI COMMANDE TOUT : ON NE RANGE PAS AU HASARD ════════════════════════════════════════════════
 * Une pièce mise dans la mauvaise rubrique est PIRE qu'une pièce laissée « En attente ». Dans le second cas on sait
 * qu'il reste à faire ; dans le premier on croit le travail fini, et le document est introuvable là où on le
 * cherchera. La règle est donc : au moindre doute sur la rubrique, « En attente » — et le rapport dit combien.
 *
 * ⚠️ LE SEUIL EST UN PARAMÈTRE, PAS UNE OPINION. `certitudeMinimale` décide de ce qui mérite une rubrique. Le défaut
 * est le plus prudent (`certaine`) ; le rapport chiffre ce que donnerait `probable`, pour qu'Arno choisisse sur des
 * nombres et non sur une impression.
 *
 * 🔒 AUCUNE DESTINATION NE PEUT ÊTRE SOUS « Documents clients scannés ». Ce module ne connaît que des clés de
 * dossiers de « Base de données locative » ; il n'existe aucune valeur de `PlanCible` qui désigne la production.
 * L'interdiction est en outre vérifiée, en dur et par un test, dans `classementDrive.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les quatre rubriques d'un bien, dans l'ordre où le Drive les montre. Écrites UNE fois. */
export const RUBRIQUES = ['1 Locataires', '2 Travaux', '3 Assurances', '4 Litige'] as const;
export type Rubrique = typeof RUBRIQUES[number];

/**
 * 🔴 LE NOM DU DOSSIER DE PRODUCTION, pour pouvoir le REFUSER. Il n'apparaît ici que comme interdit — jamais comme
 * destination possible.
 */
export const PRODUCTION_INTERDITE = 'Documents clients scannés';

export type Certitude = 'certaine' | 'probable' | 'incertaine';

/** L'ordre de force des certitudes, pour comparer sans écrire trois `if` à chaque fois. */
const FORCE: Record<Certitude, number> = { certaine: 3, probable: 2, incertaine: 1 };
export function auMoins(c: Certitude, seuil: Certitude): boolean {
  return FORCE[c] >= FORCE[seuil];
}

/** La destination proposée. Quatre formes, et pas une de plus. */
export type PlanCible =
  | { sorte: 'rubrique'; bienCle: string; rubrique: Rubrique }
  | { sorte: 'en_attente_bien'; bienCle: string }
  | { sorte: 'en_attente_proprietaire'; proprietaireCle: string }
  | { sorte: 'non_rattachee'; annee: string; mois: string };

/** Ce qu'on sait d'une pièce avant de décider. Les rattachements sont ceux de SON MESSAGE (voir `classementRepo`). */
export interface PieceAClasser {
  pieceId: number;
  nomFichier: string;
  /** L'objet du mail porteur. C'est le signal le plus fort pour la rubrique. */
  objet: string | null;
  /** Les premières lignes du corps, quand on les a. Signal d'appoint. */
  extrait?: string | null;
  /** Date de réception, en ISO. Sert à l'année ET au mois de « 00 Non rattachés ». */
  recuLe: string;
  /** Clés des lots CONFIRMÉS du message (jamais les proposés : une proposition ne range rien). */
  lotsConfirmes: readonly string[];
  /** Clés des propriétaires CONFIRMÉS du message. */
  proprietairesConfirmes: readonly string[];
}

export interface Plan {
  pieceId: number;
  cible: PlanCible;
  /** La règle qui a décidé, en français, telle qu'elle sera lue dans un rapport. */
  regle: string;
  certitude: Certitude;
  /**
   * 🔴 PLUSIEURS BIENS ⇒ UN RACCOURCI, JAMAIS UNE COPIE. Un même document peut concerner deux logements (un mail
   * qui traite de deux lots d'un même immeuble). Le copier créerait DEUX fichiers à faire vivre : corrigé d'un côté,
   * périmé de l'autre, et plus personne ne saurait lequel fait foi. Le raccourci Drive laisse UN seul fichier, visible
   * depuis les deux dossiers. Ces clés sont les biens SUPPLÉMENTAIRES ; la destination du fichier lui-même reste
   * `cible`. Vide dans le cas courant.
   *
   * ⚠️ MESURÉ LE 27/09/2026 : AUCUNE pièce n'est aujourd'hui rattachée à plus d'un lot confirmé. Le cas est donc
   * prévu mais ne se présente pas — et c'est une raison de plus de ne pas inventer la copie « au cas où ».
   */
  raccourcisVers: readonly string[];
}

/**
 * LES RÈGLES DE RUBRIQUE, DE LA PLUS FORTE À LA PLUS FAIBLE. L'ORDRE EST LA FONCTIONNALITÉ.
 *
 * ⚠️ POURQUOI LE LITIGE PASSE AVANT TOUT. « Mise en demeure pour loyers impayés » parle de loyer ET de litige : c'est
 * un litige. Un contentieux rangé dans « 1 Locataires » se perd au milieu de deux cents quittances, alors que
 * l'inverse ne fait courir aucun risque.
 *
 * ⚠️ PUIS L'ASSURANCE AVANT LES TRAVAUX. « Déclaration de sinistre dégât des eaux » parle de dégât ET d'assurance :
 * le dossier qui compte est celui de l'assureur. Les travaux qui suivront porteront leur propre facture.
 *
 * 🔴 « certaine » N'EST ACCORDÉ QU'À CE QUI NE PEUT PAS VOULOIR DIRE AUTRE CHOSE. « facture » seul est `probable` :
 * une facture peut être de travaux, d'assurance ou d'honoraires. « devis » est `certaine` : on ne devise que des
 * travaux. C'est ce partage, et lui seul, qui fait qu'un classement automatique est utile plutôt que dangereux.
 */
interface RegleRubrique {
  rubrique: Rubrique;
  certitude: Certitude;
  /** Motifs recherchés, en minuscules et sans accent (voir `normaliser`). */
  motifs: readonly string[];
  libelle: string;
}

const REGLES: readonly RegleRubrique[] = [
  {
    rubrique: '4 Litige', certitude: 'certaine', libelle: 'mot du contentieux',
    motifs: ['mise en demeure', 'commandement de payer', 'huissier', 'commissaire de justice', 'contentieux',
      'litige', 'assignation', 'tribunal judiciaire', 'expulsion', 'injonction de payer', 'recouvrement',
      'protocole d accord', 'clause resolutoire'],
  },
  {
    rubrique: '4 Litige', certitude: 'probable', libelle: 'impayé ou relance ferme',
    motifs: ['impaye', 'impayes', 'avocat', 'conciliateur', 'commission departementale'],
  },
  {
    rubrique: '3 Assurances', certitude: 'certaine', libelle: 'mot de l’assurance',
    motifs: ['assurance', 'assureur', 'sinistre', 'multirisque', 'mrh', 'police d assurance',
      'attestation d assurance', 'expertise amiable', 'indemnisation'],
  },
  {
    rubrique: '2 Travaux', certitude: 'certaine', libelle: 'mot des travaux',
    motifs: ['devis', 'travaux', 'plombier', 'electricien', 'serrurier', 'chaudiere', 'chauffe-eau',
      'ballon d eau chaude', 'vmc', 'fuite', 'degat des eaux', 'infiltration', 'peinture', 'parquet',
      'nuisible', 'nuisibles', 'deratisation', 'desinsectisation', 'punaises', 'souris', 'cafards',
      'intervention', 'depannage', 'reparation', 'remise en etat', 'ramonage', 'entretien annuel'],
  },
  {
    rubrique: '2 Travaux', certitude: 'probable', libelle: 'panne ou désordre signalé',
    motifs: ['panne', 'ne fonctionne plus', 'en panne', 'casse', 'cassee', 'bouche', 'bouchee', 'deformation'],
  },
  {
    rubrique: '1 Locataires', certitude: 'certaine', libelle: 'mot du bail et de la location',
    motifs: ['bail', 'quittance', 'etat des lieux', 'edl', 'preavis', 'conge', 'depot de garantie',
      'caution', 'attestation de loyer', 'regularisation des charges', 'revision du loyer', 'indexation',
      'irl', 'solde de loyer', 'appel de loyer', 'avis d echeance', 'locataire', 'locataires',
      'candidature', 'dossier de location', 'garant'],
  },
  {
    rubrique: '1 Locataires', certitude: 'probable', libelle: 'loyer ou charges évoqués',
    motifs: ['loyer', 'loyers', 'charges', 'caf', 'apl', 'taxe d habitation'],
  },
];

/**
 * LE TEXTE, RAMENÉ À CE QUI SE COMPARE : minuscules, sans accent, ponctuation en espaces. PUR.
 *
 * ⚠️ LES APOSTROPHES ET TIRETS DEVIENNENT DES ESPACES, et les motifs sont écrits en conséquence (« police d
 * assurance »). Sans cela « d'assurance » et « d’assurance » — deux apostrophes différentes, les deux présentes dans
 * la vraie boîte — seraient deux mots distincts, et l'un des deux échapperait à la règle.
 */
export function normaliser(brut: string | null | undefined): string {
  return (brut ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** LA RUBRIQUE QUE LE TEXTE DÉSIGNE, ou `null` si rien ne ressort. PUR. */
export function rubriqueProbable(
  textes: readonly (string | null | undefined)[],
): { rubrique: Rubrique; certitude: Certitude; regle: string } | null {
  const t = ` ${textes.map((x) => normaliser(x)).filter((x) => x !== '').join(' ')} `;
  if (t.trim() === '') return null;
  for (const r of REGLES) {
    const trouve = r.motifs.find((m) => t.includes(` ${normaliser(m)} `));
    if (trouve !== undefined) {
      return { rubrique: r.rubrique, certitude: r.certitude, regle: `${r.libelle} (« ${trouve} »)` };
    }
  }
  return null;
}

/**
 * L'ANNÉE ET LE MOIS DE RÉCEPTION, pour « 00 Non rattachés / <année> / <mois> ». PUR.
 *
 * ⚠️ ANNÉE **ET** MOIS, parce que c'est la convention DÉJÀ EN PLACE dans le Drive : « 00 Arrivée des mails » est
 * organisé en `AAAA/MM`, et « 00 Non rattachés » aussi (mesuré : `/00 Non rattachés/2026/09` existe). Ranger à
 * l'année seule aurait créé une seconde convention à côté de la première — et c'est toujours celle qu'on regarde le
 * moins qui finit fausse.
 *
 * ⚠️ UNE DATE ILLISIBLE REND « inconnue / 00 » plutôt que de choisir une date au hasard : un document mal daté doit
 * se voir, pas se fondre dans le mois courant.
 */
export function periodeDe(recuLe: string): { annee: string; mois: string } {
  const d = new Date(recuLe);
  if (Number.isNaN(d.getTime())) return { annee: 'inconnue', mois: '00' };
  return { annee: String(d.getUTCFullYear()), mois: String(d.getUTCMonth() + 1).padStart(2, '0') };
}

/**
 * LE PLAN D'UNE PIÈCE. PUR, et c'est tout le moteur.
 *
 * L'ORDRE DES QUESTIONS EST LA RÈGLE :
 *   ① sait-on de quel LOGEMENT il s'agit ? Sinon, ② de quel PROPRIÉTAIRE ? Sinon, ③ rien : « 00 Non rattachés ».
 *   ④ quand on connaît le logement, la RUBRIQUE est-elle assez sûre ? Sinon « En attente » du bien.
 *
 * ⚠️ UN PROPRIÉTAIRE CONNU NE SUFFIT PAS À CHOISIR UNE RUBRIQUE, même quand le texte est limpide : les rubriques
 * appartiennent à un BIEN, pas à une personne. « En attente » du propriétaire est alors la seule place juste.
 */
export function planDeLaPiece(p: PieceAClasser, certitudeMinimale: Certitude = 'certaine'): Plan {
  const lots = [...new Set(p.lotsConfirmes.map((x) => x.trim()).filter((x) => x !== ''))];
  const props = [...new Set(p.proprietairesConfirmes.map((x) => x.trim()).filter((x) => x !== ''))];
  const commun = { pieceId: p.pieceId, raccourcisVers: [] as string[] };

  if (lots.length === 0) {
    if (props.length === 0) {
      return {
        ...commun, cible: { sorte: 'non_rattachee', ...periodeDe(p.recuLe) },
        regle: 'aucun rattachement confirmé : ni logement, ni propriétaire',
        certitude: 'certaine',   // on est SÛR de ne pas savoir : c'est une certitude sur la destination
      };
    }
    /**
     * ⚠️ PLUSIEURS PROPRIÉTAIRES CONFIRMÉS : on prend le premier dans l'ordre des clés et on le DIT dans la règle.
     * Choisir n'est pas deviner — la pièce reste « En attente », donc relue par un humain, et la règle affichée lui
     * apprend qu'il y avait plusieurs candidats.
     */
    const cle = [...props].sort()[0];
    return {
      ...commun, cible: { sorte: 'en_attente_proprietaire', proprietaireCle: cle },
      regle: props.length === 1
        ? 'propriétaire confirmé, aucun logement : « En attente » du propriétaire'
        : `${props.length} propriétaires confirmés, aucun logement : « En attente » du premier (${cle})`,
      certitude: props.length === 1 ? 'probable' : 'incertaine',
    };
  }

  const bienCle = [...lots].sort()[0];
  // 🔴 LES AUTRES BIENS DEVIENNENT DES RACCOURCIS, jamais des copies. Voir `Plan.raccourcisVers`.
  const raccourcisVers = [...lots].sort().slice(1);
  const r = rubriqueProbable([p.objet, p.nomFichier, p.extrait]);

  if (r !== null && auMoins(r.certitude, certitudeMinimale)) {
    return {
      pieceId: p.pieceId, cible: { sorte: 'rubrique', bienCle, rubrique: r.rubrique },
      regle: `logement confirmé + ${r.regle}`, certitude: r.certitude, raccourcisVers,
    };
  }
  return {
    pieceId: p.pieceId, cible: { sorte: 'en_attente_bien', bienCle },
    regle: r === null
      ? 'logement confirmé, aucune rubrique ne se dégage du texte : « En attente » du bien'
      : `logement confirmé, rubrique seulement ${r.certitude} (${r.regle}) : « En attente » du bien`,
    certitude: 'incertaine', raccourcisVers,
  };
}

/**
 * LA CLÉ DU DOSSIER CIBLE, telle qu'elle est enregistrée dans `gestion_drive_arbre`. PUR.
 *
 * 🔴 C'EST LE SEUL PONT ENTRE LE PLAN ET LE DRIVE, et il passe par la LISTE BLANCHE : une clé qui ne correspond à
 * aucun dossier mémorisé ne donne aucun identifiant, donc aucun déplacement. Un plan ne peut pas désigner un dossier
 * que le programme n'a pas créé — et donc jamais un dossier de la production.
 */
export function cleDossier(cible: PlanCible): { sorte: string; cle: string } {
  switch (cible.sorte) {
    case 'rubrique': return { sorte: 'rubrique', cle: `${cible.bienCle}|${cible.rubrique}` };
    case 'en_attente_bien': return { sorte: 'en_attente', cle: `bien|${cible.bienCle}` };
    case 'en_attente_proprietaire': return { sorte: 'en_attente', cle: `prop|${cible.proprietaireCle}` };
    // La convention du Drive : `AAAA|MM`, comme « 00 Arrivée des mails ». Voir `periodeDe`.
    case 'non_rattachee': return { sorte: 'periode', cle: `${cible.annee}|${cible.mois}` };
  }
}

/** Une phrase courte pour le rapport : où va cette pièce. PUR. */
export function libelleCible(cible: PlanCible): string {
  switch (cible.sorte) {
    case 'rubrique': return `bien ${cible.bienCle} / ${cible.rubrique}`;
    case 'en_attente_bien': return `bien ${cible.bienCle} / En attente`;
    case 'en_attente_proprietaire': return `propriétaire ${cible.proprietaireCle} / En attente`;
    case 'non_rattachee': return `00 Non rattachés / ${cible.annee} / ${cible.mois}`;
  }
}

// ── LES COMPTES D'UNE SIMULATION ────────────────────────────────────────────────────────────────────────────────

export interface ComptesClassement {
  vues: number;
  /** Par sorte de destination. */
  parSorte: Record<PlanCible['sorte'], number>;
  parRubrique: Record<Rubrique, number>;
  parCertitude: Record<Certitude, number>;
  /** Pièces concernant plusieurs biens, donc appelant un raccourci. */
  avecRaccourci: number;
  /** Pièces sans copie Drive : rien à déplacer, il faudrait d'abord les copier. */
  sansCopieDrive: number;
  /** Pièces dont le dossier cible n'est pas (encore) mémorisé : aucun déplacement possible. */
  cibleInconnue: number;
}

export function comptesClassementVides(): ComptesClassement {
  return {
    vues: 0,
    parSorte: { rubrique: 0, en_attente_bien: 0, en_attente_proprietaire: 0, non_rattachee: 0 },
    parRubrique: { '1 Locataires': 0, '2 Travaux': 0, '3 Assurances': 0, '4 Litige': 0 },
    parCertitude: { certaine: 0, probable: 0, incertaine: 0 },
    avecRaccourci: 0, sansCopieDrive: 0, cibleInconnue: 0,
  };
}

export function compterPlan(c: ComptesClassement, plan: Plan): void {
  c.vues += 1;
  c.parSorte[plan.cible.sorte] += 1;
  c.parCertitude[plan.certitude] += 1;
  if (plan.cible.sorte === 'rubrique') c.parRubrique[plan.cible.rubrique] += 1;
  if (plan.raccourcisVers.length > 0) c.avecRaccourci += 1;
}

/** Le résumé, lisible par quelqu'un qui n'a pas écrit le code. PUR. */
export function resumeClassement(c: ComptesClassement): string[] {
  const pc = (n: number): string => (c.vues === 0 ? '0 %' : `${Math.round((n / c.vues) * 100)} %`);
  const l = [
    `pièces examinées ................... ${c.vues}`,
    `rangées dans une rubrique .......... ${c.parSorte.rubrique} (${pc(c.parSorte.rubrique)})`,
  ];
  for (const r of RUBRIQUES) if (c.parRubrique[r] > 0) l.push(`    ${r} ........ ${c.parRubrique[r]}`);
  l.push(
    `« En attente » du bien ............. ${c.parSorte.en_attente_bien} (${pc(c.parSorte.en_attente_bien)})`,
    `« En attente » du propriétaire ..... ${c.parSorte.en_attente_proprietaire} (${pc(c.parSorte.en_attente_proprietaire)})`,
    `« 00 Non rattachés » ............... ${c.parSorte.non_rattachee} (${pc(c.parSorte.non_rattachee)})`,
    `dont appelant un raccourci ......... ${c.avecRaccourci}`,
    `sans copie Drive (rien à déplacer) . ${c.sansCopieDrive}`,
    `dossier cible non mémorisé ......... ${c.cibleInconnue}`,
  );
  return l;
}
