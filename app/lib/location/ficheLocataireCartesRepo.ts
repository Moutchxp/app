import 'server-only';
import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { ajouterOccupantDans, creerPersonne, modifierPersonne, type ChampsPersonne } from '../gestion/annuaireEditionRepo';
import { lireCartesContactDesLocataires, modifierCarte } from '../gestion/partieCategorieRepo';
import { colonnesTrace } from '../gestion/traceJournal';
import { creerContactsDuBien } from './contactsLocationRepo';
import { ecrireRattachementsDans } from './rattachementsRepo';
import { estGarant } from './cartesLocation';
import { empreinte } from './ficheBienEntiere';
import { modifierDossierLocation, preparerDossier } from './dossierLocationRepo';
import type { ChangementDossier } from './dossierLocation';
import {
  changementsFiche, nomCarte, refusFiche, type CarteFicheLue, type ChampsCarte, type ChangementFiche, type LectureFicheLocataire, type SaisieFicheLocataire,
} from './ficheLocataireCartes';

/**
 * ══ 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » DU SUIVI DU MOIS, EN CARTES (IMPUR : base) ═══════════════════════════════════════════
 * LECTURE : les locataires du bail de la ligne (celui de la fiche d'abord ; sans bail, lui seul) et leurs contacts (garants, conjoint…),
 * tels que l'annuaire les tient — la source unique lue par la Gestion, la Location, la messagerie et l'annuaire.
 * ÉCRITURE, par les gestes EXISTANTS (aucune écriture parallèle, aucun doublon) :
 *   · un locataire modifié → `modifierPersonne` (contrôles, copies dénormalisées, journal) ;
 *   · un contact modifié → `modifierCarte` (la carte complète, le crayon de la Gestion), et une ligne de journal par champ ;
 *   · un colocataire ajouté → `creerPersonne`, puis il REJOINT le bail (ses lots, sa date d'entrée) ;
 *   · un contact ajouté → `creerContactsDuBien`, rattaché au locataire de la fiche (« Garantit » pour un garant, sinon « Contact de »).
 * Une version différente à l'enregistrement (modifié par ailleurs) : refus, rien n'est écrasé. Aucun geste Drive.
 */

type Issue<T> = { etat: 'ok'; data: T } | { etat: 'inconnu' } | { etat: 'sans_schema' } | { etat: 'refus'; motif: string } | { etat: 'conflit'; motif: string };

const n = (v: unknown): number => Number(v);
/** Les champs au format des gestes de l'annuaire (une coordonnée a toujours un libellé, vide s'il n'y en a pas). */
const versGeste = (c: ChampsCarte): ChampsPersonne => {
  const { coordonnees, ...reste } = c;
  return { ...reste, ...(coordonnees === undefined ? {} : { coordonnees: coordonnees.map((k) => ({ sorte: k.sorte, valeur: k.valeur, libelle: k.libelle ?? '' })) }) };
};

/** Le bail de la fiche : celui de la ligne s'il compte ce locataire, sinon son bail en cours (ou le plus récent) ; null sans bail. */
async function bailDe(locataireId: number, bailId: number | null): Promise<{ id: number; lotId: number; entree: string | null } | null> {
  const { rows } = await query<{ id: string; lot_id: string; entree: string | null }>(
    `SELECT b.id::text, b.lot_id::text, b.entree::text FROM gestion_bail b
      WHERE EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.bail_id = b.id AND o.locataire_id = $1)
      ORDER BY (b.id = $2) DESC, (b.sortie IS NULL) DESC, b.entree DESC NULLS LAST, b.id DESC LIMIT 1`, [locataireId, bailId ?? 0]).catch(() => ({ rows: [] }));
  const r = rows[0];
  return r === undefined ? null : { id: n(r.id), lotId: n(r.lot_id), entree: r.entree };
}

