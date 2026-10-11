import { categorieDuBien } from './categorieBien';
import type { BienClient, BiensDesClients } from './contexteClients';
import { chercherBiens } from './rechercheBienRepo';

/**
 * ══ 🔴🔴 LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — LES BIENS DE CHAQUE ADRESSE CLIENTE. LECTURE SEULE. ════════
 *
 * 🔴 AUCUN MÉCANISME PARALLÈLE : c'est la recherche de biens de la modale « Rattacher ce mail à… » (`chercherBiens`),
 * appelée avec l'adresse, dont on ne garde que les correspondances PAR L'E-MAIL (`email_proprietaire`,
 * `email_locataire`) — tous les biens du portefeuille où l'adresse est l'e-mail d'un propriétaire, ou d'un locataire
 * actuel ou passé. Un nom qui ressemblerait à l'adresse ne compte pas.
 *   · rôle : propriétaire si l'e-mail est celui du propriétaire ; sinon locataire s'il est EN PLACE aujourd'hui
 *     (parmi les parties du bien à la date du jour), ancien locataire sinon.
 * Bornée à 20 adresses, 50 biens par adresse.
 */
export async function biensDesClients(adresses: readonly string[]): Promise<BiensDesClients> {
  const voulues = [...new Set(adresses.map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@')))].slice(0, 20);
  const out: BiensDesClients = {};
  for (const a of voulues) {
    const r = await chercherBiens(a, { limite: 50 });
    const biens: BienClient[] = [];
    for (const l of r.lignes) {
      const proprio = l.raisons.find((x) => x.sorte === 'email_proprietaire');
      const loc = l.raisons.find((x) => x.sorte === 'email_locataire');
      if (proprio === undefined && loc === undefined) continue;
      const enPlace = l.parties.some((p) => p.role === 'locataire' && p.emails.some((e) => e.valeur.trim().toLowerCase() === a));
      const role: BienClient['role'] = proprio !== undefined ? 'proprietaire' : enPlace ? 'locataire' : 'ancien_locataire';
      biens.push({
        lotId: l.lotId, cle: l.cle, libelle: l.libelle,
        categorie: categorieDuBien({ nature: l.nature, typeBien: l.typeBien }),
        role, nom: ((proprio ?? loc)?.detail ?? '').trim() || null,
      });
    }
    out[a] = biens;
  }
  return out;
}
