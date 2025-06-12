## [Frontend (GitHub Pages)]
**Problema:**
- [Lógica JS repetida dentro das páginas de cada secção. - URL do Web App, IDs das sheets e cores/-estados hard-coded.]
**Sugestão de Melhoria:**
- [➜ Criar um template único (/frontend/index.html) que carrega um config.js por secção (ex.: const SECTION = "Acabamento"). ➜ Colocar toda a lógica comum num módulo main.js; páginas passam só parâmetros.
Offline queue
Implementada inline; difícil de evoluir.]

## [Offline queue]
**Problema:**
- [Implementada inline; difícil de evoluir.]
**Sugestão de Melhoria:**
- [➜ Extrair para queue.js, usar localStorage + retry exponencial.➜ Guardar carimbo “versão do schema” para futuras migrações.]

## [Google Apps Script]
**Problema:**
- [Funções em único Code.gs; índices das colunas hard-coded; nomes de sheets fixos.]
**Sugestão de Melhoria:**
- [➜ Separar em ficheiros: router.gs, records.gs, autoClose.gs. ➜ Centralizar constantes num objeto CFG. ➜ Aceder às sheets por cache (cache service) para reduzir latência.]

## [Base de dados (Sheets)]
**Problema:**
- [Uma sheet por secção e, agora, uma sheet adicional por dia (↑ risco de erro ao renomear).]
**Sugestão de Melhoria:**
- [➜ Voltar a 1 sheet por secção + coluna “Data” (filtro > pivot). ➜ Criar views dinâmicas em Looker Studio ou Apps Script para relatórios diários se necessário.]