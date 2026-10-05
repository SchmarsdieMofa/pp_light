import { readFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { createSecureContext, createServer as createTlsServer, TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMailOptions, createMailTransport, validateMailConfiguration } from "../../src/server/mail/transport";
import { checkSmtp } from "../../src/server/mail/diagnostics";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const caFile = fileURLToPath(new URL("./fixtures/server.crt", import.meta.url));
const base = { SMTP_HOST: "127.0.0.1", SMTP_TLS_CA_FILE: caFile };
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

// Minimal local SMTP peer: real TCP/STARTTLS/TLS handshakes and message acceptance.
async function smtpServer({ starttls = false, implicit = false, brokenTls = false, weakDh = false, expired = false } = {}) {
  const tlsOptions = {
    key: fixture("server.key"), cert: fixture(expired ? "expired.crt" : "server.crt"),
    ...(weakDh ? { dhparam: fixture("dh1024.dh"), ciphers: "DHE-RSA-AES128-SHA256@SECLEVEL=0", maxVersion: "TLSv1.2" as const } : {}),
  };
  const sockets = new Set<Socket>();
  const result = { tlsConnections: 0, messages: 0, commands: [] as string[] };
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on("error", () => {}); // Negative handshake tests deliberately close connections.
    socket.on("close", () => sockets.delete(socket));
  };
  const handle = (socket: Socket, secure: boolean, greet = true) => {
    track(socket);
    if (secure) result.tlsConnections++;
    if (greet) socket.write("220 localhost test SMTP\r\n");
    let buffer = "";
    let data = false;
    const receive = (chunk: Buffer) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === ".") { data = false; result.messages++; socket.write("250 accepted\r\n"); }
          continue;
        }
        const command = line.split(" ")[0];
        result.commands.push(command);
        if (command === "EHLO") socket.write(`250-localhost\r\n${starttls && !secure ? "250-STARTTLS\r\n" : ""}250 SIZE 100000\r\n`);
        else if (command === "STARTTLS") {
          if (!starttls || brokenTls) socket.write("454 TLS unavailable\r\n");
          else {
            socket.write("220 Ready for TLS\r\n");
            socket.removeListener("data", receive);
            const upgraded = new TLSSocket(socket, { isServer: true, secureContext: createSecureContext(tlsOptions) });
            handle(upgraded, true, false);
            return;
          }
        } else if (command === "DATA") { data = true; socket.write("354 send message\r\n"); }
        else if (command === "QUIT") socket.end("221 goodbye\r\n");
        else socket.write("250 OK\r\n");
      }
    };
    socket.on("data", receive);
  };
  const server = implicit ? createTlsServer(tlsOptions, (socket) => handle(socket, true)) : createServer((socket) => handle(socket, false));
  server.on("connection", track);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  stops.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return { result, port: String(address.port) };
}

async function send(env: Record<string, string | undefined>) {
  const transport = createMailTransport(env);
  try { await transport.sendMail({ from: "from@localhost", to: "to@localhost", subject: "test", text: "SMTP regression" }); }
  finally { transport.close(); }
}

