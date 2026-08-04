import React, { useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { registerPlugin } from "@capacitor/core";
import { sbInsertTracking, cerrarSolicitud, actualizarEstadoSolicitud } from "../lib/supabase";
import ModalFirma from "./ModalFirma.jsx";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000,
    rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1),
    dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatTiempo(seg) {
  if (!seg && seg !== 0) return null;
  const h = Math.floor(seg / 3600),
    m = Math.floor((seg % 3600) / 60),
    s = seg % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function VistaChofer({ chofer, solicitudes, onCerrado, onSalir }) {
  const [seleccionada, setSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(null);
  const [fotos, setFotos] = useState({});
  const [fotosManifiesto, setFotosManifiesto] = useState({});
  const [firmas, setFirmas] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [documentosGD, setDocumentosGD] = useState({});
  const [llegadas, setLlegadas] = useState({});
  const [tiempos, setTiempos] = useState({});
  const [errorValidacion, setErrorValidacion] = useState(null);
  const [modalFirma, setModalFirma] = useState(null);
  const timerRef = useRef({});

  useEffect(() => () => Object.values(timerRef.current).forEach(clearInterval), []);

  // ── GPS en segundo plano real ────────────────────────────────────────────
  // A diferencia de la Fase 1 (Geolocation.watchPosition, que se corta con la
  // pantalla apagada), esto usa un foreground service Android real: mientras
  // el chofer tenga sesión activa, aparece una notificación fija en la barra
  // de estado y el GPS sigue capturando aunque la app esté minimizada o la
  // pantalla bloqueada. La notificación es obligatoria en Android — no se
  // puede tener tracking en segundo plano sin avisar al usuario, por diseño
  // del sistema (no es una limitación nuestra).
  const watchId = useRef(null);
  const ultimo = useRef({ lat: null, lng: null, ts: 0 });
  useEffect(() => {
    let cancelado = false;
    const INTERVALO_MIN_MS = 8000,
      DIST_MIN_M = 15;

    BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Quantrex está registrando tu ubicación durante el reparto.",
        backgroundTitle: "Quantrex Chofer — GPS activo",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0, // el filtrado de distancia/tiempo se hace acá abajo, igual que antes
      },
      (location, error) => {
        if (cancelado) return;
        if (error) {
          console.error("BackgroundGeolocation error:", error.code, error.message);
          return;
        }
        if (!location) return;
        const { latitude, longitude, speed, accuracy } = location;
        const ahora = Date.now();
        const prev = ultimo.current;
        const dt = ahora - prev.ts;
        const dd = prev.lat != null ? distM(prev.lat, prev.lng, latitude, longitude) : Infinity;
        if (prev.ts !== 0 && dt < INTERVALO_MIN_MS && dd < DIST_MIN_M) return;
        ultimo.current = { lat: latitude, lng: longitude, ts: ahora };
        sbInsertTracking({
          vehiculo_id: chofer.ppu || null,
          chofer_id: chofer.nombre || null,
          ruta_id: null,
          origen: "app_android",
          lat: latitude,
          lng: longitude,
          velocidad_kmh: speed != null ? Math.max(0, speed * 3.6) : null,
          precision_m: accuracy ?? null,
          timestamp_captura: new Date().toISOString(),
        });
      }
    ).then((id) => {
      if (cancelado) BackgroundGeolocation.removeWatcher({ id });
      else watchId.current = id;
    });

    return () => {
      cancelado = true;
      if (watchId.current != null) BackgroundGeolocation.removeWatcher({ id: watchId.current });
    };
  }, [chofer.ppu, chofer.nombre]);

  function registrarLlegada(solId) {
    const now = new Date();
    const hora = now.toLocaleDateString("es-CL") + " " + now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
    Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
      .then((pos) => {
        const geo = pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
        setLlegadas((p) => ({ ...p, [solId]: { hora, timestamp: now.getTime(), geo } }));
      })
      .catch(() => setLlegadas((p) => ({ ...p, [solId]: { hora, timestamp: now.getTime(), geo: null } })));
    timerRef.current[solId] = setInterval(() => {
      setTiempos((p) => ({ ...p, [solId]: Math.floor((Date.now() - now.getTime()) / 1000) }));
    }, 1000);
  }

  async function tomarFoto(solId, manifiesto) {
    try {
      const foto = await Camera.getPhoto({
        quality: 80,
        width: 1600,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
      });
      const setter = manifiesto ? setFotosManifiesto : setFotos;
      const max = manifiesto ? 10 : 4;
      setter((p) => ({ ...p, [solId]: [...(p[solId] || []), foto.dataUrl].slice(0, max) }));
    } catch (e) {
      if (e?.message && !/cancel/i.test(e.message)) console.error("Camera error:", e);
    }
  }
  function quitarFoto(solId, idx) {
    setFotos((p) => ({ ...p, [solId]: (p[solId] || []).filter((_, i) => i !== idx) }));
  }
  function quitarFotoManifiesto(solId, idx) {
    setFotosManifiesto((p) => ({ ...p, [solId]: (p[solId] || []).filter((_, i) => i !== idx) }));
  }

  async function cerrar(sol, nuevoEstado) {
    const id = sol.id;
    const esCargaOL = sol.tipo === "carga_ol";
    if (esCargaOL ? (fotosManifiesto[id] || []).length < 1 : (fotos[id] || []).length < 1) {
      setErrorValidacion(id);
      setTimeout(() => setErrorValidacion(null), 3000);
      return;
    }
    if (!firmas[id]) {
      setErrorValidacion(id + "firma");
      setTimeout(() => setErrorValidacion(null), 3000);
      return;
    }
    setErrorValidacion(null);
    setCargando(id + nuevoEstado);

    let geoStr = null;
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
      geoStr = pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
    } catch {}

    const llegada = llegadas[id];
    const tiempoEnPunto = llegada ? Math.floor((Date.now() - llegada.timestamp) / 1000) : null;
    const tiempoStr = tiempoEnPunto !== null ? formatTiempo(tiempoEnPunto) : null;
    if (timerRef.current[id]) {
      clearInterval(timerRef.current[id]);
      delete timerRef.current[id];
    }

    const statusLabel = nuevoEstado === "completada" ? "Entregado" : "No Entregado";
    const ok = await cerrarSolicitud(id, {
      nuevoEstado,
      statusLabel,
      statusLogPrevio: [],
      autor: chofer.nombre,
      fotosDoc: esCargaOL ? [] : fotos[id] || [],
      fotosManifiesto: esCargaOL ? fotosManifiesto[id] || [] : [],
      horaLlegada: llegada?.hora || null,
      tiempoEnPunto: tiempoStr,
      geoStr,
      firmaData: firmas[id] || null,
      observacion: observaciones[id] || null,
      documentosCliente: documentosGD[id] || null,
    });

    setCargando(null);
    if (!ok) {
      alert("No se pudo registrar la entrega. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    [setFotos, setFotosManifiesto, setObservaciones, setDocumentosGD, setFirmas, setLlegadas, setTiempos].forEach((setter) =>
      setter((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      })
    );
    onCerrado(id);
  }

  async function marcarEnTransito(sol) {
    setCargando(sol.id + "en_proceso");
    const ok = await actualizarEstadoSolicitud(sol.id, "en_proceso", [], chofer.nombre);
    setCargando(null);
    if (ok) onCerrado(sol.id, "en_proceso");
    else alert("No se pudo actualizar el estado. Revisa tu conexión e inténtalo de nuevo.");
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ background: "#132238", border: "1px solid #00AEEF", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Perfil Chofer</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{chofer.nombre}</div>
          <div style={{ fontSize: 13, color: "#9AB0C9" }}>PPU: {chofer.ppu}</div>
        </div>
        <button style={{ background: "transparent", border: "1px solid #2A3F5C", color: "#9AB0C9", borderRadius: 8, padding: "8px 14px" }} onClick={onSalir}>
          Salir
        </button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#9AB0C9", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Entregas de hoy — {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
      </div>

      {solicitudes.length === 0 && <div style={{ textAlign: "center", color: "#9AB0C9", marginTop: 40 }}>✓ Sin entregas pendientes para hoy</div>}

      {solicitudes.map((s) => {
        const abierta = seleccionada === s.id;
        const llegadaOk = !!llegadas[s.id];
        const esCargaOL = s.tipo === "carga_ol";
        const arrFotos = esCargaOL ? fotosManifiesto[s.id] || [] : fotos[s.id] || [];
        const fotosOk = arrFotos.length >= 1;
        const firmaOk = !!firmas[s.id];

        return (
          <div key={s.id} style={{ background: "#0F1D30", border: "1px solid " + (abierta ? "#00AEEF" : "#2A3F5C"), borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }} onClick={() => setSeleccionada(abierta ? null : s.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.titulo}</div>
                <div style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, marginTop: 2 }}>N° Solicitud: {s.ot || s.id}</div>
                {s.direccion && <div style={{ fontSize: 12, color: "#9AB0C9", marginTop: 2 }}>📍 {s.direccion}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 14 }}>
                {llegadaOk && <span title="Llegada registrada">📍</span>}
                {fotosOk && <span title="Fotos registradas">📷</span>}
                {firmaOk && <span title="Firma registrada">✍️</span>}
              </div>
              <div style={{ color: "#9AB0C9", fontSize: 16 }}>{abierta ? "▲" : "▼"}</div>
            </div>

            {!abierta && (
              <div style={{ padding: "0 16px 14px" }} onClick={(e) => e.stopPropagation()}>
                {!llegadaOk ? (
                  <button style={{ background: "#00AEEF22", border: "1px solid #00AEEF", color: "#00AEEF", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, width: "100%" }} onClick={() => registrarLlegada(s.id)}>
                    📍 Llegué al punto de entrega
                  </button>
                ) : (
                  <div style={{ background: "#0A1628", border: "1px solid #00AEEF", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700 }}>EN PUNTO DE ENTREGA · {llegadas[s.id].hora}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#00AEEF", fontFamily: "monospace" }}>{formatTiempo(tiempos[s.id] || 0)}</div>
                  </div>
                )}
              </div>
            )}

            {abierta && (
              <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #2A3F5C", paddingTop: 14 }}>
                {s.direccion && (
                  <div style={{ background: "#0A1628", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#C7D5E6" }}>
                    📍 {s.direccion}
                    {s.notas && <div style={{ color: "#9AB0C9", fontSize: 12, marginTop: 4 }}>💬 {s.notas}</div>}
                  </div>
                )}

                {(() => {
                  const lista = (s.documentos || "").split(",").map((d) => d.trim()).filter(Boolean);
                  const gdPrecargada = lista.find((d) => /maletas/i.test(d)) || lista[0] || "";
                  const valor = documentosGD[s.id] !== undefined ? documentosGD[s.id] : gdPrecargada;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", letterSpacing: 0.5, textTransform: "uppercase" }}>📄 N° GD Cliente</label>
                      <input
                        style={{ border: "1px solid #2A3F5C", background: "#0A1628", color: "#E8EEF7", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none" }}
                        placeholder="Ej: GD 12345 (según lo indicado en la guía física)"
                        value={valor}
                        onChange={(e) => setDocumentosGD((p) => ({ ...p, [s.id]: e.target.value }))}
                      />
                    </div>
                  );
                })()}

                {!llegadas[s.id] ? (
                  <button style={{ background: "#00AEEF22", border: "1px solid #00AEEF", color: "#00AEEF", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, width: "100%" }} onClick={() => registrarLlegada(s.id)}>
                    📍 Llegué al punto de entrega
                  </button>
                ) : (
                  <div style={{ background: "#0A1628", border: "1px solid #00AEEF", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700 }}>EN PUNTO DE ENTREGA</div>
                      <div style={{ fontSize: 11, color: "#9AB0C9", marginTop: 2 }}>Llegada: {llegadas[s.id].hora}</div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#00AEEF", fontFamily: "monospace" }}>{formatTiempo(tiempos[s.id] || 0)}</div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: fotosOk ? "#4CAF50" : "#F45B69", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {esCargaOL ? `Registro Fotográfico Manifiesto DHL — ${arrFotos.length} foto${arrFotos.length === 1 ? "" : "s"} ${fotosOk ? "✓" : "(mínimo 1)"}` : `Foto documento — ${arrFotos.length} de 4 ${fotosOk ? "✓" : "(mínimo 1)"}`}
                  </div>
                  {arrFotos.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {arrFotos.map((b, i) => (
                        <div key={i} style={{ position: "relative" }}>
                          <img src={b} alt={"foto " + (i + 1)} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "2px solid #4CAF50" }} />
                          <button
                            onClick={() => (esCargaOL ? quitarFotoManifiesto(s.id, i) : quitarFoto(s.id, i))}
                            style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#F45B69", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(esCargaOL || arrFotos.length < 4) && (
                    <button
                      style={{ background: fotosOk ? "#4CAF5022" : "#F45B6922", border: "1px solid " + (fotosOk ? "#4CAF50" : "#F45B69"), color: fotosOk ? "#4CAF50" : "#F45B69", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, width: "100%" }}
                      onClick={() => tomarFoto(s.id, esCargaOL)}
                    >
                      📷 {esCargaOL ? "Agregar foto del manifiesto" : fotosOk ? "Agregar otra foto del documento" : "Tomar foto del documento (obligatorio)"}
                    </button>
                  )}
                </div>
                {errorValidacion === s.id && (
                  <div style={{ background: "#F45B6922", border: "1px solid #F45B69", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#F45B69", fontWeight: 600 }}>
                    📷 {esCargaOL ? "Debes registrar al menos una foto del manifiesto DHL antes de cerrar." : "Debes tomar una foto del documento antes de registrar la entrega."}
                  </div>
                )}

                <button
                  style={{ background: firmaOk ? "#4CAF5022" : "#7C3AED22", border: "1px solid " + (firmaOk ? "#4CAF50" : "#7C3AED"), color: firmaOk ? "#4CAF50" : "#A78BFA", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, width: "100%" }}
                  onClick={() => setModalFirma(s.id)}
                >
                  ✍️ {firmaOk ? (firmas[s.id].rechazo ? "Sin firma digital ✓" : "Firma tomada ✓") : esCargaOL ? "Firma Despachador (obligatorio)" : "Firma del receptor (obligatorio)"}
                </button>
                {errorValidacion === s.id + "firma" && (
                  <div style={{ background: "#F45B6922", border: "1px solid #F45B69", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#F45B69", fontWeight: 600 }}>
                    ✍️ {esCargaOL ? "Debes registrar la firma del despachador." : "Debes registrar la firma del receptor o indicar que no es necesaria firma digital."}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#9AB0C9", letterSpacing: 0.5, textTransform: "uppercase" }}>Observación (opcional)</label>
                  <textarea
                    style={{ border: "1px solid #2A3F5C", background: "#0A1628", color: "#E8EEF7", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", resize: "vertical", minHeight: 54, fontFamily: "inherit" }}
                    placeholder="Alguna nota o situación de la entrega"
                    value={observaciones[s.id] || ""}
                    onChange={(e) => setObservaciones((p) => ({ ...p, [s.id]: e.target.value }))}
                  />
                </div>

                <button style={{ ...miniBtn, borderColor: "#00AEEF", color: "#00AEEF" }} disabled={cargando === s.id + "en_proceso"} onClick={() => marcarEnTransito(s)}>
                  En Tránsito
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ flex: 1, background: "#4CAF5022", border: "1px solid #4CAF50", color: "#4CAF50", borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, opacity: cargando ? 0.6 : 1 }} disabled={!!cargando} onClick={() => cerrar(s, "completada")}>
                    {cargando === s.id + "completada" ? "Registrando..." : "✓ Completada"}
                  </button>
                  <button style={{ flex: 1, background: "#F9731622", border: "1px solid #F97316", color: "#F97316", borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, opacity: cargando ? 0.6 : 1 }} disabled={!!cargando} onClick={() => cerrar(s, "no_entregado")}>
                    {cargando === s.id + "no_entregado" ? "Registrando..." : "✗ No Entregado"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {modalFirma && (
        <ModalFirma
          rol={solicitudes.find((x) => x.id === modalFirma)?.tipo === "carga_ol" ? "despachador" : "receptor"}
          onGuardar={(f) => {
            setFirmas((p) => ({ ...p, [modalFirma]: f }));
            setModalFirma(null);
          }}
          onCerrar={() => setModalFirma(null)}
        />
      )}
    </div>
  );
}

const miniBtn = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "transparent",
  border: "1px solid",
  fontWeight: 600,
  fontSize: 13,
};
