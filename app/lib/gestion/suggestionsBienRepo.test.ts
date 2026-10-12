import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — CE QUE LE SERVEUR PROPOSE POUR UN BIEN ═══════════════════
 * Doublures des lectures existantes (fiche du bien, cartes, catégories, syndic, carnet, mails du bien) : on éprouve
 * l'ordre exigé — clients (propriétaires PUIS locataires ; pour chacun l'e-mail PROPRE puis les RATTACHÉS),
 * immeuble (contacts du syndic de CETTE copropriété, e-mail général, puis gardien et habitants), autres adresses.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
const ficheLot = vi.fn();
vi.mock('./annuaireRepo', () => ({ ficheLot: (...a: unknown[]) => ficheLot(...a) }));
const lireCartesDuBien = vi.fn();
const lireCategoriesDuBien = vi.fn();
vi.mock('./partieCategorieRepo', () => ({
  lireCartesDuBien: (...a: unknown[]) => lireCartesDuBien(...a), lireCategoriesDuBien: (...a: unknown[]) => lireCategoriesDuBien(...a),
}));
const ficheSyndic = vi.fn();
vi.mock('./syndicRepo', () => ({ ficheSyndic: (...a: unknown[]) => ficheSyndic(...a) }));
const contactsDeLImmeuble = vi.fn();
vi.mock('./contactsImmeubleRepo', () => ({ contactsDeLImmeuble: (...a: unknown[]) => contactsDeLImmeuble(...a) }));
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), envoiPartiesDisponibles: async () => true }));

const { ecrireDepuisLeBien } = await import('./suggestionsBienRepo');

const email = (valeur: string, absent = false) => ({ id: 1, sorte: 'email', valeur, affichage: valeur, absent });
const personne = (id: number, nom: string, prenom: string, civilite: string | null, contacts: unknown[], archive = false) => ({
  sujet: 'proprietaire', id, cle: String(id), civilite, prenom, nom, archive, contacts,
});
const LOT = {
  id: 176, numero: '219', driveDossierId: '1bTVd151',  nature: 'Appartement', typeBien: 'Type 2', immeuble: '25 rue Edith Cavell',
  adresse: '25 rue Edith Cavell', commune: 'COURBEVOIE', codePostal: '92400',
  proprietaires: [personne(1, 'DUPONT', 'Jean', 'M', [email('jean@x.fr'), email('vieux@x.fr', true)]),
    personne(2, 'ARCHIVE', 'Paul', null, [email('archive@x.fr')], true)],
  occupants: [personne(7, 'ROI', 'Léa', 'Mme', [email('lea@x.fr')])],
  anciensOccupants: [personne(8, 'HIRSCH', 'Thibaut', 'M', [email('thibaut@x.fr')])],
};

beforeEach(() => {
  query.mockReset();
  ficheLot.mockReset().mockResolvedValue({ etat: 'ok', data: LOT });
  lireCartesDuBien.mockReset().mockResolvedValue([
    { cote: 'locataire', locataireId: null, adresse: 'garant@x.fr', nom: 'ROI', prenom: 'Marc', civilite: 'M.', qualite: 'Garant' },
    { cote: 'proprietaire', locataireId: null, adresse: 'fille@x.fr', nom: 'DUPONT', prenom: 'Anne', civilite: 'Mme', qualite: null },
  ]);
  lireCategoriesDuBien.mockReset().mockResolvedValue([
    { adresse: 'notaire@x.fr', retenue: { categorie: 'proprietaire', origine: 'manuel' } },
    { adresse: 'tiers@x.fr', retenue: { categorie: 'independant', origine: 'manuel' } },
  ]);
  ficheSyndic.mockReset().mockResolvedValue({
    id: 3, nom: 'Cabinet Criterimmo', email: 'contact@criterimmo.fr',
    contacts: [
      { titre: 'Gestionnaire', prenom: 'Mathis', nom: 'Bercier', civilite: 'M.', tousImmeubles: false, immeubles: ['25 rue edith cavell'],
        coordonnees: [{ sorte: 'email', valeur: 'm.bercier@criterimmo.fr' }, { sorte: 'telephone', valeur: '01' }] },
      { titre: 'Comptable', prenom: 'Zoé', nom: 'Ailleurs', civilite: 'Mme', tousImmeubles: false, immeubles: ['autre immeuble'],
        coordonnees: [{ sorte: 'email', valeur: 'z@criterimmo.fr' }] },
    ],
  });
  contactsDeLImmeuble.mockReset().mockResolvedValue([
    { categorie: 'conseil_syndical', libelle: null, civilite: null, prenom: 'Paul', nom: 'Voisin', coordonnees: [{ sorte: 'email', valeur: 'cs@x.fr' }] },
    { categorie: 'gardien', libelle: null, civilite: 'Mme', prenom: 'Rose', nom: 'Petit', coordonnees: [{ sorte: 'email', valeur: 'gardienne@x.fr' }] },
  ]);
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('gestion_copropriete_syndic')) return { rows: [{ cle: '25 rue edith cavell', syndic_id: '3' }] };
    if (sql.includes('gestion_drive_arbre')) return { rows: [{ nom: '25 rue Edith Cavell — lot 219' }] };
    if (sql.includes('gestion_message_adresse')) {
      // Déjà triées par la requête : le dernier échange d'abord.
      return { rows: [
        { adresse: 'tiers@x.fr', brute: null, n: '1', dernier: '2026-10-10' },
        { adresse: 'jean@x.fr', brute: 'Jean <jean@x.fr>', n: '9', dernier: '2026-10-01' },
        { adresse: 'mailer-daemon@googlemail.com', brute: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', n: '3', dernier: '2026-09-30' },
        { adresse: 'noreply@banque.fr', brute: null, n: '2', dernier: '2026-09-20' },
        { adresse: 'client.autre.bien@z.fr', brute: '"Paul Ailleurs" <client.autre.bien@z.fr>', n: '1', dernier: '2026-09-15' },
        { adresse: 'inconnu@y.fr', brute: 'Sara Y <inconnu@y.fr>', n: '4', dernier: '2026-08-01' },
      ] };
    }
    return { rows: [] };
  });
});

