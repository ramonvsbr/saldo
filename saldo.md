# Saldo — andamento

Atualizado em 19/10/2026.

**Nome do app:** o projeto deixou de se chamar "Saldo Simples" e agora se chama **Saldo** (item 25). Este arquivo, antes `ss.md`, passou a se chamar `saldo.md`.

**Como foi testado:** a lógica (saldos, cópia de mês, avulso, migração para centavos, gasto rápido, geração do gráfico, navegação por dia, backup, lembrete, botão voltar, e primeiro uso vazio) foi testada com jsdom, com a data fixada em 16/10/2026 e o Capacitor simulado (Filesystem, Share, App e SystemBars). As mudanças de layout feitas na noite de 16/10 (itens 10 a 16) tiveram só verificação estática: sintaxe do JS, chaves do CSS balanceadas e conferência de IDs e classes entre `index.html`, `style.css` e `app.js`. **Situação em 18/10/2026:** os itens 19 a 22 (e a máscara de valores, parte do item 24) foram conferidos no código enviado e **implementados em 18/10**, com teste em jsdom (data fixada em 16/10/2026 e Capacitor simulado). Também em 18/10: o cartão de boas-vindas virou **pop-up com o primeiro passo "informe seu saldo atual"** (item 22) e o nome/chave de armazenamento foram trocados (item 25); esses dois foram testados em Chromium headless (Playwright, tela de 390px). Os itens **23 e 24 (exceto a máscara) continuam PENDENTES**. **Nada dos itens 18 a 24 foi conferido ainda no aparelho real.**

**Migração para app Capacitor (item 17):** o projeto foi reorganizado, o Android foi adicionado, o Gradle sincronizou no Android Studio (com JVM 21) e, segundo o relato do desenvolvedor, o app rodou sem erro. **Para os itens 19 e 20 funcionarem é preciso instalar os plugins (`npm i @capacitor/filesystem @capacitor/share @capacitor/app` e `npm run sync`).** A conferência detalhada do visual e dos recursos no aparelho (lista em "Verificação e implantação") ainda não foi registrada.

## O que foi feito

### 1. Padronização visual com o Maromba
- Paleta azul-marinho + amarelo magnésio (claro e escuro), fonte Plus Jakarta Sans (embutida no app, item 24), cartões com borda fina e cantos de 16px.
- Abas de mês viraram chips (38px); botões (48/40px), campos (44px, 14px; 16px no celular), modais e toasts seguem o padrão do Maromba.
- Receitas em verde, despesas em vermelho, saldo verde/vermelho. O amarelo é só cor de ação e de item ativo.
- Na noite de 16/10 o `style.css` foi reescrito com os mesmos tokens e medidas do Maromba (ver item 15).

### 2. Modo 100% offline, cabeçalho e navegação estilo app
- Removidos: login, cadastro, sessão, sincronização com a nuvem, menu de conta, rodapé e as regras de CSS correspondentes.
- Cabeçalho fixo no celular (nome + tema claro/escuro + engrenagem) e menu lateral no desktop, iguais ao Maromba.
- Barra inferior só com ícones: **Mensal, Diário (centro, círculo amarelo) e Anual**. O Diário é a tela principal e a que abre primeiro.
- Ajustes (painel que sobe de baixo): exportar/importar backup `.json`, data do último backup, carregar exemplo e limpar tudo.

### 3. Dados de exemplo gerados a partir do mês atual
- O exemplo cobre **1 mês antes do mês atual até 5 meses à frente**, calculado a partir da data de hoje (em out/2026: set/2026 a mar/2027).
- `addMonthsToKey` aceita deslocamento negativo.
- O saldo inicial de exemplo (R$ 500) fica no primeiro mês gerado.
- **O exemplo não carrega mais sozinho no primeiro uso** (ver item 22): ele só entra pelo botão "Carregar exemplo" (boas-vindas ou Ajustes).

### 4. Saldo atual do Diário + projetado fim do mês
- **Saldo atual** = saldo inicial do mês + receitas/despesas do Mensal cujo dia já passou − gastos do Diário.
  - Mês atual: considera o Mensal até o dia de hoje (o dia de hoje já conta).
  - Mês encerrado: considera o Mensal inteiro. Mês futuro: ainda não considera nada do Mensal.
  - Item do Mensal sem dia só conta no último dia do mês. Dia 31 em mês curto é limitado ao último dia.
