export async function runAgentOrchestrator(task: string, onOutput: (data: string) => void) {
  onOutput(`[MCP Orchestrator] Dispatching task: "${task}"\n`);
  onOutput(`[INFO] Protocol: Model Context Protocol (MCP stdio/sse)\n`);

  const agentDaemonUrl = process.env.MCP_AGENT_URL;
  if (agentDaemonUrl) {
    try {
      onOutput(`[INFO] Connecting to external agent daemon at ${agentDaemonUrl}...\n`);
      const response = await fetch(`${agentDaemonUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task })
      });
      if (response.ok) {
        const text = await response.text();
        onOutput(`[AGENT OUTPUT] ${text}\n`);
        onOutput(`[SUCCESS] Task finished.\n`);
        return;
      } else {
        onOutput(`[ERROR] Agent daemon returned status ${response.status}: ${await response.text()}\n`);
        return;
      }
    } catch (err: any) {
      onOutput(`[ERROR] Connection to agent daemon failed: ${err.message}\n`);
      return;
    }
  }

  // When no external agent daemon is configured, report honest status
  onOutput(`[STATUS] MCP Agent Daemon is not connected.\n`);
  onOutput(`[NOTE] To execute autonomous coding or action workflows, configure MCP_AGENT_URL in your environment or launch 'npm run mcp'.\n`);
  onOutput(`[MCP Orchestrator] Standby mode active.\n`);
}
