import { REQUIRED_PERMISSIONS_POLICY_FEATURES } from "../pharosville/check-security-headers.mjs";

/**
 * Chrome's own parse warnings for Permissions-Policy features it no longer recognises. public/_headers denies them on
 * purpose (the deny-list is a contract checked by scripts/pharosville/check-security-headers.mjs), so they are browser
 * notices about the header, not application output: captures report them separately and gates do not count them.
 * Only features of that contract qualify; any other console warning stays an error for every gate.
 */
const NOTICE = /^Error with Permissions-Policy header: Unrecognized feature: '([a-z-]+)'\.$/;
export function isBrowserNotice(text) {
  const feature = NOTICE.exec(text)?.[1];
  return feature != null && REQUIRED_PERMISSIONS_POLICY_FEATURES.includes(feature);
}