- **Projetado** (cartão, antes "Saldo final (mensal)") = saldo inicial + Mensal inteiro − gastos do Diário.
- O saldo inicial do mês seguinte continua sendo o projetado do mês anterior.
- Editar o "Saldo atual" funciona (o mês fica marcado como ajustado manualmente) e desconta o Mensal que já caiu. O cartão tem um **ícone de lápis** indicando que o valor é editável (clicar no lápis ou no valor foca o campo). Para voltar ao cálculo automático, ver item 23 (**pendente**: hoje não existe botão para isso).
- A linha de detalhe do cartão mostra até que dia do Mensal foi considerado (ex.: "inclui o Mensal até o dia 16"). No celular (até 600px) essa linha fica escondida para caber.
- Conferência com o exemplo em 16/10/2026: saldo atual R$ 3.359,50 e projetado R$ 3.139,50.

### 5. Novo mês copia os valores do anterior
- O botão "+" (Mensal e Diário) copia os valores recorrentes do mês-base para o mês novo e mostra o aviso: "Valores de Março/2027 copiados para Abril/2027. Ajuste o que mudou."
- **Mês-base** = último mês anterior ao novo que tenha algum valor recorrente.
- Itens **parcelados** e itens **avulsos** não são copiados.

### 6. Dinheiro em centavos inteiros (schema v3)
- Todo valor (Mensal, Diário, saldos) é guardado em centavos inteiros.
- `fmtMoney` recebe centavos; helpers `toCents`, `centsToInput` e `parseCents` (aceita "18,50", "18.50" e "1.234,56").
- **Migração automática** de dados v1/v2 (em reais) para v3 ao abrir o app e ao importar backup antigo.
- Backup de versão mais nova que o app é recusado com aviso.
- Dado salvo ilegível ou de versão desconhecida é copiado para a chave `saldo-dados-invalido` antes de ser substituído.
- A chave principal de armazenamento hoje é `saldo-dados` (antes `livro-caixa-dados-v2`, trocada no item 25). O campo `version` dos dados (3) é independente do nome da chave.

### 7. Item recorrente × avulso × parcelado (regra nova, 16/10 noite)
Os três tipos são exclusivos e aparecem como chips sob o nome do item (Mensal):
- **Recorrente (∞)** — padrão. Mostra só o chip "∞ recorrente" (amarelo) e a **caixa de parcelas fica escondida**. É copiado para os próximos meses.
- **Avulso** — toque no ∞ para desmarcar. Aparece a caixa "[ ] parcela" com o "∞ recorrente" desmarcado ao lado. Só existe no mês em que foi marcado: some das outras abas, não entra nos totais dos outros meses (nem no Anual) e não é copiado pelo "+".
- **Parcelado** — número de parcelas maior que 1. O **∞ some** e ficam a quantidade de parcelas e o andamento (ex.: 3/6, Futuro, Fim). Apagar o número volta o item para recorrente.
- Não apaga dados: voltar para ∞ faz o item reaparecer em todos os meses, com valor só nos meses em que existia.

### 8. Botão "+" flutuante para gasto rápido
- Círculo amarelo acima da barra inferior, **só no celular e só na tela Diário**.
- Abre um painel com Valor (teclado numérico), Descrição e Dia. O dia vem com hoje (ou 1, se o mês aberto no Diário não for o atual).
- Neste campo, `1.234` vale R$ 1.234,00 (ponto de milhar), e `18,50` / `18.50` continuam valendo R$ 18,50.
- O gasto entra no mês aberto no Diário e o saldo atualiza na hora. Sem valor, o painel não fecha e avisa.

### 9. Gráfico de barras no resumo anual
- Cada ano tem um gráfico SVG de receitas (verde) × despesas (vermelho), de janeiro a dezembro, com legenda e valores ao tocar numa barra.
- Meses que não existem ficam sem barra e com o nome apagado. As cores seguem o tema claro e escuro.
- Os totais do Anual respeitam parcelas e itens avulsos.

### 10. Correção dos arquivos quebrados (16/10)
- O JS gerava cartões `.entry-card` e o CSS só tinha `.entry-item`; os três arquivos foram alinhados (Opção A: o JS agora gera `.entry-item`, com dia, nome + chips, valor e lixeira).
- `<table>` trocadas por `<div class="entry-list">` (o JS inseria `div` dentro de `tbody`, HTML inválido).
- Estilos do modal de confirmação (`.modal-btn`, `.modal-message`, `.modal-actions`), cor positivo/negativo do campo de saldo atual, `.empty-note`, `.field-small` e `.modal-card-lg` criados.
- Caminhos do `manifest.json` e do favicon passaram a ser relativos (antes começavam com `/`). *(Obsoleto: os dois arquivos saíram no item 17.)*
- "Escape" agora fecha só a camada de cima (confirmação, depois gasto rápido, depois Ajustes).

