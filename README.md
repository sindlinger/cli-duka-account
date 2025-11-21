# cli-duka-account

Automação em linha de comando para:
1) Abrir a página de demo da Dukascopy, preencher o formulário e enviar.
2) Ler o e-mail de confirmação (IMAP) e extrair login/senha, mostrando validade de 14 dias.

## Requisitos
- Node.js 18+ (use o Playwright incluso em `node_modules`).
- Conta de e-mail IMAP (ou Gmail com IMAP habilitado).

## Instalação
No WSL/Linux:
```bash
npm install
npm link   # disponibiliza o binário cli-demo-account no PATH
```

No Windows (PowerShell, no mesmo diretório):
```powershell
npm install
npm link   # cria o shim cli-demo-account.cmd no PATH global
```

## Configuração (.env)
Crie `.env` ao lado do script com:
```
GMAIL_E_MAIL=seu@email
GMAIL_PASSWORD=sua_senha_ou_app_password
MAIL_HOST=imap.gmail.com
MAIL_PORT=993
MAIL_USER=seu_login_imap
MAIL_PASS=sua_senha_imap
DEMO_FIRST_NAME=SeuNome
DEMO_LAST_NAME=SeuSobrenome
DEMO_PHONE_COUNTRY=BR
DEMO_PHONE_NUMBER=11999999999
```

## Uso
- Pipeline completo (formulário + e-mail):
  ```bash
  cli-demo-account
  ```
- Só ler e-mail:
  ```bash
  cli-demo-account mail
  ```

## Flags úteis
- `--headless` / `--no-headless` : força modo sem/sem cabeça (default mostra janela).
- `--browser firefox|chromium` : escolhe navegador Playwright.
- `--lookback N` : quantas últimas mensagens analisar (default 500).
- `--quiet` : oculta logs de etapa, mostra só resultado.

## Saída esperada
```
CREDENCIAIS ENCONTRADAS | login: DEMO21 | senha: AaxQX | enviado: 2025-11-21T14:19:33.000Z | expira: 2025-12-05T14:19:33.000Z | resta: 13.9 dias (333.8h)
```
Também imprime um bloco detalhado com login, senha, enviado/expira e tempo restante.

## Notas
- O lookback pode ser aumentado se o e-mail estiver mais antigo: `--lookback 1000`.
- Para Gmail arquivado, pode apontar `MAIL_BOX="[Gmail]/All Mail"`.
