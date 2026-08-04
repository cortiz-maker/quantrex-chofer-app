import React, { useState } from "react";

export default function LoginChofer({ choferes, onAcceder }) {
  const [selChofer, setSelChofer] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const intentar = () => {
    const c = choferes.find((ch) => ch.nombre === selChofer);
    if (!c) {
      setErr("Selecciona tu nombre.");
      return;
    }
    if ((c.pin || "") !== pin) {
      setErr("PIN incorrecto.");
      return;
    }
    setErr("");
    onAcceder(c);
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", padding: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Acceso Choferes</div>
        <div style={{ fontSize: 13, color: "#9AB0C9", marginTop: 4 }}>
          Selecciona tu nombre e ingresa tu PIN
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#9AB0C9", display: "block", marginBottom: 6 }}>
          Seleccionar chofer
        </label>
        <select
          style={inputStyle}
          value={selChofer}
          onChange={(e) => {
            setSelChofer(e.target.value);
            setErr("");
          }}
        >
          <option value="">-- Selecciona tu nombre --</option>
          {choferes.map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.nombre} · {c.ppu}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#9AB0C9", display: "block", marginBottom: 6 }}>
          PIN (4 dígitos)
        </label>
        <input
          style={{ ...inputStyle, fontSize: 22, letterSpacing: 8, textAlign: "center" }}
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") intentar();
          }}
        />
      </div>
      {err && <div style={{ color: "#F45B69", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{err}</div>}
      <button
        style={{ ...btnStyle, opacity: selChofer && pin.length === 4 ? 1 : 0.5 }}
        disabled={!selChofer || pin.length !== 4}
        onClick={intentar}
      >
        Ingresar
      </button>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #2A3F5C",
  background: "#132238",
  color: "#E8EEF7",
  fontSize: 15,
};

export const btnStyle = {
  width: "100%",
  padding: 14,
  borderRadius: 8,
  border: "none",
  background: "#00AEEF",
  color: "#04141F",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