### 11. Telas e títulos (16/10 noite)
- Subtítulos das telas removidos.
- A tela Diário se chama **"Controle diário"** (como "Controle mensal"). Ordem do menu: Mensal, Diário (centro), Anual; rótulos de grupo do menu lateral removidos.
- Removida a barra colorida lateral dos blocos. Despesa e receita agora são indicadas por um quadradinho com seta no título (vermelho ↓ despesa, verde ↑ receita) e pela cor do total.

### 12. Cartões de resumo padronizados (16/10 noite)
- Os três cartões ficam **lado a lado em todas as telas e tamanhos**, todos com a mesma altura: 108px no computador, 88px até 900px e 68px no celular (até 600px).
- Medidas fixas de rótulo, valor e detalhe; texto longo corta com "…" em vez de crescer o cartão.
- Rótulos curtos: "Despesas" e "Projetado" no Diário.
- No celular, os valores usam fonte entre 13px e 16px, como os cartões de macros do Maromba.

### 13. Tela Anual (16/10 noite)
- Ordem: abas dos anos → cartões gerais (Despesas, Receitas e Saldo geral) → carrossel.
- **Carrossel de anos**: um ano por vez, desliza para o lado (dedo, touchpad ou clique na aba). A aba do ano acompanha o deslize; clicar na aba leva ao ano. Abre no ano atual (ou no último, se o atual não existir) e mantém o ano escolhido.
- Os cartões de cada ano seguem o padrão do Mensal e do Diário: cabeçalho de 18px com ícone de calendário, mesmos espaçamentos e divisórias, itens por categoria com a altura e o estilo das linhas de lançamento.

### 14. Lista de lançamentos em cartões (16/10 noite)
- Mensal e Diário usam linhas `.entry-item`: quadrado do dia à esquerda, nome com chips no meio, valor ("R$") e lixeira à direita. A lixeira tem 32px (40px no celular).

### 15. Identidade visual do Maromba (16/10 noite)
- `style.css` reescrito com os tokens do Maromba: `--pad-card`, `--pad-item`, `--icon-btn`, `--chalk-text`, `--chalk-dim`, espaço entre blocos (24px; 20px no celular), títulos (25px; 22px no celular), marca (22px; 18px no celular), rótulos e valores dos cartões.
- Modais **sobem de baixo** (bottom sheet com a barrinha no topo), em qualquer tamanho de tela. A confirmação continua centralizada e sempre acima das outras camadas; no celular o botão principal fica em cima.
- Avisos (toasts) centralizados no topo com borda amarela.
- Barra inferior do celular com altura de 40px nos botões e sombra, como no Maromba.

### 16. Observações técnicas do período
- O estilo de tudo (avulso, botão flutuante, gasto rápido, gráfico anual, carrossel) está no `style.css`. O `extras.css` deixou de ser usado e saiu do projeto.
- O HTML foi ajustado com a versão enviada por você (rótulos "Despesas" e "Projetado").

### 17. Migração para app Android com Capacitor (16/10 noite)
O Saldo deixou de ser web app/PWA e passou a ser **somente Android**, com a mesma estrutura do Maromba.
- **Removido o que era do webapp:** `manifest.json`, `sw.js` (service worker), links de manifest e favicon no `index.html`, `assets/favicon.ico` e `extras.css`.
- **Removido o backend:** Worker do Cloudflare (`worker/index.js`, `schema.sql`, `wrangler.example.toml`) e banco D1. O Worker e o banco D1 também foram **apagados no painel da Cloudflare**, e o registro do service worker saiu do `app.js` (confirmado pelo desenvolvedor). O app já funcionava 100% offline desde o item 2, então não houve mudança de lógica.
- **Nova estrutura de pastas:**
  ```
  saldo-simples/
  ├─ android/            (gerado pelo Capacitor)
  ├─ resources/icon.png
  ├─ src/                (fontes: index.html, style.css, app.js, fonts/)
  ├─ www/                (gerado por copiar-www.js; não editar)
  ├─ .gitignore
  ├─ capacitor.config.json
  ├─ copiar-www.js
  ├─ package.json
  └─ README.md
  ```
  Os arquivos saíram de `assets/css/` e `assets/js/` e ficam todos em `src/`; os caminhos no `index.html` passaram a ser `style.css` e `app.js`.
