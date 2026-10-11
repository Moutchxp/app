import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — LES PARTIES D'UN MAIL ENVOYÉ ═══════════════════════════════
 * « rattaché automatiquement à TOUTE partie dont au moins une adresse figure dans À, Cc ou Cci, quel que soit le bien
 * de cette partie […] Une adresse inconnue reste enregistrée avec le mail, sans partie. »
 * Le pur (`partiesDesDestinataires`), puis l'écriture (`appliquerPartiesEnAttente`) sur une base simulée.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
const disponible = vi.fn();
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), envoiPartiesDisponibles: () => disponible() }));
vi.mock('./adressesRepo', () => ({
  chargerAnnuaireAdresses: async () => ANNUAIRE,
}));

const { partiesDesDestinataires, appliquerPartiesEnAttente } = await import('./envoiPartiesRepo');

const ANNUAIRE = {
  adresseGestion: 'gestion@criterimmo.fr', partenaires: [] as string[],
  contacts: [
    { email: 'proprio@x.fr', role: 'proprietaire' as const, sujetId: 1, proprietaireCle: 'P1' },
    // Un locataire d'un AUTRE bien que celui d'où l'on écrit : il est reconnu quand même.
    { email: 'loc.ailleurs@x.fr', role: 'locataire' as const, sujetId: 7 },
  ],
  occupations: [{ locataireId: 7, lotCle: '999', proprietaireCle: 'P9', entree: '2024-01-01', sortie: null }],
};
const EXTERNES = [
  { email: 'contact@syndic.fr', sorte: 'syndic' as const, syndicId: 3, syndicContactId: null, coproprieteContactId: null, libelle: 'e-mail du syndic S' },
  { email: 'gestionnaire@syndic.fr', sorte: 'syndic_contact' as const, syndicId: 3, syndicContactId: 30, coproprieteContactId: null, libelle: 'contact du syndic S' },
  { email: 'gardien@x.fr', sorte: 'immeuble_contact' as const, syndicId: null, syndicContactId: null, coproprieteContactId: 50, libelle: 'contact de l’immeuble I' },
];

describe('partiesDesDestinataires — À, Cc et Cci, chacun avec son rôle', () => {
  const l = partiesDesDestinataires({
    a: ['Jean <proprio@x.fr>', 'inconnu@nulle-part.fr'],
    cc: ['gestionnaire@syndic.fr', 'contact@syndic.fr'],
    cci: ['loc.ailleurs@x.fr', 'gardien@x.fr', 'gestion@criterimmo.fr'],
    date: '2026-10-11T10:00:00Z',
  }, ANNUAIRE, EXTERNES);
  const par = (a: string) => l.find((x) => x.adresse === a);

  it('les rôles : À = destinataire, Cc = copie, Cci = copie_cachee', () => {
    expect(l.map((x) => [x.adresse, x.role])).toEqual([
      ['proprio@x.fr', 'destinataire'], ['inconnu@nulle-part.fr', 'destinataire'],
      ['gestionnaire@syndic.fr', 'copie'], ['contact@syndic.fr', 'copie'],
      ['loc.ailleurs@x.fr', 'copie_cachee'], ['gardien@x.fr', 'copie_cachee'], ['gestion@criterimmo.fr', 'copie_cachee'],
    ]);
    expect(par('proprio@x.fr')?.adresseBrute).toBe('Jean <proprio@x.fr>');
  });
  it('un CLIENT est reconnu, quel que soit son bien (le locataire d’un autre bien, en Cci, avec SON lot)', () => {
    expect(par('proprio@x.fr')?.client).toMatchObject({ partie: 'proprietaire', proprietaireCle: 'P1' });
    expect(par('loc.ailleurs@x.fr')?.client).toMatchObject({ partie: 'locataire', locataireId: 7, lotCle: '999' });
  });
  it('les contacts du SYNDIC, son e-mail GÉNÉRIQUE et le CARNET de l’immeuble sont reconnus', () => {
    expect(par('gestionnaire@syndic.fr')?.externe).toMatchObject({ sorte: 'syndic_contact', syndicId: 3, syndicContactId: 30 });
    expect(par('contact@syndic.fr')?.externe).toMatchObject({ sorte: 'syndic', syndicId: 3 });
    expect(par('gardien@x.fr')?.externe).toMatchObject({ sorte: 'immeuble_contact', coproprieteContactId: 50 });
    expect(par('gardien@x.fr')?.motif).toBe('contact de l’immeuble I');
  });
  it('une adresse INCONNUE reste, sans aucune partie', () => {
    expect(par('inconnu@nulle-part.fr')).toMatchObject({ externe: null, client: { partie: null } });
  });
  it('une de nos adresses n’est jamais une partie', () => {
    expect(par('gestion@criterimmo.fr')).toMatchObject({ interne: true, externe: null, client: { partie: null } });
  });
  it('un contact nommé du syndic l’emporte sur l’e-mail générique quand c’est la même adresse', () => {
    const r = partiesDesDestinataires({ a: ['m@s.fr'], cc: [], cci: [], date: '2026-10-11' }, ANNUAIRE, [
      { ...EXTERNES[0], email: 'm@s.fr' }, { ...EXTERNES[1], email: 'm@s.fr' }]);
    expect(r[0].externe?.sorte).toBe('syndic_contact');
  });
});