export async function lireFicheLocataireCartes(locataireId: number, bailIdDemande: number | null): Promise<Issue<LectureFicheLocataire>> {
  const { rows: existe } = await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_locataire WHERE id = $1', [locataireId]);
  if (existe.length === 0) return { etat: 'inconnu' };
  const bail = await bailDe(locataireId, bailIdDemande);
  const ids = bail === null ? [locataireId]
    : [...new Set([locataireId, ...(await query<{ l: string }>('SELECT DISTINCT locataire_id::text AS l FROM gestion_annuaire_occupation WHERE bail_id = $1', [bail.id])).rows.map((r) => n(r.l))])];
  const lus = (await query<Record<string, string | null>>(
    `SELECT id::text, civilite, prenom, nom, qualite, adresse, code_postal, commune, note FROM gestion_annuaire_locataire WHERE id = ANY($1::bigint[])`, [ids])).rows;
  // La saisie d'origine (`valeur_brute`, « 06 99 00 00 01 ») plutôt que la forme normalisée (« +33… »), comme le Dossier de location.
  const coord = (await query<{ sujet_id: string; id: string; sorte: 'telephone' | 'email'; valeur: string; valeur_brute: string | null; libelle: string | null }>(
    `SELECT sujet_id::text, id::text, sorte, valeur, valeur_brute, libelle FROM gestion_annuaire_contact
      WHERE sujet = 'locataire' AND sujet_id = ANY($1::bigint[]) AND archive_le IS NULL AND absent_le IS NULL ORDER BY rang, id`, [ids])).rows;
  const clients: CarteFicheLue[] = ids.flatMap((id) => {
    const r = lus.find((x) => n(x.id) === id);
    return r === undefined ? [] : [{ id, sorte: 'client' as const, civilite: r.civilite, prenom: r.prenom, nom: r.nom ?? '', qualite: r.qualite, adresse: r.adresse,
      codePostal: r.code_postal, commune: r.commune, note: r.note,
      contacts: coord.filter((k) => n(k.sujet_id) === id).map((k) => ({ id: n(k.id), sorte: k.sorte, affichage: k.valeur_brute ?? k.valeur, libelle: k.libelle })) }];
  });
  const contacts: CarteFicheLue[] = (await lireCartesContactDesLocataires(ids)).map((c) => ({
    id: c.id, sorte: 'contact', civilite: c.civilite, prenom: c.prenom, nom: c.nom, qualite: c.qualite, adresse: c.adressePostale, codePostal: c.codePostal,
    commune: c.commune, note: c.note, contacts: c.coordonnees.map((k, i) => ({ id: i + 1, sorte: k.sorte, affichage: k.valeur, libelle: k.libelle ?? null })),
  }));
  const cartes = [...clients, ...contacts];
  const titre = `Fiche locataire — ${clients.map(nomCarte).join(', ')}`;
  return { etat: 'ok', data: { locataireId, bailId: bail?.id ?? null, titre, cartes, version: empreinte({ locataireId, bail: bail?.id ?? null, cartes }) } };
}

/** La saisie reçue, lue prudemment (seuls les champs connus ; une carte inconnue est ignorée). */
export function lireSaisieFiche(brut: unknown, lu: LectureFicheLocataire): SaisieFicheLocataire {
  const b = (brut ?? {}) as Record<string, unknown>;
  const champs = (x: unknown): ChampsCarte => {
    const o = (x ?? {}) as Record<string, unknown>;
    const t = (k: string): string | null | undefined => (o[k] === undefined ? undefined : typeof o[k] === 'string' ? (o[k] as string).slice(0, 2000) : null);
    const coordonnees = Array.isArray(o.coordonnees) ? (o.coordonnees as Record<string, unknown>[]).slice(0, 20).flatMap((k) => (k?.sorte === 'telephone' || k?.sorte === 'email')
      ? [{ sorte: k.sorte as 'telephone' | 'email', valeur: String(k.valeur ?? '').slice(0, 200), libelle: typeof k.libelle === 'string' ? k.libelle.slice(0, 60) : null }] : []) : undefined;
    const sortie: ChampsCarte = {};
    for (const k of ['civilite', 'prenom', 'qualite', 'adresse', 'codePostal', 'commune', 'note'] as const) { const v = t(k); if (v !== undefined) sortie[k] = v; }
    const nom = t('nom'); if (nom !== undefined) sortie.nom = nom ?? '';
    if (coordonnees !== undefined) sortie.coordonnees = coordonnees;
    return sortie;
  };
  const modifiees = (Array.isArray(b.modifiees) ? b.modifiees : []).slice(0, 40).flatMap((x: Record<string, unknown>) => {
    const sorte = x?.sorte === 'contact' ? 'contact' : 'client';
    return lu.cartes.some((c) => c.id === Number(x?.id) && c.sorte === sorte) ? [{ id: Number(x.id), sorte, champs: champs(x.champs) } as const] : [];
  });
  const nouvelles = (Array.isArray(b.nouvelles) ? b.nouvelles : []).slice(0, 12).map((x: Record<string, unknown>) => ({ sorte: x?.sorte === 'contact' ? 'contact' as const : 'client' as const, champs: champs(x?.champs) }));
  return { version: typeof b.version === 'string' ? b.version.slice(0, 80) : '', modifiees, nouvelles };
}

