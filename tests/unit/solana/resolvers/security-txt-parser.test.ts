import { describe, expect, it } from "vitest";

import { parseSecurityTxt } from "../../../../lib/solana/resolvers/security-txt-parser";

function encodeSecurityTxt(data: Record<string, string>): string {
  const HEADER = "=======BEGIN SECURITY.TXT V1=======\0";
  const FOOTER = "=======END SECURITY.TXT V1=======\0";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    parts.push(k, v);
  }
  const content = parts.join("\0") + "\0";
  return Buffer.from(HEADER + content + FOOTER, "utf8").toString("base64");
}

const REQUIRED_FIELDS = {
  name: "Test Program",
  project_url: "https://example.com",
  contacts: "email:security@example.com",
  policy: "https://example.com/policy",
};

describe("parseSecurityTxt", () => {
  it("parses valid security.txt with all required fields", () => {
    const base64 = encodeSecurityTxt(REQUIRED_FIELDS);
    const result = parseSecurityTxt(base64);

    expect(result).toEqual({
      ok: true,
      fields: {
        name: "Test Program",
        project_url: "https://example.com",
        contacts: "email:security@example.com",
        policy: "https://example.com/policy",
        preferred_languages: null,
        encryption: null,
        source_code: null,
        source_release: null,
        source_revision: null,
        auditors: null,
        acknowledgements: null,
        expiry: null,
      },
    });
  });

  it("parses valid security.txt with all optional fields", () => {
    const base64 = encodeSecurityTxt({
      ...REQUIRED_FIELDS,
      preferred_languages: "en,de",
      encryption: "https://example.com/pgp-key",
      source_code: "https://github.com/example/test",
      source_release: "v1.0.0",
      source_revision: "abc123",
      auditors: "Audit Firm A",
      acknowledgements: "https://example.com/thanks",
      expiry: "2030-12-31",
    });
    const result = parseSecurityTxt(base64);

    expect(result).toEqual({
      ok: true,
      fields: {
        name: "Test Program",
        project_url: "https://example.com",
        contacts: "email:security@example.com",
        policy: "https://example.com/policy",
        preferred_languages: "en,de",
        encryption: "https://example.com/pgp-key",
        source_code: "https://github.com/example/test",
        source_release: "v1.0.0",
        source_revision: "abc123",
        auditors: "Audit Firm A",
        acknowledgements: "https://example.com/thanks",
        expiry: "2030-12-31",
      },
    });
  });

  it("returns no_markers when begin marker is absent", () => {
    const base64 = Buffer.from("just some program data").toString("base64");
    expect(parseSecurityTxt(base64)).toEqual({
      ok: false,
      error: "no_markers",
    });
  });

  it("returns no_markers when end marker is absent", () => {
    const partial = "=======BEGIN SECURITY.TXT V1=======\0name\0Test\0";
    const base64 = Buffer.from(partial, "utf8").toString("base64");
    expect(parseSecurityTxt(base64)).toEqual({
      ok: false,
      error: "no_markers",
    });
  });

  it("returns invalid_content when required field name is missing", () => {
    const base64 = encodeSecurityTxt({
      project_url: "https://example.com",
      contacts: "email:a@b.com",
      policy: "policy",
    });
    expect(parseSecurityTxt(base64)).toEqual({
      ok: false,
      error: "invalid_content",
    });
  });

  it("returns invalid_content when required field contacts is missing", () => {
    const base64 = encodeSecurityTxt({
      name: "Test",
      project_url: "https://example.com",
      policy: "policy",
    });
    expect(parseSecurityTxt(base64)).toEqual({
      ok: false,
      error: "invalid_content",
    });
  });

  it("returns no_markers for empty input string", () => {
    expect(parseSecurityTxt("")).toEqual({
      ok: false,
      error: "no_markers",
    });
  });

  it("ignores unknown keys and returns only valid fields", () => {
    const base64 = encodeSecurityTxt({
      ...REQUIRED_FIELDS,
      unknown_field: "should be ignored",
      another_unknown: "also ignored",
    });
    const result = parseSecurityTxt(base64);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.name).toBe("Test Program");
      expect("unknown_field" in result.fields).toBe(false);
      expect("another_unknown" in result.fields).toBe(false);
    }
  });

  it("preserves multi-line values like PGP keys", () => {
    const pgpKey = "-----BEGIN PGP PUBLIC KEY BLOCK-----\nxyz123\n-----END PGP PUBLIC KEY BLOCK-----";
    const base64 = encodeSecurityTxt({
      ...REQUIRED_FIELDS,
      encryption: pgpKey,
    });
    const result = parseSecurityTxt(base64);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.encryption).toBe(pgpKey);
    }
  });

  it("ignores dangling key without a value", () => {
    const HEADER = "=======BEGIN SECURITY.TXT V1=======\0";
    const FOOTER = "=======END SECURITY.TXT V1=======\0";
    const pairs = Object.entries(REQUIRED_FIELDS)
      .flatMap(([k, v]) => [k, v])
      .join("\0");
    const content = pairs + "\0dangling_key\0";
    const base64 = Buffer.from(HEADER + content + FOOTER, "utf8").toString("base64");

    const result = parseSecurityTxt(base64);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("dangling_key" in result.fields).toBe(false);
    }
  });

  it("returns empty strings as-is for optional fields", () => {
    const base64 = encodeSecurityTxt({
      ...REQUIRED_FIELDS,
      preferred_languages: "",
      auditors: "",
    });
    const result = parseSecurityTxt(base64);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.preferred_languages).toBe("");
      expect(result.fields.auditors).toBe("");
    }
  });
});
