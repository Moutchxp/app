/**
 * ══ 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — QUI LE TEXTE D'UN MAIL NOMME-T-IL ? Module PUR. ═════════════════════
 *
 * ═══ LE CAS D'ARNO, 01/10/2026 ══════════════════════════════════════════════════════════════════════════════════
 *
 * Un virement du Crédit Mutuel (mail 57335) : « Motif de l'opération : LOYER ZAHRA CHAKROUN oct 2026 ». Aucune
 * adresse de l'échange n'est à l'annuaire — l'expéditeur est une banque — et pourtant le mail dit EXACTEMENT de
 * quel logement il parle : celui de Mme CHAKROUN, 54 avenue Puvis de Chavanne à Courbevoie. Jusqu'ici, ce mail
 * n'avait aucune proposition.
 *
 * ═══ 🔴🔴 LA RÈGLE ABSOLUE, ET ELLE EST LA RAISON D'ÊTRE DE CE MODULE ═══════════════════════════════════════════
 *
 * UNE CORRESPONDANCE TROUVÉE DANS LE CONTENU NE RATTACHE JAMAIS RIEN TOUTE SEULE. Jamais « Auto », jamais un lien
 * confirmé, jamais un héritage de période. Elle PROPOSE, décochée, et une personne tranche.
 *
 * 🔴 POURQUOI SI FERME. Une adresse électronique DÉSIGNE son propriétaire : elle est une identité. Un nom dans un
 * texte est une RESSEMBLANCE — « Martin » est un nom de famille et un prénom, « Petit » est un adjectif, et le
 * même nom peut désigner trois personnes. Confirmer d'office sur une ressemblance écrirait dans le dossier d'un
 * client un courrier qui ne le concerne pas, sans que personne le voie. Un clic coûte une seconde ; une erreur
 * silencieuse dans un historique coûte la confiance qu'on a mise dans tout l'historique.
 *
 * ═══ LES TROIS FAÇONS DE RECONNAÎTRE QUELQU'UN, DE LA PLUS SÛRE À LA MOINS SÛRE ═════════════════════════════════
 *
 *   (①) SON ADRESSE ÉLECTRONIQUE, citée dans le texte — c'est une identité, pas une ressemblance ;
 *   (②) SON NUMÉRO DE TÉLÉPHONE — idem, comparé sur ses neuf derniers chiffres (l'indicatif s'écrit de six façons) ;
 *   (③) SON NOM : DEUX mots de son nom au moins, en mots entiers, dans n'importe quel ordre. Un seul mot ne suffit
 *       pas — SAUF s'il est RARE, et « rare » est défini ci-dessous, mesuré sur l'annuaire lui-même.
 *
 * ⚠️ AUCUNE E/S, AUCUN IMPORT : l'appelant charge l'annuaire, ce module décide. Tous les cas se rejouent ici.
 */

/** Une personne de l'annuaire, réduite à ce qui permet de la reconnaître dans un texte et de proposer ses biens. */
export interface PersonneConnue {
  /** Son identité ici : « locataire|106 ». Deux personnes de même nom restent deux personnes. */
  cle: string;
  role: 'proprietaire' | 'locataire';
  /** Le nom tel que l'annuaire l'écrit (« CHAKROUN Zahra », « RYAN Aidan et Bernadette »). */
  nom: string;
  /**
   * 🔴🔴 LE NOM DE FAMILLE SEUL — et il est à part parce que LUI SEUL peut désigner quelqu'un d'un seul mot.
   *
   * MESURÉ LE 01/10/2026, sur la première simulation : sans cette distinction, « SEXTON Michael » se
   * reconnaissait à « Michael », « DEYSINE Marie-Amélie » à « Amélie », « GRISERI LEKIEFFRE Gabrielle et
   * Jérôme » à « Jérôme ». Un PRÉNOM est partagé par des milliers de personnes — il ne tranche rien, et il
   * traverse les mails à longueur de journée (« Bonjour Amélie »). Absent ⇒ aucun mot ne peut agir seul.
   */
  nomFamille?: string;
  emails?: readonly string[];
  telephones?: readonly string[];
  /** Les clés WIPPIMMO de ses biens ACTIFS, dans l'ordre de pertinence décidé par l'appelant. */
  lots: readonly string[];
}

