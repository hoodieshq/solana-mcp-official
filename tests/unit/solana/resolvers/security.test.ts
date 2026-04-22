import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveProgramSecurityMetadata } from "../../../../lib/solana/resolvers/security";

vi.mock("../../../../lib/solana/resolvers/pmp-security", () => ({
  fetchPmpSecurityMetadata: vi.fn().mockResolvedValue(null),
}));

import { fetchPmpSecurityMetadata } from "../../../../lib/solana/resolvers/pmp-security";

const PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

const EMBEDDED_FIELDS = {
  name: "Test Program",
  project_url: "https://example.com",
  contacts: "email:security@example.com",
  policy: "https://example.com/policy",
};

const EMBEDDED_BASE64 = encodeSecurityTxt(EMBEDDED_FIELDS);

function makePmpJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: "PMP Program",
    project_url: "https://pmp.example.com",
    contacts: ["email:pmp@example.com", "discord:prog#1234"],
    policy: "https://pmp.example.com/policy",
    preferred_languages: ["en", "de"],
    logo: "https://pmp.example.com/logo.png",
    description: "A PMP program",
    notification: "Update your SDK!",
    sdk: "https://github.com/example/sdk",
    version: "1.0.0",
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveProgramSecurityMetadata", () => {
  it("returns present from PMP with normalization and PMP-only fields", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(makePmpJson());

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "pmp_canonical",
    });
    if (result.status === "present") {
      expect(result.data.contacts).toBe("email:pmp@example.com,discord:prog#1234");
      expect(result.data.preferred_languages).toBe("en,de");
      expect(result.data.logo).toBe("https://pmp.example.com/logo.png");
      expect(result.data.description).toBe("A PMP program");
      expect(result.data.version).toBe("1.0.0");
    }
  });

  it("falls back to embedded when PMP returns null (MISS)", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "embedded_security_txt",
    });
    if (result.status === "present") {
      expect(result.data.name).toBe("Test Program");
    }
  });

  it("returns missing when both PMP and embedded return MISS", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);

    const result = await resolveProgramSecurityMetadata(
      PROGRAM_ADDRESS,
      Buffer.from("no markers here").toString("base64"),
      "mainnet-beta",
    );

    expect(result).toEqual({ status: "missing" });
  });

  it("falls back to embedded when PMP throws (UNAVAILABLE)", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockRejectedValue(new Error("network error"));

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "embedded_security_txt",
    });
  });

  it("returns unknown with source_unavailable when PMP throws and embedded MISS", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockRejectedValue(new Error("network error"));

    const result = await resolveProgramSecurityMetadata(
      PROGRAM_ADDRESS,
      Buffer.from("no markers here").toString("base64"),
      "mainnet-beta",
    );

    expect(result).toEqual({
      status: "unknown",
      reason: "source_unavailable",
    });
  });

  it("falls back to embedded when PMP returns invalid JSON (INVALID)", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue("not valid json {{");

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "embedded_security_txt",
    });
  });

  it("returns unknown with security_invalid when PMP INVALID and embedded MISS", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue("not valid json {{");

    const result = await resolveProgramSecurityMetadata(
      PROGRAM_ADDRESS,
      Buffer.from("no markers here").toString("base64"),
      "mainnet-beta",
    );

    expect(result).toEqual({
      status: "unknown",
      reason: "security_invalid",
    });
  });

  it("PMP HIT wins over embedded HIT (priority)", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(makePmpJson());

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "pmp_canonical",
    });
    if (result.status === "present") {
      expect(result.data.name).toBe("PMP Program");
    }
  });

  it("returns missing when programDataRawBase64 is null and PMP MISS", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, null, "mainnet-beta");

    expect(result).toEqual({ status: "missing" });
  });

  it("returns present with security_expired for past expiry date", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);
    const base64 = encodeSecurityTxt({
      ...EMBEDDED_FIELDS,
      expiry: "2020-01-01",
    });

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, base64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      security_expired: true,
    });
  });

  it("returns present without security_expired for future expiry", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);
    const base64 = encodeSecurityTxt({
      ...EMBEDDED_FIELDS,
      expiry: "2099-12-31",
    });

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, base64, "mainnet-beta");

    expect(result.status).toBe("present");
    if (result.status === "present") {
      expect(result.security_expired).toBeUndefined();
    }
  });

  it("returns present without security_expired when no expiry field", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(null);

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result.status).toBe("present");
    if (result.status === "present") {
      expect(result.security_expired).toBeUndefined();
    }
  });

  it("continues to embedded when PMP JSON is missing required fields", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(JSON.stringify({ name: "Incomplete" }));

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, EMBEDDED_BASE64, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "embedded_security_txt",
    });
  });

  it("normalizes PMP fields with non-string optional values to null", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(
      makePmpJson({
        encryption: 42 as unknown as string,
        source_code: null as unknown as string,
        logo: 123 as unknown as string,
        description: undefined as unknown as string,
        notification: false as unknown as string,
        sdk: [] as unknown as string,
        version: {} as unknown as string,
        auditors: "Single Auditor",
      }),
    );

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, null, "mainnet-beta");

    expect(result.status).toBe("present");
    if (result.status === "present") {
      expect(result.data.encryption).toBeNull();
      expect(result.data.source_code).toBeNull();
      expect(result.data.logo).toBeNull();
      expect(result.data.description).toBeNull();
      expect(result.data.notification).toBeNull();
      expect(result.data.sdk).toBeNull();
      expect(result.data.version).toBeNull();
      expect(result.data.auditors).toBe("Single Auditor");
    }
  });

  it("sets security_expired on PMP result when expiry is past", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue(makePmpJson({ expiry: "2020-01-01" }));

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, null, "mainnet-beta");

    expect(result).toMatchObject({
      status: "present",
      source_type: "pmp_canonical",
      security_expired: true,
    });
  });

  it("returns unknown with security_invalid when PMP returns non-JSON content", async () => {
    vi.mocked(fetchPmpSecurityMetadata).mockResolvedValue("plain text content");

    const result = await resolveProgramSecurityMetadata(PROGRAM_ADDRESS, null, "mainnet-beta");

    expect(result).toEqual({
      status: "unknown",
      reason: "security_invalid",
    });
  });
});
