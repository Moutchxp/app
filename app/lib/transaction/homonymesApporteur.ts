/**
 * ══ LE CONTRÔLE DES HOMONYMES D'UN NOUVEL APPORTEUR (Transaction, lot AC) — une seule source : le formulaire `NouvelApporteur` (tuile Suivi CA)
 * et « Mon espace » (lot 9, contrôle côté serveur sur tout l'annuaire) l'appellent. Déplacé ici tel quel (il vivait dans NouvelApporteur.tsx,
 * qui le réexporte). PUR.
 */
export interface ApporteurAnnuaire { id: number; nom: string; libelle?: string; recherche?: string }

export const normApporteur = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.+]+/g, ' ').trim();

/**
 * Les apporteurs de l'annuaire qui portent déjà ce nom (prénom et nom, dans un ordre ou l'autre, ou tous les mots tapés dans sa fiche :
 * nom, prénom, société). Rien de tapé : aucun. PUR.
 */
export function homonymes(prenom: string, nom: string, annuaire: readonly ApporteurAnnuaire[]): ApporteurAnnuaire[] {
  const mots = normApporteur(`${prenom} ${nom}`).split(' ').filter((m) => m !== '');
  if (mots.length === 0) return [];
  return annuaire.filter((a) => {
    const fiche = ` ${normApporteur([a.nom, a.libelle ?? '', a.recherche ?? ''].join(' '))} `;
    return mots.every((m) => fiche.includes(` ${m} `));
  });
}
