<div align="center">

# 💰 Saldo

### Receitas, despesas e gastos do dia num app só. 100% offline, 100% seu.

*Sem servidor. Sem internet. Sem conta. Seus dados ficam no seu celular.*

<br>

![Plataforma](https://img.shields.io/badge/plataforma-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Offline](https://img.shields.io/badge/100%25-offline-success?style=for-the-badge)

<br>

[📥 Baixar](#-instalação) · [✨ Funcionalidades](#-funcionalidades) · [🚀 Como usar](#-como-usar) · [💾 Backup](#-backup-dos-dados) · [🛠️ Desenvolvimento](#️-desenvolvimento)

</div>

---

## 📖 Sobre

O **Saldo** é um app de controle financeiro pessoal pensado para quem quer praticidade e privacidade. Ele funciona inteiramente no aparelho: não precisa de login, não envia nada para a nuvem e não depende de conexão.

Feito com **JavaScript, HTML e CSS puros**, empacotado como APK com **Capacitor**.

## ✨ Funcionalidades

| | Recurso | O que faz |
|---|---|---|
| 📅 | **Controle mensal** | Receitas e despesas fixas de cada mês, com dia, valor e totais |
| 📆 | **Controle diário** | Gastos do dia a dia, saldo atual e saldo projetado até o fim do mês |
| ⚡ | **Gasto rápido** | Botão "+" flutuante para registrar um gasto em segundos |
| 📊 | **Resumo anual** | Totais por ano, gráfico de receitas × despesas e carrossel de anos |
| 🔁 | **Recorrentes, avulsos e parcelados** | Cada item é copiado, fica só no mês ou é dividido em parcelas |
| 🌗 | **Tema claro e escuro** | Troca pelo botão do cabeçalho |
| 💾 | **Backup** | Exporte e importe tudo em um único arquivo `.json` |

## 📥 Instalação

1. Baixe o APK na página de **[Releases](../../releases)** (ou gere o seu, veja [Desenvolvimento](#️-desenvolvimento)).
2. Passe o arquivo para o celular.
3. Permita a instalação de **fontes desconhecidas**.
4. Abra o arquivo e instale.

> [!TIP]
> Instalar uma versão nova **por cima** da anterior mantém seus dados.

> [!WARNING]
> **Desinstalar o app apaga tudo.** Exporte um backup antes (veja [Backup dos dados](#-backup-dos-dados)).

## 🚀 Como usar

A barra inferior tem três telas: **Mensal**, **Diário** (no centro, é a que abre primeiro) e **Anual**.

<details>
<summary><b>1. 📅 Controle mensal</b></summary>
<br>

Cada mês é uma aba (chip) no topo. Dentro dele você lança **receitas** e **despesas** com nome, dia e valor.

- O botão **"+"** cria o mês seguinte e **copia os valores recorrentes** do mês anterior. Ajuste só o que mudou.
- Cada item tem um tipo, mostrado nos chips sob o nome:

| Tipo | Como ativar | Comportamento |
|---|---|---|
| **Recorrente (∞)** | Padrão | Aparece em todos os meses e é copiado pelo "+" |
| **Avulso** | Toque no ∞ para desmarcar | Existe só no mês em que foi lançado |
| **Parcelado** | Informe mais de 1 parcela | Mostra o andamento (ex.: 3/6) e termina sozinho |

Apagar o número de parcelas volta o item para recorrente.
</details>

<details>
<summary><b>2. 📆 Controle diário</b></summary>
<br>

Registre os gastos do dia a dia. O topo mostra três cartões:

- **Despesas** do mês;
- **Saldo atual**: saldo inicial + receitas/despesas do Mensal que já aconteceram − gastos do Diário. É editável (toque no lápis ou no valor);
- **Projetado**: como o mês termina, considerando o Mensal inteiro.

O saldo inicial do mês seguinte é o projetado do mês anterior.
</details>

<details>
<summary><b>3. ⚡ Gasto rápido</b></summary>
<br>

No Diário, o círculo amarelo "+" acima da barra inferior abre um painel com **valor**, **descrição** e **dia** (hoje, por padrão). O gasto entra no mês aberto e o saldo atualiza na hora.

O valor aceita `18,50`, `18.50` e `1.234` (R$ 1.234,00).
</details>

<details>
<summary><b>4. 📊 Resumo anual</b></summary>
<br>

Abas por ano, cartões gerais (despesas, receitas e saldo geral) e um carrossel que desliza de ano em ano. Cada ano traz um gráfico de barras de janeiro a dezembro; toque numa barra para ver os valores.
</details>

<details>
<summary><b>5. ⚙️ Ajustes</b></summary>
<br>

A engrenagem do cabeçalho abre o painel com:

- exportar e importar backup `.json`;
- data do último backup;
- carregar dados de exemplo;
- limpar tudo.
</details>

## 💾 Backup dos dados

Como tudo fica no aparelho, exporte de vez em quando e guarde o arquivo fora do celular (Drive, e-mail). Vá em **Ajustes**:

| Ação | O que acontece |
|---|---|
| **Exportar backup (.json)** | Gera um arquivo com todos os meses, receitas, despesas e gastos |
| **Importar backup (.json)** | Lê um arquivo exportado e **substitui** os dados atuais (pede confirmação) |

Para trocar de celular: **exporte no antigo, importe no novo.**

> [!NOTE]
> Os valores são guardados em **centavos** (ex.: `120000` = R$ 1.200,00). Backups antigos, em reais, são convertidos automaticamente na importação. Um backup novo não abre em versões antigas do app.

## 🛠️ Desenvolvimento

**Pré-requisitos:** Node.js e Android Studio (use o **JDK 21** no Gradle).

> [!IMPORTANT]
> Edite sempre os arquivos em `src/`. A pasta `www/` é gerada automaticamente.

```powershell
npm install            # primeira vez, ou em outro computador/clone novo
npm run sync           # copia src/ para www/ e sincroniza com o projeto Android
npx cap open android   # abre o projeto no Android Studio
```

Depois de **qualquer** mudança no código:

1. Rode `npm run sync`.
2. No Android Studio: **Build → Generate App Bundles or APKs → Generate APKs**.
3. O arquivo fica em `android/app/build/outputs/apk/debug/app-debug.apk`.

Se criar arquivos ou pastas novos que o app use, inclua-os no `copiar-www.js`.

### 📁 Estrutura do projeto

```
saldo/
├── src/                     # fontes do app (index.html, style.css, app.js e fonts/)
├── resources/icon.png       # ícone do app
├── android/                 # projeto Android gerado pelo Capacitor
├── www/                     # gerado por `npm run sync` (não editar nem versionar)
├── copiar-www.js            # script que copia src/ para www/
├── capacitor.config.json
└── package.json
```

### 🔌 Plugins nativos

| Plugin | Uso |
|---|---|
| `@capacitor/filesystem` | Backup (exportar/importar) |
| `@capacitor/share` | Backup (menu de compartilhar) |
| `@capacitor/app` | Botão voltar do Android |
| `@capacitor/status-bar` | Cor da barra de status acompanhando o tema |

## 🙏 Créditos

- Empacotamento: [Capacitor](https://capacitorjs.com/).
- Fonte: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans).

<div align="center">
<br>

</div>
