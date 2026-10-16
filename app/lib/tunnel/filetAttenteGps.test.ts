import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { creerFiletAttenteGps, DELAI_MAX_ATTENTE_GPS_MS } from './filetAttenteGps';

describe('filet de l’attente GPS', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sans réponse GPS, la carte est libérée au bout du délai maximum (et pas avant)', () => {
    const expire = vi.fn();
    const f = creerFiletAttenteGps(expire);
    f.armer();
    vi.advanceTimersByTime(DELAI_MAX_ATTENTE_GPS_MS - 1);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(f.estArme()).toBe(false);
  });

  it('une réponse GPS (succès ou erreur) désarme le filet : rien ne se passe ensuite', () => {
    const expire = vi.fn();
    const f = creerFiletAttenteGps(expire);
    f.armer();
    f.desarmer();
    vi.advanceTimersByTime(DELAI_MAX_ATTENTE_GPS_MS * 3);
    expect(expire).not.toHaveBeenCalled();
  });

  it('réarmer (2e demande GPS, à la photo) repart de zéro et ne déclenche qu’une fois', () => {
    const expire = vi.fn();
    const f = creerFiletAttenteGps(expire);
    f.armer();
    vi.advanceTimersByTime(DELAI_MAX_ATTENTE_GPS_MS - 1000);
    f.armer();
    vi.advanceTimersByTime(DELAI_MAX_ATTENTE_GPS_MS - 1);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('le délai reste borné : plus court que le délai GPS du navigateur (20 s), jamais nul', () => {
    expect(DELAI_MAX_ATTENTE_GPS_MS).toBeGreaterThan(0);
    expect(DELAI_MAX_ATTENTE_GPS_MS).toBeLessThan(20_000);
  });
});

describe('câblage dans le tunnel (page.tsx)', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('la demande GPS arme le filet, et chaque réponse le désarme', () => {
    const fn = page.slice(page.indexOf('function demanderPositionGPS()'), page.indexOf('function capturePhoto()'));
    expect(fn).toContain('filetGps.current.armer()');
    expect(fn.split('filetGps.current.desarmer()').length - 1).toBeGreaterThanOrEqual(2); // succès + erreur
  });
  it('choisir une adresse pendant l’attente fait apparaître la carte sur cette adresse', () => {
    const fn = page.slice(page.indexOf('function onSelectAdresse('), page.indexOf('// Capteurs : PITCH'));
    expect(fn).toContain('setCarteCentrePret(true)');
  });
});
