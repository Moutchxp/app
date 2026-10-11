import { FUSEAU_AFFICHAGE } from './ecran';
import { memeConfiguration, type Classement } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — CE QUE « CE MAIL UNIQUEMENT » A CHANGÉ SUR UN MAIL. Module PUR ══════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (11/10/2026) : « quand le suivi d'un mail a été modifié EN ONE SHOT (portée “ce mail uniquement”),
 * on doit le voir sur ce mail » — un cartouche rouge « Suivi modifié en one shot » (« ×N » s'il y en a plusieurs) et,
 * au clic, une modale en lecture seule : suivi de fond, modifié pour ce mail, par qui, quand.
 *
 * ═══ 🔴🔴 LES DEUX TRACES QUI EXISTENT EN BASE, ET ELLES SEULES ══════════════════════════════════════════════════
 *
 *   ① L'EXCEPTION DE SUIVI (`gestion_message_exception`, choix `mail` de `poserClassement`) : c'est la porte de
 *      « Visualiser / Modifier », de « Classer » et de « Modifier le rattachement » (mode ponctuel). L'APRÈS y est
 *      entier (sorte, biens, personnes), avec l'auteur et la date. L'AVANT n'y est PAS écrit : on le RECALCULE —
 *      c'est la projection des fenêtres vivantes du fil sur ce mail, l'exception mise de côté (`projeter(…, [])`).
 *      C'est donc le suivi de fond D'AUJOURD'HUI, celui que le mail reprendrait si l'exception tombait.
 *   ② LA SORTIE DU SUIVI (`gestion_rattachement.statut = 'sorti'`, lot INVARIANT-HISTORIQUE-INALTERABLE) : un couple
 *      (mail, bien), avec `sorti_le` / `sorti_par`. L'avant est le lien lui-même ; l'après, « sorti du suivi ».
 *
 * 🔴 « INTERNE » ET « HORS GESTION » POSÉS PAR LEURS PROPRES ROUTES NE SONT PAS ICI, et ce n'est pas un oubli :
 * `gestion_message_interne` et `gestion_hors_gestion` ne disent pas quelle portée a été choisie — une marque posée
 * « ce mail uniquement » et une marque posée par « toute la conversation » y sont la même ligne. Ce module ne
 * devine pas : il ne montre que ce que la base PROUVE.
 *
 * ═══ 🔴🔴 CE QUI NE COMPTE PAS COMME UNE MODIFICATION ONE SHOT ═══════════════════════════════════════════════════
 *
 *   · UNE EXCEPTION QUI DIT LA MÊME CHOSE QUE LE FOND : rien n'a été modifié pour ce mail — il suivrait le même
 *     classement sans elle. Afficher la pastille dirait le contraire de ce qu'on voit.
 *   · UNE EXCEPTION ÉCRITE PAR LA REPRISE DES PÉRIODES (script du 01/10/2026, `app/scripts/periodes-reprise.ts`) :
 *     ce n'est pas un geste, c'est la traduction de l'état d'avant les périodes (2 132 lignes « aucun bien »). Le
 *     mail n'a pas été modifié « en one shot » : c'est la fenêtre qu'on a déduite autour de lui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les auteurs dont l'exception n'est pas un geste « ce mail uniquement ». Ajouter un script ici, jamais une personne. */
export const AUTEURS_HORS_ONE_SHOT: readonly string[] = ['reprise des périodes'];

export function exceptionEstUnGeste(parLibelle: string | null | undefined): boolean {
  const l = (parLibelle ?? '').trim().toLowerCase();
  return l !== '' && l !== 'automatique' && !AUTEURS_HORS_ONE_SHOT.includes(l);
}

/** Une modification « ce mail uniquement », mise en mots pour la modale. */
export interface ModificationOneShot {
  /** « Suivi de fond : … » — ce qu'aurait donné la règle normale. */
  fond: string;
  /** « Modifié pour ce mail : … » — ce qui a été appliqué. */
  modifie: string;
  /** Qui, déjà mis en nom lisible côté serveur. */
  par: string;
  /** Quand, ISO. `null` = la base ne le dit pas. */
  le: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const MOT_PASTILLE_ONE_SHOT = 'Suivi modifié en one shot';
export const TITRE_MODALE_ONE_SHOT = 'Suivi modifié pour ce mail uniquement';
export const PHRASE_AUTRES_MAILS =
  'Les autres mails de cette conversation et de cet expéditeur suivent toujours le suivi de fond.';
export const MOT_SUIVI_DE_FOND = 'Suivi de fond';
export const MOT_MODIFIE_POUR_CE_MAIL = 'Modifié pour ce mail';
export const AIDE_PASTILLE_ONE_SHOT =
  'Le suivi de ce mail a été modifié pour lui seul (« ce mail uniquement »). Cliquer pour voir le détail.';

/** Le mot de la pastille. `null` = aucune pastille. « ×N » à partir de deux. */
export function motPastilleOneShot(nb: number): string | null {
  if (!Number.isFinite(nb) || nb < 1) return null;
  return nb === 1 ? MOT_PASTILLE_ONE_SHOT : `${MOT_PASTILLE_ONE_SHOT} ×${Math.floor(nb)}`;
}

/** « Par Arnaud Jorel, le 11/10/2026 à 18:12 ». Heure de Paris. */
export function motParLe(par: string, le: string | null): string {
  const qui = par.trim() === '' ? 'un utilisateur non identifié' : par.trim();
  if (le === null) return `Par ${qui}`;
  const d = new Date(le);
  if (Number.isNaN(d.getTime())) return `Par ${qui}`;
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `Par ${qui}, le ${p.day}/${p.month}/${p.year} à ${p.hour}:${p.minute}`;
}

/**
 * Le nom court d'un bien : « 19 Rue Diderot, 92130 Issy-les-Moulineaux (lot 479) ». Le titre complet porte aussi la
 * nature du bien — trop long pour une phrase, et le lot suffit à le distinguer.
 */
export function motBienCourt(libelle: string): string {
  const t = (libelle ?? '').trim();
  if (t === '') return 'un bien sans nom';
  const parts = t.split(' — ').map((s) => s.trim()).filter((s) => s !== '');
  if (parts.length <= 1) return t;
  const dernier = parts[parts.length - 1];
  return /^lot\s/i.test(dernier) ? `${parts[0]} (${dernier})` : parts[0];
}

function motRole(sorte: 'proprietaire' | 'locataire'): string {
  return sorte === 'proprietaire' ? 'PROPRIÉTAIRE' : 'LOCATAIRE';
}

/** Un classement entier, dit en une phrase. `undefined` = aucune fenêtre ne couvre le mail. */
export function motClassementDeFond(c: Classement | undefined): string {
  if (c === undefined) return 'aucun suivi de conversation (mail à classer)';
  if (c.sorte === 'interne') return 'classé Interne';
  if (c.sorte === 'hors_gestion') return 'classé Hors gestion';
  if (c.biens.length === 0) return 'aucun bien (mail à classer)';
  const biens = `rattaché à ${c.biens.map((b) => motBienCourt(b.libelle)).join(', ')}`;
  const parties = (c.personnes ?? []).map((p) => `partie ${motRole(p.sorte)} ${p.libelle.trim()}`.trim());
  return parties.length === 0 ? biens : `${biens}, ${parties.join(', ')}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE CALCUL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * La marque d'ÉCHANGE « Interne » est le repli quand rien ne couvre le mail (règle d'Arno du 04/10/2026, voir
 * `interneDuMail`). Un fond sans fenêtre, ou « aucun bien », sur un échange marqué interne se lit donc « Interne » —
 * sans quoi une exception « Interne » sur un tel échange passerait pour une modification qu'elle n'est pas.
 */
function normaliser(c: Classement | undefined, interneDeLEchange: boolean): Classement | undefined {
  if (!interneDeLEchange) return c;
  if (c === undefined || (c.sorte === 'biens' && c.biens.length === 0)) return { sorte: 'interne', biens: [] };
  return c;
}

/**
 * LES MODIFICATIONS D'UNE EXCEPTION, une ligne par changement. PUR.
 *
 * 🔴 UNE EXCEPTION PEUT FAIRE PLUSIEURS CHOSES À LA FOIS (sortir d'un bien ET rattacher à un autre) : chacune est une
 * modification, et c'est ce que compte le « ×N ». La base n'en garde qu'une vivante par mail
 * (`gestion_message_exception_vivante_idx`) — le « ×N » ne peut donc venir que de là, ou d'une sortie du suivi.
 */
export function modificationsDeLException(o: {
  fond: Classement | undefined;
  exception: Classement;
  interneDeLEchange?: boolean;
  par: string;
  le: string | null;
}): ModificationOneShot[] {
  const echange = o.interneDeLEchange === true;
  const fondLu = normaliser(o.fond, echange);
  const appliqueLu = normaliser(o.exception, echange) as Classement;
  const base: Classement = fondLu ?? { sorte: 'biens', biens: [] };
  if (memeConfiguration(base, appliqueLu)) return [];

  const fond = motClassementDeFond(fondLu);
  const ligne = (modifie: string): ModificationOneShot => ({ fond, modifie, par: o.par, le: o.le });

  if (base.sorte !== appliqueLu.sorte) {
    if (appliqueLu.sorte === 'interne') return [ligne('classé Interne')];
    if (appliqueLu.sorte === 'hors_gestion') return [ligne('classé Hors gestion')];
    return [ligne(appliqueLu.biens.length === 0
      ? 'remis à classer (aucun bien)' : motClassementDeFond(appliqueLu))];
  }

  const lignes: ModificationOneShot[] = [];
  const clesFond = new Set(base.biens.map((b) => b.cle));
  const clesApp = new Set(appliqueLu.biens.map((b) => b.cle));
  for (const b of base.biens) {
    if (!clesApp.has(b.cle)) lignes.push(ligne(`sorti du suivi de ${motBienCourt(b.libelle)}`));
  }
  for (const b of appliqueLu.biens) {
    if (!clesFond.has(b.cle)) {
      lignes.push(ligne(`${base.biens.length > 0 ? 'rattaché aussi à' : 'rattaché à'} ${motBienCourt(b.libelle)}`));
    }
  }
  /* ⚠️ LES PARTIES ENSUITE. Un mail qui ne garde aucun bien perd forcément ses parties (la base refuse une partie
     sans bien vivant) : le dire une seconde fois gonflerait le « ×N » d'une conséquence, pas d'un geste. */
  const cle = (p: { sorte: string; cle: string }): string => `${p.sorte}:${p.cle}`;
  const partiesFond = base.personnes ?? [];
  const partiesApp = appliqueLu.personnes ?? [];
  const pf = new Set(partiesFond.map(cle));
  const pa = new Set(partiesApp.map(cle));
  for (const p of partiesApp) {
    if (!pf.has(cle(p))) lignes.push(ligne(`partie ${motRole(p.sorte)} ajoutée : ${p.libelle.trim()}`));
  }
  if (appliqueLu.biens.length > 0) {
    for (const p of partiesFond) {
      if (!pa.has(cle(p))) lignes.push(ligne(`partie ${motRole(p.sorte)} retirée : ${p.libelle.trim()}`));
    }
  }
  return lignes;
}

/**
 * UNE SORTIE DU SUIVI EST-ELLE UN GESTE SUR CE MAIL ? PUR.
 *
 * 🔴 OUI quand une personne l'a faite sur ce mail : le bouton « Sortir du suivi » (sans motif), « Remplacer par »,
 * une case décochée au classement, « Retirer » dans l'encart. NON quand elle est la CONSÉQUENCE d'autre chose — la
 * projection d'une fenêtre ou d'une exception (déjà comptée, elle), le marquage « Interne », l'annulation d'un
 * ajout : leur motif est fixe, et l'appelant en donne la liste.
 */
export function sortieEstUnGeste(o: {
  par: string | null | undefined; motif: string | null | undefined; motifsAutomatiques: readonly string[];
}): boolean {
  const qui = (o.par ?? '').trim().toLowerCase();
  if (qui === '' || qui === 'automatique') return false;
  const motif = (o.motif ?? '').trim();
  return motif === '' || !o.motifsAutomatiques.includes(motif);
}

/** UNE SORTIE DU SUIVI (statut `sorti` d'un lien mail → bien). PUR. Le motif, s'il y en a un, est dit tel quel. */
export function modificationDeLaSortie(o: {
  bienLibelle: string; motif?: string | null; par: string; le: string | null;
}): ModificationOneShot {
  const bien = motBienCourt(o.bienLibelle);
  const motif = (o.motif ?? '').trim();
  return {
    fond: `rattaché à ${bien}`,
    modifie: motif === '' ? `sorti du suivi de ${bien}` : `sorti du suivi de ${bien} (${motif})`,
    par: o.par, le: o.le,
  };
}
