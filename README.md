# 📘 Registo de Produtividade

Sistema leve e modular de registo de produtividade de colaboradores, com foco em ambientes industriais com equipamentos antigos (ex: iPad 2) A primeira versão usava Google Sheets, mas a secção **Acabamento** já envia registos para uma base de dados no Notion através de um pequeno backend Node.js.

> 🛠 Atualmente em uso na secção de **Acabamento**. Outras secções estão em desenvolvimento progressivo.

---

## 🚀 Funcionalidades

- Registo de **início e fim de turno** por funcionário e OF (Ordem de Fabrico)
- Compatível com **iPad 2 em modo quiosque (Safari 9.3.5)**
- Funciona **offline até 30 minutos** com fila local (`localStorage`)
- Envia registos para uma **Google Sheet** ou **Notion**, consoante a secção (no futuro todos serão enviados para o Notion)
- Integração direta com o **Notion** através de um backend Node.js
- Botão de ações para **cancelar turno** ou **registar acabamento incompleto**
- Cálculo automático de duração dos turnos
- Interface otimizada para ecrãs pequenos (iPad 2) seguindo as cores da Certoma
- Suporte planeado para: quantidades produzidas, dashboards, e integração com ERP

---

## 🧱 Arquitetura

```plaintext
iPad 2 (Safari 9) 
   ↓ (JS puro + fila offline via localStorage)
GitHub Pages (Frontend)
   ↓ (POST com JSON urlencoded)
Node.js Backend (server/index.js)
   ↓
Notion (Base de dados)
```

---

## 🗂 Estrutura do Repositório

```plaintext
registo-horas/
├── docs/                # Site para GitHub Pages (html, js, configs)
│   ├── index.html       # Página inicial com escolha de secções
│   ├── JS/              # Lógica de fila, estados e envio
│   ├── config/          # Configuração por secção (ex: acabamento.config.js)
│   └── sections/        # HTML por secção
├── backend/             # Código Google Apps Script (versão original)
├── server/              # Backend Node.js para integração com Notion
├── .github/workflows/   # Action para geração automática de `env.js` (URL do GAS)
└── README.md
```

---

## 📋 Exemplo de Payload

```json
{
  "funcionario": "Carlota",
  "of": "123456",
  "acao": "start",
  "hora": "07:30"
}
```

---

## 📄 Estrutura dos Sheets

### 🏷 "Acabamento", "Estofagem - Tempo", "Pintura", etc:

| Data | Funcionário | OF | Início | Fim | Duração (h) |
|------|-------------|----|--------|-----|--------------|

 - A coluna **Duração (h)** é calculada no Apps Script ou via fórmula.
   Para descontar a pausa das **10h00–10h10**, utilize:
   `=IF(AND(D2<>"";E2<>"");
      ROUND(((TIMEVALUE(E2)-TIMEVALUE(D2))
             -MAX(0;MIN(TIMEVALUE(E2);TIME(10;10;0))
                    -MAX(TIMEVALUE(D2);TIME(10;0;0))))*24;2);
      "")`

### 🧵 "Costura":

Inclui também colunas de quantidades por tipo de peça (Almofadas, Abas, etc.)

### ✅ "Estofagem - Registos Acab.":

Usada para registar quem fez cada tipo de acabamento final (Cru, TP). Permite cruzamento com produtividade de tempo e OF.

---

## 🧪 Como testar localmente

1. Clonar este repositório
2. Instalar dependências e arrancar o backend em `server/` com `npm start`
3. Servir a pasta com `npx http-server docs`
4. Abrir `http://localhost:8080/index.html` e escolher uma secção
5. Confirmar que:
   - O clique no funcionário ativa o turno
   - O segundo clique regista o fim
   - Opções de **Cancelar** e **Terminar Incompleto** funcionam
   - Os dados são enviados via `POST` para o backend Node.js

---

## ☁️ Deploy

### 1. ### 1. Backend Node.js (Notion)

- Instalar dependências com `npm install` na pasta `server/`
- Definir as variáveis `NOTION_TOKEN` e `ACABAMENTO_DB_ID`
- Correr com `npm start`
- Atualizar `frontend/JS/config/acabamento.config.js` com o URL do servidor

### 2. Google Apps Script (legacy)

- Apps Script > Deploy as Web App > Acesso: "Anyone" 
- Copiar URL e adicionar como `WEB_APP_URL` em **GitHub Secrets**

### 3. GitHub Pages

- O conteúdo de `docs/` é publicado automaticamente via GitHub Actions  
- O ficheiro `env.js` com o URL é gerado dinamicamente no deploy:
  ```js
  window.ENV = { WEB_APP_URL: "https://script.google.com/..." };
  ```

---

## 🧠 Roadmap

- [x] Suporte a Acabamento (tempo por OF)
- [ ] Estofagem - Tempo (corrigir queue offline)
- [ ] Estofagem - Registos Acab. (quantidades)
- [ ] Costura (quantidade + tempo)
- [ ] Pintura (quantidade + tempo)
- [ ] Dashboard interativo com filtros e KPIs
- [ ] Sincronização com ERP

---

## 🔒 Autenticação futura

- O dashboard será protegido por autenticação (a definir)
- O registo de turnos permanecerá público para uso em iPads em modo kiosque

---

## ⚠️ Limitações

- Apenas **JavaScript puro** (sem frameworks) para suportar Safari 9  
- Requer que os dados sejam enviados como:  
  `Content-Type: x-www-form-urlencoded`  
  com `data=<urlencoded JSON>`
