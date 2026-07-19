const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../src/models.js');

test('desconta estoque de intermediário antes de expandir ingredientes', () => {
  const data = { catalog: { recipes: [{ id: 'bar', name: 'Barra', ingredients: [{ itemId: 'ore', quantity: 3 }] }], materials: [{ id: 'ore', name: 'Minério', source: { type: 'gather' } }], monsters: [], equipment: [] }, planning: { goals: [{ recipeId: 'bar', quantity: 2 }], stock: { bar: 1, ore: 2 }, gatherRates: { ore: 2 }, killRates: {}, lootQuantity: 0 } };
  const rows = calculate(data);
  assert.deepEqual(rows.map(row => [row.name, row.required, row.missing]), [['Minério', 3, 1], ['Barra', 2, 1]]);
  assert.equal(rows[0].hours, .5);
});

test('aplica quantidade de saque à taxa de drops de monstros', () => {
  const data = { catalog: { recipes: [], materials: [{ id: 'fur', name: 'Pele', source: { type: 'monster', monsterId: 'wolf', probability: .01 } }], monsters: [], equipment: [] }, planning: { goals: [{ recipeId: 'fur', quantity: 3 }], stock: {}, gatherRates: {}, killRates: { wolf: 100 }, lootQuantity: 100 } };
  const row = calculate(data)[0];
  assert.equal(row.hourly, 2); assert.equal(row.hours, 1.5);
});
