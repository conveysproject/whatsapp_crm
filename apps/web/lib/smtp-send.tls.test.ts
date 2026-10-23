// Real TLS handshakes against a local server with a self-signed certificate (test-only fixture in
// __fixtures__). Nothing is mocked except the host resolver, which is replaced by a pass-through
// to 127.0.0.1 because the real guard blocks loopback by design.
import { readFileSync } from "node:fs";
import net from "node:net";
import tls from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { sendViaSmtp, type SmtpSettings } from "./smtp-send";

const KEY = readFileSync(new URL("./__fixtures__/test-only-selfsigned.key.pem", import.meta.url), "utf8");
const CERT = readFileSync(new URL("./__fixtures__/test-only-selfsigned.cert.pem", import.meta.url), "utf8");

const PORT = 2525; // one of the fixed allowed ports
const smtp: SmtpSettings = {
  host: "smtp.example.com",
  port: PORT,
  security: "ssl",
  user: "mailer@example.com",
  pass: "test-pass-123",
  fromAddress: "noreply@example.com",
};
const message = { to: "rcpt@example.org", subject: "Hello", html: "<p>hi</p>" };
const loopback = { resolveHost: async () => ({ ok: true as const, address: "127.0.0.1", family: 4 as const }) };

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const listen = (server: net.Server) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });

describe("certificate errors from a real TLS server", () => {
  it("implicit TLS (ssl) with a self-signed certificate => certificate not trusted, not retryable", async () => {
    const server = tls.createServer({ key: KEY, cert: CERT }, (s) => {
      s.on("error", () => {});
      s.write("220 stub ESMTP\r\n");
    });
    server.on("tlsClientError", () => {});
    await listen(server);
    close = () => new Promise((r) => server.close(() => r()));
    expect(await sendViaSmtp({ ...smtp, security: "ssl" }, message, loopback)).toEqual({
      ok: false,
      retryable: false,
      reason: "certificate not trusted",
    });
  });

  it("STARTTLS with a self-signed certificate => certificate not trusted, not retryable", async () => {
    const secureContext = tls.createSecureContext({ key: KEY, cert: CERT });
    const server = net.createServer((socket) => {
      socket.on("error", () => {});
      socket.write("220 stub ESMTP\r\n");
      socket.on("data", function onData(buf: Buffer) {
        const line = buf.toString("utf8").toUpperCase();
        if (line.startsWith("EHLO")) {
          socket.write("250-stub\r\n250 STARTTLS\r\n");
        } else if (line.startsWith("STARTTLS")) {
          socket.off("data", onData);
          socket.write("220 Ready to start TLS\r\n", () => {
            const secure = new tls.TLSSocket(socket, { isServer: true, secureContext });
            secure.on("error", () => {});
          });
        }
      });
    });
    await listen(server);
    close = () => new Promise((r) => server.close(() => r()));
    expect(await sendViaSmtp({ ...smtp, security: "starttls" }, message, loopback)).toEqual({
      ok: false,
      retryable: false,
      reason: "certificate not trusted",
    });
  });
});
