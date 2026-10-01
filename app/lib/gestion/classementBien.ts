import { query } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { decortiquerNumero, formaterTelephone } from './telephoneAffichage';
import {
  annuaireDisponible, rattachementsDisponibles, miniaturesDisponibles, libelleSourceContactDisponible,
} from './schema';
// LOT AFFECTATION-PAR-BIEN — le moteur des propositions est PUR : il décide, et il s'éprouve sans base.
import { proposerBiens, type AdresseVue, type TextesDuMail } from './propositionsBien';
// LOT FICHE-PROPOSITION — ce qui s'affiche, et sous quel mot : un module PUR, éprouvé sans base ni écran.
import {
  adresseComplete, caracteristiquesDuLot,
  type CaracteristiqueLot, type Coordonnee, type PersonneFiche,
} from './ficheBien';
import { libelleContact } from './annuaire';
// 🔴 LOT RATTACHER-EN-ECRIVANT — la reconnaissance d'une adresse, LA MÊME fonction pure que la relève emploie.
import { estInterne, reconnaitre } from './adressesMessage';
import { chargerAnnuaireAdresses } from './adressesRepo';
// 🔴 « Interne » proposé en premier : la règle vit dans le dépôt qui la porte, écrite une seule fois.
import { proposerInterneDabord } from './interneRepo';
/**
 * 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LE DERNIER ÉCRAN QUI MONTRAIT ENCORE LE NOM D'ORIGINE.
 *
 * Trouvé en cherchant « tous les endroits d'affichage qui n'y passent pas encore » (demande d'Arno) : la liste
 * « Classer chaque pièce jointe séparément » de `ClasserMail` lisait `p.nom_fichier` en clair. Une pièce renommée
 * y reparaissait donc sous son nom d'origine, au moment précis où l'on décide dans quel bien la ranger.
 */
import { sqlNomAffiche, sqlNomOrigine } from './nomUsageSql';

/**
 * MODULE « GESTION » — LOT STATUT-PAR-MAIL : CE QU'IL FAUT SAVOIR POUR CLASSER UN MAIL DANS UN BIEN. LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER RÉPOND, et qui manquait à l'écran de classement : « à quels BIENS ce mail peut-il
 * raisonnablement se rattacher, et QUI sont les parties de chacun À LA DATE DU MAIL ? »
 *
 * Trois choses, dans cet ordre :
 *   ① LA RECOMMANDATION — le bien que l'automatisation a trouvé. Il est PRÉSÉLECTIONNÉ et marqué comme tel :
 *      on ne fait pas retaper à la main ce que le moteur a déjà vu juste dans la plupart des cas ;
 *   ② TOUS LES BIENS DU PROPRIÉTAIRE identifié. Demande d'Arno : un bailleur possède souvent plusieurs lots, et un
 *      mail peut parler de deux appartements à la fois (un relevé de charges, un ravalement). Ne proposer que le
 *      bien recommandé obligerait à rouvrir le sélecteur pour chaque lot supplémentaire ;
 *   ③ LES PARTIES À LA DATE DU MAIL, pas celles d'aujourd'hui. Un mail d'août 2025 parle du locataire d'août 2025.
 *      Afficher l'occupant actuel ferait classer le courrier d'un locataire sorti sous le nom de son successeur —
 *      une erreur qu'on ne verrait jamais, et qui se propagerait à chaque relecture du dossier.
 *
 * 🔒 LECTURE SEULE. Aucun `INSERT`, `UPDATE` ni `DELETE` : un test statique le vérifie sur ce fichier. Le geste
 * d'écriture reste celui qui existe — la route des rattachements, avec son journal.
 *
 * ⚠️ NE PAS CONFONDRE AVEC `classementRepo.ts`, qui porte un tout autre sujet : le rangement des PIÈCES JOINTES
 * dans les dossiers du Drive (lot CLASSEMENT-1). Ici, il s'agit du rattachement d'un MAIL à un BIEN. Deux fichiers,
 * deux questions — les mêler donnerait un module qui ne sait plus de quoi il parle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Une partie d'un bien, à la date du mail.
 *
 * 🔴 LOT FICHE-PROPOSITION — elle porte désormais SES MOYENS DE CONTACT. Classer un mail sans avoir le téléphone
 * du locataire sous les yeux obligeait à rouvrir WIPPIMMO dans un autre onglet pour la moitié des gestes qui
 * suivent (rappeler, transférer, relancer). C'est `PersonneFiche` du module pur `ficheBien.ts`.
 */
export type PartieBien = PersonneFiche;

