(function (root, factory) { const api = factory(); if (typeof module !== 'undefined') module.exports = api; root.EvitaniaModels = api; })(typeof window !== 'undefined' ? window : globalThis, () => {
  const number = value => Math.max(0, Number(value) || 0);
  const allItems = data => [...data.catalog.recipes, ...data.catalog.materials];
  const calculate = data => {
    const items = new Map(allItems(data).map(item => [item.id, item])); const need = new Map(); const stock = new Map(Object.entries(data.planning.stock || {}).map(([k,v]) => [k, number(v)]));
    const visit = (id, amount, trail = new Set()) => { const entry = items.get(id); if (!entry || !amount) return; need.set(id, (need.get(id) || 0) + amount); const available = stock.get(id) || 0; const craft = Math.max(0, amount - available); stock.set(id, Math.max(0, available - amount)); if (!craft || trail.has(id)) return; const next = new Set(trail); next.add(id); (entry.ingredients || []).forEach(part => visit(part.itemId, craft * number(part.quantity), next)); };
    data.planning.goals.forEach(goal => visit(goal.recipeId, number(goal.quantity)));
    const rows = [...need].map(([id, required]) => { const entry = items.get(id), owned = number(data.planning.stock[id]), missing = Math.max(0, required - owned), source = entry.source || { type: 'craft' }; let hourly = 0, label = 'Craftar'; if (!entry.ingredients?.length && source.type === 'gather') { hourly = number(data.planning.gatherRates[id]); label = 'Coleta'; } if (!entry.ingredients?.length && source.type === 'monster') { hourly = number(data.planning.killRates[source.monsterId]) * Math.min(1, number(source.probability) * (1 + number(data.planning.lootQuantity) / 100)); label = 'Drop'; } return { ...entry, required, owned, missing, hourly, hours: hourly && missing ? missing / hourly : null, sourceLabel: label, raw: !entry.ingredients?.length }; });
    return rows.sort((a,b) => Number(b.raw)-Number(a.raw) || b.missing-a.missing);
  };
  return { number, allItems, calculate };
});
