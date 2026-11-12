// Increment the revision when transport or verdict acceptance rules change.
// This is the application's scan policy, not the ClamAV signature database.
export const FILE_SCAN_POLICY = Object.freeze({
  version: 'clamav-instream-v1',
  maxChunkBytes: 1024 * 1024,
  cleanResponse: 'stream: OK',
  infectedResponse: /^stream: .+ FOUND$/,
})
