/** The only file in `src` allowed to touch `console` (AC24). Stdout carries only the MCP
 * protocol, so every log line goes to stderr through `console.error`, whatever the level. */

function write(level: 'info' | 'warn' | 'error', msg: string, data?: unknown): void {
  if (data === undefined) {
    console.error(`[${level}] ${msg}`);
  } else {
    console.error(`[${level}] ${msg}`, data);
  }
}

export const log = {
  info(msg: string, data?: unknown): void {
    write('info', msg, data);
  },
  warn(msg: string, data?: unknown): void {
    write('warn', msg, data);
  },
  error(msg: string, data?: unknown): void {
    write('error', msg, data);
  },
};
