import { describe, expect, it } from "vitest";
import {
  canRemoveMember,
  selectHousehold,
} from "./household-access";
import type { HouseholdMembership } from "@/types/database";

const memberships: HouseholdMembership[] = [
  {
    household_id: "11111111-1111-4111-8111-111111111111",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "owner",
    joined_at: "2026-01-01T00:00:00Z",
    households: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Home",
      created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  },
];

describe("household authorization", () => {
  it("does not select a household outside the authenticated membership set", () => {
    expect(
      selectHousehold(
        memberships,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toEqual(memberships[0]);
  });

  it("allows only owners to remove another member", () => {
    expect(
      canRemoveMember(
        memberships[0],
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    ).toBe(true);
    expect(canRemoveMember(memberships[0], memberships[0].user_id)).toBe(false);
    expect(
      canRemoveMember(
        { ...memberships[0], role: "member" },
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    ).toBe(false);
  });
});
