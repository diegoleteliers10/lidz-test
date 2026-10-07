"use client";

import {
  Archive,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flame,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import conversations from "@/lib/data/conversations.json";

type FixtureMessage = (typeof conversations)[number]["mensajes"][number];
type JsonRecord = Record<string, unknown>;
type Evidence = { text: string; message_index: number; speaker: string };
type FactView = { label: string; state: string; value: unknown; evidence: Evidence[] };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (record: JsonRecord, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const evidenceFrom = (value: unknown): Evidence[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const text = stringField(item, "text");
    const speaker = stringField(item, "speaker");
    const messageIndex = item.message_index;
    if (text === null || speaker === null || typeof messageIndex !== "number") return [];
    return [{ text, speaker, message_index: messageIndex }];
  });
};

const factFrom = (label: string, value: unknown): FactView | null => {
  if (!isRecord(value)) return null;
  const state = stringField(value, "state");
  if (state === null) return null;
  return { label, state, value: value.value, evidence: evidenceFrom(value.evidence) };
};

const factsFromProfile = (value: unknown): FactView[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, fact]) => {
    if (key === "product") return [];
    const view = factFrom(key.replaceAll("_", " "), fact);
    return view === null ? [] : [view];
  });
};

const factsFromResult = (data: JsonRecord): FactView[] => {
  const profileFacts = factsFromProfile(data.profile);
  const directFacts = [
    ["Presupuesto de compra", data.purchase_budget],
    ["Urgencia", data.urgency],
    ["Intención", data.intent],
    ["Ajuste al proyecto", data.inventory_fit],
    ["Visita agendada", isRecord(data.visit) ? data.visit.scheduled : null],
    ["Precio informado por asistente", data.assistant_quoted_price],
    ["Motivo para intervención humana", data.human_escalation],
  ].flatMap(([label, value]) => {
    const fact = factFrom(String(label), value);
    return fact === null ? [] : [fact];
  });
  return [...profileFacts, ...directFacts].filter((fact) => fact.state !== "unknown");
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "No informado";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (isRecord(value)) {
    const amount = value.amount;
    const currency = value.currency;
    if (typeof amount === "number" && typeof currency === "string") {
      return `${currency} ${amount.toLocaleString("en-US")}`;
    }
  }
  return "Ver evidencia";
};

const labels: Record<string, string> = {
  owner_occupier_purchase: "Compra para vivir",
  investment_purchase: "Compra para invertir",
  commercial_purchase: "Compra comercial",
  complaint: "Reclamo de atención",
  inquiry: "Consulta inicial",
  out_of_scope: "Fuera de alcance",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  excluded: "Fuera de alcance",
  review_required: "Revisión requerida",
  known: "Declarado",
  unknown: "No informado",
  contradictory: "Datos contradictorios",
  invalid: "Dato no validado",
  immediate: "Inmediata",
  this_week: "Esta semana",
  soon: "Pronto",
  dated: "Con fecha indicada",
  no_urgency: "Sin urgencia declarada",
  rental_not_supported: "Arriendo fuera del producto",
  wrong_number: "Número equivocado",
  unrelated_business: "Consulta ajena al producto",
  information_only_without_purchase_interest: "Solo busca información",
  no_relationship_with_company: "Sin relación con la inmobiliaria",
  instruction_override_without_purchase_need: "Instrucción sin necesidad de compra",
  missed_visit: "Visita no realizada",
  uncertain_classification: "Clasificación incierta",
  assistant_can_continue: "El asistente puede seguir atendiendo",
  human_intervention_required: "Se necesita intervención humana",
  no_sales_call: "No corresponde contactar por una venta",
  studio: "Estudio",
  apartment: "Departamento",
  shop: "Local comercial",
  office: "Oficina",
  warehouse: "Bodega",
  land: "Terreno",
  "monthly income": "Ingreso mensual",
  "net monthly income": "Renta líquida mensual",
  "down payment": "Ahorro para el pie",
  "monthly payment": "Cuota mensual",
  "declared credit capacity": "Capacidad de crédito declarada",
  "seeks subsidy": "Busca subsidio",
  "subsidy name": "Subsidio indicado",
  "credit preapproved": "Crédito preaprobado",
  "buys for investment": "Compra para inversión",
  "has co borrower": "Tiene codeudor",
  "business sector": "Rubro de la empresa",
  "floor area m2": "Superficie (m²)",
  "property type": "Tipo de propiedad",
  "investment budget": "Presupuesto de inversión",
};

