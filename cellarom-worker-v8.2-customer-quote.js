/**
 * Cellarom Interactive Quote & Invoice System - COMPLETE RESTORATION
 * Restores ALL functionality from version 6 plus improvements:
 * - Quote editing functionality
 * - Professional Cellarom branding and design
 * - Draft quote management
 * - Enhanced UI/UX
 */

// User database (existing authentication system)
const USERS_CSV = `username,password,role,name,email
nick,cellarom2025,admin,Nick Rakhshani,info@cellarom.com
sarah,biotech123,user,Sarah Johnson,sarah@cellarom.com
admin,secure789,admin,Admin User,admin@cellarom.com
demo,demo123,user,Demo User,demo@cellarom.com`;

// Simple session store
const sessions = new Map();

// CSV Storage Keys for KV
const STORAGE_KEYS = {
  CUSTOMERS: 'cellarom_customers',
  PRODUCTS: 'cellarom_products', 
  QUOTES: 'cellarom_quotes',
  INVOICES: 'cellarom_invoices',
  COUNTERS: 'cellarom_counters'
};

// Default CSV Headers - UPDATED to include lead_time for quotes
const CSV_HEADERS = {
  CUSTOMERS: ['id', 'company', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'created_date'],
  PRODUCTS: ['id', 'sku', 'name', 'description', 'size', 'unit_price', 'category', 'created_date'],
  QUOTES: ['id', 'quote_number', 'customer_id', 'customer_company', 'contact_name', 'date', 'valid_until', 'subtotal', 'shipping', 'tax', 'total', 'status', 'lead_time', 'created_date', 'line_items'],
  INVOICES: ['id', 'invoice_number', 'quote_id', 'customer_id', 'customer_company', 'contact_name', 'invoice_date', 'due_date', 'po_number', 'subtotal', 'shipping', 'tax', 'total', 'status', 'created_date', 'line_items']
};

// Deploy to Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      // Route handling
      switch (true) {
        case path === '/login' && request.method === 'GET':
          return handleLoginPage();
        
        case path === '/login' && request.method === 'POST':
          return await handleLogin(request);
        
        case path === '/logout':
          return handleLogout(request);
        
        case path === '/' || path === '/dashboard':
          return await handleDashboard(request, env);
        
        case path === '/quotes':
          return await handleQuotesPage(request, env);
        
        case path === '/invoices':
          return await handleInvoicesPage(request, env);
        
        case path === '/quotes/new':
          return await handleNewQuotePage(request, env);
        
        // RESTORED: Quote editing functionality
        case path.startsWith('/quotes/edit/'):
          return await handleEditQuotePage(request, env);
        
        case path === '/invoices/new':
          return await handleNewInvoicePage(request, env);
        
        case path === '/customers':
          return await handleCustomersPage(request, env);
        
        case path === '/products':
          return await handleProductsPage(request, env);
        
        case path.startsWith('/quotes/view/'):
          return await handleViewQuote(request, env);

        case path.startsWith('/quotes/customer/'):
          return await handleCustomerQuotePage(request, env);

        case path.startsWith('/invoices/view/'):
          return await handleViewInvoice(request, env);
        
        // API Routes
        case path === '/api/quotes' && request.method === 'POST':
          return await handleCreateQuote(request, env);

        // RESTORED: Quote update API (accepts both PUT and POST)
        case path.startsWith('/api/quotes/') && (request.method === 'PUT' || request.method === 'POST'):
          return await handleUpdateQuote(request, env);
        
        case path === '/api/invoices' && request.method === 'POST':
          return await handleCreateInvoice(request, env);
        
        case path === '/api/customers' && request.method === 'POST':
          return await handleCreateCustomer(request, env);
        
        case path === '/api/products' && request.method === 'POST':
          return await handleCreateProduct(request, env);
        
        case path.startsWith('/api/convert-quote/'):
          return await handleConvertQuoteToInvoice(request, env);
        
        case path === '/api/customers' && request.method === 'GET':
          return await handleGetCustomers(request, env);
        
        case path === '/api/products' && request.method === 'GET':
          return await handleGetProducts(request, env);
        
        default:
          return await handleDashboard(request, env);
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// ===== AUTHENTICATION FUNCTIONS =====

function parseCSVUsers(csvData) {
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',');
  const users = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const user = {};
    headers.forEach((header, index) => {
      user[header] = values[index];
    });
    users.push(user);
  }
  
  return users;
}

function authenticateUser(username, password) {
  const users = parseCSVUsers(USERS_CSV);
  return users.find(user => user.username === username && user.password === password);
}

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getSessionFromCookie(request) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  
  const sessionMatch = cookie.match(/session=([^;]+)/);
  if (!sessionMatch) return null;
  
  const sessionId = sessionMatch[1];
  return sessions.get(sessionId);
}

function createSessionCookie(sessionId) {
  return `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`; // 24 hours
}

function requireAuth(request) {
  const session = getSessionFromCookie(request);
  
  if (!session) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/login' }
    });
  }
  
  // Check session expiry (24 hours)
  if (Date.now() - session.created > 86400000) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/login',
        'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
      }
    });
  }
  
  return session;
}

// ===== AUTHENTICATION HANDLERS =====

function handleLoginPage() {
  return new Response(getLoginHTML(), {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

async function handleLogin(request) {
  const formData = await request.formData();
  const username = formData.get('username');
  const password = formData.get('password');
  
  const user = authenticateUser(username, password);
  
  if (user) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      user: user,
      created: Date.now()
    });
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': createSessionCookie(sessionId)
      }
    });
  } else {
    return new Response(getLoginHTML(true), {
      status: 401,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

function handleLogout(request) {
  const session = getSessionFromCookie(request);
  if (session) {
    // Find and remove session
    for (const [key, value] of sessions.entries()) {
      if (value.user.username === session.user.username) {
        sessions.delete(key);
        break;
      }
    }
  }
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    }
  });
}

// ===== PAGE HANDLERS =====

async function handleDashboard(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const invoices = await getCSVData(env, STORAGE_KEYS.INVOICES);
    
    const recentQuotes = quotes.slice(-5).reverse();
    const recentInvoices = invoices.slice(-5).reverse();
    
    const html = getDashboardHTML(authResult.user, recentQuotes, recentInvoices);
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return new Response('Error loading dashboard', { status: 500 });
  }
}

async function handleQuotesPage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const html = getQuotesHTML(authResult.user, quotes.reverse());
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Quotes page error:', error);
    return new Response('Error loading quotes', { status: 500 });
  }
}

async function handleInvoicesPage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const invoices = await getCSVData(env, STORAGE_KEYS.INVOICES);
    const html = getInvoicesHTML(authResult.user, invoices.reverse());
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Invoices page error:', error);
    return new Response('Error loading invoices', { status: 500 });
  }
}

async function handleNewQuotePage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    
    // Generate quote number
    const currentYear = new Date().getFullYear();
    const counter = await getNextCounter(env, 'quote');
    const quoteNumber = `QUO-${currentYear}-${String(counter).padStart(3, '0')}`;
    
    const html = getNewQuoteHTML(authResult.user, customers, products, quoteNumber);
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('New quote page error:', error);
    return new Response('Error loading new quote page', { status: 500 });
  }
}

// RESTORED: Quote editing handler
async function handleEditQuotePage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const url = new URL(request.url);
    const quoteId = url.pathname.split('/').pop();
    
    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const quote = quotes.find(q => q.id === quoteId);
    
    if (!quote) {
      return new Response('Quote not found', { status: 404 });
    }
    
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    
    const html = getEditQuoteHTML(authResult.user, quote, customers, products);
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Edit quote page error:', error);
    return new Response('Error loading edit quote page', { status: 500 });
  }
}

async function handleNewInvoicePage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    
    // Generate invoice number
    const currentYear = new Date().getFullYear();
    const counter = await getNextCounter(env, 'invoice');
    const invoiceNumber = `INV-${currentYear}-${String(counter).padStart(3, '0')}`;
    
    const html = getNewInvoiceHTML(authResult.user, customers, products, invoiceNumber);
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('New invoice page error:', error);
    return new Response('Error loading new invoice page', { status: 500 });
  }
}

async function handleCustomersPage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    const html = getCustomersHTML(authResult.user, customers.reverse());
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Customers page error:', error);
    return new Response('Error loading customers', { status: 500 });
  }
}

async function handleProductsPage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    const html = getProductsHTML(authResult.user, products.reverse());
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Products page error:', error);
    return new Response('Error loading products', { status: 500 });
  }
}

async function handleViewQuote(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;

  try {
    const url = new URL(request.url);
    const quoteId = url.pathname.split('/').pop();

    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const quote = quotes.find(q => q.id === quoteId);

    if (!quote) {
      return new Response('Quote not found', { status: 404 });
    }

    const html = getViewQuoteHTML(authResult.user, quote);

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('View quote error:', error);
    return new Response('Error loading quote', { status: 500 });
  }
}

async function handleCustomerQuotePage(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;

  try {
    const url = new URL(request.url);
    const quoteId = url.pathname.split('/').pop();

    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const quote = quotes.find(q => q.id === quoteId);

    if (!quote) {
      return new Response('Quote not found', { status: 404 });
    }

    const html = getCustomerQuoteHTML(quote);

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Customer quote error:', error);
    return new Response('Error loading customer quote', { status: 500 });
  }
}

async function handleViewInvoice(request, env) {
  const authResult = requireAuth(request);
  if (authResult instanceof Response) return authResult;
  
  try {
    const url = new URL(request.url);
    const invoiceId = url.pathname.split('/').pop();
    
    const invoices = await getCSVData(env, STORAGE_KEYS.INVOICES);
    const invoice = invoices.find(i => i.id === invoiceId);
    
    if (!invoice) {
      return new Response('Invoice not found', { status: 404 });
    }
    
    const html = getViewInvoiceHTML(authResult.user, invoice);
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('View invoice error:', error);
    return new Response('Error loading invoice', { status: 500 });
  }
}

// ===== API HANDLERS =====

