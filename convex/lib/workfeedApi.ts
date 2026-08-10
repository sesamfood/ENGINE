import { ConvexError } from "convex/values";

const API_URL =
  "https://europe-west1-production-eu-327a3.cloudfunctions.net/api";
const MAX_DEPARTMENTS = 500;
const MAX_EMPLOYEES = 5_000;
const MAX_ROLES = 1_000;
const MAX_SHIFTS = 5_000;
const MAX_ASSIGNMENTS = 200;

export type WorkfeedSettings = {
  apiKey: string;
  companyId: string;
  enabled: boolean;
};

export type WorkfeedDepartment = {
  id: string;
  name: string;
};

export type WorkfeedEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  active: boolean;
  departmentIds: string[];
};

export type WorkfeedRole = {
  id: string;
  departmentId: string;
  name: string;
  active: boolean;
};

export type WorkfeedShift = {
  id: string;
  employeeId: string;
  departmentId: string;
  roleId: string | null;
  start: number;
  end: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_ASSIGNMENTS) return [];
  return value.map(string).filter(Boolean);
}

export async function requestWorkfeed(
  path: string,
  settings: Pick<WorkfeedSettings, "apiKey" | "companyId">,
  query?: Record<string, string>,
) {
  const url = new URL(
    `${API_URL}/companies/${encodeURIComponent(settings.companyId)}${path}`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: settings.apiKey,
      },
    });
  } catch {
    throw new ConvexError("Workfeed kunne ikke kontaktes");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ConvexError("Workfeed afviste CompanyID eller API-nøgle");
  }
  if (!response.ok) {
    throw new ConvexError(`Workfeed svarede med status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ConvexError("Workfeed returnerede et ugyldigt svar");
  }
}

export function parseDepartments(payload: unknown): WorkfeedDepartment[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig afdelingsliste");
  }
  if (payload.length > MAX_DEPARTMENTS) {
    throw new ConvexError("Workfeed-kontoen har for mange afdelinger");
  }

  return payload.flatMap((value) => {
    const department = object(value);
    const id = string(department?.id);
    const name = string(department?.name);
    if (!id || !name || department?.isDeleted === true) return [];
    return [{ id, name }];
  });
}

export async function requestDepartments(
  settings: Pick<WorkfeedSettings, "apiKey" | "companyId">,
): Promise<WorkfeedDepartment[]> {
  return parseDepartments(await requestWorkfeed("/departments", settings));
}

export function parseEmployees(payload: unknown): WorkfeedEmployee[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig medarbejderliste");
  }
  if (payload.length > MAX_EMPLOYEES) {
    throw new ConvexError("Workfeed-kontoen har for mange medarbejdere");
  }

  return payload.flatMap((value) => {
    const employee = object(value);
    const id = string(employee?.id);
    if (!id) return [];
    const firstName = string(employee?.firstname);
    const lastName = string(employee?.lastname);
    const imageUrl = string(employee?.imageURL);
    return [
      {
        id,
        firstName,
        lastName,
        imageUrl: imageUrl.startsWith("https://") ? imageUrl : null,
        active: employee?.isDeleted !== true,
        departmentIds: stringArray(employee?.departmentIDs),
      },
    ];
  });
}

export function parseRoles(payload: unknown): WorkfeedRole[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig rolleliste");
  }
  if (payload.length > MAX_ROLES) {
    throw new ConvexError("Workfeed-kontoen har for mange roller");
  }

  return payload.flatMap((value) => {
    const role = object(value);
    const id = string(role?.id);
    const departmentId = string(role?.departmentID);
    const name = string(role?.name);
    if (!id || !departmentId || !name) return [];
    return [
      {
        id,
        departmentId,
        name,
        active: role?.isDeleted !== true,
      },
    ];
  });
}

export function parseShifts(payload: unknown): WorkfeedShift[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig vagtliste");
  }
  if (payload.length > MAX_SHIFTS) {
    throw new ConvexError("Der er for mange Workfeed-vagter i perioden");
  }

  return payload.flatMap((value) => {
    const shift = object(value);
    const id = string(shift?.id);
    const employeeId = string(shift?.employeeID);
    const departmentId = string(shift?.departmentID);
    const roleId = string(shift?.roleID);
    const start = Date.parse(string(shift?.start));
    const end = Date.parse(string(shift?.end));
    if (
      !id ||
      !employeeId ||
      !departmentId ||
      shift?.released !== true ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      return [];
    }
    return [
      {
        id,
        employeeId,
        departmentId,
        roleId: roleId || null,
        start,
        end,
      },
    ];
  });
}

export function workfeedErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Workfeed-synkroniseringen mislykkedes";
}
