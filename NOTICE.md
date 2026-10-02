# Atribuciones de terceros

Este proyecto se apoya en datos y recursos de terceros. Las condiciones de cada uno:

## Datos de alimentos
- **Open Food Facts** — https://world.openfoodfacts.org · consulta en vivo por código de
  barras (ODbL). Los datos de los productos de ejemplo de `seed.ts` con marca y código de
  barras son reales de OFF.
- **USDA FoodData Central** — https://fdc.nal.usda.gov · búsqueda de texto en vivo (dominio
  público de EE. UU.; requiere clave gratuita de https://api.data.gov en la variable
  `EXPO_PUBLIC_USDA_API_KEY`).

## Catálogo de ejercicios (`apps/mobile/src/data/exerciseCatalog.ts` + `catalogGen.json`)
- **RepDB** (repdb.co) — nombres e instrucciones (ES/EN/DE) e ilustraciones; uso gratuito en
  apps con atribución visible («Exercise data by RepDB»), ya presente en la app (Acerca de y
  ficha de ejercicio).
- **hasaneyldrm/exercises-dataset** (MIT) — https://github.com/hasaneyldrm/exercises-dataset
  · nombres traducidos con Gemini (caché en `tools/catalog-cache/names-es.json`) e ids de
  medio para los GIF.
- **wger** (CC BY-SA) — https://wger.de · nombres y fotos de una parte del catálogo.
- **free-exercise-db** — https://github.com/yuhonas/free-exercise-db · fotos de la semilla
  inicial.
- **ExerciseDB / AscendAPI** (ascendapi.com) + **© Gym visual** (gymvisual.com) — los GIF
  animados (`edb:<id>` → static.exercisedb.dev) se enlazan bajo la licencia gratuita de la
  API de ExerciseDB, que cubre apps no comerciales con atribución. **Si la app llegara a
  cobrar, hay que licenciarlos (ExerciseDB Starter) o dejar de usarlos.**

El código de este repositorio, en cambio, es © José Luis García Valverde y se distribuye
bajo la licencia MIT (ver `LICENSE`); los datos de terceros citados conservan sus licencias.
