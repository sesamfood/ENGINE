import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireLocationAccess,
  requireStaffFoodManager,
  requireStaffFoodRegistrar,
  isMultiLocationFilter,
  isSingleLocationFilter,
  resolveLocationFilter,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { addStock, normalizeStock } from "./lib/stock";
import { resolveTimeZone } from "./lib/timeZone";
import { recordAudit, requireAuditReason } from "./lib/audit";
import { MAX_CATEGORIES_PER_ORGANIZATION } from "./lib/categoryHierarchy";
import {
  dashboardSummaryTimeZone,
  reconcileDashboardSummaryContributions,
  staffFoodSummaryContribution,
} from "./lib/dashboardSummaries";
import { getProductCategoryIds } from "./lib/productCategories";

const MAX_TIERS = 10;
const MAX_ALLOWANCES = 20;
const MAX_PRODUCTS_PER_TIER = 100;
const MAX_PICKER_SHIFTS = 500;
const MAX_SESSION_REGISTRATIONS = 500;
const MAX_BASKET_ITEMS = 50;
const MAX_SEARCH_RESULTS = 20;
const MAX_SETTINGS_PRODUCTS = 500;
const SHIFT_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const UNDO_WINDOW_MS = 30_000;
const UNDO_REASON_GRACE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function categoryIncludes(
  categories: ReadonlyMap<
    Id<"categories">,
    Pick<Doc<"categories">, "_id" | "parentCategoryId">
  >,
  rootCategoryId: Id<"categories">,
  categoryId: Id<"categories">,
) {
  const visited = new Set<Id<"categories">>();
  let currentId: Id<"categories"> | undefined = categoryId;
  while (currentId) {
    if (currentId === rootCategoryId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    currentId = categories.get(currentId)?.parentCategoryId;
  }
  return false;
}

async function productCategoryInTree(
  ctx: QueryCtx | MutationCtx,
  product: Pick<
    Doc<"products">,
    "_id" | "organizationId" | "categoryId"
  >,
  categories: ReadonlyMap<
    Id<"categories">,
    Pick<Doc<"categories">, "_id" | "parentCategoryId">
  >,
  rootCategoryId: Id<"categories">,
) {
  const categoryIds = await getProductCategoryIds(ctx, product);
  return (
    categoryIds.find((categoryId) =>
      categoryIncludes(categories, rootCategoryId, categoryId),
    ) ?? null
  );
}

const sessionSourceValidator = v.union(
  v.literal("scheduled"),
  v.literal("manual"),
);

const registrationStatusValidator = v.union(
  v.literal("active"),
  v.literal("voided"),
);

const allowanceInputValidator = v.object({
  categoryId: v.id("categories"),
  amount: v.number(),
  productIds: v.array(v.id("products")),
});

const pickerShiftValidator = v.object({
  shiftId: v.id("scheduledShifts"),
  employeeId: v.id("employees"),
  displayName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  startsAt: v.number(),
  endsAt: v.number(),
  durationMinutes: v.number(),
  roleName: v.union(v.string(), v.null()),
});

const registrationRowValidator = v.object({
  id: v.id("staffFoodRegistrations"),
  checkoutId: v.string(),
  registeredAt: v.number(),
  locationId: v.id("locations"),
  locationName: v.string(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  sessionSource: sessionSourceValidator,
  workDate: v.string(),
  shiftDurationMinutes: v.number(),
  tierMinimumShiftMinutes: v.number(),
  categoryAllowance: v.number(),
  categoryId: v.id("categories"),
  categoryName: v.string(),
  productId: v.id("products"),
  productName: v.string(),
  quantity: v.number(),
  defaultUnitName: v.string(),
  status: registrationStatusValidator,
  registeredByName: v.string(),
  voidedAt: v.union(v.number(), v.null()),
});

type StaffFoodContext = QueryCtx | MutationCtx;

async function requireLocation(
  ctx: StaffFoodContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return location;
}

function dateInTimeZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function requireNow(now: number) {
  if (!Number.isFinite(now) || now <= 0) {
    throw new ConvexError("Tidspunktet er ugyldigt");
  }
}

function requireDuration(durationMinutes: number) {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 30 ||
    durationMinutes > 24 * 60 ||
    durationMinutes % 30 !== 0
  ) {
    throw new ConvexError(
      "Vagtlængden skal være mellem 30 minutter og 24 timer i halve timer",
    );
  }
}

async function matchingTier(
  ctx: StaffFoodContext,
  organizationId: string,
  durationMinutes: number,
) {
  return await ctx.db
    .query("staffFoodRuleTiers")
    .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
      q
        .eq("organizationId", organizationId)
        .lte("minimumShiftMinutes", durationMinutes),
    )
    .order("desc")
    .first();
}

async function activeShiftsForEmployee(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
  employeeId: Id<"employees">,
  now: number,
) {
  const shifts = await ctx.db
    .query("scheduledShifts")
    .withIndex("by_organizationId_and_employeeId_and_startsAt", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("employeeId", employeeId)
        .gte("startsAt", now - SHIFT_LOOKBACK_MS)
        .lte("startsAt", now),
    )
    .order("desc")
    .take(20);
  return shifts.filter(
    (shift) => shift.locationId === locationId && shift.endsAt > now,
  );
}