/** Un bien proposé au classement, avec ses parties à la date du mail. */
export interface BienProposable {
  /** La clé WIPPIMMO du lot. C'est elle qui sert de cible de rattachement (lot RATTACHEMENT-1). */
  cle: string;
  libelle: string;
  adresse: string | null;
  commune: string | null;
  typeBien: string | null;
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA NATURE WIPPIMMO DU LOT (« Appartement », « Parking », « Box »…). Elle
   * était déjà lue pour les caractéristiques ; elle est rendue TELLE QUELLE ici parce que c'est elle qui décide
   * de la CATÉGORIE (logement / parking / cave) écrite dans la case verte. On ne la relit pas d'un libellé : un
   * libellé se reformate, une nature est une donnée.
   */
  nature: string | null;
  /**
   * 🔴 LOT FICHE-PROPOSITION — TOUT CE QUE L'IMPORT WIPPIMMO PORTE POUR CE LOT, et rien d'autre. Les champs vides
   * ne sont pas dans la liste : c'est `caracteristiquesDuLot` (module PUR) qui décide, pas l'écran.
   */
  caracteristiques: CaracteristiqueLot[];
  /** L'adresse COMPLÈTE : voie, code postal, commune. Une adresse sans code postal n'est pas une adresse. */
  adresseComplete: string;
  /** Le propriétaire et le ou les locataires du bien À LA DATE DU MAIL. */
  parties: PartieBien[];
  /**
   * 🔴 VRAI quand l'automatisation coche ce bien d'avance. L'écran le présélectionne et écrit le MOTIF à côté —
   * jamais une coche silencieuse : on doit toujours savoir d'où elle vient.
   */
  recommande: boolean;
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — POURQUOI ce bien est proposé, EN CLAIR (« locataire en place à la date du
   * mail », « un des 3 biens de MARTY Jean-François », « n° de lot cité dans le mail »…). Sans lui, on ne peut pas
   * trancher sans rouvrir le code.
   */
  motif: string;
  /** Le cas de la règle : (a) locataire, (b) propriétaire à un seul bien, (c) à plusieurs, (d) cité dans le texte. */
  cas: 'a' | 'b' | 'c' | 'd';
  /** `quasi_certaine` = cas (a) et (b) ; `a_trancher` = cas (c) et (d). */
  certitude: 'quasi_certaine' | 'a_trancher';
  /** Vrai quand ce mail lui est DÉJÀ rattaché de façon confirmée. L'écran le coche et le dit. */
  dejaRattache: boolean;
}

export interface ContexteClassement {
  messageId: number;
  filId: number | null;
  /** La date du mail : c'est elle qui décide QUI étaient les parties. */
  dateMail: string | null;
  /** Combien de mails compte la conversation — pour la portée « toute la conversation ». */
  nbMailsDuFil: number;
  /**
   * Le propriétaire identifié, quand il y en a un. Il n'est JAMAIS une cible de classement (lot
   * AFFECTATION-PAR-BIEN) : il ne sert qu'à titrer la liste de ses biens.
   */
  proprietaire: { cle: string; nom: string } | null;
  /** Ce que le moteur conclut : un bien certain, des biens à trancher, ou rien — avec son motif en clair. */
  examen: { issue: 'automatique' | 'a_trancher' | 'sans_candidat'; motif: string };
  /** Les pièces jointes du mail, pour le classement pièce par pièce (lot AFFECTATION-PAR-BIEN, point 4). */
  pieces: { pieceId: number; nom: string; miniature: boolean }[];
  biens: BienProposable[];
  /** `false` = migration 257 ou annuaire absents : l'écran le dit au lieu de montrer une liste vide. */
  disponible: boolean;
}

/**
 * LES PARTIES D'UN LOT À UNE DATE. LECTURE SEULE.
 *
 * ⚠️ « À LA DATE », ET NON « AUJOURD'HUI ». L'occupation retenue est celle dont la période COUVRE la date du mail :
 * entrée antérieure (ou inconnue) et sortie postérieure (ou toujours en cours). Sans cela, le courrier d'un
 * locataire sorti se classerait sous le nom de son successeur.
 *
 * ⚠️ PLUSIEURS LOCATAIRES SONT POSSIBLES — une colocation, un couple. On les rend TOUS : n'en garder qu'un
 * choisirait arbitrairement lequel des deux existe.
 */
const SQL_PARTIES = `
  SELECT l.id::text AS locataire_id, l.wippimmo_id AS cle, l.nom,
         o.entree::text AS depuis, o.sortie::text AS jusqua
    FROM gestion_annuaire_occupation o
    JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
   WHERE o.lot_id = $1
     AND (o.entree IS NULL OR o.entree <= $2::date)
     AND (o.sortie IS NULL OR o.sortie >= $2::date)
   ORDER BY o.entree DESC NULLS LAST, o.id DESC`;

interface LotDB {
  id: string; cle: string; adresse: string | null; commune: string | null; type_bien: string | null;
  proprietaire_cle: string | null; proprietaire_nom: string | null; proprietaire_civilite: string | null;
  // LOT FICHE-PROPOSITION — les colonnes que l'import remplit vraiment (voir l'en-tête de `ficheBien.ts`).
  code_postal: string | null; immeuble: string | null; nature: string | null;
  gestion_debut: string | null; gestion_fin: string | null;
  /** L'identifiant interne du propriétaire : c'est par lui qu'on retrouve ses contacts, en UNE requête. */
  proprietaire_id: string | null;
}

