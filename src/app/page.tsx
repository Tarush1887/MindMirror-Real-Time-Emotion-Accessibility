"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// ✅ Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDa3pHbNfE6hf_s4FQg9oND6BuKGTT7P0s",
  authDomain: "mindmirror-nextjs.firebaseapp.com",
  projectId: "mindmirror-nextjs",
  storageBucket: "mindmirror-nextjs.firebasestorage.app",
  messagingSenderId: "654818672015",
  appId: "1:654818672015:web:c386e6c98f94ffebc35ffa",
  measurementId: "G-RK29X46PTJ",
};

// ✅ Firebase Init (safe)
const app = initializeApp(firebaseConfig);
let analytics: any = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch {
    console.warn("Analytics unavailable (likely SSR).");
  }
}
const auth = getAuth(app);
const db = getFirestore(app);

// ✅ Sentiment map
const SENTIMENT_MAP: Record<string, number> = {
  good: 2,
  great: 3,
  love: 3,
  awesome: 3,
  happy: 2,
  nice: 2,
  bad: -2,
  hate: -3,
  angry: -3,
  sad: -2,
  upset: -2,
  frustrated: -1,
  bored: -1,
};

const EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "🥹",
  "😅",
  "😂",
  "🤣",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😗",
  "☺️",
  "😊",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😋",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "😔",
  "😪",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🤢",
  "🤮",
  "🤧",
  "🥵",
  "🥶",
  "🥴",
  "😵",
  "😡",
];

function sentimentScore(text: string): number {
  let score = 0;
  text
    .toLowerCase()
    .split(/\s+/)
    .forEach((w) => {
      score += SENTIMENT_MAP[w] || 0;
    });
  return score;
}

function labelFromScore(score: number) {
  if (score > 2) return { label: "Positive", emoji: "😊" };
  if (score < -2) return { label: "Negative", emoji: "☹️" };
  return { label: "Neutral", emoji: "😐" };
}

// Simple “smart” indicators derived from sentiment score
function getSmileScore(score: number): string {
  if (score > 4) return "Very High";
  if (score > 1) return "High";
  if (score > -1) return "Medium";
  return "Low";
}

function getShockLevel(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("what") || t.includes("oh my") || t.includes("wow"))
    return "Surprised";
  return "Calm";
}

function getBlinkActivity(): string {
  // Demo-only: pretend normal blink activity
  return "Normal";
}

