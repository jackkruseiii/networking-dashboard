import { useState } from "react";
import NetworkingDashboard from "./App_Dashboard";
import NewportDigest from "./NewportDigest";

export default function App() {
  const [page, setPage] = useState("dashboard");

  if (page === "newport") return <NewportDigest onBack={() => setPage("dashboard")} />;
  return <NetworkingDashboard onNewport={() => setPage("newport")} />;
}