/**
 * ══ 🔴 LOT FICHE-PROPOSITION — LES MOYENS DE CONTACT, EN UNE SEULE REQUÊTE ═══════════════════════════════════════
 *
 * ⚠️ UNE REQUÊTE POUR TOUTES LES PERSONNES DE LA FICHE, jamais une par carte. Un mail d'un bailleur à huit lots
 * affiche neuf personnes : neuf requêtes se verraient à l'écran, et c'est la règle du module depuis le bandeau
 * « Rattaché à ».
 *
 * ⚠️ `absent_le IS NULL` : un contact disparu d'un ré-import n'est pas supprimé, il est DATÉ. L'afficher ferait
 * appeler un numéro que WIPPIMMO ne donne plus.
 *
 * ⚠️ L'ORDRE EST CELUI DE L'IMPORT (`rang`) : la première adresse est celle que WIPPIMMO donne en premier, et
 * c'est en général la bonne. Trier par ordre alphabétique remonterait une adresse secondaire en tête.
 *
 * 🔴 LOT FICHES-ANNUAIRE (étape C) — `vivante` PORTE LA CONDITION `archive_le IS NULL`, celle qui écarte une
 * coordonnée RETIRÉE À LA MAIN. C'est ici que la règle compte le plus : ce module est le MOTEUR DE PROPOSITIONS.
 * Une adresse qu'Arno vient d'enlever d'une fiche continuerait, sans cette condition, à proposer le bien de cette
 * personne pour chaque mail — et son geste n'aurait servi qu'à moitié, ce qui est pire que rien.
 * La condition vient de `conditionCoordonneeVivante()`, qui la SONDE : sans la migration 278 elle est vide.
 */
function sqlContacts(avecLibelle: boolean, vivante: string): string {
  return `
  SELECT sujet, sujet_id::text AS sujet_id, sorte, valeur, valeur_brute, rang,
         ${avecLibelle ? 'libelle_source' : "NULL::text AS libelle_source"}
    FROM gestion_annuaire_contact
   WHERE absent_le IS NULL${vivante}
     AND ((sujet = 'proprietaire' AND sujet_id = ANY($1::bigint[]))
       OR (sujet = 'locataire'    AND sujet_id = ANY($2::bigint[])))
   ORDER BY sorte, rang, id`;
}

/** Les contacts d'une personne, rangés par sorte, chacun avec le libellé de sa colonne d'origine. */
type CarteContacts = Map<string, { emails: Coordonnee[]; telephones: Coordonnee[] }>;

/** La clé d'une personne dans la carte des contacts : sa sorte et son identifiant interne. PUR. */
function cleContact(sujet: string, sujetId: string | number): string { return `${sujet}|${sujetId}`; }

