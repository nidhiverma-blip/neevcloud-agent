import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const DEMO_STEPS = [
  { id: 1, label: "Welcome & Overview", prompt: "Start the demo. Welcome the client warmly and give a quick overview of the NeevCloud dashboard — mention the left sidebar has Servers, Volumes, Firewalls, SSH Keys, Billing." },
  { id: 2, label: "Servers Section", prompt: "Guide the client to click on 'Servers' in the left sidebar. Explain what cloud servers are and what they can use them for." },
  { id: 3, label: "Create a Server", prompt: "Walk the client through creating a new server — click Create Server, choose region, choose OS (recommend Ubuntu 22.04), choose a plan, add SSH key or password, name it, and click Create." },
  { id: 4, label: "SSH & Firewalls", prompt: "Explain how to connect to their server via SSH after creation, and how to configure firewall rules to allow web traffic." },
  { id: 5, label: "Billing & Plans", prompt: "Walk through the Billing section. Explain hourly vs monthly billing, show how to view usage and invoices, and help them pick the right plan." },
  { id: 6, label: "Q&A", prompt: "Open it up — ask the client if they have any questions about anything they've seen, or anything specific they want to explore." },
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [screenStream, setScreenStream] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [agentStatus, setAgentStatus] = useState("idle");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [error, setError] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState(localStorage.getItem("el_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const recognitionRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const messagesEndRef = useRef(null);
  const silenceTimer = useRef(null);
  const audioRef = useRef(null);
  const isListeningRef = useRef(false);

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Capture screenshot from screen share stream
  const captureScreen = useCallback(() => {
    if (!screenStream || !videoRef.current) return null;
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!video.videoWidth) return null;
      canvas.width = 640;
      canvas.height = Math.round(video.videoHeight * (640 / video.videoWidth));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.45).split(",")[1];
    } catch (e) { return null; }
  }, [screenStream]);

  // ElevenLabs TTS - Sarah voice (natural, warm)
  const speakElevenLabs = useCallback(async (text) => {
    if (!elevenLabsKey) return false;
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL", {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": elevenLabsKey },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
        }),
      });
      if (!r.ok) return false;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => { setIsSpeaking(true); setAgentStatus("speaking"); };
        audio.onended = () => {
          setIsSpeaking(false);
          setAgentStatus(isListeningRef.current ? "listening" : "idle");
          URL.revokeObjectURL(url);
          resolve(true);
        };
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
    } catch (e) { return false; }
  }, [elevenLabsKey]);

  // Browser fallback TTS
  const speakBrowser = useCallback((text) => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "en-IN";
      utt.rate = 0.91;
      utt.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
      if (v) utt.voice = v;
      utt.onstart = () => { setIsSpeaking(true); setAgentStatus("speaking"); };
      utt.onend = () => { setIsSpeaking(false); setAgentStatus(isListeningRef.current ? "listening" : "idle"); resolve(); };
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    });
  }, []);

  const speak = useCallback(async (text) => {
    window.speechSynthesis.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch(e){} }
    const ok = await speakElevenLabs(text);
    if (!ok) await speakBrowser(text);
  }, [speakElevenLabs, speakBrowser]);

  // Speech recognition setup
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Please use Chrome for voice features."); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(interim || final);
      if (final) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          const txt = final.trim();
          if (txt) sendToAgentRef.current(txt, null);
        }, 850);
      }
    };
    rec.onerror = (e) => { if (e.error !== "no-speech") setError("Mic: " + e.error); };
    rec.onend = () => { if (isListeningRef.current) try { rec.start(); } catch(e) {} };
    recognitionRef.current = rec;
  }, []);

  const sendToAgent = useCallback(async (userText, systemOverride) => {
    if (!systemOverride && (isSpeaking || isLoading)) return;
    setIsLoading(true);
    setAgentStatus("thinking");
    setTranscript("");
    window.speechSynthesis.cancel();

    const screenShot = captureScreen();
    const userMsg = { role: "user", content: systemOverride || userText };
    const historyMsgs = systemOverride ? [userMsg] : [...messages, userMsg];

    if (!systemOverride) setMessages(p => [...p, { role: "user", content: userText, ts: Date.now() }]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyMsgs, screenShot }),
      });
      const data = await res.json();
      const reply = data.reply || "Sorry, could you repeat that?";
      setMessages(p => [...p, { role: "assistant", content: reply, ts: Date.now() }]);
      setIsLoading(false);
      await speak(reply);
    } catch (e) {
      setIsLoading(false);
      setAgentStatus("idle");
      setError("Connection error. Please try again.");
    }
  }, [messages, speak, captureScreen, isSpeaking, isLoading]);

  // Keep ref to avoid stale closures in speech rec
  const sendToAgentRef = useRef(sendToAgent);
  useEffect(() => { sendToAgentRef.current = sendToAgent; }, [sendToAgent]);

  const startListening = () => {
    try { recognitionRef.current?.start(); } catch(e) {}
    setIsListening(true);
    setAgentStatus("listening");
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch(e) {}
    setIsListening(false);
    setAgentStatus("idle");
  };

  const startSession = async () => {
    setSessionStarted(true);
    setMessages([]);
    setError("");
    startListening();
    await sendToAgent("", DEMO_STEPS[0].prompt);
  };

  const jumpToStep = async (step, idx) => {
    setCurrentStep(idx);
    window.speechSynthesis.cancel();
    if (audioRef.current) try { audioRef.current.pause(); } catch(e) {}
    await sendToAgent("", step.prompt);
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 3, width: 1280 }, audio: false });
      setScreenStream(stream);
      videoRef.current.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => setScreenStream(null);
    } catch (e) { }
  };

  const saveKey = (k) => { setElevenLabsKey(k); localStorage.setItem("el_key", k); setShowKeyInput(false); };

  const statusColor = { idle: "#444", listening: "#22c55e", thinking: "#f59e0b", speaking: "#3b82f6" };
  const statusLabel = { idle: "Ready", listening: "Listening...", thinking: "Thinking...", speaking: "Speaking..." };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f17", color: "#e0ddd6", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <video ref={videoRef} autoPlay muted style={{ display: "none" }} />

      {/* Header */}
      <div style={{ background: "#141724", borderBottom: "1px solid #1e2235", padding: "11px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>N</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>Neev — NeevCloud Demo Agent</div>
          <div style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[agentStatus], display: "inline-block", transition: "background 0.3s" }} />
            {statusLabel[agentStatus]}
            {elevenLabsKey && <span style={{ color: "#22c55e", marginLeft: 4 }}>✦ HD Voice</span>}
            {screenStream && <span style={{ color: "#3b82f6", marginLeft: 4 }}>📺 Screen Active</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={() => setShowKeyInput(!showKeyInput)} style={{ padding: "6px 11px", borderRadius: 7, border: `1px solid ${elevenLabsKey ? "#22c55e33" : "#1e2235"}`, background: "transparent", color: elevenLabsKey ? "#22c55e" : "#555", fontSize: 12, cursor: "pointer" }}>
            {elevenLabsKey ? "✦ HD Voice" : "+ HD Voice"}
          </button>
          <button onClick={screenStream ? () => { screenStream.getTracks().forEach(t => t.stop()); setScreenStream(null); } : startScreenShare}
            style={{ padding: "6px 11px", borderRadius: 7, border: `1px solid ${screenStream ? "#3b82f633" : "#1e2235"}`, background: "transparent", color: screenStream ? "#3b82f6" : "#555", fontSize: 12, cursor: "pointer" }}>
            {screenStream ? "📺 Sharing" : "Share Screen"}
          </button>
        </div>
      </div>

      {/* ElevenLabs input */}
      {showKeyInput && (
        <div style={{ background: "#141724", borderBottom: "1px solid #1e2235", padding: "10px 20px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666", flexShrink: 0 }}>ElevenLabs key:</span>
          <input id="elkey" defaultValue={elevenLabsKey} placeholder="Paste your free ElevenLabs API key..."
            style={{ flex: 1, padding: "7px 11px", borderRadius: 7, border: "1px solid #1e2235", background: "#0d0f17", color: "#e0ddd6", fontSize: 13, outline: "none" }} />
          <button onClick={() => saveKey(document.getElementById("elkey").value)}
            style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#1B3A6B", color: "#fff", fontSize: 12, cursor: "pointer" }}>Save</button>
          <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#5b9bd5", whiteSpace: "nowrap" }}>Get free key →</a>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 200, background: "#0d0f17", borderRight: "1px solid #1e2235", padding: "16px 10px", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#333", fontWeight: 500, letterSpacing: "0.1em", marginBottom: 10, textTransform: "uppercase" }}>Demo Flow</div>
          {DEMO_STEPS.map((step, i) => (
            <button key={step.id} onClick={() => jumpToStep(step, i)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", borderRadius: 6, border: "none", background: currentStep === i ? "#1B3A6B1a" : "transparent", color: currentStep === i ? "#5b9bd5" : "#555", fontSize: 12, cursor: "pointer", marginBottom: 2, borderLeft: `2px solid ${currentStep === i ? "#1B3A6B" : "transparent"}`, transition: "all 0.15s" }}>
              <span style={{ color: currentStep === i ? "#5b9bd5" : "#2a2d3a", marginRight: 6 }}>{step.id}.</span>{step.label}
            </button>
          ))}

          {screenStream && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, color: "#333", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Screen</div>
              <div style={{ position: "relative" }}>
                <video id="screen-preview" autoPlay muted style={{ width: "100%", borderRadius: 5, border: "1px solid #1e2235" }}
                  ref={el => { if (el && screenStream) el.srcObject = screenStream; }} />
                <div style={{ position: "absolute", bottom: 4, left: 4, background: "#22c55e", borderRadius: 3, padding: "2px 5px", fontSize: 9, color: "#000", fontWeight: 600 }}>LIVE</div>
              </div>
              <div style={{ fontSize: 10, color: "#22c55e", marginTop: 4 }}>AI can see your screen</div>
            </div>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!sessionStarted ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 40 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>☁️</div>
              <div style={{ textAlign: "center", maxWidth: 360 }}>
                <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>NeevCloud Demo Agent</div>
                <div style={{ color: "#444", fontSize: 13, lineHeight: 1.7 }}>Neev will guide your client through the NeevCloud platform by voice — creating servers, firewalls, billing, and more.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 360 }}>
                {!elevenLabsKey && (
                  <button onClick={() => setShowKeyInput(true)} style={{ padding: "10px", borderRadius: 8, border: "1px solid #22c55e22", background: "transparent", color: "#22c55e", fontSize: 13, cursor: "pointer" }}>
                    ✦ Add ElevenLabs for human-like voice (free)
                  </button>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={startScreenShare} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #1e2235", background: "#14172a", color: screenStream ? "#22c55e" : "#666", fontSize: 13, cursor: "pointer" }}>
                    {screenStream ? "✓ Screen Shared" : "Share Screen"}
                  </button>
                  <button onClick={startSession} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#1B3A6B", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                    Start Demo →
                  </button>
                </div>
              </div>
              {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.role === "user" ? "#1e2235" : "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                      {m.role === "user" ? "You" : "N"}
                    </div>
                    <div style={{ maxWidth: "76%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px", background: m.role === "user" ? "#1a1d2e" : "#151c30", border: "1px solid", borderColor: m.role === "user" ? "#1e2235" : "#1B3A6B33", fontSize: 13.5, lineHeight: 1.65, color: "#c8c5be" }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1B3A6B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>N</div>
                    <div style={{ padding: "12px 14px", borderRadius: "3px 12px 12px 12px", background: "#151c30", border: "1px solid #1B3A6B33", display: "flex", gap: 4, alignItems: "center" }}>
                      {[0,1,2].map(j => <span key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#5b9bd5", display: "inline-block", animation: `pulse 1.2s ${j*0.2}s infinite` }} />)}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: "12px 18px", borderTop: "1px solid #1e2235", background: "#0d0f17", display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, padding: "9px 13px", borderRadius: 9, background: "#14172a", border: `1px solid ${isListening ? "#22c55e33" : "#1e2235"}`, fontSize: 13, color: transcript ? "#c8c5be" : "#333", minHeight: 38, display: "flex", alignItems: "center", transition: "border-color 0.3s" }}>
                  {transcript || (isListening ? "Listening... speak now" : "Mic is off — click to enable")}
                </div>
                <button onClick={isListening ? stopListening : startListening}
                  style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: isListening ? "#22c55e" : "#1B3A6B", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
                  🎙️
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.2}40%{opacity:1}}*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0d0f17}::-webkit-scrollbar-thumb{background:#1e2235;border-radius:2px}`}</style>
    </div>
  );
}
