'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ht, LIBELLE_SOCIETE, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { BlocRepartition, commissionsResolues, texteDansUnite, texteTaux, etatSomme, motifSocieteVente, lignesDe, nombre, partiesPour, versModele, type ApporteurRef, type EtatRepartition, type NegociateurRef } from './Repartition';
import { ESPACE, eur, grouperSaisie, MOT_UNITE, posterTransactionDonnee, SelecteurAffichage, useAffichage } from './commun';
import { commissionDuCote, remunerationDuCote } from '../../../../lib/transaction/commissions';
import { libelleTaux, TAUX_SANS_PRIX, tauxDuPrix } from '../../../../lib/transaction/compromisCarte';
import { LONGUEUR_MAX_MANDAT } from '../../../../lib/transaction/mandat';
import { Journal } from './FormulaireVente';
import { BlocPersonnes, decrire, personneEcranDe, personneVide, type PersonneEcran, type PersonneRef } from './PersonnesDossier';
import { ApporteurAffaire } from './ApporteurAffaire';
// LOT H (Arno) — l'adresse du bien : LE composant d'autocomplétion d'adresse de l'administration (Base Adresse Nationale), aucune copie.
import { ChampAdresseBan, CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LE DOSSIER D'UN COMPROMIS (ou d'une vente répartie) ════════════════════
 * Vendeur(s) et acquéreur(s) avec leurs coordonnées — une personne déjà connue se choisit dans l'annuaire, et une saisie qui la désigne
 * (même e-mail, même téléphone, ou même nom et même adresse) la RÉUTILISE : jamais deux fiches —, adresse du bien, date du compromis et
 * date prévue de l'acte (et date de l'acte pour une vente), commission TTC et HT, puis le bloc partagé « Négociateurs et répartition ».
 * Enregistré, journalisé, réversible ; un refus (répartition ≠ 100 %…) laisse toute la saisie à l'écran.
 */

export type { PersonneRef } from './PersonnesDossier';
export interface References { lotD: boolean; negociateurs: NegociateurRef[]; apporteurs: ApporteurRef[]; personnes: PersonneRef[];
  /** 🔴 LOT AC — les comptes de l'interface (création d'un apporteur depuis le compromis) ; absent : réponse d'avant ce lot. */
  collegues?: { id: number; libelle: string; actif?: boolean }[];
  /** LOT E — la migration 435 (prix de vente) est-elle appliquée ? Absent : réponse d'avant ce lot (champ grisé). */
  prixVente?: boolean;
  /** LOT G — la migration 436 (annulation d'un compromis) est-elle appliquée ? */
  annulation?: boolean;
  /** LOT I — la migration 437 (commissions versées, saisie en HT ou en TTC) est-elle appliquée ? Absent : non (tout en TTC, comme avant). */
  uniteCommission?: boolean;
  /** 🔴 LOT BJ — la migration 443 (particulier / société, civilité, prénom, représentants) est-elle appliquée ? Absent : non (l'ancien formulaire). */
  personneType?: boolean;
  /** 🔴 MON ESPACE, LOT 2 — la migration 449 (n° de mandat) est-elle appliquée ? Absent : non (champ absent, mention « disponible après la mise à jour »). */
  mandat?: boolean }

const texteMontant = (x: number): string => String(x).replace('.', ',');

/** Le nom lisible de chaque liste des références. */
const MOT_LISTE = { negociateurs: 'des négociateurs', apporteurs: 'des apporteurs', personnes: 'des personnes', collegues: 'des collègues' } as const;
type ListeReferences = keyof typeof MOT_LISTE;

/**
 * 🔴 Arno (05/11/2026, production) — LES RÉFÉRENCES TOUJOURS DANS LA BONNE FORME : chaque liste absente ou mal formée (réponse d'avant, erreur,
 * champ perdu) devient une liste VIDE, et elle est nommée dans `manquantes` (l'écran le dit). « Collègues » est facultatif par contrat (absent :
 * réponse d'avant le LOT AC) : vide sans message s'il est absent, message s'il est mal formé. PUR.
 */
export function referencesSures(r: References | null | undefined): { references: References; manquantes: ListeReferences[] } {
  const brut = (r ?? {}) as Partial<Record<string, unknown>>;
  const manquantes: ListeReferences[] = [];
  const liste = <T,>(cle: ListeReferences, facultative = false): T[] => {
    const v = brut[cle];
    if (Array.isArray(v)) return v as T[];
    if (!(facultative && v === undefined)) manquantes.push(cle);
    return [];
  };
  const references = { ...(r ?? {}), lotD: brut.lotD === true, negociateurs: liste<NegociateurRef>('negociateurs'), apporteurs: liste<ApporteurRef>('apporteurs'),
    personnes: liste<PersonneRef>('personnes'), collegues: liste<{ id: number; libelle: string; actif?: boolean }>('collegues', true) } as References;
  return { references, manquantes };
}