async function requireSession(
  ctx: StaffFoodContext,
  organizationId: string,
  sessionId: Id<"staffFoodSessions">,
) {
  const session = await ctx.db.get("staffFoodSessions", sessionId);
  if (!session || session.organizationId !== organizationId) {
    throw new ConvexError("Staff food-sessionen blev ikke fundet");
  }
  return session;
}

async function sessionActive(
  ctx: StaffFoodContext,
  organizationId: string,
  session: Doc<"staffFoodSessions">,
  now: number,
) {
  if (session.source === "manual") {
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      session.locationId,
    );
    return session.workDate === dateInTimeZone(now, timeZone);
  }
  if (!session.scheduledShiftId) return false;
  const shift = await ctx.db.get("scheduledShifts", session.scheduledShiftId);
  return Boolean(
    shift &&
    shift.organizationId === organizationId &&
    shift.locationId === session.locationId &&
    shift.employeeId === session.employeeId &&
    shift.startsAt <= now &&
    shift.endsAt > now,
  );
}

function registrationRow(row: Doc<"staffFoodRegistrations">) {
  return {
    id: row._id,
    checkoutId: row.checkoutId,
    registeredAt: row.registeredAt,
    locationId: row.locationId,
    locationName: row.locationName,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    sessionSource: row.sessionSource,
    workDate: row.workDate,
    shiftDurationMinutes: row.shiftDurationMinutes,
    tierMinimumShiftMinutes: row.tierMinimumShiftMinutes,
    categoryAllowance: row.categoryAllowance,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    defaultUnitName: row.defaultUnitName,
    status: row.status,
    registeredByName: row.registeredByName,
    voidedAt: row.voidedAt ?? null,
  };
}

export const getPicker = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({
    hasRules: v.boolean(),
    shifts: v.array(pickerShiftValidator),
    limitReached: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    requireNow(args.now);
    await requireLocation(ctx, organizationId, args.locationId);
    const [rows, tier] = await Promise.all([
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId)
            .gte("startsAt", args.now - SHIFT_LOOKBACK_MS)
            .lte("startsAt", args.now),
        )
        .order("desc")
        .take(MAX_PICKER_SHIFTS + 1),
      ctx.db
        .query("staffFoodRuleTiers")
        .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
          q.eq("organizationId", organizationId),
        )
        .first(),
    ]);
    const active = rows
      .slice(0, MAX_PICKER_SHIFTS)
      .filter((shift) => shift.endsAt > args.now);
    const employeeIds = [...new Set(active.map((shift) => shift.employeeId))];
    const employees = await Promise.all(
      employeeIds.map((employeeId) => ctx.db.get("employees", employeeId)),
    );
    const employeesById = new Map(
      employees.flatMap((employee) =>
        employee ? [[employee._id, employee] as const] : [],
      ),
    );
    return {
      hasRules: Boolean(tier),
      shifts: active.flatMap((shift) => {
        const employee = employeesById.get(shift.employeeId);
        return employee?.organizationId === organizationId && employee.active
          ? [
              {
                shiftId: shift._id,
                employeeId: employee._id,
                displayName: employee.displayName,
                imageUrl: employee.imageUrl,
                startsAt: shift.startsAt,
                endsAt: shift.endsAt,
                durationMinutes: Math.floor(
                  (shift.endsAt - shift.startsAt) / 60_000,
                ),
                roleName: shift.roleName,
              },
            ]
          : [];
      }),
      limitReached: rows.length > MAX_PICKER_SHIFTS,
    };
  },
});