- **Fluxo de trabalho:** `copiar-www.js` copia `src/` para `www/`, e o script `npm run sync` roda a cópia e o `npx cap sync android`. Depois, `npx cap open android` abre o Android Studio. Todos os comandos (sincronizar e gerar o APK) estão em "Comandos do dia a dia", mais abaixo.
- **Android Studio:** o Gradle 8.14.3 do projeto não aceita o JDK 25 padrão do Android Studio; foi necessário escolher o **JVM 21** (Settings > Build Tools > Gradle > Gradle JDK). Com isso o projeto sincronizou.
- **Plugins:** `@capacitor/filesystem`, `@capacitor/share` e `@capacitor/app` agora são usados no `app.js` (itens 19 e 20) e precisam estar instalados. A cor da barra de status **não usa** o `@capacitor/status-bar`: usa o `SystemBars` embutido no `@capacitor/core` 7.1+, como o Maromba (o `StatusBar` só entra como alternativa se o `SystemBars` não existir).
- A chave de armazenamento era `livro-caixa-dados-v2` nesta etapa; foi trocada para `saldo-dados` no item 25.
- **Lição do processo:** o código do `copiar-www.js` precisa ficar dentro de um arquivo `.js`; colado direto no PowerShell dá erro.

### 18. Navegação por dia no Diário (16/10 noite)
- Dentro do bloco "Lançamentos", logo abaixo do título: pílula com **seta anterior (‹), botão de calendário com o dia (ex.: "sex, 16 out 2026") e seta seguinte (›)**, no mesmo estilo do Maromba (`.date-nav`, `.date-picker-pill`, `.btn-hoje`). O botão **"Hoje"** (borda amarela) só aparece quando outro dia está aberto.
- O botão de calendário abre o seletor de data nativo (`showPicker()` num `<input type="date">` invisível posicionado sobre o botão). O seletor só aceita datas entre o primeiro e o último mês cadastrados; escolher um mês que não existe avisa para usar o "+" e mantém o dia atual.
- **A lista mostra só os gastos do dia aberto**, e o total do cabeçalho do bloco passa a ser o total do dia. Os três cartões de cima continuam mostrando o mês. Dia sem gastos mostra "Nenhum gasto em sex, 16 out 2026.".
- O dia aberto começa em hoje (ou no dia 1, se o mês aberto não for o atual) e é guardado **só na memória**. Trocar de mês pelas abas volta para hoje (mês atual) ou dia 1.
- As setas atravessam a virada de mês quando o mês existe. No primeiro mês avisa "Este é o primeiro mês cadastrado."; no último avisa para usar o "+" nas abas.
- Novo gasto na linha e gasto rápido usam o dia aberto; depois de lançar pelo gasto rápido, o Diário abre o dia do gasto.
- Mudar o dia de um gasto o move para o outro dia, com aviso ("Gasto movido para sáb, 3 out 2026."). **O campo de dia é obrigatório no Diário**: apagar o número mantém o dia anterior (senão o gasto sumiria da lista). Gastos sem dia (dados antigos) aparecem no último dia do mês.
- Estilo: botões de 40px, cores pelos tokens (claro e escuro), ajustes para telas de até 500px.
- Testado com jsdom (data fixada em 16/10/2026): rótulo, filtro por dia, total do dia, setas, "Hoje", seletor de data, virada de mês, limites, troca de abas, novo gasto, mover gasto e gasto rápido. **O visual e o seletor de data nativo ainda precisam ser conferidos no aparelho.**

### 19. Backup no app Android (16/10 noite; implementado no código em 18/10)
- **Exportar** (Ajustes e aviso do Diário): no APK grava `saldo-dados-AAAA-MM-DD.json` no cache (`@capacitor/filesystem`) e abre o menu de compartilhar do Android (`@capacitor/share`: Drive, WhatsApp, e-mail...). Fechar o menu sem escolher nada **não** conta como backup. No navegador (ou sem os plugins) continua o download por link.
- A data do backup só é registrada depois que o compartilhar conclui. O toast pede para conferir se o arquivo foi salvo onde você escolheu (o Android não confirma o destino).
- **Importar** continua pelo `<input type="file">` (mesmo mecanismo do Maromba). Backups antigos (em reais) continuam sendo migrados.

