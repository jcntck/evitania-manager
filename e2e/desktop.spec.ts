import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const directories: string[] = [];
const applications: ElectronApplication[] = [];

const launch = async (
  folderMode: 'success' | 'denied',
  options: {
    userData?: string;
    imageSequence?: readonly (string | null)[];
  } = {},
): Promise<{
  application: ElectronApplication;
  userData: string;
}> => {
  const userData = options.userData ?? await mkdtemp(join(tmpdir(), 'evitania-e2e-'));
  if (!options.userData) directories.push(userData);
  const application = await electron.launch({
    args: ['.', '--headless', '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      EVITANIA_E2E_USER_DATA: userData,
      EVITANIA_E2E_FOLDER_MODE: folderMode,
      ...(options.imageSequence
        ? { EVITANIA_E2E_IMAGE_SEQUENCE: JSON.stringify(options.imageSequence) }
        : {}),
    },
  });
  applications.push(application);
  return { application, userData };
};

const closeApplication = async (application: ElectronApplication): Promise<void> => {
  const index = applications.indexOf(application);
  if (index >= 0) applications.splice(index, 1);
  await application.close();
};

const openCatalog = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  category: string,
): Promise<void> => {
  await page.locator(`[data-page="${category}"]`).click();
  await expect(page.locator('#catalog-root')).toBeVisible();
};

const createItem = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  name: string,
): Promise<void> => {
  await openCatalog(page, 'items');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill(name);
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(page.locator('.catalog-card').filter({ hasText: name })).toBeVisible();
};

const selectRelation = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  name: string,
): Promise<void> => {
  await page.locator('[data-role="relation-search"]').fill(name);
  await page.locator('[role="option"]', { hasText: name }).click();
};

const createResource = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  itemName: string,
): Promise<void> => {
  await openCatalog(page, 'resources');
  await page.locator('[data-action="catalog-create"]').first().click();
  await selectRelation(page, itemName);
  await page.locator('[name="act"]').selectOption('I');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
};

const createRecipe = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  name: string,
  components: readonly string[],
): Promise<void> => {
  await openCatalog(page, 'recipes');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill(name);
  for (const component of components) await selectRelation(page, component);
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
};

const addGoal = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  recipe: string,
  quantity = 1,
): Promise<void> => {
  await page.locator('[data-page="planner"]').click();
  await page.locator('[data-action="goal-create"]').click();
  await page.locator('[data-role="goal-form"] select').selectOption({ label: recipe });
  await page.locator('[data-role="goal-form"] [name="quantity"]').fill(String(quantity));
  await page.locator('[data-role="goal-form"]').getByRole('button', { name: 'Salvar objetivo' }).click();
  await expect(page.locator('.objective-row').filter({ hasText: recipe })).toBeVisible();
};

const prepareSharedPlan = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
): Promise<void> => {
  await createItem(page, 'Minério Planejado');
  await createItem(page, 'Carvão sem origem');
  await createResource(page, 'Minério Planejado');
  await createRecipe(page, 'Lâmina Prioritária', ['Minério Planejado', 'Carvão sem origem']);
  await createRecipe(page, 'Escudo Secundário', ['Minério Planejado']);
  await addGoal(page, 'Lâmina Prioritária');
  await addGoal(page, 'Escudo Secundário');
};

const uuidFor = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

const writeScaleFixture = async (userData: string): Promise<void> => {
  const itemCount = 4_601;
  const productCount = 399;
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: uuidFor(index + 1),
    name: index === itemCount - 1 ? 'Material Pesquisável Único' : `Material ${index}`,
  }));
  const products = Array.from({ length: productCount }, (_, index) => ({
    id: uuidFor(10_000 + index),
    name: `Receita em cadeia ${index}`,
    kind: 'recipe' as const,
    components: [{
      entityId: index === 0 ? items[0].id : uuidFor(10_000 + index - 1),
      quantity: 1,
    }],
  }));
  const goals = Array.from({ length: 50 }, (_, index) => ({
    id: uuidFor(20_000 + index),
    productId: products.at(-1)!.id,
    quantity: 1,
    completed: false,
    priority: index,
  }));
  const data = {
    version: 2 as const,
    catalog: { items, resources: [], products, monsters: [], bosses: [] },
    planning: {
      goals,
      stock: {},
      gatherRates: {},
      killRates: {},
      lootQuantity: 0,
      selectedSources: {},
      completionCredits: [],
    },
  };
  await writeFile(join(userData, 'evitania-data.json'), `${JSON.stringify({
    schemaVersion: 2,
    revision: 1,
    writtenAt: '2026-07-25T12:00:00.000Z',
    data,
  })}\n`, 'utf8');
};

