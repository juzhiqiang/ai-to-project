import type { ScalarValue, UITable, UIComponentProps } from "./types";

export function DataTable({ component }: UIComponentProps<UITable>) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      {component.title ? <h3 className="border-b border-zinc-200 px-4 py-3 text-base font-semibold text-zinc-950">{component.title}</h3> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              {component.columns.map((column) => (
                <th className="border-b border-zinc-200 px-4 py-3 font-medium" key={column.key}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {component.rows.length > 0 ? (
              component.rows.map((row, rowIndex) => (
                <tr className="border-b border-zinc-100 last:border-0" key={rowIndex}>
                  {component.columns.map((column) => (
                    <td className="px-4 py-3 text-zinc-800" key={column.key}>
                      {formatValue(row[column.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={component.columns.length}>
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatValue(value: ScalarValue) {
  if (value === null) {
    return "无";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return String(value);
}
