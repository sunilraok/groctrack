import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOME_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireHousehold: vi.fn(),
  cookieSet: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/households", () => ({
  householdCookie: "groctrack-household",
  requireHousehold: mocks.requireHousehold,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SITE_URL: "https://groctrack.example",
  }),
}));

import {
  createHousehold,
  createInvitation,
  recordInventoryChange,
  removeHouseholdMember,
  reverseInventoryTransaction,
  switchHousehold,
} from "./actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function membership(
  householdId: string,
  userId = OWNER_ID,
  role: "owner" | "member" = "owner",
) {
  return {
    household_id: householdId,
    user_id: userId,
    role,
    joined_at: "2026-01-01T00:00:00Z",
    households: {
      id: householdId,
      name: "Home",
      created_by: OWNER_ID,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

const groceryItemId = "33333333-3333-4333-8333-333333333333";
const transactionId = "44444444-4444-4444-8444-444444444444";
const operationId = "55555555-5555-4555-8555-555555555555";

function inventoryChangeData(overrides: Record<string, string> = {}) {
  return form({
    groceryItemId,
    operationId,
    type: "consumption",
    quantity: "1",
    unit: "g",
    note: "",
    ...overrides,
  });
}

function createInventorySupabase({
  dimension = "mass",
  rpcError = null,
}: {
  dimension?: "mass" | "volume" | "count";
  rpcError?: { code?: string; message: string } | null;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: { id: transactionId, unit_dimension: dimension },
    error: null,
  });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  return {
    client: { from: vi.fn().mockReturnValue(query), rpc },
    rpc,
  };
}

describe("household server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("does not set a cookie when switching to another household", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [membership(HOME_ID)],
      error: null,
    });
    mocks.requireUser.mockResolvedValue({
      user: { id: OWNER_ID },
      supabase: {
        from: () => ({ select: () => ({ eq }) }),
      },
    });

    await expect(
      switchHousehold(null, form({ householdId: OTHER_ID })),
    ).resolves.toEqual({
      ok: false,
      error: "You are not a member of that household.",
    });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sets the selected household only after membership is verified", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [membership(HOME_ID)],
      error: null,
    });
    mocks.requireUser.mockResolvedValue({
      user: { id: OWNER_ID },
      supabase: {
        from: () => ({ select: () => ({ eq }) }),
      },
    });

    await expect(
      switchHousehold(null, form({ householdId: HOME_ID })),
    ).resolves.toEqual({ ok: true, data: undefined });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "groctrack-household",
      HOME_ID,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("rejects household creation validation and surfaces RPC failures", async () => {
    await expect(
      createHousehold(null, form({ name: " " })),
    ).resolves.toEqual({ ok: false, error: "Enter a household name." });
    expect(mocks.requireUser).not.toHaveBeenCalled();

    mocks.requireUser.mockResolvedValue({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("database unavailable"),
        }),
      },
    });
    await expect(
      createHousehold(null, form({ name: "Home" })),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("allows only owners to create invitations", async () => {
    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID, MEMBER_ID, "member"),
      user: { id: MEMBER_ID },
      supabase: {},
    });

    await expect(
      createInvitation(null, form({ email: "guest@example.com" })),
    ).resolves.toEqual({
      ok: false,
      error: "Only household owners can invite members.",
    });
  });

  it("creates an email-bound invitation expiring in approximately seven days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    const deleteQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      lt: vi.fn().mockResolvedValue({ error: null }),
    };
    deleteQuery.eq.mockReturnValue(deleteQuery);
    deleteQuery.is.mockReturnValue(deleteQuery);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({
      delete: () => deleteQuery,
      insert,
    });
    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID),
      user: { id: OWNER_ID },
      supabase: { from },
    });

    const result = await createInvitation(
      null,
      form({ email: "Guest@Example.com" }),
    );

    expect(result?.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: HOME_ID,
        email: "guest@example.com",
        role: "member",
        invited_by: OWNER_ID,
        expires_at: "2026-09-20T12:00:00.000Z",
      }),
    );
  });

  it("renders duplicate and backend invitation failures explicitly", async () => {
    const deleteQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      lt: vi.fn().mockResolvedValue({ error: null }),
    };
    deleteQuery.eq.mockReturnValue(deleteQuery);
    deleteQuery.is.mockReturnValue(deleteQuery);
    const insert = vi.fn()
      .mockResolvedValueOnce({ error: { code: "23505" } })
      .mockResolvedValueOnce({ error: new Error("write failed") });
    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID),
      user: { id: OWNER_ID },
      supabase: {
        from: () => ({ delete: () => deleteQuery, insert }),
      },
    });

    await expect(
      createInvitation(null, form({ email: "guest@example.com" })),
    ).resolves.toEqual({
      ok: false,
      error: "An active invitation already exists for that email.",
    });
    await expect(
      createInvitation(null, form({ email: "other@example.com" })),
    ).resolves.toEqual({ ok: false, error: "write failed" });
  });

  it("prevents members and owners themselves from removing membership", async () => {
    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID, MEMBER_ID, "member"),
      supabase: {},
    });
    await expect(
      removeHouseholdMember(null, form({ userId: OWNER_ID })),
    ).resolves.toEqual({
      ok: false,
      error: "Only household owners can remove members.",
    });

    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID),
      supabase: {},
    });
    await expect(
      removeHouseholdMember(null, form({ userId: OWNER_ID })),
    ).resolves.toEqual({
      ok: false,
      error: "Owners cannot remove themselves.",
    });
  });

  it("passes the current household and target member to the revocation RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.requireHousehold.mockResolvedValue({
      current: membership(HOME_ID),
      supabase: { rpc },
    });

    await expect(
      removeHouseholdMember(null, form({ userId: MEMBER_ID })),
    ).resolves.toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("revoke_household_member", {
      target_household_id: HOME_ID,
      target_user_id: MEMBER_ID,
    });
  });
});

