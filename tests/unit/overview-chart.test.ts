import { describe, expect, it } from "vitest";
import { niceMax } from "../../src/app/app/[orgSlug]/registrations-chart";

describe("teto do gráfico de inscrições", () => {
  it("arredonda para cima, par e próximo do máximo", () => {
    expect([0, 1, 2, 3, 7, 9, 10, 13, 45, 150].map(niceMax)).toEqual([2, 2, 2, 4, 8, 10, 20, 20, 60, 200]);
  });
});
