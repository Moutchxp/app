import { query } from '../db/client';
import { estAdresseInterne } from './adresseInterne';
import { lireContactExterne } from './contactExterneRepo';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { chargerAdressesExternes } from './envoiPartiesRepo';
import { cleAdresse, famillesDesSuggestions, type FamilleAdresse, type FamillesConnues } from './familleAdresse';
import { biensEtCotesDesContacts } from './partieCategorieRepo';
import { ecrireDepuisLeBien } from './suggestionsBienRepo';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';

/**
 * ══ 🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — LA FAMILLE DE CHAQUE ADRESSE DES CHAMPS À / Cc / Cci ═════════
 * LECTURE SEULE, aucune écriture, aucune ligne de journal. On ne réécrit aucune règle : chaque famille est lue par la
 * porte qui la tient déjà.
 *   ① DEPUIS UN BIEN (`lotId`) : les groupes de la fiche (`ecrireDepuisLeBien`, ceux de la liste de suggestions) — la
 *      famille la plus PROCHE du bien ouvert l'emporte ;
 *   ② puis, pour le reste, tout notre système, dans l'ordre des groupes : propriétaire, locataire (en place), ancien
 *      locataire, e-mail rattaché à une partie (carte de contact, `biensEtCotesDesContacts`), contact d'un syndic,
 *      e-mail général d'un syndic, carnet d'un immeuble (`chargerAdressesExternes`), contact externe (gris) ;
 *   ③ rien trouvé ⇒ `null` : adresse INCONNUE de notre système.
 */
export async function famillesDesAdresses(adresses: readonly string[], lotId: number | null): Promise<FamillesConnues> {
  const voulues = [...new Set(adresses.map(cleAdresse).filter((a) => a !== '' && a.includes('@')))].slice(0, 100);
  const out: FamillesConnues = {};
  if (voulues.length === 0) return out;
  const poser = (a: string, f: FamilleAdresse): void => { if (out[a] === undefined) out[a] = f; };
  const reste = (): string[] => voulues.filter((a) => out[a] === undefined);

  // ① Le bien ouvert : la famille la plus proche.
  if (lotId !== null) {
    const bien = await ecrireDepuisLeBien(lotId);
    const duBien = famillesDesSuggestions(bien?.groupes);
    for (const a of voulues) if (duBien[a] !== undefined) poser(a, duBien[a]);
  }

  // ② Les clients de l'annuaire : l'e-mail PROPRE d'un propriétaire ou d'un locataire (en place, sinon ancien).
  if (reste().length > 0) {
    const { rows } = await query<{ adresse: string; sujet: string; nom: string | null; en_place: boolean }>(
      `SELECT lower(btrim(c.valeur)) AS adresse, c.sujet,
              nullif(btrim(concat_ws(' ', coalesce(pr.nom, lo.nom), coalesce(pr.prenom, lo.prenom))), '') AS nom,
              (c.sujet = 'locataire' AND EXISTS (
                 SELECT 1 FROM gestion_annuaire_occupation o
                  WHERE o.locataire_id = c.sujet_id AND o.absent_le IS NULL
                    AND (o.sortie IS NULL OR o.sortie >= ${SQL_AUJOURDHUI_PARIS}))) AS en_place
         FROM gestion_annuaire_contact c
         LEFT JOIN gestion_annuaire_proprietaire pr ON c.sujet = 'proprietaire' AND pr.id = c.sujet_id
         LEFT JOIN gestion_annuaire_locataire lo ON c.sujet = 'locataire' AND lo.id = c.sujet_id
        WHERE c.sorte = 'email' AND c.absent_le IS NULL AND lower(btrim(c.valeur)) = ANY($1::text[])
              ${await conditionCoordonneeVivante('c')}`, [reste()]);
    const rang = (r: { sujet: string; en_place: boolean }): number => (r.sujet === 'proprietaire' ? 0 : r.en_place ? 1 : 2);
    for (const r of [...rows].sort((x, y) => rang(x) - rang(y))) {
      const ton = r.sujet === 'proprietaire' ? 'proprietaire' : r.en_place ? 'locataire' : 'ancien_locataire';
      const role = ton === 'proprietaire' ? 'Propriétaire' : ton === 'locataire' ? 'Locataire' : 'Ancien locataire';
      poser(r.adresse, { ton, propre: true, nom: r.nom, role });
    }
  }

  // ③ Un e-mail RATTACHÉ à une partie (carte de contact d'un bien) : la couleur de son côté, en contour.
  if (reste().length > 0) {
    const cartes = await biensEtCotesDesContacts(reste());
    const ROLE = { proprietaire: 'Contact du propriétaire', locataire: 'Contact du locataire', ancien_locataire: 'Contact d’un ancien locataire' } as const;
    for (const [a, liste] of cartes) {
      // Le côté le plus stable d'abord : propriétaire, puis locataire en place, puis ancien locataire.
      const cote = (['proprietaire', 'locataire', 'ancien_locataire'] as const).find((c) => liste.some((x) => x.cote === c)) ?? 'locataire';
      poser(a, { ton: cote, propre: false, nom: null, role: ROLE[cote] });
    }
  }

  // ④ Les syndics (un contact nommé d'abord, puis l'e-mail général) et les carnets d'immeuble : rose.
  if (reste().length > 0) {
    const ordre = { syndic_contact: 0, syndic: 1, immeuble_contact: 2 } as const;
    const externes = (await chargerAdressesExternes()).filter((x) => reste().includes(x.email))
      .sort((x, y) => ordre[x.sorte] - ordre[y.sorte]);
    for (const x of externes) {
      const role = x.sorte === 'syndic' ? x.libelle.replace(/^e-mail du syndic /, 'Syndic — e-mail général · ')
        : x.sorte === 'syndic_contact' ? x.libelle.replace(/^contact du syndic /, 'Contact du syndic · ')
          : x.libelle.replace(/^contact de l'immeuble /, 'Contact de l’immeuble · ');
      poser(x.email, { ton: x.sorte === 'immeuble_contact' ? 'immeuble' : 'syndic', propre: true, nom: null, role });
    }
  }

  // ⑤ Un contact externe déjà enregistré : connu, sans famille de client ⇒ gris.
  for (const a of reste()) {
    const c = await lireContactExterne(a);
    if (c !== null) poser(a, { ton: 'neutre', propre: true, nom: c.nom ?? null, role: c.type ? `Contact externe · ${c.type}` : 'Contact externe' });
  }

  /* ⑥ Une adresse DE L'AGENCE (nos domaines, nos adresses) n'est pas « inconnue de notre système » : grise, dite telle.
     En DERNIER seulement — un client qui écrit depuis une adresse de nos domaines garde sa couleur, trouvée plus haut.
     (Constaté dans Chrome : administration@sansvisavis.com, en Cc d'un « Répondre à tous », s'affichait « extérieure ».) */
  for (const a of reste()) if (estAdresseInterne(a, [])) poser(a, { ton: 'neutre', propre: true, nom: null, role: 'Adresse de l’agence' });

  for (const a of voulues) if (out[a] === undefined) out[a] = null;
  return out;
}
