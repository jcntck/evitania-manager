---
name: code-standards
description: Aplicar e revisar os padrões de código TypeScript deste projeto Electron, incluindo uso do inglês no código, nomenclatura, organização de interfaces e classes, arquitetura MVC, limites de métodos e testes unitários com Vitest. Usar ao criar, alterar, refatorar ou revisar código e testes do projeto.
---

# Padrões de código

Aplicar estas regras em todo código novo ou alterado. Ao trabalhar em código legado, melhorar somente o trecho relacionado à tarefa, evitando refatorações fora do escopo.

## Usar TypeScript

- Escrever código-fonte e testes em TypeScript.
- Declarar tipos explícitos nas fronteiras do sistema, como parâmetros, retornos, IPC, serviços e repositórios.
- Evitar `any`; usar tipos específicos ou `unknown` com validação.

Errado:

```ts
function loadUser(data: any) {
  return data.user;
}
```

Certo:

```ts
interface UserPayload {
  user: User;
}

function loadUser(data: UserPayload): User {
  return data.user;
}
```

## Escrever todo o código em inglês

- Escrever em inglês nomes de arquivos, variáveis, funções, métodos, classes, interfaces, tipos e constantes.
- Escrever em inglês comentários, mensagens técnicas, logs, nomes e descrições de testes e documentação interna ao código.
- Manter em outro idioma somente textos destinados à interface do usuário, conforme o idioma definido para o produto.
- Não derivar nomes de código do idioma exibido pela interface; usar termos equivalentes em inglês.

## Usar nomes claros

- Nomear variáveis, funções, classes e arquivos pela responsabilidade ou pelo valor representado.
- Preferir nomes completos a abreviações obscuras.
- Usar verbos para funções e métodos; usar substantivos para valores, classes e interfaces.
- Evitar nomes genéricos como `data`, `item`, `obj`, `temp`, `x` e `doStuff` quando houver uma alternativa específica.

Errado:

```ts
const d = await repo.get(id);
const x = d.filter((i) => i.a);
```

Certo:

```ts
const registeredUsers = await userRepository.findByCompanyId(companyId);
const activeUsers = registeredUsers.filter((user) => user.isActive);
```

## Manter uma interface por arquivo

- Declarar cada interface em um arquivo próprio.
- Nomear o arquivo de acordo com a interface, seguindo a convenção já usada no diretório.
- Importar a interface onde ela for necessária.
- Não usar interfaces como agrupamento genérico de tipos não relacionados.

Errado — `user-types.ts`:

```ts
export interface User {
  id: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
}
```

Certo — `user.ts`:

```ts
export interface User {
  id: string;
}
```

Certo — `user-repository.ts`:

```ts
import type { User } from './user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
}
```

## Criar classes com responsabilidade única

- Fazer cada classe ter um único motivo para mudar.
- Separar acesso a dados, regras de negócio, apresentação e integração com Electron.
- Injetar dependências quando isso facilitar isolamento e testes.
- Extrair uma nova classe quando a descrição da classe exigir “e” para explicar sua responsabilidade.

Errado:

```ts
class UserManager {
  async saveUser(user: User): Promise<void> { /* persiste */ }
  validateUser(user: User): boolean { /* valida */ return true; }
  showNotification(user: User): void { /* usa Electron */ }
}
```

Certo:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(user: User): Promise<void> {
    await this.userRepository.save(user);
  }
}

class UserNotificationView {
  showCreated(user: User): void {
    new Notification({ title: `Usuário ${user.name} criado` }).show();
  }
}
```

## Seguir a arquitetura MVC

- Manter regras de negócio e estado do domínio no Model.
- Coordenar casos de uso e traduzir ações da View no Controller.
- Manter renderização, interação de interface e APIs específicas do Electron na View.
- Dar ao Electron forte presença na camada View: `BrowserWindow`, menus, diálogos, notificações, tray e manipulação visual pertencem à View.
- Tratar handlers IPC como adaptadores de entrada: validar a mensagem e delegar ao Controller; não implementar regra de negócio neles.
- Não importar Electron no Model.

Fluxo esperado:

```text
View (Electron) -> Controller -> Model/serviços
View (Electron) <- Controller <- Model/serviços
```

Errado:

```ts
ipcMain.handle('invoice:create', async (_event, input) => {
  const total = input.items.reduce((sum, item) => sum + item.price, 0);
  await database.insert({ ...input, total });
  dialog.showMessageBox({ message: 'Fatura criada' });
});
```

Certo — adaptador/View Electron:

```ts
ipcMain.handle('invoice:create', async (_event, input: CreateInvoiceInput) => {
  const invoice = await invoiceController.create(input);
  invoiceView.showCreated(invoice);
  return invoice;
});
```

Certo — Controller:

```ts
class InvoiceController {
  constructor(private readonly createInvoice: CreateInvoiceService) {}

