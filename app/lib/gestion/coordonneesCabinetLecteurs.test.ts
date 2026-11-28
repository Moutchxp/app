import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 14h00, point 4 ; décision « 1A ») — UNE SEULE BASE, TOUS LES LECTEURS SUR LA LISTE DU CABINET.
 * « Tous les lecteurs de ces coordonnées (fiche syndic Location et Gestion, fiche copropriété, destinataires proposés dans les mails, téléphones par paires,
 * cases « Écrire aux adresses sélectionnées ») lisent la nouvelle liste. » La table dérivée commune (`sqlCoordonneesCabinet`) suit la règle de l'écran :
 * la liste quand le syndic en a, sinon les colonnes d'avant ; et chaque lecteur la lit (un 3e téléphone, un 2e e-mail se retrouvent partout).
 */
const h = vi.hoisted(() => ({ table: true, sql: [] as string[], reponses: [] as ((s: string) => unknown[] | null)[] }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push(s);
    if (s.includes("to_regclass('public.gestion_syndic_coordonnee_cabinet')")) return { rows: [{ ok: h.table }] };
    for (const r of h.reponses) { const x = r(s); if (x !== null) return { rows: x }; }
    return { rows: [] };
  },
}));
vi.mock('./annuaireRepo', () => ({ ficheLot: async () => ({ etat: 'ok', data: { numero: 'L1', proprietaires: [], occupants: [], anciensOccupants: [] } }) }));
vi.mock('./partieCategorieRepo', () => ({ coordonneesDesParties: async () => new Map(), lireCartesDuBien: async () => [], lireCategoriesDuBien: async () => [] }));
vi.mock('./partiesSyndicRepo', () => ({ coproprietesDesBiens: async (cles: string[]) => new Map(cles.map((c) => [c, [{ id: 157 }]])) }));
const charger = async () => { vi.resetModules(); return import('./coordonneesCabinetRepo'); };
beforeEach(() => { h.table = true; h.sql = []; h.reponses = []; });

describe('la table dérivée commune', () => {
  it('sans la 524 : les trois colonnes d’avant seules (« Standard », « Contact »), aucune lecture de la table', async () => {
    h.table = false;
    const s = (await (await charger()).sqlCoordonneesCabinet()).replace(/\s+/g, ' ');
    expect(s).toContain("('telephone', 'Standard', s.telephone, 0), ('telephone', 'Standard', s.telephone_2, 1), ('email', 'Contact', s.email, 2)");
    expect(s).not.toContain('FROM gestion_syndic_coordonnee_cabinet');
  });
  it('avec la 524 : les lignes NON retirées de la liste, et les colonnes d’avant SEULEMENT pour un syndic sans ligne en cours', async () => {
    const s = (await (await charger()).sqlCoordonneesCabinet()).replace(/\s+/g, ' ');
    expect(s).toContain('FROM gestion_syndic_coordonnee_cabinet k WHERE k.retire_le IS NULL');
    expect(s).toContain('UNION ALL');
    expect(s).toContain('AND NOT EXISTS (SELECT 1 FROM gestion_syndic_coordonnee_cabinet k2 WHERE k2.syndic_id = s.id AND k2.retire_le IS NULL)');
  });
});