export const searchEmployees = query({
  args: {
    locationId: v.id("locations"),
    search: v.string(),
    now: v.number(),
  },
  returns: v.array(
    v.object({
      employeeId: v.id("employees"),
      displayName: v.string(),
      imageUrl: v.union(v.string(), v.null()),
      activeShifts: v.array(pickerShiftValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    requireNow(args.now);
    await requireLocation(ctx, organizationId, args.locationId);
    const search = args.search.trim().slice(0, 100);
    if (!search) return [];
    const employees = await ctx.db
      .query("employees")
      .withSearchIndex("search_displayName", (q) =>
        q
          .search("displayName", search)
          .eq("organizationId", organizationId)
          .eq("active", true),
      )
      .take(MAX_SEARCH_RESULTS);
    return await Promise.all(
      employees.map(async (employee) => {
        const shifts = await activeShiftsForEmployee(
          ctx,
          organizationId,
          args.locationId,
          employee._id,
          args.now,
        );
        return {
          employeeId: employee._id,
          displayName: employee.displayName,
          imageUrl: employee.imageUrl,
          activeShifts: shifts.map((shift) => ({
            shiftId: shift._id,
            employeeId: employee._id,
            displayName: employee.displayName,
            imageUrl: employee.imageUrl,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            durationMinutes: Math.floor(
              (shift.endsAt - shift.startsAt) / 60_000,
            ),
            roleName: shift.roleName,
          })),
        };
      }),
    );
  },
});

export const startSession = mutation({
  args: {
    selection: v.union(
      v.object({
        kind: v.literal("scheduled"),
        locationId: v.id("locations"),
        shiftId: v.id("scheduledShifts"),
      }),
      v.object({
        kind: v.literal("manual"),
        locationId: v.id("locations"),
        employeeId: v.id("employees"),
        durationMinutes: v.number(),
      }),
    ),
  },
  returns: v.id("staffFoodSessions"),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.selection.locationId);
    const now = Date.now();
    const location = await requireLocation(
      ctx,
      organizationId,
      args.selection.locationId,
    );
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      args.selection.locationId,
    );
    if (args.selection.kind === "scheduled") {
      const shift = await ctx.db.get("scheduledShifts", args.selection.shiftId);
      if (
        !shift ||
        shift.organizationId !== organizationId ||
        shift.locationId !== location._id ||
        shift.startsAt > now ||
        shift.endsAt <= now
      ) {
        throw new ConvexError("Vagten er ikke aktiv længere");
      }
      const employee = await ctx.db.get("employees", shift.employeeId);
      if (
        !employee ||
        employee.organizationId !== organizationId ||
        !employee.active
      ) {
        throw new ConvexError("Medarbejderen blev ikke fundet");
      }
      const workDate = dateInTimeZone(shift.startsAt, timeZone);
      const sameDayShifts = await ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_employeeId_and_startsAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("employeeId", shift.employeeId)
            .gte("startsAt", shift.startsAt - 2 * DAY_MS)
            .lte("startsAt", shift.startsAt + 2 * DAY_MS),
        )
        .collect();
      const durationMinutes = sameDayShifts
        .filter(
          (scheduledShift) =>
            dateInTimeZone(scheduledShift.startsAt, timeZone) === workDate,
        )
        .reduce(
          (total, scheduledShift) =>
            total +
            Math.floor(
              (scheduledShift.endsAt - scheduledShift.startsAt) / 60_000,
            ),
          0,
        );
      const existing = await ctx.db
        .query("staffFoodSessions")
        .withIndex("by_organizationId_and_scheduledShiftId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("scheduledShiftId", shift._id),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          locationId: shift.locationId,
          employeeId: shift.employeeId,
          workDate,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          durationMinutes,
        });
        return existing._id;
      }
      return await ctx.db.insert("staffFoodSessions", {
        organizationId,
        locationId: shift.locationId,
        employeeId: shift.employeeId,
        source: "scheduled",
        scheduledShiftId: shift._id,
        workDate,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        durationMinutes,
        createdAt: now,
        createdBy: userIdentifier,
      });
    }

    requireDuration(args.selection.durationMinutes);
    const employee = await ctx.db.get("employees", args.selection.employeeId);
    if (
      !employee ||
      employee.organizationId !== organizationId ||
      !employee.active
    ) {
      throw new ConvexError("Medarbejderen blev ikke fundet");
    }
    const workDate = dateInTimeZone(now, timeZone);
    const existing = await ctx.db
      .query("staffFoodSessions")
      .withIndex("by_org_location_employee_date_source", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id)
          .eq("employeeId", employee._id)
          .eq("workDate", workDate)
          .eq("source", "manual"),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("staffFoodSessions", {
      organizationId,
      locationId: location._id,
      employeeId: employee._id,
      source: "manual",
      workDate,
      durationMinutes: args.selection.durationMinutes,
      createdAt: now,
      createdBy: userIdentifier,
    });
  },
});

