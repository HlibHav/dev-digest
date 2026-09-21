# Repo conventions — HlibHav/dev-digest

Rules extracted from this repository and approved by a maintainer. Flag a
diff that breaks one of them, and cite the rule. These describe how THIS
repo is written; do not apply them to code outside it.

## api

- Return undefined for HTTP 204 No Content responses in API fetch wrapper. Evidence: `client/src/lib/api.ts:61`
- Normalize every API error into ApiError with status, code and details — edited during review. Evidence: `client/src/lib/api.ts:50`