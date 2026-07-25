Implemente uma ferramenta de gerenciamento para o jogo Evitania, disponível para dispositivos móveis e PC (Steam). Nesta ferramenta, o usuário deve criar uma lista de produtos que deseja fabricar, e o sistema deve consultar sua base interna para calcular quais materiais são necessários e em quais quantidades.

A ferramenta deve ser um aplicativo desktop multiplataforma, desenvolvido com Electron. Os requisitos específicos estão divididos nos módulos abaixo.

## Módulos

- [Planejador](modules/planner.md)
- [Itens](modules/items.md)
- [Receitas](modules/recipes.md)
- [Fundição](modules/smeltery.md)
- [Recursos](modules/resources.md)
- [Monstros](modules/monsters.md)
- [Chefes](modules/bosses.md)

## Orientações de design

- Layout simples, mas elegante;
- Todos os assets devem ser salvos na pasta `./assets/`, organizados conforme o módulo;
- As imagens devem usar os formatos PNG ou JPG e, preferencialmente, ter tamanho de arquivo reduzido;
- Os formulários de cadastro e edição que possuam campo de imagem devem permitir selecionar e enviar um arquivo local. O aplicativo deve validar o formato, copiar a imagem para a pasta de assets do módulo e salvar somente a referência ao arquivo gerenciado;
- A identidade visual deve seguir um estilo medieval discreto, elegante e funcional;
- O aplicativo deve possuir um ícone coerente com sua identidade visual, podendo ser derivado do logotipo;
- Esse ícone deve ser exibido nos elementos nativos suportados pelo sistema operacional, incluindo janela, barra de tarefas ou dock, alternador de aplicativos, menu de contexto e executável/instalador;
- Devem ser geradas as variações e resoluções de ícone exigidas por Linux e Windows.

## Especificações técnicas

### Base de dados

- Usar um banco relacional local, em memória ou arquivo, ou outra tecnologia local que organize de forma eficiente os relacionamentos descritos nos módulos;
- A camada de persistência deve permitir uma futura integração para sincronização do arquivo de dados com o Google Drive do usuário;
- A interface deve conter as opções **Sincronizar**, inicialmente inativa, e **Abrir local do arquivo**, que deve abrir a pasta onde os dados estão armazenados.

### Identidade e segurança

- Autor oficial da aplicação: **João Neto**;
- O nome do autor deve constar no `package.json`, nos metadados do aplicativo, nos pacotes, instaladores e releases;
- O Electron deve usar `contextIsolation: true`, `nodeIntegration: false` e sandbox no processo de renderização;
- A interface deve acessar recursos nativos somente por APIs específicas expostas pelo preload. Não deve expor diretamente `ipcRenderer`, Node.js, sistema de arquivos ou execução de comandos;
- Todos os canais IPC devem possuir uma lista explícita de operações permitidas e validar os dados recebidos no processo principal;
- Aplicar uma Content Security Policy restritiva e não carregar código executável de origens remotas;
- Validar tipo, extensão e conteúdo básico de imagens enviadas antes de copiá-las. Os nomes de destino devem ser gerados pela aplicação e não podem aceitar caminhos fornecidos pelo usuário;
- Manter o arquivo de dependências travado em versão e executar auditoria de dependências durante a validação da release;
- Gerar um inventário de componentes de software (SBOM) para cada versão publicada;
- Gerar arquivo de checksums SHA-256 para todos os instaladores, executáveis e arquivos ZIP publicados;
- Os checksums, o SBOM e os artefatos devem ser produzidos pelo mesmo fluxo automatizado de release;
- O fluxo de release deve usar permissões mínimas, dependências de automação fixadas por versão imutável e proteção contra publicação a partir de branches não autorizadas;
- Não incluir segredos, tokens ou certificados no repositório. Credenciais devem ser fornecidas exclusivamente pelo armazenamento seguro do ambiente de CI;
- Preparar a configuração de empacotamento para assinatura de código. A assinatura efetiva dependerá do fornecimento dos certificados ou chaves correspondentes ao autor;
- As instruções para obtenção e fornecimento seguro das credenciais de assinatura do Windows estão em [`docs/seguranca-windows.md`](../docs/seguranca-windows.md);
- Quando a infraestrutura de publicação oferecer atestação de procedência dos artefatos, ela deve ser habilitada e anexada à release.

### Deploy

- Disponibilizar builds de produção em AppImage para Linux e instalador NSIS para Windows;
- Os artefatos de cada plataforma também devem ser disponibilizados em arquivos ZIP;
- Os metadados do aplicativo e dos pacotes devem declarar nome do produto, versão, descrição e o autor **João Neto**;
- Disponibilizar um script shell executável para automatizar a publicação de uma versão;
- O script deve receber uma versão, validar o formato e garantir que o repositório esteja em condições seguras para a publicação;
- Para uma versão `<versão>`, o script deve criar uma tag principal `<versão>` e duas tags adicionais: `<versão>-linux` e `<versão>-windows`;
- A tag `<versão>-linux` deve publicar o AppImage e seu ZIP. A tag `<versão>-windows` deve publicar o instalador NSIS e seu ZIP;
- A tag principal deve representar a versão do código-fonte e referenciar os artefatos das duas plataformas;
- A criação e o envio das tags não devem ocorrer se alguma etapa obrigatória de validação ou build falhar;
- Cada release deve publicar também os checksums SHA-256, o SBOM e, quando disponível, a atestação de procedência dos artefatos;
- Os metadados de autor são obrigatórios para identificação dos pacotes, mas não substituem assinatura digital;
- A assinatura digital deve ser ativada quando os certificados específicos de cada plataforma forem disponibilizados, sem armazená-los no repositório.
