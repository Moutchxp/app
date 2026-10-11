import { query } from '../db/client';
import { categorieDuBien } from './categorieBien';
import type { BienClient, BiensDesClients } from './contexteClients';
import { adresseComplete } from './ficheBien';
import { biensEtCotesDesContacts } from './partieCategorieRepo';
import { chercherBiens } from './rechercheBienRepo';
import { cleImmeuble } from './syndics';

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
 *
 * ══ 🔴🔴 LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — TOUTES LES FAMILLES ONT LEURS BIENS ═══════════════
 * Une adresse qui n'est l'e-mail propre d'aucun client est cherchée, dans l'ordre des familles des puces
 * (`famillesDesAdresses`) — le premier palier qui trouve des biens l'emporte :
 *   ② un e-mail RATTACHÉ à une partie (carte de contact en cours) : les biens de ces cartes ;
 *   ③ l'IMMEUBLE, réunis :
 *      · un contact du syndic (ni retiré, ni parti) : les biens des copropriétés qu'il suit (affectations en cours)
 *        et que son syndic gère aujourd'hui ;
 *      · l'e-mail général d'un syndic : les biens de TOUTES les copropriétés qu'il gère aujourd'hui ;
 *      · le carnet d'une copropriété (gardien, conseil syndical, habitants) : les biens de cette copropriété.
 *   Les biens d'une copropriété : les lots présents de l'annuaire dont l'immeuble a la clé de la copropriété ou d'une de
 *   ses adresses secondaires en cours (la règle de `suggestionsBienRepo`, dans l'autre sens).
 * Aucune écriture, aucune ligne de journal.
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

  const sansBien = (): string[] => voulues.filter((a) => (out[a] ?? []).length === 0);
  if (sansBien().length === 0) return out;
  const lots = await lotsPresents();

  // ② Les e-mails rattachés à une partie.
  const cartes = await biensEtCotesDesContacts(sansBien());
  for (const [a, liste] of cartes) {
    const biens = [...new Set(liste.map((x) => x.lotCle))]
      .map((k) => lots.parCle.get(k)).filter((l): l is LotPresent => l !== undefined)
      .map((l) => bienDuLot(l, 'rattache', null));
    if (biens.length > 0) out[a] = biens.slice(0, 50);
  }

  // ③ L'immeuble : contacts du syndic, e-mail général, carnet de la copropriété.
  const reste = sansBien();
  if (reste.length === 0) return out;
  const { rows } = await query<{ adresse: string; sorte: 'syndic_contact' | 'syndic' | 'immeuble'; nom: string | null; copro: string }>(
    `SELECT lower(btrim(k.valeur)) AS adresse, 'syndic_contact' AS sorte,
            nullif(btrim(concat_ws(' ', ct.nom, ct.prenom)), '') AS nom, cs.copropriete_id::text AS copro
       FROM gestion_syndic_coordonnee k
       JOIN gestion_syndic_contact ct ON ct.id = k.contact_id AND ct.retire_le IS NULL AND ct.parti_le IS NULL
       JOIN gestion_syndic s ON s.id = ct.syndic_id AND s.supprime_le IS NULL
       JOIN gestion_copropriete_syndic cs ON cs.syndic_id = s.id AND cs.fin IS NULL
      WHERE k.sorte = 'email' AND k.retire_le IS NULL AND lower(btrim(k.valeur)) = ANY($1::text[])
        AND (ct.tous_immeubles OR EXISTS (
              SELECT 1 FROM gestion_syndic_contact_copropriete x
               WHERE x.contact_id = ct.id AND x.copropriete_id = cs.copropriete_id AND x.retire_le IS NULL))
     UNION ALL
     SELECT lower(btrim(s.email)), 'syndic', s.nom, cs.copropriete_id::text
       FROM gestion_syndic s
       JOIN gestion_copropriete_syndic cs ON cs.syndic_id = s.id AND cs.fin IS NULL
      WHERE s.supprime_le IS NULL AND lower(btrim(s.email)) = ANY($1::text[])
     UNION ALL
     SELECT lower(btrim(k.valeur)), 'immeuble', nullif(btrim(concat_ws(' ', ct.nom, ct.prenom)), ''), ct.copropriete_id::text
       FROM gestion_copropriete_contact_coordonnee k
       JOIN gestion_copropriete_contact ct ON ct.id = k.contact_id AND ct.retire_le IS NULL
      WHERE k.sorte = 'email' AND k.retire_le IS NULL AND lower(btrim(k.valeur)) = ANY($1::text[])`, [reste]);
  if (rows.length === 0) return out;
  const copros = [...new Set(rows.map((r) => r.copro))];
  const { rows: cles } = await query<{ copro: string; cle: string }>(
    `SELECT c.id::text AS copro, c.cle_immeuble AS cle FROM gestion_copropriete c WHERE c.id = ANY($1::bigint[])
     UNION ALL
     SELECT a.copropriete_id::text, a.cle_immeuble FROM gestion_copropriete_adresse a
      WHERE a.retire_le IS NULL AND a.copropriete_id = ANY($1::bigint[])`, [copros]);
  const clesParCopro = new Map<string, Set<string>>();
  for (const c of cles) clesParCopro.set(c.copro, new Set([...(clesParCopro.get(c.copro) ?? []), cleImmeuble(c.cle)]));
  // Le contact nommé d'abord, puis l'e-mail général, puis le carnet : le premier lien d'un bien l'emporte.
  const ordre = { syndic_contact: 0, syndic: 1, immeuble: 2 } as const;
  for (const r of [...rows].sort((x, y) => ordre[x.sorte] - ordre[y.sorte])) {
    if (!reste.includes(r.adresse)) continue;
    const k = clesParCopro.get(r.copro) ?? new Set<string>();
    const biens = out[r.adresse] ?? [];
    for (const l of lots.tous) {
      if (!k.has(l.cleImmeuble) || biens.some((b) => b.cle === l.cle)) continue;
      biens.push(bienDuLot(l, r.sorte, r.nom));
    }
    out[r.adresse] = biens.slice(0, 50);
  }
  return out;
}

interface LotPresent {
  lotId: number; cle: string; cleImmeuble: string; libelle: string; categorie: BienClient['categorie'];
}

const bienDuLot = (l: LotPresent, role: BienClient['role'], nom: string | null): BienClient => ({
  lotId: l.lotId, cle: l.cle, libelle: l.libelle, categorie: l.categorie, role, nom: (nom ?? '').trim() || null,
});

/** Les lots présents de l'annuaire (quelques centaines), avec la clé de leur immeuble. LECTURE SEULE. */
async function lotsPresents(): Promise<{ tous: LotPresent[]; parCle: Map<string, LotPresent> }> {
  const { rows } = await query<{
    id: string; cle: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null;
    nature: string | null; type_bien: string | null;
  }>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.immeuble, lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien
       FROM gestion_annuaire_lot lo
      WHERE lo.absent_le IS NULL
      ORDER BY lo.immeuble, lo.wippimmo_id`);
  const tous = rows.map((r): LotPresent => {
    const adresse = adresseComplete({ adresse: r.adresse, codePostal: r.code_postal, commune: r.commune });
    return {
      lotId: Number(r.id), cle: r.cle, cleImmeuble: cleImmeuble(r.immeuble),
      libelle: adresse === '' ? `Lot ${r.cle}` : `${adresse} — lot ${r.cle}`,
      categorie: categorieDuBien({ nature: r.nature, typeBien: r.type_bien }),
    };
  }).filter((l) => l.cle !== null && l.cle !== '');
  return { tous, parCle: new Map(tous.map((l) => [l.cle, l])) };
}
