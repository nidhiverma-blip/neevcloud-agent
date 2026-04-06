import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const DEMO_STEPS = [
  { id: 1, label: "Welcome & Dashboard Overview", prompt: "Start the demo by welcoming the client and giving a quick overview of the NeevCloud dashboard." },
  { id: 2, label: "Instances Section", prompt: "Now guide the client to the Instances section and explain what instances are." },
  { id: 3, label: "Create a Server", prompt: "Walk the client through creating a new instance step by step." },
  { id: 4, label: "SSH & Security", prompt: "Explain SSH key setup and firewall configuration for their new server." },
  { id: 5, label: "Billing & Plans", prompt: "Explain the billing model, plans available, and help them choose the right one." },
  { id: 6, label: "Q&A", prompt: "Open it up for questions. Ask if they have anything specific they'd like to explore." },
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [screenStream, setScreenStream] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [agentStatus, setAgentStatus] = useState("idle"); // idle | listening | thinking | speaking
  const [sessionStarted, setSessionStarted] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const videoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const silenceTimer = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Setup speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Your browser doesn't support speech recognition. Please use Chrome.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(interim || final);
      if (final) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          handleUserSpeech(final.trim());
        }, 900);
      }
    };

    rec.onerror = (e) => {
      if (e.error !== "no-speech") setError("Mic error: " + e.error);
      setIsListening(false);
      setAgentStatus("idle");
    };

    rec.onend = () => {
      if (isListening) rec.start(); // keep alive
    };

    recognitionRef.current = rec;
  }, []);

  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "en-IN";
      utt.rate = 0.95;
      utt.pitch = 1.0;

      // Try to pick an Indian English voice
      const voices = synthRef.current.getVoices();
      const indianVoice = voices.find(v => v.lang === "en-IN") ||
                          voices.find(v => v.lang.startsWith("en") && v.name.includes("India")) ||
                          voices.find(v => v.lang.startsWith("en"));
      if (indianVoice) utt.voice = indianVoice;

      utt.onstart = () => { setIsSpeaking(true); setAgentStatus("speaking"); };
      utt.onend = () => { setIsSpeaking(false); setAgentStatus(isListening ? "listening" : "idle"); resolve(); };
      utt.onerror = () => resolve();
      synthRef.current.speak(utt);
    });
  }, [isListening]);

  const sendToAgent = useCallback(async (userText, systemPromptOverride) => {
    setIsLoading(true);
    setAgentStatus("thinking");
    setTranscript("");

    const userMsg = systemPromptOverride
      ? { role: "user", content: systemPromptOverride }
      : { role: "user", content: userText };

    const newMessages = systemPromptOverride ? [] : [...messages, userMsg];

    if (!systemPromptOverride) {
      setMessages(prev => [...prev, { role: "user", content: userText, ts: Date.now() }]);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: systemPromptOverride
            ? [{ role: "user", content: systemPromptOverride }]
            : newMessages,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "Sorry, I didn't catch that. Could you repeat?";

      setMessages(prev => [
        ...prev,
        ...(systemPromptOverride ? [] : []),
        { role: "assistant", content: reply, ts: Date.now() }
      ]);

      setIsLoading(false);
      await speak(reply);
    } catch (err) {
      setIsLoading(false);
      setAgentStatus("idle");
      setError("Connection error. Is the backend running?");
    }
  }, [messages, speak]);

  const handleUserSpeech = useCallback((text) => {
    if (!text || isSpeaking || isLoading) return;
    synthRef.current.cancel();
    sendToAgent(text);
  }, [isSpeaking, isLoading, sendToAgent]);

  const startSession = async () => {
    setSessionStarted(true);
    setMessages([]);
    setError("");
    await sendToAgent("", DEMO_STEPS[0].prompt);
    startListening();
  };

  const startListening = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
      setAgentStatus("listening");
    } catch (e) {}
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setAgentStatus(isSpeaking ? "speaking" : "idle");
  };

  const toggleMic = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const jumpToStep = async (step) => {
    setCurrentStep(step.id - 1);
    synthRef.current.cancel();
    await sendToAgent("", step.prompt);
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setScreenStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => setScreenStream(null);
    } catch (e) {
      setError("Screen share cancelled or not supported.");
    }
  };

  const stopScreenShare = () => {
    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
  };

  const statusColor = {
    idle: "#888",
    listening: "#22c55e",
    thinking: "#f59e0b",
    speaking: "#3b82f6",
  };

  const statusLabel = {
    idle: "Ready",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e8e6e0", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#1a1d27", borderBottom: "1px solid #2a2d3a", padding: "14px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15 }}>N</div>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15 }}>Neev — NeevCloud Demo Agent</div>
          <div style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[agentStatus], display: "inline-block", transition: "background 0.3s" }}></span>
            {statusLabel[agentStatus]}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {/* Screen Share Toggle */}
          <button onClick={screenStream ? stopScreenShare : startScreenShare}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${screenStream ? "#22c55e" : "#2a2d3a"}`, background: screenStream ? "#0a2a15" : "#1a1d27", color: screenStream ? "#22c55e" : "#888", fontSize: 13, cursor: "pointer" }}>
            {screenStream ? "📺 Sharing" : "Share Screen"}
          </button>
          {/* Mic Toggle */}
          {sessionStarted && (
            <button onClick={toggleMic}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${isListening ? "#22c55e" : "#2a2d3a"}`, background: isListening ? "#0a2a15" : "#1a1d27", color: isListening ? "#22c55e" : "#888", fontSize: 13, cursor: "pointer" }}>
              {isListening ? "🎙️ Mic On" : "🎙️ Mic Off"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left: Demo Steps */}
        <div style={{ width: 220, background: "#13151f", borderRight: "1px solid #2a2d3a", padding: "20px 14px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#555", fontWeight: 500, letterSpacing: "0.08em", marginBottom: 14, textTransform: "uppercase" }}>Demo Steps</div>
          {DEMO_STEPS.map((step, i) => (
            <button key={step.id} onClick={() => jumpToStep(step)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none", background: currentStep === i ? "#1B3A6B22" : "transparent", color: currentStep === i ? "#5b9bd5" : "#888", fontSize: 13, cursor: "pointer", marginBottom: 4, transition: "all 0.2s", borderLeft: currentStep === i ? "2px solid #1B3A6B" : "2px solid transparent" }}>
              <span style={{ color: currentStep === i ? "#5b9bd5" : "#444", marginRight: 8 }}>{step.id}.</span>
              {step.label}
            </button>
          ))}

          {/* Screen preview */}
          {screenStream && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Screen</div>
              <video ref={videoRef} autoPlay muted style={{ width: "100%", borderRadius: 6, border: "1px solid #2a2d3a" }} />
            </div>
          )}
        </div>

        {/* Center: Conversation */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {!sessionStarted ? (
            // Start screen
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 40 }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>☁️</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 500, marginBottom: 8 }}>NeevCloud Demo Agent</div>
                <div style={{ color: "#666", fontSize: 15, maxWidth: 400, lineHeight: 1.6 }}>
                  A live voice agent that walks your clients through the NeevCloud platform — dashboard, instance creation, billing, and more.
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={startScreenShare} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #2a2d3a", background: "#1a1d27", color: "#aaa", fontSize: 14, cursor: "pointer" }}>
                  Share Screen First (Optional)
                </button>
                <button onClick={startSession} style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "#1B3A6B", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
                  Start Demo
                </button>
              </div>
              {error && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? "#2a2d3a" : "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      {m.role === "user" ? "You" : "N"}
                    </div>
                    <div style={{ maxWidth: "72%", padding: "12px 16px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px", background: m.role === "user" ? "#1e2030" : "#1a2540", border: "1px solid", borderColor: m.role === "user" ? "#2a2d3a" : "#1B3A6B44", fontSize: 14, lineHeight: 1.65, color: "#d0cec8" }}>
                      {m.content}
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {isLoading && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>N</div>
                    <div style={{ padding: "14px 18px", borderRadius: "4px 14px 14px 14px", background: "#1a2540", border: "1px solid #1B3A6B44", display: "flex", gap: 5, alignItems: "center" }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#5b9bd5", display: "inline-block", animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom bar */}
              <div style={{ padding: "16px 24px", borderTop: "1px solid #2a2d3a", background: "#13151f", display: "flex", alignItems: "center", gap: 12 }}>
                {/* Live transcript */}
                <div style={{ flex: 1, padding: "10px 16px", borderRadius: 10, background: "#1a1d27", border: `1px solid ${isListening ? "#22c55e44" : "#2a2d3a"}`, fontSize: 14, color: transcript ? "#d0cec8" : "#444", minHeight: 42, display: "flex", alignItems: "center", transition: "border-color 0.3s" }}>
                  {transcript || (isListening ? "Listening for your voice..." : "Press mic to speak")}
                </div>
                <button onClick={toggleMic}
                  style={{ width: 48, height: 48, borderRadius: "50%", border: "none", background: isListening ? "#22c55e" : "#1B3A6B", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
                  🎙️
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #13151f; }
        ::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 3px; }
      `}</style>
    </div>
  );
}
