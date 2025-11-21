#!/usr/bin/env node
import { chromium, firefox } from 'playwright';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import process from 'node:process';

// Carrega .env do diretório do script (independe do cwd)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.ENV_PATH || path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// ---------------------------
// CLI args (subcommands/flags)
// ---------------------------
const cliArgs = process.argv.slice(2);
let mailOnly = false;          // se true, só leitura de e-mail
let headlessCli = null;        // null mantém default/env, true/false força
let browserCli = null;         // firefox|chromium
let saveLastMail = process.env.SAVE_LAST_MAIL === 'true';
let quiet = false;             // suprime logs de etapa
let lookback = process.env.MAIL_LOOKBACK ? Number(process.env.MAIL_LOOKBACK) : 500; // quantas mensagens olhar a partir do fim
let fromUid = process.env.MAIL_FROM_UID ? Number(process.env.MAIL_FROM_UID) : null; // força início por UID (desaconselhado no modo mail-only)

// cores simples
const useColor = process.stdout.isTTY;
const color = {
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

if (cliArgs.includes('mail')) mailOnly = true;
if (cliArgs.includes('run')) mailOnly = false;

cliArgs.forEach((arg, idx) => {
  if (arg === '--mail-only') mailOnly = true;
  if (arg === '--headless') headlessCli = true;
  if (arg === '--no-headless') headlessCli = false;
  if (arg === '--save-mail') saveLastMail = true;
  if (arg === '--browser' && cliArgs[idx + 1]) browserCli = cliArgs[idx + 1];
  if (arg === '--quiet') quiet = true;
  if (arg === '--lookback' && cliArgs[idx + 1]) lookback = Number(cliArgs[idx + 1]);
  if (arg === '--from-uid' && cliArgs[idx + 1]) fromUid = Number(cliArgs[idx + 1]);
});
// ---------------------------

const cfg = {
  firstName: process.env.DEMO_FIRST_NAME ?? 'SeuNome',
  lastName: process.env.DEMO_LAST_NAME ?? 'Sobrenome',
  email: process.env.GMAIL_E_MAIL ?? process.env['GMAIL_E-MAIL'],
  phoneCountry: process.env.DEMO_PHONE_COUNTRY ?? 'BR',
  phoneNumber: process.env.DEMO_PHONE_NUMBER ?? '11999999999',
  language: process.env.DEMO_LANGUAGE ?? 'English',
  traderCurrency: process.env.DEMO_TRADER_CURRENCY ?? 'USD',
  traderBalance: process.env.DEMO_TRADER_BALANCE ?? '5000',
  mt5Currency: process.env.DEMO_MT5_CURRENCY ?? 'USD',
  mt5Balance: process.env.DEMO_MT5_BALANCE ?? '5000',
  gmailPassword: process.env.GMAIL_PASSWORD,
  mailHost: process.env.MAIL_HOST,
  mailPort: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : 993,
  mailUser: process.env.MAIL_USER,
  mailPass: process.env.MAIL_PASS,
  mailBox: process.env.MAIL_BOX ?? 'INBOX',
  mailSubject: process.env.MAIL_SUBJECT ?? '',
  mailPollMs: process.env.MAIL_POLL_MS ? Number(process.env.MAIL_POLL_MS) : 60000,
};

if (!cfg.email) {
  throw new Error('Preencha GMAIL_E-MAIL (ou GMAIL_E_MAIL) no .env localizado em ' + envPath);
}

const stageLog = {
  t0: Date.now(),
  stages: [],
  log(msg) {
    if (!quiet) console.log(color.dim(`[${new Date().toISOString()}] ${msg}`));
  },
  start(name) {
    const s = { name, start: Date.now() };
    this.log(`INÍCIO ETAPA: ${name}`);
    return s;
  },
  end(s) {
    s.end = Date.now();
    s.duration = s.end - s.start;
    this.stages.push(s);
    const sinceStart = ((s.end - this.t0) / 1000).toFixed(2);
    this.log(
      `FIM ETAPA: ${s.name} em ${(s.duration / 1000).toFixed(2)}s | acumulado ${sinceStart}s`
    );
  },
  summary() {
    this.log('--- RESUMO DE ETAPAS ---');
    this.stages.forEach((s) =>
      this.log(`${s.name}: ${(s.duration / 1000).toFixed(2)}s`)
    );
    const total = ((Date.now() - this.t0) / 1000).toFixed(2);
    this.log(`TOTAL: ${total}s`);
  },
};

async function submitForm(page) {
  const stage = stageLog.start('Carregar página Dukascopy');
  const targetUrl = 'https://www.dukascopy.com/europe/english/forex/demo-fx-account/';
  stageLog.log(`Abrindo página: ${targetUrl}`);
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
  });
  stageLog.end(stage);

  await page.getByRole('button', { name: /i agree/i }).click({ timeout: 3000 }).catch(() => {});

  const fillStage = stageLog.start('Preencher formulário');
  await page.fill('#demo-firstName', cfg.firstName);
  await page.fill('#demo-lastName', cfg.lastName);
  await page.fill('#demo-email', cfg.email);
  await page.locator('#demo-country').selectOption({ value: cfg.phoneCountry }, { force: true });
  await page.fill('#demo-phone', cfg.phoneNumber);
  await page.locator('#demo-lang').selectOption({ label: cfg.language }, { force: true });

  await page.locator('#demo-jforex').check({ force: true });
  await page.locator('#demo-mt5').check({ force: true });

  await page.locator('#demo-traderCurrency').selectOption({ value: cfg.traderCurrency }, { force: true });
  await page.locator('#demo-traderBalance').selectOption({ value: cfg.traderBalance }, { force: true });
  await page.locator('#demo-mt5Currency').selectOption({ value: cfg.mt5Currency }, { force: true });
  await page.locator('#demo-mt5Balance').selectOption({ value: cfg.mt5Balance }, { force: true });
  stageLog.end(fillStage);

  const sendStage = stageLog.start('Enviar formulário');
  await page.getByRole('button', { name: /Get Demo Account/i }).click();
  // Esperar mensagem de sucesso (mesmo que escondida) ou 12s no máximo
  stageLog.log('Procurando pela mensagem de confirmação...');
  const successPromise = Promise.race([
    page.waitForSelector('text=/check your email/i', {
      timeout: 12000,
      state: 'attached', // não precisa estar visível
    }),
    page.waitForTimeout(12000),
  ]);
  const successState = await successPromise
    .then(() => 'found')
    .catch(() => 'timeout');
  if (successState === 'found') stageLog.log('Mensagem de confirmação encontrada.');
  stageLog.end(sendStage);

  // Se apareceu CAPTCHA, resolver manualmente
  stageLog.log('Procurando por CAPTCHA...');
  const hasCaptcha = await page.getByText(/CAPTCHA/i).first().isVisible().catch(() => false);
  if (hasCaptcha) {
    const sCap = stageLog.start('Resolver CAPTCHA manualmente');
    await solveCaptcha(page);
    stageLog.end(sCap);
  }
}

