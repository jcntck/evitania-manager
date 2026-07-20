import type { Act, AppData, Component, Enemy, EntityCategory, Item, Product, Resource } from '../shared/domain';
import { Planner } from '../domain/planner';
import type { PlanningRow } from '../domain/planning-result';

type Page = 'planner' | EntityCategory;
type EditableEntity = Item | Resource | Product | Enemy;

const pages: Array<{ id: Page; icon: string; label: string }> = [
  { id: 'planner', icon: '⌘', label: 'Planejador' }, { id: 'items', icon: '◇', label: 'Itens' },
  { id: 'resources', icon: '♠', label: 'Recursos' }, { id: 'recipes', icon: '⚒', label: 'Receitas' },
  { id: 'smeltery', icon: '♨', label: 'Fundição' }, { id: 'monsters', icon: '♞', label: 'Monstros' },
  { id: 'bosses', icon: '♛', label: 'Chefes' },
];

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] ?? character));
const numberValue = (value: unknown): number => Math.max(0, Number(value) || 0);
const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const formatNumber = (value: number): string => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);

class ApplicationView {
  private data!: AppData;
  private page: Page = 'planner';
  private selectedImage?: string;

  async start(): Promise<void> {
    this.data = await window.desktopApi.load();
    this.renderNavigation();
    this.bindGlobalEvents();
    this.render();
  }

  private renderNavigation(): void {
    this.element('navigation').innerHTML = pages.map((page) => `<button class="nav-button" data-page="${page.id}">
      <span>${page.icon}</span> <span class="nav-label">${page.label}</span></button>`).join('');
  }

  private bindGlobalEvents(): void {
    document.addEventListener('click', (event) => void this.handleClick(event));
    document.addEventListener('change', (event) => void this.handleChange(event));
    this.element('open-folder').addEventListener('click', () => void window.desktopApi.openDataFolder());
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const pageButton = target.closest<HTMLElement>('[data-page]');
    if (pageButton) return this.openPage(pageButton.dataset.page as Page);
    if (target.closest('#create-entity')) return this.openEntityEditor();
    if (target.closest('#add-goal')) return this.openGoalEditor();
    if (target.closest('#pick-image')) return this.pickImage();
    if (target.closest('#remove-image')) return this.removeImage();
    if (target.closest('#add-row')) return this.addRelationRow();
    const closeDialog = target.closest<HTMLElement>('[data-close-dialog]');
    if (closeDialog) return this.element<HTMLDialogElement>(closeDialog.dataset.closeDialog ?? '').close();
    const edit = target.closest<HTMLElement>('[data-edit]');
    if (edit) return this.openEntityEditor(edit.dataset.edit);
    const remove = target.closest<HTMLElement>('[data-remove]');
    if (remove) return this.removeEntity(remove.dataset.remove ?? '');
    const removeGoal = target.closest<HTMLElement>('[data-remove-goal]');
    if (removeGoal) return this.removeGoal(removeGoal.dataset.removeGoal ?? '');
    const rowRemove = target.closest<HTMLElement>('[data-remove-row]');
    if (rowRemove) rowRemove.parentElement?.remove();
  }

