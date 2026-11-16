import { query } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import { contactsDeLImmeuble } from './contactsImmeubleRepo';
import { cleImmeuble } from './syndics';
import { biensEnDesaccord, immeubleDuBien, type BienCopropriete, type DigicodesAdresseFiche, type FicheCopropriete, type GestionnaireSyndic } from './copropriete';
import { batimentDe, nomenclatureDe, type BatimentConnu } from './batimentsCopropriete';
import { depuisCoproprieteDisponible, digicodeImmeubleDisponible, lireDigicodesAdresse } from '../location/digicodeImmeubleRepo';

/**
 * ══ 🔴🔴 LA FICHE COPROPRIÉTÉ — LA LECTURE (Arno, 16/11/2026, migration 476). IMPUR (base), LECTURE SEULE. ══════════════════════════════════
 *
 * Une copropriété est désignée par l'immeuble d'un bien (ou l'une de ses adresses) : une adresse SECONDAIRE (335) ramène à sa copropriété. Elle
 * peut ne pas être encore enregistrée (connue par ses biens seulement) : la fiche se lit quand même, et se créera au premier enregistrement.
 * Les biens d'une copropriété : ceux dont l'« Immeuble » est sa clé principale ou l'une de ses adresses en cours — exactement comme la fiche
 * syndic et le bouton du syndic. Le syndic, ses gestionnaires : en lecture seule (ils appartiennent au syndic).
 */

/** La clé de l'immeuble d'un bien : son « Immeuble », sinon son adresse (la règle de l'AG, 377/475). PUR. */
export const cleImmeubleDuBien = (l: { immeuble: string | null; adresse: string | null }): string => cleImmeuble(immeubleDuBien(l));

export function fiche476Disponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_copropriete', 'hors_copropriete');
}

