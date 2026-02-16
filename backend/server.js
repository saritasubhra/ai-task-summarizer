import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

/* ================= CORS ================= */
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"));

/* ===== User Token Schema ===== */
const userSchema = new mongoose.Schema({
  clickupUserId: String,
  accessToken: String,
});

const User = mongoose.model("User", userSchema);

/* ================= SESSION ================= */
app.use(
  session({
    secret: "clickup-ai-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: {
      secure: true, // Required for HTTPS on Render
      sameSite: "none", // Required for cross-domain (Netlify -> Render)
      maxAge: 24 * 60 * 60 * 1000,
    },
    proxy: true, // Required for Render's reverse proxy
  }),
);

/* ================= GEMINI ================= */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/* =================================================
   1️⃣ Redirect user to ClickUp OAuth
================================================= */
app.get("/auth/clickup", (req, res) => {
  const redirectUrl =
    `https://app.clickup.com/api?client_id=${process.env.CLICKUP_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`;

  res.redirect(redirectUrl);
});

/* =================================================
   2️⃣ OAuth callback → exchange code → store in DB
================================================= */
app.get("/oauth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    /* Exchange code for access token */
    const tokenRes = await axios.post(
      "https://api.clickup.com/api/v2/oauth/token",
      {
        client_id: process.env.CLICKUP_CLIENT_ID,
        client_secret: process.env.CLICKUP_CLIENT_SECRET,
        code,
      },
    );

    const accessToken = tokenRes.data.access_token;

    /* Get ClickUp user info */
    const userRes = await axios.get("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: accessToken },
    });

    const clickupUserId = userRes.data.user.id;

    /* Save or update user in MongoDB */
    await User.findOneAndUpdate(
      { clickupUserId },
      { accessToken },
      { upsert: true, new: true },
    );

    /* Save session */
    req.session.clickupUserId = clickupUserId;

    res.redirect(`${process.env.FRONTEND_URL}`);
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);
    res.status(500).send("OAuth failed");
  }
});

/* =================================================
   3️⃣ Check logged-in user
================================================= */
app.get("/me", async (req, res) => {
  if (!req.session.clickupUserId)
    return res.status(401).json({ loggedIn: false });

  const user = await User.findOne({
    clickupUserId: req.session.clickupUserId,
  });

  res.json({ loggedIn: true, user });
});

/* =================================================
   4️⃣ Summarize task using stored OAuth token
================================================= */
app.post("/summarize", async (req, res) => {
  const { taskId } = req.body;

  /* ========= Auth check ========= */
  if (!req.session.clickupUserId) {
    return res.status(401).json({ error: "Login required" });
  }

  if (!taskId) {
    return res.status(400).json({ error: "taskId is required" });
  }

  try {
    /* ========= Get stored OAuth token ========= */
    const user = await User.findOne({
      clickupUserId: req.session.clickupUserId,
    });

    if (!user?.accessToken) {
      return res.status(401).json({ error: "Invalid session token" });
    }

    const accessToken = user.accessToken;

    /* =====================================================
       1️⃣ Fetch TASK DETAILS (name, status, dates, assignees)
    ====================================================== */
    const taskRes = await axios.get(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      { headers: { Authorization: accessToken } },
    );

    const task = taskRes.data;

    const taskInfo = {
      name: task.name,
      status: task.status?.status || "Unknown",
      priority: task.priority?.priority || "None",
      assignees: task.assignees?.map((a) => a.username) || [],
      startDate: task.start_date
        ? new Date(Number(task.start_date)).toDateString()
        : "Not set",
      dueDate: task.due_date
        ? new Date(Number(task.due_date)).toDateString()
        : "Not set",
      timeEstimate: task.time_estimate
        ? `${Math.round(task.time_estimate / (1000 * 60 * 60))} hrs`
        : "Not set",
    };

    /* =====================================================
       2️⃣ Calculate remaining days in BACKEND (not AI)
    ====================================================== */
    let remainingDays = "No due date";

    if (task.due_date) {
      const due = new Date(Number(task.due_date));
      const now = new Date();
      const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      remainingDays = diff >= 0 ? `${diff} days left` : "Overdue";
    }

    /* =====================================================
       3️⃣ Fetch TASK COMMENTS / ACTIVITY
    ====================================================== */
    const commentsRes = await axios.get(
      `https://api.clickup.com/api/v2/task/${taskId}/comment`,
      { headers: { Authorization: accessToken } },
    );

    const commentsText = commentsRes.data.comments
      ?.map((c) => c.comment_text)
      .filter(Boolean)
      .join("\n");

    /* If no comments, still generate structured overview */
    const safeComments =
      commentsText && commentsText.trim().length > 0
        ? commentsText
        : "No discussion comments available.";

    /* =====================================================
       4️⃣ STRUCTURED GEMINI PROMPT (very important)
    ====================================================== */
    const prompt = `
You are an AI project management assistant.

Generate a CLEAR, STRUCTURED task summary in **Markdown bullet format only**.

Follow this EXACT structure:

## Task Overview
- Name:
- Status:
- Priority:
- Assignees:
- Time Estimate:

## Timeline
- Start Date:
- Due Date:
- Days Remaining:

## Key Updates from Discussion
- Bullet points summarizing meaningful progress or decisions.

## Pending Work / Risks
- Bullet points describing unfinished tasks or blockers.

STRICT RULES:
- Use ONLY bullet points (no paragraphs).
- Keep it concise and professional.
- Do NOT invent data not provided.

=== TASK DATA ===
${JSON.stringify(taskInfo, null, 2)}
Days Remaining: ${remainingDays}

=== COMMENTS ===
${safeComments}
`;

    /* =====================================================
       5️⃣ Call Gemini
    ====================================================== */
    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    /* =====================================================
       6️⃣ Return clean response
    ====================================================== */
    res.json({
      summary,
      meta: {
        remainingDays,
        taskName: taskInfo.name,
        status: taskInfo.status,
      },
    });
  } catch (err) {
    console.error("Summarization error:", err.response?.data || err.message);

    res.status(500).json({
      error: "Failed to summarize task",
      details: err.response?.data || err.message,
    });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
