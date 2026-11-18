import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SprayCanIcon } from "lucide-react";

type Tool = { id: string; name: string; imageUrl: string | null };

// The picture or video and the cleaning products shown with a kontrol's instructions.
export function InstructionMedia({ name, imageUrl, videoUrl, tools }: { name: string; imageUrl: string | null; videoUrl: string | null; tools: Tool[] }) {
  return (
    <>
      {imageUrl ? (
        <div className="relative h-64 w-full">
          <Image
            src={imageUrl}
            alt={`Billede af ${name}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 50vw"
            className="rounded-lg object-contain"
          />
        </div>
      ) : null}
      {videoUrl ? (
        <video src={videoUrl} controls playsInline preload="metadata" aria-label={`Video af ${name}`} className="max-h-96 w-full rounded-lg bg-black" />
      ) : null}
      {tools.length ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Rengøringsprodukter</h4>
          <ul className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <li key={tool.id} className="flex min-h-11 items-center gap-2 rounded-md border py-1 pr-3 pl-1 text-sm">
                <Avatar appearance="rounded">
                  {tool.imageUrl ? <AvatarImage src={tool.imageUrl} alt="" appearance="rounded" /> : null}
                  <AvatarFallback appearance="rounded"><SprayCanIcon /></AvatarFallback>
                </Avatar>
                {tool.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
