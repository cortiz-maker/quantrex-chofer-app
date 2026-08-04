import React, { useEffect, useState } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import LoginChofer from "./components/LoginChofer.jsx";
import VistaChofer from "./components/VistaChofer.jsx";
import { loadChoferes, loadSolicitudesChofer, guardarPushToken } from "./lib/supabase.js";

export default function App() {
  const [choferes, setChoferes] = useState([]);
  const [chofer, setChofer] = useState(null); // null = no logueado
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    loadChoferes().then((cs) => {
      setChoferes(cs);
      setCargando(false);
    });
  }, []);

  // Registra el dispositivo para notificaciones push apenas el chofer inicia
  // sesión, y guarda el token en Supabase asociado a su nombre. Si el chofer
  // niega el permiso, la app sigue funcionando normal — solo no recibirá avisos.
  useEffect(() => {
    if (!chofer) return;
    let cancelado = false;

    async function registrarPush() {
      const permiso = await PushNotifications.checkPermissions();
      let estado = permiso.receive;
      if (estado === "prompt") {
        const pedido = await PushNotifications.requestPermissions();
        estado = pedido.receive;
      }
      if (estado !== "granted") {
        console.log("Notificaciones push no autorizadas por el chofer.");
        return;
      }
      await PushNotifications.register();
    }

    const listenerRegistro = PushNotifications.addListener("registration", (token) => {
      if (cancelado) return;
      guardarPushToken(chofer.nombre, token.value);
    });
    const listenerError = PushNotifications.addListener("registrationError", (err) => {
      console.error("Error registrando push:", err);
    });

    registrarPush();

    return () => {
      cancelado = true;
      listenerRegistro.remove();
      listenerError.remove();
    };
  }, [chofer]);

  useEffect(() => {
    if (!chofer) return;
    let activo = true;
    const cargar = () => loadSolicitudesChofer(chofer.nombre, chofer.ppu).then((s) => activo && setSolicitudes(s));
    cargar();
    const intervalo = setInterval(cargar, 30000); // refresco cada 30s
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [chofer]);

  function onCerrado(id, nuevoEstado) {
    if (nuevoEstado === "en_proceso") {
      setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, status: nuevoEstado } : s)));
    } else {
      // completada / no_entregado: sale de la lista de pendientes de hoy
      setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    }
  }

  if (cargando) {
    return <div style={{ textAlign: "center", marginTop: 60, color: "#9AB0C9" }}>Cargando...</div>;
  }

  if (!chofer) {
    return <LoginChofer choferes={choferes} onAcceder={setChofer} />;
  }

  return (
    <VistaChofer
      chofer={chofer}
      solicitudes={solicitudes}
      onCerrado={onCerrado}
      onSalir={() => setChofer(null)}
    />
  );
}
