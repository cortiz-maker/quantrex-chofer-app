# Quantrex Chofer — App Android (Fase 1)

App nativa Android del perfil chofer, construida con Capacitor sobre el
mismo código React/Supabase que ya usas — se compila en la nube (GitHub
Actions), sin instalar Android Studio.

## Qué incluye esta Fase 1

- Login con PIN (igual que hoy).
- Lista de solicitudes asignadas al chofer, del día.
- Cambio de estado (En Tránsito / Completada / No Entregado).
- Trazabilidad GPS, ya usando el plugin nativo de Capacitor en vez del
  navegador — **todavía en primer plano** (se corta si la pantalla se
  apaga; el foreground service real es la Fase 2).

## Qué falta (fases siguientes)

- **Fase 1b**: captura de foto y firma digital obligatorias antes de cerrar
  una entrega (paridad completa con la app web).
- **Fase 2**: GPS en segundo plano real (foreground service con notificación
  persistente — así funciona en Android incluso con la app minimizada).
- **Fase 3**: notificaciones push (requiere crear un proyecto Firebase).
- **Fase 4**: modo offline (cola de sincronización cuando no hay señal).
- **Fase 5**: firma de release y publicación en Play Store.

## Cómo desplegar (todo desde el navegador, sin terminal)

1. Crea un repo nuevo en GitHub (ej. `quantrex-chofer-app`) y sube todos
   estos archivos y carpetas tal cual.
2. Ve a la pestaña **Actions** del repo. El workflow "Build Android APK"
   debería dispararse solo con el primer push. Si no, entra a él y usa
   el botón **"Run workflow"**.
3. Espera a que termine (unos 5-8 minutos la primera vez). Al terminar,
   baja hasta **Artifacts** y descarga `quantrex-chofer-debug-apk`.
4. Descomprime el .zip descargado — adentro está `app-debug.apk`.
5. Pásalo a un celular Android (por WhatsApp, Drive, USB, lo que sea) y
   ábrelo para instalar. Android va a pedir permitir "instalar apps de
   fuentes desconocidas" la primera vez — es normal en un APK de prueba,
   no publicado en Play Store todavía.

## Nota importante sobre las tablas de Supabase

Esta app usa las **mismas tablas** que la app web (`choferes`, `solicitudes`,
`tracking_puntos`) — no hay nada que migrar de datos, es el mismo backend.
Un chofer puede usar la app nueva o la web indistintamente; ambas escriben
al mismo lugar.
