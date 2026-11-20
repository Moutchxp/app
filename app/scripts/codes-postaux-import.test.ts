import { describe, expect, it } from 'vitest';
import { decoderFichier, lireCodesPostaux } from './codes-postaux-import';

/** 🔴 Arno (20/11/2026, lot 3 bis) — le fichier de La Poste, aux deux formats ; rien de deviné. */
describe('la Base officielle des codes postaux', () => {
  it('format d’aujourd’hui (virgules) et ancien (points-virgules, « # ») ; couples dédoublonnés ; lignes illisibles écartées et comptées', () => {
    const nouveau = '﻿code_commune_insee,nom_de_la_commune,code_postal,libelle_d_acheminement,ligne_5\n92024,CLICHY,92110,CLICHY,\n92024,CLICHY,92110,CLICHY,\n2A004,AJACCIO,20000,AJACCIO,\nxx,RIEN,1,RIEN,\n';
    expect(lireCodesPostaux(nouveau)).toEqual({ lignes: [{ codePostal: '92110', insee: '92024', nom: 'CLICHY', acheminement: 'CLICHY' }, { codePostal: '20000', insee: '2A004', nom: 'AJACCIO', acheminement: 'AJACCIO' }], ecartees: 1 });
    const ancien = '#Code_commune_INSEE;Nom_de_la_commune;Code_postal;Libellé_d_acheminement;Ligne_5;coordonnees_gps\n1001;L ABERGEMENT CLEMENCIAT;1400;L ABERGEMENT CLEMENCIAT;;46.15,4.92\n';
    expect(lireCodesPostaux(ancien).lignes).toEqual([{ codePostal: '01400', insee: '01001', nom: 'L ABERGEMENT CLEMENCIAT', acheminement: 'L ABERGEMENT CLEMENCIAT' }]);
    expect(() => lireCodesPostaux('a,b,c\n1,2,3')).toThrow(/Base officielle des codes postaux/);
  });
  it('le fichier publié en ISO-8859-1 (constaté le 20/11/2026) : « Libellé_d_acheminement » relu, l’acheminement lu', () => {
    const latin1 = Uint8Array.from(Buffer.from('#Code_commune_INSEE;Nom_de_la_commune;Code_postal;Libellé_d_acheminement;Ligne_5\n92024;CLICHY;92110;CLICHY;\n', 'latin1'));
    expect(lireCodesPostaux(decoderFichier(latin1)).lignes).toEqual([{ codePostal: '92110', insee: '92024', nom: 'CLICHY', acheminement: 'CLICHY' }]);
    expect(decoderFichier(Uint8Array.from(Buffer.from('é', 'utf8')))).toBe('é');
  });
});
