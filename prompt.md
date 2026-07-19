<wiki>docs/base-cadastro.xlsx</wiki>
<csv>./docs/raw.csv</csv>

Implemente uma ferramenta de gerenciamento para o jogo mobile / pc (steam) Evitania. Nesta ferramenta o usuário deve criar uma lista de itens que ele deseja "craftar" e o sistema irá buscar em sua base (interna) o que e quanto de cada material precisa para isso concluir essa lista. 

Nesta lista deve conter informações sobre a quantidade total dos itens necessários e a quantidade já obtida (informação que o usuário irá alimentar), a ferramenta deve ser capaz também de apresentar todos os subprodutos necessário para aquele item até chegar no material bruto, os materiais brutos, se forem viáveis de prever a quantidade de coleta / hora, devem ser também ser exibidos (a informação de quanto por hora aquele item é gerado é alimentado pelo usuário). É necessário ter uma base de itens que o usuário possa gerenciar por questões de usabilidade.

## Base de dados

Para a base de dados, divida-os em 3 seções: Receitas, Monstros, Equipamentos. Use as imagens e as informações contidas na <wiki> para popular estas seções, sendo [Aba -> Seção]: Receitas -> Receitas; Drops -> Registro de monstros; Registro de Equipamentos e Registro de Armamento/Coletavel -> Equipamentos. Na seção de equipamentos, olhe apenas para os itens que estão na aba Receitas, despreze os demais. Na seção Drops possui todos os drops de cada monstro, converta a fração para decimal, para usar futuramente em calculos, há duas categorias de monstros os normais e bosses, os bosses são os da linha 44 até 50 em diante da <wiki>/Registro de montros. Ja o restante são os demais itens coletaveis do jogo, divida-os como achar melhor.
**Existem itens que aumentam a probabilidade dos drops** seguindo a regra abaixo:
Cada ponto de Saque aumenta a chance de obter um item em 1%.	1 Qntd de Saque:		1,01 / 10.000	
Afeta itens raros (todos, exceto itens básicos).				100 Qntd de Saque:		2,00 / 10.000	
Portanto, se a taxa de queda do item for 1/10.000				200 Qntd de Saque:		3,00 / 10.000	

## Planejamento
- Informações como quantiade em estoque e produção por hora pertecem a este modulo;
- A lista de craft será de um item pertecente a base de dados Receita;
- Quando item forem provenientes de monstros, o usuario deve informar a quantidade monstros abatidos por hora para calcular a probabilidade do drop, por sua vez, o tempo estimado.
- Quando item forem provenientes de minerios ou lenhas, informar a quantidade de coleta por hora.

## Mais informações

Para servir de norte do que a ferramenta deve fazer nesta versão 0, analise este csv: <csv>.
Salve dados como XP que os monstros / itens de coleta fornecem para calculos futuros.

## Considerações técnicas

A ferramenta será um aplicativo desktop para linux / windows e o armazenamento será em ultima instancia um json ou csv que será integrado com o google drive (usuário principal) futuramente.
Utilize uma arquitetura MVC
Forneça um botão para abrir a pasta onde json / csv com os dados está salvo.