import { cleImmeuble, type ContactForm, type FicheSyndic, type ImmeubleConnu, type SyndicForm } from './syndics';

/**
 * ══ 🔴🔴 LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — UNE FICHE SYNDIC N'EXISTE QU'UNE FOIS, ET SE PARTAGE PAR LIEN ══════════
 *
 * RÈGLE D'ARNO (12/10/2026), écrite ici et éprouvée par les tests :
 *   1. NIVEAU CABINET (nom, adresse, standard, e-mail générique, note) : UNE seule fiche (`gestion_syndic`), commune à
 *      TOUS les biens rattachés à ce syndic, quel que soit l'immeuble ;
 *   2. NIVEAU COPROPRIÉTÉ / IMMEUBLE (contacts syndic de cette copropriété = affectations ; habitants et gardien =
 *      carnet de la copropriété ; adresses de la copropriété) : commun à TOUS les biens de cette copropriété ;
 *   3. rattacher un syndic existant à un bien = rattacher le bien à la fiche ENTIÈRE (le lien lot → copropriété passe
 *      par la clé de son « Immeuble », ou par une adresse secondaire de la copropriété) ;
 *   4. modifier depuis la carte d'UN bien modifie la fiche commune : les autres biens la relisent, rien n'est recopié.
 *
 * 🔴 IL N'Y A AUCUNE COPIE PAR BIEN DANS LE MODÈLE : le bien ne porte ni syndic ni contact ; il ne porte que sa note
 * (`gestion_syndic_note_bien`, décision d'Arno du lot SYNDIC-NOTE-PAR-BIEN : c'est la seule chose propre à un bien).
 *
 * MODULE PUR (écran et serveur).
 */

export interface BienPartage { id: number; numero: string; adresse: string }

const unique = (l: readonly BienPartage[]): BienPartage[] => [...new Map(l.map((b) => [b.id, b])).values()];

/** Les biens d'un cabinet : ceux de TOUTES ses copropriétés (adresses secondaires comprises). PUR. */
export function biensDuCabinet(fiche: Pick<FicheSyndic, 'coproprietes'>): BienPartage[] {
  return unique(fiche.coproprietes.flatMap((c) => c.lots.map((l) => ({ id: l.id, numero: l.numero, adresse: (l.adresse ?? '').trim() }))));
}

/** Les biens d'une copropriété du cabinet (clé principale, ou une de ses adresses secondaires). PUR. */
export function biensDeLaCopropriete(fiche: Pick<FicheSyndic, 'coproprietes'>, cle: string | null): BienPartage[] {
  if (cle === null || cle === '') return [];
  const c = fiche.coproprietes.find((x) => x.cle === cle || (x.adresses ?? []).some((a) => a.cle === cle));
  return c === undefined ? [] : unique(c.lots.map((l) => ({ id: l.id, numero: l.numero, adresse: (l.adresse ?? '').trim() })));
}

/**
 * La carte syndic d'un bien : les AUTRES biens qui partagent sa fiche (tout le cabinet), lus dans l'annuaire des
 * immeubles déjà chargé par l'écran (aucune requête de plus). PUR.
 */
export function biensPartagesDuCabinet(immeubles: readonly ImmeubleConnu[], syndicId: number, lotId: number | null): BienPartage[] {
  return unique(immeubles.filter((i) => i.syndic?.id === syndicId)
    .flatMap((i) => i.lots.map((l) => ({ id: l.id, numero: l.numero, adresse: (l.adresse ?? i.libelle).trim() }))))
    .filter((b) => b.id !== lotId)
    .sort((a, b) => a.adresse.localeCompare(b.adresse, 'fr') || a.numero.localeCompare(b.numero, 'fr', { numeric: true }));
}

/**
 * ══ 🔴 LOT PARTAGE-CABINET-IMMEUBLE — LES AUTRES BIENS, EN DEUX GROUPES ══ « Dans cet immeuble » (la copropriété du
 * bien, adresses secondaires comprises) puis « Autres immeubles du cabinet ». PUR.
 */
export function biensPartagesParGroupe(
  immeubles: readonly ImmeubleConnu[], syndicId: number, lotId: number | null, cleBien: string,
): { immeuble: BienPartage[]; autres: BienPartage[] } {
  const coproDe = (i: ImmeubleConnu): string => i.principale?.cle ?? i.cle;
  const ici = immeubles.find((i) => i.cle === cleBien);
  const coproIci = ici === undefined ? null : coproDe(ici);
  const tous = biensPartagesDuCabinet(immeubles, syndicId, lotId);
  const dansImmeuble = new Set(immeubles.filter((i) => i.syndic?.id === syndicId && coproIci !== null && coproDe(i) === coproIci)
    .flatMap((i) => i.lots.map((l) => l.id)));
  return { immeuble: tous.filter((b) => dansImmeuble.has(b.id)), autres: tous.filter((b) => !dansImmeuble.has(b.id)) };
}

/**
 * « Fiche partagée avec 3 autres biens du cabinet, dont 1 dans cet immeuble », « … aucun dans cet immeuble », ou
 * `null` quand elle n'est partagée avec aucun (pas de ligne). PUR.
 */
export function motFichePartagee(n: number, dansImmeuble = 0): string | null {
  if (n <= 0) return null;
  const tete = n === 1 ? 'Fiche partagée avec 1 autre bien du cabinet' : `Fiche partagée avec ${n} autres biens du cabinet`;
  return dansImmeuble <= 0 ? `${tete}, aucun dans cet immeuble` : `${tete}, dont ${dansImmeuble} dans cet immeuble`;
}

export const TITRE_GROUPE_IMMEUBLE = 'Dans cet immeuble';
export const TITRE_GROUPE_AUTRES = 'Autres immeubles du cabinet';

