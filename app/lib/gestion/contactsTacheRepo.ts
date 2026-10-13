import 'server-only';
import { query } from '../db/client';
import { ficheLot, type ContactAffiche, type PersonneAnnuaire } from './annuaireRepo';
import { coordonneesDesParties, lireCartesDuBien, lireCategoriesDuBien } from './partieCategorieRepo';
import { coproprietesDesBiens } from './partiesSyndicRepo';
import { estFamille, type ContactSource, type CoordonneeContact, type FamilleContact } from './contactsTache';

/**
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS DU BIEN, POUR LA FENÊTRE D'UNE TÂCHE ═════════════════════════════════════
 *
 * Les familles du bloc PARTIES, chacune lue À SA SOURCE, sans aucune règle nouvelle :
 *   · PROPRIÉTAIRES, LOCATAIRES EN PLACE, ANCIENS LOCATAIRES — la fiche du bien (`ficheLot`), avec TOUTES leurs
 *     coordonnées et leurs libellés (« Mobile », « Domicile »…) ;
 *   · leurs CONTACTS (cartes du bloc PARTIES : conjoint, gestionnaire, avocat…) — `lireCartesDuBien`, rangés du
 *     côté de la carte ;
 *   · SYNDIC & IMMEUBLE — la copropriété du bien (`coproprietesDesBiens`, la même lecture que la famille rose) :
 *     le cabinet (nom, standard(s), e-mail, adresse), ses contacts en poste, et le carnet de l'immeuble ;
 *   · TIERS INDÉPENDANTS et NON AFFECTÉS — les adresses des mails du bien, rangées comme le bloc PARTIES les range
 *     (`lireCategoriesDuBien`), avec le nom et le téléphone lus en signature (`coordonneesDesParties`).
 * Une adresse déjà portée par une personne de la fiche, une carte ou le syndic n'est pas répétée.
 *
 * 🔴 LECTURE SEULE. Rien n'est écrit ici ; la COPIE dans la tâche est faite par `tachesRepo.ts`.
 */

const net = (x: string | null | undefined): string => (x ?? '').trim();
const nomDe = (...bouts: (string | null | undefined)[]): string => bouts.map(net).filter((x) => x !== '').join(' ');

/** Une coordonnée de l'annuaire : le type imposé par l'annotation l'emporte sur le libellé importé (règle d'affichage). */
function coordonneeAnnuaire(c: ContactAffiche): CoordonneeContact {
  const type = c.typeAnnotation === 'mobile' ? 'Mobile' : c.typeAnnotation === 'fixe' ? 'Fixe' : null;
  return { sorte: c.sorte, libelle: type ?? (net(c.libelle) || null), valeur: c.valeur, affichage: net(c.affichage) || null };
}

function personne(p: PersonneAnnuaire, famille: FamilleContact): ContactSource {
  return {
    cle: `${p.sujet}:${p.id}`, famille, nom: net(p.nomAffiche) || net(p.nom), qualite: net(p.qualite) || null,
    organisation: null, adresse: null,
    coordonnees: (p.contacts ?? []).map(coordonneeAnnuaire),
  };
}

const adressePostale = (adresse: string | null, cp: string | null, ville: string | null): string | null => {
  const s = [net(adresse), nomDe(cp, ville)].filter((x) => x !== '').join(', ');
  return s === '' ? null : s;
};