/** La carte complète d'un contact après la modification (le crayon de la Gestion écrit la carte entière). */
function ficheContact(c: CarteFicheLue, m: ChampsCarte) {
  const v = <K extends keyof ChampsCarte>(k: K, d: unknown) => (m[k] !== undefined ? m[k] : d);
  return {
    nom: String(v('nom', c.nom) ?? ''), note: (v('note', c.note) as string | null) ?? null,
    fiche: { civilite: v('civilite', c.civilite) as string | null, prenom: v('prenom', c.prenom) as string | null, qualite: v('qualite', c.qualite) as string | null,
      adressePostale: v('adresse', c.adresse) as string | null, codePostal: v('codePostal', c.codePostal) as string | null, commune: v('commune', c.commune) as string | null,
      note: (v('note', c.note) as string | null) ?? null,
      coordonnees: (m.coordonnees ?? c.contacts.map((k) => ({ sorte: k.sorte, valeur: k.affichage, libelle: k.libelle })))
        .filter((k) => k.valeur.trim() !== '').map((k) => ({ sorte: k.sorte, valeur: k.valeur.trim(), libelle: k.libelle ?? null })) },
  };
}

/** LIRE → REFUSER, sans rien écrire : la version (conflit), les contrôles des cartes, les changements. */
export async function verifierFicheLocataireCartes(locataireId: number, bailIdDemande: number | null, brut: unknown):
  Promise<Issue<{ lu: LectureFicheLocataire; s: SaisieFicheLocataire; changements: ChangementFiche[] }>> {
  const l = await lireFicheLocataireCartes(locataireId, bailIdDemande);
  if (l.etat !== 'ok') return l;
  const lu = l.data;
  const s = lireSaisieFiche(brut, lu);
  // 🔴 Modifié par ailleurs depuis l'ouverture : rien n'est écrasé.
  if (s.version !== lu.version) return { etat: 'conflit', motif: 'Cette fiche a été modifiée depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.' };
  const refus = refusFiche(lu, s);
  if (refus !== null) return { etat: 'refus', motif: refus };
  if (s.nouvelles.some((x) => x.sorte === 'client') && lu.bailId === null) return { etat: 'refus', motif: 'Ce locataire n’a pas de bail rattaché : un colocataire ne peut pas le rejoindre ici.' };
  return { etat: 'ok', data: { lu, s, changements: changementsFiche(lu, s) } };
}

/**
 * ══ 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » : LES CARTES (bloc 1) ET LES CONDITIONS D'ENTRÉE (bloc 3), UN SEUL ENREGISTREMENT ═══════════
 * ① TOUT est vérifié AVANT d'écrire (les deux versions — conflit refusé sans rien écraser —, les contrôles des cartes, les champs
 * obligatoires du bloc 3) ; ② le bloc 3 s'écrit par le chemin du Dossier de location (`modifierDossierLocation`, bloc 3 seul : le bail,
 * le paiement des charges et l'entretien sur la fiche du bien) ; ③ puis les cartes. Le journal porte l'écran de l'appelant (`avecTrace`).
 * Aucun envoi à ADHOC & MONGA, aucune écriture Drive. `dossier` absent : les cartes seules (ligne sans bail rattaché).
 */
export async function enregistrerFicheLocataire(locataireId: number, bailIdDemande: number | null, brut: unknown,
  dossier: { activiteId: number; saisie: Record<string, unknown> } | null, auteur: Auteur):
  Promise<Issue<{ changements: ChangementFiche[]; dossier: ChangementDossier[]; note?: string }>> {
  let bloc3: ChangementDossier[] = [];
  if (dossier !== null) {
    const p = await preparerDossier(dossier.activiteId, dossier.saisie, { seulBloc3: true });
    if (p.etat === 'conflit' || p.etat === 'refus') return p;
    if (p.etat === 'non_rattache') return { etat: 'refus', motif: 'Dossier non rattaché — à rattacher d’abord : les conditions d’entrée ne peuvent pas être enregistrées ici.' };
    if (p.etat === 'inconnu' || p.etat === 'sans_schema') return p;
    if (p.etat === 'pret') bloc3 = p.changements;
  }
  const v = await verifierFicheLocataireCartes(locataireId, bailIdDemande, brut);
  if (v.etat !== 'ok') return v;
  let note: string | undefined;
  if (dossier !== null && bloc3.length > 0) {
    const r = await modifierDossierLocation(dossier.activiteId, dossier.saisie, auteur, { seulBloc3: true });
    if (r.etat === 'non_rattache') return { etat: 'refus', motif: 'Dossier non rattaché — à rattacher d’abord.' };
    if (r.etat !== 'ok') return r;
    bloc3 = r.data.changements;
    note = r.data.note;
  }
  const c = await enregistrerFicheLocataireCartes(locataireId, bailIdDemande, brut, auteur);
  if (c.etat !== 'ok') {
    return c.etat === 'refus' && bloc3.length > 0 ? { etat: 'refus', motif: `${c.motif} Les conditions d’entrée, elles, ont été enregistrées.` } : c;
  }
  return { etat: 'ok', data: { changements: c.data.changements, dossier: bloc3, ...(note === undefined ? {} : { note }) } };
}

