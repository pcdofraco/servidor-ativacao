# PC do Fraco — Servidor de Ativação

## O que faz
Recebe o webhook da Cakto após uma compra confirmada,
gera a chave de ativação do HWID do cliente e envia por email.

---

## PASSO 1 — Resend (email gratuito)

1. Acesse https://resend.com e crie uma conta gratuita
2. Em **API Keys**, clique em **Create API Key** → copie a chave (começa com `re_`)
3. Em **Domains**, adicione seu domínio (ex: pcdofraco.com) e siga a verificação DNS
   - Se não tiver domínio, use o domínio padrão do Resend por enquanto (limitado)

---

## PASSO 2 — Render (servidor gratuito)

1. Acesse https://render.com e crie uma conta
2. Clique em **New → Web Service**
3. Conecte seu GitHub e faça upload deste projeto
   (ou use **Deploy from existing repository** se já estiver no GitHub)
4. Configure:
   - **Name:** pcdofraco-ativacao
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Em **Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `RESEND_API_KEY` | sua chave do Resend (re_...) |
   | `EMAIL_FROM` | PC do Fraco <ativacao@seudominio.com> |
   | `WEBHOOK_SECRET` | qualquer texto secreto que você inventar (ex: pcdofraco2024xk) |

6. Clique em **Create Web Service** — o Render vai fazer o deploy
7. Copie a URL do servidor (ex: `https://pcdofraco-ativacao.onrender.com`)

---

## PASSO 3 — Cakto

1. No painel da Cakto, abra seu produto
2. Em **Configurações do Produto → URL de obrigado/checkout**, coloque:
   ```
   https://pcdofraco-ativacao.onrender.com/obrigado
   ```
   (não é necessário — a chave vai por email)

3. Em **Integrações → Webhook**, adicione:
   - **URL:** `https://pcdofraco-ativacao.onrender.com/webhook/cakto`
   - **Eventos:** Compra aprovada / Pagamento confirmado

4. No campo de **UTM / Parâmetros customizados** do checkout:
   - Quando o cliente chega na página de compra vindo do app, a URL já tem `?hwid=XXXXX`
   - Configure a Cakto para **repassar o parâmetro `hwid`** no webhook
   - Geralmente fica em: **Configurações → Parâmetros de rastreamento → Passar UTMs no webhook**
   - O servidor lê o hwid de `utm_content`, `utm_term` ou `metadata.hwid`
     (teste e veja qual campo a Cakto envia — o log do Render vai mostrar)

5. Em **Webhook Secret**, coloque o mesmo valor que você definiu em `WEBHOOK_SECRET`

---

## PASSO 4 — Testar manualmente

Para gerar uma chave sem passar pela Cakto, use este endpoint:

```bash
curl -X POST https://pcdofraco-ativacao.onrender.com/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "hwid": "HWID_DO_CLIENTE_AQUI",
    "email": "cliente@email.com",
    "nome": "João",
    "admin_key": "pcdofraco2024xk"
  }'
```

Substitua `admin_key` pelo valor do seu `WEBHOOK_SECRET`.

---

## Fluxo completo

```
Cliente abre o app → clica "Comprar Plus agora"
  → app abre: cakto.com/checkout?hwid=XXXXXXXXXXXXX
  → cliente paga
  → Cakto dispara webhook → Render
  → Render gera key → envia email para o cliente
  → cliente abre email → copia chave → cola no app → ativado!
```

Tempo do pagamento até receber o email: ~10 segundos.