/** Une ligne de la bulle : « 25 rue Edith Cavell — lot 219 ». PUR. */
export const ligneBienPartage = (b: BienPartage): string => `${b.adresse === '' ? 'adresse inconnue' : b.adresse} — lot ${b.numero}`;

/* ══ CE QU'UNE SAISIE MODIFIE : LE CABINET, LA COPROPRIÉTÉ DU BIEN, OU LES DEUX ═══════════════════════════════════════ */

/** Un contact, sans ses affectations (qui sont du niveau copropriété) ni sa clé d'écran. */
const contenuContact = (c: ContactForm) => JSON.stringify({
  id: c.id, t: c.titreChoix, l: c.titreLibre, p: c.prenom, n: c.nom, civ: c.civilite, r: c.reintegre === true,
  k: c.coordonnees.map((x) => [x.id, x.sorte, x.choix, x.libre, x.valeur]),
});

/**
 * 🔴 LES NIVEAUX QU'UNE SAISIE TOUCHE. PUR.
 *   · cabinet : nom, adresse, standards, e-mail générique, note ; un contact ajouté, modifié, réintégré ou qui « ne
 *     travaille plus ici » (un contact du syndic appartient au CABINET) ;
 *   · copropriété : les contacts affectés à la copropriété du bien (« Détacher de la copropriété » compris), le carnet
 *     de l'immeuble (habitants, gardien), les adresses de la copropriété.
 * La note du bien n'est d'aucun des deux : elle est propre au bien.
 */
export function niveauxModifies(avant: SyndicForm, apres: SyndicForm, cleCopro: string | null): { cabinet: boolean; copropriete: boolean } {
  const tels = (f: SyndicForm) => f.telephones.map((t) => t.replace(/\D/g, '')).filter((t) => t !== '').join(',');
  const cabinetChamps = avant.nom !== apres.nom || avant.adresse !== apres.adresse || avant.codePostal !== apres.codePostal
    || avant.ville !== apres.ville || tels(avant) !== tels(apres) || avant.email !== apres.email || avant.note !== apres.note;
  const contenus = (f: SyndicForm) => f.contacts.map(contenuContact).sort().join('|');
  const cabinet = cabinetChamps || (apres.partis ?? []).length > 0 || contenus(avant) !== contenus(apres);
  let copropriete = false;
  if (cleCopro !== null && cleCopro !== '') {
    const suivis = (f: SyndicForm) => f.contacts.filter((c) => c.immeubles.includes(cleCopro)).map((c) => c.id ?? c.cle).sort().join(',');
    const carnet = (f: SyndicForm) => JSON.stringify((f.immeubleContacts?.contacts ?? []).map((c) => [contenuContact(c), c.note ?? '']));
    const adresses = (f: SyndicForm) => JSON.stringify(f.immeubles.find((i) => cleImmeuble(i.libelle) === cleCopro) ?? null);
    copropriete = suivis(avant) !== suivis(apres) || adresses(avant) !== adresses(apres)
      || (apres.immeubleContacts != null && avant.immeubleContacts != null && carnet(avant) !== carnet(apres));
  }
  return { cabinet, copropriete };
}

/**
 * L'AVERTISSEMENT AVANT D'ENREGISTRER DEPUIS UN BIEN, ou `null` quand la modification ne concerne qu'un bien. PUR.
 * « Cette modification s'appliquera aux 4 biens rattachés à cette fiche (cabinet : 4 biens ; copropriété : 2 biens de
 * l'immeuble). »
 */
export function motAvertissementPartage(n: { cabinet: number | null; copropriete: number | null }): string | null {
  const c = n.cabinet !== null && n.cabinet > 1 ? n.cabinet : null;
  const p = n.copropriete !== null && n.copropriete > 1 ? n.copropriete : null;
  if (c === null && p === null) return null;
  const total = Math.max(c ?? 0, p ?? 0);
  const details = [c !== null ? `cabinet : ${c} biens du cabinet` : null, p !== null ? `copropriété : ${p} biens de l’immeuble` : null]
    .filter((x): x is string => x !== null);
  return `Cette modification s’appliquera aux ${total} biens rattachés à cette fiche (${details.join(' ; ')}).`;
}

/* ══ LE MESSAGE DE CONFIRMATION D'UN RATTACHEMENT ═══════════════════════════════════════════════════════════════════ */

/** Ce que le serveur rend après avoir rattaché un bien à la fiche d'un syndic. */
export interface ResumeRattachement {
  syndic: { id: number; nom: string; ville: string | null };
  copro: { cle: string; libelle: string };
  /** Vrai : l'immeuble du bien est devenu une NOUVELLE copropriété du cabinet ; faux : il a rejoint une copropriété. */
  nouvelleCopro: boolean;
  contactsSyndic: number;
  habitants: number;
  autresBiens: number;
  /** Nouvelle copropriété : les contacts du cabinet qui ne la suivent pas encore (« Ajouter », par lien). */
  contactsProposables: Array<{ id: number; nom: string; titre: string | null }>;
}

const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n === 1 ? un : plusieurs}`;

/** « Syndic TEST ARNAUD rattaché — 2 contacts syndic et 1 habitant / gardien partagés avec 3 autres biens ». PUR. */
export function motConfirmationRattachement(r: Pick<ResumeRattachement, 'syndic' | 'contactsSyndic' | 'habitants' | 'autresBiens'>): string {
  return `Syndic ${r.syndic.nom} rattaché — ${pluriel(r.contactsSyndic, 'contact syndic', 'contacts syndic')} et `
    + `${pluriel(r.habitants, 'habitant / gardien', 'habitants / gardien')} partagés avec ${pluriel(r.autresBiens, 'autre bien', 'autres biens')}`;
}
