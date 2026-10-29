# Próximos passos de usabilidade

Continuação da avaliação de usabilidade. Já entregue no #60: botão fixo no celular, ingressos unificados no formulário, botão de envio contextual, capa no link compartilhado, mapa e agenda, checklist "Antes de publicar", foco no primeiro erro e máscara de telefone.

Prioridade é julgamento, não dado medido. Reavaliar com o uso real (inscrições iniciadas x concluídas).

## 1. Formulário do evento em blocos (esforço médio)
`src/app/app/[orgSlug]/events/event-form.tsx` é uma página única longa. Dividir em Básico (nome, datas, local), Detalhes (descrição, capa, termos) e Contato, com os blocos de detalhes recolhidos na criação. Após criar, levar direto para Ingressos.

## 2. Pré-visualização ao lado da edição (médio)
Mostrar o preview do celular junto do formulário (a base já existe em `preview/`), em vez de só em aba separada.

## 3. Mensagens aos inscritos e lembrete (médio)
Botão "Enviar mensagem aos inscritos" (e-mail, usando `modules/notifications`) e lembrete automático 24h antes do evento. Reduz ausência. Exige tarefa agendada e controle de envio único por inscrição.

## 4. Lista de espera (médio)
Quando as vagas acabam, captar e-mail e avisar quando abrir vaga (cancelamento ou aumento de capacidade). Muda o banco (tabela e função); precisa de migration e testes de RLS.

## 5. Cupons, lotes e cortesia (alto)
Cupom de desconto, lotes por data e ingresso de cortesia. Mexe em preço, pagamento e reembolso; fazer por último e com testes de banco.

## 6. Medir antes de mexer mais
Registrar o funil (visitou a página, iniciou, concluiu) para decidir com dado. Hoje não há medição.
