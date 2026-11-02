import { homonymes, normApporteur } from '../transaction/homonymesApporteur';
import { collegueADate, libelleApporteur, texteRechercheApporteur, type Apporteur } from '../location/suivi/suivi';
import type { LigneApporteur } from '../transaction/modele';

/**
 * ══ 🔴 MON ESPACE, LOT 9 (Arno, 02/11/2026) — « MES APPORTEURS » : QUI JE VOIS, ET JAMAIS DE DOUBLON (décision 4) (PUR) ═════════════════════════
 * L'annuaire est celui de la Location (`gestion_location_apporteur`), le même pour toute l'agence : « Mon espace » n'en fait aucune copie.
 *   · JE VOIS : les apporteurs rattachés à moi (mon compte d'apporteur interne, ou je suis leur collègue de rattachement aujourd'hui), ceux qui
 *     apparaissent sur mes ventes (l'apporteur du dossier, le nom écrit, une rétrocession), et ceux que j'ai choisi d'« utiliser » (migration 450) ;
 *     un administrateur : tous ;
 *   · ZÉRO DOUBLON : avant toute création, sur TOUT l'annuaire (côté serveur) — le contrôle d'homonymes existant (`homonymes`), le même téléphone,
 *     le même e-mail (fiche principale et autres) ;
 *   · MODIFIER une fiche : son collègue de rattachement, l'apporteur interne lui-même, ou un administrateur.
 */

/** Un téléphone comparable : ses chiffres, l'indicatif +33 ramené à 0 ; les 9 derniers chiffres (moins de 9 : rien de sûr). PUR. */
export function telephoneComparable(t: string | null | undefined): string | null {
  const c = (t ?? '').replace(/\D/g, '').replace(/^0033/, '0').replace(/^33(?=\d{9}$)/, '0');
  return c.length < 9 ? null : c.slice(-9);
}
/** Un e-mail comparable : sans espaces, en minuscules ; sans « @ » : rien. PUR. */
export const emailComparable = (e: string | null | undefined): string | null => {
  const x = (e ?? '').trim().toLowerCase();
  return x.includes('@') ? x : null;
};

export interface SaisieApporteur { nom: string; prenom: string; telephone: string; email: string }
export interface Doublon { id: number; libelle: string; collegue: string | null; raisons: ('nom' | 'telephone' | 'email')[] }

/** Les fiches de l'annuaire (non archivées) qui sont déjà CET apporteur : homonyme, même téléphone, même e-mail. PUR. */
export function doublonsApporteur(s: SaisieApporteur, annuaire: readonly Apporteur[], jour: string): Doublon[] {
  const vivants = annuaire.filter((a) => !a.archive);
  const parNom = new Set(homonymes(s.prenom, s.nom, vivants.map((a) => ({ id: a.id, nom: a.nom, libelle: libelleApporteur(a), recherche: normApporteur(`${a.nom} ${a.prenom ?? ''} ${a.nomFamille ?? ''}`) })))
    .map((a) => a.id));
  const tel = telephoneComparable(s.telephone);
  const mel = emailComparable(s.email);
  const out: Doublon[] = [];
  for (const a of vivants) {
    const raisons: Doublon['raisons'] = [];
    if (parNom.has(a.id)) raisons.push('nom');
    if (tel !== null && [a.telephone, ...(a.telephonesAutres ?? [])].some((x) => telephoneComparable(x) === tel)) raisons.push('telephone');
    if (mel !== null && [a.email, ...(a.emailsAutres ?? [])].some((x) => emailComparable(x) === mel)) raisons.push('email');
    if (raisons.length > 0) out.push({ id: a.id, libelle: libelleApporteur(a), collegue: a.compteId != null ? `${a.compteLibelle ?? a.nom} (apporteur interne)` : collegueADate(a, jour)?.collegueLibelle ?? null, raisons });
  }
  return out;
}