async function solveCaptcha(page) {
  // Tira screenshot para o usuário enxergar o CAPTCHA no modo headless
  const shotPath = 'captcha.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  const fullPath = `${process.cwd()}/${shotPath}`;
  stageLog.log(`CAPTCHA detectado. Abra a imagem: file://${fullPath}`);
  stageLog.log('Screenshot (imagem capturada). Arquivo salvo e enviado ao usuário.');
  stageLog.log('Captcha enviado ao usuário (solicitação de digitação no terminal).');

  const rl = readline.createInterface({ input, output });
  const value = await rl.question('Digite o CAPTCHA exibido na imagem captcha.png: ');
  await rl.close();

  // localiza o input logo após o texto "CAPTCHA" ou o último input visível
  let captchaInput = page.locator('xpath=//text()[contains(.,"CAPTCHA")]/following::input[1]');
  if (!(await captchaInput.count())) {
    captchaInput = page.locator('input[type="text"]').last();
  }
  await captchaInput.fill(value.trim());

  // clique no botão Get Demo Account
  await page.getByRole('button', { name: /Get Demo Account/i }).click();
  await Promise.race([
    page.waitForSelector('text=/check your email/i', { timeout: 12000, state: 'attached' }),
    page.waitForTimeout(12000),
  ]);
}

