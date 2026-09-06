The Better Auth adapter patch fixes client type inference with security-patched Better Auth releases. It changes type declarations only and addresses [upstream issue #420](https://github.com/get-convex/better-auth/issues/420).

`bun install` applies the patch. Reassess it when upgrading `@convex-dev/better-auth`; remove it when the unpatched adapter accepts the application client and TypeScript passes.
