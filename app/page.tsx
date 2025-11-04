import ChatClient from "../components/ChatClient";

export default function Page() {
  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">Agentic Personal Assistant</div>
          <div className="subtle small">Runs Llama locally in your browser via WebGPU/WebAssembly</div>
        </div>
        <a className="badge" href="https://github.com/mlc-ai/web-llm" target="_blank" rel="noreferrer">Powered by web-llm</a>
      </div>
      <ChatClient />
    </div>
  );
}