const userMessages = []; // coletar saídas finais amigáveis

async function parseAndReport(text, envelope) {
  const clean = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const loginRe = /\bDEMO[0-9A-Za-z]+\b/g;
  const passRe = /\b(?:Password|Senha)\s*[:：]?\s*([0-9A-Za-z]{4,12})/gi;
  const loginGenericRe = /login\s*[:：]?\s*([0-9A-Za-z._-]+)/gi;

  const logins = [];
  const passes = [];
  let m;
  while ((m = loginRe.exec(clean))) logins.push(m[0]);
  while ((m = passRe.exec(clean))) passes.push(m[1]);
  while ((m = loginGenericRe.exec(clean))) logins.push(m[1]);

  const sentDate = envelope?.date ? new Date(envelope.date) : new Date();
  const expiry = new Date(sentDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const remainingMs = expiry.getTime() - Date.now();
  const remainingDays = Math.max(0, remainingMs / (1000 * 60 * 60 * 24));
  const remainingHours = Math.max(0, remainingMs / (1000 * 60 * 60));

  const humanLine = (prefix, extra = '') =>
    `${prefix} | login: ${logins[0] || '(não encontrado)'} | senha: ${
      passes[0] || '(não encontrado)'
    } | enviado: ${sentDate.toISOString()} | expira: ${expiry.toISOString()} | resta: ${remainingDays.toFixed(
      1
    )} dias (${remainingHours.toFixed(1)}h)${extra}`;
  const pretty = (prefix) => [
    prefix,
    `  ${color.cyan('login ')}: ${color.bold(logins[0] || '(não encontrado)')}`,
    `  ${color.cyan('senha ')}: ${color.bold(passes[0] || '(não encontrado)')}`,
    `  ${color.cyan('enviado')}: ${sentDate.toISOString()}`,
    `  ${color.cyan('expira ')}: ${expiry.toISOString()}`,
    `  ${color.cyan('resta  ')}: ${remainingDays.toFixed(1)} dias (${remainingHours.toFixed(1)}h)`,
  ].join('\n');

  const headerSuccess = color.green(color.bold('CREDENCIAIS ENCONTRADAS'));
  const headerLogin = color.cyan('LOGIN ENCONTRADO (senha ausente)');
  const headerPass = color.cyan('SENHA ENCONTRADA (login ausente)');

  if (logins.length && passes.length) {
    const line = humanLine(headerSuccess);
    const block = pretty(headerSuccess);
    console.log(line);
    console.log(block);
    userMessages.push(line, block);
    return true;
  } else if (logins.length) {
    const line = humanLine(headerLogin);
    const block = pretty(headerLogin);
    console.log(line);
    console.log(block);
    userMessages.push(line, block);
    return true;
  } else if (passes.length) {
    const line = humanLine(headerPass);
    const block = pretty(headerPass);
    console.log(line);
    console.log(block);
    userMessages.push(line, block);
    return true;
  }
  return false;
}

async function readMail(startUid = null) {
  const sMail = stageLog.start('Ler e-mail via IMAP');

  // Prefer IMAP if provided; fall back to web Gmail (legacy)
  if (cfg.mailHost && cfg.mailUser && cfg.mailPass) {
    const client = new ImapFlow({
      host: cfg.mailHost,
      port: cfg.mailPort,
      secure: cfg.mailPort === 993,
      auth: { user: cfg.mailUser, pass: cfg.mailPass },
      logger: false, // silencia logs verbosos do ImapFlow
    });
    stageLog.log('INÍCIO SUBETAPA: Conectar IMAP');
    await client.connect();
    stageLog.log('IMAP conectado e autenticado (FIM SUBETAPA: Conectar IMAP)');
    stageLog.log('INÍCIO SUBETAPA: Abrir mailbox');
    await client.mailboxOpen(cfg.mailBox);
    stageLog.log(`Mailbox ${cfg.mailBox} aberta (${client.mailbox.exists} mensagens). (FIM SUBETAPA: Abrir mailbox)`);
    // Se não informaram startUid, buscamos últimas 20 mensagens
    // Se já recebemos um startUid (do pipeline completo), prioriza a partir dele.
    // No modo isolado (SKIP_FORM), não restringe pelo UID de envio: busca últimas 50.
    // Use range por número de sequência (estável para "últimas N mensagens" no modo mail-only)
    const seqStart = Math.max(1, client.mailbox.exists - lookback + 1);
    stageLog.log(`LOOKBACK: últimas ${lookback} mensagens por sequência (SEQ >= ${seqStart})`);
    stageLog.log(
      'Critérios de busca: assunto REMETE contém "dukascopy", "demo account", "time to trade", "conta demo" OU remetente com dukascopy/@dukascopy ou termo definido em MAIL_SUBJECT.'
    );

    const deadline = Date.now() + cfg.mailPollMs;
    let found = false;
    let lastMatch = null;
    let lastParsed = null;
    let sweep = 0;

    function matchesDukascopy(msg) {
      const subj = (msg.envelope.subject || '').toLowerCase();
      const from = (msg.envelope.from || [])
        .map((a) => `${a.name || ''} ${a.address || ''}`.toLowerCase())
        .join(' ');
      const term = (cfg.mailSubject || '').toLowerCase();
      if (term && subj.includes(term)) return true;
      if (subj.includes('dukascopy')) return true;
      if (subj.includes('demo account')) return true;
      if (subj.includes('time to trade')) return true;
      if (subj.includes('conta demo')) return true;
      if (from.includes('dukascopy')) return true;
      if (from.match(/@dukascopy/i)) return true;
      return false;
    }

    while (Date.now() < deadline && !found) {
      sweep += 1;
      // Busca mensagens mais recentes primeiro
      stageLog.log(`INÍCIO SUBETAPA: Varrer mensagens (#${sweep})`);
      const lock = await client.getMailboxLock(cfg.mailBox);
      try {
        const received = [];
        const range = `${seqStart}:*`; // intervalo por sequência (últimas N)
        for await (const msg of client.fetch(range, {
          envelope: true,
          source: true,
          flags: true,
        })) {
          received.push(msg);
        }
        received.reverse(); // mais recentes primeiro
        stageLog.log(
          `Varredura #${sweep}: ${received.length} mensagens analisadas (SEQ >= ${seqStart}).`
        );
        let foundThisSweep = false;
        for (const msg of received) {
          if (matchesDukascopy(msg)) {
            stageLog.log(`Mensagem candidata encontrada: "${msg.envelope.subject || '(sem assunto)'}" de ${(msg.envelope.from || []).map((a)=>a.address).join(',')}`);
            const text = msg.source.toString();
            if (process.env.SAVE_LAST_MAIL === 'true') {
              const fs = await import('node:fs');
              fs.writeFileSync('last-mail.eml', text);
            }

            const ok = await parseAndReport(text, msg.envelope);
            if (ok) {
              stageLog.log('FIM SUBETAPA: Varrer mensagens (credenciais encontradas)');
              found = true;
              foundThisSweep = true;
              lastParsed = msg.envelope.subject || '(sem assunto)';
              break;
            } else {
              lastMatch = msg.envelope.subject || '(sem assunto)';
            }
          }
        }
        if (!foundThisSweep) {
          stageLog.log(
            `FIM SUBETAPA: Varrer mensagens (#${sweep}) — nenhuma candidata nas ${received.length} mensagens analisadas (SEQ >= ${seqStart})`
          );
        }
      } finally {
        lock.release();
      }
      if (!found) {
        await new Promise((res) => setTimeout(res, 4000));
        await client.mailboxOpen(cfg.mailBox); // refresh exists
      }
    }
    if (!found) {
      if (lastParsed) {
        const line = color.yellow(`Mensagem Dukascopy encontrada, mas login/senha não foram identificados. Assunto: ${lastParsed}`);
        console.log(line);
        if (quiet) userMessages.push(line);
      } else if (lastMatch) {
        const line = color.yellow(`Mensagem possivelmente da Dukascopy encontrada, mas login/senha não foram identificados. Assunto: ${lastMatch}`);
        console.log(line);
        if (quiet) userMessages.push(line);
      } else {
        const line = color.yellow('Nenhuma mensagem com remetente/assunto da Dukascopy nas últimas mensagens analisadas.');
        console.log(line);
        if (quiet) userMessages.push(line);
      }
    }
    await client.logout();
    stageLog.end(sMail);
    return;
  }

  if (!cfg.gmailPassword) {
    throw new Error('Set MAIL_* para IMAP ou forneça GMAIL_PASSWORD para fallback web.');
  }

  const mail = await browser.newPage();
  await mail.goto('https://accounts.google.com/');
  await mail.fill('input[type="email"]', cfg.email);
  await mail.getByRole('button', { name: /next/i }).click();
  await mail.waitForSelector('input[name="Passwd"]', { timeout: 15000 });
  await mail.fill('input[name="Passwd"]', cfg.gmailPassword);
  await mail.getByRole('button', { name: /next/i }).click();
  await mail.waitForNavigation({ waitUntil: 'domcontentloaded' });

  await mail.goto('https://mail.google.com/mail/u/0/h/');
  await mail.waitForSelector('a:has-text("Dukascopy")', { timeout: 20000 });
  await mail.locator('a:has-text("Dukascopy")').first().click();

  const body = await mail.locator('body').innerText();
  const login = body.match(/Login[:\s]+(\S+)/i)?.[1];
  const password = body.match(/Password[:\s]+(\S+)/i)?.[1];
      const line = `CREDENCIAIS ENCONTRADAS (fallback web) | login: ${login} | senha: ${password}`;
  console.log(line);
  if (quiet) userMessages.push(line);
  stageLog.end(sMail);
}

async function main() {
  const browserChoice = browserCli || process.env.BROWSER || 'firefox';
  const browserType = browserChoice === 'firefox' ? firefox : chromium;
  const headless =
    headlessCli !== null
      ? headlessCli
      : process.env.HEADLESS === 'true'
      ? true
      : process.env.HEADLESS === 'false'
      ? false
      : false; // padrão: mostrar janela (ajuda no X410)

  const launchArgs = [
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
  ];

  let browser;
  try {
    let startUid = null;

    if (!mailOnly) {
      const sLaunch = stageLog.start(`Lançar navegador (${browserChoice})`);
      const launchOptions = {
        headless,
        args: launchArgs,
      };
      // Use system Chrome only if explicitly set; otherwise use bundled Playwright Chromium (mais estável no WSL)
      if (process.env.CHROME_BIN) {
        launchOptions.executablePath = process.env.CHROME_BIN;
      }
      browser = await browserType.launch(launchOptions);
      const page = await browser.newPage();
      stageLog.end(sLaunch);

      const sForm = stageLog.start('Submeter formulário Dukascopy');
      await submitForm(page);
      stageLog.end(sForm);
    } else {
      stageLog.log('Pulando etapa de formulário (SKIP_FORM=true)');
    }

    await readMail(startUid);
  } finally {
    if (browser) await browser.close();
    if (!quiet) stageLog.summary();
    // Evita duplicar: só mostra resumo se quiet OU se usuário perdeu no scroll
    if (quiet && userMessages.length) {
      console.log('--- RESULTADO ---');
      for (const line of userMessages) console.log(line);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
