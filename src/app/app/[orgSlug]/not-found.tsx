import Link from "@/components/navigation/intent-link";
import { EmptyState } from "@/components/ui/empty-state";

export default function OrganizationNotFound() {
  return (
    <EmptyState
      title="Organização não encontrada"
      action={
        <Link href="/app" className="text-sm font-semibold text-brand-700 hover:underline">
          Voltar às suas organizações
        </Link>
      }
    >
      O endereço não existe ou você não tem acesso a ele.
    </EmptyState>
  );
}
