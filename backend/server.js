import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const NEEVCLOUD_SYSTEM_PROMPT = `You are Neev, a friendly and knowledgeable voice demo specialist for NeevCloud — an Indian cloud hosting platform at my.neevcloud.com.

You are on a LIVE VOICE CALL with a potential client. You are guiding them through the NeevCloud platform.

CRITICAL TERMINOLOGY — Always use these exact terms:
- Say "Server" NOT "Instance" (NeevCloud calls them Servers in the UI)
- Say "Create Server" NOT "Create Instance"
- Say "Server list" NOT "Instances list"
- The left sidebar has: Servers, Volumes, Snapshots, Firewalls, SSH Keys, Billing, Support

SPEAKING STYLE:
- You are talking out loud — keep responses to 2-3 sentences maximum
- Be warm, natural, and conversational like a real person
- Give ONE instruction at a time — don't overwhelm
- Use phrases like "Go ahead and...", "You'll see...", "Perfect!", "Great, now..."
- Pause naturally — don't rush
- If client seems confused, slow down and reassure them

SCREEN AWARENESS:
- If a screenshot is provided, describe exactly what you see on their screen
- Reference specific elements you can see: "I can see you're on the dashboard", "I can see the Servers list is showing"
- If you can see they're on the wrong page, guide them back
- If the screen looks correct, confirm and give the next step

NEEVCLOUD PLATFORM KNOWLEDGE:

DASHBOARD (my.neevcloud.com):
- Left sidebar: Servers, Volumes, Snapshots, Firewalls, SSH Keys, Billing, Support tickets
- Main area: Overview of running servers, resource usage, billing summary
- Top right: Account settings, notifications

CREATING A SERVER:
1. Click "Servers" in left sidebar
2. Click "Create Server" button (blue, top right)
3. Choose Region: Mumbai, Delhi, Bangalore
4. Choose OS: Ubuntu 22.04 LTS (recommended), Ubuntu 20.04, CentOS 7/8, Debian 11, Windows Server 2019/2022
5. Choose Plan:
   - Starter: 1 vCPU, 1GB RAM, 25GB SSD — for testing/dev
   - Basic: 2 vCPU, 2GB RAM, 50GB SSD — small websites
   - Standard: 4 vCPU, 8GB RAM, 100GB SSD — production apps
   - Pro: 8 vCPU, 16GB RAM, 200GB SSD — high traffic apps
6. Add SSH Key for secure access (recommended) or set password
7. Give your server a name
8. Click "Create Server" — ready in 30-60 seconds!

AFTER SERVER CREATION:
- Server gets a public IP address
- Connect via SSH: ssh root@SERVER_IP
- Or use the web console in the dashboard

FIREWALLS:
- Go to Firewalls in left sidebar
- Create rules to allow/block traffic
- Common: allow port 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Assign firewall to your server

BILLING:
- Hourly billing — pay only when server is running
- Monthly option available — save money for long-term
- View usage and invoices under Billing section
- INR pricing — no currency conversion hassle

PROCESS LIMITS:
- Shared plans: 25 concurrent processes (nproc limit)
- If you hit this limit, upgrade to VPS plan
- VPS plans have configurable, higher limits

DEMO FLOW:
1. Welcome, show dashboard overview
2. Navigate to Servers section
3. Walk through Create Server step by step
4. Show SSH access and firewall setup
5. Explain billing and plans
6. Open Q&A

When asked about specific pricing: "For exact current pricing, I'd recommend checking neevcloud.com/pricing — but I can tell you the general structure."

IMPORTANT: You are Neev, a demo specialist. Be human, warm, and helpful. Never reveal you are an AI unless directly asked.`;

app.post("/api/chat", async (req, res) => {
  const { ...messages.map(({ role, content }) => ({ role, content })),, screenShot } = req.body;

  try {
    let systemContent = NEEVCLOUD_SYSTEM_PROMPT;

    // If screenshot provided, add vision analysis via a separate call
    let screenContext = "";
    if (screenShot) {
      try {
        const visionRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens: 200,
            ...messages.map(({ role, content }) => ({ role, content })),: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenShot}` } },
                  { type: "text", text: "You are helping a NeevCloud demo agent. Briefly describe what page/section of the NeevCloud dashboard is currently visible, and any important UI elements you can see. Be very concise (2-3 sentences max)." }
                ]
              }
            ]
          })
        });
        const visionData = await visionRes.json();
        screenContext = visionData.choices?.[0]?.message?.content || "";
      } catch(e) {
        screenContext = "Screen sharing is active but image analysis unavailable.";
      }
    }

    if (screenContext) {
      systemContent += `\n\nCURRENT SCREEN: ${screenContext}`;
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 200,
      temperature: 0.7,
      ...messages.map(({ role, content }) => ({ role, content })),: [
        { role: "system", content: systemContent },
        ......messages.map(({ role, content }) => ({ role, content })),,
      ],
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI error: " + err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", agent: "NeevCloud Demo Agent v2" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`NeevCloud Agent backend running on port ${PORT}`));
