import {
  cleCoordonnee, cleNom, prenomNom, reintegrer, type AncienContact, type ContactForm, type SyndicForm,
} from './syndics';

/**
 * ══ 🔴🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — « RÉINTÉGRER » PLUTÔT QUE RECRÉER ═══════════════════
 *
 * DEMANDE D'ARNO (12/10/2026) : quand on ajoute un contact syndic, ou un habitant / gardien, et qu'un contact du MÊME
 * cabinet porte le même nom (sans casse ni accents, prénom + nom) et « ne travaille plus ici » : AVANT la création,
 * « M. X a travaillé ici jusqu'au JJ/MM/AAAA — Réintégrer cette personne ? ». « Réintégrer » remet la fiche
 * EXISTANTE en poste (date de retour), son historique conservé : période 1 jusqu'au départ, période 2 depuis le retour.
 * Les coordonnées nouvellement saisies sont proposées en mise à jour de la fiche.
 *
 * CE QU'IL Y AVAIT : la même personne se recréait (Augustin JOREL et Mathis BERCIER chez TEST ARNAUD, fusionnés par ce
 * lot), et la réintégration effaçait la date du départ (`parti_le`) : la première période était perdue. Elle est
 * désormais gardée au journal (ajout seul, action `syndic_contact_periode`, aucune migration).
 *
 * MODULE PUR (écran et serveur).
 */

/** L'action du journal qui garde une période terminée : `valeur_avant` = le départ, `valeur_apres` = le retour. */
export const ACTION_PERIODE_CONTACT = 'syndic_contact_periode';

/** L'ancien contact du MÊME cabinet qui porte ce nom, s'il y en a un (et qu'on ne l'a pas déjà écarté). PUR. */
export function ancienDuMemeNom(
  anciens: readonly AncienContact[], b: Pick<ContactForm, 'prenom' | 'nom'>, ecartes: readonly number[] = [],
): AncienContact | null {
  const cle = cleNom(b.prenom, b.nom);
  if (cle === '') return null;
  return anciens.find((a) => !ecartes.includes(a.id) && cleNom(a.prenom, a.nom) === cle) ?? null;
}

/** « 10/10/2026 » (Europe/Paris), ou la valeur brute si elle ne se lit pas. PUR. */
export function dateCivile(iso: string): string {
  const d = new Date(iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** « M. Augustin JOREL a travaillé ici jusqu'au 10/10/2026 — Réintégrer cette personne ? ». PUR. */
export function motProposeReintegration(a: AncienContact): string {
  const qui = [a.civilite ?? '', prenomNom(a.prenom ?? '', a.nom ?? '')].filter((x) => x.trim() !== '').join(' ');
  return `${qui} a travaillé ici jusqu’au ${dateCivile(a.partiLe)} — Réintégrer cette personne ?`;
}

/**
 * « Réintégrer » : la fiche EXISTANTE revient en poste (le même identifiant — jamais une copie), et ce qu'on venait de
 * saisir lui est proposé : les coordonnées nouvelles d'abord, puis les anciennes qui ne font pas doublon ; le titre et
 * la civilité saisis s'ils le sont ; l'immeuble du bien d'où l'on vient. Tout reste modifiable avant le « Valider » de
 * la fiche, qui enregistre. PUR.
 */
export function reintegrerAvecSaisie(f: SyndicForm, ancienId: number, saisie: ContactForm, cleDepart: string | null): SyndicForm {
  const g = reintegrer(f, ancienId);
  if (g === f) return f;
  return {
    ...g,
    contacts: g.contacts.map((c) => {
      if (c.id !== ancienId || c.reintegre !== true) return c;
      const nouvelles = saisie.coordonnees.filter((k) => k.valeur.trim() !== '');
      const vues = new Set(nouvelles.map((k) => cleCoordonnee(k.sorte, k.valeur)));
      const anciennes = c.coordonnees.filter((k) => !vues.has(cleCoordonnee(k.sorte, k.valeur)));
      const immeubles = [...new Set([...saisie.immeubles, ...(cleDepart !== null && cleDepart !== '' ? [cleDepart] : [])])];
      return {
        ...c,
        titreChoix: saisie.titreChoix !== '' ? saisie.titreChoix : c.titreChoix,
        titreLibre: saisie.titreChoix !== '' ? saisie.titreLibre : c.titreLibre,
        civilite: saisie.civilite ?? c.civilite,
        coordonnees: [...nouvelles.map((k) => ({ ...k, id: null })), ...anciennes],
        immeubles,
      };
    }),
  };
}

/* ══ LES PÉRIODES EN POSTE ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Une période en poste : `du` nul = depuis toujours (avant d'être saisi), `au` nul = toujours en poste. */
export interface PeriodeEnPoste { du: string | null; au: string | null }

/**
 * Les périodes d'un contact : les périodes TERMINÉES du journal (départ → retour), puis l'état présent (`parti_le`). PUR.
 * Sans retour : une seule période, terminée au départ (ou ouverte). Avec un retour : période 1 jusqu'au départ, période
 * 2 depuis le retour.
 */
export function periodesEnPoste(retours: ReadonlyArray<{ depart: string; retour: string }>, partiLe: string | null): PeriodeEnPoste[] {
  const tries = [...retours].sort((a, b) => Date.parse(norme(a.depart)) - Date.parse(norme(b.depart)));
  const out: PeriodeEnPoste[] = [];
  let du: string | null = null;
  for (const r of tries) { out.push({ du, au: r.depart }); du = r.retour; }
  out.push({ du, au: partiLe });
  return out;
}

/** Un horodatage de PostgreSQL (« 2026-10-10 23:36:10.19+02 ») lisible par `Date.parse`. */
export function norme(t: string): string {
  return t.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
}

/** Cette date tombe-t-elle dans une période en poste ? `null` = aujourd'hui (seule une période ouverte compte). PUR. */
export function enPosteLe(periodes: readonly PeriodeEnPoste[], date: string | null): boolean {
  if (date === null) return periodes.some((p) => p.au === null);
  const d = Date.parse(norme(date));
  if (Number.isNaN(d)) return false;
  return periodes.some((p) => (p.du === null || d >= Date.parse(norme(p.du))) && (p.au === null || d < Date.parse(norme(p.au))));
}