describe("SMTP configuration", () => {
  it("keeps safe defaults and the existing port", () => {
    const options = buildMailOptions({});
    expect(options).toMatchObject({ port: 1025, secure: false, ignoreTLS: false, requireTLS: false, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" } });
  });
  it("preserves legacy settings, with explicit new settings taking precedence", () => {
    expect(buildMailOptions({ SMTP_SECURE: "true" }).secure).toBe(true);
    expect(buildMailOptions({ SMTP_SECURE: "true", SMTP_TLS_MODE: "none" })).toMatchObject({ secure: false, ignoreTLS: true });
    expect(buildMailOptions({ SMTP_USER: "user", SMTP_PASSWORD: "old", SMTP_PASS: "alias" }).auth).toEqual({ user: "user", pass: "old" });
    expect(buildMailOptions({ SMTP_USER: "user", SMTP_PASS: "alias" }).auth).toEqual({ user: "user", pass: "alias" });
  });
  it.each([
    ["SMTP_TLS_MODE", "typo"], ["SMTP_TLS_MIN_VERSION", "TLSv0"],
    ["SMTP_TLS_REJECT_UNAUTHORIZED", "no"], ["SMTP_PORT", "NaN"], ["SMTP_PORT", "0"],
    ["SMTP_TLS_CA_FILE", "missing-test-ca-file"],
  ])("rejects invalid %s before worker startup", (name, value) => {
    expect(() => validateMailConfiguration({ [name]: value })).toThrow(name);
  });
  it("logs both insecure opt-ins on startup", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateMailConfiguration({ SMTP_TLS_MODE: "none", SMTP_TLS_REJECT_UNAUTHORIZED: "false" });
    expect(warn.mock.calls.flat().join("\n")).toContain("SMTP_TLS_MODE=none");
    expect(warn.mock.calls.flat().join("\n")).toContain("SMTP_TLS_REJECT_UNAUTHORIZED=false");
  });
});

describe("SMTP transport against real local peers", () => {
  it.each(["auto", "starttls", "required", "ssl", "none"])("sends with mode %s", async (mode) => {
    const peer = await smtpServer({ starttls: true, implicit: mode === "ssl" });
    await send({ ...base, SMTP_PORT: peer.port, SMTP_TLS_MODE: mode });
    expect(peer.result.messages).toBe(1);
    expect(peer.result.tlsConnections).toBe(mode === "none" ? 0 : 1);
  });
  it("auto also sends when the server does not offer TLS", async () => {
    const peer = await smtpServer();
    await send({ ...base, SMTP_PORT: peer.port });
    expect(peer.result.messages).toBe(1);
    expect(peer.result.tlsConnections).toBe(0);
  });
  it.each(["required", "starttls"])("%s fails when STARTTLS is unavailable", async (mode) => {
    const peer = await smtpServer();
    await expect(send({ ...base, SMTP_PORT: peer.port, SMTP_TLS_MODE: mode })).rejects.toThrow();
    expect(peer.result.messages).toBe(0);
  });
  it("none sends despite broken TLS; auto does not silently downgrade", async () => {
    const peer = await smtpServer({ starttls: true, brokenTls: true });
    await expect(send({ ...base, SMTP_PORT: peer.port })).rejects.toThrow();
    await send({ ...base, SMTP_PORT: peer.port, SMTP_TLS_MODE: "none" });
    expect(peer.result.messages).toBe(1);
  });
  it("rejects an untrusted certificate by default; the opt-in accepts it", async () => {
    const peer = await smtpServer({ implicit: true });
    const env = { SMTP_HOST: base.SMTP_HOST, SMTP_PORT: peer.port, SMTP_TLS_MODE: "ssl" };
    await expect(send(env)).rejects.toThrow();
    await send({ ...env, SMTP_TLS_REJECT_UNAUTHORIZED: "false" });
    expect(peer.result.messages).toBe(1);
  });
  it("allows DHE-1024 only with the explicit cipher opt-in", async () => {
    const peer = await smtpServer({ starttls: true, weakDh: true });
    const env = { ...base, SMTP_PORT: peer.port, SMTP_TLS_MODE: "required" };
    await expect(send(env)).rejects.toThrow();
    await send({ ...env, SMTP_TLS_CIPHERS: "DEFAULT@SECLEVEL=0" });
    expect(peer.result.messages).toBe(1);
  });
  it("diagnoses STARTTLS, TLS, DH size and certificates, then verifies without sending", async () => {
    const peer = await smtpServer({ starttls: true, weakDh: true });
    const output: string[] = [];
    await checkSmtp({ ...base, SMTP_PORT: peer.port, SMTP_TLS_CIPHERS: "DEFAULT@SECLEVEL=0" }, (message) => output.push(message));
    const text = output.join("\n");
    expect(text).toContain("STARTTLS angeboten: ja");
    expect(text).toContain("TLSv1.2");
    expect(text).toContain('"size":1024');
    expect(text).toContain("Zertifikat notAfter:");
    expect(text).toContain("Ketten-/Hostnamenprüfung: OK");
    expect(text).toContain("transporter.verify(): OK");
    expect(peer.result.messages).toBe(0);
    expect(peer.result.commands).not.toContain("AUTH");
  });
  it("reports an expired certificate while final verify still enforces validation", async () => {
    const peer = await smtpServer({ starttls: true, expired: true });
    const output: string[] = [];
    await expect(checkSmtp({ ...base, SMTP_PORT: peer.port }, (message) => output.push(message))).rejects.toThrow();
    expect(output.join("\n")).toContain("CERT_HAS_EXPIRED");
    expect(peer.result.messages).toBe(0);
  });
});