export async function enregistrerFicheLocataireCartes(locataireId: number, bailIdDemande: number | null, brut: unknown, auteur: Auteur):
  Promise<Issue<{ changements: ChangementFiche[] }>> {
  const v = await verifierFicheLocataireCartes(locataireId, bailIdDemande, brut);
  if (v.etat !== 'ok') return v;
  const { lu, s, changements } = v.data;
  if (changements.length === 0) return { etat: 'ok', data: { changements } };
  const faits: string[] = [];
  const partiel = (motif: string): Issue<{ changements: ChangementFiche[] }> => ({ etat: 'refus', motif: faits.length === 0 ? motif : `${motif} Ont été enregistrés : ${faits.join(', ')}.` });

  for (const m of s.modifiees) {
    const c = lu.cartes.find((x) => x.id === m.id && x.sorte === m.sorte) as CarteFicheLue;
    if (m.sorte === 'client') {
      const r = await modifierPersonne('locataire', m.id, versGeste(m.champs), auteur);
      if (r.etat !== 'ok') return partiel(r.etat === 'refus' ? r.motif : `La fiche de ${nomCarte(c)} n’a pas pu être modifiée.`);
    } else {
      const f = ficheContact(c, m.champs);
      const r = await modifierCarte({ id: m.id, nom: f.nom, note: f.note, fiche: f.fiche, auteur });
      if (!r.ok) return partiel('motif' in r ? r.motif : `Le contact ${nomCarte(c)} n’a pas pu être modifié.`);
      // Le journal du contact (le crayon de la Gestion n'en écrit pas) : une ligne par champ, au locataire de la fiche.
      for (const ch of changementsFiche(lu, { version: s.version, modifiees: [m], nouvelles: [] })) {
        const t = await colonnesTrace({ sujet: 'locataire', champ: ch.champ }, 7);
        await query(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
                     VALUES ('annuaire', $1, 'location_fiche_contact_modifiee', $2, $3, $4, $5, $6${t.marques})`,
          [locataireId, ch.avant, ch.apres, `${ch.carte} — ${ch.champ} : ${ch.avant} → ${ch.apres}`, auteur.id, auteur.libelle, ...t.valeurs]);
      }
    }
    faits.push(nomCarte(c));
  }

  const bail = lu.bailId === null ? null : await bailDe(locataireId, lu.bailId);
  for (const nv of s.nouvelles) {
    const nom = (nv.champs.nom ?? '').trim();
    if (nv.sorte === 'client' && bail !== null) {
      const cree = await creerPersonne('locataire', { ...versGeste(nv.champs), nom }, auteur);
      if (cree.etat !== 'ok') return partiel(cree.etat === 'refus' ? `Nouveau colocataire : ${cree.motif}` : 'Le nouveau colocataire n’a pas pu être créé.');
      // Il REJOINT le bail : chacun de ses lots, à sa date d'entrée (jamais un bail neuf).
      const ok = await withTransaction(async (q) => {
        const { rows } = await q<{ l: string }>('SELECT DISTINCT lot_id::text AS l FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY 1', [bail.id]);
        for (const r of rows) if ((await ajouterOccupantDans(q, n(r.l), cree.data.id, bail.entree, auteur, bail.id)) === null) return false;
        return true;
      });
      if (!ok) return partiel('Le nouveau colocataire est créé, mais n’a pas pu rejoindre le bail : un des lots n’existe plus.');
      faits.push(`colocataire ${nomCarte({ ...nv.champs, nom })}`);
    } else if (nv.sorte === 'contact') {
      const lot = bail?.lotId ?? n((await query<{ l: string | null }>('SELECT lot_id::text AS l FROM gestion_annuaire_occupation WHERE locataire_id = $1 ORDER BY (sortie IS NULL) DESC, id DESC LIMIT 1', [locataireId])).rows[0]?.l);
      if (!Number.isSafeInteger(lot) || lot <= 0) return partiel('Ce locataire n’occupe aucun bien : le contact ne peut pas être rangé.');
      const cree = await creerContactsDuBien(lot, 'locataire', [{ ...versGeste(nv.champs), nom }], auteur);
      if (!cree.ok) return partiel(`Nouveau contact : ${cree.motif}`);
      // Rattaché au locataire de la fiche : un garant le GARANTIT (sur le bail), un autre contact est « Contact de » lui.
      if (bail !== null) {
        const garant = estGarant(nv.champs.qualite);
        await withTransaction((q) => ecrireRattachementsDans(q, bail.id, [{ carteId: cree.carteIds[0] ?? null, r: { garant, garantit: garant ? [0] : [], locataire: garant ? null : 0 } }], [locataireId], auteur));
      }
      faits.push(`contact ${nomCarte({ ...nv.champs, nom })}`);
    }
  }
  return { etat: 'ok', data: { changements } };
}
