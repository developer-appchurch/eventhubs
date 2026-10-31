import Link from "@/components/navigation/intent-link";
import { Brand } from "@/components/navigation/brand";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "calendar", title: "Eventos do rascunho à publicação", text: "Crie o evento, defina data, formato e capacidade, e publique quando estiver pronto. Rascunhos nunca aparecem ao público." },
  { icon: "form", title: "Formulário de inscrição sob medida", text: "Monte as perguntas de cada evento, reaproveite o banco de perguntas e confira tudo na pré-visualização antes de abrir as inscrições." },
  { icon: "ticket", title: "Ingressos gratuitos e pagos", text: "Cadastre tipos de ingresso com preço, vagas e período de venda. Receba pagamentos pela sua conta Mercado Pago." },
  { icon: "users", title: "Inscrições e participantes", text: "Acompanhe quem se inscreveu, a situação de cada pagamento e exporte a lista em CSV quando precisar." },
  { icon: "qr", title: "Check-in na entrada", text: "Cada inscrição tem um QR Code e um código. Confirme a presença pelo celular, direto da página de check-in." },
  { icon: "chart", title: "Relatório do evento", text: "Veja inscritos, presenças e pagamentos do evento em um só lugar, com os dados reais da sua organização." },
];

const STEPS = [
  { n: "1", title: "Crie sua organização", text: "Reúna eventos, formulários e equipe. Cada organização tem seus dados isolados." },
  { n: "2", title: "Configure e publique", text: "Defina ingressos, monte o formulário e publique a página pública do evento." },
  { n: "3", title: "Receba e confirme", text: "Acompanhe inscrições e pagamentos e faça o check-in dos participantes no dia." },
];

const PRICING = [
  { label: "Eventos gratuitos", value: "0%", note: "Nenhum custo para você", items: ["Todos os recursos da plataforma liberados, sem mensalidade"] },
  { label: "Eventos pagos", value: "5%", note: "Sobre cada inscrição paga", items: ["Cobrança apenas quando a inscrição é confirmada", "O valor cai na sua conta Mercado Pago"] },
];

export default function HomePage() {
  return (
    <div id="conteudo" className="flex min-h-dvh flex-col">
      <section data-surface="dark" className="bg-hero relative isolate overflow-hidden text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-10 -z-10 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-34 -z-10 size-[20rem] rounded-full border border-brand-500/30" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-0 -z-10 size-72 rounded-full bg-brand-600/25 blur-3xl" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="flex items-center justify-between py-5">
            <Brand tone="dark" />
            <nav aria-label="Conta" className="flex items-center gap-2">
              <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-brand-200 hover:text-white">
                Entrar
              </Link>
              <Link href="/signup" className={buttonClass("primary", "min-h-10")}>
                Criar conta
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid content-start gap-6">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-medium text-brand-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-500" />
                Eventos, inscrições e check-in
              </p>
              <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Organize eventos <span className="text-brand-500">sem planilhas</span> paralelas.
              </h1>
              <p className="max-w-xl text-lg text-brand-200">
                Crie sua organização, publique eventos e acompanhe cada participante do primeiro convite à entrada no
                local. Feito para igrejas, congressos, empresas e produtores de cursos.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={buttonClass("primary", "min-h-12 px-6 text-base")}>
                  Começar gratuitamente <Icon name="arrow" className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-white/25 px-6 text-base font-semibold text-white hover:bg-white/10"
                >
                  Já tenho conta
                </Link>
              </div>
            </div>

            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto grid max-w-2xl gap-3 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Recursos</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Tudo o que o evento precisa, no mesmo lugar</h2>
            <p className="text-ink-muted">Da página de inscrição à lista de presença, sem trocar de ferramenta.</p>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-(--radius-card) border border-line bg-canvas p-6 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-(--shadow-card)">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-brand-gradient text-white">
                  <Icon name={f.icon} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-brand-200 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">Como funciona</h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-(--radius-card) bg-surface p-6 shadow-(--shadow-card)">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-brand-900 text-sm font-bold text-white">
                  {step.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-surface py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Taxas simples, sem surpresa no fim do evento
          </h2>
          <ul className="mt-12 grid gap-5 md:grid-cols-2">
            {PRICING.map((plan) => (
              <li key={plan.label} className="rounded-(--radius-card) border border-line bg-canvas p-8 text-center">
                <h3 className="text-xl font-semibold">{plan.label}</h3>
                <p className="mt-1 text-5xl font-extrabold tracking-tight text-brand-600">{plan.value}</p>
                <p className="mt-2 text-sm font-semibold">{plan.note}</p>
                <ul className="mt-6 grid gap-3 text-left text-sm text-ink-muted">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Icon name="check" className="size-5 shrink-0 text-brand-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section data-surface="dark" className="bg-hero relative isolate overflow-hidden py-20 text-center text-white">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="mx-auto grid max-w-2xl justify-items-center gap-5 px-4">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pronto para o seu próximo evento?</h2>
          <p className="text-brand-200">Crie a conta, monte a organização e publique o primeiro evento hoje.</p>
          <Link href="/signup" className={buttonClass("primary", "min-h-12 px-6 text-base")}>
            Criar conta gratuita
          </Link>
        </div>
      </section>

      <footer data-surface="dark" className="bg-brand-900 py-8 text-sm text-brand-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand tone="dark" />
          <p className="max-w-xl">
            Dados pessoais tratados conforme a LGPD. Consulte a política de privacidade na publicação do serviço.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Composição ilustrativa com a linguagem do painel (menu, status e ingresso), sem números ou nomes inventados.
function ProductPreview() {
  const nav: [IconName, string][] = [
    ["overview", "Visão geral"],
    ["calendar", "Eventos"],
    ["users", "Equipe"],
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-2xl border border-white/15 bg-surface text-ink shadow-(--shadow-overlay)">
        <div className="grid content-start gap-1 bg-brand-900 p-3">
          {nav.map(([icon, label], i) => (
            <span
              key={label}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium ${i === 1 ? "bg-brand-600 text-white" : "text-brand-200"}`}
            >
              <Icon name={icon} className="size-3.5" />
              {label}
            </span>
          ))}
        </div>
        <div className="grid gap-3 bg-canvas p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="h-3 w-24 rounded-full bg-brand-200" />
            <Badge tone="success">Publicado</Badge>
          </div>
          <div className="grid gap-2 rounded-xl border border-line bg-surface p-3">
            <span className="h-2.5 w-3/4 rounded-full bg-brand-100" />
            <span className="h-2.5 w-1/2 rounded-full bg-brand-100" />
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-brand-700">
              <Icon name="ticket" className="size-4" /> Ingresso
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-brand-100 text-brand-700">
              <Icon name="qr" className="size-6" />
            </span>
            <div className="grid flex-1 gap-1.5">
              <span className="h-2.5 w-2/3 rounded-full bg-brand-100" />
              <span className="h-2.5 w-1/3 rounded-full bg-brand-100" />
            </div>
            <Badge tone="brand">Check-in</Badge>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-(--shadow-card) sm:flex">
        <Icon name="check" className="size-4 text-success-ink" /> Inscrição confirmada
      </div>
    </div>
  );
}