const labelize = (value: string | null): string =>
  value === null ? "Pendiente" : labels[value] ?? value.replaceAll("_", " ");

const messagesFor = (messages: readonly FixtureMessage[]) =>
  messages.map((message) => ({
    speaker: message.de === "asistente" ? "assistant" : "lead",
    text: message.texto,
  }));

const fixtureText = (messages: readonly FixtureMessage[]) =>
  messages.map((message) => message.texto).join(" ");

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [analyses, setAnalyses] = useState<Record<string, JsonRecord>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "yes" | "no">>({});

  const selected = selectedId === null ? null : conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const analysis = selectedId === null ? null : analyses[selectedId] ?? null;
  const totalCount = conversations.length;
  const analyzedCount = Object.keys(analyses).length;
  const humanCount = Object.values(analyses).filter((item) => isRecord(item.handling) && item.handling.status === "human_intervention_required").length;
  const excludedCount = Object.values(analyses).filter((item) => item.priority === "excluded").length;

  const visibleConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CL");
    return conversations.filter((conversation) => {
      const result = analyses[conversation.id];
      const matchesQuery = normalizedQuery.length === 0 ||
        `${conversation.id} ${fixtureText(conversation.mensajes)}`.toLocaleLowerCase("es-CL").includes(normalizedQuery);
      const matchesFilter = filter === "all"
        || (filter === "pending" && result === undefined)
        || (filter === "analyzed" && result !== undefined)
        || (filter === "human" && isRecord(result?.handling) && result?.handling.status === "human_intervention_required");
      return matchesQuery && matchesFilter;
    }).sort((left, right) => {
      const leftResult = analyses[left.id];
      const rightResult = analyses[right.id];
      const leftUrgentService = isRecord(leftResult?.handling) && leftResult.handling.reason === "missed_visit" ? 0 : 1;
      const rightUrgentService = isRecord(rightResult?.handling) && rightResult.handling.reason === "missed_visit" ? 0 : 1;
      if (leftUrgentService !== rightUrgentService) return leftUrgentService - rightUrgentService;
      const ranks: Record<string, number> = { high: 0, medium: 1, low: 2, review_required: 3, excluded: 4 };
      const leftRank = ranks[stringField(leftResult ?? {}, "priority") ?? ""] ?? 5;
      const rightRank = ranks[stringField(rightResult ?? {}, "priority") ?? ""] ?? 5;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftScore = typeof leftResult?.score === "number" ? leftResult.score : -1;
      const rightScore = typeof rightResult?.score === "number" ? rightResult.score : -1;
      return rightScore - leftScore || conversations.findIndex((item) => item.id === left.id) - conversations.findIndex((item) => item.id === right.id);
    });
  }, [analyses, filter, query]);

  const analyzeConversations = () => {
    setAnalyzing(true);
    setApiError(null);
    const payload = conversations.map((conversation) => ({
      id: conversation.id,
      messages: messagesFor(conversation.mensajes),
    }));

    void fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((response) => response.text().then((text) => ({ ok: response.ok, text })))
      .then(({ ok, text }) => {
        const decoded: unknown = JSON.parse(text);
        if (!ok || !isRecord(decoded) || !Array.isArray(decoded.results)) {
          setApiError("No se pudo cargar el análisis. Inténtalo de nuevo.");
          return;
        }
        const nextAnalyses = decoded.results.reduce<Record<string, JsonRecord>>((collected, entry) => {
          if (!isRecord(entry) || entry.ok !== true || !isRecord(entry.data)) return collected;
          const id = stringField(entry, "id");
          if (id !== null && conversations.some((conversation) => conversation.id === id)) {
            collected[id] = entry.data;
          }
          return collected;
        }, {});
        setAnalyses((current) => ({ ...current, ...nextAnalyses }));
        const failedCount = decoded.results.filter((entry) => isRecord(entry) && entry.ok === false).length;
        if (failedCount > 0) setApiError(`${failedCount} conversaciones no se pudieron analizar. Los mensajes originales siguen disponibles.`);
      })
      .then(
        () => setAnalyzing(false),
        () => {
          setAnalyzing(false);
          setApiError("Falló la solicitud de análisis. Revisa la conexión e inténtalo de nuevo.");
        },
      );
  };

  const category = analysis === null ? null : stringField(analysis, "category");
  const priority = analysis === null ? null : stringField(analysis, "priority");
  const summary = analysis === null ? null : stringField(analysis, "summary");
  const score = analysis?.score;
  const resultFacts = analysis === null ? [] : factsFromResult(analysis);
  const handling = analysis !== null && isRecord(analysis.handling) ? stringField(analysis.handling, "status") : null;
  const handlingReason = analysis !== null && isRecord(analysis.handling) ? stringField(analysis.handling, "reason") : null;
  const handlingLabel = handling === "assistant_can_continue" ? "El asistente puede seguir atendiendo"
    : handling === "human_intervention_required" ? "Se necesita intervención humana"
      : handling === "no_sales_call" ? "No corresponde contactar por una venta" : "Ruta de atención pendiente";

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <a className="wordmark" href="#main" aria-label="Inicio de Lidz">LIDZ<span>.ai</span></a>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="topbar-status"><span className="status-dot" />Datos de prueba · análisis manual</div>
        <label className="global-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar conversaciones</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversaciones" />
          <kbd>⌘K</kbd>
        </label>
        <button className="icon-button notification-button" type="button" aria-label="Notificaciones">
          <Bell size={19} /><span className="notification-dot" />
        </button>
        <button className="user-menu" type="button" aria-label="Menú de cuenta">
          <span className="avatar user-avatar">L</span><span className="user-label">Equipo<br /><small>Comercial</small></span><ChevronDown size={16} />
        </button>
      </header>

      <div className="mobile-brand"><span className="wordmark">LIDZ<span>.ai</span></span><span className="topbar-status"><span className="status-dot" />Análisis manual</span></div>

      <div className="dashboard" id="main">
        <section className="welcome-row" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">EQUIPO COMERCIAL</p>
            <h1 id="welcome-title">Priorización de <strong>leads</strong></h1>
            <p className="welcome-copy">Revisa cada conversación y su evidencia antes de decidir el siguiente paso.</p>
          </div>
          <button className="primary-button analyze-button" type="button" onClick={analyzeConversations} disabled={analyzing}>
            <Sparkles size={17} />{analyzing ? "Analizando conversaciones…" : "Analizar 10 conversaciones"}<ChevronRight size={17} />
          </button>
        </section>

        {apiError !== null && <p className="inline-error" role="status">{apiError}</p>}

        <section className="metric-grid" aria-label="Resumen de conversaciones">
          <MetricCard icon={<Flame size={19} />} value={Object.values(analyses).filter((item) => item.priority === "high" && item.should_call === true).length} label="Contactar ahora" tone="primary" />
          <MetricCard icon={<Phone size={19} />} value={Object.values(analyses).filter((item) => item.priority === "medium" && item.should_call === true).length} label="Contactar hoy" />
          <MetricCard icon={<Clock3 size={19} />} value={Object.values(analyses).filter((item) => item.priority === "low" && item.should_call === true).length} label="Puede esperar" />
          <MetricCard icon={<Archive size={19} />} value={excludedCount} label="Fuera de alcance" />
        </section>

        <div className="content-grid" id="conversations">
          <aside className="queue-panel" aria-label="Lista de conversaciones">
            <div className="queue-heading">
              <div><h2>Conversaciones</h2><span className="queue-count">{visibleConversations.length} de {totalCount}</span></div>
              <span className="sort-label"><Sparkles size={14} />{analyzedCount > 0 ? "Ordenadas por IA" : "Orden original"}</span>
            </div>
            <label className="queue-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Buscar en mensajes o por ID de conversación</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mensaje o ID" />
            </label>
            <div className="filter-tabs" role="group" aria-label="Filtrar conversaciones">
              <FilterButton value="all" selected={filter === "all"} onClick={setFilter}>Todas <span>{totalCount}</span></FilterButton>
              <FilterButton value="pending" selected={filter === "pending"} onClick={setFilter}>Pendientes <span>{totalCount - analyzedCount}</span></FilterButton>
              <FilterButton value="analyzed" selected={filter === "analyzed"} onClick={setFilter}>Analizadas <span>{analyzedCount}</span></FilterButton>
              <FilterButton value="human" selected={filter === "human"} onClick={setFilter}>Atención humana <span>{humanCount}</span></FilterButton>
            </div>
            <div className="conversation-list">
              {visibleConversations.map((conversation) => {
                const result = analyses[conversation.id];
                const preview = result ? stringField(result, "summary") ?? "Resumen no disponible." : conversation.mensajes.at(-1)?.texto ?? "No hay mensajes en esta conversación.";
                const resultScore = typeof result?.score === "number" ? Math.round(result.score) : null;
                const resultPriority = stringField(result ?? {}, "priority");
                return (
                  <button
                    className={`conversation-card${conversation.id === selectedId ? " selected" : ""}`}
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    aria-pressed={conversation.id === selectedId}
                  >
                    <div className="card-topline"><span className="conversation-id">{conversation.id}</span><div className="card-indicators"><span className={`mini-state${result ? ` ${resultPriority ?? "ready"}` : ""}`}>{result ? labelize(resultPriority) : "Pendiente"}</span><span className="card-score">{resultScore === null ? "—" : resultScore}<small>/100</small></span></div></div>
                    <p>{preview}</p>
                    <div className="card-bottomline"><span className="message-count"><MessageCircle size={13} />{conversation.mensajes.length} {conversation.mensajes.length === 1 ? "mensaje" : "mensajes"}</span><span className="card-open">Abrir <ChevronRight size={14} /></span></div>
                  </button>
                );
              })}
              {visibleConversations.length === 0 && <div className="empty-queue"><Search size={21} /><p>No hay conversaciones para este filtro.</p></div>}
            </div>
          </aside>

          <section className="detail-column" aria-label={selected ? `Detalles de ${selected.id}` : "Detalles de conversación"}>
            {selected && <>
            <div className="selected-header">
              <span className="avatar conversation-avatar">{selected.id.slice(-2)}</span>
              <div className="selected-heading"><span className="selected-id">{selected.id}</span><span className="selected-meta">{selected.mensajes.length} mensajes</span></div>
              <span className="message-state"><span className={`status-dot${analysis ? " success" : ""}`} />{analysis ? "Análisis disponible" : "Sin analizar"}</span>
            </div>

            <section className={`verdict-panel${analysis ? " has-analysis" : ""}`} aria-labelledby="verdict-title">
              <div className="verdict-kicker"><Sparkles size={17} />{analysis ? "Evaluación con evidencia" : "Análisis pendiente"}</div>
              <div className="verdict-main">
                <div><h2 id="verdict-title">{analysis ? labelize(category) : "Sin veredicto"}</h2><p>{analysis ? (summary ?? "El análisis no devolvió un resumen.") : "Analiza las conversaciones para ver su categoría, prioridad y evidencia."}</p></div>
                {analysis && <div className="verdict-score"><span>{typeof score === "number" ? Math.round(score) : "—"}</span><small>/100</small></div>}
              </div>
              {analysis ? (
                <div className="verdict-footer"><span className={`priority-chip ${priority ?? "unknown"}`}>{labelize(priority)}</span><span className="call-guidance">{handlingLabel}</span></div>
              ) : (
                <button className="verdict-action" type="button" onClick={analyzeConversations} disabled={analyzing}><Sparkles size={16} />{analyzing ? "Analizando…" : "Analizar conversaciones"}<ChevronRight size={16} /></button>
              )}
            </section>

            <div className="insight-grid" id="signals">
              <section className="surface-card reason-card">
                <div className="section-title"><div><span className="section-icon"><Flame size={17} /></span><h3>¿Por qué esta prioridad?</h3></div>{analysis && <span className="priority-chip subtle">{labelize(priority)}</span>}</div>
                {analysis ? (
                  <div className="reason-content">
                    {handling === "human_intervention_required" && <p className="human-alert"><Phone size={15} />Esta conversación requiere atención humana.</p>}
                    {resultFacts.length > 0 ? resultFacts.slice(0, 4).map((fact) => <EvidenceRow key={fact.label} fact={fact} />) : <p className="muted-copy">{stringField(analysis, "summary") ?? "La conversación no tiene información suficiente para explicar esta prioridad."}</p>}
                    {handlingReason !== null && <p className="human-reason">Motivo de atención: <strong>{labelize(handlingReason)}</strong></p>}
                  </div>
                ) : <EmptyInsight icon={<Archive size={18} />} text="Los motivos de prioridad aparecerán después del análisis." />}
              </section>

              <section className="surface-card signals-card">
                <div className="section-title"><div><span className="section-icon blue"><Check size={17} /></span><h3>Señales detectadas</h3></div><span className="evidence-label">Con evidencia</span></div>
                {analysis ? (
                  <div className="signal-list">
                    <Signal label="Categoría" value={labelize(category)} level={categorySignalLevel(analysis)} />
                    <Signal label="Urgencia" value={factLabel(analysis.urgency)} level={urgencySignalLevel(analysis.urgency)} />
                    <Signal label="Presupuesto de compra" value={factLabel(analysis.purchase_budget)} level={factSignalLevel(analysis.purchase_budget)} />
                    <Signal label="Ruta de atención" value={handlingLabel} level={handlingSignalLevel(handling)} />
                    {analysis.priority === "excluded" && <p className="excluded-note">Esta conversación está fuera del alcance de venta.</p>}
                  </div>
              ) : <EmptyInsight icon={<Sparkles size={18} />} text="Las señales aparecerán al analizar la conversación." />}
              </section>
            </div>

            <section className="surface-card conversation-detail">
              <div className="section-title conversation-detail-title"><div><span className="section-icon blue"><MessageCircle size={17} /></span><h3>Conversación original</h3></div><span className="evidence-label">{selected.mensajes.length} mensajes</span></div>
              <div className="transcript">
                {selected.mensajes.map((message, index) => (
                  <article className={`transcript-message ${message.de === "lead" ? "from-lead" : "from-assistant"}`} key={`${selected.id}-${index}`}>
                    <div className="transcript-meta"><span>{message.de === "lead" ? "Cliente" : "Asistente"}</span><span>Mensaje {index + 1}</span></div>
                    <p>{message.texto}</p>
                  </article>
                ))}
              </div>
              <div className="feedback-row"><span>¿La clasificación es correcta?</span><button type="button" className={feedback[selected.id] === "yes" ? "feedback-selected" : ""} onClick={() => setFeedback((current) => ({ ...current, [selected.id]: "yes" }))}><ThumbsUp size={15} />Sí</button><button type="button" className={feedback[selected.id] === "no" ? "feedback-selected" : ""} onClick={() => setFeedback((current) => ({ ...current, [selected.id]: "no" }))}><ThumbsDown size={15} />No</button></div>
            </section>

            {analysis && <NextStep result={analysis} />}
            </>}
          </section>
        </div>
        <footer className="page-footer"><span>LIDZ <span className="footer-dot">·</span> Priorización de leads</span><span>{analyzedCount} de {totalCount} conversaciones analizadas</span></footer>
      </div>
    </main>
  );
}

