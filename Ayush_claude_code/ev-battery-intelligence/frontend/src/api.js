const BASE = "/api";

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export const api = {
  fleet: () => req("/fleet"),
  battery: (id) => req(`/battery/${id}`),
  history: (id, limit = 100) => req(`/battery/${id}/history?limit=${limit}`),
  alerts: () => req("/alerts"),
  faultTypes: () => req("/fault-types"),
  injectFault: (id, faultType) =>
    req(`/battery/${id}/inject-fault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fault_type: faultType }),
    }),
};
