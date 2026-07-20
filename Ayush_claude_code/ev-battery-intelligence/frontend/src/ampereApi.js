const BASE = "http://127.0.0.1:8010/api";

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export const ampereApi = {
  metric: () => req("/metric"),
  fleet: () => req("/fleet"),
  runAgent: (assetId, fastForwardCycles = 0) =>
    req(`/agent/${assetId}?fast_forward_cycles=${fastForwardCycles}`, { method: "POST" }),
};
