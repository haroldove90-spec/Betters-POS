import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import escpos from "escpos";
import escposNetwork from "escpos-network";

// Initialize escpos network adapter
escpos.Network = escposNetwork;

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize SQLite Database
const db = new Database("pos.db", { verbose: console.log });

// Create Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    barcode TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total REAL NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sale_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

// Seed some initial products if empty
const count = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };
if (count.count === 0) {
  const insertProduct = db.prepare("INSERT INTO products (name, price, stock, barcode) VALUES (?, ?, ?, ?)");
  insertProduct.run("Impresora Térmica 80mm", 120.50, 50, "8412345678901");
  insertProduct.run("Lector de Código de Barras", 45.00, 100, "8412345678902");
  insertProduct.run("Cajón de Dinero RJ11", 60.00, 30, "8412345678903");
  insertProduct.run("Monitor Táctil 15.6\\\"", 250.00, 20, "8412345678904");
  insertProduct.run("Terminal POS All-in-One", 550.00, 15, "8412345678905");
  insertProduct.run("Rollo Papel Térmico 80mm", 2.50, 500, "8412345678906");
}

// API Routes
app.get("/api/products", (req, res) => {
  try {
    const products = db.prepare("SELECT * FROM products").all();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/api/sales", (req, res) => {
  const { total, items } = req.body;
  
  const insertSale = db.prepare("INSERT INTO sales (total) VALUES (?)");
  const insertDetail = db.prepare("INSERT INTO sale_details (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)");
  const updateStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

  const transaction = db.transaction((saleTotal, saleItems) => {
    const info = insertSale.run(saleTotal);
    const saleId = info.lastInsertRowid;

    for (const item of saleItems) {
      insertDetail.run(saleId, item.id, item.quantity, item.price);
      updateStock.run(item.quantity, item.id);
    }
    return saleId;
  });

  try {
    const saleId = transaction(total, items);
    res.json({ success: true, saleId });
  } catch (error) {
    console.error("Error processing sale:", error);
    res.status(500).json({ success: false, error: "Failed to process sale" });
  }
});

app.get("/api/sales", (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT s.id, s.total, s.date, COUNT(sd.id) as itemCount 
      FROM sales s 
      LEFT JOIN sale_details sd ON s.id = sd.sale_id 
      GROUP BY s.id 
      ORDER BY s.date DESC
    `).all();
    res.json(sales);
  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
});

app.get("/api/sales/:id", (req, res) => {
  try {
    const saleId = req.params.id;
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId) as any;
    
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const items = db.prepare(`
      SELECT p.name, sd.quantity, sd.price 
      FROM sale_details sd
      JOIN products p ON sd.product_id = p.id
      WHERE sd.sale_id = ?
    `).all(saleId);

    res.json({ ...sale, items });
  } catch (error) {
    console.error("Error fetching sale details:", error);
    res.status(500).json({ error: "Failed to fetch sale details" });
  }
});

// Function to print receipt
app.post("/api/print", (req, res) => {
  const { saleId, total, items } = req.body;
  
  // In a real scenario, you'd get the IP from config
  const printerIp = process.env.PRINTER_IP || '192.168.1.100';
  
  try {
    const device  = new escpos.Network(printerIp);
    const printer = new escpos.Printer(device);

    device.open((error) => {
      if (error) {
        console.error("Error connecting to printer:", error);
        return res.status(500).json({ success: false, error: "Printer connection failed" });
      }

      printer
        .font('a')
        .align('ct')
        .style('b')
        .size(2, 2)
        .text('BETTERS FABRICA')
        .text('DE TECNOLOGIA S.A.')
        .size(1, 1)
        .style('normal')
        .text('RUC: 20123456789')
        .text('Av. Tecnológica 123, Lima')
        .text('--------------------------------')
        .align('lt')
        .text(`Ticket: #${saleId.toString().padStart(6, '0')}`)
        .text(`Fecha: ${new Date().toLocaleString()}`)
        .text('--------------------------------')
        // @ts-ignore
        .tableCustom([
          { text:"Cant", align:"LEFT", width:0.15 },
          { text:"Producto", align:"LEFT", width:0.55 },
          { text:"Total", align:"RIGHT", width:0.30 }
        ]);

      items.forEach((item: any) => {
        // @ts-ignore
        printer.tableCustom([
          { text: item.quantity.toString(), align:"LEFT", width:0.15 },
          { text: item.name.substring(0, 15), align:"LEFT", width:0.55 },
          { text: `$${(item.price * item.quantity).toFixed(2)}`, align:"RIGHT", width:0.30 }
        ]);
      });

      printer
        .text('--------------------------------')
        .align('rt')
        .size(1, 1)
        .style('b')
        .text(`TOTAL: $${total.toFixed(2)}`)
        .style('normal')
        .align('ct')
        .text('--------------------------------')
        .text('¡Gracias por su compra!')
        .text('Vuelva pronto')
        .feed(3)
        .cut()
        .close();
        
      res.json({ success: true, message: "Printed successfully" });
    });
  } catch (error) {
    console.error("Printer error:", error);
    res.status(500).json({ success: false, error: "Printer error" });
  }
});

app.post("/api/drawer", (req, res) => {
  const printerIp = process.env.PRINTER_IP || '192.168.1.100';
  
  try {
    const device  = new escpos.Network(printerIp);
    const printer = new escpos.Printer(device);

    device.open((error) => {
      if (error) {
        console.error("Error connecting to printer:", error);
        return res.status(500).json({ success: false, error: "Printer connection failed" });
      }
      
      // Open cash drawer (pin 2)
      printer.cashdraw(2).close();
      res.json({ success: true, message: "Drawer opened" });
    });
  } catch (error) {
    console.error("Drawer error:", error);
    res.status(500).json({ success: false, error: "Drawer error" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