test.afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close().catch(() => undefined)));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('E2E-001 first-use catalog edit and created plan persist across an offline restart', async () => {
  const launched = await launch('success');
  let application = launched.application;
  let page = await application.firstWindow();
  await expect(page.locator('.catalog-card').first()).not.toBeVisible();
  await createItem(page, 'Persistência Offline');
  await createRecipe(page, 'Receita Persistente', ['Persistência Offline']);
  await addGoal(page, 'Receita Persistente', 3);
  await expect(page.locator('.objective-row').filter({ hasText: 'Receita Persistente' }))
    .toContainText('Quantidade: 3');

  await closeApplication(application);
  ({ application } = await launch('success', { userData: launched.userData }));
  page = await application.firstWindow();
  await expect(page.locator('.objective-row').filter({ hasText: 'Receita Persistente' }))
    .toContainText('Quantidade: 3');
  await openCatalog(page, 'items');
  await expect(page.locator('.catalog-card').filter({ hasText: 'Persistência Offline' })).toBeVisible();
});

test('E2E-007 full planner reconciles objective trees, consolidation, sources, rates, and states', async () => {
  const { application } = await launch('success');
  const page = await application.firstWindow();
  await prepareSharedPlan(page);

  await expect(page.locator('.objective-tree')).toHaveCount(2);
  await expect(page.locator('.objective-tree').filter({ hasText: 'Lâmina Prioritária' }))
    .toContainText('Minério Planejado');
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  await expect(page.locator('.consolidated-row').filter({ hasText: 'Minério Planejado' }))
    .toHaveCount(1);
  await expect(page.locator('.consolidated-row').filter({ hasText: 'Carvão sem origem' }))
    .toContainText('Não resolvido');
  const ore = page.locator('.consolidated-row').filter({ hasText: 'Minério Planejado' });
  await expect(ore).toContainText('Não calculável');
  await ore.locator('[data-role="gather-rate"]').fill('12');
  await ore.locator('[data-role="gather-rate"]').dispatchEvent('change');
  await expect(ore).toContainText('Tempo estimado');
  await expect(page.locator('#save-status')).toHaveText('Salvo localmente');
  await page.locator('[data-role="loot-quantity"]').fill('25');
  await page.locator('[data-role="loot-quantity"]').dispatchEvent('change');
  await expect(page.locator('[data-role="loot-quantity"]')).toHaveValue('25');
  await expect(page.locator('.planner-badge-item').first()).toHaveAttribute('aria-label', 'Categoria: Item');
});

test('E2E-008 stock reallocation and exact completion credit survive restart and block unsafe undo', async () => {
  const launched = await launch('success');
  let application = launched.application;
  let page = await application.firstWindow();
  await prepareSharedPlan(page);
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  const ore = page.locator('.consolidated-row').filter({ hasText: 'Minério Planejado' });
  await ore.locator('[data-role="stock"]').fill('1');
  await ore.locator('[data-role="stock"]').dispatchEvent('change');
  await page.getByRole('tab', { name: 'Árvores por objetivo' }).click();
  await expect(page.locator('.objective-tree').filter({ hasText: 'Lâmina Prioritária' }))
    .toContainText('Do estoque: 1');
  const secondary = page.locator('.objective-row').filter({ hasText: 'Escudo Secundário' });
  await secondary.getByRole('button', { name: 'Mover para cima' }).click();
  await expect(page.locator('.objective-tree').first()).toContainText('Escudo Secundário');

  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  const updatedOre = page.locator('.consolidated-row').filter({ hasText: 'Minério Planejado' });
  await updatedOre.getByRole('button', { name: 'Creditar como adquirido' }).click();
  await expect(page.locator('.credit-list')).toContainText('Minério Planejado: +1');
  await closeApplication(application);

  ({ application } = await launch('success', { userData: launched.userData }));
  page = await application.firstWindow();
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  await expect(page.locator('.credit-list')).toContainText('Minério Planejado: +1');
  const restartedOre = page.locator('.consolidated-row').filter({ hasText: 'Minério Planejado' });
  await restartedOre.locator('[data-role="stock"]').fill('0');
  await restartedOre.locator('[data-role="stock"]').dispatchEvent('change');
  await page.getByRole('button', { name: 'Desfazer crédito exato' }).click();
  await expect(page.locator('#toast')).toContainText('estoque atual é menor');
  await expect(page.locator('.credit-list')).toContainText('Minério Planejado: +1');
  await restartedOre.locator('[data-role="stock"]').fill('1');
  await restartedOre.locator('[data-role="stock"]').dispatchEvent('change');
  await page.getByRole('button', { name: 'Desfazer crédito exato' }).click();
  await expect(page.locator('.credit-list')).toHaveCount(0);
});

