import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { marquerDossierPartiel, leverDossierPartiel, lireEtatPartiel, lireEtatsPartiel, estDemandeSuspendue, butoirPartielActif } from './dossierPartielRepo';
import { chargerDemandesSuivi } from '../veille/reponsesSuivi';
import { partitionnerParDus } from '../sitadel/demandesListe';

/**
 * PART-F ① — GARDE-FOU EN BASE : le butoir CADA d'un dossier partiel est FIXE (ancré sur la 1re réclamation, partiel_le). Une 2e
 * réclamation ne doit JAMAIS repousser `partiel_le` tant que le marqueur est actif (sinon la mairie repousse l'échéance à l'infini).
 * Seul un ré-armement APRÈS une levée (nouveau cycle) repose une nouvelle ancre. Itest : vraie base.
 */
const demandeIds: number[] = [];
async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`); // FK commune : réutilise un code déjà valide
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee valide');
  return rows[0].code_insee;
}
async function creerDemande(statut = 'brouillon'): Promise<number> {
  // Référence au format imposé par le CHECK (^SVAV-DEM-[0-9]{4}-[0-9]{6}$) ; année 2099 = jeu d'itest, hors données réelles ; supprimée en fin.
  const ref = `SVAV-DEM-2099-${String(900001 + demandeIds.length).slice(0, 6)}`;
  const { rows } = await query<{ id: number }>(
    // RETURNING id::int : `demande.id` est bigint → sans cast le driver renvoie une CHAÎNE. En prod, les lookups se font par NOMBRE
    //   (chargerDemandesSuivi : d.id::int) ; le test DOIT donc manipuler un id NOMBRE pour refléter la vraie sémantique.
    `INSERT INTO demande (reference, code_insee, statut) VALUES ($1, $2, $3) RETURNING id::int AS id`, [ref, await codeInseeExistant(), statut]);
  const id = rows[0].id;
  demandeIds.push(id);
  return id;
}
async function partielLeBrut(id: number): Promise<string | null> {
  const { rows } = await query<{ t: string | null }>(`SELECT partiel_le::text AS t FROM demande WHERE id = $1`, [id]);
  return rows[0]?.t ?? null;
}

afterAll(async () => {
  for (const id of demandeIds) await query(`DELETE FROM demande WHERE id = $1`, [id]);
});

describe('PART-F ① — marquerDossierPartiel : butoir FIXE (partiel_le ne bouge pas sur une 2e réclamation)', () => {
  it('2e réclamation active → partiel_le INCHANGÉ, mais familles rafraîchies', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    expect(t1).not.toBeNull();

    await marquerDossierPartiel(id, ['cerfa', 'masse'], 'declaree'); // 2e réclamation (nouvelle vague / re-clic)
    const t2 = await partielLeBrut(id);
    expect(t2).toBe(t1); // 🔴 l'ancre du butoir n'a PAS bougé

    const etat = await lireEtatPartiel(id);
    expect(etat?.familles.sort()).toEqual(['cerfa', 'masse']); // familles rafraîchies au manquant courant
    expect(etat?.origine).toBe('outil'); // origine de la 1re réclamation CONSERVÉE (pas écrasée par la 2e)
  });

  it('ré-armement APRÈS une levée (nouveau cycle) → nouvelle ancre partiel_le', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    await leverDossierPartiel(id, 'itest');
    expect(await lireEtatPartiel(id)).toBeNull(); // levé → plus actif

    await marquerDossierPartiel(id, ['masse'], 'outil'); // dossier redevenu incomplet → nouveau cycle
    const t2 = await partielLeBrut(id);
    expect(t2).not.toBe(t1); // nouvelle ancre (la levée a clos le cycle précédent)
    expect((await lireEtatPartiel(id))?.familles).toEqual(['masse']);
  });
});

/**
 * 🔴 FIX-2b — LE défaut qui a fait disparaître le permis des deux onglets, IMPOSSIBLE à attraper par un test PUR/mocké : `demande.id`
 * est bigint → le driver pg le renvoie en CHAÎNE. Les Map/Set par id (lireEtatsPartiel / lireDemandesSuspendues / lireButoirsPartiel)
 * étaient alors clés STRING, or tous les consommateurs interrogent par NOMBRE (`chargerDemandesSuivi` fait `suspensions.get(d.id::int)`,
 * `estDemandeSuspendue(number)`) → miss silencieux → suspension null PARTOUT. Ces itests frappent la VRAIE base (vrai driver, vrai
 * cast id::int), donc ils échouent si le cast est retiré — ce qu'un mock renvoyant un id déjà-nombre ne verrait jamais.
 */
describe('FIX-2b — id bigint : les structures par id sont interrogeables par NOMBRE (défaut driver pg, invisible aux tests purs)', () => {
  it('marqueur actif → lireEtatsPartiel/estDemandeSuspendue/butoir matchent un lookup par NOMBRE', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa', 'etage'], 'declaree');

    const etats = await lireEtatsPartiel([id]); // exactement l'appel de chargerDemandesSuivi
    expect(etats.get(id), 'la Map DOIT être interrogeable par le NOMBRE id (sinon suspension null en affichage)').toBeDefined();
    expect(etats.get(id)?.familles.sort()).toEqual(['cerfa', 'etage']);
    expect(etats.get(id)?.origine).toBe('declaree'); // FIX-1 : origine 'declaree' bien portée

    expect(await estDemandeSuspendue(id), 'Set par NOMBRE (garde cascade + levée auto) — false silencieux sans le cast').toBe(true);
    expect(await butoirPartielActif(id, 1, 4), 'butoir CADA par NOMBRE').toBeInstanceOf(Date);
  });

  // Chaîne d'AFFICHAGE réelle, cas de la 154 : demande envoyée + marqueur partiel actif → chargerDemandesSuivi EXPOSE la suspension
  //   (le maillon qui était rompu), et le partitionnement front la classe VIVANTE (plus soldée) même à 0 dossier dû.
  it('chargerDemandesSuivi expose la suspension → le front classe la demande VIVANTE (plus soldée)', async () => {
    const id = await creerDemande('envoyee'); // statut envoyée → incluse dans le suivi
    await marquerDossierPartiel(id, ['etage'], 'declaree');

    const { demandes } = await chargerDemandesSuivi();
    const rich = demandes.find((d) => d.demandeId === id);
    expect(rich, 'la demande doit être dans le suivi').toBeDefined();
    expect(rich?.suspension, 'suspension DOIT être exposée (id::int) — maillon réparé par FIX-2b').not.toBeNull();

    // Reproduit la chaîne front (SuiviDemandes) : item de liste à 0 dossier dû, enrichi de la suspension issue de la donnée riche.
    const item = { id, nbDossiers: 1, dossiersDus: 0 };
    const enrichi = rich?.suspension != null ? { ...item, suspension: true } : item;
    const { vivantes, soldees } = partitionnerParDus([enrichi]);
    expect(vivantes.map((d) => d.id), 'VIVANTE en En cours').toEqual([id]);
    expect(soldees, 'plus classée soldée').toHaveLength(0);
  });
});