/** « Liste des collègues indisponible, réessayez. » / « Listes des personnes et des collègues indisponibles, réessayez. » PUR. */
export function phraseListesIndisponibles(manquantes: readonly ListeReferences[]): string {
  const mots = manquantes.map((m) => MOT_LISTE[m]);
  const liees = mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
  return `${mots.length > 1 ? 'Listes' : 'Liste'} ${liees} ${mots.length > 1 ? 'indisponibles' : 'indisponible'}, réessayez.`;
}

/**
 * L'état de la répartition d'une vente lue (ou vide). PUR.
 * LOT I — `avecUnite` (437 appliquée) : la rétrocession et les commissions versées se lisent dans LEUR unité ; une saisie neuve propose
 * « HT ». Sans la 437 : la rétrocession reste en TTC, aucune commission par côté (comme avant).
 */
export function etatRepartitionDe(v: Vente | null, negos: readonly NegociateurRef[], avecUnite = false): EtatRepartition {
  const entreeId = v?.dossier?.entree?.id ?? null;
  const sortieId = v?.dossier?.sortie?.id ?? null;
  // La rétrocession enregistrée (dans son unité d'origine) ; à défaut, celle d'une réponse d'avant ce lot (TTC, dans la répartition).
  const retro = v?.retroApporteur ?? (v?.repartition && v.repartition.retroApporteurTtc !== 0 ? { montant: v.repartition.retroApporteurTtc, unite: 'ttc' as const } : null);
  // LOT O (Arno) — une commission déjà enregistrée : telle quelle, jamais recalculée. Sinon, PROPOSÉE (part de ce côté × commission TTC)
  // pour un compromis neuf ou un compromis réparti ; sans répartition (import « toute la commission à … ») : vide. TTC par défaut.
  // LOT R — le taux de rémunération enregistré (absent : 50 %, le défaut) accompagne la commission.
  const commission = (cote: 'entree' | 'sortie') => {
    const c = v === null ? null : commissionDuCote(v, cote);
    const t = v?.lignes.find((l) => l.role === 'negociateur' && l.cote === cote)?.taux;
    const taux = t == null ? {} : { taux: texteTaux(t) };
    // 🔴 LOT V (Arno) — son MODE : « calculée » (égale au calcul, ou enregistrée comme telle) suit le calcul à l'écran et s'enregistre recalculée ;
    // « saisie à la main » (différente du calcul, ou tapée) reste telle quelle. Non commissionné, ou sans calcul possible : telle quelle.
    const calculee = v !== null && c !== null && remunerationDuCote(v, cote)?.mode === 'calculee';
    if (c !== null) return { texte: texteMontant(c.montant.montant), unite: c.montant.unite, ...taux, ...(calculee ? { auto: true } : {}) };
    return { texte: '', unite: 'ttc' as const, auto: v === null || v.repartition != null, ...taux };
  };
  return { ...(v?.apporteurInterne === true ? { apporteurInterne: true } : {}), entreeId, sortieId, apporteurId: v?.dossier?.apporteurId ?? null, apporteurNom: v?.dossier?.apporteurId == null ? v?.apporteur ?? null : null,
    retroTexte: retro === null ? '' : texteMontant(retro.montant), retroUnite: retro !== null ? retro.unite : avecUnite ? 'ht' : 'ttc',
    commissions: avecUnite ? { entree: commission('entree'), sortie: commission('sortie') } : null,
    parties: v?.repartition ? avecSortieDuMeme(lignesDe(v.repartition.parties, negos), negos, entreeId, sortieId) : partiesPour(negos, entreeId, sortieId) };
}

/**
 * 🔴 LOT AZ — le MÊME négociateur à l'entrée et à la sortie, sortie à 0 % (elle n'est pas enregistrée comme partie : il porte tout, une fois) :
 * la ligne « Sortie du mandat » du panneau se relit AVEC son négociateur, à 0 % — comme la pastille de la carte (« MACJ · 0 % ») et le dossier.
 * Rien ne change à l'enregistrement (`versModele` ne garde pas cette ligne à 0). PUR.
 */
