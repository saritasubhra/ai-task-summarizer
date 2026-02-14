import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [taskId, setTaskId] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const API = "http://localhost:5000";

  /* Check login */
  useEffect(() => {
    axios
      .get(`${API}/me`, { withCredentials: true })
      .then((res) => setLoggedIn(res.data.loggedIn))
      .catch(() => setLoggedIn(false));
  }, []);

  /* OAuth login */
  const connectClickUp = () => {
    window.location.href = `${API}/auth/clickup`;
  };

  /* Summarize */
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

  /* UI */
  if (!loggedIn)
    return (
      <div style={{ padding: 40 }}>
        <h2>AI Task Summarizer</h2>
        <button onClick={connectClickUp}>Connect ClickUp</button>
      </div>
    );

  return (
    <div style={{ padding: 40 }}>
      <h2>AI Task Summarizer</h2>

      <input
        placeholder="Enter ClickUp Task ID"
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
      />
      <br />
      <br />

      <button onClick={summarizeTask}>
        {loading ? "Summarizing..." : "Summarize Task"}
      </button>

      {summary && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        >
          <h3>Task Summary</h3>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
}

export default App;