test('E2E-009 keyboard-only navigation and planner controls remain operable when narrow and enlarged', async () => {
  const { application } = await launch('success');
  const page = await application.firstWindow();
  await page.setViewportSize({ width: 560, height: 760 });
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5);
  });
  await createItem(page, 'Nome integral acessível');
  await createRecipe(page, 'Receita acessível de nome integral', ['Nome integral acessível']);
  await addGoal(page, 'Receita acessível de nome integral');
  await page.locator('.objective-row').getByRole('button', { name: 'Editar' }).click();
  await page.locator('[data-role="goal-form"] [name="quantity"]').fill('7');
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  await expect(page.locator('[data-role="goal-form"] [name="quantity"]')).toHaveValue('7');
  await page.locator('[data-action="goal-cancel"]').click();
  const plannerNav = page.locator('[data-page="planner"]');
  await plannerNav.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-page="recipes"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(plannerNav).toBeFocused();
  await expect(plannerNav).toHaveAttribute('aria-current', 'page');
  await page.getByRole('tab', { name: 'Árvores por objetivo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Árvores por objetivo' })).toHaveAttribute('aria-selected', 'true');
  const treeToggle = page.locator('[data-action="tree-toggle"]').first();
  await treeToggle.focus();
  await page.keyboard.press('Enter');
  await expect(treeToggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Trabalho consolidado' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[title="Nome integral acessível"]')).toContainText('Nome integral acessível');
  await expect(page.locator('.status-cue').first()).not.toHaveText('');
});

test('E2E-011 5,000 records, 50 goals, and 20,000 nodes render/search/collapse below 500 ms', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'evitania-e2e-scale-'));
  directories.push(userData);
  await writeScaleFixture(userData);
  const { application } = await launch('success', { userData });
  const page = await application.firstWindow();
  await expect(page.locator('.planner-summary')).toContainText('50 objetivos pendentes · 20000 nós calculados');
  await expect(page.locator('.objective-tree')).toHaveCount(50);
  await page.locator('[data-page="recipes"]').click();
  const catalogSearchStarted = Date.now();
  await page.locator('[data-role="catalog-search"]').fill('Receita em cadeia 398');
  const topRecipe = page.locator('.catalog-card').filter({ hasText: 'Receita em cadeia 398' });
  await expect(topRecipe).toHaveCount(1);
  expect(Date.now() - catalogSearchStarted).toBeLessThan(500);
  await topRecipe.getByRole('button', { name: 'Editar' }).click();
  const relationSearchStarted = Date.now();
  await page.locator('[data-role="relation-search"]').fill('Material Pesquisável Único');
  await expect(page.locator('[role="option"]', { hasText: 'Material Pesquisável Único' })).toHaveCount(1);
  expect(Date.now() - relationSearchStarted).toBeLessThan(500);
  await page.locator('[data-action="catalog-cancel"]').last().click();
  await page.locator('[data-page="planner"]').click();
  const collapseDuration = await page.locator('[data-action="tree-toggle"]').first().evaluate((control) => {
    const started = performance.now();
    (control as HTMLButtonElement).click();
    return performance.now() - started;
  });
  expect(collapseDuration).toBeLessThan(500);
  const renderStarted = Date.now();
  await page.getByRole('tab', { name: 'Trabalho consolidado' }).click();
  await expect(page.locator('.consolidated-count')).toContainText('400 de 400');
  expect(Date.now() - renderStarted).toBeLessThan(500);
  const searchStarted = Date.now();
  await page.locator('[data-role="consolidated-search"]').fill('Material 0');
  await expect(page.locator('.consolidated-row')).toHaveCount(1);
  expect(Date.now() - searchStarted).toBeLessThan(500);
  await expect(page.locator('.window-notice')).toHaveCount(0);
});