function avecSortieDuMeme(lignes: ReturnType<typeof lignesDe>, negos: readonly NegociateurRef[], entreeId: number | null, sortieId: number | null): ReturnType<typeof lignesDe> {
  const [entree, sortie] = lignes;
  if (sortieId === null || sortieId !== entreeId || entree?.compteId !== entreeId || sortie === undefined || sortie.compteId !== null || (nombre(sortie.texte) ?? 0) !== 0) return lignes;
  const ligne = partiesPour(negos, null, sortieId)[1];
  return [entree, { ...ligne, compteId: sortieId, negociateur: ligne.negociateur ?? entree.negociateur, societe: entree.societe, texte: '0' }, ...lignes.slice(2)];
}

/** Le corps envoyé à `dossier-enregistrer` (la saisie telle quelle : le serveur relit et vérifie tout). */
export function corpsDossier(societe: Societe, statut: 'compromis' | 'vendue', champs: { libelle: string; commission: string; dateCompromis: string; dateActePrevue: string;
  dateActe: string; adresseBien: string; note: string; prixVente?: string; numeroMandat?: string }, personnes: readonly PersonneEcran[], etat: EtatRepartition, lignes?: unknown[]): Record<string, unknown> {
  const r = commissionsResolues(etat, nombre(champs.commission) ?? Number.NaN);
  // 🔴 LOT V — le mode de chaque côté : proposée (« auto ») = calculée, le serveur la recalcule sur ce qui s'enregistre ; tapée = à la main.
  const modeDe = (cote: 'entree' | 'sortie'): 'calculee' | 'manuelle' => (etat.commissions?.[cote].auto === true ? 'calculee' : 'manuelle');
  return { societe, statut, libelle: champs.libelle, honorairesTtc: champs.commission, prixVente: champs.prixVente ?? '', dateCompromis: champs.dateCompromis || null, dateActePrevue: champs.dateActePrevue || null,
    dateActe: champs.dateActe || null, adresseBien: champs.adresseBien, note: champs.note, entreeId: r.entreeId, sortieId: r.sortieId, apporteurId: r.apporteurId,
    retroApporteurTtc: r.retroTexte, retroApporteurUnite: r.retroUnite ?? 'ttc', personnes: personnes.map((p) => ({ ...p })), parties: versModele(r.parties), ...(lignes ? { lignes } : {}),
    // 🔴 MON ESPACE, LOT 2 — le n° de mandat, seulement quand le formulaire le porte (migration 449) : absent, le n° enregistré reste tel quel.
    ...(champs.numeroMandat !== undefined ? { numeroMandat: champs.numeroMandat } : {}),
    // 🔴 LOT BH — l'apporteur écrit hors annuaire, gardé ; « Supprimer » : le lien est retiré.
    ...(etat.apporteurId === null && (etat.apporteurNom ?? '') !== '' && etat.retirerApporteur !== true ? { apporteurNom: etat.apporteurNom } : {}),
    ...(etat.retirerApporteur === true ? { retirerApporteur: true } : {}),
    // LOT O — une commission proposée part comme elle s'affiche (c'est « Enregistrer » qui la valide).
    // LOT I — les commissions versées (seulement avec la 437) : un côté sans négociateur n'en envoie pas.
    ...(r.commissions != null ? { commissions: {
      entree: r.entreeId === null ? null : { montant: r.commissions.entree.texte, unite: r.commissions.entree.unite, taux: r.commissions.entree.taux ?? null, mode: modeDe('entree') },
      sortie: r.sortieId === null ? null : { montant: r.commissions.sortie.texte, unite: r.commissions.sortie.unite, taux: r.commissions.sortie.taux ?? null, mode: modeDe('sortie') } } } : {}) };
}

