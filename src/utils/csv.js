// Helper para convertir objetos a CSV con cabeceras.
import { stringify } from 'csv-stringify';

export function toCSV(rows) {
  return new Promise((resolve, reject) => {
    stringify(rows, { header: true }, (err, output) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}
