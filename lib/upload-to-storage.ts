import type { Id } from "@/convex/_generated/dataModel";

export async function uploadToStorage({
  uploadUrl,
  file,
}: {
  uploadUrl: string;
  file: Blob;
}): Promise<Id<"_storage">> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error("Filen kunne ikke uploades");
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("storageId" in result) ||
    typeof result.storageId !== "string" ||
    !result.storageId
  ) {
    throw new Error("Uploaden returnerede et ugyldigt svar");
  }
  return result.storageId as Id<"_storage">;
}
