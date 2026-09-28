// Paso de vuelta de «Crear ejercicio» cuando se abrió desde el selector de una rutina o un
// entreno: la pantalla de creación deja aquí el id y vuelve atrás; la de origen lo recoge al
// recuperar el foco (`useFocusEffect`) y lo añade como si se hubiera elegido en el selector.
// Sin esto, crear desde el selector llevaba a la ficha del ejercicio y se perdía la rutina/entreno.
let createdId: string | null = null;

export function handBackCreatedExercise(id: string): void {
  createdId = id;
}

/** Devuelve el id pendiente (una sola vez) o `null`. */
export function takeCreatedExercise(): string | null {
  const id = createdId;
  createdId = null;
  return id;
}
