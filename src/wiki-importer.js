const XLSX = require('xlsx');

const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const parseDrops = (text = '') => String(text).split('|').map(part => {
  const match = part.trim().match(/^(.+?):?\s*1\s*\/\s*([\d.,]+)/i);
  if (!match) return null;
  const denominator = Number(match[2].replace(/\./g, '').replace(',', '.'));
  return denominator ? { itemName: match[1].trim(), probability: 1 / denominator } : null;
}).filter(Boolean);

function createSeed(file) {
  const workbook = XLSX.readFile(file);
  const monsterRows = XLSX.utils.sheet_to_json(workbook.Sheets['Registro de monstros'], { header: 1, defval: '' });
  const equipmentRows = [...XLSX.utils.sheet_to_json(workbook.Sheets['Registro de Equipamentos'], { header: 1, defval: '' }), ...XLSX.utils.sheet_to_json(workbook.Sheets['Registro de ArmamentoColetavel'], { header: 1, defval: '' })];
  const monsters = monsterRows.slice(2).map((row, index) => row[0] ? ({
    id: `monster-${slug(row[0])}`, name: row[0], type: index + 3 >= 44 ? 'boss' : 'normal', status: row[2] || '', drops: parseDrops(row[5]), image: `assets/wiki/image${index + 63}.png`
  }) : null).filter(Boolean);
  const recipeNames = new Set(['Elmo de Cobre', 'Peito de Cobre', 'Luva de Cobre', 'Bota de Cobre', 'Espada de Cobre', 'Arco de Cobre', 'Elmo de Bronze', 'Peito de Bronze', 'Luva de Bronze', 'Bota de Bronze', 'Espada de Tório', 'Arco de Tório', 'Elmo de Tório', 'Peito de Tório', 'Luva de Tório', 'Bota de Tório', 'Machado de Tório', 'Picareta de Tório']);
  const equipment = equipmentRows.slice(2).map((row, index) => ({ row, image: index < 208 ? `assets/wiki/image${index + 149}.png` : `assets/wiki/image${index - 208 + 209}.png` })).filter(({ row }) => recipeNames.has(row[0])).map(({ row, image }) => ({ id: `equipment-${slug(row[0])}`, name: row[0], status: row[2] || '', info: row[3] || '', image }));
  const materials = [
    'Minério de Cobre','Tronco de Cinza','Barra de Cobre','Favo de mel','Pedra McPedrafface','Folha','Mini plantas','Minério de Ferro','Tronco de Pyrewood','Barra de Ferro','Carvão','Barra de Aço','Minério de Tório','Chadcoal','Barra de Tório','Substância Amarela Cristalizada','Pele Peluda','Pele Perfeita','Essência Nórdica','Essência Nórdica Perfeita','Elmo do Elmo','Estrutura do Artesão','Fio de Pele','Pena Amarela','Noz','Olho de Jötunn'
  ].map(name => ({ id: `material-${slug(name)}`, name, source: { type: ['Minério de Cobre','Tronco de Cinza','Minério de Ferro','Tronco de Pyrewood','Minério de Tório'].includes(name) ? 'gather' : 'none' }, xp: 0 }));
  const mid = name => `material-${slug(name)}`;
  const recipes = [
    ['Barra de Cobre', [['Minério de Cobre', 5]]], ['Barra de Ferro', [['Minério de Ferro', 5]]], ['Carvão', [['Tronco de Pyrewood', 10]]], ['Barra de Aço', [['Barra de Ferro', 3], ['Carvão', 1]]], ['Barra de Tório', [['Minério de Tório', 42], ['Chadcoal', 30]]], ['Pele Perfeita', [['Pele Peluda', 30]]], ['Essência Nórdica Perfeita', [['Essência Nórdica', 30]]], ['Fio de Pele', [['Pele Perfeita', 25], ['Pena Amarela', 100], ['Noz', 5000]]], ['Estrutura do Artesão', [['Barra de Aço', 10], ['Chadcoal', 100], ['Elmo do Elmo', 5000]]], ['Espada de Tório', [['Substância Amarela Cristalizada', 140], ['Barra de Tório', 98], ['Estrutura do Artesão', 7], ['Essência Nórdica Perfeita', 2]]], ['Arco de Tório', [['Substância Amarela Cristalizada', 140], ['Barra de Tório', 98], ['Fio de Pele', 7], ['Essência Nórdica Perfeita', 2]]]
  ].map(([name, ingredients]) => ({ id: `recipe-${slug(name)}`, name, ingredients: ingredients.map(([materialName, quantity]) => ({ itemId: mid(materialName), quantity })), xp: 0 }));
  // Dados ausentes na planilha continuam editáveis no catálogo. Liga os drops conhecidos às matérias-primas.
  const sourceByName = new Map(); monsters.forEach(monster => monster.drops.forEach(drop => { if (!sourceByName.has(slug(drop.itemName))) sourceByName.set(slug(drop.itemName), { type: 'monster', monsterId: monster.id, probability: drop.probability }); }));
  materials.forEach(material => { if (sourceByName.has(slug(material.name))) material.source = sourceByName.get(slug(material.name)); });
  return { version: 2, catalog: { recipes, materials, monsters, equipment }, planning: { goals: [], stock: {}, gatherRates: {}, killRates: {}, lootQuantity: 0 } };
}
module.exports = { createSeed };
