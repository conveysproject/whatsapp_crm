import { describe, expect, it } from "vitest";
import { buildSignUpBody, validateBusinessScreen, validateIdentityScreen } from "./signup-steps";

const ok = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", password: "longenough1" };
const biz = {
  companyName: " Acme ",
  companyWebsite: "www.acme.com",
  companyLocation: "Mumbai",
  industry: "Retail",
  subCategory: "E-commerce",
  revenue: "Less than $10K",
  termsAccepted: true,
};

describe("validateIdentityScreen", () => {
  it("accepts valid values", () => {
    expect(validateIdentityScreen(ok)).toEqual({});
  });
  it("requires names of 1-100 chars", () => {
    expect(validateIdentityScreen({ ...ok, firstName: "  " }).firstName).toBeTruthy();
    expect(validateIdentityScreen({ ...ok, lastName: "x".repeat(101) }).lastName).toBeTruthy();
  });
  it("checks email format", () => {
    expect(validateIdentityScreen({ ...ok, email: "nope" }).email).toBeTruthy();
  });
  it("uses the API wording for password length", () => {
    expect(validateIdentityScreen({ ...ok, password: "short" }).password).toBe("Use 8 to 128 characters.");
    expect(validateIdentityScreen({ ...ok, password: "x".repeat(129) }).password).toBe("Use 8 to 128 characters.");
  });
});

describe("validateBusinessScreen", () => {
  it("accepts a complete form", () => {
    expect(validateBusinessScreen(biz)).toEqual({});
  });
  it("reports each missing field with the business-details messages", () => {
    const e = validateBusinessScreen({ companyName: "", companyWebsite: "", companyLocation: "", industry: "", subCategory: "", revenue: "", termsAccepted: false });
    expect(e).toEqual({
      companyName: "Company name is required",
      companyWebsite: "Company website is required",
      companyLocation: "Company location is required",
      industry: "Please select your industry",
      subCategory: "Please select a category",
      revenue: "Please select annual revenue",
      termsAccepted: "You must accept the terms to continue",
    });
  });
});

describe("buildSignUpBody", () => {
  it("trims values, nests business, and omits the terms flag", () => {
    const body = buildSignUpBody({ ...ok, email: " ada@example.com ", firstName: " Ada " }, biz, null);
    expect(body).toEqual({
      email: "ada@example.com",
      password: "longenough1",
      firstName: "Ada",
      lastName: "Lovelace",
      business: {
        companyName: "Acme",
        companyWebsite: "www.acme.com",
        companyLocation: "Mumbai",
        industry: "Retail",
        subCategory: "E-commerce",
        revenue: "Less than $10K",
      },
    });
  });
  it("adds the Turnstile token when present", () => {
    expect(buildSignUpBody(ok, biz, "tok")["turnstileToken"]).toBe("tok");
  });
});