### 20. Botão voltar do Android e barras do sistema (16/10 noite; botão voltar implementado em 18/10; barras do sistema já existiam)
- O botão voltar (`@capacitor/app`) fecha, nesta ordem: confirmação, gasto rápido, Ajustes; depois leva ao **Diário**; e, já no Diário, **sai do app**.
- A cor/ícones das barras do sistema acompanham o tema claro/escuro (`SystemBars`, estilo pelo fundo: `LIGHT` = fundo claro, `DARK` = fundo escuro). Aplicado na abertura e ao alternar o tema.

### 21. Lembrete de backup (16/10 noite; implementado no código em 18/10)
- Aviso no topo do Diário, no estilo `.aviso-backup` do Maromba, com "Fazer backup" e "Depois".
- Aparece quando **nunca houve backup** ou o último tem **14 dias ou mais**. "Depois" silencia por **3 dias**. Não aparece se o app está vazio (nada a perder).
- Nos Ajustes, o último backup aparece como "hoje", "ontem" ou "há N dias" e fica em vermelho quando está atrasado.
- Chaves em `localStorage` (só deste aparelho, **não entram no backup**): `saldo_ultimo_backup` (timestamp em ms) e `saldo_backup_adiado`.

### 22. Primeiro uso vazio e pop-up de boas-vindas (16/10 noite; cartão em 18/10; trocado por pop-up em 18/10)
- Sem dados salvos, o app abre **vazio** e mostra um **pop-up** (painel que sobe de baixo, como os de Ajustes e gasto rápido) com o título "Bem-vindo ao Saldo" e o **primeiro passo: informar quanto a pessoa tem hoje**. O cartão de boas-vindas que ficava no Diário foi removido.
- O campo de saldo usa a máscara de valores (`1.234,56`) e **teclado de texto**, para permitir o sinal de menos (saldo negativo). **"Salvar e começar"** grava o valor como "Saldo atual" do mês aberto (no 1º mês, é o saldo inicial), marca as boas-vindas como concluídas, fecha o pop-up e mostra um aviso. Campo vazio ou inválido não fecha e avisa ("se for zero, digite 0"); `0` vale.
- Abaixo do botão principal ficam, em destaque menor: **"Carregar exemplo"**, **"Já tenho um backup"** (abre o seletor de arquivo, útil ao reinstalar) e **"Pular por enquanto"**. "Começar do zero" deixou de existir (o começo do zero é informar o saldo).
- **Pular:** fecha o pop-up e o cartão "Saldo atual" do Diário fica com **borda amarela** e o texto "Toque aqui: informe seu saldo" (tocar em qualquer parte do cartão abre o campo). O pop-up **volta na próxima abertura do app** enquanto não houver saldo registrado nem dados. Botão voltar do Android, Escape e toque fora do pop-up valem como "Pular" (o voltar entra na ordem das camadas do item 20).
- O pendente termina (pop-up e destaque somem de vez) quando: o saldo é registrado, o exemplo é carregado, um backup é importado, "Limpar tudo" é usado, a pessoa edita o "Saldo atual" direto no cartão, ou já existe qualquer dado (gasto, despesa ou receita). A escolha fica em `saldo_boas_vindas_ok` (só neste aparelho; **não entra no backup**).
- Se o dado salvo estiver ilegível, ele é copiado para `saldo-dados-invalido`, o app abre vazio (antes carregava o exemplo) e avisa por toast.
- "Carregar exemplo" dos Ajustes usa a mesma rotina.
- Testado em Chromium headless (390px): abre no primeiro uso, destaque no cartão, vazio não fecha, salvar `1.234,56`, saldo negativo, pular, exemplo e não reabrir quando já concluído. **Falta conferir no aparelho** (teclado de texto, visual do painel, botão voltar).

### 23. Saldo ajustado manualmente (16/10 noite) — PENDENTE, NÃO IMPLEMENTADO
_Descrição do que deve ser feito. Hoje o campo "Saldo atual" marca o mês como ajustado (`manual: true`), mas não há aviso nem botão para desfazer._
- Quando o mês foi ajustado à mão, aparece um aviso amarelo no Diário ("Saldo ajustado manualmente") com o botão **"Voltar ao automático"**. O aviso fica visível no celular (a linha de detalhe do cartão é escondida até 600px). No desktop o detalhe do cartão também mostra "ajustado manualmente".
- O botão volta ao cálculo automático (saldo do mês anterior + Mensal) e o toast mostra o valor novo e o anterior. Não pede confirmação.
- **O 1º mês não mostra aviso nem botão:** ele não tem cálculo automático (o saldo inicial dele é sempre o que a pessoa informa).
- Digitar no "Saldo atual" o mesmo valor que o automático daria **não** marca o mês como ajustado (do 2º mês em diante).