/** Le libellé d'un bien, écrit UNE fois : deux formulations finiraient par se contredire d'un écran à l'autre. */
export function libelleBien(l: { adresse: string | null; commune: string | null; cle: string }): string {
  const lieu = [l.adresse, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  return lieu === '' ? `Lot ${l.cle}` : `${lieu} — lot ${l.cle}`;
}

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LE CŒUR DU CLASSEMENT, EXTRAIT POUR SERVIR DEUX FOIS ═══════════════════════
 *
 * « De quels BIENS parle-t-on, et qui en sont les parties à cette date ? » — la question ne dépend QUE de trois
 * choses : des ADRESSES, des TEXTES où chercher une citation, et d'une DATE. Elle ne dépend d'AUCUN message.
 *
 * DEUX APPELANTS, et c'est tout l'objet de l'extraction :
 *   · `contexteClassement(messageId)` — un mail REÇU, qu'on classe après coup ;
 *   · `contexteClassementRedaction(...)` — un mail qu'on est en train d'ÉCRIRE, et qui n'existe pas encore en
 *     base. Demande d'Arno : proposer les biens DÈS QU'UNE ADRESSE EST VALIDÉE dans À, Cc ou Cci.
 *
 * 🔴 POURQUOI PAS UNE SECONDE ÉCRITURE. Les propositions faites à l'écriture et celles faites à la réception
 * doivent être LES MÊMES — même moteur (`proposerBiens`, règles a–e), mêmes cartes, mêmes motifs. Deux écritures
 * auraient divergé au premier ajustement, et l'on aurait vu un bien proposé à l'envoi disparaître à la réception
 * du même échange. C'est le défaut que le lot RECHERCHE-LIGNES a déjà payé une fois sur les lignes de liste.
 *
 * ⚠️ AUCUN CHANGEMENT DE COMPORTEMENT POUR L'APPELANT HISTORIQUE : le corps ci-dessous est celui de
 * `contexteClassement`, déplacé sans une ligne de différence. Ce qui variait — la date de référence, les liens
 * déjà posés, les textes — est devenu un paramètre.
 */
async function construireBiens(o: {
  /** Les adresses vues, telles que `proposerBiens` les attend. */
  adresses: readonly AdresseVue[];
  /** Où chercher une citation d'adresse ou de n° de lot (cas c et d) : objet, corps, noms de pièces. */
  textes: TextesDuMail;
  /**
   * La date qui décide QUI sont les parties. Celle du mail quand il existe ; le JOUR MÊME quand on l'écrit —
   * c'est la seule réponse juste : on s'adresse au locataire d'aujourd'hui, pas à celui d'août 2025.
   */
  dateRef: string;
  /**
   * Les rattachements DÉJÀ posés sur ce mail (`propose` ou `confirme`). VIDE à la rédaction : un mail qu'on écrit
   * n'en porte aucun, et lui en inventer ferait afficher « rattachement déjà posé » sur un message inexistant.
   */
  liens: readonly { cible_sorte: string; cible_cle: string | null; statut: string }[];
}): Promise<{
  biens: BienProposable[];
  examen: { issue: 'automatique' | 'a_trancher' | 'sans_candidat'; motif: string };
  proprietaire: { cle: string; nom: string } | null;
}> {
  const adresses = o.adresses;
  /**
   * ── ③ LE CATALOGUE DES BIENS ────────────────────────────────────────────────────────────────────────────────
   * ⚠️ TOUS LES LOTS, ET C'EST DÉLIBÉRÉ : le cas (d) cherche une adresse ou un n° de lot dans le TEXTE du mail,
   * sans qu'aucune adresse électronique n'ait rien donné — il n'y a donc aucun moyen de restreindre la liste
   * d'avance. Mesuré le 28/09/2026 : 365 lots en gestion. Les charger tous coûte une requête de 365 lignes ;
   * deviner lesquels charger coûterait des propositions manquantes, qui, elles, ne font aucun bruit.
   */
  const { rows: lots } = await query<LotDB>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.commune, lo.type_bien,
            lo.code_postal, lo.immeuble, lo.nature,
            lo.gestion_debut::text AS gestion_debut, lo.gestion_fin::text AS gestion_fin,
            lo.proprietaire_id::text AS proprietaire_id,
            pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom, pr.civilite AS proprietaire_civilite
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`);
  const parCle = new Map(lots.map((l) => [l.cle, l]));

  // ── ④ LE MOTEUR, PUR : c'est lui qui décide, et il s'éprouve sans base ────────────────────────────────────────
  const examen = proposerBiens({
    adresses,
    textes: o.textes,
    biens: lots.map((l) => ({
      cle: l.cle, numero: l.cle, adresse: l.adresse, commune: l.commune,
      proprietaireCle: l.proprietaire_cle, proprietaireNom: l.proprietaire_nom,
    })),
  });

  /**
   * ── ⑤ CE QUI EST DÉJÀ POSÉ SUR CE MAIL ──────────────────────────────────────────────────────────────────────
   * 🔴 LES PROPOSITIONS ANCIENNES DE TYPE PROPRIÉTAIRE SONT LUES, ET RENDUES SOUS FORME DE BIENS — sans rien
   * réécrire en base tant que personne n'a validé (demande d'Arno, point 3). Une ligne « propriétaire » en base
   * n'est pas fausse : elle est seulement écrite dans un vocabulaire qu'on n'emploie plus.
   */
  const liens = o.liens;
  const clesConfirmees = new Set(
    liens.filter((l) => l.cible_sorte === 'lot' && l.statut === 'confirme').map((l) => l.cible_cle ?? ''));
  const lotsDesLiens = new Set(liens.filter((l) => l.cible_sorte === 'lot').map((l) => l.cible_cle ?? ''));
  const propriosDesLiens = new Set(
    liens.filter((l) => l.cible_sorte === 'proprietaire').map((l) => l.cible_cle ?? ''));

  /** Les biens à montrer : ceux que le moteur propose, PLUS ceux qu'un lien ancien désigne (directement ou via son propriétaire). */
  const aMontrer = new Map<string, { motif: string; cas: 'a' | 'b' | 'c' | 'd'; certitude: 'quasi_certaine' | 'a_trancher'; preCoche: boolean }>();
  for (const p of examen.propositions) {
    aMontrer.set(p.cle, { motif: p.motif, cas: p.cas, certitude: p.certitude, preCoche: p.preCoche });
  }
  for (const cle of lotsDesLiens) {
    if (cle !== '' && !aMontrer.has(cle)) {
      aMontrer.set(cle, {
        motif: 'rattachement déjà posé sur ce mail', cas: 'a', certitude: 'quasi_certaine',
        preCoche: clesConfirmees.has(cle),
      });
    }
  }
  for (const cleProprio of propriosDesLiens) {
    for (const l of lots) {
      if (l.proprietaire_cle !== cleProprio || aMontrer.has(l.cle)) continue;
      const nom = l.proprietaire_nom ?? cleProprio;
      aMontrer.set(l.cle, {
        motif: `ancienne proposition « propriétaire ${nom} » — voici ses biens`,
        cas: 'c', certitude: 'a_trancher', preCoche: false,
      });
    }
  }

  /**
   * ── ⑥ LES PARTIES DE CHAQUE BIEN, À LA DATE DU MAIL, ET LEURS MOYENS DE CONTACT ─────────────────────────────
   * DEUX TEMPS, ET C'EST VOULU : on lit d'abord les occupations de chaque bien retenu (ils sont peu nombreux),
   * puis TOUS les contacts en UNE requête. L'inverse — un aller-retour par personne — se verrait à l'écran.
   */
  const occupations = new Map<string, { locataireId: string; cle: string; nom: string;
    depuis: string | null; jusqua: string | null }[]>();
  for (const cle of aMontrer.keys()) {
    const l = parCle.get(cle);
    if (l === undefined) continue;
    const { rows: loc } = await query<{
      locataire_id: string; cle: string; nom: string; depuis: string | null; jusqua: string | null;
    }>(SQL_PARTIES, [l.id, o.dateRef]);
    occupations.set(cle, loc.map((x) => ({
      locataireId: x.locataire_id, cle: x.cle, nom: x.nom, depuis: x.depuis, jusqua: x.jusqua,
    })));
  }

  const idsProprios = [...new Set([...aMontrer.keys()]
    .map((c) => parCle.get(c)?.proprietaire_id ?? null)
    .filter((x): x is string => x !== null))];
  const idsLocataires = [...new Set([...occupations.values()].flat().map((x) => x.locataireId))];

  const contacts: CarteContacts = new Map();
  if (idsProprios.length > 0 || idsLocataires.length > 0) {
    // LOT CONTACTS-ET-EVENEMENT — la 267 est-elle là ? Sinon la colonne n'est nommée nulle part (repli générique).
    const avecLibelle = await libelleSourceContactDisponible();
    const { rows: cts } = await query<{
      sujet: string; sujet_id: string; sorte: string; valeur: string; valeur_brute: string;
      rang: number; libelle_source: string | null;
    }>(sqlContacts(avecLibelle, await conditionCoordonneeVivante()), [idsProprios, idsLocataires]);
    for (const c of cts) {
      const k = cleContact(c.sujet, c.sujet_id);
      const e = contacts.get(k) ?? { emails: [], telephones: [] };
      // 🔴 LE LIBELLÉ N'EST JAMAIS VIDE : `libelleContact` retombe sur la sorte numérotée par le rang.
      const coord: Coordonnee = {
        valeur: c.valeur,
        // 🔴 LOT FICHES-RETOUCHES — un telephone s'affiche groupe par deux ; un e-mail n'est pas touche.
        affichage: c.sorte === 'telephone'
          ? formaterTelephone(c.valeur, c.valeur_brute)
          : (c.valeur_brute.trim() === '' ? c.valeur : c.valeur_brute),
        // 🔴 LOT ANNOTATIONS-TEL — ce qui traînait à côté du numéro, et le type qu'il impose.
        note: c.sorte === 'telephone' ? decortiquerNumero(c.valeur_brute).note : null,
        typeAnnotation: c.sorte === 'telephone' ? decortiquerNumero(c.valeur_brute).type : null,
        libelle: libelleContact({ sorte: c.sorte, rang: c.rang, libelleSource: c.libelle_source }),
      };
      if (c.sorte === 'email') e.emails.push(coord);
      else if (c.sorte === 'telephone') e.telephones.push(coord);
      contacts.set(k, e);
    }
  }
  const contactsDe = (sujet: string, id: string | null): { emails: Coordonnee[]; telephones: Coordonnee[] } =>
    (id === null ? undefined : contacts.get(cleContact(sujet, id))) ?? { emails: [], telephones: [] };

  const biens: BienProposable[] = [];
  for (const [cle, info] of aMontrer) {
    const l = parCle.get(cle);
    if (l === undefined) continue;
    const parties: PartieBien[] = [];
    if (l.proprietaire_cle !== null) {
      const c = contactsDe('proprietaire', l.proprietaire_id);
      parties.push({
        role: 'proprietaire', cle: l.proprietaire_cle, nom: l.proprietaire_nom ?? '(sans nom)',
        civilite: l.proprietaire_civilite, emails: c.emails, telephones: c.telephones,
      });
    }
    for (const x of occupations.get(cle) ?? []) {
      const c = contactsDe('locataire', x.locataireId);
      parties.push({
        role: 'locataire', cle: x.cle, nom: x.nom, depuis: x.depuis, jusqua: x.jusqua,
        emails: c.emails, telephones: c.telephones,
      });
    }
    const fiche = {
      cle: l.cle, adresse: l.adresse, codePostal: l.code_postal, commune: l.commune,
      immeuble: l.immeuble, nature: l.nature, typeBien: l.type_bien,
      gestionDebut: l.gestion_debut, gestionFin: l.gestion_fin,
    };
    biens.push({
      cle: l.cle,
      libelle: libelleBien({ adresse: l.adresse, commune: l.commune, cle: l.cle }),
      adresse: l.adresse, commune: l.commune, typeBien: l.type_bien, nature: l.nature,
      adresseComplete: adresseComplete(fiche),
      caracteristiques: caracteristiquesDuLot(fiche),
      parties,
      recommande: info.preCoche,
      motif: info.motif,
      cas: info.cas,
      certitude: info.certitude,
      dejaRattache: clesConfirmees.has(l.cle),
    });
  }


  /** Le propriétaire qui TITRE la liste — jamais une cible. Celui des biens proposés, s'ils n'en ont qu'un. */
  const propsVus = [...new Set(biens.map((b) => b.parties.find((p) => p.role === 'proprietaire')?.cle ?? '')
    .filter((x) => x !== ''))];
  const proprio = propsVus.length === 1
    ? biens.find((b) => b.parties.some((p) => p.role === 'proprietaire' && p.cle === propsVus[0]))
      ?.parties.find((p) => p.role === 'proprietaire') ?? null
    : null;

  return {
    /**
     * ⚠️ LE PLUS SÛR EN TÊTE : quasi certain, puis pré-coché, puis l'ordre alphabétique. Un bien trouvé par son
     * locataire ne doit pas être à chercher au milieu des huit lots du bailleur.
     */
    biens: biens.sort((a, b) =>
      Number(b.certitude === 'quasi_certaine') - Number(a.certitude === 'quasi_certaine')
      || Number(b.recommande) - Number(a.recommande)
      || a.libelle.localeCompare(b.libelle, 'fr')),
    examen: { issue: examen.issue, motif: examen.motif },
    proprietaire: proprio === null ? null : { cle: proprio.cle, nom: proprio.nom },
  };
}

/**
 * ══ CE QU'IL FAUT POUR CLASSER CE MAIL. LECTURE SEULE. ═══════════════════════════════════════════════════════════
 *
 * ⚠️ SANS ANNUAIRE OU SANS RATTACHEMENTS, on rend `disponible: false` plutôt qu'une liste vide. Une liste vide se
 * lirait « aucun bien ne correspond », ce qui serait faux : on n'a simplement pas pu chercher.
 */
export async function contexteClassement(messageId: number): Promise<ContexteClassement> {
  const vide: ContexteClassement = {
    messageId, filId: null, dateMail: null, nbMailsDuFil: 0, proprietaire: null, biens: [],
    examen: { issue: 'sans_candidat', motif: 'annuaire ou rattachements non installés' }, pieces: [],
    disponible: false,
  };
  if (!(await annuaireDisponible()) || !(await rattachementsDisponibles())) return vide;

  // ── ① LE MAIL : sa date (qui décide des parties), son échange, son objet et son corps (cas c et d) ───────────
  const { rows: msg } = await query<{
    fil_id: string | null; recu_le: string; nb: number; objet: string | null; corps: string | null;
  }>(
    `SELECT m.fil_id::text AS fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = m.fil_id)::int AS nb,
            m.objet, left(coalesce(m.corps_texte, ''), 4000) AS corps
       FROM gestion_message m WHERE m.id = $1`, [messageId]);
  const m = msg[0];
  if (m === undefined) return vide;
  const dateMail = m.recu_le;
  const filId = m.fil_id === null ? null : Number(m.fil_id);

  // ── LES PIÈCES JOINTES : leur nom nourrit la reconnaissance (cas c et d) ET le classement pièce par pièce ────
  const { rows: pieces } = await query<{
    id: string; nom_fichier: string; nom_origine: string; miniature: boolean;
  }>(
    `SELECT p.id::text, ${await sqlNomAffiche('p')} AS nom_fichier, ${sqlNomOrigine('p')} AS nom_origine,
            ${(await miniaturesDisponibles()) ? 'p.miniature_cle IS NOT NULL' : 'false'} AS miniature
       FROM gestion_piece p WHERE p.message_id = $1 ORDER BY p.id`, [messageId]);

  /**
   * ── ② LES ADRESSES, celles du mail ET celles de l'échange ────────────────────────────────────────────────────
   * 🔴 C'est `gestion_message_adresse` qui porte déjà, pour chaque adresse, ce que l'annuaire en dit À LA DATE DU
   * MAIL : interne ou non, partie (locataire / propriétaire), lot occupé, propriétaire. On ne recalcule rien ici.
   */
  const { rows: adr } = await query<{
    adresse: string; interne: boolean; partie: string | null; lot_cle: string | null;
    proprietaire_cle: string | null; du_mail: boolean;
  }>(
    `SELECT a.adresse, a.interne, a.partie, a.lot_cle, a.proprietaire_cle,
            (a.message_id = $1) AS du_mail
       FROM gestion_message_adresse a
       JOIN gestion_message mm ON mm.id = a.message_id
      WHERE a.message_id = $1 OR ($2::bigint IS NOT NULL AND mm.fil_id = $2::bigint)`,
    [messageId, filId]);

  const adresses: AdresseVue[] = adr.map((a) => ({
    adresse: a.adresse,
    interne: a.interne,
    partie: a.partie === 'locataire' || a.partie === 'proprietaire' ? a.partie : null,
    lotCle: a.lot_cle,
    proprietaireCle: a.proprietaire_cle,
    duMail: a.du_mail,
  }));

  /**
   * ── ③ À ⑥ : LE CŒUR, PARTAGÉ AVEC LA RÉDACTION (voir `construireBiens`). Les liens déjà posés sur CE mail sont
   * lus ici, parce qu'eux seuls dépendent du message.
   */
  const { rows: liens } = await query<{ cible_sorte: string; cible_cle: string | null; statut: string }>(
    `SELECT cible_sorte, cible_cle, statut FROM gestion_rattachement
      WHERE message_id = $1 AND statut IN ('propose', 'confirme')`, [messageId]);
  const coeur = await construireBiens({
    adresses,
    /**
     * ⚠️ LA RECONNAISSANCE LIT LES DEUX NOMS, L'ÉCRAN UN SEUL. Une règle qui repère « bail » dans un nom de
     * fichier doit continuer de le repérer après un renommage — et le repérer aussi dans le nom sous lequel la
     * pièce est ARRIVÉE, qui est celui que le correspondant a choisi. N'en garder qu'un ferait manquer un
     * classement une fois sur deux, sans que rien ne le dise. Le doublon est écarté quand les deux coïncident.
     */
    textes: {
      objet: m.objet, corps: m.corps,
      pieces: [...new Set(pieces.flatMap((p) => [p.nom_fichier, p.nom_origine]))],
    },
    dateRef: dateMail,
    liens,
  });

  return {
    messageId,
    filId,
    dateMail,
    nbMailsDuFil: m.nb,
    proprietaire: coeur.proprietaire,
    examen: coeur.examen,
    pieces: pieces.map((p) => ({ pieceId: Number(p.id), nom: p.nom_fichier, miniature: p.miniature === true })),
    biens: coeur.biens,
    disponible: true,
  };
}


/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHER-EN-ECRIVANT — LES PROPOSITIONS PENDANT QU'ON ÉCRIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce que la rédaction rend : les mêmes cartes que le classement d'un mail reçu, plus ce qui lui est propre. */
export interface ContexteRedaction {
  /** Les biens proposés, avec leurs parties À LA DATE DU JOUR et leur motif en clair. */
  biens: BienProposable[];
  examen: { issue: 'automatique' | 'a_trancher' | 'sans_candidat'; motif: string };
  proprietaire: { cle: string; nom: string } | null;
  /**
   * 🔴 « INTERNE » EST-IL À PROPOSER EN PREMIER ? Vrai quand TOUS les destinataires sont en @sansvisavis.com ou
   * @criterimmo.fr (demande d'Arno). C'est une PROPOSITION, jamais une décision : rien n'est posé ici.
   */
  interneDabord: boolean;
  /** `false` = annuaire ou migration 257 absents : l'écran le DIT au lieu de montrer une liste vide. */
  disponible: boolean;
}

/**
 * ══ 🔴🔴 QUELS BIENS CE MAIL-QU'ON-ÉCRIT PEUT-IL CONCERNER ? LECTURE SEULE ══════════════════════════════════════
 *
 * Demande d'Arno : « dès qu'une adresse est VALIDÉE dans À, Cc ou Cci […] le moteur de propositions calcule les
 * biens concernés à partir de TOUS les destinataires ».
 *
 * 🔴 LE MÊME MOTEUR, LES MÊMES RÈGLES (a–e), LES MÊMES CARTES que le classement d'un mail reçu : tout passe par
 * `construireBiens`. C'est ce qui garantit qu'un bien proposé à l'écriture ne disparaîtra pas à la réception.
 *
 * ⚠️ LA DIFFÉRENCE AVEC UN MAIL REÇU, ET IL N'Y EN A QU'UNE : il n'y a pas de message en base. Les adresses ne
 * peuvent donc pas être lues dans `gestion_message_adresse` (qui est peuplée par la relève) — on les RECONNAÎT à
 * chaud, avec `reconnaitre`, LA MÊME fonction pure que la relève emploie. Rien n'est réécrit, rien n'est
 * recalculé autrement.
 *
 * 🔴 LA DATE DE RÉFÉRENCE EST AUJOURD'HUI, et c'est la seule réponse juste : on écrit au locataire
 * d'aujourd'hui, pas à celui d'août 2025. (Un mail reçu, lui, se classe à SA date — c'est la règle inverse, et
 * elle est tout aussi juste : le courrier d'un locataire sorti appartient à son occupation.)
 *
 * ⚠️ AUCUNE ÉCRITURE. Cette fonction ne pose aucun rattachement : elle PROPOSE. C'est la validation de la modale
 * qui écrit, à l'envoi, par la porte existante.
 */
export async function contexteClassementRedaction(o: {
  /** Toutes les adresses saisies dans À, Cc et Cci. Les doublons sont écartés ici. */
  destinataires: readonly string[];
  /** L'objet en cours de saisie, s'il y en a un : il peut citer une adresse ou un n° de lot (cas c et d). */
  objet?: string | null;
  /** Le corps en cours de saisie. Borné par l'appelant : on ne cherche pas dans dix pages. */
  corps?: string | null;
  /** Les noms des pièces déjà jointes : « Quittance 12 rue Danton.pdf » désigne un bien aussi sûrement qu'un objet. */
  pieces?: readonly string[];
}): Promise<ContexteRedaction> {
  const adressesSaisies = [...new Set(
    o.destinataires.map((d) => (d ?? '').trim().toLowerCase()).filter((d) => d !== ''),
  )];
  const vide: ContexteRedaction = {
    biens: [], examen: { issue: 'sans_candidat', motif: 'annuaire ou rattachements non installés' },
    proprietaire: null, interneDabord: proposerInterneDabord(adressesSaisies), disponible: false,
  };
  if (adressesSaisies.length === 0) {
    return { ...vide, examen: { issue: 'sans_candidat', motif: 'aucun destinataire saisi' }, disponible: true };
  }
  if (!(await annuaireDisponible()) || !(await rattachementsDisponibles())) return vide;

  /**
   * ⚠️ L'ANNUAIRE EST LU EN UNE FOIS, comme le fait la relève. Mesuré le 28/09/2026 : 365 lots, et quelques
   * milliers de coordonnées — une lecture, pas une par adresse saisie.
   */
  const annuaire = await chargerAnnuaireAdresses();
  const jour = new Date().toISOString().slice(0, 10);

  /**
   * 🔴 LA RECONNAISSANCE EST CELLE DE LA RELÈVE, appelée telle quelle. `estInterne` écarte nos propres adresses
   * comme CLÉ (cas e) — sans les effacer de la liste, exactement comme pour un mail reçu.
   */
  const adresses: AdresseVue[] = adressesSaisies.map((adresse) => {
    const interne = estInterne(adresse, annuaire.adresseGestion, annuaire.partenaires);
    const r = reconnaitre({ adresse, adresseBrute: adresse, role: 'destinataire', interne },
      jour, annuaire.contacts, annuaire.occupations);
    return {
      adresse,
      interne,
      partie: r.partie,
      lotCle: r.lotCle,
      proprietaireCle: r.proprietaireCle,
      // ⚠️ TOUTES DU « MAIL » : il n'y a pas d'échange derrière, donc rien qui vienne d'ailleurs.
      duMail: true,
    };
  });

  const coeur = await construireBiens({
    adresses,
    textes: { objet: o.objet ?? null, corps: o.corps ?? null, pieces: o.pieces ?? [] },
    dateRef: jour,
    // ⚠️ AUCUN LIEN DÉJÀ POSÉ : le mail n'existe pas encore. Voir l'encadré de `construireBiens`.
    liens: [],
  });

  return {
    biens: coeur.biens,
    examen: coeur.examen,
    proprietaire: coeur.proprietaire,
    interneDabord: proposerInterneDabord(adressesSaisies),
    disponible: true,
  };
}

/**
 * LES MAILS D'UNE CONVERSATION QUI N'ONT AUCUN RATTACHEMENT MANUEL. LECTURE SEULE.
 *
 * 🔴 C'EST LA PORTÉE « TOUTE LA CONVERSATION », et elle ne PIÉTINE JAMAIS un geste humain : un mail que quelqu'un
 * a classé à la main garde son classement. Appliquer le nouveau partout écraserait, sans le dire, une décision
 * prise en connaissance de cause — exactement ce qu'un classement en masse ne doit pas faire.
 */
export async function mailsSansClassementManuel(filId: number): Promise<number[]> {
  if (!(await rattachementsDisponibles())) return [];
  const { rows } = await query<{ id: string }>(
    `SELECT m.id::text FROM gestion_message m
      WHERE m.fil_id = $1::bigint
        AND NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.statut = 'confirme'
             AND (r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL)
             AND r.cible_sorte IN ('lot', 'proprietaire', 'locataire'))
      ORDER BY m.recu_le, m.id`, [filId]);
  return rows.map((r) => Number(r.id));
}
