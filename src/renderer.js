const $ = s => document.querySelector(s);
const { number, allItems, calculate } = window.EvitaniaModels;
let data, controller;
const esc = v => String(v || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const fmt = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
const time = h => h == null ? 'Defina taxa/h' : h < 1 ? `${Math.ceil(h * 60)} min` : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}min`;
const recipeById = id => data.catalog.recipes.find(entry => entry.id === id);
const itemById = id => allItems(data).find(entry => entry.id === id);
async function save(next) { $('#save-status').textContent = 'Salvando…'; await window.storage.save(next); $('#save-status').textContent = 'Salvo localmente'; }
function renderGoals() {
  $('#goals').innerHTML = data.planning.goals.map((goal, index) => { const recipe = recipeById(goal.recipeId); return `<div class="goal"><div class="goal-name">${esc(recipe?.name || 'Receita removida')}</div><input data-goal="${index}" type="number" min="1" value="${number(goal.quantity)}"><button class="icon-button" data-remove-goal="${index}">×</button></div>`; }).join('');
  $('#empty-goals').hidden = !!data.planning.goals.length;
}
function renderRequirements() {
  const rows = calculate(data), rawOnly = $('#raw-only').checked, visible = rawOnly ? rows.filter(row => row.raw) : rows;
  const goals = data.planning.goals.reduce((sum, goal) => sum + number(goal.quantity), 0), missing = rows.reduce((sum,row) => sum + row.missing, 0);
  $('#goal-count').textContent = fmt(goals); $('#missing-count').textContent = fmt(missing); $('#summary-title').textContent = goals ? `${data.planning.goals.length} objetivo(s) ativo(s)` : 'Sem objetivos';
  $('#requirements').innerHTML = visible.map(row => `<tr><td>${esc(row.name)}${row.raw ? '<span class="raw-badge">BRUTO</span>' : ''}</td><td>${fmt(row.required)}</td><td><input class="inline-input" data-stock="${row.id}" type="number" min="0" value="${number(data.planning.stock[row.id])}"></td><td class="missing">${fmt(row.missing)}</td><td class="production">${row.raw ? rateEditor(row) : 'Produção por receita'}</td></tr>`).join('');
  $('#empty-requirements').hidden = !!visible.length;
}
function rateEditor(row) {
  if (row.source?.type === 'monster') return `<label>${esc(row.sourceLabel)} <input class="inline-input" data-killrate="${row.source.monsterId}" type="number" min="0" value="${number(data.planning.killRates[row.source.monsterId])}"> /h · ${row.hourly ? `${fmt(row.hourly)}/h · ${time(row.hours)}` : 'defina abates/h'}</label>`;
  if (row.source?.type === 'gather') return `<label>Coleta <input class="inline-input" data-gatherrate="${row.id}" type="number" min="0" value="${number(data.planning.gatherRates[row.id])}"> /h · ${row.hourly ? time(row.hours) : 'defina coleta/h'}</label>`;
  return 'Sem fonte cadastrada';
}
function art(entry, fallback) { return entry.image ? `<img class="entity-image" src="${entry.image}" alt="">` : `<div class="glyph">${fallback}</div>`; }
function renderCatalog() {
  $('#recipes-list').innerHTML = data.catalog.recipes.map(recipe => `<article class="catalog-card" data-edit-recipe="${recipe.id}"><div class="glyph">⚒</div><h3>${esc(recipe.name)}</h3><p>${recipe.ingredients.map(part => `${fmt(part.quantity)}× ${esc(itemById(part.itemId)?.name || '?')}`).join('<br>') || 'Sem ingredientes'}</p></article>`).join('');
  $('#monsters-list').innerHTML = data.catalog.monsters.map(monster => `<article class="catalog-card monster ${monster.type}">${art(monster, monster.type === 'boss' ? '♛' : '♜')}<h3>${esc(monster.name)} <small>${monster.type === 'boss' ? 'BOSS' : 'NORMAL'}</small></h3><p>${monster.drops.length ? monster.drops.map(drop => `${esc(drop.itemName)} <b>${drop.probability.toLocaleString('pt-BR',{maximumSignificantDigits:4})}</b>`).join('<br>') : 'Sem drops registrados'}</p><label>Abates/h <input class="monster-rate" data-killrate="${monster.id}" type="number" min="0" value="${number(data.planning.killRates[monster.id])}"></label></article>`).join('');
  $('#equipment-list').innerHTML = data.catalog.equipment.map(entry => `<article class="catalog-card">${art(entry, '◆')}<h3>${esc(entry.name)}</h3><p>${esc(entry.status || entry.info || 'Sem atributos registrados')}</p></article>`).join('');
}
function render() { renderGoals(); renderRequirements(); renderCatalog(); $('#loot-quantity').value = number(data.planning.lootQuantity); }
function openGoal() { $('#goal-item').innerHTML = data.catalog.recipes.map(recipe => `<option value="${recipe.id}">${esc(recipe.name)}</option>`).join(''); $('#goal-dialog').showModal(); }
document.addEventListener('click', event => {
  const tab = event.target.closest('[data-view]'); if (tab) { document.querySelectorAll('.tab,.view').forEach(node => node.classList.remove('active')); tab.classList.add('active'); $(`#${tab.dataset.view}`).classList.add('active'); return; }
  if (event.target.id === 'add-goal') return openGoal();
  if (event.target.id === 'new-recipe') return editRecipe();
  const edit = event.target.closest('[data-edit-recipe]'); if (edit) return editRecipe(recipeById(edit.dataset.editRecipe));
  const remove = event.target.closest('[data-remove-goal]'); if (remove) controller.removeGoal(Number(remove.dataset.removeGoal)).then(render);
  if (event.target.id === 'confirm-goal') { event.preventDefault(); controller.setGoal($('#goal-item').value, $('#goal-quantity').value).then(() => { $('#goal-dialog').close(); render(); }); }
});
function editRecipe(recipe) {
  const name = prompt('Nome da receita:', recipe?.name || ''); if (name === null || !name.trim()) return;
  const current = recipe?.ingredients.map(part => `${itemById(part.itemId)?.name || ''}:${part.quantity}`).join(' / ') || '';
  const text = prompt('Ingredientes no formato “Item:quantidade / Item:quantidade”', current); if (text === null) return;
  const target = recipe || { id: `recipe-user-${Date.now()}`, ingredients: [], xp: 0 }; target.name = name.trim();
  target.ingredients = text.split('/').map(value => value.trim()).filter(Boolean).map(value => { const match = value.match(/^(.+):\s*([\d.,]+)$/); if (!match) return null; let material = data.catalog.materials.find(entry => entry.name.toLowerCase() === match[1].trim().toLowerCase()); if (!material) { material = { id: `material-user-${Date.now()}-${data.catalog.materials.length}`, name: match[1].trim(), source: { type: 'none' }, xp: 0 }; data.catalog.materials.push(material); } return { itemId: material.id, quantity: number(match[2].replace(',', '.')) }; }).filter(Boolean);
  if (!recipe) data.catalog.recipes.push(target); controller.commit().then(render);
}
document.addEventListener('change', event => {
  if (event.target.matches('[data-goal]')) { data.planning.goals[Number(event.target.dataset.goal)].quantity = number(event.target.value); controller.commit().then(render); }
  if (event.target.matches('[data-stock]')) controller.setStock(event.target.dataset.stock, event.target.value).then(render);
  if (event.target.matches('[data-gatherrate]')) controller.setGatherRate(event.target.dataset.gatherrate, event.target.value).then(render);
  if (event.target.matches('[data-killrate]')) controller.setKillRate(event.target.dataset.killrate, event.target.value).then(render);
  if (event.target.id === 'loot-quantity') controller.setLoot(event.target.value).then(render);
  if (event.target.id === 'raw-only') renderRequirements();
});
(async () => { data = await window.storage.load(); controller = new window.EvitaniaControllers.PlanningController(data, save); render(); })();