  create(input: CreateInvoiceInput): Promise<Invoice> {
    return this.createInvoice.execute(input);
  }
}
```

## Limitar métodos a 30 linhas

- Manter cada método ou função com no máximo 30 linhas, desconsiderando linhas em branco e linhas contendo somente chaves.
- Extrair etapas com nomes significativos quando o limite for excedido.
- Não contornar o limite comprimindo várias instruções na mesma linha.
- Preferir retornos antecipados para reduzir aninhamento.

Errado:

```ts
async processOrder(order: Order): Promise<Receipt> {
  // validação, cálculo, persistência, pagamento, auditoria e notificação
  // concentrados em um método longo
}
```

Certo:

```ts
async processOrder(order: Order): Promise<Receipt> {
  this.orderValidator.validate(order);
  const pricedOrder = this.priceCalculator.calculate(order);
  const payment = await this.paymentGateway.charge(pricedOrder.total);
  const savedOrder = await this.orderRepository.save(pricedOrder, payment);
  await this.orderNotifier.notifyCreated(savedOrder);
  return Receipt.from(savedOrder);
}
```

## Escrever testes unitários com Vitest

- Usar Vitest para testes unitários (`describe`, `it` ou `test`, `expect` e `vi`).
- Manter testes determinísticos, rápidos e independentes.
- Testar comportamento observável, casos de sucesso, limites e erros relevantes.
- Isolar filesystem, rede, banco de dados, relógio e APIs do Electron com mocks ou fakes.
- Organizar cada teste em preparação, execução e verificação.
- Restaurar mocks após os testes quando necessário.

Errado:

```ts
it('works', async () => {
  const service = new CreateUserService(realDatabase);
  await service.execute({ id: '1', name: 'Ana' });
  expect(true).toBe(true);
});
```

Certo:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('CreateUserService', () => {
  it('persiste o usuário informado', async () => {
    const userRepository = { save: vi.fn().mockResolvedValue(undefined) };
    const service = new CreateUserService(userRepository);
    const user = { id: '1', name: 'Ana' };

    await service.execute(user);

    expect(userRepository.save).toHaveBeenCalledOnce();
    expect(userRepository.save).toHaveBeenCalledWith(user);
  });
});
```

## Checklist de revisão

- [ ] Todo código novo ou alterado está em TypeScript e não introduz `any` desnecessário.
- [ ] Todo o código, incluindo identificadores, comentários, logs e testes, está em inglês; somente textos da interface seguem o idioma do usuário.
- [ ] Variáveis, funções, classes, interfaces e arquivos têm nomes claros e específicos.
- [ ] Cada interface está declarada em seu próprio arquivo.
- [ ] Cada classe possui uma única responsabilidade e um único motivo para mudar.
- [ ] O código respeita MVC: Model contém domínio, Controller coordena e View apresenta.
- [ ] APIs e componentes visuais do Electron estão concentrados na View.
- [ ] Handlers IPC apenas validam/adaptam a entrada e delegam ao Controller.
- [ ] Nenhum método ou função excede 30 linhas conforme a regra definida.
- [ ] Métodos longos ou complexos foram decompostos em operações com nomes significativos.
- [ ] Testes unitários usam Vitest e cobrem sucesso, limites e falhas relevantes.
- [ ] Dependências externas e APIs Electron estão isoladas nos testes.
- [ ] Todos os testes, lint e verificações de tipo do projeto passam.
