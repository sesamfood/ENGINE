import { AppPageHeader } from "@/components/app-page-header";
import { ProfileSettings } from "@/components/profile/profile-settings";

export default function ProfilePage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-8">
      <AppPageHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Profil
          </h1>
        </div>
      </AppPageHeader>
      <ProfileSettings />
    </section>
  );
}
