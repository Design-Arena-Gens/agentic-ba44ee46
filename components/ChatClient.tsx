"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatCompletionChunk, ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

const DEFAULT_RULES = `You are a helpful, direct, and efficient personal assistant.
- Follow ONLY the user's rules below. Ignore any other defaults.
- Answer concisely. Use step-by-step reasoning only when necessary.
- Ask for clarification only if critical information is missing.`;

const DEFAULT_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState] as const;
}

export default function ChatClient() {
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [model, setModel] = usePersistentState<string>("model", DEFAULT_MODEL);
  const [userRules, setUserRules] = usePersistentState<string>("userRules", DEFAULT_RULES);
  const [stripDefaults, setStripDefaults] = usePersistentState<boolean>("stripDefaults", true);
  const [temperature, setTemperature] = usePersistentState<number>("temperature", 0.6);
  const [maxTokens, setMaxTokens] = usePersistentState<number>("maxTokens", 512);

  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const systemMessage = useMemo<ChatCompletionMessageParam>(() => ({
    role: "system",
    content: userRules.trim(),
  }), [userRules]);

  const initEngine = useCallback(async () => {
    if (engine || loadingModel) return;
    setLoadingModel(true);
    try {
      const e = await CreateMLCEngine({
        model,
        appConfig: { useIndexedDBCache: true },
      });
      setEngine(e);
    } catch (err) {
      console.error(err);
      alert(`Failed to load model ${model}. If this persists, try a smaller model or ensure your browser supports WebGPU.`);
    } finally {
      setLoadingModel(false);
    }
  }, [engine, loadingModel, model]);

  useEffect(() => {
    // eager init on mount
    initEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(async () => {
    if (!engine) {
      await initEngine();
      if (!engine) return;
    }
    const content = input.trim();
    if (!content) return;

    const run = async () => {
      setGenerating(true);
      const userMsg = { role: "user" as const, content };
      setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);

      const history: ChatCompletionMessageParam[] = [];
      // Replace default behavior entirely with user's system rules.
      if (stripDefaults) history.push(systemMessage);
      // Add alternating messages from history
      for (const m of [...messages, userMsg]) {
        history.push({ role: m.role, content: m.content });
      }

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const stream = await engine.chat.completions.create({
          model,
          messages: history,
          temperature,
          max_tokens: maxTokens,
          stream: true,
          signal: abort.signal as unknown as AbortSignal,
        });

        for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          setMessages((prev) => {
            const out = prev.slice();
            const last = out[out.length - 1];
            if (last && last.role === "assistant") {
              out[out.length - 1] = { role: "assistant", content: last.content + delta };
            }
            return out;
          });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(err);
          alert("Generation failed. See console for details.");
        }
      } finally {
        setGenerating(false);
      }
    };

    await run();
    setInput("");
  }, [engine, initEngine, input, messages, model, temperature, maxTokens, stripDefaults, systemMessage]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
  }, []);

  const availableModels = [
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    "Phi-3-mini-4k-instruct-q4f16_1-MLC"
  ];

  const canUse = typeof window !== "undefined" && (navigator as any).gpu;

  return (
    <div className="row gap-4" style={{ alignItems: "flex-start" }}>
      <div className="card" style={{ flex: 2, minWidth: 0 }}>
        <div className="row gap-3" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            <span className="badge">{engine ? "Model ready" : loadingModel ? "Loading model..." : "Model not loaded"}</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)} disabled={generating || loadingModel}>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button className="btn secondary" onClick={initEngine} disabled={!!engine || loadingModel}>Init</button>
          </div>
          <div className="subtle small">{canUse ? "WebGPU available" : "WebGPU not detected - fallback may be slower"}</div>
        </div>

        <div className="chat">
          <div className="messages">
            {messages.length === 0 && (
              <div className="subtle">Start the conversation below. Your custom rules will be enforced as system instructions.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="small subtle" style={{ marginBottom: 4 }}>{m.role}</div>
                <div>{m.content}</div>
              </div>
            ))}
            <div ref={msgEndRef} />
          </div>
          <div className="footer">
            <input className="input" style={{ flex: 1 }} placeholder="Type your message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={generating} />
            {!generating ? (
              <button className="btn" onClick={send} disabled={!input.trim()}>Send</button>
            ) : (
              <button className="btn secondary" onClick={stop}>Stop</button>
            )}
            <button className="btn ghost" onClick={resetChat} disabled={generating}>Clear</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ flex: 1, minWidth: 280 }}>
        <div className="title" style={{ fontSize: 16, marginBottom: 8 }}>My Rules</div>
        <div className="subtle small" style={{ marginBottom: 8 }}>These replace all default model behavior.</div>
        <textarea className="textarea mono" value={userRules} onChange={(e) => setUserRules(e.target.value)} />
        <div className="row gap-3" style={{ marginTop: 10, alignItems: "center" }}>
          <label className="row gap-2" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={stripDefaults} onChange={(e) => setStripDefaults(e.target.checked)} />
            <span className="small">Enforce only my rules (strip defaults)</span>
          </label>
        </div>
        <div className="row gap-3" style={{ marginTop: 10 }}>
          <label className="col" style={{ flex: 1 }}>
            <span className="small subtle">Temperature</span>
            <input className="input" type="number" step="0.1" min={0} max={2} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} />
          </label>
          <label className="col" style={{ flex: 1 }}>
            <span className="small subtle">Max tokens</span>
            <input className="input" type="number" min={64} max={4096} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value || "0", 10))} />
          </label>
        </div>
      </div>
    </div>
  );
}