type Tab = "live" | "analytics" | "sessions";

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detector, setDetector] = useState<any>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [captions, setCaptions] = useState("");
  const [sentiment, setSentiment] = useState({
    label: "Neutral",
    emoji: "😐",
    score: 0,
  });
  const [history, setHistory] = useState<{ t: string; s: number }[]>([]);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [activeEmoji, setActiveEmoji] = useState("😐");
  const [fps, setFps] = useState(0);
  const [sessions, setSessions] = useState<
    { id: string; sentiment: string; captions: string; timestamp: string }[]
  >([]);
  const [activeTab, setActiveTab] = useState<Tab>("live");

  // 🔐 Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // 📥 Load recent sessions when user logs in
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const q = query(
          collection(db, "sessions"),
          where("uid", "==", user.uid),
          orderBy("timestamp", "desc")
        );
        const snap = await getDocs(q);
        const list = snap.docs.slice(0, 10).map((d) => {
          const data: any = d.data();
          const ts = data.timestamp?.toDate
            ? data.timestamp.toDate().toLocaleString()
            : "—";
          return {
            id: d.id,
            sentiment: data.sentiment || "Unknown",
            captions: data.captions || "",
            timestamp: ts,
          };
        });
        setSessions(list);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [user]);

  const login = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).catch((e) =>
      setError(e.message)
    );

  const register = (email: string, password: string) =>
    createUserWithEmailAndPassword(auth, email, password).catch((e) =>
      setError(e.message)
    );

  const logout = () => signOut(auth);

  // 🗣️ Speech → Sentiment
  useEffect(() => {
    if (typeof window === "undefined") return;
    // @ts-ignore
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0].transcript + " ";
      }
      setCaptions(t);
      const score = sentimentScore(t);
      const tag = labelFromScore(score);
      setSentiment({ ...tag, score });
      setActiveEmoji(tag.emoji);
      setHistory((h) => [
        ...h.slice(-30),
        { t: new Date().toLocaleTimeString(), s: score },
      ]);
    };
    rec.start();
    return () => rec.stop();
  }, []);

  // 🤖 Load face mesh model
  useEffect(() => {
    (async () => {
      try {
        await tf.setBackend("webgl");
        // @ts-ignore
        const det = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: "tfjs",
            refineLandmarks: true,
            maxFaces: 1,
          } as any
        );
        setDetector(det);
      } catch (e) {
        console.warn("FaceMesh detector load failed:", e);
      }
    })();
  }, []);

  // 🎥 Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Camera access denied or unavailable.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
    }
    setCameraOn(false);
  };

  const saveSession = async () => {
    if (!user) return;
    try {
      await addDoc(collection(db, "sessions"), {
        uid: user.uid,
        captions,
        sentiment: sentiment.label,
        timestamp: serverTimestamp(),
      });
      // reload list after save
      const q = query(
        collection(db, "sessions"),
        where("uid", "==", user.uid),
        orderBy("timestamp", "desc")
      );
      const snap = await getDocs(q);
      const list = snap.docs.slice(0, 10).map((d) => {
        const data: any = d.data();
        const ts = data.timestamp?.toDate
          ? data.timestamp.toDate().toLocaleString()
          : "—";
        return {
          id: d.id,
          sentiment: data.sentiment || "Unknown",
          captions: data.captions || "",
          timestamp: ts,
        };
      });
      setSessions(list);
    } catch (e) {
      console.error(e);
      setError("Failed to save session.");
    }
  };
  const deleteSession = async (sessionId: string) => {
  try {
    await deleteDoc(doc(db, "sessions", sessionId));
    console.log("Session deleted");
  } catch (error) {
    console.error("Error deleting session:", error);
  }
};

  // 🎯 Face overlay + FPS + Heatmap
  useEffect(() => {
    if (!detector || !cameraOn) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let frames = 0;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = async () => {
      if (!video || video.readyState < 2) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const now = performance.now();
      frames++;
      if (now - lastTime >= 1000) {
        setFps(frames);
        frames = 0;
        lastTime = now;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background heatmap tint based on sentiment
      if (sentiment.label === "Positive") {
        ctx.fillStyle = "rgba(34, 197, 94, 0.10)";
      } else if (sentiment.label === "Negative") {
        ctx.fillStyle = "rgba(248, 113, 113, 0.10)";
      } else {
        ctx.fillStyle = "rgba(234, 179, 8, 0.08)";
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        const faces = await detector.estimateFaces(video);
        ctx.lineWidth = 1.8;

        (faces || []).forEach((face: any) => {
          if (face.box) {
            const { xMin, yMin, xMax, yMax } = face.box;
            const w = xMax - xMin;
            const h = yMax - yMin;

            if (sentiment.label === "Positive") ctx.strokeStyle = "#4ade80";
            else if (sentiment.label === "Negative") ctx.strokeStyle = "#f87171";
            else ctx.strokeStyle = "#facc15";

            ctx.strokeRect(xMin, yMin, w, h);

            const centerX = xMin + w / 2;
            const topY = Math.max(28, yMin - 24);
            ctx.font = "26px system-ui";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(activeEmoji, centerX, topY);

            if (face.keypoints) {
              ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
              face.keypoints.forEach((pt: any) => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          }
        });
      } catch (e) {
        console.warn("Face estimation failed:", e);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [detector, cameraOn, sentiment.label, activeEmoji]);

  // 🔑 Login Screen
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-linear-to-br from-slate-950 via-slate-900 to-emerald-900 text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="p-6 bg-slate-900/80 rounded-2xl w-80 shadow-xl border border-emerald-500/25 backdrop-blur fade-in"
        >
          <h1 className="text-xl mb-2 text-center font-semibold">
            🧠 MindMirror Login
          </h1>
          <p className="text-xs text-gray-300 mb-4 text-center">
            Sign in to access real-time emotion accessibility.
          </p>
          {error && (
            <p className="text-red-400 mb-2 text-xs text-center">{error}</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const email = (e.currentTarget as any).email.value;
              const pass = (e.currentTarget as any).pass.value;
              login(email, pass);
            }}
            className="space-y-2"
          >
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full p-2 rounded bg-slate-800 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
            />
            <input
              type="password"
              name="pass"
              placeholder="Password"
              required
              className="w-full p-2 rounded bg-slate-800 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
            />
            <button className="w-full bg-emerald-600 hover:bg-emerald-700 py-2 rounded text-sm font-semibold transition">
              Login
            </button>
          </form>
          <button
            onClick={() => register("demo@demo.com", "password123")}
            className="mt-4 text-xs underline w-full text-center block text-emerald-300 hover:text-emerald-200"
          >
            Quick Register Demo User
          </button>
        </motion.div>
      </div>
    );
  }

  const smileScore = getSmileScore(sentiment.score);
  const shockLevel = getShockLevel(captions);
  const blinkActivity = getBlinkActivity();

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex lg:w-64 flex-col border-r border-emerald-900/25 bg-slate-950/85 backdrop-blur px-5 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="font-bold text-lg tracking-wide">MindMirror</h1>
              <p className="text-[11px] text-emerald-300/90">
                Emotion Accessibility AI
              </p>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Live
            </p>

            <button
              onClick={() => setActiveTab("live")}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === "live"
                  ? "bg-emerald-500/10 border border-emerald-400/40 text-emerald-100"
                  : "bg-slate-900/70 border border-slate-700/80 text-slate-300 hover:border-emerald-300/40"
              }`}
            >
              Live Session
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === "analytics"
                  ? "bg-emerald-500/10 border border-emerald-400/40 text-emerald-100"
                  : "bg-slate-900/70 border border-slate-700/80 text-slate-300 hover:border-emerald-300/40"
              }`}
            >
              Analytics
            </button>

            <button
              onClick={() => setActiveTab("sessions")}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === "sessions"
                  ? "bg-emerald-500/10 border border-emerald-400/40 text-emerald-100"
                  : "bg-slate-900/70 border border-slate-700/80 text-slate-300 hover:border-emerald-300/40"
              }`}
            >
              Saved Sessions
            </button>
          </nav>

          <div className="space-y-2 text-xs">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Live Status
            </p>
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 card-hover">
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">FPS</span>
                <span className="text-emerald-300 font-semibold">{fps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Camera</span>
                <span
                  className={
                    cameraOn ? "text-emerald-300 font-semibold" : "text-slate-500"
                  }
                >
                  {cameraOn ? "On" : "Off"}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 card-hover">
              <p className="text-[11px] text-slate-400 mb-1">Current Mood</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{activeEmoji}</span>
                <div>
                  <p className="text-xs font-semibold">{sentiment.label}</p>
                  <p className="text-[11px] text-slate-400">
                    Score: {sentiment.score}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-2 text-[11px] text-slate-500">
            <div>
              Signed in as
              <br />
              <span className="text-slate-200 break-all text-[11px]">
                {user?.email || "Demo User"}
              </span>
            </div>
            <button
              onClick={logout}
              className="mt-1 px-3 py-1.5 rounded-full border border-slate-700 text-slate-300 hover:border-emerald-300 hover:text-emerald-200 text-[11px] transition"
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Main area (content + mobile header) */}
        <div className="flex-1 flex flex-col">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧠</span>
              <div>
                <h1 className="font-bold text-base">MindMirror</h1>
                <p className="text-[11px] text-emerald-300/90">
                  Emotion Accessibility
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-[11px]">
                FPS: <span className="font-semibold">{fps}</span>
              </span>
              <button
                onClick={logout}
                className="text-[11px] text-slate-200 hover:text-emerald-300"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Content - switch via activeTab */}
          <main className="flex-1 p-4 lg:p-6 max-w-6xl mx-auto w-full">
            {activeTab === "live" && (
              <div className="grid lg:grid-cols-3 gap-6 fade-in">
                {/* LEFT: Camera + stats */}
                <section className="lg:col-span-2 space-y-4">
                  <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-emerald-500/25 card-hover">
                    <video
                      ref={videoRef}
                      className="w-full h-auto object-cover"
                      autoPlay
                      playsInline
                      muted
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 pointer-events-none"
                    />
                    <div className="absolute bottom-3 left-3 right-3 bg-slate-950/80 px-3 py-2 rounded-2xl text-sm flex items-center gap-3 backdrop-blur border border-slate-800/80 shadow-lg">
                      <span className="text-3xl">{activeEmoji}</span>
                      <span className="truncate text-xs sm:text-sm">
                        {captions ||
                          "Listening… start speaking to see captions."}
                      </span>
                      <span className="ml-auto text-[10px] sm:text-xs text-emerald-300 whitespace-nowrap">
                        {sentiment.label} ({sentiment.score})
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-1 flex-wrap">
                    <button
                      onClick={startCamera}
                      className="btn btn-green text-xs sm:text-sm"
                    >
                      Start Camera
                    </button>
                    <button
                      onClick={stopCamera}
                      className="btn btn-red text-xs sm:text-sm"
                    >
                      Stop Camera
                    </button>
                    <button
                      onClick={saveSession}
                      className="btn btn-blue text-xs sm:text-sm"
                    >
                      Save Session
                    </button>
                    {error && (
                      <span className="text-xs text-red-400 mt-1">{error}</span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Smile Score
                      </h3>
                      <p className="text-lg font-semibold text-emerald-300">
                        {smileScore}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Derived from recent speech sentiment.
                      </p>
                    </div>
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Shock Detection
                      </h3>
                      <p className="text-lg font-semibold text-amber-300">
                        {shockLevel}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Looks for surprise cues in your words.
                      </p>
                    </div>
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Eye Blink Activity
                      </h3>
                      <p className="text-lg font-semibold text-sky-300">
                        {blinkActivity}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Demo metric for visual engagement.
                      </p>
                    </div>
                  </div>
                </section>

                {/* RIGHT: Timeline + emojis + sessions snippet */}
                <aside className="space-y-4">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h2 className="font-semibold mb-2 text-sm flex items-center gap-2">
                      Mood Timeline
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/30">
                        Live
                      </span>
                    </h2>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <XAxis dataKey="t" hide />
                          <YAxis domain={[-10, 10]} />
                          <Tooltip />
                          <Line
                            dataKey="s"
                            stroke="#4ade80"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      Emoji Reactions
                    </h3>
                    <div className="grid grid-cols-10 gap-1 text-2xl">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => setActiveEmoji(e)}
                          className={`p-1 rounded-lg transition transform hover:scale-110 ${
                            activeEmoji === e
                              ? "bg-emerald-500/80 ring-2 ring-emerald-300 shadow-md"
                              : "hover:bg-slate-800/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 max-h-48 overflow-y-auto card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      Recent Sessions
                    </h3>
                    {sessions.length === 0 && (
                      <p className="text-xs text-slate-400">
                        No sessions yet. Use <b>Save Session</b> after a
                        conversation.
                      </p>
                    )}
                    <ul className="space-y-2 text-xs">
                      {sessions.slice(0, 3).map((s) => (
                        <li
                          key={s.id}
                          className="border border-slate-800 rounded-lg p-2 bg-slate-950/70"
                        >
                          <div className="flex justify-between mb-1 items-center">
                            <span className="font-semibold">{s.sentiment}</span>
                            <span className="text-[10px] text-slate-400">
                              {s.timestamp}
                            </span>
                          </div>
                          <p className="text-slate-200 line-clamp-2">
                            {s.captions}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              </div>
            )}

            {activeTab === "analytics" && (
              <div className="grid lg:grid-cols-3 gap-6 fade-in">
                <section className="lg:col-span-2 space-y-4">
                  <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/90 card-hover">
                    <h2 className="font-semibold text-sm mb-2">
                      Mood Timeline (All Events)
                    </h2>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <XAxis dataKey="t" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            dataKey="s"
                            stroke="#4ade80"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Current Sentiment
                      </h3>
                      <p className="text-lg font-semibold text-emerald-300">
                        {sentiment.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Latest detected emotion from speech.
                      </p>
                    </div>
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Smile Score
                      </h3>
                      <p className="text-lg font-semibold text-emerald-300">
                        {smileScore}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Higher score means more positive tone.
                      </p>
                    </div>
                    <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 card-hover">
                      <h3 className="text-[11px] text-slate-400 mb-1">
                        Sessions Recorded
                      </h3>
                      <p className="text-lg font-semibold text-sky-300">
                        {sessions.length}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Saved conversations in your history.
                      </p>
                    </div>
                  </div>
                </section>

                <aside className="space-y-4">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      Emoji Usage Snapshot
                    </h3>
                    <p className="text-xs text-slate-400 mb-2">
                      Current selected reaction:
                    </p>
                    <div className="text-4xl mb-2">{activeEmoji}</div>
                    <p className="text-xs text-slate-400">
                      Use reactions to tag how you feel in the moment. These can
                      be mapped to emotion insights later.
                    </p>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      Quick Insight
                    </h3>
                    <p className="text-xs text-slate-300">
                      MindMirror combines <b>speech sentiment</b>,{" "}
                      <b>facial signals</b>, and <b>manual reactions</b> to help
                      deaf or hard-of-hearing users understand emotional tone in
                      real-time conversations.
                    </p>
                  </div>
                </aside>
              </div>
            )}

            {activeTab === "sessions" && (
              <div className="grid lg:grid-cols-3 gap-6 fade-in">
                <section className="lg:col-span-2 space-y-4">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h2 className="font-semibold text-sm mb-2">
                      Saved Sessions
                    </h2>
                    {sessions.length === 0 && (
                      <p className="text-xs text-slate-400">
                        No sessions saved yet. Use <b>Save Session</b> during a
                        live conversation to store emotion summaries.
                      </p>
                    )}
                    <ul className="space-y-3 text-xs max-h-[480px] overflow-y-auto">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className="border border-slate-800 rounded-lg p-3 bg-slate-950/70"
                        >
                          <div className="flex justify-between mb-1 items-center">
                            <span className="font-semibold">{s.sentiment}</span>
                            <span className="text-[10px] text-slate-400">
                              {s.timestamp}
                            </span>
                            {/* Delete button */}
                            <button
                              onClick={() => deleteSession(s.id)}
                              className="text-red-400 hover:text-red-600 text-xs"
                              title="Delete Session"
                            >
                              Delete
                            </button>
                          </div>
                          <p className="text-slate-200 text-xs">
                            {s.captions || <i>No transcript captured.</i>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <aside className="space-y-4">
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      How Saved Sessions Help
                    </h3>
                    <p className="text-xs text-slate-300">
                      Each session stores the <b>final sentiment label</b> and
                      <b>captions</b>. Over time, this can be turned into an{" "}
                      <b>emotion diary</b> for therapists, educators, or users
                      themselves.
                    </p>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/90 card-hover">
                    <h3 className="font-semibold mb-2 text-sm">
                      Tip for Demo
                    </h3>
                    <p className="text-xs text-slate-300">
                      During your CodeDay demo, run a short conversation, hit{" "}
                      <b>Save Session</b>, then switch to this tab to show how
                      MindMirror keeps an accessible record of emotional
                      context.
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </main>

          <footer className="text-center p-3 text-[11px] text-slate-500 border-t border-slate-800 bg-slate-950/85">
            © 2025 MindMirror · Built with Next.js · Firebase · TensorFlow.js
          </footer>
        </div>
      </div>
    </div>
  );
}