export function FormulaireDossier({ societe, vente, references: referencesRecues, onFermer, onFait, ajouter = null, repartitionInitiale, message, personneVisee = null, envoyer, mandatFixe, commissionsMasquees = false, controleCreation }: {
  /**
   * 🔴 MON ESPACE (Arno, 05/11/2026) — les obligations du créateur d'un compromis (ses clients, le collaborateur de l'autre côté, le partage) :
   * tant qu'il en manque, « Enregistrer » est refusé et chaque message s'affiche sous son bloc. Absent (la tuile Suivi CA) : rien ne change.
   */
  controleCreation?: (x: { personnes: PersonneEcran[]; repartition: EtatRepartition; partageDefini: boolean }) => { bloc: 'vendeurs' | 'acquereurs' | 'repartition'; message: string }[];
  /**
   * 🔴 MON ESPACE, LOT 5 — l'envoi du dossier : par défaut, la tuile Suivi CA (`dossier-enregistrer`, inchangé) ; « Mon espace » passe le sien
   * (sa route, qui enregistre par la MÊME fonction). Rend le motif d'un refus (null : accepté) et l'id de l'affaire.
   */
  envoyer?: (corps: { id: number | null; version?: number; dossier: Record<string, unknown> }) => Promise<{ motif: string | null; data: number | null }>;
  /** 🔴 MON ESPACE, LOT 5 — le n° de mandat déjà vérifié par le parcours : affiché, non modifiable à cette étape. */
  mandatFixe?: string;
  /** 🔴 MON ESPACE, LOT 6 — la vue personnelle : les commissions des négociateurs ne se voient ni ne se modifient (le serveur garde celles enregistrées). */
  commissionsMasquees?: boolean;
  /** 🔴 LOT BJ — « Modifier » depuis la fenêtre d'une personne : sa ligne prend le focus. */
  personneVisee?: number | null;
  /** LOT G — une répartition déjà changée (négociateur choisi depuis la carte) à revoir, et le message qui le dit. */
  repartitionInitiale?: EtatRepartition; message?: string;
  societe: Societe; vente: Vente | null; references: References; onFermer: () => void;
  /** LOT AE — enregistré : l'id de la vente et la répartition enregistrée (pour dire chez quelle société la vente est portée). */
  onFait: (enregistre?: { id: number; repartition: EtatRepartition; honorairesTtc: number }) => void;
  /** LOT F — « + Ajouter un vendeur / un acquéreur » depuis la carte : une ligne neuve de ce côté, prête à la saisie (personne connue ou neuve). */
  ajouter?: 'vendeur' | 'acquereur' | null;
}) {
  // 🔴 Arno (05/11/2026, production) — une liste absente de la réponse ne fait JAMAIS tomber la page : liste vide, et un message le dit.
  const { references, manquantes } = referencesSures(referencesRecues);
  const statut: 'compromis' | 'vendue' = vente?.statut === 'vendue' ? 'vendue' : 'compromis';
  const d = vente?.dossier ?? null;
  const [champs, setChamps] = useState({ libelle: vente?.libelle ?? '', commission: vente === null ? '' : String(vente.honorairesTtc).replace('.', ','),
    dateCompromis: vente?.dateCompromis ?? '', dateActePrevue: d?.dateActePrevue ?? '', dateActe: d?.dateActe ?? (vente?.statut === 'vendue' && vente.mois !== null
      ? `${vente.annee}-${String(vente.mois).padStart(2, '0')}-01` : ''), adresseBien: d?.adresseBien ?? '', note: vente?.note ?? '',
    prixVente: vente?.prixVente == null ? '' : String(vente.prixVente).replace('.', ','), numeroMandat: mandatFixe ?? vente?.numeroMandat ?? '' });
  const [personnes, setPersonnes] = useState<PersonneEcran[]>(() => {
    const lues = (d?.personnes ?? []).map(personneEcranDe);
    const base = [...(lues.some((p) => p.role === 'vendeur') ? [] : [personneVide('vendeur')]), ...lues, ...(lues.some((p) => p.role === 'acquereur') ? [] : [personneVide('acquereur')])];
    return ajouter !== null && lues.some((p) => p.role === ajouter) ? [...base, personneVide(ajouter)] : base;
  });
  const [repartition, setRepartition] = useState<EtatRepartition>(() => repartitionInitiale ?? etatRepartitionDe(vente, references.negociateurs, references.uniteCommission === true));
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Une adresse déjà enregistrée n'est pas signalée « non vérifiée » ; une frappe libre l'est (sans rien bloquer), un choix BAN ne l'est pas.
  const [adresseVerifiee, setAdresseVerifiee] = useState(true);
  const commission = nombre(champs.commission) ?? Number.NaN;
  // 🔴 LOT AN (Arno) — le sélecteur général « HT | TTC » décide aussi de l'unité du champ « Commission » : en HT, le texte tapé (montré tel
  // quel) et la commission TTC qu'il donne, au centime (même règle de TVA et des centimes que l'affichage) ; non retouchée, la commission
  // enregistrée reste telle quelle, même après plusieurs bascules.
  const unite = useAffichage();
  const [commissionHt, setCommissionHt] = useState<string | null>(null);
  const commissionAffichee = unite === 'ttc' ? champs.commission : commissionHt ?? texteDansUnite(champs.commission, 'ttc', 'ht');
  const saisirCommission = (t: string): void => {
    if (unite === 'ttc') { setCommissionHt(null); setChamps((c) => ({ ...c, commission: t })); return; }
    setCommissionHt(t); setChamps((c) => ({ ...c, commission: texteDansUnite(t, 'ht', 'ttc') }));
  };

  const taux = tauxDuPrix(commission, nombre(champs.prixVente));
  // LOT E — une répartition qui ne fait pas 100 % désactive « Enregistrer » (avec l'explication) ; la saisie reste.
  // 🔴 D29 — l'apporteur choisi est-il un collaborateur (l'annuaire) ? sinon externe (sans TVA)
  const ficheApporteur = references.apporteurs.find((a) => a.id === repartition.apporteurId);
  const apporteurInterne = ficheApporteur !== undefined ? ficheApporteur.interne === true : repartition.apporteurInterne === true;
  const somme = etatSomme(repartition, commission, apporteurInterne);
  // LOT K — un collaborateur des deux sociétés sans société choisie pour cette vente : « Enregistrer » désactivé, la saisie reste.
  const manqueSociete = motifSocieteVente(repartition, references.negociateurs);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);

  const champ = (k: keyof typeof champs) => (e: { target: { value: string } }) => setChamps((c) => ({ ...c, [k]: e.target.value }));
  // 🔴 LOT AM / AN — hors saisie, un montant se lit mis en forme (« 7 500 ») ; pendant la frappe, tel que tapé ; le texte saisi ne change pas.
  const [enSaisie, setEnSaisie] = useState<'commission' | 'prixVente' | null>(null);
  const forme = (k: 'commission' | 'prixVente', t: string): string => (enSaisie === k ? t : grouperSaisie(t));
  // 🔴 LOT BJ — la ligne qui prend le focus : la personne visée par « Modifier », sinon la ligne neuve ajoutée depuis la carte.
  const focus = (() => {
    const visee = personneVisee === null ? -1 : personnes.findIndex((p) => p.id === personneVisee);
    if (visee >= 0) return visee;
    return ajouter === null ? null : personnes.map((x) => x.role).lastIndexOf(ajouter);
  })();
  const manquesCreation = controleCreation === undefined ? [] : controleCreation({ personnes, repartition, partageDefini: somme.motif === null && somme.parties.length > 0 });
  const [tente, setTente] = useState(false);
  const manquesDe = (bloc: 'vendeurs' | 'acquereurs' | 'repartition') => (tente ? manquesCreation.filter((m) => m.bloc === bloc) : []);
  const messagesManques = (bloc: 'vendeurs' | 'acquereurs' | 'repartition') => manquesDe(bloc).map((m) => (
    <p key={m.message} className="trx-erreur" role="alert" data-manque-creation={bloc}>{m.message}</p>));
  const enregistrer = async (): Promise<void> => {
    setTente(true);
    if (manquesCreation.length > 0) return; // 🔴 Arno (05/11/2026) — les obligations du créateur d'abord : rien ne part
    setEnvoi(true);
    // 🔴 MON ESPACE, LOT 6 — la version lue avec la vente : le serveur refuse (409) si un collègue a enregistré entre-temps.
    const corps = { id: vente?.id ?? null, version: vente?.version, dossier: corpsDossier(societe, statut, avecMandat ? champs : { ...champs, numeroMandat: undefined }, personnes, repartition) };
    const r = envoyer !== undefined ? await envoyer(corps) : await posterTransactionDonnee<number>({ action: 'dossier-enregistrer', ...corps });
    setEnvoi(false);
    if (r.motif === null) onFait({ id: Number(r.data ?? vente?.id ?? 0), repartition, honorairesTtc: nombre(champs.commission) ?? 0 }); else setMotif(r.motif);
  };

  // 🔴 MON ESPACE, LOT 2 (Arno) — le n° de mandat (migration 449) : OBLIGATOIRE à la création d'un compromis, facultatif pour une fiche existante.
  const avecMandat = references.mandat === true;
  const mandatObligatoire = avecMandat && vente === null && statut === 'compromis';
  const titre = vente === null ? `Nouveau compromis — ${LIBELLE_SOCIETE[societe]}` : `${statut === 'compromis' ? 'Compromis' : 'Vente'} — ${vente.libelle}`;
  // 🔴 D30 (Arno, 03/11/2026) — chaque personne dans sa carte numérotée (« Vendeur 1 »), le bloc lui-même titré et encadré
  const blocPersonnes = (role: PersonneEcran['role'], mot: string) => (
    <BlocPersonnes role={role} mot={mot} personnes={personnes} onChange={setPersonnes} annuaire={references.personnes} avecType={references.personneType === true} focus={focus}
      cartes bloc={role === 'vendeur' ? 'vendeurs' : 'acquereurs'} />
  );
  /** 🔴 D30 — un bloc du formulaire : encadré, titré, sa grille (libellé au-dessus du champ ; 4 colonnes → 2 → 1 selon la largeur). */
  const bloc = (cle: string, titreBloc: string, contenu: ReactNode) => (
    <section className="trx-form-bloc" data-bloc-dossier={cle} aria-label={titreBloc}><h4 className="trx-form-bloc-titre">{titreBloc}</h4>{contenu}</section>
  );
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre trx-fenetre-dossier" role="dialog" aria-modal="true" aria-label={titre} data-formulaire-dossier={vente?.id ?? 'nouveau'}>
        {/* 🔴 D30 — l'en-tête reste en haut (hors de la zone qui défile) : le titre, « Montants en HT | TTC » (déplacé ici, demande d'Arno), fermer */}
        <header className="tdb-fenetre-tete trx-dossier-tete"><h3>{titre}</h3>
          {/* 🔴 LOT AN — le sélecteur « HT | TTC » du bloc, synchronisé : il décide des montants affichés ET des champs de montant. */}
          <div className="trx-form-affichage" data-affichage-formulaire><span className="loc-muet">Montants en</span><SelecteurAffichage /></div>
          <button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer}>×</button></header>
        <div className="tdb-fenetre-corps">
          <style>{CSS_CHAMP_ADRESSE}{CSS_FORMULAIRE_DOSSIER}</style>
          {!references.lotD && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-434>Disponible après la mise à jour de la base (migration 434) : rien ne s’enregistre encore.</p>}
          {message !== undefined && <p className="loc-alerte loc-alerte--orange" role="status" data-message-revoir>{message}</p>}
          {manquantes.length > 0 && <p className="loc-alerte loc-alerte--orange" role="status" data-listes-indisponibles>{phraseListesIndisponibles(manquantes)}</p>}
          <form className="trx-form trx-form-dossier" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
            <datalist id="trx-personnes">{references.personnes.map((p) => <option key={p.id} value={decrire(p)} />)}</datalist>
            {bloc('mandat', 'Mandat', <label className="trx-champ-large" data-champ-mandat>N° de mandat{mandatObligatoire ? ' (obligatoire)' : avecMandat ? ' (facultatif pour une fiche existante)' : ''}
              {avecMandat
                ? <><input value={champs.numeroMandat} onChange={champ('numeroMandat')} required={mandatObligatoire} maxLength={LONGUEUR_MAX_MANDAT} autoComplete="off" data-champ="numero-mandat"
                  readOnly={mandatFixe !== undefined} aria-readonly={mandatFixe !== undefined} />
                  {mandatFixe !== undefined && <span className="loc-muet" data-mandat-fixe>Vérifié : libre dans cette structure (non modifiable à cette étape).</span>}</>
                : <span className="loc-muet" data-mandat-indisponible>Disponible après la mise à jour de la base (migration 449).</span>}</label>)}
            {blocPersonnes('vendeur', 'Vendeur(s)')}
            {messagesManques('vendeurs')}
            {blocPersonnes('acquereur', 'Acquéreur(s)')}
            {messagesManques('acquereurs')}
            {bloc('bien', 'Bien', <label className="trx-plein" data-champ-adresse-bien>Adresse du bien
              <ChampAdresseBan id="trx-adresse-bien" valeur={champs.adresseBien} verifiee={adresseVerifiee} exemple="ex. 12 rue de la République, 92800 Puteaux"
                onChange={(x) => { setAdresseVerifiee(false); setChamps((c) => ({ ...c, adresseBien: x })); }}
                onChoisir={(a) => { setAdresseVerifiee(true); setChamps((c) => ({ ...c, adresseBien: [a.voie, [a.codePostal, a.commune].filter((y) => y !== '').join(' ')].filter((y) => y !== '').join(', ') })); }} /></label>)}
            {bloc('dates', 'Dates', <>
            <label>Date du compromis<input type="date" value={champs.dateCompromis} onChange={champ('dateCompromis')} data-champ="date-compromis" /></label>
            <label>Date prévue de l’acte<input type="date" value={champs.dateActePrevue} onChange={champ('dateActePrevue')} data-champ="date-acte-prevue" /></label>
            {statut === 'vendue' && <label>Date de l’acte (le mois du CA)<input type="date" value={champs.dateActe} onChange={champ('dateActe')} required data-champ="date-acte" /></label>}
            </>)}
            {bloc('honoraires', 'Prix et honoraires', <>
            <label className="trx-champ-large">Prix de vente (€)
              <input value={forme('prixVente', champs.prixVente)} onChange={champ('prixVente')} onFocus={() => setEnSaisie('prixVente')} onBlur={() => setEnSaisie(null)} inputMode="decimal" disabled={references.prixVente !== true} data-champ="prix-vente" />
              {references.prixVente !== true && <span className="loc-muet">Disponible après la mise à jour de la base (migration 435).</span>}
              {/* LOT J — le taux de commission, recalculé à chaque frappe du prix ou de la commission. */}
              {references.prixVente === true && <span className="loc-muet" data-taux-direct>{taux === null ? `Taux d’honoraires : ${TAUX_SANS_PRIX}` : `soit ${libelleTaux(taux).replace(' de vente', '')}`}</span>}</label>
            <label className="trx-champ-large">Commission {MOT_UNITE[unite]}
              <input value={forme('commission', commissionAffichee)} onChange={(e) => saisirCommission(e.target.value)} onFocus={() => setEnSaisie('commission')} onBlur={() => setEnSaisie(null)} inputMode="decimal" required data-champ="commission" />
              <span className="loc-muet" data-equivalent-commission>{!Number.isFinite(commission) ? (unite === 'ttc' ? 'HT = TTC ÷ 1,2' : 'TTC = HT × 1,2')
                : unite === 'ttc' ? `soit ${eur(ht(commission))}${ESPACE}HT` : `soit ${eur(commission)}${ESPACE}TTC`}</span></label>
            </>)}
            {bloc('libelle', 'Libellé', <label className="trx-plein">Libellé (facultatif : sinon « vendeurs / acquéreurs »)<input value={champs.libelle} onChange={champ('libelle')} data-champ="libelle" /></label>)}
            {bloc('repartition', 'Négociateurs, structures et apporteur', <BlocRepartition etat={repartition} onChange={setRepartition} negociateurs={references.negociateurs} apporteurs={references.apporteurs} collegues={references.collegues} honorairesTtc={commission}
              commissionsMasquees={commissionsMasquees}
              societeVente={vente?.societe ?? societe}
              // 🔴 LOT BH (Arno) — une affaire déjà créée : le même composant que les Informations communes ; ici le geste change le formulaire,
              // « Enregistrer » l'écrit (journalisé).
              apporteurEnLigne={vente === null ? undefined : <ApporteurAffaire affichage annuaire={references.apporteurs} collegues={references.collegues} modifiable={references.lotD}
                avecUnite={repartition.commissions != null}
                actuel={{ id: repartition.apporteurId, nom: repartition.apporteurId === null ? repartition.apporteurNom ?? null : references.apporteurs.find((a) => a.id === repartition.apporteurId)?.nom ?? null,
                  montant: (() => { const x = nombre(repartition.retroTexte); return x === null || x === 0 ? null : { montant: x, unite: repartition.retroUnite ?? 'ttc' }; })() }}
                onValider={(c) => { setRepartition({ ...repartition, apporteurId: c.id, apporteurNom: c.id === null ? c.nom : null, retroTexte: c.montant.texte, retroUnite: c.montant.unite, retirerApporteur: false }); return null; }}
                onRetirer={() => { setRepartition({ ...repartition, apporteurId: null, apporteurNom: null, retroTexte: '', retirerApporteur: true }); return null; }} />} />)}
            {messagesManques('repartition')}
            {bloc('notes', 'Notes', <label className="trx-plein">Note<textarea value={champs.note} onChange={champ('note')} /></label>)}
            {motif !== null && <p className="trx-erreur trx-plein" role="alert" data-motif-dossier>{motif}</p>}
            {/* 🔴 D30 — le pied reste en bas de la fenêtre pendant le défilement : « Enregistrer », « Annuler » (le même geste que l'ancien « Fermer ») */}
            <div className="trx-plein trx-actions trx-dossier-pied" data-pied-dossier>
              <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || !references.lotD || somme.motif !== null || manqueSociete !== null} data-enregistrer-dossier>Enregistrer</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-annuler-dossier>Annuler</button>
              {somme.motif !== null && <span className="trx-explication" data-enregistrer-bloque>Enregistrer est désactivé : la répartition doit faire exactement 100 %.</span>}
              {somme.motif === null && manqueSociete !== null && <span className="trx-explication" data-enregistrer-bloque-societe>Enregistrer est désactivé : {manqueSociete}</span>}
              {tente && manquesCreation.length > 0 && <span className="trx-explication" role="alert" data-enregistrer-bloque-creation>À compléter avant d’enregistrer : {manquesCreation.length === 1 ? manquesCreation[0].message : `${manquesCreation.length} points (voir sous chaque bloc).`}</span>}
            </div>
          </form>
          {/* 🔴 MON ESPACE, LOT 6 — l'historique avec « Annuler ce geste » est celui de la tuile ; « Mon espace » (`envoyer`) a le sien, en lecture. */}
          {vente !== null && envoyer === undefined && <Journal entite="vente" id={vente.id} onFait={onFait} />}
        </div>
      </div>
    </div>
  );
}

