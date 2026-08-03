/**
 * Helpers PURS de l'éditeur de contact mairie (chantier S15) — construction du corps de la requête PATCH /contact et
 * pré-remplissage de la note. Sortis de `PermisVue` pour être testables en Node (aucun React, aucune I/O).
 */
import { validerCanal, type CanalContact } from '../../../../lib/sitadel/mairieContact';

export interface EditionContact {
  code: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
  telephone: string; responsableNom: string; telephoneStandard: string; emailType: string;
}

/** Natures possibles de l'adresse e-mail (S19), libellés en français clair. '' (option de tête) = non renseignée → NULL. */
export const EMAIL_TYPES: readonly { value: string; label: string }[] = [
  { value: '', label: '— non renseignée —' },
  { value: 'urbanisme', label: 'service urbanisme' },
  { value: 'accueil', label: 'accueil général de la mairie' },
  { value: 'prada', label: 'PRADA' },
  { value: 'inconnu', label: 'non déterminée' },
];
/** Mention (information, jamais blocage) affichée quand l'adresse est un accueil général. */
export const MENTION_ACCUEIL = 'Cette adresse est un accueil général : la demande partira vers l’accueil de la mairie et sera peut-être moins bien orientée vers le service compétent.';

/** Raison pour laquelle une URL de téléservice ne peut pas être ouverte, ou `null` si elle est ouvrable (http/https). */
export function problemeUrlOuverture(url: string): string | null {
  const u = url.trim();
  if (u === '') return 'aucune URL de téléservice';
  if (!/^https?:\/\/\S+$/.test(u)) return 'URL invalide (attendu http(s)://…)';
  return null;
}

/**
 * Canaux du sélecteur, par PRÉFÉRENCE DÉCROISSANTE (chantier « ergonomie du canal ») : téléservice → e-mail → courrier →
 * inconnu. ⚠️ 'formulaire' n'est JAMAIS un défaut « à l'aveugle » : il n'est présélectionné que si un téléservice est connu
 * (url_formulaire renseignée), sinon on ferait mentir l'écran.
 */
export const CANAUX_ORDONNES: readonly { value: CanalContact; label: string }[] = [
  { value: 'formulaire', label: 'formulaire web (téléservice)' },
  { value: 'email', label: 'e-mail' },
  { value: 'courrier', label: 'courrier' },
  { value: 'inconnu', label: 'inconnu (sans destinataire)' },
];

/** Aide contextuelle sous le sélecteur — rappelle la règle, dont la conséquence surprenante : courrier/inconnu = 0 demande. */
export const AIDE_CANAL = 'Le téléservice est à privilégier quand il existe ; l’e-mail est le canal par défaut ; le courrier et « inconnu » ne produisent aucune demande.';
/** Mention affichée quand un téléservice est connu et que « formulaire web » a été présélectionné (suggestion, pas verrou). */
export const MENTION_TELESERVICE = 'Un téléservice est connu pour cette commune : « formulaire web » est présélectionné (modifiable).';

/**
 * Faits LECTURE SEULE d'une commune (S21) — affichés dans la modale, jamais recopiés dans des champs éditables. ⚠️ La
 * PRADA (responsable de l'accès aux documents) N'EST PAS le responsable du service urbanisme : ces valeurs restent
 * distinctes de `mairie_contact.responsable_nom`. Chaque info porte son ORIGINE en texte.
 */
export interface FicheCommune {
  // — Reflet du destinataire réellement ENREGISTRÉ en base (S22) : les champs éditables, vus « côté base ».
  destinataireActuel: string | null;   // mairie_contact.email — le destinataire actuel (miroir lecture seule)
  canalEnregistre: string | null;      // mairie_contact.canal
  contactStatut: string | null;        // presume|confirme|invalide → origine des infos de contact
  contactSource: string | null;        // mairie_contact.source (annuaire|saisie_manuelle|reponse_mairie)
  telephone: string | null;            // téléphone du service urbanisme (miroir)
  telephoneStandard: string | null;    // standard de la mairie (miroir)
  responsableNom: string | null;       // responsable du service urbanisme (miroir)
  adressePostale: string | null;       // affichée quel que soit le canal
  protocoleSource: string | null;      // URL cliquable
  protocoleVerifieLe: string | null;
  emailType: string | null;
  pradaCourriel: string | null;
  pradaNom: string | null;             // « Prénom Nom » composé (annuaire CADA)
  pradaAdresse: string | null;
  pradaMillesime: string | null;
  pradaOrigine: string | null;         // annuaire_cada|saisie_manuelle
  pradaStatut: string | null;          // presume|confirme|invalide
  pradaRapprochement: string | null;   // automatique|manuel|ambigu|…
}