test('E2E-002 synchronization remains disabled and folder denial is actionable', async () => {
  const { application } = await launch('denied');
  const page = await application.firstWindow();
  await expect(page.locator('#sync')).toBeDisabled();
  await page.locator('#open-folder').click();
  await expect(page.locator('#toast')).toContainText('Não foi possível');
  await expect(page.locator('[data-page="planner"]')).toBeVisible();
  await page.locator('[data-page="items"]').click();
  await expect(page.locator('#page-title')).toHaveText('Itens');
});

test('E2E-010 stale save preserves candidate until explicit reload shows current persisted data', async () => {
  const { application, userData } = await launch('success');
  const page = await application.firstWindow();
  await expect(page.locator('#loot-quantity')).toBeVisible();
  const storagePath = join(userData, 'evitania-data.json');
  const envelope = JSON.parse(await readFile(storagePath, 'utf8')) as {
    revision: number;
    writtenAt: string;
    data: { catalog: { items: Array<{ name: string }> } };
  };
  envelope.revision += 1;
  envelope.writtenAt = new Date().toISOString();
  envelope.data.catalog.items[0].name = 'External Current';
  await writeFile(storagePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');

  await page.locator('#loot-quantity').fill('37');
  await page.locator('#loot-quantity').dispatchEvent('change');
  await expect(page.locator('#save-status')).toContainText('Conflito');
  await expect(page.locator('#reload-conflict')).toBeVisible();
  await expect(page.locator('#loot-quantity')).toHaveValue('37');

  await page.locator('#reload-conflict').click();
  await expect(page.locator('#reload-conflict')).toBeHidden();
  await page.locator('[data-page="items"]').click();
  await expect(page.locator('#content')).toContainText('External Current');
});

test('E2E-003 managed image preview/save/restart/replace-cancel/remove preserves committed reference', async () => {
  const imagePath = join(process.cwd(), 'assets', 'app', 'icon.png');
  const launched = await launch('success', { imageSequence: [imagePath] });
  let application = launched.application;
  let page = await application.firstWindow();
  await openCatalog(page, 'items');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Item com Imagem');
  await page.locator('[data-action="catalog-image"]').click();
  const preview = page.locator('.image-preview');
  await expect(preview).toHaveAttribute('src', /^asset:\/\/items\//);
  const committedReference = await preview.getAttribute('src');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();

  await closeApplication(application);
  ({ application } = await launch('success', {
    userData: launched.userData,
    imageSequence: [imagePath, null],
  }));
  page = await application.firstWindow();
  await openCatalog(page, 'items');
  const card = page.locator('.catalog-card').filter({ hasText: 'Item com Imagem' });
  await expect(card.locator('img')).toHaveAttribute('src', committedReference!);

  await card.locator('[data-action="catalog-edit"]').click();
  await page.locator('[data-action="catalog-image"]').click();
  await expect.poll(() => page.locator('.image-picker img').getAttribute('src'))
    .not.toBe(committedReference);
  await page.locator('[data-action="catalog-cancel"]').last().click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await card.locator('[data-action="catalog-edit"]').click();
  await expect(page.locator('.image-picker img')).toHaveAttribute('src', committedReference!);

  await page.locator('[data-action="catalog-image"]').click();
  await expect(page.locator('.image-picker img')).toHaveAttribute('src', committedReference!);
  await page.locator('[data-action="catalog-image-remove"]').click();
  await expect(page.locator('.image-picker img')).toHaveCount(0);
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card).toContainText('Sem imagem');
});

test('E2E-004 creates catalog relationships, edits them, and blocks referenced item deletion', async () => {
  const { application } = await launch('success');
  const page = await application.firstWindow();
  await createItem(page, 'Fragmento Relacional');

  await openCatalog(page, 'resources');
  await page.locator('[data-action="catalog-create"]').first().click();
  await selectRelation(page, 'Fragmento Relacional');
  await page.locator('[name="act"]').selectOption('II');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(page.locator('.catalog-card').filter({ hasText: 'Fragmento Relacional' })).toContainText('Ato II');

  for (const category of ['monsters', 'bosses']) {
    await openCatalog(page, category);
    await page.locator('[data-action="catalog-create"]').first().click();
    await page.locator('[name="name"]').fill(category === 'monsters' ? 'Guardião Novo' : 'Soberano Novo');
    await page.locator('[name="act"]').selectOption('III');
    await selectRelation(page, 'Fragmento Relacional');
    await page.locator('[data-action="catalog-save"]').click();
    await expect(page.locator('[role="dialog"]')).toBeHidden();
    const name = category === 'monsters' ? 'Guardião Novo' : 'Soberano Novo';
    const card = page.locator('.catalog-card').filter({ hasText: name });
    await expect(card).toContainText('1 em 1');
    await card.locator('[data-action="catalog-edit"]').click();
    await page.locator('[name="name"]').fill(`${name} Editado`);
    await page.locator('[data-action="catalog-save"]').click();
    await expect(page.locator('.catalog-card').filter({ hasText: `${name} Editado` })).toBeVisible();
  }

  await openCatalog(page, 'items');
  const item = page.locator('.catalog-card').filter({ hasText: 'Fragmento Relacional' });
  await item.locator('[data-action="catalog-delete"]').click();
  await expect(page.locator('#toast')).toContainText('associações');
  await expect(item).toBeVisible();
});

test('E2E-005 creates recipe/smelting multicomponents and rejects a cross-type cycle', async () => {
  const { application } = await launch('success');
  const page = await application.firstWindow();
  await createItem(page, 'Componente Alfa');
  await createItem(page, 'Componente Beta');

  await openCatalog(page, 'recipes');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Receita Cíclica');
  await selectRelation(page, 'Componente Alfa');
  await selectRelation(page, 'Componente Beta');
  const quantities = page.locator('[data-component-quantity]');
  await expect(quantities).toHaveCount(2);
  await quantities.nth(0).fill('2');
  await quantities.nth(1).fill('3');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();

  await openCatalog(page, 'smelting');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Fundição Cíclica');
  await page.locator('[name="processingSeconds"]').fill('1m 30s');
  await selectRelation(page, 'Receita Cíclica');
  await selectRelation(page, 'Componente Beta');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(page.locator('.catalog-card').filter({ hasText: 'Fundição Cíclica' }))
    .toContainText('1m 30s');

  await openCatalog(page, 'recipes');
  const recipe = page.locator('.catalog-card').filter({ hasText: 'Receita Cíclica' });
  await recipe.locator('[data-action="catalog-edit"]').click();
  await selectRelation(page, 'Fundição Cíclica');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('#toast')).toContainText('Ciclo de produção');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.locator('[data-action="catalog-cancel"]').last().click();
  await expect(recipe).toContainText('Componente Alfa');
  await expect(recipe).not.toContainText('Fundição Cíclica');
});

