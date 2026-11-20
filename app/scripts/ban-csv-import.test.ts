import { describe, expect, it } from 'vitest';
import { lireBanCsv } from './ban-csv-import';

/** 🔴 Arno (20/11/2026, lot 3 ter) — le fichier « adresses » de la BAN officielle : rien de deviné. */
const TETE = 'id;id_fantoir;numero;rep;nom_voie;code_postal;code_insee;nom_commune;code_insee_ancienne_commune;nom_ancienne_commune;x;y;lon;lat;type_position;alias;nom_ld;libelle_acheminement;nom_afnor;source_position;source_nom_voie;certification_commune;cad_parcelles';
describe('le fichier de la BAN officielle', () => {
  it('une adresse lue (identifiant, indice, position Lambert-93, parcelles, certification) ; les lignes illisibles écartées et comptées', () => {
    const l = '75111_4880_00099;75111_4880;99;;Rue Jean-Pierre Timbaud;75011;75111;Paris 11e Arrondissement;;;653100.5;6863100.25;2.37;48.86;entrée;;;PARIS;RUE JEAN PIERRE TIMBAUD;commune;commune;1;75111000AB0001';
    const ter = '75115_9624_00362_t;75115_9624;362;t;Rue de Vaugirard;75015;75115;Paris 15e Arrondissement;;;648000;6859000;2.29;48.83;parcelle;;;PARIS;RUE DE VAUGIRARD;commune;commune;0;';
    const r = lireBanCsv(`${TETE}\n${l}\n${ter}\nmauvaise;ligne\n`);
    expect(r.ecartees).toBe(1);
    expect(r.adresses[0]).toEqual({ id: '75111_4880_00099', voie: '75111_4880', numero: 99, suffixe: null, nomVoie: 'Rue Jean-Pierre Timbaud', insee: '75111',
      commune: 'Paris 11e Arrondissement', x: 653100.5, y: 6863100.25, typePosition: 'entrée', lieuDit: null, certifiee: true, parcelles: '75111000AB0001' });
    // l'identifiant est gardé tel que la BAN l'écrit (« _t »), jamais réécrit
    expect([r.adresses[1].id, r.adresses[1].suffixe, r.adresses[1].certifiee, r.adresses[1].parcelles]).toEqual(['75115_9624_00362_t', 't', false, null]);
    expect(() => lireBanCsv('a;b\n1;2')).toThrow(/fichier « adresses » de la BAN/);
  });
});
