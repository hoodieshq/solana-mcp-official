import type { SupportedCluster } from "../constants";
import type { SecurityMetadataResult, SecurityTxtFields } from "../types";
import { fetchPmpSecurityMetadata } from "./pmp-security";
import { parseSecurityTxt } from "./security-txt-parser";
import { logger } from "../../observability/logger";

function joinIfArray(value: unknown): string | null {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "string") return value;
  return null;
}

function normalizePmpToSecurityTxtFields(raw: Record<string, unknown>): SecurityTxtFields | null {
  const name = typeof raw.name === "string" ? raw.name : null;
  const project_url = typeof raw.project_url === "string" ? raw.project_url : null;
  const contacts = joinIfArray(raw.contacts);
  const policy = typeof raw.policy === "string" ? raw.policy : null;

  if (!name || !project_url || !contacts || !policy) return null;

  return {
    name,
    project_url,
    contacts,
    policy,
    preferred_languages: joinIfArray(raw.preferred_languages),
    encryption: typeof raw.encryption === "string" ? raw.encryption : null,
    source_code: typeof raw.source_code === "string" ? raw.source_code : null,
    source_release: typeof raw.source_release === "string" ? raw.source_release : null,
    source_revision: typeof raw.source_revision === "string" ? raw.source_revision : null,
    auditors: joinIfArray(raw.auditors),
    acknowledgements: typeof raw.acknowledgements === "string" ? raw.acknowledgements : null,
    expiry: typeof raw.expiry === "string" ? raw.expiry : null,
    logo: typeof raw.logo === "string" ? raw.logo : null,
    description: typeof raw.description === "string" ? raw.description : null,
    notification: typeof raw.notification === "string" ? raw.notification : null,
    sdk: typeof raw.sdk === "string" ? raw.sdk : null,
    version: typeof raw.version === "string" ? raw.version : null,
  };
}

function isExpired(fields: SecurityTxtFields): boolean {
  if (fields.expiry === null) return false;
  const ts = Date.parse(fields.expiry);
  return !Number.isNaN(ts) && ts < Date.now();
}

async function tryPmpSource(programAddress: string, cluster: SupportedCluster): Promise<SecurityMetadataResult> {
  let content: string | null;
  try {
    content = await fetchPmpSecurityMetadata(programAddress, cluster);
  } catch (error) {
    logger.warn({ event: "security.pmp_fetch_failed", programAddress, error });
    return { status: "unknown", reason: "source_unavailable" };
  }

  if (content === null) return { status: "missing" };

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    logger.error({ event: "security.pmp_parse_failed", programAddress, error });
    return { status: "unknown", reason: "security_invalid" };
  }

  const fields = normalizePmpToSecurityTxtFields(raw);
  if (fields === null) return { status: "unknown", reason: "security_invalid" };
  return {
    status: "present",
    data: fields,
    source_type: "pmp_canonical",
    ...(isExpired(fields) ? { security_expired: true } : {}),
  };
}

function tryEmbeddedSource(rawBase64: string | null): SecurityMetadataResult {
  if (rawBase64 === null) return { status: "missing" };
  const result = parseSecurityTxt(rawBase64);
  if (result.ok)
    return {
      status: "present",
      data: result.fields,
      source_type: "embedded_security_txt",
      ...(isExpired(result.fields) ? { security_expired: true } : {}),
    };
  if (result.error === "invalid_content") return { status: "unknown", reason: "security_invalid" };
  return { status: "missing" };
}

export async function resolveProgramSecurityMetadata(
  programAddress: string,
  programDataRawBase64: string | null,
  cluster: SupportedCluster,
): Promise<SecurityMetadataResult> {
  const pmp = await tryPmpSource(programAddress, cluster);
  if (pmp.status === "present") return pmp;

  const embedded = tryEmbeddedSource(programDataRawBase64);
  if (embedded.status === "present") return embedded;

  if (pmp.status === "unknown") return pmp;
  if (embedded.status === "unknown") return embedded;
  return { status: "missing" };
}