describe("inventory server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it.each(["0", "0.0", "-0", "-0.000000"])(
    "rejects decimal zero variant %s before household lookup",
    async (quantity) => {
      const result = await recordInventoryChange(
        null,
        inventoryChangeData({ quantity }),
      );

      expect(result).toEqual({
        ok: false,
        error: "Enter a valid non-zero quantity and unit.",
      });
      expect(mocks.requireHousehold).not.toHaveBeenCalled();
    },
  );

  it.each(["-1", "1.0000001", "1000000000000"])(
    "rejects invalid consumption input %s before household lookup",
    async (quantity) => {
      const result = await recordInventoryChange(
        null,
        inventoryChangeData({ quantity }),
      );

      expect(result?.ok).toBe(false);
      expect(mocks.requireHousehold).not.toHaveBeenCalled();
    },
  );

  it("rejects a unit that is incompatible with the stored item dimension", async () => {
    const { client, rpc } = createInventorySupabase({ dimension: "volume" });
    mocks.requireHousehold.mockResolvedValue({
      supabase: client,
      current: { household_id: HOME_ID },
    });

    const result = await recordInventoryChange(null, inventoryChangeData());

    expect(result).toEqual({
      ok: false,
      error: "That unit is not compatible with this item.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC failures without reporting success", async () => {
    const { client } = createInventorySupabase({
      rpcError: { message: "database rejected change" },
    });
    mocks.requireHousehold.mockResolvedValue({
      supabase: client,
      current: { household_id: HOME_ID },
    });

    const result = await recordInventoryChange(null, inventoryChangeData());

    expect(result).toEqual({ ok: false, error: "database rejected change" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a valid negative adjustment and operation ID to the RPC", async () => {
    const { client, rpc } = createInventorySupabase();
    mocks.requireHousehold.mockResolvedValue({
      supabase: client,
      current: { household_id: HOME_ID },
    });

    const result = await recordInventoryChange(
      null,
      inventoryChangeData({ type: "adjustment", quantity: "-1.250000" }),
    );

    expect(result?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_inventory_change", {
      target_grocery_item_id: groceryItemId,
      change_type: "adjustment",
      entered_quantity: "-1.250000",
      entered_unit: "g",
      client_operation_id: operationId,
      change_note: null,
    });
  });

  it("maps duplicate reversal errors to an explicit user message", async () => {
    const { client, rpc } = createInventorySupabase();
    rpc.mockResolvedValue({
      error: { message: "Inventory transaction is already reversed" },
    });
    mocks.requireHousehold.mockResolvedValue({
      supabase: client,
      current: { household_id: HOME_ID },
    });

    const result = await reverseInventoryTransaction(
      null,
      form({ groceryItemId, transactionId }),
    );

    expect(result).toEqual({
      ok: false,
      error: "That transaction was already reversed.",
    });
  });
});
