export default function ProfilePage() {
  return (
    <section className="mx-auto w-full max-w-[96rem]">
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Konto
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Profil
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Administrer dine personlige oplysninger og kontoindstillinger her.
        </p>
      </div>
    </section>
  );
}