export const getSessionState = query({
  args: { sessionId: v.id("staffFoodSessions"), now: v.number() },
  returns: v.object({
    session: v.object({
      id: v.id("staffFoodSessions"),
      employeeId: v.id("employees"),
      employeeName: v.string(),
      employeeImageUrl: v.union(v.string(), v.null()),
      locationId: v.id("locations"),
      locationName: v.string(),
      source: sessionSourceValidator,
      workDate: v.string(),
      startsAt: v.union(v.number(), v.null()),
      endsAt: v.union(v.number(), v.null()),
      durationMinutes: v.number(),
      active: v.boolean(),
    }),
    tierMinimumShiftMinutes: v.union(v.number(), v.null()),
    allowances: v.array(
      v.object({
        categoryId: v.id("categories"),
        categoryName: v.string(),
        amount: v.number(),
        used: v.number(),
        remaining: v.number(),
      }),
    ),
    products: v.array(
      v.object({
        id: v.id("products"),
        name: v.string(),
        categoryId: v.id("categories"),
        allowanceCategoryId: v.id("categories"),
        categoryName: v.string(),
        imageUrl: v.union(v.string(), v.null()),
        defaultUnitName: v.string(),
      }),
    ),
    registrations: v.array(registrationRowValidator),
    limitReached: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const { organizationId } = auth;
    requireNow(args.now);
    const session = await requireSession(ctx, organizationId, args.sessionId);
    requireLocationAccess(auth, session.locationId);
    const [employee, location, tier, rows, active] = await Promise.all([
      ctx.db.get("employees", session.employeeId),
      ctx.db.get("locations", session.locationId),
      matchingTier(ctx, organizationId, session.durationMinutes),
      ctx.db
        .query("staffFoodRegistrations")
        .withIndex("by_organizationId_and_sessionId_and_registeredAt", (q) =>
          q.eq("organizationId", organizationId).eq("sessionId", session._id),
        )
        .order("desc")
        .take(MAX_SESSION_REGISTRATIONS + 1),
      sessionActive(ctx, organizationId, session, args.now),
    ]);
    if (
      !employee ||
      employee.organizationId !== organizationId ||
      !location ||
      location.organizationId !== organizationId
    ) {
      throw new ConvexError("Staff food-sessionen er ugyldig");
    }

    const activeRows = rows
      .slice(0, MAX_SESSION_REGISTRATIONS)
      .filter((row) => row.status === "active");
    if (!tier) {
      return {
        session: {
          id: session._id,
          employeeId: employee._id,
          employeeName: employee.displayName,
          employeeImageUrl: employee.imageUrl,
          locationId: location._id,
          locationName: location.name,
          source: session.source,
          workDate: session.workDate,
          startsAt: session.startsAt ?? null,
          endsAt: session.endsAt ?? null,
          durationMinutes: session.durationMinutes,
          active,
        },
        tierMinimumShiftMinutes: null,
        allowances: [],
        products: [],
        registrations: activeRows.map(registrationRow),
        limitReached: rows.length > MAX_SESSION_REGISTRATIONS,
      };
    }

    const allowanceRows = await ctx.db
      .query("staffFoodRuleAllowances")
      .withIndex("by_organizationId_and_tierId", (q) =>
        q.eq("organizationId", organizationId).eq("tierId", tier._id),
      )
      .take(MAX_ALLOWANCES + 1);
    if (allowanceRows.length > MAX_ALLOWANCES) {
      throw new ConvexError("Reglen har for mange kategorier");
    }
    const categoryRows = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
    if (categoryRows.length > MAX_CATEGORIES_PER_ORGANIZATION) {
      throw new ConvexError("Organisationen har for mange kategorier");
    }
    const categoriesById = new Map(
      categoryRows.map((category) => [category._id, category]),
    );
    const categories = allowanceRows.map((allowance) =>
      categoriesById.get(allowance.categoryId),
    );
    const allowances = allowanceRows.flatMap((allowance, index) => {
      const category = categories[index];
      if (!category || category.organizationId !== organizationId) return [];
      return [
        {
          categoryId: category._id,
          categoryName: category.name,
          amount: allowance.amount,
          used: 0,
          remaining: allowance.amount,
        },
      ];
    });

    const productGroups = await Promise.all(
      allowanceRows.map((allowance) =>
        ctx.db
          .query("staffFoodRuleProducts")
          .withIndex("by_organizationId_and_allowanceId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("allowanceId", allowance._id),
          )
          .take(MAX_PRODUCTS_PER_TIER + 1),
      ),
    );
    if (
      productGroups.reduce((total, group) => total + group.length, 0) >
      MAX_PRODUCTS_PER_TIER
    ) {
      throw new ConvexError("Reglen har for mange produkter");
    }
    const allowanceByCategory = new Map(
      allowances.map((allowance) => [
        allowance.categoryId,
        allowance,
      ]),
    );
    const allowanceByProductId = new Map<
      Id<"products">,
      (typeof allowances)[number]
    >();
    const productIds = [
      ...new Set(
        productGroups.flatMap((group) =>
          group.map((row) => row.productId),
        ),
      ),
    ];
    const productRows = await Promise.all(
      productIds.map((productId) => ctx.db.get("products", productId)),
    );
    const productsById = new Map(
      productRows.flatMap((product) =>
        product ? [[product._id, product] as const] : [],
      ),
    );
    const defaultUnitIds = [
      ...new Set(
        productRows.flatMap((product) =>
          product?.organizationId === organizationId
            ? [product.defaultUnitId]
            : [],
        ),
      ),
    ];
    const defaultUnitRows = await Promise.all(
      defaultUnitIds.map((unitId) => ctx.db.get("units", unitId)),
    );
    const defaultUnitsById = new Map(
      defaultUnitRows.flatMap((unit) =>
        unit ? [[unit._id, unit] as const] : [],
      ),
    );
    const products = (
      await Promise.all(
        productGroups.flatMap((group, index) =>
          group.map(async (row) => {
            const allowance = allowanceByCategory.get(
              allowanceRows[index].categoryId,
            );
            const product = productsById.get(row.productId);
            const categoryId =
              product && allowance
                ? await productCategoryInTree(
                    ctx,
                    product,
                    categoriesById,
                    allowance.categoryId,
                  )
                : null;
            if (
              !product ||
              product.organizationId !== organizationId ||
              product.status !== "active" ||
              !allowance ||
              !categoryId
            ) {
              return null;
            }
            allowanceByProductId.set(product._id, allowance);
            const unit = defaultUnitsById.get(product.defaultUnitId);
            if (!unit || unit.organizationId !== organizationId) return null;
            return {
              id: product._id,
              name: product.name,
              categoryId,
              allowanceCategoryId: allowance.categoryId,
              categoryName: allowance.categoryName,
              imageUrl: product.imageStorageId
                ? await ctx.storage.getUrl(product.imageStorageId)
                : null,
              defaultUnitName: unit.name,
            };
          }),
        ),
      )
    ).filter((product) => product !== null);

    const used = new Map<Id<"categories">, number>();
    for (const row of activeRows) {
      const allowance =
        allowanceByProductId.get(row.productId) ??
        allowances.find((item) =>
          categoryIncludes(categoriesById, item.categoryId, row.categoryId),
        );
      if (allowance) {
        used.set(
          allowance.categoryId,
          (used.get(allowance.categoryId) ?? 0) + row.quantity,
        );
      }
    }

    return {
      session: {
        id: session._id,
        employeeId: employee._id,
        employeeName: employee.displayName,
        employeeImageUrl: employee.imageUrl,
        locationId: location._id,
        locationName: location.name,
        source: session.source,
        workDate: session.workDate,
        startsAt: session.startsAt ?? null,
        endsAt: session.endsAt ?? null,
        durationMinutes: session.durationMinutes,
        active,
      },
      tierMinimumShiftMinutes: tier.minimumShiftMinutes,
      allowances: allowances.map((allowance) => {
        const categoryUsed = used.get(allowance.categoryId) ?? 0;
        return {
          ...allowance,
          used: categoryUsed,
          remaining: Math.max(0, allowance.amount - categoryUsed),
        };
      }),
      products: products.sort(
        (left, right) =>
          left.categoryName.localeCompare(right.categoryName, "da") ||
          left.name.localeCompare(right.name, "da"),
      ),
      registrations: activeRows.map(registrationRow),
      limitReached: rows.length > MAX_SESSION_REGISTRATIONS,
    };
  },
});

export const register = mutation({
  args: {
    sessionId: v.id("staffFoodSessions"),
    items: v.array(
      v.object({ productId: v.id("products"), quantity: v.number() }),
    ),
  },
  returns: v.object({
    checkoutId: v.string(),
    registeredAt: v.number(),
    itemCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const { organizationId, userIdentifier, userName } = auth;
    if (!args.items.length || args.items.length > MAX_BASKET_ITEMS) {
      throw new ConvexError("Vælg mindst ét og højst 50 produkter");
    }
    if (
      new Set(args.items.map((item) => item.productId)).size !==
      args.items.length
    ) {
      throw new ConvexError("Det samme produkt må kun vælges én gang");
    }
    for (const item of args.items) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20
      ) {
        throw new ConvexError("Antallet skal være mellem 1 og 20");
      }
    }
    const now = Date.now();
    const session = await requireSession(ctx, organizationId, args.sessionId);
    requireLocationAccess(auth, session.locationId);
    await requireOtherFeaturesUnlocked(ctx, organizationId, session.locationId);
    if (!(await sessionActive(ctx, organizationId, session, now))) {
      throw new ConvexError("Vagten er ikke aktiv længere");
    }
    const [tier, location, employee] = await Promise.all([
      matchingTier(ctx, organizationId, session.durationMinutes),
      requireLocation(ctx, organizationId, session.locationId),
      ctx.db.get("employees", session.employeeId),
    ]);
    if (!tier) throw new ConvexError("Vagten udløser ingen Staff food-regel");
    if (!employee || employee.organizationId !== organizationId) {
      throw new ConvexError("Medarbejderen blev ikke fundet");
    }
    const allowanceRows = await ctx.db
      .query("staffFoodRuleAllowances")
      .withIndex("by_organizationId_and_tierId", (q) =>
        q.eq("organizationId", organizationId).eq("tierId", tier._id),
      )
      .take(MAX_ALLOWANCES + 1);
    if (allowanceRows.length > MAX_ALLOWANCES) {
      throw new ConvexError("Reglen har for mange kategorier");
    }
    const allowanceById = new Map(
      allowanceRows.map((allowance) => [allowance._id, allowance]),
    );
    const categoryRows = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
    if (categoryRows.length > MAX_CATEGORIES_PER_ORGANIZATION) {
      throw new ConvexError("Organisationen har for mange kategorier");
    }
    const categoriesById = new Map(
      categoryRows.map((category) => [category._id, category]),
    );
    const allowedProducts = new Map<
      Id<"products">,
      Doc<"staffFoodRuleAllowances">
    >();
    let configuredProductCount = 0;
    for (const allowance of allowanceRows) {
      const rows = await ctx.db
        .query("staffFoodRuleProducts")
        .withIndex("by_organizationId_and_allowanceId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("allowanceId", allowance._id),
        )
        .take(MAX_PRODUCTS_PER_TIER + 1);
      configuredProductCount += rows.length;
      for (const row of rows) allowedProducts.set(row.productId, allowance);
    }
    if (configuredProductCount > MAX_PRODUCTS_PER_TIER) {
      throw new ConvexError("Reglen har for mange produkter");
    }
    const products = await Promise.all(
      args.items.map((item) => ctx.db.get("products", item.productId)),
    );
    const basketByAllowance = new Map<Id<"staffFoodRuleAllowances">, number>();
    const categoryByProductId = new Map<
      Id<"products">,
      Id<"categories">
    >();
    for (let index = 0; index < args.items.length; index += 1) {
      const item = args.items[index];
      const product = products[index];
      const allowance = allowedProducts.get(item.productId);
      const categoryId =
        product && allowance
          ? await productCategoryInTree(
              ctx,
              product,
              categoriesById,
              allowance.categoryId,
            )
          : null;
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active" ||
        !allowance ||
        !categoryId
      ) {
        throw new ConvexError("Et valgt produkt er ikke tilladt");
      }
      categoryByProductId.set(product._id, categoryId);
      basketByAllowance.set(
        allowance._id,
        (basketByAllowance.get(allowance._id) ?? 0) + item.quantity,
      );
    }
    const existing = await ctx.db
      .query("staffFoodRegistrations")
      .withIndex("by_organizationId_and_sessionId_and_registeredAt", (q) =>
        q.eq("organizationId", organizationId).eq("sessionId", session._id),
      )
      .take(MAX_SESSION_REGISTRATIONS + 1);
    if (existing.length > MAX_SESSION_REGISTRATIONS) {
      throw new ConvexError("Sessionen har for mange registreringer");
    }
    const usedByAllowance = new Map<Id<"staffFoodRuleAllowances">, number>();
    for (const row of existing) {
      if (row.status !== "active") continue;
      const allowance = allowedProducts.get(row.productId);
      if (allowance) {
        usedByAllowance.set(
          allowance._id,
          (usedByAllowance.get(allowance._id) ?? 0) + row.quantity,
        );
      }
    }
    for (const [allowanceId, basketQuantity] of basketByAllowance) {
      const allowance = allowanceById.get(allowanceId);
      if (!allowance) {
        throw new ConvexError("Et valgt produkt er ikke tilladt");
      }
      const used = usedByAllowance.get(allowanceId) ?? 0;
      if (used + basketQuantity > allowance.amount) {
        throw new ConvexError("Valget overstiger den resterende mængde");
      }
    }

    const checkoutId = crypto.randomUUID();
    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const summaryContributions = [] as ReturnType<
      typeof staffFoodSummaryContribution
    >;
    for (let index = 0; index < args.items.length; index += 1) {
      const item = args.items[index];
      const product = products[index]!;
      const allowance = allowedProducts.get(product._id)!;
      const categoryId = categoryByProductId.get(product._id);
      if (!categoryId) {
        throw new ConvexError("Et valgt produkt er ikke tilladt");
      }
      const [category, unit] = await Promise.all([
        ctx.db.get("categories", categoryId),
        ctx.db.get("units", product.defaultUnitId),
      ]);
      if (
        !category ||
        category.organizationId !== organizationId ||
        !unit ||
        unit.organizationId !== organizationId
      ) {
        throw new ConvexError("Produktets kategori eller enhed mangler");
      }
      const defaultQuantity = normalizeStock(item.quantity);
      const registrationId = await ctx.db.insert("staffFoodRegistrations", {
        organizationId,
        checkoutId,
        sessionId: session._id,
        locationId: location._id,
        locationName: location.name,
        employeeId: employee._id,
        employeeName: employee.displayName,
        sessionSource: session.source,
        workDate: session.workDate,
        shiftDurationMinutes: session.durationMinutes,
        tierMinimumShiftMinutes: tier.minimumShiftMinutes,
        categoryAllowance: allowance.amount,
        categoryId: category._id,
        categoryName: category.name,
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        defaultUnitId: unit._id,
        defaultUnitName: unit.name,
        defaultQuantity,
        registeredAt: now,
        registeredBy: userIdentifier,
        registeredByName: userName,
        status: "active",
        dashboardSummaryTimeZone: summaryTimeZone,
      });
      const registration = await ctx.db.get(
        "staffFoodRegistrations",
        registrationId,
      );
      if (registration) {
        summaryContributions.push(
          ...staffFoodSummaryContribution(registration, summaryTimeZone),
        );
      }
      await addStock(
        ctx,
        organizationId,
        location._id,
        product._id,
        -defaultQuantity,
      );
    }
    await reconcileDashboardSummaryContributions(ctx, [], summaryContributions);
    return {
      checkoutId,
      registeredAt: now,
      itemCount: args.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  },
});

