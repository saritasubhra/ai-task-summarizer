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

    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
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

  if (!req.session.clickupUserId)
    return res.status(401).json({ error: "Login required" });

  try {
    const user = await User.findOne({
      clickupUserId: req.session.clickupUserId,
    });

    const accessToken = user.accessToken;

    /* Fetch task comments */
    const commentsRes = await axios.get(
      `https://api.clickup.com/api/v2/task/${taskId}/comment`,
      { headers: { Authorization: accessToken } },
    );

    const text = commentsRes.data.comments
      .map((c) => c.comment_text)
      .join("\n");

    if (!text.trim())
      return res.json({ summary: "No activity found to summarize." });

    /* Gemini summary */
    const prompt = `
Summarize this ClickUp task activity in bullet points.
Include:
- Key updates
- Decisions
- Pending work

${text}
`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    res.json({ summary });
  } catch (err) {
    console.error("Summarization error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to summarize task" });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
