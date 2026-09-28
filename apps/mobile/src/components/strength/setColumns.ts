import { useWindowDimensions } from "react-native";

/**
 * Anchos de las columnas de la tabla de series, compartidos por la cabecera (`SetsTable`) y cada
 * fila (`SetRow`) para que siempre coincidan. Con los anchos normales la fila mide ~344 dp y en
 * un móvil de 360 dp (328 útiles) el círculo de «hecha» se salía por la derecha: por debajo de
 * 380 dp de pantalla se usa la versión compacta.
 */
export interface SetColumns {
  serie: number;
  prevMin: number;
  kg: number;
  reps: number;
  effort: number;
  done: number;
  gap: number;
}

const NORMAL: SetColumns = { serie: 44, prevMin: 48, kg: 62, reps: 56, effort: 52, done: 48, gap: 6 };
const COMPACT: SetColumns = { serie: 38, prevMin: 0, kg: 56, reps: 50, effort: 44, done: 44, gap: 4 };

export function useSetColumns(): SetColumns {
  const { width } = useWindowDimensions();
  return width < 380 ? COMPACT : NORMAL;
}
