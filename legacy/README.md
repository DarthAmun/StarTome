# legacy/

The v0.42 app (Nuxt), kept on the `rework` branch as the reference for the rework and so its
unit tests keep running (`pnpm test:legacy`). Nothing in `src/` may import from here. Each
rework phase moves what it ports into `src/` and deletes the rest of that feature from here;
at the cut-over this folder is gone. See REWORK_PLAN.md.