describe('appliquerPartiesEnAttente — l’écriture, sur le message capturé', () => {
  beforeEach(() => { query.mockReset(); disponible.mockReset().mockResolvedValue(true); });
  const SQL = () => query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));

  it('sans la migration 338 : rien, pas une requête', async () => {
    disponible.mockResolvedValue(false);
    expect(await appliquerPartiesEnAttente()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('🔴 seuls les envois DEMANDÉS (créés après la migration) sont lus : aucune écriture rétroactive', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await appliquerPartiesEnAttente()).toBe(0);
    expect(SQL()[0]).toContain('WHERE e.parties_demandees AND e.parties_appliquees_le IS NULL');
    expect(SQL()[0]).toContain("e.etat = 'envoye'");
  });

  it('message pas encore capturé : l’envoi attend, rien n’est écrit', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: '5', message_id: null, dest_a: ['a@x.fr'], dest_cc: [], dest_cci: [], parti_le: '2026-10-11' }] });
    expect(await appliquerPartiesEnAttente()).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('message capturé : une ligne par adresse (À, Cc, Cci), puis l’envoi daté', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: '5', message_id: '900', dest_a: ['proprio@x.fr'], dest_cc: ['gestionnaire@syndic.fr'], dest_cci: ['inconnu@y.fr'],
      parti_le: '2026-10-11T10:00:00Z',
    }] });
    // les adresses externes
    query.mockResolvedValueOnce({ rows: [{ email: 'gestionnaire@syndic.fr', sorte: 'syndic_contact', syndic_id: '3', contact_id: '30', copro_contact_id: null, libelle: 'contact du syndic S' }] });
    query.mockResolvedValue({ rows: [] });
    expect(await appliquerPartiesEnAttente()).toBe(1);
    const inserts = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO gestion_message_adresse'));
    expect(inserts.map((c) => (c[1] as unknown[]).slice(0, 6))).toEqual([
      [900, 'proprio@x.fr', 'proprio@x.fr', 'destinataire', false, 'proprietaire'],
      [900, 'gestionnaire@syndic.fr', 'gestionnaire@syndic.fr', 'copie', false, null],
      [900, 'inconnu@y.fr', 'inconnu@y.fr', 'copie_cachee', false, null],
    ]);
    expect((inserts[1][1] as unknown[]).slice(10)).toEqual(['syndic_contact', 3, 30, null]);
    expect((inserts[2][1] as unknown[]).slice(10)).toEqual([null, null, null, null]);
    expect(String(inserts[0][0]).replace(/\s+/g, ' ')).toContain('ON CONFLICT (message_id, adresse, role) DO UPDATE');
    const maj = query.mock.calls.find((c) => String(c[0]).includes('UPDATE gestion_envoi'));
    expect(maj?.[1]).toEqual([5, 900]);
  });

  it('⚠️ une erreur de base ne fait JAMAIS échouer la passe de relève', async () => {
    query.mockRejectedValueOnce(new Error('base tombée'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await appliquerPartiesEnAttente()).toBe(0);
    err.mockRestore();
  });
});
