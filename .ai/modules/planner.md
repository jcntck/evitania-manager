## Módulo

Módulo principal da ferramenta, no qual o usuário seleciona os produtos que deseja fabricar e o sistema calcula as quantidades e o tempo estimado para obter os recursos necessários.

## Propósito

O usuário deve criar cards de objetivos. Cada card representa um produto do módulo **Receitas** e sua quantidade desejada. Para cada objetivo, o sistema deve apresentar:

- Minérios, troncos, drops de monstros, drops de chefes e processos de fundição necessários;
- A árvore de produção, incluindo produtos intermediários até chegar aos materiais brutos;
- A quantidade necessária de cada item ou produto;
- O estoque informado pelo usuário e a quantidade ainda faltante;
- O tempo estimado para coleta, combate contra monstros e fundição;
- A quantidade estimada de lutas contra chefes.

O usuário deve poder informar a coleta por hora de cada recurso, os abates por hora de cada monstro e um valor global chamado **Quantidade de Saque**, que ajusta as taxas de drop de monstros e chefes.

## Exemplo visual

O arquivo `./docs/exemplo.xlsx` serve apenas como referência visual. Se houver conflito, as regras deste módulo e dos demais arquivos em `.ai/` têm prioridade.

## Histórias de usuário

Como usuário, espero:

1. Selecionar um produto que desejo fabricar e informar a quantidade;
2. Visualizar todas as etapas, materiais necessários e tempos estimados;
3. Adicionar vários objetivos e visualizar tanto os dados individuais quanto os totais consolidados;
4. Informar uma única taxa de coleta ou abate para uma mesma origem, mesmo quando ela participar de vários objetivos;
5. Informar meu estoque para que ele seja descontado antes da expansão dos componentes ainda necessários;
6. Marcar objetivos ou necessidades consolidadas como concluídos e obter os totais recalculados.

## Regras gerais de cálculo

- Todos os cálculos devem usar a **quantidade faltante**, depois do desconto do estoque e das etapas já concluídas;
- As taxas informadas por hora devem ser maiores que zero para que um tempo possa ser calculado;
- Tempos calculados em horas podem ser formatados para minutos, horas ou dias apenas na apresentação, sem alterar o valor-base;
- Resultados baseados em drops representam uma média esperada de rendimento, não uma garantia de obtenção;
- O tempo de drop não deve ser calculado pela probabilidade acumulada de obter toda a quantidade desejada dentro de um período. O planejamento deve usar a média de itens obtidos por tentativa.

### Recursos coletáveis

Para minérios e troncos:

```text
tempo_horas = quantidade_faltante / coleta_por_hora
```

### Monstros e chefes

A probabilidade base de uma taxa `x em y` é:

```text
probabilidade_base = x / y
```

Cada ponto de **Quantidade de Saque** aumenta a probabilidade base em 1% do seu próprio valor:

```text
multiplicador_saque = 1 + (quantidade_de_saque / 100)
denominador_ajustado = máximo(1, arredondar(denominador_base / multiplicador_saque))
probabilidade_ajustada = mínimo(1, numerador_base / denominador_ajustado)
```

O denominador deve ser arredondado para o número inteiro mais próximo antes de calcular a probabilidade ajustada, reproduzindo a taxa apresentada no jogo.

A quantidade esperada de tentativas é:

```text
tentativas_esperadas = quantidade_faltante / probabilidade_ajustada
```

Para monstros:

```text
itens_esperados_por_hora = abates_por_hora * probabilidade_ajustada
tempo_horas = quantidade_faltante / itens_esperados_por_hora
```

Essa fórmula é equivalente a:

```text
tempo_horas = tentativas_esperadas / abates_por_hora
```

Exemplo com **Quantidade de Saque igual a zero**:

- Quantidade necessária do Item X: `12`;
- Taxa de drop do Item X no Monstro Z: `1 em 200`;
- Abates do Monstro Z por hora: `600`;
- Probabilidade ajustada: `1 / 200 = 0,005`;
- Rendimento médio: `600 * 0,005 = 3 itens por hora`;
- Tempo estimado: `12 / 3 = 4 horas`.

O resultado representa o tempo médio estimado conforme o comportamento esperado do drop no jogo. A obtenção real pode ocorrer antes ou depois desse tempo.

O mesmo exemplo com **Quantidade de Saque igual a 43**:

- Multiplicador de Saque: `1 + (43 / 100) = 1,43`;
- Denominador ajustado: `arredondar(200 / 1,43) = arredondar(139,8601) = 140`;
- Taxa ajustada exibida pelo jogo: `1 em 140`;
- Probabilidade ajustada: `1 / 140 = 0,007142857`;
- Rendimento médio: `600 * (1 / 140) = 4,285714 itens por hora`;
- Tempo estimado: `12 / 4,285714 = 2,8 horas`;
- Tempo estimado formatado: `2 horas e 48 minutos`.

Portanto, nesse cenário, aumentar a Quantidade de Saque de `0` para `43` altera a taxa de `1 em 200` para `1 em 140`, eleva o rendimento médio de `3` para aproximadamente `4,285714` itens por hora e reduz o tempo médio estimado de `4 horas` para `2 horas e 48 minutos`.

Chefes são enfrentados ativamente e não farmados por hora. Para eles, deve ser exibido apenas o número de `tentativas_esperadas`, identificado como **Lutas estimadas**.

Se um item possuir mais de uma origem de drop, cada origem deve ser apresentada separadamente para o usuário escolher qual taxa usar no planejamento. O sistema não deve somar automaticamente fontes incompatíveis.

### Fundição

```text
tempo_fundicao_segundos = quantidade_faltante * tempo_processamento_por_unidade_segundos
```

Na apresentação:

- Abaixo de uma hora: mostrar minutos e segundos;
- Entre uma hora e menos de um dia: mostrar horas, minutos e segundos;
- A partir de um dia: mostrar dias, horas, minutos e segundos.

## Consolidação e conclusão

- Um componente presente em mais de um objetivo deve aparecer uma única vez na visão consolidada, com as quantidades somadas;
- Marcar um card de objetivo como concluído remove suas necessidades dos totais pendentes, sem excluir o objetivo;
- Marcar uma necessidade consolidada como concluída satisfaz aquela quantidade para todos os objetivos que a utilizam;
- Desmarcar uma conclusão deve restaurar sua participação nos cálculos;
- O sistema deve impedir ciclos entre receitas e fundições e informar quais produtos formam o ciclo.

## Usabilidade

- A categoria de cada item ou produto deve ser identificada por um badge;
- Valores sem taxa de coleta ou abate devem exibir que o tempo ainda não pode ser calculado;
- Quantidades e tempos individuais e consolidados devem ser visualmente distinguíveis.
