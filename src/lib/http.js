import { Capacitor, CapacitorHttp } from "@capacitor/core";

// El WebView de Android empieza a limitar peticiones de red propias cuando la
// app lleva ~5 minutos en segundo plano — el envío de puntos GPS en Fase 2
// justamente pasa la mayor parte del tiempo así. CapacitorHttp hace la
// petición desde el lado nativo (fuera del WebView), evitando ese límite.
// En web (navegador, desarrollo local) no existe esa restricción, así que ahí
// se usa fetch normal.
export async function postNativo(url, body, headers) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({ url, headers, data: body });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, text: async () => JSON.stringify(res.data) };
  }
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}