const lignes = async () => {
  const r = await ecrireDepuisLeBien(176);
  return r?.groupes.map((g) => [g.cle, g.lignes.map((l) => `${l.adresse}|${l.ton}|${l.propre ? 'pleine' : 'contour'}|${l.role}`)]);
};

describe('ecrireDepuisLeBien — les trois groupes, dans l’ordre d’Arno', () => {
  it('① CLIENTS : propriétaires puis locataires ; pour chaque partie, l’e-mail propre (plein) puis les rattachés (contour)', async () => {
    expect((await lignes())?.[0]).toEqual(['clients', [
      'jean@x.fr|proprietaire|pleine|Propriétaire',
      'fille@x.fr|proprietaire|contour|Contact du propriétaire',
      'notaire@x.fr|proprietaire|contour|Contact du propriétaire',
      'lea@x.fr|locataire|pleine|Locataire',
      'garant@x.fr|locataire|contour|Garant',
      'thibaut@x.fr|ancien_locataire|pleine|Ancien locataire',
    ]]);
  });
  it('⚠️ ni l’e-mail ABSENT d’une fiche, ni un propriétaire ARCHIVÉ', async () => {
    const tout = JSON.stringify(await lignes());
    expect(tout).not.toContain('vieux@x.fr');
    expect(tout).not.toContain('archive@x.fr');
  });
  it('② IMMEUBLE : les contacts du syndic de CETTE copropriété, l’e-mail général, puis le gardien, puis les autres', async () => {
    expect((await lignes())?.[1]).toEqual(['immeuble', [
      /* 🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — les rôles d'Arno, les mêmes que dans le bloc PARTIES. */
      'm.bercier@criterimmo.fr|syndic|pleine|Syndic — Gestionnaire',
      'contact@criterimmo.fr|syndic|pleine|Syndic — Cabinet Criterimmo',
      'gardienne@x.fr|immeuble|pleine|Gardien',
      'cs@x.fr|immeuble|pleine|Conseil syndical',
    ]]);
  });
  it('🔴 ③ AUTRES : TOUTES les adresses de l’historique (même avec une partie ailleurs), le dernier échange d’abord, sans doublon de ①/② ni adresse technique', async () => {
    expect((await lignes())?.[2]).toEqual(['autres', [
      'tiers@x.fr|neutre|pleine|vue dans 1 mail du bien',
      'client.autre.bien@z.fr|neutre|pleine|vue dans 1 mail du bien',
      'inconnu@y.fr|neutre|pleine|vue dans 4 mails du bien',
    ]]);
    const g = (await ecrireDepuisLeBien(176))?.groupes[2].lignes ?? [];
    expect(g.find((l) => l.adresse === 'client.autre.bien@z.fr')?.nom).toBe('Paul Ailleurs');   // le nom des mails
    const appel = query.mock.calls.find((c) => String(c[0]).includes('gestion_message_adresse'));
    const sql = String(appel?.[0]).replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE r.cible_cle = $1');                       // le bien de la FICHE, même si le mail en a plusieurs
    expect(sql).toContain('sorti_le IS NULL');                             // les mails sortis du suivi de ce bien n'y sont pas
    expect(sql).toContain('a.interne = false');                            // ni nos adresses (gestion@)
    expect(sql).toContain("a.role IN ('expediteur', 'destinataire', 'copie')");
    expect(sql).toContain('ORDER BY max(m.recu_le) DESC');
    expect(sql).not.toContain('a.partie IS NULL');                         // CE QU'IL FAISAIT AVANT : sans partie seulement
    expect(appel?.[1]).toEqual(['219']);
  });
  it('la cible « bien » pré-cochée : le lot d’origine, avec son adresse', async () => {
    expect((await ecrireDepuisLeBien(176))?.cible).toEqual({
      sorte: 'lot', cle: '219', id: 176, libelle: '25 rue Edith Cavell, COURBEVOIE — lot 219', categorie: 'logement' });
  });
  it('les civilités voyagent (pour la formule d’appel)', async () => {
    const g = (await ecrireDepuisLeBien(176))?.groupes ?? [];
    const jean = g[0].lignes.find((l) => l.adresse === 'jean@x.fr');
    expect([jean?.civilite, jean?.nomFamille]).toEqual(['M.', 'DUPONT']);
  });
  it('LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — le dossier Drive DÉJÀ associé au bien (lu, jamais écrit) ; aucun ⇒ null', async () => {
    expect((await ecrireDepuisLeBien(176))?.dossierDrive).toEqual({ id: '1bTVd151', nom: '25 rue Edith Cavell — lot 219' });
    ficheLot.mockResolvedValue({ etat: 'ok', data: { ...LOT, driveDossierId: null } });
    expect((await ecrireDepuisLeBien(176))?.dossierDrive).toBeNull();
  });
  it('bien inconnu ⇒ `null`', async () => {
    ficheLot.mockResolvedValue({ etat: 'inconnu' });
    expect(await ecrireDepuisLeBien(9)).toBeNull();
  });
});
