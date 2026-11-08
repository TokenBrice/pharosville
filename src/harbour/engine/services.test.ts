import { expect, expectTypeOf, it } from "vitest";
import type { MotionService } from "../ui/services";
import type { ServiceMap, Services } from "./services";

it("preserves native Map operations and optional late services", () => {
  const services: Services = new Map();
  expect(services).toBeInstanceOf(Map);
  expect(services.get("motion")).toBeUndefined();
  expectTypeOf(services.get("motion")).toEqualTypeOf<MotionService | undefined>();
  const readiness = { revision: 1, boats: 2, prepared: false };
  expect(services.set("readiness", readiness)).toBe(services);
  expect(services.get("readiness")).toBe(readiness);
  readiness.prepared = true;
  expect(services.get("readiness")?.prepared).toBe(true);
  expect(services.delete("readiness")).toBe(true);
  expect(services.get("readiness")).toBeUndefined();
  services.set("readiness", readiness).clear();
  expect(services.size).toBe(0);
});

it("rejects unknown keys and values outside the publisher contract at compile time", () => {
  const check = (services: Services) => {
    // @ts-expect-error Unknown service keys must not fall back to a string index signature.
    services.get("unknown-service");
    // @ts-expect-error Unknown registrations must also be rejected.
    services.set("unknown-service", {});
    // @ts-expect-error The motion publisher owns this value type.
    services.set("motion", 42);
    // @ts-expect-error A value for another valid key is still the wrong service.
    services.set("motion", {} as ServiceMap["readiness"]);
    // @ts-expect-error Late availability is expressed by get(), not invalid registrations.
    services.set("motion", undefined);
  };
  expectTypeOf(check).parameter(0).toEqualTypeOf<Services>();
});
