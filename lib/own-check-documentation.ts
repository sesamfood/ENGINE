export function isDocumentationReportReady(input: {
  entriesExhausted: boolean;
  entriesTruncated: boolean;
  prepared: boolean;
  missingTruncated: boolean;
}) {
  return input.entriesExhausted && !input.entriesTruncated && input.prepared && !input.missingTruncated;
}