/**
 * 🔴 D30 (Arno, 03/11/2026) — LA MISE EN PAGE DU FORMULAIRE DE LA VENTE (le même dans le Suivi CA et dans Mon espace) : des blocs encadrés et titrés,
 * séparés nettement ; dans chacun, une grille régulière (libellé au-dessus du champ) — 4 colonnes sur ordinateur, 2 au milieu, 1 au téléphone ;
 * l'adresse et le libellé sur toute la largeur ; chaque personne dans sa carte ; le pied (« Enregistrer », « Annuler ») collé au bas de la fenêtre.
 * Jetons de couleur de la charte seulement (Clair et Sombre).
 */
export const CSS_FORMULAIRE_DOSSIER = `
.trx-fenetre-dossier{width:min(1080px,100%)}
.trx-dossier-tete{flex-wrap:wrap}
.trx-dossier-tete h3{flex:1 1 auto;margin:0}
.trx-dossier-tete .trx-form-affichage{flex:0 0 auto;margin:0}
.trx-form-dossier{display:flex;flex-direction:column;gap:16px;container-type:inline-size;container-name:trx-dossier}
.trx-form-dossier > *{min-width:0}
.trx-form-bloc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 14px;align-items:start;margin:0;padding:12px 14px 14px;border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.trx-form-bloc > .trx-form-bloc-titre,.trx-form-bloc > legend{grid-column:1/-1;margin:0;padding:0;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}
.trx-form-dossier .trx-form-bloc > *{grid-column:span 1}
.trx-form-dossier .trx-form-bloc > .trx-champ-large{grid-column:span 2}
.trx-form-dossier .trx-form-bloc > .trx-plein,.trx-form-dossier .trx-form-bloc > .trx-form-bloc-titre,.trx-form-dossier .trx-form-bloc > fieldset{grid-column:1/-1}
/* les blocs des personnes : le fieldset lui-même est le bloc ; sa légende, le titre */
.trx-form-dossier fieldset.trx-form-bloc{display:flex;flex-direction:column;gap:10px;min-inline-size:0}
.trx-form-dossier fieldset.trx-form-bloc > legend{float:left;width:100%;margin-bottom:2px}
.trx-form-dossier fieldset.trx-form-bloc > legend + *{clear:both}
.trx-form-dossier .trx-carte-personne{border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;background:var(--color-svv-field)}
.trx-fiche-tete{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.trx-fiche-titre{font-size:.9rem;font-weight:800;color:var(--color-svv-ink)}
.trx-fiche-tete .trx-unites{flex:0 0 auto}
.trx-fiche-tete-actions{margin-left:auto}
.trx-form-dossier .trx-ajouter-personne{margin:0}
/* le bloc des négociateurs : sa répartition garde sa propre mise en page (le même composant ailleurs), sans second cadre */
.trx-form-dossier [data-bloc-dossier="repartition"] > fieldset{border:0;padding:0;margin:0;min-inline-size:0}
.trx-dossier-pied{position:sticky;bottom:-18px;z-index:2;margin:0 -18px -18px;padding:12px 18px;background:var(--color-svv-surface);border-top:1px solid var(--color-svv-line);align-items:center}
@container trx-dossier (max-width:760px){ .trx-form-bloc{grid-template-columns:repeat(2,minmax(0,1fr))} }
@container trx-dossier (max-width:480px){
  .trx-form-bloc{grid-template-columns:minmax(0,1fr);padding:10px}
  .trx-form-dossier .trx-form-bloc > .trx-champ-large{grid-column:1/-1}
}
`;
