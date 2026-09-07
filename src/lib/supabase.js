// Mismo proyecto Supabase que la app web de Quantrex — misma base de datos,
// mismas tablas (choferes, solicitudes, tracking_puntos). Esta app nativa NO
// duplica datos, solo agrega otro cliente que lee/escribe en las mismas tablas.
export const SUPABASE_URL = "https://euvwfbnbmefqpakbbzni.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dndmYm5ibWVmcXBha2Jiem5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjY0ODksImV4cCI6MjA5NjAwMjQ4OX0.g4MZSgs7yF3fJljIbF-C582g-Bvbn0RSML1lYGGlIaQ";

export async function sbFetch(method, table, body = null, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const e = await res.text();
    console.error("Supabase error:", e);
    return null;
  }
  if (method === "DELETE") return true;
  return res.json();
}

import { postNativo } from "./http.js";

// Inserta un punto de trazabilidad GPS — misma tabla tracking_puntos que usa
// la app web. Cada punto es una fila nueva (no upsert). Usa postNativo() en
// vez de fetch() directo porque este envío ocurre casi siempre con la app en
// segundo plano (Fase 2), donde el WebView de Android limita las peticiones
// de red propias después de ~5 minutos — el puente nativo no tiene ese límite.
export async function sbInsertTracking(row) {
  try {
    const res = await postNativo(
      `${SUPABASE_URL}/rest/v1/tracking_puntos`,
      row,
      {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      }
    );
    if (!res.ok) {
      const e = await res.text();
      console.error("sbInsertTracking error:", e);
      return false;
    }
    return true;
  } catch (e) {
    console.error("sbInsertTracking excepción:", e);
    return false;
  }
}

export async function loadChoferes() {
  const data = await sbFetch("GET", "choferes", "", "?select=*");
  return data || [];
}

// Guarda/actualiza el token de notificaciones push del dispositivo del
// chofer — se llama cada vez que inicia sesión, así queda siempre el token
// del último dispositivo/instalación usada (si reinstala la app o cambia de
// celular, el token cambia y se sobreescribe solo).
export async function guardarPushToken(choferNombre, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/choferes?nombre=eq.${encodeURIComponent(choferNombre)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ push_token: token, push_token_actualizado_en: new Date().toISOString() }),
    });
    return res.ok;
  } catch (e) {
    console.error("guardarPushToken error:", e);
    return false;
  }
}

// Solicitudes asignadas al chofer para hoy, en curso (mismo criterio que
// VistaChofer en la app web: ppuAsignada o choferAsignado, fecha de hoy,
// estado pendiente o en_proceso).
export async function loadSolicitudesChofer(choferNombre, ppu) {
  // Fecha LOCAL (Chile), no UTC: toISOString() usa UTC y en Chile (UTC-3/-4)
  // eso hace que, desde aprox. las 20:00-21:00 hora local en adelante, "hoy"
  // ya cuente como el día siguiente en UTC -- una solicitud creada esa misma
  // tarde/noche con fecha de HOY (correcta) dejaba de aparecer para el
  // chofer. Mismo bug y mismo fix que ya se aplicó en la app web.
  const hoy = new Date().toLocaleDateString("en-CA");
  const data = await sbFetch(
    "GET",
    "solicitudes",
    "",
    `?select=id,ot,tipo,titulo,descripcion,direccion,fecha,hora,contacto,guia,destino,status,documentos,notas,ppu_asignada,chofer_asignado,destino_lat,destino_lng,status_log&fecha=eq.${hoy}&status=in.(pendiente,en_proceso,en_punto_cliente)`
  );
  if (!data) return [];
  return data
    .filter((s) => s.ppu_asignada === ppu || s.chofer_asignado === choferNombre)
    .map((s) => ({
      id: s.id,
      ot: s.ot,
      tipo: s.tipo,
      titulo: s.titulo,
      descripcion: s.descripcion,
      direccion: s.direccion,
      fecha: s.fecha,
      hora: s.hora,
      contacto: s.contacto,
      guia: s.guia,
      destino: s.destino,
      status: s.status,
      documentos: s.documentos,
      notas: s.notas,
      statusLog: s.status_log || [],
      destinoLat: typeof s.destino_lat === "number" ? s.destino_lat : null,
      destinoLng: typeof s.destino_lng === "number" ? s.destino_lng : null,
    }));
}

