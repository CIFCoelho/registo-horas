## [Frontend (GitHub Pages)]
**Status:** ✅ Melhorado
- Lógica agora modularizada com config.js por secção
- Acabamento e Estofagem têm implementações customizadas
- Outras secções usam shift-basic.js genérico
- Offline queue implementada com retry exponencial e expiração de 30 min

## [Offline queue]
**Status:** ✅ Implementado
- Queue em localStorage com backoff exponencial (5s, 10s, 20s, ... cap 10min)
- Expiração automática após 30 minutos
- Retry em eventos: online, visibility change, pageshow
- **Conhecido:** Race condition em OF switch offline → mitigado com filtro por OF no backend

## [Backend (Node.js + Notion)]
**Status:** ✅ Em produção
- Todas as secções migradas do Google Sheets para Notion
- Endpoints RESTful com Express
- Keep-alive automático (cron) em horário laboral
- Ajuste automático da pausa manhã (10h00-10h10)
- Sincronização de turnos abertos via GET /open

## [Arquitetura da Base de Dados]
**Status:** ✅ Notion
- Estrutura consistente entre secções (Funcionário, OF, Início/Final Turno, Notas)
- Bases especializadas: Estofagem-Registos, Pintura (quantidades)
- Propriedades flexíveis com aliasing no backend