async function handleCreateQuote(request, env) {
  try {
    const formData = await request.formData();
    
    const quote = {
      id: `quote_${Date.now()}`,
      quote_number: formData.get('quote_number'),
      customer_id: formData.get('customer_id'),
      customer_company: formData.get('customer_company'),
      contact_name: formData.get('contact_name'),
      date: formData.get('date'),
      valid_until: formData.get('valid_until'),
      subtotal: formData.get('subtotal'),
      shipping: formData.get('shipping'),
      tax: formData.get('tax'),
      total: formData.get('total'),
      status: 'Draft',
      lead_time: formData.get('lead_time') || 'TBD',
      created_date: new Date().toISOString(),
      line_items: formData.get('line_items')
    };
    
    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    quotes.push(quote);
    await saveCSVData(env, STORAGE_KEYS.QUOTES, quotes, CSV_HEADERS.QUOTES);
    
    return new Response(null, {
      status: 302,
      headers: { 'Location': `/quotes/view/${quote.id}` }
    });
  } catch (error) {
    console.error('Error creating quote:', error);
    return new Response('Error creating quote', { status: 500 });
  }
}

// RESTORED: Quote update handler
async function handleUpdateQuote(request, env) {
  try {
    const url = new URL(request.url);
    const quoteId = url.pathname.split('/').pop();
    const formData = await request.formData();

    // Log the request for debugging
    console.log('Updating quote:', quoteId);
    console.log('Line items from form:', formData.get('line_items'));

    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const quoteIndex = quotes.findIndex(q => q.id === quoteId);

    if (quoteIndex === -1) {
      console.error('Quote not found:', quoteId);
      return new Response('Quote not found', { status: 404 });
    }

    // Update quote with form data
    const updatedQuote = {
      ...quotes[quoteIndex],
      customer_id: formData.get('customer_id'),
      customer_company: formData.get('customer_company'),
      contact_name: formData.get('contact_name'),
      date: formData.get('date'),
      valid_until: formData.get('valid_until'),
      subtotal: formData.get('subtotal'),
      shipping: formData.get('shipping'),
      tax: formData.get('tax'),
      total: formData.get('total'),
      status: formData.get('status') || quotes[quoteIndex].status,
      lead_time: formData.get('lead_time') || '',
      line_items: formData.get('line_items')
    };

    console.log('Updated quote data:', JSON.stringify(updatedQuote));

    quotes[quoteIndex] = updatedQuote;
    await saveCSVData(env, STORAGE_KEYS.QUOTES, quotes, CSV_HEADERS.QUOTES);

    console.log('Quote saved successfully');

    return new Response(null, {
      status: 302,
      headers: { 'Location': `/quotes/view/${quoteId}` }
    });
  } catch (error) {
    console.error('Error updating quote:', error);
    return new Response(`Error updating quote: ${error.message}`, { status: 500 });
  }
}

async function handleCreateInvoice(request, env) {
  try {
    const formData = await request.formData();
    
    const invoice = {
      id: `invoice_${Date.now()}`,
      invoice_number: formData.get('invoice_number'),
      quote_id: formData.get('quote_id') || '',
      customer_id: formData.get('customer_id'),
      customer_company: formData.get('customer_company'),
      contact_name: formData.get('contact_name'),
      invoice_date: formData.get('invoice_date'),
      due_date: formData.get('due_date'),
      po_number: formData.get('po_number') || '',
      subtotal: formData.get('subtotal'),
      shipping: formData.get('shipping'),
      tax: formData.get('tax'),
      total: formData.get('total'),
      status: 'Pending',
      created_date: new Date().toISOString(),
      line_items: formData.get('line_items')
    };
    
    const invoices = await getCSVData(env, STORAGE_KEYS.INVOICES);
    invoices.push(invoice);
    await saveCSVData(env, STORAGE_KEYS.INVOICES, invoices, CSV_HEADERS.INVOICES);
    
    return new Response(null, {
      status: 302,
      headers: { 'Location': `/invoices/view/${invoice.id}` }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return new Response('Error creating invoice', { status: 500 });
  }
}

async function handleCreateCustomer(request, env) {
  try {
    const formData = await request.formData();
    
    const customer = {
      id: `customer_${Date.now()}`,
      company: formData.get('company'),
      contact_name: formData.get('contact_name'),
      email: formData.get('email'),
      phone: formData.get('phone') || '',
      address: formData.get('address') || '',
      city: formData.get('city') || '',
      state: formData.get('state') || '',
      zip: formData.get('zip') || '',
      created_date: new Date().toISOString()
    };
    
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    customers.push(customer);
    await saveCSVData(env, STORAGE_KEYS.CUSTOMERS, customers, CSV_HEADERS.CUSTOMERS);
    
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/customers' }
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return new Response('Error creating customer', { status: 500 });
  }
}

async function handleCreateProduct(request, env) {
  try {
    const formData = await request.formData();
    
    const product = {
      id: `product_${Date.now()}`,
      sku: formData.get('sku'),
      name: formData.get('name'),
      description: formData.get('description') || '',
      size: formData.get('size') || '',
      unit_price: formData.get('unit_price'),
      category: formData.get('category'),
      created_date: new Date().toISOString()
    };
    
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    products.push(product);
    await saveCSVData(env, STORAGE_KEYS.PRODUCTS, products, CSV_HEADERS.PRODUCTS);
    
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/products' }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return new Response('Error creating product', { status: 500 });
  }
}

async function handleConvertQuoteToInvoice(request, env) {
  try {
    const url = new URL(request.url);
    const quoteId = url.pathname.split('/').pop();
    
    const quotes = await getCSVData(env, STORAGE_KEYS.QUOTES);
    const quote = quotes.find(q => q.id === quoteId);
    
    if (!quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }
    
    // Generate invoice number
    const currentYear = new Date().getFullYear();
    const counter = await getNextCounter(env, 'invoice');
    const invoiceNumber = `INV-${currentYear}-${String(counter).padStart(3, '0')}`;
    
    const invoice = {
      id: `invoice_${Date.now()}`,
      invoice_number: invoiceNumber,
      quote_id: quote.id,
      customer_id: quote.customer_id,
      customer_company: quote.customer_company,
      contact_name: quote.contact_name,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      po_number: '',
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      tax: quote.tax,
      total: quote.total,
      status: 'Pending',
      created_date: new Date().toISOString(),
      line_items: quote.line_items
    };
    
    const invoices = await getCSVData(env, STORAGE_KEYS.INVOICES);
    invoices.push(invoice);
    await saveCSVData(env, STORAGE_KEYS.INVOICES, invoices, CSV_HEADERS.INVOICES);
    
    return new Response(JSON.stringify({ 
      success: true, 
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error converting quote to invoice:', error);
    return new Response(JSON.stringify({ error: 'Error converting quote' }), { status: 500 });
  }
}

async function handleGetCustomers(request, env) {
  try {
    const customers = await getCSVData(env, STORAGE_KEYS.CUSTOMERS);
    return new Response(JSON.stringify(customers), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error fetching customers' }), { status: 500 });
  }
}

async function handleGetProducts(request, env) {
  try {
    const products = await getCSVData(env, STORAGE_KEYS.PRODUCTS);
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error fetching products' }), { status: 500 });
  }
}

// ===== UTILITY FUNCTIONS =====

async function getCSVData(env, key) {
  try {
    const data = await env.KV.get(key);
    if (!data) {
      return [];
    }
    
    const lines = data.trim().split('\n');
    if (lines.length <= 1) return [];
    
    const headers = lines[0].split(',');
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      result.push(obj);
    }
    
    return result;
  } catch (error) {
    console.error('Error reading CSV data:', error);
    return [];
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i-1] === ',')) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === ',')) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

async function saveCSVData(env, key, data, headers) {
  try {
    let csvContent = headers.join(',') + '\n';
    
    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        if (value.includes(',') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    });
    
    await env.KV.put(key, csvContent);
  } catch (error) {
    console.error('Error saving CSV data:', error);
    throw error;
  }
}

async function getNextCounter(env, type) {
  try {
    const counters = await env.KV.get(STORAGE_KEYS.COUNTERS);
    let counterData = {};
    
    if (counters) {
      const lines = counters.trim().split('\n');
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        const values = lines[1].split(',');
        headers.forEach((header, index) => {
          counterData[header] = parseInt(values[index]) || 0;
        });
      }
    }
    
    const currentCount = (counterData[type] || 0) + 1;
    counterData[type] = currentCount;
    
    // Save updated counters
    const headers = Object.keys(counterData);
    const values = headers.map(h => counterData[h]);
    const csvContent = headers.join(',') + '\n' + values.join(',') + '\n';
    
    await env.KV.put(STORAGE_KEYS.COUNTERS, csvContent);
    
    return currentCount;
  } catch (error) {
    console.error('Error managing counter:', error);
    return 1;
  }
}

// ===== HTML GENERATORS =====

function getCellaromLogoSVG() {
  return `
    <div class="logo-container">
      <svg class="cellarom-logo" viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#004F4F;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#007B7B;stop-opacity:1" />
          </linearGradient>
        </defs>
        <text x="10" y="32" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="url(#logoGradient)">Cellarom</text>
        <text x="10" y="45" font-family="Arial, sans-serif" font-size="10" fill="#666">Cell Therapy Solutions</text>
        <circle cx="180" cy="20" r="15" fill="#004F4F" opacity="0.8"/>
        <circle cx="175" cy="15" r="8" fill="#007B7B" opacity="0.6"/>
        <circle cx="185" cy="25" r="6" fill="#00A0A0" opacity="0.4"/>
      </svg>
    </div>
  `;
}

