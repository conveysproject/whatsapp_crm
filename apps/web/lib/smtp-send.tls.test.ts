// Real TLS handshakes against a local server with a self-signed certificate. The key pair and the
// certificate are generated at test time into a unique temp directory (deleted afterwards): no key
// material is stored in the repository. Nodemailer is called directly with the same TLS options
// sendViaSmtp uses, on an ephemeral port, and the real error goes through the exported mapper, so
// the SMTP port allow-list and the loopback guard stay untouched.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import nodemailer from "nodemailer";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mapSmtpError } from "./smtp-send";

function opensslAvailable(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_OPENSSL = opensslAvailable();

describe("real TLS prerequisites", () => {
  it("openssl is available when running in CI (so CI cannot silently skip the TLS tests)", () => {
    if (process.env["CI"]) expect(HAVE_OPENSSL, "openssl must be on PATH in CI").toBe(true);
    else if (!HAVE_OPENSSL) console.warn("openssl not found: real-TLS certificate tests are skipped locally");
  });
});

describe.skipIf(!HAVE_OPENSSL)("certificate errors from a real TLS server", () => {
  let dir = "";
  let KEY = "";
  let CERT = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "smtp-tls-test-"));
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const keyPath = join(dir, "k.pem");
    const certPath = join(dir, "c.pem");
    writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
    execFileSync("openssl", ["req", "-x509", "-new", "-key", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost"], {
      stdio: "ignore",
    });
    KEY = readFileSync(keyPath, "utf8");
    CERT = readFileSync(certPath, "utf8");
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  const listen = (server: net.Server) =>
    new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
    });

  // Same TLS options as sendViaSmtp, pointed at the local server.
  const attempt = async (port: number, mode: "ssl" | "starttls") => {
    const transport = nodemailer.createTransport({
      host: "127.0.0.1",
      port,
      secure: mode === "ssl",
      ...(mode === "starttls" ? { requireTLS: true } : {}),
      tls: { servername: "smtp.example.com", rejectUnauthorized: true, minVersion: "TLSv1.2" },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      auth: { user: "mailer@example.com", pass: "test-pass-123" },
      logger: false,
      debug: false,
    });
    try {
      await transport.sendMail({ from: "noreply@example.com", to: "rcpt@example.org", subject: "x", html: "<p>x</p>" });
      return null;
    } catch (err) {
      return mapSmtpError(err);
    } finally {
      transport.close();
    }
  };

  it("implicit TLS (ssl) with a self-signed certificate => certificate not trusted, not retryable", async () => {
    const server = tls.createServer({ key: KEY, cert: CERT }, (s) => {
      s.on("error", () => {});
      s.write("220 stub ESMTP\r\n");
    });
    server.on("tlsClientError", () => {});
    const port = await listen(server);
    close = () => new Promise((r) => server.close(() => r()));
    expect(await attempt(port, "ssl")).toEqual({ ok: false, retryable: false, reason: "certificate not trusted" });
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
    const port = await listen(server);
    close = () => new Promise((r) => server.close(() => r()));
    expect(await attempt(port, "starttls")).toEqual({ ok: false, retryable: false, reason: "certificate not trusted" });
  });
});