/** « Cet apporteur existe déjà, rattaché à … » : le message d'un doublon. PUR. */
export const messageDoublon = (d: Doublon): string =>
  `Cet apporteur existe déjà${d.collegue === null ? ' (à rattacher)' : `, rattaché à ${d.collegue}`} : « ${d.libelle} »${d.raisons.includes('nom') ? '' : d.raisons.includes('telephone') ? ' (même téléphone)' : ' (même e-mail)'}.`;

/** Puis-je modifier la fiche de cet apporteur ? Son collègue de rattachement aujourd'hui, l'apporteur interne lui-même, un administrateur. PUR. */
export const peutModifierApporteur = (a: Apporteur, compteId: number, administrateur: boolean, jour: string): boolean =>
  administrateur || a.compteId === compteId || collegueADate(a, jour)?.collegueId === compteId;

/** Mon apporteur, tel que l'onglet le montre : sa fiche, son collègue, ses chiffres sur MES ventes (`parApporteur`), puis-je le modifier. */
export interface MonApporteur { id: number; libelle: string; interne: boolean; societe: string | null; telephone: string | null; email: string | null; collegue: string | null;
  recherche: string; modifiable: boolean; nbVentes: number; caApporteHt: number; retroHt: number; fiche: Apporteur }

/** Les apporteurs que je vois, avec leurs chiffres sur mes ventes. `surMesVentes` : ids (dossier) et noms écrits ; `lignes` : `parApporteur`. PUR. */
export function mesApporteursAnnuaire(annuaire: readonly Apporteur[], o: { compteId: number; administrateur: boolean; jour: string; idsSurMesVentes: ReadonlySet<number>;
  nomsSurMesVentes: ReadonlySet<string>; utilises: ReadonlySet<number>; lignes: readonly LigneApporteur[] }): MonApporteur[] {
  const ligneDe = (a: Apporteur): LigneApporteur | undefined => {
    const noms = new Set([normApporteur(a.nom), normApporteur(libelleApporteur(a))]);
    return o.lignes.find((l) => noms.has(normApporteur(l.apporteur)));
  };
  const nomsVentes = new Set([...o.nomsSurMesVentes].map(normApporteur));
  return annuaire.filter((a) => !a.archive).filter((a) => o.administrateur || a.compteId === o.compteId || collegueADate(a, o.jour)?.collegueId === o.compteId
    || o.idsSurMesVentes.has(a.id) || o.utilises.has(a.id) || nomsVentes.has(normApporteur(a.nom)) || nomsVentes.has(normApporteur(libelleApporteur(a))) || ligneDe(a) !== undefined)
    .map((a) => {
      const l = ligneDe(a);
      return { id: a.id, libelle: libelleApporteur(a), interne: a.compteId != null, societe: a.societe ?? null, telephone: a.telephone ?? null, email: a.email ?? null,
        collegue: a.compteId != null ? null : collegueADate(a, o.jour)?.collegueLibelle ?? null, recherche: texteRechercheApporteur(a),
        modifiable: peutModifierApporteur(a, o.compteId, o.administrateur, o.jour), nbVentes: l?.ventesIds.length ?? 0, caApporteHt: l?.caApporteHt ?? 0, retroHt: l?.retroHt ?? 0, fiche: a };
    })
    .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'));
}

/** La recherche de l'onglet : nom, téléphone (chiffres), e-mail. PUR. */
export function chercherApporteur(xs: readonly MonApporteur[], texte: string): MonApporteur[] {
  const t = normApporteur(texte);
  const tel = texte.replace(/\D/g, '');
  if (t === '') return [...xs];
  return xs.filter((a) => normApporteur(`${a.libelle} ${a.recherche} ${a.email ?? ''} ${a.societe ?? ''}`).includes(t) || (tel.length >= 4 && (a.recherche.replace(/\D/g, '') + (a.telephone ?? '').replace(/\D/g, '')).includes(tel)));
}

/** La réponse de GET /api/admin/mon-espace/apporteurs. */
export interface MesApporteursLus { apporteurs: MonApporteur[]; collegues: { id: number; libelle: string }[]; titulaireId: number; administrateur: boolean;
  utiliserDisponible: boolean; identite: boolean; nomPrenom: boolean }