describe('les lecteurs : la liste entière du cabinet', () => {
  it('les contacts d’un bien (tâches, Location) : chaque téléphone et e-mail du cabinet, libellés (« Standard », « Standard 2 », « E-mail du cabinet », le reste tel quel)', async () => {
    vi.resetModules();
    h.reponses.push((s) => (s.startsWith('SELECT DISTINCT s.id::text, s.nom, s.adresse') ? [{ id: '54', nom: 'CABINET _TEST', adresse: '1 rue _TEST', code_postal: '75001', ville: 'Paris',
      cabinet: [{ sorte: 'telephone', libelle: 'Standard', valeur: '0140000000' }, { sorte: 'email', libelle: 'Contact', valeur: 'syndic@test.invalid' },
        { sorte: 'telephone', libelle: 'Standard', valeur: '0140000001' }, { sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' },
        { sorte: 'email', libelle: 'Email service', valeur: 'service@test.invalid' }] }] : null));
    const { contactsDuBienPourTache } = await import('./contactsTacheRepo');
    const cab = (await contactsDuBienPourTache(476)).find((c) => c.cle === 'cabinet:54');
    expect(cab?.coordonnees.map((k) => `${k.libelle} : ${k.valeur}`)).toEqual([
      'Standard : 0140000000', 'Standard 2 : 0140000001', 'Portable : 0611223344', 'E-mail du cabinet : syndic@test.invalid', 'Email service : service@test.invalid']);
    expect(h.sql.find((s) => s.startsWith('SELECT DISTINCT s.id::text, s.nom, s.adresse'))).toContain('FROM gestion_syndic_coordonnee_cabinet');
  });
  it('les destinataires d’un envoi (« Écrire depuis gestion@ », 20 %) : chaque e-mail du cabinet est reconnu comme « e-mail du syndic »', async () => {
    vi.resetModules();
    h.reponses.push((s) => (s.includes("'e-mail du syndic ' || s.nom") ? [
      { email: 'syndic@test.invalid', sorte: 'syndic', syndic_id: '54', contact_id: null, copro_contact_id: null, libelle: 'e-mail du syndic CABINET _TEST' },
      { email: 'service@test.invalid', sorte: 'syndic', syndic_id: '54', contact_id: null, copro_contact_id: null, libelle: 'e-mail du syndic CABINET _TEST' }] : null));
    const { chargerAdressesExternes } = await import('./envoiPartiesRepo');
    expect((await chargerAdressesExternes()).filter((a) => a.syndicId === 54).map((a) => a.email)).toEqual(['syndic@test.invalid', 'service@test.invalid']);
    const sql = h.sql.find((s) => s.includes("'e-mail du syndic ' || s.nom")) ?? '';
    expect(sql).toContain("c.sorte = 'email'");
    expect(sql).toContain('FROM gestion_syndic_coordonnee_cabinet');
  });
  it('les autres lecteurs passent tous par la table dérivée commune — et plus aucune de leurs requêtes ne lit l’e-mail ou les téléphones d’avant', () => {
    const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    for (const f of ['app/lib/gestion/syndicRepo.ts', 'app/lib/gestion/partiesSyndicRepo.ts', 'app/lib/gestion/envoiPartiesRepo.ts', 'app/lib/gestion/contactsTacheRepo.ts',
      'app/lib/gestion/anciensContactsRepo.ts', 'app/lib/gestion/biensDesClientsRepo.ts', 'app/lib/location/portefeuilleRepo.ts']) {
      const src = lire(f);
      expect(src, f).toContain('sqlCoordonneesCabinet()');
      // les fragments SQL d'avant (CE QU'ILS LISAIENT : la seule colonne email, les deux colonnes de téléphone)
      for (const ancien of ['lower(btrim(s.email))', 's.email, s.telephone, s.telephone_2', 's.telephone, s.telephone_2, s.email', "concat_ws(' ', s.telephone, s.telephone_2)",
        "lower(coalesce(s.email, ''))", 'nullif(s.email', 's.email, s.telephone, s.telephone_2, s.ville']) expect(src, `${f} : ${ancien}`).not.toContain(ancien);
    }
    // les écrans : la fiche Location, la tuile « syndic connu » et les suggestions de destinataires lisent la liste (coordonneesDuCabinet et ses dérivées)
    expect(lire('app/(admin)/admin/(protected)/location/EcransLocation.tsx')).toContain('coordonneesDuCabinet(s)');
    expect(lire('app/(admin)/admin/(protected)/gestion/SyndicConnuLocation.tsx')).toContain('telephonesDuCabinet(f)');
    expect(lire('app/lib/gestion/suggestionsBienRepo.ts')).toContain('emailsDuCabinet(syndic)');
  });
});

describe('🔴 le droit : la page Location donne « Modifier » au droit Gestion ou à l’administrateur', () => {
  it('peutModifier = gestion || administrateur (le serveur garde son propre contrôle : syndicDroitGestion.test.ts)', () => {
    const page = readFileSync(join(process.cwd(), 'app/(admin)/admin/(protected)/location/syndic/[id]/page.tsx'), 'utf8');
    expect(page).toContain('peutModifier={gestion || administrateur}');
  });
});