export interface AnnuaireContenu {
  personnes: readonly PersonneConnue[];
  /**
   * 🔴 LES MOTS QUI NE DÉSIGNENT JAMAIS UN CLIENT : le nom de la maison, celui de ses collaborateurs, les mots de
   * nos signatures. Ils viennent de l'appelant (qui lit les expéditeurs internes) et non d'une liste écrite à la
   * main : une liste à la main oublie le collaborateur arrivé le mois dernier.
   */
  motsExclus?: readonly string[];
}

export type FaconDeReconnaitre = 'email' | 'telephone' | 'nom_complet' | 'nom_rare';

export interface CorrespondanceContenu {
  personne: PersonneConnue;
  par: FaconDeReconnaitre;
  /** L'EXTRAIT RÉEL du texte, court, tel qu'il s'affiche sous le bien. Jamais reformulé : on cite. */
  extrait: string;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA NORMALISATION, ET LES MOTS QU'ON NE REGARDE PAS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Minuscules, accents ôtés, ponctuation en espaces. Les tirets d'un nom composé deviennent des espaces. PUR. */
export function aplatir(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * LES MOTS D'UN NOM QUI NE LE DÉSIGNENT PAS : civilités, particules, liaisons. « RYAN Aidan et Bernadette » ne
 * doit pas exiger le mot « et », et « M. de LA TOUR » ne doit pas se reconnaître à « de » ou « la ».
 */
const MOTS_DE_LIAISON = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'et', 'ou', 'd', 'l', 'van', 'von', 'da', 'di', 'el', 'al',
  'mr', 'm', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle', 'me', 'dr',
  'ep', 'epouse', 'epse', 'veuve', 'vve', 'ne', 'nee', 'sci', 'sarl', 'sas', 'sa', 'eurl', 'indivision',
  /**
   * 🔴 ET LA FORMULE DES FICHES DE SOCIÉTÉ, trouvée par la simulation du 01/10/2026 : l'annuaire écrit « ALE
   * Représentée par M. WENGER », « B.Y.C Représentée par Mme BOUJENAH ». Sans ces mots-là, deux fiches de
   * société se reconnaissaient l'une l'autre sur « représentée » et « par » — une collision pure.
   */
  'representee', 'represente', 'representes', 'rep', 'par', 'ste', 'societe', 'cie', 'et',
]);

/**
 * ══ 🔴🔴 LES MOTS COURANTS QUI SONT AUSSI DES NOMS DE FAMILLE ══════════════════════════════════════════════════
 *
 * C'EST LE FAUX POSITIF QU'ARNO NOMME LE PREMIER : « un locataire nommé Martin ou Petit ». Ces mots-là traversent
 * les mails pour mille raisons qui n'ont rien à voir avec la personne — « un petit souci », « le blanc du mur »,
 * « Bernard a rappelé » (un autre Bernard). Ils ne fondent donc JAMAIS une reconnaissance à eux seuls.
 *
 * ⚠️ ILS RESTENT PARFAITEMENT UTILISABLES EN NOM COMPLET : « MARTIN Jean-François » se reconnaît très bien par
 * ses DEUX mots. On n'exclut pas la personne — on exclut le raccourci.
 */
