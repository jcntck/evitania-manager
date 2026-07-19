(function (root, factory) { const api = factory(); if (typeof module !== 'undefined') module.exports = api; root.EvitaniaCore = api; })(typeof window !== 'undefined' ? window : globalThis, () => {
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const number = value => Math.max(0, Number(value) || 0);
  function initialData() {
    const items = [
      ['Minério de Tório', 0, 0], ['Minério de Ferro', 0, 0], ['Chadcoal', 0, 0], ['Substância Amarela', 0, 0], ['Pele Peluda', 0, 0], ['Pena Amarela', 0, 0], ['Noz', 0, 0],
      ['Essência Nórdica', 0, 0], ['Olho de Jotunn', 0, 0], ['Tronco de Freixo', 0, 0], ['Tronco de Pyrewood', 0, 0], ['Tronco de Madeira de Ferro', 0, 0],
      ['Barra de Ferro', 0, 0], ['Carvão', 0, 0], ['Barra de Aço', 0, 0], ['Barra de Tório', 0, 0], ['Pele Perfeita', 0, 0], ['Fio de Pele', 0, 0], ['Essência Nórdica Perfeita', 0, 0], ['Estrutura do Artesão', 0, 0],
      ['Espada de Tório', 0, 0], ['Arco de Tório', 0, 0]
    ].map(([name, owned, hourly]) => ({ id: uid(), name, owned, hourly, recipe: [] }));
    const byName = name => items.find(item => item.name === name).id;
    const recipe = (name, parts) => items.find(item => item.name === name).recipe = parts.map(([material, quantity]) => ({ itemId: byName(material), quantity }));
    recipe('Barra de Ferro', [['Minério de Ferro', 5]]);
    recipe('Carvão', [['Tronco de Pyrewood', 10]]);
    recipe('Barra de Aço', [['Barra de Ferro', 3], ['Carvão', 1]]);
    recipe('Barra de Tório', [['Minério de Tório', 42], ['Chadcoal', 30]]);
    recipe('Pele Perfeita', [['Pele Peluda', 30]]);
    recipe('Fio de Pele', [['Pele Perfeita', 25], ['Pena Amarela', 100], ['Noz', 5000]]);
    recipe('Essência Nórdica Perfeita', [['Essência Nórdica', 30]]);
    recipe('Estrutura do Artesão', [['Barra de Aço', 10], ['Chadcoal', 100]]);
    recipe('Espada de Tório', [['Substância Amarela', 140], ['Barra de Tório', 98], ['Estrutura do Artesão', 7], ['Essência Nórdica Perfeita', 2]]);
    recipe('Arco de Tório', [['Substância Amarela', 140], ['Barra de Tório', 98], ['Fio de Pele', 7], ['Essência Nórdica Perfeita', 2]]);
    return { version: 1, items, plan: [] };
  }
  function calculate(data) {
    const map = new Map(data.items.map(item => [item.id, item]));
    const gross = new Map();
    const stock = new Map(data.items.map(item => [item.id, number(item.owned)]));
    const expand = (id, amount, trail = new Set()) => {
      const item = map.get(id); if (!item || amount <= 0) return;
      gross.set(id, (gross.get(id) || 0) + amount);
      // Use stock before expanding a recipe, so owned intermediates also
      // reduce the materials required below them.
      const available = stock.get(id) || 0;
      const toCraft = Math.max(0, amount - available);
      stock.set(id, Math.max(0, available - amount));
      if (!toCraft) return;
      if (trail.has(id)) return;
      const next = new Set(trail); next.add(id);
      for (const part of item.recipe || []) expand(part.itemId, toCraft * number(part.quantity), next);
    };
    for (const line of data.plan) expand(line.itemId, number(line.quantity));
    const rows = [...gross].map(([id, required]) => {
      const item = map.get(id); const owned = number(item.owned); const missing = Math.max(0, required - owned); const hourly = number(item.hourly);
      return { ...item, required, owned, missing, hours: hourly && missing ? missing / hourly : null, raw: !(item.recipe || []).length };
    }).sort((a,b) => Number(b.raw) - Number(a.raw) || b.missing - a.missing || a.name.localeCompare(b.name));
    return { rows, rawRows: rows.filter(row => row.raw), totalMissing: rows.reduce((sum, row) => sum + row.missing, 0) };
  }
  return { uid, number, initialData, calculate };
});
