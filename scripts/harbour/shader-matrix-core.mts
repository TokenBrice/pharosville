export interface ShaderVerdict { id: string; logs: string[]; draws: number }

export function matrixExitCode(rows: readonly ShaderVerdict[], realGpu: boolean): number {
  if (!realGpu) return 78;
  return rows.length > 0 && rows.every((row) => row.logs.length === 0 && row.draws > 0) ? 0 : 1;
}

export function formatShaderVerdicts(rows: readonly ShaderVerdict[]): string {
  return ["RESULT | RECIPE | DRAWS", ...rows.map((row) => `${row.logs.length === 0 && row.draws > 0 ? "PASS" : "FAIL"} | ${row.id} | ${row.draws}`),
    ...rows.filter((row) => row.logs.length > 0).map((row) => `\n--- ${row.id} ---\n${row.logs.join("\n")}`)].join("\n");
}