const MOTS_TROP_COURANTS = new Set([
  // Les noms de famille les plus répandus en France, qui sont aussi des mots de tous les jours.
  'martin', 'petit', 'bernard', 'dubois', 'durand', 'moreau', 'laurent', 'simon', 'michel', 'david',
  'bertrand', 'roux', 'vincent', 'fournier', 'girard', 'bonnet', 'dupont', 'lambert', 'fontaine', 'rousseau',
  'blanc', 'guerin', 'boyer', 'garnier', 'chevalier', 'francois', 'legrand', 'gauthier', 'perrin', 'robin',
  'clement', 'morin', 'nicolas', 'henry', 'roussel', 'mathieu', 'gautier', 'masson', 'marchand', 'duval',
  'denis', 'dumont', 'marie', 'lemaire', 'noel', 'meunier', 'brun', 'blanchard', 'giraud', 'joly',
  'riviere', 'lucas', 'brunet', 'gaillard', 'barbier', 'arnaud', 'gerard', 'leroy', 'lefebvre', 'colin',
  'royer', 'huet', 'baron', 'pierre', 'paul', 'jean', 'louis', 'charles', 'anne', 'claire',
  // Des mots de la langue qui se rencontrent dans un mail de gestion, et qui sont aussi des patronymes.
  'maison', 'jardin', 'bois', 'champ', 'pont', 'rue', 'place', 'cour', 'ferme', 'moulin',
  'bailly', 'bourg', 'villa', 'palais', 'chambre', 'bureau', 'service', 'agence', 'cabinet', 'syndic',
  /**
   * 🔴🔴 ET LE VOCABULAIRE DE LA GESTION LOCATIVE, trouvé par la première simulation du 01/10/2026 : une
   * locataire s'appelle « DEVIS Zoé », et le mot « devis » traverse un mail sur dix (« Mon Devis ELITE DIAG'S »,
   * « Devis-202602-3.pdf »). Il passait même le garde-fou de la majuscule, parce qu'un nom de fichier et un
   * objet de mail en portent une. Ces mots-là ne désigneront JAMAIS quelqu'un à eux seuls.
   */
  'devis', 'facture', 'quittance', 'loyer', 'charges', 'travaux', 'bail', 'locataire', 'proprietaire',
  'appartement', 'immeuble', 'logement', 'parking', 'garage', 'assurance', 'sinistre', 'contrat', 'dossier',
  'paiement', 'virement', 'releve', 'compteur', 'entretien', 'reparation', 'diagnostic', 'etat', 'lieux',
  'visite', 'chaudiere', 'plomberie', 'serrure', 'courrier', 'message', 'piece', 'cuisine', 'salon',
  'merci', 'bonjour', 'madame', 'monsieur', 'cordialement', 'mail', 'adresse', 'telephone', 'portable',
  // Les mots des raisons sociales : ils ne distinguent aucune société de la suivante.
  'france', 'services', 'groupe', 'immo', 'immobilier', 'conseil', 'consulting', 'centre', 'national',
  'general', 'international', 'holding', 'invest', 'investissement', 'patrimoine', 'finance', 'capital',
]);

/** Longueur minimale d'un mot pour qu'il puisse, SEUL, désigner quelqu'un. */
export const LONGUEUR_NOM_RARE = 5;

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS D'UN NOM, ET CE QUE L'ANNUAIRE EN SAIT
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les mots qui désignent vraiment une personne dans son nom. PUR. */
export function motsDuNom(nom: string): string[] {
  return [...new Set(aplatir(nom).split(' ').filter((m) => m.length >= 2 && !MOTS_DE_LIAISON.has(m)))];
}

/**
 * 🔴🔴 LE NOM DE FAMILLE D'UN LOCATAIRE, LU DANS LA FORME DE L'IMPORT. PUR.
 *
 * WIPPIMMO écrit « CHAKROUN Zahra », « KHELIFA PINTO Audrey et Yassin », « DUBOIS D'ENGHIEN Claire » : le nom de
 * famille est la suite de mots EN CAPITALES qui ouvre la ligne. Vérifié sur quinze fiches tirées au hasard le
 * 01/10/2026 — la convention tient.
 *
 * ⚠️ AUCUNE CAPITALE EN TÊTE ⇒ ON REND TOUT : on préfère un nom de famille trop large (qui exigera deux mots)
 * à un nom de famille deviné.
 */