function MetricCard({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone?: "primary" }) {
  return <div className={`metric-card${tone === "primary" ? " metric-primary" : ""}`}><span className="metric-icon">{icon}</span><span className="metric-value">{value}</span><span className="metric-label">{label}</span></div>;
}

function FilterButton({ value, selected, onClick, children }: { value: string; selected: boolean; onClick: (value: string) => void; children: React.ReactNode }) {
  return <button className={`filter-button${selected ? " active" : ""}`} type="button" aria-pressed={selected} onClick={() => onClick(value)}>{children}</button>;
}

function EvidenceRow({ fact }: { fact: FactView }) {
  const evidence = fact.evidence[0];
  return <div className="evidence-row"><div className="evidence-value"><span>{fact.label}</span><strong>{fact.state === "known" ? formatValue(fact.value) : labelize(fact.state)}</strong></div>{evidence && <blockquote>“{evidence.text}”<cite>{evidence.speaker === "lead" ? "cliente" : "asistente"} · mensaje {evidence.message_index + 1}</cite></blockquote>}</div>;
}

function EmptyInsight({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="empty-insight"><span>{icon}</span><p>{text}</p></div>;
}

function Signal({ label, value, level }: { label: string; value: string; level: number }) {
  return <div className="signal-row"><span>{label}</span><strong>{value}</strong><span className="signal-bars" role="img" aria-label={`Nivel de señal: ${level} de 3`}>{[1, 2, 3].map((bar) => <i className={bar <= level ? "filled" : ""} key={bar} />)}</span></div>;
}

function categorySignalLevel(result: JsonRecord): number {
  const category = stringField(result, "category");
  if (result.review_required === true) return 1;
  if (category === "owner_occupier_purchase" || category === "investment_purchase" || category === "commercial_purchase" || category === "complaint") return 3;
  if (category === "inquiry") return 1;
  return 0;
}

function factSignalLevel(value: unknown): number {
  const fact = factFrom("", value);
  if (fact === null || fact.state === "unknown") return 0;
  if (fact.state === "known") return 3;
  return 1;
}

function urgencySignalLevel(value: unknown): number {
  const fact = factFrom("", value);
  if (fact === null || fact.state !== "known" || typeof fact.value !== "string") return fact?.state === "invalid" || fact?.state === "contradictory" ? 1 : 0;
  if (fact.value === "immediate" || fact.value === "this_week") return 3;
  if (fact.value === "soon" || fact.value === "dated") return 2;
  return 1;
}

function handlingSignalLevel(value: string | null): number {
  if (value === "human_intervention_required") return 3;
  if (value === "assistant_can_continue") return 1;
  return 0;
}

function factLabel(value: unknown): string {
  const fact = factFrom("", value);
  if (fact === null) return "No informado";
  if (fact.state !== "known") return labelize(fact.state);
  return typeof fact.value === "string" ? labelize(fact.value) : formatValue(fact.value);
}

function NextStep({ result }: { result: JsonRecord }) {
  const shouldCall = result.should_call === true;
  const route = isRecord(result.handling) ? stringField(result.handling, "status") : null;
  const reason = isRecord(result.handling) ? stringField(result.handling, "reason") : null;
  const content = route === "human_intervention_required"
      ? `Contactar a la persona. Motivo: ${labelize(reason)}.`
    : route === "no_sales_call"
      ? "No contactar por una venta en este caso."
      : shouldCall
        ? "El asistente puede seguir atendiendo esta consulta."
        : "Revisar la clasificación antes de decidir el siguiente paso.";
  return <div className="next-step"><span className="next-step-icon"><Sparkles size={17} /></span><p><strong>Siguiente paso:</strong> {content}</p><ChevronRight size={20} /></div>;
}
