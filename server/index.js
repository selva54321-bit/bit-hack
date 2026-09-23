import express from 'express'
import cors from 'cors'
import { DatabaseSync } from 'node:sqlite'

const app = express()
const db = new DatabaseSync('business.db')
db.exec('PRAGMA foreign_keys = ON')
app.use(cors())
app.use(express.json())

db.exec(`
CREATE TABLE IF NOT EXISTS business (id INTEGER PRIMARY KEY, name TEXT, owner TEXT, phone TEXT, gstin TEXT, address TEXT);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE, category TEXT, unit TEXT DEFAULT 'piece', cost REAL DEFAULT 0, price REAL NOT NULL, stock INTEGER DEFAULT 0, reorder_level INTEGER DEFAULT 5, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, address TEXT, tag TEXT DEFAULT 'Regular', balance REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL NOT NULL, payment_mode TEXT NOT NULL, paid REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(customer_id) REFERENCES customers(id));
CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(product_id) REFERENCES products(id));
CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(product_id) REFERENCES products(id));
`)
if (!db.prepare('SELECT id FROM business').get()) {
  db.prepare('INSERT INTO business (name, owner, phone, gstin, address) VALUES (?, ?, ?, ?, ?)').run('Annapoorna Stores', 'Priya Nair', '+91 98765 43210', '33ABCDE1234F1Z5', '12 Market Road, Chennai')
  const add = db.prepare('INSERT INTO products (name, sku, category, unit, cost, price, stock, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  ;[['Ponni Rice 5kg','RIC-005','Grains','bag',275,325,18,8],['Aashirvaad Atta 5kg','ATT-005','Flour','bag',240,285,6,8],['Tata Salt 1kg','SAL-001','Essentials','pack',19,25,32,12],['Fortune Sunflower Oil 1L','OIL-001','Oil','bottle',120,145,4,6],['Britannia Good Day','BIS-100','Snacks','pack',20,30,24,10]].forEach(p => add.run(...p))
  const addCustomer = db.prepare('INSERT INTO customers (name, phone, address, tag, balance) VALUES (?, ?, ?, ?, ?)')
  ;[['Ravi Kumar','+91 98401 22334','T Nagar','Regular',350],['Meena Stores','+91 98840 99111','Mylapore','Wholesale',0],['Arjun S','+91 97910 55221','Adyar','Regular',125]].forEach(c => addCustomer.run(...c))
}

const rows = (sql, args = []) => db.prepare(sql).all(...args)
const transaction = (work) => {
  db.exec('BEGIN')
  try { const result = work(); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
}
app.get('/api/dashboard', (_req, res) => {
  const today = db.prepare("SELECT COALESCE(SUM(total),0) total, COUNT(*) orders FROM sales WHERE date(created_at) = date('now','localtime')").get()
  res.json({ ...today, products: db.prepare('SELECT COUNT(*) count FROM products').get().count, lowStock: rows('SELECT * FROM products WHERE stock <= reorder_level ORDER BY stock ASC'), credit: db.prepare('SELECT COALESCE(SUM(balance),0) total FROM customers').get().total, recentSales: rows(`SELECT s.*, c.name customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.created_at DESC LIMIT 6`), topProducts: rows(`SELECT p.name, COALESCE(SUM(si.quantity),0) sold FROM products p LEFT JOIN sale_items si ON si.product_id=p.id GROUP BY p.id ORDER BY sold DESC LIMIT 5`) })
})
app.get('/api/business', (_req,res) => res.json(db.prepare('SELECT * FROM business LIMIT 1').get()))
app.put('/api/business', (req,res) => { const b=req.body; db.prepare('UPDATE business SET name=?, owner=?, phone=?, gstin=?, address=? WHERE id=1').run(b.name,b.owner,b.phone,b.gstin,b.address); res.json({ok:true}) })
app.get('/api/products', (req,res) => { const q=`%${req.query.q || ''}%`; res.json(rows('SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? OR category LIKE ? ORDER BY name',[q,q,q])) })
app.post('/api/products', (req,res) => { const p=req.body; const result=db.prepare('INSERT INTO products (name,sku,category,unit,cost,price,stock,reorder_level) VALUES (?,?,?,?,?,?,?,?)').run(p.name,p.sku||null,p.category,p.unit||'piece',+p.cost||0,+p.price,+p.stock||0,+p.reorder_level||5); if (+p.stock) db.prepare('INSERT INTO stock_movements (product_id,quantity,reason) VALUES (?,?,?)').run(result.lastInsertRowid,+p.stock,'Opening stock'); res.json({id:result.lastInsertRowid}) })
app.patch('/api/products/:id/stock', (req,res) => { const delta=+req.body.quantity; const p=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id); if(!p || p.stock+delta<0) return res.status(400).json({error:'Insufficient stock'}); transaction(()=>{db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(delta,p.id); db.prepare('INSERT INTO stock_movements (product_id,quantity,reason) VALUES (?,?,?)').run(p.id,delta,req.body.reason||'Manual adjustment')}); res.json({ok:true}) })
app.get('/api/customers', (req,res) => { const q=`%${req.query.q||''}%`; res.json(rows('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR tag LIKE ? ORDER BY name',[q,q,q])) })
app.post('/api/customers', (req,res) => {const c=req.body; const r=db.prepare('INSERT INTO customers (name,phone,address,tag) VALUES (?,?,?,?)').run(c.name,c.phone||'',c.address||'',c.tag||'Regular');res.json({id:r.lastInsertRowid})})
app.get('/api/sales', (_req,res) => res.json(rows(`SELECT s.*,c.name customer_name,GROUP_CONCAT(p.name || ' ×' || si.quantity, ', ') items FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN sale_items si ON si.sale_id=s.id LEFT JOIN products p ON p.id=si.product_id GROUP BY s.id ORDER BY s.created_at DESC`)))
app.post('/api/sales', (req,res) => { const {customerId, paymentMode, paid, items}=req.body; if(!items?.length) return res.status(400).json({error:'Add at least one item'}); const createSale=()=>{let total=0; for(const i of items){const p=db.prepare('SELECT * FROM products WHERE id=?').get(i.productId);if(!p||p.stock<i.quantity) throw new Error(`Insufficient stock for ${p?.name||'product'}`);total+=p.price*i.quantity} const s=db.prepare('INSERT INTO sales (customer_id,total,payment_mode,paid) VALUES (?,?,?,?)').run(customerId||null,total,paymentMode||'Cash',+paid||0); for(const i of items){const p=db.prepare('SELECT * FROM products WHERE id=?').get(i.productId);db.prepare('INSERT INTO sale_items (sale_id,product_id,quantity,unit_price) VALUES (?,?,?,?)').run(s.lastInsertRowid,p.id,i.quantity,p.price);db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.quantity,p.id);db.prepare('INSERT INTO stock_movements (product_id,quantity,reason) VALUES (?,?,?)').run(p.id,-i.quantity,`Sale #${s.lastInsertRowid}`)} if(customerId && total>(+paid||0)) db.prepare('UPDATE customers SET balance=balance+? WHERE id=?').run(total-(+paid||0),customerId); return {id:s.lastInsertRowid,total}}; try {res.json(transaction(createSale))} catch(e){res.status(400).json({error:e.message})} })
app.listen(3001,()=>console.log('API running on http://localhost:3001'))
