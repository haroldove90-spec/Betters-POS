import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, CreditCard, Monitor, Printer, Keyboard, Box, Archive, History, LayoutGrid } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  barcode: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface Sale {
  id: number;
  total: number;
  date: string;
  itemCount: number;
}

export default function App() {
  const [view, setView] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (view === 'history') {
      fetchSales();
    }
  }, [view]);

  const fetchProducts = () => {
    setLoading(true);
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch products", err);
        setLoading(false);
      });
  };

  const fetchSales = () => {
    fetch('/api/sales')
      .then(res => res.json())
      .then(data => setSales(data))
      .catch(err => console.error("Failed to fetch sales", err));
  };

  const handleReprint = async (saleId: number) => {
    if (!window.confirm(`¿Reimprimir ticket #${saleId}?`)) return;

    try {
      // Fetch full sale details first
      const res = await fetch(`/api/sales/${saleId}`);
      if (!res.ok) throw new Error('Error fetching sale details');
      
      const sale = await res.json();
      
      await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          saleId: sale.id, 
          total: sale.total, 
          items: sale.items 
        })
      });
      
      alert(`Ticket #${saleId} enviado a imprimir`);
    } catch (error) {
      console.error("Reprint error:", error);
      alert("Error al reimprimir ticket");
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const clearCart = () => {
    if (window.confirm('¿Está seguro de limpiar el carrito?')) {
      setCart([]);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePayment = async () => {
    if (cart.length === 0) return;
    
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total, items: cart })
      });
      
      const data = await res.json();
      if (data.success) {
        // Print receipt
        await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ saleId: data.saleId, total, items: cart })
        });
        
        alert(`Venta completada con éxito. Ticket #${data.saleId}`);
        setCart([]);
        fetchProducts(); // Refresh stock
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert("Error al procesar el pago");
    }
  };

  const openDrawer = async () => {
    try {
      await fetch('/api/drawer', { method: 'POST' });
    } catch (error) {
      console.error("Drawer error:", error);
    }
  };

  // Helper to get an icon based on product name
  const getProductIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('impresora')) return <Printer className="w-12 h-12 mb-2" />;
    if (lower.includes('monitor') || lower.includes('terminal')) return <Monitor className="w-12 h-12 mb-2" />;
    if (lower.includes('lector')) return <Keyboard className="w-12 h-12 mb-2" />;
    if (lower.includes('cajón')) return <Archive className="w-12 h-12 mb-2" />;
    return <Box className="w-12 h-12 mb-2" />;
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden select-none">
      
      {/* Sidebar Navigation */}
      <div className="w-20 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-6 gap-6">
        <div className="p-3 bg-emerald-500/10 rounded-xl mb-4">
          <Box className="w-8 h-8 text-emerald-500" />
        </div>
        
        <button 
          onClick={() => setView('pos')}
          className={`p-4 rounded-xl transition-all ${view === 'pos' ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
        >
          <LayoutGrid className="w-8 h-8" />
        </button>

        <button 
          onClick={() => setView('history')}
          className={`p-4 rounded-xl transition-all ${view === 'history' ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
        >
          <History className="w-8 h-8" />
        </button>
      </div>

      {view === 'pos' ? (
        <>
          {/* Left Panel: Products Grid */}
          <div className="flex-1 p-4 flex flex-col h-full border-r border-slate-700">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-emerald-400 tracking-tight">BETTERS POS</h1>
              <p className="text-slate-400 text-lg">Terminal de Ventas</p>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-2xl text-slate-400 animate-pulse">Cargando productos...</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={product.stock <= 0}
                      className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 active:scale-95 min-h-[160px]
                        ${product.stock > 0 
                          ? 'bg-slate-800 border-slate-700 hover:border-emerald-500 hover:bg-slate-750 text-white' 
                          : 'bg-slate-800/50 border-red-900/50 text-slate-500 cursor-not-allowed'}`}
                    >
                      {getProductIcon(product.name)}
                      <span className="text-lg font-semibold text-center leading-tight mb-2">{product.name}</span>
                      <div className="flex items-center justify-between w-full mt-auto">
                        <span className="text-xl font-bold text-emerald-400">${product.price.toFixed(2)}</span>
                        <span className="text-sm bg-slate-700 px-2 py-1 rounded-lg">Stock: {product.stock}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Cart & Actions */}
          <div className="w-1/3 min-w-[400px] flex flex-col h-full bg-slate-950">
            
            {/* Cart Header */}
            <div className="p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <ShoppingCart className="w-8 h-8 text-emerald-400" />
                Carrito
              </h2>
              <span className="bg-emerald-500/20 text-emerald-400 px-4 py-1 rounded-full text-lg font-bold">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <ShoppingCart className="w-20 h-20 mb-4 opacity-20" />
                  <p className="text-xl">El carrito está vacío</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-slate-800 p-4 rounded-xl flex flex-col gap-3 border border-slate-700">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-lg leading-tight pr-4">{item.name}</span>
                      <span className="font-bold text-emerald-400 text-lg">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-4 bg-slate-900 rounded-lg p-1">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-12 h-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-md text-2xl font-bold active:scale-95 transition-transform"
                        >
                          -
                        </button>
                        <span className="text-xl font-bold w-8 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-12 h-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-md text-2xl font-bold active:scale-95 transition-transform"
                        >
                          +
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="w-12 h-12 flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg active:scale-95 transition-transform"
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals & Actions */}
            <div className="p-6 bg-slate-900 border-t border-slate-800">
              <div className="flex justify-between items-end mb-6">
                <span className="text-2xl text-slate-400">Total a Pagar</span>
                <span className="text-5xl font-bold text-white tracking-tight">${total.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <button 
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="py-5 rounded-xl font-bold text-xl bg-slate-800 text-red-400 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Trash2 className="w-6 h-6" />
                  Limpiar
                </button>
                <button 
                  onClick={openDrawer}
                  className="py-5 rounded-xl font-bold text-xl bg-slate-800 text-blue-400 hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Archive className="w-6 h-6" />
                  Cajón
                </button>
              </div>

              <button 
                onClick={handlePayment}
                disabled={cart.length === 0}
                className="w-full py-6 rounded-xl font-bold text-2xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
              >
                <CreditCard className="w-8 h-8" />
                PAGAR
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-emerald-400 tracking-tight">Historial de Ventas</h1>
            <p className="text-slate-400 text-lg">Registro de transacciones recientes</p>
          </div>

          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-4 font-medium">ID Ticket</th>
                  <th className="p-4 font-medium">Fecha</th>
                  <th className="p-4 font-medium">Items</th>
                  <th className="p-4 font-medium text-right">Total</th>
                  <th className="p-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sales.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="p-4 font-mono text-emerald-400">#{sale.id.toString().padStart(6, '0')}</td>
                    <td className="p-4 text-slate-300">{new Date(sale.date).toLocaleString()}</td>
                    <td className="p-4 text-slate-300">{sale.itemCount} productos</td>
                    <td className="p-4 text-right font-bold text-white">${sale.total.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleReprint(sale.id)}
                        className="text-emerald-400 hover:text-emerald-300 font-medium hover:underline"
                      >
                        Reimprimir
                      </button>
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No hay ventas registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
