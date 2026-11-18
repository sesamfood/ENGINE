export const MAX_EMBEDDED_ATTACHMENTS = 50;
export const MAX_EMBEDDED_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function isDocumentationReportReady(input: {
  entriesExhausted: boolean;
  entriesTruncated: boolean;
  prepared: boolean;
  missingTruncated: boolean;
}) {
  return input.entriesExhausted && !input.entriesTruncated && input.prepared && !input.missingTruncated;
}
