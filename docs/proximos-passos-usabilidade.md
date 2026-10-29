# Próximos passos de usabilidade

Continuação da avaliação de usabilidade. Já entregue no #60: botão fixo no celular, ingressos unificados no formulário, botão de envio contextual, capa no link compartilhado, mapa e agenda, checklist "Antes de publicar", foco no primeiro erro e máscara de telefone.

Prioridade é julgamento, não dado medido. Reavaliar com o uso real (inscrições iniciadas x concluídas).

## 1. Formulário do evento (quase pronto)
`src/app/app/[orgSlug]/events/event-form.tsx` já é dividido em seções (Informações principais, Data e local, Inscrições e vagas, Contato, Termos) e já mostra a pré-visualização no celular ao lado da edição. Falta só, na criação, recolher as seções opcionais (Contato e Termos) e, depois de criar, levar direto para Ingressos.

## 2. Mensagens aos inscritos e lembrete (médio)
Botão "Enviar mensagem aos inscritos" (e-mail, usando `modules/notifications`) e lembrete automático 24h antes do evento. Reduz ausência. Exige tarefa agendada e controle de envio único por inscrição.

## 3. Lista de espera (médio)
Quando as vagas acabam, captar e-mail e avisar quando abrir vaga (cancelamento ou aumento de capacidade). Muda o banco (tabela e função); precisa de migration e testes de RLS.

## 4. Cupons, lotes e cortesia (alto)
Cupom de desconto, lotes por data e ingresso de cortesia. Mexe em preço, pagamento e reembolso; fazer por último e com testes de banco.

## 5. Medir antes de mexer mais
Registrar o funil (visitou a página, iniciou, concluiu) para decidir com dado. Hoje não há medição.