export const voidCheckout = mutation({
  args: {
    checkoutId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodRegistrar(ctx);
    const reason = requireAuditReason(args.reason);
    const { organizationId, userIdentifier, userName } = auth;
    const rows = await ctx.db
      .query("staffFoodRegistrations")
      .withIndex("by_organizationId_and_checkoutId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("checkoutId", args.checkoutId),
      )
      .take(MAX_BASKET_ITEMS + 1);
    if (!rows.length || rows.length > MAX_BASKET_ITEMS) {
      throw new ConvexError("Registreringen blev ikke fundet");
    }
    requireLocationAccess(auth, rows[0]!.locationId);
    await requireOtherFeaturesUnlocked(
      ctx,
      organizationId,
      rows[0]!.locationId,
    );
    const now = Date.now();
    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const previousSummaryContributions = rows.flatMap((row) =>
      row.dashboardSummaryTimeZone
        ? staffFoodSummaryContribution(row, row.dashboardSummaryTimeZone)
        : [],
    );
    if (
      rows.some(
        (row) =>
          row.registeredBy !== userIdentifier ||
          now - row.registeredAt > UNDO_WINDOW_MS + UNDO_REASON_GRACE_MS ||
          row.status !== "active",
      )
    ) {
      throw new ConvexError("Registreringen kan ikke længere fortrydes");
    }
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "voided",
        voidedAt: now,
        voidedBy: userIdentifier,
        voidedByName: userName,
        dashboardSummaryTimeZone: summaryTimeZone,
      });
      await addStock(
        ctx,
        organizationId,
        row.locationId,
        row.productId,
        row.defaultQuantity,
      );
    }
    await reconcileDashboardSummaryContributions(
      ctx,
      previousSummaryContributions,
      [],
    );
    await recordAudit(ctx, auth, {
      action: "staffFood.void",
      entityTable: "staffFoodRegistrations",
      entityId: args.checkoutId,
      locationId: rows[0]!.locationId,
      summary: "Staff food-registrering annulleret",
      reason,
    });
    return null;
  },
});

