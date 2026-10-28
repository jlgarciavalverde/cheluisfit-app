# Requisitos

[← Documentación](README.md) · [README del proyecto](../README.md)

## Usuarios

| Rol | Quién | Puede |
|---|---|---|
| Usuario sin cuenta | Cualquiera que instale la app | Todo lo local: nutrición, running, fuerza, objetivos, exportar. |
| Usuario con cuenta | Amigos y familia invitados | Además, sincronizar entre dispositivos, usar la IA, Strava y el modo social. |
| Administrador | Quien instala el servidor (`SETUP_CODE`) | Además, invitar y generar códigos para recuperar contraseñas. |

## Requisitos funcionales

### Nutrición
| ID | Requisito |
|---|---|
| RF-01 | Diario de comidas con kcal, proteína, hidratos, grasa y fibra. |
| RF-02 | Objetivo calculado con TDEE adaptativo: se corrige según la evolución real del peso, siempre con confirmación del usuario. |
| RF-03 | Registro de peso y medidas corporales. |
| RF-04 | Escáner de código de barras con Open Food Facts en vivo, buscador con USDA FoodData Central y platos caseros españoles precargados. |
| RF-05 | Alta de producto por foto con IA y «nevera» con vista 3D: qué hay en casa y dónde está. |
| RF-06 | Hidratación. |

### Running y deporte
| ID | Requisito |
|---|---|
| RF-07 | Registro de carreras y caminatas, plantillas (series, rodajes, tiradas) y plan semanal. |
| RF-08 | Récords personales (mejor ritmo, 5K, 10K y media maratón) y gráficas de progreso. |
| RF-09 | Importación desde Garmin a través de Android Health Connect y desde Strava (OAuth2, con recorrido GPS). |
| RF-10 | Registro de partidos de fútbol (también desde Health Connect). |

### Fuerza
| ID | Requisito |
|---|---|
| RF-11 | Rutinas con progresión de cargas y una biblioteca de ~3.000 ejercicios con foto o GIF. |
| RF-12 | Entreno en curso con temporizador de descanso y notificación al terminar. |
| RF-13 | Récords (1RM estimado), historial y «repetir el último entreno». |

### IA, cuenta y social
| ID | Requisito |
|---|---|
| RF-14 | Asistente con el contexto real del usuario (comidas, carreras, entrenos, perfil) que propone cambios y espera confirmación. |
| RF-15 | Análisis automático al terminar un entreno o abrir una carrera reciente, e informe semanal. |
| RF-16 | Cuenta opcional con invitación, sincronización automática entre dispositivos y recuperación de lo local tras un conflicto. |
| RF-17 | Recuperación de contraseña con un código que genera el administrador (24 h). |
| RF-18 | Perfil público o privado (nombre, foto, portada, bio, deportes, ciudad y estadísticas con interruptor). |
| RF-19 | Seguir y aceptar seguidores, feed con posts vinculados a una carrera o entreno, likes, comentarios y bandeja de avisos. |
| RF-20 | Exportar todos los datos en JSON. |
| RF-21 | La app avisa cuando hay una versión nueva del APK y la descarga del propio servidor. |

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Disponibilidad | Todo funciona sin red y sin cuenta. El servidor es opcional. |
| RNF-02 | Integridad | Escritura con versión optimista (409 si el servidor cambió). Un entreno en curso nunca se pierde. Tras un login, nada local se sube antes de bajar lo de la cuenta. |
| RNF-03 | Privacidad | El servidor nunca lee los blobs de fitness. Los posts llevan un snapshot. Las estadísticas públicas son un resumen que sube el móvil. |
| RNF-04 | Seguridad | Contraseñas con scrypt, sesiones opacas, límites por sesión en IA y blobs, y claves de IA solo en el servidor. |
| RNF-05 | Límites | 3 MB por blob (AsyncStorage en Android falla hacia los 2 MB por entrada). |
| RNF-06 | Copias | Copia de la BD cada 6 h (14 días), otra antes de cada despliegue y copias cruzadas Mac ↔ VPS (BD, código y clave de firma del APK). |
| RNF-07 | Accesibilidad | Comprobada con axe en los e2e, en claro y oscuro. |
| RNF-08 | Calidad | Lógica de dominio pura y testeada (vitest), tests del servidor y e2e con Playwright sobre la web exportada, con capturas de referencia. |
| RNF-09 | Coste | Sin servicios de pago: Gemini y Groq gratis, Open Food Facts, USDA con clave gratuita y servidor casero. |
| RNF-10 | Atribución | Los datos de terceros conservan sus licencias (ver `NOTICE.md`). |