export function nomDeFamilleDeLImport(nom: string): string {
  const mots = (nom ?? '').trim().split(/\s+/);
  const tete: string[] = [];
  for (const m of mots) {
    if (m === '' || m !== m.toUpperCase()) break;
    tete.push(m);
  }
  return tete.length === 0 ? (nom ?? '') : tete.join(' ');
}

/**
 * 🔴 COMBIEN DE PERSONNES PORTENT CHAQUE MOT. C'est la mesure de la rareté, et elle est prise sur l'annuaire
 * RÉEL — pas sur une intuition. Un mot porté par une seule fiche peut la désigner seul ; un mot porté par trois
 * fiches ne désigne personne.
 */
export function compterLesMots(personnes: readonly PersonneConnue[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of personnes) for (const m of motsDuNom(p.nom)) n.set(m, (n.get(m) ?? 0) + 1);
  return n;
}

/**
 * ══ 🔴🔴 LE CRITÈRE DE RARETÉ, CHOISI ET DOCUMENTÉ (Arno : « Choisis un critère, documente-le, teste-le ») ══════
 *
 * UN MOT SEUL PEUT DÉSIGNER QUELQU'UN SI, ET SEULEMENT SI, LES QUATRE CONDITIONS SONT RÉUNIES :
 *   ① il est porté par UNE SEULE fiche de l'annuaire — sinon il ne tranche rien ;
 *   ② il fait AU MOINS 5 LETTRES — en deçà, les collisions sont trop faciles (« Roy », « Noe », « Bru ») ;
 *   ③ il n'est pas un mot courant de la langue (voir `MOTS_TROP_COURANTS`) ;
 *   ④ il est écrit avec une MAJUSCULE dans le texte d'origine.
 *
 * 🔴 LA QUATRIÈME CONDITION EST CELLE QUI RAPPORTE LE PLUS, et elle ne coûte rien. Un nom propre s'écrit avec une
 * majuscule — « Mme Chakroun », « LOYER ZAHRA CHAKROUN » — tandis qu'un mot de la langue employé comme mot
 * s'écrit en minuscules (« le volet du petit salon »). Elle rattrape tous les mots courants que la liste ③ ne
 * contient pas, et elle les rattrapera encore dans six mois, quand personne ne pensera plus à tenir la liste.
 */
