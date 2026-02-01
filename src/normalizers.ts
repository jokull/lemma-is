/**
 * Token normalization functions for indexing non-word token types.
 *
 * Normalized forms preserve type indicators (like # for hashtags) so that
 * searches require the same syntax - searching "iceland" won't match "#iceland".
 */

import type { Token } from "tokenize-is";

/**
 * Normalize a token to indexable string values.
 *
 * @param token - Token from tokenize-is
 * @returns Array of normalized strings for indexing (may be empty)
 */
export function normalizeToken(token: Token): string[] {
  switch (token.kind) {
    case "telno":
      // Phone: preserve + prefix if country code present
      return [token.cc ? `+${token.cc}${token.number}` : token.number];

    case "email":
      // Email: lowercase (already type-distinct due to @ in middle)
      return [token.text.toLowerCase()];

    case "url":
      // URL: as-is (protocol makes it distinct)
      return [token.text];

    case "domain":
      // Domain: lowercase (TLD makes it recognizable)
      return [token.text.toLowerCase()];

    case "date":
    case "dateabs":
    case "daterel": {
      // Date: ISO format YYYY-MM-DD or MM-DD if no year
      const y = token.year || 0;
      const m = String(token.month).padStart(2, "0");
      const d = String(token.day).padStart(2, "0");
      return y > 0 ? [`${y}-${m}-${d}`] : [`${m}-${d}`];
    }

    case "time": {
      // Time: HH:MM or HH:MM:SS if seconds present
      const h = String(token.hour).padStart(2, "0");
      const m = String(token.minute).padStart(2, "0");
      if (token.second > 0) {
        return [`${h}:${m}:${String(token.second).padStart(2, "0")}`];
      }
      return [`${h}:${m}`];
    }

    case "timestamp":
    case "timestampabs":
    case "timestamprel": {
      // Timestamp: ISO format YYYY-MM-DDTHH:MM:SS
      const date = `${token.year}-${String(token.month).padStart(2, "0")}-${String(token.day).padStart(2, "0")}`;
      const time = `${String(token.hour).padStart(2, "0")}:${String(token.minute).padStart(2, "0")}:${String(token.second).padStart(2, "0")}`;
      return [`${date}T${time}`];
    }

    case "ssn":
      // SSN (kennitala): format with dash (DDMMYY-NNNN)
      return [`${token.value.slice(0, 6)}-${token.value.slice(6)}`];

    case "amount":
      // Amount: combined "value currency" for precise matching
      return [`${token.value} ${token.currency}`];

    case "measurement":
      // Measurement: combined "value unit" for precise matching
      return [`${token.value} ${token.unit}`];

    case "percent":
      // Percent: keep % suffix to distinguish from plain numbers
      return [`${token.value}%`];

    case "hashtag":
      // Hashtag: keep # prefix, lowercase value
      return [`#${token.text.slice(1).toLowerCase()}`];

    case "username":
      // Username: keep @ prefix, lowercase value
      return [`@${token.username.toLowerCase()}`];

    case "year":
      // Year: as string (4-digit format is recognizable)
      return [String(token.value)];

    case "number":
    case "ordinal":
      // Number/ordinal: as string (caller decides if to include)
      return [String(token.value)];

    default:
      return [];
  }
}
