import { PlatformSettingsHeader } from "@/components/platform/platform-settings";

export default function PlatformSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-8">
      <PlatformSettingsHeader />
      {children}
    </section>
  );
}
