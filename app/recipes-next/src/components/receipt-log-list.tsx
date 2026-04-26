import type {
  ReceiptImportItemRow,
  ReceiptImportItemStatus,
  ReceiptImportRow,
} from "@/types/database";

type Group = { receipt: ReceiptImportRow; items: ReceiptImportItemRow[] };

const STATUS_LABEL: Record<ReceiptImportItemStatus, string> = {
  applied: "Added to existing",
  created: "New ingredient",
  ignored: "Ignored",
  excluded: "Excluded",
};

const COLUMN_COUNT = 11;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function formatPrice(
  price: number | null,
  basis: string | null,
  basisAmount: number | null,
  basisUnit: string | null,
): string {
  if (price == null) return "—";
  const money = `$${price.toFixed(2)}`;
  if (basis === "weight") {
    if (basisAmount && basisUnit && basisAmount !== 1) {
      return `${money} per ${formatNumber(basisAmount)}${basisUnit}`;
    }
    if (basisUnit) return `${money}/${basisUnit}`;
    return `${money} by weight`;
  }
  if (basis === "unit") {
    return basisUnit && basisUnit !== "ea" ? `${money}/${basisUnit}` : `${money} each`;
  }
  return money;
}

function formatQty(qty: number | null, unit: string | null): string {
  if (qty == null) return "—";
  return unit ? `${formatNumber(qty)} ${unit}` : formatNumber(qty);
}

export function ReceiptLogList({ groups }: { groups: Group[] }) {
  return (
    <div className="receipt-log-table-wrap table-container">
      <table className="receipt-log-table ingredients-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Raw line</th>
            <th>Ingredient</th>
            <th>Brand</th>
            <th>Product</th>
            <th>Purchased</th>
            <th>Pack size</th>
            <th>Added to stock</th>
            <th>Price</th>
            <th>Confidence</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ receipt, items }) => (
            <ReceiptGroupRows
              key={receipt.id}
              receipt={receipt}
              items={items}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptGroupRows({
  receipt,
  items,
}: {
  receipt: ReceiptImportRow;
  items: ReceiptImportItemRow[];
}) {
  return (
    <>
      <tr className="receipt-log-divider">
        <td colSpan={COLUMN_COUNT}>
          <div className="receipt-log-divider-inner">
            <span className="receipt-log-divider-date">
              {formatDate(receipt.created_at)}
            </span>
            <span className="receipt-log-divider-meta">
              {receipt.item_count} item{receipt.item_count === 1 ? "" : "s"} ·{" "}
              {receipt.applied_count} applied · {receipt.excluded_count}{" "}
              excluded
            </span>
          </div>
        </td>
      </tr>
      {items.map((it) => (
        <tr
          key={it.id}
          className={`receipt-log-row receipt-log-row--${it.status}`}
        >
          <td>
            <span
              className={`receipt-log-status receipt-log-status--${it.status}`}
            >
              {STATUS_LABEL[it.status]}
            </span>
          </td>
          <td className="receipt-log-cell-raw">{it.raw_line}</td>
          <td>{it.ingredient_name ?? "—"}</td>
          <td>{it.product_brand ?? "—"}</td>
          <td>{it.product_name ?? "—"}</td>
          <td>{formatQty(it.purchase_quantity, it.purchase_unit)}</td>
          <td>
            {it.unit_size_amount != null
              ? `${formatNumber(it.unit_size_amount)}${
                  it.unit_size_unit ? ` ${it.unit_size_unit}` : ""
                }`
              : "—"}
          </td>
          <td>{formatQty(it.quantity_delta, it.unit)}</td>
          <td>
            {formatPrice(
              it.price,
              it.price_basis,
              it.price_basis_amount,
              it.price_basis_unit,
            )}
          </td>
          <td>{it.confidence ?? "—"}</td>
          <td className="receipt-log-cell-notes">
            {it.excluded_reason ? (
              <span className="receipt-log-notes-excluded">
                {it.excluded_reason}
              </span>
            ) : null}
            {it.review_flags && it.review_flags.length > 0 ? (
              <ul className="receipt-log-notes-flags">
                {it.review_flags.map((flag, idx) => (
                  <li key={`${it.id}-flag-${idx}`}>{flag}</li>
                ))}
              </ul>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}
