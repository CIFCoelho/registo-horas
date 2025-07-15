# 📘 Registo de Produtividade

Sistema leve e modular de registo de produtividade de colaboradores, com foco em ambientes industriais com equipamentos antigos (ex: iPad 2) e integração com Google Sheets.

> 🛠 Atualmente em uso na secção de **Acabamento**. Outras secções estão em desenvolvimento progressivo.

---

## 🚀 Funcionalidades

- Registo de **início e fim de turno** por funcionário e OF (Ordem de Fabrico)
- Compatível com **iPad 2 em modo quiosque (Safari 9.3.5)**
- Funciona **offline até 30 minutos** com fila local (`localStorage`)
- Envia registos para uma **Google Sheet por secção**
- Cálculo automático de duração dos turnos
- Suporte planeado para: quantidades produzidas, dashboards, e integração com ERP

---

## 🧱 Arquitetura

```plaintext
iPad 2 (Safari 9) 
   ↓ (JS puro + fila offline via localStorage)
GitHub Pages (Frontend)
   ↓ (POST com JSON urlencoded)
Google Apps Script (Backend)
   ↓
Google Sheets (Armazenamento)
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
├── backend/             # Código Google Apps Script (Main.gs, Acabamento.gs, etc)
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

- A coluna **Duração (h)** é calculada no Apps Script ou via fórmula:  
  `=IF(AND(D2<>""; E2<>""); ROUND((TIMEVALUE(E2) - TIMEVALUE(D2)) * 24; 2); "")`

### 🧵 "Costura":

Inclui também colunas de quantidades por tipo de peça (Almofadas, Abas, etc.)

### ✅ "Estofagem - Registos Acab.":

Usada para registar quem fez cada tipo de acabamento final (Cru, TP). Permite cruzamento com produtividade de tempo e OF.

---

## 🧪 Como testar localmente

1. Clonar este repositório  
2. Servir a pasta com `npx http-server docs`  
3. Abrir `http://localhost:8080/index.html` e escolher uma secção  
4. Confirmar que:
   - O clique no funcionário ativa o turno
   - O segundo clique regista o fim
   - Os dados são enviados via `POST` para o Apps Script

---

## ☁️ Deploy

### 1. Google Apps Script

- Apps Script > Deploy as Web App > Acesso: "Anyone"  
- Copiar URL e adicionar como `WEB_APP_URL` em **GitHub Secrets**

### 2. GitHub Pages

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
