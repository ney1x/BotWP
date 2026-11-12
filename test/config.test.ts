import { describe, expect, test } from 'vitest';
import { cargarConfig } from '../src/config.js';

describe('config', () => {
  test('variables vacías cuentan como no configuradas', () => {
    const c = cargarConfig({ DIVISAS_CSV_URL: '', DATABASE_URL: '  ', LIMITE_IA_DIA: '' });
    expect(c.DIVISAS_CSV_URL).toBeUndefined();
    expect(c.DATABASE_URL).toBeUndefined();
    expect(c.LIMITE_IA_DIA).toBe(20);
  });

  test('una URL mal escrita sí falla', () => {
    expect(() => cargarConfig({ DIVISAS_CSV_URL: 'no-es-url' })).toThrow(/DIVISAS_CSV_URL/);
  });

  test('listas separadas por coma', () => {
    expect(cargarConfig({ FERIADOS: '2026-12-25, 2027-01-01' }).FERIADOS).toEqual(['2026-12-25', '2027-01-01']);
  });

  test('el modo informativo arranca activo en YCloud y admite un ajuste explícito', () => {
    expect(cargarConfig({ WA_PROVEEDOR: 'ycloud' }).MODO_INFORMATIVO).toBe(true);
    expect(cargarConfig({ WA_PROVEEDOR: 'ycloud', MODO_INFORMATIVO: 'false' }).MODO_INFORMATIVO).toBe(false);
    expect(cargarConfig({}).MODO_INFORMATIVO).toBe(false);
    expect(cargarConfig({ MODO_INFORMATIVO: 'true' }).MODO_INFORMATIVO).toBe(true);
    expect(() => cargarConfig({ MODO_INFORMATIVO: 'si' })).toThrow(/MODO_INFORMATIVO/);
  });
});