/** La fiche de la copropriété de cet immeuble (libellé ou clé). `null` : rien de connu sous ce nom. */
export async function ficheCopropriete(immeuble: string): Promise<FicheCopropriete | null> {
  const demandee = cleImmeuble(immeuble);
  if (demandee === '') return null;
  const avec476 = await fiche476Disponible();
  const { rows: c } = await query<{ id: string; cle: string; libelle: string; code_postal: string | null; commune: string | null;
    nom: string | null; hors: boolean | null; nomenclature: string | null }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune,
            ${avec476 ? 'c.nom, c.hors_copropriete AS hors, c.nomenclature_batiments AS nomenclature' : 'NULL::text AS nom, NULL::boolean AS hors, NULL::text AS nomenclature'}
       FROM gestion_copropriete c
      WHERE c.cle_immeuble = $1
         OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
      ORDER BY (c.cle_immeuble = $1) DESC, c.id LIMIT 1`, [demandee]);
  const copro = c[0];
  const cle = copro?.cle ?? demandee;
  const { rows: sec } = copro === undefined ? { rows: [] as { cle: string; libelle: string; code_postal: string | null; commune: string | null }[] }
    : await query<{ cle: string; libelle: string; code_postal: string | null; commune: string | null }>(
      `SELECT cle_immeuble AS cle, libelle, code_postal, commune FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL ORDER BY id`, [copro.id]);
  const cles = new Set([cle, ...sec.map((a) => a.cle)]);
  // les biens : leur « Immeuble » est l'une des clés de la copropriété (lecture de tous les biens actifs, filtrés ici, comme la fiche syndic)
  const avec461 = await colonneExisteMemo('gestion_annuaire_lot', 'copropriete');
  const avecBat = await colonneExisteMemo('gestion_annuaire_lot', 'batiment');
  const { rows: lots } = await query<{ id: string; numero: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null; copropriete: boolean | null; batiment: string | null }>(
    `SELECT id::text, wippimmo_id AS numero, immeuble, adresse, code_postal, commune, ${avec461 ? 'copropriete' : 'NULL::boolean AS copropriete'}, ${avecBat ? 'batiment' : 'NULL::text AS batiment'}
       FROM gestion_annuaire_lot WHERE absent_le IS NULL ORDER BY wippimmo_id`);
  const siens = lots.filter((l) => cles.has(cleImmeubleDuBien(l)));
  if (copro === undefined && siens.length === 0) return null;
  const premier = siens.find((l) => cleImmeubleDuBien(l) === cle) ?? siens[0];
  const libelle = copro?.libelle ?? ((premier?.immeuble ?? '').trim() || (premier?.adresse ?? '').trim() || immeuble.trim());
  const codePostal = copro?.code_postal ?? siens.find((l) => (l.code_postal ?? '').trim() !== '')?.code_postal ?? null;
  const commune = copro?.commune ?? siens.find((l) => (l.commune ?? '').trim() !== '')?.commune ?? null;
  const biens: BienCopropriete[] = siens.map((l) => ({ id: Number(l.id), numero: l.numero, adresse: l.adresse, copropriete: l.copropriete }));
  // le syndic EN COURS et ses gestionnaires pour cette copropriété (lecture seule)
  let syndic: FicheCopropriete['syndic'] = null;
  let gestionnaires: GestionnaireSyndic[] = [];
  if (copro !== undefined) {
    const { rows: s } = await query<{ id: string; nom: string; ville: string | null; debut: string }>(
      `SELECT s.id::text, s.nom, s.ville, cs.debut::text FROM gestion_copropriete_syndic cs JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
        WHERE cs.copropriete_id = $1 AND cs.fin IS NULL ORDER BY cs.debut DESC LIMIT 1`, [copro.id]);
    if (s[0] !== undefined) {
      syndic = { id: Number(s[0].id), nom: s[0].nom, ville: s[0].ville, depuis: s[0].debut };
      const { rows: g } = await query<{ id: string; civilite: string | null; prenom: string | null; nom: string | null; titre: string | null;
        coordonnees: { sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }[] | null }>(
        `SELECT ct.id::text, ct.civilite, ct.prenom, ct.nom, ct.titre,
                (SELECT json_agg(json_build_object('sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
                   FROM gestion_syndic_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees
           FROM gestion_syndic_contact ct
          WHERE ct.syndic_id = $1 AND ct.retire_le IS NULL AND ct.parti_le IS NULL
            AND (ct.tous_immeubles IS TRUE OR EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a WHERE a.contact_id = ct.id AND a.copropriete_id = $2 AND a.retire_le IS NULL))
          ORDER BY ct.rang, ct.id`, [syndic.id, copro.id]);
      gestionnaires = g.map((x) => ({ id: Number(x.id), civilite: x.civilite, prenom: x.prenom, nom: x.nom, titre: x.titre, coordonnees: x.coordonnees ?? [] }));
    }
  }
  // 🔴 (lot 3) les digicodes de chaque adresse, et les bâtiments connus de TOUTE la copropriété : le registre (476), ceux des adresses (399, biens
  // et ajoutés), le champ « Bâtiment » de ses biens — relus tels quels, rien n'est repris ni réécrit
  const adressesFiche = [{ libelle, codePostal, commune }, ...sec.map((a) => ({ libelle: a.libelle, codePostal: a.code_postal, commune: a.commune }))];
  const digicodes: DigicodesAdresseFiche[] = [];
  const connus: BatimentConnu[] = [];
  if (await digicodeImmeubleDisponible()) {
    for (const a of adressesFiche) {
      const d = await lireDigicodesAdresse({ voie: a.libelle, codePostal: a.codePostal, commune: a.commune });
      if (d === null) continue;
      digicodes.push({ cle: cleImmeuble(a.libelle), voie: a.libelle, codePostal: a.codePostal, commune: a.commune, commun: { digicode: d.general.source === 'immeuble' ? d.general.digicode : null, code: d.general.source === 'immeuble' ? d.general.code : null },
        batiments: d.batiments.map((b) => ({ cle: b.cle, libelle: b.libelle, digicode: b.digicode, code: b.code })) });
      for (const b of d.batiments) { const x = batimentDe(b.libelle); if (x !== null) connus.push(x); }
    }
  }
  for (const l of siens) { const x = batimentDe(l.batiment); if (x !== null) connus.push(x); }
  if (copro !== undefined && avec476) {
    const { rows: reg } = await query<{ cle: string; libelle: string; sorte: BatimentConnu['sorte'] }>(
      'SELECT batiment_cle AS cle, batiment_libelle AS libelle, sorte FROM gestion_copropriete_batiment WHERE copropriete_id = $1 ORDER BY cree_le, id', [copro.id]);
    connus.push(...reg);
  }
  const batimentsConnus = [...new Map(connus.map((b) => [b.cle, b])).values()];
  const nomenclature = copro?.nomenclature === 'lettres' || copro?.nomenclature === 'chiffres' ? copro.nomenclature : null;
  return {
    digicodes, batimentsConnus, nomenclatureEffective: nomenclatureDe(nomenclature, batimentsConnus), saisieDigicodes: (await depuisCoproprieteDisponible()) && digicodes.length > 0,
    cle, declaree: copro !== undefined, id: copro === undefined ? null : Number(copro.id), libelle, nom: copro?.nom ?? null,
    horsCopropriete: copro?.hors === true, nomenclature: copro?.nomenclature === 'lettres' || copro?.nomenclature === 'chiffres' ? copro.nomenclature : null,
    codePostal, commune,
    adresses: [{ cle, libelle, codePostal, commune, principale: true }, ...sec.map((a) => ({ cle: a.cle, libelle: a.libelle, codePostal: a.code_postal, commune: a.commune, principale: false }))],
    syndic, gestionnaires, contacts: await contactsDeLImmeuble(cle), biens, desaccord: biensEnDesaccord(biens), avec476,
  };
}