/** Origine (en texte) d'une info de contact d'après le statut du contact. */
export function origineContact(statut: string | null): string {
  if (statut === 'confirme') return 'saisie manuelle (vérifiée)';
  if (statut === 'invalide') return 'marquée invalide';
  if (statut === 'presume') return 'présumée (annuaire)';
  return 'origine inconnue';
}
/** Libellé français du statut de contact enregistré (ou 'non renseigné'). */
export function libelleStatut(statut: string | null): string {
  if (statut === 'confirme') return 'confirmé';
  if (statut === 'invalide') return 'invalide';
  if (statut === 'presume') return 'présumé';
  return 'non renseigné';
}
/** Libellé français de la source du contact enregistré (ou 'non renseigné'). */
export function libelleSource(source: string | null): string {
  if (source === 'saisie_manuelle') return 'saisie manuelle';
  if (source === 'annuaire') return 'annuaire';
  if (source === 'reponse_mairie') return 'réponse de la mairie';
  return 'non renseigné';
}
/** Libellé français d'un canal enregistré (ou 'non renseigné'). Réutilise les libellés du sélecteur. */
export function libelleCanal(canal: string | null): string {
  const c = CANAUX_ORDONNES.find((o) => o.value === canal);
  return c ? c.label : 'non renseigné';
}
/** Origine (en texte) de la PRADA d'après origine + rapprochement. */
export function originePrada(origine: string | null, rapprochement: string | null): string {
  const src = origine === 'saisie_manuelle' ? 'saisie manuelle' : 'annuaire CADA';
  const rap = rapprochement === 'manuel' ? ', rattachement manuel'
    : rapprochement === 'automatique' ? ', rattachement automatique'
    : rapprochement === 'ambigu' ? ', rattachement ambigu' : '';
  return `${src}${rap}`;
}
/** Libellé français d'un email_type (ou 'non renseigné'). */
export function libelleEmailType(v: string | null): string {
  const t = EMAIL_TYPES.find((o) => o.value === (v ?? '') && o.value !== '');
  return t ? t.label : 'non renseigné';
}

export interface EtatEditionContact {
  code: string; nom: string; canal: CanalContact; email: string; urlFormulaire: string; adressePostale: string;
  note: string; telephone: string; responsableNom: string; protocoleVerifieLe: string | null;
  telephoneStandard: string; emailType: string; // S19
  suggestionTeleservice: boolean; erreur: string;
}

/**
 * Champs bruts d'une commune, tels que remontés de la BASE (DossierAffiche). Entrée commune à `editionInitiale` (formulaire
 * éditable) et à `construireFiche` (miroir lecture seule). Séparer les deux est l'invariant S22 : la fiche ne suit JAMAIS
 * l'état d'édition — elle ne dépend QUE de ces valeurs de base.
 */
export interface BaseCommune {
  codeInsee: string; communeNom: string | null;
  destCanal: CanalContact | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null;
  destTelephone?: string | null; destResponsableNom?: string | null; destProtocoleVerifieLe?: string | null;
  destTelephoneStandard?: string | null; destEmailType?: string | null;
  destStatut?: string | null; destSource?: string | null; destProtocoleSource?: string | null;
  destPradaCourriel?: string | null; destPradaNom?: string | null; destPradaAdresse?: string | null;
  destPradaMillesime?: string | null; destPradaOrigine?: string | null; destPradaStatut?: string | null; destPradaRapprochement?: string | null;
}

const nul = (v: string | null | undefined): string | null => ((v ?? '').trim() === '' ? null : (v ?? '').trim());

/**
 * Fiche LECTURE SEULE « Ce que l'on sait de cette commune » (S22) — construite EXCLUSIVEMENT depuis la ligne en base
 * (`BaseCommune`), JAMAIS depuis l'état d'édition. Éditer le formulaire (canal, e-mail, …) ne change AUCUNE valeur de la
 * fiche : elle est le reflet de ce qui est ENREGISTRÉ, pas de ce qu'on est en train de saisir. Rien n'est recopié dans les
 * champs éditables (cf. responsableNom vs PRADA).
 */
export function construireFiche(d: BaseCommune): FicheCommune {
  return {
    destinataireActuel: nul(d.destEmail),
    canalEnregistre: nul(d.destCanal),
    contactStatut: d.destStatut ?? null,
    contactSource: nul(d.destSource),
    telephone: nul(d.destTelephone),
    telephoneStandard: nul(d.destTelephoneStandard),
    responsableNom: nul(d.destResponsableNom),
    adressePostale: nul(d.destAdressePostale),
    protocoleSource: nul(d.destProtocoleSource),
    protocoleVerifieLe: d.destProtocoleVerifieLe ?? null,
    emailType: d.destEmailType ?? null,
    pradaCourriel: nul(d.destPradaCourriel),
    pradaNom: d.destPradaNom ?? null,
    pradaAdresse: d.destPradaAdresse ?? null,
    pradaMillesime: d.destPradaMillesime ?? null,
    pradaOrigine: d.destPradaOrigine ?? null,
    pradaStatut: d.destPradaStatut ?? null,
    pradaRapprochement: d.destPradaRapprochement ?? null,
  };
}

/**
 * État initial de la modale d'édition de contact. PRÉSÉLECTION QUAND ON SAIT : si la commune a déjà une url_formulaire non
 * vide, on ouvre sur 'formulaire' (URL pré-remplie) même si le canal enregistré est autre, et on le SIGNALE
 * (`suggestionTeleservice`). Sinon on ouvre sur le canal enregistré, sans présélection (ne jamais deviner un téléservice).
 */
