import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [taskId, setTaskId] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const API = "https://ai-task-summarizer.onrender.com";

  /* Check login - Logic Unchanged */
  useEffect(() => {
    axios
      .get(`${API}/me`, { withCredentials: true })
      .then((res) => setLoggedIn(res.data.loggedIn))
      .catch(() => setLoggedIn(false));
  }, []);

  /* OAuth login - Logic Unchanged */
  const connectClickUp = () => {
    window.location.href = `${API}/auth/clickup`;
  };

  /* Summarize - Logic Unchanged */
  const summarizeTask = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/summarize`,
        { taskId },
        { withCredentials: true },
      );
      setSummary(res.data.summary);
    } catch (err) {
      alert("Failed to summarize");
    }
    setLoading(false);
  };

  /* UI - Styled with Tailwind */
  if (!loggedIn)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
              <span className="text-3xl">✨</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            AI Task Summarizer
          </h2>
          <p className="text-slate-500 mb-8">
            Connect your ClickUp workspace to start generating smart summaries.
          </p>
          <button
            onClick={connectClickUp}
            className="w-full py-3 px-4 bg-[#7b68ee] hover:bg-[#6a56d6] text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-2"
          >
            Connect ClickUp
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-10 font-sans text-slate-900">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <span className="text-teal-500">✨</span> AI Task Summarizer
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Input Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 ml-1">
              ClickUp Task ID
            </label>
            <input
              placeholder="e.g. 86d1jyv7w"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-all text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={summarizeTask}
            disabled={loading || !taskId}
            className={`w-full py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
              loading || !taskId
                ? "bg-slate-300 cursor-not-allowed"
                : "bg-[#2ea2bd] hover:bg-[#248da5] shadow-lg shadow-teal-100 active:scale-[0.98]"
            }`}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </>
            ) : (
              "Summarize Task"
            )}
          </button>

          {/* Result Section */}
          {summary && (
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">
                  Task Summary
                </h3>
                <span className="px-3 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-full uppercase tracking-wider">
                  Generated by AI
                </span>
              </div>
              <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 leading-relaxed whitespace-pre-wrap shadow-inner">
                {summary}
              </div>
            </div>
          )}
        </div>

        {/* Footer info matching your screenshot style */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Powered by Gemini 2.5 Flash
          </span>
          {loggedIn && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-slate-500 font-medium">
                ClickUp Connected
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