export function motRare(mot: string, parMot: Map<string, number>): boolean {
  return mot.length >= LONGUEUR_NOM_RARE
    && (parMot.get(mot) ?? 0) === 1
    && !MOTS_TROP_COURANTS.has(mot);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA RECHERCHE DANS LE TEXTE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les neuf derniers chiffres d'un numéro — la seule part stable entre « +33 6 09 51 35 71 » et « 0609513571 ». */
export function chiffresDuNumero(brut: string): string {
  const c = (brut ?? '').replace(/\D+/g, '');
  return c.length >= 9 ? c.slice(-9) : '';
}

/** Un mot entier est-il dans le texte aplati ? (Le texte est encadré d'espaces par l'appelant.) PUR. */
function motPresent(texteEncadre: string, mot: string): boolean {
  return texteEncadre.includes(` ${mot} `);
}

/** Ce mot est-il écrit avec une majuscule quelque part dans le texte d'origine ? PUR. */
export function citeAvecMajuscule(texteOrigine: string, mot: string): boolean {
  const sansAccent = (texteOrigine ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // ⚠️ `i` VOLONTAIREMENT ABSENT : c'est justement la casse qu'on interroge. On accepte « Chakroun » et « CHAKROUN ».
  const majuscule = mot.charAt(0).toUpperCase() + mot.slice(1);
  return new RegExp(`(?:^|[^A-Za-z0-9])(?:${majuscule}|${mot.toUpperCase()})(?![A-Za-z0-9])`)
    .test(sansAccent);
}

/** Combien de caractères l'extrait montre autour de ce qui a été reconnu. Assez pour comprendre, pas plus. */
export const EXTRAIT_MAX = 60;

/**
 * 🔴 L'EXTRAIT RÉEL, autour des mots reconnus. PUR.
 *
 * ⚠️ ON CITE, ON NE REFORMULE PAS. Arno doit lire ce que le mail dit — « LOYER ZAHRA CHAKROUN » — et non une
 * paraphrase qui aurait l'air d'une certitude. Les bords sont recalés sur des espaces : un extrait qui commence
 * au milieu d'un mot se lit comme une erreur.
 */
export function extraitAutour(texte: string, mots: readonly string[]): string {
  const places = mots.map((m) => indexOrigine(texte, m)).filter((i) => i >= 0);
  if (places.length === 0) return '';
  const i = Math.min(...places);
  // Une dizaine de caractères avant, pour que la phrase ait un début — « Motif : LOYER ZAHRA… ».
  const debut = Math.max(0, i - 12);
  let extrait = (texte ?? '').slice(debut, debut + EXTRAIT_MAX).replace(/\s+/g, ' ');
  // ⚠️ LES BORDS SE RECALENT SUR DES ESPACES : un extrait coupé au milieu d'un mot se lit comme une erreur.
  if (debut > 0) extrait = extrait.replace(/^\S*\s/, '');
  if (debut + EXTRAIT_MAX < (texte ?? '').length) extrait = extrait.replace(/\s\S*$/, '');
  return extrait.trim();
}

/** Où ce mot (aplati) commence dans le texte d'origine. PUR. */
function indexOrigine(texte: string, mot: string): number {
  const sansAccent = (texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const m = new RegExp(`(?:^|[^a-z0-9])${mot}(?![a-z0-9])`).exec(sansAccent);
  return m === null ? -1 : m.index + (m[0].length - mot.length);
}

/**
 * ══ 🔴🔴 QUI CE TEXTE NOMME-T-IL ? PUR. ═══════════════════════════════════════════════════════════════════════
 *
 * Rend une correspondance par personne AU PLUS, par la façon la plus sûre qui ait fonctionné.
 *
 * ⚠️ L'ORDRE DU RÉSULTAT EST CELUI DE LA FIABILITÉ : adresse, téléphone, nom complet, nom rare. C'est dans cet
 * ordre que les biens s'afficheront, et c'est l'ordre dans lequel on les relit.
 */
export function personnesDansLeTexte(texte: string, annuaire: AnnuaireContenu): CorrespondanceContenu[] {
  const brut = texte ?? '';
  if (brut.trim() === '') return [];
  const plat = ` ${aplatir(brut)} `;
  const exclus = new Set((annuaire.motsExclus ?? []).flatMap((m) => motsDuNom(m)));
  const parMot = compterLesMots(annuaire.personnes);

  // Les adresses et les numéros écrits dans le texte, relevés UNE fois pour toutes les personnes.
  const adresses = new Set((brut.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((a) => a.toLowerCase()));
  const numeros = new Set((brut.match(/(?:\+\d[\d\s.\-()]{7,}|\d[\d\s.\-()]{8,})/g) ?? [])
    .map(chiffresDuNumero).filter((c) => c !== ''));

  const trouvees: CorrespondanceContenu[] = [];
  for (const p of annuaire.personnes) {
    const mots = motsDuNom(p.nom).filter((m) => !exclus.has(m));
    if (p.lots.length === 0) continue;   // une personne sans bien actif n'a rien à proposer

    // ── ① SON ADRESSE ÉLECTRONIQUE ───────────────────────────────────────────────────────────────────────────
    const email = (p.emails ?? []).map((e) => e.trim().toLowerCase()).find((e) => e !== '' && adresses.has(e));
    if (email !== undefined) {
      trouvees.push({ personne: p, par: 'email', extrait: extraitAutour(brut, [aplatir(email).split(' ')[0]]) || email });
      continue;
    }

    // ── ② SON NUMÉRO DE TÉLÉPHONE ────────────────────────────────────────────────────────────────────────────
    const tel = (p.telephones ?? []).map(chiffresDuNumero).find((c) => c !== '' && numeros.has(c));
    if (tel !== undefined) {
      trouvees.push({ personne: p, par: 'telephone', extrait: extraitAutour(brut, [tel.slice(0, 3)]) || tel });
      continue;
    }

    // ── ③ SON NOM : DEUX MOTS AU MOINS ───────────────────────────────────────────────────────────────────────
    /**
     * 🔴🔴 DEUX MOTS, DONT UN QUI DISTINGUE. La simulation du 01/10/2026 a montré pourquoi « deux mots » ne
     * suffit pas : « TATA CONSULTANCY SERVICES FRANCE » se reconnaissait à « services » + « france », deux mots
     * que porte une raison sociale sur deux. Il faut donc qu'AU MOINS UN des mots trouvés soit distinctif,
     * c'est-à-dire ni trop court ni trop courant.
     */
    const presents = mots.filter((m) => motPresent(plat, m));
    /**
     * CE QUI DISTINGUE : un mot qui n'est ni trop court ni trop courant — ou, à défaut, LA TÊTE DU NOM DE
     * FAMILLE. La seconde branche sauve « MARTIN Luc », dont les deux mots sont l'un trop courant et l'autre
     * trop court, et qui reste pourtant parfaitement reconnaissable quand les DEUX sont écrits.
     */
    const teteFamille = motsDuNom(p.nomFamille ?? '')[0];
    const distingue = presents.some((m) => m.length >= 4 && !MOTS_TROP_COURANTS.has(m))
      || (teteFamille !== undefined && presents.includes(teteFamille));
    if (presents.length >= 2 && distingue) {
      trouvees.push({ personne: p, par: 'nom_complet', extrait: extraitAutour(brut, presents) });
      continue;
    }

    /**
     * ── ③ bis UN SEUL MOT, ET SEULEMENT S'IL EST RARE ────────────────────────────────────────────────────────
     * 🔴🔴 ET SEULEMENT UN MOT DU NOM DE FAMILLE : un prénom ne tranche rien (voir `nomFamille`).
     */
    const famille = new Set(motsDuNom(p.nomFamille ?? ''));
    const rare = presents.find((m) => famille.has(m) && motRare(m, parMot) && citeAvecMajuscule(brut, m));
    if (rare !== undefined) trouvees.push({ personne: p, par: 'nom_rare', extrait: extraitAutour(brut, [rare]) });
  }

  const rang: Record<FaconDeReconnaitre, number> = { email: 0, telephone: 1, nom_complet: 2, nom_rare: 3 };
  return trouvees.sort((a, b) => rang[a.par] - rang[b.par] || a.personne.nom.localeCompare(b.personne.nom, 'fr'));
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CE QUI S'AFFICHE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Au-delà, la liste des biens d'un bailleur noie la proposition au lieu de l'éclairer (demande d'Arno). */
export const BIENS_MONTRES = 5;

/** Comment la raison s'écrit sous le bien. Une seule formulation, un seul endroit. PUR. */
export function motifDuContenu(c: CorrespondanceContenu): string {
  const quoi = c.par === 'email' ? 'son adresse e-mail'
    : c.par === 'telephone' ? 'son téléphone'
      : c.par === 'nom_rare' ? 'son nom' : 'son nom complet';
  const extrait = c.extrait.trim();
  return `trouvé dans le contenu du mail : « ${extrait} » — ${quoi} (${c.personne.nom})`;
}

/** Les biens à montrer pour cette personne, et combien restent derrière « voir les autres ». PUR. */
export function biensAMontrer(p: PersonneConnue): { montres: string[]; autres: number } {
  return { montres: [...p.lots].slice(0, BIENS_MONTRES), autres: Math.max(0, p.lots.length - BIENS_MONTRES) };
}