// Actualiza SOLO el estado (cambio rápido "En Tránsito", sin cierre todavía).
export async function actualizarEstadoSolicitud(id, nuevoEstado, statusLogPrevio, autor) {
  const entrada = { estado: nuevoEstado, fecha: new Date().toISOString(), autor: autor || "Chofer (app)" };
  const log = [...(statusLogPrevio || []), entrada];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: nuevoEstado, status_log: log, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    console.error("actualizarEstadoSolicitud error:", await res.text());
    return false;
  }
  return true;
}

// Marca automáticamente el estado "En Punto Cliente" apenas el chofer llega
// al punto de entrega/retiro -- por botón manual (registrarLlegada) o por
// geocerca automática (registrarLlegadaAuto), en VistaChofer.jsx. Antes esta
// app solo guardaba la llegada en memoria/localStorage del celular: nunca le
// avisaba a Supabase, así que ni el admin (Detalle, Bitácora/Flujo) ni la
// alerta de "carga no preparada en andén" se enteraban de nada. Ahora
// persiste lo mismo que hace handleChoferLlegada en la app web:
//   - status = "en_punto_cliente"
//   - llegada_ts = timestamp real (ISO), para calcular minutos transcurridos
//     server-side (Edge Function de alerta) y mostrar el cronómetro en vivo
//     en el Detalle del admin.
//   - alerta_anden_enviada = false, por si esta guía ya había disparado una
//     alerta en una gestión anterior y vuelve a marcar llegada de nuevo.
export async function registrarLlegadaPunto(id, { horaLlegada, llegadaTsISO, geoStr = null, autor = null, statusLogPrevio = [] }) {
  const entry = {
    id: Date.now().toString(),
    de: "en_proceso",
    a: "En Punto Cliente",
    fechaHora: horaLlegada,
    canceladoPor: null,
    geo: geoStr || "Sin geolocalización",
    usuario: autor || "Chofer (app)",
  };
  const log = [...(statusLogPrevio || []), entry];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "en_punto_cliente",
      status_log: log,
      llegada_ts: llegadaTsISO,
      hora_llegada: horaLlegada,
      alerta_anden_enviada: false,
      alerta_anden_enviada_en: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    console.error("registrarLlegadaPunto error:", await res.text());
    return false;
  }
  return true;
}

// Cierre completo de una entrega (Completada / No Entregado), con foto,
// firma, llegada y observación — mismo set de columnas que usa la app web
// en handleChoferEstado, vía PATCH (solo toca estas columnas, no pisa nada
// más de la fila que esta app no cargó, como facturación o datos de DT).
export async function cerrarSolicitud(id, {
  nuevoEstado, statusLabel, statusLogPrevio, autor,
  fotosDoc = [], fotosManifiesto = [], horaLlegada = null, tiempoEnPunto = null,
  geoStr = null, firmaData = null, observacion = null, documentosCliente = null,
}) {
  const now = new Date();
  const fechaHora = now.toLocaleDateString("es-CL") + " " + now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
  const entry = {
    id: Date.now().toString(),
    de: "en_proceso",
    a: statusLabel,
    fechaHora,
    canceladoPor: null,
    geo: geoStr || "Sin geolocalización",
    usuario: autor || "Chofer (app)",
  };
  const log = [...(statusLogPrevio || []), entry];
  const body = {
    status: nuevoEstado,
    status_log: log,
    updated_at: now.toISOString(),
    geo_entrega: geoStr || null,
    hora_entrega: fechaHora,
    hora_llegada: horaLlegada || null,
    tiempo_en_punto: tiempoEnPunto || null,
    coords_entrega: geoStr || null,
    foto_entrega: fotosDoc[0] || null,
    fotos_entrega: fotosDoc,
    fotos_manifiesto: fotosManifiesto,
    firma_receptor: firmaData?.dataUrl || null,
    nombre_receptor: firmaData?.nombre || null,
    rechazo_firma: firmaData?.rechazo || false,
    observacion_chofer: observacion || null,
    observacion_autor: observacion ? autor || "Chofer (app)" : null,
    observacion_fecha: observacion ? now.toISOString() : null,
  };
  if (documentosCliente != null && documentosCliente.trim() !== "") {
    body.documentos = documentosCliente.trim();
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("cerrarSolicitud error:", await res.text());
    return false;
  }
  return true;
}
