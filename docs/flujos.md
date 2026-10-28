# Flujos principales

[← Documentación](README.md) · [README del proyecto](../README.md)

## Sincronización de un blob

`cf_sync_meta_v1` guarda, por clave, la última versión del servidor y una huella del JSON local de cuando coincidían. Con eso, `syncBlobs()` sabe quién ha cambiado.

```mermaid
flowchart TD
  A["useAutoSync: al volver a primer plano,<br/>al ir a segundo plano o ~15 s tras un cambio"] --> B{needsPull<br/>tras el login?}
  B -- sí --> P[Solo bajar. Si falla, reintentar bajar y no subir nunca]
  B -- no --> C[GET /api/blobs?meta=1]
  C --> D{¿Qué ha cambiado<br/>desde la última vez?}
  D -- nada --> Z[Fin]
  D -- solo lo local --> E[PUT /api/blobs/:key?base=versión]
  E --> F{¿Respuesta?}
  F -- 200 --> G[Guardar la nueva versión]
  F -- 409 --> H[Conflicto]
  D -- solo el servidor --> I[GET y rehidratar la tienda]
  D -- los dos --> H
  H --> J{¿Entreno en curso<br/>en este móvil?}
  J -- sí --> K[Se conserva el entreno local]
  J -- no --> L["Gana el servidor.<br/>Lo local va a cf_conflict_backup_clave<br/>+ aviso «Recuperar lo de este móvil»"]
```

## Escanear un alimento

```mermaid
sequenceDiagram
  actor U as Usuario
  participant A as App
  participant O as Open Food Facts
  participant S as Servidor
  participant G as Gemini / Groq

  U->>A: Escanear código de barras
  A->>A: valida el GTIN (dígito de control)
  A->>O: GET producto
  alt encontrado
    O-->>A: nombre, marca, nutrientes por 100 g
  else no está o le faltan datos
    U->>A: foto de la etiqueta
    A->>S: POST /api/ai/vision/product
    S->>G: imagen + esquema JSON
    G-->>S: nutrientes (por ración o por 100 g)
    S-->>A: datos validados
  end
  U->>A: ración y comida
  A->>A: diario local (zustand) → sincronización
```

## Importar actividad de Garmin

```mermaid
sequenceDiagram
  participant W as Reloj Garmin
  participant GC as Garmin Connect
  participant HC as Health Connect
  participant A as App (APK)

  W->>GC: sincroniza la sesión
  GC->>HC: escribe la sesión de ejercicio (permiso «Escribir»)
  A->>HC: lee sesiones nuevas (permisos concedidos)
  HC-->>A: tipo, duración, distancia, FC
  alt carrera o caminata
    A->>A: actividad en runningStore
  else fútbol (SOCCER)
    A->>A: partido en matches
  end
  Note over A: Garmin no comparte el recorrido GPS con Health Connect.<br/>Para el mapa: Strava.
```

## Asistente de IA

```mermaid
sequenceDiagram
  actor U as Usuario
  participant A as App
  participant S as Servidor
  participant G as Gemini
  participant Q as Groq

  U->>A: pregunta en la burbuja
  A->>A: contexto: perfil, hoy, cargas, FC, sesión abierta
  A->>S: POST /api/ai/chat (límite por sesión)
  S->>G: prompt + contexto
  alt Gemini responde
    G-->>S: respuesta + propuesta estructurada
  else error o saturado
    S->>Q: mismo prompt
    Q-->>S: respuesta
  end
  S-->>A: texto + propuesta
  A-->>U: muestra la propuesta con «Aplicar»
  U->>A: Aplicar
  A->>A: escribe en la tienda local
```

## Publicar en el feed

```mermaid
sequenceDiagram
  actor U as Usuario
  participant A as App
  participant S as Servidor
  actor F as Seguidor

  U->>A: Compartir carrera
  A->>A: snapshot (distancia, ritmo, mapa…)
  A->>S: POST /api/media (fotos opcionales)
  A->>S: POST /api/social/posts {texto, snapshot, fotos}
  S->>S: guarda el post (sin leer los blobs)
  F->>S: GET /api/social/feed
  S-->>F: posts de quien sigue (respetando perfiles privados)
  F->>S: PUT /api/social/posts/:id/like
  S->>S: notifications (bandeja, sin push)
```
