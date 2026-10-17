import { decodeJwtClaims } from "./jwt";

function b64url(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function token(claims: object): string {
  return `${b64url(JSON.stringify({ alg: "EdDSA" }))}.${b64url(JSON.stringify(claims))}.sig`;
}

describe("decodeJwtClaims", () => {
  it("reads sub and exp from the payload", () => {
    expect(decodeJwtClaims(token({ sub: "usr_abc", exp: 1700000000, sid: "s1" }))).toEqual({ sub: "usr_abc", exp: 1700000000, sid: "s1" });
  });
  it("handles base64url characters and missing padding", () => {
    const claims = { sub: "user_??>>~~", n: "ÿþ" };
    expect(decodeJwtClaims(token(claims))?.["sub"]).toBe("user_??>>~~");
  });
  it("returns null for malformed tokens", () => {
    expect(decodeJwtClaims("")).toBeNull();
    expect(decodeJwtClaims("a.b")).toBeNull();
    expect(decodeJwtClaims("a.!!!.c")).toBeNull();
    expect(decodeJwtClaims(`x.${b64url("not json")}.y`)).toBeNull();
    expect(decodeJwtClaims(`x.${b64url("[1]")}.y`)).toBeNull();
  });
});
