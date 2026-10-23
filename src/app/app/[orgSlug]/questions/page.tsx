import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { canManageEvents } from "@/modules/events/status";
import { FIELD_TYPE_LABELS } from "@/modules/forms/fields";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { listBankQuestions } from "@/modules/question-bank/queries";
import { QuestionForm } from "./question-form";

export const metadata: Metadata = { title: "Banco de perguntas" };

export default async function QuestionBankPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org) notFound();

  const questions = await listBankQuestions(org.id);
  const editable = canManageEvents(org.role);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">
        Perguntas guardadas aqui ficam disponíveis em todos os formulários de inscrição da organização. As marcadas como
        &quot;obrigatória em todos os eventos&quot; entram sempre; as demais você liga ou desliga em cada formulário.
      </p>

      {questions.length === 0 ? (
        <EmptyState title="Nenhuma pergunta no banco">Adicione perguntas que você usa com frequência, como CPF, telefone ou célula.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {questions.map((q) => (
            <li key={q.id}>
              <Card>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold">{q.label}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                      {FIELD_TYPE_LABELS[q.type]}
                      {q.always_on ? <Badge>Todos os eventos</Badge> : q.required ? <Badge>Obrigatória</Badge> : null}
                    </span>
                  </summary>
                  {editable ? (
                    <div className="mt-5">
                      <QuestionForm organizationSlug={org.slug} question={q} />
                    </div>
                  ) : null}
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <Card>
          <CardTitle>Nova pergunta</CardTitle>
          <div className="mt-5">
            <QuestionForm key={questions.length} organizationSlug={org.slug} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
