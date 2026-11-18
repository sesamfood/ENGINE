// Old function address kept for clients deployed before the food safety rename. Remove in the cleanup release.
export {
  listDocumentationHistory,
  buildDocumentation,
  prepareDocumentation,
  getDocumentationDateContext,
  listMissingFoodSafety as listMissingOwnChecks,
} from "./foodSafetyDocumentation";