### 24. Acabamento de design e usabilidade (16/10 noite) — PENDENTE (só a máscara de valores foi implementada, em 18/10)
_Situação de cada parte em 18/10: **máscara de valores (campos de valor e Saldo atual): implementada.** Pendentes: fonte embutida em `.woff2` (hoje o `style.css` usa `fonts/PlusJakartaSans.ttf`, que já funciona), chips de parcela/∞ maiores, apagar mês em Ajustes (hoje ainda há o × nas abas), fonte que encolhe nos cartões e o ajuste do aviso "salvo ✓" / duração dos toasts, conforme descritos abaixo._
- **Fonte embutida:** `fonts/PlusJakartaSans-latin.woff2` (variável, pesos 200–800, ~27 KB, licença OFL) com `@font-face` no `style.css`. Os links do Google Fonts saíram do `index.html` (e o link do favicon, que já apontava para um arquivo removido). O arquivo precisa ficar em `src/fonts/`.
- **Valores no formato brasileiro (IMPLEMENTADO em 18/10):** os campos de valor (Mensal e Diário) viraram texto com teclado decimal. Fora de foco mostram `1.234,56` (ao lado do "R$"); em foco mostram `1234,56` selecionado para editar. Aceitam `18,50`, `18.50` e `1.234,56`; `1.234` vale R$ 1.234,00 (milhar). Texto inválido avisa e volta ao valor anterior; campo vazio limpa o valor. A largura do campo acompanha o tamanho do número.
- **Saldo atual** também: fora de foco mostra `R$ 3.359,50`; em foco, `3359,50`. Vazio ou inválido não altera nada (antes, vazio virava R$ 0,00). Enter confirma.
- **Chips de parcela/∞** maiores: 30px no computador e 36px no celular (antes ~22px), fonte 12px. O chip de parcela virou `<label>`: tocar em qualquer ponto dele foca o número.
- **Abas de mês sem o ×:** apagar mês agora fica em **Ajustes > Meses** (lista dos meses + botão "Apagar mês", com confirmação e aviso). Ao abrir, a barra de abas rola até deixar o mês aberto no meio.
- **Valores grandes nos cartões:** a fonte do valor encolhe até caber (mínimo 10px), em vez de cortar com "…". Recalcula ao trocar de mês/tela, ao girar a tela e quando a fonte termina de carregar. Em telas largas nada muda.
- **Aviso "salvo ✓"** vai para o canto esquerdo, acima da barra inferior, no celular (até 900px); no computador continua no canto inferior direito.
- **Avisos (toasts):** já seguiam o visual do Maromba (centralizados no topo, fundo `--surface-3`, borda amarela, mesmo espaçamento e posição abaixo do cabeçalho no celular). Ajustado: aviso curto agora dura **2,2 s** como no Maromba (textos maiores duram mais, até 7 s) e a pilha tem `role="status"`. Diferenças mantidas de propósito: o Saldo empilha vários avisos, fecha ao tocar e tem variante de erro (borda vermelha); o Maromba mostra um por vez e tem botão de ação (ex.: desfazer).

### 25. Mudança de nome: Saldo Simples → Saldo (18/10)
- O app agora se chama **Saldo**. As trocas de "Saldo Simples" por "Saldo" nos arquivos e nos textos do app foram **feitas pelo desenvolvedor e conferidas**; este documento também foi atualizado.
- **Chave de armazenamento trocada:** `livro-caixa-dados-v2` → **`saldo-dados`**, e `livro-caixa-dados-v2-invalido` → `saldo-dados-invalido`. Foi feita **sem migração**, porque ainda não havia o app instalado em nenhum aparelho. O texto antigo de "livro-caixa" que aparecia em "Limpar tudo" também foi alterado.
- **Backup exportado:** o arquivo agora se chama `saldo-dados-AAAA-MM-DD.json` (antes `saldo-simples-backup-...`). Importar continua igual: o arquivo não guarda o nome da chave.
- **Não é mais pendência:** "migrar a chave `livro-caixa-dados-v2`" saiu da lista (feito) e o nome "livro-caixa" não aparece mais.
- Atenção: um aparelho que ainda tenha a versão com a chave antiga **não** terá os dados lidos pela versão nova. Nesse caso, exporte o backup na versão antiga e importe na nova.
- O nome do repositório no GitHub pode ser trocado sem afetar o app; o `appId` em `capacitor.config.json` é separado e não deve mudar depois de publicado. Os nomes de pasta `saldo-simples` que aparecem neste documento (estrutura e comandos) continuam como estavam, porque dependem de como a pasta local foi nomeada.

