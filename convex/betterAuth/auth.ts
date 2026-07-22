import type { GenericCtx } from "@convex-dev/better-auth";
import { createAuth } from "../auth";
import type { DataModel } from "../_generated/dataModel";

export const auth = createAuth({} as GenericCtx<DataModel>);
