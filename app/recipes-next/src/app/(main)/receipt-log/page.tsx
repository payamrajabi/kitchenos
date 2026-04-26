import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type {
  ReceiptImportItemRow,
  ReceiptImportRow,
} from "@/types/database";
import { ReceiptLogList } from "@/components/receipt-log-list";

export const dynamic = "force-dynamic";

export default async function ReceiptLogPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid receipt-log-page is-empty">
        <p>
          Configure Supabase in <code>.env.local</code>.
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid receipt-log-page is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to see your receipt log.</p>
        </div>
      </section>
    );
  }

  const [importsRes, itemsRes] = await Promise.all([
    supabase
      .from("receipt_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("receipt_import_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (importsRes.error) {
    return (
      <section className="grid receipt-log-page is-empty">
        <p>{importsRes.error.message}</p>
      </section>
    );
  }

  const imports = (importsRes.data ?? []) as ReceiptImportRow[];
  const items = (itemsRes.data ?? []) as ReceiptImportItemRow[];

  if (!imports.length) {
    return (
      <section className="grid receipt-log-page is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            No receipts logged yet. Use the receipt button on the Inventory page
            to import one.
          </p>
        </div>
      </section>
    );
  }

  const itemsByImport = new Map<number, ReceiptImportItemRow[]>();
  for (const it of items) {
    const list = itemsByImport.get(it.import_id) ?? [];
    list.push(it);
    itemsByImport.set(it.import_id, list);
  }

  const groups = imports.map((imp) => ({
    receipt: imp,
    items: itemsByImport.get(imp.id) ?? [],
  }));

  return (
    <section className="grid receipt-log-page">
      <ReceiptLogList groups={groups} />
    </section>
  );
}
