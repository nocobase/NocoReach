/** Quote each untrusted argument for the POSIX shell used by the served installer. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function agentSetupCommands(server: string, token: string) {
  const base = server.replace(/\/+$/u, '');
  return {
    install: `curl -fsSL ${shellQuote(`${base}/api/agents/dist/installScript`)} | sh -s -- --server ${shellQuote(base)} --token ${shellQuote(token)}`,
    login: `nocoreach login --server ${shellQuote(base)}`,
  };
}