## Pontos de atenção
- **Backups exportados** se chamam `saldo-dados-AAAA-MM-DD.json` e **têm valores em centavos** (ex.: `120000` = R$ 1.200,00). Backups antigos (em reais) continuam importando. Um backup v3 **não** abre em versões antigas do app.
- **Desinstalar o app apaga todos os dados.** Instalar uma versão nova por cima mantém. Por isso o backup `.json` é o único seguro. A exportação nativa (item 19) já está no código, mas **precisa dos plugins instalados** e ser testada no aparelho.
- **Sem os plugins instalados, o app cai no download por link** (que costuma falhar no WebView) e o botão voltar do Android não funciona.
- **Preferências que não entram no backup** (ficam só no aparelho): `saldo_theme`, `saldo_ultimo_backup`, `saldo_backup_adiado` e `saldo_boas_vindas_ok`. Ao reinstalar e importar um backup, o aviso de backup e as boas-vindas recomeçam.
- **Saldo atual de meses já ajustados manualmente pode mudar** de valor, porque agora inclui o Mensal que já caiu. Basta reeditar o campo uma vez.
- **Itens que já existiam continuam recorrentes.** Para um item deixar de ser copiado, toque no ∞ para desmarcar (ele vira avulso no mês atual).
- O dia do gasto no Diário não pode ficar vazio (ver item 18).
- O lembrete de backup avisa, mas não envia notificação: só aparece com o app aberto no Diário.
- Item novo começa recorrente: a caixa de parcelas só aparece depois de tocar no ∞. Se preferir as duas opções visíveis desde o início, é um ajuste pequeno.
- Apagar um mês deixa itens parcelados que começavam nele "ativos" sem valor nesse mês (baixa gravidade).
- **A fonte só é embutida se o arquivo estiver em `src/fonts/PlusJakartaSans-latin.woff2`** (e `npm run sync` rodado). Sem o arquivo, o app usa a fonte padrão do sistema.
- **Teclado decimal e saldo negativo:** o campo "Saldo atual" usa teclado decimal; conferir no aparelho se ele permite digitar o sinal de menos (para saldo negativo). Se não permitir, trocar `inputmode` desse campo por `text`.
- Valores muito grandes (acima de ~R$ 99 milhões) ainda podem ser cortados com "…" no celular, mesmo na fonte mínima (10px).

## O que ainda precisa ser feito

### Lógica
0. **Item 23 (voltar ao saldo automático):** aviso "Saldo ajustado manualmente" no Diário + botão "Voltar ao automático" (ver item 23). Pendente.
1. **Apagar mês** deixa parcelados órfãos (ver Pontos de atenção); decidir se remove ou ajusta as parcelas.
2. Opcionais: marcar despesa como paga ("a pagar" × "pago"), categorias nos lançamentos do Diário. (A troca da chave de armazenamento foi concluída no item 25 e não é mais pendência.)
3. Opcional: o lembrete de backup poderia aparecer também no Mensal e no Anual (hoje só no Diário).

### Design
**Pendente (item 24, exceto a máscara de valores):** fonte embutida em `.woff2`, chips de parcela/∞ maiores (30px no computador, 36px no celular), apagar mês em Ajustes > Meses (tirando o × das abas), fonte dos valores que encolhe até caber nos cartões, posição do aviso "salvo ✓" no celular e duração dos toasts. Para avaliar depois de usar no aparelho:
1. Considerar um painel de edição ao tocar na linha (em vez de editar campo a campo).
2. Considerar botão "Desfazer" nos avisos de apagar gasto/mês, como o Maromba faz em alguns avisos.

