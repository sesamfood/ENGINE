import { ProfileSettings } from "@/components/profile/profile-settings";

export default function ProfilePage() {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Profil
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Administrér dine personlige oplysninger her.
        </p>
      </div>
      <ProfileSettings />
    </section>
  );
}
