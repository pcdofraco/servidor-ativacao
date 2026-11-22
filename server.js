const express  = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Variáveis de ambiente (configuradas no Render) ──────────────────────────
// RESEND_API_KEY  → chave da API do Resend (resend.com)
// EMAIL_FROM      → ex: "PC do Fraco <ativacao@pcdofraco.com>"
// WEBHOOK_SECRET  → token secreto para validar que o webhook veio da Cakto
// (opcional mas recomendado — você define um texto qualquer e coloca na Cakto)

// ─── Gerador de key (mesma lógica do electron/main.js) ───────────────────────
// Recebe o HWID de 13 chars e retorna a key de ativação de 17 chars
function gerarKey(hwid) {
  const base = hwid.toUpperCase().replace(/[-\s]/g, "");
  if (base.length !== 13) return null;

  let key = "";
  key += base.substring(0, 3);   // AAA
  key += "X";                     // inserido
  key += base.substring(3, 7);   // BBBB
  key += "Q";                     // inserido
  key += base.substring(7, 11);  // CCCC
  key += "K";                     // inserido
  key += base.substring(11, 13); // DD
  key += "Z";                     // inserido
  // Resultado: 17 chars — AAAXBBBBQCCCCKDDZ

  // Formatar com hífens para ficar legível: AAAX-BBBQ-CCCK-CDDZ
  // (grupos de 4 sem quebrar a lógica de validação)
  return `${key.substring(0,4)}-${key.substring(4,8)}-${key.substring(8,12)}-${key.substring(12,17)}`;
}

// ─── Envio de email via Resend ────────────────────────────────────────────────
async function enviarEmail({ para, nome, key }) {
  // Resend usa SMTP com API key como senha
  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: process.env.RESEND_API_KEY,
    },
  });

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0b0f17;color:#e8f1ff;border-radius:16px;">
      <h2 style="margin:0 0 8px;font-size:20px;">PC do Fraco <span style="color:#2b8fef">Plus</span> ativado! 🎉</h2>
      <p style="color:#8899aa;font-size:14px;margin:0 0 24px;">Olá${nome ? `, ${nome}` : ""}! Sua chave de ativação está pronta.</p>

      <div style="background:#151b28;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;border:1px solid rgba(43,143,239,0.2)">
        <p style="margin:0 0 8px;font-size:12px;color:#8899aa;text-transform:uppercase;letter-spacing:0.07em">Sua chave</p>
        <p style="margin:0;font-size:22px;font-weight:800;letter-spacing:0.12em;color:#2b8fef;font-family:monospace">${key}</p>
      </div>

      <p style="font-size:13px;color:#8899aa;line-height:1.6;margin:0 0 16px;">
        Para ativar: abra o <strong style="color:#e8f1ff">PC do Fraco</strong>, vá em
        <strong style="color:#e8f1ff">✨ Plus</strong> na barra lateral e cole a chave acima.
      </p>

      <p style="font-size:11px;color:#445566;margin:0;">
        Esta chave é vinculada ao seu PC e só funciona nele. Guarde em lugar seguro.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "PC do Fraco <ativacao@pcdofraco.com>",
    to: para,
    subject: "🎮 Sua chave do PC do Fraco Plus",
    html,
  });
}

// ─── Rota de saúde (Render exige) ────────────────────────────────────────────
app.get("/", (_, res) => res.json({ ok: true, service: "pcdofraco-ativacao" }));

// ─── Webhook da Cakto ─────────────────────────────────────────────────────────
// Formato real da Cakto:
// { secret, event, data: [ { customer: { name, email }, utm_content, utm_term, ... } ] }
app.post("/webhook/cakto", async (req, res) => {
  try {
    const body = req.body;

    // Validar secret — a Cakto envia na raiz do payload
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && body.secret !== secret) {
      console.warn("Webhook com secret inválido:", body.secret);
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Só processar compras aprovadas
    if (body.event !== "purchase_approved") {
      return res.status(200).json({ ok: true, msg: "Evento ignorado", event: body.event });
    }

    // data é um array — pegar o item principal (offer_type === "main")
    const itens = Array.isArray(body.data) ? body.data : [];
    const principal = itens.find(i => i.offer_type === "main") || itens[0];

    if (!principal) {
      console.error("Webhook sem itens no data:", JSON.stringify(body));
      return res.status(200).json({ warning: "Nenhum item encontrado no payload" });
    }

    const email = principal?.customer?.email;
    const nome  = principal?.customer?.name || "";
    // HWID vem via UTM — o app abre a Cakto com ?hwid=XXXXX na URL
    // A Cakto repassa em utm_content ou utm_term
    const hwid  = principal?.utm_content || principal?.utm_term || principal?.sck;

    if (!email) {
      console.error("Webhook sem email:", JSON.stringify(principal));
      return res.status(200).json({ warning: "Email não encontrado" });
    }

    if (!hwid) {
      console.error("Webhook sem HWID — cliente não veio do app?", JSON.stringify(principal));
      // Ainda responde 200 para a Cakto não retentar infinitamente
      return res.status(200).json({ warning: "HWID não encontrado — compra manual ou direto pelo link sem passar pelo app" });
    }

    const key = gerarKey(hwid.trim());
    if (!key) {
      console.error("HWID inválido (precisa ter 13 chars):", hwid);
      return res.status(200).json({ warning: "HWID com formato inválido", hwid });
    }

    console.log(`✅ Ativação — email: ${email} | hwid: ${hwid} | key: ${key}`);

    await enviarEmail({ para: email, nome, key });

    return res.json({ ok: true, email, key });
  } catch (err) {
    console.error("Erro no webhook:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// ─── Rota manual (para você testar ou gerar key manualmente) ─────────────────
// POST /gerar { hwid: "XXXXXXXXXXXXX", email: "cliente@email.com", nome: "João", admin_key: "..." }
app.post("/gerar", async (req, res) => {
  const { hwid, email, nome, admin_key } = req.body;

  // Proteger com a mesma WEBHOOK_SECRET
  if (admin_key !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!hwid || !email) return res.status(400).json({ error: "hwid e email são obrigatórios" });

  const key = gerarKey(hwid.trim());
  if (!key) return res.status(400).json({ error: "HWID inválido" });

  try {
    await enviarEmail({ para: email, nome: nome || "", key });
    console.log(`🔑 Key manual — email: ${email} | hwid: ${hwid} | key: ${key}`);
    return res.json({ ok: true, key });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao enviar email", detail: String(err) });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PC do Fraco Ativação rodando na porta ${PORT}`));