### Verificação e implantação
0. **Instalar os plugins e sincronizar** (`npm i @capacitor/filesystem @capacitor/share @capacitor/app` e `npm run sync`). Conferir se o `@capacitor/core` é 7.1 ou mais novo (necessário para o `SystemBars`).
0b. **Copiar `fonts/PlusJakartaSans-latin.woff2` para `src/fonts/`** (a licença `OFL-LICENSE.txt` pode ir junto).
1. **Conferir o visual e os recursos no aparelho real**: cabeçalho com notch, barra inferior com gestos, painel de Ajustes, botão flutuante, painel de gasto rápido, chips de parcela/∞, carrossel e cartões do Anual, gráfico anual, modo escuro, teclado numérico, **navegação por dia e seletor de data nativo**, **exportar (menu de compartilhar) e importar (seletor de arquivo)**, **botão voltar**, **ícones da barra de status nos dois temas**, **lembrete de backup**, **pop-up de boas-vindas no primeiro uso (teclado de texto e botão voltar)**, **voltar ao saldo automático**, **campos de valor com teclado decimal**, **apagar mês em Ajustes**, **valores grandes nos cartões** e **posição do aviso "salvo ✓"**.
2. **Ícone do app** (`resources/icon.png`) e **appId definitivo** (a identidade do app na loja não muda depois).
3. **Termos de Uso e Política de Privacidade**: os links saíram junto com o cadastro. Se for publicar na Play Store, ela costuma pedir um link de política de privacidade mesmo para app sem login.
4. ~~**Git**: conferir o `.gitignore`~~ **Concluído em 19/10/2026:** o `.gitignore` já ignora `node_modules/`, `www/` e os builds do Android. Não é mais pendência.
5. Gerar o APK (Build > Generate App Bundles or APKs > Generate APKs, ou pelo terminal com `gradlew assembleDebug`, ver "Comandos do dia a dia") e guardar o arquivo para distribuição.

## Comandos do dia a dia

Rodar sempre no terminal do VS Code, na **raiz do projeto** (a pasta `saldo-simples`). Edite sempre os arquivos de `src/`, nunca os de `www/`.

### Sincronizar depois de mudar o código

```powershell
npm run sync
```
Comando principal. Roda `copiar-www.js` (copia `src/` para `www/`) e depois o `npx cap sync android`. **Use este depois de qualquer alteração em `src/`** (`index.html`, `style.css`, `app.js`, `fonts/`).

```powershell
npx cap sync
```
Copia o `www/` para o projeto Android e atualiza os plugins em **todas** as plataformas do projeto (aqui só existe o Android). **Não copia `src/` para `www/`**: sozinho, ele não leva alterações novas do código. Serve quando só `www/` ou os plugins mudaram.

```powershell
npx cap sync android
```
Igual ao `npx cap sync`, mas só para o Android. É a segunda metade do `npm run sync`. Também é o comando certo depois de instalar um plugin novo (`npm i @capacitor/...`).

### Gerar o APK pelo terminal

```powershell
cd android
./gradlew assembleDebug        # no Windows (PowerShell): .\gradlew.bat assembleDebug
cd ..
```
- O APK de teste (debug) sai em `android/app/build/outputs/apk/debug/app-debug.apk`. A pasta `build` fica escondida no VS Code pelo `.gitignore`; abra pelo Explorador do Windows.
- Se o Gradle reclamar do JDK, ele precisa do **JDK 21** (o JDK 25 não é aceito pelo Gradle 8.14.3 do projeto, ver item 17). Aponte o `JAVA_HOME` para um JDK 21 (por exemplo o `jbr` do Android Studio, se for 21).
- Instalar por cima de uma versão anterior (mesmo ID e mesma chave) **mantém os dados**. Mudar de chave ou desinstalar apaga: exporte o backup antes.

### Outros atalhos

```powershell
npx cap open android      # abre o projeto no Android Studio (alternativa: Build > Generate APKs)
npx cap run android       # compila e instala direto no celular conectado por USB (depuração USB ativada)
```

### Resumo: qual comando rodar quando

| O que mudou | O que rodar |
|---|---|
| Algo em `src/` (HTML, CSS, JS, fonte) | `npm run sync` e depois gerar o APK |
| Plugin novo (`npm i @capacitor/...`) | `npm run sync` (ou `npx cap sync android`) e depois gerar o APK |
| Só arquivos dentro de `android/` (`styles.xml`, `AndroidManifest.xml`, `build.gradle`) | Só gerar o APK, sem sync |
| Clone novo ou outro computador | `npm install`, `npm run sync` e depois gerar o APK |

Se o sync der erro de "no such file", falta algum arquivo na lista do `copiar-www.js` (ou sobrou um que foi apagado). Arquivo ou pasta novos que o app use precisam entrar nessa lista. Não rodar `npm audit fix --force`.

## Arquivos
- `src/index.html`
- `src/style.css` (contém todos os estilos)
- `src/app.js`
- `src/fonts/PlusJakartaSans-latin.woff2` (+ `OFL-LICENSE.txt`)
- `copiar-www.js`, `capacitor.config.json`, `package.json`
- `README.md`
- `saldo.md` (este arquivo; antes `ss.md`)
