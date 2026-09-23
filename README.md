# Vyapaar Flow

A small-business management MVP for products, customers, sales, inventory, and business information.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Express API runs at `http://localhost:3001` and automatically creates `business.db` with demo data on first start.

## Included MVP flows

- Product catalog with price, SKU, category, stock level, and reorder threshold
- Customer directory with outstanding-credit ledger
- POS-style multi-line sale entry with Cash, UPI, Card, and Credit payments
- Atomic inventory deduction and stock movement recording for every sale
- Stock adjustment for restocks, damage, and manual correction
- Low-stock operational view, searchable products/customers, sales history, and editable business details
- Role-aware sign in: owner can manage business and inventory, while cashier can bill and manage customers
- Printable GST-ready sale invoices, reports, local smart-sale parsing, and reorder forecasting
- A live **Data Sheet** that consolidates product, customer, sale, and sale-cart line-item information; it refreshes automatically after records are saved and retains the manual-sale button

## Demo sign-in

- Owner: `owner@annapoorna.test` / `owner123`
- Cashier: `cashier@annapoorna.test` / `cashier123`

The database is owned by the Node API and uses Node's built-in SQLite module, so no native SQLite module compilation is required.
