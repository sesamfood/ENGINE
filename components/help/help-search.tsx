"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type HelpSearchDocument = {
  href: string;
  feature: string;
  label: string;
  summary: string;
  sections: { id: string; title: string; text: string }[];
};

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("da")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o");
}

export function HelpSearch({ documents }: { documents: HelpSearchDocument[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const normalizedQuery = normalizeSearch(query).trim();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  const indexed = useMemo(
    () =>
      documents.map((document) => ({
        ...document,
        titleText: normalizeSearch(`${document.feature} ${document.label}`),
        searchText: normalizeSearch(
          [
            document.feature,
            document.label,
            document.summary,
            ...document.sections.map(
              (section) => `${section.title} ${section.text}`,
            ),
          ].join(" "),
        ),
      })),
    [documents],
  );
  const matches = indexed
    .filter((document) =>
      words.every((word) => document.searchText.includes(word)),
    )
    .map((document) => {
      const titleMatch = words.every((word) =>
        document.titleText.includes(word),
      );
      const section =
        words.length && !titleMatch
          ? document.sections.find((item) =>
              words.every((word) =>
                normalizeSearch(
                  `${document.feature} ${item.title} ${item.text}`,
                ).includes(word),
              ),
            )
          : undefined;
      return { ...document, section, score: titleMatch ? 2 : section ? 1 : 0 };
    })
    .sort((a, b) => b.score - a.score);
  const results = normalizedQuery
    ? matches
    : indexed
        .filter((document) => document.label === "Overblik")
        .map((document) => ({ ...document, section: undefined, score: 0 }));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (document.querySelector('[role="dialog"]') && !open) return;
        event.preventDefault();
        setOpen(!open);
        if (open) setQuery("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 w-full justify-start gap-3"
          />
        }
        aria-label="Søg i hjælpen"
      >
        <SearchIcon aria-hidden="true" />
        <span className="hidden sm:inline">Søg i hjælpen…</span>
        <span className="sm:hidden">Søg</span>
        <kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-xs text-muted-foreground md:block">
          Ctrl / ⌘ K
        </kbd>
      </DialogTrigger>
      <DialogContent
        className="gap-0 overflow-hidden p-2 sm:max-w-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:size-11"
        initialFocus={inputRef}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Søg i hjælpen</DialogTitle>
          <DialogDescription>
            Find funktioner, opsætning og svar på spørgsmål.
          </DialogDescription>
        </DialogHeader>
        <Command
          label="Søgeord"
          shouldFilter={false}
          loop
          className="[&_[data-slot=command-input-wrapper]]:pr-12 [&_[data-slot=input-group]]:h-12"
        >
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Søg i hjælpen…"
            aria-label="Søgeord"
            className="min-h-11"
          />
          <CommandList label="Søgeresultater" className="max-h-[min(55dvh,24rem)]">
            <CommandEmpty>
              Ingen resultater. Prøv et andet søgeord.
            </CommandEmpty>
            <CommandGroup
              heading={normalizedQuery ? "Søgeresultater" : "Emner"}
            >
              {results.map((result) => (
                <CommandItem
                  key={result.href}
                  value={result.href}
                  onSelect={() => {
                    setOpen(false);
                    setQuery("");
                    router.push(
                      result.href +
                        (result.section ? `#${result.section.id}` : ""),
                    );
                  }}
                  className="min-h-11 cursor-pointer gap-3 py-2 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <FileTextIcon aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">
                      {result.label === "Overblik"
                        ? result.feature
                        : result.label}
                    </span>
                    {result.label !== "Overblik" && (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.feature}
                        {result.section ? ` › ${result.section.title}` : ""}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between gap-3 border-t px-2 py-2 text-xs text-muted-foreground">
            <p role="status">
              {normalizedQuery
                ? `${results.length} ${results.length === 1 ? "side fundet" : "sider fundet"}`
                : "Søg i alle guider"}
            </p>
            <span className="hidden items-center gap-3 sm:flex" aria-hidden="true">
              <span><kbd>↑↓</kbd> Vælg</span>
              <span><kbd>Enter</kbd> Åbn</span>
              <span><kbd>Esc</kbd> Luk</span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
