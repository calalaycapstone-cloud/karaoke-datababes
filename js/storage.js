export const store = {
  get(k, d) { try { const v = localStorage.getItem('neonoke:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('neonoke:' + k, JSON.stringify(v)); } catch {} }
};
