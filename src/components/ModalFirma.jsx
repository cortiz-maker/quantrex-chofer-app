import React, { useRef, useState } from "react";

export default function ModalFirma({ rol = "receptor", onGuardar, onCerrar }) {
  const canvasRef = useRef(null);
  const [dibujando, setDibujando] = useState(false);
  const [hayFirma, setHayFirma] = useState(false);
  const [nombre, setNombre] = useState("");
  const [modo, setModo] = useState("firma"); // firma | rechazo

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
  function iniciar(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDibujando(true);
  }
  function dibujar(e) {
    e.preventDefault();
    if (!dibujando) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0D1F3C";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHayFirma(true);
  }
  function terminar(e) {
    e.preventDefault();
    setDibujando(false);
  }
  function limpiar() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHayFirma(false);
  }
  function guardar() {
    if (modo === "rechazo") {
      onGuardar({ rechazo: true, nombre: nombre || "Anónimo", dataUrl: null });
      return;
    }
    if (!hayFirma) return;
    onGuardar({ rechazo: false, nombre: nombre || "Receptor", dataUrl: canvasRef.current.toDataURL("image/png") });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000CC", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0D1F3C" }}>
            {rol === "despachador" ? "Firma del despachador" : "Firma del receptor"}
          </div>
          <button style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }} onClick={onCerrar}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ flex: 1, padding: 8, borderRadius: 8, border: "2px solid " + (modo === "firma" ? "#7C3AED" : "#ddd"), background: modo === "firma" ? "#7C3AED22" : "transparent", color: modo === "firma" ? "#7C3AED" : "#888", fontWeight: 700, fontSize: 13 }}
            onClick={() => setModo("firma")}
          >
            ✍️ Firma
          </button>
          <button
            style={{ flex: 1, padding: 8, borderRadius: 8, border: "2px solid " + (modo === "rechazo" ? "#F45B69" : "#ddd"), background: modo === "rechazo" ? "#F45B6922" : "transparent", color: modo === "rechazo" ? "#F45B69" : "#888", fontWeight: 700, fontSize: 13 }}
            onClick={() => setModo("rechazo")}
          >
            ✗ No es necesaria firma digital
          </button>
        </div>

        {modo === "firma" ? (
          <>
            <div style={{ fontSize: 12, color: "#888" }}>El {rol} dibuja su firma con el dedo:</div>
            <div style={{ border: "2px solid #ddd", borderRadius: 10, overflow: "hidden", background: "#f9f9f9", touchAction: "none" }}>
              <canvas
                ref={canvasRef}
                width={380}
                height={160}
                style={{ display: "block", width: "100%", touchAction: "none" }}
                onMouseDown={iniciar}
                onMouseMove={dibujar}
                onMouseUp={terminar}
                onMouseLeave={terminar}
                onTouchStart={iniciar}
                onTouchMove={dibujar}
                onTouchEnd={terminar}
              />
            </div>
            <button style={{ background: "transparent", border: "1px solid #ddd", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#888", alignSelf: "flex-start" }} onClick={limpiar}>
              Limpiar firma
            </button>
          </>
        ) : (
          <div style={{ background: "#F45B6911", border: "1px solid #F45B6944", borderRadius: 10, padding: 12, fontSize: 13, color: "#F45B69", fontWeight: 600 }}>
            Se registrará que no fue necesaria la firma digital del {rol}.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Nombre del {rol}</label>
          <input style={{ border: "1px solid #ddd", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ flex: 1, background: "transparent", border: "1px solid #ddd", borderRadius: 8, padding: 11, fontWeight: 600, fontSize: 14, color: "#888" }} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            style={{ flex: 1, background: modo === "rechazo" ? "#F45B69" : "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: 11, fontWeight: 800, fontSize: 14, opacity: modo === "firma" && !hayFirma ? 0.4 : 1 }}
            disabled={modo === "firma" && !hayFirma}
            onClick={guardar}
          >
            {modo === "rechazo" ? "Registrar" : "Guardar firma"}
          </button>
        </div>
      </div>
    </div>
  );
}