export function editionInitiale(d: BaseCommune): EtatEditionContact {
  const teleserviceConnu = (d.destUrlFormulaire ?? '').trim() !== '';
  return {
    code: d.codeInsee, nom: d.communeNom ?? d.codeInsee,
    canal: teleserviceConnu ? 'formulaire' : (d.destCanal ?? 'inconnu'),
    email: d.destEmail ?? '',
    urlFormulaire: d.destUrlFormulaire ?? '',
    adressePostale: d.destAdressePostale ?? '',
    note: '',
    telephone: d.destTelephone ?? '',
    // ⚠️ S21 : responsableNom vient de mairie_contact UNIQUEMENT — JAMAIS de la PRADA (destPradaNom). La PRADA n'est pas le
    // responsable du service ; recopier créerait deux sources de vérité divergentes au prochain millésime de l'annuaire.
    responsableNom: d.destResponsableNom ?? '',
    protocoleVerifieLe: d.destProtocoleVerifieLe ?? null,
    telephoneStandard: d.destTelephoneStandard ?? '',
    emailType: d.destEmailType ?? '',
    suggestionTeleservice: teleserviceConnu,
    erreur: '',
  };
}

/**
 * Problème de cohérence à ENREGISTRER, côté UI (S16) — miroir de la contrainte DB (051:28-32) et de `validerCanal` : un
 * canal 'formulaire' SANS URL (ou 'email' sans e-mail, 'courrier' sans adresse) est refusé AVANT l'appel réseau, pour un
 * message clair plutôt qu'un 400 de la route. Retourne le motif, ou `null` si cohérent.
 */
export function problemeContactUI(e: EditionContact): string | null {
  return validerCanal(e.canal as CanalContact, { email: e.email, urlFormulaire: e.urlFormulaire, adressePostale: e.adressePostale });
}

/** Corps EXACT envoyé à PATCH /api/admin/permis/contact — `note` INCLUSE (la route et ecrireContact l'acceptent déjà). */
export function corpsPatchContact(e: EditionContact): {
  codeInsee: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
  telephone: string; responsableNom: string; telephoneStandard: string; emailType: string;
} {
  return {
    codeInsee: e.code, canal: e.canal,
    email: e.email.trim(), urlFormulaire: e.urlFormulaire.trim(), adressePostale: e.adressePostale.trim(),
    note: e.note.trim(), telephone: e.telephone.trim(), responsableNom: e.responsableNom.trim(),
    telephoneStandard: e.telephoneStandard.trim(), emailType: e.emailType.trim(),
  };
}

/**
 * Corps EXACT du bouton « Utiliser le courriel de la PRADA » (S22). N'altère que ce qui doit l'être :
 *   - e-mail  → courriel PRADA
 *   - nature de l'adresse (email_type) → 'prada'
 *   - canal   → 'email' (NÉCESSAIRE : c'est le seul canal où mairie_contact.email est le destinataire ; on ne peut donc
 *               PAS adopter un e-mail sans passer le canal en 'email'. Ce changement est explicité dans la confirmation).
 * Tous les autres champs éditables (téléphone, standard, responsable, note) sont repris tels quels — jamais écrasés en
 * douce. Depuis S23, la route CONSERVE `adresse_postale` même en canal ≠ 'courrier' (plus d'effacement) : la BASU n'est
 * donc plus perdue. On garde `noteAuChangementCanal` comme TRACE lisible (bonus, plus un sauvetage), à partir de la valeur
 * EN BASE (`canalBase` / `adresseBase`), pas de l'état d'édition.
 */
export function corpsAdoptionPrada(e: EditionContact, pradaCourriel: string, canalBase: string, adresseBase: string): ReturnType<typeof corpsPatchContact> {
  const note = noteAuChangementCanal(canalBase, 'email', adresseBase, e.note);
  return corpsPatchContact({ ...e, canal: 'email', email: pradaCourriel, emailType: 'prada', note });
}

/**
 * Au changement de canal : si l'on QUITTE 'courrier' pour un autre canal et que la note est encore vide, on la pré-remplit
 * avec l'adresse postale actuelle. ⚠️ S23 — ce n'est PLUS un garde-fou de sauvetage : depuis S23 la route ne détruit plus
 * `adresse_postale` en fonction du canal (la vraie protection est CÔTÉ ROUTE, cf. `champsCoordonnees`), l'adresse reste donc
 * dans sa colonne. Cette pré-remplissage n'est qu'une COMMODITÉ D'AFFICHAGE (trace lisible en note), jamais la garantie de
 * non-perte. Sinon on garde la note telle quelle (jamais d'écrasement).
 */
export function noteAuChangementCanal(ancienCanal: string, nouveauCanal: string, adressePostale: string, noteActuelle: string): string {
  if (ancienCanal === 'courrier' && nouveauCanal !== 'courrier' && noteActuelle.trim() === '' && adressePostale.trim() !== '') {
    return `Ancienne adresse courrier : ${adressePostale.trim()}`;
  }
  return noteActuelle;
}