/** Les contacts du bien, famille par famille. `[]` quand le bien est inconnu. */
export async function contactsDuBienPourTache(lotId: number): Promise<ContactSource[]> {
  const fiche = await ficheLot(lotId);
  if (fiche.etat !== 'ok') return [];
  const f = fiche.data;
  const out: ContactSource[] = [];

  // ① La fiche : propriétaires, locataires en place, anciens locataires.
  for (const p of f.proprietaires) out.push(personne(p, 'proprietaire'));
  for (const p of f.occupants) out.push(personne(p, 'locataire'));
  for (const p of f.anciensOccupants) out.push(personne(p, 'ancien_locataire'));

  // ② Les cartes de contact du bloc PARTIES, du côté de leur carte.
  const cartes = await lireCartesDuBien(f.numero).catch(() => []);
  for (const c of cartes) {
    const famille: FamilleContact = c.cote === 'proprietaire' ? 'proprietaire'
      : c.cote === 'ancien_locataire' || c.locataireId !== null ? 'ancien_locataire' : 'locataire';
    const brutes = (c as { coordonnees?: readonly { sorte: 'telephone' | 'email'; libelle: string | null; valeur: string }[] }).coordonnees ?? [];
    const coordonnees: CoordonneeContact[] = brutes.map((k) => ({ sorte: k.sorte, libelle: k.libelle, valeur: k.valeur, affichage: null }));
    const vues = new Set(coordonnees.map((k) => net(k.valeur).toLowerCase()));
    if (net(c.adresse) !== '' && !vues.has(net(c.adresse).toLowerCase())) {
      coordonnees.unshift({ sorte: 'email', libelle: null, valeur: net(c.adresse), affichage: null });
    }
    if (net(c.telephone) !== '' && !vues.has(net(c.telephone).toLowerCase())) {
      coordonnees.push({ sorte: 'telephone', libelle: null, valeur: net(c.telephone), affichage: null });
    }
    const x = c as { civilite?: string | null; prenom?: string | null; qualite?: string | null;
      adressePostale?: string | null; codePostal?: string | null; commune?: string | null };
    out.push({
      cle: `carte:${c.id}`, famille, nom: nomDe(x.civilite, x.prenom, c.nom) || net(c.adresse),
      qualite: nomDe('Contact', x.qualite ? `— ${x.qualite}` : null), organisation: null,
      adresse: adressePostale(x.adressePostale ?? null, x.codePostal ?? null, x.commune ?? null), coordonnees,
    });
  }

  // ③ Syndic & immeuble.
  out.push(...await syndicEtImmeuble(f.numero).catch((e: unknown) => {
    console.error('[contactsDuBienPourTache] fiche syndic illisible', e);
    return [];
  }));

  // ④ Les adresses des mails du bien : tiers indépendants et non affectés (et toute autre famille rangée à la main).
  const deja = new Set(out.flatMap((c) => c.coordonnees.filter((k) => k.sorte === 'email').map((k) => net(k.valeur).toLowerCase())));
  const [coordonnees, categories] = await Promise.all([
    coordonneesDesParties(f.numero).catch(() => []),
    lireCategoriesDuBien(f.numero).catch(() => []),
  ]);
  const categorieDe = new Map(categories.map((c) => [net(c.adresse).toLowerCase(), c.retenue?.categorie ?? null]));
  for (const c of coordonnees) {
    const adresse = net(c.adresse).toLowerCase();
    if (adresse === '' || deja.has(adresse)) continue;
    deja.add(adresse);
    const cat = categorieDe.get(adresse) ?? null;
    const famille: FamilleContact = estFamille(cat) ? cat : 'a_repartir';
    const coords: CoordonneeContact[] = [{ sorte: 'email', libelle: null, valeur: adresse, affichage: null }];
    if (net(c.telephone) !== '') coords.push({ sorte: 'telephone', libelle: 'Téléphone (signature)', valeur: net(c.telephone), affichage: null });
    out.push({ cle: `adresse:${adresse}`, famille, nom: net(c.nom) || adresse, qualite: null, organisation: null, adresse: null, coordonnees: coords });
  }
  return out;
}