export const getSettings = query({
  args: {},
  returns: v.object({
    timeZone: v.string(),
    tiers: v.array(
      v.object({
        id: v.id("staffFoodRuleTiers"),
        minimumShiftMinutes: v.number(),
        allowances: v.array(
          v.object({
            categoryId: v.id("categories"),
            categoryName: v.string(),
            amount: v.number(),
            products: v.array(
              v.object({
                id: v.id("products"),
                name: v.string(),
                status: v.union(v.literal("active"), v.literal("archived")),
              }),
            ),
          }),
        ),
      }),
    ),
    categories: v.array(
      v.object({
        id: v.id("categories"),
        name: v.string(),
        parentCategoryId: v.union(v.id("categories"), v.null()),
      }),
    ),
    products: v.array(
      v.object({
        id: v.id("products"),
        name: v.string(),
        categoryIds: v.array(v.id("categories")),
        status: v.union(v.literal("active"), v.literal("archived")),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireStaffFoodManager(ctx);
    const [tiers, categories, products, timeZone] = await Promise.all([
      ctx.db
        .query("staffFoodRuleTiers")
        .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_TIERS + 1),
      ctx.db
        .query("categories")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(500),
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_SETTINGS_PRODUCTS + 1),
      resolveTimeZone(ctx, organizationId),
    ]);
    if (tiers.length > MAX_TIERS) {
      throw new ConvexError("Der er for mange regler");
    }
    if (products.length > MAX_SETTINGS_PRODUCTS) {
      throw new ConvexError(
        "Der er over 500 produkter. Slet arkiverede produkter, du ikke længere bruger, eller kontakt en bruger med rollen Administrator",
      );
    }
    const categoriesById = new Map(
      categories.map((category) => [category._id, category]),
    );
    const productsById = new Map(
      products.map((product) => [product._id, product]),
    );
    const tierResults = await Promise.all(
      tiers.map(async (tier) => {
        const allowances = await ctx.db
          .query("staffFoodRuleAllowances")
          .withIndex("by_organizationId_and_tierId", (q) =>
            q.eq("organizationId", organizationId).eq("tierId", tier._id),
          )
          .take(MAX_ALLOWANCES + 1);
        if (allowances.length > MAX_ALLOWANCES) {
          throw new ConvexError("Reglen har for mange kategorier");
        }
        return {
          id: tier._id,
          minimumShiftMinutes: tier.minimumShiftMinutes,
          allowances: await Promise.all(
            allowances.map(async (allowance) => {
              const productRows = await ctx.db
                .query("staffFoodRuleProducts")
                .withIndex("by_organizationId_and_allowanceId", (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("allowanceId", allowance._id),
                )
                .take(MAX_PRODUCTS_PER_TIER + 1);
              const category = categoriesById.get(allowance.categoryId);
              if (!category || category.organizationId !== organizationId) {
                throw new ConvexError("Reglens kategori blev ikke fundet");
              }
              if (productRows.length > MAX_PRODUCTS_PER_TIER) {
                throw new ConvexError("Reglen har for mange produkter");
              }
              const allowedProducts = productRows.map((row) =>
                productsById.get(row.productId),
              );
              return {
                categoryId: category._id,
                categoryName: category.name,
                amount: allowance.amount,
                products: allowedProducts.flatMap((product) =>
                  product?.organizationId === organizationId
                    ? [
                        {
                          id: product._id,
                          name: product.name,
                          status: product.status,
                        },
                      ]
                    : [],
                ),
              };
            }),
          ),
        };
      }),
    );
    return {
      timeZone,
      tiers: tierResults,
      categories: categories.map((category) => ({
        id: category._id,
        name: category.name,
        parentCategoryId: category.parentCategoryId ?? null,
      })),
      products: await Promise.all(
        products.map(async (product) => ({
          id: product._id,
          name: product.name,
          categoryIds: await getProductCategoryIds(ctx, product),
          status: product.status,
        })),
      ),
    };
  },
});

export const saveTier = mutation({
  args: {
    tierId: v.optional(v.id("staffFoodRuleTiers")),
    minimumShiftMinutes: v.number(),
    allowances: v.array(allowanceInputValidator),
  },
  returns: v.id("staffFoodRuleTiers"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireStaffFoodManager(ctx);
    requireDuration(args.minimumShiftMinutes);
    if (!args.allowances.length || args.allowances.length > MAX_ALLOWANCES) {
      throw new ConvexError("Tilføj mellem 1 og 20 kategori-regler");
    }
    if (
      new Set(args.allowances.map((allowance) => allowance.categoryId)).size !==
      args.allowances.length
    ) {
      throw new ConvexError("En kategori må kun bruges én gang pr. regel");
    }
    const productCount = args.allowances.reduce(
      (total, allowance) => total + allowance.productIds.length,
      0,
    );
    if (productCount < 1 || productCount > MAX_PRODUCTS_PER_TIER) {
      throw new ConvexError("Vælg mellem 1 og 100 produkter pr. regel");
    }
    const categoryRows = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
    if (categoryRows.length > MAX_CATEGORIES_PER_ORGANIZATION) {
      throw new ConvexError("Organisationen har for mange kategorier");
    }
    const categoriesById = new Map(
      categoryRows.map((category) => [category._id, category]),
    );
    for (const allowance of args.allowances) {
      if (
        !Number.isInteger(allowance.amount) ||
        allowance.amount < 1 ||
        allowance.amount > 20 ||
        !allowance.productIds.length ||
        new Set(allowance.productIds).size !== allowance.productIds.length
      ) {
        throw new ConvexError("Kategoriens mængde eller produkter er ugyldige");
      }
    }
    const duplicate = await ctx.db
      .query("staffFoodRuleTiers")
      .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("minimumShiftMinutes", args.minimumShiftMinutes),
      )
      .unique();
    if (duplicate && duplicate._id !== args.tierId) {
      throw new ConvexError(
        "Der findes allerede en regel for denne vagtlængde",
      );
    }
    let tierId = args.tierId;
    if (tierId) {
      const tier = await ctx.db.get("staffFoodRuleTiers", tierId);
      if (!tier || tier.organizationId !== organizationId) {
        throw new ConvexError("Reglen blev ikke fundet");
      }
      await ctx.db.patch(tierId, {
        minimumShiftMinutes: args.minimumShiftMinutes,
        updatedAt: Date.now(),
      });
    } else {
      const tiers = await ctx.db
        .query("staffFoodRuleTiers")
        .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_TIERS);
      if (tiers.length >= MAX_TIERS) {
        throw new ConvexError("Der kan højst oprettes 10 regler");
      }
      tierId = await ctx.db.insert("staffFoodRuleTiers", {
        organizationId,
        minimumShiftMinutes: args.minimumShiftMinutes,
        updatedAt: Date.now(),
      });
    }

    const existingAllowances = await ctx.db
      .query("staffFoodRuleAllowances")
      .withIndex("by_organizationId_and_tierId", (q) =>
        q.eq("organizationId", organizationId).eq("tierId", tierId),
      )
      .take(MAX_ALLOWANCES + 1);
    if (existingAllowances.length > MAX_ALLOWANCES) {
      throw new ConvexError("Reglen har for mange kategorier");
    }
    for (const allowance of existingAllowances) {
      const productRows = await ctx.db
        .query("staffFoodRuleProducts")
        .withIndex("by_organizationId_and_allowanceId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("allowanceId", allowance._id),
        )
        .take(MAX_PRODUCTS_PER_TIER + 1);
      if (productRows.length > MAX_PRODUCTS_PER_TIER) {
        throw new ConvexError("Reglen har for mange produkter");
      }
      for (const row of productRows) await ctx.db.delete(row._id);
      await ctx.db.delete(allowance._id);
    }
    for (const allowance of args.allowances) {
      const category = categoriesById.get(allowance.categoryId);
      if (!category || category.organizationId !== organizationId) {
        throw new ConvexError("En kategori blev ikke fundet");
      }
      const products = await Promise.all(
        allowance.productIds.map((productId) =>
          ctx.db.get("products", productId),
        ),
      );
      const validProducts = await Promise.all(
        products.map(async (product) =>
          product?.organizationId === organizationId
            ? Boolean(
                await productCategoryInTree(
                  ctx,
                  product,
                  categoriesById,
                  category._id,
                ),
              )
            : false,
        ),
      );
      if (validProducts.some((valid) => !valid)) {
        throw new ConvexError(
          "Et produkt tilhører ikke den valgte kategori eller dens underkategorier",
        );
      }
      const allowanceId = await ctx.db.insert("staffFoodRuleAllowances", {
        organizationId,
        tierId,
        categoryId: category._id,
        amount: allowance.amount,
      });
      for (const productId of allowance.productIds) {
        await ctx.db.insert("staffFoodRuleProducts", {
          organizationId,
          allowanceId,
          productId,
        });
      }
    }
    return tierId;
  },
});

export const deleteTier = mutation({
  args: { tierId: v.id("staffFoodRuleTiers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireStaffFoodManager(ctx);
    const tier = await ctx.db.get("staffFoodRuleTiers", args.tierId);
    if (!tier || tier.organizationId !== organizationId) {
      throw new ConvexError("Reglen blev ikke fundet");
    }
    const allowances = await ctx.db
      .query("staffFoodRuleAllowances")
      .withIndex("by_organizationId_and_tierId", (q) =>
        q.eq("organizationId", organizationId).eq("tierId", tier._id),
      )
      .take(MAX_ALLOWANCES + 1);
    if (allowances.length > MAX_ALLOWANCES) {
      throw new ConvexError("Reglen har for mange kategorier");
    }
    for (const allowance of allowances) {
      const products = await ctx.db
        .query("staffFoodRuleProducts")
        .withIndex("by_organizationId_and_allowanceId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("allowanceId", allowance._id),
        )
        .take(MAX_PRODUCTS_PER_TIER + 1);
      if (products.length > MAX_PRODUCTS_PER_TIER) {
        throw new ConvexError("Reglen har for mange produkter");
      }
      for (const product of products) await ctx.db.delete(product._id);
      await ctx.db.delete(allowance._id);
    }
    await ctx.db.delete(tier._id);
    return null;
  },
});

export const exportRegistrations = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
  },
  returns: paginationResultValidator(registrationRowValidator),
  handler: async (ctx, args) => {
    const auth = await requireStaffFoodManager(ctx);
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    if (
      !Number.isFinite(args.startAt) ||
      !Number.isFinite(args.endAt) ||
      args.startAt > args.endAt ||
      args.endAt - args.startAt > 366 * DAY_MS
    ) {
      throw new ConvexError("Eksportperioden er ugyldig");
    }
    if (args.paginationOpts.numItems > 100) {
      throw new ConvexError("Eksportsiden er for stor");
    }
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const result = isSingleLocationFilter(locationFilter)
      ? await ctx.db
          .query("staffFoodRegistrations")
          .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", locationFilter.locationId)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : isMultiLocationFilter(locationFilter)
        ? await ctx.db
            .query("staffFoodRegistrations")
            .withIndex("by_organizationId_and_registeredAt", (q) =>
              q
                .eq("organizationId", organizationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .filter((q) =>
              q.or(
                ...locationFilter.locationIds.map((locationId) =>
                  q.eq(q.field("locationId"), locationId),
                ),
              ),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("staffFoodRegistrations")
            .withIndex("by_organizationId_and_registeredAt", (q) =>
              q
                .eq("organizationId", organizationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(registrationRow) };
  },
});