  private async handleChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.matches('[data-goal-complete]')) return this.updateGoalCompletion(input as HTMLInputElement);
    if (input.matches('[data-stock]')) return this.updatePlanningMap('stock', input);
    if (input.matches('[data-completed-check]')) return this.updateCompletedEntity(input as HTMLInputElement);
    if (input.matches('[data-source]')) return this.updatePlanningMap('selectedSources', input);
    if (input.matches('[data-rate]')) return this.updateRate(input as HTMLInputElement);
    if (input.id === 'loot-quantity') return this.updateLoot(input as HTMLInputElement);
  }

  private openPage(page: Page): void {
    this.page = page;
    this.render();
  }

  private render(): void {
    document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.page === this.page));
    this.element('page-title').textContent = pages.find((page) => page.id === this.page)?.label ?? '';
    if (this.page === 'planner') this.renderPlanner(); else this.renderCatalog();
  }

  private renderCatalog(): void {
    const entities = this.entitiesForPage();
    this.element('content').innerHTML = `<div class="toolbar"><p>${this.pageDescription()}</p>
      <button id="create-entity" class="button primary">+ Novo cadastro</button></div>
      <div class="catalog-grid">${entities.map((entity) => this.entityCard(entity)).join('')}</div>
      ${entities.length ? '' : '<div class="panel empty">Nenhum cadastro nesta seção.</div>'}`;
  }

  private entitiesForPage(): EditableEntity[] {
    if (this.page === 'items') return this.data.catalog.items;
    if (this.page === 'resources') return this.data.catalog.resources;
    if (this.page === 'monsters') return this.data.catalog.monsters;
    if (this.page === 'bosses') return this.data.catalog.bosses;
    if (this.page === 'recipes') return this.data.catalog.products.filter((product) => product.kind === 'recipe');
    return this.data.catalog.products.filter((product) => product.kind === 'smeltery');
  }

  private pageDescription(): string {
    const descriptions: Partial<Record<Page, string>> = {
      items: 'Materiais brutos compartilhados entre coleta, drops e produção.',
      resources: 'Minérios, troncos e outros itens obtidos por coleta.',
      recipes: 'Produtos fabricados na ferraria e seus componentes.',
      smeltery: 'Produtos processados, componentes e tempo por unidade.',
      monsters: 'Monstros normais, atos e taxas de drop.', bosses: 'Chefes e estimativas de lutas por drop.',
    };
    return descriptions[this.page] ?? '';
  }

  private entityCard(entity: EditableEntity): string {
    const name = this.entityName(entity);
    const details = this.entityDetails(entity);
    return `<article class="card">${this.imageMarkup(entity.image, name)}<div class="card-body">
      <span class="badge">${escapeHtml(this.page.toUpperCase())}</span><h3>${escapeHtml(name)}</h3>
      <p>${details}</p><div class="card-actions"><button class="button" data-edit="${entity.id}">Editar</button>
      <button class="button danger" data-remove="${entity.id}">Excluir</button></div></div></article>`;
  }

  private entityName(entity: EditableEntity): string {
    if ('name' in entity) return entity.name;
    return this.data.catalog.items.find((item) => item.id === entity.itemId)?.name ?? 'Item removido';
  }

  private entityDetails(entity: EditableEntity): string {
    if ('components' in entity) return entity.components.map((component) => `${formatNumber(component.quantity)}× ${escapeHtml(this.nameById(component.entityId))}`).join('<br>') || 'Sem componentes';
    if ('drops' in entity) return entity.drops.map((drop) => `${escapeHtml(this.nameById(drop.itemId))}: ${drop.numerator} em ${drop.denominator}`).join('<br>') || 'Sem drops';
    if ('act' in entity) return `Ato ${entity.act}`;
    return 'Material bruto';
  }

  private imageMarkup(image: string | undefined, name: string): string {
    return image ? `<img class="card-image" src="${escapeHtml(image)}" alt="${escapeHtml(name)}">`
      : `<div class="card-placeholder">◇</div>`;
  }

  private renderPlanner(): void {
    const result = new Planner(this.data).calculate();
    const activeGoals = this.data.planning.goals.filter((goal) => !goal.completed);
    this.element('content').innerHTML = `${result.cycle ? `<div class="cycle">Ciclo detectado: ${result.cycle.join(' → ')}</div>` : ''}
      <div class="planner-top"><section class="panel"><div class="toolbar"><div><p class="eyebrow">OBJETIVOS</p><h2>Lista de produção</h2></div>
      <button id="add-goal" class="button primary" ${this.recipeProducts().length ? '' : 'disabled'}>+ Adicionar</button></div>
      <div class="goals">${this.goalMarkup()}</div></section><section class="panel"><p class="eyebrow">RESUMO</p>
      <div class="stat-grid"><div class="stat"><span>Objetivos ativos</span><strong>${activeGoals.length}</strong></div>
      <div class="stat"><span>Necessidades</span><strong>${result.rows.filter((row) => row.missing > 0).length}</strong></div></div>
      <label class="loot-field">Quantidade de Saque<input id="loot-quantity" type="number" min="0" value="${this.data.planning.lootQuantity}"></label></section></div>
      <section class="panel"><div class="toolbar"><div><p class="eyebrow">CONSOLIDADO</p><h2>Etapas necessárias</h2></div></div>
      ${result.rows.length ? this.requirementsTable(result.rows) : '<div class="empty">Adicione uma receita para começar o planejamento.</div>'}</section>`;
  }

  private goalMarkup(): string {
    if (!this.data.planning.goals.length) return '<div class="empty">Nenhum objetivo cadastrado.</div>';
    return this.data.planning.goals.map((goal) => `<div class="goal ${goal.completed ? 'completed' : ''}">
      <input type="checkbox" data-goal-complete="${goal.id}" ${goal.completed ? 'checked' : ''}>
      <strong>${escapeHtml(this.nameById(goal.productId))}</strong><span>${formatNumber(goal.quantity)} un.</span>
      <button class="button danger" data-remove-goal="${goal.id}">×</button></div>`).join('');
  }

  private requirementsTable(rows: PlanningRow[]): string {
    return `<div class="table-wrap"><table class="requirements"><thead><tr><th>Etapa</th><th>Necessário</th><th>Estoque</th><th>Concluído</th><th>Falta</th><th>Origem e estimativa</th></tr></thead>
      <tbody>${rows.map((row) => this.requirementRow(row)).join('')}</tbody></table></div>`;
  }

  private requirementRow(row: PlanningRow): string {
    const sourceOptions = row.sources.map((source) => `<option value="${source.id}" ${source.id === row.selectedSource?.id ? 'selected' : ''}>${escapeHtml(source.name)}</option>`).join('');
    const rate = row.selectedSource?.kind === 'gather' ? this.data.planning.gatherRates[row.selectedSource.id]
      : this.data.planning.killRates[row.selectedSource?.id ?? ''];
    const rateEditor = ['gather', 'monster'].includes(row.selectedSource?.kind ?? '')
      ? `<input data-rate="${row.selectedSource?.id}" data-rate-kind="${row.selectedSource?.kind}" type="number" min="0" value="${rate ?? 0}" placeholder="por hora">` : '';
    return `<tr><td><span class="badge">${escapeHtml(row.category)}</span>${escapeHtml(row.name)}</td><td>${formatNumber(row.required)}</td>
      <td><input data-stock="${row.entityId}" type="number" min="0" value="${this.data.planning.stock[row.entityId] ?? 0}"></td>
      <td><input data-completed-check="${row.entityId}" data-required="${row.required}" type="checkbox" ${(this.data.planning.completedEntities[row.entityId] ?? 0) >= row.required ? 'checked' : ''}></td>
      <td class="missing">${formatNumber(row.missing)}</td><td>${row.sources.length > 1 ? `<select data-source="${row.entityId}">${sourceOptions}</select>` : escapeHtml(row.selectedSource?.name ?? 'Produção')}
      ${rateEditor}<small>${escapeHtml(this.estimateText(row))}</small></td></tr>`;
  }

  private estimateText(row: PlanningRow): string {
    if (row.category === 'boss') return row.expectedAttempts === undefined ? 'Taxa inválida' : `${formatNumber(row.expectedAttempts)} lutas estimadas`;
    if (row.processingSeconds !== undefined) return this.formatDuration(row.processingSeconds);
    if (row.estimatedHours !== undefined) return `${row.expectedPerHour ? `${formatNumber(row.expectedPerHour)}/h · ` : ''}${this.formatDuration(row.estimatedHours * 3600)}`;
    if (row.category === 'gather' || row.category === 'monster') return 'Informe a taxa por hora';
    return row.missing ? 'Produzir' : 'Concluído';
  }

  private formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}min`, rest && `${rest}s`].filter(Boolean).join(' ') || '0s';
  }

  private openEntityEditor(entityId?: string): void {
    const entity = this.entitiesForPage().find((candidate) => candidate.id === entityId);
    this.selectedImage = entity?.image;
    const form = this.element<HTMLFormElement>('editor-form');
    form.className = 'dialog';
    form.innerHTML = this.editorMarkup(entity);
    form.onsubmit = (event) => void this.submitEntity(event, entityId);
    this.element<HTMLDialogElement>('editor').showModal();
  }

  private editorMarkup(entity?: EditableEntity): string {
    const name = entity ? this.entityName(entity) : '';
    return `<div class="dialog-header"><h2>${entity ? 'Editar' : 'Novo'} cadastro</h2><button class="button" type="button" data-close-dialog="editor">×</button></div>
      ${this.page === 'resources' ? this.resourceFields(entity as Resource | undefined) : `<label>Nome<input name="name" required maxlength="100" value="${escapeHtml(name)}"></label>`}
      ${this.page === 'smeltery' ? `<label>Tempo por unidade<input name="processing" required placeholder="1m 30s" value="${escapeHtml((entity as Product | undefined)?.processingSeconds ?? '')}"></label>` : ''}
      ${['monsters', 'bosses'].includes(this.page) || this.page === 'resources' ? this.actField(entity) : ''}
      ${this.imageField()}${['recipes', 'smeltery'].includes(this.page) ? this.componentFields(entity as Product | undefined) : ''}
      ${['monsters', 'bosses'].includes(this.page) ? this.dropFields(entity as Enemy | undefined) : ''}
      <div class="dialog-actions"><button class="button" type="button" data-close-dialog="editor">Cancelar</button><button class="button primary" type="submit">Salvar</button></div>`;
  }

  private resourceFields(resource?: Resource): string {
    return `<label>Item<select name="itemId" required>${this.data.catalog.items.map((item) => `<option value="${item.id}" ${item.id === resource?.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>`;
  }

  private actField(entity?: EditableEntity): string {
    const current = entity && 'act' in entity ? entity.act : 'I';
    return `<label>Ato<select name="act">${(['I', 'II', 'III'] as Act[]).map((act) => `<option ${current === act ? 'selected' : ''}>${act}</option>`).join('')}</select></label>`;
  }

  private imageField(): string {
    return `<div class="image-picker">${this.selectedImage ? `<img class="image-preview" src="${escapeHtml(this.selectedImage)}" alt="Prévia">` : '<div class="image-preview card-placeholder">◇</div>'}
      <button id="pick-image" class="button" type="button">Selecionar imagem</button>
      ${this.selectedImage ? '<button id="remove-image" class="button danger" type="button">Remover</button>' : ''}</div>`;
  }

  private componentFields(product?: Product): string {
    const rows = product?.components.map((component) => this.componentRow(component)).join('') ?? '';
    return `<div class="toolbar"><strong>Componentes</strong><button id="add-row" class="button" type="button">+ Componente</button></div><div id="relation-rows" class="form-list">${rows}</div>`;
  }

  private componentRow(component?: Component): string {
    const entities = [...this.data.catalog.items, ...this.data.catalog.products].filter((entity) => entity.id !== component?.entityId || true);
    return `<div class="form-row components"><select data-relation-id>${entities.map((entity) => `<option value="${entity.id}" ${entity.id === component?.entityId ? 'selected' : ''}>${escapeHtml(entity.name)}</option>`).join('')}</select>
      <input data-relation-quantity type="number" min="0.0001" step="any" value="${component?.quantity ?? 1}"><button type="button" class="button danger" data-remove-row>×</button></div>`;
  }

  private dropFields(enemy?: Enemy): string {
    const rows = enemy?.drops.map((drop) => this.dropRow(drop)).join('') ?? '';
    return `<div class="toolbar"><strong>Drops</strong><button id="add-row" class="button" type="button">+ Drop</button></div><div id="relation-rows" class="form-list">${rows}</div>`;
  }

  private dropRow(drop?: Enemy['drops'][number]): string {
    return `<div class="form-row"><select data-relation-id>${this.data.catalog.items.map((item) => `<option value="${item.id}" ${item.id === drop?.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>
      <input data-numerator type="number" min="1" value="${drop?.numerator ?? 1}"><input data-denominator type="number" min="1" value="${drop?.denominator ?? 1}">
      <button type="button" class="button danger" data-remove-row>×</button></div>`;
  }

  private async pickImage(): Promise<void> {
    const category = this.page as EntityCategory;
    this.selectedImage = await window.desktopApi.selectImage(category) ?? this.selectedImage;
    const picker = document.querySelector('.image-picker');
    if (picker) picker.outerHTML = this.imageField();
  }

  private removeImage(): void {
    this.selectedImage = undefined;
    const picker = document.querySelector('.image-picker');
    if (picker) picker.outerHTML = this.imageField();
  }

  private addRelationRow(): void {
    const list = this.element('relation-rows');
    list.insertAdjacentHTML('beforeend', ['monsters', 'bosses'].includes(this.page) ? this.dropRow() : this.componentRow());
  }

  private async submitEntity(event: SubmitEvent, entityId?: string): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const entity = this.buildEntity(values, entityId);
    if (!entity) return this.notify('Preencha os relacionamentos obrigatórios.');
    if (entity && 'components' in entity && this.createsCycle(entity)) {
      return this.notify('Este relacionamento criaria um ciclo de produção.');
    }
    this.upsertEntity(entity);
    await this.persist();
    this.element<HTMLDialogElement>('editor').close();
    this.render();
  }

  private buildEntity(values: FormData, entityId?: string): EditableEntity | null {
    const id = entityId ?? createId(this.page);
    if (this.page === 'items') return { id, name: String(values.get('name')).trim(), image: this.selectedImage };
    if (this.page === 'resources') return { id, itemId: String(values.get('itemId')), act: String(values.get('act')) as Act, image: this.selectedImage };
    if (this.page === 'recipes' || this.page === 'smeltery') return this.buildProduct(id, values);
    return this.buildEnemy(id, values);
  }

  private buildProduct(id: string, values: FormData): Product | null {
    const components = [...document.querySelectorAll<HTMLElement>('.form-row')].map((row) => ({
      entityId: row.querySelector<HTMLSelectElement>('[data-relation-id]')?.value ?? '',
      quantity: numberValue(row.querySelector<HTMLInputElement>('[data-relation-quantity]')?.value),
    })).filter((component) => component.entityId && component.quantity > 0);
    if (!components.length) return null;
    return { id, name: String(values.get('name')).trim(), image: this.selectedImage,
      kind: this.page === 'smeltery' ? 'smeltery' : 'recipe', components,
      processingSeconds: this.page === 'smeltery' ? this.parseDuration(String(values.get('processing'))) : undefined };
  }

  private buildEnemy(id: string, values: FormData): Enemy | null {
    const drops = [...document.querySelectorAll<HTMLElement>('.form-row')].map((row) => ({
      itemId: row.querySelector<HTMLSelectElement>('[data-relation-id]')?.value ?? '',
      numerator: numberValue(row.querySelector<HTMLInputElement>('[data-numerator]')?.value),
      denominator: numberValue(row.querySelector<HTMLInputElement>('[data-denominator]')?.value),
    })).filter((drop) => drop.itemId && drop.numerator > 0 && drop.denominator > 0);
    const uniqueDrops = new Map(drops.map((drop) => [drop.itemId, drop]));
    return { id, name: String(values.get('name')).trim(), act: String(values.get('act')) as Act,
      image: this.selectedImage, drops: [...uniqueDrops.values()] };
  }

  private parseDuration(value: string): number {
    if (/^\d+(\.\d+)?$/.test(value.trim())) return numberValue(value);
    const clock = value.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (clock) return numberValue(clock[1]) * 60 + numberValue(clock[2]) + numberValue(clock[3]);
    const units = [...value.matchAll(/([\d.]+)\s*([dhms])/gi)];
    return units.reduce((total, match) => total + numberValue(match[1]) * ({ d: 86400, h: 3600, m: 60, s: 1 }[match[2].toLowerCase()] ?? 0), 0);
  }

  private upsertEntity(entity: EditableEntity): void {
    const collection = this.collectionForPage();
    const index = collection.findIndex((candidate) => candidate.id === entity.id);
    if (index >= 0) collection[index] = entity; else collection.push(entity);
  }

  private createsCycle(candidate: Product): boolean {
    const products = new Map(this.data.catalog.products.map((product) => [product.id, product]));
    products.set(candidate.id, candidate);
    const visit = (id: string, trail: Set<string>): boolean => {
      if (trail.has(id)) return true;
      const product = products.get(id);
      if (!product) return false;
      const next = new Set(trail).add(id);
      return product.components.some((component) => visit(component.entityId, next));
    };
    return visit(candidate.id, new Set());
  }

  private collectionForPage(): EditableEntity[] {
    if (this.page === 'items') return this.data.catalog.items;
    if (this.page === 'resources') return this.data.catalog.resources;
    if (this.page === 'monsters') return this.data.catalog.monsters;
    if (this.page === 'bosses') return this.data.catalog.bosses;
    return this.data.catalog.products;
  }

  private async removeEntity(entityId: string): Promise<void> {
    if (this.isReferenced(entityId)) return this.notify('Remova as associações antes de excluir este cadastro.');
    if (!confirm('Excluir este cadastro?')) return;
    const collection = this.collectionForPage();
    const index = collection.findIndex((entity) => entity.id === entityId);
    if (index < 0) return;
    collection.splice(index, 1);
    await this.persist();
    this.render();
  }

  private isReferenced(entityId: string): boolean {
    return this.data.catalog.products.some((product) => product.components.some((component) => component.entityId === entityId))
      || [...this.data.catalog.monsters, ...this.data.catalog.bosses].some((enemy) => enemy.drops.some((drop) => drop.itemId === entityId))
      || this.data.catalog.resources.some((resource) => resource.itemId === entityId)
      || this.data.planning.goals.some((goal) => goal.productId === entityId);
  }

  private openGoalEditor(): void {
    const form = this.element<HTMLFormElement>('goal-form');
    form.className = 'dialog';
    form.innerHTML = `<div class="dialog-header"><h2>Adicionar objetivo</h2><button class="button" type="button" data-close-dialog="goal-editor">×</button></div>
      <label>Receita<select name="productId">${this.recipeProducts().map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('')}</select></label>
      <label>Quantidade<input name="quantity" type="number" min="1" value="1" required></label>
      <div class="dialog-actions"><button class="button" type="button" data-close-dialog="goal-editor">Cancelar</button><button class="button primary" type="submit">Adicionar</button></div>`;
    form.onsubmit = (event) => void this.submitGoal(event);
    this.element<HTMLDialogElement>('goal-editor').showModal();
  }

  private async submitGoal(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    this.data.planning.goals.push({ id: createId('goal'), productId: String(values.get('productId')),
      quantity: numberValue(values.get('quantity')), completed: false });
    await this.persist();
    this.element<HTMLDialogElement>('goal-editor').close();
    this.render();
  }

  private async removeGoal(goalId: string): Promise<void> {
    this.data.planning.goals = this.data.planning.goals.filter((goal) => goal.id !== goalId);
    await this.persist();
    this.render();
  }

  private async updateGoalCompletion(input: HTMLInputElement): Promise<void> {
    const goal = this.data.planning.goals.find((goal) => goal.id === input.dataset.goalComplete);
    if (goal) goal.completed = input.checked;
    await this.persistAndRender();
  }

  private async updatePlanningMap(key: 'stock' | 'completedEntities' | 'selectedSources', input: HTMLInputElement | HTMLSelectElement): Promise<void> {
    const entityId = input.dataset.stock ?? input.dataset.source ?? '';
    if (key === 'selectedSources') this.data.planning[key][entityId] = input.value;
    else this.data.planning[key][entityId] = numberValue(input.value);
    await this.persistAndRender();
  }

  private async updateCompletedEntity(input: HTMLInputElement): Promise<void> {
    const entityId = input.dataset.completedCheck ?? '';
    this.data.planning.completedEntities[entityId] = input.checked ? numberValue(input.dataset.required) : 0;
    await this.persistAndRender();
  }

  private async updateRate(input: HTMLInputElement): Promise<void> {
    const key = input.dataset.rateKind === 'gather' ? 'gatherRates' : 'killRates';
    this.data.planning[key][input.dataset.rate ?? ''] = numberValue(input.value);
    await this.persistAndRender();
  }

  private async updateLoot(input: HTMLInputElement): Promise<void> {
    this.data.planning.lootQuantity = numberValue(input.value);
    await this.persistAndRender();
  }

  private async persistAndRender(): Promise<void> {
    await this.persist();
    this.render();
  }

  private async persist(): Promise<void> {
    this.element('save-status').textContent = 'Salvando…';
    await window.desktopApi.save(this.data);
    this.element('save-status').textContent = 'Salvo localmente';
  }

  private recipeProducts(): Product[] {
    return this.data.catalog.products.filter((product) => product.kind === 'recipe');
  }

  private nameById(entityId: string): string {
    return [...this.data.catalog.items, ...this.data.catalog.products].find((entity) => entity.id === entityId)?.name ?? 'Registro removido';
  }

  private notify(message: string): void {
    const toast = this.element('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing element: ${id}`);
    return element as T;
  }
}

void new ApplicationView().start();