/** Le cabinet du syndic EN COURS, ses contacts EN POSTE, et le carnet de l'immeuble. Lecture seule. */
async function syndicEtImmeuble(lotCle: string): Promise<ContactSource[]> {
  const copros = [...new Set(((await coproprietesDesBiens([lotCle])).get(lotCle) ?? []).map((c) => c.id))];
  if (copros.length === 0) return [];
  const [{ rows: cabinets }, { rows: contacts }, { rows: immeuble }] = await Promise.all([
    query<{ id: string; nom: string; adresse: string | null; code_postal: string | null; ville: string | null;
      telephone: string | null; telephone_2: string | null; email: string | null }>(
      `SELECT DISTINCT s.id::text, s.nom, s.adresse, s.code_postal, s.ville, s.telephone, s.telephone_2, s.email
         FROM gestion_copropriete_syndic cs JOIN gestion_syndic s ON s.id = cs.syndic_id
        WHERE cs.copropriete_id = ANY($1::bigint[]) AND cs.fin IS NULL AND s.supprime_le IS NULL
        ORDER BY s.nom`, [copros]),
    query<{ id: string; syndic_id: string; titre: string | null; civilite: string | null; prenom: string | null;
      nom: string | null; coordonnees: { sorte: string; libelle: string | null; valeur: string }[] | null }>(
      `SELECT DISTINCT ON (ct.id) ct.id::text, ct.syndic_id::text, ct.titre, ct.civilite, ct.prenom, ct.nom,
              (SELECT json_agg(json_build_object('sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
                 FROM gestion_syndic_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees
         FROM gestion_copropriete_syndic cs
         JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
         JOIN gestion_syndic_contact ct ON ct.syndic_id = s.id AND ct.retire_le IS NULL AND ct.parti_le IS NULL
        WHERE cs.copropriete_id = ANY($1::bigint[]) AND cs.fin IS NULL
          AND (ct.tous_immeubles OR EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a
                WHERE a.contact_id = ct.id AND a.copropriete_id = cs.copropriete_id AND a.retire_le IS NULL))
        ORDER BY ct.id`, [copros]),
    query<{ id: string; categorie: string | null; libelle: string | null; civilite: string | null; prenom: string | null;
      nom: string | null; coordonnees: { sorte: string; libelle: string | null; valeur: string }[] | null }>(
      `SELECT ct.id::text, ct.categorie, ct.libelle, ct.civilite, ct.prenom, ct.nom,
              (SELECT json_agg(json_build_object('sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
                 FROM gestion_copropriete_contact_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees
         FROM gestion_copropriete_contact ct
        WHERE ct.copropriete_id = ANY($1::bigint[]) AND ct.retire_le IS NULL
        ORDER BY ct.rang, ct.id`, [copros]),
  ]);

  const lues = (l: { sorte: string; libelle: string | null; valeur: string }[] | null): CoordonneeContact[] =>
    (l ?? []).filter((k) => (k.sorte === 'telephone' || k.sorte === 'email') && net(k.valeur) !== '')
      .map((k) => ({ sorte: k.sorte as 'telephone' | 'email', libelle: net(k.libelle) || null, valeur: net(k.valeur), affichage: null }));
  const standards = (s: (typeof cabinets)[number]): CoordonneeContact[] => [
    ...(net(s.telephone) !== '' ? [{ sorte: 'telephone' as const, libelle: 'Standard', valeur: net(s.telephone), affichage: null }] : []),
    ...(net(s.telephone_2) !== '' ? [{ sorte: 'telephone' as const, libelle: 'Standard 2', valeur: net(s.telephone_2), affichage: null }] : []),
  ];
  const parId = new Map(cabinets.map((s) => [s.id, s]));

  const out: ContactSource[] = cabinets.map((s) => ({
    cle: `cabinet:${s.id}`, famille: 'syndic_immeuble', nom: net(s.nom), qualite: 'Cabinet du syndic', organisation: null,
    adresse: adressePostale(s.adresse, s.code_postal, s.ville),
    coordonnees: [...standards(s),
      ...(net(s.email) !== '' ? [{ sorte: 'email' as const, libelle: 'E-mail du cabinet', valeur: net(s.email), affichage: null }] : [])],
  }));
  for (const c of contacts) {
    const s = parId.get(c.syndic_id);
    out.push({
      cle: `syndic_contact:${c.id}`, famille: 'syndic_immeuble', nom: nomDe(c.civilite, c.prenom, c.nom) || 'Contact du syndic',
      qualite: net(c.titre) || 'Contact du syndic', organisation: s ? net(s.nom) : null,
      adresse: s ? adressePostale(s.adresse, s.code_postal, s.ville) : null,
      // Les standards du cabinet suivent son contact : on appelle souvent le standard pour le joindre.
      coordonnees: [...lues(c.coordonnees), ...(s ? standards(s).map((k) => ({ ...k, libelle: `${k.libelle} du cabinet` })) : [])],
    });
  }
  for (const c of immeuble) {
    out.push({
      cle: `immeuble:${c.id}`, famille: 'syndic_immeuble', nom: nomDe(c.civilite, c.prenom, c.nom) || net(c.libelle) || 'Immeuble',
      qualite: net(c.libelle) || net(c.categorie) || 'Immeuble', organisation: null, adresse: null, coordonnees: lues(c.coordonnees),
    });
  }
  return out;
}
