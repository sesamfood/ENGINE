import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { ProfileSettings } from "@/components/profile/profile-settings";

export default function ProfilePage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-8">
      <AppPageHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <PageTitle>
            Profil
          </PageTitle>
        </div>
      </AppPageHeader>
      <ProfileSettings />
    </section>
  );
}
