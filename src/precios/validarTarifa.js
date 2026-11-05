'use strict';

/**
 * Valida la tarifa de compra de oro (USD por gramo, por quilate) antes de cotizar.
 *
 * Formato de entrada (goldRate.json):
 *   { "24k": { "carat": "24", "price": "118" }, "18k": { "carat": "18", "price": "91" }, ... }
 *
 * Si devuelve ok=false el bot NO cotiza: pasa la conversación a un asesor y alerta.
 */

const OPCIONES_POR_DEFECTO = {
  // Quilates sin los cuales no se cotiza.
  requeridos: ['24k', '22k', '18k', '14k', '10k'],
  // Rango absoluto aceptable para 24k (USD/g). Ajustar si el mercado se sale.
  rango24k: [40, 400],
  // Máxima variación permitida contra la última tarifa buena (0.10 = 10 %).
  maxSalto: 0.10,
  // Tolerancia de pureza: precio(q) * 24 / q no debe alejarse más de esto del precio 24k.
  tolPureza: 0.15,
};

function quilatesDeClave(clave) {
  const m = /^(\d{1,2})k$/.exec(clave);
  return m ? Number(m[1]) : null;
}

function aNumero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor !== 'string' || !/^\s*\d+(\.\d+)?\s*$/.test(valor)) return NaN;
  return Number(valor);
}

/**
 * @param {unknown} raw         JSON ya parseado.
 * @param {object}  [opciones]
 * @param {Record<string, number>} [opciones.anterior]  Última tarifa que pasó validación.
 * @returns {{ ok: boolean, errores: string[], tarifa: Record<string, number> }}
 */
function validarTarifa(raw, opciones = {}) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const errores = [];
  const tarifa = {};

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errores: ['formato: no es un objeto'], tarifa };
  }

  for (const [clave, entrada] of Object.entries(raw)) {
    const q = quilatesDeClave(clave);
    if (q === null) continue; // claves ajenas se ignoran
    if (q < 1 || q > 24) {
      errores.push(`${clave}: quilate fuera de 1-24`);
      continue;
    }
    if (!entrada || typeof entrada !== 'object') {
      errores.push(`${clave}: entrada inválida`);
      continue;
    }
    if (aNumero(entrada.carat) !== q) {
      errores.push(`${clave}: carat "${entrada.carat}" no coincide con la clave`);
    }
    const precio = aNumero(entrada.price);
    if (!Number.isFinite(precio) || precio <= 0) {
      errores.push(`${clave}: precio "${entrada.price}" no es un número positivo`);
      continue;
    }
    tarifa[clave] = precio;
  }

  for (const clave of o.requeridos) {
    if (!(clave in tarifa)) errores.push(`${clave}: falta`);
  }

  const p24 = tarifa['24k'];
  if (p24 !== undefined) {
    const [min, max] = o.rango24k;
    if (p24 < min || p24 > max) errores.push(`24k: ${p24} fuera de rango ${min}-${max}`);

    for (const [clave, precio] of Object.entries(tarifa)) {
      if (clave === '24k') continue;
      const implicito = (precio * 24) / quilatesDeClave(clave);
      const desvio = implicito / p24 - 1;
      if (Math.abs(desvio) > o.tolPureza) {
        errores.push(
          `${clave}: ${precio} no cuadra con 24k=${p24} (desvío de pureza ${(desvio * 100).toFixed(1)} %)`,
        );
      }
    }
  }

  // Más quilates → precio estrictamente mayor.
  const ordenados = Object.keys(tarifa).sort((a, b) => quilatesDeClave(b) - quilatesDeClave(a));
  for (let i = 1; i < ordenados.length; i++) {
    const mayor = ordenados[i - 1];
    const menor = ordenados[i];
    if (tarifa[menor] >= tarifa[mayor]) {
      errores.push(`orden: ${menor}=${tarifa[menor]} no es menor que ${mayor}=${tarifa[mayor]}`);
    }
  }

  if (o.anterior) {
    for (const [clave, precio] of Object.entries(tarifa)) {
      const previo = o.anterior[clave];
      if (!previo) continue;
      const salto = precio / previo - 1;
      if (Math.abs(salto) > o.maxSalto) {
        errores.push(
          `${clave}: salto ${(salto * 100).toFixed(1)} % (${previo} → ${precio}), máximo ${o.maxSalto * 100} %`,
        );
      }
    }
  }

  return { ok: errores.length === 0, errores, tarifa };
}

module.exports = { validarTarifa, OPCIONES_POR_DEFECTO };
