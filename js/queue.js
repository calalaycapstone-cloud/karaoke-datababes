import { store } from './storage.js';
let items = store.get('queue', []); const subs = [];
const save = () => { store.set('queue', items); subs.forEach(f => f(items)); };
export const queue = {
  get items() { return items; }, on(f) { subs.push(f); },
  add(s) { items.push(s); save(); }, addNext(s) { items.unshift(s); save(); },
  remove(i) { items.splice(i, 1); save(); },
  move(a, b) { if (b < 0 || b >= items.length) return; items.splice(b, 0, items.splice(a, 1)[0]); save(); },
  shuffle() { for (let i = items.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [items[i], items[j]] = [items[j], items[i]]; } save(); },
  clear() { items = []; save(); }, shift() { const s = items.shift(); save(); return s; }
};
