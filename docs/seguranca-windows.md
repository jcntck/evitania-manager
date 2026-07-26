# Segurança e assinatura da aplicação no Windows

Este documento explica quais informações e credenciais o autor **João Neto** precisa obter para que as builds do Evitania Manager possam ser assinadas e verificadas no Windows.

> Situação verificada em 19 de julho de 2026. Disponibilidade, preços e exigências de validação podem mudar; confirme sempre nas páginas oficiais vinculadas neste documento antes da contratação.

## O que a assinatura resolve

A assinatura Authenticode permite ao Windows identificar o publicador e verificar se o executável ou instalador foi alterado depois da assinatura. Ela não garante que o programa não tenha falhas e não elimina necessariamente um alerta do SmartScreen logo nas primeiras distribuições.

O SmartScreen considera a reputação do publicador e a reputação do próprio arquivo. Uma aplicação assinada pode inicialmente aparecer como pouco conhecida, mas conserva uma identidade verificável e pode acumular reputação quando as versões seguintes são assinadas consistentemente com o mesmo publicador.

Referências oficiais:

- [Assinaturas digitais Authenticode](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)
- [Reputação do SmartScreen para aplicações Windows](https://learn.microsoft.com/pt-br/windows/apps/package-and-deploy/smartscreen-reputation)

## Caminho recomendado para o autor no Brasil

Para distribuição fora da Microsoft Store, obtenha um certificado de **Code Signing/Authenticode** emitido por uma autoridade certificadora cuja cadeia seja aceita pelo Microsoft Trusted Root Program.

Consulte a [lista atual de participantes do Microsoft Trusted Root Program](https://learn.microsoft.com/en-us/security/trusted-root/participants-list), escolha uma autoridade que ofereça certificado de assinatura de código para pessoa física no Brasil e confirme diretamente com ela:

- Compatibilidade com Windows Authenticode;
- Emissão para desenvolvedor individual/pessoa física;
- Forma de armazenamento da chave, normalmente token, HSM físico ou serviço de assinatura em nuvem;
- Compatibilidade com automação em GitHub Actions;
- Serviço de carimbo de tempo RFC 3161;
- Política de renovação e revogação;
- Preço, prazo e documentos exigidos.

Não compre apenas um certificado TLS/SSL para site. O produto precisa declarar finalidade de **Code Signing** ou **Microsoft Authenticode**.

## Informações que devem ser preparadas

As exigências exatas pertencem à autoridade escolhida, mas normalmente será necessário validar:

- Nome civil exatamente como consta no documento: `João Neto` ou o nome civil completo solicitado pela autoridade;
- Documento oficial de identidade vigente;
- CPF e demais dados fiscais solicitados;
- Endereço residencial e comprovante recente;
- Telefone e endereço de e-mail controlados pelo autor;
- Eventual prova adicional de identidade por vídeo, biometria ou agente autorizado;
- Nome de publicador que será gravado no certificado.

Antes de pagar, confirme qual texto aparecerá no campo **Publisher/Publicador** do Windows. O valor configurado no aplicativo deverá corresponder exatamente ao nome certificado. O simples campo `author` do `package.json` não substitui essa validação.

## Opções de certificado

### Certificado público de uma autoridade certificadora

É o caminho aplicável imediatamente a um desenvolvedor individual no Brasil. A autoridade valida a identidade e fornece acesso à chave de assinatura. Certificados atuais podem exigir armazenamento protegido e não necessariamente permitem exportar a chave para um arquivo PFX.

Se a solução usar token físico, confirme se o build precisará executar em uma máquina Windows controlada pelo autor. Se usar HSM ou serviço de assinatura remoto, confirme se há integração segura e não interativa com o CI.

### Microsoft Artifact Signing

O Artifact Signing é o serviço gerenciado de assinatura da Microsoft e mantém os certificados em HSM. Entretanto, na data desta revisão, o perfil **Public Trust** está disponível para organizações nos EUA, Canadá, União Europeia e Reino Unido, e para desenvolvedores individuais apenas nos EUA e Canadá. Assim, ele não é atualmente o caminho público aplicável a João Neto como pessoa física residente no Brasil.

Não use um perfil **Private Trust** para releases públicas: ele não é confiável por padrão nos computadores dos usuários.

Se a elegibilidade mudar, siga o [início rápido oficial do Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) para obter:

- Assinatura do Azure;
- Tenant ID do Microsoft Entra;
- Conta do Artifact Signing;
- Validação pública de identidade;
- Perfil de certificado `Public Trust`;
- Endpoint regional;
- Nome da conta e do perfil;
- Identidade de CI com a função mínima de assinante do perfil.

Veja também os [modelos de confiança do Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-trust-models).

### Microsoft Store

Publicar pela Microsoft Store é uma alternativa de distribuição. Aplicações distribuídas pela Store são assinadas pela Microsoft e não ficam sujeitas ao aviso de download do SmartScreen da mesma forma que instaladores distribuídos diretamente. Essa opção não substitui automaticamente a assinatura das releases ZIP/NSIS publicadas no GitHub.

## Informações a fornecer ao projeto

Depois da contratação, informe apenas dados não secretos:

- Nome exato do publicador certificado;
- Tipo de solução: autoridade certificadora, token/HSM ou serviço remoto;
- Nome da autoridade emissora;
- Data de validade do certificado;
- URL do servidor de carimbo de tempo fornecida pela autoridade;
- Documentação de integração ou nome da ferramenta oficial;
- Identificador público do certificado, quando aplicável.

Não envie nem registre no Git:

- Chave privada;
- Arquivo PFX/P12;
- Senha do certificado;
- PIN de token;
- Client secret;
- Token de acesso;
- Credenciais pessoais da conta da autoridade.

Segredos devem ser cadastrados diretamente no cofre do provedor de CI. O repositório receberá somente os nomes das variáveis necessárias.

## Requisitos para a automação

A configuração final deverá:

1. Assinar o executável e o instalador NSIS;
2. Usar SHA-256 como algoritmo de digest;
3. Aplicar carimbo de tempo durante a assinatura;
4. Falhar a release se a assinatura estiver ausente ou inválida;
5. Verificar a assinatura antes de gerar ZIP e checksums;
6. Gerar checksums SHA-256 depois da assinatura, pois a assinatura altera o arquivo;
7. Publicar o certificado público e a impressão digital no relatório da release, nunca a chave privada.

O `electron-builder` oferece integração para assinatura do Windows e permite impedir builds de produção sem assinatura por meio de `forceCodeSigning`. Consulte a [documentação de assinatura Windows do electron-builder](https://www.electron.build/docs/features/code-signing/code-signing-win/).

## Contrato automatizado atual

O workflow aceita assinatura somente pelas variáveis protegidas `WIN_CSC_LINK`
e `WIN_CSC_KEY_PASSWORD`, fornecidas pelos secrets do GitHub Actions. O build
falha se apenas uma estiver disponível. Nenhum script procura certificado, senha
ou chave dentro do repositório.

Quando ambas existem, `signing-status.json` publica `signed` com origem
`ci-environment`. Quando não existem, publica `unsigned`. Esse estado explícito
não dispensa checksum, SBOM, proveniência, inspeção de metadados ou smoke test do
pacote instalado.

## Como verificar uma build assinada

Em uma máquina Windows com o Windows SDK instalado, execute:

```powershell
signtool verify /pa /v caminho\EvitaniaManagerSetup.exe
```

O comando deve terminar com código de saída zero e mostrar o publicador esperado. O SignTool faz parte do Windows SDK; veja a [documentação oficial do SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool) e o [procedimento oficial de verificação](https://learn.microsoft.com/en-us/windows/win32/seccrypto/using-signtool-to-verify-a-file-signature).

Também verifique manualmente:

1. Clique com o botão direito no instalador e abra **Propriedades**;
2. Acesse **Assinaturas Digitais**;
3. Confirme o nome do signatário;
4. Abra os detalhes e confirme que a assinatura é válida;
5. Compare o SHA-256 do arquivo com o checksum publicado na release.

## Checklist para João Neto

- [ ] Escolher uma autoridade presente em uma cadeia aceita pelo Windows;
- [ ] Confirmar emissão Authenticode para pessoa física no Brasil;
- [ ] Confirmar o nome exato que aparecerá como publicador;
- [ ] Concluir a validação de identidade;
- [ ] Escolher armazenamento da chave compatível com o CI;
- [ ] Obter a URL oficial de carimbo de tempo;
- [ ] Guardar chaves, PINs e senhas fora do repositório;
- [ ] Fornecer ao projeto somente os dados públicos e nomes de segredos;
- [ ] Testar a assinatura e a verificação antes da primeira release pública.