function getLoginHTML(error = false) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cellarom Login</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #004F4F 0%, #007B7B 50%, #00A0A0 100%);
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .login-container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                width: 100%;
                max-width: 400px;
                text-align: center;
            }
            
            .logo-container {
                margin-bottom: 30px;
            }
            
            .cellarom-logo {
                width: 200px;
                height: 50px;
            }
            
            .form-group {
                margin-bottom: 20px;
                text-align: left;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                color: #333;
                font-weight: 500;
            }
            
            .form-group input {
                width: 100%;
                padding: 12px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: #007B7B;
            }
            
            .btn {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                transition: transform 0.2s;
            }
            
            .btn:hover {
                transform: translateY(-2px);
            }
            
            .error {
                background: #fee;
                color: #c00;
                padding: 10px;
                border-radius: 5px;
                margin-bottom: 20px;
                text-align: center;
            }
            
            .demo-credentials {
                margin-top: 20px;
                padding: 15px;
                background: #f9f9f9;
                border-radius: 8px;
                font-size: 0.9rem;
                text-align: left;
            }
            
            .demo-credentials h4 {
                margin-bottom: 10px;
                color: #333;
            }
            
            .demo-credentials p {
                margin-bottom: 5px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            ${getCellaromLogoSVG()}
            
            ${error ? '<div class="error">Invalid username or password</div>' : ''}
            
            <form method="POST" action="/login">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit" class="btn">Login</button>
            </form>
            
            <div class="demo-credentials">
                <h4>Demo Credentials:</h4>
                <p><strong>Admin:</strong> nick / cellarom2025</p>
                <p><strong>User:</strong> demo / demo123</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function getDashboardHTML(user, recentQuotes, recentInvoices) {
  const quotesHTML = recentQuotes.map(quote => `
    <div class="list-item">
        <div class="item-header">
            <h4><a href="/quotes/view/${quote.id}">${quote.quote_number}</a></h4>
            <span class="status status-${quote.status.toLowerCase()}">${quote.status}</span>
        </div>
        <p><strong>Customer:</strong> ${quote.customer_company}</p>
        <p><strong>Amount:</strong> $${parseFloat(quote.total).toFixed(2)}</p>
        <p><strong>Date:</strong> ${quote.date}</p>
    </div>
  `).join('');

  const invoicesHTML = recentInvoices.map(invoice => `
    <div class="list-item">
        <div class="item-header">
            <h4><a href="/invoices/view/${invoice.id}">${invoice.invoice_number}</a></h4>
            <span class="status status-${invoice.status.toLowerCase()}">${invoice.status}</span>
        </div>
        <p><strong>Customer:</strong> ${invoice.customer_company}</p>
        <p><strong>Amount:</strong> $${parseFloat(invoice.total).toFixed(2)}</p>
        <p><strong>Date:</strong> ${invoice.invoice_date}</p>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - Cellarom</title>
        ${getCommonStyles()}
    </head>
    <body>
        ${getNavigation(user, 'dashboard')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Dashboard</h1>
                        <p>Welcome back, ${user.name}</p>
                    </div>
                </div>
            </div>
            
            <div class="dashboard-grid">
                <div class="dashboard-card">
                    <div class="card-header">
                        <h2>Recent Quotes</h2>
                        <a href="/quotes/new" class="btn btn-primary">New Quote</a>
                    </div>
                    <div class="card-content">
                        ${quotesHTML || '<p class="empty-state">No recent quotes</p>'}
                    </div>
                </div>
                
                <div class="dashboard-card">
                    <div class="card-header">
                        <h2>Recent Invoices</h2>
                        <a href="/invoices/new" class="btn btn-primary">New Invoice</a>
                    </div>
                    <div class="card-content">
                        ${invoicesHTML || '<p class="empty-state">No recent invoices</p>'}
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

function getQuotesHTML(user, quotes) {
  const quotesHTML = quotes.map(quote => `
    <tr>
        <td><a href="/quotes/view/${quote.id}" class="quote-link">${quote.quote_number}</a></td>
        <td>${quote.customer_company}</td>
        <td>${quote.contact_name}</td>
        <td>${quote.date}</td>
        <td>${quote.valid_until}</td>
        <td>$${parseFloat(quote.total).toFixed(2)}</td>
        <td><span class="status status-${quote.status.toLowerCase()}">${quote.status}</span></td>
        <td>
            <div class="action-buttons">
                <a href="/quotes/view/${quote.id}" class="btn btn-sm">View</a>
                <a href="/quotes/edit/${quote.id}" class="btn btn-sm btn-warning">Edit</a>
            </div>
        </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quotes - Cellarom</title>
        ${getCommonStyles()}
    </head>
    <body>
        ${getNavigation(user, 'quotes')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Quotes</h1>
                    </div>
                </div>
                <a href="/quotes/new" class="btn btn-primary">New Quote</a>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Quote #</th>
                            <th>Customer</th>
                            <th>Contact</th>
                            <th>Date</th>
                            <th>Valid Until</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quotesHTML || '<tr><td colspan="8" class="empty-state">No quotes found</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
  `;
}

function getInvoicesHTML(user, invoices) {
  const invoicesHTML = invoices.map(invoice => `
    <tr>
        <td><a href="/invoices/view/${invoice.id}" class="invoice-link">${invoice.invoice_number}</a></td>
        <td>${invoice.customer_company}</td>
        <td>${invoice.contact_name}</td>
        <td>${invoice.invoice_date}</td>
        <td>${invoice.due_date}</td>
        <td>$${parseFloat(invoice.total).toFixed(2)}</td>
        <td><span class="status status-${invoice.status.toLowerCase()}">${invoice.status}</span></td>
        <td>
            <div class="action-buttons">
                <a href="/invoices/view/${invoice.id}" class="btn btn-sm">View</a>
            </div>
        </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoices - Cellarom</title>
        ${getCommonStyles()}
    </head>
    <body>
        ${getNavigation(user, 'invoices')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Invoices</h1>
                    </div>
                </div>
                <a href="/invoices/new" class="btn btn-primary">New Invoice</a>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Invoice #</th>
                            <th>Customer</th>
                            <th>Contact</th>
                            <th>Invoice Date</th>
                            <th>Due Date</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoicesHTML || '<tr><td colspan="8" class="empty-state">No invoices found</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
  `;
}

function getNewQuoteHTML(user, customers, products, quoteNumber) {
  const customersOptions = customers.map(customer => 
    `<option value="${customer.id}" data-company="${customer.company}" data-contact="${customer.contact_name}">${customer.company} - ${customer.contact_name}</option>`
  ).join('');

  const productsData = JSON.stringify(products);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Quote - Cellarom</title>
        ${getCommonStyles()}
        ${getFormStyles()}
    </head>
    <body>
        ${getNavigation(user, 'quotes')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>New Quote</h1>
                    </div>
                </div>
                <a href="/quotes" class="btn btn-secondary">Back to Quotes</a>
            </div>
            
            <form method="POST" action="/api/quotes" id="quoteForm">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="quote_number">Quote Number</label>
                        <input type="text" id="quote_number" name="quote_number" value="${quoteNumber}" readonly>
                    </div>
                    
                    <div class="form-group">
                        <label for="date">Quote Date</label>
                        <input type="date" id="date" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="valid_until">Valid Until</label>
                        <input type="date" id="valid_until" name="valid_until" value="${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="lead_time">Lead Time</label>
                        <input type="text" id="lead_time" name="lead_time" placeholder="e.g., 2-3 weeks">
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Customer Information</h3>
                    <div class="form-group">
                        <label for="customer_id">Select Customer</label>
                        <select id="customer_id" name="customer_id" required onchange="updateCustomerInfo()">
                            <option value="">Select a customer</option>
                            ${customersOptions}
                        </select>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="customer_company">Company</label>
                            <input type="text" id="customer_company" name="customer_company" readonly>
                        </div>
                        <div class="form-group">
                            <label for="contact_name">Contact Name</label>
                            <input type="text" id="contact_name" name="contact_name" readonly>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Line Items</h3>
                    <button type="button" class="add-line-btn" onclick="addLineItem()">Add Line Item</button>
                    
                    <table class="line-items-table" id="lineItemsTable">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="lineItemsBody">
                            <!-- Line items will be added here -->
                        </tbody>
                    </table>
                </div>
                
                <div class="totals-section">
                    <div class="totals-grid">
                        <label for="subtotal">Subtotal:</label>
                        <input type="number" id="subtotal" name="subtotal" step="0.01" readonly>
                        
                        <label for="shipping">Shipping:</label>
                        <input type="number" id="shipping" name="shipping" step="0.01" value="0.00" onchange="calculateTotal()">
                        
                        <label for="tax">Tax:</label>
                        <input type="number" id="tax" name="tax" step="0.01" value="0.00" onchange="calculateTotal()">
                        
                        <label for="total">Total:</label>
                        <input type="number" id="total" name="total" step="0.01" readonly class="total-amount">
                    </div>
                </div>
                
                <input type="hidden" id="line_items" name="line_items">
                
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Create Quote</button>
                    <a href="/quotes" class="btn btn-secondary">Cancel</a>
                </div>
            </form>
        </div>
        
        ${getQuoteFormScript(productsData)}
    </body>
    </html>
  `;
}

// RESTORED: Edit quote HTML generator
function getEditQuoteHTML(user, quote, customers, products) {
  const customersOptions = customers.map(customer => {
    const selected = customer.id === quote.customer_id ? 'selected' : '';
    return `<option value="${customer.id}" data-company="${customer.company}" data-contact="${customer.contact_name}" ${selected}>${customer.company} - ${customer.contact_name}</option>`;
  }).join('');

  const productsData = JSON.stringify(products);
  
  // Parse existing line items
  let existingLineItems = [];
  try {
    existingLineItems = JSON.parse(quote.line_items || '[]');
  } catch (e) {
    existingLineItems = [];
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Edit Quote ${quote.quote_number} - Cellarom</title>
        ${getCommonStyles()}
        ${getFormStyles()}
    </head>
    <body>
        ${getNavigation(user, 'quotes')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Edit Quote ${quote.quote_number}</h1>
                        <span class="status status-${quote.status.toLowerCase()}">${quote.status}</span>
                    </div>
                </div>
                <div class="action-buttons">
                    <a href="/quotes/view/${quote.id}" class="btn btn-secondary">View Quote</a>
                    <a href="/quotes" class="btn btn-secondary">Back to Quotes</a>
                </div>
            </div>
            
            <form method="POST" action="/api/quotes/${quote.id}" id="quoteForm">
                <input type="hidden" name="_method" value="PUT">
                
                <div class="form-grid">
                    <div class="form-group">
                        <label for="quote_number">Quote Number</label>
                        <input type="text" id="quote_number" name="quote_number" value="${quote.quote_number}" readonly>
                    </div>
                    
                    <div class="form-group">
                        <label for="date">Quote Date</label>
                        <input type="date" id="date" name="date" value="${quote.date}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="valid_until">Valid Until</label>
                        <input type="date" id="valid_until" name="valid_until" value="${quote.valid_until}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="lead_time">Lead Time</label>
                        <input type="text" id="lead_time" name="lead_time" value="${quote.lead_time || ''}" placeholder="e.g., 2-3 weeks">
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Quote Status</h3>
                    <div class="form-group">
                        <label for="status">Status</label>
                        <select id="status" name="status">
                            <option value="Draft" ${quote.status === 'Draft' ? 'selected' : ''}>Draft</option>
                            <option value="Pending" ${quote.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Approved" ${quote.status === 'Approved' ? 'selected' : ''}>Approved</option>
                            <option value="Rejected" ${quote.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Customer Information</h3>
                    <div class="form-group">
                        <label for="customer_id">Select Customer</label>
                        <select id="customer_id" name="customer_id" required onchange="updateCustomerInfo()">
                            <option value="">Select a customer</option>
                            ${customersOptions}
                        </select>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="customer_company">Company</label>
                            <input type="text" id="customer_company" name="customer_company" value="${quote.customer_company}" readonly>
                        </div>
                        <div class="form-group">
                            <label for="contact_name">Contact Name</label>
                            <input type="text" id="contact_name" name="contact_name" value="${quote.contact_name}" readonly>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Line Items</h3>
                    <button type="button" class="add-line-btn" onclick="addLineItem()">Add Line Item</button>
                    
                    <table class="line-items-table" id="lineItemsTable">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="lineItemsBody">
                            <!-- Line items will be loaded here -->
                        </tbody>
                    </table>
                </div>
                
                <div class="totals-section">
                    <div class="totals-grid">
                        <label for="subtotal">Subtotal:</label>
                        <input type="number" id="subtotal" name="subtotal" step="0.01" value="${quote.subtotal}" readonly>
                        
                        <label for="shipping">Shipping:</label>
                        <input type="number" id="shipping" name="shipping" step="0.01" value="${quote.shipping}" onchange="calculateTotal()">
                        
                        <label for="tax">Tax:</label>
                        <input type="number" id="tax" name="tax" step="0.01" value="${quote.tax}" onchange="calculateTotal()">
                        
                        <label for="total">Total:</label>
                        <input type="number" id="total" name="total" step="0.01" value="${quote.total}" readonly class="total-amount">
                    </div>
                </div>
                
                <input type="hidden" id="line_items" name="line_items">
                
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Update Quote</button>
                    <a href="/quotes/view/${quote.id}" class="btn btn-secondary">Cancel</a>
                </div>
            </form>
        </div>
        
        ${getEditQuoteFormScript(productsData, JSON.stringify(existingLineItems))}
    </body>
    </html>
  `;
}

function getNewInvoiceHTML(user, customers, products, invoiceNumber) {
  const customersOptions = customers.map(customer => 
    `<option value="${customer.id}" data-company="${customer.company}" data-contact="${customer.contact_name}">${customer.company} - ${customer.contact_name}</option>`
  ).join('');

  const productsData = JSON.stringify(products);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Invoice - Cellarom</title>
        ${getCommonStyles()}
        ${getFormStyles()}
    </head>
    <body>
        ${getNavigation(user, 'invoices')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>New Invoice</h1>
                    </div>
                </div>
                <a href="/invoices" class="btn btn-secondary">Back to Invoices</a>
            </div>
            
            <form method="POST" action="/api/invoices" id="invoiceForm">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="invoice_number">Invoice Number</label>
                        <input type="text" id="invoice_number" name="invoice_number" value="${invoiceNumber}" readonly>
                    </div>
                    
                    <div class="form-group">
                        <label for="invoice_date">Invoice Date</label>
                        <input type="date" id="invoice_date" name="invoice_date" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="due_date">Due Date</label>
                        <input type="date" id="due_date" name="due_date" value="${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="po_number">PO Number</label>
                        <input type="text" id="po_number" name="po_number">
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Customer Information</h3>
                    <div class="form-group">
                        <label for="customer_id">Select Customer</label>
                        <select id="customer_id" name="customer_id" required onchange="updateCustomerInfo()">
                            <option value="">Select a customer</option>
                            ${customersOptions}
                        </select>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="customer_company">Company</label>
                            <input type="text" id="customer_company" name="customer_company" readonly>
                        </div>
                        <div class="form-group">
                            <label for="contact_name">Contact Name</label>
                            <input type="text" id="contact_name" name="contact_name" readonly>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Line Items</h3>
                    <button type="button" class="add-line-btn" onclick="addLineItem()">Add Line Item</button>
                    
                    <table class="line-items-table" id="lineItemsTable">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Description</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="lineItemsBody">
                            <!-- Line items will be added here -->
                        </tbody>
                    </table>
                </div>
                
                <div class="totals-section">
                    <div class="totals-grid">
                        <label for="subtotal">Subtotal:</label>
                        <input type="number" id="subtotal" name="subtotal" step="0.01" readonly>
                        
                        <label for="shipping">Shipping:</label>
                        <input type="number" id="shipping" name="shipping" step="0.01" value="0.00" onchange="calculateTotal()">
                        
                        <label for="tax">Tax:</label>
                        <input type="number" id="tax" name="tax" step="0.01" value="0.00" onchange="calculateTotal()">
                        
                        <label for="total">Total:</label>
                        <input type="number" id="total" name="total" step="0.01" readonly class="total-amount">
                    </div>
                </div>
                
                <input type="hidden" id="line_items" name="line_items">
                
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Create Invoice</button>
                    <a href="/invoices" class="btn btn-secondary">Cancel</a>
                </div>
            </form>
        </div>
        
        ${getQuoteFormScript(productsData)}
    </body>
    </html>
  `;
}

function getCustomersHTML(user, customers) {
  const customersHTML = customers.map(customer => `
    <tr>
        <td>${customer.company}</td>
        <td>${customer.contact_name}</td>
        <td>${customer.email}</td>
        <td>${customer.phone}</td>
        <td>${customer.city}, ${customer.state}</td>
        <td>${customer.created_date ? new Date(customer.created_date).toLocaleDateString() : ''}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Customers - Cellarom</title>
        ${getCommonStyles()}
        ${getModalStyles()}
    </head>
    <body>
        ${getNavigation(user, 'customers')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Customers</h1>
                    </div>
                </div>
                <button onclick="showAddCustomerModal()" class="btn btn-primary">New Customer</button>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Company</th>
                            <th>Contact Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Location</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customersHTML || '<tr><td colspan="6" class="empty-state">No customers found</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Add Customer Modal -->
        <div id="addCustomerModal" class="modal">
            <div class="modal-content">
                <h2>Add New Customer</h2>
                <form method="POST" action="/api/customers" id="customerForm">
                    <div class="form-group">
                        <label for="company">Company Name *</label>
                        <input type="text" id="company" name="company" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="contact_name">Contact Name *</label>
                        <input type="text" id="contact_name" name="contact_name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="email">Email *</label>
                        <input type="email" id="email" name="email" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="phone">Phone</label>
                        <input type="tel" id="phone" name="phone">
                    </div>
                    
                    <div class="form-group">
                        <label for="address">Address</label>
                        <input type="text" id="address" name="address">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="city">City</label>
                            <input type="text" id="city" name="city">
                        </div>
                        <div class="form-group">
                            <label for="state">State</label>
                            <input type="text" id="state" name="state">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="zip">ZIP Code</label>
                        <input type="text" id="zip" name="zip">
                    </div>
                    
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary">Add Customer</button>
                        <button type="button" onclick="hideAddCustomerModal()" class="btn btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        ${getModalScript()}
    </body>
    </html>
  `;
}

function getProductsHTML(user, products) {
  const productsHTML = products.map(product => `
    <tr>
        <td>${product.sku}</td>
        <td>${product.name}</td>
        <td>${product.description}</td>
        <td>${product.size}</td>
        <td>$${parseFloat(product.unit_price).toFixed(2)}</td>
        <td>${product.category}</td>
        <td>${product.created_date ? new Date(product.created_date).toLocaleDateString() : ''}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Products - Cellarom</title>
        ${getCommonStyles()}
        ${getModalStyles()}
    </head>
    <body>
        ${getNavigation(user, 'products')}
        
        <div class="container">
            <div class="page-header">
                <div class="header-content">
                    ${getCellaromLogoSVG()}
                    <div class="header-text">
                        <h1>Products</h1>
                    </div>
                </div>
                <button onclick="showAddProductModal()" class="btn btn-primary">New Product</button>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Name</th>
                            <th>Description</th>
                            <th>Size</th>
                            <th>Unit Price</th>
                            <th>Category</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productsHTML || '<tr><td colspan="7" class="empty-state">No products found</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Add Product Modal -->
        <div id="addProductModal" class="modal">
            <div class="modal-content">
                <h2>Add New Product</h2>
                <form method="POST" action="/api/products" id="productForm">
                    <div class="form-group">
                        <label for="sku">SKU *</label>
                        <input type="text" id="sku" name="sku" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="name">Product Name *</label>
                        <input type="text" id="name" name="name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea id="description" name="description" rows="3"></textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="size">Size</label>
                            <input type="text" id="size" name="size" placeholder="e.g., 500 mL">
                        </div>
                        <div class="form-group">
                            <label for="unit_price">Unit Price</label>
                            <input type="number" id="unit_price" name="unit_price" step="0.01" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="category">Category</label>
                        <select id="category" name="category" required>
                            <option value="">Select Category</option>
                            <option value="NK Cell Media">NK Cell Media</option>
                            <option value="T Cell Media">T Cell Media</option>
                            <option value="MSC Media">MSC Media</option>
                            <option value="Reagents">Reagents</option>
                            <option value="Bioreactors">Bioreactors</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary">Add Product</button>
                        <button type="button" onclick="hideAddProductModal()" class="btn btn-secondary">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
        
        ${getModalScript('Product')}
    </body>
    </html>
  `;
}

function getViewQuoteHTML(user, quote) {
  let lineItems = [];
  try {
    lineItems = JSON.parse(quote.line_items || '[]');
  } catch (e) {
    lineItems = [];
  }

  const lineItemsHTML = lineItems.map(item => `
    <tr>
        <td>${item.product_name || 'N/A'}</td>
        <td>${item.description || ''}</td>
        <td>${item.quantity || 0}</td>
        <td>$${parseFloat(item.unit_price || 0).toFixed(2)}</td>
        <td>${item.total || '$0.00'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quote ${quote.quote_number} - Cellarom</title>
        ${getCommonStyles()}
        ${getViewStyles()}
    </head>
    <body>
        ${getNavigation(user, 'quotes')}
        
        <div class="container">
            <div class="quote-header">
                <div class="quote-info">
                    ${getCellaromLogoSVG()}
                    <div class="quote-details">
                        <h1>Quote ${quote.quote_number}</h1>
                        <p><strong>Status:</strong> <span class="status status-${quote.status.toLowerCase()}">${quote.status}</span></p>
                        <p><strong>Date:</strong> ${quote.date}</p>
                        <p><strong>Valid Until:</strong> ${quote.valid_until}</p>
                        ${quote.lead_time ? `<p><strong>Lead Time:</strong> ${quote.lead_time}</p>` : ''}
                    </div>
                </div>
                <div class="quote-actions">
                    <a href="/quotes" class="btn btn-secondary">Back to Quotes</a>
                    <a href="/quotes/edit/${quote.id}" class="btn btn-warning">Edit Quote</a>
                    <a href="/quotes/customer/${quote.id}" class="btn btn-success" target="_blank">Customer View (PDF)</a>
                    <button onclick="convertToInvoice('${quote.id}')" class="btn btn-primary">Convert to Invoice</button>
                </div>
            </div>
            
            <div id="convertMessage" class="convert-message">
                Quote converted to invoice successfully! <a href="#" id="invoiceLink">View Invoice</a>
            </div>
            
            <div class="info-grid">
                <div class="info-section">
                    <h3>Customer Information</h3>
                    <p><strong>Company:</strong> ${quote.customer_company}</p>
                    <p><strong>Contact:</strong> ${quote.contact_name}</p>
                </div>
                <div class="info-section">
                    <h3>Quote Details</h3>
                    <p><strong>Quote Number:</strong> ${quote.quote_number}</p>
                    <p><strong>Date:</strong> ${quote.date}</p>
                    <p><strong>Valid Until:</strong> ${quote.valid_until}</p>
                    ${quote.lead_time ? `<p><strong>Lead Time:</strong> ${quote.lead_time}</p>` : ''}
                </div>
            </div>
            
            <div class="line-items-section">
                <h3>Line Items</h3>
                <table class="line-items-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHTML || '<tr><td colspan="5">No line items</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div class="totals-section">
                <div class="totals-grid">
                    <label>Subtotal:</label>
                    <div class="amount">$${parseFloat(quote.subtotal || 0).toFixed(2)}</div>
                    
                    <label>Shipping:</label>
                    <div class="amount">$${parseFloat(quote.shipping || 0).toFixed(2)}</div>
                    
                    <label>Tax:</label>
                    <div class="amount">$${parseFloat(quote.tax || 0).toFixed(2)}</div>
                    
                    <label>Total:</label>
                    <div class="amount total-amount">$${parseFloat(quote.total || 0).toFixed(2)}</div>
                </div>
            </div>
            
            <div class="pdf-section">
                <h3>Document Actions</h3>
                <p>Generate and download professional PDF documents for this quote.</p>
                <button onclick="generatePDF('quote', '${quote.id}')" class="btn-pdf">Download as PDF</button>
                <small style="color: #666;">PDF will include all quote details and line items in a professional format.</small>
            </div>
        </div>
        
        ${getViewQuoteScript()}
    </body>
    </html>
  `;
}

// Customer-facing quote view - Clean, print-friendly, no interactive elements
function getCustomerQuoteHTML(quote) {
  let lineItems = [];
  try {
    lineItems = JSON.parse(quote.line_items || '[]');
  } catch (e) {
    lineItems = [];
  }

  const lineItemsHTML = lineItems.map(item => `
    <tr>
        <td>${item.product_name || 'N/A'}</td>
        <td>${item.description || ''}</td>
        <td style="text-align: center;">${item.quantity || 0}</td>
        <td style="text-align: right;">$${parseFloat(item.unit_price || 0).toFixed(2)}</td>
        <td style="text-align: right;">${item.total || '$0.00'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quote ${quote.quote_number} - Cellarom</title>
        ${getCustomerQuoteStyles()}
    </head>
    <body>
        <div class="customer-quote-container">
            <!-- Header with Logo -->
            <div class="customer-header">
                ${getCellaromLogoSVG()}
                <div class="company-info">
                    <h3>Cellarom</h3>
                    <p>Premium Wine Storage Solutions</p>
                    <p>Email: info@cellarom.com</p>
                </div>
            </div>

            <!-- Quote Title -->
            <div class="quote-title">
                <h1>QUOTATION</h1>
                <div class="quote-number">Quote #${quote.quote_number}</div>
            </div>

            <!-- Quote Info and Customer Info Grid -->
            <div class="info-grid">
                <div class="info-box">
                    <h3>Quote Information</h3>
                    <p><strong>Quote Date:</strong> ${quote.date}</p>
                    <p><strong>Valid Until:</strong> <span class="highlight">${quote.valid_until}</span></p>
                    ${quote.lead_time ? `<p><strong>Lead Time:</strong> ${quote.lead_time}</p>` : ''}
                </div>
                <div class="info-box">
                    <h3>Customer Information</h3>
                    <p><strong>Company:</strong> ${quote.customer_company}</p>
                    <p><strong>Contact:</strong> ${quote.contact_name}</p>
                </div>
            </div>

            <!-- Line Items Table -->
            <div class="line-items-section">
                <h3>Items</h3>
                <table class="customer-table">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Product</th>
                            <th style="text-align: left;">Description</th>
                            <th style="text-align: center;">Quantity</th>
                            <th style="text-align: right;">Unit Price</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHTML || '<tr><td colspan="5" style="text-align: center;">No line items</td></tr>'}
                    </tbody>
                </table>
            </div>

            <!-- Totals Section -->
            <div class="totals-section">
                <div class="totals-row">
                    <span>Subtotal:</span>
                    <span>$${parseFloat(quote.subtotal || 0).toFixed(2)}</span>
                </div>
                <div class="totals-row">
                    <span>Shipping:</span>
                    <span>$${parseFloat(quote.shipping || 0).toFixed(2)}</span>
                </div>
                <div class="totals-row">
                    <span>Tax:</span>
                    <span>$${parseFloat(quote.tax || 0).toFixed(2)}</span>
                </div>
                <div class="totals-row total-row">
                    <span><strong>Total:</strong></span>
                    <span><strong>$${parseFloat(quote.total || 0).toFixed(2)}</strong></span>
                </div>
            </div>

            <!-- Footer -->
            <div class="customer-footer">
                <p><strong>Thank you for your interest in Cellarom!</strong></p>
                <p>This quote is valid until <strong>${quote.valid_until}</strong>. Please contact us with any questions.</p>
                <p style="margin-top: 20px; font-size: 0.9em; color: #666;">
                    This is a computer-generated quote and does not require a signature.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function getViewInvoiceHTML(user, invoice) {
  let lineItems = [];
  try {
    lineItems = JSON.parse(invoice.line_items || '[]');
  } catch (e) {
    lineItems = [];
  }

  const lineItemsHTML = lineItems.map(item => `
    <tr>
        <td>${item.product_name || 'N/A'}</td>
        <td>${item.description || ''}</td>
        <td>${item.quantity || 0}</td>
        <td>$${parseFloat(item.unit_price || 0).toFixed(2)}</td>
        <td>${item.total || '$0.00'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${invoice.invoice_number} - Cellarom</title>
        ${getCommonStyles()}
        ${getViewStyles()}
    </head>
    <body>
        ${getNavigation(user, 'invoices')}
        
        <div class="container">
            <div class="invoice-header">
                <div class="invoice-info">
                    ${getCellaromLogoSVG()}
                    <div class="invoice-details">
                        <h1>Invoice ${invoice.invoice_number}</h1>
                        <p><strong>Status:</strong> <span class="status status-${invoice.status.toLowerCase()}">${invoice.status}</span></p>
                        <p><strong>Invoice Date:</strong> ${invoice.invoice_date}</p>
                        <p><strong>Due Date:</strong> ${invoice.due_date}</p>
                        ${invoice.po_number ? `<p><strong>PO Number:</strong> ${invoice.po_number}</p>` : ''}
                    </div>
                </div>
                <div class="invoice-actions">
                    <a href="/invoices" class="btn btn-secondary">Back to Invoices</a>
                </div>
            </div>
            
            <div class="info-grid">
                <div class="info-section">
                    <h3>Customer Information</h3>
                    <p><strong>Company:</strong> ${invoice.customer_company}</p>
                    <p><strong>Contact:</strong> ${invoice.contact_name}</p>
                </div>
                <div class="info-section">
                    <h3>Invoice Details</h3>
                    <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
                    <p><strong>Invoice Date:</strong> ${invoice.invoice_date}</p>
                    <p><strong>Due Date:</strong> ${invoice.due_date}</p>
                    ${invoice.po_number ? `<p><strong>PO Number:</strong> ${invoice.po_number}</p>` : ''}
                    ${invoice.quote_id ? `<p><strong>Quote Reference:</strong> ${invoice.quote_id}</p>` : ''}
                </div>
            </div>
            
            <div class="line-items-section">
                <h3>Line Items</h3>
                <table class="line-items-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHTML || '<tr><td colspan="5">No line items</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div class="totals-section">
                <div class="totals-grid">
                    <label>Subtotal:</label>
                    <div class="amount">$${parseFloat(invoice.subtotal || 0).toFixed(2)}</div>
                    
                    <label>Shipping:</label>
                    <div class="amount">$${parseFloat(invoice.shipping || 0).toFixed(2)}</div>
                    
                    <label>Tax:</label>
                    <div class="amount">$${parseFloat(invoice.tax || 0).toFixed(2)}</div>
                    
                    <label>Total:</label>
                    <div class="amount total-amount">$${parseFloat(invoice.total || 0).toFixed(2)}</div>
                </div>
            </div>
            
            <div class="pdf-section">
                <h3>Document Actions</h3>
                <p>Generate and download professional PDF documents for this invoice.</p>
                <button onclick="generatePDF('invoice', '${invoice.id}')" class="btn-pdf">Download as PDF</button>
                <small style="color: #666;">PDF will include all invoice details and line items in a professional format.</small>
            </div>
        </div>
        
        ${getViewInvoiceScript()}
    </body>
    </html>
  `;
}

// ===== STYLES FUNCTIONS =====

function getCommonStyles() {
  return `
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            line-height: 1.6;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: white;
            margin-top: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        
        .navbar {
            background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
            color: white;
            padding: 1rem 0;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
        }
        
        .nav-brand {
            font-size: 1.5rem;
            font-weight: bold;
            text-decoration: none;
            color: white;
        }
        
        .nav-links {
            display: flex;
            list-style: none;
            gap: 30px;
        }
        
        .nav-links a {
            color: white;
            text-decoration: none;
            padding: 10px 15px;
            border-radius: 8px;
            transition: all 0.3s;
        }
        
        .nav-links a:hover,
        .nav-links a.active {
            background-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
        }
        
        .nav-user {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .nav-user span {
            color: #ccc;
        }
        
        .nav-user a {
            color: #ff6b6b;
            text-decoration: none;
        }
        
        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #e0e0e0;
        }
        
        .header-content {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .header-text h1 {
            color: #333;
            font-size: 2rem;
            margin-bottom: 5px;
        }
        
        .logo-container {
            flex-shrink: 0;
        }
        
        .cellarom-logo {
            width: 200px;
            height: 50px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
            transition: all 0.3s;
            font-weight: 500;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 79, 79, 0.3);
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #5a6268;
            transform: translateY(-2px);
        }
        
        .btn-warning {
            background: #ffc107;
            color: #212529;
        }

        .btn-warning:hover {
            background: #e0a800;
            transform: translateY(-2px);
        }

        .btn-success {
            background: #28a745;
            color: white;
        }

        .btn-success:hover {
            background: #218838;
            transform: translateY(-2px);
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-top: 30px;
        }
        
        .dashboard-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .card-header h2 {
            color: #333;
            font-size: 1.5rem;
        }
        
        .list-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
        }
        
        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .item-header h4 a {
            color: #007B7B;
            text-decoration: none;
        }
        
        .item-header h4 a:hover {
            text-decoration: underline;
        }
        
        .status {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .status-draft { background: #e3f2fd; color: #1976d2; }
        .status-pending { background: #fff3e0; color: #f57c00; }
        .status-approved { background: #e8f5e8; color: #388e3c; }
        .status-rejected { background: #ffebee; color: #d32f2f; }
        .status-paid { background: #e8f5e8; color: #388e3c; }
        .status-overdue { background: #ffebee; color: #d32f2f; }
        
        .table-container {
            overflow-x: auto;
            margin-top: 20px;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
        }
        
        .data-table th,
        .data-table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .data-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        
        .data-table tr:hover {
            background: #f8f9fa;
        }
        
        .action-buttons {
            display: flex;
            gap: 5px;
        }
        
        .quote-link,
        .invoice-link {
            color: #007B7B;
            text-decoration: none;
            font-weight: 500;
        }
        
        .quote-link:hover,
        .invoice-link:hover {
            text-decoration: underline;
        }
        
        .empty-state {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 20px;
        }
        
        @media (max-width: 768px) {
            .dashboard-grid {
                grid-template-columns: 1fr;
            }
            
            .page-header {
                flex-direction: column;
                gap: 15px;
            }
            
            .header-content {
                flex-direction: column;
                text-align: center;
            }
            
            .nav-links {
                flex-direction: column;
                gap: 10px;
            }
            
            .nav-container {
                flex-direction: column;
                gap: 15px;
            }
        }
    </style>
  `;
}

function getFormStyles() {
  return `
    <style>
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .form-section {
            margin-bottom: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        
        .form-section h3 {
            margin-bottom: 20px;
            color: #333;
            border-bottom: 2px solid #007B7B;
            padding-bottom: 10px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: 500;
        }
        
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #007B7B;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .line-items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .line-items-table th,
        .line-items-table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        .line-items-table th {
            background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
            color: white;
            font-weight: 600;
        }
        
        .line-items-table select,
        .line-items-table input {
            width: 100%;
            border: none;
            padding: 6px;
            background: transparent;
            border-radius: 4px;
        }
        
        .line-items-table input[type="number"] {
            text-align: right;
        }
        
        .remove-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .remove-btn:hover {
            background: #c82333;
        }
        
        .add-line-btn {
            margin: 10px 0;
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .add-line-btn:hover {
            background: #218838;
            transform: translateY(-2px);
        }
        
        .totals-section {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 25px;
            border-radius: 10px;
            margin-top: 30px;
            border: 2px solid #007B7B;
        }
        
        .totals-grid {
            display: grid;
            grid-template-columns: 1fr 150px;
            gap: 15px;
            align-items: center;
            max-width: 400px;
            margin-left: auto;
        }
        
        .totals-grid label {
            text-align: right;
            font-weight: 600;
            color: #333;
        }
        
        .totals-grid input {
            text-align: right;
            padding: 8px;
            border: 2px solid #ccc;
            border-radius: 6px;
            font-weight: 500;
        }
        
        .total-amount {
            font-size: 1.2em;
            font-weight: bold;
            background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%) !important;
            border: 2px solid #007B7B !important;
        }
        
        .form-actions {
            display: flex;
            gap: 15px;
            justify-content: flex-end;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
        }
        
        @media (max-width: 768px) {
            .form-grid {
                grid-template-columns: 1fr;
            }
            
            .form-row {
                grid-template-columns: 1fr;
            }
            
            .totals-grid {
                grid-template-columns: 1fr;
                text-align: center;
            }
            
            .totals-grid label {
                text-align: center;
            }
            
            .form-actions {
                flex-direction: column;
            }
        }
    </style>
  `;
}

function getModalStyles() {
  return `
    <style>
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background-color: white;
            padding: 30px;
            border-radius: 15px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        
        .modal h2 {
            margin-bottom: 20px;
            color: #333;
            text-align: center;
        }
    </style>
  `;
}

function getViewStyles() {
  return `
    <style>
        .quote-header,
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #007B7B;
        }
        
        .quote-info,
        .invoice-info {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .quote-details h1,
        .invoice-details h1 {
            margin: 0 0 10px 0;
            color: #333;
        }
        
        .quote-details p,
        .invoice-details p {
            margin: 5px 0;
            color: #666;
        }
        
        .quote-actions,
        .invoice-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .info-section h3 {
            margin-bottom: 15px;
            color: #333;
            border-bottom: 2px solid #007B7B;
            padding-bottom: 5px;
        }
        
        .info-section p {
            margin: 8px 0;
            color: #666;
        }
        
        .line-items-section {
            margin: 30px 0;
        }
        
        .line-items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .line-items-table th,
        .line-items-table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        .line-items-table th {
            background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
            color: white;
            font-weight: 600;
        }
        
        .totals-section {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 25px;
            border-radius: 10px;
            margin-top: 30px;
            border: 2px solid #007B7B;
        }
        
        .totals-grid {
            display: grid;
            grid-template-columns: 1fr 150px;
            gap: 15px;
            align-items: center;
            max-width: 400px;
            margin-left: auto;
        }
        
        .totals-grid label {
            text-align: right;
            font-weight: 600;
            color: #333;
        }
        
        .totals-grid .amount {
            text-align: right;
            padding: 8px;
            background: white;
            border: 2px solid #ccc;
            border-radius: 6px;
            font-weight: 500;
        }
        
        .total-amount {
            font-size: 1.2em;
            font-weight: bold;
            background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%) !important;
            border: 2px solid #007B7B !important;
        }
        
        .convert-message {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            display: none;
            border-left: 4px solid #28a745;
        }
        
        .pdf-section {
            margin: 30px 0;
            padding: 25px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-radius: 10px;
            border-left: 4px solid #007B7B;
        }
        
        .pdf-section h3 {
            margin-bottom: 15px;
            color: #333;
        }
        
        .btn-pdf {
            background: #dc3545;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-right: 10px;
            transition: all 0.3s;
        }
        
        .btn-pdf:hover {
            background: #c82333;
            color: white;
            text-decoration: none;
            transform: translateY(-2px);
        }
        
        @media (max-width: 768px) {
            .quote-header,
            .invoice-header {
                flex-direction: column;
                gap: 20px;
            }
            
            .quote-info,
            .invoice-info {
                flex-direction: column;
                text-align: center;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .totals-grid {
                grid-template-columns: 1fr;
                text-align: center;
            }
            
            .totals-grid label {
                text-align: center;
            }
        }
    </style>
  `;
}

// Customer quote styles - Clean, print-friendly, mobile-responsive
function getCustomerQuoteStyles() {
  return `
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
            padding: 20px;
        }

        .customer-quote-container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
        }

        /* Header Section */
        .customer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #007B7B;
        }

        .company-info {
            text-align: right;
        }

        .company-info h3 {
            font-size: 1.5em;
            color: #004F4F;
            margin-bottom: 5px;
        }

        .company-info p {
            margin: 3px 0;
            color: #666;
            font-size: 0.95em;
        }

        /* Quote Title Section */
        .quote-title {
            text-align: center;
            margin: 30px 0;
        }

        .quote-title h1 {
            font-size: 2.5em;
            color: #004F4F;
            margin-bottom: 10px;
            font-weight: 700;
            letter-spacing: 2px;
        }

        .quote-number {
            font-size: 1.2em;
            color: #666;
            font-weight: 600;
        }

        /* Info Grid */
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 25px;
            margin: 30px 0;
        }

        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #007B7B;
        }

        .info-box h3 {
            color: #004F4F;
            margin-bottom: 15px;
            font-size: 1.1em;
            font-weight: 600;
        }

        .info-box p {
            margin: 8px 0;
            color: #666;
            font-size: 0.95em;
        }

        .info-box .highlight {
            color: #007B7B;
            font-weight: 700;
            font-size: 1.1em;
        }

        /* Line Items Section */
        .line-items-section {
            margin: 30px 0;
        }

        .line-items-section h3 {
            color: #004F4F;
            margin-bottom: 15px;
            font-size: 1.3em;
            border-bottom: 2px solid #007B7B;
            padding-bottom: 8px;
        }

        .customer-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
        }

        .customer-table thead {
            background: linear-gradient(135deg, #004F4F 0%, #007B7B 100%);
        }

        .customer-table th {
            color: white;
            padding: 12px;
            font-weight: 600;
            font-size: 0.95em;
        }

        .customer-table td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
        }

        .customer-table tbody tr:last-child td {
            border-bottom: none;
        }

        .customer-table tbody tr:hover {
            background: #f8f9fa;
        }

        /* Totals Section */
        .totals-section {
            margin: 30px 0 30px auto;
            max-width: 400px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #007B7B;
        }

        .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            font-size: 1em;
        }

        .totals-row:not(:last-child) {
            border-bottom: 1px solid #dee2e6;
        }

        .total-row {
            font-size: 1.3em;
            color: #004F4F;
            margin-top: 10px;
            padding-top: 15px;
            border-top: 2px solid #007B7B !important;
        }

        /* Footer Section */
        .customer-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e9ecef;
            text-align: center;
            color: #666;
        }

        .customer-footer p {
            margin: 10px 0;
        }

        /* Print Styles */
        @media print {
            body {
                background: white;
                padding: 0;
            }

            .customer-quote-container {
                box-shadow: none;
                padding: 20px;
            }

            .customer-table tbody tr:hover {
                background: white;
            }
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            .customer-quote-container {
                padding: 20px;
            }

            .customer-header {
                flex-direction: column;
                text-align: center;
                gap: 15px;
            }

            .company-info {
                text-align: center;
            }

            .quote-title h1 {
                font-size: 1.8em;
            }

            .quote-number {
                font-size: 1em;
            }

            .info-grid {
                grid-template-columns: 1fr;
                gap: 15px;
            }

            .customer-table {
                font-size: 0.85em;
            }

            .customer-table th,
            .customer-table td {
                padding: 8px 6px;
            }

            .totals-section {
                max-width: 100%;
            }

            .totals-row {
                font-size: 0.9em;
            }

            .total-row {
                font-size: 1.1em;
            }
        }

        /* Very small screens */
        @media (max-width: 480px) {
            .quote-title h1 {
                font-size: 1.5em;
            }

            .customer-table {
                font-size: 0.75em;
            }

            .customer-table th,
            .customer-table td {
                padding: 6px 4px;
            }
        }
    </style>
  `;
}

function getNavigation(user, active) {
  return `
    <nav class="navbar">
        <div class="nav-container">
            <a href="/" class="nav-brand">Cellarom</a>
            <ul class="nav-links">
                <li><a href="/" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
                <li><a href="/quotes" class="${active === 'quotes' ? 'active' : ''}">Quotes</a></li>
                <li><a href="/invoices" class="${active === 'invoices' ? 'active' : ''}">Invoices</a></li>
                <li><a href="/customers" class="${active === 'customers' ? 'active' : ''}">Customers</a></li>
                <li><a href="/products" class="${active === 'products' ? 'active' : ''}">Products</a></li>
            </ul>
            <div class="nav-user">
                <span>Welcome, ${user.name}</span>
                <a href="/logout">Logout</a>
            </div>
        </div>
    </nav>
  `;
}

// ===== SCRIPT FUNCTIONS =====

function getQuoteFormScript(productsData) {
  return `
    <script>
        const products = ${productsData};
        let lineItemCounter = 0;
        
        function updateCustomerInfo() {
            const select = document.getElementById('customer_id');
            const selectedOption = select.options[select.selectedIndex];
            
            if (selectedOption.value) {
                document.getElementById('customer_company').value = selectedOption.dataset.company || '';
                document.getElementById('contact_name').value = selectedOption.dataset.contact || '';
            } else {
                document.getElementById('customer_company').value = '';
                document.getElementById('contact_name').value = '';
            }
        }
        
        function addLineItem() {
            const tbody = document.getElementById('lineItemsBody');
            const row = document.createElement('tr');
            const rowId = 'line_' + lineItemCounter++;
            
            const productsOptions = products.map(product => 
                \`<option value="\${product.id}" data-name="\${product.name}" data-price="\${product.unit_price}">\${product.sku} - \${product.name}</option>\`
            ).join('');
            
            row.innerHTML = \`
                <td>
                    <select onchange="updateLineItem('\${rowId}')" data-field="product_id">
                        <option value="">Select Product</option>
                        \${productsOptions}
                    </select>
                </td>
                <td><input type="text" data-field="description" onchange="updateLineItem('\${rowId}')"></td>
                <td><input type="number" data-field="quantity" min="1" value="1" onchange="updateLineItem('\${rowId}')"></td>
                <td><input type="number" data-field="unit_price" step="0.01" onchange="updateLineItem('\${rowId}')"></td>
                <td class="line-total">$0.00</td>
                <td><button type="button" class="remove-btn" onclick="removeLineItem(this)">Remove</button></td>
            \`;
            
            row.id = rowId;
            tbody.appendChild(row);
        }
        
        function updateLineItem(rowId) {
            const row = document.getElementById(rowId);
            const productSelect = row.querySelector('[data-field="product_id"]');
            const descriptionInput = row.querySelector('[data-field="description"]');
            const quantityInput = row.querySelector('[data-field="quantity"]');
            const unitPriceInput = row.querySelector('[data-field="unit_price"]');
            const totalCell = row.querySelector('.line-total');
            
            // Update product info when product is selected
            if (productSelect === document.activeElement) {
                const selectedOption = productSelect.options[productSelect.selectedIndex];
                if (selectedOption.value) {
                    descriptionInput.value = selectedOption.dataset.name || '';
                    unitPriceInput.value = selectedOption.dataset.price || '';
                }
            }
            
            // Calculate line total
            const quantity = parseFloat(quantityInput.value) || 0;
            const unitPrice = parseFloat(unitPriceInput.value) || 0;
            const lineTotal = quantity * unitPrice;
            totalCell.textContent = '$' + lineTotal.toFixed(2);
            
            calculateSubtotal();
            updateLineItemsData();
        }
        
        function removeLineItem(button) {
            button.closest('tr').remove();
            calculateSubtotal();
            updateLineItemsData();
        }
        
        function calculateSubtotal() {
            const lineTotals = document.querySelectorAll('.line-total');
            let subtotal = 0;
            
            lineTotals.forEach(cell => {
                const amount = parseFloat(cell.textContent.replace('$', '')) || 0;
                subtotal += amount;
            });
            
            document.getElementById('subtotal').value = subtotal.toFixed(2);
            calculateTotal();
        }
        
        function calculateTotal() {
            const subtotal = parseFloat(document.getElementById('subtotal').value) || 0;
            const shipping = parseFloat(document.getElementById('shipping').value) || 0;
            const tax = parseFloat(document.getElementById('tax').value) || 0;
            const total = subtotal + shipping + tax;
            
            document.getElementById('total').value = total.toFixed(2);
        }
        
        function updateLineItemsData() {
            console.log('--- updateLineItemsData() called ---');
            const rows = document.querySelectorAll('#lineItemsBody tr');
            console.log('Number of rows in table:', rows.length);
            const lineItems = [];

            rows.forEach((row, index) => {
                const productSelect = row.querySelector('[data-field="product_id"]');
                const productId = productSelect ? productSelect.value : null;
                const productText = productSelect && productSelect.selectedIndex >= 0 ? productSelect.options[productSelect.selectedIndex].text : '';

                console.log(`Row ${index}: productId=${productId}, productText=${productText}`);

                if (productId) {
                    const item = {
                        product_id: productId,
                        product_name: productText,
                        description: row.querySelector('[data-field="description"]').value,
                        quantity: row.querySelector('[data-field="quantity"]').value,
                        unit_price: row.querySelector('[data-field="unit_price"]').value,
                        total: row.querySelector('.line-total').textContent
                    };
                    console.log(`Adding line item ${index}:`, item);
                    lineItems.push(item);
                } else {
                    console.log(`Row ${index}: Skipping - no product selected`);
                }
            });

            console.log('Total line items collected:', lineItems.length);
            console.log('Line items data:', lineItems);

            const jsonString = JSON.stringify(lineItems);
            console.log('JSON string to save:', jsonString);

            document.getElementById('line_items').value = jsonString;
            console.log('Hidden field updated successfully');
        }
        
        // Auto-calculate Valid Until date (max 2 weeks from quote date)
        function updateValidUntilDate() {
            const dateInput = document.getElementById('date');
            const validUntilInput = document.getElementById('valid_until');

            if (dateInput && validUntilInput && dateInput.value) {
                const quoteDate = new Date(dateInput.value);
                // Add 14 days (2 weeks)
                quoteDate.setDate(quoteDate.getDate() + 14);
                // Format as YYYY-MM-DD for date input
                const validUntil = quoteDate.toISOString().split('T')[0];
                validUntilInput.value = validUntil;
            }
        }

        // Add event listener to quote date field
        document.addEventListener('DOMContentLoaded', function() {
            const dateInput = document.getElementById('date');
            if (dateInput) {
                dateInput.addEventListener('change', updateValidUntilDate);
                // Set initial valid until date
                updateValidUntilDate();
            }
        });

        // Add initial line item
        addLineItem();

        // Form submission validation
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('quoteForm') || document.getElementById('invoiceForm');
            if (form) {
                form.addEventListener('submit', function(e) {
                    // Update line items data before submitting
                    updateLineItemsData();

                    const lineItems = JSON.parse(document.getElementById('line_items').value || '[]');
                    if (lineItems.length === 0) {
                        e.preventDefault();
                        alert('Please add at least one line item.');
                        return false;
                    }
                });
            }
        });
    </script>
  `;
}

function getEditQuoteFormScript(productsData, existingLineItemsData) {
  return `
    <script>
        const products = ${productsData};
        const existingLineItems = ${existingLineItemsData};
        let lineItemCounter = 0;
        
        function updateCustomerInfo() {
            const select = document.getElementById('customer_id');
            const selectedOption = select.options[select.selectedIndex];
            
            if (selectedOption.value) {
                document.getElementById('customer_company').value = selectedOption.dataset.company || '';
                document.getElementById('contact_name').value = selectedOption.dataset.contact || '';
            } else {
                document.getElementById('customer_company').value = '';
                document.getElementById('contact_name').value = '';
            }
        }
        
        function addLineItem(existingItem = null) {
            const tbody = document.getElementById('lineItemsBody');
            const row = document.createElement('tr');
            const rowId = 'line_' + lineItemCounter++;
            
            const productsOptions = products.map(product => {
                const selected = existingItem && product.id === existingItem.product_id ? 'selected' : '';
                return \`<option value="\${product.id}" data-name="\${product.name}" data-price="\${product.unit_price}" \${selected}>\${product.sku} - \${product.name}</option>\`;
            }).join('');
            
            row.innerHTML = \`
                <td>
                    <select onchange="updateLineItem('\${rowId}')" data-field="product_id">
                        <option value="">Select Product</option>
                        \${productsOptions}
                    </select>
                </td>
                <td><input type="text" data-field="description" value="\${existingItem?.description || ''}" onchange="updateLineItem('\${rowId}')"></td>
                <td><input type="number" data-field="quantity" min="1" value="\${existingItem?.quantity || 1}" onchange="updateLineItem('\${rowId}')"></td>
                <td><input type="number" data-field="unit_price" step="0.01" value="\${existingItem?.unit_price || ''}" onchange="updateLineItem('\${rowId}')"></td>
                <td class="line-total">\${existingItem?.total || '$0.00'}</td>
                <td><button type="button" class="remove-btn" onclick="removeLineItem(this)">Remove</button></td>
            \`;
            
            row.id = rowId;
            tbody.appendChild(row);
            
            // Calculate initial totals if existing item
            if (existingItem) {
                updateLineItem(rowId);
            }
        }
        
        function updateLineItem(rowId) {
            const row = document.getElementById(rowId);
            const productSelect = row.querySelector('[data-field="product_id"]');
            const descriptionInput = row.querySelector('[data-field="description"]');
            const quantityInput = row.querySelector('[data-field="quantity"]');
            const unitPriceInput = row.querySelector('[data-field="unit_price"]');
            const totalCell = row.querySelector('.line-total');
            
            // Update product info when product is selected
            if (productSelect === document.activeElement) {
                const selectedOption = productSelect.options[productSelect.selectedIndex];
                if (selectedOption.value) {
                    descriptionInput.value = selectedOption.dataset.name || '';
                    unitPriceInput.value = selectedOption.dataset.price || '';
                }
            }
            
            // Calculate line total
            const quantity = parseFloat(quantityInput.value) || 0;
            const unitPrice = parseFloat(unitPriceInput.value) || 0;
            const lineTotal = quantity * unitPrice;
            totalCell.textContent = '$' + lineTotal.toFixed(2);
            
            calculateSubtotal();
            updateLineItemsData();
        }
        
        function removeLineItem(button) {
            button.closest('tr').remove();
            calculateSubtotal();
            updateLineItemsData();
        }
        
        function calculateSubtotal() {
            const lineTotals = document.querySelectorAll('.line-total');
            let subtotal = 0;
            
            lineTotals.forEach(cell => {
                const amount = parseFloat(cell.textContent.replace('$', '')) || 0;
                subtotal += amount;
            });
            
            document.getElementById('subtotal').value = subtotal.toFixed(2);
            calculateTotal();
        }
        
        function calculateTotal() {
            const subtotal = parseFloat(document.getElementById('subtotal').value) || 0;
            const shipping = parseFloat(document.getElementById('shipping').value) || 0;
            const tax = parseFloat(document.getElementById('tax').value) || 0;
            const total = subtotal + shipping + tax;
            
            document.getElementById('total').value = total.toFixed(2);
        }
        
        function updateLineItemsData() {
            console.log('--- updateLineItemsData() called ---');
            const rows = document.querySelectorAll('#lineItemsBody tr');
            console.log('Number of rows in table:', rows.length);
            const lineItems = [];

            rows.forEach((row, index) => {
                const productSelect = row.querySelector('[data-field="product_id"]');
                const productId = productSelect ? productSelect.value : null;
                const productText = productSelect && productSelect.selectedIndex >= 0 ? productSelect.options[productSelect.selectedIndex].text : '';

                console.log(`Row ${index}: productId=${productId}, productText=${productText}`);

                if (productId) {
                    const item = {
                        product_id: productId,
                        product_name: productText,
                        description: row.querySelector('[data-field="description"]').value,
                        quantity: row.querySelector('[data-field="quantity"]').value,
                        unit_price: row.querySelector('[data-field="unit_price"]').value,
                        total: row.querySelector('.line-total').textContent
                    };
                    console.log(`Adding line item ${index}:`, item);
                    lineItems.push(item);
                } else {
                    console.log(`Row ${index}: Skipping - no product selected`);
                }
            });

            console.log('Total line items collected:', lineItems.length);
            console.log('Line items data:', lineItems);

            const jsonString = JSON.stringify(lineItems);
            console.log('JSON string to save:', jsonString);

            document.getElementById('line_items').value = jsonString;
            console.log('Hidden field updated successfully');
        }
        
        // Auto-calculate Valid Until date (max 2 weeks from quote date)
        function updateValidUntilDate() {
            const dateInput = document.getElementById('date');
            const validUntilInput = document.getElementById('valid_until');

            if (dateInput && validUntilInput && dateInput.value) {
                const quoteDate = new Date(dateInput.value);
                // Add 14 days (2 weeks)
                quoteDate.setDate(quoteDate.getDate() + 14);
                // Format as YYYY-MM-DD for date input
                const validUntil = quoteDate.toISOString().split('T')[0];
                validUntilInput.value = validUntil;
            }
        }

        // Load existing line items
        document.addEventListener('DOMContentLoaded', function() {
            console.log('=== EDIT QUOTE PAGE LOADED ===');
            console.log('Existing line items from server:', existingLineItems);

            if (existingLineItems && existingLineItems.length > 0) {
                console.log('Loading', existingLineItems.length, 'existing line items');
                existingLineItems.forEach((item, index) => {
                    console.log('Loading item', index, ':', item);
                    addLineItem(item);
                });
                // CRITICAL: Update hidden field after loading all items
                setTimeout(() => {
                    updateLineItemsData();
                    console.log('Initial line_items hidden field value:', document.getElementById('line_items').value);
                }, 100);
            } else {
                console.log('No existing line items, adding empty row');
                addLineItem();
            }

            // Add event listener to quote date field for auto-calculation
            const dateInput = document.getElementById('date');
            if (dateInput) {
                dateInput.addEventListener('change', updateValidUntilDate);
            }

            // Form submission validation
            const form = document.getElementById('quoteForm');
            if (form) {
                form.addEventListener('submit', function(e) {
                    console.log('=== FORM SUBMITTING ===');

                    // Update line items data before submitting
                    updateLineItemsData();

                    const lineItemsValue = document.getElementById('line_items').value;
                    console.log('Line items hidden field value:', lineItemsValue);

                    const lineItems = JSON.parse(lineItemsValue || '[]');
                    console.log('Parsed line items:', lineItems);
                    console.log('Number of line items:', lineItems.length);

                    if (lineItems.length === 0) {
                        e.preventDefault();
                        alert('Please add at least one line item.');
                        return false;
                    }

                    console.log('Form validation passed, submitting...');
                });
            }
        });
    </script>
  `;
}

function getViewQuoteScript() {
  return `
    <script>
        async function convertToInvoice(quoteId) {
            try {
                const response = await fetch(\`/api/convert-quote/\${quoteId}\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const messageDiv = document.getElementById('convertMessage');
                    const invoiceLink = document.getElementById('invoiceLink');
                    
                    invoiceLink.href = \`/invoices/view/\${result.invoice_id}\`;
                    invoiceLink.textContent = \`View Invoice \${result.invoice_number}\`;
                    
                    messageDiv.style.display = 'block';
                    
                    // Scroll to message
                    messageDiv.scrollIntoView({ behavior: 'smooth' });
                } else {
                    alert('Error converting quote to invoice: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error converting quote to invoice');
            }
        }
        
        async function generatePDF(type, id) {
            try {
                // This is a placeholder for PDF generation functionality
                alert('PDF generation feature coming soon!');
            } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF');
            }
        }
    </script>
  `;
}

function getViewInvoiceScript() {
  return `
    <script>
        async function generatePDF(type, id) {
            try {
                // This is a placeholder for PDF generation functionality
                alert('PDF generation feature coming soon!');
            } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF');
            }
        }
    </script>
  `;
}

function getModalScript(type = 'Customer') {
  return `
    <script>
        function showAdd${type}Modal() {
            document.getElementById('add${type}Modal').style.display = 'flex';
        }
        
        function hideAdd${type}Modal() {
            document.getElementById('add${type}Modal').style.display = 'none';
            document.getElementById('${type.toLowerCase()}Form').reset();
        }
        
        // Close modal when clicking outside
        document.getElementById('add${type}Modal').addEventListener('click', function(e) {
            if (e.target === this) {
                hideAdd${type}Modal();
            }
        });
    </script>
  `;
}
