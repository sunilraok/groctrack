import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthFeedback } from "@/app/auth/auth-form";
import { Feedback } from "@/app/dashboard/forms";

describe("form feedback rendering", () => {
  it("renders auth validation and backend failures as alerts", () => {
    const validation = renderToStaticMarkup(
      <AuthFeedback state={{ error: "Enter a valid email." }} />,
    );
    const backend = renderToStaticMarkup(
      <AuthFeedback state={{ error: "Unable to sign in with those credentials." }} />,
    );

    expect(validation).toContain('role="alert"');
    expect(validation).toContain("Enter a valid email.");
    expect(backend).toContain('role="alert"');
    expect(backend).toContain("Unable to sign in with those credentials.");
  });

  it("renders household action failures as alerts", () => {
    const html = renderToStaticMarkup(
      <Feedback state={{ ok: false, error: "write failed" }} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("write failed");
  });

  it("renders successful household feedback without an alert", () => {
    const html = renderToStaticMarkup(
      <Feedback state={{ ok: true, data: undefined }} />,
    );

    expect(html).toContain("Saved.");
    expect(html).not.toContain('role="alert"');
  });
});