test('E2E-006 inline no-match cancel/success preserves parent, selects child, and restores focus', async () => {
  const { application } = await launch('success');
  const page = await application.firstWindow();
  await openCatalog(page, 'recipes');
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Receita Pai E2E');
  await page.locator('[data-role="relation-search"]').fill('Dependência Inline');
  await expect(page.getByText('Nenhum resultado encontrado.')).toBeVisible();
  const createInlineItem = page.locator('[data-action="relation-create"][data-create-kind="items"]');
  await expect(createInlineItem).toBeVisible();
  await createInlineItem.click();
  await expect(page.locator('.nested')).toBeVisible();
  await page.locator('[data-action="child-cancel"]').click();
  await expect(page.locator('.nested')).toBeHidden();
  await expect(page.locator('[name="name"]')).toHaveValue('Receita Pai E2E');

  await createInlineItem.click();
  await page.locator('[data-action="child-save"]').click();
  await expect(page.locator('.nested')).toBeHidden();
  await expect(page.locator('.form-list')).toContainText('Dependência Inline');
  await expect(page.locator('[data-role="relation-search"]')).toBeFocused();
  await expect(page.locator('[name="name"]')).toHaveValue('Receita Pai E2E');

  await page.locator('[data-role="relation-search"]').fill('Produto Inline');
  await page.locator('[data-action="relation-create"][data-create-kind="recipes"]').click();
  await expect(page.locator('.nested')).toContainText('Criar receita relacionado');
  await page.locator('.child-relation-picker-root [data-role="relation-search"]').fill('Minério');
  await page.locator('.child-relation-picker-root [role="option"]', { hasText: 'Minério' }).first().click();
  await page.locator('[data-action="child-save"]').click();
  await expect(page.locator('.nested')).toBeHidden();
  await expect(page.locator('.form-list')).toContainText('Produto Inline');
  await expect(page.locator('[data-role="relation-search"]')).toBeFocused();
});